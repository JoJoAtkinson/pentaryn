---
created: 2026-08-23
last-modified: 2026-08-23
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design", "#proposal"]
status: proposed — judged 2026-08-23 from Joe's pointer sketch; resolves the GUI plan's open disguise question and unblocks encounter-log phase 5; amended same day from Joe's end-to-end walkthrough (the layer stack, the Impersonated marker, one correction to the reveal default); amended a second time same day (the GM's button pops ONE layer — overturning this doc's clear-all — with layer-identity keying, and the GM approval gate on check reveals); not built
---

# Disguise — the pointer mask

**Read this when:** building the disguise feature, or changing anything player-facing that
resolves "who is this token". **Design doc, unbuilt.** It resolves the open question in
[`foundry-npc-ties-gui.md`](foundry-npc-ties-gui.md) ("the disguise ends at the dialog") and
the phase-5 blocker in [`foundry-encounter-log.md`](foundry-encounter-log.md). The possession
marker it sits beside → `foundry/module/pentaryn-ties/worn.mjs` (the file header is its design
doc).

> **Goal, in Joe's words, condensed.** A disguise is *just a redirect / pointer*. The GM
> clicks the token and gets the **real** person's sheet — Oz — with a banner: *"disguised as
> {persona}"*, linking to that character, with a **drop disguise** button. A player gets back
> the information the pointer aims at: the persona's art, name, lore. When a player checks for
> information on the person, a **hidden roll** fires — they never know they tried — against a
> DC the GM set with the disguise. If only one player sees through it, the others must not
> find out. A wholly fictional persona is *"a token that's never placed"*: the redirect wears
> its artwork and hands out its lore. A GM-only icon in the token's corner says who is in
> hiding. And — the walkthrough's addition — a pointer can stand on a pointer: *"a bard with
> many disguises"*, each layer uncovered by its own roll, the player keeping a marked record
> per identity they saw through and *"a final real person they can continue to take notes
> on."* Later the same day, two more rulings: the GM's drop button **pops one layer**, not
> the stack — *"I want to manually clear each, my button pops one off"* — and any check can
> be flagged to **hold its reveal for GM approval**: *"give me a prompt they pass and I can
> accept it… a bool action for auto pass and dm approval on all checks… some I don't care,
> others might trigger me to give a scene and extra dialog."*

---

## Where the book corrects the sketch — verified against the installed PHB

Joe guessed Perception. The 2024 PHB's Disguise Self says otherwise: *"To discern that you
are disguised, a creature must take the **Study action** to inspect your appearance and
succeed on an **Intelligence (Investigation)** check against your spell save DC."* So the
skill is **Investigation** and the trigger is the **Study action** — the exact action the
encounter-log plan's knowledge ladder already rides. That convergence is load-bearing for
decision 4: piggybacking the disguise check on the Study gesture is not a UI shortcut, it is
the rule as written. The Disguise **Kit**'s text covers only *creating* a disguise; the
mundane detection case is unspecified in the owned books — which is why the skill is
**configurable per layer, defaulting to Investigation**, beside the DC Joe already asked for.

*(Provenance: the PHB quote and the kit-text check were verified against the installed packs
by the pass that commissioned this judgement, not re-derived here.)*

---

## Verdict: **beside `worn`, not extending it** — the pointers run opposite directions

The framing "disguise is `worn` with `by` promoted to an actor id plus a DC" is close enough
to be dangerous. Measured in the live world (all 99 scenes scanned): **six `worn` marks
exist right now**, every one of them `by: "Ozmandius the Unmade"` sitting on a token whose
`actorId` is the *host* — Halloran, Rennick, Harl (twice), Fenna, Big Ned — with prep notes
the current one-shot is being run from tonight. Those marks state the two features' true
relationship:

