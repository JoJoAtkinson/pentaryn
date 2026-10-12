/**
 * The conduit's private plumbing the study/ files read: the one logger, the three socket action
 * names (STUDY, INSPECT, BUBBLE), the attack-line cap (ATTACK_LINES_MAX), the situational-bonus
 * bounds (SITUATIONAL_MIN/MAX) and an `esc` re-export. NOT re-exported by the study.mjs barrel
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

export { esc } from "../core/html.mjs";
