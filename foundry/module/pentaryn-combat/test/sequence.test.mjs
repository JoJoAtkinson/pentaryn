// sequence.mjs, the swing loop (guide S6d's runner feature), driven through the strip as a player
// drives it: one usage card per item, one rollAttack per swing, pause on a closed roll, resume /
// retarget / swap / adv / quick / stop, abort, follow-ups, the tidy of an unused card, and the
// expectRoll tags. hud.mjs is NOT loaded here: the target picker is the fallback (or a test one).
// F.calls of whole runs are pinned (golden/sequence-*.json).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, makeCombat, makeItem, makeToken, setupWorld } from "./fixtures/world.mjs";
import { fighter, monk, rogue, slayer, wolf } from "./fixtures/actors.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F, doc } = W;
const lines = captureConsole();

const fig = fighter({ extraItems: [
  { id: "handaxe000000001", name: "Handaxe", type: "weapon", system: { identifier: "handaxe", equipped: true, properties: new Set(["lgt", "thr"]), attackModes: [{ value: "oneHanded" }, { value: "offhand" }, { value: "thrown" }] },
    activities: [{ id: "handaxeAtk000001", type: "attack", activation: "action" }] },
  { id: "wand000000000001", name: "Wand", type: "weapon", system: { equipped: true }, activities: [] },
] });
const rog = rogue();
const mnk = monk({ focus: 2 });
const mnk0 = monk({ focus: 0 });
const sly = slayer();
const gob = wolf({ id: "goblin0000000001", name: "Goblin" });
const ftok = makeToken(fig, { id: "tokFighter000001" });
const gtok = makeToken(gob, { id: "tokGoblin0000001", x: 1, disposition: -1 });
const gtok2 = makeToken(wolf({ id: "goblin0000000002", name: "Goblin Boss" }), { id: "tokGoblin0000002", x: 2, disposition: -1 });
makeCombat({ id: "c1", entries: [
  { id: "cb1", actor: fig, token: ftok }, { id: "cb2", actor: gob, token: gtok },
] });

await import("../combat.mjs");
const seq = await import("../sequence.mjs");
const strip = await import("../strip.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
mock.timers.tick(0);
await drain();
const api = F.game.pentaryn.combat;
F.calls.length = 0;
lines.length = 0;

const act = (actor, itemId) => [...actor.items.get(itemId).system.activities.values()][0];
const stripEl = () => doc.getElementById("pentaryn-combat-strip");
const click = async (pc, sel = "") => {
  const el = stripEl();
  const b = el.querySelector(`[data-pc="${pc}"]${sel}`);
  assert.ok(b, `strip button ${pc}${sel}`);
  await el.fire("click", { target: b });
  await drain();
};
const reset = (...actors) => { for (const a of actors) delete a.flags[MODULE]; };
const plain = calls => calls.filter(c => !["Hooks.call", "Hooks.callAll"].includes(c.op) || c.name.startsWith("pentarynCombat.") || c.name.startsWith("dnd5e."));
const tick = async ms => { mock.timers.tick(ms); await drain(); };

test("guards: an empty list or a non-owner rolls nothing; a second run while one is going is refused", async () => {
  assert.deepEqual(await seq.runSwings(fig, []), { rolled: 0, status: "done" });
  fig.isOwner = false;
  assert.deepEqual(await seq.runSwings(fig, [{ weaponId: "longsword0000001", kind: "main" }]), { rolled: 0, status: "done" });
  fig.isOwner = true;
  assert.equal(stripEl(), null);
  let release;
  act(fig, "longsword0000001").script.attack.push(() => new Promise(r => { release = r; }));
  const run = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }]);
  await drain();
  assert.deepEqual(await seq.runSwings(fig, [{ weaponId: "longsword0000001", kind: "main" }]), { rolled: 0, status: "busy" });
  assert.deepEqual(F.calls.filter(c => c.op === "notify"), [{ op: "notify", level: "warn", message: F.game.i18n.localize("PENTARYN_COMBAT.Strip.AlreadyRunning") }]);
  release({ total: 12 });
  assert.deepEqual(await run, { rolled: 1, status: "done" });
  await tick(400);
  reset(fig);
  F.calls.length = 0;
});

test("Full Attack with a closed roll: pause, the paused bar, resume, both swings (golden/sequence-pause.json)", async () => {
  F.game.user.targets.add(gtok);
  const a = act(fig, "longsword0000001");
  a.script.attack.push(null, { total: 14 }, { total: 19, isCritical: true });
  const run = api.fullAttack(fig);
  await drain();
  assert.equal(seq.running().state.status, "paused");
  const pausedHtml = stripEl().innerHTML;
  assert.ok(stripEl().classList.contains("paused"));
  await click("resume");
  const out = await run;
  await tick(400);
  assert.deepEqual(out, { rolled: 2, status: "done" });
  pinJSON("sequence-pause", { pausedHtml, calls: plain(F.calls.splice(0)), console: lines.splice(0) }, import.meta.url);
  assert.equal(fig.flags[MODULE].turn.attackAction.crit, true);
  reset(fig);
});

