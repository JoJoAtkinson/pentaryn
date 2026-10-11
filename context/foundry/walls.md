---
title: Wall Autocomplete
status: active
last_modified: 2026-10-11
tags: [foundry, module, pentaryn-walls, maps, walls]
---

# Wall Autocomplete

**Read this when:** drawing walls for the autocomplete, running it on a scene, or deciding
whether to trust a run. **Not this file:** the module README
([`foundry/module/pentaryn-walls/README.md`](../../foundry/module/pentaryn-walls/README.md)) for
the API, data written and code structure; [`../plans/foundry-wall-autocomplete.md`](../plans/foundry-wall-autocomplete.md)
for the design, the rule table and the traces.

## At the table

Players see nothing: the walls simply exist. All of this is GM prep. The module is **disabled in
the pentaryn world**; enable it on a scratch world or a copy of a scene first.

## For the GM

Open the scene, then use the keys or the console:

| Key (macOS: Alt = ⌥) | Call | Does |
|---|---|---|
| **Alt + W** | `await game.pentaryn.walls.run()` | complete the walls |
| **Alt + Z** | `await game.pentaryn.walls.undo()` | undo the last run; press again to peel back the run before |
| **Alt + Shift + W** | `await game.pentaryn.walls.preview()` | report only, writes nothing |

The intended loop is **run, look, undo if you don't like it**. Preview is there but rarely
needed, because a run is cleanly reversible: every mutation is stamped with the run's timestamp,
so undo removes exactly the last run — the walls it created, plus the original length of any wall
it trimmed or welded. `undo({all: true})` removes everything the module ever did to the scene.

Each action whispers a GM chat summary — created / moved / passes, component state, lint hits,
and every refusal with its coordinates and reason — logs the pass-by-pass mutation table to the
console, and pings each refused endpoint. Only one action runs at a time: a second key press,
macro click or API call while one is running is refused with a warning, not queued.

`await game.pentaryn.walls.makeMacro("run")` puts a clickable button on the hotbar (also
`"preview"` / `"undo"`, and an optional slot). Options: `{sceneId}` targets a scene other than the
open one; any tolerance can be overridden for one run (`gapMax`, `cornerMax`, `extMax`, `weldEps`,
`collEps`, `glanceSin`, `trim: false`).

### Two authoring styles

| | **Overshoot → trim** | **Undershoot → extend** |
| --- | --- | --- |
| You draw | long lines poking *past* everything | short hints stopping *short* of everything |
| Engine does | cuts each back to its outermost crossings | grows each until it meets something |
| Six-room floorplan | **7 lines → whole building, 1 pass, 0 refusals** | 15 hints → 29 walls, 13 passes |

For dense interiors, overshoot-and-trim is far less work. Use hints when you want the engine to
*find* a corner whose position you haven't decided, and for irregular outer shells.

### Order of operations — build inside-out

Nesting needs no special handling; it falls out of *closed ⇒ inert*.

1. Hint the innermost object. Run.
2. **Check the report says closed.** This is the gate.
3. Hint the next layer out. Run. The closed layer is ignored and never mutated, while still
   blocking rays.
4. Repeat outward — verified to three levels, and with several separate inner objects.
5. Connect inner to outer last, by hand: draw one stub off the inner and the engine runs it to
   the outer wall.

Step 2 matters. An inner object that has *not* closed is still live, and its loose ends will pair
with the outer's and bridge the two.

### What to draw

- **One informative segment per wall line.** Not per side of a rectangle — per distinct line the
  finished building has a wall on. A bare side needs a hint stub. An **L-shaped** building needs
  six segments, not four; a **cave** is eight irregular segments with a gap at each vertex; a
  **round tower** is chords that mitre up at the circumscribed vertices.
- **Or draw long crossing lines and let it trim.** Four overlapping lines with every end hanging
  in space become an exact rectangle. Trim only fires on genuine crossings, never removes more
  than half a wall, and never touches a door. `{trim: false}` disables it.
- **Deliberate openings get a door or window segment.** An empty gap is indistinguishable from a
  missing wall, so an unmarked gap under `gapMax` gets filled — unless two loose ends aim into it,
  which is how a passage mouth is recognised.
