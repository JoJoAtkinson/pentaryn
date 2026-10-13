// Glue: boot the real entry on the stub, then pin EFFECTS — the published surface, settings,
// the teleport-dialog cards, the plain question, Teleport-as-default, the Region-config fieldset,
// the snapshot crop, and the console texts. Characterisation of 0.4.4: unchanged code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { surfaceOf } from "../lib/api.mjs";
import { boot, console$, MODULE, P1, GM } from "./fixtures/world.mjs";
import { places, teleportDialog } from "./fixtures/places.mjs";

const { F, S, W } = await boot();
const publishedAtReady = game.pentaryn?.portals;   // D-P1: boot() fired ready; nothing ticked yet
await W.tick();
const P = places(W);

const warns = since => console$.slice(since).map(([level, text]) => [level, text]);

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("publish [declared D-P1]: at ready itself, frozen, on module.api and game.pentaryn.portals, with the kit members", () => {
  assert.ok(publishedAtReady, "published synchronously at ready (no setTimeout)");
  assert.equal(game.pentaryn.portals, publishedAtReady);
  assert.equal(game.modules.get(MODULE).api, game.pentaryn.portals);
  const keys = Object.keys(game.pentaryn.portals);   // the exact list is api.test's golden/surface.json
  for (const k of ["cardFor", "contract", "describe", "lookAt", "open", "redraw", "settings", "snapshot", "spreadArrival", "teleportParty",
    "trace", "uninstall", "version"]) assert.ok(keys.includes(k), k);
  assert.equal(Object.isFrozen(game.pentaryn.portals), true);
});

test("the legacy surface is kept: its seven members equal golden/surface-legacy.json", () => {
  const legacy = ["snapshot", "cardFor", "teleportParty", "lookAt", "open", "redraw", "spreadArrival"];
  pinJSON("surface-legacy", Object.fromEntries(Object.entries(surfaceOf(game.pentaryn.portals)).filter(([k]) => legacy.includes(k))), import.meta.url);
});

// [declared] D-P2 / -29 (Wave 7 batch, Joe 2026-10-12), flipped from "plain English": the three rows
// register PENTARYN_PORTALS.Setting.<key>.Name/Hint keys (lang/en.json carries the same English).
test("settings: three world Boolean rows registered at init, lang keys as labels (golden/settings-register.json)", () => {
  const rows = [...game.settings.settings.values()].filter(s => s.namespace === MODULE);
  pinJSON("settings-register", rows.map(r => ({ ...r, type: r.type?.name })), import.meta.url);
  assert.deepEqual(rows.map(r => r.key), ["teleportDefault", "spreadArrivals", "confirmPartyTeleport"]);
});

test("setting(): reads the store; an unregistered key falls back to the row default (true)", async () => {
  await game.settings.set(MODULE, "teleportDefault", false);
  assert.equal(S.setting("teleportDefault"), false);
  await game.settings.set(MODULE, "teleportDefault", true);
  for (const key of ["teleportDefault", "spreadArrivals", "confirmPartyTeleport"]) {
    const id = `${MODULE}.${key}`;
    const row = game.settings.settings.get(id);
    game.settings.settings.delete(id);
    assert.equal(S.setting(key), true, key);
    game.settings.settings.set(id, row);
  }
  assert.equal(S.setting("nope"), undefined);
});

/* ── cardFor / cardHTML ───────────────────────────────────────────────── */

test("cardFor: flags trimmed; fallbacks title → navName → scene name → region name; img → thumb → door icon", () => {
  assert.deepEqual(S.cardFor(P.pitGate), {
    uuid: P.pitGate.uuid, title: "The Fighting Pit", img: "cards/pit.webp?v=abc", description: "Sand, <script>alert(1)</script>\nand cheering.",
  });
  assert.deepEqual(S.cardFor(P.stair), { uuid: P.stair.uuid, title: "Fighting Pit", img: "thumbs/pit.webp", description: "" });
  assert.deepEqual(S.cardFor(P.cell), { uuid: P.cell.uuid, title: "Drow Prison", img: "icons/svg/door-exit.svg", description: "" });
  const loose = { uuid: "Region.loose", name: "Loose", flags: { [MODULE]: { title: "   ", img: "  ", description: "  " } } };
  assert.deepEqual(S.cardFor(loose), { uuid: "Region.loose", title: "Loose", img: "icons/svg/door-exit.svg", description: "" });
});

