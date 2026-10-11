// pentaryn kit 1.0.1 · vendored from foundry/lib/test-kit/foundry-stub.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * A Foundry stand-in for node tests. Enough of `game`, `Hooks`, `CONFIG`, `ui`, `canvas` and the
 * document API to load a module's entry, fire its lifecycle hooks and record what it did.
 *
 *   const F = await installFoundry({ actors: [...] });
 *   await import("../entry.mjs");
 *   F.fire("init"); F.fire("setup"); F.fire("ready");
 *   F.calls   // the ordered effect log: settings writes, document updates, notifications, emits
 *   F.hooks   // the registration manifest: [{ kind, name }] in order
 *
 * `foundry.utils` and `CONST` are Foundry's own `common/` code, imported from the installed app
 * (`realFoundryUtils`), so a helper behaves exactly as it will live. When the app is missing the
 * stub falls back to shims and says so in `F.utilsSource === "shim"`; glue tests fail on that
 * unless PENTARYN_TEST_SHIMS=1.
 *
 * Fidelity points that matter: `game.settings.get` on an unregistered key throws Foundry's
 * message; `getFlag/setFlag` on an inactive scope throws Foundry's message; `Hooks.call` stops at
 * a `false`. Never construct real Foundry documents in a test — use `makeDoc`.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_APP = "/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app";
let idSeq = 0;

/** A deterministic 16-character id. */
export function stubId(prefix = "x") {
  idSeq += 1;
  return (prefix.replace(/[^A-Za-z0-9]/g, "") + "0000000000000000" + idSeq).slice(-16).padStart(16, "0");
}

/** Foundry's Collection, near enough: a Map whose iterator yields values. */
export class StubCollection extends Map {
  constructor(docs = []) {
    super();
    for (const d of docs) this.set(d.id, d);
  }
  get contents() {
    return [...this.values()];
  }
  [Symbol.iterator]() {
    return this.values();
  }
  getName(name) {
    return this.contents.find(d => d.name === name);
  }
  find(fn) {
    return this.contents.find(fn);
  }
  filter(fn) {
    return this.contents.filter(fn);
  }
  map(fn) {
    return this.contents.map(fn);
  }
  some(fn) {
    return this.contents.some(fn);
  }
}

/* ── shims, used only when the app's common/ cannot be imported ───────────── */

function shimUtils() {
  const getProperty = (obj, key) => String(key).split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const setProperty = (obj, key, value) => {
    const parts = String(key).split(".");
    let o = obj;
    for (const p of parts.slice(0, -1)) o = o[p] ??= {};
    o[parts.at(-1)] = value;
    return true;
  };
  const expandObject = flat => {
    const out = {};
    for (const [k, v] of Object.entries(flat)) setProperty(out, k, v);
    return out;
  };
  const isPlain = v => v && typeof v === "object" && !Array.isArray(v);
  const mergeObject = (a, b) => {
    for (const [k, v] of Object.entries(b ?? {})) {
      if (isPlain(v) && isPlain(a[k])) mergeObject(a[k], v);
      else a[k] = v;
    }
    return a;
  };
  class Semaphore {
    #queue = Promise.resolve();
    add(fn, ...args) {
      const run = this.#queue.then(() => fn(...args));
      this.#queue = run.catch(() => undefined);
      return run;
    }
  }
  return {
    getProperty, setProperty, expandObject, mergeObject,
    deepClone: v => (v === undefined ? v : structuredClone(v)),
    duplicate: v => JSON.parse(JSON.stringify(v)),
    isEmpty: v => v == null || (typeof v === "object" && Object.keys(v).length === 0),
    escapeHTML: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]),
    debounce: (fn, ms) => {
      let t;
      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      };
    },
    throttle: (fn, ms) => {
      let last = 0;
      return (...a) => {
        const now = Date.now();
        if (now - last >= ms) {
          last = now;
          fn(...a);
        }
      };
    },
    randomID: (n = 16) => stubId("r").slice(-n),
    logCompatibilityWarning: msg => console.warn(msg),
    Semaphore,
  };
}

