/**
 * The characterisation world (guide step 2): the kit stub plus what the prompts glue reads — a GM,
 * scene `s1` (grid 100 px = 5 ft, two walls and one closed door) holding marker tokens `m1` (mid,
 * "a lantern") and `m2` (small, "goblin boss") and one ordinary token, and the six `Prompt · <size>`
 * actors in the `Prompt Markers` folder. Test-only stand-ins (scene embedded-document API, Actor /
 * Item / Folder / JournalEntry classes, an ApplicationV2 with a fake element, a tiny DOM) live here,
 * never in the kit. Every write is logged on `F.calls`.
 *
 * Install BEFORE importing any glue file: dialog.mjs reads `foundry.applications.api` at load, and
 * typeahead.mjs adds its keyup listener to `window` at load.
 */

import { installFoundry, makeDoc, makeToken, makeScene, StubCollection, stubId } from "../kit/foundry-stub.mjs";
import { readJSON } from "../kit/harness.mjs";
import { SIZES, nameplate } from "../../geometry-core.mjs";

export const MODULE = "pentaryn-prompts";
export const LANG = readJSON(new URL("../../lang/en.json", import.meta.url));

/* ── a tiny DOM: enough for the HUD button, the hover tip and the dialog's element ── */

function matches(el, sel) {
  const m = /^([a-z]+)?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:=([\w-]+))?\])?$/i.exec(sel.trim());
  if (!m) return false;
  const [, tag, classes, attr, val] = m;
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  for (const c of (classes || "").split(".").filter(Boolean)) if (!el.classList.contains(c)) return false;
  if (attr) {
    const key = attr.startsWith("data-") ? attr.slice(5) : attr;
    const has = attr.startsWith("data-") ? key in el.dataset : el.attrs[attr] !== undefined;
    if (!has) return false;
    if (val !== undefined && (attr.startsWith("data-") ? el.dataset[key] : el.attrs[attr]) !== val) return false;
  }
  return true;
}

