/**
 * Empowered Spell in one click (feedback WUiaAA Marrith; triage H1, one-click per the 2026-11-07 review).
 * =======================================================================================================
 *
 * FEATURE: install(reg, ctx) / uninstall(). The dice arithmetic is pure in core/empower.mjs; the
 * actor reads (the feat, its activity, the Sorcery Points) are shapes.mjs's.
 *
 * PHB 2024: "When you roll damage for a spell, you can spend 1 Sorcery Point to reroll a number of the
 * damage dice up to your Charisma modifier (minimum of one), and you must use the new rolls." Metamagic
 * is declared and tracked, never forced: dnd5e gives Empowered Spell one utility activity that spends a
 * Font of Magic use, and left the rerolling to the player.
 *
 * 1. The button. On a `type: "damage"` card from a spell whose caster has Empowered Spell and a Sorcery
 *    Point left, the caster's owner (who can also edit the card: its author, or a GM) sees one button
 *    under the dice row, "Empower (1 SP)", drawn on `dnd5e.renderChatMessage` from the card's state, as
 *    projectiles.mjs does. No button once the card has been applied, superseded, or is itself the
 *    empowered roll, and none when no die came up below its average: one click would have nothing to
 *    do, and a button that only opens a picker is not worth the room on the card (the rule allows the
 *    reroll; the player would be betting against the mean).
 *
 * 2. One click: the dice below their die's average (a d6's 1–3, a d8's 1–4), lowest first, up to the
 *    Charisma modifier (`empowerPlan`). The point is spent through the feat's own activity,
 *    `activity.use({}, { configure: false }, { create: false })`: no second dialog, no card of its own,
 *    and Argon's Font of Magic badge follows (argon-tidy). The picked faces are rerolled, the old face
 *    kept in the term inactive and struck through, and the result posted as a NEW damage card threaded
 *    under the usage card (`system.origin`), with the old card's targets, item, activity and riders
 *    flags (the card note and the tray preset carry over). The old card is marked
 *    `flags.pentaryn-riders.supersededBy = <new id>`: its apply tray is removed on render and a line
 *    says so, so the GM applies the new roll and never both. A new roll is kept even when it is lower.
 *    The new card's line names each change and the card's total before and after ("1 → 4, 3 → 3
 *    (77 → 83)", from `empowered.oldTotal`; GDJJdi, F1), and its rerolled chips in the dice tooltip are
 *    marked (`pr-emp-old` / `pr-emp-new`) so they stand out from dnd5e's grey strike-through.
 *    Shift-click opens a small picker listing each die with its face, the one-click choice pre-ticked.
 *    The point is spent first; should the new card then fail to post, one warning names the lost point
 *    and the old card stays live (a posted card whose old card fails to retire gets its own line).
 *
 * 3. Applied means done. dnd5e records nothing when a tray applies damage; `dnd5e.applyDamage` fires on
 *    the applying client with the card as `options.origin`, so that client (a GM, or the author with
 *    the player tray allowed) marks the card `flags.pentaryn-riders.trayApplied` once, and the button
 *    goes. Every spell damage card of a caster with the feat is marked, Sorcery Points and dice
 *    regardless: a card applied at 0 points must not grow the button when Font of Magic converts a
 *    slot later in the day.
 *
 * Setting pentaryn-riders.empoweredSpell (world, default on). Rows dnd5e-riders-empowered-spell (the
 * damage message shape, `Roll#toJSON` term results, the `damage-application` element) waiting in the
 * batch file.
 */

import { MODULE, empowerCandidates, empowerPlan, empowerRolls, matchChips, rerolledFaces, rollsTotal } from "./riders-core.mjs";
import { settingOr } from "./settings.mjs";
import { empoweredSpellOf, fontUsesLeft } from "./shapes.mjs";
import { flagPath } from "./lib/flags.mjs";

let log = null;

const enabled = () => settingOr("empoweredSpell", false);
const canEdit = message => !!(game.user?.isGM || message?.isAuthor);

