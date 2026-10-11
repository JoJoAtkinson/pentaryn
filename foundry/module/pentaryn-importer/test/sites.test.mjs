// The refusal and readback-failure sites (guide step 3, items-journal-3): every whole-run refusal that
// shouts goes through refuse(PentarynAbort, …) and every readback assertion through failAssertion, so
// the class at each site cannot drift. Effects (class, message, toast) are pinned end to end by
// glue.test (gate, lint, non-GM) and write.test (the seven assertion sites); this file guards the mapping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceScan } from "./kit/harness.mjs";
import { STRIPPED_ACTOR_KEYS, STRIPPED_ITEM_KEYS, STRIPPED_KEYS } from "../importer-core.mjs";

const ROOT = new URL("..", import.meta.url);

test("three refuse(PentarynAbort, …) sites: version gate, @ref lint, non-GM", () => {
  assert.equal(sourceScan(ROOT, /\brefuse\(PentarynAbort,/).length, 3);
});

test("seven failAssertion call sites, and no hand-pasted shout-then-throw left", () => {
  assert.equal(sourceScan(ROOT, /(?<!function )\bfailAssertion\(/).length, 7);
  assert.deepEqual(sourceScan(ROOT, /throw new PentarynAssertionError\(/), []);
});

test("one strip list under three names", () => {
  assert.deepEqual(STRIPPED_KEYS, ["expected", "_id", "img", "folder", "_stats", "ownership"]);
  assert.equal(STRIPPED_ACTOR_KEYS, STRIPPED_KEYS);
  assert.equal(STRIPPED_ITEM_KEYS, STRIPPED_KEYS);
});
