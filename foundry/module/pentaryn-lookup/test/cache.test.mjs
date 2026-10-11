// The per-session book cache (guide step 12, declared DL5, prompts-lookup-1): counters, not timers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";
import { BOOKSETS, MODULE } from "../lookup-core.mjs";

const F = await installFoundry({ modules: [MODULE] });
const world = installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;
const PHB = "dnd-players-handbook.content";
const present = BOOKSETS.rules.filter(id => world.packs.has(id));
const loads = () => present.map(id => world.packs.get(id).calls.getDocuments);
const delta = before => loads().map((n, i) => n - before[i]);

test("search, page(name) and selftest-style reads share one load per present pack", async () => {
  rules.uninstall();
  const before = loads();
  await rules.search("cover");
  await rules.page("Study");
  await rules.search("half cover", { limit: 20 });
  await rules.page("Artifacts");
  assert.deepEqual(delta(before), present.map(() => 1));
});

test("two concurrent searches on a cold cache share one getDocuments() per pack", async () => {
  rules.uninstall();
  const before = loads();
  const [a, b] = await Promise.all([rules.search("cover"), rules.search("cover")]);
  assert.deepEqual(a, b);
  assert.deepEqual(delta(before), present.map(() => 1));
});

test("a missing pack is never cached: it is looked up on every call", async () => {
  rules.uninstall();
  const out = await rules.search("cover");
  assert.match(out.warning, /dnd-dungeon-masters-guide\.content/);
  assert.match((await rules.search("cover")).warning, /dnd-dungeon-masters-guide\.content/);
});

test("a failed load is not cached: the call rejects as before, the next call retries", async () => {
  rules.uninstall();
  const pack = world.packs.get(PHB);
  const real = pack.getDocuments;
  pack.getDocuments = async () => { pack.calls.getDocuments += 1; throw new Error("pack locked"); };
  try {
    await assert.rejects(rules.search("cover"), /pack locked/);
  } finally {
    pack.getDocuments = real;
  }
  const before = pack.calls.getDocuments;
  assert.ok((await rules.search("cover")).total > 0);
  assert.equal(pack.calls.getDocuments - before, 1);
});

test("uninstall() empties the cache: the next search reloads", async () => {
  await rules.search("cover");
  const before = loads();
  await rules.search("cover");
  assert.deepEqual(delta(before), present.map(() => 0));
  rules.uninstall();
  await rules.search("cover");
  assert.deepEqual(delta(before), present.map(() => 1));
});
