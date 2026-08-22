---
title: "Twenty-One — the social map"
created: 2026-08-15
last_modified: 2026-08-16
status: active
tags: [oneshot, space-journey, twenty-one, npcs, relationships, placement, pcs]
---

# Twenty-One — the social map

Who knows who, how well, and **how close their tokens should stand.** Companion to
[twenty-one-background-cast.md](twenty-one-background-cast.md) (who they are) and
[space-journey-story-outline.md](space-journey-story-outline.md) (where they are).

> **Why this exists.** A crowd of unrelated named tokens reads as a list. A crowd where six people
> are standing in three pairs and one man is standing on his own reads as a **town**. This file
> turns "these people know each other" into a number, and the number into a placement rule.

---

## 1. The notation

```
A ──type:strength── B        a tie
A ──type:strength⚡── B       a tie with friction — real, and difficult
A ──×type:strength── B       antagonism — the strength is how much they mind
```

### Strength — how tight

| | Name | Means | **Placement rule** |
|---|---|---|---|
| **5** | **Bound** | Cannot be meaningfully separated. Same house, same gang, same bed | **Always adjacent.** They arrive together and leave together |
| **4** | **Close** | Chosen, not inherited. Will cross a room, take a risk, tell the truth | **Within 2 squares** |
| **3** | **Working** | Daily and functional. Same trade, same crew, same shift | **Within 5 squares while working.** Anywhere off-shift |
| **2** | **Familiar** | Knows the name, would nod, would gossip about them | Same scene. **No proximity rule** |
| **1** | **Aware** | Knows *of* them. Would recognise the face and keep walking | **No rule at all** |

### Type — what kind

`kin` blood · `wed` marriage · `crew` gang or unit · `trade` professional · `faith` religious ·
`debt` money owed · `bond` friendship · `love` romantic · `patron` money-and-status ·
`rival` competition · `secret` a shared thing nobody else knows

### Friction and antagonism

- **⚡** — the tie is real *and* strained. Brothers who don't speak are still `kin:4⚡`. Strength
  measures **how much they matter to each other**, not how much they like each other.
- **×** — actively against. `×rival:4` is a feud that shapes both their days; `×rival:1` is mild
  contempt. **Placement rule inverts: never adjacent** unless the scene is *about* the fight.

### Degrees of separation

Count hops along ties of **strength 2 or better**. A `1` is too thin to carry anything — it does not
connect the graph.

> *Widow Cress → Brother Aldous (faith:4) → the Executioner (faith:3) → Pate (trade:3) → Josy.*
> **Cress is 4 removed from Josy.** They live in the same small town and have never spoken.

**Why you care:** it tells you how fast a rumour crosses a room, who can vouch for whom, and — in
Scene 3 — **how many honest conversations it takes to reach the person who can cool a mob.**

---

## 2. The clusters

Seven groups. **They are not equal sizes and they are not meant to be** — a real town has a big
knot of dockers, a couple of tight pairs, and several people standing on their own.

### A — The waterfront
`Foreman Dagget` · `Maud Kettlin` · `Skipper Rojan` · `One-legged Tobb` · `Ansa Pike`

The biggest working knot. Dagget's crew moves as a body; the others orbit it.

### B — The Dragonsfall taproom
`Old Cobb` · `Sela Bratch` · `Dolen Petch` · `Harl Wetherby` · `Lark` · `Wat Harrow` · `Nessa Wetherby`

**The house has staff now** (added 2026-08-16 for Scene 5): `Wat Harrow`, potman of eleven years,
and `Nessa Wetherby`, Harl's niece, who serves the tables. Both are in the module with full edges.

A room, not a group. Most of these people are alone *near* each other, which is the point of a bar.

### C — Gallows hill
`Widow Cress` · `Hanne` · `Brother Aldous` · `Pate` · `Josy` · `Magistrate Corben Vale` ·
`the Executioner`

Two tight pairs and a lot of people who show up at dawn out of habit.

