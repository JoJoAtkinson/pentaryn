/**
 * ties-core.mjs (guide S3): imported bare first, with no Foundry stub, so a Foundry global creeping
 * into the pure layer fails here. VERSION === module.json (C41). The clamps equal what ties-api.mjs
 * exports (the S2 clamp goldens in core.test.mjs run through the re-export). The mirror rules
 * (ties-12) equal the verbatim oracles in fixtures/legacy-mirror.mjs on every pinned case.
 */
import * as core from "../ties-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, readJSON } from "./kit/harness.mjs";
import { linked, resolve, relayFill } from "./fixtures/legacy-mirror.mjs";

const golden = name => readJSON(new URL(`./golden/${name}.json`, import.meta.url));

test("core imports with no Foundry globals", () => {
  assert.equal(typeof globalThis.game, "undefined");
  assert.equal(core.MODULE, "pentaryn-ties");
});

test("VERSION === module.json version (C41)", () => {
  assert.equal(core.VERSION, manifestOf(new URL("..", import.meta.url)).version);
});

test("identity constants", () => {
  assert.deepEqual(
    { SHORT: core.SHORT, NS: core.NS, CONTRACT: core.CONTRACT, I18N: core.I18N, CSS: core.CSS, HOOKS: core.HOOKS, FLAG_SCOPE: core.FLAG_SCOPE },
    { SHORT: "ties", NS: "ties", CONTRACT: "pentaryn-ties/api@1", I18N: "PENTARYN_TIES", CSS: "pt-", HOOKS: {}, FLAG_SCOPE: "pentaryn-ties" }
  );
  assert.ok(Object.isFrozen(core.HOOKS));
});

test("ties-api.mjs re-exports the core's constants and clamps (same references)", async () => {
  const api = await import("../ties-api.mjs");
  for (const k of ["MODULE", "FLAG", "LEGACY_SCOPE", "STANCES", "STRENGTHS", "NOTES_MAX", "WORD_MAX", "clampStance", "clampStrength", "clampNotes", "clampWord", "stanceOf"]) {
    assert.equal(api[k], core[k], k);
  }
});

test("ties-12: resolveMirror equals the dialog's verbatim resolve() on every pinned case", () => {
  for (const row of golden("oracle-mirror-resolve")) {
    assert.deepEqual(core.resolveMirror(...row.args), row.out, row.label);
    assert.deepEqual(core.resolveMirror(...row.args), resolve(...row.args), row.label);
  }
});

test("ties-12: mirrorLinked equals linked() on every pinned case", () => {
  for (const row of golden("oracle-mirror-linked")) {
    assert.equal(core.mirrorLinked(...row.args), row.out, JSON.stringify(row.args));
    assert.equal(core.mirrorLinked(...row.args), linked(...row.args));
  }
});

test("ties-12: seedReverse equals the relay's fill-blanks rule (changed false ⇔ no write)", () => {
  for (const row of golden("oracle-mirror-relay")) {
    const mine = { word: "debtor", notes: "owes us" };
    const got = core.seedReverse(row.rev, mine);
    const want = relayFill(row.rev, mine);
    assert.deepEqual(got.changed ? { word: got.word, notes: got.notes } : null, want, row.label);
    assert.deepEqual(want, row.out, row.label);
  }
});

test("seedReverse caps relayed notes at NOTES_MAX", () => {
  const got = core.seedReverse({ word: "", notes: "" }, { word: "w", notes: "n".repeat(5000) });
  assert.equal(got.notes.length, core.NOTES_MAX);
});