test("cardFor(null) → null [declared D-P5] (it threw a TypeError)", () => {
  assert.equal(S.cardFor(null), null);
  assert.equal(game.pentaryn.portals.cardFor(undefined), null);
});

test("cardHTML: plain and radio output, escaped, byte for byte (golden/cards-html.json)", () => {
  const card = S.cardFor(P.pitGate);
  pinJSON("cards-html", {
    plain: S.cardHTML(card),
    radio: S.cardHTML(card, { radio: true }),
    radioChecked: S.cardHTML(card, { radio: true, checked: true }),
    noDescription: S.cardHTML(S.cardFor(P.stair)),
  }, import.meta.url);
  assert.ok(!S.cardHTML(card).includes("<script>"));
  assert.ok(S.cardHTML(card).includes("&lt;script&gt;alert(1)&lt;/script&gt;<br>and cheering."));
});

/* ── behaviorOf ───────────────────────────────────────────────────────── */

test("behaviorOf: the core dialog id dialog-<behaviorUuid>-<tokenId> → the teleport behavior, else null", () => {
  assert.equal(S.behaviorOf({ id: `dialog-${P.bPassage.uuid}-${P.caven.id}` }), P.bPassage);
  assert.equal(S.behaviorOf({ id: `dialog-${P.bPassage.uuid}` }), null, "no token suffix: the uuid loses its last segment");
  assert.equal(S.behaviorOf({ id: "dialog-abc-def" }), null);
  assert.equal(S.behaviorOf({ id: `prompt-${P.bPassage.uuid}-x` }), null);
  assert.equal(S.behaviorOf({}), null);
  assert.equal(S.behaviorOf(null), null);
  const other = W.behavior(P.cell, { id: "BhvCellOther0001", type: "executeScript" });
  assert.equal(S.behaviorOf({ id: `dialog-${other.uuid}-x` }), null);
  P.cell.behaviors.delete(other.id);
});

/* ── the teleport dialog ──────────────────────────────────────────────── */

test("decorate: one revealed destination → one card appended, the question names the token and the card (golden)", () => {
  const { app, root } = teleportDialog(W, P.bPassage, P.caven.id);
  const n = F.calls.length;
  S.decorate(app, root);
  assert.equal(root.querySelectorAll(".ppt-cards").length, 1);
  assert.ok(root.classList.contains("ppt-dialog"));
  assert.equal(root.querySelector(".dialog-content > p").textContent, "Teleport Caven to The Fighting Pit?");
  assert.deepEqual(W.callsSince(n, ["setPosition"]).map(c => c.p), [{ width: 460, height: "auto" }]);
  pinJSON("decorate-single", root.outerHTML, import.meta.url);
  S.decorate(app, root);
  assert.equal(root.querySelectorAll(".ppt-cards").length, 1, "a second render adds nothing");
});

/** A jQuery wrapper as an AppV1 render hook hands it; the kit's htmlRoot unwraps only these (EXT-8). */
const jq = el => ({ jquery: "3.7.1", 0: el, length: 1 });

test("decorate: width keeps a wider dialog; a jQuery wrapper works too", () => {
  const { app, root } = teleportDialog(W, P.bPassage, P.caven.id);
  app.position.width = 700;
  const n = F.calls.length;
  S.decorate(app, jq(root));
  assert.deepEqual(W.callsSince(n, ["setPosition"]).map(c => c.p), [{ width: 700, height: "auto" }]);
});

test("decorate: a select of destinations becomes radio cards, the current value checked (golden)", () => {
  const dests = [...P.bFork.system.destinations];
  const { app, root } = teleportDialog(W, P.bFork, P.caven.id, { select: { options: [P.pitGate.uuid, P.cell.uuid], value: P.cell.uuid } });
  S.decorate(app, root);
  assert.equal(root.querySelector("select"), null);
  const radios = root.querySelectorAll('input[name="destination"]');
  assert.deepEqual(radios.map(r => [r.value, r.checked]), [[P.pitGate.uuid, false], [P.cell.uuid, true]]);
  assert.equal(dests[1].startsWith(".."), true, "the cell is stored relative and still resolves");
  assert.equal(root.querySelector(".dialog-content > p").textContent, "Teleport Caven to Passage → Pit in Drow City?", "several exits: question untouched");
  pinJSON("decorate-choice", root.outerHTML, import.meta.url);
});

