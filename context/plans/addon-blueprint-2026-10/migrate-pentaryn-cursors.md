---
title: Migration guide — pentaryn-cursors to the addon blueprint
status: plan
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan, migration, cursors]
---

# Migrating `pentaryn-cursors` to the blueprint

**Read this when:** you are about to bring `pentaryn-cursors` up to the addon blueprint in the fix
phase that follows the 2026-10 code audit. **Not this file:** the general procedure →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the audit's own finding
text → [`../code-audit-2026-10/cursors.md`](../code-audit-2026-10/cursors.md) · the blueprint design →
[`../addon-blueprint-2026-10.md`](../addon-blueprint-2026-10.md).

> History-tree plan. Line numbers are **frozen-snapshot** lines (pentaryn `ee505c2` plus the
> uncommitted changes of 2026-10-10 20:15 EDT). On 2026-10-10 22:45 the live
> `foundry/module/pentaryn-cursors/` was byte-identical to the snapshot. Re-check that first
> (step 0). If it has drifted, find each change by its **anchor**. Work from
> `conformance.py --module cursors --markdown` run live, not from the score table below.

| | |
|---|---|
| Tier | **small** (no persistent state, no API writes, about 250 runtime lines). It has one client setting, so it also gets `settings.mjs` and `i18n.test.mjs` (use-doc §2 "small + opt-in kit", §6). |
| WAIT | **No.** It is not in `scripts/foundry/blueprint/wait.json`. One sub-step depends on aoe, which is WAIT: the shared adjustments row with aoe's `placementInProgress` (aoe-movement-portals-39). Step 10 shows how it is split. |
| Score today | **56.4 %** (22/39 fail-class) scored as small. The baseline table shows 53.7 % (22/41) because the module has no tier yet, so it was scored as full. |
| Projected after this guide | 100 % of fail-class rules except **C07**, which clears in the Wave 7 `module.json` restart batch (step 11). Once settings and publish exist, C50/C51 become applicable and pass. |
| Effort | **S, about 1 day.** About 0.4 day to characterise, 0.4 day to refactor and move files, 0.2 day for docs. One live smoke test. |
| Findings | senses-walls-cursors-30, -31, -32, -35. The cursors half of -27 is the same move as -35. The cursors half of -28 is sync tooling. |
| Prerequisites | R1 C32 vs non-patch rows — **blocked on D2**; until then use the package prefix for non-patch rows (use-doc §5.6) |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module cursors --markdown`. No status changed on the snapshot; C33 now lists private internals (R6) |
| Tier on the scorer | `vendor.py sync cursors --tier small` (step 1) now records `"tier": "small"` in `lib/kit.lock.json`, and the scorer reads it until Wave 7 adds `flags.pentaryn.tier`: from step 1 on it scores as small in place — no scratch copy, no hand-set flag |
| Note-only findings | senses-walls-cursors-35 is a gap-fill stub: `audit-findings.json` holds only id and title (no file or line); the full text is in [`../code-audit-2026-10/cursors.md`](../code-audit-2026-10/cursors.md) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today, item by item

Scored by `conformance.py --snapshot` with `flags.pentaryn.tier` set to `small` on a scratch copy.
"Step" names the step in §3 that turns the rule green.

| Rule | Today | Detail (snapshot) | Step |
|---|---|---|---|
| C01 id == folder | pass | | — |
| C02 minimum 14 | warn | `minimum: "13"` | 11 (Wave 7) |
| C03 dnd5e iff touched | pass | dnd5e appears only in comments | — |
| C04 languages iff i18n | pass | | — |
| C05 all .mjs reachable | **fail** | `tools/build.mjs` unreachable | 7 |
| C06 / C06w styles | pass / pass | no stylesheet | — |
| C07 flags.pentaryn | **fail** | no tier, namespace or cssPrefix; `flagScope: "cursors"` | 11 (Wave 7) |
| C08 socket | pass | | — |
| C09 relationships | pass | | — |
| C10 size caps | warn | `cursors.mjs` 158/150 | 5 (entry shrinks to about 70 lines) |
| C11 pure core | pass | `cursors-core.mjs` | — |
| C12 MODULE once | pass | `cursors-core.mjs:7` | — |
| C13 no extra .md | **fail** | `DESIGN.md`, `assets/src/CREDITS.md` | 7, 8 |
| C14 kit vendored | **fail** | no `lib/kit.lock.json` | 1 |
| C15 `import * as` | pass | | — |
| C16 import direction | pass | `tools/build.mjs` unclassified | 7 |
| C17 module-scope hooks in entry | pass | every hook is in the entry today | — |
| C18 features export install/uninstall | **fail** | no feature file | 5 |
| C19 emitted hook names | pass | emits none | — |
| C20 hooks golden (small: pinned in glue.test) | **fail** | | 1 |
| C21 settings calls only in settings.mjs | **fail** | `cursors.mjs:15`, `:114` | 3 |
| C22 SETTINGS exported | **fail** | | 3 |
| C23 no foreign settings | pass | | — |
| C24 no empty catch | **fail** | `tools/build.mjs:34` | 7 |
| C25 console prefix | **fail** | `tools/build.mjs:36, 120, 122, 134` | 7 |
| C26 no setTimeout around publish | **fail** | `cursors.mjs:148` | 6 |
| C27 / C28 / C29 | n/a | small tier | (6 adds an `api.test` anyway) |
| C30 queries | pass | none | — |
| C31 writes ok/fail | manual | no write rows | — |
| C32 patches ↔ rows | pass | `wrapOnChange` patches data objects, not a prototype | — |
| C33 private internals | n/a (scorer) | the scorer misses these. Manually: `renderer.events.currentCursor` / `setCursor` (`:55–58`), `canvas.regions._placementContext` (`:75`), the control/tool `onChange` wrap (`:102–111`) | 10 (finding -30) |
| C34 nested lang | **fail** | flat `PENTARYN_CURSORS.Setting.enabled.*` keys | 9 |
| C35 i18n coverage | pass | 100 % | — |
| C36 hard-coded English | pass | | — |
| C37 / C37w CSS | pass / pass | no CSS | — |
| C38 cssPrefix unique | n/a | until C07 | 11 |
| C39 run.mjs + ModuleSpec node-test | pass | `config.py` "cursors" spec | — |
| C40 tier test files | **fail** | no `core.test`, `glue.test`, `i18n.test` | 1 |
| C41 VERSION pinned | **fail** | | 1 |
| C42 synthetic fixtures | n/a | | — |
| C43 fixed run.mjs | **fail** | self-running suite | 1 |
| C44 README order | **fail** | the fixed sections are missing | 8 |
| C45 CHANGELOG | **fail** | | 8 |
| C46 route | pass | routing row at `context/foundry/README.md:67` | 8 (a row of its own) |
| C47 package rows | pass | | — |
| C48 reserved names | pass | | — |
| C49 hot-hook iteration | pass | | — |
| C50 publish timing | n/a | `publishNamespace` not used yet | 6 |
| C51 literal setting keys | n/a | no `SETTINGS` | 3 |
| C52 legacyName ↔ until | pass | | — |

## 2. Target layout vs today

```
pentaryn-cursors/                       today (snapshot)                       →  target
  module.json                           13 lines                                  + flags.pentaryn (Wave 7), minimum 14
  cursors.mjs            ENTRY          157 lines: everything                     ≈ 70 lines: wiring only
  cursors-core.mjs       PURE           94 lines                                  + SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS,
                                                                                    probeInternals(), statusOf()
  settings.mjs           (new)          —                                         SETTINGS [enabled], KEYBINDINGS [], setting()
  board.mjs              FEATURE (new)  —                                         install(reg, ctx)/uninstall(): all canvas glue
  api-manifest.mjs, api.mjs (new, opt-in --kit api)                              refresh/current/keys/keyFor (+status)
  lib/                   (new)          —                                         small + settings, api (+ errors/resolve deps)
  lang/en.json                          flat keys                                 nested under PENTARYN_CURSORS (same strings)
  assets/cursors/*                      built PNG/SVG                             unchanged
  assets/src/*  + CREDITS.md            sources, alternates, credits             → scripts/foundry/cursors/src/ (step 7)
  tools/build.mjs                       dev build script                          → scripts/foundry/cursors/build.mjs (step 7)
  DESIGN.md                             244-line plan                             → context/plans/cursors-design.md (step 8)
  README.md, CHANGELOG.md                                                         fixed section order; CHANGELOG new
  test/run.mjs                          116-line self-running suite               fixed body (use-doc §6)
  test/core.test.mjs, glue.test.mjs, i18n.test.mjs, api.test.mjs (new)
  test/golden/hooks.json, describe.json, surface.json (new)
  test/kit/ (vendored)
```

**Old → new map (snapshot lines).**

| Old | Lines | Anchor | New |
|---|---|---|---|
| `cursors.mjs` header + import | 1–8 | `import { MODULE, KEYS, VARS, keyFor` | entry header (file map) + `board.mjs` imports |
| `WRAPPED`, `current`, `imageSet` | 10–12 | `const WRAPPED = Symbol.for(` | `board.mjs` module state. **The `Symbol.for(\`${MODULE}.wrapped\`)` marker stays literal in `board.mjs`.** |
| `enabled()` | 14–16 | `function enabled() {` | `board.mjs`, calling `setting("enabled") !== false` from `settings.mjs` |
| `useImageSet`, `boardEl`, `apply` | 18–41 | `function useImageSet()` | `board.mjs` |
| `resync` | 43–59 | `function resync(el = boardEl())` | `board.mjs` |
| `guardBoard` | 61–70 | `const guarded = new WeakSet();` | `board.mjs` |
| `previewActive` | 72–76 | `function previewActive()` | `board.mjs` (the pure half is already `placementActive` in core) |
| `watchPreview`, `refresh`, `wrapOnChange` | 78–111 | `const watched = new WeakSet();` | `board.mjs` |
| init: `game.settings.register` | 113–120 | `Hooks.once("init", () => {` | `settings.mjs` row; `onChange` reaches `board.mjs` through a callback the entry passes in |
| `getSceneControlButtons` … `canvasTearDown` | 122–146 | `Hooks.on("getSceneControlButtons"` | `board.mjs` `install(reg, ctx)` via `reg.on` |
| ready: publish + attach in `setTimeout` | 148–157 | `Hooks.once("ready", () => setTimeout(() => {` | publish → entry `onReady` (`publishNamespace`, synchronous); attach → `board.mjs` `reg.once("ready", () => setTimeout(attach, 0))` |
| `cursors-core.mjs` | 1–94 | — | stays; gains constants and two pure helpers |
| `test/run.mjs` keyFor / placementActive / isModalTool / cursorValues | 22–86 | `const table = [` | `test/core.test.mjs` |
| `test/run.mjs` assets | 88–103 | `function pngSize(file)` | `test/core.test.mjs` (built PNG sizes). The "source exists" line (95) moves to the build tool's check (step 7). |
| `test/run.mjs` manifest / lang | 105–110 | `const manifest = JSON.parse(` | `test/core.test.mjs` (manifest) + `test/i18n.test.mjs` (lang) |
| `tools/build.mjs` | 1–134 | `#!/usr/bin/env node` | `scripts/foundry/cursors/build.mjs` (ROOT/SRC/OUT re-pointed) |
| `assets/src/**` | — | — | `scripts/foundry/cursors/src/**` |
| `DESIGN.md` | 1–244 | — | `context/plans/cursors-design.md` |

## 3. Ordered steps

Every step is small and behaviour-neutral unless it is marked **[declared]**. Each step lists the
finding ids it absorbs and the characterisation tests that must be green **before** it. The tests
come from step 1, which runs against unchanged code. A refactor commit never touches
`test/golden/` or the characterisation tests: `git diff --stat -- test/golden test/*.test.mjs` must be
empty at review.

### Step 0 — pre-flight (no edits)

- `jq '.modules["pentaryn-cursors"]' scripts/foundry/blueprint/wait.json` is `null`.
- Re-anchor: compare the snapshot copy with `foundry/module/pentaryn-cursors` (`diff -rq`), or run
  `git diff ee505c2..HEAD -- foundry/module/pentaryn-cursors`. The two trees were identical on
  2026-10-10 22:45.
- Live score: `./.venv/bin/python scripts/foundry/blueprint/conformance.py --module cursors --markdown`.

### Step 1 — characterise (tests and additive exports only) · absorbs: none · C14, C20, C40, C41, C43

1. Vendor: `vendor.py sync cursors --tier small --kit settings,api`. Nothing imports `lib/` yet.
2. Additive core exports in `cursors-core.mjs` (after line 7, `export const MODULE`):
   `SHORT = "cursors"`, `NS = "cursors"`, `VERSION = "0.2.0"`,
   `CONTRACT = "pentaryn-cursors/api@1"`, `I18N = "PENTARYN_CURSORS"`, `CSS = "pcur-"`,
   `HOOKS = Object.freeze({})`. Nothing reads them yet.
3. `test/run.mjs` gets the fixed body (blueprint use-doc §6) with `LEGACY = []`.
4. **`test/core.test.mjs`**: import `../cursors-core.mjs` bare first (the purity proof). Port every
   `check()` from old `run.mjs` lines 22–110 verbatim through `checkJSON` (the same JSON-equality
   semantics). Add `VERSION === manifest.version`.
5. **`test/glue.test.mjs`**: call `installFoundry({ user: makeUser({ isGM: false }) })`, then add
   stubs for `canvas.app.renderer.events = { domElement: el, currentCursor: null, setCursor: spy }`
   (`el` is a fake element with `style.setProperty/removeProperty/cursor` and `dataset`),
   `canvas.regions = { preview: { children: [], on: spy }, _placementContext: null }`,
   `canvas.ready = true`, `ui.controls = { control: { name }, tool: { name } }`, a recording
   `globalThis.MutationObserver`, and `foundry.utils.getRoute = p => "/" + p`. Use
   `t.mock.timers`. Then `await import("../cursors.mjs")`. Cases:
   - (a) `fire("init")` registers `pentaryn-cursors.enabled` as exactly `{ name: "PENTARYN_CURSORS.Setting.enabled.Name", hint: "PENTARYN_CURSORS.Setting.enabled.Hint", scope: "client", config: true, type: Boolean, default: true }`, plus an `onChange`.
   - (b) `fire("ready")`, then tick 0: `Object.keys(game.pentaryn.cursors)` deep-equals `["refresh","current","keys","keyFor"]`; `observe` was called once, on `el` with `{ attributes: true, attributeFilter: ["style"] }`; `preview.on` was called twice (`childAdded`, `childRemoved`). This is finding -31's count.
   - (c) control `tokens`, tool `target`: `api.refresh()` returns `"target"`. `el.style` holds exactly the four `VARS` with the values of `cursorValues("target", "/modules/pentaryn-cursors", false)` (no `CSS.supports` in node, so `imageSet` is false). `el.dataset.pentarynCursor === "target"`.
   - (d) setting false: `refresh()` returns `null`, the four vars are removed and `dataset` is cleared.
   - (e) resync: with `el.style.cursor = ""` and `events.currentCursor = "pointer"`, firing the observer callback leaves `currentCursor` null before the call, then calls `setCursor("pointer")` once. With `style.cursor` non-empty there is no call.
   - (f) `fire("getSceneControlButtons", { tokens: { onChange: f, tools: { ruler: {}, toggle: { toggle: true }, clear: { button: true } } } })` wraps `tokens.onChange` and `tools.ruler.onChange` (absent `onChange` included) but not toggle/button tools. A second fire does not wrap again (`WRAPPED`). If the original `onChange` throws, the error propagates **and** `refresh()` still ran.
   - (g) the observer callback with a throwing `resync` logs exactly `console.warn("pentaryn-cursors | resync failed", err)`. A throwing `refresh` inside the preview listener and inside the wrapped `onChange` logs `"pentaryn-cursors | refresh failed"`.
   - (h) `fire("canvasTearDown")`: vars cleared, `current()` is `null`.
   - (i) publish under both load orders: `game.pentaryn` absent, then extensible `{x:1}`, then `Object.freeze({x:1})`. After ready plus a tick, the frozen case yields a **new** object with `x` and `cursors`, and the old object is untouched.
   - (j) `game.settings.get` throwing → treated as enabled (`refresh()` still returns `"target"`).
   - `pinJSON("hooks", F.hooks, …)` → `test/golden/hooks.json`. Today's order: `once init`,
     `on getSceneControlButtons`, `on renderSceneControls`, `on activateCanvasLayer`,
     `on canvasReady`, `on canvasTearDown`, `once ready`.
   - Assert `F.utilsSource === "foundry"` (unless `PENTARYN_TEST_SHIMS=1`).
6. **`test/i18n.test.mjs`**: both `Setting.enabled.*` keys resolve in `lang/en.json`. Pin the two
   rendered strings verbatim (they become the oracle for step 9).
7. `GOLDEN_UPDATE=1 node --test test/glue.test.mjs` on **unchanged** code, then `node test/run.mjs`.
   **Checkpoint:** commit the diff (tests, goldens, `lib/`, `test/kit/`, the additive core
   constants) as the checkpoint (review happens at merge).

#### Step 1 record (2026-10-11, wave 1)

Step 0: `wait.json` null; `git diff ee505c2..HEAD` empty for the module (no drift); live score 57.8 %
(26/45, scored as full). Baseline: `node test/run.mjs` 84 passed, nothing red, nothing fixed.

What the checkpoint holds, and where it departs from the recipe above (each departure keeps a later
step from having to touch a frozen test):

| Item | As built |
|---|---|
| Vendor | `vendor.py sync cursors --tier small --kit settings,api` → errors, log, hooks, publish, resolve, settings, api; `kit.lock.json` `"tier": "small"`. Its own commit before the checkpoint. |
| `core.test.mjs` | Every old check through `checkJSON`, plus `VERSION`/identity constants and the live golden's `keyForTable`. **"source exists" accepts `assets/src/<src>` or `scripts/foundry/cursors/src/<src>`**, so step 7's move stays green without editing the test; step 7 still adds its own `--check-sources` pytest. |
| `i18n.test.mjs` | Compares **flattened** keys, so today's flat file and step 9's nested file both pass; both strings pinned verbatim. It does not import `settings.mjs` (does not exist yet) and does not assert one nested root (C34 fails today; step 9). |
| `glue.test.mjs` | Cases (a)–(h) and (j), plus: tool → key through `renderSceneControls` / `activateCanvasLayer`, `apply()`'s two-part short-circuit (same key **and** dataset), the spell-area preview listeners (aoe and back, GM region drag is not aoe), `canvas.ready` false, no board element, the `canvas.app.view` fallback, canvasReady's tick-later resync, a new preview container per draw. Legacy API keys are a **floor** (`in`), never an exact list; `module.api` is not pinned (SF2) — both so step 6 (C-1) passes unchanged. |
| `golden/hooks.json` | `hookSequence(F.hooks)` — **consecutive identical rows collapse.** Step 5 as written registers two `once ready` listeners (board's attach, then the entry's publish) where today there is one; collapsed, the golden is the same seven rows before and after. A third `once ready` placed anywhere but next to the other would still show. |
| `publish.test.mjs` (new) | Case (i): absent / extensible `{x:1}` / frozen `{x:1}`, each a fresh stub plus a `?order=N` copy of the entry, checked after ready **plus a tick**. |
| `live.test.mjs` (new) | SF8 fidelity: `CSS.supports` true, the five tool switches driven through the wrapped tool `onChange` (as `ui.controls.activate` does live) read back exactly `.state/live-goldens/before/cursors.json` `tools` (copied to `test/fixtures/live-before.json`); the image-set probe runs once with the live probe string. |
| `imageset.test.mjs` (new) | Coverage gap: a throwing `CSS.supports` → plain `url()` values, probed once. |
| Fixtures | `test/fixtures/board.mjs`: #board (`CANVAS`, `style.cursor` `var(--cursor-default)`), `events.setCursor` recording `currentCursor` at the call, preview container, recording `MutationObserver`. |
| Mutation spot-check | Eight one-line mutations of `cursors.mjs` (drop the `currentCursor = null`, resync now instead of a tick later, wrap toggle/button tools, drop the `WRAPPED` check, drop `childRemoved`, change a warn text, `scope: "world"`, drop the `enabled()` gate in resync) each turned the suite red. |

Quirks pinned as-is (documented behaviour, not bugs; no audit id, no KNOWN row):
- a `setCursor` that throws inside resync leaves `events.currentCursor` null (`resync failed` warned);
- with the setting off, a blanked `#board` cursor is not repaired (resync is gated on `enabled()`);
- `refresh()` with no board element returns null and clears `current()` but leaves the old board's vars;
- a throw inside the five `Hooks.on` handlers is Foundry's (`Error thrown in hooked function`), never
  `pentaryn-cursors | …` — the reason step 5 registers with `guard: false`.

**Known-bug todos: none.** Findings -30, -31, -32 and -35 are hardening, structure, an additive API and
docs; none is a defect in today's behaviour, and this guide has no `KNOWN:` row.

Coverage (gap finder only; `node --test --experimental-test-coverage` over the inner `test/**/*.test.mjs`):

| File | Before (line / branch / funcs) | After |
|---|---|---|
| `cursors-core.mjs` | 100 / 96.77 / 100 | 100 / 100 / 100 |
| `cursors.mjs` | not loaded by any test (0) | 100 / 97.65 / 100 (glue + imageset) |

The two branches left are `cursors.mjs:151` (extensible vs frozen root), which `publish.test.mjs`
covers. Node 26 merges coverage of the `?order=N` copies badly, so a whole-suite run prints a lower,
order-dependent figure for `cursors.mjs`; measure per file.

### Step 2 — pure helpers for the internals probe and status (additive) · absorbs: the pure halves of -30, -32

Add to `cursors-core.mjs`:
- `probeInternals({ events, regions })` → names of missing internals. Use the `in` operator,
  because `_placementContext` is `null` when idle. Full stubs → `[]`; `{}` → `["setCursor", "_placementContext"]`.
- `statusOf({ enabled, control, tool, placementActive, boardCursor, dataset, imageSet })` →
  `{ enabled, key, control, tool, placementActive, boardCursor, dataset, imageSet, expected }`, where
  `expected = keyFor({control, tool, templatesActive: placementActive})` and `key = enabled ? expected : null`.

Test before: add a table for each helper in `core.test.mjs`. These are new pure functions, so they
are pinned now (finding -30 and -32 recipes). Example: `drawings`/`rect` → expected and key `draw`;
the same with `enabled:false` → key `null`, expected `draw`.

### Step 3 — settings table · absorbs: — · C21, C22, C51

- New `settings.mjs`:
  `SETTINGS = [{ key: "enabled", scope: "client", config: true, type: Boolean, default: true, name: "PENTARYN_CURSORS.Setting.enabled.Name", hint: "PENTARYN_CURSORS.Setting.enabled.Hint", doc: "…" }]`,
  `KEYBINDINGS = []`, `registerSettings({ log, onChange })`, `setting = settingReader(MODULE, SETTINGS)`,
  `settingsSnapshot()`. `onChange` stays `() => { refresh(); resync(); }`. The entry passes it in,
  because `settings` must not import a feature.
- `cursors.mjs:15` becomes `setting("enabled") !== false`. `settingReader` returns the row default
  (`true`) when `get` throws, which is the same result as today's `catch { return true; }`.
- `cursors.mjs:113–120` (`Hooks.once("init", …)`) becomes the entry's `onInit` → `registerSettings`.

Tests before: glue (a), (d), (j); i18n test. The labels are the literal keys of today, so
`lang/en.json` does not change.

### Step 4 — split constants out of the entry (no-op for cursors) · C12

`MODULE` is already defined once, in core. Nothing to do. This is listed so the step numbering
matches the other guides.

### Step 5 — feature file and entry wiring · absorbs: **-31** · C10, C18

- New `board.mjs` holds snapshot lines 10–111 verbatim plus the hook bodies from 122–146. It exports
  `install(reg, ctx)`, `uninstall()` and the functions the API needs (`refresh`, `current`).
  Factor `attach()` = `guardBoard(); watchPreview(); refresh();`, called from `canvasReady` (then
  `setTimeout(() => resync(), 0)` exactly as at `:140`) and from ready (then `resync()`).
  - Register with `reg.on(name, fn, { guard: false, label })`. Today's handlers are raw, so a throw
    goes to Foundry's own `Error thrown in hooked function` path. The kit guard would log
    `pentaryn-cursors | <label>` at error level instead, and that change would need declaring. The
    labels are new metadata only.
  - The ready attach becomes `reg.once("ready", () => setTimeout(() => { attach(); resync(); }, 0), { guard: false, label: "ready: attach" })`.
  - `uninstall()` clears `current`, calls `apply(el, null)` and lets `reg.offAll()` drop the hooks. The
    `WeakSet`s and wrapped `onChange`s stay. That is harmless: a wrapped `onChange` only calls `refresh()`.
- `cursors.mjs` becomes the entry: header file map, `FEATURES = [board]`, `log`, `reg`, `ctx`,
  `install()` called **synchronously in the entry body** (migration rule use-doc §6), then
  `Hooks.once("init", onInit)` and `Hooks.once("ready", onReady)`, plus the `game.ready` hot-patch branch.

**Hook order must stay the same.** The feature registers its five `on` hooks and the ready-attach
in the old order, and the entry's `once init` and `once ready` go around them. Today `once init` is
first, so in the entry body call `Hooks.once("init", onInit)` **before** `install()`. Today the
publish runs inside `once ready`, which is last, so register `Hooks.once("ready", onReady)` **after**
`install()`. `golden/hooks.json` must not change. If it does, the step is wrong. (The golden collapses
consecutive identical rows — Step 1 record — so board's `once ready` directly followed by the
entry's `once ready` pins as the one `once ready` of today. Keep them adjacent and last.)

Tests before: all of glue (a)–(j) and `golden/hooks.json`.

### Step 6 — API and publish · absorbs: — (and -32 as an additive row) · C26, C50 (+ C27/C28 opt-in)

- `api-manifest.mjs`: legacy rows `refresh()` → `string|null`, `current()` → `string|null`, and
  `keyFor({control, tool, templatesActive})` → `string|null`, all `gm:false, writes:false`.
  `keys` is a frozen object, not a function, so it goes in `unlisted: ["keys"]` with the impl
  `keys: KEYS`. Add the row `status()` (finding -32: **additive** read, zero `style.setProperty` calls).
- `api.mjs`: `buildApiFor(ctx)` → `buildApi(MANIFEST, { refresh: () => ctx.exposed.refresh(), current: () => ctx.exposed.current(), keyFor, keys: KEYS, status: () => statusOf(ctx.exposed.snapshot()) }, { members: { settings: settingsSnapshot, trace: () => log.traces(), uninstall } })`.
  `board.mjs` exposes `refresh`, `current` and `snapshot` through `ctx.expose`.
- Entry `onReady`: `ctx.api = buildApiFor(ctx); publishNamespace(NS, ctx.api, { moduleId: MODULE });`.
  This call is **synchronous at ready**, not inside the `setTimeout` of `:148`. **[declared,
  timing-only]:** `game.pentaryn.cursors` appears one tick earlier than today. `publish.mjs`'s
  `realiasTick` re-aliases at tick 0 if the importer's freeze displaced it, so the late case is
  still covered.
- New `test/api.test.mjs` (opt-in for small): pin `surfaceOf(api)` and
  `normaliseDescribe(api.describe())` → `golden/surface.json`, `golden/describe.json`. The surface
  must be a **superset** of `["refresh","current","keys","keyFor"]`. The kit members (`describe`,
  `version`, `contract`, `settings`, `trace`, `uninstall`) and `status` are additions.

Tests before: glue (b) and (i). Glue (b) checks the four legacy keys with `includes`, not
`deepStrictEqual`, so the kit's additive members do not break it. That is the one place step 1 must
anticipate step 6. If (b) was written as an exact key list, record that as a `// KNOWN:` row in
step 1.

