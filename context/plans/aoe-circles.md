---
created: 2026-10-08
last_modified: 2026-10-08
tags: ["playbook", "foundry", "vtt", "dnd5e", "design"]
status: built (round 1, 2026-10-08) — awaiting server restart
---

# AoE circles, saves and damage — design plan (`pentaryn-aoe`)

**Read this when:** building or changing the `pentaryn-aoe` module — movable/deletable spell
areas, monster saves rolled off the area, damage applied with a GM confirm. **Design doc.**
To *use* it at the table once it ships, read `foundry/module/pentaryn-aoe/README.md` (to be
written by the builder). **Not this file:** the one-off cleanup of the players' experiments on
the Prison scene — that is a reset task, not module work (see "What this does not cover").

Recon was done live on world **`pentaryn`** ("Pentaryn"), Foundry **14.367**, dnd5e **5.3.3**,
rules "modern". Line numbers below are into
`~/Library/Application Support/FoundryVTT/Data/systems/dnd5e/dnd5e.mjs` (system) and
`/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/` (core) at those versions.
Nothing in the world or the repo was changed while designing.

> **Goal.** Three table complaints, one module:
> 1. *"Damage wasn't being rolled."* — nothing is broken; the two-click flow is invisible to
>    players. Make hit/miss visible and roll damage on a hit.
> 2. *"The circles are annoying — once placed you can't delete them."* — give every area a
>    draggable, deletable handle that everyone owns, and make delete remove everything.
> 3. *"If a monster is in the circle and you say damage, it should roll the saves."* — monsters
>    save automatically and take full/half/none; PCs get a one-click prompt and roll their own;
>    the GM confirms before anything is applied; nothing about monsters leaks to player screens.

---

## 1. Where this started

Two recon passes (an inventory of the experiments and a damage diagnosis) established:

- **Damage.** This world runs plain dnd5e. No midi-qol, no Ready Set Roll, no Automated
  Animations; libWrapper holds 0 wrappers; Argon (`enhancedcombathud`) has no roll setting.
  dnd5e 5.x posts the attack roll as its own message and leaves the **Damage** button on the
  usage card above it. Caven hit *Attack* on Fire Bolt four times and never clicked *Damage*;
  every time anyone did click *Damage* the roll worked (Blight 8d8=43, Synaptic Static 8d6=28,
  Fire Bolt 3d10=13…). Two settings make it worse: `dnd5e.attackRollVisibility = "none"` (players
  never see hit/miss, so they wait for a call that never comes) and
  `dnd5e.autoCollapseChatTrays = "older"`. Damage was also **never applied** — the system's
  `<damage-application>` tray is GM-only (`:69585`) and manual.
- **Circles.** On v14 a MeasuredTemplate is a deprecated shim; dnd5e's `AbilityTemplate`
  (`:16218`) ends in `RegionDocument.createDocuments` (core `client/documents/measured-template.mjs:238`).
  Core's `_migrateMeasuredTemplateData` (`common/documents/region.mjs:173-240`) names it
  "Circle Template [User]", flags `core.MeasuredTemplate: true`, and sets
  `ownership = {default: NONE, [author]: OWNER}` (`:220`). Region update and delete need OWNER
  (`:128-133`), so Caven cannot touch Marrith's Fireball and vice versa. Templates live on the
  **Regions** layer, which a player on the Tokens layer cannot select or drag. dnd5e 5.3.3 never
  deletes a template, not even an instantaneous one.
- **Saves.** Nothing targets what is inside a template. `SaveActivity` puts a "DC N ABILITY"
  button on the card (`:31388-31416`) that rolls for the clicking user's controlled tokens
  (`#rollSave`, `:31457-31472`); the Damage button posts a roll with
  `flags.dnd5e.roll.damageOnSave` (`:31424-31430`). Core v14 gives containment for free:
  `RegionDocument#tokens` is the live Set of tokens inside, and the Circle of Death region on the
  Prison scene reported 25 of them — including item piles and loot containers, so a creature
  filter is mandatory.

---

## 2. Decisions

### D1 — Keep the Region; add an owned **handle token** attached to it (hybrid), not a pure token

Joe's idea was "make the circle a creature everyone owns, so anyone can drag it and Delete
deletes it". The *interaction* he wants is exactly a token's; the *data* he needs (shape,
containment, link to the spell) is exactly a Region's. Core v14 lets us have both:

- **`RegionDocument.attachment.token`** (`common/documents/region.mjs:70`) attaches a region to
  a token. Core then moves the region with the token, animates it during the drag
  (`client/canvas/placeables/region.mjs:540`), re-evaluates which tokens are inside after the
  move (`client/documents/token.mjs:2481-2500`), and **deletes attached regions when the token
  is deleted** (`client/documents/token.mjs:3139-3146`, done by any designated active user who
  can delete the region). That is "delete deletes it fully" implemented by core, not by us.
- The region keeps the real shape (cones, lines and rectangles too, which a square token never
  fits), dnd5e's `flags.dnd5e.origin` link to the activity, the user-coloured highlight, and
  `region.tokens` for the save pipeline.
- The token is a small (0.5 grid) glyph at the area's centre on the **Tokens layer**, which is
  where players already live. Dragging it moves the area; Delete removes both; everyone owns it.

