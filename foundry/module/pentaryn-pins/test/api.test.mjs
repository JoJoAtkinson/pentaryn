// The published API: rows ↔ implementations, the describe/surface goldens, the write contract
// (dryRun, NOT_GM, CONFLICT, audit lines), the audit, pinnedToken's shape (pentaryn-resume reads
// `scene` as an id string), and teleport through a pentaryn-portals stub of teleportToken's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { makeDoc, makeToken, makeUser } from "./kit/foundry-stub.mjs";
import { GATHER_IDS, IDS, gatherParty, pinsWorld } from "./fixtures/actors.mjs";
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
/** What the portals stub reports as pulled on a cross-scene move; null → exactly its `pull` (portals ≥ 0.7.0). */
let portalsPulled = null;
function installPortals() {
  game.modules.set("pentaryn-portals", { id: "pentaryn-portals", active: true, api: {
    teleportToken: async (token, opts) => {
      portalsCalls.push([token.uuid, opts]);
      if (portalsAnswer) return portalsAnswer;
      const cross = !!opts.scene && opts.scene !== token.parent.id;
      const pulled = portalsPulled ?? (opts.pull ?? []).map(id => ({ id, name: game.users.get(id)?.name ?? null }));
      return { ok: true, token: { documentName: "Token", id: token.id, uuid: token.uuid, name: token.name },
        from: token.parent.id, to: { scene: opts.scene ?? token.parent.id, x: opts.x, y: opts.y, level: opts.level ?? null },
        followers: [], moved: 1, ...(opts.dryRun ? { dryRun: true } : { pulled: cross ? pulled : [] }) };
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

test("describe().patches lists the one adjustments row (0.2.0: no Scene#view patch); flags reads name the dnd5e flags, the two foreign APIs and portals' prePull hook", () => {
  const d = api.describe();
  assert.deepEqual(d.patches.map(p => [p.label, p.adjustments, p.marker]), [
    ["Scene#_onActivate", "pins-scene-activate", "__pentarynPinsActivate"],
  ]);
  assert.deepEqual(d.flags, { writes: ["flags.pentaryn-pins.actor"],
    reads: ["flags.dnd5e.originalActor", "flags.dnd5e.previousActorIds", "api:pentaryn-portals.teleportToken", "api:pentaryn-prompts.place",
      "hook:pentaryn-portals.prePull"] });
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

test("teleport: pull [the player] when on and online, [] off/offline; viewFollows from portals' pulled; VIEW_UNCHANGED online and not pulled", async () => {
  installPortals();   // its own stub: the test passes alone (--test-name-pattern), not only after "refusals"
  portalsCalls.length = 0;
  const uuid = `Scene.${IDS.sceneB}.Token.${IDS.taloTok}`;
  try {
    // switch off: no pull asked; a cross-scene move the rule did not pull for → VIEW_UNCHANGED
    portalsPulled = [];
    const off = await api.teleport(IDS.taloUser, { x: 100, y: 200, scene: IDS.sceneC });
    assert.deepEqual(portalsCalls, [[uuid, { x: 100, y: 200, scene: IDS.sceneC, level: undefined, pull: [], dryRun: false }]]);
    assert.deepEqual([off.ok, off.viewFollows, off.online, off.warning, off.user.id], [true, false, true, "VIEW_UNCHANGED", IDS.taloUser]);
    const same = await api.teleport(IDS.taloUser, { x: 100, y: 200 });
    assert.deepEqual([same.viewFollows, same.warning], [false, undefined], "same scene: nothing to warn");
    // switch off, but core's Teleport Token rule pulled them anyway (they watched the token): the view follows
    portalsPulled = [{ id: IDS.taloUser, name: "Talo's player" }];
    const ruled = await api.teleport(IDS.taloUser, { x: 1, y: 2, scene: IDS.sceneC });
    assert.deepEqual([ruled.viewFollows, ruled.warning], [true, undefined]);
    portalsPulled = null;
    await setPinning(true);
    portalsCalls.length = 0;
    const on = await api.teleport(IDS.taloUser, { x: 1, y: 2, scene: IDS.sceneC });
    assert.deepEqual(portalsCalls[0][1].pull, [IDS.taloUser], "switch on, online: portals pulls the player");
    assert.deepEqual([on.ok, on.viewFollows, on.warning, on.pulled], [true, true, undefined, [{ id: IDS.taloUser, name: "Talo's player" }]]);
    const dry = await api.teleport(IDS.taloUser, { x: 1, y: 2, scene: IDS.sceneC, dryRun: true });
    assert.deepEqual([dry.ok, dry.dryRun, dry.viewFollows, dry.warning], [true, true, true, undefined], "a dryRun predicts the pull");
    // an older portals (no `pull` support): it pulled nobody → the view did not follow, and the GM is told
    portalsPulled = [];
    const old = await api.teleport(IDS.taloUser, { x: 1, y: 2, scene: IDS.sceneC });
    assert.deepEqual([old.viewFollows, old.warning], [false, "VIEW_UNCHANGED"]);
    portalsPulled = null;
    // same scene, the player watching it: core's level switch or the gap-filler follows; no pull
    const talo = game.users.get(IDS.taloUser);
    F.pulls.length = 0;
    talo.viewedScene = IDS.sceneB;
    const onSame = await api.teleport(IDS.taloUser, { x: 1, y: 2 });
    // CR2: never skipped on the GM's lagging copy of viewedScene; core's view of what is drawn draws nothing
    assert.deepEqual([onSame.viewFollows, onSame.warning, onSame.pulled], [true, undefined, []]);
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], { level: IDS.levelB2, controlledTokens: [IDS.taloTok] }]],
      "same scene, apparently watched: pulled anyway (CR2)");
    F.pulls.length = 0;
    // same scene, the player peeking at another map: portals never pulls there, so pins pulls them back (review F1)
    talo.viewedScene = IDS.sceneA;
    const peek = await api.teleport(IDS.taloUser, { x: 1, y: 2 });
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], { level: IDS.levelB2, controlledTokens: [IDS.taloTok] }]],
      "pulled back to the token's scene and level, the token controlled");
    assert.deepEqual([peek.ok, peek.viewFollows, peek.warning], [true, true, undefined]);
    F.pulls.length = 0;
    assert.equal((await api.teleport(IDS.taloUser, { x: 1, y: 2, dryRun: true })).viewFollows, true, "a dryRun pulls nobody");
    assert.deepEqual(F.pulls, []);
    // a pull that throws: the move stands, the view does not follow
    B.pullUsers = () => { throw new Error("socket closed"); };
    try {
      const failed = await api.teleport(IDS.taloUser, { x: 1, y: 2 });
      assert.deepEqual([failed.ok, failed.viewFollows], [true, false]);
    } finally {
      delete B.pullUsers;
    }
    // switch off: a peeking player is not pulled (stock)
    await setPinning(false);
    assert.equal((await api.teleport(IDS.taloUser, { x: 1, y: 2 })).viewFollows, false);
    assert.deepEqual(F.pulls, []);
    await setPinning(true);
    delete talo.viewedScene;
    game.users.get(IDS.taloUser).active = false;
    portalsCalls.length = 0;
    assert.equal((await api.teleport(IDS.taloUser, { x: 1, y: 2 })).viewFollows, false, "a logged-out player's view cannot follow now");
    const offline = await api.teleport(IDS.taloUser, { x: 1, y: 2, scene: IDS.sceneC });
    assert.deepEqual(portalsCalls.map(c => c[1].pull), [[], []], "offline: no pull asked");
    assert.deepEqual([offline.ok, offline.viewFollows, offline.online, offline.warning], [true, false, false, undefined],
      "switch on, player offline, another scene: resume lands them on the token's scene at login, so no VIEW_UNCHANGED");
    game.users.get(IDS.taloUser).active = true;
    // a wild-shaped PC: its form token is the one moved
    const tok = B.tokens.get(IDS.taloTok);
    Object.assign(tok, { actorId: IDS.wolf, flags: { dnd5e: { originalActor: IDS.talo } } });
    portalsCalls.length = 0;
    assert.equal((await api.teleport(IDS.taloUser, { x: 5, y: 5 })).ok, true);
    assert.equal(portalsCalls[0][0], tok.uuid);
    Object.assign(tok, { actorId: IDS.talo, flags: {} });
  } finally {
    portalsPulled = null;
    game.users.get(IDS.taloUser).active = true;
    await setPinning(false);
  }
});

