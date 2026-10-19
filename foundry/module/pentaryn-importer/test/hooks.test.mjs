// The hook manifest (guide step 1.6), pinned in golden/hooks.json: at module scope the importer
// registers once:init (the setting, the relay query) and once:ready; at ready the DDB-corrections
// feature registers its ddb-importer listener on the module's registry. The create watch registers
// nothing until an import creates an actor. The template's "only lifecycle hooks at module scope"
// assertion is dropped here (true today, but the template's wording does not fit migrating modules — guide §8).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON } from "./kit/harness.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await installFoundry({ user: { isGM: true } });
await import("../pentaryn-importer.mjs");

test("registration manifest at load: once:init, once:ready", () => {
  assert.deepEqual(F.hooks.map(h => `${h.kind}:${h.name}`), ["once:init", "once:ready"]);
});

test("after init and ready: the lifecycle listeners are spent; the ddb-importer listener stays (golden/hooks.json)", () => {
  const log = console.log;
  console.log = () => {};
  try {
    F.fire("init");
    F.fire("ready");
  } finally {
    console.log = log;
  }
  pinJSON("hooks", F.hooks, import.meta.url);
  assert.deepEqual(F.listeners(), { "ddb-importer.characterProcessDataComplete": 1 });
});

test("uninstall() leaves no hook", () => {
  game.pentaryn.importer.uninstall();
  assert.deepEqual(F.listeners(), {});
});
