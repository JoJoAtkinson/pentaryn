---
title: Wave 5 — the live lane W5L (the Wave 7 restart batch, one restart, strict gates on main)
status: plan
last_modified: 2026-10-12
tags: [foundry, modules, blueprint, plan, migration, live, wave5, wave7]
---

# Wave 5 — the live lane W5L

**Read this when:** you are lane **W5L** of the overnight run (or a later session Joe sends) and
are taking `migrate/wave-5` live, or you are reviewing how it went. **Not this file:** what each
module changed → [`wave-5-report.md`](wave-5-report.md) and the "Applied on `migrate/wave-5`"
section of [`wave7-restart-batch.md`](wave7-restart-batch.md) · the lane rules →
[`../overnight-2026-10-11.md`](../overnight-2026-10-11.md) §5 (every live lane, same shape), §9,
§10 · the shape this plan copies → [`wave-4-live-plan.md`](wave-4-live-plan.md) · how W3L/W4L
actually ran → [`../merge-and-go-live-2026-10-11.md`](../merge-and-go-live-2026-10-11.md).

Nothing here has run. Written by lane W5c (code only) on 2026-10-12.

**What is different from wave 4.**
- **Every module changed and every manifest changed.** Kit 1.1.0 was re-vendored into all 20
  modules, and every `module.json` carries the Wave 7 rows (`flags.pentaryn`, `compatibility`,
  `styles`, `languages`, `relationships`, five version bumps). A `module.json`, lang or `styles`
  change is read only at startup, so this lane is **one Foundry restart**, not a tab reload.
- **19 modules deploy, walls does not.** Walls' manifest and lang edits are on the branch, but
  walls stays **off** in the world and is **never synced**. Its flag-scope data migration is not
  wired and must not run (§10, wave7-restart-batch walls row).
- **The branch contains main.** `migrate/wave-5` starts at `wave-5-base` = `origin/main`
  `7b444c6f` (after W4L). So the sync runs from `$LIVE` after the merge, as W4L did, and every
  stamp names the merge commit.
- **The fork is unchanged.** `foundry-vtt-mcp` `pentaryn` is at `7712417` (W4L, with W4-L3's
  description). No fork build, no `kill -9`, no bridge copy. The fork's `needsDoc` already passes
  `names.sync`'s first `ref` with `resolve:"self"` and its `takesDryRun` honours `row.dryRun`
  (K1/K2). The non-first-param case is a recorded fork follow-up, not built.
- **Strict gates.** Since `3eaef7c5` the vendor and conformance gates fail every module except
  the rows of `scripts/foundry/blueprint/exceptions.json` (each with `match` patterns since
  `4ccdc350`). The gates must pass on **main** after the merge.
- **New checks:** lang keys (no raw `PENTARYN_*` key on any screen, GM and player) and styles
  (every `styles` entry loaded from its new path, D7 `.pentaryn-tt` styled).

## 0. Names, paths, roles

| Name | Path / value |
|---|---|
| `WT` | `/Users/joe/Documents/GitHub/pentaryn-wave5-wt` (branch `migrate/wave-5`). Gates before the merge, the golden scripts, `diff.mjs`. No sync runs from here |
| `LIVE` | `/Users/joe/Documents/GitHub/pentaryn` (branch `main`). The merge, the gates on main, **every sync**, every lifecycle target (`foundry-down`, `foundry-up FROM=local`, `foundry-backup`, `login`, `vtt-status`, `tunnel-down`, `foundry-cloud`, `foundry-bridge-status`). Never `git stash`, `reset --hard`, `checkout -- .` or `clean` here: the modified `foundry/logs/*.jsonl` are the bridge's live logs |
| `FORK` | `/Users/joe/Documents/GitHub/foundry-vtt-mcp` (branch `pentaryn`, `7712417`). Read only in this lane |
| `DATA` | `~/Library/Application Support/FoundryVTT/Data` (modules in `$DATA/modules/<id>`). Server logs: `~/Library/Application Support/FoundryVTT/Logs/` |
| `OUT` | `$LIVE/.state/live-goldens/wave5/` (git-ignored): `deployed-before.json`, `probes-before.json`, `styles-before.json`, `before/<m>.run{1,2}.json`, `after/<m>.run{1,2}.json`, `probes.json`, `styles.json`, `lang-gm.json`, `lang-player.json`, `reads.md` |
| `RB` | `$LIVE/.state/live-rollback/W5L/`: `<id>/` byte copies of **every** `pentaryn-*` folder in `$DATA/modules` (walls included, so a rollback has a source even if something touched it) and `foundry-mcp-bridge/`; `world/` (`Data/worlds/pentaryn` + `Config`, taken while Foundry is down); `README.txt` (deploy commit, fork commit, snapshot name). A fix round copies into `$LIVE/.state/live-rollback/W5L-fix/` (then `-fix2/`), **never** into `W5L/` |
| `HB` | the heartbeat file the orchestrator named (`scratchpad/heartbeat-W5L`): `touch` it at every step |

