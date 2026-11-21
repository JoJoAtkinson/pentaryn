/**
 * Part I — Apply from the card (feedback OrwZqP, DnK6lE, OnvqIi; plan clusters B relay, late targets, B5).
 *
 * dnd5e's `allowPlayerDamageTray` is on: players get dnd5e's own Apply tray (`<damage-application>`)
 * on every damage and healing card they can see. Three gaps stay, and this Part closes them without
 * a prompt, a dialog or a mode:
 *
 *   relay         dnd5e's Apply skips a target the user does not own (Talo heals Caven: nobody owns
 *                 another PC here). The rows the user does not own go to the active GM's client as one
 *                 query (`pentaryn-aoe.applyRelay`), which applies them with the same multiplier and
 *                 pill-menu choices. The click is the decision; the player hears from this module only
 *                 when the relay did not land (one toast: no GM, no answer in time, or the GM's client
 *                 refused or failed — never silence, 0.6.2). Rows the user may not have applied through
 *                 the GM (not the card's author, not the owner of its actor: the GM's breath weapon on
 *                 two PCs) are skipped silently, as dnd5e skips them. A save spell's card (one that
 *                 carries a Part B resolution) relays nothing for a player: since 0.6.4 its rows are
 *                 the area's creatures, and the GM's own tray applies them once the saves are in — a
 *                 relay would land the damage a second time. The player hears that once (one toast).
 *   late targets  a card that recorded no targets at use time (Heal cast, then Caven targeted) lists
 *                 its author's targets: as they target, the card's `system.targets` is filled in, so
 *                 dnd5e's own rows show them; and when dnd5e lists nobody on such a card, a player's
 *                 Apply goes to the targets they hold. A card the GM's resolve has stamped off an area
 *                 (`areaTargets`) is never followed again, even if late targets had filled it first:
 *                 the area's creatures stay its rows (core.lateTargetCard).
 *   typed total   players roll real dice and report a total. Every row gets a small total, pre-filled
 *                 with the rolled one; a typed number replaces it for that row's Apply, the multiplier
 *                 still applies on top, and dnd5e's own per-row number shows what would land.
 *
 * Apply on a card this Part decorates goes through here (the click is caught before dnd5e's own
 * handler): the rows dnd5e lists are applied — owned rows on this client exactly as dnd5e does
 * (`actor.applyDamage` with the tray's merged options, `isDelta`, the card as origin), the rest are
 * relayed. A GM owns everything, so a GM relays nothing. The GM-only save tray (tray.mjs) keeps its
 * own Apply, and is the one to use for a save spell: a save card's dnd5e tray gets no typed totals
 * for the GM.
 */

import {
  MODULE, RECENT_MESSAGES, RELAY_TIMEOUT_MS, LATE_TARGET_WINDOW_MS, aoeFlags, damageTotal, scaleDamages, rowAmount,
  splitApplyRows, lateTargetCard, hydrateDamages, applyTargets, packApplyOptions, unpackApplyOptions, isApplyCard,
  moduleFilledTargets, selfTargetCard, appliedByVisible, appliedByLines, fmtDelta
} from "./core.mjs";
import { setting, dnd5eTrayCollapse } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";
import { claimMessage } from "./lib/election.mjs";
import { queryGM } from "./lib/queries.mjs";
import { ok, fail, errorCode } from "./lib/errors.mjs";
import { FEATURE_ROWS } from "./api-manifest.mjs";
import { activityOf, cardDamages, targetDescriptors, hpOf, landedRow, logApplied } from "./messages-adapter.mjs";

/** The relay query's name (`<module>.<row path>`, as the kit registers it). */
export const RELAY_QUERY = `${MODULE}.applyRelay`;
/** Target changes come in bursts (shift-click); the card is written once they settle. */
export const FOLLOW_DEBOUNCE_MS = 150;

let log = makeLog(MODULE);   // the entry's ctx.log once installed
let context = null;
/** -9: the card listeners go through the kit's pass-through guard, so a rejected Apply is logged with the module prefix. */
const listenerGuard = (label, fn) => (context?.reg ? context.reg.guard(label, fn) : fn);

