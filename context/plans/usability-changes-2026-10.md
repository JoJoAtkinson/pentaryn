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
- **P-2-b — Skip Argon's Target Picker Tutorial.** **Applied as U-R-2 (re-run prep, below).** It is a client setting
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

- **P-4-a — Keep a pre-target when a weapon is clicked by hand.** **Applied as U-R-1 (option 1; re-run
  prep, below).** This is the root of the "Bite did
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
  Applied as U-R-2.
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
  The first-time Target Picker tutorial is Argon's own and shows once per client (now skipped: U-R-2;
  the Metamagic picker itself is still open).
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

---

## Re-run prep — proposals applied before the re-run (2026-10-10)

Joe asked for P-4-a and P-2-b to be applied before the re-run so the re-run tests them. Both live
on the GM client. Nothing in Argon's files was edited. The GM tab was **reloaded twice**. No player
tab was open; each player tab picks this up on its next load.

### U-R-1 (P-4-a, option 1) — a pre-set target is kept when a weapon is clicked by hand

- **What / why:** Argon's world setting **Target Picker - Clear Targets**
  (`enhancedcombathud.rangepickerclear`) is now **off**, which is Argon's own default. It had been on.
  Before, every hand-clicked weapon, Bite included, cleared the target the player had just set
  with **T**. It then waited in silence on "0/1 Targets", so the button looked broken (Areas 4 and 5).
  Now an existing target goes straight to the roll dialog. Argon's picker sees 1/1 and ends at once,
  so the canvas tool flicks to Target and back. With nothing targeted, the picker opens as before.
  If an item needs more targets than are set (for example 1 of 3), the picker opens and keeps the
  ones already set.
  **Cost:** to hit a different creature, target it first. A stale target, such as a creature
  dropped last turn, is no longer cleared for you. Watch for that in the re-run.
- **Knock-on fix (code):** the Full Attack pause bar's **New target** used Argon's picker and relied
  on it clearing. With the clear off, the picker would have seen the old target, ended at once and
  sent the swing back to the old target. The registered picker in `hud.mjs` now calls
  `releaseTargets()` before the probe, whatever the Argon setting says. A right-click cancel
  still restores the old target (`sequence.mjs` `restoreTargets`, unchanged).
- **Files / settings:** world setting `enhancedcombathud.rangepickerclear` `true → false` (set by
  eval-js). `foundry/module/pentaryn-combat/hud.mjs`: `releaseTargets()` and its call at the top
  of the `registerTargetPicker` callback.
- **Verified live (GM client, Drow Prison, read-only apart from the user's own target):** one
  token targeted, then an Argon `ItemButton` with `targets = 1` was clicked. The picker ended in
  2 ms, the click went through and the target was kept. No picker label was left over and the
  tool was back on Select. The target was released afterwards.
- **Revert:** Configure Settings → Argon Combat HUD → **Target Picker - Clear Targets** on, or
  `game.settings.set("enhancedcombathud","rangepickerclear",true)`. The `releaseTargets()` call can
  stay: with the setting on, Argon clears anyway. To remove it too, delete `releaseTargets()` and
  its call in `hud.mjs`, then `make foundry-combat-check foundry-combat-sync` and reload the clients.
- **Retest:**
  1. **D2 Bite case (Talo, Wild Shape bear).** Target the goblin with **T** and click Bite once.
     The roll dialog opens straight away: no "0/1 Targets" and no extra click. Repeat as Marrith
     with Fire Bolt from Area 5.
  2. **Nothing targeted.** Click a weapon. The "0/1 Targets" picker opens. Click a token and the
     dialog opens.
  3. **New target (Area 2, A-row with Esc).** Start a Full Attack on goblin A and press Esc, then
     **New target**. The picker opens at 0/1, not ending at once on A. Click goblin B and swing 2
     rolls against B. Repeat, then right-click to cancel: you stay paused on A, and A is still
     targeted.
  4. **Count the clicks.** One-at-a-time with a pre-target should be weapon then dialog, which is
     2 per swing (was 3).

### U-R-2 (P-2-b / P-4-c) — Argon's Target Picker Tutorial is skipped for everyone

- **What / why:** Argon shows a one-time **Target Picker Tutorial** dialog (Confirm) the first time
  a browser opens its picker. That is usually mid-combat, and it confused three testers. The flag
  is a **client** setting (`enhancedcombathud.targetPickerGuideShown`, per browser), so a world
  value cannot cover it. Now every client sets it to `true` on `ready` when pentaryn-combat's new
  world setting **`skipPickerGuide`** (default on) is on. The setting also applies on the spot
  when it is switched on.
  The tutorial's one tip a player needs while picking is "right-click cancels". It now sits on
  Argon's own cursor label, which reads "0/1 Targets · right-click cancels", as a CSS `::after`
  whose text comes from `lang/en.json` through a body CSS variable. Argon's DOM is untouched. The
  tutorial's other tips are no longer shown: "T targets" (also in Foundry's own controls) and
  "+/- changes the count".
- **Files / settings:** new world setting `pentaryn-combat.skipPickerGuide`
  (`settings.mjs` DEFAULTS, `lang/en.json` `Setting.skipPickerGuide`, `Hud.PickerCue`).
  `hud.mjs`: `applyPickerGuide()`, `Hooks.once("ready")` and `create/updateSetting` hooks.
  `styles/combat.css`: `body.pentaryn-combat-picker-cue .ech-target-picker::after`.
  `README.md` Adjustments row.
- **Verified live (GM client):** the guide flag was set to false, then the setting was switched
  off and on, and the flag came back `true`. The body class and cue were removed when the setting
  was off and came back when it was on. Argon's real picker opened with no tutorial dialog. The
  computed `::after` was `" · right-click cancels"`. A right-click cancelled it and the tool went
  back to Select. The world now stores `skipPickerGuide = true`, the same value as the default,
  because of this toggle.
- **Revert:** turn **Skip Argon's Target Picker Tutorial** off (Configure Settings → Pentaryn
  Combat). The cue goes at once. Browsers that already marked the tutorial seen keep it marked. To
  show it again on a browser, run
  `game.settings.set("enhancedcombathud","targetPickerGuideShown",false)` there. To remove the code,
  delete the "Argon's Target Picker Tutorial" block in `hud.mjs`, the CSS rule, the `skipPickerGuide`
  default and its lang keys, then check, sync and reload the clients.
- **Retest:** on a fresh player tab (its own `zz<n>.localhost` host), before the first attack, run
  `game.settings.get("enhancedcombathud","targetPickerGuideShown")` in the console. It returns
  `true`. With nothing targeted, click a weapon. No tutorial dialog appears, and the label at the
  cursor reads "0/1 Targets · right-click cancels" once the mouse moves (Argon writes the count only
  on a move). A right-click cancels it.

No pure logic was added, so there are no new fixtures (`combat-core` still has 219, all passing).

---

## Area 1 re-run — turn flow (fixer pass, 2026-10-10)

The re-run measured T1–T13 on ZZ Arena as `ZZ Tester` (with pentaryn-combat already installed, so
T1–T3 are not a true pre-module baseline). Fixes and streamlining below all live in a new file,
`foundry/module/pentaryn-combat/turnflow.mjs`. It is **imported by `hud.mjs`**, not listed in
`module.json`, so no world relaunch was needed. Each behaviour is a pentaryn-combat world setting
(default on). Off restores the previous behaviour for that item alone. Pure logic is in
`combat-core.mjs`, with fixtures 256–285 in `test/run.mjs` (249 pass).
`make foundry-combat-check foundry-combat-sync` passed, and so did `make foundry-adjustments-check`
(6 new registry rows `combat-argon-special-actions`, `combat-argon-reaction-slot`,
`combat-argon-portrait-conditions`, `combat-argon-hud-follows`, `combat-dnd5e-roll-dialog-esc`,
`combat-dnd5e-damage-at-zero`). The GM tab was reloaded once. **Player tabs must reload** to load
the new code.

**Verified live on the GM client** (scratch combat on ZZ Arena with ZZ Fighter 5 against ZZ Goblin 1,
deleted afterwards; test chat cards deleted; Fighter restored to 44 HP, 0/0 death saves, no
effects): Dash → walk 30→60, Argon movement max 6→12, Action pips 2→0. Disengage → effect. Both
were gone at the end of the Fighter's turn. Dodge → Dodging; still on during the goblin's turn,
gone at the start of the Fighter's round-2 turn. Hide → Stealth 16 vs DC 15, Hiding kept. The
Reaction slot read "Opportunity Attack: Longsword": attack 16 + auto-damage, Reaction pip 1→0,
Attack-action swings stayed 0. Esc on a fresh attack dialog (focus on its Normal button) closed it,
and its usage card was deleted. HP 0 + 5 damage → 1 failure; + 50 damage → 2 failures plus the GM
whisper. Prone appeared on the portrait with the PHB Prone text as its tooltip. HUD follow: two
tokens were selected and one was released, so the HUD moved to the one left. **Not verified live (player-only paths):**
`hudFollows` at a turn start and `clearTargetsAfterTurn`. Both run only on a non-GM client.

### U-1-4 (bug fix) — Dash, Disengage, Dodge, Hide, Ready and Shove do what they say

- **What / why:** T7 failed. Argon dnd5e's built-in action buttons call
  `consumeActionEconomy(this.item)` with a temporary Item that has no activation (checked live: all
  six have `activation: null` and no activities), so **no pip was ever spent**. Dash and Disengage
  only posted a card. Dodging is a status with no duration, and v14 expires only effects with a
  duration, so it **never ended**. Hide rolled nothing.
  Now each of those buttons is wrapped per instance (in `renderActionPanelArgonComponent`):
  - All six spend the Action pip on your own turn. They also write the turn flag, so the swing pips
    go to 0. Shove is one swing, because in 2024 it is an Unarmed Strike option.
  - A warning toast (never a block) appears when no Action is left: "You have already used your
    Action this turn…". Previously a Dodge after an Attack-action swing was silent.
  - **Dash** adds an effect "Dash" that adds each speed above 0 (PHB: extra movement equal to your
    Speed). A second Dash adds the same amount again.
  - **Disengage** adds a marker effect "Disengage".
  - Both are flagged `until: "turnEnd"`, and the active GM deletes them at your turn end.
  - **Dodge** keeps Dodging on (Argon toggles it, so a second click had switched it off). The active
    GM removes Dodging at its owner's next turn start, however it was applied (token HUD too).
  - **Hide** rolls Stealth with target 15 (`actor.rollSkill`; own dice work). Hiding stays only on a
    success, and a toast gives the total.
  - Only out-of-combat use or another creature's turn skips the pip, the flag and the effects.
  - If the actor owns an item of that name, dnd5e's own use flow counts it, and only the missing pip
    is spent.
- **Files / settings:** `turnflow.mjs` (`wrapSpecial`, `afterSpecial`, `addTurnEffect`, `dashBase`,
  `rollHide`, `sweep`, `combatTurnChange` and `deleteCombat` hooks). `combat-core.mjs`
  (`SPECIAL_ACTIONS`, `specialActionOf`, `actionsLeft`, `recordSpecialAction`, `dashChanges`,
  `expiringAt`). `settings.mjs` `specialActions`. `lang/en.json` `Turn.*`, `Setting.specialActions`.
  `README.md` Adjustments row. `foundry/adjustments.yml` `combat-argon-special-actions`.
- **Revert:** Configure Settings → Pentaryn Combat → **Dash, Disengage, Dodge and Hide do what they
  say** off. That restores Argon's card-only buttons and stops the sweep (Dodging then never
  expires again). To remove the code, delete `turnflow.mjs`, the `import "./turnflow.mjs"` line in
  `hud.mjs`, the 8 turn-flow keys in `settings.mjs` DEFAULTS and their `Setting.*` and `Turn` lang
  keys, the turn-flow block at the end of `combat-core.mjs` with fixtures 256–285, the
  `expectRoll`/`forgetRoll` additions (U-1-5), the 6 registry rows, and the README rows. Then
  check, sync and reload the clients. This entry and U-1-5 to U-1-10 share the file, so a full
  removal reverts all of them.
- **Retest (T7):** on your turn, click Dash. The card posts, the Action pips go to 0, and the movement
  bar shows double (6→12 squares for a Speed of 30). The portrait shows "Dash". End the turn and
  "Dash" is gone. Next turn, Dodge: Dodging shows on the portrait and token. It is still there on
  the goblin's turn and gone when your next turn starts. Hide: a Stealth roll window (own dice
  work). At 15 or more you stay Hiding and a toast gives the total. Below 15, Hiding is removed.
  Swing once with Full Attack, then click Dodge: a warning appears, the card still posts.

### U-1-5 (bug fix) — the Reaction weapon is an Opportunity Attack and spends the Reaction

- **What / why:** T6 failed. The Reaction bar's weapon slot read just "Longsword". Argon spends the
  weapon's own activation, which is the **Action**, whenever the actor is the current combatant
  (`consumeActionEconomy`). pentaryn then counted the swing as an Attack-action swing, so the
  Reaction pip never spent.
  Now the slot's label is **"Opportunity Attack: Longsword"** (an instance getter). A click announces
  the coming attack roll as a `reaction` (`sequence.mjs` `expectRoll`, read and dropped in
  `dnd5e.preRollAttackV2`; needed because dnd5e starts the roll after `use()` returns, without
  awaiting it). On a real use (`dnd5e.postUseActivity` for that activity), the Action pip Argon
  took is given back and the **Reaction** pip is spent. A cancelled use leaves nothing behind.
  Off-turn rolls were already classed as reactions, which is unchanged.
- **Files / settings:** `turnflow.mjs` (`wrapReactionSlot`). `sequence.mjs` (`expectRoll`,
  `forgetRoll`, `taggedKind` reads them). `combat.mjs` (`onPreRollAttack` drops it). Setting
  `reactionSlot`. Lang `Turn.OA`.
- **Revert:** setting **Opportunity Attack on the Reaction bar** off restores Argon's label and
  economy. Code: see U-1-4. The `expectRoll`/`forgetRoll` lines in `sequence.mjs` and the
  `forgetRoll` call in `combat.mjs` `onPreRollAttack` go with it.
- **Retest (T6):** GM moves a goblin out of the Fighter's reach. On the player tab, the Reaction bar
  reads "Opportunity Attack: Longsword". Click it, then pick or keep the target, then the dialog.
  The Reaction pip greys. The Action pips are unchanged. `game.pentaryn.combat.turn(actor).attackAction.swings`
  is unchanged. Also try it on your own turn (the case T6 hit): Reaction greys and the Action pips
  stay.

### U-1-6 (bug fix) — Esc closes a roll window; a cancelled attack takes its card with it

- **What / why:** T3. dnd5e autofocuses the roll dialog's default button, and core's
  `KeyboardManager` ignores every keybinding while a form button has focus. So Esc did nothing until
  the player clicked into the dialog. U-2-1 fixed this only while a Full Attack runs. Now a document
  keydown listener closes the dnd5e `.roll-configuration` dialog that holds focus, or the topmost
  one when nothing is focused. Text fields and selects keep their native Esc, and a running Full
  Attack still handles its own Esc (pause).
  dnd5e also posts the usage card **before** the attack dialog opens, so every cancel left an orphan
  "Longsword Attack" card. Now `closeAttackRollConfigurationDialog` with no rolls deletes the usage
  card it threads under (`message.data.system.origin`), but only when all of these hold: it is this
  user's card, under 5 minutes old, nothing was consumed (`system.deltas` empty), no message is
  threaded under it, and no Full Attack is running (which reuses its card).
- **Files / settings:** `turnflow.mjs` (`rollDialogFor`, the keydown listener, `consumedAny`, the
  close hook). `combat-core.mjs` `orphanUsage`. Settings `escRollDialog`, `tidyCancelledAttacks`.
- **Revert:** turn off **Esc closes a roll window** and/or **Remove the card of a cancelled attack**.
  Code: see U-1-4.
- **Retest (T3 undo):** click a weapon with a target set. When the dialog opens, press Esc **without
  clicking**. The dialog closes, the pip is not spent, and the "Longsword Attack" card disappears
  from chat within a second. A Full Attack's Esc still pauses (U-2-1). Typing in the dialog's bonus
  field and pressing Esc leaves the field, not the dialog.

### U-1-7 (bug fix) — damage at 0 HP is a Death Saving Throw failure

- **What / why:** T9. Per the PHB (Damage and Healing → Dropping to 0 Hit Points), "If you take any
  damage while you have 0 Hit Points, you suffer a Death Saving Throw failure. If the damage is from
  a Critical Hit, you suffer two failures instead." dnd5e 6.0.6 does not do this, and the GM had to
  edit the tally. Now `dnd5e.preApplyDamage` adds the failure(s) to the same HP update, for
  characters only. Temporary HP absorbs first. A crit is read from the originating damage message's
  rolls. A chat line says "… a Death Saving Throw failure (n of 3)". **Massive damage** (at 0 HP and
  damage ≥ HP max; or the remainder past 0 ≥ HP max) is **whispered to the GM and never applied**,
  so Joe rules on a PC death.
- **Files / settings:** `turnflow.mjs` (the `dnd5e.preApplyDamage` hook). `combat-core.mjs`
  `damageAtZero`. Setting `deathSaveDamage`. Lang `Turn.DeathFail*`, `Turn.Massive`.
- **Revert:** setting **Damage at 0 HP is a death save failure** off. Code: see U-1-4.
- **Retest (T9):** set the Fighter to 0 HP. A goblin hits him (damage applied from the tray): one ✗
  on the portrait and a chat line. A crit gives two. Apply 50: a GM-only whisper about massive
  damage, and nothing else changes. Heal: the failures clear (native).

### U-1-8 (bug fix) — conditions show on the HUD portrait, with the rule

- **What / why:** T8. Argon's portrait lists `actor.temporaryEffects`. In v14, `isTemporary` needs
  a duration, so a status such as Prone, Poisoned, Grappled or Dodging no longer counted. The
  player's HUD showed nothing. Now `CONFIG.ARGON.PORTRAIT.PortraitPanel.prototype.getEffects` is
  wrapped at `ready` and adds every active status-only effect. Its tooltip is the effect's own
  description, or else the condition's PHB page (`CONFIG.DND5E.conditionTypes[id].reference`,
  cached). Right-click removal is Argon's own and unchanged. Display only: no data is written.
- **Files / settings:** `turnflow.mjs` (`patchPortrait`, `tooltipFor`). `combat-core.mjs`
  `portraitExtras`. Setting `portraitConditions`.
- **Revert:** setting **Conditions on the HUD portrait** off (the wrapper then returns Argon's
  list). Code: see U-1-4.
- **Retest (T8):** GM toggles Prone, Grappled and Poisoned on the Fighter. All three icons appear on
  the player's HUD portrait. Hovering Prone shows "While you have the Prone condition…". Right-click
  → confirm removes it.

### U-1-9 — the HUD follows your token

