/**
 * Pentaryn Transform — FEATURE: body swaps never animate (Area 4 live run, D4).
 */

import { MODULE, isBodySwap } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

// Core animates a token update and, on every frame, writes the animation's in-flight values back
// onto the TokenDocument (Token#animateFrame: mergeObject(this.document, animationData)). In a tab
// whose canvas is not ticking (the GM tab sits in the background at this table) a transform's
// animation never completes, so the document kept showing the FIRST form's art and size after a
// chain of shifts, and dnd5e, which reads previousTokenData from those prepared values, saved them
// for the revert. A body swap (transform/revert) now never animates, on every client: animate:false
// makes core stop the token's animations and re-sync from the fresh document instead.
// Adjustment row core-token-swap-no-animation.
let unwrap = v => v;     // core's operator → its plain value; bound at install, as the inline block did

function guardBodySwap(doc, changes, options) {
  try {
    if (options?.animate === false) return;
    if (isBodySwap(changes, { actorId: doc?._source?.actorId ?? doc?.actorId ?? null, unwrap })) options.animate = false;
  } catch (err) { log.warn("body-swap animation guard skipped", err); }
}

export function install(reg) {
  const Ops = foundry.data?.operators;
  unwrap = (v) => (Ops?.DataFieldOperator && v instanceof Ops.DataFieldOperator ? Ops.DataFieldOperator.get(v) : v);
  reg.on("preUpdateToken", guardBodySwap, { label: "preUpdateToken: body swaps never animate", guard: false });
}

export function uninstall() {}
