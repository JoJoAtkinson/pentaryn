// R4 [declared]: a pack read that rejects answers as if the pack were absent (loadBooks lists it in
// `missing`, the other reads answer null) and is traced at debug with the pack id; selftest() records a
// throwing check as `{label, ok: false, detail: <message>}` and runs the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
const world = installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

const PHB = "dnd-players-handbook.content";
const MM = "dnd-monster-manual.actors";
const SP = "dnd-players-handbook.spells";

/** Make `method` of pack `id` reject for the duration of `fn`, capturing debug lines (debug on). */
async function rejecting(id, method, fn) {
  const pack = world.packs.get(id);
  const real = pack[method];
  pack[method] = async () => { throw new Error("pack locked"); };
  const lines = [];
  const keep = console.debug;
  console.debug = (...a) => lines.push(a);
  CONFIG.debug["pentaryn-lookup"] = true;
  try {
    return { out: await fn(), lines };
  } finally {
    delete CONFIG.debug["pentaryn-lookup"];
    console.debug = keep;
    pack[method] = real;
  }
}
const namesPack = (lines, id) => lines.some(l => l[1]?.pack === id && l[2]?.message === "pack locked");

test("R4: search with a rejecting book load answers from the other books and names it as skipped", async () => {
  rules.uninstall();
  const { out, lines } = await rejecting(PHB, "getDocuments", () => rules.search("cover"));
  assert.ok(out.total > 0, "the 2024 SRD still answers");
  assert.match(out.warning, /skipped missing pack\(s\): .*dnd-players-handbook\.content/);
  assert.ok(namesPack(lines, PHB), "a debug line names the pack");
  rules.uninstall();
  assert.ok(!(await rules.search("cover", { books: [PHB] })).warning, "the next call retries and loads");
});

test("R4: page(name) with every book load rejecting answers the missing-pack error, not a throw", async () => {
  rules.uninstall();
  const { out } = await rejecting(PHB, "getDocuments", () => rules.page("Study", { books: [PHB] }));
  assert.ok(out.error.startsWith("compendium pack(s) not found"), out.error);
});

test("R4: monster() and monsters() survive a rejecting index read", async () => {
  const one = await rejecting(MM, "getIndex", () => rules.monster("Goblin"));
  assert.equal(one.out.notFound, true);
  assert.ok(!one.out.searched.includes(MM), "the MM is skipped as absent");
  assert.ok(namesPack(one.lines, MM));
  const many = await rejecting(MM, "getIndex", () => rules.monsters({}));
  assert.ok(many.out.monsters.every(m => m.pack !== MM), "the MM is skipped");
  assert.ok(many.out.count > 0);
});

test("R4: monster() survives a rejecting document read", async () => {
  const { out, lines } = await rejecting(MM, "getDocument", () => rules.monster("Goblin"));
  assert.equal(out.notFound, true);
  assert.ok(namesPack(lines, MM));
});

test("R4: names() survives a rejecting index read: that part is empty", async () => {
  const { out } = await rejecting("dnd-players-handbook.feats", "getIndex", () => rules.names());
  assert.ok(out.classes.includes("Paladin"));
});

test("R4: onList falls through to the next spell pack when the PHB's index or document read rejects", async () => {
  for (const method of ["getIndex", "getDocument"]) {
    const { out, lines } = await rejecting(SP, method, () => rules.onList("Aid", "cleric"));
    assert.equal(out.uuid, "Compendium.dnd5e.spells24.Item.spAid24", method);
    assert.ok(namesPack(lines, SP), method);
  }
});

test("R4: packs() lists a pack whose index read rejects as not present", async () => {
  const { out } = await rejecting(MM, "getIndex", () => rules.packs());
  assert.deepEqual(out.packs.find(r => r.id === MM), { id: MM, present: false });
});

test("R4: a throwing selftest check is recorded as failed and the rest still run", async () => {
  const before = await rules.selftest();
  const saved = globalThis.dnd5e;
  delete globalThis.dnd5e;
  let r;
  try {
    r = await rules.selftest();
  } finally {
    globalThis.dnd5e = saved;
  }
  assert.deepEqual(Object.keys(r).sort(), ["checks", "failed", "ok", "passed"]);
  assert.deepEqual(r.checks.map(c => c.label), before.checks.map(c => c.label));
  const onList = r.checks.filter(c => c.label.startsWith("onList("));
  assert.equal(onList.length, 2);
  for (const c of onList) assert.deepEqual(c, { label: c.label, ok: false, detail: "dnd5e is not defined" });
  assert.equal(r.failed, before.failed + 2);
  assert.equal(r.passed + r.failed, r.checks.length);
});
