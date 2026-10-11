---
title: "Code audit 2026-10 — pentaryn-creatures"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-creatures

**Read this when:** you are about to refactor, harden or document pentaryn-creatures and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

> **Re-anchored to `4e64f47` on 2026-10-11.** Every **Where**/**Anchor** below now points at HEAD `4e64f47` (the working tree equals HEAD for this module). The usability re-run (`17275c9`, ledger U-6-12 in [`../usability-changes-2026-10.md`](../usability-changes-2026-10.md)) added `placeStrip()` + `dockTimer` (creatures.mjs:233-248), `stripDock` (creatures-core.mjs:126-139), a fourth setting `floatOverHud` (creatures.mjs:340-344) and the adjustments row `creatures-strip-over-argon` (adjustments.yml:873-882). Lines 1-232 of creatures.mjs did not move; everything after shifted by +18 (strip) and +23 (after the new setting). Snapshot line numbers are kept in brackets where they help.

| Id | Re-anchor status (HEAD `4e64f47`) |
|---|---|
| transform-creatures-25 | re-anchored — creatures.mjs:314 (snapshot :296); still open, and `render()` now also calls `placeStrip()` |
| transform-creatures-26 | re-anchored — unchanged at creatures.mjs:69-70 |
| transform-creatures-27 | re-anchored — unchanged at creatures.mjs:92 |
| transform-creatures-28 | re-anchored — unchanged at creatures-core.mjs:56-77 |
| transform-creatures-29 | re-anchored — unchanged at creatures.mjs:129-146; adjustments row still adjustments.yml:266-275 |
| transform-creatures-30 | re-anchored — unchanged at creatures.mjs:21-36; aoe's `isHandleTarget` moved to pentaryn-aoe/core.mjs:364-368; pentaryn-portals now holds two more copies (aoe-movement-portals-43) |
| transform-creatures-31 | re-anchored — creatures.mjs:366-380 (snapshot :343-357); `status()` should also report `floatOverHud` |
| transform-creatures-40 | **new** (re-run code) — `placeStrip` polls Argon's DOM every 500 ms on every player client |

## Summary

### pentaryn-creatures

**Purpose.**

Makes player-owned creatures findable. The active GM's client gives player-owned npc tokens a small flagged light. A per-client Token#isVisible wrap (libWrapper, or a direct getter fallback) lets owners see their own unseen tokens. A 'Your creatures' portrait strip sits above the hotbar.

**Health.**

Small and clean, with a correct core/glue split. creatures-core.mjs has 69 passing fixtures, including idempotence after its own write. Weak spots: the light queue is a debounce that steady traffic keeps pushing back (transform fixed the same bug class in 0.2.0); the strip recomputes on every token move on the viewed scene; ownerOverride swallows every error on a hot getter that reads private core fields (_testCulled, _preview._previewType); the adjustments row is vague; and token.light has no arbitration with pentaryn-senses (baseline §5.7). Since the re-run (U-6-12) the strip also polls Argon's DOM twice a second while it exists (transform-creatures-40).

**LLM interface.**

Today: game.pentaryn.creatures.{list, render, syncScene, syncAll, isCreature, ownerSees, patchedWith, core}. list(user) is a good read of what a given player's strip shows. syncScene's ids must be a Set, not an array, and ownerSees needs a Token placeable, not a document. There is no status() (patch mode, settings, writer, lit-token count), so an LLM pieces it together from settings and flags. It should add status() and accept arrays or ids at the API boundary only.

**How to extend.**

Pure decisions go in creatures-core.mjs with a fixture in test/run.mjs. Hooks and glue go in creatures.mjs under the matching numbered section (1 light, 2 visibility, 3 strip). Unclear today: who else writes token.light (senses, transform starry through senses), and that the aoe-handle and Item Piles predicates are hand copies of aoe/core.mjs:364 (snapshot :310) and other modules.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| transform-creatures-25 | Performance gains | medium | S | The strip recomputes on every token move on the viewed scene, on every client |
| transform-creatures-27 | Performance gains | low | S | Every light write re-queues itself for a no-op pass |
| transform-creatures-30 | Defragmentation | low | S | Hand copies of cross-module predicates: writer election, aoe handle, Item Piles pile |
| transform-creatures-29 | Logging / auditability gains | medium | S | The Token#isVisible override swallows every error and depends on private core fields |
| transform-creatures-26 | Hardening | medium | S | The light queue is a debounce that steady token traffic can postpone indefinitely |
| transform-creatures-28 | Hardening | medium | S | Characterize the token.light hand-off with pentaryn-senses before anyone 'fixes' arbitration |
| transform-creatures-31 | LLM interface | medium | S | Creatures API: syncScene needs a Set, ownerSees needs a placeable, no status() |
| transform-creatures-40 | Performance gains | low | S | placeStrip polls Argon's DOM every 500 ms on every player client, even with floatOverHud off or Argon inactive |

## Performance gains

### transform-creatures-25 — The strip recomputes on every token move on the viewed scene, on every client

**Category:** Performance gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-creatures/creatures.mjs:314` (endLine 314; snapshot :296)

**Anchor:** `Hooks.on(h, (doc) => { if (doc.parent?.id === canvas?.scene?.id) scheduleRender(); });`

**Current.**

createToken/deleteToken/updateToken share one handler (lines 313-315; snapshot 295-297): any updateToken on the viewed scene, including pure x/y/elevation/rotation drags by anyone, schedules render() 60 ms later. render() (215-231) calls list(), which summarizes every scene token (actor deref, flag probes, isOwner), sorts and builds the signature; only then does stripSignature (tested at test/run.mjs:133) decide nothing changed. Since U-6-12 every render() that reaches the end also calls placeStrip() (line 230), one layout read of Argon's bar. The light-queue hook (line 107) already skips pure moves via LIGHT_KEYS. GM clients also schedule although render() exits early for them.

**Proposed.**

Keep createToken/deleteToken. For updateToken re-render only when changes touch a field summarize() reads: `const STRIP_KEYS=['name','texture','hidden','actorId','actorLink','delta','flags']; Hooks.on('updateToken',(doc,changes)=>{ if (doc.parent?.id===canvas?.scene?.id && STRIP_KEYS.some(k=>k in (changes??{}))) scheduleRender(); })`. Keep controlToken/markControlled and the updateActor hook (ownership/img/name).

**Behaviour test recipe (write first, must pass before and after).**

Pure seam in creatures-core.mjs: `STRIP_KEYS` and `stripMayChange(changes)`. test/run.mjs: {x:1,y:2} false; {elevation:5} false; {name:'x'} true; {texture:{src:'a'}} true; {hidden:true} true; {delta:{system:{}}} true; {flags:{'item-piles':{}}} true; null false. Completeness: a summary built from a token with only x changed gives equal stripSignature(stripEntries([before])) and ([after]) (existing check at line 133 style).

**Risk.** A missed key feeding summarize() leaves the strip stale. summarize reads name, texture.src, actor (actorId/actorLink/delta), hidden, flags (item-piles, pentaryn-aoe), isOwner; ownership changes arrive via updateActor.

### transform-creatures-27 — Every light write re-queues itself for a no-op pass

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-creatures/creatures.mjs:92` (endLine 92; unchanged at HEAD)

**Anchor:** `if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);`

**Current.**

syncScene writes light.* and flags.pentaryn-creatures.light; the updateToken hook (lines 105-108, LIGHT_KEYS at 103 contains 'light' and 'flags') sees them and queues the same tokens; 200 ms later syncScene re-summarizes and lightUpdate returns null (pinned: test/run.mjs 'idempotent after write'). One extra summarize pass plus a timer per write.

**Proposed.**

Pass an option on the write: `scene.updateEmbeddedDocuments('Token', updates, { pentarynCreatures: true })`, and change the hook to `(doc, changes, options) => { if (options?.pentarynCreatures) return; if (LIGHT_KEYS.some(...)) queue(...); }`. Other modules' writes still queue.

**Behaviour test recipe (write first, must pass before and after).**

Pure seam `shouldQueueLight(changes,options)` in creatures-core.mjs. test/run.mjs: ({light:{bright:5}},{}) true; ({x:1},{}) false; ({flags:{}},{pentarynCreatures:true}) false; ({actorId:'a'},undefined) true. The existing idempotence fixture proves the skipped pass changes nothing.

**Risk.** The update contains only this module's keys, so no foreign change can be skipped.

### transform-creatures-40 — placeStrip polls Argon's DOM every 500 ms on every player client, even with floatOverHud off or Argon inactive

*Added 2026-10-11 at the re-anchor to `4e64f47`; the code is from the usability re-run (`17275c9`, U-6-12).*

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-creatures/creatures.mjs:235–248`

**Anchor:** `  dockTimer ??= setInterval(placeStrip, 500);`

**Current.**

placeStrip() (233-248) is called at the end of every render() (line 230) and arms `dockTimer ??= setInterval(placeStrip, 500)` (247) the first time a strip exists. Each tick runs two `document.querySelector` calls for `.extended-combat-hud .action-hud` / `.extended-combat-hud`, reads `offsetParent` and `getBoundingClientRect()` (forced layout when the DOM is dirty), reads the `floatOverHud` setting and rewrites `el.style.bottom/left` and the `pcr-floating` class even when nothing changed. The interval is only cleared when a tick finds no strip (238). Nothing gates it on the setting (with `floatOverHud` off it still polls, then writes empty styles) or on Argon being active (`game.modules.get("enhancedcombathud")?.active`): a player with two owned tokens and no Argon pays two layout reads a second for the whole session. The comment at 245-246 records why it polls (Argon has no reliable open/close hook), so the poll itself is a deliberate choice; the gaps are the missing gates and the unconditional style writes. The adjustments row `creatures-strip-over-argon` (adjustments.yml:873-882) covers the selector, so this is a cost finding, not a registry gap.

**Proposed.**

Keep the poll, add gates: (1) pure `shouldPollDock({ stripPresent, floatOverHud, argonActive })` in creatures-core.mjs = all three true; placeStrip clears the interval and returns docked styles when it is false, and the `floatOverHud` setting gets `onChange: () => placeStrip()` so turning it back on re-arms. (2) Write styles only when `stripDock`'s result differs from the last one applied (keep `lastDock` as a `"bottom,left"` string or null). No change to where the strip sits.

**Behaviour test recipe (write first, must pass before and after).**

creatures test/run.mjs: `shouldPollDock({stripPresent:true, floatOverHud:true, argonActive:true})` true; any one false → false (three rows). `dockKey(stripDock({top:700,left:300,width:900,height:120},900))` → `"208,300"`; `dockKey(null)` → `null` (pure helper for the change test). The four existing `stripDock` fixtures (test/run.mjs:135-139) stay green unchanged. Glue characterisation (with migrate-pentaryn-creatures step 1's DOM stub and `t.mock.timers`): today a render with two owned tokens and **no** `.extended-combat-hud` element arms exactly one interval and each 500 ms tick calls `querySelector` twice (`// KNOWN:` -40); after the fix, with `game.modules.get("enhancedcombathud")` inactive, no interval is armed and the strip's `style.bottom` stays `""`; with Argon active and a bar rect `{top:700,left:300,width:900,height:120}` in a 900 px window the strip gets `bottom: 208px; left: 300px` and class `pcr-floating` exactly as today (the U-6-12 retest numbers).

**Risk.** If Argon is renamed or loaded under another id, the gate turns floating off (the strip falls back to docked, today's pre-U-6-12 behaviour); the `creatures-strip-over-argon` row's markers make the updater flag that. Behaviour with Argon active is unchanged.

**Related:** transform-creatures-25 (the other per-client strip cost)

## Defragmentation

### transform-creatures-30 — Hand copies of cross-module predicates: writer election, aoe handle, Item Piles pile

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-creatures/creatures.mjs:21–36` (unchanged at HEAD)

**Anchor:** `const isWriter = () => game.users?.activeGM?.isSelf === true;`

**Current.**

creatures.mjs hand-copies: isWriter (21: activeGM?.isSelf === true, no fallback) vs senses.mjs:21 (`?? game.user.isGM`), transform-core pickRunner (falls back to an owner), pings (plain isGM); isProp (34-36) re-implements pentaryn-aoe/core.mjs:364-368 isHandleTarget (snapshot :310) (flags.handle on the doc, or handleActor on the actor) without aoe's `doc.token` branch; isPile (28-31) is one of several Item Piles variants. A change to aoe's handle flag or the GM election policy must be found by grep. Since the re-run pentaryn-portals carries two more copies of the handle predicate (portals.mjs:543 with the actor branch, :673 without it) — filed as aoe-movement-portals-43.

**Proposed.**

Module isolation forces copies, so make them explicit and tested: move isProp/isPile into creatures-core.mjs as pure `isAoeHandle(tokenFlags,actorFlags)` and `isItemPile(tokenFlags,actorFlags)` with a header comment citing pentaryn-aoe/core.mjs:364 (`isHandleTarget`); comment the writer policy ('active GM only, no fallback: lights wait until a GM connects'). Do not add aoe's doc.token branch (behaviour change).

**Behaviour test recipe (write first, must pass before and after).**

creatures test/run.mjs: isAoeHandle({'pentaryn-aoe':{handle:'r1'}},{}) true; isAoeHandle({},{'pentaryn-aoe':{handleActor:true}}) true; isAoeHandle({},{}) false; isItemPile({'item-piles':{data:{enabled:true}}},{}) true; isItemPile({},{'item-piles':{data:{enabled:true}}}) true; isItemPile({'item-piles':{data:{enabled:false}}},{}) false. Optional pytest contract test (with transform-creatures-21's harness) that aoe isHandleTarget and creatures isAoeHandle agree on those shapes.

**Risk.** Exact flag paths must be kept; the fixtures pin them.

## Logging / auditability gains

### transform-creatures-29 — The Token#isVisible override swallows every error and depends on private core fields

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-creatures/creatures.mjs:129–146` (unchanged at HEAD)

**Anchor:** `function ownerOverride(token) {`

**Current.**

ownerOverride runs inside a getter core calls for every token on every visibility refresh. It reads token._preview?._previewType, token.isFilteredOut and token._testCulled(). Any core rename throws and the bare `catch { return false; }` turns 'owners see their own' off with no console trace. The adjustments row creatures-libwrapper (adjustments.yml:266-275, unchanged at HEAD) says only 'wraps core methods' and names only marker libWrapper.register, so the updater cannot flag these private reads.

**Proposed.**

(1) Warn once per session in the catch (module-level `warned` flag; console.warn with MODULE prefix and the error) and still return false. (2) Rewrite the adjustments row: what 'Token#isVisible getter wrapped (libWrapper WRAPPER, else Object.defineProperty on the prototype); reads private _testCulled, _preview._previewType, isFilteredOut'; markers ['isVisible','_testCulled','_previewType','libWrapper.register']; native_when 'core lets owners always see owned tokens'; retire_class guarded.

**Behaviour test recipe (write first, must pass before and after).**

Extract `overrideFor(tokenView,{enabled,isGM})` into creatures-core.mjs (token fields passed as plain values) plus `safely(fn,onError)`. test/run.mjs: a throwing field accessor -> false and onError called once across two calls (warn-once); the existing ownerShouldSee fixtures (lines 86-95) driven through overrideFor give the same booleans. Run the adjustments-markers check (update-escalation tests / foundry-creatures-check) to prove the new markers exist in creatures.mjs.

**Risk.** Return values identical; one console line only on failure.

## Hardening

### transform-creatures-26 — The light queue is a debounce that steady token traffic can postpone indefinitely

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-creatures/creatures.mjs:69–70` (unchanged at HEAD)

**Anchor:** `clearTimeout(flushTimer);`

**Current.**

queue() clears and re-arms the 200 ms flushTimer on every call. LIGHT_KEYS includes 'flags', which many modules write constantly during combat, so a summon's light can wait arbitrarily long. pentaryn-transform fixed the same class of bug in 0.2.0 (one timer, never pushed back).

**Proposed.**

Arm once and never push back: `if (!flushTimer) flushTimer = setTimeout(()=>{ flushTimer=null; flush(); },200);` and remove the clearTimeout. Everything queued in the window flushes together.

**Behaviour test recipe (write first, must pass before and after).**

Extract `makeCoalescer(delayMs,run,{setTimeout,clearTimeout})` into creatures-core.mjs. test/run.mjs with a fake clock: first write the test against the old (debounce) coalescer: queues at t=0,50,100,150,190 run once at t=390. Then the new behaviour: one run at t=200; a queue at t=250 runs again at t=450; run receives all ids queued before it fires. End-state equivalence already pinned by 'idempotent after write' and the lightUpdate fixtures.

**Risk.** Deliberate timing change (latency bounded to 200 ms after the first change instead of after the last); final lights identical because lightUpdate is idempotent.

### transform-creatures-28 — Characterize the token.light hand-off with pentaryn-senses before anyone 'fixes' arbitration

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-creatures/creatures-core.mjs:56–77` (unchanged at HEAD)

**Anchor:** `export function lightUpdate(token, { qualifies, radius } = {}) {`

**Current.**

Two modules own token.light through separate flags: creatures (flags.pentaryn-creatures.light) and senses (itemLight / itemLightPrior; transform's Starry writes through senses). Sequence: creatures lights a summon 5/5 and flags it; senses writes its own light; creatures sees ours && !isOurs and drops its flag; senses later restores the prior 5/5 as an unflagged 'own light', which creatures leaves alone (`!dark -> null`); if the summon then stops qualifying the 5/5 stays forever (orphan). The creatures side of this is verified from lightUpdate; the senses-side steps are an assumption simulated with plain data.

**Proposed.**

Add the composed scenario to creatures test/run.mjs as a characterization (plain data only, no senses import). Document the hand-off in creatures/README.md under 'Other writers of token.light' pointing at senses.mjs. Any later arbitration change then becomes a deliberate behaviour change the fixture flags.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs (helper tok(bright,dim,ours) and FK exist): s1=tok(); lightUpdate(s1,on) -> {light.bright:5,light.dim:5,[FK]:{bright:5,dim:5}}; s2=tok(5,5,{bright:5,dim:5}). Senses writes light: s3=tok(10,20,{bright:5,dim:5}); lightUpdate(s3,on) -> {[FK]:null}; s4=tok(10,20,null). Senses restores prior: s5=tok(5,5,null); lightUpdate(s5,on) -> null and lightUpdate(s5,off) -> null (the pinned orphan); lightUpdate(s5,{qualifies:true,radius:0}) -> null.

**Risk.** Test only; protects the light against a well-meant refactor.

## LLM interface

### transform-creatures-31 — Creatures API: syncScene needs a Set, ownerSees needs a placeable, no status()

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-creatures/creatures.mjs:367–376` (snapshot :344-353; the deferred publish block is 366-380)

**Anchor:** `const api = {`

**Current.**

syncScene(scene,ids) calls ids.has (line 88), so an LLM passing an array throws 'ids.has is not a function'. ownerSees(token) needs a Token placeable (reads token.document and _testCulled); given a TokenDocument it silently returns false. No single call answers 'is the override installed, which way, what radius, am I the writer, how many tokens carry our light, is the strip floating over the HUD' without reading settings, patchedWith() and token flags.

**Proposed.**

At the API boundary only: `syncScene: (scene,ids)=>syncScene(scene, ids==null ? null : toIdSet(ids))`; `ownerSees: (t)=>ownerOverride(t?.object ?? t)`; add `status()` returning {patchedWith, ownerSees: setting('ownerSees',true), lightRadius: setting('lightRadius',5), showStrip, floatOverHud: setting('floatOverHud',true) (added by the re-run), writer: isWriter(), lit: count of tokens on all scenes with readOurLight != null, version}. Internals unchanged; document shapes in the README.

**Behaviour test recipe (write first, must pass before and after).**

Pure seam `toIdSet(ids)` in creatures-core.mjs: null/undefined -> null; a Set -> the same Set (identity); ['a','b'] -> Set size 2; a bare string 'a' -> new Set(['a']) (never null, since null means 'all tokens'). Add `countLit(flagsList)` pinned with [{bright:5,dim:5}, false, undefined] -> 1.

**Risk.** Valid inputs (Set, null) behave identically; only inputs that throw or silently return false today change.

## Categories checked with no finding

- **Maintainability:** checked `creatures.mjs` (380 lines at `4e64f47`, was 357; three features in numbered sections, the strip section now includes `placeStrip`) and `creatures-core.mjs` (139 lines, was 124; 73 checks, was 71 at the audit). The local `setting()` fallback (`creatures.mjs:22`) is absorbed by the kit (`lib/settings`), and the hand-copied predicates are transform-creatures-30 (Defragmentation). Size and structure are fine. Nothing found.
- **Extendability:** README sections 1–3 map one-to-one onto the code sections, and a new rule goes in `creatures-core.mjs` with a fixture. Nothing found.
- **Documentation / skills:** checked `README.md` (135 lines at `4e64f47`, was 131; the re-run added the "Over the Combat HUD" bullet and the `floatOverHud` setting) against the published API (`creatures.mjs:366–380`, was 343-357). `list`, `render`, `syncScene`, `syncAll`, `isCreature`, `ownerSees`, `patchedWith` and `core` are all documented. The "Read this when", Tests, dnd5e 6 and Install sections are present, including the turn-off procedure. Nothing found; the `syncScene` Set argument is transform-creatures-31 (LLM).
- **Stylesheet:** `creatures.css` (59 lines at `4e64f47`, was 51): every rule is under `#pentaryn-creatures` with `.pcr-*` children; the re-run's `#pentaryn-creatures.pcr-floating` (53-59) follows the same scope. Nothing found.
