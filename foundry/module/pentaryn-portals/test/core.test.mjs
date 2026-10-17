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

// [declared] Wave 7 batch (Joe 2026-10-12): flipped from "as shipped (0.4.4)" — the batch bumps portals
// to 0.5.0 (the blueprint migration's API additions, lang/en.json, D-P1…D-P6) with VERSION.
// [declared] 0.6.0 (pins plan 2026-10, D5): the additive teleportToken row; CONTRACT major unchanged.
test("module.json: id and version as shipped (0.6.0)", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(manifest.id, "pentaryn-portals");
  assert.equal(manifest.version, "0.6.0");
});

test("VERSION === module.json version (C41; live since S2 moved VERSION/MODULE into core)", () => {
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

test("teleportToken helpers: a wild-shaped lead's root actor, elevation onto another floor", () => {
  const wolf = { ...rec("wolf", { owners: ["p1"], actorId: "FORM" }), polymorphed: true, rootActorId: "CAV" };
  assert.deepEqual(ids(followersOf([wolf], all)), ["skel1", "skel2"], "a summon naming the original follows the form");
  assert.deepEqual(ids(followersOf([{ ...wolf, rootActorId: undefined }], all)), ["skel2"], "without a root: only by ownership, as portal travel");
  assert.equal(leaderOf(skel1, [wolf]), "wolf", "lands beside the form");
  // code review 2026-10-17 #11: the rule is the kit's rootActorId (lib/root-actor.mjs, its own tests), not core's
  assert.equal(core.originalActorId, undefined, "portals keeps no second copy of the root-actor rule");
  const clamp = (lo, hi) => (e, d = 0) => Math.min(Math.max(Math.min(Math.max(e + d * 5, lo), hi) - d * 5, lo), hi);
  assert.equal(core.elevationOnLevel(0, 0, 0, 10, clamp(10, 20)), 10, "ground → upper floor: 0 ft above it, not -10");
  assert.equal(core.elevationOnLevel(20, 0, 0, 0, clamp(0, 10)), 10, "clamped into a 0-10 floor");
  assert.equal(core.elevationOnLevel(15, 1, 10, 100, clamp(100, 110)), 105, "relative height kept, the head clamped in");
  assert.equal(core.elevationOnLevel(undefined, undefined, undefined, 0, clamp(0, 10)), 0);
  // review T1: a token its OWN floor's clamp would move (flying above, burrowing below, head through the
  // ceiling: core never clamps a token into its level) keeps its height above the base, unclamped
  assert.equal(core.elevationOnLevel(30, 1, 0, 0, clamp(0, 20), clamp(0, 20)), 30, "flying over a 0-20 floor → 30 on an identical one, not 15");
  assert.equal(core.elevationOnLevel(-10, 1, 0, 100, clamp(100, 110), clamp(0, 20)), 90, "burrowing 10 ft under → 10 ft under the new base");
  assert.equal(core.elevationOnLevel(18, 1, 0, 0, clamp(0, 20), clamp(0, 20)), 18, "head through the ceiling: left as it stands");
  assert.equal(core.elevationOnLevel(15, 1, 0, 0, clamp(0, 10), clamp(0, 20)), 5, "inside its own floor: clamped into the new one as before");
  // review R8: walls by level are core's CanvasDocument#includedInLevel (scene-adapter landingPlaces), no copy here
  assert.equal(core.wallOnLevel, undefined, "portals keeps no copy of core's includedInLevel");
});

// [declared] pins-live S12-S18 (2026-10-17): teleportParty / bringFollowers carried the source
// level id onto a destination without it; core then refused every move ("level must exist").
test("carriedLevel: preferred, else own when the destination has it, else initial; never a level the destination lacks", () => {
  const has = id => ["G", "U", "defaultLevel0000"].includes(id);
  assert.equal(core.carriedLevel("Src", { has, preferred: "U", initial: "G" }), "U");
  assert.equal(core.carriedLevel("defaultLevel0000", { has, preferred: "Nope", initial: "G" }), "defaultLevel0000");
  assert.equal(core.carriedLevel("Src", { has, initial: "G" }), "G", "the source level id is not on the destination");
  assert.equal(core.carriedLevel(null, { has, initial: "G" }), "G");
  assert.equal(core.carriedLevel("Src", { has, initial: "Nope" }), null);
  assert.equal(core.carriedLevel("Src", {}), null);
});

test("leaderOf", () => {
  assert.equal(leaderOf(eye, [caven, marrith]), "marrith");
  assert.equal(leaderOf(skel2, [caven, marrith]), "caven");
  assert.equal(leaderOf(steed, [caven, marrith]), "caven");
  assert.equal(leaderOf(rec("x", { owners: ["p9"] }), [caven, marrith]), null);
});

// review R1 (earlier pass): the rootActorId branch, alone. The familiar has no owners, so only its
// summon.origin (the ORIGINAL druid, dnd5e 6.0.6) can tie it to the wild-shaped PC.
test("leaderOf: a summon naming a wild-shaped PC's ORIGINAL actor lands beside the form; its own actorId still wins", () => {
  const wolf = { ...rec("wolf", { type: "character", linked: true, owners: ["p1"], actorId: "FORM" }), rootActorId: "CAV" };
  const fam = rec("fam", { summoner: "CAV" });
  assert.equal(leaderOf(fam, [marrith, wolf]), "wolf", "matched by rootActorId");
  assert.equal(leaderOf(fam, [marrith, { ...wolf, rootActorId: undefined }]), null, "no root: nothing ties it to the form");
  assert.equal(leaderOf(fam, [caven, wolf]), "caven", "a PC whose actorId is the summoner comes first, in party order");
  assert.equal(leaderOf(rec("x", { summoner: null }), [{ ...wolf, rootActorId: null }]), null, "a null root never matches a missing summoner");
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

test("portals-edge-2: occupiedBy tests a box by overlap; ringSpots hands occupied each token's footprint", () => {
  const occ = core.occupiedBy([{ x: 200, y: 200, w: 100, h: 100 }]);
  assert.deepEqual([occ(100, 100, 200, 200), occ(100, 100, 100, 100), occ(300, 200, 100, 100), occ(250, 250)], [true, false, false, true]);
  // A 2×2 first, then 1×1s, around (150, 150) on a 100 grid; a stander on (200, 200).
  const size = i => (i === 0 ? 2 : 1);
  const footprint = (x, y, i) => {
    const w = size(i) * 100;
    return { x: Math.round((x - w / 2) / 100) * 100, y: Math.round((y - w / 2) / 100) * 100, w, h: w };
  };
  const seen = [];
  const spots = ringSpots(150, 150, 100, 6, { occupied: (...a) => { seen.push(a.length); return occ(...a); }, footprint });
  const boxes = spots.map((s, i) => footprint(s.x, s.y, i));
  assert.ok(seen.every(n => n === 4), "occupied gets the box");
  boxes.forEach((b, i) => {
    assert.equal(occ(b.x, b.y, b.w, b.h), false, `spot ${i} clear of the stander`);
    assert.equal(crowded(b, boxes.filter((_, j) => j !== i)), false, `spot ${i} clear of the others`);
  });
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

// [declared] EXT-9 (Joe 2026-10-12): one landing-spot rule for the card's list and api.link().
test("landingCandidate (EXT-9): no behaviors, or only teleportToken ones; anything else is not a landing spot", () => {
  assert.equal(typeof core.landingCandidate, "function");
  assert.equal(core.landingCandidate({ behaviors: [] }), true);
  assert.equal(core.landingCandidate({ behaviors: [{ type: "teleportToken" }, { type: "teleportToken" }] }), true);
  assert.equal(core.landingCandidate({ behaviors: new Map([["a", { type: "teleportToken" }], ["b", { type: "executeScript" }]]) }), false);
  assert.equal(core.landingCandidate({ behaviors: [{ type: "adjustDarknessLevel" }] }), false);
  assert.equal(core.landingCandidate({}), true);
});

// [declared] EXT-2: the Teleport Token behavior type and a new link's defaults live in core, once.
test("EXT-2: TELEPORT_TYPE and a frozen NEW_TELEPORT_BEHAVIOR in core; no 'teleportToken' literal elsewhere", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  assert.equal(core.TELEPORT_TYPE, "teleportToken");
  const nb = core.NEW_TELEPORT_BEHAVIOR;
  assert.ok(nb && Object.isFrozen(nb) && Object.isFrozen(nb.system) && Object.isFrozen(nb.system.dialog) && Object.isFrozen(nb.system.transition));
  assert.deepEqual(nb, { name: "Teleport", type: "teleportToken",
    system: { placement: "center", snap: true, choice: true, revealed: true,
      dialog: { revealed: null, unrevealed: null }, transition: { type: "fade", duration: 1500 } } });
  assert.equal("destinations" in nb.system, false);
  const files = readdirSync(ROOT).filter(f => f.endsWith(".mjs"));
  assert.ok(files.includes("scene-adapter.mjs") && files.includes("card-app.mjs"));
  // 0.6.0: the API row `teleportToken` (a method name, not the RegionBehavior type) is named by its
  // manifest path and its audit event; those two sites are not the type literal this test hunts.
  const apiName = /path: "teleportToken"|log\.info\("teleportToken"/g;
  for (const file of files) {
    const n = (readFileSync(new URL(file, ROOT), "utf8").replace(apiName, "").match(/["']teleportToken["']/g) ?? []).length;
    assert.equal(n, file === "portals-core.mjs" ? 1 : 0, `${file}: ${n} 'teleportToken' literal(s)`);
  }
});

// [declared] EXT-4: every card flag path goes through the kit's flagPath(MODULE, key) — no hand-built
// `flags.${MODULE}.<key>` strings in cards.mjs, card-app.mjs or scene-adapter.mjs (or anywhere else).
test("EXT-4: card flag paths come from flagPath(MODULE, key); no hand-built `flags.${MODULE}.` strings", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const files = readdirSync(ROOT).filter(f => f.endsWith(".mjs"));
  for (const want of ["cards.mjs", "card-app.mjs", "scene-adapter.mjs"]) {
    assert.ok(files.includes(want), want);
    assert.match(readFileSync(new URL(want, ROOT), "utf8"), /import \{[^}]*\bflagPath\b[^}]*\} from "\.\/lib\/flags\.mjs"/, `${want} imports flagPath`);
  }
  for (const file of files) {
    const n = (readFileSync(new URL(file, ROOT), "utf8").match(/flags\.\$\{MODULE\}/g) ?? []).length;
    assert.equal(n, 0, `${file}: ${n} hand-built flags.\${MODULE} path(s)`);
  }
  const { flagPath } = await import("../lib/flags.mjs");
  assert.equal(flagPath(core.MODULE, "img"), "flags.pentaryn-portals.img");
});

// [declared] M8: FLAG_SCOPE has a reader — every flagPath( call passes FLAG_SCOPE (=== MODULE), not MODULE;
// and the dead core export behaviorUuidFromDialogId is gone (dialogIdParts is the one parse; the legacy
// oracle in test/fixtures keeps its own copy).
test("M8: flagPath calls use FLAG_SCOPE; core no longer exports behaviorUuidFromDialogId", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  assert.equal(core.FLAG_SCOPE, core.MODULE);
  let calls = 0;
  for (const file of readdirSync(ROOT).filter(f => f.endsWith(".mjs"))) {
    const src = readFileSync(new URL(file, ROOT), "utf8");
    for (const m of src.matchAll(/\bflagPath\(\s*([A-Za-z_$][\w$.]*)/g)) {
      calls++;
      assert.equal(m[1], "FLAG_SCOPE", `${file}: flagPath(${m[1]}, …)`);
    }
  }
  assert.ok(calls >= 5, `found ${calls} flagPath calls`);
  assert.equal("behaviorUuidFromDialogId" in core, false);
});

// [declared] EXT-7: box- and token-centre arithmetic lives once in portals-core (boxCentre, tokenCentre);
// scene-adapter and party call them instead of each copying `x + width / 2`. Landing goldens unchanged.
test("EXT-7: boxCentre / tokenCentre in core; scene-adapter and party no longer copy the centre arithmetic", async () => {
  const { readFileSync } = await import("node:fs");
  assert.equal(typeof core.boxCentre, "function");
  assert.equal(typeof core.tokenCentre, "function");
  assert.deepEqual(core.boxCentre({ x: 100, y: 200, width: 300, height: 50 }), { x: 250, y: 225 });
  assert.deepEqual(core.tokenCentre({ x: 100, y: 200, width: 2, height: 1 }, 100), { x: 200, y: 250 });
  assert.deepEqual(core.tokenCentre({ x: 0, y: 0, width: 0.5, height: 0.5 }, 140), { x: 35, y: 35 });
  for (const file of ["scene-adapter.mjs", "party.mjs", "portals-core.mjs"]) {
    const src = readFileSync(new URL(file, ROOT), "utf8").replace(/export (const|function) (boxCentre|tokenCentre)[^\n]*\n/g, "");
    assert.doesNotMatch(src, /\.width\s*(\*\s*[\w$.]+\s*)?\/\s*2/, `${file} still computes a centre by hand`);
  }
});