### Step 7 — build tool and icon sources out of the module · absorbs: **-35** (alt-* half), the cursors half of -28 · C05, C13 (CREDITS), C16, C24, C25

- `git mv foundry/module/pentaryn-cursors/tools/build.mjs scripts/foundry/cursors/build.mjs`.
  Re-point `ROOT`, `SRC` and `OUT` (`tools/build.mjs:27–29`) at the module's `assets/cursors` and the
  new `scripts/foundry/cursors/src`. The core import (`:30`) points at
  `foundry/module/pentaryn-cursors/cursors-core.mjs`.
- `git mv foundry/module/pentaryn-cursors/assets/src scripts/foundry/cursors/src`. `CREDITS.md`
  moves with the alternates. **Keep every `alt-*` SVG and its credit** (finding -35: they are
  credited alternates, not dead code).
- The "source exists" check (`test/run.mjs:95`) moves to `build.mjs --check-sources`, which needs no
  `@resvg`, plus a pytest that runs it. That pytest also asserts every `src/alt-*.svg` stem appears
  in `src/CREDITS.md` (finding -35 recipe).
- README "Credits" table: the five shipped glyphs stay credited in the module README, because the
  licence attribution must ship with the PNGs. The alternates line points at
  `scripts/foundry/cursors/src/CREDITS.md`.
