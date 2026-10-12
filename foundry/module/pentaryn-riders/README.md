# Pentaryn Feature Riders (`pentaryn-riders`)

**Read this when:** Elemental Adept, Elemental Affinity, Potent Spellcasting or the Healer feat
isn't adding what it should, Battle Medic misbehaves, a Ritual Adept / concentration / Arcane
Recovery / Argon HUD tidy-up acts oddly, or you are changing or calling `pentaryn-riders`.
**Not this file:** how every addon is built → `context/foundry/addon-blueprint.md` · the
migration record → `context/plans/addon-blueprint-2026-10/migrate-pentaryn-riders.md`.

dnd5e leaves some feature riders for the player to do by hand. This module does them. The rules
live in one table, `RULES` in `riders-core.mjs`, keyed by **feature identity** (the dnd5e
`system.identifier`, the PHB compendium source, or the item name with any "(Fire)" suffix
ignored). A rider is on only while the actor has the feature item. It also carries a few dnd5e and
Argon table fixes (rituals, concentration, cast flow, HUD tidy-ups). Requires dnd5e 6.0 (verified 6.0.6).

## What the player sees

| Feature | What happens | Where you see it |
|---|---|---|
| **Elemental Adept** (typed) | Damage dice of your **spells** of the chosen type get `min2` (a 1 counts as 2); the damage tray starts with the target's resistance to that type **ignored** (the GM can click it back on; re-calculating and Apply keep that). | `8d6min2`; a note under the dice row; the tray's resistance icon pressed. |
| **Elemental Affinity** (typed) | +CHA **once per casting** to a spell of your type (Scorching Ray: first damage roll only; a save spell re-rolled from its card gets it again). | `+ 5[Elemental Affinity]` and the card note. |
| **Potent Spellcasting** (Druid *Elemental Fury* / Cleric *Blessed Strikes*) | +WIS on that class's **cantrip** damage; a cantrip with no class uses the actor's only spellcasting class. | `+ 4[Potent Spellcasting]`. |
| **Healer** | Spell healing dice reroll 1s once (`r1`); temp/max HP rolls are left alone. | `2d8r1`. |
| **Healer → Battle Medic** | Target one creature and use the activity: dnd5e spends a kit use, the **target** spends its largest Hit Die, the healer rolls it (1s rerolled) + PB, the target regains that. | Chat roll; a toast with HP regained (and Hit Dice left, if the healer could see the sheet). |
| **Hit Dice − / +** | Beside *Hit Dice* on the character sheet, outside edit mode: spend or regain one die, largest first. | Greyed out when there is nothing to spend or regain. |
| **Ritual Adept** (wizard) | Unprepared ritual spells get a **"Rituals (no slot)"** group on Argon's Action-bar Cast Spell panel; casting one starts with *Consume Spell Slot* unticked. | HUD accordion group; the unticked box. |
| **Longer casts** (any caster) | Spells taking a minute or more (Animate Dead) get a **"Longer casts (1 min+)"** group on that panel. | HUD accordion group. |
| **Concentration summons** | A token summoned by a concentration spell leaves the map when that concentration ends; the *Lost Concentration* card's icon-only button gets its words. | The sphere goes; "Break Concentration" beside ⦸. |
| **Concentration saves** | A failed save ends concentration at once, unless Legendary Resistance, Indomitable, a Mind Sharpener or Bardic Inspiration could still turn it; the card shows "DC n · Failed / Success". | The result line under the roll. |
| **Cast flow** | A summon keeps the sidebar on its tab and says "Click the map to place X"; summons open with *Place Summons* ticked; a self-only card (Shield) drops stale targets; a typed number counts on the first Use click; a wildcard summon image previews as a real one; restoring a slot (Pearl of Power) opens on the highest spent level; after Arcane Recovery the owner picks the slots (PHB budget enforced). | Dialog defaults, the Arcane Recovery window. |
| **Argon tidy-ups** | Badges of buttons spending another item's uses (Metamagic → Font of Magic) refresh; open panels collapse before an area or summon placement; Metamagic opens no target picker; spell tooltips use the spell's roll data (Scorching Ray: 3 rays); the hover tooltip lets clicks through. | The HUD behaves. |

