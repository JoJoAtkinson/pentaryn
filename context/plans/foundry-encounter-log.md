---
created: 2026-08-22
last-modified: 2026-08-22
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design", "#proposal"]
status: proposed — judged 2026-08-22; amended same day (knowledge split into kind/individual axes); not built
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
Nothing here is assumed.

---

## The verdict: three features wearing one coat

The draft called this "one feature with four moving parts." It is three features, and they do
not carry equal weight:

| Feature | Value | Risk | Fate |
| --- | --- | --- | --- |
| **The Known list** — player-curated entries, categories, promotion-by-writing | The actual product: the monster manual in their own words | Low — it is the ties tab's patterns with a new schema | **Build first** |
| **The Study roll** — the DC ladder + GM secrets | What makes the manual *play* like D&D instead of a notes app | Medium — roll API verified, text extraction needs care | **Build second** |
| **The Seen list** — automatic sighting log, every token, sighting order | A feeder and a memory aid | High — carries P3 and all of P4 | **Cut as specified.** A bounded replacement ships last, optional |

**The Seen list as Joe described it — every token, every sighting, in order — should not be
built.** Two players over a long campaign produce thousands of rows, most of them rats, and
nobody reads a raw feed (P4). The in-the-moment case ("I want to note this goblin *now*") is
better served by a canvas gesture, which the ties module has already proven twice: point at
the thing you can see, press a key. What only automatic logging provides is *recall* — "what
was that thing in the vault two sessions ago?" — and that survives in a form that dissolves
P4 by construction: an **Encountered feed that logs each distinct world actor once, at first
sight**. 115 NPCs in this world bound that list at 115 rows for the entire campaign. It ships
as the final phase, behind a kill switch, and nothing earlier depends on it.

The sight machinery it needs is real and verified — see P3 — so this is a judgement call, not
a technical dead end: the continuous log dies on value, not feasibility.

---

## The decisions

### 1. It lives inside `pentaryn-ties`, as a second tab (settles P8 and open question 4)

**Inside the module.** It shares `baseActorOf`, the `isVisible` discipline, the sheet-tab
injection machinery (including the nav-rebuilt-separately trap `injectTab` already solves),
the notes caps, the i18n plumbing, the `playerAccess` kill-switch pattern and the
`make foundry-ties-sync` step. A second module would import half of `ties-api.mjs` and double
the sync-and-restart surface for nothing. New files (`known.mjs`, `study.mjs`), new flag keys,
same module.

**A second tab, not "below" the ties list.** The ties tab already carries outbound rows, the
here/elsewhere split, the add bar and the GM-only inbound section; a Known list of thirty
entries underneath would push the GM's inbound section below the fold of every sheet. The
Known tab injects beside Ties on **character** sheets only (`renderCharacterActorSheet` is
already in the hook list) — NPCs don't keep notebooks. Different data, different tab, one
design language.

### 2. Known: writing is still the gesture — and there is no Seen list to promote from (yet)

The best sentence in the draft survives: **the act of caring about someone is what files
them.** No "add to known" button. An entry exists because the player wrote something.

Until the Encountered feed ships, entries are created two ways, both existing idioms:

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

The draft framed the ladder as three thresholds and left failure undecided. Decided: there
are not three rolls. There is **one Study check per *kind* per character, ever** — rolled
from any entry whose actor resolves to that kind — and the total buys everything it clears:

| Total | Written into their entry |
| --- | --- |
| **≥ 25** | Description + immunities/resistances/vulnerabilities + real attacks and damage |
| **≥ 20** | Description + immunities/resistances/vulnerabilities |
| **≥ 15** | The description |
| **< 15** | A line saying their character doesn't recognise it — which still promotes the entry: they encountered it and thought about it |

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
  kind: { "<kindActorId>": { total: 17, when: … } },          // the graded ladder, keyed by KIND
  lore: { "<actorId>:<loreId>": { total: 12, when: … } }      // individual rows, flat (decision 8)
}
```

Keying the kind lock by the **kind** actor id is what makes the axes independent and the
coverage right: studying Grix's kind marks `kind["<goblinId>"]`, so plain goblins met later
offer no re-roll — and studying a plain goblin first removes the kind icon from Grix's row,
while his *who-is-this* lore rows stay rollable. Deleting any Known entry deletes prose
only; both maps stay, so a re-added entry shows no icons it already spent.

The skill comes from the **kind's** creature type via the PHB Study action's Areas of
Knowledge table, exactly as drafted (Arcana / History / Nature / Religion by type — the
system picks it, the player never chooses).

**No content, no icon** — kept, and it is what lets one row carry two icons without
ceremony. An entry renders up to two roll affordances, each only when there is something
behind it: the **kind icon** when the kind's `system.details.biography.value` (path
verified) is non-empty and `studied.kind` has no record; the **lore icon(s)** when the
actor carries unspent lore rows (decision 8). A stock goblin shows one icon; Grix shows the
kind icon plus his lore; a kindless, lore-less commoner shows none. Self-correcting: the
kind icon's absence tells the GM which monsters still need a description.

### 6. The roll is `actor.rollSkill()` — verified against dnd5e 5.3.3 (P7)

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
  `roll.isSuccess` / `roll.isFailure` (68517–68530) and pass/fail styling on the chat card.
  Pass `target: 15` — the base DC — and grade the 20/25 tiers off `roll.total`.
- The system's own dialog and chat card come free: advantage, proficiency, bonuses, and the
  GM sees what was rolled. Returns `Promise<D20Roll[]|null>`; **`null` means cancelled**, and
  the one-roll lock must only engage on an actual evaluated roll.
- The roll is public chat; **the revealed text is not**. It is written into the player's
  entry only — a GM secret's text in a chat card would hand it to the other player.

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
— Studied (Nature 22 vs DC 15) —
A small, black-hearted humanoid… {biography, HTML stripped to prose}
Immune: poison. Resists: cold. Vulnerable: fire.
Scimitar +4, 1d6+2 slashing · Shortbow +4, 1d6+2 piercing
```

