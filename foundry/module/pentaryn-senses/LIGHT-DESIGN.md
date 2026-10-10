# Light cantrip and lit items — design (plan C4)

**Read this when:** building or reviewing the Light feature in `pentaryn-senses`. Design only;
nothing here is built. The plan and Joe's calls are in
`context/plans/table-feedback-2026-10-08.md` § C4 (and A6 for the bug report).

Evidence below was read from dnd5e 5.3.3 (`dnd5e.mjs`, compiled), the PHB module's packs
(`dnd-players-handbook`, LevelDB copies), Foundry v14 client sources and the existing
`pentaryn-senses` code. Line numbers are into `Data/systems/dnd5e/dnd5e.mjs`.

---

## 1. What is wrong today (verified in the data)

**The cantrip.** The PHB *Light* spell (`phbsplLight00000`, identifier `light`) has one
activity: a **summon** (`EnaiVH67oUJzyHsF`) whose only profile is the actor
`Compendium.dnd-players-handbook.actors.Actor.phbsplLight00000`. That actor is an NPC named
"Light" with an empty 0.5×0.5 token (disposition −2, `empty.webp`) carrying a prototype light
of **bright 20 / dim 40**, colour `#ff810a`, flame animation. `summon.prompt` is `false`, so
`SummonActivity._prepareUsageConfig` (34290) sets `create.summons = false` and **nothing is
summoned on cast**; the floor token comes from the card's **Summon** button
(`_usageChatButtons`, 34317, `data-action="placeSummons"`), which players can press because
`canSummon` (34283) is `TOKEN_CREATE` + the `allowSummoning` setting. Result: a light that sits
where it was dropped and never follows anyone. Marrith pressed it four times.

**The items.** PHB `Torch` (`phbagTorch000000`, consumable, identifier `torch`) has only an
**attack** activity (1 fire, consumes 1 item use, duration 1 hour). `Lamp` (`phbagLamp0000000`,
equipment), `Lantern, Hooded` (`phbagLanternHood`, identifier `lantern-hooded`) and
`Lantern, Bullseye` (`phbagLanternBull`, `lantern-bullseye`) each have a **utility activity
named "Light"** that consumes the item's single use (`uses.max 1`, no recovery), duration 6
hours. `Candle` (`phbagCandle00000`) has a utility "Light" that burns its one use and
auto-destroys. None of them touches token light. The one working case is Caven's shard:
`flags.pentaryn-senses.light` on the item, applied by `syncLight()` in `senses.mjs`.

## 2. Decisions

