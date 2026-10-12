/**
 * Pentaryn Feature Riders — every change this module makes to another package's code, each through
 * the kit's `wrapMethod` with an adjustments row (foundry/adjustments.yml) and a marker, so
 * `describe().patches` lists them and `removePatches()` undoes them (combat-riders-39).
 *
 *   at `ready` (installPatches), in this order — each one's failure is warned and the next still runs:
 *     1. Argon `ButtonPanelButton#_renderInner`   rituals' Rituals / Longer casts groups
 *        marker Symbol.for("pentaryn-riders.ritualsWrapped")   row riders-argon-ritual-adept-list
 *     2. `TextEditor.implementation.enrichHTML`    an Argon tooltip's spell gets its roll data
 *        marker _prItemRollData                                row riders-argon-tooltip-item-rolldata
 *     3. dnd5e `SummonActivity#_prepareUsageConfig` Place Summons ticked by default
 *        marker _prPlaceDefault                                row riders-summon-place-default
 *     4. dnd5e `SummonActivity#getPlacement`         a wildcard summon image previews as a real one
 *        marker _prWildcard                                    row riders-summon-wildcard-preview
 *   lazily, per prototype, from argon-tidy's `renderItemButtonArgonComponent` (wrapItemButton) —
 *   Argon dnd5e's item-button class is closure-private, reachable only through a rendered button:
 *     5. its `targets` getter        a Metamagic button opens no target picker
 *        marker _prTargets                                     row riders-argon-metamagic-no-picker
 *     6. its `getTooltipData`        marks the item while its tooltip is built (for 2)
 *        marker _prTooltip                                     row riders-argon-tooltip-item-rolldata
 *
 * GLUE: the entry imports it; it reads core, the settings readers and the Argon adapter, and re-exports
 * api.mjs's patchRecords (riders-maint-01). Bodies are today's, verbatim (the wraps of 2-6 were hand patches in argon-tidy.mjs and cast-flow.mjs).
 */

import { MODULE } from "./riders-core.mjs";
import { isWildcardPath, placeSummonsDefault, skipsTargetPicker } from "./table-core.mjs";
import { settingOr } from "./settings.mjs";
import { buttonPanelButtonClass } from "./argon.mjs";
import { wrapMethod } from "./lib/patch.mjs";

/** The Rituals wrap's marker (it was a flag on the prototype; now on the replacement function). */
const WRAPPED = Symbol.for(`${MODULE}.ritualsWrapped`);

/** Items whose Argon tooltip is being built right now, each with its count of builds in flight
 *  (6 counts up and down, 2 reads) — overlapping builds for one item each keep the mark. */
const tooltipItems = new Map();

const handles = [];
const keep = handle => { handles.push(handle); return handle; };

/* ── 1. the Rituals group (rituals.mjs exposes addRituals) ───────────────── */

function patchRituals(ctx) {
  const Base = buttonPanelButtonClass();
  if (!Base?.prototype?._renderInner) return;
  keep(wrapMethod(MODULE, {
    target: Base.prototype, name: "_renderInner", label: "Argon ButtonPanelButton#_renderInner",
    marker: WRAPPED, adjustments: "riders-argon-ritual-adept-list",
  }, async function (wrapped, ...args) {
    try { ctx.exposed.addRituals?.(this); } catch (err) { ctx.log.warn("Rituals group skipped", err); }
    return wrapped(...args);
  }, { log: ctx.log }));
}

/* ── 2. tooltip roll data ────────────────────────────────────────────────── */

function patchEnrich(ctx) {
  const TE = foundry.applications?.ux?.TextEditor?.implementation;
  if (!TE?.enrichHTML || TE.enrichHTML._prItemRollData) return;
  keep(wrapMethod(MODULE, {
    target: TE, name: "enrichHTML", label: "TextEditor.implementation.enrichHTML",
    marker: "_prItemRollData", adjustments: "riders-argon-tooltip-item-rolldata",
  }, function (wrapped, content, options = {}) {
    try {
      const item = options?.relativeTo;
      if (item && !options.rollData && (tooltipItems.get(item) ?? 0) > 0 && typeof item.getRollData === "function") {
        options = { ...options, rollData: item.getRollData() };
      }
    } catch (err) { ctx.log.debug("tooltip roll data: enriched as asked", err); }
    return wrapped(content, options);
  }, { log: ctx.log }));
}

/* ── 3. Place Summons ticked ─────────────────────────────────────────────── */

