---
title: Argon Combat HUD — every Pentaryn touch
status: active
last_modified: 2026-10-12
tags: [foundry, argon, enhancedcombathud, combat, riders, transform, modules]
---

# Argon Combat HUD — every Pentaryn touch

**Read this when:** the Argon HUD (`enhancedcombathud` + `enhancedcombathud-dnd5e`) misbehaves —
a button missing or doubled, pips wrong, a tooltip that won't close or eats a click, the HUD on the
wrong token, a drawer in the wrong place — or before an Argon update, or before adding another
Argon hook or patch. **Not this file:** what Full Attack and the follow-ups do at the table →
[`melee.md`](melee.md) · a module's API and settings → its README · the registry of every
adjustment, with `what` / `why` / `native_when` → [`../../foundry/adjustments.yml`](../../foundry/adjustments.yml).

Six in-house modules touch Argon: **combat**, **riders**, **transform** (heavily), **aoe**,
**senses** and **creatures** (lightly). None edits Argon's files: every change is a hook, a
`wrapMethod` / `defineAccessor` through the kit (recorded in `describe().patches`), a subclass of an
Argon class read from `CONFIG.ARGON`, a per-instance override, a direct call on `ui.ARGON`, or CSS.
Each one has an adjustments row (ids below), so the Saturday updater counts these modules as
exposed to an Argon update.

## 1. Order

**Hooks** run in registration order. Foundry evaluates module scripts in its active-package order
(alphabetical by id among these: `pentaryn-aoe`, `-combat`, `-creatures`, `-riders`, `-senses`,
`-transform`), and each module registers at load (`esmodules`) or in `init`/`ready`. Inside a module
the order is pinned by its `test/golden/hooks.json`. Check live with
`Hooks.events.renderActionPanelArgonComponent.map(h => h.fn.name)` (same for the other names).

