// teleportToken (0.6.0, pins plan 2026-10 D5): one token, and a PC's company, to a point on its
// own scene or another, without the portal check. It reuses recordOf / followersOf /
// landingPlaces / carryTo; party.mjs (portal-hop follow) is not involved, and its tests and
// goldens in party.test.mjs are left as they were. The guards at the end pin what the existing
// callers of the shared pieces (carryTo, displaceOptions, the follow hook) still get.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { boot, P1, P2, GM } from "./fixtures/world.mjs";
import { displaceOptions } from "../portals-core.mjs";
import { heldIds } from "../party.mjs";

const { F, S, W } = await boot();
await W.tick();

const own = (...ids) => Object.fromEntries([["default", 0], ...ids.map(id => [id, 3])]);
W.actor({ id: "CAV", name: "Caven", type: "character", ownership: own(P1, GM) });
W.actor({ id: "MAR", name: "Marrith", type: "character", ownership: own(P2) });
W.actor({ id: "SKEL", name: "Skeleton", ownership: own(P1), flags: { dnd5e: { summon: { origin: "Actor.CAV.Item.animate" } } } });
W.actor({ id: "OWL", name: "Owl", ownership: own(P1) });
W.actor({ id: "EYE", name: "Arcane Eye", flags: { dnd5e: { summon: { origin: "Actor.MAR.Item.eye" } } } });
W.actor({ id: "STEED", name: "Steed", ownership: own(P1, P2) });
W.actor({ id: "PILE", name: "Loot", ownership: own(P1) });
W.actor({ id: "MARK", name: "Marker · 1", ownership: own(P1) });
W.actor({ id: "HANDLE", name: "Circle of Death (Caven)", ownership: own(P1) });
W.actor({ id: "GUARD", name: "Guard" });
W.actor({ id: "FORM", name: "Wolf (Caven)", ownership: own(P1), flags: { dnd5e: { isPolymorphed: true } } });
// dnd5e 6.0.6 transformInto: the form actor names the original (and its chain). A real 16-character
// id: the kit's rootActorId counts only a document id (code review 2026-10-17 #11; "CAV" was skipped).
const CAV_ORIGINAL = "cavenOriginal001";
W.actor({ id: CAV_ORIGINAL, name: "Caven", type: "character", ownership: own(P1, GM) });
W.actor({ id: "FORM2", name: "Wolf (Caven)", ownership: own(P1), flags: { dnd5e: { isPolymorphed: true, originalActor: CAV_ORIGINAL, previousActorIds: [CAV_ORIGINAL] } } });
W.actor({ id: "FAM", name: "Familiar", flags: { dnd5e: { summon: { origin: `Actor.${CAV_ORIGINAL}.Item.findFamiliar` } } } });
game.itempiles = { API: { isValidItemPile: a => a.id === "PILE" } };

const api = () => game.pentaryn.portals;
const ops = n => W.callsSince(n, ["createEmbedded", "deleteEmbedded", "updateEmbedded", "update", "notify", "DialogV2.confirm", "scene.view", "pullUsers", "animatePan"]);
const near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** A second level on `s` (v14: a scene's floors are its Level documents). */
function addLevel(s, id) {
  const level = makeDoc("Level", { id, name: id, background: { src: null }, textures: {} }, { parent: s });
  s.levels.set(id, level);
  return level;
}

/**
 * Give a level core's elevation range: `elevation.{bottom, top, base}` (client/documents/level.mjs
 * prepareBaseData) and `clampElevation` (the same code as core's: feet never outside the range).
 */
function withElevation(level, bottom, top) {
  level.elevation = { bottom, top, base: bottom };
  level.clampElevation = (elevation, depth = 0) => {
    const d = depth * 5;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    return clamp(clamp(elevation + d, bottom, top) - d, bottom, top);
  };
  return level;
}

let seq = 0;
/**
 * A hall with Caven (a PC), his summon and a pet only his player owns, plus everyone who must
 * stay; a fresh far scene. `gate: false` leaves out every teleport region (no portal anywhere).
 */
function hall({ gate = true, tokens = null } = {}) {
  const k = ++seq;
  // real 16-character ids: opts.scene goes through the kit's resolveRef (review R1)
  const far = W.scene({ id: `Far${String(k).padStart(13, "0")}`, name: "Far Cave" });
  const hallId = `Hall${String(k).padStart(12, "0")}`;
  const lvl = `${hallId}Lvl0`;
  const all = [
    { id: `tCav${k}`, name: "Caven", actorId: "CAV", actorLink: true, x: 100, y: 200, level: lvl },
    { id: `tMar${k}`, name: "Marrith", actorId: "MAR", actorLink: true, x: 200, y: 200, level: lvl },
    { id: `tSkel${k}`, name: "Skeleton", actorId: "SKEL", x: 300, y: 200, level: lvl },
    { id: `tOwl${k}`, name: "Owl", actorId: "OWL", x: 400, y: 200, level: lvl },
    { id: `tEye${k}`, name: "Arcane Eye", actorId: "EYE", x: 500, y: 200, level: lvl },
    { id: `tSteed${k}`, name: "Steed", actorId: "STEED", x: 600, y: 200, width: 2, height: 2, level: lvl },
    { id: `tPile${k}`, name: "Loot", actorId: "PILE", x: 800, y: 200, level: lvl },
    { id: `tMark${k}`, name: "Marker · 1", actorId: "MARK", x: 900, y: 200, level: lvl },
    { id: `tHandle${k}`, name: "Circle of Death (Caven)", actorId: "HANDLE", x: 1000, y: 200, level: lvl, flags: { "pentaryn-aoe": { handle: true } } },
    { id: `tGuard${k}`, name: "Guard", actorId: "GUARD", x: 1100, y: 200, level: lvl },
  ];
  const regions = gate
    ? [{ id: `Gate${k}`, name: "Gate", bounds: { x: 100, y: 200, width: 100, height: 100 }, behaviors: [{ id: `Bgate${k}`, destinations: [`Scene.${far.id}.Region.FarGate${k}`] }] }]
    : [];
  if (gate) W.region(far, { id: `FarGate${k}`, name: "Far gate", bounds: { x: 1000, y: 500, width: 100, height: 100 } });
  const s = W.scene({ id: hallId, name: "Great Hall", regions, tokens: tokens ? tokens(k, lvl) : all });
  return { s, far, k, lvl, t: id => s.tokens.get(`${id}${k}`) };
}

/* ── same scene ───────────────────────────────────────────────────────── */

test("same scene: the PC, its summon and a pet only its player owns move in ONE displace update (no animation), each follower beside the PC", async () => {
  const H = hall();
  const n = F.calls.length;
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750 });
  const seen = ops(n);
  assert.deepEqual(seen.map(c => c.op), ["updateEmbedded"], "one write; no confirm, no toast, no pull, no view");
  const [u] = seen;
  assert.deepEqual(u.updates.map(x => x._id), [`tCav${H.k}`, `tSkel${H.k}`, `tOwl${H.k}`]);
  assert.deepEqual(u.options, { animate: false, movement: Object.fromEntries(u.updates.map(x => [x._id, { waypoints: [{ x: x.x, y: x.y, level: H.lvl, action: "displace" }] }])) });
  const by = Object.fromEntries(u.updates.map(x => [x._id, x]));
  assert.deepEqual([by[`tCav${H.k}`].x, by[`tCav${H.k}`].y], [1500, 700], "the PC's centre lands on the point");
  assert.ok(near(by[`tSkel${H.k}`], by[`tCav${H.k}`]) <= 100, "summon beside the PC");
  assert.ok(near(by[`tOwl${H.k}`], by[`tCav${H.k}`]) <= 100, "pet beside the PC");
  assert.deepEqual(out, {
    ok: true,
    token: { documentName: "Token", id: `tCav${H.k}`, uuid: `Scene.${H.s.id}.Token.tCav${H.k}`, name: "Caven" },
    from: H.s.id, to: { scene: H.s.id, x: 1550, y: 750, level: H.lvl },
    followers: [{ id: `tSkel${H.k}`, name: "Skeleton" }, { id: `tOwl${H.k}`, name: "Owl" }],
    moved: 3,
  });
});

