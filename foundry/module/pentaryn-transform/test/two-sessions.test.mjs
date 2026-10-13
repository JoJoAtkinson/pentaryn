// transform-core-async-2 (final review, [declared]): two tabs of the runner user (the MCP bridge tab
// plus a GM browser tab) both pass isRunner, so each automatic write — the auto-revert, the druid's
// copy of an effect that ended in the form, the Starry ending and the sweep — is claimed per tab with
// the kit's claimDocument (flags.pentaryn-transform.claims.<key>): only the winning tab writes, a
// loser or a claim whose update rejects stands down, and the winner clears its claim afterwards.
// The other tab is played by its claim landing on the document (socket "socket-gm-2").
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup, IDS, MODULE } from "./fixtures/world.mjs";
import { EFFECT_ID } from "../transform-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup({ modules: ["pentaryn-senses"] });
const T = await import("../transform.mjs");
const S = await import("../starry-adapter.mjs");
const SA = await import("../sweep-adapter.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");

const ME = game.socket.id;
const OTHER = "socket-gm-2";
const lines = () => F.chat.map(c => c.content.replace(/<\/?[^>]+>/g, ""));
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const claimOf = (doc, key) => doc.flags?.[MODULE]?.claims?.[key];
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const settle = async () => { await flush(); mock.timers.tick(750); await flush(); };

async function shifted(opts) {
  game.actors.clear();
  game.scenes.clear();
  F.become({ userId: IDS.gm, socketId: ME });
  game.time.worldTime = 0;
  const { talo } = F.W.talo(opts);
  const wolf = await T.shift(talo, "p1");
  F.chat.length = 0;
  F.calls.length = 0;
  F.console.length = 0;
  return { talo, wolf };
}
const zeroHP = wolf => {
  wolf.system.attributes.hp.value = 0;
  Hooks.callAll("updateActor", wolf, { system: { attributes: { hp: { value: 0 } } } }, {}, "u");
};

/* ── the auto-revert (key "revert" on the form) ───────────────────────────── */

test("transform-core-async-2: another tab's claim on the form → this tab does not revert", async () => {
  const { wolf } = await shifted();
  wolf.flags[MODULE].claims = { revert: OTHER };
  zeroHP(wolf);
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), [], "transform-core-async-2: the other tab ends the form");
  assert.deepEqual(lines(), []);
  assert.deepEqual(F.console, [], "a loser stands down quietly (debug only)");
});

test("transform-core-async-2: the auto-revert waits for its claim; a later claim from the other tab wins", async () => {
  let { wolf } = await shifted();
  zeroHP(wolf);
  await flush();
  assert.equal(claimOf(wolf, "revert"), ME, "this tab's claim is written first");
  assert.deepEqual(ops("revertOriginalForm"), [], "no revert before the claim settles");
  wolf.flags[MODULE].claims.revert = OTHER;                // the other tab's claim lands last
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), []);
  ({ wolf } = await shifted());
  zeroHP(wolf);
  zeroHP(wolf);                                            // a second trigger in the same tab
  await settle();
  assert.equal(ops("revertOriginalForm").length, 1, "the winner reverts once");
  assert.deepEqual(lines(), ["Talo drops to 0 HP and returns to normal form."]);
});

test("transform-core-async-2: the winner clears its claim when the form survives (a failed revert)", async () => {
  const { wolf } = await shifted();
  wolf.revertOriginalForm = async () => { throw new Error("x"); };
  zeroHP(wolf);
  await settle();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | auto-revert failed"]]);
  assert.equal(claimOf(wolf, "revert"), undefined, "a stale claim never blocks a later ending");
  assert.deepEqual(ops("update").map(c => c.changes), [
    { [`flags.${MODULE}.claims.revert`]: ME }, { [`flags.${MODULE}.claims.revert`]: "<_del>" }
  ]);
});

test("transform-core-async-2: a claim whose update rejects (the form already gone) stands down", async () => {
  const { wolf } = await shifted();
  wolf.update = async () => { throw new Error("does not exist"); };
  zeroHP(wolf);
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), []);
  assert.deepEqual(F.console, [], "debug only");
});

/* ── the druid's copy of an effect that ended in the form (key "end") ────── */

test("transform-core-async-2: the druid's copy is ended by the tab that wins its claim only", async () => {
  let { talo, wolf } = await shifted({ effects: [{ id: IDS.bless, name: "Bless" }] });
  talo.effects.get(IDS.bless).flags[MODULE] = { claims: { end: OTHER } };
  await wolf.effects.get(IDS.bless).delete();
  await settle();
  assert.ok(talo.effects.get(IDS.bless), "transform-core-async-2: the other tab ends the druid's copy");
  ({ talo, wolf } = await shifted({ effects: [{ id: IDS.bless, name: "Bless" }] }));
  const copy = talo.effects.get(IDS.bless);
  await wolf.effects.get(IDS.bless).delete();
  await flush();
  assert.equal(claimOf(copy, "end"), ME);
  assert.ok(talo.effects.get(IDS.bless), "not before the claim settles");
  await settle();
  assert.equal(talo.effects.get(IDS.bless), undefined, "the winner ends it");
});

/* ── Starry Form's ending (key "end" on the Starry effect) ───────────────── */

test("transform-core-async-2: Starry Form's automatic ending runs on the claiming tab only", async () => {
  let { talo } = await shifted();
  await S.assumeStarry(talo, "archer");
  F.chat.length = 0;
  const eff = talo.effects.get(S.STARRY_EFFECT_ID);
  eff.flags[MODULE].claims = { end: OTHER };
  Hooks.callAll("updateActiveEffect", eff, { duration: { expired: true } }, {}, "u");
  await settle();
  assert.ok(S.activeStarry(talo), "transform-core-async-2: the other tab ends it");
  assert.deepEqual(lines(), []);
  delete eff.flags[MODULE].claims;
  Hooks.callAll("updateActiveEffect", eff, { duration: { expired: true } }, {}, "u");
  await flush();
  assert.ok(S.activeStarry(talo), "not before the claim settles");
  await settle();
  assert.equal(S.activeStarry(talo), null);
  assert.deepEqual(lines(), ["Talo's starry form fades after 10 minutes."], "one line");
});

/* ── the sweep (key "sweep" on each spent form) ───────────────────────────── */

test("transform-core-async-2: the sweep deletes only the spent forms this tab claimed", async () => {
  game.actors.clear();
  game.scenes.clear();
  F.become({ userId: IDS.gm, socketId: ME });
  const old = Date.now() - 60_000;
  const mk = id => F.W.add(F.W.makeActor({ id, name: id, flags: { dnd5e: { originalActor: IDS.talo } }, _stats: { createdTime: old } }));
  mk("spentMine0000001");
  const theirs = mk("spentTheirs00001");
  theirs.flags[MODULE] = { claims: { sweep: OTHER } };
  await SA.sweepSpentForms();                    // EC-6: first sight; spent once 10 s have passed
  SA.cancelSweep();
  mock.timers.tick(10_001);
  F.calls.length = 0;
  const job = T.sweepSpentForms();
  await settle();
  await job;
  assert.deepEqual(ops("Actor.deleteDocuments").map(c => c.ids), [["spentMine0000001"]],
    "transform-core-async-2: the other tab deletes its own claim's form");
  assert.ok(game.actors.get("spentTheirs00001"));
});
