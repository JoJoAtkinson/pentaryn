// Feedback VDalcb (Caven, on his sheet's Effects tab: "is it time left or time passed?"), triage K: a
// duration that counts down says "left" ("9 rounds left", "1 hr left"). One wrap of dnd5e's
// ActiveEffect5e#getDurationParts, which both the sheet's Effects tab and the effect tooltip print. Only
// a timed duration with time still left; a start- / end-of-turn special, an untimed effect, an expired
// one ("… ago") and "Now" are left as dnd5e words them. Before this unit nothing wrapped it.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { durationLeftParts } from "../table-core.mjs";
import { setupWorld } from "./fixtures/world.mjs";

/* ── the pure rule ───────────────────────────────────────────────────────── */

const left = p => `${p} left`;
const timed = { supportsDuration: true, remaining: 9, special: null };

test("durationLeftParts: the last printed part of a timed, counting-down duration says left; the input is not mutated", () => {
  const parts = ["9 rounds"];
  assert.deepEqual(durationLeftParts(parts, timed, left), ["9 rounds left"]);
  assert.deepEqual(parts, ["9 rounds"], "not mutated");
  assert.deepEqual(durationLeftParts(["1 hr", "30 min"], { ...timed, remaining: 90 }, left), ["1 hr", "30 min left"], "two parts: the second, the least significant");
  assert.deepEqual(durationLeftParts(["1 d", "2 hr", "5 min"], timed, left), ["1 d", "2 hr left", "5 min"], "only parts [0] and [1] are printed");
  assert.deepEqual(durationLeftParts(["1 turn"], { ...timed, remaining: 0.5 }, left), ["1 turn left"], "a fraction still left");
});

test("durationLeftParts: left as dnd5e words it — a special turn expiry, not timed by dnd5e, nothing left, expired, unknown, empty, junk", () => {
  const same = (parts, state, why) => assert.equal(durationLeftParts(parts, state, left), parts, why);
  same(["Start"], { ...timed, special: "turnStart" }, "a start- / end-of-turn special");
  same(["None"], { ...timed, supportsDuration: false }, "an expiry dnd5e does not time (its label alone)");
  same(["Now"], { ...timed, remaining: 0 }, "nothing left");
  same(["2 rounds ago"], { ...timed, remaining: -2 }, "core already says ago");
  same(["None"], { ...timed, remaining: Infinity }, "an indefinite duration");
  same(["x"], { ...timed, remaining: "soon" }, "a remaining that is not a number");
  same([], timed, "no parts (getDurationParts' [] for an unlimited duration)");
  same([""], timed, "a blank part");
  same(["9 rounds"], undefined, "no state");
  assert.equal(durationLeftParts(null, timed, left), null);
  assert.deepEqual(durationLeftParts(["9 rounds"], timed, null), ["9 rounds"], "no wording function");
});

/* ── the wrap ────────────────────────────────────────────────────────────── */

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;

/** A stand-in for dnd5e's ActiveEffect5e: getDurationParts as dnd5e 6.1.1 writes it (dnd5e.mjs ~7800). */
class ActiveEffect5e {
  constructor({ label = "9 rounds", remaining = 9, supports = true, special = null } = {}) {
    this.duration = { label, remaining };
    this._supports = supports;
    this.specialDuration = special;
  }
  expirySupportsDuration() { return this._supports; }
  getDurationParts() {
    if (!this.expirySupportsDuration()) return [this.duration.label];
    return Number.isFinite(this.duration.remaining) ? this.duration.label.split(", ") : [];
  }
}
const original = ActiveEffect5e.prototype.getDurationParts;
F.CONFIG.ActiveEffect = { expiryAction: "update", documentClass: ActiveEffect5e };
await import("../riders.mjs");
const { patchRecords, removePatches, installPatches } = await import("../patches.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);

test("ready wraps ActiveEffect5e#getDurationParts once, listed with its marker and adjustments row", () => {
  const rec = patchRecords().filter(p => p.adjustments === "dnd5e-riders-duration-left");
  assert.deepEqual(rec.map(({ label, marker, via }) => ({ label, marker, via })), [{ label: "dnd5e ActiveEffect5e#getDurationParts", marker: "_prDurationLeft", via: "direct" }]);
  assert.notEqual(ActiveEffect5e.prototype.getDurationParts, original);
  assert.equal(ActiveEffect5e.prototype.getDurationParts._prDurationLeft, true);
  const wrapped = ActiveEffect5e.prototype.getDurationParts;
  installPatches({ log: { warn: () => assert.fail("no warn"), debug() {} }, exposed: {} });
  assert.equal(ActiveEffect5e.prototype.getDurationParts, wrapped, "a second ready wraps nothing twice");
});

test("the sheet's and the tooltip's parts: '9 rounds left', '1 hr, 30 min left'; specials, untimed, expired and Now as dnd5e words them", () => {
  assert.deepEqual(new ActiveEffect5e().getDurationParts(), ["9 rounds left"]);
  assert.deepEqual(new ActiveEffect5e({ label: "1 hr, 30 min", remaining: 90 }).getDurationParts(), ["1 hr", "30 min left"]);
  assert.deepEqual(new ActiveEffect5e({ label: "End", special: "sourceEnd" }).getDurationParts(), ["End"]);
  assert.deepEqual(new ActiveEffect5e({ label: "None", supports: false }).getDurationParts(), ["None"]);
  assert.deepEqual(new ActiveEffect5e({ label: "2 rounds ago", remaining: -2 }).getDurationParts(), ["2 rounds ago"]);
  assert.deepEqual(new ActiveEffect5e({ label: "Now", remaining: 0 }).getDurationParts(), ["Now"]);
  assert.deepEqual(new ActiveEffect5e({ remaining: Infinity }).getDurationParts(), []);
});

test("an effect that throws while being read keeps dnd5e's parts; the wrap never throws", () => {
  const odd = new ActiveEffect5e();
  Object.defineProperty(odd, "specialDuration", { get() { throw new Error("odd effect"); } });
  assert.deepEqual(odd.getDurationParts(), ["9 rounds"]);
});

test("removePatches puts dnd5e's method back", () => {
  removePatches();
  assert.equal(ActiveEffect5e.prototype.getDurationParts, original);
  assert.deepEqual(new ActiveEffect5e().getDurationParts(), ["9 rounds"]);
});
