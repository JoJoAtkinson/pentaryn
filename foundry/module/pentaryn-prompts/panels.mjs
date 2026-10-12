/**
 * pentaryn-prompts — FEATURE: the open box's side panel (what it sees, door tags) follows walls,
 * doors, notes, lights, tiles and tokens as they change: each change asks PromptDialog to redraw the panels on
 * that scene (debounced there). A token update counts when it moved or changed what a row shows
 * (its name, its image); core renames a linked actor's tokens with a name-only updateToken.
 */

import { PromptDialog } from "./dialog.mjs";

const MOVED = ["x", "y", "elevation", "hidden", "width", "height", "level"];
const SHOWN = ["name", "texture"];   // what a panel row prints besides where the token is
const DOCS = ["createWall", "updateWall", "deleteWall", "createToken", "deleteToken",
  "createNote", "updateNote", "deleteNote", "createAmbientLight", "updateAmbientLight", "deleteAmbientLight",
  "createTile", "updateTile", "deleteTile"];

export function install(reg, ctx) {
  const refreshPanels = doc => {
    try { if (doc?.parent?.id) PromptDialog.refreshPanels(doc.parent.id); } catch (err) { ctx.log.debug("refreshPanels (panel only)", err); }
  };
  for (const h of DOCS) reg.on(h, refreshPanels, { guard: false, label: `${h}: refresh panels` });
  reg.on("updateToken", (doc, changes) => { if ([...MOVED, ...SHOWN].some(k => k in (changes ?? {}))) refreshPanels(doc); },
    { guard: false, label: "updateToken: refresh panels when moved or renamed" });
}

export function uninstall() {}
