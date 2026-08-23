---
created: 2026-08-22
last-modified: 2026-08-23
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design", "#proposal"]
status: phases 1–3 built 2026-08-23 (phase 3: the study conduit — blind GM-side rollSkill over the socket, kindOf resolution + a minimal pointer picker, authored tier messages with the derived fallback, graded reveal into the kind entry, the studied lock + belief ledger, combat warning, GM reset, and the Deliver/Later approval gate; two-client indistinguishability run passed, held variant included) (Known tab: schema, hardened reader + 34 node fixtures, entry rows, add picker, multi-tab injection; the canvas key that files a hovered token, proved as GM and as a player) — the rest still proposed; judged 2026-08-22; amended same day three times (kind/individual knowledge split; Past Encounters reinstated as a capped tab; the blind rework — authored tiers that may lie, GM-thrown blind rolls, plaintext reveals, encryption designed as a later opt-in); fourth pass same day added the build-and-validate gate (incl. the beliefs-as-lock correction and the disguise recommendation); disguise ruled 2026-08-23 (Joe's pointer design → foundry-disguise.md) — phase 5 unblocked; attribute layer judged 2026-08-23, after phases 1–3 shipped (decisions 15–21: the granted-region rework phases 1–3 owe — reveals must leave the editable notes field — kinds and attributes coexist, the registry as a GM-only world setting with derived links computed never stored, RAW-default advantage predicate, attributes as the new phase 6, encryption renumbered 7); rework + phases 4–7 not built
---

# The Known list — a player-built monster manual

**Read this when:** building the Known-list / Study-roll feature. **Design doc — phases 1–3 built;
4–6 unbuilt.** The three `As built` sections near the bottom are the record of where this plan was
wrong; read them before trusting a decision above them.
**Not this file:** the ties module this extends → [`foundry-npc-ties.md`](foundry-npc-ties.md) /
[`foundry-npc-ties-gui.md`](foundry-npc-ties-gui.md) · reading the owned books →
[`../foundry/rules-lookup.md`](../foundry/rules-lookup.md)

> **Goal, in Joe's words.** Every token a character has *seen* is listed, in the order they saw
> it. The player can open any of them and add their own details — and doing that promotes the
> entry from a raw sighting to something they **know**. The known list is theirs to organise.
> Monsters go in the same list as NPCs, and a player can **roll** to learn what a monster
> actually is: description, then immunities, then its real attacks and damage. Over a campaign
> they build their own monster manual, in their own words.

Every API named below was verified on this machine against core **v14.365**
(`foundry.mjs`), the server `dist/`, and **dnd5e 5.3.3** (`dnd5e.mjs`), with line numbers.
The blind-rework amendments were verified against the build now installed — **v14.367**,
Electron 41.3.0 / Chromium 146 — so line numbers in amended text are from that read.
Nothing here is assumed.

---

## The verdict: three features wearing one coat

The draft called this "one feature with four moving parts." It is three features, and they do
not carry equal weight:

| Feature | Value | Risk | Fate |
| --- | --- | --- | --- |
| **The Known list** — player-curated entries, categories, promotion-by-writing | The actual product: the monster manual in their own words | Low — it is the ties tab's patterns with a new schema | **Build first** |
| **The Study roll** — the blind, tiered ladder + GM secrets | What makes the manual *play* like D&D instead of a notes app | Medium — roll API and blind rendering verified; the conduit adds one socket hop on relay.mjs's proven pattern; extraction scoped by the MM pack | **Build second** |
| **Past Encounters** — automatic sighting log | A feeder and a memory aid | High — carries P3; P4 solved by Joe's cap | **Ships, last** — amended below |

> **Overturned same day.** The first verdict here — ~~"the Seen list as Joe described it
> should not be built"~~ — cut the feed on two objections, and Joe answered both without
> touching the part that was actually hard: **it gets its own surface** ("we can make it a
> tab… then it doesn't matter it's a long list"), which kills the buried-GM-inbound worry,
> and **it caps at 100 rows, oldest falling off**, which kills unbounded growth by
> construction. The judgement that survives from the cut verdict: the entries anyone cares
> about are the promoted ones — Joe's own reasoning ("that's why all the people they added
> descriptions to are at the top") — so the feed stays what it always was, the raw chronicle
> behind the Known list, and everything this plan concluded about *how* to log safely
> (decision 9: cached token names, no GM client, `sightRefresh` + debounce + two passes)
> stands unchanged and is now load-bearing rather than optional.

**Past Encounters ships as the final phase.** It still depends on nothing and nothing
depends on it; the sight machinery is verified (P3); the kill switch stays, because a
client-side logger earns trust in a real session, not a plan.

---

## The decisions

### 1. It lives inside `pentaryn-ties`, as its own tabs (settles P8 and open question 4)

**Inside the module.** It shares `baseActorOf`, the `isVisible` discipline, the sheet-tab
injection machinery (including the nav-rebuilt-separately trap `injectTab` already solves),
the notes caps, the i18n plumbing, the `playerAccess` kill-switch pattern and the
`make foundry-ties-sync` step. A second module would import half of `ties-api.mjs` and double
the sync-and-restart surface for nothing. New files (`known.mjs`, `study.mjs`), new flag keys,
same module.

**Its own tabs, not "below" the ties list.** The ties tab already carries outbound rows, the
here/elsewhere split, the add bar and the GM-only inbound section; a Known list of thirty
entries underneath would push the GM's inbound section below the fold of every sheet. The
new tabs inject beside Ties on **character** sheets only (`renderCharacterActorSheet` is
already in the hook list) — NPCs don't keep notebooks. Different data, different tab, one
design language.

**Three tabs, and that is right: Ties · Known · Past Encounters.** Judged against the
alternative — one Known tab with an internal Known/Past-Encounters segment — and the tabs
win on Joe's ask *and* on state: he said "make it a tab" outright, a real tab rides the
sheet's own tab state for free where a segment is one more piece of repaint-surviving state
of ours (the exact species the GUI plan keeps working to delete), and the two surfaces have
different row species anyway — editable entries versus a read-only chronicle. The cost is
one more icon in the sheet nav and one more pass through the (already generic) injection
guard. If the nav ever feels crowded in play, folding Past Encounters into a segment is a
change of mount point, not of design — noted and deferred.

### 2. Known: writing is still the gesture — and there is no Seen list to promote from (yet)

The best sentence in the draft survives: **the act of caring about someone is what files
them.** No "add to known" button. An entry exists because the player wrote something.

Until Past Encounters ships (the final phase), entries are created two ways, both existing
idioms:

- **Canvas key** (hover a token, press the key — same pattern as `6`/`8`): opens that
  creature's Known entry for this player's character, creating it if new. Resolves through
  `baseActorOf` (three goblin tokens = one entry), filtered through `Token#isVisible` so a
  hidden token cannot be filed.
- **The tab's "Add…"**: a picker of LIMITED-visible actors, the `candidates()` filter,
  for filing someone off-scene.

**Schema**, on the character actor, hardened-reader contract identical to `read()`:

```js
flags["pentaryn-ties"].known = [
  { id: "<actorId>", name: "Goblin",      // cached name, live-resolved when possible
    category: "beasts",                    // key into knownCategories
    notes: "",                             // their manual entry — prose, NOTES_MAX
    when: 1755900000000 }                  // first filed — the list's default order
]
flags["pentaryn-ties"].knownCategories = [ { key, label } ]  // seeded Sentient + Beasts
```

> **Schema addendum 2026-08-23, from the disguise ruling
> ([`foundry-disguise.md`](foundry-disguise.md) decision 5a):** entries gain one optional
> field, `imposter: <timestamp>` (absent = never) — the **"Impersonated"** marker, set
> GM-side by the study conduit when a character pierces a disguise layer they had been
> keeping this record on. It claims only "someone was wearing this face" — never
> "this identity is an alias", because a borrowed real face (Joe's own hard case) makes
> that false and the module cannot tell invented from off-screen-real. Additive, no
> migration — but ⚠ `toStoredKnown` as shipped maps a **fixed shape and silently drops
> unknown fields**, so the field must land in `readKnown` *and* `toStoredKnown` plus
> fixtures in one change, or the first notes-edit after a reveal erases the marker.
> Notes are never moved or split at reveal — Joe's rule: *"keep the pointer dumb… it's up
> to the player to fix their notes."*

> **Schema addendum 2026-08-23, from the attribute ruling (decision 15):** `notes` holds the
> **player's words only**. Granted knowledge — study reveals, lore texts, disguise reveals —
> lives in a sibling `flags["pentaryn-ties"].granted` map on the character, joined onto
> entries at render as a read-only region below the notes. It is deliberately *not* an entry
> field, which is what keeps it out of `toStoredKnown`'s reach entirely; `imposter` (above)
> remains the one truly per-entry addition and rides decision 15's rework commit.

### 3. Categories: the dropdown, exactly as drafted

Kept without amendment — a per-entry `<select>` with **"new category…"**, defaults
**Sentient** and **Beasts**, both renameable. Auto-default on creation:
`system.details.type.value === "humanoid"` or a `character`-type actor → Sentient; every
other creature type → Beasts (path verified in dnd5e.mjs — `details.type.value` drives the
NPC sheet at 58122). The list orders by category, then `when` — sighting-order *within the
player's own grouping*, which is the part of "the order they think of them" that survives
contact with a `<select>`. Drag-to-reorder stays rejected (below).

### 4. Knowledge has **two axes**: the kind and the individual — amended same day

> **Amended 2026-08-22, same day, before build.** The first version of this decision keyed
> *all* knowledge by world actor and called that "per-type in practice". Joe caught the
> conflation: *"there is knowing what a goblin is and then there the character name. you can
> roll history to know who that goblin is, then you can roll to know what a goblin is."* He
> is right, and both of his examples resolve to History — the **skill cannot distinguish the
> axes, only scope can**, so scope has to be data. The per-actor keying handled stock
> monsters correctly and named NPCs wrongly in two different ways: a named NPC built as its
> own actor (how this world builds recurring characters) had no path to the kind question at
> all — one roll on Grix would mark him "learned" and never ask what a goblin is — while a
> named NPC built as a renamed token put the kind right and left the individual's lore with
> nowhere to live but the scene-local token, the exact wall the worn mark hit.

| Axis | Answers | Scope | Mechanism | Roll |
| --- | --- | --- | --- | --- |
| **Kind** | *What is a goblin?* | every creature of that kind, forever | the graded Study ladder (decision 5) | one graded roll, skill from creature type |
| **Individual** | *Who is Grix the Gutter-King?* | this one creature | GM lore rows (decision 8) | flat pass/fail per row, skill and DC the GM's |

**The kind of an actor is resolved by one rule: an optional GM-set pointer, else itself.**

```js
// on any NPC actor, GM-set, optional:
flags["pentaryn-ties"].kindOf = "<worldActorId>"   // e.g. Grix → the world "Goblin" actor
// resolution, everywhere the ladder looks:
const kind = game.actors.get(actor.getFlag(MODULE, "kindOf")) ?? actor;
```

- **The pointer is a world-actor id, never free text.** The graded ladder needs a stat
  source — a name, art, a biography for tier 15, traits for tier 20, attacks for tier 25 —
  and a text key has none. If the world lacks a base "Goblin" actor, the GM imports one from
  the MM compendium (504 actors sitting right there); that import *is* the authoring act.
- **The stock-monster case is byte-identical to before.** A plain Goblin token resolves
  through `baseActorOf` to the Goblin actor, whose kind is itself: one roll, one entry, no
  pointer, no ceremony. The pointer is optional-in-practice — it exists only for named
  individuals whose sheet is not their kind.
- **An individual who matters gets their own world actor.** A renamed token of "Goblin" is
  fine for a goblin with a nickname — its kind resolves right and it needs no lore. The
  moment the GM wants individual lore rows on it, it becomes its own actor with
  `kindOf` set — same precedent the worn mark established for anything scene-transcending.
- `details.type.value` is deliberately **not** the implicit kind — "humanoid" would make one
  goblin teach all humanoids. Creature type keeps the one job it had: choosing the skill via
  the Areas of Knowledge table.
- The two axes lock **independently** (decision 5): a character can know who Grix is without
  knowing what a goblin is, and the reverse. Both remain per **character**, not per player.

### 5. The Study roll: **one roll per kind, graded** — this is the whole P5 answer

> **Amended 2026-08-22, same day, before build — the blind rework, part 1: tier content is
> authored, and lower tiers may lie.** The first cut of this decision treated the ladder's
> content as *extraction* — the kind's real biography, real traits, real attacks — and the
> sub-15 rung as a mechanical necessity ("a line saying they don't recognise it", so the
> player knows they failed). Joe's falsity ruling replaces both. **Tiered messages are a
> first-class authoring concept, and a lower tier may be deliberately FALSE**: a 15 can hand
> the player a confident, wrong description; 25 gives the truth. That is the feature, not an
> abuse of it — a knowledge check that can only say true things or nothing is a lookup
> table, and what this builds is folklore. Consequences, each load-bearing:
>
> - The table below still says what a total *buys*; what changed is what the purchase
>   contains. Each rung delivers the GM-authored **tier message** for that kind when one is
>   written, and the derived stat-block prose of the original design only as the unauthored
>   fallback (which is always true, because it is read off the real sheet). Schema, on the
>   kind actor beside its lore rows, sparse — missing rungs fall back:
>   `flags["pentaryn-ties"].studyTiers = [{ min: 0|15|20|25, text }]`
> - The sub-15 rung is a **pacing choice, not a mechanical necessity**. The roll is blind
>   (decision 6): the player cannot tell a 3 from a 23, so the old reasoning that the
>   generic line "lets them know they failed" is obsolete — a sub-15 message may be authored,
>   and may be as confidently wrong as any other rung.
> - The one-roll lock is what gives a false answer its teeth: the wrong description
>   *stands*, per character, until the GM's reset — which is now also the release valve for
>   "you've since learned better", not just "you've fought a dozen of them".
> - The lock record stores **`when` only**. The first cut stored the total in it, on the
>   player's own actor — which is the hidden number, one devtools glance deep. The total and
>   the tier move to the belief record (decision 12), on the studied actor.

The draft framed the ladder as three thresholds and left failure undecided. Decided: there
are not three rolls. There is **one Study check per *kind* per character, ever** — rolled
from any entry whose actor resolves to that kind — and the total buys everything it clears:

| Total | Written into their entry |
| --- | --- |
| **≥ 25** | Description + immunities/resistances/vulnerabilities + real attacks and damage |
| **≥ 20** | Description + immunities/resistances/vulnerabilities |
| **≥ 15** | The description |
| **< 15** | The authored sub-15 message if one exists (may be false — amendment above); else a line saying their character doesn't recognise it. Either way the entry promotes: they encountered it and thought about it |

One roll, graded, is the difference between a gamble and a slot machine stated as mechanics:
the question is never *whether you get to keep pulling*, it is *how much this one pull
taught you*. No retry on failure — 5e's own convention — with one release valve: a GM-only
**reset** control on the locked row, for when circumstances genuinely change ("you've now
fought a dozen of them"). No timers, no rest-tracking, no per-session cooldowns to build.

**Both axes lock, independently, and both locks survive deleting the entry.** The
rolled-state lives in a separate two-map flag, never in a deletable row — otherwise
delete-and-re-add is a free reroll on either axis:

```js
flags["pentaryn-ties"].studied = {
  kind: { "<kindActorId>": { when: … } },          // the graded ladder, keyed by KIND
  lore: { "<actorId>:<loreId>": { when: … } }      // individual rows, flat (decision 8)
}
// blind amendment: WHEN only — no total, no tier. This flag lives on the player's own
// actor; a total here is the number the blind roll hides. Totals and tiers live in the
// belief record on the studied actor (decision 12).
```

Keying the kind lock by the **kind** actor id is what makes the axes independent and the
coverage right: studying Grix's kind marks `kind["<goblinId>"]`, so plain goblins met later
offer no re-roll — and studying a plain goblin first removes the kind icon from Grix's row,
while his *who-is-this* lore rows stay rollable. Deleting any Known entry deletes prose
only; both maps stay, so a re-added entry shows no icons it already spent.

The skill comes from the **kind's** creature type via the PHB Study action's Areas of
Knowledge table, exactly as drafted (Arcana / History / Nature / Religion by type — the
system picks it, the player never chooses).

**The 15/20/25 ladder is a house rule, and the books were checked so this could be said
plainly:** the installed DMG (473 pages scanned) contains **no monster-identification or
knowledge-DC rule anywhere** — its "Resolving Outcomes → Difficulty Class" section is the
generic Typical DCs table (5/10/15/20/25/30) and never mentions identifying creatures. So
the ladder rests on the PHB's Study *action* for the gesture and the skill, and on the
generic Medium/Hard/Very-hard rungs for its numbers. Joe's ladder, Joe's table — the plan
claims no book backing for the DCs, and none exists to claim.

**No content, no icon** — kept, and it is what lets one row carry two icons without
ceremony. An entry renders up to two roll affordances, each only when there is something
behind it: the **kind icon** when the kind's `system.details.biography.value` (path
verified) is non-empty and `studied.kind` has no record; the **lore icon(s)** when the
actor carries unspent lore rows (decision 8). A stock goblin shows one icon; Grix shows the
kind icon plus his lore; a kindless, lore-less commoner shows none. Self-correcting: the
kind icon's absence tells the GM which monsters still need a description.

### 6. The roll is `actor.rollSkill()` — verified against dnd5e 5.3.3 (P7)

> **Amended 2026-08-22, same day — the blind rework, part 2: the roll is BLIND, and the
> GM's client throws it.** With lower tiers deliberately false (decision 5), a visible
> total un-writes the fiction — a player who sees a 9 knows to distrust the confident
> answer they were just handed. So the roll runs with
> `{ rollMode: "blindroll" }` (`CONST.DICE_ROLL_MODES.BLIND`'s value, foundry.mjs:5616 —
> deprecated in favour of `CONFIG.ChatMessage.modes` on v14, same strings), and it runs on
> the **GM's client**, requested over the socket — decision 11 is that conduit. What each
> side of the table actually sees, traced through v14.367 + dnd5e 5.3.3 rather than assumed:
>
> - dnd5e's `BasicRoll.toMessage` evaluates blind rolls with `allowInteractive: false`
>   (dnd5e.mjs:68552); core stamps `blind: true` and whispers the card to GMs
>   (foundry.mjs:48805–48810). The **GM gets the real total**.
> - The message stays *listed* for players — `ChatMessage#visible` returns `true` for any
>   whispered roll (foundry.mjs:48727–48730) — but its content does not:
>   `isContentVisible` is `false` for every non-GM (48696–48708), so core **replaces the
>   flavor** with "… privately rolled some dice" (`CHAT.PrivateRollContent`,
>   49115–49121) and renders the dice obscured. Even the module's own flavor line never
>   reaches the player from this card.
> - **Pass/fail styling cannot leak.** dnd5e's `_highlightCriticalSuccessFailure` returns
>   before styling anything when `isContentVisible` is false (guard at dnd5e.mjs:69222),
>   and its DC display is gated on `shouldDisplayChallenge` (69077) besides. So
>   `config.target` stays — it is what grades the tier — but only the GM's copy of the
>   card ever renders its verdict.
> - The "a check was made, and about whom" card the player *does* see is the module's own
>   **public stub message**, posted separately: character name, subject name, nothing else.
>   No DC, no target, no total, no pass/fail.
> - **Dice So Nice is deliberately not used** for study rolls — Joe caught this himself:
>   3D dice on the player's screen would replay the number the blind mode just hid.
> - Consequence, stated because it will happen at the table: **a natural 1 can look like an
>   epic pass.** The player rolls, receives something confident, and writes it down. That
>   is the design working.

**`Actor5e#rollSkill(config, dialog, message)`** — dnd5e.mjs:37194. Concretely:

```js
const [roll] = await actor.rollSkill(
  { skill: "nat", target: 15 },            // skill keys: arc / his / nat / rel (3-letter)
  {},                                       // system dialog: advantage, situational bonus
  { data: { flavor: `Study: ${name}` } }
) ?? [];
if (!roll) return;                          // null = dialog cancelled — NOT an attempt
```

- `config.target` flows into `roll.options.target` (`BasicRoll.fromConfig`, 68346), giving
  `roll.isSuccess` / `roll.isFailure` (68517–68530) ~~and pass/fail styling on the chat
  card~~ — since the blind amendment, **grading is GM-side only**; the styling that was this
  bullet's selling point is now a leak the card must not have, and (verified, amendment
  above) cannot have: blind cards are content-invisible to players. Pass `target: 15` — the
  base DC — and grade the 20/25 tiers off `roll.total`.
- The system's own dialog and chat card come free: advantage, proficiency, bonuses, and the
  GM sees what was rolled. Returns `Promise<D20Roll[]|null>`; **`null` means cancelled**, and
  the one-roll lock must only engage on an actual evaluated roll — under the blind rework
  this contract moves to the GM's client, and the lock engages only on a *delivered reveal*
  (decision 11).
- ~~The roll is public chat~~ — the roll is **blind** (amendment above); **the revealed text
  is never chat either**. It is written into the player's entry only — a GM secret's text
  in a chat card would hand it to the other player.

**Overturned from the draft:** "Study-action-in-combat can be *enforced* rather than merely
warned about." There is nothing to enforce against — dnd5e 5.3.3 keeps no per-turn action
ledger on the actor; activation costs live on items being used, and Study is not an item
here. So: when `game.combat?.started && actor.inCombat` (core getter, foundry.mjs:46988), a
confirm dialog says the roll costs their action, then rolls. The chat card announces it; the
action economy is the GM's table to run, as it always was.

### 7. Reveals are composed, capped prose — never an embedded stat block (P6)

> **Amended 2026-08-23, after phase 3 shipped — the destination was wrong.** ~~Appended to
> the entry's own notes field as short, editable text~~ — built that way, and Joe's
> attribute-layer ruling corrects it: *"they can edit their note, but they can not edit the
> note that i hand them."* The reveal lands in the **granted region** (decision 15) — a
> sibling `granted` flag joined onto the entry at render, below the player's notes, icon and
> provenance, read-only. The composed *shape* below is unchanged; only where it lives moved,
> and the rework is priced in decision 15's checklist.

Copy-into-the-entry is kept, and it is the answer to "how is this rendered": the reveal is
~~appended to the entry's own notes field as short, editable text~~ **written to the
character's `granted` map and rendered below their notes** (amendment above) with a one-line
provenance header, e.g.:

```
— Studied (Nature) —
A small, black-hearted humanoid… {tier message, or biography flattened to prose}
Immune: poison. Resists: cold. Vulnerable: fire.
Scimitar +4, 1d6+2 slashing · Shortbow +4, 1d6+2 piercing
```

*(Header amended by the blind rework: the skill and nothing else. The first cut wrote
"Nature 22 vs DC 15" — which prints, into a player-owned text field, exactly the number and
DC the blind roll exists to hide.)*

- Tier 15: `details.biography.value`, enrichers and tags flattened the way
  `rules-lookup.md` already does.
- Tier 20: one line from `system.traits.di/dr/dv/ci` labels (paths verified).
- Tier 25: one line per attack — name, to-hit or DC, damage formula — extracted from the
  actor's items. **Narrowed 2026-08-22 — the Monster Manual module is now installed and
  changes this picture.** Its `features` pack, read on disk with Foundry's own
  `classic-level` (680 items), authors every attack description as enrichers resolved
  against the item's own attack activity — the recurring shape is literally
  `<p>[[/attack extended]]. [[/damage average extended]].</p>` — so for MM-derived actors
  the extraction is one call: enrich `system.description.value` relative to the item, then
  flatten to prose. ⚠ Two conditions survive: the build-time check narrows to that single
  enrich call (`enrichAttack`, dnd5e.mjs:20294, resolves the activity from the enrichment's
  relative context — confirm `relativeTo`/rollData wiring against a live MM actor); and
  **enricher text must never be copied raw** — an unresolved `[[/attack extended]]` or
  `[[lookup …]]` (1,742 of those in the pack) in a player's notebook is gibberish, so the
  flatten step is mandatory rather than cosmetic and applies wherever a description is
  copied, tier 15 included. Homebrew actors without authored descriptions keep the fallback
  that must always work: a plain list of attack-item names.
- ~~Everything lands in the same `notes` textarea, `NOTES_MAX`-capped, theirs to rewrite~~ —
  amended above: the reveal is a read-only granted block below the notes; the *notes* stay
  theirs to rewrite, in their words, and staleness against later GM stat edits is accepted
  exactly as the cached-name pattern accepts it. What they think about what they were told
  goes in their notes; what they were told stays what it was.

**A kind reveal writes to the kind's entry — the bestiary page — not the individual's.**
Rolling "what is this" from Grix's row creates or updates a "Goblin" entry (id = the kind
actor's id) and puts the tiers there, where every later goblin reads from; Grix's own row
gains one cross-reference line — *"Kind: Goblin"* — so the player sees where the text went.
For a stock monster the kind *is* the entry, so both writes are the same row and nothing
about phase-1 behaviour changes. Individual lore reveals (decision 8) write to the
individual's entry, always. **No new entry species and no new axis in the UI**: a kind
entry is an ordinary Known entry that happens to be named "Goblin", filed by the same
category default and recategorisable like anything else. The bestiary/who's-who split Joe
wants is exactly what the category dropdown already does — a third structural axis would be
a second filing system fighting the first.

> **Amended 2026-08-22, same day — a reveal is plaintext in the world, forever.** The
> reveal writes ordinary text onto the player's own Known entry, and that is a *decision*,
> not an oversight, with consequences worth naming before the first typo:
>
> - **Once they know it, they know it.** The entry survives the GM being offline, works
>   with no encryption key anywhere, and needs no further protection — which is why
>   encryption (decision 13) is orthogonal to this whole feature.
> - **A GM edit to the lore after a reveal reaches nobody who already rolled.** Correct —
>   it is what "they learned it" means — but it will read as a bug the first time Joe fixes
>   a typo in a tier message and the player's entry keeps the old wording. The belief
>   ledger (decision 12) shows what each character actually holds; the GM **reset**
>   (decision 5) is the deliberate tool for superseding a reveal, not re-editing the source.
> - **Two players may end up holding contradictory versions** of the same creature —
>   intended; that is tiered falsity doing its job. And yes, a player could in principle
>   read what another character learned. Joe's framing closes it: "they can also just ask
>   him." That channel already exists and is called talking.

### 8. GM lore rows are the **individual axis** — flat pass/fail, presentation-gated (P2)

The design crux, decided and since **ruled on by Joe**: presentation-only is accepted —
*"this is a friendly game among players I know… UI hiding is perfectly acceptable."* His
other point sharpens why the secrecy story was never the value: stock monsters are a Google
search away regardless; the system's real teeth are **custom monsters and GM-authored
lore** — content that exists nowhere else — and that is exactly what these rows carry. The
same contract as tie notes and the worn mark. (The separate check on a genuine server-side
gate has since concluded: **there is none and no light lift exists** — the official
permissions article is silent, the community wiki's storage options are all client-synced,
and the measurements below stand. What shipped instead answers it twice over: decision 11's
conduit keeps the number and the alternatives off the player's client *by never sending
them*, and decision 13's opt-in encryption makes the stored strings themselves unreadable.)

```js
// on the NPC:
flags["pentaryn-ties"].lore = [
  { id, dc: 15, skill: "his", label: "Why they left the coast", text: "<p>…</p>" }
]
```

Lore rows answer *who is this one* — and their roll is **flat pass/fail at the GM's DC, one
attempt per row**, recorded in `studied.lore` under `"<actorId>:<loreId>"`. The graded
ladder belongs to kinds only: its tiers are stat-block facts that every goblin shares,
while a lore row is a single authored fact with a single price. A GM who wants a ladder on
an individual writes several rows with rising DCs — "his name, History 10", "what he did at
the coast, History 15", "who he answers to, History 20" — and gets one for free, each fact
independently rollable, which is *more* expressive than a forced three-tier grade. The
player's tab shows each row's label, skill and DC as its affordance (that a secret *exists*
is the invitation — intended); passing writes `text` into their entry.

Authoring is a GM-only section on the NPC's ties tab, gated in the data layer like
`inbound()` — and it carries the **kind pointer** picker too (decision 4): one dropdown of
world actors above the lore rows. Joe's druid example lives here verbatim: a Nature row on
a forest NPC is just `{ skill: "nat", dc, text }`.

Why the other two routes lose (one of them has since un-lost — see its strikethrough):

- **The "GM-only journal" is not a secret store either — measured, not inferred.** In the
  server source, `dist/database/backend/server-backend.mjs` has **zero ownership checks on
  the read path**, and the whole of `dist/` contains exactly **one** `testUserPermission`
  call — guarding wildcard token *image browsing*. Then proven in the live world from a
  real non-GM session: Kristine's client holds **9 journals, 4 of them at permission 0**,
  and the full text of one hidden from her sidebar read out; a compendium marked *not
  visible* to her served its **391-entry index and complete documents** on request. World
  documents of every type sync whole to every client; permission governs UI only. The
  parent ties plan's advice that a GM-owned journal holds "genuine secrets" is true of the
  *interface* and false of the *transport* — moving secrets into a journal buys
  indirection, not secrecy, and costs the reveal path a document lookup and the GM an
  authoring surface outside the NPC.
- ~~**Widening the relay buys nothing and costs its security story.**~~ **Overturned same
  day by the blind rework — decision 11 is that widening, done right.** The original
  paragraph is kept because its reasoning shaped the conduit that replaced it: `relay.mjs`
  today is deliberately narrow — **seed-only, blank-fill-only** — and the rejected reveal
  service was a message in which a player's client requests disclosure of content it
  *already held*, on the strength of a claim ("I passed the roll") the GM client could not
  re-derive. Both premises flipped. Under blind tiered falsity the guarded things — the
  total, the tier alternatives, the authored text — genuinely never reach the player's
  client; and no claim crosses the wire, because **the GM's client performs the roll
  itself**. The GM-online dependency this bullet counted as a cost is now inherent and
  accepted: a blind, arbitrated roll needs an arbiter.

The rule for the GM, stated where secrets are authored, same as ties: **nothing goes in a
lore row that would ruin the game if read with devtools.** The three tiers of the monster
ladder never had this problem at all — the full stat block is on every client the moment the
actor exists, so the roll was always a ritual for honest players. Say it in the README and
design accordingly; the ties module has twice shown that honesty here is the feature.

> **Amended 2026-08-22 — that rule is the *plaintext-mode* rule.** With decision 13's
> opt-in encryption on, lore text, authored tier messages and belief records are ciphertext
> in the flag and on the wire — a real boundary this time, not a courtesy — and the rule
> relaxes to: nothing goes in a lore row you cannot afford to lose to a forgotten
> passphrase. Stat-block-derived tiers stay unprotectable under any setting, and that is
> fine: the player's client already has the monster, and everything derivable from it can
> be googled anyway. Only GM-authored words are encryptable — which is also the only
> content that exists nowhere else, and therefore the only content worth protecting.
>
> One honesty note on flat lore rows under blind rolls: a row with **no authored miss-text
> leaks failure by silence** — pass hands over text, fail hands over nothing, and the
> player can tell. The tier ladder doesn't have this hole (every total buys *something*);
> a GM who wants a lore row leak-proof authors a miss line for it — vague or confidently
> false, their choice. Say this where lore rows are authored.

### 9. Past Encounters — sight is detectable, verified, and spent carefully (P3)

The actual machinery, checked in core:

- **`Hooks.callAll("sightRefresh", this)`** fires at the end of
  `CanvasVisibility#restrictVisibility()` — foundry.mjs:178338 — on every client, every time
  perception updates restrict token visibility. (`visibilityRefresh`, 178145, fires during
  polygon refresh, *before* token visibility flags update — the wrong moment; use
  `sightRefresh`.)
- **`Token#isVisible`** (162397) is a live getter testing current sight polygons — fresh at
  hook time even though `restrictVisibility` defers the PIXI flags through renderFlags. Same
  getter the ties module already leans on; same `isVisible`-not-`visible` trap, already
  documented.
- Throttle: **`foundry.utils.debounce`** (core, 1667) at ~2s trailing. The debounced pass
  scans `canvas.tokens.placeables` (136 actors — the ties world-scan measured 0.154 ms, this
  is smaller), collects visible, non-PC, not-yet-seen `baseActorOf` ids, and requires a
  token to survive **two consecutive passes** before logging — a one-frame glimpse through a
  closing door is not an encounter. One batched flag write per flush.

**The cap counts world actors, not sightings.** Joe set the shape — its own tab, capped at
100, oldest falling off, "ordered from who they saw in the order they saw them" — and the
one thing his words leave open is what a *re*-sighting does. Decided: **one row per world
actor; a re-sighting updates that row's `lastSeen` and nothing else.** Three reasons, any
one sufficient: a per-sighting cap self-destructs on ordinary play — a party walking past
the same four NPCs all session flushes all 100 rows with duplicates; "the order they saw
them" is actually *broken* by per-sighting rows, which reorder into "order of most recent
sighting" the moment anyone is seen twice; and per-actor is what `baseActorOf` and the
two-pass dedup already produce — the per-sighting version would need extra machinery to be
worse. Rows order by `firstSeen`, newest at the top; `lastSeen` renders as a quiet "last
seen" line and never moves the row: the chronicle keeps the order they *met* people, which
is the sentence Joe said.

```js
flags["pentaryn-ties"].encountered = [
  { id: "<actorId>", tokenName: "Hooded Figure", tokenImg: "…",   // cached at sighting — see below
    firstSeen: …, lastSeen: … }
]  // capped: oldest firstSeen evicted past the cap
```

**The cap is a design choice, not a technical one, so it is a world setting** (default
**100** — Joe's number). One `game.settings.register` line; the eviction reads the setting.
Honesty about what it buys: with rows keyed per actor and 115 NPCs in this world, a cap of
100 binds late — its real job is to be a *contract* on flag size as the world grows, not a
knob anyone tunes. Evicted rows are gone (the row was only ever a pointer plus timestamps;
anything that mattered was promoted long before it aged off the bottom of 100).

The feed's remaining rules, each dissolving a draft problem:

| Rule | Kills |
| --- | --- |
| One row per world actor, `lastSeen` updated in place | P4's duplicate flood — and Joe's 100-cap bounds the rest by construction |
| Runs only on a non-GM client, for actors that client owns | The GM's all-seeing client logging the whole scene into every PC |
| Writes to the player's own actor | No permission machinery — they own it |
| Kill-switch setting; the tab renders empty-with-a-note when off | An escape hatch if play proves the logger misbehaves |
| Offline player logs nothing | Accepted and documented: the feed is *what was on that player's screen*, not omniscient character memory |
| Scenes without token vision treat every non-hidden token as visible (core's own rule) | Accepted: on a theatre-of-mind map, being on the table is being seen |

Writing on a Past Encounters row promotes it to Known — the draft's promotion rule, now
with something real to promote from. The chronicle row **stays** after promotion, gaining a
quiet known-marker that links to the Known entry: removing rows on promotion would punch
holes in exactly the history the tab exists to keep, and Joe's own reasoning runs the other
way — the list may be long *because* the cared-about entries already live in Known. Two
owners of one PC double-logging is a benign last-write-wins race on a deduped list;
accepted.

⚠ **The disguise leak, automated.** A first-sight row for a disguised token would cache —
or worse, live-resolve — the *real* actor's name, unmasking "Hooded Figure" as Ozmandius on
the player's own sheet with no gesture at all. The feed must cache the **token's** name and
art at sighting time and display those, never live-resolving for players. A re-sighting
under a different token name updates the cache to what is now on the player's screen — the
screen is never a leak; resolving the actor behind it is. ~~This narrows but does not close
the hole the GUI plan's open disguise question already tracks (the actor id is still in the
flag, readable with devtools)~~ — **resolved 2026-08-23
([`foundry-disguise.md`](foundry-disguise.md))**: a disguised token carries a pointer to a
**persona actor**, and the feed's row id is `apparentActorOf(token)` — the persona when
masked, the base actor otherwise — so the id in the flag *is* the face the player saw, and
the cache-the-screen rule above becomes the display half of a two-half rule. The residual
is only the **unmarked** ad-hoc rename, which keeps the real id behind a cached name — the
accepted devtools boundary, and the fix is one HUD dialog (set the mark). The operative
rule stands and is now enforced by schema, not curation: **a disguised persona that matters
gets its own actor** — the pointer requires one. ~~With the feed now definitely shipping,
that open question must be resolved before this phase — it is the phase's one blocker.~~
The blocker is gone: this phase may ship on the cache-the-screen rule alone, and
`apparentActorOf` slots in whenever the disguise module part lands (either order is safe).

### 10. Solved problems reused (P9, kept verbatim)

`baseActorOf` for unlinked tokens; `isVisible`, never `visible`; GM-only data gated in the
data layer (`inbound()`'s pattern), never the renderer; hardened readers that cannot throw;
`render: false` writes with deliberate repaints; the nav-vs-body re-injection guard in
`injectTab`. All built, all tested, all imported rather than re-derived.

### 11. The study conduit: the GM's client throws the roll and hands back one string (blind rework, part 3)

Added 2026-08-22, and it is this plan overturning its own rejection — decision 8's "widening
the relay buys nothing" bullet, struck through above, was right about the design it judged
and wrong about this one. The flow, end to end:

1. The player clicks a roll affordance on their entry. **No active GM, no roll** — the
   button is disabled with a hint, the same `game.users.activeGM` contract `requestMirror`
   already uses. Nothing queues: a blind, arbitrated roll needs an arbiter, and dice must
   not fall while nobody is watching them.
2. The dnd5e configuration dialog runs on the **player's** client — advantage and
   situational bonus are theirs to declare — and the socket message carries the ids plus
   those two bounded declarations, nothing else.
3. The applying GM client (`activeGM`, exactly `relay.mjs`'s `isApplyingGM`) validates the
   way `applyMirror` does: **identity from the server's `senderId`, never the payload**;
   ownership of the rolling character re-checked; LIMITED reach on the target re-checked;
   the `playerAccess` kill-switch re-checked; both actors re-resolved from documents. The
   payload is trusted for ids and the two dialog declarations only — and those two print on
   the GM's own card, so lying in them is lying to the GM's face: the physical-table trust
   level, not a protocol hole.
4. The GM client rolls `rollSkill` **blind** (decision 6), grades the tier off the total
   (`config.target` never leaves this client), decrypts the tier or lore text if the
   encryption setting is on (decision 13) — prompting for the passphrase right here if the
   key is not cached, with **cancel aborting the whole roll before the lock engages** —
   and then writes, in one batch it is uniquely entitled to make (the GM owns everything):
   the reveal into the player's Known entry, the `studied` lock, and the belief record
   (decision 12). Last, the public stub card: a check was made, and about whom.

**Why the old objections dissolve, stated so nobody re-litigates them:** there is no
"I passed the roll" claim to trust, because the GM client rolls; and the conduit is not
payload-driven disclosure of content the player already holds, because under blind tiered
falsity the number, the alternatives, and (encrypted) the authored text **never reach the
player's client at all**. That is the one secrecy property client-side code can genuinely
provide — a secret never sent, rather than sent and hidden — and it is stronger than
anything the rejected design could have bought.

**The indistinguishability contract.** Every observable consequence of a completed study
roll is identical for a triumph, a failure, and a deliberately false tier:

- the roll affordance vanishes on **any** completed roll — its disappearance must never be
  conditional on the result, or the affordance itself becomes the tell;
- the entry promotes identically, the provenance header carries the skill and nothing
  else, and no styling, wording, or timing differs between a true reveal and a false one.

Stated once, here, so a future maintainer trips over it before "optimising" a success tint
back in: **if any pixel differs by outcome, that pixel is the number.** The contract
governs UI and chat; the flag *records* are world-readable like everything in Foundry —
the same accepted devtools boundary as ties, until decision 13 makes the strings
themselves unreadable.

### 12. The belief ledger — what each character now holds as true

One confident answer per creature, never re-rollable, possibly false: the GM must be able
to see what each character believes, or falsity becomes a trap for the *GM's* memory
instead of the players'. Cheap, exactly as Joe predicted, because the GM-only inbound
patterns already exist — a data-layer-gated section like `inbound()`, on the studied
actor's tab.

```js
// on the studied (kind or NPC) actor, GM-written at reveal time, GM-read only:
flags["pentaryn-ties"].beliefs = {
  "<characterId>": { "kind" | "<loreId>": { text, tier, total, when } }
}
```

- `text` is the **exact string handed over** — the player may rewrite their notes (the
  manual is theirs), but the ledger keeps what was actually said, which is the thing the
  GM must not misremember mid-scene.
- `tier` and `total` live here and only here (decision 5's amended lock): on the studied
  actor, never on the player's own sheet, where the number would sit one devtools glance
  from the player it was hidden from. World flags are world-readable regardless — with
  encryption off, a determined devtools player can exhume this record; same boundary as
  lore rows, and the belief record is GM-authored content, so decision 13 encrypts it with
  the rest.
- Renders as a GM-only **Beliefs** section: one line per character per fact — who, what
  they were told, which rung bought it.

> **Amended 2026-08-23 — the approval gate rides this ledger
> ([`foundry-disguise.md`](foundry-disguise.md) decision 8, and it covers study and lore
> rolls, not just disguise).** Joe: any check can be flagged **hold** — *"give me a prompt
> they pass and I can accept it… some I don't care, others might trigger me to give a
> scene."* Consequences here: lore rows gain `hold` beside their `dc`, kinds gain
> `studyHold` beside `studyTiers`, and a world setting `holdDefault` (default off) is the
> fallback — per-*roll* granularity only, never per tier, because holding high tiers while
> delivering low ones makes the delay itself the number. Decision 11's step-4 write batch
> **splits**: the belief record (now carrying the computed reveal `payload` and a
> `delivered` timestamp) is written at roll time — the lock stays spent at roll time — and
> the player-facing writes (reveal into the entry, stub unchanged, whisper where the
> disguise check is involved) run at *delivery*: immediately when auto, at the GM's
> **Deliver** when held (**no Deny** — approval is timing, not veto; the reset stays the
> honest do-over). Pending rows persist as undelivered belief records and resurface on
> this section with a Deliver control, so nothing new is stored anywhere. When `hold` is
> on it holds **every** outcome of that roll (a study roll always outputs; a held player
> observes exactly a failure's observables), and the §3 indistinguishability run gains a
> held-case variant asserting precisely that.

### 13. Encryption is orthogonal — ship plaintext first; wrapped-key escrow when the setting arrives

**Orthogonal, and the plan says so before the code exists:** the reveal pipeline produces
plaintext-in-world whether the source was ciphertext or not (decision 7's amendment), and
stat-block-derived content is unprotectable under any scheme. Encryption changes **exactly
one thing** — whether the stored GM-authored string is readable — with no schema change and
no second code path: the same string field carries either prose or an armored string
(`enc:v1:` + base64(iv‖ciphertext)), and one hardened reader returns the text, decrypting
when it meets the prefix. So: **plaintext ships first**, the README states the devtools
boundary honestly, and the setting arrives later without migrating anything but the bytes.

**The key design, decided and pressure-tested — wrapped-key escrow.** A random 256-bit
AES-GCM **master key** encrypts everything. A passphrase never encrypts content directly:
it derives a KEK via **PBKDF2-SHA-256** (SubtleCrypto-native; ≥600,000 iterations; random
salt), which wraps the master key. The wrapped blob + salt + params + a key-check value
live in a **world-scope setting** — deliberately public-safe, riding in every world backup
and following the world across servers (v14 setting scopes verified, foundry.mjs:5496:
client = localStorage, world = Settings db, user = per-user Settings db). On unlock the
master key is re-imported **non-extractable** and cached in IndexedDB (a `CryptoKey`
structured-clones into IDB; localStorage cannot hold one, and a hex string there would be
an extractable copy). Against Joe's five requirements:

| Requirement | How it lands |
| --- | --- |
| (a) survives sessions | the world setting persists; the IDB cache persists per browser |
| (b) survives browser/device change | any device + the passphrase re-derives the KEK and unwraps |
| (c) not recoverable by a player | players hold only ciphertext and a wrapped blob; the wall is the passphrase |
| (d) no typing every time | typed once per browser profile, then the IDB cache answers |
| (e) cannot be permanently lost | passphrase **or** any still-cached client **or** the export file recovers it — see failure modes |

**Verified platform facts** (v14.367 app on this machine): the Electron window loads
`http(s)://localhost:<port>` (`dist/interface/electron.mjs` → `dist/server/express.mjs`
`get address()`), and localhost is a trustworthy origin — so `isSecureContext` is true and
`crypto.subtle` exists in the GM app (Chromium 146). **Precondition to enforce:** any other
GM device must connect over https (the tunnel) or localhost — plain-http LAN has no
SubtleCrypto — and the module must detect `!window.isSecureContext` and refuse to enable,
never half-encrypt.

**Failure modes, named:**

1. **Forgotten passphrase + no cached client + no export ⇒ the ciphertext is gone,
   permanently.** Three independent outs ship with the feature: any still-cached client can
   **rewrap under a new passphrase without knowing the old one**; a one-time **key-export
   file** is offered at enable; and disabling the setting decrypts everything back to
   plaintext. Neglect all three and the loss is real — the enable dialog says exactly this.
2. **Offline brute-force.** Blob and ciphertext are on every client by construction; the
   wall is PBKDF2 cost × passphrase strength. A player GPU-cracking the GM's passphrase is
   outside this table's threat model, but the README says it plainly: *the passphrase is
   the lock.* (Argon2id would be a better KDF and is rejected below — not in SubtleCrypto.)
3. **Wrong passphrase fails clean** — AES-GCM's auth tag plus the stored key-check value;
   no garbage is ever written.
4. **GM keyless when a player rolls:** the conduit prompts inline (decision 11, step 4);
   cancel aborts before the one-roll lock engages, and the player sees only that the check
   didn't complete.
5. **Cache eviction** (cleared site data, new profile): retype the passphrase once.
   Inconvenience, never loss.
6. **Toggle-off requires the unlocked key** — it runs the decrypt-all pass first and
   refuses without the key, so the setting can never strand ciphertext behind an off
   switch. Toggle-on runs encrypt-all the same way.
7. **Rotation:** passphrase change = rewrap only (no lore touched, instant). Suspected key
   compromise = decrypt-all → new master key → re-encrypt-all, shipped as one button.

**Ships alongside the setting, or the setting does not ship:** the enable dialog
(passphrase + export offer + the loss warning), the on-demand unlock prompt plus a settings
button, the IDB cache, key export/import, rewrap-from-cache, rotate, both migrations bound
to the toggle, and the secure-context guard.

### 13a. The setting stays opt-in, default OFF — and the reasons are not the ones you'd guess

Settled with Joe 2026-08-22, after he asked whether the flag could be dropped entirely now
that his own environments are known-good.

**The secure-context objection is gone, for him.** Measured live in his GM client:
`http://localhost:30000` reports `isSecureContext: true` and `crypto.subtle` present.
Loopback is a *potentially trustworthy origin* regardless of scheme — the packets never
leave the machine — and his remote path is real TLS via the tunnel. Only a GM reaching a
bare-HTTP **LAN address** (`http://192.168.1.50:30000`) lacks `crypto.subtle`; the host is
what matters, never the port. One-liner, per client, for anyone diagnosing it:

```js
`${location.origin} → ${window.isSecureContext && !!window.crypto?.subtle ? "✅ works" : "❌ no crypto.subtle"}`
```

**But secure context was only one of four reasons for the flag, and the other three stand:**

| Why it stays opt-in | |
| --- | --- |
| **You would unlock to read your own notes** | Always-on makes ciphertext the only copy: every new browser, cleared cache or fresh machine costs a passphrase before the GM can read their own lore — a daily cost paid against a threat Joe has already ruled out for his table |
| **It inverts the build order** | Orthogonality is the whole point of decision 13. Mandatory encryption makes export, rewrap, rotate, recovery, unlock and the enable/disable migration *prerequisites* — the largest and most failure-prone surface, sitting in front of the feature anyone actually wants |
| **It is hostile in a shipped module** | Other GMs get conscripted into passphrase management for a note-taking feature, and bare-HTTP LAN GMs cannot use it at all |
| **Encrypted lore is opaque to Joe's own tooling** | He authors NPCs as markdown in the vault, pushes them through a content pipeline, and just built `pentaryn-lookup`. Ciphertext in a sheet cannot be grepped, diffed, versioned or read by any of it — a change in kind for his workflow, and one to choose deliberately rather than inherit |

**Default off.** On for the group with developers in it, off for the friendly one — which is
the split Joe described before any of this was designed.

### 13b. Rejected: deriving the key from the Foundry login password

Joe asked whether the passphrase could ride on the GM login password, since one already
exists. It cannot, and the decisive reason is local before it is theoretical.

**His Gamemaster user has no password set** — the field is present on the synced User
document and empty. It follows from his own login path: `make login` authenticates as
*server admin* and calls `loginAs`, handing the browser a session cookie, so **no user
password is ever typed**. A module hooked to that event would see nothing.

Three more, any one sufficient:

- **The module would have to intercept a credential** at the join form. A module reading
  your password is disqualifying in something meant to be published, whatever its intent.
- **Changing the Foundry password would silently destroy all lore** — the KEK stops
  deriving and nothing can rewrap without the password that was just replaced.
- **It is absent when needed.** The key is wanted when a player rolls: hours into a session,
  on a cookie, possibly on a machine where nothing was ever typed.

> ⚠ **Not established, do not build on it:** `password` and `passwordSalt` are fields on the
> synced User document. Joe's are empty, so it could not be determined whether a *set*
> password's hash reaches other clients or is stripped server-side. This is a flag for
> someone to check, not a claim that it leaks.

**The remembering problem, answered without new machinery:** the passphrase goes in a
password manager like any other credential, and the design's key-export file is taken at
enable time. Between them, "an entirely different system" costs one paste, and the wrapped
key riding in world backups means it is never gone.

### 14. The public pitch: a bestiary your players build — never "keeps your secrets from players"

The honest README frame, decided with Joe: **"a bestiary your players build in their own
words, and a way to gate what you wrote."** Not a secrecy product. The module has twice
shown that honesty is the feature; the encryption setting is sold as "encrypted at rest,
GM-held key, your passphrase is the lock" — with the forgotten-passphrase warning beside
it — never as unbreakable, and never as the point. The point is the notebook.

---

## The attribute layer — judged 2026-08-23, after phases 1–3 shipped, before phase 4

> **Joe's design, in his words.** A **knowledge** is a description + DC + skill attached not
> to a character but to an **attribute** — a named shared thing: city, guild, species,
> background, concept. Characters carry attributes; you reach the lore through whoever is in
> front of you: *"if there no one to interact with, then buy-in-large, ther eno reason to
> have lore on a place."* Shared and propagating (edit the DC once, every carrier changes);
> autocomplete that offers existing attributes and creates new ones past the match; shared
> attributes grant advantage automatically; its own tab; GM-only editing with a player-visible
> face; and on a character's record, *"players have a desc they can edit … the attaibute desc
> to be something they can roll/pass, and it gets added below on what they know about someoen,
> they can edit their note, but they can not edit the note that i hand them."*

**Verified this pass, live (`space-journey`, eval-js, read-only):** the derived-attribute
paths on real actors — a PC's species is an embedded Item of type `race` (Ballad Quinn:
"Human", `system.details.race` resolves to the item, `details.type` reads
`{value: "humanoid", subtype: "Human"}` off it), background is an Item of type `background`
("Entertainer"), size is `system.traits.size` ("med"); NPCs carry `details.type.value` and
`traits.size` and **no** race/background items. `CONST.USER_PERMISSIONS.SETTINGS_MODIFY`
requires role 4 (Gamemaster) and Kristine's `can("SETTINGS_MODIFY")` is `false` — **players
cannot write world settings**, which is what lets a world-setting registry hold ledger state
no player can un-spend. The world is clean: the only `pentaryn-ties` flag on any actor is
`ties` (56 actors), so everything below is a **code change with no data migration**.
**Taken on trust:** Joe's quotes as supplied by the coordinating pass, and the 2024 PHB
advantage rule as quoted there (*"If circumstances cause a roll to have both Advantage and
Disadvantage, the roll has neither of them… even if multiple circumstances impose
Disadvantage and only one grants Advantage or vice versa"*) — verified by that pass against
the installed book, not re-read here.

### 15. Granted knowledge is a **sibling flag, never entry fields** — the two-region entry, and the rework phases 1–3 owe

**The rule Joe stated is already broken by shipped code.** `study.mjs`'s
`applyPlayerWrites` appends the reveal into `entry.notes` — the player-editable textarea —
so the text he hands a player is theirs to rewrite the moment it lands. His rule is the
opposite: their notes are theirs, the granted text is his, and the entry shows both — notes
first, the granted knowledge below, icon and provenance, read-only. That is the one piece of
phases 1–3 the attribute design does not extend but **corrects**, and it must land before
phase 4 writes lore reveals through the same hole.

**The store: `flags["pentaryn-ties"].granted` on the character — a map, not entry fields.**

```js
flags["pentaryn-ties"].granted = {
  "kind:<kindActorId>":            { text, when },   // the study ladder's reveal (phase 3)
  "lore:<actorId>:<loreId>":       { text, when },   // individual lore rows (phase 4)
  "attr:<attrId>:<loreId>":        { text, when },   // attribute lore (the attribute phase)
  "mask:<actorId>:<layerId>":      { text, when }    // disguise layer reveals (phase B)
}
// The first segment names the JOIN RULE: which Known entries render this grant.
// kind: → the entry whose id is the kind actor's. lore:/mask: → the entry for that actor.
// attr: → EVERY entry whose subject carries that attribute (computed at render).
```

Why a sibling flag beats the obvious per-entry `granted: []` array, decisively:

- **The `toStoredKnown` trap is dissolved, not patched.** `toStoredKnown` maps a fixed shape
  and silently drops unknown fields, so granted text stored *inside* the entry would need
  `readKnown` + `toStoredKnown` + fixtures changed in one commit or the player's next
  notes-keystroke erases it (the exact failure the disguise plan flags for `imposter`). A
  sibling flag never routes through the entry writer at all — the notes autosave *cannot*
  touch it, by construction rather than by discipline.
- **Attribute grants render everywhere they should, stored once.** Learn the guild's secret
  from one rogue and it must show under every rogue you have filed — Joe's "build the world
  through characters" verbatim. Per-entry storage either duplicates the text per entry or
  misses every carrier filed later; the character-level map with a render-time join gets
  both for one Map lookup per row.
- **One write path.** The grant lands in the same single `Actor#update` as the `studied`
  lock (the atomicity decision 11 step 4 already requires), and a reset + re-roll *replaces*
  the grant under its key instead of appending a second copy.

**Render (the two regions, Joe's layout verbatim):** in `detail()`, both branches — the
notes textarea (or read-only prose for non-owners), then below it one `.pt-granted` block
per joined grant: a provenance icon (the kind actor's portrait for `kind:` grants, the
attribute's icon for `attr:`), the text as escaped prose (`white-space: pre-line` — composed
reveals are `\n`-joined), **no textarea, no edit affordance**. The summary's preview line
stays the player's own notes only — the manual is theirs; the granted text is what they were
told, not what they think. Deleting an entry hides its grants (the join has no row to land
on) but deletes nothing: the map survives, and re-filing the subject shows them again —
which is also the right answer to "they can not edit the note that i hand them" without
pretending the devtools boundary moved.

`appendReveal` and the `tooLong` refusal path retire with this: grants no longer share the
notes cap, each grant is clamped by its reader, and the recovery dance ("trim your page and
ask the GM to press Deliver again") stops existing because the collision stops existing.

**The lock model, the belief ledger, the indistinguishability contract: untouched.** A grant
appears only at delivery, its shape identical for a true reveal and a false one; the ledger
still keeps the GM's copy with the number; `studied` stays the `when`-only UI hint.

### 16. The registry: a world setting, **authored structure only** — and derived links are computed, never stored

```js
// world setting "attributes" (scope: world, config: false) — GM-writable only (verified:
// SETTINGS_MODIFY requires role 4; the server refuses player writes to Setting documents):
[ { id: "north-goblin",              // the slug — unique, normalized (decision 18)
    title: "North Goblin",           // free-form, display only
    category: "faction",             // GM-defined bucket for the picker
    icon: "icons/…",                 // generic by category at creation; custom art later
                                     // via the bridge, no UI in the first pass (Joe's cut)
    advantage: true,                 // does SHARING this attribute grant advantage (dec. 19)
    lore: [ { id, dc, skill, label, text, hold } ],  // decision 8's row species, verbatim
    bonuses: [] } ]                  // reserved, empty in v1 (decision 20)

// world setting "attributeBeliefs" — the ledger for attribute lore, sibling not inline:
{ "<attrId>:<loreId>:<characterId>": { text, tier: null, total, when, delivered } }

// on any actor, GM-written — AUTHORED links only:
flags["pentaryn-ties"].attributes    = ["north-goblin", …]
flags["pentaryn-ties"].attributesOff = ["type:humanoid", …]   // suppress a derived link
```

- **A world setting, because the ledger needs it.** Everything in a world syncs to every
  client regardless (decision 8's measurements), so the registry was never going to be
  secret — the property that matters is *writability*: world settings are server-gated to
  the Gamemaster role, which puts attribute-lore locks in the same player-unwritable
  category as the beliefs flag on an NPC. The ledger is a **sibling setting**, not rows
  inside registry entries — authored structure and per-character state have different
  authors, different churn, and mixing them makes every roll rewrite the document the GM
  edits. Same two-plane rule the disguise plan states.
- **Derived links are never stored — that is the whole backfill answer.** `attributesOf(actor)`
  computes the derived set live off dnd5e data and unions the authored flag. 115 NPCs
  arrive populated with nothing to write, a species edit propagates instantly, and
  "derived vs authored" needs no marker because derived ids are namespaced and absent from
  the flag. The GM removes a derived link from one actor via `attributesOff` — the only
  storage the derivation layer ever needs. The derived paths, **verified live this pass**:

  | Derived attribute | Path | Example (live) |
  | --- | --- | --- |
  | `type:<value>` | `system.details.type.value` (both actor types) | `type:humanoid` |
  | `species:<slug>` | embedded Item of type `race` (characters only) | `species:human` |
  | `background:<slug>` | embedded Item of type `background` (characters only) | `background:entertainer` |
  | `size:<value>` | `system.traits.size` | `size:med` |
  | `kind:<actorId>` | `kindActorOf(actor)` when not self (decision 4's pointer) | Grix → `kind:<goblinId>` |

- **A derived attribute exists without a registry entry.** It matches for advantage (where
  decision 19 allows), appears in autocomplete, and carries no lore — until the GM authors a
  registry entry *with that id*, which enriches what derivation already produces. Authoring
  lore for "every human" is creating the `species:human` entry; nothing links, because the
  link was never stored.
- **Autocomplete** is one list: registry entries plus the derived ids present in the world.
  Typing past every match offers **Create** — GM-only, like every mutation here; players see
  attributes and roll against them, exactly the permission split Joe stated.
- ⚠ **One UI honesty note, so it is designed rather than discovered:** the edit affordance
  lives on an actor's attribute row, but what it edits is the *shared registry entry* — a DC
  changed "on one orc's sheet" changes for every carrier, which is the feature and also
  exactly how a GM accidentally rewrites a world-wide DC while thinking locally. The editor
  must say whose DC it is ("Shared — every carrier of North Goblin"), not look like a
  per-actor field.
- **The tab.** Its own character-sheet tab via the `SHEET_TABS` spec array (phase 1's
  refactor — one more spec row). Stated plainly: an injected tab is insulated from dnd5e
  *content* patches, not from sheet-framework changes — those break all three of our tabs
  equally, which is still strictly better than sharing DOM with a patched region.

### 17. Kinds and attributes **coexist** — ruled by Joe, 2026-08-23: kind is what it *is*, an attribute is what it *belongs to*

Joe's earlier *"lets not have collisions, pick one"* had two readings; he ruled the same
day, in a framing sharper than either: *"yea, kind and attribute coexist. because i would
have this is a goblin kind, and it has an attribute that its from the north tribe — these
are two things that coexist with each other, we can mark that as a decision."* **Kind is
what a creature is; an attribute is what it belongs to.** The kind keeps exactly what it
has — skill derivation from creature type, the graded 0/15/20/25 ladder, tier content read
off the stat block, the lock and belief ledger keyed by kind actor — and attributes carry
**authored shared lore**: flat DC facts in decision 8's row species, attached to the group
instead of the individual. **The ladder that shipped this morning is safe.**

The structural argument that makes the separation load-bearing rather than stylistic:
**attributes cross kinds.** A rogue guild has humans and goblins in it; a city's people are
of many species. An attribute cannot be a property of a stat block *even in principle* —
the two axes are independent by construction, not by convention. That also disposes of the
collision worry cleanly: "goblin" is a kind, "north-goblin tribe" is an attribute, and
nothing arbitrates between them because they never occupy the same slot:

- **Ids cannot collide by construction** — attribute ids are slugs in their own namespace,
  kind ids are actor ids; nothing shares a key space.
- **Facts cannot collide** — every fact lives in exactly one place (a ladder rung on the
  kind, a lore row on an actor or an attribute), each with its own lock, and the Known
  entry's granted region *composes* them: the ladder's reveal and the guild's lore stack as
  separate blocks on one page. Two affordances answering different questions is decision 4's
  two-axes ruling already, extended by one scope.
- **The authoring question gets one answer**: mechanical identity and the ladder's voice
  (what a study roll says, tier by tier, lies included) are authored on the **kind actor**
  (`studyTiers`); shared world lore is authored on the **attribute**. "Where do I write
  goblin lore" → the attribute; "what does studying a goblin say" → the kind.

**Why reading (b) — attributes subsume kinds — loses, priced honestly.** Tiers 20 and 25
are *read off a stat block* (`traits.di/dr/dv/ci`, attack items, the biography fallback);
an attribute is a registry row with none of those, so under (b) every kind still needs its
world actor as the stat source — subsumption keeps both layers and renames one. The rework
it would still demand: rekeying `studied.kind`, `claimRoll`, `writeBelief`, `reset`,
`deliver`, `pending`, `beliefs` and `studyStateFor` from kind-actor ids to attribute ids,
moving the belief ledger into the registry, and re-running the two-client
indistinguishability suite that passed this morning — **2–3 days of rework purchasing a
rename**. Rejected below with that price on it.

### 18. Attribute ids: normalized aggressively, unique, titles free — Joe's rule as a function

`attrIdOf(title)`: lowercase, Unicode-normalize (NFKD, strip combining marks), drop
everything but `[a-z0-9]` — so `"Yellow Stone"`, `"yellowstone"` and `"Yéllowstone"` all
produce `yellowstone` and the second **creation** is refused with the existing entry
offered instead (the autocomplete already showed it; creation past it is the deliberate
gesture, and colliding on the id is the signal it was not deliberate). `yellowstone2` is
how you mean a different one — Joe's own convention, unmodified. Titles are display-only and
free-form. Derived ids prefix their namespace before the slug (`species:human`), so authored
flat ids can never collide with derived ones. Pure function, fixtured: the collision pair,
the diacritic case, the empty string, the all-punctuation string.

### 19. Advantage: counts computed at roll time, one swappable predicate, **default RAW** — Joe's netting is a world setting

Joe wants counters — each advantage +1, each disadvantage −1, net decides. The 2024 PHB
says otherwise: both present ⇒ neither, *regardless of how many* sit on each side. Both are
one pure function apart, so the design stores nothing and decides at the last moment:

- **Sources are counted GM-side at roll time**: the player's declared mode from the study
  dialog (one source, exactly as today), plus one source per shared *advantage-granting*
  attribute between roller and subject, plus whatever a later feature adds. Counts and the
  sources' names go on the **GM's card and into the belief-ledger row** (`adv`, `dis`) — the
  GM sees why the roll had what it had, the player sees nothing (the roll is blind; an
  automatically-granted advantage is invisible by the same contract that hides the total).
- **`combineAdvantage(adv, dis, rule)` → `"advantage" | "disadvantage" | "normal"`** — RAW:
  both positive ⇒ normal, else whichever side is positive; `net`: the sign of `adv − dis`.
  Fixtured on the disagreement cases (2 adv + 1 dis: RAW normal, net advantage). The result
  feeds `rollSkill`'s booleans exactly as the mode does today.
- **Default RAW, `advantageStacking` world setting flips to netting.** This module is meant
  to ship (decision 13a's own reasoning); a shipped module defaults to the book and lets a
  table opt into its house rule — the same posture as the 15/20/25 ladder, which the plan
  already documents as "Joe's ladder, Joe's table". One setting Joe flips once.
- ⚠ **The degeneracy that will not survive contact, caught now:** if every shared attribute
  grants advantage, then `type:humanoid` — carried by nearly every PC and most of this
  world's 115 NPCs — grants near-universal advantage on studying people. So
  advantage-granting is a **registry-entry property** (`advantage`, decision 16's schema):
  authored attributes default `true` (the rogue guild is automatic, as Joe asked); derived
  ids with no registry entry, and the `type:`/`size:` namespaces even with one, default
  `false`. Sharing a *guild* is information; sharing a *silhouette* is not.

### 20. Bonuses apply **only to rolls this module makes** — the line holds

Held, and stated as the boundary it is: general character bonuses are dnd5e's Active
Effects — battle-tested, transfer-aware, rendered on every sheet — and reimplementing a
bonus pipeline inside a lore feature would be the largest, least rewarding, most
version-fragile item in this plan (every dnd5e roll-hook this module does *not* own is a
surface this plan's own history shows must be re-verified per release). An attribute that
should make someone a better archer is an Active Effect on an item; an attribute that makes
guild lore easier to roll is this module's business. **v1 ships advantage-sharing only**:
`bonuses[]` stays in the schema, empty, reserved — when wanted it is half a day, one
`@attr` part in the GM-side roll config, printed on the GM card like the situational bonus.

### 21. Phasing: phase 4 unchanged in scope, five rules added — attributes are **phase 6**, encryption slides to 7

The attribute layer is real, separate work (5–8 days held honest below) and **not phase 4**.
Phase 4 stays what the table says — GM lore rows on actors, flat pass/fail, the authoring
surface phase 3 deferred — and does five things *now* so the attribute phase is a widening,
never a migration. This is the entire reason this review ran before the build:

1. **Namespaced fact keys everywhere a fact is referenced.** `studied.lore` keys, belief
   fact keys and grant keys are `lore:<actorId>:<loreId>` — never the bare
   `"<actorId>:<loreId>"` of decision 8's first draft — reserving `attr:` (and `mask:`)
   as siblings. Zero cost while phase 4 is unbuilt; renaming keys later is the migration
   this rule deletes.
2. **Reveals land in `granted`, never notes** — automatic once decision 15's rework ships
   first, which is the ordering: **rework, then phase 4**.
3. **The lore-row editor is target-agnostic**: it takes `(lore[], save)` and knows nothing
   about actors, so the attribute phase mounts the identical editor on registry entries.
   The row schema is already shared by construction (decision 16 reuses decision 8's shape,
   `hold` included).
4. **The conduit resolves "the studied thing" through one seam** — a function returning the
   fact's ledger location, reach rule and lock key; today it only ever returns actors. The
   attribute phase adds a branch, not a rewrite.
5. **No attribute anything in phase 4.** No registry, no autocomplete, no tab, no derivation
   — scope discipline is the fifth rule.

**Phase 6 — attributes** (the old phase 6, encryption, becomes **phase 7**; its "after
everything else has played" reasoning transfers intact, and it covers registry lore text and
the attribute ledger with the same `enc:v1:` armored-string reader — GM-authored strings in
GM-writable stores, nothing new): registry + readers + `attrIdOf` + settings CRUD API
(~1 day); derivation + the paths table + suppression + fixtures (~1 day); the tab, the
picker/autocomplete, the shared-editor honesty rule (~1½ days); conduit widening — `attr:`
facts through the seam, the ledger setting, advantage counts + `combineAdvantage` + the
`advantageStacking` setting (~1½ days); the validation pass — refusals, an attr-lore
indistinguishability variant, the advantage-degeneracy check (~1 day). **~6 days**, honest
range 5–8; Joe's icon-art pipeline stays cut from the first pass, as he said.

### Rejected — the attribute layer

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| **Attributes subsume kinds** (reading (b) of "pick one") | Tiers 20/25 are read off a stat block an attribute does not have, so every kind keeps its world actor anyway — subsumption is a rename that keeps both layers | Rekeying eight shipped functions off kind-actor ids, moving the belief ledger, re-running the two-client suite: 2–3 days for zero capability |
| **Per-entry `granted: []` inside the Known entry** | Patches the `toStoredKnown` trap instead of dissolving it; attribute grants would duplicate per entry or miss carriers filed later | One notes-keystroke away from erasing granted text, forever, on every future field |
| **`targetType`/`targetId` fields on lore rows** | A row stored *on* its target already states its target; a field restating it is a second source of truth that can disagree with its location. The widening the field wanted is delivered by namespaced fact keys and the conduit seam (decision 21, rules 1 and 4) | The polymorphism, bought twice |
| **Storing derived attribute links on actors** | 115 NPCs to backfill, staleness on every species/type edit, and a marker scheme to tell derived from authored | The "arrive populated with nothing to backfill" win — the reason derivation was proposed |
| **Every shared attribute grants advantage** | `type:humanoid` is near-universal in this world — advantage on studying almost anyone | The advantage mechanic's meaning (decision 19's degeneracy rule) |
| **Netting as the default combining rule** | The 2024 PHB cancels outright regardless of counts; a shipped module defaults to the book | Other tables inheriting a house rule silently — the 13a posture, violated |
| **General bonuses via a module pipeline** | Active Effects already is that system, battle-tested; a parallel one is the largest least-rewarding build in the plan and fragile across dnd5e releases | Decision 20's line, and weeks |
| **Ledger rows inside registry entries** | Authored structure and per-character state have different authors and churn; every roll would rewrite the GM's authoring document | The two-plane rule, and clean diffs |
| **Free-text attribute matching by title** | `"Yellow Stone"` vs `"yellowstone"` is exactly the collision Joe named; matching prose re-derives ids badly | The uniqueness rule — the id exists so titles can be free |

### 22. A reset never touches knowledge — ruled by Joe, 2026-08-23, closing decision 15's last thread

The rework asked one question back: now that a grant is separable from the player's prose,
should a GM reset revoke it? Joe's answer dissolved the question rather than picking a side:

> *"the reset dosn't make sence anymore because now those are two saperate things. they have
> their own notes, and they have attiabutes they or entires they discover… there person notes
> are for the player, and thing discover are etnries bleow there notes — nice and clean, and
> this means the palyer's notes are never overritten."*

The old rule — *"a reset means you may learn this again, not forget what you wrote"* — existed
to protect the player's prose from a GM action, because prose and reveal shared one field.
They no longer share anything, so the rule has nothing left to defend and the revoking variant
has nothing left to argue for. **Neither region is ever taken back by a reset:**

- **the player's notes** are theirs, and now literally unreachable from any GM path
- **the granted region** is theirs to keep too — a reset means *roll again*, and the re-roll
  replaces the grant under its own key, so nothing duplicates and nothing stale survives

What `reset()` still does is the one thing it was always for: clear the `studied` lock (and
the belief row) so the check may be made again. That is unchanged and still needed — it is
how a GM grants a do-over. Only the revoking variant is ruled out, permanently.

**The general form, and it is the load-bearing part for phases 4–6.** Two regions, one owner
each, no overlap:

| Region | Flag | Written by | Editable by | Ever overwritten? |
| --- | --- | --- | --- | --- |
| What you know | `known[].notes` | the player | the player | only by the player |
| What you have learned | `granted[<factKey>]` | the GM's client, at delivery | nobody | replaced under its own key, by a re-roll of the same fact |

Every later phase files into the lower region by adding a key namespace — `lore:` (phase 4),
`attr:` (phase 6), `mask:` (disguise). None of them needs a rule about protecting notes,
because none of them can reach notes. That is what Joe means by *hardens*: the property is
structural, not procedural, so no future phase can forget to honour it.

---

### The rework phases 1–3 owe — decision 15, as a checklist

No data migration: the live world was re-verified clean this pass (`ties` on 56 actors, no
`known`/`studied`/`beliefs`/`kindOf` anywhere). Code only, in one change, **before phase 4**:

| File | Change | The test that proves it |
| --- | --- | --- |
| `known-core.mjs` | `GRANTED_FLAG`; `readGranted(raw)` hardened reader (map, junk dropped, text clamped, `when` numeric); `grantsForEntry(granted, entryId)` — the pure join (today: `kind:` and `lore:` prefixes; `attr:` lands with phase 6); retire `appendReveal`. Recommended in the same change: the `imposter` field through `readKnown` **and** `toStoredKnown` (it is genuinely per-entry, so the disguise plan's both-functions-in-one-commit rule applies to it and this is the commit) | Node fixtures: `readGranted` junk table; the join returns the `kind:` grant for its entry and nothing for others; **the erasure disproof** — simulate the notes-edit path (`readKnown` → mutate notes → `toStoredKnown`) with a populated sibling `granted` and assert it cannot be touched; `imposter` round-trips |
| `study.mjs` | `applyPlayerWrites`: replace the notes-append block — ensure the entry exists (unchanged), write `granted["kind:<kindId>"] = {text, when}` in the **same single** `character.update` as the `studied` lock; delete the `appendReveal`/`tooLong` branch (`deliver` flows through unchanged) | Live conduit pass: tier-25 grant lands in the sibling flag with `notes` still empty; held case grants nothing until **Deliver**; reset + re-roll **replaces** the grant under its key |
| `known.mjs` | `detail()` renders the granted region below the notes field in **both** branches: one `.pt-granted` block per joined grant — provenance icon, escaped prose, no edit affordance; `buildKnownHTML` computes the join once per paint; the summary preview stays notes-only | Player pass: after a reveal the textarea holds only player prose and the block renders read-only; **type in notes, let autosave fire, the grant survives** in DOM and flag; re-run the §3 entry-row diff — identical outside granted prose |
| `styles/ties.css`, `lang/en.json` | `.pt-granted` (incl. `white-space: pre-line`), region strings; retire `known.study.notify.tooLong` | The standing i18n gate in `test/run.mjs` |
| `test/known.mjs` | The fixtures above; `appendReveal` fixtures retire with it | `make foundry-ties-sync` stays red until green — the node-test gate phases 1–3 already run under |

---

## Build order — stop anywhere

| Phase | Delivers | Usable alone? | Honest scope |
| --- | --- | --- | --- |
| **1** | Known tab: schema + hardened reader, entry rows (ties row idiom), category dropdown, sheet "Add…" | ✅ A manual notebook with categories — already the core ask | 2–3 days |
| **2** | Canvas key: hover → open/create the Known entry | ✅ "You see them, you can note them" | ½–1 day |
| **3** ✅ | The kind ladder, blind: `kindOf` resolution + a minimal GM pointer picker, the study conduit (decision 11 — socket request, GM-client blind `rollSkill`, public stub card), authored tier messages with derived fallback, graded reveal into the kind entry, `studied.kind` lock + belief record, combat warning, GM reset | ✅ The bestiary plays like D&D — the roll itself needs a GM online, which an arbitrated blind roll would anyway. Stock monsters need no pointer, so this is complete without phase 4 | 3–4 days (+ the tier-25 enrichment check, now scoped by the MM pack finding) |
| **4** ✅ | The individual axis: GM lore rows + the full authoring section (absorbs the pointer picker), flat rolls, `studied.lore` lock — **preceded by decision 15's rework**, and under decision 21's five rules (namespaced `lore:` fact keys, reveals into `granted`, the target-agnostic row editor, the conduit's resolve seam, no attribute anything) | ✅ The who's-who — story carried, not just stat blocks | 1–2 days, after the ~1-day rework |
| **5** ❌ CUT | Past Encounters tab: `sightRefresh` logger, per-actor rows with cached token name/art, cap setting (default 100), known-markers, kill switch | ✅ The chronicle | 1–2 days + a real play session watching it — ~~blocked on the disguise decision~~ **unblocked 2026-08-23**: row id = `apparentActorOf` (persona when masked), display cached from the screen (→ `foundry-disguise.md`) |
| **6** ✅ | The attribute layer (decisions 15–20): the world-setting registry + ledger setting, derived links computed off the verified paths, `attrIdOf`, the Attributes tab + autocomplete/picker, `attr:` facts through the conduit seam, advantage counts + `combineAdvantage` + the `advantageStacking` setting | ✅ "Build the world through characters" — shared lore, propagating DCs, automatic advantage | 5–8 days (decision 21's breakdown lands at ~6) |
| **7** | Encryption at rest (decision 13): the opt-in setting, wrapped-key escrow, unlock prompt + IDB cache, export/import, rewrap, rotate, encrypt-all / decrypt-all migrations, secure-context guard — now also covering registry lore text and the attribute ledger, same armored-string reader | ✅ Optional by design — the feature is whole without it, and it changes only whether stored strings are readable | 2–3 days, after everything else has played |

**Phases 1–3 are the feature.** Phase 4 is what makes it Joe's. Phase 5 ships — Joe's cap
and its own tab settled that — but it ships *last among the content phases* and behind its
kill switch, because a client-side sight logger earns trust in a session, not a plan.
~~Its one open blocker (the disguise question) is Joe's to rule on — that ruling is still
the only thing standing between this plan and a complete build.~~ **Ruled, 2026-08-23:**
Joe's pointer design (a token-level mark aiming at a persona actor, player-facing reads
redirected through it) is judged and specced in
[`foundry-disguise.md`](foundry-disguise.md); nothing stands between this plan and a
complete build any more. Additions to **phase 3's** scope from that ruling and its two
same-day amendments: the conduit gains the piggybacked blind disguise check (one gesture,
two GM-side rolls per layer, one public stub — the indistinguishability contract extended
verbatim), the split reveal batch (ledger at roll time, player-facing writes at delivery),
and the **approval gate** (decision 12's amendment above) — budgeted there at ~2½ days.
Phase 7 (encryption — phase 6 until the attribute layer took its number, 2026-08-23) is
deliberately optional and deliberately final: plaintext ships first, honestly documented,
and the setting arrives with no schema change.

---

## As built — phase 1 (2026-08-23), and where it departed from the plan

Built into `pentaryn-ties` 0.11.0 and verified live in `space-journey` (core 14.367 / dnd5e
5.3.3) as the GM. New files: `known-core.mjs` (pure — no Foundry global anywhere, 28 node
fixtures in `test/known.mjs`), `known.mjs` (flags, markup, listeners). Shipped exactly the
§6 cut list: no custom-category management, no standalone-window host, no "Kind:" line.

| The plan said | What the code required |
| --- | --- |
| §5: "`injectTab` is not already generic" | **Correct, and it was the whole of step ①.** It now takes a `SHEET_TABS` spec array — id, icon, tooltip, `shows(actor)`, build, bind — with the nav-rebuilt-separately guard, the `changeTab` workaround and the per-tab `ptBound` flag written once. The deactivate sweep was already over-broad enough to clear a second tab, so switching between Ties and Known needed no list of our own tabs. Each tab is injected in its own try/catch: a Known tab that throws must not cost the GM the Ties tab beside it |
| Decision 2 / §6: the add picker comes "straight off `candidates()`" | **`candidates()` is the wrong function.** It excludes everyone the actor already has a *tie* to — which for a notebook is exactly backwards: Ballad Quinn's 24 acquaintances are the people she is most likely to write about, and that picker would have hidden every one of them. What was wanted is the same LIMITED filter with a different "taken" set, which the tie dialog's `targetCandidates(source, "all")` already is. Used that, minus what is already filed. `ties-api.mjs` is untouched |
| Decision 3: humanoid/character → Sentient, every other type → Beasts | Needs a **third case the plan has no answer for**: an actor that does not resolve, and an actor with no creature type at all — 23 of this world's 136 actors have `system.details.type.value` blank. Both file as **Sentient**, on the reasoning that a name with nothing behind it is more often a person than a wolf. Fixtured, so it is a decision rather than an accident |
| Decision 2: `name` is "cached, live-resolved when possible" | Built as both: the reader returns `name` (live) *and* `cachedName` (what was filed), and `toStoredKnown` never writes the live one back. §7's disguise ruling — ~~still Joe's to make~~ made 2026-08-23 (→ `foundry-disguise.md`) — is then one branch in the renderer, not a schema change or a migration; under the pointer design the filed id is the persona's, so the branch fires only for unmarked renames |
| §5: reveals versus `NOTES_MAX` | `KNOWN_NOTES_MAX = 8000` ships **now**, in the schema, rather than waiting for phase 3. It costs nothing today and cannot be raised later without every entry written in between being the one that truncates |
| — (not anticipated) | Known rows needed **their own expansion-state Map**. Both lists key rows by the other actor's id, so sharing `editor.mjs`'s Map would make one character's tie to Wat Harrow and their notebook page about him a single piece of state |

**The Ties tab was the regression test, checked before and after**: Wat Harrow's 9 rows and
Ballad Quinn's 24 render, a row expands, a stance edit saves and repaints its summary without
blanking the sheet body, and a re-render while either tab is active restores that tab (the
`changeTab` early-return trap) — proven on both tabs, in both directions.

**One real bug, caught by the console rather than by a test**: the notes-autosave repaint read
`fresh.firstElementChild` *after* `replaceWith` had already moved it, so the rebind threw and
the new summary lost its click handler until the next full repaint. `editor.mjs` gets this
right; the line was not copied carefully enough. Fixed, and re-proven with the console cleared.

**Every test write was reverted.** The world ends where it started: 136 actors, 115 NPCs,
21 PCs, 54 carrying ties, 196 edges, Wat 7 out / 9 in, Ballad 24 / 24, and no `known` flag on
any actor.

Not done, and honestly named: **no player-client pass.** Both players were offline and logging
one in would have put a second session on Joe's live world mid-work. The non-owner render path
was proven instead against a stub actor with `isOwner: false` — read-only prose, no textarea,
no category select, no add bar, no remove — and the gate itself is `mayView`, shipped and
unchanged. The 15-minute player pass in §2's table still stands as owed.

---

## As built — phase 2 (2026-08-23): the canvas key

Shipped in `pentaryn-ties` 0.12.0. One keybinding (`fileKnown`, **Digit5**), one pure function
(`pickNotebook` in `known-core.mjs`, 6 new fixtures — 34 total), and three functions in
`known.mjs`: `notebookActor()`, `fileHovered(token)`, `openKnownEntry(actor, id)`. No new file, no
new `esmodules` or `styles` entry, so a browser reload was the whole deploy.

| The plan said | What the code required |
| --- | --- |
| Decision 2: "hover a token, press the key — opens that creature's Known entry **for this player's character**" | **"This player's character" is four different questions and the plan answers none of them.** A player driving one PC, a player who owns two, a GM who owns everything and means the token they have selected, anyone standing on a scene with no PC token. Built as an explicit precedence, extracted pure and fixtured: selected token → assigned `game.user.character` → the only owned character with a token here → refuse and say so. Rule 3 counts **actors, not tokens** — `overlay.mjs`'s `soleOwnedToken` counts placeables, so a PC standing on the map twice reads as ambiguous there; both tokens are one person and the notebook is the person's |
| Decision 2: filtered through `Token#isVisible` so a hidden token cannot be filed | Correct and kept — but the *shape* of the refusal is the load-bearing part, and it is `showOne`'s, not this plan's: hovering nothing, hovering yourself, and hovering a token you cannot see give **one identical sentence**. Three distinct messages would make the key an invisible-token detector — wave it at the dark and read which squares answer differently |
| — (not anticipated) | **Opening the entry means owning the sheet's tab state.** `tabGroups.primary` has to be written *before* `sheet.render(true)`: the injector activates our tab on its own tail, and going the other way (render, then `changeTab`) is the early-return trap phase 1 documented at length. A sheet that is already open re-renders its parts independently and can legitimately skip our repaint, so the open path ends by clicking the nav link and the row summary — the two gestures a reader would make, rather than a second copy of what they do |
| — (not anticipated) | The tab id was a **string in two files**. Now `KNOWN_TAB_ID`, exported from `known.mjs`: two copies of it is how a canvas key quietly starts landing on the Ties tab |
| §2's phase-2 check: "the entry's `id` equals `token.document.actorId`, never the delta id" | Proven exactly as written, on this world's unlinked tokens: Swarm of Rats filed `T6Y6Cu5zdPSCtyhl` while its delta is `68Vb16e5GBBcKvic`; Ozmandius filed `0SBW8nOwhLVK02gr` |

**The player pass phase 1 owed was paid.** As Kristine (Ballad Quinn), with the world live: the
GM-hidden token was a no-op, her own token was a no-op — both with the *same* sentence — a visible
token she has **no permission at all** on (Ozmandius, level 0) filed correctly, and the entry landed
on Ballad and nowhere else (Pip's own notebook stayed at zero rows). Both surfaces: real hover, real
`5`, sheet closed and sheet already open on another tab. Her Ties tab still renders its 24 rows with
the player's *In sight / Not in sight* wording.

**The real non-owner path, confirmed at last — and it is not the one phase 1 stubbed.** `mayView` is
`isGM || (playerAccess && isOwner)`, so for a player it *implies* ownership: on an actor she holds
OBSERVER on (a `character`-type loot actor, level 2) she gets **no Ties tab, no Known tab and no
header button at all**. The read-only branch inside `buildKnownHTML` is therefore unreachable for
players as the gate stands — it is reachable only if `mayView` is ever widened. Worth knowing before
phase 4 gates a lore section "the way `inbound()` does".

**Not re-tested, and named rather than claimed:** the `playerAccess` kill switch on this key. It is
`API.mayWrite()`, the same call and the same line the tie key uses, checked twice (keybinding and
`fileHovered`) — but a world setting needs a GM client to flip, and one browser holds one session.

**Every test write was reverted and the revert verified.** 136 actors, 54 carrying ties, 196 edges,
Wat Harrow 7 out / 9 in, Ballad Quinn 24 / 24, no `known` or `knownCategories` flag on any actor, the
rats token un-hidden, `playerAccess` and `sheetTab` untouched.

---

## As built — phase 3 (2026-08-23): the study conduit and the kind ladder

Shipped in `pentaryn-ties` 0.13.0. One new file (`study.mjs`, ~640 lines), the pure layer and 34
new fixtures in `known-core.mjs` / `test/known.mjs` (**68 total**), the affordance and the "Kind:"
cross-reference in `known.mjs`, one world setting (`holdDefault`), 40 strings. **No new
`esmodules` or `styles` entry** — `study.mjs` is imported, so a browser reload was the whole
deploy, with Joe connected throughout.

Built in the §2 ladder's order, and the order earned its keep: rungs 1–3 each found something the
next rung would have been built on top of.

### The probes, and what they actually said

- **The tier-25 enricher probe (run first, as §4 demanded).** `enrichHTML(desc, {relativeTo: item,
  rollData: item.getRollData()})` on the installed MM's Goblin Warrior turns
  `<p>[[/attack extended]]. [[/damage average extended]]…</p>` into **"Melee Attack Roll: +4, reach
  5 ft. Hit: 5 (1d6 + 2) Slashing damage…"** — real numbers, no brackets. `[[lookup @name
  lowercase]]` resolves to "goblin warrior". The `relativeTo` wiring the plan flagged as
  grep-level is confirmed, and **the whole extraction is one call**, as decision 7 hoped.
- **The same probe's control is the important half.** Enriching that string **without**
  `relativeTo` leaves `[[/attack extended]]` completely intact — and `pentaryn-lookup`'s
  `toPlainText`, whose job is search snippets, degrades the survivor to the plausible-looking
  words *"attack extended"*. So §1's instruction to reuse that flattener **does not survive
  contact**: the two want opposite policies on an unresolved enricher. Ties ships
  `safeFlatten`, which **refuses the string** (returns null) and falls back to the item's plain
  name. Fixtured both ways, which is the "test failure, not a code comment" the plan asked for.
- **The `configure:false` probe (rung 3), live on the GM client.** `rollSkill({skill:"arc",
  target:15, advantage:true, rolls:[{parts:["@situational"], data:{situational:5}}]},
  {configure:false}, {rollMode:"blindroll", …})` → formula `2d20adv + 5 + 1 + 3`, two d20s with
  the higher active, `roll.options.target === 15`, `isSuccess` true, and a message with
  `blind: true` whispered to GMs. The config shape in §2 is right; the only correction is
  cosmetic — v14/dnd5e renders advantage as **`2d20adv`**, not `kh`, so a regex looking for `kh`
  finds nothing.

### Where the plan was wrong, and the code won

| The plan said | What the code required |
| --- | --- |
| Decision 11 step 3: "LIMITED reach on the target re-checked" | **Taken literally this refuses the entire feature.** Phase 2 proved a player files monsters they hold *no permission at all* on, because the canvas gesture's reach test is `Token#isVisible` — and monsters are exactly what the ladder is for. Reach here is **LIMITED, or a token of the subject on a scene the user can be looking at** (`game.scenes.active` / the GM's `canvas.scene`), re-derived GM-side. This is the fix `foundry-disguise.md`'s "what bites" table recommends and flags as undecided; phase 3 is where it landed. Proven both ways live: the kind actor, with no token and no LIMITED, is refused; Grix, with one hidden token on the active scene, is allowed |
| §5: "`studied` demotes to a UI hint; the handler refuses off the belief ledger" | **Correct, and load-bearing — but only half the story.** `studied` must still be written **at roll time even when the reveal is held**, because it is what makes the affordance vanish. An affordance that lingers while a reveal waits is a "your roll is pending" tell that a plain failure would not have. Proven: Kristine's client, hold on, affordance gone, notebook untouched |
| §2 rung ⑤: "reveal + `studied` lock in **one** update — atomic" | True for the auto path and **impossible for the held one**, by decision 8's own split. Built as: one `Actor#update` carrying both when auto; lock-now / reveal-later when held, with the ledger row as the store. Nothing can be lost — the payload is parked before the lock is announced |
| Decision 12: `beliefs` written with `setFlag`-style whole-object writes | **`Actor#update` MERGES.** Deleting a key from the object `getFlag` handed you and writing it back does *nothing*. Caught live: the first GM **reset** reported success, cleared the player's `studied` hint, and **left the belief standing** — so the affordance came back on a roll the handler still refused, which is worse than not resetting at all, because the refusal is a message a plain failure never produces. Fixed with Foundry's `-=` deletion keys. ⚠ `{recursive:false}` is *not* the fix and is dangerous: on `{"flags.pentaryn-ties.beliefs": {…}}` it replaces the whole **`flags`** object and takes `ties`, `known` and `worn` with it |
| — (not anticipated) | **`activeGM` identifies a USER, not a session, and one GM can be logged in twice.** Measured, not imagined: `lsof` on port 30000 showed the Foundry desktop app *and* a browser both signed in as Gamemaster, so `isApplyingGM()` was true on both and every socket request was handled twice. `relay.mjs` survives this because its write is idempotent; a conduit that **rolls dice** does not — two clients, two totals, two belief records, two reveals, two stub cards. Each client now stamps a per-load id into the ledger row *before* rolling, waits 250 ms for the server to broadcast whichever landed last, and only the winner rolls. One extra document write; the loser is silent |
| Decision 7: "tier 15: `details.biography.value`, flattened to prose" | **An MM biography is not a description — it is the creature's whole lore page.** The Goblin Warrior's flattens to 3,000-plus characters and opens with a gear list and two image captions before reaching a sentence anyone would write down. Derived prose is now capped at 700 characters, cut on a word boundary, ellipsis-marked. The real conclusion is the one the feature already wanted: **the authored rung is the description**, and derived text only keeps a kind rollable until somebody writes one |
| Decision 11's contract, "no pixel differs by outcome" | **A timestamp is a pixel.** The obvious composition skips the biography enrichment when an authored message exists and the attack extraction below 25 — and that made a tier-0 roll complete in **731 ms** against a tier-25's **991 ms** on the same kind. The player's stub card is posted after composition returns, so a quarter-second of extra silence *was* the number. Every rung now does the full derivation and the tier only chooses what survives: composition measured flat at **3.0–4.1 ms** across all four rungs afterwards, with no ordering by tier |
| §5: "ship the module's own two-control mini-dialog" — dnd5e's dialog cannot run detached | Confirmed and built as described. Payload is unchanged: two ids and two bounded declarations |
| — (not anticipated) | `game.socket.emit` **does not loop back to the sender**, so a GM pressing the button on a player's sheet — which they can, owning every actor — would send a request into a room where the only listener is themselves. The GM calls the handler directly instead, same validation, one hop shorter. It is also how the whole conduit is exercisable without a second browser |

### The two-client run

Chrome alternated between **Kristine (Ballad Quinn)** and Gamemaster; a second Gamemaster session
in Safari was the standing arbiter throughout, refreshed between builds with core's own
`game.socket.emit("reload")` (foundry.mjs:91311/207489). Fixture: an MM **Goblin Warrior** imported
as a world actor with authored rungs at 0 and 15 (both deliberately false), and **Grix the
Gutter-King** pointing at it via `kindOf` — decision 4's own example, built as its own actor.

**Refusals first (rung 2), forged from Kristine's console** — unknown character id, unknown subject
id, a character she does not own (Pip Locksley), a subject with no reach, and an NPC in the
character slot: **five requests, zero writes, zero chat, zero notifications**, and the GM's console
carrying one named warning each. Repeated with `playerAccess` **off** against a kind she had never
studied (Ozmandius, no LIMITED but a token on the active scene, so reach would have passed):
refused, zero writes — the kill switch phase 2 owed, now paid on *both* halves, the button and the
conduit.

**The indistinguishability run, on the player's client, through the real GUI** (click the row,
answer the combat warning — which fired for real, Ballad being in a live combat — set the
situational bonus, press Study it):

| | roll 1, situational −100 | roll 2, situational +100 |
| --- | --- | --- |
| real total (GM ledger) | −82, tier 0 | +112, tier 25 |
| `#chat-log` DOM | **identical**, after stripping core's transient `deleting` class | identical |
| what the player reads | "Gamemaster privately rolled some dice ??? ?" · "Ballad Quinn studies Grix the Gutter-King." | byte-for-byte the same two lines |
| entry row `outerHTML` | **identical outside the notes prose** — first differing character: none | identical |
| roll affordance | gone | gone |
| `ui.notifications` | none | none |
| Dice So Nice | 0 animations | 0 |
| `isContentVisible` on the blind card | `false` | `false` |
| `studied` flag | `{when}` only | `{when}` only |

**The held-case variant** (`studyHold` true, same character, same kind, a GM reset between):
chat DOM **identical**, entry rows **identical**, notebook empty in both, affordance gone in both,
no notifications, no dice, `studied` = `when`. Round-trip marks from the socket emit: failure
`{blind 332 ms, lock 598, stub 645}`, tier-25 `{347, 492, 535}` — the *bigger* answer arrived
sooner, which is the point: the spread is document-update jitter and there is no ordering by tier.
The pending tier-25 (total 124, 1,063 characters parked) was then delivered on the GM's command and
landed as a new **Goblin Warrior** page on Ballad — the kind entry created by the reveal itself, as
decision 7 says.

**One honest reinterpretation.** The brief asked for "a pending held success byte-indistinguishable
from a plain failure". That comparison cannot hold and should not: an *unheld* study failure always
delivers its sub-15 text, so it differs from a pending row by having prose. The contract that
matters — and the one that was run — is decision 8's own: within a fixed hold setting **no
observable varies by outcome**, and hold status itself "may become inferable to a player over
time; that is acceptable — it correlates with the GM's taste, never with any outcome."

**Cut, and named:** the GM Beliefs *section* on the sheet (phase 4's, per §5's own correction — the
data is exposed as `study.beliefs()` and `study.pending()` in the meantime), tier authoring as a
surface (console API, same reason), and the piggybacked disguise check from
[`foundry-disguise.md`](foundry-disguise.md) phase B, which needs the mask that does not exist yet.
The **approval gate** was built in full, because it is a property of the conduit rather than a
feature beside it.

**Every test write was reverted and the revert verified.** 136 actors (115 NPC, 21 PC), 54 carrying
ties, **196 edges**, Wat Harrow 7 out / 9 in, Ballad Quinn 24 / 24, no `known`, `knownCategories`,
`studied`, `beliefs`, `kindOf`, `studyTiers` or `studyHold` flag on any actor, both test actors and
the test token deleted, 20 study chat messages removed, `playerAccess` back on and `holdDefault`
never persisted. Ties tab and Known tab checked before and after on both surfaces: Wat's 9 rows and
no Known tab (NPCs keep no notebook), Ballad's 24 tie rows with the player's *In sight / Not in
sight* wording, and her Known tab back to its empty state.

---

## As built — the rework phases 1–3 owed (2026-08-23), before phase 4

Decision 15's checklist, shipped in one change across five files. Every row of that table is
green; what follows is only what the table could not have known in advance.

### The schema, as it actually landed

`flags["pentaryn-ties"].granted` — a sibling map on the **character**, keyed by the fact the
text came from, never a field on the Known entry:

```
kind:<kindActorId>            → { text, when, icon, source }
lore:<actorId>:<loreId>       → phase 4
attr:<attrId>:<loreId>        → phase 6, and the reason the map is not per-entry
mask:<actorId>:<layerId>      → the disguise plan
```

`readGranted` sanitises it the way `readKnown` sanitises the notebook (never throws, never
returns a non-object — it runs on every sheet paint and a bad flag must not cost a tab).
`grantsForEntry(granted, entryId, {attributeIds})` is the render-time join; `buildKnownHTML`
computes it once per paint rather than per row.

`imposter` went through `readKnown` **and** `toStoredKnown` in the same change, per the
disguise plan's both-functions-in-one-commit rule. The stored-shape fixture that asserted
"only the five fields survive" now asserts six and carries a comment saying that its failing
after a schema widening **is the gate working**, not a stale test.

### What the live run proved, and what it cost

One GM pass (`studyAs`, situational +100 to force tier 25) and one real player pass — a
Kristine session in Chrome, role 2, owning Ballad Quinn:

| Claim | How it was shown |
| --- | --- |
| The reveal leaves `notes` alone | grant in `granted`, `notes` length **0** after a tier-25 study |
| Reset + re-roll **replaces** | exactly one `kind:` key; text changed; no second copy |
| **The erasure disproof, live** | player selected all, typed over it, autosave fired → `notes` saved, `JSON.stringify(granted)` **byte-identical** |
| Read-only in both branches | `0` editable controls inside `.pt-granted` on the owner's own sheet |
| Escaping holds | a note of `<b>mine</b>` renders as text; grant prose carries no raw tags |
| `pre-line` survives to the sheet | computed style `pre-line`; the authored rung's line breaks visible in the render |
| The summary preview stays notes-only | collapsed row shows the player's prose, never the grant |
| No GM-private leakage | other rungs `[]`, no DC, no success/failure wording, `0` GM buttons, `0` inbound rows |

The world was restored from a captured baseline and re-verified: 136 actors, 54 carrying
ties, 196 edges, Wat Harrow 7, Ballad Quinn 24, and **zero** stray `known` / `granted` /
`studied` / `beliefs` / `studyTiers` / `kindOf` anywhere in the world.

### Two things the plan did not anticipate

**1. `reset` could now revoke — ruled 2026-08-23: it never will.** See decision 22.

The question was raised because the grant map made revoking *possible* for the first time.
Joe closed it by pointing out the question had stopped making sense: notes and discoveries
are now two different things, so there is nothing for a reset to protect. The behaviour
shipped stands unchanged — reset clears the lock, the grant survives, a re-roll replaces it.

**2. The provenance line is redundant today.**

Each grant renders an icon and the source's name. Under a `kind:` grant on the kind's own
page that repeats the row header directly above it. It is right for `attr:` grants in phase 6
— where the whole point is that the text came from the *guild*, not this rogue — so it stays,
but phase 6 should revisit whether to suppress it when the source **is** the entry.

### A note on how the staleness was diagnosed

`game.modules.get("pentaryn-ties").version` read **0.10.0** against a 0.13.0 manifest. That is
not evidence of stale code: `module-sync`'s own output says `module.json` is read once at
startup. The client was probed for what phases 1–3 actually *register* (`fileKnown`,
`holdDefault`) — both present — before concluding anything. Check the behaviour, not the
version, exactly as the sync note says.

---

## As built — phase 4 (2026-08-23): the individual axis

Decision 8's lore rows, under decision 21's five rules. All five held; the two that cost
something are noted below.

### The seam is the phase (rule 4)

`resolveFact({ns, subjectId, factId})` in `study.mjs` answers *"what is being studied?"* once,
and everything downstream — reach, the lock, the belief row, the grant key, the DC, the skill,
how a total becomes prose — reads off the descriptor it returns. `kind:` and `lore:` are two
branches of one function; `attr:` and `mask:` are a third and fourth later.

That collapsed the conduit rather than growing it: `applyStudy`, `writeBelief`,
`applyPlayerWrites`, `claimRoll`, `releaseClaim`, `deliver`, `pending`, `reset` and `beliefs`
all became namespace-agnostic and there is now **one** copy of "which ledger, whose reach,
which lock". That was the argument for the rule and it paid immediately: the approval gate,
the claim protocol, the blind-roll settings and the combat warning all reached lore rows for
free, and every one of them was verified live without being written twice.

The two namespaces disagree about exactly **one** player-facing thing, and it is one line:

| | ledger (beliefs) | files under (the Known entry) |
| --- | --- | --- |
| `kind:` | the kind actor | the **kind's** page — the bestiary entry every goblin shares |
| `lore:` | the individual | the **individual's** page — this axis answers *who is this one* |

### Where the plan was wrong, and the code won

**1. A cancelled lore roll graded as a failure.** `loreOutcome` guarded the total with
`Number.isFinite(Number(total))` — and `Number(null)` is `0`, which is finite. A cancelled
dialog would have scored 0, failed the row, and spent the player's one attempt on a mis-click.
`tierOf` documents this exact trap and the new function walked into it anyway. A fixture
written before the code caught it; the guard is now `typeof total !== "number"` first.

**2. Storage and affordance are different questions.** The first cut had `readLore` drop a row
with no label, so a GM pressing **Add a fact** created a row that was deleted on its way to
disk. Fixed by splitting the concern rather than special-casing the editor: `readLore`
sanitises *storage* and keeps drafts; `rollableLore` is the *affordance* list and requires a
label **and** something authored on at least one side — a row with neither hands over nothing
whatever the dice do, so offering it spends the attempt on guaranteed silence. `resolveFact`
resolves only rollable rows, so a row blanked mid-gesture stops being a fact.

**3. The miss line got a warning, not just a paragraph in this document.** Decision 8's
amendment says a row with no miss text leaks failure by silence. That is now a ⚠ on the row in
the editor, and `loreOutcome` returns `silent: true` so the conduit skips **only** the grant —
the lock is still spent and the stub still posts. Verified live: a DC-40 row with no miss text
produced no grant, a spent lock, a public stub and a vanished affordance, which is what a
*pass* on an unauthored row would also produce.

### The live run

One GM pass and one real player pass (Kristine, role 2, over the socket):

| Claim | How it was shown |
| --- | --- |
| Lore files under the individual | grant key `lore:<actorId>:<rowId>`, entry created for Alys Tunner, not for a kind |
| Provenance distinguishes rows | grant `source` is the **row's label**, so several lore grants on one page stay readable |
| Silent failure is indistinguishable | no grant, lock spent, stub posted, affordance gone — same observables as a pass on an unauthored row |
| The approval gate reaches lore | held roll parked its payload, prompt showed the text and total, **Later** kept it, **Deliver** landed it, second Deliver returned `false` |
| Colon keys survive Foundry's deletion syntax | `flags…studied.lore.-=lore:<id>:<row>` and the belief `-=` both cleared; `beliefs` ended `{}` |
| Decision 22 holds | after two resets: locks and belief rows gone, grant **byte-identical**, player's notes untouched |
| The blind card stays blind | on Kristine's client: `blind: true`, `isContentVisible: false` |
| **A notebook entry is not reach** | her first click was refused — *"Kristine cannot see Alys Tunner"* — with the entry already in her notebook. `canReach` re-derives from documents; the entry proves nothing |
| No GM surface for a player | `.pt-authoring`, `.pt-lore-editor`, `.pt-belief`, `.pt-gm-badge`, and every authoring control: **0** on every tab |
| No prose leak | the DC-40 row's secret and the other row's miss text: `indexOf` **−1** across her whole sheet, while its label and DC render by design |

World restored and re-verified: 136 actors, 54 carrying ties, 196 edges, Wat Harrow 7, Ballad
Quinn 24, ownership back to its recorded value, 10 test chat cards removed, and zero stray
`lore` / `known` / `granted` / `studied` / `beliefs` / `studyTiers` / `kindOf` anywhere.

### Carried forward

- **`studyAs` now throws lore rolls too** (`{loreId}`) — a GM hand-throw with no socket and no
  dialog. It existed for the kind ladder; generalising it is what made the deterministic
  pass/fail live test possible at all, and it is a real GM affordance rather than test scaffolding.
- **The kind picker offers 115 NPCs** on this world, grouped into *used as a kind already* and
  *every other NPC*. Workable, not good. If phase 6's attribute picker gets autocomplete, this
  should borrow it rather than grow its own.
- **The Beliefs section landed here**, as the build-and-validate cut list said it would — it
  was phase 4's all along, deferred out of phase 3 with `beliefs()`/`pending()` as the console
  stand-in. Both still exist and now walk every namespace off the ledger's own keys, so phase
  6's rows appear there with no edit.

---

## As built — phase 6 (2026-08-23): the attribute layer

Decisions 16–20, under decision 21's rules. The estimate was ~6 days honest 5–8; it came in
short because rules 1, 3 and 4 had already been paid for in phases 4 and the rework — which is
the clearest evidence those rules were worth writing before the code.

### What rule 3 and rule 4 actually bought

**Rule 3 (the target-agnostic editor).** `lore.mjs` mounts on a registry entry with a different
`save` and **zero changes**. The file that edits an NPC's lore rows edits an attribute's,
because it never knew what an actor was. This was the single largest saving in the phase.

**Rule 4 (the seam).** The `attr:` branch is ~35 lines in `resolveFact`, and it is structurally
unlike the other two — its ledger is a **world setting**, not a document, and its "subject" is
a registry entry, not an actor. Nothing downstream changed anyway, because downstream only ever
reads the descriptor. The one place the difference surfaces is a pair of accessors,
`readBelief`/`putBelief`, so the flag-vs-setting split is stated **once** instead of at the
seven call sites that would otherwise each have to know.

`subject` stays the **creature in front of the player**, not the attribute: reach is "can this
player see who they are asking about", and an attribute has no tokens. Studying the guild
through a guildsman standing there is the gesture — and it is why the same fact can be learned
from any member.

### The claim the sibling grant map existed for, finally exercised

Decision 15 argued the grant map had to be a sibling keyed by fact, partly because *"learn the
guild's secret from one rogue and it must appear under **every** rogue you have filed."* That
was a prediction for eleven days. It now runs:

> A fact rolled through **Alys Tunner** rendered, byte-identical and with identical provenance
> (*"North Goblin — What the tribe swore at the Cairn"*), under **Ansa Pike**'s entry — a
> creature the roll never touched. Both offers went spent, because the lock is on the fact.

Two joins had to be widened for it, and both were quiet bugs at the time they were written:
`grantsForEntry` refused an empty `entryId`, which broke the Attributes tab's "what have I been
told about this group" call; and `known.mjs` never passed `attributeIds`, so the entry rows
would have joined `kind:`/`lore:` grants and silently dropped every `attr:` one.

### The degeneracy rule is enforced in the reader, not at the call site

Decision 19's worry — `type:humanoid` is carried by nearly every creature, so sharing it would
grant advantage on studying almost anyone. Verified closed, twice over:

| Check | Result |
| --- | --- |
| PC and NPC both `type:humanoid`, both `size:med`, nothing else shared | **0** advantage sources |
| A GM authors a registry entry for `type:humanoid` with `advantage: true` | forced to `false` **on read** — a hand-edited setting cannot reopen it |
| PC and NPC share the authored guild | 1 source, named *North Goblin* |
| RAW vs netting on 2 adv + 1 dis | `normal` vs `advantage` — they disagree exactly where the decision says |

Advantage sources are **recorded on the ledger row, not recomputed** (`sources: {adv, dis,
shared, declared, rule, resolved}`). The registry can be edited after a roll, and a GM asking
"why was that at advantage" three scenes later must get the answer that was true *then*.

### Derivation, re-verified before it was built on

Decision 16's path table was marked verified, and was re-probed against live actors anyway
before a line was written. All five confirmed. Two findings the table did not have:

- `system.details.race`/`.background` resolve to the **Item document directly** in dnd5e 5.3.3,
  as well as via the embedded-item lookup. Both work; the item lookup is primary because it is
  the shape the table documents.
- `system.details.type.subtype` exists and is populated on PCs (`"Human"`) and `null` on this
  world's NPCs. **Deliberately not derived**: it duplicates `species:` where it is populated and
  is empty where it is not, so it would add a namespace that says nothing new.

Derived titles are asked of the world, not guessed from the slug — `size:med` is *"Medium"* to
dnd5e and *"Med"* to a title-caser, and a tab that prints stat-block codes at a player is
showing them the database rather than the game. `kind:` asks `game.actors` for the name.

### The permission split, measured

Decision 16: *only the GM can edit these; players can see them.* On Kristine's session (role 2),
across the whole Attributes tab:

| Control | Count |
| --- | --- |
| search box, Create, Delete, Unlink, Author, entry fields, lore editor, shared-scope banner | **0** each |
| the advantage indicator (GM bookkeeping) | **0** |
| what she was told, read-only with provenance | rendered |

No unearned lore prose, no roll totals, and — scoped to this module's markup rather than the
dnd5e sheet around it — no advantage wording. Her client *holds* the registry and the ledger,
because world settings sync to every client; that is the documented UI-hiding boundary Joe
ruled on, identical to lore rows on an NPC, and phase 7 is what changes it.

### Carried forward

- **The shared-scope banner** (*"Shared — every carrier of North Goblin"*) sits between the
  per-actor fields and the registry editor, marking exactly where scope changes. Decision 16
  asked for it; it is the one piece of UI in this phase that exists purely to prevent a mistake.
- **Deleting a registry entry does not touch links** — it cannot: derived links are computed and
  authored links are ids on actors. A deleted entry degrades every carrier to a bare id with no
  lore and no advantage, which is exactly what an underived id already is, so there is one
  behaviour rather than two. Re-creating it with the same id restores everything.
- **`bonuses[]` stays empty and is emptied on read**, so v1 cannot grow one by accident
  (decision 20).
- **The kind picker's 115-NPC list** from phase 4 should now borrow this phase's autocomplete.
  Still outstanding.

World restored and re-verified: 136 actors, 54 carrying ties, 196 edges, Wat Harrow 7, Ballad
Quinn 24, both new settings back to empty, `advantageStacking` back to `raw`, 6 chat cards
removed, and zero stray flags of any kind on any actor.


---

## Phase 8 proposal — attributes as *secrets*, and the knowledge tree (drafted 2026-08-23, from Joe's notes)

**Status: reviewed 2026-08-23 — GREEN WITH CONDITIONS. Three blocking questions await Joe; build
has not started.** Sections below are in the order the design was worked out, not the order it
should be read; §R is the review's verdict and supersedes the drafting notes wherever they differ.

---

## §R. Review outcome — what the adversarial pass changed

**Verdict: green with conditions.** The two-stage/backfill model is coherent once two holes are
plugged; the observables story was the right instinct but incomplete, and the fix changes how the
conduit *rolls*, not just how it posts.

### R1. Two shipped defects, found by the review and **fixed immediately** (2026-08-23)

Not phase 8 work — live bugs in phase 6, reachable through decision 16's own advertised path
(*"authoring lore for every human is creating the `species:human` entry"*). A derived id contains a
colon, and **three** call sites parsed fact keys with `split(":")`:

| Site | Effect | Proven by |
| --- | --- | --- |
| `grantsForEntry` | a grant on an authored derived attribute **rendered nowhere** — the subject read as `"species"` | `grantsForEntry(...)` returned `[]` for `attr:species:human:origin` |
| `pending()` | a held reveal on one was **silently dropped** from the GM's nag surface — a stranded roll, the failure the claim protocol exists to prevent | the key split to 5 parts against a `length !== 4` guard |
| `parseFactKey` | same flaw, not named by the review — found while fixing the other two | — |

Worse than a plain bug in one place: the comment above `pending()`'s split *claimed* a
right-to-left parse the code did not perform. A comment asserting a safety property that is not
there is how the next reader stops checking.

**The grammar, now in one parser and fixtured:** the namespace is up to the **first** colon, the
fact is after the **last**, and everything between is the subject however many colons it holds.
Fact ids are Foundry randomIDs and namespaces are a closed set, so only the middle is variable.
`parseLedgerKey` applies the same rule to `<factKey>:<characterId>`. Three regression fixtures,
including the live reproduction. 93 fixtures green.

### R1b. Joe's rulings on the three blocking questions (2026-08-23) — two model holes dissolve

**Q1 — ancestors are MATERIALISED AT WRITE, not computed at read.** *"Add a child attribute to auto
add all the parents as a requirement… this removes having to write in any sort of imply checking
during play."* Linking `assassinsguild` writes `undercity` and `ardenhaven` too. A carrier missing
an ancestor is an **invalid sheet**: fail open, but surface an error, and the authoring path must
not be able to produce one.

Stronger than the recommendation it overrules (compute-at-read): gates become plain set membership
instead of a tree walk on every check, and **Fable's critical finding 1 stops being possible** —
the unreachable-membership state cannot be constructed. It does not contradict decision 16's
rejection of stored derived links: that was about `type:`/`species:` derivation, this is ancestor
closure of authored links.

⚠ **The cost, and it is the one thing this trades away: re-parenting goes stale.** Move
`assassinsguild` under a different city and every existing carrier still carries the old one. Not
*invalid* — they carry an extra ancestor, not a missing one, so the validator will not see it.
**Recommend: re-parenting offers the GM a carrier sweep** (a world-authoring action, never a play
action, and never silent). Listed as new question N1.

**Q2 — the tree gates `is-a`, NOT `knows-a`.** *"You can know of an assassin without knowing anything
about the city, like an assassin from a city across the world."*

This **corrects the model in §2**: stage 1 is *not* gated by the parent's stage 1. World knowledge
is free-standing; only identification climbs.

| | Gated by ancestors? | |
| --- | --- | --- |
| **stage 1 — knows-a** | **no** | you have heard of a distant guild; the city means nothing to you |
| **carriership — is-a** | **yes**, enforced at write (Q1) | you cannot be in the guild without being in the district |
| **stage 2 — identification** | **yes**, per creature | still Joe's three-roll ladder |

The flavour this produces is exactly the one Joe wanted: you know the Crimson Hand exists, you meet
one, and you *still cannot place them* — because you cannot place their city. Knowing of a guild is
not the same as being able to spot its members. **And it is why `whenCarried: auto` bypassing the
gate matters**: a fellow assassin reads the mark directly, no geography required.

**Fable's HIGH finding 5 dissolves with it** — a known node under an unknown ancestor is no longer
a wedged tree, it is the *intended* state. Its "disclosure cascades up" fix becomes an **option on
the share dialog**, which is Joe's own next sentence: *"when I share as a knows-a I get an option
to share parents, or just the child knowledge."*

**Q3 — no reset button. The valve is diegetic.** *"If they fail, the character simply does not know
about that city, no amount of time is going to change that fact."* Recommendation overruled, and
rightly: a GM reset is an admin action, and Joe replaces it with two in-world routes —

- **story disclosure** — travel there, deal with enough of its people, and the GM releases it
- **research** — *"go to a library and roll for it"*, and **that roll is OPEN, not blind**: *"now
  they know they are looking for a thing, and would know whether they discovered it or not"*

⚠ **An open roll is a new roll type this module does not have.** Every roll shipped is blind by
construction, and the indistinguishability contract (decision 11) exists to keep it so. Research is
the opposite by design and is *safe* to be, because the player declared the target — there is
nothing left to hide about whether they found it. It needs its own path, not a flag on the blind
one. New question N2.

**A stage-1 failure therefore locks the INSPECTION route, not the attribute.** Cleanest statement:
you can never again *recognise it on sight*; you can still *learn it properly*. That is a better
rule than permanence-with-an-admin-override, and it is the one that makes the harshness bearable
without a GM having to remember a button exists.

**And per-character disclosure falls out of it** — Joe: *"I can share an attribute with just one
player… open up their character sheet, GM-only, filter the name, click add. I can also create
attributes this way."* The control already exists (`attributes-ui.mjs`'s search + create); what
changes is that it must be **GM-only on someone else's sheet** and must be able to grant **knows-a**
as well as **is-a**. New question N3.

### R1f. `gate` was a bad name — the scale and the approval gate are orthogonal (2026-08-23)

Joe, catching it mid-sentence: *"gate just means it rolls but the GM has to release, advantage
means it auto — well crap, it can be gated either when it's auto or advantage, because it could be
they have an advantage but I still want to gate it because success means I need to accept and go
into story telling."*

He is right, and the collision is a naming defect introduced in this document, not a design
problem. **`hold` already exists** — the approval gate (disguise decision 8), shipped on lore rows
(`hold: true|false|null`) and on kinds (`studyHold`), inheriting the `holdDefault` world setting.
Naming a value on the help-scale `gate` put two unrelated ideas on one word.

**Rename the scale's weakest value `gate` → `enables`**, which says what it actually does:

| | `enables` | `advantage` | `auto` |
| --- | --- | --- | --- |
| **whenKnown** | knowing lets you roll, and helps no further | roll with advantage | no roll — you spot every carrier |
| **whenCarried** | *(floor is `inherit`)* | advantage recognising your own | you simply know your own |

**`hold` is a separate field on the attribute**, tri-state exactly like a lore row's, governing
*identification*. It composes with every cell above, including `auto`: an auto-identification with
`hold` on means the player inspects, nothing appears, and the GM chooses when the recognition
lands — which is the storytelling beat Joe is describing. A lore row keeps its **own** `hold`,
because it is a different roll.

⚠ **Consequence for the cascade, and it needs deciding at build time: a held rung suspends the
rungs beneath it.** You cannot identify the guild before the district has been delivered, so a hold
partway up stops the climb. Two ways to resume, and only one is safe:

- **The GM's Deliver resumes the cascade** and rolls the remaining rungs — **recommended.** The
  player's one gesture buys the whole climb, whenever the GM lets it land.
- ~~The player inspects again~~ — **rejected.** The earlier rungs are already spent so it is cheap,
  but the player learning *more* on a second inspection tells them the GM approved something in
  between. That is a channel, and it is the outcome-shaped kind.

No leak either way while held: the player inspects, gets the uniform stub, and sees nothing —
identical to a failure and identical to inspecting someone who carries nothing.

### R1g. The suspended cascade is RE-ENTRANT, not stored — ruled 2026-08-23

Joe: *"I don't want the player to have to keep inspecting. They inspect once and then I get to
decide what I hold. If I hold the parent that means they get nothing else. If I release the parent,
a blind roll for the next layer, which I get a prompt for, and then finally. But I can also have it
be [deliver, deliver, hold], in which case I only get a prompt on the really big item — which is
more likely the case."*

**The deeper rungs are not rolled at inspection time.** A hold suspends the climb *before* the dice
for the rungs beneath it, and releasing rung 1 is what causes rung 2 to roll. Confirmed above:
*"if I release the parent, a blind roll for the next layer."*

**Which means resume needs no stored cascade state at all.** The gates are computed from the
identification ledger (R2 condition 9 — store outcomes, compute gates live), so:

> **Resume = re-run the cascade for that (character, creature) pair.** Rungs already identified are
> spent and skipped; the newly-unblocked rung rolls fresh; a rung still held stops it again.

The cascade is idempotent and re-entrant, and the pending belief row for the held rung *is* the
suspension record. One hook in `deliverFact` — after delivering, re-enter the cascade for that pair
— and nothing new is persisted. This is the cheapest version of the behaviour Joe asked for, and it
falls out of a condition already on the list for other reasons.

**Observables at release time.** The stub was posted at inspection (stub-first, R2 condition 2) and
is **not** re-posted — one stub per gesture still holds, and the release is the GM's action, not the
player's. The player sees knowledge appear; that is the point of releasing it. Nothing to hide,
because the GM has just decided to tell them.

⚠ **Two things to get right, both small:**

- **A failed rung after a released parent must not reveal that a deeper rung exists.** Release the
  city, rung 2 rolls, rung 2 fails. The player now knows the city and nothing more. They must not
  be able to tell whether a district was attempted or whether one exists at all — so the
  world-knowledge surface must **never render unknown children as placeholders**. Show what is
  known; show nothing where nothing is known.
- **A cascade the GM never releases stays suspended forever**, and the player's one inspection is
  spent. Correct — it is the GM's call — but the pending row must stay visible on the Beliefs
  surface, or a forgotten hold is indistinguishable from a thing that never happened.

⚠ **Naming trap, the same class Joe just caught with `gate`:** he used *"auto"* here to mean
**hold off / deliver without asking**, while the help-scale's third value `auto` means **no roll
needed**. Different fields, no schema collision — but the words collide in conversation, which is
exactly how the last one bit. The shipped UI labels already keep them apart (*"Always hold" /
"Never hold" / "Use the world default"* versus the scale's *enables / advantage / auto*); keep that
discipline in the authoring surface and never label a hold control "auto".

### R1d. Research is CUT — ruled 2026-08-23, and it takes three open questions with it

> *"the research doesn't need anything built… it's a VTT game right, so we don't need a system for
> the research, that's just the player rolling their skills and the DM deciding if they want to
> release that knowledge — success means I go to their character sheet and manually give them what
> I feel they learned."*

**Nothing is built.** The player says they are researching, rolls a skill in Foundry's own UI, and
the GM grants through the per-character control. Three questions raised one message earlier
evaporate rather than get answered:

| Question | Fate |
| --- | --- |
| N2 — research needs a retry gate or permanence means nothing | **Gone.** The GM decides each time; there is no repeatable mechanic to gate |
| N3 — offering a research target discloses that it exists | **Gone.** There is no research surface to browse, so nothing to leak |
| The open (non-blind) roll as a new roll type | **Gone.** It is an ordinary Foundry skill roll this module never sees |

That leaves **every roll this module makes blind**, with no exception to carve into decision 11's
contract — a strictly better outcome than the exception it replaces.

### R1e. The settled acquisition model, in one table

The asymmetry Joe named: *"researching or world interactions… where the GM gives you an attribute
is the only way to know of a thing without the [ancestors]."*

| Route | Grants | Ancestors |
| --- | --- | --- |
| **Blind inspection cascade** | `knows-a` **and** identification, per rung climbed | **necessarily included** — you cannot reach the guild without passing the city and district on the way |
| **GM manual grant** | `knows-a` of any node | **optional** — the share-parents checkbox |
| **GM authoring carriership** | `is-a` | **materialised at write** (Q1) |

Which produces exactly the intent: *"blind rolls must always build from knowing about the city,
district, assassin guild, so just happening to have known something so precise is difficult — and
it should be. It means being highly INT and focused on knowledge can really benefit, and you can
feel insanely smart and know things about the world."*

⚠ **Consequence worth stating at the grant control: a leaf granted alone is INERT for
identification.** Grant a player knowledge of the assassins' guild but not the city, and they know
it exists and still cannot spot a single member — because stage 2 climbs the ladder and they cannot
place anyone's city. That is correct (Joe's scenario is *"you keep having to kill assassins from a
city you never been to"* — they learn *of* the guild, not how to read one), but a GM who wanted
them spotting assassins must tick share-parents. **The checkbox is not a convenience; it decides
whether the grant does anything.** Say so on the control.

### R1c. New questions still open after the research cut

**N1 — re-parenting sweeps.** Materialised ancestors go stale when the tree is re-shaped. Recommend
the GM is offered a carrier sweep at re-parent time; never silent, never automatic.

~~**N2** — research retry gating~~ · ~~**N3** — research targets disclosing existence~~ — **both
dead with the research cut (R1d).**

**N4 — the GM grant control needs two modes, and it is now the ONLY disclosure route.** With
research cut, this control carries every non-inspection path into a character's knowledge —
travel, story, a good library roll the GM liked. `linkAttribute` writes carriership today
(`flags.attributes`); granting *world knowledge* is a different store. One control, two actions —
**"they are this"** vs **"they know of this"** — plus the share-parents checkbox on the second,
which per R1e decides whether the grant is inert. It must be GM-only when shown on a sheet the GM
does not own, and it must be able to create an entry in place (Joe: *"I can also create attributes
using this method"*). The search + create UI already exists in `attributes-ui.mjs`; what changes is
the gating, the second mode, and the checkbox.

**N5 — where the invalid-sheet error surfaces.** Q1 wants an error, GM-visible. Recommend a banner
on the Attributes tab naming the missing ancestor with a one-click fix, and the authoring path
made incapable of producing one in the first place.

### R2. Conditions on the green light — required before or during build

1. **The cascade must roll with no chat message per rung.** Blind cards stay *listed* for players
   ("Gamemaster privately rolled some dice" — phase 3's own finding), so N rungs prints N grey
   cards and the assassin's page prints three where the fisherman prints zero. **A depth counter
   in the shared UI.** This is a change to the rolling idiom, not a posting detail — budget it.
   The GM's per-rung record lives in the ledger and its Beliefs surface, which is where decision
   12 wanted it.
2. **Post the stub FIRST, at gesture receipt.** Its content depends on nothing downstream, so
   nothing is lost — and depth-proportional silence before it is the 260 ms class phase 3 was
   bitten by, except here the work genuinely varies by depth and cannot be equalised.
3. **One claim per gesture**, keyed (character, subject) — not one per rung, or depth costs
   depth × 250 ms of staking.
4. **One batched setting write and one batched actor update per gesture**, and a failed cascade
   writes with `render:false`. The attr ledger is a world setting broadcast whole on every write,
   and `applyPlayerWrites` deliberately repaints — a sheet that flickers only when the subject
   carried something is a tell above the devtools line.
5. **The stub posts even on an empty cascade** (nothing secret, or all spent), or its presence
   answers the question.
6. **The inspect control is uniform** — identical tooltip and state for every creature. A
   per-attribute affordance for an attribute you do not know exists *is* the leak.
7. **The `attr:` grant join must filter by identification.** Phase 6's proudest result — a guild
   fact rendering under a creature the roll never touched — **inverts into a leak** once membership
   is secret: the grant's placement announces carriership. One extra parameter plus fixtures.
8. **Three new field-drop traps are pre-armed** (`clampAttribute`⟷`saveRegistry`,
   `readAttrBeliefs`⟷`putBelief`, `clampSources`). Every new field enters reader and writer in the
   same commit, per decision 15's rule. Free now; the registry is empty.
9. **Store outcomes per attribute, compute gates live.** Never store "closed" as derived state —
   then re-parenting grandfathers prior knowledge and reopens branches correctly, and the edge
   cases dissolve instead of needing rules.

### R3. Corrections to the proposal below

- **Sizing was optimistic.** ~6½ days is not honest for the design as written: the cascade is new
  orchestration (batched writes, single claim, chat-less rolls), and §0 concedes the player route
  was never built at all. **8–12 days as specified; ~6–7 with the cut list.** Phase 6 coming in
  under estimate is not precedent — its rules were prepaid by phase 4 and the rework, and phase
  8's biggest costs have no prepaid rule.
- **Subtree closure needs no new mechanic** — but the release valve must be **`reset()` extended to
  the two new ledgers**, per character. Share-all cannot repair one character's ancient bad roll
  without handing the fact to the whole table.
- **`whenCarried: auto` should bypass ancestor gating; `whenKnown: auto` should not.** Kin-sense is
  direct; outsider knowledge climbs the tree. Otherwise Joe's flagship row — the assassin who knows
  the mark under the eye — is invisible until the assassin passes a geography quiz. (Blocking Q3.)
- **A mask supersedes concealment.** Against a disguised token the cascade must walk the
  **apparent** actor's attributes, or inspection tunnels through the mask and reads real
  memberships — worse than anything concealment addresses.
- **Concealment demotes `auto` to a roll** at base+concealment, or concealment cannot hide the one
  thing a concealer most wants hidden.

### R4. The cut list — what an honest v1 is

**Ships:** the registry deltas with cycle refusal; the two ledgers with the reset extension; the
cascade with the full observables kit above; the inspection route (HUD button + hover key + panel);
secrecy filtering; share-all with upward cascade and the failed-branch marker; the high-DC-root
authoring warning.

**Cut, each additive later:** `whenCarried` (default everything to `inherit` — the biggest single
saving, and it removes Q3 from the critical path); cross-attribute modifiers; concealment; combat
enforcement (keep the shipped warning); the tree *rendering* (the tree *mechanic* ships — it is the
gates; v1 renders a flat list grouped by category); travel/research as named flows (they are
share-all with different words — document, don't build); the fourth tab (fold world knowledge into
the Attributes tab as a second section).

---

**Drafting notes follow.** Joe's notes introduced one concept phase 6 does not have, one structure
it does not have, and one contradiction resolved in §2.

### 0. The correction this starts from

Phase 6's player-facing route does not exist. `mayView` gates tab injection to GM-or-owner, so a
player sees the Attributes tab **only on their own character**; and `attrOffersFor` is exported
but rendered nowhere. The phase 6 live pass exercised the conduit through `studyAs` (GM) and
through a PC's own sheet — the mechanism is verified, the **route is not built**. Everything
below replaces that missing route rather than patching it, because Joe's model changes what the
route should be.

### 0b. Inspection is the only trigger — ruled by Joe, and already true

> *"players need to be inspecting people… no examine, no auto detection… if I want to make
> something impossible to know, I could put 50 NPCs and make it a nobody, and like real life,
> spotting an assassin in a crowd is impossible simply because it's such a huge group."*

**Already the shipped behaviour.** Every roll this module makes is gesture-initiated — the kind
ladder, phase 4's lore rows and phase 6's attribute facts each require a click. Nothing rolls on
sight, on hover, on token creation or on scene load, and no code path in the module observes a
creature without being asked to. The rule Joe wants is the rule that exists; what is missing is
the **route** (§0), and inspection is it.

**The gesture.** Token HUD button plus a hover keybinding — the idiom `injectTieHUD` already
established, and it does not fight Foundry's own right-click (which owns the HUD). One gesture
opens an inspection panel for that creature: their Known entry if filed, the kind affordance,
their lore rows, and the attribute cascade.

**What one inspect fires.** The **attribute cascade only** — that is the "who and what is this"
question a moment's attention answers. The kind ladder and individual lore rows stay as separate
picks *inside* the panel: they are specific questions with named prices (*"Why they left the coast
· History DC 15"*), not part of a sweep. One gesture, one cascade, and the deliberate questions
stay deliberate.

### 0c. The crowd defence works — and better than the note assumes

Joe's fifty-NPC crowd is worth tracing, because the obvious worry is that a determined player
simply inspects all fifty and grinds the odds down. They cannot, and the reason is structural:

**The cascade walks the attributes the subject actually carries.** Inspecting a fisherman produces
no "is this an assassin" roll, because he is not one — there is no fact there to resolve. So fifty
inspections yield **exactly one** roll against the assassin, the same as if the player had walked
straight up to him. The crowd does not lower the odds per roll; it raises the price of getting the
roll at all, and the player never learns which of the fifty was worth it.

Three properties make that hold, and all three already ship:

- the public stub is **uniform** — *"X studies Y"* — so an inspection that found a fact and one
  that found nothing read identically
- the rolls are **blind**, so no card reveals which subject mattered
- a failed or silent outcome **files nobody**: `applyPlayerWrites` creates the Known entry only
  when a grant actually lands, so the notebook fills with people the character *learned something
  about*, not everyone they glanced at. Fifty inspections leave no trail of fifty pages

⚠ The residue is the accepted UI-hiding boundary: a player in devtools sees a new `studied.lore`
key appear after inspecting the assassin and not after inspecting the fisherman. Same boundary Joe
ruled on for everything else, unchanged by this feature.

### 0d. Combat — what "acts as an action" can honestly mean

Joe: *"if done in combat will act as an action and I can tie it into the combat system."*

⚠ **dnd5e 5.3.3 keeps no per-turn action ledger to consume from** — verified during phase 4, and it
is why inspection currently raises a *warning* rather than enforcing anything. Activation costs
live on items being used, and inspection is not an item. There is nothing to spend.

Three ways to deliver the intent, and only one is honest:

| Option | Verdict |
| --- | --- |
| Consume a dnd5e action | **Not available.** No such ledger exists to consume from |
| Keep the warning, GM enforces at the table | Works today; delivers nothing new |
| **One inspection per combatant per round, module-enforced** | **Recommended** |

The third does not claim to model dnd5e's action economy — it is a rule about *this feature*, which
the module can own and enforce truthfully off `game.combat.round` and the combatant's id. It
delivers Joe's intent (inspecting costs your turn's attention) without pretending to a ledger that
is not there, and it degrades correctly out of combat, where Joe wants inspection free.

### 1. The concept phase 6 is missing: membership is the secret

Phase 6 treats an attribute as **visible** and its *lore* as rollable. Joe's notes treat the
**membership itself** as the thing you roll for: *"there is rolling to identify they are part of
the guild."* Under phase 6, an assassin's Attributes tab lists "Assassins' Guild" to anyone who
can open the sheet. Under Joe's model that is the leak, not the feature.

This splits one idea into two that phase 6 conflates:

| | What it is | Scope |
| --- | --- | --- |
| **Knowing an attribute** | *"I know the Ardenhaven undercity exists and what it is like"* | the character's world knowledge — one per character |
| **Identifying a carrier** | *"I know **this one** is from the undercity"* | per (attribute, creature) |

Almost everything else in Joe's notes falls out of that split, including the contradiction below.

### 2. RESOLVED by Joe, same day — the backfill, and the two stages

Joe's answer supersedes the draft resolution kept below it. The mechanism is the same two-ledger
split, but his framing explains *why one roll can serve both*, which the draft did not:

> *"passing your check means your character knew of that city and identifed that person from that
> city… instead of recording all information that character knows, it reduces it to a check that
> backfills that you actually did know this thing."*

**Knowledge is not tracked, it is adjudicated late.** A character does not carry a list of
everything they ever learned; the first time it matters, one roll decides retroactively that they
always knew. That is both cheaper to run and truer to how knowledge works at a table.

So every attribute has **two stages**, and the first identification attempt resolves both at once:

| Stage | The question | Rolled | Locked |
| --- | --- | --- | --- |
| **1 — knowing** | *"Do I know Ardenhaven / black lung / this guild exists?"* | **once, ever** | pass **or fail** is final; only GM disclosure reopens it |
| **2 — identifying** | *"Does **this one** carry it?"* | per carrier | per (attribute, carrier) |

A first encounter rolls once and backfills both. A failure means *"I never knew about black lung
at all"* — Joe: *"they don't get to roll again because they'd have to have known what it was to
have known."* Every later carrier is then unreachable until the GM discloses, which is what makes
disclosure load-bearing rather than a convenience.

**Stage 2's help is governed per attribute** — superseded by §2e's two-axis `whenKnown`/
`whenCarried` split, which is strictly finer than the single `shape` field described here. The
three values below survive as `whenKnown`'s three values and read as *how reliable the tell is*:

- **all** — the tell is universal and unmissable (north goblin tattoos): stage 2 is **automatic**,
  no roll, now and forever
- **advantage** — there is a tell and you have learned to read it (a city accent, a black-lung
  cough): stage 2 rolls **with advantage**
- **none** — there is no tell; each carrier conceals individually (assassins): stage 2 rolls flat.
  *Knowing the guild exists is a real prize and still does not help you spot the next one.*

**The tree gates both stages, separately.** Stage 1 by the parent's stage 1 (you cannot know of the
undercity without knowing the city); stage 2 by the parent's stage 2 **for that same creature**
(you cannot know Bob is in the guild without knowing Bob is from the undercity). That is what
produces Joe's *"three rolls to get there"* without inventing a single high DC.

**This resolves the assassin case.** Stage 1 (the guild exists) is passed once. Assassin B gets a
fresh stage-2 roll — not permanently unknowable — and under **none** gets no help from A. Both of
Joe's requirements hold simultaneously, which the draft below could not manage.

⚠ **It also reverses Joe's earlier five-people-one-city worry, and that is a decision worth
naming.** The original worry was that five people from one city gives five chances at the same
fact. Under this model a city is **advantage**-shaped by Joe's own new words — *"if you already
know about that city you get a advantage to identify other people from that city"* — which is
five stage-2 rolls, later ones at advantage. **The multiplicity is now the reward rather than the
bug.** What made it a bug was the DC being unstable with group size; it never was — only the
number of opportunities was, and that is narratively fine. A GM who wants the old behaviour marks
the city **all**-shaped instead, and one roll places everyone.

### 2e. `is-a` vs `knows-a` — Joe's split, which REPLACES `shape` and absorbs decision 19

> *"'is-a' and 'knows-a' might mean different things. Knowing of the underdistrict might mean you
> gain an advantage to identify others from the location, or maybe it just means you can roll each
> time… being from a district means you get an advantage to recognise your own kin, or it could
> mean you auto know — everyone from the guild has a tattoo, and you know where to look for it."*

Two different relations a roller can have to an attribute, and Joe is right that they are
independent:

- **knows-a** — *I know the undercity exists* (stage 1 passed, or the GM disclosed it)
- **is-a** — *I am from the undercity* (I carry it)

Each gets its own setting, and the three values are the ones the old `shape` field had:

| | `gate` | `advantage` | `auto` |
| --- | --- | --- | --- |
| **whenKnown** | you may roll, no help *(assassins)* | roll with advantage *(a city accent)* | no roll — you spot every carrier *(north goblin tattoos)* |
| **whenCarried** | *(inherits whenKnown)* | advantage recognising your own kin | you simply know your own *(the mark under the eye)* |

**This replaces `shape` outright**, 1:1 — `all`→`whenKnown: auto`, `advantage`→`whenKnown:
advantage`, `none`→`whenKnown: gate` — and adds the axis Joe wanted. Free to change: nothing is
committed and the registry is empty in the live world.

**It also absorbs decision 19.** Phase 6 shipped `advantage: boolean` meaning *"roller and subject
both carry this → advantage"*. That is exactly `whenCarried: advantage`, but **scoped to
identifying that attribute** rather than to studying the person in general. Joe's version is the
better one: *"I am from the undercity, so I spot undercity people"* is a specific claim, where
decision 19's *"…so I read this person better overall"* was a vague one that also applied to their
stat block and their personal secrets. **Recommend retiring decision 19's broad form** — one
mechanic, per attribute, precisely scoped.

⚠ **`whenCarried` may only ever be at least as strong as `whenKnown`.** Carrying implies knowing
(the rule stated in §4), so `whenCarried: gate` could never mean anything — a carrier already has
the gate. Hence `inherit` rather than `gate` as its floor, and the reader should clamp a weaker
value up rather than store nonsense.

⚠ **The degeneracy rule carries over unchanged and is still needed.** `type:humanoid` with
`whenCarried: advantage` means every humanoid has advantage identifying humanoids — the same
near-universal advantage decision 19 closed. Derived `type:` and `size:` stay forced to
`gate`/`inherit` on read, exactly as phase 6 forces `advantage: false` today.

**No disadvantage values here.** *"Too close to see it"* is a stretch, and the cross-attribute
modifiers (§2a) already carry every disadvantage case with a clearer authoring story.

**Worked through Joe's own examples:**

| Attribute | whenKnown | whenCarried | Reads as |
| --- | --- | --- | --- |
| Ardenhaven (city) | `auto` | `auto` | learn the accent once, place everyone from there forever |
| The undercity (district) | `advantage` | `auto` | you learn to hear it; locals just know their own |
| Thieves' guild | `advantage` | `advantage` | a tell you get better at, from either side |
| Assassins' guild | `gate` | `auto` | knowing it exists earns you the roll and nothing more — but an assassin knows the mark under the eye |
| Black lung | `advantage` | `advantage` | the cough is a real tell; a fellow sufferer knows it cold |

That last row is the one that shows the split earning its place: **the assassins' guild is
impossible to read from outside and trivial from inside**, and no single-axis field could say that.

### 2a. Cross-attribute modifiers — attributes that make *other* knowledge harder

Joe, confirming the lockout and adding one capability: *"either you know there is an assassin
guild, or you do not know, so if you do not know, you can never know… lets allow attributes to
give disadvantages to knowledge for if it comes up, it's available."* His example — being elven
giving disadvantage on dwarf knowledge — he is unsure of himself; the **capability** is the ask,
not that example.

This is a **third** modifier source, and it is directional in a way the other two are not:

| Source | Relationship | Direction |
| --- | --- | --- |
| **Knowing** the target attribute | roller ↔ the attribute being rolled about | gates stage 2, and advantages it when `advantage`-shaped |
| **Sharing** (decision 19) | roller ↔ **subject** both carry it | symmetric |
| **Cross-attribute** (new) | roller **carries A** → rolls about **B** | directional, A→B |

**Recommendation: the modifier lives on the TARGET entry, not the roller's.**

```js
{ id: "dwarvenholds",
  modifiers: [ { whenRollerHas: "specieself", effect: "disadvantage" } ] }
```

Three reasons, and the third is the one that decides it:

1. **One lookup at roll time.** Resolution already loads the target's entry; scanning its short
   modifier list against the roller's carried set is one pass. The alternative scans every
   attribute the roller carries looking for one that names the target.
2. **It matches how a GM thinks while authoring a secret** — *"who finds this hard?"* is a question
   you ask about the thing you are writing.
3. **It needs no entry for the roller's side.** `species:elf` is derived and has no registry entry
   unless someone authors one; target-side modifiers name it as a *condition* without requiring
   one. Roller-side storage would force an entry into existence just to hold a blind spot.

**Ruled by Joe:** *"the attribute says which attributes would have a disadvantage to know. that
is self contained."* Target-side it is — and self-containment is worth stating as an invariant,
because it is testable:

> **Everything that decides how hard an attribute is to know lives in that attribute's entry** —
> DC, skill, shape, parent, modifiers, reveal and miss. The only inputs from outside are the
> roller's own state (what they know, what they carry) and the subject's concealment.

⚠ **The hazard the invariant creates: dangling references, and they are not equally safe.**
`parent` and `modifiers` name other ids, and entries get deleted.

- A dangling **`modifiers` condition** is harmless — it names a roller attribute nobody carries, so
  it never matches. No rule needed.
- A dangling **`parent` is a live hazard**: the naive reading is "the parent is not known, so the
  gate never opens", which silently locks **every descendant out of the world, for every
  character**, the moment a GM deletes one mid-tree entry. A deletion that quietly removes a branch
  of the campaign is exactly the class of thing this module has been bitten by before.
- **Rule: a dangling `parent` degrades to ROOT — no gate — never to unreachable.** Same principle
  phase 3 settled for the kind pointer (`resolveKindId`: a pointer at a deleted actor resolves to
  self, not to nothing). Degrade toward *available*, because the failure mode of "slightly too
  easy to reach" is a GM noticing; the failure mode of "unreachable" is silence.
- Cycle refusal at authoring time still stands, and the resolver should also break a cycle it
  somehow reads (a hand-edited setting) by treating the repeat as root rather than looping.

Applies to **both stages** by default — an elf oblivious to dwarven matters is equally oblivious
to their existence and to spotting one.

**No new combining machinery.** These are just more `adv`/`dis` counters into
`combineAdvantage(adv, dis, rule)`, which already ships. Two consequences worth stating:

- ⚠ **Under RAW one disadvantage erases every accumulated advantage** — the elven blind spot
  cancels a lifetime of city knowledge. That *is* the 2024 rule and the module defaults to the
  book; Joe's `advantageStacking: net` is the table's out. Say it where the modifier is authored,
  because it will look like a bug the first time it happens.
- ⚠ **The degeneracy rule applies here too.** A modifier keyed on `type:humanoid` is a
  disadvantage for nearly every roller in the world, which is not a relationship — it is just a
  higher DC wearing a costume. The authoring surface should say so rather than allow a
  near-universal condition to look like flavour.

No leak: the roll is blind, so a player never sees which way it was modified or why. `sources`
already records the reasons for the GM's card; it widens by one field.

### 2b. `personal` — the flag has no behaviour the model does not already give

Joe: *"some attributes are personal, like sickness, something that is individual. so assassin is a
personal attribute, knowing someone is an assassin is a roll per."*

The observation is right and it is what produced the fix. But traced through the two stages,
**every** stage-2 identification is already per carrier — a city is no less per-person than an
assassin, because knowing Ardenhaven never tells you who else is from there. Comparing the pairs:

| | black lung (*"personal"*) | Ardenhaven (*not personal*) |
| --- | --- | --- |
| stage 1 | once, backfilled, locked on fail | identical |
| stage 2 | per carrier | identical |
| shape | `advantage` — the cough is a tell | `advantage` — the accent is a tell |

No behavioural difference survives. What separates assassins from cities is **`shape: none`** plus
**tree depth**, both of which already exist — exactly as Joe said in the same breath: *"that
inherently gives it a harder class to identify, especially if it is a personal attribute that can
only be identified if you know about the city, and the subdistrict."*

**Recommendation: keep `personal` as a `category`, not a mechanic** — it is genuinely useful for
grouping the world tree (*places · organisations · conditions*) and for choosing sensible defaults
when authoring, and a flag that changes nothing is a flag that will eventually be believed to
change something. **Open for Joe** in case he means a mechanic the trace above missed.

### 2c. Concealment — and the DC in the affordance is a leak

Joe: *"someone from new york, but wants to act like they are a hillbilly… having a GM having the
ability to make all things harder… from +5 to +10 difficulty will become required."* Distinct from
the disguise pointer: nobody's identity is swapped, the tells are just being suppressed.

⚠ **Phase 4 prints the DC on the affordance** (*"Why they left the coast · History DC 15"*), by
decision 8's deliberate rule that the invitation is the hook. Add concealment naively and **the
number becomes the tell**: every NPC reads *DC 15* and the spy reads *DC 25*, so the UI announces
the spy before anyone rolls. This is the same class of leak as phase 3's tier-timing tell.

**Recommendation: print the attribute's base DC, roll against base + concealment.** The player's
affordance stays honest about the *attribute's* inherent difficulty and silent about *this
individual's* effort to hide — and the GM's blind card shows the real target, as it already does.
Consistent with the module's standing posture: the player declares, the GM's client decides.

⚠ **One failed stage-1 roll closes an entire branch of the world, permanently.**

Stage 1 is gated by the parent's stage 1, and a stage-1 failure is final. So failing the roll on
**Ardenhaven** means that character can never learn the undercity, and never the guild beneath it —
one bad roll on the root closes everything under it, for the rest of the campaign.

That is a faithful consequence of Joe's own rule rather than a flaw in it, and disclosure is the
release valve. But the blast radius is much larger than the single roll looks, and the GM will not
feel it until a branch is already shut. **Recommendations:**

- **Author root attributes at low DCs by convention** — the cost of failing a root is the whole
  subtree, so roots should be nearly free and the depth should carry the difficulty. This is
  already Joe's stated principle (*"each level deeper can be the same… because it requires three
  rolls to get there"*) — it just becomes load-bearing rather than stylistic.
- **Warn at authoring time** when an attribute *with children* is given a high DC, naming how many
  descendants a failure would close. Cheap, and it is the only moment the GM can act on it.
- The world-knowledge tab should show a **failed** root distinctly from an unexplored one, for the
  GM only — a branch that is shut is something the GM needs to see coming in a scene.

⚠ **Global-only concealment is wrong on its face.** *"Make everything harder"* would also make the
spy's black-lung cough harder to hear, and dressing plainly does not suppress a cough. **A global
default plus per-attribute overrides**, so a New Yorker playing hillbilly conceals `origin` at +10
and nothing else.

---

### 2d. Superseded draft — kept for the reasoning that produced the fix

Joe states both:

> *"identifying one does not help idnetify another, like an assassin… their entire deal is to be
> top secret"*

> *"once a player rolled on a attribute they don't get to roll again for that atribute on another
> character with it… a player would get 5 chances to know where those people are from"*

Taken together these say: identify assassin A, and assassin B becomes **permanently unknowable** —
you may not roll again, and the `none` shape grants you nothing automatically. That cannot be the
intent; it makes `none` mean "one assassin per campaign".

**The resolution is the §1 split: the three shapes describe how *knowing* propagates into
*identifying*, and the lock granularity follows from that.**

| Shape | Knowing it means… | Lock | The fact, honestly stated |
| --- | --- | --- | --- |
| **all** | you identify **every** carrier, now and later | per **attribute**, global, once | *"what a North Goblin looks like"* — one fact about the group |
| **advantage** | each carrier is still its own roll, **with advantage** | per **(attribute, carrier)** | *"is **this one** in the thieves' guild"* |
| **none** | each carrier is its own roll, no help | per **(attribute, carrier)** | *"is **this one** an assassin"* |

Joe's five-people-one-city worry lands squarely and only on **all** — which is exactly where he
put the city example, and where the global lock belongs. For per-person secrets, five assassins
genuinely *are* five secrets, and rolling on each is not a loophole.

⚠ **The residue, for Joe to rule on:** the worry does partly survive for **advantage** — five
thieves' guild members is five rolls, later ones at advantage. I think that is correct rather
than degenerate (each is a separate person to read; the advantage models growing familiarity),
and it is stable in the sense Joe wanted: the **DC** never depends on group size, only the number
of opportunities does. But it is his call, and it is the sharpest open question here.

### 3. The tree

`parent` on a registry entry, forming a forest. Joe's rule: **depth costs rolls, not DC** — three
levels at DC 12 is harder than one level at DC 12, without anyone having to invent a 20.

The cascade, on one gesture against one creature, walking root → leaf and stopping at the first
level that fails or is not yet known:

- level is **all**-shaped and already known → **auto-pass, no roll** (this is the compounding Joe
  wants: the more of the world you know, the further the cascade gets before it has to roll)
- level not known, and its parent is known → **one blind roll**
- parent not known → **stop**; the deeper levels are never offered and never spent

The player sees layers appear, not the rolls — *"many rolls taken place in secrete that the
player dosn't need to know about."* The GM's ledger shows every rung.

⚠ Gating must be enforced **in the conduit**, not by hiding the affordance. Phase 4 already
established that the belief ledger is the lock of record; the tree check belongs beside it in
`resolveFact`/`applyStudy`, or a crafted socket payload skips three levels.

⚠ Cycles must be refused at authoring time (`parent` may not reach itself), or the cascade does
not terminate. One pure function, fixtured.

### 4. Where knowledge accumulates, and how it gets there

The world-knowledge ledger is per character and is what the new tab renders as a tree. Four ways
in, and only the first is a roll:

1. **Identification** — the cascade above
2. **GM share-all** — Joe: *"i click on the attribute and i say 'share all' and all players on the
   map gets that information."* Deliberately all-or-nothing; per-player disclosure is the bridge's
   job, not a UI to fiddle with
3. **Travel** — the GM grants a city attribute to everyone who has been there long enough
4. **Research** — a successful library check is rewarded with an attribute

3 and 4 are the same operation as 2 with a different story, which is the good sign. They are also
what makes the permanent failure lock tolerable: a failed roll on an **all**-shaped attribute
locks it *forever*, and disclosure is the only way back in. That should be said where the GM can
see it, not just in this document.

**Rule worth stating explicitly:** *carrying implies knowing.* A PC from the undercity knows the
undercity. Knowing without carrying is the library case. So the PC's own tab keeps showing
everything they carry — phase 6's behaviour there was right.

### 5. Schema deltas

Free to make: the registry is empty in the live world (verified this session), and nothing is
committed.

```js
// registry entry — additions
{ parent: "ardenhaven" | null,       // the tree; cycles refused at authoring
  shape: "all" | "advantage" | "none",  // REPLACES phase 6's `advantage: boolean`
  dc: 15, skill: "his",              // identification's own price — phase 6 has none
  reveal: "…",                       // what identifying it tells you
  miss: "…",                         // the honest-failure line, same rule as decision 8
  secret: true }                     // authored default true; derived default FALSE
```

- **`shape` replaces `advantage: boolean`.** Phase 6's flag answered *"does sharing this with the
  subject grant advantage"* (decision 19); Joe's shapes answer *"does having identified it before
  help me identify it again."* **Different relationships, both real.** They should coexist under
  distinct names rather than one field trying to be both — flagging this rather than merging them.
- **`secret`** is what closes the §1 leak. Derived ids default **not** secret: a goblin is visibly
  a goblin, and `type:`/`size:`/`kind:` are things you can see. `background:` is arguably secret
  and is the one derived namespace worth arguing about.
- Two ledgers, both GM-plane: **world knowledge** per character, and **identifications** per
  (attribute, creature, character). The second is what records failures — Joe: *"i will need to
  track if they pass or failed an attribute hidden from the player."* Phase 4's ledger already
  records failures this way; this widens the key, not the mechanism.

### 6. What survives untouched

The seam (rule 4) takes membership as one more fact resolution. The sibling grant map takes
`attr:` keys as it already does — and the phase 6 live pass proved a grant renders under every
carrier, which is exactly what an **all**-shaped attribute needs. `lore.mjs` still edits the rows.
The blind roll, the claim protocol, the approval gate and the combat warning all apply with no
edit. **Nothing built is invalidated; one shipped field is replaced before it has data.**

### 7. Concerns, ranked

1. **The `advantage`-shape multiplicity** (§2's residue) — needs Joe's ruling before build.
2. **Permanent failure on `all`-shaped attributes.** Harsh by design, and the disclosure paths are
   the release valve. The GM surface must make the finality visible *at authoring time*, or the
   first time it bites will be a surprise.
3. **The cascade's cost.** One gesture can fire three blind rolls, three ledger writes and three
   chat stubs. The stub is the player's only guaranteed observable (decision 11) — **three stubs
   would leak the depth reached**, which is information about the tree. Recommend: **one stub per
   gesture**, never per rung. This is the sort of timing/observable tell that phase 3 already got
   caught by once.
4. **Tab budget.** This is a fourth tab (Ties, Known, Attributes, World). Alternative: the
   Attributes tab on a PC grows two sections — *what you belong to* and *what you know of the
   world*. Leaning toward the second; it is the same list a player already reads.
5. **Where a player rolls from.** §0's missing route. The natural home is the Known entry: the
   creature's page already carries the kind ladder and its lore rows, and identification belongs
   beside them. That makes one page answer *what is it, who is it, what does it belong to.*
6. **Derived attributes in a tree.** Recommend they cannot have parents — trees are for authored
   world structure, and `type:humanoid` is not a place.

### 8. Honest sizing

Comparable to phase 6, and bigger than it looks because it touches every attribute surface built:
registry schema + cycle refusal + fixtures (~1 day); the two ledgers and the cascade in the
conduit, with the one-stub rule (~1½ days); secrecy filtering on every surface that currently
lists attributes (~1 day); the world-knowledge tree UI and the Known-entry route (~1½ days);
share-all and the grant paths (~½ day); validation — an identification indistinguishability
variant, the cascade-depth tell, the three shapes' lock granularity (~1 day). **~6½ days, honest
range 5–9.**

---

## As built — phase 8 (2026-08-23): inspection, secrecy and the knowledge tree

Built to the settled model in §R. **Nothing committed.**

### The live results

| Claim | Shown by |
| --- | --- |
| Ancestors materialise on link (Q1) | linking `assassins` wrote `["assassins","undercity","ardenhaven"]`; the invalid state cannot be constructed |
| The cascade climbs from the **root** | a stranger's first inspection rolled Ardenhaven, not the guild |
| **The observables property** | inspecting the spy (2 rungs rolled) and the fisherman (0 rungs) each posted **exactly 1 chat card** — the stub |
| Chat-less rungs | verified at 6 ms per roll with `create: false`; no blind cards printed for any rung |
| Backfill | one roll settled both stages — knowledge row + identification row from a single check |
| A failed rung is permanent | Undercity failed → the Quiet Hand became unreachable by sight, and re-inspecting wrote nothing |
| Secrecy filtering | the spy carries 5 attributes; the player could see **3** — the guild and district hidden until identified |
| **Kin-sense bypass** | making the PC a member reached the guild *past the rung she had permanently failed* — the only route left to her, and Joe's flagship case |
| Hold suspends, Deliver resumes | held at rung 1: one row, no grant. Deliver rolled rungs 2–3 and landed all three with **zero extra cards** |
| Performance | **6 ms** with nothing to roll · **~1.0 s** for a full arbitrated cascade |

World restored and re-verified: 136 actors, 54 carrying ties, 196 edges, Wat 7, Ballad 24, all
three settings empty, 29 test cards removed, zero stray flags of any kind.

### Three bugs found by building it, all mine

1. **`token.x` is not the token's position.** The tempo counter anchored on `token.x`/`.y`, which
   are PIXI's inherited *local transform* — measured live as **0** while `token.document.x` read
   995. The movement reset therefore compared 0 to 0 and never fired. Exactly the family of mistake
   as `Token#visible` (the inherited flag, true for every placeable) versus `Token#isVisible`,
   which bit this module once already. Fixed to `token.document.x`, with the reason written at the
   line so the next reader does not repeat it.
2. **Every inspection cost 3 seconds.** The claim protocol — two actor writes plus the arbitration
   wait — was taken up front, on *every* gesture, including the overwhelmingly common one that
   rolls nothing. Measured: claim ≈ 1.2 s, chat-less roll ≈ 6 ms. Now taken **lazily**, on the
   first rung that actually needs dice: a gesture with nothing to roll has nothing to arbitrate.
   6 ms / 1.0 s afterwards. Safe against the timing channel because the stub is already posted and
   there is no second event to time the gap against.
3. **Empty `beliefs: {}` containers were left behind** on every creature ever inspected fruitlessly
   — found while restoring the test world, where three actors held an empty container the baseline
   did not have. Harmless to read, but litter in every export and it makes *"has anyone studied
   this?"* unanswerable by looking. `releaseInspect` now unsets the flag when the last row goes.

### What shipped, and what was cut

**Shipped:** registry deltas (`parent`, `secret`, `dc`, `skill`, `reveal`, `miss`, `hold`,
`whenKnown`, `whenCarried`) with cycle refusal and dangling-parent-degrades-to-root · the two
ledgers · the cascade planner as a pure function with the conduit looping it · the full observables
kit · the inspection route (HUD button + `Digit4` on hover) · secrecy filtering on the grant join
and the tab · the two-mode GM grant control with share-parents · the ancestry validator with a
one-click repair · the tempo tell.

**Cut to a later pass, as agreed:** cross-attribute modifiers · concealment beyond the flag the
conduit already reads · combat enforcement beyond the per-round counter · tree *rendering* (the
tree *mechanic* ships — it is the gates; the surface is a flat list) · travel/research as named
flows (they are the grant control with different words) · the fourth tab.

### Carried forward

- **`whenCarried: auto` bypassing the ladder had to be a separate first pass** in the planner, not
  a check inside the ladder walk. Inside the walk it never fires: the climb reaches the root first
  and returns a roll for the city, so the mark under the eye is never reached. Free knowledge
  resolves before anything is rolled.
- **A visible target has no ladder at all**, not even its ancestors' — returning them would put a
  roll for the city in front of a fact the player can already see.
- The phase 4 kind picker still lists 115 NPCs and should borrow this phase's autocomplete.

---

## Playtested — phase 8 (2026-08-23), two players and a GM in a live tavern

Run in `space-journey`, on **1. Dragonsfall Tavern Night** (38 NPCs), with Kristine (Ballad
Quinn), Kyle (Pip Locksley) and a GM all connected. Five bugs found by playing it; all fixed and
re-verified. Test attributes left in the world, prefixed **TEST —**, for Joe's own pass.

### The five bugs, and why only play found them

1. **Two identical stubs, same timestamp.** `isApplyingGM()` tests
   `game.users.activeGM.id === game.user.id`, and `activeGM` is a **user, not a session** — the
   hazard phase 3 documented and phase 8 walked back into. Every GM client signed in on the
   account ran the handler and every one posted. The claim protocol arbitrates the *rolling*, but
   **stub-first deliberately puts the stub before the claim**, which put it outside the only thing
   that would have deduplicated it. **Fix: the gesturing client posts its own stub** — it knows for
   certain the gesture happened, needs no GM knowledge, and there is exactly one of it. Proven by
   author: one card from Kristine (correct), one from the Gamemaster account (a second, stale GM
   session — Joe's desktop app).
2. **The tempo bubble had the same fault, and worse.** Running in the handler meant it both
   duplicated *and* **double-counted the run**, so the 3/5/10 thresholds would have fired at half
   the looks they describe. Moved to the gesturing client alongside the stub.
3. **A held identification leaked before delivery.** `identifiedState.carries` checked only that
   the row had prose, never that it was `delivered` — its own comment claimed the check the code
   did not make. So a rung that *passed but was waiting on the GM* read as a positive
   identification and the secrecy filter showed the player a guild membership the GM had not
   released. Now `carries` requires delivered, which also makes the cascade's hold behaviour
   explicit rather than incidental.
4. **World knowledge leaked the same way.** The backfill row is written at roll time (it is the
   stage-1 lock) and was immediately visible to the player — so a held rung appeared in *What you
   know of the world* before the GM delivered it. Rows now carry `pending`, hidden from players
   and cleared on delivery.
5. **A GM could not undo an identification.** `reset()` returned false for them. A mis-click, a
   wrong DC, or a test roll left a creature permanently unplaceable with no recovery — and because
   a botched rung takes its ladder with it, one bad click silently closed a whole branch. Added
   `resetIdentification` / `resetInspection`. **Stage 1 permanence is untouched** (Joe's ruling);
   its valve remains disclosure, which was verified working: `grantKnowledge` lifted Kyle's
   permanent Dragonsfall failure and brought the ancestors with it.

### What play confirmed that fixtures could not

| Moment | What happened |
| --- | --- |
| Kristine reads two locals | learns Dragonsfall from the first; the second is a fresh per-person roll |
| Kristine reads Old Cobb | places him as a local (22) and **completely misses his black lung** (2 vs DC 12) — that door now shut to her forever |
| Kristine reads Quill | climbs 18 / 21 / 24 through town → back room → guild, and the guild **holds** |
| The GM prompt | *"TEST — The Quiet Hand · rolled 23 against DC 14"* with the exact prose — **Deliver** landed all of it |
| Kyle, independently | starts blank; Kristine's discoveries are invisible to him; his own roll of 6 shuts Dragonsfall for him |
| The combat rule | a live combat was already running: the second look in a round was refused, and a new round re-armed it |
| Player surfaces | **zero** edit controls across the whole tab for either player |

### Two gaps left open, for Joe

- ~~**Reach is not line of sight.**~~ **CLOSED by Joe, 2026-08-23: not an issue.** *"We are
  assuming players are not hacking… I only play with trusted players."* The UI gates inspection by
  sight — a player cannot click a token they cannot see — and the conduit's `canReach` requires
  only a token on the scene, so a **crafted socket message** could ask about someone unseen. That
  is the one path, it requires deliberately hand-writing a socket payload, and it is squarely
  inside the boundary Joe has now drawn three times (lore rows, the registry, this).

  **This is the general ruling, and it should be applied to the next question of this shape
  instead of re-deriving it:** the module defends against *accidents and honest curiosity*, never
  against a determined player at a devtools console. Anything that costs real work to close and
  only stops a deliberate attacker is not worth building here.

  ⚠ **What the conduit is still earning, so nobody mistakes this ruling for "the design was
  pointless":** it keeps the totals, the tier alternatives and the authored miss text **off the
  player's client entirely**. That is not an anti-cheat measure — it is what stops an *honest*
  player being spoiled by scrolling their own chat log or opening a sheet. The re-derivation also
  catches genuine bugs (a stale affordance, a raced double-click, a second GM session) that have
  nothing to do with trust. Keep it; just stop trying to make it airtight.
- **A second GM session runs stale code until reloaded.** The duplicate stub will persist from
  Joe's desktop app until it refreshes. Worth knowing generally: two GM sessions on one account
  both believe they are the arbiter, and only the claim protocol stands between them.

### Left in the world deliberately

Registry: **TEST — Dragonsfall Folk** (root) → **The Back Room** → **The Quiet Hand** (held), plus
**TEST — Black Lung** and **TEST — Doorbreakers (not secret)**. Carried by nine tavern NPCs — Quill
is the one three-rung assassin. Per-character ledgers were cleared so Joe starts fresh; the world
is otherwise at baseline (136 actors, 54 carrying ties, 196 edges, Wat 7, Ballad 24, scene and
combat round restored).

⚠ **One thing not restored:** Ballad's and Pip's token positions on the tavern scene shifted during
testing and the originals were lost when the GM client reloaded. That scene is not active and PC
positions there are cosmetic, but it is a real change and is named rather than glossed.

---

## The kind ladder, tested against real Monster Manual imports (2026-08-23)

Joe asked whether a monster's tiers can come out of its sheet without authoring anything. They
can, and always could — that is phase 3's ladder — but running two real imports through **every
rung** found a serious bug that fixtures had not, and answered a question the design had never
been asked.

**Note on the rungs:** they are **0 / 15 / 20 / 25**, not 10/15/20/25. `STUDY_RUNGS` has no 10.

### What each rung yields, with nothing authored

| Rung | Source | Yields |
| --- | --- | --- |
| **under 15** | — | *"Nothing about it means anything to you."* |
| **15+** | `system.details.biography` | what it is, enriched and capped |
| **20+** | `traits.di / dr / dv / ci` | *"Immune: Necrotic, Poison. Resists: Acid, Cold… Vulnerable: Radiant. Untroubled by: …"* |
| **25+** | attack items, enriched | *"Draining Swipe: Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Necrotic damage…"* |

Verified identical in shape on **TEST — Shadow** and **TEST — Shadow Demon**, both straight from
`dnd-monster-manual.actors`. An authored `studyTiers` rung still beats the derived text at any
tier, including 0.

### Bug: a FAILED roll handed over the whole Monster Manual entry

Only traits (20) and attacks (25) were tier-gated. The derived **description was not**, so
`composeStudyPayload` passed the full biography at every tier — and tier 0, the rung whose entire
job is *"you do not recognise it"*, came back **byte-identical to tier 15** on both monsters.

Fixed with a `tier >= 15` gate on the derived description only. The derivation still runs in full
at every rung — that is the timing-leak fix from phase 3 and must not be undone — the tier now
actually chooses what survives, which is what its own comment already claimed. Fixture added
pinning all four rungs.

### Ruling made real: gear-granted immunity is invisible to a study

Joe: *"an NPC who has immunity with the aid of an item won't be something inspection can see."*
It could. Reproduced: a Shadow's innate `[necrotic, poison]` became `[necrotic, poison, fire]` the
instant a test cloak carrying a `system.traits.di.value` effect was equipped, and the tier-20 line
reported the borrowed fire immunity as the creature's own. **A study roll was X-raying gear.**

`system.traits.*` is *derived* data with Active Effects folded in; `_source` holds what the stat
block itself declares. The trait line now reads `_source`.

⚠ **`_source` is not too narrow — measured, not assumed.** Across **60** Monster Manual creatures:
**zero** had derived traits differing from source, and **zero** granted traits through an effect.
Stat-block immunities live in the source data; only gear and conditions arrive later. If a homebrew
monster ever grants its own traits via a feature effect this will under-report it, and the fix then
is to subtract *equipment*-sourced effects — not to return to the derived value.

### Rung differentiation, verified across 100 creatures

Two monsters was not enough to claim consistency, so it was run across **100** entries from both
`dnd-monster-manual.actors` and `dnd5e.monsters`:

- **every** tier 0 returns *"Nothing about it means anything to you"* and differs from tier 15
- **every** rung is a strict prefix of the next — 15 ⊂ 20 ⊂ 25, no reordering, no loss
- **zero** violations
- the only creature with no tier-25 difference is **Unseen Servant**, correctly: it has no attacks

### The lock is per KIND, not per creature — verified

Joe: *"either you know what a red dragon is or you do not."* Studying one **TEST — Shadow** locked
a second, separate Shadow actor pointed at it, and the belief lives only on the canonical kind.

⚠ **The pointer is what makes that true.** Two separately-imported Red Dragons are two *kinds*
until one is pointed at the other (decision 4's `kindOf`). Importing the same monster twice and
forgetting to point them is how a player gets two bites at the same creature.

### New: the GM releases a kind at a chosen rung

Joe: *"I can open their character sheet and release more information at the level I want."* Built
as `grantKind(character, kind, tier)`, with a rung picker on the Known entry's GM controls.

It **raises and never lowers**: releasing 25 to someone who rolled 15 replaces their page; trying
to release 15 to someone who has 25 is refused rather than quietly demoting them — taking
knowledge back is not something this module does (decision 22). Rungs are a menu, not a number
field, because the ladder has exactly four and typing 17 would silently mean 15. Verified: 15 gave
2 lines with no traits or attacks; 25 gave 4 with both; the lower attempt was refused and left the
fuller text standing. The player's own notes stay untouched and theirs to write.

### Bug: the ledger said "rolled 0" for something the GM had TOLD them

`readBeliefs` guarded totals with `Number.isFinite(Number(v))`, and `Number(null)` is `0`, which is
finite. So a kind released by hand — written with `total: null` — came back as **"rolled 0"** in the
GM's own ledger. Not a smaller truth than *"I told them"*: a different and false one, in the record
whose only job is telling the GM what actually happened.

**Third sighting of this exact trap** (it also graded a cancelled lore roll as a total of zero), so
it is now one guard for the whole file: `numOrNull` checks the *type* first, with `timeOrNull`
beside it so "never delivered" cannot read as the epoch. Every nullable numeric field routes
through them, and a fixture pins told-vs-rolled-zero apart.

### Judged: override the ladder with `studyTiers`, NOT with attributes

Joe proposed overriding a monster's rungs through the attribute layer — *"if I add an attribute at
a DC it takes priority over the default… it's DC for DC."* **Right goal, wrong mechanism, and the
mechanism already exists.**

`studyTiers` on the kind actor is exactly DC-for-DC override with derived fallback: authored text
replaces the *description* at its rung, traits still append at 20, attacks at 25, and rungs the GM
said nothing about fall through to the book. That is the whole of what was asked for.

**Why not attributes, stated once so it stops coming back:**

- **It collapses decision 17.** "Red dragon" as an attribute makes kind and attribute the same
  thing again — the separation Joe himself ruled to keep, on the argument that *attributes cross
  kinds* while a kind is a stat block.
- **Attribute lore rows are a different species of thing.** They are individually rollable facts,
  each with its own DC and its own lock. Ladder rungs are grades of **one** roll. Making a row mean
  "a tier" when attached to a kind and "a fact" when attached to a group gives one structure two
  incompatible meanings depending on where it hangs — the polymorphism this plan has already
  rejected twice (`targetType`/`targetId`, and per-entry `granted`).
- **The locks would contradict.** Would rolling the ladder spend the attribute's row? Would rolling
  the row hand over the ladder's text? There is no answer that is not arbitrary.

**What was actually missing** is not a mechanism but a surface: `studyTiers` has no editor and is
console-only (the build-and-validate cut list says so). That is the real gap, and it is small.

### Bug found judging it: authored text vanished on a GOOD roll

`authoredTier` matched the rung **exactly**. Author a tier-15 line for a Red Dragon and say nothing
else, and a player rolling 25 fell straight through to the derived sourcebook prose — **the better
they rolled, the less of the GM's world they saw.** Joe's stated common case (*"more often than not
I'll want to override the desc to make it more in story… and if I get lazy it can have the book
text"*) is precisely the case that was broken.

An authored rung now **carries upward** until the next authored rung replaces it. Verified live
against a real Monster Manual import: a tier-15 authored line survives at 20 and 25 with the
immunities and attacks appended beneath it, and the book prose is gone.

### The lie belongs on the FAILURE — ruled by Joe, and it settles the whole question

The reversal above raised "where does a lie live", and Joe answered it in a way that is better than
either prior position:

> *"I need to put in a lie as a failure — it IS a failure case. You didn't make the lowest DC, so I
> give you the failure. If there is no failure then you just get a generic you never heard of this
> beast. This makes it clear even to me what is false and what is flavour world-building true. I
> can have both on a monster."*

**Rung 0 is false-or-nothing. Rungs 15/20/25 are true.** A GM reading their own kind actor can tell
which is which at a glance, which is the part that matters — the earlier scheme made falsity a
property of *where the fall-through landed*, so nobody could see it by looking.

It also unifies all three axes on one idiom. Every one of them now says *"what they get when they
fail"* in the same place:

| Axis | Success | Failure |
| --- | --- | --- |
| kind ladder | tiers 15 / 20 / 25 | **tier 0** |
| lore row | `text` | `miss` |
| attribute | `reveal` | `miss` |

⚠ **This corrected a bug the carry-upward change had just introduced.** Carrying "the highest
authored rung at or below the roll" let a tier-0 line bleed into tier 15 — handing the player the
**lie as the reward for rolling well**, the precise inversion of its purpose. Now a success rung
carries upward among successes, and **rung 0 never carries**.

Verified live on a real import, both shapes:

- **lie + flavour**: the miss gives *"Just a trick of the lamplight"*; 15/20/25 give the Ashfall
  line, with immunities appended at 20 and the attack at 25
- **lie alone**: the miss lies, and every success falls through to the book — the failure line does
  not surface on a single one

⚠ The first attempt to verify this passed a **stale** check: a cache-busted import of `study.mjs`
still resolves its own `./known-core.mjs` by the plain URL, so the roll composer ran against the
previous page-load's pure layer. Re-run after a full reload. Worth remembering for every live check
in this module — busting the top file does not bust the chain beneath it.

### The tempo tell, finally verified (2026-08-23)

Built during phase 8, but never actually confirmed to fire — two bugs in it were found and fixed
and both times the run got pulled into another failure before the feature itself was checked. Now
run properly:

| Look | Count | Said |
| --- | --- | --- |
| 1–2 | 1–2 | *(nothing — two looks is not a habit)* |
| **3** | 3 | *"Ballad Quinn is looking these people over intently."* |
| **5** | 5 | *"…is sweeping back and forth, studying every face in front of them."* |
| **10** | 10 | *"…looks paranoid, searching the crowd face by face."* |

Movement, which is the half that was broken:

- a **5 ft shuffle** does not reset (count went 4 → 5) — drifting a step at a time across a room is
  still standing there working it
- **25 ft** resets to 1 and re-anchors — *"if they look, move, look, move, they don't announce they
  are scoping people, which is how people do that in real life"*
- a **scene change** clears every run outright

The two bugs it took to get here are recorded above: `token.x` is PIXI's local transform (measured
**0** while the document read 995), so the anchor compared 0 to 0 and never moved; and running the
counter in the GM handler **double-counted**, because `isApplyingGM()` is true on every GM client
signed in on the account.

### What ends a looking run — Joe's rule, and all four verified

> *"Ensure it resets when a different scene activates, or when combat starts. At that point time is
> passing and I know that through events, and the call-out is if you're **rapidly** inspecting
> people."*

The tell describes tempo, so it may only ever count looks taken in one continuous stretch of
standing there. Four things end a run, and every one is an event the table already knows happened:

| Event | Verified |
| --- | --- |
| moving **15 ft** from where the run began | 4 → 5 on a 5 ft shuffle (no reset); → 1 on 25 ft |
| **a new scene** | count 4 → cleared on viewing another scene |
| **combat starting** | count 3 → cleared on `startCombat()` |
| **combat ending** | count 4 → cleared on the combat being deleted |

`combatStart` is not raised by every path that begins a fight — a GM nudging the round forward by
hand does not fire it — so the round counter is watched as well: 0 → 1 is a start whoever caused it.

Deliberately generous: a false reset costs one un-said line, while a missed reset has somebody read
as paranoid for looks they took an hour ago in another building.

### Thresholds retuned, and the bubble verified on every client (2026-08-23)

Joe: *"at 2 it says some people might take offense… at 3 you are looking people up and down, at 5
careful now, at 6 you are looking paranoid. Should be on all users including GM."*

The first line now lands on the **second** look — before anyone has done anything wrong — because
its job is to teach the rule, not punish it. A player who reads it once starts moving between
looks, which is the behaviour the whole thing models.

| Look | Line |
| --- | --- |
| 2 | *"{name} gives a second stranger the once-over. People do notice being measured."* |
| 3 | *"{name} is looking people up and down."* |
| 5 | *"Careful now, {name}."* |
| 6 | *"{name} looks openly paranoid."* |

Verified with **two live sessions** — Kristine and a GM, both spying on their own bubble renderer.
All four lines fired on the player's screen at exactly 2/3/5/6, and **all four reached the GM's
screen over Ballad's token**. The socket hop was the last unverified piece of phase 8; it works.
Keys are now named for their count rather than 1-2-3, so moving a threshold cannot leave a string
describing the wrong rung.

⚠ **The tell is structurally unreachable during combat, and that is correct.** The per-round rule
caps inspection at one look per combatant per round, so the count can never reach 2 while a fight
is running — you cannot rapidly scan a room when you get one look a round. It cost a confusing test
run before it was recognised (six inspections, zero bubbles, because five were refused), so it is
written down rather than rediscovered.

### The tell's presentation — five seconds, italic, and in chat (2026-08-23)

Joe: *"the pop up stays up over their heads to 5 seconds — looks like a speech bubble that is
subtle but clear, wording is in italics to be clear it's a description not something you're saying.
It's also in chat. I want it on the screen so it's not missed by me or all the players."*

Delivered as a **custom renderer plus an emote chat line**, and core's `ChatBubbles#say` had to be
abandoned for two reasons found by reading it:

1. **Its lifetime is word-count** — `#getDuration` is `words × 200 ms` clamped to 1–20 s, so these
   deliberately terse lines got ~2 s. Padding the copy to buy seconds is the wrong lever.
2. **It is gated on a core setting** — `say()` returns `null` outright when `core.chatBubbles` is
   off, so a table that disabled speech bubbles would lose this warning silently.

The replacement reuses core's `chat-bubble` class (so it inherits the table's own look and stays
visually consistent) and mirrors core's placement math into `#chat-bubbles`, which is
canvas-transformed — hence token *document* coordinates are the right space.

⚠ **Removal is on a plain timer, never on `animation.finished`.** The Web Animations API does not
run in a backgrounded tab, so that promise never resolves there and the bubble stayed pinned over
the token indefinitely — measured at 6.1 s on a 5 s life. The animations are cosmetic now; the
lifetime is the timer's alone. Verified: present at 1 s / 3 s / 5 s, gone after.

The chat line is `CHAT_MESSAGE_STYLES.EMOTE` and posted by the **gesturing client only** — the same
rule the stub follows, because `isApplyingGM()` is true on every GM client on the account and
posting it in the handler would duplicate it per open session.

### Three sessions lost to one mistake — worth writing down

The browser holds **one Foundry session cookie per host**, so `make login` re-points *every* tab on
the next reload. Reloading a GM tab while the cookie was a player's silently turned it into that
player — which happened **three times** this session, and the third time produced a convincing false
bug report: `inspectAs` returning `false` with no logged refusal, "no bubble", "no chat line". The
cause was simply that the tab was Kristine and `inspectAs` is GM-only.

**Rule: set the cookie to a tab's intended user immediately before reloading that tab.** Also worth
knowing — `eval-js` reaches whichever GM client the bridge is in, which may be a *different* client
than the Chrome tab under test, so the two can disagree about who is logged in.

⚠ A related trap, same family: a cache-busted `import("study.mjs?v=…")` still resolves its own
`./known-core.mjs` by the plain URL, so the pure layer stays at whatever the page loaded. Live
checks of pure-layer behaviour need a full reload, not a query string.

### The two never-tested items, run at last (2026-08-23)

**1. Two players acting simultaneously — passes.** Kristine and Kyle were armed to fire an
inspection at the same wall-clock instant against the same NPC (a three-rung carrier, so the claim
protocol was genuinely exercised). Both resolved independently: Ballad failed Dragonsfall on an 8;
Pip passed it on a 14 and then failed Back Room on a 6. **No cross-contamination** — separate
ledger rows keyed by character, separate knowledge, separate grants.

⚠ **It did find a real bug: a stranded `#inspect` claim.** One cascade released cleanly and the
other left its claim behind. The release was a plain statement after the loop rather than a
`finally`, so any throw between claiming and reaching it leaks the row — and a stranded claim is
not litter, it is **the row that blocks the next roll on that pair**, so it can silently wedge a
creature for a character. Now `guardedCascade` wraps the run and releases on every exit path; the
held-reveal prompt is deliberately outside the guard so a GM deciding does not hold the claim open.

**2. The relay with a live player — works, but its gate is out of step.**

Kristine wrote a tie to Ozmandius (whom she does not own) and asked for the mirror. The GM's client
**refused**: *"relay refused: Kristine cannot see Ozmandius the Unmade."* Granting her LIMITED and
retrying wrote the reverse side onto the NPC correctly, seeded from her own text. So the mechanism
is sound and only the gate is wrong.

⚠ **This is the reach inconsistency phase 3's own comment predicted**, now demonstrated with two
live clients:

| Path | Rule | Kristine vs Ozmandius |
| --- | --- | --- |
| **inspect** (`canReach`) | LIMITED **or** a token on a scene she can see | **allowed** |
| **relay** (`applyMirror`) | LIMITED only | **refused** |

So a player can look someone over, file them, and study them — but cannot record a tie the NPC
sees back. In practice the relay therefore almost never fires, because players rarely hold LIMITED
on NPCs. **Recommendation: give the relay the same `canReach` rule the conduit uses.** It is one
import and it makes the two halves of the module agree about who is present. Not changed
unilaterally — it widens who can cause a GM-side write, which is Joe's call.

### Clicking the UI found what the API never could (2026-08-23)

Joe: *"start with never tested, then go through all the tested by API but not chrome."* The API
list produced the worst bug of the whole build, and it had been shipped since phase 6.

**THE ATTRIBUTES TAB WAS ENTIRELY INERT.** Rows would not expand, fields would not save, rolls
would not fire, the grant control did nothing. One line:

```js
const box = root?.querySelector?.(".pentaryn-attributes");   // never matched
```

`injectOneTab` does `section.innerHTML = spec.build(actor)` and hands
`section.firstElementChild` to `bind` — so **`root` IS the `.pentaryn-attributes` element**.
`querySelector` searches *descendants*, never the node itself, so `bindAttributes` returned early
on every render since the day it shipped. `bindKnown` and `bindAuthoring` were unaffected: one
uses `root` directly, the other looks for a genuinely nested section.

It survived every previous test because **every previous test drove the API**. `attributesOf`,
`grantKnowledge`, `requestAttrLore` and the rest all worked perfectly — the data layer was never
the problem. Nothing short of a click could have found it, which is the whole argument for the
exercise.

Fixed to accept either shape (`root` itself, or a wrapper), so a future caller that wraps the
element cannot resurrect it. Verified live: row expands on click, `whenKnown` edit persists, no
manual binding.

**A second, related gap the same pass caught:** the tab still rendered an **`advantage` checkbox**
— the field phase 8 replaced with `whenKnown`/`whenCarried`. It wrote a key `clampAttribute` now
drops, so toggling it silently did nothing. Replaced with the two scale selects plus a
"has to be worked out" checkbox for `secret`, all reading and writing the real schema.

### What else the API-only list confirmed

- **The `4` keybinding** — a real `Digit4` keypress on a hovered token ran the cascade
  (`testdragonsfall PASS t=10`)
- **The inspect HUD button** — renders for players with the right tooltip, one stub per click,
  disables against double-clicks
- **The release picker** — DC 15 gave two lines with no traits; DC 25 gave four with traits and
  attacks; the picker resets to "—" after use; and the ledger reads **"TOLD"** rather than
  "rolled 0", confirming the `numOrNull` fix through the real path
- **The shared-scope banner** renders where decision 16 asked: *"Shared — every carrier of TEST —
  The Quiet Hand"*

### The environment lesson

Two GM sessions on one account, one running stale code, produced duplicate stubs and a stranded
claim, and made several results unreadable. `make vtt-down && make vtt-up` cleared it. ⚠ After a
restart the browser lands on `/join` and the pre-restart session cookie is dead — `make login` must
be re-run *after* the world relaunches, and the tab navigated to `/game` explicitly.

### The API-only list, finished (2026-08-23)

All seven exercised through the real UI. Beyond the inert-tab bug above:

| Surface | Result |
| --- | --- |
| hide / put back | row leaves the view, **both entries still in the flag**, "Show 1 tucked away" appears, full round trip restores it and the toggle disappears |
| ancestry validator | named both missing ancestors, the repair button fixed it and the banner cleared |
| phase 4 authoring section | GM badge, kind picker, plaintext warning, both headings; **Add a fact** created a row, naming it persisted it at DC 15, and the missing-miss ⚠ appeared |
| release picker · inspect button · `4` keybinding · shared-scope banner | verified above |

### Phase 5 (Past Encounters) is CUT — ruled by Joe

> *"I'm dropping that. People want it in their record, they need to inspect. New entries always at
> the bottom. They are welcome to hide, there's a show hidden button so they can restore if they
> must. Never deleted so I'm never asked to recover a link."*

The chronicle is replaced by a rule rather than a feature: **the notebook only records what someone
chose to look at.** Consequences, all shipped:

- **Deletion is gone from the UI.** "Tuck this away" / "Put it back", and **no confirmation
  dialog** — a prompt is the price of an irreversible act, and asking "are you sure?" for something
  that undoes itself teaches people to click through the prompts that matter.
- `hidden` went through reader **and** writer in one commit (decision 15's rule); the stored-shape
  fixture caught the widening exactly as designed, and an erasure fixture proves a notes edit
  cannot un-hide anything.
- **New entries land at the bottom** already — `readKnown` sorts by `when` ascending, so the
  notebook reads as a log rather than a directory.
- A **deleted actor leaves a "missing" entry** rather than destroying it.
- `purge` survives in the API as a GM escape hatch for rows that should never have existed, and
  **nothing in the UI calls it**.

### The study offset, finished and verified

Joe's one knob, replacing the rarity-band scheme he cut: *"I can add a + or - or auto — if they
inspect it's free, no roll required."*

| Setting | DC | Behaviour |
| --- | --- | --- |
| `"auto"` | — | **no roll at all**; tier 25 handed over, `total: null` in the ledger |
| `+20` | 35 | whole ladder shifts; a 12 lands on the miss rung |
| `-5` | 10 | ladder drops to 10/15/20 |
| `0` | 15 | flag unset, back to the default |

⚠ `"auto"` is a separate path, **not a DC of 0**: a zero would still spend the one attempt and
could still be *failed* on a negative total, and nobody permanently fails to recognise a chicken.
It still files the entry, posts the stub and can be held — it simply never touches dice.

The offset shifts what a rung **costs**, never what it is **called**, so authored tier text, belief
records and every fixture keep meaning the same thing when a GM nudges a creature. Renaming the
rungs instead would have made a stored `tier: 20` ambiguous the moment an offset changed.

### Left in the world

**TEST — Shadow** and **TEST — Shadow Demon**, marked like the attributes so Joe can try the ladder
and clear them. The probe cloak was deleted; the Shadow is back to its innate `[necrotic, poison]`.
The duplicate Shadow used for the kind-lock test was removed. Actor count is 138 (136 baseline plus
the two TEST monsters); ties, edges and all other flags are at baseline.

---

## Build and validate — the fourth pass, written before the first line (2026-08-22)

Three passes judged the *design*; none said how a phase proves itself. This section is
that gate. Everything below marked **verified** was re-checked against the real files on
this machine during this pass (dnd5e 5.3.3 `dnd5e.mjs`, core 14.367 `foundry.mjs`,
`scripts/foundry/ops/modules.py`, `login.py`, the shipped `pentaryn-ties` 0.10.0); the
two check scripts were run and **negative-tested** — deliberately broken inputs were
caught. Marked ⚠ trusted: the MM `features`-pack authoring shape (680 items, 1,742
`[[lookup]]`s — decision 7's on-disk read, not repeated here) and the exact
advantage/situational config shape under a skipped dialog (grep-level only; pinned by a
probe below). The live tier-25 probe was attempted and **could not run — the MCP eval
bridge timed out three times** while the world was active; check the bridge before
phase 3, several probes below ride it.

### 0. Before phase 1: `make foundry-ties-check` must stop lying

`ModuleSpec("ties", check="parse")` — the check is `node --check` per file plus
`JSON.parse` on the manifests (`scripts/foundry/ops/modules.py`, verified). That gate
passed this session while a missing export broke the whole module at runtime: a parse
check cannot see across files, and an esmodule that fails to link **fails silently at
load** (modules.py's own docstring). Two of the in-house modules already run real suites
(`walls`, `lookup`, `attunement` are `check="node-test"`, `test/run.mjs`, zero deps).
Ties joins them **before phase 1 writes a line**:

1. `foundry/module/pentaryn-ties/test/run.mjs` in the lookup runner's style, and one
   line in `scripts/foundry/ops/config.py`: `check="parse"` → `check="node-test"`. From
   then on `make foundry-ties-sync` refuses to copy unproved code — the existing
   contract, now with teeth.
2. The runner opens with two static gates. **Both were prototyped and negative-tested in
   this pass** — un-exporting `read` produced six link errors naming the symbol;
   a fabricated i18n key was caught; the current module passes both (9 files link,
   32/109 keys used, all present):

```js
// Gate 1 — link check: a missing named export is a LINK-time SyntaxError that names it.
const stub = new Proxy(function(){}, { get: () => stub, apply: () => stub, construct: () => stub });
for (const g of ["Hooks","game","canvas","ui","CONST","CONFIG","foundry","Actor","Macro",
                 "ChatMessage","Token","PIXI","document","window","localStorage"])
  if (!(g in globalThis)) globalThis[g] = stub;
for (const f of mjsFiles) await import(f);   // throws "does not provide an export named …"

// Gate 2 — i18n: every "PENTARYN_*.dotted.key" literal in .mjs must exist in lang/en.json.
// Regex /["'`](PENTARYN_[A-Z_]+\.[A-Za-z0-9_.]+)["'`]/g over sources vs the flattened JSON.
```

3. The dev loop, stated once: edit → `make foundry-ties-sync` → **⌘R in each connected
   browser**. No server restart — the `Data/modules` scan at startup matters only for a
   *new* module (ops.md §5), and ties is installed and enabled.

### 1. What never needs Foundry — extract these so they can be cheap

The link check proved `ties-api.mjs` already imports clean into bare node (globals only
touched at call time). Hold every new pure piece to that bar and fixture it in
`test/run.mjs`; each is the part of its phase most likely to be *quietly* wrong:

| Pure function | Fixtures prove |
| --- | --- |
| `tierOf(total)` — the grader | 25/20/15/sub-15 boundaries exact; a null roll (cancelled dialog) is **no attempt**, never a sub-15 |
| `mayStudy(beliefs, studied, key)` — the lock predicate | the belief record is the lock of record (correction in §5); `studied` alone never re-arms a spent roll |
| Hardened readers: `known`, `encountered`, `studied`, `beliefs`, `lore`, `studyTiers` | the `read()` contract restated per schema — not-an-array, missing id, unresolvable id, junk fields: drop or default, never throw |
| Cap/eviction + re-sighting as a pure reducer: `(rows, visibleIds, now, cap)` → `(rows, changed)` | one row per actor; `lastSeen` updates in place and **order does not move**; oldest `firstSeen` evicted past cap; `changed:false` when nothing changed (the no-write guard §2/P5 leans on) |
| Two-pass sighting state machine | a one-pass glimpse logs nothing; second consecutive pass logs; a gap resets |
| `kindOf` resolution (lookup fn injected) | pointer → kind actor; dangling pointer → self; no pointer → self |
| Enricher-flatten guard | output never contains `[[` or `@UUID[` — the mandatory flatten of decision 7, as an assertion. **Reuse `pentaryn-lookup`'s `toPlainText` (41 fixtures) — do not write a second flattener** |
| Phase 7 crypto-core (phase 6 before the attribute layer took the number), entire | node ≥20 ships `globalThis.crypto.subtle`: KDF→wrap→unwrap round-trip, wrong passphrase fails clean, tampered ciphertext fails clean, `enc:v1:` armored-reader prefix dispatch, encrypt-all/decrypt-all over fixture flag sets. Only the IDB cache and the prompts need a browser — **the paths where data dies are the node-testable ones** |

### 2. Per phase: the smallest check that catches the likely failure

Two-browser recipe, from this session's precedent (Chrome as player, Safari as GM). The
Makefile's `login` target does **not** forward `--no-open` (verified), so use the ops
module directly:

```sh
./.venv/bin/python -m scripts.foundry.ops login --user Gamemaster --no-open  # URL → Safari
./.venv/bin/python -m scripts.foundry.ops login --user Kristine  --no-open  # URL → Chrome
```

| Phase | Likeliest failure | The check, in this world | Clients |
| --- | --- | --- | --- |
| **1** | The tab-injection generalization blanks the sheet or eats the Ties tab | See order-of-work below — prove ties unchanged **before** any Known code | GM, + one 15-min player pass at phase end |
| **2** | Filing a hidden token, or keying the token-delta id | As Kristine: hover a GM-hidden token, press the key → no-op; hover a visible **unlinked** NPC token, file it → the entry's `id` equals `token.document.actorId` (devtools), never the delta id | player browser; GM toggles hidden |
| **3** | Everything — see the ladder below | The conduit ladder + the indistinguishability run (§3) | **both, live — the two-client phase** |
| **4** | The authoring section rendering for a player | On Kristine's client, open an NPC she has LIMITED on: no lore-authoring section, no beliefs section (gate in the data layer, `inbound()`'s pattern — check the *function* returns `[]` for her, not just that the DOM is empty). Then one pass/fail lore pair over the standing phase-3 harness; observe the miss-text silence leak once, on purpose, so the README line is written from life | both, cheap — phase 3's setup is standing |
| **5** | Write storms, and the two-pass rule not doing what it says | The five checks below, in one sitting | **both, live** |
| **6** | The advantage degeneracy, and a world setting racing its readers | As Kristine, study a subject sharing only `type:humanoid` → the GM card shows zero advantage sources (decision 19's rule); an authored shared attribute → one source, applied, still nothing player-visible; edit a shared DC and re-read it from a second client; `attrIdOf` collision refused in the create picker ("Yellow Stone" vs the existing `yellowstone`); the attr-lore indistinguishability variant over the standing §3 harness | both — phase 3's harness is standing |
| **7** | Data death in migrations | The node crypto suite is the real gate (§1). Foundry-side: visit once via a LAN IP → the module refuses to enable (secure-context guard); keyless-GM prompt + **cancel ⇒ no lock** over the conduit; key-export file imported into a second browser profile unlocks | both, one pass |

**Phase 5's five checks** (player client console open, GM client moving tokens):
① hook a counter on `updateActor` and walk Ballad's token past four NPCs — at most one
write per debounce flush, **zero** when the visible set is unchanged (the reducer's
`changed:false`); ② glimpse: GM flicks a token hidden→visible→hidden inside one pass —
no row; ③ re-sight the same NPC — row count constant, `lastSeen` moves, **order does
not**; ④ disguise: GM renames a token "Hooded Figure" — the row caches and shows the
token's name and art, never the actor's; ⑤ set the cap setting to **5** (not 100), walk
past six NPCs, oldest falls off; then the kill switch mid-session — tab renders
empty-with-a-note, writes stop. A real play session remains the acceptance gate, as the
phase table already says.

**Order of work inside a phase — half-finished must still be a working module:**

- **Phase 1:** ① refactor `injectTab` to take a tab-spec array, *changing nothing else*,
  sync, and prove ties intact — GM opens an NPC with ties and Kristine opens Ballad
  Quinn: tab renders, a row expands and edits, a stance edit's repaint doesn't blank the
  body (the `activate()` history says this is where it breaks). ② `known.mjs` data layer
  + fixtures, console API only — already a shippable state. ③ read-only rows on the tab.
  ④ add-picker and category select.
- **Phase 3, as a ladder:** ① protocol + grader as pure functions (node). ② GM handler
  registered but driven from the player *console* (`game.socket.emit("module.pentaryn-ties",
  {action:"study", …})`) — prove the refusals first: wrong ids, unowned actor, kill
  switch off ⇒ GM-side warn, zero writes. ③ **the probe that pins the trusted bit**, on
  the GM client: `actor.rollSkill({skill:"nat", target:15, advantage:true,
  rolls:[{parts:["@situational"], data:{situational:5}}]}, {configure:false},
  {rollMode:"blindroll"})` — assert the card is blind, the GM sees the total, advantage
  and bonus applied; adjust the config shape to whatever this run says (the
  `configure:false` skip branch is verified at dnd5e.mjs:68419; the `@situational`
  plumbing at 19809 is the grep-level part). ④ player affordance + the module's own
  mini-dialog (§5). ⑤ the write batch: reveal + `studied` lock in **one** update on the
  player's actor (atomic — a crash cannot leave a lock without a reveal or the reverse),
  then the belief record, then the stub card. ⑥ the indistinguishability run.
- **Phase 5:** reducer + fixtures first (§1); then the hook wired behind the kill switch
  defaulting **off**; flip it on only for the five-check sitting.

### 3. The indistinguishability run — decision 11's contract as a procedure

Deterministic outcomes come from the feature's own inputs — no dice games: the
situational bonus. Same character, same kind, so nothing else varies: **roll 1** with
situational −100 (guaranteed sub-15), GM **reset** (decision 5's release valve — this
run doubles as its test), **roll 2** with +100 (guaranteed ≥25).

Capture on the **player's** client after each roll, then diff:

1. `#chat-log` innerHTML, normalized (strip message ids and timestamps). The blind card
   must render obscured with core's "privately rolled" replacement, and the module's
   stub must be the same DOM both times. **Diff must be empty.**
2. The Known entry's row outerHTML. Identical both times **except the prose inside
   `notes`** — the authored text is what the player is told, and the sub-15 message being
   as confident as the 25 is authoring discipline, not code. Provenance header identical:
   skill, nothing else.
3. The roll affordance: gone both times.
4. `ui.notifications`: nothing, either time.
5. Devtools honesty: `actor.flags["pentaryn-ties"].studied` holds `when` **only**;
   the last chat message's `isContentVisible === false` (core's blind guard,
   foundry.mjs:48696–48708, verified); no Dice So Nice animation fired.
6. Timing: click-to-entry-update wall time within ordinary jitter both times — both
   outcomes travel the identical batch path, so a systematic gap means one path grew a
   round-trip the other lacks.

Acceptance is the plan's own sentence made mechanical: **any non-empty diff outside the
authored prose is the number leaking.**

### 4. The risks, ranked — what this pass concluded

1. **The study conduit (phase 3).** Still the top risk — nobody has run it, and it
   composes four individually-verified things whose *composition* is unverified: the
   relay's validation pattern, blind `rollSkill`, the skipped-dialog config plumbing
   (the one grep-level link — probe ③ pins it), and the GM-side write batch. The ladder
   in §2 exists so each joint is proven before the next is added. Its two design gaps
   are §5's first two corrections.
2. **The `sightRefresh` logger (phase 5).** Not the per-frame cost — the world scan is
   measured at 0.154 ms and the debounce bounds the rate — but the **writes**: an actor
   update per flush syncs to every client and repaints open sheets. The diff-before-write
   rule (reducer returns `changed:false`) is what makes it safe, and check ① is what
   proves the rule holds under real movement. The kill switch defaulting off until the
   five-check sitting keeps a misbehaving logger from ever touching a session.
3. **Tier-25 enricher resolution (phase 3).** Bounded by design — the plain
   attack-item-names fallback must always work, and the flatten guard (§1) makes "raw
   enricher in a notebook" a test failure rather than a play report. `enrichAttack`
   verified present at dnd5e.mjs:20294; the `relativeTo`/rollData wiring is the open
   bit; the live probe could not run this pass (bridge down), so it is **the first
   action of phase 3**: enrich one MM goblin item's `system.description.value` with
   `{relativeTo: item, rollData: item.getRollData()}`, flatten, assert real numbers and
   no `[[`.
4. **The crypto (phase 7; 6 until the attribute layer took the number).** Later by design, and the mortal paths — export, rewrap,
   toggle migrations — are exactly the node-testable ones (§1). Build crypto-core as a
   zero-Foundry-import file first, suite second, Foundry wiring last.
5. **The tab-injection refactor (phase 1).** Lower stakes than the conduit but the most
   likely *day-one* failure, which is why it is phase 1 step ① with ties as its own
   regression test.

### 5. What will not survive contact with the code — corrections, each cheap now

- **⚠ The lock of record is the belief ledger, not `studied`.** `studied` lives on the
  player's **own** actor (decision 5) — which they own, so one devtools line
  (`unsetFlag`) deletes it and re-arms the roll. Reading secrets is the accepted
  boundary; *un-spending a lock* is a mechanics hole with a free fix: the GM handler
  refuses when `beliefs[characterId]` already holds the key — the belief record sits on
  the studied actor, which no player can write (server-enforced, the relay's own
  ground). `studied` demotes to a UI hint for the affordance. One extra check in the
  handler, and the `mayStudy` fixture in §1 is its test.
- **Decision 11 step 2 as written cannot be built.** "The dnd5e configuration dialog
  runs on the player's client" — dnd5e's dialog is coupled to its roll pipeline;
  running it detached on the player's client without rolling there is not a supported
  path. Ship the module's own two-control mini-dialog (advantage/normal/disadvantage +
  situational bonus). The payload contract is unchanged: ids plus those two bounded
  declarations.
- **`injectTab` is not "already generic".** It hardcodes one `TAB` and one paint
  closure; three tabs, two of them character-sheets-only, mean a real refactor of the
  trickiest DOM code in the module (the `changeTab` early-return workaround). Budgeted
  as phase 1 step ①, with ties as the regression.
- **Tier-message authoring has no phase.** Phase 3 needs authored `studyTiers` to test
  falsity, but the authoring *surface* is phase 4's section. Resolution: phase 3 ships a
  console API (`game.pentaryn.ties.setStudyTiers(actor, [...])`) and phase 4's GM
  section absorbs it — same absorption already planned for the pointer picker.
- **Reveals versus `NOTES_MAX`.** A tier-25 reveal *appends* to a 4000-char-capped
  field; a well-kept entry plus a reveal truncates one or the other silently. Give Known
  entries their own cap (`KNOWN_NOTES_MAX`, larger), and refuse-with-notice rather than
  truncate when an append would cross it.
- **The Known reader's "live-resolved when possible" collides with disguise** the moment
  Past Encounters promotes rows — resolved by the ruling below.
- **Estimates.** Judged against the honest record — ties went 0.1.0→0.10.0, 3,710 lines
  and 109 i18n keys, in eight days of this exact kind of work — phases 1, 2, 4, 5 are
  plausible as listed *with the phase-1 cut list below*. Phase 3 is **4–6 days**, not
  3–4: the listed scope plus the mini-dialog, the tier-authoring console API, and the
  indistinguishability run, none of which were in its row. The whole plan is about two
  working weeks at the intensity that built ties in one.

### 6. Phase 1 in one day — the cut list

Ship: the `injectTab` refactor (① above), the `known` schema + hardened reader +
fixtures, entry rows in the ties row idiom (summary → click → expand → textarea), and a
minimal add-picker straight off `candidates()`. Cut, without touching the schema:
**custom-category management** (the two seeded categories as a fixed `<select>`; "new
category…" and rename land later — `knownCategories` already holds them),
**the standalone-window host** (sheet tab only; ties keeps its header-button fallback
precedent for when the markup moves), and **the "Kind: Goblin" cross-reference line**
(phase 3 concern anyway). Everything cut is additive later; nothing cut changes a flag.

### 7. The disguise ruling — ~~recommendation, so Joe decides instead of re-deriving~~ **ruled 2026-08-23, recommendation absorbed**

> **Joe ruled, and his design goes further than this recommendation** — see
> [`foundry-disguise.md`](foundry-disguise.md). The cache-from-the-screen rule below
> **stands as the display half** (it ships with phase 5 regardless, and covers unmarked
> renamed tokens); the pointer supplies the id half — player-facing captures resolve
> `apparentActorOf(token)`, so a masked token's row is keyed by the **persona** actor and
> even the flag's id stops being a leak. Ties' `read()` stays untouched, as this section
> hoped, and the GUI plan's dialog question closed with it. The text below stays as the
> record of the recommendation as priced.

The GUI plan's three options priced the fix inside *ties*' `read()` — shared by cards,
panel, dialog and `inbound()`, hence expensive. The new feature does not have that
constraint: `known.mjs`'s reader is new code. **Recommendation: extend Past Encounters'
own rule — "the screen is never a leak; resolving the actor behind it is" — to every
player-facing surface of the new feature.** Concretely: Known rows and Past-Encounters
rows display, for non-GM users, the name and art **cached from that player's own screen**
at sighting/filing time; live resolution is the GM's view, which annotates divergence
("actually: Ozmandius"). Ties' `read()` is untouched; the tie-dialog question stays open
but stops blocking *this* plan.

Cost: about half a day — one branch in the new readers plus the GM annotation line.
Residual, named: the actor id still sits in the flag (the accepted devtools boundary),
and honest GM renames go stale on player rows until re-sighted or re-filed — acceptable,
it is their notebook. The standing curation rule remains the true fix for personas that
matter: **a disguised persona that matters gets its own actor** — which also gives it a
clean `kindOf` and its own lore rows, so the encounter-log design independently pushes
the same direction. This unblocks phase 5 with no change to any shipped surface.

## Rejected

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| ~~The Seen list should not be built~~ — this plan's own first verdict (overturned same day) | Joe answered both objections without touching the hard part: its own tab (nothing to bury) and a 100-cap (nothing unbounded). The safe-logging rules survived the overturn intact | Recall across sessions — the one thing only automatic logging provides |
| Per-*sighting* feed rows (a new row every re-sighting) | A party walking past the same four NPCs all session flushes all 100 rows with duplicates — and re-sighting reorders the list into "most recently seen", which is not "the order they saw them" | Joe's cap made meaningless, and his ordering broken, by the reading that sounds most literal |
| Dropping a chronicle row when it is promoted to Known | Punches holes in exactly the history the tab keeps; Joe's reasoning runs the other way — the list may be long *because* the cared-about entries are already in Known | The chronicle's integrity, to save rows a 100-cap already bounds |
| A Known/Past-Encounters segment instead of a third tab | Joe asked for a tab; a real tab rides the sheet's own tab state where a segment is one more repaint-surviving state of ours; the row species differ anyway | One nav icon — and the fold-to-segment fallback stays a one-line mount change if the nav ever crowds |
| Per-creature-*token* knowledge, or per-type lookup tables by name | `baseActorOf` already keys tokens to one world actor; matching by name re-derives worse what the document model states | A goblin slot machine, or a name-matching heuristic that breaks on "Goblin Boss" |
| One knowledge key per world actor — this plan's own first cut of decision 4 (overturned same day) | Conflates the kind and the individual: a named NPC as its own actor gets "learned" in one roll with the kind question never offered; as a renamed token, the individual's lore has only the scene-local token to live on | Joe's two clearest use cases — custom monsters and rollable NPC history — broken in opposite ways |
| Free-text kind keys instead of a world-actor pointer | The graded ladder needs a stat source — biography, traits, attacks — and a string has none | A bestiary of empty pages, plus a typo-keyed lock map |
| `details.type.value` as the implicit kind | One goblin would teach all humanoids | The scope the whole axis exists to get right |
| A third entry species / separate bestiary tab for kinds | A kind entry is an ordinary entry named "Goblin"; the category dropdown already files bestiary vs who's-who | A second filing axis fighting the first, and a tab nobody asked for |
| A graded ladder for individual lore rows | A lore row is one authored fact at one price; stacked rows with rising DCs give a better ladder for free, each fact independently rollable | Forcing three tiers onto secrets that don't come in threes |
| Separate rolls per DC tier | Three pulls at one machine — the exact slot machine P5 feared, tier by tier | Retry bookkeeping ×3, and a worse game |
| Retry after a long rest / next session | Needs rest- or session-tracking machinery for a permission 5e doesn't grant anyway | A timer store and a `dnd5e.restCompleted` listener, to enable re-rolling |
| ~~Reveal over the GM relay (P2 option 3)~~ — **overturned by the blind rework** | Right for the design it judged: a public roll, true text the client already held, an unverifiable "I passed" claim. The falsity ruling flipped every premise, and decision 11 is that conduit built on the opposite trust shape — the GM client rolls, so no claim crosses the wire, and the guarded content is never sent at all | The row is kept because its reasoning shaped the conduit's validation discipline |
| Dice So Nice on study rolls | Joe caught it himself: 3D dice on the player's screen replay the number the blind mode just hid | The blind contract, broken by ambience |
| The vault + MCP-bridge as the secret store (lore stays in this repo, revealed over the bridge) | Joe's own objection, and the strongest one: not shippable as a public module, two sources of truth, and one schema to guard in two places | Every table that is not this repo — i.e. the release itself |
| A world store that only GM clients load | Impossible, and measured rather than argued: the server read path has no ownership gate anywhere, so every document reaches every client. This row exists so nobody proposes it a third time | — |
| WebAuthn PRF / passkey-derived key (Touch ID) for the encryption setting | Verified absent where it matters: Electron's Touch ID WebAuthn authenticator is embedder-opt-in (`app.configureWebAuthn` + a keychain entitlement) and Foundry's app configures neither — grep of `main.js` and `dist/` finds no call. And a passkey is RP-ID-bound: the Electron app lives at `localhost`, other devices at the tunnel domain, so "the same key everywhere" is false by construction | A key that exists on one origin, sometimes, in a build that cannot mint it |
| A per-device non-extractable key in IndexedDB as THE key | Durable but unrecoverable: fails device change outright, and a dead browser profile strands the GM outside their own notes. Correct only as the escrow's cache layer, which is where decision 13 puts it | Requirement (b) and (e) both |
| Passphrase typed every session, no escrow (Joe's baseline) | Strictly dominated by the escrow: same recovery story, minus the once-per-browser cache and minus the loss-proofing of the wrapped blob in world backups | Typing the secret forever — the exact manual step Joe asked to be rid of |
| Argon2id for the KEK | Not in SubtleCrypto; a WASM dependency in an otherwise dependency-free public module | Better GPU resistance than PBKDF2 — bought back with iteration count and a decent passphrase |
| A companion key service | "Run a service" is not an install step a stranger will perform; Joe rejected it himself for the public release | Everyone else's table |
| GM-only journal as the secret store (P2 option 2) | Verified: the server read path has no ownership filtering — journals sync whole to every client. UI-hidden, not secret | A document round-trip per reveal, for the same devtools exposure flags already have |
| A bare `1d20` roll | Loses advantage, proficiency, bonuses, the chat card, and the GM's visibility of the attempt | Re-implementing half of `#rollSkillTool` badly |
| Enforcing the in-combat action cost | dnd5e has no action ledger to spend from — verified; there is nothing to enforce against | Fake enforcement that fights the table's actual economy |
| Rendering reveals live off the monster | The manual stops being theirs; edits impossible; every render re-leaks whatever the stat block gains later | The "in their own words" goal — the point of the feature |
| Embedding the stat block on success (DC 25) | A stat-block dump is a rules window, not a notebook entry | Readability of every entry that cleared 25 |
| Drag-and-drop category board | The dropdown does the same filing for a fortnight less work (draft's own numbers, still right) | A fortnight |
| Lock stored inside the deletable entry | Delete-and-re-add becomes a free reroll | The one-roll rule, silently voided by a trash can |
| Its own module beside `pentaryn-ties` | Imports half the API, doubles sync/restart, shares the panel anyway | A second manifest to keep honest |
| Below the ties list on the same tab (draft P8) | Buries the GM inbound section under thirty Known rows | The ties tab's legibility — its whole reason to exist |

## Open questions from the draft — all resolved

1. **Seen list worth building?** ~~As specified, no~~ — **overturned by Joe's cap-and-tab
   answer: yes, as the Past Encounters tab.** One row per world actor, `lastSeen` updated
   in place, ordered by first sight, capped by a setting defaulting to Joe's 100. Ships
   last, kill-switched, blocked only on the disguise ruling.
2. **Which P2 option?** Option 1, presentation-only ~~; the relay is not widened~~ — the
   relay IS widened after all, by the blind rework, into decision 11's conduit, on trust
   grounds the original rejection did not have. The journal route was measured in the live
   world and is not a secret store (decision 8's numbers), and the server-side-gate check
   concluded: none exists, no light lift. What replaced it is stronger where it counts —
   the blind conduit never sends the number or the alternatives, and decision 13's opt-in
   encryption makes the stored strings unreadable at rest.
3. **Failure?** One graded roll per kind per character, ever; flat one-shot per lore row;
   GM reset control. Both locks outlive entry deletion.
4. **Module or its own?** Inside `pentaryn-ties`, own files, its own tabs (Known, Past
   Encounters) beside Ties.
5. **Per creature or per type?** Neither alone — **two axes** (amended decision 4): the
   graded ladder is per *kind* (GM pointer, defaulting to the actor itself, which makes
   stock monsters per-type for free and the slot machine unrepresentable), and individual
   identity is per *actor* via flat GM lore rows.

~~Still open, and blocking only phase 5~~ — **closed 2026-08-23.** Joe ruled with a design
of his own — the disguise as a pure pointer: a token-level mark aiming at a persona actor,
every player-facing read redirected through it, a GM-set DC pierced only by a hidden,
GM-thrown Intelligence (Investigation) check riding the Study gesture (the PHB's own rule
for Disguise Self — Joe's Perception guess corrected against the installed book). Judged,
specced, and priced in [`foundry-disguise.md`](foundry-disguise.md): it sits **beside**
`worn` (whose six live possession marks are untouched — the pointers run opposite
directions across the mask), dissolves this plan's phase-5 blocker (row id =
`apparentActorOf`, display = the §7 cache rule), and adds ~2½ days to phase 3's conduit
for the piggybacked blind check plus the approval gate. Amended same day from Joe's
end-to-end walkthrough: disguises **layer** (an ordered stack in the one token mark —
never actor-level pointer chains, which have no token to stand on and make cycles
representable), a pierced layer hands the character the *next* face's identity and Known
entry, and the pierced record gains the **Impersonated** marker (decision 2's schema
addendum above). Amended a second time the same day: the GM's drop button **pops one
layer** (layer-identity keying keeps private knowledge stable under pops), and any check
can **hold its reveal for GM approval** — timing, never veto — riding the belief ledger
(decision 12's amendment). **No open questions remain in this plan.**