test("decorate: an unrevealed destination stays untouched for a player; the GM gets the card", () => {
  const { app, root } = teleportDialog(W, P.bSecret, P.caven.id);
  const before = root.outerHTML;
  F.become({ userId: P1 });
  S.decorate(app, root);
  assert.equal(root.outerHTML, before);
  F.become({ userId: GM });
  S.decorate(app, root);
  assert.equal(root.querySelectorAll(".ppt-card").length, 1);
});

test("decorate: not a teleport dialog, no .dialog-content, or no resolvable destination → untouched", () => {
  const plain = W.doc.createElement("div");
  plain.innerHTML = `<div class="dialog-content"><p>Delete?</p></div>`;
  const before = plain.outerHTML;
  S.decorate({ id: "dialog-confirm-1" }, plain);
  assert.equal(plain.outerHTML, before);
  const { app } = teleportDialog(W, P.bPassage, P.caven.id);
  const bare = W.doc.createElement("div");
  S.decorate(app, bare);
  assert.equal(bare.outerHTML, "<div></div>");
  const ghost = W.behavior(P.cell, { id: "BhvGhost00000001", destinations: ["Scene.Nowhere.Region.None"] });
  const g = teleportDialog(W, ghost, P.caven.id);
  const gBefore = g.root.outerHTML;
  S.decorate(g.app, g.root);
  assert.equal(g.root.outerHTML, gBefore);
  P.cell.behaviors.delete(ghost.id);
});

test("plainQuestion: a GM-written dialog text is left alone; no token → 'Teleport to <title>?'; no <p> → nothing", () => {
  const card = S.cardFor(P.pitGate);
  const custom = W.behavior(P.cell, { id: "BhvCustom0000001", destinations: [P.pitGate.uuid], dialog: { revealed: "Step into the sand?", unrevealed: null } });
  const a = teleportDialog(W, custom, P.caven.id, { question: "Step into the sand?" });
  S.plainQuestion(a.app, custom, a.root.querySelector(".dialog-content"), card);
  assert.equal(a.root.querySelector("p").textContent, "Step into the sand?");
  const b = teleportDialog(W, P.bPassage, "TokNobody0000001");
  S.plainQuestion(b.app, P.bPassage, b.root.querySelector(".dialog-content"), card);
  assert.equal(b.root.querySelector("p").textContent, "Teleport to The Fighting Pit?");
  const content = W.doc.createElement("div");
  S.plainQuestion(b.app, P.bPassage, content, card);
  assert.equal(content.outerHTML, "<div></div>");
  P.cell.behaviors.delete(custom.id);
});

test("preferTeleport: Teleport gains autofocus, Don't Teleport loses it, focus on the next frame if still connected", async () => {
  const { app, root } = teleportDialog(W, P.bPassage, P.caven.id);
  W.doc.body.append(root);
  W.raf.length = 0;
  S.preferTeleport(app, root);
  const yes = root.querySelector('button[data-action="yes"]');
  const no = root.querySelector('button[data-action="no"]');
  assert.equal(yes.hasAttribute("autofocus"), true);
  assert.equal(no.hasAttribute("autofocus"), false);
  assert.equal(W.raf.length, 1);
  W.raf.shift()();
  assert.equal(W.doc.activeElement, yes);
  root.remove();
  W.doc.activeElement = null;
  S.preferTeleport(app, root);
  W.raf.shift()();
  assert.equal(W.doc.activeElement, null, "detached: no focus");
});

test("preferTeleport: setting off, a non-teleport dialog, or a disabled Teleport → nothing", async () => {
  const fresh = () => teleportDialog(W, P.bPassage, P.caven.id);
  await game.settings.set(MODULE, "teleportDefault", false);
  let d = fresh();
  let before = d.root.outerHTML;
  S.preferTeleport(d.app, d.root);
  assert.equal(d.root.outerHTML, before);
  await game.settings.set(MODULE, "teleportDefault", true);
  d = fresh();
  before = d.root.outerHTML;
  S.preferTeleport({ id: "dialog-other-1" }, d.root);
  assert.equal(d.root.outerHTML, before);
  d.root.querySelector('button[data-action="yes"]').disabled = true;
  before = d.root.outerHTML;
  S.preferTeleport(d.app, d.root);
  assert.equal(d.root.outerHTML, before);
  W.raf.length = 0;
});

