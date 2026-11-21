---
title: Feedback triage — the 2026-11-19 session's reports
status: shipped
last_modified: 2026-11-20
tags: [foundry, feedback, triage, plan]
---

# Feedback triage — 2026-11-19 session (Island Village → Hags Den)

**Read this when:** running or reviewing the fix workflow for the 2026-11-19 reports (Wall of Stone, Empower, Stone's Endurance, Cosmic Omen, the scene tab, hit/miss, the Dice So Nice helper). **Not this file:** how the feedback module works → [`../foundry/feedback.md`](../foundry/feedback.md).

**What this is:** the 14 reports filed during the 2026-11-19 evening session (18:58–21:20), grouped into 12 fix clusters. Each cluster has the cause, how it was confirmed, and a recommendation. It is a proposal for Joe to review. Nothing here is built yet. The reports were filed on **core 14.369 / dnd5e 6.0.6**. Both were upgraded after the session (14.370 / 6.1.1, 2026-11-20), and every check below was run against the upgraded world.

**How it was confirmed:**

- each report's timeline and errors (`feedback_reports.py get`, raw JSON);
- the server log (`Logs/debug.2026-11-19.log`), the tunnel log (`.run/cloudflared.log`) and the systemd journal;
- live reads with `eval-js` on the pentaryn world;
- the installed core and dnd5e bundles;
- a scratch reproduction (a Wall of Stone region, created and then deleted);
- a browser play test from the Mac against a throwaway sandbox (scene `ZZ Playtest (Hags Den copy)`, the ZZ actor copies, and the passwordless users `ZZ Player` and `ZZ GM`). The results are in §Browser play test.

**Ready for the 2026-11-21 workflow:** start at §Workflow handoff (end of file). It was reviewed by five agents on 2026-11-20 and supersedes the cluster text where they differ.

**Verdicts:** **CONFIRMED** = reproduced, or proven from code plus live data. **WORKS AS DESIGNED** = the behaviour follows the rule, but the UI misleads. **SETTING** = a world setting already does it. **FEATURE** = genuinely new. **UNCONFIRMED** = could not reproduce yet.

---

## Dedup map

| Report | Who | Cat. | Text (short) | Cluster | Verdict |
|---|---|---|---|---|---|
| `fpnsNR` | Marrith | defect | After viewing "Pentaryn — Entry" no tab back to our map; must refresh | **A** | CONFIRMED |
| `8t6Nn1` | Talo | bug | Wall of Stone turned green and disappeared | **B** | PARTLY (no real walls; thin line on small grids) |
| `jz6tqK` | GM | bug | Players should see Bloodied on monsters (not HP) | **C** | SETTING |
| `ORGqVN` | Caven | feature | On a miss, say so instead of just not progressing | **D** | SETTING + small feature |
| `hKDbzi` | Marrith | feature | "Attack – Hit" (blue) / "Attack – Miss" (orange); blue "Damage Roll" | **D** | SETTING + small feature |
| `d3rePk` | Talo | defect | Used Cosmic Omen odd but it said even | **E** | WORKS AS DESIGNED (UI defect) |
| `GDJJdi` | Marrith | defect | Empowered Spell: unclear which dice were rerolled | **F** | CONFIRMED (+ 2 SP lost, save re-rolled) |
| `SvOaxr` | Caven | bug + feature | Talo's Stone's Endurance showed "Caven +11"; show who applied a heal | **G** | CONFIRMED (can heal an enemy target) |
| `kmuABM` | Caven | bug | Occasional small disconnects, a couple of seconds | **H** | CONFIRMED (cause probable) |
| `BhfpXW` | GM | bug | Everything turned grey and seemed bugged | **I** | NOT REPRODUCED on 14.370 |
| `xQ9tdh` | Caven | feature | Smart movement: path around walls within your speed | **J** | FEATURE |
| `VDalcb` | Caven | feature | Show that a spell/concentration duration is time LEFT | **K** | FEATURE (copy) |
| `sREUaG` | GM | feature | Ruler distance per map (each map's own scale) | **L** | SETTING (scene config) |
| `Lzzlyq` | Caven | feature | "Make multi-selecting dice easier" (for Kyle) | **M** | CONFIRMED (DSN: no select-all / box select) |
| — (Joe, 2026-11-20) | Joe | feature | Public vs hidden token markers, configurable | **N** | FEATURE (extends C) |

---

## Recommended order

**Decisions, 2026-11-20 (Joe):**
- Players see hit/miss: "when a player attacks they know if they hit or miss". `attackRollVisibility` was set to `hideAC` that day.
- The Marrith session is over. Caven, Marrith, Talo and Raven got a full long rest that day: HP, slots, Hit Dice and uses; concentration, Starry Form, Mage Armor, Warm Shield and Innate Sorcery ended; Talo's stored omen cleared. The 2 lost Sorcery Points are moot (12/12).
- Cosmic Omen stays RAW (explained to Joe; no house rule asked for).
- M is clarified: it is Dice So Nice's persistent dice (see M).

1. **Today, no code (≈10 min):** C (Bloodied → `all`), ~~D's setting~~ (done), H (tunnel `protocol: http2`), L (tell the GM where the setting lives).
2. **Small module fixes, one session:** F0 (Empower re-rolls the save: rules bug) and G (a self heal can land on an enemy target) first, then A (pins nav tab), E (omen dialog), the rest of F (dice animation + sheet guard) and K (duration "left").
3. **Medium:** B (wall spells drawn as walls), D's label/colour feature.
4. **Investigate / large:** J (pathfinding). M (the DSN dice helper) fits in step 2 or 3.

---

## A — No way back to your own map after viewing the lobby (`fpnsNR`) · CONFIRMED · pentaryn-pins

**What happened.** Marrith's player was pinned on Island Village. At 19:02 they clicked "Pentaryn — Entry" in the scene navigation (the active lobby), and then they had no tab to get back. They reloaded twice.

**Cause.** In core v14, `SceneNavigation#prepareScenes` shows a scene to a player only when it is `active`, is the one being viewed, or has `navigation && visible`. All four Pentaryn maps have `navigation: false`, so the map a player is on has a tab only while they are viewing it. Pins says "they may click the scene nav to look at another map (nothing redirects them)", but nothing gives them a way back either. The hotbar macro **"Back to my character"** (slot 1, `zH6cda9MQRjlZ4og`) does exactly this, and nobody used it. It is not discoverable.

**Recommendation.** In pentaryn-pins, on `renderSceneNavigation` (pinned player clients only):

- add a tab for the pinned token's scene, labelled with the character name ("⟵ Marrith"), whenever the player is viewing another scene;
- a click runs the same view as the macro: the token's scene and level, the token selected and panned to.

This is a client-only render, with no document writes, and the macro stays as a fallback. Do not set `navigation: true` on the maps instead: that would show every map to every player.

**Effort:** S. Golden test: the nav rule as a pure function `pinnedNavTab(user, viewedSceneId, pinTokenScene)`.

## B — Wall of Stone "turned green and disappeared" (`8t6Nn1`) · CONFIRMED · pentaryn-aoe

**What happened.** Talo cast Wall of Stone (Long Panels) at 19:30. The server log shows the Region `Bv9Y7EngJv453jWz` was created at 19:30:23 and lived until concentration ended at 20:01. It was never deleted. It just could not be seen.

**Cause.** dnd5e 6 maps the `wall` area type to a `ray`, so the region is a *line* shape whose width is the wall's thickness: 0.25 ft for Long Panels, 0.5 ft for Square Panels. On Island Village's 50 px / 5 ft grid that is a **2.5 px** line. On Hags Den's 150 px grid it is 7.5 px. It is drawn in the caster's user colour, and Talo's is dark green `#055201`. So the player sees a green line, and then nothing. Reproduced with a scratch region (shape `{type:"line", length:200, width:2.5}`) and then deleted. Two more problems:

- only 1 of the 10 panels was ever placed (the template count is 10, `contiguous`);
- the "wall" blocks nothing, because no Wall documents are created.

**Browser test (T5):** on a 150 px grid the panels draw as a hatched band about a square thick and are easy to see, so "disappeared" is not universal. The 2.5 px case (a 50 px grid, a dark user colour on a dark map) was not re-run. What T5 did confirm: no Wall documents are created, and right-click does not end placement (Escape does). Treat point 1 below as a guard for small grids and dark colours, and point 2 as the main fix.

**Recommendation.** In pentaryn-aoe, add "wall spells":

1. Draw any `wall`-type template region with a minimum visible thickness (e.g. `max(width, grid/5)`) and a solid stroke in a neutral stone/force colour, not the user colour.
2. Behind a setting (default on), create real Wall documents along each panel (move + sight; Wall of Force: move only, transparent). Tie them to the region, so they are deleted with it and with concentration, through the existing concentration cleanup.
3. Show a counter while placing ("Panel 2 of 10, right-click to finish").

Point 1 alone closes the report. Point 2 is what players expect a wall to do.

**Effort:** M. **Corrected in §H4:** Wall of Fire blocks sight, not movement. Blade Barrier and Wind Wall get no walls. Wall of Ice does not block sight (Joe, 2026-11-20).

## C — Players can't see Bloodied on monsters (`jz6tqK`) · SETTING · world setting

**Cause.** `dnd5e.bloodied` is `"player"`: only player characters get the Bloodied status. dnd5e already offers `"all"`, which shows the Bloodied marker on every creature and never the HP. That is exactly what the GM asked for.

**Recommendation.** Set `dnd5e.bloodied = "all"`. This is one setting and needs no code. Check once at the table that hidden monsters (and dormant statues) show nothing extra.

## D — Say Hit / Miss on attacks (`ORGqVN`, `hKDbzi`) · SETTING + small feature · world setting, pentaryn-aoe

**Cause.** `dnd5e.attackRollVisibility` is `"none"`, so players are never shown hit or miss. pentaryn-aoe rolls damage on a hit and rolls nothing on a known miss (`aoe.md` "Attacks"), so on a miss "nothing happens". That is Caven's report. `aoe.md` already notes that changing this setting is Joe's call.

**Recommendation.**

1. **Joe:** set `attackRollVisibility = "hideAC"`. Players then see dnd5e's hit/miss marker without learning the AC. This alone answers ORGqVN.
2. **Feature (hKDbzi):** with hit/miss visible, pentaryn-aoe's `dnd5e.renderChatMessage` adds the suffix "— Hit" (blue) or "— Miss" (orange) to the attack card title. On a hit, the follow-up "Damage Roll" title is coloured blue. On a miss it posts one short line ("Miss — no damage") so the turn visibly moves on. All of this comes from the target data dnd5e already stores on the card. It must respect the visibility setting, so nothing is shown while it is `none`.

**Effort:** S. The setting is a decision, not work.

## E — "Used Cosmic Omen odd but it said even" (`d3rePk`) · WORKS AS DESIGNED (UI defect) · pentaryn-riders

**What happened.** No omen was stored for the day: the stars had not been read at the long rest. Talo clicked **Woe (Odd)** in dnd5e's activity choice dialog. Riders' `preUseActivity` stopped the use, rolled 1d6 = **2** → Weal, stored it, and redirected to Weal. The chat shows "Cosmic Omen: Weal (even)". That is correct by the 2024 rule (the die decides the omen). The live flag is `omen: "weal"`, with a 1d6 total of 2 at 21:04:13.

**Cause.** `rest.mjs` `markChoiceDialog` only marks the dialog *when an omen is stored*. With none, both choices look selectable, and then one is overridden.

**Recommendation.** When no omen is stored, the choice dialog shows one "Read the stars (1d6)" line above the two buttons and marks both "the die decides". Alternatively, replace the dialog with the read button. The redirect notice should say "You picked Woe, but the stars rolled 2: Weal". The same hint goes on Argon's button.

**Effort:** XS. **Needs Joe** only if he would rather let the player choose (a house rule). The current behaviour is RAW.

## F — Empowered Spell is confusing, and 2 Sorcery Points were lost (`GDJJdi`) · CONFIRMED · pentaryn-riders

**What happened.** Disintegrate rolled 77 (`5 4 5 6 1 3 6 1 1 5`). One Empower click rerolled exactly the four dice below average (1, 3, 1, 1 → 4, 3, 1, 4), for a new total of 83. The arithmetic is right. Then the player opened **Empowered Spell from the sheet twice**: usage cards `TWAFxxEXb9KgZyO3` and `l7gwVhcufUyG0hvh`, each spending a Font of Magic use. That is **2 SP gone with no effect**. They then opened Font of Magic, presumably to get the points back.

**Cause.**

- The new card lists all 14 results with only dnd5e's strike-through, and Dice So Nice may animate the whole roll (the browser test confirms which).
- Nothing on the card says "rerolled 4 dice: 1→4, 3→3, 1→1, 1→4, 77 → 83".
- The sheet activity spends a point with no damage card to act on.

**Browser test (T4):** the card already has the "Empowered Spell (1 SP): 2 → 5, 3 → 2…" line. The confusion comes from Dice So Nice re-animating all the dice and from the old total being missing. Found in the test: **the Empower click also re-rolled the target's save** (pentaryn-aoe resolves the new damage card as a fresh tray). By the rules only the damage dice are rerolled, and the save stands.

**Recommendation.**

0. **Bug, fix first:** pentaryn-aoe must carry the superseded card's saves over to the empowered card (`flags.pentaryn-riders.empowered.from`) instead of rolling new ones. No second request card for players either.
1. Put the old total on the empowered card's line ("… (77 → 83)") and make the changed chips stand out more than dnd5e's grey.
2. Dice So Nice: show only the rerolled dice (`game.dice3d.showForRoll` on a roll built from the new results).
3. The sheet or HUD Empowered Spell activity: on `preUseActivity`, if the caster has a recent un-empowered spell damage card, run Empower on it. Otherwise stop the use with "Use the Empower button on your spell's damage card" and spend nothing.
4. **Joe:** refund Marrith's 2 SP (Font of Magic shows 9/12 now; check against the night's other spends).

**Effort:** S–M.

## G — Stone's Endurance showed "Caven +11" (`SvOaxr`) · CONFIRMED (misapply risk) · pentaryn-aoe

**What happened.** The healing card `Q8crAEk3WdjBg9gt` (1d12 + 3 = 11) was applied by Talo to **Talo's own token**. `flags.pentaryn-aoe.applied` records `by: Talo`, target Talo. Nothing was misapplied.

**Cause.** The card records no targets (it is a self-range activity). dnd5e's apply tray on an untargeted card lists the viewer's **targets**, or else their **selected tokens**, so on Caven's screen the row read "Caven +11". Browser test T3: with an enemy targeted, the tray offers to heal **the enemy**. This is a real misapply risk, not only a display problem.

**Recommendation.**

1. For a self-range activity (`range.units === "self"` or `affects.type === "self"`), pentaryn-aoe stamps the caster's token as the card's target at creation, the same way 0.6.4 stamps an area's creatures. Every viewer then sees "Talo +11".
2. **Feature:** under any applied damage or healing tray, add a line "Applied by Talo → Talo (+11)". **Correction (§H2 G2):** no amount is stored today, and the stamp only runs for untargeted cards, so this needs new writes. Show it to the GM always, and to players for their own cards (Joe's call).
3. Side note, not a bug: Stone's Endurance is modelled as healing, while the rule is damage *reduction*. Leave it unless it causes HP-at-max edge cases.

**Effort:** S.

## H — Short disconnects for everyone (`kmuABM`) · CONFIRMED, cause probable · tunnel config

**Evidence.**

- Every player's report recorded "lost connection… re-established" within 1–2 s. Across the four clients the drops are **simultaneous**: 19:03:09–19:03:24, 19:04:21–30, 19:07:50–08:05, 19:09:30–48. The GM also dropped alone at 17:19–17:27.
- The server stayed healthy. The 10 s localhost probe has no gap over 15 s for the whole session, and there are no errors in the journal.
- The tunnel stayed registered, with no reconnect between 23:30Z and 03:18Z.
- But at the 21:30Z (16:30 local) tunnel start, cloudflared's own precheck said **"UDP Connectivity … FAIL — QUIC connection failed … proceed using http2"**, and the tunnel ran **`protocol=quic`** all night anyway. The same precheck warning appears every day back to 2026-11-02.
- Brief, synchronized drops while the tunnel stays up fit QUIC stream resets over WSL2's NAT'd UDP.

**Recommendation.**

1. Pin `protocol: http2` in `foundry/cloudflared/config.yml` and restart the tunnel (`make tunnel-down && make tunnel-up`, or let the nightly do it).
2. Next session, compare: grep every report's errors for `lost connection` (the script used here is in this plan's history) and check the bug button gets fewer of them.
3. If drops continue on http2, look at BOSS's Windows network (Wi-Fi power saving, WSL mirrored networking) next.

**Effort:** XS. Fully reversible.

## I — "Everything turned grey" (GM, `BhfpXW`) · NOT REPRODUCED on 14.370 · core / multi-token-edit

**What happened.** On Hags Den, right after combat ended, the GM's client opened multi-token-edit's **Mass-Token SEARCH** window (Shift+F). With it open, Caven's token moved, and two errors followed in the same second:

- `Cannot read properties of null (reading 'blendMode')` at `PrimarySpriteMesh._renderVoid`;
- `Cannot read properties of null (reading 'clear')` at `GridHighlight.clear`.

These are PIXI objects drawn after being destroyed, which stops the render loop and leaves a grey canvas. An F5 fixed it.

**Likely trigger.** An accidental hotkey: multi-token-edit binds Shift+F, Shift+D, Shift+E and the bare keys H, V, L and U. A token redraw mid-drag then hit a destroyed mesh. That was core 14.369; 14.370 has since been installed. The headless GM has no canvas, so this needs the browser test (T6).

**Browser test (T6): not reproduced on 14.370.** Close the report as "not reproduced after the core update". If the same stack (`PrimarySpriteMesh._renderVoid` / `GridHighlight.clear`) shows up in a future report, reopen it.

**Original recommendation, kept in case it recurs.** If it reproduces, report it upstream (multi-token-edit) with the stack, and consider unbinding the bare-key H/V/L/U mirrors and links, which a GM can hit while typing on the canvas. If not, close it as "not reproduced on 14.370" and watch for the same stack in future reports.

## J — Smart movement around corners (`xQ9tdh`) · FEATURE · pentaryn-movement

**Cause.** Core v14's `Token#findMovementPath` does no pathfinding: it creates terrain waypoints and then constrains the straight path, stopping at the first wall. The API exists for a module to override, and dnd5e's override only adds waypoints before blocking creatures.

**Recommendation.** Before building, evaluate whether a maintained v14 pathfinding module exists. If not, add an opt-in pathfinder in pentaryn-movement:

- grid A* over the scene's movement walls (respecting doors and pentaryn-movement's ghost mode);
- capped by the token's remaining movement in combat (dnd5e `movementAutomation: full` already tracks it);
- a drag that would clip a corner finds the path instead, and the ruler shows the bend;
- GM `unconstrainedMovement` still wins.

