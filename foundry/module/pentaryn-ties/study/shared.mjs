/**
 * The conduit's private plumbing every study/ file reads: the socket channel and action names, the
 * situational-bonus range, the i18n and escape helpers, the applying-GM test and the never-throwing
 * flag read. NOT re-exported by the study.mjs barrel except SITUATIONAL_MIN/MAX, which it always
 * exported.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
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

export const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
export const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);
export { esc } from "../core/html.mjs";