test("renderDialogV2: decorate and focus both run; each failure warns its own text and the next still runs", () => {
  const { app, root } = teleportDialog(W, P.bPassage, P.caven.id);
  F.fire("renderDialogV2", app, root);
  assert.ok(root.querySelector(".ppt-cards"));
  assert.ok(root.querySelector('button[data-action="yes"]').hasAttribute("autofocus"));
  W.raf.length = 0;
  const broken = W.doc.createElement("div");
  broken.querySelector = () => { throw new Error("detached"); };
  const n = console$.length;
  const caught = F.hookErrors.length;
  F.fire("renderDialogV2", app, broken);
  assert.deepEqual(warns(n), [["warn", "pentaryn-portals | dialog decoration skipped"], ["warn", "pentaryn-portals | dialog focus skipped"]]);
  assert.equal(F.hookErrors.length, caught);
});

/* ── Region config ────────────────────────────────────────────────────── */

const configApp = (region, tabHTML = `<section class="tab region-appearance" data-tab="appearance"></section>`) => {
  const root = W.doc.createElement("form");
  root.innerHTML = tabHTML;
  return { app: { document: region, setPosition(p) { F.calls.push({ op: "setPosition", id: "config", p }); } }, root };
};

test("injectConfig as GM: the Portal card fieldset (golden), once; the data-tab selector works too", () => {
  const { app, root } = configApp(P.pitGate);
  const n = F.calls.length;
  S.injectConfig(app, root);
  assert.deepEqual(W.callsSince(n, ["setPosition"]).map(c => c.p), [{ height: "auto" }]);
  pinJSON("config-fieldset", root.querySelector("fieldset").outerHTML, import.meta.url);
  S.injectConfig(app, root);
  assert.equal(root.querySelectorAll(".ppt-config").length, 1);
  const alt = configApp(P.stair, `<section class="tab" data-tab="appearance"></section>`);
  S.injectConfig(alt.app, alt.root);
  assert.equal(alt.root.querySelector('input[name="flags.pentaryn-portals.title"]').getAttribute("placeholder"), "Fighting Pit");
  const none = configApp(P.stair, `<section class="tab" data-tab="identity"></section>`);
  S.injectConfig(none.app, none.root);
  assert.equal(none.root.querySelector("fieldset"), null);
});

test("injectConfig as a player: nothing", () => {
  F.become({ userId: P1 });
  const { app, root } = configApp(P.pitGate);
  S.injectConfig(app, root);
  F.become({ userId: GM });
  assert.equal(root.querySelector("fieldset"), null);
});

test("injectConfig: the camera button snapshots and refreshes the image field and preview", async t => {
  t.mock.method(Date, "now", () => 1700000000000);
  W.images["maps/pit.webp"] = { naturalWidth: 4000, naturalHeight: 2000 };
  const { app, root } = configApp(P.stair);
  S.injectConfig(app, root);
  await root.querySelector(".ppt-snap").click();
  const path = `assets/tokens/custom/portals/${P.pit.id}-${P.stair.id}.webp`;
  assert.equal(root.querySelector('input[name="flags.pentaryn-portals.img"]').value, `${path}?v=${(1700000000000).toString(36)}`);
  assert.equal(root.querySelector(".ppt-preview img").getAttribute("src"), `${path}?v=${(1700000000000).toString(36)}`);
});

test("renderRegionConfig: a failure warns 'config injection skipped'", () => {
  const n = console$.length;
  const broken = W.doc.createElement("div");
  broken.querySelector = () => { throw new Error("detached"); };
  F.fire("renderRegionConfig", { document: P.pitGate }, broken);
  assert.deepEqual(warns(n), [["warn", "pentaryn-portals | config injection skipped"]]);
});

/* ── snapshot ─────────────────────────────────────────────────────────── */

test("snapshot: crops the background around the region, marks the square, uploads, writes the img flag (golden)", async t => {
  t.mock.method(Date, "now", () => 1700000000000);
  W.images["maps/pit.webp"] = { naturalWidth: 4000, naturalHeight: 2000 };   // 2 image px per canvas px
  const n = F.calls.length;
  const path = await S.snapshot(P.pitGate);
  assert.equal(path, `assets/tokens/custom/portals/${P.pit.id}-${P.pitGate.id}.webp`);
  pinJSON("snapshot-calls", W.callsSince(n, ["createDirectory", "toBlob", "upload", "update"]), import.meta.url);
});

