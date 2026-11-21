/**
 * After a long rest: one card (feedback pcuOX7 Talo, gWNXLN Caven; triage G1 with G3 as fallback).
 * ====================================================================================================
 *
 * FEATURE: install(reg, ctx) / uninstall(). The rules are `REST_RULES` in riders-core.mjs, one row
 * per thing a long rest offers; the actor reads are shapes.mjs's. No Portent row until a Diviner
 * sits at the table (the 2026-11-07 review).
 *
 * 1. The card. `dnd5e.restCompleted` fires on the resting client (a `callAll`, once). For a long
 *    rest by an owner, with at least one rule matching, one card is whispered to the actor's players
 *    (and the resting user): a title and, drawn at render time from the message's `rest` flag, one
 *    row per rule with a button — so the card shows the day's state, not the state when it was
 *    posted, and a reload keeps the buttons. The rest also clears the omen stored the day before
 *    (one batched item update).
 *    - Cosmic Omen (Talo): "Read the stars" rolls 1d6 (one roll message) and stores
 *      `flags.pentaryn-riders.omen = "weal" | "woe"` on the feat (even / odd, PHB). The stars are read
 *      once a day: with an omen already stored, `readOmen` answers it and rolls nothing, so a stale
 *      button on another client's card (or the API) can never flip the day's omen. The flag write
 *      reaches every client as `updateItem`, and each one redraws the rest cards it has rendered for
 *      that actor (`ui.chat.updateMessage`), so the button goes everywhere and the row names the omen;
 *      the next rest's clear brings the button back the same way.
 *    - Prepared spells (a caster whose spells prepare): "Review prepared spells" switches this user's
 *      Spells view for the character to All (spell-view.mjs, through `ctx.exposed.setSpellView`) and
 *      opens the sheet on the Spells tab.
 *
 * 2. The omen on the HUD and the sheet. With an omen stored, the Cosmic Omen button on Argon's
 *    Reaction bar gets a badge (`renderItemButtonArgonComponent`; Argon re-renders a button when its
 *    item changes, so the flag write refreshes it). Argon draws one button per ITEM unless its
 *    `explodeItemActivities` setting splits it (weapons only by default, never a feat): that button
 *    stands for both activities, is never greyed, and its badge names the omen ("Weal" / "Woe"); the
 *    click goes to dnd5e's "which activity?" dialog, where today's is badged and the other disabled
 *    (`renderActivityChoiceDialog`). When Argon does split the item (one button per activity,
 *    `button.isActivity`), the omen's button gets the "today's omen" badge and the other is greyed.
 *    0.7.0–0.7.1 read `button.activity` on the single button — Argon's getter answers the item's FIRST
 *    activity there (Weal) — and greyed it against a stored Woe (live 2026-11-07, Talo). The pure rule
 *    is `omenButtonMark` (riders-core). Every mark goes when the next long rest clears the flag.
 *    With no omen stored yet (d3rePk: Talo clicked Woe, the die rolled 2 and Weal ran), the die decides:
 *    the HUD button(s) get a "the die decides" badge, and the choice dialog one "Read the stars (1d6): the
 *    die decides" line above its buttons, each omen's button badged the same; nothing is greyed.
 *
 * 3. Use it and the stars decide (G3). On `dnd5e.preUseActivity` (sync, a `Hooks.call`) a Cosmic
 *    Omen activity used by an owner is checked against the stored omen: a match goes through. No omen
 *    stored (the player was offline for the rest, or closed the card) → the use is stopped with a
 *    literal `false`, the omen is rolled and stored as the button would, and the activity of that
 *    omen is used in its place (`usage.pentaryn.omen` marks the re-call so it is not stopped again).
 *    The wrong activity with an omen stored → stopped and redirected the same way, with one notice.
 *    When this use rolled the omen, the notice names the face: "You picked Woe (Odd), but the stars
 *    rolled 2: Weal (even)".
 *    The redirected use keeps the click's event and dialog choice; the chosen activity's own uses and
 *    dialog apply as on a direct click.
 *
 * Setting pentaryn-riders.restCard (world, default on) turns all three parts off (marks already
 * drawn are cleared on the next render). Row dnd5e-riders-rest-card (waiting in the batch file).
 */