test("teleport onto another floor of the same scene: pins ALWAYS pulls, whatever the GM's lagging copy of the player's view says (code review G1)", async () => {
  installPortals();
  const talo = game.users.get(IDS.taloUser);
  const tok = B.tokens.get(IDS.taloTok);   // on Lighthouse, level B2
  const to = { x: 1, y: 2, level: IDS.levelB1 };
  const want = [IDS.sceneB, [IDS.taloUser], { level: IDS.levelB2, controlledTokens: [IDS.taloTok] }];   // the stub leaves the token on B2
  await setPinning(true);
  try {
    // the GM's copy says they view the token's origin floor, observe it and own nothing else sighted
    // there — core's level switch MAY move them, but that copy lags their draw (F1/CR2): never skip
    // the pull on it. Core's switch and this pull coexist: a view of what is drawn draws nothing, and
    // a pull dropped while loading is replayed only when it changes the view (follow.mjs).
    for (const [why, view] of [
      ["origin floor (core would switch)", { viewedScene: IDS.sceneB, viewedLevel: IDS.levelB2 }],
      ["another floor", { viewedScene: IDS.sceneB, viewedLevel: IDS.levelB1 }],
      ["peeking at another scene (N2b)", { viewedScene: IDS.sceneA, viewedLevel: null }],
      ["nothing known", { viewedScene: null, viewedLevel: null }],
    ]) {
      Object.assign(talo, view);
      F.pulls.length = 0;
      const r = await api.teleport(IDS.taloUser, to);
      assert.deepEqual([r.ok, r.viewFollows, r.warning], [true, true, undefined], why);
      assert.deepEqual(F.pulls, [want], `${why}: one pull, pins'`);
    }
  } finally {
    delete talo.viewedScene;
    delete talo.viewedLevel;
    tok.hidden = false;
    await setPinning(false);
  }
});

