// Guide S5 (combat-riders-39, C32): every wrap goes through the kit's wrapMethod with a marker and an
// adjustments row, so it is listed, idempotent and undoable. The behaviour of each wrap is pinned by
// the checkpoint tests (rituals-glue, argon-tidy, cast-flow, glue); this file pins the bookkeeping.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { ButtonPanelButton, IDS, MODULE, SummonActivity, makeItem, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
const original = {
  renderInner: ButtonPanelButton.prototype._renderInner,
  prepare: SummonActivity.prototype._prepareUsageConfig,
  placement: SummonActivity.prototype.getPlacement,
  enrich: W.TE.enrichHTML,
};
await import("../riders.mjs");
const { patchRecords, removePatches, installPatches } = await import("../patches.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);

const rows = () => patchRecords().map(p => p.adjustments);

test("ready: four patches, each with its marker and adjustments row (D2: riders- ids), in today's order", () => {
  assert.deepEqual(patchRecords().map(({ label, marker, adjustments, via }) => ({ label, marker, adjustments, via })), [
    { label: "Argon ButtonPanelButton#_renderInner", marker: `${MODULE}.ritualsWrapped`, adjustments: "riders-argon-ritual-adept-list", via: "direct" },
    { label: "TextEditor.implementation.enrichHTML", marker: "_prItemRollData", adjustments: "riders-argon-tooltip-item-rolldata", via: "direct" },
    { label: "dnd5e SummonActivity#_prepareUsageConfig", marker: "_prPlaceDefault", adjustments: "riders-summon-place-default", via: "direct" },
    { label: "dnd5e SummonActivity#getPlacement", marker: "_prWildcard", adjustments: "riders-summon-wildcard-preview", via: "direct" },
  ]);
  assert.equal(ButtonPanelButton.prototype._renderInner[Symbol.for(`${MODULE}.ritualsWrapped`)], true, "the marker sits on the replacement");
  assert.equal(SummonActivity.prototype._prepareUsageConfig._prPlaceDefault, true);
  assert.equal(SummonActivity.prototype.getPlacement._prWildcard, true);
});

test("a second ready (or a hot re-run) wraps nothing twice", async () => {
  const now = { r: ButtonPanelButton.prototype._renderInner, p: SummonActivity.prototype._prepareUsageConfig, e: W.TE.enrichHTML };
  installPatches({ log: { warn: () => assert.fail("no warn") }, exposed: {} });
  assert.equal(ButtonPanelButton.prototype._renderInner, now.r);
  assert.equal(SummonActivity.prototype._prepareUsageConfig, now.p);
  assert.equal(W.TE.enrichHTML, now.e);
  assert.equal(patchRecords().length, 4);
  W.takeLog();
  await new ButtonPanelButton({ type: "other" })._renderInner();
  assert.deepEqual(W.takeLog().map(l => l.op), ["argon._renderInner"], "the original runs once");
});

test("an Item button render adds 5 and 6 once per prototype; a subclass of a wrapped class adds nothing", () => {
  class Base {
    constructor(item) { this.item = item; }
    get targets() { return 5; }
    async getTooltipData() { return {}; }
  }
  class Sub extends Base {}
  const item = makeItem({ name: "Bolt", type: "spell", system: { identifier: "fire-bolt" } }, W.actor(IDS.sorc));
  F.fire("renderItemButtonArgonComponent", new Base(item));
  F.fire("renderItemButtonArgonComponent", new Base(item));
  F.fire("renderItemButtonArgonComponent", new Sub(item));
  assert.deepEqual(rows(), [
    "riders-argon-ritual-adept-list", "riders-argon-tooltip-item-rolldata", "riders-summon-place-default",
    "riders-summon-wildcard-preview", "riders-argon-metamagic-no-picker", "riders-argon-tooltip-item-rolldata",
  ]);
  assert.deepEqual(patchRecords().slice(4).map(p => [p.label, p.marker]), [["Argon Base#targets", "_prTargets"], ["Argon Base#getTooltipData", "_prTooltip"]]);
  assert.deepEqual(Object.getOwnPropertyNames(Sub.prototype), ["constructor"], "Sub inherits the wrapped members");
  assert.deepEqual(W.lines, []);
});

test("removePatches restores every original and forgets the records", () => {
  removePatches();
  assert.equal(ButtonPanelButton.prototype._renderInner, original.renderInner);
  assert.equal(SummonActivity.prototype._prepareUsageConfig, original.prepare);
  assert.equal(SummonActivity.prototype.getPlacement, original.placement);
  assert.equal(W.TE.enrichHTML, original.enrich);
  assert.deepEqual(patchRecords(), []);
});
