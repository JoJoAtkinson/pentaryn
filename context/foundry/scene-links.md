---
title: "Foundry scene links — native Region teleports"
created: 2026-08-18
last_modified: 2026-08-18
status: active
tags: [context, foundry, regions, teleport, scenes, stairs]
---

# Foundry scene links — native Region teleports

**Read this when:** building "the party goes upstairs", "through the trapdoor", "down the well" — any move between scenes.
**Not this file:** placing something at a named spot → [`markers.md`](markers.md)

**Read this before building "the party goes upstairs", "through the trapdoor", "down the well".**
Everything here is **core Foundry v14**. No module. The mechanism is a **Region** with a
**Teleport Token** behavior, and it moves the *token*, which is the thing that matters.

Verified against Foundry **v14.365** source (`client/data/region-behaviors/teleport-token.mjs`,
`client/documents/region.mjs`, `common/documents/region.mjs`) **and exercised end to end in the live
`ardenhaven` world on 2026-08-18** — Kyle, logged in as a player, walked Pip Locksley into a region
on the Scene 5 ground floor, got the confirmation dialog, and was moved with his token to the second
floor. See [Gotchas](#gotchas).

---

## Pick the right behavior

| Want | Behavior | Scope |
|---|---|---|
| Move between **floors of one scene** (Levels) | `changeLevel` | Same scene document |
| Move to a **different scene**, or a different level | `teleportToken` | Cross-scene **and** cross-level |
| Just move somebody's *camera*, not their token | Monk's Active Tiles `scene` action | Module. Not this doc. |

The Spider's Tear Opera House already uses `changeLevel` — regions `Stairs` and `Ladder` on
scene `wXQv4IXwvidPTB5P`. That is the same-scene sibling of what follows.

**`teleportToken` is the one to reach for** when the two floors are *separate scene documents*,
which is how this world builds the Dragonsfall (`500` ground / `510` second floor) and the
Hanged Men (town / roof).

---

## Anatomy

Two documents, both embedded in the Scene:

1. **Region** — a named shape on the map. Its `behaviors` collection holds…
2. **RegionBehavior** of `type: "teleportToken"`, whose `system.destinations` is a **Set of Region
   UUIDs**. Those destinations may live in **any** scene.

A working link is therefore **two regions**, one on each scene, each naming the other. There is no
single "portal pair" document — you build both halves and cross-reference them.

Region UUID format: `Scene.<sceneId>.Region.<regionId>`.

---

## The build, marker-driven

Same contract as [`foundry-markers.md`](markers.md): drop a `Marker · 1` on the stair
landing in each scene, then let the script read the coordinates. Markers are consumed at the end.

```js
// Two scenes, one stair link. Drop Marker · 1 on the landing in each first.
const A = game.scenes.get("SCENE_A_ID");     // e.g. ground floor
const B = game.scenes.get("SCENE_B_ID");     // e.g. second floor

// Region rectangle centred on the marker, N grid squares across.
const rect = (scene, markerName, squares = 1) => {
  const m = scene.tokens.find(t => t.name === markerName);
  const g = scene.grid.size;
  const cx = m.x + (m.width  * g) / 2;       // marker centre — tokens are top-left anchored
  const cy = m.y + (m.height * g) / 2;
  const side = squares * g;
  return { marker: m, shape: {
    type: "rectangle",
    x: Math.round(cx - side / 2), y: Math.round(cy - side / 2),
    width: side, height: side, hole: false, rotation: 0
  }};
};

const a = rect(A, "Marker · 1");
const b = rect(B, "Marker · 1");

const mk = (scene, shape, name, colour) => scene.createEmbeddedDocuments("Region", [{
  name, color: colour, shapes: [shape],
  visibility: CONST.REGION_VISIBILITY.LAYER_UNLOCKED,   // 4 — GM sees it on the Regions layer only
  behaviors: [{
    name: "Teleport",
    type: "teleportToken",
    system: {
      destinations: [],          // filled in on the second pass, once both ids exist
      placement: "center",
      snap: true,
      choice: true,              // confirmation dialog — see Gotchas
      revealed: true,
      dialog: { revealed: null, unrevealed: null },
      transition: { type: "fade", duration: 1500 }
    }
  }]
}]);

const [rA] = await mk(A, a.shape, "Stairs ↑ 2nd Floor", "#4d94ff");
const [rB] = await mk(B, b.shape, "Stairs ↓ Ground Floor", "#4d94ff");

// Cross-reference. destinations is a Set of Region UUIDs.
await rA.behaviors.contents[0].update({ "system.destinations": [rB.uuid] });
await rB.behaviors.contents[0].update({ "system.destinations": [rA.uuid] });

// Consume the markers.
await A.deleteEmbeddedDocuments("Token", [a.marker.id]);
await B.deleteEmbeddedDocuments("Token", [b.marker.id]);

return { a: rA.uuid, b: rB.uuid };
```

Verify the same way as anything else on the canvas — read the documents back, don't trust
`_source`:

```js
game.scenes.get("SCENE_A_ID").regions.map(r => ({
  name: r.name,
  dest: [...r.behaviors.contents[0].system.destinations]
}));
```

---

## The indicator — every link gets a sign

A Region is invisible to players by design, so a scene link with nothing on it is a trapdoor: the
party only finds it by walking over the right square. **Every link gets a travel glyph**, laid down
as a **Tile**, so the map says "you can leave from here" without anyone having to be told.

**Tile, not Token**, for three reasons:

- Tiles render **below** the token layer, so a PC standing on the stair covers the mark instead of
  fighting it. Non-dominating by construction.
- Tiles have free `rotation`. Tokens do not — this world sets `lockRotation: true` everywhere — so
  one directional asset serves stairs up, stairs down, and a street heading off-map.
- Tiles have an `alpha` field, so the subtlety is dialled at the table without re-exporting art.

### The art

Generated by [`scripts/foundry/travel_glyph.py`](../../scripts/foundry/travel_glyph.py) into
`assets/tokens/custom/props/`. Six files — two shapes × three colours:

| File | Shape | Use |
|---|---|---|
| `travel-chevron.webp` | double chevron, leading bright / trailing faint | **The default.** Directional: stairs, doors, a street mouth. |
| `travel-ring.webp` | soft annulus with a centre dot | Non-directional: a cave mouth, a scene edge, anywhere facing is meaningless. |
| `…-cyan.webp` | | Arcane only — a real portal, a summoning circle. On a plain wooden stair it reads as magic and lies. |
| `…-gold.webp` | | Matches the PC ring tier, but **blends into sconce light** on the warm-lit Seafoot interiors. Rarely the right pick. |

These are in the `interact-glint` register — feathered, no hard outline — not the `icon-eye` one. A
bold outlined badge reads as UI sitting *on* the art; these sit *in* it.

**`alpha: 0.45` is the tested value.** Composited against the real Dragonsfall stair art: `0.30`
disappears into the wood, `0.65` shouts. Start at `0.45` and only move it for an unusually light or
dark map.

### Placing one

Fold this onto the end of the link build above — it reads the region's own rectangle, so the sign
and the trigger can never disagree about where the link is.

```js
const SRC = "assets/tokens/custom/props/travel-chevron.webp";

const sign = async (scene, region, rotation) => {
  const sh = region.shapes[0];                 // the rectangle the link already uses
  const [tile] = await scene.createEmbeddedDocuments("Tile", [{
    texture: { src: SRC },
    x: sh.x, y: sh.y, width: sh.width, height: sh.height,
    rotation,                                  // point it the way the party walks
    alpha: 0.45,
    elevation: 0,        // ground tile -> beneath tokens
    sort: 0,
    hidden: false,       // players are meant to see this; that is the entire point
    flags: { pentaryn: { travel: { regionId: region.id, regionUuid: region.uuid } } },
  }]);
  return tile;
};

await sign(A, rA, 0);      // ascending is northward here
await sign(B, rB, 180);    // the shaft exits south
```

**`rotation` is the whole vocabulary.** `0` points up-screen; add 90 per quarter turn. Point it the
direction the party *walks*, not the direction the fiction calls "up" — on a top-down map those are
unrelated.

⚠️ **`flags.pentaryn` cannot be read with `getFlag`.** Foundry validates flag scopes against
registered module ids, and `pentaryn` is not one — the modules are `pentaryn-dropbin`,
`pentaryn-ties`, `pentaryn-walls`. The flag is written and persisted fine by
`createEmbeddedDocuments`; only the accessor is fussy. Read it as `tile.flags?.pentaryn?.travel`.

### The tile does not follow the region

They are two documents. Dragging the tile moves the sign and leaves the trigger behind, which is a
silent way to make a link the party can see and cannot use. Move both, or re-run `sign()` after
moving the region and delete the old tile. If this bites more than once, a `updateTile` hook keyed
on that flag would keep them married.

## Behavior fields

`system.*` on the `teleportToken` behavior:

| Field | Values | Notes |
|---|---|---|
| `destinations` | Set of Region UUIDs | More than one → picked at **random**, unless `choice`, which turns them into a menu. Use this for a well with three exits. |
| `placement` | `random` · `center` · `relative` | `center` for a one-square landing. **`relative`** preserves the token's fractional offset inside the region bounds — the right pick for two landings of matching shape, so a party walking up abreast stays in formation. `random` scatters within the shape. |
| `snap` | bool, default `true` | Snap the arrival to the grid. |
| `choice` | bool, default `false` | Confirmation dialog before the move. **Turn this on for stairs** — otherwise a token that merely walks across the landing is yanked upstairs. Also registers a `TOKEN_EXIT` listener so backing off cancels the open dialog. |
| `revealed` | bool | Whether the dialog names the destination. `false` = "you feel a pull" without spoiling where. |
| `dialog.revealed` / `dialog.unrevealed` | string or `null` | Custom prompt text for each case. `null` = Foundry's default wording. |
| `transition.type` | `null` or one of: `fade` `swirl` `waterDrop` `morph` `crosshatch` `wind` `waves` `whiteNoise` `hologram` `hole` `holeSwirl` `glitch` `dots` | `null` = instant cut. |
| `transition.duration` | ms, 500–10000, default `1500` | |

## Region fields worth setting

| Field | Notes |
|---|---|
| `visibility` | `LAYER_UNLOCKED` (4, default) = drawn only while the Regions layer is active and unlocked. `LAYER` (0), `GAMEMASTER` (1), `OBSERVER` (3), `ALWAYS` (2). Players should normally see **nothing** — the map art shows the stairs. |
| `hidden` | **This is the on/off switch.** `hidden: true` disables the region: no behavior events fire at all. Use it to keep the upstairs sealed until Scene 5. |
| `locked` | Stops accidental drag-editing on the canvas. Worth setting once a link is final. |
| `elevation.bottom` / `.top` | Null = ±Infinity. Only matters if you use flying/elevation. |
| `levels` | Only set on scenes that have multiple Levels (the Opera House does). Omit on single-level scenes. |
| `color` | Cosmetic, GM-only. Pick one colour for all stair links so they read at a glance. |
| `shapes` | Array. `rectangle` (x, y, width, height, rotation) · `circle` · `ellipse` · `polygon` (flat `points` array). `hole: true` subtracts. Multiple shapes = one region, as the Opera House `Stairs` does with three polygons. |

Coordinates are **canvas** coordinates, not image pixels — they include scene padding. On the
Scene 5 pair (`4500×3000`, grid `150`, padding `0.25`) the map's top-left sits at
`sceneX 1200, sceneY 750`. Same trap as tokens; see `foundry-markers.md`.

**Grid-align the rectangle.** Region shapes accept any coordinates, but a stair landing should line
up with a grid square or a token can never sit squarely in it. Legal origins are
`sceneX + 150k` and `sceneY + 150k` — on Scene 5 that is x ∈ {1200, 1350, …} and
y ∈ {750, 900, …}. `y: 1450` looks fine and is 100px off.

---

## Check the floor is walkable first

These Seafoot maps are walled by the autocomplete pass, and **the walls trace furniture** — beds,
tables, bunks — not just rooms. A square that looks like open floor is often a sealed box. Test
before you place, rather than discovering it at the table:

```js
const A = game.scenes.get(SCENE_ID);
const G = 150, X0 = A.dimensions.sceneX, Y0 = A.dimensions.sceneY;
const COLS = Math.round(A.width/G), ROWS = Math.round(A.height/G);
const walls = A.walls.filter(w => w.move > 0 && !w.door).map(w => w.c);
const ccw = (a,b,c) => (c[1]-a[1])*(b[0]-a[0]) > (b[1]-a[1])*(c[0]-a[0]);
const cross = (p1,p2,p3,p4) => (ccw(p1,p3,p4) !== ccw(p2,p3,p4)) && (ccw(p1,p2,p3) !== ccw(p1,p2,p4));
const centre = (i,j) => [X0 + i*G + G/2, Y0 + j*G + G/2];
const blocked = (a,b) => walls.some(c => cross(a, b, [c[0],c[1]], [c[2],c[3]]));

// flood fill 4-way, label every square with a component id, then compare ids
```

**Compare component ids — never "is it in the biggest component".** The largest component on any of
these maps is the **outdoor street**, which the building interior does not connect to except through
the front door. On the Dragonsfall second floor the largest component is the street and the whole
upstairs interior is a *different* component; reading that as "the stairwell is unreachable" is
wrong. Label the squares, then ask whether your token's square and your region's square share an id.

Run over Scene 5 this shows four tokens in sealed pockets — see
[What is actually built](#what-is-actually-built).

---

## Gotchas

- **Only `TOKEN_MOVE_IN` fires it.** The token has to *move* into the shape. A token created
  there, or teleported in, does not trigger — the arrival is stamped
  `action: "displace"` and the behavior returns early. That is what stops a paired link from
  ping-ponging forever. Don't "fix" it.
- **Dragging a token in as GM counts as movement.** Your own scene-dressing drags will fire the
  teleport. Set `hidden: true` on the region while building, or expect surprises.
- **Cross-scene needs `TOKEN_CREATE` + `TOKEN_DELETE`.** A cross-scene teleport *deletes* the
  token on the old scene and *creates* a new one on the new scene. Players do not have those
  permissions by default, so the work is delegated to an **active GM client**. In practice:
  **a GM must be logged in** for player-triggered stairs to work. Same-scene teleports have no
  such requirement.
- **The token document is destroyed and rebuilt, but the id survives.** Cross-scene teleport
  deletes the TokenDocument on the old scene and creates one on the new — and Foundry v14 **keeps
  the same `_id`** (ids only need to be unique per scene). Verified 2026-08-18: Pip Locksley kept
  `EESlEHllaQu6jAat` across the move, and her flags came with her. So `pentaryn-ties` possession
  marks at `token.flags["pentaryn-ties"].worn` **do** survive. What does not survive is anything
  keyed to *scene + id*, and `_stats` is rebuilt. **`rotation` is rewritten** to the direction of
  travel even though this world sets `lockRotation: true` — Pip arrived at 163.5° having left at
  62.7°. Restore it if a token's facing matters.
  See [`context/plans/foundry-npc-ties.md`](../plans/foundry-npc-ties.md).
- **The user gets pulled along, and so do bystanders.** Foundry pulls the moving user to the
  destination scene, plus any active non-GM who was watching the same scene, observes that token,
  and no longer owns a visible token with vision back on the old scene. So moving the *last* PC
  upstairs drags the whole table upstairs. Moving one of two PCs leaves the other's player behind —
  the party is genuinely split across two scenes, and **you as GM only render one at a time**.
- **Combat is per-scene.** The tracker follows the *viewed* scene. A split party across two scenes
  is two combats. Plan around it or don't split during a fight.
- **Scene ownership.** Every scene in this world is `ownership.default = 0` (NONE) and Scene's
  `permissions.view` is `LIMITED`. `Scene#view()` itself has **no permission gate**, and the nav
  bar always shows the scene a user is currently viewing (`active || isView || …`), so a pulled
  player can always click back. If a link nonetheless does nothing for a player, set the
  destination's default ownership to `LIMITED` and leave `navigation: false` — reachable by
  teleport, still off their nav bar.
- **Regions are not walls.** A region does not block anything unless you set
  `restriction.enabled`. Stairs still need real walls around them.

---

## What is actually built

Built and tested 2026-08-18. One live link, two regions:

| Scene | ID | Region | Square (canvas) |
|---|---|---|---|
| Dragonsfall Tavern Night (The Quiet Night) — ground, nav 500 | `1yLNc6k8D9oMRAL6` | `Stairs ↑ 2nd Floor` — `jBQBIOjdp3c1Bdcc` | `4800, 2850` |
| Dragonsfall Tavern 2nd Floor Night (The Quiet Night) — nav 510 | `QpdCNgmONNaqUyY4` | `Stairs ↓ Ground Floor` — `vj3CSw84Ri0UUrmR` | `2400, 1650` |

Both `choice: true`, `placement: center`, `fade` transition, visible only on the Regions layer,
**not** `hidden` — they are live right now.

Both ends now carry a **travel chevron tile** at `alpha: 0.45` sized to the region square —
`lIqW3zEO8zVbhxir` on the ground floor (rotation 0), `94vFzFmmPLeGSgmW` upstairs (rotation 180).
See [The indicator](#the-indicator--every-link-gets-a-sign).

Other scenes worth knowing: Scene 4's second floor is `vTcX7LcWsO8hp46A`; the Opera House with its
`changeLevel` regions is `wXQv4IXwvidPTB5P`.

Both ends now sit on staircases the art actually draws.

### The Dragonsfall's three flights

| Flight | Floor | Canvas | Reads as |
|---|---|---|---|
| **A** — stone, dark, unlit, L-shaped, behind the storeroom | ground | run x 3450–4050 y 1950–2100, turning north at x 3900–4050 y 1800–1950 | service stair **down to a cellar** |
| **B** — wooden, lit by a sconce, against the east exterior wall off the taproom | ground | x 4800–4950, y ≈ 2950–3450 | the public stair **up** — this is the one in use |
| **C** — wooden shaft, exits south through a door | 2nd floor | x 2400–2550, y 1200–1800 | the same stair, drawn in a different place |

**B and C do not line up**, and neither does A. Seafoot drew each storey independently, so no
ground-floor flight sits under the second floor's. It does not matter at the table — players never
see two scenes at the same coordinates — but do not go looking for an alignment that exists.

### There is no Dragonsfall cellar art

The module ships tavern (day/night), 2nd floor (day/night) and roof (day/night) for the Dragonsfall
— **no basement**. If flight A should lead somewhere, the library has ~30 generic basements
(`basement-150-dpi-vtt.jpg` is the plain one, plus `dragon-lords-basement`, `seaside-keep-basement`,
`necromancers-basement`, …). Same fiction cost as the stair mismatch.

### Four tokens are walled in

The autocomplete pass traced bed frames and furniture as solid walls. On the Scene 5 ground floor
these tokens sit in pockets that do **not** connect to the taproom, so they cannot move at all:

| Token | Cell | Pocket size |
|---|---|---|
| **Fenna** — Oz's host for the scene | `[18,11]` | **1 square** |
| Harl Wetherby (unconscious) | `[18,15]` | 2 squares |
| **Ballad Quinn** | `[10,8]` | 2 squares |
| **Pip Locksley** | `[8,8]` | 2 squares |

The other nine tokens and both ground-floor staircases share one 406-square area. Fix the walls
before running Scene 5 — as it stands neither PC can leave their bunk and Oz's host cannot cross
the room. The second floor is fine: its stairwell and all three lodgers share one 167-square area.

---

## Also see

- [`foundry-markers.md`](markers.md) — markers, the centre-on-the-marker contract, canvas
  vs image coordinates, the eye hotspot icon.
- [`README.md`](README.md) — token conventions and the domain index; scene ids live in [`../space-journey.md`](../space-journey.md).
- The **non-native** alternative is Monk's Active Tiles (`monks-active-tiles`, installed and
  active). Its `scene` action changes a user's *view* only; its `teleport` action moves tokens
  cross-scene with a Delete Source option. Reach for it only when the move must be chained to
  other tile actions (a sound, a notification) on one click. Default to the native region.
