/**
 * The aoe test world: the kit's Foundry stub plus the dnd5e 6 / core v14 surfaces aoe touches —
 * typed chat messages, actors that roll saves and take damage, scenes with regions and tokens and
 * the embedded-document calls, Actor/ChatMessage/ActiveEffect `implementation.create`, the
 * `<effect-application>` element, RegionLayer, Roll._mapLegacyRollMode, CONFIG.DND5E — and a fake
 * DOM. Timers and Date are mocked (node:test `mock.timers`): nothing here waits in real time.
 *
 *   const { F, W, out } = await boot();               // stub only
 *   const { F, W } = await boot({ entry: true });     // + import ../aoe.mjs, fire init → setup → ready
 *
 * Every effect a test pins is on F.calls (`create`, `createEmbedded`, `deleteEmbedded`,
 * `updateEmbedded`, `update`, `delete`, `rollSavingThrow`, `applyDamage`, `notify`, …) or on `out`
 * (console.debug/info/warn/error as `{ level, text }`).
 */

import { mock } from "node:test";
import { readFileSync } from "node:fs";
import { installFoundry, makeDoc, makeUser, makeToken, makeScene, StubCollection, stubId } from "../kit/foundry-stub.mjs";
import { document, FakeElement } from "./dom.mjs";

export const MODULE = "pentaryn-aoe";
export const NOW = Date.UTC(2026, 9, 11, 20, 0, 0);
export const GM_ID = "gmUser0000000001";
export const PLAYER_ID = "plUser0000000001";
const LANG = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));

/** Console lines the module wrote (debug/info/warn/error), as `{ level, text, args }`. */
export const out = [];
const realConsole = { ...console };
for (const level of ["debug", "info", "warn", "error"]) {
  console[level] = (...args) => out.push({ level, text: String(args[0]), args });
}
export const lines = () => out.map(o => `${o.level}: ${o.text}`);
export const realLog = realConsole;

/** Drain the microtask queue (real setImmediate is not mocked). */
export async function flush(n = 4) {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
}

/** Advance the mocked clock by `ms`, flushing between steps so awaited timers chain. */
export async function advance(ms, step = 50) {
  if (!ms) {
    await flush();
    mock.timers.tick(0);
    await flush();
    return;
  }
  for (let t = 0; t < ms; t += step) {
    await flush();
    mock.timers.tick(Math.min(step, ms - t));
  }
  await flush();
}

let F = null;

/** The plain view of a document's own enumerable data (what `_source` holds). */
const sourceOf = doc => JSON.parse(JSON.stringify(doc));

function withSource(doc) {
  Object.defineProperty(doc, "_source", { get() { return sourceOf(this); }, enumerable: false, configurable: true });
  return doc;
}

function method(doc, name, fn) {
  Object.defineProperty(doc, name, { value: fn, enumerable: false, configurable: true, writable: true });
}

function permissions(doc) {
  method(doc, "canUserModify", function (user, action = "update") {
    if (this._deny?.includes(action)) return false;
    return user?.isGM || (this.ownership?.[user?.id] ?? this.ownership?.default ?? 0) >= 3;
  });
  Object.defineProperty(doc, "isOwner", {
    get() { return this.canUserModify(F.game.user, "update"); }, enumerable: false, configurable: true,
  });
}

/* ── builders ──────────────────────────────────────────────────────────── */