test("same scene: a co-owned steed, an item pile, a Marker, an aoe handle, another PC and its summon, a GM NPC stay put", async () => {
  const H = hall();
  const before = Object.fromEntries(H.s.tokens.map(t => [t.id, [t.x, t.y]]));
  await api().teleportToken(H.t("tCav"), { x: 1550, y: 750 });
  for (const id of ["tMar", "tEye", "tSteed", "tPile", "tMark", "tHandle", "tGuard"]) {
    assert.deepEqual([H.t(id).x, H.t(id).y], before[`${id}${H.k}`], id);
  }
});

test("level given, same scene: EVERY waypoint carries it (not only the update); displaceOptions for the other callers stays level-free", async () => {
  const H = hall();
  addLevel(H.s, `Up${H.k}`);
  const n = F.calls.length;
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, level: `Up${H.k}` });
  const [u] = ops(n);
  assert.ok(u.updates.every(x => x.level === `Up${H.k}`), "each update carries the level");
  for (const x of u.updates) assert.deepEqual(u.options.movement[x._id].waypoints, [{ x: x.x, y: x.y, level: `Up${H.k}`, action: "displace" }], x._id);
  assert.equal(out.to.level, `Up${H.k}`);
  assert.equal(H.t("tCav").level, `Up${H.k}`);
  assert.deepEqual(displaceOptions([{ _id: "a", x: 1, y: 2 }]), { animate: false, movement: { a: { waypoints: [{ x: 1, y: 2, action: "displace" }] } } });
});

test("level given, same scene, another floor: elevation moves with the level (relative to each base, clamped), in the update AND every waypoint", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 10);
  withElevation(addLevel(H.s, `Up${H.k}`), 10, 20);
  H.t("tCav").elevation = 0;
  H.t("tSkel").elevation = 5;
  const n = F.calls.length;
  await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, level: `Up${H.k}` });
  const [u] = ops(n);
  const by = Object.fromEntries(u.updates.map(x => [x._id, x]));
  assert.deepEqual([by[`tCav${H.k}`].elevation, by[`tSkel${H.k}`].elevation, by[`tOwl${H.k}`].elevation], [10, 15, 10]);
  for (const x of u.updates) assert.deepEqual(u.options.movement[x._id].waypoints, [{ x: x.x, y: x.y, elevation: x.elevation, level: `Up${H.k}`, action: "displace" }], x._id);
  assert.equal(H.t("tCav").elevation, 10, "not 0: that would read -10 ft on the upper floor");
});

test("same scene, same level: elevation is left alone (a flying PC stays flying)", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 30);
  H.t("tCav").elevation = 20;
  const n = F.calls.length;
  await api().teleportToken(H.t("tCav"), { x: 1550, y: 750 });
  const [u] = ops(n);
  assert.ok(u.updates.every(x => !("elevation" in x)), "no elevation written");
  assert.equal(H.t("tCav").elevation, 20);
});

test("same scene, another floor: landing ignores tokens and walls of other floors (a ground guard under the spot, a ground wall)", async () => {
  const H = hall();
  addLevel(H.s, `Up${H.k}`);
  // the guard stands on the ground floor exactly where the PC should land on the upper floor
  const guard = H.t("tGuard");
  const out = await api().teleportToken(H.t("tCav"), { x: guard.x + 50, y: guard.y + 50, level: `Up${H.k}` });
  assert.equal(out.ok, true);
  assert.deepEqual([H.t("tCav").x, H.t("tCav").y], [guard.x, guard.y], "the upper floor is empty there: the PC lands on the point");
  // the same spot on the guard's own floor: pushed off it, as before
  const H2 = hall();
  const g2 = H2.t("tGuard");
  await api().teleportToken(H2.t("tCav"), { x: g2.x + 50, y: g2.y + 50 });
  assert.notDeepEqual([H2.t("tCav").x, H2.t("tCav").y], [g2.x, g2.y], "same floor: the guard's square is taken");
});

test("landingPlaces { level }: a wall on another floor does not cut ring spots; one on this floor (or on every floor) does; no level = unchanged", () => {
  const H = hall({ tokens: (k, lvl) => [{ id: `tCav${k}`, name: "Caven", actorId: "CAV", actorLink: true, x: 100, y: 200, level: lvl },
    { id: `tSkel${k}`, name: "Skeleton", actorId: "SKEL", x: 300, y: 200, level: lvl },
    { id: `tOwl${k}`, name: "Owl", actorId: "OWL", x: 400, y: 200, level: lvl }] });
  addLevel(H.s, `Up${H.k}`);
  const toks = ["tCav", "tSkel", "tOwl"].map(H.t);
  const free = S.landingPlaces(H.s, toks, 1550, 750);
  // a box of walls around the landing cell, on the ground floor only
  const box = [[1500, 700, 1600, 700], [1600, 700, 1600, 800], [1600, 800, 1500, 800], [1500, 800, 1500, 700]];
  // core's CanvasDocument#includedInLevel (client/documents/abstract/canvas-document.mjs), which landingPlaces calls (review R8)
  const wall = (id, c) => Object.assign(makeDoc("Wall", { id, c, move: 20, door: 0, ds: 0, levels: new Set([H.lvl]) }, { parent: H.s }),
    { includedInLevel(level) { return !this.levels.size || this.levels.has(level); } });
  box.forEach((c, i) => H.s.walls.set(`W${H.k}x${i}`, wall(`W${H.k}x${i}`, c)));
  assert.deepEqual(S.landingPlaces(H.s, toks, 1550, 750, null, { level: `Up${H.k}` }), free, "the upper floor has no walls there");
  assert.notDeepEqual(S.landingPlaces(H.s, toks, 1550, 750, null, { level: H.lvl }), free, "the ground floor's walls cut the ring");
  assert.notDeepEqual(S.landingPlaces(H.s, toks, 1550, 750), free, "no level: every wall counts, as before");
  for (const w of H.s.walls.contents ?? [...H.s.walls.values()]) w.levels = new Set();
  assert.notDeepEqual(S.landingPlaces(H.s, toks, 1550, 750, null, { level: `Up${H.k}` }), free, "a wall with no levels stands on every floor");
});

