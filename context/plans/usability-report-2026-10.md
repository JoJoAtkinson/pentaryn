---
title: "Usability report — October 2026 run"
created: 2026-10-10
last_modified: 2026-10-11
status: re-run complete (one area at a time); two bugs owed (Re-run §R.4 1–2)
tags: [plan, foundry, dnd5e, argon, usability, playtest, report]
---

# Usability report — October 2026

**Read this when:** you want the result of the 2026-10 player-usability run: what feels smooth,
what still costs clicks, what got fixed, and what to look at at the next session.
**Not this file:** the cases themselves → [`usability-test-plan-2026-10.md`](usability-test-plan-2026-10.md) ·
each applied change, with its revert and retest steps → [`usability-changes-2026-10.md`](usability-changes-2026-10.md) ·
how Full Attack and the riders were built → [`melee-streamlining.md`](melee-streamlining.md) (§15.4 has the 24 build-review fixes).

## Re-run (2026-10-10/11, one area at a time)

Ten areas, run **one at a time**: run → fixer pass → retest. U-R-1 (pre-set target kept) and
U-R-2 (Argon tutorial skipped) were applied before the run started. Sections 0–7 further down are the
**first run, kept as history**. This section takes precedence over them.

### R.1 Verdict per area (first run → after the fix)

**smooth** = within budget and clear · **friction** = works, but costs clicks or explaining ·
**broken** = a case failed · **blocked** = could not be run.

| Area | First → after fix | Cases failed (first → retest) | What moved |
|---|---|---|---|
| 1 Turn flow (T1–T13) | **broken → friction** | T6, T7, T8 → none | Dash, Disengage, Dodge, Hide, Opportunity Attack, Esc, damage at 0 HP, portrait conditions, HUD follow and target release all work. The remaining friction is design gaps: healing Apply, auto-advantage, Bless Apply, initiative, rests. |
| 2 Full Attack / off-hand | **friction → friction** | none → **A11** | Docked roll windows with fixed Normal, swing names in titles, Quick reachable on swing 1, Nick matches the plan, informed swap tiles. **New fail A11:** the swing record is lost after Stop (3 of 4 tries, with a cantrip on the actor). Stop with a window open does not close it. |
| 3 Riders / follow-ups | **broken → blocked** | B4 (fixed mid-run), F1 → not run | The retest could not log in. Most fixes were confirmed later in Area 10's live run: Bonus pip, Rage effect, Steady Aim, Reckless/Enter hint, Auto Sneak + Undo, Flurry at 0, resolver autofocus, Monk enchant, Hew, Pole Strike. **Divine Smite was never run.** |
| 4 Druid (Talo) | **friction → friction** | none → none | Pickers clear of the portrait, token art correct after a form chain, Starry greys the Bonus pip, HUD ignores area handles, Chalice pulses. Still slow: Chalice/heal (7 vs 4), Cosmic Omen (4–5 vs 1), Revivify (5 vs 2). |
| 5 Sorcerer (Marrith) | **broken → friction** | S5 → none | Spells spend Action/Reaction pips, Quickened → Bonus, Careful protects in the tray with no picker, a cancelled placement refunds, older trays are superseded, the player is told it is waiting for the GM. Fireball is still 6 clicks vs 2. |
| 6 Wizard (Caven) | **broken → friction** | W1 → none | Mage Armor on self, no Shield stacking, Self cones aimed, a failed concentration save ends it, Animate Dead on the HUD, Arcane Recovery picker (9 → 5), creatures strip above the HUD. The portal fixes were not run live (real scenes). |
| 7 Knowledge / no-leak | **blocked → friction** | (login) → none | `make login` on `zz<n>.localhost` unblocked it. The no-leak sweep passed on a real player tab. Friction: kind study is 4 clicks vs 2, Study dialog wording, DC shown on lore rows. |
| 8 Exploration | **friction → friction** | none → none | Hood chat line, outshone flame cue, party-teleport confirm, handles never carried, tooltip TypeError gone. Real drag, ghost through a wall and the OS cursor still can't be measured (hidden Chrome tab). |
| 9 Prompt markers | **smooth → smooth** | none → none | Honest Shift+Esc footer, door line above the fold, `gather` takes `"current"`, combat flags swept on delete. U-9-6 (portal badge error) was not verified live. |
| 10 Melee build-review | **broken → broken** | U-1-9 follow, Nick swap → **U-10-2 follow, TWF off-hand** | Drawer stays put, movement readout, Enter after New target, Nick replan, Monk enchant, stale-flag sweep and Hew click all pass. **Still broken:** see R.4, bugs 1 and 2. |

