/**
 * pentaryn-prompts — the module's identity and its shared constants. PURE: no Foundry global.
 *
 * Every other file takes MODULE, VERSION and the directory/kind tables from here (geometry-core,
 * replace and gather re-export the ones their callers already import from them).
 */

export const MODULE = "pentaryn-prompts";
export const SHORT = "prompts";
/** `game.pentaryn.prompts`. */
export const NS = "prompts";

/** The code's own version: `status().version` prints it (game.modules can lag until a rescan). Kept equal to module.json by the suite. */
export const VERSION = "0.4.5";
export const CONTRACT = "pentaryn-prompts/api@1";
export const I18N = "PENTARYN_PROMPTS";
export const CSS = "pp-";

/** The module emits no hooks of its own (`renderPromptDialog` is core's AppV2 hook). */
export const HOOKS = Object.freeze({});

/** Where spec files go under the Foundry Data directory (the eval-js path; the MCP tool reads any local file). */
export const SPEC_DIR = "pentaryn-prompts-specs";

/** Where crop files go under the Foundry Data directory (see the playbook for the absolute path). */
export const CROP_DIR = "pentaryn-prompts-crops";

/** The replacement kinds `with.kind` may name, in the order the BAD_SPEC message lists them. */
export const KINDS = Object.freeze(["actor", "npc", "character", "hotspot", "note", "light", "tile", "none"]);

/** The keys a `patch` may carry, in the order checkPatch's BAD_SPEC message lists them (fork parity: mcp-fork-15). */
export const PATCH_KEYS = Object.freeze(["name", "size", "img", "biography", "hp", "ac", "cr", "speed", "disposition",
  "removeItems", "addItems", "traits", "recharge", "itemUpdates", "set", "creatureType", "languages"]);
