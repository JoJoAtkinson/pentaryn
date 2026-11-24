/**
 * Pentaryn Movement — the feature: telemetry, the circuit breaker and the "that move was wrong" hotkey (0.8.0; plan
 * context/plans/pathfinding-2026-11.md §16.7, Fable's review §4 Robustness and §5 Telemetry).
 *
 * GLUE, one feature, installed last (every other feature calls `ctx.exposed.tele(kind, data)` at run time only):
 *   ring buffer  per client (telemetry-core): plans and their time, guard firings, yields, fallbacks, frame stalls while
 *                this client moves tokens, lost reservation races, stops, cuts, notices (reason codes) and errors.
 *   report       reportTelemetry() whispers this client's summary to the GMs (after a session, or when asked).
 *   hotkey       "That move was wrong" (Alt+W by default) files the last ten seconds through pentaryn-feedback.
 *   breaker      past BREAKER.errors exceptions or BREAKER.fallbacks failed plans in one session, the drag help
 *                switches itself off on this client (settings tripAssist), the GM's client also turns `assist` off
 *                for the table, and the GM is told (a notice on a GM's client, a whisper from a player's).
 */

import { MODULE } from "./movement-core.mjs";
import { TELEMETRY, breakerTrips, push, reportText, ring, since, summarize } from "./telemetry-core.mjs";
import { assistTripped, onKey, tripAssist } from "./settings.mjs";
import { movementFacts } from "./group-adapter.mjs";

let feature = null;
let log = null;
let buf = ring();
let stallHandle = null;
let lastFiled = null;
/**
 * The failures already counted when the breaker last tripped (0.8.2): the GM turning `assist` back on clears the
 * trip, and the breaker counts afresh from there. Without it the session's tallies were still past the limits, so the
 * very next fallback or error tripped it again.
 */
