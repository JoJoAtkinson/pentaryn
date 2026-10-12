// Pentaryn Combat — turn flow on the Argon HUD (usability re-run, Area 1).
//
// Every piece is one world setting, default on (README → Adjustments). Argon's files are untouched:
// its buttons are wrapped per instance in its own render hooks, the portrait's effect list through
// its class's getEffects.
//
//   specialActions        Argon's Dash / Disengage / Dodge / Hide / Ready / Shove spend the Action (and
//                         the swing pips), Dash adds your Speed for the turn, Disengage shows for the
//                         turn, Dodge ends at the start of your next turn, Hide rolls Stealth (DC 15)
//   reactionSlot          the Reaction bar's weapon reads "Opportunity Attack" and spends the Reaction
//   escRollDialog         Esc closes a dnd5e roll dialog without clicking into it first
//   tidyCancelledAttacks  a cancelled attack roll takes its empty usage card with it
//   deathSaveDamage       damage at 0 HP is a Death Saving Throw failure (two on a crit)
//   portraitConditions    Prone, Poisoned, Dodging … on the HUD portrait, with the rules text
//   hudFollows            the HUD follows the one token left selected, and your combatant's turn
//   clearTargetsAfterTurn your targets are released when your turn ends
//   helperTokenControl    your token is selected again when a handle or summon you held is deleted
//   enterUses             Enter in a usage window's number box (Lay on Hands' points) uses the ability

import * as core from "./combat-core.mjs";
import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { setting, argonSetting } from "./settings.mjs";
import { combatContext, turnOf, updateTurn, countFor, chosenWeapon } from "./shapes.mjs";
import { expectRoll, forgetRoll, running } from "./sequence.mjs";

const log = makeLog(MODULE);


function mainPanel(label) {
  return ui.ARGON?.components?.main?.find?.(p => p.label === label) ?? null;
}

/** Argon's updateActionUse paints used pips only when the pip count didn't change; twice settles it. */
function paint(panel) {
  try { panel?.updateActionUse?.(); panel?.updateActionUse?.(); } catch (err) { log.debug("paint pips (HUD closed)", err); }
}

/* ── Argon's six built-in actions ────────────────────────────────────────── */
// Argon dnd5e calls consumeActionEconomy(this.item) with a temporary Item that has no activation, so
// no pip was ever spent; Dash and Disengage only posted a card; Dodge's status never ended; Hide
// rolled nothing.

function specialNames() {
  return Object.fromEntries(core.SPECIAL_ACTIONS.map(k => [k, game.i18n.localize(`enhancedcombathud-dnd5e.items.${k}.name`)]));
}

function swingsPerAction(actor) {
  try { return countFor(actor, chosenWeapon(actor)); } catch { return 1; }
}

async function addTurnEffect(actor, kind, img) {
  const changes = kind === "dash" ? dashBase(actor) : [];
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: _loc(core.keyFor("Turn.Effect", kind)),
    img: img || "icons/svg/wingfoot.svg",
    description: `<p>${_loc(core.keyFor("Turn.EffectText", kind))}</p>`,
    transfer: false,
    origin: actor.uuid,
    system: { changes },
    flags: { [MODULE]: { until: "turnEnd", special: kind }, dnd5e: { isTemporary: true } }
  }]);
}

/** Dash adds your Speed after modifiers; a second Dash this turn adds the same again, not double. */
function dashBase(actor) {
  const earlier = actor.effects.find(e => e.getFlag(MODULE, "special") === "dash");
  const had = earlier?.system?.changes;
  if (Array.isArray(had) && had.length) return had.map(c => ({ key: c.key, type: c.type ?? "add", value: c.value }));
  return core.dashChanges(actor.system?.attributes?.movement ?? {});
}

async function rollHide(actor) {
  let rolls = null;
  try { rolls = await actor.rollSkill({ skill: "ste", target: 15 }); } catch (err) { log.warn("Hide roll", err); }
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  const total = roll?.total;
  const hidden = Number.isFinite(total) && total >= 15;
  if (hidden) {
    if (!actor.statuses?.has?.("hiding")) await actor.toggleStatusEffect("hiding", { active: true });
    ui.notifications.info(_loc("PENTARYN_COMBAT.Turn.Hidden", { total }));
  } else {
    if (actor.statuses?.has?.("hiding")) await actor.toggleStatusEffect("hiding", { active: false });
    ui.notifications.info(Number.isFinite(total) ? _loc("PENTARYN_COMBAT.Turn.NotHidden", { total }) : _loc("PENTARYN_COMBAT.Turn.HideCancelled"));
  }
}

