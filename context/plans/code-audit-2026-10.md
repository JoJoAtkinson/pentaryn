---
title: "Code audit 2026-10 — behaviour-preserving refactor plan for every addon"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry, refactor]
---

# Code audit 2026-10 — behaviour-preserving refactor plan

**Read this when:** you are about to refactor, harden, document or extend any pentaryn Foundry addon, the Python tooling or the MCP fork, and want the audited change list, the shared kit design and the order to land it in.
**Not this file:** operating a module → its README via [`../foundry/README.md`](../foundry/README.md) · the full per-finding detail → [`code-audit-2026-10/`](code-audit-2026-10/README.md)

> **Re-anchored to 4e64f47 on 2026-10-11** (partial — per addon file; each re-anchored file carries its own note). attunement and movement: done, +items-journal-39 and +aoe-movement-portals-42 (both Hardening, counted below). creatures and portals: done, +transform-creatures-40 (Perf) and +aoe-movement-portals-43 (Defrag), counted below; aoe-movement-portals-24 partly resolved by U-9-6. riders: done at 28ccc87 — +combat-riders-39 (Hardening) and +combat-riders-40 (Logging), counted below; 0 resolved/obsolete; -25, -26, -32, -16 extended for cast-flow.mjs and the other re-run code. aoe: done at 28ccc87 — +aoe-movement-portals-44 (Hardening, counted below); 15 re-anchored, 0 resolved/obsolete; -2, -8, -9, -10, -11, -12, -13, -15 extended for refund.mjs, aim.mjs and the Careful Spell / status-line / no-stacking code. combat: done at 28ccc87 — +combat-riders-36 (Defrag), +combat-riders-37 (Hardening), +combat-riders-38 (Perf), counted below; 27 re-anchored, 0 resolved/obsolete; 17 extended (-2, -35, -6, -7, -20, -18, -5, -21, -4, -9, -10, -8, -30, -33, -14, -11, and -28's recipe corrected) for turnflow.mjs's new features, the spell pips and the Undone card; live score unchanged at 45.2 %. transform: done at 28ccc87 — no new id, 0 resolved/obsolete; transform-creatures-12 extended (combat's applyButtons gained `placeOpenDrawers`, combat has a fourth `renderActionPanelArgonComponent` handler at hud.mjs:931; the argon-kit row below still cites snapshot combat lines — combat/hud.mjs is now 37/108/123/145, `TT` :157).

> **History-tree plan.** Read-only audit of a frozen snapshot, written while another workflow was live-testing and editing code. No item here adds a feature; every item is a pure move, an additive read, a test, a doc, or a hardening fix that only changes a failure path (marked **[declared]**; those go through the live-test workflow before merge).

## How to use this audit

1. **Pick a wave** (see *Sequenced waves* below) and open the addon file for each finding id in it (`code-audit-2026-10/<addon>.md`).
2. **Re-locate.** Every finding names `file:line` *in the snapshot* plus a verbatim **anchor** line. If the live file has drifted, `grep -nF` the anchor; if the anchor is gone, re-read the surrounding code before doing anything.
3. **Characterise first.** Write the finding's *behaviour test recipe* as a test in the named harness (`foundry/module/<m>/test/run.mjs`, `scripts/tests/test_*.py`, or the fork's vitest suite). Run it against the *unchanged* code and make it green. Commit it on its own.
4. **Refactor** exactly as *Proposed*, nothing more.
5. **Re-run** the same test unchanged, plus `make foundry-<m>-check` (and `make foundry-adjustments-check` when a patch or marker moves). Green before and after is the proof the behaviour did not change.
6. **WAIT modules** (pentaryn-combat, pentaryn-transform, pentaryn-aoe, and `foundry/adjustments.yml`) were in flux at the snapshot. Touch them only when the live-test workflow is idle on them.

### Snapshot base (copied from `SNAPSHOT.txt`)

```
snapshot taken 2026-10-10 20:15 EDT
pentaryn HEAD ee505c2 + uncommitted:
 M context/foundry/melee.md
 M context/plans/usability-changes-2026-10.md
 M context/plans/usability-test-plan-2026-10.md
 M foundry/adjustments.yml
 M foundry/logs/eval.jsonl
 M foundry/logs/mcp-2026-10.jsonl
 M foundry/module/pentaryn-aoe/aoe.mjs
 M foundry/module/pentaryn-aoe/areas.mjs
 M foundry/module/pentaryn-aoe/core.mjs
 M foundry/module/pentaryn-aoe/test/run.mjs
 M foundry/module/pentaryn-combat/README.md
 M foundry/module/pentaryn-combat/combat-core.mjs
 M foundry/module/pentaryn-combat/combat.mjs
 M foundry/module/pentaryn-combat/hud.mjs
 M foundry/module/pentaryn-combat/lang/en.json
 M foundry/module/pentaryn-combat/module.json
 M foundry/module/pentaryn-combat/riders.mjs
 M foundry/module/pentaryn-combat/sequence.mjs
 M foundry/module/pentaryn-combat/settings.mjs
 M foundry/module/pentaryn-combat/strip.mjs
 M foundry/module/pentaryn-combat/styles/combat.css
 M foundry/module/pentaryn-combat/test/run.mjs
 M foundry/module/pentaryn-transform/hud.mjs
 M foundry/module/pentaryn-transform/styles/transform.css
 M foundry/module/pentaryn-transform/test/run.mjs
 M foundry/module/pentaryn-transform/transform-core.mjs
 M foundry/module/pentaryn-transform/transform.mjs
?? foundry/module/pentaryn-combat/turnflow.mjs
fork HEAD 59c781e branch pentaryn
```

Snapshot location during the audit (scratch, not kept): `/private/tmp/claude-501/-Users-joe-Documents-GitHub-pentaryn/f3641d37-8a29-401b-be45-aefb0c3418e7/scratchpad/audit-snapshot` (`pentaryn/` = repo subset, `fork/` = foundry-vtt-mcp branch `pentaryn`).

## Summary by addon

Each line cites finding ids; full detail (current, proposed, anchor, test recipe, risk) is in the linked addon file. An `H` after an id marks high impact.

### pentaryn-ties

43 findings, 8 high impact → [`code-audit-2026-10/ties.md`](code-audit-2026-10/ties.md)

- **Performance gains:** registry() re-clamps the whole registry on every call; describeAttribute calls it per id (ties-19); Worn badges: rAF scheduled on players' clients and full PIXI rebuild every frame (ties-24); planStep re-normalises registry and ledgers on every inner call (ties-20); runCascade recomputes loop-invariant inputs each iteration (ties-21); Ties tab scans every actor twice per paint (inbound in build and bind) (ties-22); Known tab reads and clamps the registry once per notebook entry (ties-23); Wire repaint queued on every refreshToken/sightRefresh even with no cards up (ties-25); Sheet injection runs twice per actor-sheet render (ties-26); personalCluesHTML scans every actor per personal row; the review panel already has the carrier map (ties-27); GM Ties tab: kind picker scans all actors twice with literal flag names (ties-28)
- **Maintainability gains:** ties test suites (196 cases) never run in make foundry-ties-check (ties-1, H); Split study.mjs (2890 lines, ~11 concerns) into study/ behind a barrel (ties-35); Split known-core.mjs (2392 lines) into core/ files behind the same barrel (ties-36)
- **Defragmentation:** Three different reverse-side (mirror) rules; extract the pure ones to ties-core.mjs (ties-12); Flat-roll miss predicate duplicated in four places (narrowed from six) (ties-13); Fact-key and flag-name string literals bypass the known-core grammar (ties-14); Module-local util.mjs for helpers copied across ties files (ties-15); Row expand/collapse binding x6 and open-state maps x4 -> row-ui.mjs (ties-16); Granted-card markup duplicated between the Attributes tab and the Known tab (ties-17); Notes-preview, notes-prose and word-cell fragments repeated 7x (ties-18); The 'two GM sessions' claim protocol is implemented three times (ties-39); Live-refresh hook kit duplicated between the Look window and the inspect preview (ties-40); Card record construction duplicated between show() and restorePinned() (ties-41); Dead exports, dead CSS and dead branches (ties-42)
- **Logging / auditability gains:** No debug channel; silent refusals and a computed-then-discarded outcome (ties-33); Contract-mandated empty catches give no trace when debugging (ties-34)
- **Hardening:** Field-drop guard: fixtures proving reader/writer literals name every stored field (ties-37, H); Private core API in the blind roll, called after the claim with no release on throw (ties-29); Whole-setting read-modify-writes of knowledge and attribute beliefs are not serialised (ties-30); Session-lifetime maps that are never pruned (ties-31); Unescaped values interpolated into markup (describe art, item-mark class) (ties-32)
- **Extendability:** Table-driven API with a self-describing help() manifest (ties-7, H); Two socket listeners on one channel; a new GM action means a third (ties-38); No stated layering or file map; 21 flat files with implicit dependency rules (ties-45)
- **LLM interface:** One aggregate read: game.pentaryn.ties.dossier(ref) (ties-3, H); API calls need Actor documents; add a ref resolver at the API boundary (ties-4, H); Publish the internals LLMs already reach by dynamic import (ties-6, H); Extract knowsAbout(character, subject) from the Look window and publish it (ties-8, H); Named wrappers for lore rows, conceal and 'mark as learned' (today raw-flag recipes) (ties-9, H); Published attributes.of / ids omit the kind pointer that the sheet and cascade include (ties-5); Ledger rows return locale-string dates only; add numeric siblings (ties-10)
- **Documentation / skills:** Docs drift and use-doc/changelog mix; no API reference (ties-43); Hard-coded English UI strings bypass lang/en.json and the i18n gate (ties-44)

### pentaryn-prompts

21 findings, 0 high impact → [`code-audit-2026-10/prompts.md`](code-audit-2026-10/prompts.md)

- **Performance gains:** Hover tooltip: count sight lines without the door/wall classification (prompts-lookup-7); Memoize the per-scene model between dialog panel, hover tooltip and debounced refreshes (prompts-lookup-8); sceneItems: index hosts by markerId, memoize scaffold checks, stop recounting prompt tokens in gather (prompts-lookup-23)
- **Maintainability gains:** settings.mjs with a DEFAULTS table and one setting() reader; surface the gatherChars 160 vs 400 discrepancy (prompts-lookup-16); Split the 1,453-line geometry-core (77 exports, ~10 concerns) behind a re-exporting barrel (prompts-lookup-20); Name the encounter and formation link distances once (LINK_FT, FORMATION_FT) (prompts-lookup-21); typeahead's ticket/keystroke state machine cannot be imported in node; extract typeahead-core (prompts-lookup-31); the orphan-text toast is hard-coded English (prompts-lookup-33)
- **Defragmentation:** Extract the advancement-pool name matcher (written twice) and move pack lookup out of character.mjs (prompts-lookup-10); One size-word table and one CR parser in geometry-core (prompts-lookup-9); One wall-segment builder for los.mjs and model.mjs#sceneMeta (prompts-lookup-22); One tokenDataFrom helper for the four actor-to-token-data clones (prompts-lookup-24); Two HTML-to-text converters across prompts and lookup: pin the divergence, cross-reference, do not merge (prompts-lookup-28)
- **Logging / auditability gains:** Warn once when a core token API falls back; debug-log other swallowed errors (prompts-lookup-17); Replace summary log line, per-phase gather timings with manifest size, structured fields in the fork log (prompts-lookup-18)
- **Hardening:** replaceMany: check replacements is an array before iterating it; add a node fake harness for the glue files (prompts-lookup-14); Crop image fetch: build relative URLs with foundry.utils.getRoute and log failures (prompts-lookup-15); typeahead: permanent global keyup listener, swallow set never cleared, API calls arm keyboard capture on the bridge client (prompts-lookup-32)
- **Extendability:** Replace the 270-line planOne switch with a per-kind planner registry (prompts-lookup-13)
- **LLM interface:** Expose existing read helpers and a describe() on game.pentaryn.prompts, plus the module api (prompts-lookup-19)
- **Documentation / skills:** README error-code list, the orphaned languageKeys docblock, and an 'Extending' section (prompts-lookup-27)

### pentaryn-lookup

8 findings, 3 high impact → [`code-audit-2026-10/lookup.md`](code-audit-2026-10/lookup.md)

- **Performance gains:** Cache the loaded book packs and their plain text; remove the dead textCache (prompts-lookup-1, H)
- **Maintainability gains:** Move monsters() query parsing, filtering and sorting (plus crNum, SIZE_KEYS) into lookup-core with fixtures (prompts-lookup-6)
- **Logging / auditability gains:** Five different failures become null or a generic error with no trace; debug-gated lines, returns unchanged (prompts-lookup-34)
- **Hardening:** Guard the dnd5e spell-list registry reads the way listFor already is (prompts-lookup-4); page(uuid): extract the UUID path into a pure seam and flag a non-page document (prompts-lookup-5)
- **LLM interface:** Make game.pentaryn.rules self-describing: VERSION, describe(), module api, documented return shapes (prompts-lookup-2, H); Register GM-guarded CONFIG.queries for the read-only lookups so a typed MCP tool can replace eval-js (prompts-lookup-3, H)
- **Documentation / skills:** Fix lookup README drift (version, fixture count, adapter size) and add an 'Extending' recipe (prompts-lookup-26)
- **Checked, nothing found:** Defragmentation, Extendability (see `lookup.md`)

### pentaryn-combat — WAIT

30 findings, 5 high impact (27 + 3 added at the `28ccc87` re-anchor) → [`code-audit-2026-10/combat.md`](code-audit-2026-10/combat.md)

- **Performance gains:** Memoise fullAttackState / combatContext / weaponsOf / featuresOf per tick (combat-riders-1, H); Check the turn stamp and permission before computing rider offers (combat-riders-2); Install the picker-cue pointer listeners and body MutationObserver only while skipPickerGuide is on (combat-riders-35); End-of-combat flag cleanup writes once per key, then scans every world actor again (combat-riders-38)
- **Maintainability gains:** Split hud.mjs (970 lines, 11 concerns) into hud/ files; pin hook order with a manifest test (combat-riders-6); turnflow.mjs: split into turnflow/ by concern; record that a separate module needs a settings migration (combat-riders-7); Split combat-core.mjs (1240 lines, 81 exports) into core/ by domain behind a barrel (combat-riders-20); Remove dead exports and a dead CSS rule (combat-riders-34)
- **Defragmentation:** Argon injection across combat, transform and riders: implicit hook order, Reaction-slot double relabel, forked tooltip helpers (combat-riders-18, H); Collapse in-module duplicate helpers into argon-util.mjs, dialogs.mjs, i18n.mjs (combat-riders-5); combat/riders.mjs vs pentaryn-riders: rename, document the split, guard the two identity tables (combat-riders-17); One planFor / multiattackFor / rememberedWeapon in shapes.mjs instead of hand copies (combat-riders-21); One settlePips() helper; drop the 'call twice' copies made redundant by the prototype settle patch (combat-riders-3); weaponLike (combat.mjs) and isWeaponAttack (riders.mjs) are the same predicate: one export in shapes.mjs (combat-riders-4); Combat re-derives pentaryn-aoe internals: the cancelled-placement test and the handle-token flag (combat-riders-36)
- **Logging / auditability gains:** Replace swallowed catches with a debug-gated log.mjs (silent by default) (combat-riders-9); Opt-in decision trace ring buffer (why a swing counted, why a rider was or was not offered) (combat-riders-10)
- **Hardening:** One idempotent wrapMethod() for the prototype patches, with a recorded patch list (combat-riders-8); Move fullAttackPlan's logic into the core and pin the Multiattack + Action Surge inconsistency (combat-riders-22); Guard every module-scope hook with one on(name, label, fn) wrapper that passes return values through (combat-riders-30); Prune session-long maps whose stale entries are never read (combat-riders-29); Escape message-flag and actor-data strings before innerHTML (auto note, rider button) (combat-riders-33); Timer-sequenced behaviour: name every delay and pin the ordering between them (combat-riders-37)
- **Extendability:** Name the custom pentarynCombat.* events in one EVENTS table and document their payloads (combat-riders-14); 'Extending' section plus a completeness test for template-built i18n keys and follow-up kinds (combat-riders-28)
- **LLM interface:** game.pentaryn.combat.inspect(ref): one read-only call for turn, plan, pips, follow-ups, riders, settings (combat-riders-11, H); Resolve actor refs (doc | token | uuid | id | name) at the API boundary of combat and riders (combat-riders-12, H); describe() and settings() on both namespaces, generated from existing tables (combat-riders-13, H)
- **Documentation / skills:** Fix README / melee.md / module.json drift (files, fixture count, API, flags, stacked off-hand) (combat-riders-15); Make side-effect entry points discoverable and graph-checked (turnflow in combat; rituals, concentration, argon-tidy in riders) (combat-riders-31)

### pentaryn-riders

8 findings, 0 high impact (6 + 2 added at the `28ccc87` re-anchor) → [`code-audit-2026-10/riders.md`](code-audit-2026-10/riders.md)

- **Performance gains:** Concentration cleanup: skip non-concentration effects before scanning every scene's tokens (combat-riders-23)
- **Maintainability gains:** pentaryn-riders: settings table, one MOD, and split the 662-line entry by concern (combat-riders-25); Extract the untested pure kernels of riders.mjs (Hit Dice pools, Battle Medic gate, report rows) into riders-core (combat-riders-26)
- **Hardening:** Route the re-run's five hand patches (SummonActivity ×2, Argon item button ×2, TextEditor.enrichHTML) through wrapMethod/defineAccessor with a patch record (combat-riders-39)
- **Logging / auditability gains:** Audit line for the Battle Medic GM relay and for refused queries (combat-riders-27); Three comment-only catches in the re-run code: log them at debug (combat-riders-40)
- **LLM interface:** riders.inspect(ref) returning plain rows; describe()/settings(); reuse report's row builder (combat-riders-32)
- **Documentation / skills:** adjustments.yml gaps: combat's chat-message-type reads; riders' tray, roll-config, sheet DOM and query rows (combat-riders-16)
- **Checked, nothing found:** Defragmentation, Extendability (see `riders.md` § Categories checked with no finding)

### pentaryn-transform — WAIT

24 findings, 1 high impact → [`code-audit-2026-10/transform.md`](code-audit-2026-10/transform.md)

- **Performance gains:** World-time ticks scan every actor on every client, but only the runner can act (transform-creatures-2); isRunner builds the owner list before checking for an active GM (transform-creatures-1); A capture-phase pointermove listener arms a 60 ms timer on every move, even with no tooltip up (transform-creatures-11); Tooltip counts forms by resolving every profile's actor (transform-creatures-23)
- **Maintainability gains:** The core v14 operator-unwrap patch is untested inline glue; extract its loop into core (transform-creatures-5); Pure HUD decisions live in hud.mjs with no fixtures (transform-creatures-6); 39 hook registrations over three files with no registry and no characterization of order (transform-creatures-8); Starry Form effect choice, image fallback, time-left math and end-reason mapping are untested glue (transform-creatures-7)
- **Defragmentation:** Argon helpers forked into pentaryn-combat; two modules recompose the same Action panel (transform-creatures-12); The 'find the Wild Shape item' lookup is written four times; the tested core helper is never used at runtime (transform-creatures-3); Intra-module copies: T helper x3, StarryOn chat line x2, use refund x2 (transform-creatures-4)
- **Logging / auditability gains:** Silent catches and ungated console.log; no debug channel (transform-creatures-15)
- **Hardening:** Transform reads combat's private setting keys and API inside a silent catch (transform-creatures-13); transform, names, pings publish synchronously at ready and depend on running after pentaryn-importer's ready (transform-creatures-16); The Starry light depends on pentaryn-senses' item-flag schema with no contract test (transform-creatures-21); liveButtons is pruned only on a Wild Shape item update or a Starry change (transform-creatures-10); pentaryn-combat's tooltips are styled only by transform's CSS; transform's classes are not module-prefixed (transform-creatures-14); Starry expiry by world time scans world actors only; Wild Shape expiry also scans unlinked scene tokens (transform-creatures-22); Declared Foundry minimum 13 while the code relies on v14 and dnd5e 6 (transform-creatures-24)
- **Extendability:** starry.mjs (game rules) loads only because hud.mjs imports it (transform-creatures-9)
- **LLM interface:** No one-call read of a druid's shape state; LLMs fall back to raw flag reads (transform-creatures-17, H)
- **Documentation / skills:** README, file header and ModuleSpec text have drifted from the code (transform-creatures-18); No route for Wild Shape, pings or names in the Foundry routing table (transform-creatures-20); A 584-line design plan lives in the module folder, ships to Data/, and is stale (transform-creatures-19)

### pentaryn-creatures

8 findings, 0 high impact → [`code-audit-2026-10/creatures.md`](code-audit-2026-10/creatures.md)

- **Performance gains:** The strip recomputes on every token move on the viewed scene, on every client (transform-creatures-25); Every light write re-queues itself for a no-op pass (transform-creatures-27); (new 2026-10-11, U-6-12 code) placeStrip polls Argon's DOM every 500 ms on every player client, even with floatOverHud off or Argon inactive (transform-creatures-40)
- **Defragmentation:** Hand copies of cross-module predicates: writer election, aoe handle, Item Piles pile (transform-creatures-30)
- **Logging / auditability gains:** The Token#isVisible override swallows every error and depends on private core fields (transform-creatures-29)
- **Hardening:** The light queue is a debounce that steady token traffic can postpone indefinitely (transform-creatures-26); Characterize the token.light hand-off with pentaryn-senses before anyone 'fixes' arbitration (transform-creatures-28)
- **LLM interface:** Creatures API: syncScene needs a Set, ownerSees needs a placeable, no status() (transform-creatures-31)
- **Checked, nothing found:** Maintainability gains, Extendability, Documentation / skills (see `creatures.md`)

### pentaryn-names

3 findings, 0 high impact → [`code-audit-2026-10/names.md`](code-audit-2026-10/names.md)

- **Maintainability gains:** names has pure rules but no core, no tests, and only static gates (transform-creatures-32)
- **Logging / auditability gains:** Fire-and-forget sync() from a hook: a failure becomes an unhandled rejection (transform-creatures-33)
- **LLM interface:** sync() needs an Actor document; nothing tells an LLM a rename already relabels (transform-creatures-38)
- **Checked, nothing found:** Performance gains, Defragmentation, Hardening, Extendability, Documentation / skills (see `names.md`)

### pentaryn-pings

3 findings, 0 high impact → [`code-audit-2026-10/pings.md`](code-audit-2026-10/pings.md)

- **Maintainability gains:** Extract pings-core.mjs and pin the dedupe, cap, offset and recent() quirks (transform-creatures-36)
- **Extendability:** pings has none of the module scaffolding (transform-creatures-35)
- **LLM interface:** Namespace exists only on GM clients; records carry only a string age; add ageMs and describe() (transform-creatures-39)
- **Checked, nothing found:** Performance gains, Defragmentation, Logging / auditability gains, Hardening, Documentation / skills (see `pings.md`)

### pentaryn-senses

20 findings, 1 high impact → [`code-audit-2026-10/senses.md`](code-audit-2026-10/senses.md)

- **Performance gains:** syncLight scans every token on every scene per actor; syncAll is O(actors x scenes x tokens) (senses-walls-cursors-11); Every token/item/actor deletion on the GM rescans all tokens and lights on every scene (senses-walls-cursors-13); refreshToken rebuilds chainPairs over every scene token per event when no chain is drawn (senses-walls-cursors-19); paint() destroys and recreates TilingSprites per chain on every animation frame (senses-walls-cursors-20); Glow epoch cache thrashes past 16 sources; re-init cadence scales with speed (senses-walls-cursors-22)
- **Maintainability gains:** Carried-light ownership rule (itemLight/itemLightPrior/spellLight) is untested inline glue (senses-walls-cursors-12); Broken-glow wave is untested though cross-client determinism is its contract (senses-walls-cursors-21); Module id defined four times; light-core imports it from chain-core (senses-walls-cursors-18); Chain HUD labels and notifications hard-coded English despite lang file (senses-walls-cursors-24)
- **Defragmentation:** Three hook-registration idioms in one module (senses-walls-cursors-16); Two copies of the frozen-namespace publish guard with different timing (senses-walls-cursors-34)
- **Logging / auditability gains:** Light reconcile is silent; api.reconcile resolves to undefined (senses-walls-cursors-14); Debounced syncLight failures are unhandled rejections with no module prefix (senses-walls-cursors-15)
- **Hardening:** Three flag-deletion syntaxes; chain.mjs and walls use only legacy '-=' (senses-walls-cursors-10); Senses leans on core/dnd5e internals not registered in adjustments.yml (senses-walls-cursors-29); Three different 'who writes' predicates; light.mjs isGM means 'active GM' (senses-walls-cursors-17)
- **Extendability:** senses.mjs is both entry point and carried-light feature; features bolted on by side-effect import (senses-walls-cursors-23)
- **LLM interface:** No read API for light state; LLM reads six flag paths by hand (senses-walls-cursors-25, H); Chain API lives in a separate namespace and resolves only viewed-scene ids (senses-walls-cursors-26)
- **Documentation / skills:** Routing docs describe retired darkvision sync, bury senses in a bundle row; plan docs ship in modules (senses-walls-cursors-27)

### pentaryn-walls

13 findings, 2 high impact → [`code-audit-2026-10/walls.md`](code-audit-2026-10/walls.md)

- **Performance gains:** Hot-path obstacles() allocates a filtered array (and often a Set) per call (senses-walls-cursors-5)
- **Maintainability gains:** Segment construction repeated three ways (lintOnly, analyze, runEngine) (senses-walls-cursors-6); Sync ships Rust sources, wasm/target build output, tests, tools and design docs into Data/modules (senses-walls-cursors-28); No lang file: setting, keybindings and six toasts hard-coded English (senses-walls-cursors-36)
- **Defragmentation:** Wall-category logic copied three times (engine, backends, fixtures) (senses-walls-cursors-4); Dead, contradictory WASM_STATUS placeholder ('not yet built') (senses-walls-cursors-7)
- **Logging / auditability gains:** In 'auto' mode a wasm load failure is invisible; name it in the ready line (senses-walls-cursors-37)
- **Hardening:** undo() calls getFlag with a non-package scope (wall-autocomplete) and throws (senses-walls-cursors-1, H); wasm backend ignores wall levels; results diverge from JS reference and creates lose their level (senses-walls-cursors-2, H); Busy guard covers only keybindings; API/macro calls can overlap and chat writes are unawaited (senses-walls-cursors-9); canonical()/compare() is blind to levels and rule stamp so backend drift is invisible (senses-walls-cursors-3)
- **LLM interface:** preview() is not a pure read (chat card, pings, console); results omit backend and timing (senses-walls-cursors-33)
- **Documentation / skills:** References to nonexistent playbooks/ path and stale '44 fixtures' count (senses-walls-cursors-8)
- **Checked, nothing found:** Extendability (see `walls.md`)

### pentaryn-cursors

4 findings, 0 high impact → [`code-audit-2026-10/cursors.md`](code-audit-2026-10/cursors.md)

- **Maintainability gains:** Canvas attach sequence duplicated across canvasReady and ready; hooks not uninstallable (senses-walls-cursors-31)
- **Hardening:** Cursor resync/placement detection rely on unregistered core internals (senses-walls-cursors-30)
- **LLM interface:** Diagnosing a wrong cursor needs several evals; add one read-only status() (senses-walls-cursors-32)
- **Documentation / skills:** DESIGN.md is a plan doc inside the module; the credited alt-* SVGs are not dead code (senses-walls-cursors-35)
- **Checked, nothing found:** Performance gains, Defragmentation, Logging / auditability gains, Extendability (see `cursors.md`)

### pentaryn-aoe — WAIT

17 findings, 1 high impact → [`code-audit-2026-10/aoe.md`](code-audit-2026-10/aoe.md)

- **Performance gains:** describeToken scans game.actors once per token in the area (aoe-movement-portals-2); Fresh usage cards resolve their effects twice per render (aoe-movement-portals-14)
- **Maintainability gains:** BOOLS re-lists the DEFAULTS keys by hand (aoe-movement-portals-13); escape.mjs's trampoline, slot and register-once logic are untested (aoe-movement-portals-40)
- **Defragmentation:** Damage hydration and the apply-count filter are re-implemented outside core (aoe-movement-portals-4); Three resolvers for recorded {actor, token} targets and three for a message's activity, with different legacy handling (aoe-movement-portals-5); aoe's placementInProgress and cursors' previewActive read the same core internal; pin both, share one adjustments row, do not merge (aoe-movement-portals-39)
- **Logging / auditability gains:** The resolve pipeline stops silently at many early returns; no trace of why a tray did not appear (aoe-movement-portals-8); Swallowed backstop-delete error, unhandled rejections in tray and eraser click handlers, guard() untested (aoe-movement-portals-9)
- **Hardening:** Two GM sessions at ready can each create an "Area handle" actor (aoe-movement-portals-7); mutate's per-message queue map never shrinks and keeps every resolution object alive (aoe-movement-portals-6); uninstall() leaves the Argon bind wrap installed; guardArgonBind is untested (aoe-movement-portals-15); (new 2026-10-11, U-6-5 code) aim.mjs's hand-made RegionLayer#placeRegions wrap is never removed and a hot-patched copy cannot take it over, so Self cones stop aiming after a hot patch (aoe-movement-portals-44)
- **Extendability:** No written recipe for adding a Part; aoe's hook and election primitives should be the template (aoe-movement-portals-12); claimMessage is the repo's only tested two-session election; generalise it to any document (aoe-movement-portals-30)
- **LLM interface:** No read API for the tray state; return shapes are mixed and undocumented (aoe-movement-portals-10, H)
- **Documentation / skills:** Use-doc misses 2 of 11 settings (8 of 17 at 28ccc87) and 15 of 20 API methods; the cross-module flag contract is undocumented (aoe-movement-portals-11)

### pentaryn-movement

9 findings, 0 high impact → [`code-audit-2026-10/movement.md`](code-audit-2026-10/movement.md) · re-anchored to 4e64f47 on 2026-10-11 (0 resolved, 0 obsolete, 1 new: -42)

- **Performance gains:** Every ghost/owned check re-reads settings and re-summarises every combat, once per token per refresh (aoe-movement-portals-19)
- **Maintainability gains:** Keyboard ghost injection is untested logic inside the wrapper (aoe-movement-portals-18); Settings defaults declared twice; local copy of the fallback setting reader (aoe-movement-portals-21)
- **Logging / auditability gains:** Bare catches in a per-frame hook and in the toolbar render hide breakage completely (aoe-movement-portals-20)
- **Extendability:** Glue is never tested: no seam exports its functions for node tests (aoe-movement-portals-22)
- **LLM interface:** status() answers only for the viewed scene and does not name the setting keys (aoe-movement-portals-23)
- **Documentation / skills:** Two core private-method wraps and the token-layer sort replacement are missing from adjustments.yml (aoe-movement-portals-17); README cites Foundry source line numbers that drift, and does not mark setGhost as player-only (aoe-movement-portals-37)
- **Hardening:** (new 2026-10-11, U-8-7 code) The "ghost is back" toast names why ghost was cleared, not why it is allowed now, so a mid-fight policy change says "The fight is over" (aoe-movement-portals-42)
- **Checked, nothing found:** Defragmentation (see `movement.md`)

### pentaryn-portals

12 findings, 2 high impact → [`code-audit-2026-10/portals.md`](code-audit-2026-10/portals.md)

- **Performance gains:** Overlapping async badge rebuilds duplicate and corrupt the badge list; every region/behaviour change rebuilds unthrottled (aoe-movement-portals-24, H — partly resolved by U-9-6 in 17275c9: the generation guard landed, the debounce is still open); recordOf recomputes the GM list for every token (aoe-movement-portals-36)
- **Maintainability gains:** Pure geometry and parsing live in glue with no tests (aoe-movement-portals-26); No lang file: about 40 hardcoded English UI strings (aoe-movement-portals-29); "Is this a Marker or crowd token" is decided differently in portals, prompts and aoe; the contract is undocumented (aoe-movement-portals-38)
- **Defragmentation:** One 850-line glue file holds seven unrelated features (aoe-movement-portals-25; 966 lines at 4e64f47); (new 2026-10-11, U-8-4/U-6-13 code) Two hand copies of pentaryn-aoe's handle predicate in portals disagree with each other and with aoe (aoe-movement-portals-43)
- **Logging / auditability gains:** Swallowed errors including broken card images, plus unhandled rejections in async UI handlers (aoe-movement-portals-27)
- **Hardening:** Two GM sessions on one account both carry followers; the loser logs a false "summons did not follow" (aoe-movement-portals-28)
- **LLM interface:** No link/unlink or destinations API, so callers hand-build teleport behaviours; most entry points take documents only (aoe-movement-portals-32, H)
- **Documentation / skills:** Portals depends on core teleport internals with only one adjustments row (aoe-movement-portals-31); Flat README mixing use and internals; portals is not named in the routing row for scene links (aoe-movement-portals-33)
- **Checked, nothing found:** Extendability (see `portals.md`)

### pentaryn-importer

7 findings, 2 high impact → [`code-audit-2026-10/importer.md`](code-audit-2026-10/importer.md)

- **Performance gains:** findActorBySlug scans every world actor once per manifest entry (items-journal-7)
- **Maintainability gains:** Importer has no test runner: extract importer-core.mjs and gate it with node-test (items-journal-2, H)
- **Defragmentation:** 'shout(message); throw new X(message)' is pasted ten times; strip-key arrays are identical (items-journal-3)
- **Hardening:** importActors is not re-entrant: two concurrent calls race on the same actors (items-journal-4)
- **Extendability:** Importer replaces and freezes the shared game.pentaryn namespace; merge instead (items-journal-1, H)
- **LLM interface:** Importer's keys sit at the top of the shared namespace; give it an 'importer' sub-namespace and describe() (items-journal-5)
- **Documentation / skills:** Importer cites a nonexistent playbook path, a comment contradicts its code, README is stale (items-journal-6)
- **Checked, nothing found:** Logging / auditability gains (see `importer.md`)

### pentaryn-attunement

10 findings, 1 high impact → [`code-audit-2026-10/attunement.md`](code-audit-2026-10/attunement.md) · re-anchored to 4e64f47 on 2026-10-11 (0 resolved, 0 obsolete, 1 new: -39)

- **Performance gains:** Each sheet render reconciles slots twice and re-filters the away list per away slot (items-journal-13)
- **Maintainability gains:** Split the pure half into attunement-core.mjs so tests stop stubbing Hooks and importing the entry point (items-journal-8); restoreBond mixes decision and mutation, duplicates two branches, and repeats the Item Piles check (items-journal-9); Two different over-cap counts: warnOverCap uses att.value, the strip counts items (items-journal-12); Inline STRINGS with contradictory comments; only i18n path in scope without a lang file (items-journal-14)
- **Logging / auditability gains:** Async hook and listener handlers have no catch, so failures are anonymous unhandled rejections (items-journal-11)
- **Hardening:** stash() deletes the owner's items without checking that the container copies were created (items-journal-10, H); (new 2026-10-11, U-8-5 code) dnd5e `_positionItemTooltip` guard is a hand-assigned, untested prototype patch that runs ahead of the API publish (items-journal-39)
- **LLM interface:** Attunement API: document-only arguments, noisy report(), count-only stash(), no self-description (items-journal-16)
- **Documentation / skills:** Attunement README: stale fixture count, '??=' claim, and no API section (items-journal-17)
- **Checked, nothing found:** Defragmentation, Extendability (see `attunement.md`)

### pentaryn-dropbin

13 findings, 1 high impact → [`code-audit-2026-10/dropbin.md`](code-audit-2026-10/dropbin.md)

- **Performance gains:** Every ledger entry rewrites and broadcasts the whole ledger, then re-uploads the whole JSON mirror (items-journal-19); Journal-directory filter scans every scene's notes once per sidebar row (items-journal-24); Ready-time backfills write one actor at a time and run on every GM client (items-journal-25); Corpse eye redraws its disc on every refreshToken; effect hooks queue timers on non-GM clients (items-journal-30)
- **Maintainability gains:** The ledger has no tests: extract ledger-core.mjs (items-journal-20); Hardcoded English strings despite a lang file; module id declared in three places (items-journal-26); Dead guard: the 'restoring' option is set on a create but checked on delete (items-journal-27)
- **Defragmentation:** dropbin.mjs carries five unrelated concerns; split it without changing load behaviour (items-journal-22)
- **Logging / auditability gains:** Player-side ledger submits reject unhandled when no GM is online; corpse revive toggle is unawaited (items-journal-21)
- **Hardening:** Concurrent ledger writes reuse numbers (read-modify-write across awaits) (items-journal-18, H); getFlag('item-piles', ...) throws when Item Piles is inactive; several pile-detection variants in one module (items-journal-23)
- **LLM interface:** Dropbin API: list() returns full item sources, restore() returns Notification objects, resolver duplicates attunement's (items-journal-28)
- **Documentation / skills:** adjustments.yml leaves several Item Piles patches unregistered (items-journal-29)
- **Checked, nothing found:** Extendability (see `dropbin.md`)

### pentaryn-journal

7 findings, 0 high impact → [`code-audit-2026-10/journal.md`](code-audit-2026-10/journal.md)

- **Performance gains:** Every world item update re-sanitizes and re-hashes every open readable (items-journal-33); isEyeReadable scans every scene's notes on every journal-sheet render (items-journal-38)
- **Maintainability gains:** Privacy and visibility rules live in untested glue: move them into journal-core with fixtures (items-journal-34)
- **Defragmentation:** Two HTML escapers inside one module; use core.escapeHTML for the bar only (items-journal-32)
- **Logging / auditability gains:** Bare catch in activateNote; 'warn' is a toast; save refusals leave no console trace (items-journal-36)
- **LLM interface:** An LLM (running as GM) gets null from add() and status(); no per-user read; four indistinguishable null reasons (items-journal-35)
- **Documentation / skills:** Journal has no routing row; README says report() is GM-only but code has no gate; folderName and system relationship undocumented (items-journal-37)
- **Checked, nothing found:** Hardening, Extendability (see `journal.md`)

### Python tooling (Makefile, ops, updater, content, MCP server, dnd-scripts tools, tests)

52 findings, 4 high impact → [`code-audit-2026-10/python-tooling.md`](code-audit-2026-10/python-tooling.md)

- **Performance gains:** Run the parse gate's node --check calls concurrently (python-tooling-6); snapshot_digest stats every file three times (python-tooling-25); Discovery AST-parses every script; benign skips flood stderr (python-tooling-27)
- **Maintainability gains:** Add aggregate targets: make test, foundry-modules-check, generated help (python-tooling-8); Split the 285-line escalate._run along its sections (python-tooling-21); build_actors re-reads every sheet and has no golden test (python-tooling-26); No conftest; duplicated FoundryAdmin fakes; unmarked live-repo tests (python-tooling-34); Updater shells to make which shells back into ops (python-tooling-15); Duplicate policy->Spec builders and dead aliases (python-tooling-19); prompt-marker-art.py is hyphenated and cannot be imported or tested (python-tooling-38); Retired combat-runner code (ready-ref, unused _DICE_RE, stale comments) (python-tooling-46); test_dnd_roller writes and deletes the real ~/.cache dice cache (python-tooling-52)
- **Defragmentation:** Make the module registry provably complete; register pings; keep after_sync next to each module (python-tooling-3); One Foundry-app module for probes and start/stop (python-tooling-12); Release-note rendering duplicated; adjudicate's copy crashes on null published (python-tooling-18); FOUNDRY_DATA means two different directories; centralise paths (python-tooling-13); Four pid-liveness helpers with contradictory PermissionError semantics (python-tooling-14); Copy-pasted Infisical fetch; source_of_record refetches (python-tooling-16); Bundle/cache-key/reuse loop duplicated between _run and preview (python-tooling-20); Filename-sanitising regex inlined repeatedly (python-tooling-22); escalate and report import each other lazily (python-tooling-39); In-process MCP modules carry an unused, divergent CLI dispatch (python-tooling-50); pipeline.stage installs the importer with its own non-atomic copy (python-tooling-53)
- **Logging / auditability gains:** Record every module sync (JSONL ops log + sync stamp) (python-tooling-10); Swallowed updater exceptions leave no trace in the run record (python-tooling-23); dnd-scripts has no per-call action log (python-tooling-29); eval.jsonl is unrotated and its comment contradicts the code (python-tooling-30); Ad-hoc print helpers, no structured event output (python-tooling-33)
- **Hardening:** Gate the ties suite: add test/run.mjs and add node-test to its checks (python-tooling-7, H); foundry-down returns before Foundry has released the port (python-tooling-11, H); escalate.make_checks() scrapes Makefile text instead of the module registry (python-tooling-2); module-sync deletes the live module before copying (non-atomic) (python-tooling-5); Drift note names the wrong make target; same-version content drift is invisible (python-tooling-9); gh_api()/forks._gh() raise on timeout or missing gh (python-tooling-17); Hardcoded interpreter and node paths in the updater (python-tooling-24); make login: double status call and KeyError on missing _id (python-tooling-31); osascript fallback does not escape title/subtitle (python-tooling-32); bridge.scan: unguarded int() and one ps per process (python-tooling-37); combat_actions_db rewrites drop comment and malformed lines, warning never reaches the LLM (python-tooling-42); a spec carrying npc/action re-keys the row (python-tooling-43); unlocked read-modify-writes under an 8-thread server (python-tooling-44); check_lore_links drops `zone`, build_timeline_key writes outside the repo (python-tooling-49); roll_dice can hang a worker: asyncio.Lock and httpx client shared across per-call event loops (python-tooling-51)
- **Extendability:** Add a module skeleton and `ops module-new` (python-tooling-4, H); Replace per-module make lines with pattern rules plus explicit aliases (python-tooling-1); The actions validator accepts rows build_actors rejects (`turn`, `2D6`); pin the contract (python-tooling-45)
- **LLM interface:** Expose read-only module and action-log tools via dnd-scripts (python-tooling-28, H); Add --json to module-check, status and bridge-status (python-tooling-41); dnd-scripts contracts: two error channels, 7 tools without annotations, SRD descriptions never point at the owned books (python-tooling-48)
- **Documentation / skills:** README lists few tooling files and there is no build-a-module use-doc (python-tooling-35); Generate the module index; fail check-context when stale (python-tooling-36); combat_action_upsert points at a template written for the retired launcher (python-tooling-47)

### MCP fork (foundry-vtt-mcp, branch pentaryn)

26 findings, 4 high impact → [`code-audit-2026-10/mcp-fork.md`](code-audit-2026-10/mcp-fork.md)

- **Performance gains:** The sanitizer rebuilds constant key arrays for every object it visits (mcp-fork-18)
- **Maintainability gains:** Extract and test serialize(): it has dead code and undocumented rules (mcp-fork-9); Split the ~375-line schema block out of prompt-markers.ts and remove internal duplicates (mcp-fork-14)
- **Defragmentation:** Two log writers read the same env var and append in two different ways (mcp-fork-5); Four implementations of the CONFIG.queries GM guard with different errors (mcp-fork-24)
- **Logging / auditability gains:** Upstream write tools never reach the action log (mcp-fork-1, H); Failed evals are logged ok:true and every eval script is stored twice (mcp-fork-4); No session or caller id in the logs though several sessions share one broker (mcp-fork-7); A replace made through specFile logs only the file path, not the spec (mcp-fork-16); An eval-js call rejected for bad arguments leaves no line in eval.jsonl (mcp-fork-17); No repeatable report from the action logs though they drive tool promotion (mcp-fork-25)
- **Hardening:** Any player can trigger upstream bridge queries through User#query (mcp-fork-2, H); The eval timeout timer is never cleared and a timeout looks like a script error (mcp-fork-8); Recharge resolves actors differently from the tool that created the feature and its write is unlogged (mcp-fork-10); The fork's zod copy of prompts vocabularies can drift from the module's validators (mcp-fork-15); The action log's month is fixed when the backend starts (mcp-fork-6); The tool-list change detector ignores schema changes and same-length description edits (mcp-fork-12); The tool filter hides upstream tools but does not block calls to them (mcp-fork-13)
- **Extendability:** Pin (tests only) the drift between the tool's zod schemas and what the module accepts (prompts-lookup-11, H); The fork's upstream footprint is undocumented and larger than claimed (mcp-fork-11); One per-action table in the tool and one query list in the module (prompts-lookup-12); Type the fork tool contract: result fields and the write flag (mcp-fork-22)
- **LLM interface:** No index of game.pentaryn namespaces where an LLM looks first (mcp-fork-20); The eval-js description hides the serializer rules and where pentaryn APIs live (mcp-fork-21)
- **Documentation / skills:** No use-doc for the fork, and the docs that exist say it is unimplemented (mcp-fork-19, H); Source comments describe things that are not there (mcp-fork-23)

## Totals — addon × category

| Addon | Perf | Maint | Defrag | Log | Harden | Extend | LLM | Docs | Total | High |
|---|---|---|---|---|---|---|---|---|---|---|
| ties | 10 | 3 | 11 | 2 | 5 | 3 | 7 | 2 | 43 | 8 |
| prompts | 3 | 5 | 5 | 2 | 3 | 1 | 1 | 1 | 21 | 0 |
| lookup | 1 | 1 | 0 | 1 | 2 | 0 | 2 | 1 | 8 | 3 |
| combat | 4 | 4 | 7 | 2 | 6 | 2 | 3 | 2 | 30 | 5 |
| riders | 1 | 2 | 0 | 2 | 1 | 0 | 1 | 1 | 8 | 0 |
| transform | 4 | 4 | 3 | 1 | 7 | 1 | 1 | 3 | 24 | 1 |
| creatures | 3 | 0 | 1 | 1 | 2 | 0 | 1 | 0 | 8 | 0 |
| names | 0 | 1 | 0 | 1 | 0 | 0 | 1 | 0 | 3 | 0 |
| pings | 0 | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 3 | 0 |
| senses | 5 | 4 | 2 | 2 | 3 | 1 | 2 | 1 | 20 | 1 |
| walls | 1 | 3 | 2 | 1 | 4 | 0 | 1 | 1 | 13 | 2 |
| cursors | 0 | 1 | 0 | 0 | 1 | 0 | 1 | 1 | 4 | 0 |
| aoe | 2 | 2 | 3 | 2 | 4 | 2 | 1 | 1 | 17 | 1 |
| movement | 1 | 2 | 0 | 1 | 1 | 1 | 1 | 2 | 9 | 0 |
| portals | 2 | 3 | 2 | 1 | 1 | 0 | 1 | 2 | 12 | 2 |
| importer | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 1 | 7 | 2 |
| attunement | 1 | 4 | 0 | 1 | 2 | 0 | 1 | 1 | 10 | 1 |
| dropbin | 4 | 3 | 1 | 1 | 2 | 0 | 1 | 1 | 13 | 1 |
| journal | 2 | 1 | 1 | 1 | 0 | 0 | 1 | 1 | 7 | 0 |
| python-tooling | 3 | 9 | 11 | 5 | 15 | 3 | 3 | 3 | 52 | 4 |
| mcp-fork | 1 | 2 | 2 | 6 | 7 | 4 | 2 | 2 | 26 | 4 |
| **Total** | **49** | **56** | **52** | **33** | **67** | **20** | **34** | **27** | **338** | **35** |

A `0` means the category was checked and nothing was found; each addon file's *Categories checked with no finding* section says what was looked at. Column key: Perf = Performance gains, Maint = Maintainability gains, Defrag = Defragmentation, Log = Logging / auditability gains, Harden = Hardening, Extend = Extendability, LLM = LLM interface, Docs = Documentation / skills.

High-impact findings by category: Performance gains 3, Maintainability gains 2, Defragmentation 1, Logging / auditability gains 1, Hardening 8, Extendability 4, LLM interface 15, Documentation / skills 1.

### All high-impact findings

| Id | Addon | Category | Title |
|---|---|---|---|
| ties-1 | ties | Maintainability gains | ties test suites (196 cases) never run in make foundry-ties-check |
| ties-3 | ties | LLM interface | One aggregate read: game.pentaryn.ties.dossier(ref) |
| ties-4 | ties | LLM interface | API calls need Actor documents; add a ref resolver at the API boundary |
| ties-6 | ties | LLM interface | Publish the internals LLMs already reach by dynamic import |
| ties-7 | ties | Extendability | Table-driven API with a self-describing help() manifest |
| ties-8 | ties | LLM interface | Extract knowsAbout(character, subject) from the Look window and publish it |
| ties-9 | ties | LLM interface | Named wrappers for lore rows, conceal and 'mark as learned' (today raw-flag recipes) |
| ties-37 | ties | Hardening | Field-drop guard: fixtures proving reader/writer literals name every stored field |
| prompts-lookup-1 | lookup | Performance gains | Cache the loaded book packs and their plain text; remove the dead textCache |
| prompts-lookup-2 | lookup | LLM interface | Make game.pentaryn.rules self-describing: VERSION, describe(), module api, documented return shapes |
| prompts-lookup-3 | lookup | LLM interface | Register GM-guarded CONFIG.queries for the read-only lookups so a typed MCP tool can replace eval-js |
| combat-riders-1 | combat | Performance gains | Memoise fullAttackState / combatContext / weaponsOf / featuresOf per tick |
| combat-riders-11 | combat | LLM interface | game.pentaryn.combat.inspect(ref): one read-only call for turn, plan, pips, follow-ups, riders, settings |
| combat-riders-12 | combat | LLM interface | Resolve actor refs (doc / token / uuid / id / name) at the API boundary of combat and riders |
| combat-riders-13 | combat | LLM interface | describe() and settings() on both namespaces, generated from existing tables |
| combat-riders-18 | combat | Defragmentation | Argon injection across combat, transform and riders: implicit hook order, Reaction-slot double relabel, forked tooltip helpers |
| transform-creatures-17 | transform | LLM interface | No one-call read of a druid's shape state; LLMs fall back to raw flag reads |
| senses-walls-cursors-25 | senses | LLM interface | No read API for light state; LLM reads six flag paths by hand |
| senses-walls-cursors-1 | walls | Hardening | undo() calls getFlag with a non-package scope (wall-autocomplete) and throws |
| senses-walls-cursors-2 | walls | Hardening | wasm backend ignores wall levels; results diverge from JS reference and creates lose their level |
| aoe-movement-portals-10 | aoe | LLM interface | No read API for the tray state; return shapes are mixed and undocumented |
| aoe-movement-portals-24 | portals | Performance gains | Overlapping async badge rebuilds duplicate and corrupt the badge list; every region/behaviour change rebuilds unthrottled |
| aoe-movement-portals-32 | portals | LLM interface | No link/unlink or destinations API, so callers hand-build teleport behaviours; most entry points take documents only |
| items-journal-1 | importer | Extendability | Importer replaces and freezes the shared game.pentaryn namespace; merge instead |
| items-journal-2 | importer | Maintainability gains | Importer has no test runner: extract importer-core.mjs and gate it with node-test |
| items-journal-10 | attunement | Hardening | stash() deletes the owner's items without checking that the container copies were created |
| items-journal-18 | dropbin | Hardening | Concurrent ledger writes reuse numbers (read-modify-write across awaits) |
| python-tooling-4 | python-tooling | Extendability | Add a module skeleton and `ops module-new` |
| python-tooling-7 | python-tooling | Hardening | Gate the ties suite: add test/run.mjs and add node-test to its checks |
| python-tooling-11 | python-tooling | Hardening | foundry-down returns before Foundry has released the port |
| python-tooling-28 | python-tooling | LLM interface | Expose read-only module and action-log tools via dnd-scripts |
| mcp-fork-1 | mcp-fork | Logging / auditability gains | Upstream write tools never reach the action log |
| mcp-fork-2 | mcp-fork | Hardening | Any player can trigger upstream bridge queries through User#query |
| prompts-lookup-11 | mcp-fork | Extendability | Pin (tests only) the drift between the tool's zod schemas and what the module accepts |
| mcp-fork-19 | mcp-fork | Documentation / skills | No use-doc for the fork, and the docs that exist say it is unimplemented |

## Cross-cutting design

*Cross-cutting refactor programme — pentaryn Foundry addons, tooling and MCP fork.*

Snapshot: pentaryn `ee505c2` plus uncommitted changes; fork `59c781e`. Line numbers refer to the snapshot. Nothing here adds a player-visible feature; every item is either a pure move, an additive read, a test, a doc, or a declared hardening fix that only changes a failure path. Items that change a failure path are marked **[declared]** and must go to the live-test workflow before merge.

Three constraints shape every decision below:

1. **Modules cannot import across module directories.** `scripts/foundry/ops/modules.py:146-147` fails the imports gate on `imports {imp.spec} — outside the module directory`, and combat/hud.mjs:35 avoids it on purpose. Any "shared" code is therefore a **vendored kit**: canonical source in one place, byte-identical copies inside each module, a gate that proves identity.
2. **`pentaryn-importer` replaces and freezes `game.pentaryn`** (pentaryn-importer.mjs:1233, anchor `game.pentaryn = Object.freeze({`). This is the root of 19 guard copies and the `setTimeout(0)` publish ordering. It is the keystone change (items-journal-1) and lands first.
3. **combat, transform and aoe are in flux** (uncommitted; `turnflow.mjs` untracked) and `foundry/adjustments.yml` is being edited live. Every wave that touches those files is marked **WAIT** and re-anchors against the live tree before editing.

---

### 1. Defragmentation

#### 1.1 The vendored kit: `foundry/lib/` → `foundry/module/<m>/lib/`

Canonical source lives in `foundry/lib/*.mjs` (new directory, pure, node-tested in `foundry/lib/test/run.mjs`). `make foundry-lib-vendor` copies each file a module declares into `foundry/module/<m>/lib/<file>.mjs`, committed alongside the module so the repo tree equals the deployed tree and the imports gate (`modules.py:146`) sees an in-directory import. A new `vendor` gate in `modules.py check()` fails when a copy differs from the canonical file. `ModuleSpec` gains `lib=("publish","hooks",...)`. No runtime dependency, no load order, no new Foundry module to activate in worlds; node tests import the copy directly.

A `pentaryn-lib` Foundry module (`relationships.requires` + `game.modules.get().api`) is the phase-2 option once every module uses the kit; it is not needed to start and it would add a load-order dependency that today does not exist.

| Kit file | Contents (all pure or stub-testable) | Absorbs (finding ids) | Replaces these copies |
|---|---|---|---|
| `lib/publish.mjs` | `publishNamespace(root, ns, api, {describe})` with today's frozen-root guard kept until items-journal-1 lands; idempotently installs `root.describe()` (enumerates namespaces that expose `describe`) and `root.inspect(ref)` (fans out to every namespace that exposes `inspect`, returns `{[ns]: result}`) | transform-creatures-16, senses-walls-cursors-34, items-journal-1 (consumer side) | 19 guard blocks: aoe/aoe.mjs:48, attunement.mjs:866, combat/combat.mjs:220, creatures.mjs:354, cursors.mjs:150, dropbin.mjs:277, journal.mjs:602, lookup.mjs:433, movement.mjs:423, names.mjs:53, pings.mjs:233, portals.mjs:847, prompts.mjs:346, riders.mjs:659, senses/senses.mjs:120, senses/chain.mjs:263, ties/pentaryn-ties.mjs:310, transform.mjs:781, walls.mjs:264 (anchor: `if (current && !Object.isExtensible(current)) game.pentaryn = { ...current,`) |
| `lib/hooks.mjs` | `hookRegistry(moduleId)` → `{on, once, off, offAll, ids, guard}`; `guard(label, fn)` **passes return values through** (veto semantics, e.g. riders `dnd5e.preUseActivity` returns false) and attaches `.catch(warn)` to thenables. Note aoe's current `guard()` (hooks.mjs:23) returns `undefined` for promises; keep that exact body under a `guardAoe` alias until aoe is re-characterised | aoe `hooks.mjs on()` (:8), senses light.mjs:670 and chain.mjs:243, combat-riders-30, senses-walls-cursors-16, senses-walls-cursors-31, transform-creatures-8 step 2 | four hook idioms (§2 of the map) |
| `lib/log.mjs` | `makeLog(moduleId)` → `{error, warn, info, debug, warnOnce, swallow, trace, traces}`; debug gated by `CONFIG.debug[moduleId]`; `trace` ring buffer (200) exposed as `api.trace()` | combat-riders-9, -10, transform-creatures-15, ties-33, ties-34, prompts-lookup-17, senses-walls-cursors-14/-15, aoe-movement-portals-8, -20, -27, transform-creatures-29, items-journal-11, -21, -36, movement.mjs:379/385 bare catches | every `console.warn(\`${MODULE} \| …\`)` prefix stays byte-identical; swallowed catches gain a debug line |
| `lib/settings.mjs` | `defineSettings(moduleId, TABLE)` registering in table order; `settingReader(moduleId, DEFAULTS)` → `setting(key, fallback = DEFAULTS[key])` with aoe/settings.mjs:75 try/catch semantics; `settingsSnapshot()` | aoe/settings.mjs:75, combat/settings.mjs:58, creatures.mjs:22, movement.mjs:50, prompts/dialog.mjs:27, gather.mjs:13; prompts-lookup-16, aoe-movement-portals-13, -21, combat-riders-25 (step 1), transform-creatures-35 | six fallback readers; inline registrations in ties, journal, prompts, cursors, walls, riders, pings |
| `lib/election.mjs` | `isActiveGM()`, `isAnyGM()`, `pickRunner(ownerIds)`, `claimDocument(doc, key, {scope, settleMs, reread})` (aoe/hooks.mjs:55 body) with `claimMessage` alias; `stakeAndConfirm` (ties/study.mjs:159) | aoe-movement-portals-30, ties-39, senses-walls-cursors-17, transform-creatures-30 (comment), aoe-movement-portals-28 | seven "who writes" semantics (map §3.5) become three named predicates; call sites keep whichever predicate they use today — no site changes its truth table |
| `lib/resolve.mjs` | `resolveActor(ref)` (Actor \| Token \| TokenDocument \| id \| uuid via `fromUuidSync` \| exact name), `resolveToken(ref, scene)`, `resolveRegion(ref)`, `toIdSet(ids)`; throws `Error('pentaryn-<m>: no actor for …')` only when asked to | ties-4, combat-riders-12, transform-creatures-17 (resolver part), -31, items-journal-16 (1), -28, -35 (userRef), aoe-movement-portals-32 (`regionOf`), senses-walls-cursors-26 (`docOf` uuid) | ties/known.mjs:100 `resolveActor`, ties-api.mjs:60 `baseActorOf`, senses.mjs:98 `actorOf`, chain.mjs:37 and worn.mjs:44 `docOf`, corpses.mjs:36 `tokensOf` — wrap at the API boundary only; internals keep their own resolvers |
| `lib/queries.mjs` | `guarded(fn, {codedError})` copied verbatim from prompts.mjs:261 (anchor `function guarded(fn) {`); `registerQueries(moduleId, HANDLERS)` loop | prompts-lookup-3, -12, ties-3 (optional query), aoe-movement-portals-10 (later query), mcp-fork-24 | prompts' local copy becomes the kit copy |
| `lib/patch.mjs` | `wrapMethod(proto, name, make, {marker, define, libWrapperPath})` recording to `PATCHES[]`; libWrapper when present else the hand-wrap with the given marker | combat-riders-8, transform-creatures-5 (glue part), movement.mjs:113-160, pings.mjs:166-183, creatures.mjs:152, prompts.mjs:161, riders/rituals.mjs:92 | five patch idioms (map §2). **Migration rule:** keep each site's existing marker name (`__pentarynMovement`, `__pentarynPatched`, `_pcSettles`, `patchPortrait`) because adjustments.yml rows grep for them; libWrapper adoption at movement is **not** in scope (aoe-movement-portals-18 explains why) |
| `lib/i18n.mjs` | `makeT(prefix)` → `{t, f}`; `esc = foundry.utils.escapeHTML` **for new code only** | ties-15 (`t`/`f`), combat-riders-5 (`T`), transform-creatures-4 (`T`), senses-walls-cursors-18 (`L`) | 22 `t`, 11 `f`, 8 `T`, 3 `L` copies. **HTML escape is three behaviours (map §3.2)**: pin each copy's output for ``<a href="x">'&"</a>`` first; migrate only the `escapeHTML`-based ones (ties review-ui:56, preview:80, look:77, journal:40 bar only (items-journal-32), aoe effects:29, tray:17, portals:34); the `&#39;` hand-rolled copies stay local with a header comment; prompts/dialog.mjs:31 (no `'` escape) is a **[declared]** fix routed to live test |
| `lib/argon-kit.mjs` (combat, transform only) | `dropTooltip`, `paintBadge(button, left, emptyClass)`, `applyButtons(panel, buttons, {attachDetached})`, `itemButtonClass`, `slotKind`, `mainPanel`, `settlePips` | transform-creatures-12, combat-riders-3, -5, -18 phase 1 | combat/hud.mjs:37/85/100/120/128, transform/hud.mjs:35/108/457/439, turnflow.mjs:26. `applyButtons` is combat's superset; transform adopts the attach branch only after live test proves it never fires for transform's panels |
| `lib/test-harness.mjs` | `check(name, got, want)`, `ok`, `section`, `summary()` printing `N passed, M failed` and setting `process.exitCode` | map §2 "Test harness" | 14 pasted `check()/ok()` pairs (aoe test/run.mjs:20, combat :26 …); lookup and walls keep their `t()/eq()` and only adopt `summary()` |

#### 1.2 Merge / split decisions

| Module | Decision | Why not the alternative | Absorbs |
|---|---|---|---|
| **importer** | Merge into `game.pentaryn` instead of replacing/freezing; publish `importer` sub-namespace, keep top-level aliases; extract `importer-core.mjs`; add runner and node-test gate | A separate root object would still leave 19 guards | items-journal-1, -2, -3, -4 [declared], -5, -6, -7 |
| **ties** | Stay one module (flag scope `pentaryn-ties` is data). Internal folders behind barrels: `study/` (ties-35), `core/` (ties-36), `util.mjs`, `row-ui.mjs`, `live.mjs`, `socket.mjs`, `api.mjs`, `dossier.mjs`; README architecture table + import-direction test | A second module means a data migration | ties-12…18, -35, -36, -38, -39, -40, -41, -42, -45 |
| **combat** | Keep turnflow inside combat (settings keyed `pentaryn-combat.*`). Split `hud/`, `turnflow/`, `core/` behind barrels; rename `riders.mjs` → `turn-riders.mjs`; `events.mjs`; plan doc `context/plans/combat-turnflow-split.md` for a future `pentaryn-table` module with a settings-migration shim | A `pentaryn-table` module today is a settings migration = behaviour change | combat-riders-4, -5, -6, -7, -14, -17, -20, -21, -34 **WAIT** |
| **riders** | Split entry by concern; one `MOD`; settings table; keep rituals/concentration/argon-tidy here but document ownership in a "Which riders module?" table | Moving Argon tidy-ups into combat changes which module's setting gates them | combat-riders-23, -25, -26 |
| **transform** | List `starry.mjs` in `esmodules` explicitly; vendor argon-kit; pure seams for HUD decisions | — | transform-creatures-3…-10, -12 **WAIT** |
| **dropbin** | Split into `ledger.mjs`+`ledger-core.mjs`, `itempiles-attunement.mjs`, `itempiles-locks.mjs`, `visibility.mjs`; keep `dropbin.mjs` as the only esmodule with the order corpses → loot → i18n-shim → ledger → attunement → locks → visibility. Attunement repair **stays** in dropbin; the ownership is written down in both READMEs and adjustments rows | Moving Item Piles patches into attunement changes which module's enablement gates them | items-journal-20, -22, -23, -26, -27, -29 |
| **portals** | Split into `cards`, `snapshot`, `badges`, `party`, `card-app`, `api`; `portals-core` grows the pure geometry; add `lang/en.json` (restart batch) | — | aoe-movement-portals-25, -26, -29, -38 |
| **senses** | Feature index: `carried.mjs`, `light.mjs`, `chain.mjs`, `glow.mjs`+`glow-core.mjs`, `migrate.mjs`, each `{install, uninstall, api}`; `ids.mjs`, `util.mjs`, `hooks.mjs`; `game.pentaryn.senses.chain` alias of `game.pentaryn.chain` | Chain is not a sense but splitting it out is a flag-scope migration | senses-walls-cursors-10, -12, -16, -17, -18, -21, -23, -24, -26, -34 |
| **prompts** | `geometry-core` → 8 core files behind the barrel; `kinds/` planner registry; `packs.mjs`; `settings.mjs`; `queries.mjs`; `api-manifest.mjs` | — | prompts-lookup-9, -10, -12, -13, -16, -20, -21, -22, -24 |
| **lookup** | Adapter logic (monsters filter/sort, pack tables, registry guards) moves into `lookup-core.mjs`; book cache | — | prompts-lookup-1, -4, -5, -6 |
| **walls** | `wallCategory` exported once; `toSegs/reindex`; `planUndo` pure; wasm delegates to JS when levels present **[declared]** | — | senses-walls-cursors-1, -2, -3, -4, -6, -7 |
| **attunement** | `attunement-core.mjs` seam; tests stop stubbing `Hooks` | — | items-journal-8, -9, -12, -14 step 1 |
| **names / pings** | Both get `<m>-core.mjs`, `test/run.mjs`, ModuleSpec with node-test, Makefile pattern coverage; pings gets README, lang (restart batch), adjustments rows | — | transform-creatures-32, -35, -36, python-tooling-3 |
| **cursors** | `attach()` factored; `status()`; adjustments row | — | senses-walls-cursors-30, -31, -32 |
| **movement** | `_internals` test seam; SETTINGS table; ghost context; three adjustments rows | — | aoe-movement-portals-17…-23, -37 |
| **journal** | privacy/visibility rules into core; pinned-id cache; `entriesOf`/`statusFor` | — | items-journal-32…-38 |
| **aoe** | Already the template. `messages.mjs` resolvers, `summariseResolution` core, trace ring, handle-actor fixed id **[declared]** | — | aoe-movement-portals-2, -4…-15, -30 **WAIT** |
| **Python ops** | `scripts/foundry/app.py`, `paths.py`, `procs.py`, `secrets.py`, `update/notes.py`, `update/scrub.py`, `llm.policy_spec`; `escalate._run` split | — | python-tooling-12…-16, -18…-22, -24, -38, -39 |
| **dnd-scripts** | `scripts/_cli.py` (one schema-driven flag parser), `scripts/_paths.py` (confined output paths); `combat_actions_db` exports the actions vocabulary and `build_actors` exposes `ROW_TYPES` so one contract test compares them; no script merges | Merging the actions DB into build_actors would couple the MCP authoring tool to the Foundry build | python-tooling-45, -46, -49, -50 |
| **Fork** | `action-log.ts`, `serialize.ts`, `tool-list-watch.ts`, `prompt-markers.schema.ts`, `upstream-writes.ts`, `recharge.ts` (both packages) | — | mcp-fork-5, -9, -10, -11, -12, -14 |

#### 1.3 Same name, different contract — never merge (pin instead)

Each pair gets a cross-reference comment and a fixture pinning both outputs on the same input table: `normalizeName` (combat-core.mjs:31 vs riders-core.mjs:127), `fnv1a` (journal-core.mjs:46 vs geometry-core.mjs:521), `tokenOf` (combat/shapes.mjs:290 vs transform.mjs:195), `featuresOf` (combat/shapes.mjs:77 vs riders.mjs:79), `lightUpdate` (creatures-core.mjs:56 vs senses.mjs:44 — transform-creatures-28 composes them in one fixture), HTML-to-text (prompts-lookup-28), Marker/crowd predicates (aoe-movement-portals-38), pile detection in aoe vs portals (aoe-movement-portals-36), `pinnedEntryIds` dropbin vs journal (items-journal-24/-38: deliberate copies), SIZE_WORDS prompts vs lookup (prompts-lookup-9), the region-placement predicates `placementInProgress` (aoe core.mjs:228) vs `previewActive`/`placementActive` (cursors.mjs:73, cursors-core.mjs:58), which answer "can Escape cancel" vs "is the preview drawn" (aoe-movement-portals-39).

#### 1.4 Dead code to retire

| Location | Item | Finding |
|---|---|---|
| ties attributes.mjs:1229 and others | ~11 dead exports, 5 CSS rules, line 522 simplification (publish `branchOf` first) | ties-42 |
| combat/combat.mjs:246; combat.css | two re-exports, one CSS rule | combat-riders-34 **WAIT** |
| walls/backends.mjs:42 | `WASM_STATUS` placeholder | senses-walls-cursors-7 |
| lookup/pentaryn-lookup.mjs:64 | `textCache` (raw HTML cache) | prompts-lookup-1 |
| dropbin.mjs:193/228 | `restoring` option checked on the wrong hook | items-journal-27 |
| fork handlers.ts:86; registry.ts:137 | unreachable `Set` branch in `serialize`; dead deny branch in `dispatch` | mcp-fork-9, -13 |
| update/risk.py `_preview_blockers`; `DENIED_TOOLS` aliases; report/adjudicate duplicate `spec()` | after grep over `scripts/` and `automation/` | python-tooling-19 |
| module-folder design docs (WILDSHAPE-DESIGN.md, LIGHT-DESIGN.md, cursors/DESIGN.md) | move to `context/plans/`. **Not** the cursors `assets/src/alt-*` SVGs: they are credited alternates (cursors README:96–100, `assets/src/CREDITS.md`) and stay | transform-creatures-19, senses-walls-cursors-27, -35 |
| scripts/combat_actions_db.py:497–540, 563–586; scripts/dnd_roller.py:502 | `format_ready_reference` + `ready-ref` (tell an LLM to call the retired `roll_combat_action`), unused `_DICE_RE`, comments naming a nonexistent `gui.event_bus` | python-tooling-46 |
| tool literals in scripts/lore.py, srd5_2.py, ages_converter.py | `argv`/`value_flags` that MCP never uses once `MCP_HANDLERS` is bound | python-tooling-50 |

---

### 2. Addon blueprint

#### 2.1 Standard layout

```
foundry/module/pentaryn-<short>/
  module.json            id, esmodules: ["<short>.mjs"] (list every runtime file that must evaluate, in order),
                         languages, compatibility.minimum "14" (dnd5e-6 modules),
                         flags.pentaryn: { namespace, flagScope, cssPrefix, afterSync: [...] }   <- single source of truth
  <short>.mjs            ENTRY. Imports feature files in load order (commented), init: defineSettings +
                         keybindings + registerQueries, ready: publishNamespace. No logic.
  <short>-core.mjs       PURE. No Foundry globals. Becomes core/*.mjs behind this barrel past ~600 lines.
  settings.mjs           DEFAULTS table (key, scope, config, type, default, onChange name) + setting()
  api.mjs                API_TABLE rows {path, fn, gm, writes, args, returns}; buildApi(); describe(); inspect()
  queries.mjs            CONFIG.queries["pentaryn-<short>.<read>"] = guarded(...) for read-only entries
  <feature>.mjs          GLUE per feature: export install(reg)/uninstall(); hooks only through the registry
  lib/                   vendored kit copies (identity-gated, never edited here)
  lang/en.json           nested, root key PENTARYN_<SHORT>, leaf keys camelCase
  styles/<short>.css     every rule scoped under .pentaryn-<short>; short prefix registered in the table below
  test/run.mjs           harness; test/hooks.mjs (hook manifest); test/api.mjs (surface + describe pin)
  README.md              fixed section order: Read this when · What the player sees · Files (load order) ·
                         API (table: method | args | returns | null when | GM | writes) · Settings · Flags
                         other modules read · Hooks and patches (link adjustments rows) · Two sessions ·
                         Extending · Tests · Sync
  CHANGELOG.md           version notes (moved out of README)
```

Conventions that currently diverge and the single answer:

| Topic | Standard | Today's divergence it retires |
|---|---|---|
| Module id constant | `export const MODULE = "pentaryn-<short>"` in `<short>-core.mjs`; everything imports it | `MODULE`/`MOD`/`MODULE_ID`/`SCOPE`; riders ×3, senses ×4 |
| Namespace | `game.pentaryn.<short>`; exceptions recorded in `flags.pentaryn.namespace` (`rules`, `chain` alias) | lookup → `rules`, senses → two namespaces |
| `flagScope` | equals module id; declared in `module.json` and read by the index generator | `aoe`, `pentaryn-prompts`, `wall-autocomplete`, missing |
| Settings | DEFAULTS table + `setting()` fallback (aoe/combat pattern); hidden world settings used as stores are documented as "data store" rows | inline registrations, no fallback |
| i18n | nested JSON, one `makeT` per module; no hard-coded English in UI | flat vs nested, 44 helper copies, portals/walls/pings/attunement without lang |
| Logging | `pentaryn-<short> \| <event>` plus a fields object; debug via `CONFIG.debug[MODULE]` | see §4 |
| Hooks | registry with `guard`, uninstall; module-scope `Hooks.on` only in the entry | four idioms |
| Patches | `wrapMethod` with marker `__pentaryn<Short>` and an adjustments row per patch | five idioms; movement/pings/prompts/journal unregistered |
| CSS prefix | registered table in `context/foundry/modules.md`: `.pa-` aoe, `.pc-` combat, `.pcr-` creatures, `.pj-` journal, `.pm-` movement, `.pp-` **prompts only**, `.ppt-` portals (rename in portals split), `.pr-` + `.pentaryn-riders-note` riders, `.ps-` senses, `.pt-/.pv-` ties, `.pentaryn-tt` transform tooltip, `.pentaryn-attunement` (+ `.pentaryn-away-tip`, `.pentaryn-over-cap` on dnd5e's own counter) attunement, `#pentaryn-creatures` creatures, `.pentaryn-aoe-tray` aoe tray. Deliberate exceptions, recorded: journal's `.pj-new/.pj-provenance/.pj-revealed/.pj-item-img` are unscoped because they mark journal-page content; riders and transform both style Argon's `.ech-tooltip` (riders under adjustments row `argon-tooltip-click-through`). All twelve stylesheets were read for this table | `.pp-` shared by portals and prompts (portals.css:4 `.pp-text` unscoped) |
| Version | `VERSION` exported from core = module.json version (test pins equality); `describe().version` | only prompts exposes it |
| Tests | `test/run.mjs` uses the kit harness; `node-test` in every ModuleSpec; ties runner spawns children | ties ungated, importer/names/pings none |

#### 2.2 Make targets (python-tooling-1, -8)

```
foundry-%-check / foundry-%-sync      pattern rules → $(OPS) module-check|module-sync $*
foundry-walls-test: foundry-walls-check
foundry-modules-check                 $(OPS) module-check --all   (keeps going, summary, exit 1 on any)
foundry-lib-vendor                    copy foundry/lib → each module's lib/ (ModuleSpec.lib)
foundry-module-new SHORT=x            $(OPS) module-new x  (scaffold, refuses if dir exists)
foundry-module-index [--check]        regenerate context/foundry/modules.md table; check-context runs --check
foundry-eval-report                   action-log summary (mcp-fork-25)
test                                  pytest -q scripts/tests; check-all includes it
```

`escalate.make_checks()` (escalate.py:592) is derived from `ops_cfg.MODULES` **before** the Makefile lines are deleted (python-tooling-2 step a).

#### 2.3 "Build a new addon" playbook — `context/foundry/modules.md` outline

1. **Read this when** you are adding a module, adding a feature to one, or asking "where does this go". (CLAUDE.md gets a routing row; `context/foundry/README.md` gets a namespace index.)
2. **Decision table: where does it go?** — rows for: a turn-flow/Argon tweak (combat/turnflow), a dnd5e damage/heal rider (riders RULES), an attack-card once-per-turn rider (combat TURN_RIDERS), an Item Piles patch (dropbin), anything about token light (senses; creatures only for player-owned creature lights), region teleport (portals), markers (prompts), knowledge/ties (ties), a new standalone concern → new module.
3. **Scaffold**: `make foundry-module-new SHORT=x` → the layout in §2.1 with the kit vendored, a passing `test/run.mjs`, a README skeleton, `ModuleSpec` registered by `module_dirs()` discovery (python-tooling-3).
4. **Write the pure part first** in `<short>-core.mjs` with fixtures; glue second.
5. **Settings**: add a DEFAULTS row + `PENTARYN_<SHORT>.settings.<key>.{name,hint}`; the i18n gate checks it; the completeness test (combat-riders-28 pattern) checks template-built keys.
6. **API**: add an `API_TABLE` row; `describe()` is generated; a read that an LLM will want goes in `queries.mjs` too.
7. **Patches and internals**: `wrapMethod` + adjustments row (fields: id, packages, modules, files, markers, what, why, native_when, retire_class, check) — copy a neighbour's vocabulary.
8. **Tests to add**: fixture per rule; `test/hooks.mjs` manifest; `test/api.mjs` surface pin; i18n completeness.
9. **Gates**: `make foundry-x-check` (parse, imports, i18n, vendor, node-test, layer rule), `make foundry-adjustments-check`, `make foundry-module-index --check`.
10. **Docs**: README sections in order; `context/foundry/README.md` routing row; `flags.pentaryn.afterSync` lines (restart needed if `module.json` changed).
11. **Sync**: `make foundry-x-sync` writes the sync stamp (python-tooling-10); live version is readable via `describe().version` and `foundry_modules`.
12. **Reference implementations**: aoe (hooks/election/settings), prompts (queries + typed tool + readback text), journal-core (pure core with privacy fixtures), walls (backend registry + fixtures), cursors ("To add a key" recipe).

The module index table in that file is generated from `module.json` + `ModuleSpec` + test presence (python-tooling-36), replacing the five hand-kept lists (config.py MODULES, Makefile, context/foundry/README.md:200, ops.md §5, context/pentaryn.md).

---

### 3. LLM interface standard

#### 3.1 In-game contract (every namespace)

| Entry | Shape | Source of truth |
|---|---|---|
| `game.pentaryn.<ns>.describe()` | `{module, version, namespace, flagScope, methods:[{name, args, returns, gm, writes, sideEffects?}], settings:[key], userFlags?, events?, patches?, queries:[name]}` | generated from `API_TABLE`, `DEFAULTS`, `EVENTS`, `PATCHES` |
| `game.pentaryn.<ns>.version` | string equal to module.json | `VERSION` in core |
| `game.pentaryn.<ns>.inspect(ref)` | read-only plain JSON for one actor/token (no Documents, no Sets, numeric timestamps alongside strings) | one per module where state exists |
| `game.pentaryn.<ns>.settings()` | `{key: liveValue}` | `settingsSnapshot()` |
| `game.pentaryn.<ns>.trace()` | last ≤200 decisions when `CONFIG.debug[MODULE]` is on | `lib/log.mjs` |
| `game.pentaryn.describe()` | `{namespaces:[describe()…], importer:{contract…}}` | `lib/publish.mjs` (idempotent root install) |
| `game.pentaryn.inspect(ref)` | `{[ns]: ns.inspect(ref)}` across every namespace that has one | `lib/publish.mjs` |
| `game.modules.get(id).api` | same object as `game.pentaryn.<ns>` | `publishNamespace` |
| `CONFIG.queries["pentaryn-<m>.<read>"]` | every read-only `API_TABLE` row with `query:true`, wrapped in `guarded()` (prompts.mjs:261 body; coded `NOT_GM`) | `queries.mjs` |

Reference argument standard at the API boundary only: every published entry that takes an actor accepts Actor \| Token \| TokenDocument \| id \| uuid \| exact name through `lib/resolve.mjs`; documents pass through untouched so internals and existing callers are unchanged.

Return-shape standard for **new** entries (existing ones are documented, not changed): reads return plain JSON or `null` with a sibling `reason` channel where today's code has several null causes (journal `lastReason`, transform `status().reason`); writes return `{ok:true, …}` or `{ok:false, code, reason}`; coded errors only inside queries. Known legacy shapes that stay and get documented: `rules.search` → object not array (5 logged failures), `attunement.report` → undefined on miss, `dropbin.restore` → Notification \| Item, walls throw.

#### 3.2 Per-module additive reads (the "one call" list)

ties `dossier(ref)` + `knowsAbout` + published aliases + `help()` (ties-3…-10); combat `inspect(ref)`/`describe`/`settings`/`trace` (combat-riders-10…-14, WAIT); riders `inspect` (combat-riders-32); transform `status(ref)` (transform-creatures-17, WAIT); aoe `resolution`/`latestResolution`/`summary`/`isHandle`/`describe` (aoe-movement-portals-10, WAIT); senses `inspect`/`light.status`/`chain` alias (senses-walls-cursors-25, -26); creatures `status()` (transform-creatures-31); cursors `status()` (senses-walls-cursors-32); walls `analyze()`/`describe` (senses-walls-cursors-33); movement `status({sceneId})`/`describe` (aoe-movement-portals-23); portals `regionOf`/`destinations`/`link`/`unlink`/`badges`/`describe` (aoe-movement-portals-32); attunement resolver/`report(…,{quiet})`/`stash(…,{detail})`/`describe` (items-journal-16); dropbin `list(n,{brief})`/`restoreResult`/`describe` (items-journal-28); journal `entriesOf`/`statusFor`/`lastReason`/`describe` (items-journal-35); importer `importer.describe` (items-journal-5); lookup `VERSION`/`describe`/queries (prompts-lookup-2, -3); prompts read aliases + `describe` + module api (prompts-lookup-19).

#### 3.3 MCP layer

No new MCP tool is part of this refactor programme. The `pentaryn-api` describe/inspect/call fork tool (was mcp-fork-3) was dropped in verification as a feature (see *Dropped during verification*) and is listed under *Deferred* as a feature proposal. This section is built on what already exists:

1. **Reach every addon through one eval-js call, and make that call easy to find** (mcp-fork-20, mcp-fork-21). `context/foundry/README.md` gets the namespace index right after line 45: namespace → module → README → its one-call read. The eval-js description states the serializer rules and says that every addon publishes under `game.pentaryn.<ns>` with `describe()` first. The reads themselves are additive and live inside the modules (§3.1–3.2): `game.pentaryn.describe()`, `<ns>.describe()`, `<ns>.inspect(ref)` with the `lib/resolve.mjs` ref resolver, so an id, uuid or name works without a lookup eval.
2. **Per-module queries, one contract.** Read-only lookups register GM-guarded `CONFIG.queries["pentaryn-<m>.<read>"]` inside the module (prompts-lookup-3 for lookup; the `queries.mjs` blueprint row for the rest), all through prompts' `guarded()` contract with coded `NOT_GM` (mcp-fork-24 names the contract; player relays check `ctx.user` ownership). The existing typed prompt-markers tool stays and gets the drift test (prompts-lookup-11, mcp-fork-15) and the single ACTION_TABLE (prompts-lookup-12). A typed `rules-lookup` MCP tool over lookup's queries (25+13 logged calls) is a feature and is deferred.
3. **`dnd-scripts`**, the LLM's native non-Foundry tools:
   - python-tooling-28: read-only `foundry_modules` and `foundry_action_log` in `scripts/foundry/ops/mcp_tools.py`, over files already on disk, with `module-check --json` (python-tooling-41) behind them.
   - python-tooling-29: a per-call log.
   - python-tooling-48: uniform annotations, documented error channels, and the owned-books pointer on the SRD tools.
   - python-tooling-49: argument coverage and confinement.
   - python-tooling-50: one dispatch path per in-process module.

   **Note:** python-tooling-28 also adds tools. It was kept because it reads repo files and changes no game or bridge state. If the "a new tool is a feature" rule that dropped mcp-fork-3 is applied strictly, -28 moves to Deferred with it, and everything else here stands.
4. **Docs the LLM reads first.** The namespace index (mcp-fork-20) plus a route to `modules.md`; `attributes.md` 'Running the calls' opens with `ties.dossier`; `rules-lookup.md` gets the "search returns an object, iterate .hits" line; the fork use-doc (mcp-fork-19) names the two query contracts (mcp-fork-24).

#### 3.4 Step-count reduction

| Task | Today | After this programme |
|---|---|---|
| One PC's attributes, ties, known, beliefs | CLAUDE.md → README → attributes.md (1004 lines, API at :92) → ToolSearch eval-js → eval #1 resolve actor → eval #2 four calls with four shapes (≈4 tool calls, ≈1,500 doc lines) | namespace index row → one eval-js `game.pentaryn.ties.dossier("Esren")` (ties-3, with the ties-4 resolver): **1 eval**, one JSON shape, a few doc lines |
| Prompt markers gather/replace | 1 typed call (already good) | unchanged; schema drift pinned, `from` paging text fixed deliberately later |
| Combat state ("why did the pip not drop") | 3–4 evals + raw `flags.pentaryn-combat.turn/swing` reads (45 + 18 logged) | one eval `game.pentaryn.combat.inspect("<name>")` (combat-riders-11, -12) plus `combat.trace()` when debug is on |
| Light/senses state | 6 raw flag paths (96 logged reads) | one eval `game.pentaryn.senses.inspect(ref)` (senses-walls-cursors-25) |
| "What exists" discovery | `Object.keys(game.pentaryn…)` (64 logged calls) | one eval `game.pentaryn.describe()` (`lib/publish` root, §3.1) or the namespace index; `foundry_modules` for repo vs installed versions |
| Which code is live | not answerable | `describe().version` in one eval, plus the sync stamp via `foundry_modules` |
| Rules text | eval `game.pentaryn.rules.search` (returns an object; iterate `.hits`) | same single eval, now self-describing (prompts-lookup-2); the SRD tools point at it (python-tooling-48) |
| NPC combat actions | `combat_actions_list` summaries; full spec only by reading the file | unchanged calls; a write that would destroy lines or mis-key a row now returns `ok: false` (python-tooling-42, -43) |

After this programme, the eval-js call itself is the remaining overhead: a ToolSearch to load the tool, then the script. Collapsing that into one typed `pentaryn-api` call is the deferred feature proposal.

---

### 4. Logging / auditability and hardening standards

#### 4.1 Logging

| Level | When | Call | Gated by |
|---|---|---|---|
| `error` | a hook/handler threw and the module gave up | `log.error(event, fields, err)` | never |
| `warn` | degraded but continued; core-API drift fallbacks (`warnOnce`) | `log.warn` / `log.warnOnce(key, …)` | never |
| `info` | audit lines for cross-user writes: GM relays (Battle Medic, ledger record, mirror writes), imports, syncs | `log.info` | never |
| `debug` | silent early returns, swallowed errors (`swallow(op, fallback)`), decision outcomes | `log.debug` | `CONFIG.debug["pentaryn-<short>"] === true` (also settable by a hidden client setting `debug` where a module wants a UI toggle) |
| `trace` | ring buffer of decisions for `api.trace()` | `log.trace(op, data)` | same flag |

Line shape (browser): `console.<level>("pentaryn-<short> | <event>", {fields}, err?)` — `event` kebab-case; fields are plain objects with `uuid`s, ids and names, never Documents. Existing `warn` texts stay byte-identical (tests grep them).

Where logs land:

| Stream | File | Producer | Rotation | Fields |
|---|---|---|---|---|
| Fork tool calls | `foundry/logs/mcp-YYYY-MM.jsonl` | `ActionLog.append('actions')` (mcp-fork-5), month computed at write time (mcp-fork-6), **upstream write tools included** (mcp-fork-1), `client:{pid,ppid}` (mcp-fork-7), `ok` honest for failed evals (mcp-fork-4) | monthly | ts, tool, action, client, args (logArgs-sanitised), ok, phase, ms, summary, ids |
| Evals | `foundry/logs/eval-YYYY-MM.jsonl` (python-tooling-30; readers glob `eval*.jsonl`) | eval-js, including arg-rejected calls (mcp-fork-17) and `timedOut` (mcp-fork-8) | monthly | ts, purpose, script, ok, phase, error, ms, client |
| dnd-scripts calls | `foundry/logs/dnd-scripts-YYYY-MM.jsonl` | server.py when `PENTARYN_MCP_LOG_DIR` is set (python-tooling-29) | monthly | ts, tool, mode, args(truncated), ok, ms |
| Ops | `foundry/logs/ops-YYYY-MM.jsonl` + `Data/modules/<m>/.pentaryn-sync.json` | module-sync (python-tooling-10), `ops/out.py event()` (python-tooling-33) | monthly | module, version, digest, dirty, synced_at |
| Updater | `foundry/logs/auto-updates/*.json` | existing; swallowed exceptions now append notes (python-tooling-23) | per run | — |
| Report | `make foundry-eval-report` (mcp-fork-25) | pure `evallog.summarise()` | on demand | — |

#### 4.2 Hardening

| Rule | Mechanism | Findings |
|---|---|---|
| No bare `catch {}`; every swallow names its op and keeps its fallback value | `swallow`, `warnOnce` | movement.mjs:379/385, journal.mjs:571, portals.mjs:238/273/502/597, combat ×25, prompts ×17, ties ×7 |
| Hook wrappers pass return values through (veto) and catch thenables | `lib/hooks.mjs guard` | combat-riders-30, senses-walls-cursors-16, aoe-movement-portals-9 |
| "Who writes" is one of three named predicates; two-session jobs claim first | `isActiveGM`/`isAnyGM`/`claimDocument`/`stakeAndConfirm` | aoe-movement-portals-7 [declared], -28, ties-39, senses-walls-cursors-17, transform-creatures-2 |
| Setting-backed stores serialise read-modify-write and coalesce | `serialFor(key)` (ties-30), ledger chain (items-journal-18, -19), `mutate` queue pruning (aoe-movement-portals-6) | [declared: only concurrent behaviour changes] |
| Long operations are re-entrancy guarded | `running` flag + `PentarynAbort` (items-journal-4), walls `exclusive()` (senses-walls-cursors-9) | [declared] |
| Flags of possibly-inactive scopes are read as data | `doc.flags?.[scope]` (walls undo senses-walls-cursors-1, dropbin item-piles items-journal-23) | [declared fix: throw → works] |
| Private core/dnd5e/Argon internals: one adjustments row each, `warnOnce` on drift, `probeInternals` after canvasReady | adjustments rows for movement (-17), portals (-31), riders/combat (-16), senses (-29), cursors (-30), dropbin (-29), pings (-35), transform→combat (-13) | land as one append-only batch when adjustments.yml is idle |
| Permission: queries GM-guarded; player relays check `ctx.user` ownership; bridge upstream queries refuse non-GM senders | `guarded()`, `assertSenderIsGM` (mcp-fork-2 [declared], -24) | |
| Version guards | `compatibility.minimum: "14"` on dnd5e-6 modules (transform-creatures-24), `VERSION === module.json` test, registry `.options` guarded (prompts-lookup-4) | restart batch |
| Session-lifetime maps pruned on the existing lifecycle hooks | ties-31, combat-riders-29, transform-creatures-10 | |
| Escaped interpolation | ties-32, combat-riders-33, prompts dialog `'` | |
| Writer failures are visible | names sync `.catch` (transform-creatures-33), dropbin submit (items-journal-21), senses debounced sync (senses-walls-cursors-15), attunement `safe()` (items-journal-11), stash refuses to delete on partial create (items-journal-10 [declared]) | |
| File-backed stores never drop what they cannot parse and lock their read-modify-write | refuse on malformed lines, keep comments; `fcntl.flock` sidecar | python-tooling-42 [declared], -43 [declared], -44 [declared] |
| No loop-bound object outlives its event loop; per-call `asyncio.run` code under a thread pool takes a thread lock | `threading.Lock` around dice draws, per-call httpx client | python-tooling-51 [declared] |
| Every MCP argument is reachable, and path arguments are confined to the repo | schema-coverage test; `scripts/_paths.py` | python-tooling-49 [declared] |
| Tooling | foundry-down waits for the port (python-tooling-11 [declared timing]), gh timeouts become held packages (-17), osascript escaping (-32), bridge.scan guards (-37), login KeyError (-31), atomic module install (-5a) | |

---

### 5. Performance priorities

Ordered by (hook frequency × clients affected × cost). Each needs the characterisation named in its finding before the change.

1. **Per-frame / per-refresh hooks on all clients**: ties worn/overlay rebuild (ties-24, -25), chain `refreshToken` pair rebuild (senses-walls-cursors-19) and per-frame sprite recreation (-20), dropbin corpse eye redraw (items-journal-30), creatures strip on every token move (transform-creatures-25), movement per-token settings/combat recompute (aoe-movement-portals-19), transform capture `pointermove` (transform-creatures-11 WAIT), combat picker listeners (combat-riders-35 WAIT).
2. **World-wide scans on common events**: senses `syncLight` O(actors×scenes×tokens) (senses-walls-cursors-11) and deletion rescans (-13); riders concentration cleanup on every effect delete (combat-riders-23); transform world-time ticks on every client (transform-creatures-2 WAIT); journal `refreshBars` on every item update (items-journal-33) and `isEyeReadable` note scans (-38); dropbin directory filter (items-journal-24); portals unthrottled badge rebuild with overlap corruption (aoe-movement-portals-24 — also a correctness fix); ties sheet injection ×4 hooks (ties-26).
3. **Hot API paths recomputed per call**: combat `fullAttackState`/`combatContext` memo per tick and rider offers for every historical card (combat-riders-1, -2 WAIT); ties `registry()` re-clamp and `describeAttribute` per id (ties-19, -20, -21, -22, -23, -27, -28); lookup re-reading three book packs per search (prompts-lookup-1); prompts hover tooltip building the full scene model (prompts-lookup-7, -8, -23); aoe `describeToken` actor scan (aoe-movement-portals-2 WAIT), effects double resolve (-14 WAIT); attunement double reconcile (items-journal-13); importer slug scan (items-journal-7); transform tooltip profile resolution (transform-creatures-23 WAIT); creatures self-requeue (transform-creatures-27); portals `recordOf` (aoe-movement-portals-36).
4. **Write batching**: dropbin whole-ledger rewrite and mirror per entry (items-journal-19), ready-time backfills one actor at a time (-25); creatures debounce starvation (transform-creatures-26).
5. **Engine / tooling**: walls `obstacles()` allocation (senses-walls-cursors-5), glow epoch cache thrash (-22); parse gate concurrency (python-tooling-6), `snapshot_digest` triple stat on 2.7 GB (-25), `build_actors` double read (-26), server discovery AST parse (-27).

## Sequenced waves

Rules for every wave: (a) the characterisation fixtures named in each finding land in a commit **before** the refactor commit and are not edited by it; (b) `make foundry-modules-check` and `make test` are green before and after; (c) a wave that touches `module.json` is a restart batch and is synced once; (d) **WAIT** waves re-anchor every line against the live tree and run only when the live-test workflow reports idle on that module; (e) adjustments.yml additions are append-only and batched into one commit while that file is idle.

### Wave 0 — Gates, characterisation tests, docs (no runtime code changes)

Tooling and gates: python-tooling-1, -2 (step a), -3, -7 (together with ties-1: ties runner + node-test), python-tooling-8, -34, -36, -38, -41 (json flag, additive), **-52 (isolate the dice cache before anyone runs `test_dnd_roller.py`)**, -45 (contract pins + `ROW_TYPES` extraction); mcp-fork-11 (FORK.md with the complete footprint table, footprint script), -19, -20, -23, -24 (doc half: name the two query contracts in the fork use-doc).
Characterisation only: ties-37; transform-creatures-8 step 1 (hook manifest — generalise to every module as `test/hooks.mjs`), -28; prompts-lookup-11, -28; mcp-fork-15 (contract test), -9 (serialize test before the move); combat-riders-22 fixtures ("KNOWN: Multiattack ignores Action Surge") — fixtures only, WAIT for the code move; senses-walls-cursors-3 (canonical fields: test-side first); the characterisation tests of python-tooling-42, -43, -44, -46, -48, -49, -50, -51, -53; prompts-lookup-31's stub-window run of `typeahead.mjs`.
Docs only (not in flux): prompts-lookup-26, -27; senses-walls-cursors-8, -27; transform-creatures-18 (README part), -19, -20; aoe-movement-portals-11 (aoe.md part), -12, -33, -37, -38; items-journal-6, -17, -37 (README part); python-tooling-47; senses-walls-cursors-35 (with -27); ties-43 steps 2–5 (CHANGELOG move, comment fixes); combat-riders-15 and -17 step 2 (melee.md / "Which riders module?") **WAIT — combat README.md is modified in the live tree**.

### Wave 1 — Keystone and kit (lands once, unblocks everything)

items-journal-1 (importer merges, stops freezing) [declared: only the frozen-root behaviour changes; test publishes in both orders]; `foundry/lib/` created with `publish`, `hooks`, `log`, `settings`, `election`, `resolve`, `queries` (the code half of mcp-fork-24), `i18n`, `patch`, `test-harness` and their node tests; `ModuleSpec.lib` + vendor gate + `make foundry-lib-vendor`; python-tooling-5 step a (atomic install; python-tooling-53 points `pipeline.stage` at the same helper), -10 (sync stamp), -33 (out.py), -4 and -35 (scaffold + `context/foundry/modules.md`), -9. No module switches to the kit yet except the scaffold template.

### Wave 2 — Pure seams in modules not in flux (characterise → move verbatim)

| Module | Findings |
|---|---|
| ties | ties-12, -13, -14, -15, -44 (lang keys, after -15's `t`/`f` util), -16, -17, -18, -36, -45 (then -35 last, as its own commit) |
| prompts | prompts-lookup-9, -10, -16, -20, -21, -22, -24, -31 (typeahead-core), -33 |
| lookup | prompts-lookup-1, -4, -5, -6 |
| senses | senses-walls-cursors-10, -12, -17, -18, -21, -24, -34 |
| walls | senses-walls-cursors-4, -6, -7 |
| cursors | senses-walls-cursors-31 |
| creatures | transform-creatures-30 |
| names / pings | transform-creatures-32, -36, -35 (ModuleSpec, Makefile, README; lang → Wave 7) |
| movement | aoe-movement-portals-18, -21, -22 |
| portals | aoe-movement-portals-26 |
| journal | items-journal-32, -34 |
| dropbin | items-journal-20, -23, -26, -27 |
| attunement | items-journal-8, -9, -12, -14 step 1 |
| importer | items-journal-2, -3, -7 |
| riders | combat-riders-25 steps 1–2, -26 |
| fork | mcp-fork-5, -6, -9, -12, -14, -22 |
| python | python-tooling-12, -13 (add update/plan.py:166 to the paths list), -14, -15, -16, -18, -19, -20, -21, -22, -24, -39, -46, -50, -53 |

Each module adopts the kit (`lib/publish`, `hooks`, `log`, `settings`, `i18n`) in this wave as a separate commit per module, deleting its local guard block and `setTimeout(0)` only after Wave 1 is synced.

### Wave 3 — LLM reads (additive, not in flux)

ties-3, -4, -5, -6, -7, -8, -9, -10, -43 step 1 (generated `ties-api.md`); prompts-lookup-2, -3, -12, -19; senses-walls-cursors-25, -26, -32, -33; transform-creatures-31; aoe-movement-portals-23, -32; items-journal-5, -16, -28, -35; combat-riders-32 (riders only) and the riders half of -12 and -13; transform-creatures-38, -39; python-tooling-28, -29, -48; mcp-fork-21, -16, -25; `context/foundry/README.md` namespace index (mcp-fork-20, already in Wave 0) linked from each addon's README.

### Wave 4 — Logging and hardening (not in flux)

ties-29 [declared], -30 [declared], -31, -32, -33, -34, -38, -39, -40, -41, -42; prompts-lookup-14, -15, -17, -18; senses-walls-cursors-1 [declared], -2 [declared], -9 [declared], -13, -14, -15, -16, -19, -29, -30; transform-creatures-26, -27, -29, -33; aoe-movement-portals-20, -24, -27, -28; items-journal-4 [declared], -10 [declared], -11, -18 [declared], -19, -21, -36; combat-riders-23, -27, -39, -40; python-tooling-11 [declared], -17, -23, -25, -26, -27, -30, -31, -32, -37; mcp-fork-1, -2 [declared], -4, -7, -8, -10 [declared: token-id identifiers start to resolve; needs a foundry-module rebuild and a broker restart], -13, -17, -18; prompts-lookup-32 [declared], -34; senses-walls-cursors-37; python-tooling-42 [declared], -43 [declared], -44 [declared], -49 [declared], -51 [declared]. Adjustments batch (when the file is idle): aoe-movement-portals-17, -31; items-journal-29; senses-walls-cursors-29, -30; transform-creatures-35 rows; the riders rows of combat-riders-16.

### Wave 5 — Performance (not in flux)

ties-19, -20, -21, -22, -23, -24, -25, -26, -27, -28; prompts-lookup-7, -8, -23; senses-walls-cursors-11, -20, -22, -5; transform-creatures-25; aoe-movement-portals-19, -36; items-journal-13, -24, -25, -30, -33, -38; python-tooling-6.

### Wave 6 — Structural splits (not in flux; one module per PR, after its Waves 2–5)

ties-35 (if not done in Wave 2); prompts-lookup-13; senses-walls-cursors-23; aoe-movement-portals-25 (then -31 `files` update); items-journal-22; combat-riders-25 step 3 (riders entry split) and -31 (riders part).

### Wave 7 — Restart batch (module.json changes, one sync + one Foundry restart)

transform-creatures-9, -24 (WAIT-module files but manifest-only; land when transform is idle), aoe-movement-portals-29 (portals lang), items-journal-14 step 2, -37 (relationships), transform-creatures-35 (pings lang), senses-walls-cursors-36 (walls lang), `flags.pentaryn` normalisation across all modules (namespace, flagScope, cssPrefix, afterSync) feeding python-tooling-36.

### Wave 8 — **WAIT**: pentaryn-combat, pentaryn-transform, pentaryn-aoe

Runs only after the live-test workflow is idle on each module; re-anchor every line (turnflow.mjs is untracked; combat hud/core/settings/riders/sequence/strip, transform hud/core/transform, aoe aoe/areas/core are modified). Internal order mirrors Waves 0→6:

- 8.0 tests/docs: transform-creatures-8 step 1 for combat and aoe too; aoe-movement-portals-40 (escape.mjs fixtures) and the shared placement truth table of -39; combat-riders-15, -17 step 2, -28 test, -31; transform-creatures-18 (ModuleSpec text); aoe-movement-portals-11 README part.
- 8.1 kit adoption: publish/hooks/log/settings in combat, transform, aoe; transform-creatures-16; aoe keeps its `guard` body under the alias until re-characterised.
- 8.2 seams/defrag: combat-riders-3, -4, -5, -21, -22 (code move), -34; transform-creatures-3, -4, -5, -6, -7; aoe-movement-portals-4, -5, -13.
- 8.3 reads: combat-riders-11, -12 (combat half), -13 (combat half), -14; transform-creatures-17; aoe-movement-portals-10.
- 8.4 logging/hardening: combat-riders-8, -9, -10, -29, -30, -33; transform-creatures-10, -13, -15, -21, -22; aoe-movement-portals-6, -7 [declared], -8, -9, -15, -30; adjustments rows: combat half of combat-riders-16, transform-creatures-13 row, transform-creatures-14 comments, and the widening of `core-region-placement-escape` to cursors (aoe-movement-portals-39, landing with senses-walls-cursors-30's cursors row).
- 8.5 performance: combat-riders-1, -2, -35; transform-creatures-1, -2, -11, -23; aoe-movement-portals-2, -14.
- 8.6 splits: combat-riders-6, -7, -20, -17 step 1 (rename); transform-creatures-12 and combat-riders-18 phase 1 (argon-kit vendor); -18 phase 2 is a plan doc only (`context/plans/argon-composition.md`).

### Deferred decisions for Joe (not scheduled; each is a behaviour change)

prompts `gatherChars` 160 vs 400 (prompts-lookup-16); ties `attributes.of` default kind pointer (ties-5); lookup `compatibility.minimum`; journal `report()` gate (items-journal-37); ledger pruning (items-journal-19); pile-detection unification (aoe-movement-portals-36); zod schema widening and gather paging text (prompts-lookup-11); escalate `make_checks` step b (python-tooling-2); sync exclusion of `test/`, `*.md`, `wasm/target` (python-tooling-5 step b / senses-walls-cursors-28 — needs a manifest/`import.meta.url` guard first); Starry expiry on unlinked tokens (transform-creatures-22); `pentaryn-table` module (combat-riders-7 plan); **feature proposals** (no refactor depends on them): a `pentaryn-api` describe/inspect/call fork tool (was mcp-fork-3) and a typed `rules-lookup` MCP tool over prompts-lookup-3's queries, an opt-out from typeahead capture for API placements (prompts-lookup-32); narrowing the combat-actions validator to the build grammar, i.e. reject `slots.refresh: "turn"` and `2D6` (python-tooling-45).

## Addendum: gaps closed after review

A review of the first pass found six gaps. Each is closed below in the same finding format (file, line, anchor, behaviour test).

1. **The dnd-scripts MCP tools were not audited.** `python-tooling.md` gains a `tooling:dnd-scripts` summary, a scope statement that names every script, and python-tooling-42 to -53. The scope statement also records the reasoned out-of-scope files: the `scripts/timeline_svg/` internals, `research_curve.py` and `clipboard_circle.py`. `ops/pipeline.py`, `update/plan.py` and `update/state.py` are named there too.
2. **Blank category cells did not say whether anything was checked.** Every former `·` cell is now `0`, and each affected addon file has a *Categories checked with no finding* section saying what was looked at. Cells that contradicted the docs got findings: cursors Docs (senses-walls-cursors-35), names LLM (transform-creatures-38), pings LLM (transform-creatures-39), lookup Log (prompts-lookup-34) and walls Log (senses-walls-cursors-37). walls also gained the missing lang-file finding (senses-walls-cursors-36).
3. **Some source files were never examined.** `typeahead.mjs` → prompts-lookup-31, -32, -33. `escape.mjs` → aoe-movement-portals-39, -40; its uninstall path is already handled at `aoe.mjs:36`. The following are now named with a reviewed note: `rituals-core.mjs`, `readback-core.mjs` and all twelve stylesheets (§2.1 CSS row updated).
4. **The fork footprint was incomplete.** mcp-fork-11 now carries the complete 28-file footprint table, including the per-query timeout hunk (`foundry-connector.ts:359–386`), the `foundry-client.ts:57–67` pass-through, `foundry-connector.timeout.test.ts`, `main.ts` and the `settings.ts` default fix.
5. **The plan contradicted itself on the `pentaryn-api` tool.** §3.3, §3.4 and Wave 3 are rebuilt on mcp-fork-20/-21, dnd-scripts and per-module queries. The tool itself is a deferred feature proposal.
6. **Some findings had no wave.** mcp-fork-10 → Wave 4 [declared]; mcp-fork-24 → Wave 0 (doc half) and Wave 1 (`lib/queries.mjs`); ties-44 → Wave 2 (ties row).

Totals moved from 305 to 328 findings (23 added, 0 high impact).

## Dropped during verification

These were proposed by an audit pass and removed by verification, mostly because the fix changes behaviour. Bugs among them are hand-offs to the live-test workflow or decisions for Joe, not refactors.

| Id | Why dropped |
|---|---|
| ties-2 | Real bug (known.mjs notes blur cancels the pending autosave and there is no change listener, unlike editor.mjs:513) but fixing it changes behaviour (stores text that is lost today). Out of scope for a no-behaviour-change audit; hand to the live-test workflow. |
| ties-11 | Changing setNotes to return write()'s result changes a published return value for non-owners. Behaviour change, not a refactor; report as a bug to the live-test workflow. |
| prompts-lookup-25 | Behaviour-changing: an array payload to the replace query currently works (replaceMany accepts an array) and a string payload spreads harmlessly in gather; refusing them turns working inputs into errors. Not a pure refactor. |
| prompts-lookup-29 | Step 1 (log the manifest size) duplicates prompts-lookup-18; step 2 (skip the setting write on identical manifests) changes the stored manifest.at and broadcast behaviour, which is behaviour-changing and needs sign-off. |
| prompts-lookup-30 | Changes the LLM-facing trailer text and adds a new argument to the typed tool (feature/behaviour change). The drift is real (GatherArgs lacks from, verified) and is now pinned as a test-only item inside prompts-lookup-11. |
| combat-riders-19 | Copying the .pentaryn-tt tooltip CSS into combat.css visibly changes combat tooltips when pentaryn-transform is disabled (the finding itself admits this). That is a behaviour change, not an audit refactor. Confirmed combat.css has no .pentaryn-tt rules, so the coupling is real; route to Joe as a decision, or document it in context/foundry/argon.md under combat-riders-18. |
| combat-riders-24 | The sinceTs early-stop relies on ChatMessage.timestamp being monotonic across clients. Timestamps are assigned client-side, so clock skew between a player's usage card and a GM client's damage message could drop 'applied' keys and let a once-per-casting rider apply twice, which is a behaviour change. The benefit is also small (about 450 messages, linear scan). The slice(-15) copy in attackMessageFor is a trivial win but not worth a finding. |
| transform-creatures-34 | Self-described 'confirm live, do not change' bug candidate; the only test is a planner fixture that duplicates what transform-creatures-32 now includes (sibling-token characterization added there). Hand the synthetic-actor rename question to the live-test workflow. |
| transform-creatures-37 | Explicitly out of scope: both proposed fixes (active-GM-only writer, API reading the in-memory buffer) change observable results, and the proposed test simulates two buffers rather than pinning any real code path. The only in-scope piece (pings-core extraction) is already covered by transform-creatures-36; flag the multi-GM clobber and stale last()/recent() to the live-test workflow. |
| aoe-movement-portals-1 | Behaviour-changing and a regression risk. Making only the claim holder fill saves means that after the resolve-claiming tab reloads or closes (the bridge tab reloads on every sync; a reload changes game.socket.id) no client matches the claim, so late player saves would never fill that resolution. The clobber race it targets needs a stale local copy inside a tiny window and is unproven. Needs a field-level update design, not a claim gate. |
| aoe-movement-portals-3 | Would silently blind the i18n gate. scripts/foundry/ops/jsscan.py finds the prefix-wrapper `const t = ... game.i18n.localize(`PENTARYN_AOE.${k}`)` per file (_RE_WRAPPER over each source); moving t to an imported i18n.mjs leaves the call sites in other files unrecognised, so keys there would no longer be checked, and the finding's own test (gate still resolves every key) would pass vacuously. Small win, real tooling regression. |
| aoe-movement-portals-16 | Explicitly a behaviour change (the finding admits it): a newly promoted active GM would start sweeping on scene change, which today it does not. The brief excludes behaviour changes. |
| aoe-movement-portals-34 | Not a defrag: it replaces three inline copies with three per-module copies of publishNamespace (cross-module imports are not allowed), so duplication stays and each module gains a helper. The real fix is the importer freeze (out of scope, behaviour-affecting). |
| aoe-movement-portals-35 | Speculative and risky. No `.pp-` collision exists today (prompts uses .pp-row/.pp-chip/.pp-text etc., none of portals' unscoped .pp-card/.pp-choice/.pp-hover/.pp-menu/.pp-config; portals' .pp-text rules are already scoped). The proposed pinned selector list is incomplete against the real portals.css, and prefixing every selector risks visual regressions on five surfaces that only a live look can verify. |
| items-journal-15 | Trivial helper for a two-line duplication that is a deliberately different rule from pentaryn-names.shortName; value is a comment, not a refactor, and the proposed undefined-name fixture would change the throw behaviour. Add a one-line comment during items-journal-8 instead. |
| python-tooling-40 | Changes package classification and the weekly drift report (behaviour change, not a refactor); defer to a feature-level decision. |
| mcp-fork-3 | Adds a new MCP tool (pentaryn-api) and a new bridge query; that is a feature, not a behaviour-preserving refactor, which the audit scope excludes. The discoverability need is covered by mcp-fork-20 (namespace index) and mcp-fork-21 (eval-js description); a describe/call tool can be raised separately as a feature proposal. After review, §3.3, §3.4 and Wave 3 were rewritten so nothing depends on it; it is listed under *Deferred* as a feature proposal. |
