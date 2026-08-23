---
created: 2026-08-22
last-modified: 2026-08-22
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design", "#proposal"]
status: proposed — not built, not judged
---

# The Known list — a player-built monster manual

**Read this when:** designing or building the encounter-log feature. **Design doc, unbuilt.**
**Not this file:** the ties panel this would sit under → [`foundry-npc-ties-gui.md`](foundry-npc-ties-gui.md)

> **Goal, in Joe's words.** Every token a character has *seen* is listed, in the order they saw
> it. The player can open any of them and add their own details — and doing that promotes the
> entry from a raw sighting to something they **know**. The known list is theirs to organise, in
> whatever order they think of people in. Monsters go in the same list as NPCs. And a player can
> **roll** to learn what a monster actually is: description, then immunities, then its real
> attacks and damage. Over a campaign they build their own monster manual, in their own words.

This is one feature with four moving parts. They are separable and could ship in order.

---

## 1. Two lists, and the promotion between them

| | What it is | Who writes it |
| --- | --- | --- |
| **Seen** | Every token this character has laid eyes on, in sighting order. Automatic. | The system |
| **Known** | The curated list. An entry arrives here the moment the player writes anything on it — a note, a category, or a successful roll | The player |

The promotion rule is the good part of the design: **the act of caring about someone is what
files them.** No "add to known" button, no second gesture. Writing is the gesture.

Known keeps the player's own order. Seen keeps sighting order and is secondary — the
raw feed, not the thing you read at the table.

## 2. Categories, by dropdown — not drag and drop

Each Known entry has a category chosen from a dropdown, which also offers **"new category…"**.
That is the whole interface. Deliberately not a drag-and-drop board: the dropdown is a morning's
work and a board is a fortnight's, and the dropdown does the same job for a list this size.

Defaults: **Sentient** and **Beasts**, both renameable, with monsters landing in a monster
category automatically so the list is useful before anyone organises anything.

## 3. The reveal ladder — rolling to know what a monster is

Grounded in the 2024 **Study** action, which the PHB module defines (see
[`../foundry/rules-lookup.md`](../foundry/rules-lookup.md)). The Areas of Knowledge table already
gives the skill from the creature's type, so **the system can pick the skill itself**:

| Skill | Creature types |
| --- | --- |
| Arcana | Aberration, Construct, Elemental, Fey, Monstrosity |
| History | Giant, Humanoid |
| Nature | Beast, Dragon, Ooze, Plant |
| Religion | Celestial, Fiend, Undead |

The ladder Joe proposes, which lines up with the PHB's Typical DCs (Medium / Hard / Very hard):

| DC | Reveals |
| --- | --- |
| **15** | The description — what it is, in prose |
| **20** | Immunities, resistances, vulnerabilities |
| **25** | Its actual attacks and damage — effectively, everything |

**One roll, then the icon is gone.** Succeed and the knowledge is written into their own entry;
the roll affordance disappears. They can keep editing what they wrote by hand afterwards, so the
entry becomes their words rather than a stat block dump.

**The roll icon only exists when there is something to learn.** No description, no GM secret, no
icon. A blank monster offers no roll.

## 4. Combat costs your action

Study is an **action** in 2024. So: if the character is in a live combat, clicking the roll warns
that it will use their action. Out of combat it simply rolls. The system already knows which,
from the active Combat.

## 5. GM-authored secrets with their own DC

On a sheet, the GM can write a piece of information and attach a DC to it. The player sees a roll
option; passing reveals it. Same one-roll rule, same no-content-no-icon rule. This is the part
that makes the feature carry story rather than just stat blocks — "roll History 15 to know why
this family left the coast".

---

## Problems I can already see

These are not objections. They are the things that will decide whether this is two weeks or two
months, and one of them is a genuine dead end that needs designing around rather than through.

### P1 ⚠ The player's client already has the monster

Foundry ships **every Actor document to every client**. This repo has already established it,
twice, in the ties work: the rules there govern *presentation, not access*. So a reveal ladder is
a ritual for honest players, not a secret-keeping mechanism — anyone with devtools reads the
whole stat block without rolling.

That is fine, and the ties module says so out loud rather than pretending. But it must be
designed and documented as such from the start, and it bears directly on P2.

### P2 ⚠ GM secrets cannot simply live on the monster's flags

If a GM-authored secret is stored as a flag on the NPC, every player's client has it before
anyone rolls. Three options, and this needs deciding before anything is built:

1. **Accept presentation-only**, exactly as tie notes did, and tell the GM the rule: nothing goes
   here that would ruin the game if read.
2. **GM-only journal** keyed by actor id, revealed on success — the parent ties plan already
   names this as the answer for genuine secrets.
3. **Reveal over the GM relay** — `relay.mjs` already exists and does precisely this shape of
   thing: the player's client asks a GM's client to write something onto the player's own actor.
   The secret would live GM-side and only the *revealed* text would ever reach the player.

Option 3 is the interesting one because the machinery is built and tested.

### P3 How do you know they *saw* it?

`Token#isVisible` is per-client and momentary. Logging needs a hook (`sightRefresh`, or a
throttled pass on token refresh) running on that player's client, writing to their own actor —
which they own, so permissions are fine. Open questions: cost per frame, what happens when the
player is offline while their character is on screen, and whether a token glimpsed for one frame
through a door counts as seen.

### P4 Volume and noise

"Every token ever seen" over a long campaign is thousands of rows, most of them rats. The Seen
list needs a bound, a collapse, or a rule about what is worth logging. Known is self-limiting
because it takes a deliberate act, so the pressure is all on Seen.

### P5 What does a *failed* roll do?

Joe specified success: knowledge written, icon gone. Failure is undecided. 5e convention is no
retry without changed circumstances. Options: icon greys out until the next session/long rest, or
until that creature is seen again, or a permanent one-shot per creature type. This needs a
decision — it is the difference between a meaningful gamble and a slot machine.

### P6 Where does the revealed text live?

Copying it into the player's own entry (rather than rendering live off the monster) is almost
certainly right: it matches the "build your own monster manual in your own words" goal, it lets
them edit it, and it matches the ties module's existing cached-name pattern. The cost is that it
goes stale if the GM edits the stat block later.

### P7 The roll should be a real dnd5e roll

Not a bare `1d20`. Going through the system's roll pipeline means advantage, proficiency, bonuses
and chat cards all work, and the GM sees what was rolled. It also means Study-action-in-combat
can be enforced rather than merely warned about.

### P8 Where does this live on the sheet?

Joe says "below section" — below the ties list. That tab is already busy: outbound ties, the
here/elsewhere split, the add bar, and a GM-only inbound section. A second tab may be cleaner.
Undecided.

### P9 Solved problems worth reusing

Unlinked tokens must resolve to the world actor, not the token delta (`baseActorOf`). Visibility
filtering must use `isVisible`, not `visible`. GM-only sections gate in the data layer, not the
renderer. All three are already built and tested in `pentaryn-ties`.

---

## Open questions for the judge

1. Is the Seen list worth building at all, or is Known-on-first-write enough? Seen is where all
   the cost is (P3, P4) and it may be carrying little.
2. Which of P2's three options, and does the relay actually fit?
3. What does failure do (P5)?
4. Does this belong in `pentaryn-ties` or as its own module? It shares the panel, the actor, the
   relay and half the helpers — but it is a different feature with a different data shape.
5. Is the DC ladder per-creature or per-*creature-type*? Learning one goblin's stat block
   plausibly teaches you all goblins, and a player re-rolling for every goblin they meet is the
   slot machine P5 is trying to avoid.
