---
title: Wave 4 — the gated live phase (goldens, deploy, probes, bridge reads, rollback)
status: plan
last_modified: 2026-10-12
tags: [foundry, modules, blueprint, plan, migration, live, wave4]
---

# Wave 4 — the gated live phase

**Read this when:** Joe has said **go** for the wave-4 live session (riders, aoe, transform,
combat), and you are running it or reviewing how it ran. **Not this file:** what each module
changed → [`wave-4-report.md`](wave-4-report.md) and each `migrate-pentaryn-<m>.md` §Result · the
shape this plan copies → [`wave-2-live-plan.md`](wave-2-live-plan.md) and wave 3's live plan (on
`main`) · how waves 2 and 3 actually went live → [`../merge-and-go-live-2026-10-11.md`](../merge-and-go-live-2026-10-11.md)
(the copy on `main` has the W3L section).

Nothing here has run. Written in the code phase (2026-10-12) while other lanes held Foundry.
**Do not start any step until Joe says go**, and never while a play session is on.

**What is different from wave 3.**
- **The branch does not contain `main`.** `migrate/wave-4` starts at `wave-4-base` (`a5a1a906`)
  and never merged wave 3, which is now on `main` (`880de701`) and deployed. So **only the four
  wave-4 module folders are synced from `WT`.** Syncing any other module from `WT` would roll
  wave 3 back (portals, creatures, senses, prompts, ties, lookup, importer, feedback). The usual
  "every module whose tree differs from its stamp" rule does not apply here (§1). W4-L1 (§12)
  is the choice to merge `main` into the branch first instead.
- **No `module.json` changes.** `git diff a5a1a906..HEAD -- 'foundry/module/*/module.json'` is
  empty. Every manifest edit is a row in [`wave7-restart-batch.md`](wave7-restart-batch.md):
  the version bumps (riders 0.3.0, aoe 0.4.0, transform 0.4.0, combat 0.3.0), `flags.pentaryn`,
  riders' `recommends`, and the D7 `styles` entries. Versions stay riders 0.2.0, aoe 0.3.1,
  transform 0.3.3, combat 0.2.5. Each module's `VERSION` constant still equals its manifest. The
  new API rows say `since: 0.4.0`/`0.3.0`, which is documentation only. So there is **no Foundry
  restart**, only one GM tab reload. The `.pentaryn-sync.json` stamp tells before from after,
  not the version.
- **The fork is unchanged.** `foundry-vtt-mcp-wave4-wt` has no commits past `origin/pentaryn`.
  So there is no server build, no `kill -9` and no bridge module copy. `pentaryn-read` finds the
  four namespaces at run time. But the deployed tool description still names "combat, riders,
  transform, aoe" as eval-js only (W4-L3).
- **The Mac boots local.** Every start is `FROM=local` and the tunnel stays down. No `vtt-*`
  target is used, and no snapshot is restored unless Joe says so.

## 0. Names, paths, roles

