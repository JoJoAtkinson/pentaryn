---
created: 2026-08-15
last-modified: 2026-08-16
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design"]
status: shipped — 0.4.0
---

# NPC Ties — design plan

**Read this when:** changing or extending the `pentaryn-ties` module. **Design doc.** To *use* ties at the table, read the module's own README at `foundry/module/pentaryn-ties/README.md`.
**Not this file:** current possession marks in play → [`../space-journey.md`](../space-journey.md)

> **Goal.** Hover an NPC, press **8**, and every token on the map that relates to them gets a card:
> a coloured dot for stance, one word for the relationship, their name, their token art and your
> notes — so the GM can role-play the room instantly, without opening a sheet.
>
> **0.5.0 — the Worn mark.** A **per-scene, GM-only possession marker**, stored on the
> **TokenDocument** (`token.flags["pentaryn-ties"].worn = { by, note }`), never on the actor.
> A placed token lives on exactly one scene, so per-token *is* per-scene for free. Set it from the
> Token HUD (masks-theater button, GM only) or `game.pentaryn.ties.setWorn(token, {by, note})`.
> Renders as a small violet badge on canvas and a block on the ties card, every path `isGM`-gated.
>
> **Why not a condition or an Active Effect:** status icons render to players, and on the actor they
> persist into every scene that actor appears in. The Space Journey villain wears a different NPC
> each scene and two consecutive scenes share one map — an actor-level marker bleeds between them.
>
> **Why the ties themselves must NOT change:** the villain inherits the host's stat block, skills,
> standing *and relationships*, and spends them against the party. The graph should keep saying
> "Fenna". The mark is the only thing layered on top.
>
> ⚠ **Token flags sync to every client.** Hidden from the UI, not encrypted — a player with devtools
> could read it, exactly as with tie notes. Accepted and documented. If a secret ever must be
> genuinely unreadable, it needs a GM-owned journal keyed by token id.

> **Status: shipped, 0.4.0.** Built as a module after all (see the correction in *Where the code
> lives*). Open questions resolved at the bottom; two of the original decisions were overturned in
> play and are marked as such.

Companion to [`twenty-one-social-map.md`](../../oneshots/twenty-one-social-map.md), which is the
hand-authored version of the same data.

---

## What this Foundry already gives us

Probed live on **v14.365 / dnd5e 5.3.3**, 72 actors:

| Need | Built-in | Verdict |
| ---- | -------- | ------- |
| Structured per-actor data | **Document flags** (`actor.flags.world.*`) — `world` scope already in use | ✅ use it |
| A window to edit in | **ApplicationV2** + **HandlebarsApplicationMixin** + **DialogV2** all present | ✅ use it |
| A permanent home in the UI | **`game.settings.registerMenu`** | ✅ use it |
| GM-only canvas drawing | **PIXI** + `canvas.interface` | ✅ use it |
| Hover / select events | `hoverToken`, `controlToken` hooks | ✅ use it |
| An existing module that does this | **none installed, none found** | build it |

**Nothing here needs a new dependency.** `lib-wrapper` is available if we ever need to wrap core
behaviour, but this design never does.

---

## The five decisions

### 1. Storage: flags, not text. **No parsing, ever.**

```js
actor.flags.world.ties = [
  { id: "<actorId>", name: "Vasca Orrin", word: "manager", stance: 1, strength: 4 }
]
```

Flags are JSON in and JSON out. There is no format to get wrong, so there is no parse step to fail —
which is the whole ask. `name` is stored **redundantly** so a deleted or re-imported actor degrades
to a greyed-out entry instead of silently vanishing.

**Robustness contract** — the reader must never throw:

- not an array → treat as `[]`
- entry missing `id` → skip
- `id` resolves to nothing → render greyed using the cached `name`
- `word` missing → render the dot alone
- `stance` absent or out of range → clamp to `0`
- `notes` not a string → treat as `""`; longer than 4000 chars → truncate

*Rejected: parsing the biography.* Fragile, and the whole point is to stop doing that.

