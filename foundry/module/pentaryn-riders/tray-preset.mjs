/**
 * Pentaryn Feature Riders — FEATURE: Elemental Adept's damage-tray preset. When the damage tray
 * first lists a target that resists the feature's type, its resistance starts "ignored" (from the
 * message flag's `ignoreResistance`, damage-riders.mjs); the GM can switch it back, and
 * re-calculating and Apply keep that choice.
 */

import { MODULE } from "./riders-core.mjs";
import { settingRaw } from "./settings.mjs";

/** Marks a tray options object (and, through the spread, its later copies) as seeded once. */
const PRESET = Symbol.for(`${MODULE}.resistancePreset`);

let log = null;

// The tray (`damage-application`) keeps one options object per target (getTargetOptions) and
// hands `actor.calculateDamage` a shallow copy of it on every calculation and on Apply
// (getMergedOptions). A preset written only on the copy would be lost — or, re-written on every
// copy, could never be switched off. So the preset is seeded on the tray's own per-target object
// together with the PRESET marker (the spread copies symbol keys, so later copies carry it): the
// GM can switch the resistance back on, re-calculating keeps that choice, and Apply uses it.
// When no tray for the message is in the DOM, only the copy is changed (the old behaviour).

function seedIgnore(options, hit) {
  if (options.ignore === true || options.ignore?.resistance === true) return;
  options.ignore ??= {};
  if (!(options.ignore.resistance instanceof Set)) options.ignore.resistance = new Set();
  for (const t of hit) options.ignore.resistance.add(t);
}

/** The per-target options objects of every tray on this message that stand for `actor`. */
function trayOptionsFor(message, actor) {
  if (!message?.id || !actor) return [];
  const out = [];
  const sel = `[data-message-id="${CSS.escape(message.id)}"] damage-application`;
  for (const tray of document.querySelectorAll(sel)) {
    if (typeof tray.getTargetOptions !== "function") continue;
    // The tray keys targets by token uuid (actor uuid when the actor has no token on the scene).
    // While it builds its list the entry being calculated has no <option> yet, so the actor's own
    // tokens are candidates too.
    const uuids = new Set();
    for (const o of tray.targetList?.querySelectorAll?.("option") ?? []) if (o.value) uuids.add(o.value);
    if (actor.isToken && actor.token) uuids.add(actor.token.uuid);
    for (const t of actor.getActiveTokens?.(false, true) ?? []) uuids.add(t.uuid);
    uuids.add(actor.uuid);
    for (const uuid of uuids) {
      const doc = fromUuidSync(uuid, { strict: false });
      if (doc !== actor && doc?.actor !== actor) continue;
      out.push(tray.getTargetOptions(uuid));
    }
  }
  return out;
}

// Synchronous and never vetoes (returns undefined); dnd5e calls this pre-hook with Hooks.call.
function preset(actor, damages, options) {
  try {
    if (!options || options[PRESET]) return;
    const message = options.originatingMessage;
    const types = message?.flags?.[MODULE]?.ignoreResistance;
    if (!types?.length || !settingRaw("enabled")) return;
    const dr = actor?.system?.traits?.dr?.value;
    const hit = types.filter(t => dr?.has?.(t));
    for (const persistent of trayOptionsFor(message, actor)) {
      if (persistent[PRESET]) continue; // already seeded: the GM's choice stands
      persistent[PRESET] = true;
      if (hit.length) seedIgnore(persistent, hit);
    }
    // This calculation's copy was taken before the seeding above.
    options[PRESET] = true;
    if (hit.length) seedIgnore(options, hit);
  } catch (err) { log.warn("resistance preset skipped", err); }
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("dnd5e.preCalculateDamage", preset, { guard: false, label: "Elemental Adept damage-tray preset" });
}

/** Nothing to clear: the PRESET marks live on the trays' own per-target option objects. */
export function uninstall() {}
