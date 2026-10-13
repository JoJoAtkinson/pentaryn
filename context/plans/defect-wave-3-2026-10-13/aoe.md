# Defect wave 3 (2026-10-13) — pentaryn-aoe

**Read this when:** you want the history of defect wave 3 for the area-of-effect module
(`pentaryn-aoe`): which defect was fixed, how, and how to check it live. This is a record, not
instructions. To use the module, read [`context/foundry/aoe.md`](../../foundry/aoe.md).

Branch `wave3/aoe-2026-10-13`, based on `origin/main` `e392ba56`. Joe approved the fix on
2026-10-13 as a declared behaviour change (blueprint §9). He gave no ruling on this item, so it
follows the recommendation. Gate `make foundry-aoe-check`: 473/473 tests (469 plus 4 new), the
vendored kit is identical, and conformance is 100 %. No golden changed.

## Fixes

| item | defect | what changed | commits | test |
|---|---|---|---|---|
| aoe-vanish-1 | The 750 ms resolve claim had settled and `resolve()` was still running when the GM deleted the damage card. This logged one swallowed console error, `pentaryn-aoe \| createChatMessage`. The server refused the first resolution write because the card was gone, and that refusal was rethrown into the hook guard. A card deleted while the monster saves were rolling also kept rolling the remaining saves and posted the players' request card for a tray nobody could see. | A card that has vanished is now a clean cancel. Once the card is gone, `resolve()` stops and leaves a `resolve: card deleted` trace. Nothing is logged. It rolls no more monster saves, posts no request card, supersedes no older tray and auto-applies nothing. A queued resolution write (`mutate`) to a card deleted in flight returns null and logs nothing. A write refused while the card still exists is still logged as an error. The README and CHANGELOG say so. | d81dd3bd | `test/vanished-card.test.mjs` (3 of its 4 tests fail on `e392ba56`; the 4th guards the real-error path) |

Shipped files changed: `resolve.mjs` only, plus the README and CHANGELOG. There are no lang, CSS
or `module.json` changes, so a **reload** is enough (blueprint §10), not a restart.

Known limit, unchanged: suppose the card is deleted while Careful Spell's declaration is being
cleared. The declaration is still spent, as it was before this fix. The caster declares again
before the next save spell.

## Live check after deploy

Use one GM tab after the sync and a reload. Use only ZZ scratch docs: scene ZZ AoE Check and
actors ZZ Sorcerer and ZZ Goblin A and B. Delete them afterwards. Turn on
`CONFIG.debug["pentaryn-aoe"] = true` so the trace prints.

1. **Card deleted during the monster saves.** In eval-js, arm a one-shot hook that deletes the
   damage card as soon as the first NPC save card is posted (our NPC saves carry
   `flags.pentaryn-aoe.npcSave`):
   `const id = Hooks.on("createChatMessage", m => { if (!m.flags?.["pentaryn-aoe"]?.npcSave) return; Hooks.off("createChatMessage", id); game.messages.contents.findLast(x => x.type === "damage")?.delete(); });`
   ZZ Sorcerer casts Fireball over Goblins A and B and clicks Damage. Expected:
   - only one goblin save card is posted;
   - there is no "Dexterity saving throw" request card;
   - the console shows no `pentaryn-aoe` error, only the debug line `resolve: card deleted`.
2. **Card deleted before the first write.** Set `flags.pentaryn-aoe.careful = { tokens: [<Goblin A token id>] }`
   on ZZ Sorcerer. Arm
   a hook that fires only on the Careful Spell clear (not on the slot spend when casting):
   `const id = Hooks.on("preUpdateActor", (a, ch) => { if (a.name !== "ZZ Sorcerer" || !JSON.stringify(ch).includes("careful")) return; Hooks.off("preUpdateActor", id); game.messages.contents.findLast(m => m.type === "damage")?.delete(); });`
   Then cast Fireball and click Damage again. Expected:
   - no save is rolled;
   - no request card is posted;
   - the console shows no `pentaryn-aoe | createChatMessage` error;
   - `game.pentaryn.aoe.trace()` ends with `resolve` `card deleted`.
3. **Regression.** A third Fireball with no hook armed resolves normally, with a tray, saves and
   a request card.
4. Delete the ZZ scene, the ZZ actors, and every card these steps posted.

## Live check result (FIX-W3, 2026-10-13)

Run in the MCP bridge GM tab on world `pentaryn` (Foundry 14.369, dnd5e 6.0.6), after
`make foundry-aoe-sync` and a reload. No restart. Scratch docs were named `ZZ aoe …`: scene
`ZZ aoe AoE Check`, actors `ZZ aoe Sorcerer`, `ZZ aoe Goblin A` and `ZZ aoe Goblin B`. A fourth
actor, `ZZ aoe Ally`, had default ownership OWNER, so it counted as player-owned. It stood in every
area. Without it the tray has no player row, no request card is ever due, and the "no request
card" checks would prove nothing. The hooks were the plan's, with the actor name changed to
`ZZ aoe Sorcerer`. Each Fireball was placed with a real click and then centred on the three tokens.

| item | result | evidence |
|---|---|---|
| step 1, card deleted during the monster saves | **fail, then pass after forward fix 5692cfda** | First run, on `d81dd3bd`: **two** goblin save cards were posted (Goblin B, then Goblin A), not one. There was no request card, no console error, and the debug line `resolve: card deleted` printed. Cause: the hook's `delete()` cannot be awaited, and the card stays in `game.messages` until the server answers. So the save loop's `vanished` check before the next row still found it and rolled the next goblin. Fix: `resolve.mjs` records the ids of `preDeleteChatMessage` (which runs on the deleting client the moment `delete()` is called) and `vanished()` checks them; `deleteChatMessage` drops them. New test in `vanished-card.test.mjs`: it fails on `d81dd3bd` and passes on the fix. Re-run after sync and reload: **one** save card (Goblin A), no request card although the Ally was in the area, no damage card left, no `pentaryn-aoe` error, only the debug lines `mutate: card deleted` and `resolve: card deleted` |
| step 2, card deleted before the first write (Careful Spell's clear) | pass | `flags.pentaryn-aoe.careful = { tokens: [Goblin A's token] }`; the `preUpdateActor` hook fired on the clear and deleted the damage card. No save was rolled and no request card was posted. The only new message was the usage card. The console showed no `createChatMessage` error, only `resolve: card deleted`, and `trace()` ended with `resolve` `card deleted`. As the known limit says, the Careful declaration was spent (the flag is gone) |
| step 3, regression | pass | A third Fireball with no hook armed posted the damage card with its tray in the DOM. Goblin A rolled 10, which fails DC 14, so ×1. Goblin B rolled 19, so ×½. The Ally row was `manual` and waiting, and a request card "Fireball — Dexterity saving throw" was posted and recorded on the resolution. The console showed no `pentaryn-aoe` error |
| step 4, cleanup | pass | All 8 cards were deleted (the step-1 cards from the first run had already gone before the reload). So were the ZZ scene, with its regions and handles, and the four ZZ actors. The GM view is back on the active scene and `CONFIG.debug["pentaryn-aoe"]` is off. No ZZ scene, actor or message is left. The shared "Area handle" actor is untouched |

Forward fix gate: `make foundry-aoe-check` 474/474, the vendored kit is identical, and conformance
is 100 %. The goldens `hooks` and `describe` changed only by the two new hooks.
