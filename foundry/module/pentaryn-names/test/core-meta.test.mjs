// Guide step 2 (transform-creatures-32): the pure core's own contract. The core is imported FIRST
// and BARE — no Foundry stub installed — so a Foundry global touched at load fails this file before
// any test runs (the purity proof). The rule tables themselves run in core.test.mjs via impls.mjs.
import * as core from "../names-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as oracle from "./fixtures/legacy-names.mjs";
import { PLAN, RELABEL, SHORT_NAME, canEdit } from "./fixtures/tables.mjs";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry", "_loc"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
});

test("VERSION === module.json version; MODULE === module.json id", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.FLAG_SCOPE, core.MODULE);
  assert.equal(core.CONTRACT, `${core.MODULE}/api@1`);
  assert.deepEqual(core.HOOKS, {}, "names emits no hooks");
  assert.ok(Object.isFrozen(core.HOOKS));
});

test("core deep-equals the oracle on every table row", () => {
  for (const args of SHORT_NAME) assert.deepEqual(core.shortName(...args), oracle.shortName(...args), JSON.stringify(args));
  for (const args of RELABEL) assert.deepEqual(core.relabel(...args), oracle.relabel(...args), JSON.stringify(args));
  for (const p of PLAN) {
    assert.deepEqual(core.planTokenRelabels(p.tokens, { ...p.opts, canEdit }), oracle.legacyPlan(p.tokens, { ...p.opts, canEdit }), p.name);
  }
});
