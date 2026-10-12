/**
 * Pentaryn Feature Riders — ADAPTER: dnd5e Documents ↔ the plain shapes the cores read, and the
 * few document reads and writes several features and the API share (Hit Dice pools).
 *
 * May import core and lib only (use-doc §2). Nothing here registers a hook.
 */

import {
  MODULE, RULES, carriedAbilities, hdPoolsFrom, hdSummaryOf, matchRule, normalizeName, pickRestore, pickSpend,
  resolveTypes, ruleByKey,
} from "./riders-core.mjs";
import { SUMMON_FLAG } from "./table-core.mjs";
import { resolveRef } from "./lib/resolve.mjs";

/* ── the legacy API's actor argument (combat-riders-12) ─────────────────── */

const MISS = Symbol("miss");

/**
 * A legacy API row's actor argument: a string (exact or case-insensitive name, 16-character id,
 * UUID; never a substring) or a Token resolves to its actor; anything else — an Actor, an Item for
 * setType, undefined for report() — is passed through as before. A string or Token that resolves
 * to nothing is MISS. An ambiguous name throws AMBIGUOUS.
 */
function legacyActorArg(ref) {
  if (typeof ref === "string") return resolveRef(ref, "actor", { required: false }) ?? MISS;
  const token = ref?.documentName === "Token" ? ref : ref?.document?.documentName === "Token" ? ref.document : null;
  if (token) return token.actor ?? MISS;
  return ref;
}

/** Wrap a legacy row so its first argument goes through legacyActorArg; a miss answers null. */
export function withLegacyActor(fn) {
  const isAsync = fn.constructor?.name === "AsyncFunction";
  const wrapped = isAsync
    ? async (ref, ...rest) => { const a = legacyActorArg(ref); return a === MISS ? null : fn(a, ...rest); }
    : (ref, ...rest) => { const a = legacyActorArg(ref); return a === MISS ? null : fn(a, ...rest); };
  Object.defineProperty(wrapped, "name", { value: fn.name });
  return wrapped;
}

/* ── items and features ─────────────────────────────────────────────────── */

/** An Item as the rule matcher reads it. */
export function itemInfo(item) {
  return {
    identifier: item?.system?.identifier || "",
    source: item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? "",
    name: item?.name ?? "",
    type: item?.type ?? ""
  };
}

/** Every damage type the item's activities name (Elemental Affinity's PHB activities). */
export function activityDamageTypes(item) {
  const out = [];
  for (const a of item?.system?.activities ?? []) {
    for (const part of a?.damage?.parts ?? []) for (const t of part?.types ?? []) out.push(t);
  }
  return out;
}

/**
 * Every rule the actor's items switch on, with the types it resolved to. The items are the live
 * Item documents (API `featuresOf` returns them as they are).
 * @returns {{key: string, rule: object, items: Item[], types: string[]|null}[]}
 */
export function featuresOf(actor) {
  const found = new Map();
  for (const item of actor?.items ?? []) {
    const info = itemInfo(item);
    for (const rule of RULES) {
      if (!matchRule(rule, info)) continue;
      const entry = found.get(rule.key) ?? { key: rule.key, rule, items: [], types: rule.types ? [] : null };
      entry.items.push(item);
      if (rule.types) {
        const t = resolveTypes({
          flagType: item.getFlag?.(MODULE, "damageType"),
          name: item.name,
          activityTypes: activityDamageTypes(item)
        }, rule.types);
        for (const x of t) if (!entry.types.includes(x)) entry.types.push(x);
      }
      found.set(rule.key, entry);
    }
  }
  return [...found.values()];
}

/**
 * The ability mods this activity's damage formula already adds by hand (`carriedAbilities`).
 * Only the activity's own parts are read: with `includeBase` a spell's base damage lives there too.
 */
export function carriedBy(activity) {
  const formulas = [];
  for (const p of activity?.damage?.parts ?? []) {
    formulas.push(p?.bonus ?? "");
    if (p?.custom?.enabled) formulas.push(p.custom.formula ?? "");
  }
  return carriedAbilities(formulas, activity?.ability ?? "");
}

/* ── dnd5e's damage and healing types ───────────────────────────────────── */

export const isType = t => (t in (CONFIG.DND5E?.damageTypes ?? {})) || (t in (CONFIG.DND5E?.healingTypes ?? {}));
export const isHealing = t => t in (CONFIG.DND5E?.healingTypes ?? {});

/* ── Battle Medic identity ──────────────────────────────────────────────── */

export const HEALER = ruleByKey("healer");

/** The Battle Medic relay's query name — one source for its registration, selftest and describe(). */
export const RELAY_QUERY = `${MODULE}.battleMedic`;

