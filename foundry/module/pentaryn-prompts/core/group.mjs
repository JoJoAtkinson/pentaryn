/**
 * pentaryn-prompts core — single-linkage grouping into encounters, deterministic ids.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

import { isSeen } from "./sight.mjs";

/* ── Grouping ────────────────────────────────────────────────────────────── */

/** Two things link into one encounter at this distance (ft) with sight; the LEGEND says so. */
export const LINK_FT = 30;
/** Linked this close (ft) with sight, inside an encounter: a formation. */
export const FORMATION_FT = 15;


/**
 * Single-linkage grouping (plan §4.4, §13).
 *
 * `prompts` and `built` are arrays of keys; `rel(a, b)` returns `{ft, los}` for the ordered pair
 * (`los` is "LOS" | "door" | "secret door" | "wall"). Two things link when they are within
 * `linkFt` and either can see the other.
 *
 * Prompts form components among themselves. A built thing then attaches to every component it
 * links to — it may join a pack, but never bridges two packs into one. Built things that link to
 * no component are context only.
 *
 * Built packs (§13): a built FOE that joins a component brings its pack with it — the built foes
 * chained to it at `linkFt` with sight. A foe is a built creature (`creature(k)`) that stands
 * hostile (`disposition(k) === "hostile"`; without a `disposition` callback every creature is a
 * foe). So a minion dropped beside one goblin of a built camp joins the whole camp, not only the
 * goblin it touches. Neutral and friendly creatures never chain: the hostile camp does not pull in
 * the neutral innkeeper across the room, and a street of neutral crowd tokens is not one group
 * (each joins only where it stands within `linkFt` of a prompt itself). Objects (hotspots, notes,
 * lights, tiles) never chain either. A pack reached from two components is listed in both as
 * `shared`: built things still never bridge.
 *
 * Returns `{ groups: [{prompts, built, shared, creatures, foes, formations}], contextOnly }`,
 * unordered; `creatures` are the group's built creatures, `foes` its hostile ones (a single prompt
 * with a foe is an encounter; one beside a neutral villager or a chest is not).
 */
export function groupScene(prompts, built, rel, { linkFt = LINK_FT, formationFt = FORMATION_FT, creature = null, disposition = null } = {}) {
  // Distance first: a relation's sight is lazy (see makeRel), so a pair beyond `max` never pays for
  // a sight test, and the reverse direction is only tested when the forward one is blocked.
  const linked = (a, b, max) => {
    const ab = rel(a, b), ba = rel(b, a);
    const ft = Math.min(ab?.ft ?? Infinity, ba?.ft ?? Infinity);
    return ft <= max && (isSeen(ab) || isSeen(ba));
  };
  const isCreature = k => !!creature?.(k);
  const isFoe = k => isCreature(k) && (disposition ? disposition(k) === "hostile" : true);
  const foes = built.filter(isFoe);
  // pack edges are cached: two groups reaching the same pack walk it once
  const packEdge = new Map();
  const packLinked = (a, b) => {
    const k = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    if (!packEdge.has(k)) packEdge.set(k, linked(a, b, linkFt));
    return packEdge.get(k);
  };

  const comps = components(prompts, (a, b) => linked(a, b, linkFt));
  const groups = comps.map(c => ({ prompts: c, built: [], shared: [], creatures: [], foes: [], formations: [] }));
  const homes = new Map();
  groups.forEach((g, gi) => {
    const mine = new Set();
    const queue = [];
    for (const t of built) {
      if (!g.prompts.some(p => linked(p, t, linkFt))) continue;
      mine.add(t);
      if (isFoe(t)) queue.push(t);
    }
    // the built pack: breadth-first over hostile creatures, only from the foes that joined directly
    while (queue.length) {
      const a = queue.shift();
      for (const b of foes) {
        if (mine.has(b) || !packLinked(a, b)) continue;
        mine.add(b);
        queue.push(b);
      }
    }
    for (const t of mine) {
      if (!homes.has(t)) homes.set(t, []);
      homes.get(t).push(gi);
    }
  });
  const contextOnly = [];
  for (const t of built) {
    const hits = homes.get(t);
    if (!hits) { contextOnly.push(t); continue; }
    for (const gi of hits) {
      const g = groups[gi];
      g.built.push(t);
      if (isCreature(t)) g.creatures.push(t);
      if (isFoe(t)) g.foes.push(t);
      if (hits.length > 1) g.shared.push(t);
    }
  }

  for (const g of groups) {
    // Formations: the same rule at formationFt, built things joining but not bridging.
    const fComps = components(g.prompts, (a, b) => linked(a, b, formationFt));
    const forms = fComps.map(c => ({ prompts: c, built: [] }));
    for (const t of g.built) {
      const hits = forms.filter(f => f.prompts.some(p => linked(p, t, formationFt)));
      for (const f of hits) f.built.push(t);
    }
    g.formations = forms.filter(f => f.prompts.length + f.built.length >= 2);
  }
  return { groups, contextOnly };
}

