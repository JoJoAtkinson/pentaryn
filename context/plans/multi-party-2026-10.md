---
title: "Multi-party in one world — feasibility, options, plan"
status: proposed
last_modified: 2026-10-12
tags: [plan, foundry, multi-party, feasibility]
---

# Multi-party in one world — feasibility, options, plan

**Read this when:** you are deciding whether to run two parties in the one live `pentaryn`
world at the same time (one party playing with the GM while another is logged in and
unaware), or you are about to build the `pentaryn-parties` module and the split/join tool
this plan designs. History and design, not instructions: nothing here is built. When it
ships, the use-doc goes in `context/foundry/parties.md` and the module README.

Research date 2026-10-12. Core facts were checked against the installed Foundry **14.369**
client/server source (`/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app`,
cited below as `client/…`, `common/…`, `dist/…`) and the **dnd5e 6.0.6** bundle
(`~/Library/Application Support/FoundryVTT/Data/systems/dnd5e/dnd5e.mjs`, cited as
`dnd5e.mjs:<line>`). Nothing touched the live world. Where a claim rests on a package
page or a forum rather than source, it says so; where it was not checked at all, it says
**unverified**.

## 0. The short answer

- **Possible in one world? Yes.** Core already lets every user view a different scene (and,
  since v14, a different level), keeps combat, fog, cursors, pings and rulers per scene, and
  can pull a chosen list of users to a scene. What core does **not** do is keep two tables
  apart on screen: chat, the players list, the navigation bar, the single active scene,
  pause, world time and playlists are all world-wide. Every one of those can be made
  party-aware on the client with one small module, except world time and playlists, which
  need a policy rather than code.
- **How hard? Medium.** One new module (`pentaryn-parties`, small-to-medium), a handful of
  one-line fixes in `pentaryn-portals`, `pentaryn-prompts` and `pentaryn-ties`, and three
  changes in the MCP bridge. Roughly **7–10 agent-days** across three phases, plus two live
  sessions when the world is free. No fork of core, no replacement of the chat sidebar.
- **Best route: Option B** (§4) — existing modules for nothing essential, our own small module
  for the party model, the switcher, chat isolation, login landing and split/join.
- **Existing modules worth anything:** none is load-bearing. The one module that tried exactly
  this (*Multiple Parties*) died in 2020 as a stub. *Monk's Scene Navigation*, *Hide UI* and
  *Custom Chat Tabs* each cover one cosmetic piece we can do in a hook; *Perceived Reality*
  is interesting for two sub-parties on one map but is untested on dnd5e 6.
- **The three biggest catches:** (1) **secrecy is display-only** — the server sends every
  chat message, actor and scene to every client, so "unaware" means "nothing on screen", which
  is Joe's accepted rule; (2) **one world clock** — party A's long rest or combat rounds age
  party B's spell and effect durations, so the plan freezes the sleeping party by re-stamping
  its timed effects on wake; (3) **the GM has one canvas and one attention span** — the
  switcher makes swapping one click, but there is no picture-in-picture, and anything of ours
  that pulls "everyone" (portals' party teleport, the bridge's `switch-scene`) must become
  party-aware first or it drags the other table along.

