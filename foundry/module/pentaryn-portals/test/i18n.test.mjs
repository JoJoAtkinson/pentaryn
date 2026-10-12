// i18n after the Wave 7 restart batch (guide W7, finding -29; [declared] D-P2). lang/en.json ships in the
// same sync as module.json `languages`, and every on-screen string is a `_loc("PENTARYN_PORTALS.…")`
// full-key literal (no prefix wrapper, C35). This file replaced the pre-W7 one, which pinned "no key
// anywhere while there is no lang file". Pinned here: the key → exact pre-W7 English map (-29's
// golden-string recipe), a format stub reproducing the old template output, and every literal resolving.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { manifestOf, readJSON, sourceScan } from "./kit/harness.mjs";
import { SETTINGS } from "../settings.mjs";

const ROOT = new URL("..", import.meta.url);

function flatten(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const lang = readJSON(new URL("lang/en.json", ROOT));
const en = flatten(lang);
const K = "PENTARYN_PORTALS.";
/** Foundry's I18n#format. */
const fmt = (k, d = {}) => en[K + k].replace(/\{(\w+)\}/g, (_, x) => String(d[x]));

test("module.json pairs `languages` with lang/en.json, nested under one root", () => {
  assert.deepEqual(manifestOf(ROOT).languages, [{ lang: "en", name: "English", path: "lang/en.json" }]);
  assert.equal(existsSync(new URL("lang/en.json", ROOT)), true);
  assert.deepEqual(Object.keys(lang), ["PENTARYN_PORTALS"]);
});

test("golden strings: each key is the exact pre-W7 English (-29)", () => {
  const golden = {
    "Config.Legend": "Portal card",
    "Config.ImagePlaceholder": "scene thumbnail",
    "Hover.Unknown.Title": "A way onward",
    "Hover.Unknown.Text": "You can't tell where it leads.",
    "Menu.Preview": "Preview card (player view)",
    "Menu.Edit": "Edit card",
    "Menu.RegionSettings": "Region settings",
    "Dialog.Question": "Teleport {name} to {title}?",
    "Party.LandsBeside": "lands beside {name}",
    "Party.Follower": "follower",
    "Card.NoDestinations": "No destinations yet.",
    "Card.RevealedHint": "Off = players see '?' and 'a way onward'",
    "Setting.teleportDefault.Name": "Teleport is the default answer",
    "Setting.spreadArrivals.Name": "Arrivals step off an occupied square",
    "Setting.confirmPartyTeleport.Hint": "The GM's Teleport party first lists who will move (each follower beside its PC) and asks. Off: it moves at once.",
  };
  for (const [k, v] of Object.entries(golden)) assert.equal(en[K + k], v, k);
});

test("format stub reproduces the old template output for sample data", () => {
  assert.equal(fmt("Dialog.Question", { name: "ZZ Fighter 5", title: "The Fighting Pit" }), "Teleport ZZ Fighter 5 to The Fighting Pit?");
  assert.equal(fmt("Dialog.QuestionNoToken", { title: "The Fighting Pit" }), "Teleport to The Fighting Pit?");
  assert.equal(fmt("Menu.Look", { title: "Pit" }), "Look at Pit");
  assert.equal(fmt("Menu.TeleportParty", { title: "Pit" }), "Teleport party → Pit");
  assert.equal(fmt("Notify.Followed", { name: "Talo", names: "Wolf, Hawk", place: "Pit" }), "Talo brought Wolf, Hawk to Pit.");
  assert.equal(fmt("Notify.Looking", { title: "Pit" }), "Looking at Pit. Nobody moved; players can't see this.");
  assert.equal(fmt("Notify.PartyMovedOne", { n: 1, title: "Pit" }), "1 party token moved to Pit.");
  assert.equal(fmt("Notify.PartyMovedMany", { n: 3, title: "Pit" }), "3 party tokens moved to Pit.");
  assert.equal(fmt("Party.ConfirmOne", { title: "Pit" }), "Move this token to <strong>Pit</strong>?");
  assert.equal(fmt("Party.ConfirmMany", { n: 4, title: "Pit" }), "Move these 4 tokens to <strong>Pit</strong>?");
  assert.equal(fmt("Card.Title", { name: "Passage A" }), "Portal card — Passage A");
});

test("every PENTARYN_PORTALS.* literal in the sources exists in lang/en.json, and every key is used", () => {
  const used = new Set(sourceScan(ROOT, /["'`]PENTARYN_PORTALS\.[\w.]+["'`]/, { exclude: ["lib/", "test/"] })
    .flatMap(h => h.text.match(/PENTARYN_PORTALS\.[\w.]+/g)));
  for (const k of used) assert.ok(k in en, `${k} missing from lang/en.json`);
  for (const k of Object.keys(en)) assert.ok(used.has(k), `${k} is in lang/en.json but no source uses it`);
});

test("setting rows carry PENTARYN_PORTALS.Setting.<key>.Name/Hint literals, in live order (C51)", () => {
  assert.deepEqual(SETTINGS.map(r => r.key), ["teleportDefault", "spreadArrivals", "confirmPartyTeleport"]);
  for (const r of SETTINGS) {
    assert.equal(r.name, `${K}Setting.${r.key}.Name`);
    assert.equal(r.hint, `${K}Setting.${r.key}.Hint`);
    assert.ok(r.doc, `${r.key} has a doc line`);
  }
});

test("no prefix wrapper (const t = … i18n …) anywhere (C35); no game.i18n template-literal key", () => {
  assert.deepEqual(sourceScan(ROOT, /\bconst\s+[tfTL]\s*=.*i18n/).map(h => `${h.file}:${h.line}`), []);
  assert.deepEqual(sourceScan(ROOT, /(?:_loc|game\.i18n\.(?:localize|format))\(\s*`/).map(h => `${h.file}:${h.line}`), []);
});
