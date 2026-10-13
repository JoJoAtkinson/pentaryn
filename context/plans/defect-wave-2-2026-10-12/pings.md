# Defect wave 2 (2026-10-12) — pings

**Read this when** you want the history of defect wave 2 for the `pentaryn-pings` module (what was wrong, what Joe ruled, what changed). History, not instructions — the use-doc is `foundry/module/pentaryn-pings/README.md`.

Branch `fix2/pings-2026-10-12`. Gate: `make foundry-pings-check` (84 tests, kit identical, conformance 100 %). All seven items hold; nothing reverted.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| pings-edge-1 | Two GM tabs: a Clear in one tab was undone by the other tab's next save, and each tab overwrote the other's pings | Recommendation taken (declared) | Each tab adds its pings to the shared log instead of overwriting it; a Clear in one tab sticks; a ping heard by both tabs is stored once | edf627b3 | `test/glue-two-gm.test.mjs` |
| pings-ext-1 | Uninstall unwrapped by marker, so a foreign wrapper on top could be removed or the patch doubled on reload | Recommendation taken (declared) | Uninstall undoes only its own patch; if another module wrapped on top, the capture stays and is still listed, and a reload reuses it instead of wrapping twice | 215e2263 | `test/patch.test.mjs`, `test/glue.test.mjs` |
| pings-rob-1 | A hot re-import in a running GM tab could lose pings not yet saved | Already fixed — pinned | Pings caught but not yet saved still get saved after a reload; an older log no longer overwrites them. Test + README pitfall added | 8a8c0fa2 | `test/glue-rerun.test.mjs` |
| pings-async-1 | A slow save could overlap the next save or a Clear | Already fixed — pinned | Saves on one tab run one after another; only one log entry is ever created | 5079266c | `test/glue-async.test.mjs` |
| pings-edge-2 | A failed save silently dropped the batch until the next ping | Recommendation taken (declared) | A failed save warns and retries once 250 ms later; if that fails too it warns again and the pings go out with the next ping | fb47e99e | `test/glue-async.test.mjs` |
| pings-maint-7 | Shared marker `__pentarynPatched`: another Pentaryn module's wrap stopped pings from installing its capture | Recommendation taken (declared) | Pings uses its own marker `__pentarynPingsPatched`, so it records pings regardless of other modules' wraps | 6e5b9696 | `test/glue-foreign-marker.test.mjs` |
| pings-rob-2 | README did not say what `recent()` does with 0, null, strings or negatives | Docs only (declared) | No play change. README states: `recent(0)`, `recent(null)`, `recent("x")` list every ping; `recent("2")` lists 2; a negative number drops the oldest | 8a3e2c97 | `test/core-meta.test.mjs` |

## Goldens changed

- `scripts/foundry/live-goldens/pings.js`: `patchedOnInstanceProto` now reads `__pentarynPingsPatched` (pings-maint-7).
- `foundry/adjustments.yml`: the handlePing entry's marker is `__pentarynPingsPatched`, and its `what` describes the own-handle uninstall (pings-ext-1, pings-maint-7).
- `api-manifest.mjs`: `clear()` doc now says it drops this tab's unsaved pings and another GM tab drops its own on seeing the change.

## Deploy

Shipped files changed in `pentaryn-pings` only (`.mjs` code; no module.json, esmodules, lang, styles or kit change) — a client reload is enough, no server restart.

## Live check after deploy

One GM tab only; all pings on a ZZ-prefixed scratch scene you create and delete afterwards.

- **pings-edge-1** — Ping twice, wait 1 s: `game.pentaryn.pings.all().length` is 2. Run `game.settings.set('pentaryn-pings','log',[])` (stands in for the other tab's clear), ping once, wait 1 s: `all()` returns exactly that one ping. Then `game.settings.set('pentaryn-pings','log',[...all records, {t:Date.now(),userId:'ZZ',userName:'ZZ',sceneId:null,sceneName:null,x:1,y:1}])`, ping again, wait 1 s: `all()` holds the ZZ record and the new ping. Finish with `game.pentaryn.pings.clear()`.
- **pings-ext-1** — `game.pentaryn.pings.describe().patches.length` is 1. Run `game.pentaryn.pings.uninstall()`, then `await import('/modules/pentaryn-pings/pings.mjs?v=2')`; a fresh `describe().patches.length` is 1, not 2. One ping yields one record in `recent(1)`.
- **pings-maint-7** — `game.pentaryn.pings.describe().patches[0].marker === '__pentarynPingsPatched'`; one ping still appears in `last()` after 1 s.
- **pings-rob-1, pings-async-1, pings-edge-2, pings-rob-2** — code only; covered by the node tests above (and by the edge-1 check for async-1).
