/**
 * Characterisation (ties checkpoint, wave 3): the three sheet tabs as a GM — Ties (editor.mjs
 * buildHTML/bind), Known (known.mjs buildKnownHTML/bindKnown) and Attributes (attributes-ui.mjs
 * buildAttributesHTML/bindAttributes) — on a character and on an NPC. Each tab's markup is pinned,
 * then every control it binds is pressed in turn (fixtures/ui.mjs) and what each press did is pinned.
 * The renderers' small exports (stanceSelect, pips, stanceChip, artFor, grantCard, grantedHead,
 * personalCluesHTML, categoryLabel) are pinned alongside. Frozen once committed.
 */
import { test } from "node:test";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";
import { exercise } from "./fixtures/ui.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const KIND = "zzKind0000000001";
const W = 1_700_000_000_000;

const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: true, reveal: "<p>From Vel.</p>", lore: [{ id: "c1", label: "Walls", dc: 11, skill: "his", text: "<p>Three rings.</p>", miss: "" }] },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city", secret: false, dc: 14, skill: "inv" },
];

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY, "pentaryn-ties.attributeKnowledge": { [PC]: { city: { when: W, failed: false, via: "grant", pending: false } } } },
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } },
      flags: {
        "pentaryn-ties": {
          ties: [{ id: NPC, word: "debtor", notes: "Owes us forty crowns.", stance: -1, strength: 4 }, { id: "zzGone0000000001", name: "Old Friend", word: "lost", stance: 1, strength: 2 }],
          known: [
            { id: NPC, name: "ZZ Brakka", category: "sentient", notes: "Smells of salt.", when: W },
            { id: KIND, name: "ZZ Ghoul", category: "beasts", notes: "", when: W + 1, hidden: true },
          ],
          granted: { [`kind:${KIND}`]: { text: "Grey hunters.", when: W, icon: null, source: "ZZ Ghoul" }, [`lore:${NPC}:l1`]: { text: "He owes the guild.", when: W, icon: null, source: "Debts" } },
          studied: { kind: { [KIND]: { when: W } }, lore: {} },
          attributes: ["guild", "city"],
        },
      },
    },
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" }, biography: { value: "<p>Grey.</p>" } } } },
    {
      id: NPC,
      name: "ZZ Brakka",
      system: { details: { type: { value: "humanoid" } } },
      flags: {
        "pentaryn-ties": {
          kindOf: KIND,
          ties: [{ id: PC, word: "mark", notes: "", stance: 0, strength: 3 }],
          attributes: ["city"],
          lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>He owes the guild.</p>", miss: "<p>Shifty.</p>" }],
          studyTiers: [{ min: 15, text: "A thin man." }],
        },
      },
    },
  ],
  tokens: [{ id: "zzTokPc000000001", actorId: PC }, { id: "zzTokNpc00000001", actorId: NPC }],
});
const get = id => game.actors.get(id);
const Editor = await import("../editor.mjs");
const Known = await import("../known.mjs");
const AUI = await import("../attributes-ui.mjs");

const mountWith = (build, bind, actor) => () => {
  const section = el("section");
  section.innerHTML = build(actor);
  bind(section.firstElementChild, actor, () => F.calls.push({ op: "rerender" }));
  return section;
};

test("small renderers: stanceSelect, pips, stanceChip, artFor, grantCard, grantedHead, personalCluesHTML, categoryLabel", () => {
  pinJSON(
    "ui-small",
    {
      stanceSelect: [Editor.stanceSelect(-1), Editor.stanceSelect(9, { field: "reverseStance" })],
      pips: [Editor.pips(3, true), Editor.pips(0, false)],
      stanceChip: [Editor.stanceChip(2), Editor.stanceChip(-2, { labelled: false })],
      artFor: [Editor.artFor({ id: NPC, img: "x.webp" }), Editor.artFor({ id: "gone", img: null })],
      grantCard: [Known.grantCard({ key: "k", text: "Said.", source: "Src", icon: null, when: W }), Known.grantCard({ key: "k2", text: "", source: "S", icon: "i.webp", when: W }, { extra: "<b>x</b>", textHTML: "<p>T</p>" })],
      grantedHead: Known.grantedHead(),
      personalClues: AUI.personalCluesHTML({ id: "city", title: "Vel", lore: REGISTRY[0].lore }),
      categoryLabel: [Known.categoryLabel({ key: "sentient" }), Known.categoryLabel({ key: "custom-thing" }), Known.categoryLabel({ key: "beasts", label: "Critters" }), Known.categoryLabel(null)],
      categoriesFor: Known.categoriesFor(get(PC)),
    },
    import.meta.url
  );
});

test("Ties tab on the character: markup, then every control", async () => {
  pinJSON("ui-ties-pc-html", Editor.buildHTML(get(PC)), import.meta.url);
  pinJSON("ui-ties-pc-controls", await exercise(F, mountWith(Editor.buildHTML, Editor.bind, get(PC))), import.meta.url);
});

test("Ties tab on the NPC (GM: inbound rows, the GM section): markup, then every control", async () => {
  pinJSON("ui-ties-npc-html", Editor.buildHTML(get(NPC)), import.meta.url);
  pinJSON("ui-ties-npc-controls", await exercise(F, mountWith(Editor.buildHTML, Editor.bind, get(NPC))), import.meta.url);
});

test("Known tab on the character: markup, then every control", async () => {
  pinJSON("ui-known-html", Known.buildKnownHTML(get(PC)), import.meta.url);
  pinJSON("ui-known-controls", await exercise(F, mountWith(Known.buildKnownHTML, Known.bindKnown, get(PC))), import.meta.url);
});

test("Attributes tab on the character and the NPC: markup, then every control", async () => {
  pinJSON("ui-attrs-html", { pc: AUI.buildAttributesHTML(get(PC)), npc: AUI.buildAttributesHTML(get(NPC)), npcAsPcViewer: AUI.buildAttributesHTML(get(NPC), get(PC)) }, import.meta.url);
  pinJSON("ui-attrs-pc-controls", await exercise(F, mountWith(a => AUI.buildAttributesHTML(a), AUI.bindAttributes, get(PC))), import.meta.url);
  pinJSON("ui-attrs-npc-controls", await exercise(F, mountWith(a => AUI.buildAttributesHTML(a), AUI.bindAttributes, get(NPC))), import.meta.url);
});