test("same scene, explicit scene id or uuid: the same-scene path (one displace update, no create/delete), followers beside the PC", async () => {
  for (const ref of ["id", "uuid"]) {
    const H = hall();
    const n = F.calls.length;
    const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: H.s[ref], level: H.lvl });
    const seen = ops(n);
    assert.deepEqual(seen.map(c => c.op), ["updateEmbedded"], ref);
    assert.deepEqual(seen[0].updates.map(x => x._id), [`tCav${H.k}`, `tSkel${H.k}`, `tOwl${H.k}`], ref);
    for (const x of seen[0].updates) assert.deepEqual(seen[0].options.movement[x._id].waypoints, [{ x: x.x, y: x.y, level: H.lvl, action: "displace" }], `${ref} ${x._id}`);
    assert.equal(out.ok, true, ref);
    assert.ok(near(H.t("tSkel"), H.t("tCav")) <= 100, `${ref}: summon beside the PC`);
  }
});

test("level not given, same scene: the token's own level", async () => {
  const H = hall();
  addLevel(H.s, `Up${H.k}`);
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750 });
  assert.equal(out.to.level, H.lvl);
  assert.equal(H.t("tCav").level, H.lvl);
});

/* ── another scene ────────────────────────────────────────────────────── */

test("another scene: one keepId create of PC + company on the destination, one delete on the source WITHOUT replacements; no follow pass, no pull, no view", async () => {
  const H = hall();
  F.canvas.scene = H.s;
  const n = F.calls.length;
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: H.far.id });
  await W.tick();                                    // the follow hook's setTimeout, if it were ever scheduled
  const seen = ops(n);
  const ids = ["tCav", "tSkel", "tOwl"].map(i => `${i}${H.k}`);
  assert.deepEqual(seen.map(c => [c.op, c.parent, c.ids, c.options]), [
    ["createEmbedded", H.far.uuid, ids, { keepId: true }],
    ["deleteEmbedded", H.s.uuid, ids, {}],
  ], "bringFollowers never ran (it would create again and toast 'Followed')");
  assert.equal(F.canvas.scene, H.s, "the calling GM's view did not change");
  const cav = H.far.tokens.get(`tCav${H.k}`);
  assert.deepEqual([cav.x, cav.y], [1500, 700]);
  for (const id of ids.slice(1)) assert.ok(near(H.far.tokens.get(id), cav) <= 100, id);
  assert.equal(H.s.tokens.has(`tMar${H.k}`), true);
  assert.equal(out.ok, true);
  assert.deepEqual(out.to, { scene: H.far.id, x: 1550, y: 750, level: `${H.far.id}Lvl0` });
  assert.equal(out.from, H.s.id);
  assert.equal(out.token.uuid, `Scene.${H.far.id}.Token.tCav${H.k}`, "the token as it now is, on the destination");
  assert.equal(out.moved, 3);
});

test("another scene by uuid, with no teleport region anywhere: the company still comes (cameThroughPortal is not consulted)", async () => {
  const H = hall({ gate: false });
  assert.equal(H.s.regions.size, 0);
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: H.far.uuid });
  assert.deepEqual(out.followers.map(f => f.name), ["Skeleton", "Owl"]);
  assert.deepEqual(["tCav", "tSkel", "tOwl"].map(i => H.far.tokens.has(`${i}${H.k}`)), [true, true, true]);
});

test("level given, another scene: the created data carries it", async () => {
  const H = hall();
  addLevel(H.far, `FarUp${H.k}`);
  await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: H.far.id, level: `FarUp${H.k}` });
  assert.deepEqual(["tCav", "tSkel", "tOwl"].map(i => H.far.tokens.get(`${i}${H.k}`).level), Array(3).fill(`FarUp${H.k}`));
});

test("another scene: elevation is mapped onto the destination level (relative to the source base, clamped)", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 30);
  withElevation(addLevel(H.far, `FarUp${H.k}`), 100, 110);
  withElevation(H.far.levels.get(`${H.far.id}Lvl0`), 0, 10);
  H.t("tCav").elevation = 20;
  H.t("tSkel").elevation = 2;
  await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: H.far.id });
  assert.deepEqual(["tCav", "tSkel", "tOwl"].map(i => H.far.tokens.get(`${i}${H.k}`).elevation), [10, 2, 0], "ground 0-10: a PC at 20 does not arrive flying above it");
  const H2 = hall();
  withElevation(H2.s.levels.get(H2.lvl), 0, 30);
  withElevation(addLevel(H2.far, `FarUp${H2.k}`), 100, 110);
  H2.t("tCav").elevation = 5;
  await api().teleportToken(H2.t("tCav"), { x: 1550, y: 750, scene: H2.far.id, level: `FarUp${H2.k}` });
  assert.equal(H2.far.tokens.get(`tCav${H2.k}`).elevation, 105, "5 ft above the source floor → 5 ft above the destination floor");
});

test("level not given, another scene: the destination's initial level, never the source level id", async () => {
  const H = hall();
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: H.far.id });
  assert.notEqual(out.to.level, H.lvl);
  assert.equal(out.to.level, H.far.initialLevel.id);
  assert.deepEqual(["tCav", "tSkel", "tOwl"].map(i => H.far.tokens.get(`${i}${H.k}`).level), Array(3).fill(H.far.initialLevel.id));
});

/* ── dry run, leaders, refusals ───────────────────────────────────────── */

test("dryRun: no create, update or delete; returns who would come", async () => {
  const H = hall();
  for (const scene of [undefined, H.far.id]) {
    const n = F.calls.length;
    const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene, dryRun: true });
    assert.deepEqual(ops(n), [], `scene ${scene}`);
    assert.equal(out.ok, true);
    assert.equal(out.dryRun, true);
    assert.equal(out.moved, 0);
    assert.deepEqual(out.followers.map(f => f.id), [`tSkel${H.k}`, `tOwl${H.k}`]);
  }
  assert.equal(H.s.tokens.has(`tCav${H.k}`), true);
});

test("a non-PC token moves alone: followers [] (not an error)", async () => {
  const H = hall();
  const n = F.calls.length;
  const out = await api().teleportToken(H.t("tGuard"), { x: 1550, y: 750 });
  assert.deepEqual(ops(n)[0].updates.map(u => u._id), [`tGuard${H.k}`]);
  assert.deepEqual([out.ok, out.followers, out.moved], [true, [], 1]);
});

