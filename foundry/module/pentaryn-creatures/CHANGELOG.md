# Changelog — pentaryn-creatures

## 0.2.0 — 2026-10-19 (feedback Swrl5M, UQSJ0v, dkt5PG)

- **Summon library.** A player whose role may not create actors (the Player role; Trusted may) can
  summon from a compendium again. dnd5e 6.0.6's `Actor5e.fetchExisting` refused them with "You must
  have 'Create New Actors' permission in order to summon directly from a compendium" (Marwen's Mage
  Hand and Find Familiar, 2026-10-19; Marrith, Trusted, was never affected). The wrap lets dnd5e try
  first; on that refusal the active GM makes the copy through the relay query
  `pentaryn-creatures.summonActor`: owned by the player and the character's owners, in
  `PC Summons & Forms/<First name> — summons & forms`, flagged so dnd5e reuses it on every later
  summon. The GM copies only what the item's summon activities can summon (a profile, or a
  compendium NPC within a CR summon's CR and types) and only for the character's owner.
  Deterministic ids keep two GM tabs from making two copies.
- New setting `summonLibrary` (world, on). New API rows `summonActor` (relay, write, `dryRun`) and
  `library(ref)`; `status()` adds `summonLibrary` and `summonPatched`. New adjustments row
  `creatures-summon-library`. `core` exports the pure rules (`summonAllowed`, `shouldRelaySummon`,
  `libraryActorId`, `libraryOwnership`, `libraryFolderName`, `stableId`, …).

## Unreleased (addon-blueprint migration, wave 3)

Code layout follows the blueprint (entry, core, settings, tokens adapter, the `light`,
`creature-strip` and `owner-sees` features, the strip UI, API manifest); the kit is vendored. What
a player or GM can notice:

- **[declared] C-D1** — console only: a libWrapper registration failure prints
  `libWrapper registration failed, wrapping by hand` (was `…, patching directly`); an
  owner-override failure warns once per session (`owner override failed`) instead of vanishing.
- **[declared] C-D2** — `game.pentaryn.creatures` is a frozen, kit-built API published at `ready`
  (not one tick later), also as `game.modules.get("pentaryn-creatures").api`, with `describe()`,
  `version`, `contract`, `settings()`, `trace()`, `uninstall()`; it fires
  `pentaryn-creatures.ready` and `pentaryn.ready`. Existing methods keep their signatures.
- **[declared] C-D3** — `syncScene(scene, ids)` takes an array, one id or token documents (an array
  used to throw); `ownerSees(tokenDocument)` answers for its placeable; new `status()` and
  `inspect(ref, { as })`.
- **[declared] C-D4** — the strip's CSS is scoped on `#pentaryn-creatures.pcr-strip`; it should
  look the same.
- **[declared] C-D5** — a summon's light appears at most 200 ms after the first change, even
  under heavy token traffic (the queue was a debounce that traffic could postpone).
- **[declared] C-D6** — dragging tokens no longer re-runs the strip.
- **[declared] C-D7** — no second, no-op light pass after our own write.
- **[declared] C-D8** — the strip's Combat HUD poll runs only with Argon enabled and
  `floatOverHud` on, and writes styles only when the dock changes; turning `floatOverHud` off or on
  applies at once.
- **[declared] creatures-edge-1** — `uninstall()` also drops the settings' change handlers: after
  a hot-patch uninstall, toggling `showStrip` no longer redraws the strip (or its dock poll) and a
  `lightRadius` change no longer rewrites every light; re-importing the entry wires them again.
- **[declared] creatures-rob-1** — `list(user, scene)` accepts a user and scene by id, uuid or
  exact name (what the bridge sends): `list("<userId>", scene)` now answers as that player, not at
  the actor's default ownership. An unknown user or scene throws `NOT_FOUND`.
- **[declared] creatures-rob-2** — `list(null, scene)` and `list(user, null)` treat `null` as
  omitted (this client's user, the viewed scene) instead of throwing a `TypeError` / answering `[]`.
- **[declared] creatures-rob-3** — `syncAll` (run at `ready` and on a `lightRadius` change) no
  longer stops at the first scene whose write fails: that scene is one console warning naming it
  (`light sync failed on <scene>`, was a scene-less `light sync failed`) and every later scene still
  gets its lights; the returned count covers the scenes that succeeded.
- **[declared] creatures-edge-3** — the "Your creatures" strip redraws at most 60 ms after the
  first change, even under steady token flag traffic in combat (the redraw was a debounce that
  traffic could postpone indefinitely); a quick burst still draws once.
- **[declared] creatures-rob-4** — `syncScene(scene, ids)` accepts the scene by id, uuid or exact
  name (what the bridge sends); a missing or unknown scene rejects with a coded `BAD_ARGS` /
  `NOT_FOUND` on every client (was a raw `TypeError` on the active GM and a silent `0` elsewhere).
  A player client with a valid scene still resolves `0`.
- **[declared] creatures-rob-5** — `isCreature(token)` reads a Token placeable through its
  document, so a placeable answers like its document (it used to miss token-level flags and call an
  Item Piles chest or a pentaryn-aoe area handle a creature); `isCreature(null)` answers `false`
  instead of throwing a `TypeError`.
- **[declared] creatures-M8** — docs only: the entry's file list is headed "Files (core first,
  then the features, then the API):" (it claimed "in load order", which the imports do not follow).
- **[declared] creatures-ext-9** — tests only: a guard fails the suite when a `SETTINGS` row is
  missing from `status()` or from its manifest row's `returns` (status() hard-codes its settings).

## 0.1.1 — 2026-10-10

- dnd5e 6.0 declared (verified 6.0.6); nothing the module reads moved.
- 2026-10-11, same version: the strip floats above Argon's Combat HUD while it is open (usability
  re-run U-6-12; setting `floatOverHud`).

## 0.1.0 — 2026-10-10

- First version (table feedback item C3): the creature light, owners always see their own tokens,
  the "Your creatures" strip.
