# Pentaryn Creatures

**Read this when:** a player can't find a creature they control (a summon, familiar, skeleton,
Arcane Eye, steed), a creature glows when it shouldn't (or doesn't when it should), the
"Your creatures" strip is missing or wrong, a player can't summon ("You must have 'Create New
Actors' permission in order to summon directly from a compendium"), or summon copies pile up loose
in "Player Characters" or the Actors root.

Table feedback 2026-10-08, item C3. Four parts, one module: a creature light, owners always see
their own tokens, the "Your creatures" strip, and the summon library (0.2.0, feedback
Swrl5M/UQSJ0v/dkt5PG, 2026-10-19; filing and the security review, 0.3.0).

## What the player sees

### Creature light

Every token a player controls whose actor is a creature gets a small bright light, so it never
disappears in the dark and the player can see where to click.

- **Who gets it:** the actor is type `npc` and some non-GM user owns it (`actor.hasPlayerOwner`):
  summons, familiars, Animate Dead skeletons, Arcane Eye, steeds.
- **Who never does:** player characters, Wild Shape/Polymorph forms included (dnd5e keeps the
  type), so darkness still means something; groups, vehicles, Item Piles piles; `pentaryn-aoe`
  spell-area handles (an `npc` every player owns: every template would glow otherwise).
- **Never replaces a light.** A creature that already has one (a torch, a flame sphere, a hand-set
  light, a `pentaryn-senses` item light) is left alone.
- **Only removes its own light**, and only if it is still exactly what we wrote. **Someone else's
  light wins:** if ours is replaced, we drop the flag; if the creature goes dark again, it gets ours back.
- **Switching it off by hand sticks.** Light 0 in Token Config sets the flag to `false`: never relit.
  To hand it back, as the GM: `token.document.unsetFlag("pentaryn-creatures", "light")`.
- **When it updates:** on `ready` (every scene), token create, token updates touching light, actor,
  delta or flags; actor ownership or type changes; user role changes. Plain movement is ignored.
  Changes are written at most 200 ms after the first one.
- Foundry v14 measures token light from the token's **edge**, so 5 ft also lights the ring of
  squares around it. A GM-hidden token casts no light (core) until revealed.

### Owners always see their own tokens

A token you own stays drawn on your screen even when nothing you control can see it (an Invisible
Arcane Eye in darkness while your PC is selected).

- Core's answer first; only when core says "not visible" do we add **true** for a token the user
  owns. The override never takes anything away.
- **Still hidden:** GM-hidden tokens; the token-config preview; filtered-out tokens; tokens on
  another level (`_testCulled`); everything, for the GM; `pentaryn-aoe` handles.
- An Invisible token keeps core's shimmer. `pentaryn-ties`' "can I see it" follows the override.

### "Your creatures" strip

A row of round portraits just above the hotbar, one per token the player owns on the viewed scene.

- **Click:** select and pan (shift adds to the selection; the token layer is switched on first).
  **Double-click:** the sheet. **Hover:** the name and both gestures.
- **Order:** the player's character first (gold ring; its Wild Shape form, `flags.dnd5e.originalActor`,
  counts as it), other characters they own, then the rest, each by name. Selected: orange glow.
- **Shows** only to players, only while they own **2 or more** tokens on the scene. **Left out:**
  GM-hidden tokens, Item Piles piles, `pentaryn-aoe` handles, tokens without an actor.
- **Nothing is stored:** it is recomputed on token create/delete/updates that change name, image,
  hiding, actor or flags (not a move), on scene change, on actor ownership/name/image changes and
  the user's character change — at most 60 ms after the first change (a burst draws once).
- **Over the Combat HUD (U-6-12):** while Argon's HUD covers the hotbar the strip floats 8 px above
  its action bar, left-aligned, and drops back when it closes (twice a second, only while shown,
  `floatOverHud` on and Argon enabled).

### Summon library

Every compendium summon a character makes (Mage Hand, Light, Arcane Eye, a steed, a Find Familiar
pick, a DDB summon) is a world copy filed in `PC Summons & Forms/<First name> — summons & forms`,
owned by the character's owners. dnd5e reuses that copy on every later summon, so the library fills
up as the players play. Two ways in:

