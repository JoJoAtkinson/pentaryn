# Changelog — Pentaryn Attunement Slots (`pentaryn-attunement`)

## Unreleased — 2026-10-11 (migrated to the addon blueprint, wave 2; kit 1.0.2)

Structure (no behaviour change): pure core `attunement-core.mjs`; `actor-adapter.mjs` (document
writes, Item Piles, the dnd5e adjustments); `strip.mjs` (UI); features `sheet.mjs` and `bonds.mjs`
installed synchronously from the entry (hook order unchanged); `api-manifest.mjs` + `api.mjs`; the
legacy slot suite runs under `node:test` on the core; the tooltip guard goes through the kit's
`wrapMethod` (marker `pentarynGuarded` kept). One sheet render now reconciles the slots once and
reads the away list once (items-journal-13).

Declared changes:

- **D-A1** The API is published at `ready` (not one tick later), frozen, also as
  `game.modules.get("pentaryn-attunement").api`, and fires `pentaryn-attunement.ready`. Additive:
  `describe()`, `version`, `contract`, `inspect(ref)`, `selftest()`, `settings()`, `trace()`,
  `uninstall()`; `computeSlots`/`away` also take an id, uuid or exact name; `report(target, {quiet})`;
  `stash(…, {detail})` (items-journal-16).
- **D-A3** CSS classes `.pentaryn-over-cap` → `.pentaryn-attunement-over-cap`,
  `.pentaryn-away-tip` → `.pentaryn-attunement-away-tip` (C37). Visual-neutral.
- **D-A4** `stash()` refuses to delete the owner's items, logs an error and rejects when the
  container accepted fewer copies than asked (items-journal-10). The copies it did accept stay in
  the container, bonded; the rejection names their ids (in the message and as `err.created`).
- A failing tooltip-guard install warns `tooltip guard skipped` and no longer stops the API publish
  (items-journal-39).
- A bonded item's bond is cleared with `_del` instead of the deprecated `-=bond` key.
- Console only: hook handler errors are logged as `pentaryn-attunement | <label>`, and strip
  listener failures as `pentaryn-attunement | <release|unattune|drop> failed` (items-journal-11).
- Kit 1.0.2 (J10): the frozen-root guard at `ready` is gone.

## 0.2.1 — 2026-10-11 (usability re-run, U-8-5)

- dnd5e 6.0.6 `Tooltips5e#_positionItemTooltip` is wrapped at `ready` to skip when the hovered row
  was re-rendered away (no anchor), ending the *reading 'getBoundingClientRect'* console errors.

## 0.2.0 — 2026-10-10 (dnd5e 6)

- Targets dnd5e 6.0 (verified 6.0.6); the suppressed-slot label reads `DND5E.EFFECT.Suppressed.Hint`.
- Away bonds: `stash()` moves items into a container tagged and bonded; attuned ones keep their slot
  and come home attuned in the same slot; coin purses pay out on arrival. An item coming home no
  longer writes its id twice into the slot flag.

## 0.1.0 — 2026-08-22

- The sidebar slot strip with stored slot order, over-cap warnings that never veto, the over-cap
  counter decoration, and the `armorProficienciesMap` fix for magic-item "Not Proficient".
