// The published API: rows ↔ implementations, the describe/surface goldens, the write contract
// (dryRun, NOT_GM, CONFLICT, audit lines), the audit, pinnedToken's shape (pentaryn-resume reads
// `scene` as an id string), and teleport through a pentaryn-portals stub of teleportToken's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { makeDoc, makeToken, makeUser } from "./kit/foundry-stub.mjs";
import { IDS, pinsWorld } from "./fixtures/actors.mjs";
import { MODULE } from "../pins-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { SETTINGS } from "../settings.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";

const F = await pinsWorld(MODULE);
const audit = [];
console.info = (line, fields) => audit.push([line, fields]);
await import("../pins.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.modules.get(MODULE).api;
const gm = game.user;
const code = async fn => { try { await fn(); return "ok"; } catch (e) { return e.code ?? e.message; } };
const pinFlag = id => game.users.get(id).flags?.[MODULE]?.actor ?? null;
const writes = from => F.calls.slice(from).filter(c => c.op === "update" || c.op === "delete");
const B = game.scenes.get(IDS.sceneB), C = game.scenes.get(IDS.sceneC);

const portalsCalls = [];
let portalsAnswer = null;
function installPortals() {
  game.modules.set("pentaryn-portals", { id: "pentaryn-portals", active: true, api: {
    teleportToken: async (token, opts) => {
      portalsCalls.push([token.uuid, opts]);
      if (portalsAnswer) return portalsAnswer;
      return { ok: true, token: { documentName: "Token", id: token.id, uuid: token.uuid, name: token.name },
        from: token.parent.id, to: { scene: opts.scene ?? token.parent.id, x: opts.x, y: opts.y, level: opts.level ?? null },
        followers: [], moved: 1, ...(opts.dryRun ? { dryRun: true } : {}) };
    },
  } });
}
async function setPinning(value) {
  const r = game.settings.settings.get(`${MODULE}.pinning`);
  const onChange = r.onChange;
  r.onChange = undefined;
  await game.settings.set(MODULE, "pinning", value);
  r.onChange = onChange;
}

test("every described method is a function on the API", () => {
  for (const path of api.describe().methods.map(m => m.path)) {
    assert.equal(typeof path.split(".").reduce((o, k) => o?.[k], api), "function", path);
  }
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("describe() equals golden/describe.json (version, kit, published and patch routes excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("no queries: pins has no socket and registers nothing in CONFIG.queries", () => {
  assert.deepEqual(api.describe().queries, []);
  assert.deepEqual(Object.keys(CONFIG.queries).filter(k => k.startsWith(MODULE)), []);
});

test("describe().patches lists both adjustments rows; flags reads name the dnd5e flags and the two foreign APIs", () => {
  const d = api.describe();
  assert.deepEqual(d.patches.map(p => [p.label, p.adjustments, p.marker]), [
    ["Scene#view", "pins-scene-view", "__pentarynPinsView"],
    ["Scene#_onActivate", "pins-scene-activate", "__pentarynPinsActivate"],
  ]);
  assert.deepEqual(d.flags, { writes: ["flags.pentaryn-pins.actor"],
    reads: ["flags.dnd5e.originalActor", "flags.dnd5e.previousActorIds", "api:pentaryn-portals.teleportToken", "api:pentaryn-prompts.place"] });
});

test("pin / unpin: NOT_GM, dryRun writes nothing, a GM user is BAD_ARGS, bad refs are refusals", async () => {
  F.become({ userId: IDS.taloUser });
  assert.equal((await api.pin(IDS.miraUser, { actor: IDS.mira })).code, "NOT_GM");
  assert.equal((await api.unpin(IDS.taloUser)).code, "NOT_GM");
  F.become({ userId: gm.id });
  const from = F.calls.length;
  const dry = await api.pin("Mira's player", { actor: "Mira", dryRun: true });
  assert.deepEqual(dry, { ok: true, dryRun: true, user: { id: IDS.miraUser, name: "Mira's player", active: true },
    actor: { id: IDS.mira, name: "Mira" }, previous: null, cleared: [] });
  assert.equal((await api.unpin(IDS.taloUser, { dryRun: true })).previous, IDS.talo);
  assert.deepEqual(writes(from), []);
  assert.equal(pinFlag(IDS.taloUser), IDS.talo);
  assert.equal((await api.pin(IDS.bot, { actor: IDS.mira })).code, "BAD_ARGS");
  assert.equal((await api.pin(IDS.miraUser, {})).code, "BAD_ARGS");
  assert.equal((await api.pin("Nobody", { actor: IDS.mira })).code, "NOT_FOUND");
  assert.equal((await api.pin(IDS.miraUser, { actor: "Nobody" })).code, "NOT_FOUND");
});

test("pin: CONFLICT without replace; replace moves the actor in one call; audit lines; unpin", async () => {
  const conflict = await api.pin(IDS.miraUser, { actor: IDS.talo });
  assert.equal(conflict.code, "CONFLICT");
  assert.match(conflict.reason, /Talo's player/);
  audit.length = 0;
  const moved = await api.pin(IDS.miraUser, { actor: IDS.talo, replace: true });
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.cleared, [IDS.taloUser]);
  assert.equal(moved.warning, "NOT_OWNER", "Mira's player cannot observe Talo: pinned, with a warning");
  assert.equal(pinFlag(IDS.taloUser), null);
  assert.equal(pinFlag(IDS.miraUser), IDS.talo);
  assert.equal(moved.audit.ok, true);
  const unp = await api.unpin(IDS.miraUser);
  assert.deepEqual([unp.ok, unp.previous, pinFlag(IDS.miraUser)], [true, IDS.talo, null]);
  assert.deepEqual(await api.unpin(IDS.miraUser), { ok: true, user: { id: IDS.miraUser, name: "Mira's player", active: true }, previous: null });
  // pinning a wild-shaped FORM stores its root (the original)
  const form = await api.pin(IDS.taloUser, { actor: IDS.wolf });
  assert.deepEqual([form.ok, form.actor, pinFlag(IDS.taloUser)], [true, { id: IDS.talo, name: "Talo" }, IDS.talo]);
  assert.equal(form.warning, undefined, "Talo's player owns Talo: no warning");
  assert.deepEqual(audit.filter(([l]) => l.startsWith(`${MODULE} |`)).map(([l, f]) => [l, f.by]),
    [[`${MODULE} | pin`, gm.id], [`${MODULE} | unpin`, gm.id], [`${MODULE} | pin`, gm.id]]);
  assert.deepEqual(Object.keys(audit[0][1]), ["uuid", "ids", "by"]);
});

test("pins(): every pin with its tokens; a form token names its form", () => {
  B.tokens.get(IDS.taloTok).actorId = IDS.wolf;
  B.tokens.get(IDS.taloTok).flags = { dnd5e: { originalActor: IDS.talo } };
  assert.deepEqual(api.pins(), [{ user: { id: IDS.taloUser, name: "Talo's player", active: true }, actor: { id: IDS.talo, name: "Talo" },
    tokens: [{ id: IDS.taloTok, scene: IDS.sceneB, level: IDS.levelB2, form: "Wolf" }] }]);
});

test("audit: a form-only token is ok; every violation code from the live world; deletes nothing", async () => {
  assert.deepEqual(api.audit(), { enabled: false, ok: true, pins: 1, violations: [] });
  B.tokens.get(IDS.taloTok).actorId = IDS.talo;
  B.tokens.get(IDS.taloTok).flags = {};
  const extra = makeToken({ id: "taloExtra0000001", name: "Talo", actorId: IDS.talo, actorLink: false }, C);
  extra.collection = C.tokens;
  C.tokens.set(extra.id, extra);
  game.users.get(IDS.miraUser).flags[MODULE] = { actor: IDS.talo };          // a raw flag write: shared
  game.users.get(IDS.bot).flags[MODULE] = { actor: IDS.mira };              // a pin on a GM, Mira has a token
  game.users.get(IDS.gm).flags[MODULE] = { actor: "deadActor0000001" };     // a deleted actor
  const from = F.calls.length;
  const r = api.audit();
  assert.equal(r.ok, false);
  assert.deepEqual(r.violations.map(v => [v.code, v.user.id]).sort(), [
    ["GM_USER", IDS.bot], ["GM_USER", IDS.gm], ["MANY_TOKENS", IDS.miraUser], ["MANY_TOKENS", IDS.taloUser],
    ["NO_ACTOR", IDS.gm], ["NOT_OWNER", IDS.miraUser], ["SHARED_ACTOR", IDS.miraUser], ["SHARED_ACTOR", IDS.taloUser], ["UNLINKED", IDS.miraUser], ["UNLINKED", IDS.taloUser],
  ].sort());
  // every token record survives (code review M1/E1: a depth cap of 4 turned them into "[max depth]")
  const many = r.violations.find(v => v.code === "MANY_TOKENS" && v.user.id === IDS.taloUser);
  assert.deepEqual(many.tokens.map(t => [t.id, t.sceneName]).sort(),
    [[IDS.taloTok, "Lighthouse"], ["taloExtra0000001", "Cave"]].sort());
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r, "plain JSON");
  assert.deepEqual(writes(from), [], "the audit never deletes a token");
  C.tokens.delete(extra.id);
  delete game.users.get(IDS.miraUser).flags[MODULE];
  delete game.users.get(IDS.bot).flags[MODULE];
  delete game.users.get(IDS.gm).flags[MODULE];
  const [, tok] = [null, B.tokens.get(IDS.taloTok)];
  B.tokens.delete(IDS.taloTok);
  assert.deepEqual(api.audit().violations.map(v => v.code), ["NO_TOKEN"]);
  B.tokens.set(IDS.taloTok, tok);
});

test("pinnedToken: null while off; scene and level are id strings (the resume contract); coded throws", async () => {
  assert.equal(api.pinnedToken(IDS.taloUser), null, "switch off");
  await setPinning(true);
  const p = api.pinnedToken("Talo's player");
  assert.deepEqual(p, { token: `Scene.${IDS.sceneB}.Token.${IDS.taloTok}`, actor: `Actor.${IDS.talo}`, scene: IDS.sceneB, level: IDS.levelB2, x: 500, y: 500 });
  assert.equal(typeof p.scene, "string");
  assert.equal(typeof p.level, "string");
  assert.equal(api.pinnedToken(IDS.miraUser), null, "unpinned");
  game.users.get(IDS.bot).flags[MODULE] = { actor: IDS.talo };   // a promoted player's leftover flag (audit GM_USER)
  assert.equal(api.pinnedToken(IDS.bot), null, "a GM is never followed, flag or not");
  delete game.users.get(IDS.bot).flags[MODULE];
  assert.equal(await code(() => api.pinnedToken("Nobody")), "NOT_FOUND");
  assert.equal(await code(() => api.pinnedToken(42)), "BAD_ARGS");
  await setPinning(false);
});

test("every code api.mjs fails or throws with is one describe().errors lists (the kit's codes)", () => {
  const src = readFileSync(new URL("../api.mjs", import.meta.url), "utf8");
  const used = new Set([...src.matchAll(/\b(?:fail|codedError)\(\s*"([A-Z_]+)"/g)].map(m => m[1]));
  assert.ok(used.size > 3, "the scan finds the codes");
  const known = new Set(api.describe().errors);
  assert.deepEqual([...used].filter(c => !known.has(c)), [], "codes outside describe().errors");
  const doc = MANIFEST.rows.map(r => r.doc).join(" ");
  assert.doesNotMatch(doc, /\bUNAVAILABLE\b/, "the manifest names only kit codes");
});

test("teleport: refusals; UNSUPPORTED without portals; a portals fail passes through", async () => {
  assert.equal((await api.teleport(IDS.miraUser, { x: 1, y: 1 })).code, "BAD_ARGS", "no pin");
  game.modules.delete("pentaryn-portals");
  assert.equal((await api.teleport(IDS.taloUser, { x: 1, y: 1 })).code, "UNSUPPORTED");
  installPortals();
  F.become({ userId: IDS.taloUser });
  assert.equal((await api.teleport(IDS.taloUser, { x: 1, y: 1 })).code, "NOT_GM");
  F.become({ userId: gm.id });
  const tok = B.tokens.get(IDS.taloTok);
  B.tokens.delete(IDS.taloTok);
  assert.equal((await api.teleport(IDS.taloUser, { x: 1, y: 1 })).code, "NOT_FOUND", "no token");
  B.tokens.set(IDS.taloTok, tok);
  const extra = makeToken({ id: "taloExtra0000002", name: "Talo", actorId: IDS.talo }, C);
  C.tokens.set(extra.id, extra);
  assert.equal((await api.teleport(IDS.taloUser, { x: 1, y: 1 })).code, "AMBIGUOUS", "two tokens");
  C.tokens.delete(extra.id);
  portalsAnswer = { ok: false, code: "BAD_ARGS", reason: "level x is not on Cave" };
  assert.deepEqual(await api.teleport(IDS.taloUser, { x: 1, y: 1, scene: IDS.sceneC, level: "x" }), portalsAnswer);
  portalsAnswer = null;
});

test("teleport: calls portals teleportToken with { x, y, scene, level, dryRun }; viewFollows; VIEW_UNCHANGED while off", async () => {
  installPortals();   // its own stub: the test passes alone (--test-name-pattern), not only after "refusals"
  portalsCalls.length = 0;
  const off = await api.teleport(IDS.taloUser, { x: 100, y: 200, scene: IDS.sceneC });
  assert.deepEqual(portalsCalls, [[`Scene.${IDS.sceneB}.Token.${IDS.taloTok}`, { x: 100, y: 200, scene: IDS.sceneC, level: undefined, dryRun: false }]]);
  assert.deepEqual([off.ok, off.viewFollows, off.online, off.warning, off.user.id], [true, false, true, "VIEW_UNCHANGED", IDS.taloUser]);
  const same = await api.teleport(IDS.taloUser, { x: 100, y: 200 });
  assert.equal(same.warning, undefined, "same scene: nothing to warn");
  await setPinning(true);
  const on = await api.teleport(IDS.taloUser, { x: 1, y: 2, scene: IDS.sceneC, dryRun: true });
  assert.deepEqual([on.ok, on.dryRun, on.viewFollows, on.warning], [true, true, true, undefined]);
  assert.equal(on.online, true);
  game.users.get(IDS.taloUser).active = false;
  assert.equal((await api.teleport(IDS.taloUser, { x: 1, y: 2 })).viewFollows, false, "a logged-out player's view cannot follow now");
  const offline = await api.teleport(IDS.taloUser, { x: 1, y: 2, scene: IDS.sceneC });
  assert.deepEqual([offline.ok, offline.viewFollows, offline.online, offline.warning], [true, false, false, undefined],
    "switch on, player offline, another scene: their login draw lands on the token's scene, so no VIEW_UNCHANGED");
  game.users.get(IDS.taloUser).active = true;
  // a wild-shaped PC: its form token is the one moved
  const tok = B.tokens.get(IDS.taloTok);
  Object.assign(tok, { actorId: IDS.wolf, flags: { dnd5e: { originalActor: IDS.talo } } });
  portalsCalls.length = 0;
  assert.equal((await api.teleport(IDS.taloUser, { x: 5, y: 5 })).ok, true);
  assert.equal(portalsCalls[0][0], tok.uuid);
  Object.assign(tok, { actorId: IDS.talo, flags: {} });
  await setPinning(false);
});

test("inspect: a user or an actor ref; plain JSON, depth ≤ 4; coded throws", async () => {
  const byUser = api.inspect("Talo's player");
  assert.deepEqual(byUser, {
    user: { documentName: "User", id: IDS.taloUser, uuid: `User.${IDS.taloUser}`, name: "Talo's player" },
    actor: { documentName: "Actor", id: IDS.talo, uuid: `Actor.${IDS.talo}`, name: "Talo" },
    root: IDS.talo, enabled: false,
    token: { uuid: `Scene.${IDS.sceneB}.Token.${IDS.taloTok}`, scene: IDS.sceneB, level: IDS.levelB2, form: null },
    ok: true,
  });
  assert.ok(maxDepth(byUser) <= 4);
  assert.deepEqual(JSON.parse(JSON.stringify(byUser)), byUser);
  assert.equal(api.inspect(IDS.wolf).user.id, IDS.taloUser, "a form actor maps to its root's pin");
  assert.equal(api.inspect(`Actor.${IDS.talo}`).user.id, IDS.taloUser);
  assert.equal(api.inspect(IDS.mira).user, null);
  assert.equal(await code(() => api.inspect("Nobody")), "NOT_FOUND");
  // options are ignored: the root game.pentaryn.inspect hands every namespace its normalised opts (KIT-R2)
  assert.deepEqual(api.inspect(IDS.talo, { kind: "actor", sceneId: null, base: true, as: "Talo's player" }), api.inspect(IDS.talo));
  assert.deepEqual(api.inspect(IDS.talo, null), api.inspect(IDS.talo));
});

test("inspect through the root game.pentaryn.inspect: kind/sceneId opts reach pins without BAD_ARGS (M2/E3/D5)", async () => {
  const byActor = await game.pentaryn.inspect(IDS.talo, { kind: "actor" });
  assert.equal(byActor.pins?.user?.id, IDS.taloUser, JSON.stringify(byActor.pins));
  const byUser = await game.pentaryn.inspect("Talo's player", { kind: "user" });
  assert.equal(byUser.pins?.root, IDS.talo, JSON.stringify(byUser.pins));
});

test("a name with a dot is a user first, then an actor; only a uuid goes straight to its document (D4/A1-4)", async () => {
  const dotUser = makeUser({ id: "dotUser000000001", name: "Mr. Talo", flags: { [MODULE]: { actor: IDS.mira } } });
  game.users.set(dotUser.id, dotUser);
  const dotActor = makeDoc("Actor", { id: "dotActor00000001", name: "Mr. Talo", type: "npc" });
  game.actors.set(dotActor.id, dotActor);
  try {
    assert.equal(api.inspect("Mr. Talo").user.id, dotUser.id, "the user wins the name, as for any name");
    assert.equal(api.inspect("Mr. Talo").root, IDS.mira);
    assert.equal(api.pinnedToken("Mr. Talo"), null, "a user ref: no NOT_FOUND for a dotted name");
    game.users.delete(dotUser.id);
    assert.equal(api.inspect("Mr. Talo").actor.id, dotActor.id, "no such user: the actor of that name");
    assert.equal(api.inspect(`Actor.${IDS.talo}`).user.id, IDS.taloUser, "an Actor uuid is an actor");
    assert.equal(api.inspect(`User.${IDS.taloUser}`).root, IDS.talo, "a User uuid is a user");
    assert.equal(api.inspect(`Scene.${IDS.sceneB}.Token.${IDS.taloTok}`).user?.id, IDS.taloUser, "a token uuid is its actor");
  } finally {
    game.users.delete(dotUser.id);
    game.actors.delete(dotActor.id);
  }
});

test("pin: a vetoed or failed write is REFUSED/INTERNAL and puts the cleared pins back (D6)", async () => {
  F.become({ userId: gm.id });
  assert.equal(pinFlag(IDS.taloUser), IDS.talo);
  const veto = (user) => (user.id === IDS.miraUser ? false : undefined);
  const id = Hooks.on("preUpdateUser", veto);
  try {
    const r = await api.pin(IDS.miraUser, { actor: IDS.talo, replace: true });
    assert.equal(r.ok, false);
    assert.equal(r.code, "REFUSED");
    assert.equal(pinFlag(IDS.miraUser), null, "Mira's player not pinned");
    assert.equal(pinFlag(IDS.taloUser), IDS.talo, "Talo's player keeps Talo: the clear was rolled back");
    assert.deepEqual(r.restored, [IDS.taloUser]);
  } finally {
    Hooks.off("preUpdateUser", id);
  }
  // a vetoed CLEAR: the set went through, so it is undone (never two users on one actor)
  const keep = Hooks.on("preUpdateUser", user => (user.id === IDS.taloUser ? false : undefined));
  try {
    const r = await api.pin(IDS.miraUser, { actor: IDS.talo, replace: true });
    assert.deepEqual([r.ok, r.code], [false, "REFUSED"]);
    assert.deepEqual([pinFlag(IDS.taloUser), pinFlag(IDS.miraUser)], [IDS.talo, null]);
  } finally {
    Hooks.off("preUpdateUser", keep);
  }
  const mira = game.users.get(IDS.miraUser);
  const update = mira.update;
  mira.update = async () => { throw new Error("socket closed"); };
  try {
    const r = await api.pin(IDS.miraUser, { actor: IDS.talo, replace: true });
    assert.deepEqual([r.ok, r.code], [false, "INTERNAL"]);
    assert.equal(pinFlag(IDS.taloUser), IDS.talo, "rolled back after a thrown write too");
  } finally {
    mira.update = update;
  }
});

test("described settings are exactly the SETTINGS table; settings() snapshots them", () => {
  assert.deepEqual(api.describe().settings.map(s => s.key), SETTINGS.map(r => r.key));
  assert.deepEqual(api.settings(), { pinning: false });
});

test("selftest passes on a healthy load (portals present)", () => {
  installPortals();
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks));
  game.modules.delete("pentaryn-portals");
  assert.equal(api.selftest().checks.find(c => c.label.includes("teleportToken")).ok, false);
});
