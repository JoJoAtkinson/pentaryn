# Changelog — Pentaryn Pins (`pentaryn-pins`)

## 0.2.0 — 2026-10-17

Rebuilt on Foundry's own pull (plan `context/plans/pin-2026-10-rebuild.md`, review
`context/plans/pin-2026-10-design-review.md` Simplify 1, 2, 4 and Risks). A token's move reaches the
pinned player the way core moves anyone: whoever moves it pulls them.

- **Removed** the `Scene#view` patch (adjustments `pins-scene-view`) and the client view queue
  (`viewDecision`, `queueDecision`, `followNeeded`, the settle loop, the `onAny` pull mark, the
  "latest token" map, the login/`canvasReady`/`updateToken`/`updateUser`/`deleteLevel` follows,
  `TOAST_EVERY_MS`/`SETTLE_*`). The "Your view follows" note is gone.
- **Kept** the `Scene#_onActivate` patch (activation of another scene still ignored). New: activating
  the token's own scene while the player looks elsewhere views the token's level with the token
  controlled.
- **Added**, on the pinned player's client: a `deleteToken` safety net (1.5 s after a delete of the
  pinned token on the viewed scene, view where it went if nobody pulled them: a GM cut-and-paste; a
  loading canvas is waited out), a `moveToken` level gap-filler (only where core's own level switch
  will not follow; adjustments `core-pins-level-switch-rule`), and a replay of a `pullToScene` core
  dropped while loading (adjustments `core-pins-pull-replay`). `followed` reasons are now
  `cut|level|retry`.
- **GM side**: `pin()` with the switch on pulls an online player to their token; switching pinning on
  pulls every online pinned player (same GM client that audits); `teleport` passes `pull: [user]` to
  portals `teleportToken` (portals ≥ 0.7.0) and reads `viewFollows` from its `pulled`; a same-scene
  `teleport` pulls back an online player who is looking at another scene (review F1). `pin()` and the
  switch-on pull without an "already there" check: the GM's copy of the player's view lags a draw in
  progress, and a pull to what is drawn draws nothing (review F1).
- **New** `watch.mjs`: a GM toast when a pinned character loses its only token (Stranded) or gains a
  second one (Paused); debounced, so a move never toasts.
- **Behaviour changes** (declared, Joe 2026-10-17): a GM "Pull to Scene" moves pinned players too; a
  pinned player may click the scene nav to look at another map; login is resume's (pentaryn-resume
  0.2.0: one extra draw when the active scene is not the token's); a level the player picked is not
  remembered; an uncontrolled token moved off-screen no longer pans their camera.
- **Code review 2026-10-17** (resolve-all pass, `context/plans/pin-2026-10-rebuild.md`):
  - one GM pull helper, `world-adapter.mjs` `pullToPin`, used by `pin()`, a same-scene `teleport`,
    the switch-on and the placed-again pull; never skipped on the GM's lagging `viewedScene` (CR2, CR8).
    Re-pinning the same actor pulls nobody (CR9).
  - `tokenPermits` asks `TokenDocument#testUserPermission` only, never `doc.actor` (CR4); the level
    gap-filler's "owns another sighted token" clause is the kit's `lib/pull-rule.mjs` (CR8, shared
    with portals; adjustments `core-kit-pull-rule`).
  - **New** `prepull.mjs`: listens to `pentaryn-portals.prePull` and drops a player pinned to a token
    on another scene, in one token walk (`pinTargets`); portals no longer calls pins (CR3, CR7).
    **New** API `pinnedTokens()` (every pin in one walk).
  - the pull replay: a pull core honours clears a held dropped one, so a stale pull is never replayed
    over a newer one (CR1); its socket listener is attached at `ready`, after core's own (RF3).
  - the safety net keeps a floor the player chose when the token is deleted and replaced on the same
    level (CR5).
  - a pinned character placed again after its last token went (0 → 1 token): the active GM pulls its
    online player to it (RF1); the Stranded toast says so (RF4).
  - `module.json` recommends pentaryn-resume (login) (RF2).
- `module.json` changed (version, description, recommends): restart Foundry after a sync.

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