- Effect on sync: the module folder no longer ships `tools/` or `assets/src/`. That is the cursors
  half of finding -28, done without any `ship_ignore` tooling.

Tests before: `core.test.mjs` PNG-size checks (unchanged), and the new pytest run against the old
location first (paths parameterised). The step changes no runtime file.

### Step 8 — docs · absorbs: **-35** (DESIGN.md half), the cursors half of -27 · C13, C44, C45, C46

- `git mv foundry/module/pentaryn-cursors/DESIGN.md context/plans/cursors-design.md`. Give it
  frontmatter and keep its `**Read this when:**` line. `README.md:4` points there.
- Rewrite `README.md` in the fixed order (use-doc §7). The content mostly exists:
  - *What the player sees*: today's table at `:9–20`.
  - *Settings*: the one client setting.
  - *API*: the `:24–26` list plus `status()`, `describe()`.
  - *Data written*: n/a, purely per-client.
  - *Flags other modules read*: n/a.
  - *Events*: none. Hooks listened to come from `golden/hooks.json`.
  - *Patches and adjustments*: the `onChange` wrap, `currentCursor`, `_placementContext`, and the row from step 10.
  - *Two sessions*: n/a, per client.
  - *Extending*: the "To add a key" recipe at `:78–79`, now with the `scripts/foundry/cursors/` paths.
  - *Pitfalls*: the "Other scripts blanking the cursor" text at `:53–59`, and senses' `body.ps-picking #board { cursor: crosshair !important }` overriding these vars during a Light pick.
  - *Files*, *Tests*, *Sync* (restart vs reload; the `afterSync` lines).
  - Credits can stay as a trailing section.
