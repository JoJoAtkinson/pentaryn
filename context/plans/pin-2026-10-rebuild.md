---
title: Pentaryn Pins — rebuild on Foundry's own pull (pins 0.2.0, portals 0.7.0, resume 0.2.0)
status: built 2026-10-17 (pins 0.2.0, portals 0.7.0, resume 0.2.0; all gates green); not committed, not live-run (run S01–S19 only to decide a rollback); adversarially reviewed 2026-10-17 (§14)
last_modified: 2026-10-17
tags: [foundry, module, plan, pentaryn-pins, pentaryn-portals, pentaryn-resume]
---

# Pentaryn Pins — rebuild on Foundry's own pull

**Read this when:** you are carrying out (or reviewing) the 2026-10-17 rebuild of
`pentaryn-pins` that deletes the client-side view machinery and moves a pinned player with core's
own `Scene#pullUsers`, or you want to know exactly what was deleted and why. **Not this file:** why
the rebuild → [`pin-2026-10-design-review.md`](pin-2026-10-design-review.md) (Simplify 1, 2, 4,
Missed integrations, Risks) · the original design → [`pin-2026-10.md`](pin-2026-10.md) · using
pins → [`../foundry/pins.md`](../foundry/pins.md). Line numbers are from `feat/pentaryn-pins` at
`bd7422ec` (the committed 0.1.0 state); function names are the anchors.

Joe's call (2026-10-17): no live run before this; the live runner is updated (S07 only) but run
only if the rebuild has to be rolled back. Work on `feat/pentaryn-pins`; this run does not commit.

## 0. What stays true (Joe's hard requirements, after the rebuild)

| Requirement | How, after the rebuild |
|---|---|
| Switch default OFF, inert when off | unchanged: `setting("pinning")` read live in the one wrapper and every hook |
| Switch-on audit, report only | unchanged (`switch.mjs`, `auditPins`); the switching GM now also **pulls** online pinned players to their tokens (§4.3) |
| Pinned player sees their token's scene; ignores GM activation | the `_onActivate` wrapper (kept; an activation of the token's scene views the token's level, §5.4). The token's *moves* reach the player as core pulls (§2), at login through resume (§3); a pull core drops while the player's canvas is loading is replayed once it clears (§5.3), and the safety net waits out a load instead of giving up (§5.1) |
| ~~ignores GM pulls~~ | **changed, accepted by Joe:** a pull is the move primitive and moves pinned players too |
| Sheet badge "Pinned to {player}" | unchanged (`sheet.mjs`) |
| GM right-click: Prompt note, Teleport pinned character ▸ | unchanged (`canvas-menu.mjs`, `menu-ui.mjs`; out of scope to replace) |
| Any teleport brings summons, pets, connected tokens | unchanged (portals `moveCompany` / `followersOf`) |
| Portal-hop follow and Teleport party do not regress | `party.mjs` untouched; `teleportParty` gains `{ level }` on its existing pull, and leaves out a pinned player whose character is not on the destination (§2.2, §2.5) |
| Unpinned players and GMs stock | the wrapper and every player-side hook return at once for them (unchanged gates) |

## 1. Verified against Foundry v14.369 (`scripts.foundry.host.foundry_app_root()` → `…/resources/app`)

Every claim the design leans on, re-read for this plan:

| Fact | Source |
|---|---|
| `Scene#pullUsers(users, viewOptions)` is GM-only and only emits `pullToScene` per active user; no canvas needed (the bot can call it) | `client/documents/scene.mjs:224-231` |
| The player's handler is `scene.view(viewOptions)`, nothing else | `client/documents/collections/scenes.mjs:101, 111-114` |
| `Scene#view` toasts "cannot switch Scenes" whenever `canvas.loading`, before comparing scenes; a view of the scene and level already drawn does not redraw | `scene.mjs:259-289` |
| Core's Teleport Token pulls, cross-scene, `#getUsersToPull(token, user, game.user)` with `{ level, controlledTokens: [newId], transition }`; same scene, only the moving user when it is not self | `client/data/region-behaviors/teleport-token.mjs:143-159` |
| `#getUsersToPull`: none for a hidden token; skip inactive users, GMs and the designated user; only users viewing the token's scene **and** source level; the mover always, anyone else only if they observe the token and own no other non-hidden token on that level with sight (or `!scene.tokenVision`) | `teleport-token.mjs:212-236` |
| `User#viewedScene` / `User#viewedLevel` exist on every client | `client/documents/user.mjs:51, 57` |
| A pull with `controlledTokens` controls them and pans to the first on draw | `client/canvas/board.mjs:1564-1595` (`#initializeTokenControl`) |
| Without `level`, a draw picks the manager's, the last-viewed or the scene's initial level — never "the token's" | `board.mjs:1414-1435` (`_determineInitialLevel`) |
| `_onActivate(active)` is called straight from `Scene._onUpdateOperation`, no hook between; `_onActivate(true)` → `this.view(operation.viewOptions)`, `false` → `unview()` | `scene.mjs:1350-1360, 1527-1530` |
| Same-scene level change: every **non-GM** client already switches its own view when it viewed the origin level, observes the token, and owns no other non-hidden sighted token on the origin level (or itself moved it by config/hud/drag/keyboard); it waits for the animation and `canvas.initializing` first | `client/documents/token.mjs:2893, 2905-2969` (`#handleMovementOperation`) |
| `level` is a movement field, so every level change runs that path and fires `moveToken(document, movement, operation, user)` on every client | `common/documents/token.mjs:204`; `client/documents/token.mjs:2885-2893` |
| A controlled token whose centre moves pans the canvas on its owner's client | `client/canvas/placeables/token.mjs:4031-4032` |
| Login: `Game#initializeCanvas` views `game.scenes.current` (the active scene) or `canvas.draw(null)`, before `ready` | `client/game.mjs:1063-1070` |
| A blank draw leaves `canvas.ready === false` (only `initialized` is true) | `board.mjs:1135-1138, 1442-1447` |
| GM cut-and-paste across scenes: keepId create on the target, then delete on the source **with `replacements`** | `client/canvas/layers/base/placeables-layer.mjs:925-947` |
| Core's region teleport: one `modifyBatch` of create then delete-with-`replacements` | `client/documents/region.mjs:1477-1513` |
| `replacements` drives the combatant remap, run by the deleting user only | `client/documents/combat.mjs:1172-1209`; `token.mjs:3151` |
| Custom delete-operation keys reach other clients' hooks (the server keeps the request operation and broadcasts it) | `dist/database/backend/server-backend.mjs` (`DocumentSocketResponse(t)`, only internal keys deleted); `common/abstract/socket.mjs` |
| Pull menus that will now move pinned players: player list "Pull to Scene", nav "pull users to level", `Scene#activate({ pullUsers: true })` | `client/applications/ui/players.mjs:280`; `applications/ui/scene-navigation.mjs:249`; `scene.mjs:244-251` |

## 2. The new pull path (Simplify 2) — owner A, portals

### 2.1 Who is pulled

A pure rule in `portals-core.mjs`, a line-for-line copy of `#getUsersToPull` with the GM caller as
both `user` and `designatedUser` (so the "the mover is always pulled" branch never applies to a
player):

```js
/** core's Teleport Token pull rule (teleport-token.mjs #getUsersToPull, v14.369), for a GM mover. */
export function usersToPull(users, { hidden, scene, level }) {
  if (hidden) return [];
  return users.filter(u => u.active && !u.isGM && u.viewedScene === scene && (u.viewedLevel ?? null) === (level ?? null)
    && u.observes && !u.ownsOtherSighted).map(u => u.id);
}
```

The adapter (`scene-adapter.mjs`, new `pullCandidates(token, scene)`, ≈ 14 lines) builds the
records **after** the carry, against the source scene, exactly when core evaluates its rule (after
`modifyBatch`): `observes = token.testUserPermission(u, "OBSERVER")`; `ownsOtherSighted =
scene.tokens.some(t => t.id !== token.id && !t.hidden && t.testUserPermission(u, "OWNER") &&
t._source.level === srcLevel && (!scene.tokenVision || t.sight.enabled))`. `srcLevel` is
`token._source.level`, read before the carry. The carried company is already off the scene, so a
familiar that came along does not block the pull. **This differs from core on purpose** (review
note R6): core's region hop moves only the one token and portals' `bringFollowers` carries the
company a tick later, so core's rule *does* see the familiar and does not pull its owner (S08 relies
on the safety net, §5.1). The `level` in the view options is the carried token's
`dest.tokens.get(token.id)._source.level` (what core passes: `destinationToken._source.level`),
not the requested `level`, which `arrivals()` may have mapped.

