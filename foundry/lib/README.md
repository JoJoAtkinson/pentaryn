# foundry/lib — the Pentaryn module kit

**Read this when:** you are changing a shared helper that modules vendor (`lib/*.mjs` in a module),
or adding a new one. **Not this file:** how to build or migrate a module →
`context/foundry/addon-blueprint.md` · why it is shaped like this → `context/plans/addon-blueprint-2026-10.md`.

This folder is the **canonical source** of the kit. Modules cannot import across module folders
(the imports gate fails a `../` that leaves the module), so each module carries a **byte-identical
copy** in its own `lib/`, listed in `lib/kit.lock.json`, and `vendor.py check` proves identity by
sha256. Never edit a copy. Edit here, run the kit tests, then re-vendor:

```
node foundry/lib/test/run.mjs
./.venv/bin/python scripts/foundry/blueprint/vendor.py sync --all     # rewrites lib/ + test/kit/ in every module with a lock
./.venv/bin/python scripts/foundry/blueprint/vendor.py check --all    # lock-less (unmigrated) modules are skipped, not failed
```

`--all` never adopts the kit for a module: one without `lib/kit.lock.json` is listed as skipped and
left untouched. Adopting is per module (`vendor.py sync <short> --tier full`); adding one file to a
module that has a lock is `vendor.py sync <short> --kit <file>` (e.g. `--kit election`).

Every file starts with the header `// pentaryn kit <version> · vendored from foundry/lib/<file>.mjs — …`
(`/* pentaryn kit <version> · vendored from foundry/lib/<file>.css — … */` for a stylesheet).
Bump `kit.json` `version`, `errors.mjs` `KIT_VERSION` and every header together.

| File | Exports | Notes |
|---|---|---|
| `errors.mjs` | `KIT_VERSION`, `CODES`, `RESERVED`, `PentarynError`, `codedError`, `errorCode`, `isCoded`, `ok`, `fail`, `toFail` | the message prefix `CODE: detail` is the wire format |
| `log.mjs` | `makeLog(moduleId)` → `error/warn/warnOnce/info/debug/debug$/enabled/trace/traces/swallow/notify` | lines are `<module> \| <event>`; debug gated by `CONFIG.debug[moduleId]` |
| `hooks.mjs` | `hookRegistry(moduleId, log)` → `on/once/off/offAll/ids/guard/guardSwallowAsync`; `emitter(moduleId, HOOKS)` | `guard` passes vetoes through; `guardSwallowAsync` is aoe's old guard; `reg.on(n, fn, { guard: "warn" })` logs a throw at warn instead of error (1.0.1) |
| `settings.mjs` | `defineSettings`, `settingReader`, `settingsSnapshot`, `defineKeybindings`, `serialStore` | `serialStore(MODULE, ["counter", "log"])` serialises several keys on one queue (1.0.1); rows carry literal `name`/`hint` keys; both define calls skip rows already registered, and `defineKeybindings` registers nothing once Foundry has built its bindings (after `setup`), so a hot patch never throws |
| `resolve.mjs` | `resolveRef`, `refOf`, `toIdSet`, `withRef` | exact match only, explicit scene scope |
| `api.mjs` | `buildApi`, `describe`, `surfaceOf`, `maxDepth`, `toPlain` | drift and reserved names throw at load; a `ref` row resolves per call with that call's `opts.sceneId`/`opts.base`; a write row returns `fail()` on an unresolvable ref; an `unlisted` table is published as a frozen **copy** — the caller's objects are never frozen (1.0.1); a row's `dryRun: true` shows in `describe()`, and a first `ref` with `resolve: "self"` is passed raw like `resolve: false` (the function resolves strings itself; the marker shows in `describe()`) (1.1.0) |
| `queries.mjs` | `guarded`, `relayed`, `registerQueries`, `queryNameOf`, `queryGM` | `CONFIG.queries` from `query: true` rows; `guarded(fn, { sender: "any" })` and `fn(data, ctx)`; `relayed` = any sender, active-GM receiver (`relay: true` rows); `row.queryName` when the query name ≠ the row path (1.0.1) |
| `publish.mjs` | `publishNamespace`, `installRoot`, `apiOf`, `publishedOf` | `module.api` canonical; assigns into the plain `game.pentaryn` (no frozen-root guard, no re-alias tick since 1.0.2) |
| `election.mjs` | `isActiveGM`, `isAnyGM`, `isActiveGMOrLoneGM`, `pickRunner`, `claimDocument`, `claimMessage` | distinct truth tables — keep each call site's |
| `patch.mjs` | `wrapMethod`, `defineAccessor`, `patches`, `unwrapAll` | names no third-party package; `kind: "getter"` wraps an accessor such as `Token#isVisible` (1.0.1) |
| `patch-libwrapper.mjs` | `libWrapperRoute` | `packages: [lib-wrapper]` — vendored only where used |
| `flags.mjs` | `readFlag`, `flagPath` | delete with `{[flagPath(s,k)]: _del}` at the call site |
| `perf.mjs` | `memo`, `coalesce`, `perFrame` | debounce/throttle: use `foundry.utils` |
| `argon-kit.mjs` | `dropTooltip`, `paintBadge(button, left, emptyClass)`, `applyButtons(panel, next, fresh, { attachDetached, after })`, `itemButtonClass(panel?)`, `slotKind`, `mainPanel(label)`, `settlePips(panel)` | `packages: [enhancedcombathud]`; Argon HUD helpers combat and transform hand-copied (transform-creatures-12, combat-riders-3/-5). `attachDetached` and `after` are combat's superset, opt-in; `itemButtonClass` caches per vendored copy |
| `argon-tooltip.css` | Argon's compact `.ech-tooltip.pentaryn-tt` / `.pentaryn-tt-list` tooltip rules | `ext: css`, `packages: [enhancedcombathud]`; verbatim from transform.css (D7). Vendored to `lib/argon-tooltip.css`, loaded by listing it in `module.json` `styles`; C37/C37w do not score `lib/*.css`. Vendored by combat and transform (wave 4), each `@import`ing it from its own stylesheet until the Wave 7 batch lists it in `styles`; riders waits on its `relationships` edit |
| `test-kit/foundry-stub.mjs` | `installFoundry`, `StubCollection`, `makeDoc`, `makeToken`, `makeScene`, `makeUser` | imports Foundry's own `common/` from the installed app; `Hooks` catches a throwing listener like Foundry's `Hooks.#call` (warn, continue; `F.hookErrors`); `fire("ready")` sets `game.ready` |
| `test-kit/harness.mjs` | `pinJSON`, `characterise`, `normaliseDescribe`, `checkJSON`, `sourceScan`, `importGraph`, `reachable`, `maxDepth`, `readJSON`, `manifestOf`, `forkQueries`, `forkSource`, `contractDrift` | goldens in `test/golden/`; a missing golden fails; `forkQueries` reads `$FOUNDRY_MCP_FORK` and returns `{ skip }` when the fork is absent |