test("the running strip (golden/strip-running.json): title, swing i of n, weapon → target, kind, keys", async () => {
  let release;
  F.game.user.targets.add(gtok2);
  act(fig, "longsword0000001").script.attack.push(() => new Promise(r => { release = r; }));
  const run = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }, { weaponId: "dagger0000000001", mode: "offhand", kind: "nick" }], { title: "Test Title" });
  await drain();
  const running = stripEl().innerHTML;
  release(null);
  await drain();
  const paused = stripEl().innerHTML;
  await click("stop");
  const out = await run;
  await tick(400);
  pinJSON("strip-running", { running, paused, out, bottom: null }, import.meta.url);
  assert.deepEqual(out, { rolled: 0, status: "stopped" });
  F.game.user.targets.clear();
  reset(fig);
  F.calls.length = 0;
});

test("Adv / Dis: for the next swing only (adds, never removes), toggled off by a second press", async () => {
  F.game.user.targets.add(gtok);
  const a = act(fig, "longsword0000001");
  let release;
  a.script.attack.push(() => new Promise(r => { release = r; }), { total: 10 });
  const run = api.fullAttack(fig);
  await drain();
  await click("adv", '[data-value="advantage"]');
  assert.equal(seq.running().state.adv, "advantage", "pressed while swing 1's window is open: applies to the next roll made");
  await click("adv", '[data-value="advantage"]');
  assert.equal(seq.running().state.adv, null, "a second press clears it");
  await click("adv", '[data-value="disadvantage"]');
  release({ total: 9 });
  await run;
  await tick(400);
  const rolls = F.calls.filter(c => c.op === "activity.rollAttack");
  // W4-C1 [declared] (was KNOWN): Dis pressed while swing 1's roll window is open applies to swing 2,
  // the "next swing" the strip's hint promises; swing 1's own roll is untouched.
  assert.deepEqual(rolls.map(r => [r.config, r.dialog]), [[{}, {}], [{ rolls: [{ options: { disadvantage: true } }] }, { configure: true }]]);
  reset(fig);
  F.calls.length = 0;
});

test("Adv / Dis pressed while a swing's roll window is open applies to the next swing (W4-C1)", async () => {
  const a = act(fig, "longsword0000001");
  let release;
  a.script.attack.push(() => new Promise(r => { release = r; }), { total: 10 });
  const run = api.fullAttack(fig);
  await drain();
  await click("adv", '[data-value="disadvantage"]');
  release({ total: 9 });
  await run;
  await tick(400);
  const rolls = F.calls.filter(c => c.op === "activity.rollAttack");
  reset(fig);
  F.calls.length = 0;
  assert.deepEqual(rolls[1].config, { rolls: [{ options: { disadvantage: true } }] });
});

test("legacy oracles: the damage-label pieces of the HUD's weapon tile and the pause bar's swap tile", async () => {
  const legacy = await import("./fixtures/legacy-combat.mjs");
  const acts = [{ labels: { damage: [{ label: "1d8 + 3 Slashing" }], toHit: "+5" } }, { labels: { damages: [{ formula: "1d6" }] } }, {}, { labels: { damage: "1d4" } }, null];
  const rows = acts.map(x => ({ tile: legacy.weaponTileDamage(x), swap: legacy.swapTileStats(x) }));
  assert.deepEqual(rows, [
    { tile: "1d8 + 3 Slashing", swap: "+5 · 1d8 + 3 Slashing" }, { tile: "1d6", swap: "1d6" }, { tile: "", swap: "" }, { tile: "", swap: "" }, { tile: "", swap: "" },
  ]);
});

