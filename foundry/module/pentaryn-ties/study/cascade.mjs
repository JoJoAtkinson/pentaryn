/**
 * Phase 8 — inspection and the identification cascade, held identifications, concealment, and the
 * GM's releases and resets (grantKind, resetIdentification, resetInspection).
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { attributeIdsOf, describeAttribute, knowledge, setKnowledge } from "../attributes.mjs";
import { MODULE } from "../ties-core.mjs";
import { canReach } from "../ties-adapter.mjs";
import { mayWrite } from "../settings.mjs";
import { CONCEAL_FLAG, concealFor, isIdentKey } from "../core/rules.mjs";
import {
  BELIEFS_FLAG,
  combineAdvantage,
  GRANTED_FLAG,
  holdResolved,
  identifiedKey,
  identMissKey,
  isBlankProse,
  KIND_KEY,
  parseFactKey,
  planStep,
  readGranted,
  STUDY_RUNGS
} from "../known-core.mjs";
import { applyPlayerWrites, postStub, putBelief, throwBlind } from "./apply.mjs";
import { beliefs } from "./authoring.mjs";
import { claimInspect, dropRow, releaseInspect } from "./claim.mjs";
import { composeStudyPayload } from "./compose.mjs";
import { pending } from "./gate.mjs";
import {
  beliefsOf,
  holdDefault,
  kindActorOf,
  reg,
  resolveFact,
  stackingRule,
  studySkillFor
} from "./resolve.mjs";
import { esc, INSPECT, log } from "./shared.mjs";
import { send } from "../socket-adapter.mjs";
import { announceTempo } from "./tempo.mjs";
import { readFlag } from "../lib/flags.mjs";

/* -------------------------------------------- */
/*  Phase 8 — inspection and the cascade        */
/* -------------------------------------------- */

/**
 * **Inspect one creature** — phase 8's only trigger, and the route phase 6 never had.
 *
 * Joe's rule: *"no examine, no auto detection."* Nothing in this module observes a creature
 * without being asked to, and this is the asking.
 *
 * ## The observables kit, and every line of it is load-bearing
 *
 * The whole feature rests on one property: **an inspection that found something and an inspection
 * that found nothing must be indistinguishable to the player.** Five separate channels could break
 * that, and each is closed here rather than equalised:
 *
 *  1. **The stub posts FIRST**, before any dice. Its content depends on nothing downstream, so
 *     nothing is lost — and depth-proportional silence before it would be the 260 ms tell phase 3
 *     was bitten by, except worse, because here the work genuinely varies by depth and *cannot* be
 *     equalised by doing it all anyway.
 *  2. **It posts even when the cascade is empty** — no secret attributes, or all spent. Otherwise
 *     the stub's presence is itself the answer.
 *  3. **Rungs roll chat-less** (`throwBlind(..., {silent})`), so N rungs never print N cards.
 *  4. **One claim for the whole gesture**, not one per rung — depth must not cost depth × 250 ms.
 *  5. **Writes are batched and a fruitless cascade renders nothing**, so a sheet that repaints only
 *     when something was found cannot be watched.
 */
export async function inspect(character, subject) {
  const refused = reason => {
    log.debug$?.("inspect refused", { reason, characterId: character?.id ?? null, subjectId: subject?.id ?? null });
    return false;
  };
  if (!mayWrite()) return refused("playerAccess");
  if (!character?.isOwner || !subject) return refused(character?.isOwner ? "no subject" : "not the owner");
  if (!game.users?.activeGM) {
    ui.notifications.warn(_loc("PENTARYN_TIES.known.study.notify.noGM"));
    return false;
  }
  if (!combatAllows(character)) return refused("one inspection per combatant per round");

  /*
   * ⚠ The stub is posted HERE, by the client that made the gesture — not by the GM handler.
   *
   * Found by playtesting: two identical stubs at the same timestamp. `isActiveGM()` tests
   * `game.users.activeGM.id === game.user.id`, and `activeGM` is a **USER, not a session** (the
   * hazard phase 3 documented), so every GM client signed in on that account ran the handler and
   * every one of them posted. The claim protocol arbitrates the *rolling*, but stub-first
   * deliberately puts the stub before the claim — which put it outside the only thing that
   * would have deduplicated it.
   *
   * Posting from the gesturing client fixes it by construction rather than by arbitration: this
   * client knows for certain that the gesture happened, needs no GM knowledge to say so, and
   * there is exactly one of it. It is also the earliest the stub can possibly appear, which is
   * the property stub-first wanted.
   */
  await postStub(character, subject);
  await announceTempo(character);

  const payload = { action: INSPECT, characterId: character.id, subjectId: subject.id };
  if (game.user?.isGM) return applyInspect(payload, game.user.id, { postStubCard: false });
  send(payload);
  return true;
}

