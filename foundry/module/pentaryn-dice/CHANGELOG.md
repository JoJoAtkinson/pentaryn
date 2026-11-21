# Changelog — Pentaryn Dice (`pentaryn-dice`)

## Unreleased

- [declared] New module (feedback `Lzzlyq`, triage M1). In the Dice So Nice sidebar tab: a count box and a "+ ×" button per die row (8 in the D6 box → 8d6 in one click; a D100 spawns as its linked pair), a select-all-of-this-type button per row, Select all mine, Clear selection, and the Ctrl+click hint shown inline instead of behind Help.
- [declared] Alt+A selects all your persistent dice (rebindable; not Ctrl+A, which is core's select-all tokens). With none of your dice out it passes the key on.
- API: `spawn`, `selectMine`, `clearSelection`, `status`, `selftest` (the six Dice So Nice internals).

## 0.1.0 — 2026-11-21

- Generated from the Pentaryn addon blueprint (tier `small`, kit `settings` + `api` vendored in `lib/`).
