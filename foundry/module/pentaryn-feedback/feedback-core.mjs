/**
 * Pentaryn Feedback — PURE core: constants, the HOOKS table, and the rules.
 *
 * No Foundry global at runtime (only pure `foundry.utils.*` helpers are allowed), so every rule
 * here runs in node on plain fixtures. Glue files import from here; nothing here imports glue.
 *
 * What lives here: the three categories and their help keys, the caps (LIMITS), the text hygiene
 * every recorded string goes through (clip, redact), the ring buffer, the report schema
 * (buildReport → validateReport → normaliseReport), where a report is stored (reportPath), the
 * offline queue's trim rule, and the status transitions the GM API and the Python reader share.
 */

export const MODULE = "pentaryn-feedback";
export const SHORT = "feedback";
export const NS = "feedback";
export const VERSION = "0.1.0";                       // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-feedback/api@1";   // bump the major on a published-shape change
export const I18N = "PENTARYN_FEEDBACK";
export const CSS = "pfb-";
export const FLAG_SCOPE = MODULE;

/** The report file format. scripts/feedback_reports.py reads this too: bump both together. */
export const SCHEMA_VERSION = 1;
/** Reports live at `Data/<STORE_DIR>/<worldId>/<id>.json` on the server's disk. */
export const STORE_DIR = "pentaryn-feedback";
/** The User flag holding reports not yet filed: `flags.pentaryn-feedback.queue.<id> = report`. */
export const QUEUE_KEY = "queue";
/** The dialog's application id (the click recorder skips its own window). */
export const DIALOG_ID = "pentaryn-feedback-report";

/**
 * Application classes that are Foundry's own UI (or this module's dialog), not a window the player
 * opened: the recorder skips their render/close and the snapshot leaves them off the window list.
 */
export const QUIET_APPS = Object.freeze(new Set(["ChatLog", "SceneControls", "Hotbar", "Players", "Notifications",
  "ReportDialog", "SceneNavigation", "MainMenu", "Pause", "Sidebar", "CombatTracker"]));
/** Sidebar directories re-render on every document change; opening one is the recorder's `tab` entry. */
export const QUIET_APP_PATTERN = /Directory$/;

/** Events this module emits. New names are `pentaryn-<short>.<camelEvent>`; pre-hooks are vetoable. */
export const HOOKS = Object.freeze({
  filed: Object.freeze({ name: "pentaryn-feedback.filed", pre: false, args: "(report)" }),
  queued: Object.freeze({ name: "pentaryn-feedback.queued", pre: false, args: "(report)" }),
});

export const LIMITS = Object.freeze({
  text: 4000,          // the report text
  field: 120,          // any recorded string field
  message: 300,        // an error message
  stackLines: 4,       // stack lines kept per error
  stackLine: 200,      // characters per stack line
  clickText: 40,       // a clicked button's label
  flavor: 80,          // a chat card's flavor
  title: 60,           // a window title
  ua: 120,             // the browser's user agent
  keys: 8,             // changed keys kept per document update
  actionsMin: 20,      // historySize is clamped to [actionsMin, actionsMax]
  actionsMax: 1000,
  errorsMax: 50,
  chatMax: 10,
  windowsMax: 20,
  tokensMax: 10,
  queueMax: 5,         // reports waiting on the User flag
  bytes: 262144,       // one report, serialised
  renderThrottleMs: 2000,
  dupErrorMs: 1000,
});

/**
 * The three categories, in screen order (the default first). Label and help are literal i18n keys
 * so the i18n gate proves each one exists.
 */
export const CATEGORIES = Object.freeze([
  Object.freeze({ key: "bug", icon: "fa-solid fa-bug",
    label: "PENTARYN_FEEDBACK.Category.bug.Label", help: "PENTARYN_FEEDBACK.Category.bug.Help" }),
  Object.freeze({ key: "defect", icon: "fa-solid fa-triangle-exclamation",
    label: "PENTARYN_FEEDBACK.Category.defect.Label", help: "PENTARYN_FEEDBACK.Category.defect.Help" }),
  Object.freeze({ key: "feature", icon: "fa-solid fa-lightbulb",
    label: "PENTARYN_FEEDBACK.Category.feature.Label", help: "PENTARYN_FEEDBACK.Category.feature.Help" }),
]);
export const CATEGORY_KEYS = Object.freeze(CATEGORIES.map(c => c.key));
export const DEFAULT_CATEGORY = "bug";

/** Report status, in workflow order. */
export const STATUSES = Object.freeze(["open", "triaged", "resolved", "wontfix"]);

