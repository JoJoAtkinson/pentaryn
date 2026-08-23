/**
 * The study conduit — the GM's client throws the roll and hands back one string.
 *
 * ## What this is, in one paragraph
 *
 * A player points at a creature in their notebook and asks "what *is* this?". The answer is
 * graded by a d20 they are never allowed to see, because the answer at low totals may be
 * **deliberately false** (design decision 5) and a player who saw a 9 would know to distrust
 * the confident sentence they were just handed. So the roll does not happen on their client
 * at all: their client sends two declarations over the socket, a GM's client rolls blind,
 * grades, composes, writes, and posts one public stub card that says a check was made and
 * about whom. Nothing else crosses the wire in either direction.
 *
 * ## The trust boundary — the same one `relay.mjs` established
 *
 * Identity comes from the **server** (`senderId`, the socket handler's second argument),
 * never from the payload. Ownership, reach, the kill switch and the lock are all re-derived
 * here from documents this client can see. The payload is trusted for exactly two ids and
 * two bounded declarations (advantage mode, situational bonus) — and those two print on the
 * GM's own card, so lying in them is lying to the GM's face. That is the physical-table trust
 * level, which is the level Joe's threat model (disguise decision 9) actually asks for.
 *
 * ## What is genuinely secret, and what is only presentation
 *
 * Foundry ships every document to every client, so a monster's stat block is on the player's
 * machine before anyone rolls. What this conduit keeps off that machine is what it never
 * sends: **the total, the DC, the tiers they did not buy, and the GM's authored words for
 * rungs they missed.** A secret never sent is the only kind client-side code can keep, and it
 * is a stronger one than the rejected "ask the GM to disclose what you already hold" design.
 *
 * ## The indistinguishability contract (decision 11) — read this before touching the UI
 *
 * Every observable consequence of a *completed* study roll is identical for a triumph, a
 * failure and a deliberate lie: the affordance vanishes on any completed roll, the stub card
 * is the same DOM, no notification fires on the player's client, and the provenance header
 * carries the skill and nothing else. **If any pixel differs by outcome, that pixel is the
 * number.** Do not add a success tint, a "you learned a lot!" toast, or a longer delay for
 * the bigger write.
 */

import { attributeLore, describeAttribute, attributeIdsOf, knowledge, setKnowledge } from "./attributes.mjs";
import { MODULE, mayWrite, canReach } from "./ties-api.mjs";
import {
  KNOWN_FLAG,
  GRANTED_FLAG,
  GRANTED_TEXT_MAX,
  readGranted,
  LORE_FLAG,
  readLore,
  rollableLore,
  loreOutcome,
  loreFactKey,
  attrFactKey,
  readAttrBeliefs,
  attributeIdsFor,
  combineAdvantage,
  ATTR_BELIEFS_SETTING,
  REGISTRY_SETTING,
  KNOWN_NOTES_MAX,
  STUDIED_FLAG,
  BELIEFS_FLAG,
  KIND_OF_FLAG,
  STUDY_TIERS_FLAG,
  STUDY_HOLD_FLAG,
  STUDY_BASE_DC,
  STUDY_RUNGS,
  STUDY_OFFSET_FLAG,
  studyOffsetOf,
  KIND_KEY,
  tierOf,
  studySkill,
  resolveKindId,
  readStudyTiers,
  authoredTier,
  kindHasContent,
  readStudied,
  readBeliefs,
  mayStudy,
  holdResolved,
  safeFlatten,
  capProse,
  traitsLine,
  composeReveal,
    toStoredKnown,
  makeKnownEntry,
  parseFactKey,
  parseLedgerKey,
  planStep,
  identifiedKey,
  MEMBER_FACT
} from "./known-core.mjs";

const CHANNEL = `module.${MODULE}`;
const STUDY = "study";
const INSPECT = "inspect";
const BUBBLE = "scope-bubble";

/** How many attack lines a tier-25 reveal will paste. An ancient dragon is not a manual. */
const ATTACK_LINES_MAX = 12;

/** Situational bonus range. Wide enough for the indistinguishability run's ±100 forcing. */
export const SITUATIONAL_MIN = -100;
export const SITUATIONAL_MAX = 100;

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);
const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Is this client the one GM that should act on relayed work? `relay.mjs`'s rule, verbatim. */
const isApplyingGM = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/**
 * ⚠ **`activeGM` identifies a USER, not a session — and one GM can be logged in twice.**
 *
 * Measured on this machine while building this, not imagined: `lsof` on port 30000 showed two
 * established connections, the Foundry desktop app and a browser, **both signed in as
 * Gamemaster**. `game.users` lists one active user for the pair, so `isApplyingGM()` is `true`
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

/**
 * Stake the ledger row before the dice fall. Returns false for the client that lost.
 *
 * The claim doubles as the lock while the roll runs: a claim record reads back through
 * `readBeliefs` as a spent belief, so a second request for the same character and kind is
 * refused by `mayStudy` rather than racing the first. A claim left behind by a client that died
 * mid-roll therefore *does* strand the roll — deliberately the safe direction, and `reset` is
 * the one-line cure because it deletes the whole row.
 */
/** Stake this fact before rolling — two GM sessions of one account are both `activeGM`. */
async function claimFact(fact, characterId, now) {
  if (fact.ns === "attr") {
    const mine = session();
    await putBelief(fact, characterId, { text: "", total: null, when: now, delivered: null, claim: mine });
    await new Promise(resolve => setTimeout(resolve, 250));
    return readBelief(fact, characterId)?.claim === mine;
  }
  return claimRoll(fact.ledger, characterId, now, fact.beliefKey);
}

/** Hand it back — only ever by the client that won, and only when no roll happened. */
async function releaseFact(fact, characterId) {
  if (fact.ns === "attr") {
    if (readBelief(fact, characterId)?.claim !== session()) return;
    await putBelief(fact, characterId, null);
    return;
  }
  return releaseClaim(fact.ledger, characterId, fact.beliefKey);
}