- **A player who may create actors** (at this table everyone: since 2026-10-19 all players are
  **Trusted**, which has Create New Actors here because the server is behind a Google login) — dnd5e
  imports the copy itself, into the character's own folder (or the root), owned by the caster
  alone. **0.3.0:** right after the summon (`dnd5e.postSummon`) the copy is filed: moved to the
  library folder (made if missing), flagged `flags.pentaryn-creatures.library`, the character's
  other owners added, and a linked copy given dnd5e's summon origin so dnd5e can reuse it. A
  player's client asks the active GM (`fileLibrary`, relay); a GM client does it itself. With no GM
  online the copy stays loose until the GM runs `fileLibrary()`.
- **A player who may not** (Player role; a fallback here) — dnd5e refused: "You must have 'Create New
  Actors' permission…". The wrap on `Actor5e.fetchExisting` catches **only that refusal** (any other
  dnd5e error is shown as it is) and the active GM makes the copy, already filed (`summonActor`).
  Needs a GM online the first time; without one: "Could not summon: a GM must be logged in…".
- **What the GM will copy for a player:** only for the owner of the summoning character; never a
  player character; only a source the player may already see in full (a world actor at Observer, a
  compendium they may observe — never a hidden pack); and only what the item can summon (a profile's
  uuid, or for a CR summon a compendium NPC within CR and types), judged by the **item's compendium
  original** when it has one: a player can edit their own item's profiles or CR, the original they
  cannot. Anything else is refused with the reason.

## Settings

| Setting | Key | Scope | Default | What |
|---|---|---|---|---|
| Creature light (ft) | `lightRadius` | world | 5 | bright = dim radius; **0.5** ≈ its own square; **0** removes every light this module added |
| Players always see their own tokens | `ownerSees` | world | on | the owner override |
| Strip floats above the Combat HUD | `floatOverHud` | world | on | off: stays above the hotbar |
| Show the "Your creatures" strip | `showStrip` | client | on | this client's strip |
| Summon library for players | `summonLibrary` | world | on | the relay and the filing; off: dnd5e's refusal, nothing filed |

Every read is live: a change applies without a reload. Labels: `PENTARYN_CREATURES.settings.<key>.name/hint`.

## API — game.pentaryn.creatures

Also `game.modules.get("pentaryn-creatures").api`; published at `ready`, frozen, with the kit's
`describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`. Nothing is GM-only to
read; every write runs only on the active GM's client.

- `list(user?, scene?)` → `{ id, name, img, rank }[]`: the strip's entries for a user (default this
  client's) on a scene (default the viewed one); either a document or its id, uuid or exact name.
  As the GM with a player's user: what they'd see. `[]` without a scene.
- `render()`: redraw this client's strip.
- `isCreature(tokenDoc)` → boolean: would this token get the light? (A placeable answers through its document.)
- `syncScene(scene, ids?)`, `syncAll()` → `Promise<number>`: active GM only (0 elsewhere); re-run
  the light pass, resolve to tokens written. A missing scene rejects `BAD_ARGS` / `NOT_FOUND`; `ids`
  is an array, Set, one id or token documents. `syncAll` keeps going past a failing scene (one warning).
- `ownerSees(token)` → boolean: would the override show this token to me?
- `patchedWith()` → `"libWrapper"`, `"direct"` or `null` (the `isVisible` getter was not found).
- `status()` → `{ patchedWith, ownerSees, lightRadius, showStrip, floatOverHud, summonLibrary,
  summonPatched, writer, lit, version }`: `summonPatched` is how `fetchExisting` is wrapped (`null`:
  dnd5e not found), `writer` whether this client writes lights, `lit` tokens carrying our light flag.
- `inspect(ref, { sceneId?, as? })` → `{ token, actorType, qualifies, light, ourLight, switchedOff,
  ownerSees, inStrip }`: one token, read-only; a miss throws `NOT_FOUND`. `as` picks whose strip.
- `summonActor({ uuid, item, dryRun? })` → `{ ok, actorId, name, created, folderId? }` or `{ ok: false,
  code, reason }`: the relay write (query `pentaryn-creatures.summonActor`). `uuid` the creature, `item`
  the summoning item's uuid. `NO_GM` when no GM is connected, `REFUSED` per the rules above.
  Idempotent: the copy's id is fixed per character and creature.
