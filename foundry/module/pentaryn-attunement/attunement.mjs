/**
 * Pentaryn Attunement Slots
 * =========================
 *
 * dnd5e 5.x has the whole attunement data model — `system.attributes.attunement`
 * on the actor, `system.attunement` / `system.attuned` on the item, a live count,
 * and correct effect suppression — and then does almost nothing with it. The sheet
 * renders one small `☀ value / max` widget in the inventory filter row, and there
 * is no cap enforcement anywhere in the system:
 *
 *     // dnd5e.mjs, _prepareItemPhysical
 *     ctx.attunement.disabled = !item.isOwner;   // ← the only gate there is
 *
 * So a character sits at 5/3 indefinitely and nothing says so. That is not
 * hypothetical: it is how this module got written.
 *
 * Two problems, two halves of this file.
 *
 * ── The display ───────────────────────────────────────────────────────────────
 *
 * Attunement is rendered as slots in the **sidebar**, between the character card
 * and the favourites list, rather than as a panel on the inventory tab. The
 * reason is adjacency: the stats attunement changes — AC above all — are drawn on
 * that same card, a couple of inches up. Unattune a Cloak of Protection and you
 * watch the icon leave its slot *and* the AC badge tick 15 → 14 in one glance.
 * A panel on the inventory tab can never show the second half of that, and the
 * second half is the whole reason anyone doubts whether the first half worked.
 *
 * It also means attunement state is visible from every tab, not just inventory.
 *
 * Cost of the choice: collapsing the sidebar hides it. That is accepted — the
 * same gesture already hides AC, hit points, hit dice and death saves, and the
 * system's own counter stays in the inventory row as the fallback. This module
 * decorates that counter with an over-cap state so the fallback is not silent.
 *
 * ── Slots are a fiction, so they have to be stored ────────────────────────────
 *
 * There is no slot concept in the data model. `system.attuned` is a boolean per
 * item; nothing orders them. Favourites get away with drag-to-reorder because
 * `ActorFavorites5e` has a real `sort` field. Attunement has no equivalent.
 *
 * Rendering in name order would mean that replacing one item reshuffles its
 * neighbours — the Luckstone hops from slot 2 to slot 1 because the alphabet
 * changed. On a surface whose entire job is answering "did that just change?",
 * icons that move on their own are actively harmful.
 *
 * So slot order is persisted on the actor as an array of item ids:
 *
 *     flags["pentaryn-attunement"].slots = ["abc123", null, "def456"]
 *
 * The flag is a *hint*, never the truth. `computeSlots()` reconciles it against
 * `system.attuned` on every render: entries whose item is gone or no longer
 * attuned become holes, and attuned items missing from the array are dropped into
 * the first hole. Corrupt or absent flag data therefore costs nothing — worst
 * case you get the same order you would have had without it. Nothing is written
 * during render; the flag is only ever updated by a deliberate drop.
 *
 * ── Enforcement: warn on every path, veto on none ─────────────────────────────
 *
 * `preUpdateItem` covers every writer of `system.attuned` — the sheet's sun
 * toggle, the context menu, this module's own drops, macros, and the MCP bridge —
 * because all of them land in the same document update. `preCreateItem` catches
 * the other door: an item arriving *already* attuned via item-piles, an import,
 * or a compendium drop (the system only strips `attuned` on sheet drops, in
 * `_onDropResetData`).
 *
 * Neither hook ever returns `false`. A vetoed update resolves without applying
 * and without throwing, so a macro or an MCP call would carry on believing it
 * succeeded — and this world is scripted through an MCP bridge. Silent divergence
 * between what a script thinks it did and what the database holds is a far worse
 * failure than an over-attuned bard.
 *
 * The cap is unenforceable in principle anyway: delete the feature or expire the
 * effect that raised `attunement.max` and the actor is over cap having fired no
 * item hook at all. Which is exactly why the *display* has to render the over-cap
 * state correctly rather than relying on having caught every write.
 *
 * Console access: `game.pentaryn.attunement.report(actor)`.
 */

const MODULE = "pentaryn-attunement";
const SLOTS = "slots";

/* -------------------------------------------- */
/*  State                                       */
/* -------------------------------------------- */

