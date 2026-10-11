// Glue characterisation (guide step 2): load the entry exactly as Foundry would, fire `ready`,
// and pin what it registers, logs and publishes — against today's unchanged code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON, readJSON } from "./kit/harness.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
installLookupWorld(F);

await import("../pentaryn-lookup.mjs");
const hooksAtLoad = F.hooks.slice();

const logLines = [];
const realLog = console.log;
console.log = (...args) => logLines.push(args.map(String).join(" "));
try {
  F.fire("ready");
} finally {
  console.log = realLog;
}
const rules = game.pentaryn.rules;

test("foundry.utils is Foundry's own common/ code", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("hook registration manifest (golden/hooks.json)", () => {
  pinJSON("hooks", hooksAtLoad, import.meta.url);
  assert.deepEqual(hooksAtLoad, [{ kind: "once", name: "ready" }]);
});

test("ready logs exactly one console.log line", () => {
  assert.deepEqual(logLines, [
    "pentaryn-lookup | game.pentaryn.rules ready — search(), page(), monster(), packs(), selftest()",
  ]);
});

// The legacy surface is a floor, not the whole surface: later steps may ADD keys (describe,
// version, …), so the test asserts golden ⊆ live with the same typeof (guide step 7).
test("published surface: every legacy key with its typeof (golden/legacy-surface.json)", () => {
  const surface = Object.fromEntries(Object.keys(rules).sort().map(k => [k, typeof rules[k]]));
  if (process.env.GOLDEN_UPDATE === "1") pinJSON("legacy-surface", surface, import.meta.url);
  const legacy = readJSON(new URL("./golden/legacy-surface.json", import.meta.url));
  assert.deepEqual(Object.keys(legacy), [
    "LIMITS", "monster", "monsters", "names", "onList", "packs", "page", "search", "selftest", "spellList", "toPlainText",
  ]);
  for (const [k, type] of Object.entries(legacy)) assert.equal(typeof rules[k], type, k);
});

test("LIMITS is the documented table", () => {
  assert.deepEqual({ ...rules.LIMITS }, { hits: 5, hitsMax: 20, snippet: 240, snippetMax: 600, pageChars: 6000, payloadBytes: 8192 });
});

test("load order (a): game.pentaryn undefined before ready → created with rules", () => {
  assert.ok(game.pentaryn && typeof game.pentaryn === "object");
  assert.equal(typeof game.pentaryn.rules.search, "function");
});

test("load order (b): game.pentaryn frozen { importer } before ready → rules added, importer kept", async () => {
  const importer = {};
  game.pentaryn = Object.freeze({ importer });
  await import("../pentaryn-lookup.mjs?order=b");
  const saved = console.log;
  console.log = () => {};
  try {
    F.fire("ready");
  } finally {
    console.log = saved;
  }
  assert.equal(game.pentaryn.importer, importer);
  assert.equal(typeof game.pentaryn.rules.search, "function");
});

test("page(<uuid>) with a rejecting fromUuid: the {error} answer and zero console lines (debug unset)", async () => {
  const saved = globalThis.fromUuid;
  const lines = [];
  const keep = {};
  for (const level of ["log", "debug", "info", "warn", "error"]) {
    keep[level] = console[level];
    console[level] = (...a) => lines.push([level, String(a[0])]);
  }
  globalThis.fromUuid = async () => { throw new Error("pack locked"); };
  try {
    assert.equal(CONFIG.debug["pentaryn-lookup"], undefined);
    assert.deepEqual(await rules.page("Compendium.x.y"), { error: "no document at Compendium.x.y" });
  } finally {
    globalThis.fromUuid = saved;
    Object.assign(console, keep);
  }
  assert.deepEqual(lines, []);
});
