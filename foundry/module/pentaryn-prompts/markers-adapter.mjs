/**
 * pentaryn-prompts — the six marker actors: find them, create and repair them, hide new marker tokens.
 *
 * ADAPTER (game.actors, Folder, Actor, CONST). What makes a marker, as plain data, is core/markers.mjs.
 */

import { MODULE, SIZES, nameplate, normalisePrompt } from "./geometry-core.mjs";
import { FOLDER_NAME, EMPTY_TINT, FULL_TINT, art, actorName, markerSizeOf, markerSizeOfActor, promptText } from "./core/markers.mjs";

// the pure half lives in core/markers.mjs; re-exported for every importer of this file
export { FOLDER_NAME, EMPTY_TINT, FULL_TINT, art, actorName, markerSizeOfActor, promptText };

/** The marker size of a token document, from its own flag or its world actor's, or null. */
export function markerSizeOfToken(tok) {
  return markerSizeOf(tok, game.actors);
}

export const isPromptToken = tok => !!markerSizeOfToken(tok);

/** The world actor for a marker size. */
export function markerActor(sizeKey) {
  return game.actors?.find(a => markerSizeOfActor(a) === sizeKey) ?? null;
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
 * Deterministic ids for what ensureMarkers creates (§5.9.1/§5.9.2). The active-GM gate picks a
 * user, not a tab: the MCP bridge tab and a GM browser tab both pass it and both look before either
 * creates. Created with `keepId`, the second tab's create replaces the first's document with the
 * same data instead of adding a duplicate folder or `Prompt · <size>` actor.
 */
const FOLDER_ID = "pPromptsFolder00";
const markerActorId = sizeKey => `pPrompts${sizeKey}`.padEnd(16, "0");

/**
 * Create the folder and any missing marker actor; repair drifted fields; never delete.
 * Runs on the active GM's tabs only; the creates are idempotent across those tabs by id.
 * Returns a summary.
 */
export async function ensureMarkers() {
  if (!game.user?.isGM) return { skipped: "not GM" };
  if (game.users?.activeGM && !game.users.activeGM.isSelf) return { skipped: "not the active GM" };
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const summary = { folder: null, created: [], repaired: [] };
    // ours by id first, so a renamed folder is found rather than replaced
    let folder = game.folders.get(FOLDER_ID) ?? game.folders.find(f => f.type === "Actor" && f.name === FOLDER_NAME);
    if (!folder) {
      folder = await Folder.create({ _id: FOLDER_ID, name: FOLDER_NAME, type: "Actor", color: "#5b3fa6", sorting: "m" }, { keepId: true });
      summary.folder = "created";
    }
    const creates = [], updates = [];
    let sort = 0;
    for (const s of SIZES) {
      sort += 10;
      const want = wanted(s, folder.id);
      const actor = markerActor(s.key);
      if (!actor) {
        // built from SIZES and the folder alone, so both tabs send the same create
        const data = { _id: markerActorId(s.key), type: "npc", sort };
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
        updates.push({ _id: actor.id, ...diff });
        summary.repaired.push(`${actor.name}: ${Object.keys(diff).join(", ")}`);
      }
    }
    // one round trip for every repair and one for every create (§5.9.1); update hooks still fire per actor
    if (updates.length) await Actor.updateDocuments(updates);
    if (creates.length) await Actor.createDocuments(creates, { keepId: true });
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
