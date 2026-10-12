/**
 * The GM side: the blind roll, applying a study request, the belief ledger's read/write, the
 * player-plane writes and the public stub card.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { MODULE } from "../ties-core.mjs";
import { canReach } from "../ties-adapter.mjs";
import {
  ATTR_BELIEFS_SETTING,
  BELIEFS_FLAG,
  combineAdvantage,
  GRANTED_FLAG,
  GRANTED_TEXT_MAX,
  isBlankProse,
  KNOWN_FLAG,
  makeKnownEntry,
  readAttrBeliefs,
  readGranted,
  STUDIED_FLAG,
  toStoredKnown
} from "../known-core.mjs";
import { claimFact, dropRow, releaseFact } from "./claim.mjs";
import { promptDeliver } from "./gate.mjs";
import { beliefsOf, resolveFact, stackingRule, studiedOf } from "./resolve.mjs";
import { cardName, cardToken, clampSituational, esc, log } from "./shared.mjs";
import { readFlag } from "../lib/flags.mjs";
import { setting, mayWrite, attrBeliefsStore } from "../settings.mjs";

/* -------------------------------------------- */
/*  GM side                                     */
/* -------------------------------------------- */

/**
 * The blind roll mode, as dnd5e 6 must hand it to core: `Roll._mapLegacyRollMode(BLIND)`.
 *
 * ⚠ A private core API (adjustments row dnd5e-legacy-roll-modes). Asked BEFORE anything is staked
 * (ties-29): a core that drops it refuses the study cleanly, never falling back to the legacy key —
 * an unknown key is silently replaced by the client default, and the card would go public.
 */
export function rollModeBlind() {
  const map = foundry.dice?.Roll?._mapLegacyRollMode;
  if (typeof map !== "function") throw new Error("Roll._mapLegacyRollMode is missing; a blind study roll cannot be thrown");
  return map(CONST.DICE_ROLL_MODES.BLIND);
}

/**
 * One blind skill check, with the option to leave **no chat message at all**.
 *
 * ## Why `silent` exists, and why it is not optional for a cascade
 *
 * A blind card is hidden from the player but **still listed** in their chat log as *"Gamemaster
 * privately rolled some dice"* — phase 3 verified exactly that. For a single roll that is fine and
 * even good: it is the uniform observable the design wants.
 *
 * For a **cascade** it is a disaster. One inspection can roll three rungs against the spy and zero
 * against the fisherman, so N grey cards would print a **depth counter in the shared UI** — a far
 * louder tell than the 260 ms timing difference phase 3 was bitten by. So cascade rungs roll with
 * message creation suppressed entirely, and the GM's record lives where decision 12 always wanted
 * it: the belief ledger and its Beliefs section.
 *
 * `create: false` returns the evaluated roll without a `ChatMessage`; the dnd5e hooks that would
 * post one never fire.
 */
export async function throwBlind(character, fact, { mode, situational, silent = false, rollMode = null } = {}) {
  const rolls = await character.rollSkill(
    {
      skill: fact.skill,
      target: fact.dc,
      advantage: mode === "advantage",
      disadvantage: mode === "disadvantage",
      rolls: situational ? [{ parts: ["@situational"], data: { situational } }] : []
    },
    { configure: false },
    silent
      ? { create: false }
      : {
          // dnd5e 6 hands this to core as `messageMode`, which only knows the new keys of
          // CONFIG.ChatMessage.modes; a legacy "blindroll" is silently swapped for the client
          // default (public) and the Study roll would land face-up in the player's chat.
          rollMode: rollMode ?? rollModeBlind(),
          data: {
            flavor: _loc("PENTARYN_TIES.known.study.rollFlavor", { name: fact.name, skill: fact.skillLabel }),
            // Dice So Nice reads `flags["dice-so-nice"].skip` (6.x); it never read the old
            // `suppressRollDiceSoNice`, so blind study rolls animated on the GM's screen.
            flags: { "dice-so-nice": { skip: true } }
          }
        }
  );
  return rolls?.[0] ?? null;
}

