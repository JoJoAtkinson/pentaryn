// The canvas side of the Foundry stub for the cursors glue tests (guide step 1.5), with the
// stub-fidelity notes of wave-1-baseline.md SF8 applied:
//  - #board is a CANVAS whose style.cursor is Foundry's `var(--cursor-default)` for every tool;
//    the module never writes it, only the four --cursor-* properties inline on it.
//  - events.setCursor(mode) records the mode AND what currentCursor held at the call, then sets it,
//    as PIXI's EventSystem#setCursor does.
//  - CSS.supports is absent in node (imageSet false) unless `imageSet` is passed; live Chrome
//    supports image-set() in `cursor`, so the live branch is the image-set one.
import { installFoundry, makeUser } from "../kit/foundry-stub.mjs";
import { MODULE, VARS } from "../../cursors-core.mjs";

export function makeBoard() {
  const props = new Map();
  const styleCalls = [];
  const style = {
    cursor: "var(--cursor-default)",
    setProperty(k, v) {
      styleCalls.push(["set", k]);
      props.set(k, String(v));
    },
    removeProperty(k) {
      styleCalls.push(["remove", k]);
      const had = props.get(k) ?? "";
      props.delete(k);
      return had;
    },
    getPropertyValue(k) {
      return props.get(k) ?? "";
    },
  };
  return {
    id: "board",
    tagName: "CANVAS",
    style,
    dataset: {},
    styleCalls,
    /** The four variables as the live golden reads them: getPropertyValue(v) || null. */
    vars: () => Object.fromEntries(VARS.map(v => [v, props.get(v) || null])),
    /** Every inline property, ours or not. */
    props: () => Object.fromEntries(props),
  };
}

/** canvas.regions.preview: a PIXI container whose `on` is recorded and whose listeners can be fired. */
export function makePreview() {
  const listeners = {};
  const preview = {
    children: [],
    onCalls: [],
    on(event, fn) {
      preview.onCalls.push(event);
      (listeners[event] ??= []).push(fn);
      return preview;
    },
    emit(event, ...args) {
      for (const fn of listeners[event] ?? []) fn(...args);
    },
  };
  return preview;
}

export function makeEvents(el) {
  const events = {
    domElement: el,
    currentCursor: null,
    setCursorCalls: [],
    setCursor(mode) {
      events.setCursorCalls.push({ mode, currentBefore: events.currentCursor });
      if (events.throwOnSetCursor) throw new Error("setCursor broke");
      events.currentCursor = mode;
    },
  };
  return events;
}

/**
 * Install Foundry and the canvas stubs. Returns F plus the handles a test drives:
 * { el, events, preview, observers, cssProbes, setTool(control, tool) }.
 */
export async function cursorWorld({ imageSet = false, pentaryn } = {}) {
  const F = await installFoundry({ user: makeUser({ isGM: false }), modules: [{ id: MODULE, version: "0.2.0" }] });
  F.foundry.utils.getRoute = p => "/" + p;

  const el = makeBoard();
  const events = makeEvents(el);
  const preview = makePreview();
  canvas.ready = true;
  canvas.app = { renderer: { events }, view: el };
  canvas.regions = { preview, _placementContext: null };
  ui.controls = { control: { name: "tokens" }, tool: { name: "select" } };
  const setTool = (control, tool) => {
    ui.controls.control = { name: control };
    ui.controls.tool = { name: tool };
  };

  const observers = [];
  globalThis.MutationObserver = class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      observers.push(this);
    }
    observe(target, options) {
      this.observed.push({ target, options });
    }
    disconnect() {}
  };

  const cssProbes = [];
  if (imageSet) {
    globalThis.CSS = {
      supports: (...args) => {
        cssProbes.push(args);
        return true;
      },
    };
  } else delete globalThis.CSS;

  if (pentaryn !== undefined) game.pentaryn = pentaryn;
  return Object.assign(F, { el, events, preview, observers, cssProbes, setTool });
}

/** F.hooks with consecutive identical {kind, name} rows collapsed (see guide step 1, hooks golden). */
export function hookSequence(hooks) {
  const out = [];
  for (const h of hooks) {
    const last = out.at(-1);
    if (last && last.kind === h.kind && last.name === h.name) continue;
    out.push({ kind: h.kind, name: h.name });
  }
  return out;
}

/** Drain microtasks (the ready tick's work is synchronous, but keep this for publish's promises). */
export async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