- New `CHANGELOG.md` (0.2.0, plus 0.3.0 for this migration).
- Give cursors its own routing row in `context/foundry/README.md`; it is currently bundled at `:67`.

Tests before: none at runtime. C44 is the gate.

### Step 9 — nested lang file · C34 (reload only, not a restart)

`lang/en.json` → `{ "PENTARYN_CURSORS": { "Setting": { "enabled": { "Name": …, "Hint": … } } } }`
with the same strings. Foundry flattens nested files, so the resolved keys are identical. Test
before: `i18n.test.mjs` from step 1. The rendered strings must match byte for byte.

### Step 10 — adjustments row(s) · absorbs: **-30** (registry half)

Append in the single adjustments batch, while `foundry/adjustments.yml` is idle:
- `core-board-cursor-vars`: `packages: [core]`, `modules: [pentaryn-cursors]`,
  `files: [foundry/module/pentaryn-cursors/board.mjs]`,
  `markers: ["currentCursor", "_placementContext", "setCursor"]`. Add `native_when`,
  `retire_class: guarded`, `check: make foundry-cursors-check`.
- **Row id prefix:** use the package prefix (`core-`), not `cursors-`. Conformance C32 fails any
  `<short>-*` row that no `wrapMethod({adjustments})` names (conformance.py:779–783). use-doc §5.6,
  though, asks for `<short>-` on every row. This row is a private-member read, not a patch, so the
  package prefix keeps C32 green. Report the use-doc §5.6/C32 mismatch to the blueprint owner rather than
  working around it per module.