| Argon hook | Listeners, in firing order |
|---|---|
| `renderActionPanelArgonComponent` | combat `turnflow/action-buttons.mjs` (special actions, Opportunity Attack) → combat `hud/bars.mjs` compose the bars → combat `hud/bars.mjs` pips repaint → transform `hud-panels.mjs` (Bonus / Action / Special bars: Wild Shape, Starry Form, Return) |
| `renderItemButtonArgonComponent` | combat `hud/bars.mjs` (Pole Strike gate, duplicate off-hand slot) → riders `argon-tidy.mjs` (button tidy, then the per-prototype wraps of §2) → transform `hud-panels.mjs` (Opportunity Attack label) |
| `renderButtonPanelButtonArgonComponent` | combat `turnflow/drawers.mjs` (drawer opens above its own button) |
| `renderPortraitPanelArgonComponent` | transform `hud-panels.mjs` (form line and HP) |
| `renderEffectArgonComponent` | transform `hud-panels.mjs` (the form's effect) |

Core/dnd5e hooks whose listeners act on the HUD (not Argon hooks, same order rule): `controlToken`
(combat `boundaries.mjs`: the HUD follows the token left selected), `deleteToken` (combat
`helper-token.mjs`: reselect your own; transform `hud-panels.mjs`: the HUD's token is gone),
`updateCombat` / `combatTurnChange` (combat bars, pips, movement readout, drawers closed at a turn
boundary), `updateItem` (riders shared-uses badges), `dnd5e.preCreateMeasuredTemplate` and
`dnd5e.preSummon` (riders collapse open panels), a window opening (combat drops the HUD tooltip).

## 2. Prototype and instance patches

Installed by the kit (`wrapMethod` / `defineAccessor`), so `describe().patches` names each with
its marker and row. "Ready" means the module's `ready` handler, in the §1 module order.

| Target | When | Module, marker | Row |
|---|---|---|---|
| `CONFIG.ARGON.MAIN.ActionPanel.prototype.updateActionUse` | ready | combat `patches.mjs`, `_pcSettles` | `combat-argon-pip-settle` |
| `CONFIG.ARGON.PORTRAIT.PortraitPanel.prototype.getEffects` | ready | combat `turnflow/portrait.mjs`, `_pcConditions` | `combat-argon-portrait-conditions` |
| `ButtonPanelButton.prototype._renderInner` (Argon's base, via `CONFIG.ARGON.MAIN.BUTTONS`) | ready | riders `patches.mjs` | `riders-argon-ritual-adept-list` (also `argon-riders-long-casts`) |
| an item button's prototype `targets` getter (per class, first render) | `renderItemButtonArgonComponent` | riders `patches.mjs`, `_prTargets` | `riders-argon-metamagic-no-picker` |
| an item button's prototype `getTooltipData` (per class, first render) | `renderItemButtonArgonComponent` | riders `patches.mjs`, `_prTooltip` | `riders-argon-tooltip-item-rolldata` |
| `ui.ARGON.bind` (the instance) | ready, else first `canvasReady` | aoe `argon.mjs`, `_aoeGuard` | `aoe-argon-handle-bind` |

Per-instance overrides (no prototype is touched; each lives only as long as the button or panel):
combat redefines a rendered Action panel's `maxActions` / `currentActions` getters (swing pips,
`argon-combat-swing-pips`), wraps Dash / Disengage / Dodge / Hide / Ready / Shove `_onLeftClick`
(`argon-combat-special-actions`), labels and wraps the Reaction slot (`argon-combat-reaction-slot`),
and wraps each drawer toggle (`argon-combat-drawer-near-button`).

## 3. Subclasses of Argon classes

Read from `CONFIG.ARGON` at render time (Argon keeps its dnd5e classes closure-private otherwise):

- **combat** `hud/buttons-ui.mjs`: `FullAttackButton`, `FollowUpButton`, `CommandButton` and an
  unrendered `PickerProbe` (to open Argon's private TargetPicker), all `extends ItemButton`
  (`argon-combat-panel-injection`, `argon-combat-target-picker-reuse`).
- **transform** `form-picker.mjs`: `FormTile`, `ReturnButton`, `ConstellationTile`
  (`extends ItemButton`), `WildShapeButton`, `StarryFormButton` (`extends ButtonPanelButton`)
  (`argon-panel-injection`).

## 4. Direct calls on `ui.ARGON`

| Call | Module | Why |
|---|---|---|
| `bind(token)` | combat `turnflow/boundaries.mjs` | the HUD follows the one token left selected, and your combatant at turn start (`argon-combat-hud-follows`) |
| `collapseAllPanels()` | riders `argon.mjs`, transform `form-picker.mjs`, senses `argon.mjs` | close an open panel before an area/summon placement, a form swap, or the Light cantrip's Pick a target (`argon-collapse-on-area-placement`, `argon-light-pick-collapse-panels`) |
| `render()` | combat `argon.mjs` `renderHud` | re-render a bound HUD after a combat setting changes |
| `_tooltip` (read; set to `null`) | combat `argon.mjs`, transform `argon.mjs`, kit `lib/argon-kit.mjs` `dropTooltip` | refresh or drop a stale hover tooltip (`argon-combat-tooltip-refresh`, `argon-combat-stray-tooltip`, `argon-tooltip-clear`) |
| `_actor`, `_token`, `itemButtons`, `components` (read) | combat, transform, riders | which actor/token the HUD shows; re-render buttons that spend shared uses (`argon-shared-uses-badge`) |
| a synthetic right-button `mouseup` | transform `argon.mjs` | cancel Argon's target picker before a form swap (`argon-target-picker-cancel`) |
| `MovementHud.updateMovement` | combat `turnflow/movement.mjs` | redraw the movement readout after an effect or Speed change (`argon-combat-movement-redraw`) |

Data, not code: combat seeds `flags.enhancedcombathud.weaponSets` once per character whose flag
was never written (`argon-combat-weapon-set-seed`). creatures only asks
`game.modules.get("enhancedcombathud")?.active` to float the Your creatures strip above the HUD
(`argon-creatures-strip-float`).

## 5. CSS

| Stylesheet | Selectors | Note |
|---|---|---|
| kit `lib/argon-tooltip.css` (D7) | `.ech-tooltip.pentaryn-tt`, `.pentaryn-tt-list` | compact tooltip, pointer-events none; listed in `styles` by combat, transform and riders (inert for riders alone); the same rules load once per module that is on |
| riders `styles/riders.css` | `#tooltip.ech-tooltip-container`, `#tooltip .ech-tooltip` | every live Argon hover tooltip lets clicks through (`argon-tooltip-click-through`; C37's documented exception, W4-R9) |
| combat `styles/combat.css`, transform `styles/transform.css` | `.extended-combat-hud .action-element.<ptf-/pentaryn-combat->…` | their own buttons and bars |

## 6. When Argon misbehaves

1. Turn the suspects off one at a time in this order: riders, transform, combat (aoe, senses and
   creatures touch only `bind`, `collapseAllPanels` and the strip position).
2. `game.pentaryn.<ns>.describe().patches` lists each module's installed wraps; a missing one
   means its `ready` warned (`<module> | … not installed` in the console).
3. After an Argon update, read each row's `native_when` in `adjustments.yml` (does Argon now do it
   itself?) and run `make foundry-adjustments-check` (the registry checked against the code).
