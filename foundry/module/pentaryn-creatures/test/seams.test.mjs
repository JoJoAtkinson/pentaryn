// The pure seams in creatures-core.mjs (guide step 2): the module constants, the hand-copied
// aoe-handle / Item Piles predicates against the verbatim oracle (transform-creatures-30), and the
// seams the standalone fixes switch on — stripMayChange (-25), makeCoalescer (-26),
// shouldQueueLight (-27), safely (-29), countLit (-31), shouldPollDock / dockKey (-40).
// Core is imported first, before anything that could install a global.
import * as core from "../creatures-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import * as legacy from "./fixtures/legacy-creatures.mjs";
import { ACTORS, ALPHA_TOKENS } from "./fixtures/world.mjs";

const {
  MODULE, SHORT, NS, VERSION, CONTRACT, I18N, CSS, FLAG_SCOPE, HOOKS, isAoeHandle, isItemPile, stripMayChange,
  STRIP_KEYS, shouldQueueLight, LIGHT_KEYS, makeCoalescer, safely, countLit, shouldPollDock, dockKey, stripDock,
} = core;

test("constants: VERSION is module.json's version; names follow the blueprint", () => {
  assert.equal(VERSION, manifestOf(new URL("..", import.meta.url)).version);
  assert.deepEqual(
    { MODULE, SHORT, NS, CONTRACT, I18N, CSS, FLAG_SCOPE },
    { MODULE: "pentaryn-creatures", SHORT: "creatures", NS: "creatures", CONTRACT: "pentaryn-creatures/api@1",
      I18N: "PENTARYN_CREATURES", CSS: "pcr-", FLAG_SCOPE: "pentaryn-creatures" },
  );
  assert.deepEqual(HOOKS, {});
  assert.ok(Object.isFrozen(HOOKS));
});

test("transform-creatures-30: isAoeHandle — token flag handle or actor flag handleActor; no doc.token branch", () => {
  assert.equal(isAoeHandle({ "pentaryn-aoe": { handle: "r1" } }, {}), true);
  assert.equal(isAoeHandle({}, { "pentaryn-aoe": { handleActor: true } }), true);
  assert.equal(isAoeHandle({}, {}), false);
  assert.equal(isAoeHandle(undefined, undefined), false);
  assert.equal(isAoeHandle({ "pentaryn-aoe": { handleActor: true } }, {}), false, "handleActor on the token does not count");
  assert.equal(isAoeHandle({}, { "pentaryn-aoe": { handle: "r1" } }), false, "handle on the actor does not count");
});

test("transform-creatures-30: isItemPile — data.enabled on the token or its actor", () => {
  const on = { "item-piles": { data: { enabled: true } } };
  assert.equal(isItemPile(on, {}), true);
  assert.equal(isItemPile({}, on), true);
  assert.equal(isItemPile({ "item-piles": { data: { enabled: false } } }, {}), false);
  assert.equal(isItemPile({ "item-piles": { enabled: true } }, {}), false);
  assert.equal(isItemPile(null, null), false);
});

test("transform-creatures-30: the core predicates equal the verbatim oracle over the world fixture and hostile shapes", () => {
  const actors = new Map(ACTORS.map(a => [a.id, a]));
  const tokens = ALPHA_TOKENS().map(t => ({ ...t, flags: t.flags ?? {}, actor: actors.get(t.actorId) ?? null }));
  tokens.push(
    { flags: { "pentaryn-aoe": { handle: "" } } },
    { flags: { "pentaryn-aoe": { handleActor: true } } },
    { token: { flags: { "pentaryn-aoe": { handle: "r1" } } } },
    { flags: {}, actor: { flags: { "item-piles": { data: { enabled: 1 } } } } },
    {},
  );
  for (const t of tokens) {
    assert.equal(isAoeHandle(t.flags, t.actor?.flags), legacy.isProp(t), JSON.stringify(t));
    assert.equal(isItemPile(t.flags, t.actor?.flags), legacy.isPile(t), JSON.stringify(t));
  }
  const hits = tokens.filter(t => isAoeHandle(t.flags, t.actor?.flags) || isItemPile(t.flags, t.actor?.flags)).map(t => t.id ?? "?");
  assert.deepEqual(hits, ["tHandle", "tHandle2", "tPile", "tPile2", "?"]);
});

test("transform-creatures-25 seam: stripMayChange — only fields the strip's summary reads", () => {
  const rows = [
    [{ x: 1, y: 2 }, false], [{ elevation: 5 }, false], [{ rotation: 90 }, false], [{ name: "x" }, true],
    [{ texture: { src: "a" } }, true], [{ hidden: true }, true], [{ delta: { system: {} } }, true],
    [{ flags: { "item-piles": {} } }, true], [{ actorId: "a" }, true], [{ actorLink: true }, true],
    [null, false], [undefined, false], ["name", false],
  ];
  assert.deepEqual(rows.map(([c]) => stripMayChange(c)), rows.map(([, w]) => w));
  assert.deepEqual([...STRIP_KEYS], ["name", "texture", "hidden", "actorId", "actorLink", "delta", "flags"]);
});

