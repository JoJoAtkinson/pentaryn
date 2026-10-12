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