async function claimRoll(ledger, characterId, now, key = KIND_KEY) {
  const mine = session();
  await ledger.update(
    { [`flags.${MODULE}.${BELIEFS_FLAG}.${characterId}.${key}`]: { claim: mine, when: now } },
    { render: false }
  );
  // long enough for the other client's write to arrive and be broadcast back; short enough that
  // nobody at the table reads it as lag. The loser never rolls, so the cost is paid once.
  await new Promise(resolve => setTimeout(resolve, 250));
  return flagOf(ledger, BELIEFS_FLAG)?.[characterId]?.[key]?.claim === mine;
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
function dropRow(base, ownerId, key, owned) {
  const rest = Object.keys(owned ?? {}).filter(k => k !== key);
  return rest.length ? { [`${base}.${ownerId}.-=${key}`]: null } : { [`${base}.-=${ownerId}`]: null };
}

/** Un-stake it — only ever called by the client that won, and only when no roll happened. */
async function releaseClaim(ledger, characterId, key = KIND_KEY) {
  const all = flagOf(ledger, BELIEFS_FLAG) ?? {};
  if (all?.[characterId]?.[key]?.claim !== session()) return;
  await ledger.update(dropRow(`flags.${MODULE}.${BELIEFS_FLAG}`, characterId, key, all[characterId]), {
    render: false
  });
}

const flagOf = (doc, key) => {
  try {
    return doc?.getFlag(MODULE, key);
  } catch {
    return undefined;
  }
};

/* -------------------------------------------- */
/*  Resolution                                  */
/* -------------------------------------------- */

/** The kind actor behind any actor: the GM-set pointer, else itself (decision 4). */
export function kindActorOf(actor) {
  if (!actor) return null;
  const id = resolveKindId(actor.id, flagOf(actor, KIND_OF_FLAG), x => !!game.actors?.get(x));
  return game.actors?.get(id) ?? actor;
}

/* -------------------------------------------- */
/*  The fact seam — decision 21, rule 4         */
/* -------------------------------------------- */

/**
 * "What is being studied?", answered in exactly one place.
 *
 * Everything downstream — reach, the lock, the belief row, the grant key, the DC, the skill,
 * how a total becomes prose — reads off this descriptor and never asks what *kind* of thing
 * it is. Today two namespaces answer: `kind:` (the graded ladder, phase 3) and `lore:` (flat
 * pass/fail on an individual, phase 4). The attribute phase adds a third branch here and
 * touches nothing else in the conduit; the disguise plan's `mask:` is the fourth.
 *
 * That is the whole of rule 4, and it is worth the indirection for one reason: the conduit is
 * the security boundary. Every branch that re-implements "which ledger, whose reach, which
 * lock" is a branch that can get one of the three subtly wrong on a path nobody re-audits.
 *
 * Returns `null` for anything it cannot fully resolve. A caller that gets `null` must refuse —
 * never fall back to a default subject, because the default would be the wrong document to
 * check reach against.
 */
export function resolveFact(spec) {
  const ns = spec?.ns;
  const subject = game.actors?.get(spec?.subjectId);
  if (!subject) return null;

  if (ns === "kind") {
    const kind = kindActorOf(subject);
    if (!kind) return null;
    const { skill, label } = studySkillFor(kind);
    return {
      ns: "kind",
      axis: "kind",
      subject, // what the player pointed at — the reach test's document
      ledger: kind, // where the belief row lives: the kind, which may not be the subject
      lockKey: kind.id,
      beliefKey: KIND_KEY, // shipped in phase 3 as the bare "kind"; left alone, see below
      factKey: `kind:${kind.id}`,
      name: kind.name,
      img: kind.img ?? null,
      skill,
      skillLabel: label,
      /*
       * The kind's own difficulty (Joe's one knob). A number shifts the whole ladder; `"auto"`
       * means common knowledge — inspecting is enough and no dice are thrown at all.
       */
      offset: studyOffsetOf(flagOf(kind, STUDY_OFFSET_FLAG)),
      dc: STUDY_BASE_DC + (typeof studyOffsetOf(flagOf(kind, STUDY_OFFSET_FLAG)) === "number"
        ? studyOffsetOf(flagOf(kind, STUDY_OFFSET_FLAG)) : 0),
      hold: studyHoldFor(kind),
      /** Grade → prose. `null` means no roll happened and nothing may be spent. */
      grade: async total => {
        const off = studyOffsetOf(flagOf(kind, STUDY_OFFSET_FLAG));
        /*
         * `"auto"` hands over the top rung without a roll. Not a DC of zero: a zero would still
         * spend the one attempt and could still be *failed* on a negative total, and nobody
         * permanently fails to recognise a chicken.
         */
        if (off === "auto") {
          return { text: await composeStudyPayload(kind, 25, label), silent: false, tier: 25, pass: true };
        }
        const tier = tierOf(total, off);
        if (tier === null) return null;
        return { text: await composeStudyPayload(kind, tier, label), silent: false, tier, pass: tier >= 15 };
      }
    };
  }

  if (ns === "lore") {
    // `rollableLore`, not `readLore`: a draft row is stored state, never a rollable fact. A
    // row deleted or blanked mid-gesture stops resolving here, and the caller refuses.
    const row = rollableLore(flagOf(subject, LORE_FLAG)).find(r => r.id === spec?.factId);
    if (!row) return null;
    const label = CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill;
    const factKey = loreFactKey(subject.id, row.id);
    return {
      ns: "lore",
      axis: "lore",
      subject,
      ledger: subject, // an individual's facts are recorded on the individual
      lockKey: factKey,
      /*
       * The belief key is the FULL namespaced key, per rule 1 — even though it already sits
       * on the subject's own document, where the actor id is redundant. It costs a few bytes
       * and it means every ledger in the module is keyed the same way, so the attribute phase
       * can file `attr:` rows beside these without a collision or a migration. `kind:` keeps
       * the bare "kind" it shipped with, because that data is live and renaming it would be
       * exactly the migration rule 1 exists to prevent.
       */
      beliefKey: factKey,
      factKey,
      name: row.label,
      img: subject.img ?? null,
      skill: row.skill,
      skillLabel: label,
      dc: row.dc,
      hold: holdResolved(row.hold, holdDefault()),
      row,
      grade: async total => {
        const out = loreOutcome(row, total);
        if (!out) return null;
        return { text: out.text, silent: out.silent, tier: null, pass: out.pass };
      }
    };
  }

  if (ns === "attr") {
    /*
     * The third branch, and the one rule 4 was written for. Everything structural differs from
     * the other two — the ledger is a world SETTING, not a document; the "subject" is a
     * registry entry, not an actor — and yet nothing downstream changes, because downstream
     * only ever reads this descriptor.
     *
     * `subject` stays the actor the player was looking at. It has to: reach is "can this
     * player see the creature they are asking about", and an attribute has no tokens. Studying
     * the guild through a guildsman standing in front of you is the gesture.
     */
    const attrId = String(spec?.attrId ?? "").trim();
    const row = rollableLore(attributeLore(attrId)).find(r => r.id === spec?.factId);
    if (!row) return null;
    const entry = describeAttribute(attrId);
    const label = CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill;
    const factKey = attrFactKey(attrId, row.id);
    return {
      ns: "attr",
      axis: "lore", // it locks in the same axis as a lore row: `studied.lore[factKey]`
      subject,
      ledger: null, // ⚠ a SETTING, not a document — see `writeBelief`'s branch
      attrId,
      lockKey: factKey,
      beliefKey: factKey,
      factKey,
      name: `${entry.title} — ${row.label}`,
      img: entry.icon,
      // provenance is the ATTRIBUTE, not the creature: the whole point is that this fact came
      // from the guild, and reading it under one guildsman's page must say so
      source: entry.title,
      skill: row.skill,
      skillLabel: label,
      dc: row.dc,
      hold: holdResolved(row.hold, holdDefault()),
      row,
      grade: async total => {
        const out = loreOutcome(row, total);
        if (!out) return null;
        return { text: out.text, silent: out.silent, tier: null, pass: out.pass };
      }
    };
  }

  return null;
}

export const studiedOf = actor => readStudied(flagOf(actor, STUDIED_FLAG));
export const beliefsOf = actor => readBeliefs(flagOf(actor, BELIEFS_FLAG));
export const studyTiersOf = actor => readStudyTiers(flagOf(actor, STUDY_TIERS_FLAG));

/** The registry, read defensively — a setting can be unregistered when a hook fires early. */
function reg() {
  try {
    return game.settings.get(MODULE, REGISTRY_SETTING) ?? [];
  } catch {
    return [];
  }
}

/**
 * RAW or netting (decision 19). **Default RAW** — a module meant to ship defaults to the 2024
 * PHB, and Joe's netting is the one flip his table makes.
 */
function stackingRule() {
  try {
    return game.settings.get(MODULE, "advantageStacking") === "net" ? "net" : "raw";
  } catch {
    return "raw";
  }
}

/** The world's fallback for the approval gate, read defensively — settings can be unborn. */
function holdDefault() {
  try {
    return game.settings.get(MODULE, "holdDefault") === true;
  } catch {
    return false;
  }
}

export const studyHoldFor = kind => holdResolved(flagOf(kind, STUDY_HOLD_FLAG), holdDefault());

/** Which skill this kind is studied with, and its localized name for the provenance header. */
export function studySkillFor(kind) {
  const skill = studySkill(kind?.system?.details?.type?.value ?? null);
  return { skill, label: CONFIG.DND5E?.skills?.[skill]?.label ?? skill };
}

/**
 * Everything the row needs to decide whether to draw the kind affordance — and the whole of
 * "no content, no icon" (decision 5).
 *
 * ⚠ `spent` reads the **player's own** `studied` flag, which is a UI hint and not the lock:
 * the GM handler refuses off the belief ledger, which sits on an actor no player can write.
 * That split is deliberate — see `mayStudy` in `known-core.mjs`.
 */
export function studyStateFor(character, subject) {
  const kind = kindActorOf(subject);
  if (!kind) return { available: false };
  const spent = !!studiedOf(character).kind[kind.id];
  const content = kindHasContent({
    biography: kind.system?.details?.biography?.value ?? "",
    tiers: studyTiersOf(kind),
    attacks: attackItems(kind)
  });
  const { skill, label } = studySkillFor(kind);
  return {
    kind,
    kindId: kind.id,
    // the cross-reference line decision 7 promises on an individual's row: "Kind: Goblin"
    isOwnKind: kind.id === subject.id,
    spent,
    content,
    skill,
    skillLabel: label,
    gmOnline: !!game.users?.activeGM,
    available: content && !spent
  };
}

/* -------------------------------------------- */
/*  Deriving the truth off the sheet            */
/* -------------------------------------------- */

const enrich = async (html, relativeTo) => {
  if (!html) return "";
  try {
    return await foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
      relativeTo,
      rollData: relativeTo?.getRollData?.() ?? {},
      secrets: false
    });
  } catch (err) {
    console.warn(`${MODULE} | enrichment failed for ${relativeTo?.name}`, err);
    return "";
  }
};

/** Items that actually swing at somebody — the tier-25 source list. */
function attackItems(kind) {
  const out = [];
  for (const item of kind?.items ?? []) {
    const activities = item.system?.activities;
    if (!activities?.size) continue;
    if (![...activities].some(a => a?.type === "attack" || a?.type === "save")) continue;
    out.push(item);
  }
  return out;
}

/**
 * Tier 25, one line per attack.
 *
 * **The Monster Manual makes this one enrich call**, which the live probe of 2026-08-23
 * confirmed: MM attack descriptions are literally `[[/attack extended]]. [[/damage average
 * extended]].`, and enriching them *relative to the item* resolves them to "Melee Attack Roll:
 * +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage". Enriching without `relativeTo` leaves the
 * brackets standing, which `safeFlatten` then refuses — so a homebrew actor whose description
 * cannot be resolved falls back to **the item's name alone**, the fallback the plan says must
 * always work. Per item, not per creature: one unresolvable feature must not cost the other
 * four their numbers.
 */
