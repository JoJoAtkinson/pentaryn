# Pentaryn NPC Ties (`pentaryn-ties`)

**Read this when:** you are changing ties, the Known notebook, the study conduit, the attribute layer or
their windows, or calling `game.pentaryn.ties` from a macro or the bridge. Using attributes and study
at the table → [`context/foundry/attributes.md`](../../../context/foundry/attributes.md); the review
panel → [`context/foundry/attribute-review.md`](../../../context/foundry/attribute-review.md); release
history → [`CHANGELOG.md`](CHANGELOG.md); how it was built → `context/plans/` (the
`foundry-encounter-log.md` design and the 2026-10 migration guide).

Who knows who, and what each character has learned about the people and creatures they meet —
recorded on the actor, edited on the sheet, shown on the canvas.

## What the player sees

**Ties.** Hover a token and press **`8`**: everyone that person knows *who is in sight* gets a card over
their token — art, one word for the relationship, name, notes. **`7`** with your own token selected
shows the one card for what the hovered person is to you. Drag a card to keep it; a thin
stance-coloured wire keeps it attached to its person (a *reach* wire when they stand more than
`nearDistance` squares away, a *leash* to a card you dragged aside). **`6`** (or the Token HUD button,
or the double-click menu) records a tie. The **Ties** tab on the sheet lists them: click a row to edit
word, stance (−2 hostile … +2 devoted), strength (1–5) and notes in place.