Why not a pure token (Joe's option as stated): it loses containment (would need our own
point-in-shape math and polling), can't draw a cone, shows up in combat/targeting/vision as a
"creature", and goes through dnd5e's `movementAutomation = "full"` as a real creature. The
hybrid keeps the drag-and-delete feel and sheds those costs. The handle still has two of the
token downsides — it can be targeted by accident, and it is a token on the scene — and section
4.2 says how each is neutralised.

Why not Region-only with a chat button: it is the minimum fix for *delete*, and it is kept
(section 4.4), but it does nothing for *drag* without sending players to the Regions layer.

### D2 — Ownership: `ownership.default = OWNER` on both the region and the handle

Set in `preCreateRegion` on the creating client (the caster's), with an active-GM backstop in
`createRegion` for any region that arrives without it (section 4.1). The handle actor is one
shared world actor with `ownership.default = 3`, so any user may create, move and delete its
tokens (`TOKEN_CREATE`/`TOKEN_DELETE` are already `[1,2,3,4]` in this world).

### D3 — The save/damage pipeline runs entirely on the active GM's client, from chat messages

No sockets. The damage roll already lands as a ChatMessage carrying
`flags.dnd5e.activity.uuid`, `flags.dnd5e.targets` (the roller's targets at roll time, via
`messageFlags` `:16781-16787`) and `flags.dnd5e.roll.damageOnSave`. The active GM's
`createChatMessage` hook is the trigger; it needs no code on player clients and works whether a
player or the GM clicked Damage. Resolution state lives in `flags.pentaryn-aoe` on that damage
message, which the GM may update regardless of author. If no GM is online nothing happens, which
is the right failure for a GM-confirmed step.

### D4 — PCs are prompted with dnd5e's native **request card**, never auto-rolled

dnd5e 5.3 has `type: "request"` chat messages (`RequestMessageData`, `:74251`) with an
extensible handler registry `CONFIG.DND5E.requests` (`:48136`). Each target actor gets a button
visible only to its owner or the GM (`:74318-74324`); the result message is linked back
automatically by dnd5e (`requestResult` flag, `:74365-74410`). We register one handler and get
the "roll your own save" UI, completion ticks and success/failure highlighting for free.

### D5 — Monster saves are rolled GM-only by default; damage needs an explicit Apply

NPC saves: `actor.rollSavingThrow({ability, target: dc}, {configure: false}, {rollMode, data:{speaker}})`
with `rollMode` from a world setting, default `gmroll`. Apply is a button on a GM-only tray on
the damage message; a world setting can auto-apply NPC rows for a faster table, default off.
Players never see HP, multipliers or monster results on screen; console logging is fine.

### D6 — "Damage isn't rolled" is fixed by one setting change plus opt-in auto-damage on hit

Not a bug, so no bug fix. Section 6.

---

## 3. Module shape

`foundry/module/pentaryn-aoe/` — new, following the `pentaryn-portals` / `pentaryn-transform`
pattern (plain ESM, `Hooks.on`, `game.pentaryn.aoe` namespace rebuilt because `pentaryn-importer`
freezes `game.pentaryn`).

```
pentaryn-aoe/
  module.json      id pentaryn-aoe, esmodules [aoe.mjs], styles [aoe.css], socket false,
                   relationships.systems dnd5e ≥ 5.3, compatibility 14, flags.pentaryn.flagScope "aoe"
  aoe.mjs          entry: settings, namespace, imports the three parts below
  areas.mjs        Part A — ownership, handle token, attachment, cascade, Remove-area button, sweeps
  resolve.mjs      Part B — createChatMessage trigger, NPC saves, PC request card, state, apply
  tray.mjs         Part B — the GM-only <pentaryn-aoe-tray> element rendered on the damage message
  attacks.mjs      Part C — auto damage on hit
  templates/tray.hbs
  lang/en.json
  aoe.css
  README.md        use-doc, written when it ships
  test/run.mjs     node static checks (parse + the `module-check` battery), like the others
```

Register it with the sync tooling: a `"aoe"` entry in `MODULES` in
`scripts/foundry/ops/config.py:114` and `foundry-aoe-check` / `foundry-aoe-sync` targets in the
Makefile (`:173-200`). `config.py` is in Joe's uncommitted working set — add the entry, don't
reformat the file.

### Settings (`game.settings.register("pentaryn-aoe", …)`, all world scope)

| key | default | meaning |
|---|---|---|
| `handleTokens` | `true` | create a handle token for every new template region |
| `removeAreaButton` | `true` | add "Remove area" to the usage card |
| `instantCleanup` | `true` | after Apply, delete the area of an instantaneous spell |
| `concentrationCleanup` | `true` | delete areas whose spell's concentration ended |
| `resolveSaves` | `true` | run Part B at all |
| `npcSaveRollMode` | `"gmroll"` | `publicroll` / `gmroll` / `blindroll` for auto NPC saves |
| `autoApplyNpc` | `false` | apply NPC damage without the GM pressing Apply |
| `promptPlayers` | `true` | post the request card for PC rows |
| `autoDamageOnHit` | `true` | Part C (Joe to confirm the default — see §6) |

### API (`game.pentaryn.aoe`)

`areasFor(activityUuid)`, `handleFor(region)`, `removeArea(regionId)`, `sweep(scene)` (delete
every `flags.core.MeasuredTemplate` region + handle on a scene — the GM cleanup tool),
`resolve(messageId)` (re-run Part B on a damage message), `applyRows(messageId, rowIds)`.

---

## 4. Part A — movable, deletable areas (`areas.mjs`)

### 4.1 Ownership

```js
Hooks.on("preCreateRegion", (doc, data, options, userId) => {
  if (!data.flags?.core?.MeasuredTemplate) return;
  doc.updateSource({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
});
// backstop: a region created by a client without the module (or before this hook) — GM fixes it
Hooks.on("createRegion", (doc, options, userId) => {
  if (!game.users.activeGM?.isSelf || !doc.flags.core?.MeasuredTemplate) return;
  if (doc.ownership.default !== 3) doc.update({ "ownership.default": 3 });
});
```

`dnd5e.preCreateActivityTemplate` cannot do this: core rebuilds ownership from the author in the
migration (`region.mjs:220`). `preCreateRegion` runs after the migration, on the creating client.
The GM portal regions (`pentaryn-portals`) have no `core.MeasuredTemplate` flag and are untouched.

### 4.2 The handle actor and token

One world actor **"Area handle"** in the `Scene Props` folder, type `npc`, no stat block,
`ownership.default: 3`, `flags.pentaryn-aoe.handleActor: true`. Prototype token:

| field | value | why |
|---|---|---|
| `width`/`height` | 0.5 | a pin, not a creature |
| `texture.src` | `icons/svg/target.svg` (core; exists) until a webp is built in `assets/tokens/custom/markers/aoe-handle.webp` | the ring-subject rule only applies to ringed tokens; this one has no ring |
| `displayName` | `CONST.TOKEN_DISPLAY_MODES.HOVER` (30) | name on hover: "Fireball (Marrith)" |
| `disposition` | `CONST.TOKEN_DISPOSITIONS.SECRET` (-2) | no coloured border, not a "creature" in anyone's eyes |
| `sight.enabled` | `false`; `light` off | never contributes vision |
| `lockRotation` | `true` | world rule (`context/foundry/README.md`) |
| `movementAction` | `"displace"` (`client/config.mjs:2439`: `walls: null`, `teleport: true`, `measure: false`) | dragging an area across a wall must not be blocked; `canSelect:false` only hides it from the config menu — verify in test T-A4 that the field accepts it, fall back to `"blink"` |
| `actorLink` | `false` | per-token name |
| `flags.pentaryn-aoe` | `{ handle: true, region: <regionId> }` | identifies it everywhere below |

Creation, on the **creating client** of the region (it owns the region and has `TOKEN_CREATE`):

```js
Hooks.on("createRegion", async (region, options, userId) => {
  if (userId !== game.user.id || !region.flags.core?.MeasuredTemplate) return;
  if (!game.settings.get("pentaryn-aoe", "handleTokens")) return;
  const { x, y } = centreOf(region.shapes[0]);   // circle: x,y · rectangle: x+w/2,y+h/2 · line/cone: origin x,y
  const actor = game.actors.find(a => a.getFlag("pentaryn-aoe", "handleActor"));
  const origin = await fromUuid(region.flags.dnd5e?.origin);      // the Activity
  const [token] = await region.parent.createEmbeddedDocuments("Token", [{
    ...actor.prototypeToken.toObject(), actorId: actor.id,
    x: x - gridHalf, y: y - gridHalf, elevation: region.elevation.bottom ?? 0,
    name: `${origin?.item?.name ?? region.name} (${game.users.get(userId)?.name ?? "?"})`,
    flags: { "pentaryn-aoe": { handle: true, region: region.id } }
  }]);
  await region.update({ attachment: { token: token.id }, levels: [token.level],
                        flags: { "pentaryn-aoe": { handle: token.id } } });
});
```

`levels: [token.level]` is the invariant core's attach tool enforces
(`client/canvas/layers/regions.mjs:706-712`); copy it. If the activity template is a cone or
line, place the handle at the origin point rather than the centroid so dragging feels like
moving the caster's hand.

Excluding the handle from everything that treats tokens as creatures:

- **Part B creature filter** drops `flags.pentaryn-aoe.handle`.
- **Combat:** `preCreateCombatant` returns `false` for a handle token (`combatant.token`).
- **Targeting:** `targetToken` hook — if a user targets a handle, immediately
  `token.setTarget(false, {user, releaseOthers: false})` and `ui.notifications.info` once. Cheap and
  keeps `game.user.targets` clean for dnd5e's own `getTargetDescriptors`.
- **Argon HUD / Item Piles:** a SECRET-disposition npc with no items; nothing to show. Item Piles
  ignores actors without its flag.
- **`pentaryn-names`** carries actor renames to token labels — the handle actor is never renamed,
  and token names are set per token, so no interaction. **`pentaryn-senses`** follows sheet
  Darkvision: the handle actor has none, so vision stays off. **`pentaryn-ties`** double-click
  menu: the handle has nothing to show; acceptable. If the Look window on a handle looks wrong,
  the ties agent can skip `flags.pentaryn-aoe.handle` — not our file to edit now.

### 4.3 Delete in both directions, nothing orphaned

- **Token deleted** (player presses Delete on the handle): core deletes the attached region
  (`token.mjs:3139`). Works because every active user owns the region (D2). Nothing for us to do;
  T-A5 proves it.
- **Region deleted** (Regions layer, or the Remove-area button, or `sweep`): `deleteRegion` hook
  on the **active GM** deletes `scene.tokens` where `flags.pentaryn-aoe.region === region.id`.
  Also run on the deleting client if it owns the token, so it works with no GM online.
- **Scene-level safety net:** on `ready` and `canvasReady` (active GM only) remove handles whose
  region is gone and attach-less template regions whose handle is gone (recreate the handle if
  `handleTokens` is on). This is `sweepOrphans(scene)`, separate from `sweep(scene)`.

### 4.4 "Remove area" on the chat card

`dnd5e.renderChatMessage(message, html)` (`:69159`): if `message.flags.dnd5e.activity?.uuid`
has at least one region on `canvas.scene` with `flags.dnd5e.origin` equal to it, append a button
to `.card-buttons` — label "Remove area", `data-action="pentaryn-aoe-remove"`, visible to all.
Click: delete those regions (handles cascade via 4.3). Everyone owns the regions, so a player can
remove any area from its card — that is the intended fix for "Caven can't delete Marrith's
Fireball". Re-render the button state via `updateRegion`/`deleteRegion` → `ui.chat` re-render of
that message (debounced).

### 4.5 Automatic cleanup

- **Instantaneous spells** (`activity.item.system.duration.units === "inst"`): after Part B's
  Apply (or auto-apply) completes on a damage message that resolved against a region, delete
  that region. Fireball's circle disappears once the damage is in. Setting `instantCleanup`.
- **Concentration spells** (Web, Hypnotic Pattern): `deleteActiveEffect` on the active GM — if
  `effect.statuses.has("concentrating")`, delete every region on every scene whose
  `flags.dnd5e.item === effect.origin` (the concentration effect's `origin` is the item uuid —
  Caven's "Concentrating: Invisibility" showed exactly that shape). Setting `concentrationCleanup`.
- **Never** auto-delete a non-template region, and never touch a region without
  `flags.core.MeasuredTemplate`.

---

## 5. Part B — saves and damage off the area (`resolve.mjs`, `tray.mjs`)

### 5.1 Trigger

```js
Hooks.on("createChatMessage", (message, options, userId) => {
  if (!game.users.activeGM?.isSelf) return;
  if (message.getFlag("dnd5e", "roll.type") !== "damage") return;
  const activityUuid = message.getFlag("dnd5e", "activity.uuid");
  const activity = activityUuid && fromUuidSync(activityUuid);
  if (!activity?.save) return;                 // Part B is for save activities only
  resolve(message, activity);
});
```

### 5.2 Who is affected

1. Regions on the **damage message's scene** (`message.speaker.scene`, fallback `canvas.scene`)
   with `flags.dnd5e.origin === activity.uuid`. Several (Marrith cast Fireball twice): take the
   newest by `_stats.createdTime`; the tray names it and offers a picker for the others.
2. If none: the roller's targets, `message.flags.dnd5e.targets` (array of
   `{uuid, name, img, ac}`), resolved to tokens on the scene. This makes Toll the Dead, Blight
   and other single-target save spells go through the same tray — it is a real gain, not scope creep.
3. Filter to creatures:
   `actor && ["character","npc"].includes(actor.type) && actor.system.attributes?.hp?.max > 0`,
   drop `token.flags["pentaryn-aoe"]?.handle`, drop item piles
   (`game.itempiles?.API?.isValidItemPile(token)` when Item Piles is active, else
   `actor.getFlag("item-piles","data")?.enabled` — verify the flag path in T-B2 against
   "Marrith's Items"), drop `actor.getFlag("pentaryn-aoe","handleActor")`.
   The caster inside their own Fireball **stays** in the list (that is the rule); the GM unticks.
   Crowd actors (`context/pentaryn.md` §markers/crowd: no stat block → `hp.max` 0) drop out by the
   HP test; the nine "Marker · N" actors likewise.
4. Classify each row: **manual** if `actor.hasPlayerOwner` (PCs, and the players' summons and
   wild-shape forms in the "— summons & forms" folders), else **auto**.

### 5.3 State on the damage message (`flags.pentaryn-aoe.resolution`)

```js
{
  activity: activityUuid, region: regionId|null, scene: sceneId,
  ability: "dex", dc: 17, onSave: "half"|"none"|"full",
  damages: [{ value, type, properties: [] }],     // dnd5e.dice.aggregateDamageRolls(message.rolls, {respectProperties:true}), as the system tray does (:69587)
  request: requestMessageId|null,
  rows: [{ id: tokenId, actor: actorUuid, name, img, kind: "auto"|"manual",
           save: { total, success, messageId } | null,
           multiplier: 1|0.5|0|null, apply: true, applied: false, applyMessage: null }]
}
```

`ability` = `activity.save.ability.first()` (multi-ability saves: tray dropdown, default first);
`dc` = `activity.save.dc.value`; `onSave` = `message.flags.dnd5e.roll.damageOnSave ?? activity.damage.onSave`.
Multiplier from a save: fail → 1; success → `{half: 0.5, none: 0, full: 1}[onSave]`.

### 5.4 Auto rows (monsters)

Immediately on trigger, sequentially:

```js
const [roll] = await actor.rollSavingThrow(
  { ability, target: dc },
  { configure: false },
  { rollMode: game.settings.get("pentaryn-aoe", "npcSaveRollMode"),
    data: { speaker: ChatMessage.getSpeaker({ actor, scene, token }) } }) ?? [];
row.save = { total: roll.total, success: roll.isSuccess, messageId: roll.parent?.id ?? null };
row.multiplier = multiplierFor(roll.isSuccess, onSave);
```

`rollMode: "gmroll"` whispers the roll to GMs — monster totals never reach a player screen.
Dice So Nice still animates GM-side only. The `dnd5e.rollSavingThrow` hook (`:37527`) fires as
usual, so anything else listening still works. Legendary Resistance, Evasion, magic resistance:
**not automated** — the GM flips the row's multiplier or re-rolls it from the tray.

### 5.5 Manual rows (PCs) — the request card

If any manual rows and `promptPlayers`:

```js
CONFIG.DND5E.requests["pentaryn-aoe.save"] = async (actor, request, data, { event } = {}) => {
  const msg = {};
  foundry.utils.setProperty(msg, "flags.dnd5e.requestResult", { actorUuid: actor.uuid, requestId: request.id });
  const [roll] = (await actor.rollSavingThrow({ ability: data.ability, target: data.dc, event }, {}, { data: msg })) ?? [];
  return roll?.parent ?? null;        // same contract as Actor5e.handleSkillCheckRequest (:37178-37183)
};
await ChatMessage.create({
  type: "request",
  flavor: `${item.name} — ${abilityLabel} saving throw`,
  content: onSave === "half" ? "Half damage on a success." : onSave === "none" ? "No damage on a success." : "",
  speaker: ChatMessage.getSpeaker({ actor: activity.actor }),
  system: { handler: "pentaryn-aoe.save", data: { ability, dc, damageMessage: message.id },
            button: { icon: "fa-solid fa-shield-heart", label: `Roll ${abilityLabel} save` },
            targets: manualRows.map(r => ({ actor: r.actor })) }
});
```

The player sees only their own button (`:74318`), rolls with the normal dialog (advantage,
bonuses — this is the "manual" Joe asked for), and dnd5e links the result into the request
(`#updateRequestTargets`). The GM listens:

```js
Hooks.on("updateChatMessage", (request, changes, options, userId) => {
  if (!game.users.activeGM?.isSelf || request.type !== "request") return;
  if (request.system.handler !== "pentaryn-aoe.save" || !changes.system?.targets) return;
  // for each target with a result: read result.rolls[0].total / .isSuccess, fill the row, set multiplier, re-render tray
});
```

The DC is not written into the button label; whether a player sees "success/failure" follows
`dnd5e.challengeVisibility` exactly as it does for the system's own cards. A PC may also use the
existing "DC 17 DEX" button on the usage card; its result message carries no `requestResult`
flag, so the tray additionally matches `createChatMessage` where `flags.dnd5e.roll.type === "save"`,
`roll.ability === ability`, the speaker token is a manual row, and the message is newer than the
damage message. Either path fills the row.

### 5.6 The tray (`<pentaryn-aoe-tray>`, GM only)

Rendered in `dnd5e.renderChatMessage` when `game.user.isGM` and the message has a resolution,
after the system's own `<damage-application>` (which stays — it is the fallback for anything the
tray does not cover). Rows:

