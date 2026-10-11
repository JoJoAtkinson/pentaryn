---
title: Migration guide — pentaryn-pings to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, pings]
---

# Migrating `pentaryn-pings` to the blueprint

**Read this when:** you are about to bring `pentaryn-pings` up to the addon blueprint (fix phase of
the 2026-10 code audit). **Not this file:** the general procedure and the kit →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the design →
[`../addon-blueprint-2026-10.md`](../addon-blueprint-2026-10.md) · the audit finding text →
[`../code-audit-2026-10/pings.md`](../code-audit-2026-10/pings.md) · operating pings at the table →
[`../../foundry/markers.md`](../../foundry/markers.md) (ping-log section).

Line numbers are **snapshot** line numbers (pentaryn `ee505c2` + the uncommitted tree of
2026-10-10 20:15 EDT). On 2026-10-10 the live `foundry/module/pentaryn-pings/` was byte-identical to
the snapshot; check again in step 0.

| | |
|---|---|
| Tier | **small** (D16 names pings explicitly), plus opt-in kit files `settings` (its two settings and the log store), `api` (legacy rows, one of which writes), `patch` (the `handlePing` wrap) and `election` (`isAnyGM`, today's predicate) — §6, decision P1 |
| WAIT | **no**. Not in `wait.json`; touches no combat, transform or aoe file |
| Findings absorbed | transform-creatures-35, -36, -39, the pings part of -20; tooling finding python-tooling-3 is the ModuleSpec half (lands in the pending-wiring batch, not here) |
| Steps | 11 (step 0 plus 10) |
| Effort | **S/M**: about one day of agent work, one approval checkpoint, one adjustments batch item, one Wave 7 restart item |
| Prerequisites | R5 C50 `ready:<role>` — **landed** |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module pings --markdown`. On the snapshot (as full) it moved 60.5 % → 62.2 % (R9: C18 is n/a); re-score as small after step 1 |
| Tier on the scorer | `vendor.py sync pings --tier small` (step 1) now records `"tier": "small"` in `lib/kit.lock.json`, and the scorer reads it until Wave 7 adds `flags.pentaryn.tier`: from step 1 on it scores as small in place — no scratch copy, no hand-set flag |
| Note-only findings | transform-creatures-39 is a gap-fill stub: `audit-findings.json` holds only id and title (no file or line); the full text is in [`../code-audit-2026-10/pings.md`](../code-audit-2026-10/pings.md) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today

Scored as small on a scratch copy (the shipped `module.json` has no tier; the baseline scored it as
full: 60.5 %): **63.9 % (23/36 fail-class rules)**. Warn: C02, C10, C36. Manual: C31, C36.

| Rule | Today | Detail (snapshot) | Cleared by |
|---|---|---|---|
| C01 | pass | | |
| C02 (warn) | warn | `"minimum": "13"` | step 10 |
| C03 dnd5e | pass | none used | |
| C04 languages | pass | no i18n today (hard-coded English) | must stay paired: lang + `languages` land together in step 10 |
| C05 | pass | | |
| C06 / C06w | pass | no CSS | |
| C07 `flags.pentaryn` | **fail** | no tier, namespace, cssPrefix; `flagScope: "pings"` | step 10 (metadata only: the module writes no document flags) |
| C08 socket | pass | listens on core's `userActivity`, never emits `module.pentaryn-pings` | |
| C09 | pass | | |
| C10 size (warn) | warn | `pings.mjs` 242/150 | steps 2-5 (entry ≈ 70 lines) |
| C11 pure core | **fail** | no core | step 2 |
| C12 `MODULE` | pass | pings.mjs:43 | moves to core in step 2 |
| C13 | pass | | |
| C14 kit | **fail** | no lock | step 1 |
| C15, C16 | pass | | |
| C17 | pass | single file | stays pass |
| C18 features | **fail** | none | step 5 |
| C19 | pass | emits none | |
| C20 hooks golden | **fail** | | step 1 |
| C21 settings calls | **fail** | pings.mjs:56, :65, :188, :195 | step 3 |
| C22 `SETTINGS` | **fail** | | step 3 |
| C23 | pass | | |
| C24 empty catch | pass | | |
| C25 console prefix | pass | all lines carry `${MODULE} \|` | keep the texts |
| C26 publish timers | pass | publishes synchronously inside the GM branch of `ready` | |
| C27-C29 `[full]` | n/a | small | |
| C30 | pass | | |
| C31 (manual) | manual | `clear()` writes and returns `true` (legacy) | step 5 |
| C32 patches | **fail** | pings.mjs:183 `Layer.prototype.handlePing = patched` | step 4 (+ adjustments rows) |
| C33 | n/a | | the `userActivity` socket listen is covered by a row in step 4 anyway |
| C34, C35 | n/a | no lang file | step 10 |
| C36 (warn) | warn | pings.mjs:197 hint literal | step 10 |
| C37, C37w, C38 | pass / n/a | no CSS; no cssPrefix | step 10 declares `ppg-` |
| C39 | **fail** | no `test/run.mjs`; **no ModuleSpec** in `config.py` | step 1 + pending wiring (step 9) |
| C40 | **fail** | missing `core.test`, `glue.test`, `i18n.test` (it has settings) | steps 1-3 |
| C41 | **fail** | | step 2 |
| C42 (manual), C43 | n/a | | step 1 |
| C44 README | **fail** | no README.md | step 8 |
| C45 | **fail** | | step 8 |
| C46 routed | pass | via `context/foundry/markers.md` | step 8 adds the route row |
| C47 | pass | names no third-party package | |
| C48 | pass | `last`, `recent`, `all`, `clear` | |
| C49 | pass | | |
| C50, C51 | n/a | not used yet | steps 3, 5 (C51 fails until step 10, see step 3) |
| C52 | pass | | |

**Expected:** 34/36 after step 8; 36/36 once the pending-wiring ModuleSpec (C39) and the Wave 7
batch (C07, C51 via lang keys) land.

## 2. Target layout

```
foundry/module/pentaryn-pings/
  module.json        Wave 7: flags.pentaryn {tier: small, namespace: pings, flagScope: pentaryn-pings,
                     cssPrefix: ppg-, generation: 14, afterSync}; languages; minimum 14
  pings.mjs          ENTRY (name unchanged): init → registerSettings; ready → GM gate, capture.start(),
                     buildApi, publish, the "ready — N ping(s)" line                         ≈ 70 lines
  pings-core.mjs     PURE: MODULE, SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS ({}), DEDUPE_MS, FLUSH_MS,
                     isDuplicate, capLimit, appendCapped, imageOffset, decorate, recentOf    ≈ 110 lines
  settings.mjs       SETTINGS (log, max), registerSettings(), readLog(), writeLog(), maxSetting() ≈ 60 lines
  capture.mjs        FEATURE: install/uninstall, start() — ControlsLayer wrap, userActivity listener,
                     buffer + 250 ms flush, record()                                         ≈ 110 lines
  api-manifest.mjs   PURE data: last, recent, all, clear (legacy rows)                       ≈ 45 lines
  lib/               errors, log, hooks, publish, resolve, settings, api, patch, election + kit.lock.json
  lang/en.json       Wave 7 only: { "PENTARYN_PINGS": { "Setting": { "max": { "Name", "Hint" } } } }
  test/run.mjs, core.test.mjs, glue.test.mjs, i18n.test.mjs (step 10)
  test/fixtures/legacy-pings.mjs   verbatim oracle of pings.mjs:87-158 and 221-230
  test/fixtures/world.mjs          GM + player users, two scenes (padding 0.25, grid 100), a ControlsLayer stub
  test/golden/hooks.json, legacy-surface.json, surface.json (step 5)
  README.md, CHANGELOG.md
```

Old → new (snapshot `foundry/module/pentaryn-pings/pings.mjs`):

| Snapshot lines | What | Goes to |
|---|---|---|
| 1-41 | header | README (What the player sees, Data written, Two sessions, Pitfalls); the record shape → README table and `api-manifest.mjs` `returns` |
| 43-46 | `MODULE`, `LOG`, `MAX`, `DEDUPE_MS` | core (`MODULE`, `DEDUPE_MS`); `LOG`/`MAX` keys → `settings.mjs` rows |
| 48-52 | `buffer`, `flushTimer`, `nowMs` | `capture.mjs` session state |
| 54-62 `readSetting()` | guarded read, warn text | `settings.mjs` `readLog({log})` — **body and warn text verbatim** |
| 64-67 `cap()` | setting read + clamp | `settings.mjs` `maxSetting()` (the raw read) + core `capLimit(raw)` (the clamp) |
| 69-80 `scheduleFlush()` | 250 ms coalesced write, GM-only | `capture.mjs`; the `game.settings.set` call → `settings.mjs` `writeLog(buffer)` |
| 87-125 `record()` | GM gate, finite check, dedupe, append, cap | `capture.mjs` glue; dedupe → core `isDuplicate`; append+cap → core `appendCapped` |
| 132-139 `imageOffset(scene)` | pure maths on scene fields | core `imageOffset({width, height, padding, gridSize})` |
| 141-158 `decorate(rec)` | pure maths + scene lookup + `Date.now()` | core `decorate(rec, {offset, gridSize}, now)`; the lookup stays in the API impl |
| 160-185 `patchControlsLayer()` | prototype wrap with marker `__pentarynPatched` | `capture.mjs` via `wrapMethod` (step 4); the pre-check and its warn text stay at the call site |
| 187-203 `Hooks.once("init")` | two `game.settings.register` | `settings.mjs` `SETTINGS` + `registerSettings()`; entry's `Hooks.once("init")` |
| 205-219 ready: GM gate, buffer, patch, socket | startup | entry `onReady` → `capture.start()` |
| 221-230 `api` | four readers/writer | `api-manifest.mjs` rows + impl map in the entry |
| 232-238 | frozen-root guard | `publishNamespace("pings", api, {moduleId: MODULE})` |
| 240 | `console.log(\`${MODULE} \| ready — …\`)` | entry, verbatim |

## 3. Steps

### Step 0 — gate check (no diff)

`wait.json` clear; re-anchor (`diff -ru <snapshot>/pentaryn/module/pentaryn-pings foundry/module/pentaryn-pings`,
or `git diff ee505c2 -- foundry/module/pentaryn-pings`); `conformance.py --module pings --markdown`.
Note the scorer reports C39 "no ModuleSpec" until step 9's wiring lands; that is expected.

### Step 1 — characterise (tests + vendored files only; the checkpoint)

- `vendor.py sync pings --tier small --kit settings,api,patch,election`. `lib/` stays unused.
  Clears C14.
- Fixed `test/run.mjs` (`LEGACY = []`).
- `test/fixtures/legacy-pings.mjs`: verbatim copies of the pure parts of pings.mjs:93-122 (dedupe and
  cap arithmetic), :132-139 (`imageOffset`), :141-158 (`decorate` with `game.scenes.get` and `nowMs`
  injected as parameters — the only edit to the copy, and noted in its header), :223 (`recent`
  slice/reverse).
- `test/core.test.mjs` (oracle half), the table from -36's `behaviourTest` plus hostile rows:
  - dedupe: last `{userId:"u",sceneId:"s",x:10,y:20,t:1000}` vs `{userId:"u",sceneId:"s",x:10,y:20}`
    at now 1399 → duplicate; 1400 → not; other user → not; other scene → not; x off by one → not.
  - cap: raw `"x"` → 50; `0` → 50; `-5` → 50; `900` → 500; `25` → 25; `NaN` → 50; `"30"` → 30.
  - `imageOffset({width:4000,height:3000,padding:0.25,gridSize:100})` → `{x:1000,y:800}`; a missing
    scene → `{x:0,y:0}`; `gridSize` missing → 100.
  - `decorate({t:0,x:1050,y:850,userId:"u",sceneId:"s"}, {offset:{x:1000,y:800}, gridSize:100}, 12000)`
    → `canvas {1050,850}`, `image {50,50}`, `gridSquare {i:0,j:0}`, `snapped {x:1000,y:800}`,
    `age "12s ago"`; key order pinned (`...rec` first, then canvas, image, gridSquare, snapped, age);
    `decorate(undefined)` → `null`.
  - recent: `[a,b,c]` n=2 → `[c,b]`; n omitted → `[c,b,a]`; `// KNOWN:` n=0 → `[c,b,a]`;
    `// KNOWN:` n=-1 → `[c,b]` (drops the first).
- `test/glue.test.mjs`: `installFoundry({ user: gm, users: [gm, player], scenes })`; the test
  installs `game.socket.on` (records `[event, fn]`; the stub only emits) and a `ControlsLayer` stub at
  `foundry.canvas.layers.ControlsLayer` with `prototype.handlePing(user, position, options)` that
  records its calls; `await import("../pings.mjs")`; fire init/setup/ready.
  - `pinJSON("hooks")` → `[once init, once ready]`.
  - `F.calls` `settings.register`: `pentaryn-pings.log` `{name:"Ping log", scope:"world",
    config:false, type: Array, default: []}` and `pentaryn-pings.max` `{name:"Pings to keep",
    hint:"How many of the most recent pings to remember. Older ones fall off the end.",
    scope:"world", config:true, type: Number, default: 50}` — option objects pinned key by key.
  - GM ready: `handlePing.__pentarynPatched === true`; a second `ready` (re-import) does not double
    wrap; `socket.on` got `"userActivity"`; `Object.keys(game.pentaryn.pings)` ⊇
    `["last","recent","all","clear"]` (→ `golden/legacy-surface.json`, asserted as a subset); the
    console line `pentaryn-pings | ready — 0 ping(s) on record` (exact).
  - player ready (`F.become({userId: player})` before ready, separate test file or a fresh process):
    no wrap, no socket listener, `game.pentaryn?.pings === undefined` (-39 pin).
  - burst: five `handlePing` calls at distinct points with `t.mock.timers` → after 250 ms exactly one
    `settings.set("pentaryn-pings","log", [5 records])`; one ping arriving via both paths within
    400 ms → one record; `max` set to 3 → buffer keeps the last 3.
  - failure texts (pinned verbatim): settings read throws → `pentaryn-pings | could not read the log`;
    set rejects → `pentaryn-pings | could not persist the log`; no `handlePing` on the stub →
    `pentaryn-pings | no ControlsLayer#handlePing to patch — local pings will rely on the socket path only`;
    `record` throws inside the wrap → `pentaryn-pings | ping capture failed` and the original
    `handlePing` still runs; malformed socket payloads (`null`, `{ping:{x:"a"}}`) → nothing recorded,
    no throw.
  - `clear()` → `settings.set(log, [])`, resolves `true`, buffer empty.
  - `last()`/`recent()`/`all()` read the **persisted** setting, not the buffer: right after a ping and
    before the 250 ms flush, `recent(1)` is still empty (`// KNOWN:` read lag, -39).
  - publish into a frozen root keeps foreign keys, both load orders.
- `GOLDEN_UPDATE=1 node test/run.mjs`, then green. **Checkpoint:** commit the `lib/` + `test/`
  diff.

### Step 2 — pure core (absorbs **transform-creatures-36**; clears C11, C41)

- New `pings-core.mjs`: constants (`MODULE`, `SHORT = "pings"`, `NS = "pings"`, `VERSION = "0.1.0"`,
  `CONTRACT = "pentaryn-pings/api@1"`, `I18N = "PENTARYN_PINGS"`, `CSS = "ppg-"`,
  `FLAG_SCOPE = MODULE`, `HOOKS = Object.freeze({})`, `DEDUPE_MS = 400`, `FLUSH_MS = 250`,
  `DEFAULT_MAX = 50`, `MAX_CAP = 500`) and the six functions named by -36: `isDuplicate(last, rec, now,
  windowMs)`, `capLimit(raw)`, `appendCapped(buffer, rec, limit)`, `imageOffset({width, height,
  padding, gridSize})`, `decorate(rec, {offset, gridSize}, now)`, `recentOf(list, n = 10)`. Keep
  `Math.round` at record time and `Math.floor` for `gridSquare`/`snapped` exactly; do **not** fix
  `recentOf(list, 0)` or the square-grid `snapped` (pinned quirks).
- `pings.mjs` calls them with plain data (scene fields read in glue).
- Tests added in this step: core imported bare first; every step-1 table row asserts
  `core.fn(...)` deep-equals the oracle; `VERSION === module.json.version`.
- Glue golden unchanged.

### Step 3 — settings table (clears C21, C22; C51 stays failing until step 10)

- New `settings.mjs`: `SETTINGS = [{ key: "log", scope: "world", config: false, type: Array,
  default: [], name: "Ping log", doc: "the ping buffer (store)" }, { key: "max", scope: "world",
  config: true, type: Number, default: 50, name: "Pings to keep", hint: "How many of the most recent
  pings to remember. Older ones fall off the end.", doc: "…" }]` — **literal English strings
  verbatim** for now, because pings ships no `lang/` file and a key would render raw on the settings
  screen until the Wave 7 batch adds `languages` (step 10). The `log` row is **not** marked
  `store: true` in this step: `defineSettings` registers store rows without a `name`, which would
  change the pinned `settings.register` options.
- `registerSettings()` = `defineSettings(MODULE, SETTINGS, { i18nRoot: I18N })`; `readLog({log})`
  (pings.mjs:54-62 verbatim, warn text unchanged), `writeLog(list)` (`game.settings.set`),
  `maxSetting()` (the raw `game.settings.get(MODULE, "max")`; the clamp is core `capLimit`).
  `settingReader` is **not** used for `readLog`: it swallows without the warn line.
- Before-tests: the step-1 `settings.register` option pins (byte-for-byte), the failure texts and
  the burst/cap cases stay green.
- C51 reports the literal English rows; expected until step 10. Add `test/i18n.test.mjs` in step 10,
  not now (it would assert keys that do not exist yet).

### Step 4 — the `handlePing` wrap through the kit (clears C32 once the rows exist)

- In `capture.mjs`: keep pings.mjs:161-170 at the call site (the three-way `Layer` lookup, the
  missing-method warn text, the `__pentarynPatched` early return), then
  `wrapMethod(MODULE, { target: Layer.prototype, name: "handlePing", marker: "__pentarynPatched",
  label: "ControlsLayer#handlePing", adjustments: "pings-core-ping-handle" }, function (wrapped,
  user, position, options = {}) { try { …record… } catch (err) { log.warn("ping capture failed",
  err); } return wrapped(user, position, options); }, { log })`. The marker literal stays in
  `capture.mjs` (migration rule, use-doc §4.3).
- Equivalence to check in review: `make.call(this, …)` keeps `this`; the original receives the same
  `(user, position, options)` triple (the default `{}` is applied before the call, as today);
  `replacement.__pentarynPatched = true` as today.
- **Adjustments batch** (appended while `foundry/adjustments.yml` is idle, use-doc §5.6; ids
  prefixed `pings-`): `pings-core-ping-handle` (packages `[core]`, files `[…/capture.mjs]`, markers
  `["handlePing", "__pentarynPatched"]`, what/why from -35, `check: make foundry-pings-check`) and
  `pings-core-user-activity-socket` (markers `["userActivity"]`; core's private socket event). The
  `make foundry-pings-check` target exists only after step 9's wiring — land the rows in the same
  batch or point `check` at `node foundry/module/pentaryn-pings/test/run.mjs` until then.
- Before-tests: wrapped once, idempotent on re-import, original still runs after a capture throw,
  same warn texts. New pin: `patches()` record has `adjustments: "pings-core-ping-handle"`.

### Step 5 — feature + entry + kit publish (clears C18, C10; C50 pass)

- `capture.mjs` exports `install(reg, ctx)` (stores `ctx`; registers **no** hook, so the golden stays
  `[once init, once ready]`), `start()` (pings.mjs:208-219: buffer read, wrap, `userActivity`
  listener), `record()` and `uninstall()` (unwraps through the handle, `game.socket.off("userActivity",
  fn)`, clears the buffer and the flush timer — new capability, not a behaviour change at the table).
- `pings.mjs` entry: `makeLog`, `hookRegistry`, `ctx`; `capture.install(reg, ctx)` synchronously;
  `Hooks.once("init", onInit)` → `registerSettings()`; `Hooks.once("ready", onReady)`:
  `if (!isAnyGM()) return;` (election; `game.user?.isGM === true`, today's predicate at :206) →
  `capture.start()` → `buildApi(MANIFEST, impl, { members: { uninstall, trace, settings } })` →
  `publishNamespace(NS, api, { moduleId: MODULE })` → the ready line verbatim.
- `api-manifest.mjs`: rows `last`, `recent` (`params: [{name: "n", default: 10}]`), `all` (all
  `writes:false`, `legacy:true`, `returns` = the decorated record shape) and `clear`
  (`writes:true`, `gm:true`, `legacy:true`, `returns: "true"`). No row names a `ref` param, so `bind`
  passes every call straight through.
- `when` is left at its default: the publish sits in the synchronous `ready` body, so C50 requires
  `"ready"` even though it is GM-gated. Record "GM clients only" in the README and the manifest
  `doc` instead (scorer follow-up: C50 cannot express a role gate inside the sync body — §6).
- Additive, **[declared]** small: API frozen, kit members added, `module.api` canonical,
  `pentaryn-pings.ready`/`pentaryn.ready` fire on GM clients, the kit's re-alias tick.
- Before-tests: everything from step 1, including the player-client "namespace undefined" pin.

### Step 6 — **[declared]**, additive: numeric age (absorbs **transform-creatures-39**)

- core `decorate` adds `ageMs: now - rec.t` **after** `age`. Pin that moves: the decorate key list
  gains one trailing key; every old key keeps its value and position (deep-equal on the old key set).
- `describe()`: -39 asked for a custom `describe()`; the name is kit-reserved (`describe` returns
  the manifest), so the record shape goes in the `last/recent/all` rows' `returns` and the README
  table; the two quirks (`recent(0)` returns all; reads lag the buffer by ≤ 250 ms) go in README
  Pitfalls and the rows' `nullWhen`/`doc`. The GM-only publish stays (players never write the setting).

### Step 7 — (reserved for a later serialStore decision; skip)

The log is a world-setting store; the idiom table maps such stores to `serialStore`. Pings' store
is different on purpose: an in-memory buffer with one coalesced write per 250 ms, not one
read-modify-write per ping. Switching would change write timing and volume → do **not** switch in
this migration. If wanted later it is **[declared]** and needs a two-GM live test (the dropped
finding transform-creatures-37, last-writer-wins between two GM sessions, belongs there).

### Step 8 — docs (clears C44, C45)

- New `README.md` in use-doc §7 order: What the player sees (nothing — GM tool) · Settings (`max`; `log` is
  a hidden store) · API (four methods, record table with `ageMs`) · Data written (world setting
  `pentaryn-pings.log`) · Flags `n/a` · Events `n/a — emits none; listens core socket userActivity and
  wraps ControlsLayer#handlePing` · Patches and adjustments (the two rows) · Two sessions (GM clients
  only; two GMs both write — last writer wins, live-test item) · Extending · Pitfalls (`recent(0)`,
  read lag, square-grid `snapped`, canvas vs image space) · Files · Tests · Sync.
- `CHANGELOG.md`; `context/foundry/markers.md` ping section links the README (one line);
  `context/foundry/README.md` route row "where did I ping" (the pings part of **-20**).

### Step 9 — pending-wiring batch (not this module's diff)

`scripts/foundry/ops/config.py`: a `"pings"` `ModuleSpec("pentaryn-pings", check=(*_STATIC,
"node-test"), after_sync=(…))`; Makefile `.PHONY` + `foundry-pings-check`/`foundry-pings-sync` next to
names (finding -35, tooling finding python-tooling-3). Clears C39.

### Step 10 — Wave 7 restart batch (C07, C02, C34-C36, C51)

- `module.json`: `flags.pentaryn = { tier: "small", namespace: "pings", flagScope: "pentaryn-pings",
  cssPrefix: "ppg-", generation: 14, afterSync }`, `languages: [{lang:"en", name:"English",
  path:"lang/en.json"}]`, `minimum: "14"`.
- New `lang/en.json` `{ "PENTARYN_PINGS": { "Setting": { "max": { "Name": "Pings to keep", "Hint":
  "How many of the most recent pings to remember. Older ones fall off the end." } } } }` (new-module
  label shape, D4; strings verbatim). In the **same sync**, the `max` row's `name`/`hint` become the
  keys `PENTARYN_PINGS.Setting.max.Name`/`.Hint`; the `log` row drops its `name` and becomes
  `store: true` (hidden, `config:false` — the label was never shown). Settings screen text is
  byte-identical.
- Add `test/i18n.test.mjs` (row keys exist; no wrapper) and the `NS/CSS/FLAG_SCOPE` manifest pins.
- The step-1 `settings.register` option pin for `max` moves (key instead of English) — the one
  golden edit of this step, committed with the restart batch and its reason.

## 4. Findings that stay standalone

None of the pings findings stay outside the migration. Two items stay with other owners:
transform-creatures-37 (two GM sessions, last writer wins — dropped to the live-test workflow) and
python-tooling-3 / python-tooling-1 (the registry and Makefile pattern rules — tooling batch).

## 5. Declared behaviour changes — live-test handoff

| # | Step | Change | How to see it | Needs table time |
|---|---|---|---|---|
| P-D1 | 5 | API frozen; kit members; `module.api`; ready hooks (GM clients) | `game.pentaryn.pings.describe()` on the GM | live smoke |
| P-D2 | 5 | `uninstall()` exists (unwraps, stops listening) | console | no |
| P-D3 | 6 | records gain `ageMs` | `game.pentaryn.pings.last()` | live smoke |
| P-D4 | 10 | settings label read from `lang/` | Configure Settings → Pentaryn Ping Log shows "Pings to keep" (not a raw key) | yes, after the restart |
| P-L1 | — | not a change: two GM sessions each keep a buffer and the last flush wins | two GM tabs, ping from both | yes, decision only |

Live smoke after sync: as GM, ping the canvas, wait 1 s, `game.pentaryn.pings.last()` has the point;
`describe().version === "0.1.0"`.

## 6. Decisions and risks

- **P1 — tier.** D16 makes pings small; it nevertheless has persistent state (a world-setting store)
  and one write method (`clear`). Recommended: small + opt-in kit files (the template's small tier
  has no `settings.mjs`, so `settings.mjs` and `api-manifest.mjs` here are additions the tier allows
  through `--kit`). Alternative: `--tier full` (adds `api.mjs`, hooks/api tests, `describe/surface`
  goldens) — more files for a 240-line module.
- **P2 — C50 and role-gated publishes.** C50 treats any publish inside the synchronous `ready` body
  as `when: "ready"`; a GM-only publish there cannot record `"ready:gm"` without failing. Leave
  `when` default here; raise a scorer refinement (accept `ready:<role>` when the call sits under a
  role gate in the sync body) with the blueprint owners.
- Risk: the wrap's argument handling (step 4 review item); the store must never be switched to
  `serialStore` in a "neutral" step (step 7).

## 7. Effort

| Step | Effort |
|---|---|
| 1 characterise (socket and ControlsLayer stubs, timers) | 3 h |
| 2-5 core, settings, wrap, entry | 2.5 h |
| 6 + 8 additive field, docs | 1.5 h |
| 9-10 wiring / restart batch | batched |
| **Total** | **S/M, ≈ 1 day** plus one checkpoint, one adjustments-batch item, one restart item |

## Step 1 record (2026-10-11, wave 1)

- Step 0: not on WAIT; `git diff ee505c2 -- foundry/module/pentaryn-pings` empty; live score before
  65.9 % (27/41, scored as full: no lock yet).
- Kit commit **8c0c461** (`vendor.py sync pings --tier small --kit settings,api,patch,election`, fixed
  `test/run.mjs`, `LEGACY = []`); checkpoint **d85e653** — `test/` only; `pings.mjs` untouched.
  Score after: **75.0 % (30/40) as small**; still failing C07, C11, C21, C22, C32, C39 (the ModuleSpec
  has no `node-test`, step 9), C40 (i18n.test, step 10), C41, C44, C45 — each cleared by the step named in §1.
- Suite: `node test/run.mjs` — 38 tests in 7 files (core 12, glue 18, glue-player 2, glue-root 2,
  glue-nopatch 1, glue-layers 1, glue-layers-config 1): 37 pass, 1 todo (the -39 target, below).
  Coverage of `pings.mjs` (line / branch / funcs): **0 / 0 / 0 before** (no tests) →
  **100 / 98.57 / 100 after**, measured with
  `node --test --experimental-test-coverage --test-coverage-exclude='test/**' --test-coverage-exclude='lib/**' --test-skip-pattern='second module instance' "test/**/*.test.mjs"`.
  The one open branch (`:170`, the `__pentarynPatched` early return) is covered by the skipped
  re-import test; with it included the tool reports 47.7 / 33.3 / 18.8, because the
  `pings.mjs?second-instance` import counts as a second copy of the file whose functions mostly never run.
  A mutation pass over 18 hand mutants of `pings.mjs` left one survivor, and it is equivalent:
  `snapped` computed from the image offset gives the same value, because the offset is always a whole
  number of grid squares.
- Goldens: `hooks.json` ([once init, once ready]), `legacy-surface.json` (asserted as a subset),
  `record.json` (the live golden's `lastAfter` and leading key list, reproduced on the stub).
- Deviations from the plan text:
  - core.test runs every table over `test/fixtures/impls.mjs`, which adapts the verbatim oracle to the
    step-2 core signatures (`isDuplicate(last, rec, now, windowMs)`, `capLimit`, `appendCapped`,
    `imageOffset({width, height, padding, gridSize})`, `decorate(rec, {offset, gridSize}, now)`,
    `recentOf`). Step 2 appends `["core", core]` there; the frozen test text never changes.
  - SF3 replaces the plan's fixed row "`recent(1)` is still empty before the flush". The read lag
    depends on state, so it is pinned twice: no lag before the first flush (the buffer *is* the cached
    setting array) and lag after one (the flush stores a copy). `fixtures/world.mjs` wraps
    `settings.set` to store a structured copy and always seeds the log. Because the no-lag case
    depends on it, core.test also pins that `appendCapped` pushes in place under the cap and returns
    a fresh slice when it trims. Step 2 must keep that.
  - To keep the -39 flip to one named pin, every decorate assertion except one checks the leading
    12 keys only. The exception is "pin transform-creatures-39: decorate has no numeric age"
    (core.test). Step 6 deletes that pin and drops the `todo` flag from the "transform-creatures-39
    target" test beside it.
  - Extra glue processes beyond the plan: ControlsLayer lookup order (foundry → globalThis → CONFIG),
    no-handlePing warn, GM gate inside `record` and the flush, a non-array stored log, a cap
    ceiling of 900 → 500, and padding that rounds up (a 2100×1100 scene with no grid field).
- Quirks pinned as-is (transform-creatures-36): `recent(0)` returns everything, `recent(-1)` drops the
  oldest record, `snapped` uses square-grid maths on a hex scene, and a fractional `max` below 1 never
  trims. Pinned as KNOWN (transform-creatures-39): read lag after a flush, and no namespace on player
  clients. A ping is recorded even when core will not draw it (SF4).
- Constraints the frozen glue tests put on steps 3-5: `settings.register` options must stay
  byte-for-byte (no extra keys from `defineSettings`), the player client must have no listeners left
  after ready, and the re-import test relies on the marker early return staying at the call site
  (step 4).

## Refactor record (2026-10-11, wave 1)

Rebuilt in place on `migrate/wave-1`, same folder, same module id, under the shipped `module.json`
(untouched). The template was generated into scratch (`new_module.py pings --tier small --kit
settings,api,patch,election --css-prefix ppg- --no-dnd5e`) and its README, CHANGELOG and
`test/graph-allow.json` adopted; `lib/` was already vendored (8c0c461). No `styles/` (no CSS).

| Commit | Step | Findings absorbed | Clears |
|---|---|---|---|
| 0a01ef7 | 2 — `pings-core.mjs` (six rules + constants); `fixtures/impls.mjs` gains `["core", core]`; `core-meta.test` (bare import, `VERSION` pin, seeded 2000-case sweep vs the oracle) | **transform-creatures-36** | C11, C41 |
| 16550cf | 3 — `settings.mjs` (`SETTINGS`, `registerSettings`, `readLog`, `writeLog`, `maxSetting`, `settingsView`) | -35 (settings half) | C21, C22 |
| ac75dd8 | 4 — `capture.mjs`; `handlePing` through `wrapMethod` (`adjustments: "pings-core-ping-handle"`); `test/patch.test` pins the kit record | -35 (patch half) | C32 once the rows land |
| 284dcce | 5 **[declared]** P-D1, P-D2 — feature `install/uninstall/start`, kit entry, `api-manifest.mjs`, `buildApi` + `publishNamespace(…, {when: "ready:gm"})`; `test/publish.test` + `golden/surface.json` | -35 (entry/API), -39 (GM-only publish kept and stated) | C18, C10 |
| f9a94bf | 6 **[declared]** P-D3 — `ageMs` after `age`; the named pin flipped | **transform-creatures-39** | — |
| 2b4061b | 8 — README (§7 order), CHANGELOG | -35 (README), the README half of -39 | C44, C45 |

Suite after: `node test/run.mjs` — **59 tests, 59 pass, 0 todo** (10 files). Frozen
characterisation tests and goldens unchanged except the one sanctioned flip in step 6
(`git diff d85e653 -- test/golden test/glue*.test.mjs` shows only the new `golden/surface.json`;
`core.test.mjs` differs only by the two `if (label …)` guards). Coverage (same command as step 1): `pings-core.mjs` 100 / 95.7 /
100, `capture.mjs` 100 / 95.2 / 100, `settings.mjs` and `api-manifest.mjs` 100; `pings.mjs` reads
82 / 75 / 38 only because `publish.test` loads a second copy (`?v=2`), the step-1 artefact.

Score: **88.4 % (38/43) as small** (75.0 % at the checkpoint). Still failing, each waiting on a
shared-file owner: C07, C51 (Wave 7 batch: `flags.pentaryn`, `lang/en.json` + `languages`), C32
(adjustments rows `pings-core-ping-handle`, `core-pings-user-activity-socket`), C39 (ModuleSpec
`node-test`, step 9), C40 (`test/i18n.test.mjs`, step 10 — it would assert lang keys that do not
exist yet). Warnings C02, C36 clear in the Wave 7 batch.

Departures from the plan text:

- **Step 3 — the `log` row is `store: true` now** and registered by hand with today's exact option
  object. `defineSettings` would add `hint: undefined` to a non-store row (the frozen pin lists the
  keys) and drop `name` from a store row; `max` goes through `defineSettings` byte-identically.
  Step 10 drops the `log` name and registers both rows through `defineSettings`.
- **Step 5 — `when: "ready:gm"`**, not the default: R5 C50 accepts a role-gated `ready:<role>` in
  the sync ready body (P2 resolved).
- **Step 5 — hot re-import.** The entry follows the template: a re-import after ready runs init and
  ready at once. Because a re-import shares `capture.mjs`, `start()` adds the `userActivity`
  listener only once and the `__pentarynPatched` early return stays at the call site. Declared in
  P-D2.
- **Step 5 — `uninstall()` uses the kit's `unwrapAll()`, not the wrap handle.** The handle's
  `unwrap()` restores the method but leaves the kit's patch record, so a later `wrapMethod` with
  the same marker returns the stale handle and does **not** re-wrap (a hot re-import after
  `uninstall()` would lose local pings). `unwrapAll()` clears this module's records (each module's
  `lib/` is its own copy, and pings has one patch). Kit follow-up for the kit owner: make
  `handle.unwrap()` drop its record.
- **Step 6 — the flip.** The oracle stays in `IMPLS`, so "decorate has no numeric age" now runs for
  the oracle only and the target runs for core only (no todo).
- **SF3 seen again:** an unflushed ping before the first flush is already in the cached setting array
  (never written), so after `uninstall()` + re-import it reappears in the store — pinned in
  `publish.test`, consistent with the step-1 read-lag pins.
- Order nuance (unobservable): `capLimit(maxSetting())` is read just before the push instead of just
  after; `max` is registered at init, before either capture path exists.

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | **95.5 %** (42 / 44 fail-class rules, small tier) — `conformance.py --module pings --markdown`, 2026-10-11 after the integration (62.2 % as full at wave start, 75.0 % as small at the checkpoint) |
| Date | 2026-10-11 (deployed and live-checked the same day) |
| Commits (Joe-approved) | characterisation: 8c0c461 (kit), d85e653 (checkpoint) · refactor: 0a01ef7, 16550cf, ac75dd8, 2b4061b, 40bca21 · declared: 284dcce (P-D1, P-D2), f9a94bf (P-D3, transform-creatures-39) · shared files: 170f003 (`module.json`), 8435447 **[declared]** (ModuleSpec node-test), 4825fae (adjustments rows `pings-core-ping-handle`, `core-pings-user-activity-socket`), 54c1ce0 · standalone: none (all three audit findings were absorbed) |
| Declared changes handed to the live-test workflow | P-D1..P-D3 deployed 2026-10-11; boot probe and live golden pass (surface + `ageMs` only). `uninstall()` + re-import was not exercised live (J17) |
| `module.json` edits appended to `wave7-restart-batch.md` | landed directly in 170f003 except the `languages` entry (J13) |
| Adjustments rows appended to `adjustments-batch.md` | landed in 4825fae |
| Still failing, and why | C40, C51: step 10 (lang file) needs one edit to a frozen `settings.register` pin, which the freeze forbids — wave-1-report J13. Tests: 59 node:test, all pass; module-code coverage 100 / 95.3 / 97.3, lcov records merged per file (93.8 / 94.7 / 71.4 unmerged; was 0) |
| Wave 2 (kit 1.0.2, code phase) | re-vendored `f805bb63` [declared]: the frozen-root pin flipped (J10; `glue-root.test.mjs`). 67 tests green at `f8fb7377` (with the merged PT3-2 fix); conformance unchanged. Not yet synced: [`wave-2-live-plan.md`](wave-2-live-plan.md) (W2-L2) |