const SHIM_CONST = { COMPATIBILITY_MODES: { SILENT: 0, WARNING: 1, ERROR: 2, FAILURE: 3 }, USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 } };

let commonCache = null;
async function loadCommon(appRoot) {
  if (commonCache?.appRoot === appRoot) return commonCache;
  const href = rel => pathToFileURL(`${appRoot}/${rel}`).href;
  try {
    await import(href("common/primitives/_module.mjs"));
    const utils = await import(href("common/utils/_module.mjs"));
    const CONST = await import(href("common/constants.mjs"));
    let build = null;
    try {
      build = JSON.parse(readFileSync(`${appRoot}/package.json`, "utf8")).version ?? null;
    } catch {
      build = null;
    }
    commonCache = { appRoot, utils: { ...utils }, CONST: { ...CONST }, source: "foundry", build };
  } catch (err) {
    commonCache = { appRoot, utils: shimUtils(), CONST: SHIM_CONST, source: "shim", build: null, error: err };
  }
  return commonCache;
}

/* ── documents ─────────────────────────────────────────────────────────── */

let current = null;   // the installed stub, for documents built before/after install

function flattenUpdate(changes, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(changes ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && v.constructor === Object) flattenUpdate(v, path, out);
    else out[path] = v;
  }
  return out;
}

/** `{"a.b": 1}` → `{a: {b: 1}}`, as Foundry hands changes to the pre/update hooks. */
function expandUpdate(changes) {
  const out = {};
  for (const [path, value] of Object.entries(flattenUpdate(changes))) {
    const parts = path.split(".");
    const leaf = parts.pop();
    let node = out;
    for (const p of parts) node = node[p] ??= {};
    node[leaf] = value;
  }
  return out;
}

function applyUpdate(doc, changes) {
  for (const [path, value] of Object.entries(flattenUpdate(changes))) {
    const parts = path.split(".");
    let leaf = parts.pop();
    let node = doc;
    for (const p of parts) node = node[p] ??= {};
    const del = current?.isDeletion?.(value) || leaf.startsWith("-=");
    if (leaf.startsWith("-=")) leaf = leaf.slice(2);
    if (del) delete node[leaf];
    else node[leaf] = value;
  }
}

/**
 * A plain stand-in Document. `data` fields land on the object; `system` and `flags` default to {}.
 * update/delete/setFlag/unsetFlag log to `F.calls` and fire the matching pre/update hooks.
 */