/** Connected components of `keys` under `edge(a, b)`. Order of each component follows `keys`. */
export function components(keys, edge) {
  const parent = new Map(keys.map(k => [k, k]));
  const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  for (let x = 0; x < keys.length; x++) {
    for (let y = x + 1; y < keys.length; y++) {
      const a = keys[x], b = keys[y];
      if (find(a) === find(b)) continue;
      if (edge(a, b)) parent.set(find(a), find(b));
    }
  }
  const out = new Map();
  for (const k of keys) {
    const r = find(k);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(k);
  }
  return [...out.values()];
}

/* ── Deterministic ids ───────────────────────────────────────────────────── */

/** Reading order: top, then left, then key. `info(k)` gives `{x, y}` (top-left) and optional `rank`. */
function byReading(info) {
  return (a, b) => {
    const A = info(a), B = info(b);
    return (A.y - B.y) || (A.x - B.x) || String(a).localeCompare(String(b));
  };
}

/** Size desc (rank: bigger is larger), then reading order. */
function bySizeThenReading(info) {
  const reading = byReading(info);
  return (a, b) => ((info(b).rank ?? 0) - (info(a).rank ?? 0)) || reading(a, b);
}

/**
 * Assign the gather ids (plan §4.4) across scenes in the order given.
 *
 * `scenes`: `[{ key, groups, contextOnly, info }]` where `groups` come from `groupScene` and
 * `info(k)` returns `{x, y, rank}` for any prompt or built key (top-left px; rank = size order).
 *
 * Groups sort by member count desc (prompts + built), then the reading order of their top-left
 * member. A group of 2+ prompts, or of one prompt with a hostile built creature (`g.foes`), is an
 * encounter (E#). A single prompt with no foe is "alone"; the built things beside it (a chest, the
 * neutral innkeeper) become context only. Prompts number by scene, group, size desc, reading order; built things the same, a
 * shared built thing in the first encounter that holds it, context-only built things last.
 *
 * Returns `{ sceneIds, promptIds, builtIds, scenes: [{ key, id, encounters, alone, contextOnly }] }`
 * where encounters/alone/contextOnly hold keys in output order.
 */
export function assignIds(scenes) {
  const sceneIds = new Map(), promptIds = new Map(), builtIds = new Map();
  let s = 0, e = 0, p = 0, t = 0;
  const out = [];
  for (const sc of scenes) {
    const id = `s${++s}`;
    sceneIds.set(sc.key, id);
    const info = sc.info;
    const topLeft = g => {
      const all = [...g.prompts, ...g.built];
      return all.reduce((m, k) => {
        const i = info(k);
        return (i.y < m.y || (i.y === m.y && i.x < m.x)) ? { x: i.x, y: i.y } : m;
      }, { x: Infinity, y: Infinity });
    };
    const groups = [...sc.groups].map(g => ({
      ...g,
      prompts: [...g.prompts].sort(bySizeThenReading(info)),
      built: [...g.built].sort(bySizeThenReading(info)),
      tl: topLeft(g)
    }));
    groups.sort((a, b) => ((b.prompts.length + b.built.length) - (a.prompts.length + a.built.length))
      || (a.tl.y - b.tl.y) || (a.tl.x - b.tl.x) || String(a.prompts[0]).localeCompare(String(b.prompts[0])));

    // One prompt beside built objects or non-hostile creatures only is "alone": they become context
    // only (unless an encounter holds them), so a chest or a villager is never dressed up as a fight.
    // One prompt beside a hostile built creature is an encounter with its pack (§13): the new minion
    // beside last week's camp.
    const isEncounter = g => g.prompts.length > 1 || (g.foes?.length ?? 0) > 0;
    const encounters = [], alone = [];
    const demoted = new Set();
    for (const g of groups) {
      for (const k of g.prompts) promptIds.set(k, `p${++p}`);
      if (!isEncounter(g)) {
        alone.push(g.prompts[0]);
        for (const k of g.built) demoted.add(k);
        continue;
      }
      for (const k of g.built) if (!builtIds.has(k)) builtIds.set(k, `t${++t}`);
      encounters.push({ ...g, id: `E${++e}`, shared: g.shared.filter(k => groups.some(o => o !== g && isEncounter(o) && o.built.includes(k))) });
    }
    for (const k of demoted) if (builtIds.has(k)) demoted.delete(k);
    const contextOnly = [...sc.contextOnly, ...demoted].sort(bySizeThenReading(info));
    for (const k of contextOnly) if (!builtIds.has(k)) builtIds.set(k, `t${++t}`);
    out.push({ key: sc.key, id, encounters, alone, contextOnly });
  }
  return { sceneIds, promptIds, builtIds, scenes: out };
}
