// prompts-lookup-34: every read lookup answers as "nothing there" is traced at debug level, and only
// when CONFIG.debug["pentaryn-lookup"] is on. Return values are the legacy ones (legacy-api.json).
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

/** Run `fn` with the debug flag set to `on`, capturing every console line. */
async function capture(on, fn) {
  const lines = [];
  const keep = {};
  for (const level of ["log", "debug", "info", "warn", "error"]) {
    keep[level] = console[level];
    console[level] = (...a) => lines.push([level, ...a]);
  }
  CONFIG.debug["pentaryn-lookup"] = on;
  try {
    return { out: await fn(), lines };
  } finally {
    delete CONFIG.debug["pentaryn-lookup"];
    Object.assign(console, keep);
  }
}
const rejecting = () => {
  const saved = globalThis.fromUuid;
  globalThis.fromUuid = async () => { throw new Error("pack locked"); };
  return () => { globalThis.fromUuid = saved; };
};

test("page(<uuid>) with a rejecting fromUuid: same {error}, one debug line naming the uuid when debug is on", async () => {
  const undo = rejecting();
  try {
    const off = await capture(undefined, () => rules.page("Compendium.x.y"));
    assert.deepEqual(off.out, { error: "no document at Compendium.x.y" });
    assert.deepEqual(off.lines, []);
    const on = await capture(true, () => rules.page("Compendium.x.y"));
    assert.deepEqual(on.out, { error: "no document at Compendium.x.y" });
    assert.equal(on.lines.length, 1);
    const [level, first, fields, err] = on.lines[0];
    assert.equal(level, "debug");
    assert.ok(first.startsWith("pentaryn-lookup | "), first);
    assert.deepEqual(fields, { uuid: "Compendium.x.y" });
    assert.equal(err.message, "pack locked");
  } finally {
    undo();
  }
});

test("an embedded table whose read rejects: {uuid, error: 'not found'} and a debug line", async () => {
  const want = (await rules.page("Artifacts")).tables.map(t => t.uuid);
  const undo = rejecting();
  try {
    // the page itself comes from the pack, not fromUuid; only the table reads reject
    const on = await capture(true, () => rules.page("Artifacts"));
    assert.deepEqual(on.out.tables, want.map(uuid => ({ uuid, error: "not found" })));
    assert.deepEqual(on.lines.map(l => [l[0], l[1], l[2]]),
      want.map(uuid => ["debug", "pentaryn-lookup | fromUuid failed", { uuid }]));
  } finally {
    undo();
  }
});

test("onList(<spell uuid>) with a rejecting fromUuid: notFound as before, traced", async () => {
  const undo = rejecting();
  try {
    const on = await capture(true, () => rules.onList("Compendium.dnd-players-handbook.spells.Item.spFireball", "wizard"));
    assert.equal(on.out.notFound, true);
    assert.equal(on.lines.length, 1);
    assert.equal(on.lines[0][1], "pentaryn-lookup | fromUuid failed");
  } finally {
    undo();
  }
});

test("enrichHTML throwing: raw text kept, one debug line per feature naming the item", async () => {
  const ux = F.foundry.applications.ux.TextEditor.implementation;
  const saved = ux.enrichHTML;
  ux.enrichHTML = async () => { throw new Error("enrich failed"); };
  try {
    const off = await capture(undefined, () => rules.monster("Goblin Boss", { text: true }));
    const on = await capture(true, () => rules.monster("Goblin Boss", { text: true }));
    assert.deepEqual(on.out, off.out);
    assert.deepEqual(off.lines, []);
    assert.deepEqual(on.lines.map(l => [l[1], l[2].item]), [
      ["pentaryn-lookup | enrichHTML failed", "Compendium.dnd-monster-manual.actors.Actor.mmBoss.Item.mmBossi0"],
      ["pentaryn-lookup | enrichHTML failed", "Compendium.dnd-monster-manual.actors.Actor.mmBoss.Item.mmBossi1"],
      ["pentaryn-lookup | enrichHTML failed", "Compendium.dnd-monster-manual.actors.Actor.mmBoss.Item.mmBossi2"],
    ]);
  } finally {
    ux.enrichHTML = saved;
  }
});

test("a registry that throws inside forType: onList answers onList:null as before, traced", async () => {
  const saved = globalThis.dnd5e;
  globalThis.dnd5e = { registry: { spellLists: { forType: () => { throw new Error("moved"); }, options: [] } } };
  try {
    const on = await capture(true, () => rules.onList("Fireball", "wizard"));
    assert.equal(on.out.onList, null);
    assert.equal(on.lines.length, 1);
    assert.equal(on.lines[0][1], "pentaryn-lookup | spell-list registry read failed");
    assert.deepEqual(on.lines[0][2], { type: "class", identifier: "wizard" });
  } finally {
    globalThis.dnd5e = saved;
  }
});

test("world fixture is the shared one", () => {
  assert.ok(world.packs.get("dnd-players-handbook.content"));
});

test("DL3: spellList with the registry gone answers {error, known: []}, and traces both reads", async () => {
  const saved = globalThis.dnd5e;
  globalThis.dnd5e = { registry: undefined };
  try {
    const on = await capture(true, () => rules.spellList("wizard"));
    assert.deepEqual(on.out, { error: 'no class list "wizard"', known: [] });
    assert.deepEqual(on.lines.map(l => l[1]), [
      "pentaryn-lookup | spell-list registry read failed",
      "pentaryn-lookup | spell-list options read failed",
    ]);
  } finally {
    globalThis.dnd5e = saved;
  }
});
