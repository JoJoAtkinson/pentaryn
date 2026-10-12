/**
 * pentaryn-prompts — the API: the manifest rows bound to their implementations, inspect(),
 * selftest(), status().
 *
 * API. Imports core, adapters, settings, the manifest and lib — never a feature or the glue files:
 * placement's `place`/`open` and the double-click state reach this file through `ctx.exposed`, and
 * the entry contributes gather/crops/list/show and replace/replaceMany (`ctx.contributions`).
 */

import { MODULE, NS, VERSION, SPEC_DIR, HOOKS } from "./prompts-core.mjs";
import { CODES as PROMPTS_CODES, SIZE_KEYS, codedError as promptsError } from "./geometry-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, setting, manifests, manifestFor, settingsSnapshot } from "./settings.mjs";
import { ensureMarkers, markerActor, markerSizeOfToken, promptText } from "./markers-adapter.mjs";
import { sceneModel, promptTokens, provenanceOf } from "./scene-adapter.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { CODES as KIT_CODES, codedError } from "./lib/errors.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { queryNameOf } from "./lib/queries.mjs";
import { refOf } from "./lib/resolve.mjs";

/** `model(sceneId)`: a scene by id, else the viewed one; SCENE_UNKNOWN otherwise (the fork's code). */
function model(sceneId) {
  const scene = sceneId ? game.scenes.get(sceneId) : canvas?.scene;
  if (!scene) throw promptsError("SCENE_UNKNOWN", String(sceneId));
  return sceneModel(scene);
}

/**
 * `version` is the code that is running (prompts-core's VERSION); `listed` is what game.modules
 * says, which can lag behind until the world rescans module.json.
 */
function status(ctx) {
  return {
    version: VERSION, listed: game.modules.get(MODULE)?.version ?? null,
    npcBridge: typeof CONFIG.queries?.["foundry-mcp-bridge.createNpcActor"] === "function",
    // the world's party for encounter budgets; blank = none, and a gather says so (never guess one)
    party: setting("party", "none set") || "none set",
    specDir: `${SPEC_DIR}/ (under the Foundry Data dir; replaceMany({specFile: "${SPEC_DIR}/<name>.json"}))`,
    doubleClick: ctx.exposed.doubleClick?.() ?? null, markers: SIZE_KEYS.map(k => [k, markerActor(k)?.id ?? null]),
  };
}

/** One token (already resolved by buildApi from the `ref` param): marker size and text, or provenance. */
function inspect(tok) {
  const size = markerSizeOfToken(tok);
  return toPlain({
    token: refOf(tok),
    marker: size ? { size, text: promptText(tok) } : null,
    provenance: size ? null : provenanceOf(tok) ?? null,
  });
}

/** The prompt markers on a scene: `[{ id, size, text }]`, in the scene's token order. */
function markersOn(sceneId) {
  const scene = game.scenes.get(sceneId);
  if (!scene) throw codedError("NOT_FOUND", `scene ${sceneId}`);
  return promptTokens(scene).map(t => ({ id: t.id, size: markerSizeOfToken(t), text: promptText(t) }));
}

function selftest(ctx) {
  const missing = SIZE_KEYS.filter(k => !markerActor(k));
  const listed = game.modules.get(MODULE)?.version ?? null;
  const checks = [
    { label: "the six marker actors exist", ok: !missing.length, detail: missing.length ? `missing: ${missing.join(", ")}` : null },
    { label: "double-click is patched", ok: ctx.exposed.doubleClick?.() != null, detail: ctx.exposed.doubleClick?.() ?? null },
    { label: "pentaryn-prompts.gather is a registered query", ok: typeof CONFIG.queries?.[`${MODULE}.gather`] === "function" },
    { label: "the running code is module.json's version", ok: listed === null || listed === VERSION, detail: `${VERSION} / ${listed}` },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const ex = ctx.exposed;
  return buildApi(MANIFEST, {
    open: (...args) => ex.open(...args),
    place: (...args) => ex.place(...args),
    ensureMarkers,
    model,
    manifests,
    status: () => status(ctx),
    inspect: tok => inspect(tok),
    markersOn,
    manifest: call => manifestFor(call),
    selftest: () => selftest(ctx),
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
      queries: MANIFEST.rows.filter(r => r.query).map(r => queryNameOf(MANIFEST, r)),
      published: publishedOf(NS),
      // the legacy rows throw the module's own codes (the fork parses them); the new reads the kit's
      errors: [...new Set([...PROMPTS_CODES, ...KIT_CODES])],
    }),
  });
}
