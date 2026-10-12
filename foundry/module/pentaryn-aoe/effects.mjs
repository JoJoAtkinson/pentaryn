/**
 * Part D — a spell's effects land on you when you are the one it's for.
 *
 * dnd5e puts an Effects tray at the bottom of a usage card and applies nothing until someone
 * clicks in it. At the 2026-10-08 table a player cast Mage Armor targeting himself and his AC never
 * changed: nothing said the effect was still waiting. This file:
 *
 *  - auto-applies a usage card's one effect to the caster when the card's only target is the caster,
 *    or the activity can only affect its user (Shield), or (setting untargetedSelf) a touch spell for
 *    one willing creature was cast with nothing targeted (Mage Armor, usability Area 6 re-run W1).
 *    The same spell's effect from another source is replaced, not stacked (setting noSpellStacking). A card with several effects is a choice
 *    (Guidance's skills) and is left in the tray. The active GM's client does the write, so a
 *    player who can't write still gets it; with no GM online, the casting client does it itself.
 *  - records what was applied on the message (flags.pentaryn-aoe.effectsApplied), and adds a
 *    one-line "Applied to Caven: Mage Armor" note to the card;
 *  - highlights an Effects tray that still has effects nobody has applied, until someone applies
 *    them (dnd5e's own Apply button is noticed and recorded too).
 *
 * Applying IS dnd5e 6's tray: the data comes from EffectApplicationElement#_prepareEffectData on a
 * detached <effect-application> bound to the card (system.origin, dependentOn/scaling/spellLevel,
 * the activity's replacement values and auto-duration, _stats.duplicateSource — or compendiumSource
 * for a dnd5e.effects pack effect). An effect already on the actor from that source is refreshed,
 * not duplicated, so a later press of the tray's own Apply refreshes the same effect.
 */

import { MODULE, aoeFlags, selfApplyReason, pendingEffects, sameSpellEffect } from "./core.mjs";
import { setting } from "./settings.mjs";
import { on, guard, claimMessage } from "./hooks.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Cards older than this are settled: last session's log never lights up. */
const HIGHLIGHT_MAX_AGE = 60 * 60 * 1000;
/** Let dnd5e's own apply loop finish before the flag write re-renders the card. */
const MARK_DELAY = 1200;
/** How long a fresh self-cast card waits for the auto-apply before it may light up. */
const AUTO_GRACE = 15 * 1000;

const inflight = new Set();          // message ids being auto-applied on this client
const localApplied = new Map();      // message id → Set(effect ids) applied from this client

/* -------------------------------------------- */
/*  Reading a usage card                        */
/* -------------------------------------------- */

/**
 * The card's applicable effects (enchantments excluded). dnd5e 6 stores them as uuids that are
 * either relative to the item (.ActiveEffect.<id>) or point into the dnd5e.effects compendium;
 * message.system.getEffects() resolves both, falling back to the item snapshot of a consumed item.
 */
export async function cardEffects(message) {
  if (message?.type !== "usage" || !message.system?.effects?.length) return [];
  const effects = (await message.system.getEffects?.()) ?? [];
  return effects.filter(e => e && e.type !== "enchantment");
}

/** The actors a usage card targeted: dnd5e 6 records { actor, token } uuids (migrated cards only the actor). */
function targetActors(message) {
  return (message.system?.targets ?? []).map(tg => {
    const token = tg?.token ? fromUuidSync(tg.token, { strict: false }) : null;
    return token?.actor ?? (tg?.actor ? fromUuidSync(tg.actor, { strict: false }) : null);
  }).filter(a => a?.effects);
}

/** Is `applied` (on an actor) a copy of the card effect `effect`? dnd5e 6 links them by source, not origin. */
const copiedFrom = (applied, effect) => applied._stats?.duplicateSource === effect.uuid
  || applied._stats?.compendiumSource === effect.uuid;

function appliedIds(message) {
  const flagged = aoeFlags(message).effectsApplied?.ids ?? [];
  return [...new Set([...flagged, ...(localApplied.get(message.id) ?? [])])];
}