export function makeDoc(documentName, data = {}, { parent = null, collection = null } = {}) {
  const doc = {
    documentName,
    id: data.id ?? stubId(documentName.slice(0, 3)),
    name: data.name ?? `${documentName} ${idSeq}`,
    system: {},
    flags: {},
    ownership: { default: 0 },
    ...data,
  };
  Object.defineProperty(doc, "parent", { value: parent, writable: true, enumerable: false });
  Object.defineProperty(doc, "collection", { value: collection, writable: true, enumerable: false });
  Object.defineProperty(doc, "uuid", {
    get() {
      return this.parent ? `${this.parent.uuid}.${documentName}.${this.id}` : `${documentName}.${this.id}`;
    },
    enumerable: false,
  });
  const assertScope = scope => {
    const scopes = current?.activeScopes ?? new Set(["core", "world"]);
    if (!scopes.has(scope)) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
  };
  Object.assign(doc, {
    getFlag(scope, key) {
      assertScope(scope);
      if (!this.flags || !(scope in this.flags)) return undefined;
      return String(key).split(".").reduce((o, k) => (o == null ? undefined : o[k]), this.flags[scope]);
    },
    async setFlag(scope, key, value) {
      assertScope(scope);
      return this.update({ [`flags.${scope}.${key}`]: value });
    },
    async unsetFlag(scope, key) {
      assertScope(scope);
      return this.update({ [`flags.${scope}.-=${key}`]: null });
    },
    async update(changes = {}, options = {}) {
      const F = current;
      const userId = F?.game.user?.id ?? null;
      const expanded = expandUpdate(changes);
      if (F && F.Hooks.call(`preUpdate${documentName}`, this, expanded, options, userId) === false) return undefined;
      applyUpdate(this, expanded);
      F?.calls.push({ op: "update", documentName, uuid: this.uuid, changes: F.plain(changes) });
      F?.Hooks.callAll(`update${documentName}`, this, expanded, options, userId);
      return this;
    },
    async delete(options = {}) {
      const F = current;
      this.collection?.delete?.(this.id);
      F?.calls.push({ op: "delete", documentName, uuid: this.uuid });
      F?.Hooks.callAll(`delete${documentName}`, this, options, F?.game.user?.id ?? null);
      return this;
    },
    toObject() {
      return JSON.parse(JSON.stringify(this));
    },
    testUserPermission(user, level = "OWNER") {
      if (user?.isGM) return true;
      const want = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 }[level] ?? 3;
      return (this.ownership?.[user?.id] ?? this.ownership?.default ?? 0) >= want;
    },
  });
  for (const k of ["getFlag", "setFlag", "unsetFlag", "update", "delete", "toObject", "testUserPermission"]) {
    Object.defineProperty(doc, k, { enumerable: false });
  }
  return doc;
}

export function makeUser({ id, name = "Player", isGM = false, active = true, role, ...rest } = {}) {
  const user = makeDoc("User", { id: id ?? stubId("usr"), name, isGM, active, role: role ?? (isGM ? 4 : 1), ...rest });
  Object.defineProperty(user, "isSelf", {
    get() {
      return current?.game.user?.id === this.id;
    },
    enumerable: false,
  });
  Object.defineProperty(user, "query", {
    value: async (name, data) => {
      current?.calls.push({ op: "query", to: user.id, name, data: current.plain(data) });
      const h = current?.CONFIG.queries?.[name];
      if (!h) throw new Error(`no query handler ${name}`);
      return h(data, { user: current.game.user });
    },
    enumerable: false,
  });
  return user;
}

/** A Token document on `scene` (or unattached). `actorId` links it; `actor` (optional) is its synthetic actor. */
export function makeToken(data = {}, scene = null) {
  const tok = makeDoc("Token", { x: 0, y: 0, width: 1, height: 1, elevation: 0, hidden: false, ...data }, { parent: scene });
  if (!("actor" in data)) {
    Object.defineProperty(tok, "actor", {
      get() {
        return current?.game.actors?.get(this.actorId) ?? null;
      },
      enumerable: false,
    });
  }
  return tok;
}

export function makeScene({ tokens = [], regions = [], ...data } = {}) {
  const scene = makeDoc("Scene", { active: false, ...data });
  const toks = new StubCollection();
  for (const t of tokens) {
    const tok = t.documentName ? t : makeToken(t, scene);
    tok.parent = scene;
    tok.collection = toks;
    toks.set(tok.id, tok);
  }
  const regs = new StubCollection();
  for (const r of regions) {
    const reg = r.documentName ? r : makeDoc("Region", r, { parent: scene });
    reg.parent = scene;
    reg.collection = regs;
    regs.set(reg.id, reg);
  }
  Object.defineProperty(scene, "tokens", { value: toks, enumerable: false });
  Object.defineProperty(scene, "regions", { value: regs, enumerable: false });
  return scene;
}

function flattenLang(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flattenLang(v, key, out);
    else out[key] = v;
  }
  return out;
}

function collectionOf(list, documentName) {
  const coll = new StubCollection();
  for (const d of list ?? []) {
    const doc = d.documentName ? d : documentName === "Scene" ? makeScene(d) : makeDoc(documentName, d);
    doc.collection = coll;
    coll.set(doc.id, doc);
  }
  return coll;
}

