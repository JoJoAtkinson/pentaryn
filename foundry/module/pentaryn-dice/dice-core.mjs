/**
 * Pentaryn Dice — PURE core: constants, the HOOKS table, and the rules.
 *
 * No Foundry global at runtime (only pure `foundry.utils.*` helpers are allowed), so every rule
 * here runs in node on plain fixtures. Glue files import from here; nothing here imports glue.
 *
 * The rules work on PLAIN dice — `{ id, type, owner, linkGroupId, secondary, guest }` — which the
 * adapter (dsn-adapter.mjs) builds from Dice So Nice's persistent-dice meshes. Nothing here knows
 * what a mesh is.
 */

export const MODULE = "pentaryn-dice";
export const SHORT = "dice";
export const NS = "dice";
export const VERSION = "0.1.0";                       // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-dice/api@1";   // bump the major on a published-shape change
export const I18N = "PENTARYN_DICE";
export const CSS = "pdi-";
export const FLAG_SCOPE = MODULE;

/** Dice So Nice's module id. */
export const DSN = "dice-so-nice";

/** Events this module emits. None: the helpers only drive Dice So Nice's own state. */
export const HOOKS = Object.freeze({});

/** Most dice one "+ ×N" click spawns. Dice So Nice's own maxDiceNumber cap still applies. */
export const MAX_COUNT = 30;

/**
 * The default "select all my dice" shortcut. NOT Ctrl+A: that is core's selectAll (every token on
 * the layer). Shift+A is Argon's HUD toggle, and a bare A is core's moveLeft. Alt+A is free in core
 * and in every module installed here (checked 2026-11-21). Players can rebind it in Configure Controls.
 */
export const DEFAULT_SELECT_KEY = Object.freeze({ key: "KeyA", modifiers: Object.freeze(["Alt"]) });

/**
 * Dice So Nice's compound dice (DiceNotation.js COMPOUND_DICE, 6.4.5): a d100 is a linked pair,
 * the d100 tens die first and a d10 units die second. The sidebar's "+" spawns them as one link
 * group, so the "+ ×N" button does the same.
 */
export const COMPOUND = Object.freeze({
  d100: Object.freeze(["d100", "d10"]),
  d1000: Object.freeze(["d1000", "d100", "d10"]),
  d10000: Object.freeze(["d10000", "d1000", "d100", "d10"]),
});

/**
 * The six Dice So Nice internals this module leans on (adjustments row dsn-persistent-dice-select).
 * `path` walks from `game.dice3d`. None of these is a documented API, so selftest() checks each.
 */
export const INTERNALS = Object.freeze([
  Object.freeze({ name: "persistent.spawn", path: Object.freeze(["persistent", "spawn"]), kind: "function" }),
  Object.freeze({ name: "selectedPersistentDiceIds", path: Object.freeze(["box", "persistentDiceManager", "selectedPersistentDiceIds"]), kind: "set" }),
  Object.freeze({ name: "togglePersistentSelection", path: Object.freeze(["box", "persistentDiceManager", "togglePersistentSelection"]), kind: "function" }),
  Object.freeze({ name: "clearPersistentSelection", path: Object.freeze(["box", "persistentDiceManager", "clearPersistentSelection"]), kind: "function" }),
  Object.freeze({ name: "getSelectedPersistentDice", path: Object.freeze(["box", "persistentDiceManager", "getSelectedPersistentDice"]), kind: "function" }),
  Object.freeze({ name: "countPersistentDiceByOwner", path: Object.freeze(["box", "persistentDiceManager", "countPersistentDiceByOwner"]), kind: "function" }),
]);

const walk = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
const isSetLike = v => !!v && typeof v.has === "function" && typeof v.add === "function" && typeof v.delete === "function";

/**
 * Check every internal against a `game.dice3d` object (or null).
 * @returns {{ ok: boolean, checks: { name: string, ok: boolean, detail: string }[] }}
 */
export function probeInternals(dice3d) {
  const checks = INTERNALS.map(({ name, path, kind }) => {
    if (!dice3d) return { name, ok: false, detail: "game.dice3d is missing (Dice So Nice inactive or not ready)" };
    const v = walk(dice3d, path);
    const good = kind === "set" ? isSetLike(v) : typeof v === "function";
    let detail = good ? kind : `game.dice3d.${path.join(".")} is ${v === undefined ? "missing" : typeof v}`;
    if (!good && path[1] === "persistentDiceManager" && walk(dice3d, ["box", "persistentDiceManager"]) == null) {
      detail = "no persistentDiceManager (Dice So Nice's persistent dice setting is off, or the box is not built)";
    }
    return { name, ok: good, detail };
  });
  return { ok: checks.every(c => c.ok), checks };
}

