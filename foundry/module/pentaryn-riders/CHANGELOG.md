# Changelog — pentaryn-riders

## Unreleased (addon blueprint migration, wave 4; the version bump ships with the Wave 7 restart batch)

- Rebuilt to the addon blueprint: `riders.mjs` is wiring only; nine features (`rituals`,
  `concentration`, `argon-tidy`, `cast-flow`, `damage-riders`, `card-note`, `tray-preset`,
  `battle-medic`, `hd-sheet`) install in the old hook order; `settings.mjs`, `api-manifest.mjs`,
  `api.mjs`, the adapters `shapes.mjs` and `argon.mjs`, `patches.mjs`, and the vendored kit (`lib/`).
- The six hand patches go through the kit's `wrapMethod`, one marker each, listed by
  `describe().patches` and undone by `uninstall()`.
- API: built from the manifest and frozen; new `inspect(ref, { as })`, `selftest()`,
  `arcaneRecovery(ref)`, `describe()`, `settings()`, `trace()`, `uninstall()`, `version`,
  `contract`. The legacy members answer as before.
- Published with the kit's `publishNamespace`, synchronously at `ready`; `module.api` is set and
  `pentaryn-riders.ready` fires. A frozen `game.pentaryn` now throws instead of being replaced.
- The Battle Medic relay goes through the kit's `guarded` (`sender: "any"`): a query reaching a
  non-GM client answers `NOT_GM: this client is not a GM`. It logs an audit line per success and a
  warn per refusal.
- Three silent catches now log at debug (`CONFIG.debug["pentaryn-riders"] = true`).
- Pure kernels for Hit Dice pools, the Battle Medic gate and the report row (`core/hit-dice.mjs`);
  one spell-slot builder (`slotsFrom`).

## 0.2.0

- dnd5e 6 build; the usability re-runs' Ritual Adept, Longer casts, concentration, cast-flow and
  Argon tidy-ups.

## 0.1.0

- dnd5e 5.3 build: Elemental Adept, Elemental Affinity, Potent Spellcasting, Healer, Battle Medic,
  the sheet's Hit Dice − / +.
