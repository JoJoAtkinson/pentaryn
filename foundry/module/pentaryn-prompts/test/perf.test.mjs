/**
 * Performance findings (guide step 17), pinned against the code they replace:
 *  - prompts-lookup-7: panelRels is panelFor's old loop (pasted below as the oracle) and seenCount
 *    equals panelSplit(panelRels(…)).total on the scenario boards, without the door/wall pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { G, warrenScene, commonScene, warrenItems, WARREN_WALLS } from "./fixtures.mjs";
import { panelRels, seenCount } from "../core/placement.mjs";
import { panelSplit, isSeen, makeRel, rayPasses, classifyBlocked, wallSegment } from "../geometry-core.mjs";

/** scene-adapter panelFor's loop before step 17, verbatim. */
function oracleRels(items, rel, key, unseenWithinFt) {
  const rels = [];
  for (const it of items) {
    if (it.key === key) continue;
    const r = rel(key, it.key);
    if (!r) continue;
    const los = isSeen(r) ? "LOS" : r.ft <= unseenWithinFt ? r.los : "blocked";
    rels.push({ ft: r.ft, bearing: r.bearing, los, key: it.key, item: it });
  }
  return rels;
}

test("prompts-lookup-7: panelRels = the old loop; seenCount = panelSplit(panelRels).total on three boards", () => {
  for (const sc of [warrenScene(), commonScene(true), commonScene(false)]) {
    for (const it of sc.items.filter(i => i.isPrompt)) {
      const rels = panelRels(sc.items, sc.rel, it.key, 60);
      assert.deepEqual(rels, oracleRels(sc.items, sc.rel, it.key, 60), `${sc.key} ${it.key}`);
      assert.equal(seenCount(sc.items, sc.rel, it.key), panelSplit(rels, { rows: 0, unseenWithinFt: 60 }).total, `${sc.key} ${it.key}`);
    }
  }
});

test("prompts-lookup-7: seenCount never runs the door/wall classification; panelRels does on a closed-door board", () => {
  const items = warrenItems();
  const segs = WARREN_WALLS.map((w, i) => wallSegment({ id: `w${i}`, ...w }));
  let classified = 0;
  const sight = {
    visible: (A, B) => (B.points?.length ? B.points : [B.centre]).some(t => rayPasses(A.origin ?? A.centre, t, segs).clear),
    classify: (A, B) => (classified++, classifyBlocked([A.origin ?? A.centre], B.points?.length ? B.points : [B.centre], segs)),
  };
  const rel = makeRel(items, { gridSize: G, gridFt: 5, sight });
  for (const it of items) seenCount(items, rel, it.key);
  assert.equal(classified, 0);
  for (const it of items) panelRels(items, rel, it.key, 60);
  assert.ok(classified > 0);
});

/* ── prompts-lookup-23 ──────────────────────────────────────────────────── */

test("prompts-lookup-23: pageScenes — at least one scene, never past maxPrompts after the first", async () => {
  const { pageScenes } = await import("../core/paging.mjs");
  assert.deepEqual(pageScenes([40, 30, 5], 60), { take: 1, next: 1 });
  assert.deepEqual(pageScenes([70], 60), { take: 1, next: null });
  assert.deepEqual(pageScenes([20, 30, 10, 1], 60), { take: 3, next: 3 });
  assert.deepEqual(pageScenes([], 60), { take: 0, next: null });
  assert.deepEqual(pageScenes([1, 1], 1), { take: 1, next: 1 });
});

test("prompts-lookup-23: a light's host by marker and call (first wins, null and \"\" differ); scaffold per actor", async () => {
  const { installWorld, addScene, MODULE } = await import("./fixtures/world.mjs");
  const F = await installWorld();
  const M = await import("../scene-adapter.mjs");
  const prov = (markerId, call) => ({ markerId, call, kind: "hotspot", prompt: "x", sceneId: "sH" });
  const pile = { "item-piles": { data: { enabled: true } } };
  F.addActor({ id: "actorTempPin0001", name: "Pin", type: "npc", folder: { name: "Temp Markers", folder: null } });
  const s = addScene(F, {
    id: "sH", name: "Hosts", tokens: [
      { id: "h1", name: "Chest A", x: 0, y: 0, flags: { [MODULE]: { provenance: prov("m1", "pm-a") }, ...pile } },
      { id: "h2", name: "Chest B", x: 200, y: 0, flags: { [MODULE]: { provenance: prov("m2", null) }, ...pile } },
      { id: "h3", name: "Chest C", x: 400, y: 0, flags: { [MODULE]: { provenance: prov("m1", "pm-a") }, ...pile } },
      { id: "h4", name: "Chest D", x: 600, y: 0, flags: { [MODULE]: { provenance: prov("m3", "") }, ...pile } },
      ...["pin1", "pin2", "pin3"].map((id, i) => ({ id, name: "Pin", actorId: "actorTempPin0001", x: 800 + i * 100, y: 0 })),
    ],
    lights: [
      { id: "l1", x: 50, y: 50, config: { dim: 10 }, flags: { [MODULE]: { provenance: prov("m1", "pm-a") } } },
      { id: "l2", x: 250, y: 50, config: { dim: 5 }, flags: { [MODULE]: { provenance: prov("m2", "pm-b") } } },
      { id: "l3", x: 450, y: 50, config: { bright: 5 }, flags: { [MODULE]: { provenance: prov(null, null) } } },
      { id: "l4", x: 650, y: 50, config: { dim: 20 }, flags: { [MODULE]: { provenance: prov("m3", null) } } },
    ],
  });
  const rows = M.sceneItems(s).map(i => [i.key, i.kind, i.light ?? null]);
  assert.deepEqual(rows, [
    ["Token.h1", "hotspot", "dim 10 ft"], ["Token.h2", "hotspot", null], ["Token.h3", "hotspot", null], ["Token.h4", "hotspot", null],
    ["AmbientLight.l2", "light", "dim 5 ft"], ["AmbientLight.l3", "light", "bright 5 ft"], ["AmbientLight.l4", "light", "dim 20 ft"],
  ]);
});