test("a polymorphed leader whose form names its original (dnd5e transformInto): the original's summons come too, on either path", async () => {
  for (const scene of [undefined, "far"]) {
    const H = hall({ tokens: (k, lvl) => [
      { id: `tWolf${k}`, name: "Wolf (Caven)", actorId: "FORM2", actorLink: true, x: 100, y: 200, level: lvl },
      { id: `tFam${k}`, name: "Familiar", actorId: "FAM", x: 300, y: 200, level: lvl },
      { id: `tOwl${k}`, name: "Owl", actorId: "OWL", x: 400, y: 200, level: lvl },
      { id: `tEye${k}`, name: "Arcane Eye", actorId: "EYE", x: 500, y: 200, level: lvl },
    ] });
    const out = await api().teleportToken(H.t("tWolf"), { x: 1550, y: 750, scene: scene && H.far.id });
    assert.deepEqual(out.followers.map(f => f.name).sort(), ["Familiar", "Owl"], `${scene}: Marrith's Arcane Eye stays`);
  }
  // the token flag alone (an older transform) names the original too
  const H = hall({ tokens: (k, lvl) => [
    { id: `tWolf${k}`, name: "Wolf (Caven)", actorId: "FORM", x: 100, y: 200, level: lvl, flags: { dnd5e: { originalActor: CAV_ORIGINAL } } },
    { id: `tFam${k}`, name: "Familiar", actorId: "FAM", x: 300, y: 200, level: lvl },
  ] });
  assert.deepEqual((await api().teleportToken(H.t("tWolf"), { x: 1550, y: 750, dryRun: true })).followers.map(f => f.name), ["Familiar"]);
});

test("a polymorphed leader whose form names no original: its solely-owned pet follows; the summons cannot be tied to it", async () => {
  const H = hall({ tokens: (k, lvl) => [
    { id: `tWolf${k}`, name: "Wolf (Caven)", actorId: "FORM", x: 100, y: 200, level: lvl },
    { id: `tSkel${k}`, name: "Skeleton", actorId: "SKEL", x: 300, y: 200, level: lvl },
    { id: `tOwl${k}`, name: "Owl", actorId: "OWL", x: 400, y: 200, level: lvl },
  ] });
  const out = await api().teleportToken(H.t("tWolf"), { x: 1550, y: 750, scene: H.far.id });
  assert.deepEqual(out.followers.map(f => f.name), ["Owl"]);
  assert.equal(H.s.tokens.has(`tSkel${H.k}`), true, "no originalActor anywhere: nothing ties the summon to the form");
});

test("refusals: a player → NOT_GM; unknown ref / unknown scene → NOT_FOUND; x NaN / unknown level → BAD_ARGS; nothing written", async () => {
  const H = hall();
  const n = F.calls.length;
  F.become({ userId: P1 });
  try {
    assert.equal((await api().teleportToken(H.t("tCav"), { x: 1, y: 1 })).code, "NOT_GM");
  } finally { F.become({ userId: GM }); }
  assert.equal((await api().teleportToken("nobody here", { x: 1, y: 1 })).code, "NOT_FOUND");
  assert.equal((await api().teleportToken(H.t("tCav"), { x: 1, y: 1, scene: "NoSuchScene00000" })).code, "NOT_FOUND");
  assert.equal((await api().teleportToken(H.t("tCav"), { x: 1, y: 1, scene: "Scene.NoSuchScene00000" })).code, "NOT_FOUND");
  assert.equal((await api().teleportToken(H.t("tCav"), { x: Number.NaN, y: 1 })).code, "BAD_ARGS");
  assert.equal((await api().teleportToken(H.t("tCav"), { y: 1 })).code, "BAD_ARGS");
  assert.equal((await api().teleportToken(H.t("tCav"), { x: 1, y: 1, level: "NoSuchLevel" })).code, "BAD_ARGS");
  assert.equal((await api().teleportToken(H.t("tCav"), { x: 1, y: 1, scene: H.far.id, level: H.lvl })).code, "BAD_ARGS", "the source level is not on the destination");
  assert.deepEqual(ops(n), []);
});

test("the ref: a 16-character token id or an exact name, scoped by opts.sceneId", async () => {
  const H = hall();
  const id = `RefGuard${String(H.k).padStart(8, "0")}`;
  W.token(H.s, { id, name: "Gate Guard", actorId: "GUARD", x: 1200, y: 200 });
  const out = await api().teleportToken(id, { x: 1550, y: 750, sceneId: H.s.id });
  assert.equal(out.ok, true);
  assert.equal(out.token.id, id);
  const byName = await api().teleportToken("Caven", { x: 150, y: 150, sceneId: H.s.id, dryRun: true });
  assert.equal(byName.ok, true);
  assert.equal(byName.token.id, `tCav${H.k}`);
});

test("keepId 'already exists' from a concurrent create (another session moved it first): fail CONFLICT, no throw, nothing deleted", async () => {
  const H = hall();
  const create = H.far.createEmbeddedDocuments;
  // the other GM tab's create lands between our check and our create
  H.far.createEmbeddedDocuments = function (type, data, options) {
    W.token(H.far, { id: `tCav${H.k}`, name: "Caven", actorId: "CAV", actorLink: true, x: 0, y: 0 });
    return create.call(this, type, data, options);
  };
  const n = F.calls.length;
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: H.far.id });
  H.far.createEmbeddedDocuments = create;
  assert.equal(out.ok, false);
  assert.equal(out.code, "CONFLICT");
  assert.deepEqual(ops(n).map(c => c.op), ["createEmbedded"]);
  assert.equal(H.s.tokens.has(`tCav${H.k}`), true);
});

test("a token id already on the destination (a duplicated scene keeps token ids): REFUSED naming it, dryRun too; nothing written", async () => {
  const H = hall();
  W.token(H.far, { id: `tSkel${H.k}`, name: "Skeleton (copy)", actorId: "SKEL", x: 0, y: 0 });
  const n = F.calls.length;
  for (const dryRun of [true, false]) {
    const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: H.far.id, dryRun });
    assert.equal(out.ok, false, `dryRun ${dryRun}`);
    assert.equal(out.code, "REFUSED", `dryRun ${dryRun}`);
    assert.match(out.reason, new RegExp(`Skeleton \\(tSkel${H.k}\\)`));
    assert.doesNotMatch(out.reason, /another session/);
  }
  assert.deepEqual(ops(n), []);
  assert.equal(H.s.tokens.has(`tCav${H.k}`), true);
});

/* ── guards: what the existing callers of the shared pieces still get ─── */

// [declared] pins-live S12-S18 (2026-10-17): this guard used to pin "the source level travels as
// before". On v14 that left every follower and party member on a level the destination does not
// have, and core then refused every later move of it ("level must exist"). Everything else in
// toObject() still travels as before; the level is one the destination has.
test("guard: carryTo without { level } (bringFollowers, teleportParty) keeps each token's toObject() but never a level the destination lacks", async () => {
  const H = hall();
  const want = [H.t("tSkel"), H.t("tOwl")].map(t => t.toObject());
  await S.carryTo([H.t("tSkel"), H.t("tOwl")], H.far, 1050, 550);
  for (const w of want) {
    const got = H.far.tokens.get(w.id).toObject();
    assert.deepEqual({ ...got, x: w.x, y: w.y, level: w.level }, w, w.id);
    assert.equal(got.level, H.far.initialLevel.id, `${w.id}: the destination's initial level, not ${H.lvl}`);
    assert.ok(H.far.levels.has(got.level), `${w.id}: a level the destination has`);
  }
});

