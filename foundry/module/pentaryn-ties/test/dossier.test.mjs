/**
 * ties-3: `game.pentaryn.ties.inspect(ref, { as })` — the one aggregate read — and `selftest()`.
 * Each dossier field equals the existing read it composes; refs resolve by exact (then
 * case-insensitive) name, id or token, never a substring; a player's view leaves the GM plane null.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { maxDepth } from "../lib/api.mjs";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const PLAYER = "zzPlayerUser0001";
const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false, character: PC }],
  actors: [
    {
      id: PC, name: "Caven Ashwell", type: "character", ownership: { default: 0, [PLAYER]: 3 },
      flags: { "pentaryn-ties": { ties: [{ id: NPC, word: "debtor", stance: -1, strength: 4 }], known: [{ id: NPC, name: "Brakka", category: "sentient", notes: "", when: 5 }], granted: { [`lore:${NPC}:l1`]: { text: "Owes.", when: 5 } } } },
    },
    {
      id: NPC, name: "ZZ Brakka",
      flags: { "pentaryn-ties": { ties: [{ id: PC, word: "creditor" }], lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>" }], conceal: 3, beliefs: { [PC]: { [`lore:${NPC}:l1`]: { text: "Owes.", total: 15, when: 5, delivered: 6 } } } } },
    },
  ],
  tokens: [{ id: "zzTokNpc00000001", actorId: NPC }],
});
const T = () => game.pentaryn.ties;
const get = id => game.actors.get(id);

test("GM: every field, each equal to the read it composes; plain JSON, depth ≤ 4", async () => {
  const d = await T().inspect(get(NPC));
  assert.deepEqual(d.actor, { documentName: "Actor", id: NPC, uuid: `Actor.${NPC}`, name: "ZZ Brakka" });
  assert.deepEqual(d.ties, JSON.parse(JSON.stringify(T().read(get(NPC)))));
  assert.deepEqual(d.inbound, JSON.parse(JSON.stringify(T().inbound(get(NPC)))));
  assert.equal(d.conceal, 3);
  assert.equal(d.lore.length, 1);
  assert.ok(d.beliefs[PC]);
  assert.equal(d.known, null, "an NPC keeps no notebook");
  assert.ok(maxDepth(d) <= 4, `depth ${maxDepth(d)}`);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d, "plain JSON");
});

test("refs: exact name, case-insensitive name, id, uuid and token resolve; a substring is NOT_FOUND", async () => {
  for (const ref of ["Caven Ashwell", "caven ashwell", PC, `Actor.${PC}`]) assert.equal((await T().inspect(ref)).actor.id, PC, ref);
  assert.equal((await T().inspect(canvas.tokens.get("zzTokNpc00000001"))).actor.id, NPC, "a token reads its world actor");
  assert.throws(() => T().inspect("Cav"), /NOT_FOUND/);
  assert.throws(() => T().inspect(""), /BAD_ARGS/);
});

test("as a player: the GM plane is null; their own character's ties / known / granted are there; an NPC's are not", async () => {
  const mine = await T().inspect(get(PC), { as: PLAYER });
  assert.equal(mine.ties.length, 1);
  assert.equal(mine.known.length, 1);
  assert.ok(mine.granted[`lore:${NPC}:l1`]);
  for (const k of ["inbound", "beliefs", "kind", "studyTiers", "lore", "conceal"]) assert.equal(mine[k], null, k);
  const theirs = await T().inspect(get(NPC), { as: PLAYER });
  for (const k of ["ties", "known", "granted", "knowledge", "inbound", "beliefs", "lore", "conceal"]) assert.equal(theirs[k], null, k);
});

test("inspect(ref, null) answers like an omitted opts", async () => {
  for (const id of [PC, NPC]) assert.deepEqual(await T().inspect(get(id), null), await T().inspect(get(id)), id);
});

test("selftest(): every check passes on a booted world", () => {
  const r = T().selftest();
  assert.equal(r.ok, true, JSON.stringify(r.checks));
  assert.ok(r.checks.length >= 4);
});
