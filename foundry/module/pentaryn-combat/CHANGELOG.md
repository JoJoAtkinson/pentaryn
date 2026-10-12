# Changelog — Pentaryn Combat (`pentaryn-combat`)

## Unreleased — 2026-10-11 (migrated to the addon blueprint, wave 4)

`module.json` still says 0.2.5; the version bump to 0.3.0 (and `core.VERSION` with it) lands with the
Wave 7 restart batch. The table behaviour is unchanged except the declared items (each its own commit;
live checks in the migration guide §5).

- **Blueprint layout.** Kit 1.0.2 vendored (full tier + election, patch, perf, argon-kit, argon-tooltip).
  Two entries kept (D11) over a shared `context.mjs`; every hook goes through the kit registry with a
  label; features export `install` / `uninstall`; `turnflow.mjs` and `hud.mjs` split into `turnflow/*`
  and `hud/*`; `riders.mjs` → `turn-riders.mjs`; `combat-core.mjs` a barrel over `core/*`. Settings are
  one `SETTINGS` table; every i18n key is a literal; one kit log (same console text).
- **argon-kit** (new kit file, written here first): the Argon helpers combat and transform hand-copied.
- **API** (declared, W2-K1): built from `api-manifest.mjs`, frozen, published synchronously at `ready`
  through `publishNamespace`; new `inspect`, `selftest`, `coversMultiattack`, kit members. The legacy
  actor members resolve an id / UUID / name and answer null on a miss (declared D-c2).
- **Events** (declared B2): `pentaryn-combat.*` rows; the old `pentarynCombat.*` names still fire
  (after the new ones) until 0.4.0.
- **Hardening:** every hook guarded (declared D-c1); rider dice, keys and names escaped in chat HTML (declared
  D-c3); prototype patches through the kit; named timer delays; session maps pruned.
- **Fixes** (declared): Multiattack + Action Surge plans the surge's swings; Adv / Dis pressed while a
  swing's window is open applies to the next swing.
- **Performance:** rider offers check permission and turn before the canvas scan; the picker cue's
  listeners only while its setting is on (declared D-c4); one write per actor for flag cleanup
  (declared).

## 0.2.5 — 2026-10-11

- PT1-6: the Full Attack tooltip's subtitle wraps instead of losing both ends (`pentaryn-combat-tt`).
