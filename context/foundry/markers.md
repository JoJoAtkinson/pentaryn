---
title: "Foundry markers — how Joe points at a spot"
created: 2026-08-17
last_modified: 2026-10-10
status: active
tags: [context, foundry, markers, workflow, item-piles, journal-notes]
---

# Foundry markers — how Joe points at a spot

**Read this when:** acting on "put X here", "replace the red one", or anything that names a spot on a map in chat.
**Not this file:** teleports between scenes → [`scene-links.md`](scene-links.md) · fire tiles → [`fire.md`](fire.md) ·
a marker that carries typed text ("process the prompt markers") → [`prompt-markers.md`](prompt-markers.md)

**Read this before acting on "put X here" or "replace the red one".** Markers are how a spot on
a Foundry map gets named in chat. They exist because Foundry keeps **no ping history** — a ping
draws an animation and is gone, and nothing scripted can read it back afterwards. A marker is a
real token in the database, so it survives, and its coordinates can be read at any time.

(There *is* also a live ping recorder — see [Ping log](#ping-log-the-other-way) at the bottom —
but markers are the reliable path and the one to reach for by default.)

---

## The two sets

Which sets exist, and the folder they sit in, **varies by world** — check the live world
(`game.actors.filter(a => a.name.startsWith("Marker · "))`) rather than assuming. In `pentaryn`
(checked 2026-10-10) the folder is **`Markers (1–9)`** and holds the number set `Marker · 1` …
`Marker · 9` only — no colour set. The earlier worlds keep both sets below in **`Temp Markers`**.
Drag one onto any scene.

| Set | Names | Art | Use it for |
|---|---|---|---|
| **Colour** | `Marker · Red`, `Blue`, `Green`, `Yellow`, `Purple`, `Orange`, `Cyan`, `White` | `assets/tokens/custom/markers/marker-<colour>.webp` | Categories. "The red ones are chests, the blue ones are books." |
| **Number** | `Marker · 1` … `Marker · 12` | `assets/tokens/custom/markers/marker-NN.webp` | Sequence and precision. "Do 1, this. 2, this. 3, this." |

Both sets are **0.25 grid units** — deliberately half the default size of the eye hotspot icon
(0.5), so a marker never hides what it is pointing at and can sit precisely on a small object.

Markers are **not** hidden by their prototype — v14 prototype tokens have no `hidden` field.
Hold **Alt** while dropping one (GM only) to place it hidden: ghosted for the GM, invisible to
players, which is right for scaffolding. A marker dropped without Alt is **visible to players**;
hide it from its Token HUD. (Prompt markers are different: their module forces `hidden` on create.)

---

## The placement contract

This is the part that matters, and it is deliberately simple:

> **A marker's centre is the point. Place the thing centred on that point.**

- Do **not** snap to the grid square unless asked. The marker is small precisely so it can mean
  "here, this exact spot", not "somewhere in this 5-foot square".
- If Joe wants a whole square, **he will say so** — "the whole square", "fill the square".
  Absent that, centre on the marker.
- Multiple markers = multiple instructions, addressed by name: *"1 is a chest, 2 is a book,
  3 is just a description."*

### Reading a marker's position

Token `x`/`y` are the token's **top-left in canvas coordinates**, which include the scene's
padding. Two conversions get used constantly:

```js
const g   = scene.grid.size;
const off = { x: Math.ceil(scene.width  * scene.padding / g) * g,
              y: Math.ceil(scene.height * scene.padding / g) * g };

const centre = { x: tok.x + (tok.width  * g) / 2,      // ← the point Joe meant
                 y: tok.y + (tok.height * g) / 2 };
const image  = { x: tok.x - off.x, y: tok.y - off.y }; // pixel offset into the background art
```

⚠️ **Canvas ≠ image coordinates.** Forgetting the padding offset once put a marker in the trees
outside the catacombs and reported it as being in a corridor. Always subtract the offset before
comparing against the background image.

### Placing something on a marker

```js
const g = scene.grid.size;
const centre = { x: m.x + (m.width * g) / 2, y: m.y + (m.height * g) / 2 };
const size = 0.5;                                     // the thing's own size, in grid units
const td = await actor.getTokenDocument({
  x: centre.x - (size * g) / 2,
  y: centre.y - (size * g) / 2
});
await scene.createEmbeddedDocuments("Token", [td.toObject()]);
await scene.deleteEmbeddedDocuments("Token", [m.id]);  // consume the marker
```

**Consume the marker once it is used.** A leftover marker reads as an outstanding instruction.

---

## Finding every marker on the board

```js
const ids = game.actors.filter(a => a.name.startsWith("Marker · ")).map(a => a.id);
for (const s of game.scenes) for (const t of s.tokens)
  if (ids.includes(t.actorId)) console.log(s.name, t.name, t.x, t.y);
```

`game.scenes` is a Collection — it has `filter`/`map` but **not** `flatMap`. Use a loop.

---

## What usually gets placed there

Most markers become an **interaction hotspot**: a small Item Piles container wearing the eye icon.

- **Icon:** `assets/tokens/custom/props/icon-eye.webp` — an eye, meaning *look at this*. It is
  deliberately generic so the same marker convention covers a chest, a book, or a plain
  description later.
- **Default size 0.5**, and the icon fills the texture edge to edge, so **the token's size is the
  click target**. There is no invisible square around it. Scale by importance: `0.35` minor,
  `0.5` normal, `0.65`–`0.8` major.
- **Template actor:** `Hotspot · Look (template)` in the `Scene Props` folder — already a locked
  container with the icon. Drag it out and fill it rather than rebuilding the config.
- **Size lock (dnd5e 6).** `dnd5e.tokenSizeSync` has the GM's client rewrite a creature token's
  width/height to its actor's size category (`Token5e._onOverrideSize`), and hotspots, markers
  and Item Piles containers are creature actors. Every odd-sized token needs
  `flags.dnd5e.lockSize: true` on the token, and on the actor's `prototypeToken` so new copies
  inherit it. The template and the existing Markers/Hotspots were locked before the upgrade
  (`.state/core-rollback/token-sizes-pre-dnd5e6.json`); set it yourself on any new hotspot or
  marker actor, or on a token you resize by hand.
- Hold **Shift** while dropping to place off-grid (v14; Alt now means "drop hidden").

Alternative glyphs already built, same folder: `icon-magnifier`, `icon-hand`, `icon-chevron`,
`icon-ring`, and three subtle `interact-glint*` variants.

### The gotcha that will bite

**Item Piles stores its state images on the _actor_ and pushes them back onto the token.** Set the
icon on the token only and it will look right until the next pile refresh, then silently revert.
Set all four:

```js
const imgs = {closedImage: ICON, openedImage: ICON, lockedImage: ICON, emptyImage: ICON};
await actor.update({
  "flags.item-piles.data": foundry.utils.mergeObject(actor.getFlag("item-piles","data") ?? {}, imgs),
  "prototypeToken.texture.src": ICON,
  "prototypeToken.flags.item-piles.data": /* same merged object */ });
await tok.update({ "texture.src": ICON,
  "flags.item-piles.data": foundry.utils.mergeObject(tok.getFlag("item-piles","data") ?? {}, imgs) });
```

Then verify against **what the canvas draws**, never the document:

```js
await canvas.draw();
canvas.tokens.get(tok.id).mesh.texture.baseTexture.resource.src;
```

---

## Building a loot hotspot end to end

The whole job, marker → container, in one pass. Clone the template, fill it, place it centred on
the marker, consume the marker.

```js
const scene = game.scenes.get(SCENE_ID);
const tpl   = game.actors.get("rslIK014qoMl6YL5");   // Hotspot · Look (template)
const g     = scene.grid.size;
const ICON  = "assets/tokens/custom/props/icon-eye.webp";

const m      = scene.tokens.find(t => t.name === "Marker · 1");
const centre = { x: m.x + (m.width * g) / 2, y: m.y + (m.height * g) / 2 };
const size   = 0.5;

const actor = await tpl.clone({ name: "Hanging Cloak", folder: "GJT8jxCi9jo3GTLZ" }, { save: true });

// Items come from a compendium UUID. ALWAYS stamp _stats.compendiumSource — the
// attunement repair below needs a way home, and it makes the item traceable.
const uuid = "Compendium.dnd5e.equipment24.Item.dmgCloakOfDispla";
const o = (await fromUuid(uuid)).toObject();
delete o._id;
o.system.quantity = 1;
o._stats = foundry.utils.mergeObject(o._stats ?? {}, { compendiumSource: uuid });
await actor.createEmbeddedDocuments("Item", [o]);

const imgs   = { closedImage: ICON, openedImage: ICON, lockedImage: ICON, emptyImage: ICON,
                 description: "A heavy travelling cloak hung on the wardrobe rail.",
                 closed: true, locked: false, deleteWhenEmpty: false };
const merged = foundry.utils.mergeObject(actor.getFlag("item-piles", "data") ?? {}, imgs);
await actor.update({
  img: ICON,
  "flags.item-piles.data": merged,
  "prototypeToken.name": "Hanging Cloak",
  "prototypeToken.width": size, "prototypeToken.height": size,
  "prototypeToken.texture.src": ICON,
  "prototypeToken.flags.item-piles.data": merged });

const td = await actor.getTokenDocument({ x: centre.x - (size * g) / 2, y: centre.y - (size * g) / 2 });
const [tok] = await scene.createEmbeddedDocuments("Token", [td.toObject()]);
await tok.update({ "texture.src": ICON, "flags.item-piles.data": merged });
await scene.deleteEmbeddedDocuments("Token", [m.id]);
```

`deleteWhenEmpty: false` matters — the world setting `item-piles.deleteEmptyPiles` is **true**, so
without the per-pile override an emptied hotspot vanishes off the map. With it, the eye stays and
reads "This pile is empty", which is what you want for a place the party may come back to.

### Verified player behaviour (tested 2026-08-17, both player accounts)

| | |
|---|---|
| Opening | Player **double-clicks** the eye. Pile UI opens: item rows, a `Take` per row, `Leave`. |
| Taking | Works. Chat card "X picked up the following items". The token stays put. |
| Linked spells | A magic item's granted spell (Hat of Disguise → *Disguise Self*) is **hidden** from the player's list — `item-piles.itemFilters` filters `type: spell` — and moves across with the parent. Nothing to clean up. |
| Depositing | **Not possible.** Dropping an item onto a hotspot token only ever offers "Create new pile". These containers are take-only. |
| Dropping | Works, but always makes a **new loose pile token on the floor**, named and iconed after the item. Deletes itself when emptied. |
| Range | **Unlimited.** The `distance` flag is unset on every pile in this world, and item-piles reads unset as `Infinity` — a player can open a hotspot from anywhere on the scene. Set `distance: 1` per pile if you want them to have to walk over. |
| Hover | The token's nameplate renders at grid scale, so hovering an eye shows its name in very large type. "Hanging Cloak" on hover is a mild spoiler — set `displayName: 0` on the prototype if that bothers you. |

### The "Config Update" button is Item Piles' bug, not yours

The pile footer shows **Config Update** (floppy-disk icon) to *players*. It is the `Take All`
button rendered with the wrong i18n key (`Applications.ItemPileConfig.Update` instead of
`Inspect.TakeAll`) in item-piles 3.3.4. Clicking it as a player re-saves the pile config; it does
**not** take everything, and it did **not** damage the eye images when tested. Harmless, confusing,
leave it.

### ⚠ Attunement is corrupted by Item Piles — already patched

Item Piles nulls `system.attunement` on every item it puts on an actor, and dnd5e 5.3.3 stores that
null as the literal string `"NaN"`. A looted Cloak of Displacement stopped declaring that it needs
attunement; a looted Potion of Healing grew an attunement control it should not have. Plain
`createEmbeddedDocuments` is unaffected, so it is item-piles, not the build script.

Reproduce:

```js
await game.itempiles.API.addItems(actor, [{ item: someItemData, quantity: 1 }]);
actor.items.find(i => i.name === "Cloak of Displacement")._source.system.attunement;  // "NaN"
```

**Patched in `foundry/module/pentaryn-dropbin/dropbin.mjs`** — a `preCreateItem` hook that repairs
`null`/`"NaN"` from a name lookup against the equipment compendium indexes, loaded once at ready.
Verified end to end through a real player loot. The repair runs on whichever client *creates* the
document, which for player looting is the **GM's** client — so after editing that module, the GM
browser must reload too, not just the player's.

Two things to know about that module:

- It is **not** wired into a `make` target. Edit `foundry/module/pentaryn-dropbin/` in the repo,
  then `cp` the changed files to `$FOUNDRY_DATA/Data/modules/pentaryn-dropbin/` by hand.
- Its manifest said `"socket": false` while the code called `socketlib.registerModule`, so
  socketlib refused and `socketlib.ready` threw on every load. Fixed to `true` in the repo and in
  the installed copy — but **module manifests are read at world launch**, so it needs a world
  restart (return to setup and relaunch), not just an F5.

### ⚠ Locking a container — and the two holes that had to be patched

Set `locked: true` in a container's item-piles flags and Item Piles 3.3.4 enforces it in exactly
one place: the canvas double-click. Everything else walks straight past it.

| Path | Item Piles alone | After the patch |
|---|---|---|
| Double-click the token | Refuses — but silently. `rattleItemPile` plays `lockedSound`, which is unset by default, and prints nothing. A dead-looking token. | Refuses, plays `sounds/lock.wav`, red **Locked** floats over the token, banner reads "<name> is locked." |
| Click the actor in the **Actors sidebar** | **Opens completely** — items, coin, working Take buttons. `preRenderActorSheet` calls `renderItemPileInterface` and never checks `locked`. | Refused with the same sound and hint. |
| **Ctrl-click** the token | **Opens the raw dnd5e actor sheet**, loot on its Inventory tab. Item Piles' `force-open-item-pile-inventory` keybind is Left Ctrl by default and makes the module stand aside completely, so no interface is rendered and no interface hook fires. | Refused with the same sound and hint. |
| `game.itempiles.API.renderItemPileInterface(...)` | Same bypass as the sidebar. | Same refusal. |

The patch lives in `foundry/module/pentaryn-dropbin/dropbin.mjs` and needs **two** hooks, because
the Ctrl-click route never renders an interface at all:

- **`item-piles-preRenderInterface`** — the choke point the canvas click, the sidebar and the API
  all funnel through. Returning `false` cancels the render.
- **`item-piles-preRenderActorSheet`** — fires before item-piles decides whether to intercept, and
  fires for ApplicationV2 sheets and for the `bypassItemPiles` route alike. Returning `false`
  suppresses the sheet itself, which is what closes Ctrl-click.

GMs are exempt from both. `item-piles-preRattleItemPile` adds the words to the canvas path (use
`preRattle`, not `rattle` — item-piles broadcasts `rattle` to every client, so the notification
would pop up for the whole table).

**A player client only reads a module's `.mjs` at page load.** After editing the module, every
open browser — the GM's and each player's — has to be refreshed, or it keeps running the old code
and the chest keeps opening. That is the first thing to check when a patch "didn't work".

Every container in the world now carries `lockedSound: "sounds/lock.wav"` (Foundry core ships it),
backfilled on GM load, so locking one later is a single flag and not a hunt for why it is silent.
**Browsers gate audio until the first real user gesture**, so the very first rattle of a session
can be silent if nobody has clicked anything yet — the text hint always shows.

### ⚠ Pile actors are listed in the players' sidebar

Item Piles cannot render a pile a player has no permission on, so every hotspot actor sits at
`default: OBSERVER` — which puts `Hidden Cache`, `Ozmandius's Chest` and every other container into
the players' **Actors sidebar, by name**. There is no ownership level that keeps the module working
and the row hidden. The same is true of a readable's journal: `The Binding Words` was sitting in the
Journal sidebar where the incantation could be read without ever finding the plaque.

Both are now filtered out at render time for non-GMs, in the same module:

- `renderActorDirectory` — drops any actor with `flags.item-piles.data.enabled`.
- `renderJournalDirectory` — drops any journal that is the target of a scene **Note**. A genuine
  handout has no pin, so it stays visible; a readable behind an eye is found by looking at the eye.

Register those hooks at **module load, not in `ready`** — the sidebar paints before `ready` fires
and a hook added afterwards misses the first render. The module also forces one `ui.actors.render()`
at ready as a belt-and-braces.

---

## Readables — a hotspot that is only a description

For "3 is just a description" — no loot, just prose the players can open, read, drag around and
close. **Do not** use an empty Item Piles container for this; use a **Journal Entry plus a scene
Note pin wearing the same eye icon.** It is native, it needs no module, and the window is already
draggable, resizable and closeable.

```js
const OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const m   = scene.tokens.find(t => t.name === "Marker · 6");
const g   = scene.grid.size;
const centre = { x: m.x + (m.width * g) / 2, y: m.y + (m.height * g) / 2 };

const je = await JournalEntry.create({
  name: "The Scrying Orb",
  folder: JOURNAL_FOLDER_ID,
  ownership: { default: OBS },                       // ← without this the pin is inert for players
  pages: [{ name: "The Scrying Orb", type: "text",
            title: { show: false, level: 1 },        // the page's own H1 would duplicate the heading
            text: { format: 1, content: HTML } }] });

await scene.createEmbeddedDocuments("Note", [{
  entryId: je.id, pageId: je.pages.contents[0].id,
  x: Math.round(centre.x), y: Math.round(centre.y),  // ← Notes are centred on x/y, tokens are not
  texture: { src: "assets/tokens/custom/props/icon-eye.webp" },
  iconSize: 64,                                      // 64 ≈ a 0.5 token on a 140px grid
  text: "Scrying Orb",                               // label under the pin; players see it
  fontSize: 24, textAnchor: CONST.TEXT_ANCHOR_POINTS.BOTTOM,
  global: false }]);                               // in-view rule: see below

await scene.deleteEmbeddedDocuments("Token", [m.id]);
```

Then verify the same way as a token — `canvas.notes.placeables.map(n => n.visible)`.

### Rules that make it work

- **`ownership: { default: OBSERVER }` on the JournalEntry.** This is the whole ballgame. Without
  it the pin renders and hovers but clicking does nothing, and it looks like a broken pin.
- **A Note's `x`/`y` is its centre**, unlike a Token's top-left. So a Note goes on the marker's
  centre point directly — no half-size subtraction.
- **`global: false`, always (Joe's rule, 2026-10-07): an eye is seen, and used, only when it is in a
  player's view.** A global pin shows and opens through walls from anywhere, so a player read the
  letter from across the prison. Non-global pins show only while their centre is in the player's
  current vision. pentaryn-dropbin's GM backfill flips any global readable pin to `false` at ready.
- **Pile tokens never have sight.** Players are OBSERVER on piles, and a player with no token
  selected sees through every observed token. A pile with `sight.enabled` lit its own room and showed
  every eye on the map. The same backfill turns sight off on pile actors and tokens, and corpses
  drop sight while they are lootable. Range stays unlimited, so whatever is in view can be opened.
- **No light, no eyes.** In a scene with darkness 1 and no lights, a token without darkvision sees
  nothing, so it sees no eyes either.
  - **Keep the pin well inside the light.** A Note counts as in view when a point within
    `iconSize/4` of its centre is seen. A pin at 153 px from a 150 px light showed only by that
    tolerance. Move it ~15 px inward.
  - **Once explored, a pin stays shown** (`canvas.fog.isPointExplored`), even if the light later
    shrinks away from it.
  - **A vision range of 0 still sees lit areas** in line of sight. That's how a PC across the
    corridor sees another PC's glow. Light on a PC is item-driven: see `pentaryn-senses`.
- **A per-player readable** (only one player sees the pin) uses `ownership: { default: NONE, <userId>: OBSERVER }`.
  v14 `Note#isVisible` tests LIMITED on the page and then on the entry, so the other players get no
  pin at all. The GM still sees every pin. Example: the Pentaryn "how you got here" eyes.
- **Players open it with a double-click**, the same gesture as a hotspot — so the two kinds of eye
  behave identically at the table, which is the point of using one icon for both.
- **GM-only text goes in `<section class="secret">…</section>`.** Verified: the player sees the
  prose and not the section; the GM sees both. This is how the DC and the "what happens on a
  failure" ruling ride along inside the same document the players are reading.
- **The window title is `<folder name>: <entry name>`**, and players see it. Name the journal folder
  something in-fiction (`The Wizard's Tower`), not `SJ 08 — The Parley (Readables)`.
- **Players keep a readable with the "Add to my journal" bar** (`pentaryn-journal`, see its
  [README](../../foundry/module/pentaryn-journal/README.md)). The bar also appears on items opened
  from an eye pile.
  - The copy lands in `Player Journals/<name>'s Journal`, with secrets and embeds stripped.
  - Provenance shows the scene's **navName** if set, otherwise this journal's folder name, plus the
    pin's label. Set a player-facing navName if you want the place named. `scene.name` is never shown.

### A hidden thing on a marker

Same contract, one extra step: `getTokenDocument()` does **not** carry `prototypeToken.hidden`
through to the placed token. Set it explicitly afterwards or the ambush is standing in plain sight.

```js
const [tok] = await scene.createEmbeddedDocuments("Token", [td.toObject()]);
await tok.update({ hidden: true });            // ← prototype hidden does NOT survive placement
```

Check it from a **player** client with `tok.isVisible`, never `tok.visible` — the PIXI `visible`
flag is stale until the vision refresh lands and will happily report `true` for a hidden token.

---

## Ping log — the other way

`pentaryn-pings` records canvas pings to the database, so a spot Joe pinged can be read back:

```js
game.pentaryn.pings.last()      // most recent — canvas x/y, image x/y, grid square, scene, who
game.pentaryn.pings.recent(10)
```

It captures pings on scenes the GM is not currently viewing too. Markers remain the default —
they are visible, nameable, and survive a reload — but a ping is quicker for a one-off "here".

---

## Who checks for Markers and crowd

Three modules decide "is this token scaffolding?" and each asks a different question on purpose
(finding aoe-movement-portals-38). Change one only after reading the other two.

| Module · function | Treats as scaffolding | Crowd actors | Why it differs |
|---|---|---|---|
| `pentaryn-portals/portals-core.mjs` `isScenery` | a name containing `(crowd)` or starting `Marker` + optional space + `·`; or a folder starting `Crowd`, `Markers` or `Temp Markers` (any case) | scenery — never carried in a party teleport | must never pull a prop or a crowd token along with the party |
| `pentaryn-prompts/scene-adapter.mjs` `isScaffold` | an actor named `Marker · ` (the space is required); or a folder chain reaching `Temp Markers` / `Markers…` (any case) before the module's own `Prompt Markers` folder | **context** — gather lists them | a gather describes the scene; crowd tokens are part of it |
| `pentaryn-aoe/core.mjs` `isCreature` | no name or folder rule: an area handle, a pile, or anything that is not a `character`/`npc` with max HP above 0 | caught like any creature with HP | an area hits what has hit points; a marker actor has none |

## Also see

- [`README.md`](README.md) — the Foundry domain root
- `foundry/module/pentaryn-pings/` — the ping recorder
- `foundry/module/pentaryn-dropbin/` — the ledger of everything that leaves a character sheet, and
  (since 2026-08-17) three Item Piles patches: the attunement repair, container lock enforcement,
  and the sidebar filters that keep piles and pinned readables out of the players' directories
