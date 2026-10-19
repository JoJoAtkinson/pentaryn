/**
 * Pentaryn Senses — UI for the Light cantrip and lit items: the "Where does the light go?" prompt,
 * the map pick, the spell card's buttons, the inventory row's flame (and hood), and End light on
 * the Token HUD. DOM only: every action is light.mjs's, handed in by its install() through
 * bindActions() (a UI file never imports a feature).
 */

import { MODULE, profileFor, isLit, isHooded, isLightSpellData, lightingItemId, readSpellLight, esc, setTip, rootOf, hudColumn, hudButton } from "./senses-core.mjs";
import { realItem, itemFrom } from "./light-adapter.mjs";
import { collapseArgonPanels } from "./argon.mjs";
import { isActiveGM } from "./lib/election.mjs";
import { makeLog } from "./lib/log.mjs";

const PICK_TIMEOUT_MS = 60_000;

const local = { picking: null };

/** light.mjs's actions: { end, onMe, pickAndCast, toggle, hood, run }. */
let actions = null;

/** Called by light.mjs's install(). */
export function bindActions(a) {
  actions = a;
}

const log = makeLog(MODULE);   // the kit log (senses-R6)
const warn = (label, err) => log.warn(`light ${label}`, err);

/**
 * The Light actions, once, for both the prompt's buttons (`dialog`) and the spell card's action row
 * (`card`): same labels, same icons, same order. `handler` names light.mjs's action (null: Not now).
 */
export const LIGHT_ACTIONS = Object.freeze([
  Object.freeze({ action: "me", icon: "fa-solid fa-user", label: "PENTARYN_SENSES.Light.OnMe", handler: "onMe", dialog: true, card: true }),
  Object.freeze({ action: "pick", icon: "fa-solid fa-crosshairs", label: "PENTARYN_SENSES.Light.Pick", handler: "pickAndCast", dialog: true, card: true }),
  Object.freeze({ action: "end", icon: "fa-solid fa-lightbulb-slash", label: "PENTARYN_SENSES.Light.End", handler: "end", card: true }),
  Object.freeze({ action: "cancel", icon: "fa-solid fa-xmark", label: "PENTARYN_SENSES.Light.NotNow", handler: null, dialog: true })
]);
const lightAction = act => LIGHT_ACTIONS.find(a => a.action === act);

/** The "Where does the light go?" prompt, right after the cast. */
export async function prompt(item) {
  item = realItem(item);
  if (!item?.isOwner) return;
  const DialogV2 = foundry.applications.api.DialogV2;
  const choice = await DialogV2.wait({
    window: { title: _loc("PENTARYN_SENSES.Light.Title"), icon: "fa-solid fa-lightbulb" },
    content: `<p>${esc(_loc("PENTARYN_SENSES.Light.Where"))}</p>`,
    buttons: LIGHT_ACTIONS.filter(a => a.dialog).map((a, i) => ({
      action: a.action, label: _loc(a.label), icon: a.icon, ...(i === 0 ? { default: true } : {})
    })),
    rejectClose: false
  });
  const handler = lightAction(choice)?.handler;
  if (handler) return actions[handler](item);
}

/* -------------------------------------------- */
/*  The picker                                  */
/* -------------------------------------------- */

/**
 * The top-most token a player can see under a canvas point, else that square's centre.
 * A pentaryn-aoe area handle is not a creature (it sits at every area's centre and dies with the
 * area): clicking it lights the square.
 */
function hitAt(p) {
  const hits = (canvas.tokens?.placeables ?? []).filter(t => t.visible && t.bounds?.contains(p.x, p.y)
    && !t.document?.flags?.["pentaryn-aoe"]?.handle);
  hits.sort((a, b) => ((a.document.elevation ?? 0) - (b.document.elevation ?? 0)) || ((a.document.sort ?? 0) - (b.document.sort ?? 0)));
  const top = hits.at(-1);
  if (top) return { scene: canvas.scene.id, token: top.document.id };
  const c = canvas.grid?.getCenterPoint?.(p) ?? p;
  return { scene: canvas.scene.id, x: Math.round(c.x), y: Math.round(c.y) };
}

