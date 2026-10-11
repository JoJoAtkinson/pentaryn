/**
 * pentaryn-prompts — FEATURE: double-clicking a marker opens its box instead of the sheet (GM only).
 *
 * The configured Token class (dnd5e's Token5e today), so a subclass override cannot step around
 * us. libWrapper first (MIXED), a direct wrap when it is absent or refuses; the marker makes a hot
 * re-import a no-op instead of a second wrap. Adjustments row: prompts-token-dblclick.
 */

import { MODULE } from "./prompts-core.mjs";
import { isPromptToken } from "./markers-adapter.mjs";
import { PromptDialog } from "./dialog.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { libWrapperRoute } from "./lib/patch-libwrapper.mjs";

let handle = null;

function intercept(token) {
  if (!game.user?.isGM || !isPromptToken(token.document)) return false;
  PromptDialog.open(token.document);
  return true;
}

function patchDoubleClick(ctx) {
  const proto = (CONFIG.Token.objectClass ?? foundry.canvas.placeables.Token).prototype;
  const viaLW = !!(game.modules.get("lib-wrapper")?.active && globalThis.libWrapper);
  if (!viaLW && typeof proto._onClickLeft2 !== "function") {
    ctx.log.warn("Token#_onClickLeft2 not found; double-click will open the sheet");
    return (handle = null);
  }
  handle = wrapMethod(MODULE, {
    target: proto, name: "_onClickLeft2", label: "Token#_onClickLeft2",
    path: "CONFIG.Token.objectClass.prototype._onClickLeft2", type: "MIXED",
    marker: "__pentarynPromptsClick", adjustments: "prompts-token-dblclick",
  }, function (wrapped, event) {
    if (intercept(this)) return;
    return wrapped(event);
  }, { via: libWrapperRoute({ log: ctx.log }), log: ctx.log });
  return handle;
}

export function install(reg, ctx) {
  // "libWrapper" | "direct" | null — what status().doubleClick reports
  ctx.expose({ doubleClick: () => handle?.via ?? null });
  reg.once("setup", () => patchDoubleClick(ctx), { guard: false, label: "setup: double-click opens the box" });
}

export function uninstall() {
  handle?.unwrap();
  handle = null;
}
