# Changelog — Pentaryn Pins (`pentaryn-pins`)

## 0.1.0 — 2026-10-17

First version (design `context/plans/pin-2026-10.md`). Generated from the addon blueprint (tier
`full`, kit `patch` + `patch-libwrapper`, dnd5e), example code replaced.

- World switch `pinning` (default off; everything inert while off).
- Pins on the User (`flags.pentaryn-pins.actor`, the root actor id), set and cleared only through
  the API: `pin`, `unpin`, `pins`, `pinnedToken`, `audit`, `teleport`, `inspect`, `selftest`.
- A pinned player's client follows the scene of their pinned token: `Scene#view` and
  `Scene#_onActivate` patches (adjustments `pins-scene-view`, `pins-scene-activate`) plus a view
  queue that never reaches core while the canvas is loading. Wild shape keeps the pin (dnd5e
  `originalActor`).
- "Pinned to {player}" on the actor sheet header.
- GM right-click canvas menu: Prompt note (pentaryn-prompts `place` with `at`), Teleport pinned
  character (pentaryn-portals `teleportToken`, the company comes along).
- Switching it on audits the pins (toast on the GM client that did it, `audited` event,
  `audit()` for the bridge).
- Review fixes (before release):
  - A move is followed when it completes. After any delete of the character's token, the player
    is sent to the token that is left, so a GM deleting the copy the player was viewing no longer
    strands them. Copying the token, or dragging the actor in while the original stands, is not
    followed.
  - A view let through before core sets `canvas.loading` counts as in flight, so each move draws
    once.
  - The canvas menu opens on a real board again. The press is recorded on window capture, before
    PIXI claims the stage's mouse manager.
  - Other menu fixes:
    - It uses core's 10 px drag threshold.
    - It refuses a pan that came back to its start, and core's token or region placement.
    - It ignores tokens the GM cannot see or that are on another level.
    - It stays inside the window and closes on a canvas pan.
    - Escape closes only the menu.
  - The badge:
    - It is opaque, so it reads on NPC sheets in the light theme.
    - It is hidden on minimized windows.
    - It ignores GMs.
    - It re-renders when the user is renamed, promoted or deleted.
  - API changes:
    - `pinnedToken` is null for a GM.
    - `pin` and the audit warn `NOT_OWNER` when the player cannot observe the actor.
    - `teleport` warns `VIEW_UNCHANGED` only with the switch off, and reports `online`.
    - `inspect` takes no options (`as` was ignored).
    - The `followed` event no longer lists `activate`, a reason that was never emitted.
- Code review 2026-10-17 (max), same 0.1.0 (ledger `context/plans/pin-2026-10-review-max-fixes.md`):
  - **M1/E1** `audit()` (and `pin().audit`) returned `tokens` as "[max depth]": no depth cap now.
  - **M2/E3/D5** `inspect` ignores options, so the root `game.pentaryn.inspect(ref, { kind })` works.
  - **D4** a user name with a dot ("Mr. Talo") is a user; only a real uuid goes straight to its kind.
  - **D6** `pin` with `replace` is undone when a write is vetoed (`REFUSED`) or throws (`INTERNAL`),
    with `restored`.
  - **E2/B4** a redirected or re-levelled view controls the pinned token (`controlledTokens`), only
    when the asked view named controlledTokens.
  - **A1-3** the delete follow checks the level too (pins-delete-level, was a Known gap).
  - **B1** a token on an orphan level id is followed by scene only: no endless redraw.
  - **R2** the off-screen pan is core's `Token#panCanvas`, only for a drawn, uncontrolled token
    (no double pan). **F1** plain own moves skip the world walk.
  - **F2** a pin, rename or switch change redraws the sheet badge in place, never a full sheet render.
  - **F4** the canvas menu's hit test runs only when the cheap gates (GM, switch, token layer) pass.
  - **R4/R5/R6** one transform-flag reader, `tokensOfRoot` on `tokensByRoots`, dead `menuElement` gone.
  - **F-follow-ctl** every view pins starts itself (a level change, a transform, a pin change,
    switching on, the queued retry) names the pinned token in `controlledTokens` when the player
    owns it, so core controls and pans to the PC rather than `game.user.character` or the first
    owned token on that level.
  - **L4** when the GM deletes the level a pinned player is viewing, core's own view of the scene's
    initial level (`Level._onDeleteOperation`) is no longer counted as the player's choice: a
    `deleteLevel` mark sends the view back to the token's level. A level the player chose that is
    deleted is forgotten. One more hook (`deleteLevel: core's fallback view`), no new patch.