- **What / why:** T4/T9/T12. Clicking one token of a selected group releases the others but never
  fires `controlToken(true)` for the clicked one, so Argon stayed on the token it had (a "real
  click did not" switch the HUD). Now, when exactly one owned token is left selected and Argon is
  on, the HUD binds to it. Also for players: when one of **your** combatants' turn starts on the
  scene you are viewing, and Argon is on, that token is selected. This is for a player with a
  companion or several tokens.
- **Files / settings:** `turnflow.mjs` (`controlToken` hook, `combatTurnChange` branch). Setting
  `hudFollows`.
- **Revert:** setting **HUD follows your token** off. Code: see U-1-4.
- **Retest:** select two owned tokens (Shift), click one of them: the HUD shows that one. In combat on
  the ZZ Tester tab (owns several ZZ PCs): advance to the Paladin. The Paladin is selected and the
  HUD shows the Paladin without toggling Argon.

### U-1-10 — targets are released when your turn ends

- **What / why:** T3/T5. This is the cost U-R-1 recorded: a target kept from earlier skipped the
  picker and sent a swing at a goblin 15 ft away. Now a player's own targets are released when a
  combatant they own ends its turn. Pre-targeting during someone else's turn still works for your
  own turn. GM clients are not touched.
- **Files / settings:** `turnflow.mjs` (`combatTurnChange` branch, `releaseTargets`). Setting
  `clearTargetsAfterTurn`.
- **Revert:** setting **Release targets when your turn ends** off. Code: see U-1-4.
- **Retest (T5):** target Goblin 1 and swing, then End Turn: the target marker goes. Next turn, click
  a weapon. The "0/1 Targets" picker opens instead of swinging at Goblin 1.

### U-1-11 — test fixtures and GM habits (world data and test plan)

- **What / why:** T1/T4/T5 friction was partly fixture. `ZZ Tester` had no assigned character, so
  core showed the User Configuration dialog at login. Core also controlled **all** owned tokens on
  every scene load (`Canvas#initializeTokenControl`, no character → every OWNER token), which made
  the group drag in T5 and the stuck HUD in T4. Real players have a character. ZZ Paladin 5 had 0
  spell slots. The Paused banner stayed on players because `game.togglePause(false)` without
  `{broadcast: true}` unpauses only the GM tab (v14).
- **Files / settings:** world: `ZZ Tester` character → ZZ Fighter 5. ZZ Paladin 5 slots refilled
  4/4, 2/2 (they were 3/4 after the run's own refill). Test plan §1 ground rule 11 (new).
- **Revert:** `game.users.getName("ZZ Tester").update({character: null})`. Delete ground rule 11.
  The slots need no revert.
- **Retest:** log in as ZZ Tester. No User Configuration dialog appears, and only ZZ Fighter 5 is
  selected on ZZ Arena. A drag moves one token.

### U-1-12 — "Where is my X" tips: HUD recovery, Shift-targets, rests, the new turn flow

- **What / why:** T4/T10/T11. The player tips journal had no word on getting the HUD back, adding
  targets with Shift, or the HUD's rest buttons (Argon shows bed and cup buttons out of combat; the
  T11 tester was in combat). Eight lines were appended: HUD missing, several targets, last turn's
  target, rests, Dash/Dodge/Disengage/Hide, Opportunity Attack, conditions, closing a roll window.
- **Files / settings:** world journal "Where is my X — player tips" `tmVh6WdF5E8OB6wT`, page
  `hkhCI1ZqkET8YmAN`. Eight `<li>` added before `</ul>`.
- **Revert:** delete the eight `<li>` from "HUD missing (after a reload)" to "Closing a roll window".
- **Retest:** open the journal as the player. The eight tips are at the end of the list.

### Not changed — notes for the retester

- **Console:** the GM-side `updateEmbeddedDocuments` batch error ("Cannot set properties of
  undefined (setting last)") is core's token animation on a batch update from `eval-js`. It is not
  player-facing. Workaround already used: per-token updates with `animate: false`.
- **T11 rests:** Argon's rest buttons exist but hide while a combat is **started**
  (`DND5eButtonHud.visible`). That is a sane rule; tested out of combat they are one click + the
  dnd5e dialog.
- **T12:** the HUD switching on a turn change is now U-1-9 for players. The GM's HUD is not moved.

### Proposals (Area 1 re-run) — for Joe to decide

- **P-1-c — Players apply their own healing (T9 Lay on Hands).** The Healing card had no Apply
  button on the player tab because dnd5e's world setting **Allow Player Damage Tray**
  (`dnd5e.allowPlayerDamageTray`) is off, so every heal waits on the GM. Options: (1) turn the native
  setting on. Players then get the tray on damage and healing cards, but can only change actors they
  own; healing an ally they do not own still fails on permission. (2) A pentaryn healing-only
  "Apply to target" that the GM client carries out (needs a socket), so any player can heal any
  ally. It breaks "nothing is applied without the GM's tray" for heals only. Not applied: it changes
  who applies HP at Joe's table.
- **P-1-d — Initiative before the HUD exists (T1).** The HUD's Roll Initiative appears only after the
  combat starts. Options: when the GM adds a player's token to the tracker, post that player a
  whispered "Roll initiative" card (one click, own dice still work). And/or skip dnd5e's Configure
  Roll dialog for initiative when there is no choice to make (Champion advantage would still roll
  2d20 and keep the higher). Not applied: it adds a chat card per combatant, which is Joe's call.
- **P-1-e — Opportunity Attack prompt (T6).** When an enemy token leaves a PC's reach during the
  enemy's turn, whisper that player an "Opportunity Attack on Goblin 1?" card with one button, which
  targets and swings with the Reaction weapon. Needs a reach check on movement (`updateToken` with
  `_movementHistory`) and Disengage awareness (U-1-4's effect). Bigger build; not applied.
- **P-1-f — Death save in one click (T9).** The skull opens dnd5e's save dialog every time. A
  pentaryn shortcut could roll it with the dialog skipped (the manual dice box still shows), or
  dnd5e's fast-forward modifier could be shown as a tip. Not applied: it is a dialog skip for one
  roll type, so Joe should decide whether he wants dialogs skipped at all.
- **P-1-g — Bless and Concentration in fewer steps (T10).** Bless needs 7+ clicks: targets (Shift),
  Cast, Apply Blessed, plus a separate Concentration save. Options: auto-apply a spell's effects to
  its targets when the caster owns them, or when the GM allows it. And a Shift-click cue on the
  "N/3 Targets" label (as U-R-2 did for right-click). Not applied: auto-apply interacts with
  pentaryn-aoe's tray.
- **P-1-h — Condition-aware attack dialogs (T8).** dnd5e 6 does not set Advantage or Disadvantage
  for Poisoned, Prone (attacker or target within 5 ft), Dodging, Restrained or Blinded. A
  `dnd5e.preRollAttackV2` hook could pre-select the mode with a one-line reason in the dialog (the
  player can still change it). Not applied: the rules are wide (sight, range, cancellation), so this
  needs its own design and tests.
- **P-1-i — Argon "always on" for players (T4).** The client setting `enhancedcombathud.alwaysOn`
  makes the HUD appear whenever a token is selected, out of combat too, which also covers the
  reload case. pentaryn.md records it as off on purpose (HUD only in combat). U-1-9 and the tips
  now cover the reload case, so only flip it if players still miss the HUD.
- **P-1-j — Hit/miss leak (T13).** With `attackRollVisibility: none`, pentaryn-aoe's auto-damage
  rolls only on a hit, so the player can infer a hit. The goblin's item text also shows its attack
  bonus. Options: hide the monster item description on player cards, or make aoe roll damage
  regardless and let the GM's tray decide. Joe's design call.
- **P-1-k — Cunning Action / Step of the Wind Dash.** The Bonus-action Dash and Disengage come from
  the actor's own items (dnd5e), so they get no U-1-4 movement effect. They could get the same
  "Dash" effect by identifier (`cunning-action`, `step-of-the-wind`). Small; left for the Rogue and
  Monk re-run to confirm the need.
- **P-1-l — Out-of-reach warning for a kept target.** U-1-10 clears stale targets at turn end. A
  target set this turn but out of the weapon's reach still skips the picker. A toast ("Goblin 3 is
  15 ft away; Longsword reaches 5 ft") before the dialog would catch it without adding a click.

---

## Area 2 re-run — Melee: Full Attack, Extra Attack, off-hand (fixer pass 2, 2026-10-10)

The re-run passed every case's click budget except A11 (7 vs 4) and found one rules bug (the Nick
offer), three tooltip faults, a test-plan error (A7) and a core console error on the GM tab. All
code is in `foundry/module/pentaryn-combat/`. Pure logic is in `combat-core.mjs` (`followUps`,
new `planSummary`, `dockRect`, `swingTag`), with fixtures 290–308 in `test/run.mjs` (268 pass).
Two new world settings, default on: `dockRollDialogs`, `scrollingTextGuard` (22 settings now).
`make foundry-combat-check foundry-combat-sync` and `make foundry-adjustments-check` pass (5 new
registry rows: `combat-core-scrolling-text-guard`, `combat-dnd5e-roll-dialog-dock`,
`combat-argon-offhand-slot-dup`, `combat-argon-picker-cue-position`, `combat-argon-tooltip-refresh`).
The GM tab was reloaded. **Player tabs must reload** to load the new code.

**Verified live on the GM client:** the PreciseText double destroy is now a no-op and floating
text is skipped while the tab is hidden; `followUps` on ZZ Fighter 5's real weapon shapes
(Longsword + Shortsword + Dagger, Dual Wielder, after two Shortsword swings) returns Nick: Dagger
(free) and Off-hand: Longsword, and the Full Attack plan's Nick swing is the same Dagger; with a
running strip, an attack roll window opened at bottom 712 px against the strip's top 720 px
(no overlap), titled "Attack Roll · Longsword, swing 2 of 3", strip hint "Enter = Normal · Esc =
pause"; the window was closed unrolled, 0 chat messages. **Not verified live (player tab):** the
Bonus-slot hide, the picker cue placement, the tooltip refresh / mouseleave, the tile stats.

### U-2-3 — Roll windows sit above the swing strip and name the swing

- **What / why:** A1/A6/A10/A11/P. The first swing's window, and the taller ones with Ability or
  Weapon Mastery rows, covered the strip, so Adv / Dis / **Quick** / **Stop** could not be reached
  without pressing Esc first. Normal also moved between dialogs (y 814 / 572 / 587), so mouse users
  had to re-aim every swing. Neither the dialog nor the manual-dice Roll Resolution window said which
  swing it was. Now, while a Full Attack or follow-up runs, every dnd5e roll window and core's
  RollResolver is placed with its **bottom edge 8 px above the strip**, centred. The buttons sit at
  the same height for every swing, whatever the window's height. A window the player drags sets the
  place for the next ones (this session). The title gains "· Longsword, swing 2 of 3" (and
  "(Nick)" for the Nick swing; not for a one-swing follow-up). The strip shows "Enter = Normal · Esc =
  pause" (paused: "Esc = Stop"). The tester confirmed Enter rolls Normal, which settles P-2-a; the
  Full Attack tooltip's footer now says so and points at Quick.
- **Files / settings:** `strip.mjs` (`dock`, `redock`, `tagTitle`, `onRollWindow`, hooks
  `renderRollConfigurationDialog`, `renderRollResolver`, `close…`; `.pc-keys` in `paint`).
  `combat-core.mjs` `dockRect`, `swingTag`. `lang/en.json` `Strip.Keys`, `Strip.KeysPaused`,
  `Strip.SwingTag`, `Strip.SwingTagWeapon`, `Hud.FullAttackHint`, `Setting.dockRollDialogs`.
  `styles/combat.css` `.pc-keys`. Setting `dockRollDialogs`.
- **Revert:** setting **Roll windows above the swing bar** off (windows open centred again, no
  title tag; the "Enter = Normal" hint stays). Code: delete the "roll windows docked above the strip"
  block and the `redock()` call in `update()` from `strip.mjs`, the `.pc-keys` span and `keys` line in
  `paint`, the `dockRollDialogs` default in `settings.mjs`, and `dockRect` / `swingTag` with fixtures
  302–308; check + sync; reload clients.
- **Retest (A1, A10, A11, P):** Full Attack on the Ogre. Dialog 1 opens just above the strip and
  the strip's Quick and Stop are visible beside it. The title reads "… Longsword, swing 1 of 2".
  Press Enter: swing 2's dialog opens with its Normal button where swing 1's was. Tick Quick during
  dialog 1 (A10 discovery should be 3 clicks: Full Attack, Quick, Enter). On Manual dice the Roll
  Resolution window reads "Roll Resolution · Longsword, swing 1 of 2" for both the d20 and the d8.
  Drag dialog 1 elsewhere, roll: dialog 2 opens at the dragged place. Fighter 11's taller dialog
  (Weapon Mastery row) still ends just above the strip.

### U-2-4 (bug fix) — The Nick offer matches the Full Attack plan; Dual Wielder keeps its own attack

- **What / why:** A5. With Longsword, Shortsword and Dagger equipped (Fighter 5, Dual Wielder),
  Full Attack planned the Nick swing with the Dagger, but after Stop the bars offered
  "Off-hand: Longsword" (Bonus) and no **Nick: Dagger**, because `followUps()` took the first
  qualifying partner. Per the PHB (Weapons → Light property, Mastery → Nick, Feats → Dual Wielder),
  the Light property gives one extra attack, which Nick moves into the Attack action; Dual Wielder's
  Enhanced Dual Wielding is a second, separate Bonus-action attack with any one-handed melee weapon.
  So `followUps()` now prefers a Nick-capable partner (the same weapon `extraSwings()` plans), and
  with Dual Wielder it also offers the Bonus-action Off-hand next to Nick (preferably with another
  weapon, e.g. the Longsword). That offer stays after Nick is used, and Nick stays after it. Without
  Dual Wielder there is still exactly one Light extra attack: Nick if a Nick partner exists, else
  Off-hand, and either one used ends both.
- **Test plan:** A7 as written (Longsword main + Scimitar) could not pass: the Light extra attack
  needs a Light weapon in the Attack action, and a Scimitar is Nick (a free Nick swing, not a Bonus
  one). A7/A8 now use **Shortsword + Longsword** with damage `1d8` flat / `1d8 + 3`
  (`usability-test-plan-2026-10.md`, rows A7/A8).
- **Files:** `combat-core.mjs` `followUps` (Light block). Fixtures 290–297. Test plan rows A7/A8.
  `README.md`, `context/foundry/melee.md`.
- **Revert:** restore the Light block of `followUps` to the single-partner version
  (`if (lightUsed && !t.followUps.includes("offhand") && !t.nick) { const second = partnerWeapon(weapons,
  lightUsed.id, w => offhandCapable(w, { enhancedDualWielding })); if (second) { if (nickCapable(second,
  { enhancedDualWielding })) out.push({ kind: "nick", weaponId: second.id, free: true }); else if (bonusOk)
  out.push({ kind: "offhand", weaponId: second.id }); } }`), delete fixtures 290–297; check + sync;
  reload clients. Revert the A7/A8 rows to Scimitar / `1d6`.
- **Retest (A5, A7):** Fighter 5 with Longsword, Shortsword and Dagger equipped; Full Attack with
  the Shortsword, Stop after swing 2. The Special bar shows **Nick: Dagger** (gold pulse) and the
  Bonus bar **Off-hand: Longsword**. Click Nick: one dialog, dagger `1d4` flat; Off-hand: Longsword
  is still there. Unequip the Longsword and repeat with the TWF clone: the Bonus bar offers
  Off-hand: Dagger next to Nick. A Rogue without Dual Wielder (Shortsword + Scimitar + Dagger)
  gets Nick only.

### U-2-5 (bug fix) — The Full Attack tooltip: right numbers, fresh, gone when you leave

- **What / why:** A0/A4/A5. (1) For a Nick pair it read "3 of 2 swings left this turn" and named
  only the main weapon: it counted the Nick swing as a main one. Now "2 of 2 swings left this turn,
  + Nick: Dagger" and "Attacks with Shortsword, then Dagger as the free Nick attack …". (2) Argon
  builds a tooltip once on mouseenter, so one left open across a swing by hand kept "2 of 2". Our
  Full Attack button now re-renders its open tooltip whenever the turn flag changes (its badge
  refresh). (3) Argon's own mouseleave is commented out, so tooltips stayed open when the pointer
  moved and lingered over roll windows. Our buttons (Full Attack, follow-ups, Special-bar toggles)
  close their tooltip on mouseleave, and any Argon tooltip closes when a roll window or Roll
  Resolution window opens.
- **Files / settings:** `hud.mjs` (`getTooltipData` of `FullAttackButton`, `ownTooltip`,
  `refreshOwnTooltip`, `bindTooltipLeave`, `activateTooltipListeners` overrides, the two render
  hooks). `combat-core.mjs` `planSummary` (fixtures 298–301). `lang/en.json` `Hud.WithNick`,
  `Hud.PlusNick`. Tied to setting `fullAttack`.
- **Revert:** setting **Full Attack button** off removes all of it with the button. Code: restore
  the `subtitle` / `what` lines of `getTooltipData` (`left: st.plan.swings.length, total: st.count`),
  delete `ownTooltip`, `refreshOwnTooltip`, `bindTooltipLeave`, the three `activateTooltipListeners`
  overrides, the `refreshOwnTooltip(this)` call in `refresh()` and the
  `renderRollConfigurationDialog` / `renderRollResolver` loop in `hud.mjs`; check + sync; reload.
- **Retest:** hover Full Attack on the Shortsword + Dagger set: "2 of 2 swings left this turn, + Nick:
  Dagger". Swing once with the Shortsword by hand, then hover Full Attack before
  the damage settles and keep the pointer there: the open tooltip changes to "1 of 2" by itself. Move off the button: the
  tooltip closes at once. Hover a weapon and click it: no tooltip over the roll window.

### U-2-6 (bug fix, console) — No floating text in a background tab; a double destroy is ignored

- **What / why:** Area 2 console: 106 × "Cannot read properties of null (reading 'off')" at
  `PreciseText.destroy` ← `InterfaceCanvasGroup#createScrollingText` (core 14.369), in bursts, on the
  GM tab. Root cause (read from `foundry.mjs` 178029–178091 and confirmed live: 10 scrolling-text
  animations waiting at time 0 on the hidden GM tab, the ticker 2.2 M ms behind): a background tab
  gets no animation frames, so each floating damage number waits in its animation. A canvas redraw
  (another scene activated, or the page unloading) destroys the layer with the text in it and
  resolves the waiting animations, and core then calls `text.destroy()` a second time. Now
  `createScrollingText` returns at once while `document.hidden` (nobody sees it; it also stops the
  pile-up), and `PreciseText#destroy` returns when the text is already destroyed. Core files are
  untouched; both are prototype wrappers installed at `init`.
- **Files / settings:** `turnflow.mjs` (last block). Setting `scrollingTextGuard`. Registry row
  `combat-core-scrolling-text-guard` (native when core checks `text.destroyed` or skips hidden tabs).
- **Revert:** setting **No floating text in a background tab** off (both wrappers then pass
  through). Code: delete the "floating canvas text in a background tab" block from `turnflow.mjs`,
  the setting default and lang keys, and the registry row; check + sync; reload.
- **Retest:** with the GM tab in the background, a player applies damage several times; activate
  another ZZ scene and back from the GM bridge; bring the GM tab forward. The console has no
  "reading 'off'" errors. With the GM tab in front, damage numbers still float.
- **Note for the retester:** the GM console read at 18:10:10 also held 38 × core
  `#postNotification` "setting 'hidden'" and one dnd5e `calculateDamage` error. All share the
  timestamp of this fixer's reload of the old page (page unload of a long-hidden tab), and none
  appeared after the new page loaded at 18:11:09. They are unload noise, not a player path; recheck
  that no such error appears outside a reload.

### U-2-7 — Pause-bar weapon tiles say what each weapon does

- **What / why:** A12. The swap tiles showed only name and icon, so the choice was not informed.
  Each tile now adds the attack's to-hit and damage labels ("+6 · 1d6 + 3 Piercing"), as the
  right-click weapon picker already did.
- **Files:** `sequence.mjs` (`swapTile`, `stripContext`), `strip.mjs` (tile markup),
  `styles/combat.css` (`.pc-weapons button .pc-stats`). Tied to `fullAttack`.
- **Revert:** in `sequence.mjs` go back to `weapons: current.swappable ? weaponsOf(current.actor)
  .filter(core.canSwing) : []` and delete `swapTile`; in `strip.mjs` restore the tile button body to
  `<img …>${esc(w.name)}`; delete the CSS rule; check + sync; reload.
- **Retest (A12):** Full Attack, Enter, Esc on dialog 2: each tile reads name + to-hit · damage.

### U-2-8 — Argon's duplicate off-hand slot hides while "Off-hand: X" is offered

- **What / why:** A7. The Bonus bar showed Argon's own plain "Longsword" weapon-set slot next to our
  "Off-hand: Longsword", a duplicate-looking button that does not preset the Offhand mode. While our
  Off-hand button offers that same weapon, Argon's slot is hidden (CSS class
  `pentaryn-combat-dup`); it is back as soon as ours is gone (used, Bonus spent, next turn).
  Before the Attack action nothing changes.
- **Files:** `hud.mjs` (`hideDuplicateSlots`, called from `composeBonusBar` and the
  `renderItemButtonArgonComponent` hook), `styles/combat.css` (`.extended-combat-hud
  .pentaryn-combat-dup`). Tied to setting `followUps`.
- **Revert:** setting **Follow-up buttons** off (with all follow-ups). Code: delete
  `hideDuplicateSlots`, its two calls in `composeBonusBar`, the second `try` block of the
  `renderItemButtonArgonComponent` hook and the CSS rule; check + sync; reload.
- **Retest (A7):** Shortsword click, roll: the Bonus bar shows **Off-hand: Longsword** and no plain
  Longsword slot; after the off-hand roll the plain slot is back.

### U-2-9 — The target picker's cue starts at the pointer

- **What / why:** A2. Argon creates its "0/1 Targets" label empty at the page's top-left and
  positions and fills it only on the first mousemove, so "· right-click cancels" sat pinned in the
  corner. A MutationObserver places a new label at the last pointer position (where the HUD button
  was clicked) with "Click a creature to target"; Argon's own text takes over on the first move.
- **Files / settings:** `hud.mjs` (pointer tracker and observer after `applyPickerGuide`),
  `lang/en.json` `Hud.PickerStart`. Tied to setting `skipPickerGuide`.
- **Revert:** setting **Skip Argon's Target Picker Tutorial** off (also brings the tutorial back).
  Code: delete the block from `let pointer = null;` to the observer's `Hooks.once("ready", …)`; check +
  sync; reload.
- **Retest (A2):** with nothing targeted, click Full Attack without moving the mouse: the label sits
  next to the pointer and reads "Click a creature to target · right-click cancels".

### U-2-10 — Stop's tooltip says what it does with a window open

- **What / why:** A11. Stop clicked while a roll window is open ends the sequence after that roll
  (the window stays; no further window opens). Now that the strip is reachable during dialog 1
  (U-2-3), A11 is Full Attack, **Stop**, Enter, cantrip, Enter (6, was 7). The hint says so.
- **Files:** `lang/en.json` `Strip.StopHint`.
- **Revert:** restore `Strip.StopHint` to "End the Full Attack here. Swings not taken stay
  available."; sync; reload.
- **Retest (A11):** Full Attack, click Stop on the strip while dialog 1 is open, press Enter: swing 1
  rolls, no dialog 2, the pip shows 1. Cast Fire Bolt: the pip goes to 0.

### Proposals (Area 2 re-run) — for Joe to decide

- **P-2-f — Quick from the start, and on by default for 4+ swings.** U-2-3 makes Quick visible
  during swing 1, so first-time discovery drops from 5 clicks to 3. Options: a "Quick" toggle on the
  Special bar (per player, as the rider Ask/Auto toggle) so it is set before the first click; and/or
  default Quick on for characters with 4+ swings (Fighter 20). Not applied: a default dialog skip is
  Joe's call (see P-1-f), and Advantage on later swings then needs the strip's Adv toggle.
- **P-2-g — A swapped weapon threads under the sequence's usage card.** A12 expected the
  Shortsword swing under the Longsword's usage card; the sequence posts one usage card per item so
  each item's own ammo, uses and the action economy go through dnd5e. Threading under another item's
  card would skip the swapped item's consumption and may confuse dnd5e's activity lookup on the
  damage button. Option: keep the card per item, but put "(swing 2 of 2 — Full Attack)" on it.
  Needs a test of the damage button on a cross-threaded card before any change.
- **P-2-h — Use the last or only hostile target (P-4-b).** Full Attack with nothing targeted is 4
  clicks; auto-targeting the only hostile in reach would make it 3. Opt-in only; the U-R-1 stale
  target cost argues against default on.
- **P-2-i — Name the swing in the chat card.** Attack cards already carry `flags.pentaryn-combat.swing`;
  a small "Swing 2/2" tag in the card header would help a GM reading the log. Cosmetic; not applied.
- **Concurrency:** none seen this pass; only the GM was logged in when the GM tab was reloaded.

## Area 3 re-run (2026-10-10) — U-3-7

| Id | Change | Where | Why | Revert | Retest |
|---|---|---|---|---|---|
| U-3-7 | Our Special-bar toggles (Sneak Attack Ask/Auto, Reckless, New turn) were invisible for a Rogue or Barbarian: Argon never attaches a Special panel that had no buttons at HUD build, so the toggles sat in a detached panel. `applyButtons` now attaches the panel before the Pass panel when it gains buttons. | `foundry/module/pentaryn-combat/hud.mjs` `applyButtons` | B4, D1 (live) | delete the `if (next.length && !panel.element.isConnected)` block, `make foundry-combat-sync`, reload player tabs | Rogue and Barbarian HUD show "Sneak Attack: Ask" / "Reckless Attack: Off" under SPECIAL (checked live on the Barbarian after reload; Rogue checked by console injection) |

## Area 3 re-run — fixer pass 2 (2026-10-10)

The Area 3 re-run failed on B4 (fixed by the tester as U-3-7) and F1 (Divine Smite over budget), with
friction on D1, E2 and F2. This pass fixes the bugs and console errors at their root and applies the
low-risk streamlining. All code is in `foundry/module/pentaryn-combat/`. `make foundry-combat-check`
passes with 282 fixtures (14 new: 309–322); `make foundry-adjustments-check` passes (6 new rows). The
module was synced and the GM tab reloaded twice, each time with no roll window open and only the GM
logged in. **Player tabs must be reloaded** before the retest.

Each change was checked live on the GM tab against a throwaway combat on ZZ Arena (Barbarian, Rogue,
Polearm, Goblin 1), with Argon bound by `ui.ARGON.bind`. Activities were used through
`activity.use()`, not a real mouse. Everything created was removed afterwards (see the end of this
section). Two things were not checked by eye, because the GM tab is in the background: the drawer's
on-screen position (CSS transitions do not run in a hidden tab; the `left` it was given was checked)
and the tooltip drop over a usage dialog.

**Bug notes that need no code:**

- **B4 Rogue toggle.** U-3-7 is loaded. The Rogue's Special bar was not re-checked by eye in this pass.
- **Console, 6:10:10 PM burst** (`#postNotification` "setting 'hidden'" ×38 and `PreciseText.destroy`
  "reading 'off'"). This is the same burst, with the same timestamp, that U-2-6 recorded as the unload
  of the old page. The `'off'` half is guarded by U-2-6. The `'hidden'` half had a root cause of its
  own, now fixed in U-3-14.
- **`#createAnimationMovementPath` "setting 'last'".** This came from the tester's eval moving a token
  with an animated update during combat. It is a core path that a player's drag does not take. For
  test evals, use `{teleport: true, animate: false}`.
- **`endCombat()` timed out in eval.** It opens a confirm dialog in the background GM tab. In evals,
  use `combat.delete()`.
- **Sneak hint "Advantage ✗"** is read from that swing's own roll, which is correct and cannot go
  stale. Only the ally line could go stale, and U-3-12 recomputes it on hover.

### U-3-8 (bug fix) — Bonus-action features spend the Bonus pip

- **What / why:** D1 and F1 found that Rage, Steady Aim and Divine Smite left the Bonus pip at 1/1.
  The root cause is in Argon dnd5e: `DND5eItemButton._onLeftClick` calls `consumeActionEconomy` only
  when the button is bound to an *activity*. An *item* button (most features and spells) returns
  `item.use()` early and spends nothing. Now `dnd5e.postUseActivity` handles any non-attack
  activity with activation `bonus` that is used on the actor's own turn in combat. It marks the
  turn's `bonusUsed`, which closes Off-hand, Flurry, Martial Arts, Hew and Pole Strike for the turn,
  as the rules require. It also greys the Bonus pip. Bonus-action attacks (Pole Strike, Off-hand)
  are still counted on their roll, as before.
- **Files / settings:** `combat.mjs` (`onPostUseActivity`, bonus branch), `hud.mjs` (hook
  `pentarynCombat.bonusAction`), `combat-core.mjs` (`recordBonusAction`), `settings.mjs` +
  `lang/en.json` (new world setting **`bonusPip`**), `test/run.mjs` 309–311, registry row
  `combat-argon-item-button-bonus-pip`.
- **Revert:** turn the world setting *Bonus-action features spend the Bonus pip* off. For the full
  revert, delete the `if (activity.activation?.type === "bonus") {…}` block in
  `onPostUseActivity`, the `pentarynCombat.bonusAction` hook in `hud.mjs`, `recordBonusAction`,
  the setting default, its lang keys and the registry row. Then check, sync and reload.
- **Retest:** on ZZ Barbarian 5's turn, use Rage. The Bonus pip greys, and Off-hand and Hew don't
  appear. On ZZ Paladin 5's turn, use Divine Smite or Lay on Hands: the pip greys. Verified live
  for Rage (pip 1 → 0, `bonusUsed` true), Steady Aim (pip 0) and Pole Strike (pip 0).

### U-3-9 — Rage switches its effect on when used (no Apply click)

- **What / why:** D1 found that Rage took 3 clicks: the button, the usage dialog, then Apply on the
  chat card. A self-target activity with exactly one applicable effect now applies that effect to
  its user right after use. It does this through dnd5e's own `EffectApplicationElement
  #_applyEffectToActor`, built in memory with the usage card as its `chatMessage`, which is exactly
  what Apply does, so origin, duration, scaling and concentration links are dnd5e's. Nothing happens
  if an enabled copy from the same source is already on the actor. Rage now takes 2 clicks.
  Self-only features with a single effect on other characters (Patient Defense, Innate Sorcery,
  Shield) switch on the same way. A self activity with two or more effects (a choice) is left to the
  card.
- **Files / settings:** `turnflow.mjs` (`applySelfEffect`), new world setting **`selfEffects`**,
  registry row `combat-dnd5e-self-effect-apply` (retire_class `guarded`).
- **Revert:** turn the setting *Self effects switch on when used* off. For the full revert, delete
  `applySelfEffect` and its call in the `dnd5e.postUseActivity` hook at the end of `turnflow.mjs`,
  the setting, its lang keys and the registry row. Then check, sync and reload.
- **Retest:** ZZ Barbarian 5 uses Rage and confirms the dialog. The portrait shows Rage and the card's
  Apply is not needed. Verified live: the effect "Rage" was enabled with its six changes, a 10-minute
  duration and `system.origin.activity` = the Rage activity. Rage uses went 0 → 1.

### U-3-10 — Steady Aim sets up the Advantage (and Speed 0)

- **What / why:** B1 found that Steady Aim only posted a card, so the player had to remember to click
  Advantage. PHB 2024: "Advantage on your next attack roll on the current turn … your Speed is 0
  until the end of the current turn." Using it now adds an effect "Steady Aim" with every ability's
  `attack.roll.mode` +1, so the roll window opens with Advantage as its default and Enter takes it,
  and with every Speed overridden to 0. After the next attack roll, the Advantage changes go and the
  Speed 0 stays. The turn-end sweep (`until: "turnEnd"`) removes it. Out of combat, the whole effect
  goes after the attack. A cancelled roll keeps it.
- **Files / settings:** `turnflow.mjs` (`steadyAim`, a `dnd5e.postRollAttack` hook),
  `combat-core.mjs` (`steadyAimChanges`, `steadyAimAfterAttack`), new world setting
  **`steadyAim`**, lang `Turn.SteadyAim*`, `test/run.mjs` 319 and 322, registry row
  `combat-dnd5e-steady-aim-effect`.
- **Revert:** turn the setting *Steady Aim sets up Advantage* off. For the full revert, delete the
  Steady Aim block and its `postRollAttack` hook in `turnflow.mjs`, the two core helpers and their
  fixtures, the setting, its lang keys and the registry row. Then check, sync and reload.
- **Retest (B1):** on ZZ Rogue 5's turn, Steady Aim. A notice appears and the portrait shows Steady
  Aim. Click Rapier: the dialog's default button is **Advantage**, so B1 drops from 4 clicks to 3
  (Steady Aim, Rapier, Enter, then + Sneak). After the swing, Speed stays 0. At the next turn the
  effect is gone. Verified live: default `advantage`, the effect stayed after a cancelled roll,
  `hasAdvantage` true, then only the 5 movement changes were left (dex mode 0, walk 0), and walk was
  30 again after `nextTurn`.

### U-3-11 — Argon's drawers open above their button; Pole Strike gets its own button

- **What / why:** E2 found Pole Strike took 4 clicks against a budget of 1: open the drawer, the
  tile, the Pole Strike / Reactive Strike chooser, the dialog. The drawer also opened ~370 px left of
  its button. There are two changes:
  1. **Pole Strike follow-up.** After the Attack action with a Quarterstaff, Spear or Heavy+Reach
     weapon, the Bonus bar gets **Pole Strike** (one button, then the roll dialog: 2 clicks). It runs
     the Polearm Master item's own attack activity through the sequence: its usage card, then the
     attack, then aoe's damage (`1d4 + 3 bludgeoning` live). It is marked used, spends the Bonus
     Action, and pulses when it appears (U-3-4). The drawer tile is unchanged (U-3-3 gating).
  2. **`drawerNearButton`.** Argon's `.features-container` is absolutely placed at the row's far
     left. Each drawer panel's `toggle` is wrapped per instance (in
     `renderButtonPanelButtonArgonComponent`) and the open drawer gets a `left` that puts it above
     its button, clamped inside the action row.
- **Files / settings:** `combat-core.mjs` (`followUps` gains `poleStrikeId`, `drawerLeft`),
  `hud.mjs` (`followUpsNow` passes the Polearm Master item), `sequence.mjs` (`runFollowUp` handles
  `pole-strike`), `turnflow.mjs` (`placeDrawer`), lang `FollowUp.pole-strike`,
  `FollowUpText.pole-strike`, `Kind.pole-strike`, new world setting **`drawerNearButton`**, fixtures
  312, 313 and 321, registry row `combat-argon-drawer-near-button`.
- **Revert:** the Pole Strike button goes with the *Follow-up buttons* setting off (with all
  follow-ups), or in code by deleting the Pole Strike block at the end of `core.followUps` and
  `|| f.kind === "pole-strike"` in `runFollowUp`. The drawer goes with the setting *Drawers open by
  their button* off, or in code by deleting the drawer block at the end of `turnflow.mjs`. Then
  check, sync and reload.
- **Retest (E2):** on ZZ Polearm 5's turn, Full Attack with the glaive. **Pole Strike** appears on
  the Bonus bar and pulses. Click it, then Enter: one attack with `1d4 + mod` bludgeoning, the Bonus
  pip greys, and the button is gone. Open Use Feature: the drawer sits above its button. Verified
  live: the button appeared after a glaive swing in the flag, and the run made one attack
  (followUps `["pole-strike"]`, pip 0). The drawer got `left: 691px` for a button at x=706 in a row
  starting at x=15 (its on-screen position was not measured in the background tab).

### U-3-12 — Smaller bug fixes from the run (Enter hint, pause note, Nick slot, pulse, hint, Undo)

- **What / why:**
  - **D1 "Enter = Normal" was wrong under Reckless or Steady Aim.** The strip now reads the open roll
    window's autofocused button: "Enter = Advantage" (or Disadvantage, Normal, Critical Hit).
    Verified live under Reckless: `Enter = Advantage · Esc = pause`.
  - **C1, a cancelled Flurry.** The pause bar said swings stay on the Action pips. It now says "Your
    Focus Point is already spent: Resume to take the strikes it paid for." A single Bonus follow-up
    says "Nothing is spent until you roll". Verified live, with Focus restored.
  - **B7 Nick.** After Nick (or the Bonus off-hand attack), Argon's plain off-hand slot stayed and
    invited an illegal second Light attack. It now hides, and it is re-checked on every turn-flag
    write. Verified live on ZZ Rogue 5 after a Nick swing: slot `display: none`.
  - **E1, the Hew pulse was missed.** It pulsed 4 s, which ended with the chat pop-ups. It now
    pulses until the pointer enters the Bonus bar, or for 12 s.
  - **B2, a stale ally hint.** The "+ Sneak Attack" tooltip is now recomputed when the pointer
    enters the button.
  - **B4, the Undo note was small grey text.** It is now gold, bold and bordered, and its Undo looks
    like a button.
  - **D1, F2: hover tooltips sat over the confirm button.** Argon's tooltip is dropped when any
    dnd5e dialog (`Dialog5e`: usage, roll, rest), the activity chooser or a `DialogV2` opens, not
    only roll windows.
- **Files:** `strip.mjs` (`readEnter`, `enterAction`, the pause note), `sequence.mjs`
  (`stripContext.note`, `paid`), `combat-core.mjs` (`pausedNote`, `hideOffhandSlot`), `hud.mjs`
  (`hideDuplicateSlots` takes the actor, `recheckSlots`, `pulseNew`, the tooltip-drop hook list),
  `riders.mjs` (`pointerenter` in `renderOffer`), `styles/combat.css` (pulse `infinite`, auto
  note), lang `Strip.KeysAction`, `Strip.Action.*`, `Strip.PausedNote.*` (`Strip.Paused` shortened,
  `Strip.Keys` removed), fixtures 318 and 320.
- **Revert (each part on its own):**
  - Enter hint: in `paint()`, put back `T(paused ? "…KeysPaused" : "…Keys")` and the `Keys` lang
    key, and delete `readEnter`.
  - Pause note: drop the `PausedNote` span in `paint()` and restore the old `Strip.Paused` text.
  - Nick slot: call `hideDuplicateSlots` without the actor and restore its old body (in the U-2-8
    revert).
  - Pulse: set the CSS back to `5` iterations and `setTimeout(…, 4000)`.
  - Hint: delete the `pointerenter` listener.
  - Undo: delete the two new `.pentaryn-combat-auto` CSS rules.
  - Tooltips: shorten the hook list back to the two roll hooks.
  Then check, sync and reload.
