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
