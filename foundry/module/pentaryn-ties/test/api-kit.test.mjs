/**
 * The kit-built API (guide S8): describe() and the surface as goldens (C28), the kit members, the
 * manifest ↔ implementation agreement, STANCES published as a frozen copy (the module's own table
 * stays writable), and uninstall() leaving no hook or document listener behind.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { surfaceOf } from "../lib/api.mjs";
import { bootWorld } from "./fixtures/world.mjs";

const F = await bootWorld({ actors: [{ id: "zzPc000000000001", name: "ZZ Caven", type: "character" }] });
const T = () => game.pentaryn.ties;
const core = await import("../ties-core.mjs");
const { MANIFEST } = await import("../api-manifest.mjs");

test("describe(): the manifest as plain JSON (golden/describe.json)", () => {
  const d = T().describe();
  assert.equal(d.module, "pentaryn-ties");
  assert.equal(d.namespace, "ties");
  assert.equal(d.version, core.VERSION);
  assert.equal(d.contract, core.CONTRACT);
  pinJSON("describe", normaliseDescribe(d), import.meta.url);
});

test("surface: every member and its function name (golden/surface.json)", () => {
  pinJSON("surface", surfaceOf(T()), import.meta.url);
});

test("the kit members are present; every manifest row has a function; nothing unlisted but STANCES", () => {
  for (const k of ["describe", "settings", "trace", "uninstall"]) assert.equal(typeof T()[k], "function", k);
  assert.equal(T().version, core.VERSION);
  assert.equal(T().contract, core.CONTRACT);
  const get = path => path.split(".").reduce((o, k) => o?.[k], T());
  for (const row of MANIFEST.rows) assert.equal(typeof get(row.path), "function", row.path);
  assert.deepEqual(MANIFEST.unlisted, ["STANCES"]);
  assert.equal(T().describe().methods.length, MANIFEST.rows.length);
});

test("STANCES: a frozen copy is published; the module's own table is not frozen", () => {
  assert.deepEqual(T().STANCES, core.STANCES);
  assert.notEqual(T().STANCES, core.STANCES);
  assert.ok(Object.isFrozen(T().STANCES));
  assert.ok(!Object.isFrozen(core.STANCES));
});

test("the API object is frozen; settings() reports the store rows by size", () => {
  assert.ok(Object.isFrozen(T()));
  assert.ok(Object.isFrozen(T().study));
  const s = T().settings();
  assert.deepEqual(s.attributes, { store: true, size: 0 });
  assert.equal(s.playerAccess, true);
});

test("S9 / B11: published through the kit — module.api is canonical, the alias is the same object, both ready hooks fired once", () => {
  assert.equal(game.modules.get("pentaryn-ties").api, game.pentaryn.ties);
  const fired = F.calls.filter(c => c.op === "Hooks.callAll" && /ready$/.test(c.name)).map(c => c.name);
  assert.deepEqual(fired, ["pentaryn-ties.ready", "pentaryn.ready"]);
  assert.deepEqual(game.pentaryn.namespaces(), ["ties"]);
});

/** A call's outcome as one comparable value: what it answered, or the code/message it threw. */
async function outcome(fn, args) {
  try {
    return { ok: await fn(...args) };
  } catch (err) {
    return { threw: err?.code ?? err?.message ?? String(err) };
  }
}

test("ext-5: every read param that takes an id is marked resolve: false in the manifest", () => {
  // api.mjs resolves these by hand (resolving(fn, n)); the manifest must say so, or describe() lies
  const REF_TYPE = MANIFEST.rows.find(r => r.path === "read").params[0].type;
  const unmarked = [];
  for (const row of MANIFEST.rows) {
    if (row.writes) continue;
    row.params.forEach((p, i) => { if (p.type === REF_TYPE && p.resolve !== false) unmarked.push(`${row.path}#${i}`); });
  }
  assert.deepEqual(unmarked, []);
});

test("ext-5: every resolve: false position answers the same for the actor's id as for the Actor", async () => {
  const actor = game.actors.get("zzPc000000000001");
  assert.ok(actor, "fixture actor");
  const get = path => path.split(".").reduce((o, k) => o?.[k], T());
  let checked = 0;
  for (const row of MANIFEST.rows) {
    const positions = row.params.flatMap((p, i) => (p.resolve === false ? [i] : []));
    if (!positions.length) continue;
    const fn = get(row.path);
    const n = row.params.filter(p => !p.optional).length;
    const base = Array.from({ length: n }, () => actor);
    const want = await outcome(fn, base);
    for (const i of positions) {
      const args = base.slice();
      args[i] = actor.id;
      assert.deepEqual(await outcome(fn, args), want, `${row.path}: param ${i} given the id`);
      checked++;
    }
  }
  assert.ok(checked >= 14, `checked ${checked} positions`);
});

test("uninstall(): no ties hook and no document listener is left", () => {
  document.removeEventListener = function (type, fn, capture) {
    const i = this.listeners.findIndex(l => l.type === type && l.fn === fn && l.capture === (capture === true));
    if (i >= 0) this.listeners.splice(i, 1);
  };
  assert.ok(Object.keys(F.listeners()).length > 0);
  T().uninstall();
  assert.deepEqual(F.listeners(), {});
  assert.deepEqual(document.listeners, []);
});
