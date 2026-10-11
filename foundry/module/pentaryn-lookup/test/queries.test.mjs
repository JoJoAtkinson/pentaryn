// GM-guarded queries (guide step 9, prompts-lookup-3, declared DL2): eight read-only lookups are
// CONFIG.queries["pentaryn-lookup.<path>"], registered at init, answering only on a GM client and
// only to a GM sender (or the bridge, which sends no user).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON } from "./kit/harness.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";
import { MODULE } from "../lookup-core.mjs";

const PLAYER = "playerUser000001";
const F = await installFoundry({ modules: [MODULE], users: [{ id: PLAYER, name: "P", isGM: false }] });
installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
F.fire("init");
const beforeReady = await CONFIG.queries[`${MODULE}.search`]({ query: "cover" }).catch(e => e.message);
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;
const q = name => CONFIG.queries[`${MODULE}.${name}`];
const gm = { user: game.user };

const NAMES = ["monster", "monsters", "names", "onList", "packs", "page", "search", "spellList"];

test("exactly the eight read-only lookups are registered, and describe() lists them", () => {
  const mine = Object.keys(CONFIG.queries).filter(k => k.startsWith(`${MODULE}.`)).sort();
  assert.deepEqual(mine, NAMES.map(n => `${MODULE}.${n}`));
  assert.deepEqual([...rules.describe().queries].sort(), mine);
  for (const k of mine) assert.equal(typeof CONFIG.queries[k], "function", k);
});

test("registered at init: a call before ready answers NOT_READY", () => {
  assert.equal(beforeReady, `NOT_READY: ${MODULE}`);
});

test("payloads (golden/queries.json); each equals the direct call, so toPlain changes nothing", async () => {
  const cases = {
    search: [{ query: "cover" }, () => rules.search("cover", { query: "cover" })],
    page: [{ ref: "Study" }, () => rules.page("Study", { ref: "Study" })],
    monsters: [{ cr: "5-8" }, () => rules.monsters({ cr: "5-8" })],
    onList: [{ spell: "Fireball", cls: "wizard" }, () => rules.onList("Fireball", "wizard")],
  };
  const out = {};
  for (const [name, [data, direct]] of Object.entries(cases)) {
    out[name] = await q(name)(data, gm);
    assert.deepEqual(out[name], await direct(), name);
  }
  pinJSON("queries", out, import.meta.url);
});

test("the args mappers reach the legacy signatures", async () => {
  assert.deepEqual(await q("monster")({ name: "goblin" }, gm), await rules.monster("goblin", { name: "goblin" }));
  assert.deepEqual(await q("monster")({ ref: "Goblin Boss", text: true }), JSON.parse(JSON.stringify(await rules.monster("Goblin Boss", { text: true }))));
  assert.deepEqual(await q("names")({ kind: "subclass" }), await rules.names("subclass"));
  assert.deepEqual(await q("names")({}), await rules.names());
  assert.deepEqual(await q("packs")({ anything: 1 }), await rules.packs());
  assert.deepEqual(await q("spellList")({ cls: "wizard", level: 3 }), await rules.spellList("wizard", { level: 3 }));
  assert.deepEqual(await q("onList")({ spell: "Fireball", cls: "x", type: "subclass" }), await rules.onList("Fireball", "x", { type: "subclass" }));
  assert.deepEqual(await q("search")(undefined), await rules.search(undefined, {}));
});

test("a non-GM sender is refused", async () => {
  await assert.rejects(q("search")({ query: "x" }, { user: game.users.get(PLAYER) }), { message: "NOT_GM: P is not a GM" });
});

test("a non-GM client is refused", async () => {
  F.become({ userId: PLAYER });
  try {
    await assert.rejects(q("search")({ query: "x" }), { message: "NOT_GM: this client is not a GM" });
  } finally {
    F.become({ userId: "gmUser0000000001" });
  }
});
