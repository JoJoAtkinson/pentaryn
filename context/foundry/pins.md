---
title: Pentaryn Pins
status: active
last_modified: 2026-10-17
tags: [foundry, module, pentaryn-pins]
---

# Pentaryn Pins

**Read this when:** you want a player's view to follow their character instead of the active
scene, a player says "activating a scene jumped me", you want the GM right-click canvas menu
(Prompt note, Teleport pinned character), or a sheet says "Pinned to …". **Not this file:**
`foundry/lib/pins.mjs` is unrelated (journal Note pins); grep for `pentaryn-pins` or
`game.pentaryn.pins`, not `pins`. Code structure → the module README
(`foundry/module/pentaryn-pins/README.md`); why it is shaped this way →
[`../plans/pin-2026-10.md`](../plans/pin-2026-10.md), and why 0.2.0 moves players with core's own
pull → [`../plans/pin-2026-10-rebuild.md`](../plans/pin-2026-10-rebuild.md).

## At the table

Joe runs one character per login and moves a player's view by moving that character's token,
never by copying it. A **pin** binds a character (Actor) to a player (User). With the world switch
**Pinning** on:

- A pinned player sees **whatever scene their pinned token is on**, at the token's level. They log
  in there (pentaryn-resume does that draw: pins **recommends** it; without it a pinned player
  logs in on the active scene until their next pull), and GM scene activation of another scene does nothing
  for them. Activating the token's own scene while they look elsewhere brings them back to the
  token's floor, with the token selected.
- **Moving the token moves the player.** Whoever moves the token pulls them, as core does for
  anyone: a portal hop, a stock Teleport Token region, Teleport party, or the GM menu's Teleport
  (on the token's own scene too: the GM always pulls them to the token's scene and level, which
  redraws nothing when they are already there). A
  GM cut-and-paste to another scene is caught by a safety net about 1.5 s later. A level change on
  the same scene is followed by core, or by pins where core will not (the player keeps a pet with
  sight on the old floor). A pull that arrives while their map is still loading shows core's
  "cannot switch Scenes" warning once, then is carried out when the load ends.
- They may **click the scene nav to look at another map**; nothing sends them back until their
  token moves, its scene is activated, or the GM pulls them.
- A GM **"Pull users to scene"** moves a pinned player too: a pull is how a move reaches them.
- The character sheet shows **Pinned to {player}** in its title bar (also on a wild-shaped form's
  sheet).
- A wild-shaped or polymorphed character keeps the pin: the form token is followed.

Unpinned players and GMs keep stock behaviour. With the switch **off**, nothing in pins does
anything: no follow, no badge, no menu, no toasts.

## For the GM

- **Turn the switch on** in Configure Settings → Pentaryn Pins → Pinning. Turning it on audits the
  pins on your client: "Pinning on: all N pins have one token", or a list of problems (no token,
  several tokens, a pin on a GM, a deleted actor, two players on one actor, an unlinked token, a
  player who cannot observe their character). The audit deletes nothing. The same client then
  pulls every online pinned player to their token's scene and level (a player already there sees no redraw).
- **Pinning a player** (`pin`) while the switch is on and they are online pulls them to their token.
  Re-pinning the character they already have pulls nobody.
- **Toasts** (warn, on your client): "{character} ({player}) has no token left" (the player's view
  stays where it is; place the character again and the active GM pulls an online player to it, an
  offline one lands there at login) and "{character} ({player}) now has 2
  tokens": the view follows only the copy on the scene the player views; delete the extra one.
  Copying the token or dragging the actor onto another scene does not pull the player. A move
  (create then delete) never toasts.
- **Right-click empty canvas** (token layer) for the menu:
  - **Prompt note** — the same as the P key of pentaryn-prompts, at the point you clicked. P stays
    bound; try both. Hidden when pentaryn-prompts is off.
  - **Teleport pinned character ▸** — the logged-in players. Picking one moves that player's
    character to the clicked point on the scene you are viewing (another scene too), with its
    summons, pets and connected tokens, exactly as portal travel carries them (pentaryn-portals
    `teleportToken`); portals pulls the player along. Players with no pin or no single token are
    greyed out.
  - Right-drag still pans (from 10 px, as core); right-click on a token still opens its HUD; a
    portal badge keeps its own menu; a right-click that skips a summon preview opens nothing.
    Escape closes only the menu; a scroll or pan closes it too.
