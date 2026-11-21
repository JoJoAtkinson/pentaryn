/**
 * Pentaryn Creatures — FEATURE: public and hidden token markers (unit N). A player sees a status
 * marker on a creature they do not observe only when its row in the Token markers menu is Public;
 * an enemy's spell and item effects (Mage Armor, Bless) follow one "other" row; a friendly token
 * shows everything while that toggle is on; a dormant token (dormant.mjs) shows nothing until it
 * wakes. The rules and the defaults: creatures-core.mjs "Public and hidden markers".
 *
 * The one hook point is dnd5e's ActiveEffect5e#isConcealed: a concealed effect draws no token
 * icon (isTemporary is false for it), no sheet row, no combat-tracker icon and no scrolling status
 * text. The wrap keeps every reason dnd5e conceals for itself (an unidentified item, a disabled
 * origin, system.isConcealed) and replaces only its Bloodied rule (dnd5e.bloodied = "player") with
 * the table: with this feature on, Bloodied follows its row (Public by default) whatever that
 * setting says. A GM, an owner and an observer are never touched (the wrap returns dnd5e's answer).
 *
 * The wrap goes through the kit's wrapMethod at `setup` (dnd5e sets CONFIG.ActiveEffect.documentClass
 * at init): libWrapper (WRAPPER on CONFIG.ActiveEffect.documentClass.prototype.isConcealed) when
 * lib-wrapper is active, else the getter is replaced on the prototype. Adjustments row
 * `creatures-dnd5e-effect-isconcealed`. The getter runs inside every token effects draw: it never
 * throws (a failure answers dnd5e's value and warns once) and reads cached settings.
 */

import {
  DISPOSITIONS, MODULE, concealFor, finalConceal, markerStatusEffects, markerTable, markersMayChange, readDormant, safely, statusIdsOf,
} from "./creatures-core.mjs";
import { setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { libWrapperRoute } from "./lib/patch-libwrapper.mjs";

let log = null;
/** The `markers` setting, cached (read in a hot getter). */
let markersOn = true;
/** The effective table, built lazily from CONFIG.statusEffects and `markerTable`; null = rebuild. */
let table = null;
/** The wrap's handle (kit wrapMethod): `via` is "libWrapper" | "direct" | null. */
let handle = null;
let patchedWith = null;

/** The effective table now (cached until a setting changes). */
export function currentTable() {
  return (table ??= markerTable(statusIdsOf(markerStatusEffects(globalThis.CONFIG?.statusEffects, globalThis.CONFIG?.DND5E)), setting("markerTable")));
}

const sourceOf = doc => doc?._source ?? doc;

/** The token documents that decide dormant / friendly for this actor's effects. */
function tokensOf(actor) {
  if (actor.isToken && actor.token) return [actor.token];        // an unlinked token's synthetic actor
  const active = safely(() => actor.getActiveTokens?.(false, true), null, []) ?? [];
  return Array.isArray(active) ? active : [...active];
}

/**
 * dnd5e conceals Bloodied from non-friendly tokens under dnd5e.bloodied = "player". True when that
 * rule is the only reason dnd5e said yes, so the table can replace it.
 */
function bloodiedRuleOnly(effect) {
  const id = effect?.constructor?.ID?.BLOODIED;
  if (!id || effect.id !== id) return false;
  if (effect.system?.isConcealed) return false;
  if (effect.dependentOrigin?.active === false) return false;
  if (effect.item?.system?.identified === false) return false;
  return true;
}

/**
 * The wrapped answer: dnd5e's `base` for a GM, an owner or an observer, or with the feature off;
 * otherwise dnd5e's own reasons plus the table. Never throws.
 */
export function concealed(effect, base) {
  if (!markersOn || globalThis.game?.user?.isGM) return base;
  return safely(() => {
    const actor = effect?.target;
    if (!actor || actor.documentName !== "Actor") return base;
    if (actor.testUserPermission?.(game.user, "OBSERVER")) return base;
    const tokens = tokensOf(actor);
    const first = tokens[0] ?? null;
    const disposition = first ? first.disposition : actor.prototypeToken?.disposition;
    const ours = concealFor(effect.statuses ?? [], { isGM: false, isObserver: false }, {
      dormant: tokens.some(t => !!readDormant(sourceOf(t))),
      friendly: disposition === DISPOSITIONS.FRIENDLY,
    }, currentTable());
    return finalConceal({ base, bloodiedRuleOnly: !!base && bloodiedRuleOnly(effect), ours });
  }, err => log?.warnOnce("markers", "marker check failed; dnd5e's answer used", err), base);
}

function patchConcealed() {
  const cls = globalThis.CONFIG?.ActiveEffect?.documentClass;
  if (!cls) return (patchedWith = null);   // no ActiveEffect class (a stand-in world): nothing to wrap
  const proto = cls.prototype;
  let owner = proto, desc;
  while (owner && !(desc = Object.getOwnPropertyDescriptor(owner, "isConcealed"))) owner = Object.getPrototypeOf(owner);
  if (typeof desc?.get !== "function") {
    log.warn("ActiveEffect5e#isConcealed not found; public and hidden markers are off");
    return (patchedWith = null);
  }
  handle = wrapMethod(MODULE, {
    target: proto, kind: "getter", name: "isConcealed", label: "ActiveEffect5e#isConcealed",
    path: "CONFIG.ActiveEffect.documentClass.prototype.isConcealed", type: "WRAPPER",
    marker: "__pentarynCreaturesConcealed", adjustments: "creatures-dnd5e-effect-isconcealed",
  }, function (wrapped, ...args) {
    return concealed(this, wrapped(...args));
  }, { via: libWrapperRoute({ log }), log });
  return (patchedWith = handle.via);
}

/** Redraw the effect icons of these placeables (all on the canvas when none given), and the tracker. */
function redraw(placeables) {
  if (!globalThis.canvas?.ready) return;
  for (const t of placeables ?? canvas.tokens?.placeables ?? []) t?.renderFlags?.set({ redrawEffects: true });
}

function onSettingsChanged() {
  table = null;
  redraw();
  if (globalThis.ui?.combat?.rendered) ui.combat.render();
}

/** A token was armed, woken or turned friendly: its icons (and its linked actor's other tokens) redraw. */
function onUpdateToken(doc, changes) {
  if (!markersOn || globalThis.game?.user?.isGM || !markersMayChange(changes)) return;
  const actorId = doc?.actorLink ? doc.actorId : null;
  const hit = (canvas?.tokens?.placeables ?? []).filter(t => t.document === doc || (actorId && t.document?.actorId === actorId));
  redraw(hit);
}

function onSetup() {
  markersOn = setting("markers") !== false;
  table = null;
  patchConcealed();
}

export function install(reg, ctx) {
  log = ctx.log;
  ctx.onSettingChange("markers", (v) => { markersOn = v !== false; onSettingsChanged(); });
  ctx.onSettingChange("markerTable", () => onSettingsChanged());
  if (ctx.late) onSetup();
  else reg.once("setup", onSetup, { guard: false, label: "setup: wrap ActiveEffect5e#isConcealed" });
  reg.on("updateToken", onUpdateToken, { label: "updateToken: redraw markers" });
  ctx.expose({ markersPatched: () => patchedWith });
}

/** Undo the wrap (hot patch: then re-import the entry to wrap again). */
export function uninstall() {
  handle?.unwrap();
  handle = null;
  patchedWith = null;
  table = null;
}