Golden scripts: [`scripts/foundry/live-goldens/`](../../../scripts/foundry/live-goldens/) (one per
module; walls' is not run). Each golden is one `eval-js` call: `script` = the file's text,
`timeoutMs: 60000`, `purpose: "wave-5 live golden <before|after> <m> run <k>"`. Save the returned
JSON **string** to `OUT` as is.

Export `PENTARYN_NONINTERACTIVE=1` for every make call. **Forbidden all lane:** `make vtt-up`,
`make vtt-down`, `tunnel-up`, any `FROM=latest` or `-boss` restore, `foundry-prune-untagged`,
syncing walls, running walls' `migrateFlagScope`, touching the real PCs (Caven, Marrith, Talo) or
campaign scenes beyond reading, Argon's files.

**Who runs what.** **S** (Sonnet) runs mechanical steps against a stated expectation and stops on
any mismatch. **O** (Opus) diagnoses every red, runs the fix loop, rollbacks and the merge
conflicts. **J** (Joe) only for a `/mcp` reconnect if the session's tools vanish; nothing else
waits for him overnight (§11 of the overnight plan).

## 1. The deploy set

19 modules from `$LIVE` after the merge. **Not walls.**

| Module | Version deployed → after | How | Golden | What changed (declared marked D) |
|---|---|---|---|---|
| aoe | 0.3.1 → **0.4.0** | `make foundry-aoe-sync` | `aoe.js` | flags, recommends, `styles/aoe.css` (moved), verified; D version |
| attunement | 0.2.1 → **0.3.0** | `…-attunement-sync` | `attunement.js` | flags, recommends item-piles, minimum 14, `styles/attunement.css` (moved), `languages` + **inert** `lang/en.json` (no `_loc` yet), `stash`/`releaseAway` docs "eval-js only" (describe text); fixes batch 2: D W2-A1 (a returning coin purse is claimed, pays once ~750 ms after the Take), D W2-A2 (a `stash()` shortfall rolls back the accepted copies, `err.rolledBack`), kit `election` vendored; D version |
| combat | 0.2.5 → **0.3.0** | `…-combat-sync` | `combat.js` | flags, verified, description sentence, `lib/argon-tooltip.css` via `styles` and the `@import` dropped; D version |
| creatures | 0.1.1 | `…-creatures-sync` | `creatures.js` | flags, recommends item-piles + enhancedcombathud, `styles/creatures.css` (moved), verified |
| cursors | 0.2.0 | `…-cursors-sync` | `cursors.js` | kit re-vendor; `tools/build.mjs`, `assets/src/`, `DESIGN.md` left the module (built outputs unchanged) |
| dropbin | 0.2.3 | `…-dropbin-sync` | `dropbin.js` | flags, recommends item-piles + itempilesdnd5e, minimum 14 |
| feedback | 0.1.2 | `…-feedback-sync` | — (none) | kit re-vendor only |
| importer | 1.1.1 | `make foundry-importer-install` (never `module-sync`, never `stage`/`foundry-sync`) | `importer.js` | `flags.pentaryn` merged (gate keys kept), minimum 14, `import` row `dryRun: true` (K1) |
| journal | 0.1.0 | `…-journal-sync` | `journal.js` | flags, `systems` dnd5e, recommends, `styles/journal.css` (moved); D `folderName` setting label/hint now lang keys (W2-J1) |
| lookup | 0.3.0 | `…-lookup-sync` | `lookup.js` | flags (`rules`, `plk-`), minimum 14 |
| movement | 0.1.2 | `…-movement-sync` | `movement.js` | flags, `styles/movement.css` (moved), verified |
| names | 0.1.1 | `…-names-sync` | `names.js` | D `sync`'s `ref` carries `resolve:"self"` (K2) |
| pings | 0.1.1 | `…-pings-sync` | `pings.js` | kit re-vendor only |
| portals | 0.4.4 → **0.5.0** | `…-portals-sync` | `portals.js` | flags, `styles/portals.css` (moved), recommends, D `languages` + `lang/en.json` (59 keys), every on-screen string through `_loc` full keys, settings labels as keys |
| prompts | 0.4.5 | `…-prompts-sync` | `prompts.js` | flags (tier, namespace, cssPrefix) |
| riders | 0.2.0 → **0.3.0** | `…-riders-sync` | `riders.js` | flags, Argon ×2 recommends, `styles/riders.css` (moved), D7 `lib/argon-tooltip.css` vendored and listed in `styles`, `#tooltip` click-through rule kept; D version |
| senses | 0.4.1 → **0.5.0** | `…-senses-sync` | `senses.js` | manifest: flags, minimum 14, enhancedcombathud recommend; fixes batch 2: D W3-SE4 (a chain with a hidden anchor is GM-only, `paint()`); D version |
| ties | 0.19.4 | `…-ties-sync` | `ties.js` | flags (`pentaryn-ties`), minimum 14, verified, recommends |
| transform | 0.3.3 → **0.4.0** | `…-transform-sync` | `transform.js` | flags, minimum 14, `lib/argon-tooltip.css` via `styles` and the `@import` dropped; D version |

Every module also carries kit 1.1.0 (`describe().kit` "1.0.2" → "1.1.0"). Every module's
`afterSync` now comes from its `module.json` (`config.py` holds no tuples): the sync prints it.
Not deployed: **walls** (off), the fork (unchanged), the bridge module (unchanged).

**Moved stylesheets** (old path → new path; content byte-identical, R100): aoe `aoe.css` →
`styles/aoe.css`, attunement `attunement.css` → `styles/attunement.css`, creatures `creatures.css`
→ `styles/creatures.css`, journal `journal.css` → `styles/journal.css`, movement `movement.css` →
`styles/movement.css`, portals `portals.css` → `styles/portals.css`, riders `riders.css` →
`styles/riders.css`. The sync replaces the whole folder, so the old paths disappear.

## 2. Preconditions (step 0) — S

Touch `HB` first and after every numbered step below.

1. **Tunnel down:** `make -C $LIVE vtt-status`. Up → `make -C $LIVE tunnel-down`, record it.
2. **Updater paused:** `make -C $LIVE vtt-update-status` says paused; if not, `make -C $LIVE vtt-update-pause`.
3. **Users:** `get-world-info` shows only the Gamemaster active. Others → close our tabs; if the
   same users are still "active" on the next tick (≥ 30 min), they are stale: continue, the restart clears them.
4. **One GM tab:** close every other Foundry tab (two GM tabs kick each other and break the bridge).
5. **World:** `game.world.id === "pentaryn"`; no started combat
   (`game.combats.filter(c => c.started).length === 0`); zero ZZ documents (names starting `"ZZ "`
   across actors, scenes, journal, items, combats, and chat messages with a `"ZZ "` speaker alias).
   The aoe handle actor exists (`game.actors.filter(a => a.flags?.["pentaryn-aoe"]?.handleActor)`
   has one entry; record its id).
6. **Upload queue empty:** no `*.job.json` in `$LIVE/.pentaryn-tmp/`, and `make -C $LIVE foundry-cloud`
   shows no `upload` line. Otherwise (after the `foundry-down` in §4.1):
   `./.venv/bin/python -m scripts.foundry.cloud upload-pending` (blocking), then continue.
7. **Walls is off:** `game.modules.get("pentaryn-walls")?.active === false`. If it is on, stop
   and hand to O: the plan assumes the old flag scope is never read live.
8. **The branch is green:** in `$WT`, `git status --short` shows only the untracked `.venv`;
   `git diff --name-only $(git -C $LIVE rev-parse main) migrate/wave-5 -- foundry/logs` is empty
   (if not, drop those hunks on the branch first). The full gate set (§5.3) passes on the branch.
9. **Record what is deployed** in `OUT/deployed-before.json`: for each `pentaryn-*` and
   `foundry-mcp-bridge` folder in `$DATA/modules`, the `module.json` `version` and the whole
   `.pentaryn-sync.json`; `git -C $FORK rev-parse HEAD` (expect `7712417`); the `backend.js` start
   time from `make -C $LIVE foundry-bridge-status`. Each module stamp's tree must equal
   `wave-5-base` for that folder (`git -C $LIVE diff --quiet <stamp.git> wave-5-base -- foundry/module/<id>`);
   a different one means something other than main was deployed: hand to O.

## 3. Before — S

1. **Probe-before:** run the §7 boot probe once, save `OUT/probes-before.json`. Every module
   shows kit `1.0.2`; walls `active: false`.
2. **Styles-before:** run the §9 styles probe once, save `OUT/styles-before.json` (old CSS paths,
   `.pentaryn-tt` rules deep = 22: combat's and transform's `@import`).
3. **Before goldens:** each of the 18 golden scripts (every module in §1 that has one; not walls,
   not feedback) **twice** on the deployed code → `OUT/before/<m>.run{1,2}.json`. Order: aoe,
   riders, combat, transform, senses, creatures, portals, prompts, ties, lookup, importer,
   movement, journal, attunement, dropbin, names, pings, cursors. After each run:
   - `skipped` (aoe: no handle actor or not the active GM; combat: a combat runs) → O.
   - `golden.shared.error` on the before side is a script fault → O fixes the script (§12.6)
     before anything deploys.
   - `cleanup` with `…Left > 0` or `…Restored: false` → clean by hand, then O.
   - `node $WT/scripts/foundry/live-goldens/diff.mjs OUT/before/<m>.run1.json OUT/before/<m>.run2.json`
     must say shared identical. Known run-to-run noise (W4L): senses' scratch AmbientLight id
     (`inspectCarrier.lightSpells[0].litBy[0]`, `lightStatus.litBy[0].id`), importer's
     `root.keysInPublishOrder`. Anything else → O.
   - On a hidden tab a `false` settle flag (aoe `handlesSettled`, concentration `*Gone`) is J20:
     bring the tab forward, rerun once, then O.
4. **Rollback copies (module folders):**
   `mkdir -p $RB && for d in "$DATA"/modules/pentaryn-* "$DATA/modules/foundry-mcp-bridge"; do rsync -a "$d/" "$RB/$(basename "$d")/"; done`.
   Write `$RB/README.txt` with the deployed stamps and the fork commit.

## 4. Down, world copy, backup — S

1. `make -C $LIVE foundry-down`.
2. Rung-1 copy: `rsync -a "$DATA/worlds/pentaryn/" "$RB/world/pentaryn/"` and
   `rsync -a "$DATA/../Config/" "$RB/world/Config/"` (~45 MB).
3. `make -C $LIVE foundry-backup REASON=wave5-live` (refuses while Foundry runs). Record the
   snapshot name in `$RB/README.txt`. It must be a `-mac` snapshot.

Foundry stays down through §5 and §6.

## 5. Merge main → branch → main — O (S runs the gates)

1. **main → branch, in `$WT`:** `git fetch origin && git merge --no-ff origin/main` (a no-op if
   main is still `7b444c6f`). Main may have moved (the fixes lane `fix/overnight-2-2026-10-12`:
   senses SE4, attunement A1/A2). Expected conflicts and how to resolve them:
   - attunement `README.md`, `CHANGELOG.md`: keep both sides' entries.
   - `attunement.css` → `styles/attunement.css`: an fx2 edit at the old path must land in
     `styles/attunement.css` (git's rename detection usually does it; check `git status` shows no
     re-added `attunement.css` at the root).
   - If fx2 landed attunement guide step 8 (`_loc` switch): C35 now passes, so the
     `pentaryn-attunement` C35 row in `scripts/foundry/blueprint/exceptions.json` must be deleted
     **in the merge commit**, or the strict gate fails with "stale exception C35". Attunement's
     `lang/en.json` must then hold every key `_loc` uses (the i18n gate checks it).
   - `context/foundry/README.md` module index: regenerate, never hand-merge.
   - `foundry/adjustments.yml`: keep both sides' rows.
   - Any conflict in a module's code other than the above → resolve with that module's node tests
     green; unresolvable → park (overnight §11).
2. **Gates on the merged branch** (all in `$WT`; each must pass):
   - each module: `node foundry/module/<id>/test/run.mjs` exit 0 (all 20);
   - `./.venv/bin/python -m pytest -q` (expect ≥ 1538 passed, 2 skipped, 5 xfailed; the counts
     rise if main added tests);
   - `make foundry-modules-check` (strict: "all 20 modules pass their gates");
   - `make foundry-lib-check` (93 pass); `make check-context`; `make foundry-adjustments-check`;
   - `./.venv/bin/python scripts/foundry/blueprint/vendor.py check --all`;
   - `./.venv/bin/python scripts/foundry/blueprint/conformance.py` (exit 0).
   Commit any fix with `git commit -m … -- <paths>` and the session trailers. Push the branch.
3. **branch → main, in `$LIVE`:** `git merge --no-ff migrate/wave-5 -m "Merge branch 'migrate/wave-5' into main: wave 5 (Wave 7 restart batch, kit 1.1.0, strict gates)"`.
   Never touch `foundry/logs/**` (the merge must carry no hunk there; check
   `git show --stat HEAD | grep foundry/logs` is empty). Record the merge SHA as the deploy commit.
4. **Strict gates on main** (in `$LIVE`, same list as 5.2). The tree must equal the merged branch
   (`git diff --quiet migrate/wave-5 main -- . ':!foundry/logs'`). A red here → O; never push a red main.

## 6. Deploy and the one restart — S

1. **Syncs from `$LIVE`**, Foundry still down, one at a time; each runs the module's check gates
   first and prints its `afterSync`:
   `make -C $LIVE foundry-{aoe,attunement,combat,creatures,cursors,dropbin,feedback,journal,lookup,movement,names,pings,portals,prompts,riders,senses,ties,transform}-sync`
   (18 targets) and `make -C $LIVE foundry-importer-install` (the importer: module-check +
   install, no `actors.json`). **Never** `foundry-walls-sync`, never `foundry-sync` (the actor stage).
   A red gate leaves that module at its `RB` copy → O.
2. **Check the copies:** for each of the 19, `$DATA/modules/<id>/.pentaryn-sync.json` names the
   merge commit with `dirty: false`, and `diff <(jq -S . $LIVE/foundry/module/<id>/module.json) <(jq -S . "$DATA/modules/<id>/module.json")`
   prints nothing. The moved CSS files are gone from their old paths
   (`test ! -e "$DATA/modules/pentaryn-aoe/aoe.css"`, and so on for the seven in §1). Walls'
   folder equals its `RB` copy (`diff -r "$RB/pentaryn-walls" "$DATA/modules/pentaryn-walls"`).
3. **Up:** `PENTARYN_NONINTERACTIVE=1 make -C $LIVE foundry-up FROM=local`. Never `FROM=latest`.
4. **GM tab:** `make -C $LIVE login NO_OPEN=1 USER_NAME=Gamemaster WORLD=pentaryn`; point the
   one controlled Chrome tab at the printed URL (`WORLD` matters). Then one cache-bypassing reload
   (Cmd-Shift-R) so no old `*.css` is served from the browser cache. The first `eval-js` may say
   "not connected": retry once. `game.world.id === "pentaryn"`.
5. **Tools:** if the session's `mcp__foundry__*` tools vanished (they should not: nothing killed
   the wrapper), only `/mcp` → reconnect fixes it, and that is Joe's action. The lane records
   "tools vanished", keeps Foundry up (exit invariant), leaves §7–§10 for the morning and does
   not push main.

