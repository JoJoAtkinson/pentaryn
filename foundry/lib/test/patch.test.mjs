import { test } from "node:test";
import assert from "node:assert/strict";
import { defineAccessor, patches, unwrapAll, wrapMethod } from "../patch.mjs";

class Token {
  _onClickLeft2(event) { return `sheet:${event}`; }
}

test("direct wrap: this is bound, the original is callable, the marker makes it idempotent", () => {
  const original = Token.prototype._onClickLeft2;
  const spec = { target: Token.prototype, label: "Token#_onClickLeft2", name: "_onClickLeft2", marker: "__pentarynTest", adjustments: "x-token-dblclick" };
  const make = function (wrapped, event) { return event === "prompt" ? `dialog:${this.id}` : wrapped(event); };
  const h = wrapMethod("pentaryn-x", spec, make, { g: {} });
  assert.equal(h.via, "direct");
  const t = Object.assign(new Token(), { id: "t1" });
  assert.equal(t._onClickLeft2("prompt"), "dialog:t1");
  assert.equal(t._onClickLeft2("x"), "sheet:x");
  assert.equal(Token.prototype._onClickLeft2.__pentarynTest, true);
  assert.equal(wrapMethod("pentaryn-x", spec, make, { g: {} }), h);
  assert.deepEqual(patches(), [{ moduleId: "pentaryn-x", label: "Token#_onClickLeft2", name: "_onClickLeft2", marker: "__pentarynTest", via: "direct", adjustments: "x-token-dblclick" }]);
  unwrapAll();
  assert.equal(Token.prototype._onClickLeft2, original);
  assert.deepEqual(patches(), []);
});

test("a route registers first; a declining route falls through to direct", () => {
  const seen = [];
  const route = { name: "router", register: (spec, make) => { seen.push(spec.moduleId); return () => seen.push("unreg"); } };
  const decline = { name: "router", register: () => null };
  const target = { m() { return 1; } };
  const h = wrapMethod("pentaryn-x", { target, name: "m", marker: "__r", adjustments: "x-r" }, (w) => w() + 1, { via: route, g: {} });
  assert.equal(h.via, "router");
  assert.equal(target.m(), 1);                       // the route did the wrapping, not us
  const target2 = { m() { return 1; } };
  const h2 = wrapMethod("pentaryn-x", { target: target2, name: "m", marker: "__r", adjustments: "x-r" }, (w) => w() + 1, { via: decline, g: {} });
  assert.equal(h2.via, "direct");
  assert.equal(target2.m(), 2);
  unwrapAll();
  assert.deepEqual(seen, ["pentaryn-x", "unreg"]);
  assert.equal(target2.m(), 1);
});

test("a missing method warns and does nothing; defineAccessor is recorded and undoable", () => {
  const warns = [];
  const h = wrapMethod("pentaryn-x", { target: {}, label: "X#nope", name: "nope", marker: "__n", adjustments: "x-n" }, w => w(), { g: { console: { warn: m => warns.push(m) } } });
  assert.equal(h.via, null);
  assert.deepEqual(warns, ["pentaryn-x | X#nope not found; not patched"]);
  const target = { size: 1 };
  defineAccessor("pentaryn-x", target, "size", { get: () => 9 }, { marker: "__acc", adjustments: "x-size" });
  assert.equal(target.size, 9);
  assert.equal(patches().at(-1).adjustments, "x-size");
  unwrapAll();
  assert.equal(target.size, 1);
});

