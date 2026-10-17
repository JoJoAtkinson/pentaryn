---
title: Pentaryn Resume
status: active
last_modified: 2026-10-16
tags: [foundry, module, pentaryn-resume]
---

# Pentaryn Resume

**Read this when:** a player says they logged back in on the wrong map, or you are checking what
the 03:00 nightly restart puts back. **Not this file:** the module README
(`foundry/module/pentaryn-resume/README.md`) for code structure; `context/plans/resume-2026-10.md`
for how it was built; the nightly itself → [`ops.md`](ops.md).

## At the table

Stock Foundry draws the **active** scene for everyone at every login, because what each client was
viewing lives only in server memory and is lost on logout or restart. With this module:

1. While a player looks around (changes map, changes level, pans or zooms), their view is saved on
   their own User (`flags.pentaryn-resume.view`). The save happens 3 s after they stop moving.
2. At login, after Foundry has drawn the active scene, the client switches to the saved map and
   level and pans to the saved spot and zoom.
3. **Unless the GM has moved the table on.** Each save also records the active scene at that time.
   If the active scene is different at login, the player stays on the new active scene, as in stock
   Foundry. That view is then saved.

## After the 03:00 nightly

The nightly stops Foundry, which disconnects everyone, then backs up, restarts and relaunches the
same world. Nothing on the scene changes, so the active scene is unchanged. Each player therefore
logs back in on the map and view they had when they were disconnected. Tokens, fog and the active
scene are saved by Foundry itself.

## For the GM

- Your own client resumes too, and so does the headless GM "Claude". That is harmless.
- To bring everyone to one map, **activate** it. That moves all players to it, and players who are
  offline follow it at their next login. To pull players to a map without activating it, use
  "Pull users to scene"; this is saved as their view.

## Settings that matter

None.

## API quick calls

```js
game.pentaryn.resume.describe()
game.users.getName("P").getFlag("pentaryn-resume", "view")   // what that player will resume to
game.users.getName("P").unsetFlag("pentaryn-resume", "view") // forget it: next login lands on the active scene
```

## Known gaps

- A pan made in the 3 s before closing the tab may not be saved.
- Clients with the canvas disabled ("no canvas") neither save nor restore.
- Sheets, sidebars and open windows are not restored, only the map view.
