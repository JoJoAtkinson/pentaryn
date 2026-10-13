/**
 * Pentaryn Creatures — FEATURE: when the "Your creatures" strip redraws. The first trigger schedules
 * one render 60 ms later (a burst renders once); the drawing itself is strip.mjs.
 */

import { makeCoalescer, stripMayChange } from "./creatures-core.mjs";
import { forget, list, markControlled, placeStrip, remove, render } from "./strip.mjs";

let log = null;
/**
 * Render at most 60 ms after the first trigger, never pushed back by later ones: other modules
 * write token flags constantly in combat, and a debounce let that traffic postpone the redraw
 * indefinitely (creatures-edge-3). A render failure is one console line. The timers are read at
 * call time (tests mock them).
 */
const renderer = makeCoalescer(60, () => {
  try { render(); } catch (err) { log.warn("strip render failed", err); }
}, {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
  mode: "window",
});

function scheduleRender() {
  renderer.arm();
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
  // a world setting: every client re-places its own strip (starts or stops its dock poll); no writes
  ctx.onSettingChange("floatOverHud", () => placeStrip());
  ctx.expose({ list, render: () => { forget(); render(); }, scheduleRender });
}

/** Cancel a pending render and take the strip off the page. */
export function uninstall() {
  renderer.cancel();
  remove();
}
