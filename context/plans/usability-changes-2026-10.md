# Usability changes — 2026-10 run

Every streamlining change applied during the usability test run (`usability-test-plan-2026-10.md`),
one entry per change: id `U-<area>-<n>`, what and why, files/settings touched, exact revert steps,
how to retest. Proposals (not applied) sit under each area's "Proposals" heading. Append only.

---

## Area 1 — Combat scaffolding and turn flow (fixer pass, 2026-10-10)

The Area 1 run was **blocked**, not failed on a player flow: other areas were already running on
the same world and the same ZZ actors (5 started combats, `ZZ usability druid` active, Talo logged
in elsewhere). T1–T13 and the *before pentaryn-combat* baseline (T1–T3 click counts) are **still
unmeasured** and need a clean re-run once the other areas finish (see U-1-1's preflight).

### U-1-1 — Preflight check before every area (test plan)

- **What / why:** a read-only `eval-js` preflight (active scene is Drow Prison, none of the
  area's actors in any combat, the tester user not already logged in) that an area must pass
  before it creates anything. Area 1 measured nothing because areas overlapped on one world; this
  turns that into an immediate, explicit `blocked` instead of a run that corrupts another.
  Proven live: on the current world it returns `ok:false` with the 5 problems Area 1 hit.
- **Files:** `context/plans/usability-test-plan-2026-10.md` §1 ground rule 10 (new).
- **Revert:** delete ground rule 10 from §1 of the test plan.
- **Retest:** run the snippet in `eval-js` with an area's actor names; with nothing running it
  returns `{ ok: true }`, with another area's combat up it lists that combat.

### U-1-2 — `make login` can open a player tab on 127.0.0.1

- **What / why:** `make login` gained `LOGIN_HOST=127.0.0.1` (CLI `--host`, loopback names only)
  and `NO_OPEN=1` (`--no-open`, already in the CLI, now reachable from make). Player tabs live on
  `127.0.0.1:30000` so their session cookie does not replace the GM's `localhost` one; until now
  every tester wrote a one-off handoff script (`plogin.py`, `talo_login.py`, `lg.py` in the
  scratchpad). Admin calls still go to `FOUNDRY_URL`; only the browser-facing host and the
  redirect change. A non-loopback host is refused (the one-shot handoff server binds to it).
- **Files:** `scripts/foundry/ops/login.py` (`LOOPBACK_HOSTS`, `login(host=…)`, `game_base`),
  `scripts/foundry/ops/cli.py` (`--host`), `Makefile` (`vtt-login login` recipe + comment),
  `context/foundry/ops.md` §2 "Getting into the world" (one example line).
- **Revert:** drop the `host` parameter/`LOOPBACK_HOSTS`/`game_base` in `login.py` (use
  `f"{base_url}/game"` again in `_handoff(...)` and the success line), remove the `--host`
  argument and `host=args.host` in `cli.py`, remove `$(if $(LOGIN_HOST)…) $(if $(NO_OPEN)…)` and
  the comment line from the Makefile recipe, and the example line in `ops.md`.
- **Retest:** `make -n login USER_NAME=Talo LOGIN_HOST=127.0.0.1 NO_OPEN=1` expands to
  `… login --user "Talo" --host "127.0.0.1" --no-open`; run it for real only when no one else is
  logged in as that user, open the printed URL once, and land in `http://127.0.0.1:30000/game` as
  the player while the GM tab on `localhost` stays logged in. `--host evil.example` is refused.
  (Not run live in this pass: Talo was logged in by another area.)

### U-1-3 (bug fix, logged for revert context) — stacked Light weapons get their off-hand attack

- **What / why:** a stack such as the Barbarian's **Handaxe x2** (one item line, quantity 2) never
  offered the off-hand follow-up (nor a Nick swing for a stacked Nick weapon), because the partner
  weapon had to be a *different item id*. PHB Light property: the extra attack is made "with a
  different Light weapon" — two handaxes are two weapons. A different qualifying item is still
  preferred; the same item only qualifies when its quantity is 2+.
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (new `partnerWeapon()`, used by
  `extraSwings()` and `followUps()`), `foundry/module/pentaryn-combat/shapes.mjs` (`quantity` on
  the weapon shape), `foundry/module/pentaryn-combat/test/run.mjs` (fixtures `128s1`–`128s5`).
  Synced; GM client reloaded. Player tabs other areas have open need a reload to pick it up.
- **Revert:** in `extraSwings` use `weapons.find(w => w.id !== main.id && nickCapable(w, { enhancedDualWielding }))`,
  in `followUps` use `weapons.find(w => w.id !== lightUsed.id && offhandCapable(w, { enhancedDualWielding }))`,
  delete `partnerWeapon`, the `quantity` line in `weaponShape`, and fixtures `128s1`–`128s5`;
  `make foundry-combat-check foundry-combat-sync`, reload clients.
- **Retest:** `node foundry/module/pentaryn-combat/test/run.mjs` (203 pass). Live: ZZ Barbarian 5,
  swing the Handaxe (main) → the HUD offers **Off-hand: Handaxe** (Bonus pip); a single Handaxe
  (quantity 1) offers nothing. Verified headless on the live client: `followUps` for ZZ Barbarian 5
  after a Handaxe swing → `offhand:Handaxe`; dnd5e exposes the `offhand` / `thrown-offhand` modes on it.

### Proposals (Area 1) — for Joe to decide

- **P-1-a — One tester user per concurrent area.** §2 "Owner" decided *reuse Talo, create no
  accounts*, on the premise that areas never overlap. The workflow does overlap them, and a second
  login as Talo knocks the first session off. Options: (1) keep the decision and let U-1-1's
  preflight serialize areas (slower, zero world change); (2) create `ZZ Tester 1..N` (TRUSTED,
  throwaway) per area and delete them plus their `Player Journals/` entries in case Z. Trade-off:
  (2) adds users and journals to clean up; (1) costs wall-clock time. Not applied — it reverses a
  recorded decision of Joe's.
- **P-1-b — Per-area actors and scenes.** Concurrent areas also shared `ZZ Fighter 5` etc. If areas
  must run in parallel, each area clones its actors with an area suffix (`ZZ Fighter 5 · A1`) on
  its own scratch scene (`ZZ usability turnflow`), all still under `ZZ usability` so case Z's
  folder delete catches them. Only worth it together with P-1-a; otherwise the preflight is enough.
- **P-1-c — Re-run Area 1 last-of-melee, cleanly.** With the world as it is now, the *before
  pentaryn-combat* baseline cannot be recovered (the module is installed). Proposal: measure T1–T3
  with the pentaryn-combat world settings toggled off (every behaviour is a setting, default on)
  as the stand-in baseline, then on, and say in the report that the baseline is "module present,
  settings off". Needs Joe's OK that this is a fair baseline.
- **Carry-over, not fixed here:** GM console errors were never read in this pass (the Area 1
  preflight did not open the GM console). The orchestrator should read them once the areas finish.
  Drow Prison must be made the active scene again (paused) in case Z — not done now, because
  another area currently has `ZZ usability druid` active and switching would disturb it.

---

## Area 9 — Prompt markers (fixer pass, 2026-10-10)

The module is `foundry/module/pentaryn-prompts`, now at **0.4.1** (`VERSION` in `geometry-core.mjs` and
`module.json`). `make foundry-prompts-check` passes 403 checks; 16 of them are new, in
`test/usability-fixes.mjs`. The module is synced, and the GM tab had already reloaded to 0.4.1. One
cosmetic follow-up (an AmbientLight is now named "Light" in the MARKER_GONE text) was synced after
that reload. It loads on the GM tab's next reload. Everything was verified live on a scratch scene,
`ZZ usability prompts-fix`, which has since been deleted together with its actor and folder.

To revert the whole module: undo the edits listed below, set the version back to 0.4.0 in both
places, delete `test/usability-fixes.mjs` and its `await import` line in `test/run.mjs`, then run
`make foundry-prompts-sync` and reload the GM tab.

### U-9-1 — The side panel redraws when walls, doors or tokens change

- **What / why:** the open prompt box's side panel showed out-of-date door and wall tags until you
  closed and reopened the box. PM3 saw this when a door changed while the box was open. Now every
  open box on that scene redraws its panel (with a 250 ms debounce) when any of these happen:
  - a wall is created, updated or deleted (this includes opening or closing a door);
  - a token is created or deleted;
  - a token's x, y, elevation, hidden, width, height or level changes;
  - a note is created or deleted.
  The box's own text autosave does not trigger a redraw.
- **Files:**
  - `pentaryn-prompts/dialog.mjs`: `PromptDialog.refreshPanels(sceneId)`, `#panelTimer` and `PANEL_REFRESH_MS`.
  - `pentaryn-prompts/prompts.mjs`: the `refreshPanels` hooks block above `Hooks.once("setup", …)`.
  - `pentaryn-prompts/README.md`: the side panel bullet. The "does not refresh" known gap is removed.
- **Revert:** delete the hooks block (the `refreshPanels` const, the `MOVED` const, the `for … Hooks.on`
  loop and `Hooks.on("updateToken", …)`) from `prompts.mjs`. Delete `static refreshPanels`,
  `#panelTimer` and `PANEL_REFRESH_MS` from `dialog.mjs`. Sync and reload the GM tab.
- **Retest:** open a marker's box on a scene with a token nearby, then do each step in turn:
  1. Add a wall between them. Within about a quarter second the token moves under *Out of sight*.
  2. Turn the wall into a door and open it. The token returns to *In sight*.
  3. Move a token. Its distance updates.
  Verified live with all three, scripted.

### U-9-2 — `character` replacements take a `folder`

- **What / why:** a built character always landed in `Foundry MCP Characters`, so the tester had to move
  ZZ Prompt Fighter into the test set's folder by hand. `with.folder` takes an Actor folder id or a
  name. A named folder that does not exist yet is created. If you leave `folder` out, the behaviour
  is the same as before.
- **Files:**
  - `pentaryn-prompts/character.mjs`: new `characterFolder()`, used by `buildCharacter`.
  - `pentaryn-prompts/README.md`: the `character` key list.
  - `context/foundry/prompt-markers.md`: the character example (`folder:` line) and the "Say where new actors landed" line.
- **Revert:** in `buildCharacter`, replace `await characterFolder(w.folder)` with the old
  find-or-create on `CHARACTER_FOLDER`. Delete `characterFolder()` and the doc lines. Sync.
- **Retest:** run a `character` replace with `folder: "ZZ usability"`. The actor shows up in that
  folder. Verified live: Fighter 1 went to `ZZ usability prompts-fix` and was then deleted.

### U-9-3 (bug fix, logged for revert context) — MARKER_GONE says why the marker is gone

- **What / why:** before, a replace that pointed at a marker that was already gone printed
  `p1 no longer on ZZ Arena (markerDeleted=false)`. That gave no hint that p1 had already been
  replaced, and it read as if the marker were still there. Now the message names the cause:
  - `p1 was already replaced on <scene> (now Token "ZZ Goblin" [id])`: a document on the scene has
    provenance pointing at that marker;
  - `p1 was resized on <scene> (now marker <id>)`: a size chip swapped the marker for a new one. The
    swap now stamps `flags.pentaryn-prompts.swappedFrom` on the new marker, and the lookup follows
    the chain of swaps;
  - otherwise, `deleted, or replaced outside this module`.
  A MARKER_GONE row no longer carries the `(markerDeleted=…)` suffix.
- **Files:**
  - `replace.mjs`: `whyGone()`. `resolveOne` now sets `e.scene` before the marker check.
  - `readback-core.mjs`: `goneMessage()` and the suffix rule in `renderReplace`.
  - `dialog.mjs`: `#onSize` stamps `swappedFrom`.
  - `context/foundry/prompt-markers.md`: the MARKER_GONE row of the error table.
- **Revert:** throw ``codedError("MARKER_GONE", `${e.pid ?? markerId} no longer on ${scene.name}`)``
  again in `resolveOne`. Drop `whyGone`, the `swappedFrom` line in `dialog.mjs` and the
  `r.code === "MARKER_GONE"` condition in `renderReplace`.
- **Retest:** replace p1, then replace p1 again; the second readback says "already replaced". Resize
  a marker with a chip, then replace its old id; the readback says "resized … (now marker X)".
  Both verified live.

### U-9-4 (bug fix) — A failed dry run no longer prints `remaining: none`

- **What / why:** when every row failed before its scene was resolved (a stale `call`, a bad spec),
  `remaining` came back empty and printed `none`, which read as if everything had been built. The
  line now says `remaining: unknown (no replacement reached a scene; gather again)`. A row that
  fails with MARKER_GONE now still counts its scene, so it prints the real number.
- **Files:** `readback-core.mjs` (`remainingLine()`), `replace.mjs` (`e.scene` set early).
- **Revert:** restore the two inline `remaining` lines in `renderReplace`. Remove `remainingLine`.
- **Retest:** `replaceMany({call: "pm-nope", replacements: [{call: "pm-nope", id: "p1", with: {kind: "none"}}], dryRun: true})`
  prints `remaining: unknown …`. Verified live.

### U-9-5 (bug fix) — The over-5 dry-run guard counts every replacement the call asks for

- **What / why:** the guard counted only the replacements that validated. A batch of 6 with 5 stale
  ids skipped the guard, and the one valid replacement was written for real. The README and the
  playbook both say "more than 5 replacements", so the guard now counts `replacements.length`.
  After a dry run of the same set, the call runs as before, and `skipDryRun` (the bridge) is unchanged.
- **Files:** `readback-core.mjs` (`needsDryRun()`), `replace.mjs`, `README.md`,
  `context/foundry/prompt-markers.md` (one sentence each).
- **Revert:** in `replaceMany`, go back to
  `okCount = entries.filter(e => e.ok).length; if (okCount > DRY_RUN_OVER && …)`.
- **Retest:** send six replacements where five share a stale id. The call throws `DRY_RUN_REQUIRED`
  and nothing is written. Verified live: the sixth marker was still on the scene afterwards.

### Proposals (Area 9) — for Joe to decide

- **P-9-a — Player-style defaults for an unspecified `character`.** Today a Fighter with no choices
  gets the first item of each pool: Archery, the first Versatile feat (Alert), and Club, Dagger and
  Dart masteries. STR comes out at 19 (15 + 2 from the background, + 2 from the ASI). Every one of
  these is reported as DEFAULTED, so nothing is hidden, but the result is a poor sheet. Options:
  - (a) Pick masteries from the weapons the character carries (`items` or starting equipment).
  - (b) Choose the Fighting Style from the gear: a shield gives Defense, a two-hander gives Great
    Weapon Fighting, and no ranged weapon rules out Archery.
  - (c) Add a `preset: "martial-longsword-shield"` shorthand.
  This needs changes to `character.mjs` `chooseData` (ItemChoice and Trait). Those changes also
  affect the dry-run preview, so it is medium risk and was not applied. It only matters for GM and
  test builds; players never see it.
- **P-9-b — Cap the gather text on crowded scenes.** On a busy arena (21 built things) the gather
  runs to about 5k tokens. Option: a `builtCap` (for example, the 8 nearest built things per
  encounter, with the rest as a "+N more context-only" line), or fold built things that are only
  context into one line each. Not applied because it changes what Claude sees when it plans
  replacements.
- **P-9-c — Esc saves (no change made).** The footer already reads "Esc saves · ⌘⏎ saves · ⇧Esc undoes".
  Esc saving is deliberate: the playtest showed that losing typed text is worse than having to undo.
  If Joe keeps reaching for Esc to cancel, the alternative is to swap the two (Esc reverts, Shift+Esc
  saves) in `dialog.mjs` `#onKey` and `lang/en.json` `dialog.hint`.
- **Joe action (not code):** the `mcp__foundry__prompt-markers` tool was missing from the tester's
  session. Run `/mcp` and reconnect `foundry`.
- **For the global Z (not Area 9):** at the end of the run, the active scene was `ZZ usability druid`
  and the game was unpaused, both caused by other areas. The final cleanup must reactivate and pause
  Drow Prison. Case Z itself is still open.

---

## Area 6 — Wizard (Caven) (fixer pass, 2026-10-10)

The tester's live HUD cases W1, W2, W5, W7–W10, W12–W14 were **blocked** (no Caven player tab).
No bug was confirmed. Checked statically and then live on the GM client: Projected Ward's
consumption target (a compendium UUID in the source) is remapped by dnd5e to Caven's Arcane Ward
item at prepare time, with no preparation warning, so it works. The Ring of Spell Storing's cast
activities exist; whether they show on the HUD and use no slot is still for the live re-run.

### U-6-1 — Arcane Ward activities renamed for players (data, Caven only)

- **What / why:** the stock PHB names read badly on a HUD button. "Damage Ward" sounds like
  dealing damage to it, and "Restore Ward HP After Casting Spell" is long enough to truncate.
  Item `Arcane Ward` (`LBwPXkJyx83Aj3lv`) on Caven (`IxcfWOvpcKID6bdn`):
  - `jiueqesjid1T7uCk` "Damage Ward" → **"Ward Takes Damage"**
  - `bzJ9CvhHEhMJMBH5` "Restore Ward HP After Casting Spell" → **"Restore Ward (Abjuration Cast)"**
  - `gfUOIb6wmIKrXloQ` "Expend Spell Slot for Ward" → **"Restore Ward (Spend Slot)"**
  - "Create Ward" and Projected Ward's "Project Ward" are unchanged (they already match the PHB).
  The item's GM "Foundry Note" (the `<strong>` names in its description) was updated to match.
  Nothing mechanical changed: activation types, consumption and uses are as they were.
- **Files / settings:** world data only (Caven's actor). No repo files.
- **Revert** (eval-js as GM):
  ```js
  const i = game.actors.get("IxcfWOvpcKID6bdn").items.get("LBwPXkJyx83Aj3lv");
  const back = { jiueqesjid1T7uCk: ["Ward Takes Damage", "Damage Ward"],
    bzJ9CvhHEhMJMBH5: ["Restore Ward (Abjuration Cast)", "Restore Ward HP After Casting Spell"],
    gfUOIb6wmIKrXloQ: ["Restore Ward (Spend Slot)", "Expend Spell Slot for Ward"] };
  const upd = {}; let d = i._source.system.description.value;
  for (const [id, [now, was]] of Object.entries(back)) {
    upd[`system.activities.${id}.name`] = was; d = d.replace(`<strong>${now}</strong>`, `<strong>${was}</strong>`);
  }
  upd["system.description.value"] = d; await i.update(upd);
  ```
- **Retest:** W4. On the Caven player tab, open the Free (Special) panel. The four Ward buttons
  should read Create Ward / Ward Takes Damage / Restore Ward (Abjuration Cast) / Restore Ward
  (Spend Slot), with no truncation. Rate whether a new player knows which to click when hit.

### U-6-2 — Ritual Adept: a "Rituals (no slot)" group on the HUD, and no slot by default

- **What / why:** Argon's dnd5e Cast Spell panel shows only prepared spells for a wizard. Its
  actor flag `enhancedcombathud-dnd5e.showPrepared`, when unset, means prepared only. All 9 of
  Caven's ritual spells are unprepared: Alarm, Comprehend Languages, Detect Magic, Find Familiar,
  Identify, Gentle Repose, Leomund's Tiny Hut, Phantom Steed and Rary's Telepathic Bond. So he
  could not reach any of them from the HUD. Also, dnd5e starts every leveled cast with *Consume
  Spell Slot* ticked, even though an unprepared spell can only be a ritual (2024 PHB Ritual Adept:
  any Ritual-tagged spell in the spellbook, no preparation needed, cast from the book).
  Now, for an actor with **Ritual Adept** only:
  1. The **Action** bar's Cast Spell panel gets one extra accordion group, **"Rituals (no slot)"**,
     listing those unprepared ritual spells by level, then name. Prepared rituals stay where they
     were. Only the Action bar gets the group, never Bonus/Reaction/Special.
  2. Casting one of those spells, from the HUD *or* the sheet, opens dnd5e's normal dialog with
     *Consume Spell Slot* **unticked**. The player can tick it to spend a slot anyway. Prepared
     spells are untouched, so Shield still defaults to spending a slot (verified).
  Nothing in Argon's files was edited. `rituals.mjs` wraps Argon's base
  `ButtonPanelButton.prototype._renderInner` and adds the group to the button's `_spells` before
  Argon builds the panel. It also hooks `dnd5e.preUseActivity`. The wrap is registered in
  `foundry/adjustments.yml` as `riders-argon-ritual-adept-list`. It lives in `pentaryn-riders`
  (feature-keyed riders) and is imported from `riders.mjs`, so `module.json` did not change and
  Foundry did not need a restart.
- **Files / settings:** new `foundry/module/pentaryn-riders/rituals-core.mjs` (pure),
  `rituals.mjs` (glue) and `test/rituals.mjs` (19 fixtures). One import line in `riders.mjs`. One
  `await import("./rituals.mjs")` line at the end of `test/run.mjs`. Lang keys
  `PENTARYN_RIDERS.settings.rituals.*` and `PENTARYN_RIDERS.rituals.group` in `lang/en.json`. A row
  in `foundry/adjustments.yml`. A new world setting, **Settings → Pentaryn Feature Riders → "Ritual
  Adept rituals"** (`pentaryn-riders.rituals`, default on). The W3 row and the Area 6 *Needs* in
  `usability-test-plan-2026-10.md` were updated to match.
- **Revert:** quickest is to switch the setting off and reload. Both behaviours stop: Argon is back
  to prepared only and the slot is ticked again. For a full revert, delete `rituals-core.mjs`,
  `rituals.mjs` and `test/rituals.mjs`. Then remove the `import "./rituals.mjs";` line (and its
  comment) from `riders.mjs`, the last two lines of `test/run.mjs`, the `rituals` keys from
  `lang/en.json` and the `riders-argon-ritual-adept-list` row from `adjustments.yml`. Run
  `make foundry-riders-check foundry-riders-sync` and reload the clients.
- **Retest:** run `node foundry/module/pentaryn-riders/test/run.mjs`, which gives riders-core
  passed plus rituals-core 19 passed. Already verified live on the GM client, with the HUD bound to
  Caven and then unbound. The Action Cast Spell panel showed Cantrip…6th Level plus "Rituals (no
  slot) (9)", and the group's text rendered in the panel. Using unprepared Identify gave
  `consume.spellSlot:false`, and prepared Shield gave `true`. A real Detect Magic use (no chat card)
  left the L1 slots at 2/4. Its concentration was removed afterwards, so Caven's state is as
  before. Still to check on the **Caven player tab** (W3): open Cast Spell, find the group, click
  Detect Magic and see the box unticked. Confirm that ticking it spends a slot. Other areas'
  open player tabs need a reload to load this.

### Proposals (Area 6) — for Joe to decide

- **P-6-a — Arcane Ward absorbs damage by itself.** Today the player (or GM) must click "Ward
  Takes Damage" and type the amount. dnd5e's `dnd5e.preApplyDamage` could take damage from the
  ward's uses first, then HP, when Caven is hit through the damage tray. It would apply
  resistances first, per the PHB, and the tray row would note "Ward absorbed N". Projected Ward
  could be offered on the tray row of an ally within 30 ft. Not applied, for two reasons: it
  changes what Apply does to a real PC's HP, and it needs a live tray test. Lower-risk
  alternative: show the ward's HP as a badge on the HUD portrait, as the W4 plan cell asks. Neither
  is built.
- **P-6-b — W15, the Allosaurus stray.** Token `3MOg1yNcRGsrJtBj` on "Surface — Kharg's Adit"
  (empty texture) and form actor "Caven Calderon (Allosaurus)" `zRTdAW9xtjnoMYzr` are left over
  from a pre-upgrade Wild Shape test. It is not a player flow. Delete both, or keep them as a
  record? Left untouched.
- **P-6-c — Re-run Area 6 live.** The blocked cases need the Caven player tab on 127.0.0.1. U-1-2
  (`make login … LOGIN_HOST=127.0.0.1`) now provides it. The Area 6 *Needs* now says to snapshot
  at the start of the run and restore to that snapshot, not to fixed numbers, and where to get a
  torch for W11.
- **Carry-over:** the GM console has still not been checked for errors on this area. The ritual
  and slot checks above ran through `eval-js` without throwing.

---

## Area 8 — Exploration: loot, lights, attunement, journal, portals, ghost movement (fixer pass, 2026-10-10)

The Area 8 run was mostly **blocked**: all four users were already logged in by other areas, so
no player-click case could start. L2 (corpse pile), L8 (no story pin under a player token on any
real scene) and L9 (rename follows) passed GM-side. One real bug came out of it: Talo's slot flag.

### U-8-1 — L4 attunement row runs on ZZ Fighter 5, not on Talo (test plan)

- **What / why:** the plan said Talo "has the Staff away"; live he holds the Staff of the
  Woodlands attuned and equipped (3/3 with Pearl of Power and Cloak of Protection, away list
  empty). Running L4 as written would have meant stashing a real PC's attuned staff first. The row
  now stages the away state on ZZ Fighter 5 with a *copy* of the Staff (`toObject()`, never moved)
  via `game.pentaryn.attunement.stash(…)` into ZZ Footlocker, and the player takes it back. The pass
  criteria gained "back in its own slot, no duplicate id in the slots flag" so the U-8-2 fix is
  checked through the real player route. Talo is never touched by Area 8.
- **Files:** `context/plans/usability-test-plan-2026-10.md` — Area 8 *Needs* paragraph, row L4,
  and the *Restore* line.
- **Revert:** restore those three passages from git (`git diff context/plans/usability-test-plan-2026-10.md`
  shows them; the old L4 actor was "Talo (real)", steps "GM moves the Staff from the away state to
  his inventory → drag the Staff to a slot (1) → right-click to remove (1)").
- **Retest:** run L4 as now written; Talo's `pentaryn-attunement` flags before and after are
  identical.

### U-8-2 (bug fix, logged for revert context) — an attuned item coming home is written into its slot once

- **What / why:** when a stashed (away) attuned item came back, `onCreateItemBond` swapped the
  `away:<key>` marker for the new item id *after* `computeSlots` had already placed that same id
  (the item arrives attuned, its away entry still listed) — into the first empty slot, or as an
  extra slot when the strip was full. The slots flag got the id twice. Talo's flag was exactly that:
  `[Staff, Cloak, Pearl, Staff]`. The render dedupes (first occurrence wins), so the sheet looked
  right with a full strip; with an earlier empty slot the item would have landed in that empty slot
  instead of the one it left. New pure `homeSlots()` puts the id where the marker was and clears
  the stray copy.
- **Files:** `foundry/module/pentaryn-attunement/attunement.mjs` (`homeSlots()`, used in
  `onCreateItemBond`, exported), `foundry/module/pentaryn-attunement/test/run.mjs` (4 fixtures
  under "Coming home"; 35 pass). Synced, GM client reloaded.
- **Data fix (Talo, `pfCQRWnqsQjkZQnB`):** `flags.pentaryn-attunement.slots`
  `["ESrNBPUFvPb9WkEo","J9H4sSVTkKt6kLQP","Nc7CKI5lowpW8RZb","ESrNBPUFvPb9WkEo"]` →
  `["ESrNBPUFvPb9WkEo","J9H4sSVTkKt6kLQP","Nc7CKI5lowpW8RZb"]` (Staff, Cloak, Pearl). What the
  sheet shows is unchanged. **Case Z:** this differs from the pre-run snapshot on purpose. Do not
  restore the duplicate.
- **Revert:** in `onCreateItemBond` use
  `computeSlots(actor).slots.map(id => (id === AWAY + bond.key) ? item.id : id)` again, delete
  `homeSlots` and its export and the "Coming home" fixtures; `make foundry-attunement-check
  foundry-attunement-sync`, reload clients. The data fix needs no revert (the old value only had
  the duplicate).
- **Retest:** `node foundry/module/pentaryn-attunement/test/run.mjs`. Live (done, throwaway actors
  deleted): a character with A, B, C attuned, `stash` B into a box → `[A, away:…, C]`, then create
  the box's copy back on the character → flag `[A, B, C]`, B attuned, away list empty. Before the
  fix the same steps write `[A, B, C, B]`.

### Proposals (Area 8) — for Joe to decide

- **P-8-a — Bridge drops were GM reloads by other fixers, not a bridge bug.** Both "Connection
  closed" / "module not connected" episodes (19:49:45 and 19:50:36 UTC in
  `foundry/logs/mcp-2026-10.jsonl`) came 0.3 s after another fixer's `location.reload()` eval on the
  GM tab. Every in-flight eval fails, and long ones (25 s+ polls) are simply the most likely to be
  in flight. A 30 s eval run alone completed normally. Window-scoped helpers (`zz3` etc.) are also
  lost on reload. Proposal for the workflow, not the code: (1) fixers sync but leave the GM reload
  to one step at the end of the fixer phase, or announce it; (2) testers retry once on
  `Connection closed` and rebuild their helpers; (3) poll with several short evals rather than one
  long one. The bridge (separate repo `foundry-vtt-mcp`) is not changed.
- **P-8-b — Parallel player areas need their own users and hosts.** Same root as P-1-a / P-1-b
  (one Talo shared by every area; a second `127.0.0.1` tab silently became another user because
  cookies are per host). Area 8 adds one data point: `<name>.localhost` hosts (e.g.
  `zz5.localhost:30000`) each get a separate cookie jar in Chrome and Foundry serves them. If Joe
  picks P-1-a option 2, `make login` could accept `*.localhost` in `LOOPBACK_HOSTS` (the handoff
  server would still bind to `127.0.0.1` and only the URL would use the name). Not applied:
  test-infrastructure only, it touches U-1-2's code, and it only matters if areas stay parallel.
- **P-8-c — Distinct token portraits for the ZZ characters.** Ten ZZ characters with the same
  mystery-man portrait make Argon's "Your creatures" strip unreadable for the tester (real PCs all
  have their own art, so players never see this). Proposal: the §2 build step sets each ZZ actor's
  `img`/`prototypeToken.texture.src` to a distinct core icon (e.g. `icons/svg/sword.svg` Fighter,
  `icons/svg/daze.svg` Rogue, …). Not applied live: other areas are running on those actors.
- **P-8-d — L7 and L11 need a scratch home.** L7 (ghost movement) flips a single world setting,
  so it collides with any other area's combat; L11 (party teleport) moves real PCs on a real scene.
  Proposal: run both last, alone, after every combat area has finished, L11 on a scratch copy of
  the portal scene with ZZ tokens only.
- **Carry-over:** the GM tab's console errors were still not read (the Chrome tab group visible to
  this fixer holds only another area's `zz5.localhost` player tab, not the GM bridge tab). The
  orchestrator should read them once at the end. L1, L3, L4, L5, L6, L7, L10 and L11 still need
  a clean run.

## Area 2 — Melee: Full Attack, Extra Attack, off-hand (fixer pass, 2026-10-10)

Area 2 ran A0, A1, A3 and A6/H1 by API; A2, A4–A12, P (own dice) and R (settings off) were
**blocked** by the overlapping areas and still need a clean run. Both bugs it reported are
explained below; neither was a fault in the swing counting itself.

### U-2-1 (bug fix, logged for revert context) — Esc on a swing's roll dialog pauses at once

- **What / why:** dnd5e's roll dialog autofocuses its default **Normal** button
  (`templates/dice/roll-buttons.hbs`, `autofocus`), and Foundry's `KeyboardManager.hasFocus`
  treats a focused *form button* like a text field and ignores every keybinding, Esc included.
  So the first Esc on a fresh swing dialog did nothing until the player clicked inside the dialog,
  and the pause bar never appeared. Proven on the live GM client: fresh dialog → `activeElement`
  = `BUTTON[data-action=roll]` in a form, `game.keyboard.hasFocus` = true, Esc → dialog stays open;
  with the patch and a running strip, the same Esc closes it (→ the sequence pauses). Now, while a
  Full Attack / follow-up is **running**, Esc whose target is a button inside a dnd5e
  `.roll-configuration` dialog (attack or damage) closes that dialog. Text fields and selects keep
  their native Esc; outside a sequence nothing changes.
- **Files:** `foundry/module/pentaryn-combat/strip.mjs` (`rollDialogOf()`, `onKey()` running branch).
- **Revert:** restore `onKey` to the paused-only version
  (`if (ev.key !== "Escape" || !el || lastCtx?.status !== "paused") return; …choose({type:"stop"})`)
  and delete `rollDialogOf`; `make foundry-combat-check foundry-combat-sync`; reload clients.
- **Retest:** Full Attack on a target; when swing 1's dialog opens press Esc **without clicking** →
  dialog closes and the pause bar shows (Resume / New target / Stop); Esc again → Stop. Typing in
  the dialog's situational-bonus field and pressing Esc does not close it (native).

### U-2-2 — The swing strip lets clicks through while you pick a new target

- **What / why:** the strip / pause bar sits just above the HUD, over the lower token row, so on
  **New target** the tokens a player needed were under it (Area 2 had to pan the canvas). While
  the target picker is open the strip now fades (35 %) and is click-through; only its **Stop**
  button stays clickable (the no-Argon fallback picker is cancelled with Stop). It comes back the
  moment the pick is made or cancelled.
- **Files:** `foundry/module/pentaryn-combat/strip.mjs` (`picking()`),
  `foundry/module/pentaryn-combat/sequence.mjs` (retarget branch wraps `pickTarget` in
  `strip.picking(true/false)`), `foundry/module/pentaryn-combat/styles/combat.css`
  (`.pentaryn-combat-strip.picking`, `.picking .pc-stop`).
- **Revert:** in `sequence.mjs` go back to `const picked = await pickTarget(act);` (drop the
  `strip.picking` lines), delete `picking()` from `strip.mjs` and the two `.picking` CSS rules;
  check + sync; reload clients.
- **Retest:** Full Attack, Esc → **New target** → the strip fades and a token under it can be
  clicked/targeted; the strip returns at full opacity with the new target named. Verified on the
  live GM client with the served CSS: picking → strip `pointer-events:none`, Stop `auto`, after → `auto`.

### Bug note (no separate change) — the turn flag ending at swings=1, crit=false

- Swing 2's write read a *fresh* turn, i.e. its turn key differed from swing 1's. The key came
  from `game.combat`, the combat **this client views**; at 19:45–19:46 other areas activated their
  own scenes and combats (`foundry/logs/mcp-2026-10.jsonl`: "Activate druid scene…", "Activate my
  combat…"), which flips every player's viewed combat mid-sequence. The Area 4 fixer's
  `pickCombat()` / `combatOf()` (combat-core.mjs, shapes.mjs; fixtures 240–246) now keys the turn by
  the started combat the actor is actually in, which covers this. Retest: Full Attack with a crit
  on swing 1; while dialog 2 is open, activate another scene/combat from the GM; roll swing 2 →
  `game.pentaryn.combat.turn(actor).attackAction` shows `swings: 2, crit: true`.

### Proposals (Area 2) — for Joe to decide

- **P-2-a — Say "Enter rolls Normal" in the help line.** Because of the autofocus above, Enter on
  a fresh swing dialog should already roll Normal (no mouse travel). Synthetic key events cannot
  prove a native button press, so this is unverified: press Enter on swing 1's dialog by hand; if
  it rolls, change `PENTARYN_COMBAT.Hud.FullAttackHint` in `lang/en.json` to start "Enter rolls
  each swing Normal."
- **P-2-b — Skip Argon's Target Picker Tutorial.** It is a client setting
  (`enhancedcombathud.targetPickerGuideShown`, per browser) and costs one Confirm click the first
  time a player picks a target — likely mid-combat at the table. Option: pentaryn-combat sets it
  true on `ready` for every client (one line, revert = delete the line; the guide text lives in our
  strip hint already). Not applied: it removes Argon's own onboarding for everyone, including the
  "Right click to cancel" and "+/−" tips.
- **P-2-c — Control the active combatant's token on turn start (players).** A player who owns many
  actors (Talo: 27 summons/forms) can have another token's HUD up when their turn starts. Option:
  on `combatTurnChange`, a non-GM client that owns the new combatant's token controls it (and
  Argon follows). Not applied: it takes control away from whatever the player was doing and may
  fight other modules; wants a world setting and a table test.
- **P-2-d — Esc closes any dnd5e roll dialog, not only during a sequence.** The autofocus trap
  hits every single attack, save and check dialog too. U-2-1 is scoped to sequences to stay
  narrow; widening it is a one-line condition change in `strip.mjs` (or its own small listener).
- **P-2-e — Picker click without a hover.** Area 2 saw a pick click that did not register without
  a prior hover; that is Argon's picker (it targets the hovered token). Nothing of ours to change;
  if it recurs at the table, press **T** over the token instead.
- **Concurrency:** same as P-1-a / P-1-b; Area 2 lost most of its run to shared tabs, scenes and
  the GM bridge.
- **Carry-over:** the GM tab and player tabs were **not reloaded** by this fixer: other areas were
  mid-run on them (a RollResolver open on the GM tab, Caven/Marrith/Talo logged in). U-2-1/U-2-2
  are synced to disk and take effect on the next reload of each tab. Ogre HP on ZZ Arena (68) was
  not touched.

---

## Area 4 — Druid: Wild Shape, Starry Form, Multiattack (fixer pass, 2026-10-10)

Area 4 ran D1 (pass), D2 (friction) and saw D14 in passing; D3–D13, D15 and G2 were **blocked** by
the overlapping areas and still need a clean run. Its two pentaryn-combat bugs are explained below:
one was a real fault, now fixed, and the other is Argon's target picker.

### U-4-0 (bug fix, logged for revert context) — swings count in the actor's own combat, not the viewed one

- **What / why:** D2's bear made 2 swings and the pips and the Full Attack badge still read 2. The
  turn flag was written under `nocombat`. `combatContext()` took the combat from `game.combat`,
  which is only the combat this client **views** in the tracker. Foundry flips every client's view
  when a GM activates another encounter (`Combat#_onUpdate` → `ui.combat.render({combat})`). After
  that flip, the bear's swings no longer counted as "in combat". It happened because other areas
  activated their own combats, but a table can hit it too: two encounters on two scenes, or a
  player clicking through the tracker's combat tabs. It also explains Area 2's swings=1/crit=false
  flag. This was proven live before the fix: Marrith was the current combatant of the started
  "ZZ usability sorcerer" combat, but the GM client viewed the melee-riders combat, and
  `game.pentaryn.combat.turn(Marrith).key` returned `"nocombat"`. After the fix it returns
  `"SgZH2XY7UQLJSK5Z:1:pufaiZ3bXVLyKEy1"`, while ZZ Fighter 5, who is in both combats, still keys to
  the viewed one. The combat is now the started combat that holds the actor. The order of
  preference is: the viewed combat, then an active one on the actor's scene, then any active one,
  then one on its scene, then the first. The same fix went into pentaryn-transform's
  bonus-action mark (`markBonusUsed` / `bonusUsedNow`). That mark greys the Bonus pip after a
  shift or a revert, and it also read `game.combat`.
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`pickCombat()`, new),
  `foundry/module/pentaryn-combat/shapes.mjs` (`combatOf()`, used by `combatContext()`),
  `foundry/module/pentaryn-combat/test/run.mjs` (fixtures 240–246),
  `foundry/module/pentaryn-transform/transform.mjs` (`markBonusUsed`, `bonusUsedNow`). Both modules
  checked and synced. The GM tab was reloaded and verified as above. Player tabs pick it up on
  their next reload.
