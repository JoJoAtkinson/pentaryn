// S4 characterisation (written before the adapter move): the Foundry → plain-data helpers that
// scene-adapter.mjs and messages-adapter.mjs take over. Through the seams, so the move edits the
// shim only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, MODULE, GM_ID } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();

test("activityOf: getAssociatedActivity when the message has it", () => {
  const act = { uuid: "Actor.a.Item.i.Activity.x" };
  const m = W.message({ type: "damage", system: { activity: { uuid: "ignored" } } });
  Object.defineProperty(m, "getAssociatedActivity", { value: () => act, configurable: true });
  assert.equal(S.resolve.activityOf(m), act);
});

test("activityOf: else fromUuidSync(system.activity.uuid); no uuid → the stub's miss", () => {
  const act = W.register("Actor.a.Item.i.Activity.y", { uuid: "Actor.a.Item.i.Activity.y" });
  const m = W.message({ type: "damage", system: { activity: { uuid: "Actor.a.Item.i.Activity.y" } } });
  Object.defineProperty(m, "getAssociatedActivity", { value: undefined, configurable: true });
  assert.equal(S.resolve.activityOf(m), act);
  const bare = W.message({ type: "damage", system: {} });
  Object.defineProperty(bare, "getAssociatedActivity", { value: undefined, configurable: true });
  assert.equal(S.resolve.activityOf(bare) ?? null, null);
});

test("isPile with no game.itempiles: the actor's or the token's own item-piles flag", () => {
  assert.equal(game.itempiles, undefined);
  assert.equal(S.resolve.isPile({ actor: { flags: { "item-piles": { data: { enabled: true } } } }, flags: {} }), true);
  assert.equal(S.resolve.isPile({ actor: null, flags: { "item-piles": { data: { enabled: true } } } }), true);
  assert.equal(S.resolve.isPile({ actor: { flags: {} }, flags: {} }), false);
});

test("removeArea skips a region this user may not delete, and counts what went", async () => {
  const s = W.scene({ id: "AdapterScene0001" });
  F.canvas.scene = s;
  const t = { flags: { dnd5e: { activity: "Item.x.Activity.y" } }, ownership: { default: 0, [GM_ID]: 3 } };
  const a = W.region(s, { id: "regionAdapt00001", ...t });
  const b = W.region(s, { id: "regionAdapt00002", ...t });
  b._deny = ["delete"];
  assert.equal(await S.areas.removeArea([a, b], s), 1);
  assert.equal(s.regions.has(b.id), true);
});

test("handleFor / areasFor / spellAreas never touch a region without a template flag", () => {
  const s = W.scene({ id: "AdapterScene0002" });
  const portal = W.region(s, { id: "regionAdaptPort1", flags: { "pentaryn-portals": {} } });
  W.token(s, { id: "tokAdapt00000001", flags: { [MODULE]: { handle: true, region: portal.id } } });
  assert.equal(S.areas.handleFor(portal)?.id, "tokAdapt00000001", "handleFor finds by flag whatever the region is");
  assert.deepEqual(S.areas.areasFor("Item.x.Activity.y", s), []);
  assert.deepEqual(S.areas.spellAreas({ itemUuid: "Item.x" }, s), []);
});
