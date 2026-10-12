/**
 * Pentaryn Feedback — the API: implementations for the manifest rows, inspect(), selftest().
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. Feature state reaches
 * this file through `ctx.exposed`: the recorder's rings (`actions`, `errors`) and the reporter's
 * doors (`open`, `submit`, `ingest`, `pending`). The GM reads (`list`, `get`) and `resolve` work on
 * the report files through the shared file store.
 */

import { HOOKS, MODULE, NS, STATUSES, applyStatus, summaryOf, worldDir } from "./feedback-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { store } from "./files-adapter.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { codedError, fail, ok, toFail } from "./lib/errors.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

/**
 * inspect's ref. The kit's root `game.pentaryn.inspect(ref)` resolves the ref as an Actor and passes
 * that to every namespace, so an Actor (or a Token, or a placeable carrying one) means its players:
 * every non-GM user who OWNs it or has it as their assigned character (journal.inspect's rule, plus
 * ownership). Anything else resolves as a user ref (NOT_FOUND / AMBIGUOUS / BAD_ARGS thrown).
 * @returns {{ actor: object|null, users: object[] }}
 */
function inspected(ref) {
  const doc = ref?.documentName ? ref : ref?.document?.documentName ? ref.document : null;
  if (doc?.documentName !== "Actor" && doc?.documentName !== "Token") {
    return { actor: null, users: [resolveRef(ref, "user")] };
  }
  const actor = doc.documentName === "Token" ? doc.actor : doc;
  const ids = new Set([actor?.id, doc.actorId, actor?.token?.actorId].filter(Boolean));
  const users = (game.users?.contents ?? [...(game.users ?? [])]).filter(u => !u.isGM && (
    ids.has(u.character?.id) || actor?.testUserPermission?.(u, "OWNER") === true));
  return { actor: actor ?? doc, users };
}

/** Summaries of the reports these users filed, oldest first, the last 20; null when unreadable. */
async function reportsBy(userIds) {
  try {
    return (await readAll()).map(x => x.report)
      .filter(r => userIds.has(r?.user?.id))
      .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
      .slice(-20)
      .map(summaryOf);
  } catch {
    return null;
  }
}

/**
 * Read-only state for one user — or, for an Actor/Token ref, for that actor's players together.
 * @param {*} ref            a user ref, or an Actor/Token (what the root inspect passes)
 * @param {{ as?: * }} opts  `as`: a user ref — answer with what that user may see. Pending ids and
 *                        reports are the GM's or that user's own (reports need a GM client: the
 *                        report files are the GM's); the rings exist only on the calling client.
 */
async function inspect(ref, ctx, { as } = {}) {
  const { actor, users } = inspected(ref);
  const viewer = as === undefined || as === null ? null : resolveRef(as, "user");
  const sees = u => !viewer || viewer.isGM === true || viewer.id === u.id;
  const canRead = isGM() && (!viewer || viewer.isGM === true);
  const self = users.find(u => u.id === game.user?.id);
  const visible = users.filter(sees);
  const pending = visible.length || !users.length ? visible.flatMap(u => ctx.exposed.pending?.(u) ?? []) : null;
  const reports = canRead ? await reportsBy(new Set(users.map(u => u.id))) : null;
  return toPlain({
    ...(actor ? { actor, users } : { user: users[0] }),
    pending,
    reports,
    actions: self ? (ctx.exposed.actions?.() ?? []).slice(-20) : null,
    errors: self ? (ctx.exposed.errors?.() ?? []).slice(-10) : null,
  });
}

function selftest(ctx) {
  const tools = ui.controls?.controls?.tokens?.tools ?? {};
  const wrapped = patches().filter(p => p.moduleId === MODULE).map(p => p.adjustments);
  const consoleOn = ctx.setting("captureConsole") === true;
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "bug button in the token controls", ok: !!tools.feedback, detail: tools.feedback ? null : "open a scene (the toolbar is built at canvas ready)" },
    { label: "recorder installed", ok: typeof ctx.exposed.actions === "function", detail: ctx.exposed.actions?.().length ?? null },
    { label: "console wrap matches captureConsole", ok: wrapped.includes("feedback-console-error") === consoleOn, detail: consoleOn },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

const isGM = () => game.user?.isGM === true;

/** Every report file of this world, parsed (unreadable files skipped). */
async function readAll() {
  const out = [];
  for (const path of await store().list(worldDir(game.world.id))) {
    const r = await store().get(path);
    if (r && typeof r === "object") out.push({ path, report: r });
  }
  return out;
}

/** The one report whose id is `id` or starts with it. Throws NOT_FOUND / AMBIGUOUS / BAD_ARGS. */
async function find(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9]{1,16}$/.test(id)) throw codedError("BAD_ARGS", "id must be letters or digits");
  const paths = await store().list(worldDir(game.world.id));
  const hits = paths.filter(p => p.split("/").pop().startsWith(id));
  const exact = hits.filter(p => p.split("/").pop() === `${id}.json`);
  const pick = exact.length === 1 ? exact : hits;
  if (!pick.length) throw codedError("NOT_FOUND", `report ${id}`);
  if (pick.length > 1) throw codedError("AMBIGUOUS", `report ${id} matches ${pick.length}`);
  const report = await store().get(pick[0]);
  if (!report) throw codedError("NOT_FOUND", `report ${id}`);
  return { path: pick[0], report };
}

async function list({ status = "open", limit = 50 } = {}) {
  if (!isGM()) throw codedError("NOT_GM", "only a GM lists reports");
  if (status !== "all" && !STATUSES.includes(status)) throw codedError("BAD_ARGS", `status ${status}`);
  const rows = (await readAll()).map(x => x.report)
    .filter(r => status === "all" || r.status === status)
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  return { reports: rows.slice(0, n).map(summaryOf), count: rows.length };
}

async function get({ id } = {}) {
  if (!isGM()) throw codedError("NOT_GM", "only a GM reads reports");
  return (await find(id)).report;
}

async function resolve(ctx, { id, status, note = "", force = false, dryRun = false } = {}) {
  if (!isGM()) return fail("NOT_GM", "only a GM changes a report's status");
  let found;
  try {
    found = await find(id);
  } catch (err) {
    return toFail(err);
  }
  const step = applyStatus(found.report, { status, note, by: `gm:${game.user.name}`, t: Date.now(), force });
  if (!step.ok) return fail("REFUSED", step.reason);
  const out = { id: found.report.id, status, history: step.report.history };
  if (dryRun) return ok({ dryRun: true, ...out });
  try {
    await store().put(found.path, step.report);
  } catch (err) {
    ctx.log.error("resolve write failed", err);
    return toFail(err);
  }
  ctx.log.info("resolve", { ids: [found.report.id], status, by: game.user.id });
  return ok(out);
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const door = name => (...args) => {
    const fn = ctx.exposed[name];
    if (typeof fn !== "function") return fail("NOT_READY", `${name} is not installed`);
    return fn(...args);
  };
  return buildApi(MANIFEST, {
    inspect: (ref, opts = {}) => inspect(ref, ctx, opts),
    selftest: () => selftest(ctx),
    open: door("open"),
    submit: door("submit"),
    ingest: door("ingest"),
    list: (opts = {}) => list(opts),
    get: (opts = {}) => get(opts),
    resolve: (opts = {}) => resolve(ctx, opts),
  }, {
    contributions: ctx.contributions,
    members: {
      settings: () => settingsSnapshot(),
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
