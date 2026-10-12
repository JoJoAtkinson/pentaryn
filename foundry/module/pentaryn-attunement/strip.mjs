/**
 * Pentaryn Attunement Slots — UI: the sidebar strip and the inventory counter's over-cap state.
 * DOM only; the slot reconciliation is the core's computeSlots. sheet.mjs mounts and wires it.
 */

import { AWAY, awayOf, computeSlots, shortName } from "./attunement-core.mjs";

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

/**
 * Attach dnd5e's own rich item tooltip. The system resolves `.loading[data-uuid]`
 * through a MutationObserver and swaps in the real card, so this is the entire
 * integration — no template of ours, no dependency.
 *
 * It has to be done by hand because `PrimarySheetMixin._onRender` runs its
 * `.item-tooltip` sweep *before* the render hooks fire, so injected nodes miss it.
 *
 * @param {HTMLElement} el
 * @param {Item} item
 */
export function applyTooltip(el, item) {
  el.dataset.tooltip = `
    <section class="loading" data-uuid="${item.uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>
  `;
  el.dataset.tooltipClass = "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light";
  el.dataset.tooltipDirection = "RIGHT";
}

/**
 * Build one slot.
 * @param {Actor} actor
 * @param {string|null} itemId
 * @param {number} index
 * @param {boolean} overflow  This slot sits past `attunement.max`.
 * @param {boolean} editable
 * @param {Map<string, object>} [awayByKey]  the actor's away entries by key (built once per strip)
 * @returns {HTMLElement}
 */
export function buildSlot(actor, itemId, index, overflow, editable, awayByKey) {
  const li = document.createElement("li");
  li.className = "attunement-slot";
  li.dataset.slot = String(index);

  if (itemId?.startsWith?.(AWAY)) return buildAwaySlot(actor, itemId.slice(AWAY.length), index, overflow, editable, li, awayByKey);

  const item = itemId ? actor.items.get(itemId) : null;

  if (!item) {
    li.classList.add("empty");
    li.innerHTML = `<div class="ghost" aria-hidden="true"><i class="fa-solid fa-sun"></i></div>`;
    li.dataset.tooltip = game.i18n.localize("DND5E.Attunement");
    li.dataset.tooltipDirection = "RIGHT";
    return li;
  }

  const suppressed = item.areEffectsSuppressed;
  if (suppressed) li.classList.add("suppressed");
  if (overflow) li.classList.add("overflow");
  li.dataset.itemId = item.id;

  const fig = document.createElement("figure");
  const img = document.createElement("img");
  img.className = "gold-icon";
  img.src = item.img;
  img.alt = item.name;
  fig.append(img);

  if (suppressed) {
    const badge = document.createElement("i");
    badge.className = "fa-solid fa-ban suppressed-badge";
    badge.setAttribute("inert", "");
    fig.append(badge);
  }

  if (editable) {
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "deletion-control unbutton";
    rm.dataset.action = "unattune";
    rm.setAttribute("aria-label", game.i18n.localize("DND5E.ContextMenuActionUnattune"));
    rm.innerHTML = `<i class="fas fa-circle-xmark" inert></i>`;
    fig.append(rm);
  }

  li.append(fig);
  applyTooltip(li, item);

  // The tooltip carries the item's own card; the suppression state is ours to
  // explain, so it goes on the icon's aria-label rather than being lost.
  // dnd5e 6 moved the hint: DND5E.EffectUnavailableInfo → DND5E.EFFECT.Suppressed.Hint.
  li.setAttribute("aria-label", suppressed
    ? `${item.name} — ${game.i18n.localize("DND5E.AttunementAttuned")}, ${game.i18n.localize("DND5E.EFFECT.Suppressed.Hint")}`
    : `${item.name} — ${game.i18n.localize("DND5E.AttunementAttuned")}`);

  return li;
}

/**
 * A slot held by an attuned item that is not on the actor. Greyed, with a
 * broken-chain badge, and a plain tooltip that names it and says why it is
 * dormant — deliberately not where it is: players read this sheet.
 */
