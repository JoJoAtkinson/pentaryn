/**
 * pentaryn-prompts core — scene items → the rendered view; the lazy relation table.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

import { DEFAULTS } from "./defaults.mjs";
import { doorLines } from "./doors.mjs";
import { DIAGONALS, bearing, dedupeSquares, gaplessDistanceFt, occupiedSquares, squareDistanceFt } from "./grid.mjs";
import { FORMATION_FT, LINK_FT, assignIds, groupScene } from "./group.mjs";
import { atFeet } from "./placement.mjs";
import { classifyBlocked, isSeen, rayPasses, wallSegment } from "./sight.mjs";
import { callId, idCompare, stripHtml, textHash } from "./text.mjs";
import { parseParty } from "./xp.mjs";

/** Built kinds that are creatures; the hostile ones make encounters and chain into packs (§13). */
export const CREATURE_KINDS = Object.freeze(["npc", "character", "creature"]);

/* ── From scene items to the rendered view (pure; scene-adapter.mjs feeds it) ─ */

/**
 * Build the gather view (what `renderGather` reads) and the manifest from scene items.
 *
 * `scenes`: in output order, each
 *   { key, name, nav, mapFt, squares, gridFt, regions, levels, warn, notes, dims,
 *     doors?: [{ id, c, door, ds, sight }], walls?, doorReach?(member, point, door) (→ doorLines),
 *     items: [{ key, id, docName, isPrompt, size, rank, rect: {x, y, w, h}, centre, atFt, regions,
 *               text, updatedAt, kind, name, type, hidden, prov, description, elevation?, points?,
 *               disposition?, stats?, classes?, species?, items?, xp?, light?, actorId?, ownTextUuid? }],
 *     rel(aKey, bKey) → { ft, bearing, los, seen } }
 *
 * Returns `{ view, manifest, ids }` (`ids`: assignIds' output); `manifest.at` is left for the caller
 * to stamp. `view` is the shape `renderGather` documents.
 */
