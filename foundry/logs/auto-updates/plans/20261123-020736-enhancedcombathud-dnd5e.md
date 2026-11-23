<!-- fresh — run 20261123-020736 -->
# Update plan — enhancedcombathud-dnd5e 5.2.3 → 6.0.0

> Written by the Saturday updater's analysis tier from release notes (third-party text) and our source, by a model with no tools; validated, but **read every step before running it**, and never hand this file to an agent as instructions.

**Status:** fresh — run 20261123-020736  
**Decision this run:** hold — analysis recommends hold — Nothing confirmed. This is a major bump, and our special-action wraps depend on private internals: _onLeftClick, createChatMessage and the i18n keys. If any check that was removed is one we rely on, the wraps could act differently.
  
**Impact:** none (confidence low) · **recommendation:** hold

## Starting state

- `enhancedcombathud-dnd5e` 5.2.3 installed, 6.0.0 available (major bump)
- release notes: https://github.com/theripper93/enhancedcombathud-dnd5e/releases
- our code that leans on it: pentaryn-combat, pentaryn-riders, pentaryn-transform

## Preconditions

- [ ] the world is down (`make vtt-down`) and the OneDrive snapshot is fresh
- [ ] `make foundry-adjustments-check` is green
- [ ] your working tree for each module below is committed

## Impact by area

| Area | Impact | What breaks | Ours |
|---|---|---|---|
| pentaryn-combat | none | Nothing confirmed. This is a major bump, and our special-action wraps depend on private internals: _onLeftClick, createChatMessage and the i18n keys. If any check that was removed is one we rely on, the wraps could act differently. | `foundry/module/pentaryn-combat/turnflow/action-buttons.mjs:109` |
| pentaryn-combat | none | The swing-pip override reads the prototype maxActions/currentActions getters and returns early if they are gone. If 6.0.0 turns them into plain values, the swing pips stop quietly and nothing throws. | `foundry/module/pentaryn-combat/hud/bars.mjs:35` |
| pentaryn-riders | none | Nothing confirmed. The Rituals and Longer casts groups need _spells, _parent and showPreparedOnly. The omen badge reads isActivity and _item. Each is guarded, so a change would hide the group or badge without an error. | `foundry/module/pentaryn-riders/rituals.mjs:69` |
| pentaryn-transform | none | Nothing confirmed. The seat-pip wrapper reads Argon's maxActions, which returns null out of combat. If that inCombat check is gone, our fallback only runs less often, which is harmless. The Wild Shape and Starry Form subclasses still depend on CONFIG.ARGON. | `foundry/module/pentaryn-transform/hud-panels.mjs:198` |

## Still needed?