test("paused Adv applies to the resumed swing; Quick reuses the first swing's Adv and skips the dialog", async () => {
  const a = act(fig, "longsword0000001");
  a.script.attack.push(null, { total: 15, hasAdvantage: true });
  const run = api.fullAttack(fig);
  await drain();
  await click("adv", '[data-value="advantage"]');
  assert.equal(seq.running().state.status, "paused", "Adv on the pause bar keeps it paused");
  await click("resume");
  await run;
  await tick(400);
  const r1 = F.calls.filter(c => c.op === "activity.rollAttack").map(r => [r.config, r.dialog]);
  assert.deepEqual(r1, [[{}, {}], [{ rolls: [{ options: { advantage: true } }] }, {}], [{}, { configure: true }]]);
  reset(fig);
  F.calls.length = 0;
  await F.game.user.setFlag(MODULE, "quick", true);
  a.script.attack.push({ total: 15, hasAdvantage: true }, { total: 12 });
  await api.fullAttack(fig);
  await tick(400);
  const r2 = F.calls.filter(c => c.op === "activity.rollAttack").map(r => [r.config, r.dialog]);
  assert.deepEqual(r2, [[{}, {}], [{ rolls: [{ options: { advantage: true } }] }, { configure: false }]]);
  await F.game.user.setFlag(MODULE, "quick", false);
  reset(fig);
  F.calls.length = 0;
});

test("a modifier key on the click: swing 1 gets the event, later swings skip their dialog", async () => {
  await api.fullAttack(fig, null, { event: { shiftKey: true, type: "click" } });
  await tick(400);
  const r = F.calls.filter(c => c.op === "activity.rollAttack").map(r => [r.event, r.dialog]);
  assert.deepEqual(r, [[true, {}], [false, { configure: false }]]);
  reset(fig);
  F.calls.length = 0;
});

test("the Quick checkbox writes the user flag and re-renders", async () => {
  let release;
  act(fig, "longsword0000001").script.attack.push(() => new Promise(r => { release = r; }));
  const run = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }]);
  await drain();
  const box = stripEl().querySelector('[data-pc="quick"]');
  box.checked = true;
  await stripEl().fire("change", { target: box });
  await drain();
  assert.equal(F.game.user.flags[MODULE].quick, true);
  assert.ok(stripEl().querySelector('[data-pc="quick"]').hasAttribute("checked"));
  await stripEl().fire("click", { target: box });
  release({ total: 10 });
  await run;
  await tick(400);
  await F.game.user.setFlag(MODULE, "quick", false);
  reset(fig);
  F.calls.length = 0;
});

test("swap on the pause bar: the remaining main swings move to the new weapon, its Nick swing replaces the old, and the run resumes (golden/sequence-swap.json)", async () => {
  // Rogue: Scimitar (Light, Nick) + Dagger (Light, Nick) → [Scimitar, Nick: Dagger]; swap onto the Dagger
  const sc = act(rog, "scimitar00000001");
  sc.script.attack.push(null);
  const plan = api.plan(rog).swings;
  const run = seq.runSwings(rog, plan);
  await drain();
  const tiles = [...stripEl().querySelectorAll('[data-pc="swap"]')].map(b => [b.dataset.id, b.textContent]);
  F.calls.length = 0;
  await click("swap", '[data-id="dagger0000000002"]');
  const out = await run;
  await tick(400);
  const rolls = F.calls.filter(c => c.op === "activity.rollAttack").map(r => [r.activity, r.config]);
  pinJSON("sequence-swap", { plan, tiles, out, rolls }, import.meta.url);
  assert.deepEqual(rolls.map(r => r[0].split(".")[3]), ["dagger0000000002", "scimitar00000001"]);
  assert.deepEqual(out, { rolled: 2, status: "done" });
  reset(rog);
  F.calls.length = 0;
});

test("retarget: the fallback waits for the next targetToken; Stop cancels the wait", async () => {
  F.game.user.targets.clear();
  F.game.user.targets.add(gtok);
  const a = act(fig, "longsword0000001");
  a.script.attack.push(null, { total: 10 }, { total: 11 });
  const run = api.fullAttack(fig);
  await drain();
  await click("retarget");
  assert.ok(stripEl().classList.contains("picking"));
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => c.message), [F.game.i18n.localize("PENTARYN_COMBAT.Strip.PickTarget")]);
  F.Hooks.callAll("targetToken", F.game.users.get("player0000000001"), gtok2, true);
  F.Hooks.callAll("targetToken", F.game.user, gtok2, false);
  await drain();
  assert.equal(seq.running().state.status, "paused", "another user's or an untargeting event does not resolve it");
  F.Hooks.callAll("targetToken", F.game.user, gtok2, true);
  const out = await run;
  assert.equal(stripEl(), null, "picked: the run resumed and finished");
  assert.deepEqual(out, { rolled: 2, status: "done" });
  await tick(400);
  reset(fig);
  // the wait cancelled by Stop
  a.script.attack.push(null);
  const run2 = api.fullAttack(fig);
  await drain();
  await click("retarget");
  await click("stop");
  assert.deepEqual(await run2, { rolled: 0, status: "stopped" });
  assert.equal(F.listeners("targetToken"), 0, "the fallback's targetToken hook is gone");
  await tick(400);
  reset(fig);
  F.calls.length = 0;
});

