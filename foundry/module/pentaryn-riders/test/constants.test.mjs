// Guide S2 (combat-riders-25 step 2, C12, C41): one module id, defined once in riders-core and
// re-exported by table-core; the blueprint constants; VERSION === module.json version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";

assert.equal(globalThis.game, undefined);
const riders = await import("../riders-core.mjs");
const table = await import("../table-core.mjs");
const manifest = readJSON(new URL("../module.json", import.meta.url));

test("MODULE is the manifest id; MOD stays as its alias; table-core re-exports the same binding", () => {
  assert.equal(riders.MODULE, manifest.id);
  assert.equal(riders.MOD, riders.MODULE);
  assert.equal(table.MODULE, riders.MODULE);
  assert.equal(table.MOD, riders.MODULE);
});

test("VERSION === module.json version", () => {
  assert.equal(riders.VERSION, manifest.version);
});

test("blueprint constants: SHORT, NS, CONTRACT, I18N, CSS, FLAG_SCOPE, an empty frozen HOOKS table", () => {
  assert.equal(riders.SHORT, "riders");
  assert.equal(riders.NS, "riders");
  assert.equal(riders.CONTRACT, "pentaryn-riders/api@1");
  assert.equal(riders.I18N, "PENTARYN_RIDERS");
  assert.equal(riders.CSS, "pr-");
  assert.equal(riders.FLAG_SCOPE, manifest.id);
  assert.deepEqual(riders.HOOKS, {});
  assert.ok(Object.isFrozen(riders.HOOKS));
});
