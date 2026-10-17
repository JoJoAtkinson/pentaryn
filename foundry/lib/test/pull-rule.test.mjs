import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { usersToPull, ownsOtherSighted, pullCandidates, sourceLevel } from "../pull-rule.mjs";

/* ── usersToPull: core's Teleport Token pull rule for a GM mover ─────────── */

// A line-for-line copy of TeleportTokenRegionBehaviorType#getUsersToPull (v14.369,
// client/data/region-behaviors/teleport-token.mjs:212-236) with the GM caller as both `user` and
// `designatedUser`: the "the mover is always pulled" branch never applies to a player. One row per clause.
// (Moved here from pentaryn-portals' core.test, code review 2026-10-17 CR8.)
test("usersToPull: core's #getUsersToPull rule, one row per clause (teleport-token.mjs:212-236)", () => {
  const where = { hidden: false, scene: "SceneA", level: "L0" };
  const u = (id, o = {}) => ({ id, active: true, isGM: false, viewedScene: "SceneA", viewedLevel: "L0", observes: true, ownsOtherSighted: false, ...o });
  const rows = [
    ["happy path → pulled", u("p"), ["p"]],
    ["inactive → not pulled", u("p", { active: false }), []],
    ["a GM → not pulled", u("p", { isGM: true }), []],
    ["viewing another scene → not pulled", u("p", { viewedScene: "SceneB" }), []],
    ["viewing nothing (no scene) → not pulled", u("p", { viewedScene: null }), []],
    ["viewing another level of the scene → not pulled", u("p", { viewedLevel: "L1" }), []],
    ["does not observe the token → not pulled", u("p", { observes: false }), []],
    ["still owns another non-hidden sighted token on that level → not pulled", u("p", { ownsOtherSighted: true }), []],
  ];
  for (const [name, rec, want] of rows) assert.deepEqual(usersToPull([rec], where), want, name);
  assert.deepEqual(usersToPull([u("p"), u("q")], { ...where, hidden: true }), [], "hidden token → []");
  assert.deepEqual(usersToPull([u("p", { viewedLevel: undefined })], { ...where, level: null }), ["p"], "no level on either side");
  assert.deepEqual(usersToPull([u("p", { viewedLevel: null })], where), [], "the token is on a level the user does not view");
  assert.deepEqual(usersToPull([u("a"), u("b", { observes: false }), u("c"), u("d", { isGM: true })], where), ["a", "c"]);
  assert.deepEqual(usersToPull([], where), []);
});

/* ── ownsOtherSighted: core's shared "still owns a sighted token there" test ── */

/** A token whose permission test is the only ownership read (core's TokenDocument#testUserPermission). */
const tok = (id, { owners = [], hidden = false, level = "L0", sight = true, actor } = {}) => {
  const t = { id, hidden, _source: { level }, level, sight: { enabled: sight },
    testUserPermission: (user, lvl) => (lvl === "OWNER" || lvl === "OBSERVER") && owners.includes(user.id) };
  if (actor) t.actor = actor;
  return t;
};
const ANA = { id: "ana" };

test("ownsOtherSighted: one row per clause of core's test (documents/token.mjs:2943-2944, teleport-token.mjs:231-232)", () => {
  const scene = tokens => ({ tokenVision: true, tokens });
  const rows = [
    ["another owned, non-hidden, sighted token on the level → true", [tok("a", { owners: ["ana"] })], true],
    ["only the excepted token → false", [tok("moved", { owners: ["ana"] })], false],
    ["hidden → false", [tok("a", { owners: ["ana"], hidden: true })], false],
    ["not owned → false", [tok("a", { owners: ["bo"] })], false],
    ["on another level → false", [tok("a", { owners: ["ana"], level: "L1" })], false],
    ["no sight with token vision on → false", [tok("a", { owners: ["ana"], sight: false })], false],
  ];
  for (const [name, toks, want] of rows) assert.equal(ownsOtherSighted(scene(toks), ANA, { except: "moved", level: "L0" }), want, name);
  // token vision off: sight does not matter
  assert.equal(ownsOtherSighted({ tokenVision: false, tokens: [tok("a", { owners: ["ana"], sight: false })] }, ANA, { level: "L0" }), true);
  // `except` may be the document itself
  const moved = tok("moved", { owners: ["ana"] });
  assert.equal(ownsOtherSighted(scene([moved]), ANA, { except: moved, level: "L0" }), false);
});

