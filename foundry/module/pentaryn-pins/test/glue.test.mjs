// Glue: the stub world, the entry loaded as Foundry would, and what pins adds on a pinned PLAYER
// client after the 0.2.0 rebuild (context/plans/pin-2026-10-rebuild.md §5, §6, §8.2): the one
// Scene#_onActivate patch, the deleteToken safety net, the moveToken level gap-filler, the replay of
// a pull core dropped while loading, the switch-on pull and the GM watch toasts. Effects are pinned,
// not returns: the ORIGINAL Scene#view / _onActivate / pullUsers calls the stub recorded (F.views,
// F.activations, F.pulls), toasts, and emitted hooks. Scene#view itself is core's own again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, flush, pinsWorld } from "./fixtures/actors.mjs";
import { makeToken } from "./kit/foundry-stub.mjs";
import { HOOKS, MODULE, NET_GRACE_MS, NET_POLL_MS, NS } from "../pins-core.mjs";

const F = await pinsWorld(MODULE, { settings: { [`${MODULE}.pinning`]: true } });
const consoleLines = [];
for (const level of ["warn", "error"]) console[level] = (...args) => consoleLines.push([level, String(args[0])]);
console.info = () => undefined;

const A = game.scenes.get(IDS.sceneA), B = game.scenes.get(IDS.sceneB), C = game.scenes.get(IDS.sceneC);
const followed = [];
Hooks.on(HOOKS.followed.name, e => followed.push(e));

F.become({ userId: IDS.taloUser });
await import("../pins.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const loadingToasts = () => F.calls.filter(c => c.op === "notify" && /cannot switch Scenes/.test(c.message));
const toasts = () => F.calls.filter(c => c.op === "notify").map(c => c.message);
const isTalo = t => [IDS.talo, IDS.wolf].includes(t.actorId) || t.flags?.dnd5e?.originalActor === IDS.talo;
/** Talo's tokens: his own, and the Wolf form's (dnd5e names the original on the form actor). */
const taloTok = () => game.scenes.contents.flatMap(s => s.tokens.contents).filter(isTalo);
const reset = () => {
  F.views.length = 0;
  F.activations.length = 0;
  F.unviews.length = 0;
  F.pulls.length = 0;
  F.calls.length = 0;
  followed.length = 0;
};
/** The options of a view pins starts itself: the pinned token controlled (Talo owns it in the fixture). */
const ctl = (level = null, id = IDS.taloTok) => ({ controlledTokens: [id], ...(level ? { level } : {}) });
/** Put this client on a scene and level without a draw. */
const at = (scene, level = null) => Object.assign(canvas, { scene, level: level ? F.level(level) : null, loading: false, ready: true });
const row = () => game.settings.settings.get(`${MODULE}.pinning`);
async function setPinning(value) {
  const r = row();
  const onChange = r.onChange;
  r.onChange = undefined;
  await game.settings.set(MODULE, "pinning", value);
  r.onChange = onChange;
}
/** Back to the fixture: Talo's one token on B at B2 (no hooks). */
function restoreTalo() {
  for (const s of game.scenes.contents) for (const t of [...s.tokens.contents]) if (isTalo(t)) s.tokens.delete(t.id);
  const tok = makeToken({ id: IDS.taloTok, name: "Talo", actorId: IDS.talo, actorLink: true, level: IDS.levelB2, x: 500, y: 500 }, B);
  tok.collection = B.tokens;
  B.tokens.set(tok.id, tok);
  return tok;
}
/** Talo's only token moved to `sceneId` the carryTo way: keepId create there, plain delete here. */
function carryTalo(sceneId, data = {}) {
  const [old] = taloTok();
  const created = F.createToken(sceneId, { id: old.id, name: "Talo", actorId: old.actorId, flags: structuredClone(old.flags ?? {}), level: null, ...data });
  F.deleteToken(old);
  return created;
}
/** The GM's cut-and-paste (placeables-layer.mjs:925-947): keepId create on the target, delete WITH replacements. */
function cutPaste(sceneId, data = {}) {
  const [old] = taloTok();
  const created = F.createToken(sceneId, { id: old.id, name: "Talo", actorId: old.actorId, level: null, ...data });
  F.deleteToken(old, { replacements: { [old.id]: created.uuid } });
  return created;
}
/** A moveToken as core fires it after a level change was applied (token.mjs:2885-2887). */
function moveLevel(tok, to, { user = game.users.get(IDS.gm), method = "api", ended = Promise.resolve() } = {}) {
  const from = tok.level;
  tok.level = to;
  F.fire("moveToken", tok, { origin: { level: from }, destination: { level: to }, method, animation: { ended } }, {}, user);
}
/** Talo's sighted pet, owned by Talo's player, standing on `level` of B. */
function addPet(level = IDS.levelB2) {
  const pet = makeToken({ id: "spiritPetB000001", name: "Spirit", actorId: IDS.spirit, level, ownership: { default: 0, [IDS.taloUser]: 3 } }, B);
  pet.collection = B.tokens;
  B.tokens.set(pet.id, pet);
  return pet;
}

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") {
    assert.equal(F.utilsSource, "foundry", "set FOUNDRY_APP_ROOT to the app's resources/app, or PENTARYN_TEST_SHIMS=1");
  }
});

