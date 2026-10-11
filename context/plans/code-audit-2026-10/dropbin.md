---
title: "Code audit 2026-10 — pentaryn-dropbin"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-dropbin

**Read this when:** you are about to refactor, harden or document pentaryn-dropbin and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-dropbin

**Purpose.**

Combines five jobs. (1) An append-only ledger of items leaving characters (Item Piles drops and sheet deletes), with restore, stored in a world setting and mirrored to assets/drop-bin/drop-log.json, with player writes routed through socketlib. (2) Item Piles patches: attunement 'NaN' repair, locked-container enforcement, directory hiding, lock sounds, and the in-view rule (no sight on piles, non-global readable pins). (3) Lootable corpses with a drawn eye badge (corpses.mjs). (4) A Loot all button (loot.mjs). (5) The dnd5e 6 i18n shim for itempilesdnd5e.

**Health.**

dropbin.mjs is 528 lines carrying five unrelated concerns, plus three satellite files. The pure seams (loot-core, i18n-shim) are well tested with 40 checks, but the ledger, which is the module's namesake, has zero tests. It has a real concurrency hazard: concurrent recordAsGM calls lose entries. Every entry rewrites the whole ledger setting and mirror. Item Piles detection appears in 5 variants, and three of them use getFlag('item-piles'), which throws when Item Piles is inactive. User-facing strings are hardcoded in English even though lang/en.json exists. The module id is defined in three places. The README is decent and routes by job.

**LLM interface.**

Today an LLM calls game.pentaryn.dropbin.{list, all, get, search, restore, export, clear, corpses.*, loot.*} through eval-js. list() returns complete item source objects, which costs a lot of context; logged scripts truncate them with JSON.stringify(x).slice(...). restore() returns a Notification object on refusal and an Item on success. No method says GM-only except by behaviour. Target state: list(n,{brief:true}) returning {n, t, reason, itemName, quantity, fromActorName, sceneName}; restore returning {ok, reason, item?}, or at least documented shapes; describe(); and a shared actor resolver.

**How to extend.**

Today a new Item Piles patch would be appended to the bottom of dropbin.mjs, because 'it is already enabled' (header lines 41–45). That is how the file grew to five concerns. Proposed split (items-journal-22): ledger.mjs plus ledger-core.mjs, itempiles/attunement-repair.mjs, itempiles/locks.mjs, itempiles/visibility.mjs, with dropbin.mjs reduced to imports. Each Item Piles patch should also get its own adjustments.yml row (items-journal-29). Unclear today: whether Item Piles fixes for attunement live here or in pentaryn-attunement.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| items-journal-19 | Performance gains | medium | M | Every ledger entry rewrites and broadcasts the whole ledger, then re-uploads the whole JSON mirror |
| items-journal-24 | Performance gains | medium | S | Journal-directory filter scans every scene's notes once per sidebar row |
| items-journal-25 | Performance gains | low | S | Ready-time backfills write one actor at a time and run on every GM client |
| items-journal-30 | Performance gains | low | S | Corpse eye redraws its disc on every refreshToken; effect hooks queue timers on non-GM clients |
| items-journal-20 | Maintainability gains | medium | S | The ledger has no tests: extract ledger-core.mjs |
| items-journal-26 | Maintainability gains | low | S | Hardcoded English strings despite a lang file; module id declared in three places |
| items-journal-27 | Maintainability gains | low | S | Dead guard: the 'restoring' option is set on a create but checked on delete |
| items-journal-22 | Defragmentation | medium | M | dropbin.mjs carries five unrelated concerns; split it without changing load behaviour |
| items-journal-21 | Logging / auditability gains | medium | S | Player-side ledger submits reject unhandled when no GM is online; corpse revive toggle is unawaited |
| items-journal-18 | Hardening | high | M | Concurrent ledger writes reuse numbers (read-modify-write across awaits) |
| items-journal-23 | Hardening | medium | S | getFlag('item-piles', ...) throws when Item Piles is inactive; several pile-detection variants in one module |
| items-journal-28 | LLM interface | medium | S | Dropbin API: list() returns full item sources, restore() returns Notification objects, resolver duplicates attunement's |
| items-journal-29 | Documentation / skills | medium | S | adjustments.yml leaves several Item Piles patches unregistered |

