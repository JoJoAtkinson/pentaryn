/**
 * Pentaryn Feedback — FEATURE: the recorder. What this client did in the last few minutes, kept in
 * memory and attached to the next report. Installs at `setup` on every client, players included.
 *
 * Two rings, both client-local. They are copied to this tab's sessionStorage (at most once a second,
 * and on pagehide) and restored at install with a `reload` marker, so an F5 after something breaks
 * does not lose the history. sessionStorage is per tab and keyed by world + user; it never leaves the
 * browser except inside a report.
 *   actions  ≤ historySize (live setting, clamped 20..1000): scene, tool, tab, token control and
 *            target, window render/close, [data-action] clicks, the user's own document
 *            create/update/delete (keys only), the user's own chat cards, dnd5e activity use,
 *            combat turns, notifications
 *   errors   ≤ 50: window error / unhandledrejection (listening from the moment this file loads,
 *            so errors before `setup` are kept), core's "error" hook, console.error/warn
 *
 * Every handler is synchronous, pushes one small plain object and returns. Nothing is serialised
 * until a report is built (and the sessionStorage copy, throttled). No per-frame hook is listened to
 * (no pointermove, hover or refresh*). updateToken IS listened to (Token is in DOC_TYPES), but only the
 * user's own changes are kept, one entry per update — a drag is one move. Foundry's server keeps none
 * of this (it logs document creates and deletes only), which is why the client records it.
 */

import {
  DIALOG_ID, LIMITS, MODULE, QUIET_APPS, QUIET_APP_PATTERN, changedKeys, chatEntry, clip, errorEntry, historyMax,
  isDupError, messageOf, redact, ringPush, ringsFromStore, ringsKey, ringsToStore,
} from "./feedback-core.mjs";
import { wrapMethod } from "./lib/patch.mjs";

/** Document types whose own-user create/update/delete are recorded. */
export const DOC_TYPES = Object.freeze(["Actor", "Item", "Token", "Combat", "Combatant", "ActiveEffect", "Scene", "JournalEntry"]);

/** The console wraps, one adjustments row each (foundry/adjustments.yml); selftest reads them via ctx.exposed. */
export const CONSOLE_PATCHES = Object.freeze([
  { name: "error", marker: "__pentarynFeedback_error", adjustments: "feedback-console-error" },
  { name: "warn", marker: "__pentarynFeedback_warn", adjustments: "feedback-console-warn" },
]);

/** Generic base classes AppV2 also fires render hooks for: listen once, on the base, and skip these names. */
const BASE_APPS = new Set(["ApplicationV2", "Application", "HandlebarsApplication", "DocumentSheetV2", "ActorSheetV2", "ItemSheetV2"]);

const actions = [];
const errors = [];
const lastRender = new Map();     // app id → last recorded render time (throttle)
let lastTool = "";
const undo = [];                  // DOM listeners to remove on uninstall
/**
 * The wraps stay in place once made (the kit's wrapMethod is idempotent per marker and a re-wrap
 * after an unwrap would be refused), so they check this switch: off after uninstall, back on at the
 * next install. `console` follows the captureConsole setting read at install (requiresReload).
 */
const live = { on: false, early: true, console: false, historySize: () => 200 };

const now = () => Date.now();
const push = entry => {
  if (!live.on) return;
  ringPush(actions, { t: now(), ...entry }, historyMax(live.historySize()));
  persistSoon();
};
/** Errors are kept from file load (`early`) until the first uninstall, actions only while installed. */
const pushError = entry => {
  if (!live.on && !live.early) return;
  const e = errorEntry({ t: now(), ...entry });
  if (isDupError(errors, e)) return;
  ringPush(errors, e, LIMITS.errorsMax);
  persistSoon();
};
/** The recorder's own failure, kept without going through the console (that would recurse). */
const pushOwnError = e => {
  ringPush(errors, { t: now(), source: "recorder", message: redact(messageOf(e), LIMITS.message) }, LIMITS.errorsMax);
};

/* ── sessionStorage: the rings survive a reload of this tab ───────────── */

const store = { key: null, timer: null, dirty: false };

/** `g.sessionStorage`, or null when absent or blocked (the accessor itself can throw). */
function storage(g = globalThis) {
  try {
    return g.sessionStorage ?? null;
  } catch (err) {
    return null;
  }
}

/** Write the rings now (test seam; also the pagehide flush). Never throws. */
export function persistNow(g = globalThis) {
  store.dirty = false;
  if (store.timer !== null) {
    g.clearTimeout?.(store.timer);
    store.timer = null;
  }
  const s = store.key ? storage(g) : null;
  if (!s) return false;
  try {
    s.setItem(store.key, ringsToStore({ actions, errors }));
    return true;
  } catch (err) {
    return false;                       // quota or blocked storage: the in-memory rings still work
  }
}

/** Remove this tab's stored copy (uninstall). False when storage is absent or blocked. */
function forgetStored(g = globalThis) {
  const s = store.key ? storage(g) : null;
  if (!s) return false;
  try {
    s.removeItem(store.key);
    return true;
  } catch (err) {
    return false;                       // blocked storage: nothing was stored either
  }
}