| Name | Path / value |
|---|---|
| `WT` | `/Users/joe/Documents/GitHub/pentaryn-wave4-wt` (branch `migrate/wave-4`). **Only the four module syncs** run here (`make -C $WT foundry-<m>-sync`: the Makefile's `ROOT` is the worktree, so the sync copies the wave-4 tree and stamps its commit). It also holds the golden scripts and `diff.mjs` |
| `LIVE` | `/Users/joe/Documents/GitHub/pentaryn` (branch `main`). **Lifecycle targets run here**: `foundry-down`, `foundry-up FROM=local`, `foundry-backup`, `login`, `foundry-bridge-status`, `vtt-status`, `tunnel-down`. That keeps one ops log and one `.state/`. The action logs are `$LIVE/foundry/logs/`, read only. Never `git stash`, `reset --hard`, `checkout -- .` or `clean` here: the modified `foundry/logs/*.jsonl` files are the bridge's live logs |
| `FORK` | `/Users/joe/Documents/GitHub/foundry-vtt-mcp`, the live fork checkout (branch `pentaryn`, `2fd6eb0` after W3L). Not touched by this plan unless W4-L3 is taken |
| `DATA` | `~/Library/Application Support/FoundryVTT/Data` (modules in `$DATA/modules/<id>`). Server logs: `~/Library/Application Support/FoundryVTT/Logs/` |
| `OUT` | `$WT/.state/live-goldens/wave4/` (git-ignored): `deployed-before.json`, `probes-before.json`, `before/<m>.run{1,2}.json`, `after/<m>.run{1,2}.json`, `probes.json`, `reads.md` |
| `RB` | `$WT/.state/live-rollback/wave4/`: `<id>/`, a byte copy of each of the four deployed module folders taken before the deploy, and `world/`, a copy of `Data/worlds/pentaryn` and `Config` taken while Foundry is down |

Scripts: [`scripts/foundry/live-goldens/`](../../../scripts/foundry/live-goldens/).
- **New in wave 4:** `riders.js`, `aoe.js`, `combat.js` and `transform.js`. They use the wave-2
  split into `golden.shared` and `golden.declared`. Each header says what it calls and what it
  never calls. `scripts/tests/test_live_goldens_wave4.py` proves offline that each body parses,
  returns a JSON string, reports a missing namespace, skips when its precondition fails, and
  restores its spies.
- **Diff tool:** `diff.mjs`.

Each golden is one `eval-js` call:
- `script` is the file's text;
- `timeoutMs` is 60000 (the eval-js cap; W3L found the 90000 in wave 3's plan was over it);
- `purpose` is `"wave-4 live golden <before|after> <m> run <k>"`.

The call returns a JSON **string**. Save it to `OUT` exactly as returned.

**Who runs what.**
- **S** (Sonnet) runs the mechanical steps: fixed commands, eval-js scripts, and diffs against a stated expectation.
- **O** (Opus) runs the steps that need judgement: every red diagnosis, the fix loop, rollbacks, and W4-L3 if taken.
- **J** (Joe) does the steps that need a decision, his eyes at the table, or a Claude Code `/mcp` reconnect.

When an S step does not match its expectation, S **stops and hands it to O**. S never improvises.

## 1. The deploy set

Exactly these four, whatever the stamps say about other modules:

| Module | Deployed (main) | What changed (wave 4) | Golden | Notes |
|---|---|---|---|---|
| riders | 0.2.0 | migration S2–S9 (split into `api`, `shapes`, `battle-medic`, `concentration`, `damage-riders`, … and `core/`). Declared: S6 frozen API, W2-K1, D-r1 relay through `guarded`, -12 legacy refs, -23, -27 audit lines, parseFormula `@`, -41 claim-first relay, once-per-casting guard reading dnd5e's message registry (`79e29f8d`) | `riders.js` | the relay `pentaryn-riders.battleMedic` stays a hand `CONFIG.queries` entry (W4-R4) |
| aoe | 0.3.1 | migration (26 commits). Declared: D-A1, D-A2, D-A3 + W2-K1, D-A4, D-A6 (fixed handle actor id for a **new** world; this world keeps its actor, found by flag), D-A7, -6, -9, two 8.5 batches; 8.6 `careful.mjs` | `aoe.js` | needs the world's "Area handle" actor (the golden skips without it) |
| transform | 0.3.3 | migration (28 commits) plus argon-kit adoption and the size split. Declared T-D1…T-D8, -13 step 3 (asks combat's `coversMultiattack`), -23, C59, §5.8 | `transform.js` | keep the play-test fixes PT3-3/4/6/7 (in the tree since 0.3.3) |
| combat | 0.2.5 | migration S2–S14 and the §4 fixes, argon-kit first (`87be8cd4`), the `turnflow/` and `hud/` splits. Declared: B2, D-c1…D-c4, -22, -38, W4-C1 fix, D7 `@import` (`24e961a0`) | `combat.js` | keep PT1-6 |

The kit (`foundry/lib` 1.0.2) is vendored per module, so the four copies travel with their
folders. Combat and transform add `lib/argon-kit.mjs` and `lib/argon-tooltip.css`, and their CSS
`@import`s the latter. Riders does not vendor it yet (W4-R9 / W7). The sync replaces the whole
folder (`rmtree` + `copytree`), so files removed by the splits (aoe `hooks.mjs`, combat
`riders.mjs` and `turnflow.mjs`, transform `WILDSHAPE-DESIGN.md`) go too.

**Cross-module pairs** (they matter for a partial rollback, §9):
- combat ↔ transform: transform asks `apiOf("pentaryn-combat")?.coversMultiattack(actor)` (-13
  step 3). Both stylesheets load the same tooltip rules.
- combat ↔ riders: `test_rider_tables.py` keeps TURN_RIDERS and riders' RULES disjoint.
- combat ↔ aoe: combat still reads `pentaryn-aoe.autoDamageOnHit` with `game.settings.get`
  (W4-C3). Its `shapes.isAoeHandle` is pinned to aoe's handle oracle (`09585ef7`).

## 2. Preconditions (step 0) — **S**

1. Joe said go. No play session is running, and **no player is connected**. Check that the tunnel
   is down (`make -C $LIVE vtt-status`). If it is up, run `make -C $LIVE tunnel-down` and record
   that. Then check that `get-world-info` shows only the Gamemaster as active.
2. **One GM tab**, the bridge's. Close every other Foundry tab. Two GM tabs double the work in
   riders' relay (-41), transform's automatic endings (W4-T1) and aoe's handle create.
3. **No started combat** (`game.combats.filter(c => c.started).length === 0`). The combat golden
   reads the turn key and skips when a combat runs. Record any unstarted combats. Leave them alone.
4. **The upload queue is empty**: no `*.job.json` in `.pentaryn-tmp/`, and `make -C $LIVE foundry-cloud`
   shows no `upload` line. If a job is waiting, follow the overnight plan §5.1.
5. **`$WT` is clean and green.**
   - `git status --short` shows only untracked `.venv` (and `foundry/logs/**` if any).
   - `git diff --quiet a5a1a906 HEAD -- 'foundry/module/*/module.json'` holds (no manifest edit).
   - `node foundry/module/pentaryn-{riders,aoe,transform,combat}/test/run.mjs` each exit 0.
   - `make -C $WT foundry-riders-check foundry-aoe-check foundry-transform-check foundry-combat-check`
     are green (static gates only), and `make -C $WT foundry-lib-check` passes.
   - `./.venv/bin/python -m pytest -q scripts/tests/test_live_goldens_wave4.py scripts/tests/test_rider_tables.py scripts/tests/test_aoe_handle_contract.py` passes.

   Note `git -C $WT rev-parse --short HEAD` as the deploy commit.
6. **No scratch documents.** One eval-js counts names starting `"ZZ "` across `{actors, scenes,
   journal, items, combats}` and chat messages whose speaker alias starts `"ZZ "`. Every count
   must be 0.
7. **The aoe handle actor exists**: `game.actors.filter(a => a.flags?.["pentaryn-aoe"]?.handleActor)`
   has exactly one entry. Record its id. On this world it is not `pentarynAoeHndl0`, and D-A6
   keeps it.
8. Record what is deployed in `OUT/deployed-before.json`:
   - for each `pentaryn-*` and `foundry-mcp-bridge` folder in `$DATA/modules`, the `module.json`
     `version` and the whole `.pentaryn-sync.json`. The four wave-4 modules should carry stamps
     whose code equals `a5a1a906` for their folders: `git -C $WT diff --quiet <stamp.git> a5a1a906 -- foundry/module/pentaryn-<m>`. If one does not, stop and hand it to O. Something other than `main` was deployed;
   - `git -C $FORK rev-parse HEAD` and `git -C $FORK branch --show-current`;
   - the start time of the running `backend.js`, from `make -C $LIVE foundry-bridge-status`.

   Then the byte copies, one per wave-4 module:
   `mkdir -p $RB && rsync -a "$DATA/modules/pentaryn-<m>/" "$RB/pentaryn-<m>/"`.

## 3. Step a — backup, then every "before" golden on the deployed code

1. **S**, all in `$LIVE`:
   1. `make foundry-down`.
   2. Rung-1 copy: `rsync -a "$DATA/worlds/pentaryn/" "$RB/world/pentaryn/"` and
      `rsync -a "$DATA/../Config/" "$RB/world/Config/"` (about 45 MB, taken while Foundry is down).
   3. `make foundry-backup REASON=wave4-live`. It refuses while Foundry runs. Note the snapshot name it prints.
   4. `PENTARYN_NONINTERACTIVE=1 make foundry-up FROM=local`. **Never** `FROM=latest`, and never a `-boss` snapshot.
   5. `make login NO_OPEN=1 USER_NAME=Gamemaster WORLD=pentaryn`, then point the one controlled
      Chrome tab at the printed URL. `WORLD` matters: a login without it opened space-journey on 2026-10-11.

   Probe: `game.world.id === "pentaryn"`. The first eval-js after a start may answer "not
   connected". If it does, retry once.
2. **S** Run the §5 boot probe once on the deployed code and save it to `OUT/probes-before.json`.
   This is the baseline. The four wave-4 modules show `describe: "absent"` and are not frozen.
   Every wave-2/3 module shows its migrated surface.
3. **S** Run each golden **twice** on the deployed code, saving `OUT/before/<m>.run1.json` and `run2.json`,
   in this order: aoe, riders, combat, transform.
   - After each run, read the output:
     - `skipped`: aoe means there is no handle actor, or this tab is not the active GM. combat means a combat is running. Stop and hand it to O.
     - `golden.shared.error` on the **before** side is a script fault, not a module fault. Typical causes are a dnd5e data shape the scratch item does not validate, or a missing compendium-free default. O fixes the script (§10.6) before anything is deployed.
     - `cleanup`: stop on any of these: `…Left > 0`, `settingsRestored: false`, `toastsRestored: false`, `userFlagsRestored: false`. Clean up by hand from the cleanup fields, then hand to O.
   - Then `node $WT/scripts/foundry/live-goldens/diff.mjs OUT/before/<m>.run1.json OUT/before/<m>.run2.json` must say
     `shared — identical`. A golden that differs from itself is state-dependent. O fixes the
     script before anything is deployed (§10.6).
   - Check `aoe`'s `handlesSettled` and the `concentrationCleanup.*Gone` flags. A `false` means the
     module's unawaited hook work did not land within 6 s. On a hidden tab that is J20. Bring the
     tab to the front and rerun once before handing it to O.

## 4. Step b — deploy

1. **S** Module syncs, exactly four:
   `make -C $WT foundry-riders-sync`, `…-aoe-sync`, `…-transform-sync`, `…-combat-sync`. Each runs
   the module's check gates first. A red gate stops that module, which stays at its `RB` copy.
   Hand it to O. **Never sync any other module from `WT`** (§1). Never sync walls.
2. **S** No `module.json` may change. For each synced module,
   `diff "$RB/pentaryn-<m>/module.json" "$DATA/modules/pentaryn-<m>/module.json"` must print
   nothing. If one differs, the branch has picked up a Wave 7 row. Stop and hand it to O. Either
   that module goes back to its `RB` copy, or Joe takes the restart. The restart is the Wave 7
   restart batch's own session: [`wave7-restart-batch.md`](wave7-restart-batch.md), `make -C $LIVE foundry-down`,
   `PENTARYN_NONINTERACTIVE=1 make -C $LIVE foundry-up FROM=local`, `make -C $LIVE login … WORLD=pentaryn`.
   It is not part of this plan.
3. **No fork step.** The fork has nothing to deploy. If W4-L3 was taken (§12), O does it here as
   wave 3 did. In `FORK`: `git status --short` empty → `git switch --detach <the W4-L3 commit's
   branch>` → `npm ci`, `npm run build:shared`, both typechecks, both vitest suites,
   `npm run build:server`, `scripts/fork-footprint.sh`. Any red means `git switch pentaryn`,
   rebuild, and the modules go on alone. Then `make -C $LIVE foundry-bridge-status` and
   `kill -9 <backend.js pid>`: the **backend only**, never with a plain `kill`. There is no
   `build:foundry` and no bridge-module copy: a description change is server side only.
4. **S** **One GM tab reload**: navigate the tab to the same URL. That loads every synced
   module's new code, because init/setup/ready run again. If the §8 tooltip check later shows old
   styling, the browser served a cached `combat.css` or `transform.css`. Do one cache-bypassing
   reload (Cmd-Shift-R), not a restart. The first eval-js after the reload may say "not
   connected". If it does, retry once.
5. **J** About the wrapper (the **CLI restart lesson**, [`../../foundry/README.md`](../../foundry/README.md)
   "Restarting only the broker", [`../../foundry/prompt-markers.md`](../../foundry/prompt-markers.md)):
   - **If the session's tools vanished,** the wrapper (`index.js`) died. That happens after a
     plain `kill`, or if anyone killed the server rather than the backend. Only `/mcp` →
     reconnect `foundry`, or a Claude Code restart, brings the tools back. That is Joe's action in
     the main session. A subagent cannot reconnect: it reports and stops.
   - **If the tools are still there** (the expected case, since nothing was killed), nothing is
     needed. `pentaryn-read` lists namespaces at run time, so `riders`, `aoe`, `transform` and
     `combat` answer as soon as the reload publishes their `describe()`.
   - If W4-L3 ran, wrappers built since 2026-10-10 announce the new description within about 30 s
     (`tools/list_changed`). An older wrapper keeps the old text until `/mcp`. Steps c–e do not
     need the new text.

## 5. Step c — boot probes — **S**

One eval-js (`purpose: "wave-4 boot probe"`), saved to `OUT/probes.json` (and in §3.2 to
`OUT/probes-before.json`):

```js
const want = { riders: ["pentaryn-riders", "riders"], aoe: ["pentaryn-aoe", "aoe"],
  transform: ["pentaryn-transform", "transform"], combat: ["pentaryn-combat", "combat"],
  portals: ["pentaryn-portals", "portals"], creatures: ["pentaryn-creatures", "creatures"],
  senses: ["pentaryn-senses", "senses"], prompts: ["pentaryn-prompts", "prompts"], ties: ["pentaryn-ties", "ties"],
  lookup: ["pentaryn-lookup", "rules"], movement: ["pentaryn-movement", "movement"], attunement: ["pentaryn-attunement", "attunement"],
  journal: ["pentaryn-journal", "journal"], dropbin: ["pentaryn-dropbin", "dropbin"], names: ["pentaryn-names", "names"],
  pings: ["pentaryn-pings", "pings"], cursors: ["pentaryn-cursors", "cursors"], importer: ["pentaryn-importer", "importer"],
  feedback: ["pentaryn-feedback", "feedback"] };
const out = { rootKeys: Object.keys(game.pentaryn ?? {}).sort(), rootFrozen: Object.isFrozen(game.pentaryn),
  chainAlias: game.pentaryn?.chain === undefined ? "absent" : game.pentaryn.chain === game.pentaryn?.senses?.chain ? "same" : "different",
  ttRules: 0 };
// Foundry 14 nests module CSS inside @import/@layer, so a top-level cssRules scan is always
// false (W4L). Walk every nested sheet and count the .pentaryn-tt rules instead.
const walkTT = list => { for (const r of list) {
  if (r.styleSheet) { try { walkTT(r.styleSheet.cssRules); } catch {} continue; }
  if (r.cssRules && !(r instanceof CSSStyleRule)) { walkTT(r.cssRules); continue; }
  if (r.selectorText?.includes(".pentaryn-tt")) out.ttRules++;
} };
for (const s of document.styleSheets) { try { walkTT(s.cssRules); } catch {} }
for (const [m, [id, ns]] of Object.entries(want)) {
  const mod = game.modules.get(id), api = game.pentaryn?.[ns], r = { active: !!mod?.active, manifest: mod?.version ?? null };
  out[m] = r;
  if (!r.active) continue;
  try {
    r.ns = !!api; r.moduleApi = mod.api === api ? "same" : typeof mod.api;
    if (typeof api?.describe !== "function") { r.describe = "absent"; r.frozen = Object.isFrozen(api); continue; }
    const d = api.describe(), get = p => p.split(".").reduce((o, k) => o?.[k], api);
    r.version = api.version; r.versionMatches = api.version === mod.version; r.contract = api.contract;
    r.namespace = d.namespace; r.frozen = Object.isFrozen(api); r.rows = (d.methods ?? []).length;
    r.notFunctions = (d.methods ?? []).filter(x => typeof get(x.path) !== "function").map(x => x.path);
    if (typeof api.selftest === "function") {
      const s = await api.selftest();
      r.selftest = { ok: !!s?.ok, failed: (s?.checks ?? []).filter(c => !c.ok).map(c => `${c.label}: ${c.detail ?? ""}`) };
    }
  } catch (e) { r.error = String(e?.message ?? e); }
}
return JSON.stringify(out);
```

**Pass, per wave-4 module.** Each must show:
- `active`, `moduleApi: "same"`, `versionMatches: true` (riders 0.2.0, aoe 0.3.1, transform 0.3.3, combat 0.2.5), `frozen: true` and `notFunctions: []`;
- `namespace` equal to the `ns` above, and `contract: "pentaryn-<m>/api@1"`;
- `rows`: riders 13, aoe 24, transform 13, combat 25. These are the paths in each module's `test/golden/describe.json` at the deploy commit;
- `selftest.ok: true` for riders, transform and combat. aoe has no `selftest`.

**Every other module** must match `OUT/probes-before.json` exactly. Their code did not change, so
any difference is a red.

**Whole world:** `rootFrozen: false` (J10), and `ttRules > 0` on both sides (W4L measured 22
after). Before, the rules come from transform.css. After, they come from both stylesheets'
`@import`. Do not probe the argon-kit with `document.scripts`: an ES-module import never appears
there, so an `argonKitScripts`-style check is always empty (W4L). The kit's presence is proved by
`selftest` and `describe`.

**"No console errors."** The boot console cannot be read (J21). This check rests on three things:
- this probe;
- the three `selftest`s;
- the newest file in `~/Library/Application Support/FoundryVTT/Logs/` since the reload: no
  `error` or `Error` line naming a `pentaryn-*` module or `foundry-mcp-bridge`.

Any red probe goes to O (§10).

## 6. Step d — "after" goldens, diffs and timings

1. **S** Run the same scripts, twice each, saving to `OUT/after/<m>.run{1,2}.json`. Read
   `cleanup` and the settle flags as in §3.3.
2. **S** For each module, run
   `node $WT/scripts/foundry/live-goldens/diff.mjs OUT/before/<m>.run1.json OUT/after/<m>.run1.json`.
   Exit 0 means shared is identical and nothing was left behind. Then check every `declared`
   path against the table below. A declared difference that is **not** in the table counts as a
   shared one. Any red goes to O (§10).
3. **S** Timings come from run 2 of each side (`diff.mjs …run2.json …run2.json`, timings section).
   - **Flag a call** when after/before > 1.5 **and** the before median is ≥ 0.05 ms, or when it is ≥ 5 ms slower.
   - **Rerun once before flagging.** The GM tab is hidden (J20), so rerun that golden once first.
   - **A flag that survives** goes to O as a performance finding, not a stop.

| Module | Declared differences expected (before → after) | Timing expectation |
|---|---|---|
| riders | `surface.keys` gains the kit members (`contract describe settings trace uninstall version`) and `inspect selftest arcaneRecovery`. `moduleApi` `"undefined"` → `"same"`. `frozen` false → true (S6). `contract` null → `"pentaryn-riders/api@1"`. `describe` `"absent"` → 13 paths, four patches, the one query. `added.*` → `"function"`. `rulesFrozen` may stay true. `coreFrozen` false → true. `coreSets` may change. `previewAtArgument` `["1d8xmin2@mod=8", "1d8x@mod=8 + 2d6min2"]` → `["1d8x@mod=8", "1d8x@mod=8 + 2d6min2"]` (parseFormula `@`). `legacyRefs`: `featuresByName`, `featuresById`, `reportByName` `[]` → the caster's rows (the same as shared `featuresOf`/`report`), `hdPoolsByUuid` `[]` → the pools, `reportMiss` `[]` → `"null"` (-12). `inspect`, `inspectMiss` (`NOT_FOUND` throw), `selftest` (`ok: true`) `"absent"` → values | `featuresOf`, `hdPools`, `preview`, `report` within noise. The legacy wrapper adds one type check per call |
| aoe | `surface.keys` gains the kit members and the 0.4.0 rows (`isHandle inspect summary resolution latestResolution`). `moduleApi` → `"same"`. `frozen` → true. `contract` → `"pentaryn-aoe/api@1"`. `describe` → 24 paths, 17 settings (D-A3, W2-K1). `hookNames` may change order or names where the splits moved a registration (the count is pinned offline by `golden/hooks.json`; O reads any change against it). `added`: `isHandleToken`/`isHandleActor` → true, `isHandleCaster` → false, `inspectHandle` → `{token, actor, isHandle: true, region: <burstRegion>, handleActor: true, careful: null}`, `inspectCaster` → `isHandle: false`, `summaryNull`/`resolutionNull`/`latestOnScene` → `"null"` | `areasFor`, `spellAreas`, `handleFor`, `setting` within noise. `sweepClean` within noise (8.5 batches only the writes, and a clean scene writes nothing) |
| transform | `surface.keys` gains the kit members and `inspect selftest starry`. `moduleApi` → `"same"`. `frozen` → true (T-D1, W2-K1). `contract` → `"pentaryn-transform/api@1"`. `describe` → 13 paths, one patch. `starryKeys` and `starry` are **unchanged**: both were already present on the deployed 0.3.3 (`active assume constellation end`; `{active: null, constellation: "null"}`), so the earlier "absent → …" row was stale (W4L). `inspect` → plain JSON for the druid (`shifted: false`, `form: null`, the Wild Shape uses). `inspectMiss` → a `NOT_FOUND` throw. `selftest` → `ok: true`. `refs` may stay identical (legacy rows take Documents). `toasts` in declared: none expected | `forms` may drop (-23, one resolve per profile). `wildShapeActivity`, `original`, `isRevertItem` within noise |
| combat | `surface.keys` gains the kit members and `inspect selftest coversMultiattack`. `moduleApi` → `"same"`. `frozen` → true. `contract` → `"pentaryn-combat/api@1"`. `describe` → 25 paths, seven events (each with its `pentarynCombat.*` legacy name until 0.4.0), eight patches, 30 settings. `coreKeys` changes: W4L measured 81 → 95 (the `turnflow/` and `hud/` splits add exports; S3 dropped dead ones). `refs.planNoActor` TypeError → `"null"` (D-c2). `planByName`/`planByUuid`/`countByName`/`turnByName`/`weaponsByName` TypeError or a wrong answer → the same values as shared `plan`/`count`/`turn`/`weapons`. `multiattackMiss` → `"null"`. `inspect` → plain JSON with `inCombat: false`, `isOwnTurn: true`, depth ≤ 4. `inspectMiss` → `NOT_FOUND`. `coversMultiattack` → the Multiattack item's id tag or `"null"` (null when the fullAttack or multiattack setting is off). `selftest` → `ok: true` | `weapons`, `count`, `multiattack`, `plan`, `turn` within noise |

## 7. Step e — `pentaryn-read` / `pentaryn-write` on the new namespaces — **S**

Make each call once. Record the answer and its log line in `OUT/reads.md`. Log lines are in
`$LIVE/foundry/logs/mcp-2026-10.jsonl`; read them with `tail -n 5` only.

First, one eval-js (`purpose: "wave-4 reads: scratch reader"`) creates the scratch target and
saves its name and id in `reads.md`. It is a ZZ npc, never a real PC (W3L follow-up):
`Actor.create({name: "ZZ Wave4 Reader", type: "npc"})`, then one weapon with an attack activity
and a `Multiattack` feat ("makes two [[/item .<weapon id>]] attacks"), created one at a time. It is
deleted in §9.

**Never call** these through the bridge: riders `arcaneRecovery` (a dialog) and `battleMedic`;
aoe `activePlacement` while the GM is placing; any `uninstall`; transform `starry.assume`/`end`;
combat `fullAttack`, `followUp`, `rollRider`.

| # | Call | Expect |
|---|---|---|
| 1 | `pentaryn-read {ns:"*", path:"describe"}` | the root lists `riders aoe transform combat` beside the wave-2/3 namespaces; not walls |
| 2 | `pentaryn-read {ns:"<m>", path:"describe"}` for each of the four | `contract` and row count as §5, the same paths as the module's `test/golden/describe.json` at the deploy commit |
| 3 | `pentaryn-read {ns:"riders", path:"selftest"}`, `{ns:"transform", …}`, `{ns:"combat", …}` | `ok: true` each |
| 4 | `pentaryn-read {ns:"*", path:"inspect", ref:"ZZ Wave4 Reader"}` | one entry per namespace with an `inspect`. The four new ones are plain JSON, not `[max depth]`, with no throw |
| 5 | riders: `{ns:"riders", path:"inspect", ref:"ZZ Wave4 Reader"}`, `{ns:"riders", path:"report", opts:{actor:"ZZ Wave4 Reader"}}`, `{ns:"riders", path:"hdPools", opts:{actor:"ZZ Wave4 Reader"}}` | inspect `{actor, rows: [], hd, settings, concentrationSummons: []}`. report `[]` (no rider features). hdPools: one NPC pool (-12: a name resolves) |
| 6 | aoe: `{ns:"aoe", path:"setting", opts:{key:"handleTokens"}}`, `{ns:"aoe", path:"hookIds"}`, `{ns:"aoe", path:"latestResolution", opts:{sceneId:"current"}}`, `{ns:"aoe", path:"inspect", ref:"<the handle actor's id>"}` | `true` (or the world's value); the hook list; the newest tray on the viewed scene or `null`; `{actor, isHandle: true, handleActor: true, …}` |
| 7 | combat: `{ns:"combat", path:"inspect", ref:"ZZ Wave4 Reader"}`, `{ns:"combat", path:"plan", opts:{actor:"ZZ Wave4 Reader"}}`, `{ns:"combat", path:"coversMultiattack", ref:"ZZ Wave4 Reader"}`, `{ns:"combat", path:"riderMode", opts:{key:"sneak-attack"}}` | plain JSON, `inCombat: false`; a plan with two swings; the Multiattack item's name or id (or null when the setting is off); `"ask"` or `"auto"` |
| 8 | transform: `{ns:"transform", path:"inspect", ref:"ZZ Wave4 Reader"}`, `{ns:"transform", path:"forms", opts:{actor:"ZZ Wave4 Reader"}}` | inspect: plain JSON, `shifted: false`. forms: `BAD_ARGS … needs a live Document — eval-js only` (the legacy rows take an Actor document); if the bridge resolves the name instead, record the answer (`[]`) and move on: not a red |
| 9 | write rows have **no dry run** in these four manifests: `pentaryn-write {ns:"riders", path:"restoreHitDie", opts:{actor:"ZZ Wave4 Reader"}, dryRun:true}`, `{ns:"combat", path:"newTurn", opts:{actor:"ZZ Wave4 Reader"}, dryRun:true}`, `{ns:"aoe", path:"sweep", dryRun:true}`, `{ns:"transform", path:"sweepSpentForms", dryRun:true}` | `BAD_ARGS … has no dry run` each, and **nothing ran**: the reader's `flags.pentaryn-combat.turn` is still absent, its Hit Dice are unchanged, and no form actor was deleted. Each write line says `ok:false`, `code:"BAD_ARGS"`, `ids: []` |
| 10 | wrong tool: `pentaryn-read {ns:"riders", path:"setType"}`; `pentaryn-write {ns:"combat", path:"plan", opts:{actor:"ZZ Wave4 Reader"}}` | `BAD_ARGS` (a write row on the read tool, and the reverse) |

Each read writes one compact line (`{ts, tool:"pentaryn-read", ns, path, ref, ok, ms, client}`, with no
args and no result: W2-B2). Each write or refusal writes a write line with `args`, `ok` and `code`.

## 8. Step f — the table checks the goldens cannot see — **J** with **O**

These are the declared visual, chat and multi-client checks from the wave-4 report's live-check
lists. Joe looks while O drives. A check that needs a player view uses a player tab
(`make -C $LIVE login USER_NAME=<a player> LOGIN_HOST=zz1.localhost`), closed straight after. A
check that fails goes to §10 for that module. Rows marked **2-tab** break the one-GM-tab rule and
run only if W4-L2 says so.

| Module | Check (wave-4 report reference) |
|---|---|
| riders | "Live checks for the gated live phase (riders)" 1–3 and 5–7. Fireball as Marrith (`min2`, `+CHA`, the card note, a fire-resistant target's tray starts ignored). D-r1: Battle Medic on an unowned target with the GM online heals; with no GM, the `noGM` warning. -12: `report("Esren")`. -23: Summon Beast, drop concentration, the beast goes; Dodge ending removes nothing. D-r5: Place Summons ticked, Animate Dead preview image, Careful Spell with no picker, Scorching Ray tooltip "3 rays", a failed concentration save still ends it. **2-tab:** check 4 (-41: one heal, one Hit Die, `relay.<id>.claims` empty afterwards) and W4-R7 / W4-R8 (count the summon-cleanup and auto-break console lines) |
| aoe | "Live phase — aoe (planned, not run)" 2–4 and 6. Fireball on 3 goblins and a PC: tray, GM-only NPC saves, the player's request card, Apply; every string reads as before (S3 lang); the settings menu shows 17 rows in the same order. `summary(<damage message id>)` and `inspect(<that id>)`. The hot patch (README recipe): `uninstall()` gives back Argon's bind and core's `placeRegions`; after the re-import, a handle drag (D-A2), Cone of Cold from a token (D-A7), Escape cancels and refunds (-9 warns), Argon loading after aoe (D-A4). 8.5: `sweep(canvas.scene)` on a scene with several pre-module template regions shares them in one Region update. **2-tab:** check 5 (D-A6: delete "Area handle", reload both tabs, one actor `pentarynAoeHndl0`, and count the `createActor` events). Afterwards the world's handle actor id has changed: record it. aoe's golden then reports `env.handleActor.fixedId: true` |
| combat | "Live checks for the gated live phase (combat)". B2: a Full Attack, the Off-hand pip, the Bonus pip and a sequence end each act once; a macro on `pentarynCombat.usage` fires once per swing. D-c3: the Sneak Attack auto note and offer button. D-c4: the target-picker label at the pointer. -22: an NPC with Multiattack that uses Action Surge gets its second set. W4-C1: press Dis while swing 1's window is open, roll it, and swing 2 opens on Disadvantage. -38: deleting a combat clears every combatant's turn and Reaction flags. D7: with transform **off** (Joe's call, a module toggle and a reload), combat's Full Attack tooltip has the compact layout; with transform on, it looks as before. The Argon Action bar after a Wild Shape is unchanged (render order across combat and transform) |
| transform | "Live checks for the gated live phase (transform)" 1–9, 11 and 12, as GM with Talo. T-D2 `inspect("Talo")` in normal form and as a Dire Wolf. The HUD flow as a player: Wild Shape, Change Form, Return (one use, one chat line; PT3-7 Restore line). T-D4 nothing looks different (picker, glows, Starry button, Chalice pulse, portrait `99+12`, compact tooltips incl. combat's). -13 step 3: a Dire Wolf under combat's Full Attack shows no second Multiattack; with combat's Multiattack off it does. T-D6 world-time expiry, GM connected and not. T-D7, C59, §5.8 starlight. PT3-6 Escape closes the picker. T-D3 debug line. **D8 / T-L1 (check 11) is a decision for Joe, not a pass/fail: record what happens, build nothing.** **2-tab:** check 10 (W4-T1: Talo shifted, dropped to 0 HP; count the "drops to 0 HP" lines) |

## 9. Rollback, cleanup — S, O decides

**Rollback, per module.** This is code only. No wave-4 module migrates stored data: flag scopes are
unchanged (`flagScope` is a Wave 7 manifest edit), and aoe keeps the world's handle actor (D-A6
only fixes the id of a newly created one). One residue is harmless: riders' -41 relay leaves
`flags.pentaryn-riders.relay.<id>` records on a patient that 0.2.0 never reads.
1. `rsync -a --delete "$RB/pentaryn-<m>/" "$DATA/modules/pentaryn-<m>/"`.
2. Reload the GM tab. No `module.json` changed, so no restart is needed.
3. Run the boot probe (§5). The module shows the before surface (`describe: "absent"`, not frozen).
4. Run its golden once. `diff.mjs` against `before/<m>.run1.json` must be identical, shared and declared.
5. Record it in a "Rollback" row in the report: module, why, time. Leave the code as it is in `WT`.

Order matters for the pairs in §1:
- **combat or transform alone:** run the other one's golden once more after the rollback. Then
  repeat transform check 5 (-13 step 3). With combat at 0.2.5, transform's `coversMultiattack`
  read answers `undefined`, so a Dire Wolf under Full Attack may show the second Multiattack again.
  That is the old behaviour, not a new fault. Record it.
- **riders alone:** rerun `scripts/tests/test_rider_tables.py` against the tree you are leaving
  deployed: `git -C $WT show <rb stamp>:…` for riders, the deploy commit for combat. It checks
  only that no feature sits in both tables.

**The fork,** only if W4-L3 ran: `git -C $FORK switch pentaryn`, `npm run build:server`,
`kill -9` the backend, reload the GM tab.

**World data,** only if a golden, a read row or a table check damaged it:
- **Rung 1** is the `$RB/world/` copy. Take Foundry down (`make -C $LIVE foundry-down`), then
  `rsync -a --delete` it back, then `PENTARYN_NONINTERACTIVE=1 make -C $LIVE foundry-up FROM=local`.
- **Rung 2** is `make -C $LIVE foundry-restore SNAP=<the §3.1 name>`, and it is Joe's call: it
  also reverts anything else done since. Never `FROM=latest`, and never a `-boss` snapshot.

**Cleanup — S.**
- Delete "ZZ Wave4 Reader". Then no ZZ documents are left (the §2.6 eval-js), and every
  `cleanup` block is clean.
- The four modules' settings equal their before values (each golden reports `settingsRestored`).
- No player tab open, and no second GM tab.
- No chat lines from ZZ speakers (`zzMessagesLeft`).
- Foundry is **up**, the world loaded, the tunnel **down**, and one GM tab answering `get-world-info`.
- Keep `RB` and `OUT` until the merge, then delete `RB`.
- Never commit `foundry/logs/**` or `.state/**`.

## 10. The fix loop — O

It starts on any of these:
- a red sync gate or a red boot probe;
- a `shared` difference, or a `declared` difference not in the §6 table;
- something left in `cleanup`;
- a `reads.md` row or a table check that does not match.

1. **Freeze the module.** No more goldens or reads on it. If players could notice the fault and the world is about to be used,
   roll it back first (§9). Otherwise leave it deployed while you diagnose.
2. **Reproduce in `WT` without Foundry.** Write a new failing node:test in the module (`t.mock.timers`, no
   real timers) that shows the live difference. Frozen tests and goldens are never edited to fit.
3. **Fix in the smallest step.** Run the module's `node test/run.mjs` and `make -C $WT foundry-<m>-check`. Commit with
   `git commit -m … -- <paths>`. A behaviour change is `[declared]` and gets its own commit. End every message with the session trailers.
4. **Redeploy and re-check.** `make -C $WT foundry-<m>-sync`, reload the GM tab, run the §5 probe, run the golden twice, and diff against the
   **original** before run.
5. **Red again on the same step** triggers the stop rule. Roll the module back (§9), record why in the report and
   under "Open for Joe", and carry on with the other modules.
6. **A fault in the golden script** (not in the module, e.g. a scratch item dnd5e will not
   validate, or a probe that depends on state) is fixed in the script in its own `test(foundry)`
   commit, with `scripts/tests/test_live_goldens_wave4.py` still green. **Both** sides are then
   re-run with the fixed script. For the before side, roll that module back (§9) first.

**Foundry 14.369:** on a scene created since the server last started, a token's first delta change
may not persist server side. `aoe.js` makes a throwaway scene-flag update first. A "bug" that goes
away on a retry is this server bug, and it is not a module fault.

## 11. Record — O

In [`wave-4-report.md`](wave-4-report.md), add a "Live phase (date)" section with:
- the deploy commit, the snapshot name, the four modules, and whether the fork was deployed (W4-L3);
- the probe verdicts;
- the golden verdict table (as wave 1's "Live goldens (before → after)") and the timing table;
- the `reads.md` table and the table-check verdicts, including the D8 / T-L1 observation for Joe;
- any rollback or fix-loop commit.

Fill each module guide's Result "live" cell. After green, the merge into `main` follows
[`../merge-and-go-live-2026-10-11.md`](../merge-and-go-live-2026-10-11.md) §1, appending a
section there. Use the wave-4 report's merge note: conflicts in `context/foundry/README.md`
(regenerate the module index) and `foundry/adjustments.yml` (keep both sides' rows). After the
merge, the portals/creatures `isAoeHandle` oracle pin is unblocked. **Merging into `main` is not
part of this plan's deploy:** the sync runs from `WT`.

## 12. Decisions for Joe before go

| # | Decision | Default |
|---|---|---|
| W4-L1 | Deploy the four modules from `migrate/wave-4` as it is (it lacks wave 3, so only those four folders are synced), or first merge `main` into `migrate/wave-4` (conflicts as in the merge note) and deploy from the merged tree | **as it is**: the four folders are self-contained (each vendors its own kit), the goldens and probes compare every other module against `probes-before.json`, and the merge is better done once, after a green live phase |
| W4-L2 | The **2-tab** rows of §8 (riders -41, W4-R7, W4-R8; transform W4-T1; aoe D-A6) break the one-GM-tab rule for a minute each | **skip them**. Their node tests cover the logic: -41's claim tests, W4-T1 and R7/R8 are "accept, watch". Run aoe D-A6 only if Joe wants the handle actor's id fixed now (it replaces the world's actor) |
| W4-L3 | The deployed `pentaryn-read` description still says "Namespaces without describe() (combat, riders, transform, aoe, …) are eval-js only". After this deploy that steers an LLM away from four namespaces that now answer. The fix is a description-only fork commit, like wave 3's `a5ce74c`, plus a server build and a `kill -9` (§4.3) | **follow-up, not this session**. No module guide asked for a fork change, and the code phase did not touch the fork. Make the commit, then deploy it with this session's reload or the next fork deploy |
| W4-L4 | The Wave 7 restart batch (version bumps, `flags.pentaryn`, riders' `recommends` + D7 vendor, combat/transform `styles`) | **its own session**. Nothing in this plan needs it |

## 13. Order at a glance

| Step | Who | Gate to continue |
|---|---|---|
| 0 preconditions, record, `RB` copies | S | all eight checks hold |
| a down, world copy, backup, up `FROM=local`, login; probe-before; before goldens ×2 | S | each run clean, no `error`, no `skipped`; run1 = run2 |
| b1–b2 four module syncs; `module.json` unchanged | S | every gate green; no `module.json` diff |
| b3 fork (only W4-L3) | O | fork suites green |
| b4 one GM tab reload | S | eval-js answers in pentaryn |
| b5 wrapper | J (only if the tools vanished) | tools listed |
| c boot probes | S | §5 pass row per module; others = probes-before |
| d after goldens ×2, diffs, timings | S (O on red) | shared identical; declared as the table |
| e `pentaryn-read` / `-write` | S | the ten rows |
| f table checks | J + O | each module's live checks; D8 recorded |
| cleanup, record | S, O | zero ZZ, settings restored, report written; Foundry up, tunnel down |
