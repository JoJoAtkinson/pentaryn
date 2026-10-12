/**
 * Cast-flow fixes from the sorcerer re-run (usability Area 5 re-run).
 * ===================================================================
 *
 * FEATURE: install(reg, ctx) / uninstall(). Pure helpers in table-core.mjs (`node test/table.mjs`).
 * The two SummonActivity wraps of parts 3 and 5 are in patches.mjs (installed at `ready`).
 *
 * 1. A summon keeps the sidebar where it was and says how to place (S13). The first cast of a
 *    summon from a compendium profile (Flaming Sphere) imports the creature with core's
 *    `WorldCollection#importFromCompendium`, which ends in `this.directory.activate()`: the sidebar
 *    jumped to the Actors tab (and opened, if it was collapsed), and the placement then waited for
 *    a click with no word on screen. Between `dnd5e.preSummon` and `dnd5e.postSummon` we put the
 *    sidebar back on the tab it had (and collapse it again if it was collapsed), and say "click the
 *    map to place X; right-click cancels". Row dnd5e-summon-keeps-sidebar.
 *
 * 2. Restoring a spell slot opens on the highest spent level (S11). Pearl of Power's slider opened
 *    at 1st level, so restoring a 3rd-level slot took an extra click. `dnd5e.preUseActivity` sets
 *    the scaling to the highest level at or below the cap that has a slot spent. Activities whose
 *    cost grows with the level (Font of Magic) are left alone. Row dnd5e-restore-slot-default.
 *
 * Usability Area 6 re-run (wizard):
 *
 * 3. Summons start with "Place Summons" ticked (W7, W9). dnd5e ticks it only when the activity's
 *    `summon.prompt` is set; the PHB's Summon Undead and Animate Dead ship with it off, so the
 *    profile choice stayed hidden until the box was ticked. A wrap of SummonActivity's
 *    `_prepareUsageConfig` ticks it when placing is possible and the caller did not say (an explicit
 *    `create: {summons: false}` is kept). Untick it in the dialog to cast without placing. A self-only activity
 *    (Shield) also drops the user's leftover targets from its card (the Shield card named a Fighter
 *    targeted minutes earlier). Setting pentaryn-riders.castDefaults. Row riders-summon-place-default.
 *
 * 4. A typed number in a usage dialog counts on the first Use click (W4). dnd5e's usage dialog
 *    re-renders on every change; clicking Use with the number still focused blurred it, the change
 *    re-rendered the dialog, and the click landed on a button that was no longer there. A mousedown
 *    on Use with a field focused commits the field itself (blur), and once dnd5e has re-rendered we
 *    press the new Use button. With nothing changed the click goes through as usual. (Keeping focus
 *    instead does not work: the scaling box is a <range-picker> that only takes its value on change.)
 *    Row dnd5e-usage-dialog-first-click.
 *
 * 5. A wildcard token image on a summon (Animate Dead's "skeleton-*.webp") no longer makes the
 *    placement preview load the literal "*" path (an "Invalid Asset" error per preview, W7). The
 *    preview gets one of the actor's real images (or its portrait); dnd5e still picks the placed
 *    token's own random image. Row riders-summon-wildcard-preview.
 *
 * 6. Arcane Recovery picks its slots (W5). dnd5e spends the use and rolls "combined spell levels";
 *    the player then had to open the Spells tab and click pips, on the honour system. After the use,
 *    the owner gets a dialog: each spent slot level 1–5 with a number, opening on the highest spent
 *    slots that fit, the PHB budget (half the Wizard level, rounded up; nothing of level 6+) shown
 *    and enforced. Recover writes the slots and posts one line. Setting
 *    pentaryn-riders.arcaneRecovery. Row dnd5e-riders-arcane-recovery-picker.
 */

import { restoreSlotScaling, slotsFrom, arcaneRecoveryCap, arcaneRecoveryDefault, arcaneRecoveryCheck, isArcaneRecovery,
  ARCANE_RECOVERY_MAX_LEVEL } from "./table-core.mjs";
import { settingOr } from "./settings.mjs";
import { restoreSidebar, sidebarState } from "./shapes.mjs";

let log = null;

/* ── 1. summons ─────────────────────────────────────────────────────────── */

let summoning = null;   // { tab, collapsed, until }

function keepSidebar(activity, profile) {
  try {
    summoning = { ...sidebarState(), until: Date.now() + 60_000 };
    if (activity?.summon?.prompt !== false) {
      const name = profile?.name || activity?.item?.name || "";
      ui.notifications?.info?.(_loc("PENTARYN_RIDERS.summon.place", { name }));
    }
  } catch (err) { log.warn("summon sidebar keep skipped", err); }
}

