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

/**
 * lang/en.json as flat dotted keys, whether the file is flat or nested under PENTARYN_TIES (guide S10
 * nests it; Foundry flattens either shape the same way). Format only — the keys and strings are the file's.
 */
const flatten = (node, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(node ?? {})) {
    if (v && typeof v === "object") flatten(v, prefix ? `${prefix}.${k}` : k, out);
    else out[prefix ? `${prefix}.${k}` : k] = v;
  }
  return out;
};
export const LANG = flatten(JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8")));

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
  // Foundry's global `logger`, which the real logCompatibilityWarning writes through, comes from the
  // kit stub (1.0.2, J6): every line lands on F.logged as { level, args }.
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
