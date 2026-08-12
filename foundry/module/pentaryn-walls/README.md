---
created: 2026-08-11
last-modified: 2026-08-11
tags: ["#foundry", "#vtt", "#module", "#maps", "#walls"]
status: draft
---

# `pentaryn-walls`

Rough in the walls that carry information — windows, doors, one hint stub per bare wall line
— and let the engine infer the rest. Where it would have to guess, it refuses and tells you
which endpoint and why.

- **Design, rule table, traces:** [`playbooks/foundry-wall-autocomplete.md`](../../../playbooks/foundry-wall-autocomplete.md)
- **Target:** Foundry **v14.365**. System-agnostic — it only touches `Wall` documents.

One setting (engine backend), two hooks: `init` for keybindings and the setting, `ready` to
attach the API.

**The compiled engine is on by default.** *Game Settings → Wall Autocomplete → Engine
backend* toggles between Automatic / Compiled / JavaScript. Both produce identical geometry —
verified against the same 44 fixtures — so the setting only affects speed. A missing or
unloadable `.wasm` degrades to JavaScript automatically; every run reports which engine it
used and how long it took.

---

## Install

```bash
FOUNDRY_DATA=~/Library/Application\ Support/FoundryVTT/Data
rm -rf "$FOUNDRY_DATA/modules/pentaryn-walls"
cp -R foundry/module/pentaryn-walls "$FOUNDRY_DATA/modules/"
```

Enable **Pentaryn Wall Autocomplete** in *Game Settings → Manage Modules* and reload.

> Copy, not symlink (playbook D8) — so a stale copy in `Data/modules/` is a real failure
> mode. Re-copy after every change.

---

## Use

Open the scene, then from the console or a macro:

```js
await game.pentaryn.walls.preview();   // report only — writes nothing
await game.pentaryn.walls.run();       // commit
await game.pentaryn.walls.undo();      // delete everything it generated
```

**Start with `preview()`.** It produces the identical report and mutation list without
writing, because the engine reaches its fixed point in memory and only then commits. Run it
on a scene you care about before trusting `run()`.

All three whisper a GM chat summary — created / moved / passes, component state, lint hits,
and every refusal with its coordinates and reason — and log the full pass-by-pass mutation
table to the console. Refused endpoints get a transient `canvas.ping()`.

### Hotkeys

| Key | Action |
| --- | --- |
| **Alt + W** | preview — report only, writes nothing |
| **Alt + Shift + W** | run — commit |
| *(unbound)* | undo — deliberately has no default key, since it deletes walls |

Rebind them in *Game Settings → Configure Controls → Pentaryn Wall Autocomplete*. All three
are GM-only, and a second press while a run is in flight is refused rather than queued.

Prefer a clickable button? `await game.pentaryn.walls.makeMacro("run")` puts one on the
hotbar (also accepts `"preview"` / `"undo"`, and an optional slot number).

Options: `{sceneId}` to target a scene other than the open one, plus any tolerance override
(`gapMax`, `cornerMax`, `extMax`, `weldEps`, `collEps`, `glanceSin`).

```js
await game.pentaryn.walls.preview({gapMax: 15});   // wider gaps, one run only
```

### Two authoring styles

| | **Overshoot → trim** | **Undershoot → extend** |
| --- | --- | --- |
| You draw | long lines poking *past* everything | short hints stopping *short* of everything |
| Engine does | cuts each back to its outermost crossings | grows each until it meets something |
| Six-room floorplan | **7 lines → whole building, 1 pass, 0 refusals** | 15 hints → 29 walls, 13 passes |

For dense interiors, overshoot-and-trim is far less work. Use hints when you want the engine
to *find* a corner whose position you haven't decided, and for irregular outer shells.

### Order of operations — build inside-out

Nesting needs no special handling; it falls out of *closed ⇒ inert*.

1. Hint the innermost object. `run()`.
2. **Check the report says closed.** This is the gate.
3. Hint the next layer out. `run()`. The closed layer is ignored and never mutated, while
   still blocking rays.
4. Repeat outward — verified to three levels, and with several separate inner objects.
5. Connect inner to outer last, by hand: draw one stub off the inner and the engine runs it
   to the outer wall.