## Settings

All world, Boolean, default on, read live (no reload needed), in this order in *Configure Settings*:

| Key | What it does |
|---|---|
| `rituals` | Ritual Adept's Rituals group and the unticked slot. |
| `longCasts` | The Longer casts group. |
| `concentrationSummons` | Summoned tokens leave with their concentration. |
| `concentrationAutoBreak` | A failed concentration save ends it; the DC / result line. |
| `castDefaults` | Place Summons ticked; self-only cards drop stale targets. |
| `arcaneRecovery` | The Arcane Recovery picker after the feature is used. |
| `enabled` | The damage and healing riders, the tray preset and Battle Medic. |
| `hdControls` | The sheet's Hit Dice − / + (a change re-renders open character sheets). |

## API — game.pentaryn.riders

Canonical: `game.modules.get("pentaryn-riders").api`; `game.pentaryn.riders` is the same frozen
object. Ask it: `describe()` (offline: `test/golden/describe.json`), `settings()`, `selftest()`.

| Method | Writes | Returns |
|---|---|---|
| `inspect(ref, { as })` | — | `{ actor, rows, hd, settings, concentrationSummons }` plain JSON, depth ≤ 4; throws `NOT_FOUND` / `AMBIGUOUS` / `BAD_ARGS`. With `as` (a user ref) a player view: `rows` and `hd` need OBSERVER, `concentrationSummons` is GM-only |
| `selftest()` | — | `{ ok, checks }` |
| `arcaneRecovery(ref)` | spell slots, one chat line | `{ ok, actor, recovered }` / `{ ok: false, code: "REFUSED" \| "NOT_FOUND" … }`; the picker without spending a use |
| `report(actor?)` | — | rows `{ actor, rule, items, types?, status, manual?, handAdded?, battleMedic? }` (+ `console.table`); no actor = every character |
| `featuresOf(actor)` | — | `{ key, rule, items, types }[]` — `items` are **live** Item documents |
| `setType(target, type, ruleKey?)` | `flags.pentaryn-riders.damageType` | names of the items set; throws on an empty type |
| `retireManual(actor)` | the flag; deletes Affinity's damage activities | `"<item>: <activity>"[]` |
| `installBattleMedic(actor, { replace })` | the Healer feat's activities | `{ ok, item, kit, kitFound, updated, removed }` / `{ ok: false, why }` |
| `battleMedic(healer, token)` | the patient's Hit Die and HP | `{ faces, healed, hp, value, max }` / `null` — runs the flow without spending the kit |
| `spendHitDie(actor, { faces })` / `restoreHitDie(actor)` | Hit Dice `spent` | the faces, or `null` |
| `hdPools(actor)` | — | `{ id, faces, value, spent }[]` |
| `preview(formula, opts)` | — | the formula with a rider applied (`core.transformFormula`) |
| `rules`, `core` | — | frozen copies of the `RULES` table and the riders-core exports |

`ref` is an Actor, Token, UUID, 16-character id or exact name — never a substring. The legacy
members (every row but the first three) keep their old signatures: they take **documents**, a name
string is not resolved, and the writing ones return their old shapes, not `ok()/fail()`.

```js
const R = game.pentaryn.riders;
R.report();                                          // every PC: riders, types, Battle Medic state
await R.setType(game.actors.getName("Marrith Ashcroft"), "fire");
await R.retireManual(marrith);                       // Affinity's click-to-add +CHA activities go
await R.installBattleMedic(marrith);                 // one Battle Medic activity on the Healer feat
R.inspect("Marrith Ashcroft").rows;                  // the same rows, plain, by name
```

## Data written