/** Typed totals per card, by target uuid, for this session: they survive dnd5e rebuilding its target list. */
const amounts = new Map();
/** `<damage-application>` elements this client already wired (a card decorated twice in one render). */
const wired = new WeakSet();
/**
 * Message ids whose native tray this client already switched from "selected" to "targeted", once. Keyed
 * by message, not by `<recorded-targets>` element: a card re-renders on every write (save, tick, apply),
 * each render a fresh element that comes up "selected" again from dnd5e's `_targetState.mode` when the
 * user switched it back — flipping that element would undo their choice.
 */
const flipped = new Set();
let scheduleFollow = null;

const userIdOf = author => author?.id ?? (typeof author === "string" ? author : null);
const isMine = message => message?.isAuthor === true || userIdOf(message?.author) === game.user?.id;
/** The card's damage descriptions: the element's own once it has built them, else read from the card. */
const baseDamages = (el, message) => (el?.damages?.length ? el.damages : cardDamages(message));
const healingTypes = () => CONFIG.DND5E?.healingTypes ?? {};
/** dnd5e's per-row number: `-12` damage, `+8` healing, `0` (its `formatNumber(-total, exceptZero)`). */
const fmtLanding = n => (n === 0 ? "0" : n > 0 ? `-${n}` : `+${-n}`);

/* -------------------------------------------- */
/*  The card                                    */
/* -------------------------------------------- */

/**
 * dnd5e.renderChatMessage: wire dnd5e's `<damage-application>` on a damage or healing card (dnd5e 6
 * types them `damage` and `healing`: `core.isApplyCard`). Its rows are built later (when the tray
 * opens), so the row work hangs on the element's own build event, caught in the capture phase (it
 * does not bubble). Players and GMs alike.
 */
function decorate(message, html) {
  if (isApplyCard(message?.type)) renderAppliedBy(message, html);
  if (!setting("applyFromCard") || !isApplyCard(message?.type)) return;
  const el = html?.querySelector?.("damage-application");
  if (!el || wired.has(el)) return;
  wired.add(el);
  el.addEventListener("recorded-targets:build", listenerGuard("card rows", ev => onRowsBuilt(ev, el, message)), { capture: true });
  el.addEventListener("click", listenerGuard("card click", ev => onClick(ev, el, message)), { capture: true });
  el.addEventListener("input", listenerGuard("card amount", ev => onAmountInput(ev, el, message)));
  addAmountInputs(el, message);
}

/**
 * G2: "Applied by <user> → <token> (±n)" under the card's tray, one line per Apply press
 * (`flags.pentaryn-aoe.appliedLog`, core.appliedByLines). Who reads it is the `showAppliedBy` setting
 * (core.appliedByVisible: the GM always; by default a player on a card they rolled or where they own a
 * row's token), and a player never reads a monster's row. Render-only: re-rendering replaces the lines.
 */
function renderAppliedBy(message, html) {
  if (!html?.querySelector) return;
  for (const old of html.querySelectorAll(".pa-applied-by")) old.remove();
  const log = aoeFlags(message).appliedLog;
  if (!log || !Object.keys(log).length) return;
  const owns = uuid => {
    if (!uuid) return false;
    let doc = null;
    try { doc = fromUuidSync(uuid, { strict: false }); } catch { doc = null; }
    return doc?.isOwner === true;
  };
  const isGM = !!game.user?.isGM;
  const ownsRow = Object.values(log).some(e => (e?.rows ?? []).some(r => owns(r?.token)));
  if (!appliedByVisible(setting("showAppliedBy"), { isGM, isAuthor: isMine(message), ownsRow })) return;
  const lines = appliedByLines(log, { isGM, owns });
  if (!lines.length) return;
  const esc = v => foundry.utils.escapeHTML(String(v ?? ""));
  const box = document.createElement("div");
  box.className = "pa-applied-by";
  box.innerHTML = lines.map(l => {
    const rows = l.rows.map(r => _loc("PENTARYN_AOE.Apply.AppliedRow", { name: esc(r.name), delta: fmtDelta(r.delta) })).join(", ");
    return `<p><i class="fa-solid fa-check" inert></i> ${_loc("PENTARYN_AOE.Apply.AppliedBy", { user: esc(l.by), rows })}</p>`;
  }).join("");
  const tray = html.querySelector("damage-application");
  if (tray) tray.after(box);
  else (html.querySelector(".message-content") ?? html).append(box);
}

