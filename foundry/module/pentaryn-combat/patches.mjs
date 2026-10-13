/**
 * Prototype patches on core and Argon classes (feature), all through the kit's wrapMethod /
 * defineAccessor (C32), each recorded with its adjustments row for describe().patches. Every patch
 * keeps its old guard at the call site, so it is skipped when its target is absent or core already
 * defines the member.
 *
 *  scrollingTextGuard   (init) a background tab starts no floating canvas text, and a destroyed
 *                       PreciseText ignores a second destroy and x/y (core 14.369 console bursts:
 *                       "reading 'off'" at PreciseText.destroy, "reading 'position'" at set y);
 *                       a hidden tab's chat card posts no pop-up (ChatLog#notify, "setting 'hidden'")
 *  pip settle           (ready) Argon's ActionPanel#updateActionUse runs a second time whenever the
 *                       pip count changed under it, so used pips always paint (Area 4, D5)
 *
 * `install` registers the two init hooks; `installReady` the ready one. hud.mjs calls them at the
 * positions turnflow.mjs registered them, so the per-hook listener order is unchanged.
 */

import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { defineAccessor, wrapMethod } from "./lib/patch.mjs";
import { setting } from "./settings.mjs";
import { protoDescriptor } from "./argon.mjs";
import { opts } from "./context.mjs";

const log = makeLog(MODULE);
const handles = [];

/** The kit's wrapper is called `replacement`; keep the name the hand patch gave it (a test pins one). */
function keepName(target, name, fnName) {
  if (typeof target[name] === "function") Object.defineProperty(target[name], "name", { value: fnName, configurable: true });
}

/* ── floating canvas text in a background tab (setting scrollingTextGuard) ── */
// Area 2 console: the GM tab logged bursts of "Cannot read properties of null (reading 'off')" at
// PreciseText.destroy ← InterfaceCanvasGroup#createScrollingText (core 14.369). A tab in the
// background gets no animation frames, so every floating damage number waits in its animation; a
// canvas redraw (another scene activated) tears the scrolling-text layer down with the text in it
// and resolves the waiting animation, after which core destroys that text a second time. Now a
// hidden tab does not start floating text (nobody sees it), and destroying an already-destroyed
// PreciseText is a no-op. Core code is untouched.

function guardScrollingText() {
  try {
    const P = foundry.canvas?.containers?.PreciseText;
    if (P && !Object.hasOwn(P.prototype, "destroy")) {
      const own = P.prototype.destroy;
      handles.push(defineAccessor(MODULE, P.prototype, "destroy", {
        configurable: true, writable: true,
        value: function destroy(...args) {
          if (this.destroyed && setting("scrollingTextGuard")) return;
          return own.apply(this, args);
        }
      }, { marker: "_pentarynPreciseText", adjustments: "combat-core-scrolling-text-guard", label: "PreciseText#destroy" }, { log }));
    }
    // Area 6 re-run console: 156 × "Cannot read properties of null (reading 'position')" in one
    // burst, at PIXI's `set y` ← CanvasAnimation#updateAttribute. A floating text that started while
    // the tab was visible was still waiting (the tab went to the background) when a scene change
    // destroyed it; each waiting animation then set y on the destroyed text (its transform is null)
    // and core logged the error. Setting x/y on a destroyed PreciseText is now a no-op (reading it gives
// 0). With the setting Off both the getter and the setter are core's own (combat-core-EC-7).
    if (P && !Object.hasOwn(P.prototype, "y")) {
      for (const axis of ["x", "y"]) {
        const d = protoDescriptor(P.prototype, axis);
        if (!d?.set || !d?.get) continue;
        handles.push(defineAccessor(MODULE, P.prototype, axis, {
          configurable: true, enumerable: d.enumerable,
          get() {
            if (!this.transform && setting("scrollingTextGuard")) return 0;
            return d.get.call(this);
          },
          set(v) {
            if (!this.transform && setting("scrollingTextGuard")) return;
            d.set.call(this, v);
          }
        }, { marker: axis === "x" ? "_pentarynPreciseX" : "_pentarynPreciseY", adjustments: "combat-core-scrolling-text-teardown", label: `PreciseText#${axis}` }, { log }));
      }
    }
    const G = foundry.canvas?.groups?.InterfaceCanvasGroup;
    const cst = G?.prototype?.createScrollingText;
    if (cst && !cst._pentaryn) {
      handles.push(wrapMethod(MODULE, { target: G.prototype, name: "createScrollingText", marker: "_pentaryn", adjustments: "combat-core-scrolling-text-guard", label: "InterfaceCanvasGroup#createScrollingText" },
        function (wrapped, ...args) {
          if (document.hidden && setting("scrollingTextGuard")) return Promise.resolve();
          return wrapped(...args);
        }, { log }));
      keepName(G.prototype, "createScrollingText", "createScrollingText");
    }
  } catch (err) { log.warn("scrolling text guard", err); }
}

