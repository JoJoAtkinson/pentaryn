# Pentaryn Feature Riders (`pentaryn-riders`)

**Read this when:** Elemental Adept, Elemental Affinity, Potent Spellcasting or the Healer feat
isn't adding what it should, Battle Medic misbehaves, a Ritual Adept / concentration / Arcane
Recovery / Argon HUD tidy-up acts oddly, the Transmuter's Stone benefit won't switch, a cast fails with
"the effect that is concentrated on … does not exist", the Spells tab shows only prepared spells (the
Prepared / All spells switch), an expired effect lingers grey on a sheet or Shield did not end on its
caster's turn, a summon died but the concentration stayed, the long-rest card (Cosmic Omen's "Read the
stars", "Review prepared spells") did not come or came twice, the Empower (1 SP) button is missing from a
sorcerer's damage card or rerolled the wrong dice, or you are changing or calling `pentaryn-riders`.
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
| **Prepared spells first** | The character sheet's Spells tab opens on what the character can cast today: prepared and always-prepared spells, cantrips, at-will, innate and pact spells, and spells cast from an item. A **Show: Prepared (n) · All spells (n)** switch sits above the search bar, with "*n* unprepared hidden"; *All spells* brings back the full list to prepare from. Each user's choice is remembered per character (it follows them to another browser). No switch when nothing would be hidden (a sorcerer, a non-caster). | The switch above the spell search; the hidden spells reappear in place, no re-render. |
| **Ritual Adept** (wizard) | Unprepared ritual spells get a **"Rituals (no slot)"** group on Argon's Action-bar Cast Spell panel; casting one starts with *Consume Spell Slot* unticked. | HUD accordion group; the unticked box. |
| **Longer casts** (any caster) | Spells taking a minute or more (Animate Dead) get a **"Longer casts (1 min+)"** group on that panel. | HUD accordion group. |
| **Concentration summons** | A token summoned by a concentration spell leaves the map when that concentration ends; the *Lost Concentration* card's icon-only button gets its words. The other way round too: a summon that drops to 0 HP ends the concentration that keeps it (the 2024 summon spells: the spirit disappears at 0 HP), so the token goes and the caster is free to concentrate on something else, with no corpse to loot. | The sphere goes; "Break Concentration" beside ⦸; one whispered line to the caster and the GM: "Talo's Elemental Spirit fell; concentration on Summon Elemental ends." |
| **Timed effects end on time** | World-wide: an effect whose duration ran out is **deleted**, not left grey on the sheet (`CONFIG.ActiveEffect.expiryAction = "delete"`; core's default keeps it as `expired`). And a reaction cast on yourself off your turn (Shield's *Imperceptible Barrier*, cast on the attacker's turn) ends at the start of **your** next turn, not the attacker's: its plain `turnStart` expiry becomes dnd5e's `sourceStart` as it is created, and the caster is recorded as the effect's source actor (`system.origin.actor`): dnd5e's own effect data leaves only the spell's compendium entry there, which resolves to nobody, so the barrier went at the first turn of the next round instead (Caven, last in initiative, 2026-11-07). Any `sourceStart` / `sourceEnd` effect without a recorded source gets one (Hold Person's effect ends on the caster's turn too). Effects you put on others keep their expiry; effects cast on your own turn and anything outside combat are left as they are. | The barrier is gone when your turn starts; nothing grey stays in the Effects tab. |
| **After a long rest** | One whispered card for the character's players: "Long rest: Talo", with a row per thing the rest offers. **Cosmic Omen**: *Read the stars* rolls 1d6 (even is Weal, odd is Woe), posts the roll and stores the omen on the feat until the next long rest; the row then names it. The stars are read once a day: every client's card redraws when the omen is stored or cleared, and a stale button that is still clicked answers the stored omen and rolls nothing. On the Combat HUD the Cosmic Omen reaction button gets a badge naming the omen (**Weal** / **Woe**): Argon draws one button per feat, which stands for both activities and is never greyed; its click opens dnd5e's "which activity?" dialog, where today's is badged and the other disabled. Only when Argon is set to split items into one button per activity (`explodeItemActivities`: always) is the omen's button badged "today's omen" and the other greyed. Use the feat with no omen rolled yet (offline for the rest, or the card closed) and the first use rolls it then and runs the day's activity; until then the die decides, and the UI says so: the "which activity?" dialog has one line above its buttons, *Read the stars (1d6): the die decides*, and both buttons (and Argon's) are badged *the die decides*. When the roll overrides the click, one notice names the face: "You picked Woe (Odd), but the stars rolled 2: Weal (even)." With an omen stored, click the wrong one and the day's runs instead, with one notice. **Prepared spells** (any caster whose spells prepare): *Review prepared spells* switches the Spells tab to All spells and opens the sheet there. No Portent row until a Diviner sits at the table. | The card after the rest; the Weal / Woe badge on the HUD button; the roll message. |
| **Empowered Spell** (sorcerer) | A spell's damage card gets one button, **Empower (1 SP)**, while the caster has a Sorcery Point left. One click spends the point through the feat's own activity (no dialog, no card of its own; Argon's Font of Magic badge follows), rerolls the dice that came up below their average (a d6's 1–3, a d8's 1–4), lowest first, up to the Charisma modifier, and posts the result as a **new** damage card under the usage card with the old card's targets and riders note; the old face stays struck through in the tooltip. New rolls are kept even when lower (the rule). The old card is marked *Superseded by Empowered Spell*: its apply tray is gone, so the GM applies the new roll and never both. Shift-click opens a small picker listing each die with its face, the one-click choice pre-ticked. No button when every die is at or above its average: one click would have nothing to do. Once a card has been applied from the tray the button goes, Sorcery Points or not. Should the new card fail to post after the point was spent, one warning says so and the old card stays live. | The button under the dice row; the new card's "Empowered Spell (1 SP): 2 → 5, 1 → 4" line; the retired card's line. |
| **Concentration saves** | A failed save ends concentration at once, unless Legendary Resistance, Indomitable, a Mind Sharpener or Bardic Inspiration could still turn it; the card shows "DC n · Failed / Success". | The result line under the roll. |
| **Cast flow** | A summon keeps the sidebar on its tab and says "Click the map to place X"; summons open with *Place Summons* ticked; a self-only card (Shield) drops stale targets; a typed number counts on the first Use click; a wildcard summon image previews as a real one; restoring a slot (Pearl of Power) opens on the highest spent level; after Arcane Recovery the owner ticks the slots to recover in one window: a row per slot level 1–5, "n of m left", a locked ticked box per slot still there and a box per spent slot, opening with the highest that fit ticked (PHB budget, +1 with a held Arcane Grimoire: equipped (or a loot item, which has no equipped field), attuned when it needs it, not in a container; enforced). A D&D Beyond import's Arcane Recovery (`ddbmacro` activity, `ddb.feat.arcaneRecovery`) no longer opens its own second picker: that use's `subsequentActions` is set false (LdPm43). A second use while the window is open is stopped before dnd5e spends it ("the slot picker is already open"). | Dialog defaults, the Arcane Recovery window. |
| **Rays and darts** (Scorching Ray, Magic Missile) | The usage card gets one button per ray / dart: 3, plus one per slot level above the spell's (a wand's extra charges count). Target one creature, click the next button: that ray's attack (Scorching Ray) or that dart's damage (Magic Missile) is rolled at it and threaded under the card. Nothing rolls by itself after the cast (dnd5e's automatic first roll is skipped), so each ray / dart is one click and one dialog; a roll from the card's own button fills a slot too, and a rolled slot names its target. More than one target refuses the click. When the chat log is not on screen, the cast opens the sidebar on **Chat**, where the card stays (a chat pop-up card fades after 5 s). | "Ray 1 · Thorgrim", "Ray 2", "Ray 3" under the card's buttons (owners only). |
| **One usage dialog per spell** | A quick double click on Use opens one dialog, not two (the second click brings the open one forward); the same for the "which activity?" choice of any item with several activities (Produce Flame's Cast / Hurl Fire). A dialog left open while the concentration it named ended (cast from elsewhere, dropped) no longer fails with "The effect that is concentrated on and to be replaced does not exist.": below the limit nothing is replaced and the cast goes through; at the limit nothing is cast and a notice asks the player to reopen the dialog, which then names the concentration held now (it never ends one the player did not pick). | The cast goes through, or the reopen notice. |
| **Pick-one benefits** (Transmuter's Stone) | A feature's benefits are passive effects in the sheet's **Effects** tab; turning one on turns the others of its group off (two may be on when its `max` allows, e.g. Wizard 10). The data comes from a fix script (`scripts/foundry/fixes/2026-10-19-transmuters-stone.js`). | Effects tab → Passive: one stone benefit lit. |
| **Argon tidy-ups** | Badges of buttons spending another item's uses (Metamagic → Font of Magic) refresh; open panels collapse before an area or summon placement; Metamagic opens no target picker; spell tooltips use the spell's roll data (Scorching Ray: 3 rays); the hover tooltip lets clicks through. | The HUD behaves. |

## Settings

All Boolean, default on, read live (no reload needed), in this order in *Configure Settings*; all
world settings except `projectileChatTab` (client, each player's own; it stays last, so `restCard` and
`empoweredSpell` sit before it):

| Key | What it does |
|---|---|
| `rituals` | Ritual Adept's Rituals group and the unticked slot. |
| `longCasts` | The Longer casts group. |
| `concentrationSummons` | Summoned tokens leave with their concentration; a summon at 0 HP ends the concentration that keeps it (one whispered line). |
| `concentrationAutoBreak` | A failed concentration save ends it; the DC / result line. |
| `castDefaults` | Place Summons ticked; self-only cards drop stale targets. |
| `arcaneRecovery` | The Arcane Recovery picker after the feature is used (and ddb-importer's own Arcane Recovery macro skipped for that use; off → ddb's picker runs as imported). |
| `enabled` | The damage and healing riders, the tray preset and Battle Medic. |
| `hdControls` | The sheet's Hit Dice − / + (a change re-renders open character sheets). |
| `projectiles` | One button per ray / dart on Scorching Ray and Magic Missile cards, and no automatic first roll after the cast (off → dnd5e's own flow: the first roll opens by itself, the card's button rolls the rest). |
| `spellView` | The Spells tab's Prepared / All spells switch and the Prepared default (a change re-renders open character sheets). |
| `restCard` | The long-rest card (Cosmic Omen's Read the stars, Review prepared spells), the omen marks on the HUD and the activity choice, and the use-it-and-the-stars-decide fallback. |
| `empoweredSpell` | The Empower (1 SP) button on a sorcerer's spell damage cards, the new card and the retired old one, the applied-card mark. |
| `projectileChatTab` | Client: a Scorching Ray / Magic Missile cast opens the sidebar on Chat when the chat log is not showing (sidebar collapsed or on another tab, no chat popout), so the ray / dart card does not fade. |

## API — game.pentaryn.riders

Canonical: `game.modules.get("pentaryn-riders").api`; `game.pentaryn.riders` is the same frozen
object. Ask it: `describe()` (offline: `test/golden/describe.json`), `settings()`, `selftest()`.

| Method | Writes | Returns |
|---|---|---|
| `inspect(ref, { as })` | — | `{ actor, rows, hd, settings, concentrationSummons }` plain JSON, depth ≤ 4; throws `NOT_FOUND` / `AMBIGUOUS` / `BAD_ARGS`. With `as` (a user ref) a player view: `rows` and `hd` need OBSERVER, `concentrationSummons` is GM-only |
| `selftest()` | — | `{ ok, checks }` |
| `arcaneRecovery(ref)` | spell slots, one chat line | `{ ok, actor, recovered }` / `{ ok: false, code: "REFUSED" \| "NOT_FOUND" … }`; the picker without spending a use |
| `restCard(ref)` | one whispered card (`flags.pentaryn-riders.rest`), the stored omen cleared | `{ ok, actor, rules, message }` / `{ ok: false, code: "REFUSED" \| "NOT_FOUND" … }`; the long-rest card without resting (`rules` `[]`, `message` null when nothing matches) |
| `readOmen(ref)` | `flags.pentaryn-riders.omen` on the feat, one roll message (only when none is stored) | `{ ok, actor, omen: "weal" \| "woe", face, rolled }` / `{ ok: false, code: "NONE" \| "REFUSED" \| "NOT_FOUND" … }`; today's Cosmic Omen: rolled and stored once, then answered as stored (`rolled: false`, `face` null) |
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
await R.restCard("Talo");                            // the long-rest card again (the player closed it)
await R.readOmen("Talo");                            // { ok, omen: "weal" | "woe", face, rolled } — once a day; a stored omen is answered, not rerolled
```

## Data written

| Where | What |
|---|---|
| User flag `flags.pentaryn-riders.spellView.<actorId>` | `"prepared"` or `"all"`: that user's Spells-tab view of that character, set by the switch (the user's own User document, as dnd5e's own `sheetPrefs`) |
| Item flag `flags.pentaryn-riders.damageType` | a typed feature's type (string or array), by `setType` / `retireManual` |
| Cosmic Omen item flag `flags.pentaryn-riders.omen` | `"weal"` or `"woe"`: today's omen, by Read the stars, the first use of the day or `readOmen`; cleared (`_del`) by the next long rest's card |
| Long-rest card `flags.pentaryn-riders.rest` | `{ actor: uuid, type: "long", rules: [{ key, item }] }`: what the card's rows are drawn from at render |
| Empowered damage card `flags.pentaryn-riders.empowered` | `{ from: <old card id>, cost: 1, changes: [{ roll, term, result, faces, from, to }] }` on the new card (the old card's `applied`, `ignoreResistance`, `origin`, `detail` are copied beside it) |
| Retired damage card `flags.pentaryn-riders.supersededBy` | the new card's id: no apply tray, one line |
| Applied damage card `flags.pentaryn-riders.trayApplied` | `true` once a tray applied it (the applying client, when it can edit the card): the Empower button goes |
| Damage / healing ChatMessage `flags.pentaryn-riders` | `{ applied, ignoreResistance, origin, detail }` (`riderFlag`): the once-per-casting guard, the card note, the tray preset |
| Battle Medic roll message `flags.pentaryn-riders` | `{ flow: "battle-medic", target, faces }` |
| ActiveEffect flag `flags.pentaryn-riders.choice` | `{ group, max }` on a pick-one benefit (authored by pentaryn-importer's DDB corrections — the Transmuter's Stone — or a fix script; read here); `max` a number or a roll-data formula |
| Activity flag `flags.pentaryn-riders.flow` | `"battle-medic"` on the activity `installBattleMedic` builds |
| Token flag `flags.pentaryn-riders.concentration` | the uuid of the concentration effect that keeps a summon |
| Summoned token `flags.pentaryn-riders.claims.summonCleanup` | the socket id of the one tab that deletes that scene's summons (the kit's `claimDocument`, riders-async-3); it goes with the token |
| Fallen summon `flags.pentaryn-riders.claims.summonFell` | the socket id of the one tab that ends the concentration when that summon dropped to 0 HP (the kit's `claimDocument`); it goes with the token |
| Concentration save card `flags.pentaryn-riders.claims.autoBreak` | the socket id of the one tab that ends the concentration (the kit's `claimMessage`, riders-async-1) |
| Patient flag `flags.pentaryn-riders.relay.<requestId>` | the GM tabs' claim stamps (`claims.<socketId>`, removed when answered) and the winner's `{ result \| error, at }`; the last five kept |
| Documents | a new `type: "damage"` ChatMessage per Empower (its `rolls`, `system.activity`, `item`, `origin`, `targets`, `onSave` from the old card); the Font of Magic use spent through the Empowered Spell activity's own `use`; the long-rest card and the omen's 1d6 roll message; class `system.hd.spent` / NPC `system.attributes.hd.spent`; HP via `applyDamage`; `system.spells.spellN.value` (Arcane Recovery); a concentration save card's `system.outcome = "broken"`; summoned tokens deleted; a pick-one effect's siblings `disabled: true`; a caster's concentration effect ended when its summon fell (`endConcentration`), plus one whispered ChatMessage; a new effect's `duration.expiry` / `duration.value` rewritten before it is created (`updateSource`, the creating client), and a source expiry's `system.origin.actor` (the caster's uuid) recorded the same way |
| `CONFIG.ActiveEffect.expiryAction` | `"delete"` from `init` (not a document: core's registry then deletes expired effects on the active GM's client instead of marking them `expired`); `uninstall()` restores the previous value |

## Flags other modules read

n/a — no other module reads this module's flags. It reads none of theirs.

## Events

n/a — emits none. Listens to (in this order, `test/golden/hooks.json`): `dnd5e.preUseActivity`,
`dnd5e.summonToken`, `deleteActiveEffect`, `dnd5e.renderChatMessage`, `createChatMessage`,
`updateItem`, `dnd5e.preCreateMeasuredTemplate`, `dnd5e.preSummon`, `renderItemButtonArgonComponent`,
`changeSidebarTab`, `dnd5e.postSummon`, `renderActivityUsageDialog`, `renderActivityChoiceDialog`, `dnd5e.postUseActivity`,
`dnd5e.preActivityConsumption`, `dnd5e.postDamageRollConfiguration`, `dnd5e.preCalculateDamage`,
`renderCharacterActorSheet` (Hit Dice), then the projectile buttons' `dnd5e.renderChatMessage`
(dnd5e itself re-renders a card when a roll under it is made or deleted) and `dnd5e.postUseActivity`
(no automatic first roll, Chat opened; after Arcane Recovery and Battle Medic), then effect-choices'
`updateActiveEffect`, then the spell view's `dnd5e.filterItem`, `renderCharacterActorSheet`, then
expiry's `preCreateActiveEffect`, then rest's `dnd5e.restCompleted`, `dnd5e.renderChatMessage` (the
card's rows), `updateItem` (the omen flag redraws the rendered cards), `dnd5e.preUseActivity` (the Cosmic Omen check, after every veto), `renderActivityChoiceDialog`,
`renderItemButtonArgonComponent`, then empower's `dnd5e.renderChatMessage` (the button, the note, the
retired card) and `dnd5e.applyDamage`. Concentration's `updateActor` (a summon at 0 HP) and `deleteToken`
(prune) sit after its result line.
On `dnd5e.preUseActivity` the one-usage-dialog and Arcane Recovery second-use vetoes must run before
other packages' listeners (a `false` stops only the later ones); core loads module scripts in id
order, so riders is ahead of senses and transform. `selftest()`'s "usage vetoes run first" fails if
that ever changes.

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

Non-patch rows (the spell view needs none: it uses dnd5e's `dnd5e.filterItem` hook): `argon-shared-uses-badge`, `argon-collapse-on-area-placement`,
`argon-tooltip-click-through` (CSS on Argon's `#tooltip`), `dnd5e-concentration-summons`,
`dnd5e-concentration-auto-break`, `dnd5e-summon-keeps-sidebar`, `dnd5e-restore-slot-default`,
`dnd5e-usage-dialog-first-click`, `dnd5e-chat-message-types`, `argon-riders-long-casts`,
`dnd5e-riders-arcane-recovery-picker`, `dnd5e-riders-projectile-buttons`, `dnd5e-riders-damage-tray-preset`,
`dnd5e-riders-roll-term-riders`, `dnd5e-riders-sheet-hit-dice`, `core-riders-query-battle-medic`,
`dnd5e-usage-dialog-single`, `dnd5e-riders-effect-choices`. Waiting in the batch file (0.6.0, §5.6):
`core-riders-expiry-delete` (the `CONFIG.ActiveEffect.expiryAction` write), `dnd5e-riders-self-cast-expiry`
(the `sourceStart` rewrite leans on dnd5e's `PSEUDO_EXPIRIES` / `isExpiryEvent` / `getSourceActor`, and the recorded source actor on `getSourceActor` reading `system.origin.actor` first),
`dnd5e-riders-summon-fell` (`endConcentration`, `options.dnd5e.hp`, `flags.dnd5e.item`); 0.7.0:
`dnd5e-riders-rest-card` (`dnd5e.restCompleted`, the activity's `use(usage, dialog, message)` re-call with
`usage.pentaryn.omen`, the choice dialog's `button[data-activity-id]`), `argon-riders-omen-badge` (a class and
a badge on Argon's item button element, `button.item` / `button.activity`), `dnd5e-riders-empowered-spell`
(the damage message's `system` shape, `Roll#toJSON` term results, the `damage-application` element removed
from a retired card, `dnd5e.applyDamage`'s `options.origin`). Unreleased: `dnd5e-riders-omen-die-decides`
(the "the die decides" line and badges on the choice dialog and Argon's button when no omen is stored).
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
- **A summon at 0 HP**: the same election (the active GM; with no GM online, the user who made the HP
  change) on `updateActor`. Each fallen stamped token is claimed (key `summonFell`) before the one tab
  ends the concentration and whispers the line; a token already in flight in that tab is skipped, a
  second hit at 0 is not a fall (dnd5e's `options.dnd5e.hp` carries the old value), and an effect
  that is gone ends nothing. The cleanup above then removes the token.
- **Expired effects**: core's registry deletes them on the active GM's client only (`activeGM.isSelf`),
  so with the headless GM "Claude" as active GM, that bot's tab is where they go.
- **The self-cast expiry rewrite**: the creating client, GM or player (`preCreateActiveEffect` runs on
  the initiator only); nothing is elected.
- **The long-rest card, Read the stars, the omen fallback**: the resting / clicking client, an owner
  (`dnd5e.restCompleted` and `dnd5e.preUseActivity` run on the acting client only); the omen flag and
  the card are that client's writes. A GM resting a player's character posts the card as that GM: the
  players still see it (whispered to the actor's owners and the rester). `restCard` / `readOmen` run on
  the caller's client.
- **Empower**: the clicking client, the caster's owner who can also edit the card (its author, or a GM).
  The point, the new card and the old card's `supersededBy` are its three writes. **Applied means done**:
  the applying client (a GM from the tray, or the author with the player tray allowed) marks the card
  once; a card this client cannot edit is left unmarked, so its button stays until the owner's next
  render finds `supersededBy` or no points.

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

**Something a long rest offers** (Portent, when a Diviner arrives) is a `REST_RULES` row in
`riders-core.mjs`: `key`, `label`, `match` (as RULES) or `when: { preparedCaster: true }`, and an
`action` the card draws (`"omen"`, `"spellView"`, or a new one wired in `rest.mjs`'s render), plus a
check in `test/core-fixtures.mjs` and a row test in `test/rest.test.mjs`.

**A pick-one benefit** (choose one of N, change it later): one passive (`transfer`) effect per
benefit on the feature item, each with `flags.pentaryn-riders.choice = { group: "<name>", max }`;
`max` is a number or a formula such as `"min(2, 1 + floor(@classes.wizard.levels / 10))"`. An
always-on part of the feature is its own unflagged effect. Write it as a fix script with a dry run
(`scripts/foundry/fixes/`), not by hand — or, for a D&D Beyond character, as a pentaryn-importer DDB
correction rule, so a re-sync does not lose it (`context/foundry/importer.md`).

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
- **A summon's fall needs the stamp**: only a token created through `dnd5e.summonToken` for a
  concentration cast carries `flags.pentaryn-riders.concentration`. A Find Familiar or Animate Dead
  token (no concentration) at 0 HP ends nothing, and dropbin leaves every dnd5e summon out of the
  corpses on its side. A summon deleted or moved to another scene is not a fall (portals and pins
  delete tokens on scene moves); only HP → 0 counts.
- **`expiryAction = "delete"` is world-wide**: every timed effect of every actor, not only Shield's.
  An effect a GM wanted to keep as a greyed reminder is gone when its duration ends (out of combat
  dnd5e already deleted them). It is a CONFIG value: another module setting it later at `init` wins.
- **The `sourceStart` rewrite reads `game.combat`** (the viewed combat), as core's own `start` data
  does. An effect created while another combat is viewed is judged against that one.
- **The recorded source actor is a uuid at creation time**: a caster whose token actor is unlinked is
  recorded as that token's actor (`Scene….Token….Actor…`); a token deleted mid-fight leaves the effect
  sourceless, and dnd5e falls back to "past the creation round", as it did for every effect before 0.7.2.
- **Argon's `button.activity` on an item button is the item's FIRST activity**, not "no activity":
  tell a per-activity button by `button.isActivity` (or `_item` being an Activity), never by `activity`
  alone. Argon splits an item into one button per activity only under its `explodeItemActivities`
  setting (weapons only by default), so a feat always gets one button for the whole item.
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
- **Two Damage dialogs per Magic Missile cast** (5wv0Iq, before 0.5.2) was not a double click: dnd5e
  rolled the first dart by itself after the cast, then the player clicked Dart 1. The dart buttons
  "vanished" because the card was a chat notification (sidebar not on Chat), which core dismisses 5 s
  in once the pointer leaves it. Now nothing rolls by itself and the cast opens Chat. The feedback
  timeline shows a dart click as `click prShot` (the buttons' `data-action`).
- **A wand's spell missing from the Spells tab** means its cached copy (`flags.dnd5e.cachedFor`) is
  gone; dnd5e lists a cast-from-item spell only through that copy, and re-creates it on the wand's
  next use (5wv0Iq: lost in the 10-19 wand repoint, back after the first cast). Not the spell view.
- **The spell view is not dnd5e's own "Prepared" filter.** That one (filter menu → Prepared) keeps
  only `canPrepare && prepared`, so it also hides cantrips never ticked, at-will / innate spells and
  spells cast from an item. The two stack: both on shows the intersection. The Argon HUD's spell
  panels are untouched (Argon already lists prepared spells only).
- **A wizard's unprepared rituals** are hidden in the Prepared view like any unprepared spell; the
  Ritual Adept group on the HUD still lists them, and *All spells* shows them on the sheet.
- **The rest card's rows are drawn at render, from the actor as it is now**: a card from yesterday shows
  today's omen (or the button again after the next rest cleared it). The omen flag's `updateItem` reaches
  every client, and each redraws the rest cards it has rendered for that actor (`ui.chat.updateMessage`),
  so no client keeps a live button. A client that missed it (no chat log, a headless tab) still cannot
  flip the omen: the stars are read once a day, and a second read answers the stored omen and rolls nothing.
- **A Cosmic Omen activity is told by its name**: "Weal (Even)" / "Woe (Odd)" (either word). A renamed
  activity is left to dnd5e, and a third activity on the feat is never redirected.
- **The redirect skips Argon's reaction pip**: Argon counts the action economy only when the use it
  started returns a result; a stopped-and-redirected click returns nothing to it. The redirected use
  spends the feat's use as normal.
- **Empower rerolls top-level dice only**: a die inside parentheses or a function, or one multiplied,
  is left alone (its face is not its contribution). An exploded die keeps its explosion; a `min2` floor
  is re-applied to the new face. The one-click choice reads a die's value as core does (`count` over
  the face), so Elemental Adept's 1-as-2 is a 2.
- **Empower's new card is a new roll message**: dnd5e threads it under the usage card through
  `system.origin`, so the usage card's summary and the once-per-casting riders guard see it. The old
  card keeps its dice; only its tray is removed and a line added. A player can retire only a card they
  authored; a GM any card.

## Files

Load order is `FEATURES` in `riders.mjs`, and it decides who runs first on a shared hook:
`dnd5e.preUseActivity` runs rituals' slot untick, cast-flow's restore-slot default, stale-target
drop and one-dialog veto, then the Battle Medic veto; `dnd5e.renderChatMessage` runs the break label and the
concentration line before the card note, then the projectile buttons, the rest card's rows and the Empower
button; `dnd5e.postUseActivity` runs Arcane Recovery, then Battle Medic, then the projectiles' no-automatic-roll.

| File | Role |
|---|---|
| `riders.mjs` | entry: wiring, `FEATURES`, init (settings, relay), ready (patches, publish) |
| `riders-core.mjs`, `core/hit-dice.mjs`, `core/relay.mjs`, `core/spell-view.mjs` | pure: constants, `RULES`, `PROJECTILES`, `REST_RULES`, `EMPOWERED_SPELL`, rider planning, the omen helpers, Hit Dice / Battle Medic / report kernels, the relay's claim |
| `core/choices.mjs`, `core/usage.mjs` | pure: pick-one effect rules; the usage-dialog guards (one dialog, stale concentration) |
| `rituals-core.mjs`, `table-core.mjs` | pure: Ritual Adept and Longer casts; concentration, Argon and cast-flow helpers |
| `settings.mjs` | `SETTINGS`, `settingOr` / `settingRaw` |
| `api-manifest.mjs`, `api.mjs` | the API rows; implementations, `inspect`, `selftest` |
| `shapes.mjs`, `argon.mjs` | adapters: dnd5e documents and Hit Dice writes; `ui.ARGON` / `CONFIG.ARGON` |
| `patches.mjs` | the six wraps |
| `rituals.mjs`, `concentration.mjs`, `argon-tidy.mjs`, `cast-flow.mjs` | features: table fixes (concentration: the summon stamp and cleanup, a summon's fall ending its concentration, the break label, auto-break) |
| `damage-riders.mjs`, `card-note.mjs`, `tray-preset.mjs`, `battle-medic.mjs`, `hd-sheet.mjs` | features: the riders, Battle Medic, the sheet − / + |
| `projectiles.mjs` | feature: one button per ray / dart on Scorching Ray and Magic Missile cards (`PROJECTILES` in riders-core), no automatic first roll, Chat opened on the cast |
| `effect-choices.mjs` | feature: pick-one passive effects (the Transmuter's Stone) |
| `spell-view.mjs`, `core/spell-view.mjs` | feature: the Spells tab's Prepared / All spells switch (`dnd5e.filterItem`); pure: which spells the Prepared view keeps |
| `expiry.mjs` | feature: `CONFIG.ActiveEffect.expiryAction = "delete"` at init (`configure()`), the self-cast reaction's `turnStart` → `sourceStart` rewrite and the caster recorded in `system.origin.actor` on a `sourceStart` / `sourceEnd` effect that has none, both on `preCreateActiveEffect` (`selfEffectExpiry`, `sourceActorFor` in table-core) |
| `rest.mjs` | feature: the long-rest card (`REST_RULES` in riders-core), Read the stars / Review prepared spells, the omen badge on Argon's Cosmic Omen button (`omenButtonMark` in riders-core: the one button per feat named Weal / Woe and never greyed, a per-activity split badged / greyed) and on the activity choice, the use-it-and-the-stars-decide redirect |
| `empower.mjs`, `core/empower.mjs` | feature: the Empower (1 SP) button, the new card, the retired card, the applied mark; pure: candidates, the one-click plan, the reroll of a roll's JSON |
| `styles/riders.css`, `lang/en.json`, `lib/` | styles (`.pr-*`, and the `#tooltip` click-through rule), strings, the vendored kit (with `lib/argon-tooltip.css`, D7: listed in `styles`, inert for riders alone) |

## Tests

`node test/run.mjs` from the module folder: every `test/*.test.mjs` (node:test, one process each)
against a synthetic world (`test/fixtures/world.mjs`), then the `LEGACY` self-running fixture
suites of the three cores. One golden: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then read
the diff. Also `make foundry-riders-check`.

## Sync

`make foundry-riders-sync`, then reload (a `module.json` change needs a Foundry restart). Live
smoke: `game.pentaryn.riders.selftest().ok` (its "expired effects are deleted" check reads
`CONFIG.ActiveEffect.expiryAction`), `describe().version` equals the manifest's; Fireball as Marrith
shows `min2` + `+CHA` and the note; Battle Medic from a player on another PC heals once; in a ZZ combat,
Shield cast on a foe's turn reads `duration.expiry: "sourceStart"` with `system.origin.actor` the caster's uuid and is gone at the caster's next turn (not when the next round begins);
`await game.pentaryn.riders.restCard("Talo")` whispers the card, Read the stars stores
`flags.pentaryn-riders.omen` and the one Cosmic Omen HUD button shows a Weal / Woe badge, not greyed; a Fireball damage card as Marrith shows Empower (1 SP),
one click spends a Sorcery Point and posts the new card with the old one's tray gone.
