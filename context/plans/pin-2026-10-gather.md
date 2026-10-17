---
title: Pentaryn Pins — "Gather logged-in players here" (pins 0.3.0)
status: ready (answers from Joe 2026-10-17 below)
last_modified: 2026-10-17
tags: [foundry, module, plan, pentaryn-pins, pentaryn-portals]
---

# Pentaryn Pins — Gather logged-in players here

**Read this when:** you are building or reviewing the GM action that moves every logged-in
player's pinned character (and its company) to one clicked point, the `gather` API row of
`pentaryn-pins`, or the live scenarios S20–S23. **Not this file:** using pins →
[`../foundry/pins.md`](../foundry/pins.md) · why pins moves players with core's own pull →
[`pin-2026-10-rebuild.md`](pin-2026-10-rebuild.md) · the original design → [`pin-2026-10.md`](pin-2026-10.md).

Written against `feat/pentaryn-pins` while the resolve-all workflow (CR1–CR10, RF1–RF4) was still
editing pins, portals and resume. Function names are the anchors, not line numbers. The rebuild plan
now has §16 "Resolve-all pass". This plan depends on what it records: CR2 (same-scene `teleport`
always calls `pullToPin`), CR3 (`pinTargets`, one walk), CR7 (`pentaryn-portals.prePull`, reason
`"token"|"party"`, `prepull.mjs` wired into `pins.mjs` `FEATURES`), CR8 (kit `lib/pull-rule.mjs`,
`pullToPin`), CR9 (re-pin pulls nobody) and RF1 (a carry counts 2 tokens and never triggers watch's
0 → 1 pull). Versions stay pins 0.2.0 / portals 0.7.0 after that pass. **Re-check §9 "Before coding"
once that workflow has committed.**

Joe (2026-10-17): *"it just simply teleports all players currently logged in"*. There is no
party picker. Joe runs one campaign at a time, so "the party" is every player who is logged in now.

## 0. Summary of the design

- **Where it lives:** pentaryn-pins only. A new API row `gather({ x, y, scene?, level?, dryRun })` sits
  in `api.mjs`, a new menu item in `canvas-menu.mjs`, and a pure planning rule `gatherPlan` in
  `pins-core.mjs`. **Portals gets no code change.** It stays free of any pins reference (CR7
  direction); the only portals change is one new test.
- **How it moves:** it calls pins' own `teleport(user, …)` once per member, one after another. That is
  exactly the menu's "Teleport pinned character" path → portals `teleportToken` (`moveCompany`,
  `followersOf`, `landingPlaces`, `carryTo`/`moveOnScene`, `pullAfterCarry`). No new carry and no new
  placement code.
- **How members spread out:** each later member's `landingPlaces` counts the tokens that earlier
  members left as standers (`occupiedBy`). So `ringSpots` fills outward around the click, and
  `assignSpots` puts each company next to its own leader.
- **Each player's view is moved only by their own member move:**
  - Cross-scene: portals' `pull: [user]` sends the pull, at the landed level, with the token
    controlled.
  - Same scene: `pullToPin` sends it. When the level changes, core's own level switch also runs on
    that player's client (§1.2), so a same-scene level change can show one loading toast.
  - A **gather-scoped** clause in pins' `prePull` listener drops core's rule users from the pull of a
    gathered leader's carry, so a later member's move never pulls an earlier member (or an
    unpinned observer) a second time (§3.4). Outside a gather nothing changes, so this is not a
    declared change.

## 1. Behaviour

### 1.1 Who is gathered

A **member** is a user that meets all of these:

- `active` and `!isGM`;
- carries a pin (`pinOfUser`);
- the pin passes the switch-on audit's error checks for that user (`auditPins`: no `NO_ACTOR`,
  `SHARED_ACTOR`, `NO_TOKEN` or `MANY_TOKENS`). **Only non-GM pins are passed to `auditPins`** (the
  same filter `pinTargets` uses). A GM flag on a player's actor must not make that player
  `SHARED_ACTOR`.

The single token is the one `tokensByRoots` finds for the root. It may be a wild-shaped form
token, because `rootOfToken` maps it back to the root.

