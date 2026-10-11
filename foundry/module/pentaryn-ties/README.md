# Pentaryn NPC Ties

Who knows who — recorded on the actor, edited on the sheet, shown on the canvas.

Hover a token, press the **Ties** key (`8` by default), and everyone that person knows *who is in
sight* gets a **card** over their token: their art, one word for the relationship, their name, and
your notes. Press again to sweep them away. **Drag one to keep it.**

**Players get this too, for their own character.** With a table of thirty NPCs, "who can I actually
talk to?" is a real question, and this answers it without the GM reading out a list.

**Client-only, with one exception.** The overlay is a PIXI container and a DOM layer that exist in
one browser; no card, no wire and no hover ever crosses the socket. The single exception is the
**reverse-side relay**: a player cannot write to an NPC at all, so their client asks a GM's client
to record the other half of a tie. It carries two actor ids and nothing else; who sent it comes from the server, not the message — see *Both sides*.

---

## What a tie is

A **directed** edge stored on the actor:

```js
actor.flags["pentaryn-ties"].ties = [
  { id: "<actorId>", name: "Vasca Orrin", word: "hire", stance: 1, strength: 3, notes: "" }
]
```

**An actor's array says what THAT ACTOR is to each person listed.** Piet's array holds
`{ brellin, word: "understudy" }`, so hovering Piet puts **understudy** on Brellin's card. Hover
Brellin instead and Piet's card reads **maestro**. You are always playing the person under the
cursor, and every card tells you what you are to them.

| Field | | |
| ----- | - | - |
| `word` | free text, one word ideally | *sister · rival · client · understudy* |
| `stance` | −2 … +2 | hostile · wary · **neutral** · friendly · devoted. Colours the dot and the wire |
| `strength` | 1 … 5 | how much they matter — orders the list, sheet and cards alike |
| `notes` | prose, up to 4000 chars | the long version — on the sheet and on the card |
| `name` | cached copy | so a deleted actor degrades to a greyed row instead of vanishing |

**Stance 0 is not the same as no entry.** A grey dot means *they know each other and it's neutral*;
no entry at all means no card. Absence is information.

## Notes

The one-word label is what you need mid-scene; the notes are what you need when a player asks a
question you didn't plan for. **Click a row anywhere** and it opens: word, stance, strength and a
textarea for how they met, what is owed, what neither of them says out loud. The first line of the
notes shows under the name while the row is shut, so you can read the column at a glance.

Notes ride along on the card, under the name. They are only ever shown to whoever pressed the key —
a card is drawn in one browser and nothing about it crosses the socket.

Notes save as you type (and again on blur), so closing the sheet mid-sentence doesn't lose the
paragraph. Deleting a tie deletes its notes, and the confirmation says so when there is prose to
lose.

Notes are **directed**, like `word`: Piet's notes about Brellin are written from Piet's side. But
they are not *isolated* — in the tie dialog each of the word and the notes has a second box for the
other side, showing your text greyed in behind it. **Leave it blank and their side stays the same as
yours**, this save and every later one; type in it and the two have diverged, and yours stops
changing theirs. Clearing the box re-links them. Identity is the whole mechanism: two sides that say
the same thing *are* linked, two that differ are not, and there is no hidden flag to disagree with
what you can read. From a script: `game.pentaryn.ties.setNotes(actor, targetId, text)`.

## Using it

| | |
| - | - |
| **Canvas** | Hover a token, press **`8`**. Same person again clears; a different person swaps; empty space clears |
| **Canvas** | Select your own token, hover somebody else, press **`7`** — that one tie, on its own |
| **Canvas** | Hover a token, press **`9`** — who that person *is*, from their description. **GM only** |
| **Sheet** | A **Ties** tab on the actor sheet. Rows read at a glance — portrait, name, the word, the stance, how strong, and the first line of your notes. **Click a row anywhere** and it opens: word, stance, strength and notes, editable in place, saving as you type. Click again to shut it |
| **Map** | Hover anyone and press **`6`**. The token you hover becomes the person the tie is **to**, and you pick whose list it goes on — unless they are the only character you can write on, in which case they become the person it is **from** and you pick who it is to. The **token HUD** has the same button, on any token whose HUD you can open |
| **Map** | Hover anyone you can see and press **`5`** — their page in *your* character's notebook opens, started for you if it is new. Three tokens of one goblin are one page. Whose notebook: the token you have selected, else the character you are assigned, else the only one you own here |
| **Sheet** | A **Known** tab beside it, on **character** sheets only — the notebook (below) |
| **Header** | A people-arrows button in the sheet header opens the same panel in a window |
| **Console** | `game.pentaryn.ties.read(actor)` · `.inbound(actor)` *(GM)* · `.set(a, b, {word, stance, strength, notes})` · `.setNotes(a, bId, text)` · `.show()` · `.edit(actor)` · `.known.read(actor)` · `.known.add(actor, who)` · `.known.file(token)` · `.known.remove(actor, id)` |

