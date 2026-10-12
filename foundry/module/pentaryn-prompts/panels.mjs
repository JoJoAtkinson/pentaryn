/**
 * pentaryn-prompts — FEATURE: the open box's side panel (what it sees, door tags) follows walls,
 * doors, notes and tokens as they change: each change asks PromptDialog to redraw the panels on
 * that scene (debounced there). A token update counts only when it moved.
 */

import { PromptDialog } from "./dialog.mjs";

const MOVED = ["x", "y", "elevation", "hidden", "width", "height", "level"];
const DOCS = ["createWall", "updateWall", "deleteWall", "createToken", "deleteToken", "createNote", "deleteNote"];

export function install(reg, ctx) {
  const refreshPanels = doc => {
    try { if (doc?.parent?.id) PromptDialog.refreshPanels(doc.parent.id); } catch (err) { ctx.log.debug("refreshPanels (panel only)", err); }
  };
  for (const h of DOCS) reg.on(h, refreshPanels, { guard: false, label: `${h}: refresh panels` });
  reg.on("updateToken", (doc, changes) => { if (MOVED.some(k => k in (changes ?? {}))) refreshPanels(doc); },
    { guard: false, label: "updateToken: refresh panels when moved" });
}

export function uninstall() {}
