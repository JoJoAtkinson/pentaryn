/**
 * Pure telemetry for pentaryn-movement 0.8.0 (plan context/plans/pathfinding-2026-11.md §16.7; Fable's review §5
 * "Telemetry in play"). No Foundry globals.
 *
 * Each client keeps a ring buffer of what its drag help did: plans (with their planning time), guard firings, yields,
 * fallbacks to core's move, frame stalls while it moved tokens, lost reservation races, stops, cuts, notices and errors
 * (the reason codes the players no longer see: they get two notices only). The buffer is reported to the GM after a
 * session, and the "that move was wrong" hotkey files its last ten seconds through pentaryn-feedback.
 *
 * The circuit breaker reads the same events: past BREAKER.errors exceptions, or BREAKER.fallbacks fallbacks that are
 * failures (not the expected core paths: one token, ghost, too many), in one session, the drag help switches itself off.
 */

export const TELEMETRY = Object.freeze({
  keep: 400,            // events kept per client
  windowMs: 10000,      // the hotkey's "last ten seconds"
  stallMs: 150,         // a frame this long while this client moves tokens is a stall
  textMax: 3600,        // the filed report's text, under pentaryn-feedback's 4000
});

export const BREAKER = Object.freeze({
  errors: 3,            // exceptions inside a move in one session
  fallbacks: 6,         // failed plans (budget, throw, no plan) in one session
});

/** Event kinds and what they count as. */
export const KINDS = Object.freeze(["plan", "fire", "yield", "fallback", "stall", "lostRace", "stop", "cut", "notice", "error", "queue", "breaker", "wave"]);

/** Fallback reasons that are failures (the breaker counts them); the rest are core's move by design. */
export const FAILED = Object.freeze(new Set(["budget", "throw", "noPlan", "noAnchor", "error", "deliver"]));

/** A ring buffer of `keep` events. */
export function ring(keep = TELEMETRY.keep) {
  return { keep, events: [], seq: 0, counts: Object.fromEntries(KINDS.map(k => [k, 0])), failures: { errors: 0, fallbacks: 0 } };
}

/**
 * Record one event (`kind` one of KINDS; `data` plain, small). `t` ms (the caller's clock). Returns the event.
 * Counts and the breaker's tallies move with it.
 */
export function push(r, kind, data = {}, t = 0) {
  const ev = { ...data, n: ++r.seq, t, kind };
  r.events.push(ev);
  if (r.events.length > r.keep) r.events.splice(0, r.events.length - r.keep);
  r.counts[kind] = (r.counts[kind] ?? 0) + 1;
  if (kind === "error") r.failures.errors += 1;
  if (kind === "fallback" && FAILED.has(data?.reason)) r.failures.fallbacks += 1;
  return ev;
}

/** The events of the last `ms` before `now`. */
export function since(r, now, ms = TELEMETRY.windowMs) {
  return r.events.filter(e => now - e.t <= ms);
}

/** Should the breaker trip now? `{ trip, why }`. */
export function breakerTrips(r, limits = BREAKER) {
  if (r.failures.errors >= limits.errors) return { trip: true, why: `${r.failures.errors} errors` };
  if (r.failures.fallbacks >= limits.fallbacks) return { trip: true, why: `${r.failures.fallbacks} failed plans` };
  return { trip: false, why: null };
}

/**
 * A summary for the GM: counts per kind, plan time (count, median, p95, max ms), fallbacks and notices by reason,
 * firings per plan. Plain data.
 */
export function summarize(r) {
  const plans = r.events.filter(e => e.kind === "plan" && Number.isFinite(e.ms)).map(e => e.ms).sort((a, b) => a - b);
  const q = p => (plans.length ? plans[Math.min(plans.length - 1, Math.floor(p * plans.length))] : null);
  const by = kind => {
    const out = {};
    for (const e of r.events) if (e.kind === kind) out[e.reason ?? "?"] = (out[e.reason ?? "?"] ?? 0) + 1;
    return out;
  };
  return {
    counts: { ...r.counts },
    plan: { n: plans.length, medianMs: q(0.5), p95Ms: q(0.95), maxMs: plans.at(-1) ?? null },
    fallbacks: by("fallback"),
    notices: by("notice"),
    firesPerPlan: r.counts.plan ? Math.round((r.counts.fire / r.counts.plan) * 100) / 100 : null,
    failures: { ...r.failures },
  };
}

/** One event as one short line (the filed report's text). */
export function lineOf(e, now) {
  const { n: _n, t, kind, ...rest } = e;
  const bits = Object.entries(rest).filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
  return `-${((now - t) / 1000).toFixed(1)}s ${kind}${bits.length ? ` ${bits.join(" ")}` : ""}`;
}

/** The text a "that move was wrong" report files: `head`, then the window's events, newest last, clipped to `max`. */
export function reportText(head, events, now, max = TELEMETRY.textMax) {
  const lines = events.map(e => lineOf(e, now));
  let body = lines.join("\n");
  while (body.length > max - head.length - 2 && lines.length > 1) { lines.shift(); body = lines.join("\n"); }
  return `${head}\n${body || "(nothing recorded)"}`.slice(0, max);
}
