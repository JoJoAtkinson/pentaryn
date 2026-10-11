// The core's identity constants (guide step 2, C41): VERSION is module.json's, MODULE is the id, and the
// legacy MOD alias still reaches the legacy suite and the published core.MOD.
import * as core from "../journal-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const manifest = manifestOf(new URL("..", import.meta.url));

test("VERSION === module.json version; MODULE === module.json id", () => {
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
});

test("MOD is an alias of MODULE, not a second value", () => {
  assert.equal(core.MOD, core.MODULE);
});

test("names the blueprint derives from the id", () => {
  assert.deepEqual(
    [core.SHORT, core.NS, core.CONTRACT, core.I18N, core.CSS, core.QUERY],
    ["journal", "journal", "pentaryn-journal/api@1", "PENTARYN_JOURNAL", "pj-", "pentaryn-journal.ensure"],
  );
  assert.deepEqual(core.HOOKS, {});
  assert.equal(Object.isFrozen(core.HOOKS), true);
});
