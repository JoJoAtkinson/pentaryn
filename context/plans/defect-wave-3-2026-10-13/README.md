# Defect wave 3 (2026-10-13) — wave record

**Read this when:** you want the history of defect wave 3, 2026-10-13: what Joe asked for, his
rulings, which groups merged, how each was checked live, what changed at the table, the ops and
Foundry-bug results, and what is still open. History, not instructions. Each group has its own
record in this folder; this page summarises them.

## Joe's request and decisions

Wave 2 ([`../defect-wave-2-2026-10-12/README.md`](../defect-wave-2-2026-10-12/README.md)) left a
"Still open" list. On 2026-10-13 Joe approved closing it: "fix all small bugs found live". Every
fix is a **declared** behaviour change; deploying and live-checking them was part of the approval.
Where he gave no ruling, the recommendation was taken, within his standing principles (track and
mark, never hard-block players; combat-only timers; simple rules; chat cards use token names;
prefer native over our patches).

- **Riders re-vendor kept.** The riders kit 1.2.0 re-vendor (`300acf1f`) stays.
- **Pings fixed.** The pings work parked in wave 2 comes back.
- **All small live bugs fixed** — every "Defects seen live" line of wave 2 except the two below.
- **Walls retired.** Joe uses prefabs. The source stays in the repo; nothing installs it.
- **`foundry-down` backs up.** Every stop, including a restart, takes one shutdown snapshot.
- **Restore test into a side copy only.** Never a restore over the live world (the Mac stays
  `FROM=local`; Joe has not moved to BOSS).
