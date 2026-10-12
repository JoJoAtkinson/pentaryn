# pentaryn-transform — changelog

**Read this when:** you need what changed in a version. How the module works now: [`README.md`](README.md).

## Unreleased

- **Starry Form's combat clock looks the form up once per druid per tick (perf-2, defect wave 2).**
  `onWorldTime` found the effect, then `tickStarry`, `maybeEnd` and `endStarry` each looked it up
  again. The tick now hands the one effect down: `tickStarry(actor, dt, effect)` and the new
  `endStarryEffect(actor, effect, opts)` (endStarry's body; a form gone while its ending was claimed
  falls back to a fresh lookup). No behaviour change; `starry.end` keeps its signature ([declared]).
- **A Long Rest taken while shifted is never lost (transform-core-async-3, defect wave 2).** The
  `dnd5e.longRest` listener always vetoed the rest and rested the druid only when `revert()` answered,
  so a rest that landed while a revert was already running, or on a form already deleted, vanished.
  `revert()` now keeps its in-flight promise (`revertInFlight(uuid)` in wildshape-adapter.mjs); the
  rest waits on it, then the druid rests. A revert that answers null rests the original as it stands
  (marked `pentarynTransformRestSync`, which the listener now passes). With no original at all it
  warns (`long rest: no original for <form>, resting the form`) and does not veto, so dnd5e rests the
  form ([declared]; golden/console-texts.json: one new row).
- **A failed form, constellation or Return click no longer leaves a stuck tooltip (R1 + M5, final
  review).** Argon's `itemButton.js` calls `_onLeftClick` without `await`, so a `shift()` or
  `assumeStarry()` that threw became an unhandled promise rejection and skipped `dropStaleTooltip()`.
  FormTile, ConstellationTile and ReturnButton now catch the failure and log it at warn (`form tile
  click failed`, `constellation tile click failed`, `return button click failed`); the stale tooltip
  is dropped in a `finally`. FormTile and ConstellationTile also call `collapseAllPanels?.()` the way
  ReturnButton already did ([declared]; golden/console-texts.json: three new rows).
- **A beast taken straight from the compendium gets a real token image (wildcard-art-compendium,
  defect wave 2).** A compendium Wolf with wildcard token art still gave the form the literal
  `wolf-*.webp` placeholder: core's `getTokenImages()` answers a compendium beast's wildcard path as
  it is, and the copy of the beast dnd5e was handed kept its original token. `formImage` now lists any
  wildcard path itself (a FilePicker browse with `{ wildcard: true }`), and the chosen image is put on
  the form through `dnd5e.transformActor` (`prototypeToken.texture.src`, `randomImg: false`) and on
  the token swap (`preUpdateToken`), so world and compendium beasts, linked and unlinked druids, get
  the first sorted file, else the portrait. A player who may not browse files still asks the GM; an
  owner without `FILES_BROWSE` now asks the GM too ([declared]; golden/describe.json: the
  `preUpdateToken` label).
- **`describe()` lists the hand-set item flags as reads (EXT-1, final review).** `flags.writes` no
  longer names `flags.pentaryn-transform.revert`, which the module never writes; `flags.reads` now
  names it and `flags.pentaryn-transform.keepInForm` ([declared]; golden/describe.json regenerated).
- **Dragging a token no longer schedules a sweep (perf-1, final review).** Every token update, even an
  x/y drag, scheduled a world-wide sweep of spent forms. Now only a token update that changes
  `actorId`, `actorLink`, `delta` or `flags.dnd5e` schedules it; a deleted token, a form losing
  `isPolymorphed` and the ready sweep schedule it as before ([declared]).
