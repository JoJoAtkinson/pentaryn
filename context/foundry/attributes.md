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
not, and a failure is permanent. Attributes form a **tree**, and knowing a child requires knowing
its parents, so depth costs *rolls* rather than a higher DC.

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

⚠ **Nothing checks for cycles.** `A.update("a", { parent: "b" })` after
`A.update("b", { parent: "a" })` is stored happily; the resolver then quietly degrades both to
roots (the walk stops at the repeat). Check the shape yourself before re-parenting. A **dangling**
parent — its entry was deleted — likewise degrades the node to a root rather than making it
unreachable.

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

## Giving knowledge away

Rolls are not the only route in — and after a permanent failure they are the *only* alternative.

```js
const A = game.pentaryn.ties.attributes;
// they know of it — travel, a library, a good story
await A.tell(pc, "ashfallcompany", { withParents: true });
A.known(pc);                    // what they know of the world
A.known(pc, { forGM: true });   // …including branches they permanently failed
```

⚠ **`withParents` is not a convenience.** A leaf granted alone is **inert**: they know the guild
exists and can never spot a member, because stage 2 climbs the ladder. Leave it on unless you
mean exactly that ("you have fought them, but you have never been to that city").

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