function persistSoon(g = globalThis) {
  if (!store.key || !live.on) return;
  store.dirty = true;
  if (store.timer !== null || typeof g.setTimeout !== "function") return;
  store.timer = g.setTimeout(() => {
    store.timer = null;
    if (store.dirty) persistNow(g);
  }, LIMITS.persistMs);
  store.timer?.unref?.();               // node: never hold a test process open
}

/** Bring back what this tab stored before a reload: older entries first, then this page's. */
function restore(g, key) {
  let raw = null;
  try {
    raw = storage(g)?.getItem(key) ?? null;
  } catch (err) {
    raw = null;
  }
  const back = ringsFromStore(raw, { now: now() });
  if (!back) return;
  const mine = errors.splice(0);
  actions.splice(0, actions.length, ...back.actions);
  for (const e of [...back.errors, ...mine]) ringPush(errors, e, LIMITS.errorsMax);
}

/* ── window errors, from the moment this file loads ───────────────────── */

let windowUndo = null;

function onWindowError(event) {
  pushError({ source: "window", message: messageOf(event?.error ?? event?.message), stack: event?.error?.stack });
}
function onRejection(event) {
  pushError({ source: "promise", message: messageOf(event?.reason), stack: event?.reason?.stack });
}

/** Add the window error / unhandledrejection listeners once (at load, and again after an uninstall). */
function listenWindow(g = globalThis) {
  if (windowUndo || typeof g.addEventListener !== "function") return;
  g.addEventListener("error", onWindowError);
  g.addEventListener("unhandledrejection", onRejection);
  windowUndo = () => {
    g.removeEventListener?.("error", onWindowError);
    g.removeEventListener?.("unhandledrejection", onRejection);
    windowUndo = null;
  };
}

listenWindow();

/** Test seam and the API's view: copies, newest last. */
export function actionsOf() {
  return actions.map(a => ({ ...a }));
}
export function errorsOf() {
  return errors.map(e => ({ ...e }));
}

