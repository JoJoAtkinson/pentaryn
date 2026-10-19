# Pentaryn Feature Riders (`pentaryn-riders`)

**Read this when:** Elemental Adept, Elemental Affinity, Potent Spellcasting or the Healer feat
isn't adding what it should, Battle Medic misbehaves, a Ritual Adept / concentration / Arcane
Recovery / Argon HUD tidy-up acts oddly, the Transmuter's Stone benefit won't switch, a cast fails with
"the effect that is concentrated on … does not exist", or you are changing or calling `pentaryn-riders`.
**Not this file:** how every addon is built → `context/foundry/addon-blueprint.md` · the
migration record → `context/plans/addon-blueprint-2026-10/migrate-pentaryn-riders.md`.

dnd5e leaves some feature riders for the player to do by hand. This module does them. The rules
live in one table, `RULES` in `riders-core.mjs`, keyed by **feature identity** (the dnd5e
`system.identifier`, the PHB compendium source, or the item name with any "(Fire)" suffix
ignored; an item whose identifier or source names a row matches that row only, so a druid's
"Potent Spellcasting" is never the cleric's). A rider is on only while the actor has the feature item. It also carries a few dnd5e and
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
| **Cast flow** | A summon keeps the sidebar on its tab and says "Click the map to place X"; summons open with *Place Summons* ticked; a self-only card (Shield) drops stale targets; a typed number counts on the first Use click; a wildcard summon image previews as a real one; restoring a slot (Pearl of Power) opens on the highest spent level; after Arcane Recovery the owner ticks the slots to recover in one window: a row per slot level 1–5, "n of m left", a locked ticked box per slot still there and a box per spent slot, opening with the highest that fit ticked (PHB budget, +1 with an attuned Arcane Grimoire, enforced). A D&D Beyond import's Arcane Recovery (`ddbmacro` activity, `ddb.feat.arcaneRecovery`) no longer opens its own second picker: that use's `subsequentActions` is set false (LdPm43). A second use while the window is open opens no second one. | Dialog defaults, the Arcane Recovery window. |
| **Rays and darts** (Scorching Ray, Magic Missile) | The usage card gets one button per ray / dart: 3, plus one per slot level above the spell's (a wand's extra charges count). Target one creature, click the next button: that ray's attack (Scorching Ray) or that dart's damage (Magic Missile) is rolled at it and threaded under the card. dnd5e's own automatic first roll and its card button fill a slot too; a rolled slot names its target. More than one target refuses the click. | "Ray 1 · Thorgrim", "Ray 2", "Ray 3" under the card's buttons (owners only). |
| **One usage dialog per spell** | A quick double click on Use opens one dialog, not two (the second click brings the open one forward). A dialog left open while the concentration it named ended (cast from elsewhere, dropped) no longer fails with "The effect that is concentrated on and to be replaced does not exist.": below the limit nothing is replaced, at the limit the one held concentration is. | The cast goes through. |
| **Pick-one benefits** (Transmuter's Stone) | A feature's benefits are passive effects in the sheet's **Effects** tab; turning one on turns the others of its group off (two may be on when its `max` allows, e.g. Wizard 10). The data comes from a fix script (`scripts/foundry/fixes/2026-10-19-transmuters-stone.js`). | Effects tab → Passive: one stone benefit lit. |
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
| `arcaneRecovery` | The Arcane Recovery picker after the feature is used (and ddb-importer's own Arcane Recovery macro skipped for that use; off → ddb's picker runs as imported). |
| `enabled` | The damage and healing riders, the tray preset and Battle Medic. |
| `hdControls` | The sheet's Hit Dice − / + (a change re-renders open character sheets). |
| `projectiles` | One button per ray / dart on Scorching Ray and Magic Missile cards. |

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
| `setType(target, type, ruleKey?)` | `flags.pentaryn-riders.damageType` | names of the items set (only items whose rule lists the type; an Item no typed rule matches is not set); throws on an empty type, and `BAD_ARGS` naming the allowed types when no targeted rule lists it |
| `retireManual(actor)` | the flag; deletes Affinity's damage activities | `"<item>: <activity>"[]` |
| `installBattleMedic(actor, { replace })` | the Healer feat's activities | `{ ok, item, kit, kitFound, updated, removed }` / `{ ok: false, why }` |
| `battleMedic(healer, token)` | the patient's Hit Die and HP | `{ faces, healed, hp, value, max }` / `null` — runs the flow without spending the kit |
| `spendHitDie(actor, { faces })` (faces a number or numeric string) / `restoreHitDie(actor)` | Hit Dice `spent` | the faces, or `null` |
| `hdPools(actor)` | — | `{ id, faces, value, spent }[]` |
| `preview(formula, opts)` | — | the formula with a rider applied (`core.transformFormula`) |
| `rules`, `core` | — | frozen copies of the `RULES` table and the riders-core exports |

`ref` is an Actor, Token, UUID, 16-character id or exact name — never a substring. The legacy
members (every row but the first three) keep their old signatures and shapes (the writing ones do
not return `ok()/fail()`); their actor argument takes the same refs, and a ref that matches nothing
answers `null` (`setType` still takes an Item too; `battleMedic` still wants a Token).

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
| ActiveEffect flag `flags.pentaryn-riders.choice` | `{ group, max }` on a pick-one benefit (authored by a fix script, read here); `max` a number or a roll-data formula |
| Activity flag `flags.pentaryn-riders.flow` | `"battle-medic"` on the activity `installBattleMedic` builds |
| Token flag `flags.pentaryn-riders.concentration` | the uuid of the concentration effect that keeps a summon |
| Summoned token `flags.pentaryn-riders.claims.summonCleanup` | the socket id of the one tab that deletes that scene's summons (the kit's `claimDocument`, riders-async-3); it goes with the token |
| Concentration save card `flags.pentaryn-riders.claims.autoBreak` | the socket id of the one tab that ends the concentration (the kit's `claimMessage`, riders-async-1) |
| Patient flag `flags.pentaryn-riders.relay.<requestId>` | the GM tabs' claim stamps (`claims.<socketId>`, removed when answered) and the winner's `{ result \| error, at }`; the last five kept |
| Documents | class `system.hd.spent` / NPC `system.attributes.hd.spent`; HP via `applyDamage`; `system.spells.spellN.value` (Arcane Recovery); a concentration save card's `system.outcome = "broken"`; summoned tokens deleted; a pick-one effect's siblings `disabled: true` |

## Flags other modules read

n/a — no other module reads this module's flags. It reads none of theirs.

## Events

n/a — emits none. Listens to (in this order, `test/golden/hooks.json`): `dnd5e.preUseActivity`,
`dnd5e.summonToken`, `deleteActiveEffect`, `dnd5e.renderChatMessage`, `createChatMessage`,
`updateItem`, `dnd5e.preCreateMeasuredTemplate`, `dnd5e.preSummon`, `renderItemButtonArgonComponent`,
`changeSidebarTab`, `dnd5e.postSummon`, `renderActivityUsageDialog`, `dnd5e.postUseActivity`,
`dnd5e.preActivityConsumption`, `dnd5e.postDamageRollConfiguration`, `dnd5e.preCalculateDamage`,
`renderCharacterActorSheet`, then the projectile buttons' `dnd5e.renderChatMessage`, `createChatMessage`,
`deleteChatMessage`, then effect-choices' `updateActiveEffect`.

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
`dnd5e-usage-dialog-first-click`, `dnd5e-chat-message-types`, `argon-riders-long-casts`,
`dnd5e-riders-arcane-recovery-picker`, `dnd5e-riders-projectile-buttons`, `dnd5e-riders-damage-tray-preset`,
`dnd5e-riders-roll-term-riders`, `dnd5e-riders-sheet-hit-dice`, `core-riders-query-battle-medic`,
`dnd5e-usage-dialog-single`, `dnd5e-riders-effect-choices`.
Nothing in Argon's files is edited.

## Two sessions / who writes

- **Damage riders, tray preset, Battle Medic roll, Arcane Recovery, auto-break**: the roller's
  (owner's) own client; nothing runs twice. Auto-break also claims the save card first (the kit's
  `claimMessage`, key `autoBreak`), because two tabs on the roller's account (the MCP bridge tab and
  a GM browser tab) both pass the roller test: one tab ends the concentration, about 750 ms after
  the card posts (riders-async-1).
