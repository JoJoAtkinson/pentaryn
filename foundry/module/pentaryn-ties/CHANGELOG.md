# Changelog — pentaryn-ties

Newest first. The version is `module.json`'s; entries before the 2026-10 migration were collected from
the old README's version-tagged sections.

## Unreleased — blueprint migration (2026-10, wave 3)

- [declared] ties-ui belief text (defect wave 3, 2026-10-13): the GM-only belief row on a studied
  actor's Ties tab renders the authored lore as enriched HTML (`TextEditor.enrichHTML` relative to
  the actor, after the section binds) instead of printing its tags as literal text. Still GM-only;
  an empty belief keeps "said nothing"; a failed enrich falls back to the escaped text.

- [declared] names-ext-3 (kit 1.2.0, final review 2026-10-12): `inspect` reads a token's synthetic
  actor through the kit's `resolveRef(..., { base: true })` (the token's `actorId`) instead of ties'
  own `isToken` patch (the synthetic actor's id). Same dossier at the table.

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

Changed (declared, no table-visible change): Deliver and Forget ask one `missedAndLie` (study/gate.mjs)
for the kind rung-0 lie rule — a failed kind row is a card only when the kind has an authored rung 0 —
instead of two copies. The rule is now pinned on both paths (`test/kind-lie.test.mjs`). M11.

Changed (declared, no table-visible change): `runCascade` is split into its plan / roll / record steps
(`cascadePlanner`, `rollRung`, `recordRung`) and `shareFact` into resolve, select recipients, and one
writer per namespace (`resolveShared`, `shareRecipients`, `shareIdent`, `shareLore`, `shareKind`). The
cascade and share goldens are byte-identical. M12.

Fixed (declared): the Attribute Review keeps its carrier walk while open and drops it on
`createActor`/`updateActor`/`deleteActor` (and a species/background item's create, update or delete),
so expanding a row repaints without walking every world actor; the carriers shown are unchanged.
ties-ui-perf-11.

Fixed (declared): the worn badges keep the ids of the scene's marked tokens (rebuilt on
`canvasReady`, kept by a new `createToken` hook, `updateToken` flag writes and `deleteToken`), so a
token's animation step asks for a badge repaint only when that token is marked; the badges drawn are
unchanged. A hot re-import after `uninstall()` refills the set and repaints at install when the canvas
is already up, so the badges come back without a `canvasReady`. ties-ui-perf-10.

Fixed (declared): the Look window's `updateActor` hook checks the actor against the character, the
subject and its kind before flattening the change, so an unrelated actor's update returns at once;
what refreshes the window is unchanged. ties-ui-perf-9.

Fixed (declared): a Known-tab paint indexes the attribute registry once and hands that index to
every entry's secrecy filter, instead of each entry re-clamping the whole registry; what the tab shows
is unchanged. `visibleAttributesFor` takes an `index` (an `indexRegistry()` result or its `byId` Map)
in place of `registry`; the list form still works. ties-ui-perf-7.

Fixed (declared): the Attributes tab's two GM autocompletes (add an attribute, tell a character)
repaint once the GM pauses typing (120 ms) instead of on every keystroke, and gather the world's
attribute ids once per focus instead of walking every actor per letter; focus still paints at once.
New `attributes.mjs` helpers `attributeCandidates` / `searchCandidates`; `attributes.search` is
unchanged. ties-ui-perf-6.

Fixed (declared): the tie wires find each card's source token from one pass over the scene's
tokens per frame instead of one scan per card; the wires drawn are unchanged. ties-ui-perf-4.

Fixed (declared): a save in the Attribute Review is no longer lost under a write from another GM
tab (the bridge) that was already on its way. Every registry write stores a version stamp
`{ rev, by }`; a tab whose write was overwritten by one that never saw it re-applies its own change
once, and if both changed the same field the review row is flagged for reload. ties-ui-ACC-6.

Fixed (declared): the Attributes tab's ancestry **Fix it** button links every missing parent in one
save (`repairAllAncestry` in `attributes.mjs`) instead of one save per broken membership, is greyed
out while it works so a double-click cannot run it twice, and repaints the tab once. ties-ui-ACC-4.

Fixed (declared, integration with ties-core): **Fix it** (`repairAllAncestry`) now runs through the
registry's write queue with its link-flag reads inside, as `link`/`unlink`/`repair` do since
ties-core-U3, so a Fix it racing a script's link on the same actor lands both. The registry queue and
each actor's ties/Known queue (`serial` in `ties-adapter.mjs`) are separate chains: neither waits on
the other, so neither reorders or deadlocks the other — EC-2's concurrent `ensure` still answers
created + `existed: true` beside quick ties edits. Pinned by `test/review-queues-together.test.mjs`.
ties-ui-ACC-4 x ties-core-U3/EC-2.

Fixed (declared): a player's **Remove** on the Ties tab now removes the tie in both directions, as its
confirm says — the active GM's client removes the NPC's row back (relay action `remove-reverse`; the
sender must own their character and have removed their own side). ties-ui-E3.

Fixed (declared): a player with **no assigned character** now gets the double-click menu too — the
tie and notebook items (the notebook still warns that you need a character); *Take a closer look* and
*What I know about them* show only once a character is assigned. ties-ui-E7.

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

Changed (declared): the fact groups' headings in the player's Look window and the GM's Player view
come from one `GROUP_LABEL` table in `facts.mjs` instead of string ladders. The four groups read as
before; a group the table does not know is headed with its own name instead of "What they are".
ties-ui-EXT-4.

Fixed (declared): a switch clicked on the Inspect window's **Player view** while it is still
redrawing acts on the fact it was drawn for — the redraw builds its fact list and PC roster aside and
swaps them in only once finished, so a click or a switch refresh mid-redraw reads the previous,
consistent set instead of a half-built one. ties-ui-ACC-2.

Fixed (declared): the GM's **Attributes** tab finds who carries each personal attribute in one walk
of the world's actors per paint (built only if a personal row asks), instead of one walk per personal
row; the "Clues on …" lines are byte-identical. ties-ui-perf-2.

Fixed (declared): the GM's **Attribute Review** repaints once, 150 ms after the last of a burst of
registry writes (a Claude batch, a cascade), instead of once per write; it watches through the shared
`LiveHooks` kit and drops a pending repaint on close. ties-ui-perf-5 (with ACC-5).

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

Fixed (declared, no table-visible change): the tempo tell's doc said the paranoid line lands on the
tenth look; Joe's 2026-08-23 retune put it on the **sixth**, which is what the code does. The doc now
says so, and a test pins the rungs at the 2nd, 3rd, 5th and 6th look (and silence on looks 7–11). An
interim branch commit that moved the line to the tenth look was repaired before it shipped. M5.

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

Fixed (declared): an **inspection that stops on a held rung** hands back its `#inspect` claim before
the GM's "A check came in" Deliver/Later dialog opens, so the creature no longer carries a claim row for
that character while the GM decides. AC-1.

Fixed (declared): two GM sessions (one GM signed in twice) finishing **different attribute facts** in
the same instant no longer revert each other's rows. The attribute-belief ledger is one setting
rewritten whole, so `putBelief` now confirms its write like a claim: it waits 250 ms, re-reads the
ledger and, when its row is missing or different (a reset: present again), re-applies that one row on
the fresh value so both sessions' rows survive. An uncontested write is still one write. AC-2.

Fixed (declared): **Deliver** on a held identification whose character or creature is gone (a
deleted actor, a stale id) now does nothing and returns `false` instead of throwing a TypeError —
`deliverHeldIdentifications` guards both like `resetIdentification`. rob-1.

Fixed (declared): `describe()` now tells the truth about the study API — `study.tiers` and
`study.difficulty` answer the cleaned value (or `false`), `study.attrOffers` rows are
`{ id, title, icon, rows }`, `study.beliefs` rows carry `ns/factId/fact/characterId`, and
`study.whoKnows`/`factStatus` answer `{ status, key, belief, tier, total, from, dc }`; `study.share`,
`inspectAs` and `deliverHeld` list the Known list and the `attributeKnowledge` setting among their
writes, `study.deliver` lists `studied` and `known`. Manifest only; no behaviour changed. EXT-2.

Fixed (declared): README's Extending recipe for **a new study namespace** no longer says one branch in
`resolveFact` is enough — it names the downstream `fact.ns` tests in `apply.mjs`, `claim.mjs`,
`gate.mjs`, `share.mjs` and `authoring.mjs` too, and points at the seam note in `study/resolve.mjs`
as the kept list. Docs only; no behaviour changed. EXT-3.

Fixed (declared): an **inspection whose next rung is automatic** (no roll — the inspector carries the
attribute and it reads `auto`) now takes the `#inspect` claim before writing anything, just as a rolled
rung does, so with one GM signed in twice only the session that wins the claim writes the ledger rows
and hands over the grant. A cascade with nothing to do still takes no claim. AC-3.

Fixed (declared): an **inspection relayed for an actor that is not a character sheet** (an NPC named
as the inspector) is now refused before anything is written, the same refusal a study roll makes —
no ledger rows or grants land under an NPC's id. rob-5.

Fixed (declared): an **identification row on an attribute with no DC** (a derived attribute nobody has
authored an entry for) is never counted as a miss — there is nothing to fail against. The GM's pending
list no longer drops an empty one as a parked failure, so `deliverHeld` can free it; the beliefs view
and the held-rung prompt already agreed. The effective DC (entry DC plus concealment) now comes from one
helper, `identDcOf`, and the miss test from `identRowMissed`, both in `study/resolve.mjs`, at every site
that rolls, judges or reports an identification; the held-rung prompt prints "—" for a missing DC. M13, EXT-9.

Fixed (declared): every claim the study conduit stakes — a fact's or an inspection's — carries one
per-tab session token, `<userId>:<randomID>`, made on first use (`session()` in `study/claim.mjs`).
Fact claims used to stake a bare random id while inspection claims were user-prefixed; a stray claim
row now always names the account that left it. EXT-12.

Fixed (declared): the **once-per-round inspection rule in combat** marks rather than refuses — a second
look in the same round shows the "You have already taken a moment to look someone over this round."
warning and the inspection still runs (track and mark, never hard-block). The round mark is kept in
every started combat the character is a combatant in, not only the combat the client is viewing, so a
fight on another scene counts too. ES-5.

Changed (declared, no table-visible change): every flag deletion ties writes — a ledger row, a
study lock, a granted line on reset, forget or a do-over — uses core's `_del` value instead of the
`-=key` prefix deprecated in v14; the inspect preview reads a `_del` on a beliefs path as a
ledger-only change. ES-6.

Fixed (declared, no table-visible change): clearing the **last** study or identification row on a
creature (a reset, a released claim, Forget, an identification do-over) removes the creature's whole
`beliefs` flag instead of leaving an empty `beliefs: {}` behind. Every beliefs-row drop now goes
through one helper, `dropBeliefRow` (study/claim.mjs). ES-7, M10.

Fixed (declared): a GM **Share** of an identification to several characters writes every recipient's
row in one update of the creature and every recipient's card in one batch (`Actor.updateDocuments`),
not two writes per recipient; **Reset inspection** clears every rung in one update of the creature and
one of the character, and posts **one** notification naming every attribute ("… may work out Kin, Vel,
and Dockhands on … again.") instead of one per rung. The rows written are the same. AC-5.

Fixed (declared): a GM **Share** of a kind to several characters composes the tier-25 page **once**
and gives every recipient the same words (an inline roll in it resolves once, not per recipient);
it used to compose the page again for each recipient. `grantKind` takes the composed page as a
`text` option and composes its own only when none is given. perf-4.

Fixed (declared): a **pinned card** left flush against the left or top edge of the screen comes back
there after a reload instead of 20px in — a saved 0 is a real position (`pinnedCoord` in `popups.mjs`);
only a missing or non-numeric coordinate still falls back to 20. ties-ui-E5.

Fixed (declared): **Mark as learned on an NPC's Attributes tab** grants to your assigned character
(GM or player alike) and the toast names who received it; before, the button drew but did nothing.
With no assigned character the button is not drawn. One `viewerFor` in `attributes-ui.mjs` now
decides the tab's viewer for both drawing and clicking. ties-ui-M11.

Fixed (declared): a **belief row for a deleted character** can be cleared. The GM's "What they
believe" list tags it "(deleted)", offers no Deliver, and its "Let them roll again" clears the row by
the id on the ledger; the toast names nobody. `study.reset` accepts a character or its id.
ties-ui-rob-4.

Fixed (declared): two quick presses of **9** no longer open two description cards. The second press
waits for the first card to finish building, then toggles as usual — same face closes it, another face
swaps to that face — and an old card's late close no longer makes the next press open a duplicate.
ties-ui-E4.

Fixed (declared): `study.preview(null)` (no token hovered or selected) still warns "Hover or select a
token to preview." but now returns `null`, as the manifest's `Promise<InspectPreview|null>` says, instead
of the warning's notification object. ties-ui-M9.

Fixed (declared, no table-visible change): four re-exports nobody imported are gone — `WORN_FLAG`/`readWorn`
from `worn.mjs`, `PIN_SETTING` from `popups.mjs`, `baseActorOf` from `tie-dialog.mjs`, `SELECTION_FLAG`
from `review-ui.mjs`; import them from their homes (`ties-adapter.mjs`, `settings.mjs`, `attributes.mjs`).
`popups.mjs` imports `ties-adapter.mjs` once. The public API is unchanged. ties-ui-M5.

Fixed (declared, no table-visible change): `overlay.mjs` no longer exports `toggle`, the 0.3.0 alias of
`showAll` nothing imported — import `showAll`. The API rows (`show`, `showAll`, `cards`) are unchanged.
ties-ui-M6.

Fixed (declared, no table-visible change): the Ties tab's editing pass no longer binds a tie `change`
handler on the authoring section's lore rows (selector `.pt-row:not([data-inbound]):not(.pt-lore-row)`);
lore rows are saved by the lore editor alone. ties-ui-M7.

Fixed (declared): `game.pentaryn.ties.uninstall()` now cleans the canvas up — the worn badges and the
tie wires are removed and their queued repaints cancelled, and the cards come down (new
`popups.teardown()`, called from `overlay.uninstall`). The pinned-cards memo is NOT rewritten, so a hot
re-import brings the same pinned cards back once instead of drawing a second set. ties-ui-M8.

Fixed (declared, no table-visible change): `TieDialog._renderHTML` is split into private builders —
`#sourcePickerHTML`, `#targetPickerHTML`, `#statusHTML`, `#fieldsHTML` and `#mirrorBoxHTML`. The
dialog's markup is byte-identical in every state (pinned per state in `app-tie-dialog-states-html`).
ties-ui-M12.

Changed (declared, no table-visible change): helpers the UI files copied now live once —
`keyLabel`, `bindSummary` and `FALLBACK_ART` in `core/html.mjs` (the Ties and Known tabs' key hints
and in-place summary rebinds, and the mystery-man portrait seven files spelled out), and the "open
the tie dialog or say it is unavailable" try/catch once in `editor.mjs` (`openTieDialog`). Markup and
behaviour unchanged. ties-ui-M14.

Fixed (declared, console only): a pinned-cards save the server refuses, or a Look window that fails to
draw, now logs `pentaryn-ties | could not save pinned cards` (warning) or `pentaryn-ties | look window`
(error) instead of an unprefixed unhandled rejection. Nothing on screen changes. ties-ui-rob-5.

Fixed (declared, console only): six silent fallbacks now leave a debug line (with
`CONFIG.debug["pentaryn-ties"] = true`) through `log.swallow` — the review panel's and the personal-clue
carrier walks (`carrier ids unreadable`), a carrier's unreadable lore, a pinned card's leash off-stage
and a card's screen point off-stage. Each keeps its old fallback, so nothing on screen changes.
ties-ui-rob-6.

Fixed (declared): the inspect eye, Study, Lore, Mark as learned, Tell them and Release buttons run
through one `guardClick` (`core/html.mjs`) — disabled while their write runs, and enabled again when it
ends. A write that throws now logs `pentaryn-ties | <action>` (error) and shows "That didn't go through
— see the console." instead of leaving the button dead with an unprefixed unhandled rejection. The HUD
eye is no longer left disabled after a finished inspection. ties-ui-rob-7.

Fixed (declared, integration with ties-core R8): ties-core's writes no longer throw on a refused save —
`markLearned`, `grantKnowledge` and `repairAllAncestry` answer `{ ok: false, reason: "writeFailed" }`.
`guardClick` treats that answer as its failure path, so **Mark as learned**, **Tell them** and **Fix it**
show the same thing a throw did: the button enabled again, `pentaryn-ties | <action>` (error) in the
console beside the write's own warning, and "That didn't go through — see the console."; Mark as
learned shows no "learned" toast. ties-ui-rob-7 x R8.

Changed (declared, no table-visible change): key lists are derived from their label tables — the
world filter chips from `FILTER_LABEL`, the world tree's failed / pending / unknown tag from a new
`STATE_LABEL`, the review panel's "was" rows from `FIELD_LABEL`. Same order, same markup. ties-ui-EXT-5.

Changed (declared, no table-visible change): the "is this a Personal attribute?" test (category
trimmed, case-blind, `personal`) is one `isPersonalEntry(entry)` in `core/rules.mjs`; the review panel's
World / Personal tab split and the Attributes tab's "Clues on <carrier>" both call it instead of
spelling it by hand. ties-ui-EXT-6.

Changed (declared, no table-visible change): every DC input — the Attributes tab's identify DC and
the review panel's entry and lore-row DCs — takes its min, max and default from `LORE_DC_MIN /
LORE_DC_MAX / LORE_DC_DEFAULT` (core/lore.mjs, via known-core) instead of a literal 1 / 40 / 15, as
the lore-row editor already did. ties-ui-EXT-7.

Changed (declared): every **skill** dropdown — the lore-row editor, the Attributes tab's identify
check, the review panel's entry and lore rows — lists the world's skills in dnd5e's own order with
localized names (the lore editor used to sort them A–Z), and a skill the world no longer defines stays
selected as "<key> (not in this world)" instead of the identify check silently switching to the first
skill on its next save. Skill names in the Inspect preview and the review panel's "was" lines are
localized too. One `skillOptionsHTML` / `skillLabelOf` in `core/html.mjs`. ties-ui-EXT-8.

Changed (declared, no table-visible change): the tie wires and the worn badges no longer carry their
own copy of the once-per-frame scheduler and the canvas-layer helpers. Both paint through one
`framePainter` (the kit's `perFrame`, cancellable on uninstall) and one `interfaceLayer` / `dropLayer`
pair in `ties-adapter.mjs`. Same frames, same pixels (canvas goldens byte-identical). ties-ui-EXT-9.

Changed (declared, no table-visible change): the Inspect gesture is written once. The HUD eye and the
double-click menu's "Take a closer look" both call `examine(who, subject)` in `look-app.mjs` (the
player's Look window first, then the inspection) and resolve the creature with `subjectOfToken(token)`
in `ties-adapter.mjs`; the GM's flask uses `subjectOfToken` too. Neither door imports the study conduit
any more (two graph-allow debts retired). Door goldens byte-identical. ties-ui-EXT-10.

Changed (declared): "the GM, or player access on and the player owns it" is written once, as
`mayActOn(actor)` in `settings.mjs`; the canvas tie keys (`overlay.mjs`) and the sheet tabs
(`sheet.mjs`) both ask it. It reads player access through `mayWrite`, so before the settings register a
player is refused rather than let through on the setting's default. ties-ui-EXT-11.

Changed (declared): the Inspect preview reads the kind-study ladder from `known-core` instead of
hard-coding it: the dice bench's odds list is the positive `STUDY_RUNGS`, lowest first; the top tier
(the composed study, the Share switch's "click tells them the rest") is `Math.max(...STUDY_RUNGS)`; the
pass line is ties-core's `kindPassed(tier)` (ext-7). Same numbers today. ties-ui-EXT-13.

Changed (declared, no table-visible change): the "GM only" badge is written once, as `gmBadge()` in
`core/html.mjs`; the authoring section, the two mutual-pair panels and the told-count line call it.
Markup byte-identical. ties-ui-EXT-15.

Changed (declared): the Inspect preview is one window per subject — a second flask click on the same
token fronts and re-renders the open preview instead of stacking another (two unlinked tokens of one
actor still get one each). TiesEditor, AttributeReview, the Look window and the preview share one
`openOrFront(pool, match, make)` in `core/html.mjs`: an open window is un-minimized, re-rendered and
fronted (the ties editor used to front without re-rendering). `edit`, `study.preview` and
`attributes.openReview` return the window (or `null`), not a promise. ties-ui-EXT-16.

Fixed (declared): a sheet re-render that rebuilds only the tab body no longer stacks another click
listener on each surviving Ties/Known/Attributes nav link. The link is bound once (`data-pt-bound`) and
finds its section at click time (`:scope > [data-tab=id]`); a fresh section under a surviving link is
only repainted (and re-activated if that tab was open). ties-ui-E9.

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
setting cannot be claimed, so no redesign. The comments in `attributes.mjs`, `settings.mjs` and
`review-ui.mjs`, the README's "who writes" section and the Gotchas in
`context/foundry/attribute-review.md` no longer say otherwise. Pinned by `test/review-queue-per-tab.test.mjs`.
ties-core-U2.

Fixed (declared): several attribute links or unlinks on one actor made together (a backstory script's
`Promise.all`) all land. Each used to read the actor's link flags before the others' writes came
back, so only the last link survived. `linkAttribute`/`unlinkAttribute` (and `repair`, a link) now run
through the registry's `serial()` queue with their flag reads inside it. Pinned by
`test/review-link-race.test.mjs`. ties-core-U3.

Fixed (declared): an **item mark's** hover text is shown as plain text. The tip (`mark.tip`, which a
player can write like any item flag) went to `data-tooltip`, which Foundry renders as HTML, so markup in
it ran in every viewer's sheet; it now goes to `data-tooltip-text`. Icon and colour are unchanged.
Pinned by `test/review-mark-tip-text.test.mjs`; the `canvas-item-marks` and `declared-b6-unescaped`
goldens' dataset key is now `tooltipText`. ties-core-U4.

Fixed (declared, no table-visible change): the broken-ancestry check (`brokenAncestry`) and the
re-parenting sweep (`staleCarriers`) index the registry once per call instead of once per id they
check; same rows. Pinned by `test/review-ancestry-index.test.mjs`. ties-core-U5.

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
