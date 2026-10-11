/**
 * A synthetic world for the ties characterisation suites (wave 3 checkpoint): the kit's Foundry stub
 * plus everything the entry and the conduit reach for — `Actor` (for `instanceof`), actors with
 * `isOwner`, items, a scripted `rollSkill`, sheets; `ChatMessage`, `Macro`, a scripted `DialogV2`,
 * `TextEditor.enrichHTML`, `Roll._mapLegacyRollMode`, a canvas with tokens, and a fake DOM.
 *
 * Determinism: `foundry.utils.randomID` counts (`rid…`), `Date.now()` is fixed at `NOW`, the
 * conduit's 250 ms claim waits run on `mock.timers` (`settle()` ticks them), and `console` lines are
 * recorded on `F.console` instead of printed. Synthetic data only — no world content.
 *
 * One boot per process (the entry registers its hooks at import).
 */
import { mock } from "node:test";
import { readFileSync } from "node:fs";
import { installFoundry, makeDoc, makeToken, StubCollection } from "../kit/foundry-stub.mjs";
import { installDom, FakeElement } from "./dom.mjs";

export const LANG = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
export const NOW = 1_790_000_000_000;

export const DND5E = {
  actorSizes: { med: { label: "DND5E.SizeMedium" }, lg: { label: "DND5E.SizeLarge" } },
  creatureTypes: { humanoid: { label: "DND5E.CreatureHumanoid" }, undead: { label: "DND5E.CreatureUndead" } },
  skills: { his: { label: "History" }, arc: { label: "Arcana" }, ins: { label: "Insight" }, rel: { label: "Religion" }, nat: { label: "Nature" }, med: { label: "Medicine" }, inv: { label: "Investigation" } },
  damageTypes: { fire: { label: "Fire" }, poison: { label: "Poison" }, necrotic: { label: "Necrotic" } },
  conditionTypes: { charmed: { label: "Charmed" } },
};
const DND5E_LANG = {
  "DND5E.SizeMedium": "Medium",
  "DND5E.SizeLarge": "Large",
  "DND5E.CreatureHumanoid": "Humanoid",
  "DND5E.CreatureUndead": "Undead",
};

export class Actor {}

/** A scripted d20: `F.rolls.push(17)` queues the next total; an empty queue rolls 10. */
function rollSkillFor(F, actor) {
  return async function rollSkill(config, dialog, message) {
    const total = F.rolls.length ? F.rolls.shift() : 10;
    F.calls.push({ op: "rollSkill", actor: actor.id, config: F.plain(config), dialog: F.plain(dialog), message: F.plain(message), total });
    return total === null ? [] : [{ total }];
  };
}

/** Items as dnd5e hands them: a collection with `get`, and activities as a Map-like with `size`. */
function itemsOf(list = []) {
  return new StubCollection(
    list.map(i => {
      const acts = i.activities ?? [];
      const doc = makeDoc("Item", { ...i, system: { ...(i.system ?? {}), activities: new Set(acts) } });
      delete doc.activities;
      return doc;
    })
  );
}

/**
 * An Actor document: `makeDoc` + the Actor prototype, `isOwner` (Foundry's rule — GM, or OWNER for the
 * current user — unless the data pins a boolean), `items`, a
 * scripted `rollSkill`, a recording `sheet`, and `_source` mirroring `system`.
 */
export function makeActor(F, data) {
  const { items = [], isOwner = null, ...rest } = data;
  const doc = makeDoc("Actor", { type: "npc", img: `icons/zz/${data.id}.webp`, ...rest });
  Object.setPrototypeOf(doc, Actor.prototype);
  const hidden = {
    items: itemsOf(items),
    rollSkill: rollSkillFor(F, doc),
    getRollData: () => ({}),
    _source: { system: structuredClone(rest.system ?? {}) },
    sheet: {
      tabGroups: { primary: "details" },
      rendered: false,
      async render(force) {
        F.calls.push({ op: "sheet.render", actor: doc.id, force, tab: this.tabGroups.primary });
        return this;
      },
    },
  };
  for (const [k, v] of Object.entries(hidden)) Object.defineProperty(doc, k, { value: v, writable: true, enumerable: false, configurable: true });
  // Foundry's own rule unless the data pins it: a GM owns everything, a player what they hold OWNER on
  Object.defineProperty(doc, "isOwner", {
    get: () => (typeof isOwner === "boolean" ? isOwner : F.game.user?.isGM === true || doc.testUserPermission(F.game.user, "OWNER")),
    set: v => Object.defineProperty(doc, "isOwner", { value: v, writable: true, configurable: true, enumerable: false }),
    enumerable: false,
    configurable: true,
  });
  return doc;
}