test("abortFor ends a sequence waiting on the fallback Retarget pick", async () => {
  F.game.user.targets.clear();
  F.game.user.targets.add(gtok);
  const a = act(fig, "longsword0000001");
  for (const who of [fig, null]) {
    a.script.attack.push(null);
    const run = api.fullAttack(fig);
    let out = "unsettled";
    run.then(v => { out = v; });
    await drain();
    await click("retarget");
    assert.ok(stripEl().classList.contains("picking"));
    seq.abortFor(who);
    await drain();
    try {
      assert.deepEqual(out, { rolled: 0, status: "stopped" }, `abortFor(${who ? "fig" : "null"}) settles the run`);
    } finally {
      if (out === "unsettled" && stripEl()) { await click("stop"); await run; }
    }
    assert.equal(seq.running(), null);
    assert.equal(F.listeners("targetToken"), 0, "the fallback's targetToken hook is gone");
    assert.equal(stripEl(), null);
    await tick(400);
    reset(fig);
  }
  F.calls.length = 0;
});

test("Esc while picking a new target stops the sequence (strip: Esc while paused = Stop)", async () => {
  F.game.user.targets.clear();
  F.game.user.targets.add(gtok);
  const a = act(fig, "longsword0000001");
  a.script.attack.push(null);
  const run = api.fullAttack(fig);
  let out = "unsettled";
  run.then(v => { out = v; });
  await drain();
  await click("retarget");
  assert.ok(stripEl().classList.contains("picking"));
  await doc.fire("keydown", { key: "Escape" });
  await drain();
  try {
    assert.deepEqual(out, { rolled: 0, status: "stopped" }, "Esc during the pick settles the run");
  } finally {
    if (out === "unsettled" && stripEl()) { await click("stop"); await run; }
  }
  assert.equal(F.listeners("targetToken"), 0, "the fallback's targetToken hook is gone");
  assert.equal(stripEl(), null);
  await tick(400);
  reset(fig);
  F.calls.length = 0;
});

test("retarget through a registered picker: picked / cancelled (targets restored) / can't run / throws", async () => {
  const a = act(fig, "longsword0000001");
  const rows = [];
  for (const [label, picker] of [
    ["picked", async () => { F.game.user.targets.clear(); F.game.user.targets.add(gtok2); return true; }],
    ["cancelled after clearing the targets", async () => { F.game.user.targets.clear(); return false; }],
    ["can't run (undefined): the fallback", async () => undefined],
    ["throws: warned, the fallback", async () => { throw new Error("picker broke"); }],
  ]) {
    seq.registerTargetPicker(picker);
    F.game.user.targets.clear();
    F.game.user.targets.add(gtok);
    a.script.attack.push(null, { total: 10 }, { total: 11 });
    const run = api.fullAttack(fig);
    await drain();
    F.calls.length = 0;
    await click("retarget");
    const status = seq.running()?.state.status;
    const targets = [...F.game.user.targets].map(t => t.id);
    if (status === "paused" && F.listeners("targetToken")) {
      F.Hooks.callAll("targetToken", F.game.user, gtok2, true);
      await drain();
    }
    if (seq.running()?.state.status === "paused") await click("resume");
    const out = await run;
    await tick(400);
    rows.push({ label, statusAfterPick: status, targetsAfterPick: targets, out, calls: F.calls.filter(c => ["canvas.setTargets", "notify"].includes(c.op)), console: lines.splice(0) });
    reset(fig);
  }
  seq.registerTargetPicker(null);
  pinJSON("sequence-retarget", rows, import.meta.url);
  F.calls.length = 0;
});

test("Stop with the swing's roll window open closes that window unrolled; abortFor does the same", async () => {
  const a = act(fig, "longsword0000001");
  const makeWin = (subject, cls = "roll-configuration") => {
    const el = doc.createElement("div");
    el.className = `application ${cls}`;
    const app = { element: el, config: { subject }, closed: 0, close() { this.closed += 1; return Promise.resolve(); } };
    F.foundry.applications.instances.set(`app${F.foundry.applications.instances.size}`, app);
    return app;
  };
  let release;
  a.script.attack.push(() => new Promise(r => { release = r; }));
  const own = makeWin(a);
  const other = makeWin(act(fig, "dagger0000000001"));
  const dmgWin = makeWin(a, "damage-roll");
  const run = api.fullAttack(fig);
  await drain();
  await click("stop");
  assert.deepEqual([own.closed, other.closed, dmgWin.closed], [1, 0, 0]);
  release(null);
  assert.deepEqual(await run, { rolled: 0, status: "stopped" });
  await tick(400);
  // abortFor: another actor leaves it alone; this one (or no actor) aborts it
  a.script.attack.push(() => new Promise(r => { release = r; }));
  const run2 = api.fullAttack(fig);
  await drain();
  seq.abortFor(rog);
  assert.equal(seq.running().abort, false);
  seq.abortFor(fig);
  assert.equal(seq.running().abort, true);
  assert.equal(own.closed, 2);
  release({ total: 10 });
  assert.deepEqual(await run2, { rolled: 1, status: "stopped" }, "the roll in flight lands, then the loop stops");
  await tick(400);
  seq.abortFor(null);   // nothing running: no-op
  F.foundry.applications.instances.clear();
  reset(fig);
  F.calls.length = 0;
});