export function buildView(scenes, { unseenWithinFt = DEFAULTS.unseenWithinFt, linkFt = LINK_FT, formationFt = FORMATION_FT, next = null, party = null,
  partySource = null, cropsNote = null } = {}) {
  const prepared = scenes.map(sc => {
    const byKey = new Map(sc.items.map(it => [it.key, it]));
    const prompts = sc.items.filter(it => it.isPrompt).map(it => it.key);
    const built = sc.items.filter(it => !it.isPrompt).map(it => it.key);
    const creature = k => CREATURE_KINDS.includes(byKey.get(k)?.kind);
    const disposition = k => byKey.get(k)?.disposition ?? null;
    const { groups, contextOnly } = groupScene(prompts, built, sc.rel, { linkFt, formationFt, creature, disposition });
    const info = k => { const it = byKey.get(k); return { x: it.rect.x, y: it.rect.y, rank: it.rank ?? 0 }; };
    return { sc, byKey, prompts, built, groups, contextOnly, info };
  });

  const ids = assignIds(prepared.map(p => ({ key: p.sc.key, groups: p.groups, contextOnly: p.contextOnly, info: p.info })));
  const idOf = k => ids.promptIds.get(k) ?? ids.builtIds.get(k);

  const view = { call: null, counts: { scenes: 0, prompts: 0, built: 0, encounters: 0, alone: 0 },
    scenes: [], prompts: {}, built: {}, todo: [], next, unseenWithinFt, party: parseParty(party) ? party : null,
    partySource: parseParty(party) ? partySource : null, cropsNote };
  const manifest = { call: null, at: null, scenes: {}, prompts: {}, built: {}, encounters: {} };
  const callEntries = [];

  prepared.forEach((p, idx) => {
    const sc = p.sc;
    const out = ids.scenes[idx];
    manifest.scenes[out.id] = sc.key;

    for (const k of p.prompts) {
      const it = p.byKey.get(k);
      const pid = ids.promptIds.get(k);
      const sees = [], unseen = [];
      for (const other of sc.items) {
        if (other.key === k) continue;
        const r = sc.rel(k, other.key);
        if (!r) continue;
        const rr = { id: idOf(other.key), ft: r.ft, bearing: r.bearing };
        // the door/wall classification is only paid for where the text prints it
        if (isSeen(r)) sees.push({ ...rr, los: "LOS" });
        else if (r.ft <= unseenWithinFt) unseen.push({ ...rr, los: r.los });
      }
      view.prompts[pid] = { id: pid, size: it.size, gridFt: sc.gridFt, atFt: it.atFt, regions: it.regions ?? [],
        elevation: it.elevation ?? it.centre?.elevation ?? 0, text: it.text, sees, unseen };
      manifest.prompts[pid] = { sceneId: sc.key, markerId: it.id, size: it.size, hash: textHash(it.text),
        x: it.rect.x, y: it.rect.y, w: it.rect.w, h: it.rect.h };
      callEntries.push({ sceneId: sc.key, markerId: it.id, text: it.text, pid });
    }
    for (const k of p.built) {
      const it = p.byKey.get(k);
      const tid = ids.builtIds.get(k);
      view.built[tid] = { id: tid, docId: it.id ?? null, actorId: it.actorId ?? null, kind: it.kind, name: it.name, type: it.type, atFt: it.atFt,
        elevation: it.elevation ?? it.centre?.elevation ?? 0,
        regions: it.regions ?? [], hidden: !!it.hidden, prov: it.prov ?? null, description: stripHtml(it.description ?? ""),
        stats: it.stats ?? null, classes: it.classes ?? null, species: it.species ?? null, items: it.items ?? null,
        disposition: CREATURE_KINDS.includes(it.kind) ? (it.disposition ?? null) : null, xp: Number(it.xp) || 0,
        light: it.light ?? null };
      // only when set: view.built's shape is pinned by goldens, and most tokens have no text of their own
      if (it.ownTextUuid) view.built[tid].ownTextUuid = it.ownTextUuid;
      manifest.built[tid] = { sceneId: sc.key, docName: it.docName, id: it.id, xp: Number(it.xp) || 0 };
    }

    const encounters = out.encounters.map(g => {
      const members = [...g.prompts, ...g.built];
      const rects = members.map(k => p.byKey.get(k).rect);
      const box = rects.reduce((b, r) => ({
        x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.w), y1: Math.max(b.y1, r.y + r.h)
      }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      let span = 0;
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          const r = sc.rel(members[a], members[b]) ?? sc.rel(members[b], members[a]);
          if (r && Number.isFinite(r.ft)) span = Math.max(span, r.ft);
        }
      }
      const centre = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      const e = {
        id: g.id,
        centreFt: sc.dims ? atFeet(centre, sc.dims) : [0, 0],
        spanFt: span,
        members: members.map(idOf),
        formations: g.formations.map(f => [...f.prompts, ...f.built].map(idOf)
          .sort(idCompare)),
        prompts: g.prompts.map(idOf),
        built: g.built.map(idOf),
        shared: g.shared.map(idOf),
        builtXp: g.built.reduce((n, k) => n + (Number(p.byKey.get(k).xp) || 0), 0),
        _keys: g.prompts, _centre: centre
      };
      manifest.encounters[g.id] = { sceneId: sc.key, members: e.members,
        rect: { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 } };
      return e;
    });

    const relations = encounterRelations(encounters, sc.rel);
    for (const e of encounters) { delete e._keys; delete e._centre; }
    const notes = aloneNotes(out.alone, p, sc.rel, idOf, unseenWithinFt);
    const doorText = doorLines(sc.doors ?? [], doorGroups(sc, p, out, encounters, idOf), { dims: sc.dims, gridFt: sc.gridFt,
      withinFt: unseenWithinFt, walls: sc.walls ?? null, reach: sc.doorReach ?? null });

    view.scenes.push({
      id: out.id, name: sc.name, nav: sc.nav ?? "", mapFt: sc.mapFt, squares: sc.squares, gridFt: sc.gridFt,
      regions: sc.regions ?? [], levels: sc.levels ?? 1, warn: sc.warn ?? [], notes: sc.notes ?? "",
      encounters, relations, aloneNotes: notes, doorLines: doorText,
      alone: out.alone.map(idOf),
      contextOnly: out.contextOnly.map(idOf)
    });
    view.counts.encounters += encounters.length;
    view.counts.alone += out.alone.length;
  });

  view.counts.scenes = view.scenes.length;
  view.counts.prompts = Object.keys(view.prompts).length;
  view.counts.built = Object.keys(view.built).length;
  view.todo = Object.keys(view.prompts).sort(idCompare);
  view.call = manifest.call = callId(callEntries);
  return { view, manifest, ids };
}