This is the largest item here, so give it its own plan.

**Effort:** L.

## K — Duration: is it time left or time passed? (`VDalcb`) · FEATURE (copy) · pentaryn-riders or a tiny UI patch

Caven was on his sheet's **Effects** tab when he filed it. The duration shown there is the remaining time, unlabelled.

**Recommendation.** Append "left" to the Effects-tab duration ("9 rounds left", "1 h left"), and to the concentration effect's tooltip on the token and the Argon HUD. **Correction (§H2 K):** wrap `ActiveEffect5e#getDurationParts` instead, which covers both the sheet and the tooltip.

**Effort:** XS.

## L — Ruler distance per map (`sREUaG`) · SETTING · scene config

Every scene already has its own scale: **Scene Configuration → Grid → Grid Scale (distance) and Units**. The ruler uses it. All four Pentaryn maps are set to 5 ft. Island Village is 50 px per 5 ft, which matches its art.

**Recommendation.** Show the GM where the setting is. For an overland or region map, set e.g. 1 mile, units "mi". Ask which map looked wrong; it was the lobby splash when the report was filed. No code.

## M — "Make multi-selecting dice easier" (`Lzzlyq`) · CONFIRMED (clarified by Joe) · new small module over Dice So Nice

**Joe, 2026-11-20:** in Dice So Nice it is frustrating that there is no way to select all of the dice. There is no clear way to highlight them, and a click-drag selects on the board instead. He wants a better way to do larger rolls with physical-style dice. (My guess from the timeline, multi-targeting, was wrong.)