async function afterSpecial(actor, kind, btn) {
  const ctx = combatContext(actor);
  const mine = ctx.inCombat && ctx.isOwnTurn;
  // Spend the Action pip Argon meant to spend (pentaryn's swing pips read the turn flag below).
  if (mine && kind !== "shove") {
    const action = mainPanel("DND5E.Action");
    if (action) { action.isActionUsed = true; paint(action); }
  }
  // An item the actor owns ran through dnd5e: postUseActivity already counted it; only the pip was missing.
  if (btn.actorItem) return;
  if (mine) await updateTurn(actor, t => core.recordSpecialAction(t, kind));
  if (kind === "dash" && mine) await addTurnEffect(actor, "dash", btn.item?.img);
  if (kind === "disengage" && mine) await addTurnEffect(actor, "disengage", btn.item?.img);
  // Argon toggles Dodging: a second Dodge would have switched it off.
  if (kind === "dodge" && !actor.statuses?.has?.("dodging")) await actor.toggleStatusEffect("dodging", { active: true });
  if (kind === "hide") await rollHide(actor);
}

function wrapSpecial(btn) {
  if (!btn || btn._pcSpecial !== undefined || typeof btn.createChatMessage !== "function") return;
  const kind = core.specialActionOf(btn.item?.name ?? btn.label, specialNames());
  btn._pcSpecial = kind;
  if (!kind) return;
  const own = btn._onLeftClick;
  btn._onLeftClick = async (event) => {
    if (!setting("specialActions")) return own.call(btn, event);
    const actor = btn.actor;
    const ctx = combatContext(actor);
    if (ctx.inCombat && ctx.isOwnTurn) {
      const turn = turnOf(actor);
      const left = core.actionsLeft(turn, swingsPerAction(actor));
      const shoveOk = kind === "shove" && core.swingsLeft(swingsPerAction(actor), turn, { inCombat: true }) > 0;
      if (!left && !shoveOk) ui.notifications.warn(_loc("PENTARYN_COMBAT.Turn.NoActionLeft", { action: btn.label }));
    }
    await own.call(btn, event);
    try { await afterSpecial(actor, kind, btn); } catch (err) { log.warn(`${kind}`, err); }
  };
}

/* ── the Reaction bar's weapon: Opportunity Attack ───────────────────────── */

function protoGetter(obj, name) {
  for (let p = Object.getPrototypeOf(obj); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d?.get) return d.get;
  }
  return null;
}

function wrapReactionSlot(btn) {
  if (!btn?._isWeaponSet || btn._pcOA) return;
  btn._pcOA = true;
  const ownLabel = protoGetter(btn, "label");
  Object.defineProperty(btn, "label", {
    configurable: true,
    get() {
      const base = ownLabel ? ownLabel.call(this) : this.item?.name;
      return setting("reactionSlot") && this.item?.name ? _loc("PENTARYN_COMBAT.Turn.OA", { weapon: this.item.name }) : base;
    }
  });
  const own = btn._onLeftClick;
  btn._onLeftClick = async (event) => {
    if (!setting("reactionSlot")) return own.call(btn, event);
    const actor = btn.actor;
    let activity = null;
    try { activity = btn.activity ?? null; } catch { activity = null; }
    const action = mainPanel("DND5E.Action");
    const reaction = mainPanel("DND5E.Reaction");
    const actionWas = action?.isActionUsed;
    // The attack roll dnd5e starts after use() is a reaction: never one of the Attack action's swings.
    if (activity?.uuid) expectRoll(activity.uuid, "reaction");
    let used = false;
    const hook = Hooks.on("dnd5e.postUseActivity", (a) => { if (a?.uuid && a.uuid === activity?.uuid) used = true; });
    try { await own.call(btn, event); } finally { Hooks.off("dnd5e.postUseActivity", hook); }
    if (!used) { forgetRoll(activity?.uuid); return; }
    // Argon spends the weapon's own activation (the Action) on your own turn: give it back, spend the Reaction.
    if (action && action.isActionUsed !== actionWas) { action.isActionUsed = actionWas; paint(action); }
    if (reaction && combatContext(actor).inCombat) { reaction.isActionUsed = true; paint(reaction); }
  };
  if (btn.element?.isConnected) btn.render?.();
}

Hooks.on("renderActionPanelArgonComponent", (panel) => {
  try {
    for (const b of panel?._buttons ?? []) {
      if (panel.label === "DND5E.Reaction") wrapReactionSlot(b);
      if (panel.label === "DND5E.Action") for (const x of [b, b?.button1, b?.button2]) wrapSpecial(x);
    }
  } catch (err) { log.warn("turn-flow buttons", err); }
});

/* ── turn boundaries: Dodge / Dash / Disengage end; targets; the HUD follows ── */

