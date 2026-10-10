---
title: "Molten Ward — the cast on Joe's markers"
status: round 1 built, round 2 designed (2026-10-08) — round 2 not built
created: 2026-10-08
last_modified: 2026-10-08
tags: [context, plans, pentaryn, foundry, encounters, drow, design]
---

# Molten Ward — the cast on Joe's markers

**Read this when:** building the NPCs for scene `Drow City — Molten Ward (streets)`
(`iBdyqCrrPLU3DHMe`) from the nine marker groups, or reviewing what was decided. **Design doc.**
Once built, the live record belongs in [`../pentaryn.md`](../pentaryn.md); the authoring rules used
here are [`../foundry/attributes.md`](../foundry/attributes.md) (attributes and tells),
[`../foundry/markers.md`](../foundry/markers.md) (placement) and
[`../foundry/rules-lookup.md`](../foundry/rules-lookup.md) (statblocks).

## The brief in one paragraph

Level-12 party (Marrith, Caven, Talo), gearless, just stepped out of the Drow Prison through the
link square at (4500, 3600). Every pocket on this map is **fairly easy**: the design question is
whether they talk or burn. Nobody attacks on sight. Every NPC has a want, a fear, and something they
would accept as a lie or a bribe. Statblocks are the owned **2024 Monster Manual** (no drow blocks
exist; drow are reskins that keep MM numbers but **never the MM token** — art from
`assets/tokens/tokens-01/drow-dark-elves/`, ring subjects via `ring_subject.py`). No duergar or deep
gnome block exists in the 2024 MM either, so those are reskins too.

Party budget (DMG 2024, 3 × level 12): **Low 6,600 / Moderate 11,100 / High 14,100.**

| Group | Who | XP | Feel |
|---|---|---|---|
| 1 | three off-duty prison guards at the crates | 650 | trivial; the risk is one of them running for the gate |
| 2 | the barman of the Cooling Trough | 100 | not a fight |
| 3 | an on-duty House detail at the bar: knight, guard, novice priestess | 1,175 | easy |
| 4 | five citizens | ~610 | not a fight unless the party starts one |
| 5 | the pawnbroker in the counting room | 25 | not a fight |
| 6 | three soldiers asleep in bunks | 750 | free if they sneak |
| 7 | the meeting at the Hearth: keeper, Ilphrin son, Ilphrin blade | 1,600 | easy; the prize is information |
| 8 | the Veiled Sons at the oven-back, plus Ilphrin's lookout | 8,100 | **Low+**, the strongest pocket; beatable |
| 9 | the deep-gnome cook | 10 | not a fight |

**Actor folder:** `Encounters/Molten Ward` — **`28AGERcZneTpOxfY`** (confirmed live, parent
`Encounters`). Put every actor below in it; a subfolder per group is fine but not required.

## Conventions the builder must keep

- **Coordinates.** Marker `x,y` is the token's top-left on the canvas; scene offset is (1200, 750),
  so image pixel = (x − 1200, y − 750). Marker centre = top-left + 18.75. Place each NPC (1×1,
  150 px) centred on the marker centre, then consume the marker. Do not touch the three
  `Drow Commoner (crowd)` tokens, the Prison link region/tile, or anything not on this list.
- **Disposition.** Everyone is **Neutral (0)**. Rings by threat: the Veiled Sons red, soldiers grey,
  civilians green. Unlinked tokens for soldiers; linked for named civilians and the group-7/8 cast
  (they carry state).