```
[x] Ursk            auto    DEX 11 ✗   ×1   13 fire
[x] Pit Hulk        auto    DEX 19 ✓   ×½    6 fire
[ ] Marrith         manual  waiting…   —     —          (caster; GM unticked)
[x] Caven           manual  DEX 22 ✓   ×½    6 fire
            [Re-roll NPC saves] [Ping players] [Apply 3]
```

Per row: checkbox, multiplier `<select>` `[×0, ×¼, ×½, ×1, ×2]` (pre-set from the save; the
GM can override, the same multipliers as `DamageApplicationElement` `:62845`), a re-roll icon on
auto rows, a "roll for them" icon on manual rows (GM rolls that PC's save with the dialog — for
an absent player). Preview damage per row = `calculateDamage` through
`actor.calculateDamage(damages, {multiplier})` so resistances show before Apply.
"Ping players" re-whispers the request card link to owners of unfinished manual rows.
Styling follows `styles/ties.css` conventions (not edited — copy the tokens into `aoe.css`).

### 5.7 Apply

For each ticked, unapplied row with a non-null multiplier:
`await actor.applyDamage(damages, { multiplier })` (`:36705`; resistances/immunities and the
`dnd5e.preCalculateDamage` / `dnd5e.applyDamage` hooks run as usual). Mark `applied: true`,
disable the row. Rows still "waiting" are skipped, not zeroed — Apply can be pressed again later
for them. With `autoApplyNpc` on, auto rows apply the moment their save resolves and the tray
shows them as applied. After the last row of an instantaneous spell is applied, §4.5 deletes the
area. Concentration spells with repeat saves (Web's "at the start of each turn") are out of
scope: the GM clicks Damage again and gets a fresh resolution.

### 5.8 What players see

The usage card (unchanged), their request card with their own button, the save messages they
roll, Dice So Nice for public rolls. **Not** the tray, not NPC save totals (gmroll), not HP, not
multipliers. Console: the module logs each resolution at `console.debug` with the row table — fine
at this table (see memory: console-only data is not a leak).

---

## 6. Part C — "damage isn't rolled" (`attacks.mjs` + one setting)

1. **Setting change, not code:** `game.settings.set("dnd5e", "attackRollVisibility", "hideAC")`
   — players see hit/miss on their own attack messages (`:69225`), never the AC. One `eval-js`
   call; Joe decides. Recommend it regardless of the module.
2. **Auto damage on hit** (`autoDamageOnHit`), on the **roller's** client:

```js
Hooks.on("dnd5e.postRollAttack", (rolls, { subject }) => {           // :28597
  if (!game.settings.get("pentaryn-aoe", "autoDamageOnHit") || subject?.type !== "attack") return;
  const roll = rolls?.[0]; if (!roll) return;
  const knownMiss = Number.isFinite(roll.options.target) && !roll.isCritical && roll.total < roll.options.target;
  if (knownMiss || roll.isFumble) return;
  subject.rollDamage({ attackMode: roll.options.attackMode, ammunition: roll.options.ammunition,
                       isCritical: roll.isCritical }, { configure: false });
});
```

Mirrors what the card's own Damage button does (`AttackActivity.#rollDamage`, `:28652-28670`:
attackMode, ammunition and `isCritical` from the last attack). `roll.options.target` is the AC
only when exactly one token was targeted; with no target the damage rolls anyway (the player can
ignore it). Attack damage still posts the system's GM `<damage-application>` tray; Part B does
not touch attack activities. The manual Damage button stays for re-rolls.

