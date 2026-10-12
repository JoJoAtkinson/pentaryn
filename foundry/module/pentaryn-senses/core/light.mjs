/**
 * Pure helpers for the Light cantrip and lit items (carried.mjs, light.mjs, light-ui.mjs,
 * core/inspect.mjs). No Foundry globals, so test/light-core.test.mjs proves them in node.
 * Design: context/plans/senses-light-cantrip.md.
 *
 *   Item (Light spell)   flags.pentaryn-senses.lightCast  = { scene, token } | { scene, x, y } | null
 *   Token / AmbientLight flags.pentaryn-senses.spellLight = { source: "<Light item uuid>", prior }
 *   Item (torch, lamp…)  flags.pentaryn-senses.lit / .hooded / .lightItem (profile override)
 *
 * Foundry's `dim` is the OUTER radius, so dim = bright + the rules' extra dim ring.
 *
 * Who owns a token's light (the contract pentaryn-creatures and pentaryn-transform rely on), in order:
 *   1. spellLight — the Light cantrip holds it until the spell ends; nothing else writes over it;
 *   2. itemLight  — a carried light (itemLightUpdate) holds it while the item is carried, keeping the
 *                   hand-set light it covered in itemLightPrior and restoring it afterwards;
 *   3. hand-set   — anything else (a GM's rune glow) is never touched.
 */

import { FLAGS, MODULE } from "./ids.mjs";
export { MODULE };

/** A light that gives nothing. Written when a carried or spell light ends with nothing before it. */
export const DARK = Object.freeze({
  dim: 0, bright: 0, color: null, alpha: 0.5, luminosity: 0.5,
  animation: Object.freeze({ type: null, speed: 5, intensity: 5, reverse: false })
});

/**
 * A token update only replaces the light fields it names. These two are written every time so a
 * light laid over a darkness source (`negative`) or a light limited to a darkness range still
 * shines as a plain light.
 */
const PLAIN = Object.freeze({ negative: false, darkness: Object.freeze({ min: 0, max: 1 }) });

/** The Light cantrip: bright 20, dim 20 more. Steady, pale, magical; not a flame. */
export const SPELL_LIGHT = Object.freeze({
  bright: 20, dim: 40, angle: 360, color: "#ffe9b8", alpha: 0.35, luminosity: 0.5, ...PLAIN,
  animation: Object.freeze({ type: null, speed: 5, intensity: 5, reverse: false })
});

const flame = (speed, intensity) => Object.freeze({ type: "torch", speed, intensity, reverse: false });

/** Mundane light sources by dnd5e item identifier (2024 PHB values). */
export const LIGHT_PROFILES = Object.freeze({
  torch: Object.freeze({ bright: 20, dim: 40, angle: 360, color: "#ff9a3c", alpha: 0.4, luminosity: 0.5, ...PLAIN, animation: flame(2, 2) }),
  candle: Object.freeze({ bright: 5, dim: 10, angle: 360, color: "#ffb35c", alpha: 0.3, luminosity: 0.5, ...PLAIN, animation: flame(3, 3) }),
  lamp: Object.freeze({ bright: 15, dim: 45, angle: 360, color: "#ffc266", alpha: 0.35, luminosity: 0.5, ...PLAIN, animation: flame(1, 1) }),
  "lantern-hooded": Object.freeze({
    bright: 30, dim: 60, angle: 360, color: "#ffc266", alpha: 0.35, luminosity: 0.5, ...PLAIN, animation: flame(1, 1),
    hooded: Object.freeze({ bright: 0, dim: 5 })
  }),
  // A bullseye's cone would follow token rotation, which players never set: omnidirectional for now.
  "lantern-bullseye": Object.freeze({ bright: 60, dim: 120, angle: 360, color: "#ffc266", alpha: 0.35, luminosity: 0.5, ...PLAIN, animation: flame(1, 1) })
});