test("one patch: Scene#_onActivate is wrapped, Scene#view is core's own; one pullToScene listener; published", () => {
  assert.equal(B._onActivate.__pentarynPinsActivate, true);
  assert.equal(B.view.__pentarynPinsView, undefined, "no Scene#view patch since 0.2.0");
  assert.equal(F.socketListeners("pullToScene"), 1);
  assert.equal(game.pentaryn[NS], game.modules.get(MODULE).api);
  assert.deepEqual(F.listeners("canvasReady"), 1, "only the canvas menu's: pins has no canvasReady login path");
});

test("2 switch off: activation, pulls, nav clicks, deletes and moves are all stock; no timer fires", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await setPinning(false);
  try {
    reset();
    at(B, IDS.levelB2);
    C._onActivate(true, { viewOptions: { a: 1 } });
    await flush();
    assert.deepEqual(F.activations, [[IDS.sceneC, true]]);
    assert.deepEqual(F.views, [[IDS.sceneC, { a: 1 }]]);
    reset();
    at(B, IDS.levelB2);
    canvas.loading = true;
    F.socketFire("pullToScene", IDS.sceneA, {});    // dropped by core, as stock
    canvas.loading = false;
    cutPaste(IDS.sceneC);
    restoreTalo();
    addPet();
    moveLevel(taloTok()[0], IDS.levelB1);
    await flush();
    t.mock.timers.tick(NET_GRACE_MS * 4);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneA, {}]], "only core's own (dropped) view");
    assert.equal(loadingToasts().length, 1, "core's toast, as stock");
    assert.deepEqual([followed, F.pulls], [[], []]);
  } finally {
    B.tokens.delete("spiritPetB000001");
    restoreTalo();
    await setPinning(true);
  }
});

test("3 activation: another scene is skipped; deactivating the viewed token scene is skipped; unview still runs", async () => {
  reset();
  at(B, IDS.levelB2);
  C._onActivate(true, { viewOptions: {} });
  B._onActivate(false, {});
  await flush();
  assert.deepEqual([F.activations, F.views, F.unviews], [[], [], []]);
  assert.deepEqual(followed, [], "a skipped activation emits nothing");
  B.unview();                                       // Scene#_onDelete / level deletion: not patched
  assert.deepEqual(F.unviews, [IDS.sceneB]);
  at(B, IDS.levelB2);
});

test("N11 (R3) activating the token's scene while the player looks elsewhere views the token's level, controlled; viewing it → untouched", async () => {
  reset();
  at(A);
  B._onActivate(true, { viewOptions: { transition: "fade" } });
  await flush();
  assert.deepEqual(F.activations, [[IDS.sceneB, true]]);
  assert.deepEqual(F.views, [[IDS.sceneB, { transition: "fade", ...ctl(IDS.levelB2) }]]);
  assert.equal(canvas.level?.id, IDS.levelB2);
  reset();
  at(B, IDS.levelB1);                               // the player looks at another floor of the token's scene
  B._onActivate(true, { viewOptions: { level: IDS.levelB1 } });
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB1 }]], "no draw happens anyway: core gets the operation as sent");
  assert.deepEqual(followed, []);
  at(B, IDS.levelB2);
});

test("N1 a GM pullToScene of a pinned player is honoured as asked: no redirect, nothing later", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  reset();
  at(B, IDS.levelB2);
  F.socketFire("pullToScene", IDS.sceneC, { controlledTokens: ["someoneOnC000001"] });
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneC, { controlledTokens: ["someoneOnC000001"] }]]);
  assert.equal(canvas.scene, C);
  F.socketFire("pullToScene", IDS.sceneB, { level: IDS.levelB1 });   // the nav's "pull to level" on B1
  await flush();
  t.mock.timers.tick(NET_GRACE_MS * 4);
  await flush();
  assert.deepEqual(F.views.at(-1), [IDS.sceneB, { level: IDS.levelB1 }], "the pulled level, not the token's (the move primitive)");
  assert.equal(F.views.length, 2);
  assert.equal(canvas.level?.id, IDS.levelB1);
  assert.deepEqual([followed, loadingToasts()], [[], []]);
  at(B, IDS.levelB2);
});

test("N2 a nav click on another scene passes (a peek); canvasReady adds nothing", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  reset();
  at(B, IDS.levelB2);
  await C.view({});
  assert.equal(F.fireCall("canvasReady", canvas), true, "never vetoes");
  t.mock.timers.tick(NET_GRACE_MS * 4);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneC, {}]]);
  assert.equal(canvas.scene, C);
  assert.deepEqual([followed, toasts()], [[], []], "no redirect, no 'Your view follows' note");
  at(B, IDS.levelB2);
});