async function sweep(actor, event) {
  const on = { specialActions: setting("specialActions"), reckless: setting("recklessToggle") };
  if (!actor?.effects || (!on.specialActions && !on.reckless)) return;
  const ids = core.expiringAt(actor.effects.map(e => ({
    id: e.id, statuses: [...(e.statuses ?? [])], until: e.getFlag?.(MODULE, "until") ?? null,
    reckless: !!e.getFlag?.(MODULE, "reckless") || core.isRecklessEffect(e)
  })), event, on);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

function releaseTargets() {
  if (!game.user.targets.size) return;
  if (canvas.tokens?.setTargets) canvas.tokens.setTargets([], { mode: "replace" });
  else for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false });
}

function argonOn() {
  try { return !!(ui.ARGON?.enabled || argonSetting("alwaysOn")); } catch { return false; }
}

Hooks.on("combatTurnChange", (combat, previous, current) => {
  // Combat start (round 0 → 1) keeps the same first combatant, so comparing combatants alone saw no
  // change and the HUD stayed on whoever it showed (usability Area 3). turnBoundary reads the round too.
  const { ended, began } = core.turnBoundary(previous, current);
  if (!ended && !began) return;
  const prior = ended ? combat.combatants.get(ended) ?? null : null;
  const next = began ? combat.combatants.get(began) ?? null : null;
  if (game.users.activeGM?.isSelf) {
    sweep(prior?.actor, "turnEnd").catch(err => log.warn("turn-end sweep", err));
    sweep(next?.actor, "turnStart").catch(err => log.warn("turn-start sweep", err));
    // The Reaction comes back at the start of your turn (combat.mjs records it; hud.mjs relights the pip).
    if (next?.actor?.getFlag?.(MODULE, "reaction")) next.actor.setFlag(MODULE, "reaction", null).catch(err => { log.debug("Reaction reset", err); return null; });
  }
  closeDrawersOf([prior?.actor, next?.actor]);
  if (game.user.isGM) return;
  // Your turn ended: last turn's target is stale (it used to send the next swing at a creature 15 ft away).
  if (setting("clearTargetsAfterTurn") && prior?.actor?.isOwner) releaseTargets();
  // Your creature's turn began: the HUD shows it (a player with a companion, or several tokens).
  const token = next?.token?.object ?? null;
  const plan = core.hudFollowPlan({
    enabled: setting("hudFollows"), owner: !!next?.actor?.isOwner, onScene: !!token && token.scene === canvas.scene,
    argonOn: argonOn(), combatStart: !ended
  });
  if (plan.now) followTo(token);
  // Combat start (Area 10): Argon's own updateCombat handler runs after this hook and binds
  // `controlled[0] ?? _token`. After a deleted combat Argon is still off here, so the look-again
  // must not depend on Argon being on now (U-10-10); it needs Argon on by then, and this
  // combatant's turn still the current one.
  for (const ms of plan.recheck) setTimeout(() => {
    if (combat.combatant?.id === next.id && argonOn() && ui.ARGON?._token !== token && !token.destroyed) followTo(token);
  }, ms);
});

/**
 * Show this token on the HUD. Selecting it is the normal way (Argon follows the selection). When it
 * can't be selected right now (another layer or tool active, a placement running), releasing the
 * others first left nothing selected and Argon closed the HUD 100 ms later (Area 10: "TWF first, the
 * HUD went down"), so the HUD is bound to it directly and the selection is left alone.
 */
function followTo(token) {
  if (ui.ARGON?._token === token) return;
  let canSelect = false;
  try { canSelect = !!(token.layer?.active && token.isInteractable && token._canControl?.(game.user)); } catch { canSelect = false; }
  if (canSelect && token.control({ releaseOthers: true })) return;
  try { ui.ARGON?.bind?.(token); } catch (err) { log.warn("HUD follow", err); }
}

// A combat that ends mid-turn leaves nobody's turn to end it on. Its turn and Reaction flags go too:
// they mean nothing without the combat and used to stay on the PCs for good.
Hooks.on("deleteCombat", (combat) => {
  if (!game.users.activeGM?.isSelf) return;
  const done = new Set();
  for (const c of combat.combatants ?? []) {
    const actor = c.actor;
    if (!actor || done.has(actor.uuid)) continue;
    done.add(actor.uuid);
    sweep(actor, "turnEnd").then(() => sweep(actor, "turnStart"))
      .then(() => clearCombatFlags(actor, combat.id))
      .catch(err => log.warn("end-of-combat cleanup", err));
  }
});

async function clearCombatFlags(actor, combatId) {
  const stale = core.staleCombatFlags({ turn: actor.getFlag?.(MODULE, "turn"), reaction: actor.getFlag?.(MODULE, "reaction") }, combatId);
  for (const key of stale) await actor.unsetFlag(MODULE, key);
}

