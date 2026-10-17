/**
 * Boot pentaryn-portals on the kit's Foundry stub, plus what portals touches beyond it: a DOM
 * (fixtures/dom.mjs), PIXI, the canvas (interface layer, fog, visibility, pan), regions with
 * teleport behaviours, scene walls / tiles / embedded writes, ApplicationV2, DialogV2.confirm,
 * FilePicker, Image / File / an image canvas, requestAnimationFrame, and a `fromUuidSync` that
 * resolves embedded and relative uuids (Foundry's own `parseUuid`). Synthetic data only.
 *
 * One boot per process: the entry registers every hook at module evaluation.
 * Timers: `setTimeout` is mocked (node:test mock.timers) before the entry loads; `tick()` runs
 * the zero-delay ones (the ready publish, the deleteToken follow) and flushes promises.
 */
import { mock } from "node:test";
import { installFoundry, makeDoc, makeToken, makeScene, StubCollection } from "../kit/foundry-stub.mjs";
import { readJSON } from "../kit/harness.mjs";

/** lang/en.json, so _loc renders every string as Foundry would (Wave 7 batch, -29). */
const LANG = readJSON(new URL("../../lang/en.json", import.meta.url));
import { installDom, FakeElement } from "./dom.mjs";
import { seams } from "./seams.mjs";

export const MODULE = "pentaryn-portals";
export const GM = "gmUser0000000001";
export const P1 = "player0000000001";
export const P2 = "player0000000002";

/* ── PIXI ─────────────────────────────────────────────────────────────── */

const point = (x = 0, y = 0) => ({ x, y, set(a, b = a) { this.x = a; this.y = b; } });

class DisplayObject {
  constructor() {
    this.children = [];
    this.parent = null;
    this.destroyed = false;
    this.visible = true;
    this.alpha = 1;
    this.position = point();
    this.scale = point(1, 1);
    this.anchor = point();
  }
  get x() { return this.position.x; }
  set x(v) { this.position.x = v; }
  get y() { return this.position.y; }
  set y(v) { this.position.y = v; }
  addChild(...kids) {
    for (const k of kids) { k.parent = this; this.children.push(k); }
    return kids[0];
  }
  destroy(opts) {
    if (PIXI.throwOnDestroy) throw new Error("destroy failed");
    this.destroyed = true;
    if (opts?.children) for (const k of [...this.children]) k.destroy(opts);
    if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this);
  }
}
class Container extends DisplayObject {}
class Graphics extends DisplayObject {
  constructor() {
    super();
    this.ops = [];
    for (const m of ["beginFill", "endFill", "drawCircle", "drawPolygon", "drawRect", "lineStyle"]) {
      this[m] = (...args) => { this.ops.push([m, ...args]); return this; };
    }
  }
}
class Sprite extends DisplayObject {
  constructor(texture) { super(); this.texture = texture; this.mask = null; }
}
class Text extends DisplayObject {
  constructor(text, style) { super(); this.text = text; this.style = style; }
}

/** A badge container as plain data, for pins. */
export function pixiTree(o) {
  const out = { kind: o.constructor.name };
  if (o.x || o.y) out.at = [round(o.x), round(o.y)];
  if (o.alpha !== 1) out.alpha = o.alpha;
  if (!o.visible) out.visible = false;
  if (o.text !== undefined) out.text = o.text;
  if (o.style) out.style = o.style;
  if (o.ops) out.ops = o.ops.map(op => op.map(v => (typeof v === "number" ? round(v) : Array.isArray(v) ? v.map(round) : v)));
  if (o.texture) out.texture = o.texture.src;
  if (o.scale.x !== 1) out.scale = round(o.scale.x);
  if (o.anchor.x) out.anchor = o.anchor.x;
  if (o.mask) out.masked = true;
  if (o.children.length) out.children = o.children.map(pixiTree);
  return out;
}
const round = v => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);

/* ── world documents ──────────────────────────────────────────────────── */

let F = null;

function boundsOf({ x, y, width, height }) {
  return { x, y, width, height, contains: (px, py) => px >= x && px < x + width && py >= y && py < y + height };
}

