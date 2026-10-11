/**
 * Pentaryn Attunement Slots — the API: implementations for the manifest rows, report(),
 * inspect(), selftest(), and buildApiFor (the kit-built, frozen API).
 *
 * GLUE. Imports core, the adapter, the manifest and lib — never a feature file.
 */

import { BOND, HOOKS, MODULE, NS, awayOf, computeSlots } from "./attunement-core.mjs";
import { releaseAway, stash, tooltipGuarded } from "./actor-adapter.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { readFlag } from "./lib/flags.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

/**
 * What is attuned, what it is doing, and what looks wrong.
 * @param {Actor|string} [target]  Actor, name, or id. Defaults to the selected token.
 * @param {{quiet?: boolean}} [opts]  quiet: return the result without printing it
 */
function report(target, { quiet = false } = {}) {
  const actor = (target instanceof Actor) ? target
    : (typeof target === "string" ? (game.actors.get(target) ?? game.actors.getName(target)) : null)
    ?? canvas.tokens?.controlled?.[0]?.actor;
  if (!actor) return quiet ? undefined : console.warn(`${MODULE} | no actor`);

  const { slots, max, value, over } = computeSlots(actor);
  const rows = actor.items
    .filter(i => i.system?.attunement || i.system?.attuned)
    .map(i => ({
      item: i.name,
      slot: slots.indexOf(i.id) >= 0 ? slots.indexOf(i.id) + 1 : "—",
      attuned: !!i.system.attuned,
      equipped: i.system.equipped ?? null,
      suppressed: i.areEffectsSuppressed,
      // Source-vs-prepared divergence: prepareFinalEquippableData clears
      // attunement on equipment lacking the Magical property, so an item can
      // read "attuned" in the database and be inert in play, showing up in
      // neither column of any UI that filters prepared data.
      dataIssue: (i._source.system?.attuned && !i.system.attuned) ? "attuned in source, cleared in prep (missing Magical property?)"
        : (i._source.system?.attunement && !i.system.attunement) ? "attunement cleared in prep (missing Magical property?)"
        : ""
    }));

  if (!quiet) {
    console.log(`${MODULE} | ${actor.name} — ${value}/${max}${over ? "  ⚠ OVER CAP" : ""}`);
    console.table(rows);
  }
  return { actor: actor.name, value, max, over, slots, rows };
}

/**
 * The legacy methods' argument: any object passes through unchanged (the same reference, as
 * before); a string resolves exactly — id, uuid, then name (items-journal-16). A miss is null.
 */
function actorOf(ref) {
  if (ref && typeof ref === "object") return ref;
  if (typeof ref !== "string" || !ref) return null;
  return resolveRef(ref, "actor", { required: false });
}

/** Read-only state for one actor (already resolved by buildApi), depth ≤ 4. */
function inspect(actor) {
  const state = computeSlots(actor);
  const away = awayOf(actor);
  const dnd5e = actor.system?.attributes?.attunement?.value;
  const bonds = actor.items
    .filter(i => readFlag(i, MODULE, BOND))
    .map(i => ({ item: refOf(i), ...readFlag(i, MODULE, BOND) }));
  return toPlain({
    actor: refOf(actor),
    ...state,
    away,
    bonds,
    // items-journal-12: the warning counts dnd5e's value (+ away), the strip counts attuned items (+ away)
    counts: {
      dnd5e: Number.isFinite(dnd5e) ? dnd5e : null,
      away: away.length,
      strip: state.value,
      mismatch: Number.isFinite(dnd5e) ? (dnd5e + away.length) !== state.value : null,
    },
  });
}

function selftest(ctx) {
  const map = globalThis.CONFIG?.DND5E?.armorProficienciesMap;
  // Reading game.dnd5e.tooltips can throw (the world items-journal-39 b publishes through): report
  // the check as failed rather than let selftest() throw.
  let guarded, guardErr = null;
  try { guarded = tooltipGuarded(); } catch (err) { guarded = false; guardErr = err; }
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "item hooks and the sheet hook registered", ok: ctx.reg.ids().length >= 4, detail: ctx.reg.ids().length },
    { label: "armorProficienciesMap covers the attunement categories",
      ok: ["wondrous", "ring", "rod", "wand", "trinket"].every(k => map?.[k] != null) },
    { label: "dnd5e item-tooltip guard installed (null: no item tooltips)", ok: guarded !== false,
      detail: guardErr ? guardErr.message : guarded },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/**
 * Build the frozen API. Throws (at ready, in node too) when the manifest and the implementations
 * drift apart.
 * @param {{log: object, reg: object, uninstall: Function, api: object|null}} ctx
 */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    report: (target, opts) => report(target, opts),
    computeSlots: ref => {
      const actor = actorOf(ref);
      return actor ? computeSlots(actor) : null;
    },
    stash,
    releaseAway,
    away: ref => awayOf(actorOf(ref)),
    inspect: actor => inspect(actor),
    selftest: () => selftest(ctx),
  }, {
    members: {
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: patches().filter(p => p.moduleId === MODULE),
      published: publishedOf(NS),
    }),
  });
}
