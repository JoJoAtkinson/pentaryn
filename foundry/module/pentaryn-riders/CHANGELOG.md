# Changelog — pentaryn-riders

## 0.4.0 — 2026-10-19 (player feedback tNdOEx, tiDvFa)

- **Pick-one passive effects** (new feature `effect-choices.mjs`, pure `core/choices.mjs`): effects
  flagged `flags.pentaryn-riders.choice = { group, max }` are a set where turning one on turns the
  others of its group off (beyond `max`, a number or a roll-data formula). For the Wizard's
  Transmuter's Stone, whose Darkvision the DDB import had baked into Marwen's base senses with
  nothing to toggle. The item data is a fix script, `scripts/foundry/fixes/2026-10-19-transmuters-stone.js`
  (dry run by default). Hook `updateActiveEffect`; row `dnd5e-riders-effect-choices`. [declared]
- **One usage dialog per activity** (cast-flow part 7): a second Use while that activity's dialog is
  open is vetoed and brings the open one forward. A double click had opened two Enlarge/Reduce
  dialogs. [declared]
- **Stale concentration replacement repaired** (cast-flow part 8, `dnd5e.preActivityConsumption`):
  a dialog that named a concentration which ended meanwhile no longer fails with "The effect that
  is concentrated on and to be replaced does not exist." Below the limit nothing is replaced; at
  the limit with one effect, that one is. Pure `core/usage.mjs`; row `dnd5e-usage-dialog-single`.
- `test/golden/hooks.json`: three registrations added (two in cast-flow's place, one at the end).
## 0.4.0 — 2026-10-19 (player feedback JbnAbX, ixcdvA)

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

## 0.3.1 — 2026-10-19 (feedback LdPm43)

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
