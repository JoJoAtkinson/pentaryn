// The world adapter walks every token on every scene (pinned login, the switch-on audit, the GM
// right-click menu). It must never read `token.actor`: in v14.369 that getter materializes the lazy
// ActorDelta of an unlinked token and builds a synthetic actor (client/documents/token.mjs `get
// actor()`, once game.mjs has cleared `_preventActorDeltaAccess`), one per unlinked token in the
// world. The root actor comes from the base actor (`game.actors.get(token.actorId)`) and the token's
// own dnd5e flag instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, pinsWorld } from "./fixtures/actors.mjs";
import { makeToken } from "./kit/foundry-stub.mjs";
import { MODULE } from "../pins-core.mjs";
import { auditWorld, pinTargets, rootOfToken, tokenPermits, tokenRecord, tokensByRoots, tokensOfRoot } from "../world-adapter.mjs";

await pinsWorld(MODULE);
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
