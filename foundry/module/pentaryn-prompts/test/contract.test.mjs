/**
 * Fork parity (use-doc §6 contract.test): the `prompt-markers` tool in the MCP fork against this
 * module. Reads $FOUNDRY_MCP_FORK; without it (or without the file) the test skips with a note.
 * The fork is read only through the kit harness (forkQueries / forkSource), never regexed here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contractDrift, forkQueries, forkSource } from "./kit/harness.mjs";
import { MODULE, GATHER_CHARS } from "../geometry-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { queryNameOf } from "../lib/queries.mjs";

const TOOL = "packages/mcp-server/src/fork/tools/prompt-markers.ts";

/** The queries this module registers: the manifest's query rows (kit registerQueries, guide step 13). */
function registeredQueries() {
  return MANIFEST.rows.filter(r => r.query).map(r => queryNameOf(MANIFEST, r)).sort();
}

test("every query the fork sends is registered by the module", t => {
  const fork = forkQueries(MODULE, TOOL);
  if (fork.skip) return t.skip(fork.skip);
  assert.ok(fork.names.length > 0, "no pentaryn-prompts query names found in the fork tool");
  const drift = contractDrift({ queries: registeredQueries() }, fork);
  assert.deepEqual(drift.missing, []);
});

test("D6: the fork documents the module's gather chars default", t => {
  const src = forkSource(TOOL);
  if (src.skip) return t.skip(src.skip);
  assert.ok(src.text.includes(`(default ${GATHER_CHARS})`), `the fork's chars description should say (default ${GATHER_CHARS})`);
});

/* ── vocabularies (guide step 14; mcp-fork-15, prompts-lookup-11 module half) ── */

const SCHEMA = "packages/mcp-server/src/fork/tools/prompt-markers.schema.ts";

/** The text of `const <name> = …` up to its `.strict();` (a zod object block of the fork schema). */
function blockOf(text, name) {
  const start = text.indexOf(`const ${name} =`);
  if (start < 0) return null;
  const end = text.indexOf(".strict();", start);
  return text.slice(start, end < 0 ? undefined : end);
}
const objectKeys = block => [...block.matchAll(/^ {4}(\w+):/gm)].map(m => m[1]);
const constList = (text, name) => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(text);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null;
};

/**
 * Keys the module accepts that the fork's strict schemas refuse (prompts-lookup-11). Widening the
 * fork's schemas is a declared change on the fork side; until then this table pins the drift.
 */
const KNOWN_DRIFT = { character: ["folder"], gather: ["from"] };

test("vocabularies: replacement kinds, sizes, feature types and patch keys match the fork's schema", async t => {
  const src = forkSource(SCHEMA);
  if (src.skip) return t.skip(src.skip);
  const { KINDS, PATCH_KEYS } = await import("../prompts-core.mjs");
  const { NPC_SIZES, FEATURE_TYPES } = await import("../npc-core.mjs");
  const kinds = [...new Set([...src.text.matchAll(/kind: z\.literal\('(\w+)'\)/g)].map(m => m[1]))].sort();
  assert.deepEqual(kinds, [...KINDS].sort());
  assert.deepEqual(constList(src.text, "SIZES"), [...NPC_SIZES]);
  assert.deepEqual(constList(src.text, "FEATURE_TYPES"), [...FEATURE_TYPES]);
  assert.deepEqual(objectKeys(blockOf(src.text, "Patch")).sort(), [...PATCH_KEYS].sort());
});

test("KNOWN_DRIFT (prompts-lookup-11): what the module accepts and the fork's strict schemas still refuse", async t => {
  const src = forkSource(SCHEMA);
  if (src.skip) return t.skip(src.skip);
  const fork = { character: objectKeys(blockOf(src.text, "WithCharacter")), gather: objectKeys(blockOf(src.text, "GatherArgs")) };
  for (const [where, keys] of Object.entries(KNOWN_DRIFT)) {
    for (const k of keys) assert.equal(fork[where].includes(k), false, `${where}.${k} is in the fork now: drop it from KNOWN_DRIFT`);
  }
  // the module side of the drift: the character builder reads with.folder, gather pages with from
  const ch = readFileSync(new URL("../character-adapter.mjs", import.meta.url), "utf8");
  const ga = readFileSync(new URL("../gather.mjs", import.meta.url), "utf8");
  assert.match(ch, /characterFolder\(w\.folder\)/);
  assert.match(ga, /maxPrompts = 60, from = null/);
});