// The tick goes in SummonActivity#_prepareUsageConfig, where "the caller said nothing" (create.summons
// undefined, dnd5e then fills it from summon.prompt) can still be told apart from an explicit false.
function patchPlaceDefault(ctx) {
  const proto = CONFIG.DND5E?.activityTypes?.summon?.documentClass?.prototype;
  if (!proto?._prepareUsageConfig || proto._prepareUsageConfig._prPlaceDefault) return;
  keep(wrapMethod(MODULE, {
    target: proto, name: "_prepareUsageConfig", label: "dnd5e SummonActivity#_prepareUsageConfig",
    marker: "_prPlaceDefault", adjustments: "riders-summon-place-default",
  }, function (wrapped, config = {}) {
    const asked = config?.create === false ? false : config?.create?.summons;
    const out = wrapped(config);
    try {
      if (asked === undefined && settingOr("castDefaults", false) && out?.create && typeof out.create === "object") {
        const tick = placeSummonsDefault({
          type: this.type, create: out.create.summons, canSummon: !!this.canSummon,
          hasScene: !!canvas?.scene, profiles: this.availableProfiles?.length ?? 0
        });
        if (tick) out.create.summons = true;
      }
    } catch (err) { ctx.log.warn("Place Summons default skipped", err); }
    return out;
  }, { log: ctx.log }));
}

/* ── 4. a wildcard summon image previews as a real image ─────────────────── */

function patchWildcard(ctx) {
  const proto = CONFIG.DND5E?.activityTypes?.summon?.documentClass?.prototype;
  if (!proto?.getPlacement || proto.getPlacement._prWildcard) return;
  keep(wrapMethod(MODULE, {
    target: proto, name: "getPlacement", label: "dnd5e SummonActivity#getPlacement",
    marker: "_prWildcard", adjustments: "riders-summon-wildcard-preview",
  }, async function (wrapped, token, profile, options) {
    try {
      const src = token?.texture?.src;
      if (isWildcardPath(src)) {
        const actor = token.parent;
        let images = [];
        if (game.user.can("FILES_BROWSE")) { try { images = await actor.getTokenImages(); } catch { images = []; } }
        const real = images.find(i => !isWildcardPath(i)) ?? actor?.img;
        if (real && !isWildcardPath(real)) token = token.clone({ "texture.src": real });
      }
    } catch (err) { ctx.log.warn("summon preview image kept", err); }
    return wrapped(token, profile, options);
  }, { log: ctx.log }));
}

/** At `ready`: patches 1-4, in today's order. A failure is warned and the rest still install. */
export function installPatches(ctx) {
  try { patchRituals(ctx); } catch (err) { ctx.log.warn("Rituals group not installed", err); }
  try { patchEnrich(ctx); } catch (err) { ctx.log.warn("tooltip roll data skipped", err); }
  try { patchPlaceDefault(ctx); } catch (err) { ctx.log.warn("Place Summons default not installed", err); }
  try { patchWildcard(ctx); } catch (err) { ctx.log.warn("summon wildcard preview skipped", err); }
}

/* ── 5 + 6: Argon dnd5e's item button, per prototype, when a button renders ── */

/** The accessor `name` on `proto` or its chain, or undefined. */
function accessorOf(proto, name) {
  for (let p = proto; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d) return d;
  }
  return undefined;
}

/**
 * Wrap the rendered button's class (once per prototype; a subclass whose inherited method is
 * already wrapped is left alone, so a tooltip is enriched once). A class without the getter or the
 * method gains nothing.
 */
export function wrapItemButton(button, ctx) {
  const proto = Object.getPrototypeOf(button);
  if (!proto) return;
  const cls = proto.constructor?.name || "ItemButton";
  const targets = accessorOf(proto, "targets");
  if (typeof targets?.get === "function" && !targets.get._prTargets) {
    keep(wrapMethod(MODULE, {
      target: proto, name: "targets", kind: "getter", label: `Argon ${cls}#targets`,
      marker: "_prTargets", adjustments: "riders-argon-metamagic-no-picker",
    }, function (wrapped) {
      return skipsTargetPicker(this.item) ? null : wrapped();
    }, { log: ctx.log }));
  }
  const tip = proto.getTooltipData;
  if (typeof tip === "function" && !tip._prTooltip) {
    keep(wrapMethod(MODULE, {
      target: proto, name: "getTooltipData", label: `Argon ${cls}#getTooltipData`,
      marker: "_prTooltip", adjustments: "riders-argon-tooltip-item-rolldata",
    }, async function (wrapped, ...args) {
      const it = this.item;
      if (!it || it.documentName !== "Item") return wrapped(...args);
      tooltipItems.set(it, (tooltipItems.get(it) ?? 0) + 1);
      try { return await wrapped(...args); } finally {
        const n = (tooltipItems.get(it) ?? 1) - 1;
        if (n > 0) tooltipItems.set(it, n); else tooltipItems.delete(it);
      }
    }, { log: ctx.log }));
  }
}

/** Undo every patch this module made (newest first) and forget the tooltip marks. */
export function removePatches() {
  for (const h of handles.splice(0).reverse()) h.unwrap();
  tooltipItems.clear();
}

/** `describe().patches`: defined once in api.mjs (riders-maint-01). */
export { patchRecords } from "./api.mjs";
