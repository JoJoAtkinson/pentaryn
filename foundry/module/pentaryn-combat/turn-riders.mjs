/**
 * Once-per-turn riders — Sneak Attack, Frenzy, Colossus Slayer, Divine Strike — offered on the
 * attack card, never forced.
 *
 * Offer (default, "ask"): every attack card made this turn by an actor with an unused rider gets a
 * `+ Sneak Attack 3d6` button (roller and GM only). Its tooltip says what the rule needs and what
 * the module can see ("advantage ✓ · ally beside the target ?"). Clicking it rolls the feature's own
 * damage activity with the swing's crit carried, the damage type narrowed to the weapon's (no
 * 13-type picker), threaded under the same usage card. The turn flag marks it used and the button
 * goes from every card.
 *
 * Auto (per player, a toggle on the Special bar): the first attack this turn the module can see is
 * eligible gets the dice added into the weapon's own damage roll (crit doubling is then native) and
 * the card says "+ Sneak Attack 3d6 · Undo". Undo gives the once-per-turn back when the GM calls a
 * miss. The stock item's uses (max 1, no recovery) are never consumed.
 */

import * as core from "./combat-core.mjs";
import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { featuresOf, featureItem, weaponShape, combatContext, turnOf, updateTurn, rollAdvantage, allyAdjacent, tokenOf, isWeaponAttack, isReckless, riderActivity, riderDiceFor, rememberedWeapon } from "./shapes.mjs";

// The pure rider reads live in shapes.mjs (guide S8); re-exported for callers of this file.
export { isReckless, riderActivity, riderDiceFor };
import { setting, riderMode } from "./settings.mjs";

const log = makeLog(MODULE);


/**
 * combat-riders-33 [declared]: the rider dice and key that reach chat-card HTML are escaped. They come
 * from the actor's scale values and from a message flag (flags.pentaryn-combat.auto) any message
 * author can write; normal values ("3d6", "sneak-attack") render exactly as before.
 */
const esc = v => foundry.utils.escapeHTML(String(v));

/** Decision trace (combat-riders-10): api.trace() reads it; recorded only with CONFIG.debug["pentaryn-combat"]. */
let trace = () => undefined;

/* ── facts about an attack message ───────────────────────────────────────── */

/**
 * The live Activity behind an attack message. dnd5e 6 stores `system.activity` as a plain source
 * reference ({id, img, name, type: "attack", uuid}), not the Activity — reading it as one gave every
 * card an actor-less "activity", so no rider offer, no auto rider and no per-swing Damage button.
 */
function attackActivity(message) {
  try {
    const live = message?.getAssociatedActivity?.();
    if (live?.actor) return live;
  } catch (err) { log.debug("associated activity (falls through to the uuid)", err); }
  const ref = message?.system?.activity;
  const uuid = typeof ref === "string" ? ref : ref?.uuid;
  try {
    const a = uuid ? fromUuidSync(uuid, { strict: false }) : null;
    return a?.actor ? a : null;
  } catch { return null; }
}

function targetToken(message) {
  const t = message?.system?.targets?.[0];
  if (!t || message.system.targets.length !== 1) return null;
  try {
    const doc = t.token ? fromUuidSync(t.token) : null;
    return doc?.object ?? null;
  } catch { return null; }
}

function isRaging(actor) {
  return !!actor?.effects?.some(e => !e.disabled && !e.isSuppressed && /^rage$/i.test(e.name ?? ""));
}

/**
 * Turn Reckless Attack on or off (the Special-bar toggle). On: an actor effect copied from the PHB
 * item's own "Reckless" effect (its duration: until the start of your next turn), plus the native
 * Advantage on Strength attack rolls the stock effect lacks. Off: every live Reckless effect goes.
 * @returns {Promise<boolean>} reckless after the call
 */
