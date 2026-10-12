// pentaryn kit 1.2.0 · vendored from foundry/lib/settings.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Settings as one table. A module's `settings.mjs` exports `SETTINGS` (and `KEYBINDINGS`) rows and
 * is the only file outside `lib/` that calls `game.settings.register/get`.
 *
 * Labels: every row carries LITERAL `name` and `hint` keys. A literal starting `PENTARYN_X.` is a
 * definite reference for the i18n gate wherever it sits, and literal rows let a migrating module
 * keep whatever key shape it has today (`Setting.k.Name`, `settings.k.name`, flat `settings.k`)
 * without touching lang/en.json. The `${i18nRoot}.${section}.${key}.${Name}` derivation is only a
 * fallback for a row that omits them.
 */

import { codedError } from "./errors.mjs";

/**
 * @typedef {{ key: string, scope: "world"|"client"|"user", config: boolean, type: *, default: *,
 *   name?: string, hint?: string, choices?: object|string[], range?: object, requiresReload?: boolean,
 *   onChange?: Function, store?: boolean, doc: string }} SettingRow
 */

const DEFAULT_LABELS = { section: "Setting", name: "Name", hint: "Hint" };

function labelKey(i18nRoot, labels, key, leaf) {
  return i18nRoot ? `${i18nRoot}.${labels.section}.${key}.${leaf}` : undefined;
}

/** `choices` leaves that are `true` (object) or bare values (array) get a derived label key. */
function choicesOf(row, i18nRoot, labels) {
  const c = row.choices;
  if (!c) return undefined;
  const derive = v => labelKey(i18nRoot, labels, row.key, v);
  if (Array.isArray(c)) return Object.fromEntries(c.map(v => [v, derive(v)]));
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === true ? derive(k) : v]));
}

/**
 * Register every row, in table order. Rows already registered (a hot-patched second load) are
 * skipped. @returns {string[]} the keys registered by this call
 */
export function defineSettings(moduleId, SETTINGS, { i18nRoot, labels = DEFAULT_LABELS, g = globalThis } = {}) {
  const lb = { ...DEFAULT_LABELS, ...labels };
  const registered = [];
  for (const row of SETTINGS) {
    if (!row?.key) throw codedError("BAD_ARGS", `${moduleId}: a SETTINGS row has no key`);
    if (g.game.settings.settings?.has?.(`${moduleId}.${row.key}`)) continue;
    let config;
    if (row.store) {
      config = { scope: "world", config: false, type: row.type, default: row.default };
      if (row.onChange) config.onChange = row.onChange;
    } else {
      config = {
        name: row.name ?? labelKey(i18nRoot, lb, row.key, lb.name),
        hint: row.hint ?? labelKey(i18nRoot, lb, row.key, lb.hint),
        scope: row.scope ?? "world",
        config: row.config ?? true,
        type: row.type,
        default: row.default,
      };
      for (const k of ["range", "requiresReload", "onChange", "filePicker"]) {
        if (row[k] !== undefined) config[k] = row[k];
      }
      const choices = choicesOf(row, i18nRoot, lb);
      if (choices) config.choices = choices;
    }
    g.game.settings.register(moduleId, row.key, config);
    registered.push(row.key);
  }
  return registered;
}

/**
 * `setting(key)`: the live value; the row's default when the setting is unregistered or unreadable
 * (a hot-patched client, a read before `init`); `undefined` for a key the table does not have.
 */
export function settingReader(moduleId, SETTINGS, { g = globalThis } = {}) {
  const rows = new Map(SETTINGS.map(r => [r.key, r]));
  return function setting(key) {
    const row = rows.get(key);
    if (!row) return undefined;
    try {
      return g.game.settings.get(moduleId, key);
    } catch {
      return row.default;
    }
  };
}

function sizeOf(value) {
  if (Array.isArray(value)) return value.length;
  if (value instanceof Map || value instanceof Set) return value.size;
  if (value && typeof value === "object") return Object.keys(value).length;
  return null;
}

/** `{ key: liveValue }` for every row; store rows report `{ store: true, size }` instead of the data. */
export function settingsSnapshot(moduleId, SETTINGS, { g = globalThis } = {}) {
  const read = settingReader(moduleId, SETTINGS, { g });
  const out = {};
  for (const row of SETTINGS) {
    const v = read(row.key);
    out[row.key] = row.store ? { store: true, size: sizeOf(v) } : v;
  }
  return out;
}

