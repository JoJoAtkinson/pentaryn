---
title: "Wild Shape on the HUD — design for pentaryn-transform 0.2"
status: superseded — history only (built as module 0.2.0, reviewed 2026-10-09 §10). For use, read foundry/module/pentaryn-transform/README.md
created: 2026-10-09
subject: Talo (actor pfCQRWnqsQjkZQnB, user OiDkYUo0NsT5Mc5X), druid 12, Circle of the Stars
stack: Foundry v14.367 · dnd5e 5.3.3 · Argon enhancedcombathud 5.0.1 + enhancedcombathud-dnd5e 5.2.2 · lib-wrapper present (not needed)
---

# Wild Shape on the HUD

> **Superseded by the README for use; history only.** Moved out of the module folder on 2026-10-12
> (transform-creatures-19): it shipped to Data/ with the module. Its line references target dnd5e
> 5.3.3 and the pre-blueprint files (`transform.mjs`, `hud.mjs`, `starry.mjs`); the code now lives
> in the files `foundry/module/pentaryn-transform/README.md` § Files lists. Build record:
> [`druid-wild-shape.md`](druid-wild-shape.md).

**Read this when:** you want the reasoning behind the Wild Shape HUD design (rules basis, dnd5e and
Argon behaviour as of 0.2). Not for operating the module — that is its README.

**The complaint:** shifting takes five interactions across the HUD, a dialog and a chat card; the
use is spent before the player confirms; "Return to Normal Form" is always on screen; nothing shows
which form Talo is in, and the beast's attacks are three clicks deep. (Audit: the workflow's
read-only stage, 2026-10-09.)

**The promise:** everything lives on the Argon HUD. Two clicks to shift (Wild Shape → pick a form),
one click to return, one click to change form. The HUD shows the form, its attacks as front-row
buttons, the time left, and the uses left. Uses are spent only when the shift actually happens.

---

## 1. Rules basis (2024 PHB, owned compendium `dnd-players-handbook.classes`)

