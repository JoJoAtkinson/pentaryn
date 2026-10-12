/**
 * The conduit's private plumbing the study/ files read: the one logger, the three socket action
 * names (STUDY, INSPECT, BUBBLE), the attack-line cap (ATTACK_LINES_MAX), the situational-bonus
 * bounds (SITUATIONAL_MIN/MAX) and their clamp (clampSituational), the token a card names a creature by
 * (cardToken/cardName), and an `esc` re-export. NOT re-exported by the study.mjs barrel
 * except SITUATIONAL_MIN/MAX, which it always exported.
 *
 * Split out of study.mjs (S4b, ties-35).
 */

import { MODULE } from "../ties-core.mjs";
import { makeLog } from "../lib/log.mjs";

/** The conduit's one logger: every line reads `pentaryn-ties | …`, as the console lines it replaced. */
export const log = makeLog(MODULE);

export const STUDY = "study";
export const INSPECT = "inspect";
export const BUBBLE = "scope-bubble";

/** How many attack lines a tier-25 reveal will paste. An ancient dragon is not a manual. */
export const ATTACK_LINES_MAX = 12;

/** Situational bonus range. Wide enough for the indistinguishability run's ±100 forcing. */
export const SITUATIONAL_MIN = -100;
export const SITUATIONAL_MAX = 100;

/** The situational bonus, rounded and clamped — one copy for the request and the handler. */
export const clampSituational = v => Math.max(SITUATIONAL_MIN, Math.min(SITUATIONAL_MAX, Math.round(Number(v) || 0)));

/**
 * The token a chat card names `actor` by: an unlinked token's own document, else the first token
 * of that actor on the scene in view, else null.
 */
export function cardToken(actor) {
  if (!actor) return null;
  if (actor.token) return actor.token;
  const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
  return scene?.tokens?.find?.(t => t.actorId === actor.id) ?? null;
}

/**
 * **The name a chat card may print for a creature** — its TOKEN name, never its actor name
 * (TIE-3). Joe's ruling: the token name is public, and a world actor's name can be GM-only
 * ("ZZ Lich Vorath" behind "Hooded figure"). The prototype token's name stands in when none is on
 * the scene; the actor name only when there is no token at all.
 */
export const cardName = actor => cardToken(actor)?.name || actor?.prototypeToken?.name || actor?.name || "";

export { esc } from "../core/html.mjs";
