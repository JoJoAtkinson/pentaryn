/**
 * pentaryn-prompts — type-ahead on the page: the one createTypeahead instance (typeahead-core.mjs)
 * wired to `window`, the timers and the orphan toast.
 *
 * Without this, whatever Joe types between a drop and the box's focus goes to Foundry's hotkeys
 * (the ruler tool, the compendium browser, module bindings) and the marker closes empty. A capturing
 * keydown listener on `window` runs before core's KeyboardManager (which listens on window,
 * bubbling), swallows the keys and buffers them; the dialog takes its buffer the moment its
 * textarea has focus. The keydown listener is on only while something is capturing; keyup is
 * always watched, because a key pressed while capturing may be released after capture ends.
 *
 * ADAPTER (window, setTimeout, ui.notifications). Its exports are today's surface:
 * start / take / cancel / isCapturing / setOrphanSink.
 */

import { createTypeahead } from "./typeahead-core.mjs";

const TIMEOUT_MS = 3500;

const T = createTypeahead({
  // looked up at call time, so a test's mock timers apply
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: id => clearTimeout(id),
  timeoutMs: TIMEOUT_MS,
  // the no-sink fallback: the same localised toast the entry's sink shows (M12); English only where
  // `_loc` is not defined (node)
  onOrphan: text => {
    const shown = text.trim().slice(0, 120);
    ui.notifications?.warn(typeof _loc === "function"
      ? _loc("PENTARYN_PROMPTS.typeahead.orphan", { text: shown })
      : `Typed before a prompt box opened and not used: "${shown}"`);
  },
  onCapture: on => {
    if (on) window.addEventListener("keydown", onKeyDown, true);
    else window.removeEventListener("keydown", onKeyDown, true);
  },
});

function onKeyDown(ev) {
  if (!T.keyDown(ev)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
}

function onKeyUp(ev) {
  if (!T.keyUp(ev.code)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
}

// keyup is always watched: a key pressed while capturing may be released after capture ends
window.addEventListener("keyup", onKeyUp, true);
// a key released while the window is away never sends its keyup: forget what was swallowed
window.addEventListener("blur", () => T.blur());

export const { start, take, cancel, isCapturing, setOrphanSink } = T;
