/**
 * senses-R6 [declared] (final review 2026-10-12): chain, light, migrate, light-ui and argon log
 * through the kit log (lib/log.mjs: ctx.log in a feature, makeLog(MODULE) in a UI or adapter file),
 * never a hand-prefixed console.* call. The console text stays byte-identical
 * ('pentaryn-senses | light <label>', '… | chain <label>', '… | sight reset …'): the goldens and
 * the console-text tests in light, chain, glue and adapters pin it unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = ["chain.mjs", "light.mjs", "migrate.mjs", "light-ui.mjs", "argon.mjs"];
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
/** The source without block and line comments (a header may mention console.warn). */
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("senses-R6: no hand-prefixed console.* call in chain, light, migrate, light-ui or argon", () => {
  for (const path of FILES) {
    assert.doesNotMatch(code(read(path)), /\bconsole\.(warn|info|error|log|debug)\s*\(/, `${path} logs through console.*`);
  }
});

test("senses-R6: each of them takes its logger from the kit (makeLog or ctx.log)", () => {
  for (const path of FILES) {
    const src = code(read(path));
    assert.ok(/from "\.\/lib\/log\.mjs";/.test(src) || /\bctx\.log\b/.test(src), `${path} has no kit logger`);
  }
});