test("ownsOtherSighted: ownership is TokenDocument#testUserPermission alone — never doc.actor (no synthetic actor is built: CR4/CR8)", () => {
  let touched = 0;
  const t = tok("a", { owners: [] });
  Object.defineProperty(t, "actor", { get() { touched++; return { testUserPermission: () => true }; } });
  assert.equal(ownsOtherSighted({ tokenVision: true, tokens: [t] }, ANA, { level: "L0" }), false);
  assert.equal(touched, 0, "doc.actor was read");
});

test("ownsOtherSighted / pullCandidates take any collection: a Map (keyed, as Foundry's Collection), an array, or nothing", () => {
  const a = tok("a", { owners: ["ana"] });
  assert.equal(ownsOtherSighted({ tokenVision: true, tokens: new Map([["a", a]]) }, ANA, { level: "L0" }), true);
  assert.equal(ownsOtherSighted({ tokenVision: true, tokens: [a] }, ANA, { level: "L0" }), true);
  assert.equal(ownsOtherSighted({ tokenVision: true }, ANA, { level: "L0" }), false);
  assert.equal(ownsOtherSighted(null, ANA, { level: "L0" }), false);
});

test("sourceLevel: _source.level first (what core compares), else the prepared level, else null", () => {
  assert.equal(sourceLevel({ _source: { level: "S" }, level: "P" }), "S");
  assert.equal(sourceLevel({ level: "P" }), "P");
  assert.equal(sourceLevel({}), null);
  assert.equal(sourceLevel(null), null);
});

test("pullCandidates: one record per user, as core evaluates them; ownsOtherSighted against the token's source level", () => {
  const moved = tok("moved", { owners: ["ana", "bo"] });
  const other = tok("other", { owners: ["bo"] });
  const scene = { id: "S", tokenVision: true, tokens: new Map([["moved", moved], ["other", other]]) };
  const users = new Map([
    ["ana", { id: "ana", active: true, isGM: false, viewedScene: "S", viewedLevel: "L0" }],
    ["bo", { id: "bo", active: true, isGM: false, viewedScene: "S", viewedLevel: "L0" }],
    ["cy", { id: "cy", active: false, isGM: false }],
  ]);
  const recs = pullCandidates(moved, scene, users, "L0");
  assert.deepEqual(recs, [
    { id: "ana", active: true, isGM: false, viewedScene: "S", viewedLevel: "L0", observes: true, ownsOtherSighted: false },
    { id: "bo", active: true, isGM: false, viewedScene: "S", viewedLevel: "L0", observes: true, ownsOtherSighted: true },
    { id: "cy", active: false, isGM: false, viewedScene: null, viewedLevel: null, observes: false, ownsOtherSighted: false },
  ]);
  assert.deepEqual(usersToPull(recs, { hidden: false, scene: "S", level: "L0" }), ["ana"]);
  // srcLevel defaults to the token's source level
  assert.deepEqual(pullCandidates(moved, scene, users).map(r => r.ownsOtherSighted), [false, true, false]);
});

test("pull-rule reads no Foundry global (pure over what the caller passes)", () => {
  const src = readFileSync(new URL("../pull-rule.mjs", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /\b(game|canvas|CONFIG|Hooks|foundry|ui)\s*[.?[]/);
  assert.doesNotMatch(src, /\bimport\b/);
});
