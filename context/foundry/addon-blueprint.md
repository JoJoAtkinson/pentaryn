---
title: Addon blueprint — building and migrating Pentaryn modules
status: active
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, playbook]
---

# Addon blueprint

**Read this when:** building a new addon, or bringing an old one up to standard (the fix phase of
the 2026-10 code audit). **Not this file:** why the blueprint is shaped this way →
[`../plans/addon-blueprint-2026-10.md`](../plans/addon-blueprint-2026-10.md) · the kit's own file
list → [`../../foundry/lib/README.md`](../../foundry/lib/README.md) · the template's placeholders →
[`../../foundry/blueprint/README.md`](../../foundry/blueprint/README.md) · operating Foundry →
[`README.md`](README.md).

Written for an agent working step by step. Every step names the command that proves it.

## 1. Where does it go?

Decide this before writing anything. A new module is the last answer, not the first.

If the target module is in `scripts/foundry/blueprint/wait.json`, **stop**: another workflow owns it
right now, and the scorer prints it as WAIT. The rows marked WAIT below were on that list on
2026-10-10; the file, not this table, is the live answer.

| You want… | It goes in | How |
|---|---|---|
| New behaviour on a combatant's turn, an Argon turn-flow tweak | `pentaryn-combat` (turnflow) | **WAIT** while the melee workflow is live |
| A dnd5e damage/heal rider, a feat or spell rule | `pentaryn-riders` `RULES` | **WAIT**; then a row + fixture |
| An attack-card once-per-turn rider | `pentaryn-combat` `TURN_RIDERS` | **WAIT** |
| Area templates, region effects, AoE resolution | `pentaryn-aoe` | **WAIT** |
| Loot, containers, corpses, anything Item Piles | `pentaryn-dropbin` (its Item Piles adapter) | |
| A scene-build helper (markers, gather/replace) | `pentaryn-prompts`; walls → `pentaryn-walls` | |
| Token light, vision, carried light, chains | `pentaryn-senses` (`creatures` only for player-owned creature lights) | **WAIT** (both) |
| Region teleport, party moves | `pentaryn-portals` | **WAIT** |
| Knowledge, ties, attributes, study | `pentaryn-ties` | |
| An actor-state concept with its own settings and API | **a new module** | `new_module.py` (§3) |
| A helper two modules both need | `foundry/lib/` | add it to the kit, then vendor (§4.4) |

## 2. Tiers and layout

| Tier | When | Gets |
|---|---|---|
| `small` | no persistent state, no API writes, ≲ 300 lines (names, pings, cursors) | entry, core, feature, README, CHANGELOG, `test/run.mjs`, `core.test`, `glue.test`; kit `errors, log, hooks, publish` (+ `resolve`, a dependency) |
| `full` | everything else | + `settings.mjs`, `api-manifest.mjs`, `api.mjs`, `lang/`, `hooks/api/i18n` tests; kit + `resolve, settings, api, queries, flags` |

```
pentaryn-<short>/
  module.json            flags.pentaryn: tier, namespace, flagScope (= id), cssPrefix, generation, afterSync
  <short>.mjs            ENTRY = esmodules[0]: wiring only, features in load order     ≲150 lines
  <short>-core.mjs       PURE: MODULE, SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS, rules   ≲600
  api-manifest.mjs       [full] pure data: API rows, flags contract
  api.mjs                [full] implementations, inspect(), selftest(), buildApiFor(ctx)   ≲300
  settings.mjs           SETTINGS / KEYBINDINGS tables; the only game.settings caller outside lib/
  <feature>.mjs          one feature: export install(reg, ctx) / uninstall()             ≲500
  <adapter>.mjs          Foundry/third-party → plain data (the only files touching ui.ARGON, game.itempiles…)
  <widget>.mjs           DOM / ApplicationV2 only; decisions come from core
  lib/                   VENDORED kit + kit.lock.json — never edited here
  lang/en.json           nested under PENTARYN_<SHORT>
  styles/<short>.css     every selector under .pentaryn-<short> or .<cssPrefix>          ≲400
  test/                  run.mjs, *.test.mjs, golden/, fixtures/, kit/ (vendored), graph-allow.json
  README.md, CHANGELOG.md
```

**Small + opt-in kit.** A small module may opt into kit files with `--kit` (generator) or
`vendor.py sync <short> --kit <file>`. A small module that writes through its API, or has settings,
**keeps the small tier**: it gains `api-manifest.mjs` (with `--kit api`) and/or `settings.mjs`
(with `--kit settings`) as needed, and adds `test/i18n.test.mjs` when it has settings (C40 requires
it then; plan decision D3). The `[full]` rules (C27–C29) stay n/a for it. Today's examples: names =
small + `api`; pings = small + `settings,api,patch,election`; cursors = small + `settings`.

Size caps are warnings (C10), never failures. Past one: split by concern (`core/<topic>.mjs` behind
the core barrel; a widget per file) — never "part 2".

**Import direction** (C16; exceptions only via `test/graph-allow.json`, each one a debt):

| From | May import |
|---|---|
| entry | anything but test/ |
| feature | ui, adapter, core, settings, api-manifest, lib |
| ui | adapter, core, settings, lib |
| adapter | core, lib |
| api | core, adapter, settings, api-manifest, lib — **never a feature** (use `ctx.expose`) |
| settings | core, lib |
| core / api-manifest | core only |
| lib | lib only |

Nothing imports the entry or `test/`. Named imports between module files; `import * as` only for
the entry's feature list and `core/` barrels (the imports gate cannot see members of a namespace import).

