# Defect wave 2 (2026-10-12) — senses

**Read this when** you want the history of defect wave 2 for `pentaryn-senses` (what was fixed,
why, and how to check it live). History only; operate the module from its README.

Branch `fix2/senses-2026-10-12`. Gate `make foundry-senses-check`: 207 tests pass, vendored kit
identical, conformance 100 % (49/49). All changes are declared behaviour changes approved by Joe
(defect wave 2, 2026-10-12).

**Reverted once, then forward-fixed (FIX-3, 2026-10-13).** Run FIX-2 merged this branch into main
and reverted the merge (d26ef1db): senses-edge-4's `normalise()` handed Foundry's `LightData` the
shard item's own light flag, and `LightData` cleans its input in place, so the flag grew from 3
keys to all 15 defaults; `syncLight` then wrote 15 keys and their `animation: {type: null}` nulled
a doused torch's animation (an undeclared live golden diff). FIX-3 added a failing test with a
`LightData` that cleans in place (c0c95c7e), made `normalise()` hand it a deep copy (8d688ad0),
merged main (8b9cf59a) and re-applied the wave by reverting the revert (efaf50e8). Module shipped files changed: `.mjs`, README,
CHANGELOG only — no `module.json`, `lang/`, `styles/` or `lib/` changes, so a **reload** is enough.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| senses-ac-1 | Two GM tabs could both make a Light square and both whisper "Gone" | fix (recommendation) | One square per cast, one "Gone" whisper, old summon tokens removed once | de58b860 | light-two-tabs |
| senses-EXT-2 | Light prompt and card buttons built from separate lists | fix | Both come from one list; prompt keeps "Not now", card keeps "End light" | 232a56bd | light-actions |
| senses-EXT-4 | Which items get a Light activity was spread out | fix | One list decides; a new light source is one line | c0b861a1 | activity-profiles |
| senses-edge-4 | Hand-written shard light with capital colours / extra keys rewrote every sync | fix | Compared as Foundry stores it, so it's applied once and then left alone | ebafe41e | carried-normalise |
| senses-edge-4 (FIX-3) | edge-4 expanded the shard's light flag to every LightData default in memory: 15 keys written, a doused torch's animation nulled | fix (forward fix, recommendation) | The comparison works on a copy; the flag keeps its 3 keys, the write is exactly the profile's keys, a doused torch keeps its animation | c0c95c7e, 8d688ad0 | carried-normalise-shape |
| senses-edge-3 | Button tips rendered names as HTML | fix | Every senses tip shows names exactly as typed; screen readers get the same text | c106f537 | hud-tips, chain, glue-player, glue-second-gm |
| senses-R4 | `inspect(…, null)` / `resetSight(…, null)` threw | fix | null options behave like no options | 59fa33e4 | null-opts |
| senses-EXT-6 | Torch light/douse flag not declared in the manifest | fix | Declared; a test fails on any undeclared flag write | 6a2cb0e9 | api |
| senses-M11 | `syncAll` describe text wrong | fix | Says one Actor batch for prototypes, then one Token batch per scene | c9de77df | api |
| senses-EXT-11 | "On me" with no scene/token passed back the warning popup | fix | Warns, lights nothing, prompt reports a plain "no" | 23f27825 | light-prompt-return |
| senses-R5 | A failed carried sync at load skipped the Light sweep | fix | GM gets a "carried sync" console warning; map lights still refresh | a6a9de8e | glue-ready-errors |
| senses-ac-2 | Second GM saw a dead End light button | fix | Shows only to the item's owner or the active GM | 860abfa2 | hud-orphan-gm |
| senses-ac-3 | Torch setup saved one torch at a time | fix | One save per character / token / world list; same count returned | 66a13af6 | light-setup-batch |
| senses-EXT-9 | Hood on someone else's lantern failed silently | fix | Same "not yours" warning as cast/end/light | f0cdd77d | light-owner-warn |
| senses-M2 | Light reconcile was one long function | fix | Split into small named steps, same behaviour | 0a42e7ff | light-reconcile-split |
| senses-M6 | Module id copied through three files | fix | Comes from one place | b26b244f | core-module-reexport |
| senses-M9 | Light controls got actions they never used | fix | Bound only what they call; on me / pick a spot unchanged | 7645f04a | light-ui-bind, light-actions |
| senses-M10 | Chain and End-light HUD buttons built separately | fix | One shared builder, same look | 012effa2 | hud-dom |
| senses-R1 | Unlinked-token or compendium change cancelled the world actor's prototype light write | fix | Debounce keyed per actor; world actor's prototype and tokens still update; unlinked token change touches only that token | 8ce93bee | carried-edges |
| senses-R6 | Warnings hand-written instead of the kit logger | fix | Same console lines, through the shared logger | 9738888b | kit-log |
| senses-EXT-7 | Light source list could drift from docs | fix | Tests fail if a light source is missing from the profileFor doc or README table | 86697b72 | api |