let tripBase = { errors: 0, fallbacks: 0 };

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const esc = s => (globalThis.foundry?.utils?.escapeHTML?.(String(s)) ?? String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`));

/** Record one event; the breaker looks at every error and fallback. Never throws. */
function tele(kind, data = {}) {
  try {
    push(buf, kind, data, clock());
    if (kind === "error" || kind === "fallback") checkBreaker();
  } catch (err) { log?.debug?.("telemetry", err); }
}

/* -------------------------------------------- */
/*  The circuit breaker                         */
/* -------------------------------------------- */

function checkBreaker() {
  if (assistTripped() || globalThis.CONFIG?.debug?.[`${MODULE}.breaker`] === false) return;
  const failures = { errors: buf.failures.errors - tripBase.errors, fallbacks: buf.failures.fallbacks - tripBase.fallbacks };
  const { trip, why } = breakerTrips({ failures });
  if (!trip) return;
  tripBase = { ...buf.failures };
  tripAssist(why);
  push(buf, "breaker", { reason: why }, clock());
  log?.warn?.(`drag help switched itself off after repeated failures (${why}); plain Foundry dragging until a reload or the GM turns it back on`);
  const i18n = globalThis.game?.i18n;
  try {
    if (globalThis.game?.user?.isGM) {
      globalThis.ui?.notifications?.warn?.(i18n?.format?.("PENTARYN_MOVEMENT.breaker.gm", { why }) ?? why, { permanent: true });
      if ((globalThis.game.users?.activeGM?.id ?? globalThis.game.user.id) === globalThis.game.user.id) {
        Promise.resolve(globalThis.game.settings.set(MODULE, "assist", false)).catch(err => log?.debug?.("breaker: assist off", err));
      }
      return;
    }
    const gms = (globalThis.game?.users?.filter?.(u => u.isGM && u.active) ?? []).map(u => u.id);
    if (!gms.length) return;
    const text = i18n?.format?.("PENTARYN_MOVEMENT.breaker.player", { user: globalThis.game.user?.name ?? "", why }) ?? why;
    Promise.resolve(globalThis.ChatMessage?.create?.({ content: `<p>${esc(text)}</p>`, whisper: gms, speaker: { alias: "Pentaryn Movement" } }))
      .catch(err => log?.debug?.("breaker: tell the GM", err));
  } catch (err) { log?.debug?.("breaker: tell", err); }
}

/* -------------------------------------------- */
/*  Stalls                                      */
/* -------------------------------------------- */

/** Is a move this client started drawn walking now? Only asked on a long frame. */
function movingHere() {
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    try { if (t?.document?.movement?.user?.isSelf && movementFacts(t).animating) return true; } catch { return false; }
  }
  return false;
}

function listenStalls() {
  const t = globalThis.canvas?.app?.ticker;
  if (stallHandle?.t === t || typeof t?.add !== "function") return;
  unlistenStalls();
  const fn = () => {
    const ms = t.deltaMS ?? 0;
    if (ms < TELEMETRY.stallMs) return;
    try { if (movingHere()) tele("stall", { ms: Math.round(ms) }); } catch (err) { log?.debug?.("telemetry: stall", err); }
  };
  t.add(fn);
  stallHandle = { t, fn };
}

function unlistenStalls() {
  try { stallHandle?.t?.remove?.(stallHandle.fn); } catch (err) { log?.debug?.("telemetry: ticker", err); }
  stallHandle = null;
}

/* -------------------------------------------- */
/*  Reports                                     */
/* -------------------------------------------- */

/** This client's telemetry: the summary and the events of the last `seconds` (all kept when omitted). */
function telemetry({ seconds = null } = {}) {
  const now = clock();
  const events = Number.isFinite(seconds) ? since(buf, now, seconds * 1000) : buf.events;
  return { user: globalThis.game?.user?.id ?? null, summary: summarize(buf), tripped: assistTripped(),
    events: events.map(e => ({ ...e, ago: Math.round(now - e.t) })), filed: lastFiled ? { ...lastFiled } : null };
}

/** Whisper this client's summary to the GMs (or show it, on a GM's client). Resolves { ok, to }. */
async function reportTelemetry() {
  const s = summarize(buf);
  const user = globalThis.game?.user;
  const head = globalThis.game?.i18n?.format?.("PENTARYN_MOVEMENT.telemetry.report", { user: user?.name ?? "" }) ?? "Movement report";
  const rows = [
    ["plans", `${s.plan.n} (median ${s.plan.medianMs ?? "-"} ms, p95 ${s.plan.p95Ms ?? "-"} ms, max ${s.plan.maxMs ?? "-"} ms)`],
    ["guard fires", `${s.counts.fire} (${s.firesPerPlan ?? "-"} per plan)`],
    ["yields", s.counts.yield], ["fallbacks", JSON.stringify(s.fallbacks)], ["stalls", s.counts.stall],
    ["lost races", s.counts.lostRace], ["stops", s.counts.stop], ["cuts", s.counts.cut], ["notices", JSON.stringify(s.notices)],
    ["errors", s.counts.error], ["breaker", assistTripped()?.why ?? "-"],
  ];
  const content = `<p><strong>${esc(head)}</strong></p><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`;
  const gms = (globalThis.game?.users?.filter?.(u => u.isGM && u.active) ?? []).map(u => u.id);
  if (!gms.length) return { ok: false, code: "NO_GM", reason: "no GM is logged in" };
  await globalThis.ChatMessage?.create?.({ content, whisper: gms, speaker: { alias: "Pentaryn Movement" } });
  return { ok: true, to: gms.length, summary: s };
}

/**
 * The "that move was wrong" hotkey: the last ten seconds of this client's drag help, filed as a bug through
 * pentaryn-feedback (its submit: queued on this user, written by the GM). Resolves what feedback answered.
 */
async function fileWrongMove() {
  const now = clock();
  const fb = globalThis.game?.pentaryn?.feedback;
  const i18n = globalThis.game?.i18n;
  if (typeof fb?.submit !== "function") {
    globalThis.ui?.notifications?.warn?.("PENTARYN_MOVEMENT.telemetry.noFeedback", { localize: true });
    return { ok: false, code: "NO_FEEDBACK", reason: "pentaryn-feedback is not active" };
  }
  let status = null;
  try { status = feature?.exposed?.groupStatus?.()?.last ?? null; } catch (err) { log?.debug?.("telemetry: group status", err); }
  const head = `${i18n?.localize?.("PENTARYN_MOVEMENT.telemetry.text") ?? "That move was wrong."}\nlast drop: ${JSON.stringify(status ?? {}).slice(0, 400)}`;
  const text = reportText(head, since(buf, now), now);
  const r = await fb.submit({ category: "bug", text });
  lastFiled = { at: new Date().toISOString(), id: r?.id ?? null, ok: !!r?.ok };
  return r;
}

/** The hotkey's handler: true (consumed) once it has started filing. */
function onWrongMoveKey() {
  Promise.resolve().then(fileWrongMove).catch(err => log?.warnOnce?.("telemetry-file", "could not file that move (further errors suppressed)", err));
  return true;
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  onKey("wrongMove", onWrongMoveKey);
  reg.on("canvasReady", () => { listenStalls(); }, { label: "canvasReady: telemetry watches for frame stalls while this client moves tokens" });
  if (ctx.late) listenStalls();
  ctx.expose({ tele, telemetry, reportTelemetry, fileWrongMove });
}

export function uninstall() {
  unlistenStalls();
  onKey("wrongMove", null);
  buf = ring();
  tripBase = { errors: 0, fallbacks: 0 };
  lastFiled = null;
  feature = null;
}
