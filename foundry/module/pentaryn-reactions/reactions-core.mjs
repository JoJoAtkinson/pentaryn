/**
 * Pentaryn Reactions — PURE core: constants, the HOOKS table, and the rules.
 *
 * No Foundry global at runtime (only pure `foundry.utils.*` helpers are allowed), so every rule
 * here runs in node on plain fixtures. Glue files import from here; nothing here imports glue.
 * Past ~600 lines, split into core/<topic>.mjs behind this file as a barrel.
 *
 * The rules, in the order the GM client applies them to a new attack or damage card:
 *   triggerOf       what the card is: a hit on each target, or damage of some types
 *   optionsFor      which of the PC's reaction-timed activities fit it, and are affordable
 *                   (slotCast, affordableSlots, limitedUses: how the adapter reads a dnd5e activity)
 *   suppression     why no card goes out (reaction spent, at 0 HP, owner offline, no options)
 *   cardKey         one card per attacker turn per PC — a multiattack coalesces
 *   mergeCard       the card record, updated in place
 *   cardLines       the text and buttons the owner sees
 *   closeReason     when an open card greys (the PC's turn starts, the reaction is spent)
 */

export const MODULE = "pentaryn-reactions";
export const SHORT = "reactions";
export const NS = "reactions";
export const VERSION = "0.1.1";                       // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-reactions/api@1";   // bump the major on a published-shape change
export const I18N = "PENTARYN_REACTIONS";
export const CSS = "prea-";
export const FLAG_SCOPE = MODULE;

/** pentaryn-combat's flag scope: `flags.pentaryn-combat.reaction` is `{ combatId }` once a Reaction is spent. */
export const COMBAT_SCOPE = "pentaryn-combat";
/** The flag (under FLAG_SCOPE) on a reminder card that holds the card record. */
export const CARD_FLAG = "card";
/** The claimMessage key on the attack / damage message: one GM tab offers. */
export const CLAIM_KEY = "offer";
/** How far back `game.messages` is scanned for an open card (a reload, a second tab). */
export const SCAN_DEPTH = 100;

/** Events this module emits. New names are `pentaryn-<short>.<camelEvent>`; pre-hooks are vetoable. */
export const HOOKS = Object.freeze({
  offered: Object.freeze({ name: "pentaryn-reactions.offered", pre: false, args: "(message, card) — a reminder card was posted or updated in place" }),
  closed: Object.freeze({ name: "pentaryn-reactions.closed", pre: false, args: "(message, card, reason) — an open card greyed: turn, spent or ended" }),
});

/* ── which reaction fits which trigger ─────────────────────────────────────────────────────── */

/** The damage types Absorb Elements answers. */
export const ELEMENT_TYPES = Object.freeze(["acid", "cold", "fire", "lightning", "thunder"]);

/** Roll types that are not damage: a damage-typed card made only of these is no trigger. */
export const NOT_DAMAGE = Object.freeze(["healing", "temphp"]);

/**
 * The allow-list: a reaction-timed activity is offered only when its item is a row here and the row's
 * trigger matches the card. `key` is the dnd5e identifier (the slugified item name); `loose` rows also
 * match an item whose slug merely contains the key ("Maneuver: Parry"). `types` narrows a damage row
 * to those damage types; without it any damage fits.
 *
 * Deliberately absent in this phase: Counterspell and Cosmic Omen (their trigger is another creature's
 * cast or D20 Test), and Opportunity Attack (a creature leaving reach) — the plan's F3.
 */
export const OPTION_RULES = Object.freeze([
  Object.freeze({ key: "shield", trigger: "hit" }),
  Object.freeze({ key: "absorb-elements", trigger: "damage", types: ELEMENT_TYPES }),
  Object.freeze({ key: "parry", trigger: "hit", loose: true }),
  Object.freeze({ key: "defensive-duelist", trigger: "hit" }),
  Object.freeze({ key: "uncanny-dodge", trigger: "hit" }),
  Object.freeze({ key: "deflect-attacks", trigger: "hit" }),
  Object.freeze({ key: "deflect-missiles", trigger: "hit" }),
  Object.freeze({ key: "hellish-rebuke", trigger: "damage" }),
]);