/** GM side: validate hard, re-read everything, roll, grade, write. One path, every namespace. */
export async function applyStudy(payload, senderId) {
  const user = game.users?.get(senderId);
  const character = game.actors?.get(payload?.characterId);
  const refuse = why => {
    log.warn(`study refused: ${why}`);
    return false;
  };

  if (!user) return refuse(`unknown sender ${senderId}`);
  if (!character) return refuse(`${user.name} named a character that does not exist`);
  if (character.type !== "character") return refuse(`${character.name} is not a character sheet`);

  /*
   * The seam, and it runs BEFORE any permission check on purpose: reach is tested against
   * `fact.subject`, which only the resolver knows. For a `kind:` fact the subject is the
   * creature the player pointed at while the ledger is the kind behind it, and testing reach
   * against the wrong one of those two is precisely the mistake rule 4 exists to make
   * unrepeatable.
   */
  const fact = resolveFact({
    ns: payload?.ns ?? "kind",
    subjectId: payload?.subjectId,
    factId: payload?.factId,
    attrId: payload?.attrId
  });
  if (!fact) return refuse(`${user.name} named a fact that does not resolve`);

  // the sender must own the notebook they are asking to write in
  if (character.testUserPermission(user, "OWNER") !== true)
    return refuse(`${user.name} does not own ${character.name}`);
  // and the GM's kill-switch has to mean what its hint promises
  if (!mayWrite(user)) return refuse(`playerAccess is off for ${user.name}`);
  if (!canReach(user, fact.subject)) return refuse(`${user.name} cannot see ${fact.subject.name}`);

  /*
   * ⚠ **The belief ledger is the lock of record**, not `studied`. `studied` lives on the
   * player's own actor, which they own — one `unsetFlag` in their devtools re-arms it. The
   * belief record sits on `fact.ledger`, which no player can write (server-enforced, the
   * relay's own ground), so it is the only refusal that cannot be un-spent from the far end.
   */
  // the belief row is the lock of record on BOTH planes — a flag on a document the player
  // cannot write, or a setting the server refuses player writes to. Same unforgeability.
  if (readBelief(fact, character.id)) return refuse(`${character.name} has already studied ${fact.name}`);

  // a blind roll needs core's private roll-mode map: ask before staking anything (ties-29)
  let rollMode = null;
  if (fact.offset !== "auto" && fact.silentRoll !== true) {
    try {
      rollMode = rollModeBlind();
    } catch (err) {
      return refuse(err.message);
    }
  }

  // stake the row before rolling — two GM sessions of one account are both `activeGM`
  if (!(await claimFact(fact, character.id, Date.now())))
    return refuse(`another GM session is already rolling ${character.name} on ${fact.name}`);

  // a throw anywhere past the stake hands the claim back, so nothing is stranded as "already
  // studied" (ties-29); once the real record is written the release is a no-op
  try {
    return await applyClaimed(character, fact, payload, rollMode, refuse);
  } catch (err) {
    await releaseFact(fact, character.id);
    throw err;
  }
}