test("teleport's published row takes no `gather`: it is gather()'s own option for portals", async () => {
  installPortals();
  portalsCalls.length = 0;
  await api.teleport(IDS.taloUser, { x: 1, y: 2, scene: IDS.sceneC, gather: { later: [] } });
  assert.equal("gather" in portalsCalls[0][1], false, "a single move: portals' 10-ft rule");
  assert.equal((await api.teleport(IDS.taloUser, null)).ok, true, "null opts still work");
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

test("pin: switch on, an online player is pulled to their token's scene and level (core pullUsers), even 'there'; not off / offline / dryRun / a re-pin (CR9)", async () => {
  F.become({ userId: gm.id });
  const talo = game.users.get(IDS.taloUser);
  Object.assign(talo, { viewedScene: IDS.sceneA, viewedLevel: null });
  F.pulls.length = 0;
  const fresh = async () => { await api.unpin(IDS.taloUser); return api.pin(IDS.taloUser, { actor: IDS.talo }); };
  try {
    assert.equal((await fresh()).ok, true);
    assert.deepEqual(F.pulls, [], "switch off: no pull");
    await setPinning(true);
    await api.unpin(IDS.taloUser);
    assert.equal((await api.pin(IDS.taloUser, { actor: IDS.talo, dryRun: true })).ok, true);
    assert.deepEqual(F.pulls, [], "dryRun: no pull");
    assert.equal((await api.pin(IDS.taloUser, { actor: IDS.talo })).ok, true);
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], { level: IDS.levelB2, controlledTokens: [IDS.taloTok] }]]);
    // CR9: re-pinning the actor the player already has changes nothing, so it pulls nobody
    F.pulls.length = 0;
    const again = await api.pin(IDS.taloUser, { actor: IDS.talo });
    assert.deepEqual([again.ok, again.previous, F.pulls], [true, IDS.talo, []], "a re-pin of the same actor: no pull");
    Object.assign(talo, { viewedScene: IDS.sceneB, viewedLevel: IDS.levelB2 });
    await fresh();
    // the GM's copy of the view lags a draw in progress (review F1): pulled anyway; core draws nothing if so
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], { level: IDS.levelB2, controlledTokens: [IDS.taloTok] }]],
      "pulled even when the GM sees them on the token's scene and level");
    F.pulls.length = 0;
    Object.assign(talo, { viewedScene: IDS.sceneA, viewedLevel: null, active: false });
    await fresh();
    assert.deepEqual(F.pulls, [], "offline: resume puts them there at login");
    // a pullUsers that throws is logged; the pin itself stands
    talo.active = true;
    B.pullUsers = () => { throw new Error("socket closed"); };
    try {
      const r = await fresh();
      assert.equal(r.ok, true);
    } finally {
      delete B.pullUsers;   // the prototype's again
    }
  } finally {
    delete talo.viewedScene;
    delete talo.viewedLevel;
    talo.active = true;
    if (game.users.get(IDS.taloUser).flags?.[MODULE]?.actor !== IDS.talo) await api.pin(IDS.taloUser, { actor: IDS.talo });
    await setPinning(false);
  }
});

test("pinnedTokens (CR3): every pinned player's pinnedToken in one token walk; {} while off; GMs and unresolved pins absent", async () => {
  assert.deepEqual(api.pinnedTokens(), {}, "switch off");
  await setPinning(true);
  try {
    const all = api.pinnedTokens();
    assert.deepEqual(Object.keys(all), [IDS.taloUser], "only Talo's player is pinned in the fixture");
    assert.deepEqual(all[IDS.taloUser], api.pinnedToken(IDS.taloUser), "the same shape as pinnedToken");
    // one walk: tokensByRoots reads each scene's token collection once, whatever the number of pins
    await api.pin(IDS.miraUser, { actor: IDS.mira });
    let walks = 0;
    const scenes = game.scenes.contents;
    for (const sc of scenes) {
      Object.defineProperty(sc.tokens, "contents", { get() { walks += 1; return [...this.values()]; }, configurable: true });
    }
    let both, one;
    try {
      api.pinnedToken(IDS.taloUser);
      one = walks;
      walks = 0;
      both = api.pinnedTokens();
    } finally {
      for (const sc of scenes) delete sc.tokens.contents;   // the prototype's getter again
    }
    assert.deepEqual(Object.keys(both).sort(), [IDS.miraUser, IDS.taloUser].sort());
    assert.ok(one > 0);
    assert.equal(walks, one, "two pins cost what one pinnedToken costs: one pass over every scene");
    assert.equal(both[IDS.miraUser].scene, IDS.sceneA);
    // a second token for Talo: ambiguous, absent
    const extra = F.createToken(IDS.sceneC, { id: "taloExtra0000003", name: "Talo", actorId: IDS.talo });
    try {
      assert.deepEqual(Object.keys(api.pinnedTokens()), [IDS.miraUser]);
    } finally {
      C.tokens.delete(extra.id);
    }
  } finally {
    await api.unpin(IDS.miraUser);
    await setPinning(false);
  }
});