- **Retest:** D1 (Reckless → Full Attack: the strip says Enter = Advantage), C1 cancel (the pause text
  names the Focus), B7 (after Nick there is no plain Dagger or Shortsword tile on the Bonus bar), E1
  (Hew pulses until you point at the bar), B2 (move the Fighter next to the goblin after the swing,
  then hover + Sneak: the ally line reads ✓), B4 (Auto: the note is gold, and Undo is a button),
  Rage and Lay on Hands (no tooltip over Use Ability).

### U-3-13 (bug fix) — Manual dice: the Roll Resolution box takes the digits

- **What / why:** P(B1, C1) found the resolver's box was not always focused, so typed numbers went
  to the canvas and fired pentaryn-ties' digit hotkeys ("Nothing recorded between you and them").
  On `renderRollResolver` the first empty box is now focused if focus is not already inside the
  resolver. A capture `keydown` on the document sends a digit typed with no field focused, while a
  resolver is open, into its first empty box (focus moves before the key's default action). Core's
  keybindings, which listen on window in the bubble phase, never see it.
- **Files / settings:** `turnflow.mjs` (`openResolver`, `firstEmptyBox`, the render hook and the
  keydown listener). This is tied to `dockRollDialogs`. Registry row
  `combat-core-roll-resolver-focus`.
- **Revert:** turn `dockRollDialogs` off (this also undocks windows). For the code-only revert,
  delete the "manual dice" block in `turnflow.mjs` and the registry row. Then sync and reload.
- **Retest:** a player on Manual d20 clicks Rapier and types `14` without clicking the box. 14 is
  filled in, and no pentaryn-ties notice appears. Verified live: the box was focused on render;
  after a blur, a synthetic `7` keydown moved focus into it; the roll took 12. Dice configuration
  was restored to `{}`.

### U-3-14 (bug fix, console) — A background tab posts no chat-card pop-ups

- **What / why:** the GM console showed 38 × "Cannot set properties of null (setting 'hidden')" at
  `ChatLog#postNotification` (core 14.369, `foundry.mjs` 131609–131648). The pop-up waits on a
  spacer animation. In a hidden tab that animation does not finish until the tab is shown, and a
  card deleted in the meantime (a tidied cancelled attack, a cleanup) has already gone from the
  pop-up list. Core then sets `hidden` on a null element. `ChatLog#notify` is now wrapped at `init`:
  while `document.hidden`, a new message takes core's own no-pop-up path (the chat tab's unread pip
  lights). Core files are untouched.
- **Files / settings:** `turnflow.mjs` (the "chat-card pop-ups" block). This is tied to the existing
  `scrollingTextGuard`, whose name and hint now cover both guards. Registry row
  `combat-core-chat-notify-hidden-tab`.
- **Revert:** turn the setting *Background tab: no floating text, no chat pop-ups* off (this also
  turns off U-2-6's guard). For the code-only revert, delete the block and the registry row and
  restore the old setting text. Then sync and reload.
- **Retest:** with the GM tab in the background, a player rolls several attacks and the GM deletes
  one card. Bring the GM tab forward: there is no "setting 'hidden'" in its console, and the chat
  tab's pip is lit. Verified live on the hidden GM tab: `_shouldShowNotifications()` was true, a new
  card posted no pop-up (0 elements), and deleting it logged nothing.

### U-3-15 — Test fixtures: HUD follows at combat start; ZZ Monk 5's Quarterstaff enchanted

- **What / why:**
  - **The HUD did not follow at combat start.** Round 1 stayed on Fighter 5. Core's
    `combatTurnChange` at `startCombat` has the same combatant as both previous (round 0) and
    current, and the hook returned on `prior === next`. `core.turnBoundary` now reads the round as
    well. At combat start, the first combatant's turn begins: the HUD follows, and the turn-start
    sweep runs. A lone combatant's new round now also ends and begins its turn, so Dash, Disengage
    and Dodge expire as they should.
  - **C1, the Monk's Quarterstaff rolled STR with no martial-arts die.** The setup's hand patch is the
    weapon *mastery* (Topple), not Martial Arts. The Martial Arts "Master Simple Weapon" enchantment
    had never been applied. It was applied to ZZ Monk 5's Quarterstaff with dnd5e's own
    `EnchantActivity#applyEnchantment` (profile `VnV6opO1b3apq6wt`). It is now "Quarterstaff
    (Martial Arts)", Finesse, +6 to hit, `1d8 + 3`.
- **Files:** `combat-core.mjs` (`turnBoundary`), `turnflow.mjs` (`combatTurnChange`), fixtures
  314–317, world data (ZZ Monk 5 item `aVQmktgD2iG321kM`, enchantment effect `PA0AB87E50EjQptf`).
- **Revert:** in the `combatTurnChange` hook, go back to `if (prior === next) return;` with
  `prior` and `next` from `previous.combatantId` and `current.combatantId`, then sync and reload.
  To remove the enchantment, delete effect `PA0AB87E50EjQptf` on the Quarterstaff.
- **Retest:** start a combat with a player's ZZ character first in the order. That player's HUD shows
  it from round 1, with no click. C1: Quarterstaff swings read `1d20 + 3 + 3` and `1d8 + 3`.

### Proposals (Area 3 re-run, pass 2) — for Joe to decide

- **P-3-g — Divine Smite in one button (supersedes P-3-b).** F1 took ~8–9 clicks against a budget
  of 5. After a melee hit, a "+ Divine Smite" button on the attack card, like the Sneak Attack rider
  (U-3-8 already spends its Bonus pip), could:
  - pick the Cast activity (skipping the Cast / Cast (free casting) / Unholy chooser, with the free
    cast first while its use is left);
  - open only the slot picker;
  - roll with the swing's crit carried (`isCritical` from the attack, as `rollRider` does).
  That is ~5 clicks for the whole turn. It was not applied because it takes over a stock spell's
  flow: slot spend, free-cast use, and the Unholy (fiend/undead) extra die, which needs a target
  check. Joe's call on whether the Unholy die should be automatic.
- **P-3-h — Lay on Hands in 2 clicks (extends P-3-c).** Options, in this order:
  - skip the Heal / Remove Poison chooser by binding the HUD button to the Heal activity;
  - pre-fill the amount with the single target's missing HP, capped at the pool;
  - require a target, so the card's healing has someone to go to;
  - let the player apply healing to a creature they own (the tray's apply buttons are GM-only for
    others).
  Not applied: it changes a stock heal flow, and a wrong pre-fill spends pool points. The
  first-click blur (2 clicks on Use Ability after typing) is core's number field committing on
  blur. Pressing Enter in the field submits in one.
- **P-3-i — Dice So Nice at the table.** The large d20 hangs mid-canvas on each page load, and the
  animation holds chat cards back 6–30 s (`dsn-hide`) in a tab that isn't truly in front. Options:
  - DSN's "hide after roll" plus a shorter animation;
  - "Show only to the roller";
  - off for the GM tab (it is a background bridge; a per-client DSN setting);
  - off entirely.
  These are table taste and DSN's own settings, so Joe's call. Worth checking first whether the
  stuck d20 is a DSN–v14 incompatibility (it was not investigated here).
- **P-3-j — Reckless auto-off notice.** The effect already expires at the start of your next turn.
  A short notice then ("Reckless Attack ended") would tell the player why the dialog no longer opens
  on Advantage. Cheap, but one more popup. Joe's call.
- **P-3-a (Sneak Attack Auto by default) and P-2-c (keep the HUD open across reloads and after
  combat ends)** were raised again by this run. Both are still open, and nothing here changes them.
  U-3-12 makes Auto's Undo far more visible, which lowers P-3-a's main risk.

**Cleanup by this fixer:**
- The throwaway combat was deleted, along with its 11 test chat cards.
- The Barbarian's Rage and Reckless effects were removed, and its Rage uses are back to 0.
- The Rogue's Steady Aim effect was removed.
- ZZ Monk 5's Focus is back to spent 0.
- The turn flags of the four ZZ actors were cleared.
- The HUD was unbound, the GM view is back on Drow Prison (still active and paused), and dice
  configuration is `{}`.
- No browser tab was opened.
- Kept on purpose: the Quarterstaff enchantment (U-3-15).

---

## Area 4 live re-run — Talo (2026-10-10, run alone)

One data change was made on a real PC, as the test plan allowed (D12). Everything else on Talo was
restored and diffed against the pre-run snapshot (95 items, HP, slots, uses, currency, ownership).

### U-4-3 — Revivify is a heal activity (D12)

- **What / why:** Revivify on Talo was a `damage` activity named "Damage", custom formula `1`, type
  healing. It read as "Damage" in the usage dialog and applied through the damage path. It is now a
  `heal` activity named "Revive": custom formula `1`, type healing, Touch, one creature, spell slot
  consumed. The Healing Roll dialog shows `1 Hit Points`.
- **Where:** Talo (`pfCQRWnqsQjkZQnB`), item Revivify `Xb828Bgvlh2mfnVA`; the new activity id is
  `HWjmHoS41qpvER8Y`. The material diamond is **not** automated. A test diamond with a consumption
  target was used to prove dnd5e can spend it (diamond uses 1 → 0, 3rd-level slot 3 → 2), then the
  diamond and the target were removed again, so Revivify never blocks on a missing item.
- **Revert:** on the item, delete activity `HWjmHoS41qpvER8Y` and create a `damage` activity with id
  `dnd5eactivity000`: activation action, range self, damage part `{custom:{enabled:true,formula:"1"},
  types:["healing"]}`, spell-slot consumption on.
- **Retested in:** D12 (live, Talo tab): 1 rolled, GM applied, fighter 0 → 1 HP.

### Decisions with no change

- **D9 (Potent Spellcasting):** the three hand-edited cantrips already carry `+@abilities.wis.mod` in
  their damage part, and the rider skips them, so the total is `NdX + 5` exactly once on Starry Wisp
  (3d8+5), Thorn Whip (3d6+5) and Produce Flame (3d8+5). Not converting them to the rider: same number, and
  the conversion would only change the label.
- **D8 (Weal/Woe badge):** not built. The long-rest d6 is not stored anywhere, so a badge has nothing to read.
  The cheap version is a flag set when the player rolls the d6 (see report).

---

## Area 4 live re-run — fixer pass (2026-10-10)

The re-run passed (D1–D15, G2); this pass fixes its bugs and console errors at the root. All work
was done on `ZZ druid scratch` (`BGur1TAyqbhkRgmQ`, token `KVqg92vVRPlmKUoO` on ZZ Arena) in a
scratch combat that was deleted afterwards. Talo was only read. Modules checked and synced:
pentaryn-combat (283 fixtures), pentaryn-transform (147), pentaryn-aoe (135); `make
foundry-adjustments-check` passes (54 rows). The GM tab was reloaded and verified as below. **Player
tabs must be reloaded** to pick any of this up.

### U-4-4 (bug fix) — Drawers and the Wild Shape / Starry pickers open above their button

- **What / why:** D1 and D5 found the Wild Shape picker's first two tiles and the Starry *Archer*
  tile under the portrait at 1299 px, where a click opened the Abilities drawer. U-3-11's
  `drawerLeft` was meant to put every drawer above its button, but it mixed coordinate spaces. Argon
  scales the whole HUD with a CSS transform (0.424 on a 1600 px window, smaller on a narrower one).
  The row width came from `getBoundingClientRect` (scaled) and the drawer width from `offsetWidth`
  (unscaled), so any wide drawer clamped to `left: 0`, at the row's far left under the portrait.
  Now every input is a screen measurement, the result is divided by the HUD's scale, and the drawer
  never starts left of the action row (right of the portrait and the movement bar). It ends inside
  the HUD element's box, which is its containing block. Our two pickers no longer wrap
  (`flex-wrap: nowrap`). A sub-pixel shortfall had wrapped the 8th form onto a second row.
  Verified on the GM tab: before, the picker was at x 15–585 with the portrait at 15–174. Now Wild
  Shape is one row at x 516–1072 (button 886–960) and Starry is one row at 797–1072 (button
  960–1034). The Cast Spell drawer gets the same placement. Its slide-in transition doesn't run in a
  background tab, so its final position can only be seen on a foreground tab.
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`drawerLeft` gains `minLeft` and
  `scale`; old calls give the same results), `turnflow.mjs` (`placeDrawer`), `test/run.mjs`
  fixture 323; `foundry/module/pentaryn-transform/styles/transform.css` (`.pentaryn-picker`
  `flex-wrap: nowrap`). It is still under setting `drawerNearButton` and registry row
  `combat-argon-drawer-near-button`.
- **Revert:** in `placeDrawer`, go back to `core.drawerLeft({ buttonLeft: b.left, hudLeft: r.left,
  hudWidth: r.width, panelWidth: el.offsetWidth })` and delete the `scale`/`lane` lines. In
  `drawerLeft`, restore the three-line body (`want`, `max`, `return Math.round(Math.max(0,
  Math.min(want, max)))`) and drop the two new params. Delete fixture 323 and the `flex-wrap` line.
  Then `make foundry-combat-check foundry-combat-sync foundry-transform-check
  foundry-transform-sync` and reload. To turn it off without a code change, switch off setting
  *Drawers open by their button*. Argon's own far-left placement comes back.
- **Retest (D1, D5, on a 1299 px window):** open Wild Shape: all 8 tiles are in one row above the
  Bonus bar, none over the portrait, and Giant Spider is clickable. Starry Form: Archer, Chalice,
  Dragon (and End) are in one row, clear of the portrait. Open Cast Spell: it slides in over its
  own button.

### U-4-5 (bug fix) — A Wild Shape body swap never animates; the token art follows the form

- **What / why:** D4's bug: after Bear → Wolf → Spider → 0 HP, the token kept the Brown Bear art at
  2×2 on both clients until `token.reset()`. This was reproduced on the scratch druid: after one
  Change Form, the prepared `texture.src` stayed `brown-bear` while `_source` said `dire-wolf`. The
  root cause is in core. `Token#animateFrame` writes the animation's in-flight values back onto the
  TokenDocument on every frame (`mergeObject(this.document, animationData)`). In a tab whose canvas
  isn't ticking (the GM tab is kept in the background, by house rule), a transform's animation never
  completes. So the document kept the *first* form's art and size, and later updates were
  overwritten by the stalled animation. dnd5e then read those stale prepared values into
  `previousTokenData`, and the revert put them back, this time into `_source`. Our patch:
  1. A `preUpdateToken` hook gives every body swap `animate: false`. A body swap is an update that
     changes `actorId`, or one that carries dnd5e's `previousTokenData`/`previousActorData`. Core
     then stops the token's animations and re-syncs them from the fresh document on every client.
  2. Before `transformInto` and `revertOriginalForm`, the actor's tokens are settled with
     `stopAnimation({ reset: true })`, so dnd5e reads source-true values.
  3. `restoreTokensElsewhere` passes `animate: false` too.
  Verified on the GM tab: the chain Bear → Wolf → Giant Spider → 0 HP revert shows prepared =
  source at every step (art, ring subject, size 2 → 1), `previousTokenData` holds Talo's art, and
  all 6 swaps arrive with `animate: false`. The scratch token, which was left corrupted by the run
  (ring subject `brown-bear` in its source), was repaired to its prototype.
- **Files:** `foundry/module/pentaryn-transform/transform-core.mjs` (`isBodySwap`),
  `transform.mjs` (the `preUpdateToken` block, `settleTokens`, two calls, `animate: false` in
  `restoreTokensElsewhere`), `test/run.mjs` fixture 141, registry row
  `core-token-swap-no-animation`.
- **Revert:** in `transform.mjs`, delete the "body swaps never animate" block (the `preUpdateToken`
  hook and `settleTokens`), the two `settleTokens(...)` calls (in `revert` and `doShift`), `,
  animate: false` in `restoreTokensElsewhere`, and `isBodySwap` from the import. In
  `transform-core.mjs` delete `isBodySwap`, then delete fixture 141 and its import name, and the
  registry row. Then `make foundry-transform-check foundry-transform-sync` and reload.
- **Retest (D3 + D4 chain):** Bear → Change Form Dire Wolf → Wild Shape from the sheet (Giant
  Spider) → GM applies damage to 0. Talo's own art and 1×1 size are back on both clients with no
  reset. The swaps no longer grow or shrink with an animation; they snap.

### U-4-6 (bug fix) — Starry Form greys the Bonus pip (Argon's pips settle)

- **What / why:** D5: Wild Shape greyed the Bonus pip, Starry Form didn't. This was reproduced:
  after Starry Form, `isActionUsed` was `true` and the pip was lit. Instrumented, the last
  `updateActionUse` call was Argon's own `_onUpdateActor` handler. It ran while the Bonus bar was
  re-rendering (Starry Form rebuilds it) and found an empty pip container. Argon's
  `updateActionUse` rebuilds the pips when their count differs, then marks the *old*, detached list.
  Our modules already worked around this with "call it twice" at every call site. Now
  `ActionPanel.prototype.updateActionUse` calls itself once more whenever its first run rebuilt the
  pips, so every caller settles, Argon's own included. This is a pure bug fix with no setting.
  Verified in a scratch combat: Starry Form (Chalice) → `isActionUsed: true`, pip greyed.
- **Files:** `foundry/module/pentaryn-combat/turnflow.mjs` (the "Argon's pips" block at the end),
  registry row `combat-argon-pip-settle`.
- **Revert:** delete that `Hooks.once("ready", …)` block and the registry row; check, sync, reload.
- **Retest (D5):** on Talo's turn, Starry Form → Archer. The Bonus pip greys, as it does for Wild
  Shape.

### U-4-7 (bug fix, console) — An area's handle is deleted after core's region update, not before

- **What / why:** the GM console logged `undefined id [tVgpDGjZNamhPjpm] does not exist in the
  EmbeddedCollection` (×4, from `server-backend _updateDocuments`). That id was D10's Moonbeam
  handle, deleted when concentration moved to Summon Elemental. The server log shows the region
  deleted at 19:39:30, the handle token at 19:39:31, then the failed update. Once a handle has been
  **dragged**, it lists its own region in `_regions`. This was proven on a scratch area: `[]` at
  creation, `[region]` after one move. When a region is deleted, core's active GM sends a `noHook`
  update that drops the region from every token inside it, and our `deleteRegion` hook deleted the
  handle at the same moment. Now `deleteHandlesOf` waits (polling, at most 1.5 s) until no handle
  still lists the region, then deletes. Verified: a scratch area was created, its handle moved, and
  the region deleted. The handle went, there were no client errors, and no new lines appeared in
  `Logs/error.2026-10-10.log`.
- **Files:** `foundry/module/pentaryn-aoe/core.mjs` (`stillListing`), `areas.mjs`
  (`deleteHandlesOf`), `test/run.mjs` (2 fixtures), registry row
  `aoe-core-region-delete-update-race`.
- **Revert:** restore `deleteHandlesOf` to the one-shot filter + `deleteEmbeddedDocuments` (no
  wait loop), delete `stillListing`, its import and fixtures, and the row. Then `make
  foundry-aoe-check foundry-aoe-sync` and reload.
- **Retest (D10):** cast Moonbeam, drag its handle once, then cast another concentration spell (or
  delete the area). The area and handle go, and the GM console stays clean.
- **Not traced:** the second exception (`S3nAxY7glMCERInH`, the scratch Talo token deleted in
  cleanup at 19:46:21) is the same server error on a non-handle token. The server log holds no
  more than that. It is likely the same core pattern: a `_regions`/movement write to a token that
  is being deleted in the same tick. Watch for it in the next run.

### U-4-8 (bug fix) — The HUD never binds to an area handle

- **What / why:** D10: after a handle drag, the HUD showed the handle actor (a 0/0 HP skull bar),
  and the player had to click Talo again. Argon's `controlToken` hook binds the HUD to whatever is
  controlled. pentaryn-aoe now wraps `ui.ARGON.bind` (per instance, at ready) so it ignores a
  handle token or the handle actor, and the HUD stays on what it showed. Verified: with the HUD on
  the scratch druid, controlling a handle left it on the druid.
- **Files:** `foundry/module/pentaryn-aoe/core.mjs` (`isHandleTarget`), `areas.mjs`
  (`guardArgonBind`), `aoe.mjs` (called at ready and in `install`), `test/run.mjs` (1 fixture),
  registry row `aoe-argon-handle-bind`.
- **Revert:** delete `guardArgonBind`, its two calls in `aoe.mjs` and its import, `isHandleTarget`
  and its fixture, and the row. Then check, sync and reload.
- **Retest (D10):** place Moonbeam and drag the handle. The HUD stays on Talo throughout.

### U-4-9 — A drawer's hover tooltip closes with the drawer

- **What / why:** D5 found spell tooltips lingering after the Cast Spell panel closed. Argon
  commented out its own `mouseleave`. Our per-instance toggle wrap (U-3-11) now destroys Argon's
  tooltip when the drawer closes and the tooltip's trigger is inside that drawer. Other tooltips are
  left alone.
- **Files:** `foundry/module/pentaryn-combat/turnflow.mjs` (`dropDrawerTooltip`, one line in the
  toggle wrap).
- **Revert:** delete `dropDrawerTooltip` and the `if (!this.element?.classList?.contains("show"))
  dropDrawerTooltip(this);` line; check, sync, reload.
- **Retest:** hover a spell in Cast Spell, then close the drawer (click Cast Spell or Esc). The
  tooltip goes with it.

### U-4-10 — Chalice pulses when it is earned (D6)

- **What / why:** D6: the second heal is a separate button that the player has to know about. Now,
  when Starry Form: Chalice is up and the druid casts a leveled spell with a slot that restores HP
  (a `heal` activity or a healing damage part), the **Chalice** button beside Starry Form pulses
  until it is used, Starry Form ends, or a minute passes. The rule is 2024 PHB, Circle of the Stars
  Chalice: "whenever you cast a spell using a spell slot that restores Hit Points…". Nothing rolls
  by itself, so own dice still work. Verified: with Starry Chalice active, Healing Word (slot 4 → 3)
  made the button pulse, and using the Chalice activity stopped it.
- **Files:** `foundry/module/pentaryn-transform/hud.mjs` (the "Chalice" block at the end, and two
  class lines in `composeBonusBar`), `styles/transform.css` (`pentaryn-chalice-pulse`).
- **Revert:** delete the Chalice block, the `if (c === "chalice") {…}` lines in `composeBonusBar`
  and the CSS keyframes and rule. Then `make foundry-transform-check foundry-transform-sync` and
  reload.
- **Retest (D6):** Starry → Chalice, cast Healing Word on an ally. The Chalice button pulses, and
  clicking it rolls the 2d8+5 heal. Count the clicks for both heals against D6's 8; the
  saving is in finding the second heal, not in clicks.

### Decisions with no change

- **D11 "Spend 2 uses of this item (6 uses available)":** not a bug. The "rituals entry" in Cast
  Spell is the **Staff of the Woodlands** category. Its Locate Animals or Plants is the staff's cast
  activity, which costs 2 charges, and the dialog says so correctly. Talo doesn't have that spell
  prepared, so it was never a druid ritual. A real ritual check for D11 is **Speak with Animals**
  (prepared, Ritual tag).
- **D2 Bite `1d20+3+4-2`:** still P-4-d (cosmetic, dnd5e's dialog).

### Proposals (Area 4 re-run) — for Joe to decide

- **P-4-f — Cosmic Omen badge.** Store the long-rest d6 as a flag on Talo. The cleanest way is a
  "Roll omen" prompt in the long-rest chat line, which keeps own dice possible. The HUD's Cosmic
  Omen button would then show **Weal** or **Woe** and use only that activity (no chooser, no
  feature-text card): 1 click plus the d6. Not applied: it adds a per-rest step and changes a real
  PC's flow.
- **P-4-g — Players apply healing to allies.** Heal cards for non-owned creatures always need the
  GM. Option: pentaryn-aoe's GM tray pattern. A heal card targeting a visible ally gets a GM-side
  "Apply" row that the player's click requests through a socket. Not applied: it changes who can
  change whose HP.
- **P-4-h — No Healing Roll dialog for a flat heal.** Revivify's `1` (and any formula with no dice)
  could skip the roll dialog (`configure: false` on the heal roll). Fold cast + heal into one dialog
  for single-target heals. That is dnd5e's flow, so it would be a hook in pentaryn-combat. Not
  applied: it touches every heal.
- **P-4-i — Rest on the HUD.** A Short/Long Rest pair in the portrait's menu (today it is sheet
  only). Not applied: rests are usually GM-called at this table.
- **P-4-j — Cast Spell levels open.** Argon opens the first four categories and collapses 3rd level
  and up. For casters above 5th level, open every category with a slot left. Not applied: the
  panel gets tall (23 spells on Talo) and it is an Argon UI choice.
- **P-4-k — "Or in any combination" Multiattack.** The Gate Watch-Captain's "three attacks, using
  Greatsword or Longbow in any combination" parses as 3 Greatswords. Option: a per-swing weapon
  chooser on the strip when the text says "in any combination". Not applied: needs a strip control.
- **P-4-l — Area save button targets.** D10's Moonbeam save button rolled for the card's targets
  (Talo), not the creatures in the area. Option: pentaryn-aoe's request card already lists who is
  inside, so steer players to it and hide the card's own save button for area spells. Needs a look
  at how D10 was clicked first.
- **P-4-m — Change form from the sheet says so.** D3: Wild Shape from the sheet while shifted changes
  form for one use with no message beyond the shift line. Option: the chat line reads "Talo changes
  from Dire Wolf to Giant Spider (2/3 → 1/3)". The ~1 s flash of Talo's base bar is the revert in
  between and is harmless.
- **Carry-over:** GM view back on Drow Prison (active, paused), no combats, no scratch regions or
  handles left, HUD unbound, dice configuration `{}`. The scratch druid was restored (HP 98+12, slots,
  Wild Shape 3 spent, Starry ended). No browser tab was opened.

---

## Area 5 re-run — Sorcerer (Marrith): fixer pass (2026-10-10)

The re-run failed S5 (no pip spent by any spell) with friction on S2, S4, S6, S7, S11, S13, S14 and
S16. This pass fixes the bugs at the root and applies the low-risk streamlining. Code is in
`pentaryn-combat`, `pentaryn-aoe` and `pentaryn-riders`. Two new files (`pentaryn-aoe/refund.mjs`,
`pentaryn-riders/cast-flow.mjs`) are imported from existing entry files, so no `module.json`
changed and Foundry needed no restart. Checks: `make foundry-combat-check` passes with 290 fixtures
(7 new: 341–347), `make foundry-aoe-check` passes with 143 (8 new), `make foundry-riders-check`
passes (table-core 28, 5 new: 24–28), and `make foundry-adjustments-check` passes with 65 rows (10
new). All three modules were synced and the GM tab was reloaded three times, each time with only the
GM logged in. **Player tabs must be reloaded** before the retest.

