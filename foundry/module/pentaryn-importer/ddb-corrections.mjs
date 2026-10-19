/**
 * pentaryn-importer — FEATURE: DDB corrections. Re-applies the table's fixes to a D&D Beyond
 * character every time ddb-importer syncs it, because a sync puts the D&D Beyond shapes back.
 *
 * When it runs:
 *   - `ddb-importer.characterProcessDataComplete` ({actor, ddbCharacter}) — ddb-importer calls it
 *     (Hooks.callAll, so only on the client that ran the sync) once the import is written. That client
 *     applies the plan when it may update the actor (an owner or a GM); otherwise it asks the active GM
 *     (the `ddbCorrections.apply` relay query). The hook cannot change the data in flight: we correct
 *     right after it.
 *   - the GM-ready sweep (`sweep`, called by the entry on the active GM): every DDB actor whose
 *     `flags.ddbimporter.importId` differs from the stamp of its last correction (a sync made while no
 *     owner had this module running, or before it existed) is corrected.
 *
 * The world setting `ddbCorrections` (default on) switches both off. One summary line per run that
 * changed something: the console, and a chat message whispered to the GMs. A run that changes
 * nothing says nothing (debug only).
 *
 * The rules are ddb-core.mjs; reading the actor and writing the plan, ddb-adapter.mjs.
 */

import { needsCorrection, planCorrections, stampFor, summaryLine, RULES } from "./ddb-core.mjs";
import { applyPlan, isDdbActor, lookupsFor, snapshotOf } from "./ddb-adapter.mjs";
import { MODULE, VERSION } from "./importer-core.mjs";
import { setting } from "./settings.mjs";
import { codedError, fail, ok } from "./lib/errors.mjs";
import { queryGM } from "./lib/queries.mjs";

/** The ddb-importer hook. Its name is the ddb-importer row in foundry/adjustments.yml. */
export const DDB_SYNC_HOOK = "ddb-importer.characterProcessDataComplete";

/** The relay query a non-owner's client sends (the `ddbCorrections.apply` row). */
const APPLY_QUERY = `${MODULE}.ddbCorrections.apply`;

let LOG = null;
/** Actor ids with a correction in flight on this tab: a second trigger waits for nothing and skips. */
const running = new Set();

/**
 * @param {{on: Function}} reg
 * @param {{log: object, exposed?: object}} ctx  gets `exposed.ddb`
 */
export function install(reg, ctx) {
  LOG = ctx.log;
  reg.on(DDB_SYNC_HOOK, onSynced, { label: "ddb corrections" });
  ctx.exposed = { ...(ctx.exposed ?? {}), ddb: { plan, apply, sweep, rules } };
}

export function uninstall() {
  LOG = null;
  running.clear();
}

/** The hook listener: synchronous; the work leaves it (§5.9.2). */
function onSynced(payload) {
  const actor = payload?.actor;
  if (!actor || !isDdbActor(actor) || setting("ddbCorrections") === false) return;
  void afterSync(actor);
}

async function afterSync(actor) {
  try {
    if (actor.isOwner) {
      await correct(actor, { reason: "sync" });
      return;
    }
    const out = await queryGM(APPLY_QUERY, { ref: actor.uuid ?? actor.id });
    if (out?.ok === false) LOG?.warn(`DDB corrections — ${actor.name}: the GM did not apply them (${out.code}: ${out.reason})`);
  } catch (err) {
    LOG?.warn(`DDB corrections — ${actor.name}: failed`, err);
  }
}

/** The rule list, for describe-like reading: `[{ id, label, doc }]`. */
function rules() {
  return RULES.map(r => ({ id: r.id, label: r.label, doc: r.doc }));
}

/**
 * The dry run: what the rules would change on this actor now. Throws BAD_ARGS for a non-DDB actor.
 * @param {Actor} actor  resolved by the kit
 */
async function plan(actor) {
  if (!isDdbActor(actor)) throw codedError("BAD_ARGS", `${actor?.name} is not a D&D Beyond character (no flags.ddbimporter)`);
  const snap = snapshotOf(actor);
  const out = planCorrections(snap, await lookupsFor(snap));
  return { ...out, needsCorrection: needsCorrection(snap), enabled: setting("ddbCorrections") !== false };
}