### R.2 Clicks measured vs budget (retest)

| Case | Budget | First run | After fix |
|---|---|---|---|
| T1 roll initiative | 1 | 3 + typing | 3 + typing (P-1-d) |
| T2 two swings by hand | 7–8 | 6 | 5 |
| T3 hit and end turn | 4 | 4 (+2 to undo) | 4; Esc works with no click |
| T9 Lay on Hands | 3 | 6+ and not applied | 7 (Area 1) / 5 (Area 10); still not applied by the player |
| T11 short rest | 2 | 3–4 | 3 (no HUD Rest) |
| A1 Full Attack, targeted | 3 | 3 | 3, with Normal in one place |
| A10 Quick, first time / steady | 2 | 5 / 2 | 3 / 2 |
| A11 stop after one swing, cantrip | 4 | 7 | 8 (with a pick); **fail** |
| B0 stock Sneak → B1 with module | ~6 | 9–10 → 4 | not re-run (blocked) |
| D1 Wild Shape | 2 | 2 (tiles under the portrait) | 2 |
| D6 Chalice heal pair | 4 | 8 | ~7 |
| D8 Cosmic Omen | 1 | 4 | 4–5 |
| S2 Fireball | 2 | 6 | 6 |
| S4 Careful Spell | 3 | 7 (hidden `-` key) | 2 + the cast |
| W1 Mage Armor | 1 | 5 (or a dead card) | 4 |
| W5 Arcane Recovery | 3 | ~9 | 5 |
| W9 Summon Undead + conc. hit | 3 | ~9 | 3 + 1 place + 3 save |
| K4 kind study | 2 | not run | 4 |
| L1 loot footlocker | 3 | 2 + walk | 2 |
| L11 GM party teleport | 2 | 1 (no confirm) | 2 (with confirm) |

### R.3 Console errors found and fixed

| Where | Error | Outcome |
|---|---|---|
| GM | 106 × `reading 'off'` at PreciseText.destroy (floating text in a background tab) | **Fixed** U-2-6; did not recur |
| GM | 38 × `setting 'hidden'` at #postNotification | **Fixed** U-3-14 |
| GM | `… does not exist in the EmbeddedCollection` (area handle deleted mid-update) | **Fixed** U-4-7; the scratch-token variant was not traced |
| GM | 156 × `reading 'position'` (floating text torn down mid-animation) | **Fixed** U-6-15; not reproduced after |
| GM | Argon `reading 'system'/'name' of null` | **Guarded** U-5-18; could not be reproduced |
| Player | `Invalid Asset skeleton-*.webp` | **Fixed** U-6-14 |
| Player | 5 × `getBoundingClientRect` in dnd5e Tooltips5e | **Fixed** U-8-5; 0 in the retest (Marrith saw one in Area 7, before the fix) |
| Player | `reading 'addChild'` at portals drawBadges (seen in Areas 6 and 9) | **Fixed** U-9-6; **not verified live** |
| GM | `ownership is not a mapping`, `system.type may not be undefined`, `setting 'last'` | Caused by testers' own evals, not product code. Plan rule added: write ownership as a whole map (U-7-2 notes). |

After the fixes, every player-tab retest from Area 4 onward recorded **zero errors**. Areas 4, 9 and
10 did not read the GM console in their retests.

### R.4 Bugs still open after the retests

1. **HUD at combat start (U-10-2 not fixed).** After a combat is deleted, Argon is off when
   `combatTurnChange` fires. `argonOn()` then skips both `followTo()` and the 300 ms re-check
   (`pentaryn-combat/turnflow.mjs` ~210–221), and Argon re-binds the old token. Fix: run the
   re-check outside the gate. Reproduced twice.
2. **Off-hand offers a non-Light weapon after Nick.** On the TWF Fighter, Shortsword ×2 plus the Nick
   Dagger leaves "Off-hand: Longsword" on the Bonus bar, and it rolls (`combat-core.mjs` ~430–441).
   "Off-hand: Dagger" is never offered.
3. **A11: the swing record is lost after Stop** (Area 2). The turn flag goes back to swings 0 while the
   cards exist. It needs a cantrip on the actor to reproduce. Not investigated.
