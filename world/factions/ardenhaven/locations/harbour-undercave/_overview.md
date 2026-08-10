---
created: 2026-08-09
last-modified: 2026-08-09
status: ready
location: ardenhaven
tags: ["#encounter", "#ardenhaven", "#ardenford", "#smugglers", "#harbour", "#cr-low", "#writ-board-cr2", "#variants"]
---
# The Harbour Undercave

> "Exact sourcing need not be disclosed."
>
> This is the sourcing.

**Where:** a sea cave under the **Lower Tier**, west of the fishing docks — reachable at low water along the shingle under the harbour wall, or by boat through a gap you would not attempt twice. Tidemark Hold's customs writ stops at the harbour mouth and everyone involved knows exactly where that line is.
**Quest:** **Distilled Alcohol Delivery**, [writ board (CR2)](../../quests/writ-board-cr2/_board.md) — [Hesta Briarvein](../ardenford/shops/willowglass-apothecary.md) at the Willowglass Apothecary pays **half in healing potions per bottle delivered**, and does not ask where the bottles came from.
**Tuned for:** 4–6 level-1 PCs. Same map, same statblocks, **275 XP** in every variant — pick one at the table and swap without re-tuning.

| | Variant | What it is | XP |
|---|---|---|---|
| **v1** | [The Run](#v1--the-run) | The straight fight. Smugglers, a boss, and something in the roof. | 275 |
| **v2** | [The Other Cargo](#v2--the-other-cargo) | There is a person in the cave, and she begs not to be rescued. | 275 |
| **v3** | [Sarn Kestle](#v3--sarn-kestle) | A named boss who knows Hesta, has run this for years, and would rather nobody died. | 275 |

All three use **bandit ×4** (25 XP each) + **tough ×1** (100 XP) + **stirge ×3** (25 XP each) = **275 XP**. Only the *reason* changes.

---

## Shared: terrain

- **The cave:** roughly 60 × 40 ft of tidal chamber, ceiling 20–25 ft and lost in the dark. The floor is **wet rock**, not sand — black, weed-slicked, shelving down to open water at the seaward end.
- **The inlet:** the sea comes in through a gap at the west end and falls over a rock lip in a low, constant **waterfall** about 8 ft high. Not loud enough to drown a shout; loud enough that nobody hears anybody coming, in either direction. **Disadvantage on Perception (hearing) checks** for everyone, all fight.
- **Stilt shacks:** three along the northern wall on driftwood pilings 4–6 ft above the water line — sleeping platforms, a stove, the stock. Reached by plank walkways: **5 ft wide, no rail.** It is where the fight wants to happen, which is exactly why it shouldn't.
- **Beached boats:** two shallow-draft skiffs hauled up on the shelf, plus a half-rotted third on its side. **Half cover.** The good ones are the only way out and everyone in the cave knows it.
- **Slick rock:** any creature that Dashes, is Pushed, or is knocked Prone on the shelf makes a **[ASK PLAYER] DC 11 Dex save** or goes Prone and slides 5 ft seaward. Falling off a plank walkway is **1d6 bludgeoning** into 3 ft of cold water.
- **Tide — a clock, not a hazard.** It is coming in. Every **3 rounds** the water rises 1 ft: the shelf narrows, the seaward third goes under, and by **round 9** the shingle route out under the harbour wall is **gone** until next low water. Say it out loud at the top of round 3 and again at round 6. A party that treats this as a fight to the last man is going to be swimming, in the dark, with things in the air.
- **Light:** two shuttered lanterns in the shacks and a driftwood fire mostly down to embers. **Dim light** across the shelf, **darkness** above 10 ft — which is where the ceiling is, and the entire reason nobody has noticed what is hanging up there.

## Shared: morale — read this before initiative

**These people would rather surrender than die, in every variant.** Enforce it mechanically, not as a vibe:

- **The boss calls it off** at or below **16 HP**, or when **two** of the crew are down, or the instant anyone makes a credible offer. `call_it_off` sits at the top of his chip grid because it is his *default*, not his last resort. Terms are always: *take the crates, we take the boats, nobody says a name to Tidemark.*
- **Individual smugglers break on their own** (`throw_down_arms`) at or below **6 HP**, when the boss goes down, or when half the crew is down. No order needed.
- **A surrendered smuggler who is then attacked ends surrender for everybody.** Every survivor fights to 0 HP. Say it once, early, so the table has heard it.
- **The boats are the escape, not the prize.** A broken crew makes for the skiffs, not the exit. Do not chase; there is nothing at the end of it.
- **Full XP is awarded for a surrender.** Say so. A party that learns this fight can be won by talking will remember it for the rest of the campaign.

## Shared: the second wave — stirges

**Do not roll the stirges into initiative at the top of the fight, in any variant.** They are not on the smugglers' side and the smugglers do not control them. They have been hanging in the roof-dark feeding on whatever walks into a warm, wet, black cave, for a long time.

- **Bring them down mid-fight** — start of **round 2 or 3**, or the first torch, or the first real shout. Use `drop_from_the_dark`: one Stealth roll (**1d20+3**) for the whole flight against passive Perceptions, then roll their initiative into the existing order.
- **They do not care whose side anyone is on.** Nearest warm body — smuggler or PC, whichever is closer. For one round, everybody in the cave has the same problem. Play that beat; it is the best one here.
- **A latched stirge is a real threat at level 1.** `proboscis` at **+5** hits, attaches, then **2d4 necrotic automatically at the start of each of its turns** — no attack roll, no save — until someone spends an **action** to pull it off. Two turns of that drops a level-1 caster. The 25-XP creature is the one that kills somebody here.
- **They fly 40 ft and manage 10 ft on the ground.** They stay off the floor, cannot be flanked, and are AC 13 with 5 HP. A melee PC with no reach and no bow is going to have a bad round.
- **They leave on their own.** Gorged (two drains) → back up to digest, gone for good. Damaged → circles and re-picks. Killing them all is optional; the party can simply get out.

---

# v1 — The Run

**The straight fight. 275 XP.** Use this when the group wants a good tactical cave with a clock and a nasty surprise, and no complications.

**Everyone in the cave is working.** Three smugglers stacking green-glass bottles in straw, one on the plank walkway with a lantern, and the **boss** on a skiff's gunwale doing sums on a slate. They are four dock-hands and a man who owns two boats, running Merrowgate spirit past a customs desk. No ideology, no cruelty, no hoard — **eleven crates of very good distilled alcohol** and a shared understanding that none of them is getting rich.

**They will talk first.** The boss stands up, doesn't draw, and asks what the party wants. There is a version of this where nobody rolls initiative at all: the party says *Willowglass sent us*, he names a price, and it becomes a haggle. **Let that happen if the party lets it happen** — Hesta pays per bottle either way, and a party that buys the stock walks out with more of it than a party that fights for it.

**Tactics.** Round 1 the crew is **not in formation**, because they were working. Two dive for the boats' cover and their light crossbows. One is stuck up on the plank walkway holding a lantern and has to choose between the lantern and a weapon. The boss puts himself between the party and the crates.

- **Crossbows first, from cover.** One shot each from behind a skiff, then they close or they break. Nobody here reloads under pressure.
- **Clubs, not blades**, unless the party makes it lethal. These are dock-hands: a boat-hook haft across the shins is a normal Tuesday, a knife in a stranger is not. `club` is nonlethal — a PC dropped by it is unconscious and stable. They draw the `scimitar` only if a PC kills one of them, and then it is a different fight.
- **The boss holds the ground in front of the crates** and uses **Pack Tactics** every round it is live. `wade_in` fires the moment a crew member drops within 15 ft; he interposes, and his morale clock advances a step. Two of those and he is calling it off.
- **Nobody fights on the plank walkways by choice.** The crew knows the planks; the party doesn't. A PC who follows a smuggler up there has made the smuggler's day.

---

# v2 — The Other Cargo

**The moral axis. Same 275 XP, same statblocks, one more person in the cave.** Use this when the group needs a fight that stops being a fight halfway through.

The crates are real and the spirit is real. **They are also cover.** Under a tarp in the furthest stilt shack, sitting on a folded blanket with her boots already on, is a woman named **Iselle Marrow** — twenty-two, Gray District, Calderon-born — and the run tonight is not going out empty.

**She is being smuggled *out* of Ardenford.** She paid for it herself, in coin she does not have and a favour she will regret. Three weeks ago a man she did not recognise asked a shopkeeper on her street what hours she worked, and gave a name that was not the one she uses here, and she has not slept since. Everything in the Gray District file about the fear that never leaves — *no reported cases, no disappearances, no confirmed anything, and the fear burrowed deep in people who know how their former government operates* — is standing in that shack with its boots on.

**She is the twist, and the twist is that rescuing her is the wrong move.**

- **The party will assume she's a prisoner.** Everything about the framing says so: smugglers, a tarp, a woman in a shack in a cave. Let them assume it. Let a PC kick the tarp off and start cutting rope that isn't there.
- **She begs them not to.** Not to free her — to *leave her where she is*. Freeing her means putting her back on a Middle Tier street with a name somebody has already been asking about. **[ASK PLAYER]** nothing. There is no check to see through it. She just tells them, fast and quietly, and either they listen or they don't.
- **No stat block, no combat.** She does not fight, does not flee, and cannot be made useful. She is a decision standing in a room.

**What it changes mechanically:**

- **The fight goes partial.** From the moment Iselle speaks, the crew stops trying to win and starts trying to get a boat in the water. The boss's morale clock is effectively already at its last step: `call_it_off` fires on his **very next turn**, whatever his HP. His terms change to *let the boat go and take everything else.*
- **The party can take the whole cargo, for free, right now** — eleven crates, no further fighting, full XP — by standing still for ninety seconds. That is the entire price.
- **Or they can be right.** They can insist on freeing her, walk her up onto the Lower Tier at dawn, and hand her back to a city where somebody has been asking after her by her Imperium name. Nothing happens immediately. Nothing may ever happen. **Do not resolve it in this session, and do not punish it in this session.** It sits there.
- **Or they can take her passage money.** She has 40 gp of it in a purse against her ribs and she will hand it over if it buys the crew's safety. If a party takes it, take it — no lecture, no penalty. Just let the boss watch them do it.

**If the stirges drop while this is happening,** the encounter briefly becomes the best version of itself: a woman who has been quietly terrified for three weeks, four dock-hands, and six adventurers all fighting the same thing at the same time in the dark, and afterwards nobody can quite get back to where the argument was.

**XP is 275 regardless of how much of the fight actually happens.** Award it in full for the boat going out empty-handed and everyone alive.

---

# v3 — Sarn Kestle

**The named antagonist. Same 275 XP, same map, built around one voice.** Use this when Joe wants a person to play instead of a boss to run. Layers cleanly over v1 *or* v2.

## Sarn Kestle

*Owns the two good skiffs. Keeps the tally slate. Forty-six. Heavy through the shoulders, careful with his hands.*

He has been running this stretch of coast for **nineteen years** — since before Tidemark Hold tightened the customs writ, back when what he does was merely unlicensed rather than illegal. He is not a criminal in his own head and the distinction matters to him. He moves good spirit past a desk. He has never hurt anyone in the course of it and he is oddly proud of that, in the way of a man who has had chances.

**He knows Hesta.** By name, for eleven years. She has patched two of his crew and never once written it in a ledger, and he has never once brought her anything that would embarrass her. That relationship is why the writ on the Wayward Compass board says *exact sourcing need not be disclosed* — it is not a coy phrase, it is a nineteen-year-old arrangement being discreet. **If the party says her name, he relaxes.** That should be visible.

**Play him reasonable.** That is the whole design: he is not a coward, not a bluffer, not secretly cruel. He is a middle-aged man with two boats and a crew he is responsible for, doing sums about how this ends, and he will offer the party a genuinely good deal because it is genuinely the best outcome for everyone. **Killing him is worse for having talked to him first.**

**Voice notes for the table:**

- **He puts the chalk down carefully before he stands up**, because he intends to finish the sum later. Open with that. It tells the table everything.
- **He asks questions and waits for the answers.** *"Who sent you."* *"Which apothecary."* *"How much did she say?"* Real questions, not stalling.
- **He is not frightened of the party** and does not pretend to be. He is worried about the tide and about the man on the plank walkway with a lantern, in that order.
- **He never threatens.** He describes consequences flatly and lets the party do the arithmetic themselves. *"There's four of them and one of me and eleven crates. You'll get most of it. I'll lose all of it. Neither of us wants the middle bit."*
- **He calls his crew by name** — Onnet, Bray, little Pell, and Hass on the walkway — and he does it in combat, mid-fight, out loud. When one of them goes down and `wade_in` fires, he says the name.

**Set-piece — the offer.** Any time from before initiative through to his morale step, Sarn calls `call_it_off` and makes the same offer, and it is real:

> *"Right. Stop. — Hesta pays per bottle, so you want bottles, not a fight; a fight costs you bottles. Here's what I'll do. Take all eleven crates. Take the small skiff to move them, bring it back on the ebb or don't, I'll charge her for it. In exchange, you never came down here, and this cave stays a cave. — That's better than what you came for, and you know it is, and I'd rather do it than have Bray's mother in my shop on Tuesday."*

**Resolve it honestly:**

- **Accept:** encounter **over**, **full 275 XP**, and the party leaves with *more* than fighting would have got them. This is the correct answer and it should be visibly, materially rewarded.
- **Refuse:** he goes back to work without rancour and does not offer twice. Legitimate. He fights well and Pack Tactics is live most rounds.
- **Kill him:** allow it, don't editorialise, and let Hesta ask after him by name at the Willowglass three sessions later. *"Sarn didn't come Thursday. He always comes Thursday."* That is the entire consequence and it is enough.
- **Press him on the slate:** the tally lists five deliveries to a Middle Tier address that is **not** the Willowglass. He is not ashamed of it and he will trade the name for the party's silence about the cave, and consider it a bargain. Hesta is not the only apothecary buying, and she knows it.

---

## Loot and payoff (all variants)

**Eleven crates**, six bottles each, Merrowgate spirit in green glass. A party carrying it out by hand at low water manages maybe four crates; a party that gets a skiff manages all of it. Hesta pays **half in healing potions per bottle delivered** — do the sums **per bottle, not per crate**, and let a party that negotiated instead of fighting walk out visibly ahead.

Also in the shacks: **31 gp** in mixed coin, a customs seal that is a fairly good forgery, and Sarn's tally slate. In **v2**, add Iselle's **40 gp** of passage money — if the party takes it.

## NPCs

- **bandit** ×4 — the crew (CR 1/8 each, 25 XP). Dock-hands, not killers. Named in v3: Onnet, Bray, Pell, and Hass.
- **tough** ×1 — the boss (CR 1/2, 100 XP). Unnamed in v1; **Sarn Kestle**, played in full, in v3.
- **stirge** ×3 — the second wave (CR 1/8 each, 25 XP). Not on anyone's side, in any variant.
- **Iselle Marrow** — v2 only. No stat block. Does not fight, does not flee, cannot be made useful.

**XP: 4 × 25 + 100 + 3 × 25 = 275 XP in every variant.**