/**
 * The module's own combat rule, and it is honest about what it is.
 *
 * dnd5e 5.3.3 keeps **no per-turn action ledger** to consume from (verified in phase 4), so
 * "inspection costs your action" cannot be implemented as an action. What can be implemented
 * truthfully is a rule about *this feature*: one inspection per combatant per round.
 *
 * ⚠ The refusal must be **uniform** — the same sentence whatever the target — or a refusal that
 * varied would itself be a probe.
 */
const inspected = new Map();

/** Forget one combat's per-round inspection marks once the combat is deleted (ties-31). */
export function forgetCombat(combatId) {
  if (!combatId) return;
  for (const key of inspected.keys()) if (key.startsWith(`${combatId}:`)) inspected.delete(key);
}

/** Test-only: how many combat:round:combatant marks are held (ties-31). */
export const _sizes = () => ({ inspected: inspected.size });

function combatAllows(character) {
  if (!game.combat?.started || !character.inCombat) return true;
  const combatant = game.combat.combatants.find(c => c.actorId === character.id);
  if (!combatant) return true;
  const key = `${game.combat.id}:${game.combat.round}:${combatant.id}`;
  if (inspected.has(key)) {
    ui.notifications.warn(_loc("PENTARYN_TIES.known.inspect.spentThisRound"));
    return false;
  }
  inspected.set(key, true);
  return true;
}

/**
 * GM side: run the cascade for one (character, subject) pair until it needs a roll it cannot make,
 * hits a hold, or runs out of rungs.
 *
 * **Re-entrant by construction.** The planner reads the ledgers, which this function writes — so
 * "resume after a hold" is simply calling it again. Nothing about a suspended cascade is stored,
 * because there is nothing to store.
 */
export async function applyInspect(payload, senderId, { postStubCard = false } = {}) {
  const user = game.users?.get(senderId);
  const character = game.actors?.get(payload?.characterId);
  const subject = game.actors?.get(payload?.subjectId);
  const refuse = why => {
    log.warn(`inspect refused: ${why}`);
    return false;
  };
  if (!user || !character || !subject) return refuse("unknown actor");
  if (character.testUserPermission(user, "OWNER") !== true) return refuse(`${user.name} does not own ${character.name}`);
  if (!mayWrite(user)) return refuse(`playerAccess is off for ${user.name}`);
  if (!canReach(user, subject)) return refuse(`${user.name} cannot see ${subject.name}`);

  // the gesturing client already posted the stub and the tempo tell (see `inspect`); the direct
  // GM hand-throw is the one caller with no gesturing client, and asks for them here
  if (postStubCard) {
    await postStub(character, subject);
    await announceTempo(character);
  }

  return guardedCascade(character, subject);
}

/**
 * Run the cascade and **always** hand the claim back.
 *
 * ⚠ The release used to sit as a plain statement after the loop, so any throw between claiming
 * and reaching it stranded a `#inspect` row on the subject forever. Found by two players
 * inspecting the same creature at the same instant: one released cleanly, the other left its
 * claim behind. A stranded claim is not just litter — it is the row that stops the *next* roll
 * on that pair, so it can silently wedge a creature for a character.
 *
 * `finally`, not a trailing statement. The prompt is deliberately outside it: a held reveal must
 * not keep the claim open while a GM decides.
 */