const GLOBALS = ["game", "foundry", "CONFIG", "CONST", "Hooks", "ui", "canvas", "fromUuidSync", "fromUuid", "_loc", "_del", "_replace"];

/**
 * Install the stub on globalThis. Await it: the real `common/` is imported dynamically.
 * @returns {Promise<object>} F
 */
export async function installFoundry({
  user, users = [], settings = {}, lang = {}, actors = [], scenes = [], messages = [], items = [],
  journal = [], modules = [], activeScopes = [], socketId = "socket-gm-1", system = { id: "dnd5e", version: "6.0.6" },
  realFoundryUtils = true, appRoot = process.env.FOUNDRY_APP_ROOT ?? DEFAULT_APP, currentScene = null,
} = {}) {
  const common = realFoundryUtils ? await loadCommon(appRoot) : { utils: shimUtils(), CONST: SHIM_CONST, source: "shim", build: null };
  const saved = Object.fromEntries(GLOBALS.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));

  const F = {
    calls: [],
    hooks: [],
    hookErrors: [],
    utilsSource: common.source,
    foundryBuild: common.build,
    plain: v => {
      try {
        return JSON.parse(JSON.stringify(v ?? null, (k, x) => (F.isDeletion(x) ? "<_del>" : x)));
      } catch {
        return String(v);
      }
    },
  };

  /* Hooks */
  const listeners = new Map();   // name → [{ id, fn, once }]
  let hookSeq = 0;
  const add = (kind, name, fn) => {
    const id = ++hookSeq;
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push({ id, fn, once: kind === "once" });
    F.hooks.push({ kind, name });
    return id;
  };
  /**
   * Foundry 14's Hooks.#call (client/helpers/hooks.mjs:158-167): every listener runs inside a
   * try/catch; a throw is warned as `Foundry VTT | Error thrown in hooked function '<fn>' for hook
   * '<hook>'`, logged as an error, re-announced on the "error" hook, and the NEXT listener still
   * runs. Nothing propagates to the caller. `F.hookErrors` keeps what was caught.
   */
  const callOne = (name, l, args) => {
    try {
      return l.fn(...args);
    } catch (err) {
      const msg = `Error thrown in hooked function '${l.fn?.name}' for hook '${name}'`;
      F.hookErrors.push({ hook: name, fn: l.fn?.name ?? "", error: err });
      console.warn(`Foundry VTT | ${msg}`);
      if (name !== "error" && err instanceof Error) {
        const wrapped = new Error(`${msg}. ${err.message}`, { cause: err });
        console.error(wrapped);
        dispatch("error", ["Hooks.#call", wrapped, { msg, hook: name, fn: l.fn }], false);
      }
      return undefined;
    }
  };
  const dispatch = (name, args, vetoable) => {
    for (const l of [...(listeners.get(name) ?? [])]) {
      if (l.once) Hooks.off(name, l.id);
      const out = callOne(name, l, args);
      if (vetoable && out === false) return false;
    }
    return true;
  };
  const Hooks = {
    on: (name, fn) => add("on", name, fn),
    once: (name, fn) => add("once", name, fn),
    off(name, id) {
      const list = listeners.get(name);
      if (!list) return;
      const i = list.findIndex(l => l.id === id || l.fn === id);
      if (i >= 0) list.splice(i, 1);
    },
    call(name, ...args) {
      F.calls.push({ op: "Hooks.call", name });
      return dispatch(name, args, true);
    },
    callAll(name, ...args) {
      F.calls.push({ op: "Hooks.callAll", name });
      dispatch(name, args, false);
      return undefined;                     // Foundry's callAll returns nothing
    },
    get events() {
      return Object.fromEntries([...listeners].map(([k, v]) => [k, v.map(l => ({ id: l.id, once: l.once }))]));
    },
  };
  /**
   * Fire a lifecycle or document hook from the test (not logged in F.calls). `ready` sets
   * `game.ready = true` first, as Foundry's Game#setupGame does (client/game.mjs:776-778); after
   * `setup` (or at `ready`) `game.keybindings.bindings` exists and registering a keybinding throws.
   */
  F.fire = (name, ...args) => {
    if (name === "ready" && F.game) {
      F.game.keybindings.bindings ??= new Map();
      F.game.ready = true;
    }
    const out = dispatch(name, args, false);
    // Game#setupGame: Hooks.callAll("setup") then initializeKeyboard() builds the binding map,
    // after which ClientKeybindings#register throws (client/game.mjs:739-750)
    if (name === "setup" && F.game) F.game.keybindings.bindings ??= new Map();
    return out;
  };
  /** Like fire, through Hooks.call semantics: returns false on a veto. */
  F.fireCall = (name, ...args) => dispatch(name, args, true);
  /** Active listener counts per hook name, after once-hooks have fired and offs have run. */
  F.listeners = name => (name ? (listeners.get(name) ?? []).length : Object.fromEntries([...listeners].map(([k, v]) => [k, v.length]).filter(([, n]) => n)));

  /* users */
  const me = user?.documentName ? user : makeUser({ id: "gmUser0000000001", name: "Gamemaster", isGM: true, ...(user ?? {}) });
  const userColl = new StubCollection([me, ...users.map(u => (u.documentName ? u : makeUser(u)))]);
  Object.defineProperty(userColl, "activeGM", {
    get() {
      return this.contents.filter(u => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
    },
  });

  /* settings */
  const registry = new Map();
  const values = new Map(Object.entries(settings));
  const gameSettings = {
    settings: registry,
    register(namespace, key, config) {
      const id = `${namespace}.${key}`;
      registry.set(id, { ...config, namespace, key });
      F.calls.push({ op: "settings.register", id });
    },
    get(namespace, key) {
      const id = `${namespace}.${key}`;
      const setting = registry.get(id);
      if (!setting) throw new Error(`"${id}" is not a registered game setting`);
      return values.has(id) ? values.get(id) : common.utils.deepClone(setting.default);
    },
    async set(namespace, key, value) {
      const id = `${namespace}.${key}`;
      const setting = registry.get(id);
      if (!setting) throw new Error(`"${id}" is not a registered game setting`);
      values.set(id, value);
      F.calls.push({ op: "settings.set", id, value: F.plain(value) });
      setting.onChange?.(value);
      return value;
    },
  };

  /* i18n */
  const strings = flattenLang(lang);
  const fmt = (key, data = {}) => {
    const s = strings[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (m, k) => (k in data ? String(data[k]) : m));
  };
  const i18n = {
    lang: "en",
    translations: strings,
    has: key => key in strings,
    localize: (key, data) => (data ? fmt(key, data) : strings[key] ?? key),
    format: (key, data) => fmt(key, data),
  };

  /* modules */
  const moduleColl = new Map();
  for (const m of modules) {
    const entry = typeof m === "string" ? { id: m, active: true } : { active: true, ...m };
    moduleColl.set(entry.id, { version: "0.0.0", title: entry.id, ...entry });
  }

  const scopes = new Set(["core", "world", system.id, ...activeScopes]);
  for (const m of moduleColl.values()) if (m.active) scopes.add(m.id);
  F.activeScopes = scopes;

  const ForcedDeletion = class ForcedDeletion {};
  const ForcedReplacement = class ForcedReplacement {
    constructor(value) {
      this.value = value;
    }
  };
  const del = new ForcedDeletion();
  F.isDeletion = v => v === del || v instanceof ForcedDeletion;

  const game = {
    ready: false,
    world: { id: "test-world", title: "Test World" },
    system: { ...system },
    release: { generation: 14, build: 369 },
    user: me,
    users: userColl,
    settings: gameSettings,
    i18n,
    modules: moduleColl,
    actors: collectionOf(actors, "Actor"),
    items: collectionOf(items, "Item"),
    scenes: collectionOf(scenes, "Scene"),
    messages: collectionOf(messages, "ChatMessage"),
    journal: collectionOf(journal, "JournalEntry"),
    socket: {
      id: socketId,
      emit: (...args) => F.calls.push({ op: "socket.emit", args: F.plain(args) }),
      on: () => undefined,
    },
    keybindings: {
      /** Registered actions, as Foundry's ClientKeybindings#actions. */
      actions: new Map(),
      /** undefined until the binding map is built right after `setup` (Game#initializeKeyboard). */
      bindings: undefined,
      register(namespace, key, config) {
        // client-keybindings.mjs:156 — the same guard and message as Foundry's
        if (this.bindings) throw new Error("You cannot register a Keybinding after the init hook");
        if (!namespace || !key) throw new Error("You must specify both the namespace and action portion of the Keybinding action");
        this.actions.set(`${namespace}.${key}`, { ...config, namespace });
        F.calls.push({ op: "keybindings.register", id: `${namespace}.${key}`, name: config?.name ?? null });
      },
    },
  };

  const notify = level => (message, opts) => {
    F.calls.push({ op: "notify", level, message: String(message) });
    return { id: stubId("ntf"), message, opts };
  };

  const scene = currentScene ? game.scenes.get(currentScene) ?? null : null;
  const canvasStub = { ready: !!scene, scene, tokens: { placeables: [] }, grid: { size: 100 } };

  const fromUuidSync = uuid => {
    const parts = String(uuid ?? "").split(".");
    if (parts[0] === "Scene" && parts.length >= 4) {
      const s = game.scenes.get(parts[1]);
      const coll = parts[2] === "Token" ? s?.tokens : parts[2] === "Region" ? s?.regions : null;
      return coll?.get(parts[3]) ?? null;
    }
    const map = { Actor: game.actors, Item: game.items, Scene: game.scenes, ChatMessage: game.messages, JournalEntry: game.journal, User: game.users };
    return parts.length === 2 ? map[parts[0]]?.get(parts[1]) ?? null : null;
  };

  const CONFIG = {
    debug: {},
    queries: {},
    compatibility: { mode: common.CONST.COMPATIBILITY_MODES?.WARNING ?? 1, includePatterns: [], excludePatterns: [] },
    Actor: { documentClass: class Actor {} },
    Token: { objectClass: class Token {} },
    ChatMessage: { documentClass: class ChatMessage {}, modes: {} },
  };

  const foundryNS = {
    utils: common.utils,
    data: { operators: { ForcedDeletion, ForcedReplacement } },
    applications: { api: { ApplicationV2: class ApplicationV2 {}, HandlebarsApplicationMixin: Base => class extends Base {} } },
    documents: {},
    canvas: { placeables: { Token: CONFIG.Token.objectClass } },
  };

  const define = (k, value) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  define("game", game);
  define("foundry", foundryNS);
  define("CONFIG", CONFIG);
  define("CONST", common.CONST);
  define("Hooks", Hooks);
  define("ui", { notifications: { info: notify("info"), warn: notify("warn"), error: notify("error"), success: notify("success") } });
  define("canvas", canvasStub);
  define("fromUuidSync", fromUuidSync);
  define("fromUuid", async uuid => fromUuidSync(uuid));
  define("_loc", (key, data) => i18n.localize(key, data));
  define("_del", del);
  define("_replace", value => new ForcedReplacement(value));

  Object.assign(F, { game, foundry: foundryNS, CONFIG, CONST: common.CONST, Hooks, ui: globalThis.ui, canvas: canvasStub, fromUuidSync });

  /** Switch the client identity (two-session cases): another user, or the same user on another socket. */
  F.become = ({ userId, socketId: sid } = {}) => {
    if (userId) game.user = game.users.get(userId);
    if (sid) game.socket.id = sid;
  };

  F.restore = () => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    if (current === F) current = null;
  };

  current = F;
  return F;
}