test("N2b (review F1) a peeking player + a same-scene teleport: the GM's teleport pulls them back; nothing else would", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const talo = game.users.get(IDS.taloUser);
  const moved = [];
  // portals' same-scene moveOnScene: the token moves on B, no pull (portals pulls only across scenes)
  game.modules.set("pentaryn-portals", { id: "pentaryn-portals", active: true, api: {
    teleportToken: async (token, opts) => {
      moved.push(token.id);
      Object.assign(token, { x: opts.x, y: opts.y });
      return { ok: true, token: { id: token.id, uuid: token.uuid }, from: token.parent.id,
        to: { scene: token.parent.id, x: opts.x, y: opts.y, level: token.level }, followers: [], moved: 1, pulled: [] };
    },
  } });
  try {
    // the player's client, peeking at A: the move on B (not viewed) reaches nobody on its own
    reset();
    at(A);
    moveLevel(taloTok()[0], IDS.levelB2);
    await flush();
    t.mock.timers.tick(NET_GRACE_MS * 4);
    await flush();
    assert.deepEqual(F.views, [], "core's movement handler and the gap-filler skip a scene not viewed");
    // the GM's client: the menu's Teleport on B → teleportToken, then pins pulls the peeking player
    F.become({ userId: IDS.gm });
    Object.assign(talo, { viewedScene: IDS.sceneA, viewedLevel: null });
    const res = await game.pentaryn[NS].teleport(IDS.taloUser, { x: 700, y: 700 });
    assert.deepEqual([res.ok, res.viewFollows, moved], [true, true, [IDS.taloTok]]);
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], ctl(IDS.levelB2)]]);
    // that pull reaching the player: core's own handler views B at the token's level, the token controlled
    F.become({ userId: IDS.taloUser });
    F.socketFire("pullToScene", ...F.pulls[0].filter((_, i) => i !== 1));
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]]);
    assert.deepEqual([canvas.scene, canvas.level?.id], [B, IDS.levelB2]);
  } finally {
    game.modules.delete("pentaryn-portals");
    delete talo.viewedScene;
    delete talo.viewedLevel;
    F.become({ userId: IDS.taloUser });
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N3 a GM cut-and-paste across scenes: nothing before NET_GRACE_MS, then one view with { level, controlledTokens }", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    cutPaste(IDS.sceneC);
    t.mock.timers.tick(NET_GRACE_MS - 1);
    await flush();
    assert.deepEqual(F.views, [], "the mover's pull gets the grace window first");
    t.mock.timers.tick(1);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneC, ctl()]]);
    assert.deepEqual(followed, [{ scene: IDS.sceneC, level: null, reason: "cut" }]);
    // and back onto a floor of B
    reset();
    cutPaste(IDS.sceneB, { level: IDS.levelB1 });
    t.mock.timers.tick(NET_GRACE_MS);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB1)]]);
    assert.deepEqual(followed.map(f => f.reason), ["cut"]);
    assert.deepEqual(loadingToasts(), []);
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N4 the mover's pull lands inside the grace window: no second view, no loading toast", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    const moved = cutPaste(IDS.sceneC);
    F.socketFire("pullToScene", IDS.sceneC, { controlledTokens: [moved.id] });   // portals / core's region pull
    await flush();
    t.mock.timers.tick(NET_GRACE_MS * 2);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneC, { controlledTokens: [moved.id] }]]);
    assert.deepEqual([followed, loadingToasts()], [[], []]);
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N5 (R1) loading when the net looks: no view then; once loading clears, one re-check (elsewhere → view; there → nothing)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    cutPaste(IDS.sceneC);
    canvas.loading = true;                          // a slow draw (the player's own peek, an earlier move's pull)
    t.mock.timers.tick(NET_GRACE_MS);
    for (let i = 0; i < 40; i++) t.mock.timers.tick(NET_POLL_MS);   // 10 s of loading: no give-up
    await flush();
    assert.deepEqual(F.views, [], "nothing reaches core while it loads");
    canvas.loading = false;
    t.mock.timers.tick(NET_POLL_MS);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneC, ctl()]]);
    assert.deepEqual(loadingToasts(), []);
    // the draw that was loading WAS the move's pull: already there when it ends → nothing
    restoreTalo();
    reset();
    at(B, IDS.levelB2);
    cutPaste(IDS.sceneC);
    canvas.loading = true;
    t.mock.timers.tick(NET_GRACE_MS);
    at(C);                                          // that draw landed on C (loading cleared)
    t.mock.timers.tick(NET_POLL_MS);
    await flush();
    assert.deepEqual(F.views, []);
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N5b (R5) same scene: a copy on another level, the original deleted → one view({ level })", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    const [orig] = taloTok();
    const copy = F.createToken(IDS.sceneB, { id: "taloMoveB1000001", name: "Talo", actorId: IDS.talo, level: IDS.levelB1 });
    F.deleteToken(orig, { replacements: { [orig.id]: copy.uuid } });
    t.mock.timers.tick(NET_GRACE_MS);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB1, copy.id)]]);
    assert.equal(canvas.level?.id, IDS.levelB1);
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N5c (CR5) same scene, same level: the token deleted and replaced while the player views another floor → nothing (their choice stands)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB1);                              // the player went upstairs to look; the token stays on B2
    const [orig] = taloTok();
    const copy = F.createToken(IDS.sceneB, { id: "taloSameB2000001", name: "Talo", actorId: IDS.talo, level: IDS.levelB2 });
    F.deleteToken(orig, { replacements: { [orig.id]: copy.uuid } });
    t.mock.timers.tick(NET_GRACE_MS * 2);
    await flush();
    assert.deepEqual(F.views, [], "the token's level did not change: no level forced");
    assert.equal(canvas.level?.id, IDS.levelB1);
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N6 the deleted token was not on the viewed scene (a peek): no timer, never yanked", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(A);
    cutPaste(IDS.sceneC);
    t.mock.timers.tick(NET_GRACE_MS * 4);
    await flush();
    assert.deepEqual([F.views, followed], [[], []]);
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N8 the net's target on an orphan level (an id its scene no longer has): viewed by scene only", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    cutPaste(IDS.sceneC);
    t.mock.timers.tick(NET_GRACE_MS);
    await flush();
    reset();
    cutPaste(IDS.sceneB, { level: "orphanLevel00001" });
    t.mock.timers.tick(NET_GRACE_MS);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, ctl()]], "no level asked: core draws its initial level");
    canvas.level = F.level(IDS.levelB1);
    t.mock.timers.tick(NET_GRACE_MS * 4);
    await flush();
    assert.equal(F.views.length, 1, "no redraw loop");
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("8 the token is deleted with nothing left: no view, the player stays; an activation then moves them as stock (the Stranded toast says so, minor (b))", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    F.deleteToken(taloTok()[0]);
    t.mock.timers.tick(NET_GRACE_MS * 4);
    await flush();
    assert.deepEqual(F.views, []);
    assert.equal(canvas.scene, B);
    await C.view({});                               // no token: stock
    assert.deepEqual(F.views, [[IDS.sceneC, {}]]);
    at(B, IDS.levelB2);
    F.views.length = 0;
    F.activations.length = 0;
    A._onActivate(true, { viewOptions: {} });       // Stranded: no target, so the activation is core's
    await flush();
    assert.deepEqual([F.activations, F.views.map(v => v[0])], [[[IDS.sceneA, true]], [IDS.sceneA]], "stock activation");
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("9 two tokens, not mid-move: stock behaviour (activation of another scene runs)", async () => {
  const extra = F.createToken(IDS.sceneA, { id: "taloTwoA00000001", name: "Talo", actorId: IDS.talo });
  try {
    reset();
    at(C);
    C._onActivate(true, { viewOptions: { x: 1 } });
    await flush();
    assert.deepEqual(F.activations, [[IDS.sceneC, true]], "ambiguous: core does what it was asked");
  } finally {
    A.tokens.delete(extra.id);
    at(B, IDS.levelB2);
  }
});

test("9b deleting the copy the player views sends them to the one left, after NET_GRACE_MS; deleting a copy elsewhere does nothing", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(C);
    const copy = F.createToken(IDS.sceneC, { id: "taloCopyC0000001", name: "Talo", actorId: IDS.talo });
    F.deleteToken(copy);
    t.mock.timers.tick(NET_GRACE_MS);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]], "sent to the token that is left");
    assert.deepEqual(followed.map(f => f.reason), ["cut"]);
    reset();
    const copy2 = F.createToken(IDS.sceneC, { id: "taloCopyC0000002", name: "Talo", actorId: IDS.talo });
    F.deleteToken(copy2);                           // the player is on the original's scene
    t.mock.timers.tick(NET_GRACE_MS * 2);
    await flush();
    assert.deepEqual(F.views, []);
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N7 level gap: core would switch → pins nothing; a sighted pet left on the origin level → one view; a self drag → nothing", async () => {
  try {
    reset();
    at(B, IDS.levelB2);
    moveLevel(taloTok()[0], IDS.levelB1);           // core's #handleMovementOperation switches this client
    await flush();
    assert.deepEqual(F.views, [], "core does it: never both");
    taloTok()[0].level = IDS.levelB2;
    // a pet with sight stays on B2: core will not switch, pins does
    addPet(IDS.levelB2);
    reset();
    moveLevel(taloTok()[0], IDS.levelB1);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB1)]]);
    assert.deepEqual(followed, [{ scene: IDS.sceneB, level: IDS.levelB1, reason: "level" }]);
    // the player drags their own token (core's self-move clause switches)
    taloTok()[0].level = IDS.levelB2;
    at(B, IDS.levelB2);
    reset();
    moveLevel(taloTok()[0], IDS.levelB1, { user: game.users.get(IDS.taloUser), method: "dragging" });
    await flush();
    assert.deepEqual(F.views, [], "a self drag: core switches");
    // the player was already looking at the destination floor: nothing to do
    taloTok()[0].level = IDS.levelB2;
    at(B, IDS.levelB1);
    reset();
    moveLevel(taloTok()[0], IDS.levelB1);
    await flush();
    assert.deepEqual(F.views, []);
  } finally {
    B.tokens.delete("spiritPetB000001");
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N7 (R7) decided after the animation: the pet moved away meanwhile → core switches, pins does nothing", async () => {
  try {
    reset();
    at(B, IDS.levelB2);
    const pet = addPet(IDS.levelB2);
    let end;
    const ended = new Promise(r => { end = r; });
    moveLevel(taloTok()[0], IDS.levelB1, { ended });
    await flush();
    assert.deepEqual(F.views, [], "waits for the animation, as core does");
    pet.level = IDS.levelB1;                        // carried along during the animation
    end();
    await flush();
    assert.deepEqual(F.views, []);
    // and the other way round: the pet arrives on the origin level during the animation → pins views
    taloTok()[0].level = IDS.levelB2;
    pet.level = IDS.levelB1;
    reset();
    let end2;
    moveLevel(taloTok()[0], IDS.levelB1, { ended: new Promise(r => { end2 = r; }) });
    await flush();
    pet.level = IDS.levelB2;
    end2();
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB1)]]);
  } finally {
    B.tokens.delete("spiritPetB000001");
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N7 a draw already loading when pins decides: the level view waits for it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    addPet(IDS.levelB2);
    let end;
    moveLevel(taloTok()[0], IDS.levelB1, { ended: new Promise(r => { end = r; }) });
    await flush();
    canvas.loading = true;
    end();
    await flush();
    t.mock.timers.tick(NET_POLL_MS * 4);
    await flush();
    assert.deepEqual(F.views, []);
    canvas.loading = false;
    t.mock.timers.tick(NET_POLL_MS);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB1)]]);
    assert.deepEqual(loadingToasts(), []);
  } finally {
    B.tokens.delete("spiritPetB000001");
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N10 (R1) a pull core drops while loading is replayed as sent once loading clears; the latest wins", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  reset();
  at(A);
  canvas.loading = true;
  F.socketFire("pullToScene", IDS.sceneC, { controlledTokens: ["gmPicked00000001"] });
  assert.equal(loadingToasts().length, 1, "core's own drop and toast");
  t.mock.timers.tick(NET_POLL_MS * 4);
  assert.equal(F.views.length, 1, "nothing while loading");
  canvas.loading = false;
  t.mock.timers.tick(NET_POLL_MS);
  await flush();
  assert.deepEqual(F.views.at(-1), [IDS.sceneC, { controlledTokens: ["gmPicked00000001"] }], "the GM's request as sent");
  assert.equal(F.views.length, 2);
  assert.deepEqual(followed, [{ scene: IDS.sceneC, level: null, reason: "retry" }]);
  // two dropped pulls: only the latest is replayed
  reset();
  at(A);
  canvas.loading = true;
  F.socketFire("pullToScene", IDS.sceneC, {});
  F.socketFire("pullToScene", IDS.sceneB, { level: IDS.levelB1 });
  canvas.loading = false;
  t.mock.timers.tick(NET_POLL_MS);
  await flush();
  assert.deepEqual(F.views.slice(2), [[IDS.sceneB, { level: IDS.levelB1 }]]);
  // not loading: core honours it, pins adds nothing
  reset();
  at(A);
  F.socketFire("pullToScene", IDS.sceneC, {});
  t.mock.timers.tick(NET_POLL_MS * 4);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneC, {}]]);
  assert.deepEqual(followed, []);
  at(B, IDS.levelB2);
});

