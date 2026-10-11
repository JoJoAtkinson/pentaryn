/**
 * pentaryn-prompts — FEATURE: the hover tip's wiring. Hovering a marker shows its tip (tip-ui.mjs);
 * unhover, a pan, a teardown, the box rendering where the tip sits, or the token's deletion hide it.
 * The deleteToken handler also closes a box whose marker is gone (a replace, a delete elsewhere).
 */

import { isPromptToken } from "./markers-adapter.mjs";
import { PromptDialog } from "./dialog.mjs";
import { hideTip, showTip, tipFor } from "./tip-ui.mjs";

// hot: hoverToken fires per hover; the sight count is deferred a tick (seesCount builds the scene
// model — prompts-lookup-7/-8 are the cache work)
function onHoverToken(token, hovered) {
  if (!game.user?.isGM) return;
  if (!hovered || !isPromptToken(token.document)) { if (!hovered && tipFor() === token.id) hideTip(); return; }
  if (PromptDialog.current?.edits(token.document)) return;   // its text is already on screen, in the box
  showTip(token);
}

function onDeleteToken(doc) {
  if (tipFor() === doc.id) hideTip();
  PromptDialog.onTokenDeleted(doc);   // a replace or a delete elsewhere: close instead of typing into nothing
}

export function install(reg) {
  reg.on("hoverToken", onHoverToken, { guard: false, label: "hoverToken: marker tip" });
  reg.on("canvasPan", hideTip, { guard: false, label: "canvasPan: hide tip" });
  reg.on("renderPromptDialog", hideTip, { guard: false, label: "renderPromptDialog: hide tip" });   // the tip sits where the box opens
  reg.on("canvasTearDown", hideTip, { guard: false, label: "canvasTearDown: hide tip" });
  reg.on("deleteToken", onDeleteToken, { guard: false, label: "deleteToken: hide tip, close its box" });
}

export function uninstall() {
  hideTip();
}
