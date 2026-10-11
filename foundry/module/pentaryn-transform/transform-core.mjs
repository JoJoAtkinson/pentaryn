/**
 * Pentaryn Transform — pure logic
 * ===============================
 *
 * Plain data in, plain data out: no `game`, no `foundry`, no `CONFIG`. `transform.mjs` and
 * `hud.mjs` turn live documents into the shapes below and act on the answers. `node test/run.mjs`
 * imports this file bare, which is the proof that it stays pure.
 *
 * Shapes
 * ------
 * An **item** is an Item's source object (`item.toObject()`), or anything shaped like one:
 *
 *     { _id, name, type, system: { type: { value }, uses: { spent, max }, hd: { spent },
 *                                  activities: { [id]: { type, activation: { type },
 *                                                        consumption: { targets: [{ type, target }] },
 *                                                        transform: { preset } } } },
 *       flags: { "pentaryn-transform": { revert, keepInForm } } }
 *
 * `system.activities` may also be an array or a Map (a prepared Collection), so the HUD can pass
 * live items through the same functions.
 */

export const MODULE_ID = "pentaryn-transform";

/** The duration effect pushed onto every Wild Shape form. Static, 16 characters. */
export const EFFECT_ID = "pentarynWildShp0";

/** dnd5e's duration units → seconds. A round is six seconds; a turn is counted as one round. */
const UNIT_SECONDS = Object.freeze({
  turn: 6, round: 6, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000
});

/* ── activities ──────────────────────────────────────────────────────────── */

/** The activities of an item, from source data (object or array) or a prepared Collection. */
export function activitiesOf(item) {
  const acts = item?.system?.activities;
  if (!acts) return [];
  if (Array.isArray(acts)) return acts;
  if (typeof acts.values === "function") return Array.from(acts.values());
  return Object.values(acts);
}

/** True for a dnd5e transform activity that uses the Wild Shape preset. */
export function isWildShapeActivity(activity) {
  return activity?.type === "transform" && activity?.transform?.preset === "wildshape";
}

/** The Wild Shape item among `items` (the first item owning a wildshape transform), or null. */
export function findWildShapeItem(items) {
  return (items ?? []).find(i => activitiesOf(i).some(isWildShapeActivity)) ?? null;
}

const consumptionTargets = a => a?.consumption?.targets ?? [];

/* ── shaping the form ────────────────────────────────────────────────────── */

/**
 * Why an item of the host should not come along into the Wild Shape form, or null to keep it.
 *
 * The form must never carry a feature that spends Wild Shape uses or spell slots: dnd5e's revert
 * copies back only HP, temp HP and slots, so a use spent on the form's copy is lost. Species traits
 * with an activity go too — the 2024 rule retains creature type, not species traits.
 *
 * `keepWildShape` is for an unlinked token's form: dnd5e keeps no world actor for that druid, so the
 * form's own copy of Wild Shape is the one the HUD counts and Change Form uses (its uses are
 * carried back by id on revert).
 *
 * @param {object} item
 * @param {{ wildShapeIds: Set<string>|string[], keepWildShape?: boolean }} ctx
 * @returns {"wildshape"|"spends-wildshape"|"spends-slots"|"species"|"no-spellcasting"|null}
 */
export function stripReason(item, { wildShapeIds = [], keepWildShape = false } = {}) {
  if (item?.type !== "feat") return null;
  if (item.flags?.[MODULE_ID]?.keepInForm === true) return null;
  const ws = new Set(wildShapeIds);
  const acts = activitiesOf(item);
  if (ws.has(item._id) || acts.some(isWildShapeActivity)) return keepWildShape ? null : "wildshape";
  for (const a of acts) {
    for (const t of consumptionTargets(a)) {
      if (t?.type === "itemUses" && t.target && ws.has(t.target)) return "spends-wildshape";
    }
  }
  for (const a of acts) {
    if (consumptionTargets(a).some(t => t?.type === "spellSlots")) return "spends-slots";
  }
  if (item.system?.type?.value === "race" && acts.length > 0) return "species";
  // "You can't cast spells": the passive Spellcasting class feature only clutters the form's sheet.
  if (item.system?.type?.value === "class" && item.system?.identifier === "spellcasting" && !acts.length) return "no-spellcasting";
  return null;
}

