/**
 * Pentaryn Feature Riders — FEATURE: the damage and healing riders (B1, B2).
 *
 * `dnd5e.postDamageRollConfiguration` fires on the roller's client after the roll dialog (so the
 * damage type is the final one, crits are already doubled and @references resolved) and before the
 * dice are rolled. The riders edit the real terms there: a die modifier ("min2", "r1") on the dice
 * of the right type, or one `+ N[Feature]` term. The chat card shows both in its formula. The
 * message carries
 *     flags.pentaryn-riders = { applied: [keys], ignoreResistance: [types], origin, detail }
 * (`core.riderFlag`). `origin` is the usage card's id (dnd5e 6 `system.origin`); `applied` is the
 * once-per-casting guard, read back from the earlier damage messages of the same card. The card
 * note (card-note.mjs) and the damage-tray preset (tray-preset.mjs) read that flag.
 */

import * as core from "./riders-core.mjs";
import { MODULE } from "./riders-core.mjs";
import { settingRaw } from "./settings.mjs";
import { carriedBy, featuresOf, isHealing, isType } from "./shapes.mjs";

let log = null;

/** A Foundry roll term → the core's term descriptor (riders-core.mjs "Shapes"). */
function describeTerm(term) {
  const T = foundry.dice.terms;
  if (term instanceof T.Die) return { kind: "die", modifiers: term.modifiers, flavor: term.flavor };
  if (term instanceof T.OperatorTerm) return { kind: "op", operator: term.operator };
  if (term instanceof T.NumericTerm) return { kind: "num", number: term.number, flavor: term.flavor };
  return { kind: "other", flavor: term?.flavor ?? "" };
}

/**
 * The usage card these rolls come from. dnd5e 6 puts it in `system.origin` of the message data:
 * set by the activity when it rolls damage right after use, otherwise from the clicked card in
 * `buildPost` (after this hook), so the clicked element is read here the same way.
 */
function originOf(config, message) {
  const d = message?.data ?? {};
  const o = foundry.utils.getProperty(d, "system.origin") ?? d["system.origin"];
  return (typeof o === "string" ? o : o?.id)
    ?? config?.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId
    ?? null;
}

const usedFrom = origin => core.usedFromMessages(game.messages ?? [], origin);

function applyRiders(rolls, config, message) {
  if (!settingRaw("enabled")) return;
  const activity = config?.subject;
  const item = activity?.item;
  const actor = activity?.actor ?? item?.actor;
  if (!item || !actor || !rolls?.length) return;

  const features = featuresOf(actor);
  if (!features.length) return;

  const descs = rolls.map(r => r.terms.map(describeTerm));
  const rollInfo = rolls.map((r, i) => {
    const types = core.termTypes(descs[i], r.options?.type, isType).filter(Boolean);
    return { type: r.options?.type ?? null, healing: isHealing(r.options?.type), types: [...new Set(types)] };
  });

  const origin = originOf(config, message);
  const plan = core.planRiders({
    features: features.map(f => ({ key: f.key, types: f.types })),
    item: {
      isSpell: item.type === "spell",
      level: item.system?.level,
      classIdentifier: item.system?.classIdentifier ?? "",
      casterClasses: Object.keys(actor.spellcastingClasses ?? {}),
      carries: carriedBy(activity)
    },
    rolls: rollInfo,
    abilities: Object.fromEntries(Object.entries(actor.system?.abilities ?? {}).map(([k, a]) => [k, a?.mod ?? 0])),
    activityType: activity.type,
    usedThisCasting: activity.type === "attack" ? usedFrom(origin) : []
  });
  for (const s of plan.skipped) {
    if (s.why === "no-type") log.warn(`${s.key} on ${actor.name} has no damage type set — game.pentaryn.riders.setType(actor, "fire")`);
  }
  if (!plan.applied.length) return;

  const { OperatorTerm, NumericTerm } = foundry.dice.terms;
  const changed = new Set();
  for (const d of plan.dice) {
    const roll = rolls[d.roll];
    for (const i of core.planDice(descs[d.roll], { rollType: roll.options?.type, types: d.types, isType })) {
      const term = roll.terms[i];
      const next = core.withModifier(term.modifiers, d.modifier);
      if (next) { term.modifiers = next; changed.add(roll); }
    }
  }
  for (const b of plan.bonuses) {
    const roll = rolls[b.roll];
    for (const t of core.bonusTerms(b.value, { label: b.label, type: b.type, rollType: roll.options?.type })) {
      roll.terms.push(t.kind === "op"
        ? new OperatorTerm({ operator: t.operator })
        : new NumericTerm({ number: t.number, options: { flavor: t.flavor } }));
    }
    changed.add(roll);
  }
  for (const r of changed) r.resetFormula();

  // Stamp the message: what was applied (once-per-casting guard, the tray preset, the card note).
  // dnd5e 6 strips the header flavor from item cards, so the note is rendered from this flag.
  message.data ??= {};
  foundry.utils.setProperty(message.data, `flags.${MODULE}`, core.riderFlag(plan, origin));
}

function onRollConfiguration(rolls, config, dialog, message) {
  try { applyRiders(rolls, config, message); } catch (err) { log.warn("riders skipped", err); }
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("dnd5e.postDamageRollConfiguration", onRollConfiguration, { guard: false, label: "damage and healing riders" });
}

/** Nothing to clear: the once-per-casting guard reads the chat log, not a session map. */
export function uninstall() {}
