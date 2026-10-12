/**
 * Pentaryn Transform — ADAPTER: the active GM's sweep of spent Wild Shape forms, and its one timer.
 * sweep.mjs registers the hooks that schedule it; the API publishes sweepSpentForms().
 */

import { MODULE } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

// A player who reverts can't delete the form actor (dnd5e deletes it only "if possible"), so every
// Wild Shape left a "Talo (Dire Wolf)" behind in the player's sidebar. The active GM sweeps them:
// a transformed copy (flags.dnd5e.originalActor) with no token on any scene is spent.
// The age guard skips a form that was just created and hasn't been swapped onto its token yet;
// such a form is looked at again once it is old enough.
//
// Scheduling: one timer, never pushed back. (0.2.0 debounced on every token update, so steady token
// traffic — a player dragging a token, another module writing lights — kept postponing the sweep
// and a reverted form sat in the sidebar indefinitely.) A player's revert also shows up on the GM
// client as the form losing flags.dnd5e.isPolymorphed, which schedules a quick sweep directly.
const SWEEP_AGE_MS = 10_000;
export async function sweepSpentForms() {
  if (!game.users.activeGM?.isSelf) return;
  const forms = game.actors.filter(a => a.getFlag("dnd5e", "originalActor"));
  if (!forms.length) return;                          // nothing to sweep: skip the walk of every scene's tokens
  const placed = new Set();
  for (const s of game.scenes) for (const t of s.tokens) if (t.actorId) placed.add(t.actorId);
  const now = Date.now();
  const candidates = forms.filter(a => !placed.has(a.id));
  const spent = candidates.filter(a => now - (a._stats?.createdTime ?? 0) > SWEEP_AGE_MS);
  if (spent.length) await Actor.implementation.deleteDocuments(spent.map(a => a.id));
  const spentSet = new Set(spent);
  const young = candidates.filter(a => !spentSet.has(a));
  if (young.length) {
    const wait = Math.max(...young.map(a => SWEEP_AGE_MS - (now - (a._stats?.createdTime ?? now)))) + 500;
    scheduleSweep(wait);
  }
}
let sweepTimer = null;
let sweepAt = Infinity;
export function scheduleSweep(ms = 3000) {
  if (!game.users.activeGM?.isSelf) return;
  const at = Date.now() + ms;
  if (sweepTimer && sweepAt <= at) return;           // an earlier sweep is already coming
  clearTimeout(sweepTimer);
  sweepAt = at;
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    sweepAt = Infinity;
    sweepSpentForms().catch(err => log.warn("sweep failed", err));
  }, ms);
}

/** Drop a pending sweep (the API's uninstall). */
export function cancelSweep() {
  clearTimeout(sweepTimer);
  sweepTimer = null;
  sweepAt = Infinity;
}
