# Changelog — pentaryn-ties

Newest first. The version is `module.json`'s; entries before the 2026-10 migration were collected from
the old README's version-tagged sections.

## Unreleased — blueprint migration (2026-10, wave 3)

Structure (no table-visible change): the pure core split into `core/` behind `known-core.mjs`, the
study conduit into `study/` behind `study.mjs`, the entry into features, settings into
`settings.mjs`, the API built from `api-manifest.mjs` by the kit, the ties data layer into
`ties-adapter.mjs` (`ties-api.mjs` is a one-release compat barrel), UI files renamed for their role,
`lang/en.json` nested under `PENTARYN_TIES`, the windows' CSS under `pt-` classes, every string through
`_loc` with its full key. Debug lines at the silent refusals (`CONFIG.debug["pentaryn-ties"] = true`).

Declared (see `context/plans/addon-blueprint-2026-10/migrate-pentaryn-ties.md` §5):

- `attributes.describe` and `study.inspect` (deprecated aliases since D1) are gone — use
  `attributes.lookup` and `study.examine`.
- The key-9 card is `describeCard`; `describe()` is the API's JSON description.
- Published through the kit: `game.modules.get("pentaryn-ties").api`, `pentaryn-ties.ready` and
  `pentaryn.ready` fire.
- The legacy actor reads (`read`, `inbound`, `known.read`, `attributes.of/ids/known/broken`,
  `study.beliefs/state/lore`) take an id, a name or a token and read the world actor.

Added: `inspect(ref, { as })` (the dossier), `selftest()`, `attributes.effective/ofEffective`
(with the kind pointer), `attributes.tree/branch/describeId`, `study.factStatus/shareFact/forgetFact`,
`study.identified`.

Fixed (declared): a player's **Remove** on the Ties tab now removes the tie in both directions, as its
confirm says — the active GM's client removes the NPC's row back (relay action `remove-reverse`; the
sender must own their character and have removed their own side). ties-ui-E3.

Fixed (declared): the Known tab's **notes** keep the last words typed before you click away or close
the sheet — leaving the box now saves a pending autosave at once instead of dropping it. ties-ui-M1.

Fixed (declared): key 5 (or `known.open`) on a **hidden** Known entry opens its page instead of
showing nothing — that one entry is un-hidden (as its Unhide button would) and the Known tab repaints
in place, so an already-open sheet shows it too. Other hidden entries stay hidden. ties-ui-E2.

Fixed (declared): two quick edits on one sheet no longer undo each other — a word then a strength pip,
a field then a Remove, two Known fields in a row. Each actor's ties and Known writes run one at a time,
reading the list after the previous save landed (`serial` in `ties-adapter.mjs`). ties-ui-ACC-3.

Fixed (declared): the stance chip (the dot plus its word) looks like a chip again, not a filter
button — the GM's filter and tab buttons (Attributes world filter, Review tabs and filters) are now
`pt-filter-chip` / `pt-filter-chip-on` / `pt-filter-chip-quiet`, so `.pt-chip` is the stance chip's
alone and its narrow-sheet dot-only override works again. ties-ui-M2.

Changed (declared, no table-visible change): each `SHEET_TABS` row in `sheet.mjs` now carries
`forget(actorId)`, and the `deleteActor` sweep loops over the rows instead of a hand list, so a new
sheet tab says what it forgets. ties-ui-EXT-2.

Fixed (declared): the Ties tab's **notes** save the same way the Known tab's do — one shared autosave
(`bindNotesAutosave` and `replaceSummary` in `core/html.mjs`), so leaving the box saves the last words
typed once, not twice (its extra `change` save is gone). ties-ui-EXT-3.