/** Core v14 (client/documents/token.mjs #inferMovementWaypoints): the `teleport` update option warns. */
function teleportOptionWarning(options) {
  if (options && "teleport" in options) {
    foundry.utils.logCompatibilityWarning("DatabaseUpdateOperation#teleport has been deprecated. "
      + "Use DatabaseUpdateOperation#waypoints or TokenDocument#movement instead.", { since: 13, until: 15 });
  }
}

function embedded(doc, coll, documentName) {
  Object.defineProperty(doc, coll, { value: new StubCollection(), enumerable: false, writable: true });
  return doc[coll];
}

/** A scene with grid, dimensions, walls, tiles and the embedded write methods portals calls. */
export function scene({ id, name, navName = "", thumb = null, background = null, grid = 100, regions = [], tokens = [], walls = [], tiles = [] } = {}) {
  const s = makeScene({ id, name, navName, thumb });
  // v14 shape: the art lives on the scene's Levels. Scene#background is core's deprecated shim
  // (client/documents/scene.mjs): it warns through logCompatibilityWarning, then reads firstLevel.
  embedded(s, "levels");
  const level = makeDoc("Level", { id: `${id}Lvl0`, name: "Level", background: { src: background }, textures: {} }, { parent: s });
  s.levels.set(level.id, level);
  Object.defineProperties(s, {
    firstLevel: { get: () => s.levels.values().next()?.value, enumerable: false },
    initialLevel: { get: () => s.firstLevel, enumerable: false },
    background: {
      get() {
        foundry.utils.logCompatibilityWarning("Scene#background is deprecated. Use Level#background and Level#textures instead.",
          { since: 14, until: 16 });   // core adds once: true; left off so each test sees its own read
        return { src: s.firstLevel?.background?.src ?? null };
      },
      enumerable: false, configurable: true,
    },
  });
  s.grid = {
    size: grid,
    getSnappedPoint: ({ x, y }, { mode } = {}) => {
      F.calls.push({ op: "getSnappedPoint", x, y, mode });
      return { x: Math.round(x / grid) * grid, y: Math.round(y / grid) * grid };
    },
  };
  s.dimensions = { sceneX: 100, sceneY: 100, sceneWidth: 2000, sceneHeight: 1000, size: grid };
  embedded(s, "walls");
  embedded(s, "tiles");
  for (const w of walls) s.walls.set(w.id, makeDoc("Wall", w, { parent: s }));
  for (const t of tiles) s.tiles.set(t.id, makeDoc("Tile", t, { parent: s }));
  const collOf = type => ({ Token: s.tokens, Tile: s.tiles, Wall: s.walls, Region: s.regions })[type];
  Object.assign(s, {
    async createEmbeddedDocuments(type, data, options = {}) {
      F.calls.push({ op: "createEmbedded", parent: s.uuid, type, ids: data.map(d => d.id ?? d._id ?? null), options: F.plain(options) });
      const coll = collOf(type);
      const made = [];
      for (const d of data) {
        const want = options.keepId ? d.id ?? d._id : undefined;
        if (want && coll.has(want)) throw new Error(`The ${type} [${want}] already exists within the parent collection`);
        const data = { ...d };
        delete data._id;
        if (want) data.id = want;
        else delete data.id;
        const doc = type === "Token" ? asCoreToken(makeToken(data, s)) : makeDoc(type, data, { parent: s });
        doc.parent = s;
        doc.collection = coll;
        coll.set(doc.id, doc);
        made.push(doc);
      }
      return made;
    },
    async deleteEmbeddedDocuments(type, ids, options = {}) {
      F.calls.push({ op: "deleteEmbedded", parent: s.uuid, type, ids: [...ids], options: F.plain(options) });
      const coll = collOf(type);
      const gone = ids.map(i => coll.get(i)).filter(Boolean);
      for (const d of gone) coll.delete(d.id);
      for (const d of gone) F.Hooks.callAll(`delete${type}`, d, options, F.game.user.id);
      return gone;
    },
    async updateEmbeddedDocuments(type, updates, options = {}) {
      F.calls.push({ op: "updateEmbedded", parent: s.uuid, type, updates: F.plain(updates), options: F.plain(options) });
      if (type === "Token") teleportOptionWarning(options);
      const coll = collOf(type);
      for (const { _id, ...rest } of updates) Object.assign(coll.get(_id) ?? {}, rest);
      return updates;
    },
    // viewOptions are recorded only when the caller passes them, so a bare view() / pullUsers(users) records as before
    async view(...args) {
      F.calls.push({ op: "scene.view", scene: s.id, ...(args.length ? { options: F.plain(args[0]) } : {}) });
      F.canvas.scene = s;
    },
    pullUsers(users, ...args) {
      F.calls.push({ op: "pullUsers", scene: s.id, users: [...users].map(u => (typeof u === "string" ? u : u.id)), ...(args.length ? { options: F.plain(args[0]) } : {}) });
    },
  });
  for (const r of regions) region(s, r);
  for (const t of tokens) token(s, t);
  F.game.scenes.set(s.id, s);
  s.collection = F.game.scenes;
  return s;
}

