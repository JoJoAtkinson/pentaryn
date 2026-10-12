// i18n before the Wave 7 restart batch (guide S5, W7): portals ships no lang file yet, so every
// label is plain English and NO source may reference a PENTARYN_PORTALS key — a `_loc` call without
// module.json `languages` would put raw keys on players' screens. W7 adds lang/en.json and the
// `languages` entry in one sync; this file then pins the literal keys instead (C51, C34, C35).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { manifestOf, sourceScan } from "./kit/harness.mjs";
import { SETTINGS } from "../settings.mjs";

const ROOT = new URL("..", import.meta.url);

test("no languages in module.json and no lang/ folder (until W7)", () => {
  assert.equal(manifestOf(ROOT).languages, undefined);
  assert.equal(existsSync(new URL("lang/en.json", ROOT)), false);
});

test("no PENTARYN_PORTALS key, _loc or game.i18n call in any source while there is no lang file", () => {
  assert.deepEqual(sourceScan(ROOT, /PENTARYN_PORTALS\.|_loc\(|game\.i18n\./).map(h => `${h.file}:${h.line}`), []);
});

test("no prefix wrapper (const t = … i18n …) anywhere (C35)", () => {
  assert.deepEqual(sourceScan(ROOT, /\bconst\s+[tfTL]\s*=.*i18n/).map(h => `${h.file}:${h.line}`), []);
});

test("setting labels: literal plain English on every row, in live order", () => {
  assert.deepEqual(SETTINGS.map(r => r.key), ["teleportDefault", "spreadArrivals", "confirmPartyTeleport"]);
  for (const r of SETTINGS) {
    assert.equal(typeof r.name, "string", r.key);
    assert.equal(typeof r.hint, "string", r.key);
    assert.doesNotMatch(r.name, /^PENTARYN_/, r.key);
    assert.ok(r.doc, `${r.key} has a doc line`);
  }
});
