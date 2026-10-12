/**
 * Pentaryn AoE — the API: implementations of the manifest's own rows, inspect(), and buildApiFor.
 *
 * GLUE (role api). May import core, adapters, settings and lib — never a feature file. The rows a
 * feature owns arrive as its install() contribution (ctx.contributions); feature state reaches this
 * file only through ctx.
 */

import { MODULE, NS, HOOKS, RECENT_MESSAGES, aoeFlags, isHandleTarget, summariseResolution } from "./core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, setting, settingsSnapshot } from "./settings.mjs";
import { areasFor, handleFor, removeArea, spellAreas } from "./scene-adapter.mjs";
import { cardEffects } from "./messages-adapter.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { codedError } from "./lib/errors.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

const messageOf = messageOrId => (typeof messageOrId === "string" ? game.messages.get(messageOrId) : messageOrId) ?? null;

function resolution(messageOrId) {
  const res = aoeFlags(messageOf(messageOrId)).resolution;
  return res ? foundry.utils.deepClone(res) : null;
}

function latestResolution({ sceneId = null } = {}) {
  const scene = sceneId === "current" ? canvas?.scene?.id ?? null : sceneId;
  if (sceneId === "current" && !scene) return null;
  for (const m of game.messages.contents.slice(-RECENT_MESSAGES).reverse()) {
    const res = aoeFlags(m).resolution;
    if (!res || res.superseded || (scene && res.scene !== scene)) continue;
    return { messageId: m.id, resolution: foundry.utils.deepClone(res) };
  }
  return null;
}

function summary(messageOrId) {
  return summariseResolution(aoeFlags(messageOf(messageOrId)).resolution);
}

function isHandle(tokenOrDoc) {
  return isHandleTarget(tokenOrDoc);
}

/** A ChatMessage for a message ref (document, id or uuid), else null. */
function asMessage(ref) {
  if (ref?.documentName === "ChatMessage") return ref;
  if (typeof ref !== "string") return null;
  const id = ref.startsWith("ChatMessage.") ? ref.slice("ChatMessage.".length) : ref;
  return game.messages.get(id) ?? null;
}

/** A token or actor for any other ref: a placeable or document as given, a Token uuid, else an actor (exact name, id or uuid). */
function asTokenOrActor(ref, { sceneId } = {}) {
  const doc = ref?.document ?? ref;
  if (doc?.documentName === "Token" || doc?.documentName === "Actor") return doc;
  if (typeof ref === "string" && /\.Token\.[A-Za-z0-9]{16}$/.test(ref)) {
    const tok = fromUuidSync(ref, { strict: false });
    if (tok) return tok;
    throw codedError("NOT_FOUND", `token ${ref}`);
  }
  return resolveRef(ref, "actor", { sceneId });
}

/**
 * Read-only aoe state, plain JSON, depth ≤ 4. A message: its tray summary, npcSave, effectsApplied.
 * A token or actor: handle or not, its region, the handle actor flag, Careful Spell. `as` (a user
 * ref) answers with that user's view: a player sees no tray summary, and Careful Spell only on an
 * actor they own.
 */
function inspect(ref, { sceneId, as } = {}) {
  const viewer = as === undefined || as === null ? null : resolveRef(as, "user");
  const gmView = !viewer || viewer.isGM === true;
  const message = asMessage(ref);
  if (message) {
    const flags = aoeFlags(message);
    const res = flags.resolution ?? null;
    return toPlain({
      message: refOf(message),
      resolution: gmView ? summariseResolution(res) : (res ? { playerStatus: summariseResolution(res).playerStatus } : null),
      npcSave: !!flags.npcSave,
      effectsApplied: flags.effectsApplied ?? null,
    });
  }
  const doc = asTokenOrActor(ref, { sceneId });
  const token = doc.documentName === "Token" ? doc : null;
  const actor = token ? token.actor ?? null : doc;
  const owns = gmView || actor?.testUserPermission?.(viewer, "OWNER") === true;
  return toPlain({
    ...(token ? { token: refOf(token) } : {}),
    actor: actor ? refOf(actor) : null,
    isHandle: isHandleTarget(token ?? actor),
    region: token ? aoeFlags(token).region ?? null : null,
    handleActor: !!aoeFlags(actor).handleActor,
    careful: owns ? aoeFlags(actor).careful ?? null : null,
  });
}

/** Build the frozen API. Throws (at ready, in node too) when the manifest and the implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    areasFor, spellAreas, handleFor, removeArea, cardEffects, setting,
    hookIds: function hookIds() {
      return ctx.reg.ids().map(({ name, id }) => ({ name, id }));
    },
    resolution, latestResolution, summary, isHandle, inspect,
  }, {
    contributions: ctx.contributions,
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: ctx.uninstall,
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
