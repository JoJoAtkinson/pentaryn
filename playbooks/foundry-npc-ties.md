---
created: 2026-08-15
last-modified: 2026-08-15
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design"]
status: agreed — building
---

# NPC Ties — design plan

> **Goal.** Hover an NPC, press **8**, and every token on the map that relates to them gets a badge:
> a coloured dot for stance, one word for the relationship, and their name — so the GM can
> role-play the room instantly, without opening a sheet and without the players seeing anything.
>
> **Status: decisions made 2026-08-15, building phases 1–2.** Open questions resolved at the bottom.

Companion to [`twenty-one-social-map.md`](../oneshots/twenty-one-social-map.md), which is the
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
the end of the row. It exists so the badge can stay a single word: `word` is what you need mid-scene,
`notes` is what you need when a player asks something you didn't plan for. **It renders on the sheet
only and never on the canvas** — the moment prose reaches a badge, the map stops being readable at a
glance, which is the one thing this feature is for. Like `word` it is directed and **not mirrored**;
copying a paragraph onto the other actor just makes two versions to keep in sync.

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
array, and the badge under Vasca reads **understudy** — what Piet is to her. Hover Vasca instead and
the badge under Piet reads **manager**. You are always role-playing the person under the cursor, and
every badge tells you what you are to them.

This also makes the renderer trivial: **one array read, no cross-lookups.**

### 3. Stance is a **number**, not a colour

```
+2 devoted    bright green
+1 friendly   green
 0 neutral    grey  — they know each other. No entry at all = no badge
-1 wary       amber
-2 hostile    red
```

Storing `-2..+2` rather than `"ally"/"foe"` means colour is a *render* decision. Adding a sixth
shade later, or recolouring the whole scheme, never touches stored data.

### 4. `strength` reuses the social map's **1–5**

Already authored in [`twenty-one-social-map.md`](../oneshots/twenty-one-social-map.md), so importing
is free. It drives **badge opacity and size** — a `5` reads loud, a `2` is a whisper. That gives the
overlay depth without another concept to remember.

### 5. Full names. No short-name system.

Badges show `actor.name` verbatim. **Decided against** a `short` field and an honorific-stripping
heuristic — it was a second thing to maintain, a second thing to get wrong on *Widow Cress* and
*Guard-Lieutenant Rees*, and the badge has room. If a name is ever too long on the canvas, fix that
one actor's name.

---

## Display: a client-side PIXI overlay

**Client-side, always.** A `PIXI.Container` on `canvas.interface` — and, for cards, a DOM layer —
exists only in the browser that drew it. Nothing is sent over the socket, so there is no permission
flag to get wrong and nothing to leak.

> ⚠ **Do not use Drawing documents.** Drawings are world documents — they sync to every connected
> client, which would put one player's web on everyone's screen.

Each badge, drawn under its token: `● word Name`

**The `8` interaction mirrors `9` exactly**, so the muscle memory transfers:

| Press 8 while… | Result |
| -------------- | ------ |
| hovering someone | show their web |
| hovering the same person again | clear |
| hovering someone else | swap — never two webs at once |
| hovering nothing, web up | clear |
| hovering nothing, nothing up | warn |

### Amended in 0.3.0: **players run this too**

The original plan was GM-only, gated on `if (!game.user.isGM) return;`. That was the wrong shape for
a one-shot with thirty NPCs, where the question the players actually need answered is *who can I
walk up to and talk to?* — and answering it out loud, per player, per scene, does not scale.

So the GM gate is replaced by **three narrower rules**, and the second one is the interesting one:

1. **Only your own character.** `permitted()` requires `actor.isOwner`. A player pointing at an NPC
   gets nothing, so the web is always theirs.
2. **Only who they can already see.** Every tie is filtered through `Token#visible` — *the same test
   the renderer used to decide whether to draw that token at all*. This is the whole trick: line of
   sight is not re-derived from wall geometry, it is **asked of the system that already computed it,
   per client**. A second implementation would be a second answer, and one of them would be wrong.
   Behind a wall means no badge, no line, no card — **and no notification**, since "3 contacts not
   in sight" hands straight back what the wall just took away.
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

### Near, far, and the second key

Related actors **not on the current scene**, or not visible, get nothing. Beyond
`nearDistance` (4 squares, configurable) a visible tie gets a **thin line** from the hovered token to
theirs instead of an orphaned label — at that range a badge floating in a market square belongs to
nobody.

`Shift+8` swaps badges for **cards**: token art, word, name, notes. A card follows the canvas until
you **drag** it, at which point it pins — stops following, stops answering the key, closes only by
its ✕. Dragging is the gesture that means *keep this*. (Shift+8 rather than 9: slot 9 is Quick View
below, and a bare `Digit9` binding would fire both.)

---

## Where the code lives: **macros. No module, no restart.**

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

**This avoids the Foundry restart** that [`foundry-ops.md`](foundry-ops.md) §5 warns about, keeps
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
| Which direction? | **What the hovered person is to the badged person.** See §2 |
| Can players use it? | **No.** `isGM` gate plus a client-only overlay — see Display |
| Short names? | **Dropped.** Full names, always |
| Module or macro? | **Macro.** No hooks needed, so no module and no restart |
| In-game editor? | **Later.** Ship the JSON hidden first; phase 3 adds the tab-style editor once the data has proved itself |
| Cover PCs too? | Same mechanism, no extra work. Add party ties whenever you want them |

---

## Unrelated finding

`foundry-ops.md` §5 says **five** modules are installed. There are now **21 active** — Joe installed
the rest alongside map packs bought from the Foundry site (`eledryll-*`, `mad-endlesswiz*`,
`theripper-premium-hub`) plus their dependencies (`levels`, `wall-height`, `betterroofs`,
`monks-active-tiles`, `multi-token-edit`, `scene-packer`, `tile-scroll`, `lib-wrapper`).
**That section needs refreshing.**

`levels` + `wall-height` matter here: the opera house is a genuine multi-level scene, so badge
rendering should respect elevation or it will draw floor-2 tokens over floor-1 ones.