async function guardedCascade(character, subject) {
  const release = [];
  try {
    return await runCascade(character, subject, release);
  } finally {
    if (release[0]) await releaseInspect(subject, character.id, release[0]);
  }
}

/** The loop. One planner step at a time, batching everything it decides into two writes. */
async function runCascade(character, subject, release = []) {
  /*
   * The claim is taken **lazily** — on the first rung that actually needs dice, and never for a
   * gesture that rolls nothing.
   *
   * Measured: the claim costs ~1.2s (two actor writes plus the arbitration wait) while a
   * chat-less roll costs 6ms. Taking it up-front made *every* inspection a three-second gesture,
   * including the overwhelmingly common one where the subject carries nothing secret or everything
   * is already settled. Arbitration exists to stop two GM sessions of one account both rolling —
   * so a gesture with nothing to roll has nothing to arbitrate.
   *
   * ⚠ Safe against the timing channel: the stub is already posted before any of this, and it is
   * the only guaranteed observable. A slow fruitless cascade and a fast one both end in silence,
   * and there is no second event to time the gap against.
   */
  /*
   * ⚠ The claim token is captured here and handed back to `releaseInspect`, rather than
   * re-derived from module state at release time.
   *
   * Found by playtesting: a `#inspect` row survived a held cascade and sat on the NPC forever,
   * showing up in the ledger as a nonsense identification row. Re-deriving the session made the
   * release conditional on module identity that a dynamic re-import (or a second GM session
   * taking over mid-gesture) quietly changes. Whoever took the claim knows its token; nobody
   * else needs to guess it.
   */
  let claimToken = null;
  const claim = async () => {
    if (claimToken) return true;
    claimToken = await claimInspect(subject, character.id);
    if (claimToken) release[0] = claimToken; // hand it to the guard the moment it is taken
    return !!claimToken;
  };

  /*
   * ⚠ Ledger rows commit **per rung**, grants batch **per gesture**, and the split is deliberate.
   *
   * The planner reads the live ledgers to decide the next step, so a rung whose result is still
   * sitting in a local array would be re-planned forever. But the ledgers are GM-plane and
   * `render: false` — invisible to the player either way — whereas the GRANT is what appears on
   * their sheet. Batching that one keeps the repaint single, which is the channel that matters.
   */
  const grants = {};
  let held = false;

  let guard = 0;
  for (; guard < 24; guard++) {
    const step = planStep({
      registry: reg(),
      carried: attributeIdsOf(subject, kindActorOf),
      knowledge: knowledge(),
      beliefs: readFlag(subject, MODULE, BELIEFS_FLAG) ?? {},
      characterId: character.id,
      rollerCarries: attributeIdsOf(character, kindActorOf)
    });
    if (step.done) break;

    const attrId = step.roll ?? step.grant;
    const entry = step.entry;
    const now = Date.now();
    const hold = holdResolved(entry.hold, holdDefault());

    let pass = true;
    let total = null;
    if (step.roll) {
      if (!(await claim())) break; // another GM session has this pair; roll nothing
      const fact = {
        skill: entry.skill,
        dc: entry.dc + concealmentFor(subject, attrId),
        name: entry.title,
        skillLabel: CONFIG.DND5E?.skills?.[entry.skill]?.label ?? entry.skill,
        silentRoll: true // chat-less: N rungs must not print N cards
      };
      const mode = combineAdvantage(step.advantage ? 1 : 0, 0, stackingRule());
      const roll = await throwBlind(character, fact, { mode, situational: 0, silent: true });
      if (!roll) break; // no roll evaluated: spend nothing, exactly as `tierOf`'s null contract
      total = roll.total;
      pass = total >= fact.dc;
    }

    // blank markup is an empty reveal, exactly like "" — never a card of literal `<p></p>`
    const text = pass && !isBlankProse(String(entry.reveal ?? "")) ? String(entry.reveal) : "";
    /*
     * A failure hands over the attribute's written failure line (`miss`), or nothing when it is
     * empty (Joe, 2026-10-08). It is NOT the ident row's text — that stays "" so every ledger
     * still reads "not identified" — and it is not filed under the ident key, whose card is titled
     * with the attribute and shown only once identified. `identMissKey` files it on this
     * creature's page, titled with the creature, so it reads as what they noticed about them.
     * Delivered at once, never held: the hold gate parks a pass on its ident row, and a failure
     * has no row text to park.
     */
    const missText = !pass && step.roll && !isBlankProse(String(entry.miss ?? "")) ? String(entry.miss) : "";
    /*
     * Only a pass with something to say waits on the GM. A pass with an empty `reveal` has nothing
     * to deliver, so parking it left it pending for good (Deliver only frees rows with text) —
     * the same rule `applyStudy` applies to a silent outcome.
     */
    const parks = pass && hold && !!text.trim();
    // the backfill: one roll settles both stages, and a failure closes stage 1 for good
    if (step.backfill)
      await setKnowledge([
        // pending while held: the lock is spent (they rolled) but the answer is not theirs yet
        { characterId: character.id, attrId, failed: !pass, via: "roll", when: now, pending: parks }
      ]);
    else if (step.roll && pass) {
      /*
       * They already knew of it only because they were TOLD (a Share's stage-1 row) and have now
       * rolled it themselves on this creature: the knowledge is theirs, so it stops being a share.
       * Otherwise forgetting that share later would clear — or turn back into a failure — a stage-1
       * answer they earned here.
       */
      const row = knowledge()[character.id]?.[attrId];
      if (row?.via === "shared")
        await setKnowledge([{ characterId: character.id, attrId, failed: false, via: "roll", when: row.when, pending: false }]);
    }
    await writeIdentification(subject, character.id, attrId, {
      text,
      total,
      when: now,
      /*
       * Only a held PASS with text waits on the GM. A failure, or a pass with no reveal, has
       * nothing to deliver, and stamping it pending used to leave an empty row in `pending()` that
       * no Deliver could do anything with.
       */
      delivered: parks ? null : now
    });
    if (pass && !hold && text.trim()) grants[identifiedKey(attrId)] = { text, when: now, icon: entry.icon, source: entry.title };
    if (missText.trim()) grants[identMissKey(subject.id, attrId)] = { text: missText, when: now, icon: subject.img ?? null, source: subject.name };

    if (!pass) break; // a failed rung blocks everything beneath it
    if (parks) {
      held = true;
      break; // suspends the climb; the GM's Deliver resumes it by calling back in
    }
  }

  if (guard === 24) log.debug$?.("cascade stopped at its 24-step guard", { characterId: character.id, subjectId: subject.id });
  await commitGrants(character, grants);
  if (held) await promptCascadeDeliver(character, subject);
  return true;
}

