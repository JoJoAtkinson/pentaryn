# Wave 3b — upstream reports (2026-10-13)

**Read this when:** you want to know what wave 3b found about the Foundry 14.369 canvas-draw
error and the three suspected Argon bugs, or you need the drafted issue texts. History, not
instructions.

## Result

| bug | owner | clean-world result | where it goes |
|---|---|---|---|
| "first token change not persisted" | ours (hidden-tab harness) | settled in wave 3; use-doc fixed in `d8748a7c` (`context/foundry/README.md`) | nothing to report |
| `scene.view()` resolves mid-draw, token update throws `reading 'OBJECTS'` | Foundry core | 3/3 after reload on a fresh dnd5e world with no modules (1/2 more without reload) | foundryvtt/foundryvtt, bug-report form — draft below |
| Argon `createItem`/`deleteItem` hook throws on a world Item | Argon core (`enhancedcombathud` 5.0.1) | 3/3 create + delete, only Argon enabled | theripper93/enhancedcombathud — draft below |
| Argon special-action cards use the actor name | Argon dnd5e (`enhancedcombathud-dnd5e` 5.2.2; master unchanged) | 3/3 (Dash, Disengage, Hide) | theripper93/enhancedcombathud-dnd5e — draft below |
| Argon HUD disabled itself after a grid change | not reproduced | 0/7 in the clean world, 0/3 on a ZZ scene in pentaryn | nothing to report |

**Not posted.** The drafts below wait for Joe to say "post them" in chat; each goes to the repo
named above with `gh issue create -R <repo> --title "<title>" --body-file <draft>`. No duplicates
were found (searched open and closed issues in all three repos).

## How it was checked

- Packages: `Data/modules/enhancedcombathud` (5.0.1, authors theripper93 and Mouse0270,
  url github.com/theripper93/enhancedcombathud) and `enhancedcombathud-dnd5e` (5.2.2,
  theripper93). Neither declares a module dependency beyond Argon core, so the test world ran
  dnd5e 6.0.6 plus those two only. Upstream latest: core 5.0.1, dnd5e adapter 5.2.3 (only a
  dnd5e 6 ability-check fix; the speaker code is the same on master).
- Channel: both READMEs point to theripper93.com/info/issues: GitHub issues accept bugs with
  clear steps, using the Bug Report template, all other modules disabled, latest Foundry stable.
- Temporary world `zz-argon-repro` (dnd5e, created through `/create`): first with no modules for
  the core error, then with the two Argon modules. Deleted afterwards (`uninstallPackage`).
- Grid change: the canvas redraw releases the token (`controlToken false`), Argon's 100 ms timer
  calls `bind(null)`, the redraw re-controls the token and Argon rebinds because `_enabled` stays
  true. In pentaryn `openCombatStart` is on, and Argon turns the HUD off when a combat is deleted
  (`_onDeleteCombat`), so the wave-2 sighting was most likely a combat ending, which is the
  setting doing its job. Both test tabs were hidden, so a visible-tab close/render race was not
  ruled out.

## Draft: Foundry

Title: Token update during the first canvas draw throws "Cannot read properties of undefined (reading 'OBJECTS')"; client document desyncs from server

````markdown
### What happened?

Filed by an AI agent (Claude) on behalf of a human user who asked me to confirm each step in a clean world with only your modules enabled before reporting. (For core: confirmed in a fresh world with no modules enabled.)

A token update made while the first canvas draw of a newly created scene is still running rejects with `TypeError: Cannot read properties of undefined (reading 'OBJECTS')`. The server stores the change, but on the client the TokenDocument's `x` and the placeable keep the old position (`_source.x` has the new value) until the page is reloaded.

`await scene.view()` resolves while `canvas.loading` is still `true` and `canvas.pendingRenderFlags` is still `undefined`, so code that awaits `view()` and then updates a token hits this.

Expected: once `view()` resolves, a token update resolves and the client shows the new position (or `view()` resolves only after the draw finishes).

### What ways of accessing Foundry can you encounter this issue in?

- [ ] Native App (Electron)
- [x] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Other

### Reproduction Steps

Tested in a new world, system dnd5e 6.0.6, no modules enabled, one GM connected, Chrome 154 on macOS.

1. New world with no scenes (or delete all scenes), reload so the canvas is blank.
2. In the console:
```js
const s = await Scene.create({name: "A", width: 2000, height: 2000, grid: {size: 100}});
await s.view();                                   // the first scene auto-activates
console.log(canvas.loading, canvas.pendingRenderFlags); // true undefined
const a = await Actor.create({name: "N", type: "npc"});
const [t] = await s.createEmbeddedDocuments("Token", [(await a.getTokenDocument({x: 500, y: 500})).toObject()]);
await t.update({x: 800});                         // rejects
```
3. After it settles: `t._source.x` is 800 and the server has 800, but `t.x` and `t.object.document.x` stay 500.

Reproduced 3 of 3 times after a reload with a blank canvas; once more without a reload it reproduced 1 of 2 (timing dependent).

### What core version are you reporting this for?

14.369

### Relevant log output

```shell
TypeError: Cannot read properties of undefined (reading 'OBJECTS')
    at RenderFlags.set (foundry.mjs:53774:49)
    at #onUpdateAnimation (foundry.mjs:166687:24)
    at Token5e._onUpdate (foundry.mjs:166417:28)
    at TokenDocument5e._onUpdate (foundry.mjs:39385:21)
    at TokenDocument5e._onUpdate (foundry.mjs:63874:11)

Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'addChild')
    at GridLayer.addHighlightLayer (foundry.mjs:187100:51)
    at TokenRuler5e.draw (foundry.mjs:190490:52)
    at async Token5e._draw (foundry.mjs:163648:23)
```