/**
 * Reconcile the stored slot order against what is actually attuned right now.
 *
 * Pure: reads documents, writes nothing. Safe to call from render.
 *
 * @param {Actor} actor
 * @returns {{slots: (string|null)[], max: number, value: number, over: boolean}}
 */
function computeSlots(actor) {
  const att = actor.system?.attributes?.attunement ?? {};
  const max = Number.isFinite(att.max) ? Math.max(0, att.max) : 3;

  // Prepared data is the right source here: an item stripped of its attunement
  // by prepareFinalEquippableData (equipment without the Magical property) is
  // genuinely not attuned as far as the rest of the system is concerned.
  const attuned = actor.items.filter(i => i.system?.attuned).map(i => i.id);
  const attunedSet = new Set(attuned);

  // First occurrence wins. Without the dedupe a flag that repeats an id — which a
  // half-applied write or a hand-edited flag can produce — renders the same item
  // in several slots at once and inflates the count against the cap.
  const stored = actor.getFlag(MODULE, SLOTS);
  const placed = new Set();
  const slots = (Array.isArray(stored) ? stored : []).map(id => {
    if ((typeof id !== "string") || !attunedSet.has(id) || placed.has(id)) return null;
    placed.add(id);
    return id;
  });

  // Drop anything attuned that has no home yet into the first hole.
  for (const id of attuned) {
    if (placed.has(id)) continue;
    const hole = slots.indexOf(null);
    if (hole >= 0) slots[hole] = id;
    else slots.push(id);
    placed.add(id);
  }

  // Always draw at least `max` slots, and never trail empty ones past it.
  while (slots.length < max) slots.push(null);
  while ((slots.length > max) && (slots.at(-1) === null)) slots.pop();

  const value = placed.size;
  return { slots, max, value, over: value > max };
}

/**
 * Persist a slot arrangement. Trailing holes are trimmed so the flag does not
 * grow every time something is unattuned.
 * @param {Actor} actor
 * @param {(string|null)[]} slots
 */