- Tier 15: `details.biography.value`, enrichers and tags flattened the way
  `rules-lookup.md` already does.
- Tier 20: one line from `system.traits.di/dr/dv/ci` labels (paths verified).
- Tier 25: one line per attack — name, to-hit or DC, damage formula — extracted from the
  actor's items. ⚠ The exact extraction against dnd5e 5.3.3 *activities* data is the one
  build-time verification this plan leaves open; the fallback that must always work is a
  plain list of attack-item names.
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

### 8. GM lore rows are the **individual axis** — flat pass/fail, presentation-gated (P2)

The design crux, decided and since **ruled on by Joe**: presentation-only is accepted —
*"this is a friendly game among players I know… UI hiding is perfectly acceptable."* His
other point sharpens why the secrecy story was never the value: stock monsters are a Google
search away regardless; the system's real teeth are **custom monsters and GM-authored
lore** — content that exists nowhere else — and that is exactly what these rows carry. The
same contract as tie notes and the worn mark. (Whether a genuine server-side gate is a
light lift is being checked separately; nothing here depends on the answer.)

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

Why the other two routes lose:

- **The "GM-only journal" is not a secret store either.** Verified in the server this time,
  not just for actors: `dist/database/backend/server-backend.mjs` contains **zero ownership
  checks on the read path** — world documents of every type, journals included, are synced
  whole to every client, and permission governs UI only. The parent plan's suggestion that a
  GM-owned journal holds "genuine secrets" is true of the *interface* and false of the
  *transport*. Moving secrets into a journal buys indirection, not secrecy — and costs the
  reveal path a document lookup and the GM an authoring surface outside the NPC.
- **Widening the relay buys nothing and costs its security story.** `relay.mjs` today is
  deliberately narrow: **seed-only, blank-fill-only** — the GM client trusts the payload for
  nothing but two ids, re-reads everything, and can only fill fields that are empty. A
  reveal service would be a second message type in which a player's client requests
  disclosure of GM-side content — payload-driven *reads*, a claim ("I passed the roll") the
  GM client cannot re-derive from its own documents the way it re-reads tie text, and a hard
  GM-online dependency in the middle of a player-facing roll. And since no Foundry-side
  store is actually hidden from clients (previous bullet), the secret the relay would guard
  is already on the player's machine. All cost, no lock.

The rule for the GM, stated where secrets are authored, same as ties: **nothing goes in a
lore row that would ruin the game if read with devtools.** The three tiers of the monster
ladder never had this problem at all — the full stat block is on every client the moment the
actor exists, so the roll was always a ritual for honest players. Say it in the README and
design accordingly; the ties module has twice shown that honesty here is the feature.

### 9. Sight is detectable — verified — and the Encountered feed spends it carefully (P3)

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

The feed's rules, each dissolving a draft problem:

| Rule | Kills |
| --- | --- |
| One row per world actor, first sight only, ever | P4 entirely — hard-bounded at the NPC count (115 today) |
| Runs only on a non-GM client, for actors that client owns | The GM's all-seeing client logging the whole scene into every PC |
| Writes to the player's own actor | No permission machinery — they own it |
| Kill-switch setting, feed renders collapsed under the Known list | An escape hatch if play proves it noise |
| Offline player logs nothing | Accepted and documented: the feed is *what was on that player's screen*, not omniscient character memory |
| Scenes without token vision treat every non-hidden token as visible (core's own rule) | Accepted: on a theatre-of-mind map, being on the table is being seen |

Writing on an Encountered row promotes it to Known — the draft's promotion rule, now with
something real to promote from. Two owners of one PC double-logging is a benign
last-write-wins race on a deduped list; accepted.

⚠ **The disguise leak, automated.** A first-sight row for a disguised token would cache —
or worse, live-resolve — the *real* actor's name, unmasking "Hooded Figure" as Ozmandius on
the player's own sheet with no gesture at all. The feed must cache the **token's** name and
art at sighting time and display those, never live-resolving for players. This narrows but
does not close the hole the GUI plan's open disguise question already tracks (the actor id
is still in the flag, readable with devtools); the operative rule stays the module's: **a
face or name that would spoil the game must not be reachable, and a disguised persona that
matters should be its own actor.** Resolve that open question before this phase ships.