### Bug Checklist

- [x] The issue occurs while all Modules are disabled

Thank you for Foundry VTT.
````

## Draft: Argon core

Title: createItem/deleteItem hook throws "Cannot read properties of null (reading 'items')" for a world Item after the HUD has closed

````markdown
Filed by an AI agent (Claude) on behalf of a human user who asked me to confirm each step in a clean world with only your modules enabled before reporting.

Thank you for Argon.

**Module(s):** Argon - Combat HUD (CORE) `enhancedcombathud` 5.0.1, with `enhancedcombathud-dnd5e` 5.2.2

**Conflicting Module(s):** none (no other modules enabled)

**Foundry and System version:** Foundry VTT 14.369, dnd5e 6.0.6

**OS, Hosting, Browser:** macOS, self-hosted (local), Chrome 154

**Short description of bug**

After the HUD has been closed once (a token was selected and then released), creating or deleting a world Item (an Item in the Items sidebar, with no parent actor) throws in the `createItem` / `deleteItem` hook. `bind(null)` sets `this._actor = null`, and a world Item's `parent` is also `null`, so `item.parent === this._actor` is true and `_checkItemCount()` reads `this._actor.items` (`scripts/app/CoreHud.js`, `_onCreateItem` / `_onDeleteItem`). Before any token has been selected `_actor` is `undefined`, so the first world Item in a session does not throw.

**Simple steps to reproduce the bug**

1. New world, dnd5e, only the two Argon modules enabled. Create a scene and an NPC actor, and place its token.
2. Select the token and open the Argon HUD, then click empty canvas so the token is released (the HUD closes).
3. In the Items sidebar, create an Item (any type, e.g. a weapon).
4. Delete that Item.

Expected: no error.
Actual: an error in the console at step 3 and again at step 4 (below). Reproduced 3 of 3 times. The Item is still created and deleted.

A possible fix is to return early when `!this._actor` (or `!item.parent`) in both handlers.

**Console errors**

```
Error: Error thrown in hooked function 'bound _onCreateItem' for hook 'createItem'. Cannot read properties of null (reading 'items')
    at Hooks.onError (foundry.mjs:26871:24)
    at #call (foundry.mjs:26853:36)
    at Hooks.callAll (foundry.mjs:26808:17)

Error: Error thrown in hooked function 'bound _onDeleteItem' for hook 'deleteItem'. Cannot read properties of null (reading 'items')
    at Hooks.onError (foundry.mjs:26871:24)
    at #call (foundry.mjs:26853:36)
    at Hooks.callAll (foundry.mjs:26808:17)
```

- [x] I will include screenshots and/or console errors when posting the message or issue
- [x] I have disabled all other modules
````

## Draft: Argon dnd5e

Title: Special action chat cards (Dash, Disengage, Hide…) use the actor name instead of the token name

````markdown
Filed by an AI agent (Claude) on behalf of a human user who asked me to confirm each step in a clean world with only your modules enabled before reporting.

Thank you for the dnd5e integration for Argon.

**Module(s):** Argon - Combat HUD (DND5E) `enhancedcombathud-dnd5e` 5.2.2, with `enhancedcombathud` 5.0.1 (the relevant code is unchanged in 5.2.3 / current master)

**Conflicting Module(s):** none (no other modules enabled)

**Foundry and System version:** Foundry VTT 14.369, dnd5e 6.0.6

**OS, Hosting, Browser:** macOS, self-hosted (local), Chrome 154

**Short description of bug**

The chat cards for the built-in special actions (Dash, Disengage, Dodge, Hide, Ready, Shove, when the actor has no matching item) show the actor's name instead of the token's name. `DND5eSpecialActionButton.createChatMessage` sets `speaker: {actor: this.actor, token: this.actor.token, alias: this.actor.name}` (`scripts/echDnd5e.js`). For a token renamed in Token Config, e.g. "Goblin 2" of actor "Goblin", the card header says "Goblin", while dnd5e's own item cards and `ChatMessage.getSpeaker({token})` say "Goblin 2". With several copies of one creature on the scene the GM cannot tell which one acted.

**Simple steps to reproduce the bug**

1. New world, dnd5e, only the two Argon modules enabled. Create an NPC actor "Goblin" and place an unlinked token.
2. Rename the placed token to "Goblin 2" (Token Config, Name).
3. Select the token, open the Argon HUD, and click Dash (also Disengage, Hide).

Expected: the chat card's speaker is "Goblin 2" (the token name), matching dnd5e's own cards.
Actual: the card's speaker is "Goblin". Reproduced 3 of 3 times (Dash, Disengage, Hide). No console error.

A possible fix is `speaker: ChatMessage.getSpeaker({actor: this.actor, token: this.actor.token})` (which also covers a linked actor whose token has a different name).

- [x] I will include screenshots and/or console errors when posting the message or issue
- [x] I have disabled all other modules
````


## Filed (2026-10-13, Joe approved in chat)

- Foundry core: https://github.com/foundryvtt/foundryvtt/issues/14845
- Argon core: https://github.com/theripper93/enhancedcombathud/issues/166
- Argon dnd5e: https://github.com/theripper93/enhancedcombathud-dnd5e/issues/17