import { MODULE, omenActivityFor, omenButtonMark, omenOf, omenOfActivity, restRuleByKey } from "./riders-core.mjs";
import { settingOr } from "./settings.mjs";
import { cosmicOmenOf, isCosmicOmen, restRulesOf, storedOmen } from "./shapes.mjs";
import { flagPath } from "./lib/flags.mjs";

let log = null;
let exposed = null;   // ctx.exposed: spell-view's setSpellView

const enabled = () => settingOr("restCard", false);

const T = Object.freeze({
  title: "PENTARYN_RIDERS.rest.title",
  omenLabel: "PENTARYN_RIDERS.rest.omen.label",
  read: "PENTARYN_RIDERS.rest.omen.read",
  readTip: "PENTARYN_RIDERS.rest.omen.readTip",
  weal: "PENTARYN_RIDERS.rest.omen.weal",
  woe: "PENTARYN_RIDERS.rest.omen.woe",
  flavor: "PENTARYN_RIDERS.rest.omen.flavor",
  today: "PENTARYN_RIDERS.rest.omen.today",
  wealShort: "PENTARYN_RIDERS.rest.omen.wealShort",
  woeShort: "PENTARYN_RIDERS.rest.omen.woeShort",
  redirect: "PENTARYN_RIDERS.rest.omen.redirect",
  redirectStored: "PENTARYN_RIDERS.rest.omen.redirectStored",
  decides: "PENTARYN_RIDERS.rest.omen.decides",
  decidesLine: "PENTARYN_RIDERS.rest.omen.decidesLine",
  gone: "PENTARYN_RIDERS.rest.omen.gone",
  spellsLabel: "PENTARYN_RIDERS.rest.spells.label",
  review: "PENTARYN_RIDERS.rest.spells.review",
  reviewTip: "PENTARYN_RIDERS.rest.spells.reviewTip",
});

/** "Weal (even)" / "Woe (odd)". */
const omenLabel = omen => _loc(omen === "weal" ? T.weal : T.woe);

/* ── the omen ──────────────────────────────────────────────────────────── */

/**
 * The day's omen for `actor`'s Cosmic Omen (`item`, else the actor's). Read once a day: an omen
 * already stored is answered as it is (`rolled: false`, no roll, no write); otherwise 1d6 is rolled
 * and posted and the omen stored on the live feat. Returns `{ omen, face, item, rolled }` (`face`
 * null when nothing was rolled), or null without a Cosmic Omen.
 */
export async function readOmen(actor, item = cosmicOmenOf(actor)) {
  const live = (item && actor?.items?.get?.(item.id)) ?? item;
  if (!live) return null;
  const stored = storedOmen(live);
  if (stored) return { omen: stored, face: null, item: live, rolled: false };
  const roll = await new Roll("1d6").evaluate();
  const omen = omenOf(roll.total);
  if (!omen) return null;
  await live.setFlag(MODULE, "omen", omen);
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: _loc(T.flavor, { omen: omenLabel(omen) }) });
  log.info("Cosmic Omen read", { uuid: live.uuid, omen, face: roll.total, by: game.user.id });
  return { omen, face: roll.total, item: live, rolled: true };
}

/* ── 1. the card ───────────────────────────────────────────────────────── */

/**
 * Whisper the long-rest card for `actor` (the resting client, or the API). Clears a stored omen
 * first, as a new day does. Returns `{ rules: string[], message: string|null }`.
 */