**Names.** Module id `pentaryn-<short>`, short `^[a-z][a-z0-9]{1,15}$`; `MODULE` defined once in core
(never `MOD`, `MODULE_ID`, `SCOPE`); flag scope = module id; i18n root `PENTARYN_<SHORT>`; CSS
prefix declared in `flags.pentaryn.cssPrefix` and unique (`pp-` is prompts'). Reserved shorts:
`import moduleId contract _internals describe inspect namespaces published rules chain lib test core api settings`.

## 3. A new module, step by step

1. **Decide** with §1. Pick `small` unless it stores state or writes through its API.
2. **Generate** into scratch first, check, then install:
   ```
   ./.venv/bin/python scripts/foundry/blueprint/new_module.py <short> --title "Pentaryn <Title>" \
       --description "<what the player sees; what it exposes>" --tier full --out /tmp/x --check
   ```
   Green means: parse, imports, i18n and node-test gates pass, the kit is identical, conformance is
   100 %. Then the real one: `--out foundry/module --install --docs` (writes
   `context/foundry/<short>.md` and `context/plans/<short>-<yyyy-mm>.md`, never overwriting).
3. **Write the pure part first** in `<short>-core.mjs`, with a fixture row per rule in
   `test/core.test.mjs`. Replace the example rule (`noteText`) — do not leave it.
4. **Features**: copy `example-feature.mjs`, add it to `FEATURES` in the entry, register hooks only
   through `reg.on(name, fn, { label })`. Delete the example feature when you have a real one —
   it is wired into more than its own file, so work through the checklist below in the same pass.

   **Example code to replace** (the GM-note example; `grep -rn "noteText\|lastSeen\|noteChanged\|recent\|toggleEnabled\|Aldric\|Mira" .`
   from the module folder finds every spot):

   | File | What belongs to the example |
   |---|---|
   | `<short>-core.mjs` | `noteText`, `NOTE_MAX`, `hpOf` (dnd5e), `HOOKS.noteChanged` |
   | `example-feature.mjs` | the whole file: `lastSeen`, the `updateActor: note` / `deleteActor: prune` handlers, the `recent` contribution, `ctx.expose({ lastSeen })` |
   | `<short>.mjs` (entry) | `import * as exampleFeature` and its `FEATURES` entry |
   | `settings.mjs` | the `enabled` row's doc text, the `toggleEnabled` keybinding row (full) |
   | `api-manifest.mjs` | the `inspect` row's returns/doc (`note`, `lastSeen`, `hp`), the `note` write row, `flags.writes` |
   | `api.mjs` | `inspect` body (`ctx.exposed.lastSeen`, `note`, `hp`), the `note` impl, `selftest`'s `ctx.setting("enabled")` check |
   | `lang/en.json` | `Setting.enabled.*`, `Keybind.toggleEnabled.*` |
   | `styles/<short>.css` | `.<px>note` |
   | `README.md` | What the player sees, Settings, API, Data written, Events, Two sessions, Files |
   | `test/core.test.mjs` | the `noteText` table, the `hpOf` cases, the `typeof core.noteText` export check |
   | `test/glue.test.mjs` | `noteChanged` cases, `"updateActor: note"` / `"deleteActor: prune"` labels, the `enabled` gate case, the keybinding case, the hot-patch case's labels and `"patched"` note |
   | `test/hooks.test.mjs` | the expected `reg.ids()` labels |
   | `test/api.test.mjs` | `recent`, `note`, the `inspect` cases (Aldric/Mira refs, `hp: { value: 9, max: 20 }`) |
   | `test/fixtures/actors.mjs` | `IDS`, the Aldric/Mira actors and their hp, the two scenes |

   Then regenerate the goldens **one file at a time** — `GOLDEN_UPDATE=1 node --test test/glue.test.mjs`
   (small: hooks pin), `… test/hooks.test.mjs`, `… test/api.test.mjs` (describe/surface/queries) —
   read each `git diff -- test/golden` and keep it only if every change is one you made. Never
   `GOLDEN_UPDATE=1 node test/run.mjs` on the whole suite.
5. **Settings**: a `SETTINGS` row with literal `name`/`hint` keys + the keys in `lang/en.json`.
6. **API**: a row in `api-manifest.mjs` + an impl in `api.mjs` (or `return { rows, impl }` from a
   feature's `install`). Reads throw coded errors; writes return `ok()/fail()` and accept `dryRun`.
7. **Patches**: `wrapMethod` + an adjustments row (§5.6).
8. **Goldens**: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, read the diff, keep it.
9. **Docs**: README sections in the fixed order (§7), CHANGELOG line, routing rows.
10. **Wire it** (the generator prints these, with the real `after_sync` tuple taken from
    `module.json` `flags.pentaryn.afterSync`; they are manual until §10 lands): ModuleSpec in
    `scripts/foundry/ops/config.py`, Makefile `-check`/`-sync` lines, routing rows. Then
    `conformance.py --module <short>` scores the repo-wiring rules too (C39 ModuleSpec, C46 route).
11. **Sync**: `make foundry-<short>-sync`, **restart** Foundry (first install), enable, reload, then
    `game.pentaryn.<ns>.describe()` and (full tier) `game.pentaryn.<ns>.selftest()`.

### 3.1 Generator and vendoring flags

`scripts/foundry/blueprint/new_module.py <short> --title "Pentaryn <Title>"` plus:

| Flag | Does |
|---|---|
| `--tier small\|full` | template files and kit tier (default `full`) |
| `--kit a,b` | extra kit files on top of the tier, closed over their deps (e.g. `--kit election,perf`) |
| `--namespace <ns>` | `game.pentaryn.<ns>` when it should differ from the short name (refused if taken) |
| `--css-prefix <px->` | the CSS prefix (default: the first free `p<short…>-`; refused if taken) |
| `--no-dnd5e` | no dnd5e system relationship, no dnd5e example code |
| `--description "…"` | `module.json` description |
| `--out DIR` | parent folder (default `foundry/module`, which also needs `--install`) |
| `--install` | allow writing under `foundry/module/` (the folder sync deploys) |
| `--docs` | write `context/foundry/<short>.md` and `context/plans/<short>-<yyyy-mm>.md`, never overwriting |
| `--check` | after the suite: ops gates, `vendor.check`, conformance — exit 1 on any failure. Conformance runs as **not installed** even with `--install`: the repo-wiring rules (C39 ModuleSpec, C46 route) are step 10 follow-ups, so they read n/a here; run `conformance.py --module <short>` after step 10 to score them |
| `--force` | re-render the template files over an existing folder. Keeps `lib/kit.lock.json` (so earlier `--kit` extras stay), re-vendors from it, **never rewrites goldens** (the suite runs without `GOLDEN_UPDATE` and fails on a real difference) |
| `--no-run` | skip the generated suite |

Vendoring one module by hand (`scripts/foundry/blueprint/vendor.py`):

```
vendor.py sync <short> --tier full          # adopt the kit (writes lib/, test/kit/, lib/kit.lock.json)
vendor.py sync <short> --kit election       # add one kit file (+ deps) to what the lock already lists
vendor.py sync <short>                      # re-vendor exactly what the lock lists
vendor.py check <short>                     # identity gate: exit 1 on any drift
```

## 4. The kit

Canonical in `foundry/lib/`, byte-identical copies in each module's `lib/`. Full export list:
[`foundry/lib/README.md`](../../foundry/lib/README.md).

### 4.1 Lifecycle (new modules)

`init` → `registerSettings()`, `registerQueries(MANIFEST, …)` · `setup` → each feature's
`install(reg, ctx)` · `ready` → `buildApiFor(ctx)` **first** (a drift throw stops there with one
clear error line), then `publishNamespace(NS, api, { moduleId: MODULE })`, then GM-only startup
behind `isActiveGM()` from `lib/election.mjs` — election is in neither tier, so vendor it first:
`vendor.py sync <short> --kit election` (or generate with `--kit election`).

The phases are named functions (`onInit`, `onSetup`, `onReady`). On a normal load the entry hands
them to `Hooks.once`; when the world is already ready (a hot patch) it runs them at once, in order.
Hot patch from the console: `game.pentaryn.<ns>.uninstall()`, then
`await import("/modules/pentaryn-<short>/<short>.mjs?v=2")`. **A hot patch re-runs the wiring
only.** The `?v=2` changes the entry's URL and nothing else: its static imports (features,
`api.mjs`, `settings.mjs`, core, `lib/`) resolve to the module instances already loaded, so the
re-run registers the **same** handlers again and republishes the **same**
code as a new API object on `module.api` and `game.pentaryn.<ns>`. Use it to recover after an
`uninstall()` or a failed publish. Any edit to a feature, core, api or settings file needs a
**reload**; so does a new setting or keybinding row (rows already registered are skipped, and
Foundry refuses keybindings after `setup`). The template's glue test proves re-registration and
republish, not that new code loads.

`ctx` carries `log`, `reg`, `setting`, `emit`, `api`, `contributions`, `exposed`, `expose()`,
`uninstall`. A feature exposes state to `api.mjs` with `ctx.expose({ lastSeen: id => … })`.
Feature-to-feature state also goes through `ctx` — one feature `ctx.expose()`s it, another reads
`ctx.exposed.<name>` at call time — never through an import between two feature files (C16).

### 4.2 Publishing

`game.modules.get(id).api` is canonical; `game.pentaryn.<ns>` is the alias. Consumers wait with
`Hooks.once("pentaryn-<short>.ready", api => …)` or call `apiOf(id)` after checking the module is
active. Never read another module's settings or flags directly. A late or role-gated publish
records it: `publishNamespace(ns, api, { moduleId, when: "ready:gm:wasm" })` (C50).

### 4.3 Idiom → kit (what must stay byte-identical is in bold)

| Today | Replace with | Keep byte-identical |
|---|---|---|
| the 19 `Object.isExtensible` guard blocks | `publishNamespace(ns, api, {moduleId, when})` | **the `pentaryn.ready` timing of walls (GM, after wasm) and prompts (after async ready)** |
| aoe `guard()` (swallows async) | `reg.guardSwallowAsync` | **its return-undefined behaviour** |
| `MOD` / `MODULE_ID` / `SCOPE` | `MODULE` from core | **the id string** |
| inline `game.settings.register(...)` | a `SETTINGS` row with literal `name`/`hint` | **every existing `PENTARYN_X.settings.*` / `Setting.*` key** |
| `` console.warn(`${MODULE} \| …`, err) `` | `log.warn("…", err)` | **the message text** (the glue test pins it) |
| a hand prototype wrap with a marker | `wrapMethod(MODULE, {target, name, marker, adjustments}, make)` | **the marker literal, in the module's own file** |
| `libWrapper.register(...)` | `wrapMethod(..., {via: libWrapperRoute()})` | **fall-through to a direct wrap on failure** |
| prompts `guarded` + hand `CONFIG.queries` | manifest rows `query: true` + `wire` | **`cropsAs: "base64"` defaults; payload shape (`golden/queries.json`)** |
| `Hooks.callAll("pentarynCombat.x")` | a `HOOKS.x` row with `legacyName` + `until`, `emit("x")` | **both names fire until `until`** |
| `game.user.isGM` / `activeGM?.isSelf` sites | `isAnyGM()` / `isActiveGM()` / `isActiveGMOrLoneGM()` | **the predicate each site uses today** |
| world-setting log stores | `serialStore(MODULE, key)` (any GM writes, the default) | **any-GM write semantics** |
| `foo.unsetFlag` / `"-=key"` on foreign scopes | `{[flagPath(scope, key)]: _del}` | — |
| `t()` / `f()` / `T()` / `L()` prefix wrappers | full-key literals through `_loc("PENTARYN_X.a.b", data)` | **the rendered strings** |
| a getter patched with `Object.defineProperty` / libWrapper (`Token#isVisible`) | `wrapMethod(MODULE, {…, kind: "getter"}, make)` (kit 1.0.1) | **the marker literal; libWrapper first, then direct** |
| a hand query handler that accepts a player sender | `guarded(fn, { sender: "any" })` (handler gets `(data, ctx)`), or a manifest row `relay: true` → `relayed` (active GM only) | **the receiver check each relay uses today** |
| a query whose name differs from its API path (prompts `replace` → `replaceMany`) | manifest row `queryName: "replace"` | **the query name the fork sends** |
| a counter + log pair written together | `serialStore(MODULE, ["counter", "log"])` (one queue, keys in order) | **write order** |
| a hook wrapper that logs at warn (senses) | `reg.on(name, fn, { guard: "warn", label })` | **the console level and label text** |

### 4.4 Adding or changing a kit file

1. Edit `foundry/lib/<file>.mjs`; add a test in `foundry/lib/test/<file>.test.mjs`.
2. `node foundry/lib/test/run.mjs` — all green.
3. New file: add it to `foundry/lib/kit.json` with `deps` (and `packages` if its bytes name a
   third-party package). Behaviour change: bump the version in `kit.json`, `KIT_VERSION` and every
   file header together.
4. `vendor.py sync --all` then `vendor.py check --all`, and each touched module's
   `node test/run.mjs`. `--all` means every module that already has a `lib/kit.lock.json`; an
   unmigrated module is listed as skipped and never written. A kit bump never touches
   `module.json` and needs only a reload.

To give one module a kit file it does not have yet: `vendor.py sync <short> --kit <file>` (the lock
keeps what it had and gains the file and its deps), then `vendor.py check <short>`.

## 5. Rules

### 5.1 API contract

- New methods: `fn(ref, opts = {})` or `fn(opts = {})`; at most one positional ref. A row whose
  first param is named `ref` is resolved by `resolveRef` on every call (Actor, Token, UUID, 16-char
  id, exact then case-insensitive name; **never a substring**). Scene scope comes only from that
  call's `opts.sceneId` (`"current"` = the viewing client's canvas), and `opts.base: true` picks
  the world actor over a token's synthetic one. `inspect(ref, { as: userRef })` answers with what
  that user may see.