**Both sides, without anyone being told about permissions.** Recording a tie writes your side and
seeds theirs — if their side is blank, or still says what yours said, it follows; once it says
something different it is theirs and yours stops touching it. A player cannot write to an NPC at
all (Foundry refuses it), so their client asks a GM's client to do that half — and over that hop
the rule is narrower: **blank is filled, written text is never touched**, because deciding "still
says what yours said" would mean trusting the asking client about what yours used to say. It is silent either
way, and it needs a GM online: with nobody to ask, their own side still saves, and the next Save
from anyone on that pair completes it.

**What a player can see on the panel.** Their own character's list only — but that list shows
each tied actor's **name and portrait**, whether or not they have permission on that actor. This
is deliberate: the row has always shown the cached name, and the face is the same category of
disclosure on a list the GM curated. It follows that **a face or a name that would spoil the game
must not be given a tie on a player's character** — and not a GM-only journal either, which is no
more private (see the box below). Keep it out of the world.

Adding or removing a tie works on **both directions**. Removing takes the matching row with it. A
one-sided tie — he thinks they're friends, she doesn't — is made by diverging the second box, or
simply by editing only one side.

## On the canvas

**One key: `8`.** It takes whoever is hovered — or, for a player who has nothing selected, their own
token if it is the only one they own on the scene. Every tie in sight gets a card over their token:
the token's own art, the word, the name, the notes.

**Cards stick if you drag them.** A card spawned by the key is *transient*: it follows the canvas as
you pan and zoom, and the next press sweeps it away. **Drag one and it pins** — it stops following
the canvas, stops answering the key, and closes only by its own ✕. Dragging is the gesture that
means *keep this*, so that's what it does. Pinned cards survive scene changes and a reload.

**A wire keeps every card attached to its person.** Two ways a card and its token come apart, so two
wires, both thin and stance-coloured:

- **reach** — the tie stands more than **4 squares** away (configurable), so the card is floating
  over a token on the far side of the market. The wire runs from *your* token to theirs.
- **leash** — you dragged the card to a corner. The wire runs from the card back to whoever it is
  about, so a memo parked by the edge of the screen still points at a person.

Wires are rebuilt from whatever cards are actually on screen, every pan and every change — so a card
can never be up without the line that explains it, and a pinned card gets its leash back after a
reload or a scene change. A tie who walks behind a wall loses their wire mid-pan.

## What a player can and cannot see

The feature is safe to hand to the table because of three rules, none of which is a matter of taste:

1. **Only your own character.** You can run it on a token you own; pointing at an NPC gets nothing.
   The web on screen is always *yours*.
2. **Only who you can actually see.** Every tie is tested with **`Token#isVisible`** — the same
   question the renderer already asked to decide whether to draw the token. Behind a wall, outside
   your light, or not on this scene: no card, no wire. **And no notification either.** Telling a
   player "3 contacts not in sight" would hand back exactly the information the wall took away.
   If nothing is visible they are told only that nobody they know is in sight.
3. **Only your own list.** Players edit their own character's ties — it's an address book, and
   keeping it current is theirs to do. Target lists are filtered: from a **sheet**, to actors they
   already have at least LIMITED permission on, because Foundry ships every Actor document to every
   client and an unfiltered list would name every NPC in the world; from the **canvas**, to tokens
   that pass `Token#isVisible`, and a token they do not own is named by its *token* name, so a
   disguise stays a disguise.