Quoted from the PHB item text (`phbdrdWildShape0`, `phbdrdStarryForm`, `phbdrdCosmicOmen`,
`phbdrdWildCompan`, `phbdrdWildResurg`, `phbdrdTwinklingC`, and Talo's Elemental Fury item):

| Rule | PHB text (abridged, wording kept) | What the build does with it |
|---|---|---|
| Activation | "As a Bonus Action, you shape-shift into a Beast form that you have learned" | Shift is a bonus action; the Bonus pip is consumed |
| Duration | "You stay in that form for a number of hours equal to half your Druid level [6 at 12] or until you use Wild Shape again, have the Incapacitated condition, or die. You can also leave the form early as a Bonus Action." | 6-hour timed effect on the form; auto-revert on Incapacitated; **using Wild Shape again while shifted is a legal form change for one use** |
| Uses | "You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest." Level 12: 3 uses (`@scale.druid.wild-shape-uses`) | Already correct on the item (`uses.max 3`, recovery `sr: 1`, `lr: all`). Not touched. |
| Known forms | 8 forms at level 8+, max CR 1, Fly Speed allowed from level 8 | The 8 profiles on the activity are the picker. Long-rest swaps stay a GM job. |
| Temp HP | "you gain a number of Temporary Hit Points equal to your Druid level" | dnd5e preset `tempFormula` already does it (12) |
| Game statistics | "you retain your creature type; Hit Points; Hit Point Dice; Intelligence, Wisdom, and Charisma scores; class features; languages; and feats" | dnd5e `wildshape` preset (`keep: bio, class, feats, hp, languages, mental, tempHP, type`). **Species traits are not in that list**, so Large Form and Stone's Endurance are stripped from the form. |
| No spellcasting | "You can't cast spells" | Preset already drops spells. The build also strips Wild Companion and Wild Resurgence from the form (they spend slots) |
| 0 HP | Not a separate pool in 2024: the Beast form uses Talo's own HP. At 0 HP you are Unconscious, which includes Incapacitated → the form ends. | Auto-revert when the form's HP reaches 0. Damage already landed on Talo's HP (`keep: hp` flows the value back). |
| Starry Form | "As a Bonus Action, you can expend a use of your Wild Shape feature to take on a starry form **rather than shape-shifting**… lasts for 10 minutes… ends early if you dismiss it (no action required), have the Incapacitated condition, or use this feature again… Bright Light 10 ft, Dim Light 10 ft more" | Mutually exclusive with Beast form, so hidden while shifted. Phase 2 gives it the same panel treatment. |
| Twinkling Constellations | "1d8 … becomes 2d8, and while the Dragon is active, you have a Fly Speed of 20 feet and can hover… at the start of each of your turns … you can change which constellation glimmers" | Phase 2 |
| Cosmic Omen | "Whenever you finish a Long Rest … roll a die … Weal (Even) … Woe (Odd) … uses equal to your Wisdom modifier" | Phase 2, small: roll at long rest, show only the rolled reaction |
| Elemental Fury: Potent Spellcasting | "Add your Wisdom modifier to the damage you deal with any Druid cantrip" | Data fix on the cantrips |

Incapacitated is implied by other conditions and dnd5e already models that: a live check of
`ActiveEffect.fromStatusEffect("unconscious").statuses` gives `["unconscious", "incapacitated"]`,
paralyzed likewise. So `actor.statuses.has("incapacitated")` is the one test the module needs.

---

## 2. The player's experience

Talo's player sees the Argon HUD bound to his token. Nothing below needs the sheet or the chat log.

### Normal form

Bonus bar, left to right: `[bonus weapon slot] [Cast Spell] [Use Power] [Wild Shape ③] [Starry Form ③]`.

- **Wild Shape** is a full-size button (not half of a split), showing the uses left as the usual
  Argon count badge. At 0 uses it is greyed; clicking it says "No Wild Shape uses left."
- Clicking it opens an Argon panel (same widget as Cast Spell) with **8 tiles**, one per known
  form, using the Monster Manual portrait art. Hovering a tile shows the standard Argon tooltip:
  name, "CR 1 Large Beast", AC, speeds, senses, each attack with to-hit and damage, and the passive
  traits (Pack Tactics, Spider Climb…).
- Clicking a tile **shifts immediately**: the use is spent, the token becomes the beast, the HUD
  rebinds to the form. One chat line: *"Talo shifts into a Dire Wolf — Wild Shape 2/3 left, 6 hours."*
  The Bonus pip is marked used in combat.
- **Return to Normal Form is not shown** while Talo is in his normal form.

### Beast form

Portrait: beast art, name "Talo (Dire Wolf)", AC 14, HP 99+12 (temp shown in blue by Argon).
An effect icon **"Wild Shape: Dire Wolf"** sits in the portrait's effect strip with the time left
in its tooltip and the beast's passive traits written out.

Action bar: `[Bite] [Claw] [Multiattack] … [Use Power] [Use Item]` — every weapon and every
action-activation monster feature of the beast is a **front-row button**. No weapon-set slot.

Bonus bar: `[Return to Talo] [Change Form ②]`.

- **Return to Talo** is full-size, carries Talo's portrait as its icon and a highlight border.
  One click reverts; the HUD rebinds to Talo. One chat line: *"Talo returns to normal form."*
- **Change Form** is the same picker with the uses left. Picking a tile reverts and shifts in one
  go, for one use and one bonus action, as the rule allows.
- Wild Shape, Starry Form, Wild Companion, Wild Resurgence, Large Form, Stone's Endurance and
  all spells are **absent** from the form: they are not on the form actor at all.
- Cosmic Omen (reaction) stays and works; its uses flow back to Talo on revert.

### Ending without a click

- Form HP reaches 0, or Talo gains Incapacitated (unconscious, paralyzed, stunned, petrified,
  sleeping): the GM client reverts him and posts *"Talo drops to 0 HP and returns to normal form"*
  / *"…is incapacitated and returns…"*. Talo's HP is whatever the form's HP was.
- The 6 hours pass on the world clock: same auto-revert (*"…Wild Shape ends"*).
- Long Rest from the HUD or sheet while shifted: revert first, then the rest runs on Talo.
- Short Rest while shifted: allowed; Talo regains his 1 Wild Shape use as the rule says.

---

## 3. Architecture

### 3.1 Principle: every resource lives on Talo, never on the form

dnd5e's `revertOriginalForm` (dnd5e.mjs ≈39123) copies back only HP, temp HP and spell-slot
values. **Item uses spent on the form actor are lost on revert.** Today Talo's form carries copies
of Wild Shape, Starry Form, Wild Companion, Wild Resurgence and Cosmic Omen (the `wildshape`
preset keeps every `feat`), so any of those used while shifted silently vanishes when he reverts.

Therefore:

1. The form actor never carries a feature that spends Wild Shape uses or spell slots (§3.3 strips them).
2. "Change Form" and every Wild Shape consumption go through **Talo's** Wild Shape activity, found
   via `game.actors.get(form.flags.dnd5e.originalActor)`.
3. Whatever use-bearing items *do* stay on the form (Cosmic Omen) have their `system.uses.spent`
   (and class `system.hd.spent`) copied back to the original on revert (§3.4). Item ids match:
   `transformInto` passes the item objects with their `_id`s and Foundry keeps embedded ids on create.

### 3.2 The shift pipeline

```
HUD tile click
  └─ game.pentaryn.transform.shift(actor, profileId)
       ├─ if actor.isPolymorphed:  original = await revert(actor)   (§3.4)   else original = actor
       ├─ activity = wildShapeActivity(original)        // the transform activity on the Wild Shape item
       ├─ await activity.use(
       │      { transform: { profile: profileId }, consume: { resources: true },
       │        pentaryn: { hud: true } },
       │      { configure: false },                      // no TransformUsageDialog
       │      { create: false })                         // no dnd5e card; we post our own line
       │    dnd5e: preUseActivity → consume (spends the use) → _finalizeUsage stores
       │           flags.dnd5e.transform.uuid on the message data → postUseActivity
       └─ Hooks dnd5e.postUseActivity (ours):
              source = await fromUuid(getProperty(results.message, "flags.dnd5e.transform.uuid"))
              await original.transformInto(source, activity.settings, { renderSheet: false })
              post chat line; DND5eItemButton.consumeActionEconomy(activity)
```

Why `postUseActivity` and not a custom transform call: it keeps dnd5e's consumption, scaling and
refund bookkeeping, and it means the **sheet** route works too — clicking Wild Shape on the sheet
still opens dnd5e's own select dialog, but after "Use Ability" the shift happens at once. The
chat-card "Transform" button is gone from both routes.

Hooks used (all verified in dnd5e.mjs 16822–16940 `ActivityMixin#use`):

| Hook | Our handler |
|---|---|
| `dnd5e.preUseActivity(activity, usageConfig, dialogConfig, messageConfig)` | For a `transform` activity with `settings.preset === "wildshape"`: set `messageConfig.create = false`. For any other transform preset while `actor.isPolymorphed`: keep today's block ("already transformed"). For the revert item: `messageConfig.create = false`. |
| `dnd5e.postUseActivity(activity, usageConfig, results)` | Wild Shape: do the transform (above). Revert item: `revert(actor)`. On a transform failure (`source` missing, `transformInto` throws or returns null): refund the use (`item.update({"system.uses.spent": spent - 1})`) and `ui.notifications.error`. |

Message data when `create:false`: `results.message` is the plain message-data object, and
`TransformActivity#_finalizeUsage` writes the uuid with `foundry.utils.setProperty` in that case
(dnd5e.mjs ≈35500), so `getProperty(results.message, "flags.dnd5e.transform.uuid")` is the
one read that covers both routes.

Permissions, verified live: `dnd5e.allowPolymorphing` on; `ACTOR_CREATE` = TRUSTED+; Talo's user is
TRUSTED; Talo's user is OWNER of all 8 form actors in `Talo — summons & forms`. The transform runs
on the clicking client, so the player's own permissions apply, exactly as today.

### 3.3 Shaping the form actor: `dnd5e.transformActor`

`Actor5e#transformInto` fires `dnd5e.transformActor(host, source, d, settings, options)` with `d`
**mutable**, right before `Actor.create(d)` and after dnd5e's own item/effect filtering
(dnd5e.mjs ≈39064). It fires for linked actors, which Talo is. Only act when
`settings.preset === "wildshape"`.

Mutations to `d`:

1. **Strip** from `d.items` every `feat` that satisfies any of:
   - owns the transform activity being used (Wild Shape itself);
   - any activity has a consumption target of type `spellSlots`, or `itemUses` whose `target` is
     the Wild Shape item id (Wild Companion, Starry Form, Wild Resurgence);
   - `system.type.value === "race"` and it has at least one activity (Large Form, Stone's
     Endurance — species traits are not retained by the 2024 text; passive traits with no
     activity are harmless and stay).
   Opt-out per item: `flags.pentaryn-transform.keepInForm = true` wins over the rules above.
2. **Rename and re-icon the revert item** (the one with `flags.pentaryn-transform.revert`):
   `name = "Return to {host.name}"`, `img = host.img`. Argon's label is `item.name` and its icon
   is `item.img`, so the HUD button reads "Return to Talo" with his portrait for free.
3. **Push the duration effect** into `d.effects`:
   ```js
   {
     _id: "pentarynWildShp0",                 // 16 chars, static, one per form
     name: `Wild Shape: ${source.name}`,
     img: source.img,
     origin: wildShapeItem.uuid,
     transfer: false,
     duration: { seconds: activitySeconds(activity), startTime: game.time.worldTime },  // 6 h = 21600
     description: "<p>Return to Talo is a Bonus Action. The form ends at 0 HP, when Incapacitated, or after 6 hours.</p>"
                + traitsHtml(source),         // passive monster features: name + description
     flags: { "pentaryn-transform": { wildshape: { original: host.id, source: source.uuid, profile } } }
   }
   ```
   Argon's portrait lists `actor.temporaryEffects` (effects with a duration), so this is the
   on-HUD "you are shifted, here is what you can do, here is how long" indicator. dnd5e computes
   `duration.remaining` against `game.time.worldTime`.
4. **Name**: leave dnd5e's `"Talo (Dire Wolf)"`; it is right.

Nothing is changed on Talo's own documents by this hook.

### 3.4 Revert pipeline and use-sync

`revert(actor)` (exists today) becomes:

```
if (!actor.isPolymorphed) notify + return null
snapshot = actor.items.filter(i => i.system.uses?.max || i.type === "class")
             .map(i => ({ _id: i.id, spent: i.system.uses?.spent, hd: i.system.hd?.spent }))
original = await actor.revertOriginalForm({ renderSheet: false })
if (!original) return null
updates = snapshot.filter(s => original.items.get(s._id) && value differs)
             .map(s => ({ _id: s._id, "system.uses.spent": s.spent, ...(class ? {"system.hd.spent": s.hd} : {}) }))
if (updates.length) await original.updateEmbeddedDocuments("Item", updates)
post chat line (unless options.quiet)
return original
```

`revertOriginalForm` for a linked actor updates the token to `original`'s actor id (Argon rebinds
through `updateToken`), then deletes the form actors if the user is GM or strips their flags if
not; the existing GM sweep (`sweepSpentForms`) deletes player-left forms 12 s later. Unchanged.

