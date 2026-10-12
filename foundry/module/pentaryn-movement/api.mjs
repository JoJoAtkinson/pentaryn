/**
 * Pentaryn Movement — the API: implementations for the manifest rows, and selftest().
 *
 * GLUE. Imports core, the adapter, settings and lib — never the feature file. The feature's state
 * reaches this file through `ctx.exposed` (what ghost.mjs passed to `ctx.expose()` in install()).
 */

import * as core from "./movement-core.mjs";
import { HOOKS, MODULE, NS } from "./movement-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, policyWrite, settingsSnapshot, unreadableSettings } from "./settings.mjs";
import { pinInputs } from "./combat-adapter.mjs";
import { buildApi } from "./lib/api.mjs";
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

/** Pins on a scene whose centre sits under a visible token; player-owned tokens first. */
function pinsUnderTokens(scene = canvas?.scene) {
  if (!scene) return [];
  const { notes, tokens } = pinInputs(scene);
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
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const x = ctx.exposed;
  return buildApi(MANIFEST, {
    status: opts => x.status(opts),
    ghostFor: token => x.ghostFor(token),
    combatActive: sceneId => x.combatActive(sceneId),
    setGhost: on => x.setGhost(on),
    setPolicy,
    pinsUnderTokens,
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