## 7. Boot probe — S

One eval-js (`purpose: "wave-5 boot probe"`), saved to `OUT/probes.json` (and `OUT/probes-before.json` in §3.1):

```js
const want = { aoe: ["pentaryn-aoe","aoe"], attunement: ["pentaryn-attunement","attunement"],
  combat: ["pentaryn-combat","combat"], creatures: ["pentaryn-creatures","creatures"], cursors: ["pentaryn-cursors","cursors"],
  dropbin: ["pentaryn-dropbin","dropbin"], feedback: ["pentaryn-feedback","feedback"], importer: ["pentaryn-importer","importer"],
  journal: ["pentaryn-journal","journal"], lookup: ["pentaryn-lookup","rules"], movement: ["pentaryn-movement","movement"],
  names: ["pentaryn-names","names"], pings: ["pentaryn-pings","pings"], portals: ["pentaryn-portals","portals"],
  prompts: ["pentaryn-prompts","prompts"], riders: ["pentaryn-riders","riders"], senses: ["pentaryn-senses","senses"],
  ties: ["pentaryn-ties","ties"], transform: ["pentaryn-transform","transform"], walls: ["pentaryn-walls","walls"] };
const out = { world: game.world.id, rootKeys: Object.keys(game.pentaryn ?? {}).sort(), rootFrozen: Object.isFrozen(game.pentaryn),
  chainAlias: game.pentaryn?.chain === undefined ? "absent" : game.pentaryn.chain === game.pentaryn?.senses?.chain ? "same" : "different" };
for (const [m, [id, ns]] of Object.entries(want)) {
  const mod = game.modules.get(id), api = game.pentaryn?.[ns];
  const r = out[m] = { active: !!mod?.active, manifest: mod?.version ?? null,
    flags: mod?.flags?.pentaryn ? { ns: mod.flags.pentaryn.namespace, css: mod.flags.pentaryn.cssPrefix, scope: mod.flags.pentaryn.flagScope } : null,
    languages: [...(mod?.languages ?? [])].map(l => l.path), styles: [...(mod?.styles ?? [])].map(s => s.src ?? s) };
  if (!r.active) continue;
  try {
    r.moduleApi = mod.api === api ? "same" : typeof mod.api;
    if (typeof api?.describe !== "function") { r.describe = "absent"; continue; }
    const d = api.describe(), get = p => p.split(".").reduce((o, k) => o?.[k], api);
    Object.assign(r, { version: api.version, versionMatches: api.version === mod.version, kit: d.kit, contract: api.contract,
      namespace: d.namespace, frozen: Object.isFrozen(api), rows: (d.methods ?? []).length,
      notFunctions: (d.methods ?? []).filter(x => typeof get(x.path) !== "function").map(x => x.path),
      dryRunRows: (d.methods ?? []).filter(x => x.dryRun === true).map(x => x.path),
      selfParams: (d.methods ?? []).flatMap(x => (x.params ?? []).filter(p => p.resolve === "self").map(p => `${x.path}.${p.name}`)) });
    if (typeof api.selftest === "function") {
      const s = await api.selftest();
      r.selftest = { ok: !!s?.ok, failed: (s?.checks ?? []).filter(c => !c.ok).map(c => `${c.label}: ${c.detail ?? ""}`) };
    }
  } catch (e) { r.error = String(e?.message ?? e); }
}
return JSON.stringify(out);
```