async function attackLines(kind) {
  const lines = [];
  for (const item of attackItems(kind).slice(0, ATTACK_LINES_MAX)) {
    const text = safeFlatten(await enrich(item.system?.description?.value ?? "", item));
    lines.push(text ? `${item.name}: ${text}` : item.name);
  }
  return lines;
}

/**
 * Tier 20, one line — `traits.di/dr/dv/ci`, read from **`_source`** rather than the live sheet.
 *
 * ## Why the source and not the derived value
 *
 * `system.traits.di` is *derived* data: dnd5e folds Active Effects into it, so a creature holding
 * a magic cloak reads as immune to fire on the sheet. Studying a creature should tell you what it
 * **is**, not what it is currently carrying — Joe's rule: *"an NPC who has immunity with the aid
 * of an item won't be something inspection can see."* Reading the derived value let a study roll
 * X-ray someone's gear, which is a different game than reading their nature.
 *
 * Reproduced before changing it: a Shadow's innate `[necrotic, poison]` became
 * `[necrotic, poison, fire]` the moment a test cloak with a `system.traits.di.value` effect was
 * equipped, and the tier-20 line reported the fire immunity as if it were the creature's own.
 *
 * **`_source` is not too narrow, measured rather than assumed:** across 60 Monster Manual
 * creatures, **zero** had derived traits differing from source and **zero** granted traits through
 * an effect. Stat-block immunities live in the source data; only gear and conditions arrive later.
 * If a homebrew monster ever grants its own traits via a feature effect, this will under-report
 * it — and the fix then is to subtract *equipment*-sourced effects rather than to go back to the
 * derived value.
 */
function kindTraits(kind) {
  const labelFor = (key, table) => CONFIG.DND5E?.[table]?.[key]?.label ?? key;
  const list = (trait, table) => {
    const src = kind?._source?.system?.traits?.[trait] ?? kind?.system?.traits?.[trait];
    const values = [...(src?.value ?? [])].map(v => labelFor(v, table));
    const custom = String(src?.custom ?? "")
      .split(";")
      .map(s => s.trim())
      .filter(Boolean);
    return [...values, ...custom];
  };
  return traitsLine(
    {
      immune: list("di", "damageTypes"),
      resist: list("dr", "damageTypes"),
      vulnerable: list("dv", "damageTypes"),
      conditionImmune: list("ci", "conditionTypes")
    },
    {
      immune: t("known.study.trait.immune"),
      resist: t("known.study.trait.resist"),
      vulnerable: t("known.study.trait.vulnerable"),
      conditionImmune: t("known.study.trait.conditionImmune")
    }
  );
}

/**
 * The string the player is handed. **GM client only** — every alternative it did not choose
 * stays in this function's locals and never touches a socket.
 *
 * The description slot is the authored tier message for *exactly* this rung when one exists,
 * and the kind's flattened biography when it does not. That is the whole of "lower tiers may
 * lie": the authored text replaces the truth, and the derived text — read off the real sheet —
 * is what a kind with no authoring falls back to.
 */
export async function composeStudyPayload(kind, tier, skillLabel) {
  /*
   * ⚠ **Every rung does the same work, and the discards are the point.**
   *
   * The obvious shape is to skip the biography enrichment when an authored message exists and
   * skip the attack extraction below tier 25 — and that shape leaks the tier *on the clock*.
   * Measured on the GM's client before this was fixed: a tier-0 roll completed in 731 ms and a
   * tier-25 roll in 991 ms on the same kind, because the 25 paid for five `enrichHTML` calls
   * the 0 skipped. The player's stub card is posted after this function returns, so a quarter
   * of a second of extra silence *was* the number, readable by anyone patient enough to watch
   * the chat log twice. Decision 11's contract says any observable that varies by outcome is
   * the number; a timestamp is an observable.
   *
   * So the derivation runs in full every time and the tier only chooses what survives.
   */
  const derived = capProse(safeFlatten(await enrich(kind.system?.details?.biography?.value ?? "", kind)) ?? "");
  const attacks = await attackLines(kind);
  const traits = kindTraits(kind) || t("known.study.derived.noTraits");

  /*
   * ⚠ The derived description is gated at **15**, and it was not.
   *
   * Only traits (20) and attacks (25) were tier-gated, so a sub-15 roll — the rung whose entire
   * job is "you do not recognise it" — handed over the creature's **full Monster Manual entry**.
   * Found by running a real import through every rung: tier 0 and tier 15 came back byte-identical
   * on both monsters tested.
   *
   * The derivation still runs in full above (that is the timing-leak fix, and it must not be
   * undone); the tier only chooses what survives, which is what this line now actually does.
   *
   * An **authored** rung still wins at any tier — a GM who writes a tier-0 message is deliberately
   * saying something on a failure, which is the honest-miss idiom lore rows use.
   */
  const description =
    authoredTier(studyTiersOf(kind), tier) ||
    (tier >= 15 ? derived : "") ||
    t(tier > 0 ? "known.study.derived.none" : "known.study.derived.unknown");

  return composeReveal({ tier, header: f("known.study.header", { skill: skillLabel }), description, traits, attacks });
}

/* -------------------------------------------- */
/*  Player side                                 */
/* -------------------------------------------- */

/**
 * The module's own two-control dialog.
 *
 * ⚠ **dnd5e's own configuration dialog cannot be used here**, and the plan's decision 11 step
 * 2 ("the dnd5e dialog runs on the player's client") cannot be built as written: that dialog
 * is coupled to the roll pipeline it configures, and there is no supported way to run it
 * detached on a client that is not going to roll. Two controls is also the entire payload
 * contract — advantage mode and a situational bonus — so nothing is lost but the borrowed
 * furniture.
 */
async function studyDialog(kindName) {
  const modes = [
    ["normal", "known.study.mode.normal"],
    ["advantage", "known.study.mode.advantage"],
    ["disadvantage", "known.study.mode.disadvantage"]
  ]
    .map(
      ([value, key], i) =>
        `<label class="pt-study-mode"><input type="radio" name="mode" value="${value}"${
          i === 0 ? " checked" : ""
        }/> ${esc(t(key))}</label>`
    )
    .join("");

  return foundry.applications.api.DialogV2.prompt({
    window: { title: f("known.study.dialogTitle", { name: kindName }) },
    classes: ["pentaryn-tie-dialog"],
    content: `<div class="pt-study-dialog">
      <p class="pt-study-hint">${esc(t("known.study.dialogHint"))}</p>
      <div class="pt-study-modes">${modes}</div>
      <label class="pt-field">
        <span class="pt-field-label">${esc(t("known.study.situational"))}</span>
        <input type="number" name="situational" value="0" step="1"
               min="${SITUATIONAL_MIN}" max="${SITUATIONAL_MAX}" />
      </label>
    </div>`,
    ok: {
      label: t("known.study.roll"),
      callback: (event, button) => ({
        mode: button.form.elements.mode.value,
        situational: Number(button.form.elements.situational.value) || 0
      })
    },
    rejectClose: false
  });
}

/**
 * Ask a GM's client to study this creature's kind for this character.
 *
 * Returns `false` for every refusal — none of which is a spent roll. The one-roll lock only
 * ever engages on the GM's client, on a roll that actually evaluated.
 */
export async function requestStudy(character, subject) {
  const state = studyStateFor(character, subject);
  if (!state.available) {
    ui.notifications.warn(t(state.spent ? "known.study.notify.spent" : "known.study.notify.noContent"));
    return false;
  }
  return requestFact(character, subject, { ns: "kind" }, state.kind.name);
}

/**
 * Ask for one GM-authored fact about this individual — phase 4's player gesture.
 *
 * The affordance the player clicked already told them the row exists, its skill and its DC
 * (decision 8: *that a secret exists is the invitation*), so there is nothing here to hide.
 * What stays hidden is everything past the click: the total, the pass, and the text of both
 * the hit and the miss.
 */
export async function requestLore(character, subject, loreId) {
  const rows = loreStateFor(character, subject);
  const row = rows.find(r => r.id === loreId);
  if (!row) return false;
  if (!row.available) {
    ui.notifications.warn(t("known.lore.notify.spent"));
    return false;
  }
  return requestFact(character, subject, { ns: "lore", factId: loreId }, row.label);
}

/**
 * Ask for one fact the *group* knows — phase 6's player gesture.
 *
 * `subject` is the creature in front of them, not the attribute: reach is "can this player see
 * who they are asking about", and an attribute has no tokens. Studying the guild through a
 * guildsman standing there is the gesture, and it is also why the same guild fact can be
 * learned from any member.
 */
export async function requestAttrLore(character, subject, attrId, loreId) {
  const rows = attrLoreStateFor(character, subject, attrId);
  const row = rows.find(r => r.id === loreId);
  if (!row) return false;
  if (!row.available) {
    ui.notifications.warn(t("known.lore.notify.spent"));
    return false;
  }
  return requestFact(character, subject, { ns: "attr", attrId, factId: loreId }, row.label);
}

/**
 * One attribute's rows, as the player's sheet needs them.
 *
 * ⚠ The lock is on the **attribute fact**, not on this creature. Learning the guild's secret
 * from one rogue means you know it, so the row is spent on every other rogue too — which is
 * the entire point of putting the fact on the group, and the reason the grant is a sibling
 * map joined at render rather than a field on one page.
 */
