// The world adapter walks every token on every scene (pinned login, the switch-on audit, the GM
// right-click menu). It must never read `token.actor`: in v14.369 that getter materializes the lazy
// ActorDelta of an unlinked token and builds a synthetic actor (client/documents/token.mjs `get
// actor()`, once game.mjs has cleared `_preventActorDeltaAccess`), one per unlinked token in the
// world. The root actor comes from the base actor (`game.actors.get(token.actorId)`) and the token's
// own dnd5e flag instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, flush, pinsWorld } from "./fixtures/actors.mjs";
import { makeToken } from "./kit/foundry-stub.mjs";
import { MODULE } from "../pins-core.mjs";
import { auditWorld, gatherInputs, liveToken, pinInputs, pinTargets, startedCombatTokens, rootOfToken, tokenPermits, tokenRecord, tokensByRoots, tokensOfRoot } from "../world-adapter.mjs";

const F = await pinsWorld(MODULE);
const B = game.scenes.get(IDS.sceneB), C = game.scenes.get(IDS.sceneC);

/** A token whose `actor` getter counts its reads (each one is a synthetic actor built in v14). */
function counted(data, scene) {
  const tok = makeToken({ ...data, actor: null }, scene);   // `actor` given: the stub defines no getter of its own
  tok.reads = 0;
  Object.defineProperty(tok, "actor", {
    get() {
      this.reads += 1;
      return game.actors.get(this.actorId) ?? null;
    },
    configurable: true,
    enumerable: false,
  });
  tok.collection = scene.tokens;
  scene.tokens.set(tok.id, tok);
  return tok;
}

const goblins = Array.from({ length: 5 }, (_, i) => counted({ id: `goblinTok000000${i}`, name: "Goblin", actorId: IDS.spirit, actorLink: false }, C));
const wolfUnlinked = counted({ id: "wolfUnlinked0001", name: "Wolf", actorId: IDS.wolf, actorLink: false }, C);
const wolfLinked = counted({ id: "wolfLinked000001", name: "Talo (Wolf)", actorId: IDS.wolf, actorLink: true,
  flags: { dnd5e: { originalActor: IDS.talo } } }, B);
const all = () => [...goblins, wolfUnlinked, wolfLinked];
const reads = () => all().reduce((n, t) => n + t.reads, 0);

test("rootOfToken: base actor and token flag, never token.actor", () => {
  assert.equal(rootOfToken(goblins[0]), IDS.spirit, "an unlinked NPC is its own root");
  assert.equal(rootOfToken(wolfUnlinked), IDS.talo, "an unlinked form token: the base form actor's originalActor");
  assert.equal(rootOfToken(wolfLinked), IDS.talo, "a transformed token: its own dnd5e.originalActor flag");
  assert.equal(rootOfToken(B.tokens.get(IDS.taloTok)), IDS.talo);
  assert.equal(rootOfToken(makeToken({ id: "orphanTok0000001", actorId: "gone000000000001" }, C)), "gone000000000001",
    "a token whose actor is gone keeps its actorId");
  assert.equal(rootOfToken(null), null);
  assert.equal(reads(), 0, "no synthetic actor built");
});

test("tokensOfRoot / tokensByRoots / tokenRecord / auditWorld walk every scene without building a synthetic actor", () => {
  const talo = tokensOfRoot(IDS.talo).map(t => t.id).sort();
  assert.deepEqual(talo, [IDS.taloTok, "wolfLinked000001", "wolfUnlinked0001"].sort());
  const forms = Object.fromEntries(tokensOfRoot(IDS.talo).map(t => [t.id, t.form]));
  assert.deepEqual(forms, { [IDS.taloTok]: null, wolfLinked000001: "Wolf", wolfUnlinked0001: "Wolf" }, "form: the token's actor name");
  const byRoot = tokensByRoots([IDS.talo, IDS.spirit, IDS.mira]);
  assert.equal(byRoot[IDS.spirit].length, 5);
  assert.equal(byRoot[IDS.mira].length, 1);
  assert.equal(tokenRecord(wolfUnlinked).form, "Wolf");
  const audit = auditWorld();
  assert.ok(audit.violations.some(v => v.code === "MANY_TOKENS"), "Talo now has three tokens");
  assert.equal(reads(), 0, "no synthetic actor built");
});