- **WAIT sub-step:** aoe-movement-portals-39 wants one shared row for cursors' `previewActive` and
  aoe's `placementInProgress`. aoe is WAIT. Land the cursors-only row now and add aoe's file to its
  `files` list when aoe leaves `wait.json`, after re-anchoring aoe.

### Step 11 — Wave 7 restart batch (`module.json`) · C02, C07, C38

This step is not done alone. It goes into the Wave 7 batch with every other module:
`"compatibility": { "minimum": "14", "verified": "14.369" }` and
`"flags": { "pentaryn": { "tier": "small", "namespace": "cursors", "flagScope": "pentaryn-cursors", "cssPrefix": "pcur-", "generation": 14, "afterSync": [the two lines from config.py:248–249] } }`.
`flagScope` changes from `"cursors"` to the module id as **metadata only**: cursors writes no flags,
so unlike walls there is no data migration. `pcur-` is unused by every module today (grep of
`foundry/module/**/*.{css,mjs}`). A restart is needed.

### Step 12 — re-score and gates

`make foundry-cursors-check`, `vendor.py check cursors`, `conformance.py --module cursors`. Expected
result: only C07 fails before Wave 7, and C02 warns. After the sync, run the live smoke test:
`game.pentaryn.cursors.describe().version === "0.2.0"` (or the bumped version), `status()`, and
Target/Ruler/Journal/draw glyphs on the map. Also confirm that Monk's Active Tiles' blanking is
still repaired. Keep the existing manual check.