### 3.5 HUD composition (Argon)

Argon exposes no "add a button to this panel" API, but every component fires two hooks after it
renders (component.js `render()`): `render{ParentClassName}ArgonComponent` and
`render{ClassName}ArgonComponent`, each with `(component, element, actor)`. The dnd5e panel
classes are closure-private, but their parent is `ActionPanel`, so:

```js
Hooks.on("renderActionPanelArgonComponent", (panel, element, actor) => {
  if (panel.label === "DND5E.BonusAction") composeBonusBar(panel, actor);
  if (panel.label === "DND5E.Action")      composeActionBar(panel, actor);
});
```

Panel labels verified live: `["DND5E.Action","DND5E.BonusAction","DND5E.Reaction","DND5E.Special",…]`.
The hook runs after `ActionPanel._renderInner` has built `panel._buttons`, appended their elements
and rendered them; `CoreHud._renderInner` then runs `updateVisibility()` on every main panel. Our
hook appends or replaces elements in place, so no lib-wrapper patch is needed. Note `CoreHud`
calls `component._getButtons()` once *before* `render()` only to decide whether to attach the panel
at all; the Bonus and Action panels always contain the weapon-set slot button, so they attach.

Getting the dnd5e button class without the closure: the first button of the Action, Bonus and
Reaction panels is always a weapon-set `DND5eItemButton`, so
`const DND5eItemButton = panel._buttons.find(b => b instanceof CONFIG.ARGON.MAIN.BUTTONS.ItemButton).constructor`.
That gives `new DND5eItemButton({ item, inActionPanel: true })` (its `_onLeftClick` calls
`item.use` / `activity.use`, tooltip from `getTooltipDetails`) and the static
`DND5eItemButton.consumeActionEconomy(activity)`.

Base classes come from `CONFIG.ARGON` (a getter Argon defines at script load, usable from `init`):
`CONFIG.ARGON.MAIN.BUTTONS.{ButtonPanelButton, ItemButton, SplitButton}`,
`CONFIG.ARGON.MAIN.BUTTON_PANELS.ButtonPanel`, `CONFIG.ARGON.CORE.Tooltip` (= DND5eTooltip once
the dnd5e module has run `defineTooltip`).

**Templates.** `ArgonComponent.template` is `partials/{ParentClassName}.hbs`, so a direct subclass
of `ButtonPanelButton` renders `ButtonPanelButton.hbs` and a direct subclass of `ItemButton`
renders `ItemButton.hbs`. Do not subclass twice deep.

