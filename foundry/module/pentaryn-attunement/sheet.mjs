/**
 * Pentaryn Attunement Slots — FEATURE: the character sheet. On every renderBaseActorSheet it
 * decorates the inventory counter and (characters only) mounts the slot strip, whose listeners
 * attune into a slot, unattune, release an away bond (after a confirm) and accept drops.
 *
 * Listeners live on the strip itself, so `stopPropagation` keeps drops away from the sheet's sort
 * handler without patching anything.
 */

import { AWAY, MODULE, awayOf, computeSlots, safe, t } from "./attunement-core.mjs";
import { releaseAway, writeSlots } from "./actor-adapter.mjs";
import { decorateCounter, mountStrip } from "./strip.mjs";

/* -------------------------------------------- */
/*  Interaction                                 */
/* -------------------------------------------- */

/**
 * Attune `item` into slot `index`, replacing whatever is there.
 * @param {Actor} actor
 * @param {Item} item
 * @param {number} index
 */
async function attuneToSlot(actor, item, index) {
  const { slots } = computeSlots(actor);
  const occupant = slots[index] ?? null;
  if (occupant === item.id) return;
  if (occupant?.startsWith(AWAY)) {
    const name = awayOf(actor).find(a => AWAY + a.key === occupant)?.name ?? "";
    ui.notifications.warn(t("SlotHeld", { name }));
    return;
  }

  const updates = [];
  if (occupant) updates.push({ _id: occupant, "system.attuned": false });
  if (!item.system.attuned) updates.push({ _id: item.id, "system.attuned": true });

  // Vacate whatever slot this item used to hold, then claim the target.
  const next = slots.map(id => (id === item.id) ? null : id);
  while (next.length <= index) next.push(null);
  next[index] = item.id;

  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  await writeSlots(actor, next);
}

/**
 * Unattune the occupant of a slot, leaving the slot itself in place so its
 * neighbours do not move. That stability is the whole point of storing order.
 * @param {Actor} actor
 * @param {string} itemId
 */
async function unattune(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return;
  await item.update({ "system.attuned": false });
}

/**
 * Ending attunement to something you are not holding is permanent in a way the
 * ordinary ✕ is not — the item will come back unattuned — so it asks first.
 */
async function confirmRelease(actor, key) {
  const entry = awayOf(actor).find(a => a.key === key);
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("Release") },
    content: `<p>${t("ReleaseConfirm", { name: foundry.utils.escapeHTML(entry?.name ?? "") })}</p>`
  });
  if (ok) return releaseAway(actor, key);
}

/**
 * @param {DragEvent} event
 * @param {Actor} actor
 */
async function onDrop(event, actor) {
  const slotEl = event.target.closest?.(".attunement-slot");
  if (!slotEl) return;

  // Must stop here. Left to bubble, the sheet's own _onDrop treats a same-actor
  // item drop as an inventory *sort* and would silently reorder the pack.
  event.preventDefault();
  event.stopPropagation();
  slotEl.classList.remove("dragover");

  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (data?.type !== "Item") return;

  const item = await Item.implementation.fromDropData(data);
  if (!item) return;

  if (item.parent?.uuid !== actor.uuid) {
    ui.notifications.warn(t("NotOnActor"));
    return;
  }
  if (!item.system?.attunement) {
    ui.notifications.warn(t("NotAttunable", { name: item.name }));
    return;
  }

  return attuneToSlot(actor, item, Number(slotEl.dataset.slot));
}

/** The listeners' async actions, logged with a label when they fail (items-journal-11). */
const releaseSafe = safe("release", confirmRelease);
const unattuneSafe = safe("unattune", unattune);
const dropSafe = safe("drop", onDrop);

/**
 * Wire the strip up. Listeners live on the strip itself, so `stopPropagation`
 * keeps drops away from the sheet's sort handler without patching anything.
 * @param {HTMLElement} strip
 * @param {Actor} actor
 * @param {boolean} editable
 */
function activate(strip, actor, editable) {
  strip.addEventListener("click", event => {
    const slotEl = event.target.closest(".attunement-slot");
    if (slotEl?.dataset.awayKey && event.target.closest('[data-action="release"]')) {
      event.preventDefault();
      event.stopPropagation();
      return releaseSafe(actor, slotEl.dataset.awayKey);
    }
    if (!slotEl?.dataset.itemId) return;
    if (event.target.closest('[data-action="unattune"]')) {
      event.preventDefault();
      event.stopPropagation();
      return unattuneSafe(actor, slotEl.dataset.itemId);
    }
    actor.items.get(slotEl.dataset.itemId)?.sheet?.render(true);
  });

  strip.addEventListener("contextmenu", event => {
    const slotEl = event.target.closest(".attunement-slot");
    if (slotEl?.dataset.awayKey && editable) {
      event.preventDefault();
      event.stopPropagation();
      return releaseSafe(actor, slotEl.dataset.awayKey);
    }
    if (!slotEl?.dataset.itemId || !editable) return;
    event.preventDefault();
    event.stopPropagation();
    return unattuneSafe(actor, slotEl.dataset.itemId);
  });

  if (!editable) return;

  strip.addEventListener("dragover", event => {
    const slotEl = event.target.closest(".attunement-slot");
    if (!slotEl) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "link";
    slotEl.classList.add("dragover");
  });

  strip.addEventListener("dragleave", event => {
    event.target.closest(".attunement-slot")?.classList.remove("dragover");
  });

  strip.addEventListener("drop", event => dropSafe(event, actor));
}

/**
 * One hook for both sheets. `renderBaseActorSheet` fires for every subclass,
 * because Foundry walks the inheritance chain dispatching render<ClassName>.
 */
function onRenderSheet(app, element) {
  const actor = app?.actor;
  // Vehicles and groups inherit the same base and have no attunement schema.
  if (!actor?.system?.attributes?.attunement) return;
  try {
    // One reconciliation per render, shared by the counter and the strip (items-journal-13).
    const state = computeSlots(actor);
    decorateCounter(actor, element, state);
    // NPC sidebars are a different organism — trait pills, no card, no
    // favourites. They keep the decorated counter and the enforcement hooks.
    if (actor.type === "character") mountStrip(app, element, activate, state);
  } catch (err) {
    console.error(`${MODULE} | render failed`, err);
  }
}

export function install(reg) {
  reg.on("renderBaseActorSheet", onRenderSheet, { label: "renderBaseActorSheet: strip" });
}

/** No session state. */
export function uninstall() {}