/** One identification row, at its own path so nobody else's record is in the payload. */
export async function writeIdentification(subject, characterId, attrId, rec) {
  await subject.update(
    {
      [`flags.${MODULE}.${BELIEFS_FLAG}.${characterId}.${identifiedKey(attrId)}`]: {
        text: rec.text ?? "",
        tier: null,
        total: rec.total ?? null,
        when: rec.when ?? 0,
        delivered: rec.delivered ?? null,
        claim: null,
        sources: null,
        ...(rec.from ? { from: rec.from } : {}),
        ...(rec.from && rec.prior ? { prior: rec.prior } : {})
      }
    },
    { render: false } // GM-plane data: it must never repaint a sheet mid-gesture
  );
}

/**
 * Every grant one gesture produced, in **one** `Actor#update`.
 *
 * ⚠ The single write is the point. `applyPlayerWrites` deliberately repaints the character sheet,
 * so N rungs committed separately would repaint N times — and a sheet that flickers once per thing
 * found is a depth counter anyone can watch. A fruitless cascade writes nothing and repaints
 * nothing, which is exactly what inspecting someone who carries nothing also does.
 */
async function commitGrants(character, grants) {
  const keys = Object.keys(grants);
  if (!keys.length) return;
  const merged = readGranted(readFlag(character, MODULE, GRANTED_FLAG));
  for (const [k, v] of Object.entries(grants)) merged[k] = v;
  await character.update({ [`flags.${MODULE}.${GRANTED_FLAG}`]: merged });
}