/** Top-level report keys, in file order. Anything else is dropped by normaliseReport. */
export const REPORT_KEYS = Object.freeze([
  "schemaVersion", "id", "t", "iso", "receivedAt", "category", "text", "status", "history",
  "user", "world", "scene", "tokens", "combat", "windows", "modules", "client", "chat",
  "errors", "actions", "truncated", "sectionErrors", "module",
]);

/** Snapshot sections, by shape. A section that failed arrives as `{ error }` (snapshot-adapter). */
export const LIST_SECTIONS = Object.freeze(["windows", "modules", "chat"]);
export const OBJECT_SECTIONS = Object.freeze(["user", "world", "scene", "tokens", "combat", "client"]);

/* ── text hygiene ─────────────────────────────────────────────────────────── */

/** Any value → a string of at most `n` characters ("…" marks a cut). null/undefined → "". */
export function clip(value, n = LIMITS.field) {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;
}

// a secret-named key with any value; a token-ish key only when its value looks like a credential
const SECRET = /\b(secret|password|passwd|authorization)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)/gi;
const TOKENISH = /\b(token|key|session|cookie|sid)(\s*[=:]\s*)("[^"]*"|'[^']*'|[A-Za-z0-9._~+/=-]{12,})/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/g;
const QUERY = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#]+|\/[^\s?#]*)\?(?=[^\s#)]*=)([^\s#)]*)/gi;
const LINE_COL = /(?::\d+){1,2}$/;   // a stack frame's :line:col after the query is kept

/**
 * Clip, then strip what looks like a credential: `password=…` / `secret: …` (any value), `token=…`
 * / `key=…` / `session=…` when the value is credential-shaped (12+ characters), a Bearer token, and
 * the query string (`?a=b`) of any URL or path. Applied to every free-text field the recorder and snapshot keep.
 */
export function redact(value, n = LIMITS.field) {
  let s = clip(value, n);
  if (!s) return s;
  s = s.replace(BEARER, "Bearer [redacted]");
  s = s.replace(QUERY, (m, base, query) => `${base}?[redacted]${LINE_COL.exec(query)?.[0] ?? ""}`);
  s = s.replace(SECRET, (m, k, sep) => `${k}${sep}[redacted]`);
  s = s.replace(TOKENISH, (m, k, sep) => `${k}${sep}[redacted]`);
  return s;
}

/** First `LIMITS.stackLines` lines of a stack, each trimmed, redacted and clipped. "" when none. */
export function stackHead(stack) {
  if (typeof stack !== "string" || !stack) return "";
  return stack.split("\n").map(l => l.trim()).filter(Boolean).slice(0, LIMITS.stackLines)
    .map(l => redact(l, LIMITS.stackLine)).join("\n");
}

/** The message of anything that was thrown, logged or rejected. */
export function messageOf(x) {
  if (x === null || x === undefined) return String(x);
  if (typeof x === "string") return x;
  if (typeof x?.message === "string") return x.message;
  try {
    return typeof x === "object" ? JSON.stringify(x) : String(x);
  } catch (err) {
    return Object.prototype.toString.call(x);
  }
}

/* ── categories and the draft ─────────────────────────────────────────────── */

/** The category row for a key; an unknown key → the default (bug). */
export function categoryOf(key) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES.find(c => c.key === DEFAULT_CATEGORY);
}

/** What the dialog submits: an unknown category becomes bug; the text is trimmed and capped. */
export function draftFrom({ category, text } = {}) {
  return { category: categoryOf(category).key, text: clip(String(text ?? "").trim(), LIMITS.text) };
}

/** `/bug`, `/bug <text>` → `{ text }`; anything else → null. Case-insensitive, `/bugs` is not it. */
export function parseBugCommand(message) {
  const m = /^\s*\/bug(?:\s+([\s\S]*))?$/i.exec(String(message ?? ""));
  return m ? { text: (m[1] ?? "").trim() } : null;
}

/* ── the rings ────────────────────────────────────────────────────────────── */

/** historySize → the ring cap actually used, clamped to [actionsMin, actionsMax]; junk → 200. */
export function historyMax(n) {
  const v = Number.isFinite(Number(n)) && n !== null && n !== "" ? Math.round(Number(n)) : 200;
  return Math.min(LIMITS.actionsMax, Math.max(LIMITS.actionsMin, v));
}

/** Push, then drop from the front so at most `max` remain (newest last). Mutates and returns `ring`. */
export function ringPush(ring, entry, max) {
  ring.push(entry);
  if (ring.length > max) ring.splice(0, ring.length - max);
  return ring;
}

