/**
 * Pentaryn Creatures — FEATURE: owners always see their own tokens. A token you own stays drawn on
 * your screen even when nothing you control can see it (an Invisible Arcane Eye in the dark). A
 * per-client override of Token#isVisible that only ever adds tokens the user owns, never GM-hidden
 * ones; core's ownerShouldSee decides.
 *
 * The wrap: libWrapper (WRAPPER on the dotted path) when lib-wrapper is active, else the getter is
 * replaced on the prototype. It reads three private core fields (`_preview._previewType`,
 * `isFilteredOut`, `_testCulled`) — adjustments row `creatures-libwrapper`.
 */

import { MODULE, ownerShouldSee } from "./creatures-core.mjs";
import { setting } from "./settings.mjs";
import { isProp } from "./tokens-adapter.mjs";

let log = null;
let ownerSeesOn = true;
let patchedWith = null;

/** Called only when core said "not visible". */
export function ownerOverride(token) {
  if (!ownerSeesOn || game.user.isGM) return false;
  try {
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
  } catch {
    return false;
  }
}

function patchVisibility() {
  const path = "foundry.canvas.placeables.Token.prototype.isVisible";
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    try {
      globalThis.libWrapper.register(MODULE, path, function (wrapped, ...args) {
        return wrapped(...args) || ownerOverride(this);
      }, "WRAPPER");
      return (patchedWith = "libWrapper");
    } catch (err) {
      log.warn("libWrapper registration failed, patching directly", err);
    }
  }
  const proto = foundry.canvas.placeables.Token.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "isVisible");
  if (!desc?.get) {
    log.warn("Token#isVisible not found; owners-see-their-own is off");
    return (patchedWith = null);
  }
  Object.defineProperty(proto, "isVisible", {
    ...desc,
    get() { return desc.get.call(this) || ownerOverride(this); }
  });
  return (patchedWith = "direct");
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
  reg.once("setup", onSetup, { guard: false, label: "setup: wrap Token#isVisible" });
  ctx.expose({ ownerSees: (token) => ownerOverride(token), patchedWith: () => patchedWith });
}

/** Turn the override off for this client (the getter patch stays until a reload). */
export function uninstall() {
  ownerSeesOn = false;
}
