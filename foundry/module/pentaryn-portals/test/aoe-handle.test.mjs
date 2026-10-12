// Finding aoe-movement-portals-43: one isAoeHandle in core (a copy of pentaryn-aoe's
// isHandleTarget, minus its doc.token branch). Bare node: core only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAoeHandle } from "../portals-core.mjs";

test("isAoeHandle: the token-side handle flag, or the actor-side handleActor flag", () => {
  assert.equal(isAoeHandle({ "pentaryn-aoe": { handle: "r1" } }, {}), true);
  assert.equal(isAoeHandle({}, { "pentaryn-aoe": { handleActor: true } }), true);
  assert.equal(isAoeHandle({}, {}), false);
  assert.equal(isAoeHandle(undefined, undefined), false);
  assert.equal(isAoeHandle({ "pentaryn-aoe": { handle: "" } }, { "pentaryn-aoe": { handleActor: false } }), false);
  assert.equal(isAoeHandle({ "pentaryn-aoe": { handleActor: true } }, {}), false, "handleActor counts on the actor only");
});

// ORACLE: pentaryn-aoe/core.mjs `isHandleTarget` (lines 364-368 at wave-3), copied verbatim — a
// module test may not import another module (the imports gate). If aoe changes its predicate, this
// copy and portals' isAoeHandle are both re-checked by hand (README "Flags other modules read").
function isHandleTarget(target, module = "pentaryn-aoe") {
  const doc = target?.document ?? target;
  const flag = (d) => !!d?.flags?.[module]?.handle;
  return flag(doc) || flag(doc?.token) || (!!doc?.flags?.[module]?.handleActor);
}

test("agrees with pentaryn-aoe's isHandleTarget on the token-flag and actor-flag shapes", () => {
  const cases = [
    [{ flags: { "pentaryn-aoe": { handle: "r1" } } }, {}],
    [{ flags: {} }, { "pentaryn-aoe": { handleActor: true } }],
    [{ flags: {} }, {}],
    [{ flags: { "pentaryn-aoe": { handle: "r1" } } }, { "pentaryn-aoe": { handleActor: true } }],
  ];
  for (const [token, actorFlags] of cases) {
    const theirs = isHandleTarget(token) || isHandleTarget({ flags: actorFlags });
    assert.equal(isAoeHandle(token.flags, actorFlags), theirs, JSON.stringify([token, actorFlags]));
  }
});
