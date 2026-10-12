/**
 * The two-GM-sessions claim protocol: stake a ledger row, wait for the server's broadcast, read it
 * back — for a fact (setting or flag plane) and for an inspection — and the release twins.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { MODULE } from "../ties-core.mjs";
import { INSPECT_CLAIM_KEY } from "../core/rules.mjs";
import { BELIEFS_FLAG, KIND_KEY } from "../known-core.mjs";
import { putBelief, readBelief } from "./apply.mjs";
import { readFlag } from "../lib/flags.mjs";

/**
 * ⚠ **`activeGM` identifies a USER, not a session — and one GM can be logged in twice.**
 *
 * Measured on this machine while building this, not imagined: `lsof` on port 30000 showed two
 * established connections, the Foundry desktop app and a browser, **both signed in as
 * Gamemaster**. `game.users` lists one active user for the pair, so `isActiveGM()` is `true`
 * on both clients and every socket request is handled twice. `relay.mjs` has always had this
 * exposure and survives it because its write is fill-if-blank and idempotent. A conduit that
 * *rolls dice* does not survive it: two clients would roll two different totals, write two
 * belief records, append two reveals and post two stub cards, and the player would watch their
 * notebook receive two contradictory answers to one question.
 *
 * Foundry exposes nothing that distinguishes two sessions of one user, so the clients settle it
 * between themselves: each stamps a per-load id into the ledger row *before* rolling, waits for
 * the server to broadcast whichever landed last, and only the client whose stamp survived goes
 * on. One extra document write per roll, and the loser is silent.
 */
let SESSION = null;
const session = () => (SESSION ??= foundry.utils.randomID());

/** Sleep on the global timer at call time (tests drive it with `mock.timers`). */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * **The one claim protocol** (ties-39): stake, let the server broadcast whichever stake landed last,
 * read it back. True only on the client whose stake survived.
 *
 * `settleMs` is long enough for the other client's write to arrive and be broadcast back, and short
 * enough that nobody at the table reads it as lag. The loser never rolls, so the cost is paid once.
 * Facts on the setting plane, facts on the flag plane and inspections all stake through here; each
 * keeps its own release twin (`releaseFact`, `releaseClaim`, `releaseInspect`).
 *
 * @param {{ write: () => Promise<*>, readBack: () => *, token: *, settleMs?: number,
 *   sleep?: (ms: number) => Promise<void> }} spec
 * @returns {Promise<boolean>}
 */
export async function stakeAndConfirm({ write, readBack, token, settleMs = 250, sleep = wait }) {
  await write();
  await sleep(settleMs);
  return readBack() === token;
}

/**
 * Stake the ledger row before the dice fall. Returns false for the client that lost.
 *
 * The claim doubles as the lock while the roll runs: a claim record reads back through
 * `readBeliefs` as a spent belief, so a second request for the same character and kind is
 * refused by applyStudy's `readBelief` lock (apply.mjs) rather than racing the first. A claim
 * left behind by a client that died mid-roll therefore *does* strand the roll — deliberately the
 * safe direction, and `reset` is the one-line cure because it deletes the whole row.
 *
 * Stake this fact before rolling — two GM sessions of one account are both `activeGM`.
 */
export async function claimFact(fact, characterId, now) {
  if (fact.ns === "attr") {
    const mine = session();
    return stakeAndConfirm({
      write: () => putBelief(fact, characterId, { text: "", total: null, when: now, delivered: null, claim: mine }),
      readBack: () => readBelief(fact, characterId)?.claim,
      token: mine
    });
  }
  return claimRoll(fact.ledger, characterId, now, fact.beliefKey);
}

/** Hand it back — only ever by the client that won, and only when no roll happened. */
export async function releaseFact(fact, characterId) {
  if (fact.ns === "attr") {
    if (readBelief(fact, characterId)?.claim !== session()) return;
    await putBelief(fact, characterId, null);
    return;
  }
  return releaseClaim(fact.ledger, characterId, fact.beliefKey);
}

/** A row that holds a finished record (writeBelief), not just a stake's `{ claim, when }`. */
const isRecord = row => !!row && Object.keys(row).some(k => k !== "claim" && k !== "when");

