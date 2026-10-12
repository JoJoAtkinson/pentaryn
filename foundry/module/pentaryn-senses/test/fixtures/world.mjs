/**
 * Boot the real senses entry on the kit's Foundry stub, with the extra stand-ins senses needs:
 * dnd5e items with activity collections, scene embedded-document batches (Token, AmbientLight)
 * that fire their hooks, `Actor.implementation.updateDocuments`, `ChatMessage`, `DialogV2`, PIXI,
 * `requestAnimationFrame`, a canvas, `window` and a small DOM (fixtures/dom.mjs).
 *
 * One boot per process: the entry self-installs at import, so every scenario that needs a
 * different `ready` (active GM, second GM, lone GM, player, frozen root, hot import) is its own
 * *.test.mjs file. Timers: each file enables `mock.timers` (setTimeout + Date) before booting.
 * Synthetic data only.
 *
 * Fidelity gap, known and accepted for characterisation: the stub fires `update<Type>` hooks for
 * every update, even one that changes nothing; Foundry skips the hooks on an empty diff. So a few
 * goldens show a no-op write followed by its (converged) reconcile or re-sync.
 */
import { readFileSync } from "node:fs";
import { installFoundry, makeDoc, makeToken, makeScene, makeUser, StubCollection } from "../kit/foundry-stub.mjs";
import { installDom, el } from "./dom.mjs";

export const MODULE = "pentaryn-senses";
export const LANG = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
export const NOW = 1_760_000_000_000;

export const GM = "gmUser0000000001";
export const GM2 = "gmUser0000000002";
export const PLAYER = "plyUser000000001";

export const ID = Object.freeze({
  hero: "actHero000000001", goblin: "actGoblin0000001", stake: "actStake00000001", hulk: "actHulk000000001",
  torch: "itmTorch00000001", lantern: "itmLantern000001", light: "itmLight00000001", shard: "itmShard00000001",
  gobTorch: "itmGobTorch00001", worldTorch: "itmWorldTorch001",
  s1: "scnCellar0000001", s2: "scnRoad000000002",
  tHero: "tokHero000000001", tGob: "tokGob0000000001", tHulk: "tokHulk000000001", tStake: "tokStake00000001",
  tHero2: "tokHero000000002", tGob2: "tokGob0000000002",
});

let F = null;
const plain = v => F.plain(v);

/** A dnd5e activity collection: a Map that an `item.update({"system.activities.<id>": …})` lands in. */
export class Activities extends Map {
  constructor(list = []) {
    super();
    for (const a of list) this.set(a._id ?? a.id, { ...a, id: a._id ?? a.id });
  }
  /** Move fields the stub's update wrote as plain properties into the map (Foundry rebuilds it from source). */
  sync() {
    for (const k of Object.keys(this)) {
      this.set(k, { ...this[k], id: k });
      delete this[k];
    }
  }
}

/** An Item embedded in `parent` (an Actor) or a world item (`parent` null). */
export function makeItem({ activities = [], ...data }, parent = null) {
  const item = makeDoc("Item", { type: "consumable", flags: {}, ...data, system: { quantity: 1, ...(data.system ?? {}) } }, { parent });
  Object.defineProperty(item.system, "activities", { value: new Activities(activities), enumerable: false, writable: true });
  for (const a of item.system.activities.values()) Object.defineProperty(a, "item", { value: item, enumerable: false });
  Object.defineProperty(item, "actor", { get() { return this.parent?.documentName === "Actor" ? this.parent : null; } });
  Object.defineProperty(item, "isOwner", { get() { return (this.actor ?? this).testUserPermission(globalThis.game.user, "OWNER"); } });
  const own = item.testUserPermission;
  Object.defineProperty(item, "testUserPermission", { value(user, level) { return this.actor ? this.actor.testUserPermission(user, level) : own.call(this, user, level); } });
  const update = item.update;
  Object.defineProperty(item, "update", {
    async value(changes, options) {
      if (item.throwOnUpdate) throw new Error(item.throwOnUpdate);
      const out = await update.call(this, changes, options);
      this.system.activities?.sync?.();
      return out;
    },
  });
  return item;
}

/** An activity on `item`, as dnd5e hands it to the use hooks. */
export function activityOf(item, id) {
  return item.system.activities.get(id);
}