/** The held-rung prompt. Delivering re-enters the cascade, which is what resumes the climb. */
async function promptCascadeDeliver(character, subject) {
  /*
   * Show the GM WHAT is waiting, not merely that something is.
   *
   * The first cut said "something is waiting on you" and nothing else — which is not a decision
   * anyone can make. A hold exists so the GM can choose the moment *and* the framing, and both
   * need the fact, the roll and the prose the player is about to be handed.
   */
  const mine = (readFlag(subject, MODULE, BELIEFS_FLAG) ?? {})[character.id] ?? {};
  const waiting = Object.entries(mine)
    .filter(([key, rec]) => isIdentKey(key) && rec && !rec.delivered)
    .map(([key, rec]) => ({ attrId: parseFactKey(key)?.subject, rec }))
    .filter(x => x.attrId);
  if (!waiting.length) return;

  const rows = waiting
    .map(({ attrId, rec }) => {
      const entry = describeAttribute(attrId);
      const passed = !!String(rec.text ?? "").trim();
      // an empty row is a pass with no reveal authored, or a legacy failure parked before 2026-10
      const missed = !passed && typeof rec.total === "number" && rec.total < entry.dc + concealmentFor(subject, attrId);
      return `<li class="pt-belief${missed ? " pt-belief-miss" : ""}">
        <div class="pt-belief-head">
          <span class="pt-belief-who">${esc(entry.title)}</span>
          <span class="pt-belief-meta">${esc(
            _loc("PENTARYN_TIES.known.inspect.holdMeta", { total: rec.total ?? "—", dc: entry.dc })
          )}</span>
        </div>
        <div class="pt-belief-text">${
          passed
            ? esc(rec.text)
            : `<em>${esc(_loc(missed ? "PENTARYN_TIES.known.study.holdSilent" : "PENTARYN_TIES.authoring.beliefSilent"))}</em>`
        }</div>
      </li>`;
    })
    .join("");

  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: _loc("PENTARYN_TIES.known.study.holdTitle") },
    content:
      `<p>${esc(_loc("PENTARYN_TIES.known.inspect.holdWho", { character: character.name, subject: subject.name }))}</p>` +
      `<ul class="pt-list pt-belief-list pentaryn-ties">${rows}</ul>`,
    yes: { label: _loc("PENTARYN_TIES.known.study.deliver") },
    no: { label: _loc("PENTARYN_TIES.known.study.later") }
  });
  if (!ok) return;
  await deliverHeldIdentifications(character, subject);
}

/**
 * Which creatures are holding an undelivered identification of one attribute, for one character.
 *
 * The knowledge ledger records *that* a rung is held (`pending: true`) but not **where** — the
 * parked answer lives in a belief row on the creature they were looking at. So the world tree can
 * mark a node "waiting on you" and, without this, offer nothing to do about it: the GM had to
 * remember which NPC the roll happened on and go and find them. This is the lookup that turns the
 * marker into a button.
 */
export function heldCarriersFor(character, attrId) {
  if (!game.user?.isGM || !character || !attrId) return [];
  const key = identifiedKey(attrId);
  const out = [];
  for (const subject of game.actors?.contents ?? []) {
    const rec = beliefsOf(subject)[character.id]?.[key];
    if (rec && !rec.delivered && String(rec.text ?? "").trim()) out.push(subject);
  }
  return out;
}

/**
 * Release everything held on one attribute for one character, wherever it is parked.
 *
 * Delegates each pair to `deliverHeldIdentifications`, so the parked payload is still replayed
 * from the ledger rather than recomputed, and each release still resumes its own cascade.
 */
export async function releaseHeldAttribute(character, attrId) {
  const carriers = heldCarriersFor(character, attrId);
  for (const subject of carriers) await deliverHeldIdentifications(character, subject);
  return carriers.length;
}