**`notes` — the long version, added in 0.2.0.** A free-prose field per edge, unfolded from a pin at
the end of the row. It exists so the on-canvas label can stay a single word: `word` is what you need mid-scene,
`notes` is what you need when a player asks something you didn't plan for. It renders on the sheet
and on the **card**, never as a floating canvas label — the moment prose is painted onto the map the
map stops being readable at a glance, which is the one thing this feature is for. A card is a panel
you opened deliberately and can drag out of the way, so it can carry the prose. Like `word`, notes
are directed and **not mirrored**; copying a paragraph onto the other actor just makes two versions
to keep in sync.

### 2. Edges are **directed**, and written in pairs

The relationship word is not symmetric:

| | → | word |
|---|---|---|
| Piet | → Brellin | *idol* |
| Brellin | → Piet | *understudy* |
| Cress | → Hanne | *granddaughter* |
| Hanne | → Cress | *grandmother* |

So one edit writes **both** rows, pre-filling the reverse with the same word — accept it for
symmetric ties (*brother*, *rivals*, *lovers*) or change it in the same dialog. One action, two rows,
never out of sync.

**🔑 An actor's array says what THAT ACTOR is to each person listed.** Hovering Piet reads *Piet's*
array, and the card over Vasca reads **understudy** — what Piet is to her. Hover Vasca instead and
the card over Piet reads **manager**. You are always role-playing the person under the cursor, and
every card tells you what you are to them.

This also makes the renderer trivial: **one array read, no cross-lookups.**

### 3. Stance is a **number**, not a colour

```
+2 devoted    bright green
+1 friendly   green
 0 neutral    grey  — they know each other. No entry at all = no card
-1 wary       amber
-2 hostile    red
```

Storing `-2..+2` rather than `"ally"/"foe"` means colour is a *render* decision. Adding a sixth
shade later, or recolouring the whole scheme, never touches stored data.

### 4. `strength` reuses the social map's **1–5**

Already authored in [`twenty-one-social-map.md`](../../oneshots/twenty-one-social-map.md), so importing
is free. It originally drove **badge opacity and size** — a `5` loud, a `2` a whisper. With the
badges gone (0.4.0) it drives **order**: strongest ties first, on the sheet and in the stack of
cards. Kept as a number rather than dropped, because ranking is the thing you want when a scene has
more connections than screen.

### 5. Full names. No short-name system.

Cards show `actor.name` verbatim. **Decided against** a `short` field and an honorific-stripping
heuristic — it was a second thing to maintain, a second thing to get wrong on *Widow Cress* and
*Guard-Lieutenant Rees*, and the card has room. If a name is ever too long on the canvas, fix that
one actor's name.

---

## Display: a client-side PIXI overlay

**Client-side, always.** A `PIXI.Container` on `canvas.interface` — and, for cards, a DOM layer —
exists only in the browser that drew it. Nothing is sent over the socket, so there is no permission
flag to get wrong and nothing to leak.

> ⚠ **Do not use Drawing documents.** Drawings are world documents — they sync to every connected
> client, which would put one player's web on everyone's screen.

**Amended in 0.4.0: cards, not badges.** The original render was a PIXI badge under each token —
`● word Name`. 0.3.0 added draggable DOM **cards** on a second key (`Shift+8`) carrying the token
art and the notes as well, and after a session of both, the badges were removed outright: the card
answers the same question and three more, and a mode nobody would choose is just a branch to
maintain. **One key, `8`, one thing.** The keybinding kept its internal id (`showWeb`) so a custom
binding survives the upgrade.

**The `8` interaction mirrors `9` exactly**, so the muscle memory transfers:

| Press 8 while… | Result |
| -------------- | ------ |
| hovering someone | show their web |
| hovering the same person again | clear |
| hovering someone else | swap — never two webs at once |
| hovering nothing, web up | clear |
| hovering nothing, nothing up | warn |