/** A region on `s`: bounds, shapes, behaviours (teleportToken by default), sheet, testPoint. */
export function region(s, { id, name, bounds = { x: 0, y: 0, width: 100, height: 100 }, shapes, hidden = false, flags = {}, behaviors = [], testPoint } = {}) {
  const shapeList = shapes ?? [{ type: "rectangle", x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, width: bounds.width, height: bounds.height }];
  const r = makeDoc("Region", { id, name, hidden, flags, shapes: shapeList }, { parent: s });
  Object.defineProperty(r, "bounds", { value: bounds ? boundsOf(bounds) : null, enumerable: false, writable: true });
  embedded(r, "behaviors");
  Object.defineProperty(r, "sheet", { value: { render: force => F.calls.push({ op: "sheet.render", uuid: r.uuid, force }) }, enumerable: false });
  Object.defineProperty(r, "testPoint", { value: testPoint ?? (p => r.bounds.contains(p.x, p.y)), enumerable: false, writable: true });
  Object.defineProperty(r, "createEmbeddedDocuments", {
    enumerable: false,
    value: async (type, data, options = {}) => {
      F.calls.push({ op: "createEmbedded", parent: r.uuid, type, data: F.plain(data), options: F.plain(options) });
      return data.map(d => behavior(r, { name: d.name, type: d.type, ...d.system }));
    },
  });
  // One batched write of the region's behaviours (C59): recorded once as `updateEmbedded`; each
  // behaviour still applies its changes and fires its own update hook, as Foundry does.
  Object.defineProperty(r, "updateEmbeddedDocuments", {
    enumerable: false,
    value: async (type, updates, options = {}) => {
      F.calls.push({ op: "updateEmbedded", parent: r.uuid, type, updates: F.plain(updates), options: F.plain(options) });
      const out = [];
      for (const { _id, ...changes } of updates) {
        const b = r.behaviors.get(_id);
        if (!b) continue;
        const i = F.calls.length;
        await b.update(changes, options);
        const j = F.calls.findIndex((c, k) => k >= i && c.op === "update" && c.uuid === b.uuid);
        if (j >= 0) F.calls.splice(j, 1);   // the batch is the one recorded write
        out.push(b);
      }
      return out;
    },
  });
  for (const b of behaviors) behavior(r, b);
  s.regions.set(r.id, r);
  r.collection = s.regions;
  return r;
}

/** A RegionBehavior; `destinations` is a Set, as Foundry's SetField. */
export function behavior(r, { id, name = "Teleport", type = "teleportToken", disabled = false, destinations = [], revealed = true, choice = true, dialog = { revealed: null, unrevealed: null }, ...system } = {}) {
  const b = makeDoc("RegionBehavior", { id, name, type, disabled, system: { ...system, destinations: new Set(destinations), revealed, choice, dialog } }, { parent: r });
  r.behaviors.set(b.id, b);
  b.collection = r.behaviors;
  return b;
}

/**
 * Core's TokenDocument#testUserPermission: a token with an actor answers by its actor's ownership
 * (client/documents/token.mjs), not by its own (the kit stub's makeDoc reads the document's own).
 */