test("rootOfActor and tokensOfRoot share rootOfToken's flag reader: a form maps to its original; none → []", async () => {
  const { rootOfActor } = await import("../world-adapter.mjs");
  assert.equal(rootOfActor(game.actors.get(IDS.wolf)), IDS.talo, "previousActorIds / originalActor on the form actor");
  assert.equal(rootOfActor(game.actors.get(IDS.mira)), IDS.mira);
  assert.equal(rootOfActor(null), null);
  assert.deepEqual(tokensOfRoot(null), []);
  assert.deepEqual(tokensOfRoot("noSuchActor00001"), []);
  assert.deepEqual(tokensOfRoot(IDS.talo).map(t => t.id).sort(), tokensByRoots([IDS.talo])[IDS.talo].map(t => t.id).sort());
});

test("tokenPermits (CR4): the token's own testUserPermission only, never token.actor", () => {
  const player = game.users.get(IDS.taloUser);
  const tok = counted({ id: "permTok000000001", name: "Wolf", actorId: IDS.wolf, actorLink: false }, C);
  const asked = [];
  Object.defineProperty(tok, "testUserPermission", { value: (u, level) => { asked.push([u.id, level]); return level === "OBSERVER"; },
    configurable: true });
  assert.equal(tokenPermits(tok, player, "OWNER"), false, "the token says no: no fallback to its actor");
  assert.equal(tokenPermits(tok, player, "OBSERVER"), true);
  assert.deepEqual(asked, [[IDS.taloUser, "OWNER"], [IDS.taloUser, "OBSERVER"]]);
  assert.equal(tokenPermits(null, player), false);
  assert.equal(tokenPermits(tok, null), false);
  assert.equal(tok.reads, 0, "no synthetic actor built");
  C.tokens.delete(tok.id);
});

test("pinTargets (CR3): one token walk; non-GM pins with one resolved token only", () => {
  const before = reads();
  const t = pinTargets();
  assert.deepEqual(Object.keys(t), [], "Talo has three tokens here (ambiguous); nobody else is pinned");
  assert.equal(reads(), before, "no synthetic actor built");
});

/** Count passes over the scenes' token collections while `fn` runs (tokensByRoots reads each `contents` once). */
function walksDuring(fn) {
  let walks = 0;
  const scenes = game.scenes.contents;
  for (const sc of scenes) Object.defineProperty(sc.tokens, "contents", { get() { walks += 1; return [...this.values()]; }, configurable: true });
  try {
    const out = fn();
    return { out, walks };
  } finally {
    for (const sc of scenes) delete sc.tokens.contents;
  }
}

test("gatherInputs (gather plan §4.1): every user; NON-GM pins only; existing roots; one token walk, none with byRoot", () => {
  const bot = game.users.get(IDS.bot);
  bot.flags[MODULE] = { actor: IDS.mira };                     // a GM's leftover flag: never in `pins`
  game.users.get(IDS.miraUser).flags[MODULE] = { actor: "goneActor0000001" };   // a deleted actor
  try {
    const one = walksDuring(() => tokensByRoots([IDS.talo])).walks;
    const { out: inputs, walks } = walksDuring(() => gatherInputs());
    assert.ok(one > 0);
    assert.equal(walks, one, "one pass over every scene");
    assert.deepEqual(inputs.users.map(u => [u.id, u.isGM, u.active]).sort(), [
      [IDS.gm, true, true], [IDS.bot, true, true], [IDS.taloUser, false, true], [IDS.miraUser, false, true]].sort());
    assert.deepEqual(Object.keys(inputs.users[0]).sort(), ["active", "id", "isGM", "name"]);
    assert.deepEqual(inputs.pins, [
      { user: IDS.taloUser, actor: IDS.talo, observes: true },
      { user: IDS.miraUser, actor: "goneActor0000001", observes: null },
    ], "the GM's pin is left out (a GM flag never makes a player SHARED_ACTOR)");
    assert.deepEqual(inputs.pinsByUser, { [IDS.taloUser]: IDS.talo, [IDS.miraUser]: "goneActor0000001" }, "non-GM users only");
    assert.deepEqual(inputs.actors, { [IDS.talo]: { id: IDS.talo, name: "Talo" } }, "existing roots only");
    assert.deepEqual(Object.keys(inputs.tokensByRoot).sort(), [IDS.talo, "goneActor0000001"].sort());
    assert.deepEqual(inputs.tokensByRoot[IDS.talo].map(t => t.id).sort(), tokensOfRoot(IDS.talo).map(t => t.id).sort());
    // the menu's walk handed in: no walk of our own
    const byRoot = tokensByRoots([IDS.talo, "goneActor0000001", IDS.mira]);
    const shared = walksDuring(() => gatherInputs({ byRoot }));
    assert.equal(shared.walks, 0, "byRoot given: no walk");
    assert.equal(shared.out.tokensByRoot[IDS.talo], byRoot[IDS.talo]);
    // a byRoot missing a root: only the missing roots are walked (never a false NO_TOKEN)
    const partial = walksDuring(() => gatherInputs({ byRoot: { [IDS.talo]: byRoot[IDS.talo] } }));
    assert.equal(partial.walks, one);
    assert.deepEqual(partial.out.tokensByRoot.goneActor0000001, []);
    assert.equal(reads(), 0, "no synthetic actor built");
  } finally {
    delete bot.flags[MODULE];
    delete game.users.get(IDS.miraUser).flags[MODULE];
  }
});

