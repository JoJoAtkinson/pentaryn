/**
 * Defect wave 3 (Joe's ruling 2026-10-13): lore text a player sees renders as clean text, never as
 * literal HTML tags. The grant card escaped the authored HTML, so a player read `<p>From Vel.</p>`
 * instead of "From Vel." — on the Known tab, the Attributes tab's detail, the Look window and the
 * GM's inspect player view — and the GM's hold/deliver prompt showed the same tags.
 *
 * Declared fix: an HTML grant is drawn as an empty box marked `data-enrich` and filled after the
 * paint with TextEditor.enrichHTML, `secrets: false`, so a GM `<section class="secret">` never
 * reaches a player. A failed enrich falls back to tag-free text with the secret block removed.
 * Plain-text lore (no tags) is drawn exactly as before: escaped, pre-line, no enrichment. A blank
 * grant still draws no card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

globalThis.CSS ??= { escape: s => String(s) };

const PC = "zzCleanPc0000001";
const NPC = "zzCleanNpc000001";
const PLAYER = "zzCleanPlayer001";
const HTML = '<p>From <strong>Vel</strong>.</p><section class="secret"><p>GM only</p></section>';
const PLAIN = "Owes the guild.\nTwice.";
const KEY = `lore:${NPC}:l1`;
const KEY2 = `lore:${NPC}:l2`;

const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Clean Player", isGM: false }],
  actors: [
    {
      id: PC,
      name: "ZZ Clean Reader",
      type: "character",
      system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } },
      flags: {
        "pentaryn-ties": {
          known: [{ id: NPC, name: "ZZ Clean Vel", category: "sentient", notes: "", when: 1_700_000_000_000, hidden: false }],
          granted: {
            [KEY]: { text: HTML, when: 1, icon: null, source: "Where from" },
            [KEY2]: { text: PLAIN, when: 2, icon: null, source: "Debts" }
          }
        }
      }
    },
    {
      id: NPC,
      name: "ZZ Clean Vel",
      system: { details: { type: { value: "humanoid" } } },
      flags: {
        "pentaryn-ties": {
          lore: [
            { id: "l1", label: "Where from", dc: 10, skill: "his", text: HTML, miss: "" },
            { id: "l2", label: "Debts", dc: 10, skill: "ins", text: PLAIN, miss: "" }
          ],
          beliefs: { [PC]: { [KEY]: { text: HTML, total: 15, pass: true, when: 1, delivered: null } } }
        }
      }
    }
  ]
});
const Known = await import("../known-ui.mjs");
const { LookWindow } = await import("../look-app.mjs");
const { promptDeliver } = await import("../study/gate.mjs");
const { resolveFact } = await import("../study/resolve.mjs");
const TE = F.foundry.applications.ux.TextEditor.implementation;
const plain = TE.enrichHTML;

/** Foundry's own rule: `secrets: false` drops every `section.secret`. */
const foundryLike = seen => async (html, opts = {}) => {
  seen.push({ html, opts });
  return opts.secrets ? html : String(html).replace(/<section class="secret">[\s\S]*?<\/section>/g, "");
};

