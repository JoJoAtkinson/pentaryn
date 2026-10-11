---
title: Migration guide — pentaryn-names to the addon blueprint
status: plan
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan, migration, names]
---

# Migrating `pentaryn-names` to the blueprint

**Read this when:** you are about to bring `pentaryn-names` up to the addon blueprint (fix phase of
the 2026-10 code audit). **Not this file:** the general procedure, the kit and the rules →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · why the blueprint is
shaped this way → [`../addon-blueprint-2026-10.md`](../addon-blueprint-2026-10.md) · the audit
finding text → [`../code-audit-2026-10/names.md`](../code-audit-2026-10/names.md).

Every line number below is a **snapshot** line number: pentaryn `ee505c2` plus the uncommitted tree
of 2026-10-10 20:15 EDT. On 2026-10-10 the live `foundry/module/pentaryn-names/` was byte-identical
to the snapshot, but check it again before step 1 (§3, step 0). Score the module live with
`conformance.py --module names --markdown` before you start; the table in §1 is history the moment
anything changes.

| | |
|---|---|
| Tier | **small** (D16). Plus the opt-in kit file `api` (and its dep `resolve`, already pulled in by `publish`) because the module publishes legacy methods, one of which writes (§6, decision N1) |
| WAIT | **no**. Not in `scripts/foundry/blueprint/wait.json`; touches no combat, transform or aoe file |
| Findings absorbed | transform-creatures-32, -33, -38, and the names part of -20 |
| Steps | 10 (step 0 plus 9) |
| Effort | **S**: about half a day of agent work plus one review checkpoint; one Wave 7 restart item |
| Prerequisites | none beyond kit 1.0.1 (landed) — re-vendor with `vendor.py sync <short>` if the lock says 1.0.0 |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module names --markdown`. No status changed on the snapshot. |
| Tier on the scorer | `vendor.py sync names --tier small` (step 1) now records `"tier": "small"` in `lib/kit.lock.json`, and the scorer reads it until Wave 7 adds `flags.pentaryn.tier`: from step 1 on it scores as small in place — no scratch copy, no hand-set flag |
| Note-only findings | transform-creatures-38 is a gap-fill stub: `audit-findings.json` holds only id and title (no file or line); the full text is in [`../code-audit-2026-10/names.md`](../code-audit-2026-10/names.md) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today

Scored with `conformance.py --snapshot` after setting `flags.pentaryn.tier = "small"` on a scratch
copy (the shipped `module.json` has no tier, so the baseline scored it as full: 64.1 %). As small:
**67.6 % (25/37 fail-class rules)**. Warn: C02. Manual: C31.

| Rule | Today | Detail (snapshot) | Cleared by |
|---|---|---|---|
| C01 id == folder | pass | | |
| C02 minimum 14 (warn) | warn | `module.json` `"minimum": "13"` | step 9 (Wave 7) |
| C03 dnd5e iff touched | pass | no dnd5e use, no relationship | keep it that way |
| C04 languages | pass | | |
| C05 reachable | pass | one file | |
| C06 / C06w styles | pass | no CSS | |
| C07 `flags.pentaryn` | **fail** | no tier, namespace, cssPrefix; `flagScope: "names"` | step 9 (Wave 7). The module writes no flags, so the flagScope fix is metadata only — no data migration |
| C08 socket | pass | | |
| C09 relationships | pass | | |
| C10 size (warn) | pass | 60 lines | |
| C11 pure core | **fail** | no `*-core.mjs` | step 2 |
| C12 `MODULE` once | **fail** | `MODULE` defined 0× | step 2 |
| C13 stray `.md` | pass | | |
| C14 vendored kit | **fail** | no `lib/kit.lock.json` | step 1 |
| C15 `import * as` | pass | | |
| C16 import graph | pass | | |
| C17 module-scope hooks | pass | only one file, which is the entry | stays pass after the split (hooks move into the feature through `reg`) |
| C18 features | **fail** | no feature file | step 3 |
| C19 emitted hook names | pass | emits none | |
| C20 hooks golden | **fail** | no `test/golden/hooks.json`; glue test does not `pinJSON("hooks")` | step 1 |
| C21–C23 settings | pass / n/a | no settings | |
| C24 empty catch | pass | | |
| C25 console prefix | pass | | |
| C26 publish timers | pass | publishes synchronously at `ready` (names.mjs:52) | |
| C27–C29 `[full]` | n/a | small tier | |
| C30 queries | pass | | |
| C31 writes ok/fail (manual) | manual | `sync` writes and returns a bare count; stays legacy (§3 step 5) | |
| C32 patches | pass | | |
| C33 private internals | n/a | | |
| C34 nested lang | **fail** | top-level key `PENTARYN_NAMES.Synced` (lang/en.json:2) | step 7 |
| C35 i18n wrapper / coverage | pass | 100 % | |
| C36 hard-coded English (warn) | pass | | |
| C37 / C37w CSS | pass | | |
| C38 cssPrefix unique | n/a | no cssPrefix (C07) | step 9 |
| C39 `test/run.mjs` + ModuleSpec | **fail** | no `test/run.mjs`; `config.py:179-187` `check=_STATIC` | step 1 (run.mjs) + step 8 (ModuleSpec) |
| C40 tier test files | **fail** | missing `core.test.mjs`, `glue.test.mjs` | step 1 (glue) + step 2 (core) |
| C41 VERSION test | **fail** | | step 2 |
| C42 fixtures synthetic (manual) | n/a | | |
| C43 fixed run.mjs | n/a | no run.mjs (C39) | step 1 |
| C44 README order | **fail** | README.md:1-16 has none of the use-doc §7 sections | step 8 |
| C45 CHANGELOG | **fail** | | step 8 |
| C46 routed | pass | | (step 8 adds the task route from -20) |
| C47 adjustments rows | pass | | |
| C48 reserved names | pass | `sync`, `relabel`, `shortName` | |
| C49 hot hooks (warn) | pass | | |
| C50 publish `when` | n/a | `publishNamespace` not used yet | step 5 |
| C51 settings rows | n/a | | |
| C52 `legacyName` until | pass | | |

**Expected after step 9:** 100 % of fail-class rules (37/37) once the Wave 7 batch (C07) and the
pending-wiring ModuleSpec edit (C39) have landed; 35/37 before them.

## 2. Target layout

```
foundry/module/pentaryn-names/
  module.json            Wave 7: flags.pentaryn {tier: small, namespace: names, flagScope: pentaryn-names,
                         cssPrefix: pnm-, generation: 14, afterSync}, minimum 14
  names.mjs              ENTRY (esmodules[0], name unchanged — D11): wiring, publish        ≈ 60 lines
  names-core.mjs         PURE: MODULE, SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS ({}),
                         shortName, relabel, planTokenRelabels                              ≈ 70 lines
  api-manifest.mjs       PURE data: three legacy rows (sync, relabel, shortName)            ≈ 40 lines
  rename.mjs             FEATURE: install(reg, ctx) — preUpdateActor/updateActor; export sync() ≈ 60 lines
  lib/                   vendored: errors, log, hooks, publish, resolve, api + kit.lock.json
  lang/en.json           nested: { "PENTARYN_NAMES": { "Synced": "…" } }
  test/run.mjs           fixed body (use-doc §6), LEGACY = []
  test/core.test.mjs, test/glue.test.mjs
  test/fixtures/legacy-names.mjs   verbatim oracle of names.mjs:7-16 (and the planner loop 25-31)
  test/fixtures/world.mjs          synthetic actors / scenes / tokens
  test/golden/hooks.json, test/golden/legacy-surface.json, test/golden/surface.json (from step 5)
  test/kit/              vendored test kit
  README.md              use-doc §7 order
  CHANGELOG.md