test("N10b (CR1) a dropped pull, then a newer pull core honours before the replay looks: the stale one is never replayed", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  reset();
  at(A);
  canvas.loading = true;
  F.socketFire("pullToScene", IDS.sceneC, {});      // dropped by core: pins holds it
  canvas.loading = false;
  F.socketFire("pullToScene", IDS.sceneB, { level: IDS.levelB1 });   // honoured by core
  await flush();
  t.mock.timers.tick(NET_POLL_MS * 4);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneC, {}], [IDS.sceneB, { level: IDS.levelB1 }]], "no replay of C over B");
  assert.equal(canvas.scene?.id, IDS.sceneB);
  assert.deepEqual(followed, []);
  at(B, IDS.levelB2);
});

test("N10c (code review G4) a level view queued BEFORE a GM pull core dropped never wipes that newer pull: the pull is replayed, the older view dropped", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    addPet(IDS.levelB2);                            // core keeps the view on B2: the gap-filler follows
    let end;
    moveLevel(taloTok()[0], IDS.levelB1, { ended: new Promise(r => { end = r; }) });
    await flush();
    canvas.loading = true;
    end();
    await flush();                                  // the gap-filler waits for the draw (queued first)
    F.socketFire("pullToScene", IDS.sceneC, {});    // the GM's NEWER pull, dropped by core while loading: held
    t.mock.timers.tick(NET_POLL_MS * 2);
    await flush();
    canvas.loading = false;
    t.mock.timers.tick(NET_POLL_MS);
    await flush();
    t.mock.timers.tick(NET_POLL_MS * 4);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneC, {}], [IDS.sceneC, {}]], "core's dropped try, then the replay of the newer pull; no level view over it");
    assert.deepEqual(followed.map(f => f.reason), ["retry"]);
  } finally {
    B.tokens.delete("spiritPetB000001");
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N10d (minor (c)) a pull core dropped while loading, then pins' own NEWER level view: the older held pull is cleared, never replayed over it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    addPet(IDS.levelB2);
    canvas.loading = true;
    F.socketFire("pullToScene", IDS.sceneC, {});    // dropped by core while loading: pins holds it
    canvas.loading = false;                         // the draw ends before the replay's poll looks
    moveLevel(taloTok()[0], IDS.levelB1);           // a newer move: the gap-filler views at once
    await flush();
    t.mock.timers.tick(NET_POLL_MS * 4);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneC, {}], [IDS.sceneB, ctl(IDS.levelB1)]], "core's dropped try, then pins' level view; no replay");
    assert.deepEqual(followed.map(f => f.reason), ["level"]);
  } finally {
    B.tokens.delete("spiritPetB000001");
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("N10e (code review G1) a dropped pull to the scene and level the canvas shows once loading clears (core's own level switch got there) → no replay view", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  reset();
  at(B, IDS.levelB2);
  canvas.loading = true;                            // core's level switch to B1 is drawing
  F.socketFire("pullToScene", IDS.sceneB, { level: IDS.levelB1, controlledTokens: [IDS.taloTok] });   // pins' pull: dropped
  at(B, IDS.levelB1);                               // the switch's draw ends on B1
  t.mock.timers.tick(NET_POLL_MS * 4);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB1, controlledTokens: [IDS.taloTok] }]], "core's dropped try only");
  assert.deepEqual(followed, []);
  // the same pull, but the draw ended elsewhere: replayed as sent
  reset();
  at(B, IDS.levelB2);
  canvas.loading = true;
  F.socketFire("pullToScene", IDS.sceneB, { level: IDS.levelB1 });
  at(B, IDS.levelB2);
  t.mock.timers.tick(NET_POLL_MS * 4);
  await flush();
  assert.deepEqual(F.views.at(-1), [IDS.sceneB, { level: IDS.levelB1 }]);
  assert.deepEqual(followed.map(f => f.reason), ["retry"]);
  at(B, IDS.levelB2);
});