test("K1 getter route: wraps an accessor without running it on the prototype; idempotent; undoable", () => {
  let protoReads = 0;
  class Base { get isVisible() { if (this === Placeable.prototype) protoReads++; return this.visible === true; } }
  class Placeable extends Base {}
  const spec = { target: Placeable.prototype, kind: "getter", name: "isVisible", marker: "__pentarynVis", label: "Token#isVisible", adjustments: "x-visible" };
  const make = function (wrapped) { return wrapped() || this.owner === true; };
  const h = wrapMethod("pentaryn-x", spec, make, { g: {} });
  assert.equal(h.via, "direct");
  assert.equal(protoReads, 0, "the getter never ran against the prototype");
  assert.equal(Object.assign(new Placeable(), { visible: true }).isVisible, true);
  assert.equal(Object.assign(new Placeable(), { owner: true }).isVisible, true);
  assert.equal(new Placeable().isVisible, false);
  assert.equal(Object.getOwnPropertyDescriptor(Placeable.prototype, "isVisible").get.__pentarynVis, true);
  assert.equal(wrapMethod("pentaryn-x", spec, make, { g: {} }), h);
  assert.deepEqual(patches().map(p => p.label), ["Token#isVisible"]);
  unwrapAll();
  assert.equal(Object.getOwnPropertyDescriptor(Placeable.prototype, "isVisible"), undefined, "own property removed again");
  assert.equal(Object.assign(new Placeable(), { owner: true }).isVisible, false);
});

test("K1 getter route: a route goes first; a missing getter warns and patches nothing", () => {
  const seen = [];
  const route = { name: "libWrapper", register: spec => { seen.push(spec.kind); return () => seen.push("unreg"); } };
  const target = { get v() { return 1; } };
  assert.equal(wrapMethod("pentaryn-x", { target, kind: "getter", name: "v", marker: "__g", adjustments: "x" }, w => w() + 1, { via: route, g: {} }).via, "libWrapper");
  assert.equal(target.v, 1);
  const lines = [];
  const h = wrapMethod("pentaryn-x", { target: {}, kind: "getter", name: "nope", marker: "__n", adjustments: "x" }, w => w(), { g: { console: { warn: l => lines.push(l) } } });
  assert.equal(h.via, null);
  assert.deepEqual(lines, ["pentaryn-x | nope getter not found; not patched"]);
  unwrapAll();
  assert.deepEqual(seen, ["getter", "unreg"]);
});

test("J16: unwrap() drops the record, so the same marker wraps again; a second unwrap is a no-op", () => {
  class Sheet { open() { return "sheet"; } }
  const original = Sheet.prototype.open;
  const spec = { target: Sheet.prototype, name: "open", marker: "__pentarynJ16", adjustments: "x-j16" };
  const make = wrapped => `wrapped:${wrapped()}`;
  const h1 = wrapMethod("pentaryn-x", spec, make, { g: {} });
  assert.equal(new Sheet().open(), "wrapped:sheet");
  h1.unwrap();
  assert.equal(Sheet.prototype.open, original);
  assert.deepEqual(patches(), []);
  const h2 = wrapMethod("pentaryn-x", spec, make, { g: {} });
  assert.notEqual(h2, h1, "a fresh handle, not the stale one");
  assert.equal(new Sheet().open(), "wrapped:sheet", "wrapped again after unwrap()");
  assert.equal(patches().length, 1);
  h1.unwrap();                                       // the stale handle no longer touches anything
  assert.equal(new Sheet().open(), "wrapped:sheet");
  assert.equal(patches().length, 1);
  h2.unwrap();
  h2.unwrap();
  assert.equal(Sheet.prototype.open, original);
  assert.deepEqual(patches(), []);

  const seen = [];
  const route = { name: "router", register: () => () => seen.push("unreg") };
  const target = { m() { return 1; } };
  const hr = wrapMethod("pentaryn-x", { target, name: "m", marker: "__r16", adjustments: "x" }, w => w(), { via: route, g: {} });
  hr.unwrap();
  hr.unwrap();
  assert.deepEqual(seen, ["unreg"], "a route unregisters once");
  assert.notEqual(wrapMethod("pentaryn-x", { target, name: "m", marker: "__r16", adjustments: "x" }, w => w(), { via: route, g: {} }), hr);

  const box = { size: 1 };
  const ha = defineAccessor("pentaryn-x", box, "size", { get: () => 9 }, { marker: "__acc16", adjustments: "x" });
  ha.unwrap();
  assert.equal(box.size, 1);
  defineAccessor("pentaryn-x", box, "size", { get: () => 7 }, { marker: "__acc16", adjustments: "x" });
  assert.equal(box.size, 7, "defined again after unwrap()");

  class Base { get v() { return 1; } }
  class Leaf extends Base {}
  const gspec = { target: Leaf.prototype, kind: "getter", name: "v", marker: "__g16", adjustments: "x" };
  const hg = wrapMethod("pentaryn-x", gspec, w => w() + 1, { g: {} });
  hg.unwrap();
  assert.equal(new Leaf().v, 1);
  wrapMethod("pentaryn-x", gspec, w => w() + 10, { g: {} });
  assert.equal(new Leaf().v, 11, "the getter is wrapped again after unwrap()");
  unwrapAll();
  assert.equal(new Leaf().v, 1);
  assert.equal(box.size, 1);
  assert.deepEqual(patches(), []);
});

