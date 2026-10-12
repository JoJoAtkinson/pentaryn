# Pentaryn Player Journal

**Read this when:** a player wants to keep what an eye readable says, a personal journal is missing
or duplicated, or you are changing `pentaryn-journal`.

## What the player sees

Every eye readable gets a gold footer bar with one button, **Add to my journal**. That covers a
JournalEntry opened from a scene Note pin, its image popout, and an item opened from an eye pile.
Clicking it copies what the player was shown into their own journal. That journal then opens in
single-page view with the sidebar expanded, the new entry selected, glowing gold and marked **New**,
and a toast confirms the save. The window the copy came from closes.

- **Bar states:** *Add to my journal* → *In your journal · Open* → *Update my copy* + *Open* when the
  original has changed since it was saved. Updating replaces that copy's text, including anything the
  player wrote on that page.
- **Who sees it:** players, on any journal they can **observe** but do not own, and on any item in an
  eye pile they can observe (unless the pile forbids inspecting items). Personal journals and compendium
  journals never get it. The GM sees it only with the `gmButton` setting, which exists for testing.
- **One-page eyes open as a single page.** If a scene Note pins a journal and the player can see
  exactly one of its pages, the page list and page arrows are hidden (`.pj-single`). Personal journals
  and the GM's view are never changed.
- **Where copies go:** one journal per user, `Player Journals/<character or user name>'s Journal`,
  owned by that user, `default: NONE`. **The GM can read every player's journal.** Tell the players.
- **Privacy, which is the point of `journal-core.mjs`:** the copy is made from the raw page HTML, which
  holds GM secrets. Before anything is written, `sanitize()` drops unrevealed `<section class="secret">`
  blocks, unwraps revealed ones, removes scripts and reveal buttons, turns `@Embed[…]` into `@UUID[…]`
  links (an embed would render with the owner's `secrets: true`) and makes relative `@UUID[.x]`
  absolute. Items use the unidentified description while unidentified, for everyone. Provenance names
  only what the player already sees: the scene's **navName**, else the readable's folder, the pin's
  label, or the pile's name — never `scene.name`.

## Settings

| Key | Scope | Default | What |
|---|---|---|---|
| `gmButton` | world | off | Show the bar to the GM too, for testing the player flow. |
| `singlePageReadables` | world | on | One-page eye readables open without the page list. Turn off if multi-page eyes come back. |
| `folderName` | world, hidden | `Player Journals` | The folder personal journals live in. Not in the settings menu; set it from the console. Empty → the localised default. |

All three are read live; a change applies without a reload.

## API — game.pentaryn.journal

Published at `ready` on `game.modules.get("pentaryn-journal").api` and `game.pentaryn.journal`
(frozen). `describe()` lists every method with its params and return shape.

- For anyone (these answer as the **calling** user):
  - `personal(user?)` → the user's journal, or `null`.
  - `add(entry | page | item)` → what the button does: `{journal, pageIds, created, updated}`, or `null`
    when there is no bar for that document, no journal, nothing visible, or it is too large.
  - `status(doc)` → `none` / `partial` / `saved` / `changed`, or `null` when there is no bar for it.
  - `open(pageId?)` opens the user's journal; `shouldShowBar(entry, user?)` says whether that user gets the bar.
  - `report()` (not gated; it returns ids, names and counts only) →
    `{folder, users: [{user, userId, isGM, journalId, pages, duplicates}], atRoot}`.
  - `core` holds the pure helpers published before the migration (`sanitize`, `planSave`, `status`, …).
- Reads for any user (a user ref is a User, an id or an exact name; useful from an eval, which runs as the GM):
  - `inspect(userRef)` → `{user, journal, duplicates, entries}`. An Actor or Token (what the root
    `game.pentaryn.inspect(actor)` passes) means the player whose assigned character it is; `null` when it
    is nobody's.
  - `entriesOf(userRef)` → `[{pageId, name, key, place, savedAt, updatedAt, hash}]` (`key` is the source uuid).
  - `statusFor(doc, {as: userRef})` → `status()` for that user, without the bar's visibility rule.
  - `lastReason()` → why this client's last `add()`/`status()` was `null`:
    `no-target` / `no-journal` / `nothing-visible` / `too-large`.
- GM writes: `ensure(user)` creates that player's journal (rejects `GM only` on a player client);
  `ensureAll()` creates every player's journal and moves strays into the folder (`null` for a player).
- Kit members: `describe()`, `settings()`, `trace()`, `selftest()`, `uninstall()`, `version`, `contract`.

`add()` and `status()` return `null` for a GM unless `gmButton` is on — use `statusFor`/`entriesOf` instead.

## Data written

| Where | What |
|---|---|
| `JournalEntry.flags.pentaryn-journal` | `{kind: "personal", userId}` — how a personal journal is found (never by name) |
| `JournalEntryPage.flags.pentaryn-journal.source` | `{kind, key, entryId, entryName, pageName, place, noteText, savedAt, worldTime, hash, updatedAt?}`; `key` is the dedup key, `hash` drives *Update my copy* |
| `User.flags.pentaryn-journal.claims.ensure.<socketId>` | a timestamp, only while a GM tab answers a player's relayed ensure; that key is removed right after, leaving `claims.ensure` an empty object (the parent is never deleted: that would race another tab's stamp). A stamp left by a tab that died mid-claim stays, and is ignored after 60 s |
| Folder `Player Journals` | created by the active GM |

