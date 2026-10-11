#!/usr/bin/env node
/**
 * Fixtures for portals-core.mjs — `node test/run.mjs`. No dependencies, no Foundry.
 */
const { crowded, assignSpots, leaderOf, partyPreview, summonerActorId, playerOwners, isScenery, isPC, partySelection, followersOf, ringSpots, wallBlocker,
  absoluteDestinations, hasDestination, withoutDestination } = await import("../portals-core.mjs");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
const rec = (id, o = {}) => ({ id, actorId: o.actorId ?? `A-${id}`, type: o.type ?? "npc", linked: !!o.linked,
  pile: !!o.pile, excluded: !!o.excluded, handle: !!o.handle, owners: o.owners ?? [], summoner: o.summoner ?? null,
  name: o.name ?? id });
const ids = rs => rs.map(r => r.id);

/* summonerActorId */
check("item uuid", summonerActorId("Actor.abc123.Item.xyz"), "abc123");
check("compendium-free only", summonerActorId("Scene.s.Token.t.Actor.zz.Item.q"), "zz");
check("null", summonerActorId(null), null);
check("garbage", summonerActorId("Item.xyz"), null);

/* playerOwners */
check("owners skip GM, default, observers",
  playerOwners({ default: 3, gm: 3, p1: 3, p2: 2, p3: 3 }, ["gm"]), ["p1", "p3"]);
check("no ownership", playerOwners(undefined), []);

/* isScenery */
check("crowd name", isScenery({ name: "Drow Commoner (crowd) 3" }), true);
check("marker name", isScenery({ name: "Marker · 4" }), true);
check("crowd folder", isScenery({ name: "Villager (smith)", folders: ["Crowd — Surface Folk (grey)"] }), true);
check("temp markers folder", isScenery({ name: "Red", folders: ["Temp Markers"] }), true);
check("skeleton", isScenery({ name: "Skeleton", folders: ["Summons"] }), false);

/* party selection */
const caven = rec("caven", { type: "character", linked: true, owners: ["p1"], actorId: "CAV" });
const marrith = rec("marrith", { type: "character", linked: true, owners: ["p2"], actorId: "MAR" });
const skel1 = rec("skel1", { owners: ["p1"], summoner: "CAV" });
const skel2 = rec("skel2", { owners: ["p1"] });
const eye = rec("eye", { summoner: "MAR" });                 // summoned but not (yet) owned
const steed = rec("steed", { owners: ["p1", "p2"] });         // shared
const pile = rec("pile", { owners: ["p1"], pile: true });
const crowd = rec("crowd", { excluded: true, owners: ["p1"] });
const guard = rec("guard");                                   // GM NPC
const otherSummon = rec("os", { summoner: "NOTPC" });          // an NPC's summon, GM-owned
const all = [caven, marrith, skel1, skel2, eye, steed, pile, crowd, guard, otherSummon];
check("isPC", [caven, skel1, pile].map(isPC), [true, false, false]);
check("party = PCs then owned/summoned", ids(partySelection(all)), ["caven", "marrith", "skel1", "skel2", "eye", "steed"]);
check("pile PC character is not a PC", ids(partySelection([rec("x", { type: "character", linked: true, pile: true })])), []);

/* followersOf (native teleport) */
check("Caven alone: his skeletons, not the shared steed or Marrith's eye",
  ids(followersOf([caven], all)), ["skel1", "skel2"]);
check("Marrith alone: her eye", ids(followersOf([marrith], all)), ["eye"]);
check("both: skeletons, eye, steed", ids(followersOf([caven, marrith], all)), ["skel1", "skel2", "eye", "steed"]);
check("summon of another PC never follows by ownership",
  ids(followersOf([caven], [rec("fam", { owners: ["p1"], summoner: "MAR" })])), []);
check("other PCs never follow", ids(followersOf([caven], [rec("pc2", { type: "character", linked: true, owners: ["p1"] })])), []);

/* area handles never travel (usability Area 8, L11: "Circle of Death (Caven)", owned by every player) */
const handleTok = rec("cod", { owners: ["p1", "p2"], handle: true });
check("an area handle is not party", ids(partySelection([...all, handleTok])), ["caven", "marrith", "skel1", "skel2", "eye", "steed"]);
check("an area handle never follows", ids(followersOf([caven, marrith], [handleTok])), []);

