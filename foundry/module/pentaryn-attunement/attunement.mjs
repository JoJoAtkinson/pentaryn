/**
 * Pentaryn Attunement Slots
 * =========================
 *
 * dnd5e (5.x, and still 6.0.6) has the whole attunement data model — `system.attributes.attunement`
 * on the actor, `system.attunement` / `system.attuned` on the item, a live count,
 * and correct effect suppression — and then does almost nothing with it. The sheet
 * renders one small `☀ value / max` widget in the inventory filter row, and there
 * is no cap enforcement anywhere in the system:
 *
 *     // dnd5e 6.0.6 applications/actor/api/base-actor-sheet.mjs, _prepareItemPhysical
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

import {
  AWAY, AWAY_FLAG, BOND, MODULE, SLOTS, awayOf, bondChanges, computeSlots, homeSlots, patchProficiencyMap,
  planStash, t, tooltipAnchorMissing, trimSlots, wouldExceed
} from "./attunement-core.mjs";

/* -------------------------------------------- */
/*  Away bonds                                  */
/* -------------------------------------------- */

/*
 * An attuned item that leaves its owner — confiscated into a chest, handed to
 * someone to carry — is still attuned by the rules: attunement only ends when
 * you end it, or after 24 hours more than 100 feet away. dnd5e has no way to say
 * that. Delete the item from the actor and the attunement simply vanishes; the
 * slot frees up and nothing remembers it.
 *
 * So the item carries a *bond* and the actor carries an *away list* (shapes in
 * attunement-core.mjs). The away entry holds a slot (greyed, chain-broken, "not
 * on <actor>") and the bond lets the item find its way home: when an item
 * carrying a bond is created on the bonded actor, by any route — item-piles
 * Take, a sheet drop, a script — `preCreateItem` restores its real name,
 * equipped state and attunement before the document exists, so it arrives lit
 * up. Nobody has to remember to re-attune.
 *
 * `bond.name` is also what makes the "(Talo)" tag on a confiscated item go away
 * the moment anyone picks it up: the tag is for finding things in the box, not
 * for living on a character sheet.
 */

/**
 * Move items off an actor into a container actor, tagged with the owner's name
 * and bonded so they come home attuned. Used for confiscation.
 *
 * @param {Actor} owner
 * @param {Actor} container       Usually an item-piles container actor.
 * @param {string[]} itemIds      Items to move. Container contents are flattened.
 * @param {object} [opts]
 * @param {string} [opts.tag]     Defaults to the owner's short name.
 * @param {boolean} [opts.currency]  Also move the owner's coin, as a tagged purse.
 */
async function stash(owner, container, itemIds, { tag, currency = false } = {}) {
  const ids = new Set(itemIds);
  const { creates, away, slots } = planStash(owner, itemIds, {
    tag, currency, randomID: foundry.utils.randomID, setProperty: foundry.utils.setProperty
  });
  await container.createEmbeddedDocuments("Item", creates);
  await owner.deleteEmbeddedDocuments("Item", [...ids].filter(id => owner.items.has(id)));
  const update = { [`flags.${MODULE}.${AWAY_FLAG}`]: away, [`flags.${MODULE}.${SLOTS}`]: slots };
  if (currency) for (const k of Object.keys(owner.system.currency ?? {})) update[`system.currency.${k}`] = 0;
  await owner.update(update);
  return creates.length;
}

/**
 * The owner ends attunement to an item they are not carrying.
 * @param {Actor} actor
 * @param {string} key
 */
async function releaseAway(actor, key) {
  const away = awayOf(actor).filter(a => a.key !== key);
  return actor.setFlag(MODULE, AWAY_FLAG, away);
}

/**
 * An item is being created on an actor. If it carries a bond, put it back the
 * way it was. Runs on whichever client creates the document — for an item-piles
 * Take that is the GM's — which is why this mutates source rather than writing.
 * @param {Item} item
 */
function restoreBond(item, data, options) {
  const bond = item.getFlag?.(MODULE, BOND);
  if (!bond) return;
  const actor = item.parent;
  if (!(actor instanceof Actor)) return;
  // Into another container (box to box): leave it tagged.
  if (game.itempiles?.API?.isValidItemPile?.(actor)) return;

  item.updateSource(bondChanges(bond, { actorId: actor.id, awayKeys: awayOf(actor).map(a => a.key), fallbackName: item.name }));
  if (options) options[MODULE] = { bond };
}

/**
 * After the item exists: hand its slot back and say so. Only on the client that
 * created it, so it happens once.
 */