---

## 7. Edge cases and rules

- Template with no `flags.dnd5e.origin` (hand-drawn Regions-layer template by the GM): handle
  and ownership still apply (`core.MeasuredTemplate` is the test); Part B never fires for it.
- An area placed by the GM for an NPC spell (Velkyn's Fireball): identical pipeline; "manual"
  rows are still the PCs; auto rows are the drow. The GM's own targets are the fallback.
- Two damage clicks on one card (re-roll): each damage message gets its own resolution; the
  older tray greys out with "superseded" when a newer resolution exists for the same activity
  and region. Prevents double-applying.
- A PC that is also hidden or at 0 HP: included, unticked by default.
- Game paused: core blocks player region deletion on the Regions layer (`regions.mjs:923`) but
  not token deletion; Remove-area goes through `deleteEmbeddedDocuments`, which the server
  permits for owners while paused. Acceptable — matches how tokens already behave.
- Region moved by drag: core re-computes `region.tokens` for attached regions on the token
  update (`token.mjs:2339`, `2481`). Part B always reads `region.tokens` at trigger time, so a
  Fireball dragged onto new victims after Damage was clicked needs Damage clicked again — correct.
- Module missing on a player client (not yet enabled): their templates arrive without
  `ownership.default` — the GM backstop (§4.1) and `sweepOrphans` (§4.3) repair them.

---

## 8. Rollout

1. Build `foundry/module/pentaryn-aoe/`; add `MODULES["aoe"]` and Makefile targets.
2. `make foundry-aoe-check` then `make foundry-aoe-sync` (copy, never symlink).
3. The module is **invisible until the server restarts** (`Data/modules` is scanned at startup —
   `context/foundry/ops.md` §"Module installation is not reachable from a running world").
   Pre-set `core.moduleConfiguration["pentaryn-aoe"] = true` via `eval-js` so it loads enabled.
   **The restart is Joe's to schedule** — the server and tunnel are off-limits right now, so the
   builder stops at step 2 and says so.
4. Create the "Area handle" actor via `eval-js` (or let the module create it on first `ready`
   when missing — do the latter, it is idempotent: look up by `flags.pentaryn-aoe.handleActor`).
5. Until the restart, everything in §4–6 can be **hot-patched** through `eval-js` for testing:
   `Hooks.on(...)` registrations live in the GM client, exactly the code the module will ship.
   That is how the test plan below runs without a reload. Hot-patched hooks vanish on reload;
   record the hook ids returned by `Hooks.on` and `Hooks.off` them at the end of the test.
6. Ship the use-doc `pentaryn-aoe/README.md` and add a row to `context/foundry/README.md`'s
   route table ("Spell areas — moving, deleting, saves and damage off the circle").

---

## 9. Test plan for the verifier (live, via `eval-js`)

Rules: start every call with `game.world.id` and refuse if it is not the world Joe named. Work on
a **scratch scene you create**, never on the Prison scene (except to confirm it was left alone).
Do not reload Joe's client; hot-patch the hooks. Everything created below is deleted in T-9.
No player can log in, so "as a player" is proved with permission predicates against a real player
user (Caven `lilLUo5cIk6JaUda`), which is what the server evaluates anyway:

```js
const u = game.users.get("lilLUo5cIk6JaUda");
doc.testUserPermission(u, "OWNER");          // ownership
doc.canUserModify(u, "update"); doc.canUserModify(u, "delete");   // the actual server checks
u.can("TOKEN_CREATE"); u.can("TOKEN_DELETE"); u.can("REGION_CREATE");
```

**Setup (T-0).**
`Scene.create({name:"AOE scratch", width:3000, height:3000, grid:{size:100, distance:5}, active:false})`,
`scene.view()`. Create from compendium one monster with a CON/DEX save worth testing
(`dnd-monster-manual` **Goblin Warrior** or any CR ≤ 1; via `create-actor-from-compendium`) and
place **three** tokens of it; place one token of **Caven** (`IxcfWOvpcKID6bdn`, player-owned) and
one of **Marrith** (`RNDTDBlFXxZ7Uc8i`). Put one "Marrith's Items"-style item pile inside the
future area if Item Piles makes that easy (`game.itempiles.API.createItemPile`), else skip T-B2b.
Record all ids. Hot-patch the module hooks from the builder's `aoe.mjs` (paste the file body).

**Part A**
- **T-A1 ownership.** Use Marrith's Fireball activity: `activity.use({}, {configure:false}, {create:false})`
  is not enough to place a template without the canvas; instead build data with
  `dnd5e.canvas.AbilityTemplate.fromActivity(activity)` → `.document.toObject()` and
  `scene.createEmbeddedDocuments("Region", [data])` after running it through
  `foundry.documents.BaseRegion._migrateMeasuredTemplateData` if needed — or simplest:
  `scene.createEmbeddedDocuments("MeasuredTemplate", [{t:"circle", x:1500, y:1500, distance:20,
  flags:{dnd5e:{origin: activity.uuid, item: activity.item.uuid, spellLevel:3}}}])` (the shim
  migrates it, `measured-template.mjs:238`). Expect: `region.ownership.default === 3`;
  `region.canUserModify(caven, "update") && region.canUserModify(caven, "delete") === true`;
  the GM portal regions on the Prison scene still have `ownership.default === 0`.
- **T-A2 handle created.** A token with `flags.pentaryn-aoe.handle === true` and
  `.region === region.id` exists at the circle's centre; `region.attachment.token.id === token.id`;
  `region.levels` equals `[token.level]`; `token.actor.getFlag("pentaryn-aoe","handleActor")`;
  `token.disposition === -2`, `sight.enabled === false`, `lockRotation === true`;
  `token.canUserModify(caven, "update") && token.canUserModify(caven, "delete")`.
- **T-A3 drag.** `await token.update({x: token.x + 500, y: token.y + 300})`. Expect the region's
  shape origin moved by the same delta and `region.tokens` now contains whichever test tokens the
  new circle covers (place one goblin so it enters, one so it leaves). Check `region.shapes[0].x`.
- **T-A4 walls.** Draw one wall across the drag path; repeat T-A3 across it. Expect the move is
  not blocked (`movementAction === "displace"` accepted by the schema; if `update` rejected the
  value, record it and try `"blink"`).
- **T-A5 delete token → region gone.** `await token.delete()`. Expect `scene.regions.get(regionId)`
  undefined, no orphan. Recreate (T-A1) for the next tests.
- **T-A6 delete region → token gone.** `await region.delete()` (hooks hot-patched on the GM).
  Expect the handle token gone.
- **T-A7 Remove-area button.** Post the usage card (`activity.use()` with `create: true` on the
  scratch scene, template placement disabled), render it (`ui.chat`), query
  `[data-action="pentaryn-aoe-remove"]` in the message's HTML. Trigger the handler
  programmatically; expect both region and handle gone. Also check the button renders for a
  message authored by Marrith when Caven would view it (it has no visibility gate).
- **T-A8 cones.** Create a `t:"cone", distance:30, direction:45` template; expect the region
  shape is the cone (not a circle), the handle sits at the origin, drag moves the cone.
- **T-A9 concentration cleanup.** Create a template flagged with Hypnotic Pattern's
  `flags.dnd5e.item`; create a concentration effect on Marrith via
  `marrith.beginConcentrating(hypnoticPatternItem)` (dnd5e 5.x API — fall back to creating an
  effect with `statuses:["concentrating"]`, `origin: item.uuid`); delete the effect. Expect the
  region and handle gone, and no other region touched.

**Part B**
- **T-B1 trigger and rows.** Fireball region covering 2 goblins + Caven, not the 3rd goblin,
  not Marrith. GM clicks Damage: `activity.rollDamage({}, {configure:false})`. Expect a damage
  message whose `flags.pentaryn-aoe.resolution.rows` has exactly 3 rows: two `auto`, one `manual`
  (Caven: `actor.hasPlayerOwner === true`), `dc === 17`, `ability === "dex"`, `onSave === "half"`,
  `damages` aggregated `[{value: N, type:"fire"}]`.
- **T-B2 exclusions.** With the handle token inside the circle (it always is) expect no row for
  it. (b) With an item pile inside: no row. (c) A crowd actor ("Drow Commoner (crowd)") inside:
  no row (`hp.max` 0). Record which test the Item Piles check used (API vs flag).
- **T-B3 NPC saves.** For each auto row: `save.total` numeric, `save.success` boolean,
  `multiplier` is 1 on fail and 0.5 on success; the save ChatMessage exists with
  `whisper` containing the GM id and not Caven's (`gmroll`). `message.isContentVisible` false
  as `game.users.get(caven)`? — use `msg.visible` semantics: `msg.whisper.includes(gmId) && !msg.whisper.includes(cavenId)`.
- **T-B4 request card.** A `type:"request"` message exists with
  `system.handler === "pentaryn-aoe.save"` and `system.targets[0].actor === Caven's uuid`.
  Simulate the player: `CONFIG.DND5E.requests["pentaryn-aoe.save"](cavenActor, request, request.system.data)`
  — this rolls Caven's save from the GM client with the dialog suppressed by passing
  `{event: {shiftKey:true}}` equivalent (`configure:false` through the handler's config if the
  builder exposes it; otherwise accept the dialog once). Expect: the result message carries
  `flags.dnd5e.requestResult`, dnd5e sets `request.system.targets[0].result`, the resolution's
  Caven row has `save` filled and the multiplier set. Also confirm the request message's
  rendered HTML shows Caven's button only to Caven/GM: evaluate `_prepareContext()` and check
  `targets[0].visible` logic against `game.users.get(caven)` by reading the code path (`:74318`).
- **T-B5 apply.** Note HP of the 2 goblins and Caven. Call `game.pentaryn.aoe.applyRows(messageId)`
  (or trigger the tray's Apply). Expect goblin HP reduced by `value × multiplier` (rounded as
  `applyDamage` does, down), Caven's by half if they succeeded, `rows[*].applied === true`.
  Press Apply again: no further change. Region + handle deleted afterwards (`instantCleanup`,
  Fireball is `inst`).
- **T-B6 fallback to targets.** No region: set `game.user.targets` to one goblin
  (`token.object.setTarget(true, {releaseOthers:true})`), roll Toll the Dead damage from Caven's
  item. Expect a resolution with one auto row from `flags.dnd5e.targets`.
- **T-B7 no GM online guard.** Temporarily make `game.users.activeGM` resolve to a non-self
  user is impractical; instead assert the hook body returns early when
  `!game.users.activeGM?.isSelf` by reading the code and by calling the handler with a stub
  `{ isSelf: false }` if the builder exposed `resolve` as a function. Record "reviewed" if not
  testable.
- **T-B8 GM-only tray.** Render the damage message's HTML; `<pentaryn-aoe-tray>` present as
  GM; with `game.user.isGM` stubbed false in a scratch call of the render function, absent.
  (Do not actually change the user.)

**Part C**
- **T-C1 hit.** Target one goblin (AC known), `fireBoltActivity.rollAttack({}, {configure:false})`
  with the attack `options.target` set by dnd5e. If the roll total ≥ AC or crit, expect a damage
  message follows within 2 s with `flags.dnd5e.activity.uuid === fireBolt uuid`.
- **T-C2 miss.** Force a miss: roll with a `-30` situational bonus
  (`rollAttack({rolls:[{parts:["-30"]}]}, {configure:false})`). Expect no damage message.
- **T-C3 no target.** Clear targets; attack. Expect damage rolls anyway (documented behaviour).
- **T-C4 setting.** Read `game.settings.get("dnd5e","attackRollVisibility")`; report its value;
  do not change it unless Joe said so in the task.

**Teardown (T-9).** `Hooks.off` every hot-patched id; delete every test ChatMessage created
after the test start timestamp (filter on `timestamp` and on the scratch scene speaker); delete
the scratch scene (tokens and regions go with it); delete the compendium-imported goblin actor
and any item pile actor created; leave the "Area handle" actor **only if** Joe's module is being
shipped, else delete it. Re-check the Prison scene: region and token counts unchanged from the
inventory (7 regions until the reset task runs, then 1), no new effects on Caven or Marrith,
their HP unchanged.

Report per test: id, pass/fail, the evidence value, and any deviation from this plan the
builder made.

---

## 10. What this does not cover

- **The reset of the players' experiments** (Caven's slots, the Invisibility concentration
  effect, the Ring's Misty Step charge, the 6 leftover regions and the Skeleton token on the
  Prison scene, and the Talo/temp-HP question for Joe). That is a one-off data task with its own
  inventory; once the module ships, `game.pentaryn.aoe.sweep(scene)` is the tool for the regions
  part, but the reset must not wait for the module.
- Repeat saves on later turns (Web, Moonbeam), Evasion / Legendary Resistance, half-cover from
  the area's edge, template-based conditions (Web's Restrained, Hypnotic Pattern's Incapacitated).
- Anything in `pentaryn-ties` (another agent owns those files).

## 11. Open questions for Joe

1. `autoDamageOnHit` default **on** (players never miss the second click) or **off** (the table
   keeps its two-click habit, now with hit/miss visible)? Plan says on.
2. `npcSaveRollMode`: `gmroll` (plan) or `publicroll` for drama?
3. Should the caster be ticked by default when standing in their own area? Plan: listed, unticked.
4. Handle art: core `target.svg` for now, or a webp in the markers set built with the ring-subject
   pipeline to match the Marker · N pins?