/* leaderOf / assignSpots: followers land beside their PC (usability Area 8, L11) */
const party = partySelection(all);
check("leader: summoner wins", leaderOf(eye, [caven, marrith]), "marrith");
check("leader: by owner", leaderOf(skel2, [caven, marrith]), "caven");
check("leader: shared steed → first owner's PC", leaderOf(steed, [caven, marrith]), "caven");
check("leader: nobody", leaderOf(rec("x", { owners: ["p9"] }), [caven, marrith]), null);
{
  // 3x3 ring around (0,0), grid 1, centre-first like ringSpots
  const spots = ringSpots(0, 0, 1, 9);
  const placed = assignSpots(spots, [caven, marrith, eye]);
  const d = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  check("assign: first PC on the centre", placed[0], { x: 0, y: 0 });
  check("assign: the eye lands touching Marrith", d(placed[2], placed[1]), 1);
  const big = ringSpots(0, 0, 1, 25);
  const many = [caven, marrith, rec("e1", { summoner: "MAR" }), rec("e2", { summoner: "MAR" }), rec("e3", { summoner: "MAR" }), skel1];
  const pl = assignSpots(big.slice(0, many.length), many);
  check("assign: every spot used once", new Set(pl.map(p => `${p.x},${p.y}`)).size, many.length);
  const pl2 = assignSpots(big, many);
  check("assign: Marrith's three all within 2 of her", [2, 3, 4].map(i => d(pl2[i], pl2[1]) <= 2), [true, true, true]);
  check("assign: Caven's skeleton touches Caven", d(pl2[5], pl2[0]), 1);
  check("assign: followers only (native carry) keeps ring order", assignSpots(spots.slice(0, 2), [skel1, skel2]), spots.slice(0, 2));
}
check("assign: a centre copy is used last", assignSpots([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], [caven, skel1, skel2]),
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }]);
check("preview names the PC each follower lands by", partyPreview(party).map(r => r.leaderName ?? "-"),
  ["-", "-", "caven", "caven", "marrith", "caven"]);

/* ringSpots */
check("centre first", ringSpots(0, 0, 100, 1), [{ x: 0, y: 0 }]);
check("ring of 3", ringSpots(0, 0, 100, 3), [{ x: 0, y: 0 }, { x: -100, y: -100 }, { x: 0, y: -100 }]);
check("occupied centre skipped", ringSpots(0, 0, 100, 1, { occupied: (x, y) => x === 0 && y === 0 }), [{ x: -100, y: -100 }]);
const wall = wallBlocker([[50, -500, 50, 500]]);             // vertical wall right of centre
const right = ringSpots(0, 0, 100, 8, { blocked: wall }).filter(s => s.x > 0);
check("wall blocks the right side", right, []);
check("boxed in stacks on centre", ringSpots(0, 0, 100, 2, { blocked: () => true, occupied: () => false, maxRing: 3 }),
  [{ x: 0, y: 0 }, { x: 0, y: 0 }]);

/* destinations: core 14.368+ stores same-scene links relative to the behavior */
// Mimics parseUuid(u, {relative: Scene.S.Region.R.RegionBehavior.B}): "..X" is a sibling region.
const toAbs = u => u.startsWith("..") && !u.startsWith("...") ? `Scene.S.Region.${u.slice(2)}`
  : u.startsWith(".") ? null : u;
const stored = new Set(["..R2", "Scene.T.Region.R9"]);
check("relative same-scene entry resolves", absoluteDestinations(stored, toAbs), ["Scene.S.Region.R2", "Scene.T.Region.R9"]);
check("has: same-scene link found by absolute uuid", hasDestination(stored, "Scene.S.Region.R2", toAbs), true);
check("has: cross-scene link", hasDestination(stored, "Scene.T.Region.R9", toAbs), true);
check("has: absent", hasDestination(stored, "Scene.S.Region.R3", toAbs), false);
check("has: legacy absolute same-scene entry", hasDestination(["Scene.S.Region.R2"], "Scene.S.Region.R2", toAbs), true);
check("without: drops the relative entry", withoutDestination(stored, "Scene.S.Region.R2", toAbs), ["Scene.T.Region.R9"]);
check("without: drops the absolute entry", withoutDestination(stored, "Scene.T.Region.R9", toAbs), ["..R2"]);
check("without: unknown target keeps all", withoutDestination(stored, "Scene.X.Region.Q", toAbs), ["..R2", "Scene.T.Region.R9"]);
check("unresolvable kept as written", absoluteDestinations([".bad"], toAbs), [".bad"]);
check("empty / undefined", absoluteDestinations(undefined, toAbs), []);

check("crowded: same square", crowded({ x: 100, y: 100, w: 100, h: 100 }, [{ x: 100, y: 100, w: 100, h: 100 }]), true);
check("crowded: a Large token covering it", crowded({ x: 200, y: 200, w: 100, h: 100 }, [{ x: 100, y: 100, w: 200, h: 200 }]), true);
check("crowded: the next square (edges touch) is free", crowded({ x: 200, y: 100, w: 100, h: 100 }, [{ x: 100, y: 100, w: 100, h: 100 }]), false);
check("crowded: nobody there", crowded({ x: 0, y: 0, w: 100, h: 100 }, []), false);

if (failures.length) { console.error(`${failures.length} failed, ${pass} passed\n${failures.join("\n")}`); process.exit(1); }
console.log(`portals-core: ${pass} passed`);
