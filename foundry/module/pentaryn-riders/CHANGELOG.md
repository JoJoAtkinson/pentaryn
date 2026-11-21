# Changelog — pentaryn-riders

## Unreleased

- [declared] **Cosmic Omen: the die decides, and the UI says so** (d3rePk, triage E). With no omen stored for
  the day, dnd5e's "which activity?" dialog gets one line above its buttons, "Read the stars (1d6): the die
  decides. Even is Weal, odd is Woe.", and both omen buttons a "the die decides" badge (none disabled; the
  dialog stays). Argon's Cosmic Omen button gets the same badge (`omenButtonMark`'s new `unread` flag, badge
  `"die"`; the old marks are unchanged). The redirect keeps the rolled face: "You picked Woe (Odd), but the
  stars rolled 2: Weal (even)." (`rest.omen.redirect`); an omen already stored keeps the old wording under
  `rest.omen.redirectStored`. Three new lang keys (`redirectStored`, `decides`, `decidesLine`); golden
  `lang-keys.json`; fixture riders-core 9f. Adjustments row `dnd5e-riders-omen-die-decides`.
- [declared] **Empowered Spell: the card says what changed** (GDJJdi, triage F1). The empowered card's line
  ends with the total before and after: "Empowered Spell (1 SP): 1 → 4, 3 → 3, 1 → 1, 1 → 4 (77 → 83)"
  (new lang key `empower.noteTotal`). The flag `flags.pentaryn-riders.empowered` gains `oldTotal` beside
  `{ from, cost, changes }`, which are unchanged (pentaryn-aoe reads `from`; the README's "Flags other
  modules read" now says so). A card empowered before `oldTotal` keeps the old line. In dnd5e's dice tooltip
  the rerolled dice stand out: the old face fainter (`pr-emp-old`), the new one ringed in gold
  (`pr-emp-new`), matched by the pure `rerolledFaces` / `matchChips`. New pure exports `rollsTotal`,
  `rerolledFaces`, `matchChips` (core/empower.mjs, re-exported from riders-core; `rerolledRollData` and
  `waitingCardId` too, for F2 / F3). Goldens: `lang-keys.json`, `surface.json` (+5 `core.*`). Adjustments row
  `dnd5e-riders-empower-chips`.
- [declared] **Empowered Spell: Dice So Nice throws only the rerolled dice** (GDJJdi, triage F2). Every
  client's `diceSoNiceMessagePreProcess` sets `willTrigger3DRoll = false` for an empowered card (the plan
  named `diceSoNiceMessageProcessed`, but DSN 6.4.5 made that one observation-only and warns when it is
  mutated), and the clicking client throws a roll of the new faces alone (`rerolledRollData`) with
  `game.dice3d.showForRoll(roll, user, true, whisper, blind, messageId, speaker)`: synchronised, with the
  card's whisper list and blind flag. No Dice So Nice, nothing thrown. Hooks: 44 non-lifecycle
  registrations (+1, `diceSoNiceMessagePreProcess`). **`module.json` change: `relationships.recommends`
  gains `dice-so-nice` (with a reason; blueprint C09), so this release needs a Foundry restart.** Goldens:
  `hooks.json`. Adjustments row `dsn-riders-empower-new-dice`.
- [declared] **Empowered Spell from the sheet or the HUD can't waste a Sorcery Point** (GDJJdi, triage F3:
  two sheet uses, 2 SP gone, nothing rerolled). A `dnd5e.preUseActivity` veto on the feat's activity (label
  "Empowered Spell: only from a damage card"): the module's own spend (`usage.pentaryn.empower`) goes through;
  otherwise the use is stopped before dnd5e spends anything, and the caster's waiting card (their own spell
  damage card from the last 10 minutes that could show the button, this user able to edit it; pure
  `waitingCardId`) is empowered as one click would, or, with none, one notice: "Use the Empower button on
  your spell's damage card: no Sorcery Point was spent." (new key `empower.useCard`). It joins
  `selftest()`'s "usage vetoes run first" check (api.mjs `VETO_LABELS`). Hooks: 45 non-lifecycle
  registrations (+1 `dnd5e.preUseActivity`). Goldens: `hooks.json`, `lang-keys.json`. Adjustments row
  `dnd5e-riders-empower-sheet-use`.
