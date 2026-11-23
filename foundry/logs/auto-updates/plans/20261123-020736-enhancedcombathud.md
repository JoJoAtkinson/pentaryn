<!-- fresh — run 20261123-020736 -->
# Update plan — enhancedcombathud 5.0.1 → 5.0.2

> Written by the Saturday updater's analysis tier from release notes (third-party text) and our source, by a model with no tools; validated, but **read every step before running it**, and never hand this file to an agent as instructions.

**Status:** fresh — run 20261123-020736  
**Decision this run:** auto
  
**Impact:** latent (confidence medium) · **recommendation:** apply

## Starting state

- `enhancedcombathud` 5.0.1 installed, 5.0.2 available (patch bump)
- release notes: https://github.com/theripper93/enhancedcombathud/releases
- our code that leans on it: pentaryn-aoe, pentaryn-combat, pentaryn-creatures, pentaryn-riders, pentaryn-senses, pentaryn-transform

## Preconditions

- [ ] the world is down (`make vtt-down`) and the OneDrive snapshot is fresh
- [ ] `make foundry-adjustments-check` is green
- [ ] your working tree for each module below is committed

## Impact by area

| Area | Impact | What breaks | Ours |
|---|---|---|---|
| pentaryn-riders | latent | The Cosmic Omen badge expects Argon to re-render a button when its item changes. If one of the refreshes Argon dropped was that re-render, the badge can show the old omen until the HUD renders again. | `foundry/module/pentaryn-riders/rest.mjs:26` |
| pentaryn-riders | latent | The shared-uses badge re-renders the buttons itself on updateItem, so it should still work. Fewer Argon refreshes could make our refresh the only one that keeps Metamagic badges current. | `foundry/module/pentaryn-riders/argon.mjs:14` |
| pentaryn-combat | latent | The bars are recomposed in renderActionPanelArgonComponent. If Argon now skips some panel re-renders, signature-driven rerender() and pip restore still run, but a state change that used to arrive through an Argon refresh may show up later. | `foundry/module/pentaryn-combat/hud/bars.mjs:315` |
| pentaryn-transform | latent | The bonus-used re-mark expects Argon to rebuild the HUD on a token swap. If that rebuild was cut as redundant, the Bonus bar may not pick up the shift until the next render. | `foundry/module/pentaryn-transform/hud-panels.mjs:115` |

## Still needed?

