/**
 * PT overnight 2026-10-12 (PR-3, [declared] DP8 live check): with a box open, renaming an actor in
 * view must redraw the side panel. Core renames a linked actor's placed tokens with an updateToken
 * whose changes carry only `name`, so the panel's updateToken filter must count a rename (and a new
 * image) as well as a move; a change the panel never shows (a flag) still does not redraw it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld } from "./fixtures/world.mjs";

const MODULE = "pentaryn-prompts";
const F = await installWorld();
const { hookRegistry } = await import("../lib/hooks.mjs");
const { makeLog } = await import("../lib/log.mjs");
const panels = await import("../panels.mjs");
const { PromptDialog } = await import("../dialog.mjs");

test("updateToken redraws the open panels on a move, a rename or a new image, not on a flag", () => {
  const log = makeLog(MODULE);
  const reg = hookRegistry(MODULE, log);
  panels.install(reg, { log, reg });
  const seen = [];
  const saved = PromptDialog.refreshPanels;
  PromptDialog.refreshPanels = id => seen.push(id);
  try {
    const doc = F.s1.tokens.get("tokOrdinary00001");
    F.fire("updateToken", doc, { x: 500 });
    F.fire("updateToken", doc, { name: "Guard Renamed" });
    F.fire("updateToken", doc, { texture: { src: "a.webp" } });
    F.fire("updateToken", doc, { flags: { other: { a: 1 } } });
    assert.deepEqual(seen, ["s1", "s1", "s1"]);
  } finally {
    PromptDialog.refreshPanels = saved;
    panels.uninstall();
    reg.offAll();
  }
});