Dragged (**pinned**) cards are outside that table on purpose — see *Near, far, and the wires*.

### Amended in 0.3.0: **players run this too**

The original plan was GM-only, gated on `if (!game.user.isGM) return;`. That was the wrong shape for
a one-shot with thirty NPCs, where the question the players actually need answered is *who can I
walk up to and talk to?* — and answering it out loud, per player, per scene, does not scale.

So the GM gate is replaced by **three narrower rules**, and the second one is the interesting one:

1. **Only your own character.** `permitted()` requires `actor.isOwner`. A player pointing at an NPC
   gets nothing, so the web is always theirs.
2. **Only who they can already see.** Every tie is filtered through **`Token#isVisible`** — *the same
   test the renderer used to decide whether to draw that token at all*. This is the whole trick: line
   of sight is not re-derived from wall geometry, it is **asked of the system that already computed
   it, per client**. A second implementation would be a second answer, and one of them would be
   wrong. Behind a wall means no card and no wire — **and no notification**, since "3 contacts not
   in sight" hands straight back what the wall just took away.

   > ⚠ **`isVisible`, not `visible`.** On v14 `Token#visible` is the inherited PIXI DisplayObject
   > flag and reads `true` for every placeable on the scene — walled off and GM-hidden alike. The
   > first cut of this used it, and it defeated the entire rule; caught only by logging in as a
   > player and looking.
3. **Only their own list.** Players may edit their own character's ties; the add-target dropdown is
   filtered by `testUserPermission(user, "LIMITED")`. That filter is load-bearing: Foundry ships
   every Actor document to every client and merely hides them in the sidebar, so an unfiltered
   `game.actors.contents` would name every NPC in the world in a `<select>`.

### ⚠ The rules govern presentation, not access

**Tested on v14 from a real player session:** Foundry hands every client every Actor document,
flags included — even actors at permission `NONE` that are hidden from that player's sidebar
(`actor.permission === 0`, `actor.visible === false`, and `actor.flags["pentaryn-ties"].ties` still
reads out in full from devtools).

So rules 1–3 stop *accidental* seeing, which is the actual table problem — a player glancing at a
web and learning who is behind the door. They are **not** an access-control boundary, and no
client-side module could provide one.

**Anything that would spoil the game if read — "Vasca is Ozmandius wearing her" — goes in a GM-only
journal, not in a tie note on any actor.** Tie notes are for what you would happily say aloud if
asked: how they met, what is owed, what they want. Keeping a secret on the NPC's row rather than the
PC's hides it from the sheet UI, which is worth doing, but it is tidiness, not a lock.

### Near, far, and the wires

Related actors **not on the current scene**, or not visible, get nothing at all.

A card follows the canvas until you **drag** it, at which point it pins — stops following, stops
answering the key, closes only by its ✕. Dragging is the gesture that means *keep this*. Pinned
cards survive scene changes and reloads.

A card is joined to its token by a thin, stance-coloured **wire** whenever the two have come apart,
which happens in exactly two ways:

- **reach** — the tie is beyond `nearDistance` (4 squares, configurable), so the card floats over a
  token on the far side of the map. Wire runs from *your* token to theirs.
- **leash** — the card was dragged to a corner. Wire runs from the card back to its token.

> **Wires must be derived from the cards, never tracked alongside them.** 0.3.0 drew the lines into
> a PIXI layer owned by the show/clear toggle, while cards had their own lifetime — so a pinned card
> could outlive the layer and come back with no line (reported from play, 2026-08-16). 0.4.0 rebuilds
> the whole wire layer from `Cards.live()` on every change and every pan, coalesced to one repaint
> per frame. "Card on screen with no wire" is now unrepresentable rather than merely fixed.

---

## Where the code lives: ~~macros~~ **a module** — overturned