| Question | Decision | Why |
|---|---|---|
| Intercept the summon activity or replace it? | **Intercept.** Leave the spell item as the PHB ships it; recognise it at use time. | Works for every caster now and in future (Marrith, Caven, an imported NPC, a scroll) with no per-actor data edit. Replacing means rewriting the spell on every actor and again after every import. |
| Where does the "where does the light go" choice live? | On the **caster's Light spell item**, as a flag the owner writes; the active GM reconciles. | The player already owns the item, so no query/reply plumbing; the GM's existing item-light path reacts to `updateItem`; survives GM absence and reconnects (the ready sweep applies whatever is pending). A `CONFIG.queries` relay (the `pentaryn-journal` pattern) was considered and rejected: the player needs nothing *back*, and a query is lost if the GM is not connected at that moment. |
| Light on a square | An **AmbientLight** document, not a token. | No actor, nothing in the combat tracker, nothing to click by accident, respects walls, invisible except as light. The GM creates it; players never need `TOKEN_CREATE`. |
| Light on a token | Write the token's `light` and remember what was there. | Follows the token for free, moves between scenes with `pentaryn-portals` (it copies `token.toObject()`, flags included, `portals.mjs:537`). |
| Torch state | `flags.pentaryn-senses.lit` on the item, toggled by its owner. | Same declarative shape as the shard; `carriedLight()` grows one rule and the rest of `syncLight()` is reused untouched. |
| Burn-down | **No.** Lit until doused (Joe's default). | Noted in § 9 how to add it later. |
| Visible controls | Cast prompt (dialog) + the same buttons on the spell card; a **flame button** on the inventory row and the item's own "Light" activity for torches; **End light** on the Token HUD. | Joe's rule: visible, clickable, nothing to be told. |

## 3. Data model

All flags are in scope `pentaryn-senses` (`SCOPE` in `senses.mjs`).

```
Item (Light spell)       flags.pentaryn-senses.lightCast
                           { scene: "<sceneId>", token: "<tokenId>" }      light rides a token
                         | { scene: "<sceneId>", x: <px>, y: <px> }         light sits on a square (grid centre)
                         | null / absent                                    no light
                         Written by the item's owner (player or GM). Desired state.

Token (lit by the spell) light                      = SPELL_LIGHT (below)
                         flags.pentaryn-senses.spellLight
                           { source: "<Light item uuid>", prior: <light object before, or null> }
                         Written by the GM only. Applied state.

AmbientLight (square)    config                     = SPELL_LIGHT
                         flags.pentaryn-senses.spellLight = { source: "<Light item uuid>" }
                         Written by the GM only.

Item (torch, lamp…)      flags.pentaryn-senses.lit      true | false        owner writes
                         flags.pentaryn-senses.hooded   true | false        owner writes (hooded lantern only)
                         flags.pentaryn-senses.lightItem  <profile>         optional override (a magic lantern)

Item (shard, unchanged)  flags.pentaryn-senses.light    <light object>      always on, as today

Token / prototype        flags.pentaryn-senses.itemLight  true | false      GM, as today
```

**Rules values** (2024 PHB; Foundry's `dim` is the outer radius, so dim = bright + extension):

| Profile key | bright | dim | notes |
|---|---|---|---|
| `SPELL_LIGHT` (cantrip) | 20 | 40 | colour `#ffe9b8`, alpha 0.35, no animation, `luminosity 0.5`: a steady magical light, not a flame |
| `torch` | 20 | 40 | `#ff9a3c`, alpha 0.4, `animation {type:"torch", speed:2, intensity:2}` |
| `candle` | 5 | 10 | `#ffb35c`, alpha 0.3, torch animation speed 3 intensity 3 |
| `lamp` | 15 | 45 | `#ffc266`, alpha 0.35, torch animation speed 1 intensity 1 |
| `lantern-hooded` | 30 | 60 | same as lamp; `hooded: { bright: 0, dim: 5 }` |
| `lantern-bullseye` | 60 | 120 | `angle: 60`. A light cone follows the **token's rotation**, which players never set. Ship it omnidirectional (`angle 360`) and note the cone as a later option; a 120 ft circle on a cave map is the lesser surprise. |

Profiles are keyed by `item.system.identifier` (every PHB item carries one; `ItemDescriptionTemplate`
has the field). `profileFor(item)` = `flags.pentaryn-senses.lightItem` override, else the table by
identifier, else the table by lower-cased name (`"lantern, hooded"` → `lantern-hooded`), else null.

## 4. Files

```
pentaryn-senses/
  senses.mjs        import "./light.mjs"; carriedLight() and lightUpdate() change (see § 7)
  light-core.mjs    NEW, pure: profiles, SPELL_LIGHT, profileFor, strongest, readSpellCast,
                    readSpellLight, lightFor(profile, {hooded}), isLightSpellData, spellCastTarget
  light.mjs         NEW: hooks, prompt, picker, card buttons, inventory button, HUD button,
                    GM reconcile + sweep, API
  lang/en.json      NEW: PENTARYN_SENSES.* strings (module.json gains "languages")
  styles/light.css  NEW: the lit flame colour on the inventory button, picker cursor class
  test/light.mjs    NEW: node fixtures for light-core; test/run.mjs imports it at the end so
                    `make foundry-senses-check` picks it up without a Makefile change
  README.md         new section "Light cantrip and lit items"; module.json → 0.3.0
```

`light.mjs` follows `chain.mjs`: every hook body wrapped (`warn(label, err)`), `install()`
idempotent with `globalThis.__pentarynLight`, API published on `game.pentaryn.senses.light`
at `ready` through the same non-extensible-namespace guard.

## 5. The cantrip, end to end

### 5.1 Recognising a Light cast

`isLightSpell(item)`: `item.type === "spell"` and (`system.identifier === "light"` or any
summon activity has a profile whose `uuid` ends with `.phbsplLight00000`). The identifier is the
primary key; the profile check catches a renamed copy.

### 5.2 Hooks on the casting client

1. `dnd5e.preUseActivity(activity, usageConfig)` (16867): if `isLightSpell(activity.item)`, set
   `usageConfig.create.summons = false`. Already false for the PHB spell (`prompt: false`); this
   guards against a copy with `prompt: true`. Never return `false`: the normal usage card
   (spell description, duration) must still post.
2. `dnd5e.postUseActivity(activity, usageConfig, results)` (16917): if Light, call
   `promptAndPlace(activity.item)` without awaiting (errors caught, logged). The GM casting for
   an NPC lands here too.
3. `dnd5e.renderChatMessage(message, html)` (69159; the hook `pentaryn-aoe` uses, `areas.mjs:253`):
   `message.flags.dnd5e.item.uuid` → item; if Light and `item.isOwner`, **remove**
   `.card-buttons button[data-action="placeSummons"]` and append three buttons:
   `[On me]` `[Pick a target]` `[End light]`. Non-owners get the Summon button removed and
   nothing added. The card is the lasting control: re-aim a mis-click, move the light, end it.

### 5.3 The prompt

`foundry.applications.api.DialogV2.wait({ window: { title: "Light" }, content: "<p>Where does
the light go?</p>", buttons: [ {action:"me", label:"On me", icon:"fa-solid fa-user", default:true},
{action:"pick", label:"Pick a target", icon:"fa-solid fa-crosshairs"},
{action:"cancel", label:"Not now"} ], rejectClose: false })`.

- **On me:** the caster's token on the viewed scene: `actor.isToken ? [actor.token] :
  canvas.scene.tokens.filter(t => t.actorId === actor.id)`; prefer one in
  `canvas.tokens.controlled`, else the first. None → `ui.notifications.warn("Your token isn't on
  this scene. Use Pick a target.")` and stop.
- **Pick a target:** `pickTarget()` (§ 5.4) → `{ token }` or `{ x, y }` or `null`.
- **Not now / closed:** nothing written. The spell was still cast (card posted); the player can
  use the card buttons later.

Then `castLight(item, target)`: `item.update({ "flags.pentaryn-senses.lightCast": { scene:
canvas.scene.id, token } | { scene, x, y } })`. If `!game.users.activeGM`, warn first:
"The GM isn't connected; the light will appear when they are." (The flag is still written.)
Feedback on success is the light itself appearing (≈250 ms, the GM debounce) plus
`ui.notifications.info("Light shines from <token name>" | "Light placed.")`.

### 5.4 The picker (`pickTarget()`)

Modelled on dnd5e's `TokenPlacement#requestPlacement` (33828–34080) but without a preview, and
listening on the DOM in the **capture phase** so the token layer never sees the click (a
`canvas.stage` listener, which TokenPlacement uses, would let the click also select/drag the token):

```
canvas.app.view.addEventListener("pointerdown", onDown, { capture: true });
window.addEventListener("keydown", onKey, { capture: true });            // Escape cancels
canvas.app.view.classList.add("ps-picking");                            // crosshair cursor (CSS)
const note = ui.notifications.info("Click a token or a square to light it. Right-click or Esc cancels.", { permanent: true });
```

- `onDown`: `ev.stopImmediatePropagation(); ev.preventDefault();` button 2 → cancel. Else
  `const p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY })`;
  token hit = the top-most of `canvas.tokens.placeables.filter(t => t.visible && t.bounds.contains(p.x, p.y))`
  (sort by `document.sort`, then elevation); hit → `{ token: hit.document.id }`; else
  `const c = canvas.grid.getCenterPoint(p)` → `{ x: c.x, y: c.y }` (gridless: `p` as is).
- Cleanup (both paths, in `finally`): remove both listeners, remove the class, `note.remove()`;
  also swallow the next `contextmenu` on the view after a right-click so the browser menu stays
  closed. Also cancel on `canvasTearDown` (scene changed mid-pick) and if the pick is still open
  after 60 s.
- Only one pick at a time: a second call cancels the first.

Hidden tokens are not `visible` to players, so a click on one lights the square under it. A pick
on a scene the player is only viewing (their token elsewhere) is fine: the target is absolute
(`scene` + id / coordinates).

### 5.5 The GM reconcile (`syncSpellLight(item)`)

Runs on the active GM only (`isWriter()`), coalesced like `schedule()` (250 ms per item uuid).
Triggered by: `updateItem` when `flags.pentaryn-senses.lightCast` is in the change,
`deleteItem` (Light item removed → desired = none), the ready sweep, and the HUD/card "End light".

```
desired  = readSpellCast(item.flags)                       // null | {scene, token} | {scene, x, y}
source   = item.uuid
existing = every TokenDocument and AmbientLightDocument on every scene with
           flags.pentaryn-senses.spellLight.source === source

1. Resolve a token target. Try `game.scenes.get(scene).tokens.get(token)`; if absent, search
   every scene for that token id (pentaryn-portals keeps ids, portals.mjs:538); found elsewhere →
   update the item flag's `scene` silently and continue; found nowhere → desired = null and
   whisper the item's owner: "The creature your Light was on is gone; the light has ended."
2. For each `existing` that is not the desired target: token → restore (step 4); ambient → delete.
3. Desired square: if no existing ambient light sits at (x, y) on that scene with this source,
   create one:
     { x, y, elevation: 0, rotation: 0, walls: true, vision: false, hidden: false,
       config: SPELL_LIGHT, flags: { "pentaryn-senses": { spellLight: { source } } } }
   Desired token: if `token.flags.pentaryn-senses.spellLight?.source !== source`, update
     { light: SPELL_LIGHT, "flags.pentaryn-senses.spellLight": { source, prior } } where
     `prior` = the token's current `light.toObject()` if the token is not already spell-lit,
     else the existing flag's `prior` (a second caster replaces the first; the first caster's
     item flag is cleared so its card is honest).
4. Restore a token: update { light: flag.prior ?? DARK, "flags.pentaryn-senses.-=spellLight": null },
   then `syncLight(token.actor)` so a carried light (torch lit meanwhile) comes back. `prior`
   is only load-bearing for a hand-set light (no `itemLight` flag); item-driven lights are
   re-derived.
```

**`lightUpdate()` in `senses.mjs` gains one line:** a doc with a `spellLight` flag is skipped
(the spell owns that light until it ends). Without this the next torch toggle would overwrite
the spell light.

### 5.6 Ending a light

- **Cast again** → `lightCast` replaced → step 2 removes the old one. One light per Light item,
  which is one per caster (a caster with two Light items, say a ring and the spell, gets two
  lights; the rules say "per casting", close enough).
- **End light** on the card (owner/GM) → `item.update({ lightCast: null })`.
- **Token HUD** (`renderTokenHUD`, same injection as `chain.mjs`): button **End light**
  (`fa-solid fa-lightbulb-slash`) on a token whose `spellLight.source` resolves, shown to the
  **GM** and to the **source item's owner**. Owner → clears the item flag; GM → clears it too
  (the GM can update any item). Not shown to the lit PC's own player when they are not the
  caster: they cannot write the caster's item, and if they cleared their token's light the
  reconcile would re-apply it. They ask the caster or the GM.
- **Deleted token** (`deleteToken`, GM): if it carried `spellLight`, clear the source item's
  flag (keeps the card and HUD honest; a recast would have worked anyway).
- **Deleted caster / scene** (`deleteActor`, `deleteScene`, GM): run the sweep.
- **Ready sweep** (GM, after `syncAll()`): for every token and ambient light on every scene with
  `spellLight` whose `source` does not `fromUuidSync` to an item → restore/delete; for every
  Light item with `lightCast` on world actors and on tokens' synthetic actors → reconcile. Also
  the one-time tidy: delete tokens whose actor is the PHB "Light" NPC (`flags.dnd5e.summon.origin`
  resolves to a Light spell) — the floor lights from 10-08 — logged as
  `pentaryn-senses | light: removed N old summoned lights`.

## 6. Torches, lamps, lanterns, candles

### 6.1 State

`lit` on the item; `profileFor(item)` says what it gives. `carriedLight(actor)` becomes:

```
lights = []
for item of actor.items (quantity > 0):
  if item.flags[SCOPE].light            → lights.push(that object)              // shard: always on
  else if item.flags[SCOPE].lit:
    p = profileFor(item); if (p) lights.push(lightFor(p, { hooded: item.flags[SCOPE].hooded }))
return strongest(lights)   // largest dim, then bright; null when empty
```

Everything after that (`lightUpdate`, prototype + placed tokens, `itemLight` marker, DARK reset)
is unchanged, so a lit torch behaves exactly like the shard today: picked up → the new carrier
glows; dropped into a pile → the old carrier goes dark; the torch stays `lit` in the pile and
lights whoever takes it ("someone picked up the burning torch"). Quantity 0 → no light.

### 6.2 Toggling

Three ways, all owner-side writes of `flags.pentaryn-senses.lit`:

1. **The item's "Light" activity.** Lamp, lanterns and candle already have a utility activity
   named "Light"; the install agent adds one to Torch (and marks it
   `flags.pentaryn-senses.lightToggle: true`; activities have `flags`, `BaseActivityData`
   schema 11868). Hook `dnd5e.preUseActivity`: if `activity.flags["pentaryn-senses"]?.lightToggle`
   or (`activity.type === "utility"` and `profileFor(activity.item)`), then **return `false`**
   (no consumption, no card: the PHB activities would burn the lantern's single "oil" use and
   the candle would self-destruct), toggle `lit`, and post a one-line chat message:
   "Marrith lights a Torch." / "Marrith douses her Torch." (speaker = the actor). This is what
   the sheet's item-image click, the activity chooser and Argon HUD all run through.
2. **Inventory row flame button.** `renderBaseActorSheet` (AppV2 fires the hook for every class
   in the chain, `application.mjs:1665–1705`, so one hook covers character and NPC sheets): for
   each `li[data-item-id]` whose item has a profile, insert before the `[data-context-menu]`
   button a `<button class="unbutton config-button item-control ps-light-toggle [lit]"
   data-tooltip="Light|Douse"><i class="fa-solid fa-fire" inert></i></button>` (template:
   `templates/inventory/columns/controls.hbs`). Lit = orange (CSS). Click → toggle. Owner only.
   The flame doubles as the **state indicator** on the sheet.
3. **Hood.** While a `lantern-hooded` is lit, a second row button `fa-solid fa-eye-slash`
   ("Lower hood" / "Raise hood") toggles `hooded`. Nothing else knows about hoods.

GM reaction is the existing `updateItem → schedule(actor) → syncLight`. No new writer code.

## 7. Changes to `senses.mjs` (the only existing file touched)

- `import "./light.mjs";`
- `carriedLight(actor)`: § 6.1, using `profileFor`, `lightFor`, `strongest` from `light-core.mjs`.
- `lightUpdate(doc, light)`: first line `if (doc.flags?.[SCOPE]?.spellLight) return null;`.
- `syncAll()`: unchanged; the ready hook additionally calls `light.sweep()` after it.
- API: `game.pentaryn.senses.light = { cast(item, target), end(item), pick(), toggle(item),
  profileFor(item), sweep() }`.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Light on another PC's token | Allowed (the rules let you touch an object; the GM adjudicates unwilling targets). The caster or the GM ends it; the HUD button shows for them. |
| Light on a monster | Same. The GM sees End light on the HUD. |
| Lit token deleted | Flags die with it; GM clears the caster's item flag. |
| Lit token copied/pasted | Copy carries the flag; reconcile restores the copy (its id is not the desired one). |
| Party moves scene (pentaryn-portals) | Token light and flag travel (`toObject()`, `keepId`); the item flag's `scene` is corrected on the next reconcile. A square light stays on its scene, as it should. |
| Caster changes scene, light on a square elsewhere | Recast from the new scene deletes the old ambient light (scan is global). |
| Caster logs off / no GM connected | Flag sits on the item; the GM's ready sweep applies it when they connect. |
| Light cast on a torch-lit token, then torch doused | Spell light stays (spell-lit tokens are skipped by `syncLight`); when the spell ends, `prior` is restored then `syncLight` sets it dark. |
| Torch lit while spell-lit | Ignored until the spell ends, then applied. |
| Token with a hand-set light (Marrith's rune glow) | `prior` holds it; restored on end. |
| Two casters light the same token | Newest wins, `prior` kept from the first; the first caster's flag is cleared. |
| Caster is an unlinked NPC token | Works; `source` is scene-bound, so deleting the token makes it unresolvable and the sweep cleans up. |
| Unlit square clicked by mistake | Card buttons: Pick a target again (replaces), or End light. |
| Scene changed mid-pick | `canvasTearDown` cancels the pick. |
| Player lacks `TOKEN_CREATE` | Irrelevant now: nothing is summoned. |
| Argon HUD | Torch shows its activities; "Light" lands in the Action panel (activation `action`). The Light spell card appears as before, with our buttons instead of Summon. |
| Item Piles transfer re-ids items | `lit` travels with the item data; `lightCast` on a *spell* item is never transferred. Fine. |
| Old PHB "Light" floor tokens from 10-08 | Removed by the ready sweep (§ 5.6). |

## 9. Deferred, deliberately

- **Burn-down** (torch 1 h, lamp/lantern 6 h): add `litAt: game.time.worldTime` to the flag
  and an `updateWorldTime` hook on the GM that douses expired items. Joe's default is "until
  doused"; nothing in this design blocks adding it.
- **Spell light colour** (the rules let the caster pick): a swatch in the prompt. Default pale
  warm white.
- **Bullseye cone** following token rotation: `angle: 60` once players have a reason to rotate.
- **Light with an on-the-fly target under a player's cursor preview** (TokenPlacement-style
  ghost): not needed; the crosshair + notification is enough.

## 10. Playtest checklist (for the verify agent, as a player client)

1. Cast Light → prompt shows; **On me** → own token glows 20/40 within a second; card shows
   On me / Pick a target / End light and **no Summon button**.
2. Cast again → prompt; **Pick a target** → cursor crosshair + notice; click another PC → the
   first light ends, that PC glows; click an empty square → PC dark, square lit; right-click /
   Esc → nothing changes.
3. **End light** on the card → dark. Token HUD on a lit token shows End light for the caster
   and GM, not for a bystander.
4. GM moves the party to another scene with a lit PC → still lit on arrival.
5. Torch: click the item image → chooser shows Attack / Light; Light → one-line chat, token
   glows, inventory flame turns orange; click again → doused. No item uses consumed. Same on
   Argon.
6. Drop the lit torch into a pile → carrier dark; another PC takes it → they glow.
7. Lantern, Hooded: light → 30/60; hood button → 0/5; raise → 30/60. Candle: 5/10.
8. Reload the GM client: nothing changes on the map (sweep is idempotent); console shows the
   old floor lights removed once.
9. `node test/run.mjs` passes (chain + light fixtures).

## 11. Install-agent notes (data, outside this module)

- Torch items on every PC (and the world Torch item, if any): add a utility activity named
  "Light", activation `action`, no consumption, `flags.pentaryn-senses.lightToggle: true`.
  Lamp / lanterns / candle need nothing: their PHB "Light" utility activity is intercepted.
- `module.json`: `languages` entry, version 0.3.0; server restart (new file list).
- Optional: delete the stray PHB "Light" tokens by hand if the sweep is not wanted.
