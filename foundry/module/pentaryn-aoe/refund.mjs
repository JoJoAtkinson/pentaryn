/**
 * Part F — a cancelled area placement gives back what it spent (usability Area 5 re-run, S2/S10).
 *
 * dnd5e 6 consumes the slot, charges or uses BEFORE the area follows the mouse
 * (Activity#use: consume → concentration → usage card → _finalizeUsage places the area), so
 * Escape or right-click during placement still cost the Fireball's 3rd-level slot or a Wand of
 * Fireballs charge; the card only offered an icon-only Refund button. Now, on the caster's client,
 * `dnd5e.postUseActivity` sees an activity that wanted an area, placed none although placing was
 * possible, and spent something: it refunds through dnd5e's own `Activity#refund(deltas)` (what the
 * card's Refund button runs), ends the concentration this cast began, and deletes the usage card.
 * Returning false stops dnd5e's subsequent actions and later postUseActivity handlers (no pip spent).
 *
 * Not undone: a concentration this cast ENDED (dnd5e ends the old one before placement). Rare, and
 * the old effect cannot be rebuilt faithfully. Setting refundCancelledArea (world, default on).
 * Adjustment row dnd5e-cancelled-area-refund.
 */

import { MODULE, placementCancelled } from "./core.mjs";
import { setting } from "./settings.mjs";


function hasConsumed(deltas) {
  if (!deltas) return false;
  if ((deltas.actor ?? []).length) return true;
  if ((deltas.created ?? []).length || (deltas.deleted ?? []).length) return true;
  return Object.values(deltas.item ?? {}).some(list => (list ?? []).length);
}

async function refund(activity, usageConfig, results) {
  const message = results?.message instanceof ChatMessage ? results.message : null;
  const deltas = message?.system?.deltas ?? null;
  const cancelled = placementCancelled({
    wanted: !!usageConfig?.create?.measuredTemplate && !!activity?.target?.template?.type,
    placed: results?.templates?.length ?? 0,
    canPlace: !!canvas?.scene && !!game.user?.can?.("REGION_CREATE"),
    consumed: hasConsumed(deltas)
  });
  if (!cancelled) return false;
  await activity.refund(deltas);
  // The concentration this cast began goes too (its effect id is on the card).
  const began = (results.effects ?? []).filter(e => e?.parent === activity.actor && e.statuses?.has?.(CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating"));
  for (const e of began) if (activity.actor.effects.has(e.id)) await e.delete().catch(() => null);
  if (game.messages.has(message.id)) await message.delete().catch(() => message.update({ "system.deltas": null }).catch(() => null));
  ui.notifications?.info?.(_loc("PENTARYN_AOE.Refund.Done", { item: activity.item?.name ?? "" }));
  return true;
}

export function install(reg) {
  // Synchronous handler: Hooks.call honours a literal false only. We cannot know synchronously whether
  // the refund will run, so the check runs first, the refund after.
  reg.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
    try {
      if (!setting("refundCancelledArea")) return;
      if (!usageConfig?.create?.measuredTemplate || (results?.templates?.length ?? 0) > 0) return;
      const message = results?.message;
      if (!(message instanceof ChatMessage) || !message.isOwner) return;
      if (!hasConsumed(message.system?.deltas) && !(results.effects ?? []).length) return;
      if (!activity?.target?.template?.type || !canvas?.scene || !game.user?.can?.("REGION_CREATE")) return;
      refund(activity, usageConfig, results).catch(err => console.error(`${MODULE} | refund cancelled area`, err));
      return false;
    } catch (err) {
      console.error(`${MODULE} | refund cancelled area`, err);
    }
  }, { guard: false, label: "postUseActivity(refund)" });
}

export function uninstall() {}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { refund, hasConsumed };