/**
 * Effect ids on the card still waiting. Applied = recorded on the message, or already on every
 * creature the card targeted (covers a GM who applied it some other way).
 */
export async function pendingFor(message) {
  // A settled card never lights up (pendingEffects says so too); answer before resolving its
  // effects, which on dnd5e 6 is an async fromUuid per card (a pack fetch for dnd5e.effects).
  if (Date.now() - (message?.timestamp ?? 0) > HIGHLIGHT_MAX_AGE) return [];
  const effects = await cardEffects(message);
  if (!effects.length) return [];
  const applied = new Set(appliedIds(message));
  const targets = targetActors(message);
  if (targets.length) {
    for (const e of effects) {
      if (targets.every(a => a.effects.some(x => copiedFrom(x, e) && !x.disabled))) applied.add(e.id);
    }
  }
  return pendingEffects(effects.map(e => e.id), [...applied],
    { ageMs: Date.now() - (message.timestamp ?? 0), maxAgeMs: HIGHLIGHT_MAX_AGE });
}

/* -------------------------------------------- */
/*  Applying                                    */
/* -------------------------------------------- */

/**
 * One effect onto one actor, exactly as dnd5e's tray does it (refresh, never duplicate): the data
 * comes from the tray's own _prepareEffectData on a detached <effect-application> bound to the card.
 */
async function applyEffect(message, effect, actor) {
  const Tray = customElements.get("effect-application");
  if (!Tray?.prototype?._prepareEffectData) throw new Error("dnd5e <effect-application> is not available");
  const tray = new Tray();
  tray.chatMessage = message;
  const { action, data } = await tray._prepareEffectData(effect, actor);
  if (action === "update") return actor.effects.get(data._id)?.update(data);
  return ActiveEffect.implementation.create(data, { parent: actor });
}

/**
 * The same spell from another source (Shield from a slot, then from a Ring of Spell Storing) is
 * replaced, not stacked (setting noSpellStacking; usability Area 6 re-run W2). dnd5e refreshes only
 * an effect copied from the same source effect, and three paths copy a card's effect onto an actor
 * (this file, pentaryn-combat's self effects, the tray's Apply), so this sits on the creation
 * itself: a new effect copied from a spell's effect removes an enabled one of the same name copied
 * from the same spell. Runs on the creating client only (preCreate).
 */
function onPreCreateEffect(effect) {
  if (!setting("noSpellStacking")) return;
  const actor = effect?.parent;
  if (actor?.documentName !== "Actor" || !effect._stats?.duplicateSource) return;
  const spell = spellOf(effect);
  if (!spell) return;
  const old = sameSpellEffect({ name: effect.name, spell },
    actor.effects.filter(e => e.id !== effect.id).map(e => ({ id: e.id, name: e.name, disabled: e.disabled, spell: spellOf(e) })));
  if (old) actor.effects.get(old)?.delete().catch(err => console.warn(`${MODULE} | replace ${effect.name}`, err));
}

/** The spell identifier an applied effect came from (its source effect's item, else its origin). */
function spellOf(effect) {
  for (const uuid of [effect._stats?.duplicateSource, effect.origin]) {
    if (!uuid) continue;
    let doc = null;
    try { doc = fromUuidSync(uuid, { strict: false }); } catch { doc = null; }
    const item = doc?.documentName === "Item" ? doc : doc?.parent?.documentName === "Item" ? doc.parent : null;
    if (item?.type === "spell") return item.system?.identifier || item.name;
  }
  return null;
}

/** Record applied effect ids on the message (if this user may), and locally either way. */
async function markApplied(message, ids, extra = {}) {
  const live = game.messages.get(message.id) ?? message;
  const prev = aoeFlags(live).effectsApplied ?? {};
  const all = [...new Set([...(prev.ids ?? []), ...ids])];
  localApplied.set(live.id, new Set([...(localApplied.get(live.id) ?? []), ...ids]));
  if (!live.canUserModify(game.user, "update")) return;
  await live.update({ [`flags.${MODULE}.effectsApplied`]: { ...prev, ...extra, ids: all } });
}