/** Each encounter after the first: where it sits relative to the nearest earlier one (reads `_keys`/`_centre`). */
function encounterRelations(encounters, rel) {
  const relations = [];
  for (let i = 1; i < encounters.length; i++) {
    let best = null;
    for (let j = 0; j < i; j++) {
      let ft = Infinity, los = false, near = null;
      for (const a of encounters[i]._keys) {
        for (const b of encounters[j]._keys) {
          const r = rel(a, b);
          if (!r) continue;
          if (r.ft < ft) { ft = r.ft; near = r; }
          if (!los && isSeen(r)) los = true;
        }
      }
      if (!best || ft < best.ft) best = { from: encounters[i].id, to: encounters[j].id, ft, los,
        bearing: bearing(encounters[j]._centre, encounters[i]._centre), near };
    }
    if (best && Number.isFinite(best.ft)) {
      const { near, ...line } = best;
      // what blocks the nearest pair: only classified for a line that prints "no LOS"
      if (!line.los && near) line.block = near.los === "LOS" ? "wall" : near.los;
      relations.push(line);
    }
  }
  return relations;
}

/** A loner, placed: its nearest other prompt, and whether it can see it; and the nearest built thing it sees. */
function aloneNotes(alone, p, rel, idOf, unseenWithinFt) {
  const notes = {};
  for (const k of alone) {
    let best = null;
    for (const o of p.prompts) {
      if (o === k) continue;
      const r = rel(o, k), back = rel(k, o);
      if (!r || !back) continue;
      const ft = Math.min(r.ft, back.ft);
      if (!best || ft < best.ft || (ft === best.ft && idCompare(idOf(o), best.of) < 0)) {
        best = { of: idOf(o), ft, bearing: r.bearing, r, back };
      }
    }
    // sight only for the one neighbour the line names
    const note = {};
    if (best) {
      const los = isSeen(best.back) || isSeen(best.r) ? "LOS" : best.back.los;
      Object.assign(note, { of: best.of, ft: best.ft, bearing: best.bearing, los });
    }
    // the nearest built thing it can see (the minion beside a leader built earlier)
    let nb = null;
    for (const o of p.built) {
      const r = rel(o, k), back = rel(k, o);
      if (!r || !back) continue;
      const ft = Math.min(r.ft, back.ft);
      if (ft > unseenWithinFt || (nb && ft > nb.ft)) continue;
      if (!(isSeen(back) || isSeen(r))) continue;
      if (nb && ft === nb.ft && idCompare(idOf(o), nb.of) > 0) continue;
      nb = { of: idOf(o), name: p.byKey.get(o).name ?? "", ft, bearing: r.bearing };
    }
    if (nb) note.built = nb;
    if (note.of || note.built) notes[idOf(k)] = note;
  }
  return notes;
}