```

Old → new (snapshot `foundry/module/pentaryn-names/names.mjs`):

| Snapshot lines | What | Goes to |
|---|---|---|
| 1-4 | header comment | `names.mjs` file-map header + README "What the player sees" |
| 6-9 `function shortName(name)` | pure rule | `names-core.mjs` verbatim (exported) |
| 11-16 `function relabel(label, oldName, newName)` | pure rule | `names-core.mjs` verbatim (exported) |
| 25-31 token loop inside `sync` | pure planner | `names-core.mjs` `planTokenRelabels(tokens, {actorId, oldName, newName, canEdit})` |
| 18-39 `async function sync(actor, oldName, newName)` | Foundry writes + toast | `rename.mjs` (exported; calls the planner) |
| 41-44 `Hooks.on("preUpdateActor", …)` | hook | `rename.mjs` `install`: `reg.on("preUpdateActor", …, {label: "preUpdateActor: remember old name"})` |
| 46-49 `Hooks.on("updateActor", …)` | hook | `rename.mjs` `install`: `reg.on("updateActor", …, {label: "updateActor: relabel"})` |
| 51-60 `Hooks.once("ready", …)` + frozen-root guard | publish | `names.mjs` `onReady`: `buildApi(MANIFEST, impl, {members})` + `publishNamespace("names", api, {moduleId: MODULE})` |
| `lang/en.json:2` | flat key | nested under `PENTARYN_NAMES` (same flattened key) |
| `README.md:1-16` | prose | rewritten in use-doc §7 order; the rule text kept verbatim under "What the player sees" |

## 3. Steps

Each step is one reviewable diff, behaviour-neutral unless marked **[declared]**. "Before" tests are
written and passing against the unchanged code first; the step's diff must not touch them
(`git diff --stat -- foundry/module/pentaryn-names/test/golden foundry/module/pentaryn-names/test/*.test.mjs`
is empty), except where a step is declared and says which pin moves.

### Step 0 — gate check (no diff)

1. `scripts/foundry/blueprint/wait.json` does not list `pentaryn-names`.
2. Re-anchor: `diff -ru <snapshot>/pentaryn/module/pentaryn-names foundry/module/pentaryn-names`
   (the snapshot lives in the workflow scratchpad; when it is gone use
   `git diff ee505c2 -- foundry/module/pentaryn-names`). Empty on 2026-10-10. Any hunk: re-read the
   affected line ranges in §2 before editing.
3. `./.venv/bin/python scripts/foundry/blueprint/conformance.py --module names --markdown`.

### Step 1 — characterise (tests and vendored files only; the checkpoint)

Absorbs nothing yet; it is the oracle every later step runs against.

- `vendor.py sync names --tier small --kit api` → `lib/{errors,log,hooks,publish,resolve,api}.mjs`,
  `test/kit/`, `lib/kit.lock.json`. Nothing imports `lib/` yet, so the shipped behaviour is unchanged
  (the files are synced to Data/ but never loaded). Clears **C14**.
- `test/run.mjs` with the fixed use-doc §6 body, `LEGACY = []`. Clears C39's file half and C43.
- `test/fixtures/legacy-names.mjs`: verbatim copies of `shortName` and `relabel` (names.mjs:7-16)
  and of the planner loop (names.mjs:25-31) wrapped as
  `legacyPlan(tokens, {actorId, oldName, newName, canEdit})` → `[{_id, name}]`.
- `test/core.test.mjs` (oracle half; the core half arrives in step 2). Table from -32's
  `behaviourTest`, run against the oracle:
  - `shortName("Glubbek, Kuo-toa Net-Mender")` → `"Glubbek"`; `shortName(null)` → `""`;
    `shortName(" A , b")` → `"A"`; hostile: `shortName(undefined)` → `""`, `shortName(42)` → `"42"`,
    `shortName(",")` → `""`.
  - `relabel("Bob","Bob","Rob")` → `"Rob"`; `relabel("Glubbek","Glubbek, Net-Mender","Brakka, Elder")`
    → `"Brakka"`; `relabel("Glubbek, Net-Mender","Glubbek, Net-Mender","Brakka, Elder")` →
    `"Brakka, Elder"`; `relabel("Fishface","Glubbek, Net-Mender","X")` → `null`;
    `relabel("Bob","Bob, ","X")` → `"X"`; `// KNOWN:` `relabel("",",x","y")` → `"y"`;
    `// KNOWN:` `relabel(" Bob ", " Bob ", "Rob")` → `"Rob"` but `relabel("Bob", " Bob , x", "R")`
    → `"R"` (padded old names make the short form differ from the full name).
  - planner: tokens `[{id:"t1",actorId:"a",name:"Bob"},{id:"t2",actorId:"b",name:"Bob"},
    {id:"t3",actorId:"a",name:"Rob"},{id:"t4",actorId:"a",name:"Bob",locked:true}]`, `actorId:"a"`,
    old `"Bob"`, new `"Rob"`, `canEdit: t => !t.locked` → `[{_id:"t1",name:"Rob"}]`;
    `// KNOWN:` sibling case — two tokens with `actorId:"base"` named `"Goblin"`, old `"Goblin"`, new
    `"Goblin Boss"` → both relabelled (the synthetic-actor question goes to the live test, §5).
- `test/glue.test.mjs` — `installFoundry()` with one GM user, actor `a` (`prototypeToken.name "Bob"`),
  two scenes holding tokens of `a` (one locked via `canUserModify → false`) and one of another actor;
  then `await import("../names.mjs")`, `fire("init"/"setup"/"ready")`:
  - `pinJSON("hooks", F.hooks)` → `golden/hooks.json` =
    `[on preUpdateActor, on updateActor, once ready]` (C20 small-tier form).
  - `utilsSource === "foundry"` unless `PENTARYN_TEST_SHIMS=1`; print `foundryBuild`.
  - `preUpdateActor` with `{name:"Rob"}` sets `options.pentarynOldName = "Bob"`; with
    `{name:"Bob"}` (unchanged) and with `{img:"x"}` it leaves options untouched.
  - `updateActor` from another `userId` → no `F.calls`; with `options.pentarynNames` → none; own
    user → `F.calls` in order: actor update `{"prototypeToken.name":"Rob"}` with
    `{pentarynNames:true}`, one `updateEmbeddedDocuments("Token", [...])` per scene with changes,
    `notifications.info` text `Token labels updated to "Rob" (3).` (count = proto + placed).
  - `// KNOWN:` (-33) the actor's `update()` rejects → `process.on("unhandledRejection")` counter is
    1 and no `pentaryn-names |` line is printed.
  - publish: after `ready`, `Object.keys(game.pentaryn.names)` ⊇ `["sync","relabel","shortName"]`
    — pinned as `golden/legacy-surface.json` and asserted as a **subset**, so step 5's additive kit
    members do not move it; with `game.pentaryn = Object.freeze({import(){}})` set before `ready`,
    the root is rebuilt and keeps `import` (both load orders: importer-first and names-first).
  - `api.sync(actorA, "Bob", "Rob")` returns the count; `api.sync("a", "Bob", "Rob")` throws a
    `TypeError` — `// KNOWN:` (-38).
- `GOLDEN_UPDATE=1 node test/run.mjs` against the unchanged `names.mjs`, then `node test/run.mjs`
  green. **Checkpoint:** the diff is `lib/`, `test/` only; the agent commits it as the checkpoint.

### Step 2 — pure core (absorbs **transform-creatures-32**; clears C11, C12, C41)

- New `names-core.mjs`: `MODULE = "pentaryn-names"`, `SHORT`, `NS = "names"`, `VERSION = "0.1.0"`,
  `CONTRACT = "pentaryn-names/api@1"`, `I18N = "PENTARYN_NAMES"`, `CSS = "pnm-"`,
  `FLAG_SCOPE = MODULE`, `HOOKS = Object.freeze({})`; `shortName` and `relabel` moved **verbatim**
  from names.mjs:7-16; `planTokenRelabels` with the exact skip rules of names.mjs:28-30
  (`t.actorId !== actorId || !canEdit(t)` skip; `label !== null && label !== t.name` keep).
- `names.mjs` imports them; the loop in `sync` becomes
  `planTokenRelabels([...scene.tokens], {actorId: actor.id, oldName, newName, canEdit: t => t.canUserModify(game.user, "update")})`.
- Test **before** the move (added to `core.test.mjs` in this step, against the new file): the step-1
  table, asserting `core.fn(...)` deep-equals `oracle.fn(...)` row by row; the core is imported first
  and bare (purity); `VERSION === module.json.version`; `MODULE === manifest.id`. `NS`/`CSS` against
  `flags.pentaryn` are added in step 9 when the manifest carries them.
- Glue golden unchanged.

### Step 3 — feature split and entry wiring (clears C18; C17 stays pass)

- New `rename.mjs`: `install(reg, ctx)` registers the two handlers through `reg.on` with the labels
  in §2 (handler bodies verbatim from names.mjs:42-49), exports `sync` (names.mjs:18-39 verbatim, using
  the core planner) and `uninstall()` (no state).
- `names.mjs` becomes the entry: file-map header, `makeLog(MODULE)`, `hookRegistry(MODULE, log)`,
  `ctx`, `rename.install(reg, ctx)` called **synchronously in the module body** (use-doc §6,
  migrating modules), then `Hooks.once("ready", onReady)` — the only module-scope hook.
- `onReady` keeps today's publish block (names.mjs:52-59) verbatim for now (step 5 replaces it).
- Behaviour notes: `reg.on` wraps with `guard` (pass-through). The `updateActor` body is a statement
  call (`sync(...)`, no `return`), so the guard sees `undefined` and the rejection stays unhandled
  exactly as today; step 4 is where that changes.
- Before-tests: step 1 glue unchanged — `golden/hooks.json` must still read
  `[on preUpdateActor, on updateActor, once ready]` (registration order and kind identical).
  New: `api.describe` absent still (publish untouched).

### Step 4 — **[declared]** rename failure is logged (absorbs **transform-creatures-33**)

- `rename.mjs`: `sync(actor, options.pentarynOldName, actor.name).catch(err => ctx.log.warn("relabel after rename failed", { actor: actor.uuid, from: options.pentarynOldName, to: actor.name }, err));`
  → console line `pentaryn-names | relabel after rename failed` (text exactly as the finding).
- Pin that moves: the step-1 `// KNOWN:` unhandled-rejection row flips to "counter 0, one
  `console.warn` whose first argument is `pentaryn-names | relabel after rename failed`". Separate
  commit naming the declared change. Console-only (no on-screen change), so it needs no table time;
  list it in the plan file and the live-test handoff for completeness.

### Step 5 — kit publish and API manifest (clears C50 as pass; C31 reviewed)

- New `api-manifest.mjs` (pure data): `module`, `namespace: "names"`, `version`, `contract`,
  `flagScope`, rows:
  - `sync` — `params: [{name:"actor"}, {name:"oldName"}, {name:"newName"}]` (**not** `ref` yet, so
    `bind` passes it through untouched), `returns: "number"`, `gm:false`, `writes:true`,
    `legacy:true`, `sideEffects: ["Actor.update prototypeToken.name", "Scene.updateEmbeddedDocuments Token", "ui.notifications.info"]`,
    `doc` from -38's README text.
  - `relabel`, `shortName` — `writes:false`, `legacy:true`, pure.
- `names.mjs` `onReady`: `buildApi(MANIFEST, { sync, relabel, shortName }, { members: { uninstall, trace: () => log.traces() }, extras: () => ({ hooks: reg.ids().map(h => ({ name: h.name, label: h.label })), events: {} }) })`
  then `publishNamespace(NS, api, { moduleId: MODULE })`. Delete names.mjs:51-59's guard block.
- What changes (additive, **[declared]** small): the namespace object is now frozen and carries
  `version`, `contract`, `describe()`, `settings()`, `trace()`, `uninstall()`; it is also
  `game.modules.get("pentaryn-names").api`; `pentaryn-names.ready` and `pentaryn.ready` fire; the
  kit's one-tick re-alias runs (compat until items-journal-1). Nothing outside the module reads
  `game.pentaryn.names` (repo grep, 2026-10-10).
- Before-tests: `legacy-surface.json` subset still holds; frozen-root case still keeps `import`.
  New pins (first writes, not changes): `golden/surface.json` (`surfaceOf(api)`), `describe().methods`
  paths deep-equal `["sync","relabel","shortName"]` (-38's test), `Object.isFrozen(api)`.

### Step 6 — **[declared]** `sync` accepts a ref (absorbs **transform-creatures-38**)

- Row `sync`: first param renamed `{name: "ref", kind: "actor"}`; `legacy:true` stays, so `bind`
  resolves with `required:false` (a miss → `null`, then today's `TypeError`), exact-match only
  (`resolveRef`, never substring). An `AMBIGUOUS` name on a write row comes back as
  `fail("AMBIGUOUS", …)` instead of throwing.
- Pin that moves: `api.sync("a", "Bob", "Rob")` → `1` (was `TypeError`); `api.sync(actorA, …)`
  unchanged. Add: `api.sync("Bob", …)` by exact name → resolves; `api.sync("Bo", …)` → `TypeError`
  (no substring).
- README API block from -38: return shape, "a rename through `actor.update` already relabels on the
  renaming client — call `sync` only to repair", "`relabel`/`shortName` are pure previews".

### Step 7 — i18n shape (clears C34; reload only)

- `lang/en.json` → `{ "PENTARYN_NAMES": { "Synced": "Token labels updated to \"{name}\" ({count})." } }`.
  Foundry flattens nested keys, so `PENTARYN_NAMES.Synced` resolves exactly as before.
- In `rename.mjs`, `game.i18n.format("PENTARYN_NAMES.Synced", {name, count})` →
  `_loc("PENTARYN_NAMES.Synced", { name: newName, count })` (D1; v14 `localize` interpolates). The
  toast stays `ui.notifications.info(...)` in this step.
- Before-test: glue's `notifications.info` text pin unchanged (byte-identical rendered string);
  `i18n` gate (`make foundry-names-check`) green.
- Optional, **[declared]** console-only: `ui.notifications.info` → `ctx.log.notify("info", msg)`
  (use-doc §5.4) adds one `pentaryn-names | …` info line; skip if Joe prefers a quiet console.

### Step 8 — docs and tooling wiring (clears C44, C45; C39's spec half)

- `README.md` rewritten in use-doc §7 order (`**Read this when:**` line; What the player sees · Settings
  `n/a — none` · API · Data written (prototype token name, token names; no flags) · Flags other
  modules read `n/a` · Events `n/a — emits none; listens preUpdateActor, updateActor` · Patches `n/a` ·
  Two sessions / who writes (the renaming client only, `userId === game.user.id`; tokens it cannot
  edit are skipped) · Extending · Pitfalls (the `// KNOWN:` rows; synthetic-token siblings) · Files ·
  Tests · Sync). `CHANGELOG.md` with 0.1.0 and the declared items of steps 4-6.
- `context/foundry/README.md` "Route by task": row "token labels didn't follow a rename →
  `foundry/module/pentaryn-names/README.md`" (the names part of **transform-creatures-20**).
- Pending-wiring batch (blueprint use-doc §12, not this module's diff):
  `scripts/foundry/ops/config.py:181` `check=(*_STATIC, "node-test")` — clears **C39**.

### Step 9 — Wave 7 restart batch (C07, C02)

- `module.json`: `flags.pentaryn = { tier: "small", namespace: "names", flagScope: "pentaryn-names",
  cssPrefix: "pnm-", generation: 14, afterSync: [...] }` (afterSync from `config.py:182-186`),
  `compatibility.minimum: "14"`. Finding transform-creatures-24 suggests leaving names' minimum
  alone (no dnd5e dependency); the blueprint's C02 asks for 14 and the table runs v14 only — raise it
  in the same batch, it gates installation only.
- Then add the `NS`/`CSS`/`FLAG_SCOPE` vs `flags.pentaryn` assertions to `core.test.mjs`.
- One Foundry restart for the whole batch.

## 4. Findings that stay standalone (not structural)

None remain for names: -32 (core + tests), -33 (failure path), -38 (API boundary) and the names row
of -20 are all absorbed above. The audit's dropped item transform-creatures-34 (synthetic token
siblings) stays with the live-test workflow; the `// KNOWN:` sibling row in step 1 pins today's
planner output so its answer becomes a deliberate change.

## 5. Declared behaviour changes — live-test handoff

| # | Step | Change | How to see it at the table | Needs table time |
|---|---|---|---|---|
| N-D1 | 4 | A failed relabel logs `pentaryn-names \| relabel after rename failed` instead of an unprefixed `Uncaught (in promise)` | only on a failed write (e.g. a rejected scene update); console only | no (console) |
| N-D2 | 5 | API frozen; gains `version/contract/describe/settings/trace/uninstall`; published on `module.api`; `pentaryn-names.ready` fires | `game.pentaryn.names.describe()`; `game.modules.get("pentaryn-names").api === game.pentaryn.names` | live smoke only |
| N-D3 | 6 | `sync` accepts an id/uuid/exact name; ambiguous name on a write returns `fail` | `game.pentaryn.names.sync("<actorId>", "Old", "New")` | live smoke only |
| N-D4 | 7 (opt.) | toast also logged to console | console only | no |
| N-L1 | — | open question, not a change: renaming a base actor relabels every synthetic (unlinked) token that carries its `actorId` | two unlinked Goblins, rename the base actor | yes — decide whether that is wanted |

Live smoke after sync: `describe().version === "0.1.0"`, every `describe().methods[].path` is a
function, rename a test actor and see the toast.

## 6. Decisions and risks

- **N1 — tier.** D16 defines small as "no API writes", and `sync` writes. Recommended: stay small
  (60 lines, no state, no settings) and opt into kit `api` for the legacy rows; the alternative is
  `--tier full`, which adds `settings.mjs`, `api.mjs`, `hooks/api/i18n` tests and `lang` checks for
  a module with no settings. Either way the scorer's `[full]` rules are not needed for correctness.
  **Decided 2026-10-11 (Joe, D3): stay small, plus the opt-in `api` kit file** — `vendor.py sync names
  --tier small --kit api` (step 1) as written. No guide step changes.
- Risk: none beyond the declared items; every move is verbatim and pinned by the oracle table.

## 7. Effort

| Step | Effort |
|---|---|
| 1 characterise | 1.5 h |
| 2-3 core + feature + entry | 1 h |
| 4-7 declared + manifest + i18n | 1 h |
| 8 docs | 0.5 h |
| 9 Wave 7 | batched |
| **Total** | **S, ≈ 4 h** plus one approval checkpoint |

## Step 1 record (2026-10-11, wave 1)

- Step 0: not on WAIT; `git diff ee505c2 -- foundry/module/pentaryn-names` empty; live score before
  67.4 % (29/43, scored as full: no lock yet).
- Checkpoint **f1ecd11** — `lib/` (kit 1.0.1, small + api) and `test/` only; `names.mjs` untouched.
  Score after: **78.6 % (33/42) as small**; still failing C07, C11, C12, C18, C34, C39 (spec half),
  C41, C44, C45 — each cleared by the step named in §1.
- Suite: `node test/run.mjs` — 28 tests (core 9, glue 19), all pass. Coverage of `names.mjs`
  (line / branch / funcs): **0 / 0 / 0 before** (no tests) → **100 / 100 / 100 after**
  (`node --test --experimental-test-coverage --test-coverage-exclude='test/**' "test/**/*.test.mjs"`).
  No gaps left in the module; the probe subprocesses cover the frozen-root branch.
