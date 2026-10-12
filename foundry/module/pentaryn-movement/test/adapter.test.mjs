// combat-adapter.mjs (guide S4, finding -19's structure): Foundry documents → plain core inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OTHER, PLAYER, SCENE, combat, movementWorld } from "./fixtures/world.mjs";
import { combatSummaries, pinInputs, sceneIdOf, sceneOf } from "../combat-adapter.mjs";
import * as core from "../movement-core.mjs";

await movementWorld();

test("combatSummaries: linked, inactive, unlinked and a hidden combatant (dropped); sceneId falls back to _source.scene", () => {
  const combats = [
    combat(),
    combat({ active: false }),
    combat({ sceneId: null, combatants: [{ sceneId: OTHER }, { token: { parent: { id: SCENE } } }] }),
    combat({ started: false, combatants: [{ sceneId: SCENE, hidden: true }, { sceneId: OTHER }] }),
    { active: true, started: true, scene: null, _source: { scene: OTHER }, combatants: { contents: [] } },
    { active: 1, started: 0 },
  ];
  assert.deepEqual(combatSummaries(combats), [
    { active: true, sceneId: SCENE, started: true, combatantSceneIds: [SCENE] },
    { active: false, sceneId: SCENE, started: true, combatantSceneIds: [SCENE] },
    { active: true, sceneId: null, started: true, combatantSceneIds: [OTHER, SCENE] },
    { active: true, sceneId: SCENE, started: false, combatantSceneIds: [OTHER] },
    { active: true, sceneId: OTHER, started: true, combatantSceneIds: [] },
    { active: true, sceneId: null, started: false, combatantSceneIds: [] },
  ]);
});

test("combatSummaries() reads game.combats by default; none → []", () => {
  game.combats.contents = [combat()];
  assert.equal(combatSummaries().length, 1);
  game.combats = undefined;
  assert.deepEqual(combatSummaries(), []);
  game.combats = { contents: [] };
});

test("pinInputs: note labels in today's order of preference; hidden tokens dropped; sizes in pixels", () => {
  const scene = {
    grid: { size: 50 },
    notes: [
      { id: "n1", x: 1, y: 2, text: "Text" },
      { id: "n2", x: 3, y: 4, entry: { name: "Entry" }, label: "Label" },
      { id: "n3", x: 5, y: 6, label: "Label" },
      { id: "n4", x: 7, y: 8 },
    ],
    tokens: [
      { id: "a", name: "A", x: 0, y: 0, width: 2, height: 1, hidden: false, testUserPermission: u => u.id === PLAYER },
      { id: "b", name: "B", x: 9, y: 9, hidden: true },
      { id: "c", name: "C", x: 5, y: 5, hidden: false },
    ],
  };
  assert.deepEqual(pinInputs(scene), {
    notes: [
      { id: "n1", x: 1, y: 2, label: "Text" },
      { id: "n2", x: 3, y: 4, label: "Entry" },
      { id: "n3", x: 5, y: 6, label: "Label" },
      { id: "n4", x: 7, y: 8, label: "" },
    ],
    tokens: [
      { id: "a", name: "A", x: 0, y: 0, w: 100, h: 50, playerOwned: true },
      { id: "c", name: "C", x: 5, y: 5, w: 50, h: 50, playerOwned: false },
    ],
  });
});

test("pinInputs: a token's own getSize (hex) wins over width × grid.size; tokens without it keep the old size", () => {
  const scene = {
    grid: { size: 100 },
    notes: [{ id: "n", x: 110, y: 50, text: "Edge" }],
    tokens: [
      { id: "h", name: "Hex", x: 0, y: 0, width: 1, height: 1, hidden: false, getSize: () => ({ width: 115.47, height: 100 }) },
      { id: "s", name: "Square", x: 0, y: 0, width: 1, height: 1, hidden: false },
    ],
  };
  const { notes, tokens } = pinInputs(scene);
  assert.equal(tokens[0].w, 115.47);
  assert.equal(tokens[0].h, 100);
  assert.equal(tokens[1].w, 100);
  assert.equal(tokens[1].h, 100);
  assert.deepEqual(core.pinsUnderTokens(notes, tokens).map(r => r.tokenId), ["h"]);
});

test("sceneOf/sceneIdOf: a Scene or a scene id string; unknown, empty or junk → null (rob-1)", () => {
  const scene = { id: "zzAdapter", notes: [], tokens: [] };
  game.scenes.set("zzAdapter", scene);
  try {
    assert.equal(sceneOf(scene), scene);
    assert.equal(sceneOf("zzAdapter"), scene);
    for (const junk of ["noSuchScene", "", null, undefined, 42, true]) assert.equal(sceneOf(junk), null);
    assert.equal(sceneIdOf(scene), "zzAdapter");
    assert.equal(sceneIdOf("zzAdapter"), "zzAdapter");
    assert.equal(sceneIdOf("noSuchScene"), "noSuchScene");
    for (const junk of ["", null, undefined, 42, {}, { id: 7 }]) assert.equal(sceneIdOf(junk), null);
  } finally {
    game.scenes.delete("zzAdapter");
  }
});