test("snapshot: a uuid string, a crop clamped at the image edge, custom squares", async t => {
  t.mock.method(Date, "now", () => 1700000000000);
  W.images["maps/pit.webp"] = { naturalWidth: 4000, naturalHeight: 2000 };
  const n = F.calls.length;
  await S.snapshot(P.stair.uuid, { squaresWide: 6, squaresHigh: 6 });
  const blob = W.callsSince(n, ["toBlob"])[0];
  // centre (350, 350) → image (500, 500); window 1200 × 1200 would start at -100 → clamped to 0
  assert.deepEqual([blob.width, blob.height], [480, 480]);
  assert.deepEqual(blob.ctx[0], ["drawImage", "Image", 0, 0, 1200, 1200, 0, 0, 480, 480]);
  assert.deepEqual(blob.ctx[2], ["arc", 200, 200, 36, 0, 6.283]);
});

test("snapshot: player → null with no calls; no background → warn and null; an existing folder is fine", async t => {
  t.mock.method(Date, "now", () => 1700000000000);
  F.become({ userId: P1 });
  let n = F.calls.length;
  assert.equal(await S.snapshot(P.pitGate), null);
  assert.deepEqual(F.calls.slice(n), []);
  F.become({ userId: GM });
  n = F.calls.length;
  assert.equal(await S.snapshot(P.cell), null);
  assert.deepEqual(W.callsSince(n, ["notify"]), [{ op: "notify", level: "warn", message: "That region's scene has no background image to snapshot." }]);
  W.dirExists = true;
  W.images["maps/pit.webp"] = { naturalWidth: 4000, naturalHeight: 2000 };
  assert.equal(typeof (await S.snapshot(P.pitGate)), "string", "createDirectory's EEXIST is swallowed");
  W.dirExists = false;
});

test("snapshot: no bounds → the first shape's x/y + half its size; an image that fails to load rejects", async t => {
  t.mock.method(Date, "now", () => 1700000000000);
  W.images["maps/pit.webp"] = { naturalWidth: 2000, naturalHeight: 1000 };
  const loose = W.region(P.pit, { id: "RegLoose00000001", name: "Loose", bounds: null, shapes: [{ type: "rectangle", x: 600, y: 400, width: 200, height: 200 }] });
  const n = F.calls.length;
  await S.snapshot(loose);
  const blob = W.callsSince(n, ["toBlob"])[0];
  // centre (700, 500) → image (600, 400); window 800 × 500 → x 200, y 150
  assert.deepEqual(blob.ctx[0], ["drawImage", "Image", 200, 150, 800, 500, 0, 0, 480, 300]);
  P.pit.regions.delete(loose.id);
  delete W.images["maps/pit.webp"];
  // [declared] -27: the rejection names the file (it was the raw load error)
  await assert.rejects(S.snapshot(P.pitGate), { message: "portal snapshot: cannot load maps/pit.webp" });
});

test("gaps: jQuery-wrapper forms for preferTeleport and injectConfig; a snapshot that returns null leaves the fields", async () => {
  const d = teleportDialog(W, P.bPassage, P.caven.id);
  S.preferTeleport(d.app, jq(d.root));
  assert.equal(d.root.querySelector('button[data-action="yes"]').hasAttribute("autofocus"), true);
  W.raf.length = 0;
  const { app, root } = configApp(P.cell);
  S.injectConfig(app, jq(root));
  const img = root.querySelector('input[name="flags.pentaryn-portals.img"]');
  await root.querySelector(".ppt-snap").click();
  assert.equal(img.value, "", "no background: nothing filled in");
});

test("gaps: an upload that answers without a path → the path is built from the folder and file name", async t => {
  t.mock.method(Date, "now", () => 1700000000000);
  W.images["maps/pit.webp"] = { naturalWidth: 4000, naturalHeight: 2000 };
  const FP = foundry.applications.apps.FilePicker.implementation;
  t.mock.method(FP, "upload", async () => ({}));
  assert.equal(await S.snapshot(P.pitGate), `assets/tokens/custom/portals/${P.pit.id}-${P.pitGate.id}.webp`);
});