function asCoreToken(t) {
  const own = t.testUserPermission;
  Object.defineProperty(t, "testUserPermission", {
    value(user, level = "OWNER") { return this.actor ? this.actor.testUserPermission(user, level) : own.call(this, user, level); },
    enumerable: false,
  });
  return t;
}

/** A token on `s`. */
export function token(s, data) {
  const t = asCoreToken(makeToken({ actorLink: false, ...data }, s));
  t.collection = s.tokens;
  s.tokens.set(t.id, t);
  return t;
}

/** An actor in game.actors; `folder` is a name chain, innermost first. */
export function actor({ folders = [], ...data }) {
  let folder = null;
  for (const name of [...folders].reverse()) folder = { name, folder };
  const a = makeDoc("Actor", { type: "npc", ...data });
  Object.defineProperty(a, "folder", { value: folder, enumerable: false });
  F.game.actors.set(a.id, a);
  return a;
}

/* ── resolver ─────────────────────────────────────────────────────────── */

const EMBEDDED = { Token: "tokens", Region: "regions", RegionBehavior: "behaviors", Tile: "tiles", Wall: "walls" };

function resolve(uuid, options = {}) {
  let abs = uuid;
  if (typeof uuid === "string" && uuid.startsWith(".")) abs = options.relative ? foundry.utils.parseUuid(uuid, { relative: options.relative })?.uuid : null;
  if (typeof abs !== "string") return null;
  const parts = abs.split(".");
  const roots = { Scene: F.game.scenes, Actor: F.game.actors, User: F.game.users };
  let doc = roots[parts[0]]?.get(parts[1]) ?? null;
  for (let i = 2; doc && i < parts.length; i += 2) doc = doc[EMBEDDED[parts[i]]]?.get(parts[i + 1]) ?? null;
  return doc;
}

/* ── boot ─────────────────────────────────────────────────────────────── */

export const console$ = [];   // [level, firstArgText, secondArg]

/**
 * @param {object} [o]
 * @param {object} [o.settings]  "pentaryn-portals.<key>" → value
 * @returns {Promise<{F, S, W}>}
 */
