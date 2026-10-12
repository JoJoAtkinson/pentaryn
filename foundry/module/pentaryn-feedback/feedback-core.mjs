/**
 * Pentaryn Feedback — PURE core: constants, the HOOKS table, and the rules.
 *
 * No Foundry global at runtime (only pure `foundry.utils.*` helpers are allowed), so every rule
 * here runs in node on plain fixtures. Glue files import from here; nothing here imports glue.
 *
 * What lives here: the three categories and their help keys, the caps (LIMITS), the text hygiene
 * (clip for every string; redact as well for every error, flavor, title, label and toast — the
 * player's report text and document/user names are clipped only), the ring buffer, the report schema
 * (buildReport → validateReport → normaliseReport), where a report is stored (reportPath), the
 * offline queue's trim rule, and the status transitions the GM API and the Python reader share.
 */

export const MODULE = "pentaryn-feedback";
export const SHORT = "feedback";
export const NS = "feedback";
export const VERSION = "0.1.2";                       // === module.json version (core.test pins it)
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
  queueMax: 5,         // reports waiting on the User flag; also the GM's filing burst per user
  submitGapMs: 5000,   // one report per user per 5 s: the reporter's client, and the GM's refill rate
  bytes: 262144,       // one report, serialised
  renderThrottleMs: 2000,
  persistMs: 1000,     // the rings are copied to sessionStorage at most this often
  dupErrorMs: 1000,
  readsInFlight: 6,    // report-file GETs a GM's list/inspect runs at once
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
/** Every list-shaped report key validateReport checks, in check order: the two rings, then LIST_SECTIONS. */
export const LIST_KEYS = Object.freeze(["actions", "errors", "chat", "windows", "modules"]);

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
 * the query string (`?a=b`) of any URL or path. Applied to every error message (ring, recorder's own,
 * sectionErrors), error location and stack line, chat flavor, window title, click label and toast.
 * Not to the player's report text or document/user names: those are clipped only.
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

/** The message of anything that was thrown, logged or rejected. Objects go through previewOf (cheap). */
export function messageOf(x) {
  if (x === null || x === undefined) return String(x);
  if (typeof x === "string") return x;
  if (typeof x?.message === "string") return x.message;
  if (typeof x === "object" || typeof x === "function") return previewOf(x);
  return String(x);
}

const STOP = Symbol("preview full");

/** `[Actor5e Caven]` for a class instance: its class name and, when it is a string, its name. */
function instanceLabel(v) {
  const cls = v.constructor?.name || "Object";
  const name = typeof v.name === "string" && v.name ? ` ${clip(v.name, 40)}` : "";
  return `[${cls}${name}]`;
}

/**
 * A JSON-like preview of at most `n` characters ("…" marks a cut) that never serialises a whole
 * object: plain objects and arrays are walked (depth ≤ 3, cycles → `{…}`) until the budget runs out,
 * and a class instance (a Foundry document, an Application) is only its label — never its toJSON().
 * The console wrap calls this for every argument of every console.error / console.warn.
 */
