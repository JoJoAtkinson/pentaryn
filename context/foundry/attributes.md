---
title: "Attributes and knowledge — building the world through the people in it"
status: active
last_modified: 2026-08-23
tags: [context, foundry, attributes, knowledge, study, npc-ties]
---

# Attributes and knowledge — building the world through the people in it

**Read this when:** you are asked to create, link, or tune an **attribute** (a city, a district,
a guild, a disease), to change **what studying a monster tells someone**, or to turn a piece of
backstory into things players can discover.
**Not this file:** why any of it was designed this way → [`../plans/foundry-encounter-log.md`](../plans/foundry-encounter-log.md)
(history, never load it to operate the thing) · ties between people →
[`README.md`](README.md) · rules and monster stat lookups →
[`rules-lookup.md`](rules-lookup.md)

> **Everything here runs through `mcp__foundry__eval-js`.** There is no purpose-built MCP tool
> for attributes; the module exposes a JS API instead. **A GM client must be connected** or every
> call fails — see [Running the calls](#running-the-calls).

---

## The one-paragraph model

A creature **is** something (its *kind* — a stat block) and **belongs to** things (its
*attributes* — a city, a guild, an illness). Those are separate axes and they cross: a rogue
guild has humans and goblins in it. Players learn either axis only by **inspecting** somebody —
nothing is ever revealed automatically. Each fact is **one roll, ever**: you know it or you do
not, and a failure is permanent. Attributes form a **tree**, and *working something out* requires
knowing its parents, so depth costs *rolls* rather than a higher DC. A **GM's grant ignores the
tree** and may land anywhere in it — only blind rolls climb.

---

## Running the calls

```js
// every example below is the body of an eval-js script
const A = game.pentaryn.ties.attributes;
const S = game.pentaryn.ties.study;
```

| | |
| --- | --- |
| Tool | `mcp__foundry__eval-js` (top-level `await` works; `return` a value to see it) |
| Requires | **a connected GM client.** "Foundry VTT module not connected" means nobody is logged in as GM — ask Joe, or `make login USER_NAME=Gamemaster WORLD=<world-id>` |
| Works in | **any dnd5e world** — nothing here is world-specific. Ask `game.world.id` rather than assuming one |
| Writes | GM-only. The server refuses player writes to these settings, which is what makes the locks real |

⚠ **Never edit `flags["pentaryn-ties"].attributes` by hand.** Linking an attribute must also
write its ancestors (see [the tree](#the-tree)); `A.link()` does that, a raw `setFlag` does not,
and the result is a creature nobody can ever finish identifying.

---

## Running a check

Nothing rolls on its own. **Inspection is the only trigger**, and it is deliberate: no examine,
no detection.

Players hover a token and press **4**, or use the eye button on the token HUD. Studying a monster
or a specific lore row is a button on their own Known tab.

From the console, as GM:

```js
const S = game.pentaryn.ties.study;
await S.inspectAs(pc, npc);                // run the identification cascade for a PC
await S.as(pc, npc);                       // hand-throw their kind study
await S.as(pc, npc, { loreId });           // …one of that NPC's lore rows
await S.as(pc, npc, { loreId, attrId });   // …an attribute fact, through this carrier
```

⚠ **Same validation, same writes, same one-shot locks as a player's click — a test roll spends
the real attempt.** Undo it with the [reset calls](#undoing-things) before it matters at the
table.

---

## Creating an attribute

```js
const A = game.pentaryn.ties.attributes;
await A.create("Ashfall Company", { category: "faction" });
// → { ok: true, entry: { id: "ashfallcompany", … } }
```

The **id is derived from the title** — lowercased, accents stripped, everything but `a–z0–9`
removed. So `"Ashfall Company"`, `"ashfallcompany"` and `"Áshfall Company"` are all the same
attribute, and a second `create` is **refused** rather than silently overwriting:

```js
await A.create("ashfall company");
// → { ok: false, reason: "collision", existing: { id: "ashfallcompany", … } }
```

Want a genuinely different one with a similar name? Add a digit — `"Ashfall Company 2"` →
`ashfallcompany2`.

`category` is free text and only groups things in the picker. Useful values in play:
`place`, `faction`, `condition`, `people`, `trade`.

---

## Linking a creature to an attribute

```js
const A = game.pentaryn.ties.attributes;
await A.link(game.actors.getName("Vess Tarrow"), "ashfallcompany");
await A.unlink(game.actors.getName("Vess Tarrow"), "ashfallcompany");

A.ids(actor);   // ["type:humanoid", "size:med", "ashfallcompany", …] — everything they carry
A.of(actor);    // the same, as display records with titles and icons

// ⚠ `kind:` is the one derived namespace these console reads miss: the kind resolver is a
// parameter and defaults to null. Gameplay passes it internally, so this only affects you.
A.ids(actor, game.pentaryn.ties.study.kindActor);
```

**Linking writes the ancestors too.** Linking a guild that sits under a district under a city
writes all three, because being in that guild *means* being of that district and that city.
Unlinking a parent removes its descendants for the same reason.

**Some attributes are free — you never link them.** These are derived from the stat block every
time and cannot be edited:

| Namespace | From | Example |
| --- | --- | --- |
| `type:` | `system.details.type.value` | `type:humanoid` |
| `size:` | `system.traits.size` | `size:med` |
| `species:` | the embedded `race` item | `species:human` |
| `background:` | the embedded `background` item | `background:entertainer` |
| `kind:` | the kind pointer, when it points elsewhere | `kind:<actorId>` |

To make one *not* apply to one creature, `A.unlink(actor, "type:humanoid")` — it is suppressed
rather than deleted, because it would otherwise be recomputed a moment later.

---

## The tree

```js
await A.update("undercity",  { parent: "greyharbour" });
await A.update("ashfallcompany", { parent: "undercity" });
```

The tree does **one** job: it gates identification. To work out that someone is in the Ashfall
Company you must first place them in the Undercity, and before that in Greyharbour — three rolls,
not one.

### Setting DCs — the part that is easy to get wrong

**Depth already makes things hard. Do not also raise the DC for depth.**

A leaf three rungs down at DC 12 is *not* a DC 12 fact. With a +5 modifier each rung is about
70%, so the leaf lands around **0.7³ ≈ 34%** — harder than a single DC 18 check, and it fails
in a way that tells a better story, because the player learns *where the trail went cold*.

| Depth | Per-rung DC | Roughly |
| --- | --- | --- |
| root only | 15 | ~55% |
| two rungs | 15 / 15 | ~30% |
| three rungs | 15 / 15 / 15 | ~17% |
| three rungs | 10 / 12 / 14 | ~34% |

So: **keep per-rung DCs low and let the ladder do the work.** Reach for a higher number only
when *that particular rung* is genuinely obscure, not because the thing at the bottom should be
rare.

⚠ **Author roots cheaply.** A failed roll is permanent, and a failed root closes **every
descendant forever** for that character. A DC 20 city can silently delete a whole branch of your
world for someone. Roots should be nearly free; the depth is the difficulty.

⚠ **A cycle is refused at write time.** `A.update("a", { parent: "b" })` after
`A.update("b", { parent: "a" })` returns `false` and leaves the parent alone, with a notification
saying why. This used to be stored happily on the theory that the readers degrade gracefully — and
most do, but the tree browser did not: a loop and its whole subtree dropped out of every view while
search and the ledger went on believing in them. If one somehow exists, the tree now promotes it to
a root instead of vanishing it. A **dangling** parent — its entry was deleted — degrades the node
to a root rather than making it unreachable, which is deliberate.

---

## Secrecy and the help scale

```js
await A.update("ashfallcompany", {
  secret: true,            // must be worked out — the default for anything you author
  whenKnown: "advantage",  // enables | advantage | auto
  whenCarried: "auto",     // inherit  | advantage | auto
  dc: 12,
  skill: "his",
  reveal: "A grey pin, worn inside the collar. Ashfall Company.",
  miss:   "Nothing about them you can name.",
  hold:   false
});
```

**`secret`** decides whether membership itself is hidden. Authored attributes default `true`;
derived ones default `false` (a goblin is visibly a goblin). `type:` and `size:` can never be
secret whatever you set — nobody conceals their silhouette.

**The two scales answer different questions:**

| | `whenKnown` — *I know this thing exists* | `whenCarried` — *I am one* |
| --- | --- | --- |
| `enables` / `inherit` | no help — the roll is flat either way | same as knowing it |
| `advantage` | roll with advantage | advantage spotting your own |
| `auto` | you spot every carrier, no roll | you just know your own |

⚠ **Nobody needs to know an attribute before rolling for it.** The first attempt is always
allowed, and it settles **two things at once**: a success backfills *"you knew of this all
along"* into world knowledge, while a failure writes a **permanent** *"you never knew of it"*
that closes the whole branch. Only after that failure is the character locked out, and
`A.tell()` is the only way back. So `enables` is **not a gate** — it means "knowing it gives no
edge".

Worked examples, and the last is the one that shows why there are two:

| Attribute | whenKnown | whenCarried | Reads as |
| --- | --- | --- | --- |
| a city | `auto` | `auto` | learn the accent once, place everyone from there |
| a district | `advantage` | `auto` | you learn to hear it; locals just know |
| a thieves' guild | `advantage` | `advantage` | a tell you get better at, from either side |
| **an assassin's guild** | **`enables`** | **`auto`** | **no tell to learn — every stranger rolls flat, forever; trivial from inside** |
| an illness | `advantage` | `advantage` | the cough is a real tell |

⚠ `whenCarried` can never be *weaker* than `whenKnown` — it is clamped up, because carrying
implies knowing.

⚠ **`whenCarried: auto` bypasses the tree.** Kin-sense is direct: an assassin reads the mark
without first placing anyone's home city. `whenKnown: auto` does not bypass — outsider knowledge
climbs.

**One carrier hiding harder:**

```js
await npc.setFlag("pentaryn-ties", "conceal", 8);                    // every attribute on them
await npc.setFlag("pentaryn-ties", "conceal", { greyharbour: 10 });  // just this one
```

0–20, added to the identification DC **for that creature only**, and never shown anywhere a
player can see — the affordance still prints the attribute's own DC. This is the knob for *"from
the city, but working hard not to sound it."* Attribute-wide difficulty stays on the attribute.

**`miss` is not optional.** Rolls are blind, so a fact with nothing authored on the failing side
**leaks failure by silence** — a pass hands over prose, a miss hands over nothing, and the player
reads the absence. Write something vague or confidently wrong. The authoring UI shows a ⚠ on any
row missing it.

**`hold: true`** (or `null` to inherit the world's `holdDefault`; `false` pins auto-deliver) parks
the result until you release it. The prompt appears on the GM screen with the roll and the exact
text; **Later** keeps it in the ledger.

```js
S.pending();                    // everything waiting, on both planes
await S.deliver(pc, npc);       // a held kind study (add loreId / attrId for the others)
await S.deliverHeld(pc, npc);   // held identifications — this also RESUMES the cascade
await S.hold(kind, true);       // the per-monster gate
```

⚠ **A held rung suspends the climb.** Nothing beneath it rolls until you deliver, and the
passed-but-held membership stays invisible to the player everywhere — including under other
carriers, and in their world-knowledge list.

---

## Facts *about* an attribute

Beyond "are they in it", an attribute carries **lore rows** — separate facts, each with its own
DC and its own one-shot lock:

```js
const entry = A.describe("ashfallcompany");
await A.update("ashfallcompany", {
  lore: [
    ...entry.lore,
    { id: foundry.utils.randomID(), label: "What they swore at the Cairn",
      skill: "his", dc: 14,
      text: "They swore to keep the pass shut. Every one of them is bound to it.",
      miss: "Something about a pass. The tellings do not agree.", hold: false }
  ]
});
```

Learned from **any** carrier, it then appears under every carrier the character has filed **and
identified as a carrier** — for a secret attribute the mere placement of the text would otherwise
announce the second creature's membership, so the module withholds it until they have worked that
one out too. A passed-but-**held** membership counts as not yet identified. Non-secret attributes
show it everywhere.

That is the whole reason attributes exist: the guild's secret belongs to the guild, not to the one
member who let it slip.

---

## Monsters — changing what a study tells someone

Studying a **kind** is graded, and it reads the stat block for free:

| Roll | Gives |
| --- | --- |
| under 15 | *"Nothing about it means anything to you."* |
| 15+ | the biography |
| 20+ | immunities, resistances, vulnerabilities, condition immunities |
| 25+ | its attacks, fully enriched |

⚠ Traits come from **`_source`**, so **gear-granted immunity is invisible** to a study. A creature
holding a cloak of fire immunity still reads as its innate self. That is deliberate: studying
tells you what something *is*, not what it is carrying.

### Overriding the voice

```js
const S = game.pentaryn.ties.study;
await S.tiers(game.actors.getName("Ancient Red Dragon"), [
  { min: 0,  text: "A big lizard. Bad-tempered, probably." },      // the LIE, on a miss
  { min: 15, text: "Ashmaw of the Cinder Reach. The songs name her." },
  { min: 25, text: "…and the songs say she sleeps on a floor she cannot leave." }
]);
```

**Rung 0 is the failure case; 15/20/25 are the truth.** That split is the point — you can look at
a monster and see at a glance what is false and what is world-building. A miss with no authored
rung 0 gives the generic *"nothing means anything to you."*

`min` must be exactly **0, 15, 20 or 25** — anything else is silently dropped. An offset changes
what a rung *costs*, never its name: on a `+5` monster the 15-rung is reached at a total of 20 but
is still authored as `min: 15`.

An authored rung **carries upward** until the next authored rung replaces it, so a tier-15 line
survives a roll of 25 (with traits and attacks appended beneath it). Rung 0 **never** carries —
the lie must not become the reward for rolling well.

### Making a monster harder or free

```js
await S.difficulty(kind, "auto");  // free — inspecting is enough, no roll, cannot be failed
await S.difficulty(kind, 20);      // the whole ladder shifts: 35 / 40 / 45
await S.difficulty(kind, -5);      // 10 / 15 / 20
await S.difficulty(kind, 0);       // back to the default, flag removed
```

One knob, clamped to **−15 … +25**. `"auto"` is a chicken; `+20` is a god. Most monsters need
nothing at all.

⚠ `"auto"` does not merely skip the roll — it hands over the **full tier-25 payload**: the
description, the traits and the attacks. It is "everyone knows everything about this", not
"everyone knows roughly what it is".

### Two dragons, one kind

Two separately-imported dragons are two *kinds*, so a player gets two bites at the same fact.
Point one at the other:

```js
await S.kindOf(game.actors.getName("Ashmaw"), game.actors.getName("Ancient Red Dragon").id);
```

---

## Turning a backstory into attributes

Given prose like:

> *Vess grew up in the Undercity beneath Greyharbour, ran with the Ashfall Company as a girl, and
> still coughs from the forge years.*

Read it as **places → sub-places → groups → conditions**, then decide for each: is it secret, and
does knowing it help you spot the next one?

```js
const A = game.pentaryn.ties.attributes;
await A.create("Greyharbour", { category: "place" });
await A.create("The Undercity", { category: "place" });
await A.create("Ashfall Company", { category: "faction" });
await A.create("Forge Lung", { category: "condition" });

await A.update("theundercity",   { parent: "greyharbour" });
await A.update("ashfallcompany", { parent: "theundercity" });

await A.update("greyharbour", { dc: 10, whenKnown: "auto", whenCarried: "auto",
  reveal: "The long Greyharbour vowels — a local, born and raised.",
  miss: "Somewhere inland. You could not say where." });
await A.update("theundercity", { dc: 12, whenKnown: "advantage", whenCarried: "auto",
  reveal: "Undercity born — they never quite look up.",
  miss: "Nothing places them any closer than the town." });
await A.update("ashfallcompany", { dc: 14, whenKnown: "enables", whenCarried: "auto", hold: true,
  reveal: "A grey pin, worn inside the collar.",
  miss: "Nothing about them you can name." });
await A.update("forgelung", { dc: 12, skill: "med", whenKnown: "advantage", whenCarried: "advantage",
  reveal: "That cough has a wet catch at the end. Forge lung — years of it.",
  miss: "Just an old cough." });

await A.link(game.actors.getName("Vess Tarrow"), "ashfallcompany");  // writes the city and district too
await A.link(game.actors.getName("Vess Tarrow"), "forgelung");
```

Judgement calls worth making consciously:

- **Sub-place only when it means something.** A district earns a rung if people can be *placed*
  in it. "The east side of town" usually cannot.
- **The illness has no parent.** It is not part of the city; anyone can have it. Only nest things
  that genuinely contain each other.
- **The guild holds at `hold: true`** because it is the payoff — you want to narrate that one.
- **The city is `auto` both ways** so it is learned once and never rolled again. That is what
  makes the deeper rungs reachable at all.

---

## Browsing the world

The **Attributes** tab on a character's sheet shows the world as a tree, nested the way it
actually is — a guild under a district under a city.

**A player sees only what they know.** Nothing else is drawn: a list of the gaps in your map
describes the shape of what is missing, so unknown nodes are **dropped entirely**, not dimmed.

That includes ancestors. If you granted a guild without its city, their tree shows the guild as a
**root** — the city is not drawn above it even as scaffolding, because its name is the very thing
you did not hand over.

An edge is drawn only when they know **both ends and the link between them**. Know the city and
the guild but not the district in between, and you get two roots, not the guild tucked under the
city: nesting is the only information this view carries, so an invented edge is a disclosure. Grant
the missing link and the branch assembles itself.

**A GM sees the whole tree** with everything marked:

| Marked | Means |
| --- | --- |
| *(plain)* | they know it |
| **waiting on you** | passed, held, not yet delivered |
| **missed it** | rolled and failed — only a grant reopens it |
| **not told** | never attempted |

Every marked row carries an action. **Tell them** on *not told* and *missed it* hands over exactly
that node — see the warning under [Giving knowledge away](#giving-knowledge-away) for when you want
the ancestors too. **Release** on *waiting on you* hands over an answer they already rolled for,
finding whichever creature it is parked on so you do not have to remember.

Navigation, GM side:

- **Twisties** on every branch. Your tree opens to the roots and their children; a player's opens
  all the way down, because it is small and it is theirs.
- **Collapse all / Expand all** for a first look at a large world.
- **Filter chips** — *Not told*, *Waiting on you*, *Missed it*. A filter keeps the ancestors needed
  to reach a hit and opens the way down to it, so "what have I not given this character near
  Ardenhaven" is one click. Players get no filter: every state but *known* is empty for them, and a
  control listing states they can never be in says those states exist.
- **Counts** ("3/8") on your branches only. On a player's tree the size of what they have not found
  is itself the disclosure.

Depth is not a constraint — realm → kingdom → region → city → quarter → district → street → house →
household → cell renders whole, and the tree scrolls sideways rather than crushing titles. The cap
is a runaway guard at 64.

```js
A.known(pc);                  // the flat list of what they know
A.known(pc, { forGM: true }); // …including what they failed and what is held
```

**Carrying implies knowing.** A character who *is* in the Salt Dogs has the crew — and the district
and city its membership materialises — in their map already, marked `via: "carried"`, with no grant
needed and nothing written to the ledger. Re-link a PC and their map follows.

---

## Icons

A new attribute takes its art from its **category**, which is free text. Type `city`, `town`,
`guild`, `fact` — or `realm`, `kingdom`, `region`, `district`, `street`, `building`, `place`,
`faction`, `order`, `crew`, `cult`, `temple`, `family`, `people`, `trade`, `title`, `condition`,
`event` — and you get art that suits. Common synonyms are folded in, so `quarter`, `clan`,
`church`, `gang`, `illness`, `secret` all land somewhere sensible. Anything else gets a plain
standard.

Retype the category and the icon follows it — **unless you picked your own**, in which case it is
yours and nothing overwrites it. Set one on the entry to override at any time.

```js
await A.update(id, { category: "city" });                    // becomes a city
await A.update(id, { icon: "worlds/mine/ardenhaven.webp" }); // yours from here on
```

⚠ Two of the old defaults pointed at files that do not exist, so every guild and city drew a blank
square. Fixed, and entries written against them are repaired on load. If you add a category icon,
check the path actually serves — a wrong one logs nothing and merely looks unfinished.

## Sourcing from the vault

An attribute can point back at the markdown it came from. Optional — leave it off and nothing
changes. It exists because `world/` and the attribute tree are the *same hierarchy written twice*,
and the pointer is what stops them drifting apart.

```js
source: { blob: "41bcd52a…",                              // the identity — a committed git blob
          path: "world/factions/…/gray-district.md" }     // a label, and refreshable
```

**The blob is the identity; the path is only a label.** Git keeps every version of every committed
file forever, filed under the fingerprint of its bytes — so the hash alone reconstructs everything:

```bash
git log --all --find-object=<blob> --name-status   # every commit on every ref; gives commit + path
```

That works even when the note was later renamed **and** rewritten, which is exactly what a stored
path cannot survive — this vault has 76 renames across 69 commits. The path is kept because it is
what you read on the sheet and it makes a drift check one hash of one file instead of a history
search. When it rots, nothing is lost: recover it from the blob.

### ⚠ Commit first, then take the hash

**This is the rule the whole thing rests on.** `git hash-object` will fingerprint whatever is on
disk, including uncommitted edits — and those bytes are in no commit, so no search will ever find
them. The record would look perfectly healthy and be a dead end.

```bash
P="world/factions/ardenhaven/locations/ardenford/gray-district.md"
git status --porcelain -- "$P"      # must be EMPTY. If not, commit before going further.
git rev-parse "HEAD:$P"             # the committed blob — this is what you store
```

`git rev-parse HEAD:<path>` reads the hash out of git rather than off the disk, so it can never
capture an uncommitted state. If it disagrees with `git hash-object <path>`, the file is dirty and
you are not ready to link it.

### The loop

Read a note, author what a player can discover from it, point back:

```js
await A.create("The Gray District", { category: "district", source: { blob, path } });
```

`create` takes `source` directly, because this loop runs hundreds of times and a create-then-update
pair would double every write. **Many attributes may share one blob** — one note about Ardenford can
seed the city, three districts and a guild.

### Keeping it current

You will rarely need to touch a `source` again. When you *do* rewrite an attribute from a changed
note, re-commit the note and update the hash in the same breath:

```js
await A.update(id, { source: { blob, path } });   // whole-object replacement — see below
```

**Checking for drift**, while you are authoring, which is the only time it matters:

```bash
git rev-parse "HEAD:$P"    # differs from the stored blob? the note changed. Re-read it.
```

**When the path has rotted** — the note moved, so the path names nothing:

```bash
git log --all --find-object=<stored blob> --name-status | head
```

That names the commit and the path the file had there. If it moved again afterwards, hop forward
from that path. Then update the label.

⚠ **A patch replaces `source` whole.** `{ source: { path } }` drops the blob with it, and that is
deliberate: a changed path may be a different file, and a hash carried across would assert
provenance nothing checked. Send both, or send `null`.

**Authoring in Foundry instead.** Set a path with no blob and the note does not exist yet — write
the attribute first, generate the markdown later. The generator's rule is **create-if-absent,
refuse-if-present**, checking the filesystem rather than trusting the field, because `blob: null`
also arises from a path you typed by hand. Nothing is allowed to overwrite prose you wrote.

**On the sheet:** the path and a short hash show under the attribute, with **Clear**. There is no
edit box — a browser cannot run git or check that a file is there, so the loop above is where this
field gets written.

## Giving knowledge away

Rolls are not the only route in — and after a permanent failure they are the *only* alternative.

```js
const A = game.pentaryn.ties.attributes;
// they know of it — travel, a library, a good story
await A.tell(pc, "ashfallcompany");                        // just this one thing
await A.tell(pc, "ashfallcompany", { withParents: true }); // …and everywhere it sits
A.known(pc);                    // what they know of the world
A.known(pc, { forGM: true });   // …including branches they permanently failed
```

From the sheet: open the character, **Attributes** tab, *Tell them about something* (GM-only) —
type, click. An attribute they **permanently failed** is offered there and flagged *"they missed
this — tell them"*, because that is exactly when you need it.

⚠ **A grant lifts stage 1 only — knowing the thing exists.** Per-creature identifications they
already failed stay failed; clear those with `S.resetIdent(pc, creature, id)`. Granting the city
reopens the branch; it does not un-fail the stranger they already misread.

⚠ **A grant may land anywhere in the tree, and `withParents` is off by default.** *"I can give a
child deep in a tree without giving anything up the tree — say the research assassins, but they
might know nothing about where they come from."* That is what a grant is for.

Know what the bare version buys, because it is a fact about the world rather than a limitation:
identification climbs root-first, so a character told about the guild alone **knows it exists and
still cannot spot a member** until they can place the district above it. Turn `withParents` on
when you meant them to start recognising people; leave it off when you meant them to have heard a
name. Blind rolls never skip a rung — only you can.

Handing someone a monster instead:

```js
await S.release(pc, kind, 20);   // hand them what a DC 20 would have found
```

Raises only — it will refuse to demote someone who already knows more.

---

## Undoing things

```js
await S.resetIdent(pc, creature, "ashfallcompany"); // re-roll this one creature
await S.resetInspection(pc, creature);              // clear every rung on this creature
await S.reset(pc, kind);                            // un-spend a kind study
await S.reset(pc, npc, loreId);                     // un-spend one of an NPC's lore rows
await S.reset(pc, carrier, loreId, attrId);         // un-spend an attribute lore fact
```

⚠ **If the botched roll was that character's first contact with the attribute, the failure also
wrote the permanent "never knew of it" — and `resetIdent` alone leaves the branch dead.** Follow
it with `A.tell(pc, id, { withParents: true })`, which overwrites the failed row.

**There is no reset for world knowledge, by design.** A failed stage-1 roll is permanent — *"you
either know about the assassin guild or you do not."* The way back in is `A.tell()`, which is a
story act rather than an undo.

---

## Checking your work

```js
A.broken(actor);            // carriers whose ancestry is incomplete — should be empty
A.stale("ashfallcompany");  // carriers holding an outdated ancestry after a re-parent
S.beliefs(creature);        // who has worked what out about this one, and what they were told
S.pending();                // everything held, waiting on you
```

⚠ **Re-parenting goes stale.** Move an attribute under a different parent and existing carriers
keep the old ancestry. `A.stale()` finds them; re-link to fix. Never silent, never automatic —
re-shaping the world is an authoring act.

---

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `playerAccess` | on | master switch for every player-facing gesture |
| `holdDefault` | off | whether checks wait for GM release unless the thing says otherwise |
| `advantageStacking` | `raw` | `raw` = 2024 rules (both present cancel); `net` = count them up |
| `attributes` | `[]` | the registry — edit via the API, never by hand |
| `attributeKnowledge` | `{}` | who knows of what. GM-writable only; this is the lock |
| `attributeBeliefs` | `{}` | what each character was told about attribute lore |

`nearDistance`, `sheetTab`, `pinnedCards` and `macroCreated` belong to the ties and overlay
features — nothing here reads them.

---

## Things that will bite

- **A GM client must be connected** for any of this. No GM, no rolls — by design, a blind
  arbitrated roll needs an arbiter.
- **A `source` blob must be committed, or the provenance is a dead end that looks alive.**
  `git hash-object` fingerprints uncommitted bytes happily, and nothing will ever find them again.
  Take the hash with `git rev-parse HEAD:<path>` and check `git status --porcelain -- <path>` is
  empty first.
- **Never write a drift flag back into the registry.** The registry setting is rewritten *whole* on
  every save, last writer wins — so a background job that computed drift and wrote it back would
  discard whatever you were editing at the time, across every entry rather than one. Drift is a
  report you run, never state that is stored.
- **A source path can be a spoiler.** `world/factions/ardenhaven/.../gray-district.md` names a
  parentage the tree may be deliberately withholding — a filename can give away what you were
  careful not to put in a title. The registry syncs to every client, so the same rule as lore rows
  applies: nothing in a path you could not bear a curious player reading.
- **A cycle is refused now**, so an attribute cannot be made its own ancestor by mistake. If one
  ever exists (a hand-edited setting), the tree promotes it to a root rather than making it and
  everything under it silently vanish.
- **Everything syncs to every client.** Players *hold* the registry in memory; the UI hides it.
  This defends against accidents, not against a console. Do not put anything
  in a lore row you could not bear a curious player reading.
- **Two GM sessions on one account both think they are the arbiter.** The claim protocol
  silences the loser, so this is usually invisible — but if results look doubled or a roll goes
  missing, check whether Foundry is open twice.
- **In combat, inspection is once per combatant per round.** The tempo warnings still *can* fire —
  the counter clears when combat starts, not each round, so two stationary looks on consecutive
  rounds reach the first threshold — they are just rare in a fight.
- **A failed roll is forever.** Before raising any DC, ask what it closes.