- **Revert:** in `shapes.mjs` delete `combatOf()` and go back to `const combat = game.combat ?? null;`
  in `combatContext`. Delete `pickCombat` from `combat-core.mjs`, and delete fixtures 240–246 and
  `pickCombat` from the import list in `test/run.mjs`. In `transform.mjs`, use `const c = game.combat;`
  in both functions again, with the old `c.combatant?.tokenId !== token.id` /
  `bonusMark.combat === c.id` checks. Then run `make foundry-combat-check foundry-combat-sync
  foundry-transform-check foundry-transform-sync` and reload clients.
- **Retest:** this is D2 with a twist. Set up two started combats: one holds Talo's token, and the
  GM *activates* the other one. The bear does Full Attack, Bite and then Claw. The pips should go
  2 → 1 → 0, the badge should go to 0, and `game.pentaryn.combat.turn(bear).key` should start with
  the bear's combat id. For the transform part: shift on Talo's turn while the other combat is
  viewed, and the Bonus pip stays grey on the bear's HUD.

### U-4-1 — The form's text-only Multiattack button is hidden when Full Attack runs it

- **What / why:** on a Wild Shape bar, Full Attack (pentaryn-combat) and a **Multiattack** button
  (pentaryn-transform's front row) sat side by side. The Multiattack button only posts the stat-block
  text, so it was a redundant second click target (D1/D2 friction). pentaryn-transform now leaves
  the Multiattack item off the front row when all of these hold:
  - pentaryn-combat is active.
  - Its `fullAttack` and `multiattack` settings are on.
  - `game.pentaryn.combat.multiattack(form)` parsed that very item into 2+ swings.

  In every other case the button stays: an unparsed Multiattack, a flag override, or the module or
  a setting off. Argon's "Use Feature" drawer that held only Multiattack is still dropped as
  before. Its id counts as covered, so the drawer doesn't come back either. The stat-block text is
  still on the sheet, and the Full Attack tooltip names the swings (Bite, Claw). Parse checked
  read-only on an in-memory Brown Bear: source `mmMultiattack000`, total 2, Bite 1 + Claw 1.
  **Not yet seen on a live bear HUD.** Confirm it in the D2 rerun.
- **Files:** `foundry/module/pentaryn-transform/hud.mjs` (`multiattackCoveredByFullAttack()`, and
  `composeActionBar` filters `ids` and adds the covered id to `front`).
- **Revert:** in `composeActionBar`, delete the `covered` line and use
  `const ids = frontRowItems(actor.items.contents, onBar);` and `const front = [...onBar, ...ids];`
  again. Delete `multiattackCoveredByFullAttack()`. Then
  `make foundry-transform-check foundry-transform-sync` and reload clients. With no code change,
  turning the `pentaryn-combat` → `multiattack` setting off also brings the button back, but that
  removes Full Attack for NPCs and forms too.
- **Retest:** for D1, shift into a Brown Bear. The Action bar should read Full Attack, Bite, Claw,
  with no Multiattack button and no Use Feature drawer. Then set `pentaryn-combat.multiattack` off
  and re-render: the Multiattack button is back and Full Attack is gone. Set it on again.

### U-4-2 — D14 runs with no ZZ token on the scene (test plan)

- **What / why:** the Talo user owns every ZZ test actor, so any ZZ token made the
  **Your creatures** strip appear by itself, and the D14 discoverability check was spoiled.
- **Files:** `context/plans/usability-test-plan-2026-10.md`, the D14 row (one sentence in
  confusion risks).
- **Revert:** delete the "**Run with no ZZ token on the scene** (U-4-2)…" sentence from the D14 row.
- **Retest:** none; this is a test-plan rule.

### Bug note (no code change) — "Bite by hand opened no dialog" after the Full Attack

- Most likely this is Argon's target picker and not a fault of ours. Joe's world has Argon
  `rangepicker` **and** `rangepickerclear` on (melee-streamlining §2). Every weapon button click,
  Bite included, therefore **clears the current target first** and waits for a token click
  ("0/1 Targets", with no cue until the mouse moves, `pentaryn.md` open item 3). Each further click
  on Bite starts a new picker and ends the previous one unresolved. So "goblin targeted, click Bite
  four times" gives no dialog and no console error, and `running()` stays null, which matches the
  report. The Bite button is Argon dnd5e's own `ItemButton` (`activity.use`). Neither module wraps
  it. Our Full Attack button skips the picker when something is targeted (`targets` getter → 0).
  This was not reproduced on a player tab: Talo was logged in by another run. Retest it in the D2
  rerun: after Full Attack, click Bite once, then click the goblin. The dialog should open. If it
  still doesn't, that is a real bug, so capture the console.

### Proposals (Area 4) — for Joe to decide

- **P-4-a — Keep a pre-target when a weapon is clicked by hand.** This is the root of the "Bite did
  nothing" note above, and it costs one extra click on every one-at-a-time swing for a player who
  targets with **T** first. There are two options:
  1. Turn Argon `rangepickerclear` off (Argon's default). A world setting, revert = on. An
     existing target then goes straight to the dialog. A player who wants a different target must
     target it first, because the picker no longer clears.
  2. Leave the setting alone and make our modules give Argon's weapon buttons the same `targets`
     getter as Full Attack (0 when something is targeted). That is a prototype getter patch on
     Argon dnd5e's closure class, taken from the weapon-set slot the way `hud.mjs` borrows it.

  Not applied: it changes how every single attack targets, which is a table habit Joe should pick.
- **P-4-b — Full Attack with nothing targeted.** Default the target to the last target if it is
  still on the scene and alive, or to the only hostile token in reach. That saves the picker click
  (budget 3 instead of 4). Not applied: auto-targeting the wrong creature is worse than one click.
  It could be a world setting, default off.
- **P-4-c — Target Picker Tutorial.** This is the same as P-2-b, so no duplicate is listed here.
- **P-4-d — A form's attack dialog shows `1d20 + 3 + 4 - 2`.** dnd5e builds that formula from the
  form's ability mod, Talo's PB and the transform's correction to the stat block's +5, and the net
  is right. Showing a single "+5" means changing dnd5e's roll dialog (vendor UI). A cheaper option
  is a line in the Full Attack tooltip or the strip, "Bite +5 to hit", read from
  `activity.labels.toHit`. The Full Attack tooltip already has a "To hit" row. Not applied.
- **P-4-e — HUD for a late joiner.** A player who connects mid-combat gets no Argon HUD on their own
  turn until `ui.ARGON.toggle(true)` (test-plan rule 5, Argon only self-enables at round 1 turn 0).
  Option: on `combatTurnChange` or `ready`, a non-GM whose owned combatant is current opens the
  HUD. Not applied: Joe keeps Argon's "always on" off. It also overlaps P-2-c, so the two should be
  decided together.
- **Rerun needs:** the D2 rerun (pips, the Bite note), U-4-1 on a live bear, D3–D13, D15 and G2.
  Run Area 4 alone. It needs Talo's tab and an active scene, and per the test plan it is
  "not concurrently with" areas 7 and 8. In practice, it should not run concurrently with anything.
- **Carry-over:** this fixer **reloaded the GM tab** to load U-4-0/U-4-1, which also loaded
  Area 2's U-2-1/U-2-2. Player tabs were not reloaded. Nothing was created on the world. All
  checks were read-only `eval-js`, plus one in-memory, unsaved Brown Bear copy.

---

## Area 7 — Attributes, knowledge and the no-leak sweep (fixer pass, 2026-10-10)

Most of Area 7 was **blocked**, not failed: stages shared one Chrome group and one Talo user. Only
K1, K11 and part of K8 ran. K3–K7, K9 and K10 (the no-leak sweep a–h) **still need a clean run**,
one area at a time. The "K2 rolled nothing" report had a real cause, fixed in U-7-0. The tester's
other suspected bug, "`resetInspection` leaves the grants so the cascade rolls nothing", was not a
code bug. Their checks read `pc.flags.pentaryn-ties.beliefs[npc.id]`, but the rows live on the
creature (`npc.flags…beliefs[pc.id]`). The cascade does re-roll after a reset. Documented in
`context/foundry/attributes.md` → "Undoing things".

**Real-PC cleanup done here.** The K2 restore had written Caven's four Talo identification rows
onto **Caven** (`beliefs.pfCQRWnqsQjkZQnB`, the slot for what Talo knows about Caven). The real
rows on Talo stayed deleted. Moved them back to `Talo.flags.pentaryn-ties.beliefs.IxcfWOvpcKID6bdn`:
Lone Peak 17, Groundstruck 22, Talo's History 18, Star Druids 13 (failed). The original `when`
stamps match Caven's stage-1 knowledge rows. Talo's own failed Brenfen row on Caven is untouched.
The reset had also deleted Caven's Star Druids failure line,
`granted["lore:pfCQRWnqsQjkZQnB:#idmiss-stardruids"]`. It was **reconstructed**, not restored
from a snapshot (none survived). The text is the attribute's current `miss`, which Marrith was
handed for the same roll earlier that day. `when` is the roll's stamp. Icon and source are Talo,
as in Marrith's copy. If Joe remembers Caven never had that line, delete that one key.

### U-7-0 (bug fix, logged for revert context) — a closer look works from any scene the player is on

- **What / why:** `canReach` (the one reach rule) checked the active scene plus the GM's own
  `canvas.scene`, because it runs on the GM's client. A player looking at a creature on any other
  scene got the stub card ("Caven Calderon studies Talo.") and the tempo line. After that came a
  silent refusal, logged only in the GM console as `inspect refused: … cannot see …`. Nothing
  rolled and the Look window stayed on "Nothing yet". That was Area 7's K2: Caven on a scratch
  scene, the GM bridge on another stage's scene. Players pulled to a non-active scene in real play
  hit the same thing. `canReach` now reads the **asking user's** `viewedScene` (synced on the
  User document) in place of the GM's canvas. The same rule gates Study requests and the tie
  relay. Proven live with a proxy user: Caven "viewing" Kharg's Adit (Talo's token there, GM
  canvas elsewhere) gave old rule false and new rule true. The active scene still reaches.