test("prePull (CR7): a pinned player whose character is on another scene is spliced out of portals' pull; never a veto; off → stock", async () => {
  const { dropPinnedElsewhere, install, PRE_PULL } = await import("../prepull.mjs");
  const { hookRegistry } = await import("../lib/hooks.mjs");
  const talo = game.users.get(IDS.taloUser), mira = game.users.get(IDS.miraUser), bot = game.users.get(IDS.bot);
  // the pure part: Talo's token is on B
  assert.deepEqual(dropPinnedElsewhere([talo, mira], { scene: C }, { enabled: false }), [], "switch off: stock");
  const list = [talo, mira, bot];
  assert.deepEqual(dropPinnedElsewhere(list, { scene: C }, { enabled: true }), [IDS.taloUser]);
  assert.deepEqual(list.map(u => u.id), [IDS.miraUser, IDS.bot], "spliced in place; unpinned and GMs stay");
  const here = [talo, mira];
  assert.deepEqual(dropPinnedElsewhere(here, { scene: IDS.sceneB }, { enabled: true }), [], "a scene id; their token is there");
  assert.equal(here.length, 2);
  // the wired listener, through core's Hooks.call: never false (no veto), the list mutated
  const reg = hookRegistry(MODULE, null);
  install(reg, { setting: k => k === "pinning", log: { debug() {} } });
  try {
    const users = [talo, mira];
    const res = Hooks.call(PRE_PULL, users, { scene: C, level: null, token: null, reason: "teleportParty" });
    assert.notEqual(res, false, "never vetoes the whole pull");
    assert.deepEqual(users.map(u => u.id), [IDS.miraUser]);
  } finally {
    reg.offAll();
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

/* ---------------------------------------------------------------------------------------------- */
/* gather (0.3.0, context/plans/pin-2026-10-gather.md §5.1 prePull rows, §5.2 G1–G11)              */
/* ---------------------------------------------------------------------------------------------- */

const G = GATHER_IDS;
const A = game.scenes.get(IDS.sceneA);

test("prePull gather clause (§3.4, code review G6): a carry made FOR a gather (portals passes the call's opts.gather on) drops every non-GM user; anything else keeps today's rule", async () => {
  const { install, PRE_PULL } = await import("../prepull.mjs");
  const { hookRegistry } = await import("../lib/hooks.mjs");
  const party = gatherParty();
  const ctx = { setting: k => k === "pinning" && on, log: { debug() {} } };
  let on = true;
  const reg = hookRegistry(MODULE, null);
  install(reg, ctx);
  const U = id => game.users.get(id);
  // Talo's token is on B (the destination below); Mira's on A (elsewhere); Ned unpinned; Claude a GM
  const everyone = () => [U(IDS.taloUser), U(IDS.miraUser), U(G.nedUser), U(IDS.bot)];
  const L = G.ashTok;
  const pull = (token, gather = null, scene = IDS.sceneB) => {
    const users = everyone();
    assert.notEqual(Hooks.call(PRE_PULL, users, { scene, level: null, token, reason: token ? "token" : "party", pull: [], gather }), false, "never a veto");
    return users.map(u => u.id);
  };
  const mark = { later: [] };
  try {
    assert.deepEqual(pull({ id: L }, mark), [IDS.bot], "a gather's carry: pinned-here, pinned-elsewhere and unpinned players all dropped; GMs stay");
    const doc = makeToken({ id: L, name: "Ash", actorId: G.ash }, B);   // the destination TokenDocument
    assert.deepEqual(pull(doc, { later: [{ user: IDS.miraUser, token: IDS.miraTok }] }), [IDS.bot], "any member's call (later not empty)");
    assert.deepEqual(pull({ id: L }), [IDS.taloUser, G.nedUser, IDS.bot], "the same token carried WITHOUT the gather mark (a portal hop meanwhile): today's rule");
    assert.deepEqual(pull(null), [IDS.taloUser, G.nedUser, IDS.bot], "a party pull (token null): today's rule");
    on = false;
    assert.deepEqual(pull({ id: L }, mark), [IDS.taloUser, IDS.miraUser, G.nedUser, IDS.bot], "switch off: nothing dropped");
  } finally {
    reg.offAll();
    party.restore();
  }
});

/** Every token's place, to put the world back after a gather the portals stub carried out. */
function snapshotTokens() {
  const where = [];
  for (const sc of game.scenes.contents) for (const t of sc.tokens.values()) where.push([t, sc, t.x, t.y, t.level]);
  return () => {
    for (const sc of game.scenes.contents) sc.tokens.clear();
    for (const [t, sc, x, y, level] of where) {
      Object.assign(t, { x, y, level });
      t.parent = sc;
      sc.tokens.set(t.id, t);
    }
  };
}

/**
 * A pentaryn-portals teleportToken stub that carries tokens out (keepId: a cross-scene move re-homes
 * the same object on the destination) and answers in teleportToken's shape. `plan[tokenId]` may give
 * `{ followers: [token…], held: [token…], pulled: [...], answer, throws, before, after }` for that leader's call
 * (`held`: shared companions portals left for a later gathered co-owner, reported on a gather call).
 */
const gcalls = [];
let gplan = {};
function installGatherPortals() {
  gcalls.length = 0;
  gplan = {};
  game.modules.set("pentaryn-portals", { id: "pentaryn-portals", active: true, api: {
    teleportToken: async (token, opts) => {
      gcalls.push([token.id, structuredClone(opts)]);
      const p = gplan[token.id] ?? {};
      await p.before?.(token, opts);
      if (p.throws) throw new Error(p.throws);
      if (p.answer) return p.answer;
      const from = token.parent.id;
      const dest = game.scenes.get(opts.scene ?? from);
      const cross = dest.id !== from;
      const company = [token, ...(p.followers ?? [])];
      if (!opts.dryRun) {
        for (const t of company) {
          if (t.parent !== dest) {
            t.parent.tokens.delete(t.id);
            t.parent = dest;
            dest.tokens.set(t.id, t);
          }
          Object.assign(t, { x: opts.x, y: opts.y, level: opts.level ?? null });
        }
      }
      await p.after?.(token, opts);
      const pulled = p.pulled ?? (opts.pull ?? []).map(id => ({ id, name: game.users.get(id)?.name ?? null }));
      return { ok: true, token: { documentName: "Token", id: token.id, uuid: token.uuid, name: token.name }, from,
        to: { scene: dest.id, x: opts.x, y: opts.y, level: opts.level ?? null },
        followers: (p.followers ?? []).map(t => ({ id: t.id, name: t.name })), moved: company.length,
        ...(opts.gather ? { held: (p.held ?? []).map(t => ({ id: t.id, name: t.name })) } : {}),
        ...(opts.dryRun ? { dryRun: true } : { pulled: cross ? pulled : [] }) };
    },
  } });
}

/** One gather test: the party, the switch on, the stub; everything put back after. */
async function withParty(fn) {
  const restoreTokens = snapshotTokens();
  const party = gatherParty();
  installGatherPortals();
  await setPinning(true);
  F.pulls.length = 0;
  try {
    await fn();
  } finally {
    await setPinning(false);
    F.endCombats();
    restoreTokens();
    party.restore();
    game.modules.delete("pentaryn-portals");
    F.become({ userId: gm.id });
  }
}
const TO = { x: 500, y: 500, scene: IDS.sceneB, level: IDS.levelB1 };

test("G1 gather: members in plan order, one teleport each at the same point and level; offline untouched; exact report; names survive toPlain", async () => {
  await withParty(async () => {
    const spirit = makeToken({ id: "spiritTok0000001", name: "Spirit", actorId: IDS.spirit, actorLink: false }, A);
    A.tokens.set(spirit.id, spirit);
    gplan[G.ashTok] = { followers: [spirit] };
    const olga = game.scenes.get(IDS.sceneC).tokens.get(G.olgaTok);
    audit.length = 0;
    const r = await api.gather(TO);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(gcalls, [
      [IDS.taloTok, { ...TO, pull: [IDS.taloUser], dryRun: false,
        gather: { later: [{ user: G.ashUser, token: G.ashTok }, { user: IDS.miraUser, token: IDS.miraTok }] } }],
      [G.ashTok, { ...TO, pull: [G.ashUser], dryRun: false, gather: { later: [{ user: IDS.miraUser, token: IDS.miraTok }] } }],
      [IDS.miraTok, { ...TO, pull: [IDS.miraUser], dryRun: false, gather: { later: [] } }],
    ], "same-scene member first, then by name; the same-scene one gets the gather's level, not its own; "
      + "each call names the members still to move (portals' shared-companion gather mode, §11)");
    assert.deepEqual(r.to, { scene: IDS.sceneB, x: 500, y: 500, level: IDS.levelB1 });
    assert.deepEqual(r.moved.map(m => [m.user.id, m.actor.name, m.token.id, m.from, m.viewFollows, m.warnings]), [
      [IDS.taloUser, "Talo", IDS.taloTok, IDS.sceneB, true, []],
      [G.ashUser, "Ash", G.ashTok, IDS.sceneA, true, []],
      [IDS.miraUser, "Mira", IDS.miraTok, IDS.sceneA, true, []],
    ]);
    assert.deepEqual(Object.keys(r.moved[0]).sort(), ["actor", "followers", "form", "from", "pulled", "token", "user", "viewFollows", "warnings"]);
    assert.deepEqual(r.skipped, [{ user: { id: G.nedUser, name: "Ned" }, actor: null, code: "NO_PIN", detail: null }]);
    assert.deepEqual(r.offline, [{ user: { id: G.olgaUser, name: "Olga" }, actor: { id: G.olga, name: "Olga's PC" } }]);
    assert.deepEqual(r.failed, []);
    assert.equal(r.warning, undefined);
    assert.equal(typeof r.moved[1].followers[0].name, "string", "toPlain kept the follower (depth 4)");
    assert.equal(r.moved[1].followers[0].name, "Spirit");
    assert.equal(typeof r.moved[1].pulled[0].id, "string", "toPlain kept the pulled user (depth 4)");
    assert.equal(r.moved[1].pulled[0].id, G.ashUser);
    assert.deepEqual([olga.parent.id, olga.x, olga.y], [IDS.sceneC, 0, 0], "the offline player's token is untouched");
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], { level: IDS.levelB1, controlledTokens: [IDS.taloTok] }]],
      "the same-scene member pulled once by pins (pullToPin), to the gather's level; portals pulls the others");
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r, "plain JSON");
    const lines = audit.filter(([l]) => l.startsWith(`${MODULE} |`)).map(([l, f]) => [l, f]);
    assert.deepEqual(lines.map(([l]) => l), [`${MODULE} | teleport`, `${MODULE} | teleport`, `${MODULE} | teleport`, `${MODULE} | gather`]);
    assert.deepEqual(lines[3][1], { uuid: `Scene.${IDS.sceneB}`, ids: [IDS.taloUser, G.ashUser, IDS.miraUser], by: gm.id });
  });
});

