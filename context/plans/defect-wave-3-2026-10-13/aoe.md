# Defect wave 3 (2026-10-13) — pentaryn-aoe

**Read this when** you want the history of defect wave 3 for the area-of-effect module
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
