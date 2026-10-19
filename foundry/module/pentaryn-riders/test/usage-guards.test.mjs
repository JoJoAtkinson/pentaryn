// Feedback tNdOEx (Marwen, Enlarge/Reduce): "The effect that is concentrated on and to be replaced
// does not exist." A double click opened two usage dialogs; the second still named the
// concentration the first had already ended. The pure rules (core/usage.mjs), then cast-flow's
// parts 7 and 8 on a client.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";

const { staleConcentrationEnd, openUsageDialogFor, firstChoiceDialogFor, listenersAheadOf } = await import("../core/usage.mjs");

/* ── pure ─────────────────────────────────────────────────────────────────── */

test("staleConcentrationEnd: not stale → leave; below the limit → drop; stale at the limit → refuse (false)", () => {
  assert.equal(staleConcentrationEnd(null, ["a"], 1), undefined, "no replacement asked");
  assert.equal(staleConcentrationEnd("a", ["a"], 1), undefined, "still there");
  assert.equal(staleConcentrationEnd("fly", [], 1), null, "Fly already ended: nothing to replace");
  // Review finding 1: the dialog named Fly; Fly dropped; Hold Person was cast elsewhere. Ending Hold
  // Person in Fly's place would end a concentration the player never picked: refuse instead.
  assert.equal(staleConcentrationEnd("fly", ["holdPerson"], 1), false, "one held at the limit, not the one picked: refuse");
  assert.equal(staleConcentrationEnd("old", ["a", "b"], 2), false, "several at the limit: refuse");
  assert.equal(staleConcentrationEnd("old", ["a"], 2), null, "limit 2, one held: no replacement needed");
  assert.equal(staleConcentrationEnd("old", ["a"], "x"), false, "a non-numeric limit reads as 1");
});

test("listenersAheadOf: foreign listeners before the last veto; own ones and later ones don't count; -1 when a veto is missing", () => {
  assert.equal(listenersAheadOf([1, 2, 3, 4, 50, 60], [1, 2, 3, 4], [3, 4]), 0, "riders first (the live order)");
  assert.equal(listenersAheadOf([50, 1, 2, 3, 4], [1, 2, 3, 4], [3, 4]), 1, "another module got ahead");
  assert.equal(listenersAheadOf([1, 2, 3, 50, 4], [1, 2, 3, 4], [3, 4]), 1, "one between the two vetoes");
  assert.equal(listenersAheadOf([1, 2], [1, 2, 3], [3]), -1, "a veto not registered");
  assert.equal(listenersAheadOf([1], [1], []), -1);
  assert.equal(listenersAheadOf(null, null, [1]), -1);
});

test("openUsageDialogFor: the rendered usage dialog of that activity only", () => {
  const is = app => app.kind === "usage";
  const apps = [
    { kind: "usage", rendered: false, activity: { uuid: "A" } },
    { kind: "sheet", rendered: true, activity: { uuid: "A" } },
    { kind: "usage", rendered: true, activity: { uuid: "B" } },
    { kind: "usage", rendered: true, get activity() { throw new Error("item gone"); } },
    { kind: "usage", rendered: true, activity: { uuid: "A" }, hit: true },
  ];
  assert.equal(openUsageDialogFor(apps, "A", is)?.hit, true);
  assert.equal(openUsageDialogFor(apps, "C", is), null);
  assert.equal(openUsageDialogFor(apps, null, is), null);
  assert.equal(openUsageDialogFor(null, "A", is), null);
});

test("firstChoiceDialogFor: the earliest open choice dialog of the same item, rendering or not", () => {
  const is = app => app.kind === "choice";
  const item = uuid => ({ uuid });
  const first = { kind: "choice", rendered: false, state: 1, item: item("I") };     // still rendering
  const second = { kind: "choice", rendered: true, state: 2, item: item("I") };
  const apps = [
    { kind: "sheet", item: item("I") },
    { kind: "choice", state: 2, item: item("other") },
    { kind: "choice", get item() { throw new Error("item gone"); } },
    first, second
  ];
  assert.equal(firstChoiceDialogFor(apps, second, is), first, "the second yields to the first, even before it rendered");
  assert.equal(firstChoiceDialogFor(apps, first, is), null, "the first keeps itself (it registered first)");
  assert.equal(firstChoiceDialogFor([...apps.slice(0, 3), second], second, is), null, "alone: kept");
  const closing = { ...first, state: -2 };
  assert.equal(firstChoiceDialogFor([closing, second], second, is), null, "a closing first (an activity was picked) does not count");
  assert.equal(firstChoiceDialogFor(apps, { kind: "choice", item: null }, is), null, "no item: nothing to match");
  assert.equal(firstChoiceDialogFor(null, second, is), null);
});

/* ── on a client ──────────────────────────────────────────────────────────── */

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");

class ActivityUsageDialog {
  constructor(uuid) { this.rendered = true; this.uuid = uuid; this.front = 0; }
  get activity() { return { uuid: this.uuid }; }
  bringToFront() { this.front++; }
}
class ActivityChoiceDialog {
  constructor(uuid) { this.state = 1; this.rendered = false; this.uuid = uuid; this.front = 0; this.closed = []; }
  get item() { return { uuid: this.uuid }; }
  bringToFront() { this.front++; }
  close(opts) { this.closed.push(opts); this.state = -2; return Promise.resolve(this); }
}
globalThis.dnd5e = { applications: { activity: { ActivityUsageDialog, ActivityChoiceDialog } } };

const ER = "Actor.marwen0000000001.Item.enlargereduce001.Activity.saveEnlargeReduce";
const enlarge = { uuid: ER, actor: null, item: { name: "Enlarge/Reduce" } };