test("N10 an unpinned player, a GM or the switch off: core's drop stands (nothing replayed)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const runs = [
    ["unpinned", () => F.become({ userId: IDS.miraUser }), () => F.become({ userId: IDS.taloUser })],
    ["GM", () => F.become({ userId: IDS.gm }), () => F.become({ userId: IDS.taloUser })],
    ["switch off", () => setPinning(false), () => setPinning(true)],
  ];
  for (const [why, before, after] of runs) {
    await before();
    try {
      reset();
      at(A);
      canvas.loading = true;
      F.socketFire("pullToScene", IDS.sceneC, {});
      canvas.loading = false;
      t.mock.timers.tick(NET_POLL_MS * 4);
      await flush();
      assert.equal(F.views.length, 1, why);
    } finally {
      await after();
    }
  }
  at(B, IDS.levelB2);
});

test("14 wild shape: the token rewritten to the form keeps the pin; activation skipped; a cut-and-paste followed; revert", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    const [tok] = taloTok();
    F.updateToken(tok, { actorId: IDS.wolf, flags: { dnd5e: { originalActor: IDS.talo } } });
    await flush();
    assert.deepEqual(F.views, [], "the transform makes no view");
    C._onActivate(true, { viewOptions: {} });
    assert.deepEqual(F.activations, [], "a wild-shaped Talo still ignores activation");
    carryTalo(IDS.sceneC, { flags: { dnd5e: { originalActor: IDS.talo } } });
    t.mock.timers.tick(NET_GRACE_MS);
    await flush();
    assert.deepEqual(F.views.map(v => v[0]), [IDS.sceneC], "the form token's move is caught by the safety net");
    const [form] = taloTok();
    F.updateToken(form, { actorId: IDS.talo, flags: {} });
    reset();
    A._onActivate(true, { viewOptions: {} });
    assert.deepEqual(F.activations, [], "reverted: still pinned");
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("14b wild shape the dnd5e 6.0.6 linked way: token → form actor (actorLink), NO token flag; the pin holds", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    reset();
    at(B, IDS.levelB2);
    const [tok] = taloTok();
    F.updateToken(tok, { actorId: IDS.wolf, actorLink: true });
    assert.equal(tok.flags?.dnd5e?.originalActor, undefined, "no token flag: the root comes from the form actor");
    C._onActivate(true, { viewOptions: {} });
    assert.deepEqual(F.activations, [], "a wild-shaped Talo still ignores activation");
    carryTalo(IDS.sceneC);
    t.mock.timers.tick(NET_GRACE_MS);
    await flush();
    assert.deepEqual(F.views.map(v => v[0]), [IDS.sceneC], "the form token's move is caught by the safety net");
  } finally {
    restoreTalo();
    at(B, IDS.levelB2);
  }
});