test("G2/G3 gather: a member REFUSED or throwing lands in failed; the rest still move; ok with warning PARTIAL", async () => {
  await withParty(async () => {
    gplan[G.ashTok] = { answer: { ok: false, code: "REFUSED", reason: "token id already on Lighthouse" } };
    const r = await api.gather(TO);
    assert.deepEqual([r.ok, r.warning], [true, "PARTIAL"]);
    assert.deepEqual(r.failed, [{ user: { id: G.ashUser, name: "Ash's player" }, actor: { id: G.ash, name: "Ash" }, code: "REFUSED",
      reason: "token id already on Lighthouse" }]);
    assert.deepEqual(r.moved.map(m => m.user.id), [IDS.taloUser, IDS.miraUser], "the third still moves");
  });
  await withParty(async () => {
    gplan[G.ashTok] = { throws: "socket closed" };
    const r = await api.gather(TO);
    assert.deepEqual([r.ok, r.warning, r.failed.map(f => [f.user.id, f.code])], [true, "PARTIAL", [[G.ashUser, "INTERNAL"]]]);
    assert.deepEqual(r.moved.map(m => m.user.id), [IDS.taloUser, IDS.miraUser], "the loop goes on after a throw");
  });
});

test("G4 gather dryRun: every call dryRun, nothing pulled or moved, result dryRun; no audit line", async () => {
  await withParty(async () => {
    audit.length = 0;
    const r = await api.gather({ ...TO, dryRun: true });
    assert.deepEqual([r.ok, r.dryRun], [true, true]);
    assert.ok(gcalls.length === 3 && gcalls.every(([, o]) => o.dryRun === true));
    assert.deepEqual(F.pulls, [], "no pullUsers");
    assert.equal(A.tokens.get(G.ashTok)?.parent?.id, IDS.sceneA, "nothing moved");
    assert.deepEqual(audit.filter(([l]) => l.startsWith(`${MODULE} |`)), [], "a dry run writes no audit line");
  });
});

