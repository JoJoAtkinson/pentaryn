---
title: "Usability report — October 2026 run"
created: 2026-10-10
last_modified: 2026-10-10
status: run complete; live player-tab re-run still owed (§7)
tags: [plan, foundry, dnd5e, argon, usability, playtest, report]
---

# Usability report — October 2026

**Read this when:** you want the result of the 2026-10 player-usability run: what feels smooth,
what still costs clicks, what got fixed, and what to look at at the next session.
**Not this file:** the cases themselves → [`usability-test-plan-2026-10.md`](usability-test-plan-2026-10.md) ·
each applied change, with its revert and retest steps → [`usability-changes-2026-10.md`](usability-changes-2026-10.md) ·
how Full Attack and the riders were built → [`melee-streamlining.md`](melee-streamlining.md) (§15.4 has the 24 build-review fixes).

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