export function previewOf(x, n = LIMITS.message) {
  let out = "";
  const seen = new Set();
  const put = s => {
    out += s;
    if (out.length > n) throw STOP;
  };
  const walk = (v, depth) => {
    if (v === null || typeof v === "number" || typeof v === "boolean" || v === undefined) return put(String(v));
    if (typeof v === "string") return put(JSON.stringify(v.length > n ? v.slice(0, n) : v));
    if (typeof v === "bigint") return put(`${v}n`);
    if (typeof v === "symbol") return put(`[${String(v)}]`);
    if (typeof v === "function") return put(`[Function ${v.name || "anonymous"}]`);
    if (typeof v.message === "string" && v instanceof Error) return put(JSON.stringify(v.message));
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) return put(instanceLabel(v));
    if (seen.has(v) || depth > 3) return put(Array.isArray(v) ? "[…]" : "{…}");
    seen.add(v);
    if (Array.isArray(v)) {
      put("[");
      for (let i = 0; i < v.length; i++) {
        if (i) put(",");
        walk(v[i], depth + 1);
      }
      return put("]");
    }
    put("{");
    let first = true;
    for (const k of Object.keys(v)) {
      if (!first) put(",");
      first = false;
      put(`${JSON.stringify(k)}:`);
      walk(v[k], depth + 1);
    }
    return put("}");
  };
  try {
    walk(x, 0);
    return out;
  } catch (err) {
    if (err === STOP) return `${out.slice(0, Math.max(0, n - 1))}…`;
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

/**
 * Re-opening the dialog over a draft: only the fields the caller gave change. A missing category
 * keeps the current one; a missing or blank text keeps what the player already typed.
 */
export function mergeDraft(current, next = {}) {
  const out = draftFrom(current);
  if (next?.category !== undefined && next?.category !== null) out.category = categoryOf(next.category).key;
  const text = String(next?.text ?? "").trim();
  if (text) out.text = clip(text, LIMITS.text);
  return out;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

/**
 * A chat line's plain text. Foundry 14's chat input is a ProseMirror editor, so the `chatMessage`
 * hook gets `<p>…</p>` HTML; core's ChatLog.parse reads the text content the same way (`<br>` →
 * newline). Paragraphs become lines; tags drop; the common entities decode. A line that does not
 * start with a tag is plain text (a macro's or an older client's `/bug a <b>`) and passes through.
 */
export function chatText(message) {
  const s = String(message ?? "");
  if (!/^\s*</.test(s)) return s;
  return s
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/p>\s*<p\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (all, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return ENTITIES[name.toLowerCase()] ?? all;
    });
}

/**
 * `/bug`, `/bug <text>` → `{ text }`; anything else → null. Case-insensitive, `/bugs` is not it.
 * Takes plain text or the chat input's HTML (see chatText).
 */
export function parseBugCommand(message) {
  const m = /^\s*\/bug(?:\s+([\s\S]*))?$/i.exec(chatText(message));
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

/* ── surviving a reload (sessionStorage) ──────────────────────────────────── */

/** The sessionStorage key holding one world + user's rings in this browser tab. */
export function ringsKey(worldId, userId) {
  return `${MODULE}:rings:${worldId ?? "?"}:${userId ?? "?"}`;
}

/** What is stored: `{ v: 1, actions, errors }` as JSON. */
export function ringsToStore({ actions = [], errors = [] } = {}) {
  return JSON.stringify({ v: 1, actions, errors });
}

const entryOk = e => !!e && typeof e === "object" && !Array.isArray(e) && Number.isFinite(e.t) && typeof e.kind !== "object";

/**
 * Parse what a previous page stored. Junk → null. Otherwise the rings (plain entries with a numeric
 * `t` only, capped) with `{ t: now, kind: "reload" }` appended to the actions, so the timeline shows
 * where the page was reloaded.
 */
export function ringsFromStore(raw, { now, actionsMax = LIMITS.actionsMax, errorsMax = LIMITS.errorsMax } = {}) {
  if (typeof raw !== "string" || !raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!data || data.v !== 1) return null;
  const actions = (Array.isArray(data.actions) ? data.actions : []).filter(entryOk);
  const errors = (Array.isArray(data.errors) ? data.errors : []).filter(entryOk);
  actions.push({ t: now, kind: "reload" });
  return { actions: actions.slice(-actionsMax), errors: errors.slice(-errorsMax) };
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
 * The keys an update touched, never their values. `_id` and `_stats` are skipped; `system` and
 * `flags` are listed one level down (`system.<key>`, `flags.<scope>`), so another package's flag
 * noise shows only its scope. At most LIMITS.keys.
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

/** userFields() from a User document itself (or null → the empty user). Reads only its argument. */
export function userFieldsOf(u) {
  return userFields({
    id: u?.id, name: u?.name, role: u?.role, isGM: u?.isGM,
    character: u?.character ? { id: u.character.id, name: u.character.name } : null,
  });
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
      if (failed(v)) sectionErrors[k] = redact(v.error, LIMITS.message);
      else if (v !== undefined && v !== null) sectionErrors[k] = `not a list (${typeof v})`;
    }
  }
  for (const k of OBJECT_SECTIONS) {
    const v = snap[k];
    if (failed(v)) {
      out[k] = null;
      sectionErrors[k] = redact(v.error, LIMITS.message);
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

/** True for a report id: a string of exactly 16 letters or digits. */
export const isReportId = id => typeof id === "string" && ID.test(id);

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
  if (!isReportId(report.id)) return { ok: false, reason: "id must be 16 letters or digits" };
  // finite but past ±8.64e15 ms is no Date: normaliseReport's toISOString would throw (rob-1/EC-1)
  if (!Number.isFinite(report.t) || Number.isNaN(new Date(report.t).getTime())) return { ok: false, reason: "t must be a timestamp" };
  if (!CATEGORY_KEYS.includes(report.category)) return { ok: false, reason: `category must be one of ${CATEGORY_KEYS.join(", ")}` };
  if (typeof report.text !== "string" || !report.text.trim()) return { ok: false, reason: "text is empty" };
  if (report.text.length > LIMITS.text) return { ok: false, reason: `text is over ${LIMITS.text} characters` };
  for (const k of LIST_KEYS) {
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

/**
 * The GM's per-user filing budget, a token bucket: `burst` reports at once (a queue filed when a GM
 * comes online), then one per `refillMs`. Pure: returns the next bucket and, when refused, how long
 * to wait. A script that skips the reporter's own gap can still not fill the disk or the toasts.
 */
export function admit(bucket, now, { burst = LIMITS.queueMax, refillMs = LIMITS.submitGapMs } = {}) {
  const b = bucket && Number.isFinite(bucket.tokens) && Number.isFinite(bucket.t) ? bucket : { tokens: burst, t: now };
  const tokens = Math.min(burst, b.tokens + Math.max(0, now - b.t) / refillMs);
  if (tokens >= 1) return { ok: true, bucket: { tokens: tokens - 1, t: now }, wait: 0 };
  return { ok: false, bucket: { tokens, t: now }, wait: Math.ceil((1 - tokens) * refillMs) };
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