/**
 * dnd5e remembers, per message, that a card first shown with no targets lists SELECTED tokens; once
 * late targets or the area's creatures have filled the card (core.moduleFilledTargets), show the
 * recorded targets instead (its public setter), once per message on this client. The setter writes
 * the message's `_targetState.mode` too, so every later render of that card comes up "targeted" by
 * itself; and when the user switches the tray back to "selected", a re-render (a fresh element on
 * every save, tick or apply write) keeps their choice instead of flipping it again.
 */
function onRowsBuilt(ev, el, message) {
  const recorded = ev.target;
  const id = message?.id;
  if (recorded && id && !flipped.has(id) && moduleFilledTargets(aoeFlags(message)) && message.system?.targets?.length
    && recorded.targetingMode === "selected") {
    flipped.add(id);
    recorded.targetingMode = "targeted";   // rebuilds the rows; this handler runs again for them
    return;
  }
  addAmountInputs(el, message);
}

/**
 * Typed totals belong on dnd5e's tray except for the GM on a save spell's card: that card carries a
 * Part B resolution, and the module's own tray under it (with its own totals) is the one the GM applies from.
 */
const wantsAmounts = message => !(game.user?.isGM && aoeFlags(message).resolution);

/** B5: one small total per target row (a dnd5e group of identical targets), after dnd5e's pill. */
function addAmountInputs(el, message) {
  if (!wantsAmounts(message)) return;
  const total = damageTotal(baseDamages(el, message));
  const typed = amounts.get(message.id);
  for (const li of el.querySelectorAll("ul.targets > li")) {
    if (li.classList.contains("none") || li.querySelector(".pa-card-amount")) continue;
    const uuids = [...li.querySelectorAll("option")].map(o => o.value).filter(Boolean);
    if (!uuids.length) continue;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "pa-card-amount";
    input.setAttribute("min", "0");
    input.setAttribute("step", "1");
    input.value = String(typed?.get(uuids[0]) ?? total);
    input.dataset.tooltip = _loc("PENTARYN_AOE.Apply.AmountTip");
    // dnd5e's list reads every change event as a target tick; ours is not one
    input.addEventListener("change", ev => ev.stopPropagation());
    li.append(input);
    refreshEffective(li, el, message, total);
  }
}

/**
 * The number that would land for a row with a typed total, written into dnd5e's own per-row number
 * (`.calculated.damage > .value`, which dnd5e keeps at the rolled total) and signed as dnd5e signs it;
 * dnd5e's text comes back when the typed total is cleared. A row dnd5e gives no number (a token the
 * user does not own) shows nothing more. Nothing is added to the row.
 */
function refreshEffective(li, el, message, total) {
  const input = li.querySelector(".pa-card-amount");
  const span = li.querySelector(".calculated.damage > .value");
  if (!input || !span) return;
  const box = span.parentElement;
  const current = span.textContent;
  if (span.dataset.paWritten === undefined || current !== span.dataset.paWritten) {
    // dnd5e's own number (first seen, or rewritten by dnd5e since): what a cleared total restores
    span.dataset.paValue = current;
    span.dataset.paHealing = box?.classList.contains("healing") ? "1" : "0";
  }
  const amount = rowAmount(input.value, total);
  if (amount === null) {
    span.textContent = span.dataset.paValue ?? current;
    box?.classList.toggle("healing", span.dataset.paHealing === "1");
    for (const k of ["paWritten", "paValue", "paHealing"]) if (k in span.dataset) delete span.dataset[k];
    return;
  }
  const uuid = li.querySelector("option")?.value ?? null;
  const token = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  const options = uuid && typeof el.getMergedOptions === "function" ? el.getMergedOptions(uuid) : { multiplier: Number(el.multiplier ?? 1) };
  const damages = hydrateDamages(scaleDamages(baseDamages(el, message), amount));
  const calc = token?.actor?.calculateDamage?.(damages, options);
  let n;
  if (calc && Number.isFinite(calc.amount)) n = Math.floor(calc.amount);
  else {
    const healing = damages.length > 0 && damages.every(d => d.type in healingTypes());
    n = Math.floor(amount * (Number(options.multiplier) || 0)) * (healing ? -1 : 1);
  }
  const text = fmtLanding(n);
  span.textContent = text;
  box?.classList.toggle("healing", n < 0);
  span.dataset.paWritten = text;
}