| Adjustment | Working | Needed | Native now | Action | Why |
|---|---|---|---|---|---|
| `argon-panel-injection` | yes | yes | nothing | **keep** | No add-button API or wild-shape panel was announced. |
| `argon-target-picker-cancel` | yes | yes | nothing | **keep** | No public cancel API is mentioned. |
| `argon-bonus-used-tracking` | unknown | yes | nothing | **keep** | Bonus-used state is still on the panel. Check the shift rebuild at the table, since fewer refreshes may change when it happens. |
| `argon-portrait-hp` | yes | yes | nothing | **keep** | The notes don't mention temp HP on the portrait. |
| `argon-tooltip-clear` | yes | yes | nothing | **keep** | The notes don't mention tooltip cleanup. |
| `argon-combat-panel-injection` | yes | yes | nothing | **keep** | No add-button or multi-attack API was announced. |
| `argon-combat-target-picker-reuse` | yes | yes | nothing | **keep** | No public pickTargets API is mentioned. |
| `argon-combat-weapon-set-seed` | yes | yes | nothing | **keep** | The notes don't change default weapon sets. |
| `argon-combat-rerender-cleanup` | yes | yes | nothing | **keep** | The notes don't say Argon now disposes old buttons. |
| `argon-combat-hud-follows` | yes | yes | nothing | **keep** | The notes don't change follow behaviour. |
| `argon-shared-uses-badge` | yes | yes | nothing | **keep** | We re-render the buttons ourselves. Fewer Argon refreshes make this more needed, not less. |
| `argon-collapse-on-area-placement` | yes | yes | nothing | **keep** | The notes don't mention collapsing panels during placement. |
| `argon-tooltip-click-through` | yes | yes | nothing | **keep** | CSS only; the notes don't mention tooltips. |
| `argon-combat-offhand-slot-dup` | yes | yes | nothing | **keep** | The notes don't change the off-hand slot. |
| `argon-combat-picker-cue-position` | yes | yes | nothing | **keep** | The notes don't change the picker label. |
| `argon-combat-tooltip-refresh` | yes | yes | nothing | **keep** | The notes don't mention tooltip refresh or mouseleave. |
| `argon-combat-drawer-near-button` | yes | yes | nothing | **keep** | The notes don't mention drawer positioning. |
| `argon-light-pick-collapse-panels` | yes | yes | nothing | **keep** | The notes don't mention collapsing panels on a canvas pick. |
| `argon-creatures-strip-float` | yes | yes | nothing | **keep** | The notes don't change the HUD layout. |
| `argon-combat-drawer-restore-place` | yes | yes | nothing | **keep** | The notes don't mention drawer placement after a restore. |
| `argon-combat-stray-tooltip` | yes | yes | nothing | **keep** | The notes don't mention tooltip closing. |
| `argon-combat-movement-redraw` | yes | yes | nothing | **keep** | Argon's movement readout still doesn't redraw on effect changes. Fewer refreshes make this more needed. |
| `argon-combat-drawer-turn-close` | yes | yes | nothing | **keep** | The notes don't change drawer state at a turn change. |
| `combat-argon-portrait-conditions` | yes | yes | nothing | **keep** | The notes don't mention portrait conditions. |
| `riders-argon-ritual-adept-list` | yes | yes | nothing | **keep** | The notes don't mention ritual listing. |
| `combat-argon-pip-settle` | yes | yes | nothing | **keep** | The notes don't say the pip-painting bug was fixed. |
| `aoe-argon-handle-bind` | yes | yes | nothing | **keep** | No bind filter was added. |
| `core-combat-helper-token-control` | yes | yes | nothing | **keep** | The notes don't mention re-binding after a token is deleted. |

Retiring an adjustment is always a hand step: remove it, run the module's check, confirm at the table, then delete its row from `foundry/adjustments.yml`.

## Steps

1. Update enhancedcombathud from 5.0.1 to 5.0.2.
2. Run make foundry-adjustments-check, make foundry-combat-check and make foundry-transform-check.
3. Run make foundry-riders-check, make foundry-aoe-check, make foundry-senses-check and make foundry-creatures-check.
4. At the table, Full Attack: confirm the follow-ups appear after a swing, pips grey as they are used, and Off-hand slot hiding works.
5. At the table, Wild Shape: confirm the Bonus bar shows Return/Change Form and the Bonus pip stays spent after the shift.
6. At the table, Metamagic: spend Font of Magic and confirm the Metamagic badges update.
7. At the table, Cosmic Omen: read the stars and confirm the omen badge on the Reaction bar changes without a manual refresh.
8. At the table, Dash: confirm the movement readout updates and Argon drawers still open above their buttons.
9. If any check fails or a HUD feature regresses, restore the 5.0.1 backup and hold the update until a fix lands.

## Verify

- [ ] `make foundry-aoe-check`
- [ ] `make foundry-combat-check`
- [ ] `make foundry-creatures-check`
- [ ] `make foundry-riders-check`
- [ ] `make foundry-senses-check`
- [ ] `make foundry-transform-check`
- [ ] `make vtt-up`, open each world, and click through what the areas above name — the smoke test cannot press buttons

## Rollback

- a module: Setup → the package's own backup, or the pre-update tar from `make vtt-down`
- the system or core: `make foundry-restore SNAP=<snapshot>` — a launched world has already migrated; restoring the code alone is not enough
