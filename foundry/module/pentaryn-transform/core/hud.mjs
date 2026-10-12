/**
 * Pentaryn Transform — pure HUD rules: text for a beast's tooltip, the Bonus/Action/Special bar
 * plans, Hit Point text. Plain data in, plain data out.
 */

import { activitiesOf, formatDuration } from "./wildshape.mjs";

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
 *           hasWildShape: boolean, starryId?: string|null, ownReturn?: boolean }} ctx
 *        wildShapeId: the Wild Shape item on THIS actor (null when shifted, it is stripped);
 *        revertId: the revert item to show while shifted (none: a synthesized Return,
 *        `{ revert: true }`, takes its place when `ownReturn` — a Wild Shape form, not a
 *        Polymorph spell); hasWildShape: whether the
 *        original can Wild Shape at all; starryId: the Starry Form item, replaced by the module's
 *        own Starry Form button right after Wild Shape (normal form only)
 * @returns {({ keep: number } | { item: string, highlight?: boolean } | { revert: true, highlight: true } | { wildshape: true } | { starry: true })[]}
 *          keep = index into `slots`; item = a fresh full-size button for that item id
 */
export function planBonusBar(slots, { wildShapeId = null, revertIds = [], shifted = false, revertId = null, hasWildShape = false, starryId = null, ownReturn = true } = {}) {
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
  if (revertId) front.push({ item: revertId, highlight: true });
  else if (ownReturn) front.push({ revert: true, highlight: true });
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

/* ── seams the HUD glue reads through (transform-creatures-6, -10, -11, -13) ── */

/**
 * A beast source → the normalised summary formSummary() takes (its tile tooltip).
 * @param {object} src  the source actor (live or source-shaped): system, items
 * @param {{ actorSizes: object, creatureTypes: object }} cfg  CONFIG.DND5E's two label maps
 */
export function summaryFromSource(src, cfg) {
  const s = src.system;
  const attacks = [];
  const traits = [];
  for (const item of src.items) {
    const acts = activitiesOf(item);
    const attack = acts.find(a => a.type === "attack");
    if (item.type === "weapon" || attack) {
      const a = attack ?? acts[0];
      const dmg = a?.labels?.damage ?? item.labels?.damages ?? [];
      attacks.push({
        name: item.name,
        toHit: a?.labels?.toHit ?? item.labels?.toHit ?? "",
        damage: (Array.isArray(dmg) ? dmg : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + ")
      });
    } else if (item.type === "feat" && item.system.type?.value === "monster" && !acts.length) {
      traits.push(item.name);                 // passive only: Multiattack and Web are front-row buttons
    }
  }
  return {
    cr: s.details?.cr,
    sizeLabel: cfg.actorSizes[s.traits?.size]?.label ?? "",
    typeLabel: cfg.creatureTypes[s.details?.type?.value]?.label ?? s.details?.type?.value ?? "",
    ac: s.attributes?.ac?.value,
    movement: s.attributes?.movement ?? {},
    units: s.attributes?.movement?.units || "ft",
    senses: s.attributes?.senses?.ranges ?? {},
    attacks, traits
  };
}

/**
 * "Long Rest: all · Short Rest: 1" from an item's `system.uses.recovery`.
 * @param {{ period, type, formula }[]} recovery
 * @param {object} periods    CONFIG.DND5E.limitedUsePeriods
 * @param {string} allLabel   the localized word for "recover all"
 */
export function recoveryLines(recovery, periods, allLabel) {
  return (recovery ?? []).map(r => {
    const when = periods[r.period]?.label ?? r.period;
    const what = r.type === "recoverAll" ? allLabel : (r.formula || "1");
    return `${when}: ${what}`;
  }).join(" · ");
}

/**
 * The portrait line's data while a form or Starry Form is up: `{ what, left }` (left a duration
 * text, or null when the end time is unknown), or null for no line. The glue localizes it.
 * @param {{ ws: { name }|null, endsAt?: number|null, starry: { name }|null, starryLeft?: number|null, worldTime: number }} o
 */
export function portraitText({ ws = null, endsAt = null, starry = null, starryLeft, worldTime = 0 } = {}) {
  if (ws) return { what: ws.name, left: Number.isFinite(endsAt) ? formatDuration(endsAt - worldTime) : null };
  if (starry) return { what: starry.name, left: starryLeft !== null ? formatDuration(starryLeft) : null };
  return null;
}

/**
 * The Chalice is earned by a leveled spell cast with a slot whose activity heals (a heal activity,
 * or a healing / temp HP damage part).
 * @param {object} activity     { type, item: { type, system: { level } }, damage: { parts: [{ types }] } }
 * @param {object} usageConfig  { consume: { spellSlot } }
 */
export function earnsChalice(activity, usageConfig) {
  const item = activity?.item;
  if (item?.type !== "spell" || !(Number(item.system?.level) > 0)) return false;
  if (usageConfig?.consume?.spellSlot === false) return false;
  if (activity.type === "heal") return true;
  const parts = activity.damage?.parts ?? [];
  return parts.some(p => (p.types instanceof Set ? [...p.types] : (p.types ?? [])).some(t => t === "healing" || t === "temphp"));
}

/**
 * U-4-1: the form's Multiattack item id when pentaryn-combat's Full Attack runs it, else null (keep
 * the text-only Multiattack button). Inputs are what the glue read from combat.
 * @param {{ active: boolean, fullAttack: boolean, multiattack: boolean, ma: { source, total }|null, hasItem: (id) => boolean }} o
 */
export function coveredMultiattackId({ active, fullAttack, multiattack, ma, hasItem }) {
  if (!active) return null;
  if (!fullAttack || !multiattack) return null;
  if (!ma || ma.source === "flag" || (ma.total ?? 0) < 2 || !hasItem(ma.source)) return null;
  return ma.source;
}

/**
 * Drop the buttons that left the DOM after rendering (a panel was built) from a live-button set;
 * never-rendered ones stay, as refreshLive leaves them (transform-creatures-10).
 * @param {Set<{ element: { isConnected: boolean }, panel?: object }>} set  mutated
 * @returns {number}  how many were dropped
 */
export function pruneDisconnected(set) {
  let n = 0;
  for (const x of set) {
    if (!x.element?.isConnected && x.panel) {
      set.delete(x);
      n += 1;
    }
  }
  return n;
}

/**
 * Does a pointer move need the stale-tooltip check? Only when a tooltip is up, its anchor has left
 * the DOM, and no check is queued yet (transform-creatures-11).
 * @param {{ anchor: { isConnected: boolean }|null, queued: boolean }} o
 */
export function shouldQueueStaleCheck({ anchor = null, queued = false } = {}) {
  return !!anchor && !anchor.isConnected && !queued;
}