Components (new file `hud.mjs`):

| Class | Extends | Role |
|---|---|---|
| `WildShapeButton` | `ButtonPanelButton` | Main-bar button. `label` = "Wild Shape" / "Change Form" (shifted). `icon` = Wild Shape item img. `colorScheme` = 1 (bonus-action styling). Count badge: in `_renderInner`, after super, `element.classList.add("has-count"); element.dataset.itemCount = usesLeft` (the same two lines `ActionButton` uses); add `style.filter = "grayscale(1)"` at 0. `_onClick`: at 0 uses notify and return, else `this.panel.toggle()`. `_getPanel()` → `new ButtonPanel({ id: "pentaryn-wildshape", buttons: forms.map(f => new FormTile(f)) })`. Tooltip: feature description + uses, recovery, duration. |
| `FormTile` | `ItemButton` | One per `availableProfiles` entry. Constructed with a pseudo-item `{ id: profile._id, name, img: sourceActor.img }` so `ItemButton.visible/label/icon` work untouched. `hasTooltip` true; `getTooltipData()` → `{ title, subtitle: "CR 1 Large Beast", details: [AC, Speed, Senses, each attack "+5, 1d10+3 piercing"], properties: traits, description: "" }`, all from `fromUuidSync(profile.uuid)` (world actors; already loaded on every client). `_onLeftClick` → `shift(actor, profile._id)` then `ui.ARGON.collapseAllPanels()`. |
| `ReturnButton` | — (reuse) | Not a class. The existing `DND5eItemButton` Argon built for the renamed revert item, with `element.classList.add("pentaryn-return")` for the highlight. |

`composeBonusBar(panel, actor)`:

```
wsItem   = wild shape item on the actor (normal form) or on the original (shifted)
revert   = panel._buttons entries (incl. SplitButton halves) whose item has flags.pentaryn-transform.revert
wsHalf   = entries whose item is Wild Shape or Starry Form
normal form:
  remove revert from DOM and panel._buttons
  replace the SplitButton (or lone buttons) holding Wild Shape/Starry Form with
      [WildShapeButton, StarryFormButton (phase 2; until then leave Argon's Starry Form button)]
shifted (actor.flags.dnd5e.isPolymorphed):
  revert button: add class, move to the first slot after the weapon slot
  append WildShapeButton bound to the ORIGINAL's activity (label "Change Form")
render the new buttons (button._parent = panel; panel._buttons.push(button); await button.render())
panel.updateVisibility()
```

`composeActionBar(panel, actor)` when shifted:

```
hide the weapon-set slot button (element.style.display = "none")       // the beast's attacks replace it
for each item of the form with type weapon, or feat with system.type.value "monster", whose first
    activity activation is "action":
  append new DND5eItemButton({ item, inActionPanel: true })
```

Argon re-renders the whole HUD on `bind()` (token actorId change) so both bars are rebuilt on
every shift and revert; nothing needs incremental updates beyond what Argon already does
(`updateItem` rerenders the count badge when the Wild Shape item's uses change, because
`WildShapeButton.item` returns the Wild Shape item).

CSS (`styles/transform.css`): `.pentaryn-return { box-shadow: 0 0 0 2px var(--ech-bonusAction-base-background), 0 0 14px var(--ech-bonusAction-base-background); }`
and a darker title strip. Nothing else.

### 3.6 Auto-revert triggers

One function `maybeAutoRevert(actor, reason)` runs on **one** client: the active GM if there is
one (`game.users.activeGM?.isSelf`), else the first active owner (`actor.isOwner && game.user === game.users.filter(u => u.active && actor.testUserPermission(u, "OWNER"))[0]`).
The GM path is preferred because a GM revert deletes the form actor outright.

| Trigger | Hook | Test |
|---|---|---|
| 0 HP | `updateActor(actor, changes)` | `actor.isPolymorphed && "value" in (changes.system?.attributes?.hp ?? {}) && actor.system.attributes.hp.value <= 0` |
| Incapacitated | `createActiveEffect`, `updateActiveEffect` | `effect.parent instanceof Actor && effect.parent.isPolymorphed && effect.parent.statuses.has("incapacitated")` |
| Duration | `updateWorldTime` | for every actor with the `pentarynWildShp0` effect: `effect.duration.remaining <= 0` |
| Long rest | `dnd5e.preLongRest(actor, config)` | if `actor.isPolymorphed`: `revert(actor).then(o => o?.longRest(config)); return false;` |
| Short rest | `dnd5e.restCompleted(actor, result, config)` | if `config.type === "short" && actor.isPolymorphed`: `original.shortRest({ dialog: false, chat: false, autoHD: false })` so Talo's Wild Shape use recovers. Hit dice spent on the form come back through §3.4. |

Death is covered by 0 HP. Each trigger posts a one-line chat message naming the reason.
`revertOriginalForm` only writes `hp.value` back for `keep: hp`, so Talo is at 0 after a 0-HP
revert, with no condition applied; death saves proceed as the table normally runs them.

### 3.7 Changing form while shifted

The 2024 text ends the form when "you use Wild Shape again", for one use and one bonus action.
Nesting dnd5e transforms (form → form) works mechanically but names the actor
"Talo (Dire Wolf) (Brown Bear)", stacks `previousActorIds`, and leaves an intermediate actor the
GM sweep would delete out from under the chain. So `shift()` **reverts first, then transforms**
(§3.2). Cost to the player: the token flickers through Talo once; the HUD rebinds twice. The
existing "already transformed" block stays only for non-wildshape presets (Polymorph on a shifted
druid), with the message "Return to normal form first."

### 3.8 API (`game.pentaryn.transform`)

`shift(actor, profileId)`, `revert(actor, {quiet})`, `forms(actor)` → `[{ id, name, uuid, actor }]`,
`wildShapeActivity(actor)`, `original(actor)`, `isRevertItem(item)`, `sweepSpentForms()`.
Same namespace-rebuild pattern as today (game.pentaryn is frozen by pentaryn-importer).