export async function postRestCard(actor) {
  const rules = restRulesOf(actor);
  if (!rules.length) return { rules: [], message: null };
  const clear = rules
    .filter(r => r.item && storedOmen(actor.items.get(r.item)))
    .map(r => ({ _id: r.item, [flagPath(MODULE, "omen")]: _del }));
  if (clear.length) await actor.updateEmbeddedDocuments("Item", clear);
  const players = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id);
  const whisper = [...new Set([...players, game.user.id])];
  const title = _loc(T.title, { name: actor.name });
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper,
    content: `<p class="pr-rest-title">${foundry.utils.escapeHTML(title)}</p>`,
    flags: { [MODULE]: { rest: { actor: actor.uuid, type: "long", rules } } },
  });
  return { rules: rules.map(r => r.key), message: message?.id ?? null };
}

// dnd5e.restCompleted is a callAll on the resting client only: the owner's, so no election.
function onRestCompleted(actor, result, config) {
  try {
    if (config?.type !== "long" || !enabled() || !actor?.isOwner) return;
    postRestCard(actor).catch(err => log.warn("rest card not posted", err));
  } catch (err) { log.warn("rest card skipped", err); }
}

/* ── the card's rows, drawn at render ──────────────────────────────────── */

function restOf(message) {
  const rest = message?.flags?.[MODULE]?.rest;
  return Array.isArray(rest?.rules) && rest.rules.length ? rest : null;
}

function actorOf(uuid) {
  try { return fromUuidSync(uuid) ?? null; } catch (err) { log.debug("rest card actor unresolved", err); return null; }
}

function stateSpan(text) {
  const s = document.createElement("span");
  s.className = "pr-rest-state";
  s.textContent = text;
  return s;
}

function actionButton(label, tip, run) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pr-rest-btn";
  b.dataset.action = "prRest";
  b.dataset.tooltip = tip;
  b.textContent = label;
  b.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (b.disabled) return;
    b.disabled = true;
    return run().catch(err => log.warn("rest card action failed", err)).finally(() => { b.disabled = false; });
  });
  return b;
}

async function reviewSpells(actor) {
  await exposed?.setSpellView?.(actor, "all");
  const sheet = actor.sheet;
  if (!sheet) return;
  await sheet.render({ force: true, tab: { primary: "spells" } });
  if (sheet.tabGroups?.primary !== "spells") sheet.changeTab?.("spells", "primary");
}

function render(message, html) {
  if (!html?.querySelector) return;
  html.querySelector(".pr-rest")?.remove();
  const rest = restOf(message);
  if (!rest || !enabled()) return;
  const actor = actorOf(rest.actor);
  if (!actor) return;
  const owner = !!actor.isOwner;
  const box = document.createElement("div");
  box.className = "pr-rest";
  for (const row of rest.rules) {
    const rule = restRuleByKey(row.key);
    if (!rule) continue;
    const line = document.createElement("div");
    line.className = "pr-rest-row";
    line.dataset.prRule = rule.key;
    const label = document.createElement("span");
    label.className = "pr-rest-label";
    if (rule.action === "omen") {
      label.textContent = _loc(T.omenLabel);
      line.append(label);
      const item = (row.item && actor.items.get(row.item)) || cosmicOmenOf(actor);
      const omen = storedOmen(item);
      if (!item) line.append(stateSpan(_loc(T.gone)));
      else if (omen) line.append(stateSpan(omenLabel(omen)));
      else if (owner) {
        line.append(actionButton(_loc(T.read), _loc(T.readTip), async () => {
          await readOmen(actor, item);
          ui.chat?.updateMessage?.(message);
        }));
      }
    } else if (rule.action === "spellView") {
      if (!owner) continue;
      label.textContent = _loc(T.spellsLabel);
      line.append(label, actionButton(_loc(T.review), _loc(T.reviewTip), () => reviewSpells(actor)));
    } else continue;
    if (line.children.length < 2) continue;   // a label alone says nothing: no state, no button for this viewer
    box.append(line);
  }
  if (!box.children.length) return;
  const content = html.querySelector(".message-content") ?? html;
  content.append(box);
}

function onRender(message, html) {
  try { render(message, html); } catch (err) { log.warn("rest card skipped", err); }
}

/* ── the cards follow the omen, on every client ────────────────────────── */

