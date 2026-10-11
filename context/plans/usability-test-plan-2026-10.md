---
title: "Usability test plan — players at the table, October 2026"
created: 2026-10-10
last_modified: 2026-10-10
status: planned — runs with the dynamic workflow (Fable designs, Opus builds/reviews, Sonnet runs the cases)
tags: [plan, foundry, dnd5e, argon, usability, playtest, melee, spells, attributes, prompt-markers]
---

# Usability test plan — October 2026

**Read this when:** running or extending the player-usability pass over everything built in the
pentaryn world so far (Argon HUD flows, melee streamlining, spellcasting for the three PCs, Wild
Shape, attributes, loot, movement, prompt markers). **History, not instructions** once run — the
results and the adjustments ledger go to `usability-test-results-2026-10.md` beside this file.
**Not this file:** the melee design itself → [`melee-streamlining.md`](melee-streamlining.md) ·
how a module works → its README under `foundry/module/pentaryn-*/`.

> Live target: Foundry 14.369, world `pentaryn`, dnd5e 6.0.6 (2024 rules), Argon 5.0.1 + dnd5e
> adapter 5.2.2. The question every case asks is Joe's: **is this smooth for a player?** Few
> clicks, nothing to be told, nothing confusing, and never a flow that forces the HUD on someone who
> wants to roll their own dice or take one swing at a time. State bugs found on the way get fixed,
> but they are not what we are hunting.

---

## 0. How to read and score a case

Every case has the same shape:

- **Actor** — who clicks (a player on a `zz<n>.localhost:30000` tab, or Joe on the GM tab).
- **Goal** — one sentence, in the player's words.
- **Steps** — the exact path through HUD / sheet / chat / canvas. A step in `[brackets]` is a
  decision the player must know to make; those are what we count as "knowledge the HUD does not
  give" and each one is a confusion risk.
- **Click budget** — the number of clicks or key presses that count as *smooth*. One click = one
  mouse click, key press, or dialog confirm. Targeting a token is 1. A dialog is 1 if its default
  is right. Hover is free. Moving a token is 1 per drag.
- **Flexibility** — three checks, scored separately: **own dice** (with `core.diceConfiguration`
  on Manual for the dice involved, the RollResolver appears for every die, in order, and nothing is
  skipped or double-asked), **one at a time** (the same result reachable by single native clicks,
  with nothing new forced in), **undo** (a wrong click is recoverable without the GM: Esc, cancel,
  retarget, or a visible "that didn't count").
- **Confusion risks** — what to watch the player do. Observed hesitation, a wrong click, or a
  "what now?" is logged even when the case passes.
- **Pass** — the criteria. A case passes only when the numbers match the PHB *and* the click
  budget held *and* all three flexibility checks pass. Anything else is a **note**, not a fail,
  unless the player could not finish.

**Scoring row per case** (written to the results file): `id · clicks (budget) · knowledge steps ·
confusion 0–2 · own-dice ✓/✗ · one-at-a-time ✓/✗ · undo ✓/✗ · correct ✓/✗ · verdict · note`.

**Streamlining notes and the adjustments ledger.** Joe wants to be able to revert or re-apply any
change. Every change made during the run — a world setting, a module edit, an actor data fix — is
one row in the ledger (`what · where (setting key / file / actor id) · why (case id) · how to
revert · retested in`). Opportunities that were *not* taken are listed under *Streamlining
candidates* with the case that surfaced them, so Joe can pick.

**Click = measured, not estimated.** Sonnet drives the real HUD (DOM-dispatched clicks on the tab
run the real handlers; see `pentaryn.md` 2026-10-07) and counts them; the GM tab watches chat.

---

## 1. Ground rules for the whole run