---

## 4. Phase 2 — Starry Form, Cosmic Omen

> **Status 2026-10-10:** Starry Form shipped in 0.3 (`starry.mjs`; see README §Starry Form). Built as one
> module-owned effect (`pentarynStarry00`) rather than enabling the item's transfer effects, and the
> light goes through pentaryn-senses' carried-light flag. Cosmic Omen is still open.

Same patterns, smaller. Build after Wild Shape has had one real session.

**Starry Form.** `StarryFormButton` (ButtonPanelButton, count = Wild Shape uses) opens a 3-tile
panel: Archer, Chalice, Dragon. Click while not in starry form: use the "Consume Wild Shape"
activity (`57vhNDiHTUIkZ6Ij`, `configure:false`, `create:false`), then create the "Starry Form"
effect (`orMzu14BYojAQkUm`, 10 min) with `flags.pentaryn-transform.constellation = "archer"|…`
and, for Dragon, the "Dragon Form (Twinkling)" effect (`FjlMdXqnzWeB34Ls`, fly 20 + hover,
currently disabled by default). Click while in starry form: swap the constellation (no use spent;
Twinkling Constellations allows it each turn). The Archer tile, while active, rolls the Archer
attack activity (`p7kyVDBkGfvzMhBe`, bonus). Light: on effect create/delete the module sets the
actor's tokens to bright 10 / dim 10 and restores the previous light stored in the effect's flags
(no ATL module installed). Starry Form is hidden on the Bonus bar while in Beast form (it is
not on the form actor at all, §3.3) and its "Special" duplicate (the Chalice/Dragon `special`
activities) is removed from the Special bar by the same render hook. Expiry and Incapacitated
end it through the same `maybeAutoRevert` dispatcher (effect delete instead of revert).