function actor(data = {}) {
  const { hp = { value: 10, max: 10 }, saves = [], hasPlayerOwner = false, effects = [], items = [], cha = 0, ...rest } = data;
  const a = makeDoc("Actor", { type: "npc", img: "icons/a.webp", system: { attributes: { hp: { ...hp } }, abilities: { cha: { mod: cha } } }, ...rest });
  withSource(a);
  permissions(a);
  Object.defineProperty(a, "hasPlayerOwner", { value: hasPlayerOwner, enumerable: false, writable: true });
  method(a, "_saves", [...saves]);
  const eff = new StubCollection();
  Object.defineProperty(a, "effects", { value: eff, enumerable: false });
  for (const e of effects) W.effect(a, e);
  Object.defineProperty(a, "items", { value: new StubCollection(items), enumerable: false });
  if (a.prototypeToken) method(a.prototypeToken, "toObject", function () { return JSON.parse(JSON.stringify(this)); });
  method(a, "getActiveTokens", function () {
    return F.game.scenes.contents.flatMap(s => s.tokens.filter(t => t.actorId === this.id));
  });
  method(a, "rollSavingThrow", async function (config, dialog, message) {
    F.calls.push({ op: "rollSavingThrow", actor: this.uuid, config: F.plain({ ...config, event: config?.event ? "<event>" : undefined }), dialog: F.plain(dialog), message: F.plain(message) });
    const total = this._saves.length ? this._saves.shift() : 10;
    if (total === null) return null;
    const msg = W.message({
      type: "save", author: F.game.user.id, rolls: [{ total }], system: { ability: config.ability, type: "ability", ...(message?.data?.system ?? {}) },
      speaker: message?.data?.speaker ?? {}, flags: message?.data?.flags ?? {}, timestamp: Date.now(),
    }, { hook: true });
    const success = Number.isFinite(config.target) ? total >= config.target : undefined;
    return [{ total, isSuccess: success, parent: msg }];
  });
  method(a, "applyDamage", async function (damages, opts) {
    const sum = damages.reduce((n, d) => n + d.value, 0);
    F.calls.push({ op: "applyDamage", actor: this.uuid, damages: damages.map(d => ({ ...d, properties: [...d.properties] })), multiplier: opts?.multiplier, originatingMessage: opts?.originatingMessage?.id ?? null });
    this.system.attributes.hp.value -= Math.floor(sum * opts.multiplier);
    return this;
  });
  method(a, "calculateDamage", function (damages, opts) {
    return { amount: damages.reduce((n, d) => n + d.value, 0) * opts.multiplier, originatingMessage: opts?.originatingMessage?.id ?? null };
  });
  a.collection = F.game.actors;
  F.game.actors.set(a.id, a);
  return a;
}

function effect(parent, data = {}) {
  const { statuses = [], ...rest } = data;
  const e = makeDoc("ActiveEffect", { name: "Effect", disabled: false, origin: null, _stats: {}, ...rest }, { parent });
  Object.defineProperty(e, "statuses", { value: new Set(statuses), enumerable: false });
  const coll = parent?.effects;
  if (coll) { e.collection = coll; coll.set(e.id, e); }
  return e;
}

function scene(data = {}) {
  const { regions = [], tokens = [], levels = [], ...rest } = data;
  const s = makeScene({ grid: { size: 100 }, ...rest });
  Object.defineProperty(s, "levels", { value: new Map(levels.map(l => [l.id, l])), enumerable: false });
  const collOf = name => (name === "Token" ? s.tokens : name === "Region" ? s.regions : null);
  method(s, "createEmbeddedDocuments", async function (name, list, options = {}) {
    F.calls.push({ op: "createEmbedded", parent: this.uuid, documentName: name, data: F.plain(list), options: F.plain(options) });
    const made = [];
    for (const d of list) {
      if (this._createError) throw new Error(this._createError);
      if (options.keepId && d._id && collOf(name).has(d._id)) throw new Error(`The ${name} id [${d._id}] already exists in the embedded collection`);
      const { _id, ...rest2 } = d;
      const doc = name === "Token" ? W.token(this, { id: _id, ...rest2 }) : W.region(this, { id: _id, ...rest2 });
      made.push(doc);
      F.Hooks.callAll(`create${name}`, doc, options, F.game.user.id);
    }
    return made;
  });
  method(s, "deleteEmbeddedDocuments", async function (name, ids, options = {}) {
    F.calls.push({ op: "deleteEmbedded", parent: this.uuid, documentName: name, ids: [...ids] });
    const coll = collOf(name);
    const gone = [];
    for (const id of ids) {
      const doc = coll.get(id);
      if (!doc) throw new Error(`${name} id [${id}] does not exist in the EmbeddedCollection`);
      coll.delete(id);
      gone.push(doc);
    }
    for (const doc of gone) F.Hooks.callAll(`delete${name}`, doc, options, F.game.user.id);
    return gone;
  });
  method(s, "updateEmbeddedDocuments", async function (name, updates) {
    F.calls.push({ op: "updateEmbedded", parent: this.uuid, documentName: name, updates: F.plain(updates) });
    const coll = collOf(name);
    for (const u of updates) {
      const { _id, ...changes } = u;
      const doc = coll.get(_id);
      for (const [path, v] of Object.entries(changes)) F.foundry.utils.setProperty(doc, path, v);
    }
    return updates.map(u => coll.get(u._id));
  });
  for (const r of regions) W.region(s, r);
  for (const t of tokens) W.token(s, t);
  s.collection = F.game.scenes;
  F.game.scenes.set(s.id, s);
  return s;
}