/**
 * Area 10: a turn flag from a combat deleted before the cleanup above existed (or while no GM was
 * connected) stayed on a PC for good. The active GM removes every world actor's turn and Reaction
 * flags whose combat no longer exists, on load and a moment after any combat is deleted.
 */
async function sweepOrphanFlags() {
  if (!game.users.activeGM?.isSelf) return 0;
  const live = game.combats.map(c => c.id);
  let n = 0;
  for (const actor of game.actors) {
    const keys = core.orphanCombatFlags({ turn: actor.getFlag?.(MODULE, "turn"), reaction: actor.getFlag?.(MODULE, "reaction") }, live);
    for (const key of keys) { await actor.unsetFlag(MODULE, key); n++; }
  }
  return n;
}

Hooks.once("ready", () => { sweepOrphanFlags().catch(err => log.warn("orphan flag sweep", err)); });
Hooks.on("deleteCombat", () => {
  setTimeout(() => sweepOrphanFlags().catch(err => log.warn("orphan flag sweep", err)), 1500);
});

// Clicking one token of a selected group releases the others but never "controls" the clicked one
// again, so Argon kept showing whichever token it had. Bind to the one left.
Hooks.on("controlToken", (token, controlled) => {
  if (controlled || !setting("hudFollows")) return;
  setTimeout(() => {
    const left = canvas.tokens?.controlled ?? [];
    if (left.length !== 1 || !argonOn() || ui.ARGON?._token === left[0]) return;
    if (!left[0].actor?.isOwner) return;
    ui.ARGON.bind(left[0]);
  }, 150);
});

/* ── a helper token you held is deleted: your own token comes back ───────── */
// Dragging an area handle selects it; dnd5e selects a summon (Flaming Sphere) you placed. When Apply
// removes the handle, or concentration ends and the summon goes, core releases it and nothing is left
// selected, so Argon closed the HUD and the player had to find their own token again (usability Area 5
// re-run, S3 and S13). The deleteToken hook runs while the token is still selected (core destroys the
// placeable, which releases it, right after); a tick later, if nothing else is selected, we select the
// caster's token: the HUD's token for a handle, the summoner for a summon, else your character.

function ownedTokenOf(actor) {
  if (!actor) return null;
  return (actor.getActiveTokens?.(false, false) ?? []).find(t => t.scene === canvas.scene && t.isOwner && !t.destroyed) ?? null;
}

Hooks.on("deleteToken", (doc) => {
  try {
    if (!setting("helperTokenControl") || doc?.parent !== canvas.scene || !doc.object?.controlled) return;
    const handle = !!doc.flags?.["pentaryn-aoe"]?.handle;
    const origin = doc.actor?.getFlag?.("dnd5e", "summon.origin") ?? null;
    if (!handle && !origin) return;
    const hud = ui.ARGON?._token?.id ?? null;
    setTimeout(() => {
      try {
        if ((canvas.tokens?.controlled ?? []).some(t => !t.destroyed && t.id !== doc.id)) return;
        let back = null;
        if (handle && hud && hud !== doc.id) back = canvas.tokens.get(hud) ?? null;
        if (!back && origin) back = ownedTokenOf(fromUuidSync(origin, { strict: false })?.actor);
        if (!back) back = ownedTokenOf(game.user.character);
        if (back && !back.destroyed && back.isOwner) back.control({ releaseOthers: true });
      } catch (err) { log.warn("helper token control", err); }
    }, 0);
  } catch (err) { log.warn("helper token control", err); }
});

/* ── roll dialogs: Esc, and the card a cancelled attack leaves ───────────── */

function rollDialogFor(target) {
  const host = target?.closest?.(".application.roll-configuration");
  if (host) return foundry.applications.instances.get(host.id) ?? null;
  // Nothing focused (the dialog opened under the cursor without taking focus): the newest roll dialog.
  if (target && target !== document.body && target !== document.documentElement) return null;
  const open = [...document.querySelectorAll(".application.roll-configuration")];
  const top = open.sort((a, b) => (Number(getComputedStyle(b).zIndex) || 0) - (Number(getComputedStyle(a).zIndex) || 0))[0];
  return top ? foundry.applications.instances.get(top.id) ?? null : null;
}

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || !setting("escRollDialog") || running()) return;   // a Full Attack's strip handles its own
  const t = ev.target;
  // Text fields and selects keep their native Esc (blur); a focused button blocks every keybinding.
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  const dialog = rollDialogFor(t);
  if (!dialog) return;
  ev.preventDefault();
  ev.stopPropagation();
  dialog.close();
}, true);

/* ── Enter in a usage window's box uses the ability (setting enterUses) ─── */
// Area 3 re-run (F2): Lay on Hands' "how many points" box took a click on Use Ability after typing,
// or Enter then the click. dnd5e's usage window has no submit button (Use is type="button") and
// re-renders on every change, so Enter only committed the number. Now Enter commits it, waits for
// the window to re-render with it, and presses Use. Text and number boxes only; a select keeps Enter.

