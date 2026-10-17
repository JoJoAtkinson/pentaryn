---
title: Pentaryn Pins — design review (2026-10-17)
status: active
last_modified: 2026-10-17
tags: [foundry, module, plan, review, pentaryn-pins, pentaryn-portals, pentaryn-resume]
---

# Pentaryn Pins — design review

**Read this when:** you are deciding whether to keep, trim or rebuild `pentaryn-pins` and the
portals / prompts / resume changes that shipped with it on 2026-10-17, or you want the leanest
design that meets Joe's goal. **Not this file:** the design → [`pin-2026-10.md`](pin-2026-10.md)
· using it → [`../foundry/pins.md`](../foundry/pins.md) · line-level bugs → the separate code review.
Line numbers are from the tree as it stood during the review and may have drifted; function names
are the anchors.

## Verdict

The goal is right and a module for it is justified: a pin stored on the User
(`flags.pentaryn-pins.actor`, root actor id), one token per character, `teleportToken` reusing
portals' follower rule, and a sheet badge are all well judged. The *mechanism* is over-built by
roughly 3x. About 360 lines in `follow.mjs`, three pure rules in `pins-core.mjs`, and half the
786-line glue suite exist to guarantee two properties Joe never asked for: that a pinned client
draws **exactly one** scene on every path (login, pull, nav click, move) and never sees core's
"cannot switch Scenes" toast, and that a player's own level pick survives while a GM's does not.
Those properties are what make the `Scene#view` patch, the view queue, the settle timer, the
`inflight` / `imposed` / `choice` state and the `socket.onAny` listener necessary. Core already has
the per-user primitive the design routes around: `Scene#pullUsers` → `pullToScene` → `Scene#view`
(`client/documents/scene.mjs:221-231`, `collections/scenes.mjs:111-114`), and core's own Teleport
Token behaviour already pulls the owner to the token's new scene and level
(`client/data/region-behaviors/teleport-token.mjs:146-159`). The design switched that off in
`moveCompany` ("no pull, no view") and rebuilt it on the player's client. Only one thing in the
whole feature has no core hook: ignoring a scene **activation**, and that needs one 10-line wrapper
on `Scene#_onActivate`, not two patches and a queue. Separately, the bridge's `switch-scene` tool
**activates** rather than views (`foundry-vtt-mcp/packages/foundry-module/src/data-access.ts:7264`),
which is the most likely source of "activating a scene jumps everyone" and is untouched. The 2,400-line
live runner plus a 200-line Python fd-pipe feature built for it is out of proportion to a feature
whose decisions are already pure and unit-tested.

## Keep

- **Pin on the User, keyed by root actor id** (`world-adapter.mjs` `rootOfToken`, kit
  `foundry/lib/root-actor.mjs`). One actor per user by structure; dnd5e `transformInto` rewrites
  `actorId` in place, so without the root rule a wild-shaped druid would lose the pin. Sharing the
  rule with portals through the kit (code review #11) is the right fix for two modules disagreeing.
- **`teleportToken` in portals, not pins** (`scene-adapter.mjs` `moveCompany`). It reuses
  `recordOf`, `followersOf`, `landingPlaces`, `carryTo`; the company rule is identical to portal
  travel, which was the hard no-regression requirement. The level and elevation fixes
  (`displaceToLevel`, `elevationPatch`) are real bugs fixed, not scope creep.
- **`pins.teleport` as a thin user→token resolver** over `portals.teleportToken` (`api.mjs`
  `teleport`). Correct layering; no follower code copied.
- **Everything inert while the switch is off**, read live (`settings.mjs` `setting("pinning")`
  inside the wrappers). Cheap to turn off at the table if it misbehaves.
- **The switch-on audit as a pure function** (`pins-core.mjs` `auditPins`) returning data, with
  the toast only where `userId === game.user.id` (`switch.mjs`). Deletes nothing. Good.
- **The sheet badge** (`sheet.mjs`, 80 lines, one hook, text via `textContent`). Proportionate.
- **Resume defers to the pin at login** (`resume-core.mjs` `resumeTarget` with `pinnedScene`).
  The pure input with a fixture table is the right shape; see Simplify 4 for who should own it.
- **`prompts.place({ at })`** — a 4-line additive option; exactly the right size.
- The design doc's two-pass review record (blockers verified against Foundry source with line
  cites) is the standard every plan should meet.

## Simplify

Ranked by lines removed per unit of risk. Line counts are source + tests, approximate.

