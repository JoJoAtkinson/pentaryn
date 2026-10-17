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
[`../plans/pin-2026-10.md`](../plans/pin-2026-10.md).

## At the table

Joe runs one character per login and moves a player's view by moving that character's token,
never by copying it. A **pin** binds a character (Actor) to a player (User). With the world switch
**Pinning** on:

- A pinned player sees **whatever scene their pinned token is on**, at the token's level. Logging
  in, GM scene activation, "Pull users to scene", scene-nav clicks and pentaryn-resume do not move
  them anywhere else, and a pull to another level of the token's scene is put back to the token's
  level. Only a level of that scene the player picks themselves is kept. Their own nav click on
  another scene shows "Your view follows {character}" (at most once every 10 s).
- **Moving the token moves the player**: a portal hop, a stock Teleport Token region, a GM
  cut-and-paste to another scene (keepId), or the GM menu's Teleport. One scene draw, no "cannot
  switch Scenes" warning.
- A token moved by someone else that ends off-screen pulls the player's camera to it.
- The character sheet shows **Pinned to {player}** in its title bar (also on a wild-shaped form's
  sheet).
- A wild-shaped or polymorphed character keeps the pin: the form token is followed.

Unpinned players and GMs keep stock behaviour. With the switch **off**, nothing in pins does
anything: no follow, no badge, no menu.

## For the GM

- **Turn the switch on** in Configure Settings → Pentaryn Pins → Pinning. Turning it on audits the
  pins on your client: "Pinning on: all N pins have one token", or a list of problems (no token,
  several tokens, a pin on a GM, a deleted actor, two players on one actor, an unlinked token, a
  player who cannot observe their character). The audit deletes nothing. A pin with two tokens (not
  mid-move) is not followed: copying the token or dragging the actor onto another scene does not
  pull the player. They stay with the copy on the scene they view, and get stock behaviour on a
  scene with neither. Delete the extra token and they are sent to the one that is left.
- **Right-click empty canvas** (token layer) for the menu:
  - **Prompt note** — the same as the P key of pentaryn-prompts, at the point you clicked. P stays
    bound; try both. Hidden when pentaryn-prompts is off.
  - **Teleport pinned character ▸** — the logged-in players. Picking one moves that player's
    character to the clicked point on the scene you are viewing (another scene too), with its
    summons, pets and connected tokens, exactly as portal travel carries them (pentaryn-portals
    `teleportToken`). Their view follows. Players with no pin or no single token are greyed out.
  - Right-drag still pans (from 10 px, as core); right-click on a token still opens its HUD; a
    portal badge keeps its own menu; a right-click that skips a summon preview opens nothing.
    Escape closes only the menu; a scroll or pan closes it too.
- **Turning the switch off** leaves everyone where they are; the next activation or pull moves
  them as in stock. There is no "bring everyone back" button (out of scope).
- Activating a scene still changes the **playlist** for everyone.

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
await game.pentaryn.pins.teleport("Talo's player", { x: 1200, y: 800, scene: "<sceneId>" })
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
Last live result (2026-10-17 15:33, after the review-max fixes were synced): **S01-S18 pass**, S19 skipped by
design, restore ok. (An earlier note here said S12 failed; it was read from a stale `.state/pins-live.jsonl` left
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

- **Synced build only, minor.** The build synced on 2026-10-17 draws some follows (same-scene level follow,
  transform reconcile, pin change, switch-on, settle tick) without `controlledTokens`, so core may select the
  user's character or another owned token, and counts core's view of the initial level after the viewed level
  is deleted as the player's choice. The working tree fixes both (polish pass P1 and L4); they go live with the
  next `make foundry-pins-sync` and a reload.

- **wall-height on a no-canvas client.** wall-height 7.0.8 throws `reading 'controlled'` in its `updateScene`
  and `updateToken` hooks on a client with no canvas (`canvas.tokens` is undefined). Harmless console noise,
  not a pins error.

- **A token on a level its scene no longer has** (an orphan level id, e.g. left by a pre-0.6.0 portals
  carry) is followed by scene only: the player sees the scene at core's initial level and is not
  redrawn again. Move the token to a real level to fix it (review B1).

- **Playlist.** A pinned player who ignores an activation still hears the active scene's playlist.
- **Combat tracker.** A cross-scene teleport (menu or `teleport`) deletes the old token without
  `replacements`, so core does not remap combatants: the PC and its company drop off the tracker
  mid-combat. Re-add them by hand. (`teleportParty` already has this.)
- **Region transition animation.** A pinned player's portal hop plays the default scene transition,
  not the region's own.
- **macOS Ctrl-click** is a left click; use a two-finger click for the menu.
- **`pins.teleport` with the switch off** moves the token but not the player's view
  (`viewFollows: false`, `warning: "VIEW_UNCHANGED"`). With it on, an offline player gets
  `viewFollows: false, online: false` and no warning: they land on the token's scene at login.
- `pin` to an actor the player cannot observe is allowed with `warning: "NOT_OWNER"`: their view
  follows a token they get no vision from (black with token vision on).
- A module or macro that calls `canvas.draw(scene)` directly bypasses the redirect: one visible
  bounce, then the player is put back on the token's scene.
- A pinned token on a **hidden** scene still draws for its player, and the nav bar shows its name.
- Players can clear their own pin from the console; the audit shows it.
