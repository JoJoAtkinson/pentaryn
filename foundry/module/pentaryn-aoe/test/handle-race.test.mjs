// -7 (D-A6) as v14 behaves: a keepId create of a WORLD actor whose id exists is not refused (the
// server only checks a parent's embedded collection), so two GM sessions racing at ready both
// create; the later one replaces the record with the same data and clients see createActor twice.
// The fixture's Actor.create models that; the "already exists" catch is only a fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F } = await boot({ entry: true });
const A = (await seams()).areas;
const handles = () => F.game.actors.filter(a => a.flags?.[MODULE]?.handleActor);

test("-7 two sessions both reach create: no refusal, one actor with the fixed id, createActor fires again", async () => {
  F.game.actors.delete(A.handleActor().id);
  F.calls.length = 0;
  const create = Actor.implementation.create;
  // Each session sees no actor before either create lands (the round trip is the race window).
  Actor.implementation.create = async (data, opts) => { await null; return create(data, opts); };
  let created = 0;
  const id = Hooks.on("createActor", () => { created++; });
  try {
    const [a, b] = await Promise.all([A.ensureHandleActor(), A.ensureHandleActor()]);
    const creates = F.calls.filter(c => c.op === "create" && c.documentName === "Actor");
    assert.equal(creates.length, 2, "both sessions create; neither is refused");
    assert.deepEqual(creates.map(c => c.options), [{ keepId: true }, { keepId: true }]);
    assert.deepEqual(creates[0].data, creates[1].data, "the same data, so the replace changes nothing");
    assert.equal(a.id, "pentarynAoeHndl0");
    assert.equal(b.id, "pentarynAoeHndl0");
    assert.equal(handles().length, 1);
    assert.equal(A.handleActor(), b, "the later create's record is the one kept");
    assert.equal(created, 1, "the replace fires createActor (the stub fires none for a first create)");
  } finally {
    Hooks.off("createActor", id);
    Actor.implementation.create = create;
  }
});

test("-7 the next ready finds the actor by flag and creates nothing", async () => {
  F.calls.length = 0;
  const before = A.handleActor();
  assert.equal(await A.ensureHandleActor(), before);
  assert.equal(F.calls.filter(c => c.op === "create").length, 0);
});
