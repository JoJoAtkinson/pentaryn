# Pentaryn Player Journal

**Read this when:** a player wants to keep what an eye readable says, or a personal journal is missing / duplicated.

Every eye readable gets a gold footer bar with one button, **Add to my journal**. That covers a
JournalEntry opened from a scene Note pin, its image popout, and an item opened from an eye pile.
Clicking the button copies what the player was shown into their own journal. That journal then
opens in single-page view with the sidebar expanded, so the player sees all their entries with the
new one selected, glowing gold and marked **New**. A toast confirms the save.

- **Bar states:** *Add to my journal* → *In your journal · Open* → *Update my copy* + *Open* when the original has changed since it was saved. Updating replaces that copy's text, including anything the player wrote on that page.
- **Who sees it:**
  - Players see it on any journal they can **observe** but do not own.
  - Players also see it on any item in an eye pile they can observe.
  - Personal journals and compendium journals never get it.
  - The GM sees it only with *Settings → Pentaryn Player Journal → Show the Add button to the GM*, which exists for testing.
- **Where copies go:** one journal per user, `Player Journals/<character or user name>'s Journal`, owned by that user, `default: NONE`.
  - It is found by `flags.pentaryn-journal = {kind: "personal", userId}`, never by name, so renaming it is fine.
  - Each saved entry is a page with `flags.pentaryn-journal.source` (`key` = source page or item uuid, `hash`, `place`, `savedAt`).
- **The GM can read every player's journal.** Tell the players.
- **Privacy, which is the point of `journal-core.mjs`:**
  - The copy is made from the raw page HTML, and that HTML holds GM secrets.
  - Before anything is written, `sanitize()` drops unrevealed `<section class="secret">` blocks, unwraps revealed ones, removes scripts and reveal buttons, turns `@Embed[…]` into `@UUID[…]` links and makes relative `@UUID[.x]` absolute. The embed rewrite matters because an embed renders with the owner's `secrets: true` and would show the embedded page's secrets.
  - Items always use the unidentified description while the item is unidentified.
  - Provenance names only things the player already sees: the scene's **navName**, else the readable's folder name, the pin's label, or the pile's name. It never uses `scene.name`.
- **Creating the journal:**
  - Players cannot create journals (TRUSTED+) or folders (ASSISTANT+). The active GM's client creates a journal for every player on `ready` and on `createUser`.
  - If a player still has none, their client asks the active GM through the v14 user query `pentaryn-journal.ensure`. The server identifies the sender, the payload is ignored, and the query can only create the sender's own journal.
  - With no GM online and no journal yet, the player gets a warning and nothing happens.
  - Do **not** grant players `JOURNAL_CREATE` for this; it isn't needed.
- **Items from piles:** Item Piles shows a non-owner a temporary, unsaved copy of the item, so the source is found by id among the pile actors. If the item is later taken, the player's copy stays and its "the original" link goes stale.
- **Console (`game.pentaryn.journal`):**
  - For anyone:
    - `personal(user?)` returns the user's journal.
    - `add(entry | page | item)` does the same as the button.
    - `status(doc)` returns `none` / `partial` / `saved` / `changed`.
    - `open(pageId?)` opens the user's journal.
    - `shouldShowBar(entry, user?)` says whether that user gets the bar.
    - `core` is the pure module.
  - For the GM only:
    - `ensure(user)` creates that user's journal.
    - `ensureAll()` creates every player's journal and moves strays into the folder.
    - `report()` lists users, journal ids, page counts, duplicates and journals at the root.
- **Duplicates:** the oldest journal wins, and `report()` lists the rest. Delete the extras by hand after moving any pages you want to keep.
- **Tests:** `node test/run.mjs`. The fixtures are synthetic on purpose, because `test/` is published with the module and every client can fetch it.

Install: `make foundry-journal-sync`. The first install needs a Foundry restart (module.json is read at startup), then enable the module and reload.

## Single-page eyes and closing the source (2026-10-07)

- **Adding closes the window it came from.** After a successful add or update, the readable (or item
  preview) closes and the player's journal is left open on the new entry.
- **One-page eye readables open as a single page.** If a journal is pinned by a scene Note and the
  player can see exactly one of its pages, players don't get the page list or the page arrows
  (`.pj-single` hides `.journal-sidebar`). Personal journals and the GM's view are never changed.
  World setting **"Eye readables open as a single page"** (`singlePageReadables`, default on) is
  the feature flag. Turn it off if multi-page eyes come back.
