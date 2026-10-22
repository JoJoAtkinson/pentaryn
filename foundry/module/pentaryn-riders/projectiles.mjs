/**
 * Pentaryn Feature Riders — FEATURE: one roll per ray or dart (feedback JbnAbX, ixcdvA).
 * =====================================================================================
 *
 * Scorching Ray hurls 3 rays (one more per slot level above 2), each its own ranged spell attack at
 * a creature of the caster's choice; Magic Missile makes 3 darts (one more per level above 1), each
 * 1d4 + 1 at a creature of the caster's choice. dnd5e 6 (and the PHB items) give each spell ONE
 * activity that rolls once: after the cast dnd5e rolls the first attack / damage and the card keeps a
 * single Attack / Damage button, so a player saw "one beam" and "one dart". Magic Missile's Damage
 * button also re-uses the targets stored on the card at cast time, so a second dart could never go
 * to another creature.
 *
 * On the usage card of a PROJECTILES spell (riders-core) we add one button per ray / dart, counted
 * from the level it was cast at (`castLevelOf` + `projectileCount`; a wand's extra charges are the
 * card's `system.scaling`). Each button rolls that ray's attack (Scorching Ray) or that dart's damage
 * (Magic Missile) at the creature the player targets when clicking it, exactly as the card's own
 * button would (dnd5e threads the roll under the card through the click's `[data-message-id]`). A
 * rolled slot shows who it went at. Every roll already threaded under the card counts — dnd5e's own
 * card button included — so the slots never double-count. Damage after a ray that hits is
 * pentaryn-aoe's (autoDamageOnHit) or the card's Damage button, as before. The buttons carry
 * `data-action="prShot"` only so the feedback recorder logs their clicks (5wv0Iq had none); the click
 * handler stops propagation, so dnd5e's and ChatLog's `[data-action]` handlers never see one.
 *
 * The buttons are the one way to roll (feedback 5wv0Iq / MMLx5X, Marwen's wand). Until 0.5.2 dnd5e
 * also rolled the first dart / ray on its own right after the cast (`_triggerSubsequentActions`), so
 * every cast opened a Damage (Attack) dialog, then the player clicked Dart 1 and got a second one.
 * The card itself sat in a chat notification when the sidebar was not on Chat, and core dismisses
 * those 5 s after they appear once the pointer leaves them (moving to that dialog was enough), so the
 * buttons "disappeared". In `dnd5e.postUseActivity` (on the caster's own client, an owner) we now set
 * the use's `subsequentActions` false — dnd5e reads it right after the hook; the only other thing it
 * skips is the `flags.dnd5e.consumed` stamp, which is Hit Dice only — and, when the chat log is not on
 * screen (sidebar collapsed or on another tab, no chat popout), open the sidebar on Chat so the card
 * stays (client setting projectileChatTab). Hook order there: cast-flow's Arcane Recovery, Battle
 * Medic, then this; pentaryn-aoe's refund may return false first for an area spell (none of these),
 * and pentaryn-combat's action count on the same hook is unaffected.
 *
 * One creature per projectile: with more than one target the click is refused with a toast; with
 * none it rolls untargeted (the GM can still apply the damage by hand).
 *
 * Only the caster's owners see the buttons. When a roll is made from (or removed from) the card, the
 * card is re-rendered on every client so the slots follow: dnd5e 6.0.6 does that itself
 * (`ChatMessage5e#_onCreate` / `#_onDelete` → `#refreshOrigin` → `ui.chat.updateMessage(origin)`,
 * the registry untracked first on delete), so this file adds no hook of its own for it.
 * Uninstall removes the drawn buttons from every rendered card. Settings pentaryn-riders.projectiles
 * (world: buttons and no automatic roll) and projectileChatTab (client: open Chat on the cast).
 * Row dnd5e-riders-projectile-buttons.
 */

import { castLevelOf, projectileCount, projectileRule, projectileSlots } from "./riders-core.mjs";
import { settingOr } from "./settings.mjs";

let log = null;

