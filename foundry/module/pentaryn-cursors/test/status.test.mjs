// The two pure helpers behind findings -30 and -32 (guide step 2): probeInternals names the core
// internals that are missing, statusOf is the shape api.status() returns. New functions, pinned
// when they are added; core is imported bare (no Foundry stub), as in core.test.mjs.
import { probeInternals, statusOf } from "../cursors-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("probeInternals: full stubs → [], {} → both names, null context still counts as present", () => {
  const events = { currentCursor: null, setCursor() {} };
  const regions = { preview: { children: [] }, _placementContext: null };
  const table = [
    [{ events, regions }, []],
    [{}, ["setCursor", "_placementContext"]],
    [undefined, ["setCursor", "_placementContext"]],
    [{ events: null, regions: null }, ["setCursor", "_placementContext"]],
    [{ events: {}, regions }, ["setCursor"]],
    [{ events, regions: { preview: {} } }, ["_placementContext"]],
    [{ events: { setCursor: undefined }, regions: { _placementContext: undefined } }, []],
    [{ events: "x", regions: 1 }, ["setCursor", "_placementContext"]],
  ];
  for (const [input, want] of table) assert.deepEqual(probeInternals(input), want, JSON.stringify(input));
});

test("statusOf: expected follows keyFor; key is null while disabled", () => {
  const base = { control: "drawings", tool: "rect", placementActive: false, boardCursor: "var(--cursor-default)", dataset: "draw", imageSet: true };
  assert.deepEqual(statusOf({ enabled: true, ...base }), {
    enabled: true, key: "draw", control: "drawings", tool: "rect", placementActive: false,
    boardCursor: "var(--cursor-default)", dataset: "draw", imageSet: true, expected: "draw",
  });
  assert.deepEqual(statusOf({ enabled: false, ...base }), {
    enabled: false, key: null, control: "drawings", tool: "rect", placementActive: false,
    boardCursor: "var(--cursor-default)", dataset: "draw", imageSet: true, expected: "draw",
  });
  const rows = [
    [{ enabled: true, control: "tokens", tool: "select" }, null, null],
    [{ enabled: true, control: "tokens", tool: "target" }, "target", "target"],
    [{ enabled: true, control: "tokens", tool: "select", placementActive: true }, "aoe", "aoe"],
    [{ enabled: false, control: "notes", tool: "journal" }, null, "note"],
    [{ enabled: true }, null, null],
  ];
  for (const [input, key, expected] of rows) {
    const s = statusOf(input);
    assert.deepEqual([s.key, s.expected], [key, expected], JSON.stringify(input));
  }
  assert.deepEqual(Object.keys(statusOf()), ["enabled", "key", "control", "tool", "placementActive", "boardCursor", "dataset", "imageSet", "expected"]);
  assert.deepEqual(statusOf(), {
    enabled: false, key: null, control: null, tool: null, placementActive: false,
    boardCursor: null, dataset: null, imageSet: false, expected: null,
  });
});

test("manifest status row returns lists exactly statusOf()'s keys, in order", () => {
  // describe() reports this hand-written string; tie it to the shape statusOf really returns.
  const row = MANIFEST.rows.find((r) => r.path === "status");
  assert.deepEqual(row.returns.replace(/[{}\s]/g, "").split(","), Object.keys(statusOf()));
});