/** Every row with a typed total, recomputed (after dnd5e changed a multiplier or a pill choice). */
function refreshTyped(el, message) {
  const typed = amounts.get(message.id);
  if (!typed?.size) return;
  const total = damageTotal(baseDamages(el, message));
  for (const li of el.querySelectorAll("ul.targets > li")) {
    const uuid = li.querySelector("option")?.value;
    if (uuid && typed.has(uuid)) refreshEffective(li, el, message, total);
  }
}

function onAmountInput(ev, el, message) {
  const input = ev.target?.closest?.(".pa-card-amount");
  if (!input) return;
  const li = input.closest("li");
  const total = damageTotal(baseDamages(el, message));
  const amount = rowAmount(input.value, total);
  let typed = amounts.get(message.id);
  if (!typed) amounts.set(message.id, (typed = new Map()));
  for (const o of li?.querySelectorAll("option") ?? []) {
    if (amount === null) typed.delete(o.value);
    else typed.set(o.value, amount);
  }
  if (!typed.size) amounts.delete(message.id);
  if (li) refreshEffective(li, el, message, total);
}

/**
 * Clicks on the card, in the capture phase: the Apply button is ours (dnd5e's own handler on the
 * button never runs); any other click (a multiplier, a pill choice) lets dnd5e act, then the typed
 * rows' numbers are recomputed a tick later, once dnd5e has rewritten its own.
 */
