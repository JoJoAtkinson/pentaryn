// The published API (small tier + kit api): manifest ↔ impls, the surface and describe goldens,
// spawn / selectMine / clearSelection on a synthetic Dice So Nice, status(), and selftest() — the
// smoke check that the six Dice So Nice internals still exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { installDom } from "./fixtures/dom.mjs";
import { IDS, fakeDsn, world } from "./fixtures/dsn.mjs";
import { INTERNALS, MODULE } from "../dice-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { SETTINGS } from "../settings.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";

installDom();
const F = await installFoundry(world(MODULE));
let D = fakeDsn();
game.dice3d = D.dice3d;
game.keybindings.get = (ns, key) => game.keybindings.actions.get(`${ns}.${key}`)?.editable ?? [];
await import("../dice.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.modules.get(MODULE).api;
const fresh = () => {
  D = fakeDsn();
  game.dice3d = D.dice3d;
};

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("describe() equals golden/describe.json (version, kit and published excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("every described method is a function on the API", () => {
  for (const { path } of api.describe().methods) assert.equal(typeof api[path], "function", path);
});

test("described settings are exactly the SETTINGS table; settings() snapshots them", () => {
  assert.deepEqual(api.describe().settings.map(s => s.key), SETTINGS.map(r => r.key));
  assert.deepEqual(api.settings(), { enabled: true });
});

test("selftest(): ok with all six internals; each missing one is named", () => {
  fresh();
  const good = api.selftest();
  assert.equal(good.ok, true);
  assert.deepEqual(good.checks.map(c => c.name), INTERNALS.map(i => i.name));
  delete D.manager.countPersistentDiceByOwner;
  const bad = api.selftest();
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.checks.filter(c => !c.ok).map(c => c.name), ["countPersistentDiceByOwner"]);
  game.dice3d = null;
  assert.equal(api.selftest().checks.filter(c => c.ok).length, 0);
  fresh();
});

test("spawn(): BAD_ARGS for a non-die, a dry run spawns nothing, a real one spawns through persistent.spawn", async () => {
  fresh();
  assert.deepEqual(await api.spawn({ type: "2d6" }), { ok: false, code: "BAD_ARGS", reason: 'not a die type: "2d6"' });
  assert.equal((await api.spawn()).code, "BAD_ARGS");
  assert.deepEqual(await api.spawn({ type: "d100", count: 2, dryRun: true }), {
    ok: true, dryRun: true, type: "d100", requested: 2, dice: ["d100", "d10", "d100", "d10"],
  });
  assert.equal(D.calls.length, 0);
  assert.deepEqual(await api.spawn({ type: "d6", count: 8 }), { ok: true, requested: 8, spawned: 8, stopped: false });
  assert.equal(D.list.length, 8);
});

test("spawn(): NOT_READY without a persistent-dice manager (DSN's setting off)", async () => {
  fresh();
  D.dice3d.box.persistentDiceManager = null;
  assert.equal((await api.spawn({ type: "d6" })).code, "NOT_READY");
  fresh();
});

test("selectMine() / clearSelection(): this user's dice, by type, then cleared", () => {
  fresh();
  const mine = [D.make("d6"), D.make("d6"), D.make("d20")];
  D.make("d6", { ownerUserId: IDS.player });
  assert.equal(api.selectMine({ type: "d6" }), 2);
  assert.equal(api.selectMine(), 3);
  assert.deepEqual([...D.selected], mine.map(m => m.id));
  assert.equal(api.clearSelection(), 3);
  assert.equal(D.selected.size, 0);
  game.dice3d = null;
  assert.equal(api.selectMine(), 0, "Dice So Nice missing: nothing, no throw");
  assert.equal(api.clearSelection(), 0);
  fresh();
});

test("status(): one read-only diagnosis", () => {
  fresh();
  D.make("d6");
  const pair = [D.make("d100", { linkGroupId: "lg00000000000001" }), D.make("d10", { linkGroupId: "lg00000000000001", linkGroupSecondary: true })];
  D.selected.add(pair[0].id);
  D.selected.add(pair[1].id);
  const n = D.calls.length;
  const s = api.status();
  assert.deepEqual({ ...s, internals: s.internals.ok }, {
    enabled: true, dsnActive: true, persistentDice: true, mine: 2, selected: { d100: 1 }, shortcut: "Alt+A", internals: true,
  });
  assert.equal(D.calls.length, n, "status() changes nothing");
});