- **One tab writes each automatic ending (transform-core-async-2, final review).** With the MCP bridge
  tab and a GM browser tab open, both tabs are the runner user, so both reverted a form at 0 HP, on
  Incapacitated or at expiry, ended the druid's copy of a carried effect, ended Starry Form and swept
  spent forms. Each of these writes is now claimed per tab first with the kit's `claimDocument`
  (`flags.pentaryn-transform.claims.<key>`, added to the manifest's `flags.writes`): only the winning
  tab writes, about 750 ms after the trigger, and clears its claim afterwards; a loser stands down
  with a debug line. The Starry combat-time tick stays unclaimed ([declared]).
- **One Starry Form ending at a time (starry-double-end, final review).** An expiry landing together
  with an Incapacitated or a Long Rest could send two deletes for the same effect and log a failed
  ending. `endStarry` now holds an in-flight guard per druid, as revert does: the overlapping ending
  answers false, so the form is deleted once with one chat line ([declared]).
- **A failed Starry Form from the HUD refunds the Wild Shape use (R2-refund, final review).** The use
  was spent before the form's effect was written, and a failure there kept it spent. Now, as a failed
  shift does, the use comes back when the form did not go up; a form that is up (only its light
  failed) keeps the use. The error still surfaces as before ([declared]).
- **Uses spent in a form come back on revert when the uses max is a formula (EC-1, final review).**
  The revert's use sync read the item source's max as a number, so a formula max such as Wild
  Shape's `@scale.druid.wild-shape-uses` counted as no limit and the spent uses were dropped. A
  positive number or a non-empty formula now counts as a limit; an empty, null or zero max still
  does not ([declared]).
- **A hand-set token light survives a Wild Shape round trip (light-roundtrip, Joe's ruling; PT TF-2).**
  dnd5e rebuilt the druid's token from the prototype on revert, so a light set by hand on the token
  was lost and the prototype's came back. A shift now adds the token's own light to dnd5e's
  `flags.dnd5e.previousTokenData` in the same swap write, and every revert path puts it back. A light
  pentaryn-senses put there (torch, Starry Form, Light cantrip) is not the token's own: senses' prior
  is carried instead. One new `preUpdateToken` listener (hooks 39 → 40) ([declared]).
- **A Wild Shape form's token image is the same every time (wildcard-art, Joe's ruling; PT TF-1/TF-2/
  D7-1).** A beast with wildcard token art (the Monster Manual Wolf, Cat) gave a random file to a GM
  and, to a player who may not browse files, no image at all (the mystery-man token and "Invalid
  Asset"). Now the form gets the beast's concrete token image; for a wildcard, the first matching file
  in sorted order (a player asks the active GM through the new `formImage` relay row); if none
  resolves, the beast's portrait. dnd5e is handed a copy of the beast with that one image, so linked
  and unlinked druids alike get it ([declared]).
- **Starry Form counts combat time only (D8, Joe's ruling).** Out of combat there are no turns to
  track, so the form stays on and world time does not count; in combat it counts down by combat time
  to its 10 minutes, for a linked druid and an unlinked token druid alike. Before, Foundry's world
  clock (and the world-time fallback, world actors only) ended a linked druid out of combat but not an
  unlinked one. The effect has no duration value plus dnd5e's `isTemporary` flag; the time left is
  `flags.pentaryn-transform.starry.left`. A combat tick writes only that flag and does
  not rebuild the Bonus bar (an open Wild Shape or Starry picker stays open) ([declared]).
- **A form tile's tooltip and right-click on a compendium form** (the Monster Manual Wolf, Cat, Giant
  Badger) load the beast first: `fromUuidSync` gives only the pack's index entry, and the hover threw
  `src.items is not iterable`, so no CR/AC/speeds/attacks tooltip and no sheet (PT TF-1, [declared]).
- **`inspect(ref)` on a shifted linked druid** reads the form that is out (`shifted: true`, the time
  left), the same answer as inspecting the form; before, the druid's name answered `shifted: false`
  (PT TF-3, [declared]).

## 0.4.0 — 2026-10-12 (the blueprint migration, released by the Wave 7 restart batch)

Wave 7 batch: `module.json` 0.3.3 → 0.4.0 with `VERSION`, `flags.pentaryn` blueprint keys
(`flagScope` `transform` → `pentaryn-transform`, manifest-only), `minimum: "14"`,
`verified: "14.369"`. W4-T4: the kit's `lib/argon-tooltip.css` is listed in `styles` and the
`@import` in `styles/transform.css` is gone (the tooltip rules a transform tooltip gets are unchanged).

### The blueprint migration (wave 4)

Code moved into the blueprint layout (entries, wiring, features, adapters, UI, a pure core behind a
barrel, the vendored kit 1.0.2); every play-tested behaviour kept. Declared changes, each its own
commit and handed to the live test:

- **API (T-D1, W2-K1, -16):** built from a manifest and published through the kit's
  `publishNamespace` at ready: frozen, also `game.modules.get("pentaryn-transform").api`, with
  `describe()`, `settings()`, `trace()`, `uninstall()`; `pentaryn-transform.ready` and
  `pentaryn.ready` fire. `starry.*` is built in (no second ready hook). A frozen `game.pentaryn`
  now refuses the alias (the importer merges since items-journal-1).
- **`inspect(ref)` (T-D2, -17):** one read of a druid's shape state; `selftest()`.
- **Logging (T-D3, -15, -13 part 1):** the stripped-items line and swallowed failures log only
  with `CONFIG.debug["pentaryn-transform"]`; a failing read of pentaryn-combat's multiattack warns once.
- **Guarded hooks (T-D8):** a throwing listener logs `pentaryn-transform | <label>`.
- **CSS (T-D4):** own classes renamed `ptf-*`; the compact tooltip rules come from the kit's
  `lib/argon-tooltip.css` (D7), imported by `styles/transform.css`.
- **Combat coupling (-13):** the Multiattack button beside Full Attack is dropped on combat's own
  answer, `coversMultiattack(actor)`, instead of reading combat's settings.
- **Performance (T-D6, T-D7, -1, -10, -23, C59):** world-time fallbacks scan only where the runner
  can be; the pointermove check arms only for a stale tooltip; the runner test skips the owner
  scan with a GM connected; spent HUD buttons are pruned; forms resolve once; ended effects go in
  one batch. The Starry light flag is removed with `_del` on pentaryn-senses' scope (§5.8).
- The Argon helpers are the kit's `lib/argon-kit.mjs` (-12), shared with pentaryn-combat.
- `WILDSHAPE-DESIGN.md` moved to `context/plans/wildshape-hud-design.md` (history).

## 0.3.3 — play-test fixes (wave-1 play test PT3)

- **Return without a revert item (PT3-3).** A druid whose form carries no item flagged
  `revert` still gets "Return to {name}" (the druid's portrait, highlighted) on the Bonus bar of a
  Wild Shape form (not a Polymorph spell's form, which is not ended as a Bonus Action); it
  runs the same path as the item (`returnToNormal`: bonus pip, then `revert`). A form with the item
  shows only the item.
- **Starry Form never in a beast form (PT3-4).** Stripped by identity (identifier `starry-form`,
  else the name; reason `starry-form`) even when its Consume Wild Shape target is not this druid's
  Wild Shape id, and dropped from the Bonus bar of any form that still carries it.
- **Escape closes the Wild Shape / Starry Form picker (PT3-6)** when no target picker is up (same
  keybinding); with nothing open it still reaches core.
- **Every Wild Shape revert says so in chat (PT3-7).** A revert this module did not start (the
  sheet's Restore Transformation, the sidebar, a macro) posts the "returns to normal form" line via
  `dnd5e.revertOriginalForm`; the module's own revert posts its line once, as before.

## 0.3.2 — dnd5e 6 port

Requires dnd5e 6.0 (verified 6.0.6). What changed and what was checked to need no change:

- **Starry Form's Twinkling flight** is recognised from either key: `system.attributes.movement.fly`
  (the PHB item's stored effect; dnd5e redirects it on apply) or `system.attributes.movement.speeds.fly`
  (effects written under 6.0). Pure check: `grantsFly`.
- **Carried conditions** lose both origins before landing on the druid: core's `origin` string and
  dnd5e 6's structured `system.origin` (both point into the form actor the revert deletes).
  Pure: `withoutOrigin`.
- **Exhaustion** is unchanged in code: 6.0 derives the level from the `dnd5eexhaustion` effect's
  `system.level`, and writing `system.attributes.exhaustion` on revert still becomes that effect
  (`Actor5e#_onUpdateExhaustion`). Fixtures 69d/69e.
- **Form tooltips** read speeds from `movement.speeds` first (the flat keys are a dnd5e shim until 7.0).
- **"form" transform mode** (new in 6.0, effects on the actor instead of a new actor) is refused with
  a refund and a warning. 6.0.6's Wild Shape is still mode `cr`; this guard is defensive only.
- **No change:** the `dnd5e.transformActor` hook (6.0 fires `transformActorV2` alongside it, neither
  deprecated); `hud.mjs` (Argon's `isPolymorphed`, movement shim and `senses.ranges` reads hold).

Testing note: a Chrome tab that isn't visible runs no animation frames and drops synthetic clicks
until a screenshot renders it. Size animations and clicks "that did nothing" in such a tab are the
harness, not the module.

## 0.3.1 — play-test fixes

- **Argon's target picker** ("0/1 Targets") is cancelled when the HUD's token changes body (any
  shift or revert, including the GM's auto-revert), when a Wild Shape / Starry Form button or tile
  is clicked, and on **Escape** (a PRIORITY keybinding; before, Escape fell through to core and
  opened the game menu). Argon's picker instance is private to its bundle, so the module sends the
  right-button `mouseup` that is Argon's own cancel.
- **No duplicate panels in a form.** Argon's "Use Feature" (Multiattack) and "Use Item" (the beast's
  weapons, via `showWeaponsItems`) panels are dropped from the Action bar when everything they hold
  already has a front-row button (`coveredPanel`). Normal form is untouched.
- **No text-only Multiattack beside Full Attack (U-4-1).** When pentaryn-combat's Full Attack runs
  the form's parsed Multiattack (`fullAttack` + `multiattack` settings on), the Multiattack button is
  left off the front row; an unparsed Multiattack or either setting off keeps it.
- **Spellcasting** (the passive class feature, identifier `spellcasting`) is no longer carried into
  the form: "You can't cast spells" (`stripReason` → `no-spellcasting`).
- **Temp HP.** The Wild Shape temp HP stay after reverting — that is the 2024 rule (they last until
  spent or a Long Rest). The portrait of a Wild Shape druid or form shows them as `99+12 / 99 HP`
  (tooltip spells it out) instead of Argon's `111/99`. Temp HP don't stack, so a druid holding more
  than the grant keeps the higher number (dnd5e's preset always overwrote it with 12).
- **Concentration cards are not from shifting.** Traced live on both clients: a shift, a Change
  Form and a revert never call `challengeConcentration` (dnd5e's revert passes
  `concentrationCheck: false`; the shift creates a new actor rather than updating HP). Cards appear
  only when HP actually drops — real damage to the beast, or a GM setting temp HP 12 → 0, which
  dnd5e counts as 12 damage (the "DC 10" cards in the 2026-10-10 playtest came from its own setup
  evals; the "DC 30" from its 120-damage step).

## 0.3 — Starry Form

Circle of the Stars, PHB 2024. The Bonus bar's **Starry Form** button (Wild Shape uses badge, kept
in step with the Wild Shape button) opens three tiles — **Archer, Chalice, Dragon** — each with its
numbers in the tooltip (+11 to hit, 2d8 + 5 Radiant…). One click on a tile:

- spends the Wild Shape use through the feature's own "Consume Wild Shape" activity (no dialog, no
  card), refused when shifted, Incapacitated or out of uses;
- puts **one** effect on the druid, `Starry Form: Archer` (`_id pentarynStarry00`, 10 minutes from
  now, `flags.pentaryn-transform.starry.constellation`). The Dragon's carries the item's Dragon
  changes (roll floors; with Twinkling Constellations also Fly 20 and hover);
- lights the druid: the feature item gets `flags.pentaryn-senses.light` (Bright 10, Dim 10 more,
  starlight), which pentaryn-senses' carried-light path writes to every token of the druid and
  undoes when the flag goes (a hand-set light comes back);
- posts one chat line. The button becomes **Starry Form: Archer**; while the Archer or Chalice
  glimmers, its own button (Archer (Starry Form) / Chalice (Starry Form)) sits right beside it.

The button then offers the other constellations and **End**. With Twinkling Constellations a change
is free (the rule: at the start of your turn); without it, a new constellation is a new use. The
form ends by itself after 10 minutes of world time, when the druid is Incapacitated, at a Long Rest,
or when the druid Wild Shapes into a beast (it is taken "rather than shape-shifting"). However it
ends, the light goes. Starry Form is removed from the Special bar (Argon listed it there for the
Chalice/Dragon "special" activations). From the sheet, Starry Form → Consume Wild Shape → Use opens
a three-button constellation dialog instead of a card with effects to apply by hand; closing it
refunds the use. API: `game.pentaryn.transform.starry.{assume, end, active, constellation}`.

## 0.3 — HUD clean-up

- **Tooltips.** The Wild Shape tooltip is a short summary plus Uses, Duration, Recovery and Cost (the
  full feature text is a right-click away); it no longer scrolls or clips. Beast and constellation
  tooltips list one stat per row, wrapped, never overlapping. Our tooltips never catch the pointer.
- **No stale tooltips.** Argon anchors a tooltip to the hovered button; a shift or revert rebuilds
  the HUD without a pointerleave, so the tooltip stayed up. Any tooltip whose anchor left the DOM is
  dropped after each HUD render and on the next pointer move; clicking a picker button drops its own.
- **Pickers appear in place** (no 0.3 s slide-in), so a tile is clickable as soon as it is visible.
- **Portrait line:** `Wild Shape: Dire Wolf · 5 hours 59 minutes left` / `Starry Form: Archer · 9
  minutes left` instead of "Level 12 Druid (null)", updated as world time passes; the effect icon is
  larger with a gold ring.
- The Reaction bar's weapon slot in a beast form reads **Opportunity Attack** (0.3.1; it read "Bite (Opportunity Attack)", which looked like Bite listed twice).
- **Sweep timing.** One timer that token traffic can't keep pushing back, plus a quick sweep as soon
  as a player's revert clears the form's `isPolymorphed` flag (the Long-Rest orphan).
- **Core v14 shim.** A non-recursive token update (dnd5e's swap) turns root keys into
  `ForcedReplacement` operators that region identification can't read
  (`point.x.almostEqual is not a function`), so a form standing in a Region could not return.
  `TokenDocument._preUpdateOperation` is wrapped to unwrap scalar operators first.

## 0.2 — Wild Shape on the HUD

| State | Bonus bar | Action bar |
|---|---|---|
| Normal form | **Wild Shape** with a uses badge (greyed at 0) → a panel of the known forms; hover a tile for CR, AC, speeds, senses, attacks, traits; click shifts at once. No Return button. | unchanged |
| In a form | **Return to Talo** (his portrait, highlighted) and **Change Form** (same picker, one use) | every beast weapon and action monster feature (Bite, Claw, Multiattack) as front-row buttons; the weapon-set slot is hidden |

The portrait strip shows a **Wild Shape: Dire Wolf** effect; its tooltip has the time left, the end
conditions and the beast's passive traits. Each shift and revert posts one chat line instead of a
dnd5e card. The sheet still works: Wild Shape → Use opens dnd5e's form dialog, then shifts at once.

## 0.2 — what the module does (as built; the README's sections now say it)

- **Shift on use** (`dnd5e.postUseActivity`). A `transform` activity with the `wildshape` preset
  transforms its actor straight away into the chosen profile; the chat card (and its Transform
  button) is suppressed. If the shift fails — source actor gone, no permission, `transformInto`
  throws — the use is refunded. `shift(actor, profileId)` is the HUD's entry point; from a form it
  reverts first, then shifts (the 2024 "use Wild Shape again"), so there is never a nested
  "Talo (Dire Wolf) (Brown Bear)". Using Wild Shape from the druid's own sheet while a form is out
  (the player's character sheet is the druid) does the same: the form ends, then the form dialog.
- **Refuses a shift before any use is spent** (`dnd5e.preUseActivity`, and `shift()`) when: a shift
  for that druid is already running (a double-click would spend two uses); the user can't transform
  (needs `ACTOR_CREATE` and dnd5e's Allow Polymorphing); the druid is Incapacitated or at 0 HP (the
  form would be created already over, and conditions embedded at creation fire no hooks, so it
  would never end); the druid has **no token on the scene the user is viewing** (dnd5e swaps only
  those tokens — the form would be an orphan actor the sweep deletes, with the use gone); no uses.
- **Shapes the form** (`dnd5e.transformActor`, wildshape preset only). Strips from the form every
  feat of the druid that would spend Wild Shape uses or spell slots there — dnd5e's revert copies
  back only HP, temp HP and slots, so a use spent on the form's copy is lost — plus species traits
  with an activity (the 2024 rule retains creature type, not species traits). On Talo that is Wild
  Shape, Wild Companion, Starry Form, Wild Resurgence, Large Form and Stone's Endurance. Opt an item
  out with `flags["pentaryn-transform"].keepInForm = true`. Renames the form's revert item to
  "Return to {name}" with the druid's portrait, and adds the timed effect (`_id pentarynWildShp0`,
  duration from the activity — 6 h at druid 12). Records which of the druid's effects went into the
  form (`flags.pentaryn-transform.wildshape.carried`). Talo's own documents are never touched here.
- **Unlinked token druids** (an NPC druid): dnd5e transforms the token in place and fires no
  `transformActor`, so the same shaping is applied to the token's actor right after. That form
  keeps its own Wild Shape item — no world actor holds that token's uses — and `original(form)` is
  the form itself; uses spent there come back by id on revert.
- **Reverts on use** any item flagged `flags["pentaryn-transform"].revert = true`, on the clicking
  user's client (dnd5e's owner check applies). On every revert: item uses and class Hit Dice spent
  on the form are copied back by id; exhaustion level and Heroic Inspiration are copied back; and
  the druid's tokens on scenes other than the one being viewed are pointed back at the druid first
  (dnd5e moves only the viewed scene's tokens, then deletes the form). On a Wild Shape form also:
  conditions gained in the form (Unconscious, Stunned…) stay on the druid, and the druid's own
  effects that ended in the form are ended on the druid.
- **Concentration in beast form.** dnd5e copies the druid's effects into the form under the same
  ids and never back, and its dependents registry tracks the *druid's* copy. When a carried effect
  is deleted on the form (Concentration broken by damage to the beast), the druid's copy is ended
  at once on the runner client (below) — through `endConcentration` for Concentration — so the
  druid doesn't come back concentrating on a spell that already ended.
- **Ends the form without a click**, on one client (the active GM, else the first active owner):
  HP reaches 0; the form gains Incapacitated (or anything that implies it); the effect's time runs
  out (Foundry v14's effect registry marks it expired; a world-time check backs it up); the effect is
  deleted.
- **Rests.** Long Rest while shifted — on the form, or on the druid while a form is out (a party
  rest request lists the druid) — reverts first, then rests the druid, after the rest dialog
  (cancelling leaves the form alone). Short Rest on the form is allowed and also short-rests the
  druid quietly (no dialog, no HD, no chat), so the one Wild Shape use comes back. Short Rest on the
  druid while a form is out is redirected to the form, which is the body with the HP and Hit Dice
  (a rest on the druid would be overwritten at revert).
- **Blocks any other transform used while transformed** (Polymorph on a shifted druid) — it would
  nest a copy of the copy.
- **Sweeps spent forms.** A player can't delete the form actor dnd5e makes. The active GM deletes
  any transformed copy (`flags.dnd5e.originalActor`) with no token on any scene that is over 10 s
  old, 12 s after token activity settles and once at ready.

## 0.2 — HUD composition and setup facts (as built)

`hud.mjs` recomposes Argon's Bonus and Action panels in `renderActionPanelArgonComponent` (no
lib-wrapper). Argon's dnd5e button class is borrowed from the weapon-set slot's constructor. The
Wild Shape button's uses badge is ItemButton's `.quantity-1` markup — Argon's `has-count` class
with `data-item-count` paints no number. The
pure plan is `planBonusBar` / `frontRowItems` in `transform-core.mjs`. The bonus pip spent by a
shift or revert is re-applied after the HUD rebinds to the new actor (per token, per turn).
Actors without Wild Shape or a revert item are left exactly as Argon builds them.


- The revert item is optional (without it the HUD adds its own Return button). If used, it is an
  ordinary class feature with one bonus-action utility activity and no consumption. Keep it a `feat` so the Wild Shape preset (`keep: feats`) carries it onto the form.
- Players need `ACTOR_CREATE` (Trusted at this table) and `dnd5e.allowPolymorphing` to shift, and
  ownership of the form actors the profiles point at. Reverting needs only ownership.
- Transform updates tokens on the **viewed** scene only (dnd5e), so a shift needs the druid's token
  there (refused otherwise). Revert also fixes the tokens on other scenes.

## Play test 2026-10-10 (module 0.3.1)

Core flow passed with real clicks as Talo: pick a form, Change Form, Return to Talo, use count 3/3
down to 0 (Change Form greys out), Short Rest +1, Long Rest all (reverts first), auto-revert at 0 HP,
Incapacitated and after 6 hours, Starry Form spends a use. Open: Talo's Revivify is still a `damage`
activity (should be `heal`); Cosmic Omen has no HUD omen/Weal/Woe display; Argon's target picker shows
no cue until the mouse moves; the form panel opens at the far left; the rest chat line names the form
("Talo (Giant Bat) takes a short rest."). Build record: `context/plans/druid-wild-shape.md`.
