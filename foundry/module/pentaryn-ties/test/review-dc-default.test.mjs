/**
 * M1 [declared] (final review ties-core, 2026-10-12; defect wave 2): a null or blank DC takes the
 * default 15, not 1. The shared `num` clamp read `Number(null)` and `Number("")` as 0 — a finite
 * number — so a missing DC clamped up to the floor of 1, and the lore/attribute DC editors wrote
 * `Number("")` (0) for a cleared box. `num` is now typed (a finite number, or a non-blank numeric
 * string; anything else takes the default) and a cleared DC box writes `null`.
 * Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";
import { LORE_DC_DEFAULT, clampAttribute, clampLoreRow, readLore } from "../known-core.mjs";

const PC = "zzDcPc0000000001";
const NPC = "zzDcNpc000000001";

await bootWorld({
  settings: { "pentaryn-ties.attributes": [{ id: "guild", title: "Salt Guild", category: "Guild", dc: 12, skill: "inv" }] },
  actors: [
    { id: PC, name: "ZZ Dc PC", type: "character", system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } }, flags: { "pentaryn-ties": { attributes: ["guild"] } } },
    { id: NPC, name: "ZZ Dc NPC", flags: { "pentaryn-ties": { lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>", miss: "" }] } } },
  ],
});
const AUI = await import("../attributes-ui.mjs");
const LUI = await import("../lore-ui.mjs");

test("M1: clampLoreRow gives a null, blank or non-numeric DC the default, not 1", () => {
  assert.equal(LORE_DC_DEFAULT, 15);
  for (const dc of [null, undefined, "", "   ", [], false, true, "abc", NaN]) assert.equal(clampLoreRow({ id: "a", label: "x", dc }).dc, LORE_DC_DEFAULT, `dc ${JSON.stringify(dc)}`);
  assert.equal(clampLoreRow({ id: "a", label: "x", dc: "12" }).dc, 12, "a numeric string (a form field) still counts");
  assert.equal(clampLoreRow({ id: "a", label: "x", dc: 0 }).dc, 1, "a real 0 still clamps to the floor");
  assert.equal(clampLoreRow({ id: "a", label: "x", dc: 99 }).dc, 40);
});

test("M1: clampAttribute gives a null, blank or non-numeric DC the default, not 1", () => {
  for (const dc of [null, undefined, "", "   ", [], false, true, "abc"]) assert.equal(clampAttribute({ id: "guild", title: "G", dc }).dc, LORE_DC_DEFAULT, `dc ${JSON.stringify(dc)}`);
  assert.equal(clampAttribute({ id: "guild", title: "G", dc: "14" }).dc, 14);
  assert.equal(clampAttribute({ id: "guild", title: "G", dc: 0 }).dc, 1);
});

test("M1: clearing a lore row's DC box saves the default 15 (before: 1)", async () => {
  const npc = game.actors.get(NPC);
  let saved = null;
  const section = el("section");
  section.innerHTML = LUI.loreEditorHTML(npc.flags["pentaryn-ties"].lore, "lore");
  LUI.bindLoreEditor(section, { rows: () => npc.flags["pentaryn-ties"].lore, save: async list => (saved = list), key: "lore" });
  const box = section.querySelector('[data-field="dc"]');
  assert.ok(box, "the DC box is rendered");
  box.value = "";
  await settle(box.dispatch("change"));
  assert.equal(readLore(saved)[0].dc, LORE_DC_DEFAULT);
});

test("M1: clearing an attribute's DC box saves the default 15 (before: 1)", async () => {
  const pc = game.actors.get(PC);
  const section = el("section");
  section.innerHTML = AUI.buildAttributesHTML(pc);
  AUI.bindAttributes(section.firstElementChild, pc, () => {});
  const box = section.querySelector('[data-attr-field="dc"][data-id="guild"]');
  assert.ok(box, "the DC box is rendered");
  box.value = "";
  await settle(box.dispatch("change"));
  const stored = game.settings.get("pentaryn-ties", "attributes").find(e => e.id === "guild");
  assert.equal(clampAttribute(stored).dc, LORE_DC_DEFAULT);
});