/** The groups doorLines reads: each encounter, each loner, then each context-only built thing. */
function doorGroups(sc, p, out, encounters, idOf) {
  const keyOfId = new Map(sc.items.map(it => [idOf(it.key), it.key]));
  const member = id => { const it = p.byKey.get(keyOfId.get(id)); return { id, rect: it.rect, points: it.points ?? null }; };
  return [
    ...encounters.map(e => ({ label: e.id, prompt: true, members: [...e.prompts, ...e.built].map(member) })),
    ...out.alone.map(k => ({ label: idOf(k), prompt: true, members: [member(idOf(k))] })),
    ...out.contextOnly.map(k => ({ label: idOf(k), prompt: false, members: [member(idOf(k))] }))
  ];
}

/**
 * A `rel(a, b)` over plain data, cached per ordered pair. Distance from occupied squares (or the
 * gridless gap) and bearing centre to centre are computed at once; sight is LAZY — `r.seen`
 * (boolean, the primary test) and `r.los` ("LOS" | "door" | "secret door" | "wall", which adds the
 * door pass for blocked pairs) are getters evaluated on first read. Sight is the expensive part
 * (~0.1 ms per test point on a 1,500-wall map), so a pair nobody asks about costs nothing.
 *
 * `sight`: null → the pure wall test over `walls` from A's origin to B's test points;
 * `{visible(A, B) → bool, classify(A, B) → "door"|"secret door"|"wall"}` (sight-adapter.mjs);
 * or a plain `(A, B) → los string` function.
 *
 * items: `[{ key, rect, centre, origin?, points?, squares? }]`
 */
export function makeRel(items, { gridSize, gridFt = 5, rule = DIAGONALS.EQUIDISTANT, gridless = false, walls = [], sight = null } = {}) {
  const byKey = new Map(items.map(it => [it.key, it]));
  const squares = new Map();
  const sq = it => {
    if (!squares.has(it.key)) squares.set(it.key, it.squares?.length ? dedupeSquares(it.squares) : occupiedSquares(it.rect, gridSize));
    return squares.get(it.key);
  };
  const segs = walls.map(w => (w.a && w.b && "sight" in w) ? w : wallSegment(w));
  const originOf = A => A.origin ?? A.centre;
  const pointsOf = B => (B.points?.length ? B.points : [B.centre]);
  let visible, classify;
  if (typeof sight === "function") {
    const memo = new Map();
    const full = (A, B) => {
      const k = `${A.key}\u0000${B.key}`;
      if (!memo.has(k)) memo.set(k, sight(A, B));
      return memo.get(k);
    };
    visible = (A, B) => full(A, B) === "LOS";
    classify = full;
  } else if (sight && typeof sight.visible === "function") {
    visible = sight.visible;
    classify = sight.classify;
  } else {
    visible = (A, B) => pointsOf(B).some(t => rayPasses(originOf(A), t, segs).clear);
    classify = (A, B) => classifyBlocked([originOf(A)], pointsOf(B), segs);
  }
  const cache = new Map();
  return function rel(a, b) {
    const k = `${a}\u0000${b}`;
    if (cache.has(k)) return cache.get(k);
    const A = byKey.get(a), B = byKey.get(b);
    if (!A || !B) return null;
    const ft = gridless ? gaplessDistanceFt(A.rect, B.rect, gridSize / gridFt, gridFt)
      : squareDistanceFt(sq(A), sq(B), { gridFt, rule });
    let seen, los;
    const r = { ft, bearing: bearing(A.centre, B.centre) };
    Object.defineProperties(r, {
      seen: { enumerable: true, get: () => (seen ??= !!visible(A, B)) },
      los: { enumerable: true, get: () => (los ??= (r.seen ? "LOS" : classify(A, B))) }
    });
    cache.set(k, r);
    return r;
  };
}

/** Test points for a rect: the centre and four points inset a quarter-square from the corners. */
export function testPoints(rect, gridSize) {
  const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const inset = Math.min(gridSize / 4, rect.w / 4, rect.h / 4);
  return [c,
    { x: rect.x + inset, y: rect.y + inset }, { x: rect.x + rect.w - inset, y: rect.y + inset },
    { x: rect.x + inset, y: rect.y + rect.h - inset }, { x: rect.x + rect.w - inset, y: rect.y + rect.h - inset }];
}