**Plus `pull`**: `teleportToken(ref, { …, pull = [] })` takes extra users (User | id) that are
pulled on a cross-scene move whatever the rule says. Pins passes the pinned player (§4.2). The
union is de-duplicated; inactive users are dropped (`pullUsers` drops them anyway). The rule's users
(not `pull`) also go through §2.5's filter.

### 2.2 Where it runs

| Path | Today | After |
|---|---|---|
| `teleportToken`, another scene (`moveCompany` → `carryTo`, `scene-adapter.mjs:416-446`) | "No canvas, no pull, no view" (`:407`) | after `carryTo` resolves: `dest.pullUsers(ids, { level, controlledTokens: [token.id] })` (keepId keeps the id), ≈ 6 lines; returns `pulled: [{ id, name }]` |
| `teleportToken`, same scene (`moveOnScene`) | no pull | **no pull** (core's same-scene rule pulls only a non-self mover, and the mover is a GM). The player's level follow is core's own `#handleMovementOperation`, or pins' gap-filler (§5.2) |
| `teleportToken` `dryRun`, `REFUSED`, `CONFLICT` | — | no pull, no `pulled` |
| `teleportParty`, another scene (`scene-adapter.mjs:513-515`) | `dest.pullUsers(all active players)`; `dest.view()` | the same users **minus a pinned player whose character is not on `dest`** (§2.5), with `{ level }` when the party landed on one floor (`carryTo` returns that floor: `onFloor.level ?? null`), same for the GM's own `dest.view` — **[declared]** |
| `teleportParty`, same scene | no pull | unchanged |
| portal-hop follow (`party.mjs` `bringFollowers`) | core's region pulls the PC's player; followers carried after | **unchanged** (no pull added: unpinned players must keep stock behaviour; pins' safety net covers a pinned player core did not pull, §5.1) |

"Make the rows agree": both manifest rows now say "pulls … with `{ level }`"; teleportToken's row
names core's rule and `pull`; teleportParty's keeps "every active player".

### 2.3 API shape (the contract owner B codes against)

- `teleportToken(ref, { x, y, scene?, level?, pull?: (User|id)[], dryRun?, sceneId? })` — `pull`
  not an array of users/ids → `BAD_ARGS`.
- Result adds `pulled: [{ id, name }]` (cross-scene only; `[]` on the same scene; absent on
  `dryRun`). Additive: CONTRACT stays `pentaryn-portals/api@1`.
- Side effect row: "`pullToScene` to the users core's Teleport Token rule picks, plus `pull`, on a
  cross-scene move".

### 2.4 Combat tracker remap (Risks): **not** in this run

The task allowed it "if it is a one-option change". It is not: `party.mjs` `onDeleteToken`
(`:152-168`) treats every delete **with** `replacements` as a possible portal hop and runs
`bringFollowers`/`spreadArrival`. Adding `replacements` to `carryTo`'s delete would re-enter that
pass on every carry (teleportToken, teleportParty, and bringFollowers' own carries); it needs a
marker option on the delete plus a guard in `party.mjs`, and the created uuids collected from the
create. ≈ 5 lines across two files plus re-pinning `teleport-token.test.mjs:223` ("WITHOUT
replacements"). Recorded as follow-up **F1**; the Known gap in `pins.md` stays. (Side benefit for
F1: `pentaryn-senses/light.mjs:543-557` already retargets spell lights from `replacements`.)

### 2.5 Pinned players whose character stayed behind are not pulled (review note R2)

Before the rebuild, `teleportParty`'s blanket pull reached a pinned player whose character was
**not** in the party (a split party: Beta on South, the party leaves North for East) and pins'
`Scene#view` patch sent them straight back to South. With the patch gone that player would land on
East and stay there — the hard requirement "a pinned player sees the scene their token is on"
broken by Teleport party. Joe accepted that the GM's own *Pull users to scene* moves pinned
players; he did not accept that for Teleport party, which is a token move.

Fix, in `scene-adapter.mjs` (≈ 6 lines): one predicate used by both pull sites —

```js
/** A pinned player (pentaryn-pins pinnedToken, the same read resume makes) whose character is on another scene. */
function pinnedElsewhere(user, dest) {
  try { const p = apiOf("pentaryn-pins")?.pinnedToken?.(user); return !!p && p.scene !== dest.id; }
  catch (err) { deps.log?.warn("pentaryn-pins pinnedToken() failed; pulling as stock", err); return false; }
}
```

`teleportParty` pulls `game.users.filter(u => !u.isGM && u.active && !pinnedElsewhere(u, dest))`;
`moveCompany` drops `pinnedElsewhere` users from the **rule's** list only (never from `pull`).
`pinnedToken` is null with the switch off, for a GM, an unpinned user, or a pin with no single
token, so every unpinned path stays byte for byte as today. This replaces "portals never learns
about pins": portals makes the one API read resume already makes (blueprint §4.2, `apiOf`), and
pins stays the only module that knows what a pin is. Docs: portals manifest `teleportParty` and
`teleportToken` rows (sideEffects), portals README "Reads" (pins `pinnedToken`), pins README
"Who reads my API" (+ portals). Tests: §8.3.

## 3. Login (Simplify 4) — owner B, resume

Pins has no `ready` / `canvasReady` listener after the rebuild. Resume owns "which scene at login".

**New rule** (`resume-core.mjs` `resumeTarget`, `:63-92`, rewritten): `world.pinned` replaces
`world.pinnedScene` and is `{ scene, level, token } | null` from `pins.pinnedToken(game.user)`.

| Input | Result |
|---|---|
| `pinned` null (pins absent, off, unpinned, GM, no single token) | today's unpinned rules, byte for byte |
| `pinned`, its scene exists | `{ scene: pinned.scene, level: pinned.level, token: pinned.token, position }` — `position` = the saved view's pan/zoom **only when the saved view is of `pinned.scene`**, else null. No saved view → still the pinned scene (new: today returns null and pins' patch did the draw). The "table moved on" rule does not apply |
| `pinned`, its scene gone | null |

**Glue** (`memory.mjs` `resume`, `:69-90`): the gate becomes `pinned ? canvas?.initialized :
canvas?.ready` (a pinned player with no active scene has a blank canvas, `ready` false; today pins'
`ready: reconcile` covered that, glue case 11). View when the scene or level differs:
`scene.view({ level, controlledTokens: [tokenId] })` (`tokenId` = last segment of the token uuid;
`level` only when the scene has it, as today). Then pan if `position`. `pinnedSceneOf` (`:48-67`)
becomes `pinnedOf`, same guards (GM → null; throws → logged, null; `scene` not an id string →
logged, null), returning `{ scene, level, token }`.

Accepted cost: Foundry draws the active scene first (`game.mjs:1069`), then resume draws the
token's — one extra draw at login, only when they differ.

Race check (review note R4): socket events that arrive during the login draw are **buffered** and
replayed by `Game#activateSocketListeners` just before `Hooks.callAll("ready")`
(`game.mjs:506, 555-561, 777-778`), so at resume's `ready` the token documents are current and
`canvas.loading` is false. A buffered `pullToScene` (a move or a switch-on during login) starts its
draw in that replay; resume then queues a second view of the same scene — `Canvas#draw` chains
draws (`board.mjs:1071-1075`), so this is one more draw of the same map, never the "cannot switch
Scenes" toast. A pull or move that arrives **while resume's own draw is loading** is covered by
§5.3 (replay) and §5.1 (the net waits out the load). Pins' API is still published by its
import-time `Hooks.once("ready")`, before resume's setup-time `ready: resume` (unchanged).

## 4. Pins — the files (owner B)

### 4.1 `follow.mjs` (419 → ≈ 170 lines). Keep the file name (adjustments row and README cite it)

**Delete** (≈ 300 lines):

| Lines | What |
|---|---|
| 1-27 | header: rewrite to ≈ 14 lines (one patch, a safety net, a level gap-filler) |
| 29-30, 32 | imports `SETTLE_*`, `TOAST_EVERY_MS`, `followNeeded`, `queueDecision`, `viewDecision`, `onPinningChange` |
| 37-49 | `inflight`, `settleTimer`, `settleSince`, `settleReason`, `lastToast`, `imposed`, `endImposed`, `choice` (13) |
| 50-57 | `fallbackScene`, `latest` (8) |
| 59-60, 64-65 | `unsubscribe`, `socketListener`, `viewed`, `wantOf` |
| 117-125 | `toastFollow` (9) |
| 127-147 | `request` (21) |
| 149-175 | `settle`, `tick` (27) |
| 177-186 | `reconcile` (10) |
| 190-229 | `onView` (40) |
| 243-261 | `installSocket` (19) |
| 270-276 | the `Scene#view` `wrapMethod` (7) |
| 294-314 | `hopOf`, `panIfOffScreen` (21) |
| 320 | `ctx.expose({ latestOf })` |
| 322-336 | `createToken: follow` (15) |
| 338-354 | `deleteToken: follow` (17) → replaced by §5.1 |
| 356-371 | `updateToken: follow` (16) → replaced by §5.2 |
| 373-379 | `updateUser: pin changed` (7) → GM-side pull in `pin()` (§4.3) |
| 381-388 | `deleteLevel` (8) |
| 390-395 | `canvasReady: reconcile`, `ready: reconcile` (6) |
| 397-401 | `onPinningChange` follow (5) → GM-side pull in `switch.mjs` (§4.3) |
| 406-418 | uninstall resets for the above (keep only the unwrap; add the net/poll timers, `pendingPull`, and `game.socket.off("pullToScene", listener)` for §5.3) |

**Keep**: `C`, `handles`, `enabled`, `isGM` (36, 58, 62-63); `followOptions` (67-83, simplified to
"`controlledTokens: [id]` when owned", ≈ 8); `levelOn` (85-96, the orphan-level rule still applies
to the safety net's view); `target` (98-105, without `latestUuid`); `safeTarget` (107-115);
`onActivate` (231-241, without `imposed`, plus §5.4's level: ≈ 10); `installPatches` (263-284,
one wrap: ≈ 14); `myRoot` (286-292).

**Add** (≈ 80): `whenSettled(fn)` (poll `canvas.loading` every `NET_POLL_MS`, no cap, cleared by
`uninstall`; ≈ 10), the safety net (§5.1), the level gap-filler (§5.2), the dropped-pull replay
(§5.3; ≈ 15).

### 4.2 `api.mjs` (251, net ≈ +10)

- `PATCH_IDS` (`:20`) → `["pins-scene-activate"]`; header lines 4-6 (no `latestOf`).
- `followedToken` (`:113-120`): `resolvePin(user, self ? { viewedSceneId } : {})`, no `latestOf`.
- `teleport` (`:140-166`): pass `pull: enabled && user.active ? [user.id] : []`. Keep the result
  fields with sharpened meaning (no contract break, S10 unchanged): `viewFollows` = cross-scene →
  `res.pulled` includes the user; same scene → `enabled && user.active`, and when the GM sees the
  user on another scene `teleport` pulls them back to the token (`pullToPin`; portals never pulls on
  the same scene, and core's movement handler and the gap-filler skip a scene that is not viewed:
  code review F1), `viewFollows` then being whether that pull was sent. `warning:
  "VIEW_UNCHANGED"` = cross-scene, the user online and not pulled (today: switch off and
  cross-scene). `online` unchanged.
- `pin` (`:28-85`): after a successful write, with the switch on and the user active, pull them to
  their token (`pullTargetOf`, §4.3; always, see F1 there). Replaces the
  player-side `updateUser` follow.
- `selftest` (`:218`): label "Scene#_onActivate patched".

### 4.3 `world-adapter.mjs`, `switch.mjs`, new `watch.mjs`

- `world-adapter.mjs`: `resolvePin` (`:99-108`) drops `latestUuid`. Add `pullTargetOf(user)` →
  `{ scene, options: { level?, controlledTokens: [id] } } | null` (null: no single token). No
  "already there" skip (code review F1): the GM's `User#viewedScene`/`viewedLevel` change only when
  the player's draw finishes, so a player still drawing another scene looks as if on the token's;
  a pull to what is drawn draws nothing, and one that lands while loading is replayed (§5.3). Plain
  data; the callers do the one-line
  `game.scenes.get(scene).pullUsers([user], options)`.
- `switch.mjs` (`:35-44`): the GM client that switched it on also pulls every active pinned player
  `pullTargetOf` returns (≈ 6 lines). Header line 7 "Players reconcile in follow.mjs" → this.
- `watch.mjs` (new feature, GM clients, ≈ 55): the two Risks toasts (§6).
- `pins.mjs`: `FEATURES = [follow, sheet, canvasMenu, switchAudit, watch]`; header lines 10, 16-19.

### 4.4 `pins-core.mjs` (260 → ≈ 250)

**Delete** (≈ 66): `TOAST_EVERY_MS`, `SETTLE_MS`, `SETTLE_GIVE_UP_MS` (28-33); `pickToken`'s
`latestUuid` branch and its doc (60-61, 70-73); `viewDecision` (81-99); `covers` +
`queueDecision` (101-121); `followNeeded` (123-136).

**Keep**: `pinOf`, `pickToken` (0 → null, 1 → it, several → the only one on the viewed scene, else
null), `activateDecision` (145-150, unchanged), `auditPins`, `menuTrigger`, `menuAllowed`,
`menuPlacement`, `teleportChoices`, `pinnedName`. `VERSION = "0.2.0"`. `CONTRACT` stays `api@1`
(no method row changes shape). `HOOKS.followed.args` → `"({ scene, level, reason: cut|level|retry })"`.

**Add** (≈ 60): `NET_GRACE_MS = 1500`, `NET_POLL_MS = 250`; `netDecision` (returns
`view|wait|none`, §5.1), `coreSwitchesLevel`, `levelFollow`, `replayDecision` (§5.3),
`tokenNotice` (§5, §6).

### 4.5 Other pins files

`lang/en.json`: delete `Notify.Follows`; add `Notify.Paused`, `Notify.Stranded`; rewrite
`Setting.pinning.Hint` ("…sees the scene their pinned character's token is on and ignores GM scene
activation; moving the token moves the player…"). `settings.mjs:42-43` doc likewise.
`api-manifest.mjs`: `pin` doc (+ the pull), `teleport` returns/doc (§4.2), `selftest` doc.
`module.json`: version `0.2.0`; description without "ignores pulls"; `recommends.lib-wrapper.reason`
→ "Wraps Scene#_onActivate…". README: "What the player sees", Events (reasons `cut|level|retry`),
"Listens to" (+ the `pullToScene` socket event, §5.3), Patches (one row), "Two sessions / who writes" (the GM pulls), Pitfalls (delete the
`canvas.loading`/`inflight`/"latest" paragraphs, add the grace-window one), Tests paragraph.
`CHANGELOG.md` 0.2.0. `canvas-menu.mjs`, `menu-ui.mjs`, `sheet.mjs`, `pins.css`: **unchanged**.

## 5. The player-side pieces that stay or are added (owner B)

All: pinning on, not a GM, my pin, `safeTarget`. None keeps any memory of a player's choice. §5.1-5.2 are hooks, §5.3 a socket listener on core's own event, §5.4 the kept `_onActivate` wrapper.

### 5.1 `deleteToken` safety net (GM cut-and-paste across scenes, and any move nobody pulled for)

```js
reg.on("deleteToken", doc => {
  const root = myRoot();
  if (!root || rootOfToken(doc) !== root) return;
  if (doc.parent?.id !== canvas?.scene?.id) return;   // not the scene I watch (a peek): never yank
  clearTimeout(netTimer);
  netTimer = setTimeout(check, NET_GRACE_MS);
}, { label: "deleteToken: safety net" });

function check() {
  netTimer = null;
  const t = safeTarget("deleteToken: safety net");
  const d = netDecision({ target: t, viewed: { scene: canvas?.scene?.id ?? null, level: canvas?.level?.id ?? null },
    loading: !!canvas?.loading });
  if (d === "wait") return void (netTimer = setTimeout(check, NET_POLL_MS));   // no give-up: every draw ends
  if (d !== "view") return;
  const opts = followOptions(t); if (t.level) opts.level = t.level;
  C.emit("followed", { scene: t.scene, level: t.level ?? null, reason: "cut" });
  game.scenes.get(t.scene)?.view(opts)?.catch?.(err => C.log.error("view failed", err));
}
```

`netDecision` (pure): no target (0 or several tokens, switch off) → `"none"`; `loading` →
`"wait"`; the token's scene differs from the viewed one, **or** it is the viewed scene and the
token's level (already `levelOn`-checked) is set and differs from the viewed level → `"view"`;
else `"none"`. The same-scene level clause restores code review A1-3 (a GM copy-pastes the token
onto another floor of the same scene and deletes the original: no movement, so neither core's level
switch nor §5.2 fires — review note R5). Why a grace delay instead of distinguishing the delete:
core's region hop, core's cut-and-paste and portals' carry all look the same in the hook (two of
them carry `replacements`), and the movers' pulls arrive **after** the delete broadcast. Waiting
`NET_GRACE_MS` lets any pull land first; then the check sees "already there", or "loading" and
**waits for that draw to end and checks again** (review note R1: the draft returned on "loading",
which stranded a player whose second move came while the first move's draw was still loading on a
slow connection — the second pull is dropped by core, and nothing re-checked). The wait polls one
boolean; it has no cap because `Canvas#draw` clears `loading` on success, on a texture or group
failure and on a blank draw (`board.mjs:1196, 1222, 1251, 1447`; an uncaught throw elsewhere in
`#draw` leaves core itself refusing every view until a reload, so a cap would not help); a
switch-off or uninstall ends it (`safeTarget` → null → none;
`uninstall` clears the timer). No queue, no ordering facts about core: a timer and three reads.
Residual (Pitfalls): a mover's pull that reaches the player more than 1.5 s after the delete, while
the net's own draw is loading, shows core's "cannot switch Scenes" toast once; §5.3 replays it
after the draw and, being the same scene and level, it draws nothing. Also covers S08: core's region
does not pull a player who still owns a sighted pet on the level when the hop happens (the pet is
carried a tick later by `bringFollowers`).

### 5.2 `moveToken` level gap-filler (same scene, another level)

Core already moves the player's view with their token's level change in the common case
(`token.mjs:2905-2969`). Pins acts only where core will not, so the two never both view:

```js
reg.on("moveToken", async (doc, movement, _op, user) => {
  const root = myRoot();
  if (!root || rootOfToken(doc) !== root || doc.parent?.id !== canvas?.scene?.id) return;
  const from = movement?.origin?.level ?? null, to = movement?.destination?.level ?? null;
  if (!to || from === to) return;
  const viewedLevel = canvas.level;                                     // captured now, as core does (token.mjs:2909)
  await movement.animation?.ended; await canvas.initializing;          // core's own wait, token.mjs:2915-2918
  if (!viewedLevel?.isView || canvas.scene?.id !== doc.parent.id) return;   // core's :2929 bail
  // decided AFTER the wait, against the same state core reads (review note R7)
  const core = coreSwitchesLevel({ viewedLevel: viewedLevel.id, origin: from, observes: doc.testUserPermission(game.user, "OBSERVER"),
    ownsOtherSighted: /* the token.mjs:2943-2944 test against canvas.scene and viewedLevel.id */, selfMove: user?.isSelf === true, method: movement.method });
  if (!levelFollow({ target: safeTarget("moveToken"), tokenUuid: doc.uuid, to, viewedLevel: canvas.level?.id ?? null, core })) return;
  whenSettled(() => {                                                  // a draw already loading: wait it out
    if (canvas.level?.id === to || canvas.scene?.id !== doc.parent.id) return;
    C.emit("followed", { scene: doc.parent.id, level: to, reason: "level" });
    doc.parent.view({ level: to, controlledTokens: [doc.id] })?.catch?.(err => C.log.error("view failed", err));
  });
}, { label: "moveToken: level gap" });
```

`coreSwitchesLevel` mirrors `token.mjs:2927-2946` for one moved token (viewed level is the origin;
observable; no other owned non-hidden sighted token on the origin level, or a self move by
`config|hud|dragging|keyboard`). It is evaluated **after** `animation.ended` / `canvas.initializing`,
because core evaluates `noOwnedNonhiddenToken` after the same awaits: a pet carried or moved by a
later operation during the animation would otherwise make pins and core disagree (both view → a
"cannot switch Scenes" toast; neither → the player stays on the old floor). `levelFollow` = the token is the pin's target, `to` is not the
viewed level, and `!core`. Typical cases it fills: the player keeps a pet with sight on the floor
the PC left; the player was viewing another floor of the same scene. New adjustments row
`core-pins-level-switch-rule` (§9).

`updateToken: follow`'s other jobs go away: `actorId` (a transform rewrites the token in place on
the same scene: nothing to view), the off-screen pan (core pans a controlled token,
`token.mjs:4031`; an uncontrolled one no longer pans — listed in "What changed").

### 5.3 A pull core dropped while loading is replayed (review note R1)

The pull is a socket emit; the player's handler is `scene.view(viewOptions)` and nothing else
(`scenes.mjs:111-114`), and `Scene#view` **drops** the request with a toast whenever
`canvas.loading` (`scene.mjs:264-266`). On the Cloudflare tunnel a big map loads for tens of
seconds, so a pull that lands during any draw — the player's own peek, the previous move's pull,
resume's login draw, the net's view — is lost, and with the view patch gone nothing re-asks. The
safety net only covers moves that delete a token on the viewed scene; a switch-on pull, a `pin()`
pull, a GM "Pull users to scene", and a second move whose delete fell before `canvas.scene`
switched are not. So, on the player's client, pinned players only:

```js
pullListener = (sceneId, viewOptions) => {
  if (!myRoot() || !canvas?.loading) return;     // core will (or did) honour it: nothing to do
  pendingPull = { sceneId, viewOptions };        // latest wins
  whenSettled(() => {
    const p = pendingPull; pendingPull = null;
    if (!p || !myRoot()) return;
    C.emit("followed", { scene: p.sceneId, level: p.viewOptions?.level ?? null, reason: "retry" });
    game.scenes.get(p.sceneId)?.view(p.viewOptions ?? {})?.catch?.(err => C.log.error("view failed", err));
  });
};
game.socket.on("pullToScene", pullListener);     // installed at setup; off() in uninstall
```

Order-independent with core's own listener (pins' is registered at `setup`, core's at
`Game#activateSocketListeners`, so pins' runs first): both read `canvas.loading` synchronously in
the same dispatch, and core's `view` sets `loading` only after an `await`
(`board.mjs:1099-1107`), so "loading at receipt" is exactly "core drops it". A future core that
queues instead of dropping makes the replay a view of the scene and level already drawn, which
draws nothing (`scene.mjs:274-280`). The replay is the GM's request as sent, never pins' own
target, so a GM "Pull users to scene" stays the move primitive (§7.1) and a nav-click peek is never
redirected. Unpinned players and GMs: the listener returns at once (stock drop and toast).
`replayDecision({ pinned, loading })` is the pure half. Adjustments row `core-pins-pull-replay`
(§9).

### 5.4 Activation of the token's scene views the token's level (review note R3)

`activateDecision` returns `call` for an activation of the token's own scene, and core then views
it with `operation.viewOptions` (`scene.mjs:1527-1530`) — no level, so `_determineInitialLevel`
picks the manager's, the last-viewed or the initial level (`board.mjs:1414-1435`), not the
token's. The view patch used to correct that; without it a peeking player sent "back" by an
activation can land on the wrong floor. In `onActivate`, when the decision is `call`, `active` is
true, the scene is the token's and it is **not** the viewed scene (so a draw happens anyway), pass
`wrapped(active, { ...operation, viewOptions: { ...operation.viewOptions, level: t.level,
...followOptions(t) } })` (level only when `levelOn` keeps it). `activateDecision` itself is
unchanged. The `pins-scene-activate` row's `what` gains that clause (§9).

## 6. GM toasts (Risks) — owner B, `watch.mjs`

On every GM client (no writes, so no election; the bot's toast is simply unseen), with the switch
on: `createToken` / `deleteToken` of a token whose root is pinned (re)schedules one per-root check
`NET_GRACE_MS` after the **last** such event — a debounce, so a slow carry whose delete lands late
still counts one token (a carry or a core hop is create-then-delete, so a move never toasts). The check counts `tokensOfRoot(root)` and asks `tokenNotice({ n, last })`:

| n | Toast (warn, `log.notify`) | Key |
|---|---|---|
| 0 | "{actor} ({user}) has no token left: {user} stays where they are until {actor} is placed again." | `PENTARYN_PINS.Notify.Stranded` |
| > 1 | "{actor} ({user}) now has {n} tokens ({scenes}): the view follows only the copy on the scene {user} is viewing. Delete the extra one." | `PENTARYN_PINS.Notify.Paused` |
| 1 | none; forget `last` for that root | — |

`last` (Map root → n) de-duplicates: the same count never toasts twice in a row. Timers cleared in
`uninstall`. Hooks: `createToken: watch`, `deleteToken: watch`.

## 7. Behaviour changes ([declared]; also go in `pins.md` "What changed in 0.2.0")

1. "Pull users to scene" (player list, `players.mjs:280`), the nav's "pull to level"
   (`scene-navigation.mjs:249`) and `activate({ pullUsers: true })` now move pinned players too. A
   pull is how a token's move reaches the player.
2. A pinned player may click the scene nav to look at another map; nothing redirects them and no
   "Your view follows" note shows (the string is gone). Their next token move, activation of their
   token's scene, or GM pull brings them back. (`scene.navigation = false` on a scene stops
   browsing to it — core setting.)
3. Login: the active scene draws first, then resume draws the token's scene (one extra draw when
   they differ). A pinned player with no saved view, or with no active scene, still lands on the
   token's scene (resume, not pins).
4. A level change on the token's scene is followed by core (its own rule) or by pins' gap-filler;
   a level the player picked is not remembered.
5. A token moved by someone else on the same level pans the player's camera only when the player
   controls it (core); the uncontrolled pan is gone.
6. A pin set, or the switch turned on, while the player is online: the GM pulls them (instead of
   their client viewing).
7. Teleport party pulls with the party's floor (`{ level }`) when it lands on one floor; the GM's
   own view goes to that floor too. It no longer pulls a pinned player whose character stayed on
   another scene (before, the pull reached them and pins' patch sent them back; same end state, one
   draw fewer — §2.5).
8. GM toasts when a pinned character gains a second token or loses its only one.
9. A pull that reaches a pinned player while their map is still loading is no longer lost: core
   still shows its "cannot switch Scenes" toast, then the pull is carried out when the load ends
   (§5.3). Unpinned players keep core's drop.
10. Activating the pinned character's scene while the player looks elsewhere lands them on the
    character's floor, controlling it (§5.4).

## 8. Test plan

Run node suites with `FOUNDRY_APP_ROOT` set, as the Makefile does
(`make foundry-pins-check foundry-portals-check foundry-resume-check`).

### 8.1 Pure (node, fixture tables)

| Suite | Delete | Keep | Add |
|---|---|---|---|
| pins `core.test.mjs` | `viewDecision` (93-112), `queueDecision` (113-137), `followNeeded` (138-153) | loads, VERSION, HOOKS, `pinOf`, `rootActorId`, `activateDecision`, `auditPins`, `menuTrigger`, `menuAllowed`, `teleportChoices`, `pinnedName`, `menuPlacement` | `pickToken` (75-92) rewritten without `latestUuid` rows; tables for `netDecision` (none/wait/view, incl. same scene another level → view, R5), `coreSwitchesLevel` (one row per clause, cites `token.mjs:2927-2946`), `levelFollow`, `replayDecision`, `tokenNotice` |
| portals `core.test.mjs` | — | all | `usersToPull`: hidden → []; inactive; GM; viewing another scene; another level; not observing; owns another sighted token; `tokenVision` off; happy path (cites `teleport-token.mjs:212-236`) |
| resume `core.test.mjs` | the `pinnedScene` table (84-99) | the unpinned table (64-83; it also runs with `pinned: null`) | `pinned` table: saved of pinned scene → position; saved of another → scene, no position; no saved view → scene; scene gone → null; active changed → still pinned scene |

### 8.2 Glue — pins `glue.test.mjs` (846 → ≈ 430)

**Delete** (≈ 560 lines, with the socket `onAny` stub at 20-33): 1 (83-98), 4 (142-166), 5
(167-185), 6 (186-203), 6b (204-226), 7 (227-243), 8b (305-334), 7a (335-357), 7b (358-395), 10
(396-410), 11 (411-420), 12 (421-438), 13 (439-456), 13d (457-484), 13b (485-501), 13c (502-538),
`updateUser` (593-612), R2 pan (651-674), E2/B4 (675-714), E2 (715-725), A1-3 (726-747), B1
(748-780), L4 (781-823).

**Keep**: `foundry.utils` (76-82); 2 switch off (99-128, rewrite: only `_onActivate` is wrapped;
hooks no-ops); 3 activation (129-141); 8 no token left → no view (244-264, + no timer fires); 9 two
tokens stock (265-277); 9b (278-304, rewrite with mock timers: deleting the viewed copy sends them
to the one left after `NET_GRACE_MS`); 14 wild shape (539-559, rewrite "a move followed" as a carry
+ safety net); 14b (560-578); 15 GM/unpinned (579-592); 20 switch-on (613-650, rewrite "players
follow" → "the switching GM pulls the online pinned players, `{ level, controlledTokens }`"); no
errors (824-829); hot patch (830-846, one patch).

**Add** (≈ 150): N1 GM `pullToScene` of a pinned player is honoured as asked (stock call, no
redirect, no later view). N2 nav-click view of another scene passes; `canvasReady` adds nothing.
N3 cut-and-paste (keepId create on B, delete on A with `replacements`, viewing A): nothing before
`NET_GRACE_MS`, then one view of B with `{ level, controlledTokens }`, `followed` reason `cut`. N4 the
same with a pull arriving inside the window: no second view, no loading toast. N5 loading when the
timer fires: no view **then**; once `loading` clears, one re-check — already there → nothing, still
elsewhere → one view (R1; mock timers, `canvas.loading` flipped by the test). N5b same scene, the
copy on another level, original deleted → one `view({ level })` (R5). N6 the deleted token was not
on the viewed scene (a peek): no timer. N10 replay (§5.3): `pullToScene` fired on the stub socket
while `canvas.loading` → nothing now, one `view(viewOptions)` as sent when loading clears; two
dropped pulls → only the latest; not loading → pins adds nothing; unpinned / switch off → nothing;
`uninstall` → `socket.off` called with the same listener. N11 activation (§5.4): `_onActivate(true)`
of the token's scene while viewing another → core's `_onActivate` receives `viewOptions.level` =
the token's and `controlledTokens`; while viewing it → `operation` passed through untouched. N7 level
gap: core would switch → pins nothing; a sighted pet left on the origin level → one
`view({ level, controlledTokens })` after `animation.ended`; a self drag → nothing. N8 orphan level
on the safety net's target → view by scene only. N9 `watch.mjs`: copy → one Paused toast after the
window; carry inside the window → none; delete the only token → Stranded; switch off → none; same
count twice → one toast; `uninstall` clears timers. Fire `moveToken` directly
(`F.fire("moveToken", doc, movement, op, user)`); no kit change. The socket stub that held `onAny`
(20-33) is replaced by a small `on/off/fire` stub for N10. N7 also: the pet is moved away during
the animation → pins decides after `animation.ended`, so it does nothing (core switches, R7).

pins `api.test.mjs`: rewrite 73 (one adjustments row), 165 (`pinnedToken` without `latestOf`), 212
(teleport passes `pull: [user.id]` when on and online, `[]` off/offline; `viewFollows` from
`pulled`; `VIEW_UNCHANGED` online-not-pulled), 328 (selftest label); add `pin()` pulls an online
pinned player to their token's scene/level (even when the GM sees them there: F1), and not when
off / offline / dryRun.
`hooks.test.mjs` 62-82: "no hook, no pending safety-net or watch timer, the one patch unwrapped".
`menu.test.mjs`, `sheet.test.mjs`, `world-adapter.test.mjs`, `i18n.test.mjs`: unchanged (the i18n
gate checks the new keys).

### 8.3 Glue — portals and resume

- portals `teleport-token.test.mjs`: 223 rewritten: ops `createEmbedded, deleteEmbedded, pullUsers`
  (still **without** `replacements`), `pullUsers` args = the rule's users with `{ level,
  controlledTokens: [tCav…] }`, GM view unchanged; 99 (same scene) keeps "no pull, no view". Add:
  `pull` adds a user the rule skips; hidden token → only `pull`; a player viewing another scene not
  pulled; dryRun / REFUSED (`:725`-style) / CONFLICT → no `pullUsers`; `pull` not an array →
  BAD_ARGS; the `level` passed is the carried token's landed level (R6). `party.test.mjs` 223 and
  253: same op order; `pullUsers` and `scene.view` now carry `{ level }` when the destination
  region is on one floor, `{}` otherwise. §2.5 (R2), with a stub `pentaryn-pins` api on
  `game.modules`: teleportParty leaves out a user whose `pinnedToken().scene` is another scene,
  keeps one whose pinned token is on `dest`, keeps everyone when the pins api is absent or
  `pinnedToken` returns null, and pulls as stock when it throws (warn logged); teleportToken drops a
  `pinnedElsewhere` user from the rule's list but never from `pull`.
- resume `glue.test.mjs`: 177 → "pinned, saved view of the pinned scene: view with token level and
  `controlledTokens` when not already there, then pan"; 186 → "pinned, saved view of another scene:
  views the pinned scene, no pan, `resumed` fires". Add: pinned with no saved view; pinned with no
  active scene (`canvas.ready` false, `initialized` true); pinned token on another level of the
  active scene → `view({ level })` only. Keep 171, 195, 203, 213, 228 (the pinned-scene check moves
  to `pinnedOf`).

### 8.4 Goldens, one file at a time

Per module, `GOLDEN_UPDATE=1 node --test test/<file>` for **one** golden, read its diff, then the
next: pins `hooks.json` (expect `init, setup, ready, deleteToken, moveToken, renderBaseActorSheet,
updateUser, deleteUser, canvasReady, canvasTearDown, canvasPan, createToken, deleteToken`), then
`describe.json` (one patch, `followed` args, row docs), then `surface.json` (expect no change);
portals `describe.json`; resume `hooks.json` (expect no change).

## 9. `foundry/adjustments.yml`

- **Remove** `pins-scene-view` (`:1373-1382`).
- **Keep** `pins-scene-activate` (`:1384-1393`); it is now the module's only patch. Its `what`
  gains: "…and an activation of the token's own scene, while the player views another, is passed
  to core with `viewOptions.level` set to the token's level and `controlledTokens` to the token"
  (§5.4). Id, markers, `why`, `native_when`, `retire_class` unchanged.
- **Keep** `dnd5e-pins-transform-root`.
- **Add** (not patches, so `core-` prefix, C32):

```yaml
  - id: core-portals-pull-rule
    packages: [core]
    modules: [pentaryn-portals]
    files: [foundry/module/pentaryn-portals/portals-core.mjs, foundry/module/pentaryn-portals/scene-adapter.mjs]
    markers: ["usersToPull", "pullCandidates"]
    what: teleportToken pulls, on a cross-scene move, the users core's Teleport Token behaviour would pull (a copy of the private #getUsersToPull, teleport-token.mjs:212-236, for a GM mover) plus the caller's `pull` list, with { level, controlledTokens }
    why: the rule is a private method; a GM-driven move has no region behaviour to call it
    native_when: core exposes the pull rule, or a "teleport token and pull" API
    retire_class: guarded
    check: make foundry-portals-check

  - id: core-pins-level-switch-rule
    packages: [core]
    modules: [pentaryn-pins]
    files: [foundry/module/pentaryn-pins/pins-core.mjs, foundry/module/pentaryn-pins/follow.mjs]
    markers: ["coreSwitchesLevel"]
    what: a pinned player's view follows their token to another level of the same scene only when core's own level switch will not (a copy of the per-token test in TokenDocument.#handleMovementOperation, token.mjs:2927-2946), so the two never both view
    why: the test is private; doing it unconditionally would race core's own view
    native_when: core switches an owner's view to their token's new level unconditionally, or exposes its decision
    retire_class: guarded
    check: make foundry-pins-check

  - id: core-pins-pull-replay
    packages: [core]
    modules: [pentaryn-pins]
    files: [foundry/module/pentaryn-pins/pins-core.mjs, foundry/module/pentaryn-pins/follow.mjs]
    markers: ["replayDecision", "pullToScene"]
    what: on a pinned player's client (switch on) a second game.socket listener on core's "pullToScene" event records a pull that arrives while canvas.loading — which Scene#view drops with a toast (scene.mjs:264-266) — and views it, as sent, once loading clears; no patch, unpinned users and GMs untouched
    why: a pull is how a token's move reaches a pinned player, and core drops one that lands during any draw (slow Cloudflare loads); with the Scene#view patch gone nothing else re-asks
    native_when: core queues a view requested while loading instead of dropping it
    retire_class: guarded
    check: make foundry-pins-check
```

## 10. Live runner — SCENARIOS assertions that change

Only S07's expected behaviour changed. Every other assertion is untouched; nav-click and login
have no assertion that changes (S12's three checks still hold with resume doing the draw).

| Scenario | Old | New | Why |
|---|---|---|---|
| S07 title | "'Pull users to scene' is ignored for pinned users (C is pulled)" | "'Pull users to scene' moves pinned users too (it is the move primitive)" | §7.1 |
| S07 check 1 | `x.check("A ignores the pull", await x.stays("A", "north"))` | `x.check("A is pulled to South", await x.viewOf("A", "south"))` | a pull now moves a pinned player |
| S07 check 2 | `x.check("B ignores the pull", await x.stays("B", "north", 0))` | `x.check("B is pulled to South", await x.viewOf("B", "south"))` | same |
| S07 check 3 | "C (unpinned) is pulled" | unchanged | — |

Noted, not changed: S10's "teleport ok, view follows" (`res.viewFollows === true`) still holds
(§4.2: the pinned A is in `pull`, so `pulled` includes A); S13's "no 'Your view follows' toast for
C" becomes vacuous (the string is gone) and stays as is. `pins-live.test.mjs` needs no change (it
checks titles exist, not their text). Also update step 2 of
[`pin-2026-10-browser-acceptance.md`](pin-2026-10-browser-acceptance.md) (`:55-57`): the pull now
moves the player; the "Your view follows" note is gone.

## 11. Steps — two parallel owners

The interface between them is §2.3 (`pull` in, `pulled` out). B's pins tests stub portals, so
neither waits for the other. Only B edits `foundry/adjustments.yml` (A hands over the
`core-portals-pull-rule` row text above) and `context/foundry/pins.md`.

**(A) portals 0.6.0 → 0.7.0**

1. `portals-core.mjs`: `usersToPull` + its table in `core.test.mjs`; `VERSION = "0.7.0"`.
2. `scene-adapter.mjs`: `pullCandidates`; `carryTo` returns the one floor (`onFloor.level ?? null`);
   `moveCompany(…, { dryRun, pull })` pulls after a cross-scene carry and returns `pulled`; comment
   at `:407` rewritten.
3. `teleportParty` (`:513-515`): pull and the GM's `view` with `{ level }` when one floor;
   `pinnedElsewhere` (§2.5) on both pull sites.
4. `api.mjs` `teleportToken`: accept and validate `pull`, pass it, add `pulled` to the result.
5. `api-manifest.mjs` rows `teleportToken` (opts, returns, sideEffects, doc) and `teleportParty`
   (doc); README rows (`:37, 81, 84, 109`) and a "Reads" row for pins `pinnedToken` (§2.5); `CHANGELOG.md` 0.7.0 with the [declared] items;
   `module.json` `0.7.0`.
6. Tests §8.1, §8.3 (portals); `describe.json` golden alone.
7. Gates: `make foundry-portals-check`, `make foundry-conformance M=portals` (the known warn-class
   C10/C36/C59 only).

**(B) pins 0.1.0 → 0.2.0 and resume 0.1.1 → 0.2.0**

1. `pins-core.mjs` §4.4 + `core.test.mjs` §8.1.
2. `follow.mjs` §4.1, §5.1-5.4.
3. `watch.mjs` §6; `pins.mjs` FEATURES.
4. `world-adapter.mjs`, `api.mjs`, `switch.mjs` §4.2-4.3.
5. `lang/en.json`, `settings.mjs` doc, `api-manifest.mjs`, `module.json` 0.2.0, README, CHANGELOG
   0.2.0 (§4.5).
6. Glue/api/hooks tests §8.2; goldens one at a time §8.4.
7. resume: `resume-core.mjs` (`VERSION = "0.2.0"`, `resumeTarget`), `memory.mjs` (§3), tests
   §8.1/§8.3, README (`:11-13, 39-41`), CHANGELOG 0.2.0, `module.json` 0.2.0,
   `context/foundry/resume.md` (`:27-28, 44-45`).
8. `foundry/adjustments.yml` §9; `make foundry-adjustments-check`.
9. `automation/smoke/pins-live.mjs` S07 only (§10); `node --test automation/smoke/pins-live.test.mjs`.
10. `context/foundry/pins.md`: "At the table", "For the GM", Known gaps (drop the synced-build,
    orphan-level redraw and `canvas.draw` bounce entries; keep combat tracker, playlist, hidden
    scene, NOT_OWNER; add the grace-window toast), a new **"What changed in 0.2.0"** section (§7),
    and the "Running the live scenarios" result line (not re-run: rolled back only if needed);
    browser-acceptance step 2 (§10).
11. Gates: `make foundry-pins-check foundry-resume-check`, `make foundry-conformance M=pins` and
    `M=resume`, `make foundry-lib-check`, `make test`.

**Both, at the end:** the full set of gates above; `make foundry-pins-sync` (and portals/resume)
plus a Foundry restart only when Joe asks for the live run (all three `module.json` versions
changed → restart, §10 of the blueprint).

## 12. Size, before → after (approximate)

| | Before | After |
|---|---|---|
| `follow.mjs` | 419 | ≈ 200 |
| `pins-core.mjs` | 260 | ≈ 255 |
| new `watch.mjs` | — | ≈ 55 |
| pins `glue.test.mjs` | 846 | ≈ 500 |
| pins patches / adjustments rows | 2 / 3 | 1 / 4 (two `core-` rows added, one patch row removed) |
| portals source | — | + ≈ 55 |
| resume source | — | + ≈ 15 |

## 13. Follow-ups (not this run)

- **F1** combat remap: `replacements` + carry marker on `carryTo`'s delete, guard in `party.mjs`
  `onDeleteToken` (§2.4).
- **F2** the bridge `switch-scene` should view, not activate (review "Missed integrations"; out of
  scope here).
- **F3** the right-click menu → keybinding (review Simplify 3; Joe keeps the menu).
- **F4** shrink the live runner (review §4).

## 14. Review notes (adversarial review, 2026-10-17, against the code at `bd7422ec` and Foundry v14.369)

The five questions the review was asked, and what changed in this file because of them. Every
fix above is tagged with its note (R1-R7).

**Will pinned players still never be jumped by activation?** Yes. Activation reaches a client
only through `Scene._onUpdateOperation` → `_onActivate` (`scene.mjs:1350-1360`; also `:1084` on
create), which the kept wrapper skips for another scene. The only core path that *pulls* on
activation is `activate({ pullUsers: true })` of an **already active** scene (`scene.mjs:246`), no
core UI calls it (grep of `client/`: only the player list, the level nav and Teleport Token call
`pullUsers`), and it is the declared change §7.1. The bridge's `switch-scene` calls plain
`activate()`, so it is skipped. **R3 (fixed, §5.4):** an activation of the token's own scene
passed core's `viewOptions` through with no level, so a player looking elsewhere landed on
`_determineInitialLevel`'s floor, not the token's; the wrapper now adds the token's level and
`controlledTokens` when a draw happens anyway.

**Does the pull reach a player on a slow connection (no client-side give-up)?** Not as drafted.
The emit always arrives, but `Scene#view` **drops** it with a toast while `canvas.loading`
(`scene.mjs:264-266`), and on the tunnel a large map loads for tens of seconds. **R1 (fixed):** the
draft's safety net returned on "loading" — a second move during the first move's draw stranded the
player (pull 2 dropped by core, net does nothing, nothing re-checks), and a switch-on / `pin()` /
GM pull during any draw was simply lost. Now the net waits out the load and re-checks with no cap
(§5.1), and a pull core drops is replayed as sent once loading clears (§5.3, a plain
`game.socket.on("pullToScene")`, order-independent with core's listener, harmless if core ever
queues instead). Nothing on the player's client gives up; `Canvas#draw` always clears `loading`
(`board.mjs:1196, 1222, 1251, 1447`).

**Is resume's login rule race-free?** Yes, with R1. Socket events during the login draw are
buffered and replayed just before `ready` (`game.mjs:506, 555-561, 777-778`), so resume reads
current token documents and an idle canvas; a buffered pull plus resume's view queue two draws of
the same map (`Canvas#draw` chains them), never the toast. A pull or move during resume's own draw
is now covered by §5.3 / §5.1 (§3 "Race check", **R4**). Pins' API is still published before
resume's `ready: resume` (import-time `Hooks.once("ready")`), unchanged.

**Does anything regress portal-hop follow / Teleport party / P / resume for unpinned users?**
- **R2 (fixed, §2.5):** Teleport party pulls *every* active player; with the view patch gone a
  pinned player whose character stayed on another scene would be pulled to the party's scene and
  stay there — a break of "sees the scene their token is on". Portals now leaves out a pinned
  player whose `pinnedToken` is elsewhere (one API read, the same resume makes). Unpinned users,
  switch off and pins absent: byte for byte as today.
- `{ level }` on Teleport party's pull changes where *unpinned* players land (the party's floor
  instead of `_determineInitialLevel`'s) — kept, it is required for pinned players now that nothing
  corrects the floor, it is a fix for the others, and it is declared (§7.7).
- Portal-hop follow: `party.mjs` untouched; core's region still pulls (stock); S08's pet case is
  the net's. P and `prompts.placeAt`: untouched. Resume unpinned: same gate (`canvas.ready`) and
  same table; only the pinned branch changed.
- **R5 (fixed, §5.1):** the draft's net viewed only "another scene", dropping code review A1-3 (a
  copy-paste onto another floor of the same scene, original deleted: no movement event, so neither
  core nor §5.2 fires). `netDecision` compares scene and level.
- **R6 (fixed, §2.1):** the pull's `level` is the carried token's landed level, not the requested
  one (`arrivals()` may map it); and the draft's "(as in core)" was wrong — core's hop leaves the
  company behind for a tick, teleportToken carries it first, so teleportToken pulls an owner that a
  core hop would not. Intended; now stated.
- **R7 (fixed, §5.2):** the level gap-filler decided "core will not switch" before the animation
  and core decides after it; a pet moved in between made the two disagree (double view → toast, or
  nobody → wrong floor). It now decides after the same awaits, against the level captured at the
  hook, with core's `isView` bail.
- §6 watch: the per-root check is a debounce, so a slow carry never toasts "two tokens".

**Are the assertion changes the minimum?** Yes: S07's title and its two pinned checks, nothing
else. Re-walked every SCENARIOS assertion against the fixed design: S06 (B on its own active scene:
§5.4 does not apply, no draw), S08 (net), S10 (`pulled` includes A; the net finds A loading or
there, R1 waits instead of acting), S11 (all PinTest PCs travel, so §2.5 removes nobody; `{ level }`
does not change any check), S12 (resume; no pins view at login), S13 (vacuous string check), S16,
S17, S01-S05, S14-S15 are untouched by every fix here. §5.3 also makes S07's new checks robust when
the setup's `expectViews` returns while the North draw is still finishing.

**Residuals, documented, not fixed** (Pitfalls in the README / Known gaps in `pins.md`):
- A core region hop that core does not pull for (the player keeps a sighted pet on the level),
  while the player is mid-draw of **another** scene (a peek), leaves them on the peek: the net
  never yanks a peek. Their next move or an activation brings them back.
- A delete that lands during the first ~tearDown phase of a draw, before `canvas.scene` switches
  (`board.mjs:1107-1146`), is not seen by the net as "on the viewed scene"; only matters when no
  pull follows (the same pet case). Very small window.
- A login can draw the token's map twice when a pull was buffered during the login draw (cosmetic).
- No live scenario covers the split-party Teleport party (R2) or a pull during a slow load (R1);
  adding one is out of scope for this run (assertions are frozen apart from S07). Both are pinned
  by node glue tests (§8.2 N5/N10, §8.3) and belong in the browser-acceptance run.

## 15. Outcome (2026-10-17, cleanup step)

- **Live run skipped by Joe's decision:** the Fable recommendations invalidate this playtest; it is
  only run if the Fable change has to be rolled back. No scenario result for the rebuilt design.
- **Size:** `pentaryn-pins/*.mjs` 12 files, 1,786 lines in total (`pins-core` 272, `api` 281,
  `follow` 233, `canvas-menu` 215, `world-adapter` 176, `pins` 110, `api-manifest` 104,
  `menu-ui` 102, `sheet` 89, `watch` 76, `switch` 66, `settings` 62); `automation/smoke/pins-live.mjs`
  2,571 lines.
- **Cleanup:** `pins-live.mjs --cleanup` ok: deleted 2 scenes, 6 actors, 3 journals, 3 users; leftover
  empty. Verified via eval-js: 0 PinTest scenes/actors/journals/users/tokens; active scene
  `HFngiA0AvL5OC5oT`; `pentaryn-pins` api `audit()` = `{enabled:true, ok:true, pins:6, violations:[]}`
  (switch ON, 6 real pins intact). No runner process left (the remaining chrome is the headless GM
  bot's); no GM cookie file on disk.
- **Open items:** live acceptance of S01-S19 against the rebuilt design; the split-party Teleport
  party (R2) and slow-load pull (R1) scenarios; the residuals listed in section 14.

## 16. Resolve-all pass (2026-10-17, Joe's /code-review high + the rebuild final review)

Each item was checked against the code and Foundry v14.369 before it was fixed. Versions stay at
pins 0.2.0, portals 0.7.0 and resume 0.2.0; there is no second bump. Paths are relative to
`foundry/`. `pins/` means `module/pentaryn-pins/`, `portals/` means `module/pentaryn-portals/`, and
`resume/` means `module/pentaryn-resume/`.

| Item | Status | Files | Test |
|---|---|---|---|
| CR1 a stale dropped pull was replayed over a newer honoured one | fixed: a pull core honours clears `pendingPull`, and `replayArmed` stops a second poll | `pins/follow.mjs` | pins glue N10b |
| CR2 a same-scene teleport skipped the pull on a lagging `viewedScene` | fixed: it always calls `pullToPin` and is never skipped on `viewedScene` | `pins/api.mjs`, `pins/world-adapter.mjs` | pins api "teleport: pull [the player] when on and online…" (CR2 rows); glue N2b |
| CR3 portals called `pins.pinnedToken` once per user, so it walked every token for each | fixed: one `prePull` hook per pull site; pins answers it with ONE walk (`pinTargets`); new API `pinnedTokens()` | `portals/scene-adapter.mjs`, `pins/prepull.mjs`, `pins/world-adapter.mjs`, `pins/api.mjs`, `pins/api-manifest.mjs` | portals teleport-token "CR7/CR3: portals reads no pentaryn-pins API"; pins world-adapter "pinTargets (CR3)"; pins api "pinnedTokens (CR3)" |
| CR4 `tokenPermits` fell back to `doc.actor` | fixed: it uses only `TokenDocument#testUserPermission` | `pins/world-adapter.mjs`, `lib/pull-rule.mjs` | pins world-adapter "tokenPermits (CR4)"; lib pull-rule "never doc.actor" |
| CR5 the safety net forced the token's level on a same-level delete and replace | fixed: `netSeenLevel` records the level at the start of the window, and an unchanged level matches by scene only | `pins/follow.mjs` | pins glue N5c (N5b still views a real level change) |
| CR6 portals `flags.reads` lacked `api:pentaryn-pins.pinnedToken` | skipped (wrong now): after CR7 portals reads no pins API; its dependency is its own `HOOKS.prePull` event, listed in `describe().events`, and pins declares `hook:pentaryn-portals.prePull` in its reads | `portals/api-manifest.mjs`, `pins/api-manifest.mjs` | portals api "describe(): … one event (prePull, CR7)"; pins api "describe().patches … portals' prePull hook" |
| CR7 portals hard-coded pins at its pull sites | fixed: portals fires `Hooks.call("pentaryn-portals.prePull", users, { scene, level, token, reason: "token"\|"party", pull })` once per pull site, only when there are users; pins `prepull.mjs` splices out pinned-elsewhere players and never vetoes; `apiOf("pentaryn-pins")` is gone from portals | `portals/portals-core.mjs`, `portals/scene-adapter.mjs`, `portals/README.md`, `pins/prepull.mjs`, `pins/pins.mjs`, `pins/test/golden/{hooks,describe}.json` | portals teleport-token and party CR7 rows; pins api "prePull (CR7)"; pins hooks registry labels |
| CR8 one pull helper and one shared "who core pulls" rule | fixed: `pullToPin` in `world-adapter.mjs` is used by `pin()`, the same-scene `teleport()`, `switch.mjs` and `watch.mjs`; kit `lib/pull-rule.mjs` (`sourceLevel`, `ownsOtherSighted`, `pullCandidates`, `usersToPull`; testUserPermission only) is vendored into portals (teleportToken) and pins (`follow.mjs` level gap-filler); adjustments row `core-kit-pull-rule`, with `core-portals-pull-rule` and `core-pins-level-switch-rule` markers updated | `lib/pull-rule.mjs`, `lib/kit.json`, `lib/README.md`, `*/lib/pull-rule.mjs`, `pins/follow.mjs`, `pins/switch.mjs`, `pins/watch.mjs`, `adjustments.yml` | lib pull-rule.test (7); portals teleport-token "CR8: the pull rule is the kit's"; pins glue N7 rows (level gap on the kit clause) |
| CR9 re-pinning the same actor pulled the player | fixed: `pin()` pulls only when `previous !== root` | `pins/api.mjs` | pins api "pin: switch on … not … a re-pin (CR9)" |
| CR10 resume passed `controlledTokens` for a token the user does not own | fixed: `controlOptions` adds it only when `TokenDocument#testUserPermission(OWNER)` is true (board.mjs `#initializeTokenControl` replaces core's fallback otherwise) | `resume/memory.mjs`, `resume/README.md`, `resume/CHANGELOG.md` | resume glue "pinned token this user does not own (observer only)…" and "…missing from its scene…" |
| RF1 placing a pinned character again did not bring the player | fixed: on `createToken`, the active GM pulls the online player when the pin now has exactly 1 token (0 → 1); a carry counts 2 and never pulls | `pins/watch.mjs` | pins glue N9b (also: not the active GM, offline, switch off, 1 → 2: no pull) |
| RF2 pins did not declare its login dependency | fixed: `module.json` `recommends` pentaryn-resume, and `pins.md` says so | `pins/module.json`, `context/foundry/pins.md` | conformance (module.json relationships) |
| RF3 the `pullToScene` replay listener was attached at setup, while core still buffers | fixed: it is attached at `ready`, after core's `activateSocketListeners` (game.mjs:777), or at once on a hot re-import | `pins/follow.mjs`, `pins/test/golden/hooks.json` | pins hooks "(RF3) the pullToScene replay is attached at ready…" |
| RF4 the Stranded toast text was wrong for 0.2.0 | fixed: "Place {actor} again and {user} is brought to it (at their next login if offline)", which is now true (RF1) | `pins/lang/en.json`, `pins/watch.mjs` | pins glue N9 |

Not synced in this pass. The live world still runs the code from before this pass until the next
sync.
