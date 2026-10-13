/**
 * Final code review (ties-ui-E9): a body-only re-render (dnd5e rebuilt the tab-body, the nav survived)
 * left our nav links in place with `data-pt-bound` set but no sections, so injectOneTab saw a fresh
 * section, fell through, and added a SECOND click listener to the surviving link — one per such
 * re-render, each closing over its own (eventually detached) section.
 * Ruling [declared]: the link's click is bound once (guarded by `data-pt-bound`) and resolves the
 * section at click time with `:scope > [data-tab=id]`; a fresh section with a surviving link only
 * repaints.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzE9Pc0000000001";

const F = await bootWorld({ actors: [{ id: PC, name: "ZZ E9 PC", type: "character" }] });
const tick = () => new Promise(r => setImmediate(r));

const sheetElement = () => {
  const header = el("header", { className: "window-header", children: [el("h1"), el("button", { className: "header-control fa-xmark" })] });
  const nav = el("nav", { className: "tabs", dataset: { group: "primary" }, children: [el("a", { className: "item active", dataset: { tab: "details" } })] });
  const body = el("div", { className: "tab-body", children: [el("section", { className: "tab active", dataset: { tab: "details" } })] });
  const root = el("div", { className: "application sheet tab-details", children: [header, nav, body] });
  return { root, nav, body };
};
const OURS = ["ties", "known", "attributes"];

test("ties-ui-E9: body-only re-renders leave each nav link with one click listener", async () => {
  const { root, nav, body } = sheetElement();
  const app = { document: game.actors.get(PC), tabGroups: { primary: "details" } };
  F.fire("renderActorSheetV2", app, root);
  await tick();
  for (let i = 0; i < 3; i++) {
    // dnd5e rebuilds the tab-body part only: our sections are gone, our links survive
    body.replaceChildren(el("section", { className: "tab active", dataset: { tab: "details" } }));
    F.fire("renderActorSheetV2", app, root);
    await tick();
  }
  const links = nav.children.filter(c => OURS.includes(c.dataset.tab));
  assert.deepEqual(links.map(c => c.dataset.tab), OURS, "one link per tab");
  assert.deepEqual(body.children.map(c => c.dataset.tab), ["details", ...OURS], "one section per tab, repainted");
  for (const link of links) assert.equal(link.listeners.click?.length, 1, `${link.dataset.tab}: one click listener`);
  assert.deepEqual(F.hookErrors, []);
});

test("ties-ui-E9: the surviving link activates the CURRENT section, not one a re-render dropped", async () => {
  const { root, nav, body } = sheetElement();
  const app = { document: game.actors.get(PC), tabGroups: { primary: "details" } };
  F.fire("renderActorSheetV2", app, root);
  await tick();
  const dropped = body.children.find(c => c.dataset.tab === "ties");
  body.replaceChildren(el("section", { className: "tab active", dataset: { tab: "details" } }));
  F.fire("renderActorSheetV2", app, root);
  await tick();
  const seen = await nav.children.find(c => c.dataset.tab === "ties").dispatch("click");
  const live = body.children.find(c => c.dataset.tab === "ties");
  assert.notEqual(live, dropped);
  assert.deepEqual(seen, ["preventDefault", "stopPropagation"], "the handler ran once");
  assert.equal(live.classList.contains("active"), true);
  assert.equal(dropped.classList.contains("active"), false, "the detached section is left alone");
  assert.equal(app.tabGroups.primary, "ties");
  assert.equal(root.classList.contains("tab-ties"), true);
});

test("ties-ui-E9: a re-render while on the tab (link survives) re-activates the fresh section", async () => {
  const { root, body } = sheetElement();
  const app = { document: game.actors.get(PC), tabGroups: { primary: "known" } };
  F.fire("renderActorSheetV2", app, root);
  await tick();
  body.replaceChildren(el("section", { className: "tab", dataset: { tab: "details" } }));
  F.fire("renderActorSheetV2", app, root);
  await tick();
  const active = body.children.filter(c => c.classList.contains("active")).map(c => c.dataset.tab);
  assert.deepEqual(active, ["known"]);
});