/** A canvas Token placeable over a TokenDocument: `isVisible`, `isOwner`, `actor`, `document`. */
export function makePlaceable(F, { id, actorId, x = 0, y = 0, isVisible = true, isOwner = false, name = null, scene = null, flags = {} }) {
  const document = makeToken({ id, actorId, x, y, name: name ?? `Token ${id}`, flags }, scene);
  return {
    id,
    name: document.name,
    document,
    isVisible,
    isOwner,
    zIndex: 0,
    w: 100,
    h: 100,
    get center() {
      return { x: document.x + 50, y: document.y + 50 };
    },
    get actor() {
      return F.game.actors.get(actorId) ?? null;
    },
    bounds: { contains: () => true },
  };
}

/** Run a promise to completion, ticking the mocked 250 ms claim waits between microtask flushes. */
export async function settle(p, { max = 200 } = {}) {
  let done = false;
  let value;
  let error;
  p.then(
    v => {
      done = true;
      value = v;
    },
    e => {
      done = true;
      error = e;
    }
  );
  for (let i = 0; i < max && !done; i++) {
    await new Promise(r => setImmediate(r));
    if (!done) mock.timers.tick(300);
  }
  if (!done) throw new Error("settle: promise never resolved");
  if (error) throw error;
  return value;
}

/** Everything F recorded since `mark`, with notification and console lines folded in order. */
export const since = (F, mark) => F.calls.slice(mark);

/**
 * Boot the real entry. `actors` are data for `makeActor`; `tokens` are placeable specs (on the
 * active scene `zzScene000000001`). `dialogs` is the DialogV2 answer queue (`F.dialogs.push(x)`).
 */
