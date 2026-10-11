---
title: Wave 2 — the gated live phase (goldens, deploy, probes, bridge smoke, rollback)
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, live, wave2]
---

# Wave 2 — the gated live phase

**Read this when:** Joe has said **go** for the wave-2 live session (L2 + L3 in
[`README.md`](README.md)), and you are running it, or reviewing how it ran. **Not this file:** what
each module changed → [`wave-2-report.md`](wave-2-report.md) and each `migrate-pentaryn-<m>.md`
§Result · the bridge tools themselves → [`../../foundry/mcp-fork.md`](../../foundry/mcp-fork.md) ·
the bridge lane's own deploy notes → [`wave-2-bridge-plan.md`](wave-2-bridge-plan.md) §6 (this plan
supersedes its order; its step 3, the dnd-scripts log, waits for the pentaryn merge).

Nothing here has run. Written in the code phase (2026-10-11) while Joe was play testing. **Do not
start any step until Joe says go**, and never while a play session is on.

## 0. Names, paths, roles

| Name | Path / value |
|---|---|
| `WT` | `/Users/joe/Documents/GitHub/pentaryn-wave2-wt` (branch `migrate/wave-2`) — every `make` runs here (`make -C $WT …`; the Makefile's `ROOT` is the worktree, so syncs copy the wave-2 tree) |
| `LIVE` | `/Users/joe/Documents/GitHub/pentaryn` (branch `main`): the dnd-scripts MCP server and the action logs (`$LIVE/foundry/logs/`). **Read only** in this plan |
| `FORK` | `/Users/joe/Documents/GitHub/foundry-vtt-mcp`, the live fork checkout (on `migrate/wave-1` at 2026-10-11, clean); its `packages/mcp-server/dist` is what the foundry tools run |
| `FORKWT` | `/Users/joe/Documents/GitHub/foundry-vtt-mcp-wave2-wt` (branch `migrate/wave-2`) |
| `DATA` | `~/Library/Application Support/FoundryVTT/Data` (modules in `$DATA/modules/<id>`); server logs in `~/Library/Application Support/FoundryVTT/Logs/` |
| `OUT` | `$WT/.state/live-goldens/wave2/` (git-ignored): `deployed-before.json`, `before/<m>.run{1,2}.json`, `after/<m>.run{1,2}.json`, `probes.json`, `smoke.md`, `leak-scan.json` |
| `RB` | `$WT/.state/live-rollback/wave2/<id>/`: a byte copy of every deployed module folder, taken before the deploy |

Scripts: [`scripts/foundry/live-goldens/`](../../../scripts/foundry/live-goldens/) — `lookup.js`,
`movement.js`, `attunement.js`, `journal.js`, `dropbin.js`, `walls.js` (wave 2; split into
`golden.shared` and `golden.declared`), the wave-1 `names.js`, `pings.js`, `cursors.js`,
`importer.js`, `ties.js`, `prompts.js`, and `diff.mjs` (compares a before/after pair). Each golden
is an `eval-js` call: `script` = the file's text, `timeoutMs: 60000`, `purpose: "wave-2 live golden
<before|after> <m> run <k>"`; the call returns a JSON **string**, saved as-is to `OUT`.

**Who runs what.** Sonnet runs the mechanical steps (marked **S**): commands with a fixed expected
output, eval-js scripts, diffs against a stated expectation. Opus (marked **O**) runs the steps that
need judgement or can sever the session's tools: the fork deploy and broker kill, every red
diagnosis, the fix loop. Steps marked **J** need Joe (a decision, or a Claude Code restart). A
Sonnet step that does not match its expectation **stops and hands to Opus**; it never improvises.

## 1. The deploy set

| Group | Modules | Goldens | Default |
|---|---|---|---|
| A — wave-2 migrations | lookup, movement, attunement, journal, dropbin | wave-2 scripts | deploy |
| A′ — walls | walls (switched off in Joe's world) | `walls.js` returns `skipped` while inactive | **not deployed**: Joe (2026-10-11, W2-L1) keeps walls off on purpose; no sync, no live check. §9 applies only if he re-enables it |
| B — kit 1.0.2 re-vendor (J10 guard retired), plus the PT fixes merged from `fix/playtest-2026-10-11` | names, pings, cursors, importer, ties, prompts | wave-1 scripts | **deploy** — Joe took W2-L2's default on 2026-10-11: one restart covers them |
| B′ — play-test fixes only | transform, combat | none (boot probe + the play-test LIVE CHECKs) | with W2-L2; otherwise they follow [`wave-1-playtest.md`](wave-1-playtest.md) §Deploy |

The deploy set is every module of the chosen groups **whose tree differs from what is deployed**:
`git -C $WT diff --quiet <stamp.git> HEAD -- foundry/module/<id>` fails, or the stamp in
`$DATA/modules/<id>/.pentaryn-sync.json` is missing or `"dirty": true`. If the play-test deploy
already happened, B′ may already be current (their stamps say so).

## 2. Preconditions (step 0) — **S**

1. Joe said go; no play session; **no player connected** (movement, journal and dropbin goldens
   change world settings for a moment, and a player's drop would land in the dropbin run).
2. **One GM tab** in the browser (the bridge's tab). A second GM tab doubles the `ready`/relay work
   the goldens exercise (W2-A1 purse, W2-J4 journals, W2-D1/-D2 dropbin). Check the Chrome tabs.
3. `$WT` is clean (`git status --short` shows only `foundry/logs/**`) and green: every
   `node foundry/module/pentaryn-*/test/run.mjs` exits 0; `make -C $WT foundry-modules-check`
   (static gates only) 19/19. Note `git -C $WT rev-parse --short HEAD` as the deploy commit.
4. Zero scratch documents: an eval-js returning
   `{actors, scenes, journal, combats}` counts of names starting `"ZZ "` → all 0 (every golden's
   `cleanup` counts ZZ documents, so a leftover from before would read as this run's).
5. Record what is deployed, to `OUT/deployed-before.json`: for each `pentaryn-*` and
   `foundry-mcp-bridge` folder in `$DATA/modules`, `module.json` `version` and the whole
   `.pentaryn-sync.json` (`git`, `dirty`, `digest`, `synced_at`). Then the byte copies:
   `mkdir -p $RB && rsync -a "$DATA/modules/<id>/" "$RB/<id>/"` for each. Note
   `git -C $FORK rev-parse HEAD` and `git -C $FORK branch --show-current` beside them.

## 3. Step a — backup, then every "before" golden on the deployed code

1. **S** `make -C $WT foundry-down`, `make -C $WT foundry-backup REASON=wave2-live`,
   `make -C $WT foundry-up`, `make -C $WT login WORLD=pentaryn` (the `WORLD` matters: wave 1's
   first login opened space-journey). Note the snapshot name the backup prints. Probe:
   `game.world.id === "pentaryn"`. The first eval-js after a start may answer "not connected":
   retry once.
2. **S** For each module of the deploy set that has a golden (walls: only if active), run its
   script **twice** → `OUT/before/<m>.run1.json`, `run2.json`. After each run, read `cleanup`:
   any `…Left > 0`, a `…Restored: false`, or a `ledger` value with `REFUSED`/`NOT` → stop, clean up
   by hand from the `cleanup` fields, hand to Opus. Then
   `node $WT/scripts/foundry/live-goldens/diff.mjs before/<m>.run1.json before/<m>.run2.json` must
   say `shared — identical` (a golden that differs from itself is state-dependent: Opus decides
   whether to fix the script before anything is deployed; pings' ring state is the known case, SF3).
3. **S** The ownership-leak scan (§8) once, as a baseline → `OUT/leak-scan-before.json`.

## 4. Step b — deploy

1. **S** Module syncs, one per module in the deploy set: `make -C $WT foundry-<m>-sync`. Each runs
   the module's check gates first; a red gate stops that module (it stays at its `RB` copy) — hand
   to Opus. Do not sync walls unless §9 applies.
2. **S** Which `module.json` changed: for each synced module,
   `diff "$RB/<id>/module.json" "$DATA/modules/<id>/module.json"`. Expected at the 2026-10-11
   heads: dropbin `0.2.1 → 0.2.2` (when main was deployed), names/pings/prompts/transform/combat
   version bumps (the play-test merge, when B/B′ are in), and the bridge (step 4) `0.8.3-pentaryn.1
   → .2`. The Wave 7 restart batch ([`wave7-restart-batch.md`](wave7-restart-batch.md)) is **not**
   part of this session: its `module.json` edits are not committed.
3. **O** Fork server, in `FORK`: `git status --short` empty, else stop. Then
   `git switch --detach migrate/wave-2` (the branch is checked out in `FORKWT`, so a detached HEAD;
   no branch moves, and the rollback is `git switch <recorded branch>`), `npm ci`,
   `npm -w @foundry-mcp/server run typecheck`, `npm -w @foundry-mcp/server test -- --run`,
   `npm -w @foundry-mcp/module run typecheck`, `npm -w @foundry-mcp/module test -- --run`,
   `npm run build:server`, `scripts/fork-footprint.sh`. Any red → `git switch` back, rebuild,
   stop (the bridge stays at wave 1; the modules can still go on).
4. **O** Bridge module, in `FORK`: `npm run build:foundry`; compare `ls "$DATA/modules/foundry-mcp-bridge"`
   with `packages/foundry-module` (expect `dist/ lang/ styles/ templates/ module.json`); then
   `rsync -a --delete packages/foundry-module/dist/ "$DATA/modules/foundry-mcp-bridge/dist/"` and
   `cp packages/foundry-module/module.json "$DATA/modules/foundry-mcp-bridge/module.json"`.
5. **O** The one restart (a `module.json` changed — the bridge's always does here):
   `make -C $WT foundry-bridge-status` → `kill -9 <backend.js pid>` (**never** a plain `kill`: the
   wrapper reads SIGTERM's exit 0 as "lost the lock" and takes the session's tools with it); then
   `make -C $WT foundry-down`, `make -C $WT foundry-up`, `make -C $WT login WORLD=pentaryn`. The
   first tool call respawns the backend from the new `dist/`, and the fresh GM tab connects to it.
   If nothing's `module.json` had changed, a GM tab reload would do instead.
6. **J** The running Claude session's MCP wrapper is the wave-1 build: it reaches the new broker
   (eval-js works) but lists `pentaryn-read`/`-write` only after `/mcp` → reconnect, or in a new
   session. Subagents cannot reconnect. Steps c and d need only eval-js; step e needs a session
   whose wrapper is the wave-2 build.

## 5. Step c — boot probes — **S**

One eval-js (`purpose: "wave-2 boot probe"`), saved to `OUT/probes.json`:

```js
const want = { lookup: ["pentaryn-lookup", "rules"], movement: ["pentaryn-movement", "movement"],
  attunement: ["pentaryn-attunement", "attunement"], journal: ["pentaryn-journal", "journal"],
  dropbin: ["pentaryn-dropbin", "dropbin"], walls: ["pentaryn-walls", "walls"],
  names: ["pentaryn-names", "names"], pings: ["pentaryn-pings", "pings"], cursors: ["pentaryn-cursors", "cursors"],
  importer: ["pentaryn-importer", "importer"], ties: ["pentaryn-ties", "ties"], prompts: ["pentaryn-prompts", "prompts"],
  transform: ["pentaryn-transform", "transform"], combat: ["pentaryn-combat", "combat"] };
const out = { rootKeys: Object.keys(game.pentaryn ?? {}).sort(), rootFrozen: Object.isFrozen(game.pentaryn) };
for (const [m, [id, ns]] of Object.entries(want)) {
  const mod = game.modules.get(id), api = game.pentaryn?.[ns], r = { active: !!mod?.active, manifest: mod?.version ?? null };
  out[m] = r;
  if (!r.active) continue;
  try {
    r.ns = !!api; r.moduleApi = mod.api === api ? "same" : typeof mod.api;
    if (typeof api?.describe !== "function") { r.describe = "absent"; continue; }
    const d = api.describe(), get = p => p.split(".").reduce((o, k) => o?.[k], api);
    r.version = api.version; r.versionMatches = api.version === mod.version; r.contract = api.contract;
    r.namespace = d.namespace; r.frozen = Object.isFrozen(api);
    r.notFunctions = (d.methods ?? []).filter(x => typeof get(x.path) !== "function").map(x => x.path);
    if (typeof api.selftest === "function") {
      const s = await api.selftest();
      r.selftest = { ok: !!s?.ok, failed: (s?.checks ?? []).filter(c => !c.ok).map(c => `${c.label}: ${c.detail ?? ""}`) };
    }
  } catch (e) { r.error = String(e?.message ?? e); }
}
return JSON.stringify(out);
```

Pass, per Group A module: `active`, `moduleApi: "same"`, `versionMatches: true` (lookup 0.3.0,
movement 0.1.2, attunement 0.2.1, journal 0.1.0, dropbin 0.2.2), `namespace` = the `ns` above
(lookup is `rules`), `frozen: true`, `notFunctions: []`, `selftest.ok: true` (all five have one; walls
has none). Group B: `describe` present for names, pings, cursors, importer (and ties/prompts as
before the deploy: ties and prompts have no `describe()` yet), selftests as wave 1. transform and
combat: active at their manifest version, `describe: "absent"`. `rootFrozen: false`.

"No console errors": the boot console cannot be read (J21). It rests on this probe, each full-tier
`selftest`, and the newest file in `~/Library/Application Support/FoundryVTT/Logs/` since the
restart: no `error`/`Error` line naming a `pentaryn-*` module or `foundry-mcp-bridge`. Any probe
red → Opus, §10.

## 6. Step d — "after" goldens, diffs and timings

1. **S** The same scripts, twice each → `OUT/after/<m>.run{1,2}.json`; `cleanup` read as in §3.2.
2. **S** `node $WT/scripts/foundry/live-goldens/diff.mjs OUT/before/<m>.run1.json OUT/after/<m>.run1.json`
   for each. Exit 0 = shared identical and nothing left behind. Exit 1 → Opus, §10. Then compare
   every `declared` difference with the table below; a declared difference that is **not** in the
   table is treated as a shared one.
3. **S** Timings from run 2 of each side (`diff.mjs …run2.json …run2.json`, timings section). Flag a
   call when after/before > 1.5 **and** the before median ≥ 0.05 ms, or when it is ≥ 5 ms slower.
   The GM tab is hidden (J20): rerun that golden once before flagging; a flag that survives goes to
   Opus as a performance finding (not a stop).

| Module | Declared differences expected in `golden.declared` (before → after) | Timing expectation |
|---|---|---|
| lookup | `surface.keys` + `contract describe settings trace uninstall version`, `moduleApi` undefined → object; `DL1` frozen false/false → true/true; `DL4.warning` null → `"<uuid> is a JournalEntry, not a JournalEntryPage — …"`; `namesConstructor.keys` one junk key → the full `names()` key set (055586bb); `selftestLabels` unchanged unless a check was added | warm `searchHalfCover`, `searchAllBooks`, `pageByName` much faster (DL5 book cache) |
| movement | `surface` (kit keys, `moduleApi`, `frozen`, `coreKeys` gains what the barrel adds); `statusKeys` + `sceneId settings version`; `statusForScene`: before answers the GM's canvas scene (no `sceneId`, `combatOnScene: false`), after answers the scratch scene (`combatOnScene: true`, `sceneId: <scene>`) | `status`, `ghostFor`, `pinsUnderTokens` within noise (F-M1's gain is per-token paths, measured by unit counters) |
| attunement | `surface`; `computeSlotsById`: before throws (`actor.items` of a string), after equals `slots`; `awayById`: before `[]`, after the away list; `stashDetail`: before a number, after `{count, created, away}` (items-journal-16); `stashUnknownIds` 0 both (D-A4 changes only a short container) | within noise |
| journal | `surface` (+ `inspect entriesOf statusFor lastReason`, kit keys), `coreKeys`; `reads` absent → values; `inspectActor` (D-J6) absent → the player | `status`, `report` within noise |
| dropbin | `surface`; `listBrief` before full entry keys (brief ignored), after the brief keys; `restoreResult`, `inspect`, `selftest` absent → values | `captureRoundTrip` may rise (coalesced writes); `all`/`list20` within noise |
| walls (§9) | `surface`; `analyze` absent → the run summary; `overlap` second `"result"` → `null` (-9); `undo` before `{threw: true, …}` (Foundry 14 `getFlag("wall-autocomplete")`), after `{deleted: 9, restored: 0}` and no stamped walls | `runEngineJs` faster (-5) |
| names, pings, cursors, importer, ties, prompts | wave-1 goldens, compared whole: expect **identical** (kit 1.0.2 is test-stub and guard changes; the PT fixes are not on the golden paths). pings' ring-state flags may flip (SF3, wave 1) | as wave 1 |

## 7. Step e — `pentaryn-read` / `pentaryn-write` smoke — **S** (in a wave-2 session, §4.6)

Each call once; record the answer and its log line in `OUT/smoke.md`. Log lines are in
`$LIVE/foundry/logs/mcp-2026-10.jsonl` (`tail -n 5`, read only).

| # | Call | Expect | Log line |
|---|---|---|---|
| 1 | `pentaryn-read {ns:"*", path:"describe"}` | the root lists `rules movement attunement journal dropbin` (+ names pings cursors importer), not walls while it is off | `{ts, tool:"pentaryn-read", ns:"*", path:"describe", ok:true, ms, client}` — no `args`, no result |
| 2 | `pentaryn-read {ns:"rules", path:"describe"}` | `contract: "pentaryn-lookup/api@1"`, the methods | as 1 |
| 3 | `pentaryn-read {ns:"rules", path:"search", opts:{query:"grapple", limit:3}}`; `{ns:"dropbin", path:"list", opts:{n:3, brief:true}}`; `{ns:"movement", path:"status"}`; `{ns:"attunement", path:"inspect", ref:"<a PC's exact name>"}` | real answers (3 hits; 3 brief entries; status with `version`; slots) | one compact line each |
| 4 | `pentaryn-write {ns:"importer", path:"import", dryRun:true}` | `ok`, the dry-run summary, nothing written | write line with `args`, `ok:true`, `summary` ending `(dry run) — ok` |
| 5 | `pentaryn-write {ns:"dropbin", path:"export", dryRun:true}` | `{ok:false, code:"BAD_ARGS", reason:"… has no dry run …"}`; `assets/drop-bin/drop-log.json` mtime unchanged | write line `ok:false`, `code:"BAD_ARGS"` |
| 6 | wrong tool: `pentaryn-write {ns:"rules", path:"search", opts:{query:"x"}}`; `pentaryn-read {ns:"dropbin", path:"export"}` | `BAD_ARGS` (read row on the write tool, write row on the read tool) | `ok:false`, `code:"BAD_ARGS"` |
| 7 | `pentaryn-read {ns:"ties", path:"describe"}`; `pentaryn-write {ns:"journal", path:"add", opts:{doc:"x"}}` | `NOT_FOUND` with the namespace list (ties has no `describe()`); `BAD_ARGS … needs a live Document — eval-js only` | refusals logged |
| 8 | non-GM: `make -C $WT login USER_NAME=<a player> LOGIN_HOST=zz1.localhost`, then in that tab's console `await game.users.activeGM.query("pentaryn-lookup.search", {query:"grapple"})`, `… .query("foundry-mcp-bridge.fork.eval", {script:"return 1"})`, `… .query("foundry-mcp-bridge.listActors", {})` | each rejects: `NOT_GM: <player> is not a GM` (kit `guarded`, the fork's `requireGM`), and `Access denied` for upstream (F16a, `guardBridgeQueries`); the GM tab's tools still answer. Close the player tab after | nothing in the action log (the refusal never reaches the server) |
| 9 | one `eval-js` (`return game.world.id`) | `pentaryn` | `eval-2026-10.jsonl` gains a line with `phase:"complete"` and `client` |

## 8. Step f — dropbin ownership-leak scan, rollback, cleanup

**The scan (read only — S).** From [`wave-1-playtest.md`](wave-1-playtest.md) §Deploy, with the
disposition test removed so revived NPCs whose disposition changed are caught too. Write nothing;
the list goes to Joe (`OUT/leak-scan.json`, and a line in the report). Cleaning it is Joe's call:
writing `null` also drops a per-token map a GM set on purpose.

```js
const L = CONST.DOCUMENT_OWNERSHIP_LEVELS, out = [];
for (const s of game.scenes) for (const t of s.tokens) {
  const a = t.actor, f = t.flags?.["pentaryn-dropbin"] ?? {}, o = t.delta?.ownership;
  if (a?.type !== "npc" || f.corpse || game.itempiles?.API?.isValidItemPile?.(t)) continue;
  if ((o?.default ?? 0) >= L.LIMITED) out.push({ scene: s.name, sceneId: s.id, token: t.name, tokenId: t.id,
    linked: t.actorLink, disposition: t.disposition, ownership: o, dropbinFlags: f });
}
return JSON.stringify(out);
```

A leaked token shows `dropbinFlags: {}` and `ownership: {default: 2}`; a friendly NPC a GM shared
on purpose looks the same, so every row is reviewed by Joe, not cleaned by rule.

**Rollback, per module (O decides, S runs).** Code only: no module in this deploy migrates stored
data (walls' flag-scope migration is unwired until Wave 7; journal's D-J5 claim leaves an empty
`flags.pentaryn-journal.claims.ensure` object on a User; the dropbin ledger keeps its shape).

1. `rsync -a --delete "$RB/<id>/" "$DATA/modules/<id>/"`.
2. If `$RB/<id>/module.json` differs from the one it replaces: one restart (§4.5 without the
   broker), else reload the GM tab.
3. Boot probe (§5): the module shows the before surface (Group A: `describe: "absent"`).
4. Run its golden once: `diff.mjs` against `before/<m>.run1.json` must be identical (shared and
   declared), as the wave-1 names drill did.
5. Record it (a "Rollback" row in the report: module, why, time) and leave the code as is in `WT`.

The bridge: `git -C $FORK switch <recorded branch>`, `npm ci`, `npm run build:server`,
`npm run build:foundry`, copy `RB/foundry-mcp-bridge/` back with rsync, `kill -9` the backend,
restart. World data: only if a golden or smoke damaged it — `make -C $WT foundry-restore` lists the
snapshots, `SNAP=<the §3.1 name>` restores (Joe's call: it also reverts anything else since).

**Cleanup — S.** Zero ZZ documents (the §2.4 eval-js); every `cleanup` block clean; the movement,
journal and dropbin world settings equal their before values (each golden reports it); no player
tab left open; the scratch chat cards deleted (walls). Keep `RB` and `OUT` until Joe merges; then
delete `RB`. Never commit `foundry/logs/**` or `.state/**`.

**Record — O.** In [`wave-2-report.md`](wave-2-report.md), a "Live phase (date)" section: deploy
commit, snapshot name, deploy set, probe verdicts, the golden verdict table (as wave 1's "Live
goldens (before → after)"), timing table, the smoke table, the leak-scan count, any rollback or
fix-loop commit. Fill each module guide's Result "live" cell and the bridge plan's "Deployed" row.

## 9. Walls, when Joe re-enables it (W2-L1)

Re-enabling is a world module setting and a reload, Joe's action. Then, before syncing walls:
`walls.js` twice on the still-deployed 0.2.0 code (§3.2), `make -C $WT foundry-walls-sync`, a GM
reload (walls' `module.json` is unchanged), the §5 probe row, `walls.js` twice (§6), diff. Scenes
already carrying run stamps keep undoing (dual-scope read). The Wave 7 flag-scope migration is
separate and later.

## 10. The fix loop — O

Entered on: a red sync gate, a red boot probe, a `shared` difference, an undeclared `declared`
difference, a leftover in `cleanup`, or a smoke row that does not match.

1. Freeze that module: no further goldens or smoke on it. If players could notice the fault (the
   world is about to be used) roll it back (§8) first; otherwise leave it deployed while diagnosing.
2. Reproduce in `WT` without Foundry: a new failing node:test in the module (`t.mock.timers`, no
   real timers) that shows the live difference. Frozen tests and goldens are never edited to fit.
3. Fix in the smallest step; module `node test/run.mjs`, `make -C $WT foundry-<m>-check`; commit
   with `git commit -m … -- <paths>`, `[declared]` and its own commit when behaviour changes, the
   session trailers at the end.
4. `make -C $WT foundry-<m>-sync`, GM reload (restart only if its `module.json` changed), §5 probe,
   the golden twice, diff against the **original** before run.
5. Red again on the same step → stop rule: roll the module back (§8), record why in the report and
   under "Open for Joe", and carry on with the other modules.
6. A golden-script fault (not a module fault, e.g. a state-dependent probe) is fixed in the script
   in its own `test(foundry)` commit, and **both** sides are re-run with the fixed script: the
   before side by rolling that module back (§8) first.

## 11. Order at a glance

| Step | Who | Gate to continue |
|---|---|---|
| 0 preconditions, record, `RB` copies | S | all six checks hold |
| a backup, before goldens ×2, leak scan | S | each run clean; run1 = run2 |
| b1–b2 module syncs, module.json list | S | every gate green |
| b3–b5 fork build, bridge module, kill -9, the one restart | O | fork suites green; login lands in pentaryn |
| b6 wrapper reconnect | J | `pentaryn-read` listed |
| c boot probes | S | §5 pass row per module |
| d after goldens ×2, diffs, timings | S (O on red) | shared identical; declared as the table |
| e bridge smoke | S | the nine rows |
| f leak scan, cleanup, record | S, O | zero ZZ, settings restored, report written |
