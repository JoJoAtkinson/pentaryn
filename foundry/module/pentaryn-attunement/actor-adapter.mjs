/**
 * Pentaryn Attunement Slots — ADAPTER: the writes to actor and item documents, the third-party
 * reads (Item Piles), and the two dnd5e adjustments (CONFIG.DND5E.armorProficienciesMap and the
 * Tooltips5e#_positionItemTooltip guard). Decisions come from attunement-core.mjs.
 *
 * Shared by the features (sheet.mjs, bonds.mjs) and api.mjs, which may not import each other.
 */

import {
  AWAY_FLAG, MODULE, SLOTS, awayOf, patchProficiencyMap, planStash, tooltipAnchorMissing, trimSlots
} from "./attunement-core.mjs";
import { wrapMethod } from "./lib/patch.mjs";

/**
 * True for an Item Piles pile (a container actor): bonds stay dormant there, so an item moved box
 * to box keeps its tag. Adjustments row `itempiles-attunement-repair`.
 */
export const isPileActor = a => !!game.itempiles?.API?.isValidItemPile?.(a);

/**
 * Persist a slot arrangement. Trailing holes are trimmed so the flag does not
 * grow every time something is unattuned.
 * @param {Actor} actor
 * @param {(string|null)[]} slots
 */
export async function writeSlots(actor, slots) {
  return actor.setFlag(MODULE, SLOTS, trimSlots(slots));
}

/**
 * The owner ends attunement to an item they are not carrying.
 * @param {Actor} actor
 * @param {string} key
 */
export async function releaseAway(actor, key) {
  const away = awayOf(actor).filter(a => a.key !== key);
  return actor.setFlag(MODULE, AWAY_FLAG, away);
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
 * @param {boolean} [opts.detail]    Resolve `{count, created, away}` instead of the count (additive,
 *                                   items-journal-16): the created item ids in the container and the
 *                                   keys of the away entries this call added.
 * @returns {Promise<number|{count: number, created: string[], away: string[]}>}
 */
export async function stash(owner, container, itemIds, { tag, currency = false, detail = false } = {}) {
  const ids = new Set(itemIds);
  const awayBefore = awayOf(owner).length;
  const { creates, away, slots } = planStash(owner, itemIds, {
    tag, currency, randomID: foundry.utils.randomID, setProperty: foundry.utils.setProperty
  });
  const made = await container.createEmbeddedDocuments("Item", creates);
  // Foundry drops a document that fails validation without throwing: never delete an original
  // whose copy may not exist (items-journal-10). The copies the container did accept are deleted
  // from it again (W2-A2), so the call is all-or-nothing and no item exists twice. The Error names
  // them either way (message and `err.created`); `err.rolledBack` says whether they are gone. A
  // rollback that fails (an Item Piles pile may refuse) leaves them there, and the message says why.
  const accepted = made?.length ?? 0;
  if (accepted !== creates.length) {
    const msg = `${MODULE} | stash: container accepted ${accepted}/${creates.length}; originals NOT deleted`;
    console.error(`${MODULE} | stash: container accepted ${accepted}/${creates.length}; originals NOT deleted`,
      { owner: owner.id, container: container.id });
    const created = (made ?? []).map(d => d?.id ?? d?._id ?? null);
    let tail = "";
    let rolledBack = true;
    if (created.length) {
      try {
        if (created.some(id => !id)) throw new Error("a copy has no id");
        await container.deleteEmbeddedDocuments("Item", created);
        tail = `; copies rolled back from container ${container.id}: ${created.join(", ")}`;
      } catch (e) {
        rolledBack = false;
        console.error(`${MODULE} | stash: rollback failed`, e);
        tail = `; rollback failed (${e?.message ?? e}), copies left in container ${container.id}: ${created.join(", ")}`;
      }
    }
    const err = new Error(msg + tail);
    err.created = created;
    err.rolledBack = rolledBack;
    throw err;
  }
  await owner.deleteEmbeddedDocuments("Item", [...ids].filter(id => owner.items.has(id)));
  const update = { [`flags.${MODULE}.${AWAY_FLAG}`]: away, [`flags.${MODULE}.${SLOTS}`]: slots };
  if (currency) for (const k of Object.keys(owner.system.currency ?? {})) update[`system.currency.${k}`] = 0;
  await owner.update(update);
  const created = (made ?? []).map(d => d?.id ?? d?._id ?? null);
  // Audit line for a cross-user write (playbook §5.1: info, with the ids written and `by`), read
  // back after an eval-js run.
  console.info(`${MODULE} | stash: ${creates.length} moved to ${container.name}`,
    { owner: owner.id, container: container.id, ids: created, names: creates.map(c => c.name), by: game.user?.id ?? null });
  if (!detail) return creates.length;
  return {
    count: creates.length,
    created,
    away: away.slice(awayBefore).map(a => a.key),
  };
}

/**
 * Patch CONFIG.DND5E.armorProficienciesMap so ring, rod, wand, trinket and wondrous items stop
 * reading "Not Proficient" (the rule and its reasons: patchProficiencyMap in the core).
 * Adjustments row `dnd5e-armor-proficiencies`.
 * @returns {string[]} the keys added
 */
export function applyProficiencies() {
  const added = patchProficiencyMap(CONFIG.DND5E.armorProficienciesMap);
  if (added.length) console.log(`${MODULE} | proficiency applies to all: ${added.join(", ")}`);
  return added;
}

/** The tooltip guard's handle (kit wrapMethod), for uninstall. */
let tooltipGuard = null;

/**
 * dnd5e 6.0.6 `Tooltips5e#_positionItemTooltip` runs a frame after an item tooltip's content
 * loads and calls `game.tooltip._setAnchor`, which reads `game.tooltip.element`. When the row
 * under the pointer was re-rendered away in between (a sheet refresh after a take, an attune,
 * a light), core has already deactivated the tooltip and that element is null, so every such
 * hover logged "Cannot read properties of null (reading 'getBoundingClientRect')" (Area 8 run).
 * With no anchor there is nothing to position: skip. Adjustments row
 * `attunement-item-tooltip-anchor` (a patch row, D2). The marker literal `pentarynGuarded` stays
 * the same, so a second install (and a copy wrapped before the migration) is a no-op.
 */
export function guardItemTooltipPosition() {
  const proto = game.dnd5e?.tooltips ? Object.getPrototypeOf(game.dnd5e.tooltips) : null;
  if (typeof proto?._positionItemTooltip !== "function") return;
  tooltipGuard = wrapMethod(MODULE, {
    target: proto,
    label: "Tooltips5e#_positionItemTooltip",
    name: "_positionItemTooltip",
    marker: "pentarynGuarded",
    adjustments: "attunement-item-tooltip-anchor",
  }, function (wrapped, ...args) {
    if (tooltipAnchorMissing({ element: game.tooltip?.element, tooltip: this.tooltip })) return;
    return wrapped(...args);
  });
}

/**
 * Whether dnd5e's item-tooltip positioning carries the guard: true/false, or null when this dnd5e
 * has no item tooltips to guard (selftest).
 */
export function tooltipGuarded() {
  const proto = game.dnd5e?.tooltips ? Object.getPrototypeOf(game.dnd5e.tooltips) : null;
  if (typeof proto?._positionItemTooltip !== "function") return null;
  return proto._positionItemTooltip.pentarynGuarded === true;
}

/** Undo the tooltip guard (uninstall). */
export function unguardItemTooltipPosition() {
  tooltipGuard?.unwrap();
  tooltipGuard = null;
}
