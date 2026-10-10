---
title: "Foundry update 2026-10 — core 14.369, modules, dnd5e hold"
status: executed
last_modified: 2026-10-10
tags: [context, plans, foundry, updates, dnd5e]
---

# Foundry update 2026-10 — core 14.369, modules, dnd5e hold

> **Status: executed 2026-10-10.** Core 14.369, Dice So Nice 6.4.4 and mad-endlesswiz2 14.1.0 installed; dnd5e held at 5.3.3; updater re-armed. Deviations from this plan: (1) the plan said core + DSN go through `vtt-update-now` and mad-endlesswiz2 by hand; in practice all three were installed through the admin API (`updateDownload` / `installPackage`) in an attended script, and mad-endlesswiz2 needed no Patreon step; (2) the plan's version history was off: the 10-03 run took DSN 6.4.1 -> 6.4.2; (3) 14.369 broke the admin API (same-origin `Origin` header required, new status codes, graceful shutdown moved to `POST /setup {worldShutdown}`), fixed in `scripts/foundry/update/admin.py`; (4) the "second GM login kicks the bridge" warning was wrong, so no Automation users were created; (5) the bridge fork was not rebased onto 0.8.4 (pin stays). Use-doc: [`../foundry/automated-updates.md`](../foundry/automated-updates.md).

**Read this when:** executing or reviewing the attended October 2026 update of the Foundry
install (core, system, modules) after the 10-03 unattended run crashed partway.
**Not this file:** how the updater works → [`../foundry/automated-updates.md`](../foundry/automated-updates.md) ·
running it → [`../../automation/README.md`](../../automation/README.md) ·
module use-docs → each `foundry/module/pentaryn-*/README.md`.

> Plan, not a use-doc. Once executed, the per-run report in `foundry/logs/auto-updates/`
> and the module READMEs are the record; this file stays as the why.

## Starting state (2026-10-10)

| Thing | Now | Available | Decision |
|---|---|---|---|
| Foundry core | 14.367 | 14.369 (stable, 2026-10-08; 14.368 superseded) | **install 14.369** |
| dnd5e | 5.3.3 | 6.0.6 (major) | **hold 6.x** — see go/no-go. 5.3.3 is already the newest 5.x, so the "newest 5.x" branch is a no-op |
| Dice So Nice | 6.4.2 (applied 10-03, untested) | 6.4.4 | install, then verify both jumps |
| Multi Token Edit | 3.3.7 (applied 10-03, untested) | current | verify only |
| mad-endlesswiz2 | 13.0.1 | 14.1.0 (Patreon, protected, no changelog) | install manually, confirm maps load |
| foundry-mcp-bridge | 0.8.3 (fork build, live) | upstream 0.8.4 | **never install upstream**; rebase the fork instead |
| everything else | current | — | nothing to do |
| Updater | paused (`.state/vtt-update.pause`), last status `outcome=failed` | crash fixed, 17 new tests, dry path clean | re-arm at the end |

Worlds the updater manages: `pentaryn`, `ardenford`, `ardenhaven`, `space-journey`. Every
world migrates on its own first launch, so each one gets launched once after the update.

## Decisions

1. **Order: code fixes that are safe today → snapshot → core → (system: no-op) → modules →
   world launches → regression → re-arm.** Core first because every third-party package
   declares compatibility against core and 14.369 is the baseline the next updater run will
   offer anyway; modules after core so each module's smoke happens on the core it will live
   on. The system step is a no-op this round.
2. **The core + Dice So Nice leg goes through the updater (`make vtt-update-now`), attended.**
   That is exactly the path that crashed on 10-03, the fix has only been proven on stubs and
   dry runs, and the updater gives per-package backups, a smoke of all four worlds and a
   report for free. `--force` bypasses the pause file and the user gate, so Joe can run it
   with the table empty without touching the pause. It will hold dnd5e and mad-endlesswiz2
   on its own (major bumps, `auto_major: false`), and it cannot install protected content.
3. **mad-endlesswiz2 is installed by hand** from the Setup screen (Patreon key). The updater
   only *notes* protected packages.
4. **dnd5e 6.x: NO-GO this round.** Rule and reason below.
5. **Do not enable native HTTPS** (new in 14.369). Cloudflare terminates TLS; turning it on
   breaks `server_running()`, the updater, the smoke test and the tunnel config.

