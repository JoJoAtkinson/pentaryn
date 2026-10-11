/**
 * pentaryn-prompts — the six marker actors.
 *
 * The flag `flags.pentaryn-prompts.marker = "<size>"` on the actor (and its prototype, so every
 * placed token carries it too) is what makes something a prompt marker. Never the name.
 */

import { MODULE, SIZES, SIZE_BY_KEY, nameplate, normalisePrompt } from "./geometry-core.mjs";

export const FOLDER_NAME = "Prompt Markers";
export const EMPTY_TINT = "#ff6b6b";
export const FULL_TINT = "#ffffff";

export const art = sizeKey => `modules/${MODULE}/assets/marker-${sizeKey}.webp`;
export const actorName = sizeKey => `Prompt · ${sizeKey}`;

/** The marker size of an actor, or null. */
export function markerSizeOfActor(actor) {
  const v = actor?.flags?.[MODULE]?.marker;
  return SIZE_BY_KEY[v] ? v : null;
}

/** The marker size of a token document, from its own flag or its actor's, or null. */
export function markerSizeOfToken(tok) {
  if (!tok) return null;
  const own = tok.flags?.[MODULE]?.marker;
  if (SIZE_BY_KEY[own]) return own;
  const actor = tok.actorId ? game.actors?.get(tok.actorId) : null;
  return markerSizeOfActor(actor);
}

export const isPromptToken = tok => !!markerSizeOfToken(tok);

/** The prompt text on a marker token ("" when none). */
export function promptText(tok) {
  return normalisePrompt(tok?.flags?.[MODULE]?.prompt ?? "");
}

/** The world actor for a marker size. */
export function markerActor(sizeKey) {
  return game.actors?.find(a => markerSizeOfActor(a) === sizeKey) ?? null;
}

/** Every prompt-marker actor id, for "is this one of ours" checks. */
export function markerActorIds() {
  return new Set(game.actors?.filter(a => !!markerSizeOfActor(a)).map(a => a.id) ?? []);
}

/** The fields ensureMarkers owns, as update paths → wanted value. */
function wanted(s, folderId) {
  const D = CONST.TOKEN_DISPOSITIONS ?? { SECRET: -2 };
  const N = CONST.TOKEN_DISPLAY_MODES ?? { ALWAYS: 50, NONE: 0 };
  return {
    name: actorName(s.key),
    folder: folderId,
    img: art(s.key),
    "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
    "system.traits.size": s.dnd,
    [`flags.${MODULE}.marker`]: s.key,
    "prototypeToken.name": nameplate("", s.key),
    "prototypeToken.width": s.w,
    "prototypeToken.height": s.w,
    "prototypeToken.texture.src": art(s.key),
    "prototypeToken.texture.scaleX": s.scale,
    "prototypeToken.texture.scaleY": s.scale,
    "prototypeToken.texture.tint": EMPTY_TINT,
    "prototypeToken.sight.enabled": false,
    "prototypeToken.disposition": D.SECRET,
    "prototypeToken.displayName": N.ALWAYS,
    "prototypeToken.displayBars": N.NONE,
    "prototypeToken.actorLink": false,
    "prototypeToken.lockRotation": true,
    "prototypeToken.ring.enabled": false,
    "prototypeToken.flags.dnd5e.lockSize": true,
    [`prototypeToken.flags.${MODULE}.marker`]: s.key
  };
}

function same(a, b) {
  if (typeof a === "string" && typeof b === "string" && a.startsWith("#") && b.startsWith("#")) return a.toLowerCase() === b.toLowerCase();
  // Color fields come back as Color objects (numbers) on some paths
  if (a != null && typeof a === "object" && typeof a.css === "string") return same(a.css, b);
  return a === b;
}

let ensuring = null;

/**
 * Create the folder and any missing marker actor; repair drifted fields; never delete.
 * Runs on the active GM only (two GM clients would both create). Returns a summary.
 */
export async function ensureMarkers() {
  if (!game.user?.isGM) return { skipped: "not GM" };
  if (game.users?.activeGM && !game.users.activeGM.isSelf) return { skipped: "not the active GM" };
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const summary = { folder: null, created: [], repaired: [] };
    let folder = game.folders.find(f => f.type === "Actor" && f.name === FOLDER_NAME);
    if (!folder) {
      folder = await Folder.create({ name: FOLDER_NAME, type: "Actor", color: "#5b3fa6", sorting: "m" });
      summary.folder = "created";
    }
    const creates = [];
    let sort = 0;
    for (const s of SIZES) {
      sort += 10;
      const want = wanted(s, folder.id);
      const actor = markerActor(s.key);
      if (!actor) {
        const data = { type: "npc", sort };
        for (const [k, v] of Object.entries(want)) foundry.utils.setProperty(data, k, v);
        creates.push(data);
        summary.created.push(actorName(s.key));
        continue;
      }
      const diff = {};
      for (const [k, v] of Object.entries(want)) {
        if (k === "name" || k === "folder") continue;      // Joe may rename or move them; flags are the key
        if (!same(foundry.utils.getProperty(actor._source, k), v)) diff[k] = v;
      }
      if (Object.keys(diff).length) {
        await actor.update(diff);
        summary.repaired.push(`${actor.name}: ${Object.keys(diff).join(", ")}`);
      }
    }
    if (creates.length) await Actor.createDocuments(creates);
    if (summary.folder || summary.created.length || summary.repaired.length) {
      console.log(`${MODULE} | markers ensured`, summary);
    }
    return summary;
  })();
  try { return await ensuring; } finally { ensuring = null; }
}

/**
 * preCreateToken: every marker token is born hidden, sightless and size-locked, carries its size
 * flag, and wears the right nameplate/tint for whatever text it was created with.
 */
export function onPreCreateToken(doc, data) {
  const size = markerSizeOfToken(doc) ?? markerSizeOfActor(game.actors?.get(data?.actorId));
  if (!size) return;
  const text = normalisePrompt(foundry.utils.getProperty(data, `flags.${MODULE}.prompt`) ?? "");
  doc.updateSource({
    hidden: true,
    "sight.enabled": false,
    "flags.dnd5e.lockSize": true,
    [`flags.${MODULE}.marker`]: size,
    name: nameplate(text, size),
    "texture.tint": text ? FULL_TINT : EMPTY_TINT
  });
}
