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

const MODULE = "pentaryn-attunement";
const SLOTS = "slots";
const AWAY_FLAG = "away";
const BOND = "bond";
const AWAY = "away:";

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
 * So the item carries a *bond* and the actor carries an *away list*:
 *
 *     item  flags["pentaryn-attunement"].bond = { actor, key, name, equipped, attuned, attunement, currency? }
 *     actor flags["pentaryn-attunement"].away = [{ key, name, img }]
 *
 * The away entry holds a slot (greyed, chain-broken, "not on <actor>") and the
 * bond lets the item find its way home: when an item carrying a bond is created
 * on the bonded actor, by any route — item-piles Take, a sheet drop, a script —
 * `preCreateItem` restores its real name, equipped state and attunement before
 * the document exists, so it arrives lit up. Nobody has to remember to re-attune.
 *
 * `bond.name` is also what makes the "(Talo)" tag on a confiscated item go away
 * the moment anyone picks it up: the tag is for finding things in the box, not
 * for living on a character sheet.
 *
 * `bond.currency` marks a coin purse: on arrival its coin is added to the
 * actor's purse and the item deletes itself.
 */

/** @returns {{key:string,name:string,img:string}[]} */
function awayOf(actor) {
  const list = actor?.getFlag?.(MODULE, AWAY_FLAG);
  return Array.isArray(list) ? list.filter(a => a && (typeof a.key === "string")) : [];
}

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
  tag ??= owner.name.split(/[ ,]/)[0];
  const ids = new Set(itemIds);
  const away = awayOf(owner);
  const creates = [];
  const keyById = new Map();
  const merged = new Map();

  for (const id of ids) {
    const item = owner.items.get(id);
    if (!item) continue;
    const key = foundry.utils.randomID();
    const wasAttuned = !!item._source.system?.attuned;
    const data = item.toObject();
    delete data._id;
    delete data.system.container;
    // Source name, not prepared: an enchanted item's displayed name is built by
    // an effect ("{} of the War Mage, +1"), and storing the prepared name would
    // double the suffix when it comes home.
    data.name = `${item._source.name} (${tag})`;
    if ("equipped" in data.system) data.system.equipped = false;
    if ("attuned" in data.system) data.system.attuned = false;
    foundry.utils.setProperty(data, `flags.${MODULE}.${BOND}`, {
      actor: owner.id, key, name: item._source.name,
      equipped: !!item._source.system?.equipped,
      attuned: wasAttuned,
      attunement: item._source.system?.attunement ?? ""
    });
    if (wasAttuned) { away.push({ key, name: item.name, img: item.img }); keyById.set(id, key); }

    // Merge plain duplicates (two stacks of torches) so the box stays readable.
    const mkey = `${data.type}|${data.name}`;
    const prior = (data.type !== "container" && !wasAttuned) ? merged.get(mkey) : null;
    if (prior && ("quantity" in data.system)) { prior.system.quantity += data.system.quantity ?? 1; continue; }
    merged.set(mkey, data);
    creates.push(data);
  }

  if (currency) {
    const coin = Object.fromEntries(Object.entries(owner.system.currency ?? {}).filter(([, v]) => v > 0));
    if (Object.keys(coin).length) {
      const label = Object.entries(coin).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(", ");
      creates.push({
        name: `Coin Purse (${tag})`, type: "loot", img: "icons/containers/bags/coinpouch-simple-leather-tan.webp",
        system: { quantity: 1, type: { value: "treasure" }, description: { value: `<p>${label}.</p>` } },
        flags: { [MODULE]: { [BOND]: { actor: owner.id, key: foundry.utils.randomID(), name: "Coin Purse", currency: coin } } }
      });
    }
  }

  // Each away item keeps the slot it held before it left.
  const slots = computeSlots(owner).slots.map(id => keyById.has(id) ? AWAY + keyById.get(id) : id);
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

  const changes = { name: bond.name ?? item.name };
  const home = (actor.id === bond.actor) && awayOf(actor).some(a => a.key === bond.key);
  if (home) {
    if (bond.attunement != null) changes["system.attunement"] = bond.attunement;
    changes["system.attuned"] = true;
    if (bond.equipped) changes["system.equipped"] = true;
  } else if (actor.id === bond.actor) {
    if (bond.attunement != null) changes["system.attunement"] = bond.attunement;
    if (bond.equipped) changes["system.equipped"] = true;
  }
  item.updateSource(changes);
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
  // Attuned items that are not on the actor right now (confiscated, stashed) keep
  // their slot. They live in the slot array as `away:<key>`.
  for (const a of awayOf(actor)) attuned.push(AWAY + a.key);
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
 * An away item has come home as `itemId`. Put it back in the slot its away
 * marker held.
 *
 * By the time this runs the item already exists *and is attuned* (preCreate
 * restored it) while its away entry is still listed, so `computeSlots` has
 * already dropped the new id into the first hole — or appended it as an extra
 * slot when there was none. Swapping the marker alone then wrote the id twice:
 * the flag grew a duplicate, and when there was a hole the item sat in the hole
 * (first occurrence wins) instead of its own slot. Pure.
 *
 * @param {(string|null)[]} slots   reconciled slots, marker and new id both present
 * @param {string} awayId           `away:<key>`
 * @param {string} itemId
 * @returns {(string|null)[]}
 */