**Pass, every module of the 19:**
- `active: true`, `moduleApi: "same"`, `frozen: true`, `notFunctions: []`, no `error`;
- `version` **equals the `module.json` version** in `$LIVE` at the merge commit (`versionMatches:
  true`): aoe 0.4.0, attunement 0.3.0, combat 0.3.0, creatures 0.1.1, cursors 0.2.0, dropbin
  0.2.3, feedback 0.1.2, importer 1.1.1, journal 0.1.0, lookup 0.3.0, movement 0.1.2, names 0.1.1,
  pings 0.1.1, portals 0.5.0, prompts 0.4.5, riders 0.3.0, senses 0.5.0, ties 0.19.4, transform 0.4.0
  (re-read them from `module.json` if main moved);
- `kit: "1.1.0"`; `contract: "pentaryn-<m>/api@1"`; `namespace` = the `ns` above;
- `flags` = the manifest's `namespace`, `cssPrefix`, `flagScope` (the module id for all 19);
- `rows` = the paths in `test/golden/describe.json` at the merge commit where the module has one
  (aoe 24, attunement 7, combat 25, creatures 9, cursors 4, dropbin 21, feedback 8, importer 2,
  journal 13, lookup 10, movement 7, portals 12, prompts 16, riders 13, senses 23, ties 111,
  transform 13 at `68b90987`); names and pings: equal to `probes-before.json`;
- `dryRunRows` contains `import` for importer (K1); `selfParams` is `["sync.ref"]` for names (K2);
- `selftest.ok: true` where a `selftest` exists (attunement, combat, dropbin, feedback, importer,
  journal, lookup, movement, prompts, riders, ties, transform).

**Walls:** `active: false`, manifest 0.2.0, `flags.scope: "wall-autocomplete"` (the parked
migration). Walls must not appear in `rootKeys`.

**Whole world:** `rootFrozen: false` (J10); `chainAlias: "same"`; `rootKeys` = before plus nothing
new (the same 19 namespaces).

