---
title: "Attributes and knowledge — building the world through the people in it"
status: active
last_modified: 2026-10-11
tags: [context, foundry, attributes, knowledge, study, npc-ties]
---

# Attributes and knowledge — building the world through the people in it

**Read this when:** you are asked to create, link, or tune an **attribute** (a city, a district,
a guild, a disease), to change **what studying a monster tells someone**, or to turn a piece of
backstory into things players can discover.
**Not this file:** why any of it was designed this way → [`../plans/foundry-encounter-log.md`](../plans/foundry-encounter-log.md)
(history, never load it to operate the thing) · Joe's review panel, "the selected attributes",
review state → [`attribute-review.md`](attribute-review.md) · ties between people →
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
nothing is ever revealed automatically. Each identification rung and each tell is **one roll,
ever**: you know it or you do not, and a failure is permanent. An attribute's facts are not
rolled by players at all; the GM hands them over. Attributes form a **tree**, and *working something out* requires
knowing its parents, so depth costs *rolls* rather than a higher DC. A **GM's grant ignores the
tree** and may land anywhere in it — only blind rolls climb.

---

## Attribute or fact? Decide this first, every time

Joe's rule (2026-10-06): **a fact is how much you know about one attribute; an attribute is a
separate thing.** Get this wrong and the tree stops meaning anything.

| It is an **attribute** when… | It is a **fact** (a lore row on an attribute) when… |
| --- | --- |
| it names a *thing* someone can be placed in, belong to, be, or carry: a place, a group, an order, an illness, one person's history | it says *more about the same thing*: its customs, its secrets, an episode in it, how it works |
| a second creature could carry it, or it could stand on its own | it means nothing until you know the attribute it hangs on |
| it has facts of its own | it is a single piece of knowledge, learned once |

Then place each attribute:

- **It lives inside another attribute and you must know that one first:** make it a child (`parent`). For example, one circle inside a coven, or a district inside a city.
- **It is a separate thing that touches another:** keep it a root or put it under its real container. The link between them goes in a fact's text, not in the tree. An illness picked up in a city is not a child of the city.

Worked examples:

- **The witches of Elderholt** (attribute). Facts on it: the ward-runes are burned into the skin; the witches answer to the Elders; why outsiders almost never meet one. If a named coven or circle inside it has other members, that circle is a **child attribute**. If it is just a word for what all of them do, it is a **fact**.
- **A city-state** (attribute). Its ruler, its trade and its feud with the next town are **facts**. A guild in it with members is a **child attribute**.
- **One person's history** (personal attribute, `category: "personal"`). The episodes of that life are **facts on it**: the brother's fall, the debt, the night they were taken. Never make one attribute per episode.

Mistakes to avoid:

- **An attribute that is really a fact:** "Knows the Ward-Runes", which is something every witch does. Make it a fact on the witches.
- **A fact that is really an attribute:** "was one of the Still Hand", when the Still Hand has other members. Make the Still Hand an attribute.
- **Using `reveal` as a fact.** `reveal` is the *recognition* text: "you place them as one of these". What you know *about* the thing goes in facts. (`miss` is what they take away from a *failed* identification — shown to the player; leave it empty and a failure shows nothing.)

