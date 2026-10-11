---
title: Migrating pentaryn-movement to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, migration, movement]
---

# Migrating `pentaryn-movement` to the blueprint

**Read this when:** you are about to bring `pentaryn-movement` up to the addon blueprint, as part of
the fix phase after the 2026-10 code audit. **Not this file:** the general procedure →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the order across modules
→ [`migration-order.md`](migration-order.md) · the audit findings in full →
`context/plans/code-audit-2026-10/movement.md`.

> **Re-anchored to 4e64f47 on 2026-10-11.** Line numbers below are now HEAD lines. The usability
> re-run (17275c9, ledger U-8-7, module 0.1.1 → 0.1.2) added a "ghost movement is available again"
> toast: pure `ghostBack` in `movement-core.mjs:121–129` (+6 legacy checks, now 89), a `clearedBy`
> module variable (`movement.mjs:297`), a branch in `refresh()` (:308–312) with one more
> template-built key (`notify.back.${clearedBy}`, :310), two lang keys and a README sentence. In
> `movement.mjs` everything above :297 kept its snapshot line and everything below moved +7. No step
> was resolved or made obsolete; S1, S3, S4 and S7 gained the new code, and finding
> `aoe-movement-portals-42` (wrong toast text after a mid-fight policy change) is a new standalone fix.

Line numbers were originally the **frozen audit snapshot** (pentaryn `ee505c2` plus the uncommitted
tree as of 2026-10-10 20:15); since the re-anchor they are 4e64f47 lines. Re-run
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module movement --markdown` and
`git diff 4e64f47 -- foundry/module/pentaryn-movement` before step 1. Treat the quoted anchors as
the authority whenever a line number has moved.

**WAIT: no.** Movement is not in `scripts/foundry/blueprint/wait.json`, and no step edits
pentaryn-combat, -transform or -aoe. Its combat reads go through `game.combats`, never through
pentaryn-combat's API.

---

| Gap-fill (2026-10-10) | |
|---|---|
| Prerequisites | R7 C03 dnd5e use — journal half **landed**; movement half **landed** with D4 (2026-10-11): `\bignoreTokens\b` in `packages.json` `dnd5e.codePatterns`; C03 passes live |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module movement --markdown`. No status changed on the snapshot; C33 now lists private internals (R6) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today — 53.7 % (22 / 41 fail-class rules)

**Re-scored 2026-10-11** on the live folder at 4e64f47 (`conformance.py --module movement`): still
**53.7 % (22/41)**, the same 19 fails (C03, C07, C12, C14, C18, C20, C21, C22, C24, C26, C27, C28, C35,
C37, C40, C41, C43, C44, C45), warns C06w and C10, manual C31 and C33. Only line numbers and C35's
ratio moved; the "Detail" column below is updated to HEAD.

Originally scored with `conformance.py --snapshot <audit-snapshot>/pentaryn --module movement`. "Clears at" names
the step in §3 that turns the rule green. W7 means the Wave 7 restart batch (`module.json`, synced
once). ADJ means the adjustments batch (`foundry/adjustments.yml`, appended in one go while the file
is idle).