async function onCreateItemBond(item, options, userId) {
  if (userId !== game.user.id) return;
  const actor = item.parent;
  if (!(actor instanceof Actor)) return;
  // Read the bond off the document, not `options`: item-piles' create path does
  // not carry preCreate's options mutations through to this hook.
  const bond = item.getFlag(MODULE, BOND);
  if (!bond) return;
  if (game.itempiles?.API?.isValidItemPile?.(actor)) return;

  if (bond.currency) {
    const update = {};
    for (const [k, v] of Object.entries(bond.currency)) update[`system.currency.${k}`] = (actor.system.currency?.[k] ?? 0) + v;
    await actor.update(update);
    await item.delete();
    ui.notifications.info(t("CoinBack", { actor: actor.name }));
    return;
  }

  if (actor.id !== bond.actor) return;
  // Home for good: the bond has done its job. Anywhere else it stays, so the
  // item still knows its way back if it is handed over later.
  await item.update({ [`flags.${MODULE}.-=${BOND}`]: null });
  const entry = awayOf(actor).find(a => a.key === bond.key);
  if (!entry) return;
  const slots = homeSlots(computeSlots(actor).slots, AWAY + bond.key, item.id);
  await actor.update({
    [`flags.${MODULE}.${AWAY_FLAG}`]: awayOf(actor).filter(a => a.key !== bond.key),
    [`flags.${MODULE}.${SLOTS}`]: slots
  });
  ui.notifications.info(t("BackInHand", { name: item.name, actor: actor.name }));
}

/**
 * Persist a slot arrangement. Trailing holes are trimmed so the flag does not
 * grow every time something is unattuned.
 * @param {Actor} actor
 * @param {(string|null)[]} slots
 */
async function writeSlots(actor, slots) {
  return actor.setFlag(MODULE, SLOTS, trimSlots(slots));
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

  if (itemId?.startsWith?.(AWAY)) return buildAwaySlot(actor, itemId.slice(AWAY.length), index, overflow, editable, li);

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
function buildAwaySlot(actor, key, index, overflow, editable, li) {
  const entry = awayOf(actor).find(a => a.key === key);
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
    rm.setAttribute("aria-label", t("Release"));
    rm.innerHTML = `<i class="fas fa-circle-xmark" inert></i>`;
    fig.append(rm);
  }
  li.append(fig);

  const name = foundry.utils.escapeHTML(entry?.name ?? "");
  const body = t("AwayBody", { actor: foundry.utils.escapeHTML(actor.name.split(/[ ,]/)[0]) });
  li.dataset.tooltip = `<div class="pentaryn-away-tip"><strong>${name}</strong><p>${body}</p></div>`;
  li.dataset.tooltipDirection = "RIGHT";
  li.setAttribute("aria-label", `${entry?.name} — ${body}`);
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
    note.textContent = t("OverBy", { n: value - max });
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
      return confirmRelease(actor, slotEl.dataset.awayKey);
    }
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
    if (slotEl?.dataset.awayKey && editable) {
      event.preventDefault();
      event.stopPropagation();
      return confirmRelease(actor, slotEl.dataset.awayKey);
    }
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
  const { exceed, after } = wouldExceed({ value: att.value, max: att.max, awayCount: awayOf(actor).length });
  if (!exceed) return;
  ui.notifications.warn(t(key, {
    name: item.name, actor: actor.name, value: after, max: att.max
  }));
}

function onPreUpdateItem(item, changes) {
  if (foundry.utils.getProperty(changes, "system.attuned") !== true) return;
  if (item.system?.attuned) return;             // already attuned: no delta
  if (!item.system?.attunement) return;         // does not count against the cap
  warnOverCap(item.parent, item, "WouldExceed");
}

function onPreCreateItem(item, data, options) {
  restoreBond(item, data, options);
  if (item.getFlag?.(MODULE, BOND)) return;
  if (!item.system?.attuned) return;
  if (!(item.parent instanceof Actor)) return;
  warnOverCap(item.parent, item, "ArrivedAttuned");
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
/*  Registration                                */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const added = patchProficiencyMap(CONFIG.DND5E.armorProficienciesMap);
  if (added.length) console.log(`${MODULE} | proficiency applies to all: ${added.join(", ")}`);
});

// Published one tick after ready (publishing synchronously is a declared step of
// the migration). The importer merges into game.pentaryn and nothing freezes it
// since its keystone (items-journal-1), so the old frozen-root guard is gone
// (kit 1.0.2, J10): the API is assigned into the plain root.
Hooks.once("ready", () => setTimeout(() => {
  guardItemTooltipPosition();
  const api = { report, computeSlots, stash, releaseAway, away: awayOf };
  game.pentaryn ??= {};
  game.pentaryn.attunement = api;
  console.log(`${MODULE} | ready`);
}, 0));

/**
 * dnd5e 6.0.6 `Tooltips5e#_positionItemTooltip` runs a frame after an item tooltip's content
 * loads and calls `game.tooltip._setAnchor`, which reads `game.tooltip.element`. When the row
 * under the pointer was re-rendered away in between (a sheet refresh after a take, an attune,
 * a light), core has already deactivated the tooltip and that element is null, so every such
 * hover logged "Cannot read properties of null (reading 'getBoundingClientRect')" (Area 8 run).
 * With no anchor there is nothing to position: skip. Registered as `dnd5e-item-tooltip-anchor`.
 */
function guardItemTooltipPosition() {
  const proto = game.dnd5e?.tooltips ? Object.getPrototypeOf(game.dnd5e.tooltips) : null;
  const original = proto?._positionItemTooltip;
  if (typeof original !== "function" || original.pentarynGuarded) return;
  const guarded = function (...args) {
    if (tooltipAnchorMissing({ element: game.tooltip?.element, tooltip: this.tooltip })) return;
    return original.apply(this, args);
  };
  guarded.pentarynGuarded = true;
  proto._positionItemTooltip = guarded;
}

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
Hooks.on("createItem", onCreateItemBond);