function token(s, data = {}) {
  const t = makeToken({ name: "Token", texture: { src: "icons/t.webp" }, disposition: -1, actorLink: false, _regions: [], ...data }, s);
  withSource(t);
  permissions(t);
  method(t, "setTarget", function (on, opts) { F.calls.push({ op: "setTarget", token: this.id, on, opts }); });
  if (s) {
    t.parent = s;
    t.collection = s.tokens;
    s.tokens.set(t.id, t);
  }
  return t;
}

function region(s, data = {}) {
  const { inside = [], ...rest } = data;
  const r = makeDoc("Region", { name: "Region", shapes: [{ type: "circle", x: 500, y: 500, radius: 200 }], ownership: { default: 0 }, flags: {}, levels: [], hidden: false, ...rest }, { parent: s });
  withSource(r);
  permissions(r);
  Object.defineProperty(r, "tokens", { get() { return new Set(inside.map(id => s.tokens.get(id)).filter(Boolean)); }, enumerable: false });
  method(r, "updateSource", function (changes) {
    F.calls.push({ op: "updateSource", documentName: "Region", changes: F.plain(changes) });
    for (const [path, v] of Object.entries(changes)) F.foundry.utils.setProperty(this, path, v);
  });
  if (s) {
    r.parent = s;
    r.collection = s.regions;
    s.regions.set(r.id, r);
  }
  return r;
}

/**
 * A chat message. `activity`, `actor`, `item` become getAssociated*(); `ChatMessage` is its
 * prototype so `instanceof ChatMessage` holds. `hook: true` fires createChatMessage.
 */
function message(data = {}, { hook = false } = {}) {
  const { activity = null, actor: a = null, item = null, isAuthor = true, isContentVisible = true, ...rest } = data;
  const m = makeDoc("ChatMessage", { type: "base", system: {}, flags: {}, speaker: {}, timestamp: Date.now(), author: F.game.user.id, rolls: [], ...rest });
  Object.setPrototypeOf(m, globalThis.ChatMessage.prototype);
  withSource(m);
  permissions(m);
  method(m, "getAssociatedActivity", () => activity);
  method(m, "getAssociatedActor", () => a);
  method(m, "getAssociatedItem", () => item);
  Object.defineProperty(m, "isAuthor", { value: isAuthor, enumerable: false, writable: true });
  Object.defineProperty(m, "isContentVisible", { value: isContentVisible, enumerable: false, writable: true });
  m.collection = F.game.messages;
  F.game.messages.set(m.id, m);
  if (hook) F.Hooks.callAll("createChatMessage", m, {}, m.author);
  return m;
}

/** A dnd5e 6 save activity with an item, for resolve(). */
function saveActivity({ id = "act00000000fire1", item, actor: a, ability = "dex", dc = 15, onSave = "half", type = "save", template = "sphere", range = "ft", affects = null } = {}) {
  const act = {
    id, type, uuid: `${item?.uuid ?? "Item.none"}.Activity.${id}`, item, actor: a,
    save: type === "save" ? { ability: new Set([ability]), dc: { value: dc } } : undefined,
    damage: { onSave }, messageSources: { activity: { uuid: `${item?.uuid}.Activity.${id}` } },
    target: { template: { type: template }, affects: { type: affects } }, range: { units: range },
  };
  return act;
}

/** An Item document (optionally owned by `parent`), registered for fromUuidSync. */
function item(data = {}, parent = null) {
  const it = makeDoc("Item", { type: "spell", system: { identifier: "", duration: { units: "inst" } }, ...data }, { parent });
  withSource(it);
  register(it.uuid, it);
  if (!parent) F.game.items.set(it.id, it);
  return it;
}

/** Make `uuid` resolve to `doc` through fromUuidSync / fromUuid (activities, relative uuids, owned items). */
function register(uuid, doc) {
  F.uuids.set(uuid, doc);
  return doc;
}

export const W = { actor, effect, scene, token, region, message, saveActivity, item, register };

/* ── boot ──────────────────────────────────────────────────────────────── */

/**
 * @param {{ user?: object, users?: object[], settings?: object, entry?: boolean, hot?: boolean, timers?: boolean }} o
 */
