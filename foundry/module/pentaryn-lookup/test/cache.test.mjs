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

// Review fix: only a locked pack is cached. An unlocked pack (a world compendium, or a module pack a
// GM unlocked) can be edited in the running world, so it is read on every call, as before DL5.
test("an unlocked pack is read on every call; a locked one once", async () => {
  rules.uninstall();
  const pack = world.packs.get(PHB);
  const other = present.filter(id => id !== PHB).map(id => world.packs.get(id));
  pack.locked = false;
  try {
    const before = pack.calls.getDocuments;
    const others = other.map(p => p.calls.getDocuments);
    await rules.search("cover", { books: [PHB] });
    await rules.search("cover", { books: [PHB] });
    await rules.page("Study");
    assert.equal(pack.calls.getDocuments - before, 3);
    await rules.search("cover");
    await rules.search("cover");
    assert.equal(pack.calls.getDocuments - before, 5);
    assert.deepEqual(other.map((p, i) => p.calls.getDocuments - others[i]), other.map(() => 1));
  } finally {
    pack.locked = true;
  }
});

test("an unlocked pack's edits are seen on the next call", async () => {
  rules.uninstall();
  const pack = world.packs.get(PHB);
  pack.locked = false;
  const real = pack.getDocuments;
  try {
    const first = await rules.search("cover", { books: [PHB] });
    assert.ok(first.total > 0);
    pack.getDocuments = async () => { pack.calls.getDocuments += 1; return []; };
    assert.equal((await rules.search("cover", { books: [PHB] })).total, 0);
  } finally {
    pack.getDocuments = real;
    pack.locked = true;
  }
});

test("a cached pack that is unlocked is dropped and re-read; relocked, it caches again", async () => {
  rules.uninstall();
  const pack = world.packs.get(PHB);
  const before = pack.calls.getDocuments;
  await rules.search("cover", { books: [PHB] });
  await rules.search("cover", { books: [PHB] });
  assert.equal(pack.calls.getDocuments - before, 1);
  pack.locked = false;
  try {
    await rules.search("cover", { books: [PHB] });
    assert.equal(pack.calls.getDocuments - before, 2);
  } finally {
    pack.locked = true;
  }
  await rules.search("cover", { books: [PHB] });
  await rules.search("cover", { books: [PHB] });
  assert.equal(pack.calls.getDocuments - before, 3);
});