- **The transform "pentaryn-combat off" check is skipped** — combat always runs.
- **A second GM tab was allowed** for the journal two-tab step only.
- **Old cloud folders to the Trash:** `pre-bundles-2026-10/` and `system-backup/` ("move fwd only
  mode, so long as i have at least one back up").
- **Report the Foundry 14.369 first-token-change bug** upstream.
- **Argon (enhancedcombathud\*) is not ours** — not edited, not reported.
- **Wild Shape at 0 HP** leaving the druid at 0 HP is correct 2024 RAW — not changed.

Also standing: metamagic is tracking (Careful Spell: the player picks who it misses); dead NPCs
are loot only.

## How it ran

1. **Fix.** Twelve groups, each on its own branch `wave3/<group>-2026-10-13` from `e392ba56` in its
   own worktree, each with a test that fails on the parent, each gate green, each pushed. A
   verifier reviewed each group; dropbin, importer and py-ops were repaired after it.
2. **Deploy.** Before-goldens for nine live modules from `e392ba56` into
   `.state/live-goldens/FIX-W3/before/`. All twelve merged into `main` with `--no-ff` (one
   conflict, walls-retire against py-ops, resolved in `8186a946`: module-sync offers every module
   that is not retired). Gates on the merged main: `make test` 2250 passed / 3 skipped / 4 xfailed,
   `foundry-modules-check` all 20 pass, `check-context` OK, module index current. Rollback copies
   in `.state/live-rollback/FIX-W3/`. Eight modules synced, importer via
   `make foundry-importer-install`, walls not synced. No `module.json`, `lang` or css changed, so
   one GM-tab reload, no restart. After-goldens: eight identical, pings with two declared changes.
3. **Live checks**, one GM tab, ZZ scratch docs created and deleted: every group. Two small bugs
   found live were fixed forward (importer, aoe).
4. **Two-tab checks** for the wave-2 journal and transform items
   ([`two-tab-checks.md`](two-tab-checks.md)), with a second GM tab closed afterwards.
5. **Ops**: walls retired live, backup + restore proved, the old cloud folders (failed — see below).
6. **Foundry bug** reproduced on a clean throwaway world.

Real PCs (Caven, Marrith, Talo) and campaign scenes were not touched. No users were created.

## Summary

| group | merge | gate | live result | forward-fixed / reverted |
|---|---|---|---|---|
| pings | `5e7be2da` | `make test`, `foundry-pings-check` 84 | all pass; golden 2 declared diffs | — |
| dropbin | `8bf94958` | `foundry-dropbin-check` 199 | all pass | — |
| importer | `b0ae7d5a` | `foundry-importer-check` 124 → 125 | all pass (incl. two-tab 2c) | FF `cb71ccd8` |
| combat | `b3a5dc30` | `foundry-combat-check` 299 | 3/3 pass | — |
| aoe | `f842e59d` | `foundry-aoe-check` 473 → 474 | all pass after the fix | FF `5692cfda` |
| cursors | `983f1148` | `foundry-cursors-check` 69 | pass | — |
| portals | `c1d0a7ef` | `foundry-portals-check` 233 | 3/3 pass | — |
| ties-ui | `d6618a5c` | `foundry-ties-check` 522 | all pass | — |
| lookup | `264e5fca` | `foundry-lookup-check` 199 | all pass | — |
| py-ops | `1ff76f40` | `make test` | pass; real-shutdown upload proved in Ops | — |
| walls-retire | `8186a946` | `make test`, `foundry-modules-check` | pass; folder retired live in Ops | — |
| docs | `2d7a72bd` | `make test`, `check-context` | 7/7 pass | — |

Nothing was parked or reverted.

## What changed at the table, by group

- **pings** ([`pings.md`](pings.md)) — the seven wave-2 pings fixes are live. A ping shows up in
  the log once it is saved, about a second later, not instantly. The world ping log was saved and
  restored around the check.
- **dropbin** ([`dropbin.md`](dropbin.md)) — dropping an item onto an existing pile is now one
  ledger row, not a delete and a drop. When a corpse's last token goes, its actor is released
  clean: no pile flag, no Dead dropbin added, ownership back to None. A Dead you set yourself stays.
  Corpses made before this deploy keep their Dead on release.
- **importer** ([`importer.md`](importer.md)) — a change Foundry refuses (such as a blank name) is
  reported as failed, not stamped as done, so the next run retries it. Two GM tabs importing the
  same new NPC at once end with one NPC, its Items intact. Live fix: the 10 s wait for the other
  tab is now 10 s of real time, not 40 s in a hidden tab.
- **combat** ([`combat.md`](combat.md)) — `inspect(actor, null)` gives a clear `BAD_ARGS` error;
  `plan` no longer trips over odd items on a Multiattack NPC; the massive-damage GM whisper uses
  the token name.
- **aoe** ([`aoe.md`](aoe.md)) — deleting a damage card mid-resolve is a clean cancel: no console
  error, no further saves, no request card. Live fix: a card this tab is deleting counts as gone
  at once, so one more goblin save no longer slips through.
- **cursors** ([`cursors.md`](cursors.md)) — after an uninstall, `refresh()` no longer puts the
  coloured cursor back.
- **portals** ([`portals.md`](portals.md)) — no more v14 deprecation warnings on snapshot or party
  teleport; an arriving token no longer keeps an empty `claims` flag.
- **ties-ui** ([`ties-ui.md`](ties-ui.md)) — the GM-only Beliefs list shows lore formatted, with
  working links, instead of raw `<p>` tags.
- **lookup** ([`lookup.md`](lookup.md)) — a 2014 SRD spell answers `onList: true` when its 2024
  copy is on the class list, with `listedAs` naming that copy.
- **py-ops** ([`py-ops.md`](py-ops.md)) — `make foundry-down` takes the shutdown snapshot, so a
  restart backs up once; `make foundry-module-index --check` really checks; `module-sync importer`
  refuses with a clear message.
- **walls-retire** ([`walls-retire.md`](walls-retire.md)) — walls is marked retired; `module-sync`,
  the updater and `make help` never offer it.
- **docs** ([`docs.md`](docs.md)) — seven wave-2 record steps corrected. No table change.

## Two-tab checks

All four wave-2 two-client items pass ([`two-tab-checks.md`](two-tab-checks.md)): journal
async-1 (both paths), EC-4 (claim judged on server time), rob-2 (journal never arrives / arrives
late), and transform wildcard art through the player relay. No code changed.

## Ops

- **Walls retired live — pass.** It was already disabled and nothing used it.
  `Data/modules/pentaryn-walls/` went to the macOS Trash (Finder, not `rm`). After the restart
  Foundry no longer lists it; the updater dry run does not mention it.
- **Backup on shutdown and restore — pass.** `make foundry-down WAIT=1` took the shutdown snapshot
  `world-2026-10-13-110333-fvtt14.369-mac.tar.gz` (20.6 MB) and uploaded 20 new bundles. It was
  downloaded with the tool's own download path into a scratch folder only (never
  `foundry-restore`), extracted there and compared with the stopped live world: 497/497 files,
  0 differences; all four worlds, versions, packs and bundle fingerprints match. The scratch copy
  was deleted.
