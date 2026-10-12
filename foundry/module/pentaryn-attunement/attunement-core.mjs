/**
 * Pentaryn Attunement Slots — PURE core: constants, the slot reconciliation, the stash plan, the
 * bond decision, the over-cap threshold, the proficiency-map patch and the strings.
 *
 * No Foundry global at runtime: every function reads only the objects it is given (an actor-like
 * object needs `system`, `items` and `getFlag`), and stash planning takes `randomID`/`setProperty`
 * injected. Glue files import from here; nothing here imports glue. The design notes (why slots
 * are stored, why the module warns but never vetoes, away bonds) are in README.md.
 */

export const MODULE = "pentaryn-attunement";
export const SHORT = "attunement";
export const NS = "attunement";
export const VERSION = "0.3.0";                              // === module.json version (core-meta.test pins it)
export const CONTRACT = "pentaryn-attunement/api@1";         // bump the major on a published-shape change
export const I18N = "PENTARYN_ATTUNEMENT";
export const CSS = "pentaryn-attunement-";
export const FLAG_SCOPE = MODULE;

/** Events this module emits: none. */
export const HOOKS = Object.freeze({});

/** Flag keys under `flags.pentaryn-attunement`. */
export const SLOTS = "slots";
export const AWAY_FLAG = "away";
export const BOND = "bond";
/** Prefix of an away item's id in the slot array: `away:<key>`. */
export const AWAY = "away:";

/* -------------------------------------------- */
/*  Away bonds                                  */
/* -------------------------------------------- */

/*
 * An attuned item that leaves its owner keeps its attunement by the rules, so the item carries a
 * *bond* and the actor carries an *away list*:
 *
 *     item  flags["pentaryn-attunement"].bond = { actor, key, name, equipped, attuned, attunement, currency? }
 *     actor flags["pentaryn-attunement"].away = [{ key, name, img }]
 *
 * `bond.currency` marks a coin purse: on arrival its coin is added to the actor's purse and the
 * item deletes itself.
 */

/**
 * The actor's away list, malformed entries dropped. Duck-typed: anything with `getFlag`.
 * @returns {{key:string,name:string,img:string}[]}
 */
export function awayOf(actor) {
  const list = actor?.getFlag?.(MODULE, AWAY_FLAG);
  return Array.isArray(list) ? list.filter(a => a && (typeof a.key === "string")) : [];
}

/**
 * Whether `actor` is the bond's owner. `bond.actor` is the owner's uuid, so an unlinked token is told
 * apart from its base actor and its siblings, which share one id (ATT-ROB-2). A legacy bond holds the
 * bare id (an id has no ".") and matches on the id, as before.
 * @param {object|null} bond
 * @param {{id?: string, uuid?: string}|null} actor
 * @returns {boolean}
 */
export function isBondOwner(bond, actor) {
  const ref = bond?.actor;
  if (typeof ref !== "string" || !actor) return false;
  return ref.includes(".") ? ref === actor.uuid : ref === actor.id;
}

/**
 * What a bonded item's source becomes as it is created on the actor `actorId`/`actorUuid` (the bond
 * decision of restoreBond). Its real name always comes back; on the bonded actor its attunement category and
 * equipped state too, and `attuned` only when the actor still lists the bond's key as away.
 * Key order is part of the contract: name, attunement, attuned, equipped.
 * @param {object|null} bond
 * @param {{actorId: string, actorUuid?: string, awayKeys?: string[], fallbackName?: string}} opts
 * @returns {object|null}  null when there is no bond
 */
export function bondChanges(bond, { actorId, actorUuid, awayKeys = [], fallbackName } = {}) {
  if (!bond) return null;
  const changes = { name: bond.name ?? fallbackName };
  if (!isBondOwner(bond, { id: actorId, uuid: actorUuid })) return changes;
  if (bond.attunement != null) changes["system.attunement"] = bond.attunement;
  if (awayKeys.includes(bond.key)) changes["system.attuned"] = true;
  if (bond.equipped) changes["system.equipped"] = true;
  return changes;
}

/**
 * The short name used in the stash tag and the away tooltip: the first word before a space or comma.
 * @param {string} name
 * @returns {string}
 */
export const shortName = name => name.split(/[ ,]/)[0];

/**
 * Move-out plan for stash(): the container's creates, the owner's new away list and slot order.
 * Container contents are flattened; plain duplicates (two stacks of torches) merge.
 *
 * @param {object} owner          actor-like: name, id, uuid (the bond's owner), system.currency, items (get/filter), getFlag
 * @param {string[]} itemIds
 * @param {{tag?: string, currency?: boolean, randomID: () => string,
 *   setProperty: (obj: object, path: string, value: *) => void}} opts
 * @returns {{creates: object[], away: object[], slots: (string|null)[]}}
 */