test("15 a GM and an unpinned player are unaffected", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const userId of [IDS.miraUser, IDS.gm]) {
    F.become({ userId });
    try {
      reset();
      at(B, IDS.levelB2);
      C._onActivate(true, { viewOptions: { y: 2 } });
      await flush();
      assert.deepEqual(F.activations, [[IDS.sceneC, true]], userId);
      assert.deepEqual(F.views, [[IDS.sceneC, { y: 2 }]], userId);
      reset();
      at(B, IDS.levelB2);
      cutPaste(IDS.sceneC);
      t.mock.timers.tick(NET_GRACE_MS * 2);
      await flush();
      assert.deepEqual(F.views, [], `${userId}: no safety net`);
    } finally {
      restoreTalo();
      F.become({ userId: IDS.taloUser });
    }
  }
  at(B, IDS.levelB2);
});

test("20 switching on: only the GM client whose user made the change audits, toasts and pulls the online pinned players", async () => {
  const audited = [];
  const id = Hooks.on(HOOKS.audited.name, r => audited.push(r));
  const talo = game.users.get(IDS.taloUser);
  F.become({ userId: IDS.gm });
  try {
    Object.assign(talo, { viewedScene: IDS.sceneA, viewedLevel: null });
    reset();
    row().onChange(true, {}, IDS.bot);               // the bot flipped it: Joe's tab stays quiet
    assert.deepEqual([toasts(), audited, F.pulls], [[], [], []]);
    row().onChange(true, {}, IDS.gm);
    assert.deepEqual(toasts(), ["Pinning on: all 1 pins have one token."]);
    assert.equal(audited.length, 1);
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], ctl(IDS.levelB2)]], "pulled to the token's scene and level, the token controlled");
    // seen there already → pulled anyway (the GM's copy lags a draw in progress: review F1); offline → no pull
    reset();
    Object.assign(talo, { viewedScene: IDS.sceneB, viewedLevel: IDS.levelB2 });
    row().onChange(true, {}, IDS.gm);
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], ctl(IDS.levelB2)]], "no 'already there' skip");
    Object.assign(talo, { viewedScene: IDS.sceneB, viewedLevel: IDS.levelB1 });
    reset();
    row().onChange(true, {}, IDS.gm);
    assert.deepEqual(F.pulls, [[IDS.sceneB, [IDS.taloUser], ctl(IDS.levelB2)]], "another floor of the token's scene");
    talo.active = false;
    reset();
    row().onChange(true, {}, IDS.gm);
    assert.deepEqual(F.pulls, []);
    talo.active = true;
    // a problem: Talo has a second token on C → a warn toast naming it, ok false, NOTHING deleted, no pull (ambiguous)
    Object.assign(talo, { viewedScene: IDS.sceneA, viewedLevel: null });
    const extra = F.createToken(IDS.sceneC, { id: "taloAuditC000001", name: "Talo", actorId: IDS.talo });
    reset();
    audited.length = 0;
    row().onChange(true, {}, IDS.gm);
    assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]),
      [["warn", "Pinning on: 1 problem(s) — Talo (Talo's player) has several tokens: Lighthouse, Cave"]]);
    assert.equal(audited[0].ok, false);
    assert.equal(audited[0].violations[0].code, "MANY_TOKENS");
    assert.deepEqual(F.calls.filter(c => /delete/i.test(c.op ?? "")), [], "the switch-on audit deletes nothing");
    assert.equal(C.tokens.has(extra.id), true);
    assert.deepEqual(F.pulls, []);
    C.tokens.delete(extra.id);
    // a player's client: no audit, no pull, no view
    F.become({ userId: IDS.taloUser });
    reset();
    at(A);
    row().onChange(true, {}, IDS.gm);
    await flush();
    assert.deepEqual([F.views, F.pulls, toasts()], [[], [], []]);
    reset();
    row().onChange(false, {}, IDS.gm);               // off: nobody moves
    assert.deepEqual([F.views, F.pulls], [[], []]);
  } finally {
    delete talo.viewedScene;
    delete talo.viewedLevel;
    talo.active = true;
    Hooks.off(HOOKS.audited.name, id);
    F.become({ userId: IDS.taloUser });
    at(B, IDS.levelB2);
  }
});

