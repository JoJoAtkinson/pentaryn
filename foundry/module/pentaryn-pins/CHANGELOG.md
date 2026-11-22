# Changelog — Pentaryn Pins (`pentaryn-pins`)

## 0.5.3 — 2026-11-22

- **Fixed [declared]** A cross-scene pins teleport left the player's view where it was (live play-test round 7,
  R7-13): into the scene the player already viewed nothing is drawn, so core never panned, and back through the
  safety net's view the view sat at the scene's default centre. The pinned player's client now centres on the
  pinned token (a 250 ms pan) when it is created on the scene that client shows, and after any view pins itself
  asks for. New hook `createToken: arrival pan`.

## 0.5.2 — 2026-11-22

- **Fixed [declared]** `teleport` refused with AMBIGUOUS, and the audit reported MANY_TOKENS, when unlinked
  tokens of the pinned character's own actor lay on other scenes (live play-test round 6, R6-15). When the
  character has a linked token, an unlinked copy of that same actor is not the character and is left out of
  every pinned read (follow, teleport, gather, the menu, the audit); unlinked form tokens (wild shape,
  polymorph) always count, and a root with no linked token keeps all its tokens. New pure rule
  `characterTokens(cands)` in `pins-core.mjs`.

## 0.5.1 — 2026-11-22

- **Fixed [declared]** a right-click on a pentaryn-aoe wall break disc repaired the wall and also
  opened the GM canvas menu (live play-test round 1, D-5). The right press now records whether an
  interactive control on the controls layer (a pointer event mode and a hit area under it) was hit,
  read at the press because the disc's handler redraws it before the release; such a press never
  opens the menu.

## 0.5.0 — 2026-11-21

- **Added [declared]** a way back from a peek (triage A, `fpnsNR`: Marrith's player viewed the lobby
  and had to reload to get back). While a pinned player views another scene, the scene navigation
  shows a **"⟵ {character}"** tab, first in its active list; a click views the pinned token's scene
  and level with the token controlled (core pans to it), the same view an activation of the token's
  scene gives (`Scene#view` directly, so a pull received earlier never drops it). Drawn only when
  core draws no tab for that scene (not active, and not `navigation && visible`: the Pentaryn maps
  have navigation off), never on the pinned scene itself. GMs, unpinned players and the switch off:
  core's nav unchanged. Client DOM only, no document write; the pin is resolved again at the click.
  The world macro "Back to my character" stays as a fallback.
- New pure rule `pinnedNavTab(user, viewedSceneId, pinTokenScene)` in `pins-core.mjs`; follow.mjs
  registers `renderSceneNavigation` (label "renderSceneNavigation: back tab") and redraws `ui.nav` when
  the switch changes. Adjustments row `core-pins-scene-nav-tab`.
- Lang: `Nav.Back` "⟵ {name}", `Nav.BackHint`. Styles: `.ppi-nav-back`.
- Tests: `test/nav.test.mjs`; the fake DOM (`test/fixtures/dom.mjs`) reads `#id` selectors.

## 0.4.1 — 2026-11-19