### 10. Solved problems reused (P9, kept verbatim)

`baseActorOf` for unlinked tokens; `isVisible`, never `visible`; GM-only data gated in the
data layer (`inbound()`'s pattern), never the renderer; hardened readers that cannot throw;
`render: false` writes with deliberate repaints; the nav-vs-body re-injection guard in
`injectTab`. All built, all tested, all imported rather than re-derived.

---

## Build order — stop anywhere

| Phase | Delivers | Usable alone? | Honest scope |
| --- | --- | --- | --- |
| **1** | Known tab: schema + hardened reader, entry rows (ties row idiom), category dropdown, sheet "Add…" | ✅ A manual notebook with categories — already the core ask | 2–3 days |
| **2** | Canvas key: hover → open/create the Known entry | ✅ "You see them, you can note them" | ½–1 day |
| **3** | The kind ladder: `kindOf` resolution + a minimal GM pointer picker, `rollSkill`, graded reveal into the kind entry, `studied.kind` lock, combat warning, GM reset | ✅ The bestiary plays like D&D. Stock monsters need no pointer, so this is complete without phase 4 | 2–3 days (+ the tier-25 extraction check) |
| **4** | The individual axis: GM lore rows + the full authoring section (absorbs the pointer picker), flat rolls, `studied.lore` lock | ✅ The who's-who — story carried, not just stat blocks | 1–2 days |
| **5** | Encountered feed: `sightRefresh` logger, first-sight dedup, kill switch | Optional, forever | 1–2 days + a real play session watching it |

**Phases 1–3 are the feature.** Phase 4 is what makes it Joe's. Phase 5 is a convenience
that must earn its keep in play or stay switched off.

## Rejected

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| The Seen list as specified — every token, every sighting, in order | Thousands of unread rows; the in-the-moment case is a canvas gesture, the recall case survives as first-sight dedup | P3's hook running hot forever to append rows nobody reads (P4) |
| Per-creature-*token* knowledge, or per-type lookup tables by name | `baseActorOf` already keys tokens to one world actor; matching by name re-derives worse what the document model states | A goblin slot machine, or a name-matching heuristic that breaks on "Goblin Boss" |
| One knowledge key per world actor — this plan's own first cut of decision 4 (overturned same day) | Conflates the kind and the individual: a named NPC as its own actor gets "learned" in one roll with the kind question never offered; as a renamed token, the individual's lore has only the scene-local token to live on | Joe's two clearest use cases — custom monsters and rollable NPC history — broken in opposite ways |
| Free-text kind keys instead of a world-actor pointer | The graded ladder needs a stat source — biography, traits, attacks — and a string has none | A bestiary of empty pages, plus a typo-keyed lock map |
| `details.type.value` as the implicit kind | One goblin would teach all humanoids | The scope the whole axis exists to get right |
| A third entry species / separate bestiary tab for kinds | A kind entry is an ordinary entry named "Goblin"; the category dropdown already files bestiary vs who's-who | A second filing axis fighting the first, and a tab nobody asked for |
| A graded ladder for individual lore rows | A lore row is one authored fact at one price; stacked rows with rising DCs give a better ladder for free, each fact independently rollable | Forcing three tiers onto secrets that don't come in threes |
| Separate rolls per DC tier | Three pulls at one machine — the exact slot machine P5 feared, tier by tier | Retry bookkeeping ×3, and a worse game |
| Retry after a long rest / next session | Needs rest- or session-tracking machinery for a permission 5e doesn't grant anyway | A timer store and a `dnd5e.restCompleted` listener, to enable re-rolling |
| Reveal over the GM relay (P2 option 3) | Nothing Foundry-side is hidden from clients anyway; the relay's whole security story is seed-only/blank-fill-only and a reveal service inverts it into payload-driven disclosure with a GM-online dependency | The module's cleanest trust boundary, spent guarding a secret the client already holds |
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

1. **Seen list worth building?** As specified, no. First-sight Encountered feed, last,
   optional, kill-switched.
2. **Which P2 option?** Option 1, presentation-only; the relay is not widened. The journal
   route was checked and is not actually a secret store. **Ruled by Joe**: UI hiding is
   acceptable for this table; a server-side gate only if it ever proves a light lift.
3. **Failure?** One graded roll per kind per character, ever; flat one-shot per lore row;
   GM reset control. Both locks outlive entry deletion.
4. **Module or its own?** Inside `pentaryn-ties`, own files, second tab.
5. **Per creature or per type?** Neither alone — **two axes** (amended decision 4): the
   graded ladder is per *kind* (GM pointer, defaulting to the actor itself, which makes
   stock monsters per-type for free and the slot machine unrepresentable), and individual
   identity is per *actor* via flat GM lore rows.

Still open, and blocking only phase 5: the GUI plan's **disguise question** (its "the
disguise ends at the dialog" section). The Encountered feed automates the unmasking that is
currently at least a deliberate keystroke; Joe decides that one before the feed ships.