export function attrLoreStateFor(character, subject, attrId) {
  if (!subject || !attrId) return [];
  const spent = studiedOf(character).lore;
  return rollableLore(attributeLore(attrId)).map(row => {
    const key = attrFactKey(attrId, row.id);
    return {
      id: row.id,
      attrId,
      label: row.label,
      dc: row.dc,
      skill: row.skill,
      skillLabel: CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill,
      spent: !!spent[key],
      available: !spent[key],
      gmOnline: !!game.users?.activeGM
    };
  });
}

/** Every attribute fact on offer for this pair, grouped by attribute — the sheet's list. */
export function attrOffersFor(character, subject) {
  const out = [];
  for (const id of attributeIdsOf(subject, kindActorOf)) {
    const rows = attrLoreStateFor(character, subject, id);
    if (!rows.length) continue;
    const entry = describeAttribute(id);
    out.push({ id, title: entry.title, icon: entry.icon, rows });
  }
  return out;
}

/**
 * The shared preamble — every check this module makes passes through here.
 *
 * Deliberately one function rather than one per namespace: the kill switch, the ownership
 * test, the no-GM refusal and the combat warning are policy, and policy that is copied is
 * policy that drifts. The only per-namespace part is which name goes in the dialog.
 */
async function requestFact(character, subject, spec, label) {
  if (!mayWrite()) return false; // the playerAccess kill switch, checked on both ends
  if (!character?.isOwner || !subject) return false;

  /*
   * No active GM, no roll — and nothing queues. A blind, arbitrated roll needs an arbiter;
   * dice must not fall while nobody is watching them. Same contract `requestMirror` uses.
   */
  if (!game.users?.activeGM) {
    ui.notifications.warn(t("known.study.notify.noGM"));
    return false;
  }

  /*
   * The combat warning, and it is a warning rather than an enforcement on purpose: dnd5e
   * 5.3.3 keeps no per-turn action ledger on the actor — activation costs live on items being
   * used, and Study is not an item here — so there is nothing to enforce against. The action
   * economy is the GM's table to run, as it always was.
   */
  if (game.combat?.started && character.inCombat) {
    const go = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("known.study.combatTitle") },
      content: `<p>${esc(f("known.study.combat", { name: character.name }))}</p>`
    });
    if (!go) return false;
  }

  const choice = await studyDialog(label);
  if (!choice) return false; // cancelled: NOT an attempt, and nothing is spent

  // ids only, plus the two bounded declarations. No claim, no text, no total.
  const payload = {
    action: STUDY,
    characterId: character.id,
    subjectId: subject.id,
    ns: spec.ns,
    factId: spec.factId ?? null,
    attrId: spec.attrId ?? null,
    mode: ["advantage", "disadvantage"].includes(choice.mode) ? choice.mode : "normal",
    situational: Math.max(SITUATIONAL_MIN, Math.min(SITUATIONAL_MAX, Math.round(Number(choice.situational) || 0)))
  };

  /*
   * ⚠ `game.socket.emit` does NOT loop back to the sender. A GM pressing this button on a
   * player's sheet — which they can, because a GM owns every actor — would otherwise send a
   * request into a room where the only listener is themselves, and get silence. So the GM
   * calls the handler directly, with their own id as the sender: the same validation, the same
   * writes, one hop shorter. It is also how the whole conduit can be exercised without a
   * second browser.
   */
  if (game.user?.isGM) return applyStudy(payload, game.user.id);

  // No sender id on the wire: the server stamps the authenticated one on for us.
  game.socket.emit(CHANNEL, payload);
  return true;
}

/**
 * The individual's rows as the player's sheet needs them: label, skill, DC, and whether the
 * one attempt is still there.
 *
 * ⚠ `spent` reads the player's own `studied` flag and is a **UI hint, not the lock** — same
 * split as `studyStateFor`. The handler refuses off the belief ledger, on a document no player
 * can write. Never re-derive a refusal from this.
 */
export function loreStateFor(character, subject) {
  if (!subject) return [];
  const spent = studiedOf(character).lore;
  return rollableLore(flagOf(subject, LORE_FLAG)).map(row => {
    const key = loreFactKey(subject.id, row.id);
    return {
      id: row.id,
      label: row.label,
      dc: row.dc,
      skill: row.skill,
      skillLabel: CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill,
      spent: !!spent[key],
      available: !spent[key],
      gmOnline: !!game.users?.activeGM
    };
  });
}

/* -------------------------------------------- */
/*  GM side                                     */
/* -------------------------------------------- */


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
async function throwBlind(character, fact, { mode, situational, silent = false } = {}) {
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
          rollMode: CONST.DICE_ROLL_MODES.BLIND,
          data: {
            flavor: f("known.study.rollFlavor", { name: fact.name, skill: fact.skillLabel }),
            flags: { "dice-so-nice": { suppressRollDiceSoNice: true } }
          }
        }
  );
  return rolls?.[0] ?? null;
}

/** GM side: validate hard, re-read everything, roll, grade, write. One path, every namespace. */
async function applyStudy(payload, senderId) {
  const user = game.users?.get(senderId);
  const character = game.actors?.get(payload?.characterId);
  const refuse = why => {
    console.warn(`${MODULE} | study refused: ${why}`);
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

  // stake the row before rolling — two GM sessions of one account are both `activeGM`
  if (!(await claimFact(fact, character.id, Date.now())))
    return refuse(`another GM session is already rolling ${character.name} on ${fact.name}`);

  const situational = Math.max(
    SITUATIONAL_MIN,
    Math.min(SITUATIONAL_MAX, Math.round(Number(payload?.situational) || 0))
  );

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
   *  · `message.rollMode = "blindroll"` — core stamps `blind: true` and whispers the card to
   *    GMs; `isContentVisible` is false for every non-GM, so core replaces the flavor with
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
    : await throwBlind(character, fact, { mode, situational, silent: fact.silentRoll === true });
  const graded = await fact.grade(roll?.total ?? null);
  // null = no roll evaluated. NOT a failure, and nothing below this line may run — including
  // the claim, which must be handed back or the roll is stranded on a mishap.
  if (!graded) {
    await releaseFact(fact, character.id);
    return refuse(`${character.name}'s roll on ${fact.name} produced nothing`);
  }

  const now = Date.now();
  const hold = fact.hold;

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
    sources
  });
  await applyPlayerWrites(character, fact, hold ? null : graded, now);
  await postStub(character, fact.subject);

  if (hold) await promptDeliver(character, fact);
  else ui.notifications.info(f("known.study.notify.delivered", { character: character.name, kind: fact.name }));
  return true;
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
/**
 * Read one belief row, whichever plane it lives on.
 *
 * `kind:` and `lore:` records sit in a flag on a document; `attr:` records sit in a world
 * setting, because an attribute is not a document. Every caller goes through here so the
 * difference is stated once instead of at each of the seven call sites that would otherwise
 * have to know.
 */
function readBelief(fact, characterId) {
  if (fact.ns === "attr") {
    try {
      return readAttrBeliefs(game.settings.get(MODULE, ATTR_BELIEFS_SETTING))[`${fact.factKey}:${characterId}`] ?? null;
    } catch {
      return null;
    }
  }
  return beliefsOf(fact.ledger)[characterId]?.[fact.beliefKey] ?? null;
}

