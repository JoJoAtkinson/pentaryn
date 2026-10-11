# Changelog — Pentaryn Ping Log (`pentaryn-pings`)

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

## 0.1.0

- Records canvas pings (both capture paths) into a world setting; `last`, `recent`, `all`, `clear`.