> **The hanging scene is cut (2026-08-16); the neighbourhood is not.** Gallows hill is the top of
> Fairfield (§7), so these are the party's own townspeople — **Cress, Hanne, Pate and Josy all play
> in Scene 3**, where they do more work than they ever did on a scaffold, and Aldous plays in Scene 4
> at the Dragonsfall. **Vale and the Executioner never appear on screen.** Vale is no longer one of
> Oz's hosts; he survives only as the name on Latch's writ-box and the reason §7e's blanks are
> interesting. **Alderman Hobbe Grove is cut outright** — he existed solely as Vale's rival, and half
> a feud between two off-screen men is nothing.

### D — The market and the carters
`Big Ned` · `Little Ned` †

**A cluster of one, and a grave.** See §5.

### E — The opera company and the boxes
`Maestro Brellin` · `Vasca Orrin` · `Piet` · `Dowager Iselle Marchmain` · `Old Semm` ·
`Guard-Lieutenant Rees` · `Scribe Ellisane`

A workplace, so a hierarchy: everyone is tied *upward* and almost nobody sideways.

### F — The undercity saloon
`Nols` · `Fenna` · `Grigor` · `Halloran` · `Jonet Vairling` · `Sette` · `Marn Hollis`

### G — The travelling four *(connectors, not a cluster)*
`Colm Bracken` · `Edmun Latch` · `Marn Hollis` · `Lark`

**These four are the only reason the graph is connected at all.** They move between towns, so they
carry ties across cluster boundaries. Lark is the hub — assume `aware:1` from her to almost anyone,
and `familiar:2` to anyone who drinks.

---

## 3. The ties

### A — Waterfront

| | | | |
|---|---|---|---|
| Foreman Dagget | `crew:3⚡` | Maud Kettlin | She's on his quay and he cannot control her. He needs her and she is his biggest problem |
| Foreman Dagget | `trade:3` | Skipper Rojan | Cargo goes from one to the other every week |
| Ansa Pike | `wed:5` | **Tam Pike** † *(missing)* | Crews for Vess Marlowe. Overdue. **She does not know yet** |
| Ansa Pike | `kin:4` | Maud Kettlin | **Maud is her aunt.** This is why Maud is at the front of every surge — her niece's husband is missing and nobody official is looking |
| Skipper Rojan | `trade:2` | One-legged Tobb | Rojan tips him for sightlines |
| Ansa Pike | `familiar:2` | Skipper Rojan | He knows which boats are late |

### B — Taproom

| | | | |
|---|---|---|---|
| Old Cobb | `trade:3` | Harl Wetherby | Same chair, eleven years. **Cobb is the one who notices Harl has been wrong for nine days** |
| Old Cobb | `kin:4⚡` | One-legged Tobb | **Brothers. They have not spoken in nine years.** Tobb lost the leg on Cobb's ferry. Cobb drinks on this side of the river and Tobb begs on the other |
| Sela Bratch | `×debt:3` | Dolen Petch | He owes her and she is being patient about it in a way he finds threatening |
| Sela Bratch | `secret:2` | Harl Wetherby | He knows she's in room 3 and hasn't said so |
| Dolen Petch | `trade:2` | Maud Kettlin | He sharpens her gutting knives |
| **Wat Harrow** | `trade:4` | Harl Wetherby | Eleven years behind this bar and never once in front of it. In Scene 5 his guv'nor is on a bench and he is pouring, badly, and will not stop |
| **Nessa Wetherby** | `kin:5` | Harl Wetherby | **His brother's girl**, taken in and given a trade. **Always adjacent** — in Scene 5 that reads as her drifting back to his bench between tables |
| Wat Harrow | `trade:3` | Nessa Wetherby | He has watched her grow up across three feet of oak and cannot say so |
| Wat Harrow | `trade:3` | Old Cobb | Eleven years, same seat, same drink, same three words |
| Wat Harrow | `trade:2` | Nols | Two publicans, one town. Neither drinks in the other's house |
| Nessa Wetherby | `bond:2` | Josy | Feeds her out the back and pretends not to. Josy has never had to ask |
| Lark | `familiar:2` | *everyone in the room* | |

### C — The hanging town

