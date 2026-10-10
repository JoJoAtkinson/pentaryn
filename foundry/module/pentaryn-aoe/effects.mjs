/**
 * Part D — a spell's effects land on you when you are the one it's for.
 *
 * dnd5e puts an Effects tray at the bottom of a usage card and applies nothing until someone
 * clicks in it. At the 2026-10-08 table a player cast Mage Armor targeting himself and his AC never
 * changed: nothing said the effect was still waiting. This file:
 *
 *  - auto-applies a usage card's one effect to the caster when the card's only target is the caster,
 *    or the activity can only affect its user (Shield). A card with several effects is a choice
 *    (Guidance's skills) and is left in the tray. The active GM's client does the write, so a
 *    player who can't write still gets it; with no GM online, the casting client does it itself.
 *  - records what was applied on the message (flags.pentaryn-aoe.effectsApplied), and adds a
 *    one-line "Applied to Caven: Mage Armor" note to the card;
 *  - highlights an Effects tray that still has effects nobody has applied, until someone applies
 *    them (dnd5e's own apply click is noticed and recorded too).
 *
 * Applying mirrors dnd5e 5.3.3 EffectApplicationElement#_applyEffectToActor: same origin (the
 * concentration effect when there is one), same dependentOn/scaling flags, and an effect already on
 * the actor from that origin is refreshed rather than duplicated. So a later click on the tray's own
 * apply button refreshes the same effect instead of stacking a second one.
 */

import { MODULE, aoeFlags, selfApplyReason, pendingEffects } from "./core.mjs";
import { setting } from "./settings.mjs";
import { on, guard } from "./hooks.mjs";

const t = (key, data) => (data ? game.i18n.format(`PENTARYN_AOE.${key}`, data) : game.i18n.localize(`PENTARYN_AOE.${key}`));
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

/** The card's applicable effects as documents on its item (enchantments excluded). */
export function cardEffects(message) {
  if (message?.type !== "usage") return [];
  const refs = message.system?.effects ?? [];
  if (!refs.length) return [];
  const item = message.getAssociatedItem?.();
  if (!item?.effects) return [];
  return refs.map(ref => item.effects.get(String(ref).split(".").pop()))
    .filter(e => e && e.type !== "enchantment");
}

function concentrationOf(message) {
  const id = message.system?.concentration;
  return id ? message.getAssociatedActor?.()?.effects.get(id) ?? null : null;
}

/** What dnd5e uses as the applied effect's origin: the concentration effect, else the item effect. */
function originFor(message, effect) {
  return concentrationOf(message) ?? effect;
}

function appliedIds(message) {
  const flagged = aoeFlags(message).effectsApplied?.ids ?? [];
  return [...new Set([...flagged, ...(localApplied.get(message.id) ?? [])])];
}

/**
 * Effect ids on the card still waiting. Applied = recorded on the message, or already on every
 * creature the card targeted (covers a GM who applied it some other way).
 */
export function pendingFor(message) {
  const effects = cardEffects(message);
  if (!effects.length) return [];
  const applied = new Set(appliedIds(message));
  const targets = (message.flags?.dnd5e?.targets ?? []).filter(d => d?.uuid)
    .map(d => fromUuidSync(d.uuid, { strict: false })).filter(a => a?.effects);
  if (targets.length) {
    for (const e of effects) {
      const origin = originFor(message, e).uuid;
      if (targets.every(a => a.effects.some(x => x.origin === origin && !x.disabled))) applied.add(e.id);
    }
  }
  return pendingEffects(effects.map(e => e.id), [...applied],
    { ageMs: Date.now() - (message.timestamp ?? 0), maxAgeMs: HIGHLIGHT_MAX_AGE });
}

/* -------------------------------------------- */
/*  Applying                                    */
/* -------------------------------------------- */

