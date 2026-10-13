# Defect wave 2 (2026-10-12): ties-study

**Read this when:** you need the history of defect wave 2 for the `pentaryn-ties` study conduit
(`study.mjs`, `study/**`): what was fixed, why, which commits and tests, and how to check it live.
This is a record, not instructions for using the module.

Branch `fix2/ties-study-2026-10-12`. Source: the final review's record list
([`../final-review-2026-10-12/ties-study.md`](../final-review-2026-10-12/ties-study.md)). Joe approved
defect wave 2 on 2026-10-12. Where he gave no ruling, the recommendation was taken. Every fix is a
declared behaviour change. Gate `make foundry-ties-check`: green after `origin/main` (ties-core and
kit 1.2.0) was merged in (b736c022). 396 tests pass, known-core passes 184, look + known tab passes 9,
the vendored kit is identical, and conformance is 96.1 % with only the accepted exceptions C05 and C37.

EXT-1, ES-1, ES-2, AC-4 and ES-4 from the same review were fixed in defect wave 1
([`../defect-wave-2026-10-12/ties.md`](../defect-wave-2026-10-12/ties.md)). They are not repeated here.

## Items

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| AC-1 | A held cascade kept its `#inspect` claim while the GM's Deliver/Later dialog was open | recommendation | The claim is released first, then the GM is prompted | 1676904a | held-claim |
| AC-2 | Two GM tabs finishing different attribute facts at once reverted each other's rows | recommendation | `putBelief` confirms its attribute row after 250 ms and re-applies it on the fresh ledger if it is missing | 9b7bd450 | attr-beliefs-confirm |
| rob-1 | `deliverHeldIdentifications` threw a TypeError when the character or creature was missing | recommendation | It returns `false` | d5db22bf | deliver-held-null |
| EXT-2 | The study.* rows in `describe()` gave the wrong return shapes and understated what they write | recommendation | The rows are corrected (manifest only) | 24da80df | manifest-study-shapes, `describe.json` |
| EXT-3 | README's "one branch in resolveFact" recipe for a new study namespace was false | recommendation | The README names every downstream `fact.ns` test and points at the seam note in resolve.mjs. After the merge it also names main's five fact-key helpers | af8fe4ad, 7c82d542, b736c022 | study-namespace-doc |
| AC-3 | Grant-only cascade rungs wrote without a claim, so every GM tab wrote them | recommendation | The claim is taken before any write | f43c75ab | grant-claim |
| rob-5 | `applyInspect` accepted an inspector that is not a character sheet | recommendation | It refuses before writing, as a study roll does | dd259d9c | inspect-non-character |
| M13 + EXT-9 | Three checks disagreed on whether an identification row with no DC was a miss | recommendation | A row with no DC is never a miss. One `identDcOf`/`identRowMissed` pair is used at every site | b7882be9 | ident-dc |
| EXT-12 | The claim protocol used two session-token idioms | recommendation | Every stake uses one lazy, user-prefixed token (`<userId>:<randomID>`) | d6a7bc7e | study-claim |
| ES-5 | A second look in one combat round was refused, and only the combat being viewed was checked | track and mark, never block | The look is marked with a warning but still runs. Every started combat the character is in is checked | 06218816 | study-combat-look, session-maps |
| ES-6 | Flag deletions used `-=key`, which v14 deprecates | recommendation | They use core's `_del` value | 2304ec90 | flag-delete |
| ES-7 + M10 | Dropping the last beliefs row left `beliefs: {}` behind, and the drop code was copied | recommendation | One `dropBeliefRow` removes the whole flag when the last row goes | 28256a0d | drop-belief-row |
| AC-5 | Share and Reset inspection made one awaited write per recipient or rung | recommendation | One subject update and one batch. Reset posts one notification naming every attribute | aef145d3 | study-batch-writes |
| perf-4 | A kind Share composed the tier-25 page once per recipient | one Share = one telling | The page is composed once, and everyone gets the same words | 3d185808 | study-share-kind-once |
| M12 | `shareFact` and `runCascade` were each about 140 lines doing several jobs | recommendation | `runCascade` is split into plan, roll and record steps. `shareFact` is split into resolve, select recipients, and one writer per namespace. The goldens are byte-identical | 31ef7898 | study-split, perf-scans (ties-21 retargeted) |
| M11 | Deliver and Forget each had a copy of the kind rung-0 lie rule, and no test pinned it | recommendation | One `missedAndLie` is used, and both paths are pinned. Forcing `lie: false` now fails | 33d864ca | kind-lie |
| M5 | The tempo doc said the paranoid line lands on the tenth look, but the code used the sixth | Joe's 2026-08-23 retune: "at 6 you are looking paranoid" | The code was already right, so the stale doc was corrected. The interim branch commit 65d0af49 had moved the threshold to 10 from that stale doc. It was repaired before shipping, so against main the threshold, key and lines are unchanged | 65d0af49 → b7f5839a | study-cascade (tempo: rungs 2/3/5/6, looks 7–11 silent) |
| M6 | `SCOPE_STEPS` stored each i18n key twice | recommendation | Each rung names its key once | db51b8ea | study-dedupe |
| M7 | The kind descriptor read the offset flag three times | recommendation | It reads it once | ce036318 | study-dedupe |
| M8 | The grade closures were duplicated and the skill-label lookup was pasted six times | recommendation | One `skillLabelOf` (study/shared.mjs) and one `loreGrade` replace them | 7c82d542 | study-dedupe |
| EXT-8 | The offered-row mapper was copied | recommendation | One `offeredRow` serves `attrLoreStateFor` and `loreStateFor` | 81932a1d | study-dedupe |
| EXT-5 | The attribute ledger key was built inline at four sites | recommendation | `ledgerKeyOf` in core/lore.mjs builds it, and `parseLedgerKey` is its inverse | 9e20ca78 | study-dedupe, `known-core-exports.json` |
| EXT-10 | The spec-to-positional mapping was repeated in `forgetFact` | recommendation | One `positionalOf` maps it | 379ce561 | study-dedupe |

