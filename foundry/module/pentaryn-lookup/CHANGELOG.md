# Changelog — Pentaryn Rules Lookup (`pentaryn-lookup`)

## Unreleased — blueprint migration (2026-10-11)

- Rebuilt in the addon blueprint layout: pure `lookup-core.mjs`, `packs-adapter.mjs` (every
  Foundry read), the `books.mjs` feature, `api-manifest.mjs` + `api.mjs`, kit 1.0.2 in `lib/`.
- The API is kit-built and frozen; `rules.LIMITS` is a frozen copy. New: `describe()`, `version`,
  `contract`, `settings()`, `trace()`, `uninstall()`, `game.modules.get("pentaryn-lookup").api`,
  and the `pentaryn-lookup.ready` / `pentaryn.ready` hooks.
- GM-guarded queries `pentaryn-lookup.{search,page,monster,monsters,names,onList,spellList,packs}`.
- Book packs are loaded once per session, with each page's plain text; the second search is
  near-instant. `uninstall()` clears the cache.
- Failed reads are traced at debug level (`CONFIG.debug["pentaryn-lookup"] = true`).
- The node test suite runs on `node:test` (`node test/run.mjs`).

## 0.3.0 — 2026-10-10

- `monster(name, { text: true })`: each feature's rules text with dnd5e enrichers resolved,
  plus languages and speed.
- `monsters({ size, type, cr, … })`, `names(kind)`, and `page()`'s embedded roll tables.
- `onList` / `spellList` over dnd5e's spell-list registry.

## 0.1.1 — 2026-10-10

- Re-verified on dnd5e 6.0.6 and Foundry v14.369; the selftest canary checks `indexDocument`'s
  mechanism instead of counting a live index.

## 0.1.0 — 2026-08-22

- First release: `search`, `page`, `monster`, `packs`, `selftest` over the owned books.
