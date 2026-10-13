/**
 * The conduit's private plumbing the study/ files read: the one logger, the three socket action
 * names (STUDY, INSPECT, BUBBLE), the attack-line cap (ATTACK_LINES_MAX), the situational-bonus
 * bounds (SITUATIONAL_MIN/MAX) and their clamp (clampSituational), the token a card names a creature by
 * (cardToken/cardName), a skill's label (skillLabelOf), and an `esc` re-export. NOT re-exported by the study.mjs barrel
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

/** A dnd5e skill's localized name, or the raw key when the system does not know it — one copy (M8). */
export const skillLabelOf = skill => CONFIG.DND5E?.skills?.[skill]?.label ?? skill;

/**
 * The token a chat card names `actor` by: an unlinked token's own document, else the first token
 * of that actor on this client's scene, then the active scene, then any scene; else null.
 *
 * ⚠ Every scene, not just `canvas.scene`: the Study stub and the share whisper post from the
 * arbiter GM's client, whose canvas is wherever the GM happened to be looking (the `canReach`
 * lesson, usability run Area 7 K2). Stopping at it leaked the actor name whenever the GM tab sat
 * on another scene.
 */
export function cardToken(actor) {
  if (!actor) return null;
  if (actor.token) return actor.token;
  const first = scene => scene?.tokens?.find?.(t => t.actorId === actor.id) ?? null;
  const scenes = [canvas?.scene, game.scenes?.active, ...(game.scenes?.contents ?? [])];
  for (const scene of scenes) {
    const token = first(scene);
    if (token) return token;
  }
  return null;
}

/**
 * **The name a chat card may print for a creature** — its TOKEN name, never its actor name
 * (TIE-3). Joe's ruling: the token name is public, and a world actor's name can be GM-only
 * ("ZZ Lich Vorath" behind "Hooded figure"). The prototype token's name stands in when the actor
 * has no token on any scene; the actor name only when there is no token at all.
 */
export const cardName = actor => cardToken(actor)?.name || actor?.prototypeToken?.name || actor?.name || "";

export { esc } from "../core/html.mjs";