export function buildAwaySlot(actor, key, index, overflow, editable, li, awayByKey = awayIndex(actor)) {
  const entry = awayByKey.get(key);
  li.classList.add("away");
  if (overflow) li.classList.add("overflow");
  li.dataset.awayKey = key;

  const fig = document.createElement("figure");
  const img = document.createElement("img");
  img.src = entry?.img ?? "icons/svg/item-bag.svg";
  img.alt = entry?.name ?? "";
  fig.append(img);
  const badge = document.createElement("i");
  badge.className = "fa-solid fa-link-slash away-badge";
  badge.setAttribute("inert", "");
  fig.append(badge);
  if (editable) {
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "deletion-control unbutton";
    rm.dataset.action = "release";
    rm.setAttribute("aria-label", _loc("PENTARYN_ATTUNEMENT.Release"));
    rm.innerHTML = `<i class="fas fa-circle-xmark" inert></i>`;
    fig.append(rm);
  }
  li.append(fig);

  const name = foundry.utils.escapeHTML(entry?.name ?? "");
  const short = shortName(actor.name);
  const body = _loc("PENTARYN_ATTUNEMENT.AwayBody", { actor: foundry.utils.escapeHTML(short) });
  li.dataset.tooltip = `<div class="pentaryn-attunement-away-tip"><strong>${name}</strong><p>${body}</p></div>`;
  li.dataset.tooltipDirection = "RIGHT";
  const rawBody = _loc("PENTARYN_ATTUNEMENT.AwayBody", { actor: short });
  li.setAttribute("aria-label", `${entry?.name ?? ""} — ${rawBody}`);
  return li;
}

/**
 * The actor's away entries by key; the first entry wins for a repeated key, as a `find` would.
 * @param {Actor} actor
 * @returns {Map<string, object>}
 */
export function awayIndex(actor) {
  const byKey = new Map();
  for (const a of awayOf(actor)) if (!byKey.has(a.key)) byKey.set(a.key, a);
  return byKey;
}

/**
 * Build the whole strip.
 * @param {Actor} actor
 * @param {boolean} editable
 * @param {ReturnType<computeSlots>} [state]  the render's one computeSlots result (items-journal-13)
 * @returns {HTMLElement}
 */
export function buildStrip(actor, editable, state = computeSlots(actor)) {
  const { slots, max, value, over } = state;
  const awayByKey = awayIndex(actor);

  const root = document.createElement("div");
  root.className = "pentaryn-attunement";
  if (over) root.classList.add("over-cap");

  const h3 = document.createElement("h3");
  h3.className = "icon";
  h3.innerHTML = `
    <i class="fas fa-sun" inert></i>
    <span class="roboto-upper">${game.i18n.localize("DND5E.Attuned")}</span>
    <span class="count"><span class="value">${value}</span><span class="separator">&sol;</span><span class="max">${max}</span></span>
  `;
  root.append(h3);

  const ul = document.createElement("ul");
  ul.className = "unlist slots";
  slots.forEach((id, i) => ul.append(buildSlot(actor, id, i, i >= max, editable, awayByKey)));
  root.append(ul);

  if (over) {
    const note = document.createElement("p");
    note.className = "over-cap-note roboto-upper";
    note.textContent = _loc("PENTARYN_ATTUNEMENT.OverBy", { n: value - max });
    root.append(note);
  }

  return root;
}

/**
 * Colour the system's own `☀ value / max` widget when over cap, so the fallback
 * signal is not silent for anyone running with the sidebar collapsed — or on an
 * NPC sheet, which does not get the strip.
 * @param {Actor} actor
 * @param {HTMLElement} root
 * @param {ReturnType<computeSlots>} [state]  the render's one computeSlots result (items-journal-13)
 */
export function decorateCounter(actor, root, state) {
  const el = root.querySelector('[data-application-part="inventory"] .attunement');
  if (!el) return;
  const { over } = state ?? computeSlots(actor);
  el.classList.toggle("pentaryn-attunement-over-cap", over);
}

/**
 * Build the strip and put it under the sidebar's character card (the injection half of the old
 * injectStrip). `wire(strip, actor, editable)` binds the listeners before the strip is inserted.
 * Limited sheets render header + biography only: no card, nothing mounted.
 * @param {ActorSheet} app
 * @param {HTMLElement} root
 * @param {(strip: HTMLElement, actor: Actor, editable: boolean) => void} wire
 * @param {ReturnType<computeSlots>} [state]  the render's one computeSlots result (items-journal-13)
 * @returns {HTMLElement|null}  the strip, or null when there is no card
 */
export function mountStrip(app, root, wire, state) {
  const actor = app.actor;
  const sidebar = root.querySelector(".sidebar");
  const card = sidebar?.querySelector(":scope > .card");
  if (!card) return null;

  // ApplicationV2 rebuilds this subtree on every render, so in practice the old
  // node is already gone. Removing first anyway keeps a future partial render
  // from stacking duplicates — the failure mode the system's own
  // _renderAttunement still has.
  sidebar.querySelectorAll(":scope > .pentaryn-attunement").forEach(n => n.remove());

  const editable = app.isEditable && actor.isOwner;
  const strip = buildStrip(actor, editable, state ?? computeSlots(actor));
  wire(strip, actor, editable);
  card.after(strip);
  return strip;
}
