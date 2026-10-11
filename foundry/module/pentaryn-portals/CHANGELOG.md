# Changelog — pentaryn-portals

## Unreleased (addon-blueprint migration, wave 3)

Code layout follows the blueprint (entry, core, settings, scene adapter, the `party`, `badges` and
`cards` features, the card window, API manifest); the kit is vendored. What a player or GM can
notice:

- **[declared] D-P1** — `game.pentaryn.portals` is a frozen, kit-built API published at `ready`
  (not one tick later), also as `game.modules.get("pentaryn-portals").api`, with `describe()`,
  `version`, `contract`, `settings()`, `trace()`, `uninstall()`; it fires `pentaryn-portals.ready`
  and `pentaryn.ready`. The old members keep their signatures.
- New API members (additive): `inspect`, `destinations`, `link`, `unlink`, `badges`.
- **[declared] S7** — every class portals puts in the DOM starts `ppt-` (was `pp-`, prompts'
  prefix); the root classes are `ppt-app` and `ppt-dialog`. No visual change intended.
- **[declared] D-P3** — the six region/behavior hooks redraw the badges once, 50 ms after a burst,
  instead of once per write.
- **[declared] D-P4** — with two GM tabs open, the tab that loses the follower carry stays quiet
  (no false "summons did not follow").
- **[declared] D-P5** — `cardFor(null)` returns `null` (it threw); `teleportParty` returns
  `{ moved, cancelled }` (it returned `undefined`).
- **[declared] D-P6** — an arriving PC no longer steps off a square held only by an aoe handle
  flagged on its actor.
- **[declared]** a snapshot whose image cannot load rejects `portal snapshot: cannot load <src>`.
- Console only: a broken card image warns once per path; failed card-window writes log with a
  label; the other expected failures log at debug (`CONFIG.debug["pentaryn-portals"] = true`).
- The card window's clear-image button deletes the flag with `_del` (the `-=img` key is deprecated).

## 0.4.4 — 2026-10-11

- Badge redraw race: the badges wait for each destination's thumbnail; a scene activation or a
  second redraw during that wait left the first draw adding to a torn-down layer (`TypeError …
  reading 'addChild'` on a player client). Each draw carries a run number; canvas teardown and any
  newer draw retire it (usability U-9-6).
- Teleport is the default answer: the core question opens with Teleport focused (setting
  `teleportDefault`, U-6-13).
- Arrivals step off an occupied square (setting `spreadArrivals`; `spreadArrival(tokenDoc)`, U-6-13).
- Teleport party asks first, lands each follower by its PC and leaves aoe area handles behind
  (setting `confirmPartyTeleport`, U-8-4).
- A plain teleport question: "Teleport X to <card title>?" (U-8-4).

## 0.4.2

- dnd5e 6: declares dnd5e 6.0 (verified 6.0.6); `flags.dnd5e.summon.origin` and
  `flags.dnd5e.isPolymorphed` are unchanged.

## 0.4.1

- Same-scene links: core 14.368+ stores a same-scene destination relative to its behavior
  (`..<regionId>`); every entry is resolved against its behavior and compared by absolute uuid, so
  cards, badges, Look and Unlink work for same-scene links.

## 0.4.0

- Teleport party carries summons, familiars, steeds and transformed forms; never piles, Markers or
  crowd. Summons follow their PC through a link to another scene.

## 0.3.0

- Players see a badge only once its square has been in sight or explored; then it stays.