/** One effect onto one actor, the way dnd5e's tray does it (refresh, never duplicate). */
async function applyEffect(message, effect, actor) {
  const origin = originFor(message, effect);
  const flags = { flags: { dnd5e: {
    dependentOn: origin.uuid,
    scaling: message.system?.scaling,
    spellLevel: message.system?.spellLevel
  } } };
  // dnd5e matches on origin alone; the name check keeps two effects under one concentration
  // from collapsing into one. A later tray click still finds one of them and only refreshes it.
  const existing = actor.effects.find(e => e.origin === origin.uuid && (origin === effect || e.name === effect.name));
  if (existing) {
    await existing.update(foundry.utils.mergeObject({ ...effect.constructor.getInitialDuration(), disabled: false }, flags));
    return existing;
  }
  const data = foundry.utils.mergeObject({ ...effect.toObject(), disabled: false, transfer: false, origin: origin.uuid }, flags);
  return ActiveEffect.implementation.create(data, { parent: actor });
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
function selfReason(message, effects = cardEffects(message)) {
  const caster = message.getAssociatedActor?.();
  if (!caster || !effects.length) return null;
  const activity = message.getAssociatedActivity?.();
  return selfApplyReason({
    casterUuid: caster.uuid,
    targetUuids: (message.flags?.dnd5e?.targets ?? []).map(d => d?.uuid),
    affectsType: activity?.target?.affects?.type ?? null,
    activityType: activity?.type ?? message.flags?.dnd5e?.activity?.type ?? null,
    effectCount: effects.length
  });
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
  const effects = cardEffects(message);
  if (!effects.length) return null;
  const caster = message.getAssociatedActor?.();
  if (!caster || !(game.user.isGM || caster.isOwner)) return null;
  const reason = selfReason(message, effects);
  if (!reason) return null;
  inflight.add(message.id);
  try {
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
    p.innerHTML = `<i class="fa-solid fa-wand-sparkles" inert></i> ${esc(t("Effects.AutoApplied", {
      actor: flag.actorName, effects: (flag.names ?? []).join(", ")
    }))}`;
    (html.querySelector(".chat-card") ?? html).append(p);
  }

  const tray = html.querySelector("effect-application");
  if (!tray || tray.dataset.pentarynAoe) return;
  tray.dataset.pentarynAoe = "1";

  const light = msg => {
    if (!pendingFor(msg).length) return;
    tray.classList.add("pentaryn-aoe-unapplied");
    tray.style.setProperty("--pentaryn-aoe-unapplied", JSON.stringify(t("Effects.Unapplied")));
  };

  // A fresh card that is about to be auto-applied is not "waiting": skip the flash before the
  // GM's write lands and re-renders it. If that write never lands (the apply failed), look again
  // once the grace is over, so a failed auto-apply still lights up.
  const age = Date.now() - (message.timestamp ?? 0);
  const autoSoon = setting("autoApplySelf") && !flag?.auto && age < AUTO_GRACE && !!selfReason(message);
  if (setting("highlightUnapplied")) {
    if (!autoSoon) light(message);
    else setTimeout(() => {
      const live = game.messages.get(message.id);
      if (live && tray.isConnected && !aoeFlags(live).effectsApplied?.auto) light(live);
    }, AUTO_GRACE - age + 250);
  }

  // Notice dnd5e's own apply click (the whole effect row is its button) so the highlight goes and
  // the card remembers. Only counts when the tray had someone ticked to apply it to.
  // Capture phase: dnd5e's .collapsible card-tray handler (_handleClickHeader) calls
  // stopImmediatePropagation on every click inside the tray, so a bubble listener never fires.
  tray.addEventListener("click", ev => {
    const li = ev.target?.closest?.("li.effect[data-id]");
    if (!li || !tray.contains(li)) return;
    const ticked = [...tray.querySelectorAll("[data-target-uuid] dnd5e-checkbox")].some(c => c.checked);
    if (!ticked) return;
    const id = li.dataset.id;
    localApplied.set(message.id, new Set([...(localApplied.get(message.id) ?? []), id]));
    if (!pendingFor(message).length) tray.classList.remove("pentaryn-aoe-unapplied");
    setTimeout(() => markApplied(message, [id]).catch(err => console.warn(`${MODULE} | mark applied`, err)), MARK_DELAY);
  }, true);
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
}