const ENTER_TYPES = new Set(["number", "text", "range"]);

function pressUse(app) {
  let done = false;
  const press = () => {
    if (done) return;
    done = true;
    Hooks.off("renderActivityUsageDialog", hook);
    if (!app?.rendered) return;
    app.element?.querySelector?.('[data-action="use"]:not([disabled])')?.click();
  };
  const hook = (rendered) => { if (rendered === app) requestAnimationFrame(press); };
  Hooks.on("renderActivityUsageDialog", hook);
  setTimeout(press, 400);   // a value that did not change re-renders nothing
}

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || ev.isComposing || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const input = ev.target;
  if (!(input instanceof HTMLInputElement) || !ENTER_TYPES.has(input.type)) return;
  const host = input.closest(".application.activity-usage");
  if (!host || !setting("enterUses")) return;
  const app = foundry.applications.instances.get(host.id);
  if (!app) return;
  ev.preventDefault();
  ev.stopPropagation();
  input.dispatchEvent(new Event("change", { bubbles: true }));
  pressUse(app);
}, true);

Hooks.on("closeAttackRollConfigurationDialog", (app) => {
  try {
    if (!setting("tidyCancelledAttacks") || app?.rolls?.length) return;
    const origin = app?.message?.data?.system?.origin ?? null;
    const id = typeof origin === "string" ? origin : origin?.id;
    const msg = id ? game.messages.get(id) : null;
    if (!msg || msg.type !== "usage") return;
    // dnd5e posts the attack (if any) after this hook; look again a moment later before deleting.
    setTimeout(() => {
      if (!game.messages.get(msg.id)) return;
      const rolled = game.messages.contents.some(m => m.id !== msg.id && ((m.system?.origin?.id ?? m.system?.origin) === msg.id));
      const keep = !core.orphanUsage({
        mine: msg.author?.id === game.user.id, ageMs: Date.now() - (msg.timestamp ?? 0), rolled,
        consumed: core.deltasConsumed(msg.system?.deltas), sequence: !!running()
      });
      if (!keep) msg.delete().catch(err => log.warn("tidy usage card", err));
    }, 250);
  } catch (err) { log.warn("tidy usage card", err); }
});

/* ── damage at 0 HP ──────────────────────────────────────────────────────── */

Hooks.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => {
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
});

/* ── conditions on the HUD portrait ──────────────────────────────────────── */

const ruleText = new Map();

async function tooltipFor(effect) {
  const own = effect.description ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(effect.description) : "";
  if (own) return own;
  for (const s of effect.statuses ?? []) {
    const ref = CONFIG.DND5E?.conditionTypes?.[s]?.reference ?? CONFIG.DND5E?.statusEffects?.[s]?.reference;
    if (!ref) continue;
    if (!ruleText.has(ref)) {
      ruleText.set(ref, fromUuid(ref).then(p => p?.text?.content ?? "").catch(err => { log.debug("condition rules text", err); return ""; }));
    }
    const text = await ruleText.get(ref);
    if (text) return foundry.applications.ux.TextEditor.implementation.enrichHTML(text);
  }
  return "";
}

function patchPortrait() {
  const P = CONFIG.ARGON?.PORTRAIT?.PortraitPanel;
  if (!P?.prototype?.getEffects || P.prototype._pcConditions) return;
  const own = P.prototype.getEffects;
  P.prototype._pcConditions = true;
  P.prototype.getEffects = async function (...args) {
    const list = await own.apply(this, args);
    if (!setting("portraitConditions") || !this.actor) return list;
    try {
      const all = [...this.actor.allApplicableEffects()];
      const have = new Set(list.map(e => e.uuid));
      const extra = core.portraitExtras(all.map(e => ({
        uuid: e.uuid, active: e.active, temporary: e.isTemporary, concealed: !!e.isConcealed, statuses: [...(e.statuses ?? [])]
      })));
      for (const uuid of extra) {
        if (have.has(uuid)) continue;
        const e = all.find(x => x.uuid === uuid);
        list.push({ img: e.img, name: e.name, uuid, tooltip: await tooltipFor(e) });
      }
    } catch (err) { log.warn("portrait conditions", err); }
    return list;
  };
}

Hooks.once("ready", patchPortrait);

/* ── floating canvas text in a background tab (setting scrollingTextGuard) ── */
// Area 2 console: the GM tab logged bursts of "Cannot read properties of null (reading 'off')" at
// PreciseText.destroy ← InterfaceCanvasGroup#createScrollingText (core 14.369). A tab in the
// background gets no animation frames, so every floating damage number waits in its animation; a
// canvas redraw (another scene activated) tears the scrolling-text layer down with the text in it
// and resolves the waiting animation, after which core destroys that text a second time. Now a
// hidden tab does not start floating text (nobody sees it), and destroying an already-destroyed
// PreciseText is a no-op. Core code is untouched; both are wrappers on the class prototypes.