/**
 * Keybinding rows: `{ key, name, hint, editable, onDown, onUp, restricted, precedence, repeat }`.
 *
 * Foundry only accepts keybindings until it builds its binding map, right after the `setup` hook
 * (Game#initializeKeyboard); `register` throws "You cannot register a Keybinding after the init
 * hook" from then on. So a hot-patched second load, which re-runs `init` wiring after `ready`,
 * registers nothing once `game.keybindings.bindings` exists, and a row whose action is already
 * registered is skipped. @returns {string[]} the keys registered by this call
 */
export function defineKeybindings(moduleId, KEYBINDINGS, { i18nRoot, g = globalThis, log = null } = {}) {
  const lb = { section: "Keybind", name: "Name", hint: "Hint" };
  const kb = g.game.keybindings;
  const rows = KEYBINDINGS ?? [];
  if (rows.length && kb.bindings) {
    log?.debug?.(`keybindings: Foundry already built its bindings — ${rows.length} row(s) not registered (reload to add new ones)`);
    return [];
  }
  const done = [];
  for (const row of rows) {
    const { key, doc: _doc, ...rest } = row;
    if (!key) throw codedError("BAD_ARGS", `${moduleId}: a KEYBINDINGS row has no key`);
    if (kb.actions?.has?.(`${moduleId}.${key}`)) {
      log?.debug?.(`keybindings: ${moduleId}.${key} already registered — skipped`);
      continue;
    }
    kb.register(moduleId, key, {
      ...rest,
      name: row.name ?? labelKey(i18nRoot, lb, key, lb.name),
      hint: row.hint ?? labelKey(i18nRoot, lb, key, lb.hint),
    });
    done.push(key);
  }
  return done;
}

/**
 * A world setting used as a small data store, written read-modify-write and serialised so two
 * writes on one client never interleave. `anyGM: true` (the default, today's semantics) lets any
 * GM client write; `anyGM: false` restricts writes to the active GM.
 *
 *   const store = serialStore(MODULE, "log");
 *   await store.write(list => [...list, entry].slice(-200));
 *
 * Several keys written together (a counter + log pair) share one queue: pass an array of keys.
 * `read()` and `mutate` then see `{ [key]: value }`, and `write` sets the keys in the order given.
 * `mutate` may return a partial object: a key it omits keeps its current value (an explicit `null`
 * still writes `null`), and `write` resolves to the full object it stored.
 *
 *   const ledger = serialStore(MODULE, ["counter", "log"]);
 *   await ledger.write(({ counter, log }) => ({ counter: counter + 1, log: [...log, entry] }));
 *
 * A multi-key write is not atomic: Foundry has no multi-key setting transaction, so the keys are
 * written in table order as separate Setting writes. Each key's `onChange` (on every client) sees
 * the intermediate state between them, and a failure part-way can leave a torn pair (the earlier
 * keys stored, the later ones not). List the counter key first, so a torn write has already
 * advanced the counter and a retry never reuses an id.
 *
 * `write` resolves to the stored value (the object, for several keys), or `null` when this client
 * may not write. A rejected write rejects that caller only; later writes still run.
 */
export function serialStore(moduleId, key, { g = globalThis, log = null, anyGM = true, semaphore } = {}) {
  const sem = semaphore ?? new g.foundry.utils.Semaphore(1);
  const clone = v => (g.foundry?.utils?.deepClone ? g.foundry.utils.deepClone(v) : structuredClone(v));
  const mayWrite = () => (anyGM ? g.game.user?.isGM === true : g.game.users?.activeGM?.isSelf === true);
  const keys = Array.isArray(key) ? [...key] : null;
  const label = keys ? keys.join("+") : key;
  const get = () => (keys
    ? Object.fromEntries(keys.map(k => [k, g.game.settings.get(moduleId, k)]))
    : g.game.settings.get(moduleId, key));

  return {
    read() {
      return get();
    },

    write(mutate) {
      if (!mayWrite()) {
        log?.debug?.(`${label}: write refused on this client`);
        return Promise.resolve(null);
      }
      return sem.add(async () => {
        const current = clone(get());
        const next = (await mutate(current)) ?? current;
        if (!keys) {
          await g.game.settings.set(moduleId, key, next);
          return next;
        }
        const stored = Object.fromEntries(keys.map(k => [k, k in next ? next[k] : current[k]]));
        for (const k of keys) await g.game.settings.set(moduleId, k, stored[k]);
        return stored;
      });
    },

    /** Resolves once every queued write has finished. */
    flush() {
      return sem.add(() => undefined);
    },
  };
}
