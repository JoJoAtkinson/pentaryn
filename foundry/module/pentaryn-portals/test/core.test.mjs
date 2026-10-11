// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
// Ports the 52 legacy checks (test/legacy-core.mjs) and adds finding -38's isScenery edges.
import * as core from "../portals-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const { crowded, assignSpots, leaderOf, partyPreview, summonerActorId, playerOwners, isScenery, isPC, partySelection, followersOf,
  ringSpots, wallBlocker, absoluteDestinations, hasDestination, withoutDestination } = core;

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  for (const name of ["absoluteDestinations", "assignSpots", "crowded", "followersOf", "hasDestination", "isPC", "isScenery",
    "leaderOf", "partyPreview", "partySelection", "playerOwners", "ringSpots", "summonerActorId", "wallBlocker", "withoutDestination"]) {
    assert.equal(typeof core[name], "function", name);
  }
  assert.equal(core.OWNER, 3);
});

test("module.json: id and version as shipped (0.4.4)", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(manifest.id, "pentaryn-portals");
  assert.equal(manifest.version, "0.4.4");
});

test("VERSION === module.json version", { todo: "core has no VERSION yet; S2 moves VERSION/MODULE into core (C41)" }, () => {
  assert.equal(core.VERSION, manifestOf(ROOT).version);
  assert.equal(core.MODULE, manifestOf(ROOT).id);
});

const rec = (id, o = {}) => ({ id, actorId: o.actorId ?? `A-${id}`, type: o.type ?? "npc", linked: !!o.linked,
  pile: !!o.pile, excluded: !!o.excluded, handle: !!o.handle, owners: o.owners ?? [], summoner: o.summoner ?? null,
  name: o.name ?? id });
const ids = rs => rs.map(r => r.id);

test("summonerActorId", () => {
  assert.equal(summonerActorId("Actor.abc123.Item.xyz"), "abc123");
  assert.equal(summonerActorId("Scene.s.Token.t.Actor.zz.Item.q"), "zz");
  assert.equal(summonerActorId(null), null);
  assert.equal(summonerActorId("Item.xyz"), null);
});

test("playerOwners", () => {
  assert.deepEqual(playerOwners({ default: 3, gm: 3, p1: 3, p2: 2, p3: 3 }, ["gm"]), ["p1", "p3"]);
  assert.deepEqual(playerOwners(undefined), []);
});

test("isScenery (legacy cases)", () => {
  assert.equal(isScenery({ name: "Drow Commoner (crowd) 3" }), true);
  assert.equal(isScenery({ name: "Marker · 4" }), true);
  assert.equal(isScenery({ name: "Villager (smith)", folders: ["Crowd — Surface Folk (grey)"] }), true);
  assert.equal(isScenery({ name: "Red", folders: ["Temp Markers"] }), true);
  assert.equal(isScenery({ name: "Skeleton", folders: ["Summons"] }), false);
});

test("isScenery edges (finding -38)", () => {
  assert.equal(isScenery({ name: "Marker·4" }), true);
  assert.equal(isScenery({ name: "x", folders: ["Scene Props", "Markers — Red"] }), true);
  assert.equal(isScenery({ name: "Crowded Hall" }), false);
  assert.equal(isScenery(), false);
  assert.equal(isScenery({ name: "x", folders: [null] }), false);
});

const caven = rec("caven", { type: "character", linked: true, owners: ["p1"], actorId: "CAV" });
const marrith = rec("marrith", { type: "character", linked: true, owners: ["p2"], actorId: "MAR" });
const skel1 = rec("skel1", { owners: ["p1"], summoner: "CAV" });
const skel2 = rec("skel2", { owners: ["p1"] });
const eye = rec("eye", { summoner: "MAR" });
const steed = rec("steed", { owners: ["p1", "p2"] });
const pile = rec("pile", { owners: ["p1"], pile: true });
const crowd = rec("crowd", { excluded: true, owners: ["p1"] });
const guard = rec("guard");
const otherSummon = rec("os", { summoner: "NOTPC" });
const all = [caven, marrith, skel1, skel2, eye, steed, pile, crowd, guard, otherSummon];
const handleTok = rec("cod", { owners: ["p1", "p2"], handle: true });

test("party selection", () => {
  assert.deepEqual([caven, skel1, pile].map(isPC), [true, false, false]);
  assert.deepEqual(ids(partySelection(all)), ["caven", "marrith", "skel1", "skel2", "eye", "steed"]);
  assert.deepEqual(ids(partySelection([rec("x", { type: "character", linked: true, pile: true })])), []);
  assert.deepEqual(ids(partySelection([...all, handleTok])), ["caven", "marrith", "skel1", "skel2", "eye", "steed"]);
});

test("followersOf (native teleport)", () => {
  assert.deepEqual(ids(followersOf([caven], all)), ["skel1", "skel2"]);
  assert.deepEqual(ids(followersOf([marrith], all)), ["eye"]);
  assert.deepEqual(ids(followersOf([caven, marrith], all)), ["skel1", "skel2", "eye", "steed"]);
  assert.deepEqual(ids(followersOf([caven], [rec("fam", { owners: ["p1"], summoner: "MAR" })])), []);
  assert.deepEqual(ids(followersOf([caven], [rec("pc2", { type: "character", linked: true, owners: ["p1"] })])), []);
  assert.deepEqual(ids(followersOf([caven, marrith], [handleTok])), []);
});

