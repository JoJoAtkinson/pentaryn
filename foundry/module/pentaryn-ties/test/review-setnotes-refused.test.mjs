/**
 * M11 [declared] (final review ties-core, 2026-10-12; defect wave 2): `setNotes` answers what its
 * write answered. It used to answer true after a write that `write()` had refused — a non-owner, or
 * an `actor.update` the server rejected — so a caller was told the notes were saved when nothing was.
 * Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { setNotes, read } from "../ties-adapter.mjs";

const PLAYER = "zzM11Player00001";
const PC = "zzM11Pc000000001";
const NPC = "zzM11Npc00000001";

await bootWorld({
  users: [{ id: PLAYER, name: "ZZ M11 Player", isGM: false }],
  actors: [
    { id: PC, name: "ZZ M11 PC", ownership: { default: 0, [PLAYER]: 3 }, flags: { "pentaryn-ties": { ties: [{ id: NPC, name: "ZZ M11 NPC", word: "friend", notes: "old" }] } } },
    { id: NPC, name: "ZZ M11 NPC", ownership: { default: 0 }, flags: { "pentaryn-ties": { ties: [{ id: PC, name: "ZZ M11 PC", word: "friend", notes: "old" }] } } },
  ],
});
const asPlayer = async fn => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  try {
    return await fn();
  } finally {
    game.user = gm;
  }
};
const notesOf = (actorId, targetId) => read(game.actors.get(actorId)).find(t => t.id === targetId)?.notes;

test("M11: setNotes answers false when a non-owner's write is refused (before: true)", async () => {
  const out = await asPlayer(() => setNotes(game.actors.get(NPC), PC, "player wrote this"));
  assert.equal(out, false);
  assert.equal(notesOf(NPC, PC), "old", "nothing was written");
});

test("M11: setNotes answers false when the update itself is refused (before: true)", async () => {
  const pc = game.actors.get(PC);
  const real = pc.update;
  pc.update = async () => {
    throw new Error("ZZ refused");
  };
  try {
    assert.equal(await setNotes(pc, NPC, "lost"), false);
  } finally {
    pc.update = real;
  }
  assert.equal(notesOf(PC, NPC), "old");
});

test("M11: setNotes still answers true when the owner's write lands", async () => {
  assert.equal(await asPlayer(() => setNotes(game.actors.get(PC), NPC, "kept")), true);
  assert.equal(notesOf(PC, NPC), "kept");
});
