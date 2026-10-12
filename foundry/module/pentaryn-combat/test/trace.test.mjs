// combat-riders-10: decision points write the trace ring (api.trace()) only while
// CONFIG.debug["pentaryn-combat"] is set; off, nothing is recorded and behaviour is unchanged.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, drain, makeCombat, makeToken, setupWorld } from "./fixtures/world.mjs";
import { fighter, wolf } from "./fixtures/actors.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F } = W;
const fig = fighter();
const gob = wolf({ id: "goblin0000000077", name: "Goblin" });
const ft = makeToken(fig, { id: "figTok0000000077" });
const gt = makeToken(gob, { id: "gobTok0000000077", x: 1, disposition: -1 });
makeCombat({ id: "c77", entries: [{ id: "cb77", actor: fig, token: ft }, { id: "cb78", actor: gob, token: gt }] });
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
mock.timers.tick(0);
await drain();
const api = F.game.pentaryn.combat;
F.game.user.targets.add(gt);

test("flag off: a Full Attack records nothing", async () => {
  await api.fullAttack(fig);
  mock.timers.tick(400);
  await drain();
  assert.deepEqual(api.trace(), []);
});

test("flag on: each swing's classification is recorded; a copy is returned", async () => {
  delete fig.flags[MODULE];
  F.CONFIG.debug[MODULE] = true;
  try {
    await api.fullAttack(fig);
    mock.timers.tick(400);
    await drain();
  } finally { delete F.CONFIG.debug[MODULE]; }
  const swings = api.trace().filter(t => t.op === "swing");
  assert.equal(swings.length, 2);
  assert.deepEqual(swings.map(t => t.data.kind), ["main", "main"]);
  assert.equal(swings[0].data.actor, fig.uuid);
  const copy = api.trace();
  copy.length = 0;
  assert.ok(api.trace().length >= 2, "the ring is not the caller's array");
});