## dnd5e 6.x go/no-go

**Rule.** dnd5e 6.x goes in only when **both** of these are true on the day of the update:

- the Argon dnd5e adapter (`enhancedcombathud-dnd5e`) has a **release** whose `module.json`
  declares dnd5e 6 compatible (`relationships.systems[dnd5e].compatibility.verified` or
  `.maximum` ≥ 6), **and**
- the Item Piles dnd5e adapter (`itempilesdnd5e`) has a release declaring the same.

A `minimum: 5.0.0` with no maximum does not count: Foundry will not block the module, but
nobody has claimed it works. Check with the two package pages
(https://foundryvtt.com/packages/enhancedcombathud-dnd5e,
https://foundryvtt.com/packages/itempilesdnd5e) and the GitHub release manifests; do not
read the repo's master branch as a release.

**Status 2026-10-10: NO-GO.** Argon dnd5e latest release is 5.2.2 (2026-07-23), manifest
`minimum: 5.0.0` and nothing about 6. Item Piles dnd5e latest is 1.1.0 (2026-05-09), same.
Neither repo has an open issue about dnd5e 6. So **dnd5e stays at 5.3.3**, which is also the
newest 5.x release (5.3.3, 2026-05-07; there is no 5.4).

**Second, independent reason the hold would stand even if both adapters shipped:** our own
code. dnd5e 6 moves chat-card data from `flags.dnd5e.*` to `message.type`/`message.system`,
creates spell areas as Regions without `flags.core.MeasuredTemplate`, and redesigns card
buttons. That breaks pentaryn-aoe almost entirely, removes pentaryn-senses' Light-cantrip
buttons, lets pentaryn-riders stack once-per-casting riders, and makes pentaryn-importer
refuse to run (version gate). The 6.0 world migration rewrites every chat message and cannot
be undone except from snapshot. The port is a separate plan; the list of changes per module
is in "Code fixes" below under *dnd5e 6 port (deferred)*.

**Keep the hold honest in the updater.** Leave `packages.auto_major: false`; the adjudicator
will keep holding 6.x each week. If that gets noisy, add `dnd5e` to `review_always` and let
the adjudicator's reason point at this file. Do **not** pin dnd5e in `hold:` permanently —
the point is to re-check the rule every week.

## Preconditions (all before anything is installed)

- [ ] **TCC Full Disk Access** for the resolved uv python
  (`~/.local/share/uv/python/cpython-3.14.6-macos-aarch64-none/bin/python3.14`) — the red
  section of `context/foundry/automated-updates.md`. Only a launchd-started run tests it, but
  `make vtt-update-now` runs through the same wrapper, so a hang at the 60 s preflight tells
  you it is still missing.
- [ ] Table empty: Talo (and anyone else) logged out, `make vtt-status` shows 0 users. Do not
  rely on `--force` to skip the user gate while a player is connected.
- [ ] The MCP bridge GM tab is closed, or you accept that it will go dead for the duration
  (14.369 drops a first Gamemaster session when a second logs in — the smoke test and
  `ops/login.py` both log in as the first GM).
- [ ] `git status` clean enough that the updater's report commit (policy `report.commit:
  true`, `push: true`) only commits its own report. The working tree currently has ~40
  modified files; either commit/stash them first or set `report.commit: false` for this run.
- [ ] `.state/vtt-update.status` still holds the 10-03 failed record and no
  `.state/vtt-update.entry` or lock file exists (`make vtt-update-status`).
- [ ] Phase 0 code fixes merged and synced (`make foundry-<mod>-sync`) so the post-update
  regression tests the code that will actually run.
- [ ] Snapshot taken (Phase 1) and **copied aside**.

## Phases

### Phase 0 — code fixes that are safe on 14.367 / dnd5e 5.3.3 (ship first)

These all work on the current versions, so they go in before the update and get tested
against both. Per-module detail is in "Code fixes" below.

| Module | Fix | Why now |
|---|---|---|
| pentaryn-portals | `fromUuidSync(u, {relative: behavior})` at `portals.mjs:74, 227`; normalise with `parseUuid(u, {relative: b})?.uuid` before `destinations.has` (`:655`) and the `filter` (`:785`) | 14.368 stores same-scene teleport destinations as relative UUIDs; latent until the first same-scene link is saved |
| pentaryn-ties | `look.mjs:83, :272`, `preview.mjs:720`: match `/^flags\.(-=)?pentaryn-ties(\.|$)/` instead of the literal `flags.-=pentaryn-ties` | 14.369 migrates legacy `-=` keys during cleaning; the whole-scope wipe may arrive without the `-=` |
| pentaryn-ties | `study.mjs:906`: replace `suppressRollDiceSoNice` with `flags["dice-so-nice"].skip = true` | DSN never read the old flag; blind study rolls animate on the GM screen today |
| automation + ops | Create a dedicated GM-role user **Automation** in each of the four worlds; make `automation/smoke/smoke.mjs:119-133`, `scripts/foundry/ops/login.py:212` (`_pick_user`) and `scripts/foundry/update/admin.py:430` (`login_as`) prefer it, falling back to the first GM only if absent; or check `getJoinData` and refuse `loginAs` on a user that is already `active` | 14.369 single-session-per-user; otherwise the smoke test kicks the bridge tab |
| scripts/foundry/cloud.py | `server_running()` (`:140`): treat any TCP connect on 30000 as up, not only an HTTP 200 | Guard against the native-HTTPS trap; harmless today |
| context/foundry/ops.md | One line: never enable Setup → Configuration → SSL Certificate; the tunnel terminates TLS | Doc only |
| foundry-mcp-bridge fork | Rebase `~/Documents/GitHub/foundry-vtt-mcp` (branch `pentaryn`, uncommitted `settings.ts`/`eval-js.ts`) onto upstream 0.8.4, keep the eval-js hatch, set version `0.8.4-fork.1`, point `module.json` manifest at the fork; rebuild, reinstall, confirm `eval-js` still answers | Stops upstream 0.8.4 showing as an update every week and removes the risk of the 09-26 clobber happening again. Can be done after the core update if time is short, but the `hold:` stays until it is |

Run `make foundry-portals-check foundry-ties-check` and `pytest scripts/tests/` after.
`make foundry-<mod>-sync` for each touched module.

### Phase 1 — snapshot

```
make vtt-down                      # tunnel down, Foundry down, takes a "shutdown" backup
make foundry-backup REASON=pre-update-2026-10
```

Then **copy the tar it names somewhere outside `world-backups/`** (any path; note it in
the run log). The rolling store coalesces: any backup taken within 5 days of the newest one
*replaces* it, and `make vtt-up` (prelaunch) and `make vtt-down` (shutdown) both take one.
Without the copy, the first `vtt-down` after the update silently destroys the only
pre-update restore point. The updater's own run deliberately takes no parting backup for
the same reason.

Also list what you have: `make foundry-restore` (no SNAP) prints the rolling snapshots.

### Phase 2 — core 14.367 → 14.369 and Dice So Nice 6.4.4 (via the updater)

```
make vtt-update-now                # == automation/bin/vtt-update.sh --force
tail -f .state/logs/vtt-update-$(date +%F).log
```

Expected plan: apply `dice-so-nice 6.4.2 → 6.4.4`; core `14.367 → 14.369`
(`auto_build_updates: true`, same generation; Foundry's `previewCompatibility` must come
back clean); hold `dnd5e` and `mad-endlesswiz2` (adjudicated, major); hold `foundry-mcp-bridge`
(pinned). Smoke launches all four worlds (`smoke.worlds: all`, browser dwell 60 s), then
`shutdown_when_done: true` leaves the table down.

Watch for:
- The run getting past `package_warnings()` — that is the 10-03 crash site. If it crashes
  again the notification title will now say "update FAILED, nothing rolled back" and the
  report carries a traceback section; read it before touching anything.
- A smoke failure on any world → the updater restores that package from its own per-package
  backup. A core failure → it restores the core bundle (`retention.core_bundles: 2`).
- 14.369's world-launch warning about incompatible related modules (#13525): none expected,
  every installed manifest's relationships are satisfied on 14.x. New console noise that is
  not in `smoke.ignore_console` fails the smoke, so look at the fingerprint before adding to
  the ignore list.

After the run: `make vtt-update-status`; read `foundry/logs/auto-updates/<run>.md`. Then
`make foundry-up`, open Setup, confirm the version banner reads 14.369 and dnd5e 5.3.3.

**If you would rather not exercise the updater:** the manual equivalent is Setup →
Update Software (core) then Setup → Add-on Modules → Dice So Nice → Update, with
`make foundry-backup` first. You lose the four-world smoke; do it by hand (launch each
world once, watch the console).

### Phase 3 — system

No-op. dnd5e stays at 5.3.3. Confirm nothing bumped it: Setup → Game Systems shows 5.3.3.
Mark the hold reason in the run notes (this file).

### Phase 4 — mad-endlesswiz2 13.0.1 → 14.1.0 (manual, Patreon)

1. Before installing, record which scenes in **each** of the four worlds reference the pack.
   From the GM client per world (read-only):
   ```js
   game.scenes.filter(s => (s.background?.src ?? "").includes("mad-endlesswiz") ||
     s.tiles.some(t => (t.texture?.src ?? "").includes("mad-endlesswiz"))).map(s => s.name)
   ```
   pentaryn showed none on 10-10; the other three are unchecked. Also note whether any scene
   carries Levels-module or wall-height flags (`s.flags.levels`, `s.flags["wall-height"]`).
2. Setup → Add-on Modules → mad-endlesswiz2 → Update (Patreon key). The 14.x build drops its
   hard dependency on **levels, betterroofs and wall-height** and gains scene-packer,
   lib-wrapper, tile-scroll (Multi Token Edit for presets). Leave those three modules
   installed and enabled for now.
3. Confirm maps still load: launch each world that references the pack, open every scene
   from step 1, check the background renders, tiles are present, walls and lights are where
   they were, and the scene-packer import prompt (if any) is answered the same way on each.
   For worlds with no reference, open the module's compendium and import one map into a
   scratch scene, view it, then delete the scratch scene.
4. Only after step 3 passes everywhere: decide separately whether to retire levels,
   wall-height and betterroofs. Not this round; wall-height is verified for v13 only and will
   be flagged by #13525 eventually, which is the prompt to revisit.

### Phase 5 — verify the two untested 10-03 installs

Dice So Nice (6.2.9 → 6.4.2 → 6.4.4) and Multi Token Edit (3.3.3 → 3.3.7) went live without
a smoke. Covered by the regression checklist (Dice So Nice section; MTE has no code of ours
touching it, so "a preset places and the mass-edit dialog opens" is enough).

### Phase 6 — post-update re-checks of our own assumptions

- `scripts/foundry/update/admin.py:1-42` docstring lists four "facts" about the admin API;
  re-check them against the new `dist/server/views/*` and run `make vtt-update-dry`.
- 14.369 single-session: log in as the GM from a second browser while the bridge tab is up
  and see whether the first session is kicked or only warned. Write the answer into
  `context/foundry/ops.md`.
- Wild Shape revert on a token standing in a Drow Prison region (pentaryn-transform's
  `_preUpdateOperation` unwrap at `transform.mjs:18-47` is still needed; #14808/#14373
  touched ForcedReplacement nearby).
- `.theme-light` rules in `pentaryn-ties/styles/ties.css` and `pentaryn-transform/hud.mjs`
  on a machine whose OS theme differs from the configured one (#12265).

### Phase 7 — re-arm the updater

1. `make vtt-update-status` should now show the Phase 2 run as `outcome=done` (or
   `attention` for the held majors). If you did Phase 2 manually, the stale 10-03 `failed`
   status is fine to leave; the next run overwrites it.
2. Decide the pause. Resume with `make vtt-update-resume` only when: TCC is granted, the fork
   is rebased (or you accept weekly "bridge 0.8.4 available" noise), and the report commit
   path will not sweep up unrelated working-tree changes.
3. `foundry/update-policy.yml`: no change required. Optionally `review_always: [dnd5e]`.
4. Fix the watchdog (`automation/bin/vtt-update-watchdog.sh`) so `outcome=failed` is not
   treated as finished cleanly. Separate small change; not blocking.
5. Leave Foundry in the pentaryn world, Drow Prison active, paused, tunnel down unless a
   session is about to start.

## Rollback rule

**Restore the pre-update snapshot (`make foundry-restore SNAP=<pre-update tar>`) instead of
fixing forward when any of these is true:**

1. A world fails to launch, or launches with a migration error, on 14.369 and the updater's
   own core rollback did not bring it back.
2. Any item in the **core flows** part of the regression checklist fails (sheets, rolls, chat
   cards, scene loading, Item Piles, Argon) and the cause is not obviously one of our
   modules. Those are third-party or core breakages; we cannot patch them in an evening.
3. Data is wrong, not just a feature: a token, actor, scene or journal lost or changed by
   migration. Snapshot first, investigate second.
4. More than one pentaryn module is broken in a way the fix table below did not predict,
   and it is within four hours of a session.
5. dnd5e got bumped to 6.x by accident. The 6.0 migration rewrites every chat message;
   there is no fixing forward.

**Fix forward when:** the failure is in a pentaryn module, matches a row in the fix table or
the known-impact list, and the world itself loads and plays. Every pentaryn module has a
`make foundry-<mod>-check` and `-sync`; disable the broken module in the world's module
settings if the fix will not land before a session.

**Mechanics.** `foundry-restore` refuses while the server runs (`make foundry-down` first).
The rolling snapshot restores worlds + Config + modules, so a restore after Phase 2 puts
back the 14.367-era modules but **not core**; reinstall 14.367 from the local core bundle
the updater keeps (`retention.core_bundles: 2`) or Foundry's own installer, *before*
relaunching, or the restored worlds migrate forward again on launch (the restore script
prints this warning for preserved generations; it applies here too). The mad-endlesswiz2
Patreon install is outside the snapshot's worlds tar only if it was never backed up — check
the tar listing before assuming.

## Code fixes needed per pentaryn module

### For this round (core 14.369; dnd5e stays 5.3.3)

| Module | File:line | Change | Severity if skipped |
|---|---|---|---|
| portals | `portals.mjs:74, 227, 655, 785` | `relative` option on `fromUuidSync`; normalise stored UUIDs before `has`/`filter` | latent — same-scene links lose cards/badges/Unlink |
| ties | `look.mjs:83, 272`; `preview.mjs:720` | regex that accepts `flags.pentaryn-ties` with or without `-=` | cosmetic — missed preview/Look refresh on scope wipe |
| ties | `study.mjs:906` | `flags["dice-so-nice"].skip: true` | cosmetic — 3D dice on blind study rolls (existing bug) |
| ties | `pentaryn-ties.mjs:843` | none; `Combat#previous` assignment restored in 14.369 — note that `endLookingRun` may fire once more/less at combat start | none |
| transform | `transform.mjs:18-47` | keep the `_preUpdateOperation` unwrap; re-test | none |
| transform | `transform.mjs:396-401, 604-642` | none; expired effects now auto-revert at load (#14725), `maybeAutoRevert` is idempotent | none |
| transform | `hud.mjs:239, 371` | check `.theme-light` logic against the configured (not OS) theme | cosmetic |
| dropbin | `corpses.mjs:71-72`, `dropbin.mjs:418-434` | none; corpses/piles excluded from sound by #14803 on vision scenes | cosmetic |
| journal, aoe, transform | `journal.mjs:57`, `core.mjs:158-160`, `transform.mjs:706-710` | none; `createdTime` is now stable (#14812) | improves |
| creatures, movement, pings | wrapped core methods | none listed; covered by regression | — |
| senses | — | none for core 14.369 | — |
| aoe | `escape.mjs` | none this round | — |
| walls, cursors, names, lookup, attunement, importer, riders | — | none for core 14.369 | — |
| bridge fork | — | none for core; rebase onto 0.8.4 (Phase 0) | — |

### dnd5e 6 port (deferred; do not start until the go/no-go flips)

Kept here so the next plan starts from the diff, not from scratch. Line numbers are from the
5.3.3-era sources on 2026-10-10.

- **aoe** — the big one. `resolve.mjs:80, 111-127, 247, 360-375`: `message.type ===
  "damage"`, `message.system.activity?.uuid`, `.onSave`, `.ability`, targets via
  `system.targets[].token ?? .actor`, filter saves on `system.type === "ability"` (concentration
  saves are type `save` too). `areas.mjs:25, 98, 130, 194, 203-210, 240-248, 286` and
  `core.mjs:176-179`: accept `flags.dnd5e.activity` as the template-region marker (no more
  `flags.core.MeasuredTemplate`), compare `activity` not `origin`, skip the handle when
  `region.attachment?.token` is set (emanations), insert the Remove button into
  `section.icon-row ul`. `attacks.mjs:24-31`: find the attack by `m.type === "attack"`, thread
  with `data.system.origin`. `effects.mjs:46-52, 78-130, 229-239`: `message.system.getEffects()`,
  `_stats.duplicateSource` / `system.origin` matching, delegate to the tray's
  `_prepareEffectData`, hook `.apply-button`, `system.level` not `spellLevel`. `escape.mjs:28-30`:
  retire (placement is core `placeRegions` now). Decide what of Part B/D survives next to
  dnd5e 6's own save recording and area behaviours.
- **senses** — `light.mjs:523-536`: gate on `message.type === "usage"` and
  `system.item.uuid`; buttons into `.icon-row ul`; `placeSummons` remover must match
  `[data-forward-action]`. `senses.mjs:21-48`: retire darkvision sync or turn
  `senseVisionSync` off.
- **riders** — `riders.mjs:119-133`: read `message.data.system.origin`, compare
  `m._source.system?.origin` in `usedFrom`. `:218-232`: PRESET marker into a module `WeakMap`
  keyed by message + actor uuid (tray passes a shallow copy now).
- **importer** — `pentaryn-importer.mjs:396-405` gate and `module.json
  flags.pentaryn.targetSystemVersion`, plus `scripts/foundry/build_actors.py:61`: bump to
  "6.0"; move the contract to `ac.override`, `init.roll.bonus`, `movement.speeds.*`
  (`build_actors.py:122, 1153-1155`; importer `:116-127`).
- **transform** — `starry.mjs:123` also match `movement.speeds.fly`; `transform.mjs:281`
  delete `system.origin` too; `:543` switch to `transformActorV2`; `:68-104, 449-465` guard on
  `activity.transform.mode !== "form"`; `test/run.mjs` fixtures are 5.x.
- **bridge fork** — `compendium.ts:1069, 1316-1332` read `movement.speeds.*` / `rarities`;
  `data-access.ts:8254-8287` create-npc writes legacy shapes (migrated on create; update
  anyway).
- **walls, cursors, names, pings, journal, lookup, creatures, dropbin, attunement, portals,
  movement** — no dnd5e-6 exposure found. Attunement's `armorProficienciesMap` patch is
  still needed.

## Regression checklist

Run after Phase 4, in the pentaryn world on Drow Prison unless a row says otherwise, with
one GM client and one player client (Talo's user) connected through localhost — **not** the
tunnel. Tick each row; a failed row in *core flows* is a rollback trigger (above); a failed
row in *modules* is fix-forward.

### Core flows (third-party and core; rollback territory)

- [ ] **Scene loading** — each of the four worlds launches; in pentaryn, Drow Prison, the
  splash scene and one Suggestions-folder map scene (ardenford) load without console errors.
  Scene-resize/darkness untouched (#14159, #14718 not used by our code).
- [ ] **Sheets** — PC sheet (Talo), an NPC sheet, an item sheet open and save a field.
- [ ] **Rolls** — attack, damage, save, skill check from the sheet; from a chat card button;
  a player-initiated roll shows on the GM side.
- [ ] **Chat cards** — usage card buttons work, damage tray applies, effects tray applies,
  request-player-rolls card (`CONFIG.DND5E.requests`) round-trips.
- [ ] **Dice So Nice** (6.2.9 → 6.4.4 untested jump) — 3D dice animate for GM and player;
  blind/secret rolls hidden from players (`hide3dDiceOnSecretRolls`); interactive throws
  stay off for Talo's user (world setting "1" = per-user off); no OOM/hang on window resize.
- [ ] **Multi Token Edit** (3.3.3 → 3.3.7 untested) — mass-edit dialog opens on two tokens;
  one preset spawns at the expected elevation.
- [ ] **Item Piles** — drop an item on the canvas, pile opens, player can take from it;
  merchant/vault not used, skip.
- [ ] **Argon HUD** — opens for Talo in combat; actions fire; the HUD survives a
  Wild Shape (see transform row).
- [ ] **Combat** — start combat, next turn, end combat; initiative rolls.
- [ ] **Users** — Talo's login works; a second GM login from another browser documents
  kick-vs-warn (Phase 6).
- [ ] **MCP bridge** — `eval-js` answers (`game.world.id` → `pentaryn`) with the fork build
  (`game.modules.get("foundry-mcp-bridge").version` shows the fork version).
- [ ] **mad-endlesswiz2** — Phase 4 step 3 passed in every world that references it.

### Pentaryn modules (player-facing; fix-forward territory)

Tonight's set first.

- [ ] **cursors** — player cursors render for the other client; the Monk's Active Tiles
  guard still suppresses on trigger tiles (`cursors.mjs:48-66`).
- [ ] **dropbin** — kill an NPC: corpse token appears, **corpse eye** (observer visibility)
  works for the player; **Loot all** on a corpse and on a pile empties it into Talo's
  inventory; attunement repair on looted attuned items.
- [ ] **aoe** — cast Fireball: template/region places, **Remove templates** button on the
  usage card clears it, **self auto-apply** applies the caster's own effect, **Escape cancels**
  a placement in progress; NPC saves resolve into the tray; player save fills its row.
- [ ] **portals** — step through a portal with **followers**: followers arrive, cards and
  badges on the Teleport behavior sheet still render (relative-UUID fix), Unlink works on a
  cross-scene and a freshly made same-scene link; Allow Choice on a multi-scene teleport.
- [ ] **movement** — **ghost** movement for a player through a door waypoint (#14737), owned
  token drawn **on top** (`_getDragConstrainOptions`, `_prepareKeyboardMovementUpdates`
  wraps); drag and keyboard both.
- [ ] **creatures** — **light** and **strip** actions; `Token#isVisible` wrap: owners see their
  own token after an Observer grant (#14766).
- [ ] **senses** — **Light cantrip** card buttons (On me / Pick / End), **torches** on/off,
  darkvision persists on a token; a summoned light source cleans up.
- [ ] **riders** — Elemental Adept ignores resistance once and the GM can toggle it;
  Potent Spellcasting / Elemental Affinity adds +mod exactly once per casting on a
  multi-attack spell (Scorching Ray).
- [ ] **transform — Talo's Wild Shape HUD flow** — Argon button → form pick → token swaps,
  HUD re-renders for the form; revert from HUD; revert while standing in a Drow Prison region
  (ForcedReplacement unwrap); duration expiry auto-reverts; Starry Form fly check; revert
  while viewing another scene (`restoreTokensElsewhere`).
- [ ] **ties** — open the ties sheet on an NPC, add/remove a tie, Known list, a Study roll
  (blind: no 3D dice on GM screen after the skip fix), Look window refresh after a
  whole-scope flag wipe, Past Encounters tab.
- [ ] **attunement** — sidebar slot strip shows, over-cap warning fires on a 4th attuned
  item.
- [ ] **journal** — pentaryn-journal TOC order stable across a reload (`createdTime` fix).
- [ ] **lookup** — `game.pentaryn.rules` lookup of a spell and a condition returns PHB text.
- [ ] **names** — generated name on a new NPC token.
- [ ] **pings** — a player ping lands; the `handlePing` wrap filters as before.
- [ ] **walls** — wall autocomplete on a scratch scene (WASM backend loads; `make
  foundry-walls-test`).
- [ ] **importer** — `make foundry-import` of one actor on dnd5e 5.3.3 passes the version
  gate and the readback.
- [ ] **Automated checks** — `make foundry-<mod>-check` for every module with a `test/`
  (aoe, attunement, creatures, cursors, dropbin, journal, lookup, movement, portals, riders,
  senses, ties, transform, walls) and `pytest scripts/tests/`.

### Cleanup after the checklist

Delete scratch scenes, scratch loot piles and corpses created for the test; remove the
imported scratch actor; set Drow Prison active and pause the game; leave the tunnel down;
record the outcome in the run report and bump this file's `status` to `executed` with the
date.