/**
 * Click a token or a square. → {scene, token} | {scene, x, y} | null (right-click, Esc, 60 s, or the
 * scene changing). Listens in the capture phase on window so the token layer never sees the click.
 */
export function pick() {
  if (!canvas?.ready || !canvas.scene) {
    ui.notifications.warn(_loc("PENTARYN_SENSES.Light.NoScene"));
    return Promise.resolve(null);
  }
  local.picking?.cancel();
  collapseArgonPanels();   // an open Combat HUD panel covers the map (argon.mjs)
  const view = canvas.app?.view ?? canvas.app?.canvas;
  return new Promise(resolve => {
    let done = false;
    const swallow = ev => { if (ev.target === view) { ev.stopImmediatePropagation(); ev.preventDefault(); } };
    const swallowOnce = (type) => {
      const fn = ev => { swallow(ev); window.removeEventListener(type, fn, true); };
      window.addEventListener(type, fn, true);
      setTimeout(() => window.removeEventListener(type, fn, true), 800);
    };
    const finish = (result) => {
      if (done) return;
      done = true;
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      view?.classList.remove("ps-picking");
      document.body.classList.remove("ps-picking");
      clearTimeout(timer);
      try {
        if (note) (note.remove ? note.remove() : ui.notifications.remove(note));
      } catch (e) {
        warn("pick note", e);
      }
      if (local.picking === handle) local.picking = null;
      resolve(result);
    };
    const onDown = ev => {
      if (ev.target !== view) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      swallowOnce("pointerup");
      if (ev.button === 2) {
        swallowOnce("contextmenu");
        return finish(null);
      }
      if (ev.button !== 0) return;
      try {
        finish(hitAt(canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY })));
      } catch (e) {
        warn("pick", e);
        finish(null);
      }
    };
    const onKey = ev => {
      if (ev.key !== "Escape") return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      finish(null);
    };
    const handle = { cancel: () => finish(null) };
    local.picking = handle;
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    view?.classList.add("ps-picking");
    document.body.classList.add("ps-picking");
    const note = ui.notifications.info(_loc("PENTARYN_SENSES.Light.PickHint"), { permanent: true });
    const timer = setTimeout(() => finish(null), PICK_TIMEOUT_MS);
  });
}

/* -------------------------------------------- */
/*  The spell card                              */
/* -------------------------------------------- */

/** An action-row entry shaped like dnd5e 6's own (templates/chat/parts/card-buttons.hbs). */
function cardButton(icon, label, act) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon";
  b.dataset.psLight = act;
  setTip(b, label);
  b.innerHTML = `<i class="${icon}" inert></i>`;
  li.append(b);
  return li;
}

/** The card's action row (`section.icon-row` holding a plain `ul.unlist`, not the pill rows). */
function actionList(root) {
  for (const ul of root.querySelectorAll("section.icon-row > ul.unlist")) {
    if (!ul.classList.contains("pills")) return ul;
  }
  return null;
}

export function decorateCard(message, html) {
  if (!message || message.type !== "usage") return;
  const uuid = message.system?.item?.uuid;
  if (!uuid) return;
  const item = itemFrom(uuid);
  if (!isLightSpellData(item)) return;
  const root = rootOf(html);
  if (!root) return;
  // The PHB Light's summon button (not groupable, so it keeps data-action): drop it with its <li>.
  root.querySelectorAll('[data-action="placeSummons"]').forEach(b => (b.closest("li") ?? b).remove());
  let list = actionList(root);
  if (list && !list.children.length) {
    list.closest("section.icon-row")?.remove();
    list = null;
  }
  if (!item.isOwner) return;
  if (!list) {
    const content = root.querySelector(".chat-card") ?? root.querySelector(".message-content");
    if (!content) return;
    const section = document.createElement("section");
    section.className = "icon-row";
    const lead = document.createElement("i");
    lead.className = "fa-solid fa-fw fa-circle-play";
    lead.setAttribute("aria-label", _loc("DND5E.CHATMESSAGE.Row.Actions"));
    list = document.createElement("ul");
    list.className = "unlist";
    section.append(lead, list);
    content.append(section);
  }
  if (list.querySelector("[data-ps-light]")) return;
  const row = LIGHT_ACTIONS.filter(a => a.card).map(a => cardButton(a.icon, _loc(a.label), a.action));
  for (const li of row) {
    const b = li.firstElementChild;
    b.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const live = itemFrom(uuid);
      if (!live) return;
      const act = b.dataset.psLight;
      const p = actions[lightAction(act).handler](live);
      Promise.resolve(p).catch(e => warn(`card ${act}`, e));
    });
    list.append(li);
  }
}

