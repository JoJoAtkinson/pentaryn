---
name: Sarn Kestle
created: 2026-08-09
last_modified: 2026-08-09
status: active
location: harbour-undercave
count: 1
tags: ["combat-runner", "humanoid", "smugglers", "harbour-undercave", "ardenford", "ardenhaven", "cr-1-2"]
---
# Sarn Kestle

**HP** 32 (5d8+10) **·** **AC** 12 (a boiled-leather chest piece under the oilskin) **·** **Speed** 30 ft. **·** **Athletics** +2 **·** **Passive Perception** 10 **·** **Languages** Common, Thieves' cant **·** **CR** 1/2 (100 XP)

> Action mechanics live in `combat-runner/actions.jsonl` — see the launcher's **Ready actions** reference for verbs.

**Pack Tactics.** Advantage on an attack roll against a creature if any ally of Sarn's is within 5 ft of it and not Incapacitated. With four crew on a narrow shelf this is live most rounds — check the map before you roll.

**Who he is:** owns the two good skiffs, keeps the tally slate, and is the only person in the cave who could end this for everybody. He has no interest in a fight he can price his way out of.

---

## Per variant (see [`_overview.md`](../_overview.md))

- **v1 — The Run:** unnamed. *The boss.* Run the block and the morale rules; skip the biography.
- **v2 — The Other Cargo:** the moment Iselle speaks, his morale clock is at its last step regardless of HP — **`call_it_off` fires on his very next turn**, and his terms change to *let the boat go and take everything else.*
- **v3 — Sarn Kestle:** the full character, and it layers cleanly over v1 *or* v2. **Play him reasonable** — not a coward, not a bluffer, not secretly cruel. Nineteen years on this coast, a crew he is responsible for, and a genuinely good deal to offer because it is genuinely the best outcome for everyone. He asks real questions and waits for the answers. He never threatens; he describes consequences flatly and lets the party do the arithmetic. He calls his crew by name mid-fight — **Onnet, Bray, little Pell, and Hass** on the walkway — and when one goes down and `wade_in` fires, he says the name out loud. **Killing him is worse for having talked to him first.** That is the design.

---

## Start-of-turn checklist

1. **Morale clock — has he hit a step?** At or below **16 HP**, *or* two of the crew down, *or* a credible offer on the table → **Call It Off.** Advance the clock one step every time **Wade In** fires. This is his **default action**, not his last resort — it sits at the top of the chip grid for a reason.
2. **Pack Tactics:** ally within 5 ft of his target? → **advantage**.
3. **Is the rule still on?** Nobody killed → **Mace**, nonlethal. A PC dropped by it is unconscious and **stable**. If a PC kills one of his crew, he stops offering terms and fights lethally to 0 HP.
4. **Wade In** (reaction) refreshes to AVAILABLE.

---

## Tactics — when the DM asks "what does it do?"

- **Before initiative:** he stands up off the gunwale, does **not** draw, and asks what the party wants. If the answer is *Willowglass sent us*, he names a price and this becomes a haggle instead of a fight. Let it.
- **Round 1:** he plants himself **between the party and the crates** and stays there. He does not open. Everything he does in this fight is about controlling how it ends.
- **Mid-fight:** **Mace** with Pack Tactics on whoever is doing the most damage to his crew. **Heavy Crossbow** only if he is cut off from the line — across the inlet, from a skiff, from a shack platform — and he will not stay at range once one of his own goes down.
- **Wade In:** the instant a crew member drops within 15 ft, he moves to them and puts himself in the way. That PC is his target next round, and his morale clock advances a step. Two of those and he is done.
- **Pommel & Boot:** only against a PC who is prone, grappled, or at 0 and still a problem. Nonlethal — unconscious and stable. He wants people carried out of this cave, not floated out of it. Bodies bring Tidemark Hold.
- **When the stirges drop:** he shouts one warning to the crew — *the roof, the roof* — and then keeps fighting. He has been in this cave before and he knew they were up there. He did not mention it.
- **At or below 16 HP, or two crew down, or any credible offer:** **Call It Off.** Terms are always the same: *take the crates, we take the boats, nobody says a name to Tidemark.* He means it, it is a genuinely good deal, and it does not come twice.
- **Award full XP for a surrender.** Say so at the table.
- **If a PC kills a crew member:** the offer is off permanently. He fights to 0 HP and so does everyone left standing.

## What he'll trade

He would rather sell the stock than lose it, and a party that opens with commerce gets a better outcome than a party that opens with initiative — **all eleven crates and the loan of a skiff** to move them, for a cut of what Hesta pays.

Press him and he'll admit the tally slate lists a Middle Tier buyer who isn't the Willowglass. He'll trade that name for the party's silence about the cave, and he will consider it a bargain.

## Description (one line)

A heavy-shouldered man in his forties sitting on a boat's gunwale with a slate on his knee, who puts the chalk down carefully before he stands up, because he intends to finish the sum later.