> ### ⚠ Tie notes are not a secrets store
>
> **Verified on v14, as a logged-in player:** Foundry ships *every* Actor document — flags and all —
> to *every* connected client, including actors at permission NONE that don't even appear in their
> sidebar. A player who opens devtools can read the ties, words and notes on any actor in the world,
> whatever this module's UI shows them.
>
> So the three rules above govern **what is presented**, which is what stops accidental reading and
> shoulder-surfing. They are not an access-control boundary, and nothing client-side could be one.
>
> **Anything that would actually spoil the game — "Vasca is Ozmandius wearing her" — must not be
> written into the world at all.** Not as a tie note, and **not in a GM-only journal**: measured in
> a live world from a player's own session, their client holds 9 journals, 4 of them at permission
> level 0, and the full text of one that is hidden from their sidebar reads straight out of the
> console. A compendium marked "not visible" to them still serves its whole index and every
> document on request. Foundry's server does no ownership filtering when it hands documents out.
>
> Use notes for what you'd be happy to read out if asked: how they met, what is owed, what they
> want. Putting a secret on the NPC's side rather than the PC's hides it from the *sheet*, which is
> worth doing, but it is a tidiness measure and not a lock. A real secret lives in your own notes,
> outside the VTT, and reaches the table by being said.
>
> This is a deliberate, accepted trade: it is a game among friends, and hardening it against people
> who are not attacking it would buy nothing.

Turn the whole thing back off with **Let players see their own ties** in module settings.

## Attributes — one shared registry

An attribute is a **universal truth shared by every actor that carries it**: one world-setting
registry, one entry per attribute, and an edit to an entry changes it for every carrier.

**Names are unique, ignoring case, accents, whitespace and punctuation** — the same folding ids
get, so "Goblin Guild", "goblin guild" and "Göblin-Guild" are one name. This holds **on rename
too**: a title edit that would give an entry another entry's name is refused with a warning and
the title is left unchanged, and a new entry whose name matches a *renamed* entry is refused even
though its derived id differs. Recasing an entry's own name is always allowed. Add a number
(`Goblin Guild 2`) to mean a different one.

From the console (`const A = game.pentaryn.ties.attributes`), the simple path is **ensure, then
link by name**:

```js
await A.ensure("Goblin Guild", { category: "guild", parent: "Ardenhaven" }); // existing one, untouched — or created
await A.link(actor, "Goblin Guild");    // writes its ancestors too; a typo is refused, never created
```

- **Id or name, everywhere.** `link`, `unlink`, `update`, `remove`, `tell`, `repair`, `stale`,
  `lookup` and `parent` all take an id, a name or an entry (`describe` is a deprecated alias of
  `lookup` until S8). Exact id wins, then a derived id,
  then a unique name. A miss is `notFound`; a legacy duplicate name is `ambiguous`. `A.resolve(ref)`
  answers "which one?" without doing anything.
- **`create` is strict** (a taken name is `collision`); **`ensure` is get-or-create**. Both take
  the whole entry (`parent`, `dc`, `secret`, `whenKnown`, `reveal`, …) in one call.
- **Writes return `{ ok, reason?, … }`, never a bare boolean, never a throw.** `{ ok: false }` is
  truthy — test `.ok`.
- **Links from an unlinked token's sheet land on the world actor.** `A.broken(actor)` lists both
  missing ancestors and dangling ids.

Full usage: [`context/foundry/attributes.md`](../../../context/foundry/attributes.md).

### Review panel (GM)

The **tag icon** in the left toolbar's token tools opens **Attribute Review**: every registry entry
in one flat list, unreviewed first with an amber outline. It is a review and text-edit tool —
title, category, skill, DC, reveal, miss (the failure text — shown to the player on a failed roll,
exactly like a pass; empty means a failure shows nothing) and each lore row's text can be edited (an edit there
never changes review state — only the Reviewed button signs off); ids, parents, links, lore rows and new entries are changed by prompting
Claude. Each row has a **Reviewed** button and a select checkbox; the ticks live in the GM's user
flag `attrSelected` and are read with `A.selected()`.