/** Literal i18n keys per noun (the i18n gate proves each one). */
const TEXT = Object.freeze({
  ray: Object.freeze({
    slot: "PENTARYN_RIDERS.projectiles.ray.slot",
    status: "PENTARYN_RIDERS.projectiles.ray.status",
    oneTarget: "PENTARYN_RIDERS.projectiles.ray.oneTarget"
  }),
  dart: Object.freeze({
    slot: "PENTARYN_RIDERS.projectiles.dart.slot",
    status: "PENTARYN_RIDERS.projectiles.dart.status",
    oneTarget: "PENTARYN_RIDERS.projectiles.dart.oneTarget"
  })
});
const NO_TARGET = "PENTARYN_RIDERS.projectiles.noTarget";

/* ── reading a usage card ───────────────────────────────────────────────── */

/** The card's id as a roll message stores it (the live field resolves to the message; the source keeps the id). */
function originId(message) {
  const o = message?._source?.system?.origin ?? message?.system?.origin ?? null;
  return typeof o === "string" ? o : (o?.id ?? null);
}

/**
 * What a usage card is, for this feature: `{ rule, activity, count }`, or null for any other card.
 * The activity is the live one (an upcast clone is made at click time).
 */
export function projectileCard(message) {
  if (message?.type !== "usage") return null;
  const activity = message.getAssociatedActivity?.() ?? null;
  const item = activity?.item ?? message.getAssociatedItem?.() ?? null;
  if (!activity || !item) return null;
  const rule = projectileRule({ identifier: item.system?.identifier, name: item.name, type: item.type, activityType: activity.type });
  if (!rule) return null;
  const castLevel = castLevelOf({ baseLevel: item.system?.level, scaling: message.system?.scaling, level: message.system?.level });
  return { rule, activity, item, castLevel, count: projectileCount(rule, castLevel) };
}

/** The rolls already threaded under the card, of the rule's kind, oldest first: `[{ targets: [name] }]`. */
function rolledFrom(message, rule) {
  let rolls = null;
  try { rolls = message.getAssociatedRolls?.(rule.roll) ?? null; } catch (err) { log.debug("associated rolls unread", err); }
  if (!Array.isArray(rolls)) {
    // No registry (an older dnd5e): the chat log, filtered by the card id in the source.
    rolls = (game.messages?.contents ?? []).filter(m => m?.type === rule.roll && originId(m) === message.id);
  }
  return rolls
    .filter(Boolean)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .map(m => ({ targets: (m.system?.targets ?? []).map(t => t?.name).filter(Boolean) }));
}

/* ── the buttons ────────────────────────────────────────────────────────── */

function slotButton(message, text, slot, isNext) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pr-shot";
  b.dataset.prShot = String(slot.n);
  const label = _loc(text.slot, { n: slot.n });
  if (slot.done) {
    b.disabled = true;
    b.classList.add("pr-shot-done");
    b.textContent = slot.targets.length ? `${label} · ${slot.targets.join(", ")}` : label;
  } else {
    b.textContent = label;
    b.dataset.action = "prShot";
    if (isNext) b.classList.add("pr-shot-next");
    b.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (b.disabled) return;
      return shoot(event, message, b).catch(err => log.warn("projectile roll failed", err));
    });
  }
  return b;
}

function render(message, html) {
  // Only usage cards: every other card (rolls, saves, concentration) is left untouched.
  if (message?.type !== "usage" || !html?.querySelector) return;
  html.querySelector(".pr-shots")?.remove();
  if (!settingOr("projectiles", false)) return;
  const card = projectileCard(message);
  if (!card || !card.count) return;
  const actor = card.activity.actor;
  if (!(actor?.isOwner ?? message.isAuthor)) return;

  const text = TEXT[card.rule.noun];
  const plan = projectileSlots(card.count, rolledFrom(message, card.rule));
  const box = document.createElement("div");
  box.className = "pr-shots";
  const status = document.createElement("p");
  status.className = "supplement pr-shots-status";
  status.textContent = _loc(text.status, { done: plan.done, count: plan.count, level: card.castLevel });
  box.append(status);
  const row = document.createElement("div");
  row.className = "pr-shots-row";
  for (const slot of plan.slots) row.append(slotButton(message, text, slot, slot.n === plan.next));
  box.append(row);

  const content = html.querySelector(".message-content") ?? html;
  const buttons = content.querySelector(".card-buttons");
  if (buttons) buttons.after(box);
  else content.append(box);
}