| Adjustment | Working | Needed | Native now | Action | Why |
|---|---|---|---|---|---|
| `argon-panel-injection` | unknown | yes | nothing stated; no add-button API or transform panel mentioned | **keep** | Major bump. The subclassing of CONFIG.ARGON.MAIN.BUTTONS classes needs checking at the table, and the checkBonus shim note in the registry may be what was removed. |
| `argon-combat-panel-injection` | unknown | yes | nothing; no multi-attack button mentioned | **keep** | The render hooks and the _buttons array are not mentioned. Confirm Full Attack and the follow-ups appear. |
| `argon-combat-swing-pips` | unknown | yes | nothing; no Extra Attack counting mentioned | **investigate** | Depends on the prototype getters, and a major version could change them. It falls back silently if they are missing. |
| `argon-combat-rerender-cleanup` | unknown | yes | nothing stated about disposing buttons | **keep** | Best-effort and wrapped in try. Watch for leaked drawers after a re-render. |
| `argon-combat-special-actions` | unknown | yes | nothing; no action spend for special actions mentioned | **investigate** | Finds buttons by createChatMessage and by i18n names. A major rewrite could rename either. |
| `argon-combat-reaction-slot` | unknown | yes | nothing | **keep** | Depends on _isWeaponSet and _onLeftClick. Confirm the Opportunity Attack label at the table. |
| `argon-shared-uses-badge` | yes | yes | nothing stated | **keep** | Uses only ui.ARGON.itemButtons and render(), and is guarded. |
| `argon-combat-offhand-slot-dup` | yes | yes | nothing | **keep** | CSS toggle on _isWeaponSet slots only. No change mentioned. |
| `argon-combat-item-button-bonus-pip` | yes | yes | nothing | **keep** | Driven by dnd5e hooks and Argon's isActionUsed/updateActionUse. |
| `argon-combat-item-button-spell-pips` | yes | yes | nothing; no pip restore on bind mentioned | **keep** | Same panel API as before. Confirm the pips repaint after a re-bind. |
| `argon-riders-long-casts` | unknown | yes | nothing; minute/hour spells not mentioned | **keep** | Shares the _renderInner wrap with the Rituals list. Verify alongside it. |
| `argon-combat-movement-redraw` | yes | yes | nothing stated | **keep** | Guarded by a typeof check on updateMovement. |
| `argon-riders-omen-badge` | unknown | yes | nothing | **keep** | Reads isActivity and _item, with a fallback. Confirm the badge on the Cosmic Omen button. |
| `riders-argon-ritual-adept-list` | unknown | yes | nothing; no ritual listing mentioned | **investigate** | Reads the private _spells, _parent and showPreparedOnly. Removing checks could change the spell button. |
| `riders-argon-metamagic-no-picker` | unknown | yes | nothing | **keep** | Lazy, guarded wrap of the targets getter. If the getter is gone, the wrap is skipped. |
| `riders-argon-tooltip-item-rolldata` | yes | unknown | unconfirmed whether rollData is passed now | **keep** | Adds rollData only when it is missing, so it is harmless either way. Check the Scorching Ray tooltip. |
| `dnd5e-riders-omen-die-decides` | yes | yes | nothing; the dnd5e dialog is unchanged by this package | **keep** | The dialog part is dnd5e's. Only the HUD badge touches Argon. |

Retiring an adjustment is always a hand step: remove it, run the module's check, confirm at the table, then delete its row from `foundry/adjustments.yml`.

## Steps

1. Keep the package at 5.2.3 for now. The bump is major and the notes are vague.
2. In a test copy of the world, update enhancedcombathud-dnd5e to 6.0.0, check its required core Argon and dnd5e versions, and update those too if needed.
3. Run make foundry-adjustments-check, then make foundry-combat-check, make foundry-riders-check and make foundry-transform-check.
4. Load the world. Confirm the console shows no errors on ready and no 'HUD composition failed' warnings.
5. At the table, check that Full Attack shows and the swing pips count 2, then 1, then 0 for an Extra Attack character.
6. Check that Dash, Dodge and Hide spend the Action pip and apply their effects.
7. Check that the Reaction bar weapon reads Opportunity Attack and spends the Reaction.
8. Check a wizard's Cast Spell panel for the Rituals and Longer casts groups, and check that a Metamagic button opens no target picker.
9. Check that Wild Shape and Starry Form appear on the Bonus bar, and that a seated druid form shows its pips.
10. Check the Cosmic Omen badge on the HUD and the Scorching Ray tooltip (it should show 3 rays).
11. If everything passes, mark the package reviewed and apply it.
12. Rollback: if any check fails or a HUD feature misbehaves, restore the 5.2.3 backup and keep holding the package.

## Verify

- [ ] `make foundry-combat-check`
- [ ] `make foundry-riders-check`
- [ ] `make foundry-transform-check`
- [ ] `make vtt-up`, open each world, and click through what the areas above name — the smoke test cannot press buttons

## Rollback

- a module: Setup → the package's own backup, or the pre-update tar from `make vtt-down`
- the system or core: `make foundry-restore SNAP=<snapshot>` — a launched world has already migrated; restoring the code alone is not enough