Fixed (declared): the chat cards — the "… studies …" stub, the tempo line and the GM's share
whisper — name every creature by its **token** name, never its actor name, so a GM-only world actor
name cannot reach player chat. The token is found on any scene, not only the one the posting
client is viewing (the GM's tab can sit elsewhere); no token on any scene → the prototype token's
name; the actor name only when there is no token at all. name-leak (play-test TIE-3).

Fixed (declared): the tempo bubble ("… is studying the room") is drawn only over a token the viewer
can see. A player whose client cannot see the looker's token gets no bubble at that spot, so it no
longer reveals where a hidden character stands. The GM still sees it, and the chat line still posts. ES-4.

Fixed (declared): the GM's **hold prompt** ("A check came in") names an attribute fact as it does a
lore row — "The Guild — Held oath — DC 10, rolled 15" — instead of "Tier null on a total of 15"; only
a kind prints a tier. A held row with no roll behind it (an auto kind, a GM tell) shows its total as
"—", not "null". EXT-1.

Fixed (declared): a bare **claim row** (the stake a GM client writes before the dice fall, still in
flight or stranded by a client that closed mid-roll) is no longer listed by `study.pending()` as an
undelivered reveal, and **Deliver** on one is refused with "Nothing is pending…" instead of spending
the roll and handing over nothing. `reset` stays the cure for a stranded claim. ES-1, ES-2.

Fixed (declared): a **late claim** — a second GM session's stake that lands after the first session
already rolled and wrote the answer — no longer wins, so a finished kind or lore fact is never rolled a
second time over the first answer. The late session hands its stray stake back and stays silent. AC-4.

## 0.19.4 (2026-10-10, usability run, Area 7 re-run)

- **The inspect window's Share switches are the table's PCs only** (`tablePCs`): each player's
  assigned character, plus every character of a player who has not picked one. Transformed copies
  (dnd5e `isPolymorphed`) are left out, so a share can no longer land on a form that vanishes on
  revert. Two PCs with one first name show their whole names. The same list feeds the Simulate roller.
  U-7-3 in `context/plans/usability-changes-2026-10.md`.

## 0.19.3 (2026-10-10, usability run)

- **Fixed: a closer look from a non-active scene rolled nothing.** `canReach` checked the active scene
  and the **GM's own** `canvas.scene`, because it runs on the GM's client; a player viewing any other
  scene got the stub card and the tempo line, then a silent refusal. It now reads the asking user's
  `viewedScene`. Same rule for Study and the tie relay.
- The player's double-click menu gains **Add or edit a tie** and **Write about them in my notebook**
  (U-7-1).

## 0.19.2 (2026-10-10, dnd5e 6.0.6)

- Blind Study rolls pass their roll mode through `foundry.dice.Roll._mapLegacyRollMode`: dnd5e 6 hands
  `rollMode` to core as the `messageMode`, which only accepts the new keys; the legacy `"blindroll"`
  was silently replaced by the client default. Registered as `dnd5e-legacy-roll-modes`.
- `module.json` requires dnd5e 6.0+ (verified 6.0.6).

## 0.19.1 (2026-10-10, Foundry 14.369)

- The flag-scope guard (`touchesFlagScope`) also recognises 14.369's whole-scope deletion form.
- Blind Study rolls set the Dice So Nice flag `skip`, so they no longer animate on the GM's screen.

## 0.19.0 (2026-10-07)

- Item marks: a small icon after a marked item's name on every actor sheet
  (`item.flags["pentaryn-ties"].mark = { icon, tip, color }`).

## 0.18.0 (2026-10-07)

- The player's **Look window**: a closer look also opens a read-only *"<name> — what you know"* window
  holding only the facts that character has been granted, in the inspect window's order.
- Double-click a creature you can see and don't own: a menu with **Take a closer look** and **What I
  know about them** (core gives a player no HUD on someone else's token).

## 0.17.0

- The GM's inspect window (the flask): **Player view** with per-PC Share switches (share, forget,
  held, failed), live while open; **Simulate rolls** is the old preview.

## 0.13.0

- **Study — "what is this?"**: one blind knowledge check per kind, thrown on the GM's client, graded
  15 / 20 / 25 into description, defences, attacks; authored rungs may lie; the approval gate.

## 0.11.0 – 0.12.0

- The **Known** tab (0.11.0) and its canvas key, `5` (0.12.0).

## 0.7.0

- Key `9`: the GM's description card (replaces the `Quick View` macro).

## 0.5.0

- The worn mark: a GM-only possession marker on a token.

## 0.4.0

- One key for cards: `8`. 0.3.0's word-badge mode and its `Shift+8` were dropped; the keybinding kept
  its id, so a custom binding survives.