Step 2 matters. An inner object that has *not* closed is still live, and its loose ends will
pair with the outer's and bridge the two.

### What to draw

- **One informative segment per wall line.** Not per side of a rectangle — per distinct line
  the finished building has a wall on. A bare side needs a hint stub. This one rule covers
  every shape: an **L-shaped** building needs six segments, not four (concave corners are not
  a special case — corners are carrier intersections and never ask which way they turn); a
  **cave** is eight irregular segments with a gap at each vertex; a **round tower** is chords
  that mitre up at the circumscribed vertices.
- **Or draw long crossing lines and let it trim.** Four overlapping lines with every end
  hanging in space become an exact rectangle. Trim only fires on genuine crossings, never
  removes more than half a wall, and never touches a door. `{trim: false}` disables it.
- **Deliberate openings get a door or window segment.** An empty gap is indistinguishable
  from a missing wall, so an unmarked gap under `gapMax` gets filled.
- **To stop a wall somewhere, give it something to stop against.** Walls never dead-end;
  they grow along their own line until they hit something. Put a hint closer than the
  extension you don't want — the engine always adds the least wall it can.
- **Explain every intentional gap** with a door or window across it, or by drawing the side
  walls to its corners. A bare collinear gap under `gapMax` gets filled — unless two loose
  ends aim into it, which is how a passage mouth is recognised.
- **Never leave a wall end dangling exactly at a passage corner.** Touch the corner, or stop
  one grid step short so the corner is inferable.
- **A closed building is inert.** It generates nothing on later runs but still blocks rays.
  To re-open it, nudge or delete one of its walls.
- **Complete one structure per run.** That inertness *is* the isolation mechanism — two
  half-hinted structures in the same run will trade endpoints.
- **Every wall type keeps itself — except doors and windows.** Terrain extends as terrain,
  invisible as invisible, ethereal as ethereal. A door or window is an opening *within* a
  wall line, so the run around it is inferred **solid**. Where one wall must bridge two
  different kinds, the most-blocking wins: `solid > terrain > invisible > ethereal > blank`.
- **Double-line (thick) walls are first-class** — trace both lines with corner gaps. A doorway
  through one needs a door segment in *each* line, or jamb caps.
- **Give every room at least one hinted corner.** A lone floating hint grafts onto whatever
  its carrier reaches.
- **Stay a few px clear of a tolerance boundary.** A gap of exactly `gapMax` flips on a 1px
  nudge — that is what a threshold is. Every refusal names its number.

---

## Layout

| File | What it is |
| --- | --- |
| `wall-engine.mjs` | The engine. Pure geometry — no Foundry APIs, no globals, no I/O. |
| `pentaryn-walls.mjs` | Glue: read the scene, call the engine, commit in two batches, report. |
| `test/fixtures.mjs` | The corpus — the design doc's traces plus the adversarial cases. |
| `test/run.mjs` | Runner. No dependencies. `--backend=<name>` to validate another backend. |
| `test/bench.mjs` | Scaling curve across registered backends. |
| `backends.mjs` | Backend registry + `compare()`, the identity check. |

Because the engine is a pure function of the input coordinates, effectively all of it is
testable with Foundry not running:

```bash
node foundry/module/pentaryn-walls/test/run.mjs        # or `make foundry-walls-test`
node foundry/module/pentaryn-walls/test/run.mjs -v D1  # one fixture, with its mutation log
```

---

## Safety properties

These are the reasons to trust it on a scene you have drawn by hand:

- **Nothing is written until the fixed point is reached.** The whole loop runs on an
  in-memory clone. A tripped assertion costs you nothing.
- **It never splits an existing wall.** Generated walls pin to a wall's mid-span instead,
  which Foundry handles correctly. Your hand-drawn documents are only ever touched by a
  sub-weld-tolerance endpoint nudge, and that stashes the original in `priorC`.
- **Re-running is a no-op.** Verified by fixture, not just by argument.
- **Output does not depend on draw order.** Also verified by fixture, across three
  permutations.