- **Turning the switch off** leaves everyone where they are; the next activation or pull moves
  them as in stock. To bring a pinned player to their token, move the token, activate its scene,
  or pull them ("Pull users to scene").
- Activating a scene still changes the **playlist** for everyone.

## What changed in 0.2.0 (2026-10-17)

Pins 0.1.0 patched `Scene#view` and ran a view queue on each pinned player's client. 0.2.0 deletes
that and lets Foundry's own pull move the player (plan
[`../plans/pin-2026-10-rebuild.md`](../plans/pin-2026-10-rebuild.md) §7). Joe accepted these
behaviour changes:

1. **"Pull users to scene"** (player list), the scene nav's "pull to level" and
   `activate({ pullUsers: true })` now move pinned players too. A pull is how a token's move
   reaches the player.
2. A pinned player **may click the scene nav** to look at another map: nothing redirects them and
   the "Your view follows" note is gone. Their next token move, an activation of their token's
   scene, or a GM pull brings them back. (`scene.navigation = false` on a scene stops browsing to it.)
3. **Login**: Foundry draws the active scene first, then pentaryn-resume draws the token's scene
   (one extra draw when they differ). A pinned player with no saved view, or with no active
   scene, still lands on the token's scene.
4. A level change on the token's scene is followed by core (its own rule) or by pins' gap-filler;
   a level the player picked is not remembered.
5. A token moved by someone else on the same level pans the player's camera only when they control
   it (core); the pan for an uncontrolled token is gone.
6. A pin set, or the switch turned on, while the player is online: the GM pulls them.
7. **Teleport party** pulls with the party's floor when it lands on one floor (the GM's own view
   too), and no longer pulls a pinned player whose character stayed on another scene. Portals
   fires `pentaryn-portals.prePull` before each pull it sends; pins (`prepull.mjs`) drops those
   players from the list, so portals itself knows nothing about pins.
8. GM toasts when a pinned character gains a second token or loses its only one.
9. A pull that reaches a pinned player while their map is still loading is no longer lost: core
   still shows its warning, then the pull is carried out when the load ends.
10. Activating the pinned character's scene while the player looks elsewhere lands them on the
    character's floor, controlling it.

## Settings that matter

| Setting | Scope | Default | What it does |
|---|---|---|---|
| Pinning (`pinning`) | world | off | The switch. Live, no reload. |

Pins themselves are set and cleared only through the API (no edit UI).

## API quick calls

```js
// over the bridge: pentaryn-write { namespace: "pins", path: "pin", ... } — or eval-js:
await game.pentaryn.pins.pin("Talo's player", { actor: "Talo" })   // { ok, user, actor, previous, audit }
await game.pentaryn.pins.pin("Mira's player", { actor: "Talo", replace: true })   // move a pin
await game.pentaryn.pins.unpin("Talo's player")
game.pentaryn.pins.pins()            // every pin with its tokens on every scene
game.pentaryn.pins.audit()           // the switch-on audit, as data (the bot's own toast is unseen)
game.pentaryn.pins.pinnedToken("Talo's player")   // { token, actor, scene, level, x, y } | null
game.pentaryn.pins.pinnedTokens()    // { [userId]: pinnedToken } for every pinned player, one token walk
await game.pentaryn.pins.teleport("Talo's player", { x: 1200, y: 800, scene: "<sceneId>" })   // … pulled, viewFollows
game.pentaryn.pins.inspect("Talo")   // who it is pinned to, the token followed, ok
game.pentaryn.pins.selftest()
```

Every write takes `dryRun: true`. A bridge caller that flips the switch calls `audit()` next.

## Running the live scenarios

