import { test } from "node:test";
import assert from "node:assert/strict";
import { defineKeybindings, defineSettings, serialStore, settingReader, settingsSnapshot } from "../settings.mjs";

function fakeGame({ isGM = true, activeSelf = true } = {}) {
  const registry = new Map();
  const values = new Map();
  const writes = [];
  const binds = [];
  let chain = Promise.resolve();
  return {
    registry, values, writes, binds,
    foundry: { utils: { Semaphore: class { add(fn, ...a) { const r = chain.then(() => fn(...a)); chain = r.catch(() => {}); return r; } } } },
    game: {
      user: { isGM },
      users: { activeGM: activeSelf ? { isSelf: true } : { isSelf: false } },
      settings: {
        settings: registry,
        register: (ns, key, cfg) => registry.set(`${ns}.${key}`, cfg),
        get(ns, key) {
          const id = `${ns}.${key}`;
          if (!registry.has(id)) throw new Error(`"${id}" is not a registered game setting`);
          return values.has(id) ? values.get(id) : registry.get(id).default;
        },
        async set(ns, key, v) { writes.push([key, v]); values.set(`${ns}.${key}`, v); return v; },
      },
      keybindings: {
        actions: new Map(),
        bindings: undefined,
        register(ns, key, cfg) {
          if (this.bindings) throw new Error("You cannot register a Keybinding after the init hook");
          this.actions.set(`${ns}.${key}`, cfg);
          binds.push([`${ns}.${key}`, cfg.name, cfg.hint]);
        },
      },
    },
  };
}

const SETTINGS = [
  { key: "enabled", scope: "world", config: true, type: Boolean, default: true, name: "PENTARYN_X.settings.enabled.name", hint: "PENTARYN_X.settings.enabled.hint", doc: "on/off" },
  { key: "mode", scope: "client", config: true, type: String, default: "a", choices: { a: true, b: "Literal B" }, requiresReload: true, doc: "mode" },
  { key: "log", store: true, type: Array, default: [], doc: "store" },
];

test("rows register in table order; literal labels win; derivation is the fallback", () => {
  const g = fakeGame();
  assert.deepEqual(defineSettings("pentaryn-x", SETTINGS, { i18nRoot: "PENTARYN_X", g }), ["enabled", "mode", "log"]);
  assert.deepEqual([...g.registry.keys()], ["pentaryn-x.enabled", "pentaryn-x.mode", "pentaryn-x.log"]);
  const en = g.registry.get("pentaryn-x.enabled");
  assert.equal(en.name, "PENTARYN_X.settings.enabled.name");
  const mode = g.registry.get("pentaryn-x.mode");
  assert.equal(mode.name, "PENTARYN_X.Setting.mode.Name");
  assert.deepEqual(mode.choices, { a: "PENTARYN_X.Setting.mode.a", b: "Literal B" });
  assert.equal(mode.requiresReload, true);
  assert.deepEqual(g.registry.get("pentaryn-x.log"), { scope: "world", config: false, type: Array, default: [] });
  assert.equal("doc" in en, false);
  // a second load (hot patch) registers nothing
  assert.deepEqual(defineSettings("pentaryn-x", SETTINGS, { i18nRoot: "PENTARYN_X", g }), []);
});

test("setting(): live value, the default when unreadable, undefined for an unknown key", () => {
  const g = fakeGame();
  const setting = settingReader("pentaryn-x", SETTINGS, { g });
  assert.equal(setting("enabled"), true);        // unregistered → row default
  defineSettings("pentaryn-x", SETTINGS, { g });
  g.values.set("pentaryn-x.enabled", false);
  assert.equal(setting("enabled"), false);
  assert.equal(setting("nope"), undefined);
});

test("settingsSnapshot reports stores by size, not content", () => {
  const g = fakeGame();
  defineSettings("pentaryn-x", SETTINGS, { g });
  g.values.set("pentaryn-x.log", [1, 2, 3]);
  assert.deepEqual(settingsSnapshot("pentaryn-x", SETTINGS, { g }), { enabled: true, mode: "a", log: { store: true, size: 3 } });
});

test("keybindings carry literal labels, derived as a fallback", () => {
  const g = fakeGame();
  defineKeybindings("pentaryn-x", [{ key: "show", name: "PENTARYN_X.Keybind.show.Name", hint: "PENTARYN_X.Keybind.show.Hint", editable: [] }, { key: "hide", editable: [] }], { i18nRoot: "PENTARYN_X", g });
  assert.deepEqual(g.binds, [
    ["pentaryn-x.show", "PENTARYN_X.Keybind.show.Name", "PENTARYN_X.Keybind.show.Hint"],
    ["pentaryn-x.hide", "PENTARYN_X.Keybind.hide.Name", "PENTARYN_X.Keybind.hide.Hint"],
  ]);
});

