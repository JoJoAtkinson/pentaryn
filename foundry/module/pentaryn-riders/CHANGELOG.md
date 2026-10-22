# Changelog — pentaryn-riders

## 0.5.2 — 2026-10-22 (player feedback 5wv0Iq, MMLx5X: Magic Missile from Marwen's wand)

Hooks: 32 non-lifecycle registrations (+1 `dnd5e.postUseActivity`, projectiles). Settings are now
eleven: `projectileChatTab` (client) last. Two new lang keys (its name and hint).

- [declared] No automatic first dart / ray roll. dnd5e rolls a Damage (Magic Missile) or Attack
  (Scorching Ray) activity by itself right after the cast (`_triggerSubsequentActions`). Each wand
  cast opened a Damage dialog, and Dart 1 then opened a second one: the "double prompts". It was not a
  double click. The second dialog came after the no-target toast, which only a dart click posts. For
  a PROJECTILES spell the riders now set the use's `subsequentActions` to false in
  `dnd5e.postUseActivity`, on the caster's client (an owner, world setting `projectiles`). Every dart
  and ray is one button click and one dialog. The only other step dnd5e skips with it is the
  `flags.dnd5e.consumed` stamp, which is for Hit Dice only.
- [declared] The cast opens the sidebar on Chat when the chat log is not on screen: the sidebar is
  collapsed or on another tab, and there is no chat popout. The card used to show only as a chat
  notification, which core dismisses 5 s after it appears once the pointer leaves it. Moving to the
  first dialog was enough, so the buttons "disappeared quickly or when anything was selected"; in
  the Chat tab they "worked great" (MMLx5X). The check does not ask `ChatLog#_shouldShowNotifications`,
  because its `false` also covers "pip" notifications and a narrow window, where the card shows
  nowhere. A new client setting, `projectileChatTab` (default on), turns it off per player.
