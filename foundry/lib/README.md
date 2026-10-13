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
| `errors.mjs` | `KIT_VERSION`, `CODES`, `RESERVED`, `PentarynError`, `codedError`, `errorCode`, `isCoded`, `ok`, `fail`, `toFail` | the message prefix `CODE: detail` is the wire format; `isCoded`: exported for modules; no consumer yet (1.2.0 KIT-M7) |
| `log.mjs` | `makeLog(moduleId)` → `error/warn/warnOnce/info/debug/debug$/enabled/trace/traces/swallow/notify`; `logOrConsole(moduleId, log)` | lines are `<module> \| <event>`; debug gated by `CONFIG.debug[moduleId]`; `notify` always writes its console line, the toast only with `ui.notifications` (1.2.0 kit-edge-8); `logOrConsole` is the one fallback when a kit function got no `log` — a console stand-in (`error/warn/warnOnce`, its own once-Set) used by hooks, patch and patch-libwrapper (1.2.0 kit-ext-2) |
| `hooks.mjs` | `hookRegistry(moduleId, log)` → `on/once/off/offAll/ids/guard/guardSwallowAsync`; `emitter(moduleId, HOOKS)` | `guard` passes vetoes through; `guardSwallowAsync` is aoe's old guard; `reg.on(n, fn, { guard: "warn" })` logs a throw at warn instead of error (1.0.1) |
| `settings.mjs` | `SETTING_PASSTHROUGH`, `defineSettings`, `settingReader`, `settingsSnapshot`, `defineKeybindings`, `serialStore` | `serialStore(MODULE, ["counter", "log"])` serialises several keys on one queue (1.0.1) — a partial `mutate` result keeps the omitted keys (1.2.0 KIT-R4); a multi-key write is not atomic — keys go in table order as separate Setting writes, `onChange` sees the intermediate states and a failure can leave a torn pair, so list the counter key first (1.2.0 AC-6); rows carry literal `name`/`hint` keys; both define calls skip rows already registered, and `defineKeybindings` registers nothing once Foundry has built its bindings (after `setup`), so a hot patch never throws; a settings row reaches `register` only through the keys defineSettings maps (`scope`, `config`, `type`, `default`, `name`, `hint`, `choices`) and `SETTING_PASSTHROUGH` (`range`, `requiresReload`, `onChange`, `filePicker`) — any other key is dropped, with one `log.warn` per key name when `{ log }` is passed, never a throw; `defineKeybindings` takes the same `labels` option as `defineSettings` (default section `Keybind`) (1.2.0 kit-ext-9); `settingReader` is uncached so a hot-patched client reads live values, and Foundry builds a Setting on every client-scope `get` — a hot path caches a client-scope read at the call site and invalidates it from the row's `onChange` (1.2.0 kit-perf-4) |
| `resolve.mjs` | `KINDS`, `resolveRef`, `refOf`, `toIdSet`, `withRef` | exact name, then a unique case-insensitive exact name; never a substring (1.2.0 KIT-M2 wording); explicit scene scope; `KINDS` is the one ref-kind table — each kind's documentName and its `game` collection or Scene-embedded collection (1.2.0 kit-ext-6); `withRef`: exported for modules; no consumer yet (1.2.0 KIT-M7) |
| `api.mjs` | `buildApi`, `describe`, `OPTIONAL_METHOD_FIELDS`, `MEMBER_DEFAULTS`, `queryNameOf`, `isRefRow`, `surfaceOf`, `maxDepth`, `toPlain` | drift and reserved names throw at load; a `ref` row resolves per call with that call's `opts.sceneId`/`opts.base`; a write row returns `fail()` on an unresolvable ref; an `unlisted` table is published as a frozen **copy** — the caller's objects are never frozen (1.0.1); a row's `dryRun: true` shows in `describe()`, and a first `ref` with `resolve: "self"` is passed raw like `resolve: false` (the function resolves strings itself; the marker shows in `describe()`) (1.1.0); `buildApi(…, { g })` resolves `ref` rows against an injected global, default `globalThis` (1.2.0 KIT-M4); `describe()`'s optional method fields come from the ordered `OPTIONAL_METHOD_FIELDS` table (1.2.0 kit-ext-5); a resolved `ref` param whose `kind` is not in `KINDS` throws at load (1.2.0 kit-ext-6); `queryNameOf` is the one query-name formula (`describe().queries` and `registerQueries`) and `isRefRow` the one `(ref, opts)` wire test (1.2.0 KIT-M1-followup); every kit-owned member (`errors.RESERVED`) is wired from one `MEMBER_DEFAULTS` table — built, member with its default, or optional row (1.2.0 kit-ext-3-followup) |
| `queries.mjs` | `guarded`, `relayed`, `registerQueries`, `queryNameOf`, `queryGM` | `queryGM` rejects coded: a timeout is `TIMEOUT`, remote or on the GM's own client (1.2.0 AC-4), a remote coded error keeps its code, else `INTERNAL` (1.2.0 KIT-R7); `CONFIG.queries` from `query: true` rows, whose handler waits up to 5 s for the module's publish before `NOT_READY` (1.2.0 AC-5); `guarded(fn, { sender: "any" })` and `fn(data, ctx)`; `relayed` = any sender, active-GM receiver (`relay: true` rows, whose API function gets ctx as a trailing argument, 1.2.0 AC-1); `row.queryName` when the query name ≠ the row path (1.0.1); `queryNameOf` is re-exported from `api.mjs` (1.2.0 KIT-M1-followup) |
| `publish.mjs` | `publishNamespace`, `installRoot`, `apiOf`, `publishedOf` | `module.api` canonical; assigns into the plain `game.pentaryn` (no frozen-root guard, no re-alias tick since 1.0.2); `installRoot`: exported for modules; no consumer yet — `publishNamespace` calls it internally (1.2.0 KIT-M7) |
| `election.mjs` | `isActiveGM`, `isAnyGM`, `isActiveGMOrLoneGM`, `pickRunner`, `claimDocument`, `claimMessage` | distinct truth tables — keep each call site's; a failed claim write → false if the doc is gone, else coded `INTERNAL` (1.2.0 KIT-R3) |
| `patch.mjs` | `wrapMethod`, `defineAccessor`, `patches`, `unwrapAll` | names no third-party package; `kind: "getter"` wraps an accessor such as `Token#isVisible` (1.0.1) |
| `patch-libwrapper.mjs` | `libWrapperRoute` | `packages: [lib-wrapper]` — vendored only where used |
| `flags.mjs` | `readFlag`, `flagPath` | delete with `{[flagPath(s,k)]: _del}` at the call site |
| `perf.mjs` | `memo`, `coalesce`, `perFrame` | debounce/throttle: use `foundry.utils`; a `coalesce` call from inside its own fn shares the run (1.2.0 kit-edge-4); `memo` callers key by a string (uuid/id) via `keyFn`, never a placeable — keys are held strongly — and eviction is FIFO with a default max of 500 (1.2.0 kit-perf-2); `coalesce` is leading-edge — for idempotent reads callers can share, while a rebuild several hooks trigger uses `foundry.utils.debounce` so the last change is not lost (1.2.0 kit-perf-3) |
| `pins.mjs` | `pinnedEntryIds`, `makePinnedCache`, `PIN_HOOKS`, `pinsChanged` | which journals a scene Note pins, null-safe; a cache forgets on the six `PIN_HOOKS` (updateScene only when `pinsChanged`, i.e. its change touches `notes`). In neither tier: journal and dropbin vendor it (1.2.0 journal-EXT-9) |
| `argon-kit.mjs` | `dropTooltip`, `paintBadge(button, left, emptyClass)`, `applyButtons(panel, next, fresh, { attachDetached, after, log })`, `itemButtonClass(panel?)`, `slotKind`, `mainPanel(label)`, `settlePips(panel)` | `packages: [enhancedcombathud]`; Argon HUD helpers combat and transform hand-copied (transform-creatures-12, combat-riders-3/-5). `attachDetached` and `after` are combat's superset, opt-in; a fresh button's rejected render is warned through `log` (else console), never unhandled (1.2.0 KIT-R6); `itemButtonClass` caches per vendored copy |
| `argon-tooltip.css` | Argon's compact `.ech-tooltip.pentaryn-tt` / `.pentaryn-tt-list` tooltip rules | `ext: css`, `packages: [enhancedcombathud]`; verbatim from transform.css (D7). Vendored to `lib/argon-tooltip.css`, loaded by listing it in `module.json` `styles`; C37/C37w do not score `lib/*.css`. Vendored by combat, transform and riders, each listing `lib/argon-tooltip.css` in its `module.json` `styles` (1.2.0 KIT-M3) |
| `test-kit/foundry-stub.mjs` | `installFoundry`, `StubCollection`, `STUB_KINDS`, `makeDoc`, `makeToken`, `makeScene`, `makeUser`, `stubId` | imports Foundry's own `common/` from the installed app; `Hooks` catches a throwing listener like Foundry's `Hooks.#call` (warn, continue; `F.hookErrors`); `fire("ready")` sets `game.ready`; `doc.update`/`doc.delete` fire the vetoable `preUpdate`/`preDelete<Doc>` first (1.2.0 kit-edge-2); `users.activeGM` is the highest-role active GM, then the lowest id (1.2.0 kit-edge-3); `game` collections and `fromUuidSync` come from `STUB_KINDS`, a mirror of `resolve.mjs` `KINDS` — every world collection is seeded from the option of its name, and owned uuids (`Actor.<id>.Item.<id>`) resolve (1.2.0 kit-ext-7) |
| `test-kit/harness.mjs` | `pinJSON`, `characterise`, `normaliseDescribe`, `checkJSON`, `sourceScan`, `importGraph`, `reachable`, `maxDepth`, `readJSON`, `sourceFiles`, `manifestOf`, `forkQueries`, `forkSource`, `contractDrift` | goldens in `test/golden/`; a missing golden fails; `forkQueries` reads `$FOUNDRY_MCP_FORK` and returns `{ skip }` when the fork is absent |

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
1.2.0 (defect wave 2, 2026-10-12; final-review record `context/plans/final-review-2026-10-12/kit.md`,
approved by Joe 2026-10-12) — the version bump that carries the record's kit-source fixes; each
declared fix lands under this entry with its finding id. Re-vendored into every module with a lock
(walls included on disk; walls is still never synced live). Reload only — no `module.json` change.
KIT-R1 (declared): `unwrapAll()` undoes newest first and drops only the records whose undo succeeded —
a patch a foreign wrapper keeps live stays in `patches()`, and a later wrap with its marker returns
the live handle instead of stacking a second copy.
AC-1 (declared): a `relay: true` row's API function now gets core's ctx as a trailing argument
(`fn(d, ctx)` / `fn(d.ref, d, ctx)`), so a relayed handler can check ownership on `ctx.user` (§5.9.4);
before, `registerQueries` dropped it. Guarded rows are called exactly as before.
kit-ext-1 (declared): `describe().queries` merges — the row-derived names first, then any
`extras.queries` not already present, deduped. Before, `extras.queries` replaced the row-derived list
(an empty list wiped it). Journal now passes its hand-registered relay query, so it appears there.
kit-edge-2 (declared, test-kit only): the stub's `doc.delete()` runs the vetoable
`Hooks.call("preDelete<Doc>", doc, options, userId)` first, as Foundry does; a `false` resolves
undefined, leaves the collection alone and logs no `delete` to `F.calls`. A proceeding delete now
logs `Hooks.call preDelete<Doc>` before its `delete` entry. No module golden moved.
KIT-M2 (declared, docs only): the README `resolve.mjs` row, the `resolve.mjs` header and the
`publish.mjs` `inspect()` comment said resolution was "exact match only"; they now say what `byName`
has always done — exact name, then a unique case-insensitive exact name; never a substring. No code
change: modules rely on the fallback.
kit-edge-3 (declared, test-kit only): the stub's `game.users.activeGM` picks the active GM with the
highest role, then the lowest id — Foundry's `getDesignatedUser` order; before, it took the lowest id
alone, so an Assistant GM could outrank a Gamemaster. No module golden moved; prompts' markers test gives its
injected second GM `role: 4`, as every real GM has a role.
kit-edge-4 (declared): `coalesce` claims the run before calling fn — `inflight` is a deferred promise
set first, settled from fn's result, and cleared only if it is still that run. A call from inside fn's
synchronous prefix now shares the run instead of starting a second one, and an inner settle can no
longer clear an outer run. No module calls the kit's `coalesce` today; no golden moved.
journal-EXT-9 (declared): new file `pins.mjs` — one null-safe `pinnedEntryIds(scenes)`, `makePinnedCache(getScenes)`,
the six invalidation hooks `PIN_HOOKS` and `pinsChanged` (updateScene only when it touches `notes`).
Journal and dropbin vendor it and delete their copies (dropbin's threw on a scene without notes);
each core re-exports the names for its older suites (a `test/graph-allow.json` debt in each).
names-ext-3 (declared): `resolveRef(ref, "actor", { base: true })` given a token's synthetic Actor
(`isToken`, directly, as a placeable's document or by uuid) returns the world actor
(`game.actors.get(token.actorId ?? id)`, null/NOT_FOUND when it is gone); before, it returned the
synthetic actor unchanged. `base: false` is unchanged. Names' `syncRef` and ties' `inspect` drop
their hand-rolled copies; transform's outside-revert hook never resolved through the kit and keeps its.
kit-ext-2 (declared): without a `log`, `emitter`'s overdue-legacy warning now reaches `console.warn`
once per legacy name per emitter, as its contract says — before, every emit warned. The four
hand-copied "log or console" fallbacks (hooks ×2, patch, patch-libwrapper) are one helper,
`log.mjs` `logOrConsole`; kit.json gives hooks, patch and patch-libwrapper a `log` dep (every lock
already vendors log). The console lines are byte-identical, so a caller without a log (ties' registry,
most `wrapMethod` calls) sees only the repeated legacy warning stop.
KIT-R2 (declared): the root `game.pentaryn.inspect(ref, opts)` treats a null or non-object `opts` as
`{}` — before, `inspect(ref, null)` threw an uncoded TypeError reading `kind`. Each namespace's
`inspect(doc, opts)` now gets that same normalised object. An object `opts` is unchanged.
KIT-R3 (declared): `claimDocument`/`claimMessage` wrap the claim write. If it rejects and the
reread finds the document gone (no id), the claim returns false — it was deleted under us, nobody
acts; otherwise it rejects `INTERNAL: claim <key> on <uuid>: <message>`, so a caller's coded-error
handling reports it (before: the raw uncoded error). Kept and now documented: no socket id, or a null
or id-less doc → true (aoe's glue test -30 pins it). kit.json gives election an `errors` dep (every
lock already vendors errors). The success path is unchanged.
KIT-R4 (declared): a multi-key `serialStore` writes `k in next ? next[k] : current[k]`, so a `mutate`
that returns a partial object keeps the omitted keys (an explicit `null` still writes `null`), and
`write` resolves to the full stored object. Before, an omitted key was set to `undefined`. Latent:
ties and prompts use single-key stores today; single-key stores are unchanged.
AC-6 (declared, docs only): a multi-key `serialStore` write is not atomic — Foundry has no
multi-key setting transaction, so `write` sets the keys in table order as separate Setting writes.
Each `onChange` sees the intermediate state, and a failure part-way leaves a torn pair. The JSDoc
and the settings row now say so and name the mitigation: list the counter key first, so a torn
write has already advanced the counter and never reuses an id. No code change.
KIT-R5 (declared): `resolveRef` given a `Compendium.*` UUID whose document is not loaded — so
`fromUuidSync` returns the pack's index entry, or anything without `documentName` — throws
`NOT_FOUND: <uuid>: compendium document not loaded; load it with fromUuid first`, even with
`required: false`. Before, adapt() threw a misleading `BAD_ARGS: expected Actor, got undefined`.
A loaded compendium document resolves as before.
KIT-R6 (declared): `applyButtons` stays synchronous but catches each fresh button's render —
`Promise.resolve(b.render()).catch(…)` warns `argon button render failed` through a new optional
`log` opt (else `g.console`), so a rejected Argon render is attributed to the module instead of an
unhandled rejection. Combat's adapter and transform's three bar composers pass their `log`; a
synchronous throw from `render()` still propagates as before. Re-vendored into combat and transform
(riders vendors only `argon-tooltip.css`, not `argon-kit`).
kit-edge-8 (declared): `log.notify` writes its `<module> | <message>` console line first,
unconditionally, then shows the toast only when `ui.notifications[level]` is a function and returns
its result (undefined otherwise). Before, a missing `ui.notifications` (or level method) dropped the
console line too. With a toast present the output is byte-identical; the stub's early
`ui.notifications` install is unchanged.
KIT-M3 (declared, docs only): the README `argon-tooltip.css` row said the migration was partial
(combat and transform `@import`ing it, riders waiting). It now says what is on disk — combat,
transform and riders each vendor it and list `lib/argon-tooltip.css` in `module.json` `styles`.
No code or vendored byte changed.
KIT-M9 (declared, docs only): the README `test-kit/foundry-stub.mjs` row now lists `stubId` and the
`test-kit/harness.mjs` row `sourceFiles`; a kit test parses every `.mjs` row and asserts its Exports
cell equals the file's named exports. No code or vendored byte changed.
KIT-M7 (declared, docs only): `isCoded`, `withRef` and `installRoot` have no consumer outside the
kit (`installRoot` is called only by `publishNamespace`). All three stay exported — dropping an export
is a breaking change at a minor bump — and their README rows now say "exported for modules; no
consumer yet"; a kit test fails if the marker stays once a module uses one, or is missing while
none does. No code or vendored byte changed.
kit-ext-5 (declared): `describe()` builds each method's optional fields (`queryName`, `relay`,
`dryRun`, `nullWhen`, `throws`, `legacy`, `since`) from one ordered table, `OPTIONAL_METHOD_FIELDS`
(new export), instead of seven hand-written spreads. Each still shows only when set, in the same
place; every describe golden is byte-identical. A new optional field is one table line.
kit-ext-6 (declared): `resolve.mjs`'s three parallel tables (`DOC`, `COLLECTION`, `EMBEDDED`) are one
`KINDS` table (new export) — a kind's documentName and its world or Scene-embedded collection on one
line; resolution is unchanged (resolve tests untouched). `buildApi` now throws at load when a row's
leading `ref` param — one the kit resolves, so not `resolve: false`/`"self"` — names a kind not in
`KINDS` (a typo such as `"tokn"` used to fall through to a per-call `BAD_ARGS`/`NOT_FOUND`). No
module's manifest changes: every resolved ref kind in use is already a kit kind.
kit-ext-7 (declared, test kit only): the stub built `game` collections and `fromUuidSync` for six
kinds while `resolve.mjs` resolves thirteen. Both now come from `STUB_KINDS` (new export), a copy of
`KINDS` — the stub cannot import `resolve.mjs`, which a small-tier module does not vendor — and a kit
test asserts the two are equal. `game.macros`, `tables`, `combats`, `folders` and `playlists` are
`StubCollection`s seeded from `installFoundry`'s option of the same name; `fromUuidSync` walks
`<Doc>.<id>` pairs, so an owned item (`Actor.<id>.Item.<id>`, from the actor's `items` Map or array)
resolves. A uuid with a trailing odd segment now resolves to `null` instead of its parent. Existing
collections keep their shape; no module golden changes.
kit-ext-9 (declared): `defineSettings` copied four SettingConfig keys and silently dropped any
other row key (a `step`, a typo). The four are now the exported `SETTING_PASSTHROUGH` (`range`,
`requiresReload`, `onChange`, `filePicker`; the `SettingRow` typedef gains `filePicker`, the KIT-M11
follow-up). `defineSettings` takes an optional `log` and warns once per unknown key name
(`settings: <module>.<key>: row key "<k>" is not passed to register (see SETTING_PASSTHROUGH)`);
it never throws, and without a log it is silent as before. `defineKeybindings` takes a `labels`
option merged over `{ section: "Keybind", name: "Name", hint: "Hint" }`, mirroring
`defineSettings`; its JSDoc now says how a row without literal labels is derived. No module row has
an unknown key today, so nothing new is logged and no golden moves.
KIT-M1-followup (declared): `describe()` derived `describe().queries` with its own inline copy of
the query-name formula while `registerQueries` used `queryNameOf`. `queryNameOf` and a new
`isRefRow` (first param named `ref`, the `fn(d.ref, d)` wire shape) now live in `api.mjs` (new
exports); `describe()`, `registerQueries` and the kit's `ref` resolution all use them, and
`queries.mjs` imports them — re-exporting `queryNameOf`, so `lib/queries.mjs` imports keep working.
No query name changes; no golden moves.
kit-ext-3-followup (declared): `buildApi` wired the kit-owned members from three hand-kept lists
(`BUILT`, `MEMBERS`, `OPTIONAL`) plus five hand-written default assignments. They are now one
`MEMBER_DEFAULTS` table (new export) keyed by `errors.RESERVED`, one frozen `{ via, value }` entry
per name, in the order the members land on the API (`via`: `built`, `member` or `optional`); the kit throws at load when a
RESERVED name has no entry or an entry is not RESERVED. Reserved-name refusal, the members
`buildApi` accepts and every default are unchanged — the RESERVED guard test and every surface and
describe golden — and the published key order — are untouched.
