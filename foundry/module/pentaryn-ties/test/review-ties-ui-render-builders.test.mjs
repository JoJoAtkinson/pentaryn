/**
 * Final code review (ties-ui-M12): TieDialog._renderHTML was ~215 lines of mixed state and markup —
 * candidate adoption, both pickers, the draft, the status ladder, the mirror boxes and the whole form
 * template in one method.
 * Ruling: split it into private builders (source picker, target facade, fields, status line); no
 * behaviour change, output byte-identical. The per-state markup below was pinned against the
 * unsplit method before the split, so every branch of every builder is held to the old bytes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzRbPc0000000001";
const PC2 = "zzRbPc0000000002";
const NPC = "zzRbNpc000000001";
const NPC2 = "zzRbNpc000000002";
const PLAYER = "zzRbPlayer000001";
const NOBODY = "zzRbNobody000001";

await bootWorld({
  users: [
    { id: PLAYER, name: "ZZ Rb Player", isGM: false, character: null },
    { id: NOBODY, name: "ZZ Rb Nobody", isGM: false, character: null },
  ],
  actors: [
    { id: PC, name: "ZZ Rb Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 }, flags: { "pentaryn-ties": { ties: [{ id: NPC, word: "debtor", notes: "Owes.", stance: -1, strength: 4 }] } } },
    { id: PC2, name: "ZZ Rb Wren", type: "character", flags: { "pentaryn-ties": { ties: [{ id: NPC2, word: "friend", notes: "Same.", stance: 1, strength: 3 }] } } },
    { id: NPC, name: "ZZ Rb Brakka", flags: { "pentaryn-ties": { ties: [{ id: PC, word: "mark", notes: "Their side.", stance: 1, strength: 2 }] } } },
    { id: NPC2, name: "ZZ Rb Ilse", flags: { "pentaryn-ties": { ties: [{ id: PC2, word: "friend", notes: "Same.", stance: 1, strength: 3 }] } } },
  ],
  tokens: [
    { id: "zzRbTokPc0000001", actorId: PC },
    { id: "zzRbTokPc0000002", actorId: PC2 },
    { id: "zzRbTokNpc000001", actorId: NPC, name: "Hooded Figure" },
    { id: "zzRbTokNpc000002", actorId: NPC2 },
  ],
});
const get = id => game.actors.get(id);
const { TieDialog } = await import("../tie-dialog.mjs");

const as = async (userId, fn) => {
  const was = game.user;
  game.user = game.users.get(userId) ?? was;
  try {
    return await fn();
  } finally {
    game.user = was;
  }
};
const html = d => d._renderHTML();

test("ties-ui-M12: TieDialog markup in every state is byte-identical to the unsplit render", async () => {
  const draft = new TieDialog({ source: get(PC2), target: get(NPC) });
  draft.draft = { word: "rival", stance: -1, strength: 5, notes: "Typed <b>here</b>.", reverseWord: "", reverseNotes: "" };
  const states = {
    gmFresh: await html(new TieDialog({})),
    gmSourceOnly: await html(new TieDialog({ source: get(PC) })),
    gmEditingDiverged: await html(new TieDialog({ source: get(PC), target: get(NPC) })),
    gmEditingLinked: await html(new TieDialog({ source: get(PC2), target: get(NPC2) })),
    gmCreating: await html(new TieDialog({ source: get(PC2), target: get(NPC) })),
    gmDraft: await html(draft),
    gmClickedNpc: await html(new TieDialog({ clicked: get(NPC), clickedToken: canvas.tokens.get("zzRbTokNpc000001") })),
    gmPickerPickedTarget: await html(new TieDialog({ target: get(NPC) })),
    playerOwnToken: await as(PLAYER, () => html(new TieDialog({ clicked: get(PC) }))),
    playerToDisguised: await as(PLAYER, () => html(new TieDialog({ source: get(PC), target: get(NPC) }))),
    playerSoleOption: await as(PLAYER, () => html(new TieDialog({ target: get(NPC2) }))),
    playerClickedDisguised: await as(PLAYER, () => html(new TieDialog({ clicked: get(NPC), clickedToken: canvas.tokens.get("zzRbTokNpc000001") }))),
    nobodyFresh: await as(NOBODY, () => html(new TieDialog({}))),
    nobodyWithTarget: await as(NOBODY, () => html(new TieDialog({ target: get(NPC) }))),
  };
  pinJSON("app-tie-dialog-states-html", states, import.meta.url);
});

test("ties-ui-M12: _renderHTML is assembled from private builders, not one long template", () => {
  const src = readFileSync(new URL("../tie-dialog.mjs", import.meta.url), "utf8");
  for (const name of ["#sourcePickerHTML", "#targetPickerHTML", "#statusHTML", "#fieldsHTML"]) {
    assert.ok(new RegExp(`^  ${name}\\(`, "m").test(src), `tie-dialog.mjs defines the private builder ${name}`);
  }
  const lines = src.split("\n");
  const start = lines.findIndex(l => /^  async _renderHTML\(/.test(l));
  assert.ok(start >= 0, "_renderHTML is defined");
  const end = lines.findIndex((l, i) => i > start && l === "  }");
  const length = end - start + 1;
  assert.ok(length <= 60, `_renderHTML is ${length} lines; the split keeps it to 60 or fewer`);
});
