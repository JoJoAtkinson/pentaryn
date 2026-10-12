// R5 [declared]: a string `packs` / a pack-id `books` were silently misread — monsters({packs: "<id>"})
// iterated the id's characters and answered 0, and search({books: "<pack id>"}) fell back to the rules
// set. Now: a string `packs` is that one pack; a non-array, non-string `packs` falls back to the default
// packs with a warning; a dotted `books` string is a pack id; an unknown bare word falls back to the
// rules set with a warning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";
import * as core from "../lookup-core.mjs";

const { monsterQuery, BOOKSETS, MONSTER_LIST_PACKS } = core;

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

const PACKS_WARNING = "packs ignored: expected a pack id or an array";

test("R5: monsterQuery wraps a string packs as one pack id", () => {
  assert.deepEqual(monsterQuery({ packs: "dnd5e.actors24" }).packIds, ["dnd5e.actors24"]);
  assert.equal(monsterQuery({ packs: "dnd5e.actors24" }).warning, undefined);
});

test("R5: monsterQuery uses an array packs as given, no warning", () => {
  const q = monsterQuery({ packs: ["a.b", "c.d"] });
  assert.deepEqual(q.packIds, ["a.b", "c.d"]);
  assert.equal("warning" in q, false);
});

test("R5: monsterQuery falls back to the default packs with a warning on a number or object", () => {
  for (const packs of [5, { id: "dnd5e.actors24" }, true]) {
    const q = monsterQuery({ packs });
    assert.deepEqual(q.packIds, [...MONSTER_LIST_PACKS], JSON.stringify(packs));
    assert.equal(q.warning, PACKS_WARNING);
  }
});

test("R5: monsters({packs: '<pack id>'}) lists that pack, not 0", async () => {
  const out = await rules.monsters({ packs: "dnd5e.actors24" });
  assert.ok(out.count > 0, JSON.stringify(out));
  assert.ok(out.monsters.every(m => m.pack === "dnd5e.actors24"));
  assert.equal(out.warning, undefined);
});

test("R5: monsters({packs: 5}) answers the default list with a warning", async () => {
  const out = await rules.monsters({ packs: 5 });
  const plain = await rules.monsters({});
  assert.equal(out.warning, PACKS_WARNING);
  assert.deepEqual({ ...out, warning: undefined }, { ...plain, warning: undefined });
});

test("R5: resolveBooks — set name, pack id, array, unknown word", () => {
  const { resolveBooks } = core;
  assert.deepEqual(resolveBooks("monsters"), { ids: BOOKSETS.monsters });
  assert.deepEqual(resolveBooks(undefined), { ids: BOOKSETS.rules });
  assert.deepEqual(resolveBooks("dnd5e.content24"), { ids: ["dnd5e.content24"] });
  assert.deepEqual(resolveBooks(["x.y"]), { ids: ["x.y"] });
  const bad = resolveBooks("phb");
  assert.deepEqual(bad.ids, BOOKSETS.rules);
  assert.match(bad.warning, /^books ignored: /);
});

test("R5: search({books: '<pack id>'}) searches that one pack", async () => {
  const out = await rules.search("cover", { books: "dnd5e.content24" });
  assert.deepEqual(out.books, ["SRD 5.2 Rules"]);
  assert.ok(out.hits.length > 0);
  assert.ok(out.hits.every(h => h.uuid.startsWith("Compendium.dnd5e.content24.")));
});

test("R5: search({books: '<unknown word>'}) answers the rules set with a warning", async () => {
  const out = await rules.search("cover", { books: "phb" });
  assert.match(out.warning, /books ignored: expected/);
  assert.ok(out.hits.length > 0);
});

test("R5: page(name, {books: '<pack id>'}) reads from that pack", async () => {
  const out = await rules.page("Cover (SRD)", { books: "dnd5e.content24" });
  assert.equal(out.page, "Cover (SRD)");
  assert.equal(out.warning, undefined);
  const bad = await rules.page("Cover (SRD)", { books: "srd" });
  assert.match(bad.warning, /books ignored: expected/);
});
