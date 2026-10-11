/**
 * Pentaryn Feedback — FEATURE: the recorder. What this client did in the last few minutes, kept in
 * memory and attached to the next report. Installs at `setup` on every client, players included.
 *
 * Two rings, both client-local and never persisted:
 *   actions  ≤ historySize (live setting, clamped 20..1000): scene, tool, tab, token control and
 *            target, window render/close, [data-action] clicks, the user's own document
 *            create/update/delete (keys only), the user's own chat cards, dnd5e activity use,
 *            combat turns, notifications
 *   errors   ≤ 50: window error / unhandledrejection, core's "error" hook, console.error/warn
 *
 * Every handler is synchronous, pushes one small plain object and returns. Nothing is serialised
 * until a report is built. No hot hook is listened to (no pointermove, hover, refresh or
 * updateToken). Foundry's server keeps none of this (it logs document creates and deletes only),
 * which is why the client records it.
 */

import { DIALOG_ID, LIMITS, MODULE, changedKeys, chatEntry, clip, errorEntry, historyMax, isDupError, messageOf, redact, ringPush } from "./feedback-core.mjs";
import { wrapMethod } from "./lib/patch.mjs";

/** Document types whose own-user create/update/delete are recorded. */
export const DOC_TYPES = Object.freeze(["Actor", "Item", "Token", "Combat", "Combatant", "ActiveEffect", "Scene", "JournalEntry"]);

/** The console wraps, one adjustments row each (foundry/adjustments.yml). */
const CONSOLE_PATCHES = Object.freeze([
  { name: "error", marker: "__pentarynFeedback_error", adjustments: "feedback-console-error" },
  { name: "warn", marker: "__pentarynFeedback_warn", adjustments: "feedback-console-warn" },
]);

/** Application classes whose render/close is noise (or is this module's own dialog). */
const SKIP_APPS = new Set(["ChatLog", "SceneControls", "Hotbar", "Players", "Notifications", "ReportDialog", "SceneNavigation", "MainMenu", "Pause"]);
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
const live = { on: false, console: false, historySize: () => 200 };

const now = () => Date.now();
const push = entry => {
  if (live.on) ringPush(actions, { t: now(), ...entry }, historyMax(live.historySize()));
};
const pushError = entry => {
  if (!live.on) return;
  const e = errorEntry({ t: now(), ...entry });
  if (!isDupError(errors, e)) ringPush(errors, e, LIMITS.errorsMax);
};

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
    if (!cls || SKIP_APPS.has(cls) || BASE_APPS.has(cls)) return null;
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

  const onWindowError = event => {
    pushError({ source: "window", message: messageOf(event?.error ?? event?.message), stack: event?.error?.stack });
  };
  const onRejection = event => {
    pushError({ source: "promise", message: messageOf(event?.reason), stack: event?.reason?.stack });
  };
  if (typeof g.addEventListener === "function") {
    g.addEventListener("error", onWindowError);
    g.addEventListener("unhandledrejection", onRejection);
    undo.push(() => {
      g.removeEventListener?.("error", onWindowError);
      g.removeEventListener?.("unhandledrejection", onRejection);
    });
  }

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
            errors.push({ t: now(), source: "recorder", message: clip(messageOf(e), LIMITS.message) });
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
        errors.push({ t: now(), source: "recorder", message: clip(messageOf(e), LIMITS.message) });
      }
      return wrapped(message, type, ...rest);
    }, { log: ctx.log });
  } else {
    ctx.log.debug("no Notifications#notify to record");
  }

  ctx.expose({ actions: actionsOf, errors: errorsOf });
}

export function uninstall() {
  live.on = false;
  for (const fn of undo.splice(0).reverse()) fn();
  actions.length = 0;
  errors.length = 0;
  lastRender.clear();
  lastTool = "";
}