test("combat-core-ROB-2 [declared]: api.abort resolves a Token, name, id or UUID; a miss never aborts; no argument aborts any", async () => {
  const a = act(fig, "longsword0000001");
  const refs = [["token", ftok], ["name", fig.name], ["id", fig.id], ["uuid", fig.uuid], ["actor", fig], ["no argument", undefined]];
  for (const [label, ref] of refs) {
    let release;
    a.script.attack.push(() => new Promise(r => { release = r; }));
    const run = api.fullAttack(fig);
    await drain();
    // a ref that resolves to nothing, or to another actor, leaves the running sequence alone
    for (const miss of ["Nobody At All", "zzzzzzzzzzzzzzzz", rog, rog.name, {}]) {
      api.abort(miss);
      assert.equal(seq.running().abort, false, `${label}: abort(${miss?.name ?? miss}) is a no-op`);
    }
    if (ref === undefined) api.abort(); else api.abort(ref);
    assert.equal(seq.running().abort, true, `abort by ${label} stops the run`);
    release(null);
    assert.equal((await run).status, "stopped", label);
    await tick(400);
  }
  F.foundry.applications.instances.clear();
  reset(fig);
  F.calls.length = 0;
});

test("a cancelled usage card pauses; a weapon with no attack activity stops with a warning", async () => {
  const a = act(fig, "longsword0000001");
  a.script.use.push(null);
  a.script.attack.push({ total: 10 }, { total: 10 });
  const run = api.fullAttack(fig);
  await drain();
  assert.equal(seq.running().state.status, "paused");
  await click("resume");
  assert.deepEqual(await run, { rolled: 2, status: "done" });
  await tick(400);
  F.calls.length = 0;
  const out = await seq.runSwings(fig, [{ weaponId: "wand000000000001", kind: "main" }]);
  assert.deepEqual(out, { rolled: 0, status: "stopped" });
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => c.message), [F.game.i18n.localize("PENTARYN_COMBAT.Strip.NoWeapon")]);
  await tick(400);
  reset(fig);
  F.calls.length = 0;
});

test("attack mode: a swing's own mode wins; a remembered Offhand on a main swing goes back to the main mode", async () => {
  const axe = fig.items.get("handaxe000000001");
  const a = act(fig, "handaxe000000001");
  await axe.setFlag("dnd5e", `last.${a.id}.attackMode`, "offhand");
  F.calls.length = 0;
  await seq.runSwings(fig, [{ weaponId: "handaxe000000001", mode: null, kind: "main" }, { weaponId: "handaxe000000001", mode: "thrown", kind: "main" }]);
  await tick(400);
  assert.deepEqual(F.calls.filter(c => c.op === "activity.rollAttack").map(r => r.config.attackMode ?? null), ["oneHanded", "thrown"]);
  await axe.setFlag("dnd5e", `last.${a.id}.attackMode`, "thrown");
  F.calls.length = 0;
  await seq.runSwings(fig, [{ weaponId: "handaxe000000001", mode: null, kind: "main" }]);
  await tick(400);
  assert.deepEqual(F.calls.filter(c => c.op === "activity.rollAttack").map(r => r.config.attackMode ?? null), [null], "a remembered Thrown stays the player's choice");
  delete axe.flags.dnd5e;
  reset(fig);
  F.calls.length = 0;
});

test("the damage settle: the loop waits for the swing's damage roll (aoe auto-damage) before the next swing", async () => {
  const a = act(fig, "longsword0000001");
  let finishDamage;
  a.script.damage.push(() => new Promise(r => { finishDamage = r; }));
  a.script.attack.push(async () => { a.rollDamage({}); return { total: 15 }; }, { total: 11 });
  const run = api.fullAttack(fig);
  await drain();
  assert.equal(F.calls.filter(c => c.op === "activity.rollAttack").length, 1);
  await tick(150);
  await tick(150);
  assert.equal(F.calls.filter(c => c.op === "activity.rollAttack").length, 1, "still waiting at 300 ms (a resolver is open)");
  finishDamage({ total: 7 });
  await drain();
  await tick(150);
  assert.equal(F.calls.filter(c => c.op === "activity.rollAttack").length, 2, "damage done: swing 2");
  await run;
  await tick(400);
  reset(fig);
  F.calls.length = 0;
});

