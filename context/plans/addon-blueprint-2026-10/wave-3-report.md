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
- **portals — three API shapes the audit proposed are not built.** `spreadArrival` still returns the
  token document (audit: `{ moved, to }`) and `teleportParty` has no `{ from }` scene option
  (audit -32); both are declared shape changes not in the guide's list. And the existing entries
  do not accept refs through `regionOf` (audit -32): guide S6 keeps today's document params on the
  legacy rows, and `regionOf` is unpublished, so `cardFor`, `lookAt`, `teleportParty` and `open`
  take documents only (`teleportParty('Scene.X.Region.Y')` throws on `.parent` / `.bounds`); the
  new rows resolve refs through the kit's `resolveRef`. Decide whether to add them.
- **portals — batching the Portal card's per-behaviour writes (C59 warning).** The switch and
  unlink loops `await` one `update` per teleport behaviour; batching them through the region's
  `updateEmbeddedDocuments` is one round trip but changes the frozen per-behaviour `update` pins,
  so it would be its own declared perf step. Usually one behaviour per region, so low value.
  **Landed after all (standalone pass 2, 2026-10-11): no decision needed — §5.9.1 makes batching a
  MUST and Joe's rule puts perf in the same wave.** [declared] `be2573e3` (switches), `5c34cda8`
  (unlink), each flipping its named pins; `05b79e3e` clears the scan's false positive. Live check
  in the portals guide's Result.
- **prompts — the type-ahead's window listeners have no uninstall (prompts-lookup-32 item 1).** The
  `keyup` (and `blur`) listeners are added when `typeahead-adapter.mjs` loads and are never removed;
  `uninstall()` clears the orphan sink only. Removing them needs two new exports on the adapter
  (`listenKeyup`, `unlistenAll`), and the frozen per-file surface golden (`golden/glue-exports.json`,
  key `typeahead`) pins its five. Decide: extend that pin (a declared golden edit) and build the
  uninstall, or keep the permanent listener (it only swallows releases of keys it swallowed).
- **prompts — gather/replace summary log lines (prompts-lookup-18) not built.** The gather's console
  line and replace's failure-path lines are pinned exactly by frozen tests, and logging is outside
  this wave's rule (performance, maintainability, hardening, LLM-read). Decide: build it (flips the
  two console pins, declared, console only) or drop it.
  **Built narrower in the standalone pass (`25fd3172`), no decision needed for it:** the phase split,
  manifest size and the replace summary are debug lines (`CONFIG.debug["pentaryn-prompts"]`), so no
  pin moved. Still Joe's, only if wanted: make the replace summary always-on (`log.debug` →
  `log.info`, one line in `replace.mjs` `logSummary`).
- **prompts — the `pentaryn-prompts.replace` query writes but is not idempotent across GM tabs
  (§5.9.1).** It is safe today: the fork reaches it through the bridge module, which calls the
  handler in its own tab. A `User#query` to the GM user would run it in every tab of that user
  (bridge + browser) and build every replacement twice. Documented in the README ("Two sessions").
  Decide: keep it bridge-only (as documented), or key replace runs by a request id.
- **prompts — the fork halves of mcp-fork-15 and prompts-lookup-11/-12 are open.** The module side
  is done (`prompts-core.mjs` `KINDS`/`PATCH_KEYS`; the manifest is the query table;
  `test/contract.test.mjs` checks the fork's kinds, sizes, feature types and patch keys and pins
  `KNOWN_DRIFT` = `character.folder`, `gather.from`). Fork lane: the checked-in vocabulary copy and its
  test, `ACTION_TABLE`; widening the fork's strict schemas for the two drift keys is a declared fork
  change the audit deferred.

- **ties — the canvas card layer keeps its bare id selector (C37).** `#pentaryn-ties-cards` is the
  one selector not under `pt-`; giving the layer a `pt-cards` class changes the element seven canvas
  goldens pin, so it would be its own declared (invisible) DOM change. Decide: take it, or accept
  C37 for ties. Everything else in `styles/ties.css` is under `pt-` (`5854be46`).
- **ties — one socket listener per caller kept (ties-38).** The relay and the study conduit both
  register through `socket-adapter.mjs` `listen()` and both ask the kit's `isActiveGM`, but each still
  calls `game.socket.on` itself; folding them into one dispatcher flips three frozen socket pins.
  Decide: a declared merge, or keep two listeners (works; a third GM action would add a third).
- **ties — B5 keeps `false` for a player write; B10 not taken.** The guide offered `null` for a
  player-client knowledge write (B5); the serialised store keeps today's `false`. `pinnedCards` stays
  a hidden client row without labels (`CLIENT_STATE`), waiting on blueprint gap G3. Decide whether
  either is wanted.
