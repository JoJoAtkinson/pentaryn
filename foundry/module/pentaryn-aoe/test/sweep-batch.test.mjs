// [declared] AC-7: the sweep made each missing handle with its own Token create and its own Region
// update — two round trips per template region on a scene with many. It now builds every missing
// handle's token data and creates them in ONE Token create (keepId), then attaches them all in ONE
// Region update. A second GM session that already made one of those handles refuses the whole
// create ("already exists"); the sweep then creates the rest one by one, swallowing that refusal
// per id, and still attaches every handle that exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, out, lines, MODULE, GM_ID } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const A = (await seams()).areas;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const reset = () => { F.calls.length = 0; out.length = 0; };

const ITEM = "Actor.wiz.Item.fireball0000001";
const ACT = `${ITEM}.Activity.act00000000fire1`;
const spell = W.register(ITEM, { uuid: ITEM, name: "Fireball" });
W.register(ACT, { uuid: ACT, item: spell });
const template = id => ({ id, flags: { dnd5e: { activity: ACT, item: ITEM, origin: "Scene.s.Token.c" } }, ownership: { default: 3, [GM_ID]: 3 } });

test("AC-7 sweep: every missing handle in ONE Token create (keepId) and ONE Region update", async () => {
  const s = W.scene({ id: "SweepBatchScene1" });
  const ids = ["regionBatchH0001", "regionBatchH0002", "regionBatchH0003"];
  for (const id of ids) W.region(s, template(id));
  reset();
  const outcome = await A.sweep(s);
  assert.equal(outcome.handlesCreated, 3);
  const creates = ops("createEmbedded").filter(c => c.documentName === "Token");
  assert.deepEqual(creates.map(c => [c.data.map(d => d._id), c.options]), [[ids, { keepId: true }]]);
  const writes = F.calls.filter(c => c.documentName === "Region" && ["update", "updateEmbedded"].includes(c.op));
  assert.deepEqual(writes.map(c => [c.op, c.updates]), [["updateEmbedded", ids.map(id => ({
    _id: id, attachment: { token: id }, [`flags.${MODULE}.handle`]: id
  }))]]);
  for (const id of ids) assert.equal(s.tokens.get(id).flags[MODULE].region, id);
  assert.equal(A.pending.size, 0, "pending is cleared");
  assert.deepEqual((await A.sweep(s)).handlesCreated, 0, "idempotent");
});

test("AC-7 sweep: another GM session made one handle first — the rest are made one by one, the refusal swallowed", async () => {
  const s = W.scene({ id: "SweepBatchScene2" });
  const ids = ["regionBatchR0001", "regionBatchR0002", "regionBatchR0003"];
  for (const id of ids) W.region(s, template(id));
  // The other session's create of the first handle lands between this sweep's read and its write.
  const real = s.createEmbeddedDocuments;
  let first = true;
  Object.defineProperty(s, "createEmbeddedDocuments", {
    configurable: true, writable: true,
    value: async function (name, list, options) {
      if (first && name === "Token") {
        first = false;
        W.token(this, { id: ids[0], flags: { [MODULE]: { handle: true, region: ids[0] } } });
      }
      return real.call(this, name, list, options);
    },
  });
  reset();
  const outcome = await A.sweep(s);
  assert.equal(outcome.handlesCreated, 2, "only the handles this session made");
  const creates = ops("createEmbedded").filter(c => c.documentName === "Token");
  assert.deepEqual(creates.map(c => c.data.map(d => d._id)), [ids, [ids[0]], [ids[1]], [ids[2]]]);
  const writes = F.calls.filter(c => c.documentName === "Region" && ["update", "updateEmbedded"].includes(c.op));
  assert.deepEqual(writes.map(c => [c.op, c.updates.map(u => u._id)]), [["updateEmbedded", ids]], "every handle that exists is attached, in one write");
  assert.deepEqual(lines().filter(l => /^(warn|error):/.test(l)), []);
  assert.equal(A.pending.size, 0);
});

test("AC-7 sweep: any other create error is thrown and pending is cleared", async () => {
  const s = W.scene({ id: "SweepBatchScene3" });
  W.region(s, template("regionBatchE0001"));
  s._createError = "server down";
  await assert.rejects(A.sweep(s), /server down/);
  s._createError = null;
  assert.equal(A.pending.size, 0);
});