| | | | |
|---|---|---|---|
| Widow Cress | `kin:5` | Hanne | **Granddaughter.** The man on the approach road is Hanne's father. **This is why a sixteen-year-old is the levy drummer at the hangings and why she hates it** |
| Widow Cress | `faith:4` | Brother Aldous | He said the rites over her son. She comes every dawn; he is the only person there who speaks to her |
| Brother Aldous | `faith:3` | the Executioner | They work the same dawn, and they are the only two who talk to each other. Nobody else talks to either of them |
| Pate | `trade:3` | the Executioner | Sells the rope. Complains about the price of hemp |
| Pate | `trade:2⚡` | Josy | She lifts from his stall and he lets her, and neither of them will admit that's what's happening |
| Josy | `bond:3` | Hanne | Two kids at the same terrible job. Josy is the only person who makes Hanne laugh |
| Edmun Latch | `trade:3` | Magistrate Corben Vale | Carries the writ-box. Works for whoever's in charge. **Both off screen** — this edge exists so Latch has an employer to be disillusioned with |
| Colm Bracken | `crew:3` | *the Fairfield watch* | Same uniform, different pension. The four men losing the square with him in Scene 3 |

### D — The market

| | | | |
|---|---|---|---|
| **Big Ned** | `kin:5` | **Little Ned** † | Brothers. **Little Ned was little because there was a big one.** Killed by the party on the road, Scene 2 |
| Big Ned | `trade:3` | Skipper Rojan | A carter and a barge captain move the same goods |
| Big Ned | `trade:2` | Pate | Both men work squares for a living |

### E — Opera and boxes

| | | | |
|---|---|---|---|
| Maestro Brellin | `trade:4` | **Vasca Orrin** | **His manager and his handler.** She books the house, pays the company, and keeps him out of trouble. He is a great conductor and cannot be left alone with a decision |
| Vasca Orrin | `trade:3` | Piet | She hired him and she knows his name, which Brellin does not |
| Maestro Brellin | `trade:3⚡` | Piet | Piet worships him. Brellin has called him "the understudy" for two seasons |
| Dowager Iselle Marchmain | `patron:3` | Maestro Brellin | She funds the season and expects to be consulted about it |
| Dowager Iselle Marchmain | `×rival:2` | Jonet Vairling | New money, badly worn. Marchmain enjoys saying so |
| Old Semm | `trade:2` | Guard-Lieutenant Rees | The two professionals in the building who take the job seriously |
| Scribe Ellisane | `trade:3` | Edmun Latch | Paper people. They recognise each other's hand |
| Guard-Lieutenant Rees | `trade:3` | Colm Bracken | Two honest soldiers who have never served together and know each other on sight anyway |

### F — Saloon and undercity

| | | | |
|---|---|---|---|
| Nols | `trade:3` | Fenna | He lets her run the crooked game and takes a cut |
| Grigor | `bond:4` | Halloran | Drink together most nights. Both tower men — one still employed, one dismissed for talking |
| Halloran | `×rival:2` | Guard-Lieutenant Rees | She countersigned his dismissal. He has never blamed her out loud |
| Fenna | `trade:2` | Sette | She pays for the right to work the room |
| Sette | `crew:4` | Marn Hollis | Current contract. **Ends the day the fee stops covering it** |
| Jonet Vairling | `familiar:1` | Nols | She's been in twice and thinks that makes her a regular |

---

## 3b. Widow Cress — the load-bearing bystander

**Her son was hanged, and her peace depends on that having been just.** She goes every dawn and
stands under him. The only way to survive it is to believe the law was right — because the
alternative is that the world took her boy for nothing.

Everything she does follows from that one need:

| Situation | Her position | Why |
|---|---|---|
| **Seven bandits killed on the road** | **Approves.** | Criminals die. That is the order of things and she needs the order of things to hold |
| **Scene 3 — the lynching in the market square** | **Loudest voice against it.** | A mob is not a court. If a mob is as good as a court, her son died for nothing at all |
| **Anything with a writ on it** | **Silent. She watches.** | A magistrate and a signature she cannot object to without unmaking herself. Kept here as a character note — the scene it belonged to is cut |

**She is the strongest single lever in Scene 3** — worth two steps of Mob Temperature on her own, and
she is not moved by pity, coin or persuasion. She is defending the only thing holding her together,
and the party get her for free if they simply let her speak.

**Big Ned cannot answer her.** They are both grieving a killed relative, and only one of them is
asking for a trial. Put those two tokens in sight of each other and say nothing.