const T = Object.freeze({
  button: "PENTARYN_RIDERS.empower.button",
  tip: "PENTARYN_RIDERS.empower.tip",
  title: "PENTARYN_RIDERS.empower.title",
  intro: "PENTARYN_RIDERS.empower.intro",
  reroll: "PENTARYN_RIDERS.empower.reroll",
  cancel: "PENTARYN_RIDERS.empower.cancel",
  count: "PENTARYN_RIDERS.empower.count",
  die: "PENTARYN_RIDERS.empower.die",
  none: "PENTARYN_RIDERS.empower.none",
  note: "PENTARYN_RIDERS.empower.note",
  noteTotal: "PENTARYN_RIDERS.empower.noteTotal",
  change: "PENTARYN_RIDERS.empower.change",
  superseded: "PENTARYN_RIDERS.empower.superseded",
  noUse: "PENTARYN_RIDERS.empower.noUse",
  createFailed: "PENTARYN_RIDERS.empower.createFailed",
  retireFailed: "PENTARYN_RIDERS.empower.retireFailed",
});

/* ── reading a damage card ─────────────────────────────────────────────── */

/** The card's rolls as plain JSON (`Roll#toJSON`); a source string is parsed. */
function rollsJson(message) {
  return (message?.rolls ?? []).map(r => (typeof r === "string" ? JSON.parse(r) : (r?.toJSON?.() ?? r)));
}

/**
 * A live spell damage card of a caster with Empowered Spell: `{ actor, item, feat, activity }`, or null
 * (not a spell's damage, no feat, already applied / superseded / empowered). Points and dice are not
 * looked at: this is the card the applied mark belongs on, whether or not it could show the button now.
 */
export function spellDamageCard(message) {
  if (message?.type !== "damage") return null;
  const flags = message.flags?.[MODULE] ?? {};
  if (flags.supersededBy || flags.empowered || flags.trayApplied) return null;
  const item = message.getAssociatedItem?.() ?? null;
  if (item?.type !== "spell") return null;
  const actor = message.getAssociatedActor?.() ?? item.actor ?? null;
  if (!actor) return null;
  const emp = empoweredSpellOf(actor);
  if (!emp?.activity) return null;
  return { actor, item, feat: emp.item, activity: emp.activity };
}

/**
 * What a damage card is for the Empower button: `spellDamageCard` plus `{ points, max, rolls, plan }`,
 * or null when the button does not belong on it (no point left, no die below its average — the
 * one-click `plan` would be empty).
 */
export function empowerCard(message) {
  const base = spellDamageCard(message);
  if (!base) return null;
  const points = fontUsesLeft(base.actor, base.activity);
  if (points < 1) return null;
  const rolls = rollsJson(message);
  const cha = Number(base.actor.system?.abilities?.cha?.mod) || 0;
  const max = Math.max(1, cha);
  const plan = empowerPlan(rolls, max);
  if (!plan.length) return null;
  return { ...base, points, max, rolls, plan };
}

/* ── 1. the button, the note, the retired card ─────────────────────────── */

function changesText(changes) {
  return (changes ?? []).map(c => _loc(T.change, { from: c.from, to: c.to })).join(", ");
}

/** "Empowered Spell (1 SP): 1 → 4, 3 → 3 (77 → 83)"; a card empowered before `oldTotal` was stored has no totals. */
function noteText(message, empowered) {
  const changes = changesText(empowered.changes);
  const before = Number(empowered.oldTotal);
  if (empowered.oldTotal === undefined || empowered.oldTotal === null || !Number.isFinite(before)) return _loc(T.note, { changes });
  return _loc(T.noteTotal, { changes, old: before, new: rollsTotal(rollsJson(message)) });
}

/**
 * The rerolled dice stand out (F1): each old chip in the dice tooltip gets `pr-emp-old`, the new face
 * after it `pr-emp-new` (dnd5e alone strikes the old one through in grey and leaves the new one plain).
 */
function markChips(message, html, empowered) {
  const lists = [...html.querySelectorAll("ol.dice-rolls")];
  const nodes = [];
  const chips = [];
  lists.forEach((ol, list) => {
    for (const li of ol.querySelectorAll("li.roll")) {
      li.classList.remove("pr-emp-old", "pr-emp-new");
      const size = /(?:^|\s)d(\d+)(?:\s|$)/.exec(li.className);
      nodes.push(li);
      chips.push({ list, faces: size ? Number(size[1]) : NaN, label: li.textContent, rerolled: li.classList.contains("rerolled") });
    }
  });
  if (!chips.length) return;
  for (const [a, b] of matchChips(chips, rerolledFaces(rollsJson(message), empowered.changes))) {
    nodes[a].classList.add("pr-emp-old");
    nodes[b].classList.add("pr-emp-new");
  }
}