/** applyStudy past the stake: roll, grade, write. Its caller releases the claim on a throw. */
async function applyClaimed(character, fact, payload, rollMode, refuse) {

  const situational = clampSituational(payload?.situational);

  /*
   * Advantage, counted here and stored nowhere (decision 19, as amended by §2e).
   *
   * Decision 19's broad form — *"the roller and subject share any advantage-granting attribute, so
   * every roll about them is easier"* — is **retired** (Joe, 2026-08-23: *"that is too broad"*). It
   * applied to the kind ladder and to personal lore rows, where sharing a guild says nothing.
   *
   * What replaces it is per-attribute and precisely scoped: an identification roll gets advantage
   * from `whenKnown`/`whenCarried` on the attribute **being identified**, decided by the cascade
   * planner and handed in as `fact.advantage`. Nothing else grants advantage automatically.
   */
  const declared = payload?.mode;
  const adv = (declared === "advantage" ? 1 : 0) + (fact.advantage ? 1 : 0);
  const dis = declared === "disadvantage" ? 1 : 0;
  const mode = combineAdvantage(adv, dis, stackingRule());
  const shared = fact.advantageReason ? [fact.advantageReason] : [];
  const sources = {
    adv,
    dis,
    shared: shared.map(h => h.title),
    declared: declared ?? "normal",
    rule: stackingRule(),
    resolved: mode
  };

  /*
   * The blind roll. Three things here are load-bearing and none is decoration:
   *
   *  · `message.rollMode = "blind"` — dnd5e 6 passes it to core as the `messageMode` (a key
   *    of CONFIG.ChatMessage.modes; the legacy "blindroll" is mapped by
   *    `Roll._mapLegacyRollMode` in throwBlind, because an unknown key silently falls back to
   *    the client default and the card goes public). Core stamps `blind: true` and whispers
   *    the card to GMs; `isContentVisible` is false for every non-GM, so core replaces the flavor with
   *    "privately rolled some dice" and dnd5e's pass/fail highlighter returns before styling
   *    anything. The player's copy of this card cannot render a verdict.
   *  · `dialog.configure = false` — the configuration dialog already happened, on the
   *    player's client, and re-opening dnd5e's own here would stop the GM's game dead in the
   *    middle of somebody else's gesture.
   *  · Dice So Nice is suppressed deliberately. 3D dice replaying the number the blind mode
   *    just hid would undo the whole design in the most literal way available.
   *
   * ⚠ `target: fact.dc` puts the row's own DC on the GM's card for a lore roll. That is right
   * for the GM — it is their number — and invisible to the player, who cannot render a blind
   * card's content at all. It must never be echoed anywhere the player can read.
   */
  /*
   * An `"auto"` kind is common knowledge: no roll, no lock to spend, nothing to fail. The rest of
   * the batch below runs unchanged, so it still files an entry, posts the stub and can be held —
   * it simply never touches dice.
   */
  const roll = fact.offset === "auto"
    ? { total: null }
    : await throwBlind(character, fact, { mode, situational, silent: fact.silentRoll === true, rollMode });
  const graded = await fact.grade(roll?.total ?? null);
  // null = no roll evaluated. NOT a failure, and nothing below this line may run — including
  // the claim, which must be handed back or the roll is stranded on a mishap.
  if (!graded) {
    await releaseFact(fact, character.id);
    return refuse(`${character.name}'s roll on ${fact.name} produced nothing`);
  }

  const now = Date.now();
  /*
   * A silent outcome (a side with nothing written — a failure with no `miss`, a pass with no
   * `text`) is never held: there is nothing
   * to hand over, so a Deliver prompt would ask the GM to release an empty box and leave a
   * pending row that delivers nothing. The lock and stub are written the same either way.
   */
  const hold = fact.hold && !graded.silent;

  /*
   * The write batch, **split** by the approval gate (disguise decision 8):
   *
   *   roll time  — the belief row (carrying the computed payload), the `studied` lock, and
   *                the public stub. The lock is spent whether or not the reveal is delivered,
   *                so a pending reveal is a spent roll with its payoff parked in the ledger.
   *   delivery   — the reveal into the player's own entry, and the `delivered` stamp.
   *
   * The lock **must** be written now even when held: it is what makes the affordance vanish,
   * and an affordance that lingers while a reveal waits is a "your roll is pending" tell that
   * a plain failure would not have.
   */
  await putBelief(fact, character.id, {
    text: graded.text,
    tier: graded.tier,
    total: roll.total,
    when: now,
    delivered: hold ? null : now,
    sources,
    // the verdict itself: a kind's rung-0 lie has text and is still a failure, and legacy lore
    // rows stored their miss line as text, so text alone cannot say
    pass: graded.pass === true
  });
  await applyPlayerWrites(character, fact, hold ? null : graded, now);
  await postStub(character, fact.subject);

  if (hold) await promptDeliver(character, fact);
  else
    ui.notifications.info(
      _loc(graded.pass ? "PENTARYN_TIES.known.study.notify.delivered" : "PENTARYN_TIES.known.study.notify.missed", { character: character.name, kind: fact.name })
    );
  return true;
}

