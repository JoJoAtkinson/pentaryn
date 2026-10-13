/**
 * pentaryn-prompts — the type-ahead state machine: keys pressed between "a prompt box is about to
 * open" (a drop, the P key, a double-click) and the box's textarea taking focus belong to that box.
 * PURE: timers, the listener switch and the orphan toast are injected (typeahead-adapter.mjs wires
 * them to window, setTimeout and ui.notifications).
 *
 * Tickets: every pending open holds one, with its own buffer. Keys go to the NEWEST pending
 * ticket, so "drop, type one, drop, type two" gives the first box "one" and the second "two".
 * Capture stops when the last ticket is taken, cancelled or timed out. Text no box took (a drop
 * that never made a token) goes to the orphan sink (the open box) if it takes it, else `onOrphan`
 * — never silently lost.
 */

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "Fn", "FnLock", "OS", "Hyper", "Super"]);

/**
 * @param {{ setTimer: (fn: Function, ms: number) => *, clearTimer: (id: *) => void, timeoutMs?: number,
 *   onOrphan?: (text: string) => void, onCapture?: (on: boolean) => void }} deps
 *   onCapture(true/false): capture started / ended — the adapter adds or removes its keydown listener.
 */
export function createTypeahead({ setTimer, clearTimer, timeoutMs = 3500, onOrphan = () => {}, onCapture = () => {} }) {
  let seq = 0;
  /** ticket → {text, close, timer}, in start order (Map keeps insertion order). */
  const pending = new Map();
  let capturing = false;
  const swallowedUps = new Set();
  let orphanSink = null;

  function capture(on) {
    if (on === capturing) return;
    capturing = on;
    onCapture(on);
  }

  function newest() {
    let last = null;
    for (const b of pending.values()) last = b;
    return last;
  }

  function remove(ticket) {
    const buf = pending.get(ticket);
    if (!buf) return null;
    clearTimer(buf.timer);
    pending.delete(ticket);
    if (!pending.size) capture(false);
    return buf;
  }

  function orphan(text) {
    if (!text.trim()) return;
    if (orphanSink?.(text)) return;
    onOrphan(text);
  }

  const api = {
    /** Where unclaimed text goes: `(text) => boolean` (true = taken). */
    setOrphanSink(fn) { orphanSink = fn; },

    isCapturing() { return pending.size > 0; },

    /** Start capturing for an open that is about to happen. Synchronous. → ticket. */
    start() {
      const ticket = ++seq;
      const buf = { text: "", close: null, timer: null };
      buf.timer = setTimer(() => api.cancel(ticket), timeoutMs);
      pending.set(ticket, buf);
      capture(true);
      return ticket;
    },

    /** The box for `ticket` has focus: hand it its buffer `{text, close}`. */
    take(ticket) {
      const buf = remove(ticket);
      return buf ? { text: buf.text, close: buf.close } : { text: "", close: null };
    },

    /** The open for `ticket` will not happen (no token, not a GM, timed out): its text is an orphan. */
    cancel(ticket) {
      const buf = remove(ticket);
      if (buf) orphan(buf.text);
    },

    /** A keydown while capturing. → true when the key is the box's (swallow it: preventDefault + stop). */
    keyDown(ev) {
      const buf = newest();
      if (!buf) return false;
      if (MODIFIERS.has(ev.key)) return false;                              // modifier state stays with core
      if ((ev.metaKey || ev.ctrlKey) && ev.key !== "Enter") return false;   // browser/OS shortcuts (⌘R, ⌘C …)
      swallowedUps.add(ev.code);
      if (ev.isComposing) return true;
      if (typeof ev.key !== "string") return true;                         // keyless event (prompts-core-R4): swallowed, never thrown
      const k = ev.key;
      if (k === "Escape") buf.close = ev.shiftKey ? "discard" : "save";
      else if (k === "Enter") { if (ev.metaKey || ev.ctrlKey) buf.close = "save"; else buf.text += "\n"; }
      else if (k === "Backspace") buf.text = Array.from(buf.text).slice(0, -1).join("");
      else if ([...k].length === 1) buf.text += k;                         // printable, incl. Alt-composed characters
      // everything else (arrows, Delete, Tab, F-keys): swallowed — they would pan, delete or move tokens
      return true;
    },

    /**
     * The window lost focus (Cmd-Tab away mid-key): its keyups will never come, so forget every
     * swallowed code — the next press of that key reaches Foundry (prompts-lookup-32 item 2).
     */
    blur() {
      swallowedUps.clear();
    },

    /** A keyup: → true exactly once for a code whose keydown was swallowed (swallow its release too). */
    keyUp(code) {
      if (!swallowedUps.has(code)) return false;
      swallowedUps.delete(code);
      return true;
    },
  };
  return api;
}