export class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.attrs = {};
    this.listeners = {};
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.removed = false;
    this.focused = 0;
    this.selection = null;
    this._html = "";
    this._synthetic = new Map();
  }
  get classList() {
    const el = this;
    return {
      contains: c => el.className.split(/\s+/).includes(c),
      add: c => { if (!el.className.split(/\s+/).includes(c)) el.className = `${el.className} ${c}`.trim(); },
      remove: c => { el.className = el.className.split(/\s+/).filter(x => x && x !== c).join(" "); },
    };
  }
  get isConnected() { return !this.removed; }
  get innerHTML() { return this._html; }
  /** innerHTML is kept as text; `[data-x]` children named in it are synthesised on first query. */
  set innerHTML(html) { this._html = String(html); this._synthetic.clear(); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type, ev = {}) { for (const fn of this.listeners[type] ?? []) fn(ev); }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  remove() { this.removed = true; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); }
  focus() { this.focused++; }
  setSelectionRange(a, b) { this.selection = [a, b]; }
  closest() { return null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = el => { for (const c of el.children) { if (matches(c, sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) {
    const hit = this.querySelectorAll(sel)[0];
    if (hit) return hit;
    const attr = /^\[data-([\w-]+)\]$/.exec(sel.trim());
    if (attr && this._html.includes(`data-${attr[1]}`)) {
      if (!this._synthetic.has(sel)) this._synthetic.set(sel, new FakeElement("span"));
      return this._synthetic.get(sel);
    }
    return null;
  }
}

function installDom() {
  const body = new FakeElement("body");
  const doc = { body, activeElement: body, createElement: tag => new FakeElement(tag) };
  const listeners = {};
  const win = {
    innerWidth: 1600, innerHeight: 900, listeners,
    addEventListener: (type, fn, capture) => (listeners[type] ??= []).push({ fn, capture }),
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter(l => l.fn !== fn); },
  };
  return { document: doc, window: win, HTMLElement: FakeElement };
}

/* ── ApplicationV2: render prepares the context, builds the element once, runs _onRender ── */

export function makeApplicationV2() {
  const W = () => globalThis.__ppWorld;   // the installed world (dialog.mjs keeps the class across worlds)
  return class ApplicationV2 {
    static instances = [];
    constructor() {
      this.rendered = false;
      this.element = null;
      this.renders = [];
      ApplicationV2.instances.push(this);
    }
    async render(options = {}) {
      const context = await this._prepareContext?.(options);
      if (!this.element) {
        const root = new FakeElement("div");
        const ta = root.appendChild(new FakeElement("textarea"));
        ta.attrs.name = "prompt";
        ta.value = context?.text ?? "";
        const panel = root.appendChild(new FakeElement("div"));
        panel.dataset.panel = "";
        root.parentElement = globalThis.document?.body ?? null;
        this.element = root;
      }
      this.renders.push({ options: W().plain(options), context: W().plain(context) });
      W().calls.push({ op: "app.render", force: !!options.force, title: options.window?.title ?? null });
      this.rendered = true;
      await this._onRender?.(context, options);
      return this;
    }
    async close(options = {}) {
      W().calls.push({ op: "app.close", options: W().plain(options) });
      this.rendered = false;
      if (this.element) this.element.removed = true;
      return this;
    }
    // core reads this.element.style here: before the first render the element is not there yet and it throws
    bringToFront() {
      if (!this.element) throw new TypeError("Cannot read properties of undefined (reading 'style')");
      W().calls.push({ op: "app.bringToFront" });
    }
    _onPosition() {}
    _updatePosition(position) { return position; }
  };
}

/* ── documents ─────────────────────────────────────────────────────────── */

export const DIMS = { size: 100, distance: 5, distancePixels: 20, sceneX: 0, sceneY: 0, sceneWidth: 2000, sceneHeight: 1000 };

/** A token document with the bits the glue calls on tokens (updateSource, getSnappedPosition). */
export function token(data, scene = null) {
  const tok = makeToken({ texture: { src: "" }, disposition: -1, actorLink: false, ...data }, scene);
  Object.defineProperty(tok, "updateSource", {
    enumerable: false,
    value(changes) {
      for (const [path, v] of Object.entries(changes)) foundry.utils.setProperty(this, path, v);
      return this;
    },
  });
  Object.defineProperty(tok, "getSnappedPosition", { enumerable: false, value: p => ({ x: p.x, y: p.y }) });
  return tok;
}

/** A marker actor (`Prompt · <size>`), its `_source` already what ensureMarkers wants (no repair). */
export function markerActorData(s, folder) {
  const D = CONST.TOKEN_DISPOSITIONS, N = CONST.TOKEN_DISPLAY_MODES;
  const art = `modules/${MODULE}/assets/marker-${s.key}.webp`;
  const proto = {
    name: nameplate("", s.key), width: s.w, height: s.w, displayName: N.ALWAYS, displayBars: N.NONE, actorLink: false,
    lockRotation: true, disposition: D.SECRET, sight: { enabled: false }, ring: { enabled: false },
    texture: { src: art, scaleX: s.scale, scaleY: s.scale, tint: "#ff6b6b" },
    flags: { dnd5e: { lockSize: true }, [MODULE]: { marker: s.key } },
  };
  const src = {
    name: `Prompt · ${s.key}`, folder: folder.id, img: art, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    system: { traits: { size: s.dnd } }, flags: { [MODULE]: { marker: s.key } }, prototypeToken: proto,
  };
  return { id: `markerActor${s.key}`.padEnd(16, "0").slice(0, 16), type: "npc", ...structuredClone(src), folder, _source: src };
}

/** Wire `getTokenDocument` onto an actor document (what placeAtCursor, #onSize and replace call). */
export function withTokenDocument(F, actor) {
  Object.defineProperty(actor, "getTokenDocument", {
    enumerable: false,
    value: async (pos, opts = {}) => {
      F.calls.push({ op: "getTokenDocument", actorId: actor.id, pos: F.plain(pos), parent: opts.parent?.id ?? null });
      const p = actor.prototypeToken ?? {};
      const data = {
        _id: "tdTokenDoc000001", name: p.name ?? actor.name, actorId: actor.id, x: pos.x, y: pos.y,
        width: p.width ?? 1, height: p.height ?? 1, texture: structuredClone(p.texture ?? { src: actor.img ?? "" }),
        disposition: p.disposition ?? -1, actorLink: !!p.actorLink, flags: structuredClone(p.flags ?? {}),
      };
      return { toObject: () => structuredClone(data), getSnappedPosition: q => ({ x: Math.round(q.x / 50) * 50, y: Math.round(q.y / 50) * 50 }) };
    },
  });
  return actor;
}

const EMBED = { Token: "tokens", Note: "notes", AmbientLight: "lights", Tile: "tiles", Wall: "walls", Region: "regions" };

/** Give a stub scene the embedded-document API (create / delete / get) with pre/create/delete hooks. */
export function sceneApi(F, scene) {
  for (const name of ["notes", "lights", "tiles"]) {
    if (!scene[name]) Object.defineProperty(scene, name, { value: new StubCollection(), enumerable: false, writable: true });
  }
  const coll = type => scene[EMBED[type]];
  Object.assign(scene, {
    fail: {},   // test switches: fail[type] = "batch" | "all" | "cancel"
  });
  Object.defineProperties(scene, {
    getEmbeddedDocument: { enumerable: false, configurable: true, value: (type, id) => coll(type)?.get?.(id) ?? null },
    createEmbeddedDocuments: {
      enumerable: false, configurable: true,
      async value(type, rows, options = {}) {
        F.calls.push({ op: "createEmbeddedDocuments", scene: scene.id, type, data: F.plain(rows), options: F.plain(options) });
        const mode = scene.fail[type];
        if (mode === "all" || (mode === "batch" && rows.length > 1)) throw new Error(`stub: ${type} create refused`);
        const out = [];
        for (const row of rows) {
          const data = structuredClone(row);
          delete data._id;
          const id = stubId(type.slice(0, 3));
          const doc = type === "Token" ? token({ ...data, id }, scene) : makeDoc(type, { ...data, id }, { parent: scene });
          if (!("name" in data) && type !== "Token") delete doc.name;   // lights, tiles and notes have no name
          if (type === "Token") {
            if (F.Hooks.call("preCreateToken", doc, data, options, F.game.user.id) === false) continue;
          }
          if (mode === "cancel") continue;
          doc.collection = coll(type);
          coll(type).set(doc.id, doc);
          out.push(doc);
          F.Hooks.callAll(`create${type}`, doc, options, F.game.user.id);
        }
        return out;
      },
    },
    deleteEmbeddedDocuments: {
      enumerable: false, configurable: true,
      async value(type, ids, options = {}) {
        F.calls.push({ op: "deleteEmbeddedDocuments", scene: scene.id, type, ids: [...ids] });
        const out = [];
        for (const id of ids) {
          const doc = coll(type)?.get(id);
          if (!doc) continue;
          coll(type).delete(id);
          out.push(doc);
          F.Hooks.callAll(`delete${type}`, doc, options, F.game.user.id);
        }
        return out;
      },
    },
    view: { enumerable: false, configurable: true, value: async () => { F.calls.push({ op: "scene.view", scene: scene.id }); F.canvas.scene = scene; return scene; } },
  });
  return scene;
}

/** Walls of s1: a plain wall (sight 20, threshold 2 squares of sight), a non-sight wall, a closed door. */
export const S1_WALLS = [
  { id: "wallPlain0000001", c: [1000, 0, 1000, 400], sight: 20, dir: 0, door: 0, ds: 0, threshold: { sight: 2 }, flags: {} },
  { id: "wallNoSight00001", c: [0, 600, 600, 600], sight: 0, dir: 0, door: 0, ds: 0, flags: {} },
  { id: "wallDoor00000001", c: [1000, 400, 1000, 500], sight: 20, dir: 0, door: 1, ds: 0, flags: {} },
];

export function s1Tokens() {
  return [
    { id: "m1", name: "Prompt · mid", actorId: "markerActormid00", x: 200, y: 200, width: 1, height: 1, hidden: true,
      texture: { src: `modules/${MODULE}/assets/marker-mid.webp` }, flags: { [MODULE]: { marker: "mid", prompt: "a lantern", updatedAt: 1760000000000 } } },
    { id: "m2", name: "Prompt · small", actorId: "markerActorsmall", x: 600, y: 200, width: 1, height: 1, hidden: true,
      texture: { src: `modules/${MODULE}/assets/marker-small.webp` }, flags: { [MODULE]: { marker: "small", prompt: "goblin boss" } } },
    { id: "tokOrdinary00001", name: "Guard", actorId: "actorGuard000001", x: 400, y: 500, width: 1, height: 1, disposition: 1,
      texture: { src: "tokens/guard.webp" }, flags: {} },
  ];
}

/**
 * Install the stub world. → `F` (the kit stub) with `F.s1`, `F.folder`, `F.dom`, `F.packs`.
 * opts: `currentScene` (default "s1"), `extraActors`, `extraScenes`, `settings`, `user`, `modules`.
 */
export async function installWorld(opts = {}) {
  const dom = installDom();
  for (const [k, v] of Object.entries(dom)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const F = await installFoundry({
    lang: LANG, settings: opts.settings ?? {}, modules: opts.modules ?? [], user: opts.user,
    activeScopes: [MODULE, "dnd5e", "item-piles"],
    users: opts.users ?? [],
  });
  F.dom = dom;
  globalThis.__ppWorld = F;

  /* folders */
  const folders = new StubCollection();
  const folder = makeDoc("Folder", { id: "folderPrompts001", name: "Prompt Markers", type: "Actor", folder: null });
  folders.set(folder.id, folder);
  F.game.folders = folders;
  F.folder = folder;
  class Folder {
    static async create(data) {
      F.calls.push({ op: "Folder.create", data: F.plain(data) });
      const f = makeDoc("Folder", { folder: null, ...data });
      folders.set(f.id, f);
      return f;
    }
  }
  Folder.implementation = Folder;

  /* actors */
  class Actor {
    // a created document gets a new id (the stub's toObject() carries `id`, Foundry's carries `_id`)
    static async createDocuments(rows) {
      F.calls.push({ op: "Actor.createDocuments", data: F.plain(rows) });
      return rows.map(({ id, _id, ...r }) => addActor(r));
    }
    // Foundry's batch update: one call, then each document's update (and its hooks)
    static async updateDocuments(rows) {
      F.calls.push({ op: "Actor.updateDocuments", ids: rows.map(r => r._id) });
      return Promise.all(rows.map(({ _id, ...changes }) => F.game.actors.get(_id).update(changes)));
    }
    static async create(data) {
      F.calls.push({ op: "Actor.create", data: F.plain(data) });
      const { id, _id, ...rest } = data;
      return addActor(rest);
    }
  }
  Actor.implementation = Actor;
  class Item {}
  class JournalEntry {
    static async create(data) {
      F.calls.push({ op: "JournalEntry.create", data: F.plain(data) });
      const je = makeDoc("JournalEntry", { ...data });
      const pages = new StubCollection((data.pages ?? []).map((p, i) => makeDoc("JournalEntryPage", { id: `page${i}`.padEnd(16, "0"), ...p })));
      Object.defineProperty(je, "pages", { value: pages, enumerable: false });
      je.collection = F.game.journal;
      F.game.journal.set(je.id, je);
      return je;
    }
  }
  JournalEntry.implementation = JournalEntry;
  const defineGlobal = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  defineGlobal("Actor", Actor);
  defineGlobal("Item", Item);
  defineGlobal("Folder", Folder);
  defineGlobal("JournalEntry", JournalEntry);
  F.Actor = Actor;
  F.Item = Item;

  const addActor = data => {
    const a = makeDoc("Actor", { items: undefined, ...data });
    if (!(a.items instanceof StubCollection)) {
      const items = new StubCollection((data.items ?? []).map(i => makeDoc("Item", i)));
      Object.defineProperty(a, "items", { value: items, enumerable: false, writable: true });
    }
    Object.setPrototypeOf(a, Actor.prototype);
    a.collection = F.game.actors;
    F.game.actors.set(a.id, a);
    withTokenDocument(F, a);
    return a;
  };
  F.addActor = addActor;
  for (const s of SIZES) addActor(markerActorData(s, folder));
  addActor({ id: "actorGuard000001", name: "Guard", type: "npc", img: "tokens/guard.webp",
    system: { details: { cr: 0.125, biography: { value: "<p>A bored town guard.</p>" }, type: { value: "humanoid" } },
      attributes: { ac: { value: 16 }, hp: { value: 11, max: 11 } }, traits: { size: "med" } },
    prototypeToken: { name: "Guard", width: 1, height: 1, disposition: 1, texture: { src: "tokens/guard.webp" } } });
  for (const a of opts.extraActors ?? []) addActor(a);

  /* scenes */
  const s1 = makeScene({ id: "s1", name: "ZZ Characterisation", navName: "Char", navigation: true, navOrder: 1,
    tokens: s1Tokens().map(t => token(t)), dimensions: { ...DIMS }, grid: { distance: 5, size: 100, isHexagonal: false, isGridless: false },
    description: "<p>A test room.</p>" });
  Object.defineProperty(s1, "walls", { value: structuredClone(S1_WALLS), enumerable: false, writable: true });
  for (const t of s1.tokens) t.parent = s1;
  s1.collection = F.game.scenes;
  F.game.scenes.set(s1.id, s1);
  sceneApi(F, s1);
  F.s1 = s1;
  for (const make of opts.extraScenes ?? []) {
    const s = make(F);
    s.collection = F.game.scenes;
    F.game.scenes.set(s.id, s);
    sceneApi(F, s);
  }

  /* packs (empty unless a test adds some) */
  F.game.packs = new StubCollection();

  /* canvas */
  const current = opts.currentScene === null ? null : F.game.scenes.get(opts.currentScene ?? "s1");
  Object.assign(F.canvas, {
    ready: !!current, scene: current, grid: { size: 100 }, level: null, mousePosition: { x: 550, y: 350 },
    tokens: { placeables: [], hover: null }, stage: { scale: { x: 1 } },
    clientCoordinatesFromCanvas: p => ({ x: p.x / 2 + 10, y: p.y / 2 + 20 }),
    animatePan: async o => { F.calls.push({ op: "canvas.animatePan", ...F.plain(o) }); return true; },
    ping: o => { F.calls.push({ op: "canvas.ping", ...F.plain(o) }); },
  });

  /* foundry namespace additions */
  F.foundry.applications.api.ApplicationV2 = makeApplicationV2();
  F.foundry.data.LightData = { schema: { fields: { dim: {}, bright: {}, color: {}, alpha: {}, angle: {}, animation: {}, luminosity: {} } } };
  F.CONFIG.Token.objectClass.prototype._onClickLeft2 = function original(event) {
    F.calls.push({ op: "Token#_onClickLeft2 (original)", token: this?.document?.id ?? null, event: event ?? null });
    return "original";
  };
  return F;
}

/** Silence console.log/warn/error for `fn`, returning what was printed: `[{level, text}]`. */
export async function captureConsole(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  const out = [];
  for (const level of Object.keys(saved)) console[level] = (...args) => out.push({ level, text: args.map(a => (a instanceof Error ? `Error(${a.message})` : typeof a === "string" ? a : JSON.stringify(a))).join(" ") });
  try {
    const value = await fn();
    return { value, out };
  } finally {
    Object.assign(console, saved);
  }
}

/**
 * Add a scene to an installed world: `{id, name, tokens, walls, notes, lights, tiles, regions, ...}`.
 * Tokens become `token()` documents; notes, lights and tiles plain stub documents. Grid 100 px =
 * 5 ft unless `dimensions` / `grid` say otherwise. → the scene, with the embedded-document API.
 */
export function addScene(F, { id, name, tokens = [], walls = [], notes = [], lights = [], tiles = [], regions = [], ...rest }) {
  const scene = makeScene({ id, name, navigation: false, dimensions: { ...DIMS }, grid: { distance: 5, size: 100, isHexagonal: false, isGridless: false },
    tokens: tokens.map(t => (t.documentName ? t : token(t))), regions, ...rest });
  for (const t of scene.tokens) t.parent = scene;
  Object.defineProperty(scene, "walls", { value: walls, enumerable: false, writable: true });
  for (const [key, list, type] of [["notes", notes, "Note"], ["lights", lights, "AmbientLight"], ["tiles", tiles, "Tile"]]) {
    const coll = new StubCollection();
    for (const d of list) {
      const doc = d.documentName ? d : makeDoc(type, d, { parent: scene });
      if (!d.documentName && !("name" in d)) delete doc.name;
      doc.collection = coll;
      coll.set(doc.id, doc);
    }
    Object.defineProperty(scene, key, { value: coll, enumerable: false, writable: true });
  }
  scene.collection = F.game.scenes;
  F.game.scenes.set(scene.id, scene);
  return sceneApi(F, scene);
}

/**
 * A compendium pack of Items: `getIndex()` (logged on `F.calls`), `getDocument(id)` → an `Item`
 * instance with `uuid` `Compendium.<pack>.Item.<_id>`. Also wires `game.items.fromCompendium`
 * (a clone without `_id`) and `fromUuid` / `fromUuidSync` for those uuids. → the pack.
 */
export function addItemPack(F, id, entries, { type = "Item" } = {}) {
  const docs = new Map();
  for (const e of entries) {
    const doc = Object.assign(Object.create(globalThis.Item.prototype), {
      documentName: "Item", id: e._id, _id: e._id, name: e.name, type: e.type, system: structuredClone(e.system ?? {}),
      uuid: `Compendium.${id}.Item.${e._id}`, pack: id, toObject() { const { uuid, pack, ...o } = structuredClone({ ...this }); return o; }
    });
    docs.set(e._id, doc);
  }
  const pack = {
    collection: id, metadata: { id, type },
    getIndex: async opts => {
      F.calls.push({ op: "pack.getIndex", pack: id, fields: opts?.fields ?? null });
      return entries.map(e => ({ _id: e._id, name: e.name, type: e.type, uuid: `Compendium.${id}.Item.${e._id}` }));
    },
    getDocument: async docId => docs.get(docId) ?? null
  };
  F.game.packs.set(id, pack);
  F.game.items.fromCompendium = doc => {
    const o = structuredClone({ name: doc.name, type: doc.type, system: doc.system ?? {}, flags: doc.flags ?? {} });
    return o;
  };
  const prevAsync = globalThis.fromUuid, prevSync = globalThis.fromUuidSync;
  const find = uuid => {
    const m = /^Compendium\.(.+)\.Item\.([^.]+)$/.exec(String(uuid));
    return m && m[1] === id ? docs.get(m[2]) ?? null : undefined;
  };
  globalThis.fromUuid = async uuid => { const d = find(uuid); return d === undefined ? prevAsync(uuid) : d; };
  globalThis.fromUuidSync = uuid => { const d = find(uuid); return d === undefined ? prevSync(uuid) : d; };
  return pack;
}