> **This section was wrong, and the build went the other way.** It is kept because the reasoning
> below is still correct *for the feature as originally scoped*; what changed is the scope. Real
> keybindings (rebindable in Configure Controls, and reachable by players), a settings menu, sheet
> injection, and a card layer that has to restore itself on `ready` all need registration at startup.
> So `pentaryn-ties` **is** a module, synced with `make foundry-ties-sync`, and Foundry only scans
> `Data/modules` at startup — the restart this section hoped to dodge is real. See
> [`foundry-ops.md`](../foundry/ops.md) §5.

The original plan called for a `pentaryn-ties` world module because hooks must register at startup.
**They don't — we don't need hooks.**

`canvas.tokens.hover` gives the hovered token synchronously at the moment the key is pressed, exactly
as the existing `Quick View` macro already does. The overlay is a toggle drawn once, not something
that follows the cursor. So:

| Piece | Home |
| ----- | ---- |
| The `8` overlay | **Macro on hotbar slot 8**, mirroring `Quick View` on slot 9 |
| The data | Actor flags, written by a seeding macro (or by me over the bridge) |
| The editor (phase 3) | A macro that opens an ApplicationV2 window — still no module |

**This avoids the Foundry restart** that [`foundry-ops.md`](../foundry/ops.md) §5 warns about, keeps
everything visible and editable in the Macro Directory, and means there is no `make …-sync` step to
forget. A module only becomes necessary if we ever want a permanent Settings-menu entry.

PIXI containers on `canvas.interface` are destroyed on scene change, so the overlay self-cleans.

---

## Build order — stop anywhere

| Phase | Delivers | Usable alone? |
| ----- | -------- | ------------- |
| **1** | Flag schema, a hardened reader, and a one-time import of the ~40 ties already written in the social map | Data exists and is queryable. No UI |
| **2** | **The `8` overlay.** The actual ask | ✅ **Yes — and you could stop here**, editing ties by re-running the importer against the markdown |
| **3** | The editor window (ApplicationV2 + settings menu): actor search, pick target, stance and word. Writes both directions | In-game editing, no repo round-trip |
| **4** | Export back to markdown so the repo doc regenerates from live data | One source of truth again |
| **5** | Off-scene panel, filter by strength, "show all foes on this map" | Polish |

**Phase 2 is the value.** Phase 3 is convenience; Phase 4 only matters if the repo doc should stay
authoritative.

---

## Decisions — resolved 2026-08-15

| Question | Decision |
| -------- | -------- |
| Neutral: grey dot or nothing? | **Grey dot for a recorded neutral; nothing at all for no entry.** Absence stays meaningful — a grey dot means *they know each other* |
| Which direction? | **What the hovered person is to the person the card is over.** See §2 |
| Can players use it? | ~~**No.**~~ **Overturned in 0.3.0 — yes, for their own character**, under the three rules in Display. The one-shot has thirty NPCs and "who can I talk to?" does not scale as a spoken answer |
| Short names? | **Dropped.** Full names, always |
| Module or macro? | ~~**Macro.**~~ **Overturned — a module.** Keybindings, settings and sheet injection all register at startup |
| Badges or cards? | **Cards, and only cards, from 0.4.0.** Both shipped in 0.3.0; the badges lost |
| In-game editor? | **Later.** Ship the JSON hidden first; phase 3 adds the tab-style editor once the data has proved itself |
| Cover PCs too? | Same mechanism, no extra work. Add party ties whenever you want them |

---

## Unrelated finding

`foundry-ops.md` §5 says **five** modules are installed. There are now **21 active** — Joe installed
the rest alongside map packs bought from the Foundry site (`eledryll-*`, `mad-endlesswiz*`,
`theripper-premium-hub`) plus their dependencies (`levels`, `wall-height`, `betterroofs`,
`monks-active-tiles`, `multi-token-edit`, `scene-packer`, `tile-scroll`, `lib-wrapper`).
**That section needs refreshing.**

`levels` + `wall-height` matter here: the opera house is a genuine multi-level scene. Cards inherit
`Token#isVisible`, which those modules already fold elevation into, so a floor-2 tie should not card
up from floor 1 — **unverified, and worth checking the first time that scene is run.**
