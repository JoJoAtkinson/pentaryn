/**
 * Pentaryn Creatures — FEATURE: owners always see their own tokens. A token you own stays drawn on
 * your screen even when nothing you control can see it (an Invisible Arcane Eye in the dark). A
 * per-client override of Token#isVisible that only ever adds tokens the user owns, never GM-hidden
 * ones; core's ownerShouldSee decides.
 *
 * The wrap goes through the kit's wrapMethod: libWrapper (WRAPPER on the dotted path) when
 * lib-wrapper is active, else the getter is replaced on the prototype (a registration failure
 * falls through to that). It reads three private core fields (`_preview._previewType`,
 * `isFilteredOut`, `_testCulled`) — adjustments row `creatures-libwrapper`.
 */

import { MODULE, ownerShouldSee, safely } from "./creatures-core.mjs";
import { setting } from "./settings.mjs";
import { isProp } from "./tokens-adapter.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { libWrapperRoute } from "./lib/patch-libwrapper.mjs";

let log = null;
let ownerSeesOn = true;
let patchedWith = null;

/**
 * Called only when core said "not visible", inside a getter core runs for every unseen token on
 * every visibility refresh: it never throws. A failure (a private field renamed by a core update)
 * answers false and warns once per session (transform-creatures-29).
 */
export function ownerOverride(token) {
  if (!ownerSeesOn || game.user.isGM) return false;
  return safely(() => {
    const doc = token.document;
    if (!doc?.isOwner || isProp(doc)) return false;   // every player owns a spell-area handle
    return ownerShouldSee({
      enabled: true,
      isGM: false,
      isOwner: true,
      hidden: doc.hidden === true,
      configPreview: token._preview?._previewType === "config",
      filteredOut: token.isFilteredOut === true,
      culled: typeof token._testCulled === "function" ? token._testCulled() === true : false
    });
  }, err => log.warnOnce("owner-sees", "owner override failed", err));
}

/** The wrap's handle (kit wrapMethod): `via` is "libWrapper" | "direct" | null. */
let handle = null;

function patchVisibility() {
  const proto = foundry.canvas.placeables.Token.prototype;
  if (!Object.getOwnPropertyDescriptor(proto, "isVisible")?.get) {
    log.warn("Token#isVisible not found; owners-see-their-own is off");
    return (patchedWith = null);
  }
  handle = wrapMethod(MODULE, {
    target: proto, kind: "getter", name: "isVisible", label: "Token#isVisible",
    path: "foundry.canvas.placeables.Token.prototype.isVisible", type: "WRAPPER",
    marker: "__pentarynCreaturesVisible", adjustments: "creatures-libwrapper",
  }, function (wrapped, ...args) {
    return wrapped(...args) || ownerOverride(this);
  }, { via: libWrapperRoute({ log }), log });
  return (patchedWith = handle.via);
}

function refreshTokenVisibility() {
  if (!canvas?.ready) return;
  for (const t of canvas.tokens.placeables) t.renderFlags.set({ refreshVisibility: true });
}

/** Before the canvas first draws, so the first frame already uses the override. */
function onSetup() {
  ownerSeesOn = setting("ownerSees") !== false;
  patchVisibility();
}

export function install(reg, ctx) {
  log = ctx.log;
  ctx.onSettingChange("ownerSees", (v) => { ownerSeesOn = v !== false; refreshTokenVisibility(); });
  // A hot re-import after `ready` (ctx.late): setup has already fired, so wrap now.
  if (ctx.late) onSetup();
  else reg.once("setup", onSetup, { guard: false, label: "setup: wrap Token#isVisible" });
  ctx.expose({ ownerSees: (token) => ownerOverride(token), patchedWith: () => patchedWith });
}

/** Undo the wrap (hot patch: then re-import the entry to wrap again). */
export function uninstall() {
  handle?.unwrap();
  handle = null;
  patchedWith = null;
}
