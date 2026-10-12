// i18n characterisation (guide S1 i18n.test; S4 turns the five T() wrappers into _loc and the
// template-built keys into literal tables). Every literal key in the sources exists in lang/en.json,
// and each template-built family exists for every value the code passes into it (derived from the
// code's own tables, not assumed: combat-riders-28). The wrappers are pinned as they are today.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pinJSON, sourceScan } from "./kit/harness.mjs";
import * as core from "../combat-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";

const ROOT = new URL("..", import.meta.url);
const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const flat = {};
(function walk(node, prefix) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") walk(v, key);
    else flat[key] = v;
  }
})(lang, "");
const has = k => typeof flat[k] === "string";
const { DEFAULTS } = await import("../settings.mjs");   // settings.mjs imports only the pure core
const settingKeys = Object.keys(DEFAULTS);

test("one root, PENTARYN_COMBAT; no other top-level key", () => {
  assert.deepEqual(Object.keys(lang), ["PENTARYN_COMBAT"]);
});

test("every literal PENTARYN_COMBAT key in the sources exists (golden/i18n-literal-keys.json)", () => {
  const keys = new Set();
  for (const hit of sourceScan(ROOT, /"PENTARYN_COMBAT\.[A-Za-z0-9_.-]+"/)) {
    for (const m of hit.text.matchAll(/"(PENTARYN_COMBAT\.[A-Za-z0-9_.-]+)"/g)) keys.add(m[1]);
  }
  const list = [...keys].sort();
  pinJSON("i18n-literal-keys", list, import.meta.url);
  assert.deepEqual(list.filter(k => !has(k)), []);
});

test("the template-built keys, as the sources build them today (golden/i18n-templates.json)", () => {
  const hits = sourceScan(ROOT, /`PENTARYN_COMBAT\.[^`]*\$\{/).map(h => `${h.file}:${h.line}`);
  pinJSON("i18n-templates", hits, import.meta.url);
});

test("settings: Setting.<key>.Name / Hint for each of the 30 DEFAULTS keys", () => {
  assert.equal(settingKeys.length, 30);
  for (const k of settingKeys) for (const p of ["Name", "Hint"]) assert.ok(has(`PENTARYN_COMBAT.Setting.${k}.${p}`), `${k}.${p}`);
  assert.deepEqual(Object.keys(lang.PENTARYN_COMBAT.Setting).sort(), [...settingKeys].sort(), "no stale setting strings");
});

test("riders: Name / Rule for each rider; Check for each hint code; Mode and ToggleHint for ask / auto", () => {
  for (const r of core.TURN_RIDERS) for (const fam of ["Name", "Rule"]) assert.ok(has(`PENTARYN_COMBAT.Rider.${fam}.${r.key}`), `${fam}.${r.key}`);
  const checks = new Set();
  for (const r of core.TURN_RIDERS) {
    for (const roll of [{}, { advantage: true }, { disadvantage: true }]) {
      for (const c of core.riderEligibility({ rider: r, weapon: { finesse: true }, roll, ability: "str" }).checks) checks.add(c.key);
    }
  }
  assert.deepEqual([...checks].sort(), ["advantage", "ally", "noDisadvantage", "raging", "reckless"]);
  for (const c of checks) assert.ok(has(`PENTARYN_COMBAT.Rider.Check.${c}`), c);
  for (const m of ["ask", "auto"]) for (const fam of ["Mode", "ToggleHint"]) assert.ok(has(`PENTARYN_COMBAT.Rider.${fam}.${m}`), `${fam}.${m}`);
});

test("the manifest RIDER type lists exactly the TURN_RIDERS keys", () => {
  // README "Extending → A turn rider": a TURN_RIDERS row plus strings is the whole job, so a fifth row
  // must not leave describe()'s rider param stale (api-manifest.mjs spells the keys out by hand).
  const want = core.TURN_RIDERS.map(r => JSON.stringify(r.key)).join("|");
  for (const path of ["riderMode", "setRiderMode", "rollRider"]) {
    const row = MANIFEST.rows.find(r => r.path === path);
    assert.ok(row, path);
    const rider = row.params.find(p => p.name === "key");
    assert.equal(rider?.type, want, path);
  }
});

test("follow-ups: FollowUp / FollowUpText for every kind core.followUps offers (with offhand-dual-wielder); a runFollowUp branch for each", () => {
  const kinds = ["offhand", "nick", "flurry", "martial-arts", "hew", "pole-strike"];
  for (const k of kinds) assert.ok(has(`PENTARYN_COMBAT.FollowUp.${k}`), `FollowUp.${k}`);
  for (const k of [...kinds, "offhand-dual-wielder"]) assert.ok(has(`PENTARYN_COMBAT.FollowUpText.${k}`), `FollowUpText.${k}`);
  const coreSrc = readFileSync(new URL("../core/followups.mjs", import.meta.url), "utf8");   // core.followUps lives here since S12
  const offered = [...new Set([...coreSrc.matchAll(/kind: "([a-z-]+)"/g)].map(m => m[1]))].filter(k => kinds.includes(k));
  assert.deepEqual(offered.sort(), [...kinds].sort(), "every kind core offers has strings");
  const seqSrc = readFileSync(new URL("../sequence.mjs", import.meta.url), "utf8");
  for (const k of kinds) assert.match(seqSrc, new RegExp(`f\\.kind === "${k}"`), `runFollowUp branch for ${k}`);
  assert.deepEqual(Object.keys(lang.PENTARYN_COMBAT.FollowUp).filter(k => !kinds.includes(k)), ["NoFocus"]);
});

test("Kind.<kind> for the strip's and the roll window's kinds; Turn.Effect / EffectText for Dash and Disengage", () => {
  for (const k of ["nick", "offhand", "bonus", "main", "pole-strike"]) assert.ok(has(`PENTARYN_COMBAT.Kind.${k}`), k);
  for (const k of ["dash", "disengage"]) for (const fam of ["Effect", "EffectText"]) assert.ok(has(`PENTARYN_COMBAT.Turn.${fam}.${k}`), `${fam}.${k}`);
  for (const a of ["normal", "advantage", "disadvantage", "critical"]) assert.ok(has(`PENTARYN_COMBAT.Strip.Action.${a}`), a);
  for (const n of ["main", "flurry", "bonus"]) assert.ok(has(`PENTARYN_COMBAT.Strip.PausedNote.${n}`), n);
  for (const s of ["on", "off"]) for (const fam of ["State", "Hint"]) assert.ok(has(`PENTARYN_COMBAT.Reckless.${fam}.${s}`), `${fam}.${s}`);
});

test("no two-branch T() wrapper is left (C35; S4 replaced the five with _loc)", () => {
  const hits = sourceScan(ROOT, /const T = \(key, data\) => \(data \? game\.i18n\.format\(key, data\) : game\.i18n\.localize\(key\)\);/).map(h => `${h.file}:${h.line}`);
  assert.deepEqual(hits, []);
});

test("Argon's own keys read by turnflow: enhancedcombathud-dnd5e.items.<action>.name for the six special actions", () => {
  assert.deepEqual([...core.SPECIAL_ACTIONS], ["dash", "disengage", "dodge", "hide", "ready", "shove"]);
  assert.equal(sourceScan(ROOT, /enhancedcombathud-dnd5e\.items\.\$\{k\}\.name/).length, 1);
});
