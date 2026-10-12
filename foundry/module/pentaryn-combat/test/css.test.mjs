// Guide S10 (combat-riders-34, the CSS part): no JS adds .pentaryn-combat-hidden, so its rule is gone;
// one !important is left (combat.css's Argon override; removing it is declared B5, not done).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceScan } from "./kit/harness.mjs";

const css = readFileSync(new URL("../styles/combat.css", import.meta.url), "utf8");

test("the dead .pentaryn-combat-hidden rule is gone and nothing sets the class", () => {
  assert.equal(css.includes("pentaryn-combat-hidden"), false);
  assert.deepEqual(sourceScan(new URL("..", import.meta.url), /pentaryn-combat-hidden/), []);
});

test("one !important left (B5 keeps it)", () => {
  assert.equal((css.match(/!important/g) ?? []).length, 1);
});