- **Delete `pre-bundles-2026-10/` and `system-backup/` — failed.** Finder's delete on the OneDrive
  folder timed out, most likely behind a confirmation dialog on Joe's screen. Both folders are
  still in the cloud. Nothing else (no `rm`, no `rclone delete`) was tried.
- **Cloud state (read-only):** mac 1 snapshot, BOSS 0; 102 bundles in the cloud; every local
  bundle uploaded; 57 unreferenced bundles, all under 7 days old, so not yet swept.

## Foundry 14.369 bug

**Not reported: it did not reproduce.** On a clean throwaway world (dnd5e, no modules) the server
kept the first token change every time. The "not persisted" symptom came from our harness: the MCP
tab is hidden, so token animation never advances and `tok.x`/`tok.y` stay at the old position
while `_source` and the server hold the new one. A narrow real core error did reproduce 3/3 — a
token update while the first canvas draw is still running throws `reading 'OBJECTS'` and leaves
the client copy stale until reload. A draft issue for that is in the bug step's notes; whether to
file it is Joe's call. The throwaway world was deleted.

## Still open

- **Joe: delete the two old cloud folders.** Confirm the Finder dialog if one is open, or drag
  `pre-bundles-2026-10/` and `system-backup/` out of
  `~/Library/CloudStorage/OneDrive-Personal/DnD/foundry/` to the Trash (or delete on onedrive.com).
  The new shutdown snapshot is verified, so "at least one backup" holds.
- **`system-backup/` would come back empty:** `scripts/foundry/storage.py` still lists it in
  `SUBFOLDERS` and `ensure_cloud` creates it. Small fix for a later wave: drop it there, from the
  `cloud.py` sweep loop and from the cloud README text and `ops.md`.
- **Optional upstream issue** for the canvas-draw `OBJECTS` error (draft in the bug step). Joe decides.
- **Harness rule to rewrite:** the "one throwaway token change" workaround in older live plans
  should become "read `_source.x/y` or the server, or move with `{animate:false}`".
- **Hidden-tab timers:** the journal loser wait and rob-2 arrival wait count polls, not time, so in
  a hidden tab 3 s became about 30 s. Nothing broke; same kind of fix as importer's `cb71ccd8`.
- **combat:** 2014-style SRD Multiattack text ("two with its … and one with its …") does not parse,
  so e.g. the SRD Bandit Captain plans one swing.
- **ties:** the player's Known tab grant card and the hold card escape lore HTML too. Joe to rule.
  - **Fixed 2026-10-13** (Joe ruled: players always see clean text), branch
    `wave3/lore-clean-2026-10-13` `b7534485`: grant cards (Known tab, Attributes detail, Look window,
    inspect player view) and the GM hold prompt enrich authored HTML with `secrets: false`; plain
    text unchanged. Test `test/grant-text-clean.test.mjs`.
- **combat vs riders/transform/portals:** `inspect(x, null)` throws in combat but is treated as no
  options in the others. One-line change if Joe wants them alike.
- **importer:** detect-and-compensate, not a lock; a tab slower than the 10 s join wait still
  writes alongside.
- **Not noticed before:** `pre-dnd5e6-2026-10/` and `pre-update-2026-10/` are also in the cloud
  folder; the updater flags `pentaryn-seafoot-maps` installed with no repo copy; the MCP fork is
  63 commits behind upstream.

## Exit state

Foundry is up on world `pentaryn` with one GM tab (Gamemaster) answering `get-world-info`. Main is
pushed. Rollback copies of the live modules are in `.state/live-rollback/FIX-W3/`.