> **Her arc is one scene now, and it ends well.** The old Scene 4 existed to take her away again —
> the woman who saved them in the square standing silent in a gallows crowd, so the escalation from
> *a crowd* to *the law* cost them an ally rather than hit points. That scene is cut, so **let Scene 3
> be her whole story**: she speaks, the square listens, and the party leave owing her. Don't try to
> re-home the betrayal beat somewhere else — it only worked because it was the very next scene.

---

## 4. Who does **not** clump

**As important as the ties.** If everyone pairs off, the crowd reads as arranged. These people stand
alone, and their aloneness is characterisation.

| | Ties | Why they're alone |
|---|---|---|
| **One-legged Tobb** | 1 strong (estranged), 2 weak | Best sightlines in the port because he is always sitting still, by himself, watching |
| **Old Semm** | 1 weak | The Castellan's food-taster. Treated as furniture by everyone above him and avoided by everyone below |
| **Widow Cress** | 2 | Comes every dawn, alone, stands in the same place. Her isolation is the point — see §3b |
| **Halloran** | 1 friend, 1 enemy | Dismissed for talking about the undervaults. People stopped sitting with him |
| **Big Ned** | **1 — and it's a corpse** | See below |

**Placement reflex:** for every three pairs you put down, put one person on their own with clear
space around them. Empty squares are a relationship too.

---

## 5. Big Ned is the loneliest node on the map, and that is the scene

His entire graph is one `kin:5` edge to a man the party killed four hours ago.

That is *why he works as a host.* Oz cannot make anyone lie; he needs someone whose true words do the
damage. He needs a man with a real grievance, no one to talk him down, and nothing left to lose —
and the social map says there is exactly one of those in the region.

It also sets the party's actual problem in Scene 3. **They cannot reach him through anybody**, because
there is no anybody. Every other person in that square can be talked to sideways, through a cousin or
a foreman or a priest. Big Ned can only be talked to directly, and everything he says is true.

---

## 6. Using it at the table

**Placing a crowd:**
1. Drop the `5`s first, as touching pairs. They are non-negotiable.
2. Drop the `4`s within two squares of their partner.
3. Scatter the `3`s loosely near their working cluster.
4. Put the `2`s and `1`s anywhere they fit.
5. **Then take one or two people back out of the crowd and stand them on their own.**
6. Check the `×` pairs are not adjacent — unless you want that to be the story.

**Running a rumour:** it travels one hop per scene along ties of 3+, instantly along 4s and 5s, and
Lark short-circuits the whole thing for money.

**Scene 3, Mob Temperature:** the ladder drops one step per named villager talked to honestly. The
degrees table is your cheat sheet for *who is worth talking to* — turn `Foreman Dagget` and you get
his crew, because they're all `crew:3` to him. Turn `Old Semm` and you get Old Semm.

---

## 7. The two PCs — Fairfield's own

**Added 2026-08-16.** Ballad Quinn and Pip Locksley are no longer strangers who walk in off the
road. They grew up here. The Computor wrote them a hometown, and every NPC in it believes the
history — which is exactly as true as everything else in the program, and needs no explaining at
the table.

**Fairfield** is a river town that thinks of itself as a city: docks at the bottom, the market
square in the middle, gallows hill above it, one opera house too grand for the place that built
it, and a saloon under the streets where the town keeps what it won't say in the square.

> **Ballad** has been busking here since she was eight and shadowed a circuit bard at fourteen.
> Her web is wide, warm, and shallower than she'd admit: half the town loves her and she can't
> always remember which half.
>
> **Pip** grew up two doors away and learned locks instead of chords. His web is short, priced and
> mostly silent — people who owe him, people he owes, and two decade-long kindnesses he has never
> once mentioned.

**The skill sheets are the design rule.** Ballad has Expertise in being seen and being liked
(Performance +11, Persuasion +11), so *everyone* knows her and the town's opinion leans warm. Pip
has Expertise in not being seen (Stealth +11) and no Persuasion, no Performance, no Intimidation —
so he has a third as many ties, they skew underworld, and they are transactional rather than
charming. Where Ballad left people feeling good, Pip left people owing, owed or wary.

**All of this lives in the module, not just here.** 34 edges, written both directions with a
separate note per side — the PC's row is what the player remembers, the NPC's row is written in
the NPC's voice and **ends with how they behave toward that PC today**, so hovering the NPC mid-scene
tells you how to play them. See [`context/plans/foundry-npc-ties.md`](../context/plans/foundry-npc-ties.md).