| Where | What |
|---|---|
| Item flag `flags.pentaryn-riders.damageType` | a typed feature's type (string or array), by `setType` / `retireManual` |
| Damage / healing ChatMessage `flags.pentaryn-riders` | `{ applied, ignoreResistance, origin, detail }` (`riderFlag`): the once-per-casting guard, the card note, the tray preset |
| Battle Medic roll message `flags.pentaryn-riders` | `{ flow: "battle-medic", target, faces }` |
| Activity flag `flags.pentaryn-riders.flow` | `"battle-medic"` on the activity `installBattleMedic` builds |
| Token flag `flags.pentaryn-riders.concentration` | the uuid of the concentration effect that keeps a summon |
| Documents | class `system.hd.spent` / NPC `system.attributes.hd.spent`; HP via `applyDamage`; `system.spells.spellN.value` (Arcane Recovery); a concentration save card's `system.outcome = "broken"`; summoned tokens deleted |

## Flags other modules read

n/a — no other module reads this module's flags. It reads none of theirs.

## Events

n/a — emits none. Listens to (in this order, `test/golden/hooks.json`): `dnd5e.preUseActivity`,
`dnd5e.summonToken`, `deleteActiveEffect`, `dnd5e.renderChatMessage`, `createChatMessage`,
`updateItem`, `dnd5e.preCreateMeasuredTemplate`, `dnd5e.preSummon`, `renderItemButtonArgonComponent`,
`changeSidebarTab`, `dnd5e.postSummon`, `renderActivityUsageDialog`, `dnd5e.postUseActivity`,
`dnd5e.postDamageRollConfiguration`, `dnd5e.preCalculateDamage`, `renderCharacterActorSheet`.

## Patches and adjustments

Every wrap is in `patches.mjs`, through the kit's `wrapMethod`, listed by `describe().patches`:

| Patch | Marker | Row |
|---|---|---|
| Argon `ButtonPanelButton#_renderInner` (Rituals, Longer casts) | `Symbol.for("pentaryn-riders.ritualsWrapped")` | `riders-argon-ritual-adept-list` |
| `TextEditor.implementation.enrichHTML` (tooltip roll data) | `_prItemRollData` | `riders-argon-tooltip-item-rolldata` |
| dnd5e `SummonActivity#_prepareUsageConfig` (Place Summons) | `_prPlaceDefault` | `riders-summon-place-default` |
| dnd5e `SummonActivity#getPlacement` (wildcard preview) | `_prWildcard` | `riders-summon-wildcard-preview` |
| Argon dnd5e item button `targets` getter (per prototype, at first render) | `_prTargets` | `riders-argon-metamagic-no-picker` |
| Argon dnd5e item button `getTooltipData` (per prototype) | `_prTooltip` | `riders-argon-tooltip-item-rolldata` |

