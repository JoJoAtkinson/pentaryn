/**
 * Final code review (ties-ui-perf-4): paintWires looked up each unpinned card's SOURCE token with
 * `canvas.tokens.placeables.find(...)` inside the per-card loop, so key 8 on someone with N ties
 * walked the whole placeables list N times every frame a token moved.
 * Ruling [declared]: the first token per sourceId is memoised in a Map built once per paintWires
 * call; the wires drawn are unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzP4Pc0000000001";
const NPCS = ["zzP4Npc000000001", "zzP4Npc000000002", "zzP4Npc000000003"];

const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ P4 Caven", type: "character", flags: { "pentaryn-ties": { ties: NPCS.map(id => ({ id, word: "", notes: "", stance: 0, strength: 3 })) } } },
    ...NPCS.map((id, i) => ({ id, name: `ZZ P4 Npc ${i + 1}` })),
  ],
  tokens: [
    { id: "zzP4TokPc0000001", actorId: PC, x: 0, y: 0 },
    // all well past the default near distance (4 squares of 100 px), so every card gets a reach wire
    ...NPCS.map((actorId, i) => ({ id: `zzP4TokNpc000000${i + 1}`, actorId, x: 1000 * (i + 1), y: 0 })),
  ],
});

Error.stackTraceLimit = 50;
const frames = () =>
  new Error().stack
    .split("\n")
    .slice(1)
    .map(l => l.trim().match(/^at (?:async )?(?:new )?([\w$.<>]+) \(/)?.[1] ?? "");

test("ties-ui-perf-4: one paint with three cards from one source scans placeables at most once for the source", async () => {
  const placeables = canvas.tokens.placeables;
  canvas.tokens.hover = canvas.tokens.get("zzP4TokPc0000001");
  game.pentaryn.ties.show();
  assert.equal(document.getElementById("pentaryn-ties-cards").children.length, 3, "three cards up");

  const realFind = placeables.find;
  let scans = 0;
  placeables.find = function countedFind(...args) {
    // frames(): [frames, this wrapper, its caller, …] — count only the find made by paintWires itself
    if (frames()[2] === "paintWires") scans++;
    return realFind.apply(this, args);
  };
  const p0 = F.pixi.length;
  try {
    F.flushFrames();
  } finally {
    delete placeables.find;
  }
  canvas.tokens.hover = null;

  assert.ok(scans <= 1, `source-token scans from paintWires in one frame: ${scans} (was one per card)`);
  const lines = F.pixi.slice(p0).filter(c => c.call === "lineTo");
  assert.equal(lines.length, 3, "still one reach wire per card");
  assert.deepEqual(F.hookErrors, []);
});
