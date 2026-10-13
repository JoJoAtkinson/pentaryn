/**
 * senses-M10 (=EXT-3) [declared] (final review 2026-10-12): the Token HUD button was built twice,
 * once in chain.mjs (hudButton) and once in light-ui.mjs (injectHUD), each with its own root
 * unwrap, right-column lookup, tip, icon and guarded click. One pure core/hud-dom.mjs now holds
 * rootOf, hudColumn and hudButton (next to setTip, the senses-edge-3 tip rule) and both files use
 * it. No behaviour change: the HUD goldens (chain-hud, light-hud, player-hud) are byte-identical.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { el, installDom } from "./fixtures/dom.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dom = await import("../core/hud-dom.mjs");

test("senses-M10: core/hud-dom.mjs exports rootOf, hudColumn and hudButton", () => {
  for (const name of ["rootOf", "hudColumn", "hudButton", "setTip"]) assert.equal(typeof dom[name], "function", name);
});

test("senses-M10: chain.mjs and light-ui.mjs build no HUD button of their own", () => {
  for (const path of ["chain.mjs", "light-ui.mjs"]) {
    const src = read(path);
    assert.doesNotMatch(src, /function hudButton\b/, `${path} defines its own hudButton`);
    assert.doesNotMatch(src, /\.col\.right/, `${path} looks up the HUD column itself`);
    assert.doesNotMatch(src, /instanceof HTMLElement/, `${path} unwraps the hook element itself`);
    assert.doesNotMatch(src, /control-icon/, `${path} spells the HUD button class itself`);
  }
});

test("senses-M10: rootOf unwraps an element or a jQuery-like list", () => {
  installDom();
  const root = el("div");
  assert.equal(dom.rootOf(root), root);
  assert.equal(dom.rootOf([root]), root);
  assert.equal(dom.rootOf(null), undefined);
});

test("senses-M10: hudColumn finds the right column, and none once the marker button is there", () => {
  installDom();
  const col = el("div", { className: "col right" });
  const root = el("div", { className: "token-hud", children: [el("div", { className: "col left" }), col] });
  assert.equal(dom.hudColumn(root, "ps-x"), col);
  const legacy = el("div", { className: "right" });
  assert.equal(dom.hudColumn(el("div", { children: [legacy] }), "ps-x"), legacy);
  col.append(el("button", { className: "control-icon ps-x" }));
  assert.equal(dom.hudColumn(root, "ps-x"), null);
  assert.equal(dom.hudColumn(el("div"), "ps-x"), null);
});

test("senses-M10: hudButton appends one guarded control-icon with a plain-text tip", async () => {
  installDom();
  const col = el("div", { className: "col right" });
  const errors = [];
  let clicks = 0;
  const btn = dom.hudButton(col, {
    cls: "ps-x", icon: "fa-solid fa-link", tip: `A & <b>"B"</b>`,
    onClick: async () => { clicks++; throw new Error("boom"); }, onError: e => errors.push(e.message),
  });
  assert.equal(col.children.at(-1), btn);
  assert.deepEqual(btn.toJSON(), {
    tag: "button", class: "control-icon ps-x", type: "button",
    data: { tooltipText: `A & <b>"B"</b>` }, attrs: { "aria-label": `A & <b>"B"</b>` },
    html: `<i class="fa-solid fa-link"></i>`,
  });
  const ev = btn.click();
  assert.ok(ev.prevented && ev.stopped);
  await new Promise(r => setImmediate(r));
  assert.equal(clicks, 1);
  assert.deepEqual(errors, ["boom"]);
});
