/**
 * Synthetic world and client for the tests. Never real campaign data: test/ ships to Data/.
 * Ids are 16 characters, like Foundry's.
 *
 * `installClient()` = the kit's Foundry stub plus the client pieces this module touches and the
 * stub does not have: a GM user whose `query` switches identity (so a player's relay reaches the
 * GM handler as it would over the socket), window/body event listeners, core's Notifications
 * class, a recording ApplicationV2, ui.controls, canvas tokens and an in-memory file store.
 * Call it BEFORE importing the entry (dialog.mjs reads ApplicationV2 at import).
 */

import { installFoundry, makeDoc } from "../kit/foundry-stub.mjs";
import { readJSON } from "../kit/harness.mjs";

const LANG = readJSON(new URL("../../lang/en.json", import.meta.url));

export const IDS = Object.freeze({
  gm: "gmUser0000000001",
  player: "player0000000001",
  player2: "playerb000000001",
  caven: "caven00000000001",
  goblin: "goblin0000000001",
  scene: "sceneone00000001",
  token: "tokone0000000001",
  msgMine: "msgmine000000001",
  msgOther: "msgother00000001",
});

export const WORLD = "test-world";

/** A queued report as a client would have built it (the shape buildReport returns). */
export function queuedReport(id, { t = 1_700_000_000_000, text = "the door will not open", category = "bug", user = null } = {}) {
  return {
    schemaVersion: 1, id, t, iso: new Date(t).toISOString(), receivedAt: null, category, text,
    status: "open", history: [], user, world: { id: WORLD, title: "Test World" }, scene: null, tokens: null,
    combat: null, windows: [], modules: [], client: null, chat: [], errors: [], actions: [],
    module: { id: "pentaryn-feedback", version: "0.1.0" },
  };
}

/** An in-memory file store with the files-adapter interface. */
export function memoryStore() {
  const files = new Map();
  const calls = [];
  return {
    files, calls,
    async ensureDir(dir) {
      calls.push(["ensureDir", dir]);
    },
    async put(path, value) {
      calls.push(["put", path]);
      files.set(path, JSON.parse(JSON.stringify(value)));
      return path;
    },
    async get(path) {
      calls.push(["get", path]);
      return files.has(path) ? JSON.parse(JSON.stringify(files.get(path))) : null;
    },
    async exists(path) {
      calls.push(["exists", path]);
      return files.has(path);
    },
    async list(dir) {
      calls.push(["list", dir]);
      return [...files.keys()].filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/")).sort();
    },
  };
}

/** Wait for queued promise callbacks (ingest runs as `void` from hooks). */
export const settle = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};