**Cosmic Omen.** `dnd5e.restCompleted` long rest: roll `1d6`, store
`flags.pentaryn-transform.omen = "weal"|"woe"` on the Cosmic Omen item, chat line "Omen: Weal".
In the Reaction bar render hook, replace Argon's Cosmic Omen button with
`new DND5eItemButton({ item: <the matching activity>, inActionPanel: true })` so one click uses
the right activity (Argon's label becomes "Weal (Even) (Cosmic Omen)"). No data change.

---

## 5. Data fixes (sheet edits, no code)

| Item | Change | Why |
|---|---|---|
| Starry Wisp, Produce Flame, Thorn Whip | Add `+ @abilities.wis.mod` to the damage part (bonus field) | Elemental Fury: Potent Spellcasting (+5). Elementalism deals no damage; Shillelagh/Mending are not damage cantrips. |
| Revivify | Replace the `damage` activity with a `heal` activity, formula `1`, target one dead creature | Wrong activity type |
| Return to Normal Form | Nothing on Talo. The module renames/re-icons the **form's** copy only. | Keeps the item world-agnostic |
| Wild Shape | Nothing | Uses, recovery, duration, temp HP, 8 profiles all verified correct |
| Starry Form effects | Phase 2: leave `Dragon Form (Twinkling)` as is; the module enables it when Dragon is chosen | |

---

## 6. Audit gaps — disposition

| # | Audit gap | Fix | Where |
|---|---|---|---|
| 1 | 5-step shift across 3 surfaces | 2 clicks on the HUD; sheet route is dialog → done | module §3.2, §3.5 |
| 2 | Use spent before the shift | Shift runs in the same `use()` call; failure refunds | module §3.2 |
| 3 | Return button always visible | Hidden in normal form; "Return to Talo" + portrait in form | module §3.3, §3.5 |
| 4 | No form name / duration on HUD | Duration effect in the portrait strip; HUD title is the form's name | module §3.3 |
| 5 | Unusable features in form (Wild Companion, Wild Shape, Starry Form…) | Stripped from the form actor | module §3.3 |
| 6 | Form change blocked | Revert-then-shift from the same picker | module §3.7 |
| 7 | No duration / Incapacitated / 0 HP handling | Four auto-revert triggers + rest handling | module §3.6 |
| 8 | Beast attacks buried | Front-row Action-bar buttons; traits in the effect tooltip and tile tooltip | module §3.5 |
| 9 | Weapon sets empty in form | Moot: weapon slot hidden in form, attacks are direct buttons | module §3.5 |
| 10 | Spent forms rely on the GM sweep | Unchanged; GM-client auto-reverts delete directly | — |
| — | Starry Form shows twice, confusing chooser, no light, Dragon fly off | Phase 2 | module §4 |
| — | Cosmic Omen offers both Weal and Woe | Phase 2 | module §4 |
| — | Potent Spellcasting not applied | Data | §5 |
| — | Revivify is a damage activity | Data | §5 |
| — | Wild Companion familiar not dismissed on long rest | Leave: summons are dismissed by hand at this table | — |
| — | Staff of the Woodlands listed twice (Cast Spell + Use Item) | Leave: that is Argon's `showWeaponsItems` behaviour, harmless | — |
| — | Star Map / Awaken / Mending hidden (`hour`/`minute` activation) | Leave: rest-time actions, not HUD material | — |
| — | Wild Resurgence "no uses left" condition not enforced | Leave | — |

---

## 7. Decisions and rejected alternatives

- **Argon panel, not a dialog, for the picker.** A DialogV2 grid would be a third surface again.
  The Argon `ButtonPanel` is the same widget the player already uses for spells, so it needs no
  explanation. Dialog stays as the sheet fallback only because dnd5e provides it for free.
- **Render-hook composition, not lib-wrapper.** Argon fires `render…ArgonComponent` after every
  panel render and the panel's button list is a plain array; editing it there is the smallest
  patch and survives Argon updates better than wrapping `_getButtons` on a closure-private class.
- **Strip features from the form rather than hide them in the HUD.** Hiding would leave them
  usable from the sheet, where their uses would be lost on revert (§3.1). Stripping is also what
  the 2024 "Game Statistics" rule describes.
- **Revert-then-shift for form changes, not nested transforms.** See §3.7.
- **`message.create:false` plus our own one-line chat message.** dnd5e's transform card carries
  Transform / Consume / Refund buttons that are now wrong; a plain line is what the table needs.
- **No custom 0-HP conditions.** The module reverts and stops; applying Unconscious or starting
  death saves is the table's business, same as for every other PC.
- **Uses badge on a `ButtonPanelButton`.** Argon's `ButtonPanelButton` has no count; the two-line
  `has-count` recipe from `ActionButton._renderInner` is copied rather than subclassing `ActionButton`
  (whose click does not toggle a panel).
- **Not changed:** Argon world settings (`condenseClassActions`, `explodeItemActivities:
  only-weapons`, `showWeaponsItems`, `alwaysOn:false`, `openCombatStart:true`) — the design works
  with them as they are.

---

## 8. Build checklist

Work in `foundry/module/pentaryn-transform/`. Do not commit; sync with
`make foundry-transform-check` / `make foundry-transform-sync`; `module.json` changes (new
`styles`, new esmodule) need a Foundry server restart. Test as the GM on `localhost:30000` and as
Talo on `127.0.0.1:30000` (separate cookie jar; the 2026-10-07 recipe in `context/pentaryn.md`).

- [x] **Core (pure):** `transform-core.mjs` with `stripForForm(items, { wildShapeId })`,
      `formSummary(actorData)` (AC/speeds/senses/attacks/traits for tooltips and the effect
      description), `useSyncUpdates(formItems, originalItems)`. Node tests in `test/run.mjs`
      (fixtures: Talo's item list, the 8 form actors' `toObject()` trimmed).
- [x] **`transform.mjs`:** keep `revert`/`isRevertItem`/sweep; add `preUseActivity` message
      suppression and preset-aware block; `postUseActivity` auto-transform with refund-on-failure;
      `dnd5e.transformActor` mutations (strip, rename+icon, duration effect); use-sync in `revert`;
      `shift()` with revert-first; chat lines; `maybeAutoRevert` dispatcher and its five hooks;
      API rebuild.
- [x] **`hud.mjs`:** `renderActionPanelArgonComponent` handler; `WildShapeButton`, `FormTile`;
      `composeBonusBar`, `composeActionBar`; `DND5eItemButton` recovery from the weapon-slot
      instance; `consumeActionEconomy` call after a HUD shift.
- [x] **`styles/transform.css`**, **`lang/en.json`** (labels: Wild Shape, Change Form, Return to
      {name}, No uses left, the chat lines, the effect description), **`module.json`** 0.2.0 with
      `esmodules: [transform.mjs, hud.mjs]`, `styles`, `relationships.recommends` enhancedcombathud.
- [ ] **Data fixes** (§5) on Talo's actor via `eval-js`: three cantrip damage bonuses, Revivify heal
      activity. Verify `item.labels.damages` shows `+5` afterwards.
- [ ] **Docs:** README (what the module does now, the strip rules, the opt-out flag, the GM
      sweep), `context/pentaryn.md` §"Summons and forms" (player-facing: two clicks, Return to
      Talo, what ends it), `context/plans/` gets this file's link from `context/plans/README.md`.
- [ ] **Sync + restart**, enable nothing new (module already enabled), run the playtest (§9).
- [x] **Phase 2** Starry Form (0.3): `StarryFormButton` + light + constellation swap. [ ] Cosmic Omen roll
      at long rest + single-activity button.

Size estimate: core ≈150 lines, transform.mjs ≈250, hud.mjs ≈200, tests ≈120.

---

## 9. Playtest script

Preconditions: GM logged in on `localhost:30000`, Talo's player (or you, as Talo) on
`127.0.0.1:30000`; active scene Drow Prison, paused; Talo's token on the scene; Wild Shape 3/3,
HP 99/99, temp 0; no combat. **As of 2026-10-09 Talo's two tokens are on "Surface — Kharg's Adit",
not Drow Prison** — place one on Drow Prison for the test (delete it in cleanup); a shift with no
token on the viewed scene is now refused (§10). Talo is **concentrating on Summon Elemental**
(effect `tkRPGSbkEo2Ienig`, 1 h from worldTime 24): don't end concentration on a form during the
test unless you mean to end Talo's real one, and after step 22's 7-hour advance and the rewind,
check that effect's `duration.expired` is back to false. Argon opens on token select when `alwaysOn` is off and no combat —
for the test turn **Always On** on (Argon core settings) and turn it back off at the end.

| # | As | Do | Expect |
|---|---|---|---|
| 1 | Talo | Select the token; look at the Bonus bar | `Wild Shape` is a full-size button with badge **3**; `Starry Form` beside it; **no** Return button |
| 2 | Talo | Hover `Wild Shape` | Tooltip: feature text, "3 of 3 uses, 1 back on a Short Rest, all on a Long Rest, 6 hours" |
| 3 | Talo | Click `Wild Shape` | A panel opens with 8 portrait tiles: Giant Spider, Giant Bat, Giant Badger, Giant Octopus, Brown Bear, Dire Wolf, Spider, Ape |
| 4 | Talo | Hover `Dire Wolf` | Tooltip: "CR 1 Large Beast", AC 14, Speed walk 50, Darkvision 60, Bite +5 1d10+3 piercing, trait Pack Tactics |
| 5 | Talo | Click `Dire Wolf` | Token becomes the dire wolf named "Talo (Dire Wolf)"; HUD rebinds; portrait AC 14, HP 99 (+12 temp, blue); effect icon "Wild Shape: Dire Wolf" in the portrait strip; one chat line "Talo shifts into a Dire Wolf — Wild Shape 2/3 left, 6 hours"; **no** dnd5e card; sheet (if opened) shows Wild Shape 2/3 on Talo |
| 6 | Talo | Look at the Action bar | `Bite` is a front-row button; no empty weapon-set slot; `Use Power` holds nothing from Talo's class; **no** Cast Spell, Wild Companion, Starry Form, Large Form, Stone's Endurance anywhere |
| 7 | Talo | Look at the Bonus bar | `Return to Talo` (his portrait, highlighted) and `Change Form` with badge **2** |
| 8 | Talo | Hover the "Wild Shape: Dire Wolf" effect | Tooltip: time remaining ≈6 hours, the end conditions, Pack Tactics text |
| 9 | Talo | Click `Bite`, target a cell wall or the GM's test token | Attack roll card as normal |
| 10 | Talo | Click `Change Form` → `Brown Bear` | Token flickers through Talo, becomes "Talo (Brown Bear)"; badge now **1**; Action bar shows `Bite`, `Claw`, `Multiattack`; chat line "…shifts into a Brown Bear — Wild Shape 1/3 left" |
| 11 | GM | Sidebar → Actors | Exactly one form actor exists ("Talo (Brown Bear)"); "Talo (Dire Wolf)" is gone (GM revert deleted it, or the sweep did within ~12 s) |
| 12 | Talo | Click `Return to Talo` | Token is Talo again; HUD rebinds; Bonus bar back to step 1 layout with badge **1**; chat line "Talo returns to normal form"; HP 99, temp 12 carried (dnd5e `keep: tempHP`) |
| 13 | GM | Set Talo's temp HP to 0 (sheet) | Clean slate for the HP test |
| 14 | Talo | `Wild Shape` → `Giant Badger` | Badge **0** afterwards; `Wild Shape`/`Change Form` greyed |
| 15 | Talo | Click `Change Form` | Notification "No Wild Shape uses left"; panel does not open |
| 16 | GM | On the badger token apply 120 damage (dnd5e damage dialog or set HP 0) | Talo auto-reverts on the GM client; chat "Talo drops to 0 HP and returns to normal form"; Talo's HP is 0; form actor deleted |
| 17 | GM | Set Talo HP 99; set Wild Shape spent 0; Talo shifts again into `Ape` | Baseline for the condition test |
| 18 | GM | Toggle **Unconscious** on the ape token | Auto-revert; chat "…is incapacitated and returns to normal form"; Unconscious stays on Talo (toggle it off) |
| 19 | GM | Shift Talo into `Giant Bat` (from the GM client, select token, Bonus bar) | Works for the GM too; Fly 60 in the movement HUD |
| 20 | Talo | HUD rest buttons (no combat) → **Short Rest**, no hit dice | Still a bat; chat shows the rest; Talo's sheet (GM) shows Wild Shape regained 1 |
| 21 | Talo | **Long Rest** | Reverts first, then the rest runs on Talo; Wild Shape 3/3 |
| 22 | GM | Advance world time by 7 hours while Talo is shifted (`game.time.advance(7*3600)`) | Auto-revert; chat "…Wild Shape ends" |
| 23 | Talo | Open the sheet → Wild Shape → Use | dnd5e's select dialog appears; after **Use Ability** the shift happens at once; no card |
| 24 | Talo | Starry Form (phase 1 state) | Still Argon's native button; works as before; absent while shifted |
| 25 | Talo | Double-click a form tile | One shift, one use spent |
| 26 | GM | View another scene; as Talo (still on Drow Prison) shift, then have the GM set the form's HP to 0 from the Actors sidebar | Auto-revert on the GM client; Talo's token on Drow Prison is Talo again (not an orphan) |
| 27 | Talo | View a scene without Talo's token (or open Talo's sheet from the sidebar there) → Wild Shape | "Talo needs a token on the scene you are viewing"; no use spent |
| 28 | GM | On a form, add then delete a scratch Concentrating effect copied from Talo (or skip: covered by tests) | Talo's copy ends at once |
| 29 | GM | Request a Short Rest for the party while Talo is shifted; Talo accepts | The **form's** rest dialog opens (its HD); Talo's Wild Shape +1 afterwards |
| — | GM | **Cleanup** | Delete test chat cards; Talo HP 99/99, temp 0, Wild Shape spent 0, Cosmic Omen back to its pre-test spent value (1); no form actors in the sidebar; no effects left on Talo; Always On back off; Drow Prison active and paused; `game.time.worldTime` back to 30 (`game.time.advance(-n)`) |