`kit.json` lists each file's dependencies (vendoring closes over them), the two tiers
(`small`, `full`), and `packages` for files whose bytes name a third-party package.
`argon-kit` was the one **deferred** row (D7) until wave 4 wrote it (combat, audit Wave 8.6); a row with
`"status": "deferred"` is refused by `vendor.py sync`.
A row with `"ext": "css"` is a stylesheet (`<name>.css`); every other row is `<name>.mjs`.

`test/fixtures/hook-order.mjs` is the cross-module registration-order fixture: it shows why moving
a module's hook registration from module scope to `setup` is a behaviour change.

**Changelog.** 1.0.0 — first build. 1.0.1 (gap-fill, 2026-10-10) — additive only: K1 getter route,
K3 `guarded` ctx + `sender: "any"`, K4 `relayed`, K5 unlisted copies, K6 multi-key `serialStore`,
K7 guard level, K8 `queryName`, and the fork contract helpers. No module had a lock yet, so nothing
was re-vendored. K2 (top-level-only reserved names) waits for Joe's decision D1.
1.0.2 (wave 2 opening bump, 2026-10-11; wave-1 report J6, J10, J16) — the test stub defines
`globalThis.logger` and records it on `F.logged` (J6); a `wrapMethod`/`defineAccessor` handle's
`unwrap()` drops the kit's record, so the same marker can wrap again (J16, declared); `publish.mjs`
loses the COMPAT frozen-root guard and `realiasTick` — a frozen `game.pentaryn` now throws (J10,
declared). Re-vendored into every module with a lock.
1.1.0 (wave 5, 2026-10-12; wave-2 report W2-B3, W2-B4, decided by Joe 2026-10-12) — additive only:
a row field `dryRun: true` (the row takes a dry run; `describe()` emits it, and the bridge's
pentaryn-write forwards a dry run only to such a row or to one whose param text names `dryRun`); a
param marker `resolve: "self"` (the kit does not resolve the param, the function resolves a uuid, id
or exact name itself; `describe()` keeps it, conformance C62 accepts it, and the bridge treats a first
`ref` carrying it as resolvable). Re-vendored into every module with a lock.