Every entry carries `createdAt / modifiedAt / reviewedAt` (epoch ms or `null`), `touched`, and
`reviewedSnapshot` (the content at the last sign-off, diffed in the panel). Registry writes are
queued one at a time.
`A.update`/`A.create` stamp them and **un-review** the entry, recording which fields changed; a
no-op update writes nothing. API: `openReview()`, `selected()`, `select(refs, {replace})`,
`deselect(refs)`, `clearSelection()`, `review(ref)`, `unreview(ref)`, `unreviewed()`.
Usage for Claude: [`context/foundry/attribute-review.md`](../../../context/foundry/attribute-review.md).

## Known — the notebook tab (0.11.0, the key 0.12.0)

**A second tab, on character sheets only.** Ties answer *who does this person know*; Known answers
*what has my character learned about the people and creatures they have met* — one entry per world
actor, filed under a category, with a page of prose that belongs to the player.

```js
flags["pentaryn-ties"].known = [
  { id: "<actorId>", name: "Goblin", category: "beasts", notes: "", when: 1755900000000 }
]
```

| | |
| - | - |
| **Adding** | Two doors. On the map, hover whoever is in front of you and press **`5`**: the page opens, written if it was new, with the cursor already in it. On the tab, **Add…** for anyone this character could have met, on the scene or not — players see only actors they hold LIMITED on, the same filter the tie dialog's picker uses. The key has no LIMITED filter of its own and does not need one: seeing them is the permission |
| **Refusing** | The key does nothing on a token you cannot see (`Token#isVisible` — GM-hidden, behind a wall, out of your light), nothing on your own character, and nothing on empty floor — **all three say the same sentence**, deliberately, so the key can never be waved at the dark to find out what is standing in it. With no character to write in it says so instead |
| **Filing** | Two categories to start — **Sentient** and **Beasts**. A new entry lands in one automatically: a player character or a `humanoid` is sentient, every other creature type is a beast, and an actor with nothing readable behind it is sentient. Change it in the row |
| **Order** | By category, then the order they were written down — the date on the right of each row is when it was first filed, and nothing you do later moves it |
| **Writing** | Click a row to open it; the prose saves as you type, up to 8000 characters. Bigger than a tie note on purpose: the Study roll will one day *append* to this field |
| **Names** | Same rule as a tie row — the live actor's name and portrait when it resolves, the cached name when it does not, so a deleted actor greys out instead of vanishing. **Anything that would spoil the game must not be reachable as an entry**, exactly as with ties |

An NPC has no Known tab: it is a player's notebook, and an NPC does not keep one.

**This is phases 1 and 2 of a longer design** — `context/plans/foundry-encounter-log.md`. Still to
come, all additive and none of them changing the schema above: GM lore rows for individuals, and the
automatic Past Encounters chronicle that will feed this list.

## Study — "what is this?" (0.13.0)

Open an entry and press **What is this?**. Your character makes one knowledge check about that
creature's **kind**, and whatever it clears is written into your notebook in your own copy of the
GM's words. **One attempt per kind, ever** — no retry on a bad roll; that is the whole shape of it.

| | |
| - | - |
| **The skill** | Chosen for you from the creature's type, off the PHB's own **Areas of Knowledge** table (Study, Rules Glossary): Arcana for aberrations, constructs, elementals, fey and monstrosities; History for giants and humanoids; Nature for beasts, dragons, oozes and plants; Religion for celestials, fiends and undead. A creature with no type at all takes History |
| **The ladder** | **15** buys the description · **20** adds what it shrugs off · **25** adds its real attacks and damage. Under 15 you still get *something* — every rung delivers. The DCs are a house rule; the installed DMG has no monster-knowledge rule anywhere to borrow |
| **Kind, not individual** | Studying Grix the Gutter-King teaches you what a *goblin* is, and the text lands on the **Goblin** page — created for you if you had not filed one. Grix's own row says so. A plain monster is its own kind, so for a stock goblin the two are one row |
| **You never see the roll** | It is thrown **blind, on the GM's own computer**. You see "privately rolled some dice" and one line in chat saying a check was made and about whom. No total, no DC, no pass or fail, and no 3D dice |
| **…and the answer may be wrong** | That is the feature. The GM can write a different description for each rung, and a low one is allowed to be confidently false. A natural 1 can read exactly like a triumph — you will not know, and neither will your notes |
| **In a fight** | It costs your action. The module says so and asks; it does not enforce it — the action economy is the GM's table to run |
| **No GM online, no roll** | Nothing queues. A blind, arbitrated roll needs an arbiter |
| **No content, no button** | A creature with no description, no authored rungs and no attacks shows nothing to press — which also tells the GM which monsters still want writing |

