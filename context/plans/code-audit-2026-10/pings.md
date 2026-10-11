---
title: "Code audit 2026-10 — pentaryn-pings"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-pings

**Read this when:** you are about to refactor, harden or document pentaryn-pings and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-pings

**Purpose.**

Records canvas pings (GM's own, plus other users' through core's internal userActivity socket event) into a hidden world setting. The GM-only API (last, recent, all, clear) returns canvas, image and grid coordinates for 'put X where I pinged'.

**Health.**

One 241-line glue file with no core, tests, README, lang file, ModuleSpec, make targets or adjustments rows. It patches ControlsLayer.prototype.handlePing by hand and listens to core's private userActivity event. Pure logic (dedupe, cap, imageOffset, decorate, recent) is inline. Latent quirks: recent(0) returns the whole log; the API reads the persisted setting, which can be up to 250 ms behind the buffer; and two GM clients each flush their own buffer (last writer wins).

**LLM interface.**

eval-js calls game.pentaryn.pings.last() and .recent(n), on GM clients only. It is documented only in context/foundry/markers.md:402 and the file header. Records carry a human 'age' string but no numeric age. It should get a README with the record shape, a describe/status line, and the shared publish helper.

**How to extend.**

Today: pings.mjs is the only file and nothing tells a builder how to register it. It should become pings-core.mjs (pure) plus pings.mjs (patch, socket, API), test/run.mjs, a ModuleSpec 'pings' with node-test, two Makefile lines, README.md, and adjustments rows for the handlePing patch and the userActivity listener.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| transform-creatures-36 | Maintainability gains | medium | S | Extract pings-core.mjs and pin the dedupe, cap, offset and recent() quirks |
| transform-creatures-35 | Extendability | medium | S | pings has none of the module scaffolding |
| transform-creatures-39 | LLM interface | low | S | pings: the namespace exists only on GM clients, and records carry only a string age |

## Maintainability gains

### transform-creatures-36 — Extract pings-core.mjs and pin the dedupe, cap, offset and recent() quirks

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-pings/pings.mjs:87–158`

**Anchor:** `function record(userId, sceneId, x, y) {`

**Current.**

Pure pieces are inline and untested: dedupe (compares only the last record: same user, scene, rounded x/y, within 400 ms), cap (default 50, max 500), imageOffset (ceil(width*padding/g)*g), decorate (canvas, image, gridSquare, snapped, age string). Latent quirks: recent(0) gives slice(-0) = the whole log, recent(-3) drops the first 3; imageOffset hand-computes padding and `snapped` assumes a square grid.

**Proposed.**

Create pings-core.mjs exporting isDuplicate(last,rec,now,windowMs), capLimit(raw), appendCapped(buffer,rec,limit), imageOffset({width,height,padding,gridSize}), decorate(rec,sceneInfo,now), recentOf(list,n). pings.mjs keeps patch, socket and API and passes plain data. Do not 'fix' recent(0) or the offset; pin them and list them in the README as known quirks for the live-test workflow.

**Behaviour test recipe (write first, must pass before and after).**

New test/run.mjs: isDuplicate({userId:'u',sceneId:'s',x:10,y:20,t:1000},{userId:'u',sceneId:'s',x:10,y:20},1399,400) true; now 1400 false; different user false. capLimit('x') 50; capLimit(0) 50; capLimit(900) 500; capLimit(25) 25. imageOffset({width:4000,height:3000,padding:0.25,gridSize:100}) {x:1000,y:800}. decorate({t:0,x:1050,y:850,userId:'u',sceneId:'s'},{offset:{x:1000,y:800},gridSize:100},12000) -> canvas {1050,850}, image {50,50}, gridSquare {i:0,j:0}, snapped {x:1000,y:800}, age '12s ago'. recentOf([a,b,c],2) [c,b]; recentOf([a,b,c],0) [c,b,a] (pinned quirk); recentOf([a,b,c]) default 10 -> [c,b,a].

**Risk.** Verbatim extraction; Math.round on record and Math.floor on gridSquare must be kept.

## Extendability

### transform-creatures-35 — pings has none of the module scaffolding

**Category:** Extendability · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-pings/pings.mjs:43–46`

**Anchor:** `const MODULE = "pentaryn-pings";`

**Current.**

pentaryn-pings has no ModuleSpec in scripts/foundry/ops/config.py (MODULES keys cover 17 modules; pings and importer are absent), so no gates and no make foundry-pings-check/sync (Makefile has the pairs for the others); no README.md (documented only in context/foundry/markers.md and the file header); no lang file (setting names 'Ping log' and 'Pings to keep' hardcoded, pings.mjs ~189-197); no tests; no adjustments.yml rows despite patching ControlsLayer.prototype.handlePing and listening to core's private socket event userActivity. test_declared_modules_exist_on_disk cannot notice a module missing from config.

**Proposed.**

Add ModuleSpec 'pings' (check=(*_STATIC,'node-test') once pings-core exists) plus .PHONY and two Makefile lines beside names; README.md (Read-this-when, record shape, API, GM-only note, Sync); lang/en.json PENTARYN_PINGS.settings.{log,max}.{name,hint} with a module.json languages entry (strings verbatim); two adjustments rows: core-ping-handle (markers ['handlePing','__pentarynPatched']) and core-user-activity-socket (markers ['userActivity']).

**Behaviour test recipe (write first, must pass before and after).**

scripts/tests/test_foundry_ops.py::test_every_module_dir_is_registered: for every foundry/module/*/module.json assert its id is in {spec.name for spec in cfg.MODULES.values()}, with an allowlist {'pentaryn-pings','pentaryn-importer'} so it passes today; remove pings with this change. After the change `make foundry-pings-check` must pass parse, imports and the i18n gate.

**Risk.** module.json gains a languages entry so Foundry restarts; English text unchanged if strings are kept verbatim.

## LLM interface

### transform-creatures-39 — pings: the namespace exists only on GM clients, and records carry only a string age

**Category:** LLM interface · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-pings/pings.mjs:141–158, 205–238`

**Anchor:** `    last: () => decorate(readSetting().at(-1)),`

**Current.**

`Hooks.once("ready")` returns early for non-GM users (line 206), so `game.pentaryn.pings` is undefined on player clients. That is fine for eval-js on the GM bridge, but discovery from any other client (`Object.keys(game.pentaryn)`) finds no pings, and nothing says why.

Each decorated record (`decorate`, 141–158) carries `age: "12s ago"` with no numeric sibling, so a question like "pings in the last minute" means parsing a string. The readers use the persisted setting, which can be up to 250 ms behind the in-memory buffer (69–80). `recent(0)` returns everything (a quirk pinned in transform-creatures-36). The record shape is written down only in the file header (13–22) and `context/foundry/markers.md:402–409`.

**Proposed.**

Additive: `decorate` adds `ageMs: now - rec.t` beside `age`. Publish `describe()` returning `{module, version, gmOnly: true, record: [t, userId, userName, sceneId, sceneName, x, y, canvas, image, gridSquare, snapped, age, ageMs], quirks: ["recent(0) returns all", "reads lag the buffer by ≤250 ms"]}`. The README (transform-creatures-35) carries the same table. Keep the GM-only publish (players never write the setting), but state it in `describe()` and the README.

**Behaviour test recipe (write first, must pass before and after).**

On the pings-core `decorate` fixture from transform-creatures-36: `decorate({t: 0, x: 1050, y: 850, userId: "u", sceneId: "s"}, {offset: {x: 1000, y: 800}, gridSize: 100}, 12000)` keeps every existing key with an identical value (deep-equal on the old key set, same key order first) and adds `ageMs: 12000`. Stub-run the `pings.mjs` ready handler with `game.user.isGM = false` → `game.pentaryn.pings` stays undefined (pinned, unchanged).

**Risk.** Additive field and read.

**Related:** transform-creatures-35, transform-creatures-36, ties-10 (same numeric-sibling rule)

## Categories checked with no finding

- **Performance:** checked `record()`. Per ping it does an O(1) dedupe against the last record and one `cap()` setting read, and the 250 ms debounced flush turns a burst into one write. The readers do one setting read and a map. Nothing found.
- **Defragmentation:** the publish guard (`pings.mjs:233–238`) and the `handlePing` patch idiom (160–185) are absorbed by the kit (`lib/publish`, `lib/patch`). Nothing pings-only.
- **Logging / auditability:** both capture paths catch and warn with the `pentaryn-pings |` prefix (lines 178 and 217); read and persist failures warn (59, 77); ready logs the record count (240). The only pings dropped silently have non-finite coordinates (89), by design. Nothing found.
- **Hardening:** only GM clients write (lines 73, 88 and 206). `record()` never throws into core's socket handler, because both call sites are wrapped. The patch probes for `handlePing` and is idempotent (166–170). The multi-GM last-writer-wins issue went to the live-test workflow (transform-creatures-37, dropped as a behaviour change), and the unregistered internals get adjustments rows in transform-creatures-35. Nothing further.
- **Documentation / skills:** there is no README (transform-creatures-35, Extendability) and no routing row (transform-creatures-20, filed under transform). The record shape is in the file header and `markers.md:402–409`. Covered by those two findings; nothing further.
