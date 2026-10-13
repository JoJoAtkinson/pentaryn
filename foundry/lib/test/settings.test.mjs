import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SETTING_PASSTHROUGH, defineKeybindings, defineSettings, serialStore, settingReader, settingsSnapshot } from "../settings.mjs";

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

test("defineSettings forwards filePicker to register", () => {
  const g = fakeGame();
  defineSettings("pentaryn-x", [{ key: "img", scope: "world", config: true, type: String, default: "", filePicker: "image", doc: "img" }], { g });
  assert.equal(g.registry.get("pentaryn-x.img").filePicker, "image");
});

test("kit-ext-9: SETTING_PASSTHROUGH is exported; an unknown row key warns once per key, never throws", () => {
  assert.deepEqual([...SETTING_PASSTHROUGH], ["range", "requiresReload", "onChange", "filePicker"]);
  assert.equal(Object.isFrozen(SETTING_PASSTHROUGH), true);
  const rows = [
    { key: "a", type: String, default: "", requiresReload: true, doc: "a" },
    { key: "b", type: Number, default: 0, step: 5, doc: "b" },
    { key: "c", type: Number, default: 0, step: 5, mystery: 1, doc: "c" },
  ];
  const warn = [];
  const g = fakeGame();
  assert.deepEqual(defineSettings("pentaryn-x", rows, { g, log: { warn: m => warn.push(m) } }), ["a", "b", "c"]);
  // once per unknown key name per call: "step" on c does not warn again
  assert.deepEqual(warn, [
    'settings: pentaryn-x.b: row key "step" is not passed to register (see SETTING_PASSTHROUGH)',
    'settings: pentaryn-x.c: row key "mystery" is not passed to register (see SETTING_PASSTHROUGH)',
  ]);
  assert.equal("step" in g.registry.get("pentaryn-x.b"), false);
  // no log: silent, and still registers
  const g2 = fakeGame();
  assert.deepEqual(defineSettings("pentaryn-x", rows, { g: g2 }), ["a", "b", "c"]);
});

test("kit-ext-9: defineKeybindings takes a labels option like defineSettings", () => {
  const g = fakeGame();
  defineKeybindings("pentaryn-x", [{ key: "hide", editable: [] }], { i18nRoot: "PENTARYN_X", labels: { section: "keybindings", name: "name", hint: "hint" }, g });
  assert.deepEqual(g.binds, [["pentaryn-x.hide", "PENTARYN_X.keybindings.hide.name", "PENTARYN_X.keybindings.hide.hint"]]);
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

test("KIT-R4 a partial multi-key mutate keeps the omitted key; an explicit null still writes null", async () => {
  const g = fakeGame();
  defineSettings("pentaryn-x", [
    { key: "counter", store: true, scope: "world", type: Number, default: 0 },
    { key: "ledger", store: true, scope: "world", type: Array, default: [] },
  ], { g });
  const store = serialStore("pentaryn-x", ["counter", "ledger"], { g, semaphore: new g.foundry.utils.Semaphore(1) });
  await store.write(() => ({ counter: 1, ledger: ["a"] }));
  const out = await store.write(({ counter }) => ({ counter: counter + 1 }));
  assert.deepEqual(out, { counter: 2, ledger: ["a"] }, "write resolves to the full stored object");
  assert.deepEqual(store.read(), { counter: 2, ledger: ["a"] });
  await store.write(() => ({ ledger: null }));
  assert.deepEqual(store.read(), { counter: 2, ledger: null });
});

// AC-6 (declared, docs only): a multi-key write is not atomic — Foundry has no multi-key setting
// transaction. The serialStore JSDoc and the README settings row must say so and name the mitigation.
test("AC-6: the serialStore JSDoc and the README row document the non-atomic multi-key window", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const read = rel => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
  const src = read("settings.mjs");
  const jsdoc = src.slice(src.lastIndexOf("/**", src.indexOf("export function serialStore")), src.indexOf("export function serialStore"))
    .replace(/\s*\n\s*\*\s?/g, " ");
  const row = read("README.md").split("\n").find(l => l.startsWith("| `settings.mjs` |"));
  for (const [where, text] of [["serialStore JSDoc", jsdoc], ["README settings.mjs row", row ?? ""]]) {
    assert.match(text, /not atomic/, `${where}: says a multi-key write is not atomic`);
    assert.match(text, /separate Setting writes/, `${where}: keys are separate Setting writes`);
    assert.match(text, /onChange/, `${where}: onChange sees intermediate states`);
    assert.match(text, /torn/, `${where}: a failure can leave a torn pair`);
    assert.match(text, /counter key first/, `${where}: list the counter key first`);
  }
});

// kit-perf-4 (final review 2026-10-12): Foundry builds a Setting on every client-scope
// game.settings.get, and settingReader calls get each time. Ruling: settingReader stays uncached so
// a hot-patched client still reads live values; the settingReader JSDoc, the README settings.mjs row
// and blueprint §5.5 tell callers to cache a hot client-scope read at the call site and invalidate it
// from the row's onChange.
test("kit-perf-4: settingReader stays uncached; JSDoc, README and blueprint §5.5 say cache hot client reads at the call site, invalidate from onChange", () => {
  const read = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
  const src = read("../settings.mjs");
  const doc = src.slice(0, src.indexOf("export function settingReader")).split("/**").pop();
  const row = read("../README.md").split("\n").find(l => l.startsWith("| `settings.mjs` |"));
  assert.ok(row, "README.md has no settings.mjs row");
  const bp = read("../../../context/foundry/addon-blueprint.md");
  const s55 = bp.slice(bp.indexOf("### 5.5 Performance"), bp.indexOf("### 5.6"));
  for (const [where, text] of [["settingReader JSDoc", doc], ["README settings.mjs row", row], ["blueprint §5.5", s55]]) {
    for (const needle of ["client-scope", "call site", "onChange", "uncached", "kit-perf-4"]) {
      assert.ok(text.includes(needle), `${where} does not mention "${needle}"`);
    }
  }
  // and the reader really is uncached: a changed value is read live on the next call
  const g = fakeGame();
  defineSettings("m", [{ key: "k", scope: "client", type: Number, default: 1, doc: "x" }], { g });
  const setting = settingReader("m", [{ key: "k", default: 1 }], { g });
  assert.equal(setting("k"), 1);
  g.game.settings.set("m", "k", 2);
  assert.equal(setting("k"), 2, "settingReader now caches — revisit kit-perf-4's docs");
});
