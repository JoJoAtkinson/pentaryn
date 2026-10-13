# Defect wave 3 (2026-10-13): ties-ui (pentaryn-ties)

**Read this when:** you want the history of defect wave 3 for the ties UI (`pentaryn-ties`), the GM-only belief rows on a studied actor's Ties tab. It records what was fixed, why, and how to check it live. It is history, not instructions.

Source: the "Still open" list of [`../defect-wave-2-2026-10-12/README.md`](../defect-wave-2-2026-10-12/README.md) ("ties-ui: the GM-only belief row prints authored lore HTML as literal text (`authoring-ui.mjs:103`)"). Branch `wave3/ties-ui-2026-10-13`, based on main `e392ba56`.
Gate: `make foundry-ties-check` is green (522 tests, known-core 184, look + Known 9, i18n 537/537, conformance 96.1 % (49/51) with the two accepted exceptions C05 and C37).

Joe approved the wave on 2026-10-13 ("fix all small bugs found live"). The item is a DECLARED behaviour change with a line under the CHANGELOG `Unreleased` header. There was no ruling on the detail, so the recommendation was taken.

## Items

| item | defect | what changed (plain words) | commits | test |
|---|---|---|---|---|
| belief-text | On a studied actor's Ties tab, the GM-only Beliefs list printed the authored lore as literal markup, for example `<p>He owes the guild.</p>` with the tags showing. | The belief's text is shown as formatted HTML, enriched by Foundry's `TextEditor.enrichHTML` relative to the studied actor (so links and inline rolls resolve). The build stays synchronous: the row is drawn with the raw text in a `data-enrich` attribute, and binding the section paints it. An empty belief still says "said nothing". If enrichment throws, the escaped text is shown, never an empty box. The section is still GM-only, and a player still gets nothing. No new strings. | `f6fde947` (fix, test, CHANGELOG), `ffd9cd0b` (golden `app-editor.json`, the belief row only) | `test/belief-text-enriched.test.mjs` (fails on `e392ba56`: literal `<p>` on screen, enrichHTML never called) + `test/golden/app-editor.json` |

## Live check after deploy

Use only ZZ-prefixed scratch documents and one GM tab. Never use Caven, Marrith, Talo or a campaign scene. Delete everything afterwards. Only `.mjs` changed, so a reload is enough (no restart).

1. Create an NPC `ZZ W3 Belief NPC` and a character `ZZ W3 Belief PC`.
2. On ZZ W3 Belief NPC's Ties tab (GM), add a lore row: label `Debts`, DC 5, any skill, and text `<p>He owes the <strong>guild</strong>.</p>`. Save.
3. Give ZZ W3 Belief PC a passed belief on that row. For example, run the row's study roll for ZZ W3 Belief PC, or call `game.modules.get("pentaryn-ties").api.study.shareFact` with GM as the source. Deliver it if the gate holds it.
4. Reopen ZZ W3 Belief NPC's Ties tab. Expect: under Beliefs, ZZ W3 Belief PC's row reads "He owes the **guild**." with "guild" in bold. No `<p>` or `<strong>` text appears.
5. Optional: put `@UUID[Actor.<ZZ W3 Belief PC id>]` in a second row's text and give a belief on it. Expect: it renders as a content link, not as the raw `@UUID[...]`.
6. The player side is code only: `authoringHTML` still returns `""` for a non-GM (covered by the test). Do not create a user to check it.
7. Delete ZZ W3 Belief NPC and ZZ W3 Belief PC.

## Live check result (FIX-W3, 2026-10-13)

Run in the MCP bridge GM tab on world `pentaryn` (Foundry 14.369, dnd5e 6.0.6, `pentaryn-ties` 0.19.4), with no restart or reload. The served `authoring-ui.mjs` carries the fix (`data-enrich`, `enrichBeliefText`), and the loaded build's `authoringHTML` emits `data-enrich`. Scratch docs were an NPC "ZZ ties-ui W3 Belief NPC" and a character "ZZ ties-ui W3 Belief PC". The lore rows were written with `study.setLoreRows`, the same sanitised writer the Ties tab's Save calls, and the beliefs were given with `study.shareFact({ ns: "lore", … }, [PC], { from: null })`. Both landed delivered (`pending: false`, `pass: true`), so nothing was held.

| item | result | evidence |
|---|---|---|
| belief-text (step 4) | pass | Row "Debts" (DC 5, History) with text `<p>He owes the <strong>guild</strong>.</p>`. In both the Ties editor (`api.edit`) and the actor sheet's `ties` tab, the PC's belief box rendered `innerHTML` `<p>He owes the <strong>guild</strong>.</p>` and `textContent` "He owes the guild.". "guild" sits in a real `<strong>` at computed weight 700. No literal `<p>` or `<strong>` appears in the visible text. |
| belief-text (step 5, optional) | pass | Row "Link" with text `<p>Ask @UUID[Actor.<ZZ PC id>] about it.</p>` rendered as `Ask <a class="content-link" data-uuid="Actor.<ZZ PC id>">…ZZ ties-ui W3 Belief PC</a> about it.`. No raw `@UUID[` appears in the text. |
| belief-text (step 6, player gate) | pass | One-call GM shadow: `game.user.isGM` was overridden to false only for one `authoringHTML(npc)` call, then restored in `finally`. It returned `""` (the GM call returned 23004 chars). No user was created. |

Cleanup: the sheet and editor were closed, and both ZZ actors were deleted. No "ZZ ties-ui" document or chat message remains. No `pentaryn-ties` world setting or actor flag still names either scratch id. Exactly one GM is active.
