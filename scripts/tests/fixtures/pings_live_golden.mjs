// Run scripts/foundry/live-goldens/pings.js against the pentaryn-pings node test world (the real
// module, kit Foundry stub) and print what it left behind. Driven by test_live_golden_pings.py.
//
//   node scripts/tests/fixtures/pings_live_golden.mjs [--hidden | --throttled]
//
// The log setting is modelled the way Foundry keeps a world Setting: the stored JSON in
// `_source.value` (game.settings.storage.get("world").getSetting(key)), a parsed `value` that
// game.settings.get returns (the same array every time), and a set() that is a no-op when the JSON
// equals what is stored. `--hidden` models a hidden GM tab at its worst: the module's 250 ms flush
// timer is held back for the whole run (released when the tab "comes back", before the real ping),
// so the scratch records wait in the module's pending list and never reach the store or the cache
// (pings-edge-1 [declared]: the readers show a ping only once it is written). `--throttled` models
// a hidden tab as Chrome runs one: the flush timer fires late, at 1 s (hidden-tab timer alignment),
// inside the golden's 3 s settle.
//
// Prints JSON: { hidden, throttled, seeded, out, logAfter, storedAfter, bufferAfterRealPing } — `bufferAfterRealPing` is the stored
// log after one more ping once the golden has finished (the module's private buffer is flushed by
// it, so a scratch record still in the buffer would show up there).
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = new URL("../../../", import.meta.url);
const MODDIR = new URL("foundry/module/pentaryn-pings/", REPO);
const { setupWorld, MODULE, GM, ALPHA, drain } = await import(new URL("test/fixtures/world.mjs", MODDIR));
const { makeScene } = await import(new URL("test/kit/foundry-stub.mjs", MODDIR));

const T = Date.now();
const seeded = [
  { t: T - 3000, userId: GM, userName: "Gamemaster", sceneId: ALPHA, sceneName: "ZZ live-goldens pings", x: 10, y: 20 },
  { t: T - 2000, userId: GM, userName: "Gamemaster", sceneId: ALPHA, sceneName: "ZZ live-goldens pings", x: 30, y: 40 },
  { t: T - 1000, userId: GM, userName: "Gamemaster", sceneId: ALPHA, sceneName: "ZZ live-goldens pings", x: 50, y: 60 },
];
const HIDDEN = process.argv.includes("--hidden");
const THROTTLED = process.argv.includes("--throttled");
const W = await setupWorld({ seed: structuredClone(seeded) });
const { F } = W;

// the stored Setting document for the log, as live Foundry keeps it
const KEY = `${MODULE}.log`;
const settingDoc = {
  key: KEY,
  _source: { key: KEY, value: JSON.stringify(seeded) },
  value: structuredClone(seeded),
  reset() { this.value = JSON.parse(this._source.value); },
};
const stubGet = F.game.settings.get.bind(F.game.settings);
const stubSet = F.game.settings.set;
F.game.settings.get = (ns, key) => (`${ns}.${key}` === KEY ? settingDoc.value : stubGet(ns, key));
F.game.settings.set = async (ns, key, value) => {
  if (`${ns}.${key}` !== KEY) return stubSet(ns, key, value);
  const json = JSON.stringify(value);
  if (json !== settingDoc._source.value) { settingDoc._source.value = json; settingDoc.value = JSON.parse(json); }
  return settingDoc.value;
};
F.game.settings.storage = new Map([["world", { getSetting: k => (k === KEY ? settingDoc : undefined) }]]);
const storedNow = () => JSON.parse(settingDoc._source.value);

// a hidden tab holds the module's flush (FLUSH_MS = 250) back; a throttled one runs it at 1 s
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const held = new Map();
let holding = HIDDEN;
let throttling = THROTTLED;
globalThis.setTimeout = (fn, ms, ...a) => {
  if (holding && ms === 250) { const id = { held: true }; held.set(id, () => fn(...a)); return id; }
  if (throttling && ms === 250) return realSetTimeout(fn, 1000, ...a);
  return realSetTimeout(fn, ms, ...a);
};
globalThis.clearTimeout = id => (held.has(id) ? held.delete(id) : realClearTimeout(id));
const manifest = JSON.parse(readFileSync(new URL("module.json", MODDIR), "utf8"));
F.game.modules.set(MODULE, { id: MODULE, active: true, version: manifest.version, title: manifest.title, flags: manifest.flags });
const restoreConsole = W.captureConsole();

await import(new URL("pings.mjs", MODDIR).href);
F.fire("init");
F.fire("setup");
F.fire("ready");
F.game.ready = true;

// what the live GM tab has and the stub does not
globalThis.canvas.controls = new W.ControlsLayer();
const getRoute = p => new URL(p.replace(/^\/?modules\/pentaryn-pings\//, ""), MODDIR).href;
globalThis.foundry = { ...globalThis.foundry, utils: { ...globalThis.foundry.utils, getRoute } };
let n = 0;
globalThis.Scene = {
  async create({ name, width, height, padding, grid }) {
    const size = grid?.size ?? 100;
    const sceneX = Math.ceil((width * padding) / size) * size;
    const sceneY = Math.ceil((height * padding) / size) * size;
    const scene = makeScene({ id: `zzGoldenScene${String(++n).padStart(3, "0")}`, name, width, height, padding, grid });
    scene.dimensions = { sceneX, sceneY, size, width: width + 2 * sceneX, height: height + 2 * sceneY, sceneWidth: width, sceneHeight: height };
    scene.delete = async () => { F.game.scenes.delete(scene.id); return scene; };
    F.game.scenes.set(scene.id, scene);
    return scene;
  },
};

const body = readFileSync(new URL("scripts/foundry/live-goldens/pings.js", REPO), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const out = JSON.parse(await new AsyncFunction(body)());
const logAfter = structuredClone(F.game.settings.get(MODULE, "log"));
const storedAfter = storedNow();

// the tab comes back: whatever flush was still held runs now, and timers run on time again
holding = false;
throttling = false;
for (const [id, fn] of [...held]) { held.delete(id); await fn(); }

// one real ping after the run, flushed: the module's buffer is what reaches the store
await new W.ControlsLayer().handlePing(F.game.users.get(GM), { x: 70, y: 80 }, { scene: ALPHA });
await new Promise(r => setTimeout(r, 400));
await drain();
const bufferAfterRealPing = storedNow();

restoreConsole();
process.stdout.write(JSON.stringify({ hidden: HIDDEN, throttled: THROTTLED, seeded, out, logAfter, storedAfter, bufferAfterRealPing }));
process.exit(0);