**Console.** The boot console is unreadable from the bridge (J21). After the Cmd-Shift-R reload,
read the GM tab's console with the Chrome tool (`read_console_messages`, pattern
`pentaryn|foundry-mcp-bridge|i18n|localiz|404`): no error naming a `pentaryn-*` module, no 404 for
a module file (a 404 on an old CSS path means a `styles` entry was missed), no "missing
localization" warning for a `PENTARYN_*` key. Then the newest file in
`~/Library/Application Support/FoundryVTT/Logs/` since the restart: no `error` line naming a
`pentaryn-*` module or `foundry-mcp-bridge`; no "compatibility" refusal (every module now says
minimum 14 and Foundry is 14.369).

Any red → O (§12).

## 8. Lang check — S (O on red)

The point: **no raw i18n key anywhere a person can see**, on the GM side and the player side.

### 8.1 GM tab — keys resolve (eval-js, `purpose: "wave-5 lang keys"`, saved to `OUT/lang-gm.json`)

```js
const RAW = /\bPENTARYN_[A-Z0-9_]+(?:\.[A-Za-z0-9_-]+)+/g;
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]);
const out = { modules: {}, settings: [], keybindings: [], menus: [] };
for (const mod of game.modules) {
  if (!mod.id.startsWith("pentaryn-") || !mod.active) continue;
  const r = out.modules[mod.id] = { files: [], missing: [], untranslated: [] };
  for (const l of mod.languages ?? []) {
    const path = l.path?.startsWith("modules/") ? l.path : `modules/${mod.id}/${l.path}`;
    const res = await fetch(path); r.files.push(`${path} ${res.status}`);
    if (!res.ok) continue;
    for (const k of flat(await res.json())) {
      if (!game.i18n.has(k, false)) r.missing.push(k);
      else if (game.i18n.localize(k) === k) r.untranslated.push(k);
    }
  }
}
const raw = s => typeof s === "string" && (s.match(RAW) ?? []).filter(k => !game.i18n.has(k, false) || game.i18n.localize(k) === k);
for (const [key, s] of game.settings.settings) {
  if (!String(s.namespace).startsWith("pentaryn-")) continue;
  const bad = [...raw(game.i18n.localize(s.name ?? "")), ...raw(game.i18n.localize(s.hint ?? "")),
    ...Object.values(s.choices ?? {}).flatMap(c => raw(game.i18n.localize(String(c))))];
  if (bad.length) out.settings.push({ key, bad });
}
for (const [key, a] of game.keybindings.actions) {
  if (!key.startsWith("pentaryn-")) continue;
  const bad = [...raw(game.i18n.localize(a.name ?? "")), ...raw(game.i18n.localize(a.hint ?? ""))];
  if (bad.length) out.keybindings.push({ key, bad });
}
for (const [key, m] of game.settings.menus) {
  if (!key.startsWith("pentaryn-")) continue;
  const bad = [...raw(game.i18n.localize(m.name ?? "")), ...raw(game.i18n.localize(m.label ?? "")), ...raw(game.i18n.localize(m.hint ?? ""))];
  if (bad.length) out.menus.push({ key, bad });
}
return JSON.stringify(out);
```

Pass: every `files` line ends `200`; `missing: []` and `untranslated: []` for every module;
`settings`, `keybindings`, `menus` all `[]`. Attunement's lang file loads (inert: its strings
still come from `STRINGS`; nothing reads the keys yet unless fx2's step 8 merged — then its keys
must resolve too).

### 8.2 The screen scan (one helper, used in both tabs)

The DOM scan (`purpose: "wave-5 lang scan <surface>"`): returns every raw key in visible text and
in `title`/`placeholder`/`aria-label`/`data-tooltip` attributes:

```js
const RAW = /\bPENTARYN_[A-Z0-9_]+(?:\.[A-Za-z0-9_-]+)+/g;
const root = document.body, hits = new Set();
for (const m of root.innerText.match(RAW) ?? []) hits.add(m);
for (const el of root.querySelectorAll("[title],[placeholder],[aria-label],[data-tooltip]"))
  for (const a of ["title", "placeholder", "aria-label", "data-tooltip"])
    for (const m of (el.getAttribute(a) ?? "").match(RAW) ?? []) hits.add(`${a}: ${m}`);
return JSON.stringify([...hits]);
```

Pass: `[]` on every surface. Also eyeball the screenshot of each surface for English labels
where a key used to be (portals' settings, journal's `folderName`, walls n/a).

### 8.3 GM surfaces — S, through eval-js (open, wait 500 ms, scan, close)

Throwaway data (§10.1): "ZZ Wave5 Reader" (npc), "ZZ Wave5 Hero" (character, owned by the player
user of §8.4), "ZZ Wave5 Scene" (a new scene, viewed by the GM only, **never activated**) with one
token of each actor. Every surface below is scanned once; record `surface → hits` in
`OUT/lang-gm.json`.