test("transform-creatures-27 seam: shouldQueueLight — light keys queue, our own write never does", () => {
  assert.equal(shouldQueueLight({ light: { bright: 5 } }, {}), true);
  assert.equal(shouldQueueLight({ x: 1 }, {}), false);
  assert.equal(shouldQueueLight({ flags: {} }, { pentarynCreatures: true }), false);
  assert.equal(shouldQueueLight({ actorId: "a" }, undefined), true);
  assert.equal(shouldQueueLight(null, {}), false);
  assert.equal(shouldQueueLight("light", {}), false);
  assert.deepEqual([...LIGHT_KEYS], ["light", "actorId", "actorLink", "delta", "flags"]);
});

/** A fake clock: setTimeout/clearTimeout over a sorted queue, advanced by `to(t)`. */
function clock() {
  let now = 0, seq = 0;
  const timers = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: id => { timers.delete(id); },
    to(t) {
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= t).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = t;
    },
    get now() { return now; },
  };
}

test("transform-creatures-26 seam: makeCoalescer in debounce mode reproduces today — 0/50/100/150/190 → one run at 390", () => {
  const c = clock();
  const runs = [];
  const q = makeCoalescer(200, () => runs.push(c.now), c);
  for (const t of [0, 50, 100, 150, 190]) { c.to(t); q.arm(); }
  c.to(389);
  assert.deepEqual(runs, []);
  c.to(2000);
  assert.deepEqual(runs, [390]);
  assert.equal(q.pending, false);
});

test("transform-creatures-26 seam: makeCoalescer in window mode — one run at 200, a later arm runs again 200 ms on", () => {
  const c = clock();
  const runs = [];
  const q = makeCoalescer(200, () => runs.push(c.now), { setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, mode: "window" });
  for (const t of [0, 50, 100, 150, 190]) { c.to(t); q.arm(); }
  c.to(250);
  assert.deepEqual(runs, [200]);
  q.arm();
  assert.equal(q.pending, true);
  c.to(2000);
  assert.deepEqual(runs, [200, 450]);
  q.arm();
  q.cancel();
  c.to(5000);
  assert.deepEqual(runs, [200, 450], "cancel drops the armed run");
});

test("transform-creatures-29 seam: safely — a throw calls onError and returns the fallback", () => {
  const errors = [];
  const boom = () => { throw new Error("private API moved"); };
  assert.equal(safely(boom, e => errors.push(e.message)), false);
  assert.equal(safely(boom, e => errors.push(e.message)), false);
  assert.deepEqual(errors, ["private API moved", "private API moved"], "warn-once is the caller's logger's job");
  assert.equal(safely(() => true, () => errors.push("x")), true);
  assert.equal(safely(boom, undefined, null), null);
  assert.equal(errors.length, 2);
});

test("transform-creatures-31 seam: countLit counts our light flags (objects) only", () => {
  assert.equal(countLit([{ bright: 5, dim: 5 }, false, undefined]), 1);
  assert.equal(countLit([null, [5], { bright: 0, dim: 0 }, "x", 5]), 1);
  assert.equal(countLit(null), 0);
});

test("transform-creatures-40 seams: shouldPollDock needs all three; dockKey fingerprints a dock", () => {
  assert.equal(shouldPollDock({ stripPresent: true, floatOverHud: true, argonActive: true }), true);
  assert.equal(shouldPollDock({ stripPresent: false, floatOverHud: true, argonActive: true }), false);
  assert.equal(shouldPollDock({ stripPresent: true, floatOverHud: false, argonActive: true }), false);
  assert.equal(shouldPollDock({ stripPresent: true, floatOverHud: true, argonActive: false }), false);
  assert.equal(shouldPollDock(), false);
  assert.equal(dockKey(stripDock({ top: 700, left: 300, width: 900, height: 120 }, 900)), "208,300");
  assert.equal(dockKey(null), null);
});

test("stripDock (legacy suite's four checks, ported)", () => {
  assert.deepEqual(stripDock({ top: 700, left: 300, width: 900, height: 120 }, 900), { bottom: 208, left: 300 });
  assert.deepEqual([stripDock(null, 900), stripDock({ top: 700, left: 0, width: 0, height: 0 }, 900)], [null, null]);
  assert.equal(stripDock({ top: 950, left: 300, width: 900, height: 120 }, 900), null);
  assert.equal(stripDock({ top: 700, left: -20, width: 900, height: 120 }, 900).left, 8);
});
