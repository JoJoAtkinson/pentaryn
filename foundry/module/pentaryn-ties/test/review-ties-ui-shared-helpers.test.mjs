/**
 * Final code review (ties-ui-M14): helpers copied across the UI files — the key-label strip
 * (editor.addTieKey, known-ui.knownKey), bindSummary (editor, known-ui), the "open the tie
 * dialog or say it is unavailable" try/catch (twice in editor), and the mystery-man fallback
 * portrait as a literal in seven files.
 * Ruling: one home each — keyLabel, bindSummary and FALLBACK_ART in core/html.mjs (pure), the
 * dialog opener once in editor.mjs (its only user; a ui → ui edge would be new graph debt).
 * Callers import them. Output unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const src = f => readFileSync(new URL(f, ROOT), "utf8");
const moduleFiles = () => [
  ...readdirSync(ROOT).filter(f => f.endsWith(".mjs")),
  ...readdirSync(new URL("core/", ROOT)).filter(f => f.endsWith(".mjs")).map(f => `core/${f}`),
  ...readdirSync(new URL("study/", ROOT)).filter(f => f.endsWith(".mjs")).map(f => `study/${f}`)
];

test("ties-ui-M14: the mystery-man path is written once, as core/html.mjs's FALLBACK_ART", async () => {
  const hits = moduleFiles().filter(f => src(f).includes("icons/svg/mystery-man.svg"));
  assert.deepEqual(hits, ["core/html.mjs"]);
  const { FALLBACK_ART } = await import("../core/html.mjs");
  assert.equal(FALLBACK_ART, "icons/svg/mystery-man.svg");
  const local = moduleFiles().filter(f => /const FALLBACK_ART\s*=/.test(src(f)) && f !== "core/html.mjs");
  assert.deepEqual(local, []);
});

test("ties-ui-M14: keyLabel strips Digit/Key once, in core/html.mjs", async () => {
  const { keyLabel } = await import("../core/html.mjs");
  assert.equal(keyLabel("Digit6"), "6");
  assert.equal(keyLabel("KeyQ"), "Q");
  assert.equal(keyLabel("F5"), "F5");
  assert.equal(keyLabel(""), "?");
  assert.equal(keyLabel(undefined), "?");
  const copies = moduleFiles().filter(f => f !== "core/html.mjs" && /\^Digit/.test(src(f)));
  assert.deepEqual(copies, []);
});

test("ties-ui-M14: bindSummary lives in core/html.mjs only", async () => {
  const { bindSummary } = await import("../core/html.mjs");
  assert.equal(typeof bindSummary, "function");
  // a repaint that produced nothing must not throw
  assert.doesNotThrow(() => bindSummary(null, { querySelector: () => ({}) }, {}));
  assert.doesNotThrow(() => bindSummary({}, { querySelector: () => null }, {}));
  const copies = moduleFiles().filter(f => f !== "core/html.mjs" && /function bindSummary\b/.test(src(f)));
  assert.deepEqual(copies, []);
});

test("ties-ui-M14: the tie dialog's open-or-warn try/catch is written once", () => {
  const n = moduleFiles().reduce((k, f) => k + (src(f).match(/notify\.dialogUnavailable/g) ?? []).length, 0);
  assert.equal(n, 1);
});