/**
 * Split the form's item list into what stays and what is stripped. Only the host's own items are
 * considered — the beast's items are never stripped.
 *
 * @param {object[]} items                       the transform data's `d.items`
 * @param {{ wildShapeIds, hostItemIds, keepWildShape }} ctx  ids of the host's Wild Shape item(s) / of
 *        all its items; keepWildShape: see stripReason
 * @returns {{ keep: object[], stripped: { _id, name, reason }[] }}
 */
export function stripForForm(items, { wildShapeIds = [], hostItemIds = null, keepWildShape = false } = {}) {
  const host = hostItemIds ? new Set(hostItemIds) : null;
  const keep = [];
  const stripped = [];
  for (const item of items ?? []) {
    const reason = (!host || host.has(item?._id)) ? stripReason(item, { wildShapeIds, keepWildShape }) : null;
    if (reason) stripped.push({ _id: item._id, name: item.name, reason });
    else keep.push(item);
  }
  return { keep, stripped };
}

/**
 * The form's sheet favorites without the stripped items. dnd5e filters favorites before the
 * transformActor hook runs, so it never sees what the hook strips afterwards.
 *
 * @param {{ type: string, id: string }[]} favorites  `system.favorites` (ids are relative UUIDs)
 * @param {string[]} strippedIds
 * @returns {object[]}
 */
export function pruneFavorites(favorites, strippedIds) {
  const gone = new Set(strippedIds ?? []);
  if (!Array.isArray(favorites) || !gone.size) return favorites;
  return favorites.filter(f => {
    if (!["item", "activity"].includes(f?.type)) return true;
    const id = /\.Item\.([^.]+)/.exec(String(f.id ?? ""))?.[1];
    return !gone.has(id);
  });
}

/** True for the "return to normal form" item. */
export function isRevertData(item) {
  return item?.flags?.[MODULE_ID]?.revert === true;
}

/** Label for the form's revert item: "Return to Talo". */
export function returnLabel(hostName) {
  return `Return to ${hostName}`;
}

/* ── durations ───────────────────────────────────────────────────────────── */

