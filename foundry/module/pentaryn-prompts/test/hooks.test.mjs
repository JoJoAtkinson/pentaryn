/**
 * The hook manifest (guide step 12, C20/C40): each feature exports install/uninstall; installed in
 * FEATURES order they register exactly the rows golden/hooks.json pins between the entry's own
 * `init` (first) and `ready` (last), each with its label; uninstall leaves nothing registered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";
import { installWorld, FakeElement, MODULE } from "./fixtures/world.mjs";

const F = await installWorld();
const { hookRegistry } = await import("../lib/hooks.mjs");
const { makeLog } = await import("../lib/log.mjs");
const FEATURES = await Promise.all(["typeahead", "marker-guard", "placement", "hud-button", "tooltip", "panels", "patches"]
  .map(f => import(`../${f}.mjs`)));
const GOLDEN = readJSON(new URL("golden/hooks.json", import.meta.url));

function rig() {
  const log = makeLog(MODULE);
  const reg = hookRegistry(MODULE, log);
  const ctx = { log, reg, contributions: [], exposed: {}, expose(a) { Object.assign(ctx.exposed, a); } };
  return { reg, ctx };
}

test("every feature exports install and uninstall", () => {
  for (const f of FEATURES) {
    assert.equal(typeof f.install, "function");
    assert.equal(typeof f.uninstall, "function");
  }
});

test("FEATURES in order register golden/hooks.json between init and ready, with labels", () => {
  const { reg, ctx } = rig();
  for (const f of FEATURES) f.install(reg, ctx);
  assert.deepEqual(reg.ids().map(({ kind, name }) => ({ kind, name })), GOLDEN.slice(1, -1));
  assert.deepEqual(GOLDEN[0], { kind: "once", name: "init" });
  assert.deepEqual(GOLDEN.at(-1), { kind: "once", name: "ready" });
  assert.deepEqual(reg.ids().map(r => r.label), [
    "preCreateToken: hide and stamp markers",
    "dropCanvasData: a marker drop", "createToken: open the dropped marker's box",
    "renderTokenHUD: edit button",
    "hoverToken: marker tip", "canvasPan: hide tip", "renderPromptDialog: hide tip", "canvasTearDown: hide tip",
    "deleteToken: hide tip, close its box",
    "createWall: refresh panels", "updateWall: refresh panels", "deleteWall: refresh panels", "createToken: refresh panels",
    "deleteToken: refresh panels", "createNote: refresh panels", "deleteNote: refresh panels",
    "updateToken: refresh panels when moved",
    "setup: double-click opens the box",
  ]);
  assert.deepEqual(Object.keys(ctx.exposed).sort(), ["doubleClick", "open", "place"]);
  for (const f of [...FEATURES].reverse()) f.uninstall();
  reg.offAll();
  assert.deepEqual(reg.ids(), []);
  // nothing answers any more: a marker's HUD gets no button
  const root = new FakeElement("div");
  const col = root.appendChild(new FakeElement("div"));
  col.className = "col right";
  F.fire("renderTokenHUD", { object: { document: F.s1.tokens.get("m1") } }, root);
  assert.equal(col.children.length, 0);
});
