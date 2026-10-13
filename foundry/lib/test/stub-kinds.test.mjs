import { test } from "node:test";
import assert from "node:assert/strict";
import * as stub from "../test-kit/foundry-stub.mjs";
import { KINDS, resolveRef } from "../resolve.mjs";

// kit-ext-7 (final review 2026-10-12): the stub built game collections and fromUuidSync for six
// kinds while resolve.mjs resolves thirteen — macros, tables, combats, folders, playlists and owned
// item uuids were missing. The stub now drives both from STUB_KINDS, a mirror of resolve.mjs KINDS
// (the stub cannot import resolve.mjs: a small-tier module vendors the test kit without it).

const ids = { actor: "actor00000000001", item: "item000000000001", owned: "owned00000000001" };
const worldKinds = Object.entries(KINDS).filter(([, v]) => v.collection);

test("kit-ext-7: STUB_KINDS equals resolve.mjs KINDS", () => {
  assert.deepEqual(stub.STUB_KINDS, KINDS);
});

test("kit-ext-7: every world-collection kind is a game collection, seeded from installFoundry, reachable by uuid and by resolveRef", async () => {
  const seed = {};
  for (const [kind, { collection }] of worldKinds) {
    if (kind === "user") continue;                       // users are built from `user`/`users`
    seed[collection] = [{ id: `${kind}0000000000000000`.slice(0, 16), name: `The ${kind}` }];
  }
  const F = await stub.installFoundry({ ...seed, realFoundryUtils: false });
  try {
    for (const [kind, { doc, collection }] of worldKinds) {
      const coll = game[collection];
      assert.ok(coll instanceof stub.StubCollection, `game.${collection} is a StubCollection`);
      const one = coll.contents[0];
      assert.ok(one, `game.${collection} is seeded`);
      assert.equal(one.documentName, doc);
      assert.equal(fromUuidSync(`${doc}.${one.id}`), one, `${doc} uuid`);
      assert.equal(resolveRef(one.uuid, kind), one, `${kind} by uuid`);
      assert.equal(resolveRef(one.id, kind), one, `${kind} by id`);
    }
  } finally {
    F.restore();
  }
});

test("kit-ext-7: an owned item uuid (Actor.<id>.Item.<id>) resolves through the actor's items", async () => {
  const owned = stub.makeDoc("Item", { id: ids.owned, name: "Dagger" });
  const F = await stub.installFoundry({ actors: [{ id: ids.actor, name: "Aldric", items: new stub.StubCollection([owned]) }], realFoundryUtils: false });
  try {
    const uuid = `Actor.${ids.actor}.Item.${ids.owned}`;
    assert.equal(fromUuidSync(uuid), owned);
    assert.equal(resolveRef(uuid, "item"), owned);
    assert.equal(fromUuidSync(`Actor.${ids.actor}.Item.nope000000000001`), null);
  } finally {
    F.restore();
  }
});

test("kit-ext-7: an owned item given as a plain array is found by id; existing scene-embedded uuids are unchanged", async () => {
  const F = await stub.installFoundry({
    actors: [{ id: ids.actor, name: "Aldric", items: [{ id: ids.owned, name: "Rope" }] }],
    scenes: [{ id: "scene00000000001", tokens: [{ id: "token00000000001" }], regions: [{ id: "region0000000001" }] }],
    realFoundryUtils: false,
  });
  try {
    assert.equal(fromUuidSync(`Actor.${ids.actor}.Item.${ids.owned}`)?.name, "Rope");
    assert.equal(fromUuidSync("Scene.scene00000000001.Token.token00000000001")?.id, "token00000000001");
    assert.equal(fromUuidSync("Scene.scene00000000001.Region.region0000000001")?.id, "region0000000001");
    assert.equal(fromUuidSync("Scene.scene00000000001.Token.nope000000000001"), null);
    assert.equal(fromUuidSync("Nope.x"), null);
    assert.equal(fromUuidSync(""), null);
    assert.equal(fromUuidSync(null), null);
  } finally {
    F.restore();
  }
});
