---
title: "Code audit 2026-10 — pentaryn-journal"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-journal

**Read this when:** you are about to refactor, harden or document pentaryn-journal and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-journal

**Purpose.**

Adds an 'Add to my journal' footer bar to eye readables (journal entries opened from scene pins, image popouts, and items in eye piles). It copies sanitized content into the player's own flag-identified personal journal, with hash-based 'Update my copy'. The GM creates journals on ready and createUser, and players fall back to a native v14 user query.

**Health.**

The best-shaped module in scope. journal-core.mjs is pure, documented and covered by 81 fixtures, including the privacy-critical sanitize(). Gaps: the privacy rule for the provenance place name (never scene.name) and the bar-visibility rules sit in untested glue (journal.mjs:166–202, 267–282). There are two HTML escapers with different outputs. refreshBars runs on every world updateItem and re-sanitizes every open readable. It has a bare catch {}. 'warn' is actually a toast. The README describes report() as GM-only, but the code does not gate it. There is no routing row in context/foundry/README.md.

**LLM interface.**

game.pentaryn.journal.{personal, add, status, open, shouldShowBar, ensure, ensureAll, report, core}. report() is the one good read for an LLM. add() and status() run as the calling user, and when the GM calls them (as eval-js does) they return null unless the hidden 'gmButton' setting is on. So an LLM cannot answer 'has player X saved readable Y?' without reading flags by hand. The eval log shows 22 raw pentaryn-journal flag reads. Null results are ambiguous: add() returns null for no target, no journal, nothing to copy, or too large. Target state: entriesOf(userRef), a read-only list of {pageId, name, key, savedAt, updatedAt, hash}; statusFor(doc, userRef); a reason channel for null results; and describe().

**How to extend.**

New pure rules go in journal-core.mjs with fixtures in test/run.mjs, and the README says the fixtures must be synthetic. New window types go in targetFor/targetOf (journal.mjs:234, 470). Those two functions duplicate each other's dispatch and should share one classifier, so a new target kind is added once. Unclear: the folderName setting is config:false and documented nowhere.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| items-journal-33 | Performance gains | medium | S | Every world item update re-sanitizes and re-hashes every open readable |
| items-journal-38 | Performance gains | low | S | isEyeReadable scans every scene's notes on every journal-sheet render |
| items-journal-34 | Maintainability gains | medium | S | Privacy and visibility rules live in untested glue: move them into journal-core with fixtures |
| items-journal-32 | Defragmentation | low | S | Two HTML escapers inside one module; use core.escapeHTML for the bar only |
| items-journal-40 | Hardening | low | S | `ensure` relay runs in every GM tab: claim first so one tab creates the player's journal |
| items-journal-36 | Logging / auditability gains | low | S | Bare catch in activateNote; 'warn' is a toast; save refusals leave no console trace |
| items-journal-35 | LLM interface | medium | S | An LLM (running as GM) gets null from add() and status(); no per-user read; four indistinguishable null reasons |
| items-journal-37 | Documentation / skills | low | S | Journal has no routing row; README says report() is GM-only but code has no gate; folderName and system relationship undocumented |

## Performance gains

### items-journal-33 — Every world item update re-sanitizes and re-hashes every open readable

**Category:** Performance gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-journal/journal.mjs:593`

**Anchor:** `Hooks.on("updateItem", () => refreshBars());`

**Current.**

refreshBars (debounced 100 ms, 463) runs on every updateItem and every JournalEntryPage create/update/delete (587-589). refreshBarsNow visits all rendered apps; fillBar -> savedStatus (374-380) -> descriptorsFor runs core.sanitize over every observable page, then hashes, and calls personal() (filter+sort of game.journal) in savedStatus and again in onBarClick. Entry-readable bars do not depend on items at all.

**Proposed.**

(1) Memoise sanitize per page in journal.mjs: bounded Map (64, oldest evicted) keyed `${page.uuid}|${page._stats?.modifiedTime}|${embeddedLabel}`, consulted in pageDescriptor. (2) Gate the updateItem hook: only call refreshBars when a rendered app currently has a target of kind 'item' (extract pure `needsItemRefresh(kinds)`). (3) Compute personal() once per fillBar and pass its pages into savedStatus.

**Behaviour test recipe (write first, must pass before and after).**

Add pure `makeMemo(fn,max)` to journal-core.mjs and test in test/run.mjs: for each of the existing sanitize fixtures memo(key,html,opts) deep-equals sanitize(html,opts); a second call with the same key does not call fn (counter); a changed key recomputes; size never exceeds max. needsItemRefresh(['entry','image']) -> false, (['entry','item']) -> true, ([]) -> false. Characterise the gate premise: itemDescriptor/entry descriptors read no item data for entry targets (assert descriptorsFor source by inspection in the PR).

**Risk.** Cache correctness assumes any page content change bumps _stats.modifiedTime (true for document updates); label is in the key for language switches. Observability is filtered before descriptors are built and is not cached.

### items-journal-38 — isEyeReadable scans every scene's notes on every journal-sheet render

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-journal/journal.mjs:514–523`