test("carryTo without { level }: preferLevel when the destination has it; the token's own id when the destination shares it; else the initial level", async () => {
  const H = hall();
  addLevel(H.far, `FarUp${H.k}`);
  await S.carryTo([H.t("tSkel")], H.far, 1050, 550, null, { preferLevel: `FarUp${H.k}` });
  assert.equal(H.far.tokens.get(`tSkel${H.k}`).level, `FarUp${H.k}`, "preferred");
  await S.carryTo([H.t("tOwl")], H.far, 1050, 550, null, { preferLevel: "NotOnFar" });
  assert.equal(H.far.tokens.get(`tOwl${H.k}`).level, H.far.initialLevel.id, "a preferred level the destination lacks is ignored");
  addLevel(H.far, H.lvl);   // a single-level pair shares core's defaultLevel0000
  await S.carryTo([H.t("tEye")], H.far, 1050, 550);
  assert.equal(H.far.tokens.get(`tEye${H.k}`).level, H.lvl, "its own id, when the destination has it");
});

// review R3: displaceToLevel (teleportToken's copy of displaceOptions) folded into displaceOptions
test("guard: displaceOptions puts a move's own level / elevation in its waypoint; a move with neither is exactly { x, y, action }", () => {
  const moves = [{ _id: "a", x: 1, y: 2 }, { _id: "b", x: 3, y: 4, level: "L" }, { _id: "c", x: 5, y: 6, level: "L", elevation: 10 },
    { _id: "d", x: 7, y: 8, level: null, elevation: Number.NaN }];
  assert.deepEqual(displaceOptions(moves), { animate: false, movement: {
    a: { waypoints: [{ x: 1, y: 2, action: "displace" }] },
    b: { waypoints: [{ x: 3, y: 4, level: "L", action: "displace" }] },
    c: { waypoints: [{ x: 5, y: 6, elevation: 10, level: "L", action: "displace" }] },
    d: { waypoints: [{ x: 7, y: 8, action: "displace" }] } } });
});

test("guard: portal-hop follow still runs after a teleportToken (core's delete WITH replacements, a PC standing in the gate)", async () => {
  const H = hall();
  // teleportToken first (nothing follows a second time) …
  await api().teleportToken(H.t("tMar"), { x: 1550, y: 750 });
  const n = F.calls.length;
  // … then core's own Teleport Token: the PC is created on the far side, the old one deleted with replacements.
  const [arrived] = await H.far.createEmbeddedDocuments("Token", [{ ...H.t("tCav").toObject(), id: `tCavNew${H.k}`, x: 1000, y: 500 }]);
  await H.s.deleteEmbeddedDocuments("Token", [`tCav${H.k}`], { replacements: { [`tCav${H.k}`]: arrived.uuid } });
  await W.tick(12);
  const seen = ops(n).map(c => c.op);
  assert.deepEqual(seen.slice(0, 2), ["createEmbedded", "deleteEmbedded"]);
  assert.ok(seen.includes("notify"), "the 'Followed' toast");
  assert.deepEqual(["tSkel", "tOwl"].map(i => H.far.tokens.has(`${i}${H.k}`)), [true, true], "Caven's company followed through the portal");
});

// [declared] pins-live S12-S18 (2026-10-17): the portal-hop follow and Teleport party created their
// tokens with the SOURCE level id; on a destination without it (any scene with its own levels)
// core then refused every later move with "level must exist".
test("portal-hop follow onto a multi-level scene: the company lands on the PC's floor, never the source level id", async () => {
  const H = hall();
  addLevel(H.far, `FarUp${H.k}`);
  const [arrived] = await H.far.createEmbeddedDocuments("Token", [{ ...H.t("tCav").toObject(), id: `tCavNew${H.k}`, x: 1000, y: 500, level: `FarUp${H.k}` }]);
  await H.s.deleteEmbeddedDocuments("Token", [`tCav${H.k}`], { replacements: { [`tCav${H.k}`]: arrived.uuid } });
  await W.tick(12);
  for (const i of ["tSkel", "tOwl"]) {
    const t = H.far.tokens.get(`${i}${H.k}`);
    assert.ok(t, `${i} followed`);
    assert.equal(t.level, `FarUp${H.k}`, `${i}: the PC's floor`);
  }
});

test("Teleport party to another scene: each token lands on the destination region's floor (else the initial level), never the source level id", async () => {
  const H = hall();
  addLevel(H.far, `FarUp${H.k}`);
  const gate = H.far.regions.get(`FarGate${H.k}`);
  gate.levels = new Set([`FarUp${H.k}`]);
  F.canvas.scene = H.s;
  const out = await S.teleportParty(gate, { confirm: false });
  assert.equal(out.cancelled, false);
  const landed = H.far.tokens.filter(t => t.id.endsWith(`${H.k}`));
  assert.ok(landed.length >= 3, "the party moved");
  for (const t of landed) assert.equal(t.level, `FarUp${H.k}`, t.id);
  const H2 = hall();
  F.canvas.scene = H2.s;
  await S.teleportParty(H2.far.regions.get(`FarGate${H2.k}`), { confirm: false });
  const landed2 = H2.far.tokens.filter(t => t.id.endsWith(`${H2.k}`));
  assert.ok(landed2.length >= 3);
  for (const t of landed2) assert.equal(t.level, H2.far.initialLevel.id, `${t.id}: no region level → the initial level`);
});

/* ── code review 2026-10-17: findings 3, 4, 5 ─────────────────────────── */

// 16-character ids: real Foundry ids, which the kit's rootActorId validates (finding 11).
const DRUID = "druidCaven000001", WOLF = "wolfFormCaven001", FAMI = "familiarCaven001";
W.actor({ id: DRUID, name: "Caven", type: "character", ownership: own(P1) });
// dnd5e 6.0.6 transformInto: the form keeps the original's type ("character", `type: o.type`) and
// the token keeps its own actorLink; the form and its token name the original
W.actor({ id: WOLF, name: "Wolf (Caven)", type: "character", ownership: own(P1),
  flags: { dnd5e: { isPolymorphed: true, originalActor: DRUID, previousActorIds: [DRUID] } } });
// a summon the player does not own: only its summon.origin ties it to the druid
W.actor({ id: FAMI, name: "Familiar", flags: { dnd5e: { summon: { origin: `Actor.${DRUID}.Item.findFamiliar` } } } });
W.actor({ id: "PET2", name: "Hawk", ownership: own(P1) });
W.actor({ id: "PET3", name: "Cat", ownership: own(P1) });