/** The Battle Medic activity: our flow flag, or an activity named "Battle Medic" on the Healer feat. */
export function isBattleMedic(activity) {
  if (!activity) return false;
  if (activity.flags?.[MODULE]?.flow === "battle-medic") return true;
  return normalizeName(activity.name) === "battle medic" && matchRule(HEALER, itemInfo(activity.item));
}

/* ── Hit Dice ───────────────────────────────────────────────────────────── */

/** The actor's Hit Dice pools (core hdPoolsFrom over `attributes.hd` and the class items). */
export function hdPools(actor) {
  const hd = actor?.system?.attributes?.hd ?? null;
  if (!hd) return [];
  return hdPoolsFrom({
    isNPC: !!actor.system.isNPC,
    hd,
    classes: Object.values(actor.classes ?? {}).map(c => ({ id: c.id, hd: c.system?.hd })),
  });
}

export function hdSummary(actor) {
  return hdSummaryOf(hdPools(actor));
}

async function writePool(actor, pool, delta) {
  if (pool.id === null) return actor.update({ "system.attributes.hd.spent": Math.max(0, pool.spent + delta) });
  return actor.items.get(pool.id)?.update({ "system.hd.spent": Math.max(0, pool.spent + delta) });
}

/** Spend one Hit Die (the largest left, or of `faces` if given). Returns the faces spent, or null. */
export async function spendHitDie(actor, { faces } = {}) {
  const pools = hdPools(actor);
  const pool = (faces && pools.find(p => p.faces === faces && p.value > 0)) || pickSpend(pools);
  if (!pool) return null;
  await writePool(actor, pool, +1);
  return pool.faces;
}

/** Give back one spent Hit Die (the largest spent). Returns the faces restored, or null. */
export async function restoreHitDie(actor) {
  const pool = pickRestore(hdPools(actor));
  if (!pool) return null;
  await writePool(actor, pool, -1);
  return pool.faces;
}

/* ── the once-per-casting guard's messages ──────────────────────────────── */

/**
 * The chat messages rolled from one usage card, for the once-per-casting guard
 * (`core.usedFromMessages` still filters them by `_source.system.origin`). dnd5e 6 keeps that index
 * itself: `dnd5e.registry.messages.get(origin)` (ChatMessage5e tracks every non-"base" message by
 * `_source.system.origin` when it is prepared and untracks it on delete), so the guard reads the
 * card's few messages instead of the whole log. No origin, no registry, or a registry answering
 * something other than an array: the whole chat log, as before. Throws what the registry throws
 * (the caller logs it and scans the log).
 * @param {string|null} origin  id of the usage card
 * @returns {Iterable<object>}
 */
export function messagesOfCard(origin) {
  const registry = globalThis.dnd5e?.registry?.messages;
  if (origin && typeof registry?.get === "function") {
    const found = registry.get(origin);
    if (Array.isArray(found)) return found;
  }
  return game.messages ?? [];
}

/* ── concentration ──────────────────────────────────────────────────────── */

/** The actor's feature identifiers and effect names, lowercased (for AFTER_FAIL_FEATURES). */
export function featureKeys(actor) {
  const out = [];
  for (const i of actor?.items ?? []) out.push(String(i.system?.identifier || i.name || "").toLowerCase());
  for (const e of actor?.appliedEffects ?? actor?.effects ?? []) out.push(String(e.name ?? "").toLowerCase().replace(/\s+/g, "-"));
  return out;
}

/**
 * The tokens, on any scene, that one of `actor`'s concentration effects keeps on the map (the
 * summon stamp flags.pentaryn-riders.concentration, concentration.mjs): `[{ scene, token, effect }]`
 * as ids and the effect's uuid. Not a hot path (inspect only).
 */
export function concentrationSummonsOf(actor, scenes) {
  const prefix = actor?.uuid ? `${actor.uuid}.ActiveEffect.` : null;
  if (!prefix) return [];
  const out = [];
  for (const scene of scenes ?? []) {
    for (const t of scene?.tokens ?? []) {
      const effect = t?.flags?.[MODULE]?.[SUMMON_FLAG];
      if (typeof effect === "string" && effect.startsWith(prefix)) out.push({ scene: scene.id, token: t.id, effect });
    }
  }
  return out;
}

/* ── the sidebar (cast-flow's summon keep) ──────────────────────────────── */

/** `{ tab, collapsed }` of the sidebar now (no sidebar → `{ tab: null, collapsed: false }`). */
export function sidebarState() {
  const sidebar = ui.sidebar;
  return { tab: sidebar?.tabGroups?.primary ?? null, collapsed: sidebar ? !sidebar.expanded : false };
}

/** Put the sidebar back on `tab`, collapsed again when it was. Throws what the sidebar throws. */
export function restoreSidebar({ tab, collapsed }) {
  ui.sidebar.changeTab(tab, "primary");
  if (collapsed && ui.sidebar.expanded) ui.sidebar.collapse();
}
