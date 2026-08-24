---
created: 2026-05-21
last_modified: 2026-08-09
status: ready
location: ruins-western-scrubland
tags: ["encounter", "ardenhaven", "goblins", "cr-low", "goblin-raiders-scrubland-ruins", "variants"]
---
# Goblin Raiders — Western Scrubland Ruins

> A second goblin warband crept into the cave the last band was driven out of. Bigger, better led, and a tenday settled in.

**Where:** the cave lair beneath the [[ruins-western-scrubland|Western Scrubland Ruins]], ~3 miles SW of Ardenford — the site the party cleared in session 1.
**Tuned for:** 4–6 level-1 PCs. Same map, **400 XP** in every variant — hard for four, solid for five, comfortable for six. Pick one at the table and swap without re-tuning.

| | Variant | What it is | XP |
|---|---|---|---|
| **v1** | [The Second Warband](#v1--the-second-warband) | The straight fight. Kiting archers, a boss who directs, a cave to be dug out of. | 400 |
| **v2** | [Ghask's Word](#v2--ghasks-word) | A named boss who offers terms, means none of it, and knows *exactly* why the party will listen. | 400 |
| **v3** | [The Fifth Goblin](#v3--the-fifth-goblin) | There is a worked stair behind the sheep pen, and something came up it. | 400 |

**Rosters and picker counts:**

- **v1 and v2:** `goblin-raider` **×4** (50 XP each) + `goblin-boss` **×1** (200 XP) = **200 + 200 = 400 XP**.
- **v3:** `goblin-raider` **×3** (150 XP) + `goblin-boss` **×1** (200 XP) + `stirge` **×2** (25 XP each, 50 XP) = **150 + 200 + 50 = 400 XP**.

**v3 is the only variant that changes the picker.** Set `goblin-raider` to **3** and `stirge` to **2**. The fourth raider is not missing by accident in v3 — he is the reason the variant exists.

**Picker note — the stirges in v1 and v2.** The count spinner's minimum is 1, so `stirge` is always listed once the sheet exists in `npcs/`. That is fine and costs nothing: **stirges are never rolled into initiative at the start of a fight in any variant.** They only enter play when the DM calls `drop_from_the_dark`. In **v1 and v2, leave the count at 1 and never call it** — there is something roosting in a crack in the back passage, it does not come down, and a creature that never enters the encounter is worth **0 XP**. The v1/v2 totals below are exact.

**Scaling for six:** put the fourth raider back in any variant → **450 XP**. Do not add a second boss; Redirect Attack stacked twice is unreadable at the table and turns the fight into bookkeeping.

---

## Read this first — this is the party's origin encounter

**They have been here.** In session 1 they came up this slope at sunset for Maren Redwick's sheep, tried to negotiate, failed, and killed a small band of five. At least one goblin surrendered, was allowed to, and then bolted into the dark. The ruins have been empty since.

**A tenday ago a bigger band moved into the cave the last one died in**, and everything in this encounter is built on the party recognising the ground. The fire pit they kicked out. The bones. The sheep-wool caught on the cave wall. The blood stain by the entrance that has nearly faded.

Lead with that. *"You know this place. You know it in the dark."* Then make it not behave the way it did last time.

## Shared: terrain

- **Above ground.** Foundations of a small fitted-stone keep, walls **2–3 ft high** and mostly rubble, in a rectangle roughly 40 × 30 ft. **Half cover** everywhere along a wall line; **three-quarters** behind the standing boulders. Loose stone makes patches of **difficult terrain**, and it is noisy — nobody crosses this ground quietly in armour.
- **The boulders.** Six or seven, some big enough to stand behind. This is the goblins' whole gameplan: **shoot, Nimble Escape behind a rock, shoot again.** The party has to either close the ground under fire or find an angle. Reward the second one.
- **The cave mouth.** A gap under a pile of collapsed stones on the western edge, **3–4 ft high**. A Medium creature must **crouch or crawl** through. It is a choke point in both directions, it takes 10 ft of movement to clear, and a PC halfway through it is a target and knows it. Goblins are Small; they go through at a run. **This asymmetry is the single most important thing on the map.**
- **The main chamber.** Roughly **25 × 20 ft**, ceiling 6–8 ft — low enough that a two-handed swing catches stone. Cold fire pit in the middle (**lit, in v3**). Tool marks on the walls that nobody has ever explained.
- **The back passage and the sheep pen.** A low crawl, **5 ft ceiling**, into a smaller damp chamber the last band used as a pen for stolen sheep. Water seeps through the rear wall. In v1 and v2 this is where survivors run. In v3 nothing goes back there for any money.
- **Light.** Dim outside at dusk, **dark inside**. **Every goblin here has darkvision 60 ft. The party probably does not.** A party that brings a torch into the main chamber has told four archers exactly where to shoot; a party that fights in the dark is fighting at disadvantage against things that aren't. There is no good answer, only a choice, and making the players make it is most of the fun.

## Shared: how they fight

- **They never stand and trade.** `shortbow` from cover, `nimble_escape` as a bonus action every single turn — Disengage or Hide, no exceptions, use it every round. If a raider is ever standing in the open on its own turn, you played it wrong.
- **They gang up.** Two goblins adjacent to one PC means Advantage for both, and Advantage is **+1d4 damage** on the hit. Call it out loud when it happens.
- **The boss does not fight if it can direct instead.** `shortbow_volley` from the back, two shots, on whoever looks most dangerous. It closes to `multiattack` only when it has a safe target or its raiders are gone.
- **`redirect_attack` is the boss's signature and it should feel horrible.** Once per round, when the boss is hit and a raider is within 5 ft, they swap places and the raider takes it. Spend it freely and *narrate the raider*, not the boss. The party will start trying to catch him alone. Good — that is the fight.
- **Cowardice is mechanical, not flavour.** A raider below 5 HP, or once the boss drops, or once half the band is down: Disengage and Dash, and it is gone. **Do not chase them into the scrub at dusk.** Award their XP anyway.

## Shared: the parley problem

**In every variant, somebody here will offer to talk.** That is the defining feature of this encounter and it is the second time the party has faced it on this exact ground.

- **v1:** the boss parleys if the fight turns, and lies. One line, no ceremony. Enough.
- **v2:** the whole variant.
- **v3:** the boss parleys *honestly*, because he wants to be somewhere else more than he wants the cave.

**Full XP for any resolution.** A party that ends this without a fifth round still gets 400. Say so at the table — twice, if it's a new group. The campaign is teaching them that talking is a real option that sometimes gets them robbed, not that talking is a trap.

---

## v1 — The Second Warband

**4 raiders + 1 boss — 400 XP.** The straight fight. Use this when the party wants to know whether they've got better since session 1, and the answer should be *yes, and the goblins got better too.*

**How it opens.** A lookout on the rubble spots them unless they beat its passive Perception (9 — it is not hard, but somebody has to think of it). Then the band sets up in the twenty seconds it takes the party to cross the open ground: raiders to the boulders with shortbows, boss hanging back and barking.

**How it plays.** Raiders kite — shoot, Nimble Escape behind cover, repeat — and the party burns two or three rounds crossing rocky ground under fire before anyone gets to hit anything. The boss feeds raiders into incoming blows with Redirect Attack. Once the boss drops or half the band is down, survivors break for the back chamber and scatter into the scrub.

**The parley, in one line.** If the fight turns, the boss shouts an offer — the sheep, the loot, information, whatever the party looks like they want. **It is a lie and it is unrehearsed.** He bolts the instant they lower their guard. Don't build anything on it here; that's what v2 is for.

**What it teaches.** Cover is a resource, a choke point cuts both ways, and darkvision is a real advantage rather than a line on a stat block. A party that charges the cave mouth in a line finds out what a 3-ft-high hole does to a marching order.

---

## v2 — Ghask's Word

**4 raiders + 1 boss — 400 XP. Identical roster, identical statblocks.** Use this when the best thing in the encounter should get the whole session. Everything in v1 still runs; the difference is that the boss has a name, a voice, and a plan he worked out in advance.

### Ghask

*Scar-faced, a head taller than his band, chain shirt that fits him badly and a shield he keeps between himself and everything. Speaks Common well — he learned it being sold, twice.*

**He is a salesman.** That is the whole character. He does not threaten, does not posture, does not do goblin-villain rasping. He is warm, quick, and interested in you. He counts things out on his fingers while he offers them. He calls people *friend* and he repeats their own words back to them slightly wrong, which is oddly disarming. **Play him likeable.** The variant does not work if the table can hear the trap in his voice.

**What he actually is:** a competent middle manager with four expendable subordinates who has correctly worked out that talking costs him nothing and buys him position.

### Nit — the goblin who got away

**One ear. Small even for a goblin. He is raider #4 — no extra stat block, no extra XP, just a name on one of the four.**

**Nit was here in session 1.** He is the one who surrendered, was allowed to, and ran. He walked four days north, found a bigger band, and came back with them — and the thing he brought that made him valuable was not the location of a cave.

**It was the information that these particular humans accept surrenders.**

That is the engine of the whole variant. **Ghask's lie is researched.** He is not chancing it. He has been told, by a witness, that this specific party will stop fighting if you ask them nicely, and he has built his opening move on it.

*(If your session 1 didn't leave a survivor: Nit is a goblin from the next valley who heard the story secondhand. Nothing below changes.)*

### The offer

Ghask calls it at the top of **round 2** — not when he's losing, *before* he's losing, while he still looks generous rather than desperate. He steps up onto a wall stub in plain view with his shield down and his hands out:

> "Stop! Stop, stop, stop. — Friend. *Friend.* Nobody has died yet and I would like to keep it that way, and I think you would too. Yes? Yes. — So. **The sheep**, you can have, they are not even good sheep. **The cave**, you can have, we go north, we do not come back, I give you my word on it. And I give you one thing more, for free, because I am *generous*: there is a band two days north of here, forty of them, and they are coming this way in the spring, and I will tell you the road they will use. — Put the steel away and I will draw it in the dirt for you."

And then, over his shoulder, at exactly the right moment, with a shrug:

> "You let one of mine go, before. Nit. Little one, one ear. He is here — Nit! Show them. — He says you are the reasonable ones. I am counting on him being right about that, and if he is wrong I have made a very stupid mistake, haven't I."

### What he is actually doing

**Every word of the offer is a positioning move.** While he talks:

- **The raiders do not stand down.** Each one uses its turn to `nimble_escape` — Hide, reposition, take a flanking angle, get behind the boulder that covers the party's back rank. **They do not attack during the parley.** They just get better.
- **Ghask moves back.** Ten or fifteen feet a round, casually, still talking, until he is at 60 ft with a boulder at his shoulder and a clear run to the scrub.
- **He is steering them toward the cave mouth.** "Come, come, look, it is all in there, take it —" A party that walks into a 3-ft-high hole one at a time while four archers are behind them in the dark has lost the encounter without a single roll.

**The betrayal fires** at the end of the second full round of talking, or the instant a PC sheathes a weapon, hands anything over, or puts their head into the cave mouth — whichever comes first.

**When it fires:** every hidden raider looses at once. **The first volley only — one shot each with Advantage** (they are hidden, the targets are unaware), then it is a normal fight from bad ground. Ghask does not shoot on the betrayal round. He Disengages, Dashes, and starts shouting again from 90 ft, and he is genuinely delighted.

> "*Ha!* — No, no, that was real, all of it, I meant every word, I only meant it *later*—"

**Do not roll Advantage on more than the first shot.** Four shortbows at Advantage is 4×(1d6+2) with rerolls into a party that has its weapons down; one round of that is a lesson, two rounds of it is a dead PC and a table that never trusts an NPC again.

### The tells — three free, one rolled

**The lie must be catchable, or this is a gotcha and the table is right to be annoyed.** There are four ways out and three of them cost nothing:

1. **Nobody is standing down.** Ghask is talking; his raiders are *moving*. Any PC who says "I'm watching the rocks, not him" sees it immediately, no roll. Describe the movement whether or not they ask — twice, in the middle of his own sentences.
2. **He offers the sheep but never says where they are.** The sheep are the one thing he would actually have to hand over, and he never once points at the back chamber.
3. **Nit is not enjoying this.** He is the only goblin not repositioning. He is standing still, half behind a rock, watching the party's faces, and he looks **ill**.
4. **[ASK PLAYER] DC 13 Insight:** he means none of it. Not "he might be lying" — he is not planning to keep one single clause.

### Nit is the way in — the best outcome in the encounter

**If the party talks to Nit instead of Ghask** — recognises him, uses his name, references what happened last time, or just addresses him directly — the lie can come apart from the inside, and this is the version worth building a session around.

Nit genuinely believes these humans let goblins surrender, **because they did.** Ghask told him that made them stupid and useful. Nit has spent four days not being sure that's the same thing, and being spoken to directly in front of everyone is more than he can carry.

- **He breaks.** Not heroically. He says one word — *"—no"* — and steps sideways out of his firing lane, which is a small and enormous thing to do in front of Ghask.
- **Mechanically:** the ambush volley loses one shooter and loses its surprise. No shot gets Advantage. Ghask has to actually fight the fight he was avoiding.
- **Nit will not fight his own band**, and shouldn't have to. He goes over the rubble and away, and the party has now let the same goblin go twice, and that is a bit of campaign continuity worth more than the loot.

### If they accept in good faith

**They should not be punished for it beyond the cost of the round.** They take one volley from bad ground, they lose whatever they handed over, and the fight is still very winnable — the goblins have not gained hit points, only angles.

**And then be scrupulous about the aftermath**, because this is where the variant earns itself:

- **Ghask does not lie about what he knows.** Only about what he will do. **The band two days north is real, forty is roughly right, and the road is real** — and once he is beaten and cornered he will trade it, honestly, immediately, for his life, and honour that one because it costs him nothing. *That* is the character: his information is good and his promises are worthless, and a party that learns to tell those apart has learned the most useful thing in this campaign.
- **If Ghask escapes** — and he will try; he is at 60 ft with a Disengage every turn — he goes north, and he is somebody's lieutenant in the spring, and he remembers everyone's face. Leave it a hook. Do not cash it at level 1.
- **Do not have an NPC lecture them.** No barkeep wisdom, no "you should have known." They were lied to by a professional who did his homework. That's all.

---

## v3 — The Fifth Goblin

**3 raiders + 1 boss + 2 stirges — 150 + 200 + 50 = 400 XP.** Use this when the seeded question in the [[ruins-western-scrubland|location file]] — *does the cave system extend deeper?* — should finally get an answer, and the answer should be small, cold, and level-1 safe.

**There were five. There are four.** And the fire pit in the main chamber is **lit**, and has been lit for four nights, and **goblins have darkvision and do not need fire.**

That is the entire tell, and it is sitting in the middle of the room.

### What the goblins found

The back chamber is the old sheep pen, and its rear wall seeps. A tenday ago the band dug at the seep — partly to drain it, mostly because goblins dig at things — and came through into **fitted stone**. The same mortarless masonry as the ruin above, three courses of it pulled out, and behind the gap:

**A stair. Cut, not natural. Going down.**

Cold air comes up it, steadily, which means it opens somewhere else. There is a rope tied off at the top, and it goes down thirty feet, and it is still taut, and there is nothing on the end of it but a boot.

**The fifth goblin went down four nights ago.** Nobody has been back for the rope.

### What came up

**Two stirges** (CR 1/8, 25 XP each), roosting in the crack above the back passage where the warm air from the fire pit collects. They came up out of the stair on the second night and they have been feeding on whatever holds still. They took the band's last sheep. They have had a go at two of the goblins.

**They are not the goblins' pets and the goblins cannot control them.** Run them exactly as they are run in the [[world/factions/ardenhaven/locations/harbour-undercave/_overview|harbour undercave]] — see [`npcs/stirge.md`](npcs/stirge.md):

- **Do not roll them into initiative at the start.** They come down mid-fight: the moment the fight reaches the back passage, or the first real shout inside the cave, or the instant the fire pit is knocked over or goes out. `drop_from_the_dark`, one Stealth roll of **1d20+3** for the pair against passive Perceptions, then slot them into the order.
- **Nearest warm body, whoever it belongs to.** A stirge landing on a goblin is the best beat in the variant. Play it. For one round everybody in the cave has the same problem, and it is very hard to go back to shooting each other afterwards.
- **`proboscis` at +5, attaches, then 2d4 necrotic automatically at the start of each of its turns** with no roll and no save until somebody spends an **action** to pull it off. Two turns of that drops a level-1 caster. **The 25-XP creature is the one that kills somebody here.**
- **They leave on their own.** Gorged (two drains) → back up to the crack, gone. Damaged → circles and re-picks. Killing them is optional.

### What it changes about the fight

- **Nothing retreats into the cave.** In v1, broken goblins run for the back chamber. **In v3 they will not go in there for any money** — survivors break *outward*, over the rubble and into the open scrubland at dusk, which flips the endgame entirely: the fight ends outside, in the open, where the party's bows work and Nimble Escape has nowhere to hide.
- **The fire pit is a hostage.** It is lit, it is the only reason the stirges have stayed up in the crack instead of coming down every night, and it is directly in the middle of the room. Any AoE, any shove, any dropped torch, any goblin thrown into it — the fire goes out, and the stirges come down **now**. A party that works this out has a weapon. So does a boss who is losing.
- **The boss will parley, and in this variant he means it.** He wants out of this cave more than he wants the cave. His terms are flat and honest and slightly desperate: *the sheep are gone, the loot is yours, the hole in the back wall is yours, we walk north, and you do not follow us because we are not going to be anywhere near here.* **Take it or don't — but he is telling the truth**, and a party that ran v2 last time and refuses on principle should get to find that out. (If you want Ghask in this variant, he works fine, and *"I do not lie about what I know"* is exactly what he'd say. It would even be true.)

### The stair — do not run it this session

**This is a door, not a dungeon.** The party can look. Looking is the reward. There is nothing down there that fights at level 1, because there is nothing down there this session at all.

Give them exactly three things at the bottom of the rope and then get them back up it:

1. **A landing, thirty feet down**, cut square, with a threshold stone across the passage beyond it carved with the same weather-worn marks as the walls above. Beyond the threshold the passage is **choked with fallen stone** — old, settled, and going nowhere without a week and a mason.
2. **Moving air**, coming from somewhere past the fall. **It opens somewhere else.** That is the hook, and it is enough.
3. **The fifth goblin's gear**, at the foot of the stair. No goblin. His knife, his belt, and — in a fold of his shirt where he put it because he knew what he had — **a palm-sized disc of grey metal, smooth, unmarked, faintly and persistently warm.** No aura a level-1 party can read. Nobody in this party can tell them a thing about it.

That disc goes to [[silverbridge-arcana|Silverbridge Arcana]] for appraisal, and the appraisal is a session hook, and that is the correct payoff for a cleared goblin cave in a campaign about going underground for a living. **Do not give it a mechanical effect at level 1.**

**And do not answer what happened to the fifth goblin.** Not this session, not with a monster, not with a body. He is not down there and he is not up here. Leave it.

---

## Loot and aftermath (all variants)

The band has been here a tenday and has been busy:

- **41 sp and 9 gp** in mixed coin, scattered and stuffed into crevices — no hoard, no chest.
- **Three sheep alive in the back pen** (v1 and v2), Redwick-marked. Returning them is worth Maren's gratitude and very little coin, and gratitude from a farmer who already vouched for the party once is worth having. **In v3 the sheep are gone** and the pen is empty and there is a stain.
- **Stolen gear:** a lantern, two sacks of milled flour, a decent hand-axe, a woman's shawl nobody will claim.
- **The boss's scimitar** is a real weapon and worth 15 gp; his chain shirt fits nobody in the party and he knows it.
- **v3 only:** the grey disc from the foot of the stair. Unappraised. Unexplained.

**Whatever happens, the ruins are empty again** — for the second time, in three months, and everybody in Ardenford now knows this specific hole in the ground keeps getting refilled. A farmer, a scholar, or a delving crew with more money than the party is going to take an interest in that cave. Especially if there is a stair in it.

## NPCs

- **goblin-raider** ×4 (×3 in v3) — the warband (CR 1/4 each, 50 XP). Kiters, not brawlers. **Nit** is one of the four in v2.
- **goblin-boss** ×1 — the leader (CR 1, 200 XP). Unnamed in v1 and v3; **Ghask**, played in full, in v2.
- **stirge** ×2 — **v3 only** (CR 1/8 each, 25 XP). Not on anybody's side. In v1 and v2 leave the picker at 1 and never bring it down; it is not in the encounter and it is not in the budget.

**XP: 4 × 50 + 200 = 400** (v1, v2) · **3 × 50 + 200 + 2 × 25 = 400** (v3).