export function makeActor({ items = [], prototypeToken = {}, ownership = { default: 0 }, parent = null, ...data }) {
  const actor = makeDoc("Actor", {
    type: "character", ownership,
    prototypeToken: { light: { dim: 0, bright: 0 }, sight: { enabled: true, visionMode: "basic", range: 0 }, flags: {}, ...prototypeToken },
    ...data,
  }, { parent });
  const coll = new StubCollection();
  Object.defineProperty(actor, "items", { value: coll, enumerable: false });
  for (const d of items) {
    const it = d.documentName ? d : makeItem(d, actor);
    it.parent = actor;
    it.collection = coll;
    coll.set(it.id, it);
  }
  Object.defineProperty(actor, "isOwner", { get() { return this.testUserPermission(globalThis.game.user, "OWNER"); } });
  Object.defineProperty(actor, "isToken", { get() { return this.parent?.documentName === "Token"; } });
  Object.defineProperty(actor, "token", { get() { return this.isToken ? this.parent : null; } });
  return actor;
}

/** A token; `synthetic` (unlinked) is its own actor with its own items. */
export function makeTok({ synthetic, ...data }) {
  const tok = makeToken({ actorLink: false, light: { dim: 0, bright: 0 }, sight: { enabled: true, visionMode: "basic", range: 0 }, displayName: 50, ...data, ...(synthetic ? { actor: null } : {}) });
  if (synthetic) {
    const a = makeActor({ id: data.actorId, name: data.name, ...synthetic, parent: tok });
    Object.defineProperty(tok, "actor", { value: a, enumerable: false, writable: true });
  }
  Object.defineProperty(tok, "isOwner", { get() { return !!this.actor?.isOwner; } });
  return tok;
}

/* ── changes, as Foundry applies them ──────────────────────────────────── */

function flatten(changes, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(changes ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && v.constructor === Object) flatten(v, path, out);
    else out[path] = v;
  }
  return out;
}
function expand(changes) {
  const out = {};
  for (const [path, value] of Object.entries(flatten(changes))) {
    const parts = path.split(".");
    const leaf = parts.pop();
    let node = out;
    for (const p of parts) node = node[p] ??= {};
    node[leaf] = value;
  }
  return out;
}
function apply(doc, changes) {
  for (const [path, value] of Object.entries(flatten(changes))) {
    const parts = path.split(".");
    let leaf = parts.pop();
    let node = doc;
    for (const p of parts) node = node[p] ??= {};
    const del = F.isDeletion(value) || leaf.startsWith("-=");
    if (leaf.startsWith("-=")) leaf = leaf.slice(2);
    if (del) delete node[leaf];
    else node[leaf] = value;
  }
}

let lightSeq = 0;

/** Scene batches: logged once per call, applied per document, each firing its hook as Foundry does. */
export function addEmbedded(scene) {
  if (!scene.lights) Object.defineProperty(scene, "lights", { value: new StubCollection(), enumerable: false });
  const collFor = type => (type === "Token" ? scene.tokens : type === "AmbientLight" ? scene.lights : null);
  const userId = () => globalThis.game.user?.id ?? null;
  Object.assign(scene, {
    async updateEmbeddedDocuments(type, updates) {
      F.calls.push({ op: "updateEmbedded", scene: scene.id, type, updates: plain(updates) });
      if (scene.throwOnUpdate) throw new Error(scene.throwOnUpdate);
      const out = [];
      for (const { _id, ...changes } of updates) {
        const doc = collFor(type)?.get(_id);
        if (!doc) continue;
        apply(doc, changes);
        out.push(doc);
        F.Hooks.callAll(`update${type}`, doc, expand(changes), {}, userId());
      }
      return out;
    },
    async createEmbeddedDocuments(type, data) {
      F.calls.push({ op: "createEmbedded", scene: scene.id, type, data: plain(data) });
      const out = [];
      for (const d of data) {
        const doc = makeDoc(type, { id: `lgtCreated${String(++lightSeq).padStart(6, "0")}`, ...structuredClone(d) }, { parent: scene });
        doc.collection = collFor(type);
        collFor(type).set(doc.id, doc);
        out.push(doc);
        F.Hooks.callAll(`create${type}`, doc, {}, userId());
      }
      return out;
    },
    async deleteEmbeddedDocuments(type, ids, options = {}) {
      F.calls.push({ op: "deleteEmbedded", scene: scene.id, type, ids: [...ids] });
      const out = [];
      for (const id of ids) {
        const doc = collFor(type)?.get(id);
        if (!doc) continue;
        collFor(type).delete(id);
        out.push(doc);
        F.Hooks.callAll(`delete${type}`, doc, options, userId());
      }
      return out;
    },
  });
  return scene;
}