Hooks.once("init", () => {
  try {
    const P = foundry.canvas?.containers?.PreciseText;
    if (P && !Object.hasOwn(P.prototype, "destroy")) {
      const own = P.prototype.destroy;
      Object.defineProperty(P.prototype, "destroy", {
        configurable: true, writable: true,
        value: function destroy(...args) {
          if (this.destroyed && setting("scrollingTextGuard")) return;
          return own.apply(this, args);
        }
      });
    }
    // Area 6 re-run console: 156 × "Cannot read properties of null (reading 'position')" in one
    // burst, at PIXI's `set y` ← CanvasAnimation#updateAttribute. A floating text that started while
    // the tab was visible was still waiting (the tab went to the background) when a scene change
    // destroyed it; each waiting animation then set y on the destroyed text (its transform is null)
    // and core logged the error. Setting x/y on a destroyed PreciseText is now a no-op.
    if (P && !Object.hasOwn(P.prototype, "y")) {
      for (const axis of ["x", "y"]) {
        let d = null;
        for (let proto = Object.getPrototypeOf(P.prototype); proto && !d; proto = Object.getPrototypeOf(proto)) {
          d = Object.getOwnPropertyDescriptor(proto, axis);
        }
        if (!d?.set || !d?.get) continue;
        Object.defineProperty(P.prototype, axis, {
          configurable: true, enumerable: d.enumerable,
          get() { return this.transform ? d.get.call(this) : 0; },
          set(v) {
            if (!this.transform && setting("scrollingTextGuard")) return;
            d.set.call(this, v);
          }
        });
      }
    }
    const G = foundry.canvas?.groups?.InterfaceCanvasGroup;
    const cst = G?.prototype?.createScrollingText;
    if (cst && !cst._pentaryn) {
      const wrapped = function createScrollingText(...args) {
        if (document.hidden && setting("scrollingTextGuard")) return Promise.resolve();
        return cst.apply(this, args);
      };
      wrapped._pentaryn = true;
      G.prototype.createScrollingText = wrapped;
    }
  } catch (err) { log.warn("scrolling text guard", err); }
});

/* ── a background tab posts no chat-card pop-ups (setting scrollingTextGuard) ── */
// Area 3 console: 38 × "Cannot set properties of null (setting 'hidden')" at ChatLog#postNotification
// (core 14.369) in one burst on the GM tab. A hidden tab's pop-up waits on an animation that only
// finishes once the tab is shown again; a card deleted meanwhile (a cancelled attack's tidied card,
// a cleanup) is gone from the pop-up list, and core then sets `hidden` on null. A tab nobody looks at
// gets the chat tab's unread pip instead (core's own path when pop-ups are off). ChatLog#notify is
// wrapped on the prototype; core is untouched.

Hooks.once("init", () => {
  try {
    const C = foundry.applications?.sidebar?.tabs?.ChatLog;
    const own = C?.prototype?.notify;
    if (!own || own._pentaryn) return;
    const wrapped = function notify(message, options = {}) {
      if (document.hidden && options?.newMessage && setting("scrollingTextGuard")) {
        return own.call(this, message, { ...options, newMessage: false });
      }
      return own.call(this, message, options);
    };
    wrapped._pentaryn = true;
    C.prototype.notify = wrapped;
  } catch (err) { log.warn("chat pop-up guard", err); }
});

/* ── manual dice: the Roll Resolution box takes the digits ───────────────── */
// Area 3 (P): the resolver's box was not always focused (it opens while the roll window closes, and
// the window docking moves it), so typed numbers went to the canvas and fired pentaryn-ties' 1–9
// hotkeys. The first empty box is focused on render, and a digit typed with nothing focused goes
// into it. Tied to `dockRollDialogs` (the manual-dice part of the roll-window handling).

function openResolver() {
  const R = foundry.applications?.dice?.RollResolver;
  if (!R) return null;
  let top = null;
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (!(app instanceof R) || !app.element?.isConnected) continue;
    if (!top || (Number(app.position?.zIndex) || 0) >= (Number(top.position?.zIndex) || 0)) top = app;
  }
  return top;
}

function firstEmptyBox(app) {
  const inputs = [...(app?.element?.querySelectorAll?.("input:not([disabled]):not([readonly])") ?? [])];
  return inputs.find(i => i.value === "") ?? inputs[0] ?? null;
}

