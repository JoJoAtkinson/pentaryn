// pentaryn kit 1.2.0 · vendored from foundry/lib/api.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Build a module's published API from its manifest (pure data, `api-manifest.mjs`) and an
 * implementation map, and describe it.
 *
 * Drift fails at load, in node, before anything is synced: a row with no implementation, an
 * implementation with no row, or a name that would clobber a kit-owned member all throw here.
 *
 * Kit-owned members (errors.RESERVED):
 *   describe, version, contract    built here; never a row
 *   settings, trace, uninstall     passed as `members`; never a row
 *   inspect, selftest              optional; top-level rows of the module's own manifest only
 */

import { CODES, KIT_VERSION, RESERVED, errorCode, toFail } from "./errors.mjs";
import { refOf, resolveRef } from "./resolve.mjs";

/**
 * @typedef {{ name: string, kind?: string, type?: string, optional?: boolean, resolve?: boolean|"self", doc?: string }} Param
 *   `resolve: false` — the kit does not resolve this param; `resolve: "self"` (kit 1.1.0) — nor does the
 *   kit, but the function resolves a string (uuid, id, exact name) itself, so the bridge may pass one
 * @typedef {{ path: string, params: Param[], returns: string, gm: boolean, writes: boolean, query?: boolean,
 *   queryName?: string, relay?: boolean, dryRun?: boolean, wire?: Function, sideEffects?: string[], nullWhen?: string,
 *   throws?: string[], legacy?: boolean, args?: Function, since?: string, doc: string }} ApiRow
 *   (field reference: context/foundry/addon-blueprint.md §5.1a)
 * @typedef {{ module: string, namespace: string, version: string, contract: string, flagScope: string,
 *   rows: ApiRow[], flags?: { writes: string[], reads: string[] }, unlisted?: string[] }} Manifest
 */

const BUILT = ["describe", "version", "contract"];
const MEMBERS = ["settings", "trace", "uninstall"];
const OPTIONAL = ["inspect", "selftest"];

function reservedClash(path, { own, legacy }) {
  const parts = path.split(".");
  const hit = parts.find(p => RESERVED.includes(p));
  if (!hit) return null;
  if (OPTIONAL.includes(hit) && parts.length === 1 && own && !legacy) return null;
  return hit;
}

/**
 * Wrap a row's implementation so a leading `ref` param is resolved per call.
 *  - Scene scope and base-actor choice come from THIS call's options object (`opts.sceneId`,
 *    `opts.base`), the argument right after the ref (use-doc §5.1) — never from the row.
 *  - `resolve: false` / `resolve: "self"` on that param opts out: the function gets the raw ref.
 *  - Legacy rows: a miss resolves to null instead of throwing (`attunement.report` → undefined).
 *  - Write rows never throw for an expected refusal (use-doc §5.1): a coded resolve error (NOT_FOUND,
 *    AMBIGUOUS, BAD_ARGS) comes back as `fail(code, reason)`. Callers `await` a write either way.
 */
function bind(row, fn) {
  const first = row.params?.[0];
  if (first?.name !== "ref" || first.resolve === false || first.resolve === "self") return fn;
  const kind = first.kind ?? "actor";
  const required = !row.legacy;
  const wrapped = (ref, opts, ...rest) => {
    const scope = opts && typeof opts === "object" ? opts : {};
    let doc;
    try {
      doc = resolveRef(ref, kind, { required, sceneId: scope.sceneId, base: scope.base });
    } catch (err) {
      if (row.writes && errorCode(err, CODES)) return toFail(err);
      throw err;
    }
    return fn(doc, opts, ...rest);
  };
  Object.defineProperty(wrapped, "name", { value: fn.name || row.path.split(".").at(-1) });
  return wrapped;
}

function setPath(target, path, value, module) {
  const parts = path.split(".");
  let node = target;
  for (const p of parts.slice(0, -1)) {
    if (node[p] === undefined) node[p] = {};
    else if (typeof node[p] !== "object") throw new Error(`${module}: "${path}" collides with a method`);
    node = node[p];
  }
  const leaf = parts.at(-1);
  if (leaf in node) throw new Error(`${module}: "${path}" is defined twice`);
  node[leaf] = value;
}

