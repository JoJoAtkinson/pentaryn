/**
 * pentaryn-prompts — FEATURE: where type-ahead text no box claimed goes. Into the open box if
 * there is one (PromptDialog.takeOrphan), else a localised toast. The capture itself is
 * typeahead-adapter.mjs (the window listeners) over typeahead-core.mjs (the state machine).
 */

import { setOrphanSink } from "./typeahead-adapter.mjs";
import { PromptDialog } from "./dialog.mjs";

/** The orphan toast: the words typed before a box opened that no box took. */
function orphanToast(text) {
  ui.notifications?.warn(_loc("PENTARYN_PROMPTS.typeahead.orphan", { text: text.trim().slice(0, 120) }));
  return true;
}

export function install() {
  setOrphanSink(text => PromptDialog.takeOrphan(text) || orphanToast(text));
}

export function uninstall() {
  setOrphanSink(null);
}
