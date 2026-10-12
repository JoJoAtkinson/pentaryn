/**
 * The stub world the legacy look suite (test/look.mjs) runs on — moved here verbatim (guide S1) so
 * S10 can change how it reads lang/en.json in one place. Importing this installs `game`, `foundry`,
 * `Hooks`, `CONFIG`, `ui` and `canvas` on globalThis; `W.actors` and `W.registry` are what the stub
 * `game` reads, reassigned by the suite per case.
 */
import { readFileSync } from "node:fs";

/* ── just enough Foundry ──────────────────────────────────────────────────── */

const LANG = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
const at = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const localize = k => at(LANG, k) ?? LANG[k] ?? k;
const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export class StubActor {
  constructor(data) {
    Object.assign(this, structuredClone(data));
    this.items = [];
  }
  getFlag(ns, key) {
    return at(this.flags?.[ns] ?? {}, key);
  }
  get isOwner() {
    return (this.ownership?.[globalThis.game.user.id] ?? 0) >= 3;
  }
}

export const W = { actors: new Map(), registry: [] };
globalThis.game = {
  user: { id: "kristine", isGM: false },
  users: { activeGM: { id: "gm" }, get: () => null },
  actors: { get: id => W.actors.get(id), get contents() { return [...W.actors.values()]; } },
  settings: {
    get: (ns, key) => {
      if (key === "playerAccess") return true;
      if (key === "attributes") return W.registry;
      throw new Error(`unregistered ${ns}.${key}`);
    }
  },
  i18n: { localize, format: (k, d) => String(localize(k)).replace(/\{(\w+)\}/g, (_, x) => d?.[x] ?? "") }
};
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, DialogV2: {} }, ux: { TextEditor: { implementation: {} } } },
  utils: { escapeHTML: esc, deepClone: x => structuredClone(x), randomID: () => "r", flattenObject: o => o }
};
// Foundry v14's `_loc` is `game.i18n.localize` bound, which formats when given data (guide S10)
globalThis._loc = (k, data) => (data ? globalThis.game.i18n.format(k, data) : globalThis.game.i18n.localize(k));
globalThis.Hooks = { on() {}, once() {}, off() {} };
globalThis.CONFIG = { DND5E: { skills: {} } };
globalThis.ui = { notifications: { info() {}, warn() {} } };
globalThis.canvas = { tokens: { placeables: [] } };