/**
 * Release every held identification on this pair, then **re-run the cascade**.
 *
 * The re-run is the whole of "resume": the planner reads the ledgers this just changed, so the
 * newly-unblocked rung rolls fresh and a rung still held stops it again. No stub is re-posted —
 * one stub per gesture holds, and this is the GM's action, not the player's.
 */
export async function deliverHeldIdentifications(character, subject) {
  if (!game.user?.isGM) return false;
  const all = readFlag(subject, MODULE, BELIEFS_FLAG) ?? {};
  const mine = all[character.id] ?? {};
  const now = Date.now();
  const update = {};
  const granted = readGranted(readFlag(character, MODULE, GRANTED_FLAG));
  const freed = [];
  const rows = knowledge()[character.id] ?? {};
  let any = false;

  for (const [key, rec] of Object.entries(mine)) {
    if (rec?.delivered || !isIdentKey(key)) continue;
    update[`flags.${MODULE}.${BELIEFS_FLAG}.${character.id}.${key}.delivered`] = now;
    const attrId = parseFactKey(key)?.subject;
    if (String(rec.text ?? "").trim()) {
      const entry = attrId ? describeAttribute(attrId) : null;
      granted[key] = { text: rec.text, when: now, icon: entry?.icon ?? null, source: entry?.title ?? "" };
      if (attrId) freed.push(attrId);
    } else if (attrId && rows[attrId]?.pending) {
      /*
       * An empty-reveal pass parked before 2026-10: nothing to hand over, but its knowledge row
       * is still pending and must be freed, or the tree says "waiting on you" forever. Only an
       * existing pending row — never mint a knowledge row for an empty one.
       */
      freed.push(attrId);
    }
    any = true;
  }
  if (!any) return false;
  await subject.update(update, { render: false });
  await character.update({ [`flags.${MODULE}.${GRANTED_FLAG}`]: granted });
  // the knowledge those rungs bought stops being pending the moment the GM releases them
  if (freed.length) {
    await setKnowledge(freed.map(attrId => ({ ...(rows[attrId] ?? {}), characterId: character.id, attrId, pending: false })));
  }
  // resume: the ledgers changed, so the planner will now return the next rung
  return guardedCascade(character, subject);
}

/** Concealment: raises the DC without ever appearing in the printed one. */
export const concealmentFor = (subject, attrId) => {
  try {
    return concealFor(subject?.getFlag(MODULE, CONCEAL_FLAG), attrId);
  } catch {
    return 0;
  }
};

/**
 * **Hand a character a kind at a chosen rung** — no roll, the GM's decision.
 *
 * Joe: *"as GM, I can open their character sheet and release more information at the level I want,
 * so I can say release DC 15 and beyond."* Studying is binary — you know what a red dragon is or
 * you do not, and a failure is final — so this is the counterpart: the story route in, the same
 * way `grantKnowledge` is the route into world knowledge.
 *
 * It **raises**, it does not re-roll. Releasing tier 20 to someone who rolled a 15 replaces their
 * page with the fuller text; releasing 15 to someone who already has 25 is refused rather than
 * quietly demoting them, because taking knowledge back is not a thing this module does
 * (decision 22).
 *
 * The belief row is written as delivered with `total: null` — the ledger's honest record of *"they
 * did not roll for this; I told them."*
 */