test("G5 gather refusals: NOT_GM, REFUSED while off, BAD_ARGS, UNSUPPORTED; nothing moves", async () => {
  await withParty(async () => {
    F.become({ userId: IDS.taloUser });
    assert.equal((await api.gather(TO)).code, "NOT_GM");
    F.become({ userId: gm.id });
    await setPinning(false);
    const off = await api.gather(TO);
    assert.deepEqual([off.ok, off.code, off.reason], [false, "REFUSED", "pinning is off"]);
    await setPinning(true);
    assert.equal((await api.gather({ ...TO, x: Number.NaN })).code, "BAD_ARGS");
    assert.equal((await api.gather({ ...TO, y: "5" })).code, "BAD_ARGS");
    assert.equal((await api.gather({ ...TO, scene: "No Such Scene" })).code, "BAD_ARGS", "an unknown scene");
    assert.equal((await api.gather({ ...TO, level: "notALevel0000001" })).code, "BAD_ARGS", "a level not on the scene");
    Object.defineProperty(game.scenes, "current", { get: () => null, configurable: true });
    try {
      const none = await api.gather({ x: 1, y: 1 });
      assert.deepEqual([none.code, none.reason], ["BAD_ARGS", "no scene given and no current scene"]);
    } finally {
      delete game.scenes.current;
    }
    game.modules.delete("pentaryn-portals");
    assert.equal((await api.gather(TO)).code, "UNSUPPORTED");
    assert.deepEqual(gcalls, [], "no refusal moved anyone");
  });
});

test("G6 gather: level and scene resolution", async () => {
  await withParty(async () => {
    const levels = () => gcalls.map(([, o]) => [o.scene, o.level]);
    await api.gather(TO);
    assert.deepEqual(levels()[0], [IDS.sceneB, IDS.levelB1], "an explicit level, the same-scene member included");
    // the canvas scene: canvas.level
    gcalls.length = 0;
    Object.assign(canvas, { scene: B, level: F.level(IDS.levelB2) });
    await api.gather({ x: 1, y: 1, scene: IDS.sceneB });
    assert.ok(gcalls.length && gcalls.every(([, o]) => o.level === IDS.levelB2), "the canvas level on the canvas scene");
    // another scene: initialLevel, then firstLevel, then null
    Object.assign(canvas, { scene: null, level: null });
    const C = game.scenes.get(IDS.sceneC);
    const lastLevel = async () => { gcalls.length = 0; await api.gather({ x: 1, y: 1, scene: IDS.sceneC }); return gcalls.at(-1)[1].level; };
    C.initialLevel = { id: "lvlInitial000001" };
    C.firstLevel = { id: "lvlFirst00000001" };
    assert.equal(await lastLevel(), "lvlInitial000001");
    delete C.initialLevel;
    assert.equal(await lastLevel(), "lvlFirst00000001");
    delete C.firstLevel;
    assert.equal(await lastLevel(), null, "no levels: null");
    // scene omitted → game.scenes.current; by name too
    Object.defineProperty(game.scenes, "current", { get: () => C, configurable: true });
    try {
      gcalls.length = 0;
      const r = await api.gather({ x: 2, y: 3 });
      assert.equal(r.to.scene, IDS.sceneC);
      assert.ok(gcalls.every(([, o]) => o.scene === IDS.sceneC));
    } finally {
      delete game.scenes.current;
    }
    gcalls.length = 0;
    assert.equal((await api.gather({ x: 2, y: 3, scene: "Cave" })).to.scene, IDS.sceneC, "an exact scene name");
  });
});

test("G7 gather: a second gather while one runs is CONFLICT; busy is cleared after a throw", async () => {
  const { PRE_PULL } = await import("../prepull.mjs");
  await withParty(async () => {
    let release = () => {}, held = false;
    // the first call only is held (a second gather that wrongly ran must not hang the suite)
    gplan[IDS.taloTok] = { before: () => (held ? null : (held = true, new Promise(r => { release = r; }))) };
    const first = api.gather(TO);
    await new Promise(r => setImmediate(r));
    const second = await api.gather(TO);
    assert.deepEqual([second.ok, second.code, second.reason], [false, "CONFLICT", "a gather is already running"]);
    release();
    assert.equal((await first).ok, true);
    gplan = {};   // no more held calls: a regression below fails instead of hanging
    // a throw before the loop (the combat read): INTERNAL, and the next gather runs
    const combats = Object.getOwnPropertyDescriptor(game, "combats");
    Object.defineProperty(game, "combats", { get() { throw new Error("combats unreadable"); }, configurable: true });
    try {
      const r = await api.gather(TO);
      assert.deepEqual([r.ok, r.code], [false, "INTERNAL"]);
    } finally {
      Object.defineProperty(game, "combats", combats);
    }
    // a throw INSIDE the loop: busy still cleared
    const realGet = game.users.get.bind(game.users);
    let boom = true;
    game.users.get = id => { if (boom && id === G.ashUser) throw new Error("users unreadable"); return realGet(id); };
    try {
      const r = await api.gather(TO);
      assert.equal(r.ok, true, "a member whose user cannot be read fails alone");
      assert.equal(r.failed.find(f => f.user.id === G.ashUser)?.code, "INTERNAL");
    } finally {
      boom = false;
      delete game.users.get;
    }
    gcalls.length = 0;
    const again = await api.gather(TO);
    assert.equal(again.ok, true, "not stuck on busy");
    // no gather state outlives a gather: a carry of a member's token keeps today's rule (the unpinned observer stays)
    const users = [game.users.get(G.nedUser)];
    Hooks.call(PRE_PULL, users, { scene: IDS.sceneB, level: null, token: { id: IDS.taloTok }, reason: "token", pull: [] });
    assert.deepEqual(users.map(u => u.id), [G.nedUser], "nothing left behind");
  });
});

