/**
 * Pentaryn Movement — ghost in combat, the GM's side (feedback nwhjz2, triage I1).
 *
 * GLUE, one feature. The rule itself lives in movement-core (`ghostInCombat`: an incorporeal FEAT,
 * or the actor flag `flags.pentaryn-movement.ghostInCombat`) and the player's side in ghost.mjs
 * (the drag and arrow-key wraps, the button, the auto-clear). This file is how the GM sets the
 * flag: the Token HUD toggle, `setGhost(creature, { combat })` and the read-only `inspect(ref)`.
 *
 * The write is a GM-only actor flag. A token's synthetic actor keeps it on that token (its delta),
 * so flagging a summoned spirit never marks the compendium actor it came from. Players never see
 * the toggle; nothing is relayed, the GM's own client writes.
 */

import * as core from "./movement-core.mjs";
import { CSS, GHOST_COMBAT_FLAG, HUD_KEYS, MODULE } from "./movement-core.mjs";
import { exemptInputs } from "./combat-adapter.mjs";
import { htmlRoot } from "./lib/api.mjs";
import { CODES, errorCode, fail, ok, toFail } from "./lib/errors.mjs";
import { readFlag } from "./lib/flags.mjs";
import { resolveRef } from "./lib/resolve.mjs";

/** The module's kit logger (ctx.log); every line keeps the `pentaryn-movement | ` prefix. */
let log = null;

/**
 * GM: let one creature's owner ghost it during a fight. `ref` is an Actor, a Token, a TokenDocument,
 * a uuid, an id or an exact name (resolved here, so the bridge may pass a string). Returns
 * ok({ uuid, name, ghostInCombat, feat }) or a refusal object; never throws for a bad ref.
 */
async function setGhostInCombat(ref, opts = {}) {
  if (!game.user.isGM) return fail("NOT_GM", "GM only");
  const combat = opts?.combat;
  if (typeof combat !== "boolean") return fail("BAD_ARGS", "opts.combat must be true or false");
  let actor;
  try {
    actor = resolveRef(ref, "actor");
  } catch (err) {
    if (errorCode(err, CODES)) return toFail(err);
    throw err;
  }
  if (!actor) return fail("NOT_FOUND", String(ref));
  const inputs = exemptInputs(actor);
  if (inputs.flag !== combat) {
    try {
      if (combat) await actor.setFlag(MODULE, GHOST_COMBAT_FLAG, true);
      else await actor.unsetFlag(MODULE, GHOST_COMBAT_FLAG);
    } catch (err) {
      log.warn("ghostInCombat write failed", err);
      return fail("INTERNAL", String(err?.message ?? err));
    }
    // A GM writing on a player's creature: the audit line (blueprint §5.1), console only.
    log.info("ghostInCombat", { uuid: actor.uuid, on: combat, by: game.user.id });
  }
  return ok({ uuid: actor.uuid, name: actor.name, ghostInCombat: combat, feat: core.incorporealFeat(inputs.items) });
}

/** The read-only half: what grants (or would grant) ghost in combat for this actor. */
function inspectActor(actor) {
  const inputs = exemptInputs(actor) ?? { items: [], flag: false };
  const feat = core.incorporealFeat(inputs.items);
  return { uuid: actor?.uuid ?? null, name: actor?.name ?? null, flag: inputs.flag, feat, ghostInCombat: inputs.flag || feat !== null };
}

/**
 * The GM's Token HUD toggle (right column): pressed when the creature may ghost during a fight.
 * A click flips the flag; a creature whose feat grants it already is shown pressed and the click
 * changes nothing (the tip says why). Players never see the button; nothing is added twice.
 */
function injectHud(app, element) {
  if (!game.user.isGM) return;
  const doc = app?.object?.document ?? app?.document ?? null;
  const actor = doc?.actor;
  if (!actor) return;
  const root = htmlRoot(element);
  const col = root?.querySelector?.(".col.right") ?? root?.querySelector?.(".right");
  if (!col || col.querySelector(`.${CSS.hud}`)) return;
  const { flag, feat } = inspectActor(actor);
  const tip = feat ? game.i18n.format(HUD_KEYS.feat, { feat }) : game.i18n.localize(flag ? HUD_KEYS.on : HUD_KEYS.off);
  const btn = col.ownerDocument.createElement("button");
  btn.type = "button";
  btn.className = `control-icon ${CSS.hud}${flag || feat ? " active" : ""}`;
  btn.dataset.tooltipText = tip;   // plain text, never data-tooltip (Foundry parses that as HTML)
  btn.setAttribute("aria-label", tip);
  btn.innerHTML = '<i class="fa-solid fa-ghost"></i>';   // constant markup, nothing interpolated
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (feat) return;
    void setGhostInCombat(actor, { combat: !readFlag(actor, MODULE, GHOST_COMBAT_FLAG) })
      .then(r => { if (!r.ok) log.warn("hud toggle refused", r); app.render?.(); }, err => log.warn("hud toggle failed", err));
  });
  col.appendChild(btn);
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

/** Called synchronously from the entry body, after ghost.mjs (so its hooks come after ghost's). */
export function install(reg, ctx) {
  log = ctx.log;
  reg.on("renderTokenHUD", (app, element) => injectHud(app, element), { label: "renderTokenHUD: ghost in combat toggle (GM)" });
  ctx.expose({ setGhostInCombat, inspectActor });
}

/** Nothing of its own to undo: the entry's reg.offAll() removes the hook; the flag stays on the actor. */
export function uninstall() {
  log = null;
}