test("pinInputs (code review G8): ONE builder — auditWorld reads it with the GMs' pins (GM_USER), gatherInputs without", () => {
  const bot = game.users.get(IDS.bot);
  bot.flags[MODULE] = { actor: IDS.mira };
  try {
    const withGm = pinInputs({ gms: true }), players = pinInputs();
    assert.deepEqual(withGm.pins.map(p => p.user).sort(), [IDS.taloUser, IDS.bot].sort(), "with gms: the GM's flag is an input (the audit reports it)");
    assert.equal(players.pins.some(p => p.user === IDS.bot), false);
    assert.deepEqual(gatherInputs(), players, "gatherInputs is pinInputs without GMs");
    assert.ok(auditWorld().violations.some(v => v.code === "GM_USER" && v.user.id === IDS.bot), "auditWorld: pinInputs with the GMs");
    assert.deepEqual(Object.keys(withGm.actors).sort(), [IDS.talo, IDS.mira].sort(), "the GM-pinned root's actor too");
  } finally {
    delete bot.flags[MODULE];
  }
});

test("liveToken (code review G7): a record as it stands now — its scene, else the same id on another scene (a keepId carry); gone or re-rooted → null; no token walk", () => {
  const tok = makeToken({ id: "liveTok000000001", name: "Talo", actorId: IDS.talo, actorLink: true, x: 1, y: 2 }, B);
  tok.collection = B.tokens;
  B.tokens.set(tok.id, tok);
  try {
    const rec = tokenRecord(tok, IDS.talo);
    const here = walksDuring(() => liveToken(rec, IDS.talo));
    assert.deepEqual([here.out.id, here.out.scene, here.walks], [tok.id, IDS.sceneB, 0]);
    // carried to C (keepId): found there
    B.tokens.delete(tok.id);
    tok.parent = C;
    C.tokens.set(tok.id, tok);
    const moved = walksDuring(() => liveToken(rec, IDS.talo));
    assert.deepEqual([moved.out.id, moved.out.scene, moved.walks], [tok.id, IDS.sceneC, 0]);
    assert.equal(liveToken(rec, IDS.mira), null, "now another root's token: not this pin's");
    C.tokens.delete(tok.id);
    assert.equal(liveToken(rec, IDS.talo), null, "gone");
    assert.equal(liveToken(null, IDS.talo), null);
  } finally {
    B.tokens.delete(tok.id);
    C.tokens.delete(tok.id);
  }
});

test("startedCombatTokens (gather plan §1.3): started combats only, keyed on combatant.sceneId (an unlinked combat too)", async () => {
  try {
    assert.deepEqual(startedCombatTokens(), new Map(), "no combat");
    F.startCombat({ round: 2, scene: IDS.sceneA, combatants: [{ sceneId: IDS.sceneA, tokenId: IDS.miraTok }] });
    F.startCombat({ round: 1, scene: null, combatants: [{ sceneId: IDS.sceneB, tokenId: IDS.taloTok }, { sceneId: IDS.sceneA, tokenId: "otherTok00000001" },
      { sceneId: IDS.sceneA, tokenId: null }, { sceneId: null, tokenId: "noSceneTok000001" }] });
    F.startCombat({ round: 0, scene: IDS.sceneC, combatants: [{ sceneId: IDS.sceneC, tokenId: "notStarted000001" }] });
    const m = startedCombatTokens();
    assert.deepEqual([...m.keys()].sort(), [IDS.sceneA, IDS.sceneB].sort(), "an unstarted combat (round 0) adds nothing");
    assert.deepEqual([...m.get(IDS.sceneA)].sort(), [IDS.miraTok, "otherTok00000001"].sort());
    assert.deepEqual([...m.get(IDS.sceneB)], [IDS.taloTok], "a combat with scene null still counts, by combatant.sceneId");
    await flush();
  } finally {
    F.endCombats();
  }
});
