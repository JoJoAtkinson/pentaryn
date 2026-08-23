---
created: 2026-08-22
last-modified: 2026-08-22
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design", "#proposal"]
status: proposed — judged 2026-08-22; amended same day three times (kind/individual knowledge split; Past Encounters reinstated as a capped tab; the blind rework — authored tiers that may lie, GM-thrown blind rolls, plaintext reveals, encryption designed as a later opt-in); fourth pass same day added the build-and-validate gate (incl. the beliefs-as-lock correction and the disguise recommendation); not built
---

# The Known list — a player-built monster manual

**Read this when:** building the Known-list / Study-roll feature. **Design doc, unbuilt.**
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

Copy-into-the-entry is kept, and it is the answer to "how is this rendered": the reveal is
**appended to the entry's own notes field as short, editable text** with a one-line
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
- Everything lands in the same `notes` textarea, `NOTES_MAX`-capped, theirs to rewrite —
  the manual stays *in their words*, and staleness against later GM stat edits is accepted
  exactly as the cached-name pattern accepts it.

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
screen is never a leak; resolving the actor behind it is. This narrows but does not close
the hole the GUI plan's open disguise question already tracks (the actor id is still in the
flag, readable with devtools); the operative rule stays the module's: **a face or name that
would spoil the game must not be reachable, and a disguised persona that matters should be
its own actor.** With the feed now definitely shipping, that open question must be resolved
before this phase — it is the phase's one blocker.

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

## Build order — stop anywhere

| Phase | Delivers | Usable alone? | Honest scope |
| --- | --- | --- | --- |
| **1** | Known tab: schema + hardened reader, entry rows (ties row idiom), category dropdown, sheet "Add…" | ✅ A manual notebook with categories — already the core ask | 2–3 days |
| **2** | Canvas key: hover → open/create the Known entry | ✅ "You see them, you can note them" | ½–1 day |
| **3** | The kind ladder, blind: `kindOf` resolution + a minimal GM pointer picker, the study conduit (decision 11 — socket request, GM-client blind `rollSkill`, public stub card), authored tier messages with derived fallback, graded reveal into the kind entry, `studied.kind` lock + belief record, combat warning, GM reset | ✅ The bestiary plays like D&D — the roll itself needs a GM online, which an arbitrated blind roll would anyway. Stock monsters need no pointer, so this is complete without phase 4 | 3–4 days (+ the tier-25 enrichment check, now scoped by the MM pack finding) |
| **4** | The individual axis: GM lore rows + the full authoring section (absorbs the pointer picker), flat rolls, `studied.lore` lock | ✅ The who's-who — story carried, not just stat blocks | 1–2 days |
| **5** | Past Encounters tab: `sightRefresh` logger, per-actor rows with cached token name/art, cap setting (default 100), known-markers, kill switch | ✅ The chronicle | 1–2 days + a real play session watching it — **blocked on the disguise decision** |
| **6** | Encryption at rest (decision 13): the opt-in setting, wrapped-key escrow, unlock prompt + IDB cache, export/import, rewrap, rotate, encrypt-all / decrypt-all migrations, secure-context guard | ✅ Optional by design — the feature is whole without it, and it changes only whether stored strings are readable | 2–3 days, after everything else has played |

**Phases 1–3 are the feature.** Phase 4 is what makes it Joe's. Phase 5 ships — Joe's cap
and its own tab settled that — but it ships *last among the content phases* and behind its
kill switch, because a client-side sight logger earns trust in a session, not a plan, and
its one open blocker (the disguise question) is Joe's to rule on — **that ruling is still
the only thing standing between this plan and a complete build** (a recommendation now
sits in the build-and-validate section below). Phase 6 is deliberately optional and
deliberately final: plaintext ships first, honestly documented, and the setting arrives
with no schema change.

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
| Phase 6 crypto-core, entire | node ≥20 ships `globalThis.crypto.subtle`: KDF→wrap→unwrap round-trip, wrong passphrase fails clean, tampered ciphertext fails clean, `enc:v1:` armored-reader prefix dispatch, encrypt-all/decrypt-all over fixture flag sets. Only the IDB cache and the prompts need a browser — **the paths where data dies are the node-testable ones** |

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
| **6** | Data death in migrations | The node crypto suite is the real gate (§1). Foundry-side: visit once via a LAN IP → the module refuses to enable (secure-context guard); keyless-GM prompt + **cancel ⇒ no lock** over the conduit; key-export file imported into a second browser profile unlocks | both, one pass |

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
4. **The crypto (phase 6).** Later by design, and the mortal paths — export, rewrap,
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

### 7. The disguise ruling — recommendation, so Joe decides instead of re-deriving

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

Still open, and blocking only phase 5 — which now definitely ships, so this is a real
blocker rather than a caveat: the GUI plan's **disguise question** (its "the disguise ends
at the dialog" section). Past Encounters automates the unmasking that is currently at least
a deliberate keystroke; Joe rules on that before the feed's phase begins. **The fourth pass
put a priced recommendation on the table** (build-and-validate §7: cache-at-sighting display
for players across both new tabs, GM view resolves live and annotates, ties' `read()`
untouched, ~half a day) — the ruling is now accept/decline, not derive-from-scratch.
