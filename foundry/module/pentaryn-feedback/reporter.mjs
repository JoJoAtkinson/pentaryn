/**
 * Pentaryn Feedback — FEATURE: the reporter. The bug button, `/bug`, building a report, and filing
 * it on the GM's disk.
 *
 * Delivery is one path for online and offline alike:
 *   1. the reporter's client builds the report (draft + snapshot + the recorder's rings) and adds it
 *      to its OWN User document: `flags.pentaryn-feedback.queue.<id>` (a player may write their own
 *      User; the server lets no one else but a GM write it — so the queue's owner IS the reporter);
 *   2. it asks the active GM to file it (`queryGM("pentaryn-feedback.ingest", { userId, ids })`, a
 *      relay row) and tells the player "saved" or "queued";
 *   3. the active GM reads that user's queue, writes each report to
 *      `Data/pentaryn-feedback/<world>/<id>.json` (look first, so a resend never overwrites a status
 *      Joe already set) and deletes the filed keys from the flag in one update.
 * With no GM online the report waits on the flag; the active GM files every user's queue at ready,
 * when a user connects, and when a queue flag changes. Two GM tabs both file: the write is
 * keyed by the report id the reporter minted, and byte-identical (no per-tab receivedAt), so the
 * second is harmless; a tab that finds the entry already gone from the queue answers "done".
 */

import {
  FLAG_SCOPE, LIMITS, MODULE, QUEUE_KEY, admit, buildReport, categoryOf, draftFrom, fitReport,
  normaliseReport, parseBugCommand, queueTrim, reportPath, userFields, validateReport,
} from "./feedback-core.mjs";
import { ReportDialog } from "./dialog.mjs";
import { attachSummary, snapshot } from "./snapshot-adapter.mjs";
import { store } from "./files-adapter.mjs";
import { isActiveGM } from "./lib/election.mjs";
import { fail, ok, toFail } from "./lib/errors.mjs";
import { readFlag } from "./lib/flags.mjs";
import { queryGM } from "./lib/queries.mjs";

const QUERY = `${MODULE}.ingest`;
const queuePath = id => `flags.${FLAG_SCOPE}.${QUEUE_KEY}.${id}`;

/** userId → the tail of that user's ingest chain (one ingest per user at a time, per tab). */
const chains = new Map();
/** userId → that user's filing bucket on this GM tab (core `admit`). */
const buckets = new Map();
/** userId → the timer that retries a queue held back by the bucket. */
const retries = new Map();
/** userId → when this client last queued a report as that user (the reporter's own gap). */
const lastSubmit = new Map();

/** The reports waiting on a user's flag: `{ [id]: report }`. */
export function queueOf(user) {
  const q = readFlag(user, FLAG_SCOPE, QUEUE_KEY);
  return q && typeof q === "object" ? q : {};
}