| | `worn` (possession) | disguise |
| --- | --- | --- |
| The token's `actorId` — the stat block that fights | the **surface** identity (the host's body; "the wearer gets nothing but the host's own stat block") | the **hidden** identity (Disguise Self changes no stats) |
| The flag names | the **hidden** identity (the wearer inside) | the **shown** identity (the persona on top) |
| What players are given | the token's actor, untouched — the host's own ties and standing are *what the wearer is exploiting* (`worn.mjs`'s stated design) | the **flag's** actor — every player-facing read redirects through the pointer |
| DC to pierce | none — a sticky note, roleplay tells only | the mark's whole mechanical point |

The shared law, stated once so nobody "unifies" these wrongly later: **the token's `actorId`
is always the stat block; the flag always names the other face; the features differ on which
face players are shown, and that difference is the feature.** Promoting `by` to an actor id
buys none of the redirect, and threading a player-facing redirect *conditionally* through the
flag that six live prep notes depend on, mid-campaign, is false economy — every consumer of
`readWorn` would grow a mode branch, and the semantics of `by` (who is *underneath*) would be
overloaded to sometimes mean who is *on top*.

**So: a sibling flag, same module, shared machinery.** `disguise.mjs` beside `worn.mjs`,
reusing the badge layer, the HUD-button and DialogV2 idioms, the hardened-reader contract and
`NOTES_MAX` — and importing rather than copying. **Existing `worn` data is untouched, byte
for byte**: no migration, no reader change, no render change. A token can even carry both
marks (a possessed host who is also disguised) — representable with two flags,
unrepresentable with one, and free.

| Extend-vs-replace, priced | Why not |
| --- | --- |
| Extend `worn` (mode inferred from `personaId` presence) | A semantic fork through every consumer; `by` means opposite things per mode; the live campaign's possession notes sit on the flag being changed |
| Replace `worn` with a general two-direction mask | Rewrites a shipped, played-in-anger feature to gain a generality with zero current users; the six marks would need migrating into a schema whose extra fields (DC, skill, persona) possession deliberately has no use for |

---

## The two-plane rule — structure is authored, knowledge is per-character

> **Added in the same-day amendment, and it is the sentence the layer stack forced into the
> open.** It was implicit in the first draft's "no auto-flip"; the stack makes it the
> design's spine, so it is stated before the decisions that lean on it.

The mark's contents — the faces, their DCs, their reveal texts — are **authored structure**,
written by the GM and **mutated only by the GM**: the stack editor, and the Drop button —
which, per Joe's second-pass ruling, *pops one layer* and is therefore itself an authoring
act (the GM pacing the public unmask), not a consequence of any roll. What a **roll**
changes is **one character's knowledge**: which layers *they* have seen through. The token's
shared rendering always shows the outermost *remaining* face, because rendering is shared
and one knower must not tell the table; a character who has pierced a layer carries that
privately — in their whisper, their Known entries, and a per-character record. **No roll
ever writes the disguise flag.** This is what makes "if only one player sees through it,
the others must not know" hold at every layer, not just the first.

And because the GM's pop *does* mutate the stack while private knowledge persists, **private
progress is keyed by layer identity, never by position**: every stack entry gets a stable
`id` at authoring time, and both the `pierced` ledger and the player-side mirror reference
that id. Depth-as-index dies here by design — a pop from the front would shift every index
and silently re-aim a knower's resolution at the wrong face; a set of layer *ids* cannot be
shifted, only made partially moot.

---

## The decisions

### 1. The token belongs to the **real** actor, wearing the persona's face

Joe's sketch already says it — clicking the token as GM opens *Oz's* sheet — and the
mechanics settle it: the disguised creature *is* the real creature. The token's `actorId`
stays the real actor; setting the disguise copies the outer persona's prototype-token
**name and texture** onto the token document (plain GM token updates, nothing exotic) and
writes the mark.

**Joe's phrasing "their token is replaced by the token of the pointer" is honoured as
appearance, not identity — and the distinction is deliberate, so it is stated rather than
left to inference.** The token *looks* replaced: name and texture become the persona's, and
"drop disguise... restores the proper token" restores both. But the token **document** is
never swapped or re-created, because literal replacement breaks everything that references
it: the Combatant holds the old `tokenId`, so initiative orphans; HP, death saves and
resource state live on the (possibly unlinked) token's actor delta, so damage taken under
the mask evaporates; active effects and conditions ride the actor and token being discarded;
every targeting reticle and template attachment points at a document that no longer exists.
A mid-combat drop under literal replacement is a small catastrophe; under the face-restore
it is one token update. Same appearance, opposite cost.

Followed through:

- **Combat is continuous.** Initiative, HP, active effects, targeting all live on the real
  actor and the placed token; neither document changes identity at set or drop. A mid-combat
  drop is a token `name`/`texture` update plus a flag clear — the Combatant's `tokenId` and
  `actorId` both still resolve. *(API knowledge, not live-tested; flagged in the ledger
  below.)*
- **Rolls are the right creature's.** The GM attacking as the disguised NPC rolls the real
  stat block with zero ceremony — Joe's "acts 100% how it's designed to work, it's just a
  pointer" lands exactly here.
- **"Drop disguise" is an icon change, not a token swap.** The mark stores `prior`
  (the token's name and texture at set time — *captured*, not re-derived from the prototype,
  because the GM may have customised the placed token); drop restores `prior` and unsets the
  flag. One button on the banner, as asked.

**Rejected: the token is the persona actor.** Players would see the persona natively with no
redirect code at all — the seductive version — but combat then rolls the wrong creature,
damage lands on the persona's sheet and must be ported by hand, mid-fight effects sit on the
wrong document, and "drop disguise" becomes delete-token-create-token, severing the
combatant, every targeting arrow, and the token's own flags. The elegance is one render rule
cheaper and every mechanical surface wronger.

### 2. The mark lives on the **token**, like `worn` — and layers live *inside* the mark

`worn`'s argument (a placed token exists on exactly one scene; a villain wears a different
face per scene; two scenes share one inn map) holds verbatim. Disguise adds a second,
harder reason: the disguise *sets the token's name and texture*, which are token-document
fields — an actor-level pointer would either rewrite prototype tokens (leaking the mask into
every future placement) or drift from what is actually on screen.

> **Amended same day — layers.** Joe's walkthrough asks for pointer-on-pointer: a bard under
> many disguises, each uncovered by its own roll. His intuition — "a pointer point to a
> pointer" — read literally means a flag on each persona **actor** pointing onward. That
> cannot work and is rejected below: the mark lives on the token *because* faces are
> per-scene, and a fictional persona **has no token anywhere** to carry the next hop — the
> chain has no surface to stand on. It would also make cycles representable (A→B→A) and turn
> resolution into a graph walk needing depth caps and cycle detection. **The layers move
> into the mark itself, as an ordered list — `stack: [outer, …, inner]` — on the one token
> that actually exists.** A list makes cycles *structurally impossible* (there is nothing to
> point back to), keeps resolution a bounded walk over a handful of entries (decision 3's
> skip-leading rule — no guards, no caps), and puts the whole chain in one place the GM can
> read top to bottom in the dialog. Joe's intent — layered identities, each
> with its own roll, each keepable as a record — survives intact; only the plumbing he
> guessed at is replaced. The single-persona case is a one-entry stack; nothing about it
> changes.

Each stack entry carries **its own DC, skill and reveal text**: the obvious authoring want
is a flimsy street disguise over a solid deep-cover identity, and one mark-level DC cannot
say that. Consequences, stated:

- The mask survives scene *switches* (it is on the scene's own token document) and lasts
  exactly as long as that placed token.
- The same cover on a second scene means setting it again there — one HUD gesture, and
  deliberate, exactly as `worn` decided.
- Two tokens of one persona (same scene or different) each carry their own mark, possibly
  with different stacks; player records dedupe on the persona id regardless (decision 3).

### 3. `apparentActorOf(token)` — the redirect, viewer-aware

The design's one real code sweep. A single function in the data layer:

```js
// the identity of a token AS THIS CLIENT'S USER should see it
apparentActorOf(token):
  GM, or a user owning the BASE actor      → baseActorOf(token)   // you know who you are
  otherwise, with a mark on the token      → walk the stack from the front, skipping every
                                             leading layer whose id is in this user's
                                             unmasked set; the first remaining layer is the
                                             face (dangling personaId → facade from that
                                             entry's cached name); all layers skipped →
                                             baseActorOf(token)
  no mark                                  → baseActorOf(token)
```

The owner carve-out is the `#facadeFor` precedent (`tie-dialog.mjs` already exempts
`actor.isOwner`), and it is what makes a **disguised PC** sane: the bard's own player sees
themself; the table sees the mask. The unmasked set is per **user** (the union of their
owned characters' knowledge — a user running two PCs cannot un-know with one of them), read
from the player-side `unmasked` mirror written at reveal time (decision 5); it is UI data,
not the lock — the lock is the GM-side ledger.

Why a *skip-leading walk* over an index: piercing is prefix-contiguous by construction (a
character can only ever roll against the layer they currently see), so skipping leading
pierced ids is exact — and it stays exact **across GM edits**. A GM pop removes the front
entry; a knower's set still holds that id (harmlessly dangling) and their walk lands where
it should. A GM who *inserts* a new outer layer in the stack editor puts an unpierced id at
the front, so everyone — knowers included — sees the new mask, which is the only reading
that makes sense of the gesture.

**Every player-facing *capture* and *read* of "who is this token" goes through it; every GM
and mechanical read keeps `baseActorOf`.** The surfaces, enumerated so none is missed:

| Surface | Today | Under the mask |
| --- | --- | --- |
| Tie dialog — clicked-token resolution and the scene target picker | `baseActorOf` + token-name facade | `apparentActorOf` for non-GM: a player's tie **aims at the face they currently believe in**. The facade machinery stays (it still covers ad-hoc renamed tokens with no mark) |
| Known filing (canvas key, phase 2 — shipped) | `baseActorOf` | `apparentActorOf` — the notebook page is about the face they met (or the layer they have reached) |
| Past Encounters row id (phase 5) | the blocker | `apparentActorOf`, name/art still cached from the screen at sighting (both halves of the §7 rule compose) |
| Canvas ties cards (key 8) on a masked token, for players | subject = base actor — would paint the **real** actor's web over the mask | subject = `apparentActorOf`. A fictional persona with no ties shows nothing ("nobody knows this stranger"), and the GM can author a cover identity's ties — the cover gets relationships on purpose |
| Study subject (phase 3) | — | the current face: its `kindOf`, `studyTiers`, lore rows — Joe's "gets the disguised lore" verbatim, per layer |
| GM sheets, `inbound()`, combat, `worn`, describe (key 9) | `baseActorOf` / the actor | unchanged |

This is what dissolves the GUI plan's blocker without touching `read()`: the ties panel
live-resolves whatever id the row stores, and the row now **stores the believed face's id**
— the player's sheet says "Harl" natively, forever, because as far as their character knows,
Harl is who they met. All three of the old options are dominated: no facade in `read()`
(option 2's cost), no refusal (option 3's cost), and option 1's curation rule survives as
the rule for *unmarked* renamed tokens only.

Records aimed at a persona stay correct even after the mask drops elsewhere — the player
knew "Harl"; their notebook says Harl; reconciling identities after a reveal is table talk
and the Impersonated marker (decision 5), never a migration. **Joe's governing rule is the
module's:** *"keep the pointer dumb. a pointer means all notes go to that person… it's up to
the player to fix their notes and figure out what was done by the real person and what was
done by the person in disguise."*

### 4. Detection: **one gesture, two blind rolls** — per layer

The sharpest interaction, and the book already answered it (above). On a masked token,
Study *does* carry two questions — "what do I know about them" (the kind ladder, about the
**current face**) and "is this a disguise" (the layer's skill vs the layer's DC). Decided:
**one affordance, two GM-side rolls.**

- The player's gesture is the roll affordance they already have — the kind/lore icons on the
  believed face's Known entry, riding the phase-3 conduit. No second "check disguise"
  button: **a visible disguise affordance is itself the leak**, announcing that a disguise
  exists.
- The conduit's GM client resolves the knowledge roll against the current face exactly as
  for any actor. Then, silently, iff this character has an unspent check against **the
  layer they currently see** (the first stack entry not in their unmasked set) and that
  layer has a DC, it also rolls the layer's skill (default `inv`) blind vs that DC.
- **A failed disguise check changes nothing about the knowledge answer** — the character
  still receives whatever tier their knowledge total bought about the face they studied,
  possibly authored-false. This is Joe's own sentence — *"when a character fails to see
  through the disguise they get the pointer's desc based on what they rolled"* — and it is
  the two-rolls design doing its job, not a special case: the two questions are independent,
  so their answers are.
- **Failure produces zero player-visible anything** beyond that knowledge answer. One
  public stub only — the study stub — because a second stub, extra latency, or any styling
  difference is the number leaking; this extends the encounter-log's indistinguishability
  contract verbatim: a Study on a masked token must be observable-identical to a Study on a
  bare one.
- **Both answers land on success.** The knowledge reveal writes as normal (they studied the
  face and learned the cover story) *and* the see-through fires (decision 5). Suppressing
  the cover lore on success would itself be a tell in the entry's shape.
- **The lock is per (mark, layer-id, character)** — one attempt at each layer, recorded
  GM-side on the **real** actor (decision 5's ledger), which no player can write — the same
  beliefs-as-lock correction the encounter-log plan already made for `studied`. Keyed by
  the layer's stable **id**, never its position, so a GM pop or reorder cannot re-arm or
  mis-aim a spent roll. Piercing a layer opens a *fresh* question (the next layer down), so
  a new roll is legal there; failing a layer locks that layer for that character until the
  GM's per-row reset. **The lock is spent at roll time, always** — under the approval gate
  (decision 8) delivery may wait, but the roll happened, and a lock spent at release would
  let a player re-roll while the GM deliberates.
- **The corners get a manual trigger.** A character who spent their kind-Study on the
  face's kind *before* this mask existed has no affordance left to ride; a player who says
  "I study his face" out loud isn't clicking anything. The GM banner (decision 7) carries
  **"Throw {character}'s check"** per character — same conduit path, GM-invoked. Insight-
  vs-behaviour stays ordinary table play; this system automates only the Study path.
- Which mark, when the face wears several: canvas-invoked rolls use the invoked token's
  mark; sheet-invoked rolls use the face's first marked token on the active scene.
- **Nothing here keys on actor type.** `kindOf`, `studyTiers` and lore rows live on any
  actor — monster, NPC, or player character alike (Joe wants the generality, and the
  encounter-log's schemas already have it; its character-sheets-only rule governs who
  *holds* notebooks, never who can be studied). A persona may itself be a character-type
  actor; `defaultCategory` already files it as Sentient.

### 5. What the one who sees through it receives — the next face, privately

> **Amended same day, and this corrects the first draft.** The draft's default reveal
> deliberately *never named* the real actor. Joe's walkthrough overrules it: on a
> see-through, *"a new record pops in as the actual person"* — the reveal must hand over an
> identity, or there is nothing to take notes on, and the layered flow ("taking notes on the
> 2nd pointer after uncovering the first") is built entirely out of that handover. The
> spoiler-control lever the old default protected **moves into the stack**: piercing a
> layer names *the next layer down*, which is whatever the GM authored there — a GM who
> does not want the truth out at depth 1 inserts an intermediate identity, instead of
> relying on a mute reveal. The per-layer `reveal` text supplements the handover
> (flavour, partial truths); it no longer gates it.

On a success against a layer, the conduit writes **the ledger first, the player-facing rest
at delivery** — which is the same moment when the layer auto-delivers, and the GM's accept
when it is held (decision 8):

*At roll time, always:* the **pierced ledger row** on the real actor (`total`, `when`,
and — new under the gate — the computed reveal payload and a `delivered` timestamp, unset
while held; success and failure alike; it is also the lock), plus a GM notification / the
approval prompt.

*At delivery:*

1. **A whispered chat card** to that player alone (GM sees its copy): *"{face} is not who
   they appear to be — beneath the mask: {next identity}"*, plus the layer's authored
   `reveal` text if set. The next identity is the next remaining layer down, or the **real
   actor** when the pierced layer was the last.
2. **The next identity's Known entry, created** (if absent) on that character, with the
   reveal written as a **granted block** (encounter-log decision 15, amended 2026-08-23:
   ~~appended under the provenance header~~ — a `mask:<actorId>:<layerId>` row in the
   character's `granted` map, rendered read-only below their notes; skill only, no numbers)
   — the private, persistent surface the module already ships, under the same
   plaintext-forever contract as every reveal. This is the record they *"continue to take
   notes on"* — their notes stay editable; what the mask told them does not.
3. **The Impersonated marker** on the pierced face's Known entry — decision 5a below.
4. **The player-side mirror**: the pierced layer's **id** added to `unmasked[markId]` on
   the character (the knowledge the whisper just gave them, recorded so `apparentActorOf`
   can resolve their view client-side; UI data, never the lock).

And nothing shared changes: token art, name, and every other player's resolution stay the
outer face. Whether and when the *table* learns stays entirely on the GM's "Drop disguise"
button — one player knowing is a scene the GM runs, not a state the module broadcasts.

#### 5a. The marker is **"Impersonated"** — doubt, not "Incognito"

Joe's ask was a tag: *"the record they had now has a tag that says 'Incognito' so the
players know that whatever notes they put on that person is on there Incognito."* The
mechanism is right and ships; **the word cannot**, and Joe's own hard case is why: he
explicitly wants disguises that point at **real** people (*"if they are disguised as a real
person, i can just point to that real person… when the real person shows up they keep all
the notes"*). Pierce that mask and the record in hand is *Fenna's* — a real identity, not
an alias; labelling it "Incognito" asserts the identity itself is a front, which is false.
Worse, the module **cannot tell the cases apart**: an invented persona and a real-but-
off-screen person are both just world actors — "never placed" is not a stored fact. So the
marker may only claim what is true in both cases: **someone was wearing this face.**

- **Schema**: one optional field on the Known entry — `imposter: <timestamp>` (absent =
  never) — set by the conduit's GM-side write at delivery on the entry for the layer just
  pierced, and by a GM **pop** (decision 7) on every character's entry for the popped face. Additive to the shipped phase-1 schema; the hardened reader defaults it
  absent. ⚠ **The write path is the trap**: `toStoredKnown` (shipped today in
  `known-core.mjs`) maps entries to a *fixed* shape and silently drops unknown fields — so
  the field must be added to **both** `readKnown` and `toStoredKnown` (plus fixtures) in
  the same change, or the first notes-edit after a reveal quietly erases the marker. Named
  here so it becomes a fixture, not a play report. **Landing slot decided 2026-08-23:** the
  encounter-log's decision-15 rework commit (the granted-region change) is where both
  functions are already being touched together — `imposter` rides it. The reveal *text*
  escaped this trap entirely: it lives in the sibling `granted` map, outside
  `toStoredKnown`'s reach by construction; `imposter` is the one genuinely per-entry field.
- **Render**: a quiet tag on the row — label "Impersonated" — tooltip in Joe's own rule:
  *"Someone was wearing this face. Your notes stay; which of them belong to the real
  {name} and which to the impostor is yours to sort out."* Notes never move, never split,
  never annotate themselves — the pointer stays dumb, verbatim.
- The marker is on the **player's own actor**, so a player could unset it with devtools —
  the settled boundary; it is their notebook.

### 6. The wholly fictional persona is an ordinary world actor, never placed

Confirmed workable with nothing new: the persona actor carries art (prototype token
texture — set-disguise copies `prototypeToken.name`/`texture.src`, paths checked live),
a name, a biography, optionally `kindOf`, `studyTiers`, lore rows — everything the redirect
and the ladder read. Its token is simply never dragged out. Authoring a cover identity *is*
authoring an actor, the same precedent the encounter-log plan set for kinds ("the import is
the authoring act") and the same rule its §7 already recommended: **a persona that matters
gets its own actor.**

**If a persona actor is later deleted**, everything degrades and nothing breaks:

- The token keeps its face — name and texture were **copied at set**, never referenced.
- The pointer dangles: `readDisguise` falls back to that entry's `personaName` (cached at
  set, ties' cached-name pattern); the banner link greys with the missing-actor idiom.
- Player rows keyed by the persona id grey out exactly like any deleted-actor tie — the
  machinery (`missing: true`, cached names) already exists on every surface.
- The hidden check still works: **DC and skill live on the stack entry, not the persona.**
- The ladder's content source is gone, so its affordance vanishes — the standing
  no-content-no-icon rule, self-announcing.

### 7. The GM surfaces: banner, badge, HUD — and what Drop does with a stack

- **Banner** — on the **real** actor's sheet, GM-only, injected best-effort like the tabs:
  one block per marked token of this actor on the current scene — the stack top to bottom
  (*"Disguised as [{outer}] over [{middle}]"*, links), each layer's DC and skill, **Drop
  disguise**, the pierced list (who has reached which depth, who tried and holds a wrong
  certainty) with per-row reset and "Throw {character}'s check". Actor sheets don't know
  tokens, so the banner scans the current scene's tokens for marks resolving to this actor
  — the `presentActorIds` scan shape, sub-millisecond.
- **Drop pops ONE layer** — ~~clears the whole stack~~, **overturned by Joe the same day**:
  *"I want to manually clear each, my button pops one off."* The first cut's reasoning
  ("rolls never wrote per-layer state, so there is nothing to pop") argued from
  implementation; Joe's ruling is about intent — the button is a *global authoring act*,
  and popping one lets the GM pace the public unmasking layer by layer, each pop a scene.
  That is consistent with the two-plane rule, not against it: the GM is the author, and
  the button edits structure the way the stack editor does. What a pop does, exactly:
  - removes `stack[0]` and applies the **next remaining layer's face** to the token (its
    cached name and the persona's prototype texture); when the last layer pops, restores
    `prior` and unsets the mark — *"restores the proper token"* is the final pop.
  - **stamps the Impersonated marker** on the popped face's Known entry for **every**
    character that has one — the public route to the same true claim the private reveal
    makes ("someone was wearing this face"); the GM client owns every actor, so the write
    is direct. It creates no entries: the newly shown face is on screen, and filing it is
    the player's gesture (or phase 5's logger).
  - **posts nothing to chat and notifies nobody.** The token changing on every client is
    self-announcing, and the whole point of pacing the pop is that the GM frames the
    scene — a module card would blurt the moment the button exists to protect.
  - **keeps the pierced ledger rows for the popped layer** — history, not garbage: "who
    was ahead of the table, and who tried and failed" is exactly what the GM wants to know
    while framing the reveal. The banner greys them rather than deleting.
  - for a character who had **already pierced the popped layer**: a no-op — their walk
    already skipped it; they simply stop being ahead of the table. For everyone else the
    pop *is* the reveal of the next face. A pending held reveal for the popped layer
    (decision 8) stays deliverable — their roll earned the layer's authored `reveal` text
    and the marker, which the public pop does not fully replace — and the approval prompt
    says the layer has since been dropped, so the GM can deliver or leave it moot.
  A *successful check* still "pops" one layer **for that character only**, as private
  knowledge (decision 5); the button is the only thing that moves the table.
- **Badge** — `worn`'s canvas badge layer, shared: GM-only, top-right corner, but a
  **different accent and the *real* actor's initial** (who is hiding), where worn shows the
  wearer's. Joe's corner icon, and the two mask species stay tellable apart at a glance.
- **HUD + dialog** — a GM-only Token HUD button (`fa-user-secret`, beside worn's masks), the
  worn dialog pattern grown a stack editor: an ordered list of layers (persona picker, DC —
  blank = this layer cannot be pierced by roll ("if there is a DC" is Joe's own
  conditional), skill select defaulting Investigation, reveal textarea), add/remove/reorder
  layers, plus the GM note. The one-layer case renders as the simple dialog. Setting
  captures `prior` and applies the outer face; the dialog's clear button is the same drop
  path as the banner's.

### 8. The approval gate — hold a reveal for the GM, one mechanism for all three roll kinds

> **Added in the second same-day amendment.** Joe: *"the player rolls… just give me a
> prompt they pass and I can accept it which then notify them they pass. Let's have a bool
> action for auto pass and dm approval on all checks… easily choose if it on or off on any
> skill roll. Some I don't care, others might trigger me to give a scene and extra dialog."*
> The reason is **pacing**: a pierced disguise or a rich lore hit is a cue to frame a
> scene, and the module blurting the text first steals the moment.

One boolean per gated thing — **auto-deliver** (default) or **hold** — with one mechanism
across the knowledge ladder, GM lore rows, and disguise layers. Not three queues, and not a
queue at all: **the ledger row of record *is* the pending state.**

- **Where the flag lives: beside the DC, on the thing that defines the roll.** A world
  setting `holdDefault` (boolean, default off), overridden per item by a tri-state
  `hold: true | false | absent-inherits` — on each **lore row**, each **disguise layer**
  (`stack[].hold`), and per **kind** for the study ladder (`studyHold`, a sibling of
  `studyTiers` on the kind actor). Per-kind, deliberately **not per tier**: a hold that
  applied only to high tiers would deliver low totals instantly and hold high ones — the
  delay itself becomes the number. Granularity finer than the roll is a leak by
  construction; the roll is the unit, exactly as Joe said.
- **When a held roll lands** (GM client, roll time): the ledger row is written as always —
  `total`, `when`, **plus the fully computed reveal payload** (which tier, which text,
  post-decryption if the encryption setting is on) and `delivered` unset. The GM gets the
  prompt: who rolled, on what, the outcome and the text about to land, with two buttons —
  **Deliver** (the decision-5 / decision-7-of-the-encounter-log batch runs now, and the
  player is notified the way any auto-delivered reveal notifies) and **Later** (the prompt
  closes; the row stays pending). There is **no Deny.** Approval is a *timing* control,
  not a veto: the check passed, and denying it is confiscating a success the dice already
  granted. The veto-with-refund already exists and stays the honest tool — the per-row
  **reset**, which un-spends the lock and un-writes the belief; a GM who truly needs a
  do-over uses that, in the open of their own ledger, not a button that quietly eats a pass.
- **Pending rows resurface.** The prompt is a convenience, not the store: the GM-only
  Beliefs / pierced sections render undelivered rows with a pending badge and a Deliver
  control, so a row survives "Later", a closed prompt, a reload, a week — and is
  deliverable from the sheet whenever the scene arrives. Nothing new persists anywhere:
  the row lives where its ledger already lives (the studied actor for study/lore, the real
  actor for disguise), GM-written, player-unwritable, encrypted with the rest when the
  setting is on.
- **Failures, and the tell they must not create.** When `hold` is on for an item, it holds
  **every outcome of that roll that would produce player-visible output** — success text,
  authored miss-text, and every rung of a study roll (a study roll *always* delivers
  something, so holding only successes would make the silence pattern the number). What a
  pending player observes is: the public stub, the affordance gone, and nothing else —
  **byte-identical to a bare failure's observables**, so pending-success is
  indistinguishable from failed while it waits. Outcomes that produce *no* output (a
  lore-row miss with no authored miss line, a failed disguise check) have nothing to hold
  and the gate ignores them — the GM already sees every blind roll whispered. Hold status
  itself (this-item-is-narrated-by-the-GM) may become inferable to a player over time;
  that is acceptable — it correlates with the GM's taste, never with any outcome.
- **The lock is spent at roll time** (decision 4), so a pending reveal is a spent roll
  with its payoff parked — deliberate, and the parked payoff cannot be lost: it is in the
  ledger row. GM offline is already impossible at roll time (no active GM, no conduit
  roll); a GM who never acts leaves a pending badge on their own sheet section, which is
  the correct nag surface for a debt only they can pay.
- **Composition:** the disguise pop interaction is in decision 7 (a pop leaves a pending
  reveal deliverable, flagged as since-dropped). The indistinguishability run in the
  encounter-log's build-and-validate gains one variant: the held case, asserting the
  pending player-side capture is byte-identical to the failure capture.

### 9. The devtools boundary — Joe's ruling, recorded as the threat model

Verbatim: *"i'm just accepting that if someone wanted to have there dev tools open, thats
fine — i trust my players to roll and report back what's on their dice, so if they wanted to
cheat they can just report back bullshit numbers on the rolls."* This is the strongest
framing of the module's threat model anyone has offered, and it retroactively justifies the
presentation-not-access scoping that ties, worn, lore rows and the blind conduit all chose:
**the honesty of the table was always the load-bearing wall — dice reporting already trusts
it, so flag visibility adds no new trust.** The mask flag — the whole stack included — is
readable by a player with devtools open, and that is fine. What the design still keeps
genuinely off the player's client is what the conduit never sends: the DCs, the totals, and
the fact that a hidden check ran at all.

---

## Schema

```js
// on the TOKEN document, GM-written, sibling of `worn`:
token.flags["pentaryn-ties"].disguise = {
  id: "<random>",                  // this mark's identity — keys the ledger and the mirror
  stack: [                         // outermost first; one entry = the plain single disguise
    { id: "<random>",              // STABLE layer identity — never positional; keys the
                                   // ledger and the mirror across pops and reorders
      personaId: "<worldActorId>", // this layer's face; required
      personaName: "Harl Wetherby",// cached at set — survives persona deletion
      dc: 15,                      // optional; absent ⇒ this layer cannot be pierced by roll
      skill: "inv",                // dnd5e 3-letter key; default Investigation
      reveal: "",                  // supplemental text on piercing THIS layer; NOTES_MAX
      hold: undefined }            // true/false overrides the holdDefault setting (dec. 8)
  ],
  note: "",                        // GM prose, as worn.note
  prior: { name, img }             // the token's face before the mask, restored by the LAST pop
}

// on the REAL actor, GM-written by the conduit, GM-read only (and it IS the lock).
// Rows survive pops as history; `delivered` unset = pending under the approval gate:
flags["pentaryn-ties"].pierced = {
  "<markId>:<layerId>:<characterId>":
    { total, when, payload, delivered }   // every attempt; payload only on output-bearing
}                                         // outcomes, delivered stamped at release

// on the CHARACTER actor, conduit-written at delivery — UI data, never the lock:
flags["pentaryn-ties"].unmasked = { "<markId>": ["<layerId>", …] }  // layers seen through

// on a KNOWN entry (phase-1 schema, additive — reader AND toStoredKnown must carry it):
{ …, imposter: <timestamp> }       // absent = never; "someone was wearing this face"

// world setting (decision 8): holdDefault — boolean, default false (auto-deliver).
// The study ladder's per-kind override lives on the kind actor as `studyHold`,
// beside `studyTiers`; lore rows carry `hold` beside their `dc`.
```

Hardened readers for all of it, `readWorn`'s contract: never throw, never junk, clamp
everything; a malformed stack entry is dropped, an empty stack reads as no mark, an entry
without a layer `id` is assigned one on the next GM write (never on read — reads are pure).

## What bites, said before it does

| Bite | Resolution |
| --- | --- |
| **The relay's LIMITED gate will refuse the reverse seed of most persona ties** — `relay.mjs` requires the sender hold LIMITED on the target, players hold LIMITED on almost nothing (the GUI plan measured 24/24 of a player's ties pointing at no-LIMITED actors), and persona actors will be no exception | **Pre-existing tension, not created here** — dialog reach is `Token#isVisible`, relay reach is LIMITED, and they already disagree for ordinary scene NPCs. One-sided ties are a legal, stated state, so disguise ships without touching it. Recommended fix, separately: the GM-side check accepts *LIMITED or a token of the target on the active scene* — re-derivable on the GM client, the same category of reach the dialog grants. Flagged, not decided |
| `toStoredKnown` **silently drops fields it does not know** — the `imposter` marker dies on the first notes-edit unless reader and writer learn it together | Named in decision 5a; land both plus fixtures in one change. This is exactly the quiet-loss class `known-core.mjs`'s node suite exists to catch |
| An **ad-hoc renamed token with no mark** still logs/captures the real actor id under the fake name | The encounter-log §7 residual, unchanged and accepted: display is cached from the screen, the id is the devtools boundary. The fix is one HUD dialog — set the mark |
| A player **already holds the current face's kind-study lock** when the mask appears | No affordance to ride — the banner's manual "Throw {character}'s check" covers it (decision 4) |
| **Unlinked tokens** | Non-issue: the mark is per-token and the redirect consults the flag before any actor resolution; mechanics still resolve through `baseActorOf` as everywhere |
| The mask **does not follow the actor** to other scenes | Deliberate (decision 2), same as worn — say it in the README so it reads as a rule, not a bug. A layered cover on a second scene means re-authoring the stack there; if that stings in play, a "copy mark from another token" convenience is additive later |
| Phase-5 logger meets a mask **set mid-scene** (players already logged the real id before the GM set it) | The row was written from what was on screen at the time; a re-sighting under the mask updates the cached face but the id row already exists. Accepted: set the mask before the token, which is also the only order that makes fictional sense |
| A user's **unmasked set spans their characters** (two-PC player: one pierced, one didn't) | Per user, by the union rule (decision 3) — screens are per-user and a user cannot un-know. The characters' *records* stay per-character (each has only the Known entries their own reveals created); only token resolution unifies |
| **Depth stored as an index** would shift under a GM pop, silently re-aiming every knower's resolution one face too deep | Designed out before build (the second amendment's one real bug-catch): stack entries carry stable ids; ledger and mirror key by id; resolution is the skip-leading walk. There is no index anywhere to shift |
| A **held reveal outlives its layer** (GM pops a layer while a pierce sits pending) | Deliverable, flagged as since-dropped in the prompt and the pending row (decision 7) — the roll earned the authored `reveal` text and the marker, which the public pop does not fully replace; the GM delivers or leaves it moot |

## What changes where — and honest scope

| File | Change |
| --- | --- |
| `disguise.mjs` (new) | reader/set/clear, the HUD button + stack-editor dialog (stable layer ids assigned on write), badge painting via worn's layer, the banner injection, the pop path (next-face application, `prior` restore on last pop, the all-characters marker stamp, greyed ledger history) — worn.mjs's size class plus the stack editor |
| `ties-api.mjs` | `apparentActorOf(token)` beside `baseActorOf` (viewer-aware: owner/GM carve-out, the skip-leading walk over the `unmasked` layer-id set) |
| `tie-dialog.mjs`, `overlay.mjs`, `known.mjs` | the redirect sweep — each swaps its player-facing token→actor resolution to `apparentActorOf` (decision 3's table is the checklist) |
| `known-core.mjs` | the `imposter` field through `readKnown` **and** `toStoredKnown`, with fixtures (decision 5a's trap — rides the encounter-log decision-15 rework commit); the `mask:` grant-key join rule in `grantsForEntry` |
| the study conduit (encounter-log phase 3, unbuilt) | the piggybacked per-layer blind check, the reveal batch of decision 5 (ledger at roll time; whisper, next-entry creation, marker, mirror at delivery), reset + manual throw — and the **approval gate** (decision 8): `hold` resolution, payload-bearing ledger rows, the Deliver/Later prompt, pending badges + Deliver controls on the GM Beliefs/pierced sections |
| `lang/en.json`, `styles/ties.css`, `README.md` | strings (incl. the Impersonated tag + tooltip, the prompt, pending badges), badge/banner/tag styling, and one honest section: what the mask does, what it never hides from devtools |

- **Phase A — the mask itself** (flag + stack with layer ids, dialog, badge, banner, the
  pop path, `apparentActorOf` + the redirect sweep): **~3 days** — the first pass said 2,
  the stack editor and viewer-aware resolution made it 2½, and the pop's face-application
  + marker stamp round it up. All on shipped patterns, and independently useful with zero
  detection machinery — the redirect and the paced pop alone are most of Joe's ask.
- **Phase B — detection + the gate**: **~2½ days**, but it *rides the study conduit* and
  cannot ship before encounter-log phase 3 exists. Add it to that phase's ladder as one
  more rung; the split reveal batch (ledger at roll, four writes at delivery, one GM-side
  transaction each) is the piece to fixture hardest, and the held-case
  indistinguishability variant is its acceptance test.
- **Phase 5 of the encounter log is unblocked now, by rule alone**: log
  `apparentActorOf` + cache-from-screen. If phase 5 ships before Phase A,
  `apparentActorOf` degrades to `baseActorOf` and the §7 cache rule already covers display —
  safe in either order.

## Rejected

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| Token owned by the **persona** actor | Combat rolls the wrong creature; HP/effects on the wrong sheet; drop = token swap severing the combatant | Every mechanical surface, to save one render rule |
| **Literal token replacement** at set/drop (Joe's phrasing read as identity, not appearance) | Combatant `tokenId` orphans, actor-delta HP evaporates, effects and targeting die — a mid-combat drop becomes a catastrophe | The one-button drop the banner exists for |
| **Extending `worn`** with `personaId`/`dc`/`skill` | The pointers run opposite directions across the mask (see verdict); `by` overloaded; six live possession marks on the flag being forked | A mode branch in every consumer, mid-campaign |
| **Replacing `worn`** with a generalised mask | Rewrites a shipped feature for a generality with no user; possession has no use for DC/skill/persona | Migration of live prep notes for negative gain |
| **Actor-level pointer chains** (Joe's literal "pointer point to a pointer") | A fictional persona has no token to carry the next mark — the chain has no surface; cycles become representable; resolution becomes a guarded graph walk | Cycle detection, depth caps, and a second storage plane, for a shape the stack gives flat |
| **A successful check pops the shared stack** | Rolls mutating authored structure breaks the one-knower rule at every layer — the token would change for the whole table because one player rolled well. (Unchanged by the pop ruling: the *GM's button* mutates the stack because the GM is the author; a *roll* never does) | The two-plane rule, and with it "the others must not know" |
| ~~**Drop pops one layer** instead of clearing~~ — this doc's own first-cut rejection, **overturned by Joe the same day** (*"my button pops one off"*) | The rejection argued from implementation (no shared per-layer state to pop); Joe's intent is a global pacing control, and under layer-identity keying the pop is coherent and safe. Kept as the record of a rejection that lived a few hours | — |
| **Drop clears the whole stack** (this doc's first-cut decision) | Overturned by the same ruling: pacing the public unmask layer by layer *is* the button's job; instant truth is just N clicks, and the stack editor already offers arbitrary surgery | Kept in Rejected as the record; nothing else of the first cut changes |
| **A Deny button** on the approval prompt | Approval is timing, not veto — denying a legitimately passed check confiscates a success the dice granted; the per-row reset is the honest do-over (lock refunded, in the open) | A quiet success-eater beside an honest one |
| **Per-tier hold granularity** for study rolls | Delivering low totals instantly while holding high ones makes the delay itself the number | The indistinguishability contract, traded for a knob |
| **Holding successes only** | A study roll always outputs, and a lore row with miss-text outputs on failure — instant-failure-text beside held-success-text is a timing tell | Same contract, same trade |
| **A separate pending-reveal queue store** | The ledger row of record already holds everything (outcome, payload, timestamps) and already has the right owner, permissions and encryption; a queue is a second copy that can disagree with it | The exact two-sources-of-truth the beliefs ledger exists to prevent |
| **Per-mark single DC/skill** instead of per-layer | A flimsy street disguise over a deep-cover identity is the first thing a GM will author; one number cannot say it | The bard — Joe's own example |
| The **"Incognito"** label on the pierced record | False when the mask borrowed a real person's face (Fenna is not an alias), and the module cannot distinguish invented from off-screen-real | A tag that lies in exactly the case Joe called "the big win about the pointer" |
| Auto-moving or splitting notes at reveal | Joe's rule is explicit: the pointer stays dumb; sorting truth from mask is the player's job | The dumb-pointer contract, and a merge UI nobody asked for |
| A visible "check disguise" affordance | Its existence announces the disguise — the affordance is the leak | The indistinguishability contract |
| Two public stubs (study + disguise check) | Message count is a pixel; a pixel that differs by outcome is the number | Same contract |
| Auto-flip token art for the succeeding player only | Token rendering is shared; any client-local fork is a new render layer to build and a desync to maintain | Joe rejected the outcome anyway — one knower must not tell the table |
| ~~Default reveal never names the real actor~~ (this doc's own first cut) | Overruled by Joe's walkthrough: the reveal must hand over the next identity or there is nothing to take notes on; spoiler control moves into stack authoring | Kept as the record — the concern it protected is now served by inserting layers, which is strictly more expressive |
| Lock keyed per persona instead of per mark+layer | A new cover would arrive pre-pierced by last week's roll | "A different face each scene" — the feature's own premise |
| Storing `pierced` on the player's actor | They own it; one `unsetFlag` re-arms the check — the exact beliefs-as-lock hole the encounter-log already patched. (`unmasked` *is* player-side, and safely: it grants nothing, it only renders what a reveal already told them) | The one-check rule, voided by devtools |
| Facade inside ties' `read()` (the GUI plan's option 2) | The pointer makes rows *aim at the believed face*, so `read()` resolves the right name with no change | A change under the cards, the panel, the dialog and `inbound()` at once |
| Refusing players ties to non-LIMITED actors (option 3) | Kills "you can see them, you can add them" | The canvas gesture's reason to exist |

## Verified vs taken on trust

**Verified this pass, live (`space-journey`, eval-js, read-only):** the six worn marks and
their host-side `actorId`s across all 99 scenes; dnd5e's Investigation key is `inv` (and
`arc/his/nat/rel` for the ladder); `prototypeToken.name`/`prototypeToken.texture.src` are
real, populated paths on this world's NPCs. **Verified on disk:** `worn.mjs`'s full contract
(token-flag storage, GM gates, badge layer, HUD/dialog); `relay.mjs`'s LIMITED gate;
`tie-dialog.mjs`'s facade and `targetCandidates` token-label rule, including the
`actor.isOwner` carve-out decision 3 extends; `read()`'s live-resolve of row ids;
`injectTab`'s spec array; `known-core.mjs` as shipped — the entry shape, `cachedName`
alongside live `name`, and the fact that `toStoredKnown` drops fields it does not map
(decision 5a's trap is read off the code, not guessed).

**Taken on trust:** the PHB Disguise Self quote and the disguise-kit gap (verified by the
commissioning pass against the installed packs, not re-read here); Joe's walkthrough quotes
and both second-amendment rulings — the pop-one intent and the approval-gate ask — as
supplied by the coordinating pass; that a Combatant survives a token `name`/`texture`
update untouched (API knowledge — behaviourally certain, but the mid-combat drop *and a
mid-combat pop* should be Phase A live checks); the conduit's shape (encounter-log
decision 11, itself unbuilt — Phase B inherits its risk ranking, where it is already #1).