## Flags other modules read

n/a — no other module reads this module's flags. This module reads Item Piles' `flags.item-piles.data`
(`enabled`, `canInspectItems`) to find the real item behind a pile preview.

## Events

n/a — emits no hooks.

## Patches and adjustments

No patches. One third-party dependency: Item Piles shows a non-owner an unsaved copy of a pile's item
(`renderReadOnlyItemPreview`), so `sources-adapter.mjs` finds the source by id among the piles. Row:
`itempiles-journal-preview-copy` in `foundry/adjustments.yml`.

## Two sessions / who writes

- **The copy** is written by the player's own client, into a journal that player owns.
- **Personal journals** are created by the active GM's client: on `ready` (`ensureAll`) and on `createUser`.
  Players cannot create journals (TRUSTED+) or folders (ASSISTANT+); do **not** grant `JOURNAL_CREATE`.
- **The player relay** `pentaryn-journal.ensure` (a v14 user query): the sender may be a player; the
  active GM's client does the write; the payload is ignored; the query can create only the sender's own
  journal. Another client answers `NOT_GM: this client is not the active GM`. The query reaches every tab
  of the GM's account (the MCP bridge tab and a browser tab), so the tabs claim it first: the first to
  stamp its claim creates, the other waits for that journal and answers with it.
- With no GM online and no journal yet, the player gets a warning and nothing happens.

## Extending

New pure rules go in `journal-core.mjs` with tests under `test/` (synthetic fixtures only). A new kind of
window is one branch in `sources-adapter.mjs` (`targetFor`, and `targetOf`/`rawTargetOf` for the API)
plus a descriptor. New API methods: a row in `api-manifest.mjs` and an impl in `api.mjs`, then re-pin
`describe.json`/`surface.json` (`GOLDEN_UPDATE=1 node --test test/api.test.mjs`).

## Pitfalls

- **Duplicates:** the oldest journal wins, and `report()` lists the rest. Delete extras by hand after
  moving any pages you want to keep.
- **Items from piles:** if the item is later taken, the player's copy stays and its "the original" link
  goes stale.
- **Fixtures must be synthetic:** `test/` is published with the module and every client can fetch it; a
  real readable pasted into a fixture would publish its GM secrets.

## Files

| File | Role |
|---|---|
| `journal.mjs` | entry: wiring only |
| `journal-core.mjs` | pure: constants, `sanitize`, `planSave`, `status`, visibility and claim rules |
| `settings.mjs` | the `SETTINGS` table, `setting()`, `whenChanged()` |
| `sources-adapter.mjs` | windows, documents and Item Piles' pile data → targets and descriptors |
| `personal.mjs` | feature: personal journals, `ensure*`, `report`, the relay |
| `bar.mjs` | feature: the bar, saving, the glow, single-page eyes, provenance |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/journal.css`, `lang/en.json`, `lib/` (vendored kit) | |

## Tests

`node test/run.mjs` from the module folder (the legacy core suite runs from it too). Goldens live in
`test/golden/`; re-pin one file at a time and read the diff.

## Sync

`make foundry-journal-sync`, then reload. A `module.json` change needs a Foundry restart. Smoke after a
sync: `game.pentaryn.journal.describe().version` and `game.pentaryn.journal.selftest().ok`.
