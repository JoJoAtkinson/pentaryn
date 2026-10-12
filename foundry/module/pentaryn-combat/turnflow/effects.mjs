/**
 * Self-only effects switch on when used, and Steady Aim (feature; settings selfEffects, steadyAim).
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";
import { combatContext } from "../shapes.mjs";

const log = makeLog(MODULE);

/* ── self-only effects switch on when used (setting selfEffects) ─────────── */
// Area 3 (D1): Rage was 3 clicks: the button, the usage dialog, then Apply on its chat card to switch
// the Rage effect on. A feature that affects only its user and has exactly one effect now applies it
// through dnd5e's own effect tray code (EffectApplicationElement#_applyEffectToActor, the same as the
// Apply button), so duration, origin and scaling are dnd5e's.

async function applySelfEffect(activity, results) {
  if (!setting("selfEffects")) return;
  const actor = activity?.actor;
  const message = results?.message;
  if (!actor?.isOwner || !message?.id || activity.target?.affects?.type !== "self") return;
  const profiles = activity.applicableEffects ?? [];
  if (profiles.length !== 1) return;
  // dnd5e 6: a profile's `effect` getter is deprecated ("Activity effects should now be accessed
  // using getEffect()", logged on every Rage); getEffect() may return a Promise.
  const effect = await (typeof profiles[0]?.getEffect === "function" ? profiles[0].getEffect() : profiles[0]?.effect);
  if (!effect) return;
  // Already on from this source (the player clicked Apply first, or a second use): leave it.
  const live = actor.effects.find(e => (e._stats?.duplicateSource === effect.uuid || e._stats?.compendiumSource === effect.uuid) && !e.disabled);
  if (live) return;
  const Tray = customElements.get("effect-application");
  if (!Tray?.prototype?._applyEffectToActor) return;
  const tray = document.createElement("effect-application");
  tray.chatMessage = game.messages.get(message.id) ?? message;
  tray.effects = [effect];
  await tray._applyEffectToActor(effect, actor);
}

/* ── Steady Aim (setting steadyAim) ──────────────────────────────────────── */
// Area 3 (B1): Steady Aim posted a card and nothing else; the player had to remember to click
// Advantage. Now it adds a "Steady Aim" effect (PHB 2024): every ability's attack roll mode +1 (the
// roll window opens on Advantage) and Speed 0. It goes after the next attack roll, and at the end of
// the turn (the turn-end sweep, `until: "turnEnd"`).

const isSteadyAim = (e) => e?.getFlag?.(MODULE, "special") === "steady-aim";

async function steadyAim(activity) {
  if (!setting("steadyAim")) return;
  const actor = activity?.actor;
  const item = activity?.item;
  const ident = item?.system?.identifier || core.slugify(item?.name ?? "");
  if (!actor?.isOwner || ident !== "steady-aim" || actor.effects.some(isSteadyAim)) return;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: _loc("PENTARYN_COMBAT.Turn.SteadyAim"),
    img: item.img || "icons/svg/target.svg",
    description: `<p>${_loc("PENTARYN_COMBAT.Turn.SteadyAimText")}</p>`,
    transfer: false,
    origin: item.uuid,
    system: { changes: core.steadyAimChanges() },
    flags: { [MODULE]: { until: "turnEnd", special: "steady-aim" }, dnd5e: { isTemporary: true } }
  }]);
  ui.notifications.info(_loc("PENTARYN_COMBAT.Turn.SteadyAimOn"));
}

const onUsed = (activity, usageConfig, results) => {
  applySelfEffect(activity, results).catch(err => log.warn("self effect", err));
  steadyAim(activity).catch(err => log.warn("Steady Aim", err));
};

// The attack Steady Aim was for has been rolled: the Advantage is used; Speed 0 lasts to the turn's end.
const onAttackRolled = (rolls, { subject } = {}) => {
  const actor = subject?.actor;
  if (!actor?.isOwner || !rolls?.length) return;
  const inCombat = combatContext(actor).inCombat;
  for (const e of actor.effects.filter(isSteadyAim)) {
    const left = core.steadyAimAfterAttack(e.system?.changes ?? [], { inCombat });
    const done = left ? (left.length === e.system.changes.length ? null : e.update({ "system.changes": left.map(c => ({ key: c.key, type: c.type ?? "override", value: c.value })) })) : e.delete();
    done?.catch?.(err => log.warn("Steady Aim end", err));
  }
};

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ guard: false, label });

export function install(reg) {
  reg.on("dnd5e.postUseActivity", onUsed, opts("self effect, Steady Aim"));
  reg.on("dnd5e.postRollAttack", onAttackRolled, opts("Steady Aim: the attack it was for"));
}

export function uninstall() {}