export function makeLight(data, scene) {
  const l = makeDoc("AmbientLight", { x: 0, y: 0, config: {}, ...data }, { parent: scene });
  l.collection = scene.lights;
  scene.lights.set(l.id, l);
  return l;
}

/* ── the standard world ──────────────────────────────────────────────── */

export const TORCH = { id: ID.torch, name: "Torch", system: { identifier: "torch" } };
export const LANTERN = {
  id: ID.lantern, name: "Lantern, Hooded", system: { identifier: "lantern-hooded" },
  activities: [{ _id: "actLanternUse001", type: "utility", sort: 300000 }],
};
export const LIGHT_SPELL = {
  id: ID.light, name: "Light", type: "spell", system: { identifier: "light" },
  activities: [{ _id: "actLightSummon01", type: "summon", profiles: [{ uuid: "Compendium.dnd5e.phb.Actor.phbsplLight00000" }] }],
};

/**
 * Marrith (linked PC, owned by the player) with a torch, a hooded lantern and the Light cantrip;
 * an unlinked Goblin whose token carries its own lit torch; Hulk chained to a Stake. Two scenes:
 * Cellar (Marrith, Goblin, Hulk, Stake) and Road (a second Marrith token, a second Goblin).
 */
export function standardWorld({ heroItems = [TORCH, LANTERN, LIGHT_SPELL], heroProto = {}, extraActors = [], worldItems = [] } = {}) {
  const owned = { default: 0, [PLAYER]: 3 };
  const hero = makeActor({ id: ID.hero, name: "Marrith", ownership: owned, items: heroItems, prototypeToken: heroProto });
  const goblin = makeActor({ id: ID.goblin, name: "Goblin", type: "npc" });
  const stake = makeActor({ id: ID.stake, name: "Stake", type: "npc" });
  const hulk = makeActor({ id: ID.hulk, name: "Hulk", type: "npc" });
  const s1 = makeScene({
    id: ID.s1, name: "Cellar", active: true, tokens: [
      makeTok({ id: ID.tHero, name: "Marrith", actorId: ID.hero, actorLink: true, x: 100, y: 100 }),
      makeTok({ id: ID.tGob, name: "Goblin", actorId: ID.goblin, displayName: 0, x: 300, y: 100,
        synthetic: { type: "npc", items: [{ id: ID.gobTorch, name: "Torch", system: { identifier: "torch" }, flags: { [MODULE]: { lit: true } } }] } }),
      makeTok({ id: ID.tHulk, name: "Hulk", actorId: ID.hulk, actorLink: true, x: 500, y: 500, flags: { [MODULE]: { chain: { anchor: ID.tStake } } } }),
      makeTok({ id: ID.tStake, name: "Stake", actorId: ID.stake, actorLink: true, x: 200, y: 200 }),
    ],
  });
  const s2 = makeScene({
    id: ID.s2, name: "Road", tokens: [
      makeTok({ id: ID.tHero2, name: "Marrith", actorId: ID.hero, actorLink: true }),
      makeTok({ id: ID.tGob2, name: "Goblin", actorId: ID.goblin, synthetic: { type: "npc", items: [] } }),
    ],
  });
  for (const s of [s1, s2]) addEmbedded(s);
  return { actors: [hero, goblin, stake, hulk, ...extraActors], scenes: [s1, s2], items: worldItems.map(d => makeItem(d)) };
}

/* ── boot ────────────────────────────────────────────────────────────── */

const USERS = {
  [GM]: () => makeUser({ id: GM, name: "Gamemaster", isGM: true }),
  [GM2]: () => makeUser({ id: GM2, name: "Second GM", isGM: true }),
  [PLAYER]: () => makeUser({ id: PLAYER, name: "Player", isGM: false }),
};

