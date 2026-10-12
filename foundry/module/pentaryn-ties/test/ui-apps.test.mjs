/**
 * Characterisation (ties checkpoint, wave 3): the four GM windows — TieDialog (tie-dialog.mjs), the
 * standalone TiesEditor (editor.mjs), the Inspect preview (preview.mjs, both modes, dice on a seeded
 * Math.random) and the Attribute Review panel (review-ui.mjs) — each rendered through its own
 * `_renderHTML` / `_replaceHTML` into the fake DOM, its markup pinned, then every bound control
 * pressed (fixtures/ui.mjs). Plus their static `open` paths and the dialog's candidate lists.
 * Frozen once committed.
 */
import { test, mock } from "node:test";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";
import { exercise } from "./fixtures/ui.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const NPC = "zzNpc00000000001";
const KIND = "zzKind0000000001";
const PLAYER = "zzPlayerUser0001";
const W = 1_700_000_000_000;

const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: true, dc: 12, skill: "his", reveal: "<p>From Vel.</p>", miss: "<p>An accent.</p>", lore: [{ id: "c1", label: "Walls", dc: 11, skill: "his", text: "<p>Three rings.</p>", miss: "" }], createdAt: 1, modifiedAt: 2, reviewedAt: 3, touched: [], reviewedSnapshot: { title: "Vel", dc: 12 } },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city", secret: true, dc: 15, skill: "inv", reveal: "<p>Guild hands.</p>", touched: ["dc"], modifiedAt: 5 },
  { id: "diary", title: "Caven's diary", category: "personal", secret: true, reveal: "<p>Kept a diary.</p>" },
];

const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false, character: null }],
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 }, system: { skills: { his: { total: 5 }, inv: { total: 2 } } }, flags: { "pentaryn-ties": { attributes: ["diary"], ties: [{ id: NPC, word: "debtor", notes: "Owes.", stance: -1, strength: 4 }], granted: { "attr:city:#id": { text: "From Vel.", when: W, icon: null, source: "Vel" } } } } },
    { id: PC2, name: "ZZ Wren", type: "character" },
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" }, biography: { value: "<p>Grey hunters.</p>" } } } },
    {
      id: NPC,
      name: "ZZ Brakka",
      flags: {
        "pentaryn-ties": {
          kindOf: KIND,
          attributes: ["city", "guild"],
          ties: [{ id: PC, word: "mark", notes: "Their side.", stance: 1, strength: 2 }],
          lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>He owes the guild.</p>", miss: "<p>Shifty.</p>" }],
          beliefs: { [PC]: { "attr:city:#id": { text: "<p>From Vel.</p>", total: 15, when: W, delivered: W } } },
        },
      },
    },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC },
    { id: "zzTokNpc00000001", actorId: NPC },
  ],
});
game.users.get(PLAYER).character = game.actors.get(PC);
const get = id => game.actors.get(id);
const { TieDialog, sourceCandidates, targetCandidates } = await import("../tie-dialog.mjs");
const { TiesEditor } = await import("../editor.mjs");
const { InspectPreview } = await import("../preview-app.mjs");
const { AttributeReview } = await import("../review-ui.mjs");

/** A deterministic Math.random for the preview's dice. */
const seedRandom = () => {
  let s = 12345;
  mock.method(Math, "random", () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648));
};

/** Mount a fresh app from `make()`: render its HTML, replace into a new content element (its `element`). */
const mountApp = make => async () => {
  const app = make();
  const content = el("section", { className: "window-content" });
  app.element = content;
  const html = await app._renderHTML({}, {});
  app._replaceHTML(html, content, {});
  return content;
};