test("the damage settle gives up after ~0.6 s with no resolver open and no damage hook", async () => {
  const a = act(fig, "longsword0000001");
  a.script.damage.push(() => new Promise(() => {}));
  a.script.attack.push(async () => { a.rollDamage({}); return { total: 15 }; }, { total: 11 });
  const run = api.fullAttack(fig);
  await drain();
  for (let i = 0; i < 4; i++) await tick(150);
  assert.equal(F.calls.filter(c => c.op === "activity.rollAttack").length, 1, "4 idle looks, 600 ms: not yet (> 600 needed)");
  await tick(150);
  assert.equal(F.calls.filter(c => c.op === "activity.rollAttack").length, 2);
  await run;
  await tick(400);
  reset(fig);
  F.calls.length = 0;
});

test("the damage settle keeps waiting while a RollResolver is open", async () => {
  const a = act(fig, "longsword0000001");
  const R = F.foundry.applications.dice.RollResolver;
  const resolver = new R();
  F.foundry.applications.instances.set("resolver", resolver);
  a.script.damage.push(() => new Promise(() => {}));
  a.script.attack.push(async () => { a.rollDamage({}); return { total: 15 }; }, { total: 11 });
  const run = api.fullAttack(fig);
  await drain();
  for (let i = 0; i < 10; i++) await tick(150);
  assert.equal(F.calls.filter(c => c.op === "activity.rollAttack").length, 1, "1.5 s with the resolver open");
  F.foundry.applications.instances.delete("resolver");
  for (let i = 0; i < 4; i++) await tick(150);
  assert.equal(F.calls.filter(c => c.op === "activity.rollAttack").length, 2);
  await run;
  await tick(400);
  reset(fig);
  F.calls.length = 0;
});

test("the end: last weapon remembered (main first swing only), unused cards tidied 400 ms later, sequenceEnd (golden/sequence-tidy.json)", async () => {
  const rows = [];
  const a = act(fig, "longsword0000001");
  // stopped before any roll: the card this run posted is an orphan
  a.script.attack.push(null);
  let run = api.fullAttack(fig);
  await drain();
  await click("stop");
  await run;
  const card = F.game.messages.contents.filter(m => m.type === "usage").at(-1);
  await tick(399);
  rows.push({ label: "stopped before rolling, 399 ms", cardThere: !!F.game.messages.get(card.id) });
  await tick(1);
  rows.push({ label: "…400 ms", cardThere: !!F.game.messages.get(card.id), last: fig.flags[MODULE]?.last ?? null });
  // with tidyCancelledAttacks off the card stays
  await F.game.settings.set(MODULE, "tidyCancelledAttacks", false);
  a.script.attack.push(null);
  run = api.fullAttack(fig);
  await drain();
  await click("stop");
  await run;
  const kept = F.game.messages.contents.filter(m => m.type === "usage").at(-1);
  await tick(400);
  rows.push({ label: "setting off", cardThere: !!F.game.messages.get(kept.id) });
  await F.game.settings.set(MODULE, "tidyCancelledAttacks", true);
  // a card that consumed something stays
  a.script.use.push({ deltas: { item: { x: [{ keyPath: "system.quantity", delta: -1 }] } } });
  a.script.attack.push(null);
  run = api.fullAttack(fig);
  await drain();
  await click("stop");
  await run;
  const used = F.game.messages.contents.filter(m => m.type === "usage").at(-1);
  await tick(400);
  rows.push({ label: "consumed ammunition", cardThere: !!F.game.messages.get(used.id) });
  // a delete that fails is warned
  a.script.attack.push(null);
  run = api.fullAttack(fig);
  await drain();
  await click("stop");
  await run;
  const failing = F.game.messages.contents.filter(m => m.type === "usage").at(-1);
  failing.delete = async () => { throw new Error("gone already"); };
  await tick(400);
  rows.push({ label: "delete rejects", console: lines.splice(0) });
  // an off-hand first swing is not remembered as the Full Attack weapon
  reset(fig);
  await seq.runSwings(fig, [{ weaponId: "dagger0000000001", mode: "offhand", kind: "offhand" }]);
  await tick(400);
  rows.push({ label: "off-hand only", last: fig.flags[MODULE]?.last ?? null });
  pinJSON("sequence-tidy", rows, import.meta.url);
  assert.equal(rows[1].cardThere, false);
  assert.equal(rows[2].cardThere, true);
  assert.equal(rows[3].cardThere, true);
  reset(fig);
  F.calls.length = 0;
});

