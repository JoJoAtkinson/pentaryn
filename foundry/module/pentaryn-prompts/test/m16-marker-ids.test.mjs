/**
 * M16 (final review 2026-10-12, prompts-adapters): `markerActorIds` was exported from
 * markers-adapter.mjs but nothing in the module called it. It is retired; `markerActor(size)`
 * still finds each of the six, and api.status() lists them through it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld } from "./fixtures/world.mjs";

await installWorld();
const M = await import("../markers-adapter.mjs");

test("M16: markerActorIds is no longer exported; markerActor still finds a marker", () => {
  assert.equal("markerActorIds" in M, false, "M16: markerActorIds is retired");
  assert.equal(M.markerActor("large").id, "markerActorlarge");
});