export async function boot({ user = null, users = [], settings = {}, entry = false, timers = true, argon = null, beforeEntry = null } = {}) {
  if (timers) mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  F = await installFoundry({
    user: user ?? { id: GM_ID, name: "Gamemaster", isGM: true },
    users: users.length ? users : [{ id: PLAYER_ID, name: "Player", isGM: false }],
    settings, lang: LANG, modules: [{ id: MODULE, active: true }],
  });
  F.uuids = new Map();
  const baseFrom = F.fromUuidSync;
  const from = (uuid, opts = {}) => {
    F.uuidReads = (F.uuidReads ?? 0) + 1;
    if (F.uuids.has(uuid)) return F.uuids.get(uuid);
    if (opts?.relative && typeof uuid === "string" && uuid.startsWith(".")) return F.uuids.get(`${opts.relative.parent?.uuid}${uuid}`) ?? null;
    return baseFrom(uuid);
  };
  globalThis.fromUuidSync = from;
  globalThis.fromUuid = async u => from(u);
  F.fromUuidSync = from;
  F.out = out;
  const g = F.game;
  g.user.can = () => true;
  for (const u of g.users) if (!u.can) u.can = () => true;
  g.folders = new StubCollection();
  g.combats = new StubCollection();
  g.itempiles = undefined;

  // dnd5e 6 surfaces
  F.CONFIG.DND5E = {
    requests: {},
    abilities: { dex: { label: "Dexterity" }, con: { label: "Constitution" }, wis: { label: "Wisdom" } },
    areaTargetTypes: { cone: { template: "cone" }, line: { template: "ray" }, sphere: { template: "circle" }, radius: { template: "emanation" } },
  };
  F.CONFIG.specialStatusEffects = { CONCENTRATING: "concentrating" };
  globalThis.dnd5e = { dice: { aggregateDamageRolls: (rolls, opts) => { F.calls.push({ op: "aggregateDamageRolls", n: rolls.length, opts }); return rolls; } } };

  // core v14 surfaces
  class ChatMessage {
    static getSpeaker({ actor: a = null, scene: s = null, token: t = null } = {}) {
      return { scene: s?.id ?? t?.parent?.id ?? null, actor: a?.id ?? null, token: t?.id ?? null, alias: t?.name ?? a?.name ?? null };
    }
  }
  ChatMessage.implementation = {
    create: async data => {
      F.calls.push({ op: "create", documentName: "ChatMessage", data: F.plain(data) });
      return message({ ...data, author: g.user.id }, { hook: true });
    },
  };
  globalThis.ChatMessage = ChatMessage;
  globalThis.Actor = {
    implementation: {
      create: async (data, opts) => {
        F.calls.push({ op: "create", documentName: "Actor", data: F.plain(data), options: F.plain(opts) ?? null });
        if (F._actorCreateError) throw new Error(F._actorCreateError);
        // core v14: with keepId the given _id is kept. A WORLD document with an id that exists is
        // NOT refused (server-backend #_createDocuments only checks a parent's embedded
        // collection): the record is replaced and every client gets createActor again. Embedded
        // documents are refused (the scene's collOf stub above). Tests that need a refusal stub
        // create themselves.
        const { _id, ...rest } = data;
        const id = opts?.keepId && _id ? _id : undefined;
        const replaced = !!id && g.actors.has(id);
        // A kept id still advances the stub's id sequence, as a generated one did, so the ids of
        // every later stub document (and the goldens that carry them) do not shift.
        if (id) stubId("Act");
        const a = actor({ ...rest, ...(id ? { id } : {}), hp: data.system?.attributes?.hp });
        // The stub fires no createActor for a first create (no goldens carry one); the replace
        // fires it, so a test can see the second event the server sends.
        if (replaced) F.Hooks.callAll("createActor", a, F.plain(opts) ?? {}, g.user.id);
        return a;
      },
      // core: one request for many world actors; each still gets its own update (and its hooks)
      updateDocuments: async (updates, opts) => {
        F.calls.push({ op: "updateDocuments", documentName: "Actor", updates: F.plain(updates) });
        const done = [];
        for (const { _id, ...changes } of updates) {
          const a = g.actors.get(_id);
          if (a) done.push(await a.update(changes, opts));
        }
        return done;
      },
    },
  };
  globalThis.ActiveEffect = {
    implementation: {
      create: async (data, { parent } = {}) => {
        F.calls.push({ op: "create", documentName: "ActiveEffect", parent: parent?.uuid ?? null, data: F.plain(data) });
        return effect(parent, data);
      },
    },
  };
  class RegionLayer {
    placeRegions(data, options) {
      F.calls.push({ op: "placeRegions", hasOnMove: typeof options?.onMove === "function" });
      F.lastPlacement = options;
      return "placed";
    }
  }
  F.RegionLayer = RegionLayer;
  F.foundry.canvas.layers = { RegionLayer };

  // core's region constraint (Part H wraps _computeShapeConstraint) and its "move" polygon backend:
  // the backend keeps the edges its _testEdgeInclusion accepts, from F.edges (set per test).
  class MovePolygon {
    static create(origin, config) {
      const p = new this();
      p.origin = origin;
      p.config = config;
      p.edges = (F.edges ?? []).filter(e => p._testEdgeInclusion(e, config?.edgeTypes ?? {}));
      return p;
    }
    _testEdgeInclusion(edge) { return (edge.move ?? 0) !== 0; }
  }
  class RegionDocument {
    _computeShapeConstraint(origin, config) {
      F.calls.push({ op: "coreConstraint", origin: F.plain(origin) });
      return MovePolygon.create(origin, config);
    }
  }
  F.MovePolygon = MovePolygon;
  F.RegionDocument = RegionDocument;
  F.foundry.documents = { ...(F.foundry.documents ?? {}), RegionDocument };
  F.CONFIG.Canvas = { ...(F.CONFIG.Canvas ?? {}), polygonBackends: { move: MovePolygon } };
  F.foundry.dice = { Roll: { _mapLegacyRollMode: mode => ({ publicroll: "public", gmroll: "gm", blindroll: "blind", selfroll: "self" })[mode] || mode } };

  // the dnd5e <effect-application> element (its _prepareEffectData is the tray's own data path)
  class EffectApplication {
    async _prepareEffectData(e, a) {
      F.calls.push({ op: "_prepareEffectData", effect: e.uuid, actor: a.uuid, message: this.chatMessage?.id ?? null });
      const existing = a.effects.find(x => x._stats?.duplicateSource === e.uuid);
      if (existing) return { action: "update", data: { _id: existing.id, disabled: false } };
      return { action: "create", data: { name: e.name, origin: e.uuid, _stats: { duplicateSource: e.uuid } } };
    }
  }
  const elements = new Map([["effect-application", EffectApplication]]);
  globalThis.customElements = { get: name => elements.get(name) };
  globalThis.document = document;
  F.elements = elements;

  // the canvas: a viewed scene is set per test (F.canvas.scene = s)
  F.canvas.regions = { _placementContext: null, _cancelPlacement: () => F.calls.push({ op: "_cancelPlacement" }) };
  F.canvas.tokens = { placeables: [], controlled: [] };
  if (argon) F.ui.ARGON = argon;

  // core's DialogV2.wait. By default the user presses the default button on the boxes the dialog
  // shows ticked; a test sets F.dialog = (opts, inputs) => action | null to tick other boxes
  // (inputs[i].checked) and press a button, or return null (the window closed). Logged as op "dialog".
  F.foundry.applications.api.DialogV2 = class DialogV2 {
    static async wait(opts = {}) {
      const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
      const inputs = [...String(opts.content ?? "").matchAll(/<input\b[^>]*>/g)].map(([tag]) => ({
        name: attr(tag, "name"), value: attr(tag, "value"), checked: /\schecked\b/.test(tag),
      }));
      F.calls.push({ op: "dialog", title: opts.window?.title ?? null, inputs: F.plain(inputs) });
      const action = F.dialog ? F.dialog(opts, inputs) : undefined;
      if (action === null) return null;
      const buttons = opts.buttons ?? [];
      const button = buttons.find(b => b.action === action) ?? buttons.find(b => b.default) ?? buttons[0];
      const form = {
        querySelectorAll: sel => inputs.filter(i => sel.includes(`name="${i.name}"`) && (!sel.includes(":checked") || i.checked)),
      };
      return button?.callback ? button.callback({}, { form }, {}) : (button?.action ?? null);
    }
  };

  if (beforeEntry) await beforeEntry(F, W);
  if (entry) {
    await import("../../aoe.mjs");
    F.fire("init");
    F.fire("setup");
    F.fire("ready");
    await advance(0, 1);
    await flush();
  }
  return { F, W, out };
}

/** The Foundry stub in use (after boot). */
export const stub = () => F;
export { makeUser, makeDoc, FakeElement };
