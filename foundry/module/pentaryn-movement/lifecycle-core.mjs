/**
 * Pure move lifecycle for pentaryn-movement 0.8.0 (plan context/plans/pathfinding-2026-11.md §16.4). No Foundry globals.
 *
 * One explicit state machine per move (a drop: one token or a group), with ONE deadline. Before 0.8 a move's waits
 * ran on eleven separate clocks (queue 8 s, single-drag delay 3 s, guard re-route 3 s and rest 8 s, first-square gate
 * 4 s, foreign wait 8 s, re-cut 250 / 600 ms, ...) and no test bounded them composed: queue + guard + gate could pass
 * 10 s. Now every wait asks the move's run how long it has left (`left`), and a move whose deadline passes rests where
 * it is (`expired` → "rested", told "Stopped short, way blocked").
 *
 *   planning ──► queued ──► planning (a re-plan)          queued / planning ──► walking
 *   walking  ──► yielding ──► walking                     any live state     ──► rested | stopped | fallback | cancelled
 *
 * The clocks that remain are not waits on the way to rest and are listed in the plan (§16.4): the click arming delay
 * (MOTION.armMs), the plan's own budget (inside the deadline), the publish echo (RESERVE.echoMs, inside it), the
 * reload overdue cut (RESERVE.overdueMs) and the stop's drawn-position housekeeping (stop.mjs RESYNC / WATCH).
 */

export const LIFE = Object.freeze({
  deadlineMs: 10000,    // a move is at rest, one way or another, this long after its drop (acceptance C3 / C9)
  rerouteMs: 3000,      // the runtime guard re-routes a held member once, this long after its first yield
});

export const STATES = Object.freeze(["planning", "queued", "walking", "yielding", "rested", "stopped", "fallback", "cancelled"]);

/** The end states: nothing moves on from them. */
export const ENDS = Object.freeze(new Set(["rested", "stopped", "fallback", "cancelled"]));

const NEXT = Object.freeze({
  planning: new Set(["queued", "walking", "rested", "stopped", "fallback", "cancelled"]),
  queued: new Set(["planning", "walking", "rested", "stopped", "fallback", "cancelled"]),
  walking: new Set(["yielding", "walking", "rested", "stopped", "fallback", "cancelled"]),
  yielding: new Set(["walking", "yielding", "rested", "stopped", "fallback", "cancelled"]),
});

/**
 * A new run: in `planning`, its deadline `deadlineMs` after `now`.
 * @param {{ id?: string, now?: number, deadlineMs?: number, members?: string[] }} [o]
 */
export function newRun({ id = null, now = 0, deadlineMs = LIFE.deadlineMs, members = [] } = {}) {
  return { id, state: "planning", t0: now, deadline: now + deadlineMs, members: [...members], history: [{ state: "planning", at: now, why: null }] };
}

/** May `run` go to `to` now? */
export function canStep(run, to) {
  if (!run || !STATES.includes(to)) return false;
  return NEXT[run.state]?.has(to) ?? false;
}

/**
 * Move `run` on to `to` (`why`: a reason code, kept for telemetry). Returns true when it moved; an illegal step (from
 * an end state, or an unknown state) changes nothing and returns false: a late timer of a move already at rest is a
 * no-op, never a second walk.
 */
export function step(run, to, { now = 0, why = null } = {}) {
  if (!canStep(run, to)) return false;
  run.state = to;
  run.history.push({ state: to, at: now, why });
  if (run.history.length > 32) run.history.splice(1, run.history.length - 32);
  return true;
}

/** ms the run has left (0 once its deadline passed, or when it is over). */
export function left(run, now = 0) {
  if (!run || ENDS.has(run.state)) return 0;
  return Math.max(run.deadline - now, 0);
}

/** A wait of `ms`, as much of it as the run has left. */
export const capped = (run, now, ms) => Math.max(Math.min(ms, left(run, now)), 0);

/** Has the run's deadline passed while it is still live? */
export function expired(run, now = 0) {
  return !!run && !ENDS.has(run.state) && now >= run.deadline;
}

/** Is the run over (an end state)? */
export const over = run => !run || ENDS.has(run.state);

/**
 * The longest a move can be kept from rest by the waits that remain, composed (ms after its drop): every one is capped
 * by the run's deadline, so this is the deadline itself whatever the inputs. Kept as a function so the test that
 * bounds the composed clocks reads the same rule the glue applies.
 * @param {{ planMs?: number, queueMs?: number, delayMs?: number, yieldMs?: number }} waits
 */
export function composedBound({ planMs = 0, queueMs = 0, delayMs = 0, yieldMs = 0 } = {}, deadlineMs = LIFE.deadlineMs) {
  let t = 0;
  for (const w of [planMs, queueMs, delayMs, yieldMs]) t = Math.min(t + Math.max(w, 0), deadlineMs);
  return t;
}
