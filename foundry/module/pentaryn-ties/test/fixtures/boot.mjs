/**
 * Boot the real ties entry on the kit's Foundry stub: init → setup → ready, then wait for the
 * ready steps to settle. Synthetic data only. One boot per process (the entry registers its hooks
 * at import), so each *.test.mjs file that needs a different user boots once in its own process.
 *
 * Extra stubs the entry needs beyond the kit: `document` (look-menu listeners), `game.macros` and
 * `Macro.create` (the ready step that creates the hotbar macro), and `CONFIG.DND5E` sizes and
 * creature types (derived attribute titles: `size:med` → "Medium", live SF9).
 */
import { readFileSync } from "node:fs";
import { installFoundry } from "../kit/foundry-stub.mjs";

export const LANG = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));

/** dnd5e 6.0.6's own label keys and English words, for the two derived namespaces that ask CONFIG. */
export const DND5E_LANG = { "DND5E.SizeMedium": "Medium", "DND5E.CreatureHumanoid": "Humanoid" };

export async function boot({ user, users = [], settings = {}, actors = [] } = {}) {
  const F = await installFoundry({ user, users, settings, actors, lang: { ...LANG, ...DND5E_LANG } });
  F.CONFIG.DND5E = {
    actorSizes: { med: { label: "DND5E.SizeMedium" } },
    creatureTypes: { humanoid: { label: "DND5E.CreatureHumanoid" } },
    skills: {}
  };
  F.game.macros = { getName: () => null };
  globalThis.Macro = { create: async data => F.calls.push({ op: "Macro.create", data: F.plain(data) }) };
  // Foundry's global `logger` (console-like): the real logCompatibilityWarning writes through it
  // and the kit stub does not define it yet (kit gap, reported). Lines are kept on F.logged.
  F.logged = [];
  globalThis.logger = Object.fromEntries(["debug", "info", "log", "warn", "error"].map(level => [level, (...args) => F.logged.push({ level, args })]));
  globalThis.document = { addEventListener() {}, removeEventListener() {}, createElement: () => ({}), body: { appendChild() {} } };
  await import("../../pentaryn-ties.mjs");
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  return F;
}

/** Every published path → `fn.name` for a function, else `typeof` (STANCES → "object"). */
export function surfaceOf(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "function") out[path] = v.name;
    else if (v && typeof v === "object" && !Array.isArray(v)) surfaceOf(v, path, out);
    else out[path] = typeof v;
  }
  return out;
}
