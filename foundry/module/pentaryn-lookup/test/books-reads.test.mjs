// prompts-lookup-6 follow-up, the books.mjs half: lists.test.mjs proves the core functions equal the
// ORACLE (test/fixtures/legacy-lists.mjs) but replays the index reads in the test itself. Here the
// published names() and spellList() run over the fixture world and their real getIndex calls (pack,
// fields, order) and answers are asserted equal to the oracle's. The fixture index ignores `fields`,
// so only this test notices a dropped field (in Foundry, `system.level` would read undefined).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";
import * as oracle from "./fixtures/legacy-lists.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
const world = installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

// one ordered log of every getIndex call across the packs; the oracle reads the unwrapped originals
const live = [];
const original = new Map();
for (const [id, pack] of world.packs) {
  const getIndex = pack.getIndex.bind(pack);
  original.set(id, getIndex);
  pack.getIndex = opts => { live.push([id, opts?.fields ?? null]); return getIndex(opts); };
}
const oracleReads = [];
const oracleRead = async (id, fields) => {
  oracleReads.push([id, fields]);
  const getIndex = original.get(id);
  return getIndex ? getIndex(fields ? { fields } : undefined) : null;
};
const fresh = () => { live.length = 0; oracleReads.length = 0; };

test("books names(): same getIndex packs, fields and order as the oracle, same answer, for every kind", async () => {
  for (const kind of [null, "subclass", "Race", "FEATS", "bogus"]) {
    fresh();
    const got = await rules.names(kind);
    const want = await oracle.names(oracleRead, kind);
    assert.deepEqual(got, want, `kind ${kind}`);
    assert.deepEqual(live, oracleReads, `reads, kind ${kind}`);
  }
});

test("books spellList(): same getIndex packs, fields and order as the oracle, same answer, at every level", async () => {
  const uuids = [...dnd5e.registry.spellLists.forType("class", "wizard").uuids];
  for (const level of [null, 0, 2, "3", 9]) {
    fresh();
    const got = await rules.spellList("wizard", { level });
    const want = await oracle.spellListSpells(uuids, oracleRead, level);
    assert.deepEqual(got, { list: "class:wizard", count: want.length, spells: want }, `level ${level}`);
    assert.deepEqual(live, oracleReads, `reads, level ${level}`);
  }
});