test("follow-ups: Off-hand, Nick, Martial Arts, Hew, Pole Strike, unknown (golden/sequence-followups.json)", async () => {
  const rows = [];
  const run = async (label, actor, f) => {
    reset(actor);
    F.calls.length = 0;
    const out = await api.followUp(actor, f);
    await tick(400);
    rows.push({ label, out, rolls: F.calls.filter(c => c.op === "activity.rollAttack").map(r => [r.activity, r.config]), events: F.calls.filter(c => c.op === "Hooks.callAll" && c.name.startsWith("pentarynCombat.")).map(c => c.name), turn: actor.flags[MODULE]?.turn ?? null });
  };
  await run("Off-hand: Dagger", fig, { kind: "offhand", weaponId: "dagger0000000001" });
  await run("Nick: Dagger", rog, { kind: "nick", weaponId: "dagger0000000002" });
  await run("Martial Arts", mnk, { kind: "martial-arts", weaponId: "unarmedStrike001" });
  await run("Hew: Glaive", sly, { kind: "hew", weaponId: "glaive0000000001" });
  await run("Pole Strike", sly, { kind: "pole-strike", weaponId: "polearmMaster001" });
  act(sly, "glaive0000000001").script.attack.push(null);
  const pending = api.followUp(sly, { kind: "hew", weaponId: "glaive0000000001" });
  await drain();
  await click("stop");
  rows.push({ label: "Hew closed and stopped: nothing recorded", out: await pending, turn: sly.flags[MODULE]?.turn ?? null });
  await tick(400);
  await run("unknown kind", fig, { kind: "cleave", weaponId: "longsword0000001" });
  pinJSON("sequence-followups", rows, import.meta.url);
  F.calls.length = 0;
});

test("api.followUp with a missing or non-object followUp answers unknown, not a TypeError (combat-core-ROB-6)", async () => {
  for (const f of [undefined, null, "offhand", 3]) {
    F.calls.length = 0;
    assert.deepEqual(await api.followUp(fig, f), { rolled: 0, status: "unknown" }, `combat-core-ROB-6: ${String(f)}`);
    assert.deepEqual(F.calls.filter(c => c.op === "activity.rollAttack"), [], "nothing rolled");
  }
  F.calls.length = 0;
});

test("Flurry of Blows: its own card spends the Focus first; missing / no Focus / cancelled (golden/sequence-flurry.json)", async () => {
  const rows = [];
  reset(mnk);
  F.calls.length = 0;
  const out = await api.followUp(mnk, { kind: "flurry", weaponId: "unarmedStrike001", count: 2 });
  await tick(400);
  rows.push({ label: "two strikes", out, calls: plain(F.calls.splice(0)), turn: mnk.flags[MODULE]?.turn ?? null });
  rows.push({ label: "no Focus left", out: await api.followUp(mnk0, { kind: "flurry", weaponId: "unarmedStrike001" }), notes: F.calls.filter(c => c.op === "notify").map(c => c.message) });
  F.calls.length = 0;
  rows.push({ label: "no Flurry activity (a Fighter)", out: await api.followUp(fig, { kind: "flurry", weaponId: "longsword0000001" }) });
  mnk.items.get("monksFocus000001").system.activities.get("flurryAct0000001").script.use.push(null);
  rows.push({ label: "Flurry's card cancelled", out: await api.followUp(mnk, { kind: "flurry", weaponId: "unarmedStrike001" }) });
  pinJSON("sequence-flurry", rows, import.meta.url);
  reset(mnk);
  F.calls.length = 0;
});

test("expectRoll / taggedKind / forgetRoll: a tag for the next roll, stale after two minutes", () => {
  const uuid = act(fig, "longsword0000001").uuid;
  assert.equal(seq.taggedKind(uuid), null);
  seq.expectRoll(uuid, "reaction");
  assert.equal(seq.taggedKind(uuid), "reaction");
  mock.timers.tick(119_999);
  assert.equal(seq.taggedKind(uuid), "reaction");
  mock.timers.tick(1);
  assert.equal(seq.taggedKind(uuid), null, "120 s: stale");
  seq.expectRoll(uuid, "main");
  seq.forgetRoll(uuid);
  assert.equal(seq.taggedKind(uuid), null);
  seq.expectRoll(null, "main");
  assert.equal(seq.taggedKind(null), null);
});

