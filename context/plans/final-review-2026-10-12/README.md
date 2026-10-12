## Integration

**Read this when:** you need what the final-review merge window INT-1228 merged, synced and proved live.

INT-1228 (2026-10-12): merged ties-core 106b4d81, prompts-core 5cb445eb, prompts-adapters c188ef5a,
transform-core 0f5fa86b, transform-ui 1af1efa6, riders 2b7b38c3. No `module.json` or fork change, so
no restart and no bridge rebuild. Gates on main green (modules-check, lib-check, test 1581 passed,
check-context). Synced ties, prompts, transform, riders; one GM-tab reload; boot probe and
`selftest().ok` true for all four. Live goldens: ties, prompts, transform diff empty. Riders: shared
identical; `declared` showed `describe().patches` / selftest patch details missing two Argon
item-button rows, which a control run (old code, freshly reloaded tab) reproduces identically to the
new code: those rows are installed lazily at Argon's first render, so the before-golden's long-lived
tab had them. Tab state, not code; no revert. Timing note: riders `featuresOf` median 6.5 us -> 17.5 us
(sub-millisecond, not gated). Reverts: none.

## Integration INT-1228

Final record for the merge window (green = true). Areas:

| Area | Status | Merge SHA | Revert SHA | Synced modules | Reason |
|---|---|---|---|---|---|
| ties-core | merged | 106b4d81 | — | ties | — |
| prompts-core | merged | 5cb445eb | — | prompts | — |
| prompts-adapters | merged | c188ef5a | — | prompts | — |
| transform-core | merged | 0f5fa86b | — | transform | — |
| transform-ui | merged | 1af1efa6 | — | transform | — |
| riders | merged | 2b7b38c3 | — | riders | — |

**Probe (12:38Z, check only).** World pentaryn on dnd5e 6.0.6 / Foundry 14.369, Gamemaster the only
active user, one tab at `localhost:30000/game`, `get-world-info` answers. For ties 0.19.4, prompts
0.4.5, transform 0.4.0, riders 0.3.0: `describe().version` matches `module.json`, every described path
is a function (111/16/13/13), `selftest().ok` true. Deployed folders match main at 2b7b38c3 byte for
byte (`.pentaryn-sync.json`: git 2b7b38c3, dirty false); the tab loaded after the last riders sync
and runs the new riders code. No pentaryn-* console errors from this page load; no ZZ fixtures left.

**Goldens.** Diff empty for ties, prompts, transform. Riders: `golden.shared` identical; the
`declared` section lacked two lazily installed Argon patch rows in the freshly reloaded tab, and a
control golden of the old riders code in a fresh tab diffs empty against the new code — tab state,
not code, so no revert. Goldens under `.state/live-goldens/INT-1228/{before,after,control}`.

**Foundry state.** Up, world pentaryn loaded, one GM tab answering `get-world-info`. No restart, no
bridge rebuild (no `module.json` or fork change). Review worktrees for the six merged areas removed;
branches kept.

## Integration INT-1247

| Area | Status | Merge SHA | Revert SHA | Synced modules | Reason |
|---|---|---|---|---|---|
| ties-study | merged | b2fa66a6 | — | ties | — |
| combat-core | merged | a8a079f9 | — | combat | — |
| aoe | merged | 2b2aadcd | — | aoe | — |

**Gates on main (2b2aadcd).** `make foundry-modules-check` (all 20 modules), `make foundry-lib-check`
(93), `make test` (1581 passed), `make check-context` all green. No fork area merged; no `module.json`
changed, so no restart and no bridge rebuild.

**Deploy.** Rollback copies of the three deployed folders in `.state/live-rollback/INT-1247/`; `make
foundry-{aoe,combat,ties}-sync` with `FROM=local`; one GM-tab reload. Boot probe: aoe 0.4.0, combat
0.3.0, ties 0.19.4 `describe().version` equals `module.json`, every described path (24/25/111) is a
function, `selftest().ok` true where present (combat, ties). Deployed folders match main byte for byte.

**Goldens.** Before (deployed code) and after (new code) run in the one GM tab and diffed in page:
aoe, combat and ties diff empty (`shared`, `declared`, env, cleanup clean, no ZZ fixtures left).
No allowlist used.

**Foundry state.** Up, world pentaryn loaded, Gamemaster the only active user, one GM tab answering
`get-world-info`.
