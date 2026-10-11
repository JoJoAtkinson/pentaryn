/**
 * Pentaryn NPC Ties — the Token HUD buttons (tie, the GM's inspect preview, inspect) and the GM's
 * Attribute Review scene control (FEATURE).
 *
 * Moved out of the entry (guide S7).
 */

import { MODULE } from "./ties-core.mjs";
import { mayWrite } from "./settings.mjs";
import { inspectorFor } from "./ties-adapter.mjs";
import { openTieDialogFor } from "./tie-dialog.mjs";
import { openPreview } from "./preview.mjs";
import { openLook } from "./look.mjs";
import { AttributeReview } from "./review-ui.mjs";
import { inspect } from "./study.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

/**
 * The Token HUD button — the discoverable half of the pair.
 *
 * The HUD only opens for a token you own or as GM (core's `_canHUD`), so this needs no
 * permission check of its own: if the button is on screen, you were allowed to open it.
 */
function injectTieHUD(app, element) {
  const token = app?.object ?? null;
  // the HUD opens for owners and GMs, but the setting can still have this feature switched
  // off for players — in which case the button must not be there to press
  if (!mayWrite()) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const col = root?.querySelector(".col.left") ?? root?.querySelector(".left");
  if (!col || col.querySelector(".pt-tie-btn")) return;
  if (!token) return;

  const label = game.i18n.localize("PENTARYN_TIES.hud.tie");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon pt-tie-btn";
  btn.dataset.tooltip = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = '<i class="fa-solid fa-people-arrows"></i>';
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    openTieDialogFor(token);
  });
  col.appendChild(btn);

  /*
   * The GM's inspect window: what would an inspection (and every study after it) hand a player,
   * who already knows each fact, and a Share to tell them. Drawn for the GM only, and the window
   * itself refuses to open for anyone else — see preview.mjs. Only its Share/Forget clicks write.
   */
  if (game.user?.isGM && !col.querySelector(".pt-preview-btn")) {
    const pv = document.createElement("button");
    pv.type = "button";
    pv.className = "control-icon pt-preview-btn";
    pv.dataset.tooltip = "Inspect (GM only): player view and simulated rolls";
    pv.setAttribute("aria-label", "Inspect preview");
    pv.innerHTML = '<i class="fa-solid fa-flask"></i>';
    pv.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openPreview(token.actor ?? game.actors.get(token.document.actorId));
    });
    col.appendChild(pv);
  }

  /*
   * Phase 8's inspect control — the route phase 6 never had, and the ONLY thing in this module
   * that starts an identification roll (Joe: *"no examine, no auto detection"*).
   *
   * ⚠ **Uniform for every target.** Same icon, same tooltip, same enabled state whatever the
   * creature carries. A control that looked different next to someone with secrets would answer
   * the question before the dice did — the same reason the stub card is uniform.
   */
  const who = inspectorFor();
  if (who && token.document?.actorId !== who.id) {
    const look = game.i18n.localize("PENTARYN_TIES.known.inspect.button");
    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "control-icon pt-inspect-btn";
    eye.dataset.tooltip = game.i18n.format("PENTARYN_TIES.known.inspect.tip", { name: token.name });
    eye.setAttribute("aria-label", look);
    eye.innerHTML = '<i class="fa-solid fa-eye"></i>';
    eye.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      eye.disabled = true; // one gesture, one cascade — a double-click must not queue two
      const subject = token.actor ?? game.actors.get(token.document.actorId);
      if (!game.user?.isGM) openLook(who, subject); // the player's page opens before the dice
      await inspect(who, subject);
    });
    col.appendChild(eye);
  }
}

/*
 * The Attribute Review button — left toolbar, token tools, beside Argon's combat-hub swords.
 * v14 shape: groups and tools are objects keyed by name; a one-shot button is `button: true` with
 * `onChange` (core's own `tiles.browse` is built the same way). GM only: not added for players.
 */
function addReviewControl(controls) {
  try {
    if (!game.user?.isGM || !controls?.tokens?.tools) return;
    controls.tokens.tools.ptAttrReview = {
      name: "ptAttrReview",
      title: "PENTARYN_TIES.review.control",
      icon: "fa-solid fa-tags",
      button: true,
      order: 60,
      visible: game.user.isGM,
      onChange: () => AttributeReview.open()
    };
  } catch (err) {
    log.warn(`review control skipped`, err);
  }
}

/**
 * FEATURE install — synchronous, from the entry body, in today's order: the review control, then the
 * Token HUD buttons. Both handlers keep their own try/catch (their warning texts are pinned).
 */
export function install(reg) {
  reg.on("getSceneControlButtons", addReviewControl, { label: "review control" });
  reg.on("renderTokenHUD", (app, element) => {
    try {
      injectTieHUD(app, element);
    } catch (err) {
      log.warn(`tie HUD injection skipped`, err);
    }
  }, { label: "tie HUD" });
}

/** The entry's reg.offAll() removes both hooks; nothing else to drop. */
export function uninstall() {}