function render(message, html) {
  if (!html?.querySelector) return;
  html.querySelector(".pr-empower")?.remove();
  html.querySelector(".pr-empower-note")?.remove();
  html.querySelector(".pr-superseded")?.remove();
  if (message?.type !== "damage") return;
  const flags = message.flags?.[MODULE] ?? {};
  const content = html.querySelector(".message-content") ?? html;
  const place = node => {
    const at = content.querySelector(".pentaryn-riders-note") ?? content.querySelector(":scope > section.icon-row");
    if (at) at.after(node); else content.append(node);
  };
  if (flags.supersededBy) {
    for (const tray of html.querySelectorAll("damage-application")) tray.remove();
    html.classList?.add("pr-superseded-card");
    if (message.isContentVisible === false) return;
    const p = document.createElement("p");
    p.className = "supplement pr-superseded";
    p.textContent = _loc(T.superseded);
    place(p);
    return;
  }
  if (flags.empowered) {
    if (message.isContentVisible === false) return;
    const p = document.createElement("p");
    p.className = "supplement pr-empower-note";
    p.textContent = noteText(message, flags.empowered);
    place(p);
    markChips(message, html, flags.empowered);
    return;
  }
  if (!enabled()) return;
  const card = empowerCard(message);
  if (!card || !card.actor.isOwner || !canEdit(message)) return;
  const box = document.createElement("div");
  box.className = "pr-empower";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pr-empower-btn";
  b.dataset.action = "prEmpower";
  b.dataset.tooltip = _loc(T.tip, { n: card.max });
  b.textContent = _loc(T.button);
  b.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (b.disabled) return;
    b.disabled = true;
    return empower(message, { pick: !!event.shiftKey })
      .catch(err => log.warn("Empowered Spell failed", err))
      .finally(() => { b.disabled = false; });
  });
  box.append(b);
  place(box);
}

function onRender(message, html) {
  try { render(message, html); } catch (err) { log.warn("Empower button skipped", err); }
}

/* ── 2. the click ──────────────────────────────────────────────────────── */

const keyOf = c => `${c.roll}:${c.term}:${c.result}`;

/** Shift-click: each die with its face, the one-click choice pre-ticked, at most `card.max` ticked. */
async function pickDice(card, preset) {
  const candidates = empowerCandidates(card.rolls);
  const ticked = new Set(preset.map(keyOf));
  const esc = foundry.utils.escapeHTML;
  const boxes = candidates.map((c, i) => `<label><input type="checkbox" name="d${i}" value="${i}"${ticked.has(keyOf(c)) ? " checked" : ""}> ${esc(_loc(T.die, { faces: c.faces, value: c.value }))}</label>`);
  const read = form => [...form.querySelectorAll("input[name^=d]")].filter(b => b.checked && !b.disabled).map(b => candidates[Number(b.value)]).filter(Boolean);
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: _loc(T.title), icon: "fa-solid fa-wand-sparkles" },
    content: `<p>${esc(_loc(T.intro, { n: card.max }))}</p><div class="form-group pr-emp-row"><div class="form-fields pr-emp-dice">${boxes.join("")}</div></div><p class="pr-emp-total"></p>`,
    buttons: [
      { action: "ok", label: _loc(T.reroll), icon: "fa-solid fa-dice", default: true, callback: (event, button) => read(button.form) },
      { action: "cancel", label: _loc(T.cancel), icon: "fa-solid fa-xmark" },
    ],
    render: (event, dialog) => {
      const el = dialog.element;
      const form = el.querySelector("form") ?? el;
      const total = el.querySelector(".pr-emp-total");
      const ok = el.querySelector('button[data-action="ok"]');
      const refresh = () => {
        const n = read(form).length;
        total.textContent = n ? _loc(T.count, { used: n, n: card.max }) : _loc(T.none);
        total.classList.toggle("over", n > card.max);
        if (ok) ok.disabled = n === 0 || n > card.max;
      };
      form.addEventListener("input", refresh);
      form.addEventListener("change", refresh);
      refresh();
    },
    rejectClose: false,
  });
  if (!Array.isArray(result) || !result.length || result.length > card.max) return null;
  return result;
}

