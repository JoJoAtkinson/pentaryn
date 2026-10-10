/**
 * pentaryn-prompts — type-ahead: keys pressed between "a prompt box is about to open" (a drop,
 * the P key, a double-click) and the box's textarea taking focus belong to that box.
 *
 * Without this, whatever Joe types in that gap goes to Foundry's hotkeys (the ruler tool, the
 * compendium browser, module bindings) and the marker closes empty. A capturing keydown listener
 * on `window` runs before core's KeyboardManager (which listens on window, bubbling), swallows the
 * keys and buffers them; the dialog takes its buffer the moment its textarea has focus.
 *
 * Tickets: every pending open holds one, with its own buffer. Keys go to the NEWEST pending
 * ticket, so "drop, type one, drop, type two" gives the first box "one" and the second "two".
 * Capture stops when the last ticket is taken, cancelled or timed out. Text no box took (a drop
 * that never made a token) goes to the open box if there is one, else into a notification —
 * never silently lost.
 */

const TIMEOUT_MS = 3500;
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "Fn", "FnLock", "OS", "Hyper", "Super"]);

let seq = 0;
/** ticket → {text, close, timer}, in start order (Map keeps insertion order). */
const pending = new Map();
let listening = false;
const swallowedUps = new Set();
let orphanSink = null;

/** Where unclaimed text goes: `(text) => boolean` (true = taken). */
export function setOrphanSink(fn) { orphanSink = fn; }

export function isCapturing() { return pending.size > 0; }

function newest() {
  let last = null;
  for (const b of pending.values()) last = b;
  return last;
}

function onKeyDown(ev) {
  const buf = newest();
  if (!buf) return;
  if (MODIFIERS.has(ev.key)) return;                              // modifier state stays with core
  if ((ev.metaKey || ev.ctrlKey) && ev.key !== "Enter") return;   // browser/OS shortcuts (⌘R, ⌘C …)
  ev.preventDefault();
  ev.stopImmediatePropagation();
  swallowedUps.add(ev.code);
  if (ev.isComposing) return;
  const k = ev.key;
  if (k === "Escape") buf.close = ev.shiftKey ? "discard" : "save";
  else if (k === "Enter") { if (ev.metaKey || ev.ctrlKey) buf.close = "save"; else buf.text += "\n"; }
  else if (k === "Backspace") buf.text = Array.from(buf.text).slice(0, -1).join("");
  else if ([...k].length === 1) buf.text += k;                   // printable, incl. Alt-composed characters
  // everything else (arrows, Delete, Tab, F-keys): swallowed — they would pan, delete or move tokens
}

function onKeyUp(ev) {
  if (!swallowedUps.has(ev.code)) return;
  swallowedUps.delete(ev.code);
  ev.preventDefault();
  ev.stopImmediatePropagation();
}

function listen(on) {
  if (on === listening) return;
  listening = on;
  if (on) window.addEventListener("keydown", onKeyDown, true);
  else window.removeEventListener("keydown", onKeyDown, true);
}

// keyup is always watched: a key pressed while capturing may be released after capture ends
window.addEventListener("keyup", onKeyUp, true);

function remove(ticket) {
  const buf = pending.get(ticket);
  if (!buf) return null;
  clearTimeout(buf.timer);
  pending.delete(ticket);
  if (!pending.size) listen(false);
  return buf;
}

function orphan(text) {
  if (!text.trim()) return;
  if (orphanSink?.(text)) return;
  ui.notifications?.warn(`Typed before a prompt box opened and not used: "${text.trim().slice(0, 120)}"`);
}

/** Start capturing for an open that is about to happen. Synchronous. → ticket. */
export function start() {
  const ticket = ++seq;
  const buf = { text: "", close: null, timer: null };
  buf.timer = setTimeout(() => cancel(ticket), TIMEOUT_MS);
  pending.set(ticket, buf);
  listen(true);
  return ticket;
}

/** The box for `ticket` has focus: hand it its buffer `{text, close}`. */
export function take(ticket) {
  const buf = remove(ticket);
  return buf ? { text: buf.text, close: buf.close } : { text: "", close: null };
}

/** The open for `ticket` will not happen (no token, not a GM, timed out): its text is an orphan. */
export function cancel(ticket) {
  const buf = remove(ticket);
  if (buf) orphan(buf.text);
}
