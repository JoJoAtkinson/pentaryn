/**
 * Ritual Adept (wizard): rituals reachable from the HUD, and cast without a slot by default.
 * ==========================================================================================
 *
 * FEATURE: install(reg, ctx) / uninstall(). The rules and the spell filter are pure, in
 * rituals-core.mjs (`node test/rituals.mjs`). The Argon wrap itself is in patches.mjs (installed at
 * `ready`); it calls `addRituals`, which this feature exposes through `ctx.expose`.
 *
 * 1. Usage default — `dnd5e.preUseActivity` fires after dnd5e has filled the usage config and
 *    before the dialog. For an unprepared ritual spell of an actor with Ritual Adept (castable only
 *    as a ritual), `consume.spellSlot` starts false. The dialog still shows "Consume Spell Slot"
 *    and the slot picker, so the player can tick it; nothing is forced. Works from the sheet, the
 *    HUD, anywhere dnd5e's own `activity.use()` runs.
 *
 * 2. Argon list — Argon's Cast Spell panel hides unprepared spells for a wizard (actor flag
 *    `enhancedcombathud-dnd5e.showPrepared`, unset = prepared only). Its spell button builds its
 *    accordion categories in its constructor (`_spells`) and turns them into the panel in
 *    `_renderInner` → `_getPanel`. Our wrap of the BASE `ButtonPanelButton.prototype._renderInner`
 *    (Argon's dnd5e subclass does not override it; patches.mjs) runs `addRituals`, which appends one
 *    "Rituals" category to the ACTION bar's spell button, once per instance, before the panel is
 *    built. Buttons are made with the same class Argon uses for the other spells, taken from an
 *    existing category's button. Nothing in Argon's files is edited. Registered in
 *    foundry/adjustments.yml (riders-argon-ritual-adept-list).
 *
 * 3. Longer casts (usability Area 6 re-run, W7). Argon puts a spell on a bar only when one of its
 *    activities is an action, bonus action, reaction or special. Animate Dead (1 minute) was on no
 *    bar, so a player could start it only from the sheet. The Action bar's Cast Spell panel gets a
 *    "Longer casts" group: castable spells (Argon's own prepared filter) whose casting time is
 *    minutes or hours and that no bar shows. Any character, not only wizards. Setting
 *    pentaryn-riders.longCasts (world, default on). Row riders-argon-long-casts.
 *
 * Setting: pentaryn-riders.rituals (world, default on) turns 1 and 2 off.
 */

import * as rit from "./rituals-core.mjs";
import { MODULE } from "./riders-core.mjs";
import { settingOr } from "./settings.mjs";

const DONE = Symbol.for(`${MODULE}.ritualsAdded`);

const enabled = () => settingOr("rituals", false);
const longEnabled = () => settingOr("longCasts", false);

function hasRitualAdept(actor) {
  return !!actor?.items?.some(i => rit.isRitualAdept({
    type: i.type,
    identifier: i.system?.identifier ?? "",
    source: i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? "",
    name: i.name
  }));
}

let log = null;

/* ── 1. slot unticked by default ──────────────────────────────────────── */

function slotDefault(activity, usageConfig) {
  try {
    if (!enabled()) return;
    const item = activity?.item;
    if (item?.type !== "spell" || !rit.isAdeptOnlyRitual(rit.spellInfo(item))) return;
    if (!hasRitualAdept(item.actor)) return;
    const consume = usageConfig?.consume;
    if (consume && typeof consume === "object" && consume.spellSlot === true) consume.spellSlot = false;
  } catch (err) { log.warn("ritual slot default skipped", err); }
}

/* ── 2. "Rituals" group on Argon's Action-bar Cast Spell panel ─────────── */

function addRituals(button) {
  if (Object.hasOwn(button, DONE)) return;
  button[DONE] = true;
  if (button.type !== "spell" || !Array.isArray(button._spells)) return;
  if (button._parent?.label !== "DND5E.Action") return;
  const actor = button.actor;
  if (actor?.type !== "character") return;
  const Btn = button._spells.flatMap(c => c.buttons ?? [])[0]?.constructor;
  if (!Btn) return;
  const all = actor.items.filter(i => i.type === "spell");
  if (enabled() && button.showPreparedOnly && hasRitualAdept(actor)) {
    const spells = rit.adeptRituals(all);
    if (spells.length) button._spells.push({
      label: _loc("PENTARYN_RIDERS.rituals.group"),
      buttons: spells.map(item => new Btn({ item })),
      uses: { max: Infinity, value: Infinity }
    });
  }
  // 3. Longer casts (Animate Dead's 1 minute is on no bar at all).
  if (longEnabled()) {
    const long = rit.longCasts(all.map(item => ({
      item, s: rit.spellInfo(item),
      activations: [...(item.system?.activities ?? [])].map(a => a?.activation?.type).filter(Boolean)
    })), { preparedOnly: !!button.showPreparedOnly });
    if (long.length) button._spells.push({
      label: _loc("PENTARYN_RIDERS.rituals.longGroup"),
      buttons: long.map(item => new Btn({ item })),
      uses: { max: Infinity, value: Infinity }
    });
  }
}

export function install(reg, ctx) {
  log = ctx.log;
  // each handler has its own try/catch (guard: false keeps today's warn text and return values)
  reg.on("dnd5e.preUseActivity", slotDefault, { guard: false, label: "ritual slot default" });
  ctx.expose({ addRituals });
}

/** Nothing to clear: the per-button DONE marks live on Argon's button instances. */
export function uninstall() {}