const isPlainContainer = v => {
  if (Array.isArray(v)) return true;
  if (Object.prototype.toString.call(v) === "[object Module]") return true;   // an ES module namespace
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * What an `unlisted` non-function member publishes: arrays, plain objects and ES module namespaces
 * are COPIED (recursively) and the copy frozen, so the module's own tables stay writable and a
 * namespace (whose freeze throws) is never frozen. Functions, Maps, Sets and class instances are
 * published by reference and never frozen.
 */
function publishedCopy(v, seen = new Map()) {
  if (!v || typeof v !== "object" || !isPlainContainer(v)) return v;
  if (seen.has(v)) return seen.get(v);
  const out = Array.isArray(v) ? [] : {};
  seen.set(v, out);
  for (const k of Object.keys(v)) out[k] = publishedCopy(v[k], seen);
  return Object.freeze(out);
}

/** Freeze the API tree buildApi made (its own plain containers); never walk into anything else. */
function freezeDeep(obj) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Object.isFrozen(v) && isPlainContainer(v)) freezeDeep(v);
  }
  return Object.freeze(obj);
}

/**
 * @param {Manifest} manifest
 * @param {Record<string, Function>} impl  `{ path: fn }`
 * @param {{ contributions?: {rows: ApiRow[], impl: Record<string, Function>}[],
 *   extras?: object|(() => object), members?: Record<string, Function> }} [opts]
 *   extras: what `describe()` reports beyond the rows (settings, events, hooks, patches, published);
 *   a function is called on every describe(), so live registrations show.
 * @returns {object} the frozen API. Never freezes the caller's objects: an `unlisted` table is
 *   published as a frozen copy (kit 1.0.1, K5).
 */
export function buildApi(manifest, impl, { contributions = [], extras = {}, members = {} } = {}) {
  const mod = manifest.module;
  const rows = [];
  const fns = {};
  const unlisted = new Set(manifest.unlisted ?? []);

  const take = (list, map, { own }) => {
    for (const row of list ?? []) {
      const clash = reservedClash(row.path, { own, legacy: row.legacy });
      if (clash) throw new Error(`${mod}: "${row.path}" is reserved`);
      if (rows.some(r => r.path === row.path)) throw new Error(`${mod}: API row "${row.path}" is defined twice`);
      rows.push(row);
    }
    for (const [path, fn] of Object.entries(map ?? {})) {
      if (path in fns) throw new Error(`${mod}: implementation "${path}" is defined twice`);
      const row = rows.find(r => r.path === path);
      if (reservedClash(path, { own, legacy: row?.legacy })) throw new Error(`${mod}: "${path}" is reserved`);
      fns[path] = fn;
    }
  };
  take(manifest.rows, impl, { own: true });
  for (const c of contributions) take(c?.rows, c?.impl, { own: false });

  for (const row of rows) {
    if (typeof fns[row.path] !== "function") throw new Error(`${mod}: API row "${row.path}" has no implementation`);
  }
  for (const path of Object.keys(fns)) {
    if (!rows.some(r => r.path === path) && !unlisted.has(path)) {
      throw new Error(`${mod}: implementation "${path}" has no API row`);
    }
  }
  for (const name of Object.keys(members)) {
    if (!MEMBERS.includes(name)) throw new Error(`${mod}: "${name}" is not a kit member`);
  }

  const merged = { ...manifest, rows };
  const api = {};
  for (const row of rows) setPath(api, row.path, bind(row, fns[row.path]), mod);
  for (const path of unlisted) if (fns[path]) setPath(api, path, publishedCopy(fns[path]), mod);

  api.version = manifest.version;
  api.contract = manifest.contract;
  api.settings = members.settings ?? (() => ({}));
  api.trace = members.trace ?? (() => []);
  api.uninstall = members.uninstall ?? (() => undefined);
  api.describe = () => describe(merged, typeof extras === "function" ? extras() : extras);
  for (const k of BUILT) if (api[k] === undefined) throw new Error(`${mod}: ${k} missing`);
  return freezeDeep(api);
}

const typeName = t => (t === undefined || t === null ? null : t.name ?? t.constructor?.name ?? String(t));

/**
 * The manifest as plain JSON (key list: use-doc §5.1a). Cheap, static, safe to call from a socket.
 */