export async function setReckless(actor, on) {
  if (!actor?.isOwner) return isReckless(actor);
  const live = actor.effects.filter(e => core.isRecklessEffect(e));
  if (!on) {
    if (live.length) await actor.deleteEmbeddedDocuments("ActiveEffect", live.map(e => e.id));
    return false;
  }
  if (live.length) return true;
  const item = featureItem(actor, "reckless-attack");
  const stock = item?.effects?.find(e => /^reckless/i.test(e.name ?? ""))?.toObject?.() ?? null;
  const data = foundry.utils.mergeObject(stock ?? {
    name: _loc("PENTARYN_COMBAT.Reckless.Effect"),
    img: item?.img ?? "icons/skills/melee/strike-axe-blood-red.webp",
    duration: { value: 6, units: "seconds", expiry: "turnStart" }
  }, { transfer: false, disabled: false, origin: item?.uuid ?? null, [`flags.${MODULE}.reckless`]: true }, { inplace: false });
  delete data._id;
  data.name = /^reckless/i.test(data.name ?? "") ? data.name : _loc("PENTARYN_COMBAT.Reckless.Effect");
  // Foundry v14 / dnd5e 6 keep an effect's changes in `system.changes` (top-level `changes` is ignored).
  data.system ??= {};
  data.system.changes = core.recklessChanges(data.system.changes ?? data.changes);
  delete data.changes;
  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return true;
}

/** Every rider this actor has, with its eligibility on one attack message. */
export function offersFor(message) {
  const activity = attackActivity(message);
  const actor = activity?.actor;
  if (!actor || !activity?.item) return { actor, offers: [] };
  // Every rider here rides a weapon hit (Sneak Attack: "a Finesse or a Ranged weapon"); a ranged
  // spell attack (Fire Bolt) is "ranged" but not a weapon.
  if (!isWeaponAttack(activity)) return { actor, offers: [] };
  const riders = core.ridersFor(featuresOf(actor));
  if (!riders.length) return { actor, offers: [] };
  const turn = turnOf(actor);
  const roll = message.rolls?.[0];
  const adv = rollAdvantage(roll);
  const weapon = weaponShape(activity.item);
  const ally = allyAdjacent(tokenOf(actor), targetToken(message));
  const offers = riders.map(rider => ({
    rider,
    activity: riderActivity(actor, rider),
    dice: riderDiceFor(actor, rider),
    state: turn.riders[rider.key],
    ...core.riderEligibility({
      rider, weapon,
      attackMode: message.system?.mode ?? roll?.options?.attackMode,
      ability: message.system?.ability ?? roll?.options?.ability,
      roll: adv, allyAdjacent: ally,
      raging: isRaging(actor), reckless: isReckless(actor),
      used: turn.riders[rider.key]
    })
  })).filter(o => o.activity);
  return { actor, offers, turn };
}

function hintText(o) {
  const lines = core.hintCodes(o.checks).map(code => {
    const [key, v] = code.split(":");
    // The module can't see everything about "an ally within 5 ft" (an unseen or untokened ally), so
    // a miss there is a question for the GM, not a firm ✗. Reckless says where to turn it on.
    let mark = v === "yes" ? "✓" : v === "no" ? "✗" : "?";
    if (key === "ally" && v !== "yes") mark = `? ${_loc("PENTARYN_COMBAT.Rider.AskGM")}`;
    else if (key === "reckless" && v === "no") mark = `✗ ${_loc("PENTARYN_COMBAT.Rider.RecklessWhere")}`;
    return `${_loc(core.keyFor("Rider.Check", key))} ${mark}`;
  });
  return [_loc(core.keyFor("Rider.Rule", o.rider.key)), ...lines].join("<br>");
}

/* ── the card button ─────────────────────────────────────────────────────── */