function homeSlots(slots, awayId, itemId) {
  if (!slots.includes(awayId)) return slots;
  const out = slots.map(id => (id === itemId) ? null : (id === awayId) ? itemId : id);
  while ((out.length > 0) && (out.at(-1) === null)) out.pop();
  return out;
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
  const value = att.value + awayOf(actor).length;
  if (value < att.max) return;
  ui.notifications.warn(t(key, {
    name: item.name, actor: actor.name, value: value + 1, max: att.max
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

/** Strings live here, merged into i18n at init; `t()` falls back to them. */
const STRINGS = {
  OverBy: "{n} over the limit",
  NotOnActor: "That item belongs to a different actor.",
  NotAttunable: "{name} does not require attunement.",
  WouldExceed: "{actor} is already attuned to {max} items — attuning {name} makes {value}.",
  ArrivedAttuned: "{name} arrived already attuned; {actor} is now over the attunement limit.",
  AwayBody: "Still attuned, but not on {actor}. Its power is dormant until it is back in hand.",
  Release: "End Attunement",
  ReleaseConfirm: "End attunement to <strong>{name}</strong>? It is not on you, so it will come back as an ordinary, unattuned item.",
  SlotHeld: "That slot is held by {name}, which is attuned but not on you. End that attunement first.",
  BackInHand: "{name} is back with {actor} — attunement restored.",
  CoinBack: "{actor} recovers their coin."
};

/**
 * Not routed through game.i18n: merging into `game.i18n.translations` at init
 * did not survive to render time in v14, so every string printed as its key.
 */
function t(key, data = {}) {
  return (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in data ? String(data[k]) : m));
}

Hooks.once("init", () => {
  const added = patchProficiencyMap(CONFIG.DND5E.armorProficienciesMap);
  if (added.length) console.log(`${MODULE} | proficiency applies to all: ${added.join(", ")}`);

});

// pentaryn-importer replaces game.pentaryn with a FROZEN object in its own ready
// hook, and ready hooks run in module-id order — "attunement" sorts before
// "importer", so publishing synchronously gets wiped. Defer a tick (as
// pentaryn-dropbin does), then rebuild the namespace rather than assign into it.
Hooks.once("ready", () => setTimeout(() => {
  guardItemTooltipPosition();
  const api = { report, computeSlots, stash, releaseAway, away: awayOf };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, attunement: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.attunement = api;
  }
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
    if (!game.tooltip?.element || !this.tooltip) return;
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

// Exported for `test/run.mjs`. Foundry ignores exports on an esmodule entry point;
// the reconciliation logic is the part with real edge cases, so it is worth being
// able to prove it without standing a browser up.
export { computeSlots, homeSlots, patchProficiencyMap };