export function planStash(owner, itemIds, { tag, currency = false, randomID, setProperty } = {}) {
  tag ??= shortName(owner.name);
  const ids = new Set(itemIds);
  const away = awayOf(owner);
  const creates = [];
  const keyById = new Map();
  const merged = new Map();

  for (const id of ids) {
    const item = owner.items.get(id);
    if (!item) continue;
    const key = randomID();
    const wasAttuned = !!item._source.system?.attuned;
    const data = item.toObject();
    delete data._id;
    delete data.system.container;
    // Source name, not prepared: an enchanted item's displayed name is built by
    // an effect ("{} of the War Mage, +1"), and storing the prepared name would
    // double the suffix when it comes home.
    data.name = `${item._source.name} (${tag})`;
    if ("equipped" in data.system) data.system.equipped = false;
    if ("attuned" in data.system) data.system.attuned = false;
    setProperty(data, `flags.${MODULE}.${BOND}`, {
      actor: owner.uuid, key, name: item._source.name,
      equipped: !!item._source.system?.equipped,
      attuned: wasAttuned,
      attunement: item._source.system?.attunement ?? ""
    });
    if (wasAttuned) { away.push({ key, name: item.name, img: item.img }); keyById.set(id, key); }

    // Merge plain duplicates (two stacks of torches) so the box stays readable. Only a mergeable
    // copy is a merge target: an attuned copy is never a prior for a later stack (EC-5).
    const mkey = `${data.type}|${data.name}`;
    const mergeable = data.type !== "container" && !wasAttuned;
    const prior = mergeable ? merged.get(mkey) : null;
    if (prior && ("quantity" in data.system)) { prior.system.quantity += data.system.quantity ?? 1; continue; }
    if (mergeable) merged.set(mkey, data);
    creates.push(data);
  }

  if (currency) {
    const coin = Object.fromEntries(Object.entries(owner.system.currency ?? {}).filter(([, v]) => v > 0));
    if (Object.keys(coin).length) {
      const label = Object.entries(coin).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(", ");
      creates.push({
        name: `Coin Purse (${tag})`, type: "loot", img: "icons/containers/bags/coinpouch-simple-leather-tan.webp",
        system: { quantity: 1, type: { value: "treasure" }, description: { value: `<p>${label}.</p>` } },
        flags: { [MODULE]: { [BOND]: { actor: owner.uuid, key: randomID(), name: "Coin Purse", currency: coin } } }
      });
    }
  }

  // Each away item keeps the slot it held before it left.
  const slots = computeSlots(owner).slots.map(id => keyById.has(id) ? AWAY + keyById.get(id) : id);
  return { creates, away, slots };
}

/* -------------------------------------------- */
/*  State                                       */
/* -------------------------------------------- */

/**
 * The attunement cap the strip and the over-cap warning share: a finite `max` (floored at 0),
 * else 3 — so a missing or NaN `max` warns at the same count the strip draws (EC-10). Pure.
 * @param {{max?: number}} [att]   `system.attributes.attunement`
 * @returns {number}
 */
export function capOf(att) {
  return Number.isFinite(att?.max) ? Math.max(0, att.max) : 3;
}

/**
 * Reconcile the stored slot order against what is actually attuned right now.
 *
 * Pure: reads documents, writes nothing. Safe to call from render.
 *
 * @param {Actor} actor
 * @returns {{slots: (string|null)[], max: number, value: number, over: boolean}}
 */
export function computeSlots(actor) {
  const att = actor.system?.attributes?.attunement ?? {};
  const max = capOf(att);

  // Prepared data is the right source here: an item stripped of its attunement
  // by prepareFinalEquippableData (equipment without the Magical property) is
  // genuinely not attuned as far as the rest of the system is concerned.
  const attuned = actor.items.filter(i => i.system?.attuned).map(i => i.id);
  // Attuned items that are not on the actor right now (confiscated, stashed) keep
  // their slot. They live in the slot array as `away:<key>`.
  for (const a of awayOf(actor)) attuned.push(AWAY + a.key);
  const attunedSet = new Set(attuned);

  // First occurrence wins. Without the dedupe a flag that repeats an id — which a
  // half-applied write or a hand-edited flag can produce — renders the same item
  // in several slots at once and inflates the count against the cap.
  const stored = actor.getFlag(MODULE, SLOTS);
  const placed = new Set();
  const slots = (Array.isArray(stored) ? stored : []).map(id => {
    if ((typeof id !== "string") || !attunedSet.has(id) || placed.has(id)) return null;
    placed.add(id);
    return id;
  });

  // Drop anything attuned that has no home yet into the first hole.
  for (const id of attuned) {
    if (placed.has(id)) continue;
    const hole = slots.indexOf(null);
    if (hole >= 0) slots[hole] = id;
    else slots.push(id);
    placed.add(id);
  }

  // Always draw at least `max` slots, and never trail empty ones past it.
  while (slots.length < max) slots.push(null);
  while ((slots.length > max) && (slots.at(-1) === null)) slots.pop();

  const value = placed.size;
  return { slots, max, value, over: value > max };
}

/**
 * An away item has come home as `itemId`. Put it back in the slot its away
 * marker held.
 *
 * By the time this runs the item already exists *and is attuned* (preCreate
 * restored it) while its away entry is still listed, so `computeSlots` has
 * already dropped the new id into the first hole — or appended it as an extra
 * slot when there was none. Swapping the marker alone then wrote the id twice:
 * the flag grew a duplicate, and when there was a hole the item sat in the hole
 * (first occurrence wins) instead of its own slot. Pure.
 *
 * @param {(string|null)[]} slots   reconciled slots, marker and new id both present
 * @param {string} awayId           `away:<key>`
 * @param {string} itemId
 * @returns {(string|null)[]}
 */
