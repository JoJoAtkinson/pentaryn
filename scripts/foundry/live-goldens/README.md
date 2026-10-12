# Live goldens

**Read this when:** writing, running or diffing a live golden — a `<module>.js` here that runs in
the one GM tab through the foundry `eval-js` MCP tool and returns `{ module, env?, golden, timings,
cleanup }` as a JSON string (the wave-1 goldens — names, pings, cursors, importer, ties, prompts —
carry no top-level `env`). Which goldens a wave runs, in what order, and what may differ: that
wave's live plan in `context/plans/addon-blueprint-2026-10/`.

## Diffing

```sh
node scripts/foundry/live-goldens/diff.mjs before.json after.json
node scripts/foundry/live-goldens/diff.mjs --declared declared.txt before.json after.json
```

Exit 0 when `golden.shared` is equal (or every difference is declared) and both cleanups are clean,
1 otherwise, 2 on bad input. `--declared` takes one path glob per line (`#` comments) or a JSON
array: `*` stays inside one segment, `**` crosses segments, `[` `]` are literal — so
`stash.chest[*]`, `stash.chest[*].*` and `purseHome` each cover only what they spell. A glob that
matched nothing is named. Keep the globs to what the wave's plan declares.

**Cleanup keys.** `diff.mjs` judges a `cleanup` by its top-level key names only. Report leftovers
as `<thing>Left: <count>` (fails above 0) and restores as `<thing>Restored: <boolean>` (fails when
`false`); a top-level string containing `REFUSED` or `NOT ` also fails. Any other key — nested
objects included — is printed but never judged.

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