/** Write or clear one belief row. `record: null` deletes it — the reset path. */
async function putBelief(fact, characterId, record) {
  if (fact.ns !== "attr") {
    if (record === null) {
      const all = flagOf(fact.ledger, BELIEFS_FLAG) ?? {};
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
   * different rows in the same instant would clobber each other. The claim protocol below
   * already serialises rolls per character-and-fact, which is the only concurrency this
   * ledger actually sees — a GM hand-editing the registry at the same moment is a person, not
   * a race.
   */
  if (!game.user?.isGM) return;
  const key = `${fact.factKey}:${characterId}`;
  const all = readAttrBeliefs(game.settings.get(MODULE, ATTR_BELIEFS_SETTING));
  if (record === null) delete all[key];
  else
    all[key] = {
      text: record.text ?? "",
      tier: null,
      total: record.total ?? null,
      when: record.when ?? 0,
      delivered: record.delivered ?? null,
      claim: record.claim ?? null,
      sources: record.sources ?? null
    };
  await game.settings.set(MODULE, ATTR_BELIEFS_SETTING, all);
}

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
        sources: record.sources ?? null
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
async function applyPlayerWrites(character, fact, graded, now) {
  const studied = studiedOf(character);
  studied[fact.axis][fact.lockKey] = { when: now };
  const update = { [`flags.${MODULE}.${STUDIED_FLAG}`]: studied };

  /*
   * `graded` is null for a held roll: write the lock alone now, and the reveal lands here from
   * `deliver` later. `graded.silent` is the other empty case and a different one — the roll
   * resolved, but the GM authored nothing on the side it landed on (decision 8's amendment).
   * Both write the lock and both let the stub post; only the grant is skipped, so what the
   * player observes differs in prose and never in whether a card appeared.
   */
  if (graded && !graded.silent && graded.text) {
    /*
     * Which entry does this fact file under? The only place the namespaces disagree about
     * anything player-facing, and it is one line each:
     *
     *   kind:  the KIND's page — the bestiary entry every goblin shares
     *   lore:  the INDIVIDUAL's page — this is the axis that answers "who is this one"
     */
    const entryActor = fact.ns === "kind" ? fact.ledger : fact.subject;
    const rawKnown = flagOf(character, KNOWN_FLAG);
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
    update[`flags.${MODULE}.${KNOWN_FLAG}`] = toStoredKnown(list);

    /*
     * The reveal lands in the sibling `granted` map, NOT in `entry.notes` (decision 22).
     *
     * `notes` is the player's own prose and the notes autosave rewrites it on a 700ms timer,
     * round-tripping the entry through `toStoredKnown`. Anything the GM hands over that lived
     * in that field would be editable by the player — which the design forbids — and, worse,
     * erasable by their next keystroke. Keyed by fact, so a reset + re-roll REPLACES under the
     * same key rather than appending a second copy.
     */
    const granted = readGranted(flagOf(character, GRANTED_FLAG));
    granted[fact.factKey] = {
      text: String(graded.text).slice(0, GRANTED_TEXT_MAX),
      when: now,
      icon: fact.img,
      // the provenance line: the kind's name for a bestiary fact, the row's label for a lore
      // fact — which is what makes several lore grants on one page readable as separate facts
      source: fact.name
    };
    update[`flags.${MODULE}.${GRANTED_FLAG}`] = granted;
  }

  await character.update(update);
  return true;
}

/**
 * The public stub — "a check was made, and about whom". Nothing else.
 *
 * Posted at **roll time in every case**, held or not, passed or failed. It is the one thing
 * the player is guaranteed to observe, and making it conditional on anything at all would
 * turn its presence into the answer.
 */
async function postStub(character, subject) {
  await ChatMessage.create({
    content: `<p class="pt-study-stub">${esc(f("known.study.stub", { character: character.name, subject: subject.name }))}</p>`,
    speaker: ChatMessage.getSpeaker({ actor: character })
  });
}

/* -------------------------------------------- */
/*  The approval gate                           */
/* -------------------------------------------- */

/**
 * Deliver / Later — **and there is no Deny.**
 *
 * Approval is a *timing* control, not a veto: the check passed and denying it would confiscate
 * a success the dice already granted. The honest do-over is `reset`, which un-spends the lock
 * and un-writes the belief in the open, rather than a button that quietly eats a pass.
 *
 * The prompt is a convenience, not the store. "Later" just closes it: the row stays pending in
 * the ledger and is deliverable from the console (and, when phase 4's Beliefs section lands,
 * from the sheet) a week from now.
 */
async function promptDeliver(character, fact) {
  const rec = readBelief(fact, character.id);
  if (!rec || rec.delivered) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("known.study.holdTitle") },
    content:
      `<p>${esc(f("known.study.holdWho", { character: character.name, subject: fact.subject?.name ?? fact.name }))}</p>` +
      `<p class="pt-study-hold-meta">${esc(
        fact.ns === "lore"
          ? f("known.study.holdMetaLore", { fact: fact.name, dc: fact.dc, total: rec.total })
          : f("known.study.holdMeta", { tier: rec.tier, total: rec.total })
      )}</p>` +
      // a silent outcome has no prose to preview — say so, or the GM reads an empty box as a bug
      `<div class="pt-study-hold-text">${
        rec.text.trim() ? esc(rec.text) : `<em>${esc(t("known.study.holdSilent"))}</em>`
      }</div>`,
    yes: { label: t("known.study.deliver") },
    no: { label: t("known.study.later") }
  });
  if (ok) await deliverFact(fact, character);
}

/**
 * Release a pending reveal. Idempotent: an already-delivered row is left alone.
 *
 * ⚠ The parked payload is replayed from the ledger, never recomputed. Re-running `grade` here
 * would re-read the authored text — so a GM who edited a lore row between the roll and the
 * Deliver would hand over prose the dice never bought. The ledger row IS the record of what
 * was said (decision 12), and this is the function that has to believe it.
 */
async function deliverFact(fact, character) {
  const rec = readBelief(fact, character?.id);
  if (!rec) {
    ui.notifications.warn(
      f("known.study.notify.noPending", { character: character?.name ?? "?", kind: fact.name })
    );
    return false;
  }
  if (rec.delivered) return false;
  const now = Date.now();
  const silent = !String(rec.text ?? "").trim();
  if (!(await applyPlayerWrites(character, fact, { text: rec.text, silent, tier: rec.tier }, now))) return false;
  await putBelief(fact, character.id, { ...rec, delivered: now, claim: null });
  ui.notifications.info(f("known.study.notify.delivered", { character: character.name, kind: fact.name }));
  return true;
}

/**
 * Resolve the three public shapes onto one descriptor:
 *   `(character, subject)`                 → the kind ladder
 *   `(character, subject, loreId)`          → a lore row on that individual
 *   `(character, subject, loreId, attrId)`  → an attribute fact, learned through that subject
 */
const factFrom = (subject, loreId, attrId) =>
  resolveFact(
    attrId
      ? { ns: "attr", subjectId: subject?.id, factId: loreId, attrId }
      : loreId
        ? { ns: "lore", subjectId: subject?.id, factId: loreId }
        : { ns: "kind", subjectId: subject?.id }
  );

export async function deliver(character, subject, loreId = null, attrId = null) {
  if (!game.user?.isGM) return false;
  const fact = factFrom(subject, loreId, attrId);
  if (!fact) return false;
  return deliverFact(fact, character);
}

/**
 * Every undelivered row in the world — the GM's nag surface.
 *
 * Walks both namespaces off the ledger's own keys rather than a list of things to check, so
 * the attribute phase's rows appear here the moment they can be written, with no edit.
 */
export function pending() {
  if (!game.user?.isGM) return [];
  const out = [];
  for (const ledger of game.actors?.contents ?? []) {
    for (const [characterId, facts] of Object.entries(beliefsOf(ledger))) {
      for (const [beliefKey, rec] of Object.entries(facts)) {
        if (!rec || rec.delivered) continue;
        const parsed = beliefKey === KIND_KEY ? { ns: "kind", fact: KIND_KEY } : parseFactKey(beliefKey);
        if (!parsed) continue; // an unrecognised key is not a pending anything
        const label =
          parsed.ns === "lore"
            ? readLore(flagOf(ledger, LORE_FLAG)).find(r => r.id === parsed.fact)?.label ?? parsed.fact
            : ledger.name;
        out.push({
          ns: parsed.ns,
          character: game.actors.get(characterId)?.name ?? characterId,
          characterId,
          subject: ledger.name,
          subjectId: ledger.id,
          beliefKey,
          fact: label,
          factId: parsed.fact,
          tier: rec.tier,
          total: rec.total,
          when: new Date(rec.when).toLocaleString(),
          text: rec.text
        });
      }
    }
  }
  // ── the attribute plane, which is a setting rather than any document ──
  let attrLedger = {};
  try {
    attrLedger = readAttrBeliefs(game.settings.get(MODULE, ATTR_BELIEFS_SETTING));
  } catch {
    attrLedger = {};
  }
  for (const [key, rec] of Object.entries(attrLedger)) {
    if (!rec || rec.delivered || rec.claim) continue; // a bare claim is a roll in flight, not a pending reveal
    /*
     * `attr:<attrId>:<loreId>:<characterId>`, parsed by the shared grammar.
     *
     * ⚠ This was a `split(":")` with a `length !== 4` guard, and the comment above it claimed a
     * right-to-left parse the code did not do. An authored derived-namespace attribute
     * (`species:human`) produces five segments, so every pending reveal on one was silently
     * dropped from the GM's nag surface — a held reveal that can never be found is a stranded
     * roll, which is the failure the claim protocol exists to prevent.
     */
    const parsed = parseLedgerKey(key);
    if (!parsed || parsed.ns !== "attr") continue;
    const { subject: attrId, fact: loreId, characterId } = parsed;
    const entry = describeAttribute(attrId);
    out.push({
      ns: "attr",
      character: game.actors.get(characterId)?.name ?? characterId,
      characterId,
      subject: entry.title,
      subjectId: null,
      attrId,
      beliefKey: attrFactKey(attrId, loreId),
      fact: rollableLore(attributeLore(attrId)).find(r => r.id === loreId)?.label ?? loreId,
      factId: loreId,
      tier: null,
      total: rec.total,
      when: new Date(rec.when).toLocaleString(),
      text: rec.text
    });
  }

  return out;
}

/**
 * The release valve (decision 5) — un-spend one fact for one character.
 *
 * Both halves, or it is not a reset: the belief row is the lock, and the `studied` hint is
 * what draws the affordance. Clearing one and not the other leaves either a roll nobody can
 * ask for or an affordance whose click is refused — and the second is worse, because the
 * refusal is a message a plain failure would never produce.
 */