### For the GM

The authoring surface is phase 4's; for now it is the console. Everything below is GM-only and
refuses politely for anyone else.

```js
const G = game.actors.getName("Goblin"), B = game.actors.getName("Ballad Quinn");

game.pentaryn.ties.study.tiers(G, [                 // author the ladder; sparse, any rung may be
  { min: 0,  text: "Some kind of grubby child in a helmet." },   // omitted, and any rung may lie
  { min: 15, text: "A hobgoblin runt. They fear fire above all things." },
  { min: 25, text: "A goblin. Feywild-born, and it hates a closed door." }
]);
game.pentaryn.ties.study.kind(actor);      // dialog: point a named NPC at the actor that is its kind
game.pentaryn.ties.study.hold(G, true);    // hold this kind's reveals for approval (null = inherit)
game.pentaryn.ties.study.beliefs(G);       // what each character was told, and whether it landed
game.pentaryn.ties.study.pending();        // every undelivered reveal in the world
game.pentaryn.ties.study.deliver(B, G);    // release one
game.pentaryn.ties.study.reset(B, G);      // un-spend the roll — the honest do-over
```

A rung with no authored text falls back to prose derived from the sheet itself, which is always
true because it is read off the real stat block. Enrichers are resolved before anything is copied
— a Monster Manual attack becomes "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing
damage" — and if one cannot be resolved the line degrades to the item's plain name rather than
pasting `[[/attack extended]]` into somebody's notebook. Derived description is capped: a Monster
Manual biography is the creature's whole lore page, not a paragraph, so it is cut with an ellipsis.
**Write the rungs.** The derived text only keeps a creature rollable until you do.

**The inspect window (0.17.0).** The flask button on the token HUD (GM only; also
`study.preview(npc)`) opens on **Player view**: everything that NPC could hand a player who passed
every check, drawn with the Known tab's own cards — identification reveals root → leaf, attribute
lore, the NPC's own lore, the kind study at tier 25. Under each card, one switch per PC (first
name) plus **Share with all** — on = passed or told, amber = held, off with a red edge = failed or
locked. Clicking an off switch shares (writes what a pass writes, marked as told, plus a
content-free whisper to the owners); clicking a *told* one forgets the share (`study.forget`); a
rolled pass can't be un-learned and a held roll waits for Deliver. The switches update live while
the window is open. A shared identification unlocks the rungs beneath it for the recipient's next
Inspect, even over an earlier failure; it never grants the children. **Simulate rolls** is the original preview, unchanged —
random rolls, odds, Reroll, nothing saved. Console: `study.share(spec, pcs, {from, notify})`,
`study.forget(spec, pc)`, `study.whoKnows(spec, pc)`; see `context/foundry/attributes.md`.

**The approval gate.** With *Hold every reveal for my approval* on (world setting, or per-kind via
`study.hold`), a completed roll parks its answer and prompts you with **Deliver** or **Later**.
There is no Deny: the check passed, and taking a success back is what `reset` is for, in the open.
While it waits the player sees exactly what a plain failure looks like — the chat line, the button
gone, and nothing else. The roll is spent the moment the dice fall, held or not, so nothing about
the delay says which way it went.

**What is genuinely hidden, and what only looks it.** The total, the DC, the rungs they did not buy
and your words for them are never sent to a player's computer — that is real. Everything else is the
module's standing rule: **a monster's stat block is already on every player's machine**, and a flag
is readable with devtools. Write the rungs for players who want to play, not against players who
want to cheat; the same table honesty that lets people report their own dice covers this too.

## Worn — the GM-only possession marker (0.5.0)

For the villain who wears one host per scene. Right-click a token, press the **masks** button on
the HUD (GM only), fill in who is inside and a note:

