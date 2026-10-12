---
title: Wave 3 — the gated live phase (goldens, deploy, probes, bridge reads, rollback)
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, live, wave3]
---

# Wave 3 — the gated live phase

**Read this when:** Joe has said **go** for the wave-3 live session, and you are running it or
reviewing how it ran. **Not this file:** what each module changed → [`wave-3-report.md`](wave-3-report.md)
and each `migrate-pentaryn-<m>.md` §Result · the shape this plan copies →
[`wave-2-live-plan.md`](wave-2-live-plan.md) · how wave 2 actually went live →
[`../merge-and-go-live-2026-10-11.md`](../merge-and-go-live-2026-10-11.md).

Nothing here has run. Written in the code phase (2026-10-11) while Joe was play testing. **Do not
start any step until Joe says go**, and never while a play session is on.

**What is different from wave 2.**
- **No `module.json` changes.** The wave-3 Wave 7 rows are written down in
  [`wave7-restart-batch.md`](wave7-restart-batch.md), but no module's `module.json` changes on this
  branch (`git diff origin/main..migrate/wave-3 -- 'foundry/module/*/module.json'` is empty). Versions
  stay the same: portals 0.4.4, creatures 0.1.1, senses 0.4.1, prompts 0.4.5, ties 0.19.4. So this
  deploy needs **no Foundry restart**, only one GM tab reload. The `.pentaryn-sync.json` stamp tells
  before from after, not the version. The Wave 7 restart batch is a separate, later session.
  **Not when the optional fixes ride along** (they did, W3L): see the §4 addendum.
- **The bridge module is unchanged.** The fork has one commit (`a5ce74c`), and it changes only the
  wording of the `pentaryn-read` description. Deploying it means a server build and a `kill -9` of
  the backend. There is no bridge module copy and no restart. It is optional (§4.3).
- **The Mac boots local.** Every start is `FROM=local`, and the tunnel stays down. No `vtt-*` target is
  used, and no snapshot is restored unless Joe says so.

## 0. Names, paths, roles