/** A hall where Caven is wild-shaped into a wolf, with his familiar (no owners) and his owl. */
function druidHall() {
  return hall({ tokens: (k, lvl) => [
    { id: `tWolf${k}`, name: "Wolf (Caven)", actorId: WOLF, actorLink: true, x: 100, y: 200, level: lvl,
      flags: { dnd5e: { originalActor: DRUID, isPolymorphed: true } } },
    { id: `tFam${k}`, name: "Familiar", actorId: FAMI, x: 300, y: 200, level: lvl },
    { id: `tOwl${k}`, name: "Owl", actorId: "OWL", x: 400, y: 200, level: lvl },
    { id: `tGuard${k}`, name: "Guard", actorId: "GUARD", x: 1100, y: 200, level: lvl },
  ] });
}

test("finding 3: Teleport party onto another floor maps each token's elevation onto it (a summon at 15 on 0-30 does not float over a 0-10 ground)", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 30);
  withElevation(H.far.levels.get(`${H.far.id}Lvl0`), 0, 10);
  H.t("tSkel").elevation = 15;
  H.t("tOwl").elevation = 4;
  F.canvas.scene = H.s;
  await S.teleportParty(H.far.regions.get(`FarGate${H.k}`), { confirm: false });
  const at = id => H.far.tokens.get(`${id}${H.k}`);
  assert.equal(at("tSkel").level, H.far.initialLevel.id);
  assert.equal(at("tSkel").elevation, 10, "clamped into the 0-10 ground, not left at 15");
  assert.equal(at("tOwl").elevation, 4, "4 ft above the old floor → 4 ft above the new one");
});

test("finding 3: portal-hop follow onto an upper floor maps the company's elevation onto the PC's floor", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 30);
  withElevation(addLevel(H.far, `FarUp${H.k}`), 100, 110);
  H.t("tSkel").elevation = 5;
  const [arrived] = await H.far.createEmbeddedDocuments("Token", [{ ...H.t("tCav").toObject(), id: `tCavNew${H.k}`, x: 1000, y: 500, level: `FarUp${H.k}`, elevation: 100 }]);
  await H.s.deleteEmbeddedDocuments("Token", [`tCav${H.k}`], { replacements: { [`tCav${H.k}`]: arrived.uuid } });
  await W.tick(12);
  assert.equal(H.far.tokens.get(`tSkel${H.k}`).elevation, 105, "5 ft above the source floor → 5 ft above the PC's floor");
  assert.equal(H.far.tokens.get(`tOwl${H.k}`).elevation, 100, "on the floor, not 100 ft below it");
});

test("finding 3: the plain carry path lands by the arrival floor only (a ground-floor guard under the gate does not push the party off an upper-floor gate)", async () => {
  const H = hall();
  addLevel(H.far, `FarUp${H.k}`);
  const gate = H.far.regions.get(`FarGate${H.k}`);
  gate.levels = new Set([`FarUp${H.k}`]);
  W.token(H.far, { id: `tFarGuard${H.k}`, name: "Guard", actorId: "GUARD", x: 1000, y: 500, level: `${H.far.id}Lvl0` });
  F.canvas.scene = H.s;
  await S.teleportParty(gate, { confirm: false });
  const cav = H.far.tokens.get(`tCav${H.k}`);
  assert.deepEqual([cav.x, cav.y, cav.level], [1000, 500, `FarUp${H.k}`], "the upper floor is free there: the first PC lands on the gate");
  // the same guard on the gate's own floor: the PC is pushed off it, as before
  const H2 = hall();
  addLevel(H2.far, `FarUp${H2.k}`);
  const gate2 = H2.far.regions.get(`FarGate${H2.k}`);
  gate2.levels = new Set([`FarUp${H2.k}`]);
  W.token(H2.far, { id: `tFarGuard${H2.k}`, name: "Guard", actorId: "GUARD", x: 1000, y: 500, level: `FarUp${H2.k}` });
  F.canvas.scene = H2.s;
  await S.teleportParty(gate2, { confirm: false });
  const cav2 = H2.far.tokens.get(`tCav${H2.k}`);
  assert.notDeepEqual([cav2.x, cav2.y], [1000, 500], "same floor: the guard's square is taken");
});

// [declared] review A2-5 (2026-10-17): flipped from "same level id: elevation is left alone". Two
// scenes' default levels share the id defaultLevel0000 but not their range (top = 4 grid units, v14
// common/documents/level.mjs _initializeSource), so a token at 20 on a 0-30 floor floated over a 0-10
// one. Another scene always maps now, as teleportToken's explicit-level path already did (L2).
test("review A2-5: carried on the same level id to ANOTHER scene, elevation is mapped onto that floor (identical ranges: unchanged)", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 30);
  withElevation(addLevel(H.far, H.lvl), 0, 10);
  H.t("tSkel").elevation = 20;
  H.t("tOwl").elevation = 5;
  await S.carryTo([H.t("tSkel"), H.t("tOwl")], H.far, 1050, 550);
  assert.equal(H.far.tokens.get(`tSkel${H.k}`).level, H.lvl);
  assert.equal(H.far.tokens.get(`tSkel${H.k}`).elevation, 10, "clamped into the 0-10 floor");
  assert.equal(H.far.tokens.get(`tOwl${H.k}`).elevation, 5, "inside the range: the same height");
});

// review T1 / A2-5-flying-clamp (2026-10-17): a v14 default level is 0 to 4 grid units, and core never
// clamps a token into its own level, so a flying familiar at 30 ft (or a burrower at -10) sits OUTSIDE
// its floor. Clamping it on every scene change landed it at 15 / 0 although the PC it follows keeps 30
// (core's region teleport clamps only into the region's range, unbounded by default).
test("review T1: a token outside its own floor's range (flying above it, burrowing below, head through the ceiling) keeps its height above the base on another scene", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 20);
  withElevation(addLevel(H.far, H.lvl), 0, 20);
  Object.assign(H.t("tSkel"), { elevation: 30, depth: 1 });
  Object.assign(H.t("tOwl"), { elevation: -10, depth: 1 });
  Object.assign(H.t("tEye"), { elevation: 18, depth: 1 });
  await S.carryTo([H.t("tSkel"), H.t("tOwl"), H.t("tEye")], H.far, 1050, 550);
  assert.deepEqual(["tSkel", "tOwl", "tEye"].map(i => H.far.tokens.get(`${i}${H.k}`).elevation), [30, -10, 18],
    "identical 0-20 ranges: nobody moves up or down");
  // another range: the same height above the new base, never clamped into it
  const H2 = hall();
  withElevation(H2.s.levels.get(H2.lvl), 0, 20);
  withElevation(addLevel(H2.far, `FarUp${H2.k}`), 100, 110);
  Object.assign(H2.t("tSkel"), { elevation: 30, depth: 1 });
  Object.assign(H2.t("tOwl"), { elevation: 5, depth: 1 });
  await S.carryTo([H2.t("tSkel"), H2.t("tOwl")], H2.far, 1050, 550, null, { level: `FarUp${H2.k}` });
  assert.equal(H2.far.tokens.get(`tSkel${H2.k}`).elevation, 130, "30 ft above the old base → 30 ft above the new one");
  assert.equal(H2.far.tokens.get(`tOwl${H2.k}`).elevation, 105, "inside its floor: mapped and clamped as before (head under the 110 top)");
});

