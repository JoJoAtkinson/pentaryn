// Feedback tNdOEx (Marwen, Enlarge/Reduce): "The effect that is concentrated on and to be replaced
// does not exist." A double click opened two usage dialogs; the second still named the
// concentration the first had already ended. The pure rules (core/usage.mjs), then cast-flow's
// parts 7 and 8 on a client.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";

const { staleConcentrationEnd, openUsageDialogFor } = await import("../core/usage.mjs");

/* ── pure ─────────────────────────────────────────────────────────────────── */

test("staleConcentrationEnd: not stale → leave; below the limit → drop; one at the limit → that one; several → leave", () => {
  assert.equal(staleConcentrationEnd(null, ["a"], 1), undefined, "no replacement asked");
  assert.equal(staleConcentrationEnd("a", ["a"], 1), undefined, "still there");
  assert.equal(staleConcentrationEnd("fly", [], 1), null, "Fly already ended: nothing to replace");
  assert.equal(staleConcentrationEnd("old", ["new"], 1), "new", "the report: E/R re-cast from the second dialog");
  assert.equal(staleConcentrationEnd("old", ["a", "b"], 2), undefined, "several: dnd5e decides");
  assert.equal(staleConcentrationEnd("old", ["a"], 2), null, "limit 2, one held: no replacement needed");
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
globalThis.dnd5e = { applications: { activity: { ActivityUsageDialog } } };

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

test("part 8: a stale replacement is repaired before dnd5e checks it; a valid one is left alone", () => {
  const actor = (ids, limit = 1) => ({ concentration: { effects: new Set(ids.map(id => ({ id }))) }, system: { attributes: { concentration: { limit } } } });
  const use = (a, end) => {
    const usage = { concentration: { begin: true, end } };
    F.fireCall("dnd5e.preActivityConsumption", { ...enlarge, actor: a }, usage, {});
    return usage.concentration.end;
  };
  assert.equal(use(actor(["newER"]), "oldER"), "newER", "the report at -00:20");
  assert.equal(use(actor([]), "fly"), null, "the report at -03:53: Fly was already gone");
  assert.equal(use(actor(["fly"]), "fly"), "fly");
  assert.equal(use(actor(["a", "b"], 2), "gone"), "gone", "several: left for dnd5e to refuse");
  const noBegin = { concentration: { begin: false, end: "gone" } };
  F.fireCall("dnd5e.preActivityConsumption", { ...enlarge, actor: actor(["x"]) }, noBegin, {});
  assert.equal(noBegin.concentration.end, "gone");
  W.take();
  F.fireCall("dnd5e.preActivityConsumption", { actor: null }, { concentration: { begin: true, end: "x" } }, {});
  assert.deepEqual(W.take(), [], "no actor: silent");
});