- [declared] **Durations say "left"** (VDalcb, triage K). A wrap of dnd5e's `ActiveEffect5e#getDurationParts`
  (patches.mjs, patch 7, marker `_prDurationLeft`, at `ready`) words the last printed part of a timed,
  counting-down duration: "9 rounds left", "1 hr, 30 min left". Both the sheet's Effects tab and the effect
  tooltip print that method, so one wrap covers both; no token or Argon tooltip of the module's own exists.
  Left alone: start- / end-of-turn specials, an expiry dnd5e does not time, nothing left ("Now"), an expired
  effect (core's "… ago"). Pure `durationLeftParts` in table-core (under `rules`); new lang key
  `duration.left`; new test `test/duration-left.test.mjs`. Golden: `lang-keys.json`. Adjustments row
  `dnd5e-riders-duration-left`.

## 0.7.2 — 2026-11-07 (live playtest of 0.7.1: Caven's barrier at the round turnover, Talo's one greyed button)

Hooks: 43 non-lifecycle registrations, unchanged. Two new lang keys (`rest.omen.wealShort`, `rest.omen.woeShort`).
Two new pure exports (`sourceActorFor` in table-core, `omenButtonMark` in riders-core). No new setting, flag,
hook or API row.

- [fixed] **A `sourceStart` effect expired when the next round began, not on the caster's turn.** Caven,
  last in initiative, cast Shield on his own turn in round 2; the barrier vanished as round 3 began on
  Marrith's turn (hers only ever looked right because she is first). dnd5e's `isExpiryEvent` asks
  `getSourceActor()`, which reads `fromUuidSync(system.origin.actor ?? .item ?? .activity ?? origin)` — and
  on an effect dnd5e's own activity applied, `actor` is null and `item` is the spell's COMPENDIUM uuid
  (`Compendium.dnd-players-handbook.spells.Item.phbsplShield0000`): an index entry with no `.actor`, so the
  source is null, no combatant is found and the effect falls back to "past the creation round". The
  `preCreateActiveEffect` guard (the creating client, never GM-gated) now resolves the caster from
  `system.origin.activity`, then `.item`, then `origin` (an Actor, or a document with one; a compendium entry
  is skipped) and records it in `system.origin.actor`, which dnd5e reads first on every client. Only for a
  `sourceStart` / `sourceEnd` effect with no actor recorded; anything else is untouched. `selfEffectExpiry`
  reads that same live shape as self-cast now (any of activity, item or origin may name the actor; a recorded
  actor is the authority) — it used to take the compendium item first and match nothing.
- [fixed] **Talo's Cosmic Omen button was greyed with no badge, and unusable from the HUD.** The README
  claimed Argon shows one reaction button per activity; it does so only under its `explodeItemActivities`
  setting (weapons only by default), so a feat gets ONE `DND5eItemButton` for the whole item — and that
  button's `activity` getter answers the item's FIRST activity (Weal), which 0.7.0 read as "the other one"
  against a stored Woe and greyed. An item button (`isActivity` false, or `_item` the item) is never greyed
  and its badge names the omen ("Weal" / "Woe"); its click goes to dnd5e's "which activity?" dialog, marked
  as before. The per-activity badge / grey stays for a split item (`isActivity` true). Pure rule
  `omenButtonMark`.
- Goldens: `surface.json` (+`core.omenButtonMark`; table-core's `sourceActorFor` sits under `rules`, which the surface pins as one object), `lang-keys.json` (+2). Fixtures: table-core
  checks 57–60, riders-core 9e.
- Still outside this folder: the adjustments rows `dnd5e-riders-self-cast-expiry` (add the recorded source
  actor, `system.origin.actor`, and `sourceActorFor` to its `what` / `markers`) and `argon-riders-omen-badge`
  (one button per feat; `isActivity`, `explodeItemActivities`) in `foundry/adjustments.yml`.

## 0.7.1 — 2026-11-07 (review of 0.7.0: the omen read once a day, the applied mark by the feat alone)

Hooks: 43 non-lifecycle registrations (+1 rest: `updateItem`). Two new lang keys (`empower.createFailed`,
`empower.retireFailed`). No new setting, flag or API row; `readOmen` answers one more field.

- [fixed] **The stars are read once a day.** `readOmen` (the card's Read the stars, the G3 first-use
  fallback and the API row) answered a second read by rolling again and overwriting
  `flags.pentaryn-riders.omen`; the card redrew only on the clicking client, so a stale button on any other
  owner's card (the GM's log in particular: GM and player both own every PC) could flip the day's omen, and
  with it which Argon activity is badged and which the redirect runs. Now an omen already stored is
  answered as it is (`{ omen, face: null, rolled: false }`: no roll, no write, no roll message); the API
  row returns `rolled`. And the omen's flag write reaches every client as `updateItem`, where rest redraws
  the rest cards it has rendered for that actor (`ui.chat.updateMessage`: the log, its popout, the
  notifications), so the button goes everywhere once read and comes back everywhere when the next rest
  clears the flag.
- [fixed] **Applied means done, points or not.** The applied-card mark (`trayApplied`) depended on the
  card being able to show the button at apply time, so a card applied at 0 Sorcery Points was never marked
  and grew the Empower button once Font of Magic converted a slot. The mark now depends on the feat alone
  (a live spell damage card of a caster with Empowered Spell; `spellDamageCard`).
- [changed] **No button when every die is at or above its average.** A plain click used to open the
  picker in that case — a dialog on a one-click button. The button is not drawn at all (one click would have
  nothing to do; the rule's reroll of a die above average is a bet against the mean). Shift-click still
  picks when at least one die is below average.
- [changed] **A failure after the point is spent is said out loud.** `ChatMessage.create` failing after
  `activity.use` left the point gone, the old card live and nothing on screen. One warning now names the
  lost point (the old card stays live); an old card that fails to retire after the new one posted gets its
  own line (apply only the new one). Both console lines carry the card ids and the user.
- [changed] The G3 redirect re-calls the day's activity with the click's whole usage and dialog config
  (Argon's `legacy: false` and dnd5e's prepared `consume` / `create` included), not the event alone.
- Goldens: `hooks.json` (+`updateItem`), `describe.json` (`readOmen` returns and side effects; this
  regeneration also pinned 0.6.0's `updateActor` / `deleteToken` / `preCreateActiveEffect` and 0.7.0's rows,
  which the committed golden was missing), `lang-keys.json`.
- Still not here: the adjustments rows `dnd5e-riders-rest-card`, `argon-riders-omen-badge` and
  `dnd5e-riders-empowered-spell` (the batch file, §5.6), and `make foundry-module-index` for the Module APIs
  table; both are outside this module's folder.

## 0.7.0 — 2026-11-07 (player feedback pcuOX7, gWNXLN, WUiaAA: feedback triage 2026-11, clusters G1 + G3 and H1)

Hooks: 42 non-lifecycle registrations (+5 rest: `dnd5e.restCompleted`, `dnd5e.renderChatMessage`,
`dnd5e.preUseActivity`, `renderActivityChoiceDialog`, `renderItemButtonArgonComponent`; +2 empower:
`dnd5e.renderChatMessage`, `dnd5e.applyDamage`). Two new feature files, `rest.mjs` and `empower.mjs`, last
in `FEATURES`; one new pure file, `core/empower.mjs`. Settings are now thirteen: `restCard` and
`empoweredSpell` (world) before the client row. Two API rows: `restCard(ref)`, `readOmen(ref)`. Thirty new
lang keys (`settings.restCard.*`, `settings.empoweredSpell.*`, `rest.*`, `empower.*`). Five new flags
(`omen`, `rest`, `empowered`, `supersededBy`, `trayApplied`). Builds on 0.6.0 (C3, C4, E1): nothing there
is changed.

- [declared] **After a long rest, one card** (G1). `dnd5e.restCompleted` (long) on the owner's client
  whispers one card to the character's players and the rester, a row per `REST_RULES` match, drawn at
  render from the card's `rest` flag so it shows today's state and survives a reload. Rows shipped:
  **Cosmic Omen** (Talo): "Read the stars" rolls 1d6, posts the roll, stores
  `flags.pentaryn-riders.omen = "weal" | "woe"` (even / odd) on the feat; with an omen stored, Argon's two
  reaction buttons (one per activity) get a "today's omen" badge on the match and the other greyed, and
  dnd5e's "which activity?" dialog does the same with the other disabled; the next long rest clears the
  flag. **Prepared spells** (a caster whose spells prepare; the 2024 sorcerer too): "Review prepared
  spells" sets this user's Spells view for the character to All (through spell-view's new
  `ctx.exposed.setSpellView`) and opens the sheet on the Spells tab. No Portent row until a Diviner
  exists (review). Setting `restCard`.
- [declared] **Use it and the stars decide** (G3 as the fallback). A Cosmic Omen activity used with no
  omen stored (offline for the rest, the card closed) is stopped on `dnd5e.preUseActivity` (sync, a
  literal `false`, the owner's click), the omen is rolled and stored as the button would, and the day's
  activity is used in its place (`usage.pentaryn.omen` marks the re-call). The wrong activity with an
  omen stored is redirected the same way, with one notice; a match goes through untouched.
- [declared] **Empowered Spell in one click** (H1, one-click per the review). A `type: "damage"` card from
  a spell whose caster has Empowered Spell and a Sorcery Point left gets "Empower (1 SP)" for the owner
  who can edit the card (author or GM), drawn on `dnd5e.renderChatMessage` from the card's state. One
  click spends the point through the feat's activity (`use({}, { configure: false }, { create: false })`:
  no dialog, no card of its own), rerolls the dice below their average (lowest first, up to CHA mod,
  `core/empower.mjs`), posts a NEW damage card under the usage card (`system.origin`, the old card's
  targets, item, activity and riders flags copied; the old faces kept inactive and struck through) and
  marks the old card `supersededBy`: its `damage-application` tray is removed on render and one line says
  so. New rolls are kept even when lower. Shift-click (or a plain click with nothing below average) opens
  a picker listing each die with its face, the one-click choice pre-ticked. `dnd5e.applyDamage` on the
  applying client marks a button-carrying card `trayApplied` once, and the button goes. Only top-level
  dice added linearly are rerolled; a `min<n>` floor is re-applied. Setting `empoweredSpell`.
- API: `restCard(ref)` (the card without resting; clears the omen as a rest does), `readOmen(ref)` (roll
  and store today's omen). `describe().flags.writes` lists the five new flags.
- Not here: the adjustments rows `dnd5e-riders-rest-card`, `argon-riders-omen-badge` and
  `dnd5e-riders-empowered-spell` wait in the batch file, as §5.6 asks; the README lists them under
  Patches and adjustments.

## 0.6.0 — 2026-11-07 (player feedback HdWHWk, TwPCoB: feedback triage 2026-11, clusters C3, C4, E1)

Hooks: 35 non-lifecycle registrations (+2 concentration: `updateActor`, `deleteToken`; +1 expiry:
`preCreateActiveEffect`). A new feature file, `expiry.mjs`, last in `FEATURES`. One new lang key
(`concentration.summonFell`). `selftest()` gains "expired effects are deleted". No new setting.

- [declared] **Expired effects vanish** (C4; Joe 2026-11-07: "they're expired, no point keeping them").
  `init` sets `CONFIG.ActiveEffect.expiryAction = "delete"` (core default `"update"`, which marked an
  expired effect `expired` and left it grey on the sheet: the "Imperceptible Barrier did not reset"
  Marrith saw, and the stale one found on Caven on 10-10). World-wide, for every timed effect, by the
  active GM's client (core's registry acts on `activeGM.isSelf`); dnd5e already deleted expired effects
  out of combat and at combat end. A CONFIG value, not a setting. `uninstall()` restores the previous
  value; pentaryn-transform tolerates `delete` (its `wildshape.mjs`).
- [declared] **A self-cast reaction expires on its caster's turn** (C3, narrowed per the review). Core's
  plain `turnStart` keys on the combatant whose turn it was when the effect was created, so Shield,
  cast on the attacker's turn, expired at the attacker's next turn. On `preCreateActiveEffect` (the
  creating client, never GM-gated) an effect whose `duration.expiry` is `turnStart`, whose origin
  (dnd5e `system.origin.actor|item|activity`, else `origin`) is the actor it is created on or one of
  that actor's items / activities, while combat has started and it is not that actor's turn, becomes
  dnd5e's owner-aware `sourceStart`; `duration.value` goes null with it, as dnd5e's own `_preCreate`
  does for every pseudo-expiry (a finite seconds value would hold a Shield cast earlier in the round
  for one turn too long). Shield on the caster's own turn, a caster-turn effect on a foe, no combat,
  any other expiry: untouched. Pure rule `selfEffectExpiry` (table-core, fixtures 45–52). Belt and
  braces with pentaryn-importer's DDB correction (C2), which fixes the imported data itself.
- [declared] **A summon at 0 HP ends the concentration that keeps it** (E1, narrowed: HP → 0 only,
  never `deleteToken`, which portals and pins fire on scene moves). The 2024 summon spells say the
  spirit disappears when it drops to 0 HP or the spell ends; riders only did the other direction. On
  `updateActor` with `system.attributes.hp.value` at 0 or less (and the old value above 0 when dnd5e's
  `options.dnd5e.hp` carries it: a second hit at 0 is not a fall), the active GM (with no GM online,
  the user who made the change) resolves each stamped token's effect with `fromUuid`, claims the token
  (kit `claimDocument`, key `summonFell`: two tabs on that account end it once), calls
  `caster.endConcentration(effect)` and whispers one line to the caster's owners and the GMs:
  "<Caster>'s <Summon> fell; concentration on <Spell> ends." The existing cleanup (1b) then removes the
  token(s). A token already in flight is skipped; an effect that is gone ends nothing and posts nothing.
  dropbin's corpse is skipped for every dnd5e-summoned token on dropbin's side (`flags.dnd5e.summon`).
  Pure helpers `droppedToZero`, `concentrationSpellName`, `summonStampOf` (table-core, fixtures 53–56).
- Not here: the adjustments rows for the two new behaviours (`core-riders-expiry-delete`,
  `dnd5e-riders-self-cast-expiry`, `dnd5e-riders-summon-fell`) wait in the batch file, as §5.6 asks;
  the README lists them under Patches and adjustments.

## 0.5.2 — 2026-10-22 (player feedback 5wv0Iq, MMLx5X: Magic Missile from Marwen's wand)

Hooks: 32 non-lifecycle registrations (+1 `dnd5e.postUseActivity`, projectiles). Settings are now
eleven: `projectileChatTab` (client) last. Two new lang keys (its name and hint).

- [declared] No automatic first dart / ray roll. dnd5e rolls a Damage (Magic Missile) or Attack
  (Scorching Ray) activity by itself right after the cast (`_triggerSubsequentActions`). Each wand
  cast opened a Damage dialog, and Dart 1 then opened a second one: the "double prompts". It was not a
  double click. The second dialog came after the no-target toast, which only a dart click posts. For
  a PROJECTILES spell the riders now set the use's `subsequentActions` to false in
  `dnd5e.postUseActivity`, on the caster's client (an owner, world setting `projectiles`). Every dart
  and ray is one button click and one dialog. The only other step dnd5e skips with it is the
  `flags.dnd5e.consumed` stamp, which is for Hit Dice only.
- [declared] The cast opens the sidebar on Chat when the chat log is not on screen: the sidebar is
  collapsed or on another tab, and there is no chat popout. The card used to show only as a chat
  notification, which core dismisses 5 s after it appears once the pointer leaves it. Moving to the
  first dialog was enough, so the buttons "disappeared quickly or when anything was selected"; in
  the Chat tab they "worked great" (MMLx5X). The check does not ask `ChatLog#_shouldShowNotifications`,
  because its `false` also covers "pip" notifications and a narrow window, where the card shows
  nowhere. A new client setting, `projectileChatTab` (default on), turns it off per player.
- Live dart / ray buttons carry `data-action="prShot"`, so the feedback recorder logs their clicks
  (5wv0Iq's timeline had none). Their handler still stops propagation, so dnd5e's and ChatLog's
  `[data-action]` handlers never see the click.
- Not a code change: Magic Missile was missing from the Spells tab because the wand's cached spell
  copy was gone (lost in the 10-19 repoint). dnd5e re-created it on the first use. README Pitfalls
  now covers it.

## 0.5.1 — 2026-10-19 (code review of 0.5.0, low severity)

Hooks: 31 non-lifecycle registrations (+1 preUseActivity veto, −2 projectile chat hooks). One new
lang key (`usage.staleConcentration`); selftest gains "usage vetoes run first".

- [declared] A stale concentration replacement at the limit is refused, not retargeted. 0.5.0 ended
  the one effect held in place of the vanished one: a dialog opened naming Fly, Fly dropped, Hold
  Person was cast elsewhere, and Cast in the first dialog silently ended Hold Person. Now, at the
  limit, nothing is cast and a warning asks the player to reopen the dialog (which names what is held
  now). Below the limit the stale replacement is still dropped and the cast goes through.
  `core/usage.mjs staleConcentrationEnd` returns `false` for "refuse".
- [declared] A second Arcane Recovery use while that wizard's picker is open is vetoed in
  `dnd5e.preUseActivity`, before dnd5e spends a use (0.5.0 spent the use and only showed the notice).
- [declared] The Arcane Grimoire +1 counts only a held grimoire: equipped, attuned when it needs it,
  not inside a container. One in a backpack no longer raises the budget. A grimoire whose item type
  has no `system.equipped` field (loot) counts as held when it is not in a container (second review).
- Projectile buttons: the `createChatMessage` / `deleteChatMessage` listeners are gone. dnd5e 6.0.6
  re-renders the origin card itself on a roll's create and delete (`ChatMessage5e#refreshOrigin`),
  so each roll re-rendered the card twice. Uninstall now removes drawn ray / dart buttons from
  rendered cards.
- The preUseActivity vetoes only stop listeners after them. Checked: core loads module scripts in
  module-id order, so riders runs ahead of pentaryn-senses and pentaryn-transform (live order
  confirmed). `selftest()` now fails ("usage vetoes run first") if another package's listener ever
  gets ahead. No change in pentaryn-transform.

## 0.5.0 — 2026-10-19 (player feedback LdPm43, JbnAbX, ixcdvA, tNdOEx, tiDvFa, EBGqNA, DsekWh)

One release for four fixes built in parallel (they had each taken 0.3.1 or 0.4.0, never released).
Settings are now ten: `projectiles` ninth, `spellView` tenth. Hooks: 32 non-lifecycle registrations.

### Arcane Recovery prompts once (LdPm43)

- [declared] Arcane Recovery prompts once and restores once. A D&D Beyond import's Arcane Recovery
  is a single `ddbmacro` activity (`ddb.feat.arcaneRecovery`): ddb-importer opened its own picker
  as the use's subsequent action while the riders picker opened from `dnd5e.postUseActivity`, and
  each window restored slots (Marwen got two windows and both writes). The riders listener now sets
  the use's `subsequentActions` to false for that activity (dnd5e reads it right after the hook), so
  only the riders picker opens. The chat card's macro button still runs ddb's on a click; with the
  `arcaneRecovery` setting off, ddb's picker runs as imported. To see it: use Arcane Recovery on a
  D&D Beyond-imported wizard after a short rest; one window, one write, one chat line.
- [declared] The picker is the layout the player asked for: one row per slot level 1–5 the wizard
  has, "n of m left", a ticked locked box per slot still there and a box per spent slot to tick,
  opening with the highest spent slots that fit ticked. Budget +1 with an Arcane Grimoire (attuned
  when it needs attunement), as ddb-importer's picker had. The result shape and API are unchanged.
- A second use while the picker is open opens no second window (an info notice instead).

### One button per ray / dart (JbnAbX, ixcdvA)

- **[declared] One button per ray / dart** (new feature `projectiles.mjs`, setting `projectiles`,
  default on; row `dnd5e-riders-projectile-buttons`). Scorching Ray fired "one beam" and Magic
  Missile "one dart": dnd5e 6 and the PHB items give each spell one activity that rolls once, and
  Magic Missile's card Damage button re-uses the cast-time targets, so rays and darts could not be
  split. Their usage card now carries one button per ray / dart — 3, plus one per slot level above
  the spell's (a wand's extra charges count, via the card's `system.scaling`). Target one creature
  and click the next button: that ray's attack (Scorching Ray) or that dart's damage (Magic
  Missile) is rolled at it and threaded under the card, so Elemental Affinity's once-per-casting
  guard and pentaryn-aoe's damage on hit work per ray as before. dnd5e's automatic first roll and its
  own card button fill a slot too; a rolled slot names its target; more than one target refuses the
  click. To see it: cast Scorching Ray at 3rd level — four Ray buttons under the card, the first
  already named.
- Pure core: `PROJECTILES`, `projectileRule`, `castLevelOf`, `projectileCount`, `projectileSlots`
  (also on `game.pentaryn.riders.core`).
- Item data, not code: Marwen's Wand of Magic Missiles could not cast ("No uses on Magic Missile
  available to spend") because its Cast activity points at a DDB-imported spell whose own damage
  activity spends the spell's (nonexistent) uses with the slot off, which also makes dnd5e ignore the
  wand's charges. `scripts/foundry/fixes/2026-10-19-wand-cast-spell.mjs` (dry run by default)
  repoints such Cast activities at the PHB spell, as the DMG's own wand does.

### Transmuter's Stone pick-one effects; one usage dialog per activity (tNdOEx, tiDvFa)

- **Pick-one passive effects** (new feature `effect-choices.mjs`, pure `core/choices.mjs`): effects
  flagged `flags.pentaryn-riders.choice = { group, max }` are a set where turning one on turns the
  others of its group off (beyond `max`, a number or a roll-data formula). For the Wizard's
  Transmuter's Stone, whose Darkvision the DDB import had baked into Marwen's base senses with
  nothing to toggle. The item data is a fix script, `scripts/foundry/fixes/2026-10-19-transmuters-stone.js`
  (dry run by default). Hook `updateActiveEffect`; row `dnd5e-riders-effect-choices`. [declared]
- **One usage dialog per activity** (cast-flow part 7): a second Use while that activity's dialog is
  open is vetoed and brings the open one forward. A double click had opened two Enlarge/Reduce
  dialogs. [declared]
- **One activity choice per item** (cast-flow part 7, DsekWh): dnd5e opens a new "which activity?"
  dialog (ActivityChoiceDialog) on every Use click, so a double click on Produce Flame opened two
  and picking in both cast it twice. A `renderActivityChoiceDialog` listener closes a second choice
  dialog for an item whose choice dialog is already open (or still rendering) and brings the first
  to the front. Every item; a dialog that is closing after a pick does not count. Pure
  `core/usage.mjs` `firstChoiceDialogFor`; row `dnd5e-usage-dialog-single`. [declared]
- **Stale concentration replacement repaired** (cast-flow part 8, `dnd5e.preActivityConsumption`):
  a dialog that named a concentration which ended meanwhile no longer fails with "The effect that
  is concentrated on and to be replaced does not exist." Below the limit nothing is replaced; at
  the limit with one effect, that one is. Pure `core/usage.mjs`; row `dnd5e-usage-dialog-single`.
- `test/golden/hooks.json`: four registrations added (three in cast-flow's place, one at the end).

### Spells tab opens on prepared spells (EBGqNA)

- New feature `spell-view.mjs`: the character sheet's Spells tab opens on the spells the character
  can cast today (prepared, always prepared, cantrips, at-will, innate, pact, cast from an item),
  through dnd5e 6's `dnd5e.filterItem` hook (no wrap). A **Show: Prepared (n) · All spells (n)**
  switch sits above the spell search with "n unprepared hidden"; a click re-applies dnd5e's list
  filters in place. The choice is a user flag per character, `flags.pentaryn-riders.spellView.<actorId>`.
  No switch when nothing would be hidden. Setting `spellView` (world, on) turns it off.
- Pure `core/spell-view.mjs` (`SPELL_VIEWS`, `inPreparedView`, `spellViewCounts`, `spellViewOf`),
  re-exported by the riders-core barrel (so also on `api.core`); adapter `spellViewInfo` in `shapes.mjs`.
- dnd5e's own filter-menu "Prepared" was not enough: it keeps `canPrepare && prepared` only, which
  hides never-ticked cantrips, at-will / innate spells and spells cast from an item.

## 0.3.0 — 2026-10-12 (addon blueprint migration, wave 4; released by the Wave 7 restart batch)

- Wave 7 batch: `module.json` `flags.pentaryn` blueprint keys (`flagScope` `riders` →
  `pentaryn-riders`, metadata only), `recommends` enhancedcombathud and enhancedcombathud-dnd5e,
  `styles/riders.css` (moved), `verified: "14.369"`. D7: the kit's `lib/argon-tooltip.css` is
  vendored and listed in `styles` (inert for riders alone); the `#tooltip` click-through rule stays in
  `styles/riders.css` (W4-R9).

- Rebuilt to the addon blueprint: `riders.mjs` is wiring only; nine features (`rituals`,
  `concentration`, `argon-tidy`, `cast-flow`, `damage-riders`, `card-note`, `tray-preset`,
  `battle-medic`, `hd-sheet`) install in the old hook order; `settings.mjs`, `api-manifest.mjs`,
  `api.mjs`, the adapters `shapes.mjs` and `argon.mjs`, `patches.mjs`, and the vendored kit (`lib/`).
- The six hand patches go through the kit's `wrapMethod`, one marker each, listed by
  `describe().patches` and undone by `uninstall()`.
- API: built from the manifest and frozen; new `inspect(ref, { as })`, `selftest()`,
  `arcaneRecovery(ref)`, `describe()`, `settings()`, `trace()`, `uninstall()`, `version`,
  `contract`. The legacy members answer as before, and their actor argument now also takes a
  name, id, UUID or Token (a miss answers `null`).
- Published with the kit's `publishNamespace`, synchronously at `ready`; `module.api` is set and
  `pentaryn-riders.ready` fires. A frozen `game.pentaryn` now throws instead of being replaced.
- The Battle Medic relay goes through the kit's `guarded` (`sender: "any"`): a query reaching a
  non-GM client answers `NOT_GM: this client is not a GM`. It logs an audit line per success and a
  warn per refusal. The runner sends a request id and the GM tabs claim it first, so two GM tabs
  heal once, even when one tab's claim lands after the other recorded its result (combat-riders-41).
  Recording a result no longer prunes another patient request that is still being claimed
  (`794e1ed9`), so two Battle Medics on one patient at once also heal once each.
- Three silent catches now log at debug (`CONFIG.debug["pentaryn-riders"] = true`).
- The once-per-casting guard reads the usage card's own messages from dnd5e's message registry
  (`dnd5e.registry.messages`) instead of scanning the whole chat log on each attack damage roll;
  it scans the log as before when the registry is missing.
- Pure kernels for Hit Dice pools, the Battle Medic gate and the report row (`core/hit-dice.mjs`);
  one spell-slot builder (`slotsFrom`).

## 0.2.0

- dnd5e 6 build; the usability re-runs' Ritual Adept, Longer casts, concentration, cast-flow and
  Argon tidy-ups.

## 0.1.0

- dnd5e 5.3 build: Elemental Adept, Elemental Affinity, Potent Spellcasting, Healer, Battle Medic,
  the sheet's Hit Dice − / +.
