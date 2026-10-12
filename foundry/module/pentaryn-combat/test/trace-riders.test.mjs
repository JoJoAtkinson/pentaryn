// combat-riders-10 (review): the rider decision points write the trace ring — each auto rider's
// applied / not-applied reason (the 4 s guard included) and renderOffer's early returns — and
// combat-riders-29's pruneSession drops a real auto-rider entry once the guard has passed.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, captureConsole, drain, makeCombat, makeMessage, makeToken, setupWorld } from "./fixtures/world.mjs";
import { rogue, wolf } from "./fixtures/actors.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F, doc } = W;
captureConsole();
const rog = rogue();
const gob = wolf({ id: "goblin0000000088", name: "Goblin" });
const rt = makeToken(rog, { id: "rogTok0000000088" });
const gt = makeToken(gob, { id: "gobTok0000000088", x: 1, disposition: -1 });
makeCombat({ id: "c88", entries: [{ id: "cb88", actor: rog, token: rt }, { id: "cb89", actor: gob, token: gt }] });
await import("../combat.mjs");
const riders = await import("../turn-riders.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
mock.timers.tick(0);
await drain();
const api = F.game.pentaryn.combat;

const act = [...rog.items.get("scimitar00000001").system.activities.values()][0];
const attackCard = (stamp, origin) => makeMessage({ type: "attack", author: F.game.user, speaker: { actor: rog.id },
  system: { activity: { uuid: act.uuid, type: "attack" }, targets: [{ token: gt.document.uuid }], origin: { id: origin } },
  _source: { system: { origin, targets: [{ token: gt.document.uuid }] } },
  flags: { [MODULE]: { turnKey: stamp } }, rolls: [{ hasAdvantage: true, options: {} }] });
const render = (m) => {
  const li = doc.createElement("li");
  const c = doc.createElement("div");
  c.className = "message-content";
  li.append(c);
  F.Hooks.callAll("dnd5e.renderChatMessage", m, li);
  return li;
};
const rows = op => api.trace().filter(t => t.op === op).map(t => t.data);

test("auto riders: applied, then the 4 s guard skip, each recorded with its reason; pruneSession drops the entry after the guard", async () => {
  await F.game.user.setFlag(MODULE, "riders.sneak-attack", "auto");
  attackCard("c88:1:cb88", "usageTrace00001");
  F.CONFIG.debug[MODULE] = true;
  try {
    const first = riders.autoRiders({ subject: act, rolls: [{ parts: ["1d6"], data: {} }] }, { data: { system: { origin: "usageTrace00001" } } });
    assert.equal(first.length, 1);
    assert.deepEqual(riders.autoRiders({ subject: act, rolls: [{ parts: ["1d6"], data: {} }] }, { data: {} }), []);
  } finally { delete F.CONFIG.debug[MODULE]; }
  const auto = rows("auto rider");
  assert.deepEqual(auto.map(r => [r.rider, r.applied, r.why ?? null]), [["sneak-attack", true, null], ["sneak-attack", false, "4 s guard"]]);
  assert.equal(riders.pruneSession(), 0, "inside the guard: kept");
  mock.timers.tick(4000);
  assert.equal(riders.pruneSession(), 1, "past the guard: dropped");
  await drain();
  await F.game.user.setFlag(MODULE, "riders.sneak-attack", "ask");
});

test("renderOffer's early returns are recorded: an earlier turn's card, not yours to see", () => {
  F.CONFIG.debug[MODULE] = true;
  try {
    render(attackCard("c88:1:old", "usageTrace00002"));
    F.become({ userId: "player0000000001" });
    rog.isOwner = false;
    try {
      const m = attackCard("c88:1:cb88", "usageTrace00003");
      m.author = F.game.users.get("gmUser0000000001");
      assert.equal(m.isAuthor, false);
      render(m);
    } finally { rog.isOwner = true; F.become({ userId: "gmUser0000000001" }); }
  } finally { delete F.CONFIG.debug[MODULE]; }
  assert.deepEqual(rows("offer").map(r => r.why).slice(-2), ["an earlier turn's card", "not yours to see"]);
});