/** True when `entry` repeats an error already in the ring within `LIMITS.dupErrorMs` (same message). */
export function isDupError(ring, entry) {
  for (let i = ring.length - 1; i >= 0; i--) {
    const e = ring[i];
    if (entry.t - e.t > LIMITS.dupErrorMs) return false;
    if (e.message === entry.message) return true;
  }
  return false;
}

/** An error-ring entry: `{ t, source, message, stack?, location? }`, every string redacted and capped. */
export function errorEntry({ t, source, message, stack, location }) {
  const out = { t, source, message: redact(message, LIMITS.message) };
  const head = stackHead(stack);
  if (head) out.stack = head;
  if (location) out.location = redact(location, LIMITS.field);
  return out;
}

/**
 * The keys an update touched, never their values: top-level keys, and `system.*` one level down.
 * At most LIMITS.keys; `_id` and flag-only noise from other packages are kept as `flags.<scope>`.
 */
export function changedKeys(changes) {
  if (!changes || typeof changes !== "object") return [];
  const out = [];
  for (const [k, v] of Object.entries(changes)) {
    if (k === "_id" || k === "_stats") continue;
    if ((k === "system" || k === "flags") && v && typeof v === "object" && !Array.isArray(v)) {
      for (const sub of Object.keys(v)) out.push(`${k}.${sub}`);
    } else out.push(k);
  }
  return out.slice(0, LIMITS.keys);
}

/** A chat message (plain fields) → `{ t, id, flavor, total, whisper }`; content is never kept. */
export function chatEntry({ id, timestamp, flavor, rolls, whisper } = {}) {
  const roll = Array.isArray(rolls) ? rolls[0] : null;
  const total = Number.isFinite(roll?.total) ? roll.total : null;
  return {
    t: Number.isFinite(timestamp) ? timestamp : null,
    id: clip(id, 32),
    flavor: redact(String(flavor ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), LIMITS.flavor),
    total,
    whisper: Array.isArray(whisper) ? whisper.length > 0 : !!whisper,
  };
}

/* ── the report ───────────────────────────────────────────────────────────── */

/** Who filed it, from a User document's plain fields. */
export function userFields({ id, name, role, isGM, character } = {}) {
  return {
    id: clip(id, 32), name: clip(name), role: Number.isFinite(role) ? role : 0, isGM: !!isGM,
    character: character?.id ? { id: clip(character.id, 32), name: clip(character.name) } : null,
  };
}

/** A snapshot section that failed: `{ error: "…" }` and nothing else. */
const failed = v => !!v && typeof v === "object" && !Array.isArray(v) && typeof v.error === "string"
  && Object.keys(v).length === 1;

/**
 * The snapshot's sections in the shapes validateReport accepts: a list section is always a list
 * (`[]` when it failed or is not a list) and an object section is an object or null. Each failure
 * is kept as `sectionErrors[section] = message`, so a broken capture never blocks the report.
 */
export function sectionsOf(snapshot) {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const out = {};
  const sectionErrors = {};
  for (const k of LIST_SECTIONS) {
    const v = snap[k];
    if (Array.isArray(v)) out[k] = v;
    else {
      out[k] = [];
      if (failed(v)) sectionErrors[k] = clip(v.error, LIMITS.message);
      else if (v !== undefined && v !== null) sectionErrors[k] = `not a list (${typeof v})`;
    }
  }
  for (const k of OBJECT_SECTIONS) {
    const v = snap[k];
    if (failed(v)) {
      out[k] = null;
      sectionErrors[k] = clip(v.error, LIMITS.message);
    } else out[k] = v && typeof v === "object" && !Array.isArray(v) ? v : null;
  }
  return { ...out, sectionErrors };
}

/**
 * The report a client builds at submit. `snapshot` is snapshot-adapter's output; `actions` and
 * `errors` are the recorder's rings (newest last). Nothing here reads a global.
 */
export function buildReport({ id, t, draft, snapshot = {}, actions = [], errors = [], moduleVersion = VERSION }) {
  const d = draftFrom(draft);
  const s = sectionsOf(snapshot);
  return {
    schemaVersion: SCHEMA_VERSION,
    id, t, iso: new Date(t).toISOString(),
    receivedAt: null,
    category: d.category,
    text: d.text,
    status: "open",
    history: [],
    user: s.user,
    world: s.world,
    scene: s.scene,
    tokens: s.tokens,
    combat: s.combat,
    windows: s.windows,
    modules: s.modules,
    client: s.client,
    chat: s.chat,
    errors: (Array.isArray(errors) ? errors : []).slice(-LIMITS.errorsMax),
    actions: (Array.isArray(actions) ? actions : []).slice(-LIMITS.actionsMax),
    truncated: 0,
    sectionErrors: s.sectionErrors,
    module: { id: MODULE, version: moduleVersion },
  };
}