function putSidebarBack(app) {
  const s = summoning;
  if (!s || Date.now() > s.until || !s.tab || app?.tabName !== "actors" || s.tab === "actors") return;
  setTimeout(() => {
    try {
      restoreSidebar(s);
    } catch (err) { log.debug("summon sidebar restore: left as it is", err); }
  }, 0);
}

function summonDone() { summoning = null; }

/* ── 2. restoring a slot opens on the highest spent level ─────────────────── */

function restoreSlotDefault(activity, usageConfig) {
  try {
    // dnd5e's _prepareUsageConfig ends with `scaling ??= 0`, so 0 is its default here (false = a fixed level).
    if (!usageConfig || (usageConfig.scaling !== undefined && usageConfig.scaling !== 0)) return;
    const actor = activity?.actor;
    if (!actor?.system?.spells) return;
    // spell1…spell9 (type "spell"); a Pact slot is its own consumption type and never restored this way.
    const slots = slotsFrom(actor.system.spells);
    const scaling = restoreSlotScaling({
      targets: [...(activity.consumption?.targets ?? [])].map(t => ({ type: t.type, value: t.value, target: t.target })),
      scaling: activity.consumption?.scaling ?? {},
      slots
    });
    if (scaling !== null && scaling > 0) usageConfig.scaling = scaling;
  } catch (err) { log.warn("restore-slot default skipped", err); }
}

/* ── settings for parts 3 and 6 (rows in settings.mjs) ──────────────────── */

const on = key => settingOr(key, false);

/* ── 3. summons ticked to place; a self-only card keeps no stale target ──── */

function dropStaleTargets(activity, usageConfig, dialogConfig, messageConfig) {
  try {
    if (!on("castDefaults")) return;
    const tpl = activity?.target?.template?.type;
    if (activity?.target?.affects?.type === "self" && !tpl && messageConfig?.data?.system?.targets?.length) {
      messageConfig.data.system.targets = [];
    }
  } catch (err) { log.warn("cast defaults skipped", err); }
}

// The Place Summons tick is a wrap of SummonActivity#_prepareUsageConfig: patches.mjs.

/* ── 4. the first click on Use counts after typing a number ──────────────── */

const USE = 'button[data-action="use"]';

function firstClick(app, element) {
  try {
    const root = element instanceof HTMLElement ? element : app?.element;
    if (!root) return;
    // A Use press that committed a typed value: dnd5e has re-rendered, press the new Use button.
    if (app._prUseAfterRender && Date.now() - app._prUseAfterRender < 2000) {
      app._prUseAfterRender = null;
      requestAnimationFrame(() => { if (app.rendered) root.querySelector(USE)?.click(); });
    }
    if (root.dataset.prFirstClick) return;     // the root survives re-renders; listen once
    root.dataset.prFirstClick = "1";
    root.addEventListener("mousedown", ev => {
      if (ev.button !== 0 || !ev.target?.closest?.(USE)) return;
      const focused = document.activeElement;
      if (!focused || !root.contains(focused) || !focused.matches?.("input, select")) return;
      // Commit the value ourselves (blur → change → dnd5e re-renders) and press Use once the
      // dialog has re-rendered. With no change there is no re-render and the click goes through.
      ev.preventDefault();
      app._prUseAfterRender = Date.now();
      focused.blur();
    }, true);
    root.addEventListener("click", ev => {
      if (ev.target?.closest?.(USE)) app._prUseAfterRender = null;
    }, true);
  } catch (err) { log.warn("usage dialog first click skipped", err); }
}

/* ── 5. a wildcard summon image previews as a real image: a wrap of SummonActivity#getPlacement,
   patches.mjs ─────────────────────────────────────────────────────────────── */

/* ── 6. Arcane Recovery: pick the slots ──────────────────────────────────── */

const ordinal = n => game.i18n.localize(`DND5E.SpellLevel${n}`);