/* -------------------------------------------- */
/*  Inventory row: flame (and hood)             */
/* -------------------------------------------- */

function rowButton(cls, icon, tip, disabled, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `unbutton config-button item-control ${cls}`;
  setTip(b, tip);
  b.innerHTML = `<i class="${icon}" inert></i>`;
  if (disabled) b.setAttribute("aria-disabled", "true");
  b.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (disabled) return;
    Promise.resolve(onClick()).catch(e => warn("row button", e));
  });
  return b;
}

export function decorateSheet(app, element) {
  const actor = app?.actor ?? app?.document;
  const root = rootOf(element);
  if (!actor?.items || !root) return;
  // With two lights lit only the strongest shows on the token; the other flame is drawn dimmer and
  // says so (usability Area 8, L5: torch + hooded lantern, the hood seemed to do nothing).
  const lighting = lightingItemId(actor.items);
  for (const li of root.querySelectorAll("li[data-item-id]")) {
    const item = actor.items.get(li.dataset.itemId);
    if (!item || !profileFor(item)) continue;
    const row = li.querySelector(":scope > .item-row") ?? li;
    const name = row.querySelector(":scope > .item-name");
    if (!name || row.querySelector(":scope > .ps-light-controls")) continue;
    const lit = isLit(item);
    const locked = !item.isOwner;
    const cell = document.createElement("div");
    cell.className = "ps-light-controls";
    const winner = lit && lighting && lighting !== item.id ? actor.items.get(lighting) : null;
    const tip = winner ? _loc("PENTARYN_SENSES.Light.Outshone", { item: winner.name })
      : _loc(lit ? "PENTARYN_SENSES.Light.Douse" : "PENTARYN_SENSES.Light.LightIt");
    cell.append(rowButton(`ps-light-toggle${lit ? " lit" : ""}${winner ? " outshone" : ""}`, "fa-solid fa-fire",
      tip, locked, () => actions.toggle(item)));
    if (lit && profileFor(item)?.hooded) {
      const hooded = isHooded(item);
      cell.append(rowButton(`ps-light-hood${hooded ? " hooded" : ""}`, hooded ? "fa-solid fa-eye" : "fa-solid fa-eye-slash",
        _loc(hooded ? "PENTARYN_SENSES.Light.HoodRaise" : "PENTARYN_SENSES.Light.HoodLower"), locked, () => actions.hood(item)));
    }
    name.after(cell);
  }
}

/* -------------------------------------------- */
/*  Token HUD: End light                        */
/* -------------------------------------------- */

export function injectHUD(app, element) {
  const doc = app?.object?.document ?? app?.document ?? null;
  const sl = readSpellLight(doc);
  if (!sl) return;
  const item = itemFrom(sl.source);
  // [declared senses-ac-2] only a viewer who can act sees it: the item's owner, or the active GM
  // (only its reconcile puts an orphan out; another GM's click would do nothing)
  if (!item?.isOwner && !isActiveGM()) return;
  const col = hudColumn(element, "ps-light-end");
  if (!col) return;
  hudButton(col, {
    cls: "ps-light-end", icon: "fa-solid fa-lightbulb-slash", tip: _loc("PENTARYN_SENSES.Light.End"),
    onClick: async () => {
      if (item?.isOwner) await actions.end(item);
      else if (isActiveGM()) actions.run(sl.source); // the item is gone: put the orphan out
      app.render?.();
    },
    onError: e => warn("hud click", e),
  });
}

/** Cancel a pick in progress (canvas teardown, uninstall). */
export function cancelPick() {
  local.picking?.cancel();
}