**Cause (DSN 6.4.5 "persistent dice", from its bundle and lang file).**
- Dice are spawned one at a time from the DSN sidebar tab (a + per die type).
- A die is selected with **Ctrl+click**, one by one. The only place that says so is a help panel hidden behind a toggle.
- There is no select-all, no select-by-type and no box select. A drag on empty board goes to Foundry's canvas, which starts a token selection.
- The internals are reachable (`game.dice3d.box.persistentDiceManager`: `selectedPersistentDiceIds`, `togglePersistentSelection`, `clearPersistentSelection`, `getSelectedPersistentDice`, `spawnPersistentDie`, `countPersistentDiceByOwner`), but none of them is a documented API.

**Recommendation.** A small add-on (e.g. `pentaryn-dice`), without changing DSN's own files:
1. On `renderDsnSidebarTab`:
   - a count box per die row ("+ ×8" spawns 8d6 in one click);
   - **Select all mine**, **Select all d6** (per row) and **Clear selection** buttons;
   - the Ctrl+click hint shown inline instead of behind Help.
2. A keybinding (e.g. Ctrl+A while the dice board has focus) to select all of your own dice.
3. Optional, medium: Shift+drag on the board draws a box and selects the dice inside it. This projects each die's position through DSN's three.js camera, and stops the drag reaching the token layer.

**Risk:** it rides DSN internals, so pin `dice-so-nice` in `foundry/update-policy.yml` and add a smoke check that the four manager methods exist. For big rolls the digital route already works: roll normally and type the real total in the card's per-row box (aoe "Real dice").

**Effort:** S for 1 and 2, M with 3.
---

## N — Public and hidden token markers (Joe, 2026-11-20; follows from C) · FEATURE · pentaryn-creatures

**Joe:** "there should be hidden and public markers". He asked for a review of (a) whether it can be configurable, and (b) whether Bloodied is the only one that makes sense public, or whether other markers should be public too.

**(a) Can it be configurable? Yes, at one hook point.** dnd5e 6.1.1 decides per effect and per viewer with `ActiveEffect5e#isConcealed` (dnd5e.mjs ~7713):
- a concealed effect is not drawn as a token icon, because `isTemporary` (~7746) returns false for it;
- it is left out of the sheet's effects list (~61396);
- it shows no scrolling status text (~8424).

