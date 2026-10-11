// Play-test fixes (fix/playtest-2026-10-11): PT3-3, PT3-4, PT3-6, PT3-7, driven only through the
// module's own hooks and the buttons it puts on the HUD — no test seam. The Argon classes and the
// DOM are minimal stand-ins; everything Foundry is the shared kit's stub (test/kit/, byte-identical
// to foundry/lib/test-kit/), with Foundry's own common/ when the app is installed.
//
// When this module migrates (guide step 1), these cases move into glue.test.mjs unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFoundry, makeDoc, StubCollection } from "./kit/foundry-stub.mjs";

const MODULE = "pentaryn-transform";
const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

/* ── a DOM just big enough for hud.mjs ───────────────────────────────────── */

const allEls = [];
class El {
  constructor() {
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.isConnected = true;
    const set = new Set();
    this.classList = {
      add: (...c) => c.forEach(x => set.add(x)),
      remove: (...c) => c.forEach(x => set.delete(x)),
      toggle: (c, on) => ((on ?? !set.has(c)) ? set.add(c) : set.delete(c), set.has(c)),
      contains: c => set.has(c)
    };
    allEls.push(this);
  }
  appendChild(c) { this.children.push(c); c.isConnected = true; return c; }
  remove() { this.isConnected = false; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const matching = sel => {
  const last = sel.trim().split(/\s+/).at(-1);
  const classes = last.split(".").filter(Boolean);
  return allEls.filter(e => e.isConnected && classes.every(c => e.classList.contains(c)));
};
globalThis.document = {
  addEventListener() {},
  dispatchEvent() {},
  querySelector: sel => matching(sel)[0] ?? null,
  querySelectorAll: sel => matching(sel)
};

/* ── Argon, as hud.mjs uses it ───────────────────────────────────────────── */

class ArgonComponent {
  constructor() { this.element = new El(); }
  async render() { this.rendered = (this.rendered ?? 0) + 1; }
  get hasTooltip() { return false; }
}
class ItemButton extends ArgonComponent {
  constructor({ item, isWeaponSet = false, inActionPanel } = {}) {
    super();
    this._item = item;
    this._isWeaponSet = isWeaponSet;
    this._inActionPanel = inActionPanel ?? isWeaponSet;
  }
  get item() { return this._item; }
  get label() { return this.item?.name; }
  get icon() { return this.item?.img; }
}
class ButtonPanelButton extends ArgonComponent {}
class SplitButton extends ArgonComponent {}
class ButtonPanel extends ArgonComponent {
  constructor({ buttons }) { super(); this._buttons = buttons; this.element.classList.add("features-container"); }
}
class DND5eItemButton extends ItemButton {}   // Argon's dnd5e button, closure-private live

/* ── the stub world: Talo (linked) as a Dire Wolf ────────────────────────── */

const F = await installFoundry({ lang, modules: [MODULE] });
const chat = [];
globalThis.ChatMessage = {
  implementation: {
    create: async data => { chat.push(data); return data; },
    getSpeaker: ({ actor } = {}) => ({ alias: actor?.name ?? null })
  }
};
globalThis.Actor = class Actor { static [Symbol.hasInstance](x) { return x?.documentName === "Actor"; } };
F.CONFIG.ARGON = { MAIN: { BUTTONS: { ButtonPanelButton, ItemButton, SplitButton }, BUTTON_PANELS: { ButtonPanel } } };
F.ui.ARGON = { collapseAllPanels() {}, _token: null };

const items = list => {
  const coll = new StubCollection();
  for (const d of list) coll.set(d.id, makeDoc("Item", d));
  return coll;
};
const wsActivity = { _id: "wsAct", type: "transform", transform: { preset: "wildshape" }, activation: { type: "bonus" },
  consumption: { targets: [{ type: "itemUses", target: "" }] }, availableProfiles: [] };
const starryData = { id: "starryForm00001", name: "Starry Form", type: "feat", img: "starry.webp",
  system: { identifier: "starry-form", type: { value: "class" }, activities: { sf1: { _id: "sf1", type: "utility",
    activation: { type: "bonus" }, consumption: { targets: [{ type: "itemUses", target: "compendiumWSid01" }] } } } } };
const reverts = [];

function makeActor(data, list) {
  const a = makeDoc("Actor", { isOwner: true, isToken: false, isPolymorphed: false, statuses: new Set(), ...data });
  Object.defineProperty(a, "items", { value: items(list), enumerable: false });
  Object.defineProperty(a, "effects", { value: new StubCollection(), enumerable: false });
  a.getActiveTokens = () => [];
  a.updateEmbeddedDocuments = async () => [];
  a.createEmbeddedDocuments = async () => [];
  return a;
}

function world({ revertItem = false } = {}) {
  F.game.actors.clear();
  const talo = makeActor({ id: "taloActor000001", name: "Talo", img: "talo.webp",
    system: { attributes: { hp: { value: 99, max: 99, temp: 0 } } } }, [
    { id: "wsWildShape00001", name: "Wild Shape", type: "feat", img: "ws.webp",
      system: { type: { value: "class" }, uses: { max: 3, spent: 1 }, activities: new Map([["wsAct", wsActivity]]) } },
    starryData
  ]);
  const formItems = [
    { id: "mmBite0000000000", name: "Bite", type: "weapon", system: { activities: { b: { _id: "b", type: "attack", activation: { type: "action" } } } } },
    starryData,                                               // carried: its target is not Talo's Wild Shape id
    ...(revertItem ? [{ id: "returnNormal001", name: "Return to Talo", type: "feat", img: "talo.webp",
      flags: { [MODULE]: { revert: true } }, system: { type: { value: "class" }, activities: {} } }] : [])
  ];
  const wolf = makeActor({ id: "formDireWolf001", name: "Talo (Dire Wolf)", img: "wolf.webp", isPolymorphed: true,
    flags: { dnd5e: { originalActor: talo.id, isPolymorphed: true, transformOptions: { preset: "wildshape" } },
      [MODULE]: { wildshape: { original: talo.id, source: null, profile: "p1", endsAt: null, carried: [] } } },
    system: { attributes: { hp: { value: 90, max: 99, temp: 0 } } } }, formItems);
  // dnd5e 6.0.6 Actor#revertOriginalForm: the hook fires just before the revert, on the reverting client.
  wolf.revertOriginalForm = async function (options = {}) {
    Hooks.callAll("dnd5e.revertOriginalForm", this, options);
    reverts.push(this.id);
    F.game.actors.delete(this.id);
    return talo;
  };
  for (const a of [talo, wolf]) { a.collection = F.game.actors; F.game.actors.set(a.id, a); }
  chat.length = 0;
  reverts.length = 0;
  return { talo, wolf };
}

function bonusPanel(actor, extra = []) {
  const slot = new DND5eItemButton({ item: actor.items.get("mmBite0000000000"), isWeaponSet: true });
  const buttons = [slot, ...extra.map(id => new DND5eItemButton({ item: actor.items.get(id), inActionPanel: true }))];
  return { label: "DND5E.BonusAction", _buttons: buttons, element: new El(), isActionUsed: false,
    updateVisibility() {}, updateActionUse() {} };
}

const { revert } = await import("../transform.mjs");
await import("../hud.mjs");
F.fire("init");

test("the stub runs Foundry's own common/ (set PENTARYN_TEST_SHIMS=1 to accept shims)", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry", "Foundry's common/ did not load");
});