**Rarity is a DC on the root; depth is the tree.** Rare, hidden things get a hard root: witches and
mountain druids are DC 18–22. Common things get an easy one: a human city-state on the trade
roads is DC 10. Never raise every rung to make the bottom rare (see [Setting DCs](#setting-dcs--the-part-that-is-easy-to-get-wrong)).

**A carrier knows the attribute, not its facts.** A PC who carries an attribute knows they are
in it without ever rolling, but its lore rows still have to be **handed** to them. Use the
"Mark as learned" store (`flags.pentaryn-ties.granted["attr:<attrId>:<loreId>"]`) or the
share API in [Giving knowledge away](#giving-knowledge-away). That is how a PC "knows their own
facts".

More rules, learned building the 3200 A.F. one-shot PCs (2026-10-06):

1. **Visible tells are the carrier's own lore rows** (`flags.pentaryn-ties.lore` on the creature), not attribute facts. A red-etched arm is about *this person*; what the runes are is about *the witches*. A tell has no tree above it, so it is what a stranger gets on a first look.
2. **A fact must not identify a secret sibling.** A row on Caven's history may say "he worked out what she was"; it may not say "witch". A row on Marrith's history (parent: the witches) may not say "ward path", because Ward-Witches is its sibling. Describing an attribute's own children is fine; naming a sibling is not.
3. **People and place are two attributes.** The mountain or town is the cheap root (DC 10, `whenKnown: "advantage"`); the people, guild or path inside it is the rung that carries the difficulty. Never two roots for one membership, never one attribute for both. (Exception: when nobody is "of" the place without being in the group, as with Elderholt's witches, there is no place attribute and the rarity sits on the root.)
4. **Attribute facts are handed by the GM, not rolled by players.** The Attributes tab no longer offers a player roll (`attributes-ui.mjs` does not import `requestAttrLore`). The player-side channels are the identification cascade (`reveal`) and the carrier's tells, so write reveals with real content. A fact's DC is guidance for shares and Simulate.
5. **`whenKnown: "auto"` hands the rung to every stranger with no roll** (`planStep` grants an `auto` rung whether or not they know the attribute). Use it only for things truly obvious to anyone; a cheap root is `advantage` at DC 10.
6. **A failure hands the player its written failure text, or nothing when that is empty, and is recorded so there is no retry.** The failure text (`miss` on attributes and lore rows, rung 0 on a kind) is shown exactly like a pass — so it must never say it was a failure, never contain the pass text, and never contain a true gated detail.
7. **A carrier's self-knowledge is a direct `granted` write**, never a self-share of an identification (that would file them in their own Known list). Recipe: [Building a player character's attributes](#building-a-player-characters-attributes).
8. **A failed rung is permanent.** An inspect climbs until the first miss, and that miss is a lockout for that character on that attribute (`failedAttribute` in `planStep`): inspecting again never re-rolls it, and nothing below it can be reached. Passed rungs are never re-rolled either. So the chained odds are lifetime odds, and a rare root with a low-skill inspector is a real wall; only a GM share gets past it. Visible tells (the carrier's own lore rows) are NOT part of the inspect cascade: each is a separate one-roll-ever study gesture (`study.as(character, subject, {loreId})`).

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

**Reviewing.** Joe reviews every entry in a GM panel (tag icon, left toolbar). `A.create` and
`A.update` **un-review** what they touch and record the fields in `touched`; when he says "the
selected attributes", read `A.selected()` first. Never sign anything off for him. Details:
[`attribute-review.md`](attribute-review.md).

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

**The simple path: `ensure`, then `link` by name.**

```js
const A = game.pentaryn.ties.attributes;
await A.ensure("Ashfall Company", { category: "faction", parent: "The Undercity", dc: 14 });
// → { ok: true, entry: { id: "ashfallcompany", … }, existed: false }   — created
// → { ok: true, entry: { … }, existed: true }                          — already there, UNTOUCHED
await A.link(vess, "Ashfall Company");
```

`ensure` returns the entry that already has that name (or id) **without modifying it** — the
options are only used when it has to create — so re-running a script is always safe. It refuses
rather than guessing on a blank title (`empty`), a name two legacy entries share (`ambiguous`,
with `candidates`), or a title whose id belongs to an entry that has since been **renamed** to
something else (`collision`, with `existing`): that entry is not called this any more, and a new
one would duplicate its id. Use `"… 2"` for a different one, or link the renamed entry by its id.

`create` is the **strict** form: a name or id already in use is refused, never overwritten.

```js
await A.create("Ashfall Company", { category: "faction" });
// → { ok: true, entry: { id: "ashfallcompany", … } }
await A.create("ashfall company");
// → { ok: false, reason: "collision", existing: { id: "ashfallcompany", … } }
```

Both take **the whole entry** as options — `category`, `icon`, `parent`, `dc`, `skill`, `secret`,
`whenKnown`, `whenCarried`, `reveal`, `miss`, `hold`, `lore`, `source` — so an attribute is one
call, not a create followed by updates. `parent` is an id or a name and **must already exist**
(`{ ok: false, reason: "notFound", field: "parent" }` otherwise), so create parents first.

The **id is derived from the title** — lowercased, accents stripped, everything but `a–z0–9`
removed. So `"Ashfall Company"`, `"ashfallcompany"` and `"Áshfall Company"` are the same
attribute. **Names are unique** under that same folding, and the rule holds on rename too.
Want a genuinely different one with a similar name? Add a digit — `"Ashfall Company 2"` →
`ashfallcompany2`.

`category` is free text and only groups things in the picker. Useful values in play:
`place`, `faction`, `condition`, `people`, `trade`.

### Naming an attribute: id or name, everywhere

Every call that takes an attribute — `link`, `unlink`, `update`, `remove`, `tell`, `repair`,
`stale`, `describe`, and `parent` in `create`/`update`/`ensure` — accepts **an id, a name, or an
entry object**. One rule decides, in order:

1. an exact **id** (`"ashfallcompany"`);
2. a **derived** id (`"species:High Elf"` → `species:highelf`) — these exist without an entry;
3. for `unlink`, any id **that actor carries**, even one whose entry is gone;
4. a **name**, ignoring case, accents, spaces and punctuation (`"Ashfall Company"`).

**A miss is refused, never created** — `{ ok: false, reason: "notFound" }` — so a typo cannot
link to nothing, write a ghost knowledge row, or spawn a duplicate. Two entries sharing a name
(legacy only) gives `ambiguous` rather than a guess. Id beats name: after crossed renames (`x`
retitled "Y", `y` retitled "X"), `"x"` means the entry whose id is `x`. A derived id with no entry
has no name to look up — name it by id (`"species:elf"`).

```js
A.resolve("Ashfall Company");  // "ashfallcompany" — or null. Cheap; check before acting.
A.lookup("Ashfall Company");   // the display record, or null if it names nothing
```

`A.lookup` was `A.describe`, and `S.examine` was `S.inspect`, before 2026-10-11 (D1: `describe`
and `inspect` are names the kit API reserves). The old names were removed in wave 3 ([declared]
B1b) and now read as undefined.

### What every write returns

**Reads return data. Writes return `{ ok, reason?, … }` and never throw.**

| Call | Success |
| --- | --- |
| `ensure(title, opts)` | `{ ok, entry, existed }` |
| `create(title, opts)` | `{ ok, entry }` |
| `update(ref, patch)` | `{ ok, entry }` |
| `remove(ref)` | `{ ok, entry }` (the one removed) |
| `link(actor, ref)` / `repair(actor, ref)` | `{ ok, id, actorId, added, unsuppressed }` — both empty means it was already linked |
| `unlink(actor, ref)` | `{ ok, id, actorId, removed, suppressed }` — both empty means it was not carried |
| `tell(pc, ref, opts)` | `{ ok, ids }` |

`reason` on failure is one of `notGM`, `empty`, `notFound`, `ambiguous`, `collision` (with
`existing`), `cycle`, `invalid`, `writeFailed`.

⚠ **`{ ok: false }` is truthy.** Test `.ok`, never the result: `if (!(await A.update(…)).ok)`.

---

## Linking a creature to an attribute

```js
const A = game.pentaryn.ties.attributes;
const vess = game.actors.getName("Vess Tarrow");
await A.link(vess, "Ashfall Company");    // by name — or "ashfallcompany", same thing
// → { ok: true, id: "ashfallcompany", actorId: "…", added: ["ashfallcompany", "theundercity", "greyharbour"], unsuppressed: [] }
await A.link(vess, "Ashfal Company");     // typo
// → { ok: false, reason: "notFound" }    — nothing written, nothing created
await A.unlink(vess, "Ashfall Company");
// → { ok: true, id: "ashfallcompany", actorId: "…", removed: ["ashfallcompany"], suppressed: [] }

A.ids(actor);   // ["type:humanoid", "size:med", "ashfallcompany", …] — everything they carry
A.of(actor);    // the same, as display records with titles and icons

// ⚠ `kind:` is the one derived namespace these console reads miss: the kind resolver is a
// parameter and defaults to null. Gameplay passes it internally, so this only affects you.
A.ids(actor, game.pentaryn.ties.study.kindActor);
```

`link` never creates. If the attribute might not exist yet, that is two explicit calls —
`await A.ensure(name, opts)` then `await A.link(actor, name)` — and that is the point.

**Linking writes the ancestors too.** Linking a guild that sits under a district under a city
writes all three, because being in that guild *means* being of that district and that city.
Unlinking a parent removes its descendants for the same reason. Each link or unlink is **one**
actor update.

**A link from an unlinked token lands on the world actor**, like ties do: linking one of three
"House Barrabin Jailer" tokens links the actor, so every jailer token — and the next one placed —
carries it, and `stale()`/search see it. (Exception: a token whose delta already holds its own
attribute flags keeps being edited there, so nothing gets stranded. None exist in Pentaryn as of
2026-10-05.)

**Some attributes are free — you never link them.** These are derived from the stat block every
time and cannot be edited:

| Namespace | From | Example |
| --- | --- | --- |
| `type:` | `system.details.type.value` | `type:humanoid` |
| `size:` | `system.traits.size` | `size:med` |
| `species:` | the embedded `race` item | `species:human` |
| `background:` | the embedded `background` item | `background:entertainer` |
| `kind:` | the kind pointer, when it points elsewhere | `kind:<actorId>` |

A `kind:` id is an actor id, so it keeps its case (only `A–Z a–z 0–9`, at most 64). Entries
written for one before 2026-10-12 were stored lowercased and never matched; the GM's ready step
rewrites each to the one actor it matches ignoring case, and leaves it alone otherwise.

To make one *not* apply to one creature, `A.unlink(actor, "type:humanoid")` — it is suppressed
rather than deleted, because it would otherwise be recomputed a moment later. (`kind:` cannot be
suppressed this way: unlink does not have the kind resolver.)

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
`A.update("b", { parent: "a" })` returns `{ ok: false, reason: "cycle" }` and leaves the parent alone, with a notification
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
  miss:   "A grey collar, nothing more.",  // shown on a FAILED identification; "" = nothing
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

**A failure hands over its failure text — or nothing.** Every discoverable thing has a pass side
and a fail side (`reveal`/`miss` on an attribute's identification, `text`/`miss` on a lore row,
15/20/25 vs rung 0 on a kind). Either way the lock is written and the stub posts, so there is no
retry (Joe, 2026-10-08; history in [`../plans/attribute-silent-failure.md`](../plans/attribute-silent-failure.md)).

- **Fail side empty → nothing.** No card, no Known-list entry, no title, no placeholder.
- **Fail side written → that text, as an ordinary card.** It lands where a pass would (Known tab,
  Look window, Attributes tab for attribute lore), in the same shape — so write it as what their
  character takes away (a partial or misleading impression), never as "you failed", and never
  with the pass text in it. The editors label it *"On a failure (shown to the player — leave empty
  to show nothing)"*.
- **A failed identification's text** files on the *creature's* page (grant key
  `lore:<actorId>:#idmiss-<attrId>`, `identMissKey`), titled with the creature's name — never under
  the attribute, whose title would give the membership away. The ident ledger row still records
  `text: ""`, so every GM ledger reads the rung as not identified. It is delivered at once (the
  `hold` gate parks passes only). Resetting the identification takes the card back.
- **Held lore failures** park their failure text like a pass and **Deliver** hands it over.
- **What the player can tell.** With no failure text: on the Inspect cascade nothing (the rungs
  roll chat-less); on a tell or kind study, no card after a labelled button means they know *that*
  it failed, never *what* they missed. With failure text: a card, the same as a pass.
- **A row needs pass text to be offered.** A lore row with only `miss` is not drawn as a button —
  it has nothing true to find — but it still resolves, so Share/Forget and existing cards keep
  working (`loreOfferable` vs `loreRollable`).
- **Your ledgers still know.** "Missed it", the Beliefs list's *missed* tag, `shareStatus`
  *failed*, Share over a failure and Forget giving it back all work as before.
- **Cards from failures.** `S.audit.legacyMissCards()` (console only, read-only) lists every card a
  failed roll put on a sheet. Since 2026-10-08 a lore/attribute card there is usually intended;
  a kind card below 15 without the current rung 0 is the retired generic line — pull by hand.
- **Rolls already made between 2026-10-07 and 2026-10-08** delivered nothing on a failure. They
  are locked and stay empty; **Share** the failure text by hand if you want them to have it.

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
DC and its own one-shot lock. Players do not roll these from the Attributes tab: the GM hands
them over ("Mark as learned", or `S.share` with `ns: "attr"`), and the DC is the guide for
whether a character would plausibly know it:

```js
const entry = A.lookup("ashfallcompany");
await A.update("ashfallcompany", {
  lore: [
    ...entry.lore,
    { id: foundry.utils.randomID(), label: "What they swore at the Cairn",
      skill: "his", dc: 14,
      text: "They swore to keep the pass shut. Every one of them is bound to it.",
      miss: "", hold: false }   // miss: shown on a failure; "" = a failure shows nothing
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
| under 15 | nothing at all — unless you authored rung 0 (below) |
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
  { min: 0,  text: "A big lizard. Bad-tempered, probably." },      // the LIE, on a miss (optional)
  { min: 15, text: "Ashmaw of the Cinder Reach. The songs name her." },
  { min: 25, text: "…and the songs say she sleeps on a floor she cannot leave." }
]);
```

**Rung 0 is the failure case; 15/20/25 are the truth.** That split is the point — you can look at
a monster and see at a glance what is false and what is world-building. A miss with no authored
rung 0 gives **nothing**: no card, no header (the generic *"nothing means anything to you"* card
was removed in 2026-10). Rung 0 is optional and nothing nags for it; it is the kind's failure
text, like `miss` on a lore row or attribute, so write it only when you want a failure to mislead. It
wears exactly the pass shape (header + description), and it must never contain a true gated
detail. The GM's release select labels it "Mark as failed (rung-0 text if authored, else
nothing)".

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
// parents first — `parent` must already exist. Safe to re-run: ensure never edits what it finds.
await A.ensure("Greyharbour", { category: "place", dc: 10, whenKnown: "advantage", whenCarried: "auto",
  reveal: "The long Greyharbour vowels — a local, born and raised." });
await A.ensure("The Undercity", { category: "place", parent: "Greyharbour",
  dc: 12, whenKnown: "advantage", whenCarried: "auto",
  reveal: "Undercity born — they never quite look up." });
await A.ensure("Ashfall Company", { category: "faction", parent: "The Undercity",
  dc: 14, whenKnown: "enables", whenCarried: "auto", hold: true,
  reveal: "A grey pin, worn inside the collar." });
await A.ensure("Forge Lung", { category: "condition",
  dc: 12, skill: "med", whenKnown: "advantage", whenCarried: "advantage",
  reveal: "That cough has a wet catch at the end. Forge lung — years of it." });

const vess = game.actors.getName("Vess Tarrow");
await A.link(vess, "Ashfall Company");  // writes the district and city too
await A.link(vess, "Forge Lung");
```

Because `ensure` leaves an existing entry alone, **changing** one later is `A.update(name, {…})`,
not another `ensure`.

Judgement calls worth making consciously:

- **Sub-place only when it means something.** A district earns a rung if people can be *placed*
  in it. "The east side of town" usually cannot.
- **The illness has no parent.** It is not part of the city; anyone can have it. Only nest things
  that genuinely contain each other.
- **The guild holds at `hold: true`** because it is the payoff — you want to narrate that one.
- **The city is DC 10 at `advantage`**, so it is nearly free and the deeper rungs are reachable.
  Not `whenKnown: "auto"`: that hands the rung to every stranger with no roll at all.

---

## Building a player character's attributes

For pregens and one-shots, where the player must learn who they are from their own sheet and
learn others by inspecting. Worked example: the three 3200 A.F. PCs in
[`../pentaryn.md`](../pentaryn.md).

1. **Tree.** One attribute per thing they can be placed in (place → people/guild/path →
   `"<Name>'s History"`, `category: "personal"`). Episodes of the life are facts on the history.
   `A.ensure` parents first; keep the lore row ids each call returns.
2. **Tells.** 2–4 rows on the PC's own `flags.pentaryn-ties.lore` (`{id,label,skill,dc,hold:false,text,miss}`),
   DC 10–14, no gated secret in the text (`miss`, if written, is shown on a failure; empty = nothing). This is what a stranger gets on a first inspect.
3. **Link** the leaf (`A.link(pc, leafId)` writes the ancestors). `A.broken(pc)` must be `[]`.
4. **Self-knowledge** — the carrier sees every carried attribute already; hand them the facts
   with one read-modify-write of `granted`, staggering `when` so rows render in authored order
   (`grantsForEntry` sorts by `when`, then key):
   ```js
   const granted = foundry.utils.deepClone(pc.getFlag("pentaryn-ties", "granted") ?? {});
   let t = Date.now();
   const entry = A.lookup(attrId);
   for (const row of entry.lore) granted[`attr:${attrId}:${row.id}`] =
     { text: row.text, when: t++, icon: entry.icon, source: `${entry.title} — ${row.label}` };
   await pc.update({ "flags.pentaryn-ties.granted": granted });
   ```
   Skip rows their bio already says. Never `S.share({ns:"ident"})` a PC about themselves.
5. **Story-given knowledge of each other** — `S.share({ns:"ident", subjectId, attrId}, [pc], {notify:false})`
   **one rung at a time, root first** (a share writes exactly one rung, never parents), then
   `S.share({ns:"attr", subjectId, attrId, factId}, [pc], {notify:false})` for facts. Check each
   ident with `S.identified(subject, pc, attrId).carries`. No `A.tell` first; the share already
   writes stage-1 knowledge. Leave one cheap rung unshared if it gives a player a fun roll.
6. **The city they are in**: `A.tell(pc, cityId)`, not a link, unless they are actually of it.
7. Never roll or `inspectAs` on the real PCs; Joe reviews every new entry in his panel.

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

### Sharing a fact — the inspect window's player view

Open the GM inspect window on an NPC: the **flask** button on the token HUD (GM only), or
`S.preview(npc)`. It opens on **Player view** — every fact this NPC could hand a player who passed
every check, drawn with the Known tab's own cards: identification reveals root → leaf, then
attribute lore, then the NPC's own lore rows, then the kind study at tier 25. **Simulate rolls**
(the toggle at the top) is the old dice bench, unchanged: hypothetical or real roller, random
rolls, odds, Reroll, nothing saved.

Under each card is a GM row of **switches, one per PC** (first name), and **Share with all**. One
click each, no dialog; the row follows the table **live** while the window is open in Player view
(debounced ~150 ms: the subject/kind `beliefs` flag, the PCs' `granted`/`studied`/`known` flags, the
`attributeBeliefs` / `attributeKnowledge` settings; a structural change — lore rows, the registry,
the PC roster — re-renders the view with its scroll kept). Simulate mode never live-refreshes.

| Switch | Means | Click |
|---|---|---|
| on (violet) — passed | rolled and made it (or recognised it on sight — an `auto` rung) | nothing: a real roll can't be un-learned (a kind below tier 25: tells them the rest) |
| on (violet) — told | a share, a `release`, or "Mark as learned" — tooltip says who it came from | **Forget** — undoes the share |
| amber — held | rolled, waiting on your **Deliver** | nothing — use Deliver (it also resumes their climb) |
| off, red edge — failed / locked | rolled and missed on this NPC / failed this rung for good | **Share** — over the failure; Forget gives the failure back |
| off — none | nothing | **Share** |

A failed lore or attribute-lore roll stores its verdict (`pass: false`) on the belief row, with
its failure text (or `""` when none is written) as `text`. A row with failure text still reads
*failed*, not *passed*, off that verdict; rows from before the field are graded from their
`total` against the row's DC.

A switch share is **from you** and whispers the player. The API still takes a PC as the source
(`from`), which makes the card read *"House Vrinn — shared by Caven"*. It writes **exactly what a
pass writes**, marked as told — the ledger's own convention, `total: null`, plus `from` (the
sharer's id or `"gm"`) — and files the NPC in their Known list so the fact has a page. The whisper
is content-free (*"Talo has learned something about Vesh. It is in their notebook."*), to the PC's
non-GM owners only, and is skipped when only a GM owns them.

Under a **personal** attribute (category `personal`), the sheet's Attributes tab and the review
panel show a read-only **Clues on <carrier>** line: that character's own lore rows with skill and
DC.

```js
await S.share({ ns: "ident", subjectId: vesh.id, attrId: "housevrinn" }, [talo], { from: caven, notify: true });
await S.share({ ns: "attr", subjectId: vesh.id, attrId: "housebarrabin", factId }, [talo]);
await S.share({ ns: "lore", subjectId: vesh.id, factId }, [talo, marrith]);
await S.share({ ns: "kind", subjectId: vesh.id }, [talo]);         // always tier 25
S.whoKnows({ ns: "ident", subjectId: vesh.id, attrId: "housevrinn" }, talo); // {status, total, from, …}
await S.forget(spec, talo);                                        // undo a share (told only)
```

**The chain rule.** A shared identification counts as a delivered positive identification of that
rung **on that NPC** *and* as stage-1 knowledge of the attribute — **over a failure too**. Those are
the two rows the planner reads, so the recipient's next Inspect climbs past it and **rolls the
child rungs** (share House Vrinn → they may now roll Vesh's History). A share never writes children
or parents: only what you shared. Knowing House Vrinn does not identify it on any *other* carrier
— on Nilonim they still roll it (at advantage, if its help scale says so).

Refused: a rung with no reveal text (a blank row reads as *not carrying* and would block every
child), a draft lore row, anything the NPC does not carry, and any recipient already passed/told
or held. A kind they know below tier 25 *is* shareable, which raises them, but the Share dialog
leaves them unticked. Tick them yourself if you mean it. An identification's tag reads only the
row on *this* NPC. Placing House Vrinn on Nilonim doesn't count as knowing it on Vesh. Sharing over
a pass still held on another NPC releases that pass, so the attribute appears in their list.

⚠ **Attribute lore of a secret attribute renders under an NPC only for someone who has placed
them in it.** Share the identification first, or the fact is written but not shown on that page
(the Share tells you when this happens).

**What the player sees of it (0.18.0).** When a player takes a closer look (double-click menu,
the 4 key, or the HUD eye), a read-only **Look window** opens for them before the dice roll. The
menu's **What I know about them** opens it with no roll. It shows exactly that character's
`granted` cards for this NPC, in this view's order, with no switches and no pass/fail. A switch you
flip on appears there live, with its "— shared by" line where there is one. Forget removes it. A
held rung appears only after your Deliver. Attribute cards obey the same placement rule as above.
`S.look(npc, pc)` opens it from the console. It returns `null` for a GM.

---

## Undoing things

```js
await S.resetIdent(pc, creature, "ashfallcompany"); // re-roll this one creature
await S.resetInspection(pc, creature);              // clear every rung on this creature
await S.reset(pc, kind);                            // un-spend a kind study
await S.reset(pc, npc, loreId);                     // un-spend one of an NPC's lore rows
await S.reset(pc, carrier, loreId, attrId);         // un-spend an attribute lore fact
```

**Where the rows are.** A character's identification rows live on the **creature**,
`npc.flags.pentaryn-ties.beliefs[pc.id]`, never on the PC. (The PC's own `beliefs` flag holds what
*others* worked out about the PC.) `resetInspection` clears those rows and any failure line that
roll handed over. It leaves the PC's `attr:<id>:#id` card, because that card belongs to the
attribute, not to this creature. So afterwards the Look window shows nothing for this creature,
and the next closer look rolls every rung again. Snapshot `npc.flags.pentaryn-ties.beliefs` before a
reset you plan to undo. A restore written to the PC's flags lands in the wrong place (usability
run 2026-10, Area 7).

⚠ **If the botched roll was that character's first contact with the attribute, the failure also
wrote the permanent "never knew of it" — and `resetIdent` alone leaves the branch dead.** Follow
it with `A.tell(pc, id, { withParents: true })`, which overwrites the failed row.

**Undoing a share:** the **×** on a *told* tag in the inspect window, or `S.forget(spec, pc)`. It
puts back whatever the share replaced: a failed roll stays failed and locked, and a kind tier they
rolled (say 20, raised to 25 by the share) comes back with its card. If they had nothing before,
the row and lock go, as a reset would. Forgetting never gives a free re-roll and never takes away
something they earned.

For an identification, the stage-1 row and the reveal card belong to the *attribute*, not to this
NPC. Both stay while **any** other NPC is still identified for them, whether rolled or shared.
Otherwise the stage-1 row the share wrote is dropped, and a share laid over a failed stage-1 roll
turns back into that failure. Rolling and passing a rung you only knew from a share makes that
knowledge theirs (`via` becomes `roll`), so a later forget can't touch it. Only a share can be
forgotten. The Known entry the share filed stays in their notebook.

**There is no reset for world knowledge, by design.** A failed stage-1 roll is permanent — *"you
either know about the assassin guild or you do not."* The way back in is `A.tell()`, which is a
story act rather than an undo.

---

## Checking your work

```js
A.broken(actor);            // this actor's bad links — should be empty (see below)
A.stale("Ashfall Company"); // carriers holding an outdated ancestry after a re-parent
S.beliefs(creature);        // who has worked what out about this one, and what they were told
S.pending();                // everything held, waiting on you
```

`A.broken(actor)` is the one "are this actor's links correct" check. Two kinds of row:
`{ id, missing }` — an ancestor is not carried; fix with `A.repair(actor, id)` (the sheet's wrench
button does this) — and `{ id, missing: null, dangling: true }` — an authored id whose entry is
gone; re-create the entry with that id, or `A.unlink(actor, id)`.

⚠ **Re-parenting goes stale.** Move an attribute under a different parent and existing carriers
keep the old ancestry. `A.stale()` finds them; re-link to fix. Never silent, never automatic —
re-shaping the world is an authoring act. In each row, **`missing` is the reliable signal**;
`extra` is advisory — it lists every authored root not under the attribute, which includes the
old ancestor *and* any independent membership (an unparented illness), so read it before
unlinking anything in it.

After changing the module's attribute code: `node test/known.mjs` in
`foundry/module/pentaryn-ties`, then `make foundry-ties-sync` from the repo root.

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
  missing, check whether Foundry is open twice. The attribute-belief ledger is one setting written
  whole, so each write re-reads it a quarter-second later and re-applies its own row if the other
  session's write wiped it (AC-2).
- **In combat, inspection is once per combatant per round — marked, not refused.** A second look in
  the same round warns the looker ("already taken a moment…") and still runs; the mark counts in every
  started combat the character is in, not only the one the client is viewing (ES-5). The tempo warnings still *can* fire —
  the counter clears when combat starts, not each round, so two stationary looks on consecutive
  rounds reach the first threshold — they are just rare in a fight.
- **A failed roll is forever.** Before raising any DC, ask what it closes.
