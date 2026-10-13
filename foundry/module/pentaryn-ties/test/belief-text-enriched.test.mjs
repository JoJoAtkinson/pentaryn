/**
 * Defect wave 3 (ties-ui, belief text): the GM-only belief row printed the authored lore HTML as
 * literal text — `<p>He owes the guild.</p>` on screen, tags and all — because the row escaped
 * `row.text` (authoring-ui.mjs:103). Declared fix: the row's text renders as enriched HTML, through
 * TextEditor.enrichHTML relative to the studied actor, after the section is bound. The section is
 * still GM-only (a player gets "", nothing to enrich), the empty-text "said nothing" line is
 * unchanged, and an enricher that throws falls back to the escaped text rather than an empty box.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const NPC = "zzEnrichNpc00001";
const PC = "zzEnrichPc000001";
const PC2 = "zzEnrichPc000002";
const HTML = "<p>He owes the <strong>guild</strong>.</p>";
const LORE = [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: HTML, miss: "" }];

const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ Enrich Reader", type: "character" },
    { id: PC2, name: "ZZ Enrich Silent", type: "character" },
    {
      id: NPC,
      name: "ZZ Enrich Brakka",
      flags: {
        "pentaryn-ties": {
          lore: LORE,
          beliefs: {
            [PC]: { [`lore:${NPC}:l1`]: { text: HTML, total: 15, pass: true, when: 1, delivered: 2 } },
            [PC2]: { [`lore:${NPC}:l1`]: { text: "", total: 3, pass: false, when: 1, delivered: 2 } },
          },
        },
      },
    },
  ],
});
const AUI = await import("../authoring-ui.mjs");
const npc = game.actors.get(NPC);
const TE = F.foundry.applications.ux.TextEditor.implementation;
const plain = TE.enrichHTML;

const mount = async () => {
  const section = el("section");
  section.innerHTML = AUI.authoringHTML(npc);
  await settle(Promise.resolve(AUI.bindAuthoring(section, npc, () => {})));
  return section;
};
const textOf = (root, id) =>
  root.querySelectorAll(".pt-belief").find(li => li.dataset.character === id).querySelector(".pt-belief-text");

test("wave-3 ties-ui: a belief row's lore text renders as enriched HTML, not escaped markup", async () => {
  const seen = [];
  TE.enrichHTML = async (html, opts) => {
    seen.push({ html, opts });
    return `${html}<span class="zz-enriched"></span>`;
  };
  try {
    const root = await mount();
    const box = textOf(root, PC);
    // the fake DOM keeps a markup-born element's text in textContent: literal tags there are on screen
    assert.ok(!box.textContent.includes("<p>"), `no literal tags on screen: ${box.textContent}`);
    assert.ok(!box.innerHTML.includes("&lt;"), `no escaped tags on screen: ${box.innerHTML}`);
    assert.ok(box.innerHTML.includes(HTML), `the authored HTML is the markup: ${box.innerHTML}`);
    assert.ok(box.querySelector(".zz-enriched"), "it went through TextEditor.enrichHTML");
    const call = seen.find(c => c.html === HTML);
    assert.ok(call, "enrichHTML saw the raw authored HTML");
    assert.equal(call.opts?.relativeTo, npc, "enriched relative to the studied actor");
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 ties-ui: an empty belief keeps the 'said nothing' line and is not enriched", async () => {
  const seen = [];
  TE.enrichHTML = async html => (seen.push(html), html);
  try {
    const root = await mount();
    const box = textOf(root, PC2);
    assert.ok(box.querySelector("em"), `the silent line is shown: ${box.innerHTML}`);
    assert.equal(seen.length, 1, `only the non-empty row is enriched: ${JSON.stringify(seen)}`);
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 ties-ui: an enricher that throws falls back to the escaped text, never an empty box", async () => {
  TE.enrichHTML = async () => {
    throw new Error("zz enrich boom");
  };
  try {
    const root = await mount();
    const box = textOf(root, PC);
    const shown = box.innerHTML.includes("&lt;p&gt;") || box.textContent.includes("<p>");
    assert.ok(shown, `escaped fallback: ${box.innerHTML || box.textContent}`);
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 ties-ui: the section stays GM-only — a player gets nothing to enrich", async () => {
  const was = F.game.user.isGM;
  F.game.user.isGM = false;
  try {
    assert.equal(AUI.authoringHTML(npc), "");
  } finally {
    F.game.user.isGM = was;
  }
});
