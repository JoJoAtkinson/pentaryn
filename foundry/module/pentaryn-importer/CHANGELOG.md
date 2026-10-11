# Changelog — Pentaryn Importer (`pentaryn-importer`)

## Unreleased — blueprint migration (wave 1, 2026-10-11)

`module.json` stays 1.1.0 until the Wave 7 restart batch adds the blueprint keys.

- **[declared] `game.pentaryn` is merged into, never replaced or frozen** (`items-journal-1`). Every
  module's namespace survives whichever order the modules load in; `import`, `moduleId`, `contract`
  and the frozen `_internals` stay on the root.
- **[declared] A second `import()` while one is running rejects `PentarynAbort`** (`items-journal-4`):
  "An import is already running; await it or reload." Sequential calls are unchanged; a failed run
  releases the guard.
- **[declared] Console lines read `pentaryn-importer | …`** (kit logger) instead of
  `[pentaryn-importer] …`. Toast text is unchanged.
- Kit 1.0.2 vendored (wave 2): the kit's frozen-root guard and re-alias tick are retired now that
  this module merges into `game.pentaryn` (J10); the importer's own behaviour is unchanged.
- New: `game.modules.get("pentaryn-importer").api` = `game.pentaryn.importer` with `describe()` and
  `selftest()`; the `pentaryn-importer.ready` and `pentaryn.ready` hooks fire (`items-journal-5`).
- Internals: split into `importer-core.mjs` (pure), `documents-adapter.mjs`, `api-manifest.mjs`,
  `api.mjs`; one `refuse`/`failAssertion` path for every refusal (`items-journal-2`, `-3`); one slug
  index per run instead of a world-actor scan per manifest entry (`items-journal-7`); a node suite
  gates the module (`make foundry-importer-check`).

## 1.1.0 — 2026-10-10

- Retarget to dnd5e 6.0: `module.json` `targetSystemVersion` `"6.0"`, dnd5e compatibility minimum
  6.0.0 / verified 6.0.6. No code change; generator 1.0.1 emits byte-identical actors (same
  `contentHash`), so a re-import after the upgrade changes nothing.

## 1.0.0 — 2026-08-10

- First release, dnd5e 5.3.