| Case | What happens | Reported as |
|---|---|---|
| Online, pinned, exactly one token (any scene) | moved, with company | `moved[]` |
| Online, **no pin** | stays | `skipped[]`, code `NO_PIN` |
| Online, pin with 0 tokens / ≥2 tokens | stays (with ≥2, no copy is moved: which one to move is ambiguous) | `skipped[]`, `NO_TOKEN` / `MANY_TOKENS` (audit codes) |
| Online, pinned to a deleted actor | stays | `skipped[]`, `NO_ACTOR` |
| Two players pinned to one actor (only possible by hand: `pin` refuses with CONFLICT) | both stay | `skipped[]`, `SHARED_ACTOR` for each |
| **Offline** pinned player | stays (Joe: "offline players' characters stay put"); resume lands them on the token's scene at login | `offline[]` (info, not a problem) |
| GM, including a GM who carries a pin flag (audit `GM_USER`) | ignored; the GM's flag is left out of the audit input, so it never makes a player `SHARED_ACTOR` | not listed |
| Pinned token **unlinked** (audit `UNLINKED`) | **moved**, with a warning | `moved[].warnings: ["UNLINKED"]` |
| Pinned to an actor the player cannot observe (audit `NOT_OWNER`, e.g. a GM-only NPC) | **moved**, with a warning; they are pulled to a token they get no vision from, as `teleport` does today. A non-character, non-polymorphed actor moves **alone** (`moveCompany`'s leader rule: `type === "character"` or polymorphed) | `moved[].warnings: ["NOT_OWNER"]` |
| Wild-shaped / polymorphed | the form token moves. Its summons follow because `recordOf` gives the form its `rootActorId`, which `followersOf` matches against `summon.origin` | `moved[]`, `form` set |
| Player logged in from two browsers | there is one User, so one member and one pull. `Scene#pullUsers` emits `pullToScene` once per user id (`client/documents/scene.mjs` `pullUsers`). The server routes that emit to every socket of the user. Verify in the live run that both sessions follow; this is not verified in source here | one `moved[]` row |
| One human on two accounts, each pinned to a different character | both characters move (as intended) | two rows |
| A member whose view did not follow (cross-scene, online, not in `pulled`: `pullAfterCarry` threw, or they logged out mid-gather) | moved | `moved[].warnings: ["VIEW_UNCHANGED"]` (folded from `teleport`'s own `warning`) |

**Changed from the task sketch:** UNLINKED and NOT_OWNER are **moved, not skipped.** The audit
marks them as warnings, not errors. The menu's Teleport already offers them. Skipping would leave a
logged-in player behind because of a data-quality warning. (This is open question Q3.)

**Pinning switch OFF → `fail("REFUSED", "pinning is off")`. No fallback to `User#character`.**
Reasons:

1. With the switch off, the canvas menu does not open at all (`menuAllowed` requires `enabled`). The
   use-doc promises that with the switch off "nothing in pins does anything".
2. With the switch off, `teleport` passes `pull: []`. Tokens would move, but views would follow only
   where core's rule happens to pull. That is half a gather.
3. `User#character` is a second identity source. Nothing audits it (no one-token check), and it can
   be stale. Two sources would give two sets of rules for "the character they are logged in as".

An online unpinned player shows up as `NO_PIN` in the report, so the GM sees whom to `pin`.

### 1.2 Same scene vs another scene

- **A member on another scene:** portals `teleportToken` → `moveCompany` → `carryTo`. This is a
  keepId create on the destination, then a delete on the source. `pullAfterCarry` then pulls the
  rule's users (after the prePull listeners, §3.4) plus `pull: [user]`, with
  `{ level: landed, controlledTokens: [token.id] }`. The company is the leader's `followersOf`,
  gathered before anything moves.
- **A member already on the destination scene:** `moveOnScene` makes one `displace` update with no
  animation. Portals never pulls on the same scene. Pins' `teleport` then calls `pullToPin(user)`
  (the scene and level of the token after the move; CR2: never skipped on the GM's lagging
  `viewedScene`).
  - **Same level, player already drawing it:** core's `Scene#view` sees no scene or level change
    and draws nothing.
  - **Same level, player peeking at another map:** this brings them back (the existing N2b
    behaviour).
  - **Level changes (e.g. South Ground → South Upper):** core's own level switch also runs on the
    player's client. `TokenDocument` `#handleMovementOperation` (client/documents/token.mjs): the
    mover is a GM, but the player is not; the origin level is the one they view, and they no longer
    own a non-hidden sighted token there, so core calls `scene.view({ level, controlledTokens })`.
    Pins' `pullToPin` arrives as a second view request. `Scene#view` toasts "You cannot switch
    Scenes until resources finish loading" while `canvas.loading`, so **the player may see one
    loading toast**. Whichever lands second is either a no-op (same level) or dropped; a dropped
    `pullToScene` is replayed by follow.mjs (§5.3). The final view is the destination scene and
    level with the token controlled. This is existing same-scene `teleport` behaviour; gather
    inherits it and does not claim one view switch per player.
- **A member already standing at the point** is moved anyway. It is a cheap update that may not
  change anything, and it tidies its scattered pets around it. Members on the destination scene go
  first, nearest the click first (§2.2), so that member keeps its square.
- **A same-scene gather collects every pet the member owns from anywhere on that map**, even one
  parked on purpose: `followersOf` has no distance limit. That is `teleportToken`'s existing
  behaviour, but Gather makes it a one-click surprise, so pins.md says it.

### 1.3 Combat in progress

A cross-scene carry deletes without `replacements`, so the PC and its company **drop off the combat
tracker**. This is the known gap F1 (rebuild §2.4, `pins.md` Known gaps). A same-scene move keeps
token ids, so its combatants stay.

- Gather does not refuse.
- **The combat read is a snapshot taken before the loop**, never after a move. Core deletes the
  combatants of a deleted token from the deleting GM's client without awaiting it
  (`token.mjs` `_onDeleteOperation` → `Combat._onDeleteTokens` → `combat.deleteEmbeddedDocuments`),
  so a read after `teleport` returns would depend on that round trip. `startedCombatTokens()`
  (world-adapter) returns `Map<sceneId, Set<tokenId>>` over every **started** combat's combatants,
  keyed on `combatant.sceneId` / `combatant.tokenId`, not on `combat.scene` (an unlinked combat has
  `scene` null and still loses combatants).
- The result marks each cross-scene member whose leader or any `followers` id is in that snapshot
  under its source scene with `warnings: ["COMBAT"]`.
- The menu asks for confirmation **only** in that case (§4.3); its cheap gate and the dry run read the
  same snapshot.
- The bridge caller sees the same marks with `dryRun: true`.

### 1.4 Hidden tokens, GM view, unpinned observers, concurrency

- **A hidden PC token** moves and stays hidden. For a hidden token core's rule pulls nobody, but the
  explicit `pull` still pulls the player. That is what `teleport` does today.
- **The GM's own view never changes.** From the menu the GM is already on the destination. From the
  bridge, `teleportToken` has no view step.
- **Unpinned or skipped online players are not pulled by a gather.** Stock core would pull a player
  who observes a member's carried token and owns no sighted token left on the source. During a
  gather the §3.4 clause drops them, so their view does not jump to a map their character is not on.
  Pin them and gather again.
- **A second gather while one is running** gets `fail("CONFLICT", "a gather is already running")`.
  This uses a module-scope `busy` flag in `api.mjs`, cleared in `finally`. The menu closes before its
  action runs (`menu-ui.mjs`), so a double click is already harmless.
- Gather runs on the calling GM client. It is not a query: the bot and a browser GM never both run
  one gather.

## 2. Placement

### 2.1 Reuse, function by function (portals `scene-adapter.mjs` / `portals-core.mjs`)

Gather only fixes the **order** of members and passes **one resolved level** to every call. All
placement is portals' existing code:

| Step | Function (unchanged) |
|---|---|
| The member's company | `recordOf` + `followersOf([lead], …)` in `moveCompany`, with the lead marked `leader: true` |
| Squares around the click, skipping wall-cut squares | `ringSpots` (`maxRing` 8) over `wallBlocker(blockingWallCoords(walls on the level))` |
| Not on a stander, whole footprint | `landingPlaces` → `occupiedBy(standing)`. `standing` = every destination token on the level except the movers, **including the members moved earlier in this gather** |
| Company next to its leader, big tokens not overlapping | `assignSpots(ring, party, { fits })` with `crowded` |
| Level and elevation | `arrivals` → `elevationPatch` / `elevationOnLevel` (a given `level`: every token lands on it, and elevation is mapped onto that floor) |

**Why the per-member sequence does not overlap:** every call lays out its own tokens against every
token already standing on that level, and each call's create or update has been awaited before the
next call reads `dest.tokens`. Member 1 takes the centre. Member 2 gets the nearest free square
around it, and its company lands beside member 2. Teleport party does the same thing in one call
(`partySelection` → `landingPlaces(…, party)`). The layout differs only in which ring square each
later leader gets.

**Limit, shared with Teleport party:** when walls box in the click so that fewer than the needed
squares are reachable within 8 rings, `ringSpots` stacks the overflow on the centre. Gather reports
nothing special for this. The GM clicked into a closet.

### 2.2 Order (pure: `gatherPlan`)

1. Members whose token is on the destination scene, sorted by distance from the click to the token
   centre (top-left + half a grid square: ordering only), nearest first.
2. Then every other member, sorted by user name (the same sort as `teleportChoices`).

The order is deterministic, so the tests and S20 can pin it.

### 2.3 Level

The level is resolved **once** in `gather` and passed explicitly to every `teleport` call. Without
this, a same-scene member would keep its own floor, because `teleportToken` defaults `level` to the
token's own level when `dest === from`.

- If `opts.level` is given, it must be on the destination (`dest.levels.has`), else `BAD_ARGS`.
- Otherwise, when the destination is the scene on the caller's canvas, use `canvas.level.id`. The
  menu always passes `at.level`.
- Otherwise use `dest.initialLevel?.id ?? dest.firstLevel?.id ?? null`, which is portals' own
  default. The bot has no canvas.
- A destination with no levels (pre-v14 data) uses `null`.

### 2.4 Scene default

`opts.scene` omitted → `game.scenes.current`. Core's `Scenes#current` is the viewed scene once a
canvas is up (a browser GM: the scene on its canvas). On the headless bot (`core.noCanvas`) the
watchdog redefines it as `viewed ?? active`, the table's scene (`context/foundry/headless-gm.md`
"No canvas, by default"). Null → `BAD_ARGS` "no scene given and no current scene". The row doc says
bridge callers should pass `scene` explicitly.

## 3. Moves

### 3.1 One `teleport` per member (chosen), not a batched carry

| | Per member (pins `teleport` → portals `teleportToken`) | Batched (a new portals multi-leader row) |
|---|---|---|
| Portals change | none | new row, manifest and goldens; `carryTo` assumes one source scene (`toks[0].parent`), so it needs grouping by source |
| One member fails (`REFUSED` id clash, `CONFLICT`, a throw) | only that member; the rest still move | the whole source-scene group fails |
| Pull per member with its own `controlledTokens` | already there (`pull: [user]`, `pullToPin`) | per-user pulls must be rebuilt (one `pullUsers` options object per call) |
| Co-owned companion (a steed owned by two gathered players) | stays (each call has one leader; `followersOf` needs every owner to own a leader) | follows (`followersOf(allLeaders)`), like `bringFollowers`' "several PCs together" pass |
| Writes | 2 × N (create + delete per member; N ≤ 6) | 2 per source scene |

Per member wins: no portals change, failures stay isolated, and it is the exact path the menu's
Teleport already ships. The co-owned companion is open question **Q1**. The default is that it stays
and the GM drags it, as after a single-PC portal hop.

Gather calls the existing `teleport(user, ctx, { x, y, scene, level, dryRun })` from `api.mjs`
directly. It is not refactored. Each call re-resolves the pin (`tokensOfRoot`), so a token deleted
or copied mid-gather is reported cleanly (`NOT_FOUND` / `AMBIGUOUS`) and never moved wrongly. The
one batched read (`tokensByRoots` through `gatherInputs`, §4.1) builds the plan, the report and the
menu count. The per-member re-walk costs N extra walks (N ≤ 6, milliseconds).

### 3.2 Failure of one member

Each `teleport` result is either an `ok` row or a `failed[]` row `{ user, actor, code, reason }`,
then the loop continues:

- `REFUSED`: `idClash`, a duplicated scene keeps token ids. The whole member is refused, company
  included.
- `CONFLICT`: another session's keepId create won.
- `NOT_FOUND` / `AMBIGUOUS`: changed mid-gather.
- `INTERNAL`: a throw.

Gather returns `ok: true` with `warning: "PARTIAL"` when `failed[]` is not empty. It returns
`ok: false` only for the refusals before anything moves (§4.2).

`teleport`'s own singular `warning` (`VIEW_UNCHANGED`) is folded into that member's
`moved[].warnings`.

### 3.3 keepId clashes and a member carried in another member's company

A clash is detected per member by portals' `idClash` (dryRun too) → `REFUSED`. Normally two calls
never carry the same token:

- linked `character` tokens are `isPC` and so not `carriable`;
- a summon follows only the leader its `summon.origin` names;
- a pet follows only when every owner owns that leader.

**The edge.** `isPC` is `type === "character" && linked && !pile`. Any member token that is not
`isPC` is `carriable`: a wild-shaped member's form token (type `npc`) as well as an unlinked
`character` token. If players co-own each other's PCs (Alpha owned by A and B), member B's form
token passes `followersOf`'s "every owner owns the leader" test and **rides in member A's company**.
B's own `teleport` then re-resolves B's pin, finds that token on the destination (not `NOT_FOUND`),
and moves it again as a same-scene move with `pullToPin(B)`. B's `moved` row reports `from` = the
destination scene. With the §3.4 clause B is not pulled by A's carry, so B is still pulled once.
Reported, not prevented. A glue case pins this outcome (G10).

### 3.4 Pulls: each player pulled only by their own move, to the right level

| Member | Pulled by | Options |
|---|---|---|
| Cross-scene | portals `pullAfterCarry` (`pull: [user]`, sent by `teleport` only when the switch is on and the user is online, which holds for a member unless they log out mid-gather) | `{ level: landed level, controlledTokens: [token.id] }` |
| Same scene | pins `pullToPin(user)` inside `teleport` | `pullTargetOf`: the token's level (`levelOn`), `controlledTokens` when the user owns it |

**The double-pull hazard.** The GM's copy of `User#viewedScene` changes only when that player's draw
*ends* (`board.mjs` `#initializeUserActivity`). Take members A and B on scene S, gathered to D, A
first:

- After A is carried and pulled, A may still be drawing D while the GM's copy says "S".
- B's carry then runs core's rule (`usersToPull` over `pullCandidates`, kit `lib/pull-rule.mjs`). If A
  observes B's token and owns no other sighted token left on S (A's company left with A), the rule
  picks A.