function renderOffer(message, html) {
  if (!setting("riderOffers") || message?.type !== "attack" || !html?.querySelector) return;
  html.querySelector(".pentaryn-combat-riders")?.remove();
  const stamp = message.getFlag?.(MODULE, "turnKey");
  if (!stamp) return;
  // combat-riders-2: who may see it and whether the stamp is this turn's, before the offers are
  // worked out (offersFor reads every token on the canvas for the ally check).
  const actor = attackActivity(message)?.actor;
  if (!actor || !(game.user.isGM || message.isAuthor || actor.isOwner)) return trace("offer", { message: message.id, why: actor ? "not yours to see" : "no actor" });
  if (stamp !== combatContext(actor).key) return trace("offer", { message: message.id, why: "an earlier turn's card" });
  const { offers } = offersFor(message);
  // In Auto mode an eligible swing gets the dice in its damage roll; no button for it.
  const show = offers.filter(o => o.offer && !(o.auto && riderMode(o.rider.key) === "auto"));
  if (!show.length) return;

  const row = document.createElement("div");
  row.className = "pentaryn-combat-riders card-buttons";
  for (const o of show) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pentaryn-combat-rider";
    b.dataset.rider = o.rider.key;
    b.dataset.tooltip = hintText(o);
    // Usability Area 3 (B2): the hint was fixed when the card rendered, so an ally who stepped in
    // beside the target afterwards still read "?". It is worked out again as the pointer arrives
    // (before core's tooltip reads it).
    b.addEventListener("pointerenter", () => {
      try {
        const now = offersFor(message).offers.find(x => x.rider.key === o.rider.key);
        if (now) b.dataset.tooltip = hintText(now);
      } catch (err) { log.debug("rider hint refresh (the render-time hint stays)", err); }
    });
    b.innerHTML = `<i class="fa-solid fa-plus"></i> ${_loc(core.keyFor("Rider.Name", o.rider.key))} ${esc(o.dice)}`;
    if (o.auto) b.classList.add("pentaryn-combat-eligible");
    b.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); rollRider(message, o.rider.key); });
    row.append(b);
  }
  const content = html.querySelector(".message-content") ?? html;
  content.append(row);
}

/** The damage type the weapon deals (first base type). */
function weaponDamageType(activity) {
  const base = activity?.item?.system?.damage?.base?.types;
  const first = base ? [...base][0] : null;
  if (first) return first;
  for (const p of activity?.damage?.parts ?? []) { const t = [...(p.types ?? [])][0]; if (t) return t; }
  return null;
}

/** actor|rider|turn keys with a rider roll in flight on this client (two quick clicks = one roll). */
const inFlight = new Set();

/**
 * Roll one rider for one attack message: crit carried, type narrowed, threaded under the usage card,
 * against that swing's targets. Never consumes the stock item's uses (rollDamage, not use).
 */
export async function rollRider(message, key) {
  const rider = core.riderByKey(key);
  const activity = attackActivity(message);
  const actor = activity?.actor;
  if (!rider || !actor?.isOwner) return null;
  const turnKey = combatContext(actor).key;
  // A button left on an earlier turn's card: that swing's turn is over (and this turn's use is not its to spend).
  const stamp = message.getFlag?.(MODULE, "turnKey");
  if (stamp && stamp !== turnKey) {
    ui.notifications.info(_loc("PENTARYN_COMBAT.Rider.Stale"));
    return null;
  }
  const once = `${actor.uuid}|${key}|${turnKey}`;
  if (inFlight.has(once) || turnOf(actor).riders[key]) {
    ui.notifications.info(_loc("PENTARYN_COMBAT.Rider.Used", { name: _loc(core.keyFor("Rider.Name", key)) }));
    return null;
  }
  const act = riderActivity(actor, rider);
  if (!act) return null;
  inFlight.add(once);
  try {
    const origin = message._source?.system?.origin ?? message.system?.origin?.id ?? null;
    const type = weaponDamageType(activity);
    // The swing's own targets, not whatever is targeted when the button is clicked: the GM's damage
    // tray applies it to the creature that was hit.
    const targets = message._source?.system?.targets ?? null;
    const system = { ...(origin ? { origin } : {}), ...(targets?.length ? { targets } : {}) };
    const rolls = await act.rollDamage(
      { isCritical: !!message.rolls?.[0]?.isCritical, [MODULE]: { rider: key, narrow: type } },
      { configure: false },
      { data: { ...(Object.keys(system).length ? { system } : {}), flags: { [MODULE]: { rider: key, attack: message.id } } } }
    );
    if (!rolls?.length) return null;
    await updateTurn(actor, t => core.setRider(t, key, "used"));
    return rolls;
  } finally {
    inFlight.delete(once);
  }
}

