/**
 * ES-6 (final review 2026-10-12, ties-study): every flag deletion ties writes uses core's `_del`
 * value (`{ [path]: _del }`), never the `-=key` prefix, which is deprecated in v14. dropRow builds
 * the ledger deletions; reset, forget and the identification do-over drop single keys; the
 * preview's ledger-only classifier reads a `_del` on a beliefs path as a ledger change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const F = await bootWorld({ importEntry: false });
const { dropRow } = await import("../study/claim.mjs");
const { LEDGER_ONLY } = await import("../preview-app.mjs");

const BASE = "flags.pentaryn-ties.beliefs";

test("ES-6: dropRow deletes one row with a _del value, not a -= key", () => {
  const out = dropRow(BASE, "zzPc000000000001", "#inspect", { "#inspect": {}, "lore:x:l1": {} });
  assert.deepEqual(Object.keys(out), [`${BASE}.zzPc000000000001.#inspect`]);
  assert.equal(F.isDeletion(out[`${BASE}.zzPc000000000001.#inspect`]), true);
});

test("ES-6: dropRow deletes the owner's whole entry with a _del value when it was the last row", () => {
  const out = dropRow(BASE, "zzPc000000000001", "#inspect", { "#inspect": {} });
  assert.deepEqual(Object.keys(out), [`${BASE}.zzPc000000000001`]);
  assert.equal(F.isDeletion(out[`${BASE}.zzPc000000000001`]), true);
});

test("ES-6: no ties source writes a -= deletion key", async () => {
  const { sourceScan } = await import("./kit/harness.mjs");
  const hits = sourceScan(new URL("..", import.meta.url), /-=\$\{[^}]*\}`\]\s*:\s*null/);
  assert.deepEqual(hits, []);
});

test("ES-6: the preview reads a _del on a beliefs path as a ledger-only change", () => {
  for (const path of [`${BASE}.zzPc000000000001.#inspect`, `${BASE}.zzPc000000000001`, BASE]) {
    const changes = foundry.utils.expandObject({ [path]: _del });
    const keys = Object.keys(foundry.utils.flattenObject(changes));
    assert.ok(keys.length && keys.every(k => LEDGER_ONLY.test(k)), `${path} → ${keys}`);
  }
  assert.equal(LEDGER_ONLY.test("flags.pentaryn-ties.beliefsX"), false);
  assert.equal(LEDGER_ONLY.test("flags.pentaryn-ties.attributes"), false);
  assert.doesNotMatch(LEDGER_ONLY.source, /-=/, "the classifier no longer looks for the -= key prefix");
});