- A **write** row (`writes: true`) whose ref does not resolve returns `fail("NOT_FOUND" |
  "AMBIGUOUS" | "BAD_ARGS", reason)` instead of throwing; `await` a write either way.
- Legacy methods keep their signature with `legacy: true` (miss → null, no throw).
- `describe()` is static JSON; `inspect(ref, opts)` is read-only plain JSON, depth ≤ 4;
  `selftest()` → `{ ok, checks }`. Every namespace has `version`, `contract`, `settings()`,
  `trace()`, `uninstall()`.
- Reserved member names: `describe inspect settings trace version contract uninstall selftest`.
  `buildApi` throws on a clash (ties' `describe` card becomes `describeCard`, a declared change).
- Reads throw coded (`NOT_FOUND`, `AMBIGUOUS`, `BAD_ARGS`); writes return `ok({…})` /
  `fail(code, reason)`; bulk writes take `opts.dryRun`. Bump `CONTRACT`'s major on a
  published-shape change and shim the old path with `foundry.utils.logCompatibilityWarning`.
- **Audit lines.** Every cross-user write (a GM acting on a player's document, a relay, a query
  that writes) logs `log.info("<event>", { uuid, ids, by: game.user.id })` — console only, which
  is fine at this table.

### 5.1a Manifest row reference

The manifest (`api-manifest.mjs`) is pure data. **Manifest-level fields:**

| Field | Meaning |
|---|---|
| `module`, `namespace`, `version`, `contract` | from core (`MODULE`, `NS`, `VERSION`, `CONTRACT`) |
| `flagScope` | the module id (§5.8) |
| `rows` | one row per published method (below) |
| `flags: { writes, reads }` | every flag path the module writes on others' documents (`flags.<id>.<key>`), and every foreign flag it reads (`flags.<other-id>.<key>`) — §5.8 |
| `unlisted` | implementation keys published **without** a row (constants such as ties' `STANCES`). Kit 1.0.1 publishes a frozen copy; the module's own table is never frozen |

**Row fields** (`foundry/lib/api.mjs` typedef):

| Field | Type | Meaning |
|---|---|---|
| `path` | string | dotted path under the namespace (`"store.list"`); no reserved name at any depth (§5.1) |
| `params` | `{name, kind?, type?, optional?, resolve?, doc?}[]` | a first param named `ref` is resolved per call (`kind`: `actor` default, `token`, `user`, …; `resolve: false` opts out) |
| `returns` | string | the shape, in words or TS-ish (`"{ ok, checks }"`) |
| `gm` | boolean | GM-only |
| `writes` | boolean | changes world data → returns `ok()/fail()`, accepts `dryRun` when bulk; the fork routes it to `pentaryn-write` (D14) |
| `query` | boolean | also registered as `CONFIG.queries["<id>.<queryName ?? path>"]` |
| `queryName` | string | the query name when it differs from `path` (kit 1.0.1, K8) |
| `relay` | boolean | register through `relayed` (any sender, active-GM receiver) instead of `guarded` (kit 1.0.1, K4) |
| `wire` | `data => data` | fills query-payload defaults before the call (prompts' `cropsAs: "base64"`) |
| `sideEffects` | string[] | flag paths / documents written |
| `nullWhen` | string | when a legacy read returns null instead of throwing |
| `throws` | string[] | coded errors a read throws (`NOT_FOUND`, `AMBIGUOUS`, `BAD_ARGS`, …) |
| `legacy` | boolean | keep the old signature; a ref miss → null |
| `args` | `data => [...]` | legacy rows only: query payload → positional args |
| `since` | string | the version that added it |
| `doc` | string | one sentence an LLM reads in `describe()` |

**`describe()` keys** (both tiers; a small module has the same keys with empty lists):
`module, namespace, version, contract, flagScope, kit, published, methods, queries, settings,
events, hooks, patches, flags {writes, reads}, errors`. `methods[]` carries `path, params, returns,
gm, writes, query, sideEffects, doc` plus `queryName, relay, nullWhen, throws, legacy, since` when
set. The goldens normalise away `version`, `kit`, `published` and patch routes.

**`inspect(ref, { as })`** — read-only, plain JSON, depth ≤ 4. With no `as` it answers as the
caller. `as` is a user ref: a GM sees everything; for a player, GM-only state (the template's
`note`, session state such as `lastSeen`) is omitted, and actor stats need `OBSERVER` on that actor.
Each module's README "API" section lists which fields are GM-only.

**`publishNamespace(ns, api, { moduleId, when, alias, realiasTick })`**:

| Option | Default | Meaning |
|---|---|---|
| `moduleId` | — | sets `game.modules.get(id).api` and fires `<id>.ready` + `pentaryn.ready` |
| `when` | `"ready"` | recorded, not enforced: `"ready:gm"` for a role-gated publish in the sync ready body, `"ready:gm:wasm"` for a late one (C50) |
| `alias` | `false` | publish a second name only — no `module.api`, no ready hooks |
| `realiasTick` | `true` | re-alias one tick later if the importer displaced the root (goes in Stage 5) |

Alias example — senses publishes its chain helpers under their own name as well:

```js
publishNamespace("senses", api, { moduleId: MODULE });
publishNamespace("chain", api.chain, { moduleId: MODULE, alias: true });   // game.pentaryn.chain
```

### 5.2 Lifecycle and hooks

Module-scope `Hooks.on/once` only in the entry (C17). **Migrating** modules call `install(reg, ctx)`
synchronously in the entry body — moving registration to `setup` reorders listeners against
unmigrated modules (veto order on `dnd5e.preUseActivity`, Argon render order) and is a declared
change that needs the order fixture (`foundry/lib/test/fixtures/hook-order.mjs`) first. Argon:
wait for `canvasReady`/`argonInit`, never a timer. v14/dnd5e 6 hygiene: `renderChatMessageHTML`,
`HTMLElement` in AppV2 render hooks, `_del` not `-=`, `message.system.*`, `movement.speeds.*`.

**Emitting events.** A module's own events are rows in the `HOOKS` table in core, fired with
`ctx.emit(key, ...args)` (the kit's `emitter`; an unknown key throws `BAD_ARGS`), not a literal
`Hooks.call/callAll` — C19 fails any emitted name that is not `pentaryn-<short>.*` or a row's `legacyName`.

- Row shape: `{ name, pre, args, legacyName?, until? }`, e.g.
  `turnStart: { name: "pentaryn-<short>.turnStart", pre: false, args: "(actor, turn)" }`.
- Name: `pentaryn-<short>.<camelEvent>` — the module id, a dot, a camelCase event.
- Vetoable: `pre: true` and a `pre<Event>` name (`pentaryn-<short>.preTurnStart`); `emit` fires it
  with `Hooks.call` and returns `false` when a listener vetoes, so the caller writes
  `if (ctx.emit("preTurnStart", actor) === false) return;`. A plain event fires with `Hooks.callAll`
  and `emit` returns `true`.
- Renaming an event someone listens to: keep the old name in `legacyName` with
  `until: "<module id> <version>"` (C52). `emit` fires both names until that version, then warns once.
- Every event is listed in the README "Events" table; re-pin `describe.json`
  (`GOLDEN_UPDATE=1 node --test test/api.test.mjs`) — `describe().events` carries the table.

### 5.3 Settings

`SETTINGS` rows only in `settings.mjs`; literal `name`/`hint` keys (C51); `requiresReload: true` on
new rows **unless every read is live through `setting()`** (as the template's `enabled` is — it is
read on each call, so a change applies without a reload); `onChange` cheap and idempotent; stores are `store: true` rows through `serialStore`; new
code never stores bulk data in world settings; per-user choices are user flags.

### 5.4 Logging and errors

One `log` per module; debug via `CONFIG.debug["pentaryn-<short>"] = true`; no empty `catch` (use
`log.swallow` or `log.debug`); toasts only via `log.notify`; writers never fire-and-forget; prune
session maps on `deleteCombat`/`deleteToken`/`canvasTearDown`/`deleteScene`;
`foundry.utils.escapeHTML` for every interpolation into `innerHTML` in new code. Console-only data
is fine at this table; on-screen leaks are not.

### 5.5 Performance

Hot hooks (`refreshToken`, `drawToken`, `sightRefresh`, `canvasPan`, `hoverToken`,
`updateWorldTime`, Argon action-panel render, `pointermove`) read from a cache or `memo`, never
iterate `game.actors`/`game.scenes`/`canvas.tokens.placeables`, and carry a `// hot: <cache>`
comment (C49). World-wide reactions run on one client (`isActiveGM()`, `claimDocument` for two GM
sessions), with batched writes and `coalesce`/`foundry.utils.debounce` for rebuilds.

### 5.6 Patches and `foundry/adjustments.yml`

A row for every wrap, private-member read, third-party flag/API use, core socket event, and CSS
aimed at another package's DOM. `id` = `<short>-…` for a row that `wrapMethod({adjustments})`
names (a patch). A row that is **not** a patch — a workaround, a private read, a third-party
flag — keeps the registry's package prefix (`core-…`, `dnd5e-…`, `itempiles-…`). That second half
is **pending Joe's decision D2** ([migration README §6](../plans/addon-blueprint-2026-10/README.md));
until R1 lands, C32 fails a `<short>-…` row with no patch, so use the package prefix for non-patch
rows now. Rows wait in [`adjustments-batch.md`](../plans/addon-blueprint-2026-10/adjustments-batch.md); `files` = the call-site file (never `lib/`);
`markers` = literals present in that file; `check: make foundry-<short>-check` (walls:
`make foundry-walls-test`). `wrapMethod({adjustments: "<row id>"})` mirrors the id into
`describe().patches`; conformance C32 cross-checks rows and patches. Rows are appended in one batch
while the file is idle. Never edit Argon's files; CSS only for DOM the module creates.

### 5.7 i18n and CSS

Full-key literals through `_loc` (the i18n gate proves every literal); nested `lang/en.json`;
migrating modules keep their label shape (`Setting.k.Name`, `settings.k.name`, ties' flat keys).
Selectors under `.pentaryn-<short>` or `.<cssPrefix>`; no `!important` in new rules (removing an
existing one is declared); core CSS variables and `.theme-dark/.theme-light`.

### 5.8 Flags

- **Scope = the module id** (`flags.pentaryn-<short>.*`), the value of `flagScope` in the manifest
  and in `module.json`. A module whose scope is something else migrates its data in the Wave 7
  restart batch (walls only; C07 says "DATA migration" vs "manifest-only").
- Every flag the module **writes** is listed in `MANIFEST.flags.writes` (and the row's
  `sideEffects`) and in the README "Data written" table.
- Every **foreign** flag it reads is listed in `MANIFEST.flags.reads` **and** in the README "Flags
  other modules read" table of the module that owns it. Prefer the owner's API (`apiOf(id)`,
  `inspect`) over the flag.
- Read with `readFlag(doc, scope, key)` (kit `flags.mjs`): it reads data, so an inactive scope does
  not throw the way `getFlag` does. Delete with `doc.update({ [flagPath(scope, key)]: _del })` —
  never `unsetFlag` on a foreign scope, never `-=key`.
- A foreign flag is a contract: **a test on both sides** — the owner pins the shape it writes
  (`api.test` / `glue.test`), the reader pins what it reads from a fixture with that shape. A change
  on either side is a declared change (§9).

## 6. Tests

`test/run.mjs` has a fixed body: `node --test "test/**/*.test.mjs"`, one process per file, plus a
`LEGACY` list for self-running suites not yet converted. The test kit is vendored into `test/kit/`.

| File | Tier | Pins |
|---|---|---|
| `core.test.mjs` | both | core imported bare first (purity); a fixture per rule; `VERSION === module.json` |
| `glue.test.mjs` | both | `installFoundry()`, entry import, `fire(init/setup/ready)`, effects in `F.calls`, console text; small: `golden/hooks.json` |
| `hooks.test.mjs` | full | `golden/hooks.json`; labels; features export install/uninstall; `uninstall()` leaves no hook |
| `api.test.mjs` | full | rows ↔ impl; `golden/describe.json`, `surface.json`, `queries.json`; inspect depth ≤ 4; NOT_GM; refs |
| `i18n.test.mjs` | full / any settings | literal labels exist; template-built keys; no prefix wrapper |
| `contract.test.mjs` | with a typed fork tool | drift between `describe()` and the fork schema |

The stub imports Foundry's own `common/` from the installed app; the glue test fails if it fell
back to shims, unless `PENTARYN_TEST_SHIMS=1` (set `FOUNDRY_APP_ROOT` if the app moved). It prints
the Foundry build so a Saturday `common/` change is visible.

The stub's `Hooks` behaves like Foundry's: a listener that throws is caught, warned as
`Foundry VTT | Error thrown in hooked function '<fn>' for hook '<hook>'`, logged, and the next
listener still runs (`F.hookErrors` keeps what was caught). So a glue test that proves "our guard
logs with the module prefix" must make the module's **own** handler throw, not a downstream
listener. `F.fire("ready")` sets `game.ready = true` first, as Foundry does.

**One test, one golden:** from the module folder, `node --test test/api.test.mjs`;
`GOLDEN_UPDATE=1 node --test test/api.test.mjs` rewrites only that file's pins. Never run
`GOLDEN_UPDATE=1 node test/run.mjs` on a module mid-refactor. A missing golden fails.

Gates: `make foundry-<short>-check` (parse, imports, i18n, node-test) plus, until wired,
`vendor.py check <short>` and `conformance.py --module <short>`. Kit: `node foundry/lib/test/run.mjs`.
Scripts: `./.venv/bin/python -m pytest -q scripts/foundry/blueprint/tests`.

Live smoke after a sync: `describe().version === module.json` version, every described path is a
function, and (full tier) `inspect(knownActor)` depth ≤ 4 and `selftest().ok`.

`contract.test.mjs` recipe (a module a typed fork tool calls): `forkQueries(MODULE, "<path of the
tool's .ts in the fork>")` and `contractDrift(api.describe(), fork).missing` from `test/kit/harness.mjs`.
It reads `$FOUNDRY_MCP_FORK`; without it the test skips with a note. Never regex the fork in a
module's own test. The fork side: [`migrate-mcp-fork.md`](../plans/addon-blueprint-2026-10/migrate-mcp-fork.md).

## 7. Docs

README sections, in order (C44; any may be `n/a — <why>`): What the player sees · Settings ·
API — game.pentaryn.<ns> · Data written · Flags other modules read · Events · Patches and
adjustments · Two sessions / who writes · Extending · Pitfalls · Files · Tests · Sync. It opens
with a `**Read this when:**` line, has no hard-coded fixture counts and stays ≲ 250 lines.
`CHANGELOG.md` separate; no design docs in the module folder (they go to `context/plans/`).
Use-doc `context/foundry/<short>.md`: At the table · For the GM · Settings that matter · API quick
calls · Known gaps. One routing row per module in `context/foundry/README.md`.

## 8. Migrating an existing module

The **order** of modules, the stage each belongs to, and the per-module guides are in
[`../plans/addon-blueprint-2026-10/README.md`](../plans/addon-blueprint-2026-10/README.md) §3 — work
from there. This section is the procedure inside one module.

1. **Check the WAIT list.** The scorer prints it: a `WAIT` marker per module and a closing
   `WAIT — do not edit yet` line (a WAIT column in `--markdown`, a `wait` field in `--json`). The
   list lives in `scripts/foundry/blueprint/wait.json` — combat, riders, transform and aoe while the
   melee/usability workflow is live, plus any module another workflow is editing. Do not edit a WAIT
   module. When one leaves the list (whoever lifts it edits `wait.json`), **re-anchor**:
   `git diff <snapshot-sha>..HEAD -- foundry/module/<m>`, then re-run `conformance.py --module <m>`
   — snapshot line numbers are stale by definition.
2. **Score it live**: `./.venv/bin/python scripts/foundry/blueprint/conformance.py --module <m> --markdown`.
   Work from this, never from the baseline in `context/plans/` (that is history).
3. **Characterise first** (checkpoint before refactor):
   1. expose old behaviour without changing it (`export`, or a verbatim copy in
      `test/fixtures/legacy-<name>.mjs` as an oracle);
   2. build the input table from the finding's `behaviourTest` plus hostile inputs; mark
      known-wrong rows `// KNOWN:`;
   3. vendor now — `vendor.py sync <m> --tier full` (or `small`); `lib/` stays unused until
      step 5, the tests need `test/kit/`. `--tier` is recorded in `lib/kit.lock.json`, and the
      scorer reads it until `module.json` gains `flags.pentaryn.tier` in the Wave 7 batch — so a
      small module scores as small from here on. Convert `test/run.mjs` to the fixed body (old
      suites go in `LEGACY`), then pin per file against **unchanged** code:
      `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, one file at a time (never the whole suite);
   4. pin effects, not returns: `F.hooks`, `F.calls`, warn/error text, `surfaceOf`, publish under
      both load orders;
   5. **checkpoint**: the characterisation diff (`test/golden/*.json` + tests only) is reviewed and
      committed by the agent as its own commit (review happens at merge). Rollback is `git revert` of the module's commits, a last resort, then sync.
4. **Vendor check**: `vendor.py check <m>` (the sync happened in 3.3; add files later with
   `vendor.py sync <m> --kit <file>`).
5. **Entry wiring**: lifecycle as today; `install(reg, ctx)` called **synchronously** in the entry
   body; module-scope hooks move into features through `reg`.
6. **Settings rows**: one row per existing registration, literal keys exactly as today.
7. **api-manifest**: one row per existing published path; `legacy: true` where the shape stays odd.
8. **Re-run** the module suite: the refactor must not touch `test/golden/` or the characterisation
   tests — `git diff --stat -- test/golden test/*.test.mjs` is empty at review.
9. **Conformance** again; list what is still failing and why.
10. **Declared changes** (§9) go in the plan and to the live-test workflow; `module.json` edits wait
    for the Wave 7 restart batch — append them to
    [`wave7-restart-batch.md`](../plans/addon-blueprint-2026-10/wave7-restart-batch.md), and new
    adjustments rows to [`adjustments-batch.md`](../plans/addon-blueprint-2026-10/adjustments-batch.md).

## 9. Declared-change markers

A change that a player or GM could notice, or that changes a failure path, is **declared**:

- tag it `[declared]` in the finding, the commit message and the module's plan file, with one line
  on what changes and how to see it at the table;
- update its golden in a separate commit whose message names the declared change;
- hand it to the live-test workflow with the steps to observe old vs new. Not merged until that
  run reports it.

Known ones: ties `describe` → `describeCard`; combat events renamed with legacy double-fire;
hook registration moved to `setup`; `requiresReload` replacing hand-written prompts; removing
existing `!important`; the walls flag-scope data migration (aoe, senses, cursors, attunement,
dropbin, journal, ties: manifest-only); missing goldens now fail; `toPlain` on
query results.

## 10. Restart vs reload

| Changed | Needs |
|---|---|
| `module.json` (any field) | Foundry **restart** |
| `lang/*.json` | reload |
| `.mjs`, `.css`, `templates/*.hbs` | reload |
| `lib/` (a kit bump), `test/` | reload (`test/` never loads live) |
| a new module, first install | restart + enable in Manage Modules + reload |

## 11. Conformance checklist

`conformance.py` is the only implementation of these rules. Score = pass / (pass + fail) over the
fail-class rules; `[full]` rules are n/a for small modules (tier = `module.json`
`flags.pentaryn.tier`, else `lib/kit.lock.json` `tier`, else full); repo-wiring rules (C39's ModuleSpec part,
C46) are n/a for a module not under `foundry/module/` yet. It exits 1 when any fail-class rule
fails, so `conformance.py --module <short>` is a usable gate. A rule that crashes counts as a fail
(fail class) or goes to the manual list (warn/manual class). `warn+manual` rules list a hit under
both Warnings and Manual.

| Id | Class | Rule |
|---|---|---|
| C01 | fail | `module.json` id == folder name |
| C02 | warn | `compatibility.minimum == "14"` |
| C03 | fail | dnd5e in `relationships.systems` iff the sources touch dnd5e |
| C04 | fail | `languages` iff any i18n key literal or call |
| C05 | fail | every non-test, non-lib `.mjs` reachable from `esmodules` |
| C06 / C06w | fail / warn | `styles` paths exist / live under `styles/` |
| C07 | fail | `flags.pentaryn` has tier, namespace, flagScope == id, cssPrefix, generation (says DATA migration only when the code writes under the old scope) |
| C08 | fail | `socket: true` iff the module uses its `module.<id>` channel |
| C09 | fail | recommends carry reasons; every package named in code is in `relationships` |
| C10 | warn | size caps |
| C11 | fail | a pure core exists |
| C12 | fail | `MODULE` defined once; no `MOD`/`MODULE_ID`/`SCOPE` |
| C13 | fail | no `.md` other than README/CHANGELOG |
| C14 | fail | `lib/kit.lock.json` present, `vendor.py check` passes |
| C15 | fail | `import * as` only for features (from the entry) and core barrels |
| C16 | fail | import direction; nothing imports the entry or test/ |
| C17 | fail | module-scope `Hooks.on/once` only in the entry |
| C18 | fail | features export `install` and `uninstall` (n/a when the entry registers only lifecycle hooks; a `-core.mjs` namespace import is not a feature) |
| C19 | fail | emitted hooks — literal `Hooks.call/callAll` names **and** every `name:` in the `HOOKS` table — are `pentaryn-<short>.*` (old names go in `legacyName`) |
| C20 | fail | `test/golden/hooks.json` (full: `hooks.test`; small: `glue.test`) |
| C21 | fail | `game.settings.register/get` only in `settings.mjs` / lib |
| C22 | fail | `SETTINGS` exported when settings exist |
| C23 | fail | never reads another module's settings |
| C24 | fail | no empty catch |
| C25 | fail | console lines carry the `<module> \|` prefix |
| C26 | fail | no `setTimeout 0` around publish; no ≥ 100 ms readiness timers |
| C27 | fail [full] | `api-manifest.mjs` + `buildApi` |
| C28 | fail [full] | `golden/describe.json`, `golden/surface.json` |
| C29 | fail [full] | `inspect` when the module writes its own flags |
| C30 | fail | queries only through `guarded` / `relayed` / `registerQueries` |
| C31 | manual | writes return ok/fail; reads throw coded |
| C32 | fail | prototype patches only via `wrapMethod`/`defineAccessor`; rows ↔ patches |
| C33 | manual | private internals covered by rows |
| C34 | fail | `lang/en.json` nested under one `PENTARYN_<SHORT>` root |
| C35 | fail | no two-branch i18n wrapper; definite key coverage ≥ 90 % |
| C36 | warn+manual | hard-coded UI English |
| C37 / C37w | fail / warn | CSS scoped / `!important` count |
| C38 | fail | `cssPrefix` unique |
| C39 | fail | `test/run.mjs`; the ModuleSpec runs node-test (n/a outside `foundry/module/` when `test/run.mjs` exists) |
| C40 | fail | the tier's test files exist |
| C41 | fail | a test pins `VERSION === module.json` |
| C42 | manual | fixtures synthetic |
| C43 | fail | fixed `run.mjs`; self-running suites listed in `LEGACY` |
| C44 | fail | README sections in order, Read-this-when line, no fixture counts |
| C45 | fail | `CHANGELOG.md` |
| C46 | fail | a use-doc or a route in `context/foundry/README.md` |
| C47 | fail | an adjustments row per package the code names |
| C48 | fail | no reserved API name reused by a non-kit member, at any depth (as the kit) |
| C49 | warn+manual | world iteration in hot-hook handlers |
| C50 | fail | `publishNamespace` `when` matches where it is called (`ready:<role>` allowed behind a role gate in the sync ready body) |
| C51 | fail | `SETTINGS`/`KEYBINDINGS` rows carry literal keys present in lang |
| C52 | fail | a `legacyName` always has `until` |

## 12. Pending wiring

The blueprint shipped as new files only; the gates, Makefile targets, routing rows and the fork
tools are not wired yet. The one list, with status, is
[`../plans/addon-blueprint-2026-10/README.md`](../plans/addon-blueprint-2026-10/README.md) §7
(W1–W9). Until those land, run `vendor.py check` and `conformance.py --module` by hand (§6).