/** Narrow a rider roll's damage type and tidy its "(2)d6" die count (our own calls only). */
function narrowType(config) {
  if (!config?.[MODULE]?.rider) return;
  const t = config[MODULE].narrow;
  for (const r of config.rolls ?? []) {
    if (Array.isArray(r.parts)) {
      r.parts = r.parts.map(p => core.tidyDiceCount(p, ref => Roll.replaceFormulaData(ref, r.data ?? {})));
    }
    if (!t) continue;
    r.options ??= {};
    r.options.type = t;
    r.options.types = [t];
  }
}

/* ── auto mode: dice into the weapon's damage roll ───────────────────────── */

/** The attack message this damage roll follows: same usage card if known, else the latest of the activity. */
export function attackMessageFor(activity, message) {
  const origin = message?.data?.system?.origin ?? null;
  const recent = game.messages.contents.slice(-15).reverse().filter(m => m.type === "attack");
  const sameActivity = m => (m.system?.activity?.uuid ?? m.system?.activity) === activity.uuid;
  return recent.find(m => sameActivity(m) && origin && m._source?.system?.origin === origin)
    ?? recent.find(sameActivity) ?? null;
}

/**
 * Auto riders applied on this client in the last few seconds, by actor|rider|turn: the next swing's
 * damage can roll before the flag write lands. After that the flag is the truth (Undo, New turn).
 */
const autoApplied = new Map();
const AUTO_GUARD_MS = 4000;

/** combat-riders-29: forget auto riders older than the guard window (never read again). */
export function pruneSession(now = Date.now()) {
  return core.pruneOlder(autoApplied, now, AUTO_GUARD_MS);
}

/** In dnd5e.preRollDamageV2: add an auto rider's dice to a weapon damage roll. @returns {object[]} applied */
export function autoRiders(config, message) {
  if (!setting("riderOffers")) return [];
  const activity = config?.subject;
  const actor = activity?.actor;
  if (!actor?.isOwner || activity?.type !== "attack" || !config.rolls?.[0]) return [];
  if (activity.item?.type !== "weapon") return [];
  const attackMsg = attackMessageFor(activity, message);
  if (!attackMsg) return [];
  const { offers } = offersFor(attackMsg);
  const applied = [];
  for (const o of offers) {
    if (!o.auto || o.state || riderMode(o.rider.key) !== "auto" || !o.dice) {
      trace("auto rider", { rider: o.rider.key, applied: false, why: !o.auto ? "not eligible" : o.state ? `already ${o.state}` : !o.dice ? "no dice" : "ask mode" });
      continue;
    }
    const once = `${actor.uuid}|${o.rider.key}|${combatContext(actor).key}`;
    if (Date.now() - (autoApplied.get(once) ?? 0) < AUTO_GUARD_MS) { trace("auto rider", { rider: o.rider.key, applied: false, why: "4 s guard" }); continue; }
    autoApplied.set(once, Date.now());
    trace("auto rider", { rider: o.rider.key, applied: true, dice: o.dice, attack: attackMsg.id });
    config.rolls[0].parts.push(`${o.dice}`);
    applied.push({ key: o.rider.key, dice: o.dice, attack: attackMsg.id });
  }
  if (applied.length) {
    foundry.utils.setProperty(message, `data.flags.${MODULE}.auto`, applied);
    for (const a of applied) updateTurn(actor, t => core.setRider(t, a.key, `auto:${a.attack}`));
  }
  return applied;
}

