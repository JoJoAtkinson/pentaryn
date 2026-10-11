# Changelog — Pentaryn Token Name Sync (`pentaryn-names`)

## 0.1.0 — 2026-10-11 (migrated to the addon blueprint)

Structure (no behaviour change): pure core `names-core.mjs`, the `rename.mjs` feature, the entry
`names.mjs` wired through the vendored kit (1.0.1, small tier plus `api`), nested `lang/en.json`,
`node:test` suites with goldens.

Declared changes:

- A failed relabel after a rename is logged as `pentaryn-names | relabel after rename failed`
  instead of an unhandled promise rejection (N-D1, transform-creatures-33).
- The API is built by the kit from `api-manifest.mjs`: frozen, with `version`, `contract`,
  `describe()`, `settings()`, `trace()`, `uninstall()`; also published as
  `game.modules.get("pentaryn-names").api`; `pentaryn-names.ready` and `pentaryn.ready` fire (N-D2).
- `sync` accepts an actor id, UUID or whole name as well as an Actor; an ambiguous name returns
  `fail("AMBIGUOUS")` (N-D3, transform-creatures-38).

## 0.1.0 — before the blueprint

- Renaming an actor renames its prototype and placed token labels where the label was the old
  name or its part before the first comma; nicknames are left alone.