/** Why this card's effects belong on its caster (core.selfApplyReason), or null. */
async function selfReason(message, effects = null) {
  effects ??= await cardEffects(message);
  const caster = message.getAssociatedActor?.();
  if (!caster || !effects.length) return null;
  const activity = message.getAssociatedActivity?.();
  return selfApplyReason({
    casterUuid: caster.uuid,
    targetUuids: (message.system?.targets ?? []).map(targetActorUuid),
    affectsType: activity?.target?.affects?.type ?? null,
    activityType: activity?.type ?? message.system?.activity?.type ?? null,
    effectCount: effects.length,
    rangeUnits: activity?.range?.units ?? null,
    untargeted: !!setting("untargetedSelf")
  });
}

/** A recorded target's actor uuid (the token's actor when the token still exists, else the stored actor). */
function targetActorUuid(tg) {
  const token = tg?.token ? fromUuidSync(tg.token, { strict: false }) : null;
  return token?.actor?.uuid ?? tg?.actor ?? null;
}

/** Is this client the one that writes for a card made by `userId`? */
function isApplier(userId) {
  const gm = game.users.activeGM;
  if (gm) return gm.isSelf;
  return userId === game.user.id;
}

/**
 * Apply a card's effects to its caster if the card is meant for them. Returns the reason and
 * what was applied, or null. Safe to call twice: a recorded card is skipped.
 * @param {ChatMessage} message
 * @param {{force?: boolean}} [opts]  force ignores the setting (manual use from the console)
 */
export async function selfApply(message, { force = false } = {}) {
  if (!message || (!force && !setting("autoApplySelf"))) return null;
  if (aoeFlags(message).effectsApplied?.auto || inflight.has(message.id)) return null;
  inflight.add(message.id);
  try {
    const effects = await cardEffects(message);
    if (!effects.length) return null;
    const caster = message.getAssociatedActor?.();
    if (!caster || !(game.user.isGM || caster.isOwner)) return null;
    const reason = await selfReason(message, effects);
    if (!reason) return null;
    // Two sessions on the GM account are both the applier: one of them applies.
    if (!force && !(await claimMessage(message, "selfApply"))) return null;
    if (!force && aoeFlags(game.messages.get(message.id)).effectsApplied?.auto) return null;
    const applied = [];
    for (const effect of effects) {
      try {
        await applyEffect(message, effect, caster);
        applied.push(effect);
      } catch (err) {
        console.warn(`${MODULE} | self-apply ${effect.name} → ${caster.name}`, err);
      }
    }
    if (!applied.length) return null;
    // The card line is public: name the caster as the card's header does (the token name, which
    // may hide the actor's full name), and an unidentified item by its unidentified name, not by
    // the effect that would give it away ("Flyer" off an unidentified potion).
    const item = message.getAssociatedItem?.();
    await markApplied(message, applied.map(e => e.id), {
      auto: true, reason, actor: caster.uuid, actorName: message.speaker?.alias || caster.name,
      names: item?.system?.identified === false ? [item.name] : applied.map(e => e.name)
    });
    return { reason, actor: caster.uuid, effects: applied.map(e => e.id) };
  } finally {
    inflight.delete(message.id);
  }
}

/* -------------------------------------------- */
/*  The card                                    */
/* -------------------------------------------- */

