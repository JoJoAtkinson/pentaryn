/**
 * Verbatim oracles (guide step 1.3): today's attunement.mjs logic, lifted out of its glue as pure
 * functions so the step-2 core can be proven equal to it. Each body is copied from attunement.mjs at
 * 4e64f47 (line numbers in the comments); the only changes are injected dependencies (randomID,
 * setProperty, computeSlots) and returned values in place of writes.
 */

const MODULE = "pentaryn-attunement";
const SLOTS = "slots";
const AWAY_FLAG = "away";
const BOND = "bond";
const AWAY = "away:";

/** :118–121 */
export function awayOf(actor) {
  const list = actor?.getFlag?.(MODULE, AWAY_FLAG);
  return Array.isArray(list) ? list.filter(a => a && (typeof a.key === "string")) : [];
}

/** :218–227 — the bond decision, as a function of its inputs; null bond → null (the :206 early return). */
export function bondChanges(bond, { actorId, awayKeys = [], fallbackName } = {}) {
  if (!bond) return null;
  const changes = { name: bond.name ?? fallbackName };
  const home = (actorId === bond.actor) && awayKeys.some(k => k === bond.key);
  if (home) {
    if (bond.attunement != null) changes["system.attunement"] = bond.attunement;
    changes["system.attuned"] = true;
    if (bond.equipped) changes["system.equipped"] = true;
  } else if (actorId === bond.actor) {
    if (bond.attunement != null) changes["system.attunement"] = bond.attunement;
    if (bond.equipped) changes["system.equipped"] = true;
  }
  return changes;
}

/** :721–723 — warnOverCap's threshold: warn when value (incl. away) is already at max. */
export function wouldExceed({ value, max, awayCount = 0 }) {
  const v = value + awayCount;
  return { exceed: !(v < max), after: v + 1 };
}

/** :269–323 */
export function computeSlots(actor) {
  const att = actor.system?.attributes?.attunement ?? {};
  const max = Number.isFinite(att.max) ? Math.max(0, att.max) : 3;
  const attuned = actor.items.filter(i => i.system?.attuned).map(i => i.id);
  for (const a of awayOf(actor)) attuned.push(AWAY + a.key);
  const attunedSet = new Set(attuned);
  const stored = actor.getFlag(MODULE, SLOTS);
  const placed = new Set();
  const slots = (Array.isArray(stored) ? stored : []).map(id => {
    if ((typeof id !== "string") || !attunedSet.has(id) || placed.has(id)) return null;
    placed.add(id);
    return id;
  });
  for (const id of attuned) {
    if (placed.has(id)) continue;
    const hole = slots.indexOf(null);
    if (hole >= 0) slots[hole] = id;
    else slots.push(id);
    placed.add(id);
  }
  while (slots.length < max) slots.push(null);
  while ((slots.length > max) && (slots.at(-1) === null)) slots.pop();
  const value = placed.size;
  return { slots, max, value, over: value > max };
}

/**
 * :135–187 — stash's planning loop with randomID/setProperty injected; returns what stash() then
 * writes ({creates, away, slots}) instead of writing it.
 */
export function planStash(owner, itemIds, { tag, currency = false, randomID, setProperty } = {}) {
  tag ??= owner.name.split(/[ ,]/)[0];
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
    data.name = `${item._source.name} (${tag})`;
    if ("equipped" in data.system) data.system.equipped = false;
    if ("attuned" in data.system) data.system.attuned = false;
    setProperty(data, `flags.${MODULE}.${BOND}`, {
      actor: owner.id, key, name: item._source.name,
      equipped: !!item._source.system?.equipped,
      attuned: wasAttuned,
      attunement: item._source.system?.attunement ?? ""
    });
    if (wasAttuned) { away.push({ key, name: item.name, img: item.img }); keyById.set(id, key); }
    const mkey = `${data.type}|${data.name}`;
    const prior = (data.type !== "container" && !wasAttuned) ? merged.get(mkey) : null;
    if (prior && ("quantity" in data.system)) { prior.system.quantity += data.system.quantity ?? 1; continue; }
    merged.set(mkey, data);
    creates.push(data);
  }

  if (currency) {
    const coin = Object.fromEntries(Object.entries(owner.system.currency ?? {}).filter(([, v]) => v > 0));
    if (Object.keys(coin).length) {
      const label = Object.entries(coin).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(", ");
      creates.push({
        name: `Coin Purse (${tag})`, type: "loot", img: "icons/containers/bags/coinpouch-simple-leather-tan.webp",
        system: { quantity: 1, type: { value: "treasure" }, description: { value: `<p>${label}.</p>` } },
        flags: { [MODULE]: { [BOND]: { actor: owner.id, key: randomID(), name: "Coin Purse", currency: coin } } }
      });
    }
  }

  const slots = computeSlots(owner).slots.map(id => keyById.has(id) ? AWAY + keyById.get(id) : id);
  return { creates, away, slots };
}

/** :834–854 */
export const STRINGS = {
  OverBy: "{n} over the limit",
  NotOnActor: "That item belongs to a different actor.",
  NotAttunable: "{name} does not require attunement.",
  WouldExceed: "{actor} is already attuned to {max} items — attuning {name} makes {value}.",
  ArrivedAttuned: "{name} arrived already attuned; {actor} is now over the attunement limit.",
  AwayBody: "Still attuned, but not on {actor}. Its power is dormant until it is back in hand.",
  Release: "End Attunement",
  ReleaseConfirm: "End attunement to <strong>{name}</strong>? It is not on you, so it will come back as an ordinary, unattuned item.",
  SlotHeld: "That slot is held by {name}, which is attuned but not on you. End that attunement first.",
  BackInHand: "{name} is back with {actor} — attunement restored.",
  CoinBack: "{actor} recovers their coin."
};

export function t(key, data = {}) {
  return (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in data ? String(data[k]) : m));
}

/** :891 — the tooltip guard's skip test. */
export const tooltipAnchorMissing = ({ element, tooltip }) => !element || !tooltip;