/**
 * Read one belief row, whichever plane it lives on.
 *
 * `kind:` and `lore:` records sit in a flag on a document; `attr:` records sit in a world
 * setting, because an attribute is not a document. Every caller goes through here so the
 * difference is stated once instead of at each call site that would otherwise have to know.
 */
export function readBelief(fact, characterId) {
  if (fact.ns === "attr") {
    return readAttrBeliefs(setting(ATTR_BELIEFS_SETTING))[`${fact.factKey}:${characterId}`] ?? null;
  }
  return beliefsOf(fact.ledger)[characterId]?.[fact.beliefKey] ?? null;
}

/** Write or clear one belief row. `record: null` deletes it — the reset path. */
export async function putBelief(fact, characterId, record) {
  if (fact.ns !== "attr") {
    if (record === null) {
      const all = readFlag(fact.ledger, MODULE, BELIEFS_FLAG) ?? {};
      if (!all[characterId]?.[fact.beliefKey]) return;
      await fact.ledger.update(
        dropRow(`flags.${MODULE}.${BELIEFS_FLAG}`, characterId, fact.beliefKey, all[characterId]),
        { render: false }
      );
      return;
    }
    return writeBelief(fact, characterId, record);
  }

  /*
   * ⚠ A setting is rewritten WHOLE, not merged. That cuts both ways: deletion is just leaving
   * the key out (no `-=` syntax needed, and none available), but two GM sessions writing
   * different rows in the same instant would clobber each other. The claim protocol (claim.mjs)
   * already serialises rolls per character-and-fact, which is the only concurrency this
   * ledger actually sees — a GM hand-editing the registry at the same moment is a person, not
   * a race.
   */
  if (!game.user?.isGM) return;
  const key = `${fact.factKey}:${characterId}`;
  // queued (ties-30): the read happens inside the queue, so a share racing a roll loses nothing
  await attrBeliefsStore().write(raw => {
    const all = readAttrBeliefs(raw);
    if (record === null) delete all[key];
    else
      all[key] = {
        text: record.text ?? "",
        tier: null,
        total: record.total ?? null,
        when: record.when ?? 0,
        delivered: record.delivered ?? null,
        claim: record.claim ?? null,
        sources: record.sources ?? null,
        ...(typeof record.pass === "boolean" ? { pass: record.pass } : {}),
        ...(record.from ? { from: record.from } : {}),
        ...(record.from && record.prior ? { prior: record.prior } : {})
      };
    return all;
  });
}

/**
 * One belief row, written at its own path so nobody else's record is even in the payload.
 *
 * Every field is stated explicitly, `claim` included: the update merges, so a row that was a
 * claim a moment ago would otherwise keep its `claim` key forever underneath the real record.
 *
 * `render:false` — a belief row is GM-only data and must not repaint a sheet the GM has open
 * on another tab mid-gesture.
 */
async function writeBelief(fact, characterId, record) {
  await fact.ledger.update(
    {
      [`flags.${MODULE}.${BELIEFS_FLAG}.${characterId}.${fact.beliefKey}`]: {
        text: record.text ?? "",
        tier: record.tier ?? null,
        total: record.total ?? null,
        when: record.when ?? 0,
        delivered: record.delivered ?? null,
        claim: null,
        sources: record.sources ?? null,
        // stated even when absent: the update MERGES, so a share laid over a failed roll would
        // otherwise inherit its `pass: false` and read as failed
        pass: typeof record.pass === "boolean" ? record.pass : null,
        ...(record.from ? { from: record.from } : {}),
        // what a share replaced (`priorOf`) — a re-roll or a plain write drops it with the row
        ...(record.from && record.prior ? { prior: record.prior } : {})
      }
    },
    { render: false }
  );
}

/**
 * The player-facing half, in **one** `Actor#update`.
 *
 * Atomic on purpose: a crash between the lock and the reveal would leave a spent roll with no
 * answer, or an answer with no lock. Pass `reveal: null` to write only the lock (the held
 * case) — the reveal then lands here later from `deliver`, and the lock being already set is
 * harmless.
 *
 * ⚠ Unlike every other write in this module this one **renders**. The other writes are made
 * by the client whose sheet is open and repainted deliberately; this one is made by the GM
 * onto somebody else's actor, and `render:false` would leave the player staring at a notebook
 * that silently changed underneath them until they closed and reopened it.
 */
