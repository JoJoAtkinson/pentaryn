// module.json's flags.pentaryn agree with core's constants (guide step 10). The block lands in the
// Wave 7 restart batch (wave7-restart-batch.md, creatures row); until then this test skips itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { CSS, FLAG_SCOPE, MODULE, NS } from "../creatures-core.mjs";

const manifest = manifestOf(new URL("..", import.meta.url));
const p = manifest.flags?.pentaryn ?? {};
const pending = p.namespace === undefined && "Wave 7: module.json gains flags.pentaryn {tier, namespace, flagScope, cssPrefix}";

test("module.json flags.pentaryn: tier full, namespace = NS, flagScope = FLAG_SCOPE (the id), cssPrefix = CSS", { skip: pending }, () => {
  assert.equal(manifest.id, MODULE);
  assert.deepEqual(
    { tier: p.tier, namespace: p.namespace, flagScope: p.flagScope, cssPrefix: p.cssPrefix, generation: p.generation },
    { tier: "full", namespace: NS, flagScope: FLAG_SCOPE, cssPrefix: CSS, generation: 14 },
  );
  assert.ok(Array.isArray(p.afterSync) && p.afterSync.length > 0, "afterSync moved from the ModuleSpec");
});

test("module.json recommends item-piles and enhancedcombathud with reasons", { skip: pending }, () => {
  const rec = Object.fromEntries((manifest.relationships?.recommends ?? []).map(r => [r.id, r.reason]));
  for (const id of ["lib-wrapper", "item-piles", "enhancedcombathud"]) assert.ok(rec[id], id);
});