- Goldens: `hooks.json`, `legacy-surface.json` (asserted as a subset), `oracle.json` (every row of
  `fixtures/tables.mjs`), `rename.json` (effect log + `canUserModify` calls), `root.json` (four load
  orders: frozen root before load, after load, from an earlier `ready` listener; extensible root).
- Deviations from the plan text, all additive: core.test runs every table over
  `test/fixtures/impls.mjs` (step 2 appends `["core", …]` there, `plan: planTokenRelabels`, so the
  frozen test text never changes — step 2's own purity/VERSION tests are new tests); the load orders
  and the -33 unhandled rejection run in `test/fixtures/probe.mjs` subprocesses (node:test fails any
  test that leaks a rejection; a fresh process gives a fresh entry instance). The probe replaces
  `setTimeout`/`setInterval` with recorders, so the kit's one-tick re-alias (step 5) never runs there.
- Pins that flip later, one [declared] commit each: KNOWN transform-creatures-33 (step 4: rejections
  `[]`, one `pentaryn-names | relabel after rename failed` warn), "module.api is undefined" (step 5,
  N-D2), KNOWN transform-creatures-38 (step 6: `sync(id|uuid|exact name)` resolves). Documented
  quirks pinned as-is: N-L1 siblings, padded old names, `relabel("",",x","y")`, and
  `relabel("42", 42, "x") → "x"` (shortName stringifies a number).
- Stub fidelity: `fixtures/live-before.json` is the live golden's deterministic part, reproduced by
  the "live parity" test. SF7 answered from the 14.369 source: `preUpdateActor` gets the cleaned,
  undiffed changes (`client/data/client-backend.mjs:238-239`), and an empty diff is dropped before the
  server (`:262`), so a same-name write is stopped by names' own `changes.name !== actor.name` guard
  and `updateActor` never fires. The kit stub fires a document's hooks synchronously, so names'
  nested prototype write reaches later listeners before the outer rename; the test that sees this is
  order-free. `Scene#updateEmbeddedDocuments` and `TokenDocument#canUserModify` are added by
  `fixtures/world.mjs` (the kit stub has neither).

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | ___ % (___ / ___ fail-class rules) — `conformance.py --module names --markdown` |
| Date | ____-__-__ |
| Commits (Joe-approved) | characterisation: f1ecd11 · refactor: ______ · standalone: ______ |
| Declared changes handed to the live-test workflow | ______ (session L__) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes / no |
| Adjustments rows appended to `adjustments-batch.md` | yes / no |
| Still failing, and why | ______ |
