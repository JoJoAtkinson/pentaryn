---
name: Stirge
created: 2026-08-09
last-modified: 2026-08-09
status: active
location: goblin-raiders-scrubland-ruins
count: 2
tags: ["#combat-runner", "#beast", "#second-wave", "#goblin-raiders-scrubland-ruins", "#ardenhaven", "#cr-1-8"]
---
# Stirge

**HP** 5 (2d4) **·** **AC** 13 (natural) **·** **Speed** 10 ft., **fly 40 ft.** **·** **Darkvision** 60 ft. **·** **Passive Perception** 9 **·** **CR** 1/8 (25 XP)

> Action mechanics live in `combat-runner/actions.jsonl` — see the launcher's **Ready actions** reference for verbs. Same rows as the [harbour undercave](../../harbour-undercave/npcs/stirge.md) stirges; no new DB entries.

**[v3 — The Fifth Goblin](../_overview.md) only.** Two of them, roosting in the crack above the back passage where the warm air off the fire pit collects. They came **up the cut stair** behind the sheep pen on the second night after the goblins broke through the wall. They have taken the band's last sheep and had a go at two of the goblins, and they are the reason a warband with darkvision 60 ft has kept a fire lit for four nights in a cave it does not need light in.

**They are not the goblins' pets and the goblins cannot control them.** Nobody in this cave is on anybody's side.

**In v1 and v2:** the picker's minimum count is 1, so this sheet will always show up. **Leave it at 1 and never call `drop_from_the_dark`.** There is something in the crack; it does not come down; it is worth 0 XP because it never enters the fight.

---

## Start-of-turn checklist

1. **Are they down yet?** If not — **do not roll initiative for them.** They enter mid-fight via **Drop From The Dark**: the moment the fight reaches the back passage, the first real shout inside the chamber, or the instant **the fire pit is knocked over or goes out**. One Stealth roll of **1d20+3** for the pair vs. passive Perception; beat it and the first Proboscis has **advantage** on a surprised target.
2. **Is this one attached?** → **Blood Drain**, automatically, right now. **2d4 necrotic**, no attack roll, no save. It cannot attack while attached.
3. **Has it drained twice, or taken any damage?** → **Detach And Flutter.** Gorged ones leave for good; damaged ones climb out of reach and re-pick.
4. **Otherwise:** it is in the air. **Proboscis** the nearest warm body.

---

## Tactics — when the DM asks "what does it do?"

- **The fire pit is the trigger.** It is lit, it is in the middle of a 25 × 20 ft chamber with a 6–8 ft ceiling, and it is the only thing keeping these two up in the crack. Any AoE, any shove, any dropped torch, any goblin thrown into it — the fire goes out and they come down **that round**. A party that works this out has a weapon. So does a boss who is losing.
- **Nearest warm body, whoever it belongs to.** A stirge landing on a **goblin** is the best beat in the variant — play it, out loud, and let the archer on the boulder start screaming at his own boss for help. For one round everybody in the cave has the same problem, and it is very hard to go back to shooting each other afterwards.
- **Latch and drain.** Once attached it stops attacking and just feeds: **2d4 necrotic** at the start of each of its turns until someone spends an **action** to pull it off. Two drains will drop most level-1 casters. **This 25-XP creature is the one that kills somebody here.** Track which stirge is on whom.
- **It stays in the air.** Fly 40 ft, walk 10 ft — but the ceiling is only 6–8 ft in the main chamber, which means unlike a sea cave there is **nowhere truly out of reach**. A polearm, a thrown hand-axe, or a tall PC standing on the fire-pit stones can all get at one. This is the low-ceiling version of the fight and it is meaningfully kinder than the undercave's; lean on that if the party is already hurt.
- **An attached stirge is a legal target** — but it is on somebody, and misses and AoE go into the host.
- **No morale, because no loyalty.** They are not a faction, they are weather. They do not avenge each other and do not retreat as a group.
- **Gorged:** two drains and it is full. It detaches, climbs back into the crack to digest, and **does not come down again.** The party can end this variant without killing either of them, and should still be awarded the 50 XP.
- **They will not follow anyone out into the daylight**, and they will not go back down the stair while there is anything warm up here.

## Description (one line)

Something the size of a cat and the shape of nothing that should exist, all wings and legs and a needle where a face ought to be, coming out of a crack in the roof that the firelight has never once reached.
