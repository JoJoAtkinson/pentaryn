/**
 * pentaryn-prompts core — what makes a prompt marker, as plain data. PURE: the world's actors are
 * passed in (markers-adapter.mjs passes game.actors).
 *
 * The flag `flags.pentaryn-prompts.marker = "<size>"` on the actor (and its prototype, so every
 * placed token carries it too) is what makes something a prompt marker. Never the name.
 */

import { MODULE } from "../prompts-core.mjs";
import { SIZE_BY_KEY } from "./size.mjs";
import { normalisePrompt } from "./text.mjs";

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

/** The marker size of a token document, from its own flag or its actor's (looked up in `actors`), or null. */
export function markerSizeOf(tok, actors) {
  if (!tok) return null;
  const own = tok.flags?.[MODULE]?.marker;
  if (SIZE_BY_KEY[own]) return own;
  const actor = tok.actorId ? actors?.get(tok.actorId) : null;
  return markerSizeOfActor(actor);
}

/** The prompt text on a marker token ("" when none). */
export function promptText(tok) {
  return normalisePrompt(tok?.flags?.[MODULE]?.prompt ?? "");
}
