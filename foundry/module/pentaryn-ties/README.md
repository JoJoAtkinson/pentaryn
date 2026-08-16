# Pentaryn NPC Ties

Who knows who — recorded on the actor, edited on the sheet, painted on the canvas.

Hover a token, press the **Ties** key (`8` by default), and everyone that person knows *who is in
sight* is labelled on the map. Press again to clear.

**Players get this too, for their own character.** With a table of thirty NPCs, "who can I actually
talk to?" is a real question, and this answers it without the GM reading out a list.

**Client-only.** The overlay is a PIXI container and a DOM layer that exist in one browser. Nothing
crosses the socket.

---

## What a tie is

A **directed** edge stored on the actor:

```js
actor.flags["pentaryn-ties"].ties = [
  { id: "<actorId>", name: "Vasca Orrin", word: "hire", stance: 1, strength: 3, notes: "" }
]
```

**An actor's array says what THAT ACTOR is to each person listed.** Piet's array holds
`{ brellin, word: "understudy" }`, so hovering Piet labels Brellin's token **understudy**. Hover
Brellin instead and Piet's token reads **maestro**. You are always playing the person under the
cursor, and every badge tells you what you are to them.

| Field | | |
| ----- | - | - |
| `word` | free text, one word ideally | *sister · rival · client · understudy* |
| `stance` | −2 … +2 | hostile · wary · **neutral** · friendly · devoted |
| `strength` | 1 … 5 | how much they matter — drives badge size and opacity |
| `notes` | prose, up to 4000 chars | the long version — never on a badge, only on the sheet and on cards |
| `name` | cached copy | so a deleted actor degrades to a greyed row instead of vanishing |

**Stance 0 is not the same as no entry.** A grey dot means *they know each other and it's neutral*;
no entry at all means no badge. Absence is information.

## Notes

The one-word label is what you need mid-scene; the notes are what you need when a player asks a
question you didn't plan for. Click the **pin** at the end of a row to unfold a textarea: how they
met, what is owed, what neither of them says out loud. A filled-in pin means there is prose behind
it, so you can read the column at a glance.

**Notes never reach a badge.** The badge on the canvas is a dot and a word — that is the point: the
map stays legible while the detail stays one key away. Notes do appear on a **card** (`Shift+8`),
which is a panel you opened deliberately and can drag out of the way.

Notes save as you type (and again on blur), so closing the sheet mid-sentence doesn't lose the
paragraph. Deleting a tie deletes its notes, and the confirmation says so when there is prose to
lose.

Notes are **not mirrored**. Like `word`, they are written from one side's point of view — Piet's
notes about Brellin are Piet's, and Brellin's row for Piet starts blank. Copying the paragraph
across would just create two versions of it to keep in sync. From a script:
`game.pentaryn.ties.setNotes(actor, targetId, text)`, or pass `notes` / `reverseNotes` to `set()`.

## Using it

| | |
| - | - |
| **Canvas** | Hover a token, press a Ties key. Same person and mode again clears; a different person or mode swaps; empty space clears |
| **Sheet** | A **Ties** tab on the actor sheet. Edit inline — changes save on change, there's no submit button to forget |
| **Header** | A people-arrows button in the sheet header opens the same editor in a window |
| **Console** | `game.pentaryn.ties.read(actor)` · `.set(a, b, {word, stance, strength, notes})` · `.setNotes(a, bId, text)` · `.show()` · `.cards()` · `.edit(actor)` |

By default, adding or removing a tie writes **both directions**. Untick *"Also write the matching
tie"* to make a deliberately one-sided one — he thinks they're friends, she doesn't. (A player only
ever writes their own side; the checkbox isn't offered to them, because the server would refuse it.)

## On the canvas

Two keys, two levels of noise. Both take whoever is hovered — or, for a player who has nothing
selected, their own token if it is the only one they own on the scene.

| Key | | |
| - | - | - |
| **`8`** | *a word each* | `● understudy` under every tied token in sight. Terse enough for a crowd |
| **`Shift+8`** | *cards* | A popup per connection: the token's own art, the word, the name, and the notes |

**Near and far.** Within **4 squares** (configurable) a tie is labelled where it stands. Beyond
that, a **thin line** is drawn from you to them, because a badge floating across a market square
belongs to nobody.

**Cards stick if you drag them.** A card spawned by the key is *transient*: it follows the canvas as
you pan and zoom, and the next press sweeps it away. **Drag one and it pins** — it stops following
the canvas, stops answering the key, and closes only by its own ✕. Dragging is the gesture that
means *keep this*, so that's what it does. Pinned cards survive scene changes and a reload.

## What a player can and cannot see

The feature is safe to hand to the table because of three rules, none of which is a matter of taste:

1. **Only your own character.** You can run it on a token you own; pointing at an NPC gets nothing.
   The web on screen is always *yours*.
2. **Only who you can actually see.** Every tie is tested with `Token#visible` — the same question
   the renderer already asked to decide whether to draw the token. Behind a wall, outside your
   light, or not on this scene: no badge, no line, no card. **And no notification either.** Telling
   a player "3 contacts not in sight" would hand back exactly the information the wall took away.
   If nothing is visible they are told only that nobody they know is in sight.
3. **Only your own list.** Players edit their own character's ties — it's an address book, and
   keeping it current is theirs to do. The tie *target* dropdown is filtered to actors they already
   have at least LIMITED permission on, because Foundry ships every Actor document to every client
   and an unfiltered list would name every NPC in the world.

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
> **Anything that would actually spoil the game — "Vasca is Ozmandius wearing her" — belongs in a
> GM-only journal, not in a tie note on any actor.** Use notes for what you'd be happy to read out
> if asked: how they met, what is owed, what they want. Putting a secret on the NPC's side rather
> than the PC's hides it from the *sheet*, which is worth doing, but it is a tidiness measure and
> not a lock.

Turn the whole thing back off with **Let players see their own ties** in module settings.

## Rebinding the keys

They are real Foundry keybindings, not hotbar macros: **Configure Controls → Ties**. If either is
already spoken for, rebind there. Cards are on **Shift+8 rather than 9** on purpose — hotbar slot 9
holds the `Quick View` macro, and a bare `Digit9` binding would fire both. A `Ties Web` macro is
also created once on first load for anyone who would rather drag it to a hotbar slot.

## Design notes

**Flags, not text.** JSON in, JSON out — there is no format to get wrong, so there is no parse step
to fail. `read()` is contractually forbidden from throwing: a malformed entry is dropped, a missing
field takes a default, a dead actor id renders greyed.

**The overlay is a PIXI container on `canvas.interface`**, never Drawing documents. Drawings are
world documents and would sync to every connected client — precisely the thing this feature exists
to avoid. Cards are a separate DOM layer (`#pentaryn-ties-cards`, fixed, `pointer-events: none`
except on the cards) rather than PIXI, because they need to be dragged, scrolled and read.

**Visibility is delegated, not re-implemented.** `canSee()` asks `Token#visible` and nothing else.
Re-deriving line of sight from wall geometry would be a second, subtly different answer to a
question Foundry has already answered correctly for this client — and a second thing to get wrong
every time the vision system changes.

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