### 7a. The Neds — the spine of it

**Big Ned and Little Ned's mother raised half the market's children off the back of her cart, and
two of them were Ballad and Pip.** Ballad rode that cart to her first three paid shows; when Mother
Ned died three years ago she sang her into the ground and refused the coin. His family's word for
her — his *mother's* word — is **songbird**.

**Little Ned was Pip's shadow.** They learned to pick on the same brass practice padlock, Pip's
then Ned's, handed down like an heirloom of the wrong trade. Two winters ago Pip quietly paid off
Ned's debt to keep him clear of the road crews and told him flat: *you're not built for it.* Ned
went to Rennick anyway — partly, Pip suspects, to prove that sentence wrong. **Pip never met
Rennick; the money went through Ned.**

**Big Ned knows nothing of the paid debt.** What he knows is arithmetic: his little brother started
coming home late the same year he started running with Locksley. Last spring he caught Ned in the
cart-till and threw him out of the yard. His grief in Scene 3 is guilt wearing a mob for a coat.

> **So Scene 3 stops being xenophobia and becomes betrayal.** When Big Ned stands on the well and
> names the killers, he is naming his mother's songbird and the halfling he already blamed. The
> outline currently calls the party *"these seven strangers"* (line 208) — **that line now needs
> rewriting**, and the replacement is stronger.

**The levers — true things only a neighbour could say. Powerful, not automatic. GM-side only; these
are deliberately *not* in the tie notes:**

- **Pip's.** *Look in his coat before you hang anyone. Brass padlock, three pins, filed key-way —
  mine, then his. I paid his debt two winters back to keep him off that road, and he went anyway.
  So did you send him there when you threw him out — or did I — or did he just go?* This is a knife
  with no handle: it proves Pip a neighbour and confirms him a criminal in one breath, and names
  Big Ned's secret guilt in front of the square. It can break him open or detonate him.
- **Ballad's.** She can name the wake, the song, the grave, and what Mother Ned used to say —
  *"Ned'll follow the wrong cart out of town one day."* She can't argue him out of grief, but she
  can make the square remember it is watching a grieving man and not a judge.

**Big Ned's `songbird` +2 cannot cool the mob, because Oz is driving.** Played right that is the
scene's heartbreak, not a lever.

### 7b. Ballad — 23 ties

Stance columns are directional: **B→** is Ballad's stance toward them, **→B** is theirs toward her.

| NPC | B is their… | B→ | They are her… | →B | Str |
|---|---|---|:--:|---|:--:|---|
| Big Ned | songbird | +2 | carter | +2 | 4 |
| Foreman Dagget | worksong | +1 | crew | +1 | 3 |
| Maud Kettlin | rival | +1 | lungs | +1 | 3 |
| Harl Wetherby | draw | +1 | landlord | +1 | 3 |
| Isbet "Lark" Marrow | echo | 0 | teacher | +2 | 3 |
| Hanne | tuner | +1 | drummer | +1 | 3 |
| Vasca Orrin | risk | +1 | door | −1 | 3 |
| Piet | prompter | +1 | understudy | +2 | 3 |
| Halloran | company | +1 | veteran | +2 | 3 |
| Colm Bracken | verse | +1 | escort | +1 | 3 |
| Edmun Latch | keeper | 0 | leak | −1 | 3 |
| One-legged Tobb | Thursdays | +1 | listener | +1 | 2 |
| Old Cobb | discovery | 0 | regular | +1 | 2 |
| Brother Aldous | descant | +1 | chaplain | +1 | 2 |
| Josy | payday | +1 | truce | +1 | 2 |
| Dowager Marchmain | diversion | −1 | patroness | +1 | 2 |
| Nols | act | +1 | first stage | 0 | 2 |
| Jonet Vairling | idol | 0 | admirer | +2 | 2 |
| Ambrose Fell | competition | +1 | competition | +1 | 2 |
| **Dolen Petch** | slander | 0 | **punchline** | **−2** | 2 |
| Nessa Wetherby | understudy | +1 | **the reason** | **+2** | 3 |
| Wat Harrow | stagehand | +1 | overtime | 0 | 3 |
| **Widow Cress** | doubt | 0 | **reproach** | **−2** | 2 |