## Performance gains

### items-journal-19 — Every ledger entry rewrites and broadcasts the whole ledger, then re-uploads the whole JSON mirror

**Category:** Performance gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:121–122`

**Anchor:** `await game.settings.set(MODULE, LOG, log);`

**Current.**

Each entry embeds the item's complete source. Each append writes the whole array to a world setting (persisted and broadcast to every client) and uploads the whole pretty-printed JSON via FilePicker.upload (writeMirror 87-99). Cost is O(ledger size) per drop, paid N times for an N-item drop; the ready log (285) reports only the entry count.

**Proposed.**

Without changing stored content: (1) on top of the chain from items-journal-18, coalesce entries queued while a write is in flight into one COUNTER write and one LOG write; each caller still gets its n. (2) Debounce writeMirror ~2 s trailing; export() still writes immediately. (3) Ready log adds approximate KB size. Pruning/capping the ledger is a behaviour decision for Joe and out of scope.

**Behaviour test recipe (write first, must pass before and after).**

Same recorder harness as items-journal-18 with write-call counters. 5 entries submitted in one tick: final store deep-equals the store from 5 sequential awaited appends, ns are [1..5], write counts drop from 5+5 to <=2 each. Mirror stub called once after the debounce with the full final array; export() calls it synchronously exactly once.

**Risk.** The mirror file may lag by the debounce window (header already says trust the setting). Do items-journal-18 first.

**Related:** items-journal-18, items-journal-20

### items-journal-24 — Journal-directory filter scans every scene's notes once per sidebar row

**Category:** Performance gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:478–483`

**Anchor:** `function isNotePinnedJournal(id) {`

**Current.**

hideRowsFromDirectory (461-468) calls isSecret(li.dataset.entryId) per row; isNotePinnedJournal walks every scene's notes, so each Journal sidebar render costs O(rows x scenes x notes). The sidebar re-renders on any journal create/update/delete, including each player journal save. journal.mjs:513-515 repeats the scan.

**Proposed.**

Add pure `export function pinnedEntryIds(scenes){ const s=new Set(); for (const sc of scenes) for (const n of sc.notes) if (n.entryId) s.add(n.entryId); return s; }` to loot-core.mjs. renderJournalDirectory hook: `(app, el) => { const pinned = pinnedEntryIds(game.scenes); hideRowsFromDirectory(app, el, id => pinned.has(id)); }`. Keep isNotePinnedJournal defined via the set for other callers. The journal module keeps its own copy (no cross-module imports); see items-journal-38.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: scenes=[{notes:[{entryId:'a'},{entryId:null},{entryId:''}]},{notes:[{entryId:'b'}]},{notes:[]}] -> [...pinnedEntryIds(scenes)].sort() equals ['a','b']. For ids 'a','b','c' membership equals the old predicate `id => scenes.some(s => s.notes.some(n => n.entryId === id))`. Documented accepted difference: id '' is true under the old predicate and false under the new (directory rows never have an empty id).

**Risk.** Only the empty-id edge differs and is unreachable from real rows.

**Related:** items-journal-38

