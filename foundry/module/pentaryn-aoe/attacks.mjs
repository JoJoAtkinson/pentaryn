/**
 * Part C — "the damage isn't being rolled".
 *
 * Nothing in dnd5e was broken: 5.x and 6.x post the attack roll as its own message (type "attack")
 * and leave the Damage button on the usage card above it, so a player who only clicks Attack never rolls
 * damage. With autoDamageOnHit on, the roller's own client rolls damage straight after a hit
 * (or after any attack whose target AC it can't know), exactly as clicking Damage would.
 * A known miss or a natural 1 rolls nothing. The manual Damage button stays.
 *
 * J1 (feedback fs7q6K, Psionic Lash): a save activity has the same gap — Use posts the card, and the
 * damage waits for a Damage click. With autoDamageOnSave on, using a save activity that has damage
 * and at least one recorded target rolls its damage at once on the user's own client, threaded under
 * the usage card with the card's targets, exactly as the card's Damage button would. Part B then
 * builds the GM tray from those targets. A save spell that places an area is left alone (its damage
 * is rolled once the area is down), and a use with no target posts nothing extra.
 *
 * D2 (feedback ORGqVN, hKDbzi): with dnd5e's attackRollVisibility at hideAC (players know hit or miss,
 * never the AC) a miss still looked like nothing happening. With hitMissLabels on, dnd5e.renderChatMessage
 * on an attack card adds "— Hit" (blue) or "— Miss" (orange) to its title for one target, "Hit" / "Miss"
 * on each target pill for several, and a rendered "Miss — no damage" line when every target was missed —
 * never a new ChatMessage (every client renders; a posted line would come once per client). The damage
 * card after a hit gets a blue title. Render-only, idempotent on a re-render; nothing while the
 * visibility is "none" (core.attackOutcome).
 */

import { RECENT_MESSAGES, attackOutcome, shouldAutoDamage, shouldAutoDamageOnUse } from "./core.mjs";
import { setting, dnd5eAttackVisibility } from "./settings.mjs";
import { activityOf } from "./messages-adapter.mjs";

export async function onPostRollAttack(rolls, { subject } = {}) {
  if (!setting("autoDamageOnHit") || subject?.type !== "attack") return;
  const roll = rolls?.[0];
  if (!roll) return;
  const decision = shouldAutoDamage({
    total: roll.total, target: roll.options?.target, isCritical: roll.isCritical, isFumble: roll.isFumble
  });
  if (!decision || !subject.damage?.parts?.length) return;

  // dnd5e 6: the attack message is the roll's parent (BasicRoll.buildPost sets it); the scan is
  // the fallback for a roll that lost it.
  const attackMsg = (roll.parent?.type === "attack" ? roll.parent : null) ?? game.messages.contents.slice(-10).reverse()
    .find(m => m.type === "attack" && m.system?.activity?.uuid === subject.uuid);
  const attackMode = roll.options?.attackMode ?? attackMsg?.system?.mode ?? undefined;
  const ammoId = roll.options?.ammunition ?? attackMsg?.system?.ammunition;
  const ammunition = ammoId ? subject.actor?.items.get(ammoId) : undefined;
  // Thread the damage roll under the same usage card, as the Damage button would. The live
  // system.origin is the resolved message; the source holds its id.
  const origin = roll.options?.originatingMessage ?? attackMsg?._source?.system?.origin ?? null;
  const message = origin ? { data: { system: { origin } } } : {};
  return subject.rollDamage({ attackMode, ammunition, isCritical: roll.isCritical }, { configure: false }, message);
}

/** The targets the usage card recorded (dnd5e 6 `system.targets`; the data form when the card was not created). */
const usageTargets = results => results?.message?.system?.targets ?? results?.message?.data?.system?.targets ?? [];

/**
 * J1: dnd5e.postUseActivity on the using client. Returns nothing (never a veto); refund's own
 * listener (Part F) is the one that may return false for a cancelled area, and an area activity is
 * skipped here anyway.
 */
export async function onPostUseActivity(activity, usageConfig, results) {
  if (!setting("autoDamageOnSave") || !activity) return;
  const targets = usageTargets(results);
  const go = shouldAutoDamageOnUse({
    type: activity.type, damageParts: activity.damage?.parts?.length ?? 0, targets: targets.length,
    template: activity.target?.template?.type ?? null
  });
  if (!go) return;
  // The usage card's id threads the damage under it, as the card's Damage button does (SaveActivity
  // #rollDamage passes the card's targets the same way), so Part B and dnd5e's outcomes agree.
  const origin = results?.message?.id ?? null;
  const message = { data: { system: { ...(origin ? { origin } : {}), targets } } };
  return activity.rollDamage({ event: usageConfig?.event }, { configure: false }, message);
}

/* -------------------------------------------- */
/*  D2: Hit / Miss on the card                  */
/* -------------------------------------------- */