test("N9 watch (GM): a copy → one Paused toast after the window; a carry → none; the only token deleted → Stranded; same count twice → once", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  F.become({ userId: IDS.gm });
  try {
    reset();
    const copy = F.createToken(IDS.sceneC, { id: "taloWatchC000001", name: "Talo", actorId: IDS.talo });
    t.mock.timers.tick(NET_GRACE_MS - 1);
    assert.deepEqual(toasts(), [], "debounced");
    t.mock.timers.tick(1);
    assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]), [["warn",
      "Talo (Talo's player) now has 2 tokens (Lighthouse, Cave): the view follows only the copy on the scene Talo's player is viewing. Delete the extra one."]]);
    reset();
    F.deleteToken(copy);
    t.mock.timers.tick(NET_GRACE_MS);
    assert.deepEqual(toasts(), [], "back to one: no toast");
    // a carry (create, then delete a beat later, still inside the window): one token throughout
    carryTalo(IDS.sceneC);
    t.mock.timers.tick(NET_GRACE_MS);
    assert.deepEqual(toasts(), []);
    const [tok] = taloTok();
    F.createToken(IDS.sceneA, { id: tok.id, name: "Talo", actorId: IDS.talo });
    t.mock.timers.tick(NET_GRACE_MS - 10);
    F.deleteToken(tok);                             // a slow carry's late delete: the debounce restarts
    t.mock.timers.tick(NET_GRACE_MS);
    assert.deepEqual(toasts(), [], "a slow carry never toasts 'two tokens'");
    // the only token deleted → Stranded; deleted again after a re-place inside the window → no second toast
    F.deleteToken(taloTok()[0]);
    t.mock.timers.tick(NET_GRACE_MS);
    assert.deepEqual(toasts(), ["Talo (Talo's player) has no token left: until it is placed again, Talo's player follows scene activation like an unpinned player. Place Talo again and Talo's player is brought to it (at their next login if offline)."]);
    reset();
    const again = F.createToken(IDS.sceneB, { id: "taloAgainB000001", name: "Talo", actorId: IDS.talo, level: IDS.levelB2 });
    F.deleteToken(again);
    t.mock.timers.tick(NET_GRACE_MS);
    assert.deepEqual(toasts(), [], "the same count (0) twice in a row toasts once");
    // switch off: nothing
    restoreTalo();
    await setPinning(false);
    reset();
    F.createToken(IDS.sceneC, { id: "taloOffC00000001", name: "Talo", actorId: IDS.talo });
    t.mock.timers.tick(NET_GRACE_MS * 2);
    assert.deepEqual(toasts(), []);
    C.tokens.delete("taloOffC00000001");
    await setPinning(true);
    // an unpinned actor's tokens: nothing
    reset();
    const m = F.createToken(IDS.sceneC, { id: "miraCopyC0000001", name: "Mira", actorId: IDS.mira });
    t.mock.timers.tick(NET_GRACE_MS * 2);
    assert.deepEqual(toasts(), []);
    C.tokens.delete(m.id);
  } finally {
    restoreTalo();
    F.become({ userId: IDS.taloUser });
    at(B, IDS.levelB2);
  }
});