export function install(reg, ctx) {
  const g = globalThis;
  const log = ctx.log;

  /* ── doors ─────────────────────────────────────────────────────────── */

  /**
   * Open the dialog, optionally pre-filled. Only the fields given are passed on, so re-opening an
   * open dialog (a second click, `/bug` with no text) keeps what the player typed and picked.
   */
  async function open({ category, text } = {}) {
    const snap = snapshot();
    const summary = attachSummary(snap, {
      actions: ctx.exposed.actions?.().length ?? 0, errors: ctx.exposed.errors?.().length ?? 0,
    });
    const draft = {};
    if (category !== undefined && category !== null) draft.category = category;
    if (typeof text === "string" && text.trim()) draft.text = text;
    await ReportDialog.open({ draft, summary, onSubmit: d => submit(d) });
    return ok({ open: true });
  }

  reg.on("getSceneControlButtons", controls => {
    const tools = controls?.tokens?.tools;
    if (!tools) return;
    tools.feedback = {
      name: "feedback",
      order: 90,
      title: "PENTARYN_FEEDBACK.Control.Title",
      icon: "fa-solid fa-bug",
      button: true,
      onChange: () => void open().catch(err => log.error("open the report dialog", err)),
    };
  }, { guard: false, label: "getSceneControlButtons: bug button" });

  // Hooks.call: a literal false stops the line being posted to chat
  reg.on("chatMessage", (chatLog, message) => {
    const cmd = parseBugCommand(message);
    if (!cmd) return undefined;
    void open({ text: cmd.text }).catch(err => log.error("open the report dialog", err));
    return false;
  }, { label: "chatMessage: /bug" });

  /* ── the reporter's side ───────────────────────────────────────────── */

  /**
   * File a report from `{ category, text }`. Resolves `ok({ id, status: "filed" | "queued" })` or a
   * `fail()`; never throws. Shows the player one toast either way.
   */
  async function submit(draft = {}, { dryRun = false } = {}) {
    const refuse = (code, reason) => {
      log.notify("error", _loc("PENTARYN_FEEDBACK.Notify.Failed", { reason }));
      return fail(code, reason);
    };
    const d = draftFrom(draft);
    if (!d.text) return refuse("BAD_ARGS", "the report text is empty");
    const user = g.game.user;
    let report;
    try {
      // a big history is trimmed oldest-first to fit LIMITS.bytes, never refused outright
      ({ report } = fitReport(buildReport({
        id: g.foundry.utils.randomID(16), t: Date.now(), draft: d, snapshot: snapshot(),
        actions: ctx.exposed.actions?.() ?? [], errors: ctx.exposed.errors?.() ?? [],
      })));
    } catch (err) {
      log.error("build the report", err);
      return refuse("INTERNAL", err?.message ?? String(err));
    }
    const v = validateReport(report);
    if (!v.ok) return refuse("BAD_ARGS", v.reason);
    if (dryRun) return ok({ dryRun: true, id: report.id, report });
    const since = Date.now() - (lastSubmit.get(user.id) ?? -Infinity);
    if (since < LIMITS.submitGapMs) {
      return refuse("REFUSED", `wait ${Math.ceil((LIMITS.submitGapMs - since) / 1000)} s between reports`);
    }
    // reserve the gap now so a double-click cannot slip a second report past it while this one is
    // writing; give it back if the write fails, so a failed submit does not hold the player off
    const prevSubmit = lastSubmit.get(user.id);
    const reserved = Date.now();
    lastSubmit.set(user.id, reserved);

    // 1. queue on my own User document (adds the report, drops the oldest past the cap)
    const queue = { ...queueOf(user), [report.id]: report };
    const dropped = queueTrim(queue, LIMITS.queueMax);
    const update = { [queuePath(report.id)]: report };
    for (const id of dropped) update[queuePath(id)] = _del;
    try {
      await user.update(update);
    } catch (err) {
      if (lastSubmit.get(user.id) === reserved) {
        if (prevSubmit === undefined) lastSubmit.delete(user.id);
        else lastSubmit.set(user.id, prevSubmit);
      }
      log.error("queue the report", err);
      log.notify("error", _loc("PENTARYN_FEEDBACK.Notify.Failed", { reason: err?.message ?? String(err) }));
      return toFail(err);
    }
    if (dropped.length) log.notify("warn", _loc("PENTARYN_FEEDBACK.Notify.Dropped", { n: dropped.length }));
    ctx.emit("queued", report);

    // 2. ask the active GM to file it now
    let filed = false;
    try {
      const r = await queryGM(QUERY, { userId: user.id, ids: [report.id] }, { timeout: 10000 });
      filed = r?.ok === true && (r.done ?? []).includes(report.id);
    } catch (err) {
      log.debug("ingest query", err?.message ?? err);
    }
    const id6 = report.id.slice(0, 6);
    if (filed) {
      log.notify("info", _loc("PENTARYN_FEEDBACK.Notify.Saved", { id: id6 }));
      return ok({ id: report.id, status: "filed" });
    }
    log.notify("info", _loc("PENTARYN_FEEDBACK.Notify.Queued", { id: id6 }));
    return ok({ id: report.id, status: "queued" });
  }

  /* ── the active GM's side ──────────────────────────────────────────── */

  /** File every report on `user`'s queue. Serialised per user in this tab. */
  function ingestUser(user) {
    const prev = chains.get(user.id) ?? Promise.resolve();
    const run = prev.then(() => ingestNow(user), () => ingestNow(user));
    chains.set(user.id, run);
    const clear = () => {
      if (chains.get(user.id) === run) chains.delete(user.id);
    };
    run.then(clear, clear);
    return run;
  }

  async function ingestNow(user) {
    const queue = queueOf(user);
    const filed = [];
    const refused = [];
    const held = [];
    const del = {};
    const who = userFields({ ...plainUser(user), character: user.character ? { id: user.character.id, name: user.character.name } : null });
    for (const [id, report] of Object.entries(queue)) {
      const v = validateReport(report);
      if (!v.ok || report.id !== id) {
        // a malformed entry would block the queue forever: drop it, say why
        refused.push({ id, reason: v.ok ? "id does not match its key" : v.reason });
        del[queuePath(id)] = _del;
        log.warn(`refused report ${id} from ${user.name}: ${v.reason ?? "id mismatch"}`);
        continue;
      }
      // receivedAt stays null: two GM tabs (the bridge and a browser) both file, and must write the
      // same bytes; the file's mtime is when it was filed. The folder is always THIS world's — the
      // payload's world id is the client's claim, kept only as data.
      const safe = normaliseReport(report, { user: who });
      safe.world = { ...(safe.world ?? {}), id: g.game.world.id };
      let path;
      try {
        path = reportPath(g.game.world.id, safe.id);
        // look first: a resend after a timeout must not reset a status already set
        if (!(await store().exists(path))) {
          const a = admit(buckets.get(user.id), Date.now());
          buckets.set(user.id, a.bucket);
          if (!a.ok) {
            held.push(id);              // stays queued; filed when the bucket refills
            continue;
          }
          await store().put(path, safe);
        }
      } catch (err) {
        refused.push({ id, reason: err?.message ?? String(err) });
        log.error(`file report ${id}`, err);
        continue;                       // stays queued; the next ingest retries it
      }
      filed.push(id);
      del[queuePath(id)] = _del;
      log.info("filed", { uuid: user.uuid, ids: [id], by: g.game.user.id, path });
      if (!user.isSelf) {               // the reporter gets its own "saved" toast
        log.notify("info", _loc("PENTARYN_FEEDBACK.Notify.Filed", {
          user: user.name, category: _loc(categoryOf(safe.category).label), id: id.slice(0, 6),
        }));
      }
      ctx.emit("filed", safe);
    }
    if (Object.keys(del).length) await user.update(del);   // one write for the whole queue
    if (held.length) {
      log.warn(`holding ${held.length} report(s) from ${user.name}: over ${LIMITS.queueMax} in a row`);
      retryLater(user, admit(buckets.get(user.id), Date.now()).wait);
    }
    return { filed, refused };
  }

  /** Run the user's ingest again once the bucket has a token (one timer per user). */
  function retryLater(user, wait) {
    if (retries.has(user.id) || typeof g.setTimeout !== "function") return;
    const timer = g.setTimeout(() => {
      retries.delete(user.id);
      if (isActiveGM()) void ingestUser(user).catch(err => log.error("ingest", err));
    }, Math.max(wait, 50));
    timer?.unref?.();
    retries.set(user.id, timer);
  }

  /**
   * The relay handler (api `ingest`): the active GM files `userId`'s queue. `ids` are the reports
   * the sender is waiting for; `done` lists those filed — by this run, by another run that got
   * there first (on disk), or by the other GM tab (gone from the queue, and not refused here).
   *
   * No sender check: the kit's registerQueries does not pass core's `{ user }` context through to
   * the API method, and none is needed — the queue is the User document's own flag, which the
   * server lets only that user or a GM write, and the filed `user` comes from that document. A
   * stranger's request can only make the GM file what that user already queued (which updateUser
   * does anyway).
   */
  async function ingest({ userId, ids = [] } = {}) {
    if (!isActiveGM()) return fail("NOT_GM", "only the active GM files reports");
    const user = g.game.users.get(userId);
    if (!user) return fail("NOT_FOUND", `user ${userId}`);
    try {
      const { filed, refused } = await ingestUser(user);
      const done = [];
      const asked = (Array.isArray(ids) ? ids : []).filter(id => typeof id === "string" && /^[A-Za-z0-9]{16}$/.test(id));
      const waiting = queueOf(user);
      const refusedIds = new Set(refused.map(r => r.id));
      for (const id of asked.slice(0, LIMITS.queueMax)) {
        const gone = !(id in waiting) && !refusedIds.has(id);
        if (filed.includes(id) || gone || await store().exists(reportPath(g.game.world.id, id))) done.push(id);
      }
      return ok({ filed, refused, done });
    } catch (err) {
      log.error("ingest", err);
      return toFail(err);
    }
  }

  /** Active GM: file every user's waiting queue (ready, and when someone connects). */
  function ingestAll() {
    if (!isActiveGM()) return;
    for (const user of g.game.users) {
      if (Object.keys(queueOf(user)).length) void ingestUser(user).catch(err => log.error("ingest", err));
    }
  }

  reg.on("userConnected", (user, connected) => {
    if (!connected || !isActiveGM()) return;
    if (user?.isSelf) return;
    ingestAll();
  }, { label: "userConnected: file waiting reports" });

  reg.on("updateUser", (user, changes) => {
    if (!isActiveGM()) return;
    const q = changes?.flags?.[FLAG_SCOPE]?.[QUEUE_KEY];
    if (!q || !Object.values(q).some(v => v && typeof v === "object" && v.id)) return;   // deletions only
    void ingestUser(user).catch(err => log.error("ingest", err));
  }, { label: "updateUser: file a new report" });

  const ready = () => ingestAll();
  if (g.game?.ready) ready();
  else reg.once("ready", ready, { label: "ready: file waiting reports" });

  ctx.expose({ open, submit, ingest, pending: user => Object.keys(queueOf(user)) });
}

function plainUser(u) {
  return { id: u?.id, name: u?.name, role: u?.role, isGM: u?.isGM };
}

export function uninstall() {
  chains.clear();
  for (const timer of retries.values()) globalThis.clearTimeout?.(timer);
  retries.clear();
  buckets.clear();
  lastSubmit.clear();
}
