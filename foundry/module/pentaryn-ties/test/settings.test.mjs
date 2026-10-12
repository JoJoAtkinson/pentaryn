/**
 * settings.mjs (guide S6): the tables, the reader's fallbacks, mayWrite's refusal before init, and the
 * key bodies the entry hands over. Registration itself (order, exact configs) is pinned by the glue
 * suite's goldens, which this step did not touch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const F = await bootWorld({ importEntry: false });
const S = await import("../settings.mjs");

test("before init: setting() answers each row's default; mayWrite refuses a player", () => {
  for (const row of [...S.SETTINGS, ...S.CLIENT_STATE]) assert.deepEqual(S.setting(row.key), row.default, row.key);
  assert.equal(S.setting("noSuchKey"), undefined);
  const gm = game.user;
  game.user = { id: "zzPlayer", isGM: false };
  try {
    assert.equal(S.mayWrite(), false, "playerAccess unregistered: refuse rather than guess");
  } finally {
    game.user = gm;
  }
  assert.equal(S.mayWrite(), true, "a GM always may");
});

test("the tables: ten settings in today's order (pinnedCards after nearDistance), six keys", () => {
  const order = [];
  for (const row of S.SETTINGS) {
    order.push(row.key);
    for (const h of S.CLIENT_STATE) if (h.after === row.key) order.push(h.key);
  }
  assert.deepEqual(order, ["macroCreated", "playerAccess", "holdDefault", "attributes", "attributeBeliefs", "attributeKnowledge", "advantageStacking", "nearDistance", "pinnedCards", "sheetTab"]);
  assert.deepEqual(S.KEYBINDINGS.map(k => k.key), ["showWeb", "addTie", "fileKnown", "inspect", "showOneTie", "showDescription"]);
  assert.ok(S.SETTINGS.every(r => typeof r.doc === "string" && r.doc.length > 10));
});

test("after init: registered, readable, and a player's mayWrite follows playerAccess", async () => {
  S.registerSettings();
  assert.equal(S.setting("nearDistance"), 4);
  await game.settings.set("pentaryn-ties", "nearDistance", 7);
  assert.equal(S.setting("nearDistance"), 7);
  const gm = game.user;
  game.user = { id: "zzPlayer", isGM: false };
  try {
    assert.equal(S.mayWrite(), true);
  } finally {
    game.user = gm;
  }
  assert.equal(S.settingsSnapshot().attributes.store, true);
  // a second registration (a hot patch) registers nothing new
  const before = F.calls.filter(c => c.op === "settings.register").length;
  S.registerSettings();
  assert.equal(F.calls.filter(c => c.op === "settings.register").length, before);
});

test("keys: onDown calls the body the entry handed in and always swallows the press", () => {
  const hits = [];
  S.onKeys({ showWeb: () => hits.push("web") });
  const row = S.KEYBINDINGS.find(k => k.key === "showWeb");
  assert.equal(row.onDown(), true);
  assert.deepEqual(hits, ["web"]);
  assert.equal(S.KEYBINDINGS.find(k => k.key === "showOneTie").onDown(), true, "a key with no body still returns true");
});
