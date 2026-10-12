// [declared] EXT-6: describe().flags.writes (and the README Data written table) list every
// flags.pentaryn-attunement.* path the module's own sources write — including the claim flags the
// kit's claimDocument stamps (claims.coinBack, claims.home), which used to be missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as core from "../attunement-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";

const DIR = new URL("../", import.meta.url);
const README = readFileSync(new URL("README.md", DIR), "utf8");
const MOD = core.MODULE;
const SOURCES = readdirSync(DIR).filter(f => f.endsWith(".mjs") && f !== "api-manifest.mjs");

/** `${MODULE}` / `${SLOTS}` / "bond" → the literal key, from attunement-core's exports. */
function resolve(expr) {
  const s = expr.trim();
  const lit = s.match(/^["'`]([^"'`]+)["'`]$/);
  if (lit) return lit[1];
  assert.ok(typeof core[s] === "string", `unresolvable flag key expression: ${s}`);
  return core[s];
}
const interpolate = t => t.replace(/\$\{([^}]+)\}/g, (_, e) => resolve(e));

/** Every flag path a source file writes: template keys, setFlag/unsetFlag, flagPath, claimDocument. */
function writtenPaths(src) {
  const out = new Set();
  for (const [, t] of src.matchAll(/`(flags\.[^`]+)`/g)) out.add(interpolate(t));
  for (const [, scope, key] of src.matchAll(/(?:setFlag|unsetFlag)\(\s*([\w"'`.-]+)\s*,\s*([\w"'`.-]+)/g))
    out.add(`flags.${resolve(scope)}.${resolve(key)}`);
  for (const [, scope, key] of src.matchAll(/flagPath\(\s*([\w"'`.-]+)\s*,\s*([\w"'`.-]+)\s*\)/g))
    out.add(`flags.${resolve(scope)}.${resolve(key)}`);
  for (const [, key, scope] of src.matchAll(/claimDocument\(\s*\w+\s*,\s*([\w"'`.-]+)\s*,\s*\{\s*scope:\s*([\w"'`.-]+)/g))
    out.add(`flags.${resolve(scope)}.claims.${resolve(key)}`);
  return [...out].filter(p => p.startsWith(`flags.${MOD}.`));
}

test("[declared] EXT-6: every flags.pentaryn-attunement.* path the sources write is in describe() flags.writes", () => {
  const written = new Set(SOURCES.flatMap(f => writtenPaths(readFileSync(new URL(f, DIR), "utf8"))));
  assert.ok(written.has(`flags.${MOD}.claims.coinBack`), "scan must see the coinBack claim (bonds.mjs)");
  const listed = new Set(MANIFEST.flags.writes);
  assert.deepEqual([...written].filter(p => !listed.has(p)).sort(), []);
});

test("[declared] EXT-6: the claim flags are listed apart from the stash side effects", () => {
  assert.deepEqual(MANIFEST.flags.writes.filter(p => p.includes(".claims.")),
    [`flags.${MOD}.claims.coinBack`, `flags.${MOD}.claims.home`]);
  const stash = MANIFEST.rows.find(r => r.path === "stash");
  assert.deepEqual(stash.sideEffects.filter(s => s.includes(".claims.")), []);
});

test("[declared] EXT-6: the README Data written table has a row for every flags.writes path", () => {
  const sec = README.slice(README.indexOf("## Data written"), README.indexOf("\n## ", README.indexOf("## Data written") + 1));
  const missing = MANIFEST.flags.writes.filter(p => !sec.includes(`\`${p}`) && !sec.includes(p.replace(/^flags\./, "`flags.")));
  assert.deepEqual(missing, []);
});
