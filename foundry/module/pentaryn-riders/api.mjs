/**
 * Pentaryn Feature Riders — the API: implementations for the manifest rows, inspect(), selftest().
 *
 * May import core, adapters, settings, the manifest and lib — never a feature file. Feature
 * functions reach this file through `ctx.exposed` (cast-flow's `arcaneRecoveryDialog`); Battle
 * Medic contributes its own two rows from battle-medic.mjs.
 */

import * as core from "./riders-core.mjs";
import { HOOKS, MODULE, NS } from "./riders-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import {
  carriedBy, concentrationSummonsOf, featuresOf, hdPools, hdSummary, isBattleMedic, isType, restoreHitDie, spendHitDie,
  withLegacyActor,
} from "./shapes.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { fail, ok } from "./lib/errors.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

const QUERY = `${MODULE}.battleMedic`;

/**
 * Set the damage type a typed feature (Elemental Adept, Elemental Affinity) stands for.
 * `target` is that item, or an actor: then every typed feature item on it is set (only the one
 * rule's items when `ruleKey` is given). Returns the names of the items set.
 */
async function setType(target, type, ruleKey = null) {
  const t = String(type ?? "").toLowerCase().trim();
  if (!t) throw new Error("setType(item | actor, type, ruleKey?): type required");
  const items = target instanceof Actor
    ? featuresOf(target).filter(f => f.rule.types && (!ruleKey || f.key === ruleKey)).flatMap(f => f.items)
    : [target];
  const done = [];
  for (const item of items) {
    if (!item?.setFlag) continue;
    await item.setFlag(MODULE, "damageType", t);
    done.push(item.name);
  }
  return done;
}

/**
 * The PHB models Elemental Affinity as damage activities the player clicks to add +CHA. With the
 * rider on, clicking one adds it twice. This pins the resolved type into the item's flag (the
 * activities were one way to resolve it) and deletes those activities. Typeless → left alone.
 */
async function retireManual(actor) {
  const out = [];
  for (const f of featuresOf(actor)) {
    if (f.key !== "elemental-affinity" || !f.types?.length) continue;
    for (const item of f.items) {
      if (!item.isOwner) continue;
      if (!item.getFlag(MODULE, "damageType")) await item.setFlag(MODULE, "damageType", f.types.length === 1 ? f.types[0] : f.types);
      for (const a of item.system.activities?.contents ?? []) {
        if (a.type !== "damage") continue;
        await item.deleteActivity(a.id);
        out.push(`${item.name}: ${a.name || a.id}`);
      }
    }
  }
  return out;
}

/** One row per feature of `a`: what is active, which types, and Battle Medic's state (core reportRow). */
function rowsFor(a) {
  return featuresOf(a).map(f => {
    const activities = f.items.flatMap(i => i.system.activities?.contents ?? []);
    let hand = null;
    if (f.rule.effect?.unlessCarried) {
      // Spells that already add this ability by hand: the rider skips them (no double count).
      const ability = f.rule.effect.bonus;
      const spells = a.items.filter(i => i.type === "spell" && (i.system.activities?.contents ?? []).some(x => carriedBy(x).includes(ability)));
      hand = { ability, spells: spells.map(i => i.name) };
    }
    let battleMedic = null;
    if (f.key === "healer") {
      const bm = activities.find(x => isBattleMedic(x));
      const kit = bm?.consumption?.targets?.find(t => t.type === "itemUses")?.target ?? null;
      battleMedic = { installed: !!bm, kit, kitFound: !!kit && a.items.has(kit), kitName: kit && a.items.has(kit) ? a.items.get(kit).name : null };
    }
    return core.reportRow({
      actor: a.name, rule: f.key, items: f.items.map(i => i.name),
      typed: !!f.rule.types, types: f.types,
      manual: f.key === "elemental-affinity" ? activities.filter(x => x.type === "damage").length : 0,
      hand, battleMedic,
    });
  });
}

/** One row per (actor, feature) — every character actor when none is given — and a console.table of them. */
function report(actor) {
  const actors = actor ? [actor] : game.actors.filter(a => a.type === "character");
  const rows = actors.flatMap(a => rowsFor(a));
  console.table(rows);
  return rows;
}

/**
 * @param {object} actor  resolved by buildApi (the row's first param is `ref`)
 * @param {{ as?: * }} opts  `as`: a user ref — that user's view: rows and hd need OBSERVER on the
 *   actor; the concentration summons (tokens on any scene) are GM-only.
 */
function inspect(actor, { as } = {}) {
  const viewer = as === undefined || as === null ? null : resolveRef(as, "user");
  const gmView = !viewer || viewer.isGM === true;
  const observes = gmView || actor.testUserPermission?.(viewer, "OBSERVER") === true;
  return toPlain({
    actor: refOf(actor),
    rows: observes ? rowsFor(actor) : null,
    hd: observes ? hdSummary(actor) : null,
    settings: settingsSnapshot(),
    concentrationSummons: gmView ? concentrationSummonsOf(actor, game.scenes) : null,
  });
}

/** The Arcane Recovery picker for an owned actor, without spending a use (combat-riders-32 ext.). */
async function arcaneRecovery(actor, ctx) {
  if (!actor.isOwner) return fail("REFUSED", `${game.user.name} does not own ${actor.name}`);
  const recovered = await ctx.exposed.arcaneRecoveryDialog(actor);
  return ok({ actor: refOf(actor), recovered: recovered ?? null });
}

/** This module's live patch records (a symbol marker by its description). */
function patchRecords() {
  return patches().filter(p => p.moduleId === MODULE).map(({ moduleId: _m, ...p }) => ({
    ...p, marker: typeof p.marker === "symbol" ? p.marker.description : p.marker,
  }));
}

const LIFECYCLE = new Set(["init", "setup", "ready"]);

function selftest(ctx) {
  const hooks = ctx.reg.ids().filter(h => !LIFECYCLE.has(h.name));
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "settings readable", ok: SETTINGS.every(r => typeof ctx.setting(r.key) === "boolean") },
    { label: "hooks registered", ok: hooks.length === 23, detail: hooks.length },
    { label: "Battle Medic relay registered", ok: typeof CONFIG.queries?.[QUERY] === "function" },
    { label: "patches installed", ok: true, detail: patchRecords().map(p => p.adjustments) },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    inspect: (actor, opts = {}) => inspect(actor, opts),
    selftest: () => selftest(ctx),
    arcaneRecovery: actor => arcaneRecovery(actor, ctx),
    // legacy rows: a name, id, uuid or Token also resolves; a miss answers null (combat-riders-12)
    ...Object.fromEntries(Object.entries({ featuresOf, report, setType, retireManual, spendHitDie, restoreHitDie, hdPools })
      .map(([k, fn]) => [k, withLegacyActor(fn)])),
    preview: (formula, opts) => core.transformFormula(formula, { isType, ...opts }),
    rules: core.RULES,
    core,
  }, {
    contributions: ctx.contributions,
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: patchRecords(),
      queries: [QUERY],
      published: publishedOf(NS),
    }),
  });
}
