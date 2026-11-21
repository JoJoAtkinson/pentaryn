# Pentaryn Creatures

**Read this when:** a player can't find a creature they control (a summon, familiar, skeleton,
Arcane Eye, steed), a creature glows when it shouldn't (or doesn't when it should), the
"Your creatures" strip is missing or wrong, a player can't summon ("You must have 'Create New
Actors' permission in order to summon directly from a compendium"), or summon copies pile up loose
in "Player Characters" or the Actors root. Also: a monster that should look like a statue (a prop)
until the fight starts — **dormant until combat** (0.4.0). Also: players see too much (Charmed,
Concentrating, an enemy's Mage Armor) or too little (Bloodied) on a monster's token, or a statue gives
itself away with a marker — **public and hidden token markers** (unit N, Unreleased).

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
  online it stays loose until the GM runs `fileLibrary()`. Never re-filed: a copy filed to another
  character, or a loose one only another player owns (dnd5e reuses any copy a GM owns; `filingRefusal`).
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

### Dormant until combat (GM)

A creature that stands on the map as a prop — a statue, a suit of armour — and turns out to be a
monster when the fight starts. **Arm** a token: `await game.pentaryn.creatures.dormant("<token id>")`
(or a GM script macro over the selected tokens; the pentaryn world has one, *Dormant until combat*: disguises the selection, or wakes it when every selected token is already dormant). Its real look is stored on the token
(`flags.pentaryn-creatures.dormant.look`) and it becomes **"Statue"**: stone statue art with the ring
off, the same name and portrait on its unlinked actor (what a player's double-click Look window shows),
no nameplate or bars, and **SECRET** disposition, so a player gets no hover border, nameplate, bars,
effects or target pips and cannot hover or target it. `hidden` is never touched: show or hide it as
you like.

**When a combat it is in starts** (Begin Combat, round 1), or when it is added to a combat already
running, the active GM's client puts the stored look back by itself, clears the flag and relabels
its combatant in the tracker. Before Begin Combat nothing changes, so the tracker shows "Statue" and
its initiative roll says "Statue" — roll it while the token is hidden (a private roll) or keep it out
of the tracker until you begin. **Undo** without a fight: `wake("<token id>")`. **Re-arm** after a
test fight: `dormant` again. Other disguises: `dormant(id, { name: "Old armour", img: "<path>",
disposition: 0 })`. The flag is per token, so any token on any scene can use it; disguise names
repeat, so pass a token id or uuid, not the name.

**Size and facing (0.4.1).** The stored look also keeps the art scale and the rotation lock, and the
wake puts them back: shrink the statue (`texture.scaleX/Y`) or turn it (rotation unlocked) as you
like, and the creature still wakes at its own size and upright. To wake it bigger or smaller, set
`flags.pentaryn-creatures.dormant.look.texture.scaleX` and `scaleY` on the armed token.

**No markers while dormant (unit N).** With public and hidden markers on (below), a dormant token
shows players no status marker at all — not Bloodied, not Prone — until it wakes, so a damaged statue
does not give itself away.

### Public and hidden token markers

The line is **what you could see across a real table**. On a creature a player does not own or
observe, a status marker shows only when its row in **Configure Settings → Pentaryn Creatures →
Token markers** (GM only) is **Public**; the rest is the GM's to describe.

| Default | Statuses |
|---|---|
| **Public** | Bloodied, Dead, Unconscious, Prone, Grappled, Restrained, Paralyzed, Petrified, Stunned, Incapacitated, Sleeping, Burning, Bleeding, Flying, Hovering, Burrowing, Dodging, Transformed, Invisible |
| **GM only** | every other status: Charmed, Frightened, Poisoned, Exhaustion, Cursed, Surprised, Stable, Deafened, Blinded, Silenced, Suffocation, Hiding, Ethereal, Marked, **Concentrating**, and any status a module adds |

- **Other spell and item effects on enemies** (Mage Armor, Shield of Faith, Bless, Hex: an effect
  with no status the table knows): one row, **GM only** by default.
- **Friendly tokens show every marker**: on by default. Off: a friendly token follows the table too.
- An effect that carries several statuses shows when **any** of them is Public (Hold Person's effect
  with `paralyzed` shows).
- **A dormant token shows nothing**, friendly or not, until it wakes.
- **The GM, owners and observers always see everything**; a player always sees their own character.

It works through dnd5e's own per-viewer check (`ActiveEffect5e#isConcealed`), so a hidden marker is
missing everywhere dnd5e draws one: the token icon, the combat tracker, the sheet's effects list and
the scrolling status text. The effect data still reaches every client; only the drawing is hidden.
dnd5e's own reasons to hide an effect (an unidentified item, a disabled origin) still apply.

**Bloodied and dnd5e's setting.** With this on, Bloodied follows its own row (Public by default)
whatever dnd5e's *Bloodied* setting says, but dnd5e only **applies** Bloodied to monsters under
`dnd5e.bloodied = "all"`. So set that once: `game.settings.set("dnd5e", "bloodied", "all")` ("none"
applies it to nobody). Switch *Public and hidden token markers* off and dnd5e's rule is back
exactly as before (under "player", Bloodied hides on non-friendly tokens; every other marker public).

## Settings

| Setting | Key | Scope | Default | What |
|---|---|---|---|---|
| Creature light (ft) | `lightRadius` | world | 5 | bright = dim radius; **0.5** ≈ its own square; **0** removes every light this module added |
| Players always see their own tokens | `ownerSees` | world | on | the owner override |
| Strip floats above the Combat HUD | `floatOverHud` | world | on | off: stays above the hotbar |
| Show the "Your creatures" strip | `showStrip` | client | on | this client's strip |
| Summon library for players | `summonLibrary` | world | on | the relay and the filing; off: dnd5e's refusal, nothing filed |
| Public and hidden token markers | `markers` | world | on | the marker table; off: dnd5e's own rule only |
| Token markers (menu, GM only) | `markerTable` | world, hidden | `{}` | the menu's rows, overrides only: `{ statuses: { <id>: "public"\|"gm" }, other, friendlyAll }`; edit through the menu |

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
  summon origin (a player character's item only), or else the one character that shares a player
  owner with the copy and has an item that can summon it (a profile may name either `_stats` source).
  The GM's `{ actor, summoner }` is the override: it may move a copy filed elsewhere. Anything else is listed `unresolved` (no live player owner, more than one
  candidate). One batch; idempotent (a filed copy writes nothing); owners are only added.
- `library(ref)` → `{ actor, folder, summons: [{ id, name, source }] }`: a character's library (the
  copies flagged for it and everything in its folder), as this client sees it.
- `dormant(ref, { name?, img?, disposition?, sceneId?, dryRun? })` → `{ ok, dryRun, token, name,
  img, disposition }` (0.4.0): arm or re-arm one token (above). Re-arming keeps the look stored the
  first time. GM only (`NOT_GM`); bad options `BAD_ARGS`.
- `wake(ref, { sceneId?, dryRun? })` → `{ ok, dryRun, woke, token, name? }` (0.4.0): put the stored
  look back now; `woke: false` when the token is not dormant. GM only.
- `core`: a frozen copy of the pure module.

## Data written

| Where | What |
|---|---|
| token `light.bright`, `light.dim` | the creature light (= `lightRadius`), or 0 when we take ours away |
| token `flags.pentaryn-creatures.light` | `{bright, dim}` ours · `false` switched off by hand, never relit · `null` not ours |
| Actor (relay copy) | made by the active GM: the source's data, `ownership` = `default: 0` + the character's owners + the sender, `folder`, `_stats.compendiumSource` (or `duplicateSource`), `flags.dnd5e.isAutoImported`, `flags.dnd5e.summon.origin` (linked source: the item's uuid), `flags.pentaryn-creatures.library` = the character's id |
| Actor (dnd5e's own copy, filed) | `folder`, `ownership.<owner>` = 3 for the character's owners (never removed), `flags.pentaryn-creatures.library`, `flags.dnd5e.summon.origin` (linked copy, item known) |
| Folder `PC Summons & Forms`, `<First name> — summons & forms` | made only when missing (an existing folder of that name is used) |
| token `name`, `displayName`, `displayBars`, `disposition`, `texture.src`, `ring`, `delta.name`, `delta.img` | the dormant disguise, and on waking the stored look |
| token `texture.scaleX/Y`, `lockRotation` | on waking only, from the stored look (0.4.1) |
| token `flags.pentaryn-creatures.dormant` | `{ look, disguise }` while dormant · `null` once awake |
| Combatant `name`, `img` | on waking, only where they still show the disguise (core derives them once) |

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
(filing; dnd5e fires it on the summoning client only), `updateCombat`, `createCombatant` (dormant
until combat: core fires `combatStart` only on the client that began the combat, so the round change
is the trigger), `setup` (the markers wrap), `updateToken` (a dormant flag or disposition change
redraws that token's markers), `ready`, `ready`. Queries, registered on
every client (relay: any sender, the active GM answers): `pentaryn-creatures.summonActor`,
`pentaryn-creatures.fileLibrary`.

## Patches and adjustments

| Patch (`describe().patches`) | Adjustments row | What |
|---|---|---|
| `Actor5e.fetchExisting` (dnd5e, static) | `creatures-summon-library` | libWrapper `WRAPPER` on `dnd5e.documents.Actor5e.fetchExisting`, else direct; marker `__pentarynCreaturesSummon`. dnd5e runs first; only its Create New Actors refusal, on a player during a summon, goes to the GM. The row also covers the `dnd5e.postSummon` filing |
| `Token#isVisible` (getter) | `creatures-libwrapper` | libWrapper `WRAPPER` when lib-wrapper is active, else the getter is replaced; marker `__pentarynCreaturesVisible`. Reads private `_preview._previewType`, `isFilteredOut`, `_testCulled()` |
| `ActiveEffect5e#isConcealed` (dnd5e, getter) | `creatures-dnd5e-effect-isconcealed` | libWrapper `WRAPPER` on `CONFIG.ActiveEffect.documentClass.prototype.isConcealed`, else the getter is replaced; marker `__pentarynCreaturesConcealed`. dnd5e runs first; for a non-observing player its Bloodied rule is replaced by the table and `concealFor` is added. Never throws (a failure answers dnd5e's value and warns once, `marker check failed`) |
| — (not patches) | `argon-creatures-strip-float`, `itempiles-creatures-pile-flag` | the Argon DOM read in `strip.mjs`; the Item Piles flag read |

## Two sessions / who writes

- **The lights:** the active GM's client only (no fallback). Two tabs on the GM account may send
  the same update; harmless, `lightUpdate` is idempotent.
- **Visibility and the strip:** every client, no writes.
- **Dormant tokens:** the active GM's client wakes them (no fallback: with no GM online they wake on
  the next round change after one connects). A second tab on that account writes the same values.
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
| `dormant.mjs` | feature: dormant until combat (`arm`/`wake`, the combat triggers) |
| `markers.mjs` · `markers-menu.mjs` | feature: public and hidden markers (the `isConcealed` wrap, the redraws) · UI: the Token markers menu |
| `summons-adapter.mjs` | dnd5e summon activities / source / copy → plain data; the copy's create data |
| `strip.mjs` | UI: the strip's DOM and the Combat HUD dock |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/creatures.css` · `lib/` | the strip (`#pentaryn-creatures.pcr-strip`) · the vendored kit (never edited here) |

## Tests

`node test/run.mjs` from this folder: the legacy core suite, core seams, the glue on a GM and a
player client (each declared change's pin moved in its own commit), the patch paths, the dock poll,
the hook manifest, the API goldens, the summon library (`test/summons.test.mjs`: relay, refusals,
the two-tab race, filing, the sweep), the markers (`test/markers.test.mjs`: `concealFor` pinned in
`test/golden/conceal.json`; `test/glue-markers*.test.mjs`: the wrap against dnd5e 6.1.1's rule, both
patch routes, the menu), i18n and CSS scope. Synthetic fixtures (`test/` ships with the
module). One golden: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then review the diff.
Gates: `vendor.py check creatures`, `conformance.py --module creatures`.

**Verify live (as a player with two owned tokens):** the strip shows; an Invisible owned token stays
drawn; `status().patchedWith` is not `null`. **Library:** cast Mage Hand as a Trusted player with a
GM online: the copy lands in `PC Summons & Forms/<name> — summons & forms`; cast again: no new actor.
As the GM: `await game.pentaryn.creatures.fileLibrary({ dryRun: true })` lists loose copies.
**Markers:** as the GM put Prone, Frightened, Concentrating and Mage Armor on a monster; as a player
only Prone shows on its token and in the combat tracker; make it dormant: no markers at all;
`status().markersPatched` is not `null`.

## Sync

`.mjs`, `.css`, `lang/`: a reload; `module.json` (and the first install): a Foundry restart.