- `dropPinnedElsewhere` keeps A, because A's pinned token *is* on D.
- A gets a second pull. If A is still loading, A sees core's "cannot switch Scenes" toast, and pins'
  replay (follow.mjs §5.3) carries the pull out later. Harmless, but visible.

The same rule would also pull an unpinned or skipped online player who observes a member's token.

**Fix: a gather-scoped clause in pins `prepull.mjs` (chosen; not a declared change).**

- `gather` sets `ctx.gather = { leaders: Set<tokenId> }` (every member's planned token id) before
  the loop and clears it to `null` in `finally`. Portals' carry keeps ids (keepId), so a carried
  leader's `data.token.id` is its planned id.
- In the listener: when `ctx.gather` is set and `ctx.gather.leaders.has(data.token?.id)`, splice
  **every non-GM user** out of `users`. Compare by **id** (`data.token?.id`), never by object:
  `data.token` is the destination `TokenDocument` (`dest.tokens.get(token.id) ?? token`), while
  `pinTargets` returns plain records.
- The member's own pull is not lost: `pullAfterCarry` adds `pull` **after** the filter
  (`[...kept, ...pull]`), and `pull` is `[user]`.
- Any other pull (no gather running, a Teleport party pull with `token: null`, a non-member token)
  keeps today's rule exactly, so stock behaviour outside a gather is unchanged. No `[declared]` tag,
  no blueprint §9 live gate.
- The clause keys on `data.token`, not on `reason` (`"token"|"party"` after CR7).
- The listener is wired: resolve-all put `prePull` in `pins.mjs` `FEATURES`, and `golden/hooks.json`
  lists `pentaryn-portals.prePull` ("prePull: leave pinned-elsewhere players"); `hooks.test.mjs`
  imports `pins.mjs` itself, so it builds through the feature list. Gather now depends on it, so
  `selftest` gains a check "prePull listener registered" (§4.1).

**The wider rule, not adopted now (Q5):** "another character's move never pulls a pinned player",
for every `teleportToken` pull. That changes existing behaviour (a pinned player peeking at the
source while their own token is on the destination), so it is `[declared]` and per addon-blueprint
§9 needs a live run observing old vs new (S23-variant: GM `pins.teleport(B → South)` while A peeks at
North; old: A pulled, new: A stays) before merge. If adopted, its comparison is
`t.token.id === data.token?.id && t.token.scene === sceneId`.

## 4. Where the code lives

### 4.1 Files (pins only) and the contract between owners

| File | Owner | Change |
|---|---|---|
| `pins-core.mjs` | P | `gatherPlan(inputs, { destSceneId, point, grid })` (contract below). Reuses `auditPins` for the codes (AUDIT_CODES: errors skip, warnings ride along), plus `NO_PIN`. `VERSION` becomes `"0.3.0"`. Pure, about 45 lines |
| `world-adapter.mjs` | P | `gatherInputs({ byRoot } = {})` (contract below; one `tokensByRoots` walk, or the caller's `byRoot`). `startedCombatTokens()` → `Map<sceneId, Set<tokenId>>` (§1.3). About 30 lines |
| `api-manifest.mjs` | P | row `gather` (§4.2) |
| `api.mjs` | P | `gather(ctx, opts)`: validate, resolve the destination (§2.4) and level (§2.3) once, take the combat snapshot, build the plan, set `ctx.gather`, loop `teleport(user, ctx, { x, y, scene, level, dryRun })`, fold `res.warning` and COMBAT into `warnings`, collect `moved` / `failed`, write a `log.info("gather", { uuid: dest.uuid, ids, by })` audit line, return `toPlain(out, { maxDepth: Infinity })`. `busy` flag and `ctx.gather` cleared in `finally`. `selftest`: check "prePull listener registered" (`ctx.reg.ids()` holds the prePull label). About 75 lines |
| `prepull.mjs` | P | the §3.4 gather clause |
| `module.json` | P | `version` 0.3.0; the description gains "Gather logged-in players here" |
| `test/fixtures/actors.mjs` | **P only** | online users, a started combat (M stubs locally in `menu.test.mjs`) |
| `canvas-menu.mjs` | M | the menu item, the combat confirm and the toasts (§4.3). About 45 lines |
| `lang/en.json` | M | keys (§4.4) |

**Contract (fixed before either owner codes):**

```js
// world-adapter (P)
gatherInputs({ byRoot } = {}) → {
  users: [{ id, name, active, isGM }],                  // every user
  pins: [{ user, actor, observes }],                     // NON-GM pins only (auditPins input shape)
  pinsByUser: { [userId]: rootId|null },                 // non-GM users
  actors: { [rootId]: { id, name } },                    // existing roots only
  tokensByRoot: { [rootId]: tokenRecord[] },             // tokenRecord: { doc, id, uuid, scene, sceneName, level, x, y, linked, form }
}
startedCombatTokens() → Map<sceneId, Set<tokenId>>

// pins-core (P), pure
gatherPlan(inputs, { destSceneId, point: { x, y }, grid }) → {
  members: [{ user: { id, name }, actor: { id, name }, root, token: { id, scene, sceneName, level, x, y, form },
              sameScene: boolean, warnings: ["UNLINKED"|"NOT_OWNER"] }],   // ordered (§2.2)
  skipped: [{ user: { id, name }, actor: { id, name }|null, code }],       // NO_PIN | NO_ACTOR | SHARED_ACTOR | NO_TOKEN | MANY_TOKENS
  offline: [{ user: { id, name }, actor: { id, name }|null }],
}
```

The menu's cheap combat gate is `members.some(m => !m.sameScene && startedCombatTokens().has(m.token.scene))`.

Portals stays untouched. Pins already declares `api:pentaryn-portals.teleportToken` and
`hook:pentaryn-portals.prePull` under `flags.reads`, so the manifest's `flags` do not change.

### 4.2 API row

```js
{
  path: "gather",
  params: [{ name: "opts", type: "{ x, y, scene?, level?, dryRun = false }",
    doc: "x, y: canvas point on the destination; scene: Scene|id|uuid|exact name (default game.scenes.current: the canvas scene in a browser, the table's scene on the headless bot; bridge callers should pass it); level: a level id on it (default: the canvas level there, else its initial level)" }],
  returns: "{ ok: true, to: { scene, x, y, level }, moved: [{ user, actor, token, form, from, followers, pulled, viewFollows, warnings }], "
    + "skipped: [{ user, actor, code }], offline: [{ user, actor }], failed: [{ user, actor, code, reason }], warning?: PARTIAL|NOBODY, dryRun? } | { ok: false, code, reason }",
  gm: true, writes: true, dryRun: true, since: "0.3.0",
  sideEffects: ["per logged-in pinned player, in order: pins.teleport → pentaryn-portals teleportToken (the pinned token and its company moved to the point, one level)",
    "cross-scene: portals pulls the player (pull: [user]); same scene: pullToScene to the token's scene and level (a level change also runs core's own level switch on that client)",
    "while it runs, a gathered leader's carry pulls only its own player (prePull)",
    "offline, unpinned, GM users and pins with no single token: nothing"],
  doc: "Gather every logged-in player's pinned character, with its summons and pets, at one point (cross-scene or same scene); their views follow. "
    + "No picking: every active non-GM user with a pin that has exactly one token. NOT_GM; REFUSED while pinning is off; BAD_ARGS bad x/y, scene or level, "
    + "or no scene given and no current scene; UNSUPPORTED without portals teleportToken; CONFLICT while another gather runs. One member failing does not stop the others "
    + "(failed[], warning PARTIAL). warnings per member: UNLINKED, NOT_OWNER, COMBAT (a cross-scene move drops combatants from the tracker), VIEW_UNCHANGED (the view did not follow).",
}
```

- **dryRun:** each member's `teleport` runs with `dryRun: true`. That gives `followers` and the
  `REFUSED` clash check, with no writes and no pulls. Spots are not predicted, because they depend on
  the earlier arrivals. COMBAT marks come from the same pre-loop snapshot.
- **`toPlain(out, { maxDepth: Infinity })`**, as `audit()` does. The kit's `toPlain` counts the root
  as depth 0 and returns `"[max depth]"` at `depth >= 4`; `moved[i].followers[j]` and
  `moved[i].pulled[j]` sit at depth 4 (verified: the default cap turns both into `["[max depth]"]`,
  the M1/E1 bug).
- The audit lines are one per member (`teleport`'s own) plus one `gather` line.

### 4.3 Menu item

- **Label:** "Gather logged-in players here".
- **Icon:** `fa-people-group`.
- **Position:** between "Prompt note" and "Teleport pinned character ▸".
- **Shown:** whenever the menu opens. It already requires GM, the switch on and the token layer.
- **Disabled** when the plan has no members, with the note "no one to gather". **Enabled** note:
  "{n}" (the member count).
- The count comes from `gatherPlan(gatherInputs({ byRoot }))`. Share the single `tokensByRoots` walk
  with `choicesNow` when building the menu: compute `byRoot` once and pass it to both.
- **Click** → `C.api.gather({ x, y, scene, level })` with the menu's `at`.
- **Confirm or not.** Joe said one click, and a confirm listing who moves is not a party pick. It is
  still friction on every gather, so the default is **no dialog**, with one exception:
  - When the cheap gate (§4.1) is true, run `gather({ …, dryRun: true })` first.
  - If any `moved[]` row carries `COMBAT`, show `DialogV2.confirm` listing those characters: "drops
    them from the combat tracker". The buttons are Gather / Cancel. **Every name interpolated into
    the dialog's HTML goes through `foundry.utils.escapeHTML`** (addon-blueprint §5.4; portals'
    `confirmParty` uses `esc`).
- **After the gather**, the GM gets:
  - `!r.ok` (CONFLICT, REFUSED, BAD_ARGS, UNSUPPORTED, NOT_GM): one `warn` toast through
    `C.log.notify("warn", …)`: "Gather failed: {reason}";
  - `r.ok`: one `info` toast "Gathered {names} → {scene}";
  - when `skipped`/`failed` is not empty, one `warn` toast: "Not gathered: {list}". `NO_PIN` uses
    `Gather.NoPin` ("{user}: no pin"); the audit codes use the existing `Audit.*` strings (full
    sentences with the names); failures use `Notify.TeleportFailed` ("{actor} not moved: {reason}");
  - when any `moved[]` row carries `VIEW_UNCHANGED`, one `warn` toast naming those players.
  - Offline players are not toasted. They are expected to stay.

### 4.4 i18n keys (`PENTARYN_PINS.*`)

`Menu.Gather` "Gather logged-in players here" · `Menu.GatherCount` "{n}" · `Menu.GatherNone` "no one
to gather" · `Notify.Gathered` "Gathered {names} → {scene}" · `Notify.GatherSkipped` "Not gathered:
{list}" · `Notify.GatherFailed` "Gather failed: {reason}" · `Notify.GatherViewUnchanged` "Gathered,
but the view did not follow for: {users}" · `Gather.NoPin` "{user}: no pin" · `Gather.CombatTitle`
"Gather during combat?" · `Gather.CombatBody` "{names} will leave the combat tracker (moved to
another scene)." · `Gather.Yes` "Gather" · `Gather.No` "Cancel". Reused without change:
`Audit.NoToken|ManyTokens|NoActor|SharedActor`, `Notify.TeleportFailed`.

### 4.5 Settings

None. If the combat-only confirm feels wrong at the table, the change is a one-line flip, not a new
setting (Q2).

## 5. Tests

### 5.1 Pure (`core.test.mjs`, the `gatherPlan` fixture table)

1. Offline pinned → `offline`.
2. Online unpinned → `NO_PIN`.
3. GM (with and without a pin flag) → absent.
4. **GM flag on the player's actor → the player is still a member** (the GM pin is not in `pins`).
5. 0 tokens → `NO_TOKEN`; 2 tokens → `MANY_TOKENS`.
6. Deleted actor → `NO_ACTOR`.
7. Two players on one actor → both `SHARED_ACTOR`.
8. Unlinked → a member with `UNLINKED`.
9. Not observing → a member with `NOT_OWNER`.
10. Wild-shaped form token → a member (`token.form` set).
11. Order: destination-scene members by distance, then the rest by name.
12. Nobody → empty `members`.

Also add `gatherPlan` to the "core loads with no Foundry globals" function list.

`prepull` rows (in `api.test.mjs`, beside the existing PRE_PULL case):

- During a gather (`ctx.gather.leaders` holds token L), a pull with `data.token.id === L` and
  `pull: []` drops every non-GM user in `users` (pinned on the destination, pinned elsewhere,
  unpinned); GMs stay. `pull: []` so `data.pull` cannot mask a wrong comparison.
- During a gather, a pull whose `data.token` is not a leader → today's rule (only pinned-elsewhere
  dropped).
