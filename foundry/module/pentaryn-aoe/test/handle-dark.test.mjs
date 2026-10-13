// [declared] AO-3-handle-dark: a placed area and its handle were invisible to their owner in
// darkness (the handle emits no light and has no sight), and the handle — the token dnd5e's chip
// names — was called "<Spell> (<user name>)". The handle now carries a faint dim light of half a
// square, so the handle and the area's outline show to everyone who can see that spot, and its
// name is "<Spell> (<caster TOKEN name>)" — never an actor name. With no caster token to be
// found the author's user name stays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, GM_ID } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const A = (await seams()).areas;

const scene = id => W.scene({ id, grid: { size: 100, distance: 5 } });

test("AO-3-handle-dark (dnd5e 6): the handle is named after the caster's token and lights half a square", async () => {
  const s = scene("DarkScene0000001");
  const wizard = W.actor({ id: "darkWizard000001", name: "Secret Actor Name" });
  const caster = W.token(s, { id: "casterDark000001", name: "Hooded Figure", actorId: wizard.id });
  const item = W.item({ name: "Fireball" }, wizard);
  const r = W.region(s, {
    id: "regionDark000001", name: "Fireball area",
    flags: { dnd5e: { activity: `${item.uuid}.Activity.actDark000000001`, item: item.uuid, origin: caster.uuid } },
    ownership: { default: 0, [GM_ID]: 3 },
    shapes: [{ type: "circle", x: 500, y: 500, radius: 200 }],
  });
  const handle = await A.createHandle(r);
  assert.equal(handle.name, "Fireball (Hooded Figure)", "the caster's token name, not the user's or the actor's");
  assert.ok(!handle.name.includes("Secret Actor Name"));
  assert.equal(handle.light.dim, 2.5, "a dim light of half a square (5 ft grid)");
  assert.equal(handle.light.bright, 0);
});

test("AO-3-handle-dark (5.3.3): origin is the activity; the caster's token on the scene names the handle", async () => {
  const s = scene("DarkScene0000002");
  const wizard = W.actor({ id: "darkWizard000002", name: "Another Actor Name" });
  W.token(s, { id: "casterDark000002", name: "Stranger", actorId: wizard.id });
  const item = W.item({ name: "Burning Hands" }, wizard);
  const act = `${item.uuid}.Activity.actDark000000002`;
  W.register(act, { uuid: act, item });
  const r = W.region(s, {
    id: "regionDark000002", name: "Template",
    flags: { core: { MeasuredTemplate: true }, dnd5e: { origin: act } },
    ownership: { default: 0, [GM_ID]: 3 },
  });
  F.fire("createRegion", r, {}, GM_ID);
  await flush();
  const handle = s.tokens.get(r.id);
  assert.equal(handle.name, "Burning Hands (Stranger)");
  assert.equal(handle.light.dim, 2.5);
});

test("AO-3-handle-dark: no caster token anywhere keeps the author's user name, never the actor's", async () => {
  const s = scene("DarkScene0000003");
  const wizard = W.actor({ id: "darkWizard000003", name: "Off Scene Actor" });
  const item = W.item({ name: "Fireball" }, wizard);
  const r = W.region(s, {
    id: "regionDark000003",
    flags: { dnd5e: { activity: `${item.uuid}.Activity.actDark000000003`, item: item.uuid, origin: "Scene.gone0000000000.Token.none000000000" } },
    ownership: { default: 0, [GM_ID]: 3 },
  });
  const handle = await A.createHandle(r);
  assert.equal(handle.name, "Fireball (Gamemaster)");
});