export function describe(manifest, { settings = [], events = {}, patches = [], queries, hooks = [],
  errors = CODES, kitVersion = KIT_VERSION, published = null } = {}) {
  const rows = manifest.rows ?? [];
  return toPlain({
    module: manifest.module,
    namespace: manifest.namespace,
    version: manifest.version,
    contract: manifest.contract,
    flagScope: manifest.flagScope ?? manifest.module,
    kit: kitVersion,
    published,
    methods: rows.map(r => ({
      path: r.path,
      params: (r.params ?? []).map(p => ({ ...p })),
      returns: r.returns ?? null,
      gm: !!r.gm,
      writes: !!r.writes,
      query: !!r.query,
      ...(r.query && r.queryName ? { queryName: r.queryName } : {}),
      ...(r.relay ? { relay: true } : {}),
      ...(r.dryRun ? { dryRun: true } : {}),
      sideEffects: r.sideEffects ?? [],
      ...(r.nullWhen ? { nullWhen: r.nullWhen } : {}),
      ...(r.throws ? { throws: r.throws } : {}),
      ...(r.legacy ? { legacy: true } : {}),
      ...(r.since ? { since: r.since } : {}),
      doc: r.doc ?? "",
    })),
    queries: queries ?? rows.filter(r => r.query).map(r => `${manifest.module}.${r.queryName ?? r.path}`),
    settings: settings.map(s => ({
      key: s.key,
      scope: s.store ? "world" : s.scope ?? "world",
      type: typeName(s.type),
      default: s.default ?? null,
      ...(s.store ? { store: true } : {}),
      doc: s.doc ?? "",
    })),
    events: Object.entries(events).map(([key, e]) => ({
      key, name: e.name, legacyName: e.legacyName ?? null, ...(e.until ? { until: e.until } : {}),
      pre: !!e.pre, args: e.args ?? "",
    })),
    hooks: hooks.map(h => ({ name: h.name, label: h.label ?? h.name })),
    patches: patches.map(p => ({ label: p.label, marker: p.marker ?? null, via: p.via ?? null, adjustments: p.adjustments ?? null })),
    flags: { writes: manifest.flags?.writes ?? [], reads: manifest.flags?.reads ?? [] },
    errors: [...errors],
  }, { maxDepth: Infinity });
}

/** `{ "a.b": "fnName" }` for every member — the surface golden. */
export function surfaceOf(api, prefix = "") {
  const out = {};
  for (const key of Object.keys(api ?? {}).sort()) {
    const v = api[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, surfaceOf(v, path));
    else out[path] = typeof v === "function" ? v.name || "function" : typeof v;
  }
  return out;
}

/** Nesting depth of a value: primitives 0, `{}` / `[]` 1, `{a: {}}` 2. Cycles count once. */
export function maxDepth(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return 0;
  seen.add(value);
  let deepest = 0;
  for (const v of Object.values(value)) deepest = Math.max(deepest, maxDepth(v, seen));
  seen.delete(value);
  return 1 + deepest;
}

/**
 * Anything → JSON-safe plain data. Documents → `refOf`, Set → array, Map → object, Date → ms,
 * functions dropped, Errors → `{name, message, code}`, depth past `maxDepth` → "[max depth]",
 * a cycle → "[cycle]".
 */
export function toPlain(value, { maxDepth: cap = 4 } = {}) {
  const stack = new Set();
  const walk = (v, depth) => {
    if (v === null || v === undefined) return v ?? null;
    const t = typeof v;
    if (t === "string" || t === "boolean") return v;
    if (t === "number") return Number.isFinite(v) ? v : null;
    if (t === "bigint") return String(v);
    if (t === "function" || t === "symbol") return undefined;
    if (v instanceof Date) return v.getTime();
    if (v.documentName || v.document?.documentName) return refOf(v);
    if (stack.has(v)) return "[cycle]";
    if (depth >= cap) return "[max depth]";
    stack.add(v);
    let out;
    if (v instanceof Error) out = { name: v.name, message: v.message, ...(v.code ? { code: v.code } : {}) };
    else if (Array.isArray(v) || v instanceof Set) out = [...v].map(x => walk(x, depth + 1) ?? null);
    else if (v instanceof Map) {
      out = {};
      for (const [k, x] of v) {
        const w = walk(x, depth + 1);
        if (w !== undefined) out[String(k)] = w;
      }
    } else {
      out = {};
      for (const [k, x] of Object.entries(v)) {
        const w = walk(x, depth + 1);
        if (w !== undefined) out[k] = w;
      }
    }
    stack.delete(v);
    return out;
  };
  const r = walk(value, 0);
  return r === undefined ? null : r;
}
