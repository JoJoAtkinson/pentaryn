/**
 * Part F — a cancelled area placement gives back what it spent (usability Area 5 re-run, S2/S10).
 *
 * dnd5e 6 consumes the slot, charges or uses BEFORE the area follows the mouse
 * (Activity#use: consume → concentration → usage card → _finalizeUsage places the area), so
 * Escape or right-click during placement still cost the Fireball's 3rd-level slot or a Wand of
 * Fireballs charge; the card only offered an icon-only Refund button. Now, on the caster's client,
 * `dnd5e.postUseActivity` sees an activity that wanted an area, placed none although placing was
 * possible, and spent something or began concentration: it refunds any spend through dnd5e's own
 * `Activity#refund(deltas)` (what the card's Refund button runs), ends the concentration this cast
 * began, and deletes the usage card. The veto and the refund share one predicate (aoe-mnt-1).
 * Returning false stops dnd5e's subsequent actions and later postUseActivity handlers (no pip spent).
 *
 * Not undone: a concentration this cast ENDED (dnd5e ends the old one before placement). Rare, and
 * the old effect cannot be rebuilt faithfully. Setting refundCancelledArea (world, default on).
 * Adjustment row dnd5e-cancelled-area-refund.
 */

import { MODULE, placementCancelled, doesNotExist as gone } from "./core.mjs";
import { setting } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";

let log = makeLog(MODULE);   // the entry's ctx.log once installed


function hasConsumed(deltas) {
  if (!deltas) return false;
  if ((deltas.actor ?? []).length) return true;
  if ((deltas.created ?? []).length || (deltas.deleted ?? []).length) return true;
  return Object.values(deltas.item ?? {}).some(list => (list ?? []).length);
}

// The concentration this cast began (its effect is in results.effects).
function begunConcentration(activity, results) {
  const status = CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating";
  return (results?.effects ?? []).filter(e => e?.parent === activity?.actor && e.statuses?.has?.(status));
}

// aoe-mnt-1: the ONE predicate the synchronous veto and refund() share. A cast is cancelled when it
// wanted an area, placed none although placing was possible, and spent something OR began
// concentration. Returns what the clean-up needs, or null.
function cancelledCast(activity, usageConfig, results) {
  const message = results?.message;
  if (!(message instanceof ChatMessage) || !message.isOwner) return null;
  const deltas = message.system?.deltas ?? null;
  const consumed = hasConsumed(deltas);
  const began = begunConcentration(activity, results);
  const cancelled = placementCancelled({
    wanted: !!usageConfig?.create?.measuredTemplate && !!activity?.target?.template?.type,
    placed: results?.templates?.length ?? 0,
    canPlace: !!canvas?.scene && !!game.user?.can?.("REGION_CREATE"),
    consumed: consumed || began.length > 0
  });
  return cancelled ? { message, deltas, consumed, began } : null;
}

async function refund(activity, usageConfig, results) {
  const c = cancelledCast(activity, usageConfig, results);
  if (!c) return false;
  const { message, deltas, consumed, began } = c;
  if (consumed) await activity.refund(deltas);
  // -9: log what the clean-up could not do. If neither the card's delete nor its fallback update
  // lands, the card keeps its Refund button and could be refunded twice.
  for (const e of began) {
    if (activity.actor.effects.has(e.id)) await e.delete().catch(err => (gone(err) ? null : log.warn("refund end concentration", err)));
  }
  if (game.messages.has(message.id)) {
    await message.delete().catch(() => message.update({ "system.deltas": null }).catch(err => log.warn("refund card cleanup", err)));
  }
  const key = consumed ? "PENTARYN_AOE.Refund.Done" : "PENTARYN_AOE.Refund.Ended";
  ui.notifications?.info?.(_loc(key, { item: activity.item?.name ?? "" }));
  return true;
}

export function install(reg, ctx) {
  log = ctx.log;
  // Synchronous handler: Hooks.call honours a literal false only. We cannot know synchronously whether
  // the refund will run, so the check runs first, the refund after.
  reg.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
    try {
      if (!setting("refundCancelledArea")) return;
      if (!cancelledCast(activity, usageConfig, results)) return;
      refund(activity, usageConfig, results).catch(err => log.error("refund cancelled area", err));
      return false;
    } catch (err) {
      log.error("refund cancelled area", err);
    }
  }, { guard: false, label: "postUseActivity(refund)" });
}

export function uninstall() {}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { refund, hasConsumed, cancelledCast };