- `data.token` passed as a TokenDocument stub whose `id` is L (not the `pinTargets` record object) →
  matched.
- No gather running → today's rule, unchanged (the existing PRE_PULL case still green).
- A party pull (`token: null`) during a gather → today's rule.
- Switch off → nothing dropped.

`world-adapter.test.mjs`: `gatherInputs` makes one walk (or none with `byRoot`), leaves GM pins out
of `pins`; `startedCombatTokens` keys on `combatant.sceneId` (a combat with `scene` null included),
skips unstarted combats.

### 5.2 Glue (`api.test.mjs`, with the existing portals `teleportToken` stub that records calls)

- **G1** Three online pinned players (two on S, one on D), one offline and one unpinned:
  - three calls, in plan order, each `{ x, y, scene: D, level: L, pull: [user] }` (the same-scene one
    included);
  - the offline player's token is untouched;
  - `moved` / `skipped` / `offline` are exact;
  - **`moved[0].followers[0].name` and `moved[0].pulled[0].id` are strings** (the `toPlain` depth);
  - the same-scene member is pulled once (`pullToPin` → the stub scene's `pullUsers`).
- **G2** The second member's stub returns `REFUSED` → it is in `failed`, the third still moves,
  `ok: true, warning: "PARTIAL"`.
- **G3** The stub throws → `INTERNAL` in `failed`, the loop continues.
- **G4** `dryRun` → every call has `dryRun: true`, there are no `pullUsers` calls, and the result has
  `dryRun: true`.
- **G5** Refusals:
  - `NOT_GM`;
  - `REFUSED` with the switch off;
  - `BAD_ARGS` for non-finite x, an unknown scene, a level not on the scene, and no scene with
    `game.scenes.current` null;
  - `UNSUPPORTED` without portals.
- **G6** Level and scene resolution:
  - an explicit level is passed through;
  - the canvas scene uses `canvas.level`;
  - another scene uses `initialLevel`, then `firstLevel`, then `null`;
  - a same-scene member gets the explicit level, not its own;
  - scene omitted → `game.scenes.current`.
- **G7** A second `gather` while the first awaits → `CONFLICT`; `busy` and `ctx.gather` are cleared
  after a throw.
- **G8** Double pull: the stub's second call fires `Hooks.call(PRE_PULL, [A, C], { token: B's token,
  pull: [B] })` while A's pin is already on D and C is unpinned → A and C are dropped. The same call
  after the gather has returned drops neither.
- **G9** COMBAT: a started combat holding a cross-scene member's follower id → `warnings:
  ["COMBAT"]`, **with the stub deleting those combatants inside its `teleport`** (the mark comes from
  the pre-loop snapshot). A same-scene member is never marked.
- **G10** Co-owned form token (§3.3): member B's form token rides in member A's stub company; B's own
  call finds it on D and moves it same-scene; B's row has `from` = D; B is pulled once.
- **G11** A stub `teleport` result with `warning: "VIEW_UNCHANGED"` → that row's `warnings` holds it.

Menu (`menu.test.mjs`, owner M, with local stubs of the §4.1 contract):

- The item order is Prompt note, Gather, Teleport ▸. When prompts is absent: Gather, then Teleport.
- Disabled with the note when there are no members; the count note when enabled.
- One `tokensByRoots` walk per menu open (shared `byRoot`).
- A click calls `gather` with the clicked canvas point, scene and level.
- No dialog normally. A combat member → `DialogV2.confirm`, and Cancel moves nothing. A character
  named `<b>X</b>` appears escaped in the dialog content.
- The toast keys, including `GatherFailed` on an `ok: false` result and `GatherViewUnchanged`.

`i18n.test.mjs` picks up the new keys automatically.

**Portals, test only** (`teleport-token.test.mjs`): "two `teleportToken` calls to one point, one
after another, never overlap: the second leader takes a ring square, its company lands beside it".
Pins relies on this, so portals' own suite pins it. There is no portals code or version change.

### 5.3 Goldens

Regenerate one file at a time and review each diff:

- `golden/describe.json`: the new `gather` row.
- `golden/surface.json`: the new `gather` member.
- `golden/hooks.json`: should not change (the prePull listener already exists; only its body
  changes). If it changes, explain why.

Pins `module.json` and `VERSION` change together, because `core.test` compares them.

### 5.4 Live scenarios (`automation/smoke/pins-live.mjs`)

These use the existing PinTest fixtures: A→Alpha (+ Summon, + Pet, all owned by A only), B→Beta,
C unpinned (Gamma), North (no levels), South (Ground, Upper). A new page probe counts `pullToScene`
arrivals per player page: `probesSource` adds, on Hooks `ready`, a `game.socket.on("pullToScene")`
counter to `__pinsLive` (marked like the toast seq).

| Id | Setup | Act | Checks |
|---|---|---|---|
| **S20** gather across scenes with summons and a level | `LAYOUT.home` (Alpha + Summon + Pet on North, Beta on South Ground, Gamma on North), pinning on, A and B online viewing their tokens' scenes, C online | `pins.gather({ scene: south, level: Upper, x, y })` through `x.world` | `ok`. `moved` = [B (same scene first), A]. `skipped` = [C `NO_PIN`]. Alpha, Summon, Pet and Beta are each on South **Upper** exactly once, with no two token boxes overlapping. Gamma is still on North. `moved[A].followers` lists Summon and Pet by name (not `"[max depth]"`). **A** (cross-scene): view South/Upper, Alpha controlled, no "cannot switch Scenes" toast. **B** (same scene, level change): final view South/Upper with Beta controlled; a loading toast is allowed (§1.2). Nothing of Alpha's company is left on North |
| **S21** offline player skipped | `LAYOUT.home`, pinning on; setup calls `await x.env.logoutPlayer("B")` (as S12/S14 do) and asserts `game.users.get(B).active === false` before `act`; A online | gather to North | Alpha's company is on North at the point. Beta's token is unchanged (scene, x, y, level). `offline` = [B] |
| **S22** duplicate token skipped | `LAYOUT.allNorth` plus a copy of Beta on South (`MANY_TOKENS`), A and B online | gather to South | `skipped` = [B `MANY_TOKENS`]. Both Beta tokens are unchanged. Alpha's company moved and A's view followed. The setup's copy is deleted by the scenario's own restore |
| **S23** each member pulled once (the §3.4 clause) | `LAYOUT.allNorth`, pinning on, A and B online, both viewing North. Setup grants B OBSERVER on Alpha and A OBSERVER on Beta; the restore puts ownership back | gather to South (order by name: A, then B) | Each of A and B received **exactly one** `pullToScene` (the probe counter, not the toast). Both views end on South. GM `selftest()` has "prePull listener registered" ok. Note: without the clause the second pull of A happens only while the GM's copy of A's `viewedScene` still says North, so a pass here is a regression check; G8 is the deterministic proof |

S14 changes: its title and check go from "both items" to "all three items". The Gather row is
enabled with a count when A and B are online. No other scenario's assertions change.
`--list` shows S01–S23. Joe's rule stands: run the live suite only for a rollback, unless Q6 says
otherwise.

## 6. Docs, adjustments, versions

Anchors are by text, not line number: resolve-all is editing these docs too.

- **`context/foundry/pins.md`:**
  - in "For the GM", a third menu bullet for Gather (who, skips, combat confirm, unpinned players
    are not pulled, a same-scene gather collects pets from anywhere on the map, a level change may
    show one loading toast);
  - an API quick-calls line (with `scene` passed explicitly from the bridge);
  - in "Known gaps": "Gather is per member: a steed two gathered players co-own stays behind" (if
    Q1 keeps the default), and add Gather to the combat-tracker gap;
  - "Running the live scenarios": 23 scenarios (S01–S23).
- **Module `README.md`:**
  - API section: the row;
  - Files: `canvas-menu.mjs` gains Gather; `prepull.mjs` gains the gather clause;
  - Pitfalls: the viewedScene lag behind the §3.4 clause; "a same-scene level change also triggers
    core's own level switch, so the player may see one loading toast";
  - Events: the gather-scoped prePull clause (no change outside a gather).
- **`CHANGELOG.md`:** 0.3.0, Added (gather row, menu item, the gather-scoped prePull clause,
  selftest check). Nothing under Changed.
- **`.claude/skills/pins/SKILL.md`** description: "(Prompt note, Gather logged-in players, Teleport
  pinned character)". Add a routing case to `scripts/eval/skill_routing/cases/dev.json`: "bring
  everyone who's logged in to this spot" → pins.
- **One line in each:**
  - `context/foundry/README.md`: the routing row starting "Keep Talo's player on Talo's map" (its
    menu list), and the module table row for `pentaryn-pins` (version and the `gather` method);
  - `context/pentaryn.md`: the bullet containing "GM right-click canvas menu: Prompt note, Teleport
    pinned character";
  - `context/foundry/scene-links.md`, next to Teleport party: "every logged-in player's character →
    pins Gather".
- **`foundry/adjustments.yml`: no rows.** Gather uses only public core API (`Scene#pullUsers`,
  `Scenes#current`, the `Combat`/`Combatant` documents) and portals' published API and event. The
  prePull clause touches no core internal. The existing `core-pins-*` rows cover the pins files
  whose core-copied rules do not change.