export async function grantKind(character, kindOrSubject, tier = 15, { from = null, quiet = false, prior = null } = {}) {
  if (!game.user?.isGM || !character) return false;
  const kind = kindActorOf(kindOrSubject);
  if (!kind) return false;
  if (!STUDY_RUNGS.includes(tier)) return false;

  const held = beliefsOf(kind)[character.id]?.[KIND_KEY];
  if (held && Number(held.tier ?? -1) >= tier) {
    if (!quiet) ui.notifications.info(_loc("PENTARYN_TIES.known.study.notify.alreadyKnows", { character: character.name, kind: kind.name }));
    return false;
  }

  const { label } = studySkillFor(kind);
  const text = await composeStudyPayload(kind, tier, label);
  const now = Date.now();
  const fact = resolveFact({ ns: "kind", subjectId: kind.id });
  if (!fact) return false;

  // `from` is a share's provenance (a character id or "gm"); a plain release leaves it off
  const fromId = from ? (typeof from === "string" ? from : from.id) : null;
  const source = from && typeof from === "object" ? _loc("PENTARYN_TIES.known.share.sourceBy", { source: kind.name, name: from.name }) : undefined;
  // a flag update MERGES into the stored row: a plain release over a shared one would keep its
  // stale `from`/`prior` and still read as a share, so drop that row first
  if (held?.from && !fromId) await putBelief(fact, character.id, null);
  // the row this replaces, when a Share raised a lower tier — `forgetFact` gives it back
  await putBelief(fact, character.id, { text, tier, total: null, when: now, delivered: now, from: fromId, prior });
  // "Mark as failed" (tier 0) composes to "" unless rung 0 is authored: lock and ledger, no card
  await applyPlayerWrites(character, fact, { text, silent: !text, tier, source }, now);
  if (!quiet) ui.notifications.info(_loc("PENTARYN_TIES.known.study.notify.released", { character: character.name, kind: kind.name, tier }));
  return true;
}

/**
 * Un-spend one **identification** — the GM's do-over for this creature and this character.
 *
 * ## Why this exists when Joe ruled out a reset
 *
 * He ruled on **stage 1**: *"if they fail, the character simply does not know about that city, no
 * amount of time is going to change that fact"* — and that stands. Its valve is disclosure
 * (`grantKnowledge`), which is a story act rather than an admin button, exactly as intended.
 *
 * A **per-creature identification** is a different thing and was never ruled on. Without this a
 * mis-click, a wrong DC noticed one second too late, or a test roll leaves a creature permanently
 * unplaceable by that character with no recovery whatsoever. Found by playtesting: a botched
 * roll against one NPC silently closed the whole guild beneath him and nothing could reopen it.
 *
 * This does NOT touch world knowledge. Clearing an identification lets them look again; it never
 * gives back a stage-1 answer they lost.
 */
export async function resetIdentification(character, subject, attrId) {
  if (!game.user?.isGM || !character || !subject || !attrId) return false;
  const all = readFlag(subject, MODULE, BELIEFS_FLAG) ?? {};
  const key = identifiedKey(attrId);
  if (!all[character.id]?.[key]) return false;

  const others = Object.keys(all[character.id]).filter(k => k !== key);
  const rest = Object.keys(all).filter(k => k !== character.id);
  if (!others.length && !rest.length) await subject.unsetFlag(MODULE, BELIEFS_FLAG);
  else await subject.update(dropRow(`flags.${MODULE}.${BELIEFS_FLAG}`, character.id, key, all[character.id]), { render: false });
  // a do-over takes back the failure line that roll handed them, if it handed one (2026-10-08)
  const missKey = identMissKey(subject.id, attrId);
  if (readGranted(readFlag(character, MODULE, GRANTED_FLAG))[missKey])
    await character.update({ [`flags.${MODULE}.${GRANTED_FLAG}.-=${missKey}`]: null });

  ui.notifications.info(
    _loc("PENTARYN_TIES.known.inspect.resetDone", { character: character.name, subject: subject.name, attr: describeAttribute(attrId).title })
  );
  return true;
}

/**
 * Clear everything one character has worked out about one creature — every rung, in one call.
 * The gesture a GM actually wants after a mistake, since a botched rung usually took a ladder
 * with it.
 */
export async function resetInspection(character, subject) {
  if (!game.user?.isGM || !character || !subject) return false;
  const mine = (readFlag(subject, MODULE, BELIEFS_FLAG) ?? {})[character.id] ?? {};
  const attrIds = Object.keys(mine)
    .map(k => (isIdentKey(k) ? parseFactKey(k)?.subject : null))
    .filter(Boolean);
  for (const id of attrIds) await resetIdentification(character, subject, id);
  return attrIds.length;
}