- **Battle Medic on a target the player doesn't own**: the active GM writes, through the query
  `pentaryn-riders.battleMedic` (registered on every client; the kit's `guarded` with
  `sender: "any"`: a GM receiver, any sender). The handler checks the sender owns the healer, the
  healer has the Healer feat, and clamps the amount to the die spent + PB; it logs one audit line
  (`battle medic relay`) or one warn per refusal. The server sends a query to **every** tab of the
  GM's account (the MCP bridge tab and a GM browser tab), so the payload carries a request id and the
  tabs claim it on the patient first: the first to stamp heals and records its result, the others
  wait (up to 7 s) and answer with it; a tab that arrives after the result is recorded answers with
  it too and never heals (combat-riders-41).
- **Pick-one benefits**: the clients of the user who toggled the effect (`userId === game.user.id`)
  turn its siblings off. The GM's two tabs may both do it; the write (`disabled: true`) is the same.
- **Concentration summon cleanup**: the active GM's client (with no GM online, the user who ended
  the concentration) deletes the tokens. Two tabs on that account both qualify, so per scene each
  claims the first stamped token first (the kit's `claimDocument`, key `summonCleanup`): one tab
  deletes that scene's summons, about 750 ms after the concentration ends (riders-async-3).

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

**Another multi-roll spell** (Eldritch Blast's beams, say) is a `PROJECTILES` row in
`riders-core.mjs`: `noun` (its `PENTARYN_RIDERS.projectiles.<noun>.*` strings), `roll` (`"attack"`
or `"damage"`, the activity type), `base` at `baseLevel`, one more per level above.

**A pick-one benefit** (choose one of N, change it later): one passive (`transfer`) effect per
benefit on the feature item, each with `flags.pentaryn-riders.choice = { group: "<name>", max }`;
`max` is a number or a formula such as `"min(2, 1 + floor(@classes.wizard.levels / 10))"`. An
always-on part of the feature is its own unflagged effect. Write it as a fix script with a dry run
(`scripts/foundry/fixes/`), not by hand.

**A new behaviour**: a feature file with `install(reg, ctx)` / `uninstall()`, listed in `FEATURES`
in `riders.mjs` at the place its hook order needs; a wrap goes in `patches.mjs` with a marker and a
`riders-…` adjustments row; a setting is a `SETTINGS` row with literal labels.

## Pitfalls

- **Typed features need a type**: `flags.pentaryn-riders.damageType`, else the name's
  "(Fire)", else exactly one type among the item's damage activities. Without one the rider stays
  off, `report()` says **NO TYPE**, and the roller's console warns.
- **Potent Spellcasting skips a cantrip that already adds WIS** in its damage formula (a hand
  edit; `report()` lists them under `handAdded`). Elemental Affinity has no such skip.
- **Battle Medic from an older client** (a payload with no request id) is still answered by every
  GM tab: two tabs heal twice. Reload the players' clients after a sync.
- `battleMedic(healer, token)` wants a Token placeable; an Actor reads as "no Hit Dice".
- **Summon cleanup reacts to concentration effects only**: an effect whose `concentrating` status
  was stripped before it was deleted leaves its summons on the map (dnd5e never does that).
- **A pick-one effect's siblings are on the same document**: the stone's effects all live on the
  feature item. An effect on the actor with the same group is a different parent and is not
  touched. A player who turns one off leaves none on; nothing turns another on.
- `preview()` is a string transform for checking; the live riders edit real roll terms.
- **A wand that will not cast** ("No uses on Magic Missile available to spend") is item data, not
  this module: its Cast activity points at a spell whose own activity spends the *spell's* uses
  with the slot off, so dnd5e ignores the wand's charges. Repoint the Cast activity at the PHB spell
  (`scripts/foundry/fixes/2026-10-19-wand-cast-spell.mjs`).
- **A ray / dart slot counts every roll under the card**, including one rolled by hand from the
  card's own button; a roll deleted from chat frees its slot.

## Files

Load order is `FEATURES` in `riders.mjs`, and it decides who runs first on a shared hook:
`dnd5e.preUseActivity` runs rituals' slot untick, cast-flow's restore-slot default, stale-target
drop and one-dialog veto, then the Battle Medic veto; `dnd5e.renderChatMessage` runs the break label and the
concentration line before the card note; `dnd5e.postUseActivity` runs Arcane Recovery before Battle Medic.

| File | Role |
|---|---|
| `riders.mjs` | entry: wiring, `FEATURES`, init (settings, relay), ready (patches, publish) |
| `riders-core.mjs`, `core/hit-dice.mjs`, `core/relay.mjs` | pure: constants, `RULES`, rider planning, Hit Dice / Battle Medic / report kernels, the relay's claim |
| `core/choices.mjs`, `core/usage.mjs` | pure: pick-one effect rules; the usage-dialog guards (one dialog, stale concentration) |
| `rituals-core.mjs`, `table-core.mjs` | pure: Ritual Adept and Longer casts; concentration, Argon and cast-flow helpers |
| `settings.mjs` | `SETTINGS`, `settingOr` / `settingRaw` |
| `api-manifest.mjs`, `api.mjs` | the API rows; implementations, `inspect`, `selftest` |
| `shapes.mjs`, `argon.mjs` | adapters: dnd5e documents and Hit Dice writes; `ui.ARGON` / `CONFIG.ARGON` |
| `patches.mjs` | the six wraps |
| `rituals.mjs`, `concentration.mjs`, `argon-tidy.mjs`, `cast-flow.mjs` | features: table fixes |
| `damage-riders.mjs`, `card-note.mjs`, `tray-preset.mjs`, `battle-medic.mjs`, `hd-sheet.mjs` | features: the riders, Battle Medic, the sheet − / + |
| `projectiles.mjs` | feature: one button per ray / dart on Scorching Ray and Magic Missile cards (`PROJECTILES` in riders-core) |
| `effect-choices.mjs` | feature: pick-one passive effects (the Transmuter's Stone) |
| `styles/riders.css`, `lang/en.json`, `lib/` | styles (`.pr-*`, and the `#tooltip` click-through rule), strings, the vendored kit (with `lib/argon-tooltip.css`, D7: listed in `styles`, inert for riders alone) |

## Tests

`node test/run.mjs` from the module folder: every `test/*.test.mjs` (node:test, one process each)
against a synthetic world (`test/fixtures/world.mjs`), then the `LEGACY` self-running fixture
suites of the three cores. One golden: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then read
the diff. Also `make foundry-riders-check`.

## Sync

`make foundry-riders-sync`, then reload (a `module.json` change needs a Foundry restart). Live
smoke: `game.pentaryn.riders.selftest().ok`, `describe().version` equals the manifest's; Fireball as
Marrith shows `min2` + `+CHA` and the note; Battle Medic from a player on another PC heals once.
