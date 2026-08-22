---
title: "Retired — the on-sheet possession markers"
created: 2026-08-16
status: archive
tags: [oneshot, space-journey, foundry, archive]
---

# Retired — the on-sheet possession markers

**Why these were retired (2026-08-16).** Possession used to be marked with a feat item on the
**actor** sheet — `Oz's Vessel — Twenty Deaths (…)` or `Worn, Not Ruled (GM note — this is Oz)`.
An actor-level marker is permanent: it follows the actor into *every* scene they appear in. That
broke the moment two consecutive scenes shared one map and one cast — Harl Wetherby is Oz's host in
Scene 4 and an unconscious man on a bench in Scene 5, on the same actor.

Possession is now marked **per-token**, GM-only, via `pentaryn-ties` 0.5.0 —
`token.flags["pentaryn-ties"].worn = { by, note }`, Token HUD → masks-theater button. See
[`context/plans/foundry-npc-ties.md`](../context/plans/foundry-npc-ties.md).

**This file is the verbatim text of what was deleted**, so nothing is lost. The prose from the
`Worn, Not Ruled` notes was migrated into the token marks; the mechanical `Oz's Vessel` text was
**not** migrated, because it describes a stat template the v3 design explicitly abandoned — v3's
rule is *Oz gets the host's stat block and nothing else*, no AC bonus, no HP bonus, no save
advantage, no unlocking reactions scene over scene.

⚠ **The `Oz's Vessel` text below is v2 and contradicts v3.** Do not reinstate it without reading
[`twenty-one-roster.md`](twenty-one-roster.md) § *OZ'S VESSEL — the reusable possession template*.

---

## Retired from v3 host sheets

### Rennick the Knife — Scene 2 · `Worn, Not Ruled (GM note — this is Oz)`

> **Ozmandius is wearing this man.** He is not a wizard right now. He has exactly the stat block on
> this sheet and nothing more — no spells, no legendary actions, no tricks. Whatever the host can do,
> Oz can do. Whatever the host cannot do, neither can he.
>
> **The tell:** Rennick wears a heavy signet ring, a circle cut into the band that stops just short
> of closing. Never point at it. Describe his hands.
>
> **At 0 HP:** he does not die and he does not jump mid-fight. He drops, exhales black frost, and
> gets one line out before the scene ends:
>
> > *"...Ah. I see. I shall have to be cleverer than this."*
>
> Then the program cuts to the courtroom.

⚠ **"cuts to the courtroom" was already stale** — there is no courtroom in v3. Scene 2 cuts to the
market square. Corrected during migration.

### Big Ned — Scene 3 · `Worn, Not Ruled (GM note — this is Oz)`

> **Ozmandius is wearing this man.** He is not a wizard right now. He has exactly the stat block on
> this sheet and nothing more. Whatever the host can do, Oz can do; whatever the host cannot,
> neither can he.
>
> **The tell:** a heavy signet ring, a circle cut into the band that stops just short of closing. On
> the hand he gestures with, and he gestures constantly. Never point at it — describe hands.
>
> **The escalation this host represents:** Scene 2 he took the man with the sword and died in four
> rounds. He has stopped reaching for muscle and started reaching for a *crowd*. He has no legal
> power here and does not want any — when the crowd fails him he stops being clever and simply buys
> professionals, in Scene 4.
>
> **At 0 HP:** black frost, and the whisper — *"Twenty… not twenty-one."* The ring is not on the
> body. And someone in the front row picks the speech up mid-sentence and climbs the well.
>
> **Killing him publicly is not a win.** They will have murdered a grieving carter in front of four
> hundred witnesses, and the man is genuinely innocent of everything except being available.

### Harl Wetherby — Scene 4 · `Oz's Vessel — Twenty Deaths (Scene 4: no reactions unlocked)`

> Modifications baked into this stat block already (AC+3, HP+15 over host base). Advantage on all
> saving throws. Immune: charmed, frightened, further possession. Darkvision 60ft. Reactions unlocked
> this scene: NONE (he's died to these people twenty times and it bores him). Telltale:
> unfinished-circle brand somewhere on the body — auto-found on search, Perception DC14 if skin
> exposed. Social front Deception +7 (this actor is already built with Deception expert). Insight
> DC15 catches the wrongness. On 0 HP: Oz abandons the host — black frost spiderwebs from
> mouth/eyes, a voice not the host's mutters 'Twenty… not twenty-one.' Host collapses unconscious
> but stable at 0 HP. Scene ends here.

⚠ v2 text. The brand is not the v3 tell — **the ring is**. The stat modifications contradict v3.

### Scribe Ellisane · `Oz's Vessel — Twenty Deaths (Scene 7: reactions ①② unlocked) + Exit Clause`

**Not a v3 host at all.** She was the v2 opera host; v3's Scene 6 host is the **lead tenor**. She
survives only as a placed extra in the opera house, and the marker on her sheet was actively
misleading.

> Default mode is social, NOT combat — Deception +8-equivalent, Sleight of Hand +6-equivalent,
> Insight +6-equivalent (built into this actor's skills above). If cornered with no way out he fights
> at MOST two rounds, then voluntarily abandons the host — the scene ends without a kill, party left
> holding an innocent terrified scribe in front of gala security. Build for that beat, not a boss
> fight. Reactions unlocked if it comes to a fight: ① "I remember this" (at-will, reroll a hit
> against him, use lower) ② "You always do that" (1/fight per feature, negate a class feature's extra
> effect once). Telltale: brand under an ink-stained glove. On 0 HP (rare — he abandons first): host
> collapses unconscious but stable.

---

## Left in place, deliberately

These actors are **parked in Recycle / v2 folders** and are not hosts in the nine-scene night, so
their markers cause no bleed. Deleting them would only destroy reference material:

| Actor | Folder | Marker |
|---|---|---|
| `Magistrate Corben Vale` | `SJ — cut: The Short Drop (NPCs)` | Scene 2: reaction ① unlocked |
| `"Corvo"` | `v2 — 06 — An Old Friend's Face (NPCs)` | Scene 6: reactions ①② |
| `"Tam Bellows," Lantern-Bearer` | `v2 — 08 — The Anchor Below (NPCs)` | Scene 8: reactions ①② |
| `Captain Herrick` | `v2 — 09 — Bridges at Night (NPCs)` | Scene 9: all three |
| `Captain Vess Marlowe` | `v2 — 04 — Twenty Coffins (NPCs)` | Scene 4: reaction ① |

⚠ **`Tam Bellows` is the Scene 7 guide in v3** ([`twenty-one-roster.md`](twenty-one-roster.md)) but
still lives in a v2 folder and has **no token on the Catacombs scene**. When he gets placed, mark him
on the token and retire his `Oz's Vessel` item too.