const uniform = () => (typeof CONFIG.Dice?.randomUniform === "function" ? CONFIG.Dice.randomUniform() : Math.random());
/** A face 1..faces, as core's Die maps a uniform draw. */
const rng = faces => Math.ceil((1 - uniform()) * faces);

/**
 * Spend the point, reroll, post the new card and retire the old one. The card is re-read first: the
 * points, the dice and the flags are what they are now, not what they were when the button was drawn.
 */
async function empower(message, { pick = false } = {}) {
  const card = empowerCard(message);
  if (!card) return;
  let picks = card.plan;
  if (pick) {
    picks = await pickDice(card, picks);
    if (!picks) return;
  }
  // 1. the point, through the feat's own activity: no dialog, no card of its own
  const used = await card.activity.use({ pentaryn: { empower: true } }, { configure: false }, { create: false });
  if (!used) { log.notify("warn", _loc(T.noUse)); return; }
  // 2. the dice
  const { rolls, changes } = empowerRolls(card.rolls, picks, rng);
  // 3. the new card, threaded under the usage card with the old card's targets, item and riders flags
  const src = message.toObject?.() ?? {};
  const sys = src.system ?? {};
  const ours = src.flags?.[MODULE] ?? {};
  let created = null;
  try {
    created = await ChatMessage.create({
      type: "damage",
      speaker: src.speaker ?? message.speaker,
      flavor: src.flavor ?? message.flavor ?? "",
      whisper: src.whisper ?? [],
      blind: !!src.blind,
      rolls: rolls.map(r => JSON.stringify(r)),
      system: { activity: sys.activity ?? null, item: sys.item ?? null, origin: sys.origin ?? null, targets: sys.targets ?? [], onSave: sys.onSave ?? null },
      flags: { [MODULE]: { ...ours, empowered: { from: message.id, cost: 1, changes, oldTotal: rollsTotal(card.rolls) } } },
    });
  } catch (err) {
    // the point is gone and the old card stays live: say so, with what was spent and for what
    log.notify("warn", _loc(T.createFailed));
    log.warn("Empowered Spell: the Sorcery Point was spent but the new card was not posted", { from: message.id, rerolled: changes.length, by: game.user.id }, err);
    return;
  }
  // 4. the old card is retired: no tray, one line
  try {
    await message.update({ [flagPath(MODULE, "supersededBy")]: created?.id ?? "unknown" });
  } catch (err) {
    log.notify("warn", _loc(T.retireFailed));
    log.warn("Empowered Spell: the new card is posted but the old card was not retired", { from: message.id, to: created?.id ?? null, by: game.user.id }, err);
    return;
  }
  log.info("Empowered Spell", { from: message.id, to: created?.id ?? null, rerolled: changes.length, by: game.user.id });
}

/* ── 3. applied means done ─────────────────────────────────────────────── */

/** Cards being marked in this tab (the tray applies per target; one write). */
const marking = new Set();

// dnd5e.applyDamage runs on the applying client only (inside Actor5e#applyDamage): no election.
function onApplied(actor, amount, options) {
  try {
    const origin = options?.origin;
    if (!origin || origin.type !== "damage" || !enabled()) return;
    if (origin.flags?.[MODULE]?.trayApplied || marking.has(origin.id) || !canEdit(origin)) return;
    if (!spellDamageCard(origin)) return;   // the feat alone decides, not the points left when applied
    marking.add(origin.id);
    origin.update({ [flagPath(MODULE, "trayApplied")]: true })
      .catch(err => log.warn("applied damage card not marked", err))
      .finally(() => marking.delete(origin.id));
  } catch (err) { log.warn("applied damage check skipped", err); }
}

/* ── wiring ────────────────────────────────────────────────────────────── */

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("dnd5e.renderChatMessage", onRender, { guard: false, label: "Empower button" });
  reg.on("dnd5e.applyDamage", onApplied, { guard: false, label: "Empower: applied card" });
}

/** The drawn buttons leave every rendered card; the notes and flags stay. */
export function uninstall() {
  marking.clear();
  try {
    for (const box of globalThis.document?.querySelectorAll?.(".pr-empower") ?? []) box.remove();
  } catch (err) { log?.debug?.("Empower buttons left on rendered cards", err); }
}