async function arcaneRecoveryDialog(actor) {
  const level = actor?.classes?.wizard?.system?.levels ?? 0;
  const cap = arcaneRecoveryCap(level);
  const slots = slotsFrom(actor?.system?.spells);
  const choice = arcaneRecoveryDefault(slots, cap);
  const rows = [];
  for (let l = 1; l <= ARCANE_RECOVERY_MAX_LEVEL; l++) {
    const s = slots[l];
    const spent = s ? Math.max(0, s.max - s.value) : 0;
    if (!spent) continue;
    rows.push(`<div class="form-group"><label>${foundry.utils.escapeHTML(ordinal(l))} <span class="hint">(${s.value}/${s.max})</span></label>
      <div class="form-fields"><input type="number" name="l${l}" min="0" max="${spent}" step="1" value="${choice[l] ?? 0}"></div></div>`);
  }
  if (!rows.length) {
    ui.notifications.info(_loc("PENTARYN_RIDERS.arcaneRecovery.none"));
    return null;
  }
  const read = form => Object.fromEntries([...form.querySelectorAll("input[name^=l]")].map(i => [Number(i.name.slice(1)), Number(i.value) || 0]));
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: _loc("PENTARYN_RIDERS.arcaneRecovery.title"), icon: "fa-solid fa-book-open" },
    content: `<p>${_loc("PENTARYN_RIDERS.arcaneRecovery.intro", { cap })}</p>${rows.join("")}<p class="pr-ar-total"></p>`,
    buttons: [
      { action: "ok", label: _loc("PENTARYN_RIDERS.arcaneRecovery.recover"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => read(button.form) },
      { action: "cancel", label: _loc("PENTARYN_RIDERS.arcaneRecovery.cancel"), icon: "fa-solid fa-xmark" }
    ],
    render: (event, dialog) => {
      const el = dialog.element;
      const form = el.querySelector("form") ?? el;
      const total = el.querySelector(".pr-ar-total");
      const ok = el.querySelector('button[data-action="ok"]');
      const refresh = () => {
        const check = arcaneRecoveryCheck(read(form), slots, cap);
        total.textContent = _loc("PENTARYN_RIDERS.arcaneRecovery.total", { used: check.used, cap });
        total.classList.toggle("over", !check.ok);
        if (ok) ok.disabled = !check.ok || check.used === 0;
      };
      form.addEventListener("input", refresh);
      refresh();
    },
    rejectClose: false
  });
  if (!result || typeof result !== "object") return null;
  const check = arcaneRecoveryCheck(result, slots, cap);
  if (!check.ok || !check.used) return null;
  const update = {};
  const parts = [];
  for (const [l, n] of Object.entries(result)) {
    if (!n) continue;
    update[`system.spells.spell${l}.value`] = slots[l].value + n;
    parts.push(`${n} × ${ordinal(Number(l))}`);
  }
  await actor.update(update);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p>${foundry.utils.escapeHTML(_loc("PENTARYN_RIDERS.arcaneRecovery.done", { name: actor.name, slots: parts.join(", ") }))}</p>`
  });
  return result;
}

function arcaneRecoveryPicker(activity) {
  try {
    if (!on("arcaneRecovery")) return;
    const item = activity?.item;
    const actor = item?.actor;
    if (!actor?.isOwner || !isArcaneRecovery({ type: item.type, identifier: item.system?.identifier, name: item.name })) return;
    // Only the client that used it: postUseActivity runs on the user's own client.
    setTimeout(() => arcaneRecoveryDialog(actor).catch(err => log.warn("Arcane Recovery dialog", err)), 0);
  } catch (err) { log.warn("Arcane Recovery picker skipped", err); }
}

/* ── wiring ───────────────────────────────────────────────────────────── */

export function install(reg, ctx) {
  log = ctx.log;
  // Today's order; every handler has its own try/catch (or none, as changeSidebarTab's guard
  // clauses), so the kit guard is off (guard: false).
  reg.on("dnd5e.preSummon", keepSidebar, { guard: false, label: "summon sidebar keep" });
  reg.on("changeSidebarTab", putSidebarBack, { guard: false, label: "summon sidebar keep" });
  reg.on("dnd5e.postSummon", summonDone, { guard: false, label: "summon sidebar keep" });
  reg.on("dnd5e.preUseActivity", restoreSlotDefault, { guard: false, label: "restore-slot default" });
  reg.on("dnd5e.preUseActivity", dropStaleTargets, { guard: false, label: "cast defaults" });
  reg.on("renderActivityUsageDialog", firstClick, { guard: false, label: "usage dialog first click" });
  reg.on("dnd5e.postUseActivity", arcaneRecoveryPicker, { guard: false, label: "Arcane Recovery picker" });
  ctx.expose({ arcaneRecoveryDialog });
}

export function uninstall() {
  summoning = null;
}

export { arcaneRecoveryDialog };