test("G8 gather: a later member's carry does not pull an earlier member or an unpinned observer; after the gather, it would", async () => {
  const { PRE_PULL } = await import("../prepull.mjs");
  await withParty(async () => {
    let seen = null;
    // portals' prePull carries the call's opts.gather (code review G6): the stub fires it as portals does
    const fire = (token, gather = null) => {
      const users = [game.users.get(G.ashUser), game.users.get(G.nedUser), game.users.get(IDS.bot)];
      Hooks.call(PRE_PULL, users, { scene: IDS.sceneB, level: IDS.levelB1, token, reason: "token", pull: [IDS.miraUser], gather });
      return users.map(u => u.id);
    };
    // Mira's carry, after Ash's: core's rule would pick Ash (watching Mira) and Ned (unpinned, watching)
    gplan[IDS.miraTok] = { after: (token, opts) => { seen = fire(B.tokens.get(token.id), opts.gather); } };
    const r = await api.gather(TO);
    assert.equal(r.ok, true);
    assert.deepEqual(seen, [IDS.bot], "Ash (already gathered) and Ned (unpinned) dropped; the GM stays");
    assert.deepEqual(fire(B.tokens.get(IDS.miraTok)), [G.ashUser, G.nedUser, IDS.bot], "after the gather: today's rule (Ash's token is on B)");
  });
});

test("G6 (code review) the gather clause is scoped to the gather's own carries: an unrelated prePull on a member's token DURING a gather keeps today's rule", async () => {
  const { PRE_PULL } = await import("../prepull.mjs");
  await withParty(async () => {
    let seen = null;
    // while Mira's move is in flight (the gather still running), another carry of Ash's token (a portal
    // hop: no opts.gather) fires prePull: Ned, unpinned and watching, is core's rule's pick — he stays
    gplan[IDS.miraTok] = { before: () => {
      const users = [game.users.get(G.nedUser), game.users.get(IDS.bot)];
      Hooks.call(PRE_PULL, users, { scene: IDS.sceneB, level: null, token: B.tokens.get(G.ashTok) ?? { id: G.ashTok }, reason: "token", pull: [] });
      seen = users.map(u => u.id);
    } };
    const r = await api.gather(TO);
    assert.equal(r.ok, true);
    assert.deepEqual(seen, [G.nedUser, IDS.bot], "not the gather's carry: nothing dropped");
  });
});

test("G5 (code review) a shared companion held for a later co-owner whose move FAILS is carried with the last owner that moved; one that moved with the later owner is not carried twice", async () => {
  // a steed Ash's and Mira's players co-own, on A: Ash moves first and portals holds it for Mira
  const steedOn = () => {
    const steed = makeToken({ id: "steedTok00000001", name: "Steed", actorId: IDS.spirit, actorLink: false }, A);
    A.tokens.set(steed.id, steed);
    return steed;
  };
  await withParty(async () => {
    const steed = steedOn();
    gplan[G.ashTok] = { held: [steed] };
    gplan[IDS.miraTok] = { answer: { ok: false, code: "REFUSED", reason: "token id already on Lighthouse" } };
    const r = await api.gather(TO);
    assert.deepEqual([r.ok, r.warning], [true, "PARTIAL"]);
    assert.deepEqual(r.failed.map(f => f.user.id), [IDS.miraUser], "Mira's move failed");
    const ash = B.tokens.get(G.ashTok);
    assert.deepEqual(gcalls.map(([id]) => id), [IDS.taloTok, G.ashTok, IDS.miraTok, steed.id], "then the held steed alone");
    const [, o] = gcalls[3];
    assert.deepEqual(o, { x: ash.x + 50, y: ash.y + 50, scene: IDS.sceneB, level: IDS.levelB1, pull: [], dryRun: false, gather: { later: [] } },
      "beside Ash (the centre of Ash's landed token), the gather's level; pulls nobody");
    assert.equal(steed.parent.id, IDS.sceneB, "the steed came");
    assert.deepEqual(r.moved.find(m => m.user.id === G.ashUser).followers.map(f => f.name), ["Steed"], "reported with Ash, its last owner that moved");
  });
  await withParty(async () => {
    const steed = steedOn();
    gplan[G.ashTok] = { held: [steed] };
    gplan[IDS.miraTok] = { followers: [steed] };   // Mira's move takes it, as portals does for the last co-owner
    const r = await api.gather(TO);
    assert.deepEqual([r.ok, r.warning], [true, undefined]);
    assert.deepEqual(gcalls.map(([id]) => id), [IDS.taloTok, G.ashTok, IDS.miraTok], "no extra carry");
    assert.deepEqual(r.moved.find(m => m.user.id === IDS.miraUser).followers.map(f => f.name), ["Steed"]);
  });
  await withParty(async () => {
    const steed = steedOn();
    gplan[G.ashTok] = { held: [steed] };
    gplan[IDS.miraTok] = { throws: "socket closed" };
    gplan[steed.id] = { answer: { ok: false, code: "CONFLICT", reason: "another session moved it first" } };
    const r = await api.gather(TO);
    assert.deepEqual(r.failed.map(f => [f.user.id, f.actor?.name, f.code]), [[IDS.miraUser, "Mira", "INTERNAL"], [G.ashUser, "Steed", "CONFLICT"]],
      "the held companion's own carry failing is reported, under the owner it waited with");
    assert.equal(steed.parent.id, IDS.sceneA, "it stays");
  });
});