- **Versions:**
  - pins 0.2.0 → **0.3.0** (resolve-all kept 0.2.0). The change is additive, so `CONTRACT` stays
    `pentaryn-pins/api@1`. The `module.json` version change needs a Foundry restart.
  - portals: no bump (test only). Kit: none.

## 7. Open questions for Joe

| # | Question | Blocking? | Default chosen |
|---|---|---|---|
| Q1 | A companion **co-owned** by two gathered players (a shared steed) stays behind with per-member moves. Should it come along, the way a group portal hop brings it? | no | stays. Bringing it needs a portals multi-leader row (§3.1 table): a later, separate change |
| Q2 | No confirm dialog, except when a cross-scene member is in a started combat. OK? | no | yes |
| Q3 | Unlinked pinned token / pin on an actor the player can't observe: moved with a warning, not skipped. OK? | no | moved |
| Q4 | Switch off → gather refused; no `User#character` fallback. OK? | no | refused |
| Q5 | During a gather, a gathered leader's carry pulls only its own player: unpinned/skipped observers and already-gathered members are not pulled along (§3.4, §1.4). Also adopt the wider rule for every `teleportToken` pull? That one is `[declared]` and would need its own live run first | no | gather-scoped only; the wider rule not adopted |
| Q6 | Run S20–S23 (+S14) live once after building, against your standing "live only for rollback" rule? | no (no declared change needs it) | write them, don't run until you say |

