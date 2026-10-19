/**
 * Pentaryn Feature Riders — FEATURE: the character sheet's Spells tab opens on the spells the
 * character can cast today, with a "Prepared / All spells" switch above the list (feedback EBGqNA:
 * a cleric's 80-spell sheet with 56 unprepared was overwhelming).
 *
 * Two hooks, both dnd5e 6's own seams, no wrap:
 *   dnd5e.filterItem            the sheet's list filter asks per item; `false` hides it. Only spells,
 *                               only on a character, only in the Prepared view (core inPreparedView).
 *   renderCharacterActorSheet   draws the switch before the list's search bar, with counts; no
 *                               switch when nothing would be hidden (a sorcerer, a fighter).
 * A click re-applies dnd5e's filters in place (`item-list-controls._applyFilters`, no re-render, the
 * scroll stays) and stores the choice as a user flag `flags.pentaryn-riders.spellView.<actorId>`, so
 * it follows the user to another browser and differs per character. Setting `spellView` (world,
 * on) turns the whole thing off; its onChange re-renders open character sheets.
 */

import { MODULE, inPreparedView, spellViewCounts, spellViewOf } from "./riders-core.mjs";
import { settingOr } from "./settings.mjs";
import { spellViewInfo } from "./shapes.mjs";

let log = null;

/** The choice made on this client, ahead of its user-flag write (a click shows at once). */
const pending = new Map();

const enabled = () => settingOr("spellView", false);
const isCharacter = actor => actor?.documentName === "Actor" && actor.type === "character";

/** This user's view for this actor: "prepared" (the default) or "all". */
function viewFor(actor) {
  if (!actor?.id) return spellViewOf(null);
  if (pending.has(actor.id)) return pending.get(actor.id);
  let stored = null;
  try { stored = game.user?.getFlag(MODULE, `spellView.${actor.id}`) ?? null; } catch (err) { log?.debug("spell view flag unreadable; the default view", err); }
  return spellViewOf(stored);
}

async function storeView(actor, view) {
  pending.set(actor.id, view);
  try {
    await game.user.setFlag(MODULE, `spellView.${actor.id}`, view);
    pending.delete(actor.id);
  } catch (err) {
    log.warn("spell view not saved (kept for this session)", err);
  }
}

/** dnd5e.filterItem: `false` hides an unprepared levelled spell in the Prepared view. */
function onFilterItem(sheet, item) {
  if (item?.type !== "spell") return undefined;
  const actor = sheet?.document ?? sheet?.actor;
  if (!isCharacter(actor) || !enabled() || viewFor(actor) !== "prepared") return undefined;
  return inPreparedView(spellViewInfo(item)) ? undefined : false;
}

function spellsOf(actor) {
  return (actor.items?.filter?.(i => i.type === "spell") ?? []).map(spellViewInfo);
}

/** Re-run dnd5e's filters on the spells list in place; a sheet without the element re-renders. */
function refilter(app, root) {
  const controls = root.querySelector('item-list-controls[for="spells"]');
  if (typeof controls?._applyFilters === "function") controls._applyFilters();
  else app.render?.();
}

function button(view, label, tip, active) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `pr-sv-btn unbutton${active ? " active" : ""}`;
  b.dataset.prSpellView = view;
  b.dataset.tooltip = tip;
  b.setAttribute("aria-pressed", String(active));
  b.textContent = label;
  return b;
}

function decorate(app, element) {
  const root = element instanceof HTMLElement ? element : app.element;
  const tab = root?.querySelector('.tab[data-tab="spells"]');
  if (!tab) return;
  tab.querySelector(".pr-spell-view")?.remove();
  const actor = app.document ?? app.actor;
  if (!isCharacter(actor) || !enabled()) return;
  const counts = spellViewCounts(spellsOf(actor));
  if (!counts.hidden) return;

  const view = viewFor(actor);
  const bar = document.createElement("div");
  bar.className = "pr-spell-view";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", _loc("PENTARYN_RIDERS.spellView.label"));
  const label = document.createElement("span");
  label.className = "pr-sv-label";
  label.textContent = _loc("PENTARYN_RIDERS.spellView.label");
  bar.append(
    label,
    button("prepared", _loc("PENTARYN_RIDERS.spellView.prepared", { n: counts.shown }), _loc("PENTARYN_RIDERS.spellView.preparedTip"), view === "prepared"),
    button("all", _loc("PENTARYN_RIDERS.spellView.all", { n: counts.total }), _loc("PENTARYN_RIDERS.spellView.allTip", { n: counts.hidden }), view === "all"),
  );
  if (view === "prepared") {
    const note = document.createElement("span");
    note.className = "pr-sv-note";
    note.textContent = _loc("PENTARYN_RIDERS.spellView.hiddenNote", { n: counts.hidden });
    bar.append(note);
  }
  bar.addEventListener("click", ev => {
    const b = ev.target.closest("button[data-pr-spell-view]");
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    const next = b.dataset.prSpellView;
    if (next === viewFor(actor)) return;
    const saved = storeView(actor, next);
    decorate(app, root);
    refilter(app, root);
    return saved;
  });

  const anchor = tab.querySelector(".inventory-element > .middle") ?? tab.querySelector("item-list-controls");
  if (anchor) anchor.before(bar);
  else (tab.querySelector(".inventory-element") ?? tab).prepend(bar);
}

function onRenderSheet(app, element) {
  try { decorate(app, element); } catch (err) { log.warn("spell view switch skipped", err); }
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("dnd5e.filterItem", onFilterItem, { guard: "warn", label: "spell view: filter" });
  reg.on("renderCharacterActorSheet", onRenderSheet, { guard: false, label: "spell view: switch" });
}

export function uninstall() {
  pending.clear();
}
