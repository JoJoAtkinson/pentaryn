/**
 * Pentaryn Combat (pentaryn-combat) — ENTRY #1 = esmodules[0]. Wiring only.
 *
 * Melee on the Argon HUD with fewer clicks and nothing taken away:
 *   Full Attack     one button runs every swing the Attack action gives (Extra Attack, Nick, an
 *                   NPC's or a Wild Shape form's Multiattack), each through dnd5e's own dialog.
 *   Swing pips      the Action pips count swings (2 → 1 → 0), also for weapons clicked by hand.
 *   Follow-ups      Off-hand / Nick / Flurry of Blows / Martial Arts / Hew as one click each, only
 *                   when the actor qualifies right now.
 *   Riders          "+ Sneak Attack 3d6" (and Frenzy, Colossus Slayer, Divine Strike) offered on
 *                   the attack card once per turn; auto mode per player.
 *   Corrections     off-hand mode reset and pip, TWF/GWM damage, empty weapon sets seeded.
 *
 * Load order (the hooks golden pins it):
 *   combat.mjs  evaluates → roll-dock installs; once(init) settings; once(setup) counting,
 *               turn-riders, offhand; once(ready) publish (one tick later) and the weapon-set seed
 *   hud.mjs     evaluates → the turn-flow features, then the HUD features (its own header)
 *
 * Files: combat-core.mjs (pure) · settings.mjs · context.mjs (shared wiring) · shapes.mjs, argon.mjs
 * (adapters) · strip.mjs (ui) · features: roll-dock, counting, turn-riders, offhand, sequence ·
 * hud.mjs and its hud/, turnflow/ features · lib/ (vendored kit).
 *
 * Design: context/plans/melee-streamlining.md · Use: README.md · Exposes game.pentaryn.combat.
 */

import * as core from "./combat-core.mjs";
import { installFeature, log, reg } from "./context.mjs";
import { registerSettings, setting, setQuickMode, quickMode, setRiderMode, riderMode } from "./settings.mjs";
import { renderHud } from "./argon.mjs";
import { weaponsOf, featuresOf, countFor, multiattackOf, combatContext, turnOf, newTurn, chosenWeapon } from "./shapes.mjs";
import { runSwings, runFollowUp, fullAttackPlan, running, abortFor } from "./sequence.mjs";
import { report as riderReport, rollRider, offersFor, isReckless, setReckless } from "./turn-riders.mjs";
import { seedAll, seedWeaponSets } from "./offhand.mjs";
import { MODULE } from "./combat-core.mjs";
import * as rollDock from "./roll-dock.mjs";
import * as counting from "./counting.mjs";
import * as turnRiders from "./turn-riders.mjs";
import * as offhand from "./offhand.mjs";
import * as sequence from "./sequence.mjs";

/** Installed while this file evaluates: the roll-window hooks keep their place ahead of everyone. */
const AT_LOAD = [rollDock];
/** Installed at setup, in registration order. */
const AT_SETUP = [counting, turnRiders, offhand, sequence];

/* ── fixFeats: the native path, once proved ──────────────────────────────── */

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

/* ── API ─────────────────────────────────────────────────────────────────── */

const api = {
  // what the HUD shows
  count: (actor, weaponId) => countFor(actor, weaponId),
  plan: (actor, weaponId = null) => {
    const ctx = combatContext(actor);
    weaponId ??= chosenWeapon(actor);
    const ma = (actor.type === "npc" || actor.isPolymorphed) && setting("multiattack") ? multiattackOf(actor) : null;
    const pick = ma ? { "*": actor.getFlag(MODULE, "last")?.weapon ?? null } : null;
    return fullAttackPlan(actor, { weaponId, turn: turnOf(actor), inCombat: ctx.inCombat, multiattack: ma, count: ma ? ma.total : countFor(actor, weaponId), pick });
  },
  turn: turnOf,
  newTurn,
  multiattack: multiattackOf,
  weapons: weaponsOf,
  offers: offersFor,
  // what a click does
  fullAttack: async (actor, weaponId, opts = {}) => {
    const p = api.plan(actor, weaponId);
    return runSwings(actor, p.swings, opts);
  },
  followUp: runFollowUp,
  rollRider,
  reckless: isReckless, setReckless,
  running,
  abort: abortFor,
  // per-user choices
  quick: quickMode, setQuick: setQuickMode, riderMode, setRiderMode,
  // GM
  report: riderReport,
  fixFeats,
  seedWeaponSets, seedAll,
  core
};

function publish() {
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, combat: api };
  else { game.pentaryn ??= {}; game.pentaryn.combat = api; }
}

const opts = label => ({ guard: false, label });

for (const feature of AT_LOAD) installFeature(feature);

reg.once("init", () => {
  registerSettings({ onChange: renderHud });
}, opts("init: settings"));

reg.once("setup", () => {
  for (const feature of AT_SETUP) installFeature(feature);
}, opts("setup: features"));

// pentaryn-importer replaces game.pentaryn with a frozen object in its own ready hook; defer a tick.
reg.once("ready", () => setTimeout(() => {
  publish();
  if (game.users?.activeGM?.isSelf) seedAll().catch(err => log.warn("weapon-set seed failed", err));
}, 0), opts("ready: publish"));