- Live dart / ray buttons carry `data-action="prShot"`, so the feedback recorder logs their clicks
  (5wv0Iq's timeline had none). Their handler still stops propagation, so dnd5e's and ChatLog's
  `[data-action]` handlers never see the click.
- Not a code change: Magic Missile was missing from the Spells tab because the wand's cached spell
  copy was gone (lost in the 10-19 repoint). dnd5e re-created it on the first use. README Pitfalls
  now covers it.

## 0.5.1 — 2026-10-19 (code review of 0.5.0, low severity)

Hooks: 31 non-lifecycle registrations (+1 preUseActivity veto, −2 projectile chat hooks). One new
lang key (`usage.staleConcentration`); selftest gains "usage vetoes run first".

- [declared] A stale concentration replacement at the limit is refused, not retargeted. 0.5.0 ended
  the one effect held in place of the vanished one: a dialog opened naming Fly, Fly dropped, Hold
  Person was cast elsewhere, and Cast in the first dialog silently ended Hold Person. Now, at the
  limit, nothing is cast and a warning asks the player to reopen the dialog (which names what is held
  now). Below the limit the stale replacement is still dropped and the cast goes through.
  `core/usage.mjs staleConcentrationEnd` returns `false` for "refuse".
- [declared] A second Arcane Recovery use while that wizard's picker is open is vetoed in
  `dnd5e.preUseActivity`, before dnd5e spends a use (0.5.0 spent the use and only showed the notice).
- [declared] The Arcane Grimoire +1 counts only a held grimoire: equipped, attuned when it needs it,
  not inside a container. One in a backpack no longer raises the budget. A grimoire whose item type
  has no `system.equipped` field (loot) counts as held when it is not in a container (second review).
- Projectile buttons: the `createChatMessage` / `deleteChatMessage` listeners are gone. dnd5e 6.0.6
  re-renders the origin card itself on a roll's create and delete (`ChatMessage5e#refreshOrigin`),
  so each roll re-rendered the card twice. Uninstall now removes drawn ray / dart buttons from
  rendered cards.
- The preUseActivity vetoes only stop listeners after them. Checked: core loads module scripts in
  module-id order, so riders runs ahead of pentaryn-senses and pentaryn-transform (live order
  confirmed). `selftest()` now fails ("usage vetoes run first") if another package's listener ever
  gets ahead. No change in pentaryn-transform.

## 0.5.0 — 2026-10-19 (player feedback LdPm43, JbnAbX, ixcdvA, tNdOEx, tiDvFa, EBGqNA, DsekWh)

One release for four fixes built in parallel (they had each taken 0.3.1 or 0.4.0, never released).
Settings are now ten: `projectiles` ninth, `spellView` tenth. Hooks: 32 non-lifecycle registrations.

### Arcane Recovery prompts once (LdPm43)

- [declared] Arcane Recovery prompts once and restores once. A D&D Beyond import's Arcane Recovery
  is a single `ddbmacro` activity (`ddb.feat.arcaneRecovery`): ddb-importer opened its own picker
  as the use's subsequent action while the riders picker opened from `dnd5e.postUseActivity`, and
  each window restored slots (Marwen got two windows and both writes). The riders listener now sets
  the use's `subsequentActions` to false for that activity (dnd5e reads it right after the hook), so
  only the riders picker opens. The chat card's macro button still runs ddb's on a click; with the
  `arcaneRecovery` setting off, ddb's picker runs as imported. To see it: use Arcane Recovery on a
  D&D Beyond-imported wizard after a short rest; one window, one write, one chat line.
- [declared] The picker is the layout the player asked for: one row per slot level 1–5 the wizard
  has, "n of m left", a ticked locked box per slot still there and a box per spent slot to tick,
  opening with the highest spent slots that fit ticked. Budget +1 with an Arcane Grimoire (attuned
  when it needs attunement), as ddb-importer's picker had. The result shape and API are unchanged.
- A second use while the picker is open opens no second window (an info notice instead).

### One button per ray / dart (JbnAbX, ixcdvA)

- **[declared] One button per ray / dart** (new feature `projectiles.mjs`, setting `projectiles`,
  default on; row `dnd5e-riders-projectile-buttons`). Scorching Ray fired "one beam" and Magic
  Missile "one dart": dnd5e 6 and the PHB items give each spell one activity that rolls once, and
  Magic Missile's card Damage button re-uses the cast-time targets, so rays and darts could not be
  split. Their usage card now carries one button per ray / dart — 3, plus one per slot level above
  the spell's (a wand's extra charges count, via the card's `system.scaling`). Target one creature
  and click the next button: that ray's attack (Scorching Ray) or that dart's damage (Magic
  Missile) is rolled at it and threaded under the card, so Elemental Affinity's once-per-casting
  guard and pentaryn-aoe's damage on hit work per ray as before. dnd5e's automatic first roll and its
  own card button fill a slot too; a rolled slot names its target; more than one target refuses the
  click. To see it: cast Scorching Ray at 3rd level — four Ray buttons under the card, the first
  already named.
- Pure core: `PROJECTILES`, `projectileRule`, `castLevelOf`, `projectileCount`, `projectileSlots`
  (also on `game.pentaryn.riders.core`).
- Item data, not code: Marwen's Wand of Magic Missiles could not cast ("No uses on Magic Missile
  available to spend") because its Cast activity points at a DDB-imported spell whose own damage
  activity spends the spell's (nonexistent) uses with the slot off, which also makes dnd5e ignore the
  wand's charges. `scripts/foundry/fixes/2026-10-19-wand-cast-spell.mjs` (dry run by default)
  repoints such Cast activities at the PHB spell, as the DMG's own wand does.

### Transmuter's Stone pick-one effects; one usage dialog per activity (tNdOEx, tiDvFa)

- **Pick-one passive effects** (new feature `effect-choices.mjs`, pure `core/choices.mjs`): effects
  flagged `flags.pentaryn-riders.choice = { group, max }` are a set where turning one on turns the
  others of its group off (beyond `max`, a number or a roll-data formula). For the Wizard's
  Transmuter's Stone, whose Darkvision the DDB import had baked into Marwen's base senses with
  nothing to toggle. The item data is a fix script, `scripts/foundry/fixes/2026-10-19-transmuters-stone.js`
  (dry run by default). Hook `updateActiveEffect`; row `dnd5e-riders-effect-choices`. [declared]
- **One usage dialog per activity** (cast-flow part 7): a second Use while that activity's dialog is
  open is vetoed and brings the open one forward. A double click had opened two Enlarge/Reduce
  dialogs. [declared]
- **One activity choice per item** (cast-flow part 7, DsekWh): dnd5e opens a new "which activity?"
  dialog (ActivityChoiceDialog) on every Use click, so a double click on Produce Flame opened two
  and picking in both cast it twice. A `renderActivityChoiceDialog` listener closes a second choice
  dialog for an item whose choice dialog is already open (or still rendering) and brings the first
  to the front. Every item; a dialog that is closing after a pick does not count. Pure
  `core/usage.mjs` `firstChoiceDialogFor`; row `dnd5e-usage-dialog-single`. [declared]
- **Stale concentration replacement repaired** (cast-flow part 8, `dnd5e.preActivityConsumption`):
  a dialog that named a concentration which ended meanwhile no longer fails with "The effect that
  is concentrated on and to be replaced does not exist." Below the limit nothing is replaced; at
  the limit with one effect, that one is. Pure `core/usage.mjs`; row `dnd5e-usage-dialog-single`.
- `test/golden/hooks.json`: four registrations added (three in cast-flow's place, one at the end).

### Spells tab opens on prepared spells (EBGqNA)

- New feature `spell-view.mjs`: the character sheet's Spells tab opens on the spells the character
  can cast today (prepared, always prepared, cantrips, at-will, innate, pact, cast from an item),
  through dnd5e 6's `dnd5e.filterItem` hook (no wrap). A **Show: Prepared (n) · All spells (n)**
  switch sits above the spell search with "n unprepared hidden"; a click re-applies dnd5e's list
  filters in place. The choice is a user flag per character, `flags.pentaryn-riders.spellView.<actorId>`.
  No switch when nothing would be hidden. Setting `spellView` (world, on) turns it off.
- Pure `core/spell-view.mjs` (`SPELL_VIEWS`, `inPreparedView`, `spellViewCounts`, `spellViewOf`),
  re-exported by the riders-core barrel (so also on `api.core`); adapter `spellViewInfo` in `shapes.mjs`.
- dnd5e's own filter-menu "Prepared" was not enough: it keeps `canPrepare && prepared` only, which
  hides never-ticked cantrips, at-will / innate spells and spells cast from an item.

## 0.3.0 — 2026-10-12 (addon blueprint migration, wave 4; released by the Wave 7 restart batch)

- Wave 7 batch: `module.json` `flags.pentaryn` blueprint keys (`flagScope` `riders` →
  `pentaryn-riders`, metadata only), `recommends` enhancedcombathud and enhancedcombathud-dnd5e,
  `styles/riders.css` (moved), `verified: "14.369"`. D7: the kit's `lib/argon-tooltip.css` is
  vendored and listed in `styles` (inert for riders alone); the `#tooltip` click-through rule stays in
  `styles/riders.css` (W4-R9).

- Rebuilt to the addon blueprint: `riders.mjs` is wiring only; nine features (`rituals`,
  `concentration`, `argon-tidy`, `cast-flow`, `damage-riders`, `card-note`, `tray-preset`,
  `battle-medic`, `hd-sheet`) install in the old hook order; `settings.mjs`, `api-manifest.mjs`,
  `api.mjs`, the adapters `shapes.mjs` and `argon.mjs`, `patches.mjs`, and the vendored kit (`lib/`).
- The six hand patches go through the kit's `wrapMethod`, one marker each, listed by
  `describe().patches` and undone by `uninstall()`.
- API: built from the manifest and frozen; new `inspect(ref, { as })`, `selftest()`,
  `arcaneRecovery(ref)`, `describe()`, `settings()`, `trace()`, `uninstall()`, `version`,
  `contract`. The legacy members answer as before, and their actor argument now also takes a
  name, id, UUID or Token (a miss answers `null`).
- Published with the kit's `publishNamespace`, synchronously at `ready`; `module.api` is set and
  `pentaryn-riders.ready` fires. A frozen `game.pentaryn` now throws instead of being replaced.
- The Battle Medic relay goes through the kit's `guarded` (`sender: "any"`): a query reaching a
  non-GM client answers `NOT_GM: this client is not a GM`. It logs an audit line per success and a
  warn per refusal. The runner sends a request id and the GM tabs claim it first, so two GM tabs
  heal once, even when one tab's claim lands after the other recorded its result (combat-riders-41).
  Recording a result no longer prunes another patient request that is still being claimed
  (`794e1ed9`), so two Battle Medics on one patient at once also heal once each.
- Three silent catches now log at debug (`CONFIG.debug["pentaryn-riders"] = true`).
- The once-per-casting guard reads the usage card's own messages from dnd5e's message registry
  (`dnd5e.registry.messages`) instead of scanning the whole chat log on each attack damage roll;
  it scans the log as before when the registry is missing.
- Pure kernels for Hit Dice pools, the Battle Medic gate and the report row (`core/hit-dice.mjs`);
  one spell-slot builder (`slotsFrom`).

## 0.2.0

- dnd5e 6 build; the usability re-runs' Ritual Adept, Longer casts, concentration, cast-flow and
  Argon tidy-ups.

## 0.1.0

- dnd5e 5.3 build: Elemental Adept, Elemental Affinity, Potent Spellcasting, Healer, Battle Medic,
  the sheet's Hit Dice − / +.