- **To stop a wall somewhere, give it something to stop against.** Walls never dead-end; they
  grow along their own line until they hit something. Put a hint closer than the extension you
  don't want — the engine always adds the least wall it can.
- **Never leave a wall end dangling exactly at a passage corner.** Touch the corner, or stop one
  grid step short so the corner is inferable.
- **A closed building is inert.** It generates nothing on later runs but still blocks rays. To
  re-open it, nudge or delete one of its walls. **Complete one structure per run**: two
  half-hinted structures in the same run will trade endpoints.
- **Every wall type keeps itself — except doors and windows.** Terrain extends as terrain,
  invisible as invisible, ethereal as ethereal; the run around a door or window is inferred
  **solid**. Where one wall must bridge two kinds, the most-blocking wins:
  `solid > terrain > invisible > ethereal > blank`.
- **Double-line (thick) walls are first-class** — trace both lines with corner gaps. A doorway
  through one needs a door segment in *each* line, or jamb caps.
- **Give every room at least one hinted corner.** A lone floating hint grafts onto whatever its
  carrier reaches.
- **Stay a few px clear of a tolerance boundary.** A gap of exactly `gapMax` flips on a 1px
  nudge. Every refusal names its number.
- **Levels:** walls on different Levels never interact, and created walls keep their level (both
  engines; the compiled one hands Levels scenes to the JavaScript engine).
- **Keep a wall open on purpose:** set `flags.wall-autocomplete.keepOpen: true` on it.

### Why it is safe on a hand-drawn scene

- **Nothing is written until the fixed point is reached.** The whole loop runs in memory; a
  tripped assertion costs nothing.
- **It never splits an existing wall.** Generated walls pin to a wall's mid-span instead. Your
  walls are only ever touched by a sub-weld-tolerance endpoint nudge or a trim, and the original
  is stashed in `priorC` for undo.
- **Re-running is a no-op, and output does not depend on draw order.** Both verified by fixture.
- **It never reads door state.** An open door is transparent to Foundry's collision API, so
  consulting it would make results depend on whether someone left a door open.

## Settings that matter

| Setting | Default | When to change it |
|---|---|---|
| Engine backend | Automatic | Rarely. `JavaScript` to rule the compiled engine out while debugging; the geometry is identical either way. |

The compiled (WASM) engine is a Rust port, about 12x faster; a missing or unloadable `.wasm`
falls back to JavaScript, and the GM's ready line then says `(wasm unavailable: …)`.

| rooms | walls in | js | wasm |
|---|---|---|---|
| 10×10 | 400 | ~120 ms | ~11 ms |
| 14×14 | 784 | ~440 ms | ~40 ms |
| 20×20 | 1600 | ~1700 ms | ~140 ms |

Independent rooms settle in the same pass, so a 400-wall scene takes two passes. The real scenes
in `ardenhaven` are 8 and 61 walls. The per-pass work is quadratic in wall count; a compiled
engine moves the curve down by a constant factor, not its shape. Measure with
`make foundry-walls-bench [N=20]`.

## API quick calls

```js
game.pentaryn.walls.describe()                     // every method, its side effects, the flags it writes
await game.pentaryn.walls.analyze()                // the engine's answer, no chat/pings/writes
await game.pentaryn.walls.preview({gapMax: 15})    // wider gaps, this run only
await game.pentaryn.walls.undo({all: true})
```

## Known gaps

- The flags still live under `wall-autocomplete`, not the module id; the Wave 7 batch migrates
  them (and `keepOpen`) to `flags.pentaryn-walls` with a one-shot GM migration.
- Setting and keybinding labels are literal English until the same batch adds `lang/en.json`.
- The compiled engine does not reproduce the `rule` stamp, the create flags or the mutation log
  (geometry only); the JS engine stays the reference.
- Worth doing independently: run the engine in a Web Worker. It is already pure, so it drops in
  unchanged and keeps the canvas responsive on long runs.
- Rebuilding the `.wasm` (`make foundry-walls-wasm`) needs the Rust toolchain with the
  `wasm32-unknown-unknown` target. Float determinism matters: never build with fast-math or FMA
  contraction; the corpus catches a divergence.