/** A count box's value → an integer in 1..MAX_COUNT. Anything unreadable is 1. */
export function clampCount(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_COUNT);
}

/**
 * What one "+ ×N" click spawns: N groups, each the die types of one roll (one die, or a compound
 * set whose first entry is the primary). `null` for a type that is not a die name.
 * @returns {{ type: string, digitPlace: number|null, secondary: boolean }[][] | null}
 */
export function spawnGroups(type, count) {
  if (typeof type !== "string" || !/^d(\d+|c|f)$/.test(type)) return null;
  const places = COMPOUND[type];
  const group = places
    ? places.map((t, i) => ({ type: t, digitPlace: i, secondary: i > 0 }))
    : [{ type, digitPlace: null, secondary: false }];
  return Array.from({ length: clampCount(count) }, () => group.map(d => ({ ...d })));
}

/**
 * The die ids to select: `userId`'s dice, optionally of one `type`. A type matches a die only as
 * the primary of its group (so "all d10" leaves the d10 halves of d100 pairs alone), then every
 * link-group sibling of a match is added, as Dice So Nice's own Ctrl+click does. Guest dice (held
 * for someone's pending interactive throw) are never selected.
 * @param {{ id: *, type: string, owner: string|null, linkGroupId?: string|null, secondary?: boolean, guest?: boolean }[]} dice
 * @returns {*[]} ids, in list order
 */
export function idsToSelect(dice, { userId, type = null } = {}) {
  const list = Array.isArray(dice) ? dice : [];
  const mine = list.filter(d => d && !d.guest && d.owner === userId);
  const hits = mine.filter(d => (type ? d.type === type && !d.secondary : true));
  const groups = new Set(hits.map(d => d.linkGroupId).filter(Boolean));
  const picked = new Set(hits.map(d => d.id));
  return mine.filter(d => picked.has(d.id) || (d.linkGroupId && groups.has(d.linkGroupId))).map(d => d.id);
}

/** How many "rolls" a list of plain dice holds: link-group secondaries are not counted. */
export function countRolls(dice) {
  return (Array.isArray(dice) ? dice : []).filter(d => d && !d.secondary).length;
}

/** Per-type counts of the selected dice, primaries only: `{ d6: 3, d100: 1 }`. */
export function selectionSummary(dice, selectedIds) {
  const sel = new Set(selectedIds ?? []);
  const out = {};
  for (const d of Array.isArray(dice) ? dice : []) {
    if (!d || d.secondary || !sel.has(d.id)) continue;
    out[d.type] = (out[d.type] ?? 0) + 1;
  }
  return out;
}

const MOD_LABEL = Object.freeze({ Control: "Ctrl", Shift: "Shift", Alt: "Alt", Meta: "Meta" });

/**
 * A keybinding (`{ key: "KeyA", modifiers: ["Alt"] }`) → "Alt+A", for the hint line. `null` for
 * an unbound action.
 */
export function bindingLabel(binding) {
  if (!binding || typeof binding.key !== "string" || !binding.key) return null;
  const key = binding.key.replace(/^Key([A-Z])$/, "$1").replace(/^Digit(\d)$/, "$1").replace(/^Numpad(\d)$/, "Num $1");
  const mods = (binding.modifiers ?? []).map(m => MOD_LABEL[m] ?? m);
  return [...mods, key].join("+");
}

/** One read-only status object from what the adapter reported. Pure, so its shape is pinned in node. */
export function statusOf({ enabled = true, active = false, persistentDice = false, dice = [], selectedIds = [], userId = null, shortcut = null, internals } = {}) {
  const mine = (Array.isArray(dice) ? dice : []).filter(d => d && d.owner === userId && !d.guest);
  return {
    enabled: !!enabled,
    dsnActive: !!active,
    persistentDice: !!persistentDice,
    mine: countRolls(mine),
    selected: selectionSummary(dice, selectedIds),
    shortcut,
    internals: internals ?? probeInternals(null),
  };
}