Non-patch rows: `argon-shared-uses-badge`, `argon-collapse-on-area-placement`,
`argon-tooltip-click-through` (CSS on Argon's `#tooltip`), `dnd5e-concentration-summons`,
`dnd5e-concentration-auto-break`, `dnd5e-summon-keeps-sidebar`, `dnd5e-restore-slot-default`,
`dnd5e-usage-dialog-first-click`, `dnd5e-chat-message-types`. Nothing in Argon's files is edited.

## Two sessions / who writes

- **Damage riders, tray preset, Battle Medic roll, Arcane Recovery, auto-break**: the roller's
  (owner's) own client; nothing runs twice.
- **Battle Medic on a target the player doesn't own**: the active GM writes, through the query
  `pentaryn-riders.battleMedic` (registered on every client; the kit's `guarded` with
  `sender: "any"`: a GM receiver, any sender). The handler checks the sender owns the healer, the
  healer has the Healer feat, and clamps the amount to the die spent + PB; it logs one audit line
  (`battle medic relay`) or one warn per refusal. The server sends a query to **every** tab of the
  GM's account (the MCP bridge tab and a GM browser tab): see Pitfalls.
- **Concentration summon cleanup**: the active GM's client (with no GM online, the user who ended
  the concentration) deletes the tokens.

## Extending

**A damage or healing rider** is a `RULES` row in `riders-core.mjs` plus a fixture in
`test/core-fixtures.mjs`: `match` (`identifiers`, `sources`, `names`), optional `types`, `when`
(`spell`, `cantrip`, `classIdentifier`, `rolls`: `"damage"` / `"healing"`, `rollTypes`), and
`effect` (`dieModifier` such as `"min2"`, `bonus`: an ability key, `once: "casting"`,
`ignoreResistance`, `unlessCarried`).

**Which riders module?**

| You want… | Goes in |
|---|---|
| A feat or spell rider on a damage or healing roll, keyed by feature identity | `pentaryn-riders` `RULES` |
| A once-per-turn rider offered on an attack card (Sneak Attack, Divine Smite…) | `pentaryn-combat` `TURN_RIDERS` |
| A turn-flow or Argon action-bar change | `pentaryn-combat` |
| A dnd5e cast-flow or concentration fix that is not a rider | here, as a feature file (or a new module if it grows) |

**A new behaviour**: a feature file with `install(reg, ctx)` / `uninstall()`, listed in `FEATURES`
in `riders.mjs` at the place its hook order needs; a wrap goes in `patches.mjs` with a marker and a
`riders-…` adjustments row; a setting is a `SETTINGS` row with literal labels.

## Pitfalls

- **Typed features need a type**: `flags.pentaryn-riders.damageType`, else the name's
  "(Fire)", else exactly one type among the item's damage activities. Without one the rider stays
  off, `report()` says **NO TYPE**, and the roller's console warns.
- **Potent Spellcasting skips a cantrip that already adds WIS** in its damage formula (a hand
  edit; `report()` lists them under `handAdded`). Elemental Affinity has no such skip.
- **Battle Medic in two GM tabs** (the bridge tab plus a GM browser tab): the relay runs in both
  and heals twice, spending two Hit Dice (combat-riders-41, open).
- `battleMedic(healer, token)` wants a Token placeable; an Actor reads as "no Hit Dice".
- `preview()` is a string transform for checking; the live riders edit real roll terms.

## Files

Load order is `FEATURES` in `riders.mjs`, and it decides who runs first on a shared hook:
`dnd5e.preUseActivity` runs rituals' slot untick, cast-flow's restore-slot default and stale-target
drop, then the Battle Medic veto; `dnd5e.renderChatMessage` runs the break label and the
concentration line before the card note; `dnd5e.postUseActivity` runs Arcane Recovery before Battle Medic.

| File | Role |
|---|---|
| `riders.mjs` | entry: wiring, `FEATURES`, init (settings, relay), ready (patches, publish) |
| `riders-core.mjs`, `core/hit-dice.mjs` | pure: constants, `RULES`, rider planning, Hit Dice / Battle Medic / report kernels |
| `rituals-core.mjs`, `table-core.mjs` | pure: Ritual Adept and Longer casts; concentration, Argon and cast-flow helpers |
| `settings.mjs` | `SETTINGS`, `settingOr` / `settingRaw` |
| `api-manifest.mjs`, `api.mjs` | the API rows; implementations, `inspect`, `selftest` |
| `shapes.mjs`, `argon.mjs` | adapters: dnd5e documents and Hit Dice writes; `ui.ARGON` / `CONFIG.ARGON` |
| `patches.mjs` | the six wraps |
| `rituals.mjs`, `concentration.mjs`, `argon-tidy.mjs`, `cast-flow.mjs` | features: table fixes |
| `damage-riders.mjs`, `card-note.mjs`, `tray-preset.mjs`, `battle-medic.mjs`, `hd-sheet.mjs` | features: the riders, Battle Medic, the sheet − / + |
| `riders.css`, `lang/en.json`, `lib/` | styles (`.pr-*`), strings, the vendored kit |

## Tests

`node test/run.mjs` from the module folder: every `test/*.test.mjs` (node:test, one process each)
against a synthetic world (`test/fixtures/world.mjs`), then the `LEGACY` self-running fixture
suites of the three cores. One golden: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then read
the diff. Also `make foundry-riders-check`.

## Sync

`make foundry-riders-sync`, then reload (a `module.json` change needs a Foundry restart). Live
smoke: `game.pentaryn.riders.selftest().ok`, `describe().version` equals the manifest's; Fireball as
Marrith shows `min2` + `+CHA` and the note; Battle Medic from a player on another PC heals once.