async function claimRoll(ledger, characterId, now, key = KIND_KEY) {
  const mine = session();
  const path = `flags.${MODULE}.${BELIEFS_FLAG}.${characterId}.${key}`;
  const row = () => readFlag(ledger, MODULE, BELIEFS_FLAG)?.[characterId]?.[key];
  const won = await stakeAndConfirm({
    write: () => ledger.update({ [path]: { claim: mine, when: now } }, { render: false }),
    // a late stake merges into a row another session already finished: it loses, or the fact rolls twice (AC-4)
    readBack: () => (isRecord(row()) ? null : row()?.claim),
    token: mine
  });
  // and hands its stray stake back, so the finished record does not read as a roll in flight (gate.mjs)
  if (!won && isRecord(row()) && row().claim === mine) await ledger.update({ [`${path}.claim`]: null }, { render: false });
  return won;
}

/**
 * Drop one row out of a ledger object, server-side.
 *
 * ⚠ **`Actor#update` MERGES.** Deleting a key from the object `getFlag` handed you and writing
 * the whole object back does *nothing* — the merge puts the key straight back, and the row you
 * thought you removed is still there. Caught live: the first GM reset reported success, cleared
 * the player's `studied` hint, and left the belief record standing, so the affordance came back
 * on a roll the handler would still refuse. That is worse than not resetting at all, because
 * the refusal is a message a plain failure never produces.
 *
 * Foundry's deletion syntax is the `-=` prefix on the key being removed, and it is the only
 * thing that works here. `{recursive: false}` is NOT the fix and is actively dangerous: applied
 * to `{"flags.pentaryn-ties.beliefs": {…}}` it replaces the whole **`flags`** object and takes
 * `ties`, `known` and `worn` with it.
 */
export function dropRow(base, ownerId, key, owned) {
  const rest = Object.keys(owned ?? {}).filter(k => k !== key);
  return rest.length ? { [`${base}.${ownerId}.-=${key}`]: null } : { [`${base}.-=${ownerId}`]: null };
}

/** Un-stake it — only ever called by the client that won, and only when no roll happened. */
async function releaseClaim(ledger, characterId, key = KIND_KEY) {
  const all = readFlag(ledger, MODULE, BELIEFS_FLAG) ?? {};
  if (all?.[characterId]?.[key]?.claim !== session()) return;
  await ledger.update(dropRow(`flags.${MODULE}.${BELIEFS_FLAG}`, characterId, key, all[characterId]), {
    render: false
  });
}

const inspectSession = () => `${game.user?.id ?? "?"}:${INSPECT_SESSION}`;
const INSPECT_SESSION = foundry.utils.randomID();

export async function claimInspect(subject, characterId) {
  const mine = inspectSession();
  const won = await stakeAndConfirm({
    write: () => subject.update({ [`flags.${MODULE}.${BELIEFS_FLAG}.${characterId}.${INSPECT_CLAIM_KEY}`]: { claim: mine } }, { render: false }),
    readBack: () => readFlag(subject, MODULE, BELIEFS_FLAG)?.[characterId]?.[INSPECT_CLAIM_KEY]?.claim,
    token: mine
  });
  // return the TOKEN on success, so the caller can release exactly what it took
  return won ? mine : null;
}

export async function releaseInspect(subject, characterId, token = null) {
  const all = readFlag(subject, MODULE, BELIEFS_FLAG) ?? {};
  const mine = token ?? inspectSession();
  if (all?.[characterId]?.[INSPECT_CLAIM_KEY]?.claim !== mine) return;

  /*
   * ⚠ Unset the whole flag when the last row goes, rather than leaving `beliefs: {}` behind.
   *
   * `dropRow` removes the character's entry and stops there, so an inspection that rolled nothing
   * against a creature nobody had studied leaves an empty container on that actor — permanently,
   * and on every creature the party ever glanced at. Caught while restoring a test world: three
   * actors held `beliefs: {}` where the baseline had no key at all. Harmless to read, but it is
   * litter in every world export and every diff, and it makes "has anyone studied this?" a
   * question you cannot answer by looking.
   */
  const others = Object.keys(all[characterId] ?? {}).filter(k => k !== INSPECT_CLAIM_KEY);
  const rest = Object.keys(all).filter(k => k !== characterId);
  if (!others.length && !rest.length) {
    await subject.unsetFlag(MODULE, BELIEFS_FLAG);
    return;
  }
  await subject.update(dropRow(`flags.${MODULE}.${BELIEFS_FLAG}`, characterId, INSPECT_CLAIM_KEY, all[characterId]), {
    render: false
  });
}
