# Changelog — pentaryn-journal

## Unreleased (Wave 7 restart batch, wave 5, 2026-10-12)

- `module.json`: `flags.pentaryn` blueprint keys (`flagScope` `journal` → `pentaryn-journal`,
  manifest-only), `relationships.systems` dnd5e, `recommends` item-piles, `verified: "14.369"`,
  `styles/journal.css` (moved).
- **[declared]** `folderName` has label keys (`PENTARYN_JOURNAL.settings.folderName.{name,hint}`,
  W2-J1); it stays hidden (`config: false`). The relay stays hand-wired (W2-J2: the kit does not
  forward the sender yet).
- **[declared] bar-stuck:** a throw while the bar redraws itself to "Adding…" no longer leaves the
  bar stuck there: the redraw is inside the click's try, so the player gets the "failed" warning and
  the button comes back. A throwing bar click (including "open") is logged as a warning, not an
  unhandled rejection.
- **[declared] double-save:** two quick saves (two clicks in different windows, or overlapping
  `add()` calls) no longer make two copies: saves on one client run one at a time, so the second sees
  the first's page and answers it instead of creating another.
- **[declared] pinned-cache:** re-pointing a scene's Note through the scene itself
  (`scene.update({notes})`) now refreshes which journals open as one page; before, only the Note
  hooks and Scene create/delete forgot the pinned-journal cache, though the docs said a Scene update
  did too. Scene updates that don't change `notes` keep the cache.
- **[declared] journal-async-1:** with two GM tabs open (the MCP bridge and a browser), `ready`'s
  `ensureAll` and the `createUser` hook no longer make the folder and each new player's journal twice:
  they take the relay's per-tab claim, so one tab creates and the other waits for its journal.
- **[declared] journal-EC-4:** the per-tab claim is stamped and judged in server time
  (`game.time.serverTime`), not each machine's `Date.now()`, so a GM tab on a machine whose clock is a
  minute or more off no longer reads the other tab's fresh claim as stale and makes a second journal.
- **[declared] journal-rob-2:** after the GM's client answers a player's first save, the player waits up
  to 3 s (was 1 s) for the new journal, found by its flag or by the id in the GM's answer. If it still
  has not arrived, the player gets the "Couldn't add this to your journal — tell the GM." warning and a
  console warning, instead of the save silently doing nothing.
- **[declared] journal-rob-3:** `personal(user?)`, `shouldShowBar(entry, user?)` and `ensure(user)` resolve
  their user as a user ref (a User, an id or an exact name, never a substring), the way `inspect` and
  `statusFor`'s `as` do, so a string from the MCP bridge names the right player instead of answering
  `null` / `false` / "no such user". A string matching nobody throws (`ensure`: rejects) `NOT_FOUND`;
  two matches, `AMBIGUOUS`. `null` now means the calling user, as leaving it out does. The params are
  `kind: "user", resolve: "self"` with `throws` in `describe()`.
- **[declared] journal-rob-4:** turning `singlePageReadables` on or off re-applies the one-page look
  to each open journal on its own: a window that throws is warned (`single-page skipped`) and skipped,
  the rest are still updated, and the error no longer escapes into the setting change.
- **[declared] journal-rob-5:** a create vetoed by another module (a `preCreate` hook returning false) no
  longer surfaces as a bare TypeError. `ensureAll` leaves stray journals at the root when the folder
  could not be made, and the player relay rejects `NOT_CREATED: the journal could not be created`, so
  the player's query fails with a named reason (they still get the "tell the GM" warning).
- **[declared] journal-rob-6:** if the journal window fails to open after a save, the copy is no longer
  reported as failed: the error is a console warning (`open after save failed`), the player still gets
  the added/updated toast, and `add()` answers the saved page instead of rejecting.

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