- `fileLibrary({ actor?, item?, summoner?, dryRun? })` → `{ ok, dryRun, filed: [{ id, name, summoner,
  folder, changes }], already, unresolved: [{ id, name, reason }] }` (0.3.0; query
  `pentaryn-creatures.fileLibrary`). A player files one copy they own for the item that summoned it.
  The GM may pass `{ actor, summoner }` (the character's id or exact name) to file one by hand, or
  **nothing to sweep**: every `isAutoImported` copy, its summoner taken from the library flag, dnd5e's
  summon origin, or else the one character that shares a player owner with the copy and has an item
  that can summon it. Anything else is listed `unresolved` (no live player owner, more than one
  candidate). One batch; idempotent (a filed copy writes nothing); owners are only added.
- `library(ref)` → `{ actor, folder, summons: [{ id, name, source }] }`: a character's library (the
  copies flagged for it and everything in its folder), as this client sees it.
- `core`: a frozen copy of the pure module.

## Data written

| Where | What |
|---|---|
| token `light.bright`, `light.dim` | the creature light (= `lightRadius`), or 0 when we take ours away |
| token `flags.pentaryn-creatures.light` | `{bright, dim}` ours · `false` switched off by hand, never relit · `null` not ours |
| Actor (relay copy) | made by the active GM: the source's data, `ownership` = `default: 0` + the character's owners + the sender, `folder`, `_stats.compendiumSource` (or `duplicateSource`), `flags.dnd5e.isAutoImported`, `flags.dnd5e.summon.origin` (linked source: the item's uuid), `flags.pentaryn-creatures.library` = the character's id |
| Actor (dnd5e's own copy, filed) | `folder`, `ownership.<owner>` = 3 for the character's owners (never removed), `flags.pentaryn-creatures.library`, `flags.dnd5e.summon.origin` (linked copy, item known) |
| Folder `PC Summons & Forms`, `<First name> — summons & forms` | made only when missing (an existing folder of that name is used) |

Our token writes carry `{ pentarynCreatures: true }`, so our own `updateToken` hook skips them.

## Flags other modules read

Read, never written (`describe().flags.reads`):

| Flag | Owner | Why |
|---|---|---|
| `flags.pentaryn-aoe.handle` (token), `flags.pentaryn-aoe.handleActor` (actor) | pentaryn-aoe | a spell-area handle is a prop (a hand copy of aoe's `isHandleTarget` without its `doc.token` branch: `isAoeHandle`) |
| `flags.item-piles.data.enabled` (token or actor) | Item Piles | piles get no light and no portrait |
| `flags.dnd5e.originalActor` (actor) | dnd5e | a Wild Shape form ranks as its PC in the strip |

**Other writers of `token.light`:** pentaryn-senses (`itemLight` / `itemLightPrior`), and
transform's Starry Form through senses; each owns its light through its own flag (Pitfalls).

## Events

None of its own; the kit fires `pentaryn-creatures.ready` `(api)` and `pentaryn.ready`
`("creatures", api, { when: "ready" })`. Listens to (pinned in `test/golden/hooks.json`, in order):
`createToken`, `updateToken`, `updateActor`, `createUser`, `updateUser`, `deleteUser` (the light);
`canvasReady`, `createToken`, `deleteToken`, `updateToken`, `updateActor`, `updateUser`,
`controlToken` (the strip); `init`, `setup` (owner-sees), `setup` (the wrap), `dnd5e.postSummon`
(filing; dnd5e fires it on the summoning client only), `ready`, `ready`. Queries, registered on
every client (relay: any sender, the active GM answers): `pentaryn-creatures.summonActor`,
`pentaryn-creatures.fileLibrary`.

## Patches and adjustments

| Patch (`describe().patches`) | Adjustments row | What |
|---|---|---|
| `Actor5e.fetchExisting` (dnd5e, static) | `creatures-summon-library` | libWrapper `WRAPPER` on `dnd5e.documents.Actor5e.fetchExisting`, else direct; marker `__pentarynCreaturesSummon`. dnd5e runs first; only its Create New Actors refusal, on a player during a summon, goes to the GM. The row also covers the `dnd5e.postSummon` filing |
| `Token#isVisible` (getter) | `creatures-libwrapper` | libWrapper `WRAPPER` when lib-wrapper is active, else the getter is replaced; marker `__pentarynCreaturesVisible`. Reads private `_preview._previewType`, `isFilteredOut`, `_testCulled()` |
| — (not patches) | `argon-creatures-strip-float`, `itempiles-creatures-pile-flag` | the Argon DOM read in `strip.mjs`; the Item Piles flag read |

## Two sessions / who writes

- **The lights:** the active GM's client only (no fallback). Two tabs on the GM account may send
  the same update; harmless, `lightUpdate` is idempotent.
- **Visibility and the strip:** every client, no writes.
- **The library:** a player's client asks, the active GM's client writes — and the query reaches
  every tab of the GM account (bridge and browser), so both answer. The relay copy and its folders
  have deterministic ids (`core.libraryActorId`, `libraryFolderId`, `libraryRootId`): the server
  refuses the second tab's create (the id exists) and that tab finds the first one's document by id
  and answers with it. Filing is an idempotent update (the same data from both tabs).

## Extending

A pure rule → `creatures-core.mjs` with a test (every export is `api.core`, pinned in
`test/golden/surface.json`: a declared API change). A hook → `reg.on(...)` in the feature's
`install()`; order matters, re-pin `hooks.json` as a declared change. A setting → a row in
`settings.mjs` (literal `name`/`hint`), react through `ctx.onSettingChange`. An API method → a row in
`api-manifest.mjs` + `api.mjs`, then `GOLDEN_UPDATE=1 node --test test/api.test.mjs`. Another
module's flag → a predicate in core, read through an adapter, listed in `MANIFEST.flags.reads`.

## Pitfalls

- **The orphan light (senses hand-off).** We light a summon 5/5; senses writes its item light over
  it, we let go; senses later restores the prior 5/5 unflagged. Nobody owns it: if the summon stops
  qualifying it keeps burning. Pinned in `test/golden/senses-handoff.json`; arbitration is a decision.
- **A library copy is a snapshot** of the compendium entry. Delete it and the next summon makes a
  fresh one. Players see (and may delete) their copies in the Actors sidebar: harmless.
- **The sweep guesses** only when one character fits; a copy whose owner is a deleted user, or a
  user with two characters that can both summon it, stays loose — file it with `{ actor, summoner }`.
- **An item edited away from its compendium original** (a GM-customised profile pointing at another
  compendium creature) refuses that creature to a Player-role user; a world-actor pointer still works.
- An owner-override failure answers `false` and warns once per session (`owner override failed`).
- **Turning it off:** set *Creature light* to **0** first, with the GM logged in, then disable the
  module — the lights are written to the tokens. (dnd5e 6 moved nothing this module reads.)

## Files

| File | Role |
|---|---|
| `creatures.mjs` | entry: wiring only |
| `creatures-core.mjs` | pure rules and constants: light, owner-sees, strip order, dock, seams, the library |
| `settings.mjs` | the `SETTINGS` table, `setting()` |
| `tokens-adapter.mjs` | TokenDocument → plain summary (the foreign flag reads) |
| `light.mjs` · `owner-sees.mjs` · `creature-strip.mjs` | features: the light queue · the `isVisible` wrap · when the strip redraws |
| `summons.mjs` | feature: the library (the `fetchExisting` wrap, the GM relay, `postSummon` filing, the sweep, `library`) |
| `summons-adapter.mjs` | dnd5e summon activities / source / copy → plain data; the copy's create data |
| `strip.mjs` | UI: the strip's DOM and the Combat HUD dock |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/creatures.css` · `lib/` | the strip (`#pentaryn-creatures.pcr-strip`) · the vendored kit (never edited here) |

## Tests

`node test/run.mjs` from this folder: the legacy core suite, core seams, the glue on a GM and a
player client (each declared change's pin moved in its own commit), the patch paths, the dock poll,
the hook manifest, the API goldens, the summon library (`test/summons.test.mjs`: relay, refusals,
the two-tab race, filing, the sweep), i18n and CSS scope. Synthetic fixtures (`test/` ships with the
module). One golden: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then review the diff.
Gates: `vendor.py check creatures`, `conformance.py --module creatures`.

**Verify live (as a player with two owned tokens):** the strip shows; an Invisible owned token stays
drawn; `status().patchedWith` is not `null`. **Library:** cast Mage Hand as a Trusted player with a
GM online: the copy lands in `PC Summons & Forms/<name> — summons & forms`; cast again: no new actor.
As the GM: `await game.pentaryn.creatures.fileLibrary({ dryRun: true })` lists loose copies.

## Sync

`.mjs`, `.css`, `lang/`: a reload; `module.json` (and the first install): a Foundry restart.
