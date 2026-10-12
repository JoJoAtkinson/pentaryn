// pentaryn kit 1.2.0 · vendored from foundry/lib/patch.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * The only way a module changes someone else's prototype. Every patch is recorded with its
 * adjustments row id (foundry/adjustments.yml), which `describe().patches` reports.
 *
 * `make` is a wrapper in the familiar `function (wrapped, ...args)` shape, with `this` bound to the
 * instance. A route object (`via`) may register it elsewhere first; when the route declines (returns
 * null) the method is wrapped directly. This file names no third-party package — the routes that do
 * live in their own kit files (patch-<package>.mjs) and are vendored only where they are used.
 *
 * Migration rule: an existing patch keeps its marker literal at the call site, in the module's own
 * file, because adjustments rows grep for it there.
 */

const records = [];

/**
 * Record a patch and return its handle. `unwrap()` undoes the patch once and drops the record, so
 * `patches()` stops listing it and a later wrap with the same marker patches again (J16). An `undo`
 * that returns `false` could not restore (another wrapper sits on top): the patch is still live,
 * so the record stays and a later `unwrap()` may try again.
 */
function recordPatch(row, undo) {
  let done = false;
  const handle = {
    via: row.via,
    unwrap() {
      if (done) return;
      if (undo() === false) return;
      done = true;
      const i = records.indexOf(rec);
      if (i >= 0) records.splice(i, 1);
    },
  };
  const rec = { ...row, handle };
  records.push(rec);
  return handle;
}

function warn(log, g, moduleId, msg) {
  if (log) log.warn(msg);
  else g.console?.warn(`${moduleId} | ${msg}`);
}

/**
 * @param {string} moduleId
 * @param {{ target: object, label: string, name: string, marker: string, path?: string, type?: string,
 *   kind?: "method"|"getter", adjustments: string }} spec   path: the dotted global path a route needs
 *   ("CONFIG.Token.objectClass.prototype._onClickLeft2"). `kind: "getter"` wraps an accessor
 *   (`Token#isVisible`): the route first (libWrapper wraps getters by path); on decline the getter
 *   is replaced through `Object.defineProperty`, never by reading `target[name]` (which would run
 *   the getter against the prototype). `make`'s `wrapped()` then calls the original getter.
 * @param {(wrapped: Function, ...args) => *} make
 * @param {{ via?: { name: string, register: (spec, make) => (Function|null) } | null, g?: object, log?: object }} [opts]
 * @returns {{ via: string|null, unwrap: () => void }}   unwrap() undoes the patch and drops its
 *   record (a second call is a no-op), so the same marker can be wrapped again afterwards.
 */
export function wrapMethod(moduleId, spec, make, { via = null, g = globalThis, log = null } = {}) {
  const { target, label = spec.name, name, marker, adjustments = null } = spec;
  const existing = records.find(r => r.moduleId === moduleId && r.marker === marker && r.target === target);
  if (existing) return existing.handle;

  const record = (how, unwrap) => recordPatch({ moduleId, label, name, marker, via: how, adjustments, target }, unwrap);

  if (via) {
    const unwrap = via.register({ ...spec, moduleId, label }, make);
    if (typeof unwrap === "function") return record(via.name, unwrap);
  }

  if (spec.kind === "getter") return wrapGetter(moduleId, spec, make, { g, log, record });

  const original = target?.[name];
  if (typeof original !== "function") {
    warn(log, g, moduleId, `${label} not found; not patched`);
    return { via: null, unwrap() {} };
  }
  if (original[marker]) return record("direct", () => {});

  const replacement = function (...args) {
    return make.call(this, (...a) => original.apply(this, a), ...args);
  };
  replacement[marker] = true;
  target[name] = replacement;
  return record("direct", () => {
    if (target[name] !== replacement) return false;
    target[name] = original;
  });
}

/** The direct route for `kind: "getter"`: find the accessor on the target or its prototype chain. */
function wrapGetter(moduleId, spec, make, { g, log, record }) {
  const { target, label = spec.name, name, marker } = spec;
  let owner = target, desc;
  while (owner && !(desc = Object.getOwnPropertyDescriptor(owner, name))) owner = Object.getPrototypeOf(owner);
  if (typeof desc?.get !== "function") {
    warn(log, g, moduleId, `${label} getter not found; not patched`);
    return { via: null, unwrap() {} };
  }
  if (desc.get[marker]) return record("direct", () => {});
  const original = desc.get;
  const get = function () {
    return make.call(this, () => original.call(this));
  };
  get[marker] = true;
  const ownBefore = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { ...desc, configurable: true, get });
  return record("direct", () => {
    if (Object.getOwnPropertyDescriptor(target, name)?.get !== get) return false;
    if (ownBefore) Object.defineProperty(target, name, ownBefore);
    else delete target[name];
  });
}

/**
 * `Object.defineProperty` with the same bookkeeping: idempotent per marker, recorded, undoable.
 * @param {{ marker: string, adjustments: string, label?: string }} meta
 */
export function defineAccessor(moduleId, target, name, descriptor, { marker, adjustments, label = name } = {}, { g = globalThis, log = null } = {}) {
  const existing = records.find(r => r.moduleId === moduleId && r.marker === marker && r.target === target);
  if (existing) return existing.handle;
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    warn(log, g, moduleId, `${label}: no target; not defined`);
    return { via: null, unwrap() {} };
  }
  const before = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
  return recordPatch({ moduleId, label, name, marker, via: "direct", adjustments, target }, () => {
    if (before) Object.defineProperty(target, name, before);
    else delete target[name];
  });
}

/** Plain copies of every patch this copy of the kit applied: `{ moduleId, label, name, marker, via, adjustments }`. */
export function patches() {
  return records.map(({ moduleId, label, name, marker, via, adjustments }) => ({ moduleId, label, name, marker, via, adjustments }));
}

/** Undo every patch, newest first. */
export function unwrapAll() {
  for (const r of records.splice(0).reverse()) r.handle.unwrap();
}
