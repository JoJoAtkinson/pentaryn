/**
 * Final code review (ties-ui-EXT-11): "the GM, or player access on and this user owns the actor" was
 * written twice — overlay.mjs `permitted` and sheet.mjs `mayView` — each reading `playerAccess`
 * through `setting()`, which before the settings register answers the row default (`true`) and so
 * lets an owner through on a guess.
 * Ruling [declared]: one `mayActOn(actor)` in settings.mjs — isGM || (mayWrite() && actor.isOwner
 * === true). Both doors call it (the sheet keeps its `instanceof Actor` guard). Before the settings
 * register, `mayWrite` refuses, which is the stricter and intended answer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);
const src = f => readFileSync(new URL(f, ROOT), "utf8");

await bootWorld({ importEntry: false });
const S = await import("../settings.mjs");

const asPlayer = fn => {
  const gm = game.user;
  game.user = { id: "zzExt11Player001", isGM: false };
  try {
    return fn();
  } finally {
    game.user = gm;
  }
};
const owned = { isOwner: true };
const foreign = { isOwner: false };

test("ties-ui-EXT-11 settings exports mayActOn", () => {
  assert.equal(typeof S.mayActOn, "function");
});

test("ties-ui-EXT-11 before the settings register, a player may not act even on their own actor", () => {
  assert.equal(asPlayer(() => S.mayActOn(owned)), false, "refuse rather than guess");
  assert.equal(S.mayActOn(foreign), true, "the GM always may");
  assert.equal(S.mayActOn(null), false, "no actor, no action");
});

test("ties-ui-EXT-11 after registration: a player acts on what they own while playerAccess is on", async () => {
  S.registerSettings();
  assert.equal(asPlayer(() => S.mayActOn(owned)), true);
  assert.equal(asPlayer(() => S.mayActOn(foreign)), false);
  assert.equal(asPlayer(() => S.mayActOn({})), false, "isOwner must be exactly true");
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  assert.equal(asPlayer(() => S.mayActOn(owned)), false, "the kill switch closes it");
  assert.equal(S.mayActOn(foreign), true, "the GM still may");
  await game.settings.set("pentaryn-ties", "playerAccess", true);
});

test("ties-ui-EXT-11 overlay.permitted and sheet.mayView call mayActOn, not their own copy", () => {
  for (const f of ["overlay.mjs", "sheet.mjs"]) {
    const s = src(f);
    assert.doesNotMatch(s, /setting\("playerAccess"\)/, `${f} reads playerAccess itself`);
    assert.match(s, /\bmayActOn\(actor\)/, `${f} uses mayActOn`);
  }
  assert.match(src("sheet.mjs"), /instanceof Actor/, "the sheet keeps its Actor guard");
});