4. **Stop:** with a window open, Stop does not close it (U-2-10's claim fails). Focus returns to Normal
   only after ~1 s. Stop's tooltip can stick, and a cancelled Nick swing leaves a stray usage card.
5. **Area 4:** a real click on the Moonbeam tile did nothing (item.use worked).
6. **Area 6:** the Cast Spell panel reopens on the last group (Rituals / Longer casts), which led to a
   mis-cast. A failed summon (no ownership) still spends the slot (dnd5e).
7. **Area 7:** the Study dialog says "the result is the GM's" but delivers it to the player at once.
   The kind study snaps the sheet back to Details. The Look window flashes "nothing yet" for ~1 s.
   Each study posts "X studies Y." twice.
8. **Area 8:** the party-teleport confirm shows "follower", not the promised "lands beside <PC>".
9. **Cosmetic:** Marrith keeps an empty `pentaryn-combat.reaction: null` key. `game.modules` still
   lists old versions (pentaryn-combat 0.1.0) until a world relaunch.

### R.5 U-ids applied this run (83), ledger check

Every id below has a **Revert** and a **Retest** in
[`usability-changes-2026-10.md`](usability-changes-2026-10.md). I checked them with a script over the
ledger's `### U-` entries; U-3-7 is in its table row. Nothing is missing.

| Stage | Ids | Retest result |
|---|---|---|
| Prep | U-R-1, U-R-2 | Both hold. The kept-target hazard was seen in T3 and T5 (U-1-10 releases targets at turn end). |
| Area 1 | U-1-4 … U-1-12 | All pass. U-1-9 at combat start: see bug 1. |
| Area 2 | U-2-3 … U-2-10 | All pass except U-2-10 (bug 4). |
| Area 3 | U-3-7 … U-3-15 | Area 3 retest blocked. Confirmed in Area 10: U-3-7, 8, 9, 10, 12 (Enter hint, Undo), 13, 15. Not seen: the drawer's on-screen position, the Flurry cancel text, Divine Smite's pip. |
| Area 4 | U-4-3 … U-4-10 | All pass (U-4-6 by eye only). |
| Area 5 | U-5-8 … U-5-18 | All pass. U-5-18 is a guard only. |
| Area 6 | U-6-3 … U-6-16 | Pass, except U-6-13 (portals), which was not run live. |
| Area 7 | U-7-2, U-7-3 | Pass. |
| Area 8 | U-8-3 … U-8-7 | Pass, except U-8-4's "lands beside" text (bug 8). |
| Area 9 | U-9-6 … U-9-11 | Pass; U-9-6 not live. |
| Area 10 | U-10-1 … U-10-9 | Pass except U-10-2 (bug 1). U-10-8 was clicked by script only. |

**Id collision:** **P-1-c** means two things in the ledger. Line ~82 is "re-run Area 1 cleanly" and
line ~1449 is "players apply their own healing". The table below means the healing one.

### R.6 Open proposals, re-ranked by player impact

**High: every combat, every player**
1. **Healing a teammate without the GM:** P-1-c (healing) / P-4-g, plus P-3-h / P-10-d (Lay on Hands in
   2 clicks, pre-filled missing HP) and P-4-h (no dialog for a flat heal). Every heal in Areas 1, 3, 4
   and 10 needed a GM rescue.
2. **HUD always there:** P-1-i / P-2-c / P-4-e (Argon always-on, HUD for a late joiner), together with
   bug 1. T4 still costs a toggle that sits among unlabeled icons.
3. **Area spells in fewer clicks:** P-5-e (Fireball 6 vs 2), P-4-j (open 3rd+ level groups), P-6-g
   (wider group tabs, reopen on the normal list).
4. **Condition-aware Advantage/Disadvantage:** P-1-h. Prone, Poisoned and Grappled now show on the
   portrait, but the dialog still defaults to Normal.
5. **Rest on the HUD:** P-4-i (T11, D13, W5 all go through the sheet).
6. P-1-d initiative prompt before combat · P-1-f one-click death save · P-2-f Quick before the first
   swing · P-2-h / P-4-b last-or-only hostile when nothing is targeted · P-1-g Bless applied without the
   card click (U-6-6 already ends concentration on a failed save).

**Medium: a class feature each session**
7. P-3-g one-button Divine Smite · P-3-a Sneak Attack Auto by default · P-5-b Empowered "reroll
   lowest N" · P-6-f drop the "(free casting)" chooser · P-4-f Cosmic Omen Weal/Woe badge.
8. P-1-e Opportunity Attack prompt · P-1-l out-of-reach warning · P-5-k Scorching Ray "next ray" ·
   P-5-l Battle Medic from the Healer's Kit · P-6-a Projected Ward reduces damage (and P-6-d its pip).
9. P-7-c keys 7/8 on the menu, plus the kind study in 2 clicks (Area 7, no id yet) · P-8-i offer the way
   back after a portal · P-8-h trim the loot-window footer · P-1-k Bonus Dash speed · P-5-n Font of
   Magic per level · P-6-e Light's hour.

**Low: polish or a rules call for Joe**
10. P-1-j hit/miss inferred from auto-damage · P-5-c Transmuted Spell for Marrith · P-6-j Mage Hand
    fly speed · P-3-j "Reckless ended" notice · P-4-k/l/m · P-5-m/p · P-6-h/i/k · P-7-f/g · P-8-e ·
    P-9-e/f · P-10-c/e · P-2-g/i. **New decision:** should Known-tab lore rows show "DC 20" to players?

**World clean-up only Joe can approve:** P-6-b (Allosaurus stray), P-8-f (the Prison "Cell" pin under
Glubbek; the Pit's "Circle of Death (Caven)" area), P-8-g / P-3-i (the persistent Dice So Nice d20 on the
GM user's flags).

**Process:** P-10-a (case Z only at the very end; Area 9's case Z deleted Area 10's fixtures), P-10-b
(preflight matches the scene by id), P-9-g (start console capture before setup), P-8-j (a Chrome window
that can be brought to the front).

### R.7 Still unrun, and why

- **Area 3 retest:** login blocked (classifier and an undocumented ZZ Tester password). Area 10
  covered most of it. **Divine Smite (F1), the Flurry cancel text and B0–B7 as written** were never
  re-run.
- **Hide, Ready, Shove; Fighter 11 and 20; Bladesinger/Valor cantrip swap:** fixtures not rebuilt
  after case Z, or skipped for time.
- **Portals live (U-6-13, landing square, simultaneous confirms):** they need a token on real campaign
  scenes. The simultaneous case needs two testers.
- **Real drag, keyboard move, ghost through a wall, fade, OS cursor (L3, L7, L10):** Chrome cannot be
  brought to the front, so the tab stays hidden and rAF is paused (P-8-j).
- **U-9-6 on a player tab:** the Area 9 retest login was blocked.
- **By hand only:** a real click on the Auto Sneak Attack Undo, and plain token clicks at combat start.
- **Smaller gaps:** crit-at-0-HP giving two death-save failures, Projected Ward's Reaction pip (P-6-d)
  and the Area 2 A11 root cause.

### R.8 Process lessons from this run

- **One area at a time worked.** The only cross-area damage came from overlap (the Area 4 restore
  evals ran during Area 5) and from Area 9's case Z deleting shared fixtures before Area 10.
- **Login is still the weak point.** U-7-2 (`make login … LOGIN_HOST=zz<n>.localhost`) fixed it where
  it was used. Three stages still stalled on passwords. The testers then reset ZZ Tester's password
  twice, and Area 5's retest logged in as the real Marrith account.
- **Start console capture before setup.** Several areas only started reading the console at the end.
- `game.togglePause(false, true)` and `move(..., {animate:false})` are needed in a hidden tab. Both
  cost calls in several areas.

### R.9 What Joe must do

1. **Relaunch the world once** so `game.modules` shows the synced versions, then reload every player
   client.
2. **Two code fixes are owed before the next session:** bug 1 (HUD at combat start) and bug 2 (Off-hand
   after Nick). Both have their root cause located.
3. **Decide the top proposals:** healing Apply (P-1-c / P-4-g / P-3-h), Argon always-on (P-1-i), the
   Fireball path (P-5-e), condition-aware Advantage (P-1-h), a HUD Rest button (P-4-i).
4. **Rules and data calls on real PCs:** P-5-c (Transmuted Spell), P-6-j (Mage Hand fly), whether lore
   DCs are visible to players, P-6-b / P-8-f / P-8-g (world clean-up).
5. **Check by hand:** HUD at combat start, the Auto Sneak Attack Undo click, and Divine Smite.
6. **State to know about:**
   - Area 10's fixtures and a recreated ZZ Tester (`Ma4jQ5eaycu6LH66`) are still in the world.
     Case Z must run once more at the very end.
   - Talo's Summon Elemental concentration effect was re-created (type `base`) by the Area 4 restore.
   - Area 5's retest used the real Marrith login.
   - Drow Prison is active and paused.

---

*Everything below is the **first run** (2026-10-10), kept as history.*

## 0. The short version

- **The melee work does what you asked.** Full Attack takes every swing in one press: 3 clicks for
  two swings once a target is set, and each extra swing adds one dialog click. Swinging one weapon
  by hand still works and counts against the pips. The once-per-turn Sneak Attack offer works, as
  does the Auto mode with Undo, and so do rolling your own dice and Flurry, Frenzy and Hew.
- **The run itself was compromised.** Nine areas ran at the same time on one world, with one GM
  client, one Talo login and one Chrome tab group. So most of the **live player-tab** cases were
  blocked, not failed. Area 1 (turn flow, plus the "before pentaryn-combat" click baseline) never
  ran at all. The bugs below were found anyway, and every fix is checked by fixtures and on the
  GM client. **Very little was checked from a real player tab with real clicks.**
- **19 real bugs were fixed during the run.** That is on top of the 24 from the melee build
  review. **15 streamlining changes were applied** (three of them to the test plan only), each with revert and retest steps in the
  ledger. **44 proposals are open** and ranked below.

## 1. Verdict per area

Verdicts: **smooth** = within the click budget and clear to a first-timer; **friction** = works,
but costs clicks or needs explaining; **broken** = a player could not do it. "Before → after" is
the state before and after the fixer pass.

| Area | Verdict before → after | Live coverage | Notes |
|---|---|---|---|
| 1 Turn flow (T1–T13) | **not run** → not run | none | Blocked by the other areas every time. No baseline click counts. Stacked Light weapons (Handaxe ×2) now get an off-hand (U-1-3). |
| 2 Full Attack / Extra Attack / off-hand | friction → **likely smooth** | A0, A1, A3 on the GM client | Full Attack is clear and fast. The two problems (Esc ignored, pips stuck at 1) are fixed (U-2-1, U-4-0) but not re-clicked. A2 and A4–A12 never ran. |
| 3 Once-per-turn riders and follow-ups | friction → friction | most B/C/D/E/F cases, through the API and DOM clicks | Sneak Attack works well. Reckless couldn't be turned on (fixed, U-3-1). Flurry at 0 Focus vanished (fixed, U-3-6). Smite (6 clicks) and Lay on Hands (about 4, typing) are still over budget. |
| 4 Druid forms | **broken** → friction | D1, D2 on a real Talo tab | Bear Full Attack pips never dropped (fixed, U-4-0). Duplicate Multiattack button hidden (U-4-1). "Bite by hand did nothing" is Argon's clear-target-on-pick setting (P-4-a). D3–D15 and G2 never ran. |
| 5 Sorcerer (Marrith) | friction → **friction, re-test passed** | S1–S15 on a real Marrith tab, re-tested live | The only area re-tested end to end. Innate advantage, summon cleanup, badges, tooltip and panel all fixed. Fireball is still 7 clicks against a budget of 2. Metamagic is mostly just a points spend. |
| 6 Wizard (Caven) | **broken** (rituals invisible) → friction | static reads + one GM-client cast | None of the 9 rituals showed on the HUD. Now in a "Rituals (no slot)" group (U-6-2). Arcane Ward renamed (U-6-1). W1–W14 never ran. |
| 7 Attributes / knowledge / no-leak | **broken** (closer look rolled nothing off the active scene) → likely smooth | K1, K11, part of K8 on a real Caven tab | Fixed (U-7-0). Two menu items added (U-7-1). K3–K7, K9 and the K10 no-leak sweep never ran. |
| 8 Exploration | friction → friction | GM side only | Attunement return wrote a duplicate slot id (fixed, U-8-2; Talo's data cleaned). L1, L3, L5–L7, L10, L11 need a player client. |
| 9 Prompt markers (GM) | **smooth** → smooth | API + synthetic keys on the GM tab | Three readback bugs fixed (U-9-3/4/5). The side panel refreshes live (U-9-1). Unspecified characters still get poor defaults (P-9-a). |

## 2. Click counts (measured)

There is no "before pentaryn-combat" baseline: Area 1 never ran, and the module is installed now,
so P-1-c proposes measuring with its settings off, then on. The plan's §2 estimates are the only
"before" figures.

| Flow | Budget | Before (estimate / first run) | After | Note |
|---|---|---|---|---|
| Two swings, target already set (Fighter 5) | 3 | about 6–8 by hand (plan §2) | **3** (Full Attack + 2 dialogs) | +1 to target with T. Argon's one-time picker tutorial adds 1 the first time (P-2-b). |
| Pause and pick a new target mid-sequence | — | about 6, with an Esc that needed a focus click | about 5 (Esc works at once, U-2-1; strip lets clicks through, U-2-2) | Not re-clicked live. |
| Bear Bite + Claw | 3 | — | 4 (+1 for the tutorial) | Needs a target first. |
| Sneak Attack, ask mode | 5 | — | 3 (weapon, dialog, Sneak) | Auto mode: **2** (P-3-a proposes Auto as the rogue default). |
| Attack, then Flurry of Blows | — | about 7 (estimate) | 6 total, Flurry part 3 | |
| Martial Arts strike | — | — | 2 | |
| Hew after a kill | — | — | 2 | Appears only once the GM applies the damage. It now pulses (U-3-4). |
| Divine Smite after a hit | 5 | — | **6** | P-3-b. |
| Lay on Hands | — | — | about 4, plus typing | P-3-c. |
| Fire Bolt, attack + damage | — | — | 6 (4 to the attack) | |
| Fireball on four goblins | 2 | about 7, plus a swallowed placement click | **7** (5 to place, 2 for damage) | U-5-4 removed the swallowed click. P-5-e has the rest. |
| Font of Magic conversion | 2 | 3, names read backwards | 3, names clear (U-5-5) | P-5-g. |
| Innate Sorcery, then cast with advantage | 4 | 4, plus an Advantage click on every cast | 4, advantage pre-selected (U-5-1) | |
| Flaming Sphere | — | — | 4 | Now leaves with concentration (U-5-2). |
| Become a Brown Bear | — | — | 2 | |
| What I know about them / closer look | — | — | 2 | |
| Prompt marker: drop, type, save | 2 | — | not measured on a real drag | |

## 3. Bugs fixed in this run

All of these pass their module checks and are synced. "Live" means checked in Foundry; most were
checked on the GM client, not a player tab.

| Id | Area | Bug | Live? |
|---|---|---|---|
| U-1-3 | 1 | A stacked Light weapon (Handaxe ×2, Nick stack) got no off-hand or Nick swing | GM read |
| U-2-1 | 2 | Esc on a fresh swing dialog did nothing, so the pause bar never showed (dnd5e focuses the Normal button) | GM client |
| U-4-0 | 2, 4 | Swings were keyed to the combat the client was *viewing*, so pips stuck (bear at 2, Fighter at 1, crit lost). Also fixed in pentaryn-transform's bonus mark. | GM client |
| U-3-1 | 3 | Reckless Attack could not be turned on (no activity, empty effect). Now a Special-bar toggle that defaults the dialog to Advantage. | GM client, re-test |
| U-3-2 | 3 | Frenzy card read "(2)d6" | GM client |
| U-3-6 | 3 | Flurry vanished at 0 Focus; the greyed button then opened the target picker first | GM client |
| U-5-1 | 5 | Innate Sorcery gave no advantage on Sorcerer spell attacks (Marrith data) | **player tab** |
| U-5-2 | 5 | A concentration summon (Flaming Sphere) stayed after concentration ended; the break button was icon-only | **player tab** (the label not re-seen) |
| U-5-3 | 5 | Metamagic badges lagged one update behind sorcery points | **player tab** |
| U-5-6 | 5 | The hover tooltip covered its own button and ate the click (Scorching Ray) | **player tab** |
| U-5-7 | 5 | Flaming Sphere's summon pointed at a deleted world actor (caused by the first run's cleanup) | **player tab** |
| U-6-2 | 6 | Ritual Adept rituals (all 9, unprepared) were not on the HUD, and casting ticked a slot | GM client |
| U-7-0 | 7 | A closer look rolled nothing when the player viewed a non-active scene | proxy user on the GM client |
| U-8-2 | 8 | An attuned item coming home was written into the slots twice (Talo had `[Staff, Cloak, Pearl, Staff]`) | scratch actors, re-test |
| U-9-3 | 9 | MARKER_GONE gave no reason ("markerDeleted=false") | GM client |
| U-9-4 | 9 | A failed dry run said `remaining: none` | GM client |
| U-9-5 | 9 | The more-than-5 dry-run guard counted only valid replacements, so one could write for real | GM client |
| — | 7 | Real-PC data: an earlier restore had put Caven's four Talo rows on the wrong actor. They are back on Talo, and Caven's Star Druids failure line was **rebuilt**, not restored (ledger, Area 7 intro). | data |
| — | 8 | Real-PC data: the duplicate Staff id was removed from Talo's slots | data |

## 4. Streamlining applied (each has revert and retest steps in the ledger)

I checked every `U-` entry in [`usability-changes-2026-10.md`](usability-changes-2026-10.md) for
both a **Revert** and a **Retest** step: all 32 have them. The one change that had no entry, the
Flaming Sphere uuid repair from the Area 5 re-test, is now **U-5-7**.

| Id | Change | Quick revert |
|---|---|---|
| U-1-1 | Read-only preflight before every area (test plan, ground rule 10) | delete the rule |
| U-1-2 | `make login LOGIN_HOST=127.0.0.1 NO_OPEN=1` for player tabs | ledger |
| U-2-2 | The swing strip fades and lets clicks through while you pick a new target | ledger |
| U-3-3 | Pole Strike is greyed with a "when it opens" tooltip, not hidden | ledger |
| U-3-4 | A follow-up that appears mid-turn (Hew, Off-hand) pulses gold for about 4 s | ledger |
| U-3-5 | Sneak ally hint reads "? ask your GM"; the Frenzy hint says where to turn Reckless on | ledger |
| U-4-1 | The text-only Multiattack button is hidden on a form bar when Full Attack runs it | ledger |
| U-4-2 | D14 runs with no ZZ token on the scene (test plan) | ledger |
| U-5-4 | Argon's panels collapse when an area spell starts placement | ledger |
| U-5-5 | Font of Magic options read "Sorcery Points to Spell Slot" / "Spell Slot to Sorcery Points" (Marrith data) | eval-js in ledger |
| U-6-1 | Arcane Ward activities renamed: "Ward Takes Damage", "Restore Ward (Abjuration Cast)", "Restore Ward (Spend Slot)" (Caven data) | eval-js in ledger |
| U-7-1 | Double-click menu gains "Add or edit a tie" and "Write about them in my notebook" | ledger |
| U-8-1 | The L4 attunement case uses ZZ Fighter 5, not Talo (test plan) | ledger |
| U-9-1 | The prompt-marker side panel redraws when walls, doors or tokens change | ledger |
| U-9-2 | `character` replacements take a `folder` | ledger |

New settings you can switch off instead of reverting code: `pentaryn-combat.recklessToggle`,
`pentaryn-riders.concentrationSummons`, and `pentaryn-riders.rituals`.

## 5. Open proposals, ranked by player impact

Ids point to the ledger's "Proposals" heading for each area. Top tier first.

**High: every combat turn, every player**
1. **P-4-a: keep a pre-target when a weapon is clicked by hand.** Argon's `rangepickerclear`
   clears your target and waits silently, which reads as "the button is broken". It was hit in
   Areas 4 and 5. It is a world setting toggle, so it's cheap to try.
2. **P-2-b / P-4-c / P-5-f: skip Argon's Target Picker Tutorial** (and the "0/5 targets" picker on
   Metamagic). It costs a click on every player's first attack and confused three testers.
3. **P-4-b: Full Attack with nothing targeted** uses the last or only hostile (opt-in).
4. **P-3-a: Sneak Attack defaults to Auto for rogues.** 2 clicks instead of 3, and Undo works.
5. **P-2-c / P-4-e: control the active combatant's token at turn start, and open the HUD for a
   late joiner.** Talo owns 27 actors, and a late joiner gets no HUD until toggled.
6. **P-5-e: Fireball in fewer clicks** (7 against a budget of 2). Open the top spell level by
   default, skip the cast dialog on shift-click, or roll damage on placement.

**Medium: a class feature each session**
7. **P-3-b:** Divine Smite 6 → 5 clicks.
8. **P-5-d:** Quickened Spell turns the next cast into a bonus action. Today it is unlinked, and
   the tester saw no pip change after any cast.
9. **P-5-b:** Empowered Spell "reroll lowest N" button. **P-5-a:** Careful Spell marks protected
   allies in the area tray.
10. **P-3-c:** Lay on Hands pre-fills the target's missing HP.
11. **P-6-a:** Arcane Ward soaks damage by itself, or at least shows a ward-HP badge.
12. **P-3-d:** a Reckless checkbox on the dialog, and Reckless clears on a new turn.
13. **P-5-g:** show only the relevant Font of Magic option on each bar.
14. **P-2-a / P-2-d:** "Enter rolls Normal" in the help line; Esc closes any roll dialog.
15. **P-4-d:** show "Bite +5 to hit" instead of `1d20 + 3 + 4 - 2`.

**Low: polish, GM-side, or your call on table feel**
16. **P-5-h:** collapse the "Gamemaster privately rolled ?" rows from NPC saves in player chat.
17. **P-5-c:** hide or label Transmuted Spell for Marrith (The Inward Flame). This is a rules call.
18. **P-5-i:** moving an area re-rolls its damage. Keep it or reuse the roll?
19. **P-7-a / P-7-b / P-7-c:** a "looking…" line during a closer look, a quieter "studies X"
    card, and key 7 on the menu.
20. **P-9-a / P-9-b / P-9-c:** sensible character defaults (masteries from carried weapons),
    a cap on the gather text, and your call on Esc saving.
21. **P-5-j:** Innate Sorcery advantage for every sorcerer, not only Marrith.
22. **P-8-c:** distinct ZZ portraits. **P-6-b:** delete the Allosaurus stray (token
    `3MOg1yNcRGsrJtBj`, actor `zRTdAW9xtjnoMYzr`, still there).

**Process (the next run, not the table):** P-1-a, P-1-b, P-1-c, P-3-e, P-3-f, P-6-c, P-7-d,
P-7-e, P-8-a, P-8-b, P-8-d. In short: run the live areas **one at a time**, give each player tab
its own `zz<n>.localhost` host, keep the Talo user free, reload clients once after the fixers
finish, and place a Nilonim Vrinn token on Drow Prison for K4.

## 6. Remaining failures and unknowns

- **Never run live:** all of Area 1 (T1–T13 and the baseline); Area 2 A2, A4–A12, P (own dice),
  R (settings off); Area 3 P(C1), B0, C0; Area 4 D3–D15, G2; Area 6 W1–W14; Area 7 K2 after the
  fix, K3–K10 (including the **no-leak sweep**); Area 8 L1, L3, L5–L7, L10, L11; Area 9 PM2 with
  a real cursor.
- **The melee build review's live checks** (from `melee-streamlining.md` §15.4) are also still
  open: the R1 turn-flag write from a player client, Hew on an unlinked NPC, bar cleanup with a
  drawer open, Action Surge from the Special bar, and Pole Strike in the drawer.
- **The GM console has never been read** for errors in any area.
- **Known gaps left in the module README:** Argon's item-less Dash/Dodge don't zero the pips; a
  Bladesinger or Valor Bard cantrip in place of an attack zeroes the rest; swapping onto the Nick
  weapon mid-sequence keeps the planned Nick swing; rewinding the tracker reads as a new turn.
  `pentaryn-transform`'s Starry Form rebuild also has the empty-weapon-slot gap (R21).
- **Version display:** `game.modules` still says pentaryn-ties 0.19.2 / prompts 0.4.0. That is
  the manifest cached at world launch. The synced files are 0.19.3 / 0.4.1, and the GM tab serves
  the fixed code. A world relaunch updates the number. **Player tabs need a reload.**
- **World state at the end:** Drow Prison active and paused, no combats. `ZZ Arena` and 12 ZZ
  actors are kept for the re-run. Caven and Talo still show as logged in from earlier stage tabs:
  close those tabs.

## 7. What to test at the next real session (in this order)

1. **Reload every client** (or relaunch the world) so all fixes are live. Check it with
   `game.pentaryn.combat` present and the Rituals group on Caven's Cast Spell panel.
2. **Fighter-style Full Attack on a player tab:** press Full Attack with a target set, and check
   that the pips drop to 0. Press Esc on swing 1's dialog *without clicking it*; the pause bar
   should appear. Pick a new target through the faded strip. Swing one weapon by hand on the
   next turn; it should count.
3. **Rogue Sneak Attack, own dice:** with manual d20/d6 entry, check that nothing is asked twice
   and the offer disappears from the turn's other cards.
4. **Talo bear:** Full Attack → pips drop (U-4-0), no duplicate Multiattack button (U-4-1).
   Then click Bite by hand with a target set and see whether the target-clear surprise (P-4-a)
   bites. Decide P-4-a on the spot.
5. **Caven:** cast Detect Magic as a ritual from the HUD with no slot spent. Check the Arcane Ward
   names fit their buttons.
6. **Marrith:** Fireball click count (P-5-e). Quickened then cast: did the Bonus pip move (P-5-d)?
7. **Any player:** double-click an NPC on a scene that isn't active → Take a closer look rolls
   (U-7-0). The new menu items are there (U-7-1).
8. **Things to watch, not test:** the first-attack tutorial click for each player (P-2-b), chat
   noise from NPC saves (P-5-h), and whether the gold pulse on Hew and Off-hand gets noticed.

Before any of this, decide **P-4-a** and **P-2-b**. They are the two cheapest changes that remove
the most "why didn't that work" moments.
