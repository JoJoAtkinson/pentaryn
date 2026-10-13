// [declared] aoe-edge-4: with two GM sessions (the MCP bridge tab + a GM browser tab) both run the
// handle delete, the concentration cleanup and the sweep. The losing tab's delete is refused by the
// server ("does not exist": the other session already deleted it). That refusal is success: it is
// swallowed (nothing logged) and the rest of the job carries on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, out, lines, MODULE, GM_ID } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const A = (await seams()).areas;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const reset = () => { F.calls.length = 0; out.length = 0; };

const ITEM = "Actor.wiz.Item.fireball0000001";
const ACT = `${ITEM}.Activity.act00000000fire1`;
const spell = W.register(ITEM, { uuid: ITEM, name: "Fireball" });
W.register(ACT, { uuid: ACT, item: spell });
const template = (over = {}) => ({ flags: { dnd5e: { activity: ACT, item: ITEM, origin: "Scene.s.Token.c" } }, ownership: { default: 3 }, ...over });

/** The other session's delete lands first: the docs go (and their hooks fire), then this one is refused. */
function otherSessionWins(scene, documentName) {
  const real = scene.deleteEmbeddedDocuments;
  Object.defineProperty(scene, "deleteEmbeddedDocuments", {
    configurable: true, writable: true,
    value: async function (name, ids, options) {
      if (name !== documentName) return real.call(this, name, ids, options);
      await real.call(this, name, ids, options);
      throw new Error(`${name} id [${ids[0]}] does not exist in the EmbeddedCollection`);
    },
  });
}

const noise = () => lines().filter(l => /^(warn|error):/.test(l));

test("aoe-edge-4 deleteRegion (this client): the handle delete refused as 'does not exist' is success, nothing logged", async () => {
  const s = W.scene({ id: "TwoSessScene0001" });
  const r = W.region(s, template({ id: "regionTwoSess001" }));
  W.token(s, { id: "regionTwoSess001", flags: { [MODULE]: { handle: true, region: r.id } } });
  otherSessionWins(s, "Token");
  s.regions.delete(r.id);
  reset();
  F.fire("deleteRegion", r, {}, GM_ID);
  await flush();
  assert.deepEqual(ops("deleteEmbedded").map(c => [c.documentName, c.ids]), [["Token", [r.id]]]);
  assert.deepEqual(noise(), []);
  assert.equal(s.tokens.has(r.id), false);
});

test("aoe-edge-4 concentration cleanup: a scene refused as 'does not exist' does not stop the next scene", async () => {
  const others = game.scenes.contents;
  game.scenes.clear();
  try {
    const s1 = W.scene({ id: "TwoSessScene0002" });
    const s2 = W.scene({ id: "TwoSessScene0003" });
    W.region(s1, template({ id: "regionTwoSess002" }));
    W.region(s2, template({ id: "regionTwoSess003" }));
    otherSessionWins(s1, "Region");
    const wizard = W.actor({ id: "wiz", name: "Wizard" });
    reset();
    F.fire("deleteActiveEffect", W.effect(wizard, { statuses: ["concentrating"], origin: ITEM }), {}, GM_ID);
    await flush(8);
    assert.deepEqual(ops("deleteEmbedded").filter(c => c.documentName === "Region").map(c => [c.parent, c.ids]),
      [[s1.uuid, ["regionTwoSess002"]], [s2.uuid, ["regionTwoSess003"]]]);
    assert.equal(s2.regions.has("regionTwoSess003"), false, "the second scene's area went too");
    assert.deepEqual(noise(), []);
  } finally {
    game.scenes.clear();
    for (const sc of others) game.scenes.set(sc.id, sc);
  }
});

test("aoe-edge-4 sweep: an orphan delete refused as 'does not exist' is success; the sweep carries on", async () => {
  const s = W.scene({ id: "TwoSessScene0004" });
  W.token(s, { id: "orphanTwoSess001", flags: { [MODULE]: { handle: true, region: "goneRegion00009" }, dnd5e: { lockSize: true } } });
  W.region(s, template({ id: "regionTwoSess004", ownership: { default: 0 } }));
  otherSessionWins(s, "Token");
  reset();
  const outcome = await A.sweep(s);
  assert.deepEqual(outcome, { orphansDeleted: 0, ownershipFixed: 1, handlesCreated: 1, sizeLocked: 0 },
    "the other session deleted the orphan; this one still shares and handles the region");
  assert.equal(s.tokens.has("orphanTwoSess001"), false);
  assert.deepEqual(noise(), []);
});

test("aoe-edge-4 any other refusal still throws", async () => {
  const s = W.scene({ id: "TwoSessScene0005" });
  W.token(s, { id: "orphanTwoSess002", flags: { [MODULE]: { handle: true, region: "goneRegion00010" }, dnd5e: { lockSize: true } } });
  Object.defineProperty(s, "deleteEmbeddedDocuments", { configurable: true, value: async () => { throw new Error("permission denied"); } });
  await assert.rejects(A.sweep(s), /permission denied/);
});
