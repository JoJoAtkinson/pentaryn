# Changelog — Pentaryn Attunement Slots (`pentaryn-attunement`)

## Unreleased — 2026-10-12 (overnight FX batch 4)

The version stays 0.3.0 until the next `module.json` restart batch (code only: sync + reload).

- **[declared] W2-A1 follow-up:** `restoreBond` (preCreateItem, non-pile actor) clears a stale
  `flags.pentaryn-attunement.claims.coinBack`. A purse copied inside another actor's 750 ms claim
  window carried that tab's socket stamp, so every tab on the new actor read the claim as held and
  stood down — the coin was never paid. Now the purse is claimed afresh and pays once. A purse
  arriving in an Item Piles pile keeps its stamp (it never pays there).
- **[declared] ATT-AC-2:** two bonded Coin Purses taken in one batch both pay (gp 10 + 5 + 3 = 18,
  was 13). Payouts run in turn on a per-actor chain keyed `actor.uuid + ":coin"`, separate from the
  slot hand-back chain, so hand-back timing is unchanged and a lone purse pays in the same ticks.
- **[declared] ATT-ROB-2:** `stash` keys the bond on the owner's uuid (`bond.actor`), and the bond
  restore and hand-back match on it (`isBondOwner`). Unlinked tokens share their base actor's id, so
  an item stashed from token A used to come home equipped, and lose its bond, on token B or the base
  actor. Now only token A gets it back; elsewhere only the tag goes and the bond stays. A legacy bond
  holding the bare id still matches on the id, as before.

## 0.3.0 — 2026-10-12 (Wave 7 restart batch, wave 5; kit 1.1.0)

Releases the wave-2 blueprint migration (next section) and overnight FX batch 2 (W2-A1, W2-A2)
together with the batch: `version` 0.2.1 → 0.3.0 with `attunement-core.mjs` `VERSION`.


`module.json`: `flags.pentaryn` blueprint keys (`flagScope` `attunement` → `pentaryn-attunement`,
manifest-only), `recommends` item-piles, `minimum: "14"`, `verified: "14.369"`,
`styles/attunement.css` (moved), `languages` + `lang/en.json` (STRINGS verbatim, inert until the
`_loc` step). The `stash` and `releaseAway` rows say "eval-js only" (live Actor params; C62).

## Released in 0.3.0 — 2026-10-11 (migrated to the addon blueprint, wave 2; kit 1.0.2)

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
  container accepted fewer copies than asked (items-journal-10). The rejection names the copies
  the container did accept (in the message and as `err.created`). **W2-A2** (Joe 2026-10-12): those
  copies are rolled back (`container.deleteEmbeddedDocuments`) before the rejection, so a shortfall
  leaves nothing behind; `err.rolledBack` says whether that worked, and a failed rollback's message
  says why and that the copies are still there.
- **W2-A1** (Joe 2026-10-12) A returning coin purse pays once with two tabs open on one account
  (the MCP bridge tab plus a GM browser tab): `createItem` claims the purse item
  (`flags.pentaryn-attunement.claims.coinBack`, kit `election` vendored) and pays 750 ms later in
  the winning tab only.
- A failing tooltip-guard install warns `tooltip guard skipped` and no longer stops the API publish
  (items-journal-39).
- A bonded item's bond is cleared with `_del` instead of the deprecated `-=bond` key.
- Console only: hook handler errors are logged as `pentaryn-attunement | <label>`, and strip
  listener failures as `pentaryn-attunement | <release|unattune|drop> failed` (items-journal-11).
- Console only: a successful `stash()` logs one info line, `pentaryn-attunement | stash: <n> moved to
  <container>`, with the owner and container ids, the copies' ids and names, and `by` (items-journal-10).
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