## 8. Implementation steps: one workflow, two code owners plus docs, disjoint files

The contract all owners code against is fixed by §4.1 (adapter and core shapes), §4.2 (the row) and
§3.4 (the prePull clause).

**Owner P — pins core, API, pull** (`pentaryn-pins/`), runs first:

1. `pins-core.mjs`: `gatherPlan`, `VERSION = "0.3.0"`.
2. `world-adapter.mjs`: `gatherInputs`, `startedCombatTokens`.
3. `api-manifest.mjs`: the `gather` row.
4. `api.mjs`: `gather`, the `busy` flag, `ctx.gather`, the audit line, the selftest check.
5. `prepull.mjs`: the §3.4 gather clause.
6. `module.json`: version and description.
7. Tests: `test/fixtures/actors.mjs` (P alone), `core.test.mjs` (§5.1), `api.test.mjs` (G1–G11 plus
   the prePull rows), `world-adapter.test.mjs`.
8. `GOLDEN_UPDATE=1` for `describe.json` and `surface.json`, one at a time; review the diffs.

**Owner M — menu and strings** (`pentaryn-pins/`): may write code against the §4.1 contract in
parallel, but runs `menu.test.mjs` only after P's steps 1–2 have landed.

1. `canvas-menu.mjs`: the item, the shared walk with `choicesNow`, the combat gate and confirm
   (escaped), the toasts.
