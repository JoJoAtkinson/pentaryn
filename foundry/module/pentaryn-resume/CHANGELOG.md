# Changelog — Pentaryn Resume (`pentaryn-resume`)

## 0.2.0 — 2026-10-17

- Resume owns "which scene at login" for a pentaryn-pins pinned player (pins 0.2.0 removed its
  `Scene#view` patch and login path; plan `context/plans/pin-2026-10-rebuild.md` §3).
  `resumeTarget` takes `pinned` (`{ scene, level, token }` from `pins.pinnedToken(game.user)`) in
  place of `pinnedScene`: the token's scene and level, whatever was saved and whatever the active
  scene did; the saved pan/zoom only when the saved view was of that scene; no saved view → still
  the token's scene; the token's scene gone → no restore. The view controls the token
  (`controlledTokens`) only when the user owns it (`TokenDocument#testUserPermission`, as pins'
  `followOptions`; code review CR10): an unowned id would replace core's own fallback and leave the
  view unpanned. Unpinned: the rules are unchanged, byte for byte.
- A pinned player with no active scene (a blank draw, `canvas.ready` false) is resumed too: the
  pinned branch gates on `canvas.initialized`.
- Behaviour change (declared): Foundry draws the active scene first, then resume draws the token's,
  so a pinned player whose token is elsewhere sees one extra draw at login.
- `resumed` keeps its `{ scene, level, position }` shape. `module.json` changed: restart Foundry.

## 0.1.1 — 2026-10-17

- Coexists with pentaryn-pins (pins plan D7): with pinning on, the pin wins at login.
  `resumeTarget` takes `pinnedScene` (a scene id string from `pins.pinnedToken(game.user).scene`):
  a saved view of another scene → no restore (no pan, no `resumed`); a saved view of the pinned
  scene → pan and zoom only (`level: null`, the token's level), even when the active scene changed.
  Pins absent, pinning off or unpinned: today's rules, byte for byte. A `scene` that is not a string
  is logged and read as no pin. `describe().flags.reads` declares `api:pentaryn-pins.pinnedToken`.
  A GM never takes the pinned branch (pins never redirects a GM's view), even with a leftover pin
  flag from before a promotion. A `pinnedToken` that throws is logged and read as no pin, and
  `resumed` still fires. Restart (module.json).

## 0.1.0 — 2026-10-16

- Generated from the Pentaryn addon blueprint (tier `small`, kit vendored in `lib/`).
- Each client saves its view (scene, level, pan, zoom) on its own User and restores it at login,
  as long as the active scene has not changed since the save. Covers the 03:00 nightly restart.