const LABELS = [".pa-hit-label", ".pa-miss-line", ".pa-pill-result"];

/** Does this viewer get to know hit or miss on this card? dnd5e's rule, with "none" meaning nobody. */
function resultVisible(message) {
  if (!setting("hitMissLabels") || dnd5eAttackVisibility() === "none") return false;
  return message?.isContentVisible !== false;
}

/** The card's evaluated targets: dnd5e's own getter, else read back from the rendered pills. */
function evaluatedTargets(message, html) {
  const own = message?.system?.evaluatedTargets;
  if (Array.isArray(own)) return own;
  return [...(html?.querySelectorAll?.("target-pill") ?? [])]
    .filter(p => p.hasAttribute?.("data-hit") || p.hasAttribute?.("data-miss"))
    .map(p => ({ isMiss: p.hasAttribute("data-miss") }));
}

/** The title element of a dnd5e roll card: the header's subtitle, else its title. */
const titleOf = html => html?.querySelector?.(".card-header .subtitle") ?? html?.querySelector?.(".card-header .title") ?? null;

function span(cls, text) {
  const el = document.createElement("span");
  el.className = cls;
  el.textContent = text;
  return el;
}

/** D2 on an attack card. Re-rendering replaces the labels instead of adding a second set. */
function decorateAttack(message, html) {
  for (const sel of LABELS) for (const old of html.querySelectorAll(sel)) old.remove();
  const out = attackOutcome({ targets: evaluatedTargets(message, html), visible: resultVisible(message) });
  if (!out) return null;
  const title = titleOf(html);
  if (out.title && title) {
    const hit = out.title === "hit";
    title.append(span(`pa-hit-label ${hit ? "pa-hit" : "pa-miss"}`, ` ${_loc(hit ? "PENTARYN_AOE.Attack.TitleHit" : "PENTARYN_AOE.Attack.TitleMiss")}`));
  }
  if (out.pills) {
    for (const pill of html.querySelectorAll("target-pill")) {
      const miss = pill.hasAttribute("data-miss");
      if (!miss && !pill.hasAttribute("data-hit")) continue;
      pill.append(span(`pa-pill-result ${miss ? "pa-miss" : "pa-hit"}`, _loc(miss ? "PENTARYN_AOE.Attack.Miss" : "PENTARYN_AOE.Attack.Hit")));
    }
  }
  if (out.missLine) {
    const line = document.createElement("p");
    line.className = "pa-miss-line pa-miss";
    line.textContent = _loc("PENTARYN_AOE.Attack.MissLine");
    (html.querySelector(".message-content") ?? html).append(line);
  }
  return out;
}

/**
 * The attack card a damage card follows: the newest attack card of the same activity posted before it,
 * among the last few messages. null when there is none.
 */
function attackBefore(message) {
  const uuid = message?.system?.activity?.uuid ?? activityOf(message)?.uuid ?? null;
  if (!uuid) return null;
  const at = message.timestamp ?? Infinity;
  const recent = game.messages.contents.slice(-RECENT_MESSAGES);
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m.id === message.id || m.type !== "attack" || (m.timestamp ?? 0) > at) continue;
    if ((m.system?.activity?.uuid ?? null) === uuid) return m;
  }
  return null;
}

/** D2 on a damage card: a blue title when the attack it follows hit (any target). */
function decorateDamage(message, html) {
  for (const old of html.querySelectorAll(".pa-hit-title")) old.classList.remove("pa-hit-title");
  if (!resultVisible(message)) return null;
  const attack = attackBefore(message);
  if (!attack) return null;
  const out = attackOutcome({ targets: evaluatedTargets(attack, null), visible: resultVisible(attack) });
  const title = titleOf(html);
  if (out?.hit && title) title.classList.add("pa-hit-title");
  return out;
}

/** dnd5e.renderChatMessage: every client, its own render. */
export function onRenderChatMessage(message, html) {
  if (!html?.querySelector) return null;
  if (message?.type === "attack") return decorateAttack(message, html);
  if (message?.type === "damage") return decorateDamage(message, html);
  return null;
}

export function install(reg) {
  reg.on("dnd5e.renderChatMessage", reg.guardSwallowAsync("renderChatMessage(hit-miss)", onRenderChatMessage), { guard: false, label: "renderChatMessage(hit-miss)" });
  reg.on("dnd5e.postRollAttack", reg.guardSwallowAsync("postRollAttack", onPostRollAttack), { guard: false, label: "postRollAttack" });
  reg.on("dnd5e.postUseActivity", reg.guardSwallowAsync("postUseActivity(save)", onPostUseActivity), { guard: false, label: "postUseActivity(save)" });
}

export function uninstall() {}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only. Not part of the API.
export const _internals = { decorateAttack, decorateDamage, attackBefore, evaluatedTargets, resultVisible };