test("review T1: same scene, another floor — a flying summon keeps its height above the base; one inside its floor is still clamped", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 20);
  withElevation(addLevel(H.s, `Up${H.k}`), 20, 25);
  Object.assign(H.t("tCav"), { elevation: 0, depth: 1 });
  Object.assign(H.t("tSkel"), { elevation: 40, depth: 1 });
  Object.assign(H.t("tOwl"), { elevation: 10, depth: 1 });
  const n = F.calls.length;
  await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, level: `Up${H.k}` });
  const [u] = ops(n);
  const by = Object.fromEntries(u.updates.map(x => [x._id, x]));
  assert.deepEqual([`tCav${H.k}`, `tSkel${H.k}`, `tOwl${H.k}`].map(id => by[id].elevation), [20, 60, 20],
    "the PC lands on the floor; the flying summon keeps 40 ft above the base; the pet at 10 is clamped (30 → 20 with its 5 ft height)");
  assert.equal(u.options.movement[`tSkel${H.k}`].waypoints[0].elevation, 60, "the waypoint carries it too");
});

test("finding 4: a wild-shaped druid's familiar (it names the ORIGINAL actor) follows through a portal", async () => {
  const H = druidHall();
  const [arrived] = await H.far.createEmbeddedDocuments("Token", [{ ...H.t("tWolf").toObject(), id: `tWolfNew${H.k}`, x: 1000, y: 500 }]);
  await H.s.deleteEmbeddedDocuments("Token", [`tWolf${H.k}`], { replacements: { [`tWolf${H.k}`]: arrived.uuid } });
  await W.tick(12);
  assert.equal(H.far.tokens.has(`tFam${H.k}`), true, "the familiar followed its druid");
  assert.equal(H.far.tokens.has(`tOwl${H.k}`), true, "the owl followed (ownership, as before)");
  assert.equal(H.s.tokens.has(`tGuard${H.k}`), true);
});

test("finding 4: Teleport party takes a wild-shaped druid's unowned familiar, and lands it beside the druid", async () => {
  const H = druidHall();
  assert.deepEqual(S.partyRecords(H.s).map(r => r.name), ["Wolf (Caven)", "Familiar", "Owl"]);
  F.canvas.scene = H.s;
  await S.teleportParty(H.far.regions.get(`FarGate${H.k}`), { confirm: false });
  const wolf = H.far.tokens.get(`tWolf${H.k}`), fam = H.far.tokens.get(`tFam${H.k}`);
  assert.ok(fam, "the familiar came");
  assert.ok(near(fam, wolf) <= 100, "beside its druid");
});

test("finding 4: recordOf carries rootActorId only while transformed (the golden record shape is unchanged)", () => {
  const H = druidHall();
  assert.equal(S.recordOf(H.t("tWolf")).rootActorId, DRUID);
  assert.equal("rootActorId" in S.recordOf(H.t("tOwl")), false);
  assert.equal("rootActorId" in S.recordOf(H.t("tGuard")), false);
});

test("finding 5: teleportToken lands a polymorphed non-character leader's company beside it, not in ring order around the click", async () => {
  const H = hall({ tokens: (k, lvl) => [
    { id: `tForm${k}`, name: "Wolf", actorId: "FORM", x: 100, y: 200, level: lvl },
    { id: `tOwl${k}`, name: "Owl", actorId: "OWL", x: 300, y: 200, level: lvl },
    { id: `tHawk${k}`, name: "Hawk", actorId: "PET2", x: 400, y: 200, level: lvl },
    { id: `tCat${k}`, name: "Cat", actorId: "PET3", x: 500, y: 200, level: lvl },
    // a stander on the click: the leader steps off it, so ring order would scatter the company
    { id: `tGuard${k}`, name: "Guard", actorId: "GUARD", x: 1500, y: 700, level: lvl },
  ] });
  const out = await api().teleportToken(H.t("tForm"), { x: 1550, y: 750 });
  assert.deepEqual(out.followers.map(f => f.name), ["Owl", "Hawk", "Cat"]);
  const wolf = H.t("tForm");
  for (const id of ["tOwl", "tHawk", "tCat"]) assert.ok(near(H.t(id), wolf) <= 100, `${id} beside the wolf`);
});

test("finding 11: a transform flag that is not a document id is skipped (the kit's rule, shared with pins)", async () => {
  const H = hall({ tokens: (k, lvl) => [
    { id: `tWolf${k}`, name: "Wolf (Caven)", actorId: "FORM", x: 100, y: 200, level: lvl, flags: { dnd5e: { originalActor: "not an id" } } },
    { id: `tFam${k}`, name: "Familiar", actorId: "FAM", x: 300, y: 200, level: lvl },
  ] });
  assert.equal("rootActorId" in S.recordOf(H.t("tWolf")), false);
  assert.deepEqual((await api().teleportToken(H.t("tWolf"), { x: 1550, y: 750, dryRun: true })).followers, []);
});

/* ── code review 2026-10-17 (max): A2-1, A2-4, L2, L3, R1 ─────────────── */

test("review A2-1/L2: Teleport party to a region on another floor of the SAME scene puts the party on that floor (level in update and waypoint, elevation mapped, landing on that floor)", async () => {
  const H = hall();
  withElevation(H.s.levels.get(H.lvl), 0, 10);
  withElevation(addLevel(H.s, `Up${H.k}`), 10, 20);
  const stair = W.region(H.s, { id: `Stair${H.k}`, name: "Stair", bounds: { x: 2000, y: 2000, width: 100, height: 100 } });
  stair.levels = new Set([`Up${H.k}`]);
  // a ground-floor guard right under the stair: it must not push the party off an upper-floor landing
  W.token(H.s, { id: `tGround${H.k}`, name: "Guard", actorId: "GUARD", x: 2000, y: 2000, level: H.lvl });
  F.canvas.scene = H.s;
  const n = F.calls.length;
  const out = await S.teleportParty(stair, { confirm: false });
  assert.equal(out.cancelled, false);
  const [u] = ops(n);
  assert.equal(u.op, "updateEmbedded");
  for (const x of u.updates) {
    assert.equal(x.level, `Up${H.k}`, x._id);
    assert.deepEqual(u.options.movement[x._id].waypoints, [{ x: x.x, y: x.y, elevation: x.elevation, level: `Up${H.k}`, action: "displace" }], x._id);
  }
  assert.equal(H.t("tCav").level, `Up${H.k}`);
  assert.equal(H.t("tCav").elevation, 10, "0 ft above the ground → 0 ft above the upper floor");
  assert.deepEqual([H.t("tCav").x, H.t("tCav").y], [2000, 2000], "the upper floor is free there: the first PC lands on the stair");
});