function onClick(ev, el, message) {
  if (!ev.target?.closest?.(".apply-button")) {
    if (amounts.get(message.id)?.size) setTimeout(() => refreshTyped(el, message), 0);
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  return applyCard(message, el);
}

/* -------------------------------------------- */
/*  Apply                                       */
/* -------------------------------------------- */

/**
 * Apply a damage or healing card the way its tray stands: the rows dnd5e lists, owned ones here
 * (dnd5e's own call, with the row's typed total), the rest through the GM when this user may have
 * them applied (the card's author, or the owner of its actor; otherwise skipped silently, as dnd5e
 * skips them). When dnd5e lists nobody on a card that recorded no targets, a player's held targets
 * are the rows (the tray's one multiplier) and the card then records them. A card that recorded no
 * targets, or followed late targets, is stamped applied, so late targets stop following it. A save
 * spell's card (a Part B resolution) relays nothing for a player: the GM's tray applies it, so the
 * unowned rows are skipped with one info toast; owned rows still land here.
 * @param {ChatMessage} message
 * @param {HTMLElement} el   the card's `<damage-application>`
 * @returns {Promise<{ local: string[], relay: string[], skipped: string[], relayed: object|null }>}
 */
export async function applyCard(message, el) {
  const damages = baseDamages(el, message);
  const typed = amounts.get(message.id) ?? new Map();
  const recorded = message.system?.targets?.length ?? 0;
  const listed = [...el.querySelectorAll("ul.targets option")].map(o => o.value);
  const held = [...(game.user?.targets ?? [])].map(t => t.document ?? t).filter(t => t?.uuid);
  const { uuids, late } = applyTargets({ listed, recorded, targeted: held.map(t => t.uuid), isGM: !!game.user?.isGM });
  const rows = uuids.map(uuid => {
    const token = late ? held.find(t => t.uuid === uuid) : fromUuidSync(uuid, { strict: false });
    const options = !late && typeof el.getMergedOptions === "function"
      ? el.getMergedOptions(uuid)
      : { multiplier: Number(el.multiplier ?? 1), originatingMessage: message };
    return { uuid, token, owner: !!token?.isOwner, multiplier: Number(options?.multiplier), options, amount: typed.get(uuid) ?? null };
  });
  const { local, relay: unowned } = splitApplyRows(rows);
  // a save spell's card: its rows are the area's creatures and the GM's tray applies them — no relay
  const gmTray = !game.user?.isGM && !!aoeFlags(message).resolution;
  // the GM applies the same rule: rows this user may not have applied through the GM are skipped, quietly
  const mayRelay = unowned.length > 0 && !gmTray && mayApply(message, game.user);
  const relay = mayRelay ? unowned : [];
  const skipped = mayRelay ? [] : unowned;
  if (skipped.length) log.debug("apply: rows not this user's to relay", { uuid: message.uuid, ids: skipped.map(r => r.uuid) });
  if (gmTray && unowned.length) log.notify("info", _loc("PENTARYN_AOE.Apply.GmTray", { names: unowned.map(r => r.token?.name ?? r.uuid).join(", ") }));
  const landed = [];
  for (const r of local) {
    const actor = r.token?.actor;
    if (typeof actor?.applyDamage !== "function") continue;
    const before = hpOf(actor);
    await actor.applyDamage(hydrateDamages(scaleDamages(damages, r.amount)), { ...r.options, isDelta: true, origin: message });
    landed.push(landedRow(r.token, actor, before));
  }
  collapse(el);
  const relayed = relay.length ? await relayRows(message, relay) : null;
  // G2: every Apply is stamped (the applied marker, and this user's own rows for the "Applied by" line);
  // the relayed rows are logged by the GM's client that landed them. Targets are recorded only for a
  // card that had none, or followed late targets.
  if (rows.length) await stampApplied(message, rows, late ? held : [], { record: !recorded || !!aoeFlags(message).lateTargets, landed });
  amounts.delete(message.id);
  return { local: local.map(r => r.uuid), relay: relay.map(r => r.uuid), skipped: skipped.map(r => r.uuid), relayed };
}

/**
 * The rows this user does not own, as one query to the active GM. The one thing a player hears from
 * this module is one toast when the relay did not land: no GM connected or none answered in time
 * (`NoGm`), or the GM's client refused or failed (`RelayFailed`, with its reason). A losing GM tab's
 * `claimed: false` is not a failure (the winner lands it). Silence meant a dropped heal looked applied
 * (playtest 2026-11-07).
 */
async function relayRows(message, relay) {
  const names = relay.map(r => r.token?.name ?? r.uuid).join(", ");
  const failed = reason => log.notify("warn", _loc("PENTARYN_AOE.Apply.RelayFailed", { names, reason: String(reason ?? "") }));
  const data = {
    messageId: message.id,
    requestId: foundry.utils.randomID(),
    rows: relay.map(r => {
      const options = packApplyOptions(r.options);
      return {
        uuid: r.uuid, multiplier: Number(r.multiplier),
        ...(r.amount === null || r.amount === undefined ? {} : { amount: r.amount }),
        ...(Object.keys(options).length ? { options } : {})
      };
    })
  };
  try {
    const out = await queryGM(RELAY_QUERY, data, { timeout: RELAY_TIMEOUT_MS });
    if (out && out.ok === false) {
      log.warn("apply relay refused", { ...out, uuid: message.uuid, ids: relay.map(r => r.uuid) });
      failed(out.reason ?? out.code);
    }
    return out ?? null;
  } catch (err) {
    log.warn("apply relay", err);
    const code = errorCode(err);
    if (code === "NO_GM" || code === "TIMEOUT") log.notify("warn", _loc("PENTARYN_AOE.Apply.NoGm", { names }));
    else failed(err?.message ?? err);
    return null;
  }
}

/** As dnd5e's own Apply: the tray folds unless the system setting says manual. */
function collapse(el) {
  if (dnd5eTrayCollapse() !== "manual") el.open = false;
}

/**
 * Mark the card applied (so late targets stop following it) and, when the Apply went to targets the
 * card had not recorded (`record`: a card with none, or one late targets filled), record them, so the
 * card shows who took it. G2: runs on every Apply, and the rows that landed on this client (`landed`,
 * messages-adapter.landedRow) go into the same write as one `appliedLog` entry. Only the author or a
 * GM may write a message; anyone else's Apply leaves the card as it is.
 */
async function stampApplied(message, rows, current, { record = true, landed = [] } = {}) {
  if (!(isMine(message) || game.user?.isGM)) return null;
  const update = { [`flags.${MODULE}.applied`]: { at: Date.now(), by: game.user.id, targets: rows.map(r => r.uuid) } };
  if (record && current.length) update["system.targets"] = targetDescriptors(current);
  if (landed.length) {
    update[`flags.${MODULE}.appliedLog.${foundry.utils.randomID()}`] = { at: Date.now(), by: game.user.id, byName: game.user.name ?? "", rows: landed };
  }
  try {
    return await message.update(update);
  } catch (err) {
    log.warn("applied stamp", err);
    return null;
  }
}

/* -------------------------------------------- */
/*  Late targets                                */
/* -------------------------------------------- */

const describeRecent = () => game.messages.contents.slice(-RECENT_MESSAGES).map(m => ({
  id: m.id, type: m.type, author: userIdOf(m.author), timestamp: m.timestamp ?? 0,
  targets: m.system?.targets?.length ?? 0, lateTargets: !!aoeFlags(m).lateTargets,
  areaTargets: !!aoeFlags(m).areaTargets, applied: !!aoeFlags(m).applied
}));

/**
 * The viewer changed their targets: fill their newest own damage or healing card that recorded none
 * (and is still open) with those targets, so dnd5e's own tray lists them. Players only — a GM's
 * untargeted card keeps dnd5e's selected-tokens fallback, which is the GM's habit.
 * @returns {Promise<ChatMessage|null>} the card written, or null
 */
export async function followTargets() {
  if (!setting("applyFromCard") || !game.user || game.user.isGM) return null;
  const id = lateTargetCard(describeRecent(), { userId: game.user.id, now: Date.now(), windowMs: LATE_TARGET_WINDOW_MS });
  const message = id ? game.messages.get(id) : null;
  if (!message) return null;
  const targets = targetDescriptors(game.user.targets ?? []);
  const key = list => (list ?? []).map(t => t.token ?? t.actor).join(",");
  if (key(message.system?.targets) === key(targets)) return null;
  log.info("late targets", { uuid: message.uuid, ids: targets.map(t => t.token), by: game.user.id });
  await message.update({ "system.targets": targets, [`flags.${MODULE}.lateTargets`]: true });
  return message;
}

function onTargetToken(user) {
  if (!user?.isSelf || !setting("applyFromCard")) return;
  scheduleFollow?.();
}

/* -------------------------------------------- */
/*  Self-only cards target the caster (G1)      */
/* -------------------------------------------- */

/**
 * The caster's token for a roll card: the activity's own usage token, else the speaker's token, else
 * the caster's one token on the speaker's (or viewed) scene. A TokenDocument, or null.
 */
function casterTokenOf(message, activity) {
  let usage = null;
  try { usage = activity?.getUsageToken?.() ?? null; } catch { usage = null; }
  if (usage) return usage.document ?? usage;
  const sp = message?.speaker ?? {};
  const scene = game.scenes?.get(sp.scene) ?? canvas?.scene ?? null;
  const bySpeaker = sp.token ? scene?.tokens?.get(sp.token) ?? null : null;
  if (bySpeaker) return bySpeaker;
  const actor = activity?.actor ?? null;
  const tokens = actor?.getActiveTokens?.(false, true) ?? [];
  return actor?.token ?? tokens.find(t => (t.document ?? t).parent === scene) ?? tokens[0] ?? null;
}

/**
 * G1: preCreateChatMessage on the roller's client. A healing card from an activity that can only
 * affect its user (core.selfTargetCard: Stone's Endurance, Second Wind) records the caster's
 * token as its one target, whatever the roller had targeted, so every viewer's dnd5e tray reads
 * "Talo +11" and never offers the heal to an enemy or to their own selection. Written into the
 * pending card (`updateSource`), dnd5e's own descriptors; `areaTargets` and `recordedTargets` are
 * never written. Late targets then leave the card alone (it has targets). Never vetoes.
 */
function onPreCreate(message, data, options, userId) {
  if (!setting("applyFromCard") || userId !== game.user?.id || message?.type !== "healing") return;
  const activity = activityOf(message);
  if (!activity) return;
  const go = selfTargetCard({
    type: message.type, activityType: activity.type ?? null, rangeUnits: activity.range?.units ?? null,
    affectsType: activity.target?.affects?.type ?? null, templateType: activity.target?.template?.type || null,
    hasSave: !!activity.save && activity.type === "save",
  });
  if (!go) return;
  const token = casterTokenOf(message, activity);
  if (!token) return;
  const targets = targetDescriptors([token]);
  if (!targets.length) return;
  message.updateSource({ "system.targets": targets });
}

/* -------------------------------------------- */
/*  The GM relay                                */
/* -------------------------------------------- */

/**
 * May this user have a card's rows applied through the GM? Its author, or the owner of its actor.
 * The sender checks it before relaying (unauthorised rows are skipped silently); the GM checks it again.
 */
function mayApply(message, user) {
  if (!user) return false;
  if (userIdOf(message.author) === user.id) return true;
  const actor = message.getAssociatedActor?.() ?? null;
  return actor?.testUserPermission?.(user, "OWNER") === true;
}

/**
 * The relay's GM side (manifest row `applyRelay`, `relay: true`: any sender, the active GM answers;
 * `ctx.user` is the sender). The damage is read from the card itself; the request brings only which
 * rows, each row's multiplier, a typed total and the pill menu's ignore / downgrade choices. Two GM
 * tabs both receive it: the `requestId` (required: §5.4 idempotency across tabs, BAD_ARGS without
 * one) is claimed on the card and only the winner applies (the loser answers `claimed: false`).
 * @param {{ messageId: string, requestId: string, rows: { uuid: string, multiplier: number, amount?: number, options?: object }[] }} data
 * @param {{ user?: User|null }} [ctx]
 */
export async function applyRelay(data = {}, { user = null } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "the relay runs on a GM client");
  if (!setting("applyFromCard")) return fail("REFUSED", "applyFromCard is off");
  const message = game.messages.get(data?.messageId);
  if (!message || !isApplyCard(message.type)) return fail("NOT_FOUND", `damage or healing message ${data?.messageId}`);
  const sender = user ?? null;
  const who = { uuid: message.uuid, by: game.user.id, for: sender?.id ?? null };
  if (sender && !sender.isGM && !mayApply(message, sender)) {
    log.warn("apply relay refused: not the card's author", who);
    return fail("REFUSED", "only the card's author, or the owner of its actor, may apply it through the GM");
  }
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (!rows.length) return fail("BAD_ARGS", "no rows");
  if (typeof data?.requestId !== "string" || !/^[A-Za-z0-9]{1,32}$/.test(data.requestId)) return fail("BAD_ARGS", "requestId (one id per Apply press) is required");
  if (!(await claimMessage(message, `relay-${data.requestId}`, { scope: MODULE }))) return ok({ applied: [], claimed: false });
  const damages = cardDamages(message);
  const applied = [];
  const landed = [];
  for (const row of rows) {
    const token = typeof row?.uuid === "string" ? fromUuidSync(row.uuid, { strict: false }) : null;
    const actor = token?.actor;
    const multiplier = Number(row?.multiplier);
    if (typeof actor?.applyDamage !== "function" || !(multiplier > 0)) continue;
    const typed = row.amount === null || row.amount === undefined ? null : Number(row.amount);
    const amount = Number.isFinite(typed) && typed >= 0 ? typed : null;
    const options = { ...unpackApplyOptions(row.options), multiplier, isDelta: true, origin: message, originatingMessage: message };
    const before = hpOf(actor);
    await actor.applyDamage(hydrateDamages(scaleDamages(damages, amount)), options);
    applied.push(row.uuid);
    landed.push(landedRow(token, actor, before));
  }
  log.info("apply relay", { ...who, ids: applied });
  // G2: the sender pressed Apply; the GM's client landed these rows, so it writes their line.
  await logApplied(message, landed, { user: sender ?? game.user, log });
  return ok({ applied });
}