Everything was checked live on the GM tab against a temporary clone of Marrith ("ZZ sorcerer
scratch", deleted afterwards) on ZZ Arena, in a scratch combat with ZZ Fighter 5 and Goblins 1–2,
with Argon bound by `ui.ARGON.bind`. Activities were used through `activity.use()`, not a real mouse.
Marrith herself was only read (HP 69, slots 5/2/2/0/1/0, unchanged). Cleanup is at the end of this
section. The player-only parts (U-5-14's status line and hidden rows) could not be seen from the GM
client; their logic is fixture-tested and the flag they read was confirmed on a live NPC save.

**Bug and console notes that need no code:**

- **`DataModelValidationError … ActiveEffect … system.type may not be undefined` on Talo (8:35–9:04
  PM).** These came from the Area 4 tester's restore evals, not from module code: `eval.jsonl` at
  00:34:45Z–00:35:02Z holds "Recreate concentration effect…" and "Create concentration effect on
  Talo (new id fallback)", which call `ActiveEffect.create({...})` with hand-written data. dnd5e 6
  effects need `system.type`. For a restore, re-create from a snapshot's `effect.toObject()` with
  `actor.createEmbeddedDocuments("ActiveEffect", [...], {keepId: true})`. Areas 4 and 5 overlapped
  in time on the one GM bridge, which the test plan forbids for real-PC areas.
- **`undefined id [ZrpAA7osx6ZtCv3M] does not exist in the EmbeddedCollection`.** That is the Area 4
  cleanup's scratch Talo token (eval at 00:34:45Z deletes it), the same family as U-4-7's
  "not traced" note. Nothing in this run touched it.
- **Argon `Cannot read properties of null (reading system / name)` (8:20–8:37 PM).** Not reproduced:
  deleting a bound token, its world actor, or changing a pentaryn-combat setting with the HUD
  unbound all threw nothing on the GM tab. The likely path is a re-render of Argon's panels with no
  actor bound. Two of our callers could do that, so they are now guarded (U-5-18).
- **`#createAnimationMovementPath` "setting 'last'"**: the tester's restore moved six tokens with an
  animated update in a hidden tab. This is already noted under Area 3. In evals, use `{teleport: true,
  animate: false}`.
- **ZZ Tester's password.** The plan (§2 Owner) says to reuse the Talo account. The `zz` fallback is
  only for a throwaway `ZZ Tester`, and that account now exists (TRUSTED, character ZZ Fighter 5),
  with a password the tester set. Case Z deletes it. No password is written here.
- **Run environment.** With the Mac screen locked, Chrome tabs report `hidden`, and CSS transitions
  and the canvas stall. Drive player tabs with a headless Chrome and real CDP input, as this run did.
- **Healer's Kit tile opens Stabilize, not Battle Medic.** This is right: the kit's own activity is
  Stabilize, and Battle Medic belongs to the Healer feat (Use Feature → Healer). See P-5-l.

### U-5-8 (bug fix) — Spells spend their Action and Reaction pips; spent pips survive a re-bind

- **What / why:** S5 and S14 failed because Fire Bolt, Fireball, Scorching Ray, Quickened Spell and
  Counterspell left every pip lit. The root cause is U-3-8's: Argon dnd5e calls
  `consumeActionEconomy` only for activity-bound buttons, and every spell in Cast Spell is an
  *item* button. U-3-8 covered Bonus actions only. Now:
  - An Action activity on your own turn (already counted by `recordOtherAction`) fires
    `pentarynCombat.otherAction`, which greys Argon's single Action pip. With 2+ swings, our swing
    pips already count it.
  - A Reaction activity in combat, on any turn, writes `flags.pentaryn-combat.reaction = {combatId}`
    and greys the Reaction pip. The active GM clears the flag at the start of the actor's turn
    (2024 PHB: you regain it then), and the pip relights.
  - When a panel renders (a re-bind) or a new round starts (Argon relights every pip then), the
    pips are repainted from the turn flag and the Reaction flag.
  Verified live: Fire Bolt → Action greyed, `otherActions` 1. Counterspell → Reaction greyed, flag
  set. Unbind and re-bind → Action, Bonus and Reaction all still greyed. On the clone's next turn
  (round 2), the flag was cleared and all three pips were lit.
- **Files / settings:** `combat.mjs` (`onPostUseActivity`: reaction branch, the `otherAction` hook
  call), `hud.mjs` (`pentarynCombat.otherAction` / `pentarynCombat.reaction` hooks, `restorePips`,
  a render hook and an `updateCombat` hook, the Reaction relight in the `updateActor` hook),
  `turnflow.mjs` (the GM clears `reaction` at turn start), `combat-core.mjs` (`pipFor`, `spentPips`,
  `reactionSpent`; `freshTurn` gains `quickened: false`), `settings.mjs` + `lang/en.json`. New world
  setting **Spells spend their Action and Reaction pips** (`pentaryn-combat.spellPips`, default on).
  Registry row `combat-argon-item-button-spell-pips`. README row.
- **Revert:** turn `spellPips` off; spells then spend no pip again. For the full revert, remove the
  reaction branch and the `otherAction` hook call from `onPostUseActivity`. Remove the two hooks,
  `restorePips`, its render and `updateCombat` hooks, and the Reaction relight from `hud.mjs`.
  Remove the `reaction` clear in `turnflow.mjs`'s `combatTurnChange`, the three core helpers and
  fixtures 341, 342, 346 and 347, the setting, its lang keys, the README row and the registry row.
  Then `make foundry-combat-check foundry-combat-sync` and reload.
- **Retest (S5, S14, on Marrith's turn in a started combat):** cast Fire Bolt: the Action pip greys.
  On a goblin's turn, cast Counterspell: the Reaction pip greys. Toggle the HUD off and on: the pips
  stay as they were. When Marrith's next turn starts, the Reaction pip is lit again.

### U-5-9 — Quickened Spell makes the next 1-Action spell a Bonus Action (P-5-d)

- **What / why:** S5. Quickened spent 2 points and nothing else, so the player had to link it in
  their head. 2024 PHB: "change the casting time to a Bonus Action for this casting". Using
  Quickened Spell on your turn now sets `quickened` on the turn flag. The next spell whose
  activation is an Action (any spell item, so a wand's cast counts too) records the Bonus Action
  instead of an Action, greys the Bonus pip, leaves the Action pip free, clears the flag and says
  "Quickened: Scorching Ray is your Bonus Action. Your Action is still free." The flag belongs to the
  turn, so it dies with the turn. The PHB's "no other level 1+ spell this turn" limit is not
  enforced; that is the table's call.
  Verified live: Quickened → `quickened: true`. Scorching Ray → Bonus greyed, Action lit,
  `otherActions` 0. Fire Bolt afterwards → Action greyed.
- **Files / settings:** `combat.mjs` (the `quickened-spell` branch and the Quickened-cast branch in
  `onPostUseActivity`), `combat-core.mjs` (`recordQuickened`, `recordQuickenedCast`, the
  `quickened` case of `pipFor`), lang `Turn.QuickenedCast`, fixtures 343–345. New world setting
  **Quickened Spell makes the next spell a Bonus Action** (`pentaryn-combat.quickenedSpell`, default
  on). Registry row `combat-quickened-spell-bonus-pip`. README row.
- **Revert:** turn `quickenedSpell` off. For the full revert, delete the two branches, the two core
  helpers, the `quickened` field in `freshTurn`, fixtures 343–345, the lang key, the setting, the
  README row and the registry row. Then check, sync and reload.
- **Retest (S5):** on Marrith's turn, Quickened Spell, then Scorching Ray: the notice shows, the Bonus
  pip greys and the Action pip stays lit. Then Fire Bolt: the Action pip greys. Without Quickened,
  Scorching Ray greys the Action pip.

### U-5-10 (bug fix) — Your token is selected again when a handle or summon you held is deleted

- **What / why:** S3 and S13. Dragging a Fireball handle selects it. When Apply deleted it, or when
  the Flaming Sphere left with its concentration (U-5-2), core released the deleted token. With
  nothing left selected, Argon closed the HUD. The `deleteToken` hook runs while the token is still
  selected (core releases it right after), so for a deleted area handle or a summon (dnd5e's
  `flags.dnd5e.summon.origin`) that you had selected, the next tick selects another token, if
  nothing else is selected. That token is the HUD's token for a handle (U-4-8 keeps the HUD on the
  caster), the summoner for a summon, or else your assigned character. Argon then binds to it.
  Verified live: a fake handle selected, then deleted → the clone selected, HUD up. A fake summon
  with the clone's Flaming Sphere as origin, selected and HUD-bound, then deleted → the clone
  selected, HUD on the clone. No console errors. With the setting off, nothing is selected and the
  HUD closes, as before.
- **Files / settings:** `turnflow.mjs` (the "helper token you held" block: `ownedTokenOf` and a
  `deleteToken` hook), lang, new world setting **Your token comes back when a helper token goes**
  (`pentaryn-combat.helperTokenControl`, default on). Registry row `combat-helper-token-control`.
  README row.
- **Revert:** turn `helperTokenControl` off. For the full revert, delete the block, the setting, its
  lang keys, the README row and the registry row. Then check, sync and reload.
- **Retest (S3, S13):** drag the Fireball handle, then have the GM Apply. Marrith's token is selected
  and the HUD stays. Cast Flaming Sphere, keep the sphere selected and break concentration: Marrith
  is selected and the HUD shows her.

### U-5-11 — Careful Spell protects your side in the area tray, with no Target Picker (P-5-a, P-5-f)

- **What / why:** S4. Careful was a bare 1-point spend behind Argon's "1/5 Targets" picker, which
  finished only at 5 targets or after a hidden "-" key. The ally still got a request card, held the
  area open and took half damage. 2024 PHB: "choose a number of those creatures up to your
  Charisma modifier (minimum of one creature). A chosen creature automatically succeeds on its
  saving throw against the spell, and it takes no damage if it would normally take half damage on a
  successful save." Now:
  - Metamagic buttons open no Target Picker. Argon's `targets` reads null for the ten Metamagic
    identifiers. This is a wrap of Argon dnd5e's item-button prototype.
  - Using Careful writes `flags.pentaryn-aoe.careful = {at, key, usage}` on the caster and shows "in
    your next save spell's area this turn, up to N of your side…".
  - When that caster's next save-spell damage resolves (same combat turn, or 10 minutes out of
    combat), the tray marks up to CHA mod creatures of the caster's side as **protected**: shield
    icon, automatic success, ×0 on a half-on-save spell. The caster's side means the same token
    disposition, never the caster, never a hidden token, player characters first. Protected rows
    get no request card, so the area is not held open, and "Re-roll NPC saves" skips them. The tray
    head reads "Careful Spell protects: …". The GM can change any row.
  - The flag binds to the first usage card it protected, so a re-roll of that card (S3, S16) keeps
    the protection and a later, different spell does not get it.
  Choosing for the player is a judgement call. The rule lets the sorcerer leave an ally out. If
  that happens, the GM sets that row's multiplier. Verified live: Careful, then Fireball damage
  targeting ZZ Fighter 5 and Goblin 1 → Fighter `protected`, save auto-success, ×0, no request
  card; Goblin 1 rolled 17 (×½). A re-roll from the same card kept the protection. Careful's button
  `targets` = null; Fire Bolt's = 1.
- **Files / settings:** `pentaryn-aoe/resolve.mjs` (`carefulKey`, `carefulFor`, `onCarefulUsed`, a
  `dnd5e.postUseActivity` hook, `disposition` in `describeToken`, protected rows skipped in
  `rollNpcSaves` and the request), `core.mjs` (`carefulTargets`, `protectRows`, `carefulApplies`),
  `tray.mjs` (the protected cell, the head line), `aoe.css`, lang `Careful.*`, a README paragraph.
  New world setting **Careful Spell protects allies in the area** (`pentaryn-aoe.carefulSpell`,
  default on). The picker skip is in `pentaryn-riders/argon-tidy.mjs` part 3 (`wrapButtonClass`)
  and `table-core.mjs` (`METAMAGIC`, `skipsTargetPicker`), with no setting. Registry rows
  `aoe-careful-spell-protected-rows` and `argon-metamagic-no-picker`.
- **Revert:** turn `carefulSpell` off: no rows are protected and the flag is still written but
  ignored. For the full revert, delete the Careful block and hook in `resolve.mjs` and restore the
  three filters (`row.protected` in `rollNpcSaves`, `&& !r.save` in the two request checks). Delete
  the three core helpers and their fixtures, the tray's protected cell and head line, the CSS line,
  the lang keys, the setting, the README paragraph and the row. For the picker, delete the
  `targets` part of `wrapButtonClass`, `METAMAGIC` and `skipsTargetPicker` with fixture 24, and the
  row. Then check, sync and reload.
- **Retest (S4):** put ZZ Fighter 5 and two goblins in the blast. On Marrith's turn, Careful Spell (2
  clicks, no picker), then Fireball and Damage. The GM tray shows the Fighter as "protected", ×0, no
  request card for the Fighter's player. The goblins roll. Apply clears the area without waiting on
  the Fighter.

### U-5-12 (bug fix) — A cancelled area placement gives back the slot or charge

- **What / why:** S2 and S10. dnd5e 6 spends the slot, charges or uses before the area follows the
  mouse, so Escape or right-click still cost a 3rd-level slot or a wand charge (the card only had an
  icon-only Refund). Now, on the caster's client, a `dnd5e.postUseActivity` handler acts when an
  activity wanted an area, placed none although placing was possible, and spent something. It
  refunds through dnd5e's own `Activity#refund(deltas)` (the Refund button's code), deletes the
  concentration effect that cast began, and deletes the usage card, with the notice "Fireball:
  placement cancelled, so nothing was spent". It returns `false`, so dnd5e's subsequent actions do
  not run. pentaryn-combat counts no Action for such a cast. Not undone: a concentration that this
  cast *ended* (rare).
  Verified live: Fireball 3rd-level slot 1 → 0 during placement → 1 after `_cancelPlacement()`.
  The card was gone and the turn flag unchanged. Wand of Fireballs charges 5 → 4 → 5.
- **Files / settings:** new `pentaryn-aoe/refund.mjs` (Part F, `installRefund`, called from
  `aoe.mjs`), `core.mjs` (`placementCancelled`), lang `Refund.Done`, a README row. In
  `pentaryn-combat/combat.mjs`, the `dnd5e.postUseActivity` registration skips a cancelled area.
  New world setting **Refund a cancelled area** (`pentaryn-aoe.refundCancelledArea`, default on).
  Registry row `dnd5e-cancelled-area-refund`.
- **Revert:** turn `refundCancelledArea` off; the Refund button still works by hand. For the full
  revert, delete `refund.mjs`, its import and `installRefund()` call, `placementCancelled` and its
  fixture, the lang key, the setting, the README row, the row, and the cancelled-area line in
  pentaryn-combat's registration. Then check, sync both modules and reload.
- **Retest (S2, S10):** cast Fireball and press Escape while the area follows the mouse: the notice
  shows, the 3rd-level slot count is unchanged, and no card is left. Same with right-click, and with
  the Wand of Fireballs (charges unchanged).

### U-5-13 (bug fix) — A re-roll from the same card supersedes the older tray

- **What / why:** S16. After Apply had removed the area, re-rolling the Fireball card made a 1-row
  tray (the roller's targets) while the old 5-row tray stayed live (`superseded: false`), so the GM
  could apply both. Superseding matched the area only. `core.supersedes` now also matches the same
  activity *and* the same usage card. Two separate casts never supersede each other. Verified live:
  a re-roll from the same card set the older tray's `superseded` to true.
- **Files:** `pentaryn-aoe/core.mjs` (`supersedes` + fixture), `resolve.mjs` (`supersedeOlder`).
  Registry row `aoe-supersede-same-usage`.
- **Revert:** in `supersedeOlder`, go back to the filter on `activity` and `region` equality, then
  delete `supersedes`, its fixture and the row. Then check, sync and reload.
- **Retest (S16):** Fireball, Apply (the area goes), then click the card's Damage again. The old tray
  greys out with "Superseded…", and only the new tray can Apply.

### U-5-14 — The caster is told the damage waits for the GM; monster save rows are hidden (P-5-h)

- **What / why:** S2, S15 and S16. The caster saw only the damage total and four "Gamemaster privately
  rolled some dice ?" rows per Fireball, with nothing saying the GM had to apply. They also saw two
  totals with no reason after a re-roll. On player clients now:
  - The caster's own save-spell damage card gets one line: "Saves are in. Waiting for the GM to
    apply the damage." It changes to "The GM applied this damage." or "Re-rolled: the newer damage
    card for this spell is the one that counts." It shows no monster numbers.
  - The GM-only monster saves this module rolls carry `flags.pentaryn-aoe.npcSave` and are hidden
    (`html.hidden = true`, the way dnd5e hides its summarised cards) where their content isn't
    visible. A GM still sees them.
  Verified live: the NPC save carries the flag and is whispered to the GM only. The status line logic
  is fixture-tested. Neither can be seen from the GM tab.
- **Files / settings:** `pentaryn-aoe/tray.mjs` (`decoratePlayer`), `resolve.mjs` (the `npcSave`
  flag in `rollOne`), `core.mjs` (`playerStatus`), `aoe.css`, lang `Status.*`. New world setting
  **Tell the caster when damage is waiting for the GM** (`pentaryn-aoe.playerStatus`, default on;
  it also controls the hiding). Registry row `aoe-player-status-line`.
- **Revert:** turn `playerStatus` off. For the full revert, delete `decoratePlayer` and restore
  `if (!game.user.isGM) return;` in `decorate`. Then delete the `flags` key in `rollOne`'s `data`,
  `playerStatus` and its fixture, the CSS, the lang keys, the setting and the row. Check, sync and
  reload.
- **Retest (S2, S15):** on the Marrith tab, cast Fireball on four goblins. Her damage card reads
  "Saves are in. Waiting for the GM…", and there are no "privately rolled" rows. After the GM's
  Apply it reads "The GM applied this damage." Re-roll from the card: the old card reads
  "Re-rolled…".

### U-5-15 (bug fix) — Spell tooltips compute their numbers ("Total Rays: 3")

- **What / why:** S5. Argon enriches a tooltip's description with `relativeTo: item` and no roll
  data. Scorching Ray's `[[@item.level + 1]]{Total Rays}` therefore read 1. While Argon dnd5e's
  item button builds its tooltip, an `enrichHTML` call for that item now gets `rollData:
  item.getRollData()`, as dnd5e's own sheet passes it. Verified live: "Total Rays: 1" → "Total
  Rays: 3".
- **Files:** `pentaryn-riders/argon-tidy.mjs` part 4 (`wrapEnrich`, the tooltip half of
  `wrapButtonClass`). Registry row `argon-tooltip-item-rolldata`. README row.
- **Revert:** delete `wrapEnrich` and its `ready` hook, and the `getTooltipData` half of
  `wrapButtonClass`. Then delete the row, sync and reload.
- **Retest (S5):** hover Scorching Ray in Cast Spell: "Total Rays: 3".

### U-5-16 (bug fix) — A summon keeps the sidebar and says how to place it

- **What / why:** S13. The first cast of a summon from a compendium profile imports the creature with
  core's `importFromCompendium`, which ends in `directory.activate()`. That flipped the player's
  sidebar to Actors (and opened it if it was collapsed). The placement then waited for a click with
  nothing on screen. Between `dnd5e.preSummon` and `dnd5e.postSummon`, a jump to Actors is put back
  to the previous tab, and the sidebar is collapsed again if it was collapsed. A notice says "Click
  the map to place Flaming Sphere. Right-click or Escape cancels." Verified live: chat and collapsed
  → Actors and open after the import's call → chat and collapsed a tick later. Outside a summon,
  Actors stays when asked for.
- **Files:** new `pentaryn-riders/cast-flow.mjs` part 1, imported from `riders.mjs`. Lang
  `summon.place`. Registry row `dnd5e-summon-keeps-sidebar`. README row.
- **Revert:** delete part 1 of `cast-flow.mjs` (if U-5-17 is reverted too, delete the file and its
  import). Then delete the lang key and the row, sync and reload.
- **Retest (S13):** delete Marrith's auto-imported Flaming Sphere actor first, only if its summon
  profile points at the compendium (U-5-7's lesson). Cast Flaming Sphere: the notice shows, the
  sidebar stays on Chat, and one click places the sphere.

### U-5-17 — Pearl of Power opens on the highest spent slot

- **What / why:** S11. The slider opened at 1st level, so restoring a 3rd-level slot took an extra
  click. `dnd5e.preUseActivity` sets the scaling of an activity that restores a spell slot at a
  chosen level for a flat cost to the highest level, at or below its cap, that has a slot spent.
  dnd5e's own default here is `scaling ??= 0`, so 0 counts as unset. Font of Magic's two
  conversions are left alone, because their cost grows with the level. Verified live (use aborted
  in the hook): the Pearl opened at scaling 2 (3rd level) with 1st full, 2nd 2/3 and 3rd 1/3. Font
  of Magic stayed at 0.
- **Files:** `pentaryn-riders/cast-flow.mjs` part 2, `table-core.mjs` (`restoreSlotScaling`, fixtures
  25–28). Registry row `dnd5e-restore-slot-default`. README row.
- **Revert:** delete part 2 and `restoreSlotScaling` with its fixtures, then the row. Sync and reload.
- **Retest (S11):** spend a 3rd-level slot, then use the Pearl: the slider sits on 3rd, so it takes
  one click less.

### U-5-18 (console) — No Argon re-render while the HUD is unbound

- **What / why:** this is a guard for the unreproduced Argon null-actor errors noted above. A debounced
  bar re-render (`hud.mjs` `rerender`) and the settings' `onChange` (`ui.ARGON.render()`) now do
  nothing when no actor is bound.
- **Files:** `pentaryn-combat/hud.mjs` (`rerender`), `settings.mjs` (`onChange`).
- **Revert:** delete the `if (!ui.ARGON?._actor) return;` line, restore `ui.ARGON?.render?.()`, then
  sync and reload.
- **Retest:** with the HUD closed, change any pentaryn-combat setting: the GM console stays clean.

### Proposals (Area 5 re-run) — for Joe to decide

- **P-5-b (still open) — Empowered Spell "Reroll lowest N".** S6 confirmed the gap: it posts text
  and spends a point. A button on the caster's newest damage card would reroll the CHA-mod lowest
  dice once, replace the roll and re-feed the aoe tray (superseding the old tray, as U-5-13 now does
  for re-rolls). Manual-dice players would type the new dice. Not applied: it replaces a posted roll.
- **P-5-c (re-rated) — Transmuted Spell.** S7: it spends a point, offers no type picker, and Fire Bolt
  stays fire. The tester recommends (1) hiding it for Marrith, since The Inward Flame makes it
  redundant, and (2) making it pick a type for every other sorcerer (a choice on the next spell's
  damage parts, like Quickened's one-shot flag). (1) is a data change on a real PC, so it was not
  done here. Your call as her DM.
- **P-5-e (refined) — Fireball in fewer clicks.** It is still 6 for the player against a budget of 2.
  What is left: roll the area's damage on placement (an aoe change: one dialog right after the
  click, or none with Shift), and teach Shift-click to skip the cast dialog at base level. U-5-12
  makes a mis-click free, which lowers the risk of a faster flow.
- **P-5-k — Scorching Ray's rays.** The PHB item has one attack activity, so three rays means two
  more card clicks and dialogs. U-5-15 fixes the "Total Rays" label only. Option: a "Next ray (2 of
  3)" button on the card, or a ray strip like Full Attack's (pentaryn-combat's sequence, with the
  ray count from `@item.level + 1` at the cast level). Not applied: it needs a strip mode for spells.
- **P-5-l — Battle Medic from the Healer's Kit tile.** S12: the kit's own activity is Stabilize. A
  healer clicking the kit expects Battle Medic. Option: when the actor has the Healer feat, the kit
  tile offers "Battle Medic" and "Stabilize". Not applied: the picker is Argon's, and changing a kit
  item's activities is a data change on real PCs.
- **P-5-m — Words on the area card's icon buttons.** Save, Damage, Place, Eraser and Refund are
  icons only, as the break button was before U-5-2. Option: the same `.pr-labelled` treatment. Not
  applied: it widens every card, so it is your call on table look.
- **P-5-n — Font of Magic slider default.** U-5-17 leaves Font at 1st level on purpose, because a
  higher default could spend 5–7 points by accident. Option: one button per level in the dialog.
- **P-5-o — Elemental Affinity on a Wand of Fireballs.** S10 called +CHA on the wand's Fireball
  arguable. The 2024 PHB text is "when you cast a spell that deals damage of that type, you can add
  your Charisma modifier to one damage roll of that spell", with no class limit, and a wand casts the
  spell. So today's behaviour reads as correct and nothing was changed. If you rule otherwise,
  pentaryn-riders' Elemental Affinity rider could skip spells cast from an item
  (`flags.dnd5e.cachedFor`).
- **P-5-p — The Quickened limit.** U-5-9 does not stop a second level 1+ spell on the Quickened turn
  (PHB: "nor can you cast a level 1+ spell on this turn after modifying a spell in this way"). A
  warning toast would be cheap. Joe's call: warn or trust the table.
- **P-4-e (still open) — the late joiner's HUD.** S2 cost +1 click to toggle Argon on a late-joining
  tab. This is unchanged and still waits on your call with P-2-c.

**Cleanup by this fixer:** the scratch combat, the clone actor and its token, a fake handle, a fake
summon, a temporary NPC and 12 test chat cards were deleted. ZZ Arena has no regions. The HUD was
unbound, the GM view is back on Drow Prison (still active and paused), there are no combats, and the
dice configuration is `{}`. Marrith was never written (HP 69, slots 5/2/2/0/1/0). The setting
`helperTokenControl` was toggled off and back on during a test. No browser tab was opened.

---

## Area 6 re-run — Wizard (Caven): fixer pass (2026-10-10)

The live re-run on a ZZ Tester player tab failed (W1 fail; friction on W4, W5, W7, W8, W9, W13).
This pass fixes the bugs and console errors at the root and applies the low-risk streamlining.
Code is in `pentaryn-aoe`, `pentaryn-riders`, `pentaryn-combat`, `pentaryn-creatures`,
`pentaryn-portals` and `pentaryn-senses`. One new file, `pentaryn-aoe/aim.mjs`, is imported from
`aoe.mjs`, so no `module.json` changed and Foundry needed no restart. Checks: `make
foundry-aoe-check` 159 (16 new), `foundry-riders-check` (rituals-core 22, 3 new; table-core 39, 11
new), `foundry-combat-check` 290, `foundry-creatures-check` 73 (4 new), `foundry-portals-check`
38 (4 new), `foundry-senses-check`, and `make foundry-adjustments-check` 78 rows (13 new). All six
modules were synced. The GM tab was reloaded seven times, each time with only the GM logged in.
**Player tabs must be reloaded** before the retest.

Everything was checked live on the GM tab against a temporary clone of Caven ("ZZ wizard
scratch", full slots, GM-owned) on ZZ Arena. Caven himself was only read (HP 75/86, AC 15, slots
2/0/0/0/1/0, Mage Armor on; unchanged). Cleanup is at the end of this section.

**Notes that need no code:**

- **"You must have ownership of Ghostly Spirit in order to summon it"** (W9). A test artifact, as the
  tester said: Caven's summon profile actors are owned by Caven's user, and ZZ Tester is not him.
  The GM console also holds the tester's first ownership-restore eval at 10:18 PM, which failed with
  "ownership: is not a mapping of user IDs" on Caven and six profile actors. A later attempt
  worked: Caven, Ghostly/Putrid/Skeletal Spirit, Skeleton and Zombie are back to GM + Caven only
  (read at the end of this pass). For a restore, write the snapshot's whole `ownership` object, or
  use `{[`ownership.-=${userId}`]: null}`; a `null` value inside `ownership` is rejected.
- **Portal drags failing beside the badge (W7).** Not reproduced in code: the badge layer is
  `eventMode: "none"`, the hover card has `pointer-events: none`, and the badge's own pointer
  handler acts only for a GM in edit mode. The tester's drags were in a headless tab; retest with a
  real drag before treating it as a bug.
- **The GM Damage button did not respond to a DOM click (W13).** Not reproduced: a dnd5e chat button
  acts on `click` through its own delegation, so a synthetic click on a stale (re-rendered) card
  element does nothing. Use the live card element or `activity.rollDamage`.
- **The Arcane Recovery roll posted as ZZ Fighter 5 (W5).** Test artifact (the user's assigned
  character). U-6-10 makes that roll unnecessary.
- **`ZZ druid scratch`** still stands on ZZ Arena (with its token). It is the Area 4 fixer's clone,
  not this area's; left for Case Z.
- **Projected Ward and the Reaction pip (W4).** Not changed here (see P-6-d). U-5-8 greys the
  Reaction pip for a Reaction activity used in a started combat; the tester's note "Argon has none"
  should be rechecked in a started combat with Caven as a combatant.

### U-6-3 (bug fix) — A touch spell cast at nobody lands on the caster (Mage Armor, W1)

- **What / why:** W1 failed: Mage Armor cast with nothing targeted spent the slot and applied
  nothing, and a player has no effects tray to fix it. `selfApplyReason` now also answers
  `"untargeted-self"` when the card has **no** targets, its one effect comes from a utility (not
  attack or save) activity for one `creature`, `willing` creature or `ally`, and the range is
  **touch or self**. The card shows "Applied to Caven Calderon: Mage Armor" as before. A ranged buff
  (Haste) cast at nobody is still left in the GM's tray: that is a mistake to ask about, not a
  guess. A spell targeted at a friend is still the friend's. Verified live: the clone with no
  targets cast Mage Armor → AC 12 → 15, one effect, reason `untargeted-self`.
- **Files / settings:** `pentaryn-aoe/core.mjs` (`selfApplyReason`: `rangeUnits`, `untargeted`),
  `effects.mjs` (`selfReason` passes them), `settings.mjs`, lang. Fixtures in `test/run.mjs`. New
  world setting **A touch spell cast at nobody goes on the caster** (`pentaryn-aoe.untargetedSelf`,
  default on). Registry row `aoe-untargeted-touch-self`.
- **Revert:** turn `untargetedSelf` off. For the full revert, remove the `if (!unique.length)`
  branch, the two sets and the two parameters from `selfApplyReason` (move the attack/save check back
  below the target check), the two lines in `selfReason`, the six W1 fixtures, the setting, its lang
  keys and the row. Then check, sync and reload.
- **Retest (W1):** on the Caven tab, release all targets (click empty map), delete Mage Armor from
  the portrait, cast Mage Armor: the card reads "Applied to Caven Calderon: Mage Armor", AC 15, one
  effect. Clicks: panel, spell, Use, Cast = 4 (the chooser is P-6-f).

### U-6-4 (bug fix) — The same spell does not stack; a self-only card keeps no stale target (W2)

