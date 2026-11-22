# Changelog — Pentaryn Combat (`pentaryn-combat`)

## 0.3.4 — 2026-11-22 (Joe's decision 4)

- **[declared] A Multiattack "in any combination" remembers the weapon picked for each swing for the rest of
  the combat.** Switch the second Scimitar swing to the Pistol once, and every later Full Attack in that fight
  starts its second swing on the Pistol (`flags.pentaryn-combat.last.swingPicks = { combatId, picks }`, keyed
  by the swing's place in the Multiattack). Another combat, or none, reads as nothing: it resets when the
  combat ends. Swings that do not offer the remembered pick are unchanged. New pure core exports
  `applySwingPicks`, `swingPicksAfter`.

## 0.3.3 — 2026-11-21 (live play-test of 0.3.2)

- **The pause bar offers the swing's Multiattack choices.** The 2024 MM Bandit Captain's Pistol is
  not equipped, and the pause bar lists only weapons that can swing (equipped): the running chooser
  offered the Pistol, but after Esc a run switched to the Pistol could not be swapped back, and one on
  the Scimitar could not reach the Pistol (there were no tiles at all, one weapon being too few). The
  paused bar now adds this swing's choices that cannot swing, after the others (`pauseWeapons`), and
  picking one of them switches this swing's group as the running chooser does ("choose"), instead of a
  swap that moves every main swing left (a Tarrasque's Bite with its Claws).

## 0.3.2 — 2026-11-21 (Multiattack "in any combination")

A patch again: 0.4.0 stays reserved for the declared legacy `pentarynCombat.*` event sunset.

- **Each swing chooses its weapon** when a Multiattack says "in any combination" (Bandit Captain:
  "makes two attacks, using Scimitar and Pistol in any combination"; 64 of the 2024 MM's 306
  Multiattacks). While Full Attack runs, the swing strip shows **This swing: [Scimitar] [Pistol]**
  with the swing's weapon marked. One click switches this swing and the rest of its group, so the
  GM clicks at most once per change (all Pistol = one click; Pistol then Scimitar = two). A roll
  window already open for the old weapon closes unrolled and the swing is rolled again with the new
  one, with no pause. A usage card left with nothing rolled under it is tidied as before.
  The chooser only ever closes the window of the swing it was clicked on: once that swing has
  rolled (Quick mode, or Normal clicked first), a later swing's window for the old weapon stays open.
  Fixed-composition Multiattacks ("one Bite and two Claws") show no chooser and plan as before.
- **Parser** (`core/multiattack.mjs`): a "N attacks, using A or B (in any combination)" group carries
  `mix: true`, and its plan row carries `group` and `choices`. The parser checked against every
  Multiattack in `dnd-monster-manual.actors` (read-only, live world, 2026-11-21) now also reads:
  the Tarrasque's "one Bite attack and three other attacks, using Claw or Tail in any combination"
  (1 + 3, was 1); the Weretiger's text, which drops "makes" (2, was not parsed); and
  "…, or it makes two [C] attacks" as the other routine instead of more swings. The last fixes Barbed
  Devil (2, was 4), Medusa (3, was 6) and Clay Golem (2, was 5). No other MM creature parses
  differently.
- Pure core: `sequenceReducer` action `choose`, `swingChoices(state)` (core export), `planSequence`
  carries a mix row's `group` / `choices` onto its swings. The Full Attack tooltip says where to
  choose. i18n `Hud.AnyCombination`, `Strip.ThisSwing`, `Strip.ChooseHint`; style `.pc-choose-label`.

## 0.3.1 — 2026-11-07 (feedback triage 2026-11, clusters K and L6)

A patch, not a minor, on purpose: the legacy `pentarynCombat.*` event names sunset at 0.4.0 (`HOOKS`
`until`), and retiring them is its own declared change (hud/bars.mjs still listens on them).

- **HP box arithmetic** (K, `GaMIoP`; setting `hpMath`, default on): `50-10` typed into the Token
  HUD's bar box or an actor sheet's HP box gives 40 (`Roll.safeEval`, rounded down). `=40`, `-10`,
  `+5` and `50%` reach core / dnd5e exactly as before. Two kit wraps: `TokenHUD#_parseAttributeInput`
  and `BaseActorSheet#_onChangeInputDelta` (dnd5e's `parseInputDelta` is module-private, so the sheet
  handler is the seam). The boxes — and the sheet's HP meter, since its box is hidden until clicked —
  carry the tooltip "=40 sets · -10 subtracts · 50-10 does the math". New feature file
  `turnflow/hp-math.mjs`; pure rules in `core/dice-input.mjs`.
- **Roll manually** (L6, `M4D2Im`; Joe 2026-11-07, review adjustment: d20 only, secondary, no damage
  twin; no setting, no toggle, no remembered state): every dnd5e d20 roll window (attack, check, save)
  gets a quieter fourth button beside Advantage / Normal / Disadvantage. It rolls in Normal mode and
  opens core's Roll Resolution box for the d20, so the player types the face they rolled at the table;
  a box left blank is rolled by the computer. Advantage is handled at the table (roll two, type the one
  the rule says), so the advantage-based Sneak Attack offer does not fire for such a roll. Hidden for a
  user without `MANUAL_ROLLS`. Quick, damage and blind rolls stay digital. Three kit wraps:
  `D20RollConfigurationDialog#_finalizeConfig` marks the roll (`options.pentarynManual`); `Roll#_evaluate`
  raises a flag for the marked roll's synchronous term identification only; `ClientSettings#get` answers
  `core.diceConfiguration` with the d20 as Manual while it is up (a copy — the stored setting is never
  written). New feature file `turnflow/roll-manually.mjs`; button style `.pc-roll-manually`.
- Five `foundry/adjustments.yml` rows (`combat-core-token-hud-arithmetic`, `combat-dnd5e-sheet-arithmetic`,
  `combat-dnd5e-roll-manually-action`, `combat-core-roll-manually-evaluate`, `combat-core-roll-manually-dice-config`).

## 0.3.0 — 2026-10-12 (migrated to the addon blueprint, wave 4; released by the Wave 7 restart batch)

The Wave 7 batch bumped `module.json` and `core.VERSION` to 0.3.0 together and added the
`flags.pentaryn` blueprint keys (`flagScope` `combat` → `pentaryn-combat`, manifest-only),
`verified: "14.369"` and the turn-flow sentence in the description (combat-riders-15). W4-C6: the kit's
`lib/argon-tooltip.css` is listed in `styles`; `styles/combat.css` no longer `@import`s it (same rules).

The table behaviour is unchanged except the declared items (each its own commit;
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
- **Tooltip styles** (declared D7, `24e961a0`): `styles/combat.css` imports the kit's
  `lib/argon-tooltip.css`, so the Full Attack, follow-up and command tooltips keep their compact
  layout with pentaryn-transform off (before, they were styled only by transform.css).

## 0.2.5 — 2026-10-11

- PT1-6: the Full Attack tooltip's subtitle wraps instead of losing both ends (`pentaryn-combat-tt`).