test("N9b (RF1) the active GM: a pinned character placed again after its last token went → its online player is pulled to it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const talo = game.users.get(IDS.taloUser);
  F.become({ userId: IDS.gm });
  try {
    F.deleteToken(taloTok()[0]);
    t.mock.timers.tick(NET_GRACE_MS);
    reset();
    const placed = F.createToken(IDS.sceneC, { id: "taloPlacedC00001", name: "Talo", actorId: IDS.talo });
    assert.deepEqual(F.pulls, [[IDS.sceneC, [IDS.taloUser], ctl(null, placed.id)]], "0 → 1: pulled at once, the token controlled");
    t.mock.timers.tick(NET_GRACE_MS);
    assert.deepEqual(toasts(), [], "one token: no toast");
    // 1 → 2 (a copy, or a carry's create before its delete): the mover pulls, not pins
    reset();
    const copy = F.createToken(IDS.sceneA, { id: "taloCopyA0000001", name: "Talo", actorId: IDS.talo });
    assert.deepEqual(F.pulls, []);
    F.deleteToken(copy);
    t.mock.timers.tick(NET_GRACE_MS);
    // the second GM (not the active one), an offline player, the switch off: no pull
    for (const [why, before, after] of [
      ["not the active GM", () => F.become({ userId: IDS.bot }), () => F.become({ userId: IDS.gm })],
      ["offline", () => { talo.active = false; }, () => { talo.active = true; }],
      ["switch off", () => setPinning(false), () => setPinning(true)],
    ]) {
      F.deleteToken(taloTok()[0]);
      t.mock.timers.tick(NET_GRACE_MS);
      await before();
      reset();
      F.createToken(IDS.sceneC, { id: "taloPlacedC00002", name: "Talo", actorId: IDS.talo });
      assert.deepEqual(F.pulls, [], why);
      await after();
      t.mock.timers.tick(NET_GRACE_MS);
    }
    // an unpinned actor placed: nothing
    reset();
    const m = F.createToken(IDS.sceneC, { id: "miraPlacedC00001", name: "Mira", actorId: IDS.mira });
    assert.deepEqual(F.pulls, []);
    C.tokens.delete(m.id);
  } finally {
    talo.active = true;
    restoreTalo();
    F.become({ userId: IDS.taloUser });
    at(B, IDS.levelB2);
  }
});

test("N9 watch: a player's client never toasts", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  reset();
  F.createToken(IDS.sceneC, { id: "taloPlayerC00001", name: "Talo", actorId: IDS.talo });
  t.mock.timers.tick(NET_GRACE_MS * 2);
  assert.deepEqual(toasts(), []);
  restoreTalo();
});

test("a pin lookup that throws in the safety net is logged, never uncaught", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  reset();
  at(B, IDS.levelB2);
  cutPaste(IDS.sceneC);
  const me = game.user;
  const desc = Object.getOwnPropertyDescriptor(me, "flags");
  let calls = 0;
  Object.defineProperty(me, "flags", { get() { if (++calls > 0) throw new Error("lookup boom"); }, configurable: true });
  consoleLines.length = 0;
  try {
    assert.doesNotThrow(() => t.mock.timers.tick(NET_GRACE_MS));
  } finally {
    if (desc) Object.defineProperty(me, "flags", desc);
    else delete me.flags;
  }
  assert.ok(consoleLines.some(([, line]) => /lookup boom|failed/.test(line)), JSON.stringify(consoleLines));
  consoleLines.length = 0;
  restoreTalo();
  at(B, IDS.levelB2);
});

test("no hook errors, no console errors on the way", () => {
  assert.deepEqual(F.hookErrors, []);
  assert.deepEqual(consoleLines.filter(([level]) => level === "error"), []);
});

// Keep this test LAST: it replaces the published API.
test("hot patch: uninstall() unwraps the patch, drops every hook and the socket listener; re-import wires again", async () => {
  const old = game.modules.get(MODULE).api;
  old.uninstall();
  assert.equal(F.listeners("deleteToken"), 0);
  assert.equal(F.listeners("moveToken"), 0);
  assert.equal(F.socketListeners("pullToScene"), 0, "socket.off with the same listener");
  assert.equal(B._onActivate.__pentarynPinsActivate, undefined, "Scene#_onActivate is core's again");
  consoleLines.length = 0;
  await import(`../pins.mjs?hot=${Date.now()}`);
  assert.deepEqual(consoleLines, []);
  const fresh = game.modules.get(MODULE).api;
  assert.notEqual(fresh, old);
  assert.equal(game.pentaryn[NS], fresh);
  assert.equal(B._onActivate.__pentarynPinsActivate, true);
  assert.equal(F.socketListeners("pullToScene"), 1, "one socket listener again");
  assert.deepEqual(fresh.describe().patches.map(p => p.adjustments), ["pins-scene-activate"]);
});
