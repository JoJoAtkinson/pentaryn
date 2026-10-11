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

## dropbin — guide steps 2–9 and the standalone findings, code phase (2026-10-11)

Code phase only; nothing synced, no live tool used. Guide Result row:
[`migrate-pentaryn-dropbin.md`](migrate-pentaryn-dropbin.md) §Result; audit status:
[`../code-audit-2026-10/dropbin.md`](../code-audit-2026-10/dropbin.md) §Status.

**PT3-1:** `fix/playtest-2026-10-11` was finished (`fa449fd3`), so it is merged (`931203a5`; one
conflict, names' CHANGELOG, both entries kept) and dropbin's refactor carries `corpses.mjs`'s
PT3-1 code and its `test/corpses.test.mjs` unchanged (green throughout). Nothing to drop at merge.

| Step / finding | Commit |
|---|---|
| 2 cores (-20, MODULE half of -26) · 3 settings · 4 adapters · 5 features + entry (-22) | `1e4214c2` · `27829537` · `8eb60589` · `4ef64cd7` |
| kit guard on every handler [declared] | `146aefce` |
| 6 manifest API, publish at ready [declared] D-D1 · -28 additive (brief, restoreResult, inspect, selftest) | `500f33a0` · `0ac333a2` |
| 7 i18n (-26 strings) | `a1b0ff01` |
| 8 -18 [declared] D-D2 · -21 [declared] · -23 [declared] · -24 · -25 [declared] · -30 [declared] · -19 [declared] · -27 kept | `a3b44685` · `9f43f573` · `4d96d3a8` (+`6273d1e7`) · `eff44a40` · `bae36010` · `c62da821` · `314f49c3` · `4fa0b17a` |
| 9 README, CHANGELOG · §5.9 review: clear through the queue [declared], hot-path guard · coverage gaps · plans | `85f4353f` · `b2320f94`, `34e74e6c` · `f7bebf9e` · `cda968d9` |

**Results at `f7bebf9e`:** `node test/run.mjs` 114 pass, 0 fail + legacy 40 checks (checkpoint: 38 +
40). `vendor.py check dropbin` green; static gates (parse, imports, i18n 17/17, node-test, vendor,
conformance) green. Conformance **60.9 % → 91.7 % (44/48)**; failing C07, C09 (Wave 7 `module.json`),
C47 (adjustments rows, integrator), C50 (scorer gap: it reads only `Hooks.once("ready", …)`, not a
publish from a `reg.once` ready handler). Performance counters: 5 drops in one tick 2 counter + 2 log
writes (was 5 + 5), one mirror upload per burst; Journal sidebar 40 rows × 5 scenes 5 note walks
(was 160); corpse eye disc cleared once per size (was every refreshToken).

**Frozen tests touched** (checkpoint `4b53345`): `glue.test.mjs` only, at named pins, each in its
[declared] commit — publish timing (D-D1), -18 KNOWN, -25 backfill shape, -30 KNOWN, -19 upload
timing and ready line; goldens `ready-console.json` and `backfills.json` re-pinned there. The
`impls.mjs` fixture gained the core (step 2, as its comment said) and `world.mjs` gained
`Actor.implementation.updateDocuments` (-25). No frozen test went red twice.

**Live checks for the gated live phase (L3)** — after a reload (no `module.json` change yet):
`game.pentaryn.dropbin.describe().version === "0.2.2"`, `selftest().ok`; `list(5, {brief: true})`;
console at ready: `ready — N entries on the ledger (~K KB)` (GM). D-D2/-19: as a player drop three
items in one Item Piles drop → three consecutive numbers, `assets/drop-bin/drop-log.json` updates
~2 s later; `restoreResult(n)` on a test item, then `restore(n)` toasts as before. -21: as a player
with no GM online, drop an item → one `ledger entry not recorded (no GM?)` warning, no
"Uncaught (in promise)". -25: with the bridge tab and a GM browser tab on the active GM account, each tab logs
`lock sound set …` once (when there is work; `isSelf` is per user, so both tabs run the idempotent
backfill); a second GM user's tab logs nothing. -30: a corpse's eye still shows/hides while looting and
while the token moves. Locks: a player opens a locked chest from canvas, sidebar and Ctrl-click →
toast + floating *Locked*. PT3-1: kill and revive an unlinked NPC from the HUD → players lose its
sheet. Hot patch: `game.pentaryn.dropbin.uninstall()` then
`await import("/modules/pentaryn-dropbin/dropbin.mjs?v=2")` → `selftest().ok` (socketlib relay
re-registered). No live golden "before" script exists for dropbin (the wave-1 report asked for one
per module): `scripts/foundry/live-goldens/` is shared, so it is listed for the integrator.

**Integrator handoff — dropbin, shared files** (exact edits; the dropbin lane does not touch them):

1. `foundry/adjustments.yml`: `itempiles-corpses` `files` →
   `[foundry/module/pentaryn-dropbin/corpses.mjs, foundry/module/pentaryn-dropbin/dropbin.mjs, foundry/module/pentaryn-dropbin/loot.mjs, foundry/module/pentaryn-dropbin/piles.mjs]`
   (marker `itempiles` stays); `itempiles-rarity-i18n` `files` →
   `[foundry/module/pentaryn-dropbin/i18n-shim.mjs, foundry/module/pentaryn-dropbin/dropbin.mjs]` unchanged
   (the entry installs the shim as a feature now; the marker `ItemRarity` is in both). New rows (guide step 10 with the D2 package prefixes from
   `adjustments-batch.md`; `modules: [pentaryn-dropbin]`, `check: make foundry-dropbin-check`):
   `socketlib-dropbin-relay` (packages `[socketlib]`, files `[…/socketlib-adapter.mjs]`, markers
   `["registerModule", "executeAsGM"]`); `itempiles-dropbin-nan-attunement` (packages `[item-piles, dnd5e]`,
   files `[…/itempiles.mjs]`, markers `["ATTUNEMENT_PACKS", "repairAttunement"]`, `native_when: "Item
   Piles addItems preserves system.attunement"`, `retire_class: guarded`);
   `itempiles-dropbin-container-locks` (files `[…/itempiles.mjs]`, markers
   `["item-piles-preRenderInterface", "item-piles-preRenderActorSheet"]`);
   `itempiles-dropbin-directory-hiding` (files `[…/itempiles.mjs]`, marker `renderActorDirectory`);
   `itempiles-dropbin-svelte-store` (files `[…/piles.mjs]`, marker `appShell`, `retire_class: never`,
   manual check "open a pile, Change recipient, Loot all goes to the new recipient"). Clears C47.
2. `wave7-restart-batch.md` Batch 1 dropbin row (unchanged): `flags.pentaryn` =
   `{flagScope: "pentaryn-dropbin", generation: 14, tier: "full", namespace: "dropbin", cssPrefix: "pd-"}`;
   `relationships.recommends` item-piles (drop capture, corpse piles, Loot all, container locks) and
   itempilesdnd5e (the rarity i18n shim); `requires: socketlib` stays; `compatibility.minimum: "14"`.
   Clears C07, C09, C02. If the batch also bumps `version`, change `VERSION` in
   `foundry/module/pentaryn-dropbin/dropbin-core.mjs` in the same commit (`test/core-barrel.test.mjs`
   pins them equal).
3. `context/foundry/README.md` Module APIs table: regenerate (`python -m scripts.foundry.ops module-index`);
   the dropbin row gains its API cell from the new `describe.json` (check-context is red until then,
   as for walls, attunement, journal, lookup and movement).
4. `scripts/foundry/live-goldens/dropbin.js` (new, optional): the "before"/"after" live golden the
   wave-1 report asks for — `describe()` normalised, `list(3, {brief: true})`, `selftest()`.
5. Blueprint scorer (tooling lane): C50 should also follow `reg.once("ready", …)` handlers and a
   publish reached from one (guide §8).

## Integration — shared files (2026-10-11)

One writer in the worktree; code phase only (no sync, no restart, no live tool, no merge). Each
lane's shared-file list applied, one commit per logical step:

| Commit | What |
|---|---|
| `cd414590` | `foundry/adjustments.yml`: movement's three patch rows (C32); attunement's two file moves and `dnd5e-item-tooltip-anchor` → **`attunement-item-tooltip-anchor`** (the id its `wrapMethod` names); `itempiles-journal-preview-copy`; dropbin's `itempiles-corpses` + `piles.mjs` and five new rows (`socketlib-dropbin-relay`, `itempiles-dropbin-{nan-attunement,container-locks,directory-hiding,svelte-store}`). `adjustments-batch.md` Batch A rows marked landed |
| `e4978110` | `make foundry-module-index` (six rows gain their API cells; mcp-fork-20); README `search()` shape line (`hits`, not `results`); walls routing row → `walls.md` |
| `01fa7cda` | `rules-lookup.md` "What comes back" table (prompts-lookup-2 doc half) |
| `fa9cc7a2` | lookup audit status and guide Result: the two halves landed; 133 tests with `e0e2dd40` |
| `b6f6bcdb` | `wave7-restart-batch.md`: common rule (the afterSync commit deletes the config.py tuple; a `version` bump moves the core `VERSION`); movement `minimum: "14"` + three-line afterSync; walls code column (migration wiring, the frozen `core.test.mjs:14` FLAG_SCOPE flip and its re-pins) and the wave-1 `description` row **replaced**, not duplicated; journal `git mv` + README Files table; dropbin reasons and VERSION pin. **No `module.json` was edited** — every row waits for the one restart |
| `4335d01b` | `walls.md`: a Levels scene's card says `js` (`3ea5249b`) |
| `852b9047` | `config.py` movement ModuleSpec comment (the `after_sync` tuple is untouched until Wave 7) |
| `edc7489a` | new `test_module_checks.py` net: every `context/`/`playbooks/` path a module cites exists (senses-walls-cursors-8 recipe, repo-wide); walls' `module.json` is a strict xfail until Wave 7. Fails on a planted bad cite |
| `5e4866d4` | `packages.json` `privateInternalPatterns` gains `_positionItemTooltip` (items-journal-39 c): attunement's C33 is now listed for manual review |

**Known red ranges closed here:** `check-context` red from walls `d06f77ab` (first wave-2 describe
golden) to `e4978110`; `foundry-adjustments-check` (and `test_update_escalation.py::
test_the_real_registry_matches_the_code`) red from attunement `5f3bf2d5` to `cd414590`.

**Gates at the integration head:** every `foundry/module/pentaryn-*/test/run.mjs` exits 0 — lookup
133, movement 167 (+ 89 legacy), walls 200 + 1 todo (the Wave 7 `module.json` cite), attunement 119
(+ 35 fixtures), journal 94 (+ legacy core), dropbin 118 (+ legacy), names 50, pings 67, cursors 55,
importer 92, prompts 24, ties 16; the unmigrated seven exit 0. `pytest -q` 913 passed, 2 skipped, 3
xfailed. `make foundry-modules-check` all 19 green. `foundry-lib-check` 82/82. `check-context` OK (4
pre-existing warnings). `foundry-adjustments-check` 96 rows OK.

**Conformance (advisory)** — wave-2 baseline → lane end → after integration:

| Module | Baseline | Lane end | Integrated | Still failing (why) |
|---|---|---|---|---|
| lookup | 75.6 % | 97.7 % | **97.7 %** | C07 (Wave 7) |
| movement | 66.7 % | 93.6 % | **95.7 %** | C07, C37 (Wave 7 `cssPrefix`) |
| walls | 71.4 % | 95.6 % | **95.6 %** | C07 (Wave 7 data migration), C51 (W2-WALLS-1) |
| attunement | 67.4 % | 90.9 % | **93.2 %** | C04, C07, C09 (Wave 7 + step 8) |
| journal | 57.8 % | 85.4 % | **87.5 %** | C03, C07, C09, C37 (Wave 7), C51 (W2-J1), C56 (kit gap, W2-J2) |
| dropbin | 60.9 % | 91.7 % | **93.8 %** | C07, C09 (Wave 7), C50 (scorer gap) |

**Not applied (follow-ups, no Joe decision needed):**
- Scorer gaps (`conformance.py`, tooling): C05/C16 do not follow `export … from` barrels (walls
  item 5: `Module.imports` should add `jsscan.exports_of(...)[1]`); C50 does not follow a publish
  reached from a `reg.once("ready", …)` handler (dropbin). Both move other modules' scores, so they
  want their own tooling step with a before/after table.
- Kit 1.0.3: `registerQueries` drops the query context (journal handoff item 4); a kit bump and a
  re-vendor of every kit module, then W2-J2.
- Live goldens (`scripts/foundry/live-goldens/`) for lookup, movement, walls, attunement, journal and
  dropbin do not exist; each "before" run must be taken on the deployed build before the L-session
  syncs. Not written here: an untested live script is worse than none.
- lookup, noticed by its lanes: `names("constructor")` returned a junk one-key object (landed:
  `055586bb`, below); `NAME_SOURCES` is frozen one level deep (harmless today).

## Integration review (2026-10-11)

A second pass over `wave-2-base..HEAD` (and the fork's `pentaryn..HEAD`), code phase only. Checked:
no commit carries `foundry/logs/**` or a secret; no commit touches two modules' trees or another
lane's plan/audit files except the integration commit `bbcdd721`; every commit ends with the
session trailers; each frozen test or golden changed after its module's checkpoint changed in a
`[declared]` commit or as an import/path-only move (lookup's legacy suite became `core.test.mjs`
cases in `f0f70ea8`, 43 → 43); no `.only`, and every new test that schedules a timer runs on
`mock.timers`.

| Commit | Fix |
|---|---|
| `3df15e0f` | transform's `test/kit/foundry-stub.mjs` came in at kit 1.0.1 with the `fix/playtest-2026-10-11` merge (`931203a5`); re-vendored byte-identical to 1.0.2. module-check never compared it: transform has no `kit.lock.json` |
| `055586bb` | lookup [declared]: `names("constructor")` (any `Object.prototype` word) is an unknown kind and answers everything, via `Object.hasOwn` (the follow-up listed above); new `test/names-kind.test.mjs`, 135 tests |
| `7c2aef7b` | `context/foundry/mcp-fork.md`: the bridge plan's P9 second half — the `pentaryn-read`/`-write` table, `fork.applyRecharge`, `timedOut`, the fork's coded `NOT_GM` and `guardBridgeQueries`, kit 1.0.2 in the contracts table. Marked "wave-2 build" |
| fork `213c6c3` | `pentaryn-read`'s description named `rules` as eval-js only; lookup gains `describe()` in this wave, so it now names ties, combat, prompts |

**Per-commit module sweep** (each commit's tree via `git archive`, `node test/run.mjs` for every
module it touches, every module on a `foundry/lib` change; 271 runs): red only at walls `9b37264b`
(`test/backends.test.mjs` matched its own source; fixed forward in `28dd5667`) and pings
`466a3a4f`, `a18872c9` (the PT3-2 repro-first commits on `fix/playtest-2026-10-11`, green from
`7a8701df`). Add these to the known red commits beside the two ranges above.

**Gates after the review:** every module's `test/run.mjs` exits 0 (lookup 135); `pytest -q` 913
passed, 2 skipped, 3 xfailed; `foundry-modules-check` 19/19; `foundry-lib-check` 82/82;
`check-context` OK; `foundry-adjustments-check` OK. Fork: server vitest 275, module vitest 43,
both typechecks, `fork-footprint.sh` green.

**Noted, not changed:** `eslint` on the fork's new `src/fork` files reports 3 errors
(`prefer-template` in `action-log.ts:68` and `pentaryn-write.ts:71`; `no-misused-promises` on the
`setInterval(async …)` moved from `index.ts` into `tool-list-watch.ts:39`, whose body is already
inside try/catch). Style only; lint is not a gate here and upstream files carry dozens.

## Live-phase prep (2026-10-11, code phase — nothing run)

The gated live phase is written down in [`wave-2-live-plan.md`](wave-2-live-plan.md): preconditions,
backup and "before" goldens on the deployed code, the deploy (module syncs, fork build, bridge
module, `kill -9` the broker, one restart), boot probes, "after" goldens with a diff, the
`pentaryn-read`/`-write` smoke, the dropbin ownership-leak scan, per-module rollback and the fix
loop. The live goldens the integration listed as missing now exist (`f9a5ec91`):
`scripts/foundry/live-goldens/{lookup,movement,attunement,journal,dropbin,walls}.js`, each split into
`golden.shared` (must match before/after) and `golden.declared` (the wave's declared changes), plus
`diff.mjs` (`9a7534c4` lets it read the wave-1 goldens). Checked statically only (`node --check`,
eslint `no-undef`); their first real run is the plan's step a. Two decisions for the session:
W2-L1 (walls) and W2-L2 (the modules outside the six), below.

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
| W2-D1 | dropbin corpses, §5.9.4 (not in the audit): corpse conversion (`sync` → `toCorpse`/`fromCorpse`), the hp hook's Dead toggle on revival, the ready `migrateLegacyEyes`, and the ready backfills (`ensureLockSounds`, `ensureEyesNeedView` — items-journal-25; idempotent, so both tabs send the same batches and both log) run where `game.users.activeGM.isSelf` — **every tab** of the active GM account. With the MCP bridge tab and a GM browser tab open, a kill runs `turnTokensIntoItemPiles` and the corpse update in both tabs (each debounced 150 ms per tab); Item Piles' second conversion and the second `revertTokensFromItemPiles` race the first. Expected outcome is the same corpse (both write the same flags; the PT3-1 re-pile guard keeps the saved pre-death map), but it is unverified live. A fix needs a per-tab election (a `claimDocument`-style claim on the token per death, or the kit `election` with a socket-id tie-break). | dropbin lane | accept and watch in L3 (default: look for doubled "corpse sync failed" warnings or two chat cards), or ask for a claim as a [declared] fix |
| W2-D2 | dropbin ledger, §5.9.4: socketlib's `executeAsGM` reaches every tab of the responsible GM user, so a player's relayed entry is recorded by both tabs. Both compute the same row (same `t` from the sender, same `n` from the same synced counter) and the tail dedupe catches the sequential case, so the ledger ends the same; the mirror is uploaded twice. Only a different entry recorded in one tab at the same instant could interleave and lose a row (each tab writes its whole log). Request-keying (a sender `req` id in each entry, dedupe on it) would close it but adds a field to every stored entry (a stored-shape change). | dropbin lane | accept (default), or ask for request-keyed entries as a [declared] change |
| W2-L1 | walls is switched off in Joe's world, so its "before" live golden (`scripts/foundry/live-goldens/walls.js`) cannot run on the deployed 0.2.0 code. Syncing walls now would leave no before/after comparison for its four declared fixes (undo, the run lock, Levels to js, the ready line). [`wave-2-live-plan.md`](wave-2-live-plan.md) §9. | live-phase prep | hold walls' sync until Joe re-enables walls, then before → sync → after (default), or sync it with the others now on the unit goldens alone |
| W2-L2 | The wave-2 branch also changes modules outside the six: names, pings, cursors, importer, ties, prompts (kit 1.0.2 re-vendor, J10 guard retired; names/pings/prompts also carry the merged play-test fixes) and transform, combat (play-test fixes only, `931203a5`). They need the same restart. [`wave-2-live-plan.md`](wave-2-live-plan.md) §1. | live-phase prep | deploy them in the same live session, with the wave-1 goldens before/after and the play-test LIVE CHECKs for transform/combat (default), or deploy only the six wave-2 modules and leave the rest to the play-test deploy |
