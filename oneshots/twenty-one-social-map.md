---
title: "Twenty-One — the social map"
created: 2026-08-15
last_modified: 2026-08-15
status: active
tags: [oneshot, space-journey, twenty-one, npcs, relationships, placement]
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
`Old Cobb` · `Sela Bratch` · `Dolen Petch` · `Harl Wetherby` · `Lark`

A room, not a group. Most of these people are alone *near* each other, which is the point of a bar.

### C — The hanging town
`Widow Cress` · `Hanne` · `Brother Aldous` · `Pate` · `Josy` · `Alderman Hobbe Grove` ·
`Magistrate Corben Vale` · `the Executioner`

Two tight pairs, one feud, and a lot of people who show up at dawn out of habit.

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
| Alderman Hobbe Grove | `×rival:4` | Magistrate Corben Vale | Grove hates that Vale outranks him. It is the organising fact of his week |
| Edmun Latch | `trade:3` | Magistrate Corben Vale | Carries the writ-box. Works for whoever's in charge |
| Colm Bracken | `crew:3` | Scaffold Guard | Same uniform, different pension |

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
| **Scene 4 — the lawful hanging of the party** | **Silent. She watches.** | It has a magistrate, a writ and a signature. She cannot object to that without unmaking herself |

**She is the strongest single lever in Scene 3** — worth two steps of Mob Temperature on her own, and
she is not moved by pity, coin or persuasion. She is defending the only thing holding her together,
and the party get her for free if they simply let her speak.

**Big Ned cannot answer her.** They are both grieving a killed relative, and only one of them is
asking for a trial. Put those two tokens in sight of each other and say nothing.

> **Then Scene 4 takes her away.** The person who saved them in the market square stands in the
> gallows crowd and does nothing. That is what Oz's escalation from *a crowd* to *the law* actually
> costs them — not difficulty, an **ally**.

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

## 7. Maintaining it

- **New NPC?** Give them at least one tie of 3 or better, or deliberately give them none and write
  them into §4.
- **Contradiction with [twenty-one-background-cast.md](twenty-one-background-cast.md)?** That file
  wins on *character*; this file wins on *who stands where*.
- **New tie invented at the table?** Add the row. The graph is supposed to grow during play.