async function writeSlots(actor, slots) {
  const trimmed = [...slots];
  while (trimmed.length && (trimmed.at(-1) === null)) trimmed.pop();
  return actor.setFlag(MODULE, SLOTS, trimmed);
}

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
function applyTooltip(el, item) {
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
 * @returns {HTMLElement}
 */
function buildSlot(actor, itemId, index, overflow, editable) {
  const li = document.createElement("li");
  li.className = "attunement-slot";
  li.dataset.slot = String(index);

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
  li.setAttribute("aria-label", suppressed
    ? `${item.name} — ${game.i18n.localize("DND5E.AttunementAttuned")}, ${game.i18n.localize("DND5E.EffectUnavailableInfo")}`
    : `${item.name} — ${game.i18n.localize("DND5E.AttunementAttuned")}`);

  return li;
}

/**
 * Build the whole strip.
 * @param {Actor} actor
 * @param {boolean} editable
 * @returns {HTMLElement}
 */
function buildStrip(actor, editable) {
  const { slots, max, value, over } = computeSlots(actor);

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
  slots.forEach((id, i) => ul.append(buildSlot(actor, id, i, i >= max, editable)));
  root.append(ul);

  if (over) {
    const note = document.createElement("p");
    note.className = "over-cap-note roboto-upper";
    note.textContent = game.i18n.format("PENTARYN.ATTUNEMENT.OverBy", { n: value - max });
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
 */
function decorateCounter(actor, root) {
  const el = root.querySelector('[data-application-part="inventory"] .attunement');
  if (!el) return;
  const { over } = computeSlots(actor);
  el.classList.toggle("pentaryn-over-cap", over);
}

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
    ui.notifications.warn(game.i18n.localize("PENTARYN.ATTUNEMENT.NotOnActor"));
    return;
  }
  if (!item.system?.attunement) {
    ui.notifications.warn(game.i18n.format("PENTARYN.ATTUNEMENT.NotAttunable", { name: item.name }));
    return;
  }

  return attuneToSlot(actor, item, Number(slotEl.dataset.slot));
}

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
    if (!slotEl?.dataset.itemId) return;
    if (event.target.closest('[data-action="unattune"]')) {
      event.preventDefault();
      event.stopPropagation();
      return unattune(actor, slotEl.dataset.itemId);
    }
    actor.items.get(slotEl.dataset.itemId)?.sheet?.render(true);
  });

  strip.addEventListener("contextmenu", event => {
    const slotEl = event.target.closest(".attunement-slot");
    if (!slotEl?.dataset.itemId || !editable) return;
    event.preventDefault();
    event.stopPropagation();
    return unattune(actor, slotEl.dataset.itemId);
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

  strip.addEventListener("drop", event => onDrop(event, actor));
}

/* -------------------------------------------- */
/*  Injection                                   */
/* -------------------------------------------- */

/**
 * @param {ActorSheet} app
 * @param {HTMLElement} root
 */
function injectStrip(app, root) {
  const actor = app.actor;
  const sidebar = root.querySelector(".sidebar");
  // Limited sheets render header + biography only: no sidebar, nothing to do.
  const card = sidebar?.querySelector(":scope > .card");
  if (!card) return;

  // ApplicationV2 rebuilds this subtree on every render, so in practice the old
  // node is already gone. Removing first anyway keeps a future partial render
  // from stacking duplicates — the failure mode the system's own
  // _renderAttunement still has.
  sidebar.querySelectorAll(":scope > .pentaryn-attunement").forEach(n => n.remove());

  const editable = app.isEditable && actor.isOwner;
  const strip = buildStrip(actor, editable);
  activate(strip, actor, editable);
  card.after(strip);
}

/* -------------------------------------------- */
/*  Enforcement — warn, never veto              */
/* -------------------------------------------- */

/**
 * @param {Actor} actor
 * @param {Item} item
 * @param {string} key
 */
function warnOverCap(actor, item, key) {
  const att = actor?.system?.attributes?.attunement;
  if (!att) return;
  if (att.value < att.max) return;
  ui.notifications.warn(game.i18n.format(key, {
    name: item.name, actor: actor.name, value: att.value + 1, max: att.max
  }));
}

function onPreUpdateItem(item, changes) {
  if (foundry.utils.getProperty(changes, "system.attuned") !== true) return;
  if (item.system?.attuned) return;             // already attuned: no delta
  if (!item.system?.attunement) return;         // does not count against the cap
  warnOverCap(item.parent, item, "PENTARYN.ATTUNEMENT.WouldExceed");
}

function onPreCreateItem(item) {
  if (!item.system?.attuned) return;
  if (!(item.parent instanceof Actor)) return;
  warnOverCap(item.parent, item, "PENTARYN.ATTUNEMENT.ArrivedAttuned");
}

/* -------------------------------------------- */
/*  Console surface                             */
/* -------------------------------------------- */

/**
 * What is attuned, what it is doing, and what looks wrong.
 * @param {Actor|string} [target]  Actor, name, or id. Defaults to the selected token.
 */
function report(target) {
  const actor = (target instanceof Actor) ? target
    : (typeof target === "string" ? (game.actors.get(target) ?? game.actors.getName(target)) : null)
    ?? canvas.tokens?.controlled?.[0]?.actor;
  if (!actor) return console.warn(`${MODULE} | no actor`);

  const { slots, max, value, over } = computeSlots(actor);
  const rows = actor.items
    .filter(i => i.system?.attunement || i.system?.attuned)
    .map(i => ({
      item: i.name,
      slot: slots.indexOf(i.id) >= 0 ? slots.indexOf(i.id) + 1 : "—",
      attuned: !!i.system.attuned,
      equipped: i.system.equipped ?? null,
      suppressed: i.areEffectsSuppressed,
      // Source-vs-prepared divergence: prepareFinalEquippableData clears
      // attunement on equipment lacking the Magical property, so an item can
      // read "attuned" in the database and be inert in play, showing up in
      // neither column of any UI that filters prepared data.
      dataIssue: (i._source.system?.attuned && !i.system.attuned) ? "attuned in source, cleared in prep (missing Magical property?)"
        : (i._source.system?.attunement && !i.system.attunement) ? "attunement cleared in prep (missing Magical property?)"
        : ""
    }));

  console.log(`${MODULE} | ${actor.name} — ${value}/${max}${over ? "  ⚠ OVER CAP" : ""}`);
  console.table(rows);
  return { actor: actor.name, value, max, over, slots, rows };
}

/* -------------------------------------------- */
/*  "Not Proficient" on a cloak                 */
/* -------------------------------------------- */

/**
 * Every ring, rod, wand, trinket and wondrous item in the world reports
 * **Not Proficient** — on its tooltip and on its chat card. Two bits of dnd5e that
 * don't quite meet:
 *
 *     // EquippableItemTemplate#equippableItemCardProperties — always emits a pill
 *     ("proficient" in this) ? CONFIG.DND5E.proficiencyLevels[this.prof?.multiplier || 0] : null
 *
 *     // EquipmentData#proficiencyMultiplier
 *     const itemProf = CONFIG.DND5E.armorProficienciesMap[this.type.value];
 *     const isProficient = (itemProf === true) || actorProfs.has(itemProf) || ...
 *
 * `armorProficienciesMap` covers only `natural`, `clothing`, `light`, `medium`,
 * `heavy` and `shield`. A cloak is `wondrous`, so the lookup is `undefined`,
 * `actorProfs.has(undefined)` is false, and the multiplier lands on 0 → "Not
 * Proficient". The system is not claiming you can't wear it; it is reporting that
 * you lack the proficiency named `undefined`.
 *
 * This lands here rather than in a module of its own because the affected
 * categories *are* the attunement categories — every magic item that wants a slot
 * is a ring, rod, wand, trinket or wondrous item.
 *
 * `??=` on purpose: if a later dnd5e defines any of these itself, its definition
 * wins and this becomes a no-op. Nothing to un-patch, nothing to keep in sync.
 *
 * `vehicle` is deliberately left alone — vehicle proficiency is a real concept in
 * some settings, and silently declaring everyone proficient is a trap for later.
 *
 * Note what is *not* here: any list of feats. Every proficiency source — class,
 * species, background, feat, Active Effect — is already aggregated by the system
 * into `actor.system.traits.armorProf.value`, recomputed on every data prep. Gain a
 * feat and the pills follow on their own. The only thing missing was which
 * categories the question applies to at all, which is what this supplies.
 *
 * @param {object} map  `CONFIG.DND5E.armorProficienciesMap`.
 * @returns {string[]}  Keys actually added, for the log line.
 */
function patchProficiencyMap(map) {
  const added = [];
  for (const type of ["wondrous", "ring", "rod", "wand", "trinket"]) {
    if (map[type] == null) { map[type] = true; added.push(type); }
  }
  return added;
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const added = patchProficiencyMap(CONFIG.DND5E.armorProficienciesMap);
  if (added.length) console.log(`${MODULE} | proficiency applies to all: ${added.join(", ")}`);

  // Registered here rather than shipped as a lang file: four strings.
  foundry.utils.mergeObject(game.i18n.translations, {
    PENTARYN: {
      ATTUNEMENT: {
        OverBy: "{n} over the limit",
        NotOnActor: "That item belongs to a different actor.",
        NotAttunable: "{name} does not require attunement.",
        WouldExceed: "{actor} is already attuned to {max} items — attuning {name} makes {value}.",
        ArrivedAttuned: "{name} arrived already attuned; {actor} is now over the attunement limit."
      }
    }
  }, { inplace: true });
});

Hooks.once("ready", () => {
  game.pentaryn ??= {};
  game.pentaryn.attunement = { report, computeSlots };
  console.log(`${MODULE} | ready`);
});

// One hook for both sheets. `renderBaseActorSheet` fires for every subclass,
// because Foundry walks the inheritance chain dispatching render<ClassName>.
Hooks.on("renderBaseActorSheet", (app, element) => {
  const actor = app?.actor;
  // Vehicles and groups inherit the same base and have no attunement schema.
  if (!actor?.system?.attributes?.attunement) return;
  try {
    decorateCounter(actor, element);
    // NPC sidebars are a different organism — trait pills, no card, no
    // favourites. They keep the decorated counter and the enforcement hooks.
    if (actor.type === "character") injectStrip(app, element);
  } catch (err) {
    console.error(`${MODULE} | render failed`, err);
  }
});

Hooks.on("preUpdateItem", onPreUpdateItem);
Hooks.on("preCreateItem", onPreCreateItem);

// Exported for `test/run.mjs`. Foundry ignores exports on an esmodule entry point;
// the reconciliation logic is the part with real edge cases, so it is worth being
// able to prove it without standing a browser up.
export { computeSlots, patchProficiencyMap };