| Name | Path / value |
|---|---|
| `WT` | `/Users/joe/Documents/GitHub/pentaryn-wave3-wt` (branch `migrate/wave-3`, contains `origin/main`). **Module syncs only** run here (`make -C $WT foundry-<m>-sync`: the Makefile's `ROOT` is the worktree, so the sync copies the wave-3 tree and stamps its commit) |
| `LIVE` | `/Users/joe/Documents/GitHub/pentaryn` (branch `main`). **Lifecycle targets run here**: `foundry-down`, `foundry-up FROM=local`, `foundry-backup`, `login`, `foundry-bridge-status`, `vtt-status`. That keeps one ops log and one `.state/`. The action logs are `$LIVE/foundry/logs/`, read only. Never `git stash`, `reset --hard`, `checkout -- .` or `clean` here: the modified `foundry/logs/*.jsonl` files are the bridge's live logs |
| `FORK` | `/Users/joe/Documents/GitHub/foundry-vtt-mcp`, the live fork checkout (on `pentaryn` at `59ffcf2` on 2026-10-11). Its `packages/mcp-server/dist` is what the foundry tools run |
| `FORKWT` | `/Users/joe/Documents/GitHub/foundry-vtt-mcp-wave3-wt` (branch `migrate/wave-3` = `pentaryn` + `a5ce74c`) |
| `DATA` | `~/Library/Application Support/FoundryVTT/Data` (modules in `$DATA/modules/<id>`). Server logs: `~/Library/Application Support/FoundryVTT/Logs/` |
| `OUT` | `$WT/.state/live-goldens/wave3/` (git-ignored): `deployed-before.json`, `before/<m>.run{1,2}.json`, `after/<m>.run{1,2}.json`, `probes-before.json`, `probes.json`, `reads.md` |
| `RB` | `$WT/.state/live-rollback/wave3/`: `<id>/`, a byte copy of every deployed module folder taken before the deploy, and `world/`, a copy of `Data/worlds/pentaryn` and `Config` taken while Foundry is down |

Scripts: [`scripts/foundry/live-goldens/`](../../../scripts/foundry/live-goldens/).
- **New in wave 3:** `portals.js`, `creatures.js` and `senses.js`. They use the wave-2 split, `golden.shared` and `golden.declared`.
- **Unchanged:** the wave-1 `prompts.js` and `ties.js`. Their calls are still public and still have the same meaning. `ties.js` already uses `attributes.lookup`, which exists on both sides (`0291ce2a`).
- **Diff tool:** `diff.mjs`.

Each golden is one `eval-js` call:
- `script` is the file's text;
- `timeoutMs` is 60000 for every script, `senses.js` too: 60000 is the eval-js cap (a larger value is
  refused). senses waits for about ten debounced writes and finishes inside it (W3L);
- `purpose` is `"wave-3 live golden <before|after> <m> run <k>"`.

The call returns a JSON **string**. Save it to `OUT` exactly as returned.

**Who runs what.**
- **S** (Sonnet) runs the mechanical steps: fixed commands, eval-js scripts, and diffs against a stated expectation.
- **O** (Opus) runs the steps that need judgement or can cut off the session's tools: the fork deploy, the backend kill, every red diagnosis and the fix loop.
- **J** (Joe) does the steps that need a decision, his eyes at the table, or a Claude Code `/mcp` reconnect.

When an S step does not match its expectation, S **stops and hands it to O**. S never improvises.

## 1. The deploy set

| Module | What changed | Goldens | Notes |
|---|---|---|---|
| portals | blueprint migration; D-P1, S7 (`pp-` → `ppt-`), D-P3, D-P4, D-P5, D-P6, -27, C59 batches | `portals.js` (new) | guide §5 and Result |
| creatures | migration; C-D1 … C-D8, `inspect`/`status` | `creatures.js` (new) | needs a non-GM user in the world (any; it is never logged in) |
| senses | migration; S-1 … S-8, S-11 … S-14, J10, glow label | `senses.js` (new) | the `chain` alias stays on `game.pentaryn.chain` |
| prompts | migration; DP1–DP9, DP11, fractional CR | `prompts.js` (wave 1) | `selftest()` is new |
| ties | migration; B1, B1b, B2–B7, B9, B11, ties-46, two known-bug pins | `ties.js` (wave 1) | B3 also covers 4 untagged commits (wave-3 report) |
| lookup | one comment (`ff72c4d4`, TWIN note in `lookup-core.mjs`) | none (boot probe only) | the tree differs, so the stamp would read stale; the code itself is unchanged |

No other module's tree changed. The kit (`foundry/lib` 1.0.2) is unchanged. A module is in the set
when `git -C $WT diff --quiet <stamp.git> HEAD -- foundry/module/<id>` fails, or its stamp in
`$DATA/modules/<id>/.pentaryn-sync.json` is missing or `"dirty": true`. If main was deployed after
this plan was written, recompute the set from the stamps.

## 2. Preconditions (step 0) — **S**

1. Joe said go. No play session is running, and **no player is connected**. Check that the tunnel is down
   (`make -C $LIVE vtt-status`). If it is up, `make -C $LIVE tunnel-down` and record that. Then check
   that `get-world-info` shows only the Gamemaster as active. The creatures golden briefly gives a
   player user ownership of scratch actors. The senses golden posts and deletes chat lines.
2. **One GM tab**, the bridge's. Two GM tabs kick each other and break the bridge, and senses'
   Light reconcile runs once per GM tab (wave-3 report, Open for Joe). Close every other Foundry tab.
3. **The upload queue is empty**: no `*.job.json` in `.pentaryn-tmp/`, and `make -C $LIVE foundry-cloud` shows
   no `upload` line. If a job is waiting, follow the overnight plan §5.1: Foundry down, then
   `./.venv/bin/python -m scripts.foundry.cloud upload-pending`.
4. **`$WT` is clean and green.**
   - `git status --short` shows only untracked `.venv` and `foundry/logs/**`.
   - `git merge-base --is-ancestor origin/main HEAD` holds.
   - Every `node foundry/module/pentaryn-*/test/run.mjs` exits 0.
   - `make -C $WT foundry-modules-check` (static gates only) is 20/20.
   - `make -C $WT foundry-lib-check` passes.

   Note `git -C $WT rev-parse --short HEAD` as the deploy commit.
5. **No scratch documents.** Run one eval-js that counts names starting `"ZZ "` across
   `{actors, scenes, journal, combats}` (and items in the world). Every count must be 0.
6. Record what is deployed in `OUT/deployed-before.json`:
   - for each `pentaryn-*` and `foundry-mcp-bridge` folder in `$DATA/modules`, the `module.json`
     `version` and the whole `.pentaryn-sync.json`;
   - `git -C $FORK rev-parse HEAD` and `git -C $FORK branch --show-current`;
   - the start time of the running `backend.js`, from `make -C $LIVE foundry-bridge-status`.

   Then the byte copies, one per deploy-set module:
   `mkdir -p $RB && rsync -a "$DATA/modules/<id>/" "$RB/<id>/"`.

## 3. Step a — backup, then every "before" golden on the deployed code

1. **S**, all in `$LIVE`:
   1. `make foundry-down`.
   2. Rung-1 copy: `rsync -a "$DATA/worlds/pentaryn/" "$RB/world/pentaryn/"` and
      `rsync -a "$DATA/../Config/" "$RB/world/Config/"` (about 45 MB, taken while Foundry is down).
   3. `make foundry-backup REASON=wave3-live`. It refuses while Foundry runs. Note the snapshot name it prints.
   4. `PENTARYN_NONINTERACTIVE=1 make foundry-up FROM=local`.
   5. `make login NO_OPEN=1 USER_NAME=Gamemaster WORLD=pentaryn`, then point the one controlled Chrome tab at the printed URL.
      `WORLD` matters: a login without it opened space-journey on 2026-10-11.

   Probe: `game.world.id === "pentaryn"`. The first eval-js after a start may answer "not
   connected". If it does, retry once.
2. **S** Run the §5 boot probe once on the deployed code and save it to `OUT/probes-before.json`. This is the
   baseline: ties and prompts have no `describe()`, portals, creatures and senses have none either,
   and none of the five is frozen.
3. **S** Run each golden of §1 **twice** on the deployed code, saving `OUT/before/<m>.run1.json` and `run2.json`,
   in this order: portals, creatures, senses, prompts, ties.
   - After each run, read the output:
     - `skipped`: creatures and senses need this tab to be the active GM, and creatures needs a non-GM user. Stop and hand to O.
     - `cleanup`: any `…Left > 0`, a `settingsRestored: false`, a `ringRestored: false`, or `zzMessagesLeft > 0` means stop. Clean up by hand from the cleanup fields, then hand to O.
   - Then `node $WT/scripts/foundry/live-goldens/diff.mjs OUT/before/<m>.run1.json OUT/before/<m>.run2.json` must say
     `shared — identical`. A golden that differs from itself is state-dependent. O fixes the
     script before anything is deployed (§10.6).
   - Watch for timing-driven flags: the `…Settled` booleans in creatures and senses, and `settledLit`. A
     `false` means the module's debounced write did not land within 8 s. On a hidden tab that
     is J20. Bring the tab to the front and rerun once before handing to O.

## 4. Step b — deploy

1. **S** Module syncs, one per module in the deploy set:
   `make -C $WT foundry-portals-sync`, `…-creatures-sync`, `…-senses-sync`, `…-prompts-sync`,
   `…-ties-sync`, `…-lookup-sync`. Each one runs the module's check gates first. A red gate stops that module,
   which stays at its `RB` copy. Hand it to O. Never sync walls.
2. **S** No `module.json` may change. For each synced module,
   `diff "$RB/<id>/module.json" "$DATA/modules/<id>/module.json"` must print nothing. Wave 3 ships
   no `module.json` edit, so **no restart is needed**. If one does differ, the branch has picked up a
   Wave 7 row. Stop and hand to O. Either that module goes back to its `RB` copy, or Joe takes the
   restart, done as in the wave-2 plan §4.5 with `FROM=local`.
3. **O** The fork server (optional, decision W3-L1 in §12; default **deploy**).
   1. In `FORK`, `git status --short` must be empty. If not, stop.
   2. `git switch --detach migrate/wave-3`. This is a detached HEAD because the branch is checked out in `FORKWT`. No branch moves. The rollback is `git switch pentaryn`.
   3. Run, in order: `npm ci`, `npm run build:shared`, `npm -w @foundry-mcp/server run typecheck`,
      `npm -w @foundry-mcp/server test -- --run`, `npm -w @foundry-mcp/module test -- --run`,
      `npm run build:server`, `scripts/fork-footprint.sh`.
   4. If anything is red, `git switch pentaryn`, rebuild, and stop. The modules can still go on.

   No `build:foundry` and no copy into `$DATA/modules/foundry-mcp-bridge`: `a5ce74c` touches only
   `packages/mcp-server/src/fork/tools/pentaryn-read.ts`.
4. **O** Pick up the new backend, if 4.3 ran. `make -C $LIVE foundry-bridge-status`, then
   `kill -9 <backend.js pid>`. Kill the **backend only**, and **never** with a plain `kill`. On SIGTERM the backend
   exits 0, the wrapper reads that as "lost the lock" and exits too, and the session's tools go
   with it. The next tool call respawns the backend from the new `dist/`.
5. **S** **One GM tab reload** (navigate the tab to the same URL). This loads every synced module's new code
   (init/ready run again), and it reconnects the bridge after 4.4: the GM tab does not reconnect by
   itself. The first eval-js after the reload may say "not connected". Retry once.
6. **J** About the wrapper (the **CLI restart lesson**, [`../../foundry/README.md`](../../foundry/README.md)
   "Stale bridge processes", [`../../foundry/prompt-markers.md`](../../foundry/prompt-markers.md)):
   - **If the session's tools vanished,** the wrapper (`index.js`) died, for example after a plain `kill`.
     Only `/mcp` → reconnect `foundry`, or a Claude Code restart, brings them back. That is
     Joe's action in the main session. A subagent cannot reconnect: it reports and stops.
   - **If the tools are still there,** check the description. Wrappers built since 2026-10-10 hash every tool's
     description, so the reworded `pentaryn-read` text arrives as `tools/list_changed` within about 30 s.
     An older wrapper keeps the old text until `/mcp`.
   - **Nothing in steps c–e needs the new text.** `pentaryn-read` already exists in the wave-2 build,
     and it finds namespaces at run time. The description is the only change.

**§4 addendum (2026-10-12): when the optional fixes ride along.** Everything above holds for wave 3
alone. When `fix/optional-2026-10-11` (merge-and-go-live §7) deploys with it, as it did in W3L:
- **A Foundry restart is needed.** importer 1.1.0 → 1.1.1 and feedback 0.1.1 → 0.1.2 change their
  `module.json`, so step 4.2's diff is expected to differ for those two (not a red). Restart with
  `FROM=local` as in the wave-2 plan §4.5, then one GM tab reload.
- **A bridge module build is needed.** The optional fork commits touch the bridge module
  (`fork/handlers.*`, the new `fork/toggle-condition.*`), so step 4.3 also runs
  `npm run build:foundry` and copies the `dist/` into `$DATA/modules/foundry-mcp-bridge`, besides
  `build:server` and the backend `kill -9`.
- The importer installs with `make -C $WT foundry-importer-install` (there is no
  `foundry-importer-sync`), feedback with `make -C $WT foundry-feedback-sync`.

## 5. Step c — boot probes — **S**

One eval-js (`purpose: "wave-3 boot probe"`), saved to `OUT/probes.json`:

```js
const want = { portals: ["pentaryn-portals", "portals"], creatures: ["pentaryn-creatures", "creatures"],
  senses: ["pentaryn-senses", "senses"], prompts: ["pentaryn-prompts", "prompts"], ties: ["pentaryn-ties", "ties"],
  lookup: ["pentaryn-lookup", "rules"], movement: ["pentaryn-movement", "movement"], attunement: ["pentaryn-attunement", "attunement"],
  journal: ["pentaryn-journal", "journal"], dropbin: ["pentaryn-dropbin", "dropbin"], names: ["pentaryn-names", "names"],
  pings: ["pentaryn-pings", "pings"], cursors: ["pentaryn-cursors", "cursors"], importer: ["pentaryn-importer", "importer"],
  transform: ["pentaryn-transform", "transform"], combat: ["pentaryn-combat", "combat"],
  feedback: ["pentaryn-feedback", "feedback"] };
const out = { rootKeys: Object.keys(game.pentaryn ?? {}).sort(), rootFrozen: Object.isFrozen(game.pentaryn),
  chainAlias: game.pentaryn?.chain === undefined ? "absent" : game.pentaryn.chain === game.pentaryn?.senses?.chain ? "same" : "different",
  chainUninstall: typeof game.pentaryn?.chain?.uninstall };
for (const [m, [id, ns]] of Object.entries(want)) {
  const mod = game.modules.get(id), api = game.pentaryn?.[ns], r = { active: !!mod?.active, manifest: mod?.version ?? null };
  out[m] = r;
  if (!r.active) continue;
  try {
    r.ns = !!api; r.moduleApi = mod.api === api ? "same" : typeof mod.api;
    if (typeof api?.describe !== "function") { r.describe = "absent"; continue; }
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

**Pass, per wave-3 module.** Each must show:
- `active`, `moduleApi: "same"`, `versionMatches: true` (versions as in the intro), `frozen: true` and `notFunctions: []`;
- `namespace` equal to the `ns` above;
- `contract`: `pentaryn-<m>/api@1` for all five (`CONTRACT` in each `<m>-core.mjs` / `senses-core.mjs`);
- `selftest.ok: true` for prompts and ties. Portals, creatures and senses have no `selftest`.

**Senses** also needs `chainAlias: "same"` and `chainUninstall: "undefined"` (S-1, S-2).

**Every other module** must match `OUT/probes-before.json` exactly. Their code did not change, so
any difference is a red.

**Whole world:** `rootFrozen: false` (J10).

**"No console errors."** The boot console cannot be read (J21). This check rests on three things:
- this probe;
- prompts' and ties' `selftest`;
- the newest file in `~/Library/Application Support/FoundryVTT/Logs/` since the reload: no
  `error` or `Error` line naming a `pentaryn-*` module or `foundry-mcp-bridge`.

Any red probe goes to O (§10).

## 6. Step d — "after" goldens, diffs and timings

1. **S** Run the same scripts, twice each, saving to `OUT/after/<m>.run{1,2}.json`. Read `cleanup` and the `…Settled`
   flags as in §3.3.
2. **S** For each module, run
   `node $WT/scripts/foundry/live-goldens/diff.mjs OUT/before/<m>.run1.json OUT/after/<m>.run1.json`.
   - **portals, creatures, senses** (split goldens): exit 0 means shared is identical and nothing was left behind. Then
     check every `declared` path against the table below. A declared difference that is
     **not** in the table counts as a shared one.
   - **prompts, ties** (wave-1 goldens, no split): `diff.mjs` lists every difference as shared. Read each
     one against the table. Anything not in the table is a red.

   Any red goes to O (§10).
3. **S** Timings come from run 2 of each side (`diff.mjs …run2.json …run2.json`, timings section).
   - **Flag a call** when after/before > 1.5 **and** the before median is ≥ 0.05 ms, or when it is ≥ 5 ms slower.
   - **Rerun once before flagging.** The GM tab is hidden (J20), so rerun that golden once first.
   - **A flag that survives** goes to O as a performance finding, not a stop.
   - **Rows on one side only:** a timing row that exists only on the after side (`destinations`) has no ratio.

| Module | Declared differences expected (before → after) | Timing expectation |
|---|---|---|
| portals | `surface.keys` gains the kit members (`contract describe settings trace uninstall version`, the root `inspect`) and the -32 rows (`badges destinations link unlink`). `moduleApi` undefined → `"same"`. `frozen` false → true (D-P1). `contract` null → `"pentaryn-portals/api@1"`. `describe` `"absent"` → `{namespace: "portals", paths}`. `added.*` `"undefined"` → `"function"`. `cardForNull` `{threw, TypeError}` → `null` (D-P5). `spreadPastActorHandle`: before the token steps off (x/y ≠ 300/800), after it stays at 300/800 (D-P6), or `"skipped: …"` on both sides when the world has no aoe handle actor. `destinations … badges` `"absent"` → values: `linkDry`/`linkReal` `ok: true`, `afterLink` names both regions, `linkAgain` a no-op, `unlinkReal` `removed: 1`, `afterUnlink` back to the gate only, `inspectActor` `null`, `inspectMissing` a `NOT_FOUND` throw | `cardFor`, `spreadArrivalFree` within noise. `redraw` within noise (D-P3 debounces only the region hooks; `redraw` stays immediate) |
| creatures | `surface` (kit keys, `inspect`, `status`; `moduleApi` `"same"`; `frozen` true; `contract`; `describe`; `coreKeys` may gain the step-2 seams) (C-D2). `syncSceneArray` and `syncSceneString`: `{threw, TypeError}` → `0` (C-D3). `status` `"absent"` → `{keys, patchedWith, writer: true, version: "0.1.1", litIsNumber: true}`. `inspectSummon`, `inspectGmNpc`, `inspectAsPlayer` absent → plain JSON (C-D3) | `isCreature`, `listPlayer` within noise. `syncSceneConverged` may drop (-25 and -27 cut the extra passes). `S.writesToLight` and `S.writesForHands` are **shared**: C-D5/C-D7 change when the writes land, not how many there are |
| senses | `surface.keys` gains the kit members and `inspect`, `chain`. `lightKeys` loses `uninstall` and gains `status`, `recent`. `chainKeys` loses `uninstall`. `moduleApi` `"same"`. `frozen`/`chainFrozen` true. `sensesChainIsChain` `"no senses.chain"` → `true`. `chainUninstall`/`lightUninstall` `"function"` → `"undefined"` (S-1/S-2). `setupLightIsLightSetup` may flip (each row is wrapped). `reconcileOnToken`, `reconcileOnSquare`, `reconcileEnd`: `"undefined"` → the summary `{source, desired, restored, removed, lit, created, released, cleared}` (S-6). `lightStatus`, `inspectTarget`, `inspectCarrier`, `recent` `"absent"` → values (S-12). `linkByUuid` `false` → `true`. `linksAfterUuid` `[]` → one pair. `breakAfterUuid` `0` → `1` (S-8) | `chainLinks` may drop (-19 pairs cache). `carriedLight`, `profileFor`, `syncLightConverged` within noise |
| prompts | `surface` gains the kit members and the new rows (`inspect`, `markersOn`, `manifest`, `selftest`, …). `moduleApi` `"undefined"` → `"object"` (DP1/DP2). Everything else is **identical**: `status` has the same keys and values (the markers keep their ids, DP11), and so do `gather`, `gather160`, `list`, `model` and `settings`. `cleanup.ringRestored: true` on both sides (C58 changes only how the ring is written) | `model` within noise (DP8 caches only the hover tip). `gather`, `status`, `listAllScenes` within noise |
| ties | `surface.top` gains the kit members, `describeCard`, `closeDescription` and the B3 rows. `surface.known` / `study` / `attributes` gain the B3 additions. `d1["attributes.describe"]` and `d1["study.inspect"]` go `"function"` → `"undefined"` (B1b). `d1["describe (top, the card toggle)"]` stays `"function"` (B1: it is the kit's `describe()` now, and the label is kept on purpose). `moduleApi` → `"object"`. `frozen` → true (B11). In `lookup.*`, `pick(...).keys` may gain B3's new return keys. `registry`, `link`, `resolve*`, `ids`, `of` (values) and `flag` are **identical** | `resolve`, `describe` (= `attributes.lookup`), `of`, `ids`, `list` within noise; `of`/`ids` may drop (ties-19 … -23) |

## 7. Step e — `pentaryn-read` / `pentaryn-write` on the new namespaces — **S**

Make each call once. Record the answer and its log line in `OUT/reads.md`. Log lines are in
`$LIVE/foundry/logs/mcp-2026-10.jsonl`; read them with `tail -n 5` only. The first eval-js picks the real refs
(read only) and saves them in `reads.md`:
- a teleport region uuid with a destination (`game.scenes` → `regions` with an enabled `teleportToken` behaviour);
- a player-owned npc token uuid, or else any token uuid;
- the exact name of a **ZZ PC-type actor** (`type: "character"`, name starting `ZZ `) with a non-GM
  owner assigned (a throwaway ZZ player user). Create both if missing; delete both in cleanup (§9).
  **Never a real PC's name** (Caven, Marrith, Talo): overnight rules §10;
- the id of a scene that holds prompt markers.

**Never call** these UI rows through the bridge: portals `open` and `lookAt` (a window, the GM's
view), ties `show`/`edit`/`open…`, senses `light.pick`. They are read rows only in the sense that
they write no data.

| # | Call | Expect |
|---|---|---|
| 1 | `pentaryn-read {ns:"*", path:"describe"}` | the root lists `portals creatures senses prompts ties` beside the wave-2 namespaces (`rules movement attunement journal dropbin names pings cursors importer`); not walls |
| 2 | `pentaryn-read {ns:"<m>", path:"describe"}` for each of the five | `contract` as §5, `version` as the intro, the same paths as the module's `test/golden/describe.json` at the deploy commit |
| 3 | `pentaryn-read {ns:"prompts", path:"selftest"}`, `{ns:"ties", path:"selftest"}` | `ok: true` |
| 4 | portals: `{ns:"portals", path:"destinations", ref:"<region uuid>"}`, `{ns:"portals", path:"inspect", ref:"<region uuid>"}`, `{ns:"portals", path:"badges"}` | each destination with its card; inspect plain JSON; the badges on the GM's canvas |
| 5 | creatures: `{ns:"creatures", path:"status"}`, `{ns:"creatures", path:"inspect", ref:"<token uuid>"}` | `patchedWith: "libWrapper"`, `writer: true`, `version: "0.1.1"`; inspect plain JSON |
| 6 | senses: `{ns:"senses", path:"inspect", ref:"<token uuid>"}`, `{ns:"senses", path:"light.recent"}`, `{ns:"senses", path:"chain.links", opts:{scene:"<scene id>"}}` | plain JSON, no `"[max depth]"` leaf (S-12); a list; `[]` or the scene's chains |
| 7 | prompts: `{ns:"prompts", path:"status"}`, `{ns:"prompts", path:"list"}`, `{ns:"prompts", path:"manifests"}` | as `prompts.js`'s status; the marker scenes; the ring (no new entry: these do not gather) |
| 8 | ties: `{ns:"ties", path:"read", ref:"<ZZ PC name>"}` (B2: a name now resolves to the base actor), `{ns:"ties", path:"attributes.list"}` | the ZZ actor's ties (`[]` for a fresh ZZ actor; the point is that the name resolves, not NOT_FOUND); the registry |
| 9 | dry runs: `pentaryn-write {ns:"portals", path:"link", ref:"<region uuid>", opts:{to:"<its first destination uuid>"}, dryRun:true}` | `{ok: true, …}`, "already linked" as a no-op, nothing written (the region's `updatedTime` is unchanged) |
| 10 | `pentaryn-write {ns:"prompts", path:"replaceMany", opts:{call:"zz-none", replacements:[]}, dryRun:true}` | a coded refusal (`CALL_UNKNOWN` or `BAD_SPEC`), nothing written |
| 11 | refusals that must not run: `pentaryn-write {ns:"senses", path:"syncAll", dryRun:true}`, `{ns:"creatures", path:"syncAll", dryRun:true}`, `{ns:"ties", path:"study.reset", dryRun:true}` | `BAD_ARGS … has no dry run` each; **nothing ran** (the write log line says `ok:false`) |
| 12 | wrong tool: `pentaryn-read {ns:"portals", path:"link"}` | `BAD_ARGS` (a write row on the read tool) |
| 13 | non-GM: `make -C $LIVE login USER_NAME=<a player> LOGIN_HOST=zz1.localhost`, then in that tab's console `await game.users.activeGM.query("pentaryn-prompts.list", {})` | rejects `NOT_GM: <player> is not a GM`; the GM tab's tools still answer. **Close the player tab** right after |

Each read writes one compact line (`{ts, tool:"pentaryn-read", ns, path, ref, ok, ms, client}`, with no
args and no result: W2-B2). Each write or refusal writes a write line with `args`, `ok` and `code`.

## 8. Step f — the table checks the goldens cannot see — **J** with **O**

These are the declared visual and multi-client checks from each guide's live-check table. Joe
looks while O drives. Any check that needs a player view uses the §7.13 player tab, closed after. A
check that fails goes to §10 for that module.

| Module | Check (guide reference) |
|---|---|
| portals | S7 visual parity, as GM and as a player: the teleport dialog with one and with several destinations, badge hover, the GM right-click menu, the PortalCard in preview and edit, the Region config fieldset. D-P3: cast a spell template, and one badge per portal shows; drag a badge in edit mode, and it redraws on release. C59: toggle *Show where it leads* and remove a destination in the card window; the badge redraws once. D-P4, two-session follower carry, only if Joe wants the second GM tab for it (it breaks the one-tab rule for a minute). -27: snapshot on a scene without a background shows the message |
| creatures | Guide Result "Live check" 3–7: the strip as a player with two owned tokens, docked (C-D4); an Invisible owned token in the dark stays drawn; Argon's HUD open → the strip floats and drops back; `floatOverHud` off/on (C-D8); drag a summon without the strip flickering (C-D6); summon during combat with the light appearing within about 200 ms and a quiet console (C-D5, C-D7) |
| senses | S-5: Break chain on a real chained token; the chain goes on every client. S-11: drag a Torch into an unlocked world pack, and it has no Light activity; drag it onto an actor, and the flame button shows. S-14: a broken-glow light with a Bright radius brightens on each swell. Glow label: Token and Ambient Light config still read "Broken glow (wandering)". Perf: drags with a chain drawn stay smooth. S-4 (dev): `senses.uninstall()` then re-import `senses.mjs?v=2` re-wires; then reload the GM tab |
| prompts | DP3 through the `prompt-markers` tool on a real marker scene: `list`, `gather` (`crops: "auto"`), a `replace` dry run, `show`. Each output must match a run taken before the deploy. **Take that before-run in §3** if this check is wanted. DP4: double-click a marker and an ordinary token. DP5: hold a key, Cmd-Tab away and back. DP7: real crops, not grey boxes. DP8: toggle a door, rename an actor in view, and the panel follows. DP11 needs two GM tabs; only if Joe wants it |
| ties | B1: key 9 still toggles the description card. B7: the worn badge shows for the GM; each ties tab appears once on character, NPC and V2 sheets, also after a re-render. B8: the tie dialog, the inspect preview and a pinned card show no raw `PENTARYN_TIES.` keys. B6: a mark with a bad icon shows a flame |

## 9. Rollback, cleanup — S, O decides

**Rollback, per module.** This is code only: no wave-3 module migrates stored data. The flags keep their
scopes (`flagScope` stays a manifest-only Wave 7 edit), ties' serialised writes keep the record
shapes, and prompts' marker actors keep their ids.
1. `rsync -a --delete "$RB/<id>/" "$DATA/modules/<id>/"`.
2. Reload the GM tab. No `module.json` changed, so no restart is needed.
3. Run the boot probe (§5). The module shows the before surface (`describe: "absent"`, not frozen).
4. Run its golden once. `diff.mjs` against `before/<m>.run1.json` must be identical, shared and declared.
5. Record it in a "Rollback" row in the report: module, why, time. Leave the code as it is in `WT`.

Order matters for one pair: **senses and creatures share token lights** (C-L1). If only one of them
rolls back, run the other's golden once more, after the rollback, to check nothing crossed.

**The fork:**
1. `git -C $FORK switch pentaryn`.
2. `npm run build:server`.
3. `kill -9` the backend.
4. Reload the GM tab.

**World data,** only if a golden, a smoke row or a table check damaged it:
- **Rung 1** is the `$RB/world/` copy. Take Foundry down (`make -C $LIVE foundry-down`), then `rsync -a --delete` it back, then `foundry-up FROM=local`.
- **Rung 2** is `make -C $LIVE foundry-restore SNAP=<the §3.1 name>`, and it is Joe's call: it also reverts anything else done since. Never `FROM=latest`, and never a `-boss` snapshot.

**Cleanup — S.**
- No ZZ documents left (the §2.5 eval-js), and every `cleanup` block clean.
- The §7 ZZ PC-type actor and its throwaway ZZ player user are deleted (users are not in the §2.5
  document sweep: check `game.users` for a `ZZ ` name too).
- The creatures, portals and prompts settings equal their before values (each golden reports it).
- No player tab open.
- No chat lines from ZZ actors (senses reports `zzMessagesLeft`).
- Foundry **up**, the world loaded, and one GM tab answering `get-world-info`.
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
6. **A fault in the golden script** (not in the module, e.g. a probe that depends on state) is fixed in the script in its own
   `test(foundry)` commit. **Both** sides are then re-run with the fixed script. For the before side, roll that module back
   (§9) first.

**Foundry 14.369:** on a scene created since the server last started, a token's first delta change
may not persist server side. The three new goldens make a throwaway world-flag update first. A
"bug" that goes away on a retry is this server bug, and it is not a module fault.

## 11. Record — O

In [`wave-3-report.md`](wave-3-report.md), add a "Live phase (date)" section with:
- the deploy commit, the snapshot name, the deploy set, and the fork deployed or not;
- the probe verdicts;
- the golden verdict table (as wave 1's "Live goldens (before → after)") and the timing table;
- the `reads.md` table and the table-check verdicts;
- any rollback or fix-loop commit.

Fill each module guide's Result "live" cell, and the Declared rows' "session" note. After green, the merge into `main` and the push
(and the fork's `pentaryn` fast-forward to `migrate/wave-3`, if 4.3 ran) follow
[`../merge-and-go-live-2026-10-11.md`](../merge-and-go-live-2026-10-11.md) §1, appending a section there.
**Merging into `main` is not part of this plan's deploy:** the sync runs from `WT`.

## 12. Decisions for Joe before go

| # | Decision | Default |
|---|---|---|
| W3-L1 | Deploy the fork's description-only commit `a5ce74c` with this session (one `kill -9`, a GM reload that happens anyway), or leave it for the next fork deploy | deploy: the reload is already in the plan, and an LLM reading the old text is steered away from `pentaryn-read` for ties and prompts |
| W3-L2 | §8's two-GM-tab checks (portals D-P4, prompts DP11) break the one-tab rule for a minute | skip them; their node tests cover the logic (`markers-two-tabs.test.mjs`, the D-P4 KNOWN flip) |
| W3-L3 | §8's prompts DP3 compare needs a before-run of the `prompt-markers` tool on a real marker scene in §3 | take it (four tool calls, read only except `gather`'s ring entry) |

## 13. Order at a glance

| Step | Who | Gate to continue |
|---|---|---|
| 0 preconditions, record, `RB` copies | S | all six checks hold |
| a down, world copy, backup, up `FROM=local`, login; probe-before; before goldens ×2 | S | each run clean; run1 = run2 |
| b1–b2 module syncs; `module.json` unchanged | S | every gate green; no `module.json` diff |
| b3–b4 fork build, `kill -9` backend (W3-L1) | O | fork suites green |
| b5 one GM tab reload | S | eval-js answers in pentaryn |
| b6 wrapper | J (only if the tools vanished) | tools listed |
| c boot probes | S | §5 pass row per module; others = probes-before |
| d after goldens ×2, diffs, timings | S (O on red) | shared identical; declared as the table |
| e `pentaryn-read` / `-write` | S | the thirteen rows |
| f table checks | J + O | each guide's live check |
| cleanup, record | S, O | zero ZZ, settings restored, report written; Foundry up |