| Rule | Class | Today | Detail (snapshot) | Clears at |
|---|---|---|---|---|
| C01 | fail | pass | id == folder | — |
| C02 | warn | pass | minimum "14" | — |
| C03 | fail | **fail** | `relationships.systems` names dnd5e, but no source matches the dnd5e code patterns. The dependence is real: `ignoreTokens` is honoured by dnd5e's `Token5e#constrainMovementPath`, and `CONFIG.Token.objectClass` is Token5e. It only shows up in comments | §6, decision D-M1 |
| C04 | fail | pass | languages present | — |
| C05 | fail | pass | one file, reachable | — |
| C06 / C06w | fail / warn | pass / **warn** | `movement.css` at the root | W7 (→ `styles/movement.css`) |
| C07 | fail | **fail** | no `tier`, `namespace`, `cssPrefix`; `flagScope: "movement"` | W7 |
| C08 | fail | pass | no socket | — |
| C09 | fail | pass | no third-party package named | — |
| C10 | warn | **warn** | `movement.mjs` 434 lines (427 at the snapshot; entry cap 150) | S4 |
| C11 | fail | pass | `movement-core.mjs` is pure | — |
| C12 | fail | **fail** | `movement.mjs:39 const MOD = core.MODULE` | S3 |
| C13 | fail | pass | no stray .md | — |
| C14 | fail | **fail** | no `lib/kit.lock.json` | S1 |
| C15 | fail | pass | `import * as core` is a core barrel | stays legal; S4 turns it into named imports anyway |
| C16 | fail | pass | — | stays green through S4 (role table below) |
| C17 | fail | pass | module-scope hooks live in the entry (the only file) | S4 moves them into a feature through `reg` |
| C18 | fail | **fail** | the scorer reads `movement-core.mjs` as a feature target (`import * as`) with no install/uninstall | S4 (named import of core; `ghost.mjs` exports install/uninstall) |
| C19 | fail | pass | emits nothing | — |
| C20 | fail | **fail** | no `test/golden/hooks.json` | S1 |
| C21 | fail | **fail** | `game.settings.register/get` at `movement.mjs:51,344,355,358,362` (snapshot 51,337,348,351,355) | S3 |
| C22 | fail | **fail** | no `SETTINGS` export | S3 |
| C23 | fail | pass | — | — |
| C24 | fail | **fail** | bare `catch {}` at `movement.mjs:386` (renderSceneControls) and `:392` (refreshToken) (snapshot :379, :385). `:51` is caught by C21 instead | S5 |
| C25 | fail | pass | every console line carries `${MOD} \|` | stays green: `log.warn` emits the same text |
| C26 | fail | **fail** | `movement.mjs:413` `setTimeout(…, 0)` around publish (snapshot :406) | S6 |
| C27 | fail | **fail** | no `api-manifest.mjs` / `buildApi` | S6 |
| C28 | fail | **fail** | no `golden/describe.json`, `surface.json` | S6 |
| C29 | fail | n/a | writes no flags | — |
| C30 | fail | pass | no queries | — |
| C31 | manual | manual | `setGhost` / `setPolicy` | S6 records them as `legacy` rows; `setPolicy` keeps `throw new Error("GM only")` (documented) |
| C32 | fail | pass | **Blind spot:** the two hand wraps assign through a local `proto` variable (`proto._getDragConstrainOptions = patched`, `:128`; `:155`), and the sort is an instance replacement (`:179`). C32's regex only sees a literal `.prototype.x =`, so it never sees these | S2 and ADJ (rows + `wrapMethod`) |
| C33 | manual | n/a | `_getDragConstrainOptions`, `_prepareKeyboardMovementUpdates`, `_lastSortedIndex` are private core members the scan does not list | S2 and ADJ cover them by hand |
| C34 | fail | pass | nested, one root | — |
| C35 | fail | **fail** | definite key coverage 41 % (12/29; 44 %, 12/27 at the snapshot): template-built keys at `:226, :231, :240, :245, :255, :273, :303`, plus U-8-7's `:310` (`notify.back.${clearedBy}`) | S3 (literal key maps in core) |
| C36 | warn | pass | — | — |
| C37 / C37w | fail / warn | **fail** / pass | `#scene-controls button.tool.pm-blocked` (+ `::after`) is not under `.pentaryn-movement` or a declared prefix | W7 (`cssPrefix: "pm-"`; the selector already contains `.pm-`) |
| C38 | fail | n/a | no prefix declared | W7 (`pm-` is free: no other module CSS uses `.pm-`) |
| C39 | fail | pass | ModuleSpec runs node-test | — |
| C40 | fail | **fail** | no `core/glue/hooks/api/i18n.test.mjs` | S1 (core, glue, hooks), S3 (i18n), S6 (api) |
| C41 | fail | **fail** | no `VERSION === module.json` pin | S1 |
| C42 | manual | n/a | no fixtures dir yet | S1 adds synthetic fixtures |
| C43 | fail | **fail** | `test/run.mjs` is a self-running suite | S1 |
| C44 | fail | **fail** | README sections out of order and missing | S7 |
| C45 | fail | **fail** | no CHANGELOG | S7 |
| C46 | fail | pass | routed from `context/foundry/README.md` | — |
| C47 | fail | pass | no third-party package | — |
| C48 | fail | pass | no reserved names in the API | — |
| C49 | warn | pass | `refreshToken` iterates nothing the regex matches, but `ghostFor` maps every combat and combatant **per token** (finding -19) | standalone fix F-M1 adds the `// hot:` cache |
| C50 | fail | n/a | `publishNamespace` not used yet | S6 (`when: "ready"`) |
| C51 | fail | n/a | no `SETTINGS` | S3 |
| C52 | fail | pass | — | — |

**Target.** After S1–S7 and before Wave 7, 42 / 43 fail-class rules pass (97.7 %). Only C07 is
open; C50 and C51 become applicable. C03 also passes once decision D-M1 is taken. After the Wave 7
batch, 44 / 44 pass (100 %), with C38 now applicable.

---

## 2. Target layout vs today

Tier: **full**. Movement has settings and an API write (`setPolicy`) — the use-doc lists it as full,
not small.

