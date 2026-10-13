/**
 * M12 (final review 2026-10-12, ties-study): `shareFact` and `runCascade` were each about 140 lines
 * doing several jobs. Ruling: `runCascade` splits into plan / roll / record steps and returns
 * `{ held }`; `shareFact` splits into resolve, select recipients, and one writer per namespace.
 *
 * Behaviour-preserving: the cascade and share goldens (golden/cascade-*.json) pin what they write.
 * This file pins the shape — the named steps exist, and neither orchestrator carries their bodies.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = f => readFileSync(new URL(`../study/${f}`, import.meta.url), "utf8");

/** A top-level function's code lines — comments and blank lines are not counted. */
function codeLines(text, name) {
  const lines = text.split("\n");
  const start = lines.findIndex(l => new RegExp(`^(export )?(async )?function ${name}\\(`).test(l));
  assert.ok(start >= 0, `function ${name} not found`);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  const body = lines
    .slice(start, end + 1)
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("//"));
  return body.length;
}

const hasFn = (text, name) => new RegExp(`^(export )?(async )?function ${name}\\(`, "m").test(text);

test("M12: runCascade is split into plan, roll and record steps", () => {
  const c = src("cascade.mjs");
  for (const step of ["cascadePlanner", "rollRung", "recordRung"]) assert.ok(hasFn(c, step), `cascade.mjs has no ${step}`);
  const n = codeLines(c, "runCascade");
  assert.ok(n <= 35, `runCascade still carries ${n} code lines`);
  assert.match(c, /return \{ held \};/, "runCascade reports { held } for the guard to prompt after release");
});

test("M12: shareFact is split into resolve, select recipients, and one writer per namespace", () => {
  const s = src("share.mjs");
  for (const step of ["resolveShared", "shareRecipients", "shareIdent", "shareLore", "shareKind"])
    assert.ok(hasFn(s, step), `share.mjs has no ${step}`);
  const n = codeLines(s, "shareFact");
  assert.ok(n <= 25, `shareFact still carries ${n} code lines`);
});
