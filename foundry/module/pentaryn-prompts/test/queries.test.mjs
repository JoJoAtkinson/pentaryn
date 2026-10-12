/**
 * The queries through the kit (guide step 13, [declared] DP3): registered from the manifest's query
 * rows at init, in the order they were registered by hand; a query before the API is published
 * answers NOT_READY (it used to run); the GM guard is the kit's (message and code unchanged).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");

test("query names from the manifest, in today's order; replace is the replaceMany row", async () => {
  assert.deepEqual(Object.keys(F.CONFIG.queries), ["list", "gather", "crops", "replace", "show"].map(n => `${MODULE}.${n}`));
  const { MANIFEST } = await import("../api-manifest.mjs");
  const rows = MANIFEST.rows.filter(r => r.query);
  assert.deepEqual(rows.map(r => [r.path, r.queryName ?? null]),
    [["list", null], ["gather", null], ["crops", null], ["replaceMany", "replace"], ["show", null]]);
  assert.deepEqual(rows.filter(r => r.wire).map(r => [r.path, r.wire({ cropsAs: "files", x: 1 }), r.wire({})]),
    [["gather", { cropsAs: "files", x: 1 }, { cropsAs: "base64" }], ["crops", { cropsAs: "files", x: 1 }, { cropsAs: "base64" }]]);
});

test("DP3: a query before ready answers NOT_READY; the GM guard still answers NOT_GM first", async () => {
  const q = name => F.CONFIG.queries[`${MODULE}.${name}`];
  await assert.rejects(q("list")({}, { user: F.game.user }), err => err.code === "NOT_READY" && err.message === "NOT_READY: pentaryn-prompts");
  await assert.rejects(q("list")({}, { user: { isGM: false, name: "P" } }), err => err.code === "NOT_GM" && err.message === "NOT_GM: P is not a GM");
});