## Goldens changed

`chain-hud`, `describe`, `light-card`, `light-cast-other-scene`, `light-cast-square`,
`light-gm-hooks`, `light-hostile`, `light-hud`, `light-onme`, `light-pick-cast`,
`light-reconcile-moved-gone`, `light-sheet`, `player-sheet-card`, `second-gm`, `setup-light`
(all under `foundry/module/pentaryn-senses/test/golden/`). Changes are the plain-text tooltip
attributes (edge-3), the two-tab claim path (ac-1), batched setup writes (ac-3), the onMe return
value (EXT-11) and describe() text (R4, EXT-6, EXT-9, M11).

## Live check after deploy

ZZ-prefixed scratch docs only; delete them afterwards. One GM tab. Code-only items (EXT-2,
EXT-4, R4, EXT-6, M11, EXT-11, R5, ac-2, EXT-9, M2, M6, M9, M10, R6, EXT-7) need no live check
beyond the module loading without console errors after a reload.

- **senses-ac-1**: give a ZZ caster Light on a ZZ scene and cast it on a square. Call
  `game.pentaryn.senses.light.sweep()` twice back to back; exactly one AmbientLight with the
  derived `_id` exists. Hand-delete it; the item's `lightCast` flag clears.
- **senses-edge-4**: ZZ actor with a ZZ shard item whose `flags.pentaryn-senses.light` has
  `color: '#FF0000'` plus an extra key. Call `game.pentaryn.senses.syncLight(actor)` twice; the
  second call returns 0.
- **senses-edge-4 (FIX-3)**: ZZ actor with a ZZ shard item whose `flags.pentaryn-senses.light` is
  exactly `{bright: 0, dim: 15, color: '#8844ff'}`, plus a ZZ Torch (dnd5e `torch` identifier). Light
  the torch; the ZZ actor's `prototypeToken.light.animation.type` is `torch`. Douse it;
  `syncLight` writes only `bright`, `dim`, `color` (the shard item's flag still has exactly those
  3 keys) and `prototypeToken.light.animation.type` is still `torch`. Re-run the live goldens:
  the doused-torch row matches the pre-FIX-2 rollback copy (no 15-key write, animation not null).
- **senses-edge-3**: name a ZZ token `Z & <b>Q</b>`, target it, open the HUD on a second ZZ token;
  the "Chain to" tip shows the literal name, not bold. A ZZ actor with two lit torches shows the
  Outshone tip with a literal `&`.
- **senses-ac-3**: ZZ actor with two Torches lacking the Light activity plus one ZZ world Torch.
  `game.pentaryn.senses.light.setup()` returns 3 and each has `psLightToggle000`; a second call
  returns 0.
- **senses-R1**: ZZ actor with a torch and one unlinked ZZ token of it on a ZZ scene. Light the
  token's own torch, then the world actor's torch within 250 ms; both the `prototypeToken` light
  and the unlinked token's light come on.
