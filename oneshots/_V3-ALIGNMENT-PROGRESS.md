# v3 alignment — progress tracker

Autonomous pass started **2026-08-15**. Fable subagents audit, Opus writes.
**This file is updated as work lands, so whatever state you find it in is accurate.**

## The locked v3 flow (the yardstick everything is checked against)

| # | Scene | Oz wears | Map |
|---|-------|----------|-----|
| 1 | Run Twenty | *himself* — then the reboot | Trophy Gallery |
| 2 | The Road to Town | Rennick the Knife, bandit captain | Cliff Trade Road |
| 3 | The Market Square | **Big Ned**, the dead bandit's brother | Fairfield Market |
| 4 | Last Orders | Harl Wetherby, innkeeper | Dragonsfall Tavern ×3 |
| 5 | The Quiet Night | **Fenna**, a connoisseur with the good bottle | Dragonsfall Tavern (same art as 4) |
| 6 | The Fire | the lead tenor | Spider's Tear Opera House ×3 |
| 7 | The Guide | the hired lantern-bearer | Catacombs of Silence |
| 8 | The Parley | *himself* — no tricks | The Library |
| 9 | Twenty-One | *himself* — nowhere left to hide | Trophy Gallery |

> **2026-08-16 — the hanging is cut and the flow is nine scenes.** *The Short Drop* (Magistrate
> Corben Vale, Town of Hanged Men) was Scene 3 with a fail state pre-applied — same square, same
> temperature track, same honest NPCs worked one at a time — and the night has to finish in one
> sitting. Everything below this line in **Landed** is a record of the 08-15 pass and still says
> ten scenes; read it as history, not as the current spec. Renumbering swept through the outline,
> roster, background cast, social map, main doc, handout, pregens and tune-up. `Town of Hanged Men`
> + Roof stay built in Foundry, parked. Pate, Josy and Hanne moved into the market square rather
> than being cut; Alderman Hobbe Grove was cut.
>
> **Same day — The Quiet Night moved into the Dragonsfall.** Same inn as Scene 4, two hours later
> (siege at nine, this at eleven), party bedded down upstairs, Oz downstairs in Fenna with the
> good bottle, working out that he can taste it. New staff actors: **Wat Harrow** (barkeep) and
> **Nessa Wetherby** (Harl's niece, serves tables), both wired into the ties module.
> Grimsby and its sixteen-villager search are parked. Knock-on: **the inn no longer burns in Scene
> 4** (Scene 6 is the fire, and the building has to still be standing).

**Cut from v2:** the dock riot · the sea cave / twenty coffins · the anchor and the seal vaults ·
the old friend's face · bridges at night. The village that remembers was *repurposed* into Scene 5.

---

## Status — all seven chunks complete, verified

| # | Chunk | State |
|---|-------|-------|
| A | Outline open items | ✅ |
| B | `twenty-one-roster.md` v3 rewrite | ✅ |
| C | `space-journey.md` main doc rewrite | ✅ |
| D | handout + pregens | ✅ |
| E | Foundry world audit + fixes | ✅ |
| F | `pentaryn-ties` module review + bug fixes | ✅ |
| G | `foundry-ops.md` module list refresh | ✅ |

---

## Landed

### A — `space-journey-story-outline.md`
- **`## Trace` written properly** — ten Trace, ten scenes, a floor not a gate. Bonus Trace **buys a
  scene skip**. Not spendable on rerolls or hints.
- **Scene 3's setup closed** — it's Scene 2's own body count. The accusation is true and an hour old.
- **Scene 4's drop is a real procedure now.** It found the right idea on its own: *a short drop
  strangles, it does not snap necks* — so failure buys rounds of desperate rescue, not a coin flip.
  Round-by-round, using Hanne (stutter the drumroll), Josy (lift the writ), Pate (the north trap
  sticks). Vale holds the crowd back while the hanging is still lawful, which is why the quiet plays
  beat the loud one.
- Through-line rewritten for v3 · stale "v2 — real maps" banner deleted · skip-ahead rewritten.

### B — `twenty-one-roster.md`
- **The OZ'S VESSEL template was contradicting the whole design.** It granted AC +3, a per-scene HP
  bonus ladder, advantage on all saves, a signature attack and unlocking reactions — all of which
  violate "he inherits the host's stat block and nothing else." Stripped to the rule, plus the
  black-frost death beat and the **ring** telltale.
- Scenes renumbered (tavern → 5, gallows → 4); six cut scenes deleted; new entries written for 2, 3,
  6, 7, 9.
- **Salvaged:** the Warden of the Unfinished Circle and Seal Remnant moved into the catacombs — which
  also **repairs a dangling cross-reference**, since the Warden's Half-Mark gives disadvantage on
  Scene 10's first Lunge save. Tam Bellows became Scene 8's guide. The Deputized Crowd clump maths
  became Scene 3's Mob Temperature and Scene 7's crush.

### D — handout + pregens
- Re-Casting section deleted from the handout.
- **Wharf's two death-cheats kept, as the single stated exception** rather than a contradiction.
- Redshirt differentiated: his replacement arrives **mid-scene**, everyone else's next scene.
- **The Holo-Doctor gained a "Fix them!" order** — one condition, once per crewmate per scene. The
  party has no Lesser Restoration and death is permanent, so paralysis had no answer.
- Trace skip rule stated · hazards de-staled · possession rule and the ring added · Counterspell note
  rescoped to the finale (Oz has only his host's block for nine scenes).

### C — `space-journey.md` (the main rules doc)
- **§10's scene table replaced** with the v3 ten, and it gained an **"Oz's host"** column — himself /
  bandit captain / Big Ned / magistrate / innkeeper / a nobody who does nothing / the lead tenor /
  the hired guide / himself-unkillable / himself-killable.
- **§8's three hard rules rewritten.** Rule 1 is now the real one: *he possesses exactly one NPC per
  scene and inherits it entirely — if the host can't cast, Oz can't cast.* Rule 2 (every other NPC is
  honest) kept and called load-bearing. Rule 3: a fixed order — he picks hosts, never sets.
- **A `The tell — the ring` section added to §8** — the main doc had never mentioned the ring at all.
- **Scene Jump → Host death**, with the scene 2/3 hop, the scene 6 hat-tip, scene 9's no-stick.
- **Trace rebuilt as floor + skip**; the arch, the lockout and the +4 cap are gone.
- **Statting Oz scoped** — stock host blocks for 2–8; the CR-9 duelist and Twenty Deaths only for 9–10.
- **Rests reconciled:** one breather after 3-or-4, and **scene 6 IS the long rest, which is its trap.**
- **§7 kept as a stamped optional variant**, every cross-reference scrubbed.
- **Three pre-existing self-contradictions fixed** that predate v3 entirely: "no party healing" vs
  "healing is legal and normal"; "HP carries across scenes" vs "full HP every scene"; "he is the
  entire healing economy" vs "being the only source was never load-bearing".
- **Verified by grep:** 0 stale v2 scene names, 0 lockout phrases, all ten v3 scenes present.

### E — Foundry world
- Nav bar runs **100 → 1000, all ten scenes** (the Parley was missing entirely).
- `SJ 03` folder renamed off the stale "Twenty Counts" · Vasca filed into `SJ 07`.
- Verified: no scene missing a background, no orphaned tokens, no unfiled actors.

### F — `pentaryn-ties` **0.1.1** — four real bugs found and fixed
1. **The tab would have gone blank in normal use.** `changeTab()` returns early when already on that
   tab, and every inline edit re-renders the sheet — so after the first edit no tab activated and the
   body was empty. Now activates explicitly.
2. **Then my own regression test found a second one:** a re-render could rebuild the nav while leaving
   the tab-body, and the single "does `[data-tab=ties]` exist" guard saw the surviving section and
   skipped — losing the nav link permanently. Injection is now part-wise.
3. **HTML injection** — `tie.id` was interpolated unescaped from stored flag data.
4. **Migration could destroy data** — it unset the legacy flag even when it hadn't copied it.
   Now it does neither and warns loudly.
   Plus: writes no longer force a sheet re-render (focus loss), no-op mirror writes removed,
   empty overlays no longer swallow the next keypress.
- **Verified live:** survives three consecutive re-renders with the tab open, no duplicate links,
  rows intact. The frozen-`game.pentaryn` fix confirmed — importer, walls and ties now coexist.

### G — `context/foundry/ops.md`
- §5 rewritten from **5 modules to the real 21**, grouped by purpose, with a drift note and the
  one-liner to re-derive the list. `pentaryn-ties` documented.

---

## Decisions made autonomously — override any of these

1. **Wharf keeps both death-cheating abilities**, as the single stated exception to permanent death.
2. **The Holo-Doctor treats conditions** — closes a real hole.
3. **Oz's "Grudge" numeric bonuses are finale-only.** A +1 on a stock Bandit Captain breaks the rule
   of the night. The flavour (quoting past runs) stays everywhere.
4. **§7 Re-Casting kept but stamped NOT USED**, as an optional variant, not deleted.
5. **Interface and Regulation 121-A now work on possessed hosts** — Datum gets the host's honest
   data; 121-A binds the host's program so Oz must visibly fight his own body. Both become reveal
   tools instead of dead ends.
6. **Vessel bonuses stripped entirely** — see B.

## Still yours

- The outline's open list still has the **Scene 9 row** and **"where the night ends"**.
- **Read the new §8 and §10 of `space-journey.md`** — the biggest change, worth your eye.
- ✅ **Both skip judgement calls resolved by Joe (2026-08-15).** Panel Glitch stays at **+1**. And the
  skip became a **player-chosen free pass** rather than a strike against the next unplayed scene:
  bonus Trace banks a pass, passes bank with no expiry, and one is spent at the **top of a scene**
  (2–8) — after the GM describes the set, before the first roll. Rationale in Joe's words: *"if they
  land across a problem they don't like, they get a free pass."*
  - Landed in `space-journey.md` (§1 pitch, §2 core loop line 4–5, §5 Panel Glitch + Standard Issue,
    §8 Trace — full **The pass** rewrite, §10 pass rule + "keep a visible count", §12 dry-run note),
    `space-journey-story-outline.md` (Trace section, *If the party skips ahead*), and
    `space-journey-player-handout.md` (How you win, Panel Glitch row).
  - **Stated cost:** a pass forfeits the skipped scene's +1, so it is **track-neutral** — it buys
    blood and time, not Trace. The bonus that bought it already paid its own +1.
  - **The Quiet Night is now passable with open eyes.** Two docs disagreed on this before (the
    outline had Scene 6 as never-cut, the main doc had skips landing on it silently); unified to
    *passable at a stated price* — they lose the long rest, **and** Oz picks his finale target
    himself, choosing whoever hurt him most. GM does not warn them; the honest description of the
    set is the warning.
- Nothing is committed. `git status` will show the full set.
- The roster agent flagged judgement calls: Rennick's attack lines adapted to scimitar/crossbow,
  Big Ned given a single attack, and Vale/tenor/Tam statted as raw Commoners.
