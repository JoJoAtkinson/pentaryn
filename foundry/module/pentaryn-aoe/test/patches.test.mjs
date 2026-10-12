// S6: both of aoe's patches go through the kit's wrapMethod, so describe().patches can list them
// and adjustments rows aoe-argon-handle-bind / aoe-self-area-aim name a real patch (C32).
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, out, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";
import { patches } from "../lib/patch.mjs";

const { F } = await boot();
const base = () => "orig";
const S = await seams();
const mine = () => patches().filter(p => p.moduleId === MODULE).map(({ label, name, marker, adjustments }) => ({ label, name, marker, adjustments }));

test("no patch before anything is installed", () => {
  assert.deepEqual(mine(), []);
});

test("the Argon guard is one recorded patch: marker _aoeGuard, row aoe-argon-handle-bind", () => {
  F.ui.ARGON = { bind: base };
  assert.equal(S.areas.guardArgonBind(), true);
  assert.equal(S.areas.guardArgonBind(), true);
  assert.deepEqual(mine(), [{ label: "ui.ARGON#bind", name: "bind", marker: "_aoeGuard", adjustments: "aoe-argon-handle-bind" }]);
});

test("Part G's placement wrap is one recorded patch: marker Symbol.for('pentaryn-aoe.aimWrapped'), row aoe-self-area-aim", () => {
  S.aim.installAim();
  S.aim.installAim();
  const rows = mine();
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { label: "RegionLayer#placeRegions", name: "placeRegions", marker: Symbol.for(`${MODULE}.aimWrapped`), adjustments: "aoe-self-area-aim" });
});

test("unguardArgonBind restores Argon's own bind and drops the record; guarding again wraps again", () => {
  S.areas.guardArgonBind();
  S.areas.unguardArgonBind();
  assert.equal(F.ui.ARGON.bind, base);
  assert.equal(mine().some(p => p.marker === "_aoeGuard"), false);
  S.areas.unguardArgonBind();
  assert.equal(F.ui.ARGON.bind, base, "a second unguard is a no-op");
  S.areas.guardArgonBind();
  assert.equal(F.ui.ARGON.bind._aoeGuard, true);
});

test("a throwing handle check binds as usual and logs at debug only (C24)", () => {
  out.length = 0;
  const thrower = { get document() { throw new Error("odd"); }, id: "t" };
  assert.equal(F.ui.ARGON.bind(thrower), "orig");
  assert.deepEqual(out, []);
  F.CONFIG.debug = { [MODULE]: true };
  F.ui.ARGON.bind(thrower);
  assert.deepEqual(out.map(o => [o.level, o.text]), [["debug", `${MODULE} | argon bind check`]]);
  F.CONFIG.debug = {};
});