- **What / why:** Shield from a slot and then from the Ring of Spell Storing gave two Imperceptible
  Barriers (+10 AC). dnd5e refreshes an effect only when it was copied from the same source effect,
  and the ring's Shield is another item. Three paths copy a card's effect onto an actor
  (pentaryn-combat's self effects, pentaryn-aoe's auto-apply, the tray's Apply), so the rule sits on
  the creation: a `preCreateActiveEffect` hook (creating client only) deletes an enabled effect of
  the same name copied from the same spell (by identifier) before the new one lands. 2024 PHB: the
  effects of the same spell cast more than once don't combine. Also, a self-only activity's card no
  longer records the user's leftover targets (the Shield card named a Fighter targeted earlier;
  `messageConfig.data.system.targets` is emptied in `dnd5e.preUseActivity` when `affects.type` is
  `self` and there is no area). Verified live: Shield (slot) AC 15 → 20, Ring Shield → 20, one
  barrier (the ring's); both cards had 0 targets with a goblin targeted.
- **Files / settings:** `pentaryn-aoe/core.mjs` (`sameSpellEffect`), `effects.mjs`
  (`onPreCreateEffect`, `spellOf`, the hook), `settings.mjs`, lang. `pentaryn-riders/cast-flow.mjs`
  part 3 (the targets line). New world settings **The same spell does not stack**
  (`pentaryn-aoe.noSpellStacking`, default on) and **Summons start with Place Summons ticked**
  (`pentaryn-riders.castDefaults`, default on; also covers the targets line and U-6-7). Registry rows
  `aoe-same-spell-no-stack`, `dnd5e-summon-place-default`.
- **Revert:** turn `noSpellStacking` off (stacking returns) and/or `castDefaults` off (targets kept,
  and U-6-7 off too). For the full revert, delete `onPreCreateEffect`, `spellOf`, the
  `preCreateActiveEffect` registration, `sameSpellEffect` and its four fixtures, the targets block in
  cast-flow part 3, the settings, lang keys and rows. Check, sync, reload.
- **Retest (W2):** on Caven's tab with a goblin targeted, cast Shield (slot), then the Ring's Shield
  (stored): AC goes 15 → 20 and stays 20; one Imperceptible Barrier; neither card lists the goblin.

### U-6-5 (bug fix) — A Self cone or line starts at the caster and points at the mouse (W13)

- **What / why:** dnd5e 6 places areas through core's `RegionLayer#placeRegions` with no `onMove`,
  so Cone of Cold's point followed the mouse and faced east; the cast caught a Fighter, not the
  goblins. For an activity with range **Self** and a cone or line area, `dnd5e.preCreateMeasuredTemplate`
  arms one aim, and a wrap of `RegionLayer.prototype.placeRegions` passes core's documented `onMove`:
  the origin stays where the line from the caster's centre toward the pointer leaves the caster's
  token box (so the caster is not inside their own cone; PHB: a Cone's point of origin isn't in its
  area) and the rotation points at the pointer. Click casts; Escape/right-click cancel and refund as
  before (U-5-12); the handle can still be dragged after. Verified live: the clone's Cone of Cold
  placement with the pointer south → origin on the bottom edge, 90°; west → left edge, 180°; with a
  real pointer to the north-east the cone came off the token's corner toward it. Cancelling refunded
  the 5th-level slot.
- **Files / settings:** new `pentaryn-aoe/aim.mjs` (`installAim`, called from `aoe.mjs`), `core.mjs`
  (`aimFromCaster`, `aimsFromCaster`, 6 fixtures), `settings.mjs`, lang. New world setting **Self
  cones and lines start at the caster** (`pentaryn-aoe.aimSelfAreas`, default on). Registry row
  `aoe-self-area-aim`.
- **Revert:** turn `aimSelfAreas` off (the wrap then passes straight through). For the full revert,
  delete `aim.mjs`, its import and `installAim()` call, the two core helpers and their fixtures, the
  setting, lang keys and row. A loaded client keeps the wrapped prototype until reloaded.
- **Retest (W13):** Caven with Cone of Cold (add it temporarily, as the tester did), goblins to one
  side: cast; the cone's point sits on Caven's token edge and swings with the mouse; click toward
  the goblins. Budget 2: panel/spell (1) + click (1), plus the 5th Level group click.

### U-6-6 (bug fix) — A failed concentration save ends concentration; the card shows DC and result (W9)

- **What / why:** a failed save left the spell up until the player found "Break Concentration", and
  the card showed only the total. On the roller's client, when dnd5e's own
  `SaveMessageData#canBreakConcentration` says the save failed, `actor.endConcentration()` runs and
  the card is marked broken, exactly as the button does (so U-5-2's summon cleanup follows). It stays
  a button when the creature could still turn the failure around: an NPC with Legendary Resistance
  left, or a feature or effect named Indomitable, Mind Sharpener or Bardic Inspiration. Every
  concentration save card with a DC gets one line: "DC 10 · Failed: concentration ended", "DC 10 ·
  Failed" (kept as a button), or "DC 10 · Success: still concentrating". PHB: "If you take damage,
  you must succeed on a Constitution saving throw to maintain Concentration." Verified live:
  Summon Undead (no placement), save vs DC 40 → 23, concentration 1 → 0, outcome `broken`, line
  shown; vs DC 2 → 10, still concentrating, success line.
- **Files / settings:** `pentaryn-riders/concentration.mjs` part 3, `table-core.mjs`
  (`concentrationResult`, `AFTER_FAIL_FEATURES`, fixtures 31–33), `riders.css`, lang. New world
  setting **A failed concentration save ends concentration**
  (`pentaryn-riders.concentrationAutoBreak`, default on; the DC line shows either way). Registry row
  `dnd5e-concentration-auto-break`.
- **Revert:** turn `concentrationAutoBreak` off. For the full revert, delete part 3 of
  `concentration.mjs` and its setting registration, `concentrationResult` and `AFTER_FAIL_FEATURES`
  with fixtures 31–33, the CSS block, the lang keys and the row. Sync and reload.
- **Retest (W9):** Summon Undead placed; the GM hits Caven for 18; Caven rolls the concentration
  card with a low manual d20: the card reads "DC 10 · Failed: concentration ended", the spirit
  vanishes and the strip updates, with no Break click. Budget 3 is now about 7 (the extra is the
  roll dialog and the manual die).

### U-6-7 — Summons open with "Place Summons" ticked (W7, W9)

- **What / why:** Summon Undead and Animate Dead ship with `summon.prompt` off, so each cast needed a
  tick before the profile choice even showed. A wrap of `SummonActivity#_prepareUsageConfig` ticks
  it when placing is possible (summoning allowed, a scene, at least one profile) and the caller did
  not say; an explicit `create: {summons: false}` is kept (a first version in `preUseActivity` could
  not tell them apart and opened a placement on the viewed scene; it was cancelled at once and
  nothing was created). The player unticks it to cast without placing. Verified live: Summon Undead
  and Animate Dead `create.summons` true; with `{summons: false}` passed, false.
- **Files / settings:** `pentaryn-riders/cast-flow.mjs` part 3 (`_prPlaceDefault` wrap),
  `table-core.mjs` (`placeSummonsDefault`, fixture 29), lang. Setting `castDefaults` (U-6-4). Row
  `dnd5e-summon-place-default`.
- **Revert:** turn `castDefaults` off. Full revert: delete the wrap block, `placeSummonsDefault` and
  fixture 29. Sync and reload.
- **Retest (W7, W9):** cast Summon Undead: Place Summons is ticked and the profile dropdown shows.
  One click less.

### U-6-8 (bug fix) — Animate Dead is on the HUD: a "Longer casts" group (W7)

- **What / why:** Argon files a spell by its **first** activity's activation only, so Animate Dead
  (1 minute, then a bonus-action "Mentally Command") and Create Undead were on no bar. The Action
  bar's Cast Spell panel now gets a group **"Longer casts (1 min+)"**: castable spells (Argon's own
  prepared filter) whose first activity is cast in minutes, hours or days, any character. Unprepared
  Ritual-Adept rituals stay in their own group; item-granted spells are left out. Verified live with
  the HUD bound to the clone: Cantrip … 6th Level, "Rituals (no slot)" (9), "Longer casts (1 min+)"
  (2: Animate Dead, Create Undead).
- **Files / settings:** `pentaryn-riders/rituals.mjs` (part 3 in `addRituals`), `rituals-core.mjs`
  (`longCasts`, `LONG_ACTIVATIONS`, fixtures 20–22), lang. New world setting **Longer casts on the
  Combat HUD** (`pentaryn-riders.longCasts`, default on). Registry row `riders-argon-long-casts`.
- **Revert:** turn `longCasts` off. Full revert: delete the "Longer casts" block in `addRituals`,
  `longEnabled`, the setting, `longCasts`/`LONG_ACTIVATIONS` and fixtures 20–22, the lang keys and the
  row. Sync and reload.
- **Retest (W7):** on Caven's tab, Action → Cast Spell: a "Longer casts (1 min+)" tab with Animate
  Dead. Cast from there: the activity chooser (Animate Dead / Mentally Command), Place Summons
  already ticked (U-6-7), Cast, place.

### U-6-9 (bug fix) — A typed number counts on the first Use click (W4)

- **What / why:** typing a Ward Takes Damage amount and clicking Use only committed the value: the
  blur fired a change, dnd5e's usage dialog re-rendered on it (`submitOnChange`), and the click
  landed on a button that was gone. Now a mousedown on Use while a field has focus commits that
  field itself (blur → change → re-render) and, once the dialog has re-rendered, presses the new Use
  button. With nothing changed there is no re-render and the click goes through. (Keeping focus
  instead does not work: the scaling box is a `<range-picker>` that only takes its value on change.)
  Verified live with a real mouse on the GM tab: the clone's ward 29, type 6, one click on Use →
  23, dialog closed.
- **Files:** `pentaryn-riders/cast-flow.mjs` part 4 (`renderActivityUsageDialog`). No setting.
  Registry row `dnd5e-usage-dialog-first-click`.
- **Revert:** delete part 4 and the row. Sync and reload.
- **Retest (W4):** Ward Takes Damage, type 6, click Use once: the pool drops by 6. Same for any
  usage dialog with a number (Pearl of Power's level).

### U-6-10 — Arcane Recovery picks its slots (W5)

- **What / why:** W5 took about 9 clicks: the rest card's Arcane Recovery, Use, a "combined spell
  levels" roll, then the Spells tab and slot pips on the honour system. After Arcane Recovery is used
  (any way: rest card, sheet, HUD), its owner gets a small window: every spent slot of level 1 to 5
  with a number, opening on the highest spent slots that fit the budget, the budget shown ("6 of 6
  levels") and enforced (over the budget, or more than are spent, disables Recover). Recover writes
  the slots and posts "X recovers spell slots by studying the spellbook: 1 × 1st Level, 1 × 5th
  Level." 2024 PHB: combined level no more than half the Wizard level (round up), none of level 6 or
  higher. "Not now" closes it (the use is spent, as before; slots by hand). Verified live: the clone
  (Wizard 12, L1 1/4, L5 1/2) → defaults L1 1 + L5 1 = 6 of 6; L1 3 → "8 of 6", Recover disabled;
  Recover → L1 2/4, L5 2/2, chat line, use 0/1.
- **Files / settings:** `pentaryn-riders/cast-flow.mjs` part 6 (`arcaneRecoveryDialog`, a
  `dnd5e.postUseActivity` hook), `table-core.mjs` (`arcaneRecoveryCap`, `arcaneRecoveryDefault`,
  `arcaneRecoveryCheck`, `isArcaneRecovery`, fixtures 34–39), `riders.css`, lang. New world setting
  **Arcane Recovery picks its slots** (`pentaryn-riders.arcaneRecovery`, default on). Registry row
  `riders-arcane-recovery-picker`.
- **Revert:** turn `arcaneRecovery` off. Full revert: delete part 6, the helpers and fixtures, the
  CSS, the lang keys, the setting and the row. Sync and reload.
- **Retest (W5):** with Caven's slots spent (snapshot first), Short Rest → the rest card's Arcane
  Recovery → Use → the window → Recover: about 5 clicks against a budget of 3.

### U-6-11 (bug fix) — An open HUD panel closes before a summon placement or a Light pick (W8, W10)

- **What / why:** the open Cast Spell panel covered the map; the Light "Pick a target" click opened
  Hypnotic Pattern instead. The panel collapse already done for areas (`argon-collapse-on-area-placement`)
  now also runs on `dnd5e.preSummon`, and pentaryn-senses' Light picker calls
  `ui.ARGON.collapseAllPanels()` before waiting for the map click.
- **Files:** `pentaryn-riders/argon-tidy.mjs` (the hook loop), `pentaryn-senses/light.mjs` (`pick`).
  Registry rows `argon-collapse-on-area-placement` (updated), `senses-light-pick-collapse-hud`.
- **Revert:** in `argon-tidy.mjs` go back to the single `dnd5e.preCreateMeasuredTemplate` hook; in
  `light.mjs` delete the `collapseAllPanels` line; delete the senses row. Sync both and reload.
- **Retest (W10):** Cast Spell → Light → Pick a target, with the panel open: the panel closes, the
  next map click picks the Fighter. 3 clicks after Light.

### U-6-12 (bug fix) — The "Your creatures" strip floats above the Combat HUD (W8)

- **What / why:** docked above the hotbar, the strip sat behind Argon's action bars, and a click on
  the Mage Hand portrait hit Projected Ward. While Argon's HUD is up the strip now floats 8 px
  above the HUD's action bar, left-aligned with it; with the HUD closed it docks above the hotbar as
  before. Argon gives no reliable open/close hook, so the strip re-checks the HUD's rectangle twice a
  second while it exists. Measured on the GM tab (the GM never sees the strip): the action bar's
  top is at 674 of 848 px, so the strip sits at bottom 182 px, x 223, clear of the weapon-set tabs
  (x 15–160). Not seen on a player tab yet.
- **Files / settings:** `pentaryn-creatures/creatures.mjs` (`placeStrip`), `creatures-core.mjs`
  (`stripDock`, 4 fixtures), `creatures.css`, lang. New world setting **Strip floats above the Combat
  HUD** (`pentaryn-creatures.floatOverHud`, default on). Registry row `creatures-strip-over-argon`.
- **Revert:** turn `floatOverHud` off. Full revert: delete `placeStrip`, its call in `render`,
  `stripDock` and its fixtures, the CSS block, the setting, lang keys and row. Sync and reload.
- **Retest (W8):** on Caven's tab with the HUD up and Mage Hand placed: the strip sits just above
  the HUD; one click on the hand's portrait selects it. Close the HUD: the strip drops back above
  the hotbar.

### U-6-13 — Portals: Teleport is the default answer; arrivals step off an occupied square (W7)

- **What / why:** core's `DialogV2.confirm` focuses "Don't Teleport", so Enter declined a portal the
  player walked onto on purpose; and two PCs crossing together plus one already there all stood on
  the one landing square. Now (1) the teleport question opens with Teleport focused (Enter teleports;
  Esc and the X still decline), and (2) when a PC arrives through a portal onto a square someone
  already stands on, the GM's client moves it to the nearest free square around it (the same
  wall-aware ring as "Teleport party"), before its summons are brought along. Verified live: a
  confirm with the core id pattern focused `yes`; the clone moved onto Goblin 1's square
  (600, 1000) and `spreadArrival` put it at (500, 900).
- **Files / settings:** `pentaryn-portals/portals.mjs` (`preferTeleport`, `spreadArrival`, two
  settings with plain-English names because the module has no language file, `spreadArrival` on
  `game.pentaryn.portals`), `portals-core.mjs` (`crowded`, 4 fixtures). New world settings
  **Teleport is the default answer** (`pentaryn-portals.teleportDefault`) and **Arrivals step off an
  occupied square** (`pentaryn-portals.spreadArrivals`), both default on. Registry row
  `portals-teleport-default-and-spread`.
- **Revert:** turn either setting off. Full revert: delete `preferTeleport` and its call,
  `spreadArrival` and its call in `bringFollowers`, the settings block, `crowded` and its fixtures,
  the API key and the row. Sync and reload.
- **Retest (W7):** Caven walks into the Prison→Pit passage: the card opens with Teleport focused;
  Enter goes. With the Fighter too, both land on separate squares, the skeleton beside Caven.

### U-6-14 (console) — A wildcard summon image no longer errors in the placement preview (W7)

- **What / why:** "Invalid Asset …/tokens/skeleton-*.webp" and "…/subjects/skeleton-*.webp" on each
  Skeleton draw. dnd5e's `TokenPlacement` previews the prototype token as stored, wildcard and all;
  the placed token itself gets a real random image from `getTokenDocument`. A wrap of
  `SummonActivity#getPlacement` gives the preview one of the actor's real images (`getTokenImages`
  when the user may browse files, else the portrait). Verified live: the Skeleton prototype
  `skeleton-*.webp` previewed as `skeleton-01.webp`; the placement was cancelled.
- **Files:** `pentaryn-riders/cast-flow.mjs` part 5 (`_prWildcard`), `table-core.mjs`
  (`isWildcardPath`, fixture 30). Registry row `dnd5e-summon-wildcard-preview`.
- **Revert:** delete part 5, `isWildcardPath` and fixture 30, and the row. Sync and reload.
- **Retest (W7):** cast Animate Dead on the Caven tab: no "Invalid Asset" in the console while
  placing.

### U-6-15 (console) — Floating text torn down mid-animation logs nothing (156 × "reading 'position'")

- **What / why:** the GM console's bursts of `Cannot read properties of null (reading 'position')`
  at PIXI's `set y` ← `CanvasAnimation#updateAttribute` (still in the GM tab's log at 10:06–10:09 PM).
  Core's floating text (`createScrollingText`) animates `y`; a text that started while the tab was
  shown and was still waiting when a scene change destroyed it set `y` on a destroyed object on its
  next frame, once per waiting text. Core catches and logs it itself, so wrapping the promise does
  nothing. `PreciseText` now has its own `x`/`y` accessors that ignore a write once the text is
  destroyed (`transform` null). Verified live: a destroyed PreciseText takes `y = 10` silently; the
  GM console has no new errors since this pass began.
- **Files / settings:** `pentaryn-combat/turnflow.mjs` (the "floating canvas text" block), setting
  `scrollingTextGuard` (U-2-6). Registry row `combat-core-scrolling-text-teardown`.
- **Revert:** delete the `Object.hasOwn(P.prototype, "y")` block and the row. Sync and reload.
- **Retest:** with the GM tab in front, apply damage to a few ZZ tokens and switch the GM's view to
  another scene within a second: no "reading 'position'" errors.

### U-6-16 (bug fix) — A Torch added later gets its flame button at once (W11)

- **What / why:** a Torch added after `setupLight()` had no Light activity (no flame button) until the
  GM ran `game.pentaryn.senses.setupLight()` again. The active GM now gives a newly created torch
  item (bought, looted, dragged from a compendium, moved by Item Piles) its Light activity on
  `createItem`, with the same per-item code `setupLight` uses. Verified live: a compendium Torch on
  the clone arrived with Attack + Light (`lightToggle`).
- **Files:** `pentaryn-senses/light.mjs` (`ensureTorchActivity`, the `createItem` hook). No setting,
  no registry row (our own data).
- **Revert:** delete the `createItem` hook; `setup()` may keep using `ensureTorchActivity`. Sync and
  reload.
- **Retest (W11):** drop a Torch from ZZ Footlocker onto Caven: the flame button is there with no
  console call.

### Proposals (Area 6 re-run) — for Joe to decide

- **P-6-a (refined) — Projected Ward reduces the damage.** W4: Projected Ward records the Fighter on
  its card but changes nothing. Option: Projected Ward names the newest damage card on an ally within
  30 ft and, in the GM's damage tray, subtracts the ward's HP from that ally's row (ward pool down,
  the rest to the ally). Still not applied: it changes what Apply does to a real PC.
- **P-6-d — The Reaction pip for Projected Ward.** Recheck in a started combat (see the note above);
  if it really does not grey, the U-5-8 reaction branch needs to count a `reaction` activity on a
  feat, not only on a spell.
- **P-6-e — Light's hour.** W10: nothing says "for an hour" and nothing ends it. Option: the card line
  "Lasts 1 hour (until 11:42 world time)" and the senses reconcile ending it when world time passes
  the hour. Not applied: it needs the world clock's use at Joe's table settled first.
- **P-6-f — The "Use / (free casting)" chooser on every Mage Armor (W1).** Caven's Mage Armor has a
  second `forward` activity "(free casting)" with 1 use, so dnd5e asks which every time. Options:
  Shift-click picks the first activity; or hide a free-casting activity once its use is spent.
- **P-6-g — The Rituals and Longer casts tabs are thin vertical tabs (W3).** Argon draws extra
  accordion groups as narrow tabs beside the level tabs. Option: a badge or icon on them. Argon's
  layout; not changed.
- **P-6-h — One confirm for a party at a portal (W7).** Two prompts queue, and the first confirm loads
  the destination while the second is open. Option: when two owned tokens enter one portal within a
  second, ask once for both. Not applied: core's teleport behaviour runs the prompt.
- **P-6-i — Selecting from the strip pans the camera (W8).** It is by design ("select and show"), but
  it moved targets under the pointer. Option: pan only when the token is off screen.
