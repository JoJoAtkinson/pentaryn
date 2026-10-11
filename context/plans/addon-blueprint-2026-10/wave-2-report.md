# Wave 2 report (addon blueprint migration, workflow 2)

**Read this when:** you are bisecting or reviewing wave 2 (branch `migrate/wave-2`), or picking up
something left open for Joe. Not instructions for operating any module.

## Step 1 — kit bump 1.0.2 (J6, J10, J16; decided 2026-10-11)

Code phase only; nothing live was touched. Kit 1.0.1 → **1.0.2**.

| Item | What changed | Commit |
|---|---|---|
| J6 | `test-kit/foundry-stub.mjs` defines `globalThis.logger` (Foundry's `logger = console`), saved and restored like the other globals; every call lands on `F.logged` as `{ level, args }`. The shim's `logCompatibilityWarning` goes through it too. New kit test. | `c69104f3` |
| J16 | `patch.mjs`: a handle's `unwrap()` undoes the patch once and drops the record (a second call is a no-op; a route unregisters once), so the same marker can wrap again. When another wrapper sits on top and the direct route cannot restore, the record stays (the patch is still live). `unwrapAll` unchanged. Two new kit tests. [declared] | `6d8f0f22` |
| J10 | `publish.mjs`: the COMPAT frozen-root guard and `realiasTick` are gone; a frozen `game.pentaryn` now throws a `TypeError`. The kit test that pinned the COMPAT block is replaced. Playbook §5.1 and the kit README drop the option. [declared] | `8f9ee627` |
| bump | `kit.json`, `KIT_VERSION`, every header; README changelog | `822a97c1` |

**Re-vendored** (`vendor.py sync --all`, one commit per module): names `993677e3`, pings `f805bb63`,
cursors `2a55cef3` (each [declared]: the one test that pinned the kit's frozen-root rebuild is flipped
in the same commit), importer `9fd2b39d`, ties `ac307386`, lookup `51695e7d`, movement `1241a405`,
walls `bf640386`, attunement `79977983`, journal `1fcbb7cb`, dropbin `a2274877`, prompts `873dab7b`.
Ties' local logger stub (`8ad6a23`) duplicated the kit's and is removed: `d0948f91`.

**Module guard copies retired** (one [declared] commit each; only the spread-rebuild branch, the
one-tick deferrals stay for each guide's own declared publish-timing step): ties `de2dad7a`,
movement `494b713d`, attunement `fd564cc5`, journal `6e94901e`, dropbin `7cacec51`, prompts
`47120a6d`, lookup `e6b66580` (flips glue load order (b) to an extensible root; new load order (c)
pins the frozen refusal), walls `3d044626` (flips glue (b)+(d) to an extensible root).

**Frozen tests touched** (all in [declared] commits, all pinned the frozen-root COMPAT behaviour):
names `test/glue.test.mjs` + `test/golden/root.json` (three frozen load orders: root left as it was,
the refusal reported by Hooks), pings `test/glue-root.test.mjs` ("before" uses the extensible root),
cursors `test/publish.test.mjs` (frozen case → refused), lookup and walls `test/glue.test.mjs` as above.
No other test or golden changed. Correction: `993677e3`'s message says "no other golden changed";
its `golden/root.json` is the flipped pin itself.

**Results at `3d044626`:** `node foundry/lib/test/run.mjs` 82/82. Module `node test/run.mjs`, all exit 0:
importer 92, names 45, pings 64, cursors 55, lookup 21 + 43 legacy, movement 121 + 89, walls 126
(2 KNOWN todo, as baseline), attunement 30 + 35 fixtures, journal 26 + 81, dropbin 38, ties 16 + 183
+ 9, prompts 17 + 415. `vendor.py check --all` green (12 modules, 7 skipped without a lock).
Conformance unchanged from the wave-2 baseline / wave-1 report for all twelve. `pytest -q` 866
passed, 2 skipped, 4 xfailed. `check_context.py` OK (warnings only, pre-existing).

**Known red range:** `vendor.py check` (advisory) is red for a module from `c69104f3` (the kit's
bytes change) until that module's re-vendor commit; module tests stay green throughout.

**Notes for later steps**
- `feature/pentaryn-feedback` (new module, not merged) vendors kit 1.0.1; it needs
  `vendor.py sync <module>` (and its tests re-run) when it merges.
- Guard removal shifted a few lines in movement, attunement, journal, dropbin, prompts, lookup,
  walls and ties; guides re-locate anchors by text.
- walls has no module-level test of the frozen refusal: its ready hook is async, so the throw is an
  unhandled rejection that `node:test` would fail on; the kit test, lookup (c), names and cursors pin it.

## walls — guide steps 2–10, code phase (2026-10-11)

walls is off in Joe's world: unit tests and static gates only; nothing synced. Guide Result row:
[`migrate-pentaryn-walls.md`](migrate-pentaryn-walls.md) §Result; audit status:
[`../code-audit-2026-10/walls.md`](../code-audit-2026-10/walls.md) §Status.

| Step / finding | Commit |
|---|---|
| 2 core barrel, MODULE | `de35515f` |
| 3 `core/` move + -4 · -7 [declared] · -8 code half · barrel by name (C05) | `3d0daef9` · `9b37264b` (+ `28dd5667`) · `e2520d57` · `36e3abbd` |
| 4 settings/keybinding tables | `eeeeaf6a` |
| 5 actions feature, manifest, entry, kit publish [declared] W-6 | `d06f77ab` |
| 6 empty catch · 7 i18n test + prepared lang | `5224038e` · `d3a07b62` |
| -6 maintainability · -5 performance | `c77d1e21` · `cb3ce91f` |
| 8a -1 [declared] W-1 · 8c -2 [declared] W-3 · 8b -9 [declared] W-2 · 8d -37 [declared] W-4 | `01de2ae2` · `ab859b4c` · `0ae5b96d` · `f06a6b90` |
| 8e -33 `analyze()` · 8f -3 `canonical(r, {extended})` | `08c498bb` · `1d2d196b` |
| 9 README, use-doc `context/foundry/walls.md`, CHANGELOG | `49f1f2eb`, `e6ffa3c7` |
| 10 (pre-batch half) dual-scope read · dormant migration | `90efd463` · `048eca8d` |

**Results at `e6ffa3c7`:** `node test/run.mjs` 197 pass, 0 fail, 0 todo (wave start 126 + 2 KNOWN
todo; both pins flipped). All six check gates green (parse, imports, i18n, node-test, vendor,
conformance — run through `modules.check("walls")`, no make). Kit suite 82/82. Conformance
**71.4 % → 95.6 % (43/45)**; failing C07 and C51 (both Wave 7). Performance (-5, js engine,
`runEngine(rooms(10))`): 3967 → 407 `Array#filter` calls, 4721 → 3121 Sets, median 141 → 121 ms.

**Frozen tests touched** (checkpoint `a8c5c28`): `glue.test.mjs` case (g) flipped KNOWN -1 → works
(`01de2ae2`); `golden/canonical.json` and `golden/backend-drift.json` re-pinned for the levels
fixtures only, and the two `knownWasm` markers removed from `test/fixtures/corpus.mjs` (`ab859b4c`).
Otherwise only import paths (`test/fixtures/engine.mjs` → the barrel) and the guide-prescribed
fixture edits (`kindOf` re-export, a comment). No frozen test went red twice.

**Known red commit:** `9b37264b` — its own new `test/backends.test.mjs` matched its own source
(fixed forward by `28dd5667`); every other test is green there.

**Not mine, seen in passing:** `pytest scripts/tests` has one failure,
`test_update_escalation.py::test_the_real_registry_matches_the_code` (`itempiles-attunement-*`
markers), from the attunement lane's uncommitted work in this worktree. `check_context.py` is red
on the stale Module APIs table (walls, attunement, journal, lookup, movement rows): the integrator's
`make foundry-module-index`.

**Integrator handoff — walls, shared files** (exact edits; the walls lane does not touch these files):

- `wave7-restart-batch.md` Batch 1, walls row, "Code in the same batch" column — replace with:
  `lang/en.json` (-36), rows/toasts to full-key literals; **flag-scope data migration**
  `wall-autocomplete` → `pentaryn-walls` (`migrations.mjs`, GM-only, idempotent; declared B6):
  `core/engine.mjs` `FLAG_SCOPE = "pentaryn-walls"`, the manifest `flagScope` and `flags.writes`,
  and **flip the frozen `test/core.test.mjs:14` FLAG_SCOPE pin to `"pentaryn-walls"`
  ([declared], same commit)**, re-pinning `golden/engine.json`, `golden/backend-drift.json` and
  `golden/describe.json` and the `api.test.mjs` flags case in that commit
  (guide §Result step 10 item 3).
- `wave7-restart-batch.md` "Appended by Record steps", the existing walls row (2026-10-11,
  senses-walls-cursors-8, wave 1 integration; line 64 at `a63d043d`) — **replace it**, do not add
  a second row, so the batch has one instruction for the `description` edit (the Batch 1 walls
  row's "`description` fix (-8)" means this row). New row, verbatim:

  ```
  | 2026-10-11 | walls | `description`: `See playbooks/foundry-wall-autocomplete.md` → `See context/foundry/walls.md` (the use-doc, guide step 9; supersedes the wave-1 target `context/plans/foundry-wall-autocomplete.md`); `verified byte-identical against the same 44 fixtures` → `produces identical geometry, verified against the same fixture corpus` (the setting hint's wording, `test/fixtures/lang-en.wave7.json`) | senses-walls-cursors-8 (wave 1 integration; amended by walls wave 2) |
  ```

## journal — guide steps 2–8, code phase (2026-10-11)

Code phase only; nothing live was touched. Conformance **57.8 % → 85.4 % (41/48)**. Tests: `node test/run.mjs`
→ 88 node:test cases + the legacy core suite (81 checks), all green; `vendor.py check journal` green;
`module-check journal` static gates (parse, imports, i18n, node-test, vendor, conformance) green.

| Step / finding | Commit |
|---|---|
| step 2 core MODULE, constants, visibility rules (-34) | `7dc5fce8`, follow-up `526d1aa8` (see red range below) |
| step 3 settings.mjs · step 4 sources-adapter.mjs · step 5 features + entry (-36 part) | `f2df3db3` · `9bb8d560` · `93dc1a56` |
| step 6 manifest API, publish at ready [declared] D-J1 · api.test + goldens | `dbd56638` · `946a6dd4` |
| -32 · -36 · -35 (+ `inspect`) | `8bce2b4a` · `26e9df02` · `0fe84b85` |
| -33 [declared] · -38 [declared] (D-J3) | `d595451e` · `cac07643` |
| C30 relay via `relayed` [declared] D-J4 | `5b79802c` |
| -40: KNOWN pin · claim-first fix [declared] D-J5 · manifest flag · stamp-failure fallback | `d8bfe157` · `f97e9f74` · `792f57fb` · `79155a74` |
| hardening tests (player side of the relay) · step 8 docs · plans | `a3731712` · `b615d9d8` · `7d17df5d` |
| review fixes: `inspect` takes an Actor/Token [declared] D-J6 · claim leftover wording + pin · step-9 README handoff · §5.9.4 record (W2-J4) | `5df878a6` · `d2181a79` · `2b908397` · `8b8c905f` |

**Frozen tests:** only `glue.test.mjs` changed, at two named pins: publish timing (`dbd56638`, D-J1) and the
relay refusal message (`5b79802c`, D-J4). No golden changed. New step goldens: `describe.json`, `surface.json`.

**Known red range:** `7dc5fce8..526d1aa8` (journal, behaviour only, every suite green): the core rules
destructured the facts the glue passes as getters, so `shouldShowItemBar(null)` threw on any non-pile item
sheet render ("bar skipped" warn). Skip `7dc5fce8` when bisecting journal behaviour.

**Still failing:** C03 C07 C09 C37 (+ C06w): Wave 7 `module.json` batch. C47: the adjustments row.
C51: W2-J1. C56: kit gap below.

**Kit gap (for the integrator; not changed here):** `registerQueries` (kit 1.0.2, `queries.mjs`) builds
`handler = async (data = {}) => …` and drops the query context, so a `relay: true` row's implementation
never sees `ctx.user`, the sender. Journal's relay must know the sender, so it stays a hand-written
`CONFIG.queries[…] = relayed(…)` (C30 passes, C56 fails). A kit 1.0.3 fix: take `(data = {}, ctx = {})`
and pass `ctx` on (e.g. `row.args(d, ctx)` for legacy rows, `fn(d, ctx)` otherwise), plus a kit test that a
relay row's impl receives `ctx.user`. Then journal needs a published row for the relay (W2-J2).

**Integrator handoff — journal, shared files** (exact edits; the journal lane does not touch these files):

1. `adjustments-batch.md` journal row / `foundry/adjustments.yml` (guide step 7): the row id is
   `itempiles-journal-preview-copy` (D2 prefix rule), not `journal-itempiles-preview-copy`; the other fields
   as guide step 7 (modules `[pentaryn-journal]`, packages `[item-piles]`, files
   `[foundry/module/pentaryn-journal/sources-adapter.mjs]`, markers `["pileData", "canInspectItems"]`). Clears C47.
2. `wave7-restart-batch.md` Batch 1, journal row (guide step 9): `flags.pentaryn` (full · `journal` · `pj-`),
   `relationships` (systems dnd5e min 6.0 verified 6.0.6; recommends item-piles + reason),
   `styles: ["styles/journal.css"]` + `git mv foundry/module/pentaryn-journal/journal.css foundry/module/pentaryn-journal/styles/journal.css`
   — **and, in the same commit as the move, the module README's Files table**: the row
   `` | `journal.css`, `lang/en.json`, `lib/` (vendored kit) | | `` (README.md:134 at this commit; :132 before
   D-J6) → `` | `styles/journal.css`, `lang/en.json`, `lib/` (vendored kit) | | ``. Replace the journal row's
   "Code in the same batch" cell (`—`) with:
   `` README.md Files table: `journal.css` → `styles/journal.css` (same commit as the move) ``.
3. `context/foundry/README.md` Module APIs table: regenerate (`make foundry-module-index`); the journal row
   still says "no describe golden yet", and D-J6 changed `describe()` (the `inspect` row).
4. Kit 1.0.3: the `registerQueries` gap above (then W2-J2).

## bridge lane — review fixes (2026-10-11)

Ten review defects, fixed in the fork worktree (`migrate/wave-2`) and here, one commit each, code
phase only (nothing built or deployed; the fork changes ship with the next bridge build):

- `d5ba3c4` the D14 template tests run fork.eval on fake timers and assert no timer is left.
- `6f598fb` [declared] pentaryn-write refuses `dryRun` on a row without one (BAD_ARGS
  `<ns>.<path> has no dry run`): `walls.run` with `dryRun:true` used to run for real. A row
  declares a dry run by `row.dryRun === true` (not in kit 1.0.2, W2-B3) or a param whose type or
  doc names `dryRun` (importer.import).
- `a79f5f3` [declared] pentaryn-read runs only rows with `writes === false` (fail closed).
- `a6fb891` [declared] a call that would fill a param needing a live Document is BAD_ARGS
  ('eval-js only') before it runs: attunement.stash/releaseAway, journal.add/status/statusFor/
  shouldShowBar/ensure, movement.ghostFor, names.sync (W2-B4). Checked against all nine real
  manifests.
- `b8f540f` [declared] a coded query error (NOT_GM from a non-GM bridge tab) keeps its code.
- `81f8bb4` [declared] recharge resolves its actor exactly (id, exact name, token id, then the
  created actor's id) and an `itemId` never falls back to a same-named feature. add-feature sends
  `actorId` beside `actorIdentifier`, not instead of it: a synthetic token actor shares its base
  actor's id, so the id alone would move a token-id recharge onto the world actor.
- `9c845d1` [declared] the recharge outcome rides on the add-feature call's own action-log line
  (`recharge`, with `client` and sanitised args); no second ActionLog.
- `7f6680a` FORK.md's settings.ts row is one row again; `d77c496` `fork:` markers on the new
  upstream hunks, index.ts/add-feature.ts/data-access.ts in the marker table.
- `3fff41d0` [declared] **new finding dnd-roller-flock** (outside python-tooling-51's in-process
  scope): each dnd-scripts server process loaded `quant_numbers.bin` at import and rewrote it from
  its own copy, so two sessions drew the same numbers. Draws now hold an flock on
  `quant_numbers.bin.lock` and re-read the file when another process changed it; a two-process
  test pins it (red before the fix).

## Open for Joe

| # | Item | From | What is needed |
|---|---|---|---|
| W2-K1 | J10's "other modules' guard copies": retired in every module that carries the kit (above). The seven unmigrated modules still carry theirs: creatures, transform, riders, senses (two: `senses.mjs`, `chain.mjs`), aoe, combat, portals. Live it is dead code (nothing freezes the root). Each guide already replaces the block with `publishNamespace` at migration, and riders/aoe/transform/combat are WAIT (in flux), so editing them now risks conflicts with that work. | kit bump | confirm "retire at each module's migration" (default), or ask for one [declared] commit per module now |
| W2-B1 | python-tooling-28 adds two **new** dnd-scripts tools (`foundry_modules`, `foundry_action_log`). The wave rule is "no new features except the approved bridge tools", and the audit itself calls -28 a possible deferred feature. The bridge plan's P7 (`evallog.py` + `make foundry-eval-report`) answers the same questions from the shell. Plan: [`wave-2-bridge-plan.md`](wave-2-bridge-plan.md) §4 P8. | bridge lane plan | yes → P8 lands (read-only, additive); no → close -28 by pointer to P7 |
| W2-B2 | D14 compact read lines (`{ts, tool:"pentaryn-read", ns, path, ref, ok, ms}`) go into `mcp-<YYYY-MM>.jsonl` beside the write lines, told apart by `tool` and the absence of `args`, rather than a third log file; the monthly review and `evallog.py` already read that file. Plan §3.5. | bridge lane plan | confirm, or ask for a separate `reads-<YYYY-MM>.jsonl` (one-line change in F21 and P7) |
| W2-A1 | New concurrency finding in pentaryn-attunement (not in the audit): the `createItem` bond return is gated on the initiator (`userId === game.user.id`), which passes in **every tab** of that user (playbook §5.9.4). With the MCP bridge tab and a GM browser tab open, a GM-made Take of a bonded **coin purse** runs `actor.update(currency + purse)` in both tabs and can pay twice (and `item.delete()` twice); the slot hand-back writes the same values from either tab, so only its toast can double. Recorded in the attunement README (Two sessions); no pin. | attunement lane | fix now as a [declared] commit (vendor kit `election`, `claimMessage`-style claim on the purse item before paying; the purse deletes itself, so a single-use claim key fits), or accept and leave it documented |
| W2-WALLS-1 | walls i18n switch (-36) and the setting-hint fix (-8): the `SETTINGS`/`KEYBINDINGS` labels become `PENTARYN_WALLS.*` keys only together with `module.json` `languages`, and that edits one **frozen pin** (glue (a), the `settings.register`/keybinding label values), as pings needed in J13. The keys and text are ready and tested (`test/fixtures/lang-en.wave7.json`). | walls lane | allow that one pin edit in the Wave 7 batch (a [declared] commit), or leave walls' labels in literal English (C51 stays failing) |
| W2-WALLS-2 | walls cross-tab overlap (§5.9, new, not in the audit): the run lock (-9) is per tab. With the MCP bridge tab and a GM browser tab both open, a `run()` from the bridge while Alt+W runs in the browser could complete the same scene twice (duplicate walls; each run is still undoable on its own). Excluding across tabs needs a new mechanism (a scene-flag lease or claim). | walls lane | accept and document (default; walls is off), or ask for a lease as a [declared] fix |
| W2-WALLS-3 | walls toasts stay raw `ui.notifications.*`, not `log.notify`: the frozen glue pins match the exact options (`{permanent: true}`), and `log.notify` adds `{console: false}` and a console line. | walls lane | accept, or allow the pin edits with W2-WALLS-1 |
| W2-MOV-1 | movement finding -20's **optional** extra: `status().errors`, the labels a hot hook's `warnOnce` has swallowed (`refreshToken`, `renderSceneControls`), appended after `settings`. The finding's required half (warn once, no empty catch) is `d65ddd62`. It adds an API output key (`status.test.mjs` pins the exact key list) and the kit `log` exposes no seen-labels accessor, so it needs either a kit change or module-local tracking; the console line already says it. Skipped as a feature. | movement lane (standalone pass) | yes → one [declared] commit (module-local Set, one pin flip in `status.test.mjs`), or close: the console line is enough |
| W2-A2 | attunement `stash()` shortfall (D-A4, items-journal-10 review follow-up, 73180dfd): the originals are kept and the call rejects, but the copies the container did accept stay there, bonded to the owner, so the item exists twice. The Error now names them (`err.created` and the message); nothing is rolled back. A rollback (`container.deleteEmbeddedDocuments(created)` before throwing) would restore all-or-nothing, but it deletes from a container (an Item Piles pile may react to emptying) and can itself fail. | attunement lane | keep naming only (default), or ask for the rollback as a [declared] commit |
| W2-J1 | journal `folderName` has no settings label, so C51 fails. Adding `PENTARYN_JOURNAL.settings.folderName.{name,hint}` (the guide's step 3) moves one **frozen pin**: `golden/settings-register.json` (`name`/`hint` null → the keys), as pings needed in J13. The row is `config: false`, so nothing visible changes. | journal lane | allow that one pin edit (a [declared] commit), or leave `folderName` unlabelled (C51 stays failing) |
| W2-J2 | journal C56 after the kit gap is fixed: `registerQueries` resolves a query row against the published API, so the relay needs a **published method** returning `{entryId}` (the frozen relay pin) — e.g. a row `ensureOwn` (`queryName: "ensure"`, `relay: true`, `query: true`; the query name the player sends is unchanged). That is a new API member. | journal lane | accept the new member once the kit forwards the sender, or keep the hand-wired `relayed` (C56 stays failing) |
| W2-J3 | journal -40 is fixed claim first, but not with `lib/election.mjs`: `claimDocument`'s 750 ms settle timer would hang the frozen single-tab relay pin under mocked timers, and its claim key is single-use per document while the sender's User is long-lived. The fix stamps `flags.pentaryn-journal.claims.ensure.<socketId>` on the sender's User; the first stamp in server order wins (a tab gets every earlier stamp before its own reply), the loser waits up to 7 s for the winner's journal and answers with it, each tab removes its stamp (its own key only: `claims.ensure` stays as an empty object, so the D-J5 live check looks for no socket-id keys, not for an absent flag). One extra User update per player's first relayed ensure. | journal lane | accept (default), or ask for the deterministic-`_id` alternative (§5.9.2; it needs a folder `_id` too and moves the frozen relay create-data pin) |
| W2-J4 | journal §5.9.4 hits outside items-journal-40 (review; the audit scoped them out, `code-audit-2026-10/journal.md` -40 last paragraph): (a) the `createUser` listener and the ready `ensureAll` (`personal.mjs` `install`) create a JournalEntry, and maybe the `Player Journals` Folder, behind only `game.user.isGM && game.users.activeGM?.isSelf` — true in **every tab** of the GM account — while `gmInflight`/`folderInflight` are per tab. With the MCP bridge tab and a GM browser tab open, a new User gets **two** personal journals (and two folders when the folder is missing); the same when both tabs reach `ready` together after a restart while a player has no journal. Duplicates stay visible in `report().users[].duplicates`; `personal()` uses the oldest, so nothing breaks, but the player owns a stray journal. (b) `ensureAll` awaits one `ensureFor` create per player in a loop (the C59 pattern; C59's scan misses it because the `await` is on `ensureFor`). Not fixed in this wave: every remedy moves a **frozen glue pin** — `glue.test.mjs` pins `createUser` creating at once and `ensureAll` as one `JournalEntry.create` per player. Remedies: createUser → `claimDocument(user, "journal")` (fits: a new User is a one-time event, so the single-use key is right; the 750 ms settle delays the create); ready → deterministic `_id`s (journal `_id` = the user's id, a fixed folder `_id`, `keepId`, look first; §5.9.2) — this also covers createUser; (b) → one `JournalEntry.createDocuments` for every missing player (folder first), keeping `gmInflight` for the per-user path. | journal lane (review) | fix as [declared] commits (one per remedy, each flipping its named glue pin), or keep the audit's out-of-scope decision (default: accept and document; duplicates are reported, not lost) |
| W2-B3 | Kit row field `dryRun: true` (in the `ApiRow` typedef and `describe()`), so a row says it takes a dry run. pentaryn-write already honours `row.dryRun === true`; until the kit emits it, the template accepts a dry run only on a row whose param type or doc names `dryRun` (importer.import today), and refuses it elsewhere (`6f598fb`). | kit lane (bridge review) | yes → kit bump adds the field and importer's row sets it; no → keep the param-text rule |
| W2-B4 | `names.sync(ref, oldName, newName)` resolves a string ref itself (its row doc says so), but its `ref` param is `resolve: false` with no `type`, so pentaryn-write now refuses it as "needs a live Document — eval-js only" (`a6fb891`). A row needs a manifest signal that it resolves strings itself: either a kit field (e.g. a param `resolve: "self"`), or now, with no kit change, a `type` naming the string forms on that param (`"Actor\|Token\|uuid\|id\|exact name"`, as attunement's ACTOR param has), which the template already honours. The second edits names' `describe` golden. | kit lane / names (bridge review) | pick one; until then names.sync goes through eval-js |
