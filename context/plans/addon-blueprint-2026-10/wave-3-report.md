---
title: Wave 3 report — addon blueprint migration
status: in progress
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, report]
---

# Wave 3 report

**Read this when:** you need what wave 3 decided, what is still open, or which commit checkpointed a
module. Baseline: [`wave-3-baseline.md`](wave-3-baseline.md).

## Open for Joe

- **senses — a chain to a hidden anchor shows to players.** `chain.mjs` hides a chain from players
  only when the *chained* token is hidden; a chain whose *anchor* is hidden is still drawn from the
  visible end to the hidden token's square, so players see where it is. Pinned as today in
  `pentaryn-senses/test/chain.test.mjs`. Decide: hide it too (a [declared] visual change, one
  condition in `paint()`), or keep it (the chain is meant to be seen). Checkpoint `5e76c4a1`.
- **creatures — the orphan light after a pentaryn-senses hand-off (C-L1, transform-creatures-28).**
  Creatures lights a summon 5/5 and flags it; senses writes its item light over it, so creatures
  drops its flag; senses later restores the prior 5/5 *unflagged*. Nobody owns that light now: if
  the summon stops qualifying it keeps burning. Pinned as today in
  `pentaryn-creatures/test/golden/senses-handoff.json`. Decide: arbitrate (senses restores the
  creatures flag with the prior light, or creatures treats an exact radius match as its own — a
  [declared] change on one side and a contract test on both), or keep it (rare; the GM sets the
  light to 0 by hand). Migration done offline; nothing blocks on this.
- **portals — the Item Piles probe differs from pentaryn-aoe's.** `recordOf` asks
  `isValidItemPile(actor)` with no flag fallback; aoe's resolve.mjs passes the token and falls back
  to flags. Kept as is and commented (finding -36: aoe tolerates a false positive, portals must not
  leave a pile-PC behind). Decide: unify the two, or keep them different on purpose.
- **portals — two API returns the audit proposed are not built.** `spreadArrival` still returns the
  token document (audit: `{ moved, to }`) and `teleportParty` has no `{ from }` scene option
  (audit -32); both are declared shape changes not in the guide's list. Decide whether to add them.
- **portals — batching the Portal card's per-behaviour writes (C59 warning).** The switch and
  unlink loops `await` one `update` per teleport behaviour; batching them through the region's
  `updateEmbeddedDocuments` is one round trip but changes the frozen per-behaviour `update` pins,
  so it would be its own declared perf step. Usually one behaviour per region, so low value.

## Known red commits and ranges (bisecting)

| Where | Range | What |
|---|---|---|
| portals: C32 / `foundry-adjustments-check` | `f6bbd2dc` → the ADJ batch commit | the S3 split moved the markers out of `portals.mjs`, and the two existing `adjustments.yml` rows still list it; fixed when the integrator lands the portals rows |
| portals: module-check imports gate | `ae936c07` → `186cdfb1` (`ae936c07`, `8a060d21`, `b87d8c15`, `186cdfb1`) | `test/aoe-handle.test.mjs` imported `../../pentaryn-aoe/core.mjs` across modules; fixed `4d6f0c4b` (a cited oracle copy); module tests stayed green |