### 1. Drop the `Scene#view` patch and the view queue; keep only the `_onActivate` wrapper

**What it is for.** `follow.mjs` `onView` redirects every view a pinned client starts (login
draw, GM pull, nav click, resume, TeleportToken's pull, portals' `pullUsers`) to the token's scene,
and `request` / `settle` / `tick` / `inflight` / `queueDecision` make sure a second view never
reaches core while `canvas.loading` (the toast at `scene.mjs:264`). `imposed`, `choice`, the
`socket.onAny("pullToScene")` mark and `followNeeded` exist so that a level the *player* picks
survives but a level a *GM pull* picks does not (`viewDecision`, code review #1).

**Why it is excess.** Each of those paths has a cheaper answer:

| Path | Today | Instead |
|---|---|---|
| Login draw | redirect inside the patch, "one draw" | resume already views at `ready` (`memory.mjs` `resume`); one extra draw of the active scene at login, ~1-2 s. D4 rejected this for "textures, playlist, region events"; that cost is paid once per login and only when the active scene differs. |
| GM pull / "Pull users to scene" | ignored for pinned players | a pull **is** the move primitive (Simplify 2). Honour it. |
| Player nav click | redirected + "Your view follows" toast every 10 s | let it pass. A split party watching the other half's map is a feature, not a bug. If Joe wants it blocked, `scene.navigation = false` on scenes players should not browse is a core setting. |
| Token moved by the GM menu / portals / core region | player-side `createToken: follow` races core's pull; the queue de-duplicates | the mover pulls the owner once (Simplify 2); the player's client views nothing on its own. No race, no toast, no queue. |
| GM cut-and-paste across scenes (no mover) | `deleteToken: follow` | keep a 20-line `deleteToken` hook: if the remaining token is on another scene and `!canvas.loading`, `scene.view()`; else `Hooks.once("canvasReady", () => setTimeout(view, 0))`. Or drop it and document "move pinned characters with the menu". |
| Level follow on the same scene | `updateToken: follow` + `choice` bookkeeping | `scene.view({ level })` when the pinned token's level changes and it is not the viewed level. No memory of what the player chose. |

The `_onActivate` wrapper stays: `_onActivate` is called straight from `_onUpdateOperation`
(`scene.mjs:1359-1360`) with no hook between the socket update and `this.view()`, so it is the
one genuinely patch-only behaviour. `activateDecision` is 6 lines; keep it.

**Removes:** `onView`, `request`, `settle`, `tick`, `reconcile`, `installSocket`, `inflight`,
`settleTimer`, `settleSince`, `imposed`, `choice`, `latest`, `hopOf`, `toastFollow`,
`SETTLE_MS` / `SETTLE_GIVE_UP_MS` / `TOAST_EVERY_MS` (≈ 230 of `follow.mjs`'s 360 lines);
`viewDecision`, `queueDecision`, `followNeeded`, `pickToken`'s `latestUuid` branch
(≈ 60 lines of `pins-core.mjs`); glue cases 1, 4, 5, 6, 6b, 7, 7a, 7b, 8b, 10, 11, 12, 13,
13b-d, E2, A1-3, B1 (≈ 420 lines of `glue.test.mjs`); one adjustments row
(`pins-scene-view`); the `Notify.Follows` string; the "Pitfalls" paragraphs on `canvas.loading`
timing in the README. **≈ 750 lines.** Effort: one day. Risk: low — the stock behaviours it
restores are the ones every other Foundry table lives with; the one visible change is an extra
draw at login.

### 2. The mover pulls the owner, exactly as core's region behaviour does

`moveCompany` ends with "no pull, no view" because the bot has no canvas. `Scene#pullUsers` is a
socket emit, not a canvas call (`scene.mjs:226-230`); it needs `game.user.isGM`, which the bot is.
Add to `teleportToken` (portals `api.mjs`): after the move, `dest.pullUsers(ownersOf(token),
{ level, controlledTokens: [newId] })` where `ownersOf` is the non-GM active users with OWNER on
the token — the same rule as `teleport-token.mjs` `#getUsersToPull`. `teleportParty` already pulls
(`scene-adapter.mjs:505`); today the two rows disagree.

**Removes:** `createToken: follow` and the `ownedIds` / `panIfOffScreen` helpers in pins
(≈ 50 lines), the `viewFollows` / `online` / `VIEW_UNCHANGED` return fields and their doc (≈ 15),
`pins.teleport`'s "works with the switch off but the view does not follow" gap. **Adds:** ≈ 8 lines
in portals. Effort: two hours. Risk: with Simplify 1 undone, this pull would race pins' own view;
do 1 and 2 together.

### 3. Replace the hand-rolled right-click menu with a keybinding (or a scene-control tool)

`canvas-menu.mjs` (212) + `menu-ui.mjs` (107) + `menuTrigger` / `menuAllowed` / `menuPlacement`
(≈ 70 in core) + `menu.test.mjs` (446) + `fixtures/dom.mjs` (202) + most of `pins.css` ≈ **1,000
lines** for a two-item menu. The fragile part is the gesture: a window-capture `pointerdown`
snapshot taken before PIXI claims the stage manager, a `pointermove` travel tracker, a
board-capture `pointerup`, a parent-bubble `contextmenu`, Windows-vs-macOS ordering, a 10 px
threshold copied from `MouseInteractionManager`, a hit test over tokens and door controls, and
submenu flipping. Every one of those is coupled to core's event plumbing and will be the first
thing to break on a Foundry upgrade.

The **Prompt note** item duplicates the P key byte for byte (`prompts.place(null, { at })` vs the P
key's `placeAtCursor`), so it adds nothing but the menu. **Teleport pinned character** is one
action: "move {player}'s character here". That is a keybinding in the prompts idiom — press **T**
over a point, a `DialogV2` lists the logged-in pinned players (`teleportChoices` already pure),
pick one — about 60 lines, no event-order assumptions, no DOM fixture. If Joe wants it mouse-driven,
a scene-controls tool (core's `SceneControls` tools API) that arms a one-click placement is the
idiomatic v14 way and still avoids the contextmenu race.

**Removes ≈ 950 lines; adds ≈ 60.** Effort: half a day. Risk: Joe asked for a right-click. The
counter-argument is that P is already the muscle memory for "do something here", and T beside it is
the same gesture.

### 4. One owner for "which scene at login": resume

Today the login scene is decided twice: pins' view patch redirects the login draw (and `ready:
reconcile` covers the no-active-scene case), and resume's `resumeTarget` separately asks
`pins.pinnedToken` so it does not fight. With Simplify 1, pins has no login path at all; resume's
rule becomes "pinned → view the token's scene, then pan/zoom if the saved view is of it", which is
what `resumeTarget` already encodes. Keep `pinnedToken` as the one API read. **Removes** `ready:
reconcile`, `canvasReady: reconcile` and glue cases 10-11 (≈ 40 lines). Effort: folded into 1.

Should resume and pins be one module? They are both "where does this player's view go". Merging
into one module ("pentaryn-view": login, follow, activation) would remove the cross-module API
contract (`pinnedToken` scene-id-string shape pinned in two goldens), one `module.json`, one
vendored kit copy and one README. It is defensible but not necessary; the must-do is 4.

### 5. Shrink the live runner (see §4 below)

**Removes ≈ 2,500 lines** (`pins-live.mjs` 2,398 → ≈ 300 on top of `smoke.mjs`; `pins-live.test.mjs`
488 → ≈ 60; `headless_gm.py` fd-pipe +114 and `test_headless_gm.py` +90 → 0). Effort: one day.
Risk: none to the game; the Python change is used by nothing else.

### 6. Trim the audit to the two codes that matter

`NO_TOKEN` and `MANY_TOKENS` are the audit. `GM_USER` is prevented by `pin`'s `BAD_ARGS`;
`SHARED_ACTOR` by `CONFLICT`; `NO_ACTOR` by `resolveRef`; `UNLINKED` and `NOT_OWNER` are warnings
nobody acts on. Keep them if they cost nothing, but they are 30 lines of code, 7 lang strings and
5 fixture rows for states only a raw flag write can produce. Effort: an hour. Low priority.

### 7. `inspect`, `selftest`, `pins()`, `audit()` are four read views of one state

Blueprint-mandated, so keep `inspect` and `selftest`; `pins()` and `audit()` could be one call
returning `{ pins: [...], violations: [...] }`. ≈ 20 lines. Lowest priority.

## Missed integrations

- **The bridge's `switch-scene` activates.** `data-access.ts:7264` `await targetScene.activate()`,
  and the generated-map path `socket-bridge.ts:348` auto-activates. Every Claude session that
  "switches scene" through the MCP tool moves every player and changes the playlist. Pins now
  silently absorbs that for pinned players, which hides the cause. Fix at the source: the tool
  should `view()` on the bot's own client (a no-op without a canvas) and take an explicit
  `activate: true`, or `pullUsers` the GM. This is a one-line fork change and belongs in `FORK.md`.
  With that fixed and Joe using **View** instead of **Activate** at the table, the `_onActivate`
  wrapper becomes optional and pins has **zero** core patches.
- **Core's Teleport Token already follows the owner.** `#getUsersToPull` pulls the user who moved
  the token and every non-GM who views that level, observes the token and owns no other token
  there (`teleport-token.mjs:208-233`). Portals' `moveCompany` turned pulling off and pins
  re-implemented it client-side. Reuse the rule (Simplify 2).
- **`Scene#pullUsers` with `viewOptions`** is the stock per-user move, carrying `level` and
  `controlledTokens`. The design rejected "the hooks-only version" and never weighed "the pull
  version".
- **`scene.navigation`** per scene is the stock way to stop players browsing to a map; pins'
  nav-click redirect re-implements it per user.
- **pentaryn-resume** already owned "which scene at login" and already had the `canvasReady` /
  `ready` plumbing; pins duplicated it and then negotiated.
- **The combat tracker.** `carryTo` deletes without `replacements`, so core's combatant remap
  (`client/documents/combat.mjs` `_onDeleteDescendantDocuments` path) never runs; a cross-scene
  teleport mid-combat drops the PC and company from the tracker. Known gap in both portals and
  pins; it is a one-option change (`replacements: { [oldId]: newUuid }` on the delete) that would
  also let core's own hooks see the move as a move.
- **Playlist** follows the active scene, not the pinned one. If Joe stops activating (above), the
  playlist needs a different driver anyway; otherwise a pinned player hears the wrong map.
- **`pentaryn-pings` / `pentaryn-movement`**: no overlap found; neither touches scene views.

## Risks

**Upgrade maintenance.**

- Two prototype wraps on `Scene#view` and `Scene#_onActivate`, MIXED through libWrapper when
  present and a direct wrap otherwise (`lib/patch.mjs`): two code paths to verify, and other
  modules in the stack that wrap or bypass `Scene#view` (Levels and Monk's modules call
  `canvas.draw` directly, which the README already lists as "one visible bounce") change behaviour
  with load order.
- The queue's correctness rests on four ordering facts in core: `canvas.loading` is set inside the
  queued `#draw` after an `await` (`board.mjs:1107`), `canvasReady` fires before `loading = false`
  (`:1241` vs `:1251`), `_onActivate` calls `view` synchronously (`scene.mjs:1527-1530`), and
  socket.io's `onAny` runs before the event's own listeners. None is API. A v15 that reorders any
  of them breaks the queue silently (a stranded player, not an error). `adjustments.yml` now holds
  123 rows; the Monday updater re-verifies "guarded" rows by test, and the tests stub these facts
  rather than exercise them.
- The menu's gesture model is coupled to PIXI's capture listener on `#board` and
  `MouseInteractionManager.DEFAULT_DRAG_RESISTANCE_PX`; both are internals.
- dnd5e's transform flags (`originalActor`, `previousActorIds`) are read from a cited line in
  `dnd5e.mjs`, with no API; a dnd5e 6.1 that renames them silently un-pins every wild-shaped PC.
  This one is unavoidable and correctly recorded (`dnd5e-pins-transform-root`, `retire_class:
  never`).

**At the table.**

- A pinned character with **two tokens** (Joe drags the actor onto a flashback scene, or copies
  for a mirror image) silently falls back to stock: no follow, no warning, because the audit only
  runs at switch-on. The player's next activation jump looks like a pins bug. A `createToken`
  toast to the GM ("Talo now has 2 tokens; pinning paused") would cost 5 lines.
- **Deleting the one token** (death, tidy-up) leaves the player on the old scene for good with
  nothing said; the next login draws the active scene and the "pin wins" rule in resume returns
  null, so resume does nothing either.
- **"Pull users to scene" does nothing** for pinned players. That is Joe's own habitual tool and
  the use-doc is the only place that says so.
- **The 120 s give-up** (`SETTLE_GIVE_UP_MS`): a large map over the Cloudflare tunnel can load for
  longer than that on a weak connection; the queue then stops until the next `canvasReady`, which
  on a stranded client never comes.
- **Hidden or unowned scenes**: a pin with `NOT_OWNER` follows a token the player gets no vision
  from (black canvas); a pinned token on a hidden scene still draws it and puts its name in the nav
  bar (both in Known gaps, neither surfaced to the GM at the moment it happens).
- **Bot activation**: with pinning on, a bridge `switch-scene` moves the unpinned players and the
  playlist but not the pinned ones — a half-move that will confuse a session run partly by Claude.
- **A player cannot peek** at another map (nav click redirected). With a split party this removes
  something stock Foundry gives them.

## If I rebuilt it

Keep the data model and the GM-side mover; delete the client-side view machinery.

1. **Pin**: `flags.pentaryn-pins.actor` on the User, root actor id, `pin` / `unpin` / `pins` /
   `pinnedToken` / `teleport` / `inspect` / `selftest` as now. Badge as now. ≈ 450 lines with
   manifest, settings and lang.
2. **Move = teleport + pull.** `portals.teleportToken` moves the token and company, then
   `dest.pullUsers(owners, { level, controlledTokens })` — core's own region rule. Stock Teleport
   Token regions already do this. No player-side follow code at all. ≈ 10 lines in portals.
3. **Login = resume.** `resumeTarget(saved, { pinnedScene })` as shipped: pinned → the token's
   scene (one extra draw of the active scene first, accepted), then pan/zoom if the saved view is
   of it. Pins has no `ready` / `canvasReady` listeners.
4. **Activation.** First choice: fix the bridge tool to view, and Joe uses View, so nobody
   activates mid-session and there is **no patch**. Fallback: the 10-line `_onActivate` wrapper
   with `activateDecision`, declared as the module's one adjustment.
5. **Cut-and-paste safety net** (optional): a 20-line `deleteToken` hook on the player's client
   that views the remaining token's scene when it is elsewhere and `!canvas.loading`, else waits
   for `canvasReady` + a tick. Document the one case it does not cover.
6. **Teleport UI**: keybinding **T** → `DialogV2` of logged-in pinned players → `pins.teleport`
   at `canvas.mousePosition`. ≈ 60 lines. No contextmenu handling. "Prompt note" stays on P.
7. **Verification**: the pure rules in `core.test.mjs`; a glue suite of ≈ 8 cases (switch off is
   stock; activation skipped; teleport pulls the owner; wild shape keeps the pin; delete with none
   left stays; two tokens falls back; badge; hot patch); one live script of 5 scenarios on top of
   `smoke.mjs`. The browser-acceptance doc (`pin-2026-10-browser-acceptance.md`) already covers
   the real-mouse and Cloudflare checks and is the right place for them.

Rough size: ≈ 600 lines of module source, one or zero adjustments rows, ≈ 400 lines of tests,
≈ 300 lines of live script — against ≈ 1,720 + 2,100 + 2,900 today.

## 4. The live runner, in detail

`automation/smoke/pins-live.mjs` is 2,398 lines (112 KB) with a 488-line unit suite of its own,
and it pulled 114 lines into `scripts/foundry/ops/headless_gm.py` (an `/dev/fd/N` cookie hand-off
with fd-identity checks) plus 90 lines of Python tests, for one caller. It drives three player
contexts, a GM context, a bridge-port guard, a bot path (S18 re-runs three scenarios through the
broker), stash/restore of the active scene and setting, and a prefix-based cleanup. The existing
`smoke.mjs` is 215 lines.

What it proves that the node suites cannot: that the stub's four ordering facts match real Foundry
(S08, S10, S12), that PIXI's capture listener really runs after the window-capture one (S14), and
that the company lands with the PC (S08-S11). What it re-proves: activation off/on (S01, S06,
S17), pulls (S07), the badge (S05), the audit (S02-S04), resume (S12-S13), the P-key equivalence
(S15), and the bot path (S18), all of which are pure decisions already fixtured.

A proportionate strategy:

- **Node** for every decision (`core.test`, a glue suite of ≈ 8 cases).
- **One live script** (≈ 300 lines on `smoke.mjs`'s login path, one GM + one player context) with
  five scenarios: login lands on the token's scene; activation ignored; region hop follows with
  company; menu/keybinding teleport follows with company; switch off → stock. Each is a `pins()` /
  `pinnedToken()` / `game.user.viewedScene` read, no toast scraping.
- **The browser-acceptance doc** for the real mouse, Cloudflare and macOS checks, run once per
  release, as it already says.
- **Drop the fd-pipe feature.** The helper already writes a 0600 file that the watchdog deletes on
  read; the runner can use the same path. A secrets-handling feature built for a test harness is
  the wrong place to spend review attention.
