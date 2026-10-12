# Changelog — pentaryn-journal

## Unreleased (Wave 7 restart batch, wave 5, 2026-10-12)

- `module.json`: `flags.pentaryn` blueprint keys (`flagScope` `journal` → `pentaryn-journal`,
  manifest-only), `relationships.systems` dnd5e, `recommends` item-piles, `verified: "14.369"`,
  `styles/journal.css` (moved).
- **[declared]** `folderName` has label keys (`PENTARYN_JOURNAL.settings.folderName.{name,hint}`,
  W2-J1); it stays hidden (`config: false`). The relay stays hand-wired (W2-J2: the kit does not
  forward the sender yet).

## Unreleased (blueprint migration, wave 2)

- Rebuilt into the blueprint layout: `journal.mjs` is wiring only; `personal.mjs` and `bar.mjs` are the
  two features, `sources-adapter.mjs` the Foundry/Item Piles adapter, `settings.mjs` the settings table,
  `api-manifest.mjs`/`api.mjs` the API. Behaviour unchanged except as listed below.
- The visibility rules (who gets the bar, the single-page decision, the provenance place) moved into
  `journal-core.mjs` and are proven equal to the old expressions over every input (items-journal-34).
- **[declared] D-J1:** the API is published at `ready` (not a tick later), frozen, on `module.api` too,
  with `describe()`, `settings()`, `trace()`, `selftest()` and `uninstall()`.
- **[declared] D-J3:** a world item update refreshes only item bars; `sanitize` is remembered per page
  (items-journal-33). Which journals a scene pin opens is cached and forgotten on Note/Scene changes
  (items-journal-38).
- **[declared] D-J4:** the player relay runs through the kit's `relayed`; a client that is not the
  active GM answers `NOT_GM: this client is not the active GM`.
- **[declared] D-J5:** with two GM tabs open (the MCP bridge and a browser), one player's relayed ensure
  makes one journal, not two: the tabs claim it first (items-journal-40).
- New reads for an LLM caller: `inspect(userRef)`, `entriesOf(userRef)`, `statusFor(doc, {as})`,
  `lastReason()` (items-journal-35).
- **[declared] D-J6:** `inspect` also takes an Actor or Token — the player whose assigned character it is,
  `null` when it is nobody's — so the kit's root `game.pentaryn.inspect(actor)` no longer carries
  `journal: {error: "BAD_ARGS: expected User, got Actor"}`.
- An add that writes nothing leaves one `add skipped: <reason>` console line; the activateNote catch
  logs at debug; the bar escapes its strings with `core.escapeHTML` (items-journal-36, -32).

## 2026-10-07 — single-page eyes and closing the source

- **Adding closes the window it came from.** After a successful add or update, the readable (or item
  preview) closes and the player's journal is left open on the new entry.
- **One-page eye readables open as a single page.** If a journal is pinned by a scene Note and the
  player can see exactly one of its pages, players don't get the page list or the page arrows
  (`.pj-single` hides `.journal-sidebar`). Personal journals and the GM's view are never changed.
  World setting `singlePageReadables` (default on) is the feature flag.

## 0.1.0

- First version: the Add to my journal bar, personal journals made by the GM client, the v14 user
  query relay, `sanitize()` for GM secrets, embeds and relative links.