| Target file | Role | Comes from (snapshot `movement.mjs` unless stated) |
|---|---|---|
| `movement.mjs` | entry (≲150) | header comment `1-35` (trim the Foundry line numbers, finding -37); a new `FEATURES = [ghost]`, `ctx`, phases, publish; `Hooks.once("init")` body `343-368` → calls `registerSettings()`; `Hooks.once("setup")` `371-374` and `Hooks.once("ready")` `413-433` → `onSetup` / `onReady` |
| `movement-core.mjs` | core (pure) | as today `1-187` (incl. U-8-7 `ghostBack`, :121–129) **plus** `SHORT`, `NS`, `VERSION`, `CONTRACT`, `I18N`, `CSS = { blocked: "pm-blocked" }`, `HOOKS = {}`; literal key maps `TOOL_KEYS` / `GM_KEYS` / `NOTIFY_KEYS` (replace the template keys at `226-310`, incl. `notify.back.*`); `ghostKeyboardMovement` (from `141-153`, finding -18); `statusFrom` (from `94-104`, finding -23) |
| `settings.mjs` | settings | `DEFAULTS` `48`, `setting()` `50-52`, the four `register` calls `344-367` → a `SETTINGS` table of 4 rows; `onChange` dispatch through `onSettingChange(key, fn)` |
| `combat-adapter.mjs` | adapter | `combatSummaries()` `65-73`; the notes/tokens mapping half of `pinsUnderTokens` `328-335` → `pinInputs(scene)` |
| `ghost.mjs` | feature (≲500, about 300 lines) | `policy`/`wish` `53-54`; `combatActive` `75-77`; `ghostFor` `80-87`; `ownedRankOf` `89-91`; the two patches `110-157` (through `wrapMethod`); the layer sort and token refresh `163-198`; the toolbar `204-287`; `clearedBy` + `refresh`/`queueRefresh` `297-321` (the U-8-7 ghost-back branch :308–312 included); every `Hooks.on` at `376-409` → `reg.on` inside `install(reg, ctx)`; `ctx.expose({ status, ghostFor, combatActive, setGhost, patched })` |
| `api-manifest.mjs` | manifest (new) | one `legacy: true` row per published path at `414-428`: `status`, `ghostFor`, `combatActive`, `setGhost`, `setPolicy`, `pinsUnderTokens`; `unlisted: ["core"]` |
| `api.mjs` | api (new) | the `setPolicy` body `421-426`; `pinsUnderTokens` `328-337` (adapter + core); `core` is a frozen shallow copy `{ ...core }` (see S6); `selftest` (patched drag/keyboard, settings readable) |
| `lib/*.mjs`, `lib/kit.lock.json` | vendored | `vendor.py sync movement --tier full` |
| `lang/en.json` | | unchanged keys; **plus** literal name/hint keys for the two hidden rows (S3) |
| `movement.css` | | unchanged until W7 (→ `styles/movement.css`) |
| `test/run.mjs` | fixed body | the old suite `test/run.mjs` (`1-170`; 89 checks) is moved verbatim to `test/legacy-core.mjs` and listed in `LEGACY`, then converted into `core.test.mjs` |
| `test/{core,glue,hooks,api,i18n}.test.mjs`, `test/golden/{hooks,describe,surface,settings-register}.json`, `test/kit/`, `test/fixtures/{scene,combats}.mjs`, `test/graph-allow.json` (empty) | tests | new |
| `README.md` (use-doc §7 order), `CHANGELOG.md` | docs | README `1-120` rewritten (S7); version notes → CHANGELOG |

Import graph after S4: entry → ghost, settings, api, core, lib · ghost → core, settings,
combat-adapter, lib · api → core, combat-adapter, settings, api-manifest, lib · settings → core,
lib · combat-adapter → core. `graph-allow.json` stays empty.

Hook registration timing stays the same. Movement registers its hooks at module scope today, so
`ghost.install(reg, ctx)` is called **synchronously in the entry body** (use-doc §6, migrating
modules). The patches still apply at `setup`, inside `reg.once("setup", …)`.

---

## 3. Ordered steps

Every step is behaviour-neutral unless marked **[declared]**. Run `node test/run.mjs` (from the
module folder) after each step, and run `make foundry-movement-check` before handing it over. Every
step after S1 must leave `test/golden/` and the characterisation tests untouched:
`git diff --stat -- test/golden test/*.test.mjs` should be empty.

### S1 — Characterise, vendor, convert the runner (checkpoint)

Absorbs: **-22** (the glue becomes testable) and the test half of **-18**, **-21** and **-23**.
Clears C14, C20, C40 (core, glue, hooks), C41, C43.

1. `vendor.py sync movement --tier full`, then add the `election` file only if F-M1 needs it (it
   does not). Write `lib/kit.lock.json`.
2. Move the old `test/run.mjs` to `test/legacy-core.mjs` unchanged and put it in `LEGACY`. Give
   `test/run.mjs` the fixed body (use-doc §6).
3. Add a test seam **without restructuring**. Append
   `export const _internals = { sortTokenObjects, onRefreshToken, status, pinsUnderTokens, patchDrag, patchKeyboard, ghostFor, ownedRankOf, refresh, addTools }`
   at the end of `movement.mjs`. This is finding -22's seam. The tests never import it directly:
   they import `test/fixtures/seams.mjs`, which re-exports `_internals`. S4 then edits only that
   shim (a fixture, not a characterisation test) to re-export from `ghost.mjs`, and deletes the
   seam.