**Her two enemies are both her own fault, and both are songs.** "The Grindstone Song" answered a
heckle and cost Dolen Petch his custom. **"The Crooked Writ"** questioned the evidence at the Cress
boy's hanging — she meant it kindly, and it took from Widow Cress the only thing holding her
together (see §3b). **Cress stays unreachable by Ballad**, which is correct: the strongest lever in
Scene 3 must not be purchasable with Persuasion +11.

**But Hanne is Cress's granddaughter** (`kin:5`), and Hanne likes her. That backdoor is deliberate.
Decide in advance what it costs.

### 7c. Pip — 14 ties

| NPC | Pip is their… | P→ | They are his… | →P | Str |
|---|---|:--:|---|:--:|---|
| Little Ned | example | +2 | shadow | +2 | 4 |
| One-legged Tobb | breakfast | +1 | eyes | +2 | 4 |
| Josy | teacher | +1 | runner | +2 | 3 |
| Foreman Dagget | night-freight | +1 | gangway | +1 | 3 |
| Colm Bracken | unfiled | +1 | one warning | 0 | 3 |
| Nols | customer | 0 | drop | 0 | 3 |
| Big Ned | bad company | +1 | **reproach** | **−1** | 3 |
| Old Semm | stowaway | +1 | latch | +1 | 2 |
| Fenna | spotter | 0 | dealer | 0 | 2 |
| Skipper Rojan | cargo | 0 | exit | 0 | 2 |
| **Sela Bratch** | creditor | **−1** | debtor | **−1** | 2 |
| Nessa Wetherby | clean look | +1 | a regular | +1 | 2 |
| Wat Harrow | blind eye | 0 | short measure | 0 | 2 |
| **Sette, Bounty Boss** | walk-off | **−1** | bounty-board | **−1** | 2 |

**The two he'd never talk about:** he has put coin and a hot pie in Tobb's cup before dawn for
years, always at an hour when nobody is watching; and he caught Josy at nine with her hand in his
pocket and taught her to run instead of turning her in. **Let the table simply see the pie go in
the cup. Don't let his player explain it.**

### 7d. Where the two webs interlock

Nine NPCs know both of them, and the pairs are the best material here:

| NPC | To Ballad | To Pip |
|---|---|---|
| **Big Ned** | family, +2 | the man he blames, −1 |
| **Foreman Dagget** | sings the pace for his crew | walked four crates past the excise chain |
| **One-legged Tobb** | plays his corner Thursdays, publicly | feeds him before dawn, privately |
| **Josy** | pays her *not* to work her crowds | taught her the trade |
| **Nols** | her first stage | his dead-drop barrel |
| **Wat Harrow** | shifts the benches when she plays | watered the ale on Harl's orders, and Pip never said |
| **Nessa Wetherby** | learned every song off this floor | the only person who has never looked at him sideways |
| **Colm Bracken** | wrote him into a marching verse | the one report he never filed |
| **Skipper Rojan** | (none — cut) | double fare, no manifest |

### 7e. Deliberate blanks — and why

No entry means no card. These absences are load-bearing:

| | Why |
|---|---|
| **Magistrate Corben Vale** | Neither has ever been paper on his desk. The absence *is* the achievement — and with the hanging cut he never appears at all. Keep the card blank; mention him only if a player asks who signs things |
| **the Executioner** | Even the bard doesn't know his name. Nobody does |
| **Rennick the Knife** | Pip never met him — the debt money went through Ned. You get no history with the road you refused |
| **Scribe Ellisane** | She recognises handwriting; Pip has made sure she's never seen his, and Ballad's notes are dictated and unsigned |
| **Guard-Lieutenant Rees** | The one door in Fairfield Ballad has never charmed open. She runs the rotation so the men Ballad *has* charmed keep moving |
| **Maestro Brellin** | The biggest thing Fairfield ever produced, and he cannot place her name. **That is the tie**, and it plays funnier with no card |
| **Grigor** | The skylight winch is Scene 6's summit and must be earned in-scene. Ballad already has the designed back way in: `Halloran ──bond:4── Grigor` |
| **Ansa Pike** | Reachable through Maud. A second Kettlin tie double-counts the same mob lever |
| **Pate** | His job in Scene 3 is to arrive supplying the Executioner. A friendly tie lets the party pre-empt the clock |
| **Marn Hollis** | The menace lands better through Sette pricing Pip's name. A direct tie fires that gun early |
| **Cutter · Hobbes · Grin · Squint · Toad** | Tutorial mooks. A second tied bandit dilutes Little Ned — and one of them is about to be Oz's hop target |

