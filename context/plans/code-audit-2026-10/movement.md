---
title: "Code audit 2026-10 — pentaryn-movement"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-movement

**Read this when:** you are about to refactor, harden or document pentaryn-movement and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> **Re-anchored to 4e64f47 on 2026-10-11.** Every `Where`/line below is now a HEAD line (the working tree equals HEAD for this module). The usability re-run (17275c9, ledger U-8-7, module 0.1.1 → 0.1.2) added `core.ghostBack` (movement-core.mjs:121–129, 6 new checks: the suite now prints 89 passed), a `clearedBy` module variable (movement.mjs:297) and a "ghost is back" toast branch in `refresh()` (:308–312), plus two `notify.back.*` lang keys. Everything in movement.mjs above :297 kept its snapshot line; everything below moved +7 (snapshot :314 → :321, :336–426 → :343–433). Tally: 8 re-anchored (-19, -20, -21, -22 and -37 with moved lines or extended text; -17, -18, -23 unchanged lines), 0 resolved, 0 obsolete, 1 new (aoe-movement-portals-42); -19 and -22 extended to cover the new code.
>
> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

> **Status 2026-10-11 (workflow 2, `migrate/wave-2`, code phase; not yet live-tested).** Every finding
> is applied: -17 `5482317b` (wraps through the kit with adjustments ids; the three `foundry/adjustments.yml`
> rows are with the integrator) · -18 `5482317b` + `c4b77032` (`ghostKeyboardMovement` in core) · -19
> `34a4ca5a` (adapter) + `a9f32f7e` (context cache; per-token paths only, see the guide's Result) + `8f2ede50` (`refresh()` reads once for wishToClear, ghostBackKey and the button key) · -20
> `d65ddd62` (kit `warnOnce`, no `makeWarnOnce`) [declared, console only] (the optional `status().errors` is not done: wave-2 report W2-MOV-1) · -21 `c4b77032` (`SETTINGS` table
> in `settings.mjs`, kit `settingReader`) · -22 checkpoint `3a5192d` (glue driven through hooks, no seam) +
> `34a4ca5a` · -23 `c4b77032` (`statusFrom`) + `25c81ef9` (`describe()`) + `b3d69dbb` (`status({ sceneId })`,
> settings key map) [declared] + `1b5ec2a5` (README) · -37 `49b8554` / `4f7b5a8` + `1b5ec2a5` · -42 `0b1910cc`
> (`ghostBackKey`) [declared]. Record: `../addon-blueprint-2026-10/migrate-pentaryn-movement.md` "Result".

## Summary

### pentaryn-movement

**Purpose.**

Players' own tokens are drawn and clicked on top on their own screen (client-side sort lift). Players get a ghost movement toggle that adds core's unconstrained-movement constrain options, under a GM policy (off / exploration / always) with a toolbar flip. Also a console check for pins under tokens.

**Health.**

Small and clean:
- movement-core.mjs is pure, with 89 checks (83 at the snapshot; +6 for U-8-7 `ghostBack`) covering the policy, toolbar, flip, ghost-back, sort keys and pins.

Gaps:
- The glue (433 lines; 426 at the snapshot) cannot be imported in node: module-scope Hooks.on, and `foundry.utils.debounce` at line 321 (snapshot 314).
- The two hand-wrapped core private methods and the token layer `sortChildren` replacement are not in adjustments.yml.
- The hot refreshToken path recomputes combat summaries and reads settings for every token.
- Two bare `catch {}` blocks, one of them in a per-frame hook.
- The README is good for use but cites Foundry source line numbers that will drift.

**LLM interface.**

Today:
- `game.pentaryn.movement.status()` / `pinsUnderTokens()` through eval-js (18 log hits).
- status() only answers for the bridge tab's viewed scene.
- An LLM guessed a setting key (`pentaryn-movement.policy`) and failed, because nothing lists the real keys.
- `setGhost` is meaningless from the GM bridge, and that is not stated.

Should be:
- `status({sceneId})`.
- A `settings` key map and `version` in the status output.
- `describe()`.
- The README marks setGhost as player-client only.

**How to extend.**

Pure rules go in movement-core.mjs, with fixtures in test/run.mjs. Glue goes in movement.mjs.

What is unclear today:
- There is no settings table: defaults live at movement.mjs:48 and again in the init block at 343–367 (snapshot 336–360).
- No convention for core patches. It uses hand-wraps with a `__pentarynMovement` marker, whereas creatures and prompts use libWrapper with a fallback.
- No adjustments rows for the patches, so the next core update has nothing to check.
- A new movement-adjacent feature would need its own `setup` wrap with no shared helper.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| aoe-movement-portals-19 | Performance gains | medium | M | Every ghost/owned check re-reads settings and re-summarises every combat, once per token per refresh |
| aoe-movement-portals-18 | Maintainability gains | low | S | Keyboard ghost injection is untested logic inside the wrapper |
| aoe-movement-portals-21 | Maintainability gains | low | M | Settings defaults declared twice; local copy of the fallback setting reader |
| aoe-movement-portals-20 | Logging / auditability gains | low | S | Bare catches in a per-frame hook and in the toolbar render hide breakage completely |
| aoe-movement-portals-22 | Extendability | medium | S | Glue is never tested: no seam exports its functions for node tests |
| aoe-movement-portals-23 | LLM interface | medium | S | status() answers only for the viewed scene and does not name the setting keys |
| aoe-movement-portals-17 | Documentation / skills | medium | S | Two core private-method wraps and the token-layer sort replacement are missing from adjustments.yml |
| aoe-movement-portals-37 | Documentation / skills | low | S | README cites Foundry source line numbers that drift, and does not mark setGhost as player-only |
| aoe-movement-portals-42 | Hardening | low | S | New (U-8-7): the "ghost is back" toast names the reason it was cleared, not why it is allowed now, so a mid-fight policy change says "The fight is over" |

## Performance gains

### aoe-movement-portals-19 — Every ghost/owned check re-reads settings and re-summarises every combat, once per token per refresh

**Category:** Performance gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-movement/movement.mjs:65–91`

**Anchor:** `function combatSummaries() {`

**Current.**

ghostFor(token) calls policy(), wish() and combatActive(); combatActive() calls combatSummaries(), which maps every combat and every non-hidden combatant. ownedRankOf reads setting('ownedOnTop'). refreshTokens() (line 196) flags all tokens, so onRefreshToken runs ghostFor per token (line 188), and sortTokenObjects calls ownedRankOf per child per resort (line 168). With 40 tokens and a 12-combatant encounter one refresh does 40 combat scans (480 combatant reads) and 120+ game.settings.get calls, two of them client-scope. Since U-8-7 (4e64f47) `refresh()` itself also reads policy()/combatActive()/wish() twice — once for `wishToClear` (:301) and again for `ghostBack` (:309) — so each debounced refresh adds one more full combat scan before any token is touched.

**Proposed.**

Pure additions to movement-core.mjs: combatSceneIds(combats) returning every sceneId for which combatOnScene(combats, id) is true; buildGhostContext({ isGM, policy, wish, ownedOnTop, combats }) returning { isGM, policy: normalizePolicy(policy), wish: !!wish, ownedOnTop, combatScenes: new Set(...) }; ghostForCtx(ctx, { isOwner, sceneId }) calling ghostFor with combatActive: ctx.combatScenes.has(sceneId). Glue: let ctx = null; const context = () => (ctx ??= core.buildGhostContext({...live reads})). Invalidate (ctx = null) BEFORE queueRefresh (snapshot :314, now :321) in: onChange of ghostPolicy, ghost, ownedOnTop; the six combat hooks (createCombat, updateCombat, deleteCombat, createCombatant, updateCombatant, deleteCombatant); canvasReady. ghostFor, ownedRankOf, status, addTools and refresh (both the `wishToClear` call at :301 and the `ghostBack` call at :309) read through context(). isOwner stays read live per token.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-movement/test/run.mjs, equivalence over the matrix: policy in {off, exploration, always, 'junk'}, wish {true,false}, isGM {true,false}, isOwner {true,false}, combats in {[], [linked()], [linked({active:false})], [{active:true,sceneId:null,started:true,combatantSceneIds:[T]}], [linked({combatantSceneIds:[]})]} (reuse the S/T/linked fixtures), sceneId in {S, T, null} = 480 cases. Assert ghostForCtx(buildGhostContext({ isGM, policy, wish, ownedOnTop:true, combats }), { isOwner, sceneId }) equals ghostFor({ isGM, policy: normalizePolicy(policy), wish, isOwner, combatActive: combatOnScene(combats, sceneId) }) (the glue normalises the policy before calling core, so the baseline must too). Also assert combatSceneIds(c) contains a scene id exactly when combatOnScene(c, id) is true. Live check: README verify steps 1-3.

**Risk.** A missed invalidation means stale ghost state until the next refresh. Every input is behind a hook movement already registers (three setting onChanges, six combat hooks, canvasReady). Invalidation must precede the 50 ms debounce, otherwise a refresh could rebuild from the stale cache. The 480-case test proves cached equals live.

**Related:** aoe-movement-portals-20

## Maintainability gains

### aoe-movement-portals-18 — Keyboard ghost injection is untested logic inside the wrapper

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-movement/movement.mjs:141–157`

**Anchor:** `  function patched(objects, ...rest) {`

**Current.**

The keyboard wrapper body (lines 143-150) is pure logic over a private core result shape: for each moved object, m.constrainOptions = core.constrainFor(m.constrainOptions, true) when ghostFor(o). No node test covers it.

**Proposed.**

Add to movement-core.mjs: export function ghostKeyboardMovement(result, objects, isGhost) { const movement = result?.[1]?.movement; if (!movement) return result; for (const o of objects ?? []) { const m = movement[o?.id]; if (m && isGhost(o)) m.constrainOptions = constrainFor(m.constrainOptions, true); } return result; }. The wrapper body becomes const result = original.call(this, objects, ...rest); try { return core.ghostKeyboardMovement(result, objects, ghostFor); } catch (err) { console.warn(`${MOD} | keyboard constrain skipped`, err); } return result. Do NOT switch the wraps to libWrapper in this change: that alters wrapper chaining and cannot be proven without a live check.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-movement/test/run.mjs. r = ['x', { movement: { a:{ constrainOptions:{ ignoreWalls:false, k:1 } }, b:{ constrainOptions:{ ignoreWalls:false } } } }]; objs = [{id:'a'},{id:'b'},{id:'c'}]; out = ghostKeyboardMovement(r, objs, o => o.id === 'a'). Assert out === r (mutated in place, returned); r[1].movement.a.constrainOptions deep-equals { ignoreWalls:true, k:1, ignoreCost:true, ignoreTokens:true } (key order from constrainFor, verified); b unchanged; ghostKeyboardMovement(undefined, objs, () => true) === undefined; ghostKeyboardMovement([1, {}], objs, () => true) deep-equals [1, {}]; objects null leaves movement unchanged. Live check afterwards: game.pentaryn.movement.status().patched is { drag:true, keyboard:true }.

**Risk.** If ghostFor throws mid-loop the partial-mutation behaviour is identical to today because the try/catch stays in the glue.

**Related:** aoe-movement-portals-17, aoe-movement-portals-22

### aoe-movement-portals-21 — Settings defaults declared twice; local copy of the fallback setting reader

**Category:** Maintainability gains · **Impact:** low · **Effort:** M

**Where:** `foundry/module/pentaryn-movement/movement.mjs:48–54`

**Anchor:** `const DEFAULTS = { ghostPolicy: core.DEFAULT_POLICY, ghostPolicyLast: core.DEFAULT_POLICY, ghost: false, ownedOnTop: true };`

**Current.**

Each default is written in DEFAULTS (line 48) and again in each game.settings.register call (lines 344-367; snapshot 337-360), agreeing only by convention. setting() (50-52) is another copy of aoe/settings.mjs:75. A new movement setting needs three edits: DEFAULTS, register, lang.

**Proposed.**

Add a pure SETTINGS table to movement-core.mjs (key, scope, config, type as the string 'String'|'Boolean', default, optional choices and i18n stem) for ghostPolicy (world, config, choices POLICIES), ghostPolicyLast (world, hidden), ghost (client, hidden, Boolean false), ownedOnTop (client, config, Boolean true), and export const DEFAULTS = Object.fromEntries(SETTINGS.map(s => [s.key, s.default])). The init hook loops over SETTINGS in the same order, mapping type to String/Boolean, building name/hint from PENTARYN_MOVEMENT.settings.<i18n>.name/hint, choices to PENTARYN_MOVEMENT.settings.policy.<v>, and onChange from { ghostPolicy: queueRefresh, ghost: queueRefresh, ownedOnTop: refreshTokens }. Registration order and every registered option must stay identical.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-movement/test/run.mjs. Pin first: DEFAULTS deep-equals { ghostPolicy:'exploration', ghostPolicyLast:'exploration', ghost:false, ownedOnTop:true }; SETTINGS.map(s=>s.key) deep-equals ['ghostPolicy','ghostPolicyLast','ghost','ownedOnTop'] (today's registration order); the ghostPolicy choices equal POLICIES; SETTINGS.filter(s=>s.config).map(s=>s.key) equals ['ghostPolicy','ownedOnTop']. Register-capture test: import ../movement.mjs with the stubs from aoe-movement-portals-22 (Hooks capturing, foundry.utils.debounce identity), run the captured init callback against a game.settings.register spy, and compare the four calls (key, namespace, options minus onChange; onChange by presence) to a capture of today's four calls taken before the refactor.

**Risk.** A mapping slip renames a setting and stored values read back as defaults; the pinned key list and register-capture test catch it.

**Related:** aoe-movement-portals-13, aoe-movement-portals-22

## Logging / auditability gains

### aoe-movement-portals-20 — Bare catches in a per-frame hook and in the toolbar render hide breakage completely

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-movement/movement.mjs:392` and `:386` (snapshot 385 and 379)

**Anchor:** `  try { onRefreshToken(token, flags); } catch {}`

**Current.**

Two bare catches: the refreshToken hook (line 392; snapshot 385) discards every error, so if a core update renames token.mesh or renderFlags, owned-on-top and the ghost fade stop with no trace; renderSceneControls (line 386; snapshot 379) does the same for the dimmed combat badge. Logging naively in refreshToken would spam once per frame.

**Proposed.**

movement-core.mjs: export function makeWarnOnce(log) { const seen = new Set(); return (label, err) => { if (seen.has(label)) return false; seen.add(label); log(label, err); return true; }; }. Glue: const warnOnce = core.makeWarnOnce((label, err) => console.warn(`${MOD} | ${label} (further errors suppressed)`, err)); line 392: catch (err) { warnOnce('refreshToken', err); }; line 386: catch (err) { warnOnce('renderSceneControls', err); }. Optionally add status().errors listing labels seen (appended key, after patched).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-movement/test/run.mjs: calls=[]; w = makeWarnOnce((l,e)=>calls.push(l)); w('a',1)===true; w('a',2)===false; w('b',3)===true; calls deep-equals ['a','b']. The hooks still never throw because the catch remains.

**Risk.** No behaviour change beyond one console line per label per session.

**Related:** aoe-movement-portals-27, aoe-movement-portals-19

## Hardening

### aoe-movement-portals-42 — New (U-8-7): the "ghost is back" toast names the reason it was cleared, not why it is allowed now, so a mid-fight policy change says "The fight is over"

**Category:** Hardening · **Impact:** low · **Effort:** S

**Added:** 2026-10-11 re-anchor, for code the usability re-run added (17275c9, ledger U-8-7, module 0.1.2).

**Where:** `foundry/module/pentaryn-movement/movement.mjs:308–312` (with `movement-core.mjs:121–129`)

**Anchor:** `` ui.notifications.info(`PENTARYN_MOVEMENT.notify.back.${clearedBy}`, { localize: true }); ``

**Current.**

```js
if (wish()) clearedBy = null;
else if (!game.user.isGM && core.ghostBack({ cleared: clearedBy, policy: policy(), combatActive: combatActive(), wish: wish() })) {
  ui.notifications.info(`PENTARYN_MOVEMENT.notify.back.${clearedBy}`, { localize: true });
  clearedBy = null;
}
```

`ghostBack` answers only "is it allowed again", and the toast key is the reason it was *cleared*. Under policy `exploration` a fight starts, the player's ghost is cleared with reason `combat`; the GM then sets the policy to `always` while the fight is still running. `ghostAllowed({policy:'always', combatActive:true}).allowed` is true, so the player is told "The fight is over: ghost movement is available again…" while the fight is on. The core test `GM allows again → tell` (test/run.mjs:115) covers the reverse case (cleared `off`, now `always` during combat), which happens to read correctly. Console-free and harmless to data, but it is player-facing misinformation in exactly the moment the toast exists for. It is also a second template-built i18n key (C35 counts it; definite coverage fell from 12/27 to 12/29).

**Proposed.**

Declared, text-only change. Replace `ghostBack` with a pure `ghostBackKey({ cleared, policy, combatActive, wish })` in movement-core.mjs returning `null` or a full literal key: null when `!cleared || wish` or not allowed; `"PENTARYN_MOVEMENT.notify.back.off"` when `cleared === "combat" && combatActive` (the fight is still on, so it was the GM who allowed it); otherwise `` `PENTARYN_MOVEMENT.notify.back.${cleared}` `` written as a frozen literal map `{ combat: "…back.combat", off: "…back.off" }` so C35 sees definite keys. Glue: `const key = core.ghostBackKey(…); if (key) { ui.notifications.info(key, { localize: true }); clearedBy = null; }`. Keep `ghostBack` exported as `!!ghostBackKey(…)` until the migration's S3 so the six existing checks stay green.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-movement/test/run.mjs. Before: the six `ghostBack` checks (test/run.mjs:111–116) pass unchanged against the `!!ghostBackKey` shim. New table for `ghostBackKey`: `{cleared:'combat', policy:'exploration', combatActive:false, wish:false}` → `…back.combat`; `{cleared:'combat', policy:'always', combatActive:true, wish:false}` → `…back.off` (the fix; before the change the glue would post `…back.combat` — pin that in a `// KNOWN:` row first, then flip it in the commit that names the change); `{cleared:'off', policy:'always', combatActive:true, wish:false}` → `…back.off`; `{cleared:'off', policy:'off', combatActive:false, wish:false}` → null; `{cleared:null, …}` → null; `{…, wish:true}` → null. Every non-null value is a key present in `lang/en.json`. Live (player tab, scratch scene): ghost on, GM starts a combat (cleared toast), GM picks *Always allowed* in settings → the toast reads "The GM allows ghost movement again".

**Risk.** Only the text of one toast in one sequence changes; the once-only behaviour and `clearedBy` handling are pinned by the aoe-movement-portals-22 sequence test.

**Related:** aoe-movement-portals-22, aoe-movement-portals-21 (template keys / C35)

## Extendability

### aoe-movement-portals-22 — Glue is never tested: no seam exports its functions for node tests

**Category:** Extendability · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-movement/movement.mjs:321` (snapshot :314)

**Anchor:** `const queueRefresh = foundry.utils.debounce(() => refresh(), 50);`

**Current.**

movement.mjs runs foundry.utils.debounce (line 321; snapshot 314) and Hooks.on/once (343-433; snapshot 336-426) at import, so a bare import fails, but verified in the snapshot: with globalThis.Hooks = { on(){}, once(){} } and globalThis.foundry = { utils: { debounce: f => f } } it imports cleanly (13 Hooks.on plus 3 Hooks.once registrations) and exports nothing. So sortTokenObjects, onRefreshToken, status, pinsUnderTokens, patchDrag and patchKeyboard are checkable only live, purely for lack of a test export. Re-checked at 4e64f47: still 13 `Hooks.on` + 3 `Hooks.once`. **Extended (U-8-7):** the re-run added more glue-only logic of the same kind — the module variable `clearedBy` (:297) and the branch in `refresh()` (:303–312) that remembers why the wish was cleared, forgets it when the player turns ghost back on, and posts `PENTARYN_MOVEMENT.notify.back.<reason>` once. Only `core.ghostBack` is tested; the remember/forget/once sequence is not. No restructuring of the file is needed.

**Proposed.**

Add only a test seam at the bottom of movement.mjs: export const _internals = { sortTokenObjects, onRefreshToken, status, pinsUnderTokens, patchDrag, patchKeyboard, ghostFor, ownedRankOf, refresh }; leave module-scope hook registration and the debounce exactly as is (no registerHooks() restructure, no lazy debounce, so hook order and timing are untouched). Document the two-line stub recipe at the top of test/run.mjs.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-movement/test/run.mjs. Set globalThis.Hooks = { on:(n)=>regs.push(['on',n]), once:(n)=>regs.push(['once',n]) }; globalThis.foundry = { utils:{ debounce:f=>f } } BEFORE await import('../movement.mjs'). Pin: regs has exactly 13 'on' and 3 'once' entries, with names [getSceneControlButtons, renderSceneControls, drawTokenLayer, canvasReady, refreshToken, updateActor, updateToken, createCombat, updateCombat, deleteCombat, createCombatant, updateCombatant, deleteCombatant] and [init, setup, ready]. Then with globalThis.game = { user:{isGM:false}, settings:{ get:(m,k)=>({ownedOnTop:true})[k] }, users:{ some:()=>false } } call _internals.sortTokenObjects.call(layer) on a layer whose children are { document:{elevation:0,sort:9,isOwner:false}, zIndex:0 }, { document:{elevation:0,sort:2,isOwner:true}, zIndex:0 }, { document:{elevation:30,sort:0,isOwner:false}, zIndex:0 }; assert the resulting order is [friend, mine, flyer], the same order core.compareTokens gives in the existing tests, and layer.sortDirty === false. Ghost-back sequence (U-8-7), as a player with `settings.get` reading a mutable `{ghostPolicy, ghost, ownedOnTop}`, `settings.set` writing it, `game.combats` swappable, `ui.notifications.info` a spy and `ui.controls.render` a no-op: (1) policy 'exploration', ghost true, an active combat on the viewed scene → `await _internals.refresh()` → info called once with `PENTARYN_MOVEMENT.notify.cleared.combat` and ghost now false; (2) combat removed → refresh → info called with `PENTARYN_MOVEMENT.notify.back.combat`; (3) refresh again → no new info (once only); (4) repeat (1), then set ghost true by hand (the player clicks), then remove the combat → refresh → no back toast (the wish reset `clearedBy`); (5) a GM user never gets either toast.

**Risk.** Adding an export changes nothing at runtime. The pinned hook list proves no registration is lost or reordered. `clearedBy` is module state: the sequence test must re-import (or reset through the seam) between cases.

**Related:** aoe-movement-portals-18, aoe-movement-portals-21

## LLM interface

### aoe-movement-portals-23 — status() answers only for the viewed scene and does not name the setting keys

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-movement/movement.mjs:94–104`

**Anchor:** `function status() {`

**Current.**

status() uses combatActive() with its default canvas?.scene?.id, which from the MCP bridge is whatever scene the bridge tab views, so a caller cannot ask about another scene. Nothing in the api surfaces the real setting keys (ghostPolicy, ghostPolicyLast, ghost, ownedOnTop). setGhost changes only the calling client's setting (a no-op for players when called from a GM bridge) and setPolicy throws Error('GM only'); neither is documented.

**Proposed.**

Additive: status({ sceneId = canvas?.scene?.id } = {}) passing sceneId to combatActive; append sceneId, version (game.modules.get(MOD)?.version) and settings: { policy:'ghostPolicy', last:'ghostPolicyLast', wish:'ghost (client)', ownedOnTop:'ownedOnTop (client)' } AFTER the existing keys; add describe() listing api methods with who (setGhost: 'player client only', setPolicy: 'GM'). Extract assembly into pure core.statusFrom({ policy, combat, wish, isGM, ownedOnTop, patched }).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-movement/test/run.mjs. Pin the current shape: statusFrom({ policy:'exploration', combat:true, wish:true, isGM:false, ownedOnTop:true, patched:{drag:true,keyboard:false} }) deep-equals { policy:'exploration', combatOnScene:true, allowed:false, reason:'combat', wish:true, ghost:false, ownedOnTop:true, patched:{drag:true,keyboard:false} } with exactly that key order (movement.mjs:98-103). Second case { policy:'always', combat:true, wish:true, isGM:false } gives ghost:true. New keys come after patched, so a prefix comparison still holds.

**Risk.** Additive; existing key order is preserved and pinned.

**Related:** aoe-movement-portals-10, aoe-movement-portals-37

## Documentation / skills

### aoe-movement-portals-17 — Two core private-method wraps and the token-layer sort replacement are missing from adjustments.yml

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-movement/movement.mjs:113–181`

**Anchor:** `/** Wrap Token#_getDragConstrainOptions on the configured token class (dnd5e's Token5e). */`

**Current.**

movement patches Token#_getDragConstrainOptions (line 114), TokenLayer#_prepareKeyboardMovementUpdates (133, reads the private result shape result[1].movement[id].constrainOptions) and replaces canvas.tokens.objects.sortChildren with a copy of core's sort (164-181). grep of foundry/adjustments.yml finds no pentaryn-movement row (only core-portals-relative-uuid exists for portals), so the updater's escalation step never flags a core change to these. NOTE: adjustments.yml was uncommitted/in flux at snapshot; re-anchor before editing.

**Proposed.**

Add three rows in the existing format (fields: id, packages, modules, files, markers, what, why, native_when, retire_class, check). 1) core-token-drag-constrain-ghost: packages [core, dnd5e], modules [pentaryn-movement], files [foundry/module/pentaryn-movement/movement.mjs], markers ['_getDragConstrainOptions','__pentarynMovement'], what/why: adds ignoreWalls/ignoreCost/ignoreTokens to a player's drag constrain options while ghost is on; native_when: core offers players an unconstrained-movement permission; retire_class guarded; check make foundry-movement-check. 2) core-token-keyboard-constrain-ghost: markers ['_prepareKeyboardMovementUpdates'], otherwise same. 3) core-token-layer-sort-owned: markers ['sortChildren','_lastSortedIndex'], what: replaces the token layer's interaction sort with core's keys plus an owned rank; native_when: core exposes a sort hook or owned-on-top option; retire_class guarded.

**Behaviour test recipe (write first, must pass before and after).**

No runtime change. make foundry-adjustments-check (python -m scripts.foundry.update.adjustments --exposure) must pass: every file exists and at least one marker per row is present. Pin with grep -c '_getDragConstrainOptions\|_prepareKeyboardMovementUpdates\|sortChildren' foundry/module/pentaryn-movement/movement.mjs >= 3. The pytest around adjustments.yml (scripts/tests/test_update_escalation.py) should accept the new rows.

**Risk.** None at runtime; a malformed row fails the adjustments check immediately.

**Related:** aoe-movement-portals-18, aoe-movement-portals-31

### aoe-movement-portals-37 — README cites Foundry source line numbers that drift, and does not mark setGhost as player-only

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-movement/README.md:43`

**Anchor:** `` | `ignoreWalls`, `ignoreCost` | core `Token#constrainMovementPath` (`client/canvas/placeables/token.mjs:2943`) | ``

**Current.**

The README pins core source lines that change every release: token.mjs:2943 (line 43), token.mjs:4923 (line 46), client/documents/token.mjs:1723/1813 (line 58); the movement.mjs header comment repeats them (lines 15, 17, 24). The Console section (lines 83-92; snapshot 82-91) says setGhost is 'same as the player's button' without noting that from a GM client (and so from the MCP bridge) it only sets the GM's own client setting, which ghostFor ignores for GMs. The settings table does not show full get-keys.

**Proposed.**

Replace the line numbers with method names plus a 'verified on core 14.xxx / dnd5e 6.0.6' stamp, in the README and the movement.mjs header. Console: 'setGhost(on): player clients only; on a GM client it changes nothing for players.' Settings table: add a column with the full call, e.g. game.settings.get('pentaryn-movement','ghostPolicy') and its scope.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. Add to the README docs pytest (aoe-movement-portals-33) a guard that foundry/module/pentaryn-movement/README.md matches no regex r'\.mjs:\d{3,}'. Today (re-checked at 4e64f47) it has 3 hits in the README (lines 43, 46, 58) and 3 in movement.mjs comments (15, 17, 24); the guard passes at 0 after the edit.

**Risk.** None.

**Related:** aoe-movement-portals-23, aoe-movement-portals-17

## Categories checked with no finding

- **Defragmentation:** checked `movement.mjs` and `movement-core.mjs`. `DEFAULTS`/`setting()` (lines 48–52) is aoe-movement-portals-21 (Maintainability) plus the kit. The two prototype patches use the `__pentarynMovement` marker idiom, which `lib/patch` absorbs with the marker kept. Nothing found.
- **Hardening:** (snapshot) checked. Both prototype patches probe for their method and warn when it is absent (114–118, 133–137), are idempotent by marker, and fall back to core's result on a throw (125, 151). The policy flip is GM-only (268). `ghostPolicy` is world-scoped, while the player's wish (`ghost`) and `ownedOnTop` are client-scoped (registrations 337–358), so players never write world settings. Nothing found at the snapshot; the unregistered internals are aoe-movement-portals-17 (Docs). The 2026-10-11 re-anchor added aoe-movement-portals-42 for new U-8-7 code.
- **Stylesheet:** `movement.css` (14 lines): one rule, `#scene-controls button.tool.pm-blocked`, prefixed `.pm-`. Nothing found.
