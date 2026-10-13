/**
 * rob-1 (final review 2026-10-12, ties-study): `deliverHeldIdentifications` guarded only on the GM
 * check, then dereferenced `character.id` — so a null character or subject (a deleted actor, a stale
 * id from the world tree) threw a TypeError out of the GM's Deliver button. It now returns false,
 * the same shape as `resetIdentification`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";

await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: NPC, name: "ZZ Brakka" },
  ],
});
const Cascade = await import("../study/cascade.mjs");
const get = id => game.actors.get(id);

test("rob-1: deliverHeldIdentifications with a missing character or subject returns false, never throws", async () => {
  assert.equal(await Cascade.deliverHeldIdentifications(null, get(NPC)), false);
  assert.equal(await Cascade.deliverHeldIdentifications(get(PC), null), false);
  assert.equal(await Cascade.deliverHeldIdentifications(undefined, undefined), false);
});
