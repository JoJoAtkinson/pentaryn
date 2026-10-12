/**
 * Cast-flow fixes from the sorcerer re-run (usability Area 5 re-run).
 * ===================================================================
 *
 * Imported by riders.mjs. Pure helpers in table-core.mjs (`node test/table.mjs`).
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
 *    targeted minutes earlier). Setting pentaryn-riders.castDefaults. Row dnd5e-summon-place-default.
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
 *    token's own random image. Row dnd5e-summon-wildcard-preview.
 *
 * 6. Arcane Recovery picks its slots (W5). dnd5e spends the use and rolls "combined spell levels";
 *    the player then had to open the Spells tab and click pips, on the honour system. After the use,
 *    the owner gets a dialog: each spent slot level 1–5 with a number, opening on the highest spent
 *    slots that fit, the PHB budget (half the Wizard level, rounded up; nothing of level 6+) shown
 *    and enforced. Recover writes the slots and posts one line. Setting
 *    pentaryn-riders.arcaneRecovery. Row riders-arcane-recovery-picker.
 */

import { MODULE, restoreSlotScaling, placeSummonsDefault, isWildcardPath, arcaneRecoveryCap, arcaneRecoveryDefault,
  arcaneRecoveryCheck, isArcaneRecovery, ARCANE_RECOVERY_MAX_LEVEL } from "./table-core.mjs";

const T = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/* ── 1. summons ─────────────────────────────────────────────────────────── */

let summoning = null;   // { tab, collapsed, until }

Hooks.on("dnd5e.preSummon", (activity, profile) => {
  try {
    const sidebar = ui.sidebar;
    summoning = { tab: sidebar?.tabGroups?.primary ?? null, collapsed: sidebar ? !sidebar.expanded : false, until: Date.now() + 60_000 };
    if (activity?.summon?.prompt !== false) {
      const name = profile?.name || activity?.item?.name || "";
      ui.notifications?.info?.(T("PENTARYN_RIDERS.summon.place", { name }));
    }
  } catch (err) { console.warn(`${MODULE} | summon sidebar keep skipped`, err); }
});

Hooks.on("changeSidebarTab", (app) => {
  const s = summoning;
  if (!s || Date.now() > s.until || !s.tab || app?.tabName !== "actors" || s.tab === "actors") return;
  setTimeout(() => {
    try {
      ui.sidebar.changeTab(s.tab, "primary");
      if (s.collapsed && ui.sidebar.expanded) ui.sidebar.collapse();
    } catch { /* leave it */ }
  }, 0);
});

Hooks.on("dnd5e.postSummon", () => { summoning = null; });

/* ── 2. restoring a slot opens on the highest spent level ─────────────────── */

Hooks.on("dnd5e.preUseActivity", (activity, usageConfig) => {
  try {
    // dnd5e's _prepareUsageConfig ends with `scaling ??= 0`, so 0 is its default here (false = a fixed level).
    if (!usageConfig || (usageConfig.scaling !== undefined && usageConfig.scaling !== 0)) return;
    const actor = activity?.actor;
    if (!actor?.system?.spells) return;
    const slots = {};
    // spell1…spell9 (type "spell"); a Pact slot is its own consumption type and never restored this way.
    for (const [key, s] of Object.entries(actor.system.spells)) {
      if (/^spell[1-9]$/.test(key) && Number.isFinite(s?.level)) slots[s.level] = { value: s.value, max: s.max };
    }
    const scaling = restoreSlotScaling({
      targets: [...(activity.consumption?.targets ?? [])].map(t => ({ type: t.type, value: t.value, target: t.target })),
      scaling: activity.consumption?.scaling ?? {},
      slots
    });
    if (scaling !== null && scaling > 0) usageConfig.scaling = scaling;
  } catch (err) { console.warn(`${MODULE} | restore-slot default skipped`, err); }
});

/* ── settings for parts 3 and 6 ─────────────────────────────────────────── */

Hooks.once("init", () => {
  game.settings.register(MODULE, "castDefaults", {
    name: "PENTARYN_RIDERS.settings.castDefaults.name",
    hint: "PENTARYN_RIDERS.settings.castDefaults.hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE, "arcaneRecovery", {
    name: "PENTARYN_RIDERS.settings.arcaneRecovery.name",
    hint: "PENTARYN_RIDERS.settings.arcaneRecovery.hint",
    scope: "world", config: true, type: Boolean, default: true
  });
});

const on = key => { try { return game.settings.get(MODULE, key) !== false; } catch { return false; } };

/* ── 3. summons ticked to place; a self-only card keeps no stale target ──── */

Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
  try {
    if (!on("castDefaults")) return;
    const tpl = activity?.target?.template?.type;
    if (activity?.target?.affects?.type === "self" && !tpl && messageConfig?.data?.system?.targets?.length) {
      messageConfig.data.system.targets = [];
    }
  } catch (err) { console.warn(`${MODULE} | cast defaults skipped`, err); }
});