export async function reset(character, subject, loreId = null, attrId = null) {
  if (!game.user?.isGM) return false;
  const fact = factFrom(subject, loreId, attrId);
  if (!character || !fact) return false;

  await putBelief(fact, character.id, null);
  if (studiedOf(character)[fact.axis][fact.lockKey]) {
    await character.update({ [`flags.${MODULE}.${STUDIED_FLAG}.${fact.axis}.-=${fact.lockKey}`]: null });
  }
  /*
   * Nothing already in their notebook is removed — not their notes, and not the grant.
   * **Decision 22**, ruled by Joe after the granted-region rework made revoking possible for
   * the first time: notes and discoveries are two separate things now, so a reset has nothing
   * to protect and nothing to take back. A reset means *roll again*; the re-roll replaces the
   * grant under its own key, so nothing duplicates and nothing stale survives.
   */
  ui.notifications.info(f("known.study.notify.reset", { character: character.name, kind: fact.name }));
  return true;
}

/* -------------------------------------------- */
/*  GM authoring — minimal, absorbed by phase 4 */
/* -------------------------------------------- */

/**
 * The minimal kind-pointer picker.
 *
 * Phase 4's GM section on the NPC's ties tab absorbs this; until then it is one dropdown in a
 * dialog, opened from the console or from the GM-only control on a Known row. Minimal is the
 * whole specification: a pointer is a world-actor id and the only hard part is not letting it
 * be free text (decision 4 — a text key has no stat source for the ladder to read).
 */
export async function kindDialog(actor) {
  if (!game.user?.isGM || !actor) return false;
  const current = flagOf(actor, KIND_OF_FLAG) ?? "";
  const options = (game.actors?.contents ?? [])
    .filter(a => a.id !== actor.id && a.type !== "character")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(a => `<option value="${esc(a.id)}"${a.id === current ? " selected" : ""}>${esc(a.name)}</option>`)
    .join("");

  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: f("known.study.kindTitle", { name: actor.name }) },
    classes: ["pentaryn-tie-dialog"],
    content: `<div class="pt-known-picker">
      <p class="pt-study-hint">${esc(t("known.study.kindHint"))}</p>
      <label class="pt-field">
        <span class="pt-field-label">${esc(t("known.study.kindLabel"))}</span>
        <select name="kind">
          <option value="">${esc(t("known.study.kindSelf"))}</option>
          ${options}
        </select>
      </label>
    </div>`,
    ok: { label: t("known.study.kindSave"), callback: (event, button) => button.form.elements.kind.value ?? "" },
    rejectClose: false
  });
  if (chosen === null || chosen === undefined) return false;
  await setKindOf(actor, chosen);
  return true;
}

export async function setKindOf(actor, kindId) {
  if (!game.user?.isGM || !actor) return false;
  const id = String(kindId ?? "").trim();
  if (!id || id === actor.id) await actor.unsetFlag(MODULE, KIND_OF_FLAG);
  else if (!game.actors?.get(id)) {
    ui.notifications.warn(t("known.study.notify.noKind"));
    return false;
  } else await actor.setFlag(MODULE, KIND_OF_FLAG, id);
  return true;
}

/**
 * Author the tier messages. Console-only in phase 3, by the plan's own correction — the
 * authoring *surface* is phase 4's GM section, and phase 3 needs authored tiers to test
 * falsity with.
 *
 *   game.pentaryn.ties.study.setTiers(actor, [{ min: 25, text: "…" }, { min: 0, text: "…" }])
 */
export async function setStudyTiers(actor, tiers) {
  if (!game.user?.isGM || !actor) return false;
  const clean = readStudyTiers(tiers);
  if (!clean.length) await actor.unsetFlag(MODULE, STUDY_TIERS_FLAG);
  else await actor.setFlag(MODULE, STUDY_TIERS_FLAG, clean);
  return clean;
}

/**
 * Set a kind's difficulty: a number to shift the whole ladder, `"auto"` for free, `0` to clear.
 *
 * A chicken is `"auto"`. A god is `+20`. Everything else is probably nothing at all — the default
 * ladder exists so a GM never has to think about this unless one creature deserves it.
 */
export async function setStudyOffset(kind, offset) {
  if (!game.user?.isGM || !kind) return false;
  const clean = studyOffsetOf(offset);
  if (clean === 0) await kind.unsetFlag(MODULE, STUDY_OFFSET_FLAG);
  else await kind.setFlag(MODULE, STUDY_OFFSET_FLAG, clean);
  return clean;
}

/** Per-kind approval gate: `true` hold, `false` auto, `null`/undefined inherit the setting. */
export async function setStudyHold(actor, hold) {
  if (!game.user?.isGM || !actor) return false;
  if (hold === null || hold === undefined) await actor.unsetFlag(MODULE, STUDY_HOLD_FLAG);
  else await actor.setFlag(MODULE, STUDY_HOLD_FLAG, hold === true);
  return studyHoldFor(actor);
}

/** What each character believes about this kind — the GM's memory, gated like `inbound()`. */
export function beliefs(actor) {
  if (game.user?.isGM !== true) return [];
  const out = [];
  // both ledgers this actor can hold: the kind rows it collects as somebody's kind, and the
  // lore rows it collects as itself. An NPC that is its own kind holds both on one document.
  const rows = readLore(flagOf(actor, LORE_FLAG));
  for (const ledger of new Set([kindActorOf(actor), actor].filter(Boolean))) {
    for (const [characterId, facts] of Object.entries(beliefsOf(ledger))) {
      for (const [beliefKey, rec] of Object.entries(facts)) {
        if (!rec) continue;
        const parsed = beliefKey === KIND_KEY ? { ns: "kind", fact: KIND_KEY } : parseFactKey(beliefKey);
        if (!parsed) continue;
        // a kind row belongs to the kind ledger, a lore row to this actor — never cross them,
        // or an NPC pointing at Goblin would list every other goblin-studier's rows as its own
        if (parsed.ns === "kind" && ledger.id !== kindActorOf(actor)?.id) continue;
        if (parsed.ns !== "kind" && ledger.id !== actor.id) continue;
        out.push({
          ns: parsed.ns,
          factId: parsed.fact,
          fact: parsed.ns === "kind" ? ledger.name : rows.find(r => r.id === parsed.fact)?.label ?? parsed.fact,
          character: game.actors?.get(characterId)?.name ?? characterId,
          characterId,
          tier: rec.tier,
          total: rec.total,
          when: new Date(rec.when).toLocaleString(),
          delivered: rec.delivered ? new Date(rec.delivered).toLocaleString() : null,
          pending: !rec.delivered,
          text: rec.text
        });
      }
    }
  }
  return out.sort((a, b) => Number(b.pending) - Number(a.pending) || a.character.localeCompare(b.character));
}

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
  if (!mayWrite()) return false;
  if (!character?.isOwner || !subject) return false;
  if (!game.users?.activeGM) {
    ui.notifications.warn(t("known.study.notify.noGM"));
    return false;
  }
  if (!combatAllows(character)) return false;

  /*
   * ⚠ The stub is posted HERE, by the client that made the gesture — not by the GM handler.
   *
   * Found by playtesting: two identical stubs at the same timestamp. `isApplyingGM()` tests
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
  game.socket.emit(CHANNEL, payload);
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
function combatAllows(character) {
  if (!game.combat?.started || !character.inCombat) return true;
  const combatant = game.combat.combatants.find(c => c.actorId === character.id);
  if (!combatant) return true;
  const key = `${game.combat.id}:${game.combat.round}:${combatant.id}`;
  if (inspected.has(key)) {
    ui.notifications.warn(t("known.inspect.spentThisRound"));
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
async function applyInspect(payload, senderId, { postStubCard = false } = {}) {
  const user = game.users?.get(senderId);
  const character = game.actors?.get(payload?.characterId);
  const subject = game.actors?.get(payload?.subjectId);
  const refuse = why => {
    console.warn(`${MODULE} | inspect refused: ${why}`);
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

  for (let guard = 0; guard < 24; guard++) {
    const step = planStep({
      registry: reg(),
      carried: attributeIdsOf(subject, kindActorOf),
      knowledge: knowledge(),
      beliefs: flagOf(subject, BELIEFS_FLAG) ?? {},
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

    const text = pass ? entry.reveal : entry.miss;
    // the backfill: one roll settles both stages, and a failure closes stage 1 for good
    if (step.backfill)
      await setKnowledge([
        // pending while held: the lock is spent (they rolled) but the answer is not theirs yet
        { characterId: character.id, attrId, failed: !pass, via: "roll", when: now, pending: pass && hold }
      ]);
    await writeIdentification(subject, character.id, attrId, {
      text: pass ? text : "",
      total,
      when: now,
      delivered: hold ? null : now
    });
    if (pass && !hold && text.trim()) grants[`attr:${attrId}:${MEMBER_FACT}`] = { text, when: now, icon: entry.icon, source: entry.title };

    if (!pass) break; // a failed rung blocks everything beneath it
    if (hold) {
      held = true;
      break; // suspends the climb; the GM's Deliver resumes it by calling back in
    }
  }

  await commitGrants(character, grants);
  if (held) await promptCascadeDeliver(character, subject);
  return true;
}

/** One identification row, at its own path so nobody else's record is in the payload. */
async function writeIdentification(subject, characterId, attrId, rec) {
  await subject.update(
    {
      [`flags.${MODULE}.${BELIEFS_FLAG}.${characterId}.${identifiedKey(attrId)}`]: {
        text: rec.text ?? "",
        tier: null,
        total: rec.total ?? null,
        when: rec.when ?? 0,
        delivered: rec.delivered ?? null,
        claim: null,
        sources: null
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
  const merged = readGranted(flagOf(character, GRANTED_FLAG));
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
  const mine = (flagOf(subject, BELIEFS_FLAG) ?? {})[character.id] ?? {};
  const waiting = Object.entries(mine)
    .filter(([key, rec]) => key.endsWith(`:${MEMBER_FACT}`) && rec && !rec.delivered)
    .map(([key, rec]) => ({ attrId: parseFactKey(key)?.subject, rec }))
    .filter(x => x.attrId);
  if (!waiting.length) return;

  const rows = waiting
    .map(({ attrId, rec }) => {
      const entry = describeAttribute(attrId);
      const passed = !!String(rec.text ?? "").trim();
      return `<li class="pt-belief${passed ? "" : " pt-belief-miss"}">
        <div class="pt-belief-head">
          <span class="pt-belief-who">${esc(entry.title)}</span>
          <span class="pt-belief-meta">${esc(
            f("known.inspect.holdMeta", { total: rec.total ?? "—", dc: entry.dc })
          )}</span>
        </div>
        <div class="pt-belief-text">${
          passed ? esc(rec.text) : `<em>${esc(t("known.study.holdSilent"))}</em>`
        }</div>
      </li>`;
    })
    .join("");

  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("known.study.holdTitle") },
    content:
      `<p>${esc(f("known.inspect.holdWho", { character: character.name, subject: subject.name }))}</p>` +
      `<ul class="pt-list pt-belief-list pentaryn-ties">${rows}</ul>`,
    yes: { label: t("known.study.deliver") },
    no: { label: t("known.study.later") }
  });
  if (!ok) return;
  await deliverHeldIdentifications(character, subject);
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
  const all = flagOf(subject, BELIEFS_FLAG) ?? {};
  const mine = all[character.id] ?? {};
  const now = Date.now();
  const update = {};
  const granted = readGranted(flagOf(character, GRANTED_FLAG));
  const freed = [];
  let any = false;

  for (const [key, rec] of Object.entries(mine)) {
    if (rec?.delivered || !key.endsWith(`:${MEMBER_FACT}`)) continue;
    update[`flags.${MODULE}.${BELIEFS_FLAG}.${character.id}.${key}.delivered`] = now;
    if (String(rec.text ?? "").trim()) {
      const attrId = parseFactKey(key)?.subject;
      const entry = attrId ? describeAttribute(attrId) : null;
      granted[key] = { text: rec.text, when: now, icon: entry?.icon ?? null, source: entry?.title ?? "" };
      if (attrId) freed.push(attrId);
    }
    any = true;
  }
  if (!any) return false;
  await subject.update(update, { render: false });
  await character.update({ [`flags.${MODULE}.${GRANTED_FLAG}`]: granted });
  // the knowledge those rungs bought stops being pending the moment the GM releases them
  if (freed.length) {
    const rows = knowledge()[character.id] ?? {};
    await setKnowledge(freed.map(attrId => ({ ...(rows[attrId] ?? {}), characterId: character.id, attrId, pending: false })));
  }
  // resume: the ledgers changed, so the planner will now return the next rung
  return guardedCascade(character, subject);
}