- **Every generated wall is flagged** under `wall-autocomplete`, with the rule that made it
  and the endpoints it came from — which is what makes `undo()` exact.
- **It never reads door state.** An open door is transparent to Foundry's collision API, so
  consulting it would make results depend on whether someone left a door open.

## Compiled backend (side-by-side)

**Built and on by default.** `wall-engine.wasm` is a Rust port compiled to
`wasm32-unknown-unknown`, ~12x faster than the JS engine and passing all 44 fixtures.

    rooms   walls in   js       wasm
    10x10   400        106 ms   11 ms
    14x14   784        442 ms   38 ms
    20x20   1600       1680 ms  142 ms
    28x28   3136       6109 ms  531 ms

The split is by cost, not convenience: wasm owns the fixed-point loop and component
analysis; JS keeps lints and refusal *wording*, and only computes the latter when something
was actually refused. So a compiled run can never drift from the reference on the text you
read, and a clean run pays nothing for that guarantee.

Rebuild with `make foundry-walls-wasm` after changing `wasm/src/lib.rs`. **The JS engine
stays the reference** — change it first, then port.

What exists now:

```bash
make foundry-walls-bench          # scaling curve, all registered backends
make foundry-walls-bench N=20     # extend the sweep
node test/run.mjs --backend=js    # run all 44 fixtures against a named backend
```

`backends.mjs` holds the registry. A backend is `{name, run(walls, opts), available()}`
returning the same shape as `runEngine`. Registering one is the *only* change needed —
`compare()` will then diff it against the JS reference, the bench gains a column, and
`--backend=<name>` validates it against the whole corpus.

**The JS engine is the reference.** A compiled backend is correct exactly insofar as it
produces byte-identical creates, updates and refusals. `compare()` decides that
mechanically, so "is it the same?" is never a judgement call.

### Before building one, read the curve

| rooms | walls in | walls out | js |
| --- | --- | --- | --- |
| 5×5 | 100 | 300 | 18 ms |
| 8×8 | 256 | 768 | 69 ms |
| 10×10 | 400 | 1200 | 130 ms |
| 14×14 | 784 | 2352 | 459 ms |

The per-pass work is quadratic in wall count, so the column grows ~4× each time walls
double. **A compiled backend moves the column down by a constant factor; it does not change
that shape.** Cutting the *pair count* (spatial pruning of the O(dangling²) candidate scan,
which is 80% of the run) attacks the exponent instead, and stays in JS.

For reference, the real scenes in `ardenhaven` are 8 and 61 walls.

### If you do build one

Toolchain, whichever you prefer — neither is installed:

```bash
brew install emscripten                                    # C/C++ -> wasm
# or
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # then: rustup target add wasm32-unknown-unknown
```

**Watch float determinism.** This engine's whole value is that the same drawing always
yields the same walls. C/C++ compilers contract `a*b+c` into FMA and reorder float
expressions by default, and `-ffast-math` is worse — either can change a result in the last
bits, which is enough to flip a tolerance comparison. Build with `-ffp-contract=off` and no
fast-math. The 44 fixtures will catch a divergence, but expect to spend the time on flags.

**Not recommended: a C++ round-trip over HTTP/IPC.** It needs a server process alongside
Foundry and reintroduces a real bridge — the one cost this design currently doesn't pay.
WASM at least stays in-process.

**Worth doing independently of any of this:** run the engine in a Web Worker. It is already
pure — no Foundry globals, no I/O — so it drops in unchanged, and it keeps the canvas
responsive on long runs regardless of what language the engine is written in.

## Performance

Mutations that provably cannot affect one another are applied in the same pass, so
independent rooms settle in parallel rather than one per pass.

| Scene | Result |
| --- | --- |
| 36 walls (3×3 rooms) | 8 ms, 2 passes |
| 100 walls (5×5) | 20 ms, 2 passes |
| 256 walls (8×8) | 68 ms, 2 passes |
| 400 walls (10×10) | 128 ms, 2 passes |

Before batching, the 400-wall case took 401 passes and 22 seconds. Output is unchanged —
the batch is applied in the same sorted order, and only mutations with disjoint anchors and
disjoint bounding boxes share a pass.