test("keybindings: a row already registered is skipped (hot patch before Foundry built its bindings)", () => {
  const g = fakeGame();
  const rows = [{ key: "show", name: "PENTARYN_X.Keybind.show.Name", hint: "PENTARYN_X.Keybind.show.Hint", editable: [] }];
  assert.deepEqual(defineKeybindings("pentaryn-x", rows, { g }), ["show"]);
  const debug = [];
  assert.deepEqual(defineKeybindings("pentaryn-x", rows, { g, log: { debug: m => debug.push(m) } }), []);
  assert.equal(g.binds.length, 1);
  assert.deepEqual(debug, ["keybindings: pentaryn-x.show already registered — skipped"]);
});

test("keybindings: once Foundry has built its bindings (after setup) nothing is registered and nothing throws", () => {
  const g = fakeGame();
  g.game.keybindings.bindings = new Map();           // what Game#initializeKeyboard leaves behind
  const rows = [{ key: "show", name: "PENTARYN_X.Keybind.show.Name", hint: "PENTARYN_X.Keybind.show.Hint", editable: [] }];
  assert.throws(() => g.game.keybindings.register("pentaryn-x", "show", {}), { message: "You cannot register a Keybinding after the init hook" });
  const debug = [];
  assert.deepEqual(defineKeybindings("pentaryn-x", rows, { g, log: { debug: m => debug.push(m) } }), []);
  assert.deepEqual(g.binds, []);
  assert.equal(debug.length, 1);
  assert.match(debug[0], /already built its bindings — 1 row\(s\) not registered/);
  // an empty table never logs
  assert.deepEqual(defineKeybindings("pentaryn-x", [], { g, log: { debug: m => debug.push(m) } }), []);
  assert.equal(debug.length, 1);
});

test("serialStore serialises read-modify-write; any GM may write by default", async () => {
  const g = fakeGame();
  defineSettings("pentaryn-x", SETTINGS, { g });
  const store = serialStore("pentaryn-x", "log", { g, semaphore: new g.foundry.utils.Semaphore(1) });
  await Promise.all([1, 2, 3].map(n => store.write(list => [...list, n])));
  await store.flush();
  assert.deepEqual(store.read(), [1, 2, 3]);
  assert.equal(g.writes.length, 3);
});

test("serialStore refuses on a player; anyGM:false refuses a non-active GM", async () => {
  const p = fakeGame({ isGM: false });
  defineSettings("pentaryn-x", SETTINGS, { g: p });
  assert.equal(await serialStore("pentaryn-x", "log", { g: p }).write(l => [...l, 1]), null);
  const g2 = fakeGame({ isGM: true, activeSelf: false });
  defineSettings("pentaryn-x", SETTINGS, { g: g2 });
  assert.equal(await serialStore("pentaryn-x", "log", { g: g2, anyGM: false }).write(l => [...l, 1]), null);
  assert.deepEqual(await serialStore("pentaryn-x", "log", { g: g2 }).write(l => [...l, 1]), [1]);
});

test("K6 serialStore over several keys: one queue, keys written in order, concurrent appends serialised", async () => {
  const g = fakeGame();
  defineSettings("pentaryn-x", [
    { key: "counter", store: true, scope: "world", type: Number, default: 0 },
    { key: "ledger", store: true, scope: "world", type: Array, default: [] },
  ], { g });
  const store = serialStore("pentaryn-x", ["counter", "ledger"], { g, semaphore: new g.foundry.utils.Semaphore(1) });
  const append = e => store.write(({ counter, ledger }) => ({ counter: counter + 1, ledger: [...ledger, { n: counter + 1, e }] }));
  const out = await Promise.all([append("a"), append("b")]);
  assert.deepEqual(out.map(o => o.counter), [1, 2]);
  assert.deepEqual(store.read(), { counter: 2, ledger: [{ n: 1, e: "a" }, { n: 2, e: "b" }] });
  assert.deepEqual(g.writes.map(w => w[0]), ["counter", "ledger", "counter", "ledger"]);
  await assert.rejects(store.write(() => { throw new Error("boom"); }), { message: "boom" });
  assert.equal((await append("c")).counter, 3, "a rejected write does not block later ones");
});