/** Concealment: raises the DC without ever appearing in the printed one. */
const concealmentFor = (subject, attrId) => {
  try {
    const raw = subject?.getFlag(MODULE, "conceal");
    if (typeof raw === "number") return Math.max(0, Math.min(20, Math.round(raw)));
    return Math.max(0, Math.min(20, Math.round(Number(raw?.[attrId] ?? raw?.default ?? 0) || 0)));
  } catch {
    return 0;
  }
};

const inspectSession = () => `${game.user?.id ?? "?"}:${INSPECT_SESSION}`;
const INSPECT_SESSION = foundry.utils.randomID();

async function claimInspect(subject, characterId) {
  const mine = inspectSession();
  await subject.update({ [`flags.${MODULE}.${BELIEFS_FLAG}.${characterId}.#inspect`]: { claim: mine } }, { render: false });
  await new Promise(r => setTimeout(r, 250));
  // return the TOKEN on success, so the caller can release exactly what it took
  return flagOf(subject, BELIEFS_FLAG)?.[characterId]?.["#inspect"]?.claim === mine ? mine : null;
}

async function releaseInspect(subject, characterId, token = null) {
  const all = flagOf(subject, BELIEFS_FLAG) ?? {};
  const mine = token ?? inspectSession();
  if (all?.[characterId]?.["#inspect"]?.claim !== mine) return;

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
  const others = Object.keys(all[characterId] ?? {}).filter(k => k !== "#inspect");
  const rest = Object.keys(all).filter(k => k !== characterId);
  if (!others.length && !rest.length) {
    await subject.unsetFlag(MODULE, BELIEFS_FLAG);
    return;
  }
  await subject.update(dropRow(`flags.${MODULE}.${BELIEFS_FLAG}`, characterId, "#inspect", all[characterId]), {
    render: false
  });
}

/* -------------------------------------------- */
/*  The tempo tell — scoping a crowd shows      */
/* -------------------------------------------- */

/**
 * How obvious is it that this character is working the room?
 *
 * Joe's rule, and it is roleplay furniture rather than a mechanic: inspect two people and nobody
 * notices; by the third you are visibly studying the room; by the fifth you are sweeping it; by
 * the tenth you look paranoid. **Moving resets it** — *"if they look, move, look, move, they don't
 * announce they are scoping people, which is how people do that in real life."*
 *
 * ## What this deliberately is NOT
 *
 * It is **not** a limit, a cost, or a check. Nothing is refused and no roll is modified. It is a
 * bubble the table can see, so the GM knows to have the room react — and a player who says *"I'm
 * being careful about it"* can be told to roll, or simply believed. The rule teaches itself: after
 * one bubble, players start moving between looks, which is the behaviour it is modelling.
 *
 * ⚠ It reveals **tempo, never outcome.** The count rises identically whether an inspection found
 * a guild membership or nothing at all, so it cannot become the tell the rest of the design works
 * to close. That is the property to preserve if this is ever changed.
 */
/*
 * The rungs, and they start EARLY on purpose.
 *
 * The first line lands on the **second** look — before anyone has done anything wrong — because
 * its job is to teach the rule, not to punish it. A player who reads it once starts moving between
 * looks, which is the behaviour the whole thing models. By the time the later lines fire they have
 * already been told twice.
 *
 * Keys are named for their count rather than numbered 1-2-3, so changing a threshold cannot leave
 * the strings quietly describing the wrong rung.
 */
const SCOPE_STEPS = [
  { at: 2, key: "known.inspect.scope2" },
  { at: 3, key: "known.inspect.scope3" },
  { at: 5, key: "known.inspect.scope5" },
  { at: 6, key: "known.inspect.scope6" }
];

/** Feet of movement that reads as "they moved on" and clears the count. */
const SCOPE_RESET_FEET = 15;

const scoping = new Map();

/** Clear the "standing here looking at people" run — a scene change should not carry it over. */
export const clearScoping = characterId => (characterId ? scoping.delete(characterId) : scoping.clear());

/** What the tempo counter currently believes, for a GM who wants to see it. */
export const scopingState = characterId =>
  characterId ? scoping.get(characterId) ?? null : Object.fromEntries(scoping);

/**
 * Count this look, and return the line to say — or null.
 *
 * The anchor is the position where the current run of looking began, not the previous look, so
 * drifting a foot at a time across a room still counts as standing there working it.
 */
function scopeTell(character, token) {
  if (!token) return null;
  const prev = scoping.get(character.id);
  /*
   * ⚠ `token.document.x`, never `token.x`.
   *
   * A Token placeable inherits `x`/`y` from PIXI's DisplayObject, where they are the local
   * transform — measured live as **0** while the document sat at 995. The logical grid position
   * is only ever on the document. An anchor built from `token.x` therefore compares 0 to 0
   * forever and the movement reset silently never fires.
   *
   * Exactly the family of mistake as `Token#visible` (the inherited PIXI flag, true for every
   * placeable) versus `Token#isVisible` (the real test), which bit this module once already.
   */
  const here = { x: token.document.x, y: token.document.y };
  const scene = token.document.parent ?? canvas?.scene;
  const gridDistance = scene?.grid?.distance ?? 5;
  const gridSize = scene?.grid?.size ?? 100;

  let count = 1;
  if (prev && prev.sceneId === scene?.id) {
    const dx = here.x - prev.anchor.x;
    const dy = here.y - prev.anchor.y;
    const feet = (Math.hypot(dx, dy) / gridSize) * gridDistance;
    if (feet <= SCOPE_RESET_FEET) count = prev.count + 1;
  }
  scoping.set(character.id, { count, anchor: count === 1 ? here : prev.anchor, sceneId: scene?.id });

  // exact thresholds only — the line should land once, not every look after three
  return SCOPE_STEPS.find(s => s.at === count)?.key ?? null;
}

