# Defect wave 2026-10-12 — wave 1 record

**Read this when:** you want the history of the 2026-10-12 defect wave (wave 1): which fixes
merged, what changed at the table, how each was checked live, and the state Foundry was left
in. History, not instructions. Per-group records, with commits and tests, are in this folder:
[`py-cloud.md`](py-cloud.md) · [`py-ops.md`](py-ops.md) · [`aoe.md`](aoe.md) ·
[`combat.md`](combat.md) · [`ties.md`](ties.md) · [`riders.md`](riders.md) ·
[`attunement.md`](attunement.md) · [`feedback.md`](feedback.md) ·
[`transform.md`](transform.md) · [`journal.md`](journal.md) · [`names.md`](names.md)

Joe approved the wave on 2026-10-12 ("take all of those … start that workflow to fix those
things"). Run FIX-1 merged 11 groups into `main`, ran the gates, deployed once and checked
each group live on the `pentaryn` world. **Nothing was reverted.** Main was pushed at
`4b2edd97` (gates after the merges: `make test` 1712 passed, `make foundry-modules-check`
all 20 modules green, `make check-context` OK).

Live checks used only ZZ scratch actors, scenes and users on the one GM tab. No player tab
was opened, and the real PCs and campaign scenes were not touched. Where a check needed a
player, the agent simulated one on the GM tab (socket payload with a ZZ sender, or a
`game.user.isGM` shadow for one synchronous call).

## Summary

| group | merge | gate | live result | reverted? |
|---|---|---|---|---|
| py-cloud | `0467ab69` | `make test` | not live-checked (Python, code only) | no |
| py-ops | `bb441a99` | `make test` | not live-checked (Python, code only) | no |
| aoe | `1c16787e` | `foundry-aoe-check` | 4/4 pass | no |
| combat | `8b9ecb16` | `foundry-combat-check` | 4/4 pass (+ deploy probe) | no |
| ties | `a0e446b8` | `foundry-ties-check` | 7/7 pass | no |
| riders | `6a87dd5c` | `foundry-riders-check` | 2/2 items pass (4 sub-checks) | no |
| attunement | `fc97f31a` | `foundry-attunement-check` | 4/4 pass | no |
| feedback | `60ce9b61` | `foundry-feedback-check` | 1/1 pass | no |
| transform | `b1bb6a68` | `foundry-transform-check` | 6/7 items pass; wildcard-art partly fails, player half not run | no (see below) |
| journal | `902af7b6` | `foundry-journal-check` | 3/3 pass | no |
| names | `77f7b00e` | `foundry-names-check` | 2/2 pass | no |

## py-cloud — merge `0467ab69`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| R2 | Restoring from a damaged or fake local snapshot now stops with "not a readable snapshot — nothing was touched", and the world, Config and modules stay as they were. | not run (code only; unit tests) | no |

## py-ops — merge `bb441a99`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| py-ops-ac-5 + rob-10 | Stopping an actor import part-way (Ctrl-C, kill, closed terminal) now always cleans up the temporary `actors.json` and exits 130. | not run (code only; unit tests) | no |

## aoe — merge `1c16787e`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| aoe-edge-1 | Double-clicking Apply on a damage tray no longer damages creatures twice. | pass — two overlapping applies and a real double-click each landed damage once | no |
| aoe-R1 | If one creature's damage fails, the others still take theirs; a warning names the failed one and Apply retries only it. | pass — forced failure on one goblin, others landed, retry hit only the failed one | no |
| metamagic-disarm | Careful Spell is used up by the very next spell, not left armed for 10 minutes; a cancelled placement keeps it armed. | pass — bound to the next cast, gone on the one after, Escape kept it armed | no |
| tray-overflow | Tray buttons wrap instead of overflowing at the default chat width. | pass — measured at default and widened sidebar, no text overflow | no |

## combat — merge `8b9ecb16`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| edge-1 | An Opportunity Attack from the HUD in combat marks the Reaction spent; it comes back on the creature's turn. | pass | no |
| edge-2 | A running Full Attack is aborted only when the attacker's own token changes body, not another creature's. | pass | no |
| EC-6 | With "Full Attack for Multiattack" off, Full Attack counts only class features (Extra Attack etc.). | pass — off and back on | no |
| EC-5 | Berserker Frenzy rolls the Rage Damage bonus in d6s; no bonus means no Frenzy button or spend. | pass | no |

## ties — merge `a0e446b8`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| ties-ui-E3 | Removing a tie from the player side also removes the NPC's tie back (via the GM). | pass (player simulated) | no |
| ties-ui-M1 | Leaving the notes box saves pending notes instead of dropping them. | pass | no |
| name-leak (TIE-3) | Study cards and speaker names use the token's name, so a disguised creature's real name does not leak. | pass | no |
| ES-4 | The "once-over" bubble shows only to viewers who can see the token. | pass | no |
| EXT-1 | Lore and attribute check prompts show "DC x, rolled y" instead of a meaningless tier; a missing total shows "—". | pass | no |
| ES-1 + ES-2 | Stuck claim rows no longer show as pending; delivering one warns "Nothing is pending". | pass | no |
| AC-4 | A late second-tab roll on a finished study record backs off without rolling. | pass | no |

## riders — merge `6a87dd5c`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| riders-async-2 | Arcane Recovery re-reads slots after the picker closes; if a rest refilled them meanwhile, nothing is recovered and a warning says so. | pass (both cases) | no |
| potent-name | Potent Spellcasting matches by its rule identifier first, so a renamed PHB feat no longer triggers the wrong class's rule; homebrew still matches by name. | pass (PHB and homebrew) | no |

## attunement — merge `fc97f31a`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| ATT-AC-2 | Two bonded coin purses returned together both pay out. | pass — 10 gp + 5 + 3 = 18 gp | no |
| ATT-ROB-2 | A bonded item handed between two copies of the same unlinked monster re-attunes only to the token that owned it. | pass | no |
| EC-3 | Swapping an attuned item at the cap no longer gives a false over-limit warning. | pass | no |
| lang-switch | All attunement messages come from the language file; wording unchanged. | pass | no |

## feedback — merge `60ce9b61`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| rob-1 + EC-1 | A report with an impossible timestamp is refused with a console warning instead of blocking the player's other reports. | pass (direct ingest and the real hook) | no |

## transform — merge `b1bb6a68`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| D8-starry | Starry Form lasts out of combat; in combat it counts down per round without closing the picker. | pass | no |
| ws-bonus-action | No change (already worked): Wild Shape greys the Bonus pip and Return still works. | pass | no |
| wildcard-art | A beast form with random token art gets a real image (the first match) instead of the placeholder; players ask the GM for it. | **partial** — world-actor beasts (how Talo's forms are set up) pass, and the GM relay answers. A beast taken straight from the compendium still gets the literal `wolf-*.webp` placeholder, same as before the fix. The player-tab half was not run (no ZZ player login allowed). | no — nothing got worse; five working fixes in the same merge |
| light-roundtrip | A token's hand-set light comes back after Wild Shape and Return. | pass (linked and unlinked) | no |
| EC-1 | Uses spent in a form carry back when the max is a formula. | pass | no |
| R2-refund | Picking a constellation spends Wild Shape exactly once. | pass | no |
| starry-double-end | Expiry and Incapacitated at the same moment end Starry Form once, with one chat line. | pass | no |

Follow-up for the compendium case (forward fix, not done in this run): in
`foundry/module/pentaryn-transform/wildshape-adapter.mjs`, `formImage()` trusts
`getTokenImages()`, which returns the wildcard itself for a compendium Actor — it should
browse with `{wildcard:true}`. `withFormImage()`'s `clone({prototypeToken})` also leaves a
compendium Actor unchanged.

## journal — merge `902af7b6`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| bar-stuck | If adding a page to the journal fails, the player gets a warning and the button comes back instead of sticking. | pass (GM journal with gmButton on) | no |
| double-save | Two quick saves no longer make two copies of the same page. | pass | no |
| pinned-cache | A newly pinned journal on a scene opens right away. | pass | no |

## names — merge `77f7b00e`

| item | what changed at the table | live check | reverted? |
|---|---|---|---|
| names-edge-1 | Renaming one unlinked token's creature relabels only that token (and its combat entry), not its copies or the prototype. | pass | no |
| names-ac-2 | Renaming several actors at once relabels each actor's tokens from its own old name. | pass | no |

## Golden fix

Committed on main as `bfade230` before the merges: `scripts/foundry/live-goldens/diff.mjs`
now exits 2 when either side of a golden diff is a skipped run, or when a golden is not an
object (LG-R3, LG-R2). Before, a skipped run with an empty golden could diff as "identical".
Test: `scripts/tests/test_live_goldens_diff_skipped.py` (11 cases, 9 failed on the old code).

**Earlier merge windows re-checked:** every before/after pair in `.state/live-goldens/INT-*`
(INT-1228, 1247, 1259, 1327, 1405, 1417, 1427, 1508, 1518 — 22 pairs, plus INT-1405's
attempt-1 files) was diffed with the old and the new `diff.mjs`. All exit 0 under both, no
file has a top-level `skipped`, and every `golden` is an object. **No earlier merge window's
"no difference" was really a skipped golden.** `INT-1327/before/ties.prior-attempt-truncated.json`
has no after file and was not diffed.

**This run's goldens:** before and after taken for aoe, combat, ties, riders, attunement,
transform, journal and names (feedback has no golden). aoe, combat, ties, riders, journal and
names are identical. Transform's shared section is identical; its declared section gained
`formImage` and one hook (38 → 39), as declared. Attunement differs on four `bond.actor`
values (`<owner>` → `Actor.<owner>`), exactly as ATT-ROB-2 declared.

## Foundry state at the end

- One restart, in the Deploy step (down, then `foundry-up FROM=local` at 16:18:46Z). All nine
  module groups synced from `4b2edd97`; walls and the importer were not synced. Every
  module's boot probe passed (version, `describe()` paths, `selftest()`), and the console
  showed no pentaryn errors.
- World `pentaryn` loaded, one GM tab (Gamemaster), tunnel down, active scene Drow Prison.
- **No world backup was taken this run.** `make foundry-backup` refuses while Foundry runs,
  and the down window was used for sync only. The newest cloud snapshot is
  `world-2026-10-12-073936-fvtt14.369-mac.tar.gz` (07:39 UTC). Module rollback copies of the
  pre-deploy code are in `.state/live-rollback/FIX-1/pentaryn-<m>/`.
- Leftover not made by these checks: journal "ZZ Tie Player's Journal"
  (`P4eBOauPkwTSwe2N`, Player Journals folder), owned by a ZZ user that no longer exists —
  likely from the ties golden. Safe to delete.
- Side effects cleaned up: the attunement check wrote dropbin ledger entries #56–60; the
  ledger was restored to its 113-entry snapshot, the counter stays at 60 (never reused).
  The feedback check filed two "ZZ live check" reports, now resolved and kept on disk.
- Worktrees for all 11 groups were removed after the merge; the `fix/*-2026-10-12` branches
  are kept.