Hooks.on("renderRollResolver", (app) => {
  if (!setting("dockRollDialogs")) return;
  requestAnimationFrame(() => {
    try {
      if (app.element?.contains(document.activeElement)) return;
      firstEmptyBox(app)?.focus();
    } catch (err) { log.debug("resolver focus (the player clicks the box)", err); }
  });
});

document.addEventListener("keydown", (ev) => {
  if (!/^[0-9]$/.test(ev.key) || ev.ctrlKey || ev.metaKey || ev.altKey || !setting("dockRollDialogs")) return;
  const t = ev.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return;
  const box = firstEmptyBox(openResolver());
  if (!box) return;
  // Focus moves before the key's default action, so the digit is typed into the box; core's
  // keybindings (window, bubble phase) never see it.
  ev.stopPropagation();
  box.focus();
}, true);

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

Hooks.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
  applySelfEffect(activity, results).catch(err => log.warn("self effect", err));
  steadyAim(activity).catch(err => log.warn("Steady Aim", err));
});

// The attack Steady Aim was for has been rolled: the Advantage is used; Speed 0 lasts to the turn's end.
Hooks.on("dnd5e.postRollAttack", (rolls, { subject } = {}) => {
  const actor = subject?.actor;
  if (!actor?.isOwner || !rolls?.length) return;
  const inCombat = combatContext(actor).inCombat;
  for (const e of actor.effects.filter(isSteadyAim)) {
    const left = core.steadyAimAfterAttack(e.system?.changes ?? [], { inCombat });
    const done = left ? (left.length === e.system.changes.length ? null : e.update({ "system.changes": left.map(c => ({ key: c.key, type: c.type ?? "override", value: c.value })) })) : e.delete();
    done?.catch?.(err => log.warn("Steady Aim end", err));
  }
});

/* ── Argon's drawers open by their button (setting drawerNearButton) ──────── */
// Area 3 (E2, F1): Argon opens every drawer (Use Feature, Cast Spell…) at the action row's far left,
// up to ~370 px from the Bonus-bar button that opened it and partly under the portrait. Each drawer's
// toggle is wrapped per instance (Argon builds a new panel on every button render) and places the
// open drawer above its button, kept inside the row.

function placeDrawer(button, panel) {
  const el = panel?.element;
  if (!el) return;
  if (!setting("drawerNearButton")) { el.style.left = ""; return; }
  if (!el.classList.contains("show")) return;
  const row = el.offsetParent ?? el.parentElement;
  const btn = button?.element;
  if (!row || !btn?.isConnected) return;
  el.style.left = "0px";
  // All screen measurements; Argon scales the HUD (transform: scale), so the drawer's own `left` is
  // the screen distance divided by that scale (Area 4: the Wild Shape picker sat under the portrait).
  const r = row.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const scale = row.offsetWidth ? r.width / row.offsetWidth : 1;
  // The drawer starts right of the portrait and the movement bar (the action row), and ends inside
  // the HUD element's box: that box is the drawer's containing block, so a drawer pushed past it
  // wraps its tiles onto a second row instead of overflowing.
  const lane = row.querySelector?.(":scope > .action-hud")?.getBoundingClientRect() ?? r;
  el.style.left = `${core.drawerLeft({
    buttonLeft: b.left, hudLeft: r.left, hudWidth: r.width,
    panelWidth: el.getBoundingClientRect().width + 2, minLeft: lane.left, scale   // +2: a sub-pixel short row wraps
  })}px`;
}

/** Argon's hover tooltip for a button inside a drawer that just closed stayed on screen (Area 4, D5). */
function dropDrawerTooltip(panel) {
  try {
    const t = ui.ARGON?._tooltip;
    const trigger = t?._triggerElement;
    if (!t || !trigger || !panel?.element?.contains?.(trigger)) return;
    game.tooltip?.deactivate?.();
    t._destroy?.(true);
    if (ui.ARGON._tooltip === t) ui.ARGON._tooltip = null;
  } catch (err) { log.debug("drawer tooltip", err); }   // never let tooltip hygiene break a click
}

Hooks.on("renderButtonPanelButtonArgonComponent", (button) => {
  try {
    const panel = button?.panel;
    if (!panel || panel._pcNear || typeof panel.toggle !== "function") return;
    panel._pcNear = true;
    const own = panel.toggle;
    panel.toggle = function (...args) {
      const out = own.apply(this, args);
      try { placeDrawer(button, this); } catch (err) { log.debug("place drawer (Argon's place)", err); }
      if (!this.element?.classList?.contains("show")) dropDrawerTooltip(this);
      return out;
    };
    // Area 10: a bar re-render (Pole Strike appearing) builds a new drawer that Argon reopens from
    // its saved state inside its own render, before this wrapper exists, so it opened at the HUD's
    // far left, detached from its button. Place it once the bar has laid out.
    if (panel.element?.classList?.contains("show")) placeWhenLaidOut(button, panel);
  } catch (err) { log.debug("drawer wrap", err); }   // never break Argon's render
});

