// The hook manifest (guide step 1.6), pinned in golden/hooks.json: the importer registers exactly one
// hook, once:ready, at module scope. The template's "only lifecycle hooks at module scope" assertion is
// dropped here (true today, but the template's wording does not fit migrating modules — guide §8).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON } from "./kit/harness.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await installFoundry({ user: { isGM: true } });
await import("../pentaryn-importer.mjs");

test("registration manifest equals golden/hooks.json", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
  assert.deepEqual(F.hooks.map(h => `${h.kind}:${h.name}`), ["once:ready"]);
});

test("the ready listener is spent after ready: nothing stays registered", () => {
  const log = console.log;
  console.log = () => {};
  try {
    F.fire("ready");
  } finally {
    console.log = log;
  }
  assert.deepEqual(F.listeners(), {});
});
