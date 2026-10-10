# pentaryn-aoe

**Read this when:** changing this module's code. To *use* it at the table, read
[`context/foundry/aoe.md`](../../../context/foundry/aoe.md). For the design and its reasons, read
[`context/plans/aoe-circles.md`](../../../context/plans/aoe-circles.md).

| File | Part | |
|---|---|---|
| `aoe.mjs` | — | entry: settings at init, hooks at setup, `game.pentaryn.aoe` + GM startup at ready; `install()` for hot-patching |
| `core.mjs` | — | pure helpers: shape centre, creature filter, rows, save→multiplier, save matching, hit test. Node-tested |
| `settings.mjs` | — | world settings; `setting(key)` falls back to defaults |
| `hooks.mjs` | — | `on()` records hook ids so `uninstall()` can remove them; `guard()` keeps a throw out of core hooks |
| `areas.mjs` | A | ownership → OWNER, handle token + `attachment.token` (not for a region dnd5e attached to another token: emanations), delete cascade, **Remove all templates** (eraser icon after *Place Template* in the card's `section.icon-row`; clears every template that spell item placed on the viewed scene, all activities), concentration cleanup, `sweep`, handle actor size lock |
| `resolve.mjs` | B | GM `createChatMessage` trigger, NPC saves, request card (`CONFIG.DND5E.requests["pentaryn-aoe.save"]`), `applyRows` |
| `tray.mjs` | B | GM-only tray in `dnd5e.renderChatMessage`, right after the native `<damage-application>` |
| `attacks.mjs` | C | `dnd5e.postRollAttack` → `rollDamage` on a hit |
| `effects.mjs` | D | self-cast auto-apply (`createChatMessage` on the active GM, or the caster's client when no GM is on) and the "Not applied yet" highlight on an Effects tray |
| `escape.mjs` | E | PRIORITY Escape keybinding: cancels core's region placement (`canvas.regions._cancelPlacement`) before core's dismiss closes the open windows |

**dnd5e 6 only (0.3.0).** Chat data is read from typed messages: `message.type` (`usage`, `attack`,
`damage`, `save`), `message.system.{activity,item,targets,origin,onSave,ability,mode,ammunition,effects}`,
`message.getAssociatedActivity()` and `message.system.getEffects()`. Recorded targets are
`{ actor, token }` uuids; Part B uses the token and falls back to the actor only for a card migrated
from 5.3.3. A template region is `flags.dnd5e.activity` (+ `item`, and `origin` = the caster's
**token**); regions placed under 5.3.3 (`flags.core.MeasuredTemplate`, `origin` = the activity) are
still matched (`core.isTemplateRegion`, `regionFromSpell`, `regionOfActivity`). The one-way
migration does not touch them, so these two `??`s are the only 5.3.3 concession.

Part B, the saves. Every save this module rolls (NPC, request card, GM-for-player) is posted with
the activity's `messageSources` and `system.origin` = the spell's usage card, exactly as dnd5e's own
save button posts it. So the usage card's `outcomes` hold our results and the native damage tray's
half-damage pill agrees with the multipliers in ours. dnd5e's roll workflow would otherwise set
`system.origin` to whatever card the click came from (our tray, the request card), so those rolls
get the click's modifier keys but not its target (`keysOnly`). NPC saves use the
`npcSaveRollMode` setting (`gm` / `blind` / `public`, core v14 message modes) through
`foundry.dice.Roll._mapLegacyRollMode`: dnd5e 6 hands it to core as `messageMode`, and core turns
an unknown name such as the old `gmroll` into the client default, public. A stored legacy value is
rewritten once on the active GM's ready (`settings.migrateSettings`). The native outcomes cover only
recorded or selected targets, so "everyone inside the area", the NPC auto-rolls and the confirm
tray stay ours.

Part D, in short. A usage card's effects go onto the caster when the card's only target is the
caster, or its activity affects only `self` (Shield). Attack and save activities targeted at
yourself are left alone, and so is a card with more than one effect: that is a choice (Guidance's
skills, Fire Shield's warm or chill), so it stays in the tray. The effects are
`message.system.getEffects()` (item effects or `dnd5e.effects` compendium effects). Applying uses
dnd5e 6's own `EffectApplicationElement#_prepareEffectData` on a detached `<effect-application>`
bound to the card, so `system.origin`, `dependentOn`/`scaling`/`spellLevel`, the activity's
replacement values and the auto-duration are dnd5e's. An effect already on the actor with
`_stats.duplicateSource` (or `compendiumSource`) = the card effect is refreshed, not duplicated, so
a later Apply in the tray cannot stack a second copy. What was applied
is recorded in `flags.pentaryn-aoe.effectsApplied` `{ids, auto, reason, actor, actorName, names}`,
and the card gets an "Applied to X: Y" line (X is the card's speaker name, i.e. the token name; an
unidentified item is named, not its effect). A tray whose effects are neither recorded nor already
on every targeted creature gets an outline and a "Not applied yet" pill. One applied effect settles
the card, since several effects are a choice. Cards older than an hour never light up. dnd5e 6's
own **Apply button** is noticed (capture listener on `.apply-button`; a click on an effect row only
selects it now): the pressed `.effect[data-uuid]` rows count as applied, but only when the Apply had
someone to act on (the `recorded-targets` selection, else controlled tokens). With the world setting
`dnd5e.allowPlayerEffectsTray` on, a player whose card targets their own token gets the tray too;
the auto-apply stays for the one-target case.

Part E (`escape.mjs`): **Escape cancels a template placement on the first press.** dnd5e 6 places
templates through core's `canvas.regions.placeRegions`. Core's own Escape (`dismiss`, DEFERRED) only
reaches the placement after it has closed every open window, and dnd5e minimises the sheet the spell
was cast from for the placement — so without this the first Escape closes that sheet while the
preview keeps following the mouse. A PRIORITY binding consumes Escape only while
`canvas.regions._placementContext` is set and calls core's `_cancelPlacement` (what core's dismiss
calls); otherwise core handles the key. Right-click (core) also cancels a single-shape placement.
Adjustment row `core-region-placement-escape`. A hot-patched copy cannot register a keybinding; it
takes over the one registered at startup.

State is kept in flags. A damage message carries `flags.pentaryn-aoe.resolution`, which holds the
rows, the saves, the multipliers and what has been applied. A handle token carries
`flags.pentaryn-aoe.{handle:true, region}`. A region carries `flags.pentaryn-aoe.handle` plus core's own
`attachment.token`, and the shared actor carries `flags.pentaryn-aoe.handleActor`. The handle actor is
`traits.size: "tiny"` with `movement.hover: true`, and its prototype and every handle token carry
`flags.dnd5e.lockSize` (`ensureHandleActor` and `sweep` repair older ones): dnd5e 6 `tokenSizeSync`
would have the GM rewrite a 0.5 handle to its actor's size, and `movementAutomation` would mark a
raised handle Falling. Adjustment row `dnd5e-token-size-lock`. A dnd5e 6 template region is
created with `levels: [the viewed level]` and no elevation (its prepared `elevation.bottom` is
`-Infinity`), so the handle is created on that level at the region's source bottom, else the level's
base, else 0 (`core.handleVertical`), and the region keeps its level. Flags are read
as `doc.flags["pentaryn-aoe"]`, never with `getFlag`. `getFlag` throws while the module is inactive,
and the module is inactive when hot-patched.

**Two sessions on one account.** The MCP bridge tab is a GM session, so a GM browser tab next to it
makes two clients that both pass `game.users.activeGM.isSelf` and both pass `userId === game.user.id`
for whatever the GM places. Before 2026-10-10 that doubled everything this module does on a broadcast
hook: two handle tokens per area (core's stale `attachments.regions` then deleted the area when the
unattached twin was removed), two saves per monster that could disagree with each other in the native
outcomes, two request cards, and a self-cast effect applied twice. Two guards now:
- **Handles** are created with `_id` = the region's id and `keepId`. The server serialises creates and
  refuses an existing `_id`, so one client wins and the other's "already exists" is swallowed.
- **`resolve` and `selfApply`** (the `createChatMessage` paths) first call `hooks.claimMessage(message,
  job)`: every candidate writes its `game.socket.id` to `flags.pentaryn-aoe.claims.<job>`, waits 750 ms,
  and only the client whose id is still there proceeds (every client sees the server's single order of
  writes; a latecomer finds the claim and stands down). The manual console calls do not claim.
Deleting the same region or handle twice (concentration cleanup, the GM's delete backstop) is
idempotent and only logs. Node tests cover the claim; the duplicate-`_id` refusal was checked live.

The tray's "would land" preview passes the damage message as `originatingMessage`, the way Apply
does, so a rider on the damage card (Elemental Adept's ignored resistance) shows in the preview too.

Differences from the plan:
- The Remove all templates icon uses `data-pentaryn-aoe-action`, not `data-action`. A `data-action`
  inside a dnd5e card is also dispatched to the activity's own chat handler.
- The tray is built in JS. There is no `templates/tray.hbs`, because the render hook is
  synchronous.
- Rows for the caster, hidden tokens and anyone at 0 HP start unticked (open question 3).

**Hot-patch** (to test before a restart): fetch each file from `/modules/pentaryn-aoe/`, rewrite
the relative imports to blob URLs, set `globalThis.__pentarynAoeHot = true`, import `aoe.mjs`,
then call `install({ sweepOnReady: false })`. To take it out again, call
`game.pentaryn.aoe.uninstall()`.

Checks: `make foundry-aoe-check` runs parse, imports, i18n and `node test/run.mjs`.
Install: `make foundry-aoe-sync`. A first install needs a server restart.
