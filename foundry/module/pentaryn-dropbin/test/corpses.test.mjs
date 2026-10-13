// Corpse ownership round trip (play-test PT3-1, fix/playtest-2026-10-11). A corpse gives players
// OBSERVER on the token's own actor delta so Item Piles can render the loot window; reviving it must
// give that back. The stub's token update merges like Foundry's recursive update (an empty object is a
// no-op, `null` replaces), which is what left a revived enemy's full sheet open to every player.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, PLAYER, addScene, dropbinWorld, makeActor } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
await import("../dropbin.mjs");
const { corpses } = await import("../corpses.mjs");
const { OBSERVER, NONE, OWNER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;

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

test("dropbin-EC-6: a pile that is already our corpse but lost its OBSERVER write (and sight) is repaired", async () => {
  // The corpse flags landed but the OBSERVER map (and sight off) did not: toCorpse returned at the
  // isPile check, so players never got the loot window. It now re-writes just those two fields.
  const shared = { default: NONE, [PLAYER]: OBSERVER };
  const tok = goblin({ ...shared }, { [MOD]: { corpse: true, sight: true, ownership: { ...shared } },
    "item-piles": { data: { enabled: true } } });
  const piles = F.calls.filter(c => c.op === "turnTokensIntoItemPiles").length;
  await corpses.toCorpse(tok);
  assert.equal(tok.delta.ownership.default, OBSERVER, "players observe the body again");
  assert.equal(tok.sight.enabled, false, "sight is off again");
  assert.deepEqual(tok.flags[MOD], { corpse: true, sight: true, ownership: shared }, "saved flags untouched");
  assert.equal(F.calls.filter(c => c.op === "turnTokensIntoItemPiles").length, piles, "no new pile call");
  await corpses.fromCorpse(tok);
  assert.deepEqual(tok.delta.ownership, shared, "a revival still puts the pre-death map back");
  assert.equal(tok.sight.enabled, true);
});

test("dropbin-EC-6: a healthy corpse pile is left alone (no write)", async () => {
  const tok = goblin({ default: OBSERVER }, { [MOD]: { corpse: true, sight: true, ownership: null },
    "item-piles": { data: { enabled: true } } });
  tok.sight.enabled = false;
  let writes = 0;
  const update = tok.update.bind(tok);
  tok.update = async (...a) => { writes++; return update(...a); };
  await corpses.toCorpse(tok);
  assert.equal(writes, 0);
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

/* ── dropbin-EC-4: two syncs on one token never convert it in parallel ──────────────────────────── */

// HUD Revive runs its own sync while the 150 ms debounced sync (queued by Revive's own hp write) can
// fire mid-conversion. Both saw "our corpse", both reverted, and the second one's ForcedDeletion of
// delta.ownership landed after the first had put the saved map back: a creature shared with a
// player came back unshared. A second sync for a token in flight now waits and re-checks.
test("dropbin-EC-4: two concurrent syncs on a revived corpse revert it once and keep the saved map", async () => {
  const shared = { default: NONE, [PLAYER]: OBSERVER };
  const tok = goblin({ ...shared });
  await corpses.toCorpse(tok);
  tok.actor.system.attributes.hp.value = 3;               // healed: the body is alive again
  tok.actor.statuses.delete("dead");
  const before = F.calls.filter(c => c.op === "revertTokensFromItemPiles").length;
  await Promise.all([corpses.sync(tok.actor), corpses.sync(tok.actor)]);
  assert.equal(F.calls.filter(c => c.op === "revertTokensFromItemPiles").length - before, 1, "reverted once");
  assert.deepEqual(tok.delta.ownership, shared, "the saved map survives the second sync");
  assert.deepEqual(tok.flags[MOD], {});
});

test("dropbin-EC-4: HUD Revive cancels the debounced sync its own hp write queued", async () => {
  const tok = goblin(null);
  await corpses.toCorpse(tok);
  tok.actor.update = async changes => {                    // the hp write fires updateActor, as Foundry does
    const expanded = foundry.utils.expandObject(changes);
    foundry.utils.mergeObject(tok.actor, expanded);
    Hooks.callAll("updateActor", tok.actor, expanded, {}, game.user.id);
  };
  const reverts = () => F.calls.filter(c => c.op === "revertTokensFromItemPiles").length;
  const before = reverts();
  const p = corpses.revive(tok);
  // the debounced timer fires while Revive's own sync is still converting
  await Promise.resolve();
  mock.timers.tick(200);
  await p;
  mock.timers.tick(200);
  await new Promise(r => setImmediate(r));
  assert.equal(reverts() - before, 1, "one revert, not a second from the timer");
  assert.equal(tok.delta.ownership ?? null, null);
});

/* ── dropbin-R6: the legacy writers refuse bad input with one warning and never half-apply ──────── */

/** Run fn with console.warn captured; returns the warnings' first arguments. */
async function warnings(fn) {
  const seen = [];
  const keep = console.warn;
  console.warn = (...a) => seen.push(String(a[0]));
  try { await fn(); } finally { console.warn = keep; }
  return seen;
}

test("dropbin-R6: without Item Piles, toCorpse/fromCorpse/sync return early with one prefixed warning", async () => {
  const live = goblin(null);
  const dead = goblin({ default: OBSERVER }, { [MOD]: { corpse: true, sight: true, ownership: null } });
  const ip = F.game.itempiles;
  F.game.itempiles = undefined;
  const before = F.calls.length;
  try {
    for (const run of [() => corpses.toCorpse(live), () => corpses.fromCorpse(dead), () => corpses.sync(live.actor)]) {
      const seen = await warnings(run);
      assert.equal(seen.length, 1, JSON.stringify(seen));
      assert.match(seen[0], /^pentaryn-dropbin \| corpses\.\w+: Item Piles is not active/);
    }
  } finally {
    F.game.itempiles = ip;
  }
  assert.equal(F.calls.slice(before).filter(c => c.op === "update").length, 0, "nothing written");
  assert.equal(live.flags[MOD]?.corpse, undefined);
  assert.equal(dead.flags[MOD].corpse, true);
});

test("dropbin-R6: a wrong argument is one prefixed warning, not a raw TypeError", async () => {
  const tok = goblin(null);
  const cases = [
    [() => corpses.toCorpse(tok.actor), /corpses\.toCorpse: expected a TokenDocument, got Actor/],
    [() => corpses.toCorpse(undefined), /corpses\.toCorpse: expected a TokenDocument/],
    [() => corpses.fromCorpse(null), /corpses\.fromCorpse: expected a TokenDocument/],
    [() => corpses.sync(tok), /corpses\.sync: expected an Actor, got Token/],
    [() => corpses.sync(undefined), /corpses\.sync: expected an Actor/],
  ];
  for (const [run, re] of cases) {
    const seen = await warnings(run);
    assert.equal(seen.length, 1, JSON.stringify(seen));
    assert.match(seen[0], /^pentaryn-dropbin \| /);
    assert.match(seen[0], re);
  }
  assert.equal(tok.flags[MOD]?.corpse, undefined, "the token was not converted");
});

test("dropbin-R6: a failed corpse-flag write reverts the pile toCorpse just made", async () => {
  const tok = goblin(null);
  const boom = new Error("server refused");
  tok.update = async () => { throw boom; };
  const reverts = () => F.calls.filter(c => c.op === "revertTokensFromItemPiles").length;
  const before = reverts();
  await assert.rejects(corpses.toCorpse(tok), err => err === boom);
  assert.equal(reverts() - before, 1, "the new pile is reverted, not left without corpse flags");
});

/* ── dropbin-EC-3: a linked NPC's corpse is looted through the loot window, never its sheet ─────── */

// Joe, 2026-10-12: "Just loot, they can't open the char sheet. They're dead, so they can't see their
// stats or bio." A linked token ignores delta.ownership, so a dead linked NPC became a pile players
// could not open (Item Piles needs OBSERVER). Players now observe the BASE actor while it is a corpse
// (its map saved and put back on revival), and no player opens a corpse's actor sheet by any route:
// Item Piles fires item-piles-preRenderActorSheet from every actor sheet render, the Ctrl bypass and
// `bypassItemPiles` included; a forced open shows the loot window instead.
let lseq = 0;
/** A linked NPC at 0 HP with `count` tokens on one scene; its base actor's ownership as given. */
function linkedNpc(ownership = { default: NONE, [GM]: OWNER }, count = 1) {
  const n = String(++lseq).padStart(4, "0");
  const actor = makeActor(F, { id: `actorLnk0000${n}`, name: "Captain Vey", type: "npc", ownership,
    system: { attributes: { hp: { value: 0, max: 30 } } } });
  const statuses = new Set();
  Object.assign(actor, {
    isToken: false,
    statuses,
    toggleStatusEffect: async (id, { active } = {}) => { if (active) statuses.add(id); else statuses.delete(id); },
    updateEmbeddedDocuments: async () => [],
    deleteEmbeddedDocuments: async () => [],
  });
  const ids = Array.from({ length: count }, (_, i) => `tokLnk${i}00000${n}`);
  const scene = addScene(F, { id: `sceneLnk0000${n}`, name: `Linked ${n}`,
    tokens: ids.map(id => ({ id, name: "Captain Vey", actorId: actor.id, actorLink: true, disposition: -1,
      sight: { enabled: true }, delta: {} })) });
  const toks = ids.map(id => scene.tokens.get(id));
  actor.getDependentTokens = () => toks;
  return toks;
}
const player = () => F.game.users.get(PLAYER);
const sheetVeto = (...args) => {
  F.become({ userId: PLAYER });
  try { return Hooks.call("item-piles-preRenderActorSheet", ...args); } finally { F.become({ userId: GM }); }
};
const lootWindows = () => F.calls.filter(c => c.op === "renderItemPileInterface");
F.game.itempiles.API.renderItemPileInterface = async (target, opts) =>
  F.calls.push({ op: "renderItemPileInterface", target, opts });

test("dropbin-EC-3: a dead linked NPC gives players OBSERVER on its base actor; a revival puts the saved map back", async () => {
  const [tok] = linkedNpc();
  const actor = tok.actor;
  const before = structuredClone(actor.ownership);
  assert.equal(actor.testUserPermission(player(), "OBSERVER"), false, "alive: players cannot observe it");
  await corpses.sync(actor);
  assert.equal(tok.flags[MOD].corpse, true, "the linked token is our corpse");
  assert.equal(actor.testUserPermission(player(), "OBSERVER"), true, "Item Piles can render the loot window for a player");
  assert.deepEqual(actor.flags[MOD].ownership, before, "the base actor's map is saved");
  assert.equal(tok.delta.ownership ?? null, null, "no delta map on a linked token: Foundry ignores it");
  await corpses.revive(tok);
  assert.equal(tok.flags[MOD].corpse, undefined);
  assert.deepEqual(actor.ownership, before, "the saved map comes back exactly");
  assert.equal(actor.testUserPermission(player(), "OBSERVER"), false);
  assert.deepEqual(actor.flags[MOD] ?? {}, {}, "no dropbin flag left on the actor");
});

// dropbin-EC-5 [declared]: sync asked getActiveTokens, which sees only the scene the GM is viewing, so a
// linked NPC killed while the GM looked at another scene stayed a creature there. It now walks every
// scene's tokens of the actor (getDependentTokens).
test("dropbin-EC-5: a dead linked NPC on a scene the GM is not viewing becomes a corpse, and revives there", async () => {
  const [tok] = linkedNpc();
  const actor = tok.actor;
  actor.getActiveTokens = () => [];           // the GM's canvas shows another scene
  await corpses.sync(actor);
  assert.equal(tok.flags[MOD]?.corpse, true, "converted on the unviewed scene");
  await corpses.revive(tok);
  assert.equal(tok.flags[MOD]?.corpse, undefined, "revived on the unviewed scene");
});

test("dropbin-EC-3: a second token of the same dead linked NPC keeps the first death's saved map", async () => {
  const shared = { default: NONE, [GM]: OWNER, [PLAYER]: OBSERVER };
  const [a, b] = linkedNpc({ ...shared }, 2);
  await corpses.sync(a.actor);
  assert.equal(a.flags[MOD].corpse && b.flags[MOD].corpse, true);
  assert.deepEqual(a.actor.flags[MOD].ownership, shared, "not the corpse's own OBSERVER map");
  await corpses.revive(a);
  assert.deepEqual(a.actor.ownership, shared);
  assert.equal(b.flags[MOD].corpse, undefined);
});

test("dropbin-EC-3: no player opens a corpse's actor sheet by any route; a forced open shows the loot window", async () => {
  const [tok] = linkedNpc();
  const actor = tok.actor;
  const gob = goblin(null);
  assert.equal(sheetVeto(actor, true, {}), true, "alive: the sheet opens as usual");
  await corpses.sync(actor);
  await corpses.toCorpse(gob);
  const from = lootWindows().length;
  assert.equal(sheetVeto(actor, true, { bypassItemPiles: true }), false, "the bypass (Ctrl, the HUD option) is refused");
  assert.equal(sheetVeto(actor, { force: true }), false, "an ApplicationV2 open is refused");
  assert.equal(sheetVeto(gob.actor, true, {}), false, "an unlinked corpse's synthetic actor too");
  assert.equal(sheetVeto(actor, false, {}), false, "a non-forced render is refused, and opens nothing");
  assert.deepEqual(lootWindows().slice(from).map(c => [c.target, c.opts.useDefaultCharacter]),
    [[actor, true], [actor, true], [gob.actor, true]], "each forced open shows the loot window instead");
  assert.equal(Hooks.call("item-piles-preRenderActorSheet", actor, true, { bypassItemPiles: true }), true,
    "the GM still opens it (HUD: Open character sheet)");
  await corpses.revive(tok);
  assert.equal(sheetVeto(actor, true, {}), true, "revived: a creature again");
});

/* ── DB-AC-4: one Item Piles call per sync, Dead toggled once per actor ─────────────────────────── */

// A sync of a linked NPC with several tokens on the map made one turnTokensIntoItemPiles (or revert)
// call per token and toggled Dead on the shared base actor once per token. It now collects the tokens
// that need converting, makes one call for all of them, writes each token's flags, then makes Dead the
// overlay once per distinct actor. A single-token sync is unchanged (one call, n: 1).
test("DB-AC-4: a three-token linked NPC syncs with one Item Piles call each way and one Dead toggle", async () => {
  const toks = linkedNpc(undefined, 3);
  const actor = toks[0].actor;
  let toggles = 0;
  const toggle = actor.toggleStatusEffect;
  actor.toggleStatusEffect = async (...a) => { toggles++; return toggle(...a); };
  const ops = op => F.calls.filter(c => c.op === op);
  const piles = ops("turnTokensIntoItemPiles").length;
  await corpses.sync(actor);
  assert.deepEqual(ops("turnTokensIntoItemPiles").slice(piles).map(c => c.n), [3], "one call for all three tokens");
  assert.equal(toggles, 1, "Dead toggled once on the shared actor");
  assert.ok(toks.every(t => t.flags[MOD].corpse === true), "every token is our corpse");
  assert.equal(toks.every(t => t.sight.enabled === false), true, "each token's sight is off");
  const reverts = ops("revertTokensFromItemPiles").length;
  await corpses.revive(toks[0]);
  assert.deepEqual(ops("revertTokensFromItemPiles").slice(reverts).map(c => c.n), [3], "one revert for all three tokens");
  assert.ok(toks.every(t => t.flags[MOD].corpse === undefined && t.sight.enabled === true), "every token is a creature again");
  assert.deepEqual(actor.flags[MOD] ?? {}, {}, "the base actor's map was put back once");
});

test("DB-AC-4: a single-token sync still makes one call with that token", async () => {
  const tok = goblin(null);
  const ops = op => F.calls.filter(c => c.op === op);
  const piles = ops("turnTokensIntoItemPiles").length;
  await corpses.sync(tok.actor);
  assert.deepEqual(ops("turnTokensIntoItemPiles").slice(piles).map(c => c.n), [1]);
  assert.equal(tok.flags[MOD].corpse, true);
});

test("dropbin-M5: isDead is always a boolean (manifest: returns boolean)", () => {
  const { isDead } = corpses;
  const hp = (value, max, statuses) => ({ system: { attributes: { hp: { value, max } } }, ...(statuses ? { statuses } : {}) });
  assert.strictEqual(isDead(null), false, "a missing actor is not dead");
  assert.strictEqual(isDead(undefined), false);
  assert.strictEqual(isDead({}), false, "no hp, no statuses");
  assert.strictEqual(isDead(hp(5, 10)), false, "alive, no statuses set");
  assert.strictEqual(isDead(hp(3, 7, new Set())), false);
  assert.strictEqual(isDead(hp(0, 0, new Set())), false, "hp.max 0 is not the corpse rule");
  assert.strictEqual(isDead(hp(0, 7)), true);
  assert.strictEqual(isDead(hp(5, 10, new Set(["dead"]))), true, "the dead status");
});