/** dnd5e's identifier shape: lower-case, ASCII, words joined by one hyphen. */
export function slug(text) {
  return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * The OPTION_RULES row for an item: its dnd5e `identifier` first, then the slug of its name, then a
 * `loose` row the slug contains. Null when the item is not on the list.
 * @param {{identifier?: string, name?: string}} item
 */
export function ruleFor({ identifier, name } = {}) {
  const id = slug(identifier);
  const nm = slug(name);
  return OPTION_RULES.find(r => r.key === id)
    ?? OPTION_RULES.find(r => r.key === nm)
    ?? OPTION_RULES.find(r => r.loose && (id.includes(r.key) || nm.includes(r.key)))
    ?? null;
}

/* ── the trigger ───────────────────────────────────────────────────────────────────────────── */

/**
 * dnd5e's own hit test (AttackMessageData#evaluatedTargets, dnd5e 6.0.6 `dnd5e.mjs:86402`):
 * a target with no stored AC is a miss there; here it is "unknown" — the card does not know,
 * so there is no card.
 * @param {{total?: number, isCritical?: boolean, isFumble?: boolean, ac?: number|null}} roll
 * @returns {"hit"|"miss"|"unknown"}
 */
export function hitOutcome({ total, isCritical = false, isFumble = false, ac = null } = {}) {
  if (!Number.isFinite(ac)) return "unknown";
  if (isCritical) return "hit";
  if (isFumble) return "miss";
  return Number.isFinite(total) && total >= ac ? "hit" : "miss";
}

const nameOf = v => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * What a new chat message asks of the targets, from its plain record (the adapter in card.mjs builds
 * it): `{ id, type, flavor, public, rolls: [{ total, isCritical, isFumble, type }], targets: [{ actor,
 * token, name, ac }], activity: { uuid, name }, item: { name }, speaker: { actor, token, alias },
 * origin }`.
 *
 *  - type "attack": the targets the roll HIT (unknown AC → not listed) → `{ kind: "hit", … }`;
 *  - type "damage": every target, with the damage types of the rolls → `{ kind: "damage", … }`;
 *    a card made only of healing / temp HP rolls, or with no typed total, is no trigger;
 *  - anything else, or no target left → null.
 *
 * `public` is false for a whispered or blind roll: the owner's card then omits the numbers.
 * @returns {{kind: "hit"|"damage", id: string, origin: string|null, public: boolean, attack: string,
 *   attacker: {key: string, name: string, actor: string|null}, types: string[],
 *   targets: {actor: string, token: string|null, name: string, ac: number|null, total: number}[]}|null}
 */
export function triggerOf(msg) {
  if (!msg || typeof msg !== "object") return null;
  const targets = Array.isArray(msg.targets) ? msg.targets.filter(t => t && typeof t.actor === "string" && t.actor) : [];
  if (!targets.length) return null;
  const rolls = Array.isArray(msg.rolls) ? msg.rolls.filter(Boolean) : [];
  const speaker = msg.speaker ?? {};
  const attacker = {
    key: speaker.token ? `Token.${speaker.token}` : speaker.actor ? `Actor.${speaker.actor}` : "unknown",
    name: nameOf(speaker.alias) ?? "Someone",
    actor: typeof speaker.actor === "string" && speaker.actor ? speaker.actor : null,
  };
  const attack = nameOf(msg.item?.name) ?? nameOf(msg.activity?.name) ?? nameOf(String(msg.flavor ?? "").split(" - ")[0]) ?? "an attack";
  const base = { id: msg.id ?? null, origin: msg.origin ?? null, public: msg.public !== false, attack, attacker };
  const pick = t => ({ actor: t.actor, token: t.token ?? null, name: nameOf(t.name) ?? "?", ac: Number.isFinite(t.ac) ? t.ac : null });

  if (msg.type === "attack") {
    const roll = rolls[0];
    if (!roll) return null;
    const hit = targets.filter(t => hitOutcome({ total: roll.total, isCritical: roll.isCritical, isFumble: roll.isFumble, ac: t.ac }) === "hit")
      .map(t => ({ ...pick(t), total: roll.total }));
    return hit.length ? { kind: "hit", ...base, types: [], targets: hit } : null;
  }
  if (msg.type === "damage") {
    const damage = rolls.filter(r => Number.isFinite(r.total) && !NOT_DAMAGE.includes(r.type));
    if (!damage.length) return null;
    const types = [...new Set(damage.map(r => (typeof r.type === "string" && r.type ? r.type : "untyped")))];
    const total = damage.reduce((sum, r) => sum + Math.max(0, r.total), 0);
    return { kind: "damage", ...base, types, targets: targets.map(t => ({ ...pick(t), total })) };
  }
  return null;
}

/* ── the options ───────────────────────────────────────────────────────────────────────────── */

/** dnd5e 6's spellcasting methods that never cast from a slot (`CONFIG.DND5E.spellcasting` rows with no slot model). */
export const SLOTLESS_METHODS = Object.freeze(["atwill", "innate", "ritual"]);

/**
 * Does casting this spell consume a slot? dnd5e's own answer is the activity's `requiresSpellSlot`
 * (`dnd5e.mjs:20229`: a spell on an actor with a spell table whose method has slots) and it wins
 * whenever the activity carries it. Without it (a plain record, a stub) the method decides: a
 * levelled spell under any method but at-will, innate or ritual — so `spell` and `pact` count even
 * when nothing says `slots` (the live config only grows that key once dnd5e's models are built).
 * @param {{level?: number, method?: string|null, requiresSpellSlot?: boolean}} spell
 */
export function slotCast({ level = 0, method = null, requiresSpellSlot } = {}) {
  if (typeof requiresSpellSlot === "boolean") return requiresSpellSlot;
  return Number(level) > 0 && !SLOTLESS_METHODS.includes(method ?? "");
}

/**
 * The keys of the slots that can pay for this spell now: `max > 0`, a use left, level at or above the
 * spell's (dnd5e's own slot picker, `dnd5e.mjs:15996-16008`). Empty when the spell needs no slot.
 * @param {{level?: number, usesSlots?: boolean, slots?: {key?: string, level: number, value: number, max: number}[]}} spell
 * @returns {string[]}
 */
export function affordableSlots({ level = 0, usesSlots = true, slots = [] } = {}) {
  if (!(Number(level) > 0) || usesSlots === false) return [];
  return (Array.isArray(slots) ? slots : [])
    .filter(s => s && Number(s.max) > 0 && Number(s.value) > 0 && Number(s.level) >= Number(level))
    .map(s => s.key ?? `spell${s.level}`);
}

/**
 * The `uses` record for an activity's (or item's) `{ value, max }`: `{ value }` when uses are limited,
 * null when unlimited. A numeric `max` of 0 is "no limit configured"; a `max` that is not a number
 * (a formula dnd5e has not resolved) is still a limit, and `value` decides — never NaN → unlimited.
 * @param {{value?: number|string|null, max?: number|string|null}|null} uses
 */
export function limitedUses(uses) {
  if (!uses || typeof uses !== "object") return null;
  const max = Number(uses.max);
  if (Number.isFinite(max)) return max > 0 ? { value: uses.value } : null;
  return uses.value === null || uses.value === undefined || uses.value === "" ? null : { value: uses.value };
}

/**
 * Can the PC pay for this activity now? `uses` is `{ value }` when the activity or its item has
 * limited uses (null when unlimited); `spell` is `{ level, usesSlots, slots: [{ key, level, value, max }] }`
 * for a spell item (null otherwise). A levelled spell that casts from slots needs one slot of its
 * level or higher with a use left (`affordableSlots`); cantrips, at-will and innate spells need none.
 */
export function affordable({ uses = null, spell = null } = {}) {
  if (uses && !(Number(uses.value) > 0)) return false;
  if (spell && Number(spell.level) > 0 && spell.usesSlots !== false) return affordableSlots(spell).length > 0;
  return true;
}

/**
 * The PC's reaction options for a trigger: the records (one per activity, from the adapter) whose
 * activation is a Reaction, whose item is an OPTION_RULES row for this trigger kind (and, for
 * damage, one of the row's types when it names any), and that the PC can afford.
 * @param {{id: string, uuid: string, name: string, img?: string|null, identifier?: string, activation?: string,
 *   uses?: {value: number}|null, spell?: object|null}[]} records
 * @param {{kind: "hit"|"damage", types?: string[]}} trigger
 * @returns {{id: string, uuid: string, name: string, img: string|null}[]}
 */
export function optionsFor(records, trigger) {
  if (!trigger || !Array.isArray(records)) return [];
  const out = [];
  const seen = new Set();
  for (const r of records) {
    if (!r || r.activation !== "reaction" || !r.uuid || seen.has(r.uuid)) continue;
    const rule = ruleFor(r);
    if (!rule || rule.trigger !== trigger.kind) continue;
    if (rule.types && !(trigger.types ?? []).some(t => rule.types.includes(t))) continue;
    if (!affordable(r)) continue;
    seen.add(r.uuid);
    out.push({ id: r.id ?? null, uuid: r.uuid, name: r.name, img: r.img ?? null });
  }
  return out;
}

/* ── the suppressions ──────────────────────────────────────────────────────────────────────── */

/** pentaryn-combat's rule: the Reaction is spent when the flag names the combat the PC is in. */
export function reactionSpent(flag, combatId) {
  return !!(flag && combatId && flag.combatId === combatId);
}

/**
 * Why no card goes out, or null when one should. Checked in this order:
 *   "spent"      the PC's Reaction is already spent this round (pentaryn-combat's flag)
 *   "down"       the PC is at 0 HP (no reactions while unconscious)
 *   "offline"    no non-GM owner is connected to read it
 *   "noOptions"  nothing fits the trigger, or nothing that fits can be paid for
 * @param {{spent?: boolean, hp?: number|null, owners?: string[], options?: object[]}} state
 */
export function suppression({ spent = false, hp = null, owners = [], options = [] } = {}) {
  if (spent) return "spent";
  if (Number.isFinite(hp) && hp <= 0) return "down";
  if (!owners.length) return "offline";
  if (!options.length) return "noOptions";
  return null;
}

/* ── the card ──────────────────────────────────────────────────────────────────────────────── */

/** `"<combatId>:<round>:<turn>"` for a started combat; `"nocombat"` otherwise. */
export function turnKey(combat) {
  if (!combat || !combat.id || combat.started === false) return "nocombat";
  return `${combat.id}:${combat.round ?? 0}:${combat.turn ?? 0}`;
}

/**
 * One card per attacker turn per PC: the attacker's token (or actor), the turn, the PC. Out of
 * combat there is no turn, so the usage card (the roll's origin) stands in — the attack and damage
 * rolls of one use share it.
 */
export function cardKey(trigger, turn, pcUuid) {
  const t = turn === "nocombat" ? `nocombat:${trigger.origin ?? trigger.id ?? "?"}` : turn;
  return `${trigger.attacker.key}|${t}|${pcUuid}`;
}

/** One line of the card: what this message did to this target. */
export function swingOf(trigger, target) {
  return {
    message: trigger.id, kind: trigger.kind, attack: trigger.attack, public: trigger.public,
    total: target.total, ac: target.ac, types: [...(trigger.types ?? [])],
  };
}

/**
 * The card record after this swing: a new card, or `existing` with the swing appended (by message
 * id, so a replay adds nothing) and the options unioned (by uuid). Returns `existing` itself — the
 * same object — when nothing changed, so the caller writes nothing; a closed card never changes.
 * @param {object|null} existing
 * @param {{key: string, combatId: string|null, attacker: object, pc: {uuid: string, name: string, actorUuid: string},
 *   swing: object, options: object[]}} incoming
 */
export function mergeCard(existing, { key, combatId = null, attacker, pc, swing, options }) {
  if (!existing) {
    return { key, combatId, attacker: { ...attacker }, pc: { ...pc }, swings: [swing], options: [...options], closed: null };
  }
  if (existing.closed) return existing;
  const swings = existing.swings ?? [];
  const known = swings.some(s => s.message && s.message === swing.message);
  const have = new Set((existing.options ?? []).map(o => o.uuid));
  const added = options.filter(o => !have.has(o.uuid));
  if (known && !added.length) return existing;
  return {
    ...existing,
    swings: known ? swings : [...swings, swing],
    options: [...(existing.options ?? []), ...added],
  };
}

const typeList = types => (types.length ? types.join("/") : "untyped");

/**
 * The card as the owner reads it: a title, one line per swing, one button per option.
 * Numbers appear only for a public roll. `closed` carries the close reason, or null while open.
 */
export function cardLines(card) {
  const lines = (card?.swings ?? []).map(s => {
    const who = card.attacker?.name ?? "Someone";
    const pc = card.pc?.name ?? "you";
    if (s.kind === "hit") {
      const n = s.public && Number.isFinite(s.total) && Number.isFinite(s.ac) ? ` (${s.total} vs AC ${s.ac})` : "";
      return `${who} hits ${pc} with ${s.attack}${n}.`;
    }
    const amount = s.public && Number.isFinite(s.total) ? `${s.total} ` : "";
    return `${who} deals ${amount}${typeList(s.types ?? [])} damage to ${pc} with ${s.attack}.`;
  });
  const closed = card?.closed ?? null;
  const title = closed === "spent" ? "Reaction spent" : closed ? "Reaction window passed" : "Reaction";
  return { title, lines, buttons: (card?.options ?? []).map(o => ({ uuid: o.uuid, name: o.name, img: o.img ?? null })), closed };
}

/**
 * Why an open card greys now, or null:
 *   "spent"  the PC's Reaction was just recorded as spent (any turn)
 *   "turn"   the PC's own turn began in the card's combat
 *   "ended"  the card's combat was deleted
 * @param {object} card
 * @param {{reason: "spent"|"turn"|"ended", actorUuid?: string|null, combatId?: string|null}} event
 */
export function closeReason(card, { reason, actorUuid = null, combatId = null } = {}) {
  if (!card || card.closed) return null;
  if (reason === "spent") return actorUuid && card.pc?.actorUuid === actorUuid ? "spent" : null;
  if (reason === "turn") return actorUuid && combatId && card.pc?.actorUuid === actorUuid && card.combatId === combatId ? "turn" : null;
  if (reason === "ended") return combatId && card.combatId === combatId ? "ended" : null;
  return null;
}