1. **One GM client** (`localhost:30000/game`). Player tabs on `zz<n>.localhost:30000` (one name per
   player tab, so each has its own cookie jar), closed when the area ends. Open them with
   `make login USER_NAME=<user> LOGIN_HOST=zz<n>.localhost NO_OPEN=1` and open the printed URL in
   that tab. **Never type a user password into `/join`** (the permission classifier refuses it, and
   Area 7's whole player half was lost to that; U-7-2). The GM bridge tab is never closed. Tunnel down; updater paused.
2. **No commits, no branch switches.** Edits to `foundry/module/pentaryn-*` go through
   `make foundry-<module>-check` / `-sync` and a Foundry restart when `module.json` changed.
3. **Real PCs are read-only** except where a case says otherwise, and then: snapshot first, diff
   after, restore. Marrith's HP is **69/98** at the start of the run and may be campaign state —
   it stays 69 unless Joe says otherwise. A pre-run snapshot of all three PCs (HP, temp HP, slots,
   item uses, sorcery points, Hit Dice, effects, concentration, flags under `pentaryn-*`) is written
   to the scratchpad as JSON and diffed in case Z.
4. **Scratch everything else:** scratch scene `ZZ Arena` (a blank 30×30, global light on, no
   walls, so no Levels or darkness surprises), scratch combat on it, actors in Actor folder
   `ZZ usability`, a temp user `ZZ Tester`. Drow Prison stays the active scene and paused combat at
   the end; during an area the viewed scene may be `ZZ Arena` but the *active* scene goes back.
5. **Argon only self-enables at round 1 turn 0.** Every HUD case starts by confirming the HUD is
   up on the tab in question (token-controls toggle or `ui.ARGON.toggle(true)` on a late joiner).
   Argon "always on" stays off (Joe's setting); if a case needs the HUD out of combat it says so.
6. **Settings touched for a case are restored** the moment it ends: `core.diceConfiguration` → `{}`,
   `dnd5e.attackRollVisibility` back to `"none"`, pentaryn-journal "Show the Add button to the GM"
   off, Argon "always on" off, pentaryn-combat settings back to default.
7. **Rules come from the owned 2024 PHB** (`context/foundry/rules-lookup.md`), never the SRD API.
8. **Studies spend the real one-shot lock.** Any ties case on a real PC records the before state
   and resets with `S.resetIdent` / the reset calls in `attributes.md` afterwards.
9. **Fix-or-note rule.** A real bug that blocks a player (crash, wrong number, can't finish) is
   fixed in place, with a ledger row. Friction that is a design choice is a note. Anything in
   vendor code (Argon, dnd5e, Item Piles) is a note with the workaround we would add from our side.
10. **Preflight before every area (added after the first Area 1 run, U-1-1).** The first workflow
    run started areas concurrently on one world; Area 1 found 5 started combats, `ZZ usability
    druid` active and its own actors in four combats, and could measure nothing. Before an area
    touches anything it runs this read-only check (`eval-js`) with its own actor names and tester
    user, and **stops (result `blocked`, nothing created) unless `ok` is true**:

    ```js
    const want = ["ZZ Fighter 5", "ZZ Rogue 5", "ZZ Paladin 5"]; const tester = "Talo";
    const problems = [];
    const active = game.scenes.active;
    if (active?.name !== "Drow Prison") problems.push(`active scene is "${active?.name}", not Drow Prison — another run is mid-area`);
    for (const c of game.combats) {
      const hit = c.combatants.filter(cb => want.includes(cb.actor?.name ?? cb.name)).map(cb => cb.name);
      if (hit.length) problems.push(`combat ${c.id} on "${c.scene?.name}" (round ${c.round}${c.started ? ", started" : ""}) already holds ${hit.join(", ")}`);
    }
    if (game.users.getName(tester)?.active) problems.push(`user ${tester} is already logged in — a second login knocks that session off`);
    return { ok: !problems.length, combats: game.combats.size, problems };
    ```

    Areas 4–6 (a real PC each) swap `want` for that PC's name. The player tab is opened with
    `make login USER_NAME=<tester> LOGIN_HOST=zz<n>.localhost NO_OPEN=1` (U-1-2, U-7-2), never a
    one-off script and never a typed password.
    Area 1's *baseline* run (T1–T3) must come before any other melee area has run on the shared
    actors; if that order is lost, say so in the report rather than measuring on top of another run.
11. **Fixture and GM-side habits (added after the Area 1 re-run, U-1-11).** The tester user has an
    assigned character (`ZZ Tester` → ZZ Fighter 5), as every real player does: without one, core
    opens the User Configuration dialog at login and selects *every* owned token on each scene load,
    so the first drag moves the whole group and the HUD sticks to one token. Before an area, give
    its spellcasters full slots (the Paladin was found at 0). To unpause for the players, use
    `game.togglePause(false, {broadcast: true})`: without `broadcast` only the GM tab unpauses and
    the players keep the Paused banner (v14; the old `true` second argument still works with a
    deprecation warning). To take a temporary owner off an actor, use the `remove-actor-ownership`
    tool, or write the whole map: `const o = {...a.ownership}; delete o[id]; await a.update({ownership: o},
    {diff: false, recursive: false})`. v14 rejects every partial form on `ownership`
    (`ownership.-=<id>`, `_del`, `null`) with "ownership: is not a mapping" (U-7-2's notes).

---

## 2. Test characters (`ZZ usability` folder, deleted in case Z)

**Specs only until the build stage runs.** Nothing below exists yet (verified 2026-10-10: no `ZZ*`
actors, no `ZZ*` folders).

### Creation method

1. **Preferred: the prompt-markers `character` helper** (`context/foundry/prompt-markers.md`
   "`character`"). It runs dnd5e's own advancements headlessly (species, background, class levels,
   subclass, fixed-average HP, mastery, fighting style, ASI/feat) and dry-runs on an unsaved actor,
   so the `sheet:` readback is checked before anything is written. Needs one hidden `Prompt · mid`
   marker per character on `ZZ Arena`; place with the token tool, `gather`, `replace dryRun:true`,
   fix every `DEFAULTED`/`WARN`, then the real `replace`. Over 5 replacements the tool demands the
   identical dry run first. Fallback if the tool is missing: the `eval-js` table in that doc
   (`game.pentaryn.prompts.replaceMany`).
2. **Fallback:** `create-actor-from-compendium` + `dnd5e-add-features-from-compendium`
   (packs `dnd-players-handbook.classes|feats|equipment`).
3. After the helper: move each actor into Actor folder `ZZ usability`, set ownership, equip gear,
   apply the listed hand patches. The helper assigns no owner and tokens are linked, friendly, `pc` ring.
4. Standard array before the background (+2/+1): main stat ends 16 (`array` 15 + 1, or 14 + 2 as
   listed), `abilityMethod: "array"`. Backgrounds' allowed abilities differ; the dry run rejects a
   bad pick, so adjust to the nearest legal split and keep the main stat at 16 at level 5 (+3 mod,
   PB +3 = +6 to hit; the plan's earlier "+5" was wrong for a 16 at L5: 3 + 3 = +6; L11: PB 4 = +7).
5. **Clones** (Fighter 5 TWF, Fighter 20): `manage-actors` duplicate (or `Actor.create(actor.toObject())`)
   then the edit stated; rename; same folder and ownership.

### Owner (decision: reuse, create no accounts)

Do **not** create `ZZ Tester`. Reuse the existing user **Talo** (`OiDkYUo0NsT5Mc5X`, role TRUSTED,
password `talo`, `character` = Talo). Add `OWNER` for that user on every ZZ actor via
`assign-actor-ownership`. Original state to restore in case Z: Talo user owns only Talo and the
`Talo — summons & forms` folder actors; `character` stays Talo (never changed); ZZ ownership is added
to ZZ actors only, and they are deleted, so nothing on a real actor changes. Record the user's
`character` id and Talo's ownership map in the pre-run snapshot to diff. `pentaryn-journal` makes no
new journal (no new user). Player tab: `zz<n>.localhost:30000`, user Talo; to act as a ZZ character,
select its token (Argon follows the controlled token). Never touch Talo's own token on `ZZ Arena`
except in Area 4. Fallback if Talo is in use in Area 4 at the same time: areas never overlap, so
none. (Superseded text elsewhere in this plan that says `ZZ Tester` means this user; if Joe prefers a
throwaway account, create `ZZ Tester` TRUSTED/`zz` and delete it plus `Player Journals/ZZ Tester's
Journal` in Z.)

**Logging in (U-8-6).** `ZZ Tester` already exists (an earlier run made it; case Z deletes it), and
the areas run as that user. Its password does not matter and is never read, typed or reset:
`make login USER_NAME="ZZ Tester" LOGIN_HOST=zz<n>.localhost NO_OPEN=1` signs in through the admin
session with no user password (§1 rule 1). The `talo`/`zz` values above are history, not login
instructions; the Area 8 re-run tried them and then reset the user's password, which only case Z's
delete undoes.

### Shared kit rules

- All PHB items by exact pack name from `dnd-players-handbook.equipment`: Longsword, Shield, Shortsword,
  Dagger, Scimitar, Chain Mail, Glaive, Rapier, Shortbow, Handaxe, Javelin, Greataxe, Quarterstaff,
  Studded Leather Armor, Leather Armor. Feats from `dnd-players-handbook.feats`. Class features
  `Three Extra Attacks`, `Steady Aim` are in `dnd-players-handbook.classes`. Pass them in `items`
  (`startingEquipment` omitted: gear is explicit); then **equip** weapons and armor with an update
  (`system.equipped: true`) and give each ammo user 20 arrows (Rogue) via an item `Arrows`.
- **Masteries** come from the class's Weapon Mastery choice (`"Weapon Mastery": [...]`); counts
  (verify in the dry run): Fighter 3 at L1, 4 at L4, 5 at L10; Barbarian 2, 3 at L4; Paladin 2;
  Rogue 2. Monk has none (see Monk row).
- Fixed-average HP (the helper's default). Languages/skills: let the helper default; ignore the
  `DEFAULTED` lines that do not touch combat.
- Feat ASI: each feat of the +1 type goes to the main stat so the main stat stays 16/17 as stated.

### Specs

| Actor | Class / subclass / level | Species / background | Abilities after bonuses | Feat / style | Weapons (equipped) and masteries | Armor | HP (avg) |
|---|---|---|---|---|---|---|---|
| **ZZ Fighter 5** | Fighter 5, Champion | Human, Soldier | STR 16, DEX 13, CON 14, INT 8, WIS 10, CHA 12 (array 15/13/14/12/10/8; Soldier +2 STR +1 CON; Dual Wielder ASI is feat +1 DEX to 14) | Style **Defense**; ASI@4 `{feat: "Dual Wielder"}` | Longsword (Sap) main + Shield off; Shortsword (Vex); Dagger (Nick); Scimitar (Nick). Weapon Mastery: longsword, shortsword, dagger, scimitar. Carry all four, equip Longsword+Shield for A1, swap by equipping for A5/A7 | Chain Mail (+1 Defense) | about 44 (12 + 4x8) |
| **ZZ Fighter 5 TWF** | clone | clone | same | Fighting Style item swapped: delete `Defense`, add `Two-Weapon Fighting` from the feats pack (or rebuild with `"Fighting Style": "Two-Weapon Fighting"`; prefer rebuild) | same | Chain Mail | same |
| **ZZ Fighter 11** | Fighter 11, Champion | Human, Soldier | STR 16 (feat ASIs go to DEX/CON: `Ability Score Improvement@4` Dual Wielder, `@6` `{con: 2}`, `@8` `{dex: 2}`) | Defense; Dual Wielder; Extra Attack (2 extra at L11 = 3 swings) | same four + Weapon Mastery 5th: handaxe (Vex) | Chain Mail | about 94 |
| **ZZ Fighter 20** | clone of Fighter 11, add `Three Extra Attacks` from classes pack, set `system.levels` of the class item to 20 | same | same | same | same | Chain Mail | whatever the sheet shows; not measured |
| **ZZ Polearm 5** | Fighter 5, **Battle Master** | Human, Soldier | STR 16 | style Defense; ASI@4 `{feat: "Polearm Master"}` | Glaive (Graze) two-handed; Dagger (Nick); mastery: glaive, dagger, longsword, shortsword | Chain Mail | about 44 |
| **ZZ Rogue 5** | Rogue 5, **Thief** | Human, Criminal | DEX 16, CON 14, INT 12, WIS 10, STR 8, CHA 13 | Sneak Attack 3d6, Cunning Action, **Steady Aim**; ASI@4 `{dex: 2}` (gives DEX 18 at 5: keep 16 by taking `{con: 1, wis: 1}` instead) | Rapier (Vex), Shortsword, Dagger (Nick), Shortbow + 20 arrows. Mastery (2): rapier, dagger | Studded Leather Armor | about 33 |
| **ZZ Monk 5** | Monk 5, **Warrior of the Open Hand** | Human, Sage/any | DEX 16, WIS 14, CON 14 | Martial Arts, Focus (5 points), Flurry of Blows, Stunning Strike, Extra Attack | Unarmed Strike; Quarterstaff. Monk has no Weapon Mastery: hand patch `system.traits.weaponProf.mastery.value = ["quarterstaff"]` so the **Topple** is offered | none | about 33 |
| **ZZ Barbarian 5** | Barbarian 5, **Path of the Berserker** | Human, Soldier | STR 16, CON 15, DEX 12 | ASI@4 `{feat: "Great Weapon Master"}` (+1 STR to 17 acceptable); Rage (3 uses), Reckless Attack, Frenzy, Extra Attack, Danger Sense | Greataxe (Cleave) equipped; Handaxe x2 (Vex); Mastery (3): greataxe, handaxe, javelin | none (Unarmored Defense) | about 55 |
| **ZZ Paladin 5** | Paladin 5, **Oath of Devotion** | Human, Soldier | STR 16, CHA 14 (Lay on Hands 25 pool), CON 14 | style **Defense** (@2); Divine Smite, Lay on Hands, Extra Attack, Channel Divinity | Longsword (Sap) + Shield; Javelin x3 (Slow). Mastery (2): longsword, javelin | Chain Mail | about 44 |

Spells (Paladin only): prepared `Bless`, `Cure Wounds`, `Command`, `Shield of Faith` (4 of the 5-level
paladin limit; slots 4/2); `startingEquipment` omitted, add `Emblem` via `items` as the focus.
Non-paladins have no spells. The Rogue/Fighter/Barbarian/Monk rows carry **no** other consumables.

### NPCs and non-character fixtures

| Fixture | Build |
|---|---|
| **ZZ Goblin x4** | `create-actor-from-compendium` `dnd-monster-manual.actors:Goblin Warrior`, rename `ZZ Goblin`, put in `ZZ usability`; drop 4 hostile **unlinked** tokens on `ZZ Arena`; set each token HP to 10 (max 10 so kills happen), keep AC 15 |
| **ZZ Ogre** | `dnd-monster-manual.actors:Ogre`, name `ZZ Ogre`, one hostile unlinked token |
| **Multiattack tokens** | Existing world actors, tokens only, untouched: `Gate Watch-Captain` (`1UfPRIE65FGMGENc`), `Jhaelryna the Mask, Street-Trickster` (`6mTMFBwOr2raO6lv`; no actor is named plain "Jhaelryna"), and an Elemental Spirit summons actor: world `Fire Elemental Spirit` (`2UmpGwRBbFKGOIir`) or `Earth Elemental Spirit` (`ODdZYKla4cUmctnk`) |
| **ZZ Prompt Fighter** | optional output of the prompt-markers `character` helper in PM5: Fighter 3, Champion, Human, any ids; deleted in Z |
| **ZZ Footlocker** | create an Item Piles pile actor, copy the items (not ids/state) of `Guard Footlocker` (`qQ7pkYRYNfnpzTUJ`) into it with `createEmbeddedDocuments`; place on `ZZ Arena`; area 8. Never touch the real Confiscated piles |
| **ZZ Arena** | blank 30x30 scene, global light on, no walls, grid 5 ft; not made active |

**Not created:** Warlock, Ranger, Cleric (mechanisms covered by the above). `ZZ Melee Probe` is the
build stage's; Z checks it is gone.

**Review caveats found while specing:** the Monk Topple needs the hand patch above; a Rogue at 5 with
the ASI in DEX reads 18 not 16 (take CON/WIS instead if the plan wants 16 to-hit consistency); the
`Dual Wielder` +1 on Fighter 5 raises DEX, not STR, so STR stays 16 and to-hit +6 (PB 3 + STR 3) at L5,
+7 at L11; the earlier "+5/+6" wording was off by one.

---

## 3. Areas

Nine areas. Each can be its own live session on its own scratch scene. Because only one GM client
may run, areas never actually run in parallel; the *must not run concurrently with* notes are
about shared state (a real PC, the active combat, a world setting) that a half-finished area
leaves behind, so that a session that is interrupted can be resumed without poisoning another.

| # | Area | Actors | Scene | Must not overlap with |
|---|---|---|---|---|
| 1 | Combat scaffolding and turn flow | ZZ Fighter 5, ZZ Rogue 5, ZZ Paladin 5, goblins | ZZ Arena | 2, 3 (same actors) |
| 2 | Melee: Full Attack, Extra Attack, off-hand | ZZ Fighters, goblins, Ogre | ZZ Arena | 1, 3; H1 reads the real PCs |
| 3 | Melee: once-per-turn riders and follow-ups | ZZ Rogue, Monk, Barbarian, Polearm, Paladin | ZZ Arena | 1, 2 |
| 4 | Druid: Wild Shape, Starry Form, druid spells, Multiattack | **Talo (real)**, Multiattack NPCs | ZZ Arena (Talo token placed) | 7, 8 (Talo) |
| 5 | Sorcerer: Marrith's spells, metamagic, points, fire riders, areas | **Marrith (real)**, goblins | ZZ Arena | 7, 8 (Marrith) |
| 6 | Wizard: Caven's rituals, Ward, Ring, summons, Light | **Caven (real)**, goblins | ZZ Arena | 7, 8 (Caven) |
| 7 | Attributes, knowledge and the no-leak sweep | all three real PCs, prison NPCs | Drow Prison (read-only) + ZZ Arena | 4, 5, 6 |
| 8 | Exploration: loot, lights, attunement, journal, portals, ghost movement | ZZ Fighter 5 + one real PC for the attunement/journal rows | ZZ Arena + the real portal pair | 4–7 for the real-PC rows |
| 9 | Prompt markers (Joe as GM) | none; may build and delete a `character` | ZZ Arena | — (writes nothing shared) |

**Suggested order:** 1 → 2 → 3 (melee, the build's own cases) → 9 (independent, fast) → 4 → 5 →
6 → 7 → 8 → Z. Area 1 runs **before** `pentaryn-combat` is installed as well as after: its T1–T3
rows are the baseline click counts the streamlining is measured against.

---

## Area 1 — Combat scaffolding and turn flow

**Needs:** `ZZ Arena`, a combat with ZZ Fighter 5, ZZ Rogue 5, ZZ Paladin 5 and 3 goblins; the
`ZZ Tester` tab controlling the Fighter. Argon up on both tabs. **Run twice:** before and after
`pentaryn-combat` is synced (rows marked *baseline* are the before numbers).

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **T1** *baseline* | player | "Roll my initiative" | the HUD has no Roll Initiative; `[open the combat tracker]` → d20 icon beside the token (1) | 1 | own dice: the resolver appears for the d20 | the player looks for it on the HUD first; note how long. **Streamlining candidate:** an Initiative button on the Free bar until rolled | initiative posted, tracker sorted, no second prompt |
| **T2** *baseline* | player | "Two swings at the goblin, by hand, the way it is today" | weapon-set slot (empty for a fresh PC → Use Item drawer → weapon = 2) → picker click (1) → attack dialog (1) → auto-damage → `[know to click again]` → weapon (1) → picker (1) → dialog (1) | measured, expected 7–8 | one at a time: this *is* the one-at-a-time path, record it as the reference | nothing says "1 of 2"; the empty weapon set | two attack cards, two damage cards, the Action pip grey after the first swing (note this: it says "done" when it is not) |
| **T3** *baseline* | player | "Hit a goblin standing next to me, then end my turn" | weapon (1) → picker (1) → dialog (1) → End Turn (1) | 4 | undo: Esc on the dialog cancels cleanly, the pip is not spent | the "0/1 Targets" picker gives no cue until the mouse moves; a click slightly off the token stays 0/1 (Argon). Count how often a tester misses | the turn advances, the next combatant's HUD appears on the GM tab |
| **T4** | player | "I joined late — where is my HUD?" | reload the player tab mid-combat → no HUD → `[token-controls toggle]` (1) | 1 | — | the player does not know the toggle exists; the "Where is my X" journal should say so (check it does) | HUD up after one click; note whether Argon "always on" should be reconsidered (ledger candidate, Joe's call) |
| **T5** | player | "Move, then attack" | drag the token 20 ft (1) → the movement bar updates → attack as T3 | 1 + T3 | undo: drag back (1), the bar gives the movement back | the bar's colour change; whether a diagonal counts right (2024: 5 ft per diagonal) | movement shown as 20/30 with the bar, attack unaffected |
| **T6** | player | "Opportunity attack on the goblin walking away" | GM moves a goblin out of reach → the player's Reaction panel → weapon (1) → picker (1) → dialog (1) | 3 | one at a time: native | nothing prompts the reaction (expected: no midi); does the Reaction slot read "Opportunity Attack"? (transform renames it only for forms) | the attack card posts, the **Reaction** pip is spent, not Action |
| **T7** | player | "Dodge / Dash / Disengage / Hide" | each button once (1 each) | 1 each | — | which ones post a card vs only spend the pip; Hide should roll Stealth (2024) | each spends the Action pip; Hide posts a Stealth roll; Dodge applies the status |
| **T8** | player | "I'm Prone / Grappled / Poisoned — what does it do to me?" | GM toggles the condition (`toggle-token-condition`) → the player hovers the portrait strip | 0 | — | the condition shows on the portrait strip with a tooltip that says the effect; a Prone attacker's dialog defaults to Disadvantage? (dnd5e 6 does for melee vs prone: Advantage within 5 ft) | status shown; the next attack dialog reflects the condition's rule where dnd5e automates it; note where it does not |
| **T9** | player + GM | "I'm at 0 HP. Death saves." | GM sets Fighter HP 0 → the player's turn: the HUD shows **Death Save** (where? Argon puts it on the portrait / the drawer) (1) → three turns → a 20 / a 1 / a hit while down | 1 per save | own dice: the resolver for the d20 | finding the death save; whether failures display on the portrait; a nat 20 gives 1 HP and clears | three saves tracked, 20 → 1 HP, 1 → two failures, a melee hit while at 0 → two failures (2024), Paladin's Lay on Hands (1 click + amount) brings him back and the HUD rebuilds |
| **T10** | player | "Concentration" | Paladin casts Bless (Action panel → spell (1) → targets (3 clicks for 3 allies) → card) → takes damage from a goblin → dnd5e's Concentration prompt | 1 + targets; the save is 1 | own dice | the targets step is the slow part; the concentration prompt is dnd5e's own card with a roll button — does the player see it (it is whispered to the owner)? | Concentrating effect on the portrait; the save card goes to the player; a fail drops the spell and its effects |
| **T11** | player | "Short rest / Long rest from the HUD" | HUD rest buttons (1) → dnd5e dialog (1) → Hit Dice +/− in the dialog | 2 | — | the Hit Dice step; what the chat line says | HP, slots, uses recover per the PHB; chat line is the actor's plain name |
| **T12** | GM | "Advance the round" | tracker next (1) ×N | 1 | — | nothing | once-per-turn things recover on the right turns (feeds area 3); `pentaryn-movement` ghost switches off with a toast when combat starts and stays off after (note the known friction: the button stays off until clicked) |
| **T13** | player tab | "A player sees only what they should" | with `attackRollVisibility` `"none"`: the player's attack card hides hit/miss and the goblin's AC; the GM's goblin attack on the player | 0 | — | the player asks "did I hit?" — this is Joe's design (GM calls it). Record whether `"hideAC"` would feel better (ledger candidate) | nothing GM-only on the player tab; the goblin's roll shows its total only per the dnd5e setting |

**Area pass:** T1–T13 run; baseline numbers for T1–T3 recorded in the results file before area 2
starts; no T case needed a GM to rescue the player except T9's heal.

---

## Area 2 — Melee: Full Attack, Extra Attack, off-hand (`pentaryn-combat` phase 1)

**Needs:** `ZZ Arena` with ZZ Fighter 5 / 5 TWF / 11 / 20, the Ogre and goblins in a combat;
`ZZ Tester` tab; `pentaryn-combat` synced and enabled with every setting at default. Case ids are
the spec's (§13) so the build stage can tick them. **Not concurrently with** areas 1 and 3.

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **A0** | player | "What is this new button?" | hover **Full Attack** on the Action bar | 0 | — | the tooltip must say *what will happen* ("Attack twice with Longsword … Esc pauses; right-click picks another weapon") and the badge must read 2 | a first-time tester can say what the button does before clicking it |
| **A1** | player | "All my swings on the Ogre" (already targeted) | Full Attack (1) → attack dialog swing 1 (1) → auto-damage → dialog swing 2 opens itself (1) | **3** | own dice (case P); one at a time: T2 still works unchanged; undo: Esc on dialog 2 → pause (A3) | the second dialog opening by itself (does it read "Swing 2 of 2"?); where the strip is; whether the player thinks the first damage card means "done" | one usage card, two attack cards threaded under it, two damage cards, pips **2 → 1 → 0**, Action pip consumed once, ammo/uses consumed once |
| **A2** | player | same, no target yet | Full Attack (1) → Argon picker click (1) → as A1 | 4 | undo: right-click out of the picker = nothing started, pips untouched | the picker's no-cue problem (T3) is now on the critical path once, not twice | as A1 after one picker |
| **A3** | player | "Second swing on a different goblin" | Full Attack (1) → dialog 1 (1) → **Esc** (1) → strip **Retarget** (1) → picker (1) → dialog 2 (1) | 6 (spec says 5 counting Retarget+picker as one; record the real number) | undo: this *is* the undo path | does Esc read as "cancel everything"? The strip must make Resume / Retarget / Stop visible within a second | swing 2 lands on the second goblin; the usage card is not duplicated |
| **A4** | player | "I already swung once by hand, now the rest" | weapon click (1) → picker (1) → dialog (1) → Full Attack (1) → dialog (1) | 5 | one at a time ✓ by construction | the Full Attack badge must now say **1**; a player who does not notice would expect 2 | the button offers the remaining swing only; pips 1 → 0 |
| **A5** | player | "Shortsword twice plus the Nick dagger" | (Fighter 5 with Shortsword + Dagger in set 1) Full Attack (1) → 3 dialogs (3) | 4 | undo: Stop after swing 2 leaves the Nick swing on the Free bar as **Nick: Dagger** | the third swing being a different weapon with no `@mod` on damage — the strip must name it; no Bonus pip spent | 3 attack cards; dagger damage `1d4` flat; Bonus pip free; Nick gone from the Free bar afterwards; next turn it is back |
| **A6** | player | "Three / four swings" | ZZ Fighter 11 then 20: Full Attack (1) + N dialogs | 1 + N | quick mode (§5.7) on: 2 clicks | the fourth dialog in a row feels like a lot — this is where quick mode earns its place; note the tester's reaction | badge and pips match N; threading intact |
| **A7** | player | "Off-hand longsword after my Attack action" (Dual Wielder, no TWF). Setup (U-2-4): **Shortsword + Longsword** equipped, Dagger and Scimitar unequipped. The 2024 rule needs a *Light* weapon in the Attack action, and a Scimitar is Nick (a free Nick attack, not a Bonus one) | one Shortsword click (or Full Attack) → **Off-hand: Longsword** appears on the Bonus bar (Argon's plain Longsword slot hides while it is offered) → click (1) → dialog (1) | **2** | one at a time: the native Attack Mode = Offhand in the dialog still works and is counted; undo: cancel the dialog, button stays | the button must not be there *before* the Attack action; the dialog's mode is pre-set to Offhand — does the player notice or care? | damage `1d8` flat, no `@mod`; **Bonus** pip spent, Action pip untouched; next longsword click defaults to one-handed (mode reset, `offhandModeReset`) |
| **A8** | player | same, with Two-Weapon Fighting (ZZ Fighter 5 TWF) | as A7 | 2 | — | nothing new visible; this is a numbers check | damage `1d8 + 3` via the native rule effect written by `fixFeats()` (or the riders fallback); the card's formula shows the mod once |
| **A9** | player | "I crit on swing 1" | as A1 until a 19–20 lands (Champion); GM may force it with a fixed roll on the GM tab for the ZZ actor | 3 | own dice: type 20 in the resolver | the auto-damage card must show doubled dice on *that* swing only | swing 1 damage crit, swing 2 normal |
| **A10** | player | "Quick mode" | user flag on → Full Attack (1) → one dialog (1) → swing 2 rolls itself | 2 | own dice: the resolver still appears per swing (configure:false skips the dialog, not the resolver) | the player cannot pick Advantage on swing 2 — the toggle on the strip must be discoverable; where is quick mode turned on? (Free bar toggle or settings?) | two swings, one dialog, mode reused |
| **A11** | player | "Stop after one swing and cast a cantrip instead" (Bladesinger-style, §4) | Full Attack (1) → dialog (1) → strip **Stop** (1) → spell panel cantrip (1) | 4 | — | after Stop, the pip must still show 1 swing left so the player understands the cantrip replaces it; the cantrip use then zeroes it | the sequence ends, no stray dialog; pips consistent |
| **A12** | player | "Change weapon mid-sequence" | Full Attack (1) → dialog (1) → Esc (1) → strip weapon tile Shortsword (1) → dialog (1) | 5 | — | the tiles must show to-hit and damage so the choice is informed | swing 2 with the shortsword threaded under the same usage card |
| **H1** | GM, read-only on the real PCs | "Nothing changed for Caven, Marrith, Talo" | open each PC's HUD in a scratch combat on `ZZ Arena`; record `flags.enhancedcombathud.weaponSets` before/after | 0 | — | the `seedWeaponSets` null-only seed fills set 1 (Dagger / Sickle etc.) — Joe must be told in the ledger; it is the one write to a real PC the spec allows | no Full Attack button (attack count 1); single weapon click path identical to T2's recording; only the weapon-set flag differs, and only if it was null |
| **P(A1)** | player, Manual dice | "I roll my own d20 and d8" | GM sets the tab's `core.diceConfiguration` d20+d8 → Manual → run A1 | 3 + one resolver per die | **this is the own-dice check for the whole area** | the resolver label must say which swing it is for; the order (d20 swing 1, d8 damage 1, d20 swing 2, d8 damage 2) must be obvious | every die asked once, in order; quick mode still asks; `diceConfiguration` reset to `{}` after |
| **R** | GM | "Turn it all off" | every `pentaryn-combat` world setting off → reload → A0–A7 by the native path | — | — | — | HUD identical to the area-1 baseline; `game.pentaryn.combat.report()` clean; settings back on afterwards |

**Area pass:** A1 at 3 clicks, A7 at 2, H1 with nothing but the documented seed, P and R clean.
**Streamlining candidates to log:** the picker cue (T3) now matters once per sequence; whether the
badge should read "2 swings" rather than "2"; whether quick mode should be the default for a
Fighter 20 (Joe's call).

---

## Area 3 — Melee: once-per-turn riders and follow-ups (`pentaryn-combat` phase 2)

**Needs:** `ZZ Arena`, a combat with ZZ Rogue 5, ZZ Monk 5, ZZ Barbarian 5, ZZ Polearm 5, ZZ
Paladin 5, ZZ Fighter 5 (as the "ally adjacent"), goblins and the Ogre. Tester tab controls the
actor under test. **Not concurrently with** areas 1 and 2.

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **B0** *baseline* | player | "Sneak Attack today, stock PHB item" | rapier swing (3) → find Sneak Attack on the Bonus/Free panel or sheet `[know it is a separate item]` (1–2) → 13-type picker (1) → damage | ~6 | — | the type picker; the spent-forever uses; crit not carried | record it; this is what B1 replaces |
| **B1** | player | "Rapier with advantage, then Sneak" | Steady Aim (1) → rapier (1) → picker (1) → dialog with Advantage pre-set? (1) → **+ Sneak Attack 3d6** on the attack card (1) | 5 (spec: 3 for weapon + dialog + Sneak, plus the advantage source and picker) | one at a time: the stock item still usable; undo: don't click = nothing spent | the button is on the **attack** card above the auto-damage card — does the eye find it? The hint "advantage ✓" must be readable | a piercing damage card, no type picker, threaded under the usage card; the button gone from later swing cards this turn; the stock item's uses **untouched** |
| **B2** | player | "No advantage, Fighter beside the goblin / not beside" | move Fighter adjacent → rapier swing → read the hint; move him away → swing again next turn → read the hint | 3 per swing | — | the module must **never** hide the button on "not adjacent" (GM arbitrates); the hint text must say *why* ("ally beside the target ✓ / none — ask your GM") | hint changes with the Fighter's position; the button is always present while unused |
| **B3** | player | "Natural 20 then Sneak" | as B1 until a 20 (GM can force on the ZZ actor) | 5 | — | the doubled sneak dice must be visible on the card ("6d6") | sneak dice doubled, crit carried from that swing's d20 |
| **B4** | player | "Auto mode" | Free bar **Sneak Attack: ask → auto** (1) → rapier swing (3) | 4, then 3 per turn | undo: the **Undo** link on the damage card note restores the once-per-turn (test it after the GM calls a miss) | a player who forgets auto is on wonders why the button vanished; the card note "+ Sneak Attack 3d6" must be prominent | one damage card `1d8 + 3d6 + 3`; Undo resets the flag and the next swing shows the button again |
| **B5** | player + GM | "Sneak on my turn, then on an opportunity attack" | B1 on the Rogue's turn → GM moves a goblin away on its turn → Reaction weapon swing (3) → + Sneak (1) | 4 | — | the player assumes "I already used it" — the button being there is the cue | available again (turn key differs); on the Rogue's next turn available again |
| **B6** | player | "Ranged Sneak" | shortbow at a goblin with the Fighter adjacent (3) → + Sneak (1) | 4 | — | ammo consumed per swing (spec verify item) | eligible (ranged), arrows −1 |
| **B7** | player | "Nick on a rogue: shortsword + dagger" | Full Attack with shortsword (1) → dialog (1) → Nick dagger dialog (1) → + Sneak on whichever hit (1) | 4 | — | Sneak offered on **both** attack cards until used, then gone from the other | two attack cards, one sneak, Cunning Action bonus still free |
| **C0** *baseline* | player | "Flurry today" | Flurry item (1) → `[find Unarmed Strike twice]` (≈6) | ≈7 | — | the stock Flurry rolls nothing | record |
| **C1** | player | "Attack, then Flurry" | Full Attack (Monk 5 has Extra Attack: 1 + 2 dialogs) → **Flurry of Blows (2 strikes)** on the Bonus bar (1) → 2 dialogs (2) | 6 for the whole turn; **3** for the Flurry part | undo: cancel the first Flurry dialog → pause, Focus already spent (say so on the strip) | the Focus badge must drop by 1 visibly; the Flurry card must show the two Unarmed Strike attacks under it | Focus −1, Flurry card, two attacks threaded under it, **Bonus** pip spent, Martial Arts strike hidden afterwards |
| **C2** | player | "Martial Arts strike instead" | Attack action → **Martial Arts strike** (1) → dialog (1) | 2 | — | both buttons visible before the choice; only one afterwards | one Unarmed Strike, Bonus spent, Flurry hidden |
| **C3** | player | "Flurry with no Focus left" | spend Focus to 0 → the Flurry button | 0 | — | greyed with a reason, not missing | greyed, tooltip says "no Focus" |
| **D1** | player | "Rage, Reckless, hit" | Rage (Bonus, 1) → Reckless Attack (1, or a toggle?) → greataxe Full Attack (1 + 2 dialogs) → **Frenzy** offer on the first Strength hit (1) | 6 | — | Reckless Attack's UI (dnd5e 6 has it as an activity? a toggle?) — note what the player must do; rage damage must appear **once** | Frenzy dice `2d6` once; rage damage +2 once (no double count between the PHB Rage effect and anything we wrote); Bonus pip spent on Rage; Frenzy gone after use |
| **E1** | player | "GWM: +PB on a hit; Hew after a kill" | Barbarian greataxe on a 10-HP goblin → kill → **Hew: Greataxe** on the Bonus bar (1) → dialog (1) | 2 for Hew | — | Hew appears only after the kill/crit; the player must notice the Bonus bar changed — is there a flash or a badge? | +3 on Heavy hits via the rule effect; Hew one swing, Bonus spent; not offered next turn without a crit/kill |
| **E2** | player | "Polearm Master's Pole Strike" | with `gateFollowUps` on: glaive attack → **Pole Strike** appears (1); with it off: always visible | 1 | — | with gating on, a player who wants the bonus attack *before* the Attack action (legal? no — 2024 Pole Strike needs the Attack action with the polearm) must not be confused by its absence; tooltip should say "after you attack with the glaive" | native activity, visible only after the Attack action with the polearm when gated |
| **F1** | player | "Hit, then Divine Smite" | longsword swing (3) → **Divine Smite** on the Bonus bar (1) → dnd5e's slot picker (1) | 5 | — | the crit-carry gap: on a crit the smite dice are **not** doubled by the native spell — known gap, document the workaround (the GM's damage tray multiplier) | smite damage card, slot spent, Bonus pip spent; the gap recorded, not fixed |
| **F2** | player | "Lay on Hands on the Fighter" | Lay on Hands (1) → target (1) → amount (1) | 3 | — | the amount dialog | HP applied, pool reduced |
| **P(B1, C1)** | player, Manual | own dice for B1 and C1 | as above with d20, d6, d8 Manual | — | the resolver for the sneak d6s is asked **once** (3 dice in one resolver) and for each Flurry d20 in order | — | every die asked, none twice; reset to `{}` |
| **N1** | player | "Out of combat, two rounds of practice swings" | end the combat → the Free bar shows **New turn** → swing → + Sneak → New turn (1) → swing → + Sneak | 1 extra per "turn" | — | the player must understand New turn is for out-of-combat only (it must not appear in combat) | once-per-turn tracked with the `nocombat` key; New turn resets |

**Area pass:** B1 ≤ 5, C1's Flurry part at 3, E1's Hew at 2, D1 with rage counted once, no
stock item uses consumed by our offers, P clean. **Streamlining candidates:** auto mode as the
default for a rogue; a Bonus-bar flash when a follow-up appears; the Reckless Attack UI.

---

## Area 4 — Druid: Wild Shape, Starry Form, druid spells, Wild Shape and NPC Multiattack

**Needs:** **Talo (real)**, snapshot first (HP 99, 3 Wild Shape uses, Cosmic Omen 1 spent,
concentrating on Summon Elemental — record and restore all of it). Talo's token placed on
`ZZ Arena` (not the Prison one: place a fresh token, delete it after) in a scratch combat with 2
goblins. The **Talo** player tab (`make login USER_NAME=Talo LOGIN_HOST=zz<n>.localhost`, U-7-2). Multiattack NPC tokens
for G2. **Not concurrently with** areas 7 and 8. Every row ends with Talo's state restored; the
whole area ends with the snapshot diff.

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **D1** | Talo | "Become a Brown Bear" | Bonus bar **Wild Shape** (1) → tile Brown Bear (1) | **2** | undo: **Return to Talo** (1) | the panel opens at the far left of the Action bar (known small item — note whether a tester's eye finds it); the uses badge | shifted; portrait `99+12 / 99`; the beast's weapons on the front row; Reaction slot reads Opportunity Attack; one chat line |
| **D2** | Talo (bear) | "Bite and Claw — all of it" | **Full Attack** on the bear's Action bar (1) → Bite dialog (1) → Claw dialog (1) | 3 | one at a time: the Bite and Claw buttons on the front row still work singly; own dice | the Multiattack card used to be text: a tester who reads it may still click Bite by hand — fine, pips must then read 2 → 1 | Bite + Claw threaded; transform's front row intact; pips match (G1) |
| **D3** | Talo (bear) | "Change form mid-fight" | **Change Form** (1) → tile (1) | 2 | — | stacked transforms blocked with a message that says why | second form, one use spent per shift, time-left line correct |
| **D4** | Talo (bear) | "Go to 0 HP" | GM sets the form's HP 0 | 0 | — | the auto-revert must leave the player on Talo's HUD with the excess damage carried over (2024) | reverted, damage carry-over correct, form actor gone from the sidebar |
| **D5** | Talo | "Starry Form: Archer, then shoot" | **Starry Form** (1) → Archer tile (1) → **Archer (Starry Form)** button (1) → target (1) → dialog (1) | 5 | — | the Archer tooltip lingering after the click (known); the Bonus pip spent by assuming the form | effect for 10 minutes, starlight on the token, the Archer attack `+11, 2d8+5 radiant`, one Wild Shape use spent |
| **D6** | Talo | "Chalice: heal when I cast a healing spell" | Starry Form → Chalice (2) → cast Cure Wounds on a goblin-bitten ally (spell (1) + target (1)) | 4 | — | the Chalice rider: does the second heal (1d8 + WIS to Talo) happen by itself or need a click? Record which | both heals on cards |
| **D7** | Talo | "Dragon: concentration save at 10 minimum" | Starry Form → Dragon → cast Moonbeam (concentration) → take damage | 3 + the save | — | whether the minimum-10 shows on the save card or only in the number | save result ≥ 10 |
| **D8** | Talo | "Cosmic Omen" | the Cosmic Omen button (1) → read the d6 | 1 | — | **known open item:** only Argon's plain button, no Weal/Woe on the HUD — the tester has to read the chat. Rate the confusion; fix candidate: a badge "Weal" / "Woe" on the button (ledger) | the d6 rolled, the reaction usable PB times |
| **D9** | Talo | "A cantrip: Produce Flame / Thorn Whip / Starry Wisp" | spell panel → cantrip (1) → target (1) → dialog (1) | 3 | own dice | Potent Spellcasting adds +WIS — on the three hand-edited cantrips the rider is **skipped** (known). Decide: fix the items so the rider applies (ledger row with revert) | +5 damage once on each cantrip, no double on the fixed ones |
| **D10** | Talo | "An area spell: Call Lightning / Spike Growth" | spell (1) → place the template (1) → the handle appears → drag the handle (1) → GM's tray → Apply | 3 for the player | undo: the eraser icon / delete the handle | the handle token as the way to move an area — a tester must find it without being told; the "Damage again after moving" rule is GM-side | area placed and moved by the player; NPC saves rolled GM-only; the player sees nothing GM-only |
| **D11** | Talo | "Ritual: Detect Magic as a ritual" | spell → the card's ritual toggle / activity | 2 | — | where the ritual option is in the dnd5e 6 usage dialog; does Argon's card show it | no slot spent, 10-minute cast noted |
| **D12** | Talo | "Revivify the Fighter" | ZZ Fighter 5 at 0 HP → Revivify (1) → target (1) | 2 | — | **known open item:** Revivify is a `damage` activity with formula 1 → fix to `heal` (ledger row) | 1 HP restored, diamond consumed |
| **D13** | Talo | "Short rest in a form; long rest" | shift → Short Rest (1) → dialog (1); Long Rest on the druid with a form out | 2 | — | the chat line reads "Talo (Giant Bat) takes a short rest." (known) — note; the Long Rest reverts first with a confirm | one use back on the short rest; all back and reverted on the long |
| **D14** | Talo | "Summon Elemental, then my creature's turn" | the concentration already running: place the summons if not placed → the **Your creatures** strip appears at 2+ owned tokens → click the portrait → its HUD | 1 | — | the strip's discoverability; the summons' 5-ft light. **Run with no ZZ token on the scene** (U-4-2): the Talo user owns every ZZ actor, so ZZ tokens alone make the strip appear and spoil the discoverability check | the summons controllable from the strip, owned by Talo |
| **G2** | GM (NPC) | "Full Attack on a Multiattack NPC" | Gate Watch-Captain token → Full Attack (1) → 3 dialogs; Jhaelryna (3 daggers); the Elemental Spirit (level formula) | 1 + N | one at a time: the individual attack buttons | an unparseable Multiattack must leave the native text card, not a broken button | counts right per actor; the spirit's formula evaluates; unparseable → native card |
| **D15** | Talo tab | "Sheet route" | do D1 and D5 from the **sheet** (Wild Shape item → Use → chat card → Transform) | measured | one at a time ✓ (this is the non-HUD path) | the dnd5e profile picker; whether the revert item shows on the sheet | same result as the HUD path; the known "only via `Item.use()`" gap closed |

**Restore:** Wild Shape spent back to its snapshot value, Cosmic Omen uses, slots, the Summon
Elemental concentration as recorded (re-apply the effect if the test dropped it), effects, HP 99,
temp HP, token on `ZZ Arena` deleted, no form actors in `PC Summons & Forms`.

---

## Area 5 — Sorcerer: Marrith's spells, Metamagic, sorcery points, fire riders, areas and saves

**Needs:** **Marrith (real)**, snapshot first (HP **69/98** — stays; slots spell1 5/4 … per the
doc baseline; Font of Magic 4 spent, Innate Sorcery 2, Pearl 1, Wand 2). Fresh token on `ZZ Arena`,
scratch combat with 4 goblins and the Ogre; the **Marrith** player tab. **Not concurrently with**
areas 7 and 8.

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **S1** | Marrith | "Fire Bolt a goblin" | spell panel → Fire Bolt (1) → target (1) → dialog (1) | 3 | own dice (the d10s; Elemental Adept's 1→2 must show as a note on the card) | the "1s count as 2" note under the dice row is easy to miss (known) | attack card, damage with 1s shown as 2, the flame mark on the spell button |
| **S2** | Marrith | "Fireball on four goblins" | Fireball (1) → place the template (1) → GM tray: NPC saves rolled GM-only → Apply (GM) | **2** for the player | undo: eraser / Escape during placement / right-click | the player waits for the GM's Apply with no feedback (known: outcomes appear only after Apply) — rate it; the handle token; Elemental Affinity +CHA once | 8d6 fire, +5 once, resistance ignored in the tray by default (Elemental Adept), 4 rows, the player tab shows no GM-only save |
| **S3** | Marrith | "Move the Fireball before the GM applies" | drag the handle (1) → GM clicks Damage again | 1 | — | "a moved area needs Damage clicked again" is GM-side; from the player side it must just work | the tray re-targets |
| **S4** | Marrith | "Careful Spell on that Fireball" | Careful Spell (1) → `[then cast]` Fireball (2) | 3 | — | **untested gap:** does Careful mark allies as auto-pass in the aoe tray, or is it a bare points spend? Record exactly what the player gets; fix candidate: a "protected" row flag in the tray (ledger) | points −1, allies' rows exempt or the gap documented |
| **S5** | Marrith | "Quickened: cast Scorching Ray as a bonus action, then Fire Bolt" | Quickened (1) → Scorching Ray (1) → 3 targets (3) → 3 dialogs → Fire Bolt (3) | measured | — | whether Quickened changes the spell's action pip or is a separate use the player must mentally link; Scorching Ray's tooltip says "Total Rays: 1" before casting (known) | points −2, Bonus pip spent on the Quickened cast, Action free for Fire Bolt; three ray cards |
| **S6** | Marrith | "Empowered: reroll my low damage dice" | after S1's damage → Empowered (1) → `[which dice? how?]` | measured | — | **untested gap:** the stock activity probably just spends a point; the reroll is manual. Document the real flow; candidate: a "Reroll lowest N" button on her own damage card (ledger) | points −1; the reroll path recorded |
| **S7** | Marrith | "Transmuted: Fire Bolt as cold" | Transmuted (1) → Fire Bolt | 1 + 3 | — | **The Inward Flame** makes everything fire anyway — Transmuted on her is a trap. Rate: should the button be hidden or badged "always fire"? (ledger candidate) | the card still says fire; no crash |
| **S8** | Marrith | "Points ↔ slots" | Font of Magic: slot → points (1 + pick) and points → slot (1 + pick) | 2 each | — | which activity is which; the points counter visible on the HUD? (check the Free/Bonus badge) | counts move correctly, the HUD badge updates without a reload |
| **S9** | Marrith | "Innate Sorcery, then cast" | Innate Sorcery (1) → Fire Bolt (3) | 4 | — | the DC +1 / advantage on spell attacks must show on the dialog as a pre-set | effect on the portrait, dialog defaults to Advantage, DC 18 on the next save spell |
| **S10** | Marrith | "Wand of Fireballs" | Use Item → Wand (1) → template (1) | 2 | — | charges badge; which panel it lands on | charge −1, same aoe flow as S2 |
| **S11** | Marrith | "Pearl of Power" | Pearl (1) → slot pick (1) | 2 | — | — | a spent slot restored, uses −1 |
| **S12** | Marrith | "Battle Medic on the Fighter" | Healer kit (1) → target (1) | 2 | — | the GM writes the Hit Die spend for another PC (needs GM online); the player sees the heal land | target's largest HD spent, heal rolled with 1s rerolled, kit uses −1 |
| **S13** | Marrith | "Concentrate on Flaming Sphere, move it, take damage" | Flaming Sphere (1) → place (1) → next turn: Bonus bar → move/ram (1) → GM goblin hits her → concentration card | 3 | — | the Sphere is a summons: owned, on the creatures strip; the concentration prompt | sphere placed as her summons; the save card goes to her tab; on a fail the sphere goes |
| **S14** | Marrith | "Counterspell on the goblin shaman" (if one is placed; else skip) | Reaction panel → Counterspell (1) → target (1) | 2 | — | the Reaction pip; the 2024 ability check | slot −1, Reaction spent |
| **S15** | Marrith tab | "No leak" | during S2 the player tab shows: her own save-request card only, no NPC save totals, no GM tray | 0 | — | — | nothing GM-only on the player tab (cards-flow suite 2, the part that never ran) |
| **S16** | Marrith | "A save spell re-rolled from its card" | Fireball damage card → Reroll damage (GM or player) | 1 | — | +CHA applied again by design (known) — the player must not see two different totals without a reason; note | documented behaviour confirmed; no state drift |

**Restore:** HP 69/98, every slot and use to the snapshot, sorcery points, effects (Innate Sorcery
off), concentration cleared, summons tokens and world copies deleted, token on `ZZ Arena` deleted.

---

## Area 6 — Wizard: Caven's rituals, Arcane Ward, Ring, summons, Light, concentration

**Needs:** **Caven (real)**, snapshot first, at the start of the live run, and restore to *that*
snapshot (HP, AC, every slot level, Arcane Ward / Ring / Arcane Recovery uses, effects). Do not
restore to fixed numbers: on 2026-10-10 he was already at HP 75/86, AC 15 (Mage Armor only),
slots L1 2/4 · L2 0/3 · L3 0/3 · L4 0/3 · L5 1/2 · L6 0/1, Arcane Ward 29/29 spent, Ring 3/5,
Arcane Recovery 1/1. Fresh token on `ZZ Arena`, scratch combat with goblins and the Ogre; the
**Caven** player tab (`make login USER_NAME=<Caven's player> LOGIN_HOST=zz<n>.localhost`, U-1-2, U-7-2); the
Fighter as an ally for Projected Ward; **a torch for W11** (Caven owns none: drop one Torch from
`ZZ Footlocker` onto Caven and delete it on restore, or run W11 on ZZ Fighter 5). **Not concurrently with** 7 and 8.
Also exercises `pentaryn-creatures`, `-portals` (follow rule) and `-senses` (Light).

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **W1** | Caven | "Cast Mage Armor on myself (already up — recast after it ends)" | GM removes the effect → spell (1) → card → the effect applies by itself (self-cast auto-apply) | 1 | undo: delete the effect from the portrait strip | the effects strip at the bottom of the card: with auto-apply the player should **not** need it — check it reads "applied", not "not applied yet" | AC 15, one effect, no duplicate |
| **W2** | Caven | "Shield as a reaction when the goblin hits me" | GM rolls the goblin's attack → Reaction panel → Shield (1) | 1 | — | nothing prompts (no midi); the player must watch the GM's card; the effect applies to self | slot −1, AC +5 effect until his next turn |
| **W3** | Caven | "Ritual: Detect Magic / Identify / Find Familiar as a ritual" | spell → ritual option | 2 | — | Argon hides unprepared spells for a wizard; since U-6-2 the Action bar's Cast Spell panel has a **Rituals (no slot)** group (his 9 unprepared rituals) and the dialog starts with *Consume Spell Slot* unticked — check both, and that ticking it still spends a slot | no slot spent; the group visible; one-click-plus-dialog |
| **W4** | Caven | "Arcane Ward: see it, use it, Projected Ward" | Free panel → the four Ward activities → absorb damage on a hit; Projected Ward (Reaction, 1) on the Fighter being hit | 1 | — | four `special` activities on the Free panel with no labels a new player understands — rate the names; the ward pool must be visible as a badge | pool decrements, Projected Ward spends the Reaction pip, the Fighter's damage reduced |
| **W5** | Caven | "Memorize Spell / Arcane Recovery on a short rest" | Short Rest (1) → Arcane Recovery (1) → pick slots (1) | 3 | — | the dnd5e 6 UI for Arcane Recovery | slots restored per the PHB |
| **W6** | Caven | "Cast from the Ring of Spell Storing" | Use Item / spell panel → the Ring's cast activity (1) → cast | 1 + the spell's own | — | the cast activities (`k3B8CnK3Tf6stgMx`, `9r5QQhy1QMf2nO5I`) must show on the sheet **and** the HUD, in the right panel for their action type | the stored spell casts, the Ring's stored levels decrement, no slot of his spent |
| **W7** | Caven | "Animate Dead → a skeleton that follows me" | Animate Dead (1) → profile picker (1) → place (1) → the **Your creatures** strip → next: cross the real Prison→Pit portal with Caven's token (1 drag + the confirm (1)) | 5 | — | the summons' 5-ft light; the follow rule puts the skeleton beside him on the other side; the simultaneous-confirm stacking (known, needs two PCs — run with the Fighter too and note) | skeleton owned by Caven, on the strip, follows through the portal; tokens deleted after; the portal pair untouched |
| **W8** | Caven | "Mage Hand, then do something with it" | Mage Hand (1) → place (1) → strip → control the hand → move it (1) | 3 | — | the hand is a summons with a token: discoverability of controlling it | controllable from the strip |
| **W9** | Caven | "Summon Undead and concentrate; the goblin hits me" | Summon Undead (1) → form pick (1) → place (1) → GM goblin hits → concentration card | 3 | — | the concentration prompt is dnd5e's (whispered) — does the player tab show it clearly? | on a fail the summons vanishes and the strip updates |
| **W10** | Caven | "Light cantrip on my staff / on the Fighter" | Light (1) → the prompt **On me / Pick a target / Not now** (1) → for a target: picker (1) | 2–3 | — | Argon asks for a target **before** the Attack/Light chooser (known); the card's icons are hover-only (known) | light on the chosen token for an hour, the senses light flag set |
| **W11** | Caven | "Carry a lit torch; put it out" | inventory row flame button (1) → the torch lights the token → flame again (1) | 1 each | — | the lit-torch-merging-into-a-stack-arrives-unlit case (known) — run it once with a second torch | light on/off; the merge case recorded |
| **W12** | Caven | "Shard of broken glow" | just look: the purple wave on the token | 0 | — | the wave never cuts out | brightness varies, never zero |
| **W13** | Caven | "Fireball-type area as the wizard (Cone of Cold)" | as S2 | 2 | — | same aoe flow, different caster: nothing new should appear | same pass as S2 |
| **W14** | Caven tab | "No leak" | NPC saves during W13, the GM's tray, the concentration whisper | 0 | — | — | nothing GM-only visible |
| **W15** | GM | "The Allosaurus stray" | note the empty-texture token `3MOg1yNcRGsrJtBj` on Kharg's Adit and the form actor `zRTdAW9xtjnoMYzr` | — | — | not a player flow: decide with Joe whether to delete (ledger row if done) | documented |

**Restore:** HP 86, Ward pool to the snapshot, Ring stored levels, slots, effects (Mage Armor
present), summons tokens and any imported compendium copies deleted, light flags cleared, token on
`ZZ Arena` deleted.

---

## Area 7 — Attributes, knowledge and the no-leak sweep (`pentaryn-ties`, journals, secrets)

**Needs:** all three real PCs on Drow Prison, the prison
NPCs (Nilonim, Vesh, Nalveth, the jailers), all three player tabs one at a time, the GM tab for
blind rolls. Record each PC's `granted` / `studied` / `known` / `failed` flags first; reset with the
calls in `attributes.md` after every row that rolls. **Not concurrently with** 4, 5, 6.

*Setup correction (U-7-2):* the PCs' real tokens are on *Surface — Kharg's Adit*, not Drow Prison,
and that is a campaign scene: place **temporary** tokens of Caven, Marrith and Talo on Drow Prison
(flag them `zzTemp`) near Nalveth and delete them at the end. Nilonim Vrinn has no Drow Prison token
either (he is on ZZ Arena and Molten Ward): place a temporary one for K4 the same way (P-7-d).

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **K1** | Caven tab | "What do I know about Talo?" | double-click Talo's token → **What I know about them** (2) | 2 | — | the double-click menu vs the hotkey **4**; the Look window's "nothing learned" vs "nothing yet" reading the same (known) | the Look window shows only the story-given facts (none for Talo); the empty-state line seen for real |
| **K2** | Caven tab + GM | "Take a closer look at Talo" | double-click → **Take a closer look** (2) → blind rolls happen on the GM | 2 | own dice: **cannot** — blind rolls are rolled for you by design; confirm the chat says only "privately rolled some dice" and the player is told this once (the handout line) | the player wants to roll; rate the explanation; a failed rung ends the inspect silently or with the written half-truth | Lone Peak 100 % lands, Groundstruck ~50 %, one roll per rung (one gesture climbs every rung until the first failure, by design), failure final; an attribute whose stage-1 roll ever failed (Caven: Star Druids) is not rolled again after `resetInspection`, by design; the player tab shows no number; reset after |
| **K3** | Marrith tab | "Inspect Caven" (all told) | as K2 | 2 | — | nothing to roll — does the window say so, or does it look broken? | the three shared facts shown, no roll |
| **K4** | Talo tab | "Study Nilonim: what is this?" | hover + **5** / the HUD eye → Study (1–2) | 2 | own dice: no (blind) | **5** is a hotkey nobody told the player about; the HUD eye path must exist for it too — rate | one knowledge check per creature kind, ever; the Known tab gets a page; the real lock reset after |
| **K5** | Talo tab | "A fact from my Known tab" | sheet → Known tab → a lore row's roll button (1) | 1 | own dice: this one *is* the player's own roll — is it? Check whether Known-tab rolls go through the resolver | the failed-roll message ("you failed") tells them they failed, not what (known) — rate | roll posted, success/failure filed, failure text delivered if written |
| **K6** | GM + a player tab | "Share a fact with one PC" | token HUD flask → Player view → Share switch for Marrith (2) | 2 | — | the whisper lands on Marrith's tab and files the NPC in her Known list | the fact appears in her Look window at once |
| **K7** | GM | "Simulate rolls" | flask → Simulate (1) | 1 | — | writes nothing | preview only; flags unchanged |
| **K8** | Caven tab | "Ties: 8, 7, 6 on a token" | hover Nalveth → **8** → tie cards; **7**; **6** add a tie | 1 each | — | three more hotkeys (Joe's rule: "no hotkeys a player has to be told about") — every one must also be reachable from the HUD or the double-click menu; list which are not (ledger candidate: menu items) | each works; the menu-equivalent exists or is logged |
| **K9** | Caven tab | "Open my journal, add the letter" | the Letter pin → **Add to my journal** (1) | 1 | — | the GM can read every player's journal (known) | the entry copied, 0 secret sentences, highlighted on open |
| **K10** | **No-leak sweep**, each player tab | "Can I see anything I shouldn't?" | with the tab open: (a) the GM presses **9** on an NPC → the description card must not reach the tab; (b) the GM's Study roll (K4) → no number; (c) NPC saves from S2/W13 replayed → totals hidden; (d) the prompt markers from area 9 → not on the canvas, not in the sidebar; (e) another PC's story pin → invisible; (f) the Attributes tab on the sheet → lists only what that PC was told or worked out, with a "nothing yet" line, and no offers or DCs (the tab is present for players; "absent" was wrong); (g) the hidden Fighting Pit lights → off; (h) the Encounters journals → absent | 0 | — | — | every item invisible; the console-only exposure (journal text in `game.journal`) is noted as the accepted limit, not a fail (Joe: console readers are fine) |
| **K11** | Caven tab | "Hotkey 4 on a real keypress" | hover Talo → press **4** | 1 | — | the key reaching the handler from a real keypress was never seen | the Look window opens |

**Restore:** every PC's ties flags to the recorded state; the shares undone (`S.unshare` or the
flag diff); the Known list entries created by K4 removed; the journal entry from K9 deleted.

---

## Area 8 — Exploration: loot, lights, attunement, journal, portals, ghost movement

**Needs:** `ZZ Arena` with ZZ Fighter 5 (tester tab) and a scratch pile `ZZ Footlocker` cloned
from the Guard Footlocker's items (never the real Confiscated piles), one `ZZ Goblin` to kill for a
corpse, the real Prison↔Pit portal pair for the crossing rows (tokens only). The attunement row
(L4) runs on **ZZ Fighter 5, never Talo** (U-8-1): the plan's old premise "Talo has the Staff
away" was stale — on 2026-10-10 Talo holds the Staff of the Woodlands attuned and equipped with
the Pearl of Power and Cloak of Protection (3/3, away list empty), so the row would have had to
*stash* a real PC's attuned staff just to test bringing it back. Out of combat except L7. **Not
concurrently with** any other area that logs in the same tester user (U-1-1 preflight).

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **L1** | Fighter | "Loot the footlocker" | walk adjacent (1) → double-click the pile (1) → **Loot all** (1) | 3 | undo: the GM drags the items back onto the pile (Item Piles); the drop-bin ledger records only items *leaving* a character, so a loot writes no row (U-8-6, P-8-e) | the `distance: 1` rule — a player 10 ft away gets what? (Item Piles' own message); Loot all greyed with no tooltip (known) | everything in the Fighter's inventory, the pile empty, the chat card "<name> picked up …" lists it |
| **L2** | Fighter | "Loot a corpse" | kill the goblin (combat on, 3 clicks) → the eye badge and Dead overlay appear → double-click (1) → take the scimitar (1) | 2 after the kill | — | the GM converting it needs the GM online; healing it back reverts | lootable, items taken, revive button on the GM HUD works |
| **L3** | Fighter | "Take one item, not all" | open the pile → drag one item to the sheet (1) | 1 | — | Item Piles' own UI | one item moves, the rest stay |
| **L4** | Fighter (tester) | "My staff comes back attuned; I can swap attunements" | Setup (GM, eval, 0 player clicks): give the ZZ character three attuned magic items, the middle one a copy of Talo's Staff (`toObject()` of his item, never moved), then `game.pentaryn.attunement.stash(actor, ZZ Footlocker, [staffId])` → the strip shows the broken-chain slot in position 2. Player: open the footlocker and take the Staff (1–2) → it arrives attuned and equipped **in slot 2** (not appended, no 4th slot); right-click a slot to unattune (1); drag an item onto the empty slot (1) | 1 each | — | the strip hides when the sidebar is collapsed (known); over the cap only warns | attuned, equipped, broken-chain badge gone, the item back in its own slot, `getFlag("pentaryn-attunement","slots")` has no duplicate id; Talo untouched |
| **L5** | Fighter | "Light a torch, hood the lantern" | inventory flame (1); hooded lantern hood (1) | 1 each | — | items never burn down (known, accepted) | light on the token; hood dims it |
| **L6** | Fighter | "Cross a portal" | drag onto the Prison→Pit region (1) → the portal card with the thumbnail → confirm (1) | 2 | undo: cross back (2) | the card's description placeholder text on the Molten Ward pair (known, Joe rewrites) | arrives at the Pit's region, centred, faded in; back again |
| **L7** | Fighter | "Walk through a wall while exploring; not in combat" | ghost button under the Ruler (1) → drag through a wall (1) → start a combat → the toast → the button off → drag blocked | 2 | — | after the fight the button stays off until clicked (known) — rate; the GM policy "Exploration only" | passes the wall out of combat; blocked in; toast seen |
| **L8** | Fighter | "A story pin under my own token" | place the Fighter on a pin → click the pin | 1 | — | unclickable with owned-on-top (known): `pinsUnderTokens()` lists none on the Prison; confirm | the placement rule holds on every real scene |
| **L9** | Fighter | "Rename check" | GM renames `ZZ Fighter 5` → `ZZ Fighter Five` | 0 | — | the token label follows (pentaryn-names) | label updated, nickname kept if any |
| **L10** | Fighter | "Cursor tells me the tool" | switch Select / Ruler / Target tools | 0 | — | the real OS cursor image was never observed (known) — look at it on the tab | the cursor changes per tool |
| **L11** | GM | "Party teleport" | the GM party-teleport (1 + confirm) | 2 | — | summons/followers landing on one square when two PCs confirm at once (known) | all PCs moved; followers beside their owners |

**Restore:** ZZ Footlocker and corpse piles deleted, the ledger rows for ZZ actors cleared (L4's
staff copy goes with the ZZ character in case Z), tokens on the real scenes deleted, the Fighter's
name back. Talo is never touched by this area (U-8-1).

---

## Area 9 — Prompt markers (Joe as GM)

**Needs:** the GM tab on `ZZ Arena` (walls: add a 3-wall corner and one door for the LOS panel),
`mcp__foundry__prompt-markers` visible in this session (restart or `/mcp` reconnect if not), a
spec file under `Data/pentaryn-prompts-specs/` deleted afterwards. Players never see any of this
(K10-d checks it). Writes nothing shared beyond what it builds, which it deletes.

| id | Actor | Goal | Steps | Budget | Flexibility | Confusion risks | Pass |
|---|---|---|---|---|---|---|---|
| **PM1** | GM | "Drop a marker and type what should be there" | drag `Prompt · mid` from the folder (1) → the box opens → type → **Cmd/Ctrl+Enter** (1) | 2 | undo: **Shift+Esc** reverts the text; on a fresh drop that removes the new marker, and the footer says so (U-9-9) | the typed-before-the-box-opens buffer (does early typing land?); Esc saves (unusual — rate whether Joe expects Esc to cancel) | the hidden sightless token with the text in its flag |
| **PM2** | GM | "Place at the cursor with P; open with Shift+P" | hover → **P** (1) → type → **Esc** (1); hover it → **Shift+P** (1) | 2 + 1 | — | hotkeys are fine for the GM (Joe's rule is about players) | placed and reopened |
| **PM3** | GM | "Change its size; read what it sees" | size chip (1) → the side panel lists visible tokens/walls; edit a wall while the box is open | 1 | — | the side panel redraws on a wall or door edit while open (0.4.1; confirmed in the 2026-10-11 run, U-9-11) — rate how quickly | size swapped (new marker id — `MARKER_GONE` on a stale replace), panel follows the wall edit without a reopen |
| **PM4** | GM + Claude | "Gather, dry run, replace" | `prompt-markers gather` → write the spec → `replace` with `dryRun` → `replace` | one MCP call each | undo: the dry run is the undo | more than 5 replacements need a dry run first (known); `replace` prefers `id` over `markerId` | the markers replaced by the real things; `MARKER_GONE` / `BAD_SPEC` messages readable |
| **PM5** | GM + Claude | "Build a level-5 character from a marker" | a marker "ZZ Prompt Fighter, Fighter 5, human, longsword" → `character` kind → dry run → replace | 2 MCP calls | — | the dry run builds on an unsaved actor through dnd5e's own advancement; the result lands in which folder? (must be `ZZ usability` by spec option, or moved) | a usable Fighter 5 (compare with the hand-built ZZ Fighter 5: same HP, to-hit); deleted in Z |
| **PM6** | GM | "Doors and Levels" | a marker behind the door → the panel's door line | 0 | — | Levels ignored (known) | "Behind a closed door: …" shown above the fold (U-9-10), and the `door` tag in *Out of sight*; recorded |
| **PM7** | Caven tab (from area 7's K10-d, or here) | "Players see nothing" | with a marker on the viewed scene | 0 | — | — | not on the canvas, not in the sidebar, not in the tracker |

---

## Case Z — cleanup and the final diff

Run once at the very end (and partially after any area that was interrupted).

1. **Actors:** delete every actor in `ZZ usability` (including `ZZ Prompt Fighter`, `ZZ Melee
   Probe` if the builder left it, cloned Fighters, the goblins and the Ogre), the folder itself, any
   form actor in `PC Summons & Forms` created during the run, any compendium-imported conjuration
   copies owned by `ZZ Tester`.
2. **Tokens:** every token on `ZZ Arena`; the fresh PC tokens and NPC tokens placed on real scenes
   (Prison, Pit, Molten Ward, Kharg's Adit) during areas 4–8 — delete by the ids recorded when
   placed, never by name on a real scene.
3. **Scenes and combats:** delete `ZZ Arena`; delete every combat; **Drow Prison active and its
   combat paused** as it was.
4. **Chat:** delete every message created after the pre-run timestamp (record `game.messages`
   count first; the dnd5e 6 cleanup left 446).
5. **Users and journals:** delete `ZZ Tester` and `Player Journals/ZZ Tester's Journal`; delete
   the K9 journal entry; delete the spec file under `pentaryn-prompts-specs/`.
6. **Piles and ledger:** `ZZ Footlocker` and corpse piles gone; ledger rows for ZZ actors cleared;
   the Item Piles default pile still `RReAnOkxHGoZ1Ca7`.
7. **Settings:** `core.diceConfiguration` `{}` on every client used; `dnd5e.attackRollVisibility`
   `"none"`; Argon always-on off; pentaryn-journal GM button off; every `pentaryn-combat` setting
   at the value the ledger says Joe keeps; movement policy "Exploration only".
8. **Real PCs:** diff Marrith, Caven, Talo against the pre-run JSON (HP 69/86/99, slots, uses,
   points, Hit Dice, effects, concentration, ties flags, attunement bonds, `flags.pentaryn-*`). The
   only allowed difference is the documented `enhancedcombathud.weaponSets` seed (H1), and only if
   Joe keeps `seedWeaponSets` on. Anything else is restored by hand and logged.
9. **Tabs:** every player tab (`zz<n>.localhost`, `127.0.0.1`) closed; one GM client.
10. **Docs:** results file written; ledger complete; this plan's status updated; `pentaryn.md`
    gets a dated entry (what was seeded on the PCs, which settings changed, which items were fixed —
    Revivify, the cantrip WIS, anything else).

---

## 4. What the results file must contain

`context/plans/usability-test-results-2026-10.md`, in this order:

1. **Scorecard** — one row per case id (§0's format), grouped by area, with the baseline rows
   from area 1 next to their streamlined counterparts (T2 ↔ A1, B0 ↔ B1, C0 ↔ C1).
2. **Adjustments ledger** — every change made, with the revert.
3. **Streamlining candidates** — not done, with the case that surfaced each and a one-line
   proposal, so Joe can say yes to any of them and have it applied and retested against that
   case id.
4. **Bugs fixed** — the real ones, with the file or actor touched.
5. **Vendor notes** — Argon / dnd5e / Item Piles behaviour we worked around or accepted (the
   picker cue, Scorching Ray's tooltip, the `checkBonus` deprecation, the Flurry card).
6. **Restore proof** — the PC diff, the chat count, the active scene, the tab count.

---

## 5. Workflow tiers for the run

- **Fable:** this plan; the go/no-go on any streamlining candidate that changes a default.
- **Opus:** builds `pentaryn-combat` per `melee-streamlining.md` §14 (phase by phase, node
  tests first), fixes bugs the cases find, reviews the pip/flag reducer at xhigh after area 3.
- **Sonnet:** drives the cases on the real tabs, counts clicks, writes the scorecard rows and the
  restore proof; runs case Z. Effort low for mechanical rows (T7, L9), high for anything that
  touches a real PC.