- **ties — ties-24 item 3 (worn badges diff instead of rebuild) not built.** Items 1–2 landed
  ([declared] B7). The diff changes the PIXI call pins in the worn goldens. Low value (GM only, few
  badges).
- **ties — two C59 sequential-write warnings recorded, not batched.** Share's per-PC writes
  (`study/share.mjs` ~252: one identification and one granted write per PC) and `migrateLegacy`
  (`ties-adapter.mjs` ~325, one-time, copy-verify-clear per actor). Batching changes the frozen
  call-order pins in the conduit goldens. Usually 1–4 PCs; recorded only.

## Known red commits and ranges (bisecting)

| Where | Range | What |
|---|---|---|
| portals: C32 / `foundry-adjustments-check` | `f6bbd2dc` → the ADJ batch commit | the S3 split moved the markers out of `portals.mjs`, and the two existing `adjustments.yml` rows still list it; fixed when the integrator lands the portals rows |
| portals: module-check imports gate | `ae936c07` → `186cdfb1` (`ae936c07`, `8a060d21`, `b87d8c15`, `186cdfb1`) | `test/aoe-handle.test.mjs` imported `../../pentaryn-aoe/core.mjs` across modules; fixed `4d6f0c4b` (a cited oracle copy); module tests stayed green |
| prompts: module-check i18n gate | `5ba6516c` → `02600db9` | `test/i18n.test.mjs` held a bare `"PENTARYN_PROMPTS."` literal the gate reads as a missing key; node tests stayed green; fixed `02600db9` |
| prompts: C32 / C47 (advisory) | `f5a05191` → the ADJ batch commit | `wrapMethod` names `prompts-token-dblclick` and the code names item-piles; both rows wait in the integrator list (scored on a copy with them: 97.9 %) |
| prompts: `scripts/tests/test_update_escalation.py -m repo` (`test_real_exposure_has_no_known_false_positives`) | `ec66c6df` → the integrator's edit of that test | step 10 renamed `los.mjs` → `sight-adapter.mjs` and step 13 added `"flags.wall-height"` to `api-manifest.mjs` `flags.reads`, so `exposure("wall-height")` is `[api-manifest.mjs, sight-adapter.mjs]`, not `[los.mjs]`; shared file, exact edit in the prompts integrator list (also refreshes the `levels` xfail comment: the template is now in `core/gather-text.mjs`). Module tests stayed green |
| ties: C32 / C47 and `foundry-adjustments-check` (advisory) | `c9276cb8` (S4) / `e688e96f` (S4b) / `cb65b749` (S12) → the ADJ batch commit | `core-ties-flag-wipe`, `dsn-skip-blind-study` and the ties path of `dnd5e-legacy-roll-modes` still list `known-core.mjs`, `look.mjs`, `preview.mjs`, `study.mjs`; the new item-piles row is not in yet. Scored on a copy with them: 96.0 %. Module tests stayed green |
| ties: module-check i18n gate | checkpoint `7395a708` → (open) | `test/i18n.test.mjs` (frozen) holds a bare `"PENTARYN_TIES."` literal the gate reads as a missing key; node tests green. Same shape as prompts' `02600db9`, but the ties line is in a frozen test, so it is not edited in this wave |
- **senses — two GM tabs both run the Light reconcile (§5.9 async review).** The reconcile, the
  deletion hooks and the ready sweep are gated on `isActiveGM()`, which elects a *user*; with the MCP
  bridge tab and a GM browser tab open, both run. For a Light cast on a square both tabs create the
  AmbientLight (two squares until the next reconcile or sweep removes one), and a "the creature is
  gone" whisper is posted twice. The carried-light sync, the torch activity (fixed id
  `psLightToggle000`), the token light writes and the darkvision reset are idempotent. Not changed
  (a behaviour change with no guide step). Decide: a deterministic square `_id` created with
  `keepId` (needs a live probe: an embedded create with an existing id), or a claim keyed by the
  cast's `at` stamp (claims are never cleared, so one flag per cast accumulates on the item), or
  keep it (rare: one GM tab at a time). Migration `4e9cc5bf`.
- **senses — `setupLight()` updates each torch one at a time (C59 pattern).** A one-off GM command
  over every torch in the world; batching per parent actor is one round trip each but changes the
  frozen per-item `update` pins in `setup-light.json`, so it would be its own declared perf step.
  Low value; recorded, not built.
- **senses — `syncAll` writes prototypes one actor at a time (C59 pattern, §5.9.4).** The ready
  chain's `syncAll` awaits one `actor.update` of the prototype per actor that needs a write, plus one
  `updateEmbeddedDocuments` per scene per actor. Batching per world (`Actor.implementation.
  updateDocuments`, as `resetSight` does) is one round trip, but it changes the glue ready-chain call
  order pins, so it would be its own declared perf step. On a converged world it is mostly no-op
  writes; recorded, not built. Migration `4e9cc5bf`.
