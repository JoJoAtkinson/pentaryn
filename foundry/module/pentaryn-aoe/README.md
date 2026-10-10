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
| `areas.mjs` | A | ownership → OWNER, handle token + `attachment.token`, delete cascade, **Remove all templates** (under *Place Template*; clears every template that spell item placed on the viewed scene, all activities), concentration cleanup, `sweep` |
| `resolve.mjs` | B | GM `createChatMessage` trigger, NPC saves, request card (`CONFIG.DND5E.requests["pentaryn-aoe.save"]`), `applyRows` |
| `tray.mjs` | B | GM-only tray in `dnd5e.renderChatMessage` |
| `attacks.mjs` | C | `dnd5e.postRollAttack` → `rollDamage` on a hit |
| `escape.mjs` | E | **Escape cancels an area template placement** (keybinding `pentaryn-aoe.cancelTemplate`, PRIORITY precedence) |
| `effects.mjs` | D | self-cast auto-apply (`createChatMessage` on the active GM, or the caster's client when no GM is on) and the "Not applied yet" highlight on an Effects tray |

Part D, in short. A usage card's effects go onto the caster when the card's only target is the
caster, or its activity affects only `self` (Shield). Attack and save activities targeted at
yourself are left alone, and so is a card with more than one effect: that is a choice (Guidance's
skills, Fire Shield's warm or chill), so it stays in the tray. Applying copies dnd5e 5.3.3
`EffectApplicationElement#_applyEffectToActor` (origin = the concentration effect if any,
`dependentOn`/`scaling`/`spellLevel` flags), and an effect already on the actor from that origin is
refreshed, not duplicated, so a later click in the tray cannot stack a second copy. What was applied
is recorded in `flags.pentaryn-aoe.effectsApplied` `{ids, auto, reason, actor, actorName, names}`,
and the card gets an "Applied to X: Y" line (X is the card's speaker name, i.e. the token name; an
unidentified item is named, not its effect). A tray whose effects are neither recorded nor already
on every targeted creature gets an outline and a "Not applied yet" pill. One applied effect settles
the card, since several effects are a choice. Cards older than an hour never light up. dnd5e's own
apply click is noticed, so the highlight goes and the message is flagged. Note that dnd5e 5.3.3
shows the Effects tray to a player only for *transfer* effects on their own card, so for most spells
the tray (and the highlight) is the GM's. That is why the self-cast case is applied for them.

Part E, in short. dnd5e 5.3.3 cancels a template placement only on right-click
(`AbilityTemplate#activatePreviewListeners` sets `canvas.app.view.oncontextmenu` to
`_onCancelPlacement`). Escape went to core's `dismiss` (DEFERRED), which closed windows or opened the
main menu while the template kept following the mouse. The `cancelTemplate` binding (Escape, editable
in Configure Controls) runs first. It finds the template being placed: a child of
`canvas.templates.preview` that has `_onCancelPlacement` (`core.placingTemplate`; v14 hands the
template layer off to regions, so `canvas.activeLayer` is no signal). Then it calls that template's own
`_onCancelPlacement`, so cleanup is dnd5e's: the preview is cleared, the earlier layer re-activated,
the sheet restored and the placement promise rejected, all as with right-click, and no template is
made. It returns `true` (consumed) only then. At any other time it returns `false`, so core's Escape
is unchanged. The handler is synchronous on purpose, because an async `onDown` returns a Promise, which
counts as consumed. A keybinding can only be registered at init, and Foundry keeps the function it
was given, so the registered `onDown` is a trampoline into a global slot
(`Symbol.for("pentaryn-aoe.cancelTemplate")`) that the copy installed last fills. A hot-patched copy
therefore takes over the startup copy's binding after its `uninstall()`; only a first install that is
hot-patched has no binding (console warning). `uninstall()` empties the slot, which hands Escape back
to core. `game.pentaryn.aoe.activePlacement()` returns the
template being placed, or null.

State is kept in flags. A damage message carries `flags.pentaryn-aoe.resolution`, which holds the
rows, the saves, the multipliers and what has been applied. A handle token carries
`flags.pentaryn-aoe.{handle:true, region}`. A region carries `flags.pentaryn-aoe.handle` plus core's own
`attachment.token`, and the shared actor carries `flags.pentaryn-aoe.handleActor`. Flags are read
as `doc.flags["pentaryn-aoe"]`, never with `getFlag`. `getFlag` throws while the module is inactive,
and the module is inactive when hot-patched.

Differences from the plan:
- The Remove all templates button uses `data-pentaryn-aoe-action`, not `data-action`. A `data-action`
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
