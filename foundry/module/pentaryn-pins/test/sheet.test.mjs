// The "Pinned to {player}" badge when the header's controls are not a direct child of
// `.window-header` (another module wrapping the header buttons). Stock v14.369 renders the
// toggleControls button straight inside the header (application.mjs _renderFrame), but
// `Node#insertBefore(node, ref)` throws NotFoundError whenever `ref` is not a child of the parent,
// so the badge is placed with `controls.before(badge)`, which works at any depth.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, pinsWorld } from "./fixtures/actors.mjs";
import { FakeElement, installDom } from "./fixtures/dom.mjs";
import { MODULE } from "../pins-core.mjs";

// the fake DOM's insertBefore, made as strict as a browser's (fixtures/dom.mjs keeps the lenient one)
FakeElement.prototype.insertBefore = function insertBefore(child, ref) {
  if (ref && ref.parentElement !== this) throw new Error("NotFoundError: The node before which the new node is to be inserted is not a child of this node.");
  child.remove?.();
  child.parentElement = this;
  const i = ref ? this.children.indexOf(ref) : -1;
  if (i < 0) this.children.push(child);
  else this.children.splice(i, 0, child);
  return child;
};

const F = await pinsWorld(MODULE, { settings: { [`${MODULE}.pinning`]: true } });
const warnings = [];
for (const level of ["warn", "error"]) console[level] = (...args) => warnings.push([level, String(args[0])]);
console.info = () => undefined;
const { doc } = installDom();
await import("../pins.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

/** A sheet whose header has `[title, wrapper > [toggleControls, close]]`, or the stock flat header. */
function sheetFor(actorId, { wrapped }) {
  const element = new FakeElement("div", doc);
  const header = new FakeElement("header", doc);
  header.className = "window-header";
  const title = new FakeElement("h1", doc);
  title.className = "window-title";
  const toggle = new FakeElement("button", doc);
  toggle.dataset.action = "toggleControls";
  const close = new FakeElement("button", doc);
  close.dataset.action = "close";
  if (wrapped) {
    const wrapper = new FakeElement("div", doc);
    wrapper.className = "header-buttons";
    wrapper.append(toggle, close);
    header.append(title, wrapper);
  } else header.append(title, toggle, close);
  element.appendChild(header);
  const actor = game.actors.get(actorId);
  return { app: { actor, document: actor, element, rendered: true }, header, toggle };
}
const render = s => F.fire("renderBaseActorSheet", s.app, s.app.element, {}, {});
const badges = s => s.header.querySelectorAll(".ppi-pinned");

test("badge sits right before the controls when they are nested in a wrapper", () => {
  const s = sheetFor(IDS.talo, { wrapped: true });
  render(s);
  render(s);
  assert.deepEqual(warnings, [], "no 'sheet: pinned badge' warning");
  assert.equal(badges(s).length, 1, "one badge across re-renders");
  const [badge] = badges(s);
  assert.equal(badge.textContent, "Pinned to Talo's player");
  assert.equal(badge.parentElement, s.toggle.parentElement, "a sibling of the controls");
  assert.equal(badge.parentElement.children.indexOf(badge) + 1, badge.parentElement.children.indexOf(s.toggle), "right before them");
});

test("stock flat header: after the title, before the controls", () => {
  const s = sheetFor(IDS.talo, { wrapped: false });
  warnings.length = 0;
  render(s);
  const [badge] = badges(s);
  assert.equal(s.header.children.indexOf(badge), 1);
  assert.equal(s.header.children[2], s.toggle);
  assert.deepEqual(warnings, []);
});
