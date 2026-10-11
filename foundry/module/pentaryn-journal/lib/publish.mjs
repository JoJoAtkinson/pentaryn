// pentaryn kit 1.0.2 · vendored from foundry/lib/publish.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Publish a module's API. `game.modules.get(id).api` is canonical; `game.pentaryn.<ns>` is an
 * alias kept for the console, macros and the MCP bridge.
 *
 * `game.pentaryn` is a plain, extensible object that every module assigns into. Nothing freezes or
 * replaces it since the importer merges into it (items-journal-1, c0c3f97), so the old frozen-root
 * guard and the one-tick re-alias are gone (kit 1.0.2, J10): a frozen root now throws a TypeError.
 */

import { resolveRef } from "./resolve.mjs";

const PUBLISHED = Symbol.for("pentaryn.kit.published");

function aliasInto(g, ns, api) {
  g.game.pentaryn ??= {};
  g.game.pentaryn[ns] = api;
}

function publishedMap(g) {
  g[PUBLISHED] ??= {};
  return g[PUBLISHED];
}

/** `{ when, at }` for one namespace, or null when it has not been published. */
export function publishedOf(ns, { g = globalThis } = {}) {
  const p = publishedMap(g)[ns];
  return p ? { ...p } : null;
}

/**
 * @param {string} ns     the namespace under game.pentaryn
 * @param {object} api    a kit-built (frozen) API
 * @param {{ moduleId: string, g?: object, alias?: boolean, when?: string }} opts
 *   alias: publish under a second name only (no module.api, no ready hooks) — senses' `chain`.
 *   when: recorded, not enforced — "ready" (default), or e.g. "ready:gm:wasm" for a late,
 *   role-gated publish.
 */
export function publishNamespace(ns, api, { moduleId, g = globalThis, alias = false, when = "ready" } = {}) {
  const mod = g.game?.modules?.get?.(moduleId);
  if (mod && !alias) mod.api = api;
  aliasInto(g, ns, api);
  installRoot(g.game.pentaryn, { g });
  publishedMap(g)[ns] = { when, at: Date.now(), module: moduleId ?? null, alias: !!alias };
  if (!alias) {
    g.Hooks?.callAll?.(`${moduleId}.ready`, api);
    g.Hooks?.callAll?.("pentaryn.ready", ns, api, { when });
  }
  return api;
}

function define(root, name, value) {
  Object.defineProperty(root, name, { value, configurable: true, writable: true, enumerable: false });
}

/**
 * Root helpers on `game.pentaryn` (non-enumerable, so `Object.keys(game.pentaryn)` lists only
 * namespaces). Only kit-built APIs count — those whose `contract` is a string.
 */
export function installRoot(root, { g = globalThis } = {}) {
  if (!root || !Object.isExtensible(root)) return root;
  const live = () => g.game?.pentaryn ?? root;
  const namespaces = () => {
    const r = live();
    return Object.keys(r).filter(k => typeof r[k]?.contract === "string");
  };
  define(root, "namespaces", namespaces);
  define(root, "published", () => ({ ...publishedMap(g) }));
  define(root, "describe", () => {
    const r = live();
    const out = { modules: [], namespaces: {} };
    for (const ns of namespaces()) {
      try {
        const d = r[ns].describe();
        out.namespaces[ns] = d;
        if (d?.module && !out.modules.includes(d.module)) out.modules.push(d.module);
      } catch (err) {
        out.namespaces[ns] = { error: err?.message ?? String(err) };
      }
    }
    return out;
  });
  // The ref is resolved ONCE (exact match, explicit scene scope), so every namespace inspects the
  // same Document and an ambiguous name is reported once instead of per module.
  define(root, "inspect", async (ref, opts = {}) => {
    const r = live();
    const doc = resolveRef(ref, opts.kind ?? "actor", { sceneId: opts.sceneId, base: opts.base, g });
    const out = {};
    for (const ns of namespaces()) {
      if (typeof r[ns].inspect !== "function") continue;
      try {
        out[ns] = await r[ns].inspect(doc, opts);
      } catch (err) {
        out[ns] = { error: err?.message ?? String(err), code: err?.code ?? null };
      }
    }
    return out;
  });
  return root;
}

/** Another module's API, or null when it is absent, inactive or not yet published. */
export function apiOf(moduleId, { g = globalThis } = {}) {
  return g.game?.modules?.get?.(moduleId)?.api ?? null;
}