export async function boot({ settings = {} } = {}) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const doc = installDom();
  F = await installFoundry({
    users: [{ id: P1, name: "Ana" }, { id: P2, name: "Bo" }],
    settings,
    modules: [MODULE],
    activeScopes: ["pentaryn", "pentaryn-aoe"],
    lang: LANG,
  });
  globalThis.PIXI = { Container, Graphics, Sprite, Text, throwOnDestroy: false };
  foundry.abstract = { Document: Object };            // parseUuid's relative branch checks instanceof
  globalThis.fromUuidSync = (u, o) => resolve(u, o);
  globalThis.fromUuid = async (u, o) => resolve(u, o);

  const W = {
    doc, F,
    textures: {},           // src → { src, width, height } | Promise | "reject"
    images: {},             // src → { naturalWidth, naturalHeight }
    explored: () => false,
    visible: () => false,
    confirm: true,          // DialogV2.confirm answer; "reject" to reject
    dirExists: false,
    raf: [],
    scene, region, behavior, token, actor,
    async tick(n = 6) {
      mock.timers.tick(0);
      for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
    },
    async flush(n = 6) { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); },
    callsSince(i, ops) { return F.calls.slice(i).filter(c => !ops || ops.includes(c.op)); },
    /** Core compatibility warnings logged since F.logged[i] (what a v14 client prints as deprecated). */
    deprecationsSince(i) {
      return F.logged.slice(i).map(l => String(l.args?.[0] ?? "")).filter(m => /deprecated/i.test(m));
    },
  };
  // A single Token#update with the `teleport` option warns as core does. Wrapped, not Hooks.on,
  // so the registration manifest (golden/hooks.json) stays the module's own.
  const hooksCall = F.Hooks.call;
  F.Hooks.call = function (name, ...args) {
    if (name === "preUpdateToken") teleportOptionWarning(args[2]);
    return hooksCall.call(this, name, ...args);
  };

  Object.assign(F.canvas, {
    ready: false,
    scene: null,
    interface: new Container(),
    grid: { size: 100 },
    fog: { isPointExplored: p => W.explored(p) },
    visibility: { testVisibility: (pts, opts) => { F.calls.push({ op: "testVisibility", n: pts.length, opts }); return W.visible(pts); } },
    canvasCoordinatesFromClient: ({ x, y }) => ({ x, y }),
    animatePan: async o => { F.calls.push({ op: "animatePan", ...o }); return true; },
    stage: { scale: { x: 0.5 } },
  });
  foundry.canvas = {
    ...foundry.canvas,
    loadTexture: async src => {
      F.calls.push({ op: "loadTexture", src });
      const t = W.textures[src];
      if (t === "reject") throw new Error(`no texture ${src}`);
      return t ?? null;
    },
  };

  class ApplicationV2 {
    static DEFAULT_OPTIONS = {};
    constructor(options = {}) {
      this.options = options;
      this.id = options.id;
      this.position = { width: 0 };
    }
    async render(force) {
      this._frame ??= await this._renderFrame({});
      const content = this._frame.querySelector(".window-content");
      this._replaceHTML(await this._renderHTML({}, {}), content, {});
      F.calls.push({ op: "app.render", id: this.id, force: !!force });
      this.element = this._frame;
      return this;
    }
    async _renderFrame() {
      const f = document.createElement("div");
      f.innerHTML = `<header class="window-header"><h1 class="window-title"></h1></header><section class="window-content"></section>`;
      return f;
    }
    async close() { F.calls.push({ op: "app.close", id: this.id }); return this; }
    setPosition(p) { F.calls.push({ op: "setPosition", id: this.id, p }); Object.assign(this.position, p); }
  }
  class FilePicker {
    constructor(opts) { this.opts = opts; F.calls.push({ op: "FilePicker", type: opts.type, current: opts.current }); }
    render(force) { F.calls.push({ op: "FilePicker.render", force }); return this; }
    static async createDirectory(source, path) {
      F.calls.push({ op: "createDirectory", source, path });
      if (W.dirExists) throw new Error("EEXIST: directory exists");
    }
    static async upload(source, path, file, body, options) {
      F.calls.push({ op: "upload", source, path, name: file.name, type: file.type, options });
      return { path: `${path}/${file.name}` };
    }
  }
  foundry.applications.api.ApplicationV2 = ApplicationV2;
  foundry.applications.api.DialogV2 = {
    confirm: async opts => {
      F.calls.push({ op: "DialogV2.confirm", window: opts.window, content: opts.content, yes: opts.yes, no: opts.no, rejectClose: opts.rejectClose });
      if (W.confirm === "reject") throw new Error("dialog closed");
      return W.confirm;
    },
  };
  foundry.applications.apps = { FilePicker: { implementation: FilePicker } };

  globalThis.requestAnimationFrame = fn => W.raf.push(fn);
  globalThis.File = class File { constructor(parts, name, { type } = {}) { this.parts = parts; this.name = name; this.type = type; } };
  globalThis.Image = class Image {
    set src(v) {
      this._src = v;
      queueMicrotask(() => {
        const dims = W.images[v];
        if (!dims) return this.onerror?.(new Error(`404 ${v}`));
        Object.assign(this, dims);
        this.onload?.();
      });
    }
    get src() { return this._src; }
  };
  const createElement = doc.createElement;
  doc.createElement = tag => {
    const el = createElement(tag);
    if (tag === "canvas") {
      const ctx = { ops: [] };
      for (const m of ["drawImage", "beginPath", "arc", "stroke"]) ctx[m] = (...a) => ctx.ops.push([m, ...a.map(v => (typeof v === "number" ? round(v) : v?.constructor?.name ?? v))]);
      el.getContext = () => ctx;
      el.toBlob = (cb, type, q) => { F.calls.push({ op: "toBlob", width: el.width, height: el.height, type, q, ctx: ctx.ops, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth }); cb({ blob: true }); };
    }
    return el;
  };
  const board = doc.createElement("div");
  board.id = "board";
  doc.body.append(board);
  W.board = board;

  for (const level of ["warn", "error"]) console[level] = (...args) => console$.push([level, String(args[0]), args[1]]);

  const S = await seams();
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  return { F, S, W };
}

export { FakeElement };