/**
 * Apply the corrections to one actor. Called by a user (`game.pentaryn.importer.ddbCorrections.apply`),
 * by the sync listener, or as the relay query on the active GM (`qctx` is then core's query context).
 * A caller who cannot update the actor is relayed to the active GM. Runs whatever the setting says:
 * the setting governs the automatic runs only.
 * @param {Actor} actor
 * @param {{dryRun?: boolean}} [opts]
 * @param {{user?: User}} [qctx]
 */
async function apply(actor, opts = {}, qctx = undefined) {
  const dryRun = opts?.dryRun === true;
  if (!isDdbActor(actor)) return fail("BAD_ARGS", `${actor?.name} is not a D&D Beyond character (no flags.ddbimporter)`);
  if (dryRun) return ok({ dryRun: true, ...(await plan(actor)) });
  if (!actor.isOwner) {
    if (qctx) return fail("REFUSED", `${actor.name}: this client cannot update the actor`);
    return queryGM(APPLY_QUERY, { ref: actor.uuid ?? actor.id });
  }
  if (qctx?.user) LOG?.info("ddb corrections relay", { uuid: actor.uuid, by: qctx.user.id });
  return correct(actor, { reason: qctx ? "relay" : "api" });
}

/**
 * Plan, write, stamp and report one actor. A clean run with nothing to change writes only the stamp,
 * and only when the actor's import is newer than it.
 */
async function correct(actor, { reason }) {
  if (running.has(actor.id)) return fail("CONFLICT", `${actor.name}: corrections already running on this tab`);
  running.add(actor.id);
  try {
    const snap = snapshotOf(actor);
    const planned = planCorrections(snap, await lookupsFor(snap));
    const stamp = stampFor(snap, { at: Date.now(), version: VERSION, changes: planned.changes.length });
    if (!planned.changes.length) {
      if (needsCorrection(snap)) await applyPlan(actor, planned, stamp);
      LOG?.debug(`DDB corrections — ${actor.name}: nothing to change (${reason})`);
      return ok({ ...planned, applied: [], errors: [], reason });
    }
    const result = await applyPlan(actor, planned, stamp);
    await report(actor, planned, result, reason);
    return { ok: !result.errors.length, ...planned, ...result, reason };
  } finally {
    running.delete(actor.id);
  }
}

/** The one summary line of a run that changed something: console, and a chat whisper to the GMs. */
async function report(actor, planned, result, reason) {
  const line = summaryLine(actor.name, planned.changes.filter(c => result.applied.includes(c.summary)), result.errors);
  if (result.errors.length) LOG?.warn(`${line} (${reason})`, result.errors);
  else LOG?.info(`${line} (${reason})`);
  const g = globalThis;
  const gms = (g.game?.users?.contents ?? []).filter(u => u.isGM).map(u => u.id);
  const ChatMessage = g.getDocumentClass?.("ChatMessage");
  if (!gms.length || typeof ChatMessage?.create !== "function") return;
  const esc = s => g.foundry?.utils?.escapeHTML?.(String(s)) ?? String(s);
  const items = [...result.applied, ...result.errors.map(e => `error: ${e}`)].map(s => `<li>${esc(s)}</li>`).join("");
  try {
    await ChatMessage.create({
      content: `<p><strong>DDB corrections — ${esc(actor.name)}</strong></p><ul>${items}</ul>`,
      whisper: gms,
      speaker: { alias: "pentaryn-importer" },
    });
  } catch (err) {
    LOG?.warn("DDB corrections: the chat summary failed", err);
  }
}

/**
 * The GM-ready sweep: correct every DDB actor synced since its last correction, one at a time.
 * The entry calls it on the active GM only. @returns {Promise<{checked, corrected: string[]}>}
 */
async function sweep() {
  const g = globalThis;
  if (setting("ddbCorrections") === false) return { checked: 0, corrected: [], skipped: "setting off" };
  const due = (g.game?.actors?.contents ?? []).filter(a => isDdbActor(a) && needsCorrection(snapshotOf(a)));
  const corrected = [];
  for (const actor of due) {
    try {
      const out = await correct(actor, { reason: "sweep" });
      if (out?.changes?.length) corrected.push(actor.name);
    } catch (err) {
      LOG?.warn(`DDB corrections — ${actor.name}: the sweep failed`, err);
    }
  }
  return { checked: due.length, corrected };
}