/** Other spellings of the same item, by slugged name. */
const ALIASES = Object.freeze({
  "torches": "torch",
  "candles": "candle",
  "oil-lamp": "lamp",
  "hooded-lantern": "lantern-hooded",
  "bullseye-lantern": "lantern-bullseye"
});

/** The compendium actor the PHB Light spell summons. */
export const PHB_LIGHT_ACTOR = "phbsplLight00000";

/** The activity id setupLight() gives a Torch, so running it twice adds nothing. */
export const TORCH_ACTIVITY_ID = "psLightToggle000";

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const str = v => (typeof v === "string" ? v.trim() : "");
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clone = v => JSON.parse(JSON.stringify(v));

function flagsOf(doc) {
  try {
    const f = doc?.flags?.[MODULE];
    return isObj(f) ? f : {};
  } catch {
    return {};
  }
}

/** "Lantern, Hooded" → "lantern-hooded". */
export function slug(name) {
  return String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** The profile key for an item: its dnd5e identifier, else its name. Null when it isn't a light. */
export function profileKey(item) {
  for (const raw of [str(item?.system?.identifier), slug(item?.name)]) {
    if (!raw) continue;
    const key = ALIASES[raw] ?? raw;
    if (Object.hasOwn(LIGHT_PROFILES, key)) return key;
  }
  return null;
}

/** A usable light profile: a `lightItem` flag override (a magic lantern), else the table. Never throws. */
export function profileFor(item) {
  try {
    if (!item || item.type === "spell") return null;
    const own = flagsOf(item).lightItem;
    if (isObj(own) && (num(own.dim) !== null || num(own.bright) !== null)) return own;
    const key = profileKey(item);
    return key ? LIGHT_PROFILES[key] : null;
  } catch {
    return null;
  }
}

/** Token light data for a profile, as a fresh object. `hooded` swaps in the profile's hooded radii. */
export function lightFor(profile, { hooded = false } = {}) {
  if (!isObj(profile)) return null;
  const { hooded: shut, ...light } = clone(profile);
  if (hooded && isObj(shut)) Object.assign(light, shut);
  return light;
}

/** The light that matters most: largest dim radius, then bright. Null for none. */
export function strongest(lights) {
  let best = null;
  for (const l of lights ?? []) {
    if (!isObj(l)) continue;
    if (!best) { best = l; continue; }
    const d = (num(l.dim) ?? 0) - (num(best.dim) ?? 0);
    if (d > 0 || (d === 0 && (num(l.bright) ?? 0) > (num(best.bright) ?? 0))) best = l;
  }
  return best;
}

/**
 * Each item that gives light now, with the light it gives: [{ id, name, kind, hooded, light }].
 * `kind` is "shard" for a fixed `light` flag (always on), "lit" for a lit torch, lamp or lantern.
 */
export function lightEntries(items) {
  const out = [];
  for (const item of items ?? []) {
    if (!item || (item.system?.quantity ?? 1) <= 0) continue;
    const f = flagsOf(item);
    const who = { id: item.id ?? null, name: item.name ?? null };
    if (isObj(f.light)) out.push({ ...who, kind: "shard", hooded: false, light: f.light });
    else if (f.lit === true) {
      const l = lightFor(profileFor(item), { hooded: f.hooded === true });
      if (l) out.push({ ...who, kind: "lit", hooded: f.hooded === true, light: l });
    }
  }
  return out;
}

/**
 * The light an actor's items give: a shard's fixed `light` flag always counts; a torch, lamp or
 * lantern counts while `lit`. Items with quantity 0 count for nothing.
 */
export function carriedLightOf(items) {
  return strongest(lightEntries(items).map(e => e.light));
}

/**
 * Which item's light the token shows (the one carriedLightOf picks), or null. With a torch and a
 * hooded lantern both lit, only one of them lights the token; the sheet marks the other so the
 * player can see why lowering the hood changed nothing (usability Area 8, L5).
 */
export function lightingItemId(items) {
  const entries = lightEntries(items);
  const best = strongest(entries.map(e => e.light));
  return best ? (entries.find(e => e.light === best)?.id ?? null) : null;
}

export const isLit = item => flagsOf(item).lit === true;
export const isHooded = item => flagsOf(item).hooded === true;

function activityList(item) {
  const acts = item?.system?.activities;
  if (!acts) return [];
  if (typeof acts.values === "function") return [...acts.values()];
  return isObj(acts) ? Object.values(acts) : [];
}

/** Is this item the Light cantrip? By identifier, or by its summon of the PHB "Light" actor. */
export function isLightSpellData(item) {
  try {
    if (item?.type !== "spell") return false;
    if (str(item.system?.identifier) === "light") return true;
    return activityList(item).some(a => a?.type === "summon"
      && (a.profiles ?? []).some(p => str(p?.uuid).endsWith(`.${PHB_LIGHT_ACTOR}`)));
  } catch {
    return false;
  }
}

/** Does using this activity mean "light / douse this item" rather than its own effect? */
export function isLightToggle(activity, item) {
  try {
    if (!activity || !item) return false;
    if (activity.flags?.[MODULE]?.lightToggle === true) return true;
    return activity.type === "utility" && !!profileFor(item);
  } catch {
    return false;
  }
}

/** The Light item's desired target, sanitised: {scene, token} | {scene, x, y} | null. Never throws. */
export function readSpellCast(item) {
  const raw = flagsOf(item).lightCast;
  if (!isObj(raw)) return null;
  const scene = str(raw.scene);
  if (!scene) return null;
  const token = str(raw.token);
  if (token) return { scene, token };
  const x = num(raw.x), y = num(raw.y);
  if (x === null || y === null) return null;
  return { scene, x: Math.round(x), y: Math.round(y) };
}

/**
 * The flag a cast writes. `at` stamps it so recasting at the same target still reaches the GM.
 * Foundry MERGES an object written into flags with the one already there, so the other shape's
 * keys are written as null: without that, a square cast after a token cast keeps the old `token`
 * and readSpellCast() still answers "that token".
 */
export function castFlag(sceneId, target, at = 0) {
  const scene = str(sceneId);
  if (!scene || !isObj(target)) return null;
  const token = str(target.token);
  if (token) return { scene, token, x: null, y: null, at };
  const x = num(target.x), y = num(target.y);
  if (x === null || y === null) return null;
  return { scene, token: null, x: Math.round(x), y: Math.round(y), at };
}

/** A token's or AmbientLight's spell-light marker: {source, prior} or null. Never throws. */
export function readSpellLight(doc) {
  const raw = flagsOf(doc).spellLight;
  if (!isObj(raw)) return null;
  const source = str(raw.source);
  if (!source) return null;
  return { source, prior: isObj(raw.prior) ? raw.prior : null };
}

/**
 * What the GM must do so exactly one light matches the desired target.
 *
 *   desired   {scene, token} | {scene, x, y} | null   (token scene already resolved)
 *   existing  [{kind: "token"|"ambient", scene, id, x?, y?}]   every doc lit by this source
 *
 * → { restore: [{scene, id}], remove: [{scene, id}], light: {scene, token} | null,
 *     create: {scene, x, y} | null }
 */
export function planSpellLight({ desired = null, existing = [] } = {}) {
  const plan = { restore: [], remove: [], light: null, create: null };
  let kept = false;
  for (const e of existing ?? []) {
    if (!e?.id) continue;
    const match = !kept && !!desired && e.scene === desired.scene && (e.kind === "token"
      ? desired.token === e.id
      : !desired.token && Math.round(e.x) === desired.x && Math.round(e.y) === desired.y);
    if (match) { kept = true; continue; }
    (e.kind === "token" ? plan.restore : plan.remove).push({ scene: e.scene, id: e.id });
  }
  if (desired && !kept) {
    if (desired.token) plan.light = { scene: desired.scene, token: desired.token };
    else plan.create = { scene: desired.scene, x: desired.x, y: desired.y };
  }
  return plan;
}

/**
 * The `_id` a Light square is created with (`keepId`): 16 hex characters from the Light item's uuid
 * and the square's spot. Both tabs of the active GM (the MCP bridge and a browser) reconcile, so both
 * send the same create; the server takes one and refuses the other ("already exists"), and the
 * Light never gets a twin square (senses-ac-1). The spot is in the id so a recast to a new square
 * never reuses the id of the square it replaces, which the other tab may still be deleting.
 */
export function squareId(source, scene, x, y) {
  const key = `${str(source)}|${str(scene)}|${Math.round(x)}|${Math.round(y)}`;
  const fnv = seed => {
    let h = seed;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x050c5d1f);
}

/**
 * The token update that hands its light to the spell. `current` is the token's light right now.
 * A token already lit by another caster keeps the first `prior`, so ending either restores the
 * light it had before any spell.
 */
export function spellLightUpdate(doc, source, current) {
  const had = readSpellLight(doc);
  const prior = had ? had.prior : (isObj(current) ? clone(current) : null);
  return { light: clone(SPELL_LIGHT), [FLAGS.spellLight]: { source, prior } };
}

/** The light a token goes back to when the spell leaves it. */
export function restoredLight(doc) {
  const had = readSpellLight(doc);
  return clone(had?.prior ?? DARK);
}

/** Item uuids that live under a deleted parent (actor, token, scene). */
export function sourcesUnder(sources, parentUuid) {
  const p = str(parentUuid);
  if (!p) return [];
  return [...(sources ?? [])].filter(s => typeof s === "string" && s.startsWith(`${p}.`));
}

/** Is this a compendium source of the PHB "Light" actor (the old floor-token summon)? */
export const isPHBLightActorSource = s => str(s).endsWith(`.${PHB_LIGHT_ACTOR}`);

/** The activity setupLight() adds to a Torch: "Light", one action, consumes nothing. */
export function torchActivityData(name = "Light") {
  return {
    _id: TORCH_ACTIVITY_ID,
    type: "utility",
    name,
    img: "icons/sundries/lights/torch-brown-lit.webp",
    activation: { type: "action", value: 1, condition: "", override: false },
    consumption: { scaling: { allowed: false, max: "" }, spellSlot: false, targets: [] },
    duration: { units: "inst", concentration: false, override: false },
    range: { units: "self", override: false },
    target: { prompt: false, override: false },
    flags: { [MODULE]: { lightToggle: true } }
  };
}

/**
 * The update that brings a token (or a prototype) in line with its carried light, or null
 * (carried.mjs `lightUpdate`, finding -12). A hand-set light that a carried light covers is kept in
 * itemLightPrior and comes back when the carried light goes, not DARK. Foundry's helpers come in:
 * `flatten` = foundry.utils.flattenObject, `clone` = foundry.utils.deepClone, and `del` is what
 * clears the prior — `_del` on v14, else a null VALUE on the plain key (not "-=").
 */
export function itemLightUpdate(doc, light, { flatten, clone: copy, del = null }) {
  if (doc.flags?.[MODULE]?.spellLight) return null; // the Light cantrip owns this token's light until it ends
  const lit = doc.flags?.[MODULE]?.itemLight === true;
  const PRIOR = FLAGS.itemLightPrior;
  if (light) {
    const own = doc.light?.toObject?.() ?? doc.light ?? {};
    const current = flatten(own);
    const want = flatten(light);
    const same = Object.entries(want).every(([k, v]) => current[k] === v);
    if (same && lit) return null;
    const u = { light, [FLAGS.itemLight]: true };
    if (!lit && ((Number(own.bright) || 0) > 0 || (Number(own.dim) || 0) > 0)) u[PRIOR] = copy(own);
    return u;
  }
  if (!lit) return null;
  const prior = doc.flags?.[MODULE]?.itemLightPrior;
  const u = { light: copy(prior ?? DARK), [FLAGS.itemLight]: false };
  if (prior !== undefined) u[PRIOR] = del;
  return u;
}

/** Every spell-light source on these scenes ({tokens, lights}): a Set of Light item uuids. */
export function collectSources(scenes) {
  const out = new Set();
  for (const s of scenes ?? []) {
    for (const t of s.tokens) { const sl = readSpellLight(t); if (sl) out.add(sl.source); }
    for (const l of s.lights) { const sl = readSpellLight(l); if (sl) out.add(sl.source); }
  }
  return out;
}

/** Every Token and AmbientLight on these scenes lit by `source`, tokens before lights per scene. */
export function litByIn(scenes, source) {
  const out = [];
  for (const s of scenes ?? []) {
    for (const t of s.tokens) if (readSpellLight(t)?.source === source) out.push({ kind: "token", scene: s.id, id: t.id, doc: t });
    for (const l of s.lights) if (readSpellLight(l)?.source === source) out.push({ kind: "ambient", scene: s.id, id: l.id, x: l.x, y: l.y, doc: l });
  }
  return out;
}

/**
 * Every scene's tokens grouped by actor id, built in one pass (finding -11): actorId →
 * [{ scene, tokens }] in scene order, each `tokens` in the scene's own order. `syncAll` builds it
 * once instead of walking every scene once per actor.
 */
export function tokensByActor(scenes) {
  const index = new Map();
  for (const scene of scenes ?? []) {
    const here = new Map();
    for (const t of scene.tokens ?? []) {
      if (!t) continue;
      let list = here.get(t.actorId);
      if (!list) here.set(t.actorId, list = []);
      list.push(t);
    }
    for (const [actorId, tokens] of here) {
      if (!index.has(actorId)) index.set(actorId, []);
      index.get(actorId).push({ scene, tokens });
    }
  }
  return index;
}

/**
 * What one Light reconcile did (finding -14), from its plan and what was actually written:
 *   { source, desired, restored, removed, lit, created, released, cleared }
 * restored / removed count the tokens given back their light and the squares deleted; lit is the
 * token id now lit (null for none); created whether a square was placed; released the other Light
 * whose cast let go of this token (two casters); cleared whether this Light's own cast was cleared
 * (its token or scene is gone). `extras` overrides what the plan alone would say.
 */
export function summarise(plan, extras = {}) {
  return {
    source: extras.source ?? null,
    desired: extras.desired ?? null,
    restored: extras.restored ?? plan?.restore?.length ?? 0,
    removed: extras.removed ?? plan?.remove?.length ?? 0,
    lit: extras.lit !== undefined ? extras.lit : plan?.light?.token ?? null,
    created: extras.created ?? !!plan?.create,
    released: extras.released ?? null,
    cleared: extras.cleared ?? false,
  };
}

/**
 * A GM's hand edit of a Light square (an AmbientLight lit by `source`), against the Light's wanted
 * target `want` (readSpellCast). → what the cast flag becomes, or null to leave it:
 *   "delete": the wanted square was deleted and no twin of it is left → { clear: true } (the light
 *             ends; without this the next sweep would put it back);
 *   "move":   the wanted square was dragged → { x, y } (the light now lives there; reconcile never
 *             moves a square, it creates and deletes, so any x/y change is a hand move).
 * A twin is another square of the same source still at the wanted spot.
 */
export function handSquareEdit(kind, { want, source, light, sceneId, lights }) {
  if (!want || want.token || want.scene !== sceneId) return null;
  const x = Math.round(light.x), y = Math.round(light.y);
  const atWanted = want.x === x && want.y === y;
  if (kind === "delete" ? !atWanted : atWanted) return null;
  const twin = [...(lights ?? [])].some(l => l.id !== light.id && readSpellLight(l)?.source === source
    && Math.round(l.x) === want.x && Math.round(l.y) === want.y);
  if (twin) return null;
  return kind === "delete" ? { clear: true } : { x, y };
}
