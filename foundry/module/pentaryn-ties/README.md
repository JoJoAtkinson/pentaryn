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
| **Header** | A people-arrows button in the sheet header opens the same panel in a window |
| **Console** | `game.pentaryn.ties.read(actor)` · `.inbound(actor)` *(GM)* · `.set(a, b, {word, stance, strength, notes})` · `.setNotes(a, bId, text)` · `.show()` · `.edit(actor)` |

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

They're real Foundry keybindings, not hotbar macros: **Configure Controls → Ties**. If `7`, `8` or
`9` are already spoken for, rebind them there. Number keys were chosen over letters because Foundry
and dnd5e already own most of the alphabet, and `7`/`8`/`9` collide with nothing but hotbar slots. A `Ties Web` macro is also created once on first load for anyone who
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

Foundry **v13+**, verified on **v14**. System-agnostic — nothing here touches system data. The sheet
tab is written against dnd5e 5.x markup but degrades to the header button anywhere else.
