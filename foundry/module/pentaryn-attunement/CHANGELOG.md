# Changelog — Pentaryn Attunement Slots (`pentaryn-attunement`)

## Unreleased — 2026-10-12 (overnight FX batch 4)

The version stays 0.3.0 until the next `module.json` restart batch (code only: sync + reload).

- **[declared] M1:** `stash` builds the copies' id list through one private `idsOf(made)` helper,
  called in the shortfall branch and on the success path (was: the same `.map` written twice). Not
  hoisted, so the shortfall check runs first and the failure path's writes and `console.error` are
  unchanged (unlike the reverted 535780c9); no change in play. `test/stash-safety.test.mjs`.
- **[declared] perf-1:** a drop onto a slot re-renders the sheet once. The write order stays
  (items, then the slot flag, so preUpdateItem and the `swapFrom` swap still fire), but the item
  write passes `render: false`, so the sheet no longer first draws the new item in the wrong hole.
  When the slot flag would not change (the item still holds that slot after an ✕), the item write
  keeps its render, as that flag write renders nothing. `test/strip.test.mjs`.
- **[declared] M11:** `restoreBond` (preCreateItem) no longer writes `options["pentaryn-attunement"].bond`.
  Nothing read that tag, and the batch's shared options namespace now holds only the over-cap
  count (`pending`) and `swapFrom`; the unused `data`/`options` parameters are gone.
  `test/glue.test.mjs` asserts options is left untouched.
- **[declared] EC-10:** the over-cap warning uses the strip's cap. A new pure `capOf(att)` in the
  core (a finite `attunement.max`, floored at 0, else 3) feeds `computeSlots` and `warnOverCap`'s
  threshold and its `{max}` placeholder, so an actor with no (or a NaN) `max` warns at 3 and the toast
  says 3 (was: warned on every attune and said "attuned to undefined items").
  `test/core-meta.test.mjs`, `test/glue.test.mjs`.
- **[declared] ATT-ROB-6:** the legacy `computeSlots(actor)` / `away(actor)` pass an object through
  only when it is actor-like (has `items` and `getFlag`); any other object is a miss, so
  `computeSlots` returns `null` and `away` returns `[]`, as for a name that matches nothing (was:
  every object passed through and `computeSlots` threw an uncoded TypeError). `test/api.test.mjs`.
- **[declared] EXT-8:** `selftest()`'s "item hooks and the sheet hook registered" check now
  checks each hook by name (`sheet.mjs` and `bonds.mjs` export a frozen `HOOK_NAMES`; the entry
  passes them to the API) and its `detail` lists the missing names, `null` when none (was: passed on
  any four registrations, detail the count). `test/api.test.mjs`.
- **[declared] EC-6:** `report(target)` falls back to the controlled token only when no target is
  given. A string that names no actor (by id, then name) or a non-Actor object now returns
  `undefined` with the `no actor` warn, which names the string (was: silently reported the
  controlled token's actor). `test/glue.test.mjs`.
- **[declared] ATT-AC-3:** two overlapping `stash` calls on one owner now keep both away entries
  (was: the second write dropped the first one's), and two overlapping slot drops each keep the slot
  they were dropped on. Both now run on the per-actor chain the slot hand-back uses (`serial`, moved
  from `bonds.mjs` to `actor-adapter.mjs`; `uninstall()` still clears it), planning inside the step;
  a lone stash or drop runs at once, with today's timing. `test/overlap.test.mjs`.
- **[declared] ATT-AC-2-residual:** the README (Two sessions / who writes) now says an Item Piles
  currency transfer in the same take-all is written by Item Piles with an absolute value outside
  the purse chain, and that the purse's 750 ms claim settle orders the payout after it. Docs only;
  `test/docs.test.mjs` guards the sentence.
- **[declared] EXT-6:** `describe().flags.writes` and the README Data written table now list the
  item claim flags `flags.pentaryn-attunement.claims.coinBack` and `.claims.home` that
  `claimDocument` writes (a separate `CLAIMS` list in the manifest; `stash`'s side effects are
  unchanged). `test/flags-written.test.mjs` scans the sources so a new flag write cannot go unlisted.
- **[declared] EC-5:** stashing an attuned item and a plain item of the same name (an attuned
  Torch, then a stack of Torches) now gives two copies in the box; the plain stack used to be folded
  into the bonded attuned copy, so it came home with the attuned item. `planStash` registers only
  mergeable copies (not containers, not attuned) as merge targets.
- **[declared] EC-4:** a batch that attunes several items, or creates several already attuned, now
  warns for the first item past the cap and every one after it (was: no warning, since none of the
  batch's writes had landed when each pre-hook read the count). The pre-hooks count the batch's
  attunes in its shared options (`options["pentaryn-attunement"].pending`); `restoreBond` merges its
  `bond` tag into that object instead of replacing it. Still a warning, never a veto.
- **[declared] ATT-AC-1-residual:** an item coming home is claimed (kit `claimDocument`, key
  `flags.pentaryn-attunement.claims.home` on the item, 750 ms settle) before the bond is cleared and
  the slot handed back, as the coin purse is. The MCP bridge tab and a GM browser tab each kept their
  own hand-back chain, so a two-item batch could write the actor twice per item and leave a phantom
  away slot; now one tab hands each item back (one write, one toast). The winner deletes the claim in
  the same update that deletes the bond; `restoreBond` clears a stale `claims.home` copied with an
  item. The slot lights up about 750 ms later than before.
- **[declared] W2-A1 follow-up:** `restoreBond` (preCreateItem, non-pile actor) clears a stale
  `flags.pentaryn-attunement.claims.coinBack`. A purse copied inside another actor's 750 ms claim
  window carried that tab's socket stamp, so every tab on the new actor read the claim as held and
  stood down — the coin was never paid. Now the purse is claimed afresh and pays once. A purse
  arriving in an Item Piles pile keeps its stamp (it never pays there).
- **[declared] EC-3:** dropping an item onto a filled slot at the cap no longer warns "makes 4".
  The drop passes `swapFrom` (the occupant) in the update options and the over-cap warning
  subtracts it, since the occupant is unattuned in the same batch. A drop into an empty slot still warns.
- **[declared] ATT-AC-2:** two bonded Coin Purses taken in one batch both pay (gp 10 + 5 + 3 = 18,
  was 13). Payouts run in turn on a per-actor chain keyed `actor.uuid + ":coin"`, separate from the
  slot hand-back chain, so hand-back timing is unchanged and a lone purse pays in the same ticks.
- **[declared] ATT-ROB-2:** `stash` keys the bond on the owner's uuid (`bond.actor`), and the bond
  restore and hand-back match on it (`isBondOwner`). Unlinked tokens share their base actor's id, so
  an item stashed from token A used to come home equipped, and lose its bond, on token B or the base
  actor. Now only token A gets it back; elsewhere only the tag goes and the bond stays. A legacy bond
  holding the bare id still matches on the id, as before.
- **[declared] lang-switch (guide step 8):** the strings now come from `lang/en.json` through
  `_loc("PENTARYN_ATTUNEMENT.X", data)`; the inline `STRINGS` / `t()` are gone. The English is
  byte-identical, so nothing reads differently, but a fix or translation in the lang file now reaches
  the sheet and the toasts. Needs `languages` live (it is in `module.json` since 0.3.0): if the running
  world predates that, a restart, otherwise a reload. Retires the C35 exception.

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