- **P-6-j — Mage Hand's HUD (W8).** The hand's HUD shows Speed 0 and only the Action bar. 2024 PHB:
  the hand moves up to 30 feet as a Magic action. Option: give Caven's Mage Hand actor a 30 ft fly
  speed (data on a real PC's summon profile; your call).
- **P-6-k — A lit torch merged into a stack arrives unlit (W11).** Recorded again; Item Piles merges
  by item and drops our `lit` flag. Option: refuse the merge for a lit light source.
- **P-6-b (still open) — W15, the Allosaurus stray.** The tester recommends deleting token
  `3MOg1yNcRGsrJtBj` (Surface — Kharg's Adit) and actor `zRTdAW9xtjnoMYzr`. Untouched.

**Cleanup by this fixer:** the clone "ZZ wizard scratch", its token, the Cone of Cold and Torch
added to it, and its 20 chat cards were deleted. No actor, folder, item or token created during the
pass remains (checked by creation time). The tester's own cards (Torch, Cone of Cold, saves) were
left. A test placement preview opened on Drow Prison by the first U-6-7 version was cancelled at once;
no token was created on any scene. The HUD was unbound, the GM view is back on Drow Prison (active
and paused), there are no combats, ZZ Arena has no regions, and the dice configuration is `{}`.
Caven was never written. A temporary `CanvasAnimation.animate` instrumentation was removed and the
tab reloaded.

---

## Area 7 re-run — fixer pass (2026-10-10)

The re-run measured only K6 (pass, 1 + 1 clicks) and K7 (pass). Every player-tab case (K1–K5, K8,
K9, K11 and the live half of K10) was **blocked** at login: the house rule puts player tabs on
`zz<n>.localhost`, `make login` accepted only `localhost`/`127.0.0.1`, so the tester typed a user
password into `/join` and the permission classifier refused it. Fixed in U-7-2 and **proven live**
(a `zz1.localhost` tab came up as Caven through `make login`, no password typed, the GM tab stayed
GM; tab closed afterwards). **Retesters: reload player tabs** (pentaryn-ties changed); the GM tab
was reloaded at the end of this pass.

### U-7-2 (bug fix, run blocker) — `make login` opens player tabs on `<name>.localhost`

- **What / why:** `LOGIN_HOST` now takes `localhost`, `127.0.0.1` **or any `<label>.localhost`**
  (RFC 6761: always loopback; each label is its own Chrome cookie jar, so parallel player tabs never
  knock each other off). Anything that can leave the machine (`example.com`,
  `zz1.localhost.evil.com`, `a.b.localhost`, a LAN IP) is refused, because the ticket URL hands over
  an admin-flagged session. For a `*.localhost` name the one-shot handoff server binds to
  `127.0.0.1` (macOS resolves the label to `::1` first). Two output fixes found while proving it:
  `_say` flushes, so with `NO_OPEN=1` in the background the ticket URL is printed at once rather than
  after the 90 s timeout; and a player-tab login no longer suggests `make tunnel-up`, which the run
  forbids. The test plan now says, in §1 rules 1 and 10 and in the Area 4/6 *Needs*, to open every
  player tab this way and never to type a password.
- **Files:** `scripts/foundry/ops/login.py` (`_LOCALHOST_LABEL`, `loopback_host`, `_bind_address`,
  `player_tab`, `_say(flush=True)`), `scripts/foundry/ops/cli.py` (`--host type=loopback_host`),
  `Makefile` (comment above `vtt-login login`), `scripts/tests/test_foundry_ops.py` (5 new tests,
  including a real handoff on `zz9.localhost` with a fake session), `context/plans/usability-test-plan-2026-10.md`
  (§0 *Actor*, §1 rules 1, 10 and 11, §2 *Owner*, Area 4, 6 and 7 *Needs*, Area 7 K2 and K10(f), case Z item 9).
- **Revert:** in `login.py` delete `_LOCALHOST_LABEL`, `loopback_host` and `_bind_address`, put back
  `if host and host not in LOOPBACK_HOSTS: _say(f"✗ --host must be one of …"); return FAIL`, bind
  `ThreadingHTTPServer((host, 0), …)`, drop `player_tab` (restore `if service._tunnel_pid() is None:`)
  and `flush=True`. In `cli.py` restore `choices=login_mod.LOOPBACK_HOSTS`. Delete the tests under
  "vtt-login --host" at the end of `test_foundry_ops.py`. Change the plan's `zz<n>.localhost`
  login lines back to `127.0.0.1`.
- **Retest:** `./.venv/bin/python -m pytest -q scripts/tests/test_foundry_ops.py` (80 pass).
  Live: `PYTHONUNBUFFERED=1 make login USER_NAME=Caven WORLD=pentaryn LOGIN_HOST=zz1.localhost NO_OPEN=1`,
  open the printed URL in a new tab. It lands on `http://zz1.localhost:30000/game` as Caven, and the
  GM tab is still Gamemaster. Close the tab and Caven goes inactive.
  `make login LOGIN_HOST=example.com` is refused.

### U-7-3 — The inspect window's Share row lists the table's PCs only

- **What / why:** K6 showed 17 switches under every fact: 13 ZZ characters plus a second "Caven",
  which is "Caven Calderon (Allosaurus)". That is dnd5e's **polymorphed copy** (`isPolymorphed`, the
  P-6-b stray on Kharg's Adit), and a share onto it would vanish with the form. The roster rule is
  now `tablePCs` (pure, in `known-core.mjs`). It lists each player's **assigned character**, plus
  every character of a player who has not picked one. Transformed copies, item piles and markers
  are out. If that leaves nobody (no players set up), the old list is used. Where two PCs share a
  first name, the switch shows the whole name (`switchLabels`). The Simulate roller list uses the
  same rule. Live on Vesh: the switches are now Caven, Marrith, Talo and ZZ (ZZ Tester's assigned
  ZZ Fighter 5), and the roller is the same four plus *Hypothetical*. With the real table it is 3.
- **Files:** `foundry/module/pentaryn-ties/known-core.mjs` (`tablePCs`, `switchLabels`),
  `preview.mjs` (`playerCharacters`, `switchState` label, import), `test/known.mjs` (4 fixtures),
  `README.md` (0.19.4 entry), `module.json` 0.19.3 → 0.19.4.
- **Revert:** in `preview.mjs` restore `playerCharacters()` to
  `return game.actors.filter(a => a.type === "character" && !game.itempiles?.API?.isValidItemPile?.(a) && !/marker|crowd|hotspot/i.test(a.name));`,
  change `this.pcLabels?.get(pc.id) ?? firstName(pc.name)` back to `firstName(pc.name)`, and drop
  `tablePCs, switchLabels` from the import. Delete both functions from `known-core.mjs` and their 4
  fixtures and import names from `test/known.mjs`. Then
  `make foundry-ties-check foundry-ties-sync` and reload the GM tab.
- **Retest:** `node foundry/module/pentaryn-ties/test/known.mjs` (183 pass). Live: token HUD flask on
  Vesh → *Player view*. Each fact's row shows one switch per player's character (no ZZ besides ZZ
  Tester's own pick, no second Caven), and *Share with all* reaches only those.

### Bug and console notes that need no code

- **"Closer look resolves the whole cascade in one call" is the design.** `runCascade` climbs every
  rung in one gesture, one blind roll per rung, and stops at the first failure or a held rung. The
  player and `S.inspectAs` run the same loop. The plan's "one rung per roll" meant one d20 each, not
  one rung per click. The K2 *Pass* cell now says so.
- **"Star Druids left no row after the reset" is the design too.** Caven's earlier Star Druids roll
  (13) was his first contact with the attribute, so its failure also wrote the permanent stage-1
  "never knew of it" (`attributeKnowledge`). `resetInspection` clears the creature's rows but
  deliberately keeps stage-1 knowledge, and `planStep` then breaks on `failedAttribute` without
  rolling. This is documented in `attributes.md` → "Undoing things" (⚠ paragraph: follow with
  `A.tell(pc, id, { withParents: true })` to revive the branch). The K2 *Pass* cell now names it. The
  tester's flag restore put the original row back, so nothing is lost.
- **`DataModelValidationError … ownership: is not a mapping` on Caven and his summon actors (10:16–10:18
  PM).** These came from the Area 6 tester's restore eval (`eval.jsonl` 02:18:07Z), not from module
  code. It wrote `{"ownership.-=<userId>": null}`. Proven on an unsaved Actor in 14.369: `ownership.-=id`,
  `{ownership: {"-=id": null}}`, `_del` and `null` are all rejected with that error. Only the whole
  map written with `{diff: false, recursive: false}` (or the `remove-actor-ownership` tool) works.
  **The Area 6 notes above say "or use `ownership.-=${userId}`". That advice is wrong.** No pentaryn
  module or the MCP bridge removes ownership that way (grepped). §1 rule 11 of the plan now gives the
  working form.
- **pixi `reading 'position'` and `Region ASqH5zUaNwITZC5r does not exist`.** Both are from the same
  10:16–10:18 PM window, during Area 6, before U-6-15 and the Area 6 GM reload. The tester found none
  later. Nothing to do here; if they recur after this reload, see U-6-15 / U-4-7.
- **Setup gap.** The real PCs' tokens are on Kharg's Adit (a campaign scene), not Drow Prison.
  Area 7's *Needs* now says to place temporary `zzTemp` tokens on Drow Prison, and the same for
  Nilonim (P-7-d).
- **K10(f) plan correction applied.** The sheet's Attributes tab is present for players. It lists
  only what that PC was told or worked out, with no offers or DCs.
- **K6 data.** Undo leaving Vesh in Marrith's Known list is documented behaviour (`forgetFact`
  header). See P-7-f.

### Proposals (Area 7 re-run) — for Joe to decide

- **P-7-c (still open) — Key 7 on the double-click menu.** Unchanged since the first pass. It is the
  only one of 8/7/6 with no menu or HUD route that a player would plausibly want on an NPC. It needs
  `Overlay.showOne(source, target)` with explicit arguments. Not applied: no player tab could
  exercise it in this run.
- **P-7-f — "Take it back" also takes back the notebook page the share created.** Today Forget
  removes the card but leaves the creature in the player's Known list (an empty page if they never
  met them otherwise). Option: `shareFact` marks a Known entry it *created* (`via: "share"`), and
  `forgetFact` removes that entry when the mark is still there and the player wrote no notes and
  holds no other card on that page. Not applied: it deletes player-side data, and the "wrote nothing"
  test needs a live check on a player tab.
- **P-7-g — `resetInspection` says which branches stay closed.** After a reset, a rung whose
  stage-1 roll failed is silently never rolled again (the Star Druids case). Option: the reset's
  notification names those attributes ("Star Druids stays unrecognised for Caven — use
  `A.tell` to revive"), or a `{ revive: true }` option clears the stage-1 failure too. Not applied:
  the permanence is a rule Joe set (stage 1 is one roll ever), and a GM-console nicety.
- **P-7-h — Fixture clutter in the share row while ZZ characters exist.** U-7-3 already drops 12 of
  13. If Joe would rather see none, the test plan could leave ZZ Tester with no assigned character
  during Area 7. Not recommended: §1 rule 11 needs the assignment for the melee areas.

**State left by this pass:** no world documents created or changed except the GM-only ownership
probes on two **unsaved** Actors (never written). The Caven login session was opened on
`zz1.localhost` and its tab closed (Caven inactive). Drow Prison is active and paused, the GM tab is
reloaded on 0.19.4 code and sits in the background behind `example.com`. The tunnel was not touched.

## Area 8 live re-run — fixer pass (2026-10-10)

The live run (player tab `zz81.localhost`, ZZ Tester as ZZ Fighter 5) passed L1, L2, L4, L5, L6, L9
and L11 and rated L3, L7, L8 and L10 friction. Its limits: every token move was an API move and
every drop a synthetic DragEvent (the Chrome tool's drag and arrow keys never moved a token), and
both tabs stayed `visibilityState: hidden`. Real-drag, ghost-through-a-wall and keyboard behaviour
are still unverified live. This pass fixed the console error and the party-teleport stray in code,
added the streamlining below, and corrected two plan claims. Synced; the GM tab was reloaded twice
(clean console after the second load). **Retesters: reload player tabs** (pentaryn-attunement,
-senses, -portals and -movement changed).

### U-8-3 — Lights: the hood posts a chat line; an outshone flame says so; a bigger flame target

- **What / why:** L5 found three things. Lowering the hood posted nothing, while lighting does.
  With a torch and the hooded lantern both lit, lowering the hood visibly changed nothing (only the
  strongest carried light reaches the token, so the torch's 20/40 stays) and the sheet gave no hint
  why: both flames were the same orange. And the 13 px flame glyph was missed by 1 px. Now the hood
  posts "ZZ Fighter 5 lowers the hood of the Lantern, Hooded." (and "raises"), in the user's chat
  mode like the light line. A lit item that is **not** the one lighting the token gets a dimmer
  flame with no glow, and the tooltip "Lit, but your Torch gives more light, so this one adds nothing
  now. Click to put it out." The flame and hood buttons get 3 px / 4 px padding (hit box about
  19 × 19 px, was 14). New pure `lightingItemId(items)` picks the item exactly as `carriedLightOf`
  does, through a shared `lightEntries` helper. Proven live on ZZ Fighter 5 with a temporary Torch
  and Hooded Lantern (flags set directly, no chat; both deleted afterwards with the ledger skipped,
  and the token dark again): with the hood down the lantern is `outshone`; open, the torch is.
- **Files:** `foundry/module/pentaryn-senses/light-core.mjs` (`lightEntries`, `lightingItemId`;
  `carriedLightOf` uses the helper), `light.mjs` (`announce()` shared by `toggle` and `hood`,
  `decorateSheet` outshone marker, import), `styles/light.css` (`.outshone`, button padding),
  `lang/en.json` (`Light.HoodLowered`, `Light.HoodRaised`, `Light.Outshone`), `test/light.mjs`
  (5 fixtures), `README.md` (lit-items paragraph), `module.json` 0.4.0 → 0.4.1.
- **Revert:** in `light.mjs` drop the `announce(...)` call from `hood()` (and, if wanted, inline
  `announce` back into `toggle`), delete the `lighting`/`winner`/`tip` lines in `decorateSheet` and
  restore `cell.append(rowButton(\`ps-light-toggle${lit ? " lit" : ""}\`, "fa-solid fa-fire", L(lit ?
  "PENTARYN_SENSES.Light.Douse" : "PENTARYN_SENSES.Light.LightIt"), locked, () => toggle(item)));`,
  remove `lightingItemId` from the import. In `light-core.mjs` delete `lightingItemId` (keeping
  `lightEntries` is harmless). Remove the `.outshone` rule and the `padding`/`margin` lines in
  `light.css`, the three lang keys and the 5 fixtures. `make foundry-senses-check
  foundry-senses-sync`, reload clients.
- **Retest:** `node foundry/module/pentaryn-senses/test/run.mjs` (light-core 100 pass). Live as the
  player: light the torch, light the hooded lantern, lower the hood → a chat line; the lantern's
  flame is dimmer and its tooltip names the Torch. Put the torch out → the lantern's flame is
  orange again and the token reads 0 / 5. The flame is easy to hit at the row's normal zoom.

### U-8-4 — Teleport party: a confirm that lists who moves; followers land beside their PC; area handles stay; a plain portal question

- **What / why:** L11 carried 11 tokens with no confirm (the plan's "1 + confirm" had no confirm in
  code), and the run had to avoid the Pit because a `pentaryn-aoe` area handle, "Circle of Death
  (Caven)", is owned by every player and so counted as party. It would have arrived alone, its area
  left behind. The Elemental Spirit landed by ring order, not beside its druid. L6's core question
  read "teleport X to Passage → Drow Prison in Drow City — Fighting Pit (set-piece)?".
  1. **Handles are never party.** `recordOf` sets `handle` (token flag `pentaryn-aoe.handle`, or the
     shared handle actor's `handleActor` flag); `carriable` excludes it, for both Teleport party and
     the native follow (`followersOf`).
  2. **Confirm first.** *Teleport party* opens "Move these N tokens to <card title>?" with one line
     per token, followers marked "lands beside <PC>". Teleport is the default button; Cancel or the
     X moves nothing. World setting `confirmPartyTeleport` (on). The API takes
     `teleportParty(region, { confirm: false })`.
  3. **Followers beside their PC.** New pure `leaderOf` (the summoner, else the PC one of its owners
     plays) and `assignSpots`: PCs take the free square nearest the landing centre, each follower
     the free square nearest its PC. The ring offers 8 spare squares so a follower can pick one
     that touches its PC, and the centre copies `ringSpots` pads a boxed-in landing with are used
     last.
  4. **Plain question.** With one revealed destination and no GM-written question on the behavior,
     the dialog's first line becomes "Teleport <token> to <card title>?" (the card is right below).
     Several destinations, unrevealed ones and a custom `dialog.revealed` text are unchanged.
  Proven live: the confirm opened from Drow Prison listed "Arcane Eye — follower" and Cancel left
  every token in place. A stand-in dialog with core's id read "Teleport Glubbek to The Fighting
  Pit — the upper stands?" with Teleport focused.
- **Files:** `foundry/module/pentaryn-portals/portals-core.mjs` (`carriable` + `handle`, `leaderOf`,
  `assignSpots`, `partyPreview`), `portals.mjs` (`recordOf` `name`/`handle`, `partyRecords`
  replaces `partyTokens`, `landingPlaces(…, party)`, `carryTo(…, party)`, `confirmParty`,
  `teleportParty(region, {confirm})`, `plainQuestion` called from `decorate`, setting
  `confirmPartyTeleport`), `portals.css` (`.pp-party`), `test/run.mjs` (16 fixtures),
  `README.md` (two bullets), `module.json` 0.4.2 → 0.4.3. Adjustment row
  `portals-teleport-default-and-spread` already covers the dialog hook.
- **Revert:** in `teleportParty` drop the `confirm` option and `confirmParty` call, use
  `const toks = partyTokens(from)` with `function partyTokens(scene) { return
  partySelection(scene.tokens.map(recordOf)).map(r => r.doc); }`, and call `landingPlaces`/`carryTo`
  without `party`. In `landingPlaces` restore `const spots = ringSpots(cx, cy, g, toks.length, {
  blocked: wallBlocker(walls), occupied });`. Delete `confirmParty`, `plainQuestion` and its call,
  the `confirmPartyTeleport` setting, the `handle`/`name` record fields and `.pp-party` CSS. In
  `portals-core.mjs` restore `const carriable = t => !t.pile && !t.excluded && !isPC(t);` and delete
  `leaderOf`, `assignSpots`, `partyPreview` and their fixtures. `make foundry-portals-check
  foundry-portals-sync`, reload the GM tab.
- **Retest:** `node foundry/module/pentaryn-portals/test/run.mjs` (52 pass). Live (L11, GM, from
  `ZZ Arena` or the Pit): right-click a portal badge → *Teleport party → X*. The confirm lists the
  PCs and each summon with "lands beside <PC>", and no area handle. Teleport: each summon lands
  touching its PC. L6: walk onto the Prison → Pit passage; the question reads "Teleport ZZ
  Fighter 5 to The Fighting Pit — the upper stands?".

### U-8-5 (bug fix, console) — dnd5e item tooltips no longer throw when the row re-renders under the pointer

- **What / why:** 5 × `TypeError: Cannot read properties of null (reading 'getBoundingClientRect')`
  on the player tab, from `TooltipManager._setAnchor` via dnd5e 6.0.6
  `Tooltips5e#_positionItemTooltip` (`dnd5e.mjs:95910`). dnd5e positions an item tooltip in a
  `requestAnimationFrame` after its content loads. When the hovered row was re-rendered away first
  (the sheet refreshes after a take, an attune or a light), core has already deactivated the
  tooltip, `game.tooltip.element` is null, and `_setAnchor` throws. The module now wraps that
  method on `ready` and returns when there is no anchor. Nothing visible changes: there was nothing
  to position. Vendor files untouched.
- **Files:** `foundry/module/pentaryn-attunement/attunement.mjs` (`guardItemTooltipPosition`,
  called in the `ready` hook), `README.md` (dnd5e 6 section), `module.json` 0.2.0 → 0.2.1,
  `foundry/adjustments.yml` (new row `dnd5e-item-tooltip-anchor`, retire_class safe).
- **Revert:** delete `guardItemTooltipPosition` and its call, the README paragraph and the
  adjustments row; `make foundry-attunement-sync foundry-adjustments-check`, reload clients.
- **Retest:** `Object.getPrototypeOf(game.dnd5e.tooltips)._positionItemTooltip.pentarynGuarded` is
  `true` (it is, on the GM tab). On a player tab, hover an inventory row and take or light an item
  while hovering: no `getBoundingClientRect` error in the console.

### U-8-6 — Test plan: L1 has no ledger undo; ZZ Tester logs in with `make login`, no password

- **What / why:** (1) L1's *Flexibility* and *Pass* promised drop-bin ledger rows and a ledger
  undo for Loot all. The ledger records only items **leaving a character** (drops and deletes,
  `dropbin.mjs` header), so a pile → character loot writes nothing. That was the plan's error, not a
  bug. The row now says the GM drags the items back, and the pass checks Item Piles' "picked up"
  chat card. A loot row type is P-8-e. (2) The tester tried the §2 *Owner* passwords (`zz`,
  `talo`), then reset ZZ Tester's password from the GM client. §2 now says `ZZ Tester` exists, its
  password never matters, and `make login USER_NAME="ZZ Tester" LOGIN_HOST=zz<n>.localhost
  NO_OPEN=1` signs in with no user password (§1 rule 1).
- **Files:** `context/plans/usability-test-plan-2026-10.md` (Area 8 L1 *Flexibility* and *Pass*;
  §2 *Owner*, new "Logging in (U-8-6)" paragraph).
- **Revert:** restore L1's cells to "undo: the ledger (`game.pentaryn.dropbin.list()`) lets the GM
  put it back" and "everything in the Fighter's inventory, the pile empty, the ledger rows written",
  and delete the "Logging in (U-8-6)" paragraph.
- **Retest:** read Area 8 L1 and §2 *Owner*. The next Area 8 run logs in through `make login` and
  never types or sets a password.

### U-8-7 — Ghost movement: a toast when it is allowed again after a fight

- **What / why:** L7 rated "after the fight the button stays off until clicked" mild friction (easy
  to forget). The switch still does **not** come back by itself (the README's rule, kept). But the
  client that switched it off now remembers why, and when ghost is allowed again (the combat ends,
  or the GM turns it back on) and the player has not switched it on themselves, it says so once:
  "The fight is over: ghost movement is available again. Click the ghost button under the Ruler to
  use it." New pure `ghostBack({cleared, policy, combatActive, wish})`.
- **Files:** `foundry/module/pentaryn-movement/movement-core.mjs` (`ghostBack`), `movement.mjs`
  (`clearedBy`, two branches in `refresh`), `lang/en.json` (`notify.back.combat`,
  `notify.back.off`), `test/run.mjs` (6 fixtures), `README.md` (GM control bullet),
  `module.json` 0.1.1 → 0.1.2.
- **Revert:** in `refresh()` delete `let clearedBy`, the `clearedBy = reason;` line and the
  `if (wish()) clearedBy = null; else if (… ghostBack …) { … }` block; delete `ghostBack`, its
  fixtures, the `notify.back` keys and the README sentence. `make foundry-movement-check
  foundry-movement-sync`, reload player tabs.
- **Retest:** `node foundry/module/pentaryn-movement/test/run.mjs` (89 pass). Live (L7) as the
  player: ghost on, the GM starts a combat with a combatant on the scene (toast "A fight started…"),
  the GM deletes the combat → toast "The fight is over: ghost movement is available again…", once.
  The button is still off until clicked.

### Bug and console notes that need no code (or need Joe)

- **The red d20 on every page load is a Dice So Nice persistent die, not a rendering glitch.**
  DSN 6.4.4 has *persistent dice* (world setting `persistentDice`, on). One d20
  (`persistentId xDpeqiozILcUGhiA`, colour `#cc2852`) is stored in the **Gamemaster user's** flags
  (`flags.dice-so-nice.persistentDice`) and is redrawn on every client at load. Not removed here: it
  is on Joe's GM user and may be his. See P-8-g.
- **"Circle of Death (Caven)" on the Pit** is a live area: its region `Circle Template [Caven]`
  (60 ft, spell level 6, from Caven's item `57Vb08KbmjRfrW3K`) exists, so pentaryn-aoe's orphan
  sweep keeps it on purpose. The 2026-10-10 dnd5e-6 cleanup listed it as "kept for review". U-8-4
  stops it joining the party. Deleting it is Joe's call (P-8-f).
- **Drow Prison: the "Cell" pin sits under Glubbek.** The note `IUeJWT2MBOxPxobu` (3661, 1377) is
  inside Glubbek's square (token `iVYw85qKgwYDZUlk` at 3517, 1244, 150 px grid). Glubbek is a GM NPC,
  so owned-on-top never lifts him, and no player-owned token sits on any pin in 16 scenes. Moving
  either one changes a real campaign scene, so it is P-8-f.
- **"Config Update" in a player's loot window means Item Piles opened it with no recipient.** Item
  Piles 3.3.4 shows that button only when `editQuantities` is true, which is `!recipient`
  (`item-piles.js:44642`). A double-click from an adjacent owned token always sets a recipient
  (`_itemPileClicked`), and `ItemPileInventoryApp.show` reuses an already-open window for that pile
  with its old recipient. So the tester's window most likely came from an earlier open with no
  token in range, or from the sidebar. *Split currency* and *Close Lid* are Item Piles' player
  features on a shared container. See P-8-h.
- **The stale row after Take is Item Piles waiting on the GM client.** Every transfer runs on the
  GM's client. In the run the GM tab was a hidden background tab, where Chrome throttles timers, so
  the update reached the player window late. At a table with the GM tab in front this should be
  near-instant. Recheck once with the GM tab visible before changing anything.
- **GM-tab `ownership: is not a mapping` and `undefined id [xynt7dlFIhBR38M5]`** (11:00–11:02 PM)
  came from the run's own setup eval (an ownership partial update), before the stage. §1 rule 11
  gives the working form.
- **Lantern flicker.** Lamps and lanterns use core's `torch` animation at speed 1 / intensity 1
  (`LIGHT_PROFILES`), on purpose: they are flames, gentler than a torch's 2 / 2. Left as is.
- **ZZ Tester's password** was reset by the tester. Case Z deletes the user; nothing to restore.

### Proposals (Area 8 live re-run) — for Joe to decide

- **P-8-e — A "looted" row in the drop-bin ledger.** Record Item Piles transfers from a pile or
  corpse to a character (`item-piles-transferItems` / `transferEverything` hooks) with the pile's
  uuid, so `restore(n)` can undo a mistaken *Loot all* by moving the items back. Not applied: it
  changes what the ledger means ("everything that leaves a character"), and a correct undo has to
  remove the item from the character as well as recreate it on the pile, which needs a GM-side
  transfer and its own tests.
- **P-8-f — Two real-scene fixes for Joe.** (1) Move the Drow Prison "Cell" pin one square off
  Glubbek (or move Glubbek), so `pinsUnderTokens()` lists nothing on any scene. (2) Delete the Pit's
  Circle of Death area (region `pydNm5Ei5cPBKyQf` and its handle) if it is leftover test state;
  pentaryn-aoe deletes the handle with the region. Not applied: both are campaign scenes.
- **P-8-g — Clear the persistent d20.** If Joe did not place it on purpose: right-click the die →
  remove, or `game.dice3d.box.persistentDiceManager.clearPersistentDice()` as the GM. Optionally
  switch off DSN's world setting *persistent dice* if the table never uses them. Not applied: it
  lives on Joe's GM user.
- **P-8-h — Trim the loot window footer for players.** Hide *Split currency* / *Split items* (the
  Pentaryn table shares by talking, and *Loot all* is the one-click path) and keep *Close Lid*. If
  "Config Update" shows for a player again, record how the window was opened (see the note above).
  Not applied: it removes Item Piles features, and the Config Update cause is not reproduced.
- **P-8-i — Offer the way back on arrival.** After a portal arrival the token stands in the return
  region and must step out and back in to return. Option: the arriving player gets a toast "Back
  to Drow Prison: step off and onto the passage again". Not applied: low value, and a toast on every
  arrival may be noise.
- **P-8-j — Test harness: a foreground player window.** Run the player tab in its own Chrome window
  that can really be brought to the front (the run could not raise Chrome over Code). Then drag,
  arrow keys, ghost through a wall (L7), the drop onto an attunement slot (L4), L3's drag-to-sheet
  and L6's fade can be measured with real input. Process only.

**State left by this pass:** no world documents changed. ZZ Fighter 5 got a temporary Torch and
Hooded Lantern for the outshone check; both were deleted with the ledger skipped (ledger tail still
#40), and its token is dark. The party-teleport confirm was opened from Drow Prison and cancelled
(no token moved). Drow Prison is active and paused, no combats. The GM tab is reloaded on the new
code. No player tab was opened. The tunnel and the updater were not touched.

---

## Area 9 re-run — prompt markers (2026-10-11)

No code or settings changed. Proposals (not applied):

- **P-9-a — Shift+Esc on a fresh drop deletes the marker.** Undo reverts the text to empty and the
  empty fresh drop is then removed with the box. Predictable from the docs, but a GM who only wanted
  to clear the text loses the marker. Option: undo restores the text and keeps the box open.
- **P-9-b — Door line hidden behind a fold.** The side panel shows the door only as a `door` tag on
  out-of-sight rows inside the collapsed "Out of sight" list. Option: show a "door E, closed" line
  above the fold when the nearest blocker is a door.
- **P-9-c — `scenes: "current"` in the module API.** `game.pentaryn.prompts.gather({scenes:["current"]})`
  throws `SCENE_UNKNOWN: current` (the MCP tool accepts it). Fix in the module or the doc table.
- **P-9-d — `prompt-markers` MCP tool not visible to a subagent.** Fallback via eval-js worked for
  every call; no change needed beyond the doc's existing fallback table.
- **Doc fix:** `context/foundry/prompt-markers.md` says the side panel does not refresh on a wall edit;
  it does (9 to 14 to 9 visible tokens on delete and re-add of a wall). Update the known-gap list.

**State left:** ZZ Arena, all ZZ actors, the folder, ZZ Tester, both ZZ Tester journals, the spec file
and the Area 9 hotspot and note are deleted. Caven and Talo each lost a stale `pentaryn-combat` turn
flag and Marrith a stale `pentaryn-aoe.careful` flag (dead-combat bookkeeping added after the
snapshot). Drow Prison is active and paused, no combats.

## Area 9 re-run — fixer pass (2026-10-11)

The run (Joe as GM, ZZ Tester on `zz9.localhost` for PM7) passed PM1 to PM7 and case Z. This pass
fixed the player-tab console error, the module API's `"current"` scene and the stale per-combat
flags at their root, applied P-9-a and P-9-b, and corrected the plan. Synced
`pentaryn-portals` 0.4.4, `pentaryn-prompts` 0.4.2, `pentaryn-combat` 0.2.1 and `pentaryn-aoe`
0.3.1, and reloaded the GM tab: `prompts.status().version` reads `0.4.2`, the new `deleteCombat`
and `canvasTearDown` handlers are registered, and `gather({scenes: ["current"]})` returns a gather.
**Retesters: reload player tabs** (portals, combat and aoe changed). `game.modules` still lists the
old versions until a world rescan; judge by the loaded code.

### U-9-6 (bug fix, console) — Portal badges no longer throw on a scene activation

- **What / why:** the player tab logged `TypeError: Cannot read properties of null (reading
  'addChild') at drawBadges (portals.mjs:315)` when the GM activated ZZ Arena. `drawBadges` is
  async: it awaits each destination's thumbnail. A scene change in that gap fires `canvasTearDown`
  (which set `badgeLayer = null`) or a second `drawBadges` (a region hook, `canvasReady`), and the
  first draw then added its badge to a null or replaced layer. Each draw now takes a run number and
  keeps its own `layer`. Teardown and any newer draw bump the number, and a retired draw destroys
  its half-built badge and stops. Badges look and behave the same.
- **Files:** `foundry/module/pentaryn-portals/portals.mjs` (`drawRun`, `drawBadges`: local `layer`
  and `stale()`, the `canvasTearDown` hook bumps `drawRun`), `README.md` (badge redraw race note),
  `module.json` 0.4.3 → 0.4.4.
- **Revert:** delete `drawRun` and its comment, `stale()` and the `if (stale()) …` line; put back
  `badgeLayer = new PIXI.Container()` with `badgeLayer.addChild(c)`; drop `drawRun++;` from the
  teardown hook; delete the README bullet; set the version back to 0.4.3.
  `make foundry-portals-check foundry-portals-sync`, reload clients.
- **Retest:** `node foundry/module/pentaryn-portals/test/run.mjs` (52 pass; no pure logic changed).
  Live: a player tab joined on a scene with a travel badge (Drow Prison has them), the GM activates
  another scene and then back: no `addChild` error in the player console, and the badges are drawn
  once (not twice) on return.

### U-9-7 (bug fix) — `gather` takes `"current"` inside a scenes list

- **What / why:** `game.pentaryn.prompts.gather({scenes: ["current"]})` threw `SCENE_UNKNOWN:
  current`; only the bare string worked. A new pure `sceneRefs(scenes)` normalises the argument:
  `"current"` (any case, alone or as a list entry) is the viewed scene, a single id or name string
  is a one-scene list (it used to fall through to *all*), null or `"all"` is every scene with a
  prompt. Duplicates are dropped. Closes P-9-c.
- **Files:** `foundry/module/pentaryn-prompts/geometry-core.mjs` (`sceneRefs`, `CURRENT_SCENE`,
  `VERSION` 0.4.2), `gather.mjs` (`pickScenes`), `test/usability-fixes.mjs` (7 fixtures),
  `README.md` (`scenes` line, 0.4.2 status), `module.json` 0.4.1 → 0.4.2;
  `context/foundry/prompt-markers.md` (the `scenes` knob row).
- **Revert:** restore `pickScenes` to the three-branch form (`scenes === "current"` / `Array.isArray`
  / else all), drop the two imports, delete `sceneRefs` and `CURRENT_SCENE` and their fixtures.
  Revert the README and doc rows. (If U-9-9 and U-9-10 stay, keep the version at 0.4.2.)
  `make foundry-prompts-sync`, reload the GM tab.
- **Retest:** `node foundry/module/pentaryn-prompts/test/run.mjs` (415 pass). Live, on any scene:
  `gather({scenes: ["current"], crops: false})` and `gather({scenes: "current", crops: false})`
  both return `scenes="1"` (verified on the GM tab, Drow Prison). `gather({scenes: "<a scene name>"})`
  gathers that one scene.

### U-9-8 (bug fix) — A deleted combat's turn, Reaction and Careful Spell flags are removed

- **What / why:** case Z found `flags.pentaryn-combat.turn` on Caven and Talo and
  `flags.pentaryn-aoe.careful` on Marrith, left by earlier areas' combats, and removed them by hand
  to match the snapshot. They are keyed to a combat (`"combatId:round:combatant"`, or
  `{combatId}` for the Reaction), so they were inert once it ended, but nothing ever removed them,
  and every test run had to clean real PCs. Now, on `deleteCombat`, the active GM's client removes
  from each combatant's actor (after the existing turn-end sweep) the `turn` flag whose key
  belongs to that combat, the `reaction` flag for that combat, and an armed Careful Spell bound to
  one of its turns. The out-of-combat turn (`nocombat`) and an out-of-combat Careful Spell (the
  10-minute window) are left alone. New pure `staleCombatFlags(flags, combatId)` (combat) and
  `carefulStale(flag, combatId)` (aoe).
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`staleCombatFlags`), `turnflow.mjs`
  (the `deleteCombat` hook, `clearCombatFlags`), `test/run.mjs` (fixture 348), `README.md` (*Data
  written*: the `turn` row and a new `reaction` row), `module.json` 0.2.0 → 0.2.1;
  `foundry/module/pentaryn-aoe/core.mjs` (`carefulStale`), `resolve.mjs` (`installResolve`: an
  `on("deleteCombat", …)`), `test/run.mjs` (1 check, 6 cases), `README.md` (Careful Spell
  paragraph), `module.json` 0.3.0 → 0.3.1.
- **Revert:** in `turnflow.mjs` put back the old hook body (the `for` loop calling only the two
  sweeps) and delete `clearCombatFlags`; delete `staleCombatFlags` and fixture 348. In
  `resolve.mjs` delete the `deleteCombat` block and the `carefulStale` import; delete
  `carefulStale` and its check. Revert both README edits and versions.
  `make foundry-combat-sync foundry-aoe-sync`, reload clients.
- **Retest:** `node foundry/module/pentaryn-combat/test/run.mjs` (291 pass) and
  `node foundry/module/pentaryn-aoe/test/run.mjs` (160 pass). Live on a scratch scene: start a
  combat with a ZZ PC, swing once (the actor gets `flags.pentaryn-combat.turn`), take a Reaction
  off-turn (`.reaction`), arm Careful Spell on a sorcerer (`flags.pentaryn-aoe.careful` with a
  `key`), then delete the combat. Within a second all three are gone from the actors. A swing made
  out of combat afterwards still writes and keeps its `nocombat` turn. Not run live in this pass
  (no scratch scene; Drow Prison must stay untouched).

### U-9-9 — The prompt footer says ⇧Esc removes a new marker (P-9-a)

- **What / why:** PM1 found that Shift+Esc on a fresh drop also deletes the marker (undo puts the
  text back to empty, and an empty fresh marker is removed on close), while the footer said only
  "⇧Esc undoes". The behaviour is kept, since it is the quick way to take back a stray drop. The
  footer now tells the truth: on a fresh marker (with *delete empty on close* on) it reads
  "Esc saves · ⌘⏎ saves · ⇧Esc removes this new marker"; on a reopened one it reads
  "… · ⇧Esc puts the text back". Keeping the box open on Shift+Esc (the other P-9-a option) was not
  applied: it changes a key Joe already uses.
- **Files:** `foundry/module/pentaryn-prompts/dialog.mjs` (`_prepareContext` hint), `lang/en.json`
  (`dialog.hint` reworded, new `dialog.hintFresh`), `README.md` (the Esc bullet).
- **Revert:** set `hint: t("dialog.hint")`, restore `"hint": "Esc saves · ⌘⏎ saves · ⇧Esc undoes"`,
  delete `hintFresh` and the README parenthesis. Sync prompts, reload the GM tab.
- **Retest:** drag a `Prompt · mid` onto a scratch scene: the footer says "⇧Esc removes this new
  marker". Type, press Shift+Esc: the marker is gone (toast). Reopen an existing marker with
  Shift+P: the footer says "⇧Esc puts the text back". The strings were checked on the GM tab.

### U-9-10 — A door in the way is named above the side panel's fold (P-9-b)

- **What / why:** PM6 found the closed door only as a `door` tag on a row inside the collapsed
  *Out of sight* list, easy to miss. When anything within the out-of-sight radius is blocked only by
  a door, the panel now shows one bold line under the header: "Behind a closed door: Nilonim Vrinn
  (10 ft W)" (up to 3 names, then `+N`; a secret door says so). The collapsed list is unchanged.
  New pure `behindDoor(unseen, {max})`.
- **Files:** `foundry/module/pentaryn-prompts/geometry-core.mjs` (`behindDoor`), `dialog.mjs`
  (`#renderPanel`: `door`, `doorLine`), `lang/en.json` (`panel.behindDoor`),
  `styles/prompts.css` (`.pp-door`), `test/usability-fixes.mjs` (5 fixtures), `README.md` (side
  panel bullet).
- **Revert:** delete `behindDoor` and its fixtures, the `door`/`doorLine` lines and `${doorLine}`
  in the panel HTML, the lang key, the two `.pp-door` rules and the README sentence. Sync prompts,
  reload the GM tab.
- **Retest:** `node foundry/module/pentaryn-prompts/test/run.mjs` (415 pass). Live (PM6): a marker
  on one side of a closed door with a token 10 ft beyond it: the panel shows "Behind a closed door:
  <name> (10 ft <dir>)" above the in-sight list; open the door and the line goes (U-9-1 redraw).

### U-9-11 — Test plan: PM1 says `Prompt · mid`; PM3's "known gap" is gone; PM6's pass names the door line

- **What / why:** (1) PM1 told the tester to drag `Prompt · medium`; the folder actor is
  `Prompt · mid` (the size keys are `tiny small mid large xl`). The plan now uses the real name
  rather than renaming actors. (2) PM3 still listed "the side panel does not refresh on a wall edit
  (known)", which U-9-1 fixed in 0.4.1 and this run confirmed (9 → 14 → 9). (3) PM1's undo cell and
  PM6's pass now name U-9-9 and U-9-10. The doc fix flagged in the Area 9 section above needed no
  edit: `prompt-markers.md` never carried the gap (it was only in the plan), and the module README
  already said the panel redraws.
- **Files:** `context/plans/usability-test-plan-2026-10.md` (Area 9 rows PM1, PM3, PM6).
- **Revert:** put back `Prompt · medium`, "undo: **Shift+Esc** reverts the text", PM3's "the side
  panel does not refresh on a wall edit while open (known) — confirm and rate" / "panel correct
  after reopen", and PM6's "door line shown; recorded".
- **Retest:** read Area 9 PM1, PM3 and PM6.

### Bug and console notes that need no code

- **`prompt-markers` MCP tool not visible to the subagent (P-9-d).** This is the documented
  subagent limit (`prompt-markers.md`, "Subagent, or tool still missing after one retry → use the
  fallback table now"). The eval-js fallback carries the same arguments and readback. No change.
- **"ZZ Footlocker existed on ZZ Arena"** was a setup-report error, not a world state problem: no
  such actor or token was found, and nothing references it.
- **GM-tab console before the area** was not captured (tracking began mid-area). The GM tab was
  reloaded in this pass; the next run should start console capture before setup.
- **This pass's `gather` checks** stored one manifest (`pm-9dc5`, 0 prompts, Drow Prison) in the
  hidden `lastCalls` ring, which keeps the last 5. Harmless and replaced by later gathers.

### Proposals (Area 9 fixer pass) — for Joe to decide

- **P-9-e — Shift+Esc keeps the box open.** If the new footer still surprises Joe: Shift+Esc puts
  the text back and leaves the box open, and Delete (or closing empty) removes a fresh marker. Not
  applied: it changes a key in use, and the footer now says what happens.
- **P-9-f — Rename the size word `mid` to `medium` everywhere.** The folder actors, chips, the
  gather's size words and the spec readback all say `mid`; docs and people say "medium". A rename
  touches the marker actors (`ensureMarkers`), every saved marker's size lookup and the gather
  legend, so it needs a migration and its own test pass. Not applied; the plan now uses `mid`.
- **P-9-g — Start console capture before setup in every area.** Process only: the Area 9 GM-tab
  console was tracked from mid-area, so load-time errors would have been missed.

**State left by this pass:** no world documents changed beyond the `lastCalls` manifest above. The
real PCs carry no `pentaryn-combat` or `pentaryn-aoe` flags. Drow Prison is active and paused, 0
combats, one GM client (reloaded on the new code). No player tab was opened. The tunnel and the
updater were not touched.

## Area 10 — melee build-review live checks: fixer pass (2026-10-11)

The run (ZZ Tester on `zz10.localhost`, a rebuilt fixture set, see the setup note below) passed R1,
Hew on an unlinked NPC, Action Surge, Pole Strike, item-less Dash / Dodge and most U-1 to U-3
re-checks. This pass fixed the orphaned drawer and stray tooltips, the stale movement readout, the HUD
not following at combat start, the lost Enter focus after New target and Stop, the Nick swing kept
after a swap, the Undo link, the stale flags on a real PC and the rebuilt Monk's Quarterstaff, and
corrected the README. Synced `pentaryn-combat` 0.2.2 and `pentaryn-prompts` 0.4.3 and reloaded the
GM tab: `prompts.status().version` reads `0.4.3`, `game.pentaryn.combat.core` has `replanExtras`
and `orphanCombatFlags`. **Retesters: reload player tabs** (pentaryn-combat changed). `game.modules`
lists the old versions until a world rescan; judge by the loaded code. Tests: `node
foundry/module/pentaryn-combat/test/run.mjs` 298 pass (fixtures 349–355 new),
`node foundry/module/pentaryn-prompts/test/run.mjs` 415 pass.

### U-10-1 (bug fix) — An open drawer stays above its button when the bar is rebuilt; stray Argon tooltips close

- **What / why:** with the Polearm Master drawer open, the glaive Full Attack added Pole Strike to the
  Bonus bar, the bar was rebuilt, and the drawer reappeared detached at the HUD's far left (x ≈ 215
  against its button at ≈ 590) until the next re-render. Argon's `ButtonPanel` reopens a drawer from
  its saved state (`restoreState → toggle(true)`) inside its own render, before our
  `drawerNearButton` wrapper is installed, so it was never placed. The render hook now places an
  already-open drawer on the next frame, and every bar recomposition (`applyButtons`) re-places the
  open drawers of its buttons. Separately, Argon's own buttons (Action Surge, the Longsword slot)
  never close their hover tooltip (Argon commented its mouseleave out), so it stayed after clicks,
  re-renders and turn changes. Any Argon tooltip now closes when the pointer is over something that
  is neither its button nor the tooltip, or when its button has left the page (also checked after a
  bar re-render). A locked tooltip stays. The tooltip part is a pure bug fix with no setting.
- **Files:** `foundry/module/pentaryn-combat/turnflow.mjs` (render hook: place a restored-open drawer;
  new export `placeOpenDrawers`), `hud.mjs` (import it; `applyButtons` calls it; `dropStrayTooltip`
  and its `pointerover` listener; `rerender` calls it after a panel render), `README.md`
  (`drawerNearButton` row), `module.json` 0.2.1 → 0.2.2; `foundry/adjustments.yml` (rows
  `combat-argon-drawer-restore-place`, `combat-argon-stray-tooltip`; delete them on revert).
- **Revert:** in `turnflow.mjs` delete the `if (panel.element?.classList?.contains("show"))
  requestAnimationFrame(…)` line and `placeOpenDrawers`; in `hud.mjs` put back
  `import "./turnflow.mjs";`, delete the `placeOpenDrawers(panel)` line in `applyButtons`, delete
  `dropStrayTooltip` and its `document.addEventListener("pointerover", …)`, and change
  `.then(() => { dropStrayTooltip(); return refillWeaponSlots(p); })` back to
  `.then(() => refillWeaponSlots(p))`. Revert the README row. `make foundry-combat-sync`, reload clients.
- **Retest:** ZZ Polearm 5 in combat: open the Use Feature drawer, press T on a goblin, Full Attack
  with the Glaive (Enter x2). When Pole Strike appears on the Bonus bar the drawer is still open
  directly above its button, not at the far left. Hover Action Surge, then move the pointer onto the
  canvas: its tooltip closes. Hover the Longsword slot and press End Turn: no tooltip is left on screen.

### U-10-2 (bug fix) — The HUD follows the first combatant at combat start, also when its token can't be selected

- **What / why:** at combat start the HUD stayed on the Fighter when the Rogue was first, and went down
  when the TWF clone was first (U-1-9). The hook already saw the start (U-3-15), but it released the
  other tokens and then called `token.control()`, which core refuses when the token can't be selected
  at that moment (`layer.active`, `isInteractable`, `_canControl` — another layer or tool active, a
  placement running). Nothing was then selected, so Argon closed the HUD 100 ms later, or its own
  start-of-combat handler (`_onCombatStart`, which runs after our hook) bound `controlled[0] ?? _token`,
  the old token. Now `followTo(token)` selects the token only when core will allow it and otherwise
  binds the HUD to it directly (`ui.ARGON.bind`), leaving the selection alone. At combat start it
  looks again 300 ms later, once Argon's own bind is done, while that combatant's turn is still the
  current one. The report's "plain clicks on tokens did nothing" (4 tries) points at the same refusal,
  most likely the automation harness; it needs Joe's hand check (below).
- **Files:** `foundry/module/pentaryn-combat/turnflow.mjs` (`combatTurnChange` hook, new
  `followTo`), `README.md` (`hudFollows` row).
- **Revert:** in the `combatTurnChange` hook put back
  `if (token && token.scene === canvas.scene && ui.ARGON?._token !== token) token.control({ releaseOthers: true });`
  and delete `followTo` and the 300 ms re-check. Sync, reload clients.
- **Retest:** a combat whose first combatant (Rogue 5) is not the selected token (Fighter 5): on
  Begin Combat the player's HUD shows the Rogue with no click; repeat with the TWF clone first: the
  HUD stays up and shows it. **Joe, by hand:** on a player tab, left-click a ZZ token you own: it is
  selected and the HUD binds to it (the automation could not make a canvas click select anything).

### U-10-3 (bug fix) — Argon's movement readout follows Dash and its end

- **What / why:** after Dash the player's readout said 6/6 while walk was 60 ft, and on the next turn
  (Dash gone) it said 12. Argon's `MovementHud` reads the maximum live (`system.attributes.movement`)
  but redraws only when the token moves or its movement history changes, so a Speed change by an
  effect with no move since showed the old number. Any Active Effect created, updated or deleted on
  the HUD's actor, a Speed edit on the actor, and every turn change now redraw it
  (`updateMovement`, 50 ms later, after dnd5e has prepared the actor). Pure bug fix, no setting.
- **Files:** `foundry/module/pentaryn-combat/turnflow.mjs` (`redrawMovement`, `queueMovement` and
  their hooks at the end of the file), `README.md` (Known gaps, Dash bullet); `foundry/adjustments.yml`
  (row `combat-argon-movement-redraw`; delete it on revert).
- **Revert:** delete the block "Argon's movement readout follows your Speed (Area 10)" at the end of
  `turnflow.mjs`. Sync, reload clients.
- **Retest:** ZZ Fighter 5 on its turn: Dash. The readout goes from 6 to 12 at once. End Turn and come
  back round to the Fighter without moving: it reads 6.

### U-10-4 (bug fix) — Enter means what the strip says after New target and Stop; roll windows stay on screen

- **What / why:** (1) after **New target** picked a goblin the resumed swing's window opened without
  focus (the pick's canvas pointerup lands after it renders), so the strip's "Enter = Normal" did
  nothing until the player clicked Normal. (2) **Stop** with a swing's window open left the focus on
  the Stop button, so Enter did nothing there either. (3) Lay on Hands' Healing roll window opened at
  the bottom right, partly off screen. While a sequence runs, each roll window now gets its default
  button focused once it paints and again 150 ms later, unless the focus is already in it or the
  player is typing in a text field elsewhere (chat, a Roll Resolution box). Stop hands the focus back
  to the open window's default button. Outside a sequence a roll window (and the Roll Resolution
  window) is only moved back inside the viewport when it overflows (new pure `clampToView`).
- **Files:** `foundry/module/pentaryn-combat/strip.mjs` (`topRollWindow`, `typingElsewhere`, exported
  `focusRollWindow`, `settleFocus`, `keepOnScreen`, Stop's `requestAnimationFrame`), `combat-core.mjs`
  (`clampToView`), `test/run.mjs` (fixture 355), `README.md` (`dockRollDialogs` row).
- **Revert:** in `strip.mjs` delete the "focus: Enter means what the strip says" block, the
  `settleFocus()` line in `onRollWindow`, `keepOnScreen` and its call (put back `if (!docking()) return;`),
  and the `requestAnimationFrame(() => focusRollWindow({ force: true }))` after Stop; drop
  `clampToView` from the import and from `combat-core.mjs` with fixture 355. Sync, reload clients.
- **Retest:** Fighter 5 Full Attack, Esc on swing 1, **New target**, click goblin B: the dialog opens
  and Enter rolls Normal with no click. Full Attack again, with swing 2's window open click Stop, then
  press Enter: swing 2 rolls Normal, no swing 3. ZZ Paladin 5 Lay on Hands: the Healing roll window
  is fully on screen.

### U-10-5 (bug fix) — A pause-bar swap onto the Nick weapon replans the Nick swing

- **What / why:** Shortsword planned as 2 swings + Nick Dagger; swapping to the Dagger at swing 1 gave
  three Dagger swings, the last labelled Nick. PHB 2024: the Light property's extra attack is made
  with a *different* Light weapon (Nick only moves it into the Attack action), and Nick is the extra
  weapon's mastery. The swap now sends the Nick swing the new main weapon earns (`extraSwings` for it)
  and the reducer replaces the unrolled planned one with it (new pure `replanExtras`): Dagger as main
  gives no Nick swing (the Shortsword has Vex, not Nick), Longsword gives none (not Light), and a
  Light main with another Nick weapon equipped keeps one with that weapon. A Nick swing already rolled
  this sequence means none is added; paused on the Nick swing itself, a swap changes nothing; callers
  that pass no `extras` (Multiattack) keep the old plan. Live check on ZZ Fighter 5's real items:
  swap to Dagger → Dagger, Dagger; to Longsword → Longsword, Longsword.
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`replanExtras`, `sequenceReducer`
  `swap`), `sequence.mjs` (`swapExtras`, the swap dispatch, `turnOf` import), `test/run.mjs`
  (fixtures 350–354), `README.md` (Known gaps: the Nick-swap bullet folded into the rewind bullet).
- **Revert:** in the reducer's `swap` case return `{ ...state, swings }` again; delete `replanExtras`,
  `swapExtras`, the `extras:` key on the dispatch and the `turnOf` import, and fixtures 350–354. Put
  back the README bullet "A swing strip swap onto the Nick weapon keeps the planned Nick swing; the GM
  arbitrates." Sync, reload clients.
- **Retest:** Fighter 5 with Shortsword (set 1) and Dagger equipped: Full Attack, Esc, pick the
  Dagger tile, Enter x2: two Dagger swings, no third, and the flag reads `nick: false`; no Nick
  button follows (the Shortsword has no Nick mastery), while a Bonus-action **Off-hand: Shortsword**
  may be offered, which the PHB allows. Repeat picking the Shortsword tile: Shortsword, Shortsword,
  Dagger (Nick).

### U-10-6 — The `character` helper enchants a Monk's weapons with Martial Arts (and ZZ Monk 5 rebuilt with it)

- **What / why:** the rebuilt ZZ Monk 5's Quarterstaff rolled `1d20 - 1 + 3` (STR) because the
  Martial Arts enchantment is applied by hand from the feature card (U-3-15 did it once on the old
  fixture, which case Z deleted). Any Monk the prompt-markers `character` helper builds now gets it on
  every qualifying weapon through dnd5e's own activities ("Master Simple Weapon", "Master Light Martial
  Weapon", `applyEnchantment`; `canEnchant` picks the weapons; natural weapons and already-enchanted
  ones are skipped). The dry run names the weapons in a note. The current ZZ Monk 5 fixture got it the
  same way: "Quarterstaff (Martial Arts)", +6, `1d8 + 3` (enchantment effect `3b4Q5zd46trOqbB2`).
- **Files:** `foundry/module/pentaryn-prompts/character.mjs` (`enchantMartialArts`, called in
  `runBuild`), `geometry-core.mjs` (`VERSION` 0.4.3), `module.json` 0.4.2 → 0.4.3, `README.md`
  (character bullet, status); `foundry/module/pentaryn-combat/README.md` and
  `context/foundry/melee.md` (the Monk known-limit lines); world data (ZZ Monk 5, a test fixture).
- **Revert:** delete `enchantMartialArts` and the `report.enchanted = …` line, set both versions back
  to 0.4.2, revert the three doc edits. `make foundry-prompts-sync`, reload the GM tab. To undo the
  fixture: delete effect `3b4Q5zd46trOqbB2` on ZZ Monk 5's Quarterstaff.
- **Retest:** `node foundry/module/pentaryn-prompts/test/run.mjs` (415 pass). Dry-run a `character`
  marker "Monk 5, quarterstaff": the report has the note "Martial Arts enchantment to apply:
  Quarterstaff"; the real run's Quarterstaff reads +6 / `1d8 + 3` (DEX 16). ZZ Monk 5: a Quarterstaff
  swing reads `1d20 + 3 + 3`.

### U-10-7 (bug fix) — Turn and Reaction flags of a combat that no longer exists are swept

- **What / why:** after U-9-8, Marrith still carried `flags.pentaryn-combat.turn` keyed to combat
  `np9rmFrVOKJiRQWR` (deleted before the Area 10 run). U-9-8 clears flags only for the combat being
  deleted, and only on its combatants, so a combat deleted while no GM was connected, before 0.2.1, or
  whose combatant no longer resolved to its actor, left them for good. The active GM now also removes
  every world actor's `turn` and `reaction` flag whose combat id is not in `game.combats`, once on
  load and 1.5 s after any combat is deleted. `nocombat` turns stay. New pure `orphanCombatFlags`.
  **Real PC touched:** the reload in this pass ran the sweep and removed Marrith's stale `turn` flag
  (inert since its combat was gone; Area 9's snapshot had none). Nothing else on any real PC changed;
  her `reaction` key is `null` and stays, as before.
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`orphanCombatFlags`), `turnflow.mjs`
  (`sweepOrphanFlags`, a `ready` hook and a second `deleteCombat` hook), `test/run.mjs` (fixture 349),
  `README.md` (*Data written*, a sweep row).
- **Revert:** delete `sweepOrphanFlags`, its `Hooks.once("ready", …)` and its `Hooks.on("deleteCombat", …)`,
  `orphanCombatFlags` and fixture 349, and the README row. Sync, reload clients.
- **Retest:** `node foundry/module/pentaryn-combat/test/run.mjs`. Live: on a ZZ actor set
  `flags.pentaryn-combat.turn = {key: "nonexistent:1:x"}`, reload the GM tab: the flag is gone. A
  live combat's flags and a `nocombat` turn survive the reload. (Verified on reload: no world actor
  carries a combat-keyed turn or Reaction flag.)

### U-10-8 — The Auto Sneak Attack Undo is a button

- **What / why:** the "+ Sneak Attack 3d6 · Undo" note's Undo was an `<a>` with no `href`. The tester's
  real click on it did nothing (with the chat sidebar collapsed the cards showed only in the pop-up
  stack), and it reads as text. It is now a small bordered button with an undo icon, the same click
  handler (it also stops the click from reaching the card), and the card re-render check finds it.
  Behaviour is unchanged: Undo gives back the once-per-turn use; the damage card keeps the 3d6 (the GM
  doesn't apply it), as its tooltip says.
- **Files:** `foundry/module/pentaryn-combat/riders.mjs` (`renderAutoNote`, `rerenderCards`'
  `showing` selector), `styles/combat.css` (the `button[data-undo]` rules replace the two
  `a[data-undo]` rules), `README.md` (the Auto row).
- **Revert:** put back `<a data-undo="…" data-tooltip="…">Undo</a>`, `closest("a[data-undo]")` without
  `ev.stopPropagation()`, the `a[data-undo]` selector in `showing`, and the two old CSS rules. Sync,
  reload clients.
- **Retest:** Rogue 5 with Sneak Attack on Auto: Steady Aim, T, Rapier, Enter. The damage card shows
  "+ Sneak Attack 3d6 [Undo]" with a bordered button; one click (from the chat sidebar, and from the
  pop-up) gives the notice "Sneak Attack is available again this turn" and the button goes.

### U-10-9 — README corrections: Dash / Dodge and rewind

- **What / why:** Area 10 found two README lines stale. (1) The "Known gaps" list opened with Argon's
  item-less Dash / Dodge as if a gap; they are handled and were confirmed live (pips spent, effects end
  on turn end). The bullet now names only the real gap (a Cunning Action / Step of the Wind Dash gets no
  Dash effect). (2) "Rewinding the tracker reads as a fresh turn" was half true: with one stored turn
  flag, rewinding to the same turn with nothing done on a later turn restores it; only after the actor
  acted on a later turn does the rewind read as fresh. The Nick-swap bullet went with U-10-5.
- **Files:** `foundry/module/pentaryn-combat/README.md` (Known gaps).
- **Revert:** restore the two bullets as they were (see U-10-5 for the Nick one).
- **Retest:** read Known gaps.

### Bug and console notes that need no code (or need Joe)

- **Console:** the player tab logged nothing; the GM tab's one `ActiveEffect "dnd5edead0000000" does
  not exist!` came from the tester's own eval deleting a virtual status. No change.
- **Setup:** the fixtures were gone because Area 9's case Z deleted them after the setup report was
  written. The tester rebuilt a reduced set (scene `iDm6LYYBtUR9hSL6`, folder `Q0SlPQwzPghBbRj8`, ZZ
  Tester `Ma4jQ5eaycu6LH66`, seven PCs, ZZ Goblin, ZZ Ogre); Fighter 11 / 20, the Footlocker and
  Nilonim were not rebuilt. They are still in the world for the retest. See P-10-a.
- **Preflight `ok: false`** only because the active scene is "Drow Prison (Devils Hold Prison)" (a name
  match). P-10-b.
- **U-1-9 plain clicks:** see U-10-2; Joe's hand check decides whether a canvas click selects.
- **Lost type-ahead Enter during damage settling** (once): an Enter pressed while the previous swing's
  damage was still settling, before the next window opened, has nowhere to go. Not changed (P-10-c).
- **Hew** was shown and withheld correctly; the click itself, Divine Smite, Hide / Ready / Shove, the
  TWF Off-hand: Dagger beside Nick, U-2-5's live tooltip refresh and U-4-9 were not run (blocked by
  U-1-9 or not rebuilt). They stay on the retest list.

### Proposals (Area 10 fixer pass) — for Joe to decide

- **P-10-a — Case Z only at the very end, or each area rebuilds its fixtures.** Area 9's case Z deleted
  the shared ZZ fixtures before Area 10 ran, and its setup report still listed them. Either run case Z
  once after the last area (plan §3 order), or give every area's setup a "rebuild if missing" step with
  the `character` helper and a readback of ids, never reusing a report from before the previous area's
  cleanup. Process only; no code.
- **P-10-b — Preflight's active-scene check matches by id, not by name.** The check flagged
  "Drow Prison (Devils Hold Prison)" as not Drow Prison. Matching the scene id (or a `startsWith`)
  removes the false alarm.
- **P-10-c — Hold a type-ahead Enter for the next swing's window.** While damage settles between
  swings, an Enter could be kept for up to ~1 s and replayed on the next window's default button.
  Not applied: an Enter meant for something else (chat) could roll a swing.
- **P-10-d — Lay on Hands in 2 clicks (P-3-h stands).** Area 10 counted 5 clicks (LoH, target, Heal,
  Use Ability, Roll) with the scaling box at 1. U-10-4 only keeps its window on screen. The P-3-h
  options (bind the HUD button to Heal, pre-fill the target's missing HP capped at the pool, require a
  target) are still open for Joe.
- **P-10-e — Undo also strips the dice from the damage card.** Today Undo gives the use back and the GM
  simply doesn't apply the card. Re-rolling the card without the rider's dice (or writing a corrected
  total) would make the card read right, at the cost of a second damage card. Not applied.

**State left by this pass:** ZZ Monk 5's Quarterstaff enchanted (U-10-6); Marrith's stale `turn` flag
removed by the new sweep (U-10-7). The Area 10 fixtures (above) are still in the world for the retest.
Drow Prison is active and paused, 0 combats, one GM client (reloaded on the new code). No player tab
was opened. The tunnel and the updater were not touched.

## Area 10 re-run follow-up — fixer pass (2026-10-11)

The re-run left two Area 10 bugs (report R.4, 1–2) and the Area 2 Stop faults (R.4, 3–4). This pass
fixed the HUD at combat start, made Stop close an open roll window (and take its run's empty usage
cards with it), and found that the "Off-hand: Longsword after Nick" offer is correct under the 2024
PHB, so only its tooltip changed. Synced `pentaryn-combat` 0.2.3 and reloaded the GM tab:
`game.pentaryn.combat.core` has `hudFollowPlan`, `offhandVia` and `deltasConsumed`, and
`Strip.StopHint` reads the new text. **Retesters: reload player tabs** (pentaryn-combat changed).
`game.modules` lists the old version until a world relaunch. Tests: `node
foundry/module/pentaryn-combat/test/run.mjs` 312 pass (fixtures 356–369 new),
`make foundry-combat-check` and `make foundry-adjustments-check` pass (the `combat-argon-hud-follows`
row's `what` names the combat-start recheck).

**Rules check (PHB 2024, read from the owned book in Foundry).** *Light:* "you can make one extra
attack as a Bonus Action later on the same turn. That extra attack must be made with a different Light
weapon." *Nick:* "When you make the extra attack of the Light property, you can make it as part of the
Attack action instead of as a Bonus Action. You can make this extra attack only once per turn."
*Dual Wielder, Enhanced Dual Wielding:* "you can make one extra attack as a Bonus Action later on the
same turn with a different weapon, which must be a Melee weapon that lacks the Two-Handed property."
*Two-Weapon Fighting:* adds the ability modifier to "an extra attack as a result of using a weapon that
has the Light property". So Dual Wielder is a second extra attack, separate from the Light one that
Nick moved into the Attack action. A Longsword (Versatile, not Two-Handed) qualifies. The ZZ Fighter 5
TWF clone has Dual Wielder (plan §2 row; the Longsword can only be offered with
`flags.dnd5e.enhancedDualWielding` set). After Shortsword ×2 plus the Nick Dagger, "Off-hand:
Longsword" is a legal Bonus-action attack, as fixture 292 (U-2-4) already said.

**Why the retest saw the Longsword although the tester unequipped it:** the TWF setup unequipped the
Longsword (eval at 04:51:40Z), but Argon's weapon set 1 for that actor holds the Longsword, and
`enhancedcombathud-dnd5e`'s `_onSetChange` (switchEquip) runs on every weapon-set render and re-equips
the active set's items. To test "Off-hand: Dagger beside Nick", the Longsword must leave the Argon
weapon set too, not only be unequipped (retest of U-10-12).

### U-10-10 (bug fix) — The HUD follows the first combatant at combat start, also when Argon was off

- **What / why:** report R.4 bug 1 (U-10-2 did not fix it). After a combat is deleted, Argon's
  `_onDeleteCombat` switches it off (`openCombatStart`). At the next Begin Combat our
  `combatTurnChange` hook runs before Argon's `updateCombat` handler, so `argonOn()` was still false
  and the hook skipped both the immediate follow and the 300 ms look-again. Argon then switched on and
  bound `controlled[0] ?? _token`, the old token. The look-again is now scheduled at combat start
  whatever Argon's state, at 300 ms and 1.2 s (a hidden player tab throttles timers to 1 s). Each
  look-again still needs Argon on by then, this combatant's turn still current, and the HUD on
  another token. A player who keeps the HUD off (no `openCombatStart`) is left alone. New pure
  `hudFollowPlan`.
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`hudFollowPlan`), `turnflow.mjs`
  (`combatTurnChange` hook), `test/run.mjs` (fixtures 356–359), `README.md` (`hudFollows` row),
  `module.json` 0.2.2 → 0.2.3; `foundry/adjustments.yml` (`combat-argon-hud-follows` `what`).
- **Revert:** in the `combatTurnChange` hook put back the U-10-2 block
  (`if (setting("hudFollows") && next?.actor?.isOwner && argonOn()) { const token = …; if (token &&
  token.scene === canvas.scene) { followTo(token); if (!ended) setTimeout(() => { … }, 300); } }`);
  delete `hudFollowPlan` and fixtures 356–359; revert the README row and the registry `what`.
  `make foundry-combat-sync`, reload clients.
- **Retest:** on `zz<n>.localhost`, as ZZ Tester: delete any combat, select ZZ Fighter 5, create a
  combat whose first combatant is ZZ Rogue 5 and press Begin Combat. Within about 1 s the player's
  HUD shows the Rogue, with no click. Repeat with the TWF clone first: the HUD stays up and shows it.
  With Argon switched off by the player (and `openCombatStart` off) the HUD stays off.
- **Verified here:** node fixtures only. The hook returns early for a GM, so the GM tab cannot show
  it; this needs the player-tab retest above.

### U-10-11 (bug fix) — Stop closes an open swing window; a stopped run's empty usage cards go

- **What / why:** report R.4 bug 4 and plan A11 ("the sequence ends, no stray dialog"). Stop with a
  swing's roll window open left the window up (U-2-10 / U-10-4 made Enter roll it). Stop (and an
  abort: Wild Shape, the turn moving on) now closes that swing's attack window unrolled. Only the
  window whose roll subject is the swing in flight closes; a damage window or a manual-dice Roll
  Resolution being filled in stays. The run ends at once, swings not rolled stay on the pips, and
  Stop's tooltip says so. The same bug item's "a cancelled Nick swing leaves a stray usage card" is
  fixed too: the `tidyCancelledAttacks` hook keeps a card while a run may still use it (Esc pauses),
  so Esc on the Nick swing then Stop left the Dagger card. When a run ends, every usage card it
  posted with nothing rolled under it and nothing consumed is deleted, under the same setting.
  `consumedAny` moved to the core as `deltasConsumed` (shared by both).
  **This replaces part (2) of U-10-4** ("Stop … press Enter: swing 2 rolls Normal"). That retest no
  longer applies.
- **Files:** `foundry/module/pentaryn-combat/sequence.mjs` (`closeSwingWindow`, `tidyOrigins`,
  `current.created`, `onStop`, `abortFor`, the `finally` block, `setting` import), `strip.mjs` (the
  Stop click no longer refocuses the window), `turnflow.mjs` (`core.deltasConsumed` replaces
  `consumedAny`), `combat-core.mjs` (`deltasConsumed`), `lang/en.json` (`Strip.StopHint`),
  `test/run.mjs` (fixtures 366–369), `README.md` (strip row, `tidyCancelledAttacks` and
  `dockRollDialogs` rows), `context/foundry/melee.md`.
- **Revert:** in `sequence.mjs` delete `closeSwingWindow`, `tidyOrigins`, the `created` set and its
  `add`, the two `closeSwingWindow()` calls and the `created`/`setTimeout(tidyOrigins…)` lines in
  `finally`. In `strip.mjs` put back `requestAnimationFrame(() => focusRollWindow({ force: true }));`
  after `choose({ type: "stop" })`. In `turnflow.mjs` restore the local `consumedAny`. Restore
  `Strip.StopHint` to "End the Full Attack here. With a roll window open, that roll still counts if
  you roll it, and no further window opens. Swings not taken stay available." Delete `deltasConsumed`
  and fixtures 366–369, and revert the doc lines. Sync, reload clients.
- **Retest (A11):** ZZ Fighter 5 with a temporary Fire Bolt, on its turn: Full Attack, Enter (swing
  1), and with swing 2's window open click **Stop**. The window closes at once, the strip goes, the
  Action pips show 1 swing left (`game.pentaryn.combat.plan(actor).left` = 1) and the flag reads
  `swings: 1`. Cast Fire Bolt: left = 0. Then a fresh turn with the Shortsword + Dagger Nick plan:
  Enter, Enter, Esc on the Nick swing (pause), Stop. No Dagger usage card is left in chat.
- **Verified here (GM tab, scratch actors and a scene-less scratch combat, all deleted):** swing 1
  rolled, swing 2's window "Attack Roll · Longsword, swing 2 of 2" open, Stop: 0 windows left, run
  `{rolled: 1, status: "stopped"}`, flag `swings: 1`, left 1; Fire Bolt then `otherActions: 1`, left
  0. Next round: Full Attack, swing 1's window closed (pause), the new usage card kept while paused,
  Stop: `{rolled: 0, status: "stopped"}`, card deleted, left 2.
- **A11 "swing record lost after Stop": root cause not found.** The Area 2 transcript shows that in
  the failing tries the turn flag was **never written** (raw `flags.pentaryn-combat` held only
  `last.weapon`, on the GM and on the player tab), not reset. It is not the Stop path: a read made
  right after swing 1 and before Stop showed `swings: 1` and kept it. In the failing tries a GM eval
  had added Fire Bolt to the actor and unset the flag shortly before. One try had also rewound the
  tracker. The GM tab does not reproduce it, with a cantrip on the actor, an unset flag and a
  rewound turn (two scripted runs, swing recorded each time). The most likely cause is the player's
  client classifying the swing as not its own turn ("reaction", so nothing changes and nothing is
  written), but this is not proved. `updateTurn` logs a failed write with `console.warn`, and the
  tester captured only errors. **Retester:** capture `console.warn` too, and on a failure read
  `game.pentaryn.combat.turn(actor)` and `combatContext` on the player tab.

### U-10-12 — An Off-hand that is Dual Wielder's says so

- **What / why:** report R.4 bug 2. Not a rules bug: see the rules check above. The tooltip said only
  "The Light property's extra attack", so "Off-hand: Longsword" after Nick read as a non-Light weapon
  making the Light attack. Each Off-hand offer now carries `via` (new pure `offhandVia`). It is
  `"dual-wielder"` when its weapon is not Light, or when the Light attack is spent by Nick or offered
  as Nick beside it, and the tooltip then reads "Dual Wielder: a second extra attack as a Bonus
  Action, separate from the Light property's one (Nick) …". The label, the offers and the rolls are
  unchanged.
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`offhandVia`), `hud.mjs`
  (`followUpsNow` sets `via`; `FollowUpButton.getTooltipData`), `lang/en.json`
  (`FollowUpText.offhand-dual-wielder`), `test/run.mjs` (fixtures 360–365), `README.md` (Bonus bar
  row), `context/foundry/melee.md`.
- **Revert:** delete the `via` loop in `followUpsNow`, give `getTooltipData` back the plain
  `FollowUpText.<kind>` key (drop the `offhand-dual-wielder` choice), delete `offhandVia`, the lang key
  and fixtures 360–365, and revert the two doc lines. Sync, reload clients.
- **Retest:** ZZ Fighter 5 TWF (Dual Wielder) with Shortsword, Dagger and Longsword equipped: Full
  Attack with the Shortsword (2 swings + Nick Dagger). The Bonus bar offers **Off-hand: Longsword**,
  and its tooltip names Dual Wielder. It rolls `1d8 + 3` (TWF), Bonus pip spent. For **Off-hand:
  Dagger** beside Nick: take the Longsword out of Argon's weapon set 1 (drag it off, or set set 1 =
  Shortsword + Dagger) **and** unequip it. Otherwise Argon re-equips it on render. Then the Bonus bar
  offers Off-hand: Dagger. Without Dual Wielder nothing is offered after Nick (fixture 365).
- **Verified here:** on a scratch Dual Wielder with the PHB Longsword, Shortsword and Dagger
  (mastery in all three): the plan is Shortsword, Shortsword, Dagger (Nick). Before Nick the offers are
  `nick: Dagger` + `offhand: Longsword via dual-wielder`; after Nick `offhand: Longsword via
  dual-wielder`; without the Dual Wielder flag nothing is offered after Nick.

**State left by this pass:** no fixtures created or changed. The scratch actors "ZZ Scratch A11",
"ZZ Scratch U-10-10" (and their B partners) and their scene-less combats and chat cards were deleted.
No real PC or real scene was touched; Marrith still carries her old `reaction` key (cosmetic, R.4 9).
Drow Prison is active and paused, 0 combats, one GM client (reloaded on 0.2.3, in the background). No
player tab was opened. The tunnel and the updater were not touched, and the world was not relaunched.

## Area 3 re-run (rogue, monk, barbarian, paladin) — fixer pass (2026-10-11)

The Area 3 retest passed B1–B7, C1–C3, E1, E2, N1, the own-dice case and the Area 10 confirmations,
with D1 and F1 over budget (friction) and F2 failed. This pass fixed four bugs from its list (Reckless
left on, stale rider buttons, the stale Cast Spell drawer, the Undo card) and the one console warning
that was ours (Rage's `getEffect` deprecation), and made Enter in Lay on Hands' points box use it. F2's
"healing never applied" is this world's dnd5e setting, not code (notes below; P-3-k). Synced
`pentaryn-combat` 0.2.4 and reloaded the GM tab. **Retesters: reload player tabs** (pentaryn-combat
changed; the new `enterUses` setting is registered at load). `game.modules` lists 0.2.3 until a world
relaunch; nothing in module.json besides the version changed, so no relaunch was needed. Tests:
`node foundry/module/pentaryn-combat/test/run.mjs` 320 pass (fixtures 370–377 new),
`make foundry-combat-check` and `make foundry-adjustments-check` pass (84 rows, 2 new).

### U-3-16 (bug fix) — Reckless Attack's effect goes at the start of the Barbarian's next turn

- **What / why:** retest D1 and bug 3. The Reckless effect from the Special-bar toggle was still on
  the Barbarian at its next turn start ("0 Rounds"). Nothing removed it: core does not delete expired
  effects, and the turn-start sweep only knew Dodge and our `until` effects. PHB 2024: Advantage
  "until the start of your next turn". The active GM's turn-start sweep now removes every Reckless
  effect on the actor (ours, or the stock one applied from the sheet, matched by name), under
  `recklessToggle`. Dodge / Dash / Disengage stay under `specialActions`, so either setting can be off
  alone (before, `specialActions` off stopped the whole sweep).
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`expiringAt` takes `reckless` per
  effect and the `{specialActions, reckless}` settings), `turnflow.mjs` (`sweep`), `test/run.mjs`
  (fixtures 370–373), `README.md` (`recklessToggle` row), `context/foundry/melee.md` (known limits).
- **Revert:** give `expiringAt` back its two-argument body (dodging at turnStart, or `until ===
  event`); in `sweep` restore `if (!actor?.effects || !setting("specialActions")) return;` and the
  three-field map; delete fixtures 370–373; revert the doc lines. `make foundry-combat-sync`, reload.
- **Retest:** ZZ Barbarian 5 in combat with a goblin: turn on Reckless Attack (Special bar). It stays
  through the goblin's turn; at the Barbarian's next turn start the Reckless effect is gone from the
  portrait and the actor's effects, and the toggle reads Off.
- **Verified here (GM tab, scene-less scratch combat, deleted):** Reckless on (flagged) during the
  Barbarian's turn, still on during the goblin's, 0 Reckless effects at the Barbarian's round-2 start.

### U-3-17 (bug fix) — A rider button leaves the card when the turn moves on

- **What / why:** bug 2 (E1): a "Frenzy 2d6" button stayed on the Barbarian's attack cards through
  later turns. A card shows its button only while its turn key is the current one, but it was
  re-rendered only when that actor's turn flag changed, so it kept the old button until the actor
  acted again. A combat turn change, and a deleted combat, now re-render every card on the client that
  still shows a rider button or an Undo. Clicking an old button was already refused ("That attack was
  on an earlier turn"). Bug 2's "Pole Strike stays" was a HUD button, and the report gives no case of
  it staying on a later turn; not changed.
- **Files:** `foundry/module/pentaryn-combat/riders.mjs` (`rerenderShowing`, two hooks in
  `installRiders`), `README.md` (`riderOffers` row).
- **Revert:** delete `rerenderShowing` and the `combatTurnChange` / `deleteCombat` lines in
  `installRiders`. Sync, reload.
- **Retest:** ZZ Rogue 5 (Ask mode) hits with Advantage: "+ Sneak Attack 3d6" on the card. End the
  turn without using it: the button leaves that card at once. Same for the Barbarian's Frenzy.
- **Verified here:** scratch combat, Rogue attack with Advantage in Ask mode: the card had the button;
  after `nextTurn` it had none.

### U-3-18 — Auto Sneak Attack's Undo marks its damage card

- **What / why:** bug 6 (B4; P-10-e asked for it). After Undo the card still read "1d8 + 3 + 3d6 = 22".
  Undo now writes `flags.pentaryn-combat.undone` on the damage card (its author or the GM can), and
  the note re-renders struck through with what the card deals without the rider: "~~+ Sneak Attack
  3d6~~ undone: 3d6 rolled 12, so this card deals 11". On a crit it names the doubled dice. The card
  is not re-rolled and the tray's number is not changed: the GM applies the smaller total (the rest of
  P-10-e stays open).
- **Files:** `foundry/module/pentaryn-combat/combat-core.mjs` (`riderRolled`), `riders.mjs`
  (`renderAutoNote`: undone branch and the flag write in the Undo handler), `lang/en.json`
  (`Rider.UndoneCard`, `Rider.UndoneCardPlain`, `Rider.Undone` text), `styles/combat.css`
  (`.pentaryn-combat-undone`), `test/run.mjs` (fixtures 374–377), `README.md` (`riderOffers` row,
  Data written row), `context/foundry/melee.md`.
- **Revert:** delete the `undone` branch in `renderAutoNote` and the `message.setFlag(MOD, "undone",
  …)` block in its click handler; delete `riderRolled`, its fixtures, the two lang keys and the CSS
  block; set `Rider.Undone` back to "{name} is available again this turn."; revert the doc rows.
  Sync, reload.
- **Retest (B4):** Rogue on Auto, a hit: the damage card shows "+ Sneak Attack 3d6 · Undo". Click
  Undo: the note turns grey, struck through, and names the rider's roll and the card's total without
  it. The next eligible swing auto-applies again.
- **Verified here:** scratch combat on the GM tab, Rogue on Auto, Rapier with Advantage: card
  `1d8 + 3 + 3d6` = 23 (3d6 = 12), a real click on Undo: flag `undone: ["sneak-attack"]`, turn riders
  `{}`, note "+ Sneak Attack 3d6 undone: 3d6 rolled 12, so this card deals 11".

### U-3-19 (bug fix) — Last turn's open drawer does not come back at the next turn

- **What / why:** bug 4 (F1): the Paladin's next turn started with the Bonus-bar Cast Spell drawer open,
  over the Action bar's Cast Spell. Argon saves each drawer's open state per actor (`_hudState`) and
  reopens it on every render; U-10-1 places a reopened drawer on the next frame, but on a whole-HUD
  render at a turn start the button was not laid out yet, so the drawer stayed at Argon's far left. Now
  (1) a turn boundary collapses the drawers on the HUD of the creature whose turn ended or began and
  sets their saved state to closed (spell-level folds are kept), and (2) a reopened drawer is placed
  once its button is on the page (up to ~10 frames). Under `drawerNearButton`.
- **Files:** `foundry/module/pentaryn-combat/turnflow.mjs` (`closeDrawersOf`, its call in the
  `combatTurnChange` hook, `placeWhenLaidOut` used by the render hook and `placeOpenDrawers`),
  `README.md` (`drawerNearButton` row); `foundry/adjustments.yml` (new row
  `combat-argon-drawer-turn-close`; delete it on revert).
- **Revert:** delete `closeDrawersOf` and its call; replace both `placeWhenLaidOut(…)` calls with
  `requestAnimationFrame(() => { try { placeDrawer(b, p); } catch {} })` (the button/panel names of
  each site) and delete `placeWhenLaidOut`. Revert the README row, delete the registry row. Sync,
  reload.
- **Retest (F1):** ZZ Paladin 5: open the Bonus-bar Cast Spell drawer, cast Divine Smite (or close
  nothing), end the turn. At the Paladin's next turn no drawer is open. Open the Bonus Cast Spell
  drawer again: it sits above its own button.
- **Verified here:** in the scratch combat, the Barbarian's Argon state `{"spell-1": {visible: true,
  subPanels: [true]}}` read `visible: false` (folds kept) right after its turn ended. The on-screen
  part needs the player tab (the GM tab is hidden and shows no HUD).

### U-3-20 — Enter in a usage window's number box uses the ability

- **What / why:** F2 and the P-3-h correction: Enter in Lay on Hands' points box only committed the
  number (dnd5e's Use Ability is `type="button"` and the window re-renders on every change), so
  P-3-h's "Enter submits in one" was wrong. Now Enter in a number or text box of a usage window commits
  the number, waits for the re-render (or 400 ms) and presses Use Ability. A select keeps Enter. New
  setting `enterUses` (default on).
- **Files:** `foundry/module/pentaryn-combat/turnflow.mjs` (`pressUse`, the keydown listener, header
  line), `settings.mjs` (`enterUses`), `lang/en.json` (`Setting.enterUses`), `README.md` (new row),
  `context/foundry/melee.md`; `foundry/adjustments.yml` (new row `combat-dnd5e-usage-enter-uses`;
  delete on revert); `module.json` 0.2.3 → 0.2.4.
- **Revert:** delete the "Enter in a usage window's box" block in `turnflow.mjs` and its header line,
  the `enterUses` default and its lang entry, the README row and the registry row. Sync, reload.
- **Retest (F2):** ZZ Paladin 5 targets the Fighter, Lay on Hands, Heal, type 10 in the points box and
  press Enter: the window closes and the Healing roll follows (no Use Ability click). Pool 25 → 15.
- **Verified here:** on the GM tab, `ActivityUsageDialog.create` for the Heal activity (window only,
  nothing used): typed 7, Enter → the window resolved used with `scaling: 6` (= 7 points); pool still 25.

### U-3-21 (console) — Rage's self-effect read through `getEffect()`

- **What / why:** the player-tab warning "Activity effects should now be accessed using the
  `getEffect()` method" right after Rage was ours: `applySelfEffect` read the profile's deprecated
  `effect` getter (dnd5e 6.0, removed in 6.2). It now awaits `getEffect()` (it may be async), falling
  back to `effect` only if `getEffect` is missing.
- **Files:** `foundry/module/pentaryn-combat/turnflow.mjs` (`applySelfEffect`), `README.md`
  (`selfEffects` row).
- **Revert:** `const effect = profiles[0]?.effect;`. Sync, reload.
- **Retest (D1):** Rage on the player tab with `console.warn` captured: no "getEffect" warning; the
  Rage effect applies by itself (6 changes) as before.
- **Verified here:** Rage's one profile resolves through `getEffect()` to "Rage" (6 changes) with no
  warning; nothing used.

### Bug and console notes that need no code

- **F2 healing "never applied" — this world's setting.** The world has dnd5e's *Allow Players to Apply
  Damage* (`dnd5e.allowPlayerDamageTray`) **off**, so a player's damage and healing cards have no apply
  tray; the GM applies both from the card (pentaryn-aoe's design: "nothing is applied until the GM
  presses Apply"). ZZ Tester owns ZZ Fighter 5, so with the setting on the player could apply the heal
  themselves. Joe's call: P-3-k.
- **Stale Cast Spell drawer "seen once"** is U-3-19; **Hew/Pole Strike pulse** and **E2 tooltip text**
  were not observed (hidden tab), nothing to change.
- **The Rage card still shows Apply after the auto-apply:** dnd5e's effect tray always lists the
  effect; pressing it again updates the same Rage effect (dnd5e finds the copy made from that source),
  no second Rage. Not changed.
- **D1 8 clicks vs 6:** Rage's usage confirm (2) and Reckless (1) are separate on purpose; P-3-g/P-3-h
  style one-button flows are Joe's call. **F1 8 clicks vs 5:** P-3-g stands.
- **Console:** "Cannot set properties of undefined (setting 'last')" came from the tester's own
  animated token update (U-3 notes). The "global Tour/Token namespaced" and
  `DatabaseUpdateOperation#teleport` warnings are core/tester evals. A GM-tab "renderChatMessage hook
  is deprecated" warning seen during this pass comes from Item Piles (`item-piles.js`), not ours.
- **Harness (hidden tab, Dice So Nice holding cards, the stuck d20):** P-3-i stands.

### Proposals (Area 3 re-run fixer pass) — for Joe to decide

- **P-3-k — Players apply their own healing (F2).** Options: (a) turn on dnd5e's *Allow Players to
  Apply Damage*: a player's damage and healing cards get dnd5e's tray, and a player can only apply to
  tokens they own (their own PC, a party member they co-own), so monsters stay GM-applied; native,
  no code. (b) Keep it off and auto-apply a heal activity's healing to a single target the healer's
  user owns (pentaryn-riders' Battle Medic already does this for its own flow). (a) is the
  prefer-native choice. P-3-h's other options (bind the HUD button to Heal, pre-fill the target's
  missing HP) remain open; with U-3-20 F2 is LoH, target, Heal, points + Enter, Healing roll.
- **P-3-l — Undo re-rolls or rewrites the card (rest of P-10-e).** U-3-18 names the smaller total;
  writing it into the card's roll would make the GM's tray apply it by itself, at the cost of editing
  a rolled message.

**State left by this pass:** no fixtures created or changed. Scene-less scratch combats "ZZ Scratch
U-3re" and "ZZ Scratch U-3re B4" and their 4 chat cards were deleted; the GM user's Sneak Attack mode
was set back to Ask; the Barbarian's injected Argon panel state was removed. No real PC or real scene
was touched. Drow Prison is active and paused, 0 combats, one GM client (reloaded on 0.2.4, in the
background). No player tab was opened. The tunnel and the updater were not touched, and the world
was not relaunched.

## Area 3 second re-run (U-3-16..21 retest) — fixer pass (2026-10-11)

The retest passed: B4 (Auto Sneak + a real Undo click, U-3-18), the Ask-mode Sneak button leaving the
card at the turn change (U-3-17), D1 (Reckless gone at the Barbarian's round-2 start, U-3-16; Frenzy
one-of-two; no `getEffect` warning after Rage, U-3-21), E2 Pole Strike gating, the U-3-19 drawer
(not reopened at the next turn, sits above its own button) and the Area 10 confirmations. F1 and F2
are friction only. No player-tab console errors; the page-load warnings are scene-packer's and core's.
**No code changed in this pass**, so nothing was synced and no tab needs a reload. `game.modules`
still lists pentaryn-combat 0.2.3 (the synced files are 0.2.4; only the version differs in
module.json, so no relaunch).

### Bug and console notes that need no code (or need Joe)

- **F2 healing not applied for a player** — unchanged: the world's *Allow Players to Apply Damage* is
  off. P-3-k is still Joe's call. U-3-20 works (one Enter in the points box uses the ability).
- **Channel Divinity right under Lay on Hands (mis-click)** — correct content, not a bug: the 2024
  Paladin's Channel Divinity has Divine Sense as its Bonus-action use, so dnd5e lists it with Lay on
  Hands, Divine Smite and Shield of Faith, and Argon stacks feature buttons two to a column. The
  mis-click was a coordinate click at the stack's midpoint (harness; P-3-i). Not changed: reordering
  Argon's buttons would be a patch on its layout for a tester-only issue.
- **F1 Divine Smite 8 clicks vs 5** — unchanged; P-3-g stands.
- **Harness (hidden tab swallows Enter, chat sidebar, `dsn-hide`, stale screenshots)** — P-3-i stands.

**State left by this pass:** one read-only eval on the GM tab (world state and ZZ Paladin 5's Bonus
features). Drow Prison active and paused, 0 combats, one GM client. No player tab opened, nothing
created, no real PC or scene touched; tunnel and updater untouched, world not relaunched.

## Area 2 A11 + Area 10 retest (U-10-10..12) — fixer pass (2026-10-11)

The retest passed: A11 (Stop after swing 1, then Fire Bolt; 6 clicks as U-2-10 / U-10-11 expect, no
stray window or empty usage card), the HUD following the first combatant at combat start with no
click (U-10-10), A5 (Shortsword twice + Nick Dagger, 4 clicks), A7 (Off-hand: Longsword after the
Attack action, Bonus pip spent, Action pip untouched) and the TWF clone's Nick then Off-hand offer
with the Dual Wielder tooltip (U-10-12). No product console errors on either tab; the player tab's
warnings were dnd5e's `checkBonus` and core's `renderChatMessage` deprecations, none from
pentaryn-combat. **No code changed in this pass**, so nothing was synced and no tab needs a reload.
`node test/run.mjs` still passes (320 fixtures).

### Bug and console notes that need no code

- **"No non-Light off-hand after Nick" in the task wording** — the wording was wrong, not the module.
  A Dual Wielder gets the second extra attack (2024 PHB feat), which is what U-10-12 ledgered and the
  tester saw. Without Dual Wielder nothing is offered after Nick: fixture 365 covers it, and the
  U-10-12 pass checked it live on a scratch actor. Every ZZ Fighter fixture has Dual Wielder, so a
  player-tab run without it needs a scratch build; not worth a fixture change.
- **"Stale" Argon weapon set ids on ZZ Fighter 5** — not stale. A read on the GM tab shows
  `BgfeV9aE1TiNOKEW` and `xa0PG0l1mKidmSWL` are the Fighter's own Shortsword and Dagger; set 1 held
  them because the U-10-12 retest steps say to set set 1 = Shortsword + Dagger for the A5 / Off-hand:
  Dagger case. The tester's re-point to Longsword + Shield matches the equipped gear now, which is the
  right resting state.
- **Not exercised:** the off-hand Longsword's damage (both A7 swings missed), A5's Stop-after-swing-2
  undo variant, the Nick button's return next turn, and the "Argon off" variant of U-10-10. They stay
  on the retest list.

**State left by this pass:** one read-only eval on the GM tab. World `pentaryn`, Drow Prison active
and paused, 0 combats, one active user (Gamemaster), pentaryn-combat 0.2.3 loaded. ZZ Fighter 5 is
Longsword + Shield + Chain Mail equipped, Argon set 1 = Longsword + Shield. No player tab opened,
nothing created, no real PC or scene touched; tunnel and updater untouched, world not relaunched.

### Retest verification (2026-10-11)

The retest of this pass was accepted with no product bugs and no product console errors, so **no
code changed** and no tab needs a reload. A GM-tab read showed world `pentaryn`, Drow Prison active
and paused, 0 combats, only Gamemaster active, pentaryn-combat 0.2.3, and the GM tab
`document.visibilityState = "hidden"`. An example.com tab is in front of it, so the "GM tab still
foreground" cleanup item is already resolved. `node test/run.mjs`: 320 fixtures pass. The Argon
set-1 "discrepancy" is the one explained above: the tester re-pointed set 1 to Longsword + Shield, and
the ids it replaced were the Fighter's own Shortsword and Dagger, not stale ones. Test gaps carried
forward: the non-Dual-Wielder off-hand after Nick in a player tab, the off-hand Longsword damage
roll, A5 Stop-after-swing-2, the Nick button returning next turn, and U-10-10 with Argon off.

### Follow-up cleanup (2026-10-11)

No code changed in this step. All ZZ fixtures were deleted (scene, folder, 9 actors, ZZ Tester user and journal, 23 chat messages). Caven, Marrith and Talo match `.state/core-rollback/rerun-followup-pcs-before.json` on HP, slots, Hit Dice, exhaustion, death saves, currency, ownership, effects, item quantity/equipped/attuned/uses, and pentaryn flags. Revert: none needed; retest: rebuild fixtures with the prompt-markers `character` helper per the plan section 2.
