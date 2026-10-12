// A player's client (the GM is another, active user): what the lifecycle and the turn boundary do
// there. Nothing is swept or seeded (the active GM does that); a player's targets are released when
// their own turn ends; the HUD follows their creature's turn, now and again at 300 / 1200 ms at
// combat start (hudFollowPlan; combat-riders-37 names these delays later).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, PLAYER_ID, captureConsole, drain, makeCombat, makeToken, setupWorld } from "./fixtures/world.mjs";
import { fighter, rogue, wolf } from "./fixtures/actors.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld({ gm: false });
const { F, argon: A } = W;
const lines = captureConsole();

const fig = fighter({ ownership: { default: 0, [PLAYER_ID]: 3 } });
const rog = rogue({ owner: false });
const gob = wolf({ id: "goblin0000000001", name: "Goblin", owner: false, flags: { [MODULE]: { turn: { key: "gone:1:x" } } } });
const toks = Object.fromEntries([fig, rog, gob].map((a, i) => [a.id, makeToken(a, { x: i * 3 })]));
const combat = makeCombat({ id: "c1", entries: [fig, rog, gob].map((a, i) => ({ id: `cb${i + 1}`, actor: a, token: toks[a.id] })) });

await import("../combat.mjs");
await import("../hud.mjs");

test("a player's lifecycle: settings registered, the API published; no sweep, no seed; the picker tutorial still marked seen", async () => {
  F.fire("init");
  F.fire("setup");
  F.calls.length = 0;
  F.fire("ready");
  mock.timers.tick(0);
  await drain();
  pinJSON("player-ready", F.calls.splice(0), import.meta.url);
  assert.equal(typeof F.game.pentaryn.combat, "object");
  assert.equal(gob.flags[MODULE].turn.key, "gone:1:x", "orphans are the GM's to sweep");
  assert.equal(fig.flags.enhancedcombathud, undefined, "no seed on a player's client");
  assert.equal(F.game.user.isGM, false);
});

test("your turn ends: your targets are released (owner of the creature whose turn ended)", () => {
  const rows = [];
  const change = (label, prev, cur, { targets = [toks[gob.id]], setTargets = true } = {}) => {
    F.game.user.targets.clear();
    for (const t of targets) F.game.user.targets.add(t);
    const keep = F.canvas.tokens.setTargets;
    if (!setTargets) F.canvas.tokens.setTargets = undefined;
    F.calls.length = 0;
    F.Hooks.callAll("combatTurnChange", combat, prev, cur);
    if (!setTargets) F.canvas.tokens.setTargets = keep;
    rows.push({ label, targets: [...F.game.user.targets].map(t => t.id), calls: F.calls.filter(c => ["canvas.setTargets", "token.setTarget", "deleteEmbedded", "update"].includes(c.op)) });
  };
  change("my fighter's turn ended", { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" });
  change("…with no setTargets on the canvas", { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" }, { setTargets: false });
  change("someone else's turn ended", { round: 1, combatantId: "cb2" }, { round: 1, combatantId: "cb3" });
  change("nothing targeted", { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" }, { targets: [] });
  pinJSON("player-targets", rows, import.meta.url);
  assert.deepEqual(rows[0].targets, []);
  assert.deepEqual(rows[2].targets, [toks[gob.id].id]);
});

test("clearTargetsAfterTurn off: kept", async () => {
  await F.game.settings.set(MODULE, "clearTargetsAfterTurn", false);
  F.game.user.targets.add(toks[gob.id]);
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" });
  assert.equal(F.game.user.targets.size, 1);
  await F.game.settings.set(MODULE, "clearTargetsAfterTurn", true);
  F.game.user.targets.clear();
});

test("your creature's turn begins: the HUD follows it (select, else bind); at combat start, again at 300 and 1200 ms (golden/player-follow.json)", async () => {
  const rows = [];
  const look = label => { rows.push({ label, calls: F.calls.filter(c => ["token.control", "argon.bind"].includes(c.op)).map(c => [c.op, c.id ?? c.token]) }); F.calls.length = 0; };
  A.ARGON.enabled = true;
  A.ARGON._token = toks[rog.id];
  F.calls.length = 0;
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb3" }, { round: 1, combatantId: "cb1" });
  look("mid-combat, my turn: selected");
  toks[fig.id].layer.active = false;
  A.ARGON._token = toks[rog.id];
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb3" }, { round: 1, combatantId: "cb1" });
  look("can't select now (another layer): bound directly");
  toks[fig.id].layer.active = true;
  toks[fig.id].control = function () { F.calls.push({ op: "token.control", id: this.id }); return false; };
  A.ARGON._token = toks[rog.id];
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb3" }, { round: 1, combatantId: "cb1" });
  look("control refused: bound directly");
  delete toks[fig.id].control;
  toks[fig.id].control = function (o) { F.calls.push({ op: "token.control", id: this.id, opts: F.plain(o) }); return true; };
  A.ARGON._token = toks[fig.id];
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb3" }, { round: 1, combatantId: "cb1" });
  look("already on the HUD: nothing");
  // combat start (round 0 → 1, same combatant): Argon off now → no follow now; rechecks at 300 / 1200
  A.ARGON.enabled = false;
  A.ARGON._token = toks[rog.id];
  combat.turn = 0;
  F.Hooks.callAll("combatTurnChange", combat, { round: 0, combatantId: "cb1" }, { round: 1, combatantId: "cb1" });
  look("combat start, Argon still off: nothing yet");
  mock.timers.tick(299);
  look("299 ms");
  A.ARGON.enabled = true;
  mock.timers.tick(1);
  look("300 ms: Argon on now, the HUD shows the old token → follow");
  A.ARGON._token = toks[rog.id];
  mock.timers.tick(900);
  look("1200 ms: still the old token → follow again");
  A.ARGON._token = toks[rog.id];
  F.Hooks.callAll("combatTurnChange", combat, { round: 0, combatantId: "cb1" }, { round: 1, combatantId: "cb1" });
  look("combat start with Argon on: follows at once");
  combat.turn = 1;
  mock.timers.tick(1200);
  look("the turn moved on before the rechecks: no recheck follows");
  combat.turn = 0;
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" });
  look("someone else's creature: nothing");
  await F.game.settings.set(MODULE, "hudFollows", false);
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb3" }, { round: 1, combatantId: "cb1" });
  look("hudFollows off");
  await F.game.settings.set(MODULE, "hudFollows", true);
  const bind = A.ARGON.bind;
  A.ARGON.bind = () => { throw new Error("argon not ready"); };
  toks[fig.id].layer.active = false;
  A.ARGON._token = toks[rog.id];
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb3" }, { round: 1, combatantId: "cb1" });
  A.ARGON.bind = bind;
  toks[fig.id].layer.active = true;
  rows.push({ label: "bind throws", console: lines.splice(0) });
  mock.timers.tick(2000);
  pinJSON("player-follow", rows, import.meta.url);
});

test("a deleted combat on a player's client: no cleanup", async () => {
  fig.flags[MODULE] = { turn: { key: "c1:1:cb1" } };
  F.calls.length = 0;
  F.Hooks.callAll("deleteCombat", combat);
  mock.timers.tick(1500);
  await drain();
  assert.deepEqual(F.calls.filter(c => ["update", "deleteEmbedded"].includes(c.op)), []);
  assert.equal(fig.flags[MODULE].turn.key, "c1:1:cb1");
});
