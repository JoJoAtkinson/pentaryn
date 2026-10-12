/**
 * core/drop.mjs matchesDrop (guide step 8): the pure drop matcher against a pasted copy of the
 * function it came from (prompts.mjs before step 8, `Date.now()` inside) as the oracle.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DROP_WINDOW_MS, matchesDrop } from "../core/drop.mjs";

const NOW = 1760000000000;

/** prompts.mjs:136-144 at the checkpoint, verbatim but for `now` replacing Date.now(). */
function oracle(doc, d, now) {
  if (!d || d.actorId !== doc.actorId || now - d.t > 3000) return false;
  if (d.sceneId && d.sceneId !== doc.parent?.id) return false;
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return true;
  const g = doc.parent?.dimensions?.size ?? 100;
  const cx = doc.x + doc.width * g / 2, cy = doc.y + doc.height * g / 2;
  const tol = g * Math.max(1, doc.width);
  return Math.abs(cx - d.x) <= tol && Math.abs(cy - d.y) <= tol;
}

const scene = { id: "s1", dimensions: { size: 100 } };
const doc = (o = {}) => ({ actorId: "a1", parent: scene, x: 200, y: 200, width: 1, height: 1, ...o });
const drop = (o = {}) => ({ actorId: "a1", sceneId: "s1", x: 250, y: 250, t: NOW, ...o });

const CASES = [
  ["the drop's own token", doc(), drop(), NOW, true],
  ["no drop", doc(), null, NOW, false],
  ["another actor", doc({ actorId: "a2" }), drop(), NOW, false],
  ["3000 ms in", doc(), drop(), NOW + 3000, true],
  ["3001 ms out", doc(), drop(), NOW + 3001, false],
  ["another scene", doc(), drop({ sceneId: "s2" }), NOW, false],
  ["a drop with no scene", doc(), drop({ sceneId: null }), NOW, true],
  ["a non-finite drop point", doc({ x: 5000 }), drop({ x: NaN }), NOW, true],
  ["a missing drop point", doc({ x: 5000 }), drop({ y: undefined }), NOW, true],
  ["tolerance edge in (1 square)", doc({ x: 300 }), drop(), NOW, true],
  ["tolerance edge out", doc({ x: 301 }), drop(), NOW, false],
  ["a 2-wide token's tolerance is 2 squares", doc({ x: 350, width: 2, height: 2 }), drop(), NOW, true],
  ["…and no further", doc({ x: 351, width: 2, height: 2 }), drop(), NOW, false],
  ["no parent: 100 px default", { actorId: "a1", x: 200, y: 200, width: 1, height: 1 }, drop({ sceneId: null }), NOW, true],
];

test("matchesDrop: the table, and the oracle agrees on every row", () => {
  assert.equal(DROP_WINDOW_MS, 3000);
  for (const [label, d, p, now, want] of CASES) {
    assert.equal(matchesDrop(d, p, now), want, label);
    assert.equal(matchesDrop(d, p, now), oracle(d, p, now), `${label} (oracle)`);
  }
});