### 7f. What this changes in the scenes — read before play

Four consequences. **Three of them need a decision from you; they are not in the tie data.**

**Scene 2 — Pip has a `strength:4` tie to a bandit who dies in the tutorial fight.** If Kyle presses
`8` during the ambush, a card reading **shadow · +2** appears over Little Ned before the party kills
him. That is the tutorial's actual lesson — *these bodies are people* — but it must not be delivered
by the UI:

1. **Narrate the recognition first.** *"You know that walk."* Round one, before anyone touches a key.
   The card then confirms what the fiction already said.
2. ⚠️ **Don't let the party be the ones who kill him.** Pip's player now has a strength-4 reason to
   pull every punch, and if Ned dies to them anyway it reads as a railroad. **Script it: Ned breaks
   when he sees Pip, and Rennick knifes the deserter.** The design's promise holds and nobody feels
   cheated.
3. The brass padlock in the coat is the grief beat. Let Pip find it, say nothing, and carry it into
   Scene 3.

**Scene 3 — this is the fix for the climb-rate problem, not a break.** [The tune-up](space-journey-pc-tuneup.md)
§7.4 records that *"the mob temperature climbs faster than two mouths can talk it down."* Ballad now
has warm access to Dagget, Maud, Tobb, Cobb, Aldous, Hanne and Josy, which closes that gap. It does
**not** pre-solve the scene, because:

- **Dagget's tie buys access, not the turn.** His crew leaving as a body is still the biggest single
  drop available and still requires the honest conversation. Run it that way.
- **Maud's help has a price** — she'll lend her lungs the day Ballad beats her fair, or admits in
  front of the square that she's been throwing their shouting match for three years. A public
  humiliation, mid-lynching.
- **Cress is locked at −2** and Big Ned is being driven by Oz. The two heaviest pieces on the board
  are both untouchable.

**Scene 4 — Sela Bratch's hook survives, deliberately.** Pip sold her *word of* the roof route years
ago, but **Harl has since re-hung the trap** and only she knows the new way up. So the debt is a
lever and the escape is still hers to give. Ballad's free bed and board from Harl is intact and
should stay — being fed by the man who bars the doors personalises the Scene 2 lesson.
**Placement note:** Halloran will "stand between her and trouble unasked," so his weekly bench is at
**Nols's, not the Dragonsfall** — otherwise six mercenaries are fighting seven people.

**Scene 6 — Old Semm's latch is a feature, and it needs one line from you.** Pip's tie says Semm will
leave the scene-dock door on the latch for a nod. Semm's own pre-existing hook is that **he found a
door locked from the outside at six o'clock.** ⚠️ **Make them the same door.** Semm finds Pip in the
smoke: *"I left it on the latch. Someone's chained it from without."* The guaranteed exit becomes the
proof the fire is murder — better than the tie not existing. **Rule it now: Oz's lockdown overrides
the latch, always.** Without that, the scene collapses.

Marchmain's box stair and Jonet's plus-one are both step 1 of the designed boxes → catwalks →
skylight route, and Grigor's winch still gates the summit. Piet's "any door he can open" self-limits
to zero during the lockdown.

**Hanne's tie moved with her.** She used to slow the drumroll at the hanging; with that scene cut she
is in the market square instead, and her `kin:5` to Widow Cress is the designed backdoor to the
square's strongest lever — see §7b. She'd walk her grandmother to the front for Ballad. **Decide in
advance what that costs**, because Cress herself is locked at −2 and must stay that way.

## 8. Maintaining it

- **New NPC?** Give them at least one tie of 3 or better, or deliberately give them none and write
  them into §4.
- **Contradiction with [twenty-one-background-cast.md](twenty-one-background-cast.md)?** That file
  wins on *character*; this file wins on *who stands where*.
- **New tie invented at the table?** Add the row. The graph is supposed to grow during play.
