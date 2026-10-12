/**
 * ties-ui-E3 (final review 2026-10-12): a player removing a tie from the Ties tab is asked "Remove
 * the tie between {a} and {b}, in both directions?" — but a player cannot write the NPC, so only
 * their own side went. The removal now matches the confirm: the player's client removes its side and
 * asks the active GM (the relay's `remove-reverse` action) to remove the other one. The GM side
 * checks who sent it (the server's sender id, never the payload) owns the source, re-checks the
 * kill switch, and removes only the row pointing back at the sender's own character, and only once
 * the sender's own side is really gone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const OTHER = "zzOther000000001";
const PLAYER = "zzPlayerUser0001";
const GM = "gmUser0000000001";

const handlers = [];
const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 }, flags: { "pentaryn-ties": { ties: [{ id: NPC, word: "debtor", notes: "", stance: -1, strength: 4 }] } } },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { ties: [{ id: PC, word: "creditor", notes: "the GM's note", stance: 1, strength: 3 }, { id: OTHER, word: "rival" }] } } },
    { id: OTHER, name: "ZZ Other", flags: { "pentaryn-ties": { ties: [{ id: PC, word: "friend" }] } } },
  ],
  tokens: [{ id: "zzTokPc000000001", actorId: PC }],
  before: F => {
    F.game.socket.on = (channel, fn) => handlers.push({ channel, fn });
  },
});
const relay = handlers[0].fn;
const get = id => game.actors.get(id);
const tieIds = id => (get(id).flags["pentaryn-ties"].ties ?? []).map(t => t.id);
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};
const emits = mark => F.calls.slice(mark).filter(c => c.op === "socket.emit").map(c => c.args[1]);

test("ties-ui-E3: a player's Remove on an NPC tie asks the GM for the NPC's side", async () => {
  const Editor = await import("../editor.mjs");
  F.become({ userId: PLAYER });
  try {
    assert.equal(get(NPC).isOwner, false, "the player cannot write the NPC themselves");
    const section = el("section");
    section.innerHTML = Editor.buildHTML(get(PC));
    Editor.bind(section.firstElementChild, get(PC), () => {});
    const btn = section.querySelector(`[data-action="remove"][data-id="${NPC}"]`);
    assert.ok(btn, "the remove button is there");
    const mark = F.calls.length;
    F.dialogs.push(true);
    await settle(btn.dispatch("click"));
    await settle(flush());
    assert.deepEqual(tieIds(PC), [], "their own side is removed");
    assert.deepEqual(emits(mark), [{ action: "remove-reverse", sourceId: PC, targetId: NPC }], "the reverse side is asked of the GM, ids only");
  } finally {
    F.become({ userId: GM });
  }
});

test("ties-ui-E3: the GM's relay removes the reverse row — only for the owner of the source, only once their side is gone", async () => {
  const send = (payload, sender) => settle(Promise.resolve(relay({ action: "remove-reverse", ...payload }, sender))).then(() => settle(flush()));

  // a stranger cannot ask: identity is the server's sender id, never the payload
  await send({ sourceId: PC, targetId: NPC }, "zzNoSuchUser0001");
  assert.deepEqual(tieIds(NPC), [PC, OTHER]);
  // the player does not own ZZ Other, so cannot clear ZZ Other's row about Caven by claiming to be them
  await send({ sourceId: OTHER, targetId: NPC }, PLAYER);
  assert.deepEqual(tieIds(NPC), [PC, OTHER]);
  // the GM's kill switch means it
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  await send({ sourceId: PC, targetId: NPC }, PLAYER);
  assert.deepEqual(tieIds(NPC), [PC, OTHER]);
  await game.settings.set("pentaryn-ties", "playerAccess", true);
  // the sender still has their own side: they did not remove anything, so nothing is mirrored
  get(PC).flags["pentaryn-ties"].ties = [{ id: NPC, word: "debtor" }];
  await send({ sourceId: PC, targetId: NPC }, PLAYER);
  assert.deepEqual(tieIds(NPC), [PC, OTHER]);
  // their side is gone: the NPC's row about Caven goes, and only that row
  get(PC).flags["pentaryn-ties"].ties = [];
  await send({ sourceId: PC, targetId: NPC }, PLAYER);
  assert.deepEqual(tieIds(NPC), [OTHER]);
  assert.deepEqual(tieIds(OTHER), [PC], "no other actor is touched");
});
