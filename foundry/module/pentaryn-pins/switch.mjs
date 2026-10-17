/**
 * Pentaryn Pins — FEATURE: switching pinning ON audits the pins, on the GM client that switched it.
 *
 * Core runs a world setting's onChange on every client as `(value, options, userId)`. Only the GM
 * client whose user made the change (`userId === game.user.id`) audits, toasts once and fires
 * `pentaryn-pins.audited`; the other GM tab (the bot or Joe's browser) stays quiet. A bridge caller
 * reads the same result from `pins.audit()`. Nothing is deleted. That same GM client then pulls
 * every online pinned player to their token's scene and level (core's Scene#pullUsers,
 * `{ level, controlledTokens }`; rebuild plan §4.3), even one the GM sees there already (that view
 * lags a draw in progress; a pull to what is drawn draws nothing): no player-side code moves them.
 */

import { auditWorld, pinnedUsers, pullToPin } from "./world-adapter.mjs";
import { onPinningChange } from "./settings.mjs";

/** Literal keys (the i18n gate proves each one). */
const AUDIT_TEXT = Object.freeze({
  GM_USER: "PENTARYN_PINS.Audit.GmUser",
  NO_ACTOR: "PENTARYN_PINS.Audit.NoActor",
  SHARED_ACTOR: "PENTARYN_PINS.Audit.SharedActor",
  NO_TOKEN: "PENTARYN_PINS.Audit.NoToken",
  MANY_TOKENS: "PENTARYN_PINS.Audit.ManyTokens",
  UNLINKED: "PENTARYN_PINS.Audit.Unlinked",
  NOT_OWNER: "PENTARYN_PINS.Audit.NotOwner",
});

let unsubscribe = null;

/** One line per violation, localised. */
export function auditLines(result) {
  return result.violations.map(v => _loc(AUDIT_TEXT[v.code] ?? "PENTARYN_PINS.Audit.NoToken", {
    user: v.user?.name ?? v.user?.id ?? "?",
    actor: v.actor?.name ?? v.actor?.id ?? "?",
    detail: v.detail ?? "",
  }));
}

/** Pull each online pinned player (not a GM) to their token; pullToPin logs a failure, never throws. */
function pullPinned(ctx) {
  for (const { user } of pinnedUsers()) {
    if (!user.isGM && user.active) pullToPin(user, ctx.log);
  }
}

export function install(reg, ctx) {
  unsubscribe = onPinningChange((value, _options, userId) => {
    if (!value || !game.user?.isGM || userId !== game.user.id) return;
    const result = { enabled: true, ...auditWorld() };
    const lines = auditLines(result);
    if (!lines.length) ctx.log.notify("info", _loc("PENTARYN_PINS.Notify.AuditOk", { n: result.pins }));
    else ctx.log.notify("warn", _loc("PENTARYN_PINS.Notify.AuditProblems", { k: lines.length, list: lines.join(" · ") }));
    ctx.emit("audited", result);
    pullPinned(ctx);
  });
}

export function uninstall() {
  unsubscribe?.();
  unsubscribe = null;
}
