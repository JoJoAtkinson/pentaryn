// [declared] names-maint-4 (final review 2026-10-12): the CHANGELOG's Unreleased header names the
// kit actually vendored in lib/, and the W2-B4 change (commit 5835ac59) has its line. Before, the
// header still said kit 1.0.2 after the 1.1.0 re-vendor and W2-B4 had no entry. After a kit
// re-vendor, set the header's "(kit X.Y.Z)" to lib/errors.mjs KIT_VERSION.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KIT_VERSION } from "../lib/errors.mjs";

const CHANGELOG = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const unreleased = () => {
  const start = CHANGELOG.search(/^## Unreleased\b/m);
  assert.ok(start >= 0, "CHANGELOG has an Unreleased section");
  const rest = CHANGELOG.slice(start);
  const end = rest.slice(1).search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end + 1);
};

test("names-maint-4: the Unreleased header names the vendored kit (lib/errors.mjs KIT_VERSION)", () => {
  const header = unreleased().split("\n")[0];
  const kit = header.match(/\(kit (\d+\.\d+\.\d+)\)/)?.[1];
  assert.equal(kit, KIT_VERSION, `"${header}" must say (kit ${KIT_VERSION}); update it after a kit re-vendor`);
});

test("names-maint-4: the Unreleased section has the W2-B4 line (describe() marks sync's ref resolve:\"self\")", () => {
  assert.match(unreleased(), /^- \[declared\] [^\n]*W2-B4(?:(?!\n- )[\s\S])*?resolve: ?"self"/m);
});
