# Defect wave 2 2026-10-12: the shared kit (1.2.0)

**Read this when** you want the history of defect wave 2 (2026-10-12) for the shared module kit
(`foundry/lib/`, vendored into every `pentaryn-*` module as `lib/**`): what was fixed, why, and how
to check it live. This is history, not instructions. To use the kit, read `foundry/lib/README.md`
and `context/foundry/addon-blueprint.md`.

Source: the kit items in [final-review-2026-10-12/](../final-review-2026-10-12/) ("For Joe" lists
plus the untriaged findings). Joe approved wave 2 on 2026-10-12 ("Let's create a dynamic workflow
to solve all of these things"). None of these items got a specific ruling from Joe, so each one
follows the review's recommendation. Every change is a **[declared]** behaviour change. Branch
`fix2/kit-2026-10-12`. The kit is now **1.2.0**, and `vendor.py sync --all` re-vendored it into
all 20 modules. Kit conformance (vendored copy identical to `foundry/lib`) passes for every module.

Gate at the end of the branch: `make foundry-modules-check` (all 20 modules pass) and
`make foundry-lib-check` (0 failures). No item was reverted.

## Items

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| kit-1.2.0 | Modules carried kit 1.1.x | recommendation | Every module carries the shared kit at 1.2.0. Nothing changes at the table. | 8396af73 | lib/test/kit-json.test.mjs; per-module kit identity check |
| KIT-R1 | Unwrapping while a foreign wrapper sat on top lost our patch record | recommendation | If a module is switched off while another add-on has wrapped the same function on top of ours, our patch stays tracked, and it is not applied a second time when the module comes back. | 41185c0b | lib/test/patch.test.mjs |
| KIT-R2 | `inspect(ref, null)` threw an uncoded TypeError | recommendation | If inspect is given null or a non-object as its options, it inspects the token or actor normally. | 39f520fc | lib/test/publish.test.mjs |
| KIT-R3 | A failed claim write failed silently with no code | recommendation | If a claim fails because the document was deleted, no client acts on it. Any other failed claim is a coded INTERNAL error that names the document. | 2370ad4c | lib/test/election.test.mjs |
| KIT-R4 | A partial serialStore write wiped the keys it left out | recommendation | Saving one part of a two-part stored record keeps the other part's old value. | 3a9b1ec7 | lib/test/settings.test.mjs |
| AC-6 | Multi-key store writes were not documented as non-atomic | recommendation | Docs only. They say a multi-key store saves one key at a time, and the counter key goes first so an id is never handed out twice. | e77b8676 | lib/test/settings.test.mjs |
| KIT-R5 | An unloaded compendium entry gave "expected Actor, got undefined" (BAD_ARGS) | recommendation | Says NOT_FOUND, "load it first". | 33551dce | lib/test/resolve.test.mjs |
| KIT-R6 | A HUD button that failed to render raised an anonymous unhandled rejection | recommendation | A console warning under the owning module (combat and transform pass their log). | 4f7e978b, a0ea4949 | lib/test/argon-kit.test.mjs |
| KIT-R7 | A player→GM request failed vaguely, with no code | recommendation | Coded: TIMEOUT, NOT_GM, NOT_READY, otherwise INTERNAL. | 63adb685 | lib/test/queries.test.mjs |
| kit-edge-8 | A notify before the UI was ready lost the message | recommendation | The console line is always written. The toast shows only when the UI can show it. | 1dbd023b | lib/test/log.test.mjs |
| KIT-M3 | README said the Argon tooltip CSS was loaded through @import | recommendation | Docs: combat, transform and riders list `lib/argon-tooltip.css` in their module.json styles. | d187c426 | lib/test/kit-json.test.mjs |
| KIT-M9 | README test-helper exports had drifted from the code | recommendation | README lists every export. A test fails on drift. | c4567dea | lib/test/kit-json.test.mjs |
| KIT-M4 | Api tests swapped out the global `game` | recommendation | `buildApi` takes `{ g }`, so tests inject a fake world. | 589bc9b2 | lib/test/api.test.mjs |
| KIT-M7 | isCoded / withRef / installRoot had no consumer | recommendation | Still exported. README says no module uses them yet. | cc7e1d61 | lib/test/kit-json.test.mjs |
| kit-ext-5 | describe() fields were written out by hand per field | recommendation | The fields come from one ordered kit table. Output is byte-identical. | 78d8ed3c | lib/test/api.test.mjs |
| kit-ext-6 | A typo'd ref kind ("tokn") only failed later as a lookup error | recommendation | The module refuses to load (in tests, before Foundry) when a ref names an unknown kind. | 4f7fcbda | lib/test/api.test.mjs |
| AC-1 | GM-side relay handlers didn't know which player asked | recommendation | Relay query rows pass core's ctx, so the GM side can check ownership (feedback ingest, Wild Shape art). | b063443a | lib/test/queries.test.mjs; transform wildcard-art relay test still passes |
| kit-ext-1 | describe().queries missed hand-registered queries (journal's `pentaryn-journal.ensure`) | recommendation | Lists API-row queries, then the hand-registered ones. | d13cbbda | lib/test/queries.test.mjs; journal golden |
| kit-edge-2 | The test stub deleted documents without asking preDelete hooks | recommendation | The stub fires the vetoable preDelete hook first, as Foundry does. | f0b9a8af | lib/test/test-kit.test.mjs; dropbin/test/delete-veto.test.mjs |
| KIT-M2 | The name-match order was undocumented | recommendation | Docs: an exact match first, then a unique case-insensitive match, never a partial match. | 44c535eb | lib/test/resolve.test.mjs |
| names-ext-3 | A base-actor lookup could return an unlinked token's synthetic actor | recommendation | `resolveRef base:true` always maps to the world actor. Names and Ties dropped their workarounds. | 1daac2b0 | lib/test/resolve.test.mjs |
| journal-EXT-9 | The pinned-journal rule was duplicated, and a scene with no notes broke the players' Journal sidebar | recommendation | One null-safe rule in the kit (`pins.mjs`) that journal and dropbin share. | 326f3411 | journal/test/pins-kit.test.mjs; dropbin/test/pins.test.mjs |
| kit-ext-2 | The overdue legacy-hook warning fired on every call when a module had no logger | recommendation | It fires once per emitter. | 1e7640f7 | lib/test/hooks.test.mjs, log.test.mjs |
| kit-edge-3 | The stub's activeGM was not chosen the way Foundry chooses it | recommendation | A full GM comes before an Assistant GM, then the lowest id. | bfad645c | lib/test/test-kit.test.mjs; prompts/test/markers.test.mjs |
| kit-edge-4 | A re-entrant coalesce started a duplicate run | recommendation | It joins the run already in flight. | 69f5cf60 | lib/test/perf.test.mjs |
| kit-ext-7 | The stub's fromUuidSync missed kinds and token-chain uuids | recommendation | The stub mirrors resolve.mjs KINDS. `Scene.s.Token.t.Actor.a[.Item.i]` resolves like Foundry's TokenDocument#getEmbeddedCollection. | b6c0a894, 1e471f19 | lib/test/stub-kinds.test.mjs |
| kit-ext-9 | Unknown setting-row options were dropped silently | recommendation | A one-time console warning per option (only when a log is passed). Loading never breaks. | 237c6402 | lib/test/settings.test.mjs |
| AC-4 | The GM's own local query could wait forever | recommendation | It times out after 10 s by default, like the remote path. | b2c3c637 | lib/test/queries.test.mjs |
| AC-5 | A GM tab mid-reload answered NOT_READY at once, beating the ready tab | recommendation | It waits up to 5 s for the publish, then answers. | a3117c5a | lib/test/queries.test.mjs |
| kit-perf-2 | memo keying and eviction were undocumented | recommendation | Docs: key by an id string, never a placeable. FIFO eviction past 500 entries. | 8fd55057 | lib/test/perf.test.mjs |
| kit-perf-3 | coalesce was being used for multi-hook rebuilds | recommendation | Docs: debounce a multi-hook rebuild. coalesce is only for shared reads. | f1afb7d3 | lib/test/perf.test.mjs |
| kit-perf-4 | Hot-path setting reads were not covered by guidance | recommendation | Docs: cache a setting at the call site and clear it from onChange. settingReader stays live. | 1488f3d6 | lib/test/settings.test.mjs |
| KIT-M1-followup | Query names came from two formulas | recommendation | One `queryNameOf` and `isRefRow` in api.mjs. Names are unchanged. | 6540934a | lib/test/queries.test.mjs |
| kit-ext-3-followup | Kit API members were wired in several hand-written places | recommendation | One MEMBER_DEFAULTS table. Same members, defaults and key order. | 90ca516b | lib/test/api.test.mjs |
| KIT-M6-followup | kit.json's queries row named a dep it doesn't import | recommendation | The row is dropped. Vendored bytes are unchanged. | 813b0218 | lib/test/kit-json.test.mjs |
| KIT-M10-followup | publishedOf's comment named the wrong record fields | recommendation | The comment says `{ when, at, module, alias }`. | d708c7ea | lib/test/publish.test.mjs |
| EXT-8 | Element-or-jQuery unwrapping was written locally in portals | recommendation | The kit `htmlRoot` does it. Portals' cards use it. | 5f5099e7 | lib/test/api.test.mjs; portals/test/glue.test.mjs, smoke.test.mjs |

## Goldens changed

- `foundry/module/pentaryn-journal/test/golden/describe.json` (kit-ext-1, d13cbbda): `queries`
  now includes the hand-registered personal-journal relay query `pentaryn-journal.ensure`.
  Re-pinned with `GOLDEN_UPDATE=1`. No other golden changed. kit-ext-5 and kit-ext-3-followup were
  checked to keep output byte-identical.

## Live check after deploy

Use one GM tab after the sync and a reload (restart per blueprint §10, since the kit changed).
Use only ZZ scratch docs you create, and delete them afterwards.

- **kit-1.2.0**: for every `pentaryn-*` module, `game.modules.get(id).api.describe().kit === '1.2.0'`
  and `selftest().ok` is true. The console shows no pentaryn errors.
- **KIT-R1**: `game.pentaryn.pings.describe().patches` lists each marker once. After the module's
  debug uninstall and a hot re-install, it still lists each marker exactly once.
- **KIT-R3**: post a ZZ aoe damage card, then delete the message within the 750 ms settle
  (eval-js). Expect no uncaught error in the console and no resolve run.
- **KIT-R5**: `game.pentaryn.<ns>.inspect('Compendium.dnd5e.monsters.Actor.<id>')` on an
  unloaded entry reports code NOT_FOUND, not BAD_ARGS.
- **KIT-R6**: select a ZZ scratch actor with Argon on. The HUD opens with its buttons and the
  console shows no unhandled rejection.
- **kit-ext-1**: `game.modules.get('pentaryn-journal').api.describe().queries` includes the
  personal-journal relay query, and every name in it exists in `CONFIG.queries`.
- **names-ext-3**: on ZZ Names Test, with an unlinked ZZ Goblin and two tokens, run
  `await game.pentaryn.names.sync(tokenA.actor, "ZZ Goblin", "ZZ Gob")`. Both tokens and the
  world actor's `prototypeToken.name` read ZZ Gob, and the toast count is 3 (the prototype token
  plus the two placed tokens; `sync` returns 3). Delete the scene and
  actor afterwards.
- Every other item is code only and is covered by the tests named in the table.
