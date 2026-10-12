// transform-creatures-12 (audit Wave 8.6): transform's forked Argon helpers are the kit's
// lib/argon-kit.mjs (combat vendors the same file). Proved on the audit's DOM-free fake panel and
// against the checkpoint oracle for the button classification; transform keeps no copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyButtons, slotKind } from "../lib/argon-kit.mjs";
import { legacyDescribe } from "./fixtures/legacy-hud.mjs";
import { sourceScan } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("applyButtons (transform's call: no attachDetached, no after) on the -12 fake panel", () => {
  const btn = () => ({ element: { remove() { this.removed = true; } }, render() { this.rendered = true; } });
  const [a, b, c] = [btn(), btn(), btn()];
  const panel = { _buttons: [a, b], element: { kids: [], isConnected: true, appendChild(x) { this.kids.push(x); } },
    updateVisibility() { this.vis = (this.vis || 0) + 1; } };
  applyButtons(panel, [b, c], [c]);
  assert.equal(a.element.removed, true);
  assert.deepEqual(panel.element.kids, [b.element, c.element]);
  assert.equal(b._parent, panel);
  assert.equal(c._parent, panel);
  assert.deepEqual(panel._buttons, [b, c]);
  assert.equal(b.rendered, undefined);
  assert.equal(c.rendered, true);
  assert.equal(panel.vis, 1);
});

test("slotKind equals the checkpoint's describe (legacyDescribe) case for case", () => {
  class ItemButton { constructor(item) { this.item = item; } }
  class SplitButton { constructor(a, b) { this.button1 = a; this.button2 = b; } }
  const C = { ItemButton, SplitButton };
  const cases = [[{ _isWeaponSet: true }, C], [new ItemButton({ id: "x" }), C], [new ItemButton(null), C],
    [new SplitButton(new ItemButton({ id: "a" }), null), C], [new SplitButton(), { ItemButton }], [null, C]];
  for (const [button, classes] of cases) assert.deepEqual(slotKind(button, classes), legacyDescribe(button, classes));
});

test("no forked copy left: applyButtons / itemButtonClass / paintBadge's markup live only in lib/", () => {
  assert.deepEqual(sourceScan(ROOT, /function applyButtons\(|function itemButtonClass\(|quantity-1/).map(h => h.file), []);
});