export async function bootWorld({
  user,
  users = [],
  settings = {},
  actors = [],
  tokens = [],
  timers = true,
  importEntry = true,
  frozenRoot = false,
  before = () => {},
} = {}) {
  installDom();
  const F = await installFoundry({ user, users, settings, lang: { ...LANG, ...DND5E_LANG }, modules: [{ id: "pentaryn-ties", title: "Pentaryn NPC Ties", version: "0.19.4" }], activeScopes: ["item-piles"] });
  F.rolls = [];
  F.dialogs = [];
  F.console = [];
  F.CONFIG.DND5E = structuredClone(DND5E);

  // console lines: recorded, not printed (the texts are pinned)
  for (const level of ["log", "warn", "error"]) {
    console[level] = (...args) => F.console.push({ level, text: String(args[0]), err: args[1] instanceof Error ? args[1].message : undefined });
  }

  // determinism
  let rid = 0;
  F.foundry.utils.randomID = () => `rid${String(++rid).padStart(13, "0")}`;
  Date.now = () => NOW;
  // dates the UI prints: one locale and zone whatever machine runs this (en-US, UTC)
  const { toLocaleString, toLocaleDateString } = Date.prototype;
  Date.prototype.toLocaleString = function (locale, opts) {
    return toLocaleString.call(this, "en-US", { timeZone: "UTC", ...(opts ?? {}) });
  };
  Date.prototype.toLocaleDateString = function (locale, opts) {
    return toLocaleDateString.call(this, "en-US", { timeZone: "UTC", ...(opts ?? {}) });
  };
  if (timers) mock.timers.enable({ apis: ["setTimeout"] });

  // frames: queued, never run on their own — `F.flushFrames()` runs what is queued
  F.frames = [];
  globalThis.requestAnimationFrame = fn => {
    F.frames.push(fn);
    return F.frames.length;
  };
  F.flushFrames = () => {
    const run = F.frames.splice(0);
    for (const fn of run) fn();
    return run.length;
  };

  // the clipboard: recorded (node has no clipboard)
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: async text => void F.calls.push({ op: "clipboard", text }) } },
    configurable: true,
    writable: true,
  });

  globalThis.Actor = Actor;
  F.Actor = Actor;
  globalThis.Macro = { create: async data => F.calls.push({ op: "Macro.create", data: F.plain(data) }) };
  globalThis.ChatMessage = {
    create: async data => {
      F.calls.push({ op: "ChatMessage.create", data: F.plain(data) });
      return data;
    },
    getSpeaker: ({ actor } = {}) => ({ alias: actor?.name ?? null, actor: actor?.id ?? null }),
  };
  F.game.macros = { getName: () => null };
  F.game.combat = null;
  F.game.keybindings.get = (ns, key) => F.game.keybindings.actions.get(`${ns}.${key}`)?.editable ?? [];

  class DialogV2 {
    constructor(opts) {
      this.opts = opts;
      this.rendered = false;
      this.element = new FakeElement("div");
      F.calls.push({ op: "DialogV2.new", title: opts?.window?.title ?? null });
    }
    async render() {
      this.rendered = true;
      return this;
    }
    async close() {
      this.rendered = false;
      this.opts?.close?.();
    }
    static async prompt(opts) {
      F.calls.push({ op: "DialogV2.prompt", title: opts?.window?.title ?? null });
      return F.dialogs.length ? F.dialogs.shift() : null;
    }
    static async confirm(opts) {
      F.calls.push({ op: "DialogV2.confirm", title: opts?.window?.title ?? null, content: opts?.content ?? null });
      return F.dialogs.length ? F.dialogs.shift() : false;
    }
    static async wait(opts) {
      F.calls.push({ op: "DialogV2.wait", title: opts?.window?.title ?? null, buttons: (opts?.buttons ?? []).map(b => b.action) });
      return F.dialogs.length ? F.dialogs.shift() : null;
    }
  }
  F.foundry.applications.api.DialogV2 = DialogV2;
  /*
   * ApplicationV2 that records instead of rendering: `render` logs `app.render` with the class name
   * and registers the instance in `foundry.applications.instances` (as Foundry does on first render).
   */
  const instances = new Map();
  let appSeq = 0;
  class ApplicationV2 {
    constructor(options = {}) {
      this.options = options;
      this.rendered = false;
      this.id = options?.id ?? `app-${++appSeq}`;
    }
    async render(opts) {
      this.rendered = true;
      instances.set(this.id, this);
      F.calls.push({ op: "app.render", app: this.constructor.name, opts: F.plain(opts) });
      return this;
    }
    async close() {
      this.rendered = false;
      instances.delete(this.id);
      F.calls.push({ op: "app.close", app: this.constructor.name });
    }
    bringToFront() {}
  }
  F.foundry.applications.api.ApplicationV2 = ApplicationV2;
  F.foundry.applications.instances = instances;
  F.foundry.applications.ux = { TextEditor: { implementation: { enrichHTML: async html => `${html}` } } };
  F.foundry.dice = { Roll: { _mapLegacyRollMode: m => `mapped:${m}` } };

  // actors and the canvas
  for (const a of actors) {
    const doc = makeActor(F, a);
    doc.collection = F.game.actors;
    F.game.actors.set(doc.id, doc);
  }
  const scene = makeDoc("Scene", { id: "zzScene000000001", active: true, grid: { size: 100, distance: 5 } });
  Object.defineProperty(scene, "tokens", { value: new StubCollection(), enumerable: false });
  F.game.scenes.set(scene.id, scene);
  Object.defineProperty(F.game.scenes, "active", { get: () => scene, configurable: true });
  const view = new FakeElement("canvas");
  const placeables = tokens.map(spec => makePlaceable(F, { ...spec, scene }));
  for (const p of placeables) scene.tokens.set(p.document.id, p.document);
  // a PIXI that records: every Graphics/Text/Container call lands on F.pixi
  F.pixi = [];
  const rec = (kind, id) =>
    new Proxy(
      { kind, id, children: [], destroyed: false, position: { set: (x, y) => F.pixi.push({ id, call: "position.set", args: [x, y] }) }, anchor: { set: v => F.pixi.push({ id, call: "anchor.set", args: [v] }) } },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          if (prop === "then") return undefined;
          return (...args) => {
            F.pixi.push({ id, call: String(prop), args: F.plain(args) });
            if (prop === "addChild") target.children.push(args[0]);
            if (prop === "removeChildren") return target.children.splice(0);
            if (prop === "destroy") target.destroyed = true;
            return target.__proxy;
          };
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        },
      }
    );
  let pixiSeq = 0;
  const make = kind => {
    const p = rec(kind, `${kind}${++pixiSeq}`);
    p.__proxy = p;
    F.pixi.push({ id: p.id, call: "new", args: [] });
    return p;
  };
  globalThis.PIXI = {
    VERSION: "8.0.0",
    Container: function Container() { return make("Container"); },
    Graphics: function Graphics() { return make("Graphics"); },
    Text: function Text(opts) { const t = make("Text"); F.pixi.push({ id: t.id, call: "text", args: F.plain([opts]) }); return t; },
  };
  const iface = make("Interface");

  Object.assign(globalThis.canvas, {
    ready: true,
    scene,
    interface: iface,
    stage: { toGlobal: ({ x, y }) => ({ x, y }), toLocal: ({ x, y }) => ({ x, y }) },
    app: { view },
    dimensions: { uiScale: 1 },
    canvasCoordinatesFromClient: ({ x, y }) => ({ x, y }),
  });
  Object.assign(globalThis.canvas.tokens, {
    placeables,
    hover: null,
    controlled: [],
    get: id => placeables.find(p => p.id === id) ?? null,
  });
  F.scene = scene;

  if (frozenRoot) F.game.pentaryn = Object.freeze({ rules: {} });
  before(F);
  if (importEntry) {
    await import("../../pentaryn-ties.mjs");
    F.fire("init");
    F.fire("setup");
    F.fire("ready");
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  }
  return F;
}

/**
 * `toLocaleString()` output differs by machine locale and zone: a string `when` / `delivered` (the
 * GM-facing pending() and beliefs() rows) folds to "<localeDate>" for goldens.
 */
export function stableDates(v) {
  return JSON.parse(JSON.stringify(v ?? null, (k, x) => ((k === "when" || k === "delivered") && typeof x === "string" ? "<localeDate>" : x)));
}