Licence: one hosted instance is one licence, and two parties in one world is one instance
(<https://foundryvtt.com/article/license/>: "only one hosted instance of the software may be
accessible to users other than the license owner at any given time"). The alternative — two
worlds at once — needs a second licence and a second server/tunnel; this plan does not take
that route.

## 1. Is it possible in one world?

### 1.1 What core already does per party

| Per-user / per-scene today | Where |
|---|---|
| Each user views their own scene; since v14 their own level too (`User#viewedScene`, `User#viewedLevel`, synced through activity) | `client/documents/user.mjs:51,57`; `client/documents/collections/users.mjs:140-150`; KB: "For each individual user a different Scene may be treated as the viewed scene" <https://foundryvtt.com/article/scenes/> |
| The GM can pull **a chosen list** of users to a scene: `Scene#pullUsers(users, viewOptions)` emits `pullToScene` to those users only; the Players list has a per-user "Pull to Scene" | `client/documents/scene.mjs:224-231`; `client/documents/collections/scenes.mjs:101-114`; `client/applications/ui/players.mjs:274-280` |
| A scene shows in a user's nav bar only if it is active, is their viewed scene, or has navigation on **and** the user has LIMITED permission on it (`Scene#visible`) — scenes carry per-user ownership | `client/applications/ui/scene-navigation.mjs:82-92`; `client/documents/abstract/client-document.mjs:240-243`; `common/documents/scene.mjs:165` |
| Combat is scene-scoped: `game.combats.combats` and `.active` are filtered to the viewed scene; the tracker shows that scene's encounters | `client/documents/collections/combat-encounters.mjs:44-57` |
| Fog of war is per user, per scene, per level | `common/documents/fog-exploration.mjs:43-45` |
| Cursors, rulers, pings, targets and planned movement are only applied for users on the same scene (and level) | `client/documents/collections/users.mjs:160-197` |
| Weather, darkness, environment, ambient sounds belong to the scene | `client/documents/scene.mjs:1391-1440` |
| v14 Scene Levels: floors inside one scene, each token has a `level`, each user views a level, "Pull Everyone" exists per level since 14.362 | `common/documents/level.mjs`; `common/documents/token.mjs:180`; <https://foundryvtt.com/releases/14.362> |
| The core Teleport Token region behaviour already pulls **only** the users viewing the origin scene/level who can observe the moved token — a ready-made "pull this sub-group" primitive | `client/data/region-behaviors/teleport-token.mjs:145-158,193-236` |
| v14 chat modes are extensible: `CONFIG.ChatMessage.modes` entries may carry their own `handler(chatData)`, which `ChatMessage.applyMode` calls instead of the built-in whisper logic | `client/config.mjs:241-270`; `client/documents/chat-message.mjs:146-180` |

### 1.2 What is global, and what it means

| Global | Consequence | Verdict |
|---|---|---|
| **One active scene.** `Scene#_onActivate` calls `view()` on **every** client; a player who logs in or reloads lands on `game.scenes.active` because `Scenes#current` falls back to it before the canvas is ready. Core issue #12306 ("remember viewed scene") is still open. | Activating a party's scene yanks the other party onto it. Every reconnect lands on the active scene. | **Never Activate a party scene.** Keep a neutral **lobby** scene active; move parties by per-user pulls; redirect each user to their party's scene on `ready`. Expect a brief lobby flash on reload. `client/documents/scene.mjs:244-251,1527-1530`; `client/game.mjs:1063-1069`; `client/documents/collections/scenes.mjs:40-43`; <https://github.com/foundryvtt/foundryvtt/issues/12306> |
| **Pause** is one server flag broadcast to all; the *blocking* of players is client-side (`game.paused && !game.user.isGM` in placeables-layer, token, door-control, templates). | Space bar freezes both tables. | A per-party **Hold** that wraps the `Game#paused` getter on each client is plausible (`client/game.mjs:1705`) — **unverified**, spike item 5. Core pause stays "everyone stop". |
| **World time** is one setting (`core.time`). Combat turn/round advances it (dnd5e `roundTime = 6`), dnd5e group rest advances it when the calendar is on, the Calendar HUD advances it, and every change refreshes the ActiveEffect duration registry. | Party A's 8-hour rest expires party B's *Mage Armor*; A's combat rounds tick B's 10-minute Starry Form (our `pentaryn-transform` reads `game.time.worldTime`: `wildshape.mjs:156,172-178`, `starry-adapter.mjs:88,136`). | **The hardest problem.** No core fix. Policy in §5.8: freeze the sleeping party by re-stamping its timed effects on wake; shared time is *correct* while both tables are live at once. `client/helpers/time.mjs:149,163,212-217`; `client/documents/combat.mjs:236-240,292-296`; `dnd5e.mjs:96025,85169` |
| **Playlists** are world documents; `PlaylistSound#sync` starts/stops the sound on every client; a scene-linked playlist starts on *activation*. Ambient sounds are per scene. | Music for A plays for B. | Rule: ambient sounds only while two tables are live; playlists are a Phase 4 nicety (per-client mute by party flag, unverified). `client/documents/playlist-sound.mjs:141-153,218-227`; `client/documents/scene.mjs:1383-1384` |
| **Players list** shows every user to every viewer. | B sees A's players online. | One `renderPlayers` filter (§5.5). `client/applications/ui/players.mjs:55-76` |
| **Nav bar pips** show which users view each listed scene. | Harmless once the only shared scene is the lobby. | `client/applications/ui/scene-navigation.mjs:124,136-146` |
| **The GM's one canvas.** The GM views one scene at a time but receives every update from every scene. | The other party's NPC turns stall while the GM is away; nothing stops the other party exploring, since region behaviours run on the moving client. | Accept; the switcher makes the swap one click. A second GM account in another browser profile is a possible workaround (**unverified**; our election helpers in `pentaryn-creatures` and `pentaryn-ties` would need a check). |
| **Notifications** (`ui.notifications`) are per client. | No leak by themselves. | Our modules only notify the calling client. |
| **Every document goes to every client.** The server dumps all ChatMessages (whispers included), Actors and Scenes to each user with no per-user read filter. | A player at the console can read the other party's chat. | Accepted under the table rule "players are not console readers". On screen, nothing shows once §2 is in. `dist/packages/world.mjs` (`ChatMessage.dump({sort:"timestamp"})`) |
| **dnd5e primary party** is one world setting (`dnd5e.primaryParty`) read through `game.actors.party`; consumers: the roll-request dialog (falls back to *every user's character* with no group), encounter difficulty, award and transfer destinations, the Calendar HUD party button; a group rest posts a public card. | A "request a save" to "the party" asks B's players too; the calendar's party button opens A's sheet for B. | Set `primaryParty` on swap and wrap the getter per user (§5.3). `dnd5e.mjs:58078-58084,88570-88578,69879-69881,84532-84545,85164-85190` |
| **A/V** room is world-wide. | Voice via Discord channels per table, as the split-party advice says. | Not researched further (**low confidence**). |

**What "the other party is unaware" can mean.** With §2 and §5 in place, a party-B player
sees: their own scenes, their own chat, their own combat, their own players, the lobby in the
nav bar, and the GM online. They do not see A's scenes, chat, rolls, dice, players or
combat. They can still notice that the GM is busy. That is as far as one world goes.

## 2. Chat

### 2.1 Options

| Option | How | Covers | Misses |
|---|---|---|---|
| **W. Whisper-to-party mode** | Register a `party` mode in `CONFIG.ChatMessage.modes` whose handler sets `whisper = party users + GMs`; make it the default for players. | Typed chat, most cards. | Whispered **rolls** still show a placeholder card to everyone: `ChatMessage#visible` returns `true` for any roll (`client/documents/chat-message.mjs:101-107`). `#resolveMode` rejects modes not in CONFIG and rewrites `ic` to `public` for rolls (`:146-180`). Mode-only is not enough. |
| **F. Party flag + client visibility filter** *(recommended)* | `preCreateChatMessage` on the creating client stamps `flags.pentaryn-parties.party`; libWrapper wraps `ChatMessage.prototype.visible` (getter) to return `false` for another party's message on a player client; `renderChatMessageHTML` hides on the GM client by the switcher's filter. | Every message, rolls, damage cards, dnd5e request/rest cards, Item Piles cards, all twelve of our own `ChatMessage.create` sites (§5.9), bridge-created messages. | Display-only. The flag must come from the **author's party / the GM's active party**, never `speaker.scene`: `getSpeaker` falls back to `canvas.scene` (`client/documents/chat-message.mjs:323`), which is wrong whenever the GM posts while viewing the other table. |
| **T. Tabs module** | *Custom Chat Tabs* 1.1.3 (verified 14.361) has `game.modules.get("custom-chat-tabs").api.register(...)`; *Yuuko's Chat Interface Overhaul* 1.1.6 (verified 14.367) routes token-speaker messages to per-scene tabs and hides them from users without LIMITED on the scene. | GM-side views (CCT); scene privacy for token-speaker messages (Yuuko). | CCT is a view, not hiding (the "All" tab shows everything; `register` signature unconfirmed). Yuuko sends every message **without** `speaker.token` — OOC, actor-only rolls — to a shared OOC tab (`chat-helpers.js getMessageRouteId`), and it **replaces** the chat sidebar, which our card-hooking modules (`pentaryn-riders`, `-aoe`, `-combat`) would have to be re-tested against. |
| **S. Filter by scene/speaker** | *Scene Specific Messages* (v12 alpha), *Tabbed Whispers* 2.1.0 (verified v13 only; OOC tab global). | — | Not v14-verified; OOC leaks; scene is the wrong key (see F). |

**Recommendation: F, with W's mode as a convenience** (so a player's typed chat whispers to
their party and the GM by default — belt and braces: even without our filter, core hides
non-roll whispers). The GM gets a three-way filter on the chat sidebar header — **Active party
/ Other / All** — that follows the switcher. `/all <text>` (or the `public` mode) posts to
everyone. Clear Chat Log stays global; per-party export is a filtered `ChatLog#export`.

### 2.2 Leak risks and how each is closed

| Leak | Closed by |
|---|---|
| Rolls and damage cards from A visible to B | F (visibility wrap covers rolls, which core's whisper logic does not) |
| Our modules' public chat lines — ties study stub/share/tempo, transform `say()`, riders Arcane Recovery, senses light, combat death saves, aoe request/resolve (list in §5.9) | One `preCreateChatMessage` stamp on the creating client; no per-site rewrite |
| dnd5e group rest card (public, `dnd5e.mjs:85164-85190`), roll-request dialog fallback to all users (`:69879-69881`) | Stamp + `primaryParty` set on swap + per-user `party` getter wrap (§5.3) |
| Item Piles trade/loot cards | Stamped like any message (created on a player or GM client that runs our hook) |
| **Dice So Nice 3D dice** — DSN animates on every client for messages it decides to show; its "ghost dice" option animates blank dice for rolls a user may not read | **Spike item 2.** If DSN consults `ChatMessage#visible` our wrap covers it; if it only reads `whisper`, hook `diceSoNiceRollStart` and cancel for other-party messages, or require "hide ghost dice" (**unverified** which applies) |
| Whisper placeholders ("… whispered to …" cards) | Covered by the visibility wrap |
| Chat *popouts*, chat bubbles above tokens | Bubbles are per scene (only drawn for tokens on the viewed scene); popouts render through the same `visible` check — **verify in the spike** |
| Notifications from socket relays (`pentaryn-ties` relay, feedback ingest) | Already addressed to specific users; confirm none broadcast |

## 3. Existing modules (verified) and gaps

| Module | Version / compat | What it does for us | Fit |
|---|---|---|---|
| **Multiple Parties** (pkluber/gkluber) | 0.6.5, last push 2020-10-16, 0 stars | Promised party chat + per-party activation; `createChatMessage` hook body is empty | **Dead.** Proof the idea was tried and abandoned. <https://github.com/pkluber/FoundryVTT-Multiple-Parties> |
| **Monk's Scene Navigation** | 14.02, verified 14, not installed | Per-player scene permissions UI + folders in the nav | Optional. Core already has scene ownership and keys nav visibility on it; our module writes ownership itself (§5.4). Whether the stock Scenes directory exposes "Configure Ownership" on v14 is **unverified** — spike item 3. <https://foundryvtt.com/packages/monks-scene-navigation> |
| **Custom Chat Tabs** (Larkinabout) | 1.1.3, verified 14.361 | Public `api.register/unregister/getTabs/setActiveTab` for filter tabs | Optional GM nicety (Phase 4). Views only. `register()` signature unconfirmed. <https://foundryvtt.com/packages/custom-chat-tabs> |
| **Yuuko's Chat Interface Overhaul** | 1.1.6, verified 14.367 | Per-scene chat tabs, hidden from users without scene permission | Reference design only: OOC/actor-only messages shared; replaces the sidebar. <https://foundryvtt.com/packages/yuuko-chat-interface-overhaul> |
| **Hide UI** (brunocalado) | 0.1.1, verified 14, ~5 weeks old | Hide the players list (and more) per player | Optional; we do it in one hook. Too new to depend on. <https://foundryvtt.com/packages/hide-ui> |
| **Perceived Reality** (Elemor) | 1.1.0, verified 14; "built and tested with dnd5e 4.x and 5.x" | Perception groups A–F for tokens, tiles, lights, doors on **one** scene | Medium for two sub-parties on one map; dnd5e 6.0.6 **unverified**, hooks the dnd5e Token Config. Core Scene Levels covers the upper/lower case without it. <https://foundryvtt.com/packages/perceived-reality> |
| **Crunch My Party!** (coffiarts) | 14.0.2, verified 14 | Collapse a token group into one party token and back | Overland travel only; no scenes/chat/users; README says re-expansion movement "potentially unreliable". <https://foundryvtt.com/packages/crunch-my-party> |
| **Scene+** / **Last Scene View** | 0.5.8 / 1.4.00, verified 14 | Remember last scene per character (macro) / last position+level per scene | Partial login-landing; neither re-pulls on connect. Ours is ten lines (§5.4). |
| **Actually Private Rolls** (FutureHax) | 1.3.1, v13–14, Patreon | A roll mode that hides the card and suppresses DSN for non-recipients | Evidence DSN suppression is doable; **unverified** behaviour. <https://foundryvtt.com/packages/fh-actually-private-rolls> |
| **Party Overview**, **Omnipresence**, **Gaming Table Player**, **Global Combat Tracker**, **Floating Combat Toolbox**, **Tabbed Whispers**, **Scene Specific Messages**, **Everybody Look** | various | Per-party glance / multi-world sync / other users' views as rectangles (v13) / cross-scene combat (0.7-era, dead) / v13-only or v12-alpha chat scoping / superseded by core "Pull Everyone" | None load-bearing. |

**Gaps nobody fills:** a GM party switcher; a party record that owns users + scenes; chat
flagged by party rather than scene; per-party pause; per-party time; login landing per party;
split and join. Prior art in the community for this exact setup is nil (Reddit/Discord were
unreachable in research; Forge/EN World/Alexandrian/Roll20 threads only confirm the problems:
one tracker, one chat, one jukebox).

## 4. Options

| | A. Existing modules only | **B. Existing bits + `pentaryn-parties`** | C. Build everything ourselves |
|---|---|---|---|
| What | Monk's Scene Navigation + Yuuko's chat + Hide UI; manual per-user pulls from the Players list; dnd5e Group actors by hand | A small module for the party model, switcher, chat flag + filter, login landing, players-list filter, hold, time re-stamp, split/join; fixes in portals/prompts/ties and the bridge; no third-party dependency required | B plus: chat tabs UI, per-party playlist muting, per-party clock offsets, a "second canvas" peek, second-GM support |
| Difficulty | **S** (½ agent-day config + a live check) | **M** (7–10 agent-days + 2 live sessions) | **L** (15+ agent-days; the second canvas is not realistic) |
| Risk | High: OOC and actor-only chat leak; rolls leak; every reload lands on the active scene; portals' party teleport and bridge `switch-scene` still pull everyone; Yuuko replaces the sidebar our card modules hook; no split/join; no switcher | Medium: display-only secrecy (accepted); DSN behaviour and the pause/getter wraps are unverified until the spike; one more module to keep conformant to the blueprint | High: scope; per-party clock offsets fight core's duration registry |
| What Joe gets | A second party that *mostly* can't see the first, with manual care on every move | One-click swap; the other table sees nothing of ours on screen; our tools act on "the active party"; split a party across floors or scenes and rejoin; a sleeping party's effects don't rot | B plus comfort features |

**Recommended: B.** A is not enough on its own and C buys little the GM would use.

## 5. Design for Option B — `pentaryn-parties`

Built to the addon blueprint (kit, tiers; `context/foundry/addon-blueprint.md`): a full-tier
module with `game.pentaryn.parties`, an `api-manifest`, settings in `settings.mjs`, pure
core in `parties-core.mjs`, Foundry access in adapters. Depends on libWrapper (installed).

### 5.1 Party model

- **A party is a dnd5e Group actor** (`type: "group"`) flagged
  `flags.pentaryn-parties.party = { users: [userIds], homeScene, scenes: [sceneIds], held, sleptAt, colour, parent }`.
  Members are the Group's own `system.members`, so dnd5e's award, encounter difficulty,
  rest, request and `placeMembers` keep working per party.
- **Users of a party** = users whose assigned `character` is a member, plus the explicit
  `users` list (for a player without a character). GMs belong to every party.
- **Tokens of a party on a scene** = reuse `pentaryn-portals`' `partySelection/recordOf`
  (`scene-adapter.mjs:210-213`) restricted to member actors, their player-owned followers
  and PC summons. Followers of a party member travel with that member only.
- **Current scene of a party** = the scene most of its *active* users view
  (`User#viewedScene`, the same synced field `pentaryn-ties` `canReach` reads,
  `ties-adapter.mjs:367-385`), else the scene holding most member tokens, else `homeScene`.
- **Active party for the GM** = `game.user.getFlag("pentaryn-parties", "active")`. A user
  flag, not a client setting, so the bridge tab and any second GM tab follow the same swap
  (an `updateUser` hook on each GM tab reacts).
- **The lobby** = the one and only active scene while parties mode is on: the splash scene
  if one exists (`context/pentaryn.md` line 64 lists the splash asset), else a blank
  "Lobby" scene with navigation off. `parties.status()` warns when the active scene is not
  the lobby.

### 5.2 Swap — what follows the GM

One control: a pill in the scene controls / a hotkey showing **Party: Ashfall ▾**. Picking a
party does, in order:

1. Sets the user flag `active`; sets `dnd5e.primaryParty` to that Group
   (`dnd5e.mjs:58078`), so award, encounter difficulty, the Calendar HUD party button and
   `PartyRequestDialog` default to this party.
2. The GM's canvas `view()`s the party's current scene **and level** (never `activate()`).
   Every GM tab, the bridge tab included, does the same via the `updateUser` hook.
3. The chat sidebar filter switches to **Active party**. The combat tracker follows the
   viewed scene by itself (core).
4. Our tools' "current party" default changes: portals `teleportParty`, prompts' XP party,
   the bridge's party-scoped tools (§5.10) all read `parties.active()`.
5. If the party being left has **Hold on swap-out** ticked, it is held (§5.7) and
   `sleptAt = game.time.worldTime` is recorded for the re-stamp on wake (§5.8).

Swapping back reverses 5 (wake: re-stamp, release hold). The pill also shows a one-line
"other party" ticker — their last chat line and whether a combat is running there — so the
GM knows when to cut back (The Alexandrian's rule: cut too often rather than too late).

### 5.3 dnd5e party per user

`libWrapper.register("pentaryn-parties", "dnd5e.documents.collections.Actors5e.prototype.party#get", …)`
(the getter is at `dnd5e.mjs:88570-88578`): on a player client return the Group whose users
include `game.user`, on the GM client return the active party, else the world setting. libWrapper supports getter targets with the `#get` suffix
(**verify**; fallback is an `Object.defineProperty` on the collection prototype). This
redirects the Calendar HUD party button, requests and transfers without touching dnd5e.

### 5.4 Scenes, nav bar, login landing

- On party create/edit: write `ownership[userId] = LIMITED` on the party's scenes for its
  users and `NONE` for other parties' users (`common/documents/scene.mjs:165`). Core then
  hides the other party's scenes from the nav bar (`scene-navigation.mjs:86-92`). The GM sees
  everything.
- **Login landing, player side:** on `ready`, if the user has a party with a current scene
  that is not the one being viewed, `scene.view()`. Whether `Scene#view` needs permission on
  the client side is **unverified** (`pullToScene` works regardless, so the GM-side fallback
  covers it): **GM side,** on `userConnected` → `scene.pullUsers([user])`. Either way the
  player sees the lobby for a second first (`client/game.mjs:1063-1069`).
- **Never Activate.** `parties.status()` and the swap refuse to call `activate()`; the scene
  navigation "Activate" entry stays core's, but a `preUpdateScene` guard warns when `active`
  is set on a party scene while parties mode is on.

### 5.5 Players list and other presence

- `renderPlayers` hook on player clients: drop users not in my party (GMs stay). One hook
  replaces *Hide UI*.
- Nav pips: only the lobby is shared, so no cross-party pips after landing.
- `pentaryn-cursors` is local; `pentaryn-pings` records pings from every scene for the
  bridge log but draws nothing cross-scene — no change.

### 5.6 Chat isolation (Option F from §2)

- `preCreateChatMessage` (creating client): `flags.pentaryn-parties.party =`
  the author's party for a player; the GM's active party for a GM; `"all"` for `/all`, the
  `public` mode or when parties mode is off. Messages created by the bridge are created on
  the GM's bridge tab → stamped with the active party.
- A `party` mode registered in `CONFIG.ChatMessage.modes` (whisper to party users + GMs) as
  the players' default — core hides non-roll whispers even if our wrap fails.
- Visibility: `libWrapper` wrap of `ChatMessage.prototype.visible#get`: on a player client
  return `false` when the flag names a party the user is not in. GM clients see all; the
  sidebar filter hides by class in `renderChatMessageHTML`.
- On **join** (§5.9) sub-party messages are re-flagged to the parent in one `updateDocuments`,
  so the rejoined party shares the history.
- Dice So Nice: spike item 2 decides between "nothing to do", a `diceSoNiceRollStart` cancel,
  or requiring the ghost-dice option off.

### 5.7 Hold (per-party pause)

Core pause stays global ("everyone stop"). **Hold** is per party: a flag on the Group;
on a held user's client, `libWrapper` wraps `Game.prototype.paused#get` to return
`held || data.paused` (`client/game.mjs:1705`) so the core movement/door/template checks
block, and `ui.pause` is rendered with a party-specific caption ("The DM is with another
table"). **Unverified** that the banner re-renders from a local getter change — spike item 5;
fallback is a plain overlay plus a `preUpdateToken` refusal for held users. Nothing is
enforced server-side (honest-player rule).

### 5.8 World time policy

- **Both tables live at once:** shared time is correct fiction — both parties exist at the
  same moment. No code; a GM warning when a group rest or Calendar advance is about to pass
  more than an hour while the other party is awake ("Party B is awake; 8 hours pass for them
  too").
- **One table asleep (held or between sessions):** on swap-out record `sleptAt`; on wake,
  compute `delta = worldTime − sleptAt` and **re-stamp** every timed thing on the sleeping
  party: ActiveEffect `duration.startTime += delta` on member actors and on unlinked tokens of
  the party's scenes, `flags.pentaryn-transform.wildshape.endsAt += delta`, Starry Form's
  effect start (`starry-adapter.mjs:88`). Remaining durations are preserved; round-based
  durations are already per combat, hence per scene. One dialog shows what was shifted.
  **Verify in the spike** (item 6) that dnd5e and core compute remaining from `startTime`.
- Between sessions this is the same thing: a party that is not playing is asleep.

### 5.9 Split and join

- **Split** (from the switcher): pick members → a sub-party Group actor
  `"<Party> — <label>"` with `parent = <Party>`, members moved with `removeMember/addMember`
  (`dnd5e.mjs:84994-85060`), users derived, scene ownership written. Optionally carry their
  tokens to a destination (region, scene or **level**) with portals' `carryTo/landingPlaces`
  (`scene-adapter.mjs:216-245`) and `pullUsers(subParty.users)`. The core Teleport Token
  behaviour's "pull only those viewing the origin" logic is the model
  (`teleport-token.mjs:193-236`). Sub-party chat is flagged to the sub-party.
- **Upper / lower floor on one map:** use v14 Scene Levels — the sub-party's tokens move to
  the other level, each user views their level, cursors/pings are per level already.
  Check the installed third-party `levels` 7.0.3 for overlap with core levels first
  (research flagged it; **unverified**).
- **Join:** pick a sub-party (or two parties) → members merged into the parent, users
  re-derived, sub-party scene ownership folded into the parent's, sub-party messages
  re-flagged to the parent, the sub-party Group deleted (or kept as a record), tokens
  optionally carried to the meeting point and users pulled. Time: if one half slept, its
  re-stamp runs first.
- The split/join dialog shows the portals-style party preview (`confirmParty`,
  `scene-adapter.mjs:247-270`) so nobody is moved silently.

### 5.10 What changes in each pentaryn module and the bridge (from the audit)

| Module | Today | Change | Size |
|---|---|---|---|
| **pentaryn-portals** | `teleportParty` takes the party from `canvas.scene` (`scene-adapter.mjs:282`), `partyRecords` = every player-owned token on it (`:210-213`), and pulls **every** active non-GM user (`:294`); the API doc says "the party on canvas.scene" (`api-manifest.mjs:50`) | `teleportParty(region, { party = parties.active() })`; `partyRecords(scene, party)` filters by membership; `pullUsers(parties.users(party))`; follow hook (`party.mjs`) likewise | S |
| **MCP bridge `switch-scene`** | `targetScene.activate()` (`foundry-vtt-mcp/packages/foundry-module/src/data-access.ts:7264`) | `mode: "view" \| "party" (default: view + pull active party) \| "activate"` (refused while parties mode is on unless `force`) | S |
| **MCP bridge create-scene** | hard-coded `autoActivate = true` (`socket-bridge.ts:345-348`) | off by default; `activate` option | S |
| **MCP bridge scene reads** | `canvas.scene` at `data-access.ts:6985,7267`, `queries.ts:83,907`; `game.scenes.current` at `fork/toggle-condition.ts:34` | one `partyScene()` helper: the active party's current scene, falling back to `canvas.scene` | S |
| **MCP bridge `request-player-rolls`** (public mode), `list-characters`, `getConnectedPlayers` | world-wide | `party` filter, default active party | S |
| **MCP bridge `pentaryn-read/write`** | — | `parties` surface: `status`, `list`, `users`, `scenes`; `swap`, `hold`, `split`, `join` | S |
| **pentaryn-prompts** | one world setting `party` for XP budgets (`settings.mjs:61`, `gather.mjs:80`, `api.mjs:39`) | read the active Group's flag `xpParty` first, the setting as fallback | S |
| **pentaryn-ties** | `tablePCs` lists every assigned PC (`preview-app.mjs:172-187`); `canReach` treats the **active** scene as reachable (`ties-adapter.mjs:378-379`) — harmless once the lobby is active; study `cascade.mjs:132-135` and `request.mjs:193` read `game.combat` | `tablePCs(party)`; use `pentaryn-combat`'s `pickCombat` for the actor's combat (`core/turn.mjs:16-30` already documents why) | S |
| **pentaryn-transform** | expiry reads `game.time.worldTime` (`wildshape.mjs:156,172-178`; `starry-adapter.mjs:88,136`) | no code change; covered by the re-stamp (§5.8) | — |
| **pentaryn-combat** | already picks the actor's own combat (`core/turn.mjs:16-30`) | none | — |
| **pentaryn-movement** | one world `ghostPolicy` (`settings.mjs:24`) | leave global; note in README | — |
| **pentaryn-feedback** | snapshot reads `game.combat` (`snapshot-adapter.mjs:107`) | cosmetic; add `party` to the snapshot | XS |
| **pentaryn-creatures**, **-ties** election | elect one GM | fine with one GM; re-check before any second-GM workaround | — |
| **pentaryn-senses, -aoe, -dropbin, -journal, -pings, -cursors, -riders, -attunement, -walls, -importer, -lookup, -names** | per scene, per actor or per player already | none | — |
| **Chat lines** (12 sites): `pentaryn-ties/study/share.mjs:130`, `tempo.mjs:142`, `apply.mjs:461`; `pentaryn-transform/wildshape-adapter.mjs:116`; `pentaryn-riders/cast-flow.mjs:213`; `pentaryn-senses/light.mjs:126,186`; `pentaryn-aoe/resolve.mjs:292,365`; `pentaryn-combat/turnflow/death.mjs:27,33`; `pentaryn-walls/actions.mjs:76` (GM whisper already) | public | no change — the `preCreateChatMessage` stamp covers all of them | — |

## 6. Risks, unknowns, and the spike

**Risks**

1. Secrecy is on-screen only (accepted; say so in the use-doc so nobody mistakes it for security).
2. Dice So Nice may animate A's dice on B's screen — the most visible leak if it happens.
3. The wraps on `ChatMessage#visible`, `Game#paused` and `Actors5e#party` are plausible but untested; libWrapper getter wrapping needs confirming.
4. World time: the re-stamp touches every timed effect on a party; a bug here silently extends or cuts durations. Keep it a one-click dialog with an undo list.
5. GM attention is the real limit; the bridge tab acts on whatever scene it views, so a Claude tool call during a swap can hit the wrong table — hence `partyScene()` everywhere in the bridge.
6. Core "Pull Everyone", "Activate" and dnd5e `placeMembers` (drops onto the GM's `canvas.scene`) remain one click from dragging the other party; guard the first two, document the third.
7. Third-party `levels` 7.0.3 alongside core Scene Levels — overlap unknown.
8. Perceived Reality on dnd5e 6 is unverified; not depended on.
9. One more module to keep conformant; the blueprint's kit keeps that cheap.

**The smallest spike** (half a day, live, when the world is free; GM + two player tabs in
separate browser profiles; a scratch world copy is enough):

1. Make a blank scene active; view S1 as user A and S2 as user B by per-user pull; reload B — confirm B lands on the lobby, then a `ready` macro `scene.view()`s S2. Measure the flash. Try the GM-side `userConnected` pull too.
2. **Chat/DSN:** as GM post a whispered roll to A: does B see a placeholder? Do 3D dice (ghost or real) roll on B's screen? Apply a macro-level `ChatMessage.prototype.visible` override on B: does the card vanish; do the dice stop?
3. Set B's ownership NONE on S1: is S1 gone from B's nav? Does the stock Scenes directory show "Configure Ownership" on 14.369?
4. Players list: confirm a `renderPlayers` filter hides A from B.
5. Wrap `Game.prototype.paused` getter on B's client via libWrapper: with the GM's pause off, can B still move when held? Does `ui.pause` show?
6. Time: give B's PC a 1-minute effect; advance 10 minutes as A; shift `duration.startTime` by the delta; confirm the remaining time is restored in the sheet and effects panel.
7. Start a playlist as GM: B hears it (expected); try a local `PlaylistSound` stop hook on B.
8. Two combats on two scenes: confirm each tab's tracker shows only its own, and that `pickCombat` picks right for a PC in B's fight while the GM views A.
9. Optional: a second GM account in another profile — does `activeGM` election in creatures/ties stay stable?

Items 2, 5 and 6 decide whether Phase 2 is as small as planned.

## 7. Recommendation and phased outline

**Go with Option B, after the spike.** Nothing is built now.

| Phase | Delivers | Est. | Live check |
|---|---|---|---|
| **0. Spike** | Answers to §6 items 1–8 in a scratch world copy | ½–1 day | yes |
| **1. The quiet second party** | Party registry on Group actors; lobby rule; scene ownership; login landing; players-list filter; chat stamp + visibility wrap + GM filter; the switcher (view + filter + `primaryParty`); portals `teleportParty` and bridge `switch-scene`/create-scene fixes | 3–4 agent-days | one session with a player tab per party |
| **2. Two live tables** | Hold; time re-stamp on wake with its dialog; `Actors5e#party` per user; bridge party-awareness (`partyScene()`, roll requests, list-characters, prompts XP); the "other party" ticker; DSN suppression if item 2 needs it | 2–3 agent-days | one session |
| **3. Split and join** | Split/join dialogs; sub-party Groups; carry + pull to a scene or level; chat re-flag on join; `levels` overlap check | 2 agent-days | one session, 2-up/2-down on a levelled scene |
| **4. Comforts** (optional) | Custom Chat Tabs integration; per-party playlist muting; second-GM support | 1–2 agent-days | — |

Model tiers as usual: Fable designs, Opus builds and adversarially reviews, Sonnet verifies.
On shipping Phase 1: write `context/foundry/parties.md` (use-doc), add this plan's row to
`context/plans/README.md`, and append the module to the index in `context/foundry/README.md`.

## Sources

- Foundry 14.369 source, cited inline (`client/`, `common/`, `dist/` under
  `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app`).
- dnd5e 6.0.6 bundle, cited inline as `dnd5e.mjs:<line>`.
- Foundry KB: <https://foundryvtt.com/article/scenes/>, <https://foundryvtt.com/article/chat/>,
  <https://foundryvtt.com/article/combat/>, <https://foundryvtt.com/article/playlists/>,
  <https://foundryvtt.com/article/license/>, <https://foundryvtt.com/article/faq/>;
  releases <https://foundryvtt.com/releases/14.359>, <https://foundryvtt.com/releases/14.362>.
- Core issues: #12306 (open), #12307 (13.338), #14235 (14.362), #13351 (fixed 13.350).
- Package pages and repos as linked in §3; *Multiple Parties* <https://github.com/pkluber/FoundryVTT-Multiple-Parties>.
- Community: The Alexandrian on splitting the party
  <https://thealexandrian.net/wordpress/47259/roleplaying-games/random-gm-tip-splitting-the-party>;
  EN World split-party thread; Roll20 two-table report
  <https://app.roll20.net/forum/permalink/11863359/>; Forge licence threads
  <https://forums.forge-vtt.com/t/running-multiple-instances/12609>.
- In-repo: `foundry/module/pentaryn-portals/scene-adapter.mjs`, `pentaryn-combat/core/turn.mjs`,
  `pentaryn-ties/ties-adapter.mjs`, `pentaryn-ties/study/{cascade,request}.mjs`,
  `pentaryn-prompts/{settings,gather,api}.mjs`, `pentaryn-transform/{wildshape,starry-adapter}.mjs`,
  `pentaryn-feedback/snapshot-adapter.mjs`; bridge
  `~/Documents/GitHub/foundry-vtt-mcp/packages/foundry-module/src/{data-access,socket-bridge,queries}.ts`,
  `fork/toggle-condition.ts`.
