/**
 * pentaryn-prompts — CORE: the console lines gather and replace print (prompts-lookup-18). Pure
 * text builders, so a test pins the exact words.
 *
 *   gatherLogLine   the always-on summary, `console.log` — with the `pentaryn-prompts | ` prefix
 *                   the call site writes, today's text exactly (pinned by gather-glue.test), so a
 *                   grep of an old console still matches.
 *   gatherPhaseLine where the gather's time went and how big the stored manifest is; a debug line
 *                   (`CONFIG.debug["pentaryn-prompts"] = true`).
 *   replaceLogLine  one line per replaceMany (real run or dry run); a debug line.
 * None carries the module prefix: the call site or the kit logger adds it.
 */

/** `gather pm-1: 3 prompts on 1 scene(s), 0 crop(s), 12 ms` */
export function gatherLogLine({ call, prompts, scenes, crops, ms }) {
  return `gather ${call}: ${prompts} prompts on ${scenes} scene(s), ${crops} crop(s), ${ms} ms`;
}

/** `gather pm-1 phases: model 5 ms, embeds 1 ms, render 4 ms, store 3 ms, crops 2 ms; manifest 2048 B` */
export function gatherPhaseLine({ call, phases, bytes }) {
  const ms = k => Math.round(phases[k] ?? 0);
  return `gather ${call} phases: model ${ms("model")} ms, embeds ${ms("embeds")} ms, render ${ms("render")} ms, ` +
    `store ${ms("store")} ms, crops ${ms("crops")} ms; manifest ${bytes} B`;
}

/**
 * `replace pm-1: 2 ok, 1 failed, 3 document(s) created, 4 prompt(s) left, 40 ms`; a dry run says
 * `replace pm-1 dry run: 2 ok, 1 failed, 4 prompt(s) left, 9 ms`. A call with no id prints `-`.
 */
export function replaceLogLine({ call, dryRun, ok, failed, created = 0, left, ms }) {
  const head = `replace ${call ?? "-"}${dryRun ? " dry run" : ""}`;
  const made = dryRun ? "" : ` ${created} document(s) created,`;
  return `${head}: ${ok} ok, ${failed} failed,${made} ${left} prompt(s) left, ${ms} ms`;
}