/** The "+ Sneak Attack 3d6 · Undo" note on an auto damage card. */
function renderAutoNote(message, html) {
  const auto = message?.getFlag?.(MODULE, "auto");
  if (!auto?.length || message.type !== "damage" || !html?.querySelector) return;
  html.querySelector(".pentaryn-combat-auto")?.remove();
  const note = document.createElement("p");
  note.className = "supplement pentaryn-combat-auto";
  const actor = message.getAssociatedActor?.() ?? game.actors.get(message.speaker?.actor);
  const turn = actor ? turnOf(actor) : null;
  const undone = message.getFlag?.(MODULE, "undone") ?? [];
  const parts = auto.map(a => {
    const live = turn?.riders?.[a.key] === `auto:${a.attack}`;
    const name = esc(_loc(core.keyFor("Rider.Name", a.key)));  // an unknown key falls through as raw text (D-c3)
    // Area 3 re-run (B4): after Undo the card still read "1d8 + 3 + 3d6 = 22". The rider is struck
    // through and the card says how much of its total that was, for the GM to leave off.
    if (undone.includes(a.key)) {
      const rolled = core.riderRolled(a.dice, message.rolls?.[0]?.dice?.map(d => ({ number: d.number, faces: d.faces, total: d.total })) ?? []);
      const total = (message.rolls ?? []).reduce((sum, r) => sum + (Number(r?.total) || 0), 0);
      const text = rolled && message.rolls?.length
        ? _loc("PENTARYN_COMBAT.Rider.UndoneCard", { formula: rolled.formula, n: rolled.total, total: total - rolled.total })
        : _loc("PENTARYN_COMBAT.Rider.UndoneCardPlain");
      note.classList.add("pentaryn-combat-undone");
      return `<s>+ ${name} ${esc(a.dice)}</s> <span class="pentaryn-combat-undone-text">${text}</span>`;
    }
    const undo = live && (actor?.isOwner || game.user.isGM)
      ? ` <button type="button" class="pentaryn-combat-undo" data-undo="${esc(a.key)}" data-tooltip="${_loc("PENTARYN_COMBAT.Rider.UndoHint")}"><i class="fa-solid fa-rotate-left"></i> ${_loc("PENTARYN_COMBAT.Rider.Undo")}</button>` : "";
    return `+ ${name} ${esc(a.dice)}${undo}`;
  });
  note.innerHTML = parts.join(" · ");
  note.addEventListener("click", async ev => {
    const a = ev.target.closest("[data-undo]");
    if (!a || !actor) return;
    ev.preventDefault();
    ev.stopPropagation();
    const key = a.dataset.undo;
    const entry = auto.find(x => x.key === key);
    // Only this card's own auto rider, this turn: an Undo link left on an earlier turn's card must
    // not give back the rider spent on the current turn.
    if (!entry || turnOf(actor).riders?.[key] !== `auto:${entry.attack}`) {
      ui.notifications.info(_loc("PENTARYN_COMBAT.Rider.Stale"));
      return;
    }
    autoApplied.delete(`${actor.uuid}|${key}|${combatContext(actor).key}`);
    await updateTurn(actor, t => (t.riders?.[key] === `auto:${entry.attack}` ? core.setRider(t, key, null) : t));
    // Mark the card (its author or the GM can write it): the note re-renders struck through.
    if (message.isOwner) {
      const was = message.getFlag(MODULE, "undone") ?? [];
      if (!was.includes(key)) await message.setFlag(MODULE, "undone", [...was, key]).catch(err => log.warn("undo mark", err));
    }
    ui.notifications.info(_loc("PENTARYN_COMBAT.Rider.Undone", { name: _loc(core.keyFor("Rider.Name", a.dataset.undo)) }));
  });
  const content = html.querySelector(".message-content") ?? html;
  const row = content.querySelector(":scope > section.icon-row");
  if (row) row.after(note); else content.append(note);
}