- **Drow overlay** (applies to every drow below, as the Caves journal does it): Darkvision 120 on
  the sheet (Joe's 2026-10-07 rule), Fey Ancestry, Sunlight Sensitivity, innate *Faerie Fire* and
  *Darkness* 1/day on the soldiers and Ilphrin cast, drow poison on crossbow bolts (DC 13 CON or
  poisoned 1 hour; fail by 5+ unconscious).
- **GM secrets.** Player-safe prose goes in the actor biography; everything marked **GM** below goes
  in `<section class="secret">…</section>` inside the same biography (the convention Vaelith's and
  Ilphrin's bios already use). The builder should verify once that a tier-15 kind study
  (`study.as`) strips `.secret` before trusting it; if it does not, move GM text to a GM-only
  journal page instead. Attribute `miss` fields are GM notes and never delivered — leave them empty
  unless noted.
- **Tells** are lore rows on the NPC (`flags.pentaryn-ties.lore`: `{id,label,skill,dc,hold:false,text,miss:""}`).
  Pass text is real, never contains a gated secret; fail text is empty (silent-failure rule).
  **Attribute links** use `A.link(actor, name)` after `A.ensure` for the two new attributes below.
- **Sleep state** uses the `sleeping` status (exists in `CONFIG.statusEffects`), plus `prone`.

## New attributes (create first; both are roots)

```js
const A = game.pentaryn.ties.attributes;
await A.ensure("The Hearth of Kharg", { category: "temple", dc: 10, skill: "his",
  secret: true, whenKnown: "advantage", whenCarried: "auto", hold: false,
  reveal: "An iron ember-token on a cord, worn where a House sigil would go. A hearth-ward of the old fire-keepers — the Hearth of Kharg.",
  lore: [
    { label: "What it is", skill: "his", dc: 10,
      text: "The founder's hearth. Kharg the Fiery — a duergar name, not a drow one — cut the lava channels that keep this ward warm and the rest of the city from flooding with it. His fire-keepers still tend the channels, and they still light his hearth." },
    { label: "Why the priestesses let it stand", skill: "rel", dc: 14,
      text: "It is licensed as a guild hearth, not a temple; nobody is allowed to call it worship. A priestess sits in its chair one dimming in ten to remind the keepers whose city this is. Without the keepers the channels silt and the ward cooks, so the arrangement holds." },
    { label: "The cooling tunnels", skill: "inv", dc: 15,
      text: "The keepers work the channels from service tunnels under the canal walls. The tunnels run out of the ward under the gate chain. Nobody walks them without the Hearth's say." }
  ]});
await A.ensure("The Veiled Sons", { category: "crew", dc: 14, skill: "his",
  secret: true, whenKnown: "enables", whenCarried: "auto", hold: false,
  reveal: "A grey veil-knot tied at the wrist, the way houseless males mark a crew. The Veiled Sons — knives for hire.",
  lore: [
    { label: "Who they are", skill: "his", dc: 12,
      text: "Houseless drow males who sell blades, poison and silence to any House that pays. A House that hires them never admits it; a crew that is caught never names the House." },
    { label: "What they are careful about", skill: "ins", dc: 14,
      text: "They will not be seen beside a House face in the open. When they take House money they make the House stand a man where the deal is done, so that if the crew falls, the House falls with it." },
    { label: "What the priestesses would do", skill: "rel", dc: 16,
      text: "The veil is not only a mark. The talk is that they keep a god the priestesses do not name — a male one — under it. If that were proved, every priestess in the city would want them alive for a while and then not." }
  ]});
```

Existing attributes reused: `housebarrabin`, `houseilphrin`, `nathryldhaun` (all DC 10 History).

---

## 1 — Off-duty prison guards at the crates

**Tokens:** `fU1oB02ZbSAXlBUm` (4647, 2651) · `mBS6ExxiXBNvSrHd` (4587, 2779) · `RzJGE7iSRJ7jLrqC` (4683, 2777).
**Art check (`crops/group-1.jpg`):** an open street junction south of the apothecary, a stack of
crates and a barrel against the north wall, two stone piers below. The barrel is their dice table.
They are forty feet from the prison link square — the party walks into them first.

These are the prison's off-shift, the people who would know a prisoner's face. They work for the
gaolers, so all three carry **`housebarrabin`** and **`nathryldhaun`**. Unlinked tokens, grey ring.

| | Name | Race / role | Block (MM 2024) | CR | Reskin | Art |
|---|---|---|---|---|---|---|
| a | **Zhaerith** (ZHAIR-ith) | drow male, corporal of the cell block | Bandit Captain | 2 (450) | scimitar → longsword, dagger → hand crossbow w/ drow poison; keeps his studded jack on (AC 15) | drow-soldier-4 |
| b | **Teshryn** (TESH-rin) | drow female, turnkey | Tough | ½ (100) | mace → club (off duty, no armour, AC 12); Pack Tactics kept | drow-with-earrings |
| c | **Ilzarun** (ILL-zah-run) | drow male, turnkey | Tough | ½ (100) | as Teshryn | drow-frusrated |

**State:** sitting on the crates, dice on the barrel, a jug between them. Armour racked back at the
barracks (group 6). Alert but not ready.

**Personality and wants.** Zhaerith is tired, owed a night, and hates paperwork; he would rather
be wrong than be the one who raised an alarm over nothing. Teshryn is the one who looks: she
counts prisoners for a living and she counts the three strangers. Ilzarun is drunk enough to be
brave and sober enough to run.

**Social hooks.**
- *Opening:* Teshryn says the obvious — "those are the sunskins from the lower cells" — and looks
  to Zhaerith. Zhaerith **challenges, does not draw**: "Who's walking you?"
- *What they accept.* A name with authority behind it: "Velkyn" (the interrogator) or "the Second
  Daughter" gets a wince and a wave-through at **DC 12 Deception** (DC 10 if they can show
  anything with a seal on it — Nalveth's Registrar's Seal, the intake ledger, Velkyn's letter).
  "Ilphrin bought us" works at DC 14 and sends them muttering about the House. A bribe works only
  in kind (they have seen the PCs' confiscated gear listed; a Pearl of Power buys all three).
- *What they fear.* Being on shift when the count comes up short. Velkyn, by name.
- *If it goes wrong.* They do not attack three casters. Zhaerith stalls, Ilzarun **runs for the
  link square** to raise the prison (Dash, 40 ft; a PC who wants to stop him has one round). If
  caught or killed, the other two surrender information for their lives: where the patrols turn,
  which bunks are asleep, that "the Trough is the House's bar, you don't want to be in it".
- *GM:* They have not yet been told of the escape; the count is at the next dimming. If any of
  them reaches the gate, treat it as the Street Patrol encounter arriving in 10 minutes.

**Tells (lore rows).**
- Zhaerith — *Off shift* (Perception 10): "Studded jack, no helm, dice money on the barrel. Off
  duty, and not expecting to be on it again tonight." · *Which door he came out of* (Insight 12):
  "He keeps glancing at the prison gate the way a man looks at his own front door."
- Teshryn — *The counter* (Insight 11): "Her eyes move over you one, two, three, and stop at Talo.
  She has counted you before, through bars."
- Ilzarun — *The runner* (Insight 12): "Weight on the balls of his feet, half-turned to the gate.
  If anything happens he is the one who goes."

---

## 2 — The barman

**Token:** `43Fd27Kn4wkeFsjS` (2889, 2617).
**Art check (`crops/group-2.jpg`):** behind the L-shaped bar, four stools with mugs along it,
barrels and a stocked cellar room through the wall to the west, a rug to the east. This is the
**Cooling Trough**, the House's own tavern, lit by the lava canal outside.

| Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|
| **Glenmill** (GLEN-mill) | human (surface-born freedman), barman and licensee | Tough | ½ (100) | mace → cudgel under the bar; no crossbow | `humans/` — a big, soot-grey older man |

A surface human in a drow bar needs explaining, and the explanation is the hook: taken as a boy
from a town called Glenmill (he kept the town's name because the drow never asked for his own),
thirty years a kitchen thrall in the prison, bought free by cooking for the right sergeant, now runs
the House's tavern on a House licence. He is the only human face the party will see tonight, and he
owes everything to the people hunting them.

Carries **`nathryldhaun`**. Linked, green ring.

**Personality and wants.** Slow, careful, kind in the way of someone who cannot afford to be. He
wants his licence renewed at the next dimming and to never again be a thrall. He wants news of the
surface more than he will admit.

**Social hooks.**
- He knows what they are at a glance (sunskins, prison-thin, no escort). He does not say so. He
  pours three cups and says "On the House. Drink it slow and go out the way you came — the Watch is
  at the end of my bar." That is the on-duty detail (group 3).
- *What he accepts.* News of the surface — a true story about any surface town buys him
  (**DC 10 Persuasion**, advantage if a PC names a real place). Caven and Marrith both can.
- *What he can do.* Hide them in the cellar (the barrel room west of the bar) for one dimming, if
  the detail has not seen them. Tell them the Trough's back door opens on the canal street and that
  "the fire-keepers' tunnels" run under the canal wall — he has seen the keepers go down.
- *What he will not do.* Lie to a priestess. If Shivaen (group 3) asks him directly, he tells her.
  Fight: never; he gets under the bar.
- *GM:* His manumission is Barrabin's and revocable. If the party is recaptured and he helped, he
  goes back to the kitchens — he knows it, and it is why he hesitates.

**Tells.**
- *Sunskin under the soot* (Perception 10): "Grey with ash and lamp-smoke, but the skin under it
  is pale, and the eyes squint at the canal-glow. Surface-born."
- *The wrist* (Medicine or Insight 12): "An old brand on the inside of the left wrist, struck
  through with a second burn. A thrall's mark, then a freeing mark over it. Someone paid for him."
- *What he does not say* (Insight 14): "He placed you the moment you came in and decided not to
  say so. That decision cost him something."

---

## 3 — The on-duty House detail at the bar

**Tokens:** `l2kk8oQPr22U7HT0` (3035, 2477) · `GyEpfDzHRcgRiPCe` (3031, 2605) · `1wTpFtUwNzXVRC3T` (3035, 2743).
**Art check (`crops/group-3.jpg`):** the three northern stools along the bar, mugs in front of
each; the rug and two round tables (one laid with food, one with papers) to the east.

They are on duty: the Trough pays its House tithe in drink, and a street detail stops for its
**House cup** once a shift. Armoured, armed, and half a cup in. The officer wants to leave; the
novice likes the heat. All three carry **`housebarrabin`** and **`nathryldhaun`**. Unlinked, grey ring.

| | Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|---|
| north | **Rhyzaen** (RYE-zane) | drow male, House-born lieutenant | Knight | 3 (700) | greatsword → longsword and shield (same numbers); heavy crossbow → hand crossbow with drow poison; plate reads as drow mail (AC 18 kept) | drow-noble-fighter |
| middle | **Nyzeth** (NYE-zeth) | drow male, rank-and-file | Guard | ⅛ (25) | spear kept; chain shirt and shield (AC 16) | drow-soldier-2 |
| south | **Shivaen** (shih-VAIN) | drow female, novice priestess attached to the detail | Priest | 2 (450) | Radiant Flame → "Spider's Bite" (necrotic, same dice); Spirit Guardians as a swarm of spectral spiders; mace → snake-headed rod | drow-priestess |

**The educational detail, which is also the tell:** the lowest-ranked person at the bar is the one
everyone defers to. Rhyzaen outranks Nyzeth by birth and office and outranks nobody in the room
that matters: a novice of the priesthood is still a priestess. He asks her leave to move on. Players
who notice this (Insight 12) have learned the first rule of drow streets.

**Personality and wants.** Rhyzaen: correct, bored, resents the stop; wants to finish the round
without a report to write. Nyzeth: young, hungry, watching the food table; wants the cup and the
end of shift. Shivaen: seventeen, dangerous, enjoying being obeyed; wants something to happen that
she can take credit for.

**Social hooks.**
- *They are not looking for the party.* The escape is not yet reported. Three sunskins walking
  into the House bar is strange, not criminal: Rhyzaen asks for papers; Shivaen asks nothing and
  watches.
- *What they accept.* Papers (a forged transit chit from Ketharis, group 5, is exactly this — it
  passes Rhyzaen at **DC 12** with the chit, DC 16 without). The name of a House that is not
  Barrabin ("we are Ilphrin's purchase; the factor is at the Hearth") makes Rhyzaen uncomfortable
  and Shivaen interested — she sends Nyzeth to the Hearth to check, which gives the party the
  length of his walk.
- *What they fear.* Rhyzaen: Shivaen. Shivaen: being wrong in front of a senior priestess.
  Nyzeth: both of them.
- *If it goes wrong.* Rhyzaen draws, Nyzeth drops his cup, Shivaen casts *Bless* on them and then
  *Spirit Guardians* and walks at the softest PC. Nyzeth flees at half HP. Rhyzaen surrenders only
  if Shivaen is down; Shivaen never surrenders but will take a bargain phrased as an offering.
- *Capture rather than kill:* their orders for sunskins are "alive, they are worth money".

**Tells.**
- Rhyzaen — *House-born* (History 12): "The sword-knot is a House knot, not a hired one. He was
  born to this uniform." · *Waiting for leave* (Insight 12): "He has finished his cup and has not
  stood up. He is waiting for the girl to let him."
- Nyzeth — *Hungry* (Perception 10): "He keeps looking at the food on the round table. He has
  not eaten this shift."
- Shivaen — *Who gives the orders here* (Insight 12): "Youngest at the bar, the only one not in
  armour, and the only one nobody interrupts." · *The rod* (Religion 14): "The snake-headed rod is
  a novice's, not a priestess's. She has no handmaiden yet. She wants one."

---

## 4 — Citizens where they stand

Five tokens in three spots. None of them want a fight; all of them notice everything and say
nothing, which is the ward's manners. Green rings; linked.

### 4a — The unloading at the corner (three tokens)

**Tokens:** `XeCve7O39WYJS6q7` (3155, 1860) · `MTYdLsygIcKF6Q8Z` (3241, 1852) · `rP2txUb3ClWqzFFt` (3171, 1768).
**Art check (`crops/group-4.jpg`, top-left):** an open street corner north of the tavern block with
a crate and a barrel against a storeroom wall. A delivery, mid-unload.

| Token | Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|---|
| rP2t (north) | **Grombar** (GROM-bar) | duergar male, licensed trader (lamp-oil, slag-salt, rope) | Noble | ⅛ (25) | duergar: Darkvision 120, Sunlight Sensitivity, poison resistance, *Enlarge* 1/day flavour only; rapier → war pick | `dwarves/` or `generic-underdark/duergar-vexed` |
| XeCv (west) | **Urrok** (UR-rok) | quaggoth male, collared porter (Grombar's) | Quaggoth | 2 (450) | none; collared, no Bloodied Fury unless the collar is cut | `miscellaneous-monsters/` (a white-furred brute) or `abberations/` |
| MTYd (east) | **Pikkit** (PIK-kit) | goblin, thrall tally-boy | Goblin Minion | ⅛ (25) | dagger → tally-stick | `goblins-goblinoids/` |

**Personality and wants.** Grombar wants the crate counted and his cart gone before the next
patrol asks for his licence stamp (it is a dimming out of date). Urrok wants to put the crate down.
Pikkit wants to not be beaten and has noticed the three sunskins before anyone.

**Social hooks.**
- Grombar is a merchant in a city of nobles: he sells to anyone and reports nobody, because
  reporting costs trade. He will **sell** rope, a hooded lantern, oil and a sack of slag-salt (the
  party has nothing to pay with — he takes a promise against "the sunskins' gear in the Keeper's
  chest", which he has heard about, at **DC 13 Persuasion**). He knows Thrund Grimtongue (the
  duergar inmate): "Thrund's partner. Thrund got caught. I did not." If the party mentions Thrund
  by name, advantage.
- Urrok: a freed quaggoth ally already exists in the Caves encounters; cutting Urrok's collar is a
  thing the party can do, and Grombar will not fight for him ("He is rented").
- Pikkit will trade what he saw for a bite of anything: he saw "a House man in a good cloak go
  down the kitchen lane and not come back" (the lookout, group 8) and "the fire-keepers open their
  grate by the canal an hour ago".
- *GM:* Grombar's crate holds lamp-oil. Twelve flasks. Marrith will want to know that.

**Tells.** Grombar — *Out of date* (Investigation 12): "The licence stamp on his cart is a dimming
old. He is hurrying." Urrok — *Collared* (Perception 10): "An iron collar, drow-made, with a
house-mark filed off. Rented, not owned." Pikkit — *Saw you first* (Insight 10): "He looked at you
before the others did and looked away faster."

### 4b — The customer at the apothecary barrels

**Token:** `Ac5Uteusa56HUyTg` (3955, 2619).
**Art check (`crops/group-4.jpg`, lower right):** a row of barrels outside the herb-shop's south
wall; the shop (group 7's dispensary) is through the door north of her.

| Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|
| **Luazara** (loo-ah-ZAH-rah) | drow female, kitchen steward of the Barrabin prison | Commoner | 0 (10) | none | drow-youthful |

Carries **`housebarrabin`**, **`nathryldhaun`**. Waiting with a basket for the apothecary to finish
with the Ilphrin customer inside. She runs the prison kitchen that fed the party: the grey gruel
was hers.

**Social hooks.** She knows their faces (she ladled for them) and she is terrified of them, which
makes her the easiest person on the map to lie to and the most dangerous to leave behind. She wants
to not be noticed. She accepts anything that lets her walk away ("we never saw you" at **DC 10**).
If released unthreatened she goes home, not to the gate — she is not paid enough to run. If
threatened she tells the truth: she is buying sleep-poppy, "for the lower cells' pot". *GM:* the
prisoners' gruel is dosed; that is why the party slept so well. Skritch (the prison kitchen slave)
is hers.

**Tells.** *The ladle hand* (Perception 11): "Burn-scars across the back of the right hand in the
pattern of a kitchen, not a forge. You have seen that hand, through bars, holding a ladle." ·
*Shopping list* (Investigation 12): "Sleep-poppy and bitter-root in the basket. Enough to dose a
pot for forty."

### 4c — The fire-keeper on the canal wall

**Token:** `tlwnOBvqJKQv8RFz` (3667, 2747).
**Art check (`crops/group-4.jpg`, bottom centre):** the street south of the tavern, hard against
the lava-canal wall.

| Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|
| **Maelvir** (MAIL-veer) | half-drow male, fire-keeper of the Hearth | Tough | ½ (100) | mace → long iron rake (same dice, reach 10 ft); heavy crossbow dropped | drow-with-blue-eyes or `humanoid-races-misc/` |

Carries **`hearthofkharg`** and **`nathryldhaun`**. Reading the canal level with the rake. He is
the cheapest way for the party to learn the Hearth exists before they reach it: his ember-token is
the attribute's reveal.

**Social hooks.** Taciturn. Wants the channel reading done and to be left alone. Does not report
sunskins — the keepers report nothing to the Houses that they are not asked. Accepts a straight
question: "Is there a way out of the ward that is not the gate?" gets "Ask the Keeper. Not me." and
a nod up the street toward the Hearth (**DC 12 Persuasion**, advantage if a PC has already placed
his ember-token). *GM:* he opened the keepers' grate under the canal an hour ago for Saelzir's
inspection (group 7); that grate is the tunnel mouth, and Maelvir has the key on his belt.

**Tells.** *Ember-token* — this is the `hearthofkharg` identification, not a lore row. ·
*The key* (Perception 13): "A heavy iron key on a cord at his belt, warm-blackened — a grate key,
not a door key."

---

## 5 — The counting room

**Token:** `jKCa7AGTOKta8leQ` (5013, 2393).
**Art check (`crops/group-5.jpg`):** a small locked room: a desk with a sealed letter, an open
ledger, ink and quill, a loose heap of gold coins, a chair on a red embroidered rug, four barrels.
A moneychanger's room. What makes sense here is **a licensed pawnbroker who also writes passes.**

| Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|
| **Ketharis** (KETH-ah-ris), "the Ledger" | drow male, houseless, licensed broker and passes-writer | Noble | ⅛ (25) | rapier kept (a thin one, under the desk); add Darkvision 120 | drow-noble-contemplative |

Carries **`nathryldhaun`**. Linked, green ring. Sitting. The door is locked (DC 13 Thieves' Tools,
or knock).

**Why he matters.** The party has nothing and needs three things: coin, papers and a buyer. He is
all three, for a price that is always too high.

**Personality and wants.** Precise, polite, never surprised. Wants profit and his licence
(Barrabin's) renewed. Fears Barrabin finding out what he writes for other Houses.

**Social hooks.**
- *Buys anything* at a tenth of its worth, no questions. (He would pay properly for Caven's Ring
  of Spell Storing or a Pearl of Power if the party ever gets them back; tonight they have
  nothing — unless they looted **Nalveth's Registrar's Seal** from the prison, which he will trade
  a great deal for: a transit chit *and* 50 gp *and* a name at the Hearth.)
- *Sells a transit chit*: a House-errand pass that gets them past one patrol stop (passes
  Rhyzaen at DC 12). Price 25 gp, or a favour: "Three sunskins are worth something to House
  Ilphrin tonight. Let me be the one who sold you to them." **DC 13 Persuasion** to get the chit
  on credit against the Ilphrin sale.
- *What he accepts as a lie:* none — he does not need to believe them, only to profit. What he
  will not do: fight (9 HP, he hides and screams), or be seen helping them if a priestess is in
  the street.
- *GM:* the sealed letter on the desk is a settlement note in trade-cant for the **Grey Road
  caravan** — "Grey Road, one lot, people included, received in full, for the Merrowgate paper."
  He brokered the handover Thrund arranged. Tomas and Edda Brell were sold, not ambushed; the
  party can read it off his desk. The gold is 60 gp and is lootable if they rob him; Barrabin's
  licence-mark is stamped on the ledger, which is the leverage he fears.

**Tells.** *The licence stamp* (Investigation 11): "The ledger's spine carries a House stamp: a
spider over a closed eye. He works on Barrabin's paper." · *The letter* (Investigation 12): "The
sealed note on the desk is addressed in trade-cant. 'Grey Road, one lot, people included.'" ·
*Never surprised* (Insight 14): "Three sunskins walked in and his pulse did not change. He has
already decided what you are worth."

---

## 6 — Asleep in the barracks

**Tokens:** `z3MewlIaU3c1uFjP` (4994, 1953) · `JCmgJHdjNRBwNCsm` (5303, 1948) · `lscqHab6Pem3nEgG` (5539, 1876).
**Art check (`crops/group-6.jpg`):** three bunk rooms in a row north of the counting room, one bed
each (the east room has two beds and barrels — the senior's room). Each marker is on a bed.

All carry **`housebarrabin`**, **`nathryldhaun`**. Unlinked, grey ring. State: **`sleeping` +
`prone`**, armour on the floor (AC 10 + Dex while asleep — set a note, do not change the sheet).

| Token | Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|---|
| z3Me (west) | **Olyss** (OH-liss) | drow male, turnkey | Guard | ⅛ (25) | spear on the wall | drow-adolescent |
| JCmg (middle) | **Dhauvin** (DOW-vin) | drow male, turnkey | Guard | ⅛ (25) | spear on the wall | drow-soldier-3 |
| lscq (east) | **Thaeryn** (THAIR-in) | drow female, the cell block's day-sergeant | Warrior Veteran | 3 (700) | greatsword and crossbow racked by the bed; keeps a dagger under the pillow | dark-elf-with-scars |

**Running it.** They are Unconscious. Walking past the open doors at a normal pace is free; a PC who
*talks* within 10 ft or opens a door gives Thaeryn a Perception check at disadvantage (passive 7)
to wake. Anyone shaken or damaged wakes. If Thaeryn wakes she is one round from the alarm whistle
on the wall. The two turnkeys, woken, are confused for a round and then do whatever she says.

**Social hooks** (if woken). Thaeryn is the only one worth talking to: sharp, proud, and off duty
for another four dimmings. She has no orders about sunskins and would prefer to go back to sleep;
"Velkyn's business" at **DC 13 Deception** sends her back to bed, grumbling. Threatened, she
bargains: her armour and crossbow for her life, and the fact that the patrols turn at the
Hour Pillar road. *GM:* her footlocker holds a spare set of House livery (a disguise) and 8 gp.

**Tells.** Thaeryn — *Day-sergeant* (Perception 11): "The only room with two beds and a rack.
Sergeant's quarters." · *The pillow* (Perception 13): "The shape of a dagger under the pillow,
under her hand." Olyss / Dhauvin — *Dead to the world* (Perception 10): "Boots off, belts off.
They came off a double shift and will not wake for anything quiet."

---

## 7 — The meeting at the Hearth

**Tokens:** `3giLFRDz81fpbdNe` (4410, 1636) — in the shrine · `uM13f9lYNspqEkLO` (4152, 2372) — in
the dispensary · `ZaRtqr2kWxmH2PlD` (3794, 2214) — in the street outside the dispensary's west wall.
**Art check (`crops/group-7.jpg`):** north, a small apse-ended room — a desk with a red-ribboned
scroll, a book pressed with red flowers, ink and quill; a long woven mat down the middle flanked by
two tiered racks of offering bowls. South of it, through a door, a shop of herb tables, flowers,
crystals, a mortar and pestle. Then the street.

### Explainer for Joe: what temple can stand in a drow ward

In the drow societies the novels built (Menzoberranzan is the model), **Lolth's priesthood is the
state.** Every noble House keeps a chapel to the Spider Queen; the public temple is the
priestesses' seat; the priestesses, not the warriors or the wizards, outrank everyone. Worship of
any other god is heresy, and heresy is not a crime so much as a resource: a proved heretic is a
gift to whichever priestess finds her. The two heresies the books return to are **Eilistraee**,
the dancing goddess of the drow who would go back to the surface and the moon, worshipped in
secret glades and cellars, and **Vhaeraun**, the masked god of thieves and of drow males who
resent a world run by their mothers and sisters. Both survive by never being named.

So an *open* temple to anything but Lolth cannot stand. But drow society is pragmatic before it is
pious, and it runs on a second principle: **anything that serves the Houses and pays its tithe can
exist as long as it does not call itself worship.** Guild shrines, ancestor hearths, the duergar's
"foreign filth" in the bazaar — tolerated, taxed, and visited by a priestess often enough that
nobody forgets whose city it is.

**This ward tells you which kind it is.** The map's own lore says the Molten City was built by
"Kharg the Fiery", who harnessed the fire below. *Kharg* is a duergar name (the vault's dwarvish
conventions would build it the same way: `Khar` + `g`); no drow House would have let a dwarf's name
stay on anything it founded. So the Molten Ward is the **old** ward: a duergar fire-smith cut the
lava channels, the drow took the city, and the channels still need tending by people who know how.
The apse room with its offering bowls and its mat is **the Hearth of Kharg**: the founder's hearth,
kept by the fire-keepers (duergar and half-drow who work the channels), licensed by the priesthood
as a *guild hearth* — not a temple, never say temple — because without the keepers the ward cooks.
A priestess sits in its chair one dimming in ten. The big hall with the robed statue in the
south-west corner of the map (no markers on it) is the ward's actual Lolth chapel, where nobody
would hold a meeting like this one.

**Why the deal is here.** The Hearth is the one room in the ward where a drow of a House and a
non-drow can sit at the same table without anyone remarking on it, and where the priesthood's eye
is scheduled rather than constant. Every grey-zone place in a drow city gets used for exactly this,
which is also why the heresies hide in them.

### The two parties and the deal

**Party of two — House Ilphrin.** The Matron "spends her sons as envoys" (existing lore). Tonight's
son is **Saelzir**, with a House blade, **Vexaen**. Ilphrin are "wizards and smugglers" and want
Barrabin's ruin; tonight they want **the cooling tunnels** — the keepers' service ways under the
canal walls that leave the ward under the gate chain. Saelzir is buying a night's passage for
"goods" without saying what. (GM: two kinds of goods. First, the poison the Veiled Sons are
finishing at the oven-back (group 8), which must reach the Ilphrin compound without passing a
Barrabin gate. Second — if Ilphrin can buy or catch them — **the escapees**, who are worth more to
Ilphrin as proof of Barrabin's incompetence than as prisoners. Saelzir does not yet know the
escapees are on the map.)

**Party of one — the Hearth.** **Borgra**, Keeper of the Hearth, duergar, old, the channel-master's
widow. The Hearth has sold tunnel-nights to Houses before, but never to a House at war with the
House that holds its licence. She is pricing the risk, and she is slow about it on purpose.

**How the meeting is staged** (drow do not say terms aloud): Borgra sits at the shrine desk
writing the terms; Saelzir waits in the dispensary below pretending to buy herbs while the
herbalist carries the paper up and down; Vexaen stands in the street outside the west door,
because a House blade inside a duergar hearth is an insult and outside it is a threat.

| Token | Name | Race / role | Block | CR | Reskin | Art | Attributes |
|---|---|---|---|---|---|---|---|
| 3giL (shrine) | **Borgra** (BOR-grah), Keeper of the Hearth | duergar female, elder | Priest | 2 (450) | Radiant Flame → "Hearth-flame" (fire, same dice); Spirit Guardians as a ring of embers (fire); duergar traits (Darkvision 120, poison resistance); mace → hearth-iron | `dwarves/` — an old grey dwarf woman | `hearthofkharg`, `nathryldhaun` |
| uM13 (dispensary) | **Saelzir Ilphrin** (SAIL-zeer) | drow male, fourth son, House factor | Mage Apprentice | 2 (450) | Ice Knife → "Web-shard" (piercing+cold kept; Marrith's curse makes it fire if *she* casts it, not him); Disguise Self kept — he arrived wearing a merchant's face | drow-spellcaster-with-wand | `houseilphrin`, `nathryldhaun` |
| ZaRt (street) | **Vexaen** (VEX-ain) | drow female, House blade | Warrior Veteran | 3 (700) | greatsword → two scimitars (same Multiattack dice); heavy crossbow → hand crossbow with drow poison | drow-sword-dancer | `houseilphrin`, `nathryldhaun` |

**Personalities and wants.**
- *Borgra* wants the Hearth to survive this night and the next hundred years; she sells nothing she
  cannot deny. She is not cruel and she is not kind; she is a keeper. She fears the priesthood
  revoking the licence, and Barrabin learning she sold its enemy a road.
- *Saelzir* is clever, impatient, fourth in a line that spends sons; wants to come home with
  something his mother will count. Fears coming home with nothing more than he fears the Watch.
- *Vexaen* wants to be inside, where she can see him. Fears a knife she did not see.

**Social hooks.**
- *For the party, this is an auction with themselves as the lot.* Saelzir will **buy** them the
  moment he understands what they are: safe passage out of the ward through the tunnels tonight,
  food, and a promise of their gear "when the House has recovered it from Barrabin", in exchange
  for walking into the Ilphrin compound as his prize. **DC 12 Insight** sees that the promise is
  the price and the compound is a nicer cell.
- *Or the party can be the deal's problem.* Borgra will not open the tunnels while there are
  three strangers in her hearth who might tell Barrabin. She will offer them the tunnel instead of
  Ilphrin — alone, now, no House — if they give her a reason to trust them: a true thing about
  themselves (Talo's grounding, Marrith's runes, Caven's hunger — any tell they let her read) at
  **DC 13 Persuasion**, or any proof they hold Barrabin's secrets (Velkyn's letter, Ketharis's
  Grey Road note). She wants Barrabin weakened a little, not ruined; three escapees who vanish is
  a little.
- *What they accept as lies.* Saelzir: that they are already Ilphrin's ("my brother's purchase")
  — he does not know, and it annoys him enough to check (**DC 15 Deception**). Borgra: nothing;
  she does not need to believe, only to measure.
- *Bribes.* The party has no coin. Borgra takes labour: Talo in bear-shape can clear a silted
  channel grate in an hour that would take her keepers a dimming. That is a bribe she values more
  than gold, and it is the one players will not think of unless the fire-keeper (4c) mentions the
  silt.
- *If it goes wrong.* Vexaen comes through the west door at the first raised voice. Saelzir casts
  *Thunderwave* to open space, Misty-Step-free (he has none) and walks backward to the street.
  Borgra does not fight the party; she rings the hearth-bell, which brings the three fire-keepers
  from the canal (treat as 3 × Tough, 2 rounds away) to put out *fires*, not to kill anyone.
  Nobody here dies on purpose: a dead Ilphrin son in a duergar hearth ends the Hearth.
- *GM:* The written terms on Borgra's desk (lootable, Investigation 12 to read the cant): "One
  night. The west grate. Goods not named. The House stands a man at the oven." That last line is
  the thread to group 8. The scroll with the red ribbon is the priesthood's licence; the pressed red
  flowers in the book are fire-poppy, the Hearth's offering.

**Tells.**
- Borgra — *The chair* (Perception 11): "She sits in a chair too tall for her, carved with a
  spider. It is not hers; it is left here for someone who comes one dimming in ten." · *What she is
  writing* (Investigation 13): "Terms, in trade-cant, and she is writing them slowly on purpose."
- Saelzir — *The wrong face* (Insight 13): "The merchant's clothes are right and the hands are
  wrong — soft, ink-stained, a House ring's pale band on one finger." (The `houseilphrin`
  identification is separate: DC 10 History, no conceal; a PC who has placed Lord Ilphrin or the
  Hanger-on rolls at advantage.) · *Fourth son* (Insight 15): "He is not afraid of the Watch. He is
  afraid of going home with nothing."
- Vexaen — *Posted* (Perception 10): "She is not shopping and she is not walking. She has been
  given a door." · *Two blades* (Perception 12): "Two scimitars, worn to be drawn together. A
  House-trained duellist, not a street guard."

---

## 8 — The Veiled Sons at the oven-back, and Ilphrin's lookout

**Tokens:** `JKCD3i7SX7HL4Sub` (2414, 2563) · `lBCLmmnsKGEStIwr` (2348, 2655) · `Z1TJurIP71NuaVzF` (2460, 2673) — the three 8s ·
**`ddW6iU7t7M5BTdJS`** (2284, 2415) — the Marker · 7 placed with them: **the lookout**.
**Art check (`crops/group-8.jpg`):** a quiet corner of the street behind the cook's kitchen
(group 9); the kitchen's stone oven is built into the wall above them with its fire visible through
the back vent; a crate and a barrel; the canal wall south. The lookout stands north-west of them at
the mouth of the lane that runs up to the food stall — he is in the way of anyone coming down.

### What the dark dealing is (GM)

The Veiled Sons are a houseless drow crew — knives, poison and silence for hire, built on the
Bregan D'aerthe idea (a company of House-less males that every House uses and none admits to) and
on the Vhaeraun idea (a crew of males with a god under the veil that the priestesses must never
find). Tonight **House Ilphrin has commissioned a poison** from them: a slow dose for the **Feast of
the Hollow Moon**, for Vaelith Barrabin — the Second Daughter, the heir, the woman Ilphrin's son is
courting as cover. Barrabin without an heir is Barrabin's ruin, which is what the vault says Ilphrin
wants. The poisoner is finishing the distillate *now*, in a flask set in the kitchen oven's back
vent (the only steady, unremarkable heat in the ward that is not a Hearth fire). When it is done,
the Ilphrin lookout carries it to Saelzir at the Hearth, and the tunnels take it home.

**Why the lookout is there** — and why he is Joe's 7, not an 8: the crew will not be seen beside a
House face, but it will not take House money without a House face *standing where the deal is
done*, so that if the crew falls, the House falls with it (the attribute's second lore row). Ilxaer
is the surety. He is a House drow in a good cloak loitering by a kitchen drain, and that is why he
does not quite make sense: he is not hiding, because drow do not hide in their own streets — they
simply are not looked at. His job is to keep anyone from walking down the lane to the oven-back,
and to carry the flask when it is ready.

The party will almost never learn the target. What they can learn, in order: that the man is a
lookout (cheap); that he is Ilphrin's (moderate); that the three behind him are a crew and what kind
(the Veiled Sons attribute, flat DC 14); that something is cooking in the oven vent (the cook, group
9, hears everything through it). That is enough leverage to buy almost anything on this map, and
enough to get them killed if they spend it in the wrong room.

### The crew

All carry **`theveiledsons`**, **`nathryldhaun`**. Linked, **red ring**, disposition Neutral. XP for
the three: 7,900; with the lookout 8,100 — just over Low, well under Moderate. Beatable, and the
most dangerous thing on the map.

| Token | Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|---|
| JKCD (north) | **Ralzeth** (RAL-zeth), "Veil" | drow male, crew-captain | Assassin | 8 (3,900) | shortsword → scimitar; light crossbow → hand crossbow with drow poison *on top of* the Assassin's own poison (use the block's poison; drow poison on a miss-by-5 unconscious is the capture tool) | dark-elf-disfigured-face |
| lBCL (west) | **Ithrys** (ITH-riss) | drow male, the poisoner | Bandit Deceiver | 7 (2,900) | Blinding Flash → flash-powder; Major Image / Disguise Self kept; Hold Person kept; dagger envenomed; carries an alembic flask case | drow-warlock |
| Z1TJ (east) | **Thaelzin** (THAIL-zin), "the Door" | drow male, the crew's heavy | Tough Boss | 4 (1,100) | mace → iron-shod club; heavy crossbow kept, drow poison bolts | drow-angered |

**State:** Ralzeth leaning on the crate facing the lane; Ithrys at the oven vent with his back to
the street, working; Thaelzin on the barrel between Ithrys and anyone.

**Personality and wants.**
- *Ralzeth* is calm, courteous, and has killed people for less than a long look. Wants the job done,
  the House's man gone, and no witnesses he has to pay for. Fears the priesthood (the veil), and
  Ithrys's flask breaking.
- *Ithrys* is the clever one and knows it; talks too much when he is working. Wants quiet and
  twenty more minutes. Fears heat — the wrong heat — and being interrupted at the critical pour.
- *Thaelzin* says nothing. Wants to hit something, has been told not to.

**Social hooks.**
- *Opening.* If the party gets past Ilxaer, Ralzeth speaks first: "Walk on, sunskins. Tonight you
  are nobody's." He means it as a kindness, and it is one.
- *What they accept.* Being ignored. A lie that costs them nothing ("we are Ilphrin's purchase, the
  factor sent us for the House man" — Ralzeth looks at Ilxaer, who does not know; **DC 14
  Deception**, and then Ilxaer has to decide whether to admit he is the House man).
- *What they will trade.* Silence for silence. If the party has clearly understood what is in the
  vent (they say "poison", or "Vaelith", or "Ilphrin's flask"), Ralzeth's face does not change and
  he offers a deal instead of a fight, because a fight here brings the Watch and the Watch brings
  priestesses: **the crew knows the tunnels as well as the keepers do**, and will walk the party to
  the west grate and open it, in exchange for the party never having been here. Or, cheaper for
  him: he points them at the Hearth — "There is a House man there buying sunskins tonight. Go and
  be bought." (**DC 13 Persuasion** for the grate; the Hearth pointer is free.)
- *What they will not do.* Let the flask be touched. Let Ithrys be interrupted. Be seen fighting
  beside Ilxaer — if it comes to a fight, Ralzeth's first order is for Ilxaer to *leave*.
- *If it goes wrong.* Ithrys drops **Blinding Flash** and a **Major Image** of the oven wall
  collapsing to cover the flask; Thaelzin holds the lane with the club; Ralzeth goes for the PC
  who said the word, Multiattack with poison, and uses Cunning Action to break away rather than
  finish — **the crew retreats the moment the flask is clear**, through the kitchen's back door
  (group 9's cook will scream) and into the lane north. They fight to leave, not to win. If a PC
  drops, they leave the PC: a dead sunskin is Barrabin's problem.
- *GM:* the flask is finished in ten minutes of real play from the party's arrival on the map. If
  the party kills Ithrys before then, the dose is ruined and Ilphrin's play fails — which Barrabin
  would pay to know. The flask itself is a lootable item: "Hollow Moon" (contact poison, DMG
  Midnight Tears equivalent: delayed, DC 17 CON, 31 (9d6) poison at the next dimming).

**Tells.**
- Ralzeth — *The knot* — the `theveiledsons` identification (DC 14 History, flat). · *Has done
  this before* (Insight 12): "He is the only one of the three who has already decided what he will
  do if you keep walking." · *Houseless* (History 13): "No House knot, no House colour, and
  the hilt is good. A man who sells the sword, not swears it."
- Ithrys — *The vent* (Perception 12): "Something sits in the oven's back vent on an iron tray: a
  glass flask, steam-cooled, and he will not take his eyes off it." · *The smell* (Nature or
  Medicine 14): "Bitter almond under the kitchen-smoke. Nothing you cook smells like that."
- Thaelzin — *The Door* (Insight 10): "He is not standing near them. He is standing between them
  and you."

### The lookout

| Token | Name | Race / role | Block | CR | Reskin | Art | Attributes |
|---|---|---|---|---|---|---|---|
| ddW6 | **Ilxaer** (ill-ZAIR) | drow male, House Ilphrin retainer, posted as surety | Spy | 1 (200) | shortsword → rapier; hand crossbow with drow poison; a good cloak he keeps pulling straight | drow-with-ice-blue-eyes | `houseilphrin` with **conceal `{ houseilphrin: 4 }`** (DC 14 on him), `nathryldhaun` |

Linked, grey ring, Neutral. Standing in the lane mouth, facing north (toward the stall and the
tavern street), with his back to the crew.

**Personality and wants.** Twenty-two, well-born, badly placed. Wants the flask to be ready so he
can leave this stinking lane; wants nobody to see him here. Fears Ralzeth more than the Watch, and
his mother's steward more than Ralzeth.

**Social hooks.**
- He **moves to block** — one step into the lane, a hand up, "Wrong lane, sunskins. The stall is
  that way." He is not subtle because he does not have to be; drow move on when a House man says
  move on. Sunskins might not. He has no plan for sunskins who do not.
- *What he accepts.* Going the way he points. A reason to leave him alone ("we are looking for the
  Hearth" — he visibly relaxes and points, because that is where he is going next; **DC 10**).
- *What he fears, which is the lever.* Being named as Ilphrin's. A PC who says "House Ilphrin" to
  his face (having placed him) gets a flinch and a bargain: he will tell them where Saelzir is and
  that "the factor buys sunskins", if they walk away now. He will not say what is in the vent, ever.
- *If it goes wrong.* He does not fight; he shouts "Veil!" and runs for the Hearth. Ralzeth's crew
  then knows the party is a problem, which is worse for the party than Ilxaer's rapier.

**Tells (Joe's two).**
- **Low DC — *A lookout*** (Perception **or** Insight **11**; pass text): "He is watching the lane,
  not the wall he is leaning on, and when you move he moves to keep himself between you and the
  corner behind him. A lookout — and a bad one: good cloak, clean boots, a kitchen drain. He does
  not belong in this lane and he knows it." Most passers-by never roll this; escapees would.
- **Higher DC — the faction link** is the **`houseilphrin` identification** itself: DC 10 History
  on the attribute, **+4 conceal on him** → DC 14 (he has turned his ring and pulled the cloak over
  the House clasp). Reveal (the attribute's existing text) is what fires. A PC who already placed
  Saelzir or Vexaen rolls at advantage (`whenKnown: advantage`).
- Supporting row — *Why here* (Insight 15; pass text): "He is not keeping the lane clear for his
  own sake. He keeps looking back at the three by the oven the way a man looks at something he has
  been told to stand next to and would rather not." (No faction, no poison named: both are gated.)

---

## 9 — The cook

**Token:** `O8oRZIGbaLCiwRM2` (2526, 1944).
**Art check (`crops/group-9.jpg`):** a food stall: a counter with a wheel of cheese, a loaf, a
whole cave-fish, a sausage, roots; hooks of hanging meat on the west wall; the warm-floored kitchen
behind it with the oven at its south end — **the same oven whose back vent the Veiled Sons are
using.**

| Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|
| **Slagpenny** (SLAG-penny) | svirfneblin (deep gnome) female, bond-cook to the barracks | Commoner | 0 (10) | Darkvision 120, Gnomish Cunning (advantage on Int/Wis/Cha saves) — note on sheet, no number changes; club → cleaver | `gnomes/` — a soot-grey gnome woman |

Carries **`nathryldhaun`**. Linked, green ring. Standing at the counter, cleaver in hand, fish
half-gutted.

**Why a deep gnome.** Svirfneblin are the drow's oldest Underdark enemies, which is exactly why one
can be here: a bond-cook (indentured, not enslaved — there is a paper, and a term) feeding the
Barrabin barracks under a House licence is a trophy and a convenience at once. She has four years
left on the bond and counts them.

**Personality and wants.** Brisk, funny when she forgets to be afraid, feeds people as a reflex.
Wants her bond paid down, her kitchen-boy back (**Skritch**, the kobold in the prison kitchen, was
requisitioned from her last season), and the three men at her oven-back gone before they crack her
flue.

**Social hooks.**
- *Feeds them first.* Three starving sunskins at her counter get fish-stew without asking;
  Caven's "Starved" tell is the reason. Then she asks what they will give for it. Anything true
  about the surface (she has never seen it) is enough.
- *The oven vent.* She hears everything the crew says through the flue and has understood about a
  third of it. For a kindness (**DC 10 Persuasion**, free if anyone mentions Skritch by name), she
  will say: "There is a flask in my vent and a House man in my lane, and the one with the voice
  said *Hollow Moon* twice. I do not know what that is. I do know they will kill me if they think I
  heard." That is the cheapest route to the group-8 secret on the map, and it puts her life in the
  party's hands — which is the point.
- *What she can do.* Her back door opens on the oven-back corner (the crew's exit). She can bar
  it from inside, which traps the crew's retreat if the party wants a fight; she will do that only
  if they promise to take her with them or to get Skritch out.
- *What she fears.* The crew. The Watch finding sunskins at her counter (her bond is revocable).
- *GM:* she keeps the bond paper in the cheese crock. If the party burns it, she is free by drow
  law — no paper, no bond — and she knows it.

**Tells.** *Bond-cook* (History 11): "A deep gnome in a drow kitchen, with a House stamp on the
counter. Bonded, not enslaved — there is a paper somewhere." · *The flue* (Perception 12): "She
keeps glancing at the oven every time the fire pops. Something is behind it that she can hear." ·
*Counting* (Insight 13): "Four notches on the counter's edge, one cut fresh. She is counting years."

---

## What the map does as a whole

Three threads cross: **Barrabin's people** (1, 3, 6, 4b — who will raise the alarm if mishandled),
**Ilphrin's play** (7, 8, and the lookout — a poison and a tunnel, and a buyer for the party),
and **the Hearth** (7, 4c, and the tunnels under the canal — the only way out of the ward that is
not a gate). The civilians (2, 4a, 5, 9) are the ways to learn any of it without a roll of
initiative. A party that talks can leave the ward through the west grate with a full stomach and
a House secret worth more than their gear; a party that burns gets the Street Patrol in ten
minutes and the Veiled Sons at their back.

## Build order (for the builder)

1. `A.ensure` the two new attributes above (lore rows: add `id: foundry.utils.randomID()`, `hold: false`, `miss: ""`).
2. Create actors from the MM blocks by compendium UUID (`Compendium.dnd-monster-manual.actors.Actor.<id>` — the digest in the scratch notes has them), rename, swap art and ring subject, apply the reskins and the drow overlay, write bios (player prose + `<section class="secret">` GM notes), add lore rows, link attributes (`A.link`), set Ilxaer's conceal flag.
3. Place each on its marker centre, 1×1, Neutral; `sleeping` + `prone` on group 6; consume the 24 markers.
4. `A.broken(actor)` must be `[]` for every carrier. Preview Ilxaer with `S.preview` and confirm the House Ilphrin rung reads DC 14 on him and DC 10 on Saelzir.
5. Record the actor ids in `context/pentaryn.md` under a dated heading.

## Bar additions (built 2026-10-08)

These are Joe's new 8s and 9s inside the Cooling Trough. They are separate from round-1 groups 8 and 9. The actor subfolders under `Encounters/Molten Ward` are `Bar · diners` (`hz1wgPLcz0oA3Kwo`) and `Bar · corner contract` (`s7XO89EAaoyEt5ui`). Every token is 1×1, linked, Neutral, green ring, with sight on at racial darkvision. All six markers were consumed.

| Token | Actor | Who | Block | Attributes | Tell |
|---|---|---|---|---|---|
| `TyX7TqlE9X1DaJHt` | Crust Hoarder `PkZM8b6SjUzvmGVO` | poor drow copyist (art: dusk-elf) | Commoner | `nathryldhaun` | Bread up the sleeve (Prc 9) |
| `SHp2G8cOA7ZulfI6` | Gristle Chewer `UpPvT4DwDAtwoO38` | duergar slag-hauler | Commoner | `nathryldhaun` | Slag-burns (Prc 9) |
| `cq9Vg0FsCeqD2wB6` | Spoon Banger `CTZCzSamiL8EZ6E7` | goblin thrall on his meal-break | Commoner | `nathryldhaun` | Off the leash (Ins 9) |
| `eVLjpyH8je35Ge5Y` | Bowl Licker `Uu8x7ZSuukJ8JWNt` | kobold kitchen-runner | Commoner | `nathryldhaun` | Licked clean (Prc 8) |
| `VtHvSRz0czyIdpCG` | **Zelvra** (ZEL-vrah) `1ma22aOI3kek8QaH` | drow, lesser purse-steward of House Barrabin | Spy, CR 1 | `housebarrabin` (conceal +3, so DC 13), `nathryldhaun` | six, Prc 9 to His 19 |
| `pFXNZgTaANIsIbJ9` | **Dugbor** (DUG-bor) `qeBDyB4wyOBDv9tZ` | dwarf factor and arbiter of the Garhammar Trade League | Warrior Veteran, CR 3 | `garhammartradeleague` | five, Prc 9 to Ins 16 |

Each diner's GM note holds one line of gossip that points into the web: the Watch is paid late, the west grate was opened twice, the "blind table" has dwarf money at it tonight, and Skritch was taken.

**The contract.** Barrabin's purse is empty and the cell-block payroll is due at the next dimming. Zelvra is borrowing arms and wages from the Garhammar League. The security is "the labour of the lower cells, the next three lots", and the pledge list includes the three sunskins. She seals it with her own steward's seal, not the Matron's, so nobody above her knows. Dugbor's penalty clause pays double if the collateral is short, so he would rather the party stayed escaped.

**Why the corner.** It is the Trough's *blind table*: the barman never serves it and nobody at the bar looks. Anything signed there was "never said in a House's house". A pledge witnessed in a House tavern goes in the House book. A pledge of souls owes the priesthood its tenth, and Shivaen is at the end of the bar. The canal window's lava hiss also covers their voices.

**Levers.** The paper proves Barrabin's weakness. Saelzir would buy it, and Borgra counts it as proof against Barrabin. Held over Zelvra (DC 14), it gets the party a steward's transfer chit. Dugbor sells League hand crossbows on credit (DC 13).

**Review pass, same day.** A concurrent pass had already given every round-1 actor value-scaled tells. This pass added only the three that were not already covered: Maelvir *Silt* (Nat 12), Ralzeth *The way out* (Ins 14) and Ilxaer *Who he fears* (Ins 13). Its duplicates were removed.

---

# Round 2 — Joe's second set of markers (designed 2026-10-08, not built)

Five marker groups placed after round 1 was built. Same scene, same offset (image px = canvas −
(1200, 750)), same conventions as above, plus three the first build got wrong or did not have:

- **Medium creatures are 1×1 with `texture.scaleX/scaleY = 1`** on the placed token *and* the
  prototype. Round 1 shipped art at scale 2; do not repeat it.
- **Sight on.** `sight.enabled: true` with the race's darkvision as the range: drow and duergar
  120, dwarf 120 (2024), half-drow 60, human and halfling 0. `pentaryn-senses` keeps the token on
  the sheet's Darkvision once vision is enabled, so set the sheet value too.
- **Failure text is shown to the player** when written (`miss` on a lore row or attribute). Every
  `miss` below is empty unless it says otherwise, and the ones that are written are partial
  impressions, never "you failed", never the pass text.

Joe's new **8s and 9s** inside the Cooling Trough were built concurrently on the same day (see
*Bar additions* above): Zelvra's Garhammar loan and the four diners. They are not part of this
round, but two of its threads touch them — Dugbor the League arbiter and Brother Drogmok-dur (group
2) are the only two dwarves in the ward, and Kelzaer's stamp (group 3) is the hand Zelvra is hiding
her seal from.

Art check crops for this round: `crops/group-1.jpg` … `group-5.jpg`, `group-4-room.jpg`, and the
surface candidates in `cands/` (scratchpad, session-only).

| Group | Who | XP | Feel |
|---|---|---|---|
| 1 | the way up — a scene link, no creature | — | the end of the run |
| 2 | four surface clerics in the Witness-chapel | 600 | not a fight; a truth-game |
| 3 | the licence inspection gathering at the chapel door | 1,610 | easy; the one place on the map where sunskins are *expected* |
| 4 | Orrin the chandler, who could go any way | 10 | not a fight |
| 5 | the Chain Gate post, six strong | 7,000 | **Low+**, a wall; beatable, and the wrong way |

Walkability (checked 2026-10-08 with the flood-fill in `scene-links.md`): every square in this
round and the exit square share component 3 (310 squares) with the prison arrival square at
(4500, 3600). Nothing is walled in.

## 1 — The way up (Marker 1 → scene link, new surface scene)

**Marker:** `Gg8DFcbLqUzqamwE` (1493, 854) → centre (1512, 873) → grid square **(1500, 750)**,
column 2, row 0. **Art check (`crops/group-1.jpg`):** the north-west lane where it runs off the
top of the map between the corner store and a crate against the east wall; the canal glows to the
south-east. A street leaving the ward, not a door. Nothing is placed here; the marker becomes the
link square and is consumed.

### The surface map

**Chosen: `Mines Forest`** from `pentaryn-seafoot-maps` — entry `"Mines Forest"` in
`modules/pentaryn-seafoot-maps/scenes.import.json`; art
`modules/pentaryn-seafoot-maps/maps/mines-forest-150-dpi-vtt.jpg` (4500 × 3000, grid 150,
padding 0.25 → same 1200/750 offset as the ward); **359 walls** (the cliff edges and the five mine
shafts, each boxed as its own square), **0 lights**, darkness 0, global light already on. Importing
the entry brings the walls with it.

*Why this one.* Green, trees, a stream with three footbridges, and **five mine-shaft mouths** —
and a mine mouth is the only honest way a party comes up out of the Underdark onto a forest map.
They do not step from a drow street into a glade; they climb an old duergar adit for an hour and
the dark stops. It is also small in feel: one clearing, one stream, nothing to explore, which is
what "you made it out, the run is finished" wants. Rejected: `Forest` (prettier, but there is
nothing to have come out of), `Dungeon Entrance at the Edge of the World` (grey rock with 22
torch lights — it reads as night), `Elven Forest` (treetop platforms, too specific a place),
`Forest road` / `Rocky Foothill` (no exit, and a road implies somewhere to go).

*The fiction.* **Kharg's Adit.** The fire-keepers' founder cut air- and ore-adits up to the
surface when he cut the channels; this is the last one the Hearth still knows, and the Houses have
forgotten. It is why Borgra can sell a "night in the tunnels" at all — and it is where the west
grate goes, if the party ever earns it. Joe's run ends at the top of it.

| | |
|---|---|
| Scene name | **`Surface — Kharg's Adit`** |
| `navName` | `Kharg's Adit` (player journals show navName as provenance; `scene.name` is never shown) |
| Folder | new Scene folder **`Surface — Candidates`**, `navigation: false` on the scene — off the nav bar like `Drow City — Candidates` and `Underdark — Candidates` |
| Light | darkness **0**, global light **on**, darkness *not* locked, no lights needed — daylight |
| Ownership | `ownership.default: 0` like every other scene; reachable by teleport |

Build: `Scene.create(...)` from the import entry with `_id`s stripped, `flags.core.sourceId`
dropped, `background.src` set to the art path (the entry carries none — it is keyed by name),
`name`, `navName`, `folder`, `navigation: false`; keep `walls`, `grid`, `padding`, `environment`.
Then the link below. Record the new scene id in `../pentaryn.md`.

### The link — matching the Prison ↔ Molten Ward pair exactly

**Return square on the surface: canvas (1950, 1950)**, cell [5, 8] — the trodden grass just
south-west of the first mine mouth (the shaft graphic is the boxed square at canvas 2100–2250 ×
1800–1950; the arrival lands *outside* it, on the path that runs down to the footbridge). Checked
offline against the import's walls: component 4, 357 squares, the whole clearing. The builder
re-checks live with the flood-fill snippet before placing.

| Scene | Region | Square (canvas) | Tile |
|---|---|---|---|
| Molten Ward `iBdyqCrrPLU3DHMe` | `Passage → Kharg's Adit` | **1500, 750** | `travel-ring.webp`, alpha 0.45 |
| Surface — Kharg's Adit (new) | `Passage → Molten Ward` | **1950, 1950** | `travel-ring.webp`, alpha 0.45 |

Settings copied from `NrQnAYE6sHkDSRvj` / `xtJm1Mp8BhRZ7nb1`: `teleportToken`, `choice: true`,
`placement: "center"`, `snap: true`, `revealed: true`, `transition: { type: "fade", duration: 1500 }`,
region colour **read off `NrQnAYE6sHkDSRvj` and reused** (the violet the other links wear),
`visibility: LAYER_UNLOCKED`, **live, not hidden**. Cross-reference `system.destinations` on both
behaviors. Both tiles carry `flags.pentaryn.travel = { regionId, regionUuid }`. **Portal cards**
(`flags["pentaryn-portals"]`, snapshot via the Region config → Appearance → Portal card camera, so
the art lands in `assets/tokens/custom/portals/` like the others) on both regions:

- On the **surface** region (shown in the dialog when leaving the ward) — title
  **"Kharg's Adit — up to daylight"**; description: *"The lane ends at an iron-strapped door the
  fire-keepers have not opened in years. Behind it a duergar adit climbs for an hour in the dark,
  and then the dark stops. Green, and trees, and a stream you can hear before you see it. The run
  is over."*
- On the **ward** region (shown when coming back) — title **"The Molten Ward — the north-west
  lane"**; description: *"Back down the adit into the red-lit ward. The lane comes out behind the
  corner store, a crate against the wall, the canal glowing to the south-east."*

Then consume `Gg8DFcbLqUzqamwE`.

*Notes for Joe.* The link is live from the first minute; the whole map lies between the prison
square (bottom right) and this one (top left), which is the run. If the run should end only when
you say so, set `hidden: true` on the ward region and flip it at the table — `hidden` is the
region's on/off switch. A GM must be logged in for a player's crossing. The arrival rewrites
`rotation` (a known v14 quirk); restore 0 if a facing matters. On the surface the travel-ring tile
is visible on its own (no darkness), so no badge is needed there.

## 2 — The Witness-chapel: four clerics

**Tokens:** `DY9dqXcFlE55VfuU` (1363, 2400) north-west · `VRHc4mDUHp60AZMC` (1607, 2411)
north-east · `g59Yb2rVdM5brIg1` (1544, 2606) south-east · `rB2A9KQvuTd4DLm2` (1408, 2597) south-west.
**Art check (`crops/group-2.jpg`):** the long hall in the map's south-west corner: a stone floor
with a dark runner down the middle, two tiered wooden racks (benches) along each wall, and at the
south end an altar table with a **hooded, robed statue**, a **sword** and an **open book** laid in
front of it. The north door (two door segments at canvas y 2100, x 1350–1650) opens on the street
where group 3 is standing. Round 1 guessed this hall was the ward's Lolth chapel; that guess is
**withdrawn** — a Lolth chapel has a spider, not a hooded figure with a book, and Joe has put
clerics in it. The ward's Lolth presence is the priestess at its door.

### Explainer for Joe: why foreign clerics can stand in a drow ward

In the drow cities the novels built, no temple but Lolth's stands — but *heresy is a drow crime*. A
dwarf praying to a dwarf god in the Bazaar is "foreign filth", taxed and sneered at, not a heretic
to be hunted; and the Houses, pragmatic before they are pious, use any service that serves them
and pays. Drow do not trust each other's word, and a House that trades with the surface (the Grey
Road runs to Merrowgate) needs a deal with outsiders to be *enforceable*. That is a service only a
foreign cleric can sell: a chapel where oaths are sworn under *Zone of Truth* and written in a
register the Houses accept as paper. So the chapel is licensed the way the Hearth is — as a
**counting-house with a statue**, never called a temple — taxed, inspected (tonight), and kept on a
leash that is also a hostage: four surface clerics who may not leave, whose licence is the only
surface foothold in the city, and who despise the people who grant it exactly as much as they are
despised back. "Not friends of the drow, tolerated in the city" is precisely what they are, and the
Register on the altar is why the city gets involved. If Joe would rather not have a Merrowgate
order here, the fallback that keeps the same shape is **duergar oath-smiths of the Hearth** (Dulgarum's
oathbinders in grey-dwarf form) — change the names and the parent attribute, keep everything else.

### The Hooded Witnesses

Merrowgate's chartered oath-clergy. Their god is **the Witness**, who hears every oath and takes no
side; the statue is hooded because the Witness sees and does not look. The sword on the altar is
what falls on an oath-breaker; the book is the **Register of Oaths**. (GM: whether the Witness is a
face of Merrowgate's rumoured Silent Patron is the vault's open question — the chapel does not
answer it, and the Prior does not know.)

| Token | Name | Race / role | Block (MM 2024) | CR | Reskin | Art |
|---|---|---|---|---|---|---|
| g59Y (altar, east) | **Prior Edrow** (ED-row) | human male, 60s, Prior of the chapel | Priest | 2 (450) | Radiant Flame → "Witness-brand" (radiant, same dice); Spirit Guardians → a ring of whispered oaths (radiant); mace → the iron-bound Register (bludgeoning); **add *Zone of Truth*** (prepared, `dnd5e.spells24`) — the order's signature | `humans/` — a grey, careful old man in a hooded grey habit |
| rB2A (altar, west) | **Sister Thornmere** (THORN-meer) | human female, 30s, the chapel's hand | Priest Acolyte | ¼ (50) | as above, minus Zone of Truth | `humans/` — a hooded woman with a candle-taper |
| DY9d (north-west, by the racks) | **Brother Drogmok-dur** (DROG-mok-DOOR) | dwarf male, Dulgarum-born convert, doorkeeper | Priest Acolyte | ¼ (50) | as above; Darkvision 120; mace → a short iron staff | `dwarves/` — a grey-bearded dwarf in a hood, the only one standing like a fighter |
| VRHc (north-east, by the racks) | **Novice Bramblepin** (BRAM-bl-pin) | halfling female, 19, novice | Priest Acolyte | ¼ (50) | as above; a lit candle in hand (flavour only) | `halflings/` — a small hooded figure holding a polishing cloth |

Linked, green ring, Neutral. **State:** Edrow at the altar, the Register open, checking the
tithe-count against it for the inspection; Thornmere lighting the altar candles (give the altar a
small warm light, dim 10 / bright 5, so the statue can be seen — the hall has no lava glow);
Drogmok-dur at the north racks "tidying" and watching the street through the door; Bramblepin
polishing the altar plate, frightened. Sight on: dwarf 120, the humans and the halfling 0.

**Personality and wants.**
- *Edrow* is tired, exact, and has made his peace with a bargain he cannot say aloud. Wants the
  licence re-stamped tonight and his three people alive next year. Fears the priestess, and the
  question "what did you witness for the Grey Road".
- *Thornmere* is the practical one and the kind one; she runs the chapel while Edrow prays. Wants
  the inspection over. Fears being made a thrall — she has seen what the ward does to surface women
  without paper.
- *Drogmok-dur* hates drow the way Dulgarum hates them, and took the hood to be allowed to stand
  in their city and hate them to their faces. Wants a reason. Fears nothing he will admit to.
- *Bramblepin* wants to go home to Merrowgate and has understood this year that she will not. Fears
  everything, and cannot lie under the Witness's roof even when nobody has cast anything.

**Social hooks.**
- *Opening.* Three sunskins through the north door are, for once, **not strange**: surface people
  are expected in a surface chapel. Drogmok-dur sees what they are at once (prison-thin, no escort,
  no paper) and says nothing; Edrow looks up from the Register and says "Shut the door. The Seat is
  on the step."
- *What they accept: an oath.* The Witnesses do not deal in lies, they deal in sworn truths. Edrow
  will cast *Zone of Truth* (or simply ask, with the statue behind him) and ask one question: *"Will
  you shed blood in this ward tonight?"* A party that can say "no" and mean it has him. There is
  no roll for this — it is a truth-game, and it binds the party as much as him. If a PC will not
  swear, **DC 14 Persuasion** gets Thornmere's help instead of the Prior's, which is less.
- *What he can do: sanctuary.* The licence grants **the right of sanctuary to persons under
  contract** — thralls in dispute wait in the chapel until a House claims them. Escaped prisoners
  are not under contract; but Nalveth's intake ledger logged a Merrowgate "lot" (the Grey Road
  caravan — see group 5, round 1), and two of the party are human. Edrow can **enter them in the
  Register as "the Merrowgate lot, mis-booked, held for the Witness pending dispute"**, and that
  entry passes the inspection party at the door (group 3: Kelzaer checks the Register, finds them in
  it, and shrugs). It costs Edrow his neck if it is ever read back against the prison ledger; he
  will do it only on the oath above. It buys the party one dimming in the chapel, which is a
  short rest, and a paper reason to be walking the ward.
- *What he will not do.* Lie to the priestess if she asks him a direct question — the Witness
  forbids it, and Bramblepin would answer before he could anyway. Fight: never. Edrow puts his body
  in the door; Drogmok-dur would fight and has been forbidden to.
- *Drogmok-dur's side door.* He drinks with Maelvir the fire-keeper (round 1, 4c) — a dwarf and a
  half-duergar, enemies by blood, friends by being the only two people in the ward who can talk
  about stone. He knows the keepers' grate under the canal exists, and that Maelvir carries the key.
  **DC 12 Persuasion**, free if a PC says a true thing about Dulgarum or Lone Peak (Talo's mountain
  counts — any mountain does, to him).
- *What they fear, which is the lever.* The inspection is **tonight**, at the door. Anything the
  priestess finds irregular ends the licence: four more surface thralls, and nobody in the city to
  witness the next Grey Road paper. A party that threatens to be found here is holding a knife to
  all four; a party that offers to leave quietly before the door opens will be shown the vestry (the
  racks' back wall has a hatch to the kitchen lane — not a scene exit, a hiding place).
- *GM:* **The Register holds the Grey Road sale, witnessed here, in Edrow's hand** — "Grey Road,
  one lot, people included, for the Merrowgate paper", the same cant as Ketharis's note. He
  witnessed the oath that sold Tomas and Edda Brell and told himself an oath is an oath. A PC who
  has read Ketharis's desk and then this book can say so to his face, and it breaks him — advantage
  on everything after, and he will do the Register entry without the oath. He does not know the
  caravan's people are in the prison; telling him is a thing the party can give.

**Attribute (new; create first).** `A.ensure("The Hooded Witnesses", { category: "order",
parent: "merrowgate", dc: 12, skill: "rel", secret: true, whenKnown: "advantage", whenCarried: "auto",
hold: false, reveal: "A grey hood worn up indoors, and a plain iron ring on the oath-hand. One of
Merrowgate's Witnesses — the clergy who swear in contracts.", miss: "" })` with lore rows:

- *What they do* (Religion 10): "They witness oaths. An oath sworn under the Witness's hood and
  written in the Register is a contract any city on the Grey Road will enforce — and so, it turns
  out, will this one."
- *Why the drow allow them* (History 12): "No drow trusts another drow's word, and a House that
  trades with the surface needs paper the surface will honour. The chapel is licensed as a
  counting-house, taxed, and inspected by the Seat. Its clerics may not leave the ward."
- *The right of sanctuary* (Religion 14): "The licence lets persons under contract wait in the
  chapel until a House claims them. It was written to stop Houses stealing each other's thralls. It
  has other uses."

All four carry **`thehoodedwitnesses`** — `A.link` writes **`merrowgate`** onto them too, which is
right: the order is Merrowgate's charter and a PC who placed Tomas or Edda rolls here at
advantage. (Drogmok-dur is Dulgarum-born but *of* Merrowgate by charter; leave it.) No
`nathryldhaun`: they are not of the city, and the reveal must not say they are.

**Tells (lore rows on each NPC).**
- Edrow — *The oath-hand* (Perception 10): "An iron ring worn on the right thumb, and the thumb
  is ink-black to the knuckle. He signs things for a living." · *What he is reading* (Investigation
  12): "The open book is a register of oaths, in several hands. He is checking the last page
  against a tally of plate and coin — counting what someone is about to count." · *A bargain kept*
  (Insight 14): "He looks at you the way a man looks at a debt he has already decided not to pay.
  Whatever he is, he is not afraid of you."
- Thornmere — *The hand of the house* (Perception 10): "Candle-wax on the sleeves, keys at the
  belt, soot on the hood. She runs this place." · *What she will not look at* (Insight 12): "She
  has not looked at the north door once, which is the only thing in the room she is thinking about."
- Drogmok-dur — *A dwarf in a hood* (History 11): "A Dulgarum beard under a Merrowgate hood. He
  did not come to this faith for the faith." · *Doorkeeper* (Insight 12): "He has placed himself
  where a man stands to stop someone coming in, and he is enjoying it."
- Bramblepin — *Cannot lie* (Insight 10): "Every thought she has arrives on her face a moment
  before she has it. Ask her anything and she will tell you; so will anyone else who asks."

## 3 — The inspection gathering at the chapel door

**Tokens:** `92SFSJeIjRlkGF1e` (1459, 1874) north-west · `L7lwxjw8Iz3L4gxv` (1555, 1873)
north-east · `ONiY9rzowMIKsFLm` (1441, 1986) south-west · `1XncImAtCdTeBXGq` (1551, 1991) south-east.
**Art check (`crops/group-3.jpg`):** the open street immediately north of the chapel's north door,
a crate against the east wall, the lane running north to the junction and the canal. They stand in
a loose square ten feet from the door, waiting to go in.

**What the inspection is.** The chapel's licence is re-stamped once a year by **the Seat** (the
priesthood) with **House Barrabin** co-signing, because the ward is Barrabin's. Tonight is the
night. A priestess to be seen, a House steward to do the counting, a clerk to carry the seal, and a
blade. They are **getting ready**: the priestess is finishing her ember-pipe on the crate, the
clerk is sorting papers on the crate's lid, the steward is rehearsing the tally under his breath,
the blade is bored.

| Token | Name | Race / role | Block | CR | Reskin | Art | Attributes |
|---|---|---|---|---|---|---|---|
| L7lw (north-east, on the crate) | **Nedylene** (NED-ih-leen) | drow female, priestess of the Seat, a Barrabin cousin | Priest | 2 (450) | Radiant Flame → "Spider's Bite" (necrotic, same dice); Spirit Guardians → spectral spiders; mace → snake-headed rod; drow overlay | drow-with-magic-pipe | `housebarrabin`, `nathryldhaun` |
| 92SF (north-west) | **Kelzaer** (KEL-zair) | drow male, House Barrabin's Steward of Licences | Mage Apprentice | 2 (450) | Ice Knife → "Web-shard" (piercing + cold); Disguise Self kept; carries the tally-slate; drow overlay | drow-caster | `housebarrabin`, `nathryldhaun` |
| 1Xnc (south-east, by the door) | **Dinzael** (DIN-zayl) | drow male, 20, the clerk | Commoner | 0 (10) | club → a seal-box on a strap (it is a weapon only if thrown); Darkvision 120 | drow-determined | `nathryldhaun` |
| ONiY (south-west, lane mouth) | **Tazrin** (TAZ-rin) | drow male, House blade, escort | Warrior Veteran | 3 (700) | greatsword → longsword and shield (same dice); heavy crossbow → hand crossbow with drow poison; drow overlay | drow-sellsword | `housebarrabin`, `nathryldhaun` |

Nedylene, Kelzaer and Dinzael linked (they carry state), green ring; Tazrin unlinked, grey. All
Neutral. Sight on, darkvision 120. XP 1,610 — easy, and not the point.

**The rank lesson, again, with a twist:** the priestess outranks the steward, who outranks the
clerk, who nobody notices; the blade reports to the steward and obeys the priestess. But tonight
the *steward* is the one who matters — Nedylene is here to be seen and would rather be at the Seat
before the Feast; Kelzaer is the one with the stamp. Players who work out who to talk to (Insight
12 on the group) skip the priestess entirely.

**Personality and wants.**
- *Nedylene*: languid, cruel for sport, bored by this ward. Wants to be gone; wants, secretly, a
  reason to revoke the chapel's licence, because a surface chapel in a Barrabin ward is an
  embarrassment she has been sent to tolerate. Fears nothing on this map; fears a senior priestess
  hearing she was *useful* to sunskins.
- *Kelzaer*: a House male with a stamp, which is the most power a House male gets; precise, venal,
  frightened of her. Wants the tally to balance and a gift "for the House" that stays in his sleeve.
  Fears her seeing him take it.
- *Dinzael*: wants to not be noticed, and is good at it. Carries the seal-box — **Barrabin's licence
  seal**, which forges a House stamp the way Nalveth's Registrar's Seal does.
- *Tazrin*: wants the round over; has been told sunskins are "alive, worth money" and is doing the
  sum.

**Social hooks.**
- *Here, sunskins are normal.* This is the one spot on the map where three surface people walking
  up to a surface chapel are what the street expects. Kelzaer's question is not "who are you" but
  **"Whose paper?"** — "Merrowgate's" passes at **DC 10 Deception** (advantage if a Witness is in
  earshot and nods; **no roll** if Edrow has already entered them in the Register, because Kelzaer
  reads it). "Ilphrin's purchase" makes him blink and Nedylene look up: wrong answer, interesting
  answer — she sends Tazrin to the Hearth to ask, and the party has the length of his walk.
- *The bribe.* Kelzaer will "not count you" for anything with a House value — the party has
  nothing, but a promise against "the sunskins' gear in the Keeper's chest" is a thing he has heard
  of and wants (**DC 13 Persuasion**). He will not take it where she can see; a PC has to get him
  three steps up the lane.
- *The dark lever.* Nedylene wants the chapel's licence gone. A PC who hands her an irregularity —
  "the Prior hides people", "the dwarf has a grate key" — gets her delighted attention and a
  **pass through the ward under her name** (a word to any post, including the Chain Gate). It costs
  four clerics their freedom. It is the cheapest way out on the map, and the party should feel the
  price. Drogmok-dur, if alive, will remember.
- *What they fear.* Kelzaer: her. Dinzael: both of them. Tazrin: the sum coming out wrong. Nedylene:
  being wrong in front of a senior; she will not act on a sunskin's word without something she can
  show.
- *If it goes wrong.* Tazrin draws and blocks the door; Nedylene casts *Bless* then *Spirit
  Guardians* and walks at the softest PC; Kelzaer casts *Thunderwave* to open the lane and **runs
  north for the Chain Gate** (group 5 — that is the alarm this time, forty seconds of running);
  Dinzael gets behind the crate with the seal-box and keeps it. Capture rather than kill: "alive,
  worth money". If Nedylene drops, Tazrin surrenders; Kelzaer never comes back.
- *GM:* the inspection goes into the chapel in **ten minutes** of real play from the party's
  arrival on the map. If the party is inside without a Register entry when the door opens, Bramblepin
  answers the first question honestly. Dinzael's seal-box is the second forging tool on the map; a
  stamped blank chit (he carries three) passes any post at the Ketharis chit's DCs.

**Tells.**
- Nedylene — *The pipe* (Perception 10): "An ember-pipe, lit, on a House errand. Nobody has told
  her to hurry and nobody will." · *Who she hates* (Insight 12): "She looks at the chapel door the
  way you would look at a stain. She has been sent to tolerate it." · *Cousin, not daughter*
  (History 14): "The sigil on the rod is Barrabin's, but the rod is plain. A cousin of the House,
  not of the line — sent because somebody had to be."
- Kelzaer — *The stamp* (Investigation 11): "A seal-ring on a cord, not a finger. It comes off to
  be used, and it is the only thing about him that is not nervous." · *What he is counting*
  (Insight 12): "He is rehearsing numbers. Somebody is about to be counted and he has to get it
  right."
- Dinzael — *The box* (Perception 11): "A flat iron box on a strap, kept under the arm. Papers,
  ink, and something that clinks — a seal and its wax." · *Nobody* (Insight 10): "He has made
  himself the least interesting person in the street, which is a skill."
- Tazrin — *Doing the sum* (Insight 12): "He has looked at each of you once and is now looking at
  nothing. He has worked out what you would fetch."

## 4 — Orrin the chandler, who could go any way

**Token:** `Tg8BF5hLwtQZQZSu` (1850, 1716). **Art check (`crops/group-4.jpg`,
`group-4-room.jpg`):** the lane corner under the canal wall, a crate at his feet; through the open
door east, a narrow stone-floored shop with **two tall hanging-racks** along its east wall and a
**counter** at the south end. The racks hold dipped candles by their wicks; the counter is where he
sells them. That is the "little stall": a tallow-chandler's.

| Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|
| **Orrin** (OR-in), tallow-chandler | half-drow male, 30s, ward-born | Commoner | 0 (10) | club → a dipping-pole; Darkvision 60 | `humanoid-races-misc/` or `humans/` — a thin grey-skinned man with cropped white hair and a tallow-stained apron |

Linked, green ring, Neutral. Carries **`nathryldhaun`**. Standing in the lane with a crate of
tallow blocks, waiting — he is waiting for Kelzaer (group 3) to come past, because his tallow
licence is stamped by the same hand tonight.

**Why a chandler.** Everyone in the ward buys light from him: the chapel its altar candles, the
Hearth its tallow, the barracks its lamps, the Trough its tapers. He knows everyone's door and
owes everyone a little, and he is the cheapest light on the map for a party that has none —
Caven's shard and Marrith's runes do not light a corridor; a bundle of his candles does.

**Personality.** Pleasant, pliable, watchful; a man whose whole life has been not being on the
wrong side of whoever is in the street. He wants his stamp, his evening, and nothing to happen
near his shop. He has no opinion about sunskins yet, and that is the point.

**Three branches — write the trigger, not the outcome.**

| He… | When | Then |
|---|---|---|
| **Helps** | they buy (even on a promise against "the gear in the Keeper's chest" — he has heard of it); or anyone is simply kind; *and* nobody from group 3 is looking | sells a bundle of six candles and a shuttered tin lantern; says the chapel door is "the Seat's tonight, not yours"; says the Trough's back door opens on the canal street; and will walk them **past the inspection party as his carriers**, a tallow-bundle each on the shoulder — his lie, their faces: **DC 11 Deception**, advantage if they are actually carrying his crate |
| **Ignores** | they walk past; they haggle and buy nothing; they ask him nothing | keeps dipping. Says nothing to anyone, because saying things costs. If asked later by Kelzaer he says "three sunskins, going west", which is true and useless |
| **Sells them out** | they threaten him; they take anything; the priestess sees him with them; or Kelzaer asks him a direct question while the party is still in sight | tells Kelzaer everything he saw, at once, as the price of his stamp — and points. Not out of malice: his stamp is his licence is his shop |
| **Undecided** | nothing above has happened by the time it matters | Joe rolls a **d6: 1–2 helps, 3–4 ignores, 5–6 sells.** He is a bystander; the die is honest |

*GM:* his father is **Rhyzaen** (round 1, group 3, the House-born lieutenant at the bar), who does
not know and would not care. Orrin knows. A PC who says that name in front of him gets a flinch
and, if they are gentle about it, the help branch for free; if they are not, the sell branch. It is
the one thing in the ward he cares about more than the stamp.

**Tells.** *Half-drow* (Perception 10): "Grey, not black; the ears are a drow's and the jaw is
not. Ward-born — one of the people the Houses make and do not name." · *Tallow* (Investigation
11): "Wax under every nail, a dipping-burn across the palm. The racks through the door are his." ·
*Which way he is looking* (Insight 12): "He keeps glancing up the lane toward the four by the
chapel door. He is waiting for one of them, and it is not the priestess."

## 5 — The Chain Gate: six on the wrong way out

**Tokens:** `f6oLDBJFw5KhHReV` (3488, 825) north-west · `x9dsUDqKD229rUgO` (3608, 824) north-centre ·
`Y7L0EalW56Q2gkid` (3762, 846) north-east · `QoFaegfTUJleFlU0` (3457, 915) west · `M8MixrDJtRS5E5Ih`
(3542, 942) centre · `zrLyKl6UplXrWAzo` (3635, 915) east. **Art check (`crops/group-5.jpg`):** the
ward's north gate: the lane runs north off the map between two stone piers (canvas ≈ 3390–3490 and
3700–3800, y 1000–1100), crates stacked against the west wall, a barrel and crate against the east,
the lava canal on both sides south of the piers. The six stand **north of the piers, in the
gate-mouth**, with the **gate chain** slung pier-to-pier at waist height behind them: whoever leaves
the ward passes the post and then ducks the chain. (Joe can draw the chain with `pentaryn-senses`'
`chain.mjs` between two hidden anchor tokens on the piers, as the Pit-Hulk's is; optional.)

**What this is.** Barrabin's gate post on the ward's only land exit — the Pillar Road. Every post
in the city is a copy of this one. It is the wrong way out, and it is meant to look it.

| Token | Name | Race / role | Block | CR | Reskin | Art |
|---|---|---|---|---|---|---|
| M8Mi (centre, front) | **Gate-Sergeant Malvoryn** (mal-VOR-in) | drow male, the post's sergeant | Guard Captain | 4 (1,100) | longsword and shield; javelins → hand crossbow with drow poison; drow overlay; carries the **gate horn** and the chain key | drow-in-plate-armor |
| x9ds (north-centre, back) | **War-Mage Phaeryl** (FAIR-il) | drow male, House-born, posted here as a punishment | Mage | 6 (2,300) | Fireball, Counterspell, Misty Step kept; Arcane Burst → "Web-bolt" (force, same dice); drow overlay | drow-archmage |
| QoFa (west) · zrLy (east) | **Chain-Gate Soldier** ×2 | drow, rank-and-file | Warrior Veteran | 3 (700 each) | greatsword → longsword and shield; heavy crossbow → hand crossbow with drow poison; drow overlay | drow-soldier-1, drow-soldier-3 (one shared actor, per-token art) |
| f6oL (north-west) · Y7L0 (north-east) | **Pier Crossbowman** ×2 | drow, the pier sentries | Tough Boss | 4 (1,100 each) | warhammer → iron-shod club; **heavy crossbow kept, drow poison bolts**; Pack Tactics kept; drow overlay | dark-elf-with-scars, drow-angered (one shared actor, per-token art) |

All **`housebarrabin`**, **`nathryldhaun`**. Unlinked tokens for the four mooks; Malvoryn and
Phaeryl linked. **Grey rings on all six** — they are a wall, not a conversation, even though two
of them can talk. Neutral. Sight on, darkvision 120. **XP 7,000** — above Low (6,600), well under
Moderate (11,100): a level-12 party kills this if it decides to, and pays in resources and noise.

**State.** Malvoryn at the chain with the key on his belt, soldiers a pace behind on either side,
crossbowmen on the pier-tops with bolts nocked, Phaeryl at the back on the barrel, reading. They
are the only group on the map that is *already looking at the party* when it arrives in the lane.

**Personality and wants.** *Malvoryn*: by-the-book because the book is all a House male is allowed
to be; wants no incident on his gate. Fears Phaeryl, who reports to the House. *Phaeryl*: a
House-born war-mage posted to a chain gate for an insolence; bored, bitter, dangerous; wants his
posting back, and anything he can carry to the House to buy it. Fears being still here at the
Feast. The four: want the shift over, do what the sergeant says, and have each been told what a
sunskin fetches.

**Social hooks.**
- *The rules at the chain.* Nobody leaves the ward without paper or a House escort. A transit chit
  (Ketharis, round 1) passes Malvoryn at **DC 14 Deception** (he is stricter than Rhyzaen: this is
  an exit, not a bar). "Ilphrin's purchase" at **DC 16**, and he sends a soldier to the Hearth to
  check, which the party may not want. A stamped blank from Dinzael's seal-box (group 3) passes at
  DC 12. He takes no bribe in front of Phaeryl, which is always.
- *Phaeryl's price — the one way to be waved through.* He wants something to carry to the House.
  **Ilphrin's deal at the Hearth** (round 1, group 7) or **the Veiled Sons at the oven-back** (group
  8) is exactly that: a PC who names either, with a detail that proves it, gets Phaeryl's "I did not
  see three sunskins" for one minute and a soldier's cloak each (**DC 13 Persuasion** once the secret
  is on the table; no roll if they can show Borgra's written terms or Ketharis's note). It is the
  cheapest pass on the map — and it leads *the wrong way*, which Joe can let them discover on the
  far side of the chain.
- *What they fear.* Being the post that let the escapees through. Malvoryn will raise the horn
  before he will take a risk; Phaeryl would rather take the risk and own the result.
- *Nobody attacks on sight.* The post challenges — "Paper, sunskins" — and *waits*. Hands go to
  weapons only when a PC's do. Three casters with nothing in their hands are not an emergency to
  these six; three casters at the chain without paper are a profit.
- *If it goes wrong.* Crossbow volleys with poison from the piers (DC 13 CON, fail by 5 unconscious —
  the capture tool); the two soldiers hold the chain line and do not advance; Phaeryl Counterspells
  the first big spell, *Fireball*s the lane (Marrith is not immune — only her own damage is fire),
  Misty Steps to the pier-top; **Malvoryn blows the gate horn the round he is Bloodied**, which is
  the Street Patrol in ten minutes *and* the next post on the Pillar Road in five. If the party
  kills all six quietly (no horn), nothing on the map notices for a dimming.
- *What is lootable.* The chain key, the gate horn, six sets of House livery (a disguise for three),
  two hand crossbows with poisoned bolts, Phaeryl's spellbook (Fireball, Counterspell, Misty Step —
  Caven wants it).

**Beyond the chain — what Joe says when they kill the post and go through.** *"That is the Pillar
Road. It climbs out of the ward and into the city: past the Hour Pillar, past the House gates, past
a post like this one on every corner, and every post has a priestess within a shout. It goes
up, and in, and it does not go out. The way out of Nathryl Dhaun is not through it."* If they
insist, the next post is five minutes up the road: six more of these with a priestess instead of a
war-mage, and a Patrol behind them. The fiction is a dead end that costs more each step; the
honest exits are the west grate (the Hearth) and the north-west lane (group 1).

**Tells.**
- Malvoryn — *The key and the horn* (Perception 11): "A heavy iron key and a brass horn on the same
  belt. The key is for the chain. The horn is for everyone else." · *By the book* (Insight 12):
  "He has already decided what the rule is and is waiting to find out which one you break."
- Phaeryl — *House-born* (History 12): "Too good a cloak for a gate post. He was not born to stand
  here." · *Punished* (Insight 13): "He looks at the sergeant the way a man looks at a jailer he
  outranks. This posting is a sentence, and he is counting it." · *What he reads* (Perception 13):
  "The book on the barrel is a spellbook, open, and he has not turned a page since you came into
  the lane."
- Pier Crossbowman — *Already aimed* (Perception 10): "Bolts nocked, crossbows resting on the pier
  stone, pointed at the middle of the lane. They were aimed before you were a decision."
- Chain-Gate Soldier — *The line* (Insight 10): "They stand a pace behind the sergeant and will not
  step past the chain. The chain is the post; they are the chain."

## Round 2 — build order (for the builder)

1. **The surface scene first** (group 1): create `Surface — Candidates`, import `Mines Forest`
   as `Surface — Kharg's Adit`, verify the return square's component live, build both regions,
   both tiles and both portal cards, consume Marker 1. Record the scene and region ids.
2. `A.ensure("The Hooded Witnesses", …)` with its three lore rows (`id: foundry.utils.randomID()`,
   `hold: false`, `miss: ""`). Confirm `parent: "merrowgate"` resolved.
3. Create the fourteen actors (groups 2–5) in **`Encounters/Molten Ward`** (`28AGERcZneTpOxfY`) —
   a `Round 2` subfolder is fine — from the MM blocks by compendium id (`mmPriest00000000`,
   `mmPriestAcolyte0`, `mmMageApprentice`, `mmCommoner000000`, `mmWarriorVeteran`,
   `mmGuardCaptain00`, `mmMage0000000000`, `mmToughBoss00000` in `dnd-monster-manual.actors`).
   Rename, swap art and ring subject (never the MM token on a drow), apply the reskins and the drow
   overlay, add Zone of Truth to Edrow, write bios (player prose + `<section class="secret">` GM
   notes), add the lore rows, `A.link` the attributes.
4. Place each centred on its marker, **1×1, scale 1, sight on with the race's darkvision**,
   Neutral, rings as above; one small warm light on the chapel altar; consume the 15 markers of
   groups 2–5. Leave Markers 8 and 9.
5. `A.broken(actor)` is `[]` for all fourteen. `S.preview(Edrow)` shows the Witnesses rung at DC 12
   and Merrowgate above it at DC 10; a tier-15 study on any of them strips `.secret`.
6. Record ids in `../pentaryn.md` under a dated heading, including the new scene, folder, regions,
   tiles and the `thehoodedwitnesses` attribute.