"Teleport single…" lists with checkboxes (Joe: "it shows the list, and a checkbox so I can select one
or many"). Reload the GM tab; `module.json`'s version shows after the next restart. Additive, no API
row changes.

- **Changed** the Teleport single… dialog: a **checkbox per pinned character** instead of a dropdown
  (same rows, same order, same disabled reasons). Tick one or many and click **Teleport**: each ticked
  character runs the same `pins.teleport` to the clicked point, in list order, with its own toast;
  portals' *spreadArrivals* steps a later arrival off the square the first one took. No tick, Cancel,
  the X, or only disabled rows moves nothing. New pure helper `pickedUsers(form)` (exported from
  `canvas-menu.mjs`) reads the ticked values from one input or a RadioNodeList.
- Lang: `Single.Title` "Teleport pinned characters", `Single.Body`, `Single.Label` "Characters".
- Styles: `.ppi-single .ppi-checks` / `.ppi-check` (a scrolling column, disabled rows dimmed).

## 0.4.0 — 2026-11-19

"Teleport single…" (Joe, 2026-11-19: move a logged-off player's character, or one person while
everyone is logged on). Needs a Foundry restart for `module.json`'s version; the menu itself is a
reload. Additive: `CONTRACT` stays `pentaryn-pins/api@1`; no API row changes (`describe()` is the
same but for `version`).

- **Added** canvas-menu item **Teleport single…** (`fa-person-walking-dashed-line-arrow-right`), after
  Teleport pinned character ▸. Its note counts every pinned character ("no pinned characters"
  disables it). A click opens a DialogV2 with a dropdown of **every character that has a pin,
  whether or not its player is logged in**, as "{character} — {player} (online|offline)", by
  character name; a pin with no token or with several is listed but disabled, with the reason. The
  pick, confirmed with **Teleport**, runs the same `pins.teleport` as a Teleport ▸ row: same clicked
  point on the scene the GM views (another scene too), same company rule (summons and pets, a
  co-owned companion from within 10 ft; portals `teleportToken`), same pull for a logged-in player
  (`viewFollows`); an offline player's character moves with `pull: []` and the player lands on it at
  login (pentaryn-resume). Cancel, the X, or a disabled option moves nothing. Teleport ▸ keeps its
  rule (logged-in players only) beside it.
- **Added** pure rule `singleChoices(users, pinsByUser, tokenInfo)` in `pins-core.mjs` (the rows:
  every non-GM user with a pin; `NO_TOKEN` / `MANY_TOKENS` from `tokenInfo[root].count`). The menu's
  one read per open (`gatherInputs`, G9) now also feeds these rows; `tokenInfoOf` carries `count`.
- Lang: `Menu.TeleportSingle`, `Menu.TeleportSingleCount`, `Menu.TeleportSingleNone`,
  `Menu.ManyTokens` ("{n} tokens", also the Teleport ▸ note for a pin with several tokens, which
  said "no token"), and the `Single.*` dialog strings.
- Tests: `core.test` (singleChoices), `menu.test` (the item and its count, the dialog's rows and
  callback, offline → `pull: []`, online → `pull: [user]`, Cancel/X/disabled, a failed move's toast,
  no pins); the placement fixture is four rows tall.

## 0.3.0 — 2026-10-17

"Gather logged-in players here" (plan `context/plans/pin-2026-10-gather.md`, with Joe's answers in
its §11). Needs a Foundry restart (`module.json` version). Additive: `CONTRACT` stays
`pentaryn-pins/api@1`.

- **Added** API row `gather({ x, y, scene?, level?, dryRun })`: every logged-in non-GM player whose
  pin has exactly one token is moved, with the character's summons, pets and connected tokens, to
  one point (another scene or the same one) at one level, by calling `teleport` once per member in
  plan order (destination-scene members nearest the point first, then the rest by name). No
  picking. Skipped and reported: `NO_PIN`, `NO_ACTOR`, `SHARED_ACTOR`, `NO_TOKEN`, `MANY_TOKENS`;
  offline players listed in `offline` and left where they are; `UNLINKED` / `NOT_OWNER` pins moved
  with a warning; `COMBAT` marked from one snapshot of started combats taken before any move;
  `VIEW_UNCHANGED` folded from `teleport`. One member failing does not stop the others (`failed[]`,
  `warning: "PARTIAL"`). Refused while pinning is off (no `User#character` fallback), and while
  another gather runs (`CONFLICT`). The result keeps follower and pull names at any depth. Each
  `skipped` row carries the audit violation's own `detail` (code review G2). One token walk for the
  whole gather: the plan's records are re-read by id (`liveToken`) and moved through `teleport`'s
  own move, `moveTo` (G7). A shared companion portals held for a later member whose move then fails
  is carried alone beside the last owner that moved (G5).
- **Added** canvas-menu item **Gather logged-in players here** (`fa-people-group`) between Prompt
  note and Teleport pinned character: its note is the member count ("no one to gather" disables it);
  one click, with a confirm only when a cross-scene member is in a started combat; toasts for the
  result, the players not gathered (with the reason; SHARED_ACTOR once per actor, naming every
  co-pinned player, G2) and the views that did not follow. The menu reads the pin world once per
  open (`gatherInputs`: one token walk, each pin once) for both Gather's count and Teleport ▸ (G9).
- **Added** the gather clause in `prepull.mjs`: a gather member's own carry (portals ≥ 0.8.0 hands
  that call's `opts.gather` to the hook as `data.gather`, a per-call mark: code review G6) drops
  every non-GM user (each member is pulled once, by their own move; an unpinned or skipped player
  watching it is not pulled along). Any other pull, even one of a member's token while a gather
  runs, keeps the listener's old rule.
- **Added** `selftest` check "prePull listener registered" (gather depends on it).
- **Uses** pentaryn-portals 0.8.0 `teleportToken` `gather: { later }`, so a companion several
  gathered players co-own always comes, beside the last-moved of them; on any single move it comes
  only from within 10 ft of the moving owner (portals' co-owned companion rule, Joe 2026-10-17).
- A same-scene `teleport` (and so a same-scene gather member) always pulls the player, onto
  another floor too (CR2, kept; code review G1 removed a GM-side prediction of core's level switch
  that read the GM's lagging copy of the player's view). Core's own level switch may run beside it:
  the second view is a no-op or dropped and is replayed only when it still changes the view.
- **Changed** on the player's client, one sequence orders every pull and every view pins asks for
  itself (the safety net's cut, the level gap-filler): such a view drops an OLDER pull core dropped
  while loading, so that stale pull is never replayed over it, and is itself dropped when a pull
  arrived after it was queued (code review G4). A dropped pull whose scene and level the canvas
  already shows once loading clears is not replayed (G1).
- **Changed** the Stranded toast (a pinned character with no token left) now says what happens: until
  it is placed again, scene activation moves that player as stock (the pin has no target). It said
  the view stays where it is.
- The published `teleport` takes no `gather` option; only `gather` passes it to portals.
- `world-adapter.mjs` `pinInputs` is the one builder of the plain pin world: `auditWorld` reads it
  with the GMs' pins, `gatherInputs` without (code review G8).
- Docs: the module README notes the `pullToScene` replay is attached at `ready` (it said `setup`).
- Live runner `automation/smoke/pins-live.mjs`: S20-S23 (Gather), S24-S27 (the co-owned steed:
  fixture actor `PinTest Steed`, owned by A and B), S14 checks all three menu items; a page probe
  counts each player's `pullToScene` arrivals.

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
