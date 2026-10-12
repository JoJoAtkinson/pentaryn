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

Fixed (declared): the chat cards — the "… studies …" stub, the tempo line and the GM's share
whisper — name every creature by its **token** name, never its actor name, so a GM-only world actor
name cannot reach player chat. The token is found on any scene, not only the one the posting
client is viewing (the GM's tab can sit elsewhere); no token on any scene → the prototype token's
name; the actor name only when there is no token at all. name-leak (play-test TIE-3).

Fixed (declared): the tempo tell's last line ("… looks openly paranoid.") lands on the **tenth** look
in one spot, as Joe's rule says, not the sixth; the rungs are the 2nd, 3rd, 5th and 10th look. The
string's key is `known.inspect.scope10` (was `scope6`). M5.

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