export async function installClient({ settings = {}, queue2 = null, moduleId = "pentaryn-feedback" } = {}) {
  const holder = { F: null, gmOffline: false };

  const gm = makeDoc("User", { id: IDS.gm, name: "Gamemaster", isGM: true, active: true, role: 4 });
  Object.defineProperty(gm, "isSelf", { get() { return globalThis.game?.user?.id === this.id; } });
  Object.defineProperty(gm, "query", {
    value: async (name, data, opts) => {
      const F = holder.F;
      F.calls.push({ op: "query", to: gm.id, name, data: F.plain(data), timeout: opts?.timeout ?? null });
      if (holder.gmOffline) throw new Error("TIMEOUT: the query timed out");
      const sender = globalThis.game.user;
      F.become({ userId: gm.id });
      try {
        return await globalThis.CONFIG.queries[name](data, { user: sender });
      } finally {
        F.become({ userId: sender.id });
      }
    },
  });

  const F = await installFoundry({
    user: gm,
    users: [
      { id: IDS.player, name: "Caven's player", isGM: false, active: true, role: 1, character: null },
      { id: IDS.player2, name: "Mira's player", isGM: false, active: false, role: 1,
        flags: queue2 ? { [moduleId]: { queue: queue2 } } : {} },
    ],
    actors: [
      { id: IDS.caven, name: "Caven", type: "character", system: { attributes: { hp: { value: 12, max: 27 } } } },
      { id: IDS.goblin, name: "Goblin", type: "npc", system: { attributes: { hp: { value: 7, max: 7 } } } },
    ],
    scenes: [{ id: IDS.scene, name: "Underdark Gate", active: true, tokens: [{ id: IDS.token, name: "Caven", actorId: IDS.caven }] }],
    messages: [
      { id: IDS.msgMine, author: IDS.gm, timestamp: 10, flavor: "Longsword — Attack", rolls: [{ total: 17 }], whisper: [], content: "SECRET CONTENT" },
      { id: IDS.msgOther, author: IDS.player, timestamp: 11, flavor: "Their roll", rolls: [], whisper: [IDS.gm], content: "their whisper" },
    ],
    modules: [
      { id: moduleId, version: "0.1.0" },
      { id: "pentaryn-dropbin", version: "0.4.0" },
      { id: "some-inactive", version: "1.0.0", active: false },
    ],
    settings,
    lang: LANG,
    currentScene: IDS.scene,
  });
  holder.F = F;
  F.holder = holder;
  F.gm = gm;
  // the stub's makeDoc gives users a `character` only when passed; give the player Caven
  game.users.get(IDS.player).character = game.actors.get(IDS.caven);
  game.world = { id: WORLD, title: "Test World" };
  game.version = "14.369";
  game.user.targets = new Set();

  /* window + body listeners */
  const winListeners = new Map();
  globalThis.addEventListener = (name, fn) => winListeners.set(name, [...(winListeners.get(name) ?? []), fn]);
  globalThis.removeEventListener = (name, fn) => winListeners.set(name, (winListeners.get(name) ?? []).filter(f => f !== fn));
  F.windowEvent = (name, event) => {
    for (const fn of winListeners.get(name) ?? []) fn(event);
  };
  F.windowListeners = name => (winListeners.get(name) ?? []).length;

  const bodyListeners = [];
  globalThis.document = {
    body: {
      addEventListener: (name, fn, capture) => bodyListeners.push({ name, fn, capture }),
      removeEventListener: (name, fn) => {
        const i = bodyListeners.findIndex(l => l.fn === fn);
        if (i >= 0) bodyListeners.splice(i, 1);
      },
    },
  };
  F.bodyListeners = bodyListeners;
  F.click = target => {
    for (const l of bodyListeners) if (l.name === "click") l.fn({ target });
  };

  /* core's Notifications: info/warn/error go through notify (the method the recorder wraps) */
  class Notifications {
    notify(message, type = "info") {
      F.calls.push({ op: "notify", level: type, message: String(message) });
      return { message, type };
    }
    info(m, o) { return this.notify(m, "info", o); }
    warn(m, o) { return this.notify(m, "warning", o); }
    error(m, o) { return this.notify(m, "error", o); }
    success(m, o) { return this.notify(m, "success", o); }
  }

  /* a recording ApplicationV2: render calls _renderHTML and keeps the string; no DOM */
  F.rendered = [];
  class ApplicationV2 {
    static DEFAULT_OPTIONS = {};
    constructor(options = {}) {
      this.options = { ...this.constructor.DEFAULT_OPTIONS, ...options };
      this.id = this.options.id;
      this.rendered = false;
      this.element = null;
    }
    async render() {
      this.html = await this._renderHTML({}, {});
      this.rendered = true;
      F.rendered.push(this);
      return this;
    }
    async close() {
      this.rendered = false;
      this._onClose?.({});
      return this;
    }
  }

  foundry.applications.api.ApplicationV2 = ApplicationV2;
  foundry.applications.ui = { Notifications };
  foundry.applications.instances = new Map();
  ui.notifications = new Notifications();
  ui.controls = { controls: {}, control: { name: "tokens" }, tool: { name: "select" } };
  ui.windows = {};
  canvas.tokens.controlled = [];
  return F;
}
