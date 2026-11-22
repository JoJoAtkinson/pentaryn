// Doc guard (aoe-movement-portals-37): the README names core methods and a "verified on" stamp, never
// Foundry source line numbers, which drift every release.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MANIFEST } from "../api-manifest.mjs";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("README cites no Foundry source line numbers", () => {
  assert.deepEqual(README.match(/\.mjs:\d{3,}/g) ?? [], []);
});

test("README names the four non-legacy rows", () => {
  assert.deepEqual(MANIFEST.rows.filter((r) => !r.legacy).map((r) => r.path), ["inspect", "pathfind.status", "pathfind.route", "selftest"]);
  assert.ok(README.includes("Every row except `inspect`, `pathfind.status`, `pathfind.route` and `selftest` is `legacy`"));
});
