# Changelog — Pentaryn Senses (`pentaryn-senses`)

## Unreleased — blueprint migration (wave 3, 2026-10-11)

`module.json` stays 0.4.1 until the Wave 7 restart batch adds the blueprint keys
(`tier`, `namespace`, `flagScope: "pentaryn-senses"`, `cssPrefix: "ps-"`), `minimum: "14"` and
`recommends: enhancedcombathud`.

- **[declared] A chain on a hidden anchor is GM-only** (W3-SE4, Joe 2026-10-12): `paint()` now
  hides a chain from non-GM viewers when either end is hidden, not just the chained token, so a
  player's screen never shows the hidden anchor's square. Pin flipped in `chain.test.mjs`.

- **[declared] `syncAll` batches its writes** (W3-SE3, 2026-10-12, performance): every prototype in
  one `Actor.updateDocuments`, then every token in one `updateEmbeddedDocuments` per scene (was one
  `actor.update` and one token batch per actor per scene). The same documents get the same values
  (test/carried-batch.test.mjs, 60 seeded worlds against the legacy plan); the ready goldens are
  unchanged. A failing prototype write now stops the whole sync before any token write (console:
  the `ready sweep` warning names that error).
- **[declared] `inspect` reaches the MCP bridge** (W3L, 2026-10-12): the manifest's `ref` gains
  `type: "Token|Actor|uuid|id|exact name"`, so `pentaryn-read {ns:"senses", path:"inspect", ref:<uuid>}`
  passes the string through (inspect resolves it itself) instead of refusing "eval-js only".
  describe() golden updated for that one key.
- **[declared] The API is kit-built** (S-1, S-2): frozen, with `describe()`/`version`/`contract`/
  `settings()`/`trace()`/`uninstall()`, also `game.modules.get("pentaryn-senses").api`;
  `game.pentaryn.senses.chain` is the same object as `game.pentaryn.chain`. `chain.uninstall` and
  `light.uninstall` are gone (reserved names); `game.pentaryn.senses.uninstall()` removes every hook.
- **[declared] The chain alias is published by the entry's ready, after senses** (S-3); chain no
  longer has its own ready listener.
- **[declared] Hot re-import goes through the entry** (S-4, dev only): no per-file sentinels; a
  re-import of `senses.mjs` into a ready world runs init and ready at once.
- **[declared] A frozen `game.pentaryn` now throws in ready** (J10, -34): nothing freezes it since
  the importer's keystone, so the rebuild guards are gone.
- **[declared] `inspect(ref)` and `light.status(item)`** (S-12, -25): read-only light state.
- **[declared] `light.reconcile()` resolves to a summary; `light.recent()`** (S-6, -14).
- **[declared] Break chain deletes the flag with `_del`** (S-5, -10).
- **[declared] A failed debounced carried-light sync warns with the module and actor** (S-7, -15).
- **[declared] `chain.link`/`break` accept Token uuids on any scene; `links(sceneId)`** (S-8, -26).
- **[declared] A torch created inside a compendium no longer gets the Light activity** (S-11, -38).
- **[declared] No prototype write on an unlinked token's synthetic actor** (S-13).
- **[declared] The broken glow's bright radius follows the wave back up** (S-14): it only ever shrank
  between token refreshes.
- **[declared] The broken glow's CONFIG label is an i18n key** (console only; the sheets show the
  same English).
- Faster: one scene walk for `syncAll` (-11); deletion hooks walk the spell lights once per burst
  (-13); `refreshToken` reads a cached pair list (-19); chain sprites are updated in place (-20);
  the glow keeps one epoch per light, LRU 64 (-22).
- Structure: entry + `carried`/`light`/`chain`/`glow`/`migrate` features, `light-ui.mjs`,
  `light-adapter.mjs`, `argon.mjs`; pure code under `core/` behind `senses-core.mjs`;
  `settings.mjs`; nested `lang/en.json` (`PENTARYN_SENSES.{Light,Chain,Glow}`); the Light design
  moved to `context/plans/senses-light-cantrip.md`.

## 0.4.1 — 2026-10-11

Usability re-run: the hood posts a chat line; an outshone flame is drawn dimmer and says why; Pick
a target closes Argon's open panels first; a torch created after `setupLight()` gets its Light
activity at once.

## 0.4.0 — dnd5e 6

Token vision is dnd5e's `senseVisionSync`; the one-shot darkvision sight reset replaces our sync.

## 0.3.0 — 2026-10-09

The Light cantrip (On me / Pick a target / End light) and lit torches, lamps, lanterns and candles.