## 4. Findings that stay standalone (not structural)

| Finding | Why standalone | Where it slots |
|---|---|---|
| **-30**, runtime half | `probeInternals` warns once after `canvasReady` when an internal is missing. This is a new console line. | After step 6, as its own commit. **[declared, console-only]** |
| **-32** | `status()` is an additive read API. | A row in step 6, or its own commit right after |
| **-28**, tooling half | `ship_ignore` in `scripts/foundry/ops` (`ModuleSpec`). Tooling, not this module. Step 7 already removes cursors' build files from the shipped folder. | the python-tooling fix list |
| **-27**, context half | `context/foundry/README.md` routing text. | step 8, or the docs batch |

Absorbed by structure: **-31** (step 5) and **-35** (steps 7 and 8).

## 5. Declared behaviour changes (hand to the live-test workflow)

| # | Change | How to see it at the table |
|---|---|---|
| C-1 | `game.pentaryn.cursors` is published synchronously at `ready`, one tick earlier than today. It also gains `describe/version/contract/settings/trace/uninstall`, `status`, and `game.modules.get("pentaryn-cursors").api`. | `game.pentaryn.cursors.describe()` right after load. The cursor glyphs behave as before. |
| C-2 | A one-time `console.warn` when Foundry's cursor internals are missing (-30). | Console only. Normally silent. |