export function homeSlots(slots, awayId, itemId) {
  if (!slots.includes(awayId)) return slots;
  return trimSlots(slots.map(id => (id === itemId) ? null : (id === awayId) ? itemId : id));
}

/**
 * A slot arrangement ready to store: trailing holes trimmed, so the flag does not grow every time
 * something is unattuned. Returns a copy.
 * @param {(string|null)[]} slots
 * @returns {(string|null)[]}
 */
export function trimSlots(slots) {
  const trimmed = [...slots];
  while (trimmed.length && (trimmed.at(-1) === null)) trimmed.pop();
  return trimmed;
}

/* -------------------------------------------- */
/*  Enforcement — warn, never veto              */
/* -------------------------------------------- */

/**
 * The over-cap warning's threshold: warn when the count (away entries included) is already at
 * `max`; `after` is the count the attune would make.
 *
 * Two counts exist and they are taken from different sources: this one (the warning) reads
 * dnd5e's prepared `system.attributes.attunement.value`, while `computeSlots` (the strip) counts
 * the items whose prepared `system.attuned` is true. Both add the away entries. They can disagree
 * (test/glue.test.mjs pins a case, KNOWN items-journal-12); `inspect()` reports both.
 *
 * @param {{value: number, max: number, awayCount?: number}} counts
 * @returns {{exceed: boolean, after: number}}
 */
export function wouldExceed({ value, max, awayCount = 0 }) {
  const v = value + awayCount;
  return { exceed: !(v < max), after: v + 1 };
}

/* -------------------------------------------- */
/*  "Not Proficient" on a cloak                 */
/* -------------------------------------------- */

/** The item types patchProficiencyMap fills, in log-line order; selftest checks the same list. */
export const PROFICIENCY_CATEGORIES = Object.freeze(["wondrous", "ring", "rod", "wand", "trinket"]);

/**
 * Every ring, rod, wand, trinket and wondrous item in the world reports
 * **Not Proficient** — on its tooltip and on its chat card. Two bits of dnd5e that
 * don't quite meet:
 *
 *     // EquippableItemTemplate#equippableItemCardProperties — always emits a pill
 *     ("proficient" in this) ? CONFIG.DND5E.proficiencyLevels[this.prof?.multiplier || 0] : null
 *
 *     // EquipmentData#proficiencyMultiplier
 *     const itemProf = CONFIG.DND5E.armorProficienciesMap[this.type.value];
 *     const isProficient = (itemProf === true) || actorProfs.has(itemProf) || ...
 *
 * `armorProficienciesMap` covers only `natural`, `clothing`, `light`, `medium`,
 * `heavy` and `shield`. A cloak is `wondrous`, so the lookup is `undefined`,
 * `actorProfs.has(undefined)` is false, and the multiplier lands on 0 → "Not
 * Proficient". The system is not claiming you can't wear it; it is reporting that
 * you lack the proficiency named `undefined`.
 *
 * Only when unset (`== null`), on purpose: if a later dnd5e defines any of these itself, its definition
 * wins and this becomes a no-op. Nothing to un-patch, nothing to keep in sync.
 *
 * `vehicle` is deliberately left alone — vehicle proficiency is a real concept in
 * some settings, and silently declaring everyone proficient is a trap for later.
 *
 * @param {object} map  `CONFIG.DND5E.armorProficienciesMap`.
 * @returns {string[]}  Keys actually added, for the log line.
 */
export function patchProficiencyMap(map) {
  const added = [];
  for (const type of PROFICIENCY_CATEGORIES) {
    if (map[type] == null) { map[type] = true; added.push(type); }
  }
  return added;
}

/**
 * The dnd5e item-tooltip guard's skip test: with no anchor element or no tooltip there is nothing
 * to position.
 * @param {{element: *, tooltip: *}} anchor
 */
export const tooltipAnchorMissing = ({ element, tooltip }) => !element || !tooltip;

/**
 * Wrap a DOM listener's async action so a failure is logged with the module prefix and a label
 * (`pentaryn-attunement | <label> failed`) instead of surfacing as an anonymous "Uncaught (in
 * promise)". `fn` is called synchronously — a drop handler's preventDefault must run inside the
 * event — and nothing is rethrown; the returned promise resolves undefined once `fn` settles.
 * @param {string} label
 * @param {Function} fn
 * @param {(line: string, err: *) => void} [log]  defaults to console.error
 */
export function safe(label, fn, log = null) {
  const report = err => {
    if (log) log(`${MODULE} | ${label} failed`, err);
    else console.error(`${MODULE} | ${label} failed`, err);
  };
  return (...args) => {
    try {
      return Promise.resolve(fn(...args)).then(() => undefined, report);
    } catch (err) {
      report(err);
      return Promise.resolve();
    }
  };
}
