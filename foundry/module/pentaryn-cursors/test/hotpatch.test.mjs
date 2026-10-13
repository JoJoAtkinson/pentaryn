// Hot patch (blueprint use-doc §4.1): after uninstall(), re-importing the entry once the world is
// ready re-registers the same hooks, attaches the board a tick later and republishes a NEW API
// object. Static imports resolve to the instances already loaded, so it is the same code.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { cursorWorld, flush, hookSequence } from "./fixtures/board.mjs";
import { MODULE } from "../cursors-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await cursorWorld();
await import("../cursors.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
await flush();

test("uninstall, then re-import ?v=2: same hooks, board re-attached, a new API published", async () => {
  const first = game.pentaryn.cursors;
  const tool = { name: "target", onChange: () => {} };
  F.fire("getSceneControlButtons", { tokens: { name: "tokens", onChange: () => {}, tools: { target: tool } } });
  F.setTool("tokens", "ruler");
  assert.equal(first.refresh(), "ruler");
  first.uninstall();
  assert.equal(first.current(), null);
  assert.deepEqual(F.el.props(), {});
  tool.onChange();
  assert.equal(first.current(), null, "cursors-rob-3: the wrapped onChange is inert while uninstalled");

  const before = F.hooks.length;
  const registers = F.calls.filter(c => c.op === "settings.register").length;
  await import("../cursors.mjs?v=2");
  assert.deepEqual(hookSequence(F.hooks.slice(before)).map(h => `${h.kind} ${h.name}`), [
    "on getSceneControlButtons", "on renderSceneControls", "on activateCanvasLayer",
    "on canvasReady", "on canvasTearDown",
  ], "no init/ready listeners: those phases ran at once");
  assert.equal(F.calls.filter(c => c.op === "settings.register").length, registers, "the existing setting is skipped");

  const second = game.pentaryn.cursors;
  assert.notEqual(second, first);
  assert.equal(game.modules.get(MODULE).api, second);
  assert.equal(second.current(), null, "the board attaches a tick later");
  mock.timers.tick(0);
  assert.equal(second.current(), "ruler");
  F.setTool("notes", "journal");
  F.fire("renderSceneControls");
  assert.equal(second.current(), "note", "the re-registered hooks drive the board");

  // cursors-rob-3: install() re-arms what outlived the uninstall — the still-wrapped onChange and
  // the still-watched preview container drive the board again.
  F.setTool("tokens", "target");
  tool.onChange();
  assert.equal(second.current(), "target", "the old wrapped onChange refreshes again");
  F.setTool("tokens", "select");
  const placing = { id: "preview" };
  canvas.regions._placementContext = { preview: placing };
  F.preview.children.push(placing);
  F.preview.emit("childAdded", placing);
  assert.equal(second.current(), "aoe", "the preview listener refreshes again");
  F.preview.children.length = 0;
  canvas.regions._placementContext = null;
  F.preview.emit("childRemoved", placing);
  assert.equal(second.current(), null);
});