**Anchor:** `return game.scenes.some(s => s.notes.some(n => n.entryId === entry.id));`

**Current.**

applySinglePage (516-523) runs on every renderJournalEntrySheet; isEyeReadable walks all scenes x notes. It sits after `!isPersonal(entry)` in the && chain so personal journals short-circuit, but readables pay the full scan, and so does the setting's onChange loop (540). Dropbin repeats the scan (items-journal-24).

**Proposed.**

Add pure `pinnedEntryIds(scenes)` to journal-core.mjs (a deliberate copy of dropbin's; cross-reference in comments). Cache: `let pinned = null; const pinnedIds = () => (pinned ??= core.pinnedEntryIds(game.scenes));` invalidated (`pinned = null`) on createNote, updateNote, deleteNote, createScene, deleteScene. isEyeReadable becomes pinnedIds().has(entry.id).

**Behaviour test recipe (write first, must pass before and after).**

journal test/run.mjs: same pinnedEntryIds fixtures as items-journal-24. Cache fixture through a factory `makePinnedCache(getScenes)` with invalidate(): after invalidate() a newly added note is seen; without it the old set is returned. Equivalence: for 50 seeded random scene/note layouts, pinnedEntryIds(scenes).has(id) === scenes.some(s => s.notes.some(n => n.entryId === id)) for every non-empty id.

**Risk.** A missed invalidation hook leaves a stale single-page decision until reload; the five hooks cover every way a Note's entryId or presence changes (test updateNote invalidation explicitly).

**Related:** items-journal-24

## Maintainability gains

### items-journal-34 — Privacy and visibility rules live in untested glue: move them into journal-core with fixtures

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-journal/journal.mjs:280`

**Anchor:** `const place = scene?.navName?.trim() || entry.folder?.name || null;`

**Current.**

'Provenance never uses scene.name' is enforced only by line 280 glue. Bar visibility (shouldShowBar 166-170, shouldShowItemBar 197-202) and the single-page condition (520-521) are glue; targetFor (234-249) and targetOf (470-482) duplicate the document-to-target dispatch.

**Proposed.**

Add to journal-core.mjs: placeFrom({navName,folderName}) = navName?.trim() || folderName || null (no scene-name parameter); barVisible({isJournalEntry,isPersonal,inPack,isGM,gmButton,observer,owner}); itemBarVisible({hasSource,canInspectItems (boolean, i.e. pile flag !== false),isGM,gmButton,observer,owner}); singlePage({isGM,setting,isPersonal,isEyeReadable,visiblePages}); optionally targetKind(doc). Glue gathers booleans (testUserPermission calls kept verbatim) and calls them.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: placeFrom({navName:' Old Gate ',folderName:'F'}) -> 'Old Gate'; ({navName:'   ',folderName:'F'}) -> 'F'; ({}) -> null. barVisible: GM+gmButton false -> false; GM+gmButton true -> true; player observer&&!owner -> true; player owner -> false; personal -> false; inPack -> false; not JournalEntry -> false. itemBarVisible: canInspectItems false -> false even for GM. singlePage({isGM:false,setting:true,isPersonal:false,isEyeReadable:true,visiblePages:1}) -> true; visiblePages 2 -> false; isGM true -> false. Before moving, paste each glue expression into the test and assert the core function agrees on all 2^n boolean combinations (n<=7).

**Risk.** The exhaustive truth-table comparison guarantees equivalence; the only risk is gathering a boolean differently in the glue, so keep the permission calls verbatim.

## Defragmentation

### items-journal-32 — Two HTML escapers inside one module; use core.escapeHTML for the bar only

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-journal/journal.mjs:40`

**Anchor:** `const esc = s => foundry.utils.escapeHTML(String(s ?? ""));`

**Current.**

journal.mjs:40 escapes with foundry.utils.escapeHTML; journal-core.mjs:42 exports its own escapeHTML (test: apostrophe -> &#39;). esc is used in fillBar (388-402) AND at line 224 inside itemDescriptor's body (`<img ... src="${esc(it.img)}">`), and that body is hashed to decide 'changed' status.

**Proposed.**

Add `const barEsc = core.escapeHTML;` and use it ONLY for the bar strings in fillBar (388-402). Leave the line-224 call on the existing `esc`, because swapping it would change the hashed body (and so saved/changed status) for an item image path containing an apostrophe. Keep both helpers with a comment saying why.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: pin core.escapeHTML(`<a href="x">'&"</a>`) === '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&quot;&lt;/a&gt;'. Load lang/en.json with fs and for every string rendered in fillBar (add, adding, saved, open, update, hint.add, hint.changed, hint.saved with {when}) decode core.escapeHTML(s) with a 5-entity decoder and assert it equals s.

**Risk.** Rendered text is identical; only the entity spelling in the bar's innerHTML changes. Nothing in repo string-matches '&#x27;'.

## Hardening

### items-journal-40 — `ensure` relay runs in every GM tab: claim first so one tab creates the player's journal

*Added 2026-10-11 from the wave-1 report's J8 (blueprint §5.9.5). Joe's decision: a new audit id, fixed (claim first) when journal migrates, as a `[declared]` commit after its structural refactor. Not changed now. Sibling: combat-riders-41 (riders' Battle Medic relay).*

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-journal/journal.mjs:547–551` (the handler) and `ensureFor`, `journal.mjs:90–101`; the caller is `ensurePersonalJournal`, `journal.mjs:146`

**Anchor:** `  CONFIG.queries[QUERY] = async (_data, { user } = {}) => {`

**Current.**

The server sends a query to every socket of the recipient user (blueprint §5.9.1, Queries). The handler's gate, `game.user.isGM && game.users.activeGM?.isSelf`, is true in every tab of the active GM's account. `ensureFor` de-duplicates with `gmInflight`, but that map is per tab, and its look-before-create (`personal(user) ?? createPersonal(…)`) runs in both tabs before either tab's create has been broadcast. With the bridge tab and a GM browser tab open, a player without journal-create permission who opens their journal for the first time can get **two** personal journals. `report()` already lists the extra one under `duplicates`. Unverified live.

**Proposed.**

When journal migrates (its relay moves to the kit's `relayed` query through the API manifest, C56):
1. The handler claims the sender's user id first (`lib/election.mjs`). Only the winning tab runs `ensureFor`.
2. Per §5.9.2 the losing tab answers first, so it waits (bounded, under the 8 s query timeout) until `personal(user)` exists and answers `{ entryId }` from it.
3. Alternative noted by §5.9.2, if the claim proves awkward: create with a deterministic `_id` derived from the user id (`keepId: true`), and treat the second tab's duplicate-id refusal as success.

For one tab the reply shape (`{ entryId }`), the folder and the ownership are unchanged. This is a behaviour change with two tabs (one journal instead of two), so it lands as a `[declared]` commit.

**Behaviour test recipe (write first, must pass before and after).**

In the journal glue harness, register the handler in two fake GM "tabs" that share one fake `game.journal`, and delay the create broadcast. Fire one `ensure` from a player into both:
- Before the fix (pinned as `KNOWN items-journal-40`): two personal journals for that user.
- After the fix (the pin flips): one journal, and both handlers resolve to the same `entryId`.

The ready-time `ensureAll` and the `createUser` path are unchanged. They run on the active GM, and the same two-tab question for them is out of scope here.

**Risk.** Low: a lost claim with no winner (the winning tab closes mid-create) leaves the player with the existing "failed" toast and a retry on the next open.

**Related:** combat-riders-41, items-journal-37

## Logging / auditability gains

### items-journal-36 — Bare catch in activateNote; 'warn' is a toast; save refusals leave no console trace

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-journal/journal.mjs:571`

**Anchor:** `} catch {}`

**Current.**

The activateNote hook (566-572) swallows any error with `catch {}`. `const warn = msg => ui.notifications.warn(msg)` (41) is a player toast but shares its name with the console-warning idiom used elsewhere; it has 4 call sites (144, 149, 309, 425). save() returns null on 'no journal' (303), 'nothing visible' (305) and tooLarge (309) with at most a toast, so 'the button did nothing' has no console breadcrumb.

**Proposed.**

Rename `warn` to `toast` at its 4 call sites plus the definition. Replace `catch {}` with `catch (err) { console.debug(`${MOD} | activateNote: provenance not recorded`, err); }`. In save(), before each early `return null`, console.info(`${MOD} | add skipped: ${reason}`, {target: target.kind, journal: journal?.id}) with reasons 'no-journal','nothing-visible','too-large' (shared with items-journal-35's lastReason).

**Behaviour test recipe (write first, must pass before and after).**

Extract pure `skipReason({journal, sources, plan})` into journal-core and test: ({journal:null}) -> 'no-journal'; ({journal:{},sources:[]}) -> 'nothing-visible'; ({journal:{},sources:[1],plan:{tooLarge:true}}) -> 'too-large'; ({journal:{},sources:[1],plan:{tooLarge:false}}) -> null. A source-grep test asserts `ui.notifications.warn` appears only inside `toast`.

**Risk.** Toasts are unchanged; the new console output is info/debug level.

**Related:** items-journal-35

## LLM interface

### items-journal-35 — An LLM (running as GM) gets null from add() and status(); no per-user read; four indistinguishable null reasons

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-journal/journal.mjs:484–496`

**Anchor:** `async function apiAdd(doc) {`

**Current.**

eval-js runs as the GM; shouldShowBar returns false for a GM unless gmButton is on (168), so game.pentaryn.journal.add/status return null. save() (301-320) returns null for four different reasons (no journal, no observable pages, too large; targetOf null) with no signal. personal(user) needs a User and reading a player's pages means hand-written flag access. report() is the only LLM-friendly read.

**Proposed.**

Additive, read-only. (1) `entriesOf(userRef)` (User, id or name) mapping personal(user)?.pages to [{pageId,name,key,place,savedAt,updatedAt,hash}] via a pure core `entryRows(pages)`; [] if no journal. (2) `statusFor(doc,userRef)`: evaluate descriptors for that user (parameterise descriptorsFor with a user instead of game.user) and return core.status(that user's pages, descriptors), bypassing shouldShowBar. (3) Module-level `lastReason` ('no-target'|'no-journal'|'nothing-visible'|'too-large') set by add/status and exposed as journal.lastReason; return values unchanged. (4) describe().

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs core-level: entryRows(asSaved) where asSaved is the pages built at test/run.mjs:161 from planSave -> rows with keys in the pinned order [pageId,name,key,place,savedAt,updatedAt,hash]; statusFor's core path must equal core.status(asSaved,[srcA,srcB]) === 'saved' using the existing fixtures. Pin that apiAdd/apiStatus still return null for a GM with gmButton false, using the extracted barVisible from items-journal-34 and a stub game.settings.get -> false.

**Risk.** New methods are read-only; lastReason is module state that does not alter control flow.

## Documentation / skills

### items-journal-37 — Journal has no routing row; README says report() is GM-only but code has no gate; folderName and system relationship undocumented

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-journal/README.md:32–46`

**Anchor:** `` - **Console (`game.pentaryn.journal`):** ``

**Current.**

(a) context/foundry/README.md route table (lines 49-72) has no pentaryn-journal row; unlinked READMEs also include aoe, combat, importer, lookup, names, pings, prompts and transform (some routed via other docs). (b) README lists report() under 'For the GM only' but journal.mjs:119 has no gate (ensureFor/ensureAll do). (c) World setting `folderName` (journal.mjs:542, config:false) is undocumented. (d) module.json declares no relationships.systems yet journal.mjs hooks renderItemSheet5e and reads system.identified/unidentified. (e) No return shapes for add() ({journal,pageIds,created,updated} or null) or report() ({folder,users:[{user,userId,isGM,journalId,pages,duplicates}],atRoot}).

**Proposed.**

Add a route row '| Player journals, the Add to my journal bar, a missing or duplicate personal journal | ../../foundry/module/pentaryn-journal/README.md |'. Correct the README: report() is ungated and returns ids only (a code gate would change behaviour, leave to Joe). Document folderName and the return shapes. Add relationships.systems [{id:'dnd5e',type:'system',compatibility:{minimum:'6.0',verified:'6.0.6'}}] to module.json (needs a restart; copy the dropbin block).

**Behaviour test recipe (write first, must pass before and after).**

Docs and metadata. Add a scripts/tests check that each foundry/module/*/README.md is linked from context/foundry/README.md, with an explicit allowlist of the modules currently routed via other docs (aoe.md, melee.md, etc.) so it passes today and fails for new unrouted modules. module.json change is covered by the existing parse gate.

**Risk.** Adding a systems relationship makes Foundry warn if dnd5e is absent, which is the only setup where the module half-works anyway.

## Categories checked with no finding

- **Hardening:** checked (first pass; items-journal-40 was added on 2026-10-11 for the two-GM-tab case):
  - The relay (`journal.mjs:547–551`) answers only as the active GM, ignores the payload, and acts only for the sender (`user`).
  - The ready backfill and the `createUser` hook run on the active GM only, each with a `.catch` (554–563).
  - Player-side requests time out at 8 s with a toast (145–152).
  - Privacy filters use `testUserPermission`.

  Nothing found; the `report()` gate is a deferred decision (items-journal-37).
- **Extendability:** checked. Rules belong in `journal-core.mjs` (items-journal-34), and the README additions are items-journal-37. Nothing separate.
- **Stylesheet:** `journal.css` (34 lines): the bar is scoped under `.application.pentaryn-journal-readable > .pj-bar`. `.pj-new`, `.pj-provenance`, `.pj-revealed` and `.pj-item-img` are top-level, prefixed but unscoped, because they mark content inside journal pages. Nothing found.