/** Redraw every rest card rendered on this client for `actor` (the chat log, its popout, the notifications). */
function refreshRestCards(actor) {
  const chat = ui.chat;
  const uuid = actor?.uuid;
  if (!uuid || typeof chat?.updateMessage !== "function") return;
  const seen = new Set();
  for (const el of globalThis.document?.querySelectorAll?.(".chat-message[data-message-id]") ?? []) {
    const id = el.dataset?.messageId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const message = game.messages?.get?.(id);
    if (restOf(message)?.actor === uuid) chat.updateMessage(message);
  }
}

// updateItem reaches every client: the omen stored (Read the stars, the first use, the API) or cleared
// (the next rest) redraws that actor's rendered cards here, so no client keeps a live button.
function onItemUpdated(item, changes) {
  try {
    if (!changes?.flags?.[MODULE] || !isCosmicOmen(item)) return;
    refreshRestCards(item.actor);
  } catch (err) { log.warn("rest card refresh skipped", err); }
}

/* ── 2. the omen on the HUD and the sheet ──────────────────────────────── */

function badge(text = _loc(T.today)) {
  const b = document.createElement("span");
  b.className = "pr-omen-badge";
  b.textContent = text;
  return b;
}

/**
 * The activity an Argon item button stands for, or null when it stands for the whole item. Argon's
 * `DND5eItemButton` is built from an Item or, when the layer's `explodeItemActivities` setting splits the
 * item (weapons only by default), from one Activity (`_item`; `isActivity` says which). Its `activity`
 * getter answers the item's FIRST activity on an item button, so that field alone cannot tell the two
 * apart. Without `isActivity` (another HUD, a test double) an `_item` that is not the item is the activity.
 */
function argonButtonActivity(button) {
  const raw = button._item;
  const perActivity = typeof button.isActivity === "boolean"
    ? button.isActivity
    : raw != null && raw !== button.item && !raw.system?.activities;
  return perActivity ? (raw ?? button.activity ?? null) : null;
}

function markArgonButton(button) {
  try {
    const el = button?.element;
    const item = button?.item;
    if (!el || item?.documentName !== "Item" || !isCosmicOmen(item)) return;
    el.querySelector(":scope > .pr-omen-badge")?.remove();
    const activity = argonButtonActivity(button);
    const on = enabled();
    const omen = on ? storedOmen(item) : null;
    const mark = omenButtonMark({ omen, perActivity: !!activity, kind: omenOfActivity(activity), unread: on && !omen });
    el.classList.toggle("pr-omen-off", mark.off);
    if (mark.badge === "die") el.append(badge(_loc(T.decides)));
    else if (mark.badge) el.append(badge(mark.named ? _loc(mark.badge === "weal" ? T.wealShort : T.woeShort) : _loc(T.today)));
  } catch (err) { log.warn("Cosmic Omen HUD mark skipped", err); }
}

/**
 * No omen stored (d3rePk): both choices would look selectable, then one is overridden by the roll. The
 * dialog says the die decides instead: one line above the buttons, and each omen's button badged. The
 * dialog itself stays (a click still rolls and runs the day's activity, part 3).
 */
function markUnread(root, buttons) {
  root.querySelector?.(".pr-omen-decides")?.remove();
  if (!buttons.length) return;
  for (const b of buttons) {
    b.classList.add("pr-omen-die");
    if (!b.querySelector(".pr-omen-badge")) b.append(badge(_loc(T.decides)));
  }
  const line = document.createElement("p");
  line.className = "pr-omen-decides";
  line.textContent = _loc(T.decidesLine);
  const list = buttons[0].closest?.("menu, ul, ol") ?? buttons[0];
  list.before(line);
}