`automation/smoke/pins-live.mjs` drives 19 scenarios (S01-S19) against the local Foundry with a GM page and
three throwaway players, all named `PinTest*` (it touches nothing else and refuses when a real player is
online). `node automation/smoke/pins-live.mjs --seed`, then `--run [S06 S08 ..]` (all by default), then
`--cleanup` (prefix-based, idempotent; after a crash it also puts back the active scene and the GM's resume
view, never the Pinning switch: see below). `--list` prints the table. stdout is JSON lines, ending in one
`summary` line (versions, totals, `refused`, `restored`). `--seed`, `--run` and `--cleanup` also write their lines
to `.state/pins-live.jsonl`, truncated when the run starts (after the lock), opening with a
`{ run: true, mode, runId, pid, startedAt }` header: a file with no summary line is a stopped run. Exit 0 = all ran and the restore put everything back; 1 = a scenario failed or the restore failed
(the stash scene is kept so `--cleanup` can retry); 2 = refused or fatal: bad arguments, another run holds
`.state/pins-live.lock` (`busy`), a real player online, not seeded, or stopped by the first Ctrl-C; 3 = run
`infisical login`; 130 = a second Ctrl-C. A scenario that times out is cancelled (no write after its deadline,
no late pass); the first Ctrl-C, SIGTERM or SIGHUP stops after the current step and still restores, a second
exits 130 at once.
Secrets stay in memory (session via a pipe, player passwords random). S16 skips when the build cannot transform
by script; S18 skips when another Gamemaster session is open; S19 (bot offline) is never run.
Last live result (2026-10-17 15:33, pins 0.1.0, after the review-max fixes were synced): **S01-S18 pass**, S19
skipped by design, restore ok. **0.2.0 has not been run live** (Joe, 2026-10-17: run the scenarios only if the rebuild has
to be rolled back; S07's expectations change with 0.2.0, rebuild plan §10). (An earlier note here said S12 failed; it was read from a stale `.state/pins-live.jsonl` left
by a run stopped at 13:34. Read a result only from the run's own output, never an older file, and check the
summary line's time and versions; since the polish pass the runner truncates that file at the start of each run.) Client C, the no-canvas player, logs `Cannot read properties of undefined
(reading 'controlled')` from `updateScene`/`updateToken` hooks: that is **wall-height 7.0.8**
(`scripts/patches.js:384/392` → `updateCurrentTokenElevation`, line 98, reads `canvas.tokens.controlled`), not
pins, and it fails no check.

**The Pinning switch is never reverted from a stopped run.** The run stashes the switch on PinTest North with
its own run id, and only that run puts it back. A stash left by a stopped run is from when that run started
(Joe may have changed the switch since), so `--seed`, `--run` and `--cleanup` leave the live switch as it is and
say so on stderr and in the summary (`pinningLeft { now, stashed, at, pinsActive }`, `staleStash`). With
pentaryn-pins disabled, `now` is the value stored in the world, read without the module. If a stopped run left
the switch in a scenario's state, set it yourself (Configure Settings > Pentaryn Pins). `--cleanup` exits 0 in
that case: the switch is not its job any more.

## Known gaps

- **wall-height on a no-canvas client.** wall-height 7.0.8 throws `reading 'controlled'` in its `updateScene`
  and `updateToken` hooks on a client with no canvas (`canvas.tokens` is undefined). Harmless console noise,
  not a pins error.

- **The grace window.** A cut-and-paste across scenes moves the player about 1.5 s late (the
  safety net waits for any mover's pull first). A mover's pull that reaches the player later than
  that, while the net's own draw is loading, shows core's "cannot switch Scenes" warning once and is
  then carried out.
- **A peek is never yanked**: if the player is looking at another map when their token is cut and
  pasted (or hops through a region that does not pull them, e.g. they keep a sighted pet on the
  old floor), they stay on the peek until the next move, activation or pull.

- **Playlist.** A pinned player who ignores an activation still hears the active scene's playlist.
- **Combat tracker.** A cross-scene teleport (menu or `teleport`) deletes the old token without
  `replacements`, so core does not remap combatants: the PC and its company drop off the tracker
  mid-combat. Re-add them by hand. (`teleportParty` already has this.)
- **Region transition animation.** A pinned player's portal hop plays the default scene transition,
  not the region's own.
- **macOS Ctrl-click** is a left click; use a two-finger click for the menu.
- **`pins.teleport` with the switch off** moves the token but pulls the player only if core's own
  Teleport Token rule would (they were watching the token); otherwise `viewFollows: false`,
  `warning: "VIEW_UNCHANGED"`. With it on, an offline player gets `viewFollows: false, online:
  false` and no warning: they land on the token's scene at login.
- `pin` to an actor the player cannot observe is allowed with `warning: "NOT_OWNER"`: their view
  follows a token they get no vision from (black with token vision on).
- A pinned token on a **hidden** scene still draws for its player, and the nav bar shows its name.
- Players can clear their own pin from the console; the audit shows it.