test("TieDialog: candidates, construction from a clicked token, from a sheet, as a player", async () => {
  const ids = list => list.map(c => c.actor?.id ?? c.id);
  const fromToken = new TieDialog({ clicked: get(NPC), clickedToken: canvas.tokens.get("zzTokNpc00000001") });
  const fromSheet = new TieDialog({ source: get(PC), target: get(NPC) });
  const fresh = new TieDialog({});
  const shape = d => ({ title: d.title, source: d.source?.id ?? null, target: d.target?.id ?? null, sourceLocked: d.sourceLocked, targetLocked: d.targetLocked, targetScope: d.targetScope, sourceOptions: ids(d.sourceOptions()), existing: d.existing(), reverse: d.reverse() });
  const gm = { sources: ids(sourceCandidates()), targetsScene: ids(targetCandidates(PC, "scene")), targetsAll: ids(targetCandidates(PC, "all")), fromToken: shape(fromToken), fromSheet: shape(fromSheet), fresh: shape(fresh) };
  const gmUser = game.user;
  game.user = game.users.get(PLAYER);
  const player = { sources: ids(sourceCandidates()), targetsScene: ids(targetCandidates(PC, "scene")), fromOwnToken: shape(new TieDialog({ clicked: get(PC) })) };
  game.user = gmUser;
  pinJSON("app-tie-dialog-state", { gm, player }, import.meta.url);
});

test("TieDialog: markup and every control (Save writes both sides)", async () => {
  const make = () => new TieDialog({ source: get(PC), target: get(NPC) });
  pinJSON("app-tie-dialog-html", await make()._renderHTML(), import.meta.url);
  pinJSON("app-tie-dialog-controls", await exercise(F, mountApp(make)), import.meta.url);
});

test("TieDialog.open: one dialog, re-pointed", async () => {
  const mark = F.calls.length;
  const a = await TieDialog.open({ source: get(PC), target: get(NPC) });
  const b = await TieDialog.open({ clicked: get(PC2) });
  pinJSON("app-tie-dialog-open", { same: a === b, target: b.target?.id ?? null, source: b.source?.id ?? null, calls: F.calls.slice(mark) }, import.meta.url);
  await a.close();
});

test("TiesEditor: title, markup, every control; open twice is one window", async () => {
  const ed = new TiesEditor(get(NPC));
  pinJSON("app-editor", { title: ed.title, html: await ed._renderHTML() }, import.meta.url);
  pinJSON("app-editor-controls", await exercise(F, mountApp(() => new TiesEditor(get(NPC)))), import.meta.url);
  const a = await TiesEditor.open(get(PC));
  const b = TiesEditor.open(get(PC));
  pinJSON("app-editor-open", { same: a === b, none: TiesEditor.open(null) }, import.meta.url);
});

test("InspectPreview: player view and the dice bench (seeded), every control", async () => {
  seedRandom();
  const pv = new InspectPreview(get(NPC));
  const player = await pv._renderHTML();
  pv.mode = "simulate";
  const simulate = await pv._renderHTML();
  pv.roller = PC;
  const asPc = await pv._renderHTML();
  pinJSON("app-preview", { title: pv.title, rollers: pv.rollerOptions(), player, simulate, asPc }, import.meta.url);
  pinJSON("app-preview-controls", await exercise(F, mountApp(() => new InspectPreview(get(NPC)))), import.meta.url);
  const sim = () => Object.assign(new InspectPreview(get(NPC)), { mode: "simulate" });
  pinJSON("app-preview-sim-controls", await exercise(F, mountApp(sim)), import.meta.url);
  mock.restoreAll();
});

test("AttributeReview: markup and every control", async () => {
  const made = [];
  const make = () => {
    const rv = new AttributeReview();
    made.push(rv);
    return rv;
  };
  pinJSON("app-review-html", await make()._renderHTML(), import.meta.url);
  pinJSON("app-review-controls", await exercise(F, mountApp(make)), import.meta.url);
  // every row open: the detail editors' own saves
  const open = () => Object.assign(make(), { expanded: new Set(["city", "guild", "diary"]), tab: "world" });
  pinJSON("app-review-open-html", await open()._renderHTML(), import.meta.url);
  pinJSON("app-review-open-controls", await exercise(F, mountApp(open)), import.meta.url);
  for (const rv of made) await rv._onClose?.({});
});

test("open paths refuse a player: preview, review", async () => {
  const mark = F.calls.length;
  const gmUser = game.user;
  game.user = game.users.get(PLAYER);
  const rows = { preview: InspectPreview.open(get(NPC)), review: AttributeReview.open() };
  game.user = gmUser;
  rows.previewNoSubject = InspectPreview.open(null); // ties-ui-M9: null itself; the warning is in rows.calls
  rows.calls = F.calls.slice(mark);
  pinJSON("app-open-refusals", rows, import.meta.url);
});