An owner or observer of the actor always sees everything. Today the **only** rule is Bloodied: with `bloodied = "player"`, it is hidden on non-friendly tokens. **Every other marker is already public** to anyone who can see the token: Prone, Poisoned, Frightened, Concentrating, and every spell buff with an icon (an enemy's Mage Armor, Bless, Hex). No pentaryn module conceals anything today.

So wrapping that one getter is enough: a world setting maps each status to **Public** or **GM only**. Owners and observers are unchanged, so the player always sees their own character.

The new setting:
- a small menu in Configure Settings, one row per `CONFIG.statusEffects` entry with Public / GM only;
- one row "other spell and item effects on enemies" (the icons that are not a status);
- a toggle "friendly tokens show everything".

Like dnd5e's own Bloodied, the effect data still reaches every client; only the drawing is hidden.

**(b) Is Bloodied the only one? No.** The right line is *what you could see across a real table* (Joe's test for Wall of Ice).

Recommended defaults (my judgement, for Joe to adjust):

| Public: you can see it at the table | GM only: you learn it from the GM's description or a roll |
|---|---|
| Bloodied, Dead, Unconscious, Prone, Grappled, Restrained, Paralyzed, Petrified, Stunned, Incapacitated, Sleeping, Burning, Bleeding, Flying, Hovering, Burrowing, Dodging, Transformed, Invisible (only shows when the token is seen anyway) | Charmed, Frightened, Poisoned, Exhaustion, Cursed, Surprised, Stable, Deafened, Blinded, Silenced, Suffocation, Hiding (owner + GM), Ethereal, Marked (owner + GM: Hunter's Mark/Hex are the caster's knowledge), **every non-status spell/item effect on an enemy** (Mage Armor, Shield of Faith, Bless) |
| **Joe decides:** Concentrating on an enemy. Tables split. The 2024 rules give no visible sign, but players hitting a concentrating caster is a big tactical call. Recommend GM only, with the GM announcing it when it matters. | |

Hazards:
- **Dormant statues** (`creatures.dormant`) must conceal *everything* until they wake. That closes the giveaway the rules review found for C.
- **Multi-target cards and the Look window** (`pentaryn-ties`) must not list concealed effects to players. Check `look-app.mjs`.
- Argon's HUD shows the controlled token's own effects only, so it is unaffected.

**Owner:** pentaryn-creatures (it already owns token display rules: `ownerSees`, dormant), added as unit **N** at the end of a new **creatures** lane in the handoff. Needs an adjustments row (`dnd5e-effect-isConcealed`).

Tests:
- a pure `concealFor(statusIds, viewer, token, settings)` in core with a golden;
- regression: the Bloodied behaviour under `player` / `all` is unchanged when the new setting is at its defaults.

**Effort:** S–M (the settings menu is most of it).

---

## Browser play test

Run from the Mac (home-pro) against the sandbox on 2026-11-20. Results are filled in below as they arrive.

| Test | Report | Result |
|---|---|---|
| T1 scene tab after viewing the lobby | `fpnsNR` | **REPRODUCED.** Tabs were "ZZ Playtest" (viewed) and "Pentaryn — Entry". After clicking Entry, only Entry is left. A player has no Scenes sidebar and the nav has no dropdown. F5 lands back on the pinned map. |
| T2 hit/miss shown to a player | `ORGqVN` `hKDbzi` | **REPRODUCED.** Hit (nat 7, total 16): no "Hit" text and an empty target pane; damage auto-rolled. Miss (nat 1): only red ✕✕ fumble icons, no "Miss" text, no damage card, no message, no toast. |
| T3 Stone's Endurance tray rows | `SvOaxr` | **REPRODUCED, and worse than reported.** The tray opens in *targeted* mode and lists the player's **target, an enemy** ("ZZ Bog Vessel 4"). Switched to selected mode it lists whoever is selected. It never defaults to the caster. One Apply click would heal the monster. |
| T4 Empowered Spell card and dice | `GDJJdi` | **REPRODUCED.** The card already says "Empowered Spell (1 SP): 2 → 5, 3 → 2, 1 → 1, 2 → 1, 1 → 6", with the old dice greyed before their replacements. But Dice So Nice animates **all 10 dice**, the new card shows 15 chips and not the old total, and **the Empower click rolled the target's Dexterity save a second time** (`uqoPh9Ts…` = 2, then `V0ynDZht…` = 4; two save rows on the usage card). Rerolling the 3 and the 2 is the documented "below average" rule, not a bug. |
| T5 Wall of Stone on the map | `8t6Nn1` | **PARTLY REPRODUCED.** On the 150 px sandbox the 3 placed panels draw as a hatched blue band about a square thick at every zoom, so they are visible. No Wall documents were created (still 369 walls): nothing blocks movement or sight. Right-click does not end placement; Escape does. Talo's vanishing was on a 50 px grid, in dark green on a dark swamp map, and was not re-run there. |
| T6 grey canvas (Shift+F, then drag) | `BhfpXW` | **NOT REPRODUCED on 14.370.** Shift+F, Shift+D and Shift+E with drags: no grey canvas, no blendMode / GridHighlight errors, 37–66 fps. |

Side finding (not a bug): every token's stored `rotation` changes on a move (the PCs sit at 71.57° and the dragged copy at 26°), but `lockRotation` is on, so the art never turns. Leave it.

**Sandbox: removed 2026-11-20** (the scene, the 3 ZZ actors and their folder, the users ZZ Player and ZZ GM, 14 test chat cards).

---

## Workflow handoff (reviewed 2026-11-20; for the 2026-11-21 run)

Five read-only reviewers checked this plan from five angles: code grounding, rules and platform API, work decomposition, release and conformance, and verification and regression. **Where a cluster section above disagrees with this section, this section wins.** File and line references are relative to `foundry/module/` unless a path says otherwise. Installed versions: core 14.370, dnd5e 6.1.1, **Dice So Nice 6.4.5** (not 6.4.4).

### H0. Ground rules for the run

- **Pattern:** one builder per module *lane*, each in its own worktree. A cold reviewer then reads each lane, and a fix pass follows. One **integration** agent merges, bumps versions and runs the gates.
- **Lane agents never:** commit to main, sync to Foundry, restart anything, or write to the live world (`eval-js` reads only).
- **Versions:** lanes do **not** bump the `module.json` version, `VERSION` in the core file, or the describe golden. They write CHANGELOG bullets under `## Unreleased` only.
- **The integration agent** bumps each module once: aoe 0.7.0, riders 0.8.0, pins 0.5.0, and dice 0.1.0 (new). It then refreshes goldens one file at a time (`GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then read `git diff -- test/golden`, never on the whole suite). Then it runs `make foundry-module-index`, `make check-context`, `make foundry-modules-check` and `make test`. **It stops at "gates green, working tree ready".**
- **Sync, restart and the browser test** (§H6) are a separate step that waits for Joe's go.
- `foundry/adjustments.yml` is append-only: each lane adds rows with its module prefix, and integration resolves the merge. Every change a player can notice (A, B1, D2, E, F0, F3, G1, G2) is tagged `[declared]` in its commit and CHANGELOG, and its golden change goes in a separate commit (blueprint §9).
- Close reports with the MCP tool `mcp__dnd-scripts__feedback_resolve` (CLAUDE.md: MCP before script). `scripts/feedback_reports.py` is only the fallback.

### H1. Lanes and work units

Lanes run in parallel. Units inside a lane run in the order shown.

| Lane | Order | Unit | What | Size |
|---|---|---|---|---|
| **aoe** | 1 | **F0** | Empower keeps the saves (+ the GM Apply `origin` fix) | S |
| | 2 | **G1** | self-only damage and healing cards target the caster | S |
| | 3 | **G2** | "Applied by X → Y (+n)" | XS–S |
| | 4 | **D2** | Hit / Miss on attack cards | S |
| | 5 | **B1** | wall-spell regions drawn visible | S |
| | 6 | **B3** | panel counter + Escape hint | XS |
| **riders** | 1 | **E** | Cosmic Omen dialog says the die decides | XS |
| | 2 | **F1** | empowered card shows old → new total | XS |
| | 3 | **F2** | Dice So Nice animates only the rerolled dice | S |
| | 4 | **F3** | the sheet or HUD Empowered Spell can't waste a point | S |
| | 5 | **K** | durations say "left" | XS |
| **pins** | 1 | **A** | "⟵ <character>" tab in the scene nav | S |
| **dice** (new) | 1 | **M1** | `pentaryn-dice`: Dice So Nice sidebar buttons + shortcut | S |
| **creatures** | 1 | **N** | public/hidden token markers: wrap `isConcealed`, settings menu, dormant tokens conceal all | S–M |
| config | — | **H** | tunnel `protocol: http2` (integration agent, config only) | XS |

The aoe and riders lanes meet only at one flag contract. riders writes `flags.pentaryn-riders.empowered = { from, cost, changes }` (`pentaryn-riders/empower.mjs:255`), and F1 adds `oldTotal` to it. aoe only *reads* `from`. Neither lane changes that shape otherwise. The dice lane touches shared repo files (`scripts/foundry/ops/config.py`, `foundry/update-policy.yml`, the README routing table, `.claude/skills/`), so it merges last.

**OUT of this run:**

- **B2** (real Wall documents): it needs Joe's per-spell table in §H4 first.
- **J** (pathfinding): it needs its own plan.
- **M3** (box select on the dice board).
- **I** (close it only).
- **F4** (refunding the 2 Sorcery Points): moot after the long rest.

### H2. Per-unit spec, with the reviewers' corrections

**F0 — Empower keeps the saves (aoe).**

Why it happens:
- `empower()` copies only riders' own flags onto the new card (`pentaryn-riders/empower.mjs:247-256`).
- The GM's `createChatMessage` hook (`resolve.mjs:629-639`) then sees a damage card with no resolution and calls `resolve()`. That re-rolls NPC saves (`:271`) and posts a new player request (`:273`).
- `fillEarlierSaves` (`:291`) can't rescue the old saves: it skips module NPC saves, and the old tray is still live.

Fix:
- In `resolve()`, right after `buildRows` (`:220-223`): when `message.flags["pentaryn-riders"]?.empowered?.from` points at a card whose resolution is for the same activity, carry over its `rows[].save`, `region`, `careful` and `request`. Keep the new card's damages, and skip `postRequest`.
- Refuse the carry when `areaLocked(oldRes)`.
- A pending player save still lands, because `matchSave` (`core.mjs:159`) matches on `request`.
- Put the logic in a pure `carryResolution(oldRes, newRows)` in `core.mjs`.

Also fix:
- The GM tray's Apply (`resolve.mjs:541`) calls `applyDamage` without `origin: message`. So riders' `onApplied` (`empower.mjs:280-291`) never marks the card applied, the Empower button survives the Apply, and that allows double damage.
- Pass `origin: message` as the relay does (`apply.mjs:427`).
- Declare the cross-module read: `flags.pentaryn-riders.empowered` goes in aoe's `MANIFEST.flags.reads` and in riders' README table of flags other modules read.

Rules: the 2024 Empowered Spell rerolls "a number of the damage dice" only, so the save stands.

Accept when:
- the empowered card shows the original save rows;
- there are zero new save messages and no new request card;
- Apply uses the old outcomes;
- after a GM Apply, the old and new cards show no Empower button.

Tests: new `test/empower-carry.test.mjs`. Regression: `careful-*.test.mjs` (Careful Spell is kept through `usedBy`), `early-saves.test.mjs`, and `resolve.test.mjs` "aoe-edge-2" (the superseded tray is never revived).

**G1 — self-only cards target the caster (aoe).**

- The 0.6.4 stamp (`resolve.mjs:256-264`) runs only for save activities, so it can't be reused directly.
- Add a `preCreateChatMessage` hook in `apply.mjs`, on the author's client. For a `damage` or `healing` card that recorded no targets, from a self activity, call `updateSource({"system.targets": TargetsField.getDescriptors([casterToken])})`.
- Reuse `targetDescriptors` (`messages-adapter.mjs:56`) and the self rules in `selfApplyReason` (`core.mjs:503-522`).
- dnd5e's tray (`DamageApplicationElement.buildTargetsList`) reads `system.targets` in targeted mode, else the controlled tokens. Once targets are recorded, `lateTargetCard` (`core.mjs:270`) and the `applyTargets` fallback leave the card alone.
- **Hazard:** `range.units === "self"` alone also matches Self-range cones, lines and emanations (Burning Hands, Thunderwave, Spirit Guardians, `aimsFromCaster` `core.mjs:564`). Stamp only when the activity has **no `target.template.type` and no save**. Never write `areaTargets` or `recordedTargets`.

Accept when:
- Stone's Endurance lists "Talo +n" for every viewer, with an enemy targeted;
- Burning Hands and Spirit Guardians never list the caster;
- Cure Wounds (touch) still fills from late targets;
- Mage Armor's `untargetedSelf` path is unchanged.

Tests: new `test/self-target.test.mjs` and the `self-apply.json` golden. Regression: `card-apply.test.mjs` (relay, late targets, typed totals).

**G2 — "Applied by" (aoe).**

- The plan was wrong that "the data is already there". `stampApplied` (`apply.mjs:334`) stores `{at, by, targets}` with **no amount**. It runs only for untargeted or late-target cards (`:281`), so after G1 it would never run. `applyRows` (GM tray) and `applyRelay` don't write it either.
- Make `stampApplied` run on every Apply, record the amount, and add it to `applyRows` and `applyRelay`.
- Render "Applied by <user> → <token> (±n)" under the tray.
- Visibility: a world setting `showAppliedBy` = `gm` | `owners` | `all`, default `owners` (the GM always sees it; players see it on cards they wrote or own a row of). **Joe can change the default.**

**D2 — Hit / Miss (aoe).**

- There is no aoe render hook on attack cards today. Add `dnd5e.renderChatMessage` in `attacks.mjs`, and a pure `attackOutcome` next to `shouldAutoDamage` (`core.mjs:178`).
- The data: `message.system.evaluatedTargets[i].isMiss` on the attack-type message. The DOM is `target-pill[data-hit]` / `[data-miss]` in dnd5e's `templates/chat/attack-card.hbs`, present only when `showResult` is on, which `hideAC` allows.
- Label: one target gets "Attack — Hit" in blue or "Attack — Miss" in orange in the title. Several targets get the result per pill, with no title suffix. Treat `ac === null` (total cover) as a miss. No recorded target means no label (T2's empty pane).
- On a hit, colour the follow-up "Damage Roll" title blue.
- On a miss, **render** a "Miss — no damage" line on the attack card itself. Do not post a new ChatMessage, which would duplicate across clients.
- Show nothing while `attackRollVisibility` is `none`.
- Update `context/foundry/aoe.md:103`, which still calls the setting "Joe's call". It has been `hideAC` since 2026-11-20.
- Tests: new `test/hit-miss.test.mjs` and the `attacks.json` golden. Add on re-render without doubling the label, and cover the mixed-target case. Regression: `attacks.test.mjs` (damage still rolls on a hit).

**B1 / B3 — wall-spell regions (aoe).**

- B1:
  - Draw a minimum visible thickness, `max(width, grid/5)`, with a neutral stroke on the **Region placeable only**.
  - Do **not** change the shape's width. That would change which creatures the area resolves.
  - Hook through the existing region code in `areas.mjs` (`preCreateRegion` at `:424` for flags, the region draw for the visuals).
  - Name any new file `wall-spells.mjs`, because `walls.mjs` already exists.
- B3:
  - In the `placeRegions` wrap in `aim.mjs`, show "Panel n of N: Esc to finish, right-click skips a panel".
  - Core's `placeRegions` says "Right-click skips the placement of a shape" (`#skipPlacement`, foundry.mjs ~186639), and Escape runs `_cancelPlacement`, while dnd5e's `preConfirm` keeps the panels already placed. So Escape is the real "finish". Fix `aim.mjs`'s header, which says right-click cancels.
- Accept when panels are clearly visible on a 50 px grid in a dark user colour, and the counter is shown. Tests: new `test/wall-spells.test.mjs` (thickness rule). Regression: `area-walls*.test.mjs`.

**E — Cosmic Omen (riders).**

- `markChoiceDialog` returns early with no omen stored (`rest.mjs:287`). With none stored:
  - add a "Read the stars (1d6): the die decides" line;
  - mark both buttons "the die decides";
  - don't replace the dialog.
- `redirect` (`:303`) throws away the rolled face (`?.omen`); keep it. The `redirect` string (`lang/en.json:138`) becomes "You picked {clicked}, but the stars rolled {face}: {omen}".
- Argon hint: `omenButtonMark` (`riders-core.mjs:704`) returns no mark when no omen is stored; give it a "the die decides" mark.
- Regression: `markArgonButton`, `argon-tidy.test.mjs`, the hook order in `context/foundry/argon.md`. Tests: extend `test/rest.test.mjs`.

**F1 / F2 / F3 — the rest of Empower (riders).**

- **F1:** store `oldTotal` in the `empowered` flag (`empower.mjs:255`). Render "(77 → 83)" at `:145-151` through the `note` string (`lang/en.json:157`), and make the changed chips stand out.
- **F2:** set `willTrigger3DRoll = false` through Dice So Nice's `diceSoNiceMessageProcessed` hook for the empowered card. Then call `game.dice3d.showForRoll` on a roll of only the new dice. Respect whispered and blind modes.
  - This adds a `game.dice3d` touch, so it needs a `recommends: dice-so-nice` entry (with a reason) in riders' `module.json` (C09). That is a `module.json` change, so it needs a restart.
  - It also needs an adjustments row.
- **F3:** a `dnd5e.preUseActivity` veto in `empower.mjs` for the Empowered Spell activity:
  - **Let the module's own spend through.** The button spends through `activity.use({ pentaryn: { empower: true } }, …)` (`:237`); blocking it would break Empower.
  - If the caster has a waiting card, run Empower on it. A waiting card is their own spell damage card from the last 10 minutes that is not superseded, empowered or applied.
  - Otherwise stop the use, show "Use the Empower button on your spell's damage card", and spend nothing.
  - Add it to the veto-order check in `pentaryn-riders/api.mjs:168-180`.
- Tests: extend `test/empower.test.mjs`. Include "the internal empower use still goes through".

**K — "left" on durations (riders, `expiry.mjs`).**

- Better hook point than a render hook: wrap `ActiveEffect5e#getDurationParts` (dnd5e.mjs ~7800). Both the sheet's `templates/shared/active-effects.hbs` and the effect tooltip (`richTooltip`) use it.
- Append "left" only when `expirySupportsDuration()` is true, `duration.remaining > 0`, and the duration is not a special start- or end-of-turn one. Core already says "… ago" once an effect has expired.
- No separate token or Argon tooltip work: none exists in module code.
- Needs an adjustments row (`dnd5e-…`). Tests: new `test/duration-left.test.mjs` and `i18n.test.mjs`.

**A — scene nav tab (pins).**

- Add a pure `pinnedNavTab(user, viewedSceneId, pinTokenScene)` in `pins-core.mjs` next to `activateDecision` (`:160`). It returns null for a GM, an unpinned player, a player already viewing the pinned scene, and a scene that already has a tab.
- Hook `renderSceneNavigation` from `follow.mjs` `install` (`:271`).
- The click reuses `target()` (`:68`), `followOptions()` (`:63`) and `onActivate`'s view logic (`:137-140`). It calls `scene.view()` directly, not `viewTo()`, which drops the view when a newer pull exists (`:110`). It lands on the token's level, selects the token and pans to it.
- The "Back to my character" macro exists only in the world (`zH6cda9MQRjlZ4og`), not the repo. It stays as a fallback.
- Needs an adjustments row (core `SceneNavigation` render). Tests: new `test/nav.test.mjs` and the `golden/hooks.json` regeneration; "uninstall leaves no hook" must still pass.

**M1 — `pentaryn-dice` (new, small tier).**

- **Generate:** `new_module.py dice --title "Pentaryn Dice" --tier small --kit settings --css-prefix pdi- --out /tmp/x --check`, then `--out foundry/module --install --docs`. `pd-` is already taken. Replace every bit of the generator's example code.
- **module.json:** `requires: dice-so-nice`, and `--no-dnd5e` unless it touches dnd5e.
- **On `renderDsnSidebarTab`** (`class DsnSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab)`):
  - a count box per die row ("+ ×8");
  - **Select all mine**, **Select all <type>** and **Clear selection**;
  - the "Ctrl+click to select" hint shown inline.
- **Spawn** through `game.dice3d.persistent.spawn(type)`, not `box.spawnPersistentDie`. Only the former broadcasts and saves.
- **Select** by adding ids to `persistentDiceManager.selectedPersistentDiceIds`, then calling `onSelectionChanged?.()` so the outlines draw. `togglePersistentSelection` respects link groups.
- **Shortcut:** Ctrl+A is core's `selectAll` (select all tokens, foundry.mjs 135407). Default to another key, or bind with priority and return false unless the user owns persistent dice.
- **Smoke check:** `selftest()`/`status()` and the adjustments row's `check:` assert that these exist:
  - `game.dice3d.persistent.spawn`;
  - `selectedPersistentDiceIds`;
  - `togglePersistentSelection`;
  - `clearPersistentSelection`;
  - `getSelectedPersistentDice`;
  - `countPersistentDiceByOwner`.
- **Wiring:**
  - a `"dice": ModuleSpec("pentaryn-dice", check=ALL_GATES)` in `scripts/foundry/ops/config.py`;
  - `conformance.py --module dice`;
  - a use-doc `context/foundry/dice.md`;
  - a skill stub `.claude/skills/dice/SKILL.md`, with a description in Joe's words: "select all my dice", "Dice So Nice persistent dice", "spawn 8d6";
  - a routing row and the `foundry/module/` bullet in `context/foundry/README.md` (not CLAUDE.md, whose length `check-context` caps);
  - the Modules list in `context/pentaryn.md`.
- **Update policy:** `review_always: [dice-so-nice]` (recommended), with a reason comment. A `hold` would freeze Dice So Nice for good. **Joe picks.**
- **First install** needs a Foundry restart and `core.moduleConfiguration["pentaryn-dice"] = true`.

**H — tunnel (config).**

Add a top-level key next to `tunnel:` in `foundry/cloudflared/config.yml`:

```yaml
# QUIC precheck fails on BOSS (WSL2 NAT'd UDP), seen daily since 2026-11-02; brief synchronized client drops. Delete to go back to quic.
protocol: http2
```

- It takes effect on the next tunnel restart: the 03:00 nightly, or `make tunnel-down && make tunnel-up` outside a session (players drop for a few seconds).
- Verify that `make tunnel-logs` shows `protocol=http2`.
- Docs: add http2 to the Tunnel row of `context/foundry/ops.md` §1 (~line 90), plus one undated gotcha (QUIC vs WSL2, how to revert).

### H3. Pre-run and non-code tasks

| Task | Who | Needs Joe |
|---|---|---|
| **C:** `game.settings.set("dnd5e","bloodied","all")` through `eval-js`, read back. One catch (rules review): a damaged *dormant statue* would show the marker and give itself away. Check `pentaryn-creatures` dormant and hide status icons there if needed. | before the run | yes: a one-line OK (recommended) |
| Note `bloodied=all`, `attackRollVisibility=hideAC` (2026-11-20) in `context/pentaryn.md` | integration | no |
| **L:** tell the GM about Scene Configuration → Grid → Grid Scale and Units | Joe | yes |
| Add this plan to `context/plans/README.md` and commit it | before the run | no |
| Next session: count `lost connection` in report errors to judge H | Claude | no |

### H4. Decisions only Joe can make

1. **B2 per-spell walls** (from the 2024 text; the plan's earlier list was wrong; Wall of Ice settled by Joe 2026-11-20):

   | Spell | Movement | Sight | Notes |
   |---|---|---|---|
   | Wall of Stone | blocks | blocks | |
   | Wall of Force | blocks | no | |
   | Wall of Ice | blocks | **no** | **Joe 2026-11-20:** the 2024 text is silent on opacity, so everyone sees it and sees through it (keep it simple). The wall is drawn visible to all. |
   | Wall of Fire | **no** | blocks | "opaque", but creatures walk through it and take damage |
   | Blade Barrier | no | no | ¾ cover plus difficult terrain: a region behavior, not walls |
   | Wind Wall | no | no | only small flyers and gases are stopped |

   Also to decide:
   - the default (on, or off until playtested);
   - Wall of Stone becoming permanent after full-duration concentration (keep the walls and ask the GM?).

   Build notes for later:
   - players cannot create Walls, so the GM's client creates them;
   - recreate them on `updateRegion`, because handles drag areas;
   - flag them `{regionId}`;
   - `walls.mjs` must ignore a spell's own walls when it clips that spell's region, and must still clip other areas on Wall of Force walls.
2. **G2 `showAppliedBy` default:** `owners` (recommended).
3. **M1 update policy:** `review_always` (recommended) or `hold` for dice-so-nice.
4. **C:** OK Bloodied for all creatures. With N built, this becomes N's Bloodied row set to Public.
5. **N defaults:** confirm the Public / GM-only table in cluster N, especially Concentrating on enemies (recommended GM only).

### H5. Report close-out (integration agent, after the browser pass)

| Status | Reports |
|---|---|
| `resolved` | `fpnsNR` (A), `jz6tqK` (C), `hKDbzi` (D2), `d3rePk` (E), `GDJJdi` (F0–F3), `SvOaxr` (G), `VDalcb` (K), `sREUaG` (L, explained), `Lzzlyq` (M1) |
| `resolved` after the next session's comparison | `kmuABM` (H) |
| `wontfix` | `BhfpXW`: not reproduced on 14.370; reopen if the `PrimarySpriteMesh._renderVoid` / `GridHighlight.clear` stack comes back |
| stays `triaged` | `8t6Nn1` (B2 pending; B1 and B3 ship), `xQ9tdh` (J, own plan) |

`ORGqVN` is already resolved. Tell the players what changed, because resolving a report does not notify them.

### H6. Final browser play test (after sync and restart; Joe's go)

Use the 2026-11-20 sandbox pattern: setup with `eval-js` on BOSS, clicks by the Mac session (home-pro), teardown with `eval-js`.

**First brief to the Mac:**
- Joe has already authorized this test and its writes to the live world. Start now and never ask him for a go-ahead.
- Send questions and blockers to the BOSS session by SendMessage and keep going.
- If a click is refused, report the refusal text.
- Copy console errors word for word.
- Finish with one SendMessage report.

**Setup:**
- scene copies with walls only: `ZZ 50` (from Island Village, 50 px grid) and `ZZ 150` (from Hags Den);
- actor copies: ZZ Talo, ZZ Marrith and ZZ Caven, plus 2 ZZ monsters;
- users created **with no `password` field**: `ZZ Talo`, `ZZ Marrith`, `ZZ GM`; pin ZZ Talo;
- a baseline: wall count per scene, the last message id, Marrith's Sorcery Points, module versions and `selftest()`.

**Steps:**

| Step | Unit | Check |
|---|---|---|
| P1 | A | As ZZ Talo, click "Pentaryn — Entry". There is a "⟵ ZZ Talo" tab, and clicking it lands back on ZZ 150 with the token selected. ZZ GM sees no such tab. |
| P2 | D2 | Attack until one hit and one miss. "— Hit" in blue, a blue Damage Roll title, "— Miss" in orange, and one rendered "Miss — no damage" line. |
| P3 | G | Target a monster, then use Stone's Endurance: "ZZ Talo +n" plus the Applied-by line. Burning Hands never lists the caster. |
| P4 | E | Clear the omen by `eval-js`. On the sheet and on Argon: "the die decides"; the notice names the roll. |
| P5 | F0–F3 | As ZZ Marrith, a save spell, then Empower. One set of saves (BOSS confirms no new save messages); Dice So Nice animates only the rerolled dice; "(old → new)" on the card. Empowered Spell from the sheet with nothing waiting is refused, and Sorcery Points are unchanged. |
| P6 | B1/B3 | On ZZ 50, Wall of Stone with 3 panels: visible, counter shown, Escape finishes. |
| P7 | K | The Effects tab reads "N rounds left"; so does the effect tooltip. |
| P9 | N | As ZZ GM, put Prone, Frightened, Concentrating and Mage Armor on a ZZ monster. As ZZ Talo, only the public ones show on its token and in the Look window. Make a ZZ monster dormant: no markers at all. |
| P8 | M1 | Dice So Nice tab: "+ ×8" d6, Select all mine, Clear, the shortcut. No accidental token selection. |

**Teardown:**
- delete the ZZ scenes, the actors and their folder, the users, ZZ walls, combats, and messages newer than the baseline;
- check the real PCs and the original maps' wall counts are untouched;
- **leave `attackRollVisibility` at `hideAC`** (Joe's decision);
- write "Sandbox removed" here.

---

## Run result (2026-11-21)

**The workflow finished** (`wf_d65f215c-37b`): 13 agents, no errors.

- **Ready branch:** `feedback/2026-11-21` (`4e294574`), 43 commits on `main` 14ca92d1, 138 files. Not merged, not synced.
- **Re-checked by the main session on that branch:** `make foundry-modules-check` (all 23 pass), `make check-context`, `make foundry-adjustments-check`, `make test` (2399 passed, 9 skipped, 4 xfailed).
- **Versions:** aoe 0.7.0, riders 0.8.0, pins 0.5.0, creatures 0.5.0, dice 0.1.0 (new). ties was not touched.
- **Reviews:** the aoe lane's review found 5 problems; they were fixed in the `-r2` branch (G2 "Applied by" for a player who did not roll the card; B3 async preConfirm). riders, pins, creatures and dice passed review. The final cross-lane review passed with 4 minor findings.

**Where the build differs from the spec (agents' calls, for Joe):**

| Unit | Change |
|---|---|
| G1 | Healing cards only. A Self-range *damage* activity (Armor of Agathys) hurts the attacker, so it is never stamped with the caster. The caster is stamped even when the roller had an enemy targeted (the T3 case). No off switch of its own: it rides on `applyFromCard`. |
| G2 | Monster rows are never shown to players in any `showAppliedBy` mode. |
| D2 | New setting `hitMissLabels`, default on. |
| F2 | Uses DSN's `diceSoNiceMessagePreProcess`. DSN 6.4.5 treats `diceSoNiceMessageProcessed` as observe-only. |
| F3 | A "waiting card" is one that would show the Empower button now. |
| K | The wrap lives in riders `patches.mjs` (riders convention), not `expiry.mjs`. |
| N | An effect with several statuses shows if any of them is Public (Hold Person's paralysis shows). |
| M1 | Shortcut **Alt+A**. Ctrl+A is core's select-all tokens, Shift+A is Argon's toggle, and A is move left. The api kit is vendored for `selftest`/`status`. `review_always: [dice-so-nice]`. |
| A | The hint reads "Back to {name}: the map your character is on" (no scene name). It was tested only against a stub of core's nav markup. |

**Minor follow-ups:**
- skill-routing eval cases for the new `dice` skill;
- one stale code comment naming `diceSoNiceMessageProcessed`;
- a `.venv` symlink can be committed by a careless `git add -A` in a worktree (the `.venv/` ignore pattern does not match a symlink; add `.venv` to `.gitignore`);
- `pentaryn-feedback` `test/reload.test.mjs` already fails on `main` under plain `node --test` with Node 24.22.3 (no `sessionStorage`). The make gate passes.

**Still to do, in order, on Joe's go:**
1. Merge `feedback/2026-11-21` to main.
2. `make foundry-{aoe,riders,pins,creatures,dice}-sync`.
3. Restart Foundry: module.json changed in riders, creatures and dice, and dice is a first install.
4. Enable `pentaryn-dice`.
5. Set `dnd5e.bloodied = "all"`.
6. Restart the tunnel (http2).
7. Run the §H6 browser play test (P1–P9).
8. Close the reports (§H5).

---

## Shipped (2026-11-21)

**Live:**
- **Merged to main** (`d6278497`). Synced aoe 0.7.0, riders 0.8.0, pins 0.5.0, creatures 0.5.0 and pentaryn-dice 0.1.0 (new, enabled).
- **Restarted** Foundry and the tunnel (`make vtt-down` / `vtt-up`). The world was relaunched through the admin API, because `vtt-up` came back on `/setup`.
- **Settings:** `dnd5e.bloodied = all`, `attackRollVisibility = hideAC`.
- **Tunnel:** on `http2`; `.run/cloudflared.log` shows "Initial protocol http2".

**Browser play test (§H6)** on the Mac (home-pro, real Chrome), with ZZ Talo, ZZ Marrith and ZZ GM: **P1–P9 all PASS**, no red console errors.

- P4's mismatch path was not hit on the Mac (the die matched the pick). BOSS covered it from a headless browser with the d6 forced to 2: "You picked Woe (Odd), but the stars rolled 2: Weal (even)."
- The sandbox was removed the same day: 2 scenes, 5 actors and their folder, 3 users, 29 test chat cards. The originals were checked: Hags Den still has 369 walls, and the PCs are unchanged.

**Side findings from the play test:**
- **Look window says "Kind: Statue" on Bog A.** Not a bug: the world's Bog Vessel actor is `kindOf` the "Statue" actor (`HC3pAqn47VeTe4TW`, folder "2. Swamp & Cottage"), and the copies inherited it.
- **Players could not switch sidebar tabs** (Mac session, ZZ Marrith). Not reproduced on BOSS in a fresh player session, nor right after a cast (`ui.sidebar.changeTab` and tab clicks both worked). Watch for it at the table.
- **Damage card after a hit:** only the subtitle ("Attack • Damage Roll") turns blue, not the item title. That matches Marrith's ask ("Damage Roll" in blue).
- **Wall of Stone panels block nothing**, as expected: B2 is not built.

**Reports:**
- 9 resolved: `fpnsNR`, `jz6tqK`, `hKDbzi`, `d3rePk`, `GDJJdi`, `SvOaxr`, `VDalcb`, `sREUaG`, `Lzzlyq`.
- `ORGqVN` was resolved on 2026-11-20.
- `BhfpXW` wontfix.
- 3 stay triaged:
  - `8t6Nn1`: B2 real walls, after Joe confirms the §H4 table;
  - `kmuABM`: resolve after the next session if no synchronized drops;
  - `xQ9tdh`: pathfinding, which needs its own plan.

**Bridge on BOSS:** the foundry MCP server needs `node` on Claude Code's PATH. `~/.local/bin/node` was linked to nvm's v24.22.3 on 2026-11-21. Re-point it if the updater moves Node.

---

## Edge-case rounds 2–3 (2026-11-21)

**Method:**
- **Round 2:** the Mac (home-pro, real Chrome) ran M1–M7 as ZZ Caven and ZZ GM. At the same time a BOSS headless harness ran H1–H3 with several users logged in at once (ZZ Talo, ZZ Marrith, ZZ GM2), driven over 127.0.0.1:31999. The headless GM stayed on as a second GM client.
- **Round 3:** the Mac re-tested each fix (R1–R7).
- **The sandbox was removed after each round.**

**Defects found and fixed (all live, all re-verified):**

| Defect | Fixed in | Cause |
|---|---|---|
| A slow GM reply on a relayed heal toasted "No GM is connected… did not take this" although the heal landed late, which invites a double heal | aoe 0.7.1 | TIMEOUT was treated like NO_GM. Now the player's client waits up to 15 s for the GM's `appliedLog` entry and stays quiet if it lands, else shows "Apply.Late". Unit-tested; live it was seen only as the bad toast. |
| A missed target stayed in the auto-damage tray of a multi-target attack | aoe 0.7.1 | dnd5e records the roller's targets on the damage card; now only the hit ones are passed. R2: hit/miss mixed, all miss and all hit all pass. |
| Wall-spell "Panel n of N" notice doubled | aoe 0.7.1 | Cause not found; made single-instance defensively. R5 and R7: once per panel. |
| Multi-panel wall regions had no handle (no drag, no delete) | aoe 0.7.1 | `areas.mjs` gave handles only to one-shape regions, a rule since Part A (2026-10-10). The handle now sits at the first panel's start. R5 and R7: drag moves the whole wall and its band (players too); deleting the handle deletes the wall. |
| Bloodied never drew on monsters for players | creatures 0.5.1 | dnd5e keeps Bloodied out of `CONFIG.statusEffects`, so it had no marker row and fell to "other effects" (GM only). |
| `dormant()` on a linked token threw a validation error but answered ok:true | creatures 0.5.1 | `disguiseUpdate` always wrote a token delta; a linked token has none. A refused update now answers `{ok:false}`. Live: arm, wake and re-arm all worked. |
| The Look window named a dormant statue's real creature ("ZZ Bog A — what you know") | ties 0.19.5 | The window used the actor's name. It now takes the clicked token and shows a dormant token's disguise (`lookFace`). Live: "Statue — what you know". |

**Passed with no change:**
- H1: Healing Word on an ally with two GM clients online applied exactly once; a second Apply added exactly one more log entry. H1b: the target's owner online made no double apply.
- M4: the marker settings screen. Its layout and defaults are right, Frightened → Public worked from a player's browser, and Cancel discards.
- M5: Bandit Captain Full Attack, two swings with correct Hit/Miss.
- M6(d) and R5: ending concentration removes the wall and its handle.
- Friendly tokens show every marker.

**Not bugs:**
- The round-2 Argon "You lack permission to use an item" error: a copied actor keeps Argon `weaponSets` pointing at the source actor's items. R1 passed after re-pointing them. It would affect only an actor duplicated in Foundry.
- "Kind: Statue": world data. The Bog Vessel actor is `kindOf` the "Statue" actor.
- No tooltips on token status icons: core draws none.

**Known, not fixed:**
- **First-login sidebar lock:** seen on the Mac twice (ZZ Marrith, ZZ Caven) and again in R4 (ZZ Fresh3). On a user's FIRST-EVER login the sidebar tabs never switch, because ApplicationV2's lock stays held: a sidebar render started at the first ready never finished, and `changeTab` queues behind it. A reload clears it for good. It happens together with Dice So Nice's first-time welcome card. Not reproduced in a headless browser on BOSS, including a pinned player's first login. Workaround: a new player reloads once.
- **No-target attack, natural 20:** damage auto-rolls, and dnd5e's tray falls back to the viewer's selected token (the attacker, or any viewer's own token). Fix later in aoe: don't auto-roll with no target, or stamp no fallback.
- **Deleting a wall's handle or region leaves "Concentrating: Wall of Stone"**, which matches dnd5e for templates. A dormant statue can't be targeted with the T key (`interactive: false`), by design.
- **Multiattack "in any combination"** (Bandit Captain: Scimitar or Pistol): the Full Attack swing bar can't switch a swing's weapon. A pentaryn-combat gap from before this work.

**Live versions after these rounds:** aoe 0.7.1, creatures 0.5.1, ties 0.19.5 (riders 0.8.0, pins 0.5.0, dice 0.1.0 unchanged).