export async function applyPlayerWrites(character, fact, graded, now) {
  const studied = studiedOf(character);
  studied[fact.axis][fact.lockKey] = { when: now };
  const update = { [`flags.${MODULE}.${STUDIED_FLAG}`]: studied };

  /*
   * `graded` is null for a held roll: write the lock alone now, and the reveal lands here from
   * `deliver` later. `graded.silent` is the other empty case and a different one — the roll
   * resolved and there is nothing to hand over: a failure with no written failure line, or a
   * pass with no authored text. Both write the lock and both let the stub post; only the grant is
   * skipped — no card, no Known-list entry, no title. A failure WITH written text is not silent: it
   * is granted here exactly like a pass (Joe, 2026-10-08).
   */
  if (graded && !graded.silent && !isBlankProse(graded.text)) {
    /*
     * Which entry does this fact file under? The only place the namespaces disagree about
     * anything player-facing, and it is one line each:
     *
     *   kind:  the KIND's page — the bestiary entry every goblin shares
     *   lore:  the INDIVIDUAL's page — this is the axis that answers "who is this one"
     */
    const entryActor = fact.ns === "kind" ? fact.ledger : fact.subject;
    update[`flags.${MODULE}.${KNOWN_FLAG}`] = knownListWith(character, entryActor, now);

    /*
     * The reveal lands in the sibling `granted` map, NOT in `entry.notes` (decision 22).
     *
     * `notes` is the player's own prose and the notes autosave rewrites it on a 700ms timer,
     * round-tripping the entry through `toStoredKnown`. Anything the GM hands over that lived
     * in that field would be editable by the player — which the design forbids — and, worse,
     * erasable by their next keystroke. Keyed by fact, so a reset + re-roll REPLACES under the
     * same key rather than appending a second copy.
     */
    const granted = readGranted(readFlag(character, MODULE, GRANTED_FLAG));
    granted[fact.factKey] = {
      text: String(graded.text).slice(0, GRANTED_TEXT_MAX),
      when: now,
      icon: fact.img,
      // the provenance line: the kind's name for a bestiary fact, the row's label for a lore
      // fact — which is what makes several lore grants on one page readable as separate facts.
      // A GM Share passes its own ("… — shared by Caven").
      source: graded.source ?? fact.name
    };
    update[`flags.${MODULE}.${GRANTED_FLAG}`] = granted;
  }

  await character.update(update);
  return true;
}

/**
 * The character's Known list with `entryActor` filed in it (unchanged when already there), in
 * storage shape — the "give the fact a page to render on" half of `applyPlayerWrites`, shared
 * with the GM's Share so the two cannot disagree about how an entry is born.
 */
export function knownListWith(character, entryActor, now) {
  const rawKnown = readFlag(character, MODULE, KNOWN_FLAG);
  const list = Array.isArray(rawKnown) ? [...rawKnown] : [];
  if (!list.find(e => e?.id === entryActor.id)) {
    const entry = makeKnownEntry({
      id: entryActor.id,
      name: entryActor.name,
      actorType: entryActor.type,
      creatureType: entryActor.system?.details?.type?.value ?? null,
      now
    });
    entry.name = entry.cachedName;
    list.push(entry);
  }
  return toStoredKnown(list);
}

/**
 * The public stub — "a check was made, and about whom". Nothing else.
 *
 * Posted at **roll time in every case**, held or not, passed or failed. It is the one thing
 * the player is guaranteed to observe, and making it conditional on anything at all would
 * turn its presence into the answer.
 */
export async function postStub(character, subject) {
  // both creatures by their token names, never the actor names (TIE-3)
  await ChatMessage.create({
    content: `<p class="pt-study-stub">${esc(_loc("PENTARYN_TIES.known.study.stub", { character: cardName(character), subject: cardName(subject) }))}</p>`,
    speaker: { ...ChatMessage.getSpeaker({ actor: character, token: cardToken(character) }), alias: cardName(character) }
  });
}