Pass criteria: every "Expect" cell holds, and the GM's Actors sidebar is as it was.

---

## 10. Adversarial review (2026-10-09) — what changed from §3

Bugs found in the 0.2 build and fixed in code (tests: 105 pure-logic checks):

1. **Unlinked token druids.** dnd5e transforms a token in place and fires no `transformActor`, so
   `doShift` found no new world actor, refunded the use and reported failure although the token had
   shifted. Now: success is read from the token's actor; the shaping is applied to it afterwards;
   that form keeps its own Wild Shape item and `original(form)` is the form itself; the Short Rest
   sync skips it (it would short-rest itself in a loop).
2. **Cross-scene revert.** dnd5e's revert moves only the viewed scene's tokens and then (GM)
   deletes the form, so any GM auto-revert while the GM looks at another scene left Talo's token
   on a deleted actor. `revert()` now points the other scenes' tokens back first (keeping `level`).
3. **Shift with no token on the viewed scene** made an orphan form (dnd5e swaps only those tokens)
   that the GM sweep deleted ~12 s later, with the use spent. Refused before any use is spent.
4. **Shift while Incapacitated or at 0 HP** made a form that never ends: conditions embedded at
   actor creation fire no effect hooks, and no HP update follows. Refused.
5. **Double-click** on a tile ran two shifts and spent two uses (the panel hides by a 0.3 s
   transition, still under the cursor). `shift()` is single-flight per actor; `preUseActivity`
   refuses while a shift for that druid is in flight.
6. **Wild Shape from the druid's own sheet while shifted** (the player's character sheet is Talo,
   not the form) made a second form whose tokens dnd5e couldn't find. Now treated as "use Wild
   Shape again": the form ends, then the dialog.