function decorate(message, html) {
  if (message?.type !== "usage") return;
  const flag = aoeFlags(message).effectsApplied;

  // "Applied to Caven: Mage Armor" — the visible answer to "did it go on?"
  if (flag?.auto && flag.actorName && !html.querySelector(".pentaryn-aoe-applied")) {
    const p = document.createElement("p");
    p.className = "pentaryn-aoe-applied";
    p.innerHTML = `<i class="fa-solid fa-wand-sparkles" inert></i> ${esc(_loc("PENTARYN_AOE.Effects.AutoApplied", {
      actor: flag.actorName, effects: (flag.names ?? []).join(", ")
    }))}`;
    (html.querySelector(".chat-card") ?? html).append(p);
  }

  const tray = html.querySelector("effect-application");
  if (!tray || tray.dataset.pentarynAoe) return;
  tray.dataset.pentarynAoe = "1";

  const light = async msg => {
    if (!(await pendingFor(msg)).length) return;
    tray.classList.add("pentaryn-aoe-unapplied");
    tray.style.setProperty("--pentaryn-aoe-unapplied", JSON.stringify(_loc("PENTARYN_AOE.Effects.Unapplied")));
  };
  const warn = err => console.warn(`${MODULE} | highlight`, err);

  // A fresh card that is about to be auto-applied is not "waiting": skip the flash before the
  // GM's write lands and re-renders it. If that write never lands (the apply failed), look again
  // once the grace is over, so a failed auto-apply still lights up.
  const age = Date.now() - (message.timestamp ?? 0);
  if (setting("highlightUnapplied")) {
    (async () => {
      const autoSoon = setting("autoApplySelf") && !flag?.auto && age < AUTO_GRACE && !!(await selfReason(message));
      if (!autoSoon) return light(message);
      setTimeout(() => {
        const live = game.messages.get(message.id);
        if (live && tray.isConnected && !aoeFlags(live).effectsApplied?.auto) light(live).catch(warn);
      }, AUTO_GRACE - age + 250);
    })().catch(warn);
  }

  // Notice dnd5e's own Apply so the highlight goes and the card remembers. In dnd5e 6 a click on an
  // effect row only selects it (aria-pressed); the Apply button applies the pressed rows to the
  // recorded-targets selection (or the controlled tokens). Only counts when it had someone to go on.
  // Capture phase: the tray's .collapsible header handler calls stopImmediatePropagation.
  tray.addEventListener("click", ev => {
    const button = ev.target?.closest?.(".apply-button");
    if (!button || !tray.contains(button)) return;
    const ids = [...tray.querySelectorAll(".effect[data-uuid]")]
      .filter(li => li.querySelector('button[aria-pressed="true"]')).map(li => li.dataset.id).filter(Boolean);
    if (!ids.length || !applyTargets(tray).length) return;
    localApplied.set(message.id, new Set([...(localApplied.get(message.id) ?? []), ...ids]));
    pendingFor(message).then(p => { if (!p.length) tray.classList.remove("pentaryn-aoe-unapplied"); }).catch(warn);
    setTimeout(() => markApplied(message, ids).catch(err => console.warn(`${MODULE} | mark applied`, err)), MARK_DELAY);
  }, true);
}

/**
 * Who the tray's Apply will act on, as dnd5e 6 decides it (EffectApplicationElement#getTargets):
 * the tray's own or the card's <recorded-targets> selection, else the controlled tokens.
 */
function applyTargets(tray) {
  const recorded = tray.targetList ?? tray.closest("[data-message-id]")?.querySelector("recorded-targets");
  if (recorded) return [...(recorded.targets ?? [])];
  return canvas.tokens?.controlled?.filter(tk => tk.actor) ?? [];
}

/* -------------------------------------------- */
/*  Hook wiring                                 */
/* -------------------------------------------- */

export function installEffects() {
  on("createChatMessage", guard("createChatMessage(selfApply)", async (message, options, userId) => {
    if (!setting("autoApplySelf") || !isApplier(userId)) return;
    await selfApply(message);
  }));
  on("dnd5e.renderChatMessage", guard("renderChatMessage(effects)", decorate));
  on("preCreateActiveEffect", guard("preCreateActiveEffect(noStacking)", onPreCreateEffect));
}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { targetActors, targetActorUuid, appliedIds, applyEffect, onPreCreateEffect, spellOf, markApplied, selfReason, isApplier, decorate, applyTargets, inflight, localApplied };