test("part 7: a second Use while that activity's dialog is open is vetoed and brings the dialog forward", () => {
  const instances = F.foundry.applications.instances;
  instances.clear();
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", enlarge, {}, {}, {}), false, "no dialog open: goes ahead");
  const open = new ActivityUsageDialog(ER);
  instances.set("dlg", open);
  assert.equal(F.fireCall("dnd5e.preUseActivity", enlarge, {}, {}, {}), false);
  assert.equal(open.front, 1);
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", enlarge, {}, { configure: false }, {}), false, "a no-dialog use is never stopped");
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", { ...enlarge, uuid: "Actor.x.Item.y.Activity.z" }, {}, {}, {}), false, "another activity");
  open.rendered = false;
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", enlarge, {}, {}, {}), false, "the dialog closed");
  instances.set("dlg", { rendered: true, activity: { uuid: ER } });       // not a usage dialog (a sheet)
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", enlarge, {}, {}, {}), false);
  instances.clear();
});

test("part 7 (DsekWh): a second choice dialog for an item closes and brings the first forward, for any item", async () => {
  const instances = F.foundry.applications.instances;
  instances.clear();
  const PF = "Actor.marwen0000000001.Item.produceflame0001";
  const first = new ActivityChoiceDialog(PF);
  instances.set("c1", first);                                           // registered, still rendering
  F.fire("renderActivityChoiceDialog", first, {}, {}, { isFirstRender: true });
  assert.deepEqual(first.closed, [], "the first dialog stays");
  const second = new ActivityChoiceDialog(PF);
  instances.set("c2", second);
  F.fire("renderActivityChoiceDialog", second, {}, {}, { isFirstRender: true });
  await Promise.resolve();
  assert.deepEqual(second.closed, [{ animate: false }], "the double-click's dialog closes");
  assert.equal(first.front, 1, "the first comes forward");
  assert.deepEqual(first.closed, []);
  F.fire("renderActivityChoiceDialog", first, {}, {}, { isFirstRender: false });
  assert.deepEqual(first.closed, [], "a re-render is never touched");

  const other = new ActivityChoiceDialog("Actor.x.Item.longsword000001");   // a weapon: not light-only
  instances.set("c3", other);
  F.fire("renderActivityChoiceDialog", other, {}, {}, { isFirstRender: true });
  assert.deepEqual(other.closed, [], "another item's dialog stays");
  const otherTwice = new ActivityChoiceDialog("Actor.x.Item.longsword000001");
  instances.set("c4", otherTwice);
  F.fire("renderActivityChoiceDialog", otherTwice, {}, {}, { isFirstRender: true });
  assert.equal(otherTwice.closed.length, 1, "every item, not only lights");

  first.state = -2;                                                      // an activity was picked
  const again = new ActivityChoiceDialog(PF);
  instances.set("c5", again);
  F.fire("renderActivityChoiceDialog", again, {}, {}, { isFirstRender: true });
  assert.deepEqual(again.closed, [], "a new Use after a pick opens normally");

  W.take();
  F.fire("renderActivityChoiceDialog", { item: { uuid: PF } }, {}, {}, {});   // not a choice dialog
  assert.deepEqual(W.take(), []);
  instances.clear();
});

test("part 8: a stale replacement is dropped below the limit, refused at it (never ends what the player did not pick); a valid one is left alone", () => {
  const actor = (ids, limit = 1) => ({ concentration: { effects: new Set(ids.map(id => ({ id }))) }, system: { attributes: { concentration: { limit } } } });
  const use = (a, end) => {
    const usage = { concentration: { begin: true, end } };
    const out = F.fireCall("dnd5e.preActivityConsumption", { ...enlarge, actor: a }, usage, {});
    return { end: usage.concentration.end, vetoed: out === false };
  };
  const before = F.calls.length;
  // Review finding 1: the dialog named Fly; Fly dropped; Hold Person was cast elsewhere. Cast from
  // the first dialog must not end Hold Person: refused, with a notice to reopen the dialog.
  assert.deepEqual(use(actor(["holdPerson"]), "fly"), { end: "fly", vetoed: true }, "at the limit: refused, nothing rewritten");
  assert.deepEqual(use(actor(["a", "b"], 2), "gone"), { end: "gone", vetoed: true }, "several at the limit: refused too");
  const notes = F.calls.slice(before).filter(c => c.op === "notify").map(c => [c.level, c.message]);
  assert.deepEqual(notes, [
    ["warn", "Your concentration changed while this window was open, so nothing was cast. Close it and use the spell again to choose which concentration it ends."],
    ["warn", "Your concentration changed while this window was open, so nothing was cast. Close it and use the spell again to choose which concentration it ends."],
  ]);
  assert.deepEqual(use(actor([]), "fly"), { end: null, vetoed: false }, "the report at -03:53: Fly was already gone");
  assert.deepEqual(use(actor(["a"], 2), "gone"), { end: null, vetoed: false }, "limit 2, one held: no replacement needed");
  assert.deepEqual(use(actor(["fly"]), "fly"), { end: "fly", vetoed: false });
  const noBegin = { concentration: { begin: false, end: "gone" } };
  F.fireCall("dnd5e.preActivityConsumption", { ...enlarge, actor: actor(["x"]) }, noBegin, {});
  assert.equal(noBegin.concentration.end, "gone");
  W.take();
  F.fireCall("dnd5e.preActivityConsumption", { actor: null }, { concentration: { begin: true, end: "x" } }, {});
  assert.deepEqual(W.take(), [], "no actor: silent");
});
