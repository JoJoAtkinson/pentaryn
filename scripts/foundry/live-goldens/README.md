# Live goldens

**Read this when:** writing, running or diffing a live golden — a `<module>.js` here that runs in
the one GM tab through the foundry `eval-js` MCP tool and returns `{ module, env?, golden, timings,
cleanup }` as a JSON string (the wave-1 goldens — names, pings, cursors, importer, ties, prompts —
carry no top-level `env`). Which goldens a wave runs, in what order, and what may differ: that
wave's live plan in `context/plans/addon-blueprint-2026-10/`.

Run one golden at a time per tab: a golden swaps `ui.notifications` / `console` / `fetch` for its
duration and counts ZZ documents world-wide, so two overlapping runs report each other's scratch
and can leave a spy installed.

## Diffing

```sh
node scripts/foundry/live-goldens/diff.mjs before.json after.json
node scripts/foundry/live-goldens/diff.mjs --declared declared.txt before.json after.json
```

Exit 0 when `golden.shared` is equal (or every difference is declared) and both cleanups are clean,
1 otherwise, 2 on bad input. A run that `skipped` (either side) prints `skipped: <reason>` and
exits 2, as does a `golden` that is not an object — a skip never diffs as identical.
`--declared` takes one path glob per line (`#` comments) or a JSON array: `*` stays inside one segment, `**` crosses segments, `[` `]` are literal — so
`stash.chest[*]`, `stash.chest[*].*` and `purseHome` each cover only what they spell. A glob that
matched nothing is named. Keep the globs to what the wave's plan declares.

**Cleanup keys.** `diff.mjs` judges a `cleanup` by its top-level key names only. Report leftovers
as `<thing>Left: <count>` (fails above 0) and restores as `<thing>Restored: <boolean>` (fails when
`false`); a top-level string containing `REFUSED` or `NOT ` also fails. Any other key — nested
objects included — is printed but never judged. Every awaited step in a `finally` runs through the
preamble's `safely(name, fn)`: a refused delete or restore is recorded as
`<name>CleanupError: "NOT done: <why>"` and the next step still runs, so one failure never leaves
the remaining ZZ documents behind (`scripts/tests/test_live_goldens_cleanup_safely.py`). Delete
each document type in one batch — collect the ids still in the world, then one
`Actor.deleteDocuments(ids)` / `ChatMessage.deleteDocuments(ids)` / `JournalEntry.deleteDocuments(ids)`
inside one `safely` step — never one awaited `doc.delete()` per id
(`scripts/tests/test_live_goldens_cleanup_batch.py`); a refused batch is reported whole. Add to
`out.cleanup` in `finally` (`Object.assign`), never replace it, or those keys are lost.

## Known run-to-run noise

Two runs of the same code can differ here; it is not a regression.

| Golden | Path | Why | Status |
|---|---|---|---|
| pings | `ping.settingArrayReplacedByFlush` | true in one run only — ring state / cache timing, not code (W5L) | **live noise** |
| senses | `inspectCarrier.lightSpells[0].litBy[0]`, `lightStatus.litBy[0].id` | the scratch AmbientLight id | normalised in the golden (W4L follow-up); seen only against an older golden |
| importer | `root.keysInPublishOrder` | other modules' publish order | gone: the golden sorts `root.keys`, `publishOrder` sits outside `golden` (W4L follow-up) |

## No `requestAnimationFrame` or timer waits

The GM tab running a golden is often hidden or the screen locked: the browser stops
`requestAnimationFrame` and clamps `setTimeout`/`setInterval` to a second or more, so a wait on
either decides nothing and timings stretch. Await the document operation or hook itself; when a
golden must wait out wall time (a module's own debounce or claim window), use the `tick()` /
`sleep()` / `settle()` helpers the goldens already carry (a `MessageChannel` macrotask plus
`performance.now()`, not throttled in a hidden tab). The same holds for one-off probes run by
`eval-js`. Copy the helper preamble from an existing golden; only `DROP` and `settle` may differ
(`scripts/tests/test_live_goldens_preamble.py` checks this). `settle()` comes in two forms: most
goldens return as soon as `pred()` holds; `creatures` and `senses` then sleep a further 1.2 s for a
module that debounces a second write after the first. Copy the form that matches the module.

The toast spy (`toasts`, `spied`, `takeToasts`) comes in two forms as well: `transform` records a
toast raised with `{ localize: true }` as its localised text, while `attunement`, `dropbin`,
`journal` and `riders` record the raw message (their recorded toasts sit in their goldens, so they
stay). New goldens copy transform's toast spy; `names` keeps its own info-only spy. The same
preamble test pins these.