test("leaderOf", () => {
  assert.equal(leaderOf(eye, [caven, marrith]), "marrith");
  assert.equal(leaderOf(skel2, [caven, marrith]), "caven");
  assert.equal(leaderOf(steed, [caven, marrith]), "caven");
  assert.equal(leaderOf(rec("x", { owners: ["p9"] }), [caven, marrith]), null);
});

test("assignSpots: followers land beside their PC", () => {
  const d = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const spots = ringSpots(0, 0, 1, 9);
  const placed = assignSpots(spots, [caven, marrith, eye]);
  assert.deepEqual(placed[0], { x: 0, y: 0 });
  assert.equal(d(placed[2], placed[1]), 1);
  const big = ringSpots(0, 0, 1, 25);
  const many = [caven, marrith, rec("e1", { summoner: "MAR" }), rec("e2", { summoner: "MAR" }), rec("e3", { summoner: "MAR" }), skel1];
  const pl = assignSpots(big.slice(0, many.length), many);
  assert.equal(new Set(pl.map(p => `${p.x},${p.y}`)).size, many.length);
  const pl2 = assignSpots(big, many);
  assert.deepEqual([2, 3, 4].map(i => d(pl2[i], pl2[1]) <= 2), [true, true, true]);
  assert.equal(d(pl2[5], pl2[0]), 1);
  assert.deepEqual(assignSpots(spots.slice(0, 2), [skel1, skel2]), spots.slice(0, 2));
  assert.deepEqual(assignSpots([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], [caven, skel1, skel2]),
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }]);
});

test("assignSpots: fewer spots than party → the rest copy spots[0]; no spots → origin", () => {
  assert.deepEqual(assignSpots([{ x: 5, y: 5 }], [caven, marrith]), [{ x: 5, y: 5 }, { x: 5, y: 5 }]);
  assert.deepEqual(assignSpots([], [caven]), [{ x: 0, y: 0 }]);
});

test("partyPreview", () => {
  assert.deepEqual(partyPreview(partySelection(all)).map(r => r.leaderName ?? "-"), ["-", "-", "caven", "caven", "marrith", "caven"]);
  assert.deepEqual(partyPreview([caven, rec("nameless", { owners: ["p9"], name: undefined })]), [
    { id: "caven", name: "caven", follower: false, leaderName: null },
    { id: "nameless", name: "nameless", follower: true, leaderName: null },
  ]);
});

test("ringSpots", () => {
  assert.deepEqual(ringSpots(0, 0, 100, 1), [{ x: 0, y: 0 }]);
  assert.deepEqual(ringSpots(0, 0, 100, 3), [{ x: 0, y: 0 }, { x: -100, y: -100 }, { x: 0, y: -100 }]);
  assert.deepEqual(ringSpots(0, 0, 100, 1, { occupied: (x, y) => x === 0 && y === 0 }), [{ x: -100, y: -100 }]);
  const wall = wallBlocker([[50, -500, 50, 500]]);
  assert.deepEqual(ringSpots(0, 0, 100, 8, { blocked: wall }).filter(s => s.x > 0), []);
  assert.deepEqual(ringSpots(0, 0, 100, 2, { blocked: () => true, occupied: () => false, maxRing: 3 }), [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
});

test("destinations: core 14.368+ stores same-scene links relative to the behavior", () => {
  const toAbs = u => (u.startsWith("..") && !u.startsWith("...") ? `Scene.S.Region.${u.slice(2)}` : u.startsWith(".") ? null : u);
  const stored = new Set(["..R2", "Scene.T.Region.R9"]);
  assert.deepEqual(absoluteDestinations(stored, toAbs), ["Scene.S.Region.R2", "Scene.T.Region.R9"]);
  assert.equal(hasDestination(stored, "Scene.S.Region.R2", toAbs), true);
  assert.equal(hasDestination(stored, "Scene.T.Region.R9", toAbs), true);
  assert.equal(hasDestination(stored, "Scene.S.Region.R3", toAbs), false);
  assert.equal(hasDestination(["Scene.S.Region.R2"], "Scene.S.Region.R2", toAbs), true);
  assert.deepEqual(withoutDestination(stored, "Scene.S.Region.R2", toAbs), ["Scene.T.Region.R9"]);
  assert.deepEqual(withoutDestination(stored, "Scene.T.Region.R9", toAbs), ["..R2"]);
  assert.deepEqual(withoutDestination(stored, "Scene.X.Region.Q", toAbs), ["..R2", "Scene.T.Region.R9"]);
  assert.deepEqual(absoluteDestinations([".bad"], toAbs), [".bad"]);
  assert.deepEqual(absoluteDestinations(undefined, toAbs), []);
  assert.deepEqual(withoutDestination(undefined, "x", toAbs), []);
});

test("crowded", () => {
  assert.equal(crowded({ x: 100, y: 100, w: 100, h: 100 }, [{ x: 100, y: 100, w: 100, h: 100 }]), true);
  assert.equal(crowded({ x: 200, y: 200, w: 100, h: 100 }, [{ x: 100, y: 100, w: 200, h: 200 }]), true);
  assert.equal(crowded({ x: 200, y: 100, w: 100, h: 100 }, [{ x: 100, y: 100, w: 100, h: 100 }]), false);
  assert.equal(crowded({ x: 0, y: 0, w: 100, h: 100 }, []), false);
  assert.equal(crowded({ x: 0, y: 0, w: 100, h: 100 }, null), false);
  assert.equal(crowded({ x: 0, y: 0, w: 100, h: 100 }), false);
});