```js
token.flags["pentaryn-ties"].worn = { by: "Ozmandius the Unmade", note: "free prose" }
```

**On the token, not the actor** — a placed token exists on exactly one scene, so the same inn map
can hold Harl-who-is-Oz tonight and plain Harl tomorrow without anything to remember to clean up.
Not an Active Effect, not a status icon, not an item: all of those render to players or outlive
the scene. And it carries **no stats** — the host keeps their own sheet, because the wearer gets
nothing but the host's own stat block.

The GM (and only the GM) sees a small violet-ringed badge on the token's corner with the wearer's
initial, and the note on that person's ties card, under the tie notes. The ties themselves are
deliberately untouched — the host's own connections keep showing, because that standing is exactly
what the wearer is exploiting.

Set and clear from the HUD dialog, or from a script: `game.pentaryn.ties.worn(token)` ·
`.setWorn(token, {by, note})` · `.clearWorn(token)` · `.wornDialog(token)`.

> Same caveat as tie notes: token documents, flags included, are synced to every client, so a
> player with devtools open can read the mark. Every render path is GM-gated, which stops
> shoulder-surfing — it is not a lock. Keep the note to what a leak could survive; a real secret
> does not go into the world at all, a GM journal included.

## Description card — key `9` (GM only) (0.7.0)

The other two keys answer *what are these two people to each other*. This one answers **who is this
person at all**, which is the question a crowd scene actually raises: a room of lodgers is exactly
where the ties layer has nothing to say, because most of them have no tie to anybody yet.

Hover a token, press **`9`**: a window with the actor's art and their written description, enriched
so links and rolls in the biography work. **Open Full Sheet** is one button away. Same toggle
grammar as the tie keys — same person again closes it, a different person swaps, empty space
dismisses. Hover beats selection, so you never have to click away from whoever you are running.

**There is no player half, and that is the point.** `7` and `8` are readable by a player for their
own character because their ties are their character's own memory. A biography is *prep* — the card
reads `system.details.biography.value`, the private field — so the keybinding is `restricted` and
every entry point re-checks `isGM`. Falls back to the public biography only when the private one was
never filled in.

`game.pentaryn.ties.describe()` · `.closeDescription()`

> **Why the dialog has no default button.** Foundry's `KeyboardManager.hasFocus` returns `true` for
> a focused `<button>` that lives in a form — and DialogV2 renders its buttons in one, then focuses
> the default. With a default button set, opening the card silently suppressed *every* keybinding,
> so the second press of `9` never reached the handler and the card could only be closed with the
> mouse. The fix is two-part: no `default: true`, plus an explicit blur on render, and a keydown
> listener on the window itself for the case where you click a button and hand focus back to it.
> Verified both ways — focus released (`hasFocus: false`) and the local listener closing the card
> while focus is trapped on the Close button.


> **This replaces the `Quick View` macro.** It was the same feature, but a macro's key lives in a
> hotbar slot, and a hotbar slot is one stray drag from empty — the binding did not survive a
> reboot. A registered keybinding does. The old macro still works if it is still in the world;
> nothing depends on it any more.

## Rebinding the key

They're real Foundry keybindings, not hotbar macros: **Configure Controls → Ties**. If `5` through
`9` are already spoken for, rebind them there — the tab's own hint reads whatever they are bound to
now, so it cannot go stale on you. Number keys were chosen over letters because Foundry
and dnd5e already own most of the alphabet, and `5`–`9` collide with nothing but hotbar slots. A `Ties Web` macro is also created once on first load for anyone who
would rather drag it to a hotbar slot.

> **0.4.0 dropped the second key.** 0.3.0 had bare `8` for a one-word badge under each token and
> `Shift+8` for cards. Cards won at the table, so they moved onto `8` and the badge mode was removed
> rather than left in as a setting nobody would pick. The keybinding kept its internal id, so a
> custom binding survives the upgrade — only what it does has changed.

## Design notes

**Flags, not text.** JSON in, JSON out — there is no format to get wrong, so there is no parse step
to fail. `read()` is contractually forbidden from throwing: a malformed entry is dropped, a missing
field takes a default, a dead actor id renders greyed.

