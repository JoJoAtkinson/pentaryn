# Changelog — Pentaryn Ping Log (`pentaryn-pings`)

## 0.1.1 — 2026-10-11 (fix/playtest-2026-10-11; also ships the wave-1 rebuild below)

- Fix PT3-2: a player's ping on a scene the GM is not viewing is now recorded (it never was: the bug predates wave 1). The
  `userActivity` listener read `data.ping.x/y` and `data.sceneId`; core v14 sends
  `{cursor: {x, y}, ping: {scene, pull, style, zoom}}`, so the socket path recorded nothing.
  It now records `data.cursor` on `data.ping.scene` (falling back to the viewed scene). A ping
  on the viewed scene is still one record: core draws it through the wrapped `handlePing`
  first and the dedupe drops the socket copy.
- [declared] The test suite's socket pins use core's payload shape; the pre-fix shape
  `{sceneId, ping: {x, y}}` is now ignored.

## Unreleased — 2026-10-11 (addon blueprint, wave 1)

- Rebuilt on the blueprint (tier small, kit `settings, api, patch, election`): pure core
  `pings-core.mjs`, `settings.mjs`, `api-manifest.mjs`, the `capture.mjs` feature; the
  `handlePing` wrap goes through the kit's `wrapMethod`. Capture, dedupe, cap, flush timing,
  readers and console texts unchanged (characterisation suite).
- [declared] The API is kit-built: frozen, with `version`, `contract`, `describe()`, `settings()`,
  `trace()`, `uninstall()`; `game.modules.get("pentaryn-pings").api` is the same object;
  `pentaryn-pings.ready` and `pentaryn.ready` fire on GM clients.
- [declared] `uninstall()` unwraps `handlePing` and stops listening; a re-import after ready re-wires.
- [declared] Decorated records gain `ageMs` (numeric age) after `age`.
- [declared] Settings localised (guide step 10, J13): `lang/en.json` and the module.json
  `languages` entry; the `max` row's label is `PENTARYN_PINGS.Setting.max.Name`/`.Hint` (same
  English on the settings screen); the hidden `log` store row is registered without a name.

## 0.1.0

- Records canvas pings (both capture paths) into a world setting; `last`, `recent`, `all`, `clear`.
