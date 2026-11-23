/**
 * Pentaryn Movement — the API: implementations for the manifest rows, and selftest().
 *
 * GLUE. Imports core, the adapter, settings and lib — never the feature file. The feature's state
 * reaches this file through `ctx.exposed` (what ghost.mjs passed to `ctx.expose()` in install()).
 */

import * as core from "./movement-core.mjs";
import { HOOKS, MODULE, NS } from "./movement-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, assistTripped, policyWrite, settingsMigrated, settingsSnapshot, unreadableSettings } from "./settings.mjs";
import { pinInputs, sceneOf } from "./combat-adapter.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";

/**
 * GM: set the policy directly. A mode other than off is also what the GM button restores. Queued
 * behind any policy write already running on this client (movement-async-1).
 */
async function setPolicy(value) {
  if (!game.user.isGM) throw new Error("GM only");
  const p = core.normalizePolicy(value);
  return policyWrite(async () => {
    if (p !== "off") await game.settings.set(MODULE, "ghostPolicyLast", p);
    return game.settings.set(MODULE, "ghostPolicy", p);
  });
}

/**
 * Pins on a scene whose centre sits under a visible token; player-owned tokens first. Takes a Scene
 * or a scene id; an unknown id answers [] like no scene (rob-1).
 */
function pinsUnderTokens(scene = canvas?.scene) {
  const doc = sceneOf(scene);
  if (!doc) return [];
  const { notes, tokens } = pinInputs(doc);
  return core.pinsUnderTokens(notes, tokens);
}

function selftest(ctx) {
  const patched = ctx.exposed.patched?.() ?? {};
  const unreadable = unreadableSettings();
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "settings readable", ok: unreadable.length === 0, detail: unreadable },
    { label: "Token#_getDragConstrainOptions wrapped", ok: patched.drag === true },
    { label: "TokenLayer#_prepareKeyboardMovementUpdates wrapped", ok: patched.keyboard === true },
    { label: "Token#findMovementPath wrapped (drag pathfinding)", ok: ctx.exposed.pathfindPatched?.() === true },
    { label: "Token#_prepareDragLeftDropUpdates wrapped (group movement)", ok: ctx.exposed.groupPatched?.() === true },
    { label: "Token#_onClickLeft wrapped (click to stop)", ok: ctx.exposed.stopPatched?.() === true },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/**
 * setGhost keeps its legacy shape, `setGhost(on: boolean)` (your own button), and since 0.2.0 also
 * takes a creature reference: `setGhost(ref, { combat })` is the GM's ghost-in-combat override for
 * it (I1). A string or an object is a reference; anything else is the boolean form.
 */
const isCreatureRef = on => typeof on === "string" || (on !== null && typeof on === "object");

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const x = ctx.exposed;
  return buildApi(MANIFEST, {
    status: opts => ({ ...x.status(opts), group: x.groupStatus(), stop: { last: x.stopLast?.() ?? null, firstFrames: x.stopFirstFrames?.() ?? 0 }, guard: x.guardStatus?.() ?? null,
      assist: { tripped: assistTripped() }, migrated: settingsMigrated() }),
    ghostFor: token => x.ghostFor(token),
    combatActive: sceneId => x.combatActive(sceneId),
    setGhost: (on, opts) => (isCreatureRef(on) ? x.setGhostInCombat(on, opts) : x.setGhost(on)),
    setPolicy,
    pinsUnderTokens,
    // `ref` is resolved by the kit per call (an Actor; a token gives its synthetic actor); reads throw coded.
    inspect: actor => toPlain(x.inspectActor(actor)),
    "pathfind.status": () => x.pathfindStatus(),
    "pathfind.route": (token, opts) => x.pathfindRoute(token, opts),
    planGroup: (refs, point) => toPlain(x.groupDryRun(refs, point)),
    // `ref` is resolved by the kit (a TokenDocument); through the relay the kit passes core's query context last.
    stop: (doc, opts, qctx) => x.stop(doc, opts, qctx),
    telemetry: opts => x.telemetry(opts),
    reportTelemetry: () => x.reportTelemetry(),
    fileWrongMove: () => x.fileWrongMove(),
    selftest: () => selftest(ctx),
    core,
  }, {
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
