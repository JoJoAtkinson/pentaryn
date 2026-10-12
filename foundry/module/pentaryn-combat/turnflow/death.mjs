/**
 * Damage at 0 HP (feature; setting deathSaveDamage): a Death Saving Throw failure (two on a crit),
 * with a chat line; massive damage is whispered to the GM. The failure is worked out in a synchronous
 * listener on the vetoable dnd5e.preApplyDamage (it never vetoes, it only adds to dnd5e's `updates`)
 * and stashed on the damage `options`; the cards post from dnd5e.applyDamage, after the damage
 * landed, so a later veto leaves no card (ac-6).
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";
import { opts } from "../context.mjs";

const log = makeLog(MODULE);

/* ── damage at 0 HP ──────────────────────────────────────────────────────── */

const onPreApplyDamage = (actor, amount, updates, options) => {
  try {
    if (options) delete options[MODULE];   // a reused options object never carries an earlier stash
    if (!setting("deathSaveDamage") || actor?.type !== "character") return;
    const hp = actor.system?.attributes?.hp;
    const death = actor.system?.attributes?.death;
    if (!hp || !death) return;
    const origin = options?.originatingMessage;
    const critical = !!origin?.rolls?.some?.(r => r?.isCritical || r?.options?.isCritical);
    const max = hp.effectiveMax ?? hp.max;
    const r = core.damageAtZero({ isCharacter: true, hp: hp.value, temp: hp.temp, max, amount, failures: death.failure, critical });
    if (r.failures !== null) updates["system.attributes.death.failure"] = r.failures;
    if ((r.failures !== null || r.massive) && options) {
      options[MODULE] = { actor: actor.uuid, failures: r.failures, critical, massive: !!r.massive, amount, max };
    }
  } catch (err) { log.warn("damage at 0 HP", err); }
};

const onApplyDamage = (actor, _amount, options) => {
  const stash = options?.[MODULE];
  if (!stash) return;
  delete options[MODULE];   // one card per application
  if (stash.actor !== actor?.uuid) return;
  const { failures, critical, massive, amount, max } = stash;
  if (failures !== null) {
    const token = actor.token ?? actor.getActiveTokens?.()[0]?.document ?? null;
    const speaker = ChatMessage.getSpeaker(token ? { token } : { actor });
    ChatMessage.create({
      speaker,
      content: `<p>${_loc(critical ? "PENTARYN_COMBAT.Turn.DeathFailCrit" : "PENTARYN_COMBAT.Turn.DeathFail", { name: speaker.alias ?? actor.name, n: failures })}</p>`
    }).catch(err => log.debug("death save card", err));
  }
  if (massive) {
    ChatMessage.create({
      content: `<p>${_loc("PENTARYN_COMBAT.Turn.Massive", { name: actor.name, amount, max })}</p>`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    }).catch(err => log.debug("massive damage whisper", err));
  }
};

/* ── install ─────────────────────────────────────────────────────────────── */

export function install(reg) {
  reg.on("dnd5e.preApplyDamage", onPreApplyDamage, opts("damage at 0 HP"));
  reg.on("dnd5e.applyDamage", onApplyDamage, opts("damage at 0 HP: cards"));
}

export function uninstall() {}
