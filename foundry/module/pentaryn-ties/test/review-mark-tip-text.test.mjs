/**
 * ties-core-U4 [declared] (final review ties-core, 2026-10-12; defect wave 2): an item mark's tip
 * (`flags.pentaryn-ties.mark.tip`, player-writable like every item flag) was written to
 * `data-tooltip`, which Foundry's TooltipManager renders as HTML — a tip of `<img src=x onerror=…>`
 * ran in every viewer's sheet. The tip now goes to `data-tooltip-text`, which v13+ renders as plain
 * text. The icon and colour stay as ties-32 left them. Pins no golden rows of its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decorate } from "../item-marks.mjs";
import { el, installDom } from "./fixtures/dom.mjs";

installDom();

test("ties-core-U4: an item mark's tip is plain tooltip text, never data-tooltip HTML", () => {
  const tip = "<img src=x onerror=alert(1)> Burns hotter";
  const title = el("span", { className: "title" });
  const row = el("li", { dataset: { itemId: "zzItemTip0000001" }, children: [el("div", { className: "name", children: [title] })] });
  const actor = { items: { get: () => ({ getFlag: () => ({ icon: "fa-fire", tip, color: "#ff7a1a" }) }) } };
  decorate({ actor }, el("ol", { children: [row] }));
  const mark = title.querySelector(".pt-item-mark");
  assert.ok(mark, "the mark is drawn");
  assert.equal(mark.dataset.tooltipText, tip, "the tip is the plain-text tooltip");
  assert.equal(mark.dataset.tooltip, undefined, "no HTML tooltip");
  assert.equal(mark.className, "pt-item-mark fa-solid fa-fire");
  assert.equal(mark.style.color, "#ff7a1a");
});

test("ties-core-U4: a mark with no tip has no tooltip at all", () => {
  const title = el("span", { className: "title" });
  const row = el("li", { dataset: { itemId: "zzItemTip0000002" }, children: [el("div", { className: "name", children: [title] })] });
  const actor = { items: { get: () => ({ getFlag: () => ({}) }) } };
  decorate({ actor }, el("ol", { children: [row] }));
  const mark = title.querySelector(".pt-item-mark");
  assert.equal(mark.dataset.tooltipText, undefined);
  assert.equal(mark.dataset.tooltip, undefined);
});