## Goldens changed

- `cascade-inspect.json` (AC-1, AC-3, ES-6): the claim release before the prompt, the claim taken before a grant, and `_del` deletions.
- `describe.json` (EXT-2): the study.* return shapes and writes.
- `study-attr/-auto-and-null/-kind/-lore/-refusals.json` (EXT-12): the user-prefixed session token in claim rows.
- `cascade-combat.json` (ES-5, ES-6): a second look in a round runs with a warning, and `_del` deletions.
- `cascade-forget/-release/-reset.json`, `study-reset.json`, `study-auto-and-null.json` (ES-6, ES-7): `_del`, and the whole flag unset on the last row.
- `app-preview-controls.json`, `cascade-reset.json`, `cascade-share.json` (AC-5): batched writes and one notification.
- `cascade-tempo.json` (M5): looks 8–11 were added, all silent. Rows 1–7 match main.
- `known-core-exports.json` (EXT-5): the one new export, `ledgerKeyOf`.
- No `lang/en.json` change against main.

## Deploy

Only `.mjs` files (plus README, CHANGELOG and tests) changed in `pentaryn-ties`. `module.json`,
`lang`, `styles` and the kit are untouched, so per blueprint §10 a GM browser reload is enough and no
Foundry restart is needed.

## Live check after deploy

Use only ZZ-prefixed scratch actors on a ZZ scratch scene. Never use Caven, Marrith, Talo or
campaign scenes. Delete everything afterwards. Reload the GM tab first.

1. **Set up.** Create a player-owned `ZZ Study PC` (character), a kind actor `ZZ Study Kind`
   whose study tiers are `{min:0,"A sick dog."}` and `{min:15,"A ghoul."}`, and an NPC `ZZ Study NPC`
   (`kindOf` = ZZ Study Kind) with one lore row, plus a held attribute that has a reveal. Put the PC
   and NPC tokens on `ZZ Study Scene`.
2. **AC-1, AC-3.** With hold on, inspect ZZ Study NPC as ZZ Study PC. While the GM's "A check came in"
   dialog is open, the NPC's `flags.pentaryn-ties.beliefs[<pc>]` has no `#inspect` claim row.
3. **M11.** Write a held kind miss on ZZ Study Kind for the PC
   (`{text:"<p>A sick dog.</p>",tier:0,total:6,when:1,delivered:null}`) and `study.deliver(pc, npc)`.
   The PC's `flags.pentaryn-ties.granted["kind:<kindId>"].text` reads "A sick dog". Share the kind to
   the PC, then `study.forgetFact({ns:"kind",subjectId:npc.id}, pc)`. The card comes back.
4. **ES-5.** In a ZZ combat with the PC as a combatant, inspect twice in one round. The second look
   shows the "already taken a moment" warning and still runs.
5. **ES-7, ES-6.** Reset the PC's only study row on ZZ Study NPC. The NPC's flags then have no
   `beliefs` key at all, not `{}`.
6. **AC-5, perf-4.** Make a second `ZZ Study PC2`. Share the kind to both PCs: both rows land and
   both texts are identical. Reset inspection: one notification names every attribute.
7. **M5.** Outside combat, inspect six different ZZ NPCs without moving. The bubble and chat line
   read "… looks openly paranoid." on the **sixth** look, and looks seven onward say nothing.
8. **M12 smoke.** A Share of the lore row and an attribute-lore row to the PC still lands on their
   Known tab, and the share whisper names the token.
9. **Clean up.** Delete the ZZ actors, the ZZ combat and ZZ Study Scene.