- **Files:** `foundry/module/pentaryn-ties/ties-api.mjs` (`canReach`), new
  `foundry/module/pentaryn-ties/test/reach.mjs` (8 fixtures), `README.md` (0.19.3 entry),
  `module.json` 0.19.2 → 0.19.3.
- **Revert:** in `canReach` replace the `viewed` line and
  `[game.scenes?.active, viewed]` with `const scenes = [game.scenes?.active, canvas?.scene].filter(Boolean);`.
  Delete `test/reach.mjs`, then `make foundry-ties-check foundry-ties-sync` and reload the GM tab.
- **Retest:** `node foundry/module/pentaryn-ties/test/reach.mjs`. Live: with a player on a
  non-active scene that holds an NPC token, use the double-click menu's **Take a closer look** on
  it. The rolls fire (blind) and cards land in the Look window.

### U-7-1 — Double-click menu: "Add or edit a tie" and "Write about them in my notebook"

- **What / why:** the player's double-click menu on someone else's token had only *Take a closer
  look* and *What I know about them*. The two writing actions, 6 (add a tie) and 5 (file them in
  the notebook), were keyboard-only. That breaks Joe's rule that no player action may hang off a
  key nobody told them about. Both items now sit on the menu. Each passes the clicked token
  straight to the same function the key calls (`openTieDialogFor(token)`,
  `Known.fileHovered(token)`), so behaviour and refusals are identical. The menu is still the same
  for every target. Not added: 8 and 7. Key 8 shows the ties of a token you own, so it means
  nothing on an NPC's menu. Key 7 needs your selected token as the source (see P-7-c).
