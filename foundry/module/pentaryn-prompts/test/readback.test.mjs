/**
 * Characterisation (prompts checkpoint, wave 1): the replace readback (readback-core.mjs), the
 * text the MCP tool prints as-is. Golden: golden/readback.json. Frozen once committed.
 */
import { test } from "node:test";
import { characterise } from "./kit/harness.mjs";
import * as R from "../readback-core.mjs";

const SUMMARY = { class: "Paladin 5", subclass: "Oath of Devotion", species: "Human", background: "Soldier",
  abilities: { str: 17, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, hp: 44, ac: 18, prof: 3, spellDC: 13, spellAbility: "cha",
  saves: ["wis", "cha"], skills: ["ath", "ins", "per", "prc"], speed: 30, darkvision: 60, size: "med", languages: ["common", "elvish"],
  feats: ["Tough"], spellCounts: { cantrips: 0, maxCantrips: null, prepared: 3, maxPrepared: 6, always: 4, spellbook: 2 } };

const real = R.resultRow({ index: 0, id: "p9", label: "p9", sceneId: "s1", markerId: "m1", kind: "character", ok: true,
  report: { summary: SUMMARY, defaults: ["Human: Skillful: picked perception"], warnings: ["w1"], patched: ["hp 44"], notes: ["n1"] },
  created: [{ type: "Token", id: "tok1", name: "Hale", x: 500, y: 300, w: 1, h: 1 }, { type: "Actor", id: "act1", name: "Hale" }, null],
  markerDeleted: true, prompt: "a paladin" });
const failed = R.resultRow({ index: 1, id: "p3", label: "p3", kind: "npc", ok: false, code: "CREATE_FAILED", error: "CREATE_FAILED: boom",
  report: { warnings: ["w"], notes: ["feature Slam not added: x"] }, created: [], markerDeleted: false,
  discarded: [{ type: "Actor", id: "a9", name: "Yark", discarded: true }, { type: "Item", id: "i1", name: "Key", discarded: false, error: "nope" }] });
const gone = R.resultRow({ index: 2, id: "p4", label: "p4", kind: "light", ok: false, code: "MARKER_GONE", error: R.goneMessage({ pid: "p4", sceneName: "Warren", resizedTo: "m9" }) });
const none = R.resultRow({ index: 3, id: "p5", label: "p5", kind: "none", ok: true, reason: "flavour only", created: [], markerDeleted: true });
const dry = R.planRow({ index: 0, id: "p1", label: "p1", kind: "hotspot", ok: true,
  plan: { sceneId: "s1", markerId: "m1", x: 525, y: 325, placement: "centred", footprint: "0.5x0.5", lockSize: true, hidden: true,
    creates: ["Actor (hotspot)", { items: ["The Ember Crown"] }], defaults: ["attunement set to required"], warnings: [], sheet: "Paladin 5" } });
const dryNone = R.planRow({ index: 1, id: "p2", label: "p2", kind: "none", ok: true, plan: { reason: "" } });
const dryBad = R.planRow({ index: 2, id: "p6", label: "p6", kind: "x", ok: false, code: "BAD_SPEC", error: "BAD_SPEC: with.kind" });
const E = [
  { id: "E1", xp: 325, creatures: 5, unbuilt: 1, budget: { size: 4, level: 3, low: 600, moderate: 900, high: 1600 }, difficulty: "under low" },
  { id: "E2", xp: 50, creatures: 1, estimate: true },
  { id: "E3", creatures: 0, unbuilt: 2 }
];

test("rows: resultRow and planRow flatten to strings", async () => {
  await characterise("readback-rows", r => r, [[real], [failed], [gone], [none], [dry], [dryNone], [dryBad]], { file: import.meta.url });
});

test("renderReplace: real run, dry run, all failed, empty", async () => {
  const text = res => R.renderReplace(res).split("\n");
  await characterise("readback-text", text, [
    [{ dryRun: false, call: "pm-7f3a", rows: [real, failed, gone, none], remaining: { s1: 2, s2: 0 }, encounters: E }],
    [{ dryRun: true, call: "pm-7f3a", rows: [dry, dryNone, dryBad], remaining: { s1: 1 }, encounters: E.slice(0, 1) }],
    [{ dryRun: false, rows: [failed, gone], remaining: {} }],
    [{ dryRun: true, rows: [], remaining: {} }],
    [null]
  ], { file: import.meta.url });
});

test("small pieces: sheetLine, encounterLine, remainingLine, needsDryRun, goneMessage, createdText", async () => {
  await characterise("readback-pieces", (fn, ...args) => R[fn](...args), [
    ["sheetLine", SUMMARY], ["sheetLine", { ...SUMMARY, subclass: "", spellCounts: null, darkvision: 0, languages: [], feats: [], spellAbility: null }], ["sheetLine", null],
    ["encounterLine", E[0]], ["encounterLine", E[1]], ["encounterLine", E[2]], ["encounterLine", null],
    ["remainingLine", { a: 1 }, []], ["remainingLine", {}, [{ ok: false }]], ["remainingLine", {}, []], ["remainingLine", null, []],
    ["needsDryRun", { requested: 6 }], ["needsDryRun", { requested: 5 }], ["needsDryRun", { requested: 6, seen: true }], ["needsDryRun", { requested: 6, skip: true }],
    ["goneMessage", { pid: "p1", sceneName: "Warren", replacedBy: 'Token "Yark" [t1]' }], ["goneMessage", { markerId: "m2", sceneName: "W", resizedTo: "m3" }], ["goneMessage", {}],
    ["createdText", { type: "Token", id: "t", name: "Y", x: 0, y: 0 }], ["createdText", { type: "Actor", id: "a", name: "Y", missing: true }], ["createdText", null]
  ], { file: import.meta.url });
});