2. `lang/en.json`: §4.4.
3. `menu.test.mjs`: the §5.2 menu cases, stubbing the API and fixtures locally.

**Owner T — portals test, live runner, docs:**

1. `pentaryn-portals/test/teleport-token.test.mjs`: the sequential-spread case.
2. `automation/smoke/pins-live.mjs`: the `pullToScene` probe counter, S20–S23 and the S14 title and
   check; `--list` shows S01–S23.
3. Docs per §6: `context/foundry/pins.md`, the pins `README.md` and `CHANGELOG.md`, the pins skill,
   the routing case, and the one-liners in `context/foundry/README.md`, `context/pentaryn.md` and
   `context/foundry/scene-links.md`.
4. Set this plan's status to `built`.

**Gate (after all three):**

1. `make foundry-pins-check foundry-portals-check` (node suites, conformance, goldens) and
   `node automation/smoke/pins-live.mjs --list`.
2. One adversarial review pass (§3.4 clause, §2 spread, the §1.1 table, §1.3 snapshot).
3. Then `make foundry-pins-sync` and a Foundry restart (`module.json` version).
4. No live run unless Q6 says so. No commit unless Joe asks.

Size estimate: about 245 lines of code, about 340 lines of tests, and 4 live scenarios.

## 9. Before coding (after resolve-all commits)

- Re-read `prepull.mjs` and `HOOKS.prePull` in `portals-core.mjs`: `reason` is `"token"|"party"`;
  `data.token` is the carried token on the destination (`pullAfterCarry` passes
  `dest.tokens.get(token.id) ?? token`), and `pull` is added after the listeners (`[...kept, ...pull]`).
- Confirm `prepull` is still in `pins.mjs` `FEATURES` (it is in the tree as read) and in
  `golden/hooks.json`.
- Confirm `teleport`'s signature and result keys (`to`, `followers`, `pulled`, `viewFollows`,
  `warning`, `online`) and `pullToPin`'s name. The menu and G1 depend on them.
- Confirm pins' version is still 0.2.0 (rebuild §16 says so).

## 10. Review notes (2026-10-17, two reviewers; each point verified against the tree and Foundry v14.369)

**Blockers**

