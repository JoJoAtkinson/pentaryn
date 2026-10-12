/**
 * ORACLE (ties checkpoint, wave 3 — guide §3 S2 item 5). `isApplyingGM` as relay.mjs:62 and
 * study.mjs:127 both define it, verbatim, over an injected `game`. S5 replaces both with the kit's
 * `isActiveGM()` and must agree row for row. Do not edit.
 */
export const isApplyingGM = game => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