/* ── per-swing Damage button when pentaryn-aoe's auto-damage is off ──────── */
// A Full Attack posts one usage card for several swings; its Damage button can't know which swing
// it is for. Without aoe's auto-damage, each swing's attack card gets its own Damage button, with
// that swing's crit, attack mode and ammunition.

function aoeAutoDamage() {
  try { return !!game.modules.get("pentaryn-aoe")?.active && !!game.settings.get("pentaryn-aoe", "autoDamageOnHit"); }
  catch { return false; }
}

function renderSwingDamage(message, html) {
  if (message?.type !== "attack" || !message.getFlag?.(MODULE, "swing") || aoeAutoDamage() || !html?.querySelector) return;
  html.querySelector(".pentaryn-combat-damage")?.remove();
  const activity = attackActivity(message);
  if (!activity?.actor?.isOwner || !activity.damage?.parts?.length && !activity.item?.system?.damage?.base) return;
  const row = document.createElement("div");
  row.className = "pentaryn-combat-damage card-buttons";
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<i class="fa-solid fa-burst"></i> ${game.i18n.localize("DND5E.Damage")}`;
  b.addEventListener("click", async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const roll = message.rolls?.[0];
    const ammoId = message.system?.ammunition;
    const origin = message._source?.system?.origin ?? null;
    await activity.rollDamage({
      event: ev,
      isCritical: !!roll?.isCritical,
      attackMode: message.system?.mode ?? roll?.options?.attackMode,
      ammunition: ammoId ? activity.actor.items.get(ammoId) : undefined
    }, {}, origin ? { data: { system: { origin } } } : {});
  });
  row.append(b);
  (html.querySelector(".message-content") ?? html).append(row);
}

/* ── re-render cards when a turn flag changes ───────────────────────────── */

let rerenderQueued = new Set();
function rerenderCards(actor) {
  rerenderQueued.add(actor.uuid);
  setTimeout(() => {
    const uuids = rerenderQueued;
    rerenderQueued = new Set();
    // Only cards that can change: this turn's attack cards (offer on/off) and cards that currently
    // show one of our buttons or an Undo (so an earlier turn's card loses it). Re-rendering the
    // actor's last 40 cards on every swing was needless chat churn.
    const showing = (id) => !!document.querySelector(`[data-message-id="${id}"] .pentaryn-combat-riders, [data-message-id="${id}"] .pentaryn-combat-auto [data-undo]`);
    const keys = new Map();   // combat-riders-2: one combatContext per actor, not per card
    const keyOf = a => { if (!keys.has(a.uuid)) keys.set(a.uuid, combatContext(a).key); return keys.get(a.uuid); };
    for (const m of game.messages.contents.slice(-40)) {
      if (!["attack", "damage"].includes(m.type)) continue;
      const a = attackActivity(m)?.actor ?? m.getAssociatedActor?.();
      if (!a || !uuids.has(a.uuid)) continue;
      const current = m.type === "attack" && m.getFlag?.(MODULE, "turnKey") === keyOf(a);
      if (!current && !showing(m.id) && !m.getFlag?.(MODULE, "auto")) continue;
      try { ui.chat?.updateMessage?.(m); } catch (err) { log.debug("card re-render (popped out)", err); }
    }
  }, core.DELAYS.cardRerender);
}

/**
 * The turn moved on (or the combat ended): every card on this client that still shows a rider button
 * or an Undo is re-rendered, so an earlier turn's offer goes. Before, a card was only re-rendered
 * when its actor's turn flag changed, so a Frenzy button stayed on the Barbarian's cards through
 * other creatures' turns (Area 3 re-run, E1).
 */
function rerenderShowing() {
  setTimeout(() => {
    const ids = new Set();
    for (const el of document.querySelectorAll(".pentaryn-combat-riders, .pentaryn-combat-auto [data-undo]")) {
      const id = el.closest("[data-message-id]")?.dataset.messageId;
      if (id) ids.add(id);
    }
    for (const id of ids) {
      const m = game.messages.get(id);
      if (m) try { ui.chat?.updateMessage?.(m); } catch (err) { log.debug("card re-render (popped out)", err); }
    }
  }, core.DELAYS.cardRerender);
}

/* ── GM audit ────────────────────────────────────────────────────────────── */

export function report(actorOrName) {
  const actors = actorOrName
    ? [typeof actorOrName === "string" ? game.actors.getName(actorOrName) : actorOrName].filter(Boolean)
    : game.actors.filter(a => a.type === "character");
  const rows = actors.map(actor => ({
    actor: actor.name,
    riders: core.ridersFor(featuresOf(actor)).map(r => ({
      key: r.key, dice: riderDiceFor(actor, r), activity: !!riderActivity(actor, r),
      modeForMe: riderMode(r.key)
    })),
    turn: actor.getFlag(MODULE, "turn") ?? null,
    lastWeapon: rememberedWeapon(actor)
  }));
  console.table(rows.map(r => ({ actor: r.actor, riders: r.riders.map(x => `${x.key} ${x.dice} (${x.modeForMe})`).join(", ") || "—", turn: r.turn?.key ?? "—" })));
  return rows;
}

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ label });   // guarded (S11, D-c1): a throw is logged with the label; return values pass through

export function install(reg, ctx) {
  if (ctx?.log) trace = (op, data) => ctx.log.trace(op, data);
  registerHooks(reg);
  return { impl: { offers: offersFor, rollRider, reckless: isReckless, setReckless, report } };
}

function registerHooks(reg) {
  // Every attack roll carries the turn it was made in, so a card's button shows only that turn.
  reg.on("dnd5e.preRollAttackV2", (config, dialog, message) => {
    try {
      const actor = config?.subject?.actor;
      if (actor) foundry.utils.setProperty(message, `data.flags.${MODULE}.turnKey`, combatContext(actor).key);
    } catch (err) { log.warn("turn stamp skipped", err); }
  }, opts("turn stamp"));
  reg.on("dnd5e.preRollDamageV2", (config, dialog, message) => {
    try { narrowType(config); } catch (err) { log.warn("rider type skipped", err); }
    try { autoRiders(config, message); } catch (err) { log.warn("auto rider skipped", err); }
  }, opts("rider damage"));
  reg.on("dnd5e.renderChatMessage", (message, html) => {
    try { renderOffer(message, html); } catch (err) { log.warn("rider offer skipped", err); }
    try { renderAutoNote(message, html); } catch (err) { log.warn("rider note skipped", err); }
    try { renderSwingDamage(message, html); } catch (err) { log.warn("swing damage button skipped", err); }
  }, opts("rider card"));
  reg.on("combatTurnChange", () => rerenderShowing(), opts("rider cards: turn changed"));
  reg.on("deleteCombat", () => rerenderShowing(), opts("rider cards: combat over"));
  reg.on("updateActor", (actor, changes) => {
    if (foundry.utils.hasProperty(changes, `flags.${MODULE}.turn`) || foundry.utils.hasProperty(changes, `flags.${MODULE}.-=turn`)) rerenderCards(actor);
  }, opts("rider cards: turn flag"));
  // Reckless on/off changes Frenzy's offer and hint on this turn's cards.
  for (const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
    reg.on(hook, (effect) => {
      const actor = effect?.parent;
      if (actor?.documentName === "Actor" && /^reckless/i.test(effect.name ?? "")) rerenderCards(actor);
    }, opts("rider cards: Reckless"));
  }
}

/** Session state only; the registry unwinds the hooks. */
export function uninstall() {
  inFlight.clear();
  autoApplied.clear();
  rerenderQueued = new Set();
}