test("J16: when another wrapper sits on top, unwrap() cannot restore and the record stays", () => {
  class Sheet { open() { return "sheet"; } }
  const original = Sheet.prototype.open;
  const spec = { target: Sheet.prototype, name: "open", marker: "__pentarynJ16b", adjustments: "x-j16b" };
  const h = wrapMethod("pentaryn-x", spec, w => `ours:${w()}`, { g: {} });
  const ours = Sheet.prototype.open;
  Sheet.prototype.open = function () { return `theirs:${ours.call(this)}`; };   // a later, foreign wrap
  h.unwrap();
  assert.equal(new Sheet().open(), "theirs:ours:sheet", "nothing was torn out from under the foreign wrap");
  assert.equal(patches().length, 1, "the patch is still live, so it is still reported");
  assert.equal(wrapMethod("pentaryn-x", spec, w => w(), { g: {} }), h, "and not stacked a second time");
  Sheet.prototype.open = ours;                       // the foreign wrap goes away
  h.unwrap();
  assert.equal(Sheet.prototype.open, original);
  assert.deepEqual(patches(), []);
});

test("KIT-R1: unwrapAll keeps the record of a patch a foreign wrapper keeps live, so it is not stacked twice", () => {
  class Sheet { open() { return "sheet"; } close() { return "closed"; } }
  const original = Sheet.prototype.open;
  const spec = { target: Sheet.prototype, name: "open", marker: "__pentarynKitR1", adjustments: "x-kit-r1" };
  const h = wrapMethod("pentaryn-x", spec, w => `ours:${w()}`, { g: {} });
  const other = wrapMethod("pentaryn-x", { target: Sheet.prototype, name: "close", marker: "__pentarynKitR1c", adjustments: "x-kit-r1c" },
    w => `ours:${w()}`, { g: {} });
  const ours = Sheet.prototype.open;
  Sheet.prototype.open = function () { return `theirs:${ours.call(this)}`; };   // a later, foreign wrap
  unwrapAll();
  assert.equal(new Sheet().close(), "closed", "the undoable patch is gone");
  assert.equal(new Sheet().open(), "theirs:ours:sheet", "the foreign wrap is left alone");
  assert.deepEqual(patches().map(p => p.marker), ["__pentarynKitR1"], "the still-live patch stays listed");
  assert.equal(wrapMethod("pentaryn-x", spec, w => `again:${w()}`, { g: {} }), h, "a re-wrap returns the live handle");
  assert.equal(new Sheet().open(), "theirs:ours:sheet", "not stacked a second time");
  Sheet.prototype.open = ours;                       // the foreign wrap goes away
  unwrapAll();
  assert.equal(Sheet.prototype.open, original);
  assert.deepEqual(patches(), []);
  other.unwrap();                                    // already undone: a no-op
});