### items-journal-25 — Ready-time backfills write one actor at a time and run on every GM client

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:398–451`

**Anchor:** `async function ensureLockSounds() {`

**Current.**

ensureLockSounds and ensureEyesNeedView walk every actor and every scene on each GM ready, with one awaited actor.update per actor (404, 440). Both gate on game.user.isGM (399, 435), whereas corpses.mjs:34 uses the active-GM election (`game.users?.activeGM?.isSelf`). Two GM tabs both scan and both write; the writes are idempotent but double and race.

**Proposed.**

Gate both on `game.users?.activeGM?.isSelf` (the corpses.mjs:34 idiom). Collect actor updates and call `Actor.implementation.updateDocuments(updates)` once per function; token and note updates are already batched per scene. Keep the log lines and counts identical. Extract pure planners planLockSounds(actors,scenes,sound) and planEyesNeedView(actors,scenes) into a pure file so they can be tested.

**Behaviour test recipe (write first, must pass before and after).**

Pure planners in test/run.mjs with plain-object actors/scenes. Actors: container without lockedSound -> in actorUpdates with {_id,'flags.item-piles.data.lockedSound':'sounds/lock.wav','prototypeToken.flags.item-piles.data.lockedSound':'sounds/lock.wav'}; container with a sound -> excluded; non-container pile -> excluded; pile with prototypeToken.sight.enabled true -> in the eyes plan as {'prototypeToken.sight.enabled':false}. Scenes: token pile with sight on and a global note with an entry -> in the token/note updates. Characterise against the current loops by copying them into the test with a stub actor.update that records payloads, and assert the planner output equals the recorded payloads.

**Risk.** A non-active GM tab no longer backfills; the active GM does the same work. Batched updateDocuments fires the same updateActor hooks once per document.

### items-journal-30 — Corpse eye redraws its disc on every refreshToken; effect hooks queue timers on non-GM clients

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/corpses.mjs:227–234`

**Anchor:** `Hooks.on("refreshToken", paintEye);`

**Current.**

paintEye (188-215) runs on drawToken, refreshToken, updateToken, updateActor and item CRUD. For each of our corpse tokens it clear()s and redraws the PIXI disc (207) even when the size is unchanged. refreshToken fires per render-flag change, including during movement animation. Separately queue() (118-124) sets a 150 ms timer on every client for the three ActiveEffect hooks and updateActor, while sync() (101) returns immediately when !isGMRunner().

**Proposed.**

(1) Cache the drawn size on the container (`eye._pdSize`) and only clear/redraw the disc when p.size changes; still set position, sprite size, zIndex and visible each call. (2) In queue(), `if (!isGMRunner()) return;` (sync exits on the same condition). Do not narrow the refreshToken hook by flags; that would need live characterisation of Foundry v14 flags.

**Behaviour test recipe (write first, must pass before and after).**

Pure `needsRedraw(prev, size)` in loot-core: (undefined,40)->true, (40,40)->false, (40,80)->true. Glue test with fake PIXI (Container with children array, Graphics counting clear() and returning this, Sprite with anchor.set), token stub {document:{getSize:()=>({width:100,height:100}),flags:{'pentaryn-dropbin':{corpse:true}},isSecret:false},addChild(c){return c},effects:{zIndex:3}}, game.itempiles.API stubbed as a non-empty pile, canvas stub. Call paintEye twice: graphics clear() count is 1 (today 2) and position/sprite size/zIndex/visible are equal after each call. queue(): with isGMRunner false assert no setTimeout is scheduled and sync is never called.

**Risk.** The cache key is the placement size, which already derives from the grid-dependent getSize(). Gating queue on the active GM matters only if the active GM changes within 150 ms.

## Maintainability gains

### items-journal-20 — The ledger has no tests: extract ledger-core.mjs

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:138–157`

**Anchor:** `function baseEntry(reason, actor, itemObj, quantity) {`

**Current.**

test/run.mjs covers loot-core and the i18n shim only. Untested: entry shape (baseEntry 138-157), the dedupe key built twice inline (109, 111), the quantity fallback (150), restore target resolution (221-223), list/get/search (208-213) and drop-delta normalisation (169).

**Proposed.**

Create ledger-core.mjs (pure): dedupeKey(e) = `${e.reason}|${e.itemName}|${e.fromActorId}|${e.quantity}`; appendEntry(log,counter,entry,dedupeMs); makeEntry(reason,{actor,item,quantity,user,scene,now}) (baseEntry with game.user, canvas.scene, Date injected; iso derived from the same `now`); normaliseDeltas(itemDeltas); listLast(log,n)=slice(-n).reverse(); findEntry(log,n)=find(e=>e.n===Number(n))??null; searchLog(log,text). dropbin.mjs calls them. Add imports to test/run.mjs.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: makeEntry('drop',{actor:{id:'a',name:'Ann',uuid:'Actor.a'},item:{name:'Sword',type:'weapon',system:{quantity:2}},quantity:undefined,user:{id:'u',name:'U'},scene:{id:'s',name:'S'},now:1000}) deep-equals (JSON.stringify, key order pinned) {t:1000,iso:'1970-01-01T00:00:01.000Z',reason:'drop',userId:'u',userName:'U',fromActorId:'a',fromActorName:'Ann',fromActorUuid:'Actor.a',itemName:'Sword',itemType:'weapon',quantity:2,sceneId:'s',sceneName:'S',x:null,y:null,pileUuid:null,item:<the item>}. item null -> itemName '(unnamed)', quantity 1. normaliseDeltas(undefined)->[]; ({item:1})->[{item:1}]; ([a,b])->[a,b]. listLast([{n:1},{n:2},{n:3}],2)->[{n:3},{n:2}]. findEntry(log,'2')->{n:2}. searchLog(log,undefined) matches itemName containing 'undefined' (pinned quirk of String(text)).

**Risk.** Key order and the `quantity ?? item.system.quantity ?? 1` chain are pinned by the deep-equal. The old code computed t and iso from two separate Date calls (sub-ms apart); using one `now` is the only difference.

**Related:** items-journal-18, items-journal-19, items-journal-22

### items-journal-26 — Hardcoded English strings despite a lang file; module id declared in three places

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:217`

**Anchor:** `if (!game.user.isGM) return ui.notifications.warn("Only the GM can restore from the drop bin.");`

**Current.**

lang/en.json holds only PENTARYN_DROPBIN.lootAll. Literals: dropbin.mjs 217, 219, 224, 229, 236, 243-244, 386, 389 and corpses.mjs:299-300. The module id is defined at dropbin.mjs:63, loot-core.mjs:6 (exported) and as a literal in the i18n-shim.mjs:82 log line.

**Proposed.**

Import MODULE from ./loot-core.mjs in dropbin.mjs. Add lang keys with the exact current English (restore.gmOnly/.noEntry/.noActor/.restored, export.ok/.failed, clear.title/.body, lock.toast/.float, corpse.revive/.sheet) and replace literals with game.i18n.localize/format. The i18n gate in make foundry-dropbin-check verifies keys.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: read lang/en.json with fs; a minimal format(key,data) doing {x} substitution. Assert for each moved string that format(...) equals the literal copied from today's code (e.g. 'Restored Sword to Ann (drop bin #3).').

**Risk.** A key typo prints the raw key; the i18n gate catches it. HTML in the clear-dialog body must be kept as authored.

### items-journal-27 — Dead guard: the 'restoring' option is set on a create but checked on delete

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:193`

**Anchor:** `if (options?.[MODULE]?.restoring) return;                          // don't log our own undo`

**Current.**

restore() passes { [MODULE]: { restoring: true } } to createEmbeddedDocuments (228); preDeleteItem checks it (193). A create never reaches preDeleteItem and nothing deletes with that option. Grep of module/ and context/ finds no other reader of `restoring` for this module.

**Proposed.**

Delete line 193 and the option at 228, or keep the option and rewrite the comment to 'tags our own restore for other modules (no current consumer)'. Prefer deletion.

**Behaviour test recipe (write first, must pass before and after).**

With a pure `shouldCaptureDelete({userId, selfId, actorDocName, actorType, classType, isPile})` in ledger-core, pin each early return (other user, non-Actor parent, non-character, pile -> false; else true). Add a source-grep test that 'restoring' appears only in dropbin.mjs, so removing it is provably unobservable.

**Risk.** A script deleting items with that option (none found in repo) would start being logged.

## Defragmentation

### items-journal-22 — dropbin.mjs carries five unrelated concerns; split it without changing load behaviour

**Category:** Defragmentation · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:41–56`

**Anchor:** `* This module also carries three **Item Piles patches**, kept here because it is`

**Current.**

One 528-line entry holds the ledger (74-291), the Item Piles attunement NaN repair (293-347), lock enforcement and sounds (349-418, 490-520), the in-view backfill (420-451) and directory filtering (453-488, 522-524). Three separate ready hooks (288, 343, 490). The header admits the patches live here because the module 'is already enabled'.

**Proposed.**

Keep dropbin.mjs as the only esmodule entry (module.json unchanged, no restart). Move code verbatim into ledger.mjs, itempiles-attunement.mjs (ATTUNEMENT_PACKS..repairAttunement and its ready hook), itempiles-locks.mjs (lockedContainerData, announceLocked, ensureLockSounds, the three item-piles-pre* hooks), visibility.mjs (ensureEyesNeedView, hideRowsFromDirectory, isPileActor, isNotePinnedJournal, directory hooks, repaint). ORDER MATTERS: today corpses.mjs and loot.mjs evaluate first (static imports), then i18n-shim, then dropbin's own body. dropbin.mjs must import in the order corpses, loot, i18n-shim (calling installI18nShim() next), then ledger, itempiles-attunement, itempiles-locks, visibility. Each file header names its adjustments.yml row.

**Behaviour test recipe (write first, must pass before and after).**

Add test/order.mjs: stub globalThis.Hooks {on(n){calls.push(['on',n])},once(n){calls.push(['once',n])}} plus minimal game/CONST/foundry/PIXI/socketlib stubs, import ../dropbin.mjs, and write the ordered (method, hookName) list to test/snapshots/hook-order.txt BEFORE the split (record the actual count then; the earlier '34' was not verified). After the split the list must be identical, which also pins that renderActorDirectory/renderJournalDirectory register at load and that the three ready hooks keep their relative order. Also run make foundry-dropbin-check (imports gate) and the existing fixtures.

**Risk.** Hook registration order across modules; the snapshot catches reordering of the ready hooks and the attunement-repair preCreateItem (registered inside the async ready, after attunement's load-time registration).

**Related:** items-journal-20, items-journal-29

## Logging / auditability gains

### items-journal-21 — Player-side ledger submits reject unhandled when no GM is online; corpse revive toggle is unawaited

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:131–134`

**Anchor:** `if (socket) return socket.executeAsGM("record", entry);`

**Current.**

submit() returns socket.executeAsGM(...), which rejects with no GM connected. Both callers (drop loop 177, preDeleteItem 194) ignore the promise, so the entry is lost and the only trace is an anonymous 'Uncaught (in promise)'. corpses.mjs:134 calls `t.actor.toggleStatusEffect("dead", { active: false })` inside the updateActor hook with no await or catch. There is no debug switch to trace why capture returned early.

**Proposed.**

Wrap in submit: `return Promise.resolve(socket.executeAsGM('record', entry)).catch(err => { console.warn(`${MODULE} | ledger entry not recorded (no GM?)`, {reason: entry.reason, item: entry.itemName, actor: entry.fromActorName}, err); return null; });`. At corpses.mjs:134 append `.catch(err => console.warn(`${MODULE} | revive: could not clear Dead on ${t.name}`, err))` (keep the call un-awaited). Optional client setting `debug` with console.debug on each early return.

**Behaviour test recipe (write first, must pass before and after).**

With submit built by a factory `makeSubmit({isGM, socket, recordAsGM, warn})` (kept in dropbin.mjs or ledger-core): isGM:false, executeAsGM rejecting -> resolves null and warn called once with first arg starting 'pentaryn-dropbin | ledger entry not recorded'; executeAsGM resolving 7 -> resolves 7; isGM:true -> recordAsGM spy called once with the same entry object; no socket and not GM -> returns null with the existing 'entry dropped' warning.

**Risk.** Callers ignore the value, so null instead of a rejection only removes the uncaught-rejection noise.

**Related:** items-journal-18

## Hardening

### items-journal-18 — Concurrent ledger writes reuse numbers (read-modify-write across awaits)

**Category:** Hardening · **Impact:** high · **Effort:** M

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:105–126`

**Anchor:** `async function recordAsGM(entry) {`

**Current.**

recordAsGM reads log and counter synchronously (107, 116), pushes into the array, then awaits settings.set(COUNTER) (120), settings.set(LOG) (121) and writeMirror. The drop hook calls submit(e) un-awaited in a loop (177), and several players' socketlib calls can arrive together. A second call that starts while the first is suspended reads the same counter, so numbers repeat; whether entries are also lost depends on whether game.settings.get returns a shared array reference (not verified), because LOG is overwritten with whichever array that call holds. Ledger is meant to be append-only.

**Proposed.**

Serialise appends: `let chain = Promise.resolve(); function recordAsGM(entry){ const run = chain.then(() => appendNow(entry)); chain = run.catch(() => {}); return run; }`, appendNow being the current body (GM check stays first). Move the pure part into ledger-core.mjs as `appendEntry(log, counter, entry, dedupeMs)` -> {log, n, duplicate} (items-journal-20). Dedupe semantics unchanged (tail only, same key, within DEDUPE_MS).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-dropbin/test/run.mjs: factory `makeRecorder({read, write, setCounter, getCounter})` around the glue with an async store whose set resolves on setTimeout(0) and only then updates what get returns. Characterise first with today's logic copied in: `await Promise.all([rec(e1), rec(e2)])` with different itemName -> both return n=1 (known-bug fixture; record the log length for both a copy-on-get and a by-reference store). After the fix: 2 entries, n 1 and 2 in submission order. Unchanged cases: sequential awaited appends -> 1,2,3; identical entry (reason,itemName,fromActorId,quantity) with t within 2000 ms -> returns tail n and the log does not grow; at +2001 ms -> appended; a first call whose write rejects does not block a second call.

**Risk.** Only timing changes; sequential behaviour is identical (pinned). chain = run.catch(() => {}) prevents one failure from wedging later appends.

**Related:** items-journal-19, items-journal-20

### items-journal-23 — getFlag('item-piles', ...) throws when Item Piles is inactive; several pile-detection variants in one module

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:470`

**Anchor:** `const isPileActor = id => !!game.actors.get(id)?.getFlag("item-piles", "data")?.enabled;`

**Current.**

module.json requires socketlib, not item-piles. Document#getFlag throws for a scope that is not an active package (importer documents this at pentaryn-importer.mjs:87-96; journal.mjs:47-48 and :172 avoid it). dropbin calls getFlag('item-piles', ...) at 376, 402, 411 (ensureLockSounds, GM ready chain) and 470 (every player's actor-directory render). With Item Piles disabled the directory hook errors on each render and the GM ready chain throws before ensureEyesNeedView. Line 436 already uses a raw flags path; API-based checks are at 192, corpses.mjs:58/180 and loot.mjs.

**Proposed.**

Add to loot-core.mjs `export const pileFlags = doc => doc?.flags?.['item-piles']?.data ?? null; export const isPileFlagged = doc => !!pileFlags(doc)?.enabled;` and use them at 376, 402, 411, 436 and 470. Leave the API-based checks (isValidItemPile, getActorFlagData): they apply Item Piles' own defaults. Add a comment saying why both exist.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: pileFlags({flags:{'item-piles':{data:{enabled:true,type:'container'}}}}) -> {enabled:true,type:'container'}; pileFlags({}) -> null; pileFlags(null) -> null; isPileFlagged({flags:{'item-piles':{data:{enabled:false}}}}) -> false. Equivalence: stub doc whose getFlag(scope,key) returns this.flags[scope]?.[key]; assert pileFlags(doc) === doc.getFlag('item-piles','data') for 4 shapes (enabled, disabled, no data, no scope).

**Risk.** Token versus actor semantics are unchanged (both read the document's own flags). Only difference: no throw when the scope is inactive.

## LLM interface

### items-journal-28 — Dropbin API: list() returns full item sources, restore() returns Notification objects, resolver duplicates attunement's

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-dropbin/dropbin.mjs:208–252`

**Anchor:** `list: (n = 20) => readLog().slice(-n).reverse(),`

**Current.**

list/all/get/search return entries carrying the complete item source (descriptions, activities), tens of KB per 20 entries. restore() returns ui.notifications.warn/error (Notification objects) on refusal and an Item on success, so refusal reasons need string matching. export()/clear() return false for not-GM. The actor resolver (221-223) copies attunement.mjs:749-751. clear() (247) resets LOG but not COUNTER, undocumented.

**Proposed.**

Additive. (1) list(n=20,{brief=false}); brief maps to {n,iso,reason,itemName,itemType,quantity,fromActorName,sceneName,pileUuid}; default output unchanged. (2) New restoreResult(n,target) returning {ok:true,item} or {ok:false,reason:'not-gm'|'no-entry'|'no-actor'} with no toasts; restore() stays a wrapper that toasts and returns exactly today's values. (3) describe() listing methods with gmOnly flags. (4) README line: clear() keeps the counter, numbers are never reused.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs with ledger-core: briefOf(makeEntry fixture) deep-equals the 9-key object (order pinned); listLast output unchanged for brief:false. restoreResult with stub game.user.isGM=false -> {ok:false,reason:'not-gm'}; missing entry -> 'no-entry'; entry but no actor -> 'no-actor'. restore() wrapper with stubbed ui.notifications: each refusal returns exactly the object the stub's warn/error returned.

**Risk.** restore() return values must not change; the wrapper returns the notification call's result and the test asserts identity.

**Related:** items-journal-16, items-journal-20

## Documentation / skills

### items-journal-29 — adjustments.yml leaves several Item Piles patches unregistered

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/adjustments.yml:123–132`

**Anchor:** `- id: itempiles-attunement-repair`

**Current.**

Row itempiles-attunement-repair (modules [pentaryn-attunement], marker isValidItemPile) correctly describes attunement's bond restore, but the separate Item Piles NaN-attunement repair in pentaryn-dropbin/dropbin.mjs:293-347 ('Delete this block when item-piles ships a fix') has no row (grep of adjustments.yml for NaN/ATTUNEMENT_PACKS finds nothing); the only dropbin row is itempiles-corpses (marker 'itempiles') plus itempiles-rarity-i18n. Also unregistered: lock enforcement via item-piles-preRenderInterface/preRenderActorSheet/preRattleItemPile (dropbin.mjs:491-520), directory hiding (487-488), loot.mjs's reach into Item Piles' Svelte internals (`$$?.ctx`) and journal.mjs:172-195's reliance on Item Piles' unsaved preview copies. The updater cannot flag them for retirement. The preCreateItem ordering (attunement at load vs dropbin's inside async ready) is an undocumented cross-module dependency.

**Proposed.**

Keep the existing row. Add rows: itempiles-nan-attunement (modules [pentaryn-dropbin], markers ['ATTUNEMENT_PACKS','repairAttunement'], native_when 'Item Piles addItems preserves system.attunement', retire_class guarded); itempiles-container-locks (markers ['item-piles-preRenderInterface','item-piles-preRenderActorSheet']); itempiles-directory-hiding (marker 'renderActorDirectory'); itempiles-svelte-store for loot.mjs (retire_class never, manual check 'open a pile, Change recipient, Loot all goes to the new recipient'); itempiles-preview-copy for journal.mjs (marker 'renderReadOnlyItemPreview'). Add an 'Item Piles touch points' section to the dropbin README including the hook-order note.

**Behaviour test recipe (write first, must pass before and after).**

Python, in scripts/tests/test_module_checks.py or a new test: load foundry/adjustments.yml and assert every `markers` entry appears (plain substring grep) in at least one of the row's `files`, and every file exists. Run against the live tree (the snapshot omits parts of the layout). JS order check lives in items-journal-22's order.mjs.

**Risk.** Metadata and docs only. Check the schema fields (retire_class values, check) against existing rows and run the updater tests in the live tree.

**Related:** items-journal-10, items-journal-22

## Categories checked with no finding

- **Extendability:** checked. `dropbin.mjs` is the single esmodule and imports `corpses`, `loot` and `i18n-shim`; the split and its documented load order are items-journal-22 (Defragmentation). Nothing separate.
