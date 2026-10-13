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

Fixed (declared): **Write an entry for this** on a kind row stores the kind actor's own id. The
`kind:` id was lowercased, so the entry never matched its actor and a second click said
"collision" on a row that still read unauthored. The id now keeps its case (still only letters and
digits, at most 64). At load the GM's client rewrites each entry stored the old way to the one actor
it matches ignoring case (and any child pointing at it). If no actor matches, two actors match, or
the actor already has an entry, the entry is left alone. R1.

Fixed (declared): a lore row or attribute with **no DC** (missing, or its DC box cleared) rolls
against the default DC 15. It used to read as 0 and clamp up to DC 1. A typed DC still counts, and
a real 0 is still raised to the floor of 1. The same check now reads every number in the Known and
study records, so a study rung saved without a `min` is ignored rather than taken as the base rung (R7, now pinned by its own test). M1.

Fixed (declared): a **refused save** of a tie, a Known entry or a Mark as learned no longer throws.
The write logs a console warning and reports failure (`write`/`writeKnown` answer false,
`markLearned` answers `writeFailed`); a tie whose other side is refused still reports the side that
saved. At load, one actor whose legacy ties can't be moved is warned about and left for the next
load, and the rest still move. R8.

Fixed (declared): **`setNotes`** answers false when its save is refused — a player editing notes on an
actor they don't own, or an update the server rejects — instead of reporting true with nothing
saved. M11.

Fixed (declared): **`attributes.markLearned`** takes its character as an id, a uuid, an exact name
or a token as well as an Actor, and marks the world actor it names. Something that names no actor is
refused `invalid`; it used to throw `character.getFlag is not a function`. R3.

Fixed (declared): **`attributes.markLearned`** keeps the write contract — no character at all is
refused `invalid` (it answered `notFound`, which means an unknown attribute), and `noLore` (the
attribute has no matching lore rows) is now a documented reason in the closed table. A refused save
answers `writeFailed` (R8). M10.

Fixed (declared): two **`attributes.ensure`** calls for the same new title, made together, now both
succeed — the first creates it and the second answers `existed: true`. The second used to answer
`collision`, because both looked at the list before either had written. Same answers otherwise. EC-2.

Fixed (declared): a **key** (4–9) whose action fails partway is logged to the console as
`pentaryn-ties | key <key> failed` with the error, instead of a bare "Uncaught (in promise)". The key
is still swallowed and nothing on screen changes. R10.

Guarded (declared, no table-visible change): `attributes.mjs` exports `NS_LABEL` and `DERIVED_ICONS`
(module exports, not API paths), and `test/review-derived-ns.test.mjs` fails if a derived namespace
lacks a label in `lang/en.json`, an icon, or a `deriveAttributes` slot. ext-2.

Docs (declared, no table-visible change): README Extending's study-namespace bullet names all five
fact-key helpers a new namespace must touch — `factKeyOf`, `parseFactKey`, `factOrder`, `knowsAbout`
and `resolveFact` — pinned by `test/review-extending-ns.test.mjs`. ext-3.

API description (declared, no table-visible change): the subject argument of `study.state`,
`study.lore` and `study.knowsAbout` is marked `resolve: false` in `describe()`, as their first argument
already was — api.mjs resolves a token, id, uuid or exact name there itself. `test/api-kit.test.mjs`
now fails if a read param that takes an id is unmarked, or if any `resolve: false` position answers
differently for the actor's id than for the Actor. ext-5.

API description (declared, no table-visible change): five `returns` strings in `describe()` now say
what the call answers — `attributes.search` → `{ matches, wouldBe, canCreate, collidesWith }`,
`attributes.stale` → `[{ actor, extra, missing }]`, `attributes.tell` → `{ ok, ids } | { ok: false,
reason }`, `attributes.unreviewed` → `[{ id, title, reviewState, touched, modifiedAt, createdAt }]`,
`known.categories` → `[{ key, label, seeded }]`. Pinned by `test/review-manifest-returns.test.mjs`
against the live calls; `noLore` joined the reason table with M10. ext-8.

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

Fixed (declared, no table-visible change): the kind study's pass rung (15) is one rule,
`kindPassed(tier)` in `core/rules.mjs`, read off `STUDY_RUNGS` (now kept in `core/shared.mjs`, still
exported by `core/study.mjs`), instead of a hand-written `>= 15` at nine sites. ext-7.

API description (declared, no table-visible change): `describe()` lists `flags.pentaryn-ties.knownCategories`
and `flags.pentaryn-ties.mark` under `flags.reads`, not `flags.writes` — the GM authors them by hand and the
module only reads them. Pinned by `test/review-flag-reads.test.mjs`. ext-9.

Fixed (declared): a PC whose name merely contains "marker", "crowd" or "hotspot" (a "Crowder") keeps its
**Share switch** in the GM's inspect window and its Simulate roller row. `tablePCs` now leaves out only
names with one of those as a whole word — "Marker · 1", "Drow Commoner (crowd) 1", "Hotspot · Look".
Pinned by `test/review-roster-whole-words.test.mjs`. ext-11.

Fixed (declared): two GM tabs at a world's first ready (the bridge and a GM browser) no longer make
two **Ties Web** hotbar macros. The macro is created with the fixed id `pentarynTiesWeb0` and
`keepId`; v14 does not refuse a world document whose id exists, so the later tab's create replaces the
record with the same data and one macro results. Pinned by `test/review-macro-race.test.mjs`. ties-core-U1.

Documented (declared, no table-visible change): the attribute registry and the knowledge/belief
stores queue writes **per tab**, not across the two GM tabs. A Review-panel save in the GM's browser
racing an `A.update` from the bridge tab rewrites the whole setting and the second write wins; a
setting cannot be claimed, so no redesign. The comments in `attributes.mjs` and `settings.mjs` and the
README's "who writes" section no longer say otherwise. Pinned by `test/review-queue-per-tab.test.mjs`.
ties-core-U2.

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
