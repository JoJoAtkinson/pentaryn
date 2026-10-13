/**
 * EC-2 [declared] (final review ties-core, 2026-10-12; defect wave 2): two `attributes.ensure`
 * calls for the same new title, made together, both succeed — the first creates it and the second
 * answers `existed: true`. Before, each planned from the registry read BEFORE the write queue, both
 * planned "create", and the second's create met the first's entry and answered `collision`.
 * `ensureAttribute` now plans inside `serial()`. Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

await bootWorld({ settings: { "pentaryn-ties.attributes": [] } });
const A = await import("../attributes.mjs");
const ids = () => (game.settings.get("pentaryn-ties", "attributes") ?? []).map(e => e.id);

test("EC-2: two concurrent ensure calls for one new title — one creates, one answers existed:true (before: collision)", async () => {
  const [a, b] = await Promise.all([A.ensureAttribute("Tide Order", { dc: 13 }), A.ensureAttribute("Tide Order", { dc: 18 })]);
  assert.equal(a.ok, true);
  assert.equal(a.existed, false);
  assert.equal(b.ok, true, `second ensure answered ${JSON.stringify(b)}`);
  assert.equal(b.existed, true);
  assert.equal(b.entry.id, a.entry.id);
  assert.equal(b.entry.dc, 13, "the second call's opts are not applied to the existing entry");
  assert.deepEqual(ids(), ["tideorder"]);
});

test("EC-2: an ensure queued behind a create of the same title answers existed:true", async () => {
  const [made, got] = await Promise.all([A.createAttribute("Ash Court"), A.ensureAttribute("Ash Court")]);
  assert.equal(made.ok, true);
  assert.deepEqual({ ok: got.ok, existed: got.existed, id: got.entry?.id }, { ok: true, existed: true, id: made.entry.id });
});

test("EC-2: ensure's answers are unchanged — existing, create, and the refusals", async () => {
  assert.equal((await A.ensureAttribute("tide order")).existed, true);
  assert.equal((await A.ensureAttribute("   ")).reason, "empty");
  const fresh = await A.ensureAttribute("Glass Road", { parent: "Tide Order" });
  assert.deepEqual({ ok: fresh.ok, existed: fresh.existed, parent: fresh.entry.parent }, { ok: true, existed: false, parent: "tideorder" });
  assert.equal((await A.ensureAttribute("Nowhere", { parent: "No Such" })).reason, "notFound");
});