export function install(reg, ctx) {
  const g = globalThis;
  const me = () => g.game?.user?.id ?? null;
  live.on = true;
  live.console = ctx.setting("captureConsole") === true;
  live.historySize = () => ctx.setting("historySize");
  listenWindow(g);
  store.key = ringsKey(g.game?.world?.id, me());
  restore(g, store.key);
  const onPageHide = () => persistNow(g);
  if (typeof g.addEventListener === "function") {
    g.addEventListener("pagehide", onPageHide);
    undo.push(() => g.removeEventListener?.("pagehide", onPageHide));
  }

  /* ── where the user is ─────────────────────────────────────────────── */
  reg.on("canvasReady", canvas => {
    push({ kind: "scene", id: canvas?.scene?.id ?? null, name: clip(canvas?.scene?.name) });
  }, { label: "canvasReady: record scene" });

  reg.on("renderSceneControls", app => {
    const control = app?.control?.name ?? "";
    const tool = app?.tool?.name ?? "";
    const pair = `${control}/${tool}`;
    if (pair === lastTool) return;
    lastTool = pair;
    push({ kind: "tool", control, tool });
  }, { label: "renderSceneControls: record tool" });

  reg.on("changeSidebarTab", app => {
    push({ kind: "tab", tab: clip(app?.constructor?.tabName ?? app?.tabName ?? app?.id ?? "") });
  }, { label: "changeSidebarTab: record tab" });

  reg.on("controlToken", (token, controlled) => {
    push({ kind: "control", token: clip(token?.name ?? token?.document?.name), actor: clip(token?.actor?.name), on: !!controlled });
  }, { label: "controlToken: record" });

  reg.on("targetToken", (user, token, targeted) => {
    if (user?.id !== me()) return;
    push({ kind: "target", token: clip(token?.name ?? token?.document?.name), on: !!targeted });
  }, { label: "targetToken: record own" });

  /* ── windows ───────────────────────────────────────────────────────── */
  const appRow = (op, app) => {
    const cls = app?.constructor?.name ?? "";
    if (!cls || QUIET_APPS.has(cls) || BASE_APPS.has(cls) || QUIET_APP_PATTERN.test(cls)) return null;
    const id = app?.id ?? app?.appId ?? null;
    if (id === DIALOG_ID) return null;
    return { kind: "app", op, cls: clip(cls, 60), id: clip(id), title: redact(app?.title ?? "", LIMITS.title) };
  };
  const onRender = app => {
    const row = appRow("render", app);
    if (!row) return;
    const t = now();
    const key = row.id ?? row.cls;
    if (t - (lastRender.get(key) ?? -Infinity) < LIMITS.renderThrottleMs) return;
    lastRender.set(key, t);
    push(row);
  };
  const onClose = app => {
    const row = appRow("close", app);
    if (!row) return;
    lastRender.delete(row.id ?? row.cls);
    push(row);
  };
  // AppV2 fires render<Class> once per class in the chain: the base name catches every window once
  reg.on("renderApplicationV2", onRender, { label: "renderApplicationV2: record window" });
  reg.on("closeApplicationV2", onClose, { label: "closeApplicationV2: record window" });
  reg.on("renderApplication", onRender, { label: "renderApplication: record legacy window" });
  reg.on("closeApplication", onClose, { label: "closeApplication: record legacy window" });

  /* ── the user's own document changes, chat and activity use ────────── */
  for (const type of DOC_TYPES) {
    const row = (op, doc, keys) => ({
      kind: "doc", op, type, id: doc?.id ?? null, name: clip(doc?.name ?? doc?.actor?.name), ...(keys ? { keys } : {}),
    });
    reg.on(`create${type}`, (doc, options, userId) => {
      if (userId === me()) push(row("create", doc));
    }, { label: `create${type}: record own` });
    reg.on(`update${type}`, (doc, changes, options, userId) => {
      if (userId === me()) push(row("update", doc, changedKeys(changes)));
    }, { label: `update${type}: record own` });
    reg.on(`delete${type}`, (doc, options, userId) => {
      if (userId === me()) push(row("delete", doc));
    }, { label: `delete${type}: record own` });
  }

  reg.on("createChatMessage", (message, options, userId) => {
    const author = message?.author?.id ?? message?.author ?? userId;
    if (author !== me()) return;
    push({ kind: "chat", ...chatEntry(message), t: now() });
  }, { label: "createChatMessage: record own" });

  // dnd5e calls this with Hooks.call: the listener stays synchronous and never returns false
  reg.on("dnd5e.postUseActivity", activity => {
    push({ kind: "use", item: clip(activity?.item?.name), activity: clip(activity?.name), actor: clip(activity?.actor?.name) });
  }, { label: "dnd5e.postUseActivity: record use" });

  reg.on("updateCombat", (combat, changes) => {
    if (!changes || !("round" in changes || "turn" in changes)) return;
    push({ kind: "combat", round: combat?.round ?? null, turn: combat?.turn ?? null, combatant: clip(combat?.combatant?.name) });
  }, { label: "updateCombat: record turn" });

  /* ── errors ────────────────────────────────────────────────────────── */
  reg.on("error", (location, error) => {
    pushError({ source: "hooks", location: String(location ?? ""), message: messageOf(error), stack: error?.stack });
  }, { label: "error: record" });

  // window error / unhandledrejection: listening since this file loaded (listenWindow)

  /* ── clicks on anything with a data-action, capture phase ─────────── */
  const onClick = event => {
    const el = event?.target?.closest?.("[data-action]");
    if (!el) return;
    const win = el.closest?.(".application, .app");
    if (win?.id === DIALOG_ID) return;
    const app = win?.id ? g.foundry?.applications?.instances?.get?.(win.id) : null;
    const label = el.getAttribute?.("aria-label") || el.dataset?.tooltip || el.textContent || "";
    push({
      kind: "click", action: clip(el.dataset?.action ?? el.getAttribute?.("data-action")),
      cls: clip(app?.constructor?.name ?? null, 60), id: clip(win?.id ?? null),
      text: redact(String(label).replace(/\s+/g, " ").trim(), LIMITS.clickText),
    });
  };
  const body = g.document?.body;
  if (body?.addEventListener) {
    body.addEventListener("click", onClick, true);
    undo.push(() => body.removeEventListener?.("click", onClick, true));
  }

  /* ── patches: console lines and notifications (adjustments rows) ──── */
  if (live.console) {
    for (const spec of CONSOLE_PATCHES) {
      const { name } = spec;
      wrapMethod(MODULE, { target: g.console, label: `console.${name}`, ...spec }, function (wrapped, ...args) {
        if (live.on && live.console) {
          try {
            const err = args.find(a => a instanceof Error);
            pushError({ source: `console.${name}`, message: args.map(messageOf).join(" "), stack: err?.stack });
          } catch (e) {
            // never let the recorder break a console line; logging here would recurse
            pushOwnError(e);
          }
        }
        return wrapped(...args);
      }, { log: ctx.log });
    }
  }

  const Notifications = g.foundry?.applications?.ui?.Notifications;
  if (Notifications?.prototype?.notify) {
    wrapMethod(MODULE, {
      target: Notifications.prototype, name: "notify", label: "Notifications#notify",
      marker: "__pentarynFeedbackNotify", adjustments: "feedback-notifications-notify",
    }, function (wrapped, message, type = "info", ...rest) {
      try {
        push({ kind: "notify", level: clip(type, 16), text: redact(messageOf(message), LIMITS.field) });
      } catch (e) {
        pushOwnError(e);
      }
      return wrapped(message, type, ...rest);
    }, { log: ctx.log });
  } else {
    ctx.log.debug("no Notifications#notify to record");
  }

  ctx.expose({ actions: actionsOf, errors: errorsOf, consolePatches: () => CONSOLE_PATCHES });
}

export function uninstall() {
  live.on = false;
  live.early = false;
  for (const fn of undo.splice(0).reverse()) fn();
  windowUndo?.();
  if (store.timer !== null) globalThis.clearTimeout?.(store.timer);
  store.timer = null;
  forgetStored();
  store.key = null;
  actions.length = 0;
  errors.length = 0;
  lastRender.clear();
  lastTool = "";
}