async function asPlayer(fn) {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  try {
    return await fn();
  } finally {
    game.user = gm;
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await settle(new Promise(r => setImmediate(r)));
};

function assertClean(box, where) {
  assert.ok(box, `${where}: the grant's box is drawn`);
  assert.ok(!box.innerHTML.includes("&lt;"), `${where}: no escaped tags: ${box.innerHTML}`);
  assert.ok(!box.textContent.includes("<p>"), `${where}: no literal tags on screen: ${box.textContent}`);
  assert.ok(!box.innerHTML.includes("GM only"), `${where}: the GM secret is not shown: ${box.innerHTML}`);
  assert.match(box.innerHTML, /From <strong>Vel<\/strong>\./, `${where}: the authored markup renders`);
}

const boxFor = (root, source) =>
  root.querySelectorAll(".pt-grant").find(li => li.querySelector(".pt-grant-source")?.textContent === source)?.querySelector(".pt-grant-text");

test("wave-3 lore-clean: the Known tab paints an HTML grant as clean text, secrets stripped", async () => {
  const seen = [];
  TE.enrichHTML = foundryLike(seen);
  try {
    const root = await asPlayer(async () => {
      const pc = game.actors.get(PC);
      const section = el("section");
      section.innerHTML = Known.buildKnownHTML(pc);
      Known.bindKnown(section.firstElementChild, pc, () => {});
      await flush();
      return section;
    });
    assertClean(boxFor(root, "Where from"), "known");
    const call = seen.find(c => c.html === HTML);
    assert.ok(call, "enrichHTML saw the raw authored HTML");
    assert.equal(call.opts.secrets, false, "a player surface never enriches with secrets");
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 lore-clean: plain-text lore is drawn exactly as before (escaped, pre-line, not enriched)", async () => {
  const seen = [];
  TE.enrichHTML = foundryLike(seen);
  try {
    const card = Known.grantCard({ source: "Debts", text: PLAIN });
    assert.match(card, /<div class="pt-grant-text">Owes the guild\.\nTwice\.<\/div>/);
    assert.ok(!card.includes("data-enrich"));
    assert.ok(!seen.some(c => c.html === PLAIN), "plain text is not sent through the enricher");
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 lore-clean: a blank grant still draws no card; a secret-only grant is blank to a player", () => {
  assert.equal(Known.grantCard({ source: "x", text: "<p></p>" }), "");
  assert.equal(Known.grantCard({ source: "x", text: '<section class="secret"><p>GM only</p></section>' }), "");
  assert.ok(Known.grantCard({ source: "x", text: "" }, { textHTML: "<em>—</em>" }).includes("<em>—</em>"), "textHTML override kept");
});

test("wave-3 lore-clean: the Attributes tab detail's granted region is painted clean", async () => {
  TE.enrichHTML = foundryLike([]);
  try {
    const root = el("div");
    root.innerHTML = `<div class="pentaryn-attributes">${Known.grantedRegion([{ source: "Where from", text: HTML }])}</div>`;
    const AUI = await import("../attributes-ui.mjs");
    await asPlayer(async () => {
      AUI.bindAttributes(root.firstElementChild, game.actors.get(PC), () => {});
      await flush();
    });
    assertClean(boxFor(root, "Where from"), "attributes");
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 lore-clean: the Look window paints an HTML grant as clean text", async () => {
  TE.enrichHTML = foundryLike([]);
  try {
    const content = el("div");
    await asPlayer(async () => {
      const w = new LookWindow(game.actors.get(PC), game.actors.get(NPC));
      w._replaceHTML(w.buildHTML(), content);
      await flush();
    });
    assertClean(boxFor(content, "Where from"), "look");
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 lore-clean: a failed enrich falls back to tag-free text, never the secret", async () => {
  TE.enrichHTML = async () => {
    throw new Error("enricher down");
  };
  try {
    const content = el("div");
    await asPlayer(async () => {
      const w = new LookWindow(game.actors.get(PC), game.actors.get(NPC));
      w._replaceHTML(w.buildHTML(), content);
      await flush();
    });
    const box = boxFor(content, "Where from");
    assert.ok(box.innerHTML.includes("From Vel."), `fallback keeps the words: ${box.innerHTML}`);
    assert.ok(!box.innerHTML.includes("GM only"), "fallback drops the secret");
    assert.ok(!box.innerHTML.includes("&lt;") && !box.textContent.includes("<p>"), "fallback shows no tags");
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 lore-clean: the GM hold/deliver prompt previews the lore as clean text", async () => {
  const seen = [];
  TE.enrichHTML = foundryLike(seen);
  try {
    const fact = resolveFact({ ns: "lore", subjectId: NPC, factId: "l1" });
    const mark = F.calls.length;
    F.dialogs.push(false);
    await settle(promptDeliver(game.actors.get(PC), fact));
    const dialog = F.calls.slice(mark).find(c => c.op === "DialogV2.confirm");
    assert.ok(dialog, "the hold prompt opened");
    const text = dialog.content.match(/<div class="pt-study-hold-text[^"]*">([\s\S]*?)<\/div>$/)?.[1] ?? dialog.content;
    assert.ok(!text.includes("&lt;"), `no escaped tags: ${text}`);
    assert.ok(!text.includes("GM only"), "the prompt previews what the player gets: no secret");
    assert.match(text, /From <strong>Vel<\/strong>\./);
  } finally {
    TE.enrichHTML = plain;
  }
});

test("wave-3 lore-clean: the GM's inspect player view paints its grant cards as the player's tab does", async () => {
  TE.enrichHTML = foundryLike([]);
  try {
    const { InspectPreview } = await import("../preview-app.mjs");
    const pv = new InspectPreview(game.actors.get(NPC));
    const content = el("div");
    pv._replaceHTML(`<ul class="pt-granted-list">${Known.grantCard({ source: "Where from", text: HTML })}</ul>`, content);
    await flush();
    assertClean(boxFor(content, "Where from"), "preview");
  } finally {
    TE.enrichHTML = plain;
  }
});