- **Files:** `foundry/module/pentaryn-ties/pentaryn-ties.mjs` (`openLookMenu`, two `item(...)`
  calls), `lang/en.json` (`known.look.menuTieTip`, `known.look.menuNotebook`,
  `known.look.menuNotebookTip`), `README.md` ("Double-click to look" paragraph).
- **Revert:** delete the comment block and the two `item("fa-people-arrows"…)` /
  `item("fa-feather-pointed"…)` calls in `openLookMenu`, delete the three lang keys, remove the
  README sentence, then `make foundry-ties-check foundry-ties-sync` and reload player tabs.
- **Retest:** as a player (on 127.0.0.1), double-click an NPC token you can see: four items. *Add
  or edit a tie* opens the tie dialog with that NPC as the target. *Write about them…* opens
  their page on the sheet's Known tab and creates it the first time. Double-clicking an item pile
  (for example Nalveth's body on Drow Prison) still gives no menu. That is by design and explains
  K8's "no menu on Nalveth".

### Proposals (Area 7) — for Joe to decide

- **P-7-a — A "you look them over…" line in the Look window during a closer look.** The window
  opens on "Nothing in your notebook about X yet." before the dice land, then cards appear
  ~1–2 s later. A fixed-length line (say 4 s, the same for every target and outcome, and swapped
  out early only when a card lands) would stop the empty wording from reading as the answer. Not
  applied, because it touches the window's indistinguishability contract (`look.mjs` header, rule
  3). Today a failure changes nothing on screen. With the line, every look changes the screen once,
  at a fixed time, which leaks nothing extra but is a change to a rule Joe signed off. With U-7-0
  fixed, the gap is short in practice.
