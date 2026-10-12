/**
 * A helper token you held is deleted: your own token comes back (feature; setting
 * helperTokenControl, usability Area 5 re-run, S3 and S13).
 */

import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";
import { isAoeHandle } from "../shapes.mjs";

const log = makeLog(MODULE);

/* ── a helper token you held is deleted: your own token comes back ───────── */
// Dragging an area handle selects it; dnd5e selects a summon (Flaming Sphere) you placed. When Apply
// removes the handle, or concentration ends and the summon goes, core releases it and nothing is left
// selected, so Argon closed the HUD and the player had to find their own token again (usability Area 5
// re-run, S3 and S13). The deleteToken hook runs while the token is still selected (core destroys the
// placeable, which releases it, right after); a tick later, if nothing else is selected, we select the
// caster's token: the HUD's token for a handle, the summoner for a summon, else your character.

function ownedTokenOf(actor) {
  if (!actor) return null;
  return (actor.getActiveTokens?.(false, false) ?? []).find(t => t.scene === canvas.scene && t.isOwner && !t.destroyed) ?? null;
}

const onTokenDeleted = (doc) => {
  try {
    if (!setting("helperTokenControl") || doc?.parent !== canvas.scene || !doc.object?.controlled) return;
    const handle = isAoeHandle(doc.flags);
    const origin = doc.actor?.getFlag?.("dnd5e", "summon.origin") ?? null;
    if (!handle && !origin) return;
    const hud = ui.ARGON?._token?.id ?? null;
    setTimeout(() => {
      try {
        if ((canvas.tokens?.controlled ?? []).some(t => !t.destroyed && t.id !== doc.id)) return;
        let back = null;
        if (handle && hud && hud !== doc.id) back = canvas.tokens.get(hud) ?? null;
        if (!back && origin) back = ownedTokenOf(fromUuidSync(origin, { strict: false })?.actor);
        if (!back) back = ownedTokenOf(game.user.character);
        if (back && !back.destroyed && back.isOwner) back.control({ releaseOthers: true });
      } catch (err) { log.warn("helper token control", err); }
    }, 0);
  } catch (err) { log.warn("helper token control", err); }
};

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ label });   // guarded (S11, D-c1): a throw is logged with the label; return values pass through

export function install(reg) {
  reg.on("deleteToken", onTokenDeleted, opts("helper token deleted: reselect your own"));
}

export function uninstall() {}