Neither changes what a player sees. C-1 is low-risk, so the live test can fold it into the
post-sync smoke check. No WAIT steps here, apart from the aoe half of step 10.

## 6. Effort

| Part | Estimate |
|---|---|
| Step 1 characterisation (glue stubs are the bulk) | 3 h |
| Steps 2–6 refactor | 2.5 h |
| Step 7 tool move + pytest | 1 h |
| Steps 8–9 docs, lang | 1 h |
| Step 10 row, step 12 gates + live smoke | 0.5 h |
| **Total** | **about 1 day (S)** |

## Wave 1 refactor record (2026-10-11)

Steps 2, 3, 5, 6, the -30 runtime half, 8 (in-module half) and 9 landed on `migrate/wave-1`. The
frozen checkpoint files (`golden/hooks.json`, `core/glue/publish/live/imageset/i18n.test.mjs`,
`fixtures/`, `run.mjs`) are byte-identical to `d49967e`; every refactor step ran the whole suite green.

| Commit | Step | Findings | Rules |
|---|---|---|---|
| `4fad56d` | 2 — `probeInternals`, `statusOf` in core | -30, -32 (pure halves) | — |
| `f7a86f9` | 3 — `settings.mjs` | — | C21, C22, C51 |
| `dcf9bb0` | 5 — `board.mjs` feature, entry wiring only | **-31** | C10, C18 |
| `ae51bca` | 6 — **[declared C-1]** kit API, synchronous publish, `status()` | -32 | C26, C50 |
| `738f4c4` | **[declared C-2]** one-time internals warning after `canvasReady` | -30 (runtime half) | — |
| `1724678` | 9 — nested `lang/en.json` | — | C34 |
| `88e8f11` | 8 (in-module half) — README fixed order, CHANGELOG | -35 (README: alternates are credited, not dead) | C44, C45 |
| `a843e0c` | test only — hot patch re-wire (coverage gap of the entry's `game.ready` branch) | — | — |

Departures from the step text, each so a frozen file stays untouched:

- **Step 2's tables** live in a new `test/status.test.mjs`, not `core.test.mjs` (frozen).
- **`status()`** landed inside step 6's declared commit (the guide allows "a row in step 6"), so
  `golden/surface.json` and `golden/describe.json` were pinned once, with it. New test files:
  `api.test.mjs` (C-1 timing, surface, describe, status, uninstall), `internals.test.mjs` (C-2),
  `hotpatch.test.mjs`.
- **Hot patch:** `board.install()` attaches a tick later at once when `game.ready` is already true
  (a `once ready` would never fire); the entry runs `onInit → install → onReady` in that branch.
- Board hooks carry labels (`describe().hooks`); all are `guard: false` as step 5 says.

**Not done here — outside this module's folder** (the wave-1 agent owned only the module and this
guide; handed back as an exact edit list): step 7 (`tools/build.mjs` and `assets/src/` →
`scripts/foundry/cursors/`, `--check-sources` + pytest, -35 alt-* half and the cursors half of
-28), step 8's `DESIGN.md` → `context/plans/cursors-design.md` and the own routing row in
`context/foundry/README.md` (-35 DESIGN half, cursors half of -27), step 10's row (already listed in
`adjustments-batch.md`; the aoe widening row there must name `board.mjs`, not `cursors.mjs`), and
step 11 (already in `wave7-restart-batch.md`). The README still points at `DESIGN.md`, `tools/` and
`assets/src/` in the module until those moves land, then its four references change with them.

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | 88.9 % (40 / 45 fail-class rules) — `conformance.py --module cursors --markdown`, 2026-10-11, wave 1 (before the out-of-module moves) |
| Date | 2026-10-11 (wave 1, in-module part) |
| Commits (Joe-approved) | characterisation: b0ae88a (vendor), d49967e (checkpoint) · refactor: 4fad56d, f7a86f9, dcf9bb0, 1724678, 88e8f11 · declared: ae51bca (C-1), 738f4c4 (C-2) · tests: a843e0c |
| Declared changes handed to the live-test workflow | C-1, C-2 (not yet run) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes (row already present: cursors step 11) |
| Adjustments rows appended to `adjustments-batch.md` | yes (row already present); the aoe widening row's `cursors.mjs` must become `board.mjs` |
| Still failing, and why | C05, C24, C25 (`tools/build.mjs`) and C13 (`DESIGN.md`, `assets/src/CREDITS.md`) clear with the step 7/8 moves out of the module; C07 (and the C02 warning) in the Wave 7 `module.json` batch. Tests: 55 node:test, all pass. |
