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
10. **Wire it** (the generator prints these): a ModuleSpec in `scripts/foundry/ops/config.py` (its
    kit list comes from `lib/kit.lock.json` and `after_sync` from `module.json`
    `flags.pentaryn.afterSync`, never stored there), routing rows, then `make foundry-module-index`.
    The Makefile's `foundry-%-check`/`-sync` pattern rules need no line per module. Then
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

**`publishNamespace(ns, api, { moduleId, when, alias })`**:

| Option | Default | Meaning |
|---|---|---|
| `moduleId` | — | sets `game.modules.get(id).api` and fires `<id>.ready` + `pentaryn.ready` |
| `when` | `"ready"` | recorded, not enforced: `"ready:gm"` for a role-gated publish in the sync ready body, `"ready:gm:wasm"` for a late one (C50) |
| `alias` | `false` | publish a second name only — no `module.api`, no ready hooks |

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
sessions), with batched writes and `coalesce`/`foundry.utils.debounce` for rebuilds. Who runs what, and why, is §5.9.

### 5.6 Patches and `foundry/adjustments.yml`

A row for every wrap, private-member read, third-party flag/API use, core socket event, and CSS
aimed at another package's DOM. `id` = `<short>-…` exactly for a row that
`wrapMethod({adjustments})` names (a patch). A row that is not a patch (a workaround, a private
read, a third-party flag, CSS on another package's DOM) takes its package's prefix: `core-…`,
`dnd5e-…`, `argon-…`, `itempiles-…`. C32 enforces both halves: an unwrapped `<short>-` row fails,
and so does a `wrapMethod` naming a row without the module prefix (decided D2, 2026-10-11). Rows wait in [`adjustments-batch.md`](../plans/addon-blueprint-2026-10/adjustments-batch.md); `files` = the call-site file (never `lib/`);
`markers` = literals present in that file; `check: make foundry-<short>-check`. `wrapMethod({adjustments: "<row id>"})` mirrors the id into
`describe().patches`; conformance C32 cross-checks rows and patches. Rows are appended in one batch
while the file is idle. Never edit Argon's files; CSS only for DOM the module creates.

### 5.7 i18n and CSS

Full-key literals through `_loc` (the i18n gate proves every literal); nested `lang/en.json`;
migrating modules keep their label shape (`Setting.k.Name`, `settings.k.name`, ties' flat keys).
Selectors under `.pentaryn-<short>` or `.<cssPrefix>`; no `!important` in new rules (removing an
existing one is declared); core CSS variables and `.theme-dark/.theme-light`.

Shared CSS lives in the kit as a `kit.json` row with `"ext": "css"`. It is vendored to
`lib/<name>.css`, loaded by listing it in `module.json` `styles`, and proven byte-identical by C14
(`vendor.py` also fails a `styles` entry naming an unlocked `lib/*.css`). C37 and C37w do not score
`lib/*.css`. First kit stylesheet: `argon-tooltip.css` (D7); no module adopts it in wave 1.

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

### 5.9 Async, blocking and concurrency

**Read this when** a handler awaits, writes a document or setting, answers a query, or runs on a
hot hook. Checked in the installed v14.369 and dnd5e 6.0.6 sources: `client/`, `common/` and `dist/`
are under `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/` (`dist/` is minified,
so it is cited by a quoted fragment); `lib/` is `foundry/lib/`.

The model: one copy of your code runs in **every connected tab**. A tab is single-threaded, but every
`await` yields, and another client's write can land while you wait. Foundry never awaits a hook
listener. The active GM is a **user, not a tab** — and in this setup two tabs on the GM account
(the MCP bridge tab plus a GM browser tab) are the normal case.

#### 5.9.1 Rules

**Hooks**

- MUST: a listener on a vetoable hook (`pre<Doc>`, `<pkg>.pre*`) is synchronous and vetoes with a
  literal `return false`. `Hooks.call` stops only at a listener returning `=== false`
  (`client/helpers/hooks.mjs:138-149`); an `async` listener returns a Promise, so **it can never
  veto** (C53).
- dnd5e: most `dnd5e.pre*` hooks use `Hooks.call` (`preActivityConsumption`, `preApplyDamage`,
  `preApplyEnchantment`, `preAdvancementManager*`), but at least six use `Hooks.callAll`, where
  `return false` does nothing: `dnd5e.preConfigureInitiative`, `preCreateCombatMessage`,
  `preCreateTimePassedMessage`, `preCreateUsageMessage`, `preRollClassHitPoints`,
  `preRollNPCHitPoints`. Check `call` vs `callAll` in `dnd5e.mjs` before relying on a veto. A
  listener that mutates the config of either kind is still synchronous.
- MUST: register through `reg.on`/`reg.once` (§5.2). Its `guard` passes through like core: a sync
  throw is logged and becomes `undefined` (no veto, as core does, `hooks.mjs:158-167`); a rejected
  Promise is logged with the module and label via `.then(undefined, report)` (`lib/hooks.mjs:27-36`).
  Without it a rejection surfaces only as an unattributed "Uncaught (in promise)" — core has no
  `unhandledrejection` handler and never routes it to `Hooks.onError`.
- MUST NOT: rely on anything after `Hooks.call`/`callAll` having waited for your listener.
- MUST NOT: gate a `pre<Doc>` listener on `isActiveGM()`/`activeGM`. `pre*` runs **only on the
  client that started the change**, before the request is sent
  (`client/data/client-backend.mjs:104,239,405`); a GM-gated `preUpdate*` silently skips every
  player-initiated change (C54).

**Document writes**

- MUST: a world-wide reaction (once per change, whoever made it) listens on
  `create<Doc>`/`update<Doc>`/`delete<Doc>` — `callAll` on **every** client
  (`client-backend.mjs:164,337,466` locally, `:595-604,626-635` from the broadcast) — and runs on
  one client: `isActiveGM()` picks one *user*; add `claimDocument`/`claimMessage`
  (`lib/election.mjs`, §5.5) to pick one *tab*. An `isAnyGM()`/`.isGM` gate alone runs on every GM
  tab (C61).
- `await doc.update()` means "my tab has applied it", not "everyone has": the server answers the
  initiator first and broadcasts afterwards (`dist/server/sockets.mjs` `s(n),i&&this.broadcast.emit(e,n)`).
- A no-op update is dropped client-side — no request, no `update*` hook, no setting `onChange`
  (`client-backend.mjs:262`). Never use an empty update as a signal.
- MUST: batch. One `Document.updateDocuments`/`createDocuments`/`deleteDocuments`,
  `parent.updateEmbeddedDocuments`, or `foundry.documents.modifyBatch`
  (`client/documents/_module.mjs:96`) per group of writes, never one `await doc.update()` per loop
  iteration (C59). One batch is one round trip; hooks still fire per document.
- There is no client-side timeout on a document round trip (`client/helpers/socket-interface.mjs`
  `dispatch`). Keep write paths short; never hold UI behind one without a visible state.

**World settings and `serialStore`**

- `game.settings.set` on a **world or user** setting is a `Setting` document write
  (`client/helpers/client-settings.mjs:249-254,291-300`) and throws before `ready` (`:292`); MUST NOT
  call it on one from `init`/`setup`. A client-scoped set has no `ready` check (`:255-330`).
- A world setting's `onChange` runs on **every client** (`client/documents/setting.mjs:39-51`); a
  client-scoped one locally only (`client-settings.mjs:327`). An `onChange` that writes is a fan-out
  bug unless role-gated.
- `serialStore(MODULE, key)` (`lib/settings.mjs:158`) serialises read-modify-write **for one store
  instance in one tab** (`foundry.utils.Semaphore(1)`). It does not protect against two tabs, two
  `serialStore` instances on one key, or a direct `game.settings.set` on that key. The write sends
  the whole value, so two clients writing at once lose one update; the server's own `Semaphore(1)`
  orders DB writes, it does not merge them.
  - MUST: exactly one `serialStore` per key, at module scope (C58).
  - MUST: a key more than one client may write uses `anyGM: false` — the active GM *user*
    (`activeGM.isSelf`, `lib/settings.mjs:161`); **two tabs on that account still race**. Other
    clients reach it through a `relay: true` query.
  - MUST: a relayed store write is idempotent or keyed by a request id — the relay arrives in every
    GM tab (below), so a bare `counter + 1` counts twice. A claim picks the writer but the losing
    tab answers first (§5.9.2), so use one only when the sender needs no result.
  - SHOULD: `await store.flush()` in tests and before `uninstall`.

**Queries (`CONFIG.queries`, `User#query`)**

- Queries are declared in the API manifest (`query: true` / `relay: true`); the kit's
  `registerQueries` wires `CONFIG.queries`. MUST NOT assign `CONFIG.queries` by hand (C56). The name
  must be registered on the **sender's** client too (`client/documents/user.mjs:289`):
  `registerQueries` runs on every client — keep it that way, or player `queryGM` breaks.
- `QUERY_USER` defaults to `PLAYER` (`common/constants.mjs:1423-1428`): **any player can query the
  GM**. `guarded` (`lib/queries.mjs:23-31`) rejects a non-GM `ctx.user` with `NOT_GM` and requires a
  GM receiver; a missing `ctx.user` passes (the bridge path; `queryGM`'s local call passes
  `game.user`); `isGM` includes Assistant GMs. `relayed` (`:38-44`) does not check the sender at
  all — its receiver check is `activeGM.isSelf` — so the handler checks ownership via `ctx.user`.
- The server sends a query to **every socket of the recipient user** and keeps the **first answer,
  success or rejection** (`dist/components/activity.mjs` `n.sockets.forEach(e=>e.emit("userQuery",…))`).
  With the bridge tab and a GM browser tab open, the handler runs in both (both are
  `activeGM.isSelf`), and a fast rejection from one tab (e.g. `NOT_READY` before it published) beats
  a slower success from the other. MUST: a query handler that writes is idempotent **across
  concurrent tabs** — look-before-create is not enough, both tabs look before either creates. Make
  the write itself idempotent (a deterministic `_id`, §5.9.2) or request-keyed. A claim alone does
  not do it: the losing tab answers before the winner has written, so the sender gets the loser's
  answer (§5.9.2).
- Without `timeout` the server releases a query only when the **sender** disconnects
  (`e.once("disconnect",u)` on the sender's socket); a recipient tab closing mid-query hangs it
  forever. MUST: every `.query(…)`/`User.queryMany(…)` passes `{ timeout }` (C55; `queryMany` is
  static `(users, name, data, options)`, `user.mjs:335`). `queryGM` defaults to 10000 ms and runs
  the handler locally on the GM's own client (`lib/queries.mjs:89-98`); a raw `User#query` to
  yourself still goes through the server (`user.mjs:305-321`).
- Errors cross the socket as `e.message` only (`client/documents/collections/users.mjs:233-234`);
  that is why `codedError` puts the code in the message prefix (§5.4).

**Module sockets**

- `game.socket` on `module.<id>` needs `"socket": true` (the server registers the channel only then,
  `dist/packages/package.mjs` `registerCustomSocket`), and the channel is exactly
  `module.<module.json id>` (C08).
- `emit` without `recipients` goes to every **other** socket, never the sender; with
  `recipients: [userIds]` it reaches every socket of each user, including your own other tabs. The
  ack fires on **server receipt**, not on handling. Listener signature: `(payload, senderUserId)`.
- SHOULD: prefer a query whenever you need an answer or need the GM to act. Core socket events
  (`userActivity` …) need an adjustments row (§5.6).

**Who is the active GM**

`game.users.activeGM` = the highest role among active GMs, then the lowest user id
(`users.mjs:70-96`); it changes on connect/disconnect. `isSelf` is `game.userId === this.id`
(`user.mjs:78-80`), so every tab on that account is `activeGM.isSelf`. `isActiveGM()` elects a user;
`claimDocument` elects a tab. `isGM` includes Assistants. Keep the predicate a call site uses today —
`isActiveGM`, `isAnyGM`, `isActiveGMOrLoneGM`, `pickRunner` are deliberately different truth tables
(`lib/election.mjs` header).

**ApplicationV2**

- `render()` and `close()` are async and queue on a per-instance `Semaphore(1)`
  (`client/applications/api/application.mjs:233,500-503,991-992`); a first render without `force`
  returns without rendering (`:520-521`). MUST `await app.render({ force: true })` before touching
  `app.element`.
- `render<Class>` hooks fire once per class in the inheritance chain (`:1726-1733`), not awaited, so
  a `renderApplicationV2` listener runs for every app: the cheap discriminating check goes first.
- Repeated render calls queue, they do not merge. SHOULD debounce bursts:
  `foundry.utils.debounce(() => app.render(), 50)`.

**Hot hooks and long loops**

- `refresh<Doc>` fires per object per ticker frame with pending flags
  (`client/canvas/placeables/placeable-object.mjs:424-441`); `draw*`, `hover*`, `sightRefresh`,
  `canvasPan`, `updateWorldTime` are all `callAll` on every client. MUST: their handlers are
  synchronous, read from a cache/`memo` (§5.5, C49) and never start an async job per call —
  `void (async () => …)()` is still one (C60). Defer with `perFrame` (latest args, once per frame),
  `foundry.utils.debounce` (trailing, `.cancel()`, callback errors **not** caught,
  `common/utils/helpers.mjs:101-114`) or `coalesce` when several triggers want the same rebuild
  (`lib/perf.mjs`).
- A loop over hundreds of documents with no `await` freezes canvas and socket. Batch first; where
  you must yield, do it every N items with `await new Promise(r => g.setTimeout(r, 0))` using the
  injected `g`, so tests drive it with `t.mock.timers`. Core has no `sleep`.

**Python MCP server (`scripts/mcp/server.py`)** — one stdio process per Claude session;
`tools/call` runs on a `ThreadPoolExecutor` (`DND_MCP_MAX_WORKERS`, default 8; in-flight cap
max(4 × workers, 32), `server.py:22-29,50,55-56`); in-process handlers share module state across
threads. MUST: a file an MCP tool reads, changes and writes back is modified under
`fcntl.flock(LOCK_EX)` on a sidecar `<file>.lock` — threads **and** processes; a `threading.Lock`
alone does not cover two sessions. python-tooling-44 (`combat_actions_db.upsert/upsert_many/delete`
lose a row under overlap while both report `ok: true`) is the declared fix. Shared `asyncio`
primitives never cross per-call event loops (python-tooling-51).

#### 5.9.2 Patterns

One-*user* reaction (both GM tabs run it — add the claim below when that matters):
```js
reg.on("updateActor", (actor, changes) => {
  if (!isActiveGM() || !foundry.utils.hasProperty(changes, "system.attributes.hp")) return;
  void react(actor);                       // async work leaves the listener; listener stays sync
}, { label: "hp watch" });
```

One-*tab* reaction (bridge tab + browser):
```js
reg.on("createChatMessage", (msg) => {
  if (!isActiveGM()) return;
  void (async () => {
    if (!(await claimMessage(msg, "resolve", { scope: MODULE }))) return;
    await resolve(msg);
  })();
}, { label: "resolve" });
```

Veto, synchronous, literal false:
```js
reg.on("preUpdateToken", (token, changes) => {
  if (changes.x !== undefined && locked(token)) return false;
}, { label: "lock" });
```

Player → GM write through a relay query (manifest row `{ path: "ensure", relay: true }`). The
create is idempotent by a deterministic `_id`, with no claim, so every GM tab can answer and every
answer is right:
```js
const r = await queryGM(`${MODULE}.ensure`, { actorId });       // any client; timeout defaults to 10000
// r.journalId is set; the create's broadcast brings the document to the sender's game.journal
async function ensure({ actorId }, { user }) {                  // wrapped by relayed; runs in EVERY GM tab
  const actor = game.actors.get(actorId);
  if (!actor?.testUserPermission(user, "OWNER")) return fail("REFUSED", actorId);
  const _id = actorId;              // deterministic: one journal per actor, reusing the actor's id
  if (!game.journal.has(_id)) {     // both tabs may get here; both send the same create
    await JournalEntry.create({ _id, name: `${actor.name}'s journal` /* data from inputs only */ }, { keepId: true });
  }
  return ok({ journalId: _id });    // each tab answers after its own create resolved: the journal exists
}
```
A world-document create with `keepId` and an `_id` that already exists **replaces** that document
(probed on v14.369: two concurrent creates both resolve and one document remains, holding the later
data). So the data must be built from the request alone — both tabs must send the same thing — and
the look-first check keeps a later call from overwriting the user's edits. A deleted journal is
recreated by the next call.

Why not a claim here: the losing tab's `claimDocument` resolves after its settle delay while the
winner still has its create round trip ahead, so the loser answers first and the sender gets the
loser's answer. A claim also suits only a one-time job. **A `claimDocument` key is single-use per
document**: the flag `flags.<scope>.claims.<key>` is never cleared, so once it is set, every later
claim on that document with that key stands down in every tab, including after a reload, when the
tabs have new socket ids. Claim with a fixed key only on a document that is itself the one-time event
(a new chat message, a new combat), never for a repeatable request on a long-lived document such as
an actor.

Shared value, one store (the relay must still be idempotent or request-keyed — two GM tabs race):
```js
const ledger = serialStore(MODULE, ["counter", "log"], { anyGM: false });   // module scope, once
await ledger.write(({ counter, log }) =>                                    // keyed by request id:
  log.some(e => e.req === entry.req) ? { counter, log } : { counter: counter + 1, log: [...log, entry] });
```

Batched writes:
```js
const updates = tokens.map(t => ({ _id: t.id, hidden: true }));
await canvas.scene.updateEmbeddedDocuments("Token", updates);   // one round trip
```

Hot hook, deferred:
```js
const refresh = perFrame(() => rebuildOverlay(cache), { g });   // hot: cache
reg.on("refreshToken", (token) => { if (cache.has(token.id)) refresh(); }, { label: "overlay" });
```

Burst coalescing: `const rebuild = coalesce(async () => { … })` — a call during a run gets that
run's promise.

#### 5.9.3 Anti-patterns

```js
Hooks.on("preUpdateActor", async (a, c) => { if (await check(a)) return false; }); // never vetoes
Hooks.on("preUpdateActor", (a) => { if (!isActiveGM()) return; /* … */ });        // skips player edits
for (const t of tokens) await t.update({ hidden: true });                          // N round trips
await gm.query("pentaryn-x.ensure", data);                                         // no timeout: can hang
CONFIG.queries["pentaryn-x.ensure"] = handler;                                     // bypasses the manifest
const a = serialStore(MODULE, "ledger"); /* elsewhere */ const b = serialStore(MODULE, "ledger");
Hooks.on("refreshToken", async (t) => { await paint(t); });                        // per-frame async job
Hooks.on("updateWorldTime", () => game.settings.set(MODULE, "stamp", Date.now())); // every client writes
game.settings.set(MODULE, "worldX", 1) /* world-scoped, in Hooks.once("init") */   // throws before ready
```

#### 5.9.4 Review checklist (every migration review)

- [ ] Every `pre*` listener is sync; vetoes are `return false` (and the hook is a `call`, not a
      `callAll`); none is gated on the active GM.
- [ ] Every `create*/update*/delete*` listener that writes has `isActiveGM()`, the initiator gate
      (`userId !== game.user.id`) or the module's pinned predicate and, where two tabs on one account
      matter, a claim. Both gates pick one user: the initiator gate passes in every tab of the user
      who made the change, so a GM-made change runs in the MCP bridge tab and a GM browser tab.
- [ ] No `await <doc>.update/create/delete/setFlag(` inside a loop where a batch call exists.
- [ ] One `serialStore` per key, at module scope; multi-client keys use `anyGM: false` + relay, and
      the relayed write is idempotent or request-keyed.
- [ ] No world/user `game.settings.set` reachable before `ready`.
- [ ] Every `.query(`/`queryMany(` passes `timeout`; `CONFIG.queries` is touched only by the kit.
- [ ] Query handlers that write are idempotent across concurrent tabs (a deterministic `_id` or a
      request key). A claimed handler cannot return what the winning tab creates, and a
      `claimDocument` key is single-use per document.
- [ ] `relayed` handlers check `ctx.user` ownership; `guarded` handlers do not assume a full GM
      (Assistants pass) or a present `ctx.user` (the bridge has none).
- [ ] Module socket channel equals `module.<id>` and the manifest says `socket: true`; no reliance on
      receiving your own emit.
- [ ] Hot-hook handlers are sync, cached, and defer via `perFrame`/`debounce`/`coalesce`.
- [ ] `app.element` is read only after an awaited `render({ force: true })`.
- [ ] Yields in long loops use injected `g.setTimeout`; tests use `t.mock.timers`.
- [ ] Python: file read-modify-write paths hold `flock` on `<file>.lock`.

C53–C61 in §11 automate what a scan can see; C54, C59 and C61 also land on the manual list.

#### 5.9.5 Open findings (not changed by this section)

- Queries run in every tab of the recipient account, so `relayed`/`guarded` handlers that write run
  twice with the bridge and a GM browser tab open. Affected today: riders' Battle Medic relay
  (`foundry/module/pentaryn-riders/riders.mjs:417`) and journal `ensure`
  (`foundry/module/pentaryn-journal/journal.mjs:146`); their idempotency is unverified. Tracked as
  combat-riders-41 and items-journal-40 (Joe, 2026-10-11): each is fixed, claim first, as a
  `[declared]` commit when its module migrates.
- Both existing `.query(` callers pass `timeout: 8000`; C55 keeps that true.
- `guarded`'s NOT_GM check admits Assistant GMs (`isGM`). Documented, not changed.
- Python: once python-tooling-44 lands, a pytest in `scripts/tests` reads the AST of
  `scripts/combat_actions_db.py` and asserts `upsert`, `upsert_many`, `delete` each hold a
  `with _locked(` block around both `read_all()` and `_atomic_write(`; the audit's 16-thread barrier
  test stays `xfail(strict=False)` until then.

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

Gates: `make foundry-<short>-check` runs the module's ModuleSpec gates — parse, imports, i18n,
node-test (`node test/run.mjs` from the module folder), then `vendor` and `conformance` for a
migrated module (one with `lib/kit.lock.json`; an unmigrated one skips both, it does not fail).
Conformance is **advisory until Stage 5**: it reports failing rules but keeps the check green
(`CONFORMANCE_FAILS` in `scripts/foundry/ops/modules.py`), and a WAIT module is reported, never
failed. `make foundry-modules-check` runs every module and keeps going (`JSON=1` for `--json`).
Kit: `make foundry-lib-check`. Scores: `make foundry-conformance [M=<short>] [MD=1]` — it calls
`conformance.py` directly, which exits 1 while any scored module fails a fail-class rule, so make
reports an error until Stage 5 is done; read the scores, not the exit code. Python:
`make test` (pytest, blueprint tests included). Everything: `make check-all`.

After a migration changes a module's published API, run `make foundry-module-index` and commit
`context/foundry/README.md` — `check-context` fails while the Module APIs table is stale.

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

Known ones: ties `describe` → `describeCard`; ties `attributes.describe` → `attributes.lookup`
and `study.inspect` → `study.examine` (D1; the old names are aliases that log a compatibility
warning until ties S8); prompts' gather cut suffix `… (cut, full text: get-character <id>)`
with one `gatherChars` default of 400 (D6); combat events renamed with legacy double-fire;
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
| C03 | fail | dnd5e in `relationships.systems` iff the sources touch dnd5e (including the Token5e movement option `ignoreTokens`, packages.json `codePatterns`, D4) |
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
| C32 | fail | prototype patches only via `wrapMethod`/`defineAccessor`; rows ↔ patches; a `<short>-` row is a patch and a patch row is `<short>-` (D2) |
| C33 | manual | private internals covered by rows |
| C34 | fail | `lang/en.json` nested under one `PENTARYN_<SHORT>` root |
| C35 | fail | no two-branch i18n wrapper; definite key coverage ≥ 90 % |
| C36 | warn+manual | hard-coded UI English |
| C37 / C37w | fail / warn | CSS scoped / `!important` count (vendored kit `lib/*.css` not scored, D7; a nested `styles/lib/` still is) |
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
| C53 | fail | no `async` listener on a vetoable hook (`pre*`, `<pkg>.pre*`), inline or a named `async` function in the same file (§5.9) |
| C54 | warn+manual | a `pre(Create\|Update\|Delete)<Doc>` listener gated on the active GM (runs on the initiator only) |
| C55 | fail | every `User#query` / `User.queryMany` passes `timeout` (`queryGM` exempt; unknown receivers → manual) |
| C56 | fail | no hand-written `CONFIG.queries` assignment (`[…] =`, `.x =`, `??=`, `Object.assign`); reads pass |
| C57 | fail | a `game.socket` `module.*` channel is exactly `module.<module.json id>` (C08 owns `socket: true`) |
| C58 | fail | one `serialStore` per key across the module |
| C59 | warn+manual | `await <doc>.update/create/delete/setFlag/unsetFlag(` inside a loop body (batch it) |
| C60 | warn | no `async` listener or `await` in a hot-hook handler unless it defers via `perFrame`/`debounce`/`coalesce` |
| C61 | warn+manual | a writing `create*/update*/delete*` listener has an active-GM gate, the initiator gate (`userId !== game.user.id`) or a claim (an any-GM gate alone → manual). The active-GM and initiator gates pick one *user*, not one tab: every tab of that user passes, so where two tabs on one account matter the review checks for a claim (§5.9.4); the write and the gate are looked for in the listener and the functions it calls by name, in its file or the module files it imports |

## 12. Wiring status

Wired in wave 1 (README §7): `make foundry-<m>-check` with the vendor and conformance gates (W2,
W3), `module-new` / `module-vendor` / `module-conformance` / `module-check --all --json` in ops
(W1), the Makefile targets in §6 (W4), the updater's exposure skip and pytest paths (W5), the
routing rows and the generated Module APIs table (W6, W7) and the plans index row (W8). What stays
open: conformance is advisory until Stage 5 (§6), and names and pings run `node-test` only once they
have a `test/run.mjs`. The list with status is
[`../plans/addon-blueprint-2026-10/README.md`](../plans/addon-blueprint-2026-10/README.md) §7.