test("fullAttackPlan: weapon plans, Nick extras, Multiattack picks and turns", async () => {
  const core = await import("../combat-core.mjs");
  const turn = (o = {}) => ({ ...core.freshTurn("c1:1:cb1"), ...o, attackAction: { ...core.freshTurn("x").attackAction, ...(o.attackAction ?? {}) } });
  const ma = { plan: [{ itemId: "bite", count: 2 }], groups: [{ count: 2, choices: ["bite", "claw"] }], total: 2 };
  const rows = {
    fighter: seq.fullAttackPlan(fig, { weaponId: "longsword0000001", count: 2 }),
    fighterOneDone: seq.fullAttackPlan(fig, { weaponId: "longsword0000001", count: 2, inCombat: true, turn: turn({ attackAction: { swings: 1 } }) }),
    fighterOutOfCombatIgnoresTurn: seq.fullAttackPlan(fig, { weaponId: "longsword0000001", count: 2, turn: turn({ attackAction: { swings: 2 } }) }),
    rogueNick: seq.fullAttackPlan(rog, { weaponId: "scimitar00000001", count: 1 }),
    rogueNickSpent: seq.fullAttackPlan(rog, { weaponId: "scimitar00000001", count: 1, turn: turn({ nick: true }) }),
    rogueNoneLeft: seq.fullAttackPlan(rog, { weaponId: "scimitar00000001", count: 1, inCombat: true, turn: turn({ attackAction: { swings: 1 } }) }),
    multiattack: seq.fullAttackPlan(gob, { multiattack: ma, count: 2 }),
    multiattackPick: seq.fullAttackPlan(gob, { multiattack: ma, count: 2, pick: { "*": "claw" } }),
    multiattackOneDone: seq.fullAttackPlan(gob, { multiattack: ma, count: 2, inCombat: true, turn: turn({ attackAction: { swings: 1 } }) }),
    multiattackOtherAction: seq.fullAttackPlan(gob, { multiattack: ma, count: 2, inCombat: true, turn: turn({ otherActions: 1, otherAction: true }) }),
    noWeapon: seq.fullAttackPlan(fig, {}),
  };
  pinJSON("full-attack-plans", rows, import.meta.url);
  assert.deepEqual(rows.rogueNick.swings.map(s => s.kind), ["main", "nick"]);
});

test("combat-riders-22 [declared] (was KNOWN): Multiattack + Action Surge — two swings done, a surge: the surge's run is planned", () => {
  const ma = { plan: [{ itemId: "bite", count: 2 }], groups: [{ count: 2, choices: ["bite"] }], total: 2 };
  const t = { key: "c1:1:cb2", attackAction: { swings: 2, weapons: ["bite"] }, surges: 1, otherActions: 0, riders: {}, followUps: [] };
  assert.deepEqual(seq.fullAttackPlan(gob, { multiattack: ma, count: 2, inCombat: true, turn: t }), {
    swings: [{ weaponId: "bite", mode: null, kind: "main" }, { weaponId: "bite", mode: null, kind: "main" }], count: 2, left: 2, weaponId: "bite" });
});

test("Multiattack + Action Surge: the surge's Attack action gets its own two swings", () => {
  const ma = { plan: [{ itemId: "bite", count: 2 }], groups: [{ count: 2, choices: ["bite"] }], total: 2 };
  const t = { key: "c1:1:cb2", attackAction: { swings: 2, weapons: ["bite"] }, surges: 1, otherActions: 0, riders: {}, followUps: [] };
  assert.equal(seq.fullAttackPlan(gob, { multiattack: ma, count: 2, inCombat: true, turn: t }).swings.length, 2);
});

test("strip exports used by the loop: show / update / hide / picking / waitChoice / choose / onceCancel", async () => {
  strip.show({ numbers: { current: 1, total: 2 }, status: "running", weapon: "Longsword", title: "T", kind: "main", quick: false }, {});
  assert.ok(stripEl());
  strip.picking(true);
  assert.ok(stripEl().classList.contains("picking"));
  strip.picking(false);
  let cancelled = 0;
  strip.onceCancel(() => { cancelled += 1; });
  const wait = strip.waitChoice({ numbers: { current: 1, total: 2 }, status: "paused", weapon: "Longsword", title: "T", note: "main" });
  strip.choose({ type: "resume" });
  assert.deepEqual(await wait, { type: "resume" });
  strip.choose({ type: "nobody waiting" });
  const wait2 = strip.waitChoice({ status: "paused" });
  strip.hide();
  assert.deepEqual(await wait2, { type: "stop" }, "hide resolves a pending wait with stop");
  assert.equal(cancelled, 1, "hide runs the cancel callbacks");
  assert.equal(stripEl(), null);
  strip.update({ status: "running" });   // no strip: no-op
  strip.picking(true);
});
