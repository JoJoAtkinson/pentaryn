/**
 * Characterisation (senses checkpoint, wave 3), plan step 1 part of api.test: today's published
 * surface — `game.pentaryn.senses` (with `.light`) and `game.pentaryn.chain` — every path and its
 * function name, as the active GM after ready. Frozen once committed. Step 7 compares the kit
 * surface against this golden: it may differ ONLY by the kit members added and the two `uninstall`s
 * removed (C48, declared S-1), in a reviewed golden update in the declared commit.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, settle, surfaceOf, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
await boot();
await settle(mock);

test("surface: every published path and its function name (active GM, after ready)", () => {
  pinJSON("surface", { senses: surfaceOf(game.pentaryn.senses), chain: surfaceOf(game.pentaryn.chain) }, import.meta.url);
});

test("surface: the light API is the same object under senses.light; constants are today's tables", () => {
  const L = game.pentaryn.senses.light;
  assert.equal(L.PHB_LIGHT_ACTOR, "phbsplLight00000");
  assert.equal(Object.isFrozen(L.SPELL_LIGHT), true);
  assert.equal(L.profileFor({ name: "Torch" }).dim, 40);
  assert.equal(L.profileFor({ name: "Light", type: "spell" }), null);
});

// Added at guide step 7 (C27, C28): the kit-built API — describe() golden, rows ↔ implementations,
// the alias, module.api, and the kit members.
import { normaliseDescribe } from "./kit/harness.mjs";
import { MANIFEST } from "../api-manifest.mjs";

test("describe(): the manifest as JSON (golden); flags and settings as declared", () => {
  const d = game.pentaryn.senses.describe();
  pinJSON("describe", normaliseDescribe(d), import.meta.url);
  assert.equal(d.flagScope, "pentaryn-senses");
  assert.deepEqual(d.settings.map(s => [s.key, s.store === true]), [["sightReset", true]]);
  assert.equal(d.hooks.length, 33, "glow 1 + chain 8 + light 15 + carried 9 ([declared PT TF-2] + carried updateToken; the entry's own init/ready are not reg records)");
  assert.deepEqual(d.events, []);
});

test("rows ↔ implementations: every row path is a published function, nothing published without a row", () => {
  const S = game.pentaryn.senses;
  const at = path => path.split(".").reduce((o, k) => o?.[k], S);
  for (const row of MANIFEST.rows) assert.equal(typeof at(row.path), "function", row.path);
  const KIT = ["version", "contract", "settings", "trace", "uninstall", "describe"];
  const paths = Object.keys(surfaceOf(S)).filter(p => !KIT.includes(p) && !p.startsWith("light.SPELL_LIGHT") && p !== "light.PHB_LIGHT_ACTOR");
  assert.deepEqual(paths.sort(), MANIFEST.rows.map(r => r.path).sort());
  assert.equal(S.version, "0.5.0");
  assert.equal(S.contract, "pentaryn-senses/api@1");
  assert.deepEqual(S.settings(), { sightReset: { store: true, size: null } });
  assert.deepEqual(S.trace(), []);
});

test("publish: module.api is canonical; game.pentaryn.chain is senses.chain; the published record", () => {
  assert.equal(game.modules.get("pentaryn-senses").api, game.pentaryn.senses);
  assert.equal(game.pentaryn.chain, game.pentaryn.senses.chain);
  assert.deepEqual(Object.keys(game.pentaryn.published()).sort(), ["chain", "senses"]);
  assert.equal(game.pentaryn.published().chain.alias, true);
  assert.deepEqual(game.pentaryn.namespaces(), ["senses"], "the alias is not a namespace of its own");
});

// senses-EXT-6: every flag key the module writes is declared in MANIFEST.flags.writes. "Writes" is
// every pentaryn-senses flag key in a recorded write call (the `calls` of every golden), so a new
// write that a golden pins and the manifest leaves out fails here.
import { readdirSync, readFileSync } from "node:fs";

test("flags.writes: every flag key a recorded call writes is declared (senses-EXT-6)", () => {
  const goldens = new URL("./golden/", import.meta.url);
  const written = new Map();   // key → the golden that shows it written
  const keysIn = (v, file) => {
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      const flat = k.match(/^flags\.pentaryn-senses\.(?:-=)?([^.]+)/);
      if (flat) written.set(flat[1], file);
      if (k === "pentaryn-senses" && x && typeof x === "object") {
        for (const key of Object.keys(x)) written.set(key.replace(/^-=/, ""), file);
      }
      keysIn(x, file);
    }
  };
  const visit = (v, file) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v.calls)) for (const c of v.calls) keysIn(c, file);
    for (const x of Object.values(v)) visit(x, file);
  };
  for (const f of readdirSync(goldens).filter(f => f.endsWith(".json"))) {
    visit(JSON.parse(readFileSync(new URL(f, goldens), "utf8")), f);
  }
  assert.ok(written.has("lightToggle"), "setupLight's torch activity is pinned as a write");
  const declared = new Set(MANIFEST.flags.writes);
  for (const [key, file] of written) {
    assert.ok(declared.has(`flags.pentaryn-senses.${key}`), `${key} (written in ${file}) is not in MANIFEST.flags.writes`);
  }
});