A tie is **directed**: an actor's array says what *that actor* is to each person listed. Saving writes
your side and seeds theirs; a blank reverse box keeps following yours, typed text diverges, emptying
it re-links. A player cannot write to an NPC, so their client asks the active GM to fill the blank
reverse side (the relay — never overwrites written text). Removing a tie removes both directions; for
a player the GM's client removes the NPC's row back (the relay's `remove-reverse`).

**Known.** A second tab, on character sheets only: one page per creature or person they have met,
filed under Sentient or Beasts. **`5`** files whoever you hover and opens the page. **What is this?**
on a page throws a blind Study check on the GM's client (one attempt per kind, ever): 15 / 20 / 25
buys description, defences, attacks — written in the GM's words, which at low tiers may be wrong.

**Inspect.** **`4`**, the HUD eye or the double-click menu's *Take a closer look* starts the
identification cascade (the only thing that rolls for attributes) and opens the player's read-only
**Look window**: the facts that character has been granted about that subject, nothing else.

**Players** use all of this on their own character only, only on tokens they can see
(`Token#isVisible`), and only while **playerAccess** is on. **The GM** also gets: key **`9`** (the
actor's private description card), the worn mark (a masks HUD button — who is inside a host token),
the flask (the inspect preview: player view with per-PC Share switches, and simulated rolls), the
Attribute Review panel (tag icon, token tools), and item marks (an icon after a marked item's name).

> Tie notes, Known pages and every flag here are readable from a player's console — Foundry ships every
> document to every client. The rules above govern what is *presented*. A real secret does not go
> into the world at all, a GM journal included.

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `playerAccess` | world | on | Players may use the keys, tabs and dialogs on their own character. Off = GM only |
| `holdDefault` | world | off | Hold every study reveal for the GM's Deliver unless the kind says otherwise |
| `advantageStacking` | world | raw | How advantage sources combine on a study roll: `raw` (2024 PHB) or `net` |
| `nearDistance` | world | 4 | Squares within which a tie counts as near (beyond it a card gets a reach wire) |
| `sheetTab` | client | on | Show the Ties / Known / Attributes tabs on actor sheets |
| `attributes`, `attributeBeliefs`, `attributeKnowledge` | world store | — | The registry, attribute-lore beliefs and world knowledge (GM-written; `SETTINGS_MODIFY` makes them unforgeable) |
| `macroCreated` | world store | — | The *Ties Web* hotbar macro was created once |
| `pinnedCards` | client, hidden | [] | Pinned cards on this browser |

Keys (Configure Controls → Ties): `8` show, `7` one tie, `6` add a tie, `5` file in the notebook, `4`
inspect, `9` description card (GM). The tab hints read the live binding.

## API — game.pentaryn.ties

`game.pentaryn.ties.describe()` is the reference: every path, its parameters, return shape, whether it
is GM-only or writes, and one sentence — the same data as
[`test/golden/describe.json`](test/golden/describe.json). Also `game.modules.get("pentaryn-ties").api`.
Pre-kit paths are `legacy: true`: documents in, a miss is `[]` / `null` / `false`, writes answer in
their own shape. The ones reached for most:

| Call | |
|---|---|
| `inspect(ref, { as })` | everything ties knows about one actor, plain JSON — start here. `ref` = Actor, token, id, uuid or exact name |
| `read(ref)` / `inbound(ref)` | an actor's ties / who points at them (GM) |
| `set(a, b, { word, stance, strength, notes })` | write an edge; **force**-mirrors the reverse word and stance |
| `known.read(ref)` · `known.add(actor, who)` | the notebook |
| `attributes.lookup(idOrTitle)` · `attributes.of(ref)` · `attributes.effective(actor)` | one record · what an actor carries (`effective` includes the kind pointer) |
| `attributes.ensure(title, opts)` · `attributes.link(actor, ref)` | registry writes: `{ ok, reason? }`, never a throw |
| `attributes.tell(pc, ref, { withParents })` | disclosure — world knowledge without a roll (GM) |
| `study.examine(pc, subject)` | the inspect gesture (was `study.inspect`) |
| `study.share(spec, pcs)` · `study.forget(spec, pc)` · `study.whoKnows(spec, pc)` | tell / untell one fact; where a PC stands |
| `study.identified(subject, pc, attrId)` | has this PC identified this attribute on this creature |
| `selftest()` | live smoke checks after a sync |

GM-only in `inspect`: inbound ties, the belief ledger, the kind pointer, the study ladder, lore rows
and concealment are null for a player; ties, Known, granted cards and world knowledge only for an actor
they own. Renamed in the 2026-10 blueprint migration: `describe` (the card) → `describeCard`; `attributes.describe` →
`attributes.lookup`; `study.inspect` → `study.examine`.

## Data written

| Where | Key | What |
|---|---|---|
| Actor | `flags.pentaryn-ties.ties` | `[{ id, name, word, notes, stance, strength }]` — what this actor is to each |
| Actor (character) | `.known`, `.granted`, `.studied` | the notebook, the cards handed over, the player-side study hint |
| Actor (subject) | `.beliefs` | the GM-plane ledger: what each character was told, rung, total, delivery, claims |
| Actor | `.kindOf`, `.studyTiers`, `.studyHold`, `.studyOffset`, `.lore`, `.conceal` | GM authoring: kind pointer, ladder, hold, DC shift, lore rows, concealment |
| Actor | `.attributes`, `.attributesOff` | authored attribute links; suppressed derived links |
| Token | `.worn` | `{ by, note }` — the GM's possession mark |
| User (GM) | `.attrSelected` | the review panel's ticks |
| World settings | `attributes`, `attributeBeliefs`, `attributeKnowledge` | registry, attribute-lore beliefs, world knowledge |

Read but never written — the GM authors these by hand (`flags.reads` in `describe()`):

| Where | Key | What |
|---|---|---|
| Actor (character) | `flags.pentaryn-ties.knownCategories` | `[{ key, label }]` — extra notebook categories, or a rename of a seeded one |
| Item | `flags.pentaryn-ties.mark` | `{ icon, tip, color }` — the item mark; `tip` shows as plain text (`data-tooltip-text`) |

Writes use `render: false` where a re-render would destroy the injected tab mid-edit.

## Flags other modules read

n/a — no other module reads `pentaryn-ties` flags; use `game.pentaryn.ties`. Ties reads
`flags.item-piles.data` (a pile gets no look menu) and `flags.dnd5e.isPolymorphed` (a transformed copy
gets no Share switch).

## Events

None emitted (`HOOKS` is empty). Listened to: `golden/hooks.json` and `hooks-after-init.json` pin the
list and order — tempo-clearing (`canvasReady`, `combatStart`, `deleteCombat`, `updateCombat`), the
review control, the Token HUD, the look menu, the sheet render hooks and `deleteActor`, then (from
`init`) the overlay's wires, the worn badges and the item marks.

## Patches and adjustments

No prototype patches. Rows in `foundry/adjustments.yml`: `core-ties-flag-wipe` (a whole-scope flag
deletion arrives as a `ForcedDeletion`), `dnd5e-legacy-roll-modes` (blind rolls map their mode through
`Roll._mapLegacyRollMode`), `dsn-skip-blind-study` (Dice So Nice `skip` on blind rolls); an
item-piles row for the pile check waits in the adjustments batch.

## Two sessions / who writes

The **active GM** (`isActiveGM()`, a *user*) applies every relayed write — the reverse-side relay and
the study conduit on the `module.pentaryn-ties` socket. One GM account can be signed in twice (the MCP
bridge tab and a browser), and both are the active GM, so the conduit **stakes a claim** before it rolls
(`stakeAndConfirm` in `study/claim.mjs`: write a token, wait 250 ms, read it back) and only the winning
tab rolls. The relay needs no claim: it only fills blanks or removes one row, so a second application changes nothing. The
stub card and the tempo bubble are posted by the client that made the gesture. World-setting stores
are GM-written; the registry and the knowledge/belief stores queue their writes one at a time,
**per tab** only. Attribute links and unlinks (`attributes.link`/`unlink`/`repair`) share the
registry's queue, so a script's `Promise.all` of several links on one actor lands every one. Two GM tabs writing the same setting at once (a Review-panel save racing a bridge
`A.update`) each rewrite the whole value, and the second write wins — a setting cannot be claimed.

## Extending

- **A sheet tab:** a spec row in `SHEET_TABS` (`sheet.mjs`) — id, icon, tooltip, `shows`, `build`, `bind`.
- **A GM socket action:** a row in the caller's `listen({ action: { run, gmOnly } })` table
  (`socket-adapter.mjs`) — never another `game.socket.on`.
- **An API path:** a row in `api-manifest.mjs` plus its function in `api.mjs`, or a feature's
  `install()` return `{ impl }` when it opens a window. Then
  `GOLDEN_UPDATE=1 node --test test/api-kit.test.mjs` and read the diff.
- **A pure rule:** `core/<topic>.mjs` with a fixture; new rules go in `core/rules.mjs` (the
  `known-core.mjs` barrel's export list is pinned).
- **A study namespace:** a branch in each of the five fact-key helpers, which are if-ladders on the
  namespace — `factKeyOf` (`core/facts.mjs`, the key a share writes), `parseFactKey` (`core/lore.mjs`,
  the key read back), `factOrder` (`core/facts.mjs`, what a subject could hand a player), `knowsAbout`
  (`facts.mjs`, what the Look window draws) and `resolveFact` (`study/resolve.mjs`). Miss one and a
  share lands under a key nothing reads.

## Pitfalls

- **An unlinked token's actor is not the actor.** Ties data lives on the world actor (`baseActorOf`);
  writing through `token.actor` lands on the token's delta and is lost to every other token.
- **Never nest the registry's queued writes** (links and unlinks included) — a queued write that awaits another waits on itself.
- **`Actor#update` merges.** Deleting a ledger row needs the deletion syntax (`dropRow`); writing the
  object back without the key does nothing.
- **`Number(null)` is 0.** Nullable numbers go through `numOrNull`; a "rolled 0" is a different lie.
- **`isVisible`, never `visible`.** On v14 `Token#visible` is true for walled-off and hidden tokens.
- **A setting read before `init`** returns the row default through `setting()`; `mayWrite` refuses instead.

## Files

| File | Role | Holds |
|---|---|---|
| `pentaryn-ties.mjs` | entry | wiring: keys, init/ready, the features in order, publish |
| `ties-core.mjs` | core | identity constants, tie clamps, the mirror rules |
| `known-core.mjs` → `core/*.mjs` | core | barrel over known, study, lore, attributes, ledgers, roster, prose, facts; plus `core/rules.mjs`, `core/html.mjs`, `core/shared.mjs` |
| `settings.mjs` | settings | `SETTINGS`, `KEYBINDINGS`, `setting()`, `mayWrite` |
| `api-manifest.mjs`, `api.mjs` | manifest, api | the rows; implementations, `inspect`, `selftest`, `buildApiFor` |
| `ties-adapter.mjs`, `socket-adapter.mjs` | adapter | the ties data layer, `canSee`, `inspectorFor`, `readWorn`; the module socket |
| `conduit.mjs`, `token-hud.mjs`, `look-menu.mjs`, `sheet.mjs`, `overlay.mjs`, `worn.mjs`, `item-marks.mjs` | feature | `install(reg, ctx)` / `uninstall()` each |
| `attributes.mjs`, `study.mjs` → `study/*.mjs`, `facts.mjs`, `known-data.mjs`, `relay.mjs` | domain | the attribute layer, the study conduit, subject facts, Known data, the relay |
| `*-ui.mjs`, `*-app.mjs`, `*-dialog.mjs`, `editor.mjs`, `popups.mjs` | ui | tabs, windows, cards |
| `ties-api.mjs` | compat | one-release barrel over core, adapter and settings |
| `lang/en.json`, `styles/ties.css` | | strings (nested under `PENTARYN_TIES`), styles (`.pentaryn-ties`, `.pt-*`) |

Import direction is the blueprint's; the exceptions are `test/graph-allow.json`, each with why.

## Tests

`node test/run.mjs` from this folder (`make foundry-ties-check` runs it with the other gates): every
`test/*.test.mjs` under `node --test`, then the self-running `test/known.mjs`, `look.mjs` and
`reach.mjs`. The characterisation goldens in `test/golden/` were frozen at the wave-3 checkpoint; a
refactor must leave them unchanged. Synthetic world in `test/fixtures/world.mjs`.

## Sync

`make foundry-ties-sync`, then reload (F5) — `.mjs`, `.css` and `lang/` are read on load. A
`module.json` change needs a Foundry restart. Live smoke: `game.pentaryn.ties.selftest()`,
`describe().version` equals the module version, `inspect(<a PC>)` reads.