- **P-7-b — Quieter stub for a closer look.** Key 4 and *Take a closer look* post a public
  "{PC} studies {X}." card before any roll, plus tempo lines from the second look on. This is the
  module's deliberate "the table sees you looking" design (`study.mjs` `inspect`, `scopeTell`).
  Options: keep it; whisper it to the GM plus the actor; or post it only from the second look in
  a short span. Not applied: it is a table-feel ruling, not a fix.
- **P-7-c — Key 7 ("what is this person to me") on the menu.** It would need `Overlay.showOne` to
  take an explicit source (the player's character) and target (the clicked token) in place of the
  selection and hover. That is a small refactor of `overlay.mjs`. Not applied: it is the one
  reading key a player plausibly wants on an NPC, but it is a code change in the card overlay that
  this run did not test.
- **P-7-d — Nilonim Vrinn has no token on Drow Prison.** K4 ("study Nilonim") cannot run there
  without placing one first. Either the test plan places a temporary token on a scratch scene, or
  Joe places Nilonim on Drow Prison if he belongs in that scene. Not done: scene staging is Joe's.
- **P-7-e — Re-run K2–K10 one area at a time.** The tester's notes: separate cookie jars per
  stage (`zz<n>.localhost`), keep the Talo user free for K4/K5, and don't run alongside areas 4,
  5 and 6. Snapshot `npc.flags.pentaryn-ties.beliefs` (not the PC's flags) before any reset.
- **Seen, not a ties bug:** the d20 pause graphic stayed on the player canvas with `game.paused`
  false (pointer-events none, visual only). Most likely another stage's pause toggles crossing that
  tab. Worth a look if it shows up in a single-area run.

---

## Area 3 — Melee: once-per-turn riders and follow-ups (fixer pass, 2026-10-10)

Area 3 passed B1–B7, C1, C2, E1, E2, N1 and P(B1). C3 failed and was fixed. D1, F1 and F2 had
friction, P(C1) was blocked by the shared client-wide dice setting, and B0/C0 (stock baselines)
were not run. All the fixes below are in `foundry/module/pentaryn-combat/`. `make
foundry-combat-check` passes with 219 fixtures (9 new: 247–255). The fixes were synced and the GM
client was reloaded. Each one was then checked live on the GM client through Argon bound to a ZZ
test actor (`ui.ARGON.bind(actor)`), using DOM mouseups rather than a real mouse. Player tabs were
not reloaded because other areas were using them, so they pick the fixes up on their next reload.

### U-3-1 (bug fix + streamlining) — "Reckless Attack: On/Off" on a Barbarian's Special bar

- **What / why:** the PHB Reckless Attack item has no activity, and its "Reckless" effect has no
  changes. Nothing on the HUD could turn it on. As a result Frenzy always showed "Reckless Attack
  this turn ✗" and auto Frenzy could never fire. A Barbarian (feature `reckless-attack`) now gets a
  toggle on the Special bar. **On** creates an actor effect copied from the item's own "Reckless"
  effect (until the start of your next turn, origin = the item). It adds the native dnd5e 6 change
  `system.abilities.str.attack.roll.mode` +1, so the attack dialog **defaults to Advantage** for
  Strength attacks, with Normal and Disadvantage still one click away. **Off** deletes the effect,
  for a misclick. While it is on, the button has a red ring. Frenzy's hint reads ✓ and the HUD and
  cards re-render when the effect is created, deleted or expires. "Attacks against you have
  Advantage" is not automated; that is for the GM.
- **Files / settings:** `riders.mjs` (`isReckless` exported, new `setReckless`, effect hooks →
  `rerenderCards`), `hud.mjs` (`recklessShown`, toggle in `composeSpecialBar`, `specialSig`
  includes the state, `CommandButton` takes `active`, effect hooks → `checkBars`),
  `combat-core.mjs` (`RECKLESS_CHANGE`, `recklessChanges`, `isRecklessEffect`), `settings.mjs`
  (new world setting **`recklessToggle`**, default on), `combat.mjs` (API `reckless`,
  `setReckless`), `lang/en.json` (`Reckless.*`, `Setting.recklessToggle`), `styles/combat.css`
  (`.pentaryn-combat-command.pentaryn-combat-active`), `README.md` (settings table),
  `test/run.mjs` (252–255). In Foundry v14 an effect's changes live in `system.changes`; a
  top-level `changes` is silently dropped, and the first live try hit exactly that.
- **Revert:** the quick way is to turn off the world setting *Reckless Attack toggle*. For the full
  revert, remove the `recklessShown` block from `composeSpecialBar`, the `reckless` element of
  `specialSig`, `setReckless` and the two effect-hook loops, the `recklessToggle` default, and the
  lang, CSS and README rows. Then run `make foundry-combat-check foundry-combat-sync` and reload
  the clients.
- **Retest:** bind the HUD to ZZ Barbarian 5. The Special bar shows "Reckless Attack: Off". Click
  it: it changes to "On" with a red ring, and an effect "Reckless" with that one change exists.
  Click the Greataxe: the dialog's default button is **Advantage**. Rage, then Full Attack, then a
  hit: Frenzy's hint reads "Reckless Attack this turn ✓". Click the toggle again and the effect
  is gone. Verified live: mode 0 → 1 → 0, dialog `advantage*`, toggle Off → On [active] → Off.

### U-3-2 (bug fix, logged for revert context) — Frenzy's card reads "2d6", not "(2)d6"

- **What / why:** the stock Frenzy damage part is `(@scale.barbarian.rage-damage)d6`. On a rider
  roll the module now rewrites a parenthesised roll-data die count that resolves to a plain whole
  number into `2d6` before the roll is built. This applies only to our own rider rolls (the
  `pentaryn-combat.rider` config key), and any other part is left as it was. The cause was
  cosmetic; the total was always right.
- **Files:** `riders.mjs` (`narrowType`; `rollRider` passes `rider: key`), `combat-core.mjs`
  (`tidyDiceCount`), `test/run.mjs` (247–251).
- **Revert:** in `narrowType`, delete the `r.parts = r.parts.map(…tidyDiceCount…)` line and go
  back to returning early on `!config?.[MOD]?.narrow`. Then check, sync and reload.
- **Retest:** ZZ Barbarian 5 with Rage on, hit with the Greataxe, then click "+ Frenzy 2d6". The
  card formula reads `2d6`. Verified live with `rollDamage(..., {create:false})`: `2d6`, slashing.

### U-3-3 — Pole Strike is greyed until earned, not hidden

- **What / why:** before the Attack action with a qualifying weapon, Pole Strike used to vanish, so
  a player couldn't tell they had it or when it opens. It is now greyed (40 %). The top line of its
  tooltip reads "Pole Strike opens after you take the Attack action with a Quarterstaff, Spear or
  Heavy weapon with Reach.", and a click shows that line as a notice instead of rolling. This
  applies on the bar and inside Argon's Use Feature drawer. Once it is earned it looks and works
  as before.
- **Files:** `hud.mjs` (`gatePoleStrike`: class `pentaryn-combat-gated`, a capture `mouseup`
  listener on the element, `getTooltipData` wrapped on the instance), `styles/combat.css`
  (`.pentaryn-combat-gated`), `lang/en.json` (`Hud.PoleStrikeGated`), `README.md`
  (`gateFollowUps` row).
- **Revert:** in `gatePoleStrike`, go back to
  `button.element.classList.toggle("pentaryn-combat-hidden", !open);` and delete the rest of the
  body after it. The `.pentaryn-combat-hidden` CSS rule is still there. Then check, sync and
  reload. The old "always shown" behaviour is still the `gateFollowUps` setting off.
- **Retest:** bind the HUD to ZZ Polearm 5 on a fresh turn. Pole Strike is greyed, and hovering
  it shows the "opens after…" line. A click shows the notice, with no chat card and no dialog.
  Full Attack with the glaive opens it at full colour. Verified live for the greyed half; the open
  half uses the unchanged gate logic.

### U-3-4 — A follow-up that appears mid-turn pulses

- **What / why:** Hew appears only once the GM applies the lethal damage, and nothing used to signal
  it. Any follow-up button that newly appears on the Bonus bar for the same actor now pulses gold
  for about 4 s: Hew, and Off-hand after the Attack action. A bar's first render and a greyed
  button don't pulse.
- **Files:** `hud.mjs` (`pulseNew`, called from `composeBonusBar`; `_pcFuSeen` per panel),
  `styles/combat.css` (`@keyframes pentaryn-combat-pulse`, `.pentaryn-combat-new`).
- **Revert:** delete `pulseNew` and its call, the `_pcFuSeen` line in the empty branch, and the
  two CSS rules. Then check, sync and reload.
- **Retest:** ZZ Barbarian 5 (GWM) hits with the Greataxe and the GM applies lethal damage. "Hew:
  Greataxe" appears on the Bonus bar and pulses. Verified live by writing a kill into the turn
  flag: `Hew: Greataxe [pulse]`, animation `pentaryn-combat-pulse`. The flag was restored.

### U-3-5 — Rider hints: "ask your GM" for the ally, "where to turn it on" for Reckless

- **What / why:** "Ally beside the target ✗" read as a firm no. The module can't see an untokened,
  hidden or off-scene ally, so when it doesn't see one the line now reads "Ally beside the target
  ? (none seen — ask your GM)". The button is unchanged and was never hidden. Frenzy's line for
  Reckless now reads "Reckless Attack this turn ✗ (turn it on from the Special bar)".
- **Files:** `riders.mjs` (`hintText`), `lang/en.json` (`Rider.AskGM`, `Rider.RecklessWhere`).
- **Revert:** in `hintText`, delete the two `if (key === …)` lines, then the two lang keys. Then
  check, sync and reload.
- **Retest:** ZZ Rogue 5 swings a Rapier at Normal with no ally and hovers "+ Sneak Attack 3d6".
  Verified live: "Advantage ✗ / Ally beside the target ? (none seen — ask your GM) / No
  Disadvantage ✓". The card was deleted afterwards.

### U-3-6 (bug fix, logged for revert context) — Flurry of Blows at 0 Focus: greyed, with the reason

- **What / why:** this is C3. Flurry used to vanish at 0 Focus. The tester's fix, now verified
  live, keeps it on the Bonus bar, greyed, with the tooltip "No Focus Points left for Flurry of
  Blows.", and a click warns. While retesting, this fixer found that a click on the greyed button
  first opened Argon's **target picker**. With no target selected, the player then had to
  right-click to cancel it before the warning showed. A greyed follow-up now asks for no target
  and warns at once.
- **Files:** `hud.mjs` (`followUpsNow`: the disabled Flurry entry; `FollowUpButton`: `disabled`
  class, tooltip, `_onLeftClick` warn, `get targets()` returns 0 when disabled),
  `styles/combat.css` (`.pentaryn-combat-disabled`), `lang/en.json` (`FollowUp.NoFocus`).
  Fixture 131 (core `followUps` still omits Flurry at 0 Focus) is unchanged; the greyed entry is
  added in the HUD layer.
- **Revert:** delete the `if (ctx.isOwnTurn && unarmed && features.has("monks-focus") …)` block in
  `followUpsNow`, then drop `this.followUp.disabled ||` from `get targets()`. Then check, sync and
  reload.
- **Retest:** ZZ Monk 5 with Focus spent to 0. The Bonus bar shows Flurry greyed and Martial Arts
  live, and the tooltip gives the reason. A click warns, with no picker and no card. Restore the
  Focus and Flurry is live again. Verified live; Focus was restored to spent 0.

### Covered elsewhere

- **Stacked pair (Handaxe ×2) gets no off-hand:** fixed in Area 1's **U-1-3**. Not re-run here.
- **Out-of-combat Bonus pip on Rage, and the Bonus pip after Flurry:** not judged by eye; this
  needs a player-tab run (see P-3-f).

### Proposals (Area 3) — for Joe to decide

- **P-3-a — Sneak Attack defaults to Auto for rogues.** Auto takes 2 clicks against 3 and works with
  Undo (B4). It adds the dice only when the module *sees* Advantage or an adjacent ally, and never
  when the roll had Disadvantage. Not applied, for two reasons. Auto means a miss card can carry
  dice the GM then must not apply, which is a table habit to learn. And each player can already
  switch with one click on the Special bar (a per-user flag). If you want it: in `settings.mjs`
  `riderMode`, return `"auto"` when the flag is unset and the key is `sneak-attack` (a one-line
  change), and add a fixture.
- **P-3-b — Divine Smite in one click fewer (6 → 5).** The flow is swing (3), then Smite, then the
  slot confirm, then the damage dialog. The damage dialog's "Critical Hit" button covers the crit
  carry. To save a click, roll the damage straight after the slot confirm, with
  `configure: false` and the crit carried from the attack card the way `rollRider` does. That
  means intercepting a stock dnd5e spell (`dnd5e.postUseActivity` for identifier `divine-smite`),
  and it was not tested, so it was not applied.
- **P-3-c — Lay on Hands amount.** It defaults to 1 and the player types it, about 4 clicks. Option:
  in `dnd5e.preUseActivity` for `lay-on-hands`, prefill the amount with the single target's
  missing HP, capped at the pool, and skip the separate Roll dialog (it heals a fixed number).
  Not applied: it changes a stock heal flow, and a wrong prefill spends pool points.
- **P-3-d — Reckless also on the dialog, and an auto-off.** With U-3-1, a player who clicks
  Advantage in the dialog without the toggle still gets no Reckless effect, so Frenzy shows ✗.
  Option: show a small "Reckless?" checkbox in the attack dialog for a Barbarian's Strength
  attacks that applies the effect. The effect already expires at the start of your next turn; out
  of combat it stays until toggled off, and "New turn" could also clear it. Not applied: it is
  more UI than the bug needed.
- **P-3-e — Run the stock baselines (B0, C0) once.** Stock Sneak Attack has no uses and only a
  damage activity, so the module never consumes it, which is correct. The stock Flurry wasn't
  found by name on ZZ Monk 5. Worth one look at what the Monk actually has
  (`game.actors.getName("ZZ Monk 5").items.filter(i => /flurry/i.test(i.name))`) so the
  click-count comparison in the plan has a real number.
- **P-3-f — Rerun with a player tab, one area at a time.** P(C1) was blocked because
  `core.diceConfiguration` is **client-wide**: two areas using manual dice on the same GM client
  collide. Run P(C1) when no other area is running, and in the same pass judge the HUD placement,
  the pips (Rage, Flurry), the pulse (U-3-4), the greyed Pole Strike (U-3-3) and the Reckless ring
  (U-3-1) by eye on a player tab.
- **Not a bug:** Sneak buttons stayed on earlier cards from the same turn. That is correct (the
  same turn key); it only looked odd because the tester reset the flags repeatedly.
- **Cleanup by this fixer:** every effect, flag and card it created was removed. ZZ Barbarian 5 has
  no effects. ZZ Monk 5 Focus is back to spent 0. ZZ Barbarian 5's turn flag was restored. ZZ
  Rogue 5's turn flag was cleared, and its two test cards were deleted. A stray Argon target
  picker opened by a test click was cancelled. The HUD was unbound. The GM tab was reloaded three
  times, each time only after checking that no roll dialog was open.

---

## Area 5 — Sorcerer (Marrith): spells, Metamagic, sorcery points, fire riders, areas and saves (fixer pass, 2026-10-10)

Three real bugs were fixed at the root: Innate Sorcery's missing advantage (data), concentration
summons left on the map (code), and stale Metamagic badges (code). Two HUD obstructions were fixed:
the open Cast Spell panel during area placement, and the tooltip over its own button. Font of Magic's
activity names were changed. Everything else is a proposal below. The code lives in
`pentaryn-riders`. It is three new files imported from `riders.mjs`, so `module.json` did not change
and Foundry needed no restart. Synced, and the GM tab was reloaded. **Open player tabs need a reload.**
Checks: `make foundry-riders-check` passes, with riders-core 103, rituals-core 19 and table-core 23
(new). `make foundry-adjustments-check` passes with 33 rows.

### U-5-1 (bug fix, logged for revert context) — Innate Sorcery gives advantage on Sorcerer spell attacks

- **What / why:** the PHB effect only had `system.bonuses.spell.dc +1`. Its own description said the
  advantage half was "(Not automated)", so Fire Bolt's attack dialog opened on Normal and the player
  had to click Advantage on every attack. dnd5e 6 has a native rule change for this, so no code
  was needed. Marrith's Innate Sorcery item (`Zc5gXb2Se3VVAzLd`) effect `WtiHwWONdmCOeSDR` gained a second
  change: key `attack`, type `dnd5e.advantage`, value `+1`, conditions
  `{"k":"item.classIdentifier","v":"sorcerer"}`. Only spells whose class is Sorcerer get it: Fire
  Bolt, Scorching Ray, Chromatic Orb and Produce Flame do. Magic Initiate spells (`classIdentifier`
  "") and the Dagger do not. The description line now says "(Automated)".
- **Proven** on a temp clone of Marrith (deleted afterwards) with a copy of the real effect enabled:
  DC 17 → 18, Fire Bolt `1d20 + 5 + 4` → `2d20adv + 5 + 4`, Scorching Ray adv, Dagger unchanged.
- **Files / settings:** world data only (Marrith `RNDTDBlFXxZ7Uc8i`). No repo files.
- **Revert** (eval-js as GM):
  ```js
  const e = game.actors.get("RNDTDBlFXxZ7Uc8i").items.get("Zc5gXb2Se3VVAzLd").effects.get("WtiHwWONdmCOeSDR");
  await e.update({ "system.changes": e.toObject().system.changes.filter(c => c.type !== "dnd5e.advantage"),
    description: e._source.description.replace("Sorcerer spells you cast. (Automated)", "Sorcerer spells you cast. (Not automated)") });
  ```
- **Retest:** S9. On the Marrith tab, use Innate Sorcery (spend Sorcery Incarnate first if it has
  0 uses). Cast Fire Bolt: the attack dialog should open with **Advantage** already chosen, and
  Normal or Disadvantage should still be clickable. Rolling your own dice still works through the
  manual-dice dialog, which shows 2 d20 fields. Restore Innate's uses and Font points afterwards.
  Other sorcerers (other worlds, future PCs) do not have this yet; see P-5-j.

### U-5-2 (bug fix) — Concentration summons leave when concentration ends; the break button is labelled

- **What / why:** dnd5e 6.0.6 ends dependent effects with concentration, but never summoned
  tokens. The Flaming Sphere stayed after a failed CON save and a Break. Now:
  - On `dnd5e.summonToken` (the summoner's client, after dnd5e has made the cast's concentration
    effect), the token data is stamped `flags.pentaryn-riders.concentration = <effect uuid>`.
  - On `deleteActiveEffect`, the active GM deletes the stamped tokens on every scene. With no GM
    online, the user who ended it does this instead.
  - Summons that need no concentration (Find Familiar) are never stamped, so they are never touched.
  - Re-casting is safe: dnd5e makes the new effect before it ends the old one, and each effect has
    its own uuid.
  - The world actor in "Marrith - summons & forms" is kept on purpose. dnd5e's `fetchExisting`
    reuses it on the next cast.
  - The "Lost Concentration" card's icon-only break button (fa-ban) now shows the words "Break
    Concentration".
  The failed save still does not break concentration by itself. That is dnd5e's design: the
  player may have a reaction or feature that changes it.
- **Proven** on a temp Marrith clone and a scratch scene (both deleted afterwards). A stamped token
  and an unstamped token were placed, then `endConcentration()` was called. Only the stamped token
  was removed. The label hook was proven on a detached element.
- **Files / settings:** new `foundry/module/pentaryn-riders/concentration.mjs`, `table-core.mjs`
  (pure) and `test/table.mjs`. In `riders.mjs`, one `import "./concentration.mjs";` line and its
  comment. One `await import("./table.mjs")` at the end of `test/run.mjs`. Lang
  `PENTARYN_RIDERS.settings.concentrationSummons.*`. CSS `.pr-labelled` / `.pr-btn-label` in
  `riders.css`. Adjustment row `dnd5e-concentration-summons`. A README row. New world setting
  **Settings → Pentaryn Feature Riders → "Concentration summons leave with concentration"**
  (`pentaryn-riders.concentrationSummons`, default on).
- **Revert:** quickest is to turn the setting off, which stops the cleanup (the label stays).
  For a full revert, delete `concentration.mjs`, remove its import and comment from `riders.mjs`,
  the two `.pr-labelled`/`.pr-btn-label` CSS blocks, the lang key, the adjustment row and the
  README row. Then run `make foundry-riders-check foundry-riders-sync` and reload the clients.
  `table-core.mjs` is shared with U-5-3; remove it only when both are reverted, along with
  `test/table.mjs` and the last `await import` in `test/run.mjs`.
- **Retest:** S13. Cast Flaming Sphere and place it. Damage Marrith, fail the CON save, then click
  "Break Concentration" (the words now show). The sphere token should vanish within a second on
  every client. Then cast it again and end it from the sheet's concentration effect: same result.
  Then cast Find Familiar (no concentration) and break some other concentration: the familiar
  stays.

### U-5-3 (bug fix) — Metamagic badges follow Font of Magic

- **What / why:** every Metamagic tile's badge shows Font of Magic's uses, but Argon re-renders a
  button only when its own item changes. Its follow-up `CoreHud#updateItemButtons(items)` also
  calls `Set#add(...items)`, which adds only the first item. So the tiles showed old counts (8 when
  4 were left). Now, when a uses value changes on any item of the HUD's actor, every HUD button
  whose item spends that item's uses (`itemUses` consumption) re-renders.
- **Files:** new `foundry/module/pentaryn-riders/argon-tidy.mjs` (part 1), `spendsUsesOf` in
  `table-core.mjs` (8 fixtures), one `import "./argon-tidy.mjs";` line in `riders.mjs`, and
  adjustment row `argon-shared-uses-badge`.
- **Revert:** delete the `updateItem` hook in `argon-tidy.mjs`. If U-5-4 is reverted too, delete
  the file and its import instead. Then remove the adjustment row, sync, and reload.
- **Retest:** S5/S8 on the Marrith tab. Note the Metamagic badges, use Quickened Spell (−2), then
  convert a slot to points (+1). Every Metamagic tile should match Font of Magic's own badge after
  each step, with no lag. Not yet seen live on a player HUD; the APIs were checked on the GM client.

### U-5-4 — An area spell's placement starts with Argon's panels collapsed

- **What / why:** S2. The Cast Spell panel stayed open over the battlefield. The click meant to
  place Fireball landed on a spell button behind it, which opened Burning Hands, while the
  template stayed in preview. On `dnd5e.preCreateMeasuredTemplate`, which dnd5e fires just before
  the area follows the mouse, `ui.ARGON.collapseAllPanels()` runs. This is the same call Argon
  makes when another panel opens. The action bar itself stays.
- **Files:** `argon-tidy.mjs` (part 2) and adjustment row `argon-collapse-on-area-placement`.
- **Revert:** delete the `dnd5e.preCreateMeasuredTemplate` hook from `argon-tidy.mjs`, remove the
  adjustment row, sync, and reload.
- **Retest:** S2. Open Cast Spell, open the 3rd Level group, click Fireball and then Cast Spell. The
  panel should close as the template appears, and one click on the goblins places it. Escape
  still cancels the placement (U-aoe's handler).

### U-5-5 — Font of Magic's two activities say which way they convert (data, Marrith only)

- **What / why:** S8. The stock names read backwards to a player: "Regain Spell Slot" spends
  points, and "Regain Sorcery Points" spends a slot. On Font of Magic `f8a6sWooaCGoBKTn`:
  - `rYDgagyWjp6f3jtO` "Regain Spell Slot" → **"Sorcery Points to Spell Slot"** (Bonus Action)
  - `qAphJay1yKd7VWxH` "Regain Sorcery Points" → **"Spell Slot to Sorcery Points"** (no action)
  The `<strong>` names in the item's GM "Foundry Note" were changed to match. Nothing mechanical
  changed.
- **Files / settings:** world data only (Marrith). No repo files.
- **Revert** (eval-js as GM):
  ```js
  const i = game.actors.get("RNDTDBlFXxZ7Uc8i").items.get("f8a6sWooaCGoBKTn");
  let d = i._source.system.description.value
    .replace("<strong>Sorcery Points to Spell Slot</strong>", "<strong>Regain Spell Slot</strong>")
    .replace("<strong>Spell Slot to Sorcery Points</strong>", "<strong>Regain Sorcery Points</strong>");
  await i.update({ "system.activities.rYDgagyWjp6f3jtO.name": "Regain Spell Slot",
    "system.activities.qAphJay1yKd7VWxH.name": "Regain Sorcery Points", "system.description.value": d });
  ```
- **Retest:** S8. Click Font of Magic on the Bonus or Special bar. The picker should list "Sorcery
  Points to Spell Slot" and "Spell Slot to Sorcery Points". Check that neither is truncated on the
  HUD and that a player picks the right one without help.

### U-5-6 (bug fix) — Argon's hover tooltip no longer eats the click on its own button

- **What / why:** S5. At 1299×848 the Scorching Ray tooltip was clamped down over its own button,
  and Argon gives `.ech-tooltip` `pointer-events: all`. Real clicks hit the tooltip, so the spell
  could not be cast from the HUD. Core's live `#tooltip` is `pointer-events: none`. Ours now makes
  Argon's content inside it the same: `#tooltip.ech-tooltip-container, #tooltip .ech-tooltip
  { pointer-events: none }`. A middle-click-locked tooltip is a clone without the id, so it keeps
  clickable links. Argon scrolls a long tooltip with the mouse wheel over the HUD, not over the
  tooltip, so scrolling still works. Proven by computed style on the GM client: `none` inside
  `#tooltip`, `all` outside.
- **Files:** the last CSS block in `foundry/module/pentaryn-riders/riders.css` and adjustment row
  `argon-tooltip-click-through`.
- **Revert:** delete that CSS block and the row, sync, and reload.
- **Retest:** S5 at a small window (about 1300×850). Hover Scorching Ray until the tooltip shows,
  then click the button where the tooltip overlaps it. The cast dialog should open. Middle-click a
  tooltip to lock it, then click a link inside it: the link still works.

### Proposals (Area 5) — for Joe to decide

- **P-5-a — Careful Spell marks protected allies in the area tray.** Today Careful is a bare
  utility that spends 1 point. The GM must set each ally's multiplier by hand, and the Target
  Picker's "0/5" asks for targets that feed nothing. Proposal: a `protected` flag per aoe tray
  row. If Careful was used this turn, the Target Picker choice (up to CHA mod creatures) marks
  those rows "auto-succeed, 0 on a half-damage spell". This needs pentaryn-aoe resolve changes
  and a live tray test, so it was not applied.
- **P-5-b — Empowered Spell "Reroll lowest N" on the damage card.** Today the card only says
  "reroll up to 5 dice", and the tray cannot take a changed total. Proposal: a button on the
  caster's most recent damage card rerolls the N lowest dice of that roll once (N = CHA mod),
  replaces the roll, and re-feeds the aoe tray. That touches roll replacement and the tray's
  superseded logic. Manual-dice players would type the rerolled dice in the same dialog.
- **P-5-c — Transmuted Spell on Marrith.** The Inward Flame (homebrew) already makes all her
  elemental damage fire, "works like Transmuted Spell, always applies". Options: (1) hide the
  tile for her (set its activation to none, or add a world flag our HUD reads); (2) rename it
  "Transmuted Spell (Inward Flame does this)"; (3) leave it, if she can still transmute fire into
  something else. This depends on how you rule the homebrew, so it is your call as her DM.
- **P-5-d — Quickened Spell changes the next cast's action.** Today it spends 2 points and nothing
  else, so the player must remember the spell is now a Bonus Action. Proposal: using Quickened
  sets a one-shot flag. The next `dnd5e.preUseActivity` of a 1-action spell gets
  `activation.type = "bonus"` and spends the Bonus pip in Argon instead of the Action pip, then
  the flag clears at turn end. Also worth checking: S5 saw no pip change at all after any cast
  (Argon's `consumeActionEconomy` should mark the Action pip). That needs a live look with combat
  running and the HUD bound to the combatant.
- **P-5-e — Fewer clicks for Fireball (7 today vs a budget of 2).** U-5-4 removes the swallowed
  click. Options remain:
  1. Skip dnd5e's usage dialog for a template spell cast at its base level. dnd5e already skips
     it on shift-click, so the first option is to teach "shift-click".
  2. A HUD setting that auto-skips the dialog. Risky: upcasting and slot choice live in that
     dialog.
  3. Open the Cast Spell accordion with the highest available level expanded. The thin vertical
     "3rd Level" tab toggled inconsistently in S2. That is Argon's accordion and would need a
     wrap like rituals.mjs.
  4. Auto-roll area damage on placement, which would remove the card's Damage click and dialog.
     That is a pentaryn-aoe change.
- **P-5-f — The Target Picker on Metamagic, and its tutorial.** Argon pops a "0/5 targets" picker
  for Careful (`target.affects.count` = CHA mod) and, per S6, for Empowered. Unless P-5-a lands,
  the picker feeds nothing. pentaryn-transform already cancels the picker for its own buttons
  (row `argon-target-picker-cancel`); the same could skip it for `*-spell` metamagic identifiers.
  The first-time Target Picker tutorial is Argon's own and shows once per client.
- **P-5-g — Font of Magic shows both conversions on both bars.** Argon lists the item, not the
  activity, so the Bonus and Special bars both open the two-choice picker. Argon's
  `explodeItemActivities` setting would list activities separately, but it is world-wide and
  changes every item on every HUD. Not applied; U-5-5 makes the picker readable instead.
- **P-5-h — Player chat noise from redacted GM saves.** Each NPC save shows on the player's
  chat as a "ZZ Goblin ?" row (16 after a few Fireballs). Proposal: pentaryn-aoe rolls NPC saves
  with no chat message and puts them only in the tray, or collapses them into one "4 creatures
  rolled Dexterity saves" GM message. That is an aoe change and could interact with other areas'
  fixes, so it was left.
- **P-5-i — A moved area re-rolls its damage.** S3: dragging the Fireball before Apply needs the
  card's Damage clicked again, and that rolls new dice. The rules do not cover moving a placed
  area (it is a table-convenience fix for a misplaced click), so keeping the first roll could be
  argued either way. Options: keep it (tell players), or have the moved area reuse the last damage
  roll of the same card.
- **P-5-j — Innate Sorcery advantage for every sorcerer.** U-5-1 changed only Marrith's copy. A new
  sorcerer, or one in another world, imports the PHB item without the rule. Option: a pentaryn-riders
  rule that adds the `dnd5e.advantage` change when it is missing, keyed on identifier
  `innate-sorcery`, the way Battle Medic installs its activity. Or re-run U-5-1's one-line update
  per actor.
- **Environment (for the next run):** stages share one GM bridge. The pause keeper re-paused the
  world twice mid-test, and player tokens could not be dragged until it was unpaused. All plain
  `127.0.0.1` tabs share one cookie jar, so a second stage logging in as another player switches
  your session. The S-run used a distinct loopback host (`zz5.localhost`).
- **Not changed:** the Elemental Adept explanation stays a note on the card, not in the damage
  dialog (the dialog runs before the riders apply). The "min2" in the manual-dice dialog title is
  core's. The wand appearing under both Cast Spell and Use Item is Argon's.

---

## Area 5 — re-test addendum (2026-10-10)

### U-5-7 (data fix, logged for revert context) — Marrith's Flaming Sphere summons from the PHB again

- **What / why:** the Area 5 re-test's first Flaming Sphere casts failed with *"Actor cannot be
  found with UUID Actor.COjOXyUALdj8TYHr to summon"* and left a Concentrating effect with no
  sphere. The summon profile pointed at the world copy that the first run's cleanup deleted.
  `profiles[0].uuid` on Marrith's Flaming Sphere summon activity was set back to
  `Compendium.dnd-players-handbook.actors.Actor.phbsplFlamingSph`. A scan of every PC's summon
  profiles found no other dead uuid. Confirmed in the end-of-run read: the profile still holds the
  compendium uuid.
- **Lesson for cleanup (case Z):** never delete a summon's world copy that a summon profile points
  at, or re-point the profile to the compendium first. U-5-2 already keeps that copy on purpose.
- **Files / settings:** world data only (Marrith `RNDTDBlFXxZ7Uc8i`). No repo files.
- **Revert:** none needed. The old value was a dead uuid, so reverting would break the spell again.
- **Retest:** S13. On the Marrith tab cast Flaming Sphere and place it. The sphere appears, with no
  red error. End concentration: the token leaves (U-5-2).

## End-of-run state (read 2026-10-10, after every area)

- Active scene Drow Prison, paused. No combats. Online: Gamemaster, Caven, Talo (player tabs from
  earlier stages, still open somewhere; close them).
- Leftovers: scene `ZZ Arena`, 12 `ZZ` actors (kept as test fixtures for the re-run), the Allosaurus
  stray (P-6-b).
- `game.modules` still reports pentaryn-ties 0.19.2 and pentaryn-prompts 0.4.0. That is the manifest
  cached at world launch, not the code. The synced Data copies are 0.19.3 / 0.4.1, and the GM tab
  serves the fixed `ties-api.mjs` (`viewedScene`) and `readback-core.mjs` (`remaining: unknown`).
  The version number updates on the next world relaunch. Player tabs need a reload to pick up the
  fixes.
