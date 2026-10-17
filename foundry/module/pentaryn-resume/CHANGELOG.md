# Changelog — Pentaryn Resume (`pentaryn-resume`)

## 0.1.0 — 2026-10-16

- Generated from the Pentaryn addon blueprint (tier `small`, kit vendored in `lib/`).
- Each client saves its view (scene, level, pan, zoom) on its own User and restores it at login,
  as long as the active scene has not changed since the save. Covers the 03:00 nightly restart.