4. Write these tests against the **unchanged** code:
   - **`core.test.mjs`**: import `../movement-core.mjs` bare and first. Port the 89 legacy checks (83 + U-8-7's six `ghostBack` rows) to
     `assert.deepStrictEqual`. Pin `VERSION` against `module.json` once S3 adds `VERSION` (until
     then, assert `module.json.version === "0.1.2"` from `manifestOf`).
   - **`glue.test.mjs`**: `installFoundry({ user: makeUser({ isGM: false }), settings: {} })`, then
     `await import("../movement.mjs")`.
     - Assert `F.utilsSource === "foundry"`.
     - `F.fire("init")`: capture the four `game.settings.register` calls (key, scope, config, type,
       default, choices, name, hint, and whether `onChange` is present) into
       `golden/settings-register.json`.
     - `F.fire("setup")`: with a stub `CONFIG.Token.objectClass.prototype._getDragConstrainOptions`
       and `CONFIG.Canvas.layers.tokens.layerClass.prototype._prepareKeyboardMovementUpdates`, assert
       both are replaced and carry `__pentarynMovement === true`.
     - With both missing, pin the two warn texts byte for byte:
       `pentaryn-movement | no Token#_getDragConstrainOptions; ghost drag disabled` and
       `pentaryn-movement | no TokenLayer#_prepareKeyboardMovementUpdates; ghost arrow keys disabled`.
     - Drag wrap: original returns `{ ignoreWalls: false, k: 1 }`. Owner token with ghost on gives
       `{ ignoreWalls: true, k: 1, ignoreCost: true, ignoreTokens: true }`. A GM, a non-owner and
       ghost off all give the base unchanged.
     - Keyboard wrap: the finding -18 table.
       `r = ['x', { movement: { a: { constrainOptions: { ignoreWalls: false, k: 1 } }, b: { constrainOptions: { ignoreWalls: false } } } }]`,
       objects `a, b, c`, ghost true for `a` only → `a` mutated as above, `b` untouched, the result
       is `r` itself. `undefined` result → `undefined`. `[1, {}]` → unchanged.
     - Sort: finding -22's three-token layer `[friend(sort 9), mine(sort 2, owner), flyer(elev 30)]`
       → order `[friend, mine, flyer]`, `sortDirty === false`. `ownedOnTop` false → order by core
       keys only.
     - `onRefreshToken`: an owned ghost token with `{ refreshState: true }` gets
       `mesh.alpha === token.alpha * doc.alpha * 0.55`, and `mesh.sort === core.meshSort(sort, rank)`.
       A destroyed token is untouched.
     - `F.fire("ready")`, then advance one timer tick: `game.pentaryn.movement` has exactly the keys
       `["status","ghostFor","combatActive","setGhost","setPolicy","pinsUnderTokens","core"]`.
     - `status()` key order:
       `["policy","combatOnScene","allowed","reason","wish","ghost","ownedOnTop","patched"]`,
       pinned with finding -23's two cases.
     - `setPolicy("always")` as a player rejects with `GM only`. As a GM it writes
       `ghostPolicyLast` then `ghostPolicy`, recorded in `F.calls` order. `setPolicy("off")` writes
       only `ghostPolicy`.
     - `refresh()`: as a player with wish on and policy `off`, assert one
       `ui.notifications.info("PENTARYN_MOVEMENT.notify.cleared.off", { localize: true })` and a
       `settings.set(ghost, false)`. Combat updates that do not change the button state cause no
       `ui.controls.render`.
     - Ghost-back sequence (U-8-7; finding -22's extension): cleared by combat → combat ends →
       exactly one `ui.notifications.info("PENTARYN_MOVEMENT.notify.back.combat", { localize: true })`;
       a further refresh posts nothing; turning the wish back on before the fight ends suppresses
       it; a GM never gets either toast. Also pin today's text for finding -42's case (cleared by
       combat, GM sets `always` mid-fight → `notify.back.combat`) as a `// KNOWN:` row.
   - **`hooks.test.mjs`**: pin `F.hooks` to `golden/hooks.json`, 16 entries in this order:
     `once init, once setup, getSceneControlButtons, renderSceneControls, drawTokenLayer, canvasReady, refreshToken, updateActor, updateToken, createCombat, updateCombat, deleteCombat, createCombatant, updateCombatant, deleteCombatant, once ready`.
5. `GOLDEN_UPDATE=1 node test/run.mjs` once, on unchanged code. **Checkpoint:** review the diff
   (tests and goldens only). It is committed by the agent as the checkpoint.

### S2 — Patches through `wrapMethod`, adjustments rows

Absorbs: **-17** (rows) and the structural half of **-18**. Clears the C32/C33 blind spot.
Characterisation: S1's drag, keyboard and sort tests. Add the patch-record test **now**: every
record from `lib/patch.mjs patches()` has a non-empty `adjustments`, and the `marker` literal is
`__pentarynMovement` for all three.

- `patchDrag` (`114-130`): keep the existence check and today's warn text **at the call site**, then
  call
  `wrapMethod(MODULE, { target: proto, name: "_getDragConstrainOptions", label: "Token#_getDragConstrainOptions", marker: "__pentarynMovement", adjustments: "movement-drag-constrain-ghost" }, function (wrapped, ...args) { const base = wrapped(...args); try { return ghostFor(this) ? constrainFor(base, true) : base; } catch (err) { log.warn("drag constrain skipped", err); return base; } })`.
  `wrapMethod`'s own "not found" warn must never fire, because its text differs from today's.
- `patchKeyboard` (`133-157`): the same pattern. The body becomes
  `const result = wrapped(objects, ...rest); try { ghostKeyboardMovement(result, objects, ghostFor); } catch (err) { log.warn("keyboard constrain skipped", err); } return result;`.
  `ghostKeyboardMovement` moves to core in S3. Until then it is a local function with the exact
  `143-150` loop.
- The layer sort (`176-181`): `wrapMethod(MODULE, { target: objects, name: "sortChildren", label: "TokenLayer.objects#sortChildren", marker: "__pentarynMovement", adjustments: "movement-layer-sort-owned" }, function () { return sortTokenObjects.call(this); })`.
  - It replaces the method and never calls `wrapped`, as today.
  - It records one patch per canvas draw. That growth is negligible and pinned: `patches().length`
    rises by 1 per `drawTokenLayer`.
  - Keep `objects.sortDirty = true` after the call.
- **ADJ batch** (rows appended later in one batch; ids follow use-doc §5.6, not the `core-` ids
  the finding proposed):
  - `movement-drag-constrain-ghost` — markers `_getDragConstrainOptions`, `__pentarynMovement`
  - `movement-keyboard-constrain-ghost` — marker `_prepareKeyboardMovementUpdates`
  - `movement-layer-sort-owned` — markers `sortChildren`, `_lastSortedIndex`

  Each row: packages `[core, dnd5e]`, files `[foundry/module/pentaryn-movement/ghost.mjs]` (after S4;
  `movement.mjs` if the batch lands first), `retire_class: guarded`,
  `check: make foundry-movement-check`. The `what`, `why` and `native_when` text comes from
  finding -17.
- Do **not** switch to libWrapper (finding -18's warning: it changes wrapper chaining).

### S3 — Settings table, core constants, literal i18n keys

Absorbs: **-21**, the core half of **-18** (`ghostKeyboardMovement` into core) and the core half of
**-23** (`statusFrom`). Clears C12, C21, C22, C35, C51, and adds `i18n.test.mjs`.

Characterisation first (add before editing):
- the `settings-register.json` golden from S1;
- `core.test`:
  - `ghostKeyboardMovement` with finding -18's six cases;
  - `statusFrom({ policy: "exploration", combat: true, wish: true, isGM: false, ownedOnTop: true, patched: { drag: true, keyboard: false } })`
    deep-equals the S1 `status()` pin;
  - `TOOL_KEYS.on === "PENTARYN_MOVEMENT.tool.on"`, and the same for every state of `playerTool`,
    `gmTool`, `ghostAllowed`, `wishToClear` and the `ghostBack` reasons;
- `i18n.test`: every key in the maps exists in `lang/en.json`.

Then:
- **core.**
  - Add `SHORT = "movement"`, `NS = "movement"`, `VERSION = "0.1.2"`,
    `CONTRACT = "pentaryn-movement/api@1"`, `I18N = "PENTARYN_MOVEMENT"`,
    `CSS = { blocked: "pm-blocked" }`, `HOOKS = Object.freeze({})`.
  - Add `TOOL_KEYS`, `TOOL_CLIP_KEYS`, `GM_KEYS`, `NOTIFY_BLOCKED`, `NOTIFY_CLEARED`, `NOTIFY_BACK` (U-8-7: `{ combat, off }` → `PENTARYN_MOVEMENT.notify.back.*`). Each is a
    frozen `{ state: "PENTARYN_MOVEMENT.…" }` map with full literal keys, which C35 sees as definite.
  - Add `ghostKeyboardMovement` and `statusFrom`.
  - Delete `const MOD = core.MODULE` (`39`) and use `MODULE`.
- **glue.** Replace each template key with a map lookup. Every rendered string is byte-identical.
- **settings.mjs.** Four rows in **today's registration order**: `ghostPolicy`, `ghostPolicyLast`,
  `ghost`, `ownedOnTop`. Copy the literal `name`/`hint` from `344-367`: `PENTARYN_MOVEMENT.settings.policy.name`
  and so on. `choices` come from `POLICIES` with the literal `PENTARYN_MOVEMENT.settings.policy.<v>`
  values.
- **onChange.**
  - `onChange: v => handlers.ghostPolicy?.(v)` (likewise `ghost`, `ownedOnTop`).
  - `export function onSettingChange(key, fn)` fills `handlers`.
  - The feature calls `ctx.onSettingChange("ghostPolicy", () => queueRefresh())`. The entry passes
    `onSettingChange` in `ctx`.
  - The handlers are set during the synchronous install, before `init`, so every change reaches
    them as today.
- **Hidden rows.** `ghostPolicyLast` and `ghost` today register with no `name`/`hint`. The kit
  always gives non-store rows a name and hint, and C51 wants literal keys present in lang. Add
  `PENTARYN_MOVEMENT.settings.ghostPolicyLast.{name,hint}` and
  `PENTARYN_MOVEMENT.settings.ghost.{name,hint}` to `lang/en.json` (a reload-only change), and set
  them as literals on the rows.
  - This is the **only** difference in the registration capture. Re-pin `settings-register.json`
    in a separate commit that names the change.
  - It is invisible: `config: false` rows never render.
  - Do not use `store: true` to dodge it. Store rows force `scope: "world"`, and `ghost` is client
    scope.
- `setting()` comes from the kit's `settingReader`. It keeps the same fallback (the row default on
  a throw).

### S4 — Split the entry: `ghost.mjs` feature, `combat-adapter.mjs`

Absorbs the structure of **-19** (the combat read moves to an adapter; the cache itself is F-M1).
Clears C10, C17, C18, and keeps C16 and C25 green.

Characterisation: the S1 glue suite and `hooks.json` must pass **unchanged**. Add before splitting:
`combatSummaries` over finding -19's fixture combats `[linked(), linked({active:false}), unlinked, hidden-combatant]`
→ the plain array is pinned (hidden combatants dropped, `sceneId ?? _source.scene`).

- `combat-adapter.mjs`: `combatSummaries()`. Add `pinInputs(scene)`, which returns
  `{ notes, tokens }` exactly as `328-335` builds them.
- `ghost.mjs`: everything in §2's row.
  - `install(reg, ctx)` registers, in today's order: `reg.once("setup", patchAll)`,
    `getSceneControlButtons`, `renderSceneControls`, `drawTokenLayer`, `canvasReady`,
    `refreshToken`, `updateActor`, `updateToken`, and the six combat hooks.
  - Each `reg.on` uses `{ guard: false }` wherever today's handler has no try/catch, so a throw
    behaves as today. `getSceneControlButtons` keeps its own try/catch and warn text.
  - `uninstall()` unwraps the three patches and resets `lastToolKey` and `clearedBy` (U-8-7 session state).
- Entry:
  - `Hooks.once("init", onInit)` (settings).
  - `ghost.install(reg, ctx)` synchronously in the body, at the same moment as today's module-scope
    `Hooks.on`.
  - `Hooks.once("ready", onReady)`.
  - `hooks.json` must still list `once init` first, then the feature's hooks (`once setup` is now
    the feature's `reg.once`, still second), then `once ready`.
- Remove the `_internals` seam from the entry. Point `test/fixtures/seams.mjs` at `ghost.mjs`'s
  named exports. No `*.test.mjs` changes.

### S5 — Logging: kit `log`, no empty catch

Absorbs **-20**. Clears C24.

Characterisation: a glue test where `onRefreshToken` throws (a token whose `mesh` getter throws).
- **Before** this step: the hook swallows it, with no console output.
- **After**: one `console.warn` whose first argument is
  `pentaryn-movement | refreshToken (further errors suppressed)`, and none on the second throw.
  Add this as a new test in this step; the old tests are untouched.

- `makeLog(MODULE)` once, in the entry. `ctx.log` reaches the feature.
- Every `console.warn(\`${MOD} | …\`, err)` becomes `log.warn("…", err)`. The text is byte-identical
  (pinned in S1).
- `:386` and `:392` (snapshot `:379`, `:385`): `catch (err) { log.warnOnce("renderSceneControls", "renderSceneControls (further errors suppressed)", err); }`,
  and the same for `refreshToken`. The kit's `warnOnce` replaces the finding's `makeWarnOnce`, so
  nothing new goes into core.
- `settings.mjs`'s `try … catch { return default }` lives in the kit's `settingReader`, which C24
  does not scan.

### S6 — API manifest, publish, describe

Absorbs the interface half of **-23** (`describe`, `version`, the settings key map). Clears C26,
C27, C28 and C50, and adds `api.test.mjs`.

Characterisation (S1 already pins the key list and `status()`). Add before editing:
- `surfaceOf(game.pentaryn.movement)` on unchanged code → `golden/surface.json`;
- `pinsUnderTokens` on a synthetic scene (notes at token centres, one hidden token, one
  player-owned) → pinned output.

Then:
- `api-manifest.mjs` rows, all `legacy: true` with today's parameter names, so `buildApi` never
  resolves refs:

  | Row | params | returns | gm | writes |
  |---|---|---|---|---|
  | `status` | `opts?` | object | false | false |
  | `ghostFor` | `token` | boolean | false | false |
  | `combatActive` | `sceneId?` | boolean | false | false |
  | `setGhost` | `on` | Promise | false | true (client setting) |
  | `setPolicy` | `value` | Promise; throws `GM only` | true | true |
  | `pinsUnderTokens` | `scene?` | array | false | false |

  `unlisted: ["core"]`. `flags: { writes: [], reads: [] }`.
- `api.mjs`:
  - `buildApiFor(ctx)` with `members.settings = settingsSnapshot` and `members.trace`.
  - `members.uninstall = ctx.uninstall`. This is new; today the API has no uninstall.
  - `core` is passed as `{ ...core }`. `buildApi` deep-freezes the API, and `Object.freeze` throws
    on a module namespace object; the copy holds the same functions.
- `onReady`:
  - `ctx.api = buildApiFor(ctx)`, then
    `publishNamespace("movement", ctx.api, { moduleId: MODULE })`, **synchronously** inside
    `ready`.
  - The kit's one re-alias tick covers the importer's frozen-root replacement (until
    items-journal-1).
  - Delete the `setTimeout` at `413` (snapshot `406`).
- `status(opts = {})` gains the optional `{ sceneId }` from finding -23. It is additive: the default
  stays `canvas?.scene?.id`. New keys (`sceneId`, `version`, `settings` key map) go **after**
  `patched`, so S1's prefix pin still holds. Pin the new keys in a new test.
- **[declared] D-M2.** The published API changes, so it goes to the live-test workflow:
  - it is now a frozen object with the kit members (`describe`, `version`, `contract`, `settings`,
    `trace`, `uninstall`);
  - it is published at `ready` instead of one tick later;
  - it fires `pentaryn-movement.ready` and `pentaryn.ready`.

  The existing keys keep their behaviour. Live smoke:
  - `game.modules.get("pentaryn-movement").api === game.pentaryn.movement` after a reload with the
    importer active;
  - `describe().version === "0.1.2"`;
  - `selftest().ok`.

### S7 — Docs

Absorbs **-37**, plus the README/API parts of **-23**. Clears C44 and C45.

- README in use-doc §7 order:
  - **What the player sees**: owned-on-top, the ghost button.
  - **Settings**: full get-keys and scope, e.g. `game.settings.get("pentaryn-movement","ghostPolicy")` (world).
  - **API**: the manifest table. `setGhost` is marked "player clients only; from a GM client
    (or the MCP bridge) it changes nothing for players".
  - **Data written**: none on documents; the client settings `ghost` and `ownedOnTop`.
  - **Flags other modules read**: n/a.
  - **Events**: n/a, plus the hook list from `golden/hooks.json`.
  - **Patches and adjustments**: the three rows.
  - **Two sessions**: client-only, nothing elected.
  - **Extending**: pure rule in core plus a fixture; a hook through `reg.on` in `ghost.mjs`; a
    setting row.
  - **Pitfalls**: the private core members it wraps.
  - **Files**, **Tests**, **Sync**: reload, except `module.json` → restart.
- Replace the Foundry source line numbers (`README:43,46,58`; header `15,17,24`) with method names
  plus `verified on core 14.369 / dnd5e 6.0.6`.
- `CHANGELOG.md` with 0.1.0, 0.1.1 and 0.1.2 (U-8-7 ghost-back toast) from the README and git history.
- Use-doc: a short `context/foundry/movement.md` is optional. The routing row exists already (C46).

---

## 4. Findings that stay standalone (not structural)

| Finding | Fix | When | Test (from the finding) |
|---|---|---|---|
| **-19** (F-M1) ghost context cache | Add `buildGhostContext`, `ghostForCtx` and `combatSceneIds` to core. The glue holds `let ctx = null` and invalidates it **before** `queueRefresh` in the three onChanges, the six combat hooks and `canvasReady`. Add a `// hot: ghost context` comment on `refreshToken` (C49) | After S4: one feature file means one invalidation site | Finding -19's 480-case equivalence matrix (`ghostForCtx(buildGhostContext(…))` equals `ghostFor(…)` with `normalizePolicy` applied to both), plus `combatSceneIds` agreeing with `combatOnScene` |
| **-42** (F-M2, new 2026-10-11) "ghost is back" toast text | Pure `ghostBackKey({ cleared, policy, combatActive, wish })` in core returning a literal key from `NOTIFY_BACK`: `off` when it was cleared by combat but the fight is still on (the GM allowed it), else the cleared reason. Glue posts the key if non-null and resets `clearedBy`. Keep `ghostBack = (...) => !!ghostBackKey(...)` so the six legacy rows stay green | With S3 (it shares the `NOTIFY_BACK` map) or any time before | Finding -42's table; flip S1's `// KNOWN:` row in the commit that names the change |

The structural steps absorb all of -17, -18, -20, -21, -22, -23 and -37.

---

## 5. Declared changes needing a live test

| # | Change | How to see it at the table |
|---|---|---|
| D-M2 | API published synchronously at `ready`, frozen, with kit members and `pentaryn-movement.ready` / `pentaryn.ready` (S6) | Reload as GM with the importer active. `game.pentaryn.movement.status()` answers, `describe()` lists six methods, and `Object.isFrozen(game.pentaryn.movement)` is true |
| D-M3 | Two hidden settings gain name/hint labels (S3) | Configure Settings → Pentaryn Movement shows the same two rows, in the same order, with the same texts |
| F-M1 | Ghost context cache (-19) | README "Verify live" 1–3, as a player: ghost on, then the GM starts a combat on the scene (it clears with the toast); the GM flips the policy off and back; owned-on-top still lifts after an ownership change |
| D-M4 | (F-M2, finding -42) the "available again" toast after a mid-fight policy change reads "The GM allows ghost movement again" instead of "The fight is over" | As a player on a scratch scene with policy *Exploration only*: ghost on, GM starts a combat (cleared toast), GM picks *Always allowed* → the GM-allows toast; then a normal end-of-fight run still shows "The fight is over" |
| (console only) | `warnOnce` lines in the two hot hooks (S5) | Needs no live test (console-only output is fine at this table) |

Wave 7 items (one restart, batched with every module):
- `flags.pentaryn = { tier: "full", namespace: "movement", flagScope: "pentaryn-movement", cssPrefix: "pm-", generation: 14, afterSync: [...] }`.
  `flagScope` is only a declaration: movement writes no flags, so this needs no data migration.
  `afterSync` is the movement `after_sync` tuple in `scripts/foundry/ops/config.py`, verbatim, all
  three lines (the "First install…" line, "Players get a Ghost toggle in the token tools; the GM sets
  the policy in settings.", and `  game.pentaryn.movement.status()`). The same commit deletes that
  tuple from the `ModuleSpec`: `after_sync` has one source per module, and once `module.json` carries
  `afterSync` the tuple is never read. Never edit the tuple in the meantime.
- `styles: ["styles/movement.css"]` (move the file in the same batch).
- `compatibility.verified: "14.369"`.

## 6. Decision for Joe

**D-M1 — the dnd5e relationship (C03).** Movement really does depend on dnd5e: the `ignoreTokens`
flag only works under dnd5e's `Token5e`. But the dependence lives in comments and a plain property
name, so the scorer cannot see it. Two options:
- **Recommended:** keep the relationship and teach the scorer. Add `"ignoreTokens"` to `dnd5e.stringExact` in
  `scripts/foundry/blueprint/packages.json`, a data edit with no module change.
- **Alternative:** drop the dnd5e relationship in the Wave 7 batch. Nothing breaks at runtime, but
  the manifest stops saying what the ghost relies on.

**Decided 2026-10-11 (Joe, D4): keep the relationship.** Landed in wave 1 as a `packages.json` data edit,
no module change. It went into `dnd5e.codePatterns` (`\bignoreTokens\b`), not `stringExact`: the name is a
property key in code (movement-core.mjs:75), not a string literal. `conformance.py --module movement`: C03
passes (61.0 % → 63.4 %); test `test_r7_d4_c03_counts_dnd5e_ignore_tokens`.

## 7. Effort

| Step | Effort |
|---|---|
| S1 characterise + vendor | M (the glue tests are most of the work; about half a day) |
| S2 patches + rows | S |
| S3 settings / core / i18n | S–M |
| S4 split | S |
| S5 logging | S |
| S6 API + publish | S |
| S7 docs | S |
| F-M1 (standalone) | M |
| F-M2 (standalone, -42) | S |
| **Total** | **M — about 1.5 agent-days, plus one live-test pass (D-M2, D-M3, D-M4, F-M1)** |

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | **93.6 % (44/47)** on `migrate/wave-2` at `b1046cad` (`conformance.py --module movement`, 2026-10-11, code phase). Still failing: C07, C32, C37 (below). With the three adjustments rows applied to a scratch copy of `foundry/adjustments.yml`: **95.7 % (45/47)**; after the Wave 7 batch: 100 % expected |
| Date | 2026-10-11 (workflow 2, code phase only; nothing live) |
| Commits (Joe-approved) | characterisation: `7615de6` (kit), `3a5192d` (checkpoint) · wave-2 kit: `1241a405`, `494b713d` (J10) · refactor: `3ac7efba` (vendor patch), `5482317b` S2, `c4b77032` S3, `561d0749` D-M3 [declared], `34a4ca5a` S4, `d65ddd62` S5 [declared, console only], `25c81ef9` S6 / D-M2 [declared], `b3d69dbb` -23 status({sceneId}) [declared], `1b5ec2a5` S7 · standalone: `a9f32f7e` F-M1 (-19), `0b1910cc` F-M2 / D-M4 (-42) [declared], `b1046cad` (test literal the i18n gate misread), `8f2ede50` (-19 follow-up: `refresh()` reads policy, wish and combats once for its three rules; 3 combat scans per refresh → 1) · other: `49b8554` (README, aoe-movement-portals-37), `4f7b5a8` (comment line refs), `4a5c13c` (D4 scorer) |
| Tests | `node test/run.mjs`: 166 node:test cases + 89 legacy checks, all green. Frozen checkpoint files touched only by the two planned [declared] commits: `golden/settings-register.json` (D-M3, two rows' name/hint) and `glue.test.mjs`'s KNOWN -42 row (F-M2). `vendor.py check movement` green; static gates parse / imports / i18n (33/33 keys direct) green |
| Known red range | `check_context.py` (the Module APIs index in `context/foundry/README.md`) is red from walls `d06f77ab`, the first describe golden on `migrate/wave-2` (lookup `abb4ae75` adds its row next), not from movement's `25c81ef9`, which only adds the movement row to a range already red. Checked with `ops.index.is_current` on archives of `d06f77ab^` (current), `d06f77ab`, `abb4ae75`, `25c81ef9^` and `25c81ef9` (all stale). The expected movement row matches `index.render()`. One `make foundry-module-index` by the integrator clears the lookup, walls, movement, attunement and journal rows together |
| Declared changes handed to the live-test workflow | D-M2 (API frozen, sync publish, kit members, ready hooks, `uninstall`), D-M3 (hidden setting labels), D-M4 / F-M2 (ghost-back toast text), `status({ sceneId })` + appended keys, F-M1 (cache; README verify 1–3), S5 warnOnce (console only, no live test) |
| `module.json` edits appended to `wave7-restart-batch.md` | no — handed to the integrator (shared file); the row there already lists them (`flags.pentaryn` full · `movement` · `pm-` · `flagScope: pentaryn-movement`, `styles/movement.css` + file move, `compatibility.verified: "14.369"`) |
| Adjustments rows appended to `adjustments-batch.md` | no — handed to the integrator with exact YAML; the three Batch A rows there already name them; `files` is `ghost.mjs` (S4 landed) |
| Still failing, and why | C07 (module.json flags) and C37 (needs `cssPrefix: "pm-"`) → Wave 7 batch; C32 → the three adjustments rows (integrator). Warn C06w → Wave 7 (`styles/`). Manual C31 (`setPolicy` keeps `throw new Error("GM only")`, legacy, documented), C33 (private members covered by the three rows), C42 (fixtures synthetic: reviewed) |
| Deviations from the steps above | S2: the layer sort goes through the kit's `defineAccessor`, not `wrapMethod` — the frozen glue fixture's layer has no `sortChildren` to wrap (and `canvasReady`'s test sets it `undefined`), and `wrapMethod` refuses a missing method. It is still recorded with the marker and its adjustments row, and a new canvas draw drops the dead container's record, so `patches()` stays at three instead of growing per draw. S1's `_internals` seam never existed (the checkpoint drives the glue through hooks only), so S4 had no shim to repoint. F-M1: only the per-token paths (drag, keyboard, `refreshToken`, the sort) read the cache; `status`, the toolbar and `refresh()` stay live, because the frozen glue tests change `game.combats` without a hook before calling them (they run once per refresh, so the cost is one scan). `status()`'s settings map is `{ key: scope }` from the `SETTINGS` table, not the finding's prose labels |
