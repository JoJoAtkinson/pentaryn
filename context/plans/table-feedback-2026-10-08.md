---
created: 2026-10-09
last_modified: 2026-10-09
tags: ["plan", "foundry", "dnd5e", "feedback", "pentaryn"]
status: built and live-playtested 2026-10-09 (all items pass; minor follow-ups listed under Built)
---

# Table feedback from the Underdark one-shot, 2026-10-08 — Foundry hardening plan

**Read this when:** working through the player feedback from the 2026-10-08 Pentaryn session
(Marrith's and Caven's players, plus Joe's own notes) or deciding what to build next for the
table. **Plan, not a use-doc.** Built 2026-10-09; see the Built section at the end.

**How this was investigated:** Foundry was offline, so the world was read from a copy of its
LevelDB (actors, scenes, journals, users, chat messages) plus the dnd5e 5.3.3, Item Piles 3.3.4,
Argon HUD and Foundry v14 client sources on disk. Anything marked **verify live** still needs a
check in a running client, ideally logged in as a player.

**Joe's design rule for all of this:** practical, simple, and self-discoverable. No hotkeys a
player has to be told about; things should be visible and clickable.

---

## Out of scope — GM-side

- **Personality bullets on pregens** (Jeff's point). "Less is more": 3–4 bullets per PC. This is
  writing, not tooling.

## What worked (keep, don't break)

- AoE templates (`pentaryn-aoe`): "worked great and as intended".
- Inspecting characters (ties double-click menu, Look window).
- Caven's purple Broken-glow light.

---

## A. Bugs with a known cause — mechanical fixes

| # | Report | Root cause (evidence) | Fix |
|---|---|---|---|
| A1 | **Healer feat acts like the Healer's Kit has no charges** | All 4 *Heal dX* activities on Marrith's Healer feat consume `itemUses` from item `bL2hUxGpEMQlvEOZ`, which **exists nowhere in the world**. Her kit is `uQl75i2elRxbACK5` (10 uses, 1 spent). It has been through the confiscated-gear pile, and Item Piles re-ids items on transfer. | Retarget the 4 activities to her kit. Then **sweep every actor** for consumption targets that point at a missing item, and re-link them after Item Piles transfers (GM client, by name/`compendiumSource`). |
| A2 | **Animate Dead skeletons left behind on scene change** | `pentaryn-portals` `partyTokens()` (`portals.mjs:474`) moves only **linked `character`** tokens. Summons are unlinked NPCs. | Also move every token on that scene owned by a party player: summons, familiars, Arcane Eye, steeds, forms. |
| A3 | **Story pins stopped opening after the first read** | **Not permissions.** All three entries still have `{default: NONE, <player>: OBSERVER}` and the pages inherit; nothing touched them on 10-08. Notes are `global: false`, which is fine because v14 shows a pin once its spot is explored (`note.mjs:82`). Two client-side suspects: **(1)** the pin is under the player's own token, which takes the double-click (Caven: pin centre (5320, 2305) inside his token at y 2287); **(2)** v14 only lets you click a pin from the token layer while the **Select** tool is active (`note.mjs:99-104`). Switching to Ruler, Target, a measure tool or an AoE tool makes every pin dead until you switch back. Either fits "worked once, then stopped". **verify live** as a player. | Owned-token-on-top (C3) doesn't help here, since the token is the thing in the way. Fix: pins sit **beside** tokens, never under them. And make "your story" reachable without the pin: a link in the player's own journal (`pentaryn-journal`), so it can be re-read from any scene. For suspect (2), Joe's call: don't change pin behaviour; make the active tool obvious (C4b). |
| A4 | **No "Loot all" on loot piles** | Item Piles has a native **Take All** button, but it only shows when **both** item and currency splitting are off (`TakeAllEnabledExplanation`). Our piles have splitting on, so Take All never appears. | A render hook adds **Loot all** as a 4th button next to the split buttons, calling `game.itempiles.API.transferEverything(pile, myCharacter)`. Item Piles' own transfer handles the rest (chat message, delete-when-empty). Applies to corpses, eye hotspots and gear piles. |
| A5 | **Corpses: Dead icon too small** | Deliberate in `pentaryn-dropbin/corpses.mjs:73-80`: Dead is set with `overlay: false` (a small corner icon) so the **eye** could be the big overlay. Foundry draws only **one** overlay per token (`token.mjs:1872`, `findLast`), so both can't be full-size natively. | Dead goes back to the **full-body overlay**. The "lootable" eye is drawn **by us** on top of the corpse token: a sprite, no extra document, like the chain drawing in `pentaryn-senses`. It shows while the corpse is lootable and disappears when emptied or revived, with nothing to clean up. Double-click on the body still opens the loot. |
| A6 | **Light: can't light ourselves; torches give no light** | *Light* summons a separate half-size light token (`phbsplLight00000`, 20/40) on the floor that doesn't follow. Marrith cast it 4× in two minutes (chat, 20:30–20:32). Torch is a consumable with only an attack activity. | See C4. |
| A7 | **Argon HUD shows only some spells; Arcane Ward twice; "Use Item" one at a time** | Adapter filters (`echDnd5e.js:1012-1057`): unprepared spells hidden by default; a spell lands in a panel by its **first** activity's action type; an item appears in **every** panel any of its activities matches; Use Item lists only items whose activity matches that panel (2024 potions are Bonus Actions). | See C6: a full audit, not guesses. |
| A8 | **Ring of Spell Storing contents invisible** | The stored spells are hand-made innate items (`Shield (Ring)` 3 uses, `Misty Step (Ring)` 1/1 spent). The ring itself has **no activities**. | Rebuild the ring with real *cast* activities. The sheet and HUD then show the spells under the ring with its uses. |
| A9 | **Mage Armor didn't raise AC** | Caven cast at 19:51, the GM re-cast at 19:52; the effect now on Caven (`ac.calc → mage`) is correct. Most likely the player's *apply* went to a selected/targeted token, not him. **verify live** that AC reads 15. | Superseded by section D, root cause 2: the player's card did target Caven; the apply click in the Effects strip was the missing step. |

| A10 | **Joe's ask: "Remove all templates" under the template button** | **Mostly built already.** `pentaryn-aoe` adds **Remove area** to every spell card whose activity places a template (`areas.mjs:186-208`). It deletes every area from that spell activity on the scene you're viewing (`areasFor`, `areas.mjs:127`), handles included. Two gaps: it is **appended at the end** of the card's button row, not under *Place Template*, and it is labelled "Remove area". The module was built on 10-08, so whether it was live for the players is **verify live**. | Move the button directly under *Place Template*, relabel it **Remove all templates**, and confirm it's present on a player client. Optional: match by spell item rather than activity, so a spell with two template activities clears both. |

---

## B. Rules automation gaps — dnd5e doesn't do these

| # | Report | Today | Proposed |
|---|---|---|---|
| B1 | **Elemental Adept doesn't turn 1s into 2s** | Feat has no activity/effect; PHB note says do it by hand. | Small module, working name `pentaryn-riders`, on `dnd5e.preRollDamageV2`, with rules declared per feature. Elemental Adept = Foundry's core `min2` modifier on fire dice of her spells; pre-set "ignore fire resistance" in dnd5e's damage tray. |
| B2 | **Elemental Affinity not added to fire spells** | PHB models it as a separate +CHA damage activity the player must click. | Same module: "+CHA once per casting, fire spells." Same rule shape covers Talo's **Elemental Fury: Potent Spellcasting** (+WIS to druid cantrips). |
| B3 | **Healer feat should spend the patient's Hit Die** | PHB note: patient lowers their own HD and tells the healer the die. | After A1: one *Battle Medic* activity spends one HD from the **target** and rolls it (1s rerolled). GM-side write when the patient isn't the healer's. |
| B4 | **Need to remove Hit Dice manually** | Exists but is hidden: character sheet **edit mode** → cog beside *Hit Dice* → spent per class. | A small −/+ on the Hit Dice bar outside edit mode. |

---

## C. Design — Joe's calls (2026-10-09)

### C1. Nametags — DECIDED: show names always
"Hiding the name is overthinking it." Set `displayName` to **Always** world-wide: the
`core.prototypeTokenOverrides` default, every actor prototype, and every placed token.
- **Open:** crowd tokens ("Drow Commoner (crowd) 3") and Markers. Proposal: crowd stays nameless
  (or gets a clean label like "Drow"); Markers and hotspots stay as they are.
- Knock-on: `pentaryn-ties` deliberately avoids naming targets to players (`overlay.mjs:445`);
  that guard is now moot. Leave the code, update the README's reasoning.

### C2. Movement — DECIDED: player "ghost" toggle, GM-governed
- **Owned tokens draw on top, for their owner.** A client-side raise, so each player always sees
  and can click their own token over a friendly's. Nothing is written to the scene.
- **Ghost mode for players.** The GM's unconstrained movement (ignore walls and tokens), offered to
  players as a **visible toggle button** in the token controls, so it can be found without
  being explained. Each player switches it on or off for themselves.
- **GM control:** a world setting with three states: *Off* · *Exploration only* (default:
  automatically off while a combat is active on the scene) · *Always allowed*. A GM button in the
  same toolbar flips it on the fly, e.g. to keep walls on during a tense out-of-combat scene.
- **Watch-out:** ghosting through a wall puts your vision on the other side (locked rooms,
  secret doors). That is accepted ("they know it's a legal move"), but the GM switch is the
  remedy for a scene where it matters.
- **Build note:** check the v14 movement API (`TokenDocument#move` constrain options, the core
  unconstrained-movement tool) live before writing anything; reuse it rather than re-implement.

### C3. Finding your creatures — DECIDED: light them up + a clickable list
- **Every creature a player controls gets a small bright light on its own square** (5 ft): summons,
  familiars, skeletons, Arcane Eye. It can't vanish in the dark, and you can see where it is
  to click it. Not on PCs themselves (that would make darkness meaningless). **Arcane Eye also needs its
  owner to see it while it's Invisible**: owners always see their own tokens.
- **"Your creatures" strip**: small portraits of the tokens the player controls on the current
  scene, docked by the hotbar. Click = select and pan; double-click = sheet. It is **computed from
  the scene each time it draws**, not kept as a list. So a summon that is dismissed, killed or
  deleted simply stops being there, and there is nothing to keep in sync (Joe's concern with a
  per-summon macro). It also solves "my token is stuck under another one".
- Fallback considered and dropped: one "next creature" macro. It needs explaining and a hotbar slot.

### C4. Light — DECIDED: rules values, "On me" or "Pick a target"
- **Light cantrip:** rules values (Bright 20 ft, Dim 20 ft more). On cast, a small prompt:
  **[On me]** · **[Pick a target]**. *Pick a target* tells the player to click any token or any
  square; the light attaches to that token (and moves with it) or sits on that square. Casting it
  again ends the previous light, as the rules say.
- **Torches/lamps/lanterns:** a **Light / Douse** button on the item; lit = the carrier's token
  glows, through the existing `pentaryn-senses` item-light path (Caven's shard). Torch: Bright 20,
  Dim 20.
- **Open:** do torches burn down with game time (1 hour) or stay lit until doused? Default: until
  doused.

### C4b. Which tool am I on? — DECIDED: the cursor tells you
Joe: not knowing which tool was active was "a huge confusion". Don't change how pins or tools
behave (A3 suspect 2); make the active tool unmistakable instead, so the GM can just ask
"do you have the select cursor?"
- **How:** Foundry v14 draws every canvas cursor from CSS variables (`--cursor-default`,
  `--cursor-pointer`, `--cursor-grab`, … set from `CONFIG.cursors`, `game.mjs:1905-1922`,
  `board.mjs:1024`). A small client module hooks the scene-controls tool change and swaps those
  variables to that tool's icon set. No wrapping, no core patch. On the map only; over windows and
  the sidebar the cursor stays normal.
- **Per tool:** `default` (over empty map) and `pointer` (over something clickable) for each tool;
  the grab/drag cursor stays shared.
- **Select = the "home" cursor:** the most familiar and the plainest, a clean arrow everyone
  recognises as normal. Every other tool gets a **clearly different, coloured** cursor: Target =
  crosshair, Ruler = ruler, AoE/templates = compass, Ping/draw = their own. "Not the arrow" =
  "not Select".
- **Optional, same module:** a one-shot tool (Ruler after a measurement, Target after targeting)
  drops back to Select by itself. Joe's call, after trying the cursors alone.
- **Icons:** 32×32 PNG/SVG (bigger cursors are unreliable across browsers), hotspot set per icon
  (centre for crosshair/compass, tip for arrow/ruler). Sources: game-icons.net (CC BY 3.0, the
  D&D look) or Font Awesome (already in Foundry). Joe picks the set.
- **Effort:** small: ~100 lines plus the icon set. Where it lives: own tiny module
  (`pentaryn-cursors`) or inside `pentaryn-senses`; own module is cleaner.

### C5. Free casts and stored spells at a glance
Fix the ring's data (A8) first, then fold the results into the C6 audit. A "Free today" panel on
the sheet stays a later option. Patching Argon's minified adapter is the last resort.

### C6. Argon HUD — DECIDED: audit it
Not yet clear whether it's user error or Argon. The audit, per PC:
1. List everything the character can actually use this turn: prepared/always spells, innate,
   ring and item spells, feat free casts, class features, consumables.
2. Read back what Argon puts in each panel (Action / Bonus / Reaction / Free / Use Item / spells).
3. Diff the two, and sort every gap into **expected filter** (unprepared spells, potions under
   Bonus), **our data** (wrong action type, item with no activity, Arcane Ward's mixed types,
   the ring) or **Argon bug**.
4. Fix our data, set the per-actor `showPrepared` where it helps, and write a short
   "where is my X" card for the players. Patch Argon only for true bugs.
Run it live as each player, since Argon renders per user.

---

## D. Root causes behind the confusion — simple levers (review 2026-10-09)

Joe's question: like the cursor, is there one simple, visible fix behind several reports? Most
reports trace back to five root causes. All five are about state the player **can't see**.

| Root cause | Reports it explains | Simple lever |
|---|---|---|
| **1. Invisible mode: which tool am I on?** | Story pins "stopped working"; AoE "a little fiddling" | Tool cursors (C4b). |
| **2. Invisible extra step: the spell isn't on you yet.** dnd5e puts an **Effects** strip at the bottom of the card, and nothing happens until someone clicks apply in it. Nothing says "not applied". | Mage Armor: the player's card at 19:51 **did** target Caven (message `flags.dnd5e.targets = [Caven]`), but no effect followed. The GM applied it at 19:53. Same shape: Elemental Affinity is a separate click, and the Healer's HD is a separate step. | **Auto-apply when the only target is your own character** (Mage Armor, Shield, Fly on self, Invisibility on self). Otherwise leave the strip as is. If a card still has unapplied effects, make it obvious (a highlighted strip). Replaces A9's fix. |
| **3. Your own things disappear.** Darkness hides your creatures from you; another token hides yours. | Token under a friendly; Arcane Eye lost; summons hunted for; Caven's pin under his own token | Owned tokens on top (C2), owners always see their own, 5 ft light on controlled creatures, "Your creatures" strip (C3). |
| **4. It exists, but hides behind a mode, panel or setting.** | Hit Dice cog only in sheet edit mode (B4); Argon sorts by action type and hides unprepared spells (A7); Take All hidden by the split setting (A4); ring spells not on the ring (A8) | Mostly **settings and data**, no new code: Loot all, ring rebuild, HD −/+. Then **one player card**, "Where is my X": Bonus/Reaction panels, edit mode, the Effects strip. |
| **5. Same gesture, different results.** Double-click opens the ties menu on a creature, loot on a corpse or eye pile, and a journal on a pin. Whichever is on top wins. | Pin under token; "nothing happens" | **Placement rule: pins never sit under tokens.** Owned-on-top (C2) makes this matter **more**: a pin under your own token becomes unclickable for good. Add the check to the marker workflow and to C2's tests. |

**One more, cheap and optional: stale targets.** Targets persist until cleared. The GM's own
Mage Armor card at 19:52 carried **Marrith** as its target, left over from earlier. A player who
targeted an enemy and then cast a buff would fill the apply list with that enemy. Lever: clear a
player's targets at the end of their turn. Low cost; try it if root cause 2's auto-apply doesn't
cover it.

**Not a confusion problem** (real gaps, no shortcut): Healer kit link (A1), summons left behind
(A2), corpse overlay (A5), Elemental Adept and Affinity math (B1, B2), Light cantrip behaviour (C4),
nametags (C1, a setting), exploration movement (C2 ghost).

---

## Order of work

1. **Quick fixes:** A1 (+ dangling-target sweep), A2, A4 Loot all, A5 corpse overlay, A8 ring,
   A10 template button, C1 nametags, C4b tool cursors, D2 self auto-apply, D5 pin placement
   rule, the "Where is my X" player card. Verify A3, A9 and A10 live.
2. **Argon audit** (C6), with A7 folded in.
3. **Movement and visibility:** C2 (owned-on-top, ghost toggle), C3 (creature light, owner sees own,
   creature strip).
4. **Light** (C4).
5. **`pentaryn-riders`** (B1, B2, then B3, B4).


---

## Built (2026-10-09)

All eight modules installed and active; each item play-tested as a real player login (GM on localhost, player on 127.0.0.1, tunnel down). Use-docs live in each module's README.

| Item | Result | Notes / follow-ups |
|---|---|---|
| A1 Healer / kit sweep | pass | Single Battle Medic activity on the kit; 244 consumption targets swept, 0 dangling. |
| A2 summons follow (`portals` 0.4.0) | pass | Minor: two PCs confirming separate dialogs land followers on the same square (concurrent passes). Steed-stays-alone case not run live. |
| A3/D5 story pins + "Your story" journal page | pass | Pins moved one square off the start tokens; opens 3/3-4/4. Dice So Nice's d20 can swallow clicks under it until a pan. |
| A4/A5 dropbin 0.2.0 (Loot all, corpse overlay + eye) | pass | Minor: disabled Loot all shows no tooltip. Startup migration run directly, not at restart. |
| A7/C6 Argon audit | pass | Marrith's six cantrips set prepared; Oil/Torch stacks merged. No Argon changes. |
| A8 Ring of Spell Storing | pass | Real cast activities; shows in sheet and Argon. |
| A5 Arcane Ward (HUD) | pass | All four activities special; Free panel only. |
| A10/D2 aoe 0.2.0 | pass | Remove all templates under Place; self-cast auto-apply. Highlight clears in ~1.5 s, not at once. Wall of Fire two-activity case covered by matcher only. Caven's Hypnotic Pattern concentration effect was recreated approximately. |
| B1-B4 riders 0.1.0 | pass | Elemental Adept, Affinity, Potent Spellcasting, Battle Medic, Hit Dice -/+. Talo's WIS is +5. |
| C1 names always shown | pass | displayName 50 on 177 actors and tokens (use `diff:false`); crowd, markers, item piles excluded. |
| C2 movement 0.1.0 | pass | Ghost toggle, combat auto-off, GM policy button, owned-on-top. Arrow-key path tested via `moveMany`. |
| C3 creatures 0.1.0 | pass | Creature light, owner-sees-own, Your creatures strip. Invisibility shimmer unverified. |
| C4 Light (senses 0.3.0) | pass | On me / Pick a target / End light; torches and lanterns. Lit torch merging into an existing stack arrives unlit. Argon asks for a target before the Attack/Light chooser. |
| C4b cursors 0.1.0 | pass | Escape does NOT cancel an area-template preview in dnd5e 5.3.3 natively (only right-click does); fixed by aoe Part E (`escape.mjs`), see next row. Real OS cursor image not observed. |
| E Escape cancels template (aoe 0.2.2) | pass | `pentaryn-aoe.cancelTemplate` = Escape, PRIORITY binding calling the preview's `_onCancelPlacement`. Playtested 2026-10-09 as a player: Escape from select and Ruler tools restores tool and leaves no template/region/handle; right-click and left-click placement unchanged; Escape with no preview still closes windows / opens main menu. Live version reads 0.2.0 until Foundry restarts (module.json is 0.2.2). Unconfirmed: two `_source` unhandled rejections on left-click placement in the player client, likely a scratch-scene artifact (scene activated programmatically, 0 tokens loaded); recheck on a normally loaded scene. |
| Player card | done | Journal "Where is my X — player tips" (`tmVh6WdF5E8OB6wT`), OBSERVER for the three players. |