/** Seconds in a dnd5e duration ({ value, units }); null when it is not a finite time span. */
export function durationSeconds(duration) {
  const value = Number(duration?.value);
  const per = UNIT_SECONDS[duration?.units];
  if (!per || !Number.isFinite(value) || value <= 0) return null;
  return value * per;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "6 hours", "5 hours 59 minutes", "10 minutes", "0 minutes". Rounds up to the minute. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.ceil((Number(seconds) || 0) / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return plural(m, "minute");
  return m ? `${plural(h, "hour")} ${plural(m, "minute")}` : plural(h, "hour");
}

/** True once the form's end time has been reached. A form with no end time never expires. */
export function isExpired(endsAt, worldTime) {
  return Number.isFinite(endsAt) && Number.isFinite(worldTime) && worldTime >= endsAt;
}

/* ── uses ────────────────────────────────────────────────────────────────── */

/** Uses left on an item's `system.uses` ({ max, spent }); null when the item has no use limit. */
export function usesLeft(uses) {
  const max = Number(uses?.max);
  if (!Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, max - (Number(uses.spent) || 0));
}

/**
 * Item updates that copy the form's spent uses and spent Hit Dice back onto the original, for every
 * item present on both by id and type. dnd5e's own revert copies only HP, temp HP and spell slots.
 *
 * @param {object[]} formItems      the form's items before revert
 * @param {object[]} originalItems  the original's items after revert
 * @returns {object[]}  updates for `original.updateEmbeddedDocuments("Item", …)`
 */
export function useSyncUpdates(formItems, originalItems) {
  const originals = new Map((originalItems ?? []).map(i => [i._id, i]));
  const updates = [];
  for (const f of formItems ?? []) {
    const o = originals.get(f._id);
    if (!o || o.type !== f.type) continue;
    const u = { _id: f._id };
    const fs = f.system?.uses?.spent;
    if (Number(f.system?.uses?.max) > 0 && Number.isFinite(fs) && fs !== o.system?.uses?.spent) {
      u["system.uses.spent"] = fs;
    }
    const fh = f.system?.hd?.spent;
    if (f.type === "class" && Number.isFinite(fh) && fh !== o.system?.hd?.spent) {
      u["system.hd.spent"] = fh;
    }
    if (Object.keys(u).length > 1) updates.push(u);
  }
  return updates;
}

/** Statuses dnd5e drives from an actor attribute (exhaustion level): carried back as the attribute. */
const ATTRIBUTE_STATUSES = new Set(["exhaustion"]);

/**
 * Condition effects gained while in the form that the original should keep: a Stunned or
 * Unconscious druid is still stunned or unconscious when the form ends. Only effects that carry a
 * status, are not the beast's own, are not this module's duration effect, and whose statuses the
 * original does not already have.
 *
 * @param {object[]} formEffects  the form's effect source objects ({ _id, statuses: string[] })
 * @param {{ originalEffectIds, originalStatuses, sourceEffectIds }} ctx
 * @returns {object[]}  effect data for `original.createEmbeddedDocuments("ActiveEffect", …, { keepId })`
 */
export function carriedConditions(formEffects, { originalEffectIds = [], originalStatuses = [], sourceEffectIds = [] } = {}) {
  const skipIds = new Set([...originalEffectIds, ...sourceEffectIds, EFFECT_ID]);
  const have = new Set(originalStatuses);
  const out = [];
  for (const e of formEffects ?? []) {
    const statuses = Array.from(e?.statuses ?? []);
    if (!statuses.length || skipIds.has(e._id)) continue;
    if (statuses.some(s => ATTRIBUTE_STATUSES.has(s))) continue;
    if (statuses.every(s => have.has(s))) continue;
    statuses.forEach(s => have.add(s));
    out.push(e);
  }
  return out;
}

/**
 * A carried condition's data, ready to embed on the druid: a copy without its origin. The origin
 * points into the form actor, which the revert deletes. dnd5e 6 keeps a second, structured origin
 * on non-condition effects (`system.origin`: item, activity, actor…); both go.
 *
 * @param {object} effect  an effect source object
 * @returns {object}  a shallow copy (with a shallow-copied `system`) minus `origin` and `system.origin`
 */
export function withoutOrigin(effect) {
  const e = { ...effect };
  delete e.origin;
  if (e.system && typeof e.system === "object") {
    e.system = { ...e.system };
    delete e.system.origin;
  }
  return e;
}

/**
 * Effects the druid brought into the form that ended there — Concentration broken by damage, a
 * spell that was dispelled. dnd5e copies the druid's effects into the form under the same ids and
 * never back, so without this the druid returns still concentrating on a spell that already ended.
 *
 * @param {string[]} carriedIds        ids of the druid's effects that went into the form
 * @param {object[]} formEffects       the form's effects before revert ({ _id })
 * @param {object[]} originalEffects   the druid's effects after revert ({ _id, statuses })
 * @returns {string[]}  effect ids to delete from the druid
 */
export function endedInForm(carriedIds, formEffects, originalEffects) {
  const inForm = new Set((formEffects ?? []).map(e => e?._id));
  const orig = new Map((originalEffects ?? []).map(e => [e?._id, e]));
  return [...new Set(carriedIds ?? [])].filter(id => id !== EFFECT_ID && !inForm.has(id) && orig.has(id)
    && !Array.from(orig.get(id)?.statuses ?? []).some(s => ATTRIBUTE_STATUSES.has(s)));
}

/**
 * Exhaustion and Heroic Inspiration gained or spent in the form. dnd5e copies both into the form
 * and neither back. In dnd5e 6 the prepared level is read from the `dnd5eexhaustion` effect's
 * `system.level`, and writing `system.attributes.exhaustion` still turns into that effect
 * (`Actor5e#_onUpdateExhaustion` applies the delta), so the attribute is the one thing to write.
 *
 * @param {{ exhaustion?: number, inspiration?: boolean }} form
 * @param {{ exhaustion?: number, inspiration?: boolean }} original
 * @returns {object}  an update for the original actor (empty when nothing changed)
 */
export function attributeSync(form, original) {
  const u = {};
  if (Number.isFinite(form?.exhaustion) && form.exhaustion !== original?.exhaustion) {
    u["system.attributes.exhaustion"] = form.exhaustion;
  }
  if (typeof form?.inspiration === "boolean" && form.inspiration !== original?.inspiration) {
    u["system.attributes.inspiration"] = form.inspiration;
  }
  return u;
}

/* ── can the druid shift now ─────────────────────────────────────────────── */

/**
 * Why a shift must not start, or null. Checked before any use is spent.
 *
 * - busy: a shift for this druid is already in flight (a double-click would spend two uses).
 * - cannot: no permission to transform (dnd5e would refuse after the use is spent).
 * - incapacitated / zeroHP: the form would be created already over — dnd5e embeds the conditions at
 *   creation, which fires no effect hooks, so it would never end by itself.
 * - noToken: dnd5e swaps only tokens on the viewed scene; with none there the form is an orphan
 *   actor the GM sweep deletes, and the use is gone.
 * - noUses: none left (null uses = unlimited).
 *
 * @returns {"busy"|"cannot"|"incapacitated"|"zeroHP"|"noToken"|"noUses"|null}
 */
export function shiftBlock({ busy = false, canTransform = true, incapacitated = false, hp = null, hasToken = true, usesLeft = null } = {}) {
  if (busy) return "busy";
  if (!canTransform) return "cannot";
  if (incapacitated) return "incapacitated";
  if (Number.isFinite(hp) && hp <= 0) return "zeroHP";
  if (!hasToken) return "noToken";
  if (usesLeft === 0) return "noUses";
  return null;
}

/* ── who acts ────────────────────────────────────────────────────────────── */

/**
 * The one user whose client performs an automatic revert: the active GM, else the first active
 * owner by id. Every client sees the same hook; exactly one must act on it.
 *
 * @param {{ activeGMId: string|null, ownerIds: string[] }} who  ownerIds: active non-GM owners
 * @returns {string|null}
 */
export function pickRunner({ activeGMId = null, ownerIds = [] } = {}) {
  if (activeGMId) return activeGMId;
  return [...ownerIds].sort()[0] ?? null;
}

/* ── text ────────────────────────────────────────────────────────────────── */

/** "a Dire Wolf", "an Ape". */
export function withArticle(name) {
  const s = String(name ?? "").trim();
  return `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`;
}

/** CR as printed: 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2", 1 → "1". */
export function formatCR(cr) {
  const n = Number(cr);
  if (!Number.isFinite(n)) return "—";
  if (n === 0.125) return "1/8";
  if (n === 0.25) return "1/4";
  if (n === 0.5) return "1/2";
  return String(n);
}

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Tooltip lines for a beast form, from a normalised summary of the source actor.
 *
 * @param {{ cr, sizeLabel, typeLabel, ac, movement: object, units, senses: object,
 *           attacks: { name, toHit, damage }[], traits: string[] }} f
 * @returns {{ subtitle: string, details: { label: string, value: string }[], traits: string[] }}
 */
export function formSummary(f) {
  const units = f?.units || "ft";
  const subtitle = `CR ${formatCR(f?.cr)} ${[f?.sizeLabel, cap(f?.typeLabel)].filter(Boolean).join(" ")}`.trim();
  const order = ["walk", "burrow", "climb", "fly", "swim"];
  // dnd5e 6 keeps speeds under movement.speeds (the flat keys are a shim until 7.0).
  const speed = k => f?.movement?.speeds?.[k] ?? f?.movement?.[k];
  const moves = order
    .filter(k => Number(speed(k)) > 0)
    .map(k => `${k === "walk" ? "" : `${k} `}${speed(k)} ${units}`.trim());
  if (moves.length && f?.movement?.hover) moves[moves.length - 1] += " (hover)";
  const senses = Object.entries(f?.senses ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${cap(k)} ${v} ${units}`);
  const details = [{ label: "AC", value: String(f?.ac ?? "—") }];
  if (moves.length) details.push({ label: "Speed", value: moves.join(", ") });
  if (senses.length) details.push({ label: "Senses", value: senses.join(", ") });
  for (const a of f?.attacks ?? []) {
    details.push({ label: a.name, value: [a.toHit, a.damage].filter(Boolean).join(", ") || "—" });
  }
  return { subtitle, details, traits: [...(f?.traits ?? [])] };
}

/* ── HUD composition plans ───────────────────────────────────────────────── */

/**
 * The Bonus bar, rebuilt. Argon pairs class features into split buttons, so Wild Shape, Starry
 * Form and Return to Normal Form arrive in whatever pairs the item order made.
 *
 * @param {{ kind: "weaponSet"|"item"|"split"|"other", id?: string, ids?: string[] }[]} slots
 *        Argon's buttons in order; `item`/`split` carry the item ids they show
 * @param {{ wildShapeId: string|null, revertIds: string[], shifted: boolean, revertId: string|null,
 *           hasWildShape: boolean, starryId?: string|null }} ctx
 *        wildShapeId: the Wild Shape item on THIS actor (null when shifted, it is stripped);
 *        revertId: the revert item to show while shifted (none: a synthesized Return,
 *        `{ revert: true }`, takes its place); hasWildShape: whether the
 *        original can Wild Shape at all; starryId: the Starry Form item, replaced by the module's
 *        own Starry Form button right after Wild Shape (normal form only)
 * @returns {({ keep: number } | { item: string, highlight?: boolean } | { revert: true, highlight: true } | { wildshape: true } | { starry: true })[]}
 *          keep = index into `slots`; item = a fresh full-size button for that item id
 */
export function planBonusBar(slots, { wildShapeId = null, revertIds = [], shifted = false, revertId = null, hasWildShape = false, starryId = null } = {}) {
  const reverts = new Set(revertIds);
  const ours = id => id === wildShapeId || reverts.has(id) || (!!starryId && id === starryId);
  const out = [];
  let placedWildShape = false;
  let placedStarry = false;
  const placeWildShape = () => {
    if (!shifted && hasWildShape && !placedWildShape) { out.push({ wildshape: true }); placedWildShape = true; }
  };
  const placeStarry = () => {
    if (shifted || !starryId || placedStarry) return;
    placeWildShape();                    // Starry Form always sits right after Wild Shape
    out.push({ starry: true });
    placedStarry = true;
  };
  slots.forEach((s, index) => {
    if (s.kind === "item") {
      if (s.id === wildShapeId) return placeWildShape();
      if (starryId && s.id === starryId) return placeStarry();
      if (reverts.has(s.id)) return;
      return out.push({ keep: index });
    }
    if (s.kind === "split") {
      const ids = s.ids ?? [];
      if (!ids.some(ours)) return out.push({ keep: index });
      if (ids.includes(wildShapeId)) placeWildShape();
      if (starryId && ids.includes(starryId)) placeStarry();
      for (const id of ids) if (!ours(id)) out.push({ item: id });
      return;
    }
    out.push({ keep: index });
  });
  if (!shifted) {
    placeWildShape();
    if (starryId) placeStarry();
    return out;
  }
  const front = [];
  // No hand-made revert item on this form: a Return button of the module's own (PT3-3).
  front.push(revertId ? { item: revertId, highlight: true } : { revert: true, highlight: true });
  if (hasWildShape) front.push({ wildshape: true });
  const ws = slots.findIndex(s => s.kind === "weaponSet");
  const at = ws < 0 ? 0 : out.findIndex(o => o.keep === ws) + 1;
  out.splice(at, 0, ...front);
  return out;
}

/**
 * The beast's attacks for the Action bar front row: every weapon whose first activity is an action,
 * and every monster feature (Multiattack) with an action activity. Items already on the bar are
 * skipped.
 *
 * @param {object[]} items       the form's items (source-shaped or live)
 * @param {string[]} [onBar=[]]  item ids Argon already shows as top-level buttons
 * @returns {string[]}  item ids, weapons first, in item order
 */
export function frontRowItems(items, onBar = []) {
  const skip = new Set(onBar);
  const weapons = [];
  const features = [];
  for (const item of items ?? []) {
    if (skip.has(item._id ?? item.id)) continue;
    const acts = activitiesOf(item);
    if (item.type === "weapon" && acts[0]?.activation?.type === "action") weapons.push(item._id ?? item.id);
    else if (item.type === "feat" && item.system?.type?.value === "monster"
      && acts.some(a => a?.activation?.type === "action")) features.push(item._id ?? item.id);
  }
  return [...weapons, ...features];
}

/**
 * True when an Argon "Use Feature"-style panel button holds nothing the front row doesn't already
 * show (a Brown Bear's panel holds only Multiattack, which is a front-row button), so it can go.
 *
 * @param {string[]} panelItemIds  ids of the items the panel button lists
 * @param {string[]} frontIds      ids of the items with their own button on the bar
 * @returns {boolean}
 */
export function coveredPanel(panelItemIds, frontIds) {
  const ids = (panelItemIds ?? []).filter(Boolean);
  if (!ids.length) return false;
  const front = new Set(frontIds ?? []);
  return ids.every(id => front.has(id));
}

/* ── hit points ──────────────────────────────────────────────────────────── */

/**
 * Temporary Hit Points don't stack: on assuming a form the druid keeps the better of what they had
 * and what Wild Shape grants (dnd5e's preset always overwrites with the grant).
 */
export function formTempHP(hostTemp, grantTemp) {
  const a = Math.max(0, Number(hostTemp) || 0);
  const b = Math.max(0, Number(grantTemp) || 0);
  return Math.max(a, b);
}

/**
 * The portrait's HP figures. Argon prints value + temp over max ("111/99"), which reads as more HP
 * than the druid has; with temp HP this gives "99+12" over "99".
 *
 * @param {{ value: number, temp?: number, max: number, tempmax?: number }} hp
 * @returns {{ current: string, max: string, hasTemp: boolean }}
 */
export function hpText(hp) {
  const value = Number(hp?.value) || 0;
  const temp = Math.max(0, Number(hp?.temp) || 0);
  const max = (Number(hp?.max) || 0) + (Number(hp?.tempmax) || 0);
  return { current: temp ? `${value}+${temp}` : String(value), max: String(max), hasTemp: temp > 0 };
}

/**
 * Another panel, minus some items: a split button holding one of them becomes a full-size button
 * for its partner; a plain button for one of them goes. Starry Form's Chalice and Dragon are
 * "special" activations, so Argon also lists it on the Special bar; its button on the Bonus bar is
 * the one place it lives.
 *
 * @param {{ kind, id?, ids? }[]} slots  as for planBonusBar
 * @param {string[]} dropIds
 * @returns {({ keep: number } | { item: string })[]|null}  null when nothing changes
 */
export function planWithout(slots, dropIds) {
  const drop = new Set((dropIds ?? []).filter(Boolean));
  if (!drop.size) return null;
  let changed = false;
  const out = [];
  slots.forEach((s, index) => {
    if (s.kind === "item" && drop.has(s.id)) { changed = true; return; }
    if (s.kind === "split" && (s.ids ?? []).some(id => drop.has(id))) {
      changed = true;
      for (const id of s.ids) if (id && !drop.has(id)) out.push({ item: id });
      return;
    }
    out.push({ keep: index });
  });
  return changed ? out : null;
}

/* ── Starry Form (Circle of the Stars) ───────────────────────────────────── */

/** The three constellations, in the PHB's order. */
export const CONSTELLATIONS = Object.freeze(["archer", "chalice", "dragon"]);

/** Bright 10 ft, Dim 10 ft beyond it — Foundry's dim radius is measured from the token. */
export const STARRY_LIGHT = Object.freeze({
  bright: 10, dim: 20, color: "#cfe0ff", alpha: 0.35, luminosity: 0.5, coloration: 1,
  animation: { type: "starlight", speed: 2, intensity: 3, reverse: false }
});

/** Starry Form lasts 10 minutes. */
export const STARRY_SECONDS = 600;

/** The constellation an activity stands for, from its name ("Archer" → "archer"), or null. */
export function constellationOfActivity(activity) {
  const n = String(activity?.name ?? "").trim().toLowerCase();
  return CONSTELLATIONS.find(c => n === c || n.startsWith(`${c} `)) ?? null;
}

/**
 * The Starry Form effect for the druid: the feature's own base effect (or the Dragon's, whose
 * changes give the roll floors and, with Twinkling Constellations, Fly 20 and hover), renamed for
 * the constellation, enabled, not transferred, timed from now.
 *
 * @param {{ base: object|null, constellation: string, label: string, img?: string, now: number,
 *           seconds?: number, description?: string, origin?: string, id: string }} args
 *        base: the item effect's source (`effect.toObject()`), or null for a bare effect
 * @returns {object}  ActiveEffect data for `createEmbeddedDocuments(..., { keepId: true })`
 */
export function starryEffectData({ base = null, constellation, label, img, now, seconds = STARRY_SECONDS, description = "", origin, id }) {
  const src = base ? JSON.parse(JSON.stringify(base)) : {};
  delete src._stats;
  delete src.folder;
  delete src.sort;
  const data = {
    ...src,
    _id: id,
    name: `Starry Form: ${label}`,
    img: img || src.img || "icons/magic/symbols/star-solid-gold.webp",
    transfer: false,
    disabled: false,
    duration: { value: seconds, units: "seconds", expiry: null },
    start: { time: now },
    description,
    flags: { ...(src.flags ?? {}), [MODULE_ID]: { starry: { constellation } } }
  };
  if (origin) data.origin = origin;
  return data;
}

/** Change keys that grant a fly speed: dnd5e 6's key and the pre-6 one (stored PHB effects keep it). */
const FLY_KEYS = Object.freeze(["system.attributes.movement.speeds.fly", "system.attributes.movement.fly"]);

/**
 * Does this effect grant a fly speed? Picks Twinkling Constellations' Dragon effect (Fly 20) over
 * the plain one. Changes sit at `changes` (pre-v14 source) or `system.changes`.
 * @param {object} effect  an ActiveEffect or its source
 * @returns {boolean}
 */
export function grantsFly(effect) {
  const changes = effect?.changes ?? effect?.system?.changes ?? [];
  return (Array.isArray(changes) ? changes : []).some(ch => FLY_KEYS.some(k => String(ch?.key ?? "").startsWith(k)));
}

/**
 * Can the druid take on (or change) a starry form now? Checked before any use is spent.
 * - shifted: Starry Form is taken "rather than shape-shifting".
 * - incapacitated: the form would end at once.
 * - noUses: none left (only when a use would be spent).
 * @returns {"shifted"|"incapacitated"|"noUses"|null}
 */
export function starryBlock({ shifted = false, incapacitated = false, usesLeft = null, spends = true } = {}) {
  if (shifted) return "shifted";
  if (incapacitated) return "incapacitated";
  if (spends && usesLeft === 0) return "noUses";
  return null;
}

/**
 * Is this token update a body swap: a transform or a revert putting another actor (or a polymorphed
 * delta) on the token? Such an update must not animate (transform.mjs, preUpdateToken): core's token
 * animation writes its in-flight values back onto the TokenDocument every frame, and in a tab whose
 * canvas is not ticking (a background tab) it never finishes, so the document kept the old form's
 * art and size, dnd5e saved those stale values as previousTokenData, and the revert brought the
 * first form's art back (Area 4 live run, D4).
 *
 * @param {object} changes            the update's changes (root keys may be wrapped by core)
 * @param {object} [o]
 * @param {string|null} [o.actorId]   the token's current actorId
 * @param {Function} [o.unwrap]       turns a core field operator into its plain value
 * @returns {boolean}
 */
export function isBodySwap(changes, { actorId = null, unwrap = v => v } = {}) {
  if (!changes || typeof changes !== "object") return false;
  if (Object.hasOwn(changes, "actorId")) {
    const next = unwrap(changes.actorId);
    if (next !== actorId) return true;
  }
  for (const key of ["previousTokenData", "previousActorData"]) {
    if (Object.hasOwn(changes, `flags.dnd5e.${key}`)) return true;
    const flags = unwrap(changes.flags);
    const dnd5e = flags && typeof flags === "object" ? unwrap(flags.dnd5e) : null;
    if (dnd5e && typeof dnd5e === "object" && Object.hasOwn(dnd5e, key)) return true;
  }
  return false;
}