/**
 * Place an open drawer once its button is on the page. A whole-HUD render (a new turn) attaches the
 * bars after the buttons render, so one frame was not always enough and a restored drawer stayed at
 * Argon's far left, over the Action bar's Cast Spell (Area 3 re-run, F1). Up to ~10 frames.
 */
function placeWhenLaidOut(button, panel, tries = 10) {
  requestAnimationFrame(() => {
    try {
      if (!panel?.element?.classList?.contains("show")) return;
      const btn = button?.element;
      if (btn?.isConnected && btn.getBoundingClientRect().width > 0) placeDrawer(button, panel);
      else if (tries > 1) placeWhenLaidOut(button, panel, tries - 1);
    } catch (err) { log.debug("place drawer when laid out (Argon's place)", err); }
  });
}

/** Re-place the open drawers of a bar whose buttons moved (hud.mjs calls it after recomposing). */
export function placeOpenDrawers(actionPanel) {
  for (const b of actionPanel?._buttons ?? []) {
    const p = b?.panel;
    if (!p?.element?.classList?.contains?.("show")) continue;
    placeWhenLaidOut(b, p);
  }
}

/**
 * A turn boundary closes the drawers (Cast Spell, Use Feature…) left open on the HUD of the creature
 * whose turn ended or began, and forgets that they were open: Argon restores a drawer from its saved
 * panel state on every render, so the Paladin's Bonus-bar Cast Spell drawer from F1 was open again at
 * the start of the next turn (Area 3 re-run). Setting drawerNearButton.
 */
function closeDrawersOf(actors) {
  try {
    if (!setting("drawerNearButton")) return;
    const hud = ui.ARGON;
    const states = hud?._hudState;
    let shown = false;
    for (const actor of actors) {
      if (!actor) continue;
      const state = states?.get?.(actor);
      if (state && typeof state === "object") {
        for (const v of Object.values(state)) if (v && typeof v === "object" && "visible" in v) v.visible = false;
      }
      if (hud?._actor === actor) shown = true;
    }
    if (shown) hud.collapseAllPanels?.();
  } catch (err) { log.debug("close drawers", err); }   // never break a turn change
}

/* ── Argon's pips: one updateActionUse call always settles them ──────────── */
// Argon's ActionPanel#updateActionUse rebuilds the pips when their count differs from maxActions
// (an empty container mid-render included), then marks the OLD, now-detached list as used. Its own
// updateActor handler hit that while the Bonus bar was re-rendering after Starry Form, so the Bonus
// pip stayed lit with isActionUsed true (Area 4, D5). Our callers already called it twice ("twice
// settles it"); now every caller does, Argon's own included. Pure bug fix, no setting.

Hooks.once("ready", () => {
  try {
    const proto = CONFIG.ARGON?.MAIN?.ActionPanel?.prototype;
    if (!proto?.updateActionUse || proto.updateActionUse._pcSettles) return;
    const own = proto.updateActionUse;
    const settled = function (...args) {
      const before = this.element?.querySelector?.(".actions-uses-container")?.children?.length ?? null;
      const out = own.apply(this, args);
      const after = this.element?.querySelector?.(".actions-uses-container")?.children?.length ?? null;
      if (before !== after) own.apply(this, args);
      return out;
    };
    settled._pcSettles = true;
    proto.updateActionUse = settled;
  } catch (err) { log.warn("Argon pip settle not installed", err); }
});

/* ── Argon's movement readout follows your Speed (Area 10) ───────────────── */
// Argon redraws the "6/6" movement readout only when the token moves. After Dash (an effect adding
// your Speed) it kept the old maximum, and when Dash ended with no move since, it kept the doubled
// one into the next turn. Any effect change on the HUD's actor, or a Speed edit, redraws it now.
// Pure bug fix, no setting.

function redrawMovement() {
  try {
    const m = ui.ARGON?.components?.movement;
    if (m?.element?.isConnected && ui.ARGON?._token && typeof m.updateMovement === "function") m.updateMovement();
  } catch (err) { log.debug("movement redraw (the next move redraws it)", err); }
}

let movementQueued = false;
function queueMovement(actor) {
  if (!actor || actor !== ui.ARGON?._actor || movementQueued) return;
  movementQueued = true;
  // After dnd5e has prepared the actor again with the effect in or out.
  setTimeout(() => { movementQueued = false; redrawMovement(); }, 50);
}

for (const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
  Hooks.on(hook, (effect) => queueMovement(effect?.parent));
}
Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.hasProperty(changes ?? {}, "system.attributes.movement")) queueMovement(actor);
});
Hooks.on("combatTurnChange", () => queueMovement(ui.ARGON?._actor));
