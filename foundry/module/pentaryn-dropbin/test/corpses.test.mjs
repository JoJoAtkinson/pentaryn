// Corpse ownership round trip (play-test PT3-1, fix/playtest-2026-10-11). A corpse gives players
// OBSERVER on the token's own actor delta so Item Piles can render the loot window; reviving it must
// give that back. The stub's token update merges like Foundry's recursive update (an empty object is a
// no-op, `null` replaces), which is what left a revived enemy's full sheet open to every player.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { PLAYER, addScene, dropbinWorld, makeActor } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
await import("../dropbin.mjs");
const { corpses } = await import("../corpses.mjs");
const { OBSERVER, NONE } = CONST.DOCUMENT_OWNERSHIP_LEVELS;

let seq = 0;
/** An unlinked hostile goblin token at 0 HP on its own scene; `delta.ownership` as given. */
function goblin(deltaOwnership, flags = {}) {
  const n = String(++seq).padStart(4, "0");
  const actor = makeActor(F, { id: `actorGob0000${n}`, name: "Goblin", type: "npc", ownership: { default: NONE },
    system: { attributes: { hp: { value: 0, max: 7 } } } });
  const statuses = new Set();
  Object.assign(actor, {
    isToken: true,
    statuses,
    toggleStatusEffect: async (id, { active } = {}) => { if (active) statuses.add(id); else statuses.delete(id); },
    updateEmbeddedDocuments: async () => [],
    deleteEmbeddedDocuments: async () => [],
  });
  const scene = addScene(F, { id: `sceneCorpse0${n}`, name: `Corpse ${n}`,
    tokens: [{ id: `tokGoblin000${n}`, name: "Goblin", disposition: -1, sight: { enabled: true },
      flags, delta: { ownership: deltaOwnership }, actor }] });
  const tok = scene.tokens.get(`tokGoblin000${n}`);
  Object.defineProperty(actor, "token", { value: tok, enumerable: false });
  return tok;
}
/** What a player gets on the token's actor: the delta map if set, else the base actor's (as ActorDelta#getUserLevel). */
const playerLevel = tok => {
  const own = tok.delta.ownership ?? tok.actor.ownership;
  return own[PLAYER] ?? own.default ?? NONE;
};

test("PT3-1: a corpse revived from the HUD gives back the base actor's ownership (no OBSERVER leak)", async () => {
  const tok = goblin(null);
  await corpses.toCorpse(tok);
  assert.deepEqual(tok.delta.ownership, { default: OBSERVER }, "players observe the body");
  assert.equal(tok.flags[MOD].corpse, true);
  await corpses.revive(tok);
  assert.equal(tok.flags[MOD].corpse, undefined, "no longer our corpse");
  assert.equal(tok.delta.ownership ?? null, null, "the delta inherits the base actor again");
  assert.equal(playerLevel(tok), NONE);
  assert.deepEqual(tok.flags[MOD], {}, "no dropbin flag left behind");
});

test("PT3-1: a delta map set before death (a creature shared with a player) comes back exactly", async () => {
  const tok = goblin({ default: NONE, [PLAYER]: OBSERVER });
  await corpses.toCorpse(tok);
  assert.deepEqual(tok.delta.ownership, { default: OBSERVER, [PLAYER]: OBSERVER });
  await corpses.fromCorpse(tok);
  assert.deepEqual(tok.delta.ownership, { default: NONE, [PLAYER]: OBSERVER });
});

test("PT3-1: a corpse made before the fix (no saved ownership) reverts to the base actor's", async () => {
  const tok = goblin({ default: OBSERVER }, { [MOD]: { corpse: true, sight: true } });
  await corpses.fromCorpse(tok);
  assert.equal(tok.delta.ownership ?? null, null);
  assert.equal(playerLevel(tok), NONE);
  assert.equal(tok.sight.enabled, true);
  assert.deepEqual(tok.flags[MOD], {});
});

test("PT3-1: a corpse that stopped being a pile and is re-piled keeps the pre-death map, not its own OBSERVER", async () => {
  // Item Piles' own Revert (or its pile toggle) leaves our corpse flag and the OBSERVER delta behind.
  // The next hp/effect update on the still-dead body re-runs toCorpse: saving the delta then would
  // save the corpse's {default: OBSERVER} as the "pre-death" map and a revival would leak it again.
  const tok = goblin({ default: OBSERVER }, { [MOD]: { corpse: true, sight: true, ownership: null } });
  await corpses.toCorpse(tok);
  assert.equal(tok.flags[MOD].ownership, null, "the saved pre-death map survives a re-pile");
  await corpses.fromCorpse(tok);
  assert.equal(tok.delta.ownership ?? null, null);
  assert.equal(playerLevel(tok), NONE);
});

/* ── PT3-1 live (wave 2): the server's copy of delta.ownership can differ from the clients' ──────── */

// Foundry 14.369 (seen live on fresh scenes): the server can drop a delta write it already broadcast,
// so every client shows the corpse's {default: OBSERVER} while the server holds the old value. A
// write equal to the SERVER's copy is then no change: nothing goes out and the clients keep OBSERVER.
// `serverSide` makes the stub's token behave like that; a ForcedDeletion always goes out.
function serverSide(tok, serverOwnership) {
  const server = { ownership: serverOwnership };
  const update = tok.update.bind(tok);
  tok.update = async (changes = {}, options = {}) => {
    const c = { ...changes };
    if ("delta.ownership" in c) {
      const v = c["delta.ownership"];
      if (foundry.data?.operators?.ForcedDeletion && v instanceof foundry.data.operators.ForcedDeletion) server.ownership = null;
      else if (JSON.stringify(v ?? null) === JSON.stringify(server.ownership ?? null)) delete c["delta.ownership"];
      else server.ownership = v;
    }
    if ("delta.-=ownership" in c) server.ownership = null;
    return update(c, options);
  };
  return server;
}

test("PT3-1 live: the server lost the corpse map (server null, clients OBSERVER): a revival still clears the clients", async () => {
  const tok = goblin(null);
  await corpses.toCorpse(tok);
  assert.deepEqual(tok.delta.ownership, { default: OBSERVER });
  serverSide(tok, null);                                   // the server never kept {default: OBSERVER}
  await corpses.revive(tok);
  assert.equal(tok.delta.ownership ?? null, null, "the clients' OBSERVER map is gone");
  assert.equal(playerLevel(tok), NONE, "the ZZ player no longer observes the revived NPC");
});

test("PT3-1 live: a saved per-token map the server still holds comes back on the clients too", async () => {
  const shared = { default: NONE, [PLAYER]: OBSERVER };
  const tok = goblin({ ...shared });
  await corpses.toCorpse(tok);
  assert.deepEqual(tok.delta.ownership, { default: OBSERVER, [PLAYER]: OBSERVER });
  const server = serverSide(tok, { ...shared });           // the corpse map was lost server-side
  await corpses.fromCorpse(tok);
  assert.deepEqual(tok.delta.ownership, shared, "the clients get the saved map, not OBSERVER");
  assert.deepEqual(server.ownership, shared, "and the server holds it");
});