| # | Surface | How |
|---|---|---|
| 1 | Configure Settings, every `pentaryn-*` tab (aoe 17 rows, combat 30, portals' three label rows, journal `folderName`, pings `max`, names, cursors, movement, senses, ties, prompts, creatures, dropbin, riders, transform, attunement, lookup, feedback) | `game.settings.sheet.render({ force: true })`, click each module's category, scan, close |
| 2 | Configure Controls (keybindings) filtered to pentaryn | `new foundry.applications.sidebar.apps.ControlsConfig().render({ force: true })` (or the v14 equivalent), scan, close |
| 3 | Each `pentaryn-*` settings menu (`game.settings.menus`) | render each menu's `type` once, scan, close |
| 4 | ZZ Wave5 Hero's character sheet (attunement strip, ties look entries, journal bar if any) | `actor.sheet.render({ force: true })`, scan, close |
| 5 | Token HUD on the ZZ Hero token (senses Light, movement Ghost, creatures, transform none) | `canvas.tokens.get(id).control(); canvas.hud.token.bind(token)`, scan, `canvas.hud.token.close()` |
| 6 | Scene controls (cursors, prompts, feedback button, portals region tools) | open each pentaryn tool group, scan |
| 7 | Region config "Portal card" tab (portals 0.5.0, all `_loc`) | create one ZZ region on ZZ Wave5 Scene, open its config, switch to the Portal card tab, scan, close |
| 8 | The feedback report dialog | open it through its scene-control button (never `submit`), scan, close |
| 9 | The aoe and riders chat output from the goldens' runs (still on screen if the chat log shows them) | scan the chat log |

### 8.4 Player tab — O drives with the Chrome tool

One player tab beside the GM's (a different user, so the one-GM-tab rule holds):
`make -C $LIVE login NO_OPEN=1 USER_NAME=<a player user> WORLD=pentaryn LOGIN_HOST=zz1.localhost`
(or `127.0.0.1`), opened in a **new** Chrome tab. Before that, the GM gives that user OWNER of
"ZZ Wave5 Hero" and pulls the user to "ZZ Wave5 Scene" (`game.socket` pull or
`user.update({viewedScene})`; never activate the scene). Nothing is changed on the player's real PC.

Run the §8.2 scan with `javascript_tool` in the player tab on each surface, and record
`surface → hits` plus a screenshot in `OUT/lang-player.json`:

| # | Surface (player view) | Modules sampled |
|---|---|---|
| 1 | Configure Settings (client-scope rows only) | every module with client settings (cursors, movement, ties, combat, senses, …) |
| 2 | ZZ Wave5 Hero's sheet | attunement strip, journal, ties |
| 3 | Token HUD on the hero's token | senses (Light), movement (Ghost toggle), transform |
| 4 | Double-click a ZZ npc token (look menu) | ties |
| 5 | The "Add to my journal" bar on an eye-readable ZZ journal page (create "ZZ Wave5 Note", observer for the player) | journal |
| 6 | Argon Combat HUD if it opens for the hero (Escape closes it) | combat, riders, transform tooltips (`.pentaryn-tt`, §9) |
| 7 | The feedback dialog (open, scan, cancel) | feedback |

A surface that needs real campaign data or a second player to show (portals' teleport
confirmation, creatures' "Your creatures" strip with 2+ tokens) is recorded **"not sampled:
<reason>"** — never faked on a real scene. Close the player tab straight after; then exactly one
Foundry tab (the GM's) is left.

**Red:** any hit on any surface, or a key in `missing`/`untranslated`. The likely causes: a lang
key typo (the i18n gate should have caught it), a `languages` path the sync did not copy, or a
cached lang file (one more Cmd-Shift-R first). → O, §12.

## 9. Styles loaded — S

One eval-js (`purpose: "wave-5 styles"`), saved to `OUT/styles.json` (and `OUT/styles-before.json`
in §3.2). Foundry 14 nests module CSS inside `@import`/`@layer`, so the walk is recursive (W4L
found the top-level check always false):

```js
const sheets = {}, tt = { rules: 0 };
const walk = (list, href) => { for (const r of list) {
  if (r.styleSheet) { const h = r.styleSheet.href ?? href; sheets[h] ??= 0; try { walk(r.styleSheet.cssRules, h); } catch {} continue; }
  if (r.cssRules && !(r instanceof CSSStyleRule)) { walk(r.cssRules, href); continue; }
  sheets[href] = (sheets[href] ?? 0) + 1;
  if (r.selectorText?.includes(".pentaryn-tt")) tt.rules++;
} };
for (const s of document.styleSheets) { sheets[s.href ?? "inline"] ??= 0; try { walk(s.cssRules, s.href ?? "inline"); } catch {} }
const mine = Object.fromEntries(Object.entries(sheets).filter(([h]) => /modules\/pentaryn-/.test(h)).map(([h, n]) => [h.replace(/^.*\/modules\//, ""), n]));
const want = {};
for (const mod of game.modules) if (mod.id.startsWith("pentaryn-") && mod.active)
  want[mod.id] = [...(mod.styles ?? [])].map(s => String(s.src ?? s)).map(p => ({ p, loaded: Object.keys(mine).some(h => h.startsWith(`${mod.id}/${p}`)) }));
const probe = document.createElement("div"); probe.className = "ech-tooltip pentaryn-tt";
probe.innerHTML = `<div class="ech-tooltip-details"><div><span>a</span><span>b</span></div></div>`; document.body.append(probe);
const cs = getComputedStyle(probe), det = getComputedStyle(probe.querySelector(".ech-tooltip-details"));
tt.pointerEvents = cs.pointerEvents; tt.maxWidth = cs.maxWidth; tt.columns = det.gridTemplateColumns; probe.remove();
const clickThrough = Object.keys(mine).filter(h => h.startsWith("pentaryn-riders/")).length > 0
  && [...document.styleSheets].some(function f(s) { try { return [...s.cssRules].some(r => r.selectorText?.includes("#tooltip.ech-tooltip-container") || (r.styleSheet && f(r.styleSheet)) || (r.cssRules && !(r instanceof CSSStyleRule) && f({ cssRules: r.cssRules }))); } catch { return false; } });
return JSON.stringify({ mine, want, tt, clickThrough });
```

**Pass (after):**
- every `want[<id>][*].loaded` is true (each `styles` entry of each module is in the CSSOM);
- `mine` has **no** old path: none of `pentaryn-aoe/aoe.css`, `pentaryn-attunement/attunement.css`,
  `pentaryn-creatures/creatures.css`, `pentaryn-journal/journal.css`,
  `pentaryn-movement/movement.css`, `pentaryn-portals/portals.css`, `pentaryn-riders/riders.css`;
- for each moved file, the rule count at the new path equals the count at the old path in
  `styles-before.json` (the content is byte-identical);
- combat and transform: `styles/<m>.css` count = before − 11 (the `@import` is gone) and
  `lib/argon-tooltip.css` = 11 for each; riders: `lib/argon-tooltip.css` = 11 (new);
- `tt.rules` = **33** (three copies of 11: combat, transform, riders; 22 before);
- D7 `.pentaryn-tt`: `tt.pointerEvents: "none"`, `tt.maxWidth: "340px"`, `tt.columns` has two
  track sizes (the `1fr 1fr !important` rule; with no Argon parent the grid may compute as
  `none` — then check `[...document.styleSheets]` holds the rule and record it, not red);
- `clickThrough: true` (riders' `#tooltip` rule kept, W4-R9).

**D7 isolation (S):** as W4L did — remove riders' and transform's `lib/argon-tooltip.css` sheets
from the CSSOM (`sheet.disabled = true` on the `<link>` or its `@import` parent), rerun the probe:
`.pentaryn-tt` still styled from combat's copy; re-enable; then the same with combat's disabled
(transform's copy carries it); re-enable all. Record each.

**Player tab:** run the same probe once in the §8.4 tab before closing it; same pass rows.

## 10. After goldens, reads, diffs — S (O on red)

1. **Scratch data:** create the §8.3 ZZ documents (and delete them in §13). One eval-js,
   `Actor.create` one at a time; never the real PCs.
2. **After goldens:** the same 18 scripts, twice each, in the §3.3 order → `OUT/after/<m>.run{1,2}.json`;
   read `cleanup` and the settle flags as in §3.3. Then
   `node $WT/scripts/foundry/live-goldens/diff.mjs OUT/before/<m>.run1.json OUT/after/<m>.run1.json`.
   **Only declared differences** may appear. Expected:

| Module | Declared differences (before → after) |
|---|---|
| every module | `env.manifestVersion` / `env.apiVersion` where the version moved (aoe 0.3.1 → 0.4.0, attunement 0.2.1 → 0.3.0, combat 0.2.5 → 0.3.0, portals 0.4.4 → 0.5.0, riders 0.2.0 → 0.3.0, senses 0.4.1 → 0.5.0, transform 0.3.3 → 0.4.0); any captured `describe().kit` "1.0.2" → "1.1.0" |
| importer | any captured describe row: `import` gains `dryRun: true` |
| names | any captured describe/param: `sync`'s `ref` gains `resolve: "self"`. A wave-1 golden: read the shared list by hand |
| attunement | any captured describe text of `stash`/`releaseAway` now says eval-js only. **W2-A1, the coin purse (W5L found the exact form, 2026-10-12):** the golden's chest is a non-pile npc, and the purse pays whoever it lands on. 0.2.1 paid the chest at once, so "before" has `stash.chest` = [Ring, Torch], `stash.toasts[0]` "…Chest recovers their coin." and `purseHome` "no purse in the chest". 0.3.0 pays ~750 ms after the claim, so "after" has `stash.chest` = [Coin Purse (bond `currency` {gp 12, sp 3}), Ring, Torch] (the `stash.chest[0..2]` paths shift), no `stash.toasts`, and `purseHome` = `{purseLeft: false, ownerCurrency gp 12 sp 3, chestCurrency {}, toasts ["…Owner recovers their coin."]}` — paid once, to the owner. These 23 shared paths are declared. The golden takes the purse home straight after the stash snapshot, so the chest's claim always finds it gone (not timing-sensitive); a `chestCurrency` with coin means a double payment (a regression). `declared.stashDetail.created` is tagged `<charmCopy0>` (it differed by a random id before the W5L fix) |
| senses | nothing else: the golden's chains have no hidden end (W3-SE4 is checked in §10.4) |
| journal | a captured `folderName` setting `name`/`hint` is now the lang key `PENTARYN_JOURNAL.settings.folderName.*` in the registry (it localizes to the same English) |
| portals | a captured settings label is now a `PENTARYN_PORTALS.*` key in the registry (same English when localized); any captured on-screen string must equal the old English |
| combat | the manifest `description` (if captured) gains the turn-flow sentence |
| riders, transform, combat | any captured stylesheet list: `lib/argon-tooltip.css` as its own entry |
| everything else | **nothing**: shared identical, declared identical |

   The known noise (§3.3) is not a difference. Timings: run 2 of each side; flag a call when
   after/before > 1.5 and the before median ≥ 0.05 ms, or ≥ 5 ms slower; rerun once before
   flagging; a surviving flag is a performance finding for O, not a stop.
3. **Reads through the bridge** (each once; answers and log lines in `OUT/reads.md`; log lines in
   `$LIVE/foundry/logs/mcp-2026-10.jsonl`, read with `tail -n 5` only, never edited):

| # | Call | Expect |
|---|---|---|
| 1 | `pentaryn-read {ns:"*", path:"describe"}` | 19 namespaces, each `kit: "1.1.0"`; not walls |
| 2 | `pentaryn-read {ns:"importer", path:"describe"}` | the `import` row has `dryRun: true` |
| 3 | `pentaryn-write {ns:"importer", path:"import", dryRun:true}` (no `actors.json` staged) | the dry run is forwarded (no "has no dry run" refusal); answer `NOT_FOUND` (no file), nothing written; the write log line has `ok:false`, `code:"NOT_FOUND"`, `ids: []` |
| 4 | `pentaryn-read {ns:"names", path:"describe"}` | `sync`'s first param `{name:"ref", kind:"actor", resolve:"self"}` |
| 5 | `pentaryn-write` names `sync` with `ref:"ZZ Wave5 Reader"`, oldName `"ZZ No Such Label"`, newName `"ZZ Other Label"` (args in the tool's schema form) | the bridge passes the string (no "needs a live Document" refusal); returns `0`; no token or prototype label changed |
| 6 | `pentaryn-read {ns:"attunement", path:"describe"}` | `stash`/`releaseAway` docs say eval-js only |
| 7 | `pentaryn-read {ns:"<m>", path:"selftest"}` for every module with one (§7 list) | `ok: true` each |
| 8 | `pentaryn-read {ns:"*", path:"inspect", ref:"ZZ Wave5 Reader"}` | one plain-JSON entry per namespace with `inspect`, no throw |
| 9 | `pentaryn-read {ns:"walls", path:"describe"}` | `NOT_FOUND` (walls off) |

4. **Fixes batch 2 live checks** (merged from `fix/overnight-2-2026-10-12` by W5L, 2026-10-12;
   record each in `OUT/fx2.md`). Throwaway data only, on "ZZ Wave5 Scene" (never activated); make
   the throwaway token change first (Foundry 14.369, §12).
   - **SE4 (senses, declared):** two ZZ npc tokens "ZZ Wave5 Anchor" and "ZZ Wave5 Chained";
     `game.pentaryn.chain.link(<chained token>, <anchor token>)` (or the HUD "Chain to target").
     In the §8.4 player tab (the zz player pulled to the scene, both tokens visible): the chain
     sprite is drawn (`canvas.primary.children` holds the senses chain layer with one sprite;
     screenshot). GM hides the **anchor** (`anchorDoc.update({hidden: true})`): in the player
     tab the chain is **gone** (no chain layer / zero sprites; screenshot); in the GM tab it is
     still drawn. Unhide the anchor: the chain is **back** in the player tab. Then hide the
     chained token instead: gone for the player (the old rule, unchanged). Break the chain.
   - **A2 (attunement, declared):** a ZZ owner actor with one item, and a ZZ container that
     accepts fewer copies than asked (an Item Piles pile whose `createEmbeddedDocuments` is
     wrapped for this one call to drop the last copy, or a `preCreateItem` hook returning
     `false` for the second item on that container — removed straight after). `await
     game.pentaryn.attunement.stash(owner, container, [id1, id2], {tag: "ZZ"})` rejects; the
     error has `err.rolledBack === true` and `err.created` naming the copy that landed; the
     container holds **no** leftover copy (`container.items.size` as before); the owner still
     has both originals. Console: one `pentaryn-attunement |` error line.
   - **A1 (attunement, declared):** stash a ZZ coin (`currency: true`) from the ZZ owner into the
     ZZ container, then Take the purse back (create it on the owner from the container's purse
     data, delete it from the container, as the golden's `purseHome` does). The owner's gp rises
     **once**, about 750 ms after the create (the claim's settle; read gp at ~200 ms: unchanged,
     at ~2 s: +amount); the purse deletes itself; the purse item carried
     `flags.pentaryn-attunement.claims.coinBack` before it went. One GM tab only, so this checks
     the single-tab path still pays (the two-tab race itself is covered by the node test).
   Delete every ZZ document these made (§13).

## 11. Rollback — O decides

**Per module** (code + manifest; no module in this lane migrates stored data — every `flagScope`
edit is metadata, the walls migration does not run):
1. `rsync -a --delete "$RB/<id>/" "$DATA/modules/<id>/"`.
2. A `module.json` changed, so **restart**: `make -C $LIVE foundry-down`,
   `PENTARYN_NONINTERACTIVE=1 make -C $LIVE foundry-up FROM=local`, login, Cmd-Shift-R.
3. §7 probe: the module shows its before row (kit 1.0.2, old version); every other module as after.
4. Its golden once; `diff.mjs` against `before/<m>.run1.json` identical.
5. Record a "Rollback" row in the report (module, why, time).

**Pairs to mind:** combat ↔ transform (`coversMultiattack`, and both carry a `.pentaryn-tt` copy —
rolling back one leaves the rules loaded from the other), riders ↔ combat (rider tables),
combat ↔ aoe (`autoDamageOnHit` read, C21/C23 exception). A module rolled back while its
`languages` entry stays on main is fine: the old folder has its old manifest.

**World data** only if a golden, read or check damaged it: rung 1 = `$RB/world/` back with Foundry
down (`rsync -a --delete`), then up. Rung 2 = `make -C $LIVE foundry-restore SNAP=<the §4.3 name>`
(a `-mac` snapshot only). Rung 3 = `git -C $LIVE revert -m 1 <merge>`, re-sync the 19 from the
reverted main, restart; push the revert only after the §7 probe passes on it; the park record
names the revert SHA (re-merging later needs `git revert <revert-sha>` first). Rung 4 = Foundry
down, recorded (overnight §5). Diagnose before climbing (overnight §11 "Foundry won't start").

## 12. Fix loop — O (≤ 3 rounds)

Starts on a red sync gate, a red probe, a lang hit, a styles miss, a shared or undeclared
difference, a dirty `cleanup`, or a read row that does not match.
1. Freeze the module. Roll it back first only if players could notice and the world is about to be used.
2. Reproduce in `$WT` without Foundry: a failing node test in the module (or a Python test for a
   gate). Frozen tests and goldens are never edited to fit.
3. Fix in the smallest step on `migrate/wave-5`; `node test/run.mjs`, `make foundry-<m>-check`;
   commit with `-- <paths>` and the trailers; `[declared]` for a behaviour change.
4. Merge the branch into main again (no-ff), strict gates on main (§5.4), copies into
   `$LIVE/.state/live-rollback/W5L-fix/` (never `W5L/`), re-sync that module from `$LIVE`, restart
   if its `module.json`/lang/styles changed (else one GM tab reload), §7, its golden twice, diff
   against the **original** before run.
5. Red again on the same step → roll the module back (§11), record under "Open for Joe", continue.
6. A fault in a golden script is fixed in the script (`test(foundry)` commit); both sides rerun.

**Foundry 14.369:** the first token change on a new scene may not persist — make one throwaway
token change on "ZZ Wave5 Scene" before asserting persistence; a "bug" gone on retry is this.

## 13. Cleanup, green, record — S then O

1. Delete every ZZ document (actors, scene and its region, journal note, chat lines). The §2.5
   count is 0 again. The player user loses the OWNER grant with the actor. No combat left.
2. Exactly one Foundry tab (the GM's), no player tab.
3. **Green** = every §7 pass row, §8 zero hits on every sampled surface (GM and player), §9 pass,
   §10 only declared differences and every read row, strict gates on main (§5.4).
4. Push: `git -C $LIVE push origin main`. The fork is not pushed (unchanged).
5. Record: append "W5L — wave 5 live" to `$LIVE/context/plans/merge-and-go-live-2026-10-11.md`
   (merge SHA, snapshot, the 19 deployed modules and versions, walls not synced, probe/lang/styles
   verdicts, golden table, reads, any rollback or fix commit, exit state). Fill
   [`wave-5-report.md`](wave-5-report.md) "Live phase". Update the module versions in
   `context/pentaryn.md` (attunement 0.3.0, senses 0.5.0 included) and the batch checklist step 3 date in `wave7-restart-batch.md`.
   Commit with `-- <paths>`, push.
6. Keep `$RB` and `OUT` until the morning report; never commit `.state/**` or `foundry/logs/**`.

**Exit invariant (every path, park included):** Foundry **up** `FROM=local`, world `pentaryn`
loaded, one GM tab answering `get-world-info`, tunnel down, updater paused, `HB` touched.

## 14. Order at a glance

| Step | Who | Gate to continue |
|---|---|---|
| §2 preconditions, deployed record | S | all nine hold |
| §3 probe-before, styles-before, before goldens ×2, `RB` module copies | S | runs clean, run1 = run2 |
| §4 down, world copy, backup | S | a `-mac` snapshot name |
| §5 main → branch, gates, branch → main, strict gates on main | O / S | every gate green on main |
| §6 19 syncs from main (not walls), up `FROM=local`, one GM tab | S | stamps = merge, manifests equal, old CSS paths gone |
| §7 boot probe | S | version == module.json, kit 1.1.0, describe, selftest ok, walls off |
| §8 lang: keys resolve; GM surfaces; player tab surfaces | S / O | zero raw keys |
| §9 styles: every `styles` entry loaded, D7 `.pentaryn-tt`, click-through rule | S | pass rows |
| §10 after goldens ×2, diffs, reads | S | only declared differences; reads as the table |
| §11–12 rollback / fix loop | O | ≤ 3 rounds |
| §13 cleanup, push main, record | S / O | exit invariant |
