/**
 * Pentaryn Creatures — FEATURE: when the "Your creatures" strip redraws. Every trigger schedules
 * one render 60 ms later (a burst renders once); the drawing itself is strip.mjs.
 */

import { stripMayChange } from "./creatures-core.mjs";
import { forget, list, markControlled, remove, render } from "./strip.mjs";

let log = null;
let renderTimer = null;

/** Render 60 ms from now; a later call pushes it back. A render failure is one console line. */
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    try { render(); } catch (err) { log.warn("strip render failed", err); }
  }, 60);
}

/**
 * Hooks in the module's historic order. None had a try/catch of its own, so none is guarded: a
 * throw still reaches Foundry's hook error handling as before.
 */
export function install(reg, ctx) {
  log = ctx.log;
  reg.on("canvasReady", () => { forget(); scheduleRender(); }, { guard: false, label: "canvasReady: redraw strip" });
  for (const h of ["createToken", "deleteToken", "updateToken"]) {
    reg.on(h, (doc, changes) => {
      // a move (x, y, elevation, rotation) cannot change the strip (transform-creatures-25)
      if (h === "updateToken" && !stripMayChange(changes)) return;
      if (doc.parent?.id === canvas?.scene?.id) scheduleRender();
    }, { guard: false, label: `${h}: redraw strip` });
  }
  reg.on("updateActor", (_actor, changes) => {
    if (changes && ("ownership" in changes || "img" in changes || "name" in changes)) scheduleRender();
  }, { guard: false, label: "updateActor: redraw strip" });
  reg.on("updateUser", (user, changes) => {
    if (user.isSelf && changes && "character" in changes) scheduleRender();
  }, { guard: false, label: "updateUser: redraw strip" });
  reg.on("controlToken", () => markControlled(), { guard: false, label: "controlToken: mark strip" });
  ctx.onSettingChange("showStrip", () => { forget(); scheduleRender(); });
  ctx.expose({ list, render: () => { forget(); render(); }, scheduleRender });
}

/** Cancel a pending render and take the strip off the page. */
export function uninstall() {
  clearTimeout(renderTimer);
  renderTimer = null;
  remove();
}
