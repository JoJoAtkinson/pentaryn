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

## Open for Joe

| # | Item | From | What is needed |
|---|---|---|---|
| W2-K1 | J10's "other modules' guard copies": retired in every module that carries the kit (above). The seven unmigrated modules still carry theirs: creatures, transform, riders, senses (two: `senses.mjs`, `chain.mjs`), aoe, combat, portals. Live it is dead code (nothing freezes the root). Each guide already replaces the block with `publishNamespace` at migration, and riders/aoe/transform/combat are WAIT (in flux), so editing them now risks conflicts with that work. | kit bump | confirm "retire at each module's migration" (default), or ask for one [declared] commit per module now |
| W2-B1 | python-tooling-28 adds two **new** dnd-scripts tools (`foundry_modules`, `foundry_action_log`). The wave rule is "no new features except the approved bridge tools", and the audit itself calls -28 a possible deferred feature. The bridge plan's P7 (`evallog.py` + `make foundry-eval-report`) answers the same questions from the shell. Plan: [`wave-2-bridge-plan.md`](wave-2-bridge-plan.md) §4 P8. | bridge lane plan | yes → P8 lands (read-only, additive); no → close -28 by pointer to P7 |
| W2-B2 | D14 compact read lines (`{ts, tool:"pentaryn-read", ns, path, ref, ok, ms}`) go into `mcp-<YYYY-MM>.jsonl` beside the write lines, told apart by `tool` and the absence of `args`, rather than a third log file; the monthly review and `evallog.py` already read that file. Plan §3.5. | bridge lane plan | confirm, or ask for a separate `reads-<YYYY-MM>.jsonl` (one-line change in F21 and P7) |