/**
 * Roll one ray's attack / one dart's damage from the card. The click event carries the card's
 * `[data-message-id]`, so dnd5e threads the roll under it (BasicRoll.buildPost), as its own button
 * does; the upcast card's scaling is kept (the item's scaled clone).
 */
async function shoot(event, message, button) {
  const card = projectileCard(message);
  if (!card) return;
  const text = TEXT[card.rule.noun];
  const targets = game.user?.targets?.size ?? 0;
  if (targets > 1) { log.notify("warn", _loc(text.oneTarget)); return; }
  if (!targets) log.notify("info", _loc(NO_TARGET));
  const scaling = Number(message.system?.scaling) || 0;
  const activity = scaling ? (message.getAssociatedActivity?.({ scaled: true }) ?? card.activity) : card.activity;
  button.disabled = true;
  try {
    if (card.rule.roll === "attack") await activity.rollAttack({ event });
    else await activity.rollDamage({ event });
  } finally {
    button.disabled = false;
  }
}

function onRender(message, html) {
  try { render(message, html); } catch (err) { log.warn("projectile buttons skipped", err); }
}

/* ── the cast: buttons only, on a card that stays ───────────────────────── */

/**
 * Is the chat log on screen on this client: the sidebar open on Chat, or the chat popout rendered?
 * Anything else shows a new card only as a chat notification (dismissed after core's 5 s once the
 * pointer leaves it), or nowhere (notifications set to "pip", a narrow window), so we do not mirror
 * `ChatLog#_shouldShowNotifications`: its `false` also means "nowhere".
 */
export function chatLogVisible() {
  const sidebar = ui.sidebar;
  const chat = ui.chat;
  if (chat?.popout?.rendered) return true;
  return !!sidebar?.expanded && (chat?.active ?? sidebar.tabGroups?.primary === "chat");
}

/** Open the sidebar on Chat when the chat log is not on screen. True when it moved the sidebar. */
function showChatLog() {
  if (!ui.sidebar || chatLogVisible()) return false;
  if (!ui.sidebar.expanded) ui.sidebar.expand();
  ui.sidebar.changeTab("chat", "primary");
  return true;
}

/**
 * dnd5e.postUseActivity (a Hooks.call: never return false): a PROJECTILES spell rolls from its card
 * buttons only, and its card opens where it stays. Synchronous: dnd5e reads `subsequentActions` as
 * soon as the listeners return.
 */
function onUsed(activity, usage, results) {
  try {
    if (!settingOr("projectiles", false)) return;
    const item = activity?.item;
    if (!item?.actor?.isOwner) return;
    if (!projectileRule({ identifier: item.system?.identifier, name: item.name, type: item.type, activityType: activity.type })) return;
    if (usage) usage.subsequentActions = false;
  } catch (err) { log.warn("projectile cast: dnd5e's automatic roll left on", err); return; }
  try {
    if (results?.message && settingOr("projectileChatTab", false)) showChatLog();
  } catch (err) { log.warn("projectile cast: chat tab not opened", err); }
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("dnd5e.renderChatMessage", onRender, { guard: false, label: "projectile buttons" });
  reg.on("dnd5e.postUseActivity", onUsed, { guard: false, label: "projectile: card buttons only" });
}

/** Uninstall: the buttons already drawn leave every rendered card (chat log, popouts, notifications). */
export function uninstall() {
  try {
    for (const box of globalThis.document?.querySelectorAll?.(".pr-shots") ?? []) box.remove();
  } catch (err) { log?.debug?.("projectile buttons left on rendered cards", err); }
}
