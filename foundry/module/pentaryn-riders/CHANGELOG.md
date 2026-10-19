# Changelog — pentaryn-riders

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