**Cards are DOM, wires are PIXI.** Cards live in their own fixed layer (`#pentaryn-ties-cards`,
`pointer-events: none` except on the cards) because they need to be dragged, scrolled and read. The
wires are a single `PIXI.Graphics` on `canvas.interface` — never Drawing documents, which are world
documents and would sync one player's web to every connected client.

**Wires are derived, not tracked.** `drawWires()` clears the whole layer and rebuilds it from
`Cards.live()`, coalesced to one repaint per frame. There is no per-card line handle to keep in step,
so "card on screen with no line" is not a state the code can reach — which it *was*, in 0.3.0, where
the lines belonged to a toggle that a pinned card could outlive.

**Visibility is delegated, not re-implemented.** `canSee()` asks **`Token#isVisible`** and nothing
else. Re-deriving line of sight from wall geometry would be a second, subtly different answer to a
question Foundry has already answered correctly for this client — and a second thing to get wrong
every time the vision system changes. (It must be `isVisible`; on v14 `Token#visible` is the
inherited PIXI flag and reads `true` for walled-off and GM-hidden tokens alike.)

**Sheet injection is best-effort.** dnd5e's sheets are ApplicationV2 with
`nav.tabs[data-group="primary"]` and a `div.tab-body`; the tab appends one nav item and one
`section[data-tab="ties"]`, then lets the sheet's own `changeTab()` drive activation. Tabs are
independent of each other, so this does not interfere with tabs added by anything else.

Two things can stop it appearing, and neither breaks anything:

- **A module that replaces the actor sheet** (Tidy 5e and similar) renders different markup, so
  there is no `nav.tabs` / `div.tab-body` to append to. Injection bails silently.
- **dnd5e restructuring its own sheet** in a future release. Same outcome.

In both cases the sheet is untouched and the **header button still opens the editor**. The
`Show the Ties tab` client setting is the manual escape hatch if the tab ever renders somewhere
ugly under a different sheet.

**No `world`-scope flags.** Data lives under this module's own id so it can't collide in a shared
world. Pre-module data on `flags.world.ties` is migrated once, automatically, on first ready.

## Compatibility

Foundry **v13+**, verified on **v14** (14.369). **dnd5e 6.0+**, verified on **6.0.6** (declared in
`module.json` → `relationships.systems`). Ties themselves touch no system data; the Known/Study side
reads `details.race`/`background` and rolls through dnd5e's `rollSkill`, and the sheet tab is
written against dnd5e's sheet markup (unchanged from 5.x in 6.0.6) but degrades to the header
button anywhere else.

## Double-click to look (2026-10-07)

**What a player does:** double-click a creature they can see and don't own. A small menu opens
with **Take a closer look**, which runs the same `Study.inspect` as the 4 key and the HUD eye.
Since 0.19.3 it also carries **Add or edit a tie** (the 6 key) and **Write about them in my
notebook** (the 5 key), so neither writing action is keyboard-only.

**Why it exists:** core gives a player no Token HUD and no double-click handler on someone else's
token, so the hover key was the only door. Joe double-clicked Marrith as Caven and got nothing.

**How it behaves:**

- **Where it listens:** on the canvas element, reading `canvas.tokens.hover`. That means it only
  fires for a token this client can see.
- **Who gets it:** players only. The GM keeps the HUD.
- **Item piles:** corpses and chests keep their own double-click and get no menu.
- **Same for every target:** the menu is identical whoever you click.
- **Closing:** an outside click, Escape, or panning the canvas closes it.

## The player's Look window (0.18.0, 2026-10-07)

**What a player sees:** taking a closer look now also opens a small read-only window,
*"<name> — what you know"*. It holds the facts that character has actually been given about that
person, drawn with the Known tab's own cards and in the order the GM's inspect window uses: who
they belong to, what that tells you, facts about them, what they are. There are no switches, no
DCs, no totals, and no sign of a pass or a failure.

**How it opens:** all three doors open it first and then inspect: the double-click menu's
**Take a closer look**, the **4** key, and the HUD eye. The double-click menu also has a second
item, **What I know about them**, which opens the window without inspecting. That means no stub
card and no roll. One window per character and subject: opening it again brings it to the front.
`game.pentaryn.ties.study.look(subject, pc?)` does the same from the console. A GM gets no
window; they have the flask.