/**
 * @param {object} o
 * @param {string} o.user            this client's user id (GM, GM2, PLAYER)
 * @param {object[]} o.others        the other users, as makeUser data or ids
 * @param {object} o.world           { actors, scenes, items } (default standardWorld())
 * @param {boolean|undefined} o.senseVisionSync  dnd5e's setting; undefined = not registered
 * @param {Function} o.beforeImport  (F) => void, after the stub, before the entry loads
 * @param {boolean} o.init / o.ready fire them
 */
export async function boot({ user = GM, others = [PLAYER], world = standardWorld(), senseVisionSync = true, settings = {}, beforeImport, init = true, ready = true, selfActive = true } = {}) {
  const dom = installDom();
  const me = USERS[user]();
  me.active = selfActive;
  const userDocs = others.map(o => (typeof o === "string" ? USERS[o]() : makeUser(o)));
  F = await installFoundry({
    user: me, users: userDocs, actors: world.actors, scenes: world.scenes, items: world.items,
    lang: LANG, modules: [MODULE], settings: { ...(senseVisionSync === undefined ? {} : { "dnd5e.senseVisionSync": senseVisionSync }), ...settings },
  });
  F.dom = dom;
  for (const u of F.game.users) u.targets = new Set();
  if (senseVisionSync !== undefined) F.game.settings.settings.set("dnd5e.senseVisionSync", { namespace: "dnd5e", key: "senseVisionSync", type: Boolean, default: true });
  F.game.settings.settings.set("core.rollMode", { namespace: "core", key: "rollMode", type: String, default: "publicroll" });
  F.game.time = { serverTime: 0 };

  // fromUuidSync over every embedded level the module asks for
  const EMBED = { Token: "tokens", AmbientLight: "lights", Item: "items" };
  globalThis.fromUuidSync = (uuid, _opts) => {
    const parts = String(uuid ?? "").split(".");
    if (parts.length < 2 || parts.length % 2) return null;
    const roots = { Actor: F.game.actors, Item: F.game.items, Scene: F.game.scenes, User: F.game.users };
    let doc = roots[parts[0]]?.get(parts[1]) ?? null;
    for (let i = 2; doc && i < parts.length; i += 2) {
      if (parts[i] === "Actor") doc = doc.actor?.id === parts[i + 1] ? doc.actor : null;
      else doc = doc[EMBED[parts[i]]]?.get?.(parts[i + 1]) ?? null;
    }
    return doc;
  };
  F.fromUuidSync = globalThis.fromUuidSync;

  // Actor.implementation.updateDocuments (the sight reset's prototype batch)
  globalThis.Actor = {
    implementation: {
      async updateDocuments(updates) {
        F.calls.push({ op: "Actor.updateDocuments", updates: plain(updates) });
        for (const { _id, ...changes } of updates) {
          const a = F.game.actors.get(_id);
          if (!a) continue;
          apply(a, changes);
          F.Hooks.callAll("updateActor", a, expand(changes), {}, F.game.user.id);
        }
      },
    },
  };

  // ChatMessage: applyMode (v14) by default; F.useRollMode() switches to the older applyRollMode branch
  const CM = class ChatMessage {
    static getSpeaker({ actor } = {}) { return { actor: actor?.id ?? null, alias: actor?.name ?? null }; }
    static applyMode(data) { data.mode = "applied"; }
    static async create(data) {
      if (F.chatThrows) throw new Error(F.chatThrows);
      F.calls.push({ op: "ChatMessage.create", data: plain(data) });
      return data;
    }
  };
  globalThis.ChatMessage = CM;
  F.useRollMode = () => {
    delete CM.applyMode;
    CM.applyRollMode = (data, mode) => { data.rollMode = mode; };
  };

  // DialogV2
  F.dialogs = [];
  F.dialogChoice = null;
  F.foundry.applications.api.DialogV2 = {
    async wait(cfg) {
      F.dialogs.push(plain(cfg));
      return F.dialogChoice;
    },
  };

  // PIXI, frames, textures
  F.pixi = { sprites: 0, containers: 0 };
  class Container {
    constructor() { this.children = []; this.parent = null; this.destroyed = false; F.pixi.containers++; }
    addChild(...c) { for (const x of c) { x.parent = this; this.children.push(x); } return c[0]; }
    removeChildren() { const out = this.children; this.children = []; for (const c of out) c.parent = null; return out; }
    destroy() { this.destroyed = true; if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  }
  const pt = () => ({ x: 0, y: 0, set(a, b) { this.x = a; this.y = b ?? a; } });
  class TilingSprite extends Container {
    constructor(texture, width, height) {
      super();
      F.pixi.containers--;
      F.pixi.sprites++;
      Object.assign(this, { texture, width, height, tileScale: pt(), anchor: pt(), position: pt(), rotation: 0, tint: 0xffffff, alpha: 1 });
    }
  }
  globalThis.PIXI = { Container, TilingSprite, WRAP_MODES: { REPEAT: 10497 } };
  const frames = new Map();
  let frameSeq = 0;
  globalThis.requestAnimationFrame = fn => { const id = ++frameSeq; frames.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  F.frames = { pending: () => frames.size, flush() { const fns = [...frames.values()]; frames.clear(); for (const fn of fns) fn(0); } };
  F.textures = [];
  F.foundry.canvas.loadTexture = async src => { F.textures.push(src); return F.textureMissing ? null : { baseTexture: {}, destroyed: false }; };

  // the canvas, viewing the Cellar
  const s1 = F.game.scenes.get(ID.s1) ?? F.game.scenes.contents[0] ?? null;
  Object.assign(F.canvas, {
    ready: !!s1, scene: s1,
    primary: new Container(),
    app: { view: el("canvas", { className: "board" }) },
    tokens: { placeables: [] },
    grid: { size: 100, getCenterPoint: p => ({ x: Math.floor(p.x / 100) * 100 + 50, y: Math.floor(p.y / 100) * 100 + 50 }) },
    canvasCoordinatesFromClient: p => ({ x: p.x, y: p.y }),
    dimensions: { distancePixels: 20 },
    perception: { update() {} },
  });
  F.CONFIG.Canvas = { lightAnimations: {} };
  F.foundry.canvas.rendering = {
    shaders: {
      TorchIlluminationShader: class TorchIlluminationShader { static get defaultUniforms() { return {}; } },
      TorchColorationShader: class TorchColorationShader {},
    },
  };
  F.ui.notifications.remove = n => F.calls.push({ op: "notify.remove", message: String(n?.message ?? "") });

  beforeImport?.(F);
  await import("../../senses.mjs");
  if (init) F.fire("init");
  if (ready) {
    F.fire("ready");
    await flush();
  }
  return F;
}

/** Let promise chains run (no timers advance). */
export async function flush(n = 20) {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
}

/** Advance mocked time in steps, flushing between, so debounced work and what it schedules all run. */
export async function settle(mock, { step = 300, rounds = 8 } = {}) {
  for (let i = 0; i < rounds; i++) {
    mock.timers.tick(step);
    await flush();
  }
}

/** The effect log since `mark`, without Hooks.call bookkeeping. */
export function since(mark) {
  return F.calls.slice(mark).filter(c => c.op !== "Hooks.call" && c.op !== "Hooks.callAll");
}

/** Capture console.warn/info/error/log as `[level, text…]` (Errors as their message). */
export function captureConsole(t) {
  const lines = [];
  const fmt = a => (a instanceof Error ? `Error: ${a.message}` : typeof a === "string" ? a : JSON.stringify(a));
  for (const level of ["warn", "info", "error", "log"]) t.mock.method(console, level, (...args) => { lines.push([level, ...args.map(fmt)]); });
  return lines;
}

/** A Token HUD's element and app for `doc`. */
export function tokenHUD(doc) {
  const col = el("div", { className: "col right" });
  const root = el("div", { className: "token-hud", children: [el("div", { className: "col left" }), col] });
  return { app: { object: { document: doc }, renders: 0, render() { this.renders++; } }, element: root, col };
}

export { el };

/** Every published path → `fn.name` for a function, else `typeof` (frozen tables → "object" walked). */
export function surfaceOf(obj, prefix = "", out = {}, seen = new Set()) {
  if (seen.has(obj)) return out;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "function") out[path] = v.name;
    else if (v && typeof v === "object" && !Array.isArray(v)) surfaceOf(v, path, out, seen);
    else out[path] = typeof v;
  }
  return out;
}