/* -------------------------------------------- */
/*  Hook wiring                                 */
/* -------------------------------------------- */

export function install(reg, ctx) {
  log = ctx.log;
  context = ctx;
  scheduleFollow = foundry.utils.debounce(() => followTargets().catch(err => log.warn("late targets", err)), FOLLOW_DEBOUNCE_MS);
  // G1: synchronous and never false (a pre-hook's false would veto the card).
  reg.on("preCreateChatMessage", reg.guardSwallowAsync("preCreateChatMessage(self)", onPreCreate), { guard: false, label: "preCreateChatMessage(self)" });
  reg.on("dnd5e.renderChatMessage", reg.guardSwallowAsync("renderChatMessage(apply)", decorate), { guard: false, label: "renderChatMessage(apply)" });
  reg.on("targetToken", reg.guardSwallowAsync("targetToken(late)", onTargetToken), { guard: false, label: "targetToken(late)" });
  // §5.4: the session's typed totals go with their card
  reg.on("deleteChatMessage", message => { amounts.delete(message.id); }, { guard: false, label: "deleteChatMessage(apply)" });
  return { rows: FEATURE_ROWS.apply, impl: { applyRelay } };
}

export function uninstall() {
  scheduleFollow?.cancel?.();
  scheduleFollow = null;
  amounts.clear();
}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only. Not part of the API.
export const _internals = { renderAppliedBy, onPreCreate, casterTokenOf, decorate, onRowsBuilt, addAmountInputs, refreshEffective, refreshTyped, onAmountInput, onClick, relayRows, collapse, stampApplied, describeRecent, onTargetToken, mayApply, amounts };
