/**
 * Characterisation (senses checkpoint, wave 3), console text (i) for the entry's ready chain as the
 * active GM: a failing sight reset warns 'pentaryn-senses | sight reset' and the chain goes on; a
 * failing carried-light sync warns 'pentaryn-senses | carried sync' and the Light sweep still runs
 * ([declared] senses-R5: was 'ready sweep', with the sweep skipped). Frozen once committed.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, settle, since, captureConsole, standardWorld, ID, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld({ heroProto: { sight: { enabled: true, visionMode: "darkvision", range: 60 } } });
world.actors[0].items.get(ID.torch).flags[MODULE] = { lit: true };
world.actors[0].items.get(ID.light).flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake } };
world.scenes[0].throwOnUpdate = "scene down";
const F = await boot({ world, ready: false });

test("ready: reset fails → warned, sync still runs; sync fails → warned, sweep still runs (senses-R5)", async t => {
  const out = captureConsole(t);
  let batches = 0;   // [declared W3-SE3] counted: the reset's batch, then the carried sync's
  globalThis.Actor.implementation.updateDocuments = async () => { batches++; throw new Error("actors down"); };
  const mark = F.calls.length;
  F.fire("ready");
  await flush();
  const calls = since(mark);
  // KNOWN (-15): left failing, the debounced re-sync the prototype write scheduled would reject
  // unhandled 250 ms later; the scene recovers first so this file pins only the ready chain.
  world.scenes[0].throwOnUpdate = null;
  await settle(mock);
  assert.deepEqual(out.map(l => l.slice(0, 3)), [
    ["warn", `${MODULE} | sight reset`, "Error: actors down"],
    // [declared W3-SE3] syncAll batches every prototype into one Actor.updateDocuments (was one
    // actor.update each), so the failing batch stub stops the carried sync at its prototypes, before
    // the scene: was "Error: scene down"
    // [declared senses-R5] the carried sync has its own catch: was `${MODULE} | ready sweep`
    ["warn", `${MODULE} | carried sync`, "Error: actors down"],
  ]);
  assert.equal(batches, 2, "the carried sync ran (its prototype batch first, after the reset's)");
  // [declared senses-R5] was: no Token update — the sweep never ran
  assert.equal(calls.some(c => c.op === "update" && c.documentName === "Token"), true, "the Light sweep still ran after the failed carried sync");
  assert.equal(calls.some(c => c.op === "settings.set"), false, "the reset did not mark itself done");
});
