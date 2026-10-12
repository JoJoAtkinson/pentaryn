/**
 * Pentaryn Drop Bin — the API: implementations of the manifest rows over `ctx.exposed` (what the
 * ledger, corpses and loot features exposed), and buildApiFor(ctx). May import core, adapters,
 * settings and lib — never a feature file.
 */

import * as core from "./dropbin-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, setting, settingsSnapshot } from "./settings.mjs";
import { api as itemPilesApi } from "./piles.mjs";
import { hasSocket } from "./socketlib-adapter.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

const ownFlags = doc => doc?.flags?.[core.MODULE] ?? {};

/** One token's corpse state (plain data). */
function tokenRow(token, isDead) {
  const f = ownFlags(token);
  const corpse = core.isOurCorpse(token);
  return {
    token: refOf(token),
    actor: refOf(token.actor),
    dead: !!isDead(token.actor),
    corpse,
    noLoot: core.hasNoLoot(token),
    pile: core.pileFlags(token),
    saved: corpse ? { sight: f.sight ?? null, ownership: f.ownership ?? null } : null,
  };
}

/** The scenes inspect looks in: opts.sceneId ("current" = this client's canvas), else every scene. */
function scenesFor(sceneId) {
  if (sceneId === "current") return canvas?.scene ? [canvas.scene] : [];
  if (sceneId) return [game.scenes.get(sceneId)].filter(Boolean);
  return [...game.scenes];
}

/** A string UUID naming a Token or an Actor (a synthetic token actor included), else null. */
function tokenOrActorByUuid(ref) {
  if (typeof ref !== "string" || !ref.includes(".")) return null;
  let hit = null;
  try {
    hit = globalThis.fromUuidSync?.(ref) ?? null;
  } catch {
    hit = null;
  }
  return hit?.documentName === "Token" || hit?.documentName === "Actor" ? hit : null;
}

function inspect(ref, opts, isDead) {
  const { sceneId } = opts && typeof opts === "object" ? opts : {};
  // a UUID picks its branch by documentName first: resolveRef(…, "token") throws BAD_ARGS on an Actor UUID
  const doc = ref?.documentName ? ref : ref?.document?.documentName ? ref.document : tokenOrActorByUuid(ref);
  let token = doc?.documentName === "Token" ? doc : null;
  let actor = doc?.documentName === "Actor" ? doc : null;
  if (!token && !actor) {
    token = resolveRef(ref, "token", { sceneId, required: false });
    if (!token) actor = resolveRef(ref, "actor", { sceneId });
  }
  if (token) return toPlain(tokenRow(token, isDead));
  if (actor.isToken && actor.token) return toPlain(tokenRow(actor.token, isDead));
  const corpses = [];
  for (const scene of scenesFor(sceneId)) {
    for (const t of scene.tokens) if (t.actorId === actor.id && core.isOurCorpse(t)) corpses.push(tokenRow(t, isDead));
  }
  return toPlain({ actor: refOf(actor), dead: !!isDead(actor), noLoot: !!ownFlags(actor).noLoot, pile: core.pileFlags(actor), corpses });
}

function selftest(ctx) {
  const log = setting("log"), counter = setting("counter");
  const checks = [
    { label: "published as module.api", ok: game.modules.get(core.MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${core.NS} is this API`, ok: game.pentaryn?.[core.NS] === ctx.api },
    { label: "ledger settings readable", ok: Array.isArray(log) && Number.isInteger(counter), detail: { entries: log?.length ?? null, counter } },
    { label: "counter is at least the highest entry number", ok: (counter ?? 0) >= Math.max(0, ...(log ?? []).map(e => e.n ?? 0)) },
    { label: "socketlib relay registered", ok: hasSocket() },
    { label: "Item Piles API present", ok: !!itemPilesApi() },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

function impl(ctx) {
  const { ledger, corpses, loot } = ctx.exposed;
  return {
    "corpses.sync": corpses.sync,
    "corpses.toCorpse": corpses.toCorpse,
    "corpses.fromCorpse": corpses.fromCorpse,
    "corpses.isDead": corpses.isDead,
    "corpses.revive": corpses.revive,
    "corpses.paintEye": corpses.paintEye,
    "corpses.paintAllEyes": corpses.paintAllEyes,
    "corpses.migrateLegacyEyes": corpses.migrateLegacyEyes,
    "loot.install": loot.install,
    "loot.refreshAll": loot.refreshAll,
    "loot.recipientFor": loot.recipientFor,
    all: ledger.all,
    list: ledger.list,
    get: ledger.get,
    search: ledger.search,
    restore: ledger.restore,
    export: ledger.export,
    clear: ledger.clear,
    restoreResult: ledger.restoreResult,
    inspect: (ref, opts) => inspect(ref, opts, corpses.isDead),
    selftest: () => selftest(ctx),
  };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, impl(ctx), {
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: core.HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(core.NS),
    }),
  });
}
