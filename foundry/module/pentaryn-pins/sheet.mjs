/**
 * Pentaryn Pins — FEATURE: "Pinned to {player}" on the character sheet.
 *
 * dnd5e 6.0.6's actor sheets are `BaseActorSheet` (ApplicationV2), so one hook name fires once per
 * render. The badge sits in `.window-header`, before its controls: the header survives dnd5e's part
 * re-renders. Shown only while the switch is on, on the pinned actor's sheet and on a wild-shaped
 * form's sheet (matched by root actor). Non-interactive; everyone who can open the sheet sees it.
 */

import { CSS, FLAG_SCOPE, PIN_FLAG, pinnedName } from "./pins-core.mjs";
import { listOf, pinOfUser, rootOfActor } from "./world-adapter.mjs";
import { onPinningChange } from "./settings.mjs";
import { htmlRoot } from "./lib/api.mjs";

const BADGE = `${CSS}pinned`;
let unsubscribe = null;

/**
 * Refresh the badge on every open actor sheet (the switch or a pin changed). Review F2: the badge
 * lives in `.window-header`, which no part render replaces, so it is redrawn in place; a full
 * `app.render()` of every open sheet on every client per pin was a visible hitch for nothing.
 */
function rerenderSheets(ctx) {
  const apps = globalThis.foundry?.applications?.instances;
  if (!apps?.values) return;
  for (const app of apps.values()) {
    if (app?.document?.documentName !== "Actor" || !app.rendered) continue;
    try {
      decorate(app, app.element, ctx);
    } catch (err) {
      ctx.log.warn("sheet: pinned badge", err);
    }
  }
}

function decorate(app, element, ctx) {
  const root = htmlRoot(element) ?? app?.element;
  if (!root?.querySelectorAll) return;
  for (const old of root.querySelectorAll(`.${BADGE}`)) old.remove();
  if (!ctx.setting("pinning")) return;
  const actor = app.actor ?? app.document;
  const users = listOf(game.users).map(u => ({ id: u.id, name: u.name, pin: pinOfUser(u), isGM: !!u.isGM }));
  const name = pinnedName(users, rootOfActor(actor));
  if (!name) return;
  const header = root.querySelector(".window-header");
  if (!header) return;
  const text = _loc("PENTARYN_PINS.Sheet.PinnedTo", { name });
  const badge = document.createElement("span");
  badge.className = BADGE;
  badge.setAttribute("aria-label", text);
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-thumbtack";
  icon.setAttribute("inert", "");
  const label = document.createElement("span");
  label.textContent = text;   // text, never HTML: a player's name cannot inject markup
  badge.append(icon, label);
  // before the controls wherever they sit: insertBefore throws unless they are the header's own child
  const controls = header.querySelector('[data-action="toggleControls"]');
  if (controls) controls.before(badge);
  else header.append(badge);
}

export function install(reg, ctx) {
  reg.on("renderBaseActorSheet", (app, element) => {
    try {
      decorate(app, element, ctx);
    } catch (err) {
      ctx.log.warn("sheet: pinned badge", err);
    }
  }, { guard: false, label: "sheet: pinned badge" });

  // the badge names the user: a pin change, or a pinned user renamed or promoted to GM, re-renders it
  reg.on("updateUser", (user, changes) => {
    const mine = changes?.flags?.[FLAG_SCOPE];
    if (mine && (PIN_FLAG in mine || `-=${PIN_FLAG}` in mine)) return void rerenderSheets(ctx);
    if (pinOfUser(user) && changes && ("name" in changes || "role" in changes)) rerenderSheets(ctx);
  }, { label: "updateUser: sheet badge" });

  reg.on("deleteUser", user => {
    if (pinOfUser(user)) rerenderSheets(ctx);
  }, { label: "deleteUser: sheet badge" });

  unsubscribe = onPinningChange(() => rerenderSheets(ctx));
}

export function uninstall() {
  unsubscribe?.();
  unsubscribe = null;
}