// The tick goes in SummonActivity#_prepareUsageConfig, where "the caller said nothing" (create.summons
// undefined, dnd5e then fills it from summon.prompt) can still be told apart from an explicit false.
Hooks.once("ready", () => {
  try {
    const proto = CONFIG.DND5E?.activityTypes?.summon?.documentClass?.prototype;
    if (!proto?._prepareUsageConfig || proto._prPlaceDefault) return;
    const own = proto._prepareUsageConfig;
    proto._prepareUsageConfig = function _prepareUsageConfig(config = {}) {
      const asked = config?.create === false ? false : config?.create?.summons;
      const out = own.call(this, config);
      try {
        if (asked === undefined && on("castDefaults") && out?.create && typeof out.create === "object") {
          const tick = placeSummonsDefault({
            type: this.type, create: out.create.summons, canSummon: !!this.canSummon,
            hasScene: !!canvas?.scene, profiles: this.availableProfiles?.length ?? 0
          });
          if (tick) out.create.summons = true;
        }
      } catch (err) { console.warn(`${MODULE} | Place Summons default skipped`, err); }
      return out;
    };
    proto._prPlaceDefault = true;
  } catch (err) { console.warn(`${MODULE} | Place Summons default not installed`, err); }
});

/* ── 4. the first click on Use counts after typing a number ──────────────── */

const USE = 'button[data-action="use"]';

Hooks.on("renderActivityUsageDialog", (app, element) => {
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
  } catch (err) { console.warn(`${MODULE} | usage dialog first click skipped`, err); }
});

/* ── 5. a wildcard summon image previews as a real image ─────────────────── */

Hooks.once("ready", () => {
  try {
    const Summon = CONFIG.DND5E?.activityTypes?.summon?.documentClass;
    const proto = Summon?.prototype;
    if (!proto?.getPlacement || proto._prWildcard) return;
    const own = proto.getPlacement;
    proto.getPlacement = async function getPlacement(token, profile, options) {
      try {
        const src = token?.texture?.src;
        if (isWildcardPath(src)) {
          const actor = token.parent;
          let images = [];
          if (game.user.can("FILES_BROWSE")) { try { images = await actor.getTokenImages(); } catch { images = []; } }
          const real = images.find(i => !isWildcardPath(i)) ?? actor?.img;
          if (real && !isWildcardPath(real)) token = token.clone({ "texture.src": real });
        }
      } catch (err) { console.warn(`${MODULE} | summon preview image kept`, err); }
      return own.call(this, token, profile, options);
    };
    proto._prWildcard = true;
  } catch (err) { console.warn(`${MODULE} | summon wildcard preview skipped`, err); }
});

/* ── 6. Arcane Recovery: pick the slots ──────────────────────────────────── */

const ordinal = n => game.i18n.localize(`DND5E.SpellLevel${n}`);

function slotTable(actor) {
  const slots = {};
  for (let level = 1; level <= 9; level++) {
    const s = actor?.system?.spells?.[`spell${level}`];
    if (s) slots[level] = { value: Number(s.value) || 0, max: Number(s.max) || 0 };
  }
  return slots;
}

async function arcaneRecoveryDialog(actor) {
  const level = actor?.classes?.wizard?.system?.levels ?? 0;
  const cap = arcaneRecoveryCap(level);
  const slots = slotTable(actor);
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
    ui.notifications.info(game.i18n.localize("PENTARYN_RIDERS.arcaneRecovery.none"));
    return null;
  }
  const T = (k, d) => game.i18n.format(`PENTARYN_RIDERS.arcaneRecovery.${k}`, d ?? {});
  const read = form => Object.fromEntries([...form.querySelectorAll("input[name^=l]")].map(i => [Number(i.name.slice(1)), Number(i.value) || 0]));
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: T("title"), icon: "fa-solid fa-book-open" },
    content: `<p>${T("intro", { cap })}</p>${rows.join("")}<p class="pr-ar-total"></p>`,
    buttons: [
      { action: "ok", label: T("recover"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => read(button.form) },
      { action: "cancel", label: T("cancel"), icon: "fa-solid fa-xmark" }
    ],
    render: (event, dialog) => {
      const el = dialog.element;
      const form = el.querySelector("form") ?? el;
      const total = el.querySelector(".pr-ar-total");
      const ok = el.querySelector('button[data-action="ok"]');
      const refresh = () => {
        const check = arcaneRecoveryCheck(read(form), slots, cap);
        total.textContent = T("total", { used: check.used, cap });
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
    content: `<p>${foundry.utils.escapeHTML(T("done", { name: actor.name, slots: parts.join(", ") }))}</p>`
  });
  return result;
}

Hooks.on("dnd5e.postUseActivity", (activity) => {
  try {
    if (!on("arcaneRecovery")) return;
    const item = activity?.item;
    const actor = item?.actor;
    if (!actor?.isOwner || !isArcaneRecovery({ type: item.type, identifier: item.system?.identifier, name: item.name })) return;
    // Only the client that used it: postUseActivity runs on the user's own client.
    setTimeout(() => arcaneRecoveryDialog(actor).catch(err => console.warn(`${MODULE} | Arcane Recovery dialog`, err)), 0);
  } catch (err) { console.warn(`${MODULE} | Arcane Recovery picker skipped`, err); }
});

export { arcaneRecoveryDialog };