const ID = /^[A-Za-z0-9]{16}$/;

/** Serialised size in bytes (UTF-8), or Infinity when it cannot be serialised. */
export function byteSize(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch (err) {
    return Infinity;
  }
}

/**
 * Make a report fit under `max` serialised bytes by dropping the oldest actions first, then the
 * oldest errors. Returns `{ report, dropped, bytes }`; `report.truncated` counts every entry dropped.
 * `bytes > max` only when the report is still too big with both rings empty (validateReport says so).
 */
export function fitReport(report, max = LIMITS.bytes) {
  let bytes = byteSize(report);
  if (bytes <= max) return { report, dropped: 0, bytes };
  const actions = Array.isArray(report.actions) ? report.actions : [];
  const errors = Array.isArray(report.errors) ? report.errors : [];
  const slack = 32;                               // the digits of `truncated`, and rounding
  let size = bytes;
  let a = 0;
  let e = 0;
  while (size + slack > max && a < actions.length) size -= byteSize(actions[a++]) + 1;
  while (size + slack > max && e < errors.length) size -= byteSize(errors[e++]) + 1;
  const dropped = a + e;
  const out = {
    ...report, actions: actions.slice(a), errors: errors.slice(e),
    truncated: (Number.isInteger(report.truncated) ? report.truncated : 0) + dropped,
  };
  bytes = byteSize(out);
  return { report: out, dropped, bytes };
}

/** Shape check before anything is written: `{ ok: true }` or `{ ok: false, reason }`. */
export function validateReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return { ok: false, reason: "not an object" };
  if (report.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: `schemaVersion ${report.schemaVersion} is not ${SCHEMA_VERSION}` };
  if (typeof report.id !== "string" || !ID.test(report.id)) return { ok: false, reason: "id must be 16 letters or digits" };
  if (!Number.isFinite(report.t)) return { ok: false, reason: "t must be a timestamp" };
  if (!CATEGORY_KEYS.includes(report.category)) return { ok: false, reason: `category must be one of ${CATEGORY_KEYS.join(", ")}` };
  if (typeof report.text !== "string" || !report.text.trim()) return { ok: false, reason: "text is empty" };
  if (report.text.length > LIMITS.text) return { ok: false, reason: `text is over ${LIMITS.text} characters` };
  for (const k of ["actions", "errors", "chat", "windows", "modules"]) {
    if (report[k] !== undefined && !Array.isArray(report[k])) return { ok: false, reason: `${k} must be a list` };
  }
  const bytes = byteSize(report);
  if (bytes > LIMITS.bytes) return { ok: false, reason: `report is ${bytes} bytes; the cap is ${LIMITS.bytes}` };
  return { ok: true };
}

/** Re-clip every string in a recorded entry (the GM side never trusts the client's caps). */
function cleanEntry(entry, cap = LIMITS.field) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const out = {};
  for (const [k, v] of Object.entries(entry).slice(0, 16)) {
    if (typeof v === "string") out[k] = k === "stack" ? v.split("\n").slice(0, LIMITS.stackLines).map(l => clip(l, LIMITS.stackLine)).join("\n") : clip(v, k === "message" ? LIMITS.message : cap);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, LIMITS.keys).map(x => (typeof x === "string" ? clip(x) : x)).filter(x => typeof x !== "object");
    else if (typeof v === "object") out[k] = cleanEntry(v, cap);
  }
  return out;
}

/** `{ section: message }` for known section names only, each message re-capped. */
function sectionErrorsOf(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const k of [...OBJECT_SECTIONS, ...LIST_SECTIONS]) {
    if (typeof v[k] === "string") out[k] = clip(v[k], LIMITS.message);
  }
  return out;
}

const listOf = (v, max, cap) => (Array.isArray(v) ? v.slice(-max).map(e => cleanEntry(e, cap)).filter(Boolean) : []);

/**
 * The GM-side copy that is written to disk. `user` comes from the User document whose queue held
 * the report (the server only lets that user — or a GM — write it), never from the payload;
 * status and history start fresh; unknown top-level keys are dropped; every string is re-capped.
 */