| # | Point | Verdict | How |
|---|---|---|---|
| B1 | `toPlain` default depth 4 turns `followers`/`pulled` entries into `"[max depth]"` (both reviewers) | resolved | Verified in `lib/api.mjs` (`depth >= cap`, root = 0) and by running it on the planned shape. §4.2 now uses `{ maxDepth: Infinity }`; G1 and S20 assert names survive |
| B2 | S20 "no toast for B" and §1.2 "core draws nothing" are wrong for a same-scene level change | resolved | Verified `TokenDocument` `#handleMovementOperation` (non-GM viewer, origin level viewed, no owned sighted token left → `scene.view({ level })`) and `Scene#view`'s `canvas.loading` toast. §1.2 rewritten, S20 checks no toast only for A and the final view for B, README Pitfalls bullet added (§6) |
| B3 | The `[declared]` prePull clause had no live gate per addon-blueprint §9 (reviewer 1); no live scenario exercised the double pull (reviewer 2) | resolved | Took reviewer 1's option (b): the clause is gather-scoped (§3.4), so behaviour outside a gather is unchanged and nothing is declared. Added S23 anyway (reviewer 2), with a `pullToScene` counter probe, OBSERVER grants so the rule really picks the earlier member, and a selftest check. The wider rule moved to Q5 with its own live gate |
| B4 | S21 cannot be set up: `needs.players` never logs anyone out | resolved | Verified the runner (`for (const k of sc.needs?.players ?? []) await this.ensurePlayer(k)`). S21 setup calls `logoutPlayer("B")` and asserts inactive; "B gets no toast" dropped |
| B5 | prePull listener not wired in `pins.mjs` `FEATURES` | resolved (by resolve-all) | Re-read the tree: `FEATURES = [follow, sheet, canvasMenu, switchAudit, watch, prePull]`, `golden/hooks.json` lists it, `hooks.test.mjs` imports `pins.mjs` (so it builds through the feature list). §3.4 and §9 updated; selftest check "prePull listener registered" added since gather depends on it |
| B6 | COMBAT read after the carry races core's unawaited combatant delete | resolved | Verified `token.mjs` `_onDeleteOperation` → `Combat._onDeleteTokens` → unawaited `deleteEmbeddedDocuments`. §1.3: one pre-loop `startedCombatTokens()` snapshot keyed on `combatant.sceneId`; G9 deletes inside the stub |
| B7 | Owners P and M were not disjoint (menu imports P's new exports; fixtures unowned; no scene-level combat helper) | resolved | §4.1 fixes the `gatherInputs` / `gatherPlan` / `startedCombatTokens` contract and the cheap gate; fixtures go to P alone; M tests after P steps 1–2 (§8) |

**Suggestions**

| # | Point | Verdict | How |
|---|---|---|---|
| S1 | COMBAT snapshot before the loop (reviewer 1) | resolved | same as B6 |
| S2 | Fold `teleport`'s `VIEW_UNCHANGED` into `moved[].warnings`; GM toast names them (both) | resolved | §1.1 row, §3.2, §4.2 doc, §4.3 toast, `Notify.GatherViewUnchanged`, G11 |
| S3 | No toast for an `ok: false` gather | resolved | `Notify.GatherFailed`, §4.3, menu test |
| S4 | Escape names in the combat confirm | resolved | Verified addon-blueprint §5.4 rule. §4.3 and a `<b>` menu test |
| S5 | A GM pin flag makes a player SHARED_ACTOR via `auditPins` | resolved | Verified `auditPins` counts every pin in `byActor`. `gatherInputs.pins` is non-GM only; core.test row 4 |
| S6 | `t.token !== data.token` compares a record with a TokenDocument | resolved | Verified `tokenRecord` is a plain record (with `doc`). The gather clause compares `data.token?.id`; the wider Q5 rule's comparison is spelled out; prepull rows use `pull: []` and a document stub |
| S7 | Bridge call with `scene` omitted on the no-canvas bot | resolved | §2.4: default `game.scenes.current` (verified core `Scenes#current` = viewed when a canvas or noCanvas, the watchdog override on the bot), documented in the row; G6 |
| S8 | §3.3 understated: a wild-shaped form token is also `carriable` | resolved | Verified `isPC`/`carriable`/`followersOf`. §3.3 rewritten; G10 pins the outcome (`from` = D, one pull) |
| S9 | An unpinned logged-in player can be pulled by core's rule along with a member's token | resolved | The gather-scoped clause drops every non-GM rule user for a gathered leader's carry (§3.4, §1.4); said in pins.md (§6) |
| S10 | "Not gathered: no pin" names nobody | resolved | `Gather.NoPin` "{user}: no pin"; failed rows reuse `Notify.TeleportFailed` ("{actor} not moved: {reason}"), which already names the actor |
| S11 | `form` in the §1.1 table but not in `returns` | resolved | added to `returns` |
| S12 | §6 anchors by line number | resolved | anchors by row/bullet text |
| S13 | Same-scene gather collects pets from anywhere on the map | resolved | §1.2 bullet and the pins.md "For the GM" note (§6) |

No blocker remains, so the status is `ready`.

## 11. Joe's answers (2026-10-17) — these override the defaults above

| Q | Decision |
|---|---|
| Q1 co-owned companions | **New rule, applies to every move, not just gather.** A companion owned by ONE character always follows it, at any distance (unchanged). A companion **co-owned by several players**: in a **gather** it always comes, landing beside the last-moved of its gathered owners (offline co-owners don't count). In a **single move** (pins teleport, portals teleportToken, a portal hop) it comes only if it is **within 10 ft** of the moving owner: the gap between token edges, same level. If several owners are within 10 ft or it's a tie, the **last-moved** owner takes it. Otherwise it stays and the GM drags it. This replaces portals' old "a co-owned steed comes when all its owners go together" rule, in portals' follower logic (followersOf / assignSpots), shared by bringFollowers, teleportParty and moveCompany. Update the portals README and the regression guard. |
| Q2 confirm | Default: one click, confirm only for the combat case. |
| Q3 unlinked / not-owner pins | Default: move with an UNLINKED / NOT_OWNER warning so Joe can fix the token (Link Actor Data). |
| Q4 pinning off | Default: gather is REFUSED ("pinning is off"); nothing moves. |
| Q5 bystander pulls | Default: during a gather, each character's move pulls only its own player; the wider rule is not adopted. |
| Q6 live testing | **Run it live.** Run S20–S23 plus S14, and add scenarios for the co-owned steed rule (gather brings it; a single move within 10 ft brings it; beyond 10 ft it stays; a tie goes to the last moved). Joe's earlier "no play test" only meant the previous version. Include the Mac real-browser acceptance once Joe allows Chrome on the Mac. |