7. **Concentration broken in beast form** left Talo concentrating after the revert (dnd5e copies
   his effects into the form under the same ids, never back). The form records which of Talo's
   effects it carried; deleting one on the form ends Talo's copy at once (runner client,
   `endConcentration` for concentration), and revert ends any that slipped through.
8. **Rests on the original while shifted** (a party rest request lists Talo, not the form) were
   undone at revert, which copies the form's HP and Hit Dice back. Long Rest on either now reverts
   then rests Talo; Short Rest on Talo is redirected to the form. Long Rest is hooked after the
   dialog (`dnd5e.longRest`), so cancelling no longer ends the form. The druid-side Short Rest
   passes the rest `request` through (worlds with Allow Rests off refused it) and a non-dotted
   loop-guard key (`initiateRest` runs config through `mergeObject`, which expands dotted keys).
9. **Uses badge invisible.** Argon paints counts only via ItemButton's `.quantity-1` markup; the
   `has-count` + `data-item-count` recipe draws nothing (checked against Argon's CSS and a live
   computed-style probe). The Wild Shape button now carries that markup.
10. **Exhaustion and Heroic Inspiration** changed in the form were lost on revert; copied back
    (dnd5e then syncs the exhaustion effect). Exhaustion is no longer carried as a raw effect.
11. **Polymorph forms** (not Wild Shape) no longer get the beast's own status effects carried onto
    the original — effect carry/end runs only for forms this module shaped.
12. Smaller: unlimited-use Wild Shape was treated as "no uses left"; the stripped items stayed in
    the form's sheet favorites; a stale (already deleted) form could be reverted twice when the
    effect expiry and the world-time check both fired; the tile tooltip listed Multiattack/Web as
    traits; `revert()` on a non-owned form now warns before touching any token.

Left as designed or for the table: front-row beast attacks don't mark the Action pip (Argon's own
weapon slot doesn't either — parity); a GM rest *request* answered while shifted may not record
Talo's result on the request card; tile to-hit/damage are the beast's own (dnd5e's `profDiff`
keeps them right for the form).

---

## Appendix — verified facts the design leans on

| Fact | Where verified |
|---|---|
| `ActivityMixin#use` order: `preUseActivity` → dialog (`dialogConfig.configure && _requiresConfigurationDialog`) → consume → message (`messageConfig.create`) → `_finalizeUsage` → `postUseActivity` | dnd5e.mjs 16822–16940 |
| `TransformActivity._requiresConfigurationDialog` is true when `availableProfiles.length > 1`; `_prepareUsageConfig` defaults `transform.profile` to the first profile | dnd5e.mjs ≈35455 |
| `_finalizeUsage` stores the source uuid at `flags.dnd5e.transform.uuid` (setFlag on a ChatMessage, setProperty on plain data) | dnd5e.mjs ≈35500 |
| `transformInto` fires `dnd5e.transformActor(host, source, d, settings, options)` with mutable `d`, after item/effect filtering, before `Actor.create` (linked actors only) | dnd5e.mjs ≈39064 |
| `wildshape` preset keeps `bio, class, feats, hp, languages, mental, tempHP, type`; temp formula `max(@classes.druid.levels, …)`; spells dropped | dnd5e.mjs ≈47048 |
| `revertOriginalForm` copies back only hp, tempHP and spell slot values; GM deletes form actors, players only strip flags | dnd5e.mjs 39123–39235 |
| Rest hooks: `dnd5e.pre{Short,Long}Rest(actor, config)` (return false cancels), `dnd5e.restCompleted(actor, result, config)` | dnd5e.mjs 38162–38317 |
| dnd5e does not delete expired effects on its own; `effect.duration.remaining` is available | grep: no expiry routine; 24933 |
| Unconscious/paralyzed effects carry `incapacitated` in `statuses` | live `fromStatusEffect` check |
| Argon: `ArgonComponent.render()` fires `render{Parent}ArgonComponent` and `render{Class}ArgonComponent` after `_renderInner` | enhancedcombathud/scripts/app/components/component.js |
| Argon: `ActionPanel._renderInner` sets `this._buttons`, appends and renders each; `updateVisibility` counts `button.visible` | …/main/actionPanel.js |
| Argon: template path is `partials/{ParentClassName}.hbs`; `ButtonPanelButton`, `ItemButton`, `ActionButton` partials exist | …/CoreHud.js, templates/partials |
| Argon dnd5e: class-type features go straight onto the bar and are paired into `SplitButton`s (`condenseItemButtons`); `explodeItemActivities` affects weapons only; `DND5eItemButton` accepts an activity in place of an item; `consumeActionEconomy` is static on it | scratchpad copy of `scripts/echDnd5e.js` (from the shipped source map), lines 255–300, 538–630, 808–880 |
| Argon dnd5e: weapon-set slot is the first button of the Action/Bonus/Reaction panels; transformed actors get default sets from their weapons | same, 538–700, 1235–1260 |
| Argon world settings: `alwaysOn false`, `openCombatStart true`, `condenseClassActions true`, `showClassActions true`, `explodeItemActivities only-weapons`, `showWeaponsItems true` | live |
| Talo: Wild Shape `CVPK5NrDGJ841krP` / activity `46YUClJmy4DjUyW7` (bonus, 6 h, itemUses self, 8 profiles, preset wildshape); Return to Normal Form `i9A691XB3y95S2ei`; Starry Form `fFTBAzOcc3Tlc8R1`; Cosmic Omen `DOmTMFZlYj1bHmow` (5 uses, spent 1); Wild Companion `i3wdl1E3SiV3puu1`; Wild Resurgence `9NrE6rJgoG7oGJhT`; Large Form `cw545YBUEAP7GY5c` (race) | live |
| Form actors: 8 world actors in `Talo — summons & forms`, Talo's user OWNER, MM portraits; attacks are `weapon` items with `natural` subtype and `attack/action` activities; Brown Bear and Ape have `Multiattack` (`feat`/`monster`, `utility/action`); passive traits are `feat`/`monster` with no activity | live |
