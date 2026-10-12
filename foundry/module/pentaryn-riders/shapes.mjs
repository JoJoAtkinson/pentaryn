/**
 * Pentaryn Feature Riders — ADAPTER: dnd5e Documents ↔ the plain shapes the cores read, and the
 * few document reads and writes several features and the API share (Hit Dice pools).
 *
 * May import core and lib only (use-doc §2). Nothing here registers a hook.
 */

import {
  MODULE, RULES, carriedAbilities, matchRule, normalizeName, pickRestore, pickSpend, resolveTypes, ruleByKey,
} from "./riders-core.mjs";
import { SUMMON_FLAG } from "./table-core.mjs";

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

/** The Battle Medic activity: our flow flag, or an activity named "Battle Medic" on the Healer feat. */
export function isBattleMedic(activity) {
  if (!activity) return false;
  if (activity.flags?.[MODULE]?.flow === "battle-medic") return true;
  return normalizeName(activity.name) === "battle medic" && matchRule(HEALER, itemInfo(activity.item));
}

/* ── Hit Dice ───────────────────────────────────────────────────────────── */

export function hdPools(actor) {
  const sys = actor?.system;
  const hd = sys?.attributes?.hd;
  if (!hd) return [];
  if (sys.isNPC) {
    return [{ id: null, faces: Number(String(hd.denomination ?? "").replace(/^d/, "")) || 0, value: hd.value ?? 0, spent: hd.spent ?? 0 }];
  }
  return Object.values(actor.classes ?? {}).map(c => ({
    id: c.id,
    faces: Number(String(c.system?.hd?.denomination ?? "").replace(/^d/, "")) || 0,
    value: c.system?.hd?.value ?? 0,
    spent: c.system?.hd?.spent ?? 0
  }));
}

export function hdSummary(actor) {
  const pools = hdPools(actor);
  return { value: pools.reduce((a, p) => a + p.value, 0), max: pools.reduce((a, p) => a + p.value + p.spent, 0) };
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
