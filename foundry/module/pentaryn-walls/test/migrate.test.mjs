// The Wave 7 flag-scope migration (guide step 10, blueprint B6): designed and tested here, DORMANT
// until the Wave 7 batch wires it. Pure planner, then the GM runner against the kit stub, then
// proof that loading the module never runs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_SCOPE, MIGRATION_VERSION, MODULE_SCOPE, planScopeMigration, planUndo, wasmReady } from "./fixtures/engine.mjs";
import { makeScene, wallsWorld } from "./fixtures/world.mjs";

const DEL = Symbol("del");
const pre = { _id: "pre", c: [0, 0, 50, 0], flags: { [LEGACY_SCOPE]: { run: "T1", rule: "X1", priorC: [0, 0, 80, 0] } } };
const post = { _id: "post", c: [0, 9, 50, 9], flags: { [MODULE_SCOPE]: { run: "T1", generated: true } } };
const hint = { _id: "hint", c: [0, 20, 9, 20], flags: { [LEGACY_SCOPE]: { keepOpen: true }, other: { x: 1 } } };
const both = { _id: "both", c: [0, 30, 9, 30], flags: { [LEGACY_SCOPE]: { run: "T0", keepOpen: true }, [MODULE_SCOPE]: { run: "T2" } } };
const bare = { _id: "bare", c: [0, 40, 9, 40] };

/** Foundry's update semantics for these payloads: merge the object, honour the deletion. */
function apply(walls, updates) {
  return walls.map(w => {
    const u = updates.find(x => x._id === w._id);
    if (!u) return w;
    const flags = { ...(w.flags ?? {}) };
    for (const [k, v] of Object.entries(u)) {
      if (!k.startsWith("flags.")) continue;
      const scope = k.slice(6);
      if (v === DEL) delete flags[scope];
      else flags[scope] = { ...(flags[scope] ?? {}), ...v };
    }
    return { ...w, flags };
  });
}

test("scopes and version", () => {
  assert.equal(MODULE_SCOPE, "pentaryn-walls");
  assert.equal(LEGACY_SCOPE, "wall-autocomplete");
  assert.equal(MIGRATION_VERSION, 1);
});

test("planScopeMigration: pre-migration walls move, post-migration and bare walls are left out", () => {
  assert.deepEqual(planScopeMigration([pre, post, hint, bare], { del: DEL }), [
    { _id: "pre", "flags.pentaryn-walls": { run: "T1", rule: "X1", priorC: [0, 0, 80, 0] }, "flags.wall-autocomplete": DEL },
    { _id: "hint", "flags.pentaryn-walls": { keepOpen: true }, "flags.wall-autocomplete": DEL },
  ]);
  assert.deepEqual(planScopeMigration([], { del: DEL }), []);
  assert.deepEqual(planScopeMigration([{ _id: "odd", flags: { [LEGACY_SCOPE]: "not an object" } }], { del: DEL }), []);
});

test("a wall carrying both scopes keeps the module scope's keys and gains the legacy ones", () => {
  assert.deepEqual(planScopeMigration([both], { del: DEL })[0]["flags.pentaryn-walls"], { run: "T2", keepOpen: true });
});

test("idempotent: planning over the migrated scene yields nothing; other scopes are untouched", () => {
  const scene = [pre, post, hint, both, bare];
  const once = apply(scene, planScopeMigration(scene, { del: DEL }));
  assert.deepEqual(planScopeMigration(once, { del: DEL }), []);
  assert.deepEqual(once.find(w => w._id === "hint").flags, { other: { x: 1 }, [MODULE_SCOPE]: { keepOpen: true } });
  for (const w of once) assert.equal(LEGACY_SCOPE in (w.flags ?? {}), false, w._id);
});

test("undo answers the same before and after the migration", () => {
  const scene = [pre, post, hint, bare];
  const after = apply(scene, planScopeMigration(scene, { del: DEL }));
  assert.deepEqual(planUndo(after), planUndo(scene));
  assert.deepEqual(planUndo(after, { all: true }), planUndo(scene, { all: true }));
});

const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
const before = F.calls.length;
F.fire("init");
F.fire("ready");
await wasmReady;
for (let i = 0; i < 20; i++) await Promise.resolve();

test("dormant: loading the module and firing init/ready writes no wall and no setting", () => {
  const writes = F.calls.slice(before).filter(c => /EmbeddedDocuments$|^update$|settings\.set/.test(c.op));
  assert.deepEqual(writes, []);
});

/** The runner is reached the way the Wave 7 wiring will reach it: ctx.exposed, via the feature. */
const { migrateFlagScope } = await import("../migrations.mjs");
const store = (v = 0) => ({ v, get() { return this.v; }, set(x) { this.v = x; } });

test("runner: a dry run plans per scene and writes nothing", async () => {
  const s1 = makeScene(F, { id: "sceneMig0000001", name: "A", walls: [pre, post, bare] });
  const s2 = makeScene(F, { id: "sceneMig0000002", name: "B", walls: [bare] });
  const version = store();
  const from = F.calls.length;
  const out = await migrateFlagScope({ scenes: [s1, s2], version, dryRun: true });
  assert.deepEqual(out, { ok: true, from: 0, to: 1, dryRun: true, scenes: [{ sceneId: s1.id, walls: 1 }], walls: 1 });
  assert.deepEqual(F.calls.slice(from).filter(c => /EmbeddedDocuments$/.test(c.op)), []);
  assert.equal(version.v, 0);
});

test("runner: one Wall batch per scene with legacy stamps, _del for the old scope, then the version", async () => {
  const s1 = makeScene(F, { id: "sceneMig0000003", name: "A", walls: [pre, hint, post] });
  const s2 = makeScene(F, { id: "sceneMig0000004", name: "B", walls: [bare] });
  const s3 = makeScene(F, { id: "sceneMig0000005", name: "C", walls: [both] });
  const version = store();
  const from = F.calls.length;
  const out = await migrateFlagScope({ scenes: [s1, s2, s3], version });
  assert.equal(out.walls, 3);
  const writes = F.calls.slice(from).filter(c => /EmbeddedDocuments$/.test(c.op));
  assert.deepEqual(writes.map(c => [c.op, c.type, c.data.map(u => u._id)]), [
    ["updateEmbeddedDocuments", "Wall", ["pre", "hint"]],
    ["updateEmbeddedDocuments", "Wall", ["both"]],
  ]);
  assert.equal(writes[0].data[0]["flags.wall-autocomplete"], "<_del>");
  assert.equal(version.v, MIGRATION_VERSION);
  const again = await migrateFlagScope({ scenes: [s1, s2, s3], version });
  assert.deepEqual(again, { ok: true, skipped: "already applied", from: 1, scenes: [], walls: 0 });
});

test("runner: a player is refused before reading anything", async () => {
  const isGM = game.user.isGM;
  game.user.isGM = false;
  try {
    const version = { get() { throw new Error("must not read"); }, set() { throw new Error("must not write"); } };
    assert.deepEqual(await migrateFlagScope({ scenes: [], version }), { ok: false, skipped: "not a GM", scenes: [], walls: 0 });
  } finally {
    game.user.isGM = isGM;
  }
});