function markChoiceDialog(app, element) {
  try {
    const item = app?.item;
    if (!enabled() || !isCosmicOmen(item)) return;
    const omen = storedOmen(item);
    const root = element instanceof HTMLElement ? element : app.element;
    const omenButtons = [...(root?.querySelectorAll?.("button[data-activity-id]") ?? [])]
      .filter(b => omenOfActivity(item.system?.activities?.get?.(b.dataset.activityId)));
    if (!omen) { if (root) markUnread(root, omenButtons); return; }
    for (const b of omenButtons) {
      const kind = omenOfActivity(item.system?.activities?.get?.(b.dataset.activityId));
      if (kind === omen) {
        b.classList.add("pr-omen-today");
        if (!b.querySelector(".pr-omen-badge")) b.append(badge());
      } else {
        b.classList.add("pr-omen-off");
        b.disabled = true;
      }
    }
  } catch (err) { log.warn("Cosmic Omen choice mark skipped", err); }
}

/* ── 3. use it and the stars decide (G3) ───────────────────────────────── */

async function redirect(actor, item, clicked, stored, usageConfig, dialogConfig) {
  let omen = stored;
  let face = null;   // the die's face when this use read the stars (kept for the notice, d3rePk)
  if (!omen) {
    const read = await readOmen(actor, item);
    omen = read?.omen ?? null;
    face = read?.rolled ? read.face : null;
  }
  if (!omen) return;
  const live = actor.items.get(item.id) ?? item;
  const target = omenActivityFor(live.system?.activities ?? [], omen);
  if (!target) { log.notify("warn", _loc(T.gone)); return; }
  if (target.id !== clicked.id) {
    log.notify("info", face !== null
      ? _loc(T.redirect, { clicked: clicked.name, face, omen: omenLabel(omen) })
      : _loc(T.redirectStored, { omen: omenLabel(omen), activity: target.name }));
  }
  // the click's own usage and dialog config, so the day's activity is used exactly as the clicked one would have been
  const usage = { ...(usageConfig ?? {}), pentaryn: { ...(usageConfig?.pentaryn ?? {}), omen: true } };
  await target.use(usage, { ...(dialogConfig ?? {}) }, {});
}

// Synchronous, a literal `false` (dnd5e.preUseActivity is a Hooks.call); never GM-gated: the owner's click.
function omenCheck(activity, usageConfig, dialogConfig) {
  try {
    if (!enabled() || usageConfig?.pentaryn?.omen) return;
    const item = activity?.item;
    const actor = item?.actor;
    if (!actor?.isOwner || !isCosmicOmen(item)) return;
    const kind = omenOfActivity(activity);
    if (!kind) return;
    const stored = storedOmen(item);
    if (stored === kind) return;
    redirect(actor, item, activity, stored, usageConfig, dialogConfig).catch(err => log.warn("Cosmic Omen redirect failed", err));
    return false;
  } catch (err) { log.warn("Cosmic Omen check skipped", err); }
}

/* ── wiring ────────────────────────────────────────────────────────────── */

export function install(reg, ctx) {
  log = ctx.log;
  exposed = ctx.exposed;
  reg.on("dnd5e.restCompleted", onRestCompleted, { guard: false, label: "rest card" });
  reg.on("dnd5e.renderChatMessage", onRender, { guard: false, label: "rest card rows" });
  reg.on("updateItem", onItemUpdated, { guard: false, label: "rest card refresh" });
  reg.on("dnd5e.preUseActivity", omenCheck, { guard: false, label: "Cosmic Omen: the stars decide" });
  reg.on("renderActivityChoiceDialog", markChoiceDialog, { guard: false, label: "Cosmic Omen choice mark" });
  reg.on("renderItemButtonArgonComponent", markArgonButton, { guard: false, label: "Cosmic Omen HUD mark" });
  ctx.expose({ restCard: postRestCard, readOmen: actor => readOmen(actor) });
}

/** The drawn rows and marks leave every rendered card and button; the flags stay. */
export function uninstall() {
  try {
    const doc = globalThis.document;
    for (const el of doc?.querySelectorAll?.(".pr-rest, .pr-omen-badge, .pr-omen-decides") ?? []) el.remove();
    for (const el of doc?.querySelectorAll?.(".pr-omen-off, .pr-omen-die") ?? []) el.classList.remove("pr-omen-off", "pr-omen-die");
  } catch (err) { log?.debug?.("rest card rows left on rendered cards", err); }
}
