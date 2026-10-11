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