test("G7 (code review) a gather makes ONE token walk, whatever the number of members (a same-scene member's pull included)", async () => {
  const walks = () => {
    let n = 0;
    const scenes = game.scenes.contents;
    for (const sc of scenes) Object.defineProperty(sc.tokens, "contents", { get() { n += 1; return [...this.values()]; }, configurable: true });
    return { count: () => n, done: () => { for (const sc of scenes) delete sc.tokens.contents; } };
  };
  await withParty(async () => {
    const w = walks();
    let one;
    try {
      tokensWalk();
      one = w.count();
      const r = await api.gather(TO);
      assert.equal(r.moved.length, 3);
      assert.equal(w.count() - one, one, "one pass over every scene for three members");
    } finally {
      w.done();
    }
  });
  function tokensWalk() { api.pins(); }
});

test("G9 gather: COMBAT from the pre-loop snapshot, even when the move deletes the combatants; a same-scene member never", async () => {
  await withParty(async () => {
    const pet = makeToken({ id: "ashPetTok0000001", name: "Pet", actorId: IDS.spirit, actorLink: false }, A);
    A.tokens.set(pet.id, pet);
    F.startCombat({ round: 1, scene: null, combatants: [{ sceneId: IDS.sceneA, tokenId: pet.id }, { sceneId: IDS.sceneB, tokenId: IDS.taloTok }] });
    // core deletes the carried tokens' combatants inside the move (unawaited on the GM's client)
    gplan[G.ashTok] = { followers: [pet], after: () => F.endCombats() };
    const dry = await api.gather({ ...TO, dryRun: true });
    assert.deepEqual(dry.moved.map(m => [m.user.id, m.warnings]), [[IDS.taloUser, []], [G.ashUser, ["COMBAT"]], [IDS.miraUser, []]],
      "a dry run reads the same snapshot (nothing deleted: the stub does not move on a dry run)");
    F.startCombat({ round: 1, scene: null, combatants: [{ sceneId: IDS.sceneA, tokenId: pet.id }, { sceneId: IDS.sceneB, tokenId: IDS.taloTok }] });
    const r = await api.gather(TO);
    assert.deepEqual(r.moved.map(m => [m.user.id, m.warnings]), [[IDS.taloUser, []], [G.ashUser, ["COMBAT"]], [IDS.miraUser, []]],
      "Ash's pet was in a started combat on A: marked; Talo is in combat but moved on his own scene: not marked");
  });
});

test("G10 gather: a member's token carried in an earlier member's company is moved again same-scene, from = D, pulled once", async () => {
  await withParty(async () => {
    // Mira's token is carriable (not isPC) and every owner owns Ash: it rides in Ash's company
    gplan[G.ashTok] = { followers: [A.tokens.get(IDS.miraTok)] };
    const r = await api.gather(TO);
    assert.equal(r.ok, true);
    const mira = r.moved.find(m => m.user.id === IDS.miraUser);
    assert.equal(mira.from, IDS.sceneB, "Mira's own call found her token already on the destination");
    assert.deepEqual(gcalls.map(([id]) => id), [IDS.taloTok, G.ashTok, IDS.miraTok]);
    const miraPulls = F.pulls.filter(([, ids]) => ids.includes(IDS.miraUser));
    assert.equal(miraPulls.length, 1, "Mira pulled once (pins' same-scene pull); Ash's carry pulled only Ash");
    assert.deepEqual(r.moved.find(m => m.user.id === G.ashUser).pulled.map(u => u.id), [G.ashUser]);
  });
});

test("G11 gather: teleport's VIEW_UNCHANGED folds into that member's warnings; UNLINKED / NOT_OWNER ride along", async () => {
  await withParty(async () => {
    gplan[G.ashTok] = { pulled: [] };            // portals pulled nobody for Ash
    const miraTok = A.tokens.get(IDS.miraTok);
    miraTok.actorLink = false;                   // an unlinked pinned token: moved, with a warning
    const ash = game.actors.get(G.ash);
    ash.ownership = { default: 0 };              // Ash's player cannot observe Ash: NOT_OWNER
    try {
      const r = await api.gather(TO);
      assert.deepEqual(r.moved.map(m => [m.user.id, m.warnings]), [
        [IDS.taloUser, []], [G.ashUser, ["NOT_OWNER", "VIEW_UNCHANGED"]], [IDS.miraUser, ["UNLINKED"]]]);
    } finally {
      miraTok.actorLink = true;
    }
  });
});

test("gather: nobody to gather → ok with warning NOBODY and no teleport", async () => {
  await withParty(async () => {
    for (const id of [IDS.taloUser, IDS.miraUser, G.ashUser]) game.users.get(id).active = false;
    try {
      const r = await api.gather(TO);
      assert.deepEqual([r.ok, r.warning, r.moved, gcalls.length], [true, "NOBODY", [], 0]);
      assert.equal(r.offline.length, 4);
    } finally {
      for (const id of [IDS.taloUser, IDS.miraUser, G.ashUser]) game.users.get(id).active = true;
    }
  });
});

test("selftest: 'prePull listener registered' (gather depends on it)", () => {
  installPortals();
  try {
    const check = api.selftest().checks.find(c => c.label === "prePull listener registered");
    assert.equal(check?.ok, true, JSON.stringify(api.selftest().checks));
  } finally {
    game.modules.delete("pentaryn-portals");
  }
});
