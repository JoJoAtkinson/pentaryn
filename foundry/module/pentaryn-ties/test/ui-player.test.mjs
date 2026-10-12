/**
 * Characterisation (ties checkpoint, wave 3): the player's side — the Look window (look.mjs: who may
 * open it, what it draws from the granted map and the secrecy gate, the no-repaint rule and its
 * live refresh), keys 8 and 7 for a player (only what their token can see; nobody named), the Known
 * data API (known.mjs: read/add/set/hide/remove/notebook/file/open, the add picker), and a player's
 * tie dialog Save (their side written, the reverse asked of the GM). Frozen once committed.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el, serialise } from "./fixtures/dom.mjs";
import { exercise } from "./fixtures/ui.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const HIDDEN = "zzHidden00000001";
const KIND = "zzKind0000000001";
const OTHER = "zzOther000000001";
const PLAYER = "zzPlayerUser0001";
const W = 1_700_000_000_000;

const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: true, reveal: "<p>From Vel.</p>", lore: [{ id: "c1", label: "Walls", dc: 11, skill: "his", text: "<p>Three rings.</p>" }] },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city", secret: true, reveal: "<p>Guild hands.</p>" },
];

const F = await bootWorld({
  user: { id: PLAYER, name: "ZZ Player", isGM: false },
  users: [{ id: "zzGmUser00000001", name: "ZZ GM", isGM: true, active: true }],
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      ownership: { default: 0, [PLAYER]: 3 },
      flags: {
        "pentaryn-ties": {
          ties: [{ id: NPC, word: "debtor", notes: "Owes forty.", stance: -1, strength: 4 }, { id: HIDDEN, word: "shadow", stance: -2, strength: 5 }],
          known: [{ id: NPC, name: "ZZ Brakka", category: "sentient", notes: "Salt.", when: W }],
          granted: {
            "attr:city:#id": { text: "From Vel.", when: W, icon: null, source: "Vel" },
            "attr:guild:#id": { text: "Guild hands.", when: W, icon: null, source: "Salt Guild" },
            "attr:city:c1": { text: "Three rings.", when: W, icon: null, source: "Vel — Walls" },
            [`lore:${NPC}:l1`]: { text: "He owes the guild.", when: W, icon: null, source: "Debts" },
            [`kind:${KIND}`]: { text: "Grey hunters.", when: W, icon: null, source: "ZZ Ghoul" },
            [`lore:${NPC}:#idmiss-guild`]: { text: "Salt on his cuffs.", when: W, icon: null, source: "ZZ Brakka" },
          },
        },
      },
    },
    { id: KIND, name: "ZZ Ghoul", isOwner: false, ownership: { default: 1 } },
    {
      id: NPC,
      name: "ZZ Brakka",
      ownership: { default: 1 },
      flags: {
        "pentaryn-ties": {
          kindOf: KIND,
          attributes: ["city", "guild"],
          lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>He owes the guild.</p>" }],
          // Vel is identified and released; the guild is not (its grant must not draw here)
          beliefs: { [PC]: { "attr:city:#id": { text: "From Vel.", total: 15, when: W, delivered: W } } },
        },
      },
    },
    { id: HIDDEN, name: "ZZ Hidden", ownership: { default: 1 } },
    { id: OTHER, name: "ZZ Other", ownership: { default: 1 } },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, isOwner: true },
    { id: "zzTokNpc00000001", actorId: NPC, x: 100 },
    { id: "zzTokHid00000001", actorId: HIDDEN, x: 200, isVisible: false },
    { id: "zzTokOth00000001", actorId: OTHER, x: 300 },
  ],
});
game.user.character = game.actors.get(PC);
const T = () => game.pentaryn.ties;
const get = id => game.actors.get(id);
const tok = id => canvas.tokens.get(id);
const { LookWindow, openLook } = await import("../look-app.mjs");
const Known = await import("../known-ui.mjs");
const { TieDialog } = await import("../tie-dialog.mjs");
const step = async (label, fn) => {
  const mark = F.calls.length;
  const c0 = F.console.length;
  const out = await settle(Promise.resolve().then(fn));
  return { label, out: out ?? null, calls: F.calls.slice(mark).filter(c => !c.op.startsWith("Hooks.")), console: F.console.slice(c0) };
};
const cardsLayer = () => serialise(document.getElementById("pentaryn-ties-cards") ?? el("none"));

test("Look window: who may open it; one per pair", async () => {
  const name = w => w?.constructor?.name ?? null;
  const rows = {};
  rows.self = name(openLook(get(PC), get(PC)));
  rows.noSubject = name(openLook(get(PC), null));
  rows.notOwner = name(openLook(get(NPC), get(OTHER)));
  const a = openLook(get(PC), get(NPC));
  const b = openLook(get(PC), get(NPC));
  rows.opened = name(a);
  rows.same = a === b;
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  rows.accessOff = name(openLook(get(PC), get(OTHER)));
  await game.settings.set("pentaryn-ties", "playerAccess", true);
  const gm = game.user;
  game.user = game.users.get("zzGmUser00000001");
  rows.gm = name(LookWindow.open(get(PC), get(NPC)));
  let threw = null;
  try {
    new LookWindow(get(PC), get(NPC));
  } catch (err) {
    threw = err.message;
  }
  rows.gmConstruct = threw;
  game.user = gm;
  pinJSON("player-look-open", rows, import.meta.url);
});

test("Look window: the cards it draws (granted only; the guild gated; the miss line under its rung)", async () => {
  const w = new LookWindow(get(PC), get(NPC));
  const empty = new LookWindow(get(PC), get(OTHER));
  pinJSON("player-look-html", { title: w.title, npc: w.buildHTML(), other: empty.buildHTML() }, import.meta.url);
});

test("Look window: _replaceHTML paints once per change; live refresh on the character's flags only", async () => {
  const w = new LookWindow(get(PC), get(NPC));
  const content = el("section");
  const html = await w._renderHTML();
  w._replaceHTML(html, content);
  const first = content.innerHTML.length;
  content.innerHTML = "<p>marker</p>";
  w._replaceHTML(html, content); // same string, a child present: no write
  const kept = content.innerHTML;
  w.rendered = true;
  w._onFirstRender({}, {});
  const mark = F.calls.length;
  F.fire("updateActor", get(OTHER), { flags: { "pentaryn-ties": { x: 1 } } });
  mock.timers.tick(200);
  const unrelated = F.calls.slice(mark).length;
  await get(PC).update({ "flags.pentaryn-ties.granted.zzNew": { text: "New.", when: W } });
  mock.timers.tick(200);
  await settle(Promise.resolve());
  const noVisibleChange = F.calls.slice(mark).filter(c => c.op === "app.render").length;
  const m2 = F.calls.length;
  await get(PC).update({ [`flags.pentaryn-ties.granted.lore:${NPC}:l1`]: _del });
  mock.timers.tick(200);
  await settle(Promise.resolve());
  const changed = F.calls.slice(m2).filter(c => c.op === "app.render").length;
  const m3 = F.calls.length;
  F.fire("deleteActor", get(NPC));
  const closedOnDelete = F.calls.slice(m3).filter(c => c.op === "app.close").length;
  w._onClose({});
  pinJSON("player-look-live", { first, kept, unrelated, noVisibleChange, changed, closedOnDelete }, import.meta.url);
});

test("keys 8 and 7 as a player: own token only, only what they can see, nobody named", async () => {
  const rows = [];
  canvas.tokens.hover = null;
  rows.push(await step("8 with nothing hovered: falls to their one owned token", () => T().show()));
  rows.push({ ...(await step("the cards", () => null)), cards: cardsLayer() });
  T().clear();
  canvas.tokens.hover = tok("zzTokNpc00000001");
  rows.push(await step("8 hovering the NPC (not theirs)", () => T().show()));
  canvas.tokens.hover = tok("zzTokHid00000001");
  rows.push(await step("7 hovering a token they cannot see", () => T().showOne()));
  canvas.tokens.hover = tok("zzTokOth00000001");
  rows.push(await step("7 hovering someone with no tie (not named)", () => T().showOne()));
  canvas.tokens.hover = tok("zzTokNpc00000001");
  rows.push(await step("7 hovering the NPC (their sole token is the source)", () => T().showOne()));
  T().closeAllCards();
  const pc = get(PC);
  const saved = pc.flags["pentaryn-ties"].ties;
  pc.flags["pentaryn-ties"].ties = [{ id: HIDDEN, word: "shadow" }];
  canvas.tokens.hover = tok("zzTokPc000000001");
  rows.push(await step("8 when every tie is out of sight", () => T().show()));
  pc.flags["pentaryn-ties"].ties = saved;
  canvas.tokens.hover = null;
  pinJSON("player-keys", rows, import.meta.url);
});

test("Known data API as a player: read, add, set, hide, remove, categories, notebook, file, open", async () => {
  const rows = [];
  rows.push(await step("readKnown(PC)", () => T().known.read(get(PC))));
  rows.push(await step("readKnown(null)", () => T().known.read(null)));
  rows.push(await step("add OTHER", () => T().known.add(get(PC), get(OTHER))));
  rows.push(await step("add OTHER again (already filed)", () => T().known.add(get(PC), OTHER)));
  rows.push(await step("add self", () => T().known.add(get(PC), PC)));
  rows.push(await step("add to an actor they do not own", () => T().known.add(get(NPC), get(OTHER))));
  rows.push(await step("set notes", () => T().known.set(get(PC), OTHER, "notes", "Quiet type.")));
  rows.push(await step("set a field that is not settable", () => T().known.set(get(PC), OTHER, "when", 5)));
  rows.push(await step("set on a missing entry", () => T().known.set(get(PC), "zzNobody00000001", "notes", "x")));
  rows.push(await step("hide OTHER", () => T().known.hide(get(PC), OTHER)));
  rows.push(await step("hide missing", () => T().known.hide(get(PC), "zzNobody00000001")));
  rows.push(await step("purge OTHER", () => T().known.purge(get(PC), OTHER)));
  rows.push(await step("remove missing", () => T().known.remove(get(PC), OTHER)));
  rows.push(await step("categories", () => T().known.categories(get(PC))));
  rows.push(await step("notebook (assigned character)", () => T().known.notebook()?.id ?? null));
  canvas.tokens.hover = tok("zzTokHid00000001");
  rows.push(await step("file a token they cannot see", () => T().known.file()));
  canvas.tokens.hover = tok("zzTokPc000000001");
  rows.push(await step("file themselves", () => T().known.file()));
  rows.push(await step("file OTHER's token", () => T().known.file(tok("zzTokOth00000001"))));
  rows.push(await step("file the NPC (already filed: opens it)", () => T().known.file(tok("zzTokNpc00000001"))));
  rows.push(await step("open entry", () => T().known.open(get(PC), NPC)));
  game.user.character = null;
  canvas.tokens.controlled = [];
  const owned = canvas.tokens.placeables;
  canvas.tokens.placeables = [];
  rows.push(await step("no notebook to write in", () => T().known.file(tok("zzTokOth00000001"))));
  canvas.tokens.placeables = owned;
  game.user.character = get(PC);
  canvas.tokens.hover = null;
  pinJSON("player-known-api", rows, import.meta.url);
});

test("Known add picker: candidates, a pick, a cancel, nothing left", async () => {
  const rows = [];
  await T().known.purge(get(PC), OTHER);
  F.dialogs.push(OTHER);
  rows.push(await step("pick OTHER", async () => (await T().known.picker(get(PC), () => F.calls.push({ op: "onAdded" })))?.id ?? null));
  F.dialogs.push(null);
  rows.push(await step("cancel", () => T().known.picker(get(PC))));
  F.dialogs.push(OTHER);
  rows.push(await step("pick someone already filed", () => T().known.picker(get(PC))));
  pinJSON("player-known-picker", rows, import.meta.url);
});

test("tie dialog as a player: Save writes their own side and asks the GM for the reverse", async () => {
  const make = () => new TieDialog({ clicked: get(NPC), clickedToken: tok("zzTokNpc00000001") });
  const d = make();
  pinJSON("player-tie-dialog", { title: d.title, source: d.source?.id ?? null, target: d.target?.id ?? null, html: await d._renderHTML() }, import.meta.url);
  const mount = async () => {
    const app = make();
    const content = el("section");
    app.element = content;
    app._replaceHTML(await app._renderHTML(), content);
    return content;
  };
  pinJSON("player-tie-dialog-controls", await exercise(F, mount), import.meta.url);
  assert.ok(F.calls.some(c => c.op === "socket.emit" && c.args[1]?.action === "mirror-reverse"));
});