/**
 * Say it over the token, on every client.
 *
 * A chat bubble is client-local, so the GM's own `canvas.hud.bubbles` would show it to the GM
 * alone — and the whole point is that the table sees someone working the room. Broadcast, then
 * render locally too, since `emit` does not loop back to the sender.
 */
function broadcastBubble(tokenId, sceneId, text) {
  const payload = { action: BUBBLE, tokenId, sceneId, text };
  game.socket.emit(CHANNEL, payload);
  showBubble(payload);
}

/**
 * Count this look and say the line if it crosses a threshold.
 *
 * ⚠ Runs on the **gesturing** client, beside the stub, for the same reason: `isApplyingGM()` is
 * true on every GM client signed in on the account, so running it in the handler both duplicated
 * the bubble and **double-counted the run** — thresholds would have fired at half the looks they
 * describe. The counter belongs to the person doing the looking.
 */
async function announceTempo(character) {
  const own = canvas?.tokens?.placeables?.find(tk => tk.document.actorId === character.id);
  if (!own) return;
  const line = scopeTell(character, own);
  if (!line) return;
  const text = f(line, { name: character.name });

  broadcastBubble(own.id, canvas.scene?.id, text);

  /*
   * ...and a chat line, because the bubble is a glance and the chat is the record. Joe wants this
   * impossible to miss by him or the table, and five seconds over a token is missable if you were
   * looking at your sheet.
   *
   * Posted from the **gesturing** client, exactly once — the same rule the stub follows, and for
   * the same reason: `isApplyingGM()` is true on every GM client on the account, so posting it in
   * the handler would duplicate it once per open GM session.
   *
   * `EMOTE` style so it renders as a description rather than as something the character said.
   */
  await ChatMessage.create({
    content: `<p class="pt-tempo-line">${esc(text)}</p>`,
    style: CONST.CHAT_MESSAGE_STYLES.EMOTE,
    speaker: ChatMessage.getSpeaker({ actor: character })
  });
}

/** How long the tell stays over their head. Long enough that nobody at the table misses it. */
const SCOPE_BUBBLE_MS = 5000;

/**
 * Render the tell over a token — **this module's own bubble, not `ChatBubbles#say`.**
 *
 * Two reasons core's bubble could not be used, and the second is the one that decided it:
 *
 *  1. **Its lifetime is word-count.** `#getDuration` computes `words × 200 ms` clamped to
 *     1–20 s, so these deliberately terse lines got ~2 s. Padding the copy to buy seconds is
 *     the wrong lever.
 *  2. **It is gated on a core setting.** `say()` returns `null` outright when
 *     `core.chatBubbles` is off — so a table that disabled speech bubbles would lose this
 *     warning silently, with nothing in the code saying why.
 *
 * Placement mirrors core's own math (`#chat-bubbles` is canvas-transformed, so token document
 * coordinates are the right space) and the `chat-bubble` class is reused, so it inherits the
 * table's own speech-bubble look and stays consistent with everything else on the canvas.
 */
function showBubble({ tokenId, sceneId, text }) {
  try {
    if (canvas?.scene?.id !== sceneId) return;
    const token = canvas.tokens?.get(tokenId);
    const container = document.getElementById("chat-bubbles");
    if (!token || !container) return;

    // one tell per token at a time — a fast second look replaces the first rather than stacking
    container.querySelector(`.pt-tempo[data-pt-token="${tokenId}"]`)?.remove();

    const el = document.createElement("div");
    el.className = "chat-bubble pt-tempo";
    el.dataset.ptToken = tokenId;
    el.textContent = text; // never innerHTML: this string is composed from a character's name
    container.appendChild(el);

    // measure in the container's own (untransformed) space, then place as core does
    const ui = canvas.dimensions?.uiScale ?? 1;
    el.style.left = `${token.document.x}px`;
    el.style.top = `${token.document.y - el.offsetHeight - 8 * ui}px`;

    /*
     * ⚠ Removal is on a plain timer, never on `animation.finished`.
     *
     * The Web Animations API does not run in a **backgrounded tab**, so a `.finished` promise
     * there never resolves and the element never gets removed — leaving a stale warning pinned
     * over someone's token until they reload. Caught in testing: the bubble was still on screen
     * at 6.1 s with a 5 s life, because the tab under test was not the foreground one.
     *
     * The animations stay for the look; the lifetime is the timer's alone.
     */
    el.animate({ opacity: [0, 1] }, { duration: 250, easing: "ease" });
    setTimeout(() => {
      el.animate({ opacity: [1, 0] }, { duration: 400, easing: "ease" });
      el.style.opacity = "0"; // survives a tab that never ran the animation
      setTimeout(() => el.remove(), 450);
    }, SCOPE_BUBBLE_MS);
  } catch (err) {
    console.warn(`${MODULE} | bubble render failed`, err);
  }
}

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
export async function grantKind(character, kindOrSubject, tier = 15) {
  if (!game.user?.isGM || !character) return false;
  const kind = kindActorOf(kindOrSubject);
  if (!kind) return false;
  if (!STUDY_RUNGS.includes(tier)) return false;

  const held = beliefsOf(kind)[character.id]?.[KIND_KEY];
  if (held && Number(held.tier ?? -1) >= tier) {
    ui.notifications.info(f("known.study.notify.alreadyKnows", { character: character.name, kind: kind.name }));
    return false;
  }

  const { label } = studySkillFor(kind);
  const text = await composeStudyPayload(kind, tier, label);
  const now = Date.now();
  const fact = resolveFact({ ns: "kind", subjectId: kind.id });
  if (!fact) return false;

  await putBelief(fact, character.id, { text, tier, total: null, when: now, delivered: now });
  await applyPlayerWrites(character, fact, { text, silent: false, tier }, now);
  ui.notifications.info(f("known.study.notify.released", { character: character.name, kind: kind.name, tier }));
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
  const all = flagOf(subject, BELIEFS_FLAG) ?? {};
  const key = identifiedKey(attrId);
  if (!all[character.id]?.[key]) return false;

  const others = Object.keys(all[character.id]).filter(k => k !== key);
  const rest = Object.keys(all).filter(k => k !== character.id);
  if (!others.length && !rest.length) await subject.unsetFlag(MODULE, BELIEFS_FLAG);
  else await subject.update(dropRow(`flags.${MODULE}.${BELIEFS_FLAG}`, character.id, key, all[character.id]), { render: false });

  ui.notifications.info(
    f("known.inspect.resetDone", { character: character.name, subject: subject.name, attr: describeAttribute(attrId).title })
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
  const mine = (flagOf(subject, BELIEFS_FLAG) ?? {})[character.id] ?? {};
  const attrIds = Object.keys(mine)
    .map(k => (k.endsWith(`:${MEMBER_FACT}`) ? parseFactKey(k)?.subject : null))
    .filter(Boolean);
  for (const id of attrIds) await resetIdentification(character, subject, id);
  return attrIds.length;
}

/** GM hand-throw, no socket and no gesture — the same handler, same validation, same writes. */
export async function inspectAs(character, subject) {
  if (!game.user?.isGM) return false;
  // the hand-throw has no gesturing client of its own, so this is the one caller that asks the
  // handler to post — and it runs on exactly one client, so it cannot duplicate
  return applyInspect({ action: INSPECT, characterId: character?.id, subjectId: subject?.id }, game.user.id, {
    postStubCard: true
  });
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerStudy() {
  game.socket.on(CHANNEL, async (payload, senderId) => {
    /*
     * The bubble is the one action every client acts on, not just the arbiter GM — it is a thing
     * the table sees, so gating it on `isApplyingGM` would show it to nobody but one browser.
     * It carries no secret: tempo, never outcome.
     */
    if (payload?.action === BUBBLE) return showBubble(payload);

    if (payload?.action !== STUDY && payload?.action !== INSPECT) return;
    if (!isApplyingGM()) return;
    try {
      if (payload.action === INSPECT) await applyInspect(payload, senderId);
      else await applyStudy(payload, senderId);
    } catch (err) {
      console.error(`${MODULE} | conduit failed`, err);
    }
  });
}

/**
 * For a GM who wants to throw a character's check by hand, no socket and no dialog in the way.
 *
 * Same handler, same validation, same writes as a player's click — it only skips the gesture.
 * Pass `loreId` to throw one of the individual's rows instead of the kind ladder.
 */
export async function studyAs(
  character,
  subject,
  { mode = "normal", situational = 0, loreId = null, attrId = null } = {}
) {
  if (!game.user?.isGM) return false;
  return applyStudy(
    {
      action: STUDY,
      characterId: character?.id,
      subjectId: subject?.id,
      ns: attrId ? "attr" : loreId ? "lore" : "kind",
      factId: loreId,
      attrId,
      mode,
      situational
    },
    game.user.id
  );
}