/* ── a background tab posts no chat-card pop-ups (setting scrollingTextGuard) ── */
// Area 3 console: 38 × "Cannot set properties of null (setting 'hidden')" at ChatLog#postNotification
// (core 14.369) in one burst on the GM tab. A hidden tab's pop-up waits on an animation that only
// finishes once the tab is shown again; a card deleted meanwhile (a cancelled attack's tidied card,
// a cleanup) is gone from the pop-up list, and core then sets `hidden` on null. A tab nobody looks at
// gets the chat tab's unread pip instead (core's own path when pop-ups are off).

function guardChatNotify() {
  try {
    const C = foundry.applications?.sidebar?.tabs?.ChatLog;
    const own = C?.prototype?.notify;
    if (!own || own._pentaryn) return;
    handles.push(wrapMethod(MODULE, { target: C.prototype, name: "notify", marker: "_pentaryn", adjustments: "combat-core-chat-notify-hidden-tab", label: "ChatLog#notify" },
      function (wrapped, message, options = {}) {
        if (document.hidden && options?.newMessage && setting("scrollingTextGuard")) {
          return wrapped(message, { ...options, newMessage: false });
        }
        return wrapped(message, options);
      }, { log }));
    keepName(C.prototype, "notify", "notify");
  } catch (err) { log.warn("chat pop-up guard", err); }
}

/* ── Argon's pips: one updateActionUse call always settles them ──────────── */
// Argon's ActionPanel#updateActionUse rebuilds the pips when their count differs from maxActions
// (an empty container mid-render included), then marks the OLD, now-detached list as used. Its own
// updateActor handler hit that while the Bonus bar was re-rendering after Starry Form, so the Bonus
// pip stayed lit with isActionUsed true (Area 4, D5). Our callers already called it twice ("twice
// settles it"); now every caller does, Argon's own included. Pure bug fix, no setting.

function settlePipsPatch() {
  try {
    const proto = CONFIG.ARGON?.MAIN?.ActionPanel?.prototype;
    if (!proto?.updateActionUse || proto.updateActionUse._pcSettles) return;
    handles.push(wrapMethod(MODULE, { target: proto, name: "updateActionUse", marker: "_pcSettles", adjustments: "combat-argon-pip-settle", label: "ActionPanel#updateActionUse" },
      function (wrapped, ...args) {
        const before = this.element?.querySelector?.(".actions-uses-container")?.children?.length ?? null;
        const out = wrapped(...args);
        const after = this.element?.querySelector?.(".actions-uses-container")?.children?.length ?? null;
        if (before !== after) wrapped(...args);
        return out;
      }, { log }));
    keepName(proto, "updateActionUse", "settled");
  } catch (err) { log.warn("Argon pip settle not installed", err); }
}

/* ── install ─────────────────────────────────────────────────────────────── */

/** The two init patches (turnflow.mjs registered them after the portrait's ready hook). */
export function install(reg) {
  reg.once("init", guardScrollingText, opts("patch: scrolling text guard"));
  reg.once("init", guardChatNotify, opts("patch: chat pop-up guard"));
}

/** The ready patch (after the drawers feature, where turnflow.mjs registered it). */
export function installReady(reg) {
  reg.once("ready", settlePipsPatch, opts("patch: Argon pip settle"));
}

/** Undo every patch this module applied (newest first). */
export function uninstall() {
  for (const h of handles.splice(0).reverse()) h.unwrap();
}
