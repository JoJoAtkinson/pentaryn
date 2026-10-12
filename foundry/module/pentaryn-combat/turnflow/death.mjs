/**
 * Damage at 0 HP (feature; setting deathSaveDamage): a Death Saving Throw failure (two on a crit),
 * with a chat line; massive damage is whispered to the GM. A synchronous listener on a vetoable
 * hook that never vetoes: it only adds to dnd5e's `updates`.
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";

const log = makeLog(MODULE);

/* ── damage at 0 HP ──────────────────────────────────────────────────────── */

const onPreApplyDamage = (actor, amount, updates, options) => {
  try {
    if (!setting("deathSaveDamage") || actor?.type !== "character") return;
    const hp = actor.system?.attributes?.hp;
    const death = actor.system?.attributes?.death;
    if (!hp || !death) return;
    const origin = options?.originatingMessage;
    const critical = !!origin?.rolls?.some?.(r => r?.isCritical || r?.options?.isCritical);
    const r = core.damageAtZero({ isCharacter: true, hp: hp.value, temp: hp.temp, max: hp.effectiveMax ?? hp.max, amount, failures: death.failure, critical });
    if (r.failures !== null) {
      updates["system.attributes.death.failure"] = r.failures;
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>${_loc(critical ? "PENTARYN_COMBAT.Turn.DeathFailCrit" : "PENTARYN_COMBAT.Turn.DeathFail", { name: actor.name, n: r.failures })}</p>`
      }).catch(err => log.debug("death save card", err));
    }
    if (r.massive) {
      ChatMessage.create({
        content: `<p>${_loc("PENTARYN_COMBAT.Turn.Massive", { name: actor.name, amount, max: hp.effectiveMax ?? hp.max })}</p>`,
        whisper: game.users.filter(u => u.isGM).map(u => u.id)
      }).catch(err => log.debug("massive damage whisper", err));
    }
  } catch (err) { log.warn("damage at 0 HP", err); }
};

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ label });   // guarded (S11, D-c1): a throw is logged with the label; return values pass through

export function install(reg) {
  reg.on("dnd5e.preApplyDamage", onPreApplyDamage, opts("damage at 0 HP"));
}

export function uninstall() {}