export function normaliseReport(report, { user, receivedAt }) {
  const r = report ?? {};
  const out = {
    schemaVersion: SCHEMA_VERSION,
    id: r.id,
    t: r.t,
    iso: new Date(r.t).toISOString(),
    receivedAt: Number.isFinite(receivedAt) ? receivedAt : null,
    category: categoryOf(r.category).key,
    text: clip(String(r.text ?? ""), LIMITS.text),
    status: "open",
    history: [],
    user: userFields(user),
    world: cleanEntry(r.world) ?? null,
    scene: cleanEntry(r.scene) ?? null,
    tokens: r.tokens && typeof r.tokens === "object"
      ? { controlled: listOf(r.tokens.controlled, LIMITS.tokensMax), targeted: listOf(r.tokens.targeted, LIMITS.tokensMax) }
      : null,
    combat: cleanEntry(r.combat) ?? null,
    windows: listOf(r.windows, LIMITS.windowsMax),
    modules: Array.isArray(r.modules) ? r.modules.slice(0, 400).map(e => cleanEntry(e)).filter(Boolean) : [],
    client: cleanEntry(r.client, LIMITS.ua) ?? null,
    chat: listOf(r.chat, LIMITS.chatMax),
    errors: listOf(r.errors, LIMITS.errorsMax),
    actions: listOf(r.actions, LIMITS.actionsMax),
    truncated: Number.isInteger(r.truncated) && r.truncated > 0 ? r.truncated : 0,
    sectionErrors: sectionErrorsOf(r.sectionErrors),
    module: cleanEntry(r.module) ?? { id: MODULE, version: VERSION },
  };
  return out;
}

/** `<STORE_DIR>/<worldId>/<id>.json`, relative to the Data folder. Throws on an unsafe segment. */
export function reportPath(worldId, id) {
  const safe = s => typeof s === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s);
  if (!safe(worldId)) throw new Error(`BAD_ARGS: world id ${JSON.stringify(worldId)}`);
  if (!safe(id)) throw new Error(`BAD_ARGS: report id ${JSON.stringify(id)}`);
  return `${STORE_DIR}/${worldId}/${id}.json`;
}

/** The folder a world's reports live in. */
export function worldDir(worldId) {
  return reportPath(worldId, "x").replace(/\/x\.json$/, "");
}

/**
 * The offline queue (`{ [id]: report }`) after adding: the ids to drop so at most `max` remain,
 * oldest `t` first. Pure: the caller deletes them in the same update that adds the new one.
 */
export function queueTrim(queue, max = LIMITS.queueMax) {
  const entries = Object.entries(queue ?? {}).sort(([, a], [, b]) => (a?.t ?? 0) - (b?.t ?? 0));
  return entries.slice(0, Math.max(0, entries.length - max)).map(([id]) => id);
}

/* ── status ───────────────────────────────────────────────────────────────── */

/**
 * May a report move from `cur` to `req`? Forward moves: open → triaged; anything → resolved or
 * wontfix; the same status again (a note). Back to `open`, or resolved → triaged, needs `force`.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function nextStatus(cur, req, { force = false } = {}) {
  if (!STATUSES.includes(req)) return { ok: false, reason: `status must be one of ${STATUSES.join(", ")}` };
  if (!STATUSES.includes(cur)) return { ok: false, reason: `current status ${JSON.stringify(cur)} is unknown` };
  if (force || req === cur || req === "resolved" || req === "wontfix") return { ok: true };
  if (cur === "open" && req === "triaged") return { ok: true };
  return { ok: false, reason: `${cur} → ${req} needs force` };
}

/**
 * Apply a status change: a new report with `status` set and `{ t, status, note, by }` appended to
 * `history` — unless the last entry already says the same status and note (idempotent retry).
 */
export function applyStatus(report, { status, note = "", by, t, force = false }) {
  const step = nextStatus(report?.status, status, { force });
  if (!step.ok) return step;
  const history = Array.isArray(report.history) ? report.history.slice() : [];
  const last = history.at(-1);
  const text = clip(String(note ?? "").trim(), LIMITS.text);
  if (!(last && last.status === status && (last.note ?? "") === text)) {
    history.push({ t, status, note: text, by: clip(by) });
  }
  return { ok: true, report: { ...report, status, history } };
}

/** One row of a listing: `{ id, t, category, status, user, world, text60 }`. */
export function summaryOf(report) {
  return {
    id: report?.id ?? null,
    t: report?.t ?? null,
    category: report?.category ?? null,
    status: report?.status ?? null,
    user: report?.user?.name ?? null,
    world: report?.world?.id ?? null,
    text60: clip(String(report?.text ?? "").replace(/\s+/g, " ").trim(), 60),
  };
}
