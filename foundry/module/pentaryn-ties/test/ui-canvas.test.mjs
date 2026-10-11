/**
 * Characterisation (ties checkpoint, wave 3): the canvas half as a GM — keys 8 and 7 (overlay.mjs)
 * and the cards they raise (popups.mjs: show, drag-to-pin, close, closeAll, restore), the wires and
 * the worn badges painted on a recording PIXI, the worn mark (worn.mjs: read/set/clear and its
 * dialog), the description card on key 9 (describe.mjs) and the item marks (item-marks.mjs).
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el, serialise } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const FAR = "zzFar00000000001";
const AWAY = "zzAway0000000001";
const STRANGER = "zzStranger000001";
const PLAYER = "zzPlayerUser0001";

const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      flags: {
        "pentaryn-ties": {
          ties: [
            { id: NPC, word: "debtor", notes: "Owes forty crowns.", stance: -1, strength: 4 },
            { id: FAR, word: "", notes: "", stance: 2, strength: 5 },
            { id: AWAY, word: "old friend", stance: 1, strength: 2 },
          ],
        },
      },
      system: { details: { biography: { value: "<p>A careful man.</p>" } } },
    },
    { id: NPC, name: "ZZ Brakka", system: { details: { biography: { value: "", public: "<p>Public face.</p>" } } } },
    { id: FAR, name: "ZZ Faraway" },
    { id: AWAY, name: "ZZ Away" },
    { id: STRANGER, name: "ZZ Stranger", items: [{ id: "zzItemMark000001", name: "Fire Bolt", flags: { "pentaryn-ties": { mark: { icon: "fa-fire", tip: "Burns hotter", color: "#ff7a1a" } } } }, { id: "zzItemPlain00001", name: "Rope" }] },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, x: 0, y: 0 },
    { id: "zzTokNpc00000001", actorId: NPC, x: 100, y: 0 },
    { id: "zzTokFar00000001", actorId: FAR, x: 1000, y: 0, isVisible: false },
    { id: "zzTokStr00000001", actorId: STRANGER, x: 200, y: 200 },
  ],
});
const T = () => game.pentaryn.ties;
const tok = id => canvas.tokens.get(id);
const cards = () => serialise(document.getElementById("pentaryn-ties-cards") ?? el("none"));
const step = async (label, fn) => {
  const mark = F.calls.length;
  const p0 = F.pixi.length;
  const out = await settle(Promise.resolve().then(fn));
  return { label, out: out === undefined ? null : out, calls: F.calls.slice(mark).filter(c => !c.op.startsWith("Hooks.")), pixi: F.pixi.length - p0, cards: cards() };
};

test("key 8 (showAll): every visible tie as a card, the GM told who is unseen; again is the toggle-off", async () => {
  const rows = [];
  canvas.tokens.hover = tok("zzTokPc000000001");
  rows.push(await step("hover the PC, press 8", () => T().show()));
  rows.push(await step("press 8 again (toggle off)", () => T().showAll()));
  rows.push(await step("press 8 once more", () => T().cards()));
  canvas.tokens.hover = tok("zzTokStr00000001");
  rows.push(await step("hover someone with no ties", () => T().show()));
  canvas.tokens.hover = null;
  rows.push(await step("hover nothing (sweeps what is up)", () => T().show()));
  rows.push(await step("hover nothing, nothing up", () => T().show()));
  pinJSON("canvas-key8", rows, import.meta.url);
});

test("key 7 (showOne): selected → hovered, one card; again closes; the refusals", async () => {
  const rows = [];
  canvas.tokens.controlled = [];
  rows.push(await step("nothing selected", () => T().showOne()));
  canvas.tokens.controlled = [tok("zzTokPc000000001")];
  canvas.tokens.hover = tok("zzTokNpc00000001");
  rows.push(await step("PC selected, NPC hovered", () => T().showOne()));
  rows.push(await step("again (closes)", () => T().showOne()));
  canvas.tokens.hover = tok("zzTokStr00000001");
  rows.push(await step("hovering someone with no tie (GM: named)", () => T().showOne()));
  canvas.tokens.hover = tok("zzTokPc000000001");
  rows.push(await step("hovering yourself", () => T().showOne()));
  canvas.tokens.hover = null;
  rows.push(await step("hovering nothing", () => T().showOne()));
  canvas.tokens.controlled = [];
  pinJSON("canvas-key7", rows, import.meta.url);
});

test("cards: drag past 4 px pins and saves; a short press does not; close removes and saves; closeAll; clear", async () => {
  const rows = [];
  canvas.tokens.hover = tok("zzTokPc000000001");
  rows.push(await step("press 8", () => T().show()));
  const layer = document.getElementById("pentaryn-ties-cards");
  const [first, second] = layer.children;
  rows.push(await step("short press on the first card (3 px)", async () => {
    await first.dispatch("pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await first.dispatch("pointermove", { clientX: 12, clientY: 12 });
    await first.dispatch("pointerup", {});
  }));
  rows.push(await step("drag the first card 50 px (pins)", async () => {
    await first.dispatch("pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await first.dispatch("pointermove", { clientX: 60, clientY: 10 });
    await first.dispatch("pointerup", {});
  }));
  rows.push(await step("right-button press does nothing", () => second.dispatch("pointerdown", { button: 2, clientX: 0, clientY: 0 })));
  rows.push(await step("wires painted (one frame)", () => F.flushFrames()));
  rows.push(await step("press 8 again: the transient one goes, the pinned one stays", () => T().show()));
  rows.push(await step("press 8 once more: only the unpinned are new", () => T().show()));
  rows.push(await step("canvasPan reflows, canvasTearDown sweeps the transient", () => {
    F.fire("canvasPan");
    F.fire("canvasTearDown");
  }));
  rows.push(await step("close the pinned card with its ✕", () => layer.children[0]?.children.at(-1)?.dispatch("click")));
  rows.push(await step("press 8, then closeAll", async () => {
    T().show();
    T().closeAllCards();
  }));
  rows.push(await step("press 8, then clear", async () => {
    T().show();
    T().clear();
  }));
  canvas.tokens.hover = null;
  pinJSON("canvas-cards", rows, import.meta.url);
  pinJSON("canvas-pixi", F.pixi, import.meta.url);
});

test("worn: read / set / clear on a token, the dialog's three answers, the badge layer", async () => {
  const doc = tok("zzTokNpc00000001").document;
  const rows = [];
  rows.push(await step("readWorn: nothing", () => T().worn(doc)));
  rows.push(await step("setWorn", () => T().setWorn(doc, { by: "  Ozmandius  ", note: "Wears Brakka tonight." })));
  rows.push(await step("readWorn", () => T().worn(tok("zzTokNpc00000001"))));
  rows.push(await step("setWorn with nothing clears", () => T().setWorn(doc, { by: " ", note: "" })));
  F.dialogs.push({ by: "Oz", note: "" });
  rows.push(await step("wornDialog → set", () => T().wornDialog(doc)));
  F.dialogs.push("clear");
  rows.push(await step("wornDialog → clear", () => T().wornDialog(doc)));
  F.dialogs.push(null);
  rows.push(await step("wornDialog → cancel", () => T().wornDialog(doc)));
  await T().setWorn(doc, { by: "Oz", note: "inside" });
  rows.push(await step("updateToken with a flag change queues a badge paint; the frame paints it", () => {
    F.fire("updateToken", doc, { flags: { "pentaryn-ties": { worn: {} } } });
    F.fire("updateToken", doc, { x: 5 });
    return F.flushFrames();
  }));
  rows.push(await step("worn line on a GM card", () => {
    canvas.tokens.controlled = [tok("zzTokPc000000001")];
    canvas.tokens.hover = tok("zzTokNpc00000001");
    T().showOne();
  }));
  T().closeAllCards();
  canvas.tokens.controlled = [];
  canvas.tokens.hover = null;
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  rows.push(await step("player: setWorn / clearWorn / wornDialog refused", async () => [await T().setWorn(doc, { by: "x" }), await T().clearWorn(doc), await T().wornDialog(doc)]));
  game.user = gm;
  rows.push(await step("clearWorn", () => T().clearWorn(doc)));
  rows.push(await step("readWorn junk", () => [T().worn(null), T().worn({ getFlag: () => { throw new Error("x"); } }), T().worn({ getFlag: () => ["array"] })]));
  pinJSON("canvas-worn", rows, import.meta.url);
});

test("key 9 (describe): open, same face closes, another face swaps, nothing hovered warns; the window's own key closes it", async () => {
  const rows = [];
  canvas.tokens.hover = tok("zzTokPc000000001");
  rows.push(await step("hover PC, press 9", async () => (await T().describe())?.id ?? null));
  rows.push(await step("press 9 again (same face: close)", async () => (await T().describe())?.id ?? null));
  rows.push(await step("press 9 (open)", async () => (await T().describe())?.id ?? null));
  canvas.tokens.hover = tok("zzTokNpc00000001");
  rows.push(await step("hover NPC (public bio only), press 9 (swap)", async () => (await T().describe())?.id ?? null));
  canvas.tokens.hover = null;
  rows.push(await step("hover nothing, press 9 (closes)", async () => (await T().describe())?.id ?? null));
  rows.push(await step("hover nothing, press 9 (warns)", async () => (await T().describe())?.id ?? null));
  canvas.tokens.hover = tok("zzTokNpc00000001");
  rows.push(await step("open, then closeDescription", async () => {
    await T().describe();
    await T().closeDescription();
  }));
  canvas.tokens.hover = null;
  pinJSON("canvas-describe", rows, import.meta.url);
});

test("item marks: an icon after a marked item's name, once; unmarked rows untouched", () => {
  const row = (id, name) => el("li", { dataset: { itemId: id }, children: [el("div", { className: "name", children: [el("span", { className: "title", children: [] })] })] });
  const root = el("ol", { children: [row("zzItemMark000001"), row("zzItemPlain00001"), row("zzNoSuchItem0001")] });
  const app = { actor: game.actors.get(STRANGER) };
  F.fire("renderBaseActorSheet", app, root);
  F.fire("renderBaseActorSheet", app, root);
  F.fire("renderBaseActorSheet", { actor: null }, root);
  assert.deepEqual(F.hookErrors, []);
  pinJSON("canvas-item-marks", serialise(root), import.meta.url);
});
