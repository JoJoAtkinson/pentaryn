/**
 * Pentaryn Combat — the API (game.pentaryn.combat): implementations for the manifest rows the
 * features do not contribute, inspect(), selftest(), and buildApiFor(ctx).
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. Feature state reaches
 * this file through `ctx.exposed` (the runner exposes `running`); the runner, the riders and the
 * weapon-set seed contribute their own rows' implementations from install().
 */

import * as core from "./combat-core.mjs";
import { HOOKS, MODULE, NS } from "./combat-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, setting, setQuickMode, quickMode, setRiderMode, riderMode } from "./settings.mjs";
import {
  chosenWeapon, combatContext, countFor, featuresOf, followUpsFor, isReckless, multiattackFor, multiattackOf,
  newTurn, planFor, riderDiceFor, turnOf, weaponsOf,
} from "./shapes.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";
import { settingsSnapshot } from "./lib/settings.mjs";

/**
 * What native dnd5e 6 rule effects would replace the weaponBonuses fallback. Report-only until the
 * build's live check proves a `damage:bonus` change with a condition on attack mode / Heavy works
 * in 6.0.6 (plan §7.4); `{apply: true}` is refused until then.
 */
function fixFeats(actor, { apply = false } = {}) {
  const feats = featuresOf(actor);
  const plan = [];
  if (feats.has("two-weapon-fighting")) plan.push({ feature: "two-weapon-fighting", change: "damage bonus @mod", when: "attack mode offhand" });
  if (feats.has("great-weapon-master")) plan.push({ feature: "great-weapon-master", change: "damage bonus @prof", when: "Heavy weapon, Attack action, own turn" });
  return { actor: actor?.name, plan, applied: false, reason: apply ? "unverified: native rule conditions not yet proved in 6.0.6 — weaponBonuses fallback is active" : "report only", fallback: setting("weaponBonuses") };
}

/** api.plan: the Full Attack plan, setting multiattack read here (shapes takes it as a value). */
export function plan(actor, weaponId = null) {
  return planFor(actor, weaponId, { multiattackOn: setting("multiattack") });
}

/** transform's U-4-1 check (transform-creatures-13 step 3): Full Attack runs this form's Multiattack. */
function coversMultiattack(actor) {
  if (!setting("fullAttack") || !setting("multiattack")) return null;
  const ma = multiattackOf(actor);
  if (!ma || ma.source === "flag" || (ma.total ?? 0) < 2 || !actor.items?.get?.(ma.source)) return null;
  return ma.source;
}

/**
 * @param {Actor} actor  resolved by buildApi (the row's first param is `ref`)
 * @param {{ as?: * }} opts  a user ref: a viewer without OBSERVER on the actor gets the identity only
 */
function inspect(actor, ctx, { as } = {}) {
  const viewer = as === undefined || as === null ? null : resolveRef(as, "user");
  const sees = !viewer || viewer.isGM === true || actor.testUserPermission?.(viewer, "OBSERVER") === true;
  const cc = combatContext(actor);
  const head = { actor: refOf(actor), key: cc.key, inCombat: cc.inCombat, isOwnTurn: cc.isOwnTurn };
  if (!sees) return toPlain(head);
  const turn = turnOf(actor);
  const stored = actor.getFlag?.(MODULE, "turn") ?? null;
  const ma = multiattackFor(actor, { enabled: setting("multiattack") });
  const weaponId = ma ? null : chosenWeapon(actor);
  const count = ma ? ma.total : countFor(actor, weaponId);
  const pipCount = ma ? ma.total : Math.max(count, countFor(actor, null));
  const reaction = actor.getFlag?.(MODULE, "reaction") ?? null;
  const r = ctx.exposed.running?.() ?? null;
  const mine = !!r && (r.actor === actor || r.actor?.uuid === actor.uuid);
  return toPlain({
    ...head,
    turn,
    stored,
    stale: !!stored && stored.key !== cc.key,
    plan: plan(actor),
    pips: pipCount >= 2 ? core.pipState({ count: pipCount, turn, inCombat: cc.inCombat }) : null,
    spentPips: core.spentPips(turn),
    reaction: { flag: reaction, spent: core.reactionSpent(reaction, cc.combat?.id) },
    followUps: followUpsFor(actor, { bonusFree: !turn.bonusUsed }),
    riders: core.ridersFor(featuresOf(actor)).map(x => ({ key: x.key, dice: riderDiceFor(actor, x), state: turn.riders?.[x.key] ?? null, mode: riderMode(x.key) })),
    reckless: isReckless(actor),
    running: mine ? { status: r.state?.status ?? null, rolled: r.state?.rolled ?? 0, swings: r.state?.swings?.length ?? 0 } : null,
    settings: settingsSnapshot(MODULE, SETTINGS),
  });
}

function selftest(ctx) {
  const own = patches().filter(p => p.moduleId === MODULE);
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "settings readable", ok: typeof setting("fullAttack") === "boolean" },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
    { label: "every patch names its adjustments row", ok: own.every(p => !!p.adjustments), detail: own.length },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/**
 * The legacy members that take an actor (S11, declared D-c2, combat-riders-12): an Actor, Token,
 * UUID, 16-character id or exact name is resolved (never a substring, never canvas.scene by
 * default); a miss, a bad ref or nothing at all answers null (a Promise of null for an async
 * member) instead of throwing a TypeError. The row stays `legacy: true`. The set is read from the
 * manifest (every legacy row whose first param is the self-resolving ACTOR), so a new row cannot miss it.
 */
const ACTOR_ROWS = new Set(MANIFEST.rows
  .filter(r => r.legacy && r.params?.[0]?.type === "Actor|Token|uuid|id|exact name" && r.params[0].resolve === false)
  .map(r => r.path));

function legacyActor(fn) {
  const async = fn.constructor?.name === "AsyncFunction";
  const wrapped = (ref, ...rest) => {
    let actor = null;
    try {
      actor = resolveRef(ref, "actor", { required: false });
    } catch {
      actor = null;   // BAD_ARGS (not a reference) or AMBIGUOUS: a miss for a legacy member
    }
    if (!actor) return async ? Promise.resolve(null) : null;
    return fn(actor, ...rest);
  };
  Object.defineProperty(wrapped, "name", { value: fn.name || "legacyActor" });
  return wrapped;
}

const refRows = impl => Object.fromEntries(Object.entries(impl ?? {}).map(([k, fn]) => [k, ACTOR_ROWS.has(k) ? legacyActor(fn) : fn]));

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    ...refRows({
      count: function count(actor, weaponId) { return countFor(actor, weaponId); },
      plan,
      turn: turnOf,
      newTurn,
      multiattack: multiattackOf,
      weapons: weaponsOf,
      fixFeats,
    }),
    quick: quickMode,
    setQuick: setQuickMode,
    riderMode,
    setRiderMode,
    inspect: (actor, opts = {}) => inspect(actor, ctx, opts),
    selftest: () => selftest(ctx),
    coversMultiattack,
    core,
  }, {
    contributions: ctx.contributions.map(c => ({ ...c, impl: refRows(c.impl) })),
    members: {
      settings: () => settingsSnapshot(MODULE, SETTINGS),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: patches().filter(p => p.moduleId === MODULE),
      published: publishedOf(NS),
    }),
  });
}