test("review A2-1: Teleport party on the same scene moves a token stranded on a deleted level onto the initial level; the others keep theirs", async () => {
  const H = hall();
  const cell = W.region(H.s, { id: `Cell${H.k}`, name: "Cell", bounds: { x: 2000, y: 2000, width: 100, height: 100 } });
  H.t("tSkel").level = "goneLevel0000000";
  F.canvas.scene = H.s;
  const n = F.calls.length;
  await S.teleportParty(cell, { confirm: false });
  const [u] = ops(n);
  const by = Object.fromEntries(u.updates.map(x => [x._id, x]));
  assert.equal(by[`tSkel${H.k}`].level, H.lvl, "core would refuse a move that keeps the missing level");
  assert.equal(u.options.movement[`tSkel${H.k}`].waypoints[0].level, H.lvl);
  assert.equal("level" in by[`tCav${H.k}`], false, "on its level already: no level written, as before");
});

test("review A2-4: teleportToken on the same scene with no level, from a level the scene no longer has → the initial level, not the stale id", async () => {
  const H = hall();
  H.t("tCav").level = "goneLevel0000000";
  const n = F.calls.length;
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750 });
  assert.equal(out.ok, true);
  assert.equal(out.to.level, H.lvl);
  const [u] = ops(n);
  assert.ok(u.updates.every(x => x.level === H.lvl), "every mover on the initial level");
  assert.equal(H.t("tCav").level, H.lvl);
});

test("review L3: Teleport party to a scene that already holds a mover's token id (a duplicated scene) → GM warning, nothing moves, { moved: 0, cancelled: true }", async () => {
  const H = hall();
  W.token(H.far, { id: `tSkel${H.k}`, name: "Skeleton", actorId: "SKEL", x: 1600, y: 600, level: `${H.far.id}Lvl0` });
  F.canvas.scene = H.s;
  const n = F.calls.length;
  const out = await S.teleportParty(H.far.regions.get(`FarGate${H.k}`), { confirm: false });
  assert.deepEqual(out, { moved: 0, cancelled: true });
  const seen = ops(n);
  assert.deepEqual(seen.map(c => c.op), ["notify"], "no create, no delete, no pull, no view");
  assert.equal(seen[0].level, "warn");
  assert.match(seen[0].message, /^Skeleton stayed behind: Far Cave already has a token with the same id/);
  assert.equal(H.s.tokens.has(`tCav${H.k}`), true);
});

test("review L3: portal-hop follow — a follower whose id the destination ALREADY held stays (GM warned); the rest of the company still follows", async () => {
  const H = hall();
  W.token(H.far, { id: `tOwl${H.k}`, name: "Owl", actorId: "OWL", x: 1600, y: 600, level: `${H.far.id}Lvl0` });
  const n = F.calls.length;
  const [arrived] = await H.far.createEmbeddedDocuments("Token", [{ ...H.t("tCav").toObject(), id: `tCavNew${H.k}`, x: 1000, y: 500 }]);
  await H.s.deleteEmbeddedDocuments("Token", [`tCav${H.k}`], { replacements: { [`tCav${H.k}`]: arrived.uuid } });
  await W.tick(12);
  assert.equal(H.far.tokens.has(`tSkel${H.k}`), true, "the skeleton followed (before: the whole create was refused and read as the election)");
  assert.equal(H.s.tokens.has(`tSkel${H.k}`), false);
  assert.equal(H.s.tokens.has(`tOwl${H.k}`), true, "the owl stayed on the source scene");
  const warn = ops(n).find(c => c.op === "notify" && c.level === "warn");
  assert.match(warn?.message ?? "", /^Owl stayed behind: Far Cave/);
});

test("review L3 guard: heldIds is read in the delete hook, so only ids the destination held BEFORE any GM tab carried count (a later carry stays the election)", async () => {
  const H = hall();
  const [arrived] = await H.far.createEmbeddedDocuments("Token", [{ ...H.t("tCav").toObject(), id: `tCavNew${H.k}`, x: 1000, y: 500 }]);
  const replacements = { [`tCav${H.k}`]: arrived.uuid };
  assert.deepEqual([...heldIds(H.s, replacements)].map(([k, v]) => [k, [...v]]), [[H.far.id, []]], "nothing held yet");
  W.token(H.far, { id: `tOwl${H.k}`, name: "Owl", actorId: "OWL", x: 1600, y: 600, level: `${H.far.id}Lvl0` });
  assert.deepEqual([...heldIds(H.s, replacements).get(H.far.id)], [`tOwl${H.k}`]);
  assert.equal(heldIds(H.s, { x: H.t("tMar").uuid }).size, 0, "a same-scene replacement is not a hop");
});

test("review R1: opts.scene goes through the kit's resolveRef — an exact scene name works; a token uuid is BAD_ARGS, not NOT_FOUND", async () => {
  const H = hall();
  H.far.name = `Far Cave ${H.k}`;
  const out = await api().teleportToken(H.t("tCav"), { x: 1550, y: 750, scene: `Far Cave ${H.k}` });
  assert.equal(out.ok, true);
  assert.equal(out.to.scene, H.far.id);
  const H2 = hall();
  const bad = await api().teleportToken(H2.t("tCav"), { x: 1, y: 1, scene: H2.t("tMar").uuid });
  assert.equal(bad.code, "BAD_ARGS");
  assert.equal(H2.s.tokens.has(`tCav${H2.k}`), true, "nothing moved");
});

test("review C6: a bare token id held by two scenes (a duplicated scene keeps ids) is AMBIGUOUS without opts.sceneId; sceneId, a uuid or the document picks one", async () => {
  const dup = "dupTokenId000001";
  const tok = () => [{ id: dup, name: "Caven", actorId: "CAV", actorLink: true, x: 100, y: 200 }];
  const a = W.scene({ id: "DupSceneA0000001", name: "Dup A", tokens: tok() });
  const b = W.scene({ id: "DupSceneB0000001", name: "Dup B", tokens: tok() });
  const n = F.calls.length;
  const out = await api().teleportToken(dup, { x: 1550, y: 750 });
  assert.equal(out.ok, false);
  assert.equal(out.code, "AMBIGUOUS");
  assert.match(out.reason, /2 scenes/);
  assert.deepEqual(ops(n), [], "nothing written");
  const byScene = await api().teleportToken(dup, { x: 1550, y: 750, sceneId: b.id, dryRun: true });
  assert.equal(byScene.ok, true);
  assert.equal(byScene.from, b.id, "opts.sceneId picks the scene");
  const byUuid = await api().teleportToken(`Scene.${a.id}.Token.${dup}`, { x: 1550, y: 750, dryRun: true });
  assert.equal(byUuid.from, a.id, "a uuid is never ambiguous");
  const byDoc = await api().teleportToken(b.tokens.get(dup), { x: 1550, y: 750, dryRun: true });
  assert.equal(byDoc.from, b.id, "a document is never ambiguous");
});
