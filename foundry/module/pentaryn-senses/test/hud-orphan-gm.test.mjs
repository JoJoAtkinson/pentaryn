/**
 * [declared senses-ac-2] The Token HUD's End light button shows only to a viewer who can act on
 * it: the source item's owner, or the active GM. Before the fix a second (non-active) GM saw End
 * light on an orphan spell light (its item gone) and the click did nothing, silently: only the
 * active GM's reconcile puts an orphan out. Now that GM sees no button; the active GM's orphan
 * click is unchanged (pinned in light.test.mjs's light-hud golden).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, tokenHUD, standardWorld, ID, MODULE, NOW, GM, GM2, PLAYER } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld();
const stake = world.scenes[0].tokens.get(ID.tStake);
stake.flags[MODULE] = { spellLight: { source: `Actor.${ID.hero}.Item.itmVanished00001`, prior: { dim: 0, bright: 0 } } };
const hulk = world.scenes[0].tokens.get(ID.tHulk);
hulk.flags[MODULE] = { spellLight: { source: `Actor.${ID.hero}.Item.${ID.light}` } };
const F = await boot({ user: GM2, others: [GM, PLAYER], world });
await settle(mock);
const tok = id => game.scenes.get(ID.s1).tokens.get(id);

function hudButtons(id) {
  const h = tokenHUD(tok(id));
  F.fire("renderTokenHUD", h.app, h.element);
  return h.col.querySelectorAll(".ps-light-end").length;
}

test("senses-ac-2: a non-active GM sees no End light on an orphan spell light", () => {
  assert.equal(game.users.activeGM.id, GM);
  assert.equal(hudButtons(ID.tStake), 0);
});

test("senses-ac-2: a non-active GM who owns the source item still gets End light", () => {
  assert.equal(hudButtons(ID.tHulk), 1);
});
