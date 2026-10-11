---
title: Migrating pentaryn-journal to the addon blueprint
status: plan
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan, migration, journal]
---

# Migrate `pentaryn-journal` to the blueprint

**Read this when:** you are about to bring `pentaryn-journal` up to the addon blueprint (fix phase
of the 2026-10 audit), or you need to know which audit findings the migration absorbs.
**Not this file:** the general procedure → [`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 ·
the order across modules → [`migration-order.md`](migration-order.md) · the live score →
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module journal --markdown`.

Line numbers are **snapshot** line numbers (`audit-snapshot/pentaryn/module/pentaryn-journal/`).
On 2026-10-10 the snapshot and `foundry/module/pentaryn-journal/` were byte-identical and the module
is not on the WAIT list. Before step 1: `git diff ee505c2 -- foundry/module/pentaryn-journal` must be
empty, or re-anchor every reference below.

| | |
|---|---|
| Tier | `full` (three settings, a query relay, writes journals for other users) |
| Score today | **48.8 %** (20/41) |
| Projected after this guide | 100 % of fail-class rules except **C07**, **C09**, **C37** (Wave 7 `module.json` batch) and **C30** (blocked on a kit gap, §8) |
| Steps | 9 (1 characterisation, 6 behaviour-neutral, 1 publish change under D2, 1 Wave 7 item) |
| WAIT | **No** — touches no file of combat, transform or aoe |
| Effort | ~2 days (M) |
| Order | migration-order #8 |
| Prerequisites | K4 `relayed` / `relay: true` — **landed** (kit 1.0.1); K5 `buildApi` freezes a copy — **landed** (kit 1.0.1); R7 C03 dnd5e use — journal half **landed**; movement's `ignoreTokens` **blocked on D4** |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module journal --markdown`. On the snapshot it moved 48.8 % → 46.3 % (R7: C03 now fails — dnd5e use without a relationship — until step 9 adds it) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

---

## 1. Conformance today, item by item

| Rule | Today | Detail | Cleared by |
|---|---|---|---|
| C01, C02 | pass | `minimum: "14"` already | — |
| C03 | pass (**scorer false negative**) | code hooks `renderItemSheet5e` and reads `system.identified/unidentified` (:219–222), but `module.json` has no `relationships` at all (`items-journal-37` d). C03's regex does not see these | step 9 adds dnd5e |
| C04, C05, C06 | pass | | — |
| C06w (warn) | **warn** | `journal.css` at the root | step 9 |
| C07 | **fail** | missing tier, namespace, cssPrefix; `flagScope: "journal"` | step 9. **Metadata only**: every flag is already written under `pentaryn-journal` (`core.MOD`, journal-core.mjs:27) — not a data migration |
| C08 | pass | uses `CONFIG.queries`, not `game.socket` | — |
| C09 | **fail** | code names Item Piles (:172), no relationship | step 9 (`recommends`) |
| C10 (warn) | **warn** | `journal.mjs` 606/150 | steps 3–5 |
| C11 | pass | `journal-core.mjs` is pure (81 checks import it bare) | keep |
| C12 | **fail** | `MOD` at journal-core.mjs:27 and journal.mjs:37; no `MODULE` | step 2 |
| C13 | pass | | — |
| C14 | **fail** | no kit | step 1 |
| C15, C16, C17 | pass | | keep |
| C18 | **fail** (scorer quirk) | `journal-core.mjs: no install, uninstall` — the entry's `import * as core` (:35) makes the scorer treat the core as a feature, though C15 exempts `-core.mjs` | step 5: the entry uses named imports; `import * as core` moves to `api.mjs`. See §8 |
| C19 | pass | emits nothing | — |
| C20 | **fail** | | step 1 |
| C21 | **fail** | `game.settings.get` at :62, :168, :200, :520; `register` at :530, :536, :542 | step 3 |
| C22 | **fail** | no `SETTINGS` | step 3 |
| C23 | pass | | — |
| C24 | **fail** | bare `catch {}` at :571 (`activateNote`) | step 5 |
| C25 | pass | all lines carry `${MOD} \|` | keep the texts |
| C26 | **fail** | `setTimeout(…, 0)` around publish (:597) | step 6 |
| C27, C28 | **fail** | | step 6 |
| C29 | n/a | writes JournalEntry/Page flags, not actor/token flags | optional `inspect(userRef)` in §4 |
| C30 | **fail** | `CONFIG.queries["pentaryn-journal.ensure"] = async …` (:547–551) is not `guarded` | **blocked**: it is a *player relay* (the sender is a player by design); the kit's `guarded` rejects non-GM senders. §8 |
| C31 (manual) | manual | `ensure` rejects with `Error("GM only")`; `add`/`status` return null for four reasons | documented as legacy rows (step 6) |
| C32, C33 | pass, n/a | | — |
| C34, C35, C36 | pass | nested lang, 100 % definite | keep: literal keys |
| C37 | **fail** | 18 selectors use `.pj-…` without a declared prefix | step 9 declares `cssPrefix: "pj-"` (no CSS edit needed: every selector then matches `.pentaryn-journal` or `.pj-`; grep 2026-10-10: no other module uses `pj-`) |
| C37w, C38 | pass, n/a | | step 9 |
| C39 | pass | | — |
| C40 | **fail** | missing core, glue, hooks, api, i18n tests | steps 1, 6 |
| C41 | **fail** | | step 2 |
| C42 | n/a | the suite is synthetic by policy (README) | keep |
| C43 | **fail** | `test/run.mjs` is a self-running suite | step 1 (`LEGACY`) |
| C44, C45 | **fail** | | step 8 |
| C46 | **fail** | no route in `context/foundry/README.md` (`items-journal-37` a) | step 8 |
| C47 | **fail** | no adjustments row for Item Piles | step 7 |
| C48, C49 | pass | | keep |
| C50, C51 | n/a | | steps 3, 6 |
| C52 | pass | | — |

---

## 2. Target layout

```
foundry/module/pentaryn-journal/
  module.json               unchanged until step 9
  journal.mjs               ENTRY (~80): file map, Hooks.once("init"), install(personal, bar), Hooks.once("ready")
  journal-core.mjs          PURE (exists): + MODULE etc., isPersonal, isMine, placeFrom, barVisible,
                            itemBarVisible, singlePage
  settings.mjs              SETTINGS (gmButton, singlePageReadables, folderName), setting(), whenChanged()
  personal.mjs              FEATURE: personal journals — lookup, folder, ensure*, report, the relay; ready + createUser
  sources-adapter.mjs       ADAPTER: Item Piles copy lookup, descriptors, targets, shouldShowBar/ItemBar, isEyeReadable
  bar.mjs                   FEATURE: the bar, saving, highlight, single-page, provenance; render/CRUD/activateNote hooks
  api-manifest.mjs, api.mjs personal, add, status, open, shouldShowBar, ensure, ensureAll, report, core.*, selftest
  lib/, test/, lang/en.json, styles/journal.css (step 9), README.md, CHANGELOG.md
```

| Old (snapshot lines) | New file | Notes |
|---|---|---|
| 1–33 header | README; entry keeps a file map | |
| 35 `import * as core` | entry: named imports; `api.mjs`: `import * as core` (C15 exempts `-core.mjs`) | C18 quirk |
| 37 `MOD = core.MOD`; core :27 `MOD` | core `export const MODULE = "pentaryn-journal"` | the API's `core.MOD` stays published (see step 6) |
| 38 `QUERY` | core | `"pentaryn-journal.ensure"` verbatim |
| 39–41 `OWN`, `esc`, `warn` | `esc` → `sources-adapter.mjs` (used at :224 inside the hashed item body — keep it `foundry.utils.escapeHTML`, `items-journal-32`); `warn` → local `toast` in each feature (`items-journal-36` rename) | |
| 44–58 `flagsOf`, `isPersonal`, `isMine`, `personalsOf` | `flagsOf`/`isPersonal`/`isMine(entry, userId)` → core (pure on their argument); `personalsOf`/`personal` → `personal.mjs` | |
| 61–160 folder, `createPersonal`, `ensureFor`, `ensureAll`, `report`, `ensurePersonalJournal` | `personal.mjs` | `folderName()` reads `ctx.setting("folderName")` |
| 162–202 `shouldShowBar`, `pileData`, `isPile`, `itemSource`, `shouldShowItemBar` | `sources-adapter.mjs`; the boolean decision → core `barVisible` / `itemBarVisible` (`items-journal-34`); `gmButton` is passed in by the caller (adapters may not import settings) | |
| 204–260 `resolverFor`, `embeddedLabel`, `pageDescriptor`, `itemDescriptor`, `targetFor`, `descriptorsFor` | `sources-adapter.mjs` | verbatim |
| 262–292 `lastNote`, `provenanceFor`, `provenanceLabels` | `bar.mjs` (the state stays beside its writer, the `activateNote` hook); `place` expression (:280) → core `placeFrom({navName, folderName})` | |
| 294–465 `save` … `refreshBars` | `bar.mjs` | `personal()`/`ensurePersonalJournal()` reached through `ctx.exposed` (features may not import each other) |
| 466–502 `targetOf`, `apiAdd`, `apiStatus`, `apiOpen` | `targetOf` → adapter; the three API wrappers → `api.mjs` over `ctx.exposed` | |
| 505–523 `personalSheet`, `isEyeReadable`, `applySinglePage` | `isEyeReadable` → adapter; `applySinglePage` → `bar.mjs` with the decision in core `singlePage({…})` | |
| 529–545 settings | `settings.mjs` rows | literal keys unchanged (step 3) |
| 547–551 query relay | `personal.mjs` `registerRelay()`, called from the entry's `onInit` | handler body verbatim |
| 554–563 ready (ensureAll), createUser | `personal.mjs` `install` | |
| 566–593 activateNote, render hooks, close, CRUD, updateItem | `bar.mjs` `install` | same order |
| 595–605 publish | entry `onReady` | step 6 |

**Hook sequence to keep** (stub recording, 2026-10-10; `golden/hooks.json`):
`once:init, once:ready, on:createUser, on:activateNote, on:renderJournalEntrySheet, on:renderImagePopout, on:renderItemSheet5e, on:closeJournalEntrySheet, on:createJournalEntryPage, on:updateJournalEntryPage, on:deleteJournalEntryPage, on:createJournalEntry, on:deleteJournalEntry, on:updateItem, once:ready`.
Entry: `Hooks.once("init", onInit)`, `install()` (personal then bar, synchronously in the entry body),
then `Hooks.once("ready", onReady)` — so the GM's `ensureAll` still runs before publish, as today.

---

## 3. Steps

Gate after each step: `make foundry-journal-check`, `node test/run.mjs`, `vendor.py check journal`,
`conformance.py --module journal`. Steps 2–8 leave `git diff --stat -- test/golden test/*.test.mjs` empty.

### Step 1 — Characterise (tests and goldens only; checkpoint)

Clears C14, C20, C40 (core/glue/hooks/i18n), C43.

1. `vendor.py sync journal --tier full`.
2. `git mv test/run.mjs test/legacy-core.mjs`; fixed `test/run.mjs` with `LEGACY = ["test/legacy-core.mjs"]`
   (still `✓ pentaryn-journal core: 81 passed`).
3. `test/fixtures/legacy-journal.mjs` — verbatim glue oracles as pure functions of booleans:
   `shouldShowBar` body (:167–169), `shouldShowItemBar` (:198–201), the `place` expression (:280),
   the single-page condition (:520–521). (`items-journal-34`.)
4. `test/core.test.mjs`:
   - Exhaustive truth tables (≤ 2^7 rows) comparing the oracles with the core functions added in step 2:
     `barVisible({isJournalEntry,isPersonal,inPack,isGM,gmButton,observer,owner})` — GM+gmButton false → false;
     GM+gmButton true → true; player observer∧¬owner → true; owner → false; personal → false; inPack → false;
     not JournalEntry → false. `itemBarVisible({hasSource,canInspectItems,isGM,gmButton,observer,owner})` —
     `canInspectItems:false` → false even for a GM. `singlePage({isGM:false,setting:true,isPersonal:false,isEyeReadable:true,visiblePages:1})` → true;
     `visiblePages:2` → false; `isGM:true` → false. `placeFrom({navName:' Old Gate ',folderName:'F'})` → `'Old Gate'`;
     `({navName:'   ',folderName:'F'})` → `'F'`; `({})` → `null`.
   - `escapeHTML` pin (`items-journal-32`): `` core.escapeHTML(`<a href="x">'&"</a>`) `` === `'&lt;a href=&quot;x&quot;&gt;&#39;&amp;&quot;&lt;/a&gt;'`.
   - `isPersonal`/`isMine` on `{documentName:'JournalEntry', flags:{'pentaryn-journal':{kind:'personal',userId:'u'}}}` and hostile shapes (`null`, no flags, wrong kind).
5. `test/glue.test.mjs` — `installFoundry` with a GM (active) user and two players, an empty
   `game.journal`, `JournalEntry`/`Folder` create stubs, `lang` = `lang/en.json`; import the entry:
   - `fire("init")` → three `game.settings.register` calls, options pinned exactly (keys
     `PENTARYN_JOURNAL.settings.gmButton.name/hint`, `PENTARYN_JOURNAL.settings.singlePage.name/hint`,
     `folderName` with no labels, scopes/types/defaults); `CONFIG.queries["pentaryn-journal.ensure"]` is a function.
   - Relay: called on a non-active-GM client → rejects `Error('not the active GM')`; on the active GM with
     `{user: player}` → resolves `{entryId}` and `F.calls` shows one Folder create then one JournalEntry create
     named from `PENTARYN_JOURNAL.journalName` (`game.i18n.format`, character name else user name),
     ownership `{default: NONE, [player]: OWNER}`, flags `{'pentaryn-journal': {kind:'personal', userId}}`.
   - `fire("ready")` on the active GM → `ensureAll` creates one journal per player; `report()` shape pinned
     (`{folder, users:[{user,userId,isGM,journalId,pages,duplicates}], atRoot}`); one tick later
     `Object.keys(game.pentaryn.journal)` is `['personal','add','status','open','shouldShowBar','ensure','ensureAll','report','core']`
     and `Object.keys(game.pentaryn.journal.core)` is pinned (`golden/core-keys.json`, 18 names incl. `MOD`).
   - `createUser` (player) on the active GM → one ensure; on a non-active GM → nothing.
   - `add(entry)` as GM with `gmButton:false` → `null` (`items-journal-35` premise); `status(entry)` → `null`.
   - `activateNote` with a note whose `document` getter throws → no throw, no console output (today's `catch {}`).
   - A render hook whose `decorate` throws → one `console.warn('pentaryn-journal | bar skipped', err)`.
   - Setting `onChange`: changing `gmButton` schedules `refreshBars` (debounced; `t.mock.timers`).
6. `test/hooks.test.mjs` → the sequence in §2. Drop the template's lifecycle-only assertion.
7. `test/i18n.test.mjs` → every literal `PENTARYN_JOURNAL.*` key in the source exists in `lang/en.json`.
8. `GOLDEN_UPDATE=1 node test/run.mjs` on unchanged code; green; **checkpoint** (agent commits).

### Step 2 — Core additions and `MODULE` (behaviour-neutral)

Absorbs `items-journal-34`. Clears C12, C41.

- core: `export const MODULE = "pentaryn-journal"` replaces `export const MOD = …` (C12 counts any
  `const MOD =`), plus `export { MODULE as MOD };` — the legacy suite destructures `MOD` from the core
  (test/run.mjs:14, used at :154–156) and the API publishes `core.MOD`; an export alias is not a second
  definition. Add `SHORT`, `NS = "journal"`, `VERSION = "0.1.0"`, `CONTRACT = "pentaryn-journal/api@1"`,
  `I18N = "PENTARYN_JOURNAL"`, `CSS = "pj-"`, `HOOKS = {}`, `QUERY`; `flagsOf`, `isPersonal`,
  `isMine(entry, userId)`, `placeFrom`, `barVisible`, `itemBarVisible`, `singlePage`.
- Glue gathers the booleans with the permission calls kept verbatim (`testUserPermission(user, "OBSERVER")`, …)
  and calls the core.
- `core.test`: oracle tables now also run against the core; `VERSION === module.json.version`.

### Step 3 — `settings.mjs` (behaviour-neutral)

Clears C21, C22, C51 (with the lang addition below).

- Rows with **literal** keys exactly as today (D4): `gmButton` (`PENTARYN_JOURNAL.settings.gmButton.name/hint`),
  `singlePageReadables` (`PENTARYN_JOURNAL.settings.singlePage.name/hint` — the key path differs from the
  setting key; literal rows make that fine), `folderName` (`config:false`).
- C51 needs labels on every non-store row: add `PENTARYN_JOURNAL.settings.folderName.{name,hint}` to
  `lang/en.json` (reload only; the row is `config:false`, so nothing visible changes).
- `onChange` reaches features through `whenChanged(key, fn)` exported by `settings.mjs` (a callback map
  the rows call); `bar.install` registers `whenChanged("gmButton", () => refreshBars())` and
  `whenChanged("singlePageReadables", …)` with the :540 loop body verbatim. Settings never import a feature (C16).
- `setting(key)` (`settingReader`) replaces the four `game.settings.get` reads. Its try/catch fallback to
  the row default only differs if a read happened before `init` — unreachable today.
- Glue pins from step 1 (register options, onChange → refresh) must not move.

### Step 4 — `sources-adapter.mjs` (behaviour-neutral)

- Move the adapter rows of §2 verbatim. `shouldShowBar(entry, user, {gmButton})` and
  `shouldShowItemBar(src, user, {gmButton})` take the setting as an argument.
- `esc` stays `foundry.utils.escapeHTML` for the item image (:224) — swapping it would change the hashed
  body and so the saved/changed status of items whose image path has an apostrophe (`items-journal-32`).

### Step 5 — Features and entry wiring (behaviour-neutral)

Clears C18, C24, C10.

- `personal.mjs` (`install(reg, ctx)`: `reg.once("ready", …)` :554–558, `reg.on("createUser", …)` :560–563;
  `ctx.expose({personal, personalsOf, ensurePersonalJournal, ensureFor, ensureAll, report, findFolder})`;
  `export function registerRelay()` = :547–551 verbatim). `bar.mjs` (`install`: the :566–593 hooks in order;
  `ctx.expose({save, openSaved, savedStatus, refreshBars, applySinglePage})`). Both export `uninstall()`
  (`bar` clears `pending`, `lastNote`; `personal` clears `gmInflight`).
- Entry: `Hooks.once("init", onInit)` (`registerSettings()`, `personal.registerRelay()`), `install()`,
  `Hooks.once("ready", onReady)`. Named imports only.
- C24: `catch {}` (:571) → `catch (err) { ctx.log.debug("activateNote: provenance not recorded", err); }` —
  silent unless `CONFIG.debug["pentaryn-journal"]` (absorbs that part of `items-journal-36`).
- `golden/hooks.json` must not change; every glue pin green.

### Step 6 — API through the manifest; publish via the kit (D2)

Clears C26, C27, C28, C40 (api), C50.

- Rows (all `legacy: true`, first params `resolve: false` — they take a Document of several kinds or a User):
  `personal(user?)` → `JournalEntry|null`; `add(doc)` → `{journal,pageIds,created,updated}|null`
  (`writes`, `nullWhen: "no target, no journal, nothing visible, too large"`); `status(doc)` →
  `"none"|"partial"|"saved"|"changed"|null`; `open(pageId?)`; `shouldShowBar(entry, user?)` (impl passes
  `{gmButton: setting("gmButton")}`); `ensure(user)` (`gm:true`, `writes`, rejects `Error("GM only")`);
  `ensureAll()` (`gm:true`, `writes`, `null` for a player); `report()` (read, **ungated** — the README's
  "GM only" is wrong, `items-journal-37` b); `selftest`.
- `core`: `unlisted` paths `core.<name>` for exactly the 18 names pinned in `golden/core-keys.json`, with
  `core.MOD` = `MODULE`. Build them from an explicit list, never by passing the module namespace object:
  `buildApi` deep-freezes members, and `Object.freeze` on an ES module namespace **throws**
  (`Cannot redefine property`, verified in node 2026-10-10) — the API would never publish. New core
  exports (`barVisible`, …) are not added to `journal.core` (surface pinned).
- `onReady`: `buildApiFor(ctx)` first, then `publishNamespace("journal", api, {moduleId: MODULE})` synchronously.
  The step-1 publish pin changes only as D2 allows (present at `ready` rather than a tick later; frozen;
  `module.api`); commit message `[declared] publish via kit (D2)`.
- `api.test`: rows ↔ impl; describe/surface goldens; `ensure` as a player rejects; `add` as GM with
  `gmButton:false` → `null`.

### Step 7 — `foundry/adjustments.yml` row (metadata, batched)

Absorbs the journal part of `items-journal-29`. Clears C47.

- Row `journal-itempiles-preview-copy`: modules `[pentaryn-journal]`, packages `[item-piles]`, files
  `[foundry/module/pentaryn-journal/sources-adapter.mjs]`, markers `["pileData", "canInspectItems"]`
  (code literals; `renderReadOnlyItemPreview` appears only in a comment), `check: make foundry-journal-check`,
  manual check "open an item in an eye pile as a player: the bar shows; Add saves the pile's real item".
  Appended in the one batch while the file is idle.

### Step 8 — Docs and routing

Absorbs `items-journal-37` (a, b, c, e) and `mcp-fork-24`'s naming of the relay contract. Clears C44, C45, C46.

- README in use-doc §7 order; *Settings* documents `folderName`; *API* gives the return shapes of `add()` and
  `report()` and says `report()` is ungated; *Two sessions / who writes* names the **player-relay
  contract**: the sender may be a player, the active GM's client does the write, the payload is ignored,
  the query can create only the sender's own journal (`mcp-fork-24`). The 2026-10-07 section (:49–57) → CHANGELOG.
- `context/foundry/README.md` "Route by task": `| Player journals, the Add to my journal bar, a missing or duplicate personal journal | ../../foundry/module/pentaryn-journal/README.md |`.

### Step 9 — Wave 7 `module.json` batch item (restart)

- `flags.pentaryn = {flagScope:"pentaryn-journal", generation:14, tier:"full", namespace:"journal", cssPrefix:"pj-", afterSync:[…]}`.
- `relationships: {systems:[{id:"dnd5e", type:"system", compatibility:{minimum:"6.0", verified:"6.0.6"}}], recommends:[{id:"item-piles", type:"module", reason:"the bar on items opened from eye piles"}]}`
  (`items-journal-37` d; C09). Foundry then warns if dnd5e is absent — the only setup where the module half-works anyway.
- `styles: ["styles/journal.css"]` + move the file (C06w).

---

## 4. Findings that stay standalone

| Finding | Kind | Notes |
|---|---|---|
| `items-journal-33` | performance (live check) | sanitize memo keyed `${page.uuid}\|${page._stats?.modifiedTime}\|${embeddedLabel}` (bounded 64); gate `updateItem` refreshes on `needsItemRefresh(kinds)`; `personal()` once per `fillBar`. Tests: `makeMemo` equals `sanitize` over the existing fixtures, a second call does not recompute, size ≤ max; `needsItemRefresh(['entry','image'])→false`, `(['entry','item'])→true`, `([])→false` |
| `items-journal-38` | performance (live check) | core `pinnedEntryIds(scenes)` (deliberate copy of dropbin's); cache invalidated on createNote, updateNote, deleteNote, createScene, deleteScene. Fixtures from `items-journal-24`; `makePinnedCache` invalidate case; 50 seeded random layouts equal the old `some/some` predicate for every non-empty id |
| `items-journal-35` | additive API | `entriesOf(userRef)` (core `entryRows`, key order `[pageId,name,key,place,savedAt,updatedAt,hash]`), `statusFor(doc, userRef)` bypassing the bar gate, `lastReason`. New rows, no change to existing returns |
| `items-journal-36` (rest) | console breadcrumbs | `skipReason({journal, sources, plan})` in core (`'no-journal'`/`'nothing-visible'`/`'too-large'`/`null`) and one `console.info` per skipped add; `warn` → `toast` rename (4 sites :144, :149, :309, :425 + definition) can ride step 5 |
| `items-journal-32` | on-screen entity spelling only | `barEsc = core.escapeHTML` for the bar strings in `fillBar` (:388–402) only; rendered text identical. Test: every bar string from `lang/en.json` round-trips through a 5-entity decoder |

## 5. Declared behaviour changes — live test

| # | Change | How to see it |
|---|---|---|
| D-J1 | API published at `ready` (not a tick later), frozen, `module.api` canonical (step 6) | `game.pentaryn.journal.describe().version === "0.1.0"`; `game.pentaryn.journal.report()` as before; a player can Add from an eye readable |
| D-J2 | `relationships` added (step 9) | after the restart, the module enables without a warning on the dnd5e world |
| D-J3 | (standalone `-33`, `-38`) bar refresh gating and the pinned-note cache | edit a world item while a readable bar is open (bar does not flicker); edit an eye readable's page (bar flips to *Update my copy*); move/delete a scene Note pin and reopen its readable (single-page decision follows) |
| D-J4 | the relay runs through the kit's `relayed` (`5b79802c`): a client that is not the active GM answers `NOT_GM: this client is not the active GM` | nothing on screen; a player with no journal (delete theirs) clicks Add with the GM online → journal made, copy saved |
| D-J5 | -40 claim first (`f97e9f74`): with the MCP bridge tab and a GM browser tab both open, one player's relayed ensure makes one journal | delete a player's journal, keep both GM tabs open, player clicks Add → `report()` shows one journal, no `duplicates`; the sender's User's `flags.pentaryn-journal.claims.ensure` is empty (`{}`, no socket-id keys; the empty `claims.ensure` object itself stays — each tab deletes only its own leaf, since deleting the parent would race another tab's stamp; `test/claim-leftover.test.mjs`) |
| D-J6 | `inspect` takes an Actor or Token too (review fix): the player whose assigned character it is, `null` when nobody's. The kit's root `game.pentaryn.inspect(ref)` resolves an Actor and passes it to every namespace, so before this journal answered `{error: "BAD_ARGS: expected User, got Actor"}` and the blueprint's live smoke `inspect(knownActor)` failed for journal | `game.pentaryn.inspect(<a player's character>).journal.user.id` is that player, no `error`; `game.pentaryn.inspect(<an NPC>).journal === null`; depth ≤ 4 |

## 6. WAIT

No. The journal touches no file of combat, transform or aoe.

## 7. Effort

Step 1 ~0.75 day (relay and ensure flows need careful stubs), steps 2–6 ~1 day, steps 7–8 ~0.25 day.
**~2 days.**

## 8. Blueprint gaps found while planning

- **No kit helper for a player relay (C30).** `queries.mjs` offers only `guarded` (GM sender required).
  Journal's `ensure` (and riders' relay, per `mcp-fork-24`) must accept a player sender and run on the
  active GM. Proposal for the kit owner (a kit change, not part of this migration): `relayed(fn, {activeGM:true})`
  in `queries.mjs` — rejects with `NOT_GM: this client is not the active GM` on any other client, passes
  `ctx.user` to `fn`, never reads the payload unless the row says so; a manifest row flag `relay: true`.
  When it lands, switching journal is a small **declared** change (error text `not the active GM` →
  coded `NOT_GM: …`; the player's client only checks for "timed out", so no on-screen change).
- **C18 vs C15 on `-core.mjs`.** `feature_files()` counts the entry's `import * as` of a `-core.mjs` as a
  feature; C15 exempts it. Either exempt `-core.mjs` in `feature_files` or forbid `import * as core` in
  entries outright.
- **C03 misses dnd5e use** through `renderItemSheet5e` and `system.identified`; worth adding `ItemSheet5e`
  and `system.identified` to its pattern.
- **C07's note** says "Wave 7 data migration" for any flagScope mismatch; for journal (and attunement,
  dropbin) the code already uses the module id — the fix is metadata only.

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | **85.4 % (41/48)** in code, `conformance.py --module journal`, 2026-10-11 (wave start 57.8 %, 26/45). Not yet synced or live-tested (code phase only) |
| Date | 2026-10-11 (workflow 2, journal lane; wave 1 froze the checkpoint) |
| Commits (characterisation) | `050f06b` (kit), `f830067` (checkpoint), `1b122e5` (README report() ungated) |
| Commits (refactor, steps 2–6, 8) | step 2 `7dc5fce8` + follow-up `526d1aa8` (core rules read their facts lazily: 7dc5fce8 destructured the getters, so `shouldShowItemBar(null)` threw — behaviour-only red range `7dc5fce8..526d1aa8`, every suite green) · step 3 `f2df3db3` · step 4 `9bb8d560` · step 5 `93dc1a56` · step 6 `dbd56638` [declared] + `946a6dd4` (api.test, describe/surface goldens) · step 8 `b615d9d8` |
| Commits (standalone findings) | -32 `8bce2b4a` · -36 `26e9df02` (rest; the catch and the toast rename rode step 5) · -35 `0fe84b85` · -33 `d595451e` [declared] · -38 `cac07643` [declared] · hardening tests `a3731712` |
| Commits (declared fixes after the refactor) | C30 relay through the kit's `relayed` `5b79802c` [declared] · -40 KNOWN pin `d8bfe157`, fix `f97e9f74` [declared] (+ manifest flag `792f57fb`, stamp-failure fallback `79155a74`) |
| Declared changes handed to the live-test workflow | D-J1 (publish at ready, frozen, module.api) · D-J3 (-33 refresh gating, -38 pin cache) · D-J4 (relay refusal text `NOT_GM: …`) · D-J5 (one journal with two GM tabs) — see §5 and the wave-2 report |
| Frozen tests | `git diff f830067 -- test/` touches one frozen file, `glue.test.mjs`, at two named pins: the publish-timing pin (`dbd56638`, D-J1) and the relay-refusal message (`5b79802c`, D-J4). Every golden is unchanged; everything else under `test/` is new |
| `module.json` edits appended to `wave7-restart-batch.md` | no — returned to the integrator (shared file): step 9 as written |
| Adjustments rows appended to `adjustments-batch.md` | no — returned to the integrator; the row id is `itempiles-journal-preview-copy` (D2 prefix rule), not `journal-itempiles-preview-copy` |
| Still failing, and why | C03, C07, C09, C37 (+ C06w warn): the Wave 7 `module.json` batch (step 9). C47: the adjustments row (step 7, batched). C51: `folderName` has no label — adding one moves the frozen `settings-register` pin (Open for Joe). C56: the relay is still assigned by hand (wrapped by `relayed`, so C30 passes): the kit's `registerQueries` drops the query context, so a manifest relay row cannot see the sender (kit gap, returned to the integrator) |

**Deviations from this guide, and why.**
- Step 3: `folderName` kept unlabelled — the guide's lang keys would change the frozen register pin.
- Step 6: the core rules are not destructured (laziness, see the step-2 follow-up).
- -38: the five invalidation listeners register on the first single-page decision, not at load, so the
  frozen load-time manifest (`golden/hooks.json`) is unchanged; `uninstall()` removes them.
- -40: claim first, but not with `lib/election.mjs` `claimDocument`: its 750 ms settle timer would hang
  the frozen single-tab relay pin under mocked timers, and its key is single-use per document (the
  sender's User is long-lived and the request repeatable, §5.9.2). The fix uses a first-stamp claim on
  the sender's User (`core.claimWinner`: a tab receives every earlier stamp before its own reply, so
  only the first stamper sees no other fresh stamp), no timer on the winner's path; the loser waits
  (bounded, 7 s) for the winner's journal and answers with it; each tab removes its stamp.