**The rule:** a card shows only if its key is in the character's `granted` flag. That flag is
written only when something is delivered or a GM tells them. Identification cards and attribute
cards also need the subject to be identified and released as a carrier on this subject, which is
the Known tab's own secrecy filter. So a failed, held, locked or in-flight fact is simply absent.
"Nothing learned" and "nothing arrived yet" print the same line. The card text is the grant
record, never the authored reveal.

**Live:** the window refreshes ~150 ms after writes land (a grant, a Share/Forget, a Deliver, a
registry edit). It repaints only when the HTML actually changes, so a failed roll's ledger write
changes nothing on screen.

**Files:** `look.mjs` (the window), `facts.mjs` (gathers a subject's facts, shared with the GM
preview), and `factOrder`/`factKeyOf` in `known-core.mjs` (pure, fixtured in `test/known.mjs`).
The GM preview's Player view now builds its list from the same helper; its output is unchanged.

## Item marks (0.19.0, 2026-10-07)

`item-marks.mjs` draws a small icon after an item's name on every actor sheet: spells, features and inventory. It's a sign the player can't miss, for example the flame on each of Marrith's spells changed by her fire curse.

```js
item.setFlag("pentaryn-ties", "mark", { icon: "fa-fire", tip: "Hover text", color: "#ff7a1a" })
```

All fields are optional; the default is an orange flame (`.pt-item-mark` in `styles/ties.css`). Remove a mark with `item.unsetFlag("pentaryn-ties", "mark")`. Hook: `renderBaseActorSheet`.

## 0.19.1 (2026-10-10, Foundry 14.369)

- The flag-scope guard (`touchesFlagScope`) also recognises 14.369's "delete all of this module's data" update form (`flags.-=ties`).
- Blind Study rolls set the Dice So Nice flag `skip` (what DSN 6.4.4 reads), so they no longer animate on the GM's screen.

## 0.19.2 (2026-10-10, dnd5e 6.0.6)

- Blind Study rolls pass their roll mode through `foundry.dice.Roll._mapLegacyRollMode`. dnd5e 6 hands `rollMode` to core as the `messageMode`, which only accepts the new keys (`blind`, `gm`, `public`, `self`); the legacy `"blindroll"` was silently replaced by the client default, so the Study card and its Dice So Nice animation would have gone public. Registered as `dnd5e-legacy-roll-modes` in `foundry/adjustments.yml`.
- `module.json` now requires dnd5e 6.0+ (verified 6.0.6). Nothing else changed for 6: sheet selectors, `details.race`/`background` and the `rollSkill` signature are the same in 6.0.6, and the Dice So Nice `skip` flag still holds.

## 0.19.4 (2026-10-10, usability run, Area 7 re-run)

- **The inspect window's Share switches are the table's PCs only** (`tablePCs` in `known-core.mjs`,
  fixtured in `test/known.mjs`): each player's assigned character, plus every character of a player
  who has not picked one. Transformed copies (dnd5e `isPolymorphed`, e.g. "Caven Calderon
  (Allosaurus)") are left out, so a share can no longer land on a form that vanishes on revert.
  Two PCs with one first name show their whole names. The same list feeds the Simulate roller.
  U-7-3 in `context/plans/usability-changes-2026-10.md`.

## 0.19.3 (2026-10-10, usability run)

- **Fixed: a closer look from a non-active scene rolled nothing.** `canReach` (the one reach rule,
  `ties-api.mjs`) checked the active scene and the **GM's own** `canvas.scene`, because it runs on
  the GM's client. A player viewing any other scene (pulled there, or a test scene) got the stub
  card and the tempo line, then a silent refusal (`inspect refused: … cannot see …` in the GM's
  console only). It now reads the asking user's `viewedScene`. Same rule for Study and the tie
  relay. Fixtured in `test/reach.mjs`.
- The player's double-click menu gains **Add or edit a tie** and **Write about them in my
  notebook** (U-7-1 in `context/plans/usability-changes-2026-10.md`).
