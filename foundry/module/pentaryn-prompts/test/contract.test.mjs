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

const TOOL = "packages/mcp-server/src/fork/tools/prompt-markers.ts";

/** The queries this module registers (prompts.mjs `CONFIG.queries[\`${MODULE}.x\`] = …`), until describe() exists. */
function registeredQueries() {
  const src = readFileSync(new URL("../prompts.mjs", import.meta.url), "utf8");
  return [...src.matchAll(/CONFIG\.queries\[`\$\{MODULE\}\.([A-Za-z]+)`\]\s*=/g)].map(m => `${MODULE}.${m[1]}`).sort();
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
