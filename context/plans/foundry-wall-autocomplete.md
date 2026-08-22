---
created: 2026-08-11
last-modified: 2026-08-11
tags: ["#foundry", "#vtt", "#design", "#maps", "#walls"]
status: draft
---

# Wall Autocomplete — deterministic completion of hand-drawn walls

**Read this when:** changing or extending the `pentaryn-walls` engine. **Design doc.** To *use* it, read `foundry/module/pentaryn-walls/README.md`.
**Not this file:** map prep before walling → [`../foundry/map-library.md`](../foundry/map-library.md)

> Rough in the *informative* wall segments — windows, doors, the odd hint stub — and let a
> macro infer the rest. No prediction, no scoring, no CV. A fixed rule table iterated to a
> fixed point, refusing anywhere it would have to guess.
>
> **Built.** `foundry/module/pentaryn-walls/` — engine + compiled WASM backend, 49 passing fixtures on both.
> §12 records the corrections implementation forced on this design. Successor to Stage 3 of
> [`foundry-vtt.md`](foundry-content-pipeline.md) (D4: hand-draw walls) — this does not reverse D4, it
> makes hand-drawing cheaper.

**Verdict: yes, this is possible, and it is smaller than it looks.** ~800 lines of JS. The rule
set is **7 rules** (six inference rules plus a trim pre-pass). A square house with three windows and a door
completes in **6 passes**. The convergence proof is one line. Four configurations are
provably unresolvable and get refused — the rest is exact integer geometry.

**Target:** Foundry **v14.365**, world `ardenhaven`, gridless painterly maps (D9).
All source citations read from the installed build at
`/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app` (`APP` below).

---

## 0. The authoring rules — what to learn

### There are two authoring styles, and they converge

The same building can be drawn either way. Pick per map, or mix freely.

| | **Overshoot → trim** | **Undershoot → extend** |
| --- | --- | --- |
| You draw | long lines poking *past* everything they should stop at | short hints that stop *short* of everything |
| Engine does | cuts each back to its outermost crossings | grows each until it meets something |
| Measuring needed | none — sloppy is fine | none, but one hint per wall span |
| Six-room floorplan | **7 lines → whole building, 0 creates, 1 pass, 0 refusals** | 15 hints → 29 walls, 13 passes, 0 refusals |

This is the GIS split exactly: an *overshoot* is fixed by trim, an *undershoot* by extend.

**For anything with a dense interior, overshoot-and-trim is dramatically less work** — seven
unmeasured strokes build a six-room plan with no inference at all. Reach for hints when you
want the engine to *find* a corner you haven't decided the position of, and for the outer
shell of an irregular shape.

### Order of operations — build inside-out

Nesting needs no new rules. It falls out of *closed ⇒ inert*, and it is the fastest way to
build something genuinely complex.

1. Hint the **innermost** object. Run.
2. **Check the report says CLOSED.** This is the gate — see below.
3. Hint the next layer out. Run. The closed layer is ignored for inference and never mutated,
   while still blocking rays.
4. Repeat outward. Verified to three levels; two separate inner objects work the same way.
5. Connect inner to outer **last**, by hand. In practice you draw one stub off the inner and
   the engine runs it to the outer wall — one wall, not a manual trace.

**Step 2 is not optional, and it is the whole reason the workflow works.** An inner object
that has *not* closed is not inert, so it still competes: hinted sparsely and run together
with the outer, its loose ends pair with the outer's and bridge the two. Same geometry, closed
first, and the outer completes with the inner untouched (`updates: 0`).

So the discipline is only ever: **finish one thing before starting the next, and let the
report tell you when it is finished.** The engine already prints per-component
`closed / open +N`.

### The rules

Everything below is derived from the rule table, but this is the practical list. Learn these
and you can aim the tool rather than fight it.

0. **Walls that all point at the same spot meet there** — two, three or four of them. A
   corner, a T and a crossroads are one rule, not three. And **a loose end turns at the
   first junction it reaches**, never a farther one.

1. **One informative segment per wall *span*, not per line.** A line interrupted by a passage
   carries two spans, and each needs its own segment. A 6-sided L needs six; a T needs eight.
2. **The engine adds the least wall it can**, and prefers two segments agreeing (a fill or a
   corner) over one segment guessing (an extension). To force a corner, hint both of its
   walls — the pair anchors the junction no matter how close the neighbouring room is.
   *(Superseded: this used to require the hint be nearer than any competing pairing. Nearest-
   junction membership removed that arithmetic.)*
3. **Two windows on a wall line give three wall segments** — one between them, one off each
   end. Three windows give four. This is just rule 2 playing out.
4. **Explain every intentional gap.** A door or window across it, or side walls drawn to its
   corners. A bare collinear gap under 6 squares gets filled — *unless* two loose ends aim
   into it, which is how the engine recognises a passage mouth.
5. **Never leave a wall end dangling exactly at a passage corner.** Either touch the corner
   (chain-draw) or stop a grid step short so the corner is inferable. An end sitting exactly
   on the corner has no corner partner — its only legal partner is across the opening.
6. **Complete one structure per run, and build inside-out.** Closed components go inert, so
   finishing structures one at a time *is* the isolation mechanism — and it lets you nest
   arbitrarily: close the inner object, then the outer ignores it. **Check the report says
   closed before moving on**; an unclosed structure is still live and will trade endpoints
   with the next one.
7. **Walls never dead-end.** A missing hint means neighbours run up to 20 squares to the next
   obstacle; a hint more than 6 squares from its corner means the wall runs *through* that
   corner instead of turning. Refusal messages name the distance, so they tell you the fix.
8. **Don't aim a partition at a door's midspan** — offset the door. Nothing thinner than the
   weld tolerance survives; deliberate offsets should be at least one grid step.
9. **Every wall type keeps itself — except doors and windows.** A terrain run extends as
   terrain, an invisible run as invisible, an ethereal run as ethereal. Doors and windows are
   openings *within* a wall line, so what continues past them is the **wall**, not the
   opening: hint with a window and you get solid wall around it. When one bridging wall has
   to span two different kinds — the only case where a choice exists — the **most-blocking
   kind wins**: `solid > terrain > invisible > ethereal > blank`. Over-blocking is visible
   and fixable; under-blocking leaves a hole players walk or see through.
10. **Double-line (thick) walls are first-class.** Trace both lines with corner gaps; anything
   closer than the weld tolerance is read as one line. A doorway through a double wall needs
   a door segment in *each* line, or jamb caps — otherwise the inner line refills and you get
   a blocked doorway.
11. **Cave mouths:** stop chamber spans short of an edge mouth's corners and start the passage
   walls just outside them. At a *vertex* mouth, chain-draw the passage walls onto the chamber
   wall ends, or lay a door across the mouth. Adjacent mouths and one-square mouths are fine.
12. **Give every room at least one hinted corner** (two hints on adjacent walls). A lone
   floating hint grafts onto whatever its carrier happens to reach.
13. **Keep segments meant for one wall line within 2px of it.** 3px to half a grid step gets a
   refusal telling you to nudge; beyond half a step it is treated as a deliberately different
   line.
14. **Don't place geometry exactly on a tolerance boundary.** A gap of exactly `GAP_MAX`, or a
   leg of exactly `CORNER_MAX`, flips behaviour on a 1px nudge — not because the engine is
   unstable but because that is what a threshold is. Every refusal names its number, so stay
   a few px clear of it.

## 1. The three decisions that make this work

Everything else follows from these. They were the two points the design agents disagreed
on, plus one consequence neither drew out.

### D-1. The engine never splits an existing wall. It *pins* instead.

A generated wall may terminate mid-span of an existing wall. Nothing is split.

This is legal because **Foundry does not need walls split at junctions**. `Edge.identifyEdgeIntersections()`
(`APP/client/canvas/geometry/edges/edge.mjs:253-273`) runs an all-pairs sweep over every
edge on the canvas, independent of shared endpoints, and records each crossing on both
edges. `ClockwiseSweepPolygon._identifyIntersections()` (`clockwise-sweep.mjs:344-377`)
injects each recorded crossing as a polygon vertex mid-edge during the vision sweep.
Movement is even simpler: `_testCollision` ray-tests every edge independently
(`clockwise-sweep.mjs:759-780`). A T-toe touching another wall's interior is detected too —
`lineSegmentIntersects` uses `<= 0` orientation tests, so an orientation of exactly zero
counts (`APP/common/utils/geometry.mjs:33-43`).

Two segments authored as a cross block **exactly** like four split segments.

Not splitting buys three things:

- **The convergence proof collapses to one line** (§5). Splitting is the only operation that
  could create new dangling endpoints, i.e. new work. Without it, no rule can ever increase
  the amount of work outstanding.
- **Hand-drawn documents are never mutated** except by a sub-4px weld — so Joe's
  nudge-a-wall-to-re-open-a-building workflow keeps working, and undo stays clean.
- It kills the split↔merge oscillation that is otherwise the most likely way to hit the
  iteration cap: a split rule and a collinear-merge cleanup rule will happily undo each
  other forever.

The cost is ergonomic, not functional: a pinned junction won't Alt-click chain-select
(`Wall#getLinkedSegments` matches endpoints by exact string key,
`APP/client/canvas/placeables/wall.mjs:350-372`). Worth it. And note that dragging a shared
endpoint doesn't move the neighbours anyway — Foundry updates only the dragged wall
(`placeables/wall.mjs:903-925`) — so exact-shared corners buy less than you'd expect.

**One hard exception:** a door is a scalar field on a whole wall document
(`APP/common/documents/wall.mjs:73-75`). A door *is* its entire segment. So an opening in a
long run must always be three documents, and **the engine must never generate a wall that
crosses a door** — an unsplit wall crossing a door keeps blocking after the door opens.
That's lint rule N3.

### D-2. Read wall documents. Never call Foundry's collision API.

An **open** door (`ds: 1`) becomes fully transparent to *everything*: `#createEdge` sets
light, darkness, sight, sound and move all to `NONE` when `isOpen`
(`APP/client/documents/wall.mjs:151-156`). A collision-based ray would sail straight through
any doorway that happened to be left open, and the same map would autocomplete differently
on Tuesday than on Monday.

Same trap with one-directional walls (`dir: LEFT|RIGHT`, `APP/common/constants.mjs:1463-1478`):
collision-transparent from one side, structurally present. The engine treats them as solid
obstacles and never moves them.

So: all inference reads `c`, `door`, `move`, `sight`, `dir`, `levels` off the documents.
`ds` is ignored entirely.

### D-3. There is no "find the exterior shell" step. Rule priority does it for free.

You expected shell detection to be easy. It is — the outer face of the planar arrangement,
found by walking most-counterclockwise from the lexicographically minimal endpoint, O(E log E),
no choices (core does a cousin of this in `WallsLayer#identifyInteriorArea`,
`APP/client/canvas/layers/walls.mjs:159+`).

**But the engine never needs it.** Perimeter segments carry strong evidence — collinear
partners and corner partners — rules F1/F2, which share the stronger tier. Interior
artifacts carry only weak evidence — a ray, rule E1, a tier below. So the shell always closes *before* any
interior extension fires, which means interior rays always have a shell to hit. "Outside
first, then inside" is an emergent property of the evidence gradient, not a phase.

Keep the shell walk only as a reporting nicety ("exterior" vs "interior" labels in the
summary). One less thing that can be wrong.

---

## 2. Ground truth — the wall model

`WallDocument` schema, `APP/common/documents/wall.mjs:52-96` (`schemaVersion: "14.353"`):

| Field | Constraint | Default |
| --- | --- | --- |
| `c` | length-4 array of **required integers** `[x0,y0,x1,y1]` | — |
| `levels` | set of Level ids; walls with differing sets never interact | `[]` |
| `light` `sight` `sound` | choices = `EDGE_SENSE_TYPES` | `NORMAL` (20) |
| `move` | choices = `WALL_MOVEMENT_TYPES` | `NORMAL` (20) |
| `dir` | choices = `EDGE_DIRECTIONS` | `BOTH` (0) |
| `door` / `ds` | `WALL_DOOR_TYPES` / `WALL_DOOR_STATES` | `NONE` (0) / `CLOSED` (0) |
| `threshold` | `{light, sight, sound: nullable +number, attenuation: bool}` | nulls / false |
| `flags` | `DocumentFlagsField` — keys validated as package ids | `{}` |

`EDGE_SENSE_TYPES` = `NONE: 0, LIMITED: 10, NORMAL: 20, PROXIMITY: 30, DISTANCE: 40`
(`APP/common/constants.mjs:1428-1453`). `EDGE_DIRECTIONS` = `BOTH: 0, LEFT: 1, RIGHT: 2`.

**v14 renamed these.** `CONST.WALL_SENSE_TYPES` and `CONST.WALL_DIRECTIONS` are now
deprecated Proxies that log a warning on access (`constants.mjs:2279-2297`). Write the macro
against `CONST.EDGE_SENSE_TYPES` / `CONST.EDGE_DIRECTIONS`.

**Source-comment trap.** The JSDoc on `LIMITED` and `NORMAL` is *swapped* relative to runtime
behaviour. Behaviour is authoritative: `LIMITED` (10) is the classic terrain wall — a single
LIMITED collision is discarded (`clockwise-sweep.mjs:780`, `if (collisions[0]?.isLimited) collisions.shift()`);
`NORMAL` (20) blocks at first contact. Trust the values, never the comments.

### What the wall tools actually write

From the layer presets, `APP/client/canvas/layers/walls.mjs`:

| Tool | Fields | Line |
| --- | --- | --- |
| solid | all four channels 20 | 370 |
| terrain | light/sight/sound 10, move 20 | 386 |
| invisible | light/sight/sound 0, move 20 | 402 |
| ethereal | sound 0, move 0, sight/light 20 | 418 |
| door / secret | all 20, `door` 1 / 2 | 434 / 450 |
| **window** | light 30, **sight 30 (PROXIMITY)**, sound 20, move 20, `threshold: {light: 2×gridDistance, sight: 2×gridDistance, attenuation: true}` | 469 |

So Foundry's canonical **window** is proximity-sighted with a threshold — not `sight: 0`. A
`sight: 0, move: 20` wall is what `getWallCategory()` calls **"invisible"**
(`APP/client/documents/wall.mjs:76-89`) and it renders cyan in the walls layer, not
window-blue.

**This is cosmetic as far as the engine is concerned** — every wall document of every class
is just a connectable segment, and all generated fill is the solid preset. It matters only
for the run report, and so you aren't confused by the editor colours. Use whichever tool
gives the light behaviour you want.

### Snapping — and why gridless is fine

The walls layer snaps to `CENTER | VERTEX | CORNER | SIDE_MIDPOINT` at resolution 8 / 4 / 2
depending on grid size (`walls.mjs:79-86`), and endpoints are always rounded to integers
(`walls.mjs:146-149`) on top of the schema's integer requirement. On a **gridless** scene
`GridlessGrid.getSnappedPoint` is the identity — so the only quantization you get is
`Math.round`. That is exactly why the weld pass (§4, W1) is load-bearing rather than a
nicety: hand-drawn endpoints will essentially never coincide unless you chain-draw.

`canvas.dimensions.size` still exists on gridless scenes, so all tolerances below can scale
with it.

---

## 3. Phases

```
P0  Scope & freeze     read scene walls; partition by `levels`; mark dir≠0 as frozen
P1  Lint               N1–N4 diagnostics, no geometry change
P2  Graph build        weld-classes, pins, components, D
P2.5 Trim              X1: cut overshoots back to their crossings (single-shot)
P3  Fixed-point loop   repeat (cap 1000):
                         classify components (C1)
                         enumerate all instances of W1,W2,F1,F2,E1
                         none? → exit
                         sort by (priority, length asc, lexicographic coords)
                         apply the FIRST instance only
                         incrementally update the graph
                         assert D decreased  ← the real safety net
P4  Refusal sweep      R1: report every endpoint still dangling
P5  Commit             two batched writes, in memory until now
```

**Why this order.** Lint before graph, so zero-length and duplicate garbage can't seed a
weld class. Graph before rules, because every predicate is a graph query. Welds at top
priority, because every other predicate keys off vertex identity — fill a gap before welding
a 3px sliver and you fill the wrong interval.

**One mutation per iteration.** Slower, but the entire run becomes a replayable list of
single steps you can read, and the convergence measure gets checked after every one. Cost is
irrelevant: it all happens on an in-memory clone.

### The graph model

- **Vertex** = a weld-class of endpoints (endpoints within `WELD_EPS` of each other).
- **Pinned vertex** = one lying within `WELD_EPS` of another segment's *interior* — a T-contact.
- **degree(v)** = number of segment-ends at v.
- **Dangling** = degree 1, not pinned, not flagged `keepOpen`.
- **Component** = connected through shared vertices *and pins*.
- **Closed component** = zero dangling endpoints → **inert**.

That pin clause is what makes your one-building-at-a-time scoping work at all. Interior
partitions normally end on the *interior* of an exterior wall — you're not going to hand-split
exterior walls. If "connected" meant shared-endpoint-only, such a partition would have two
permanently dangling ends and **no real building would ever reach "done."** Pins fix that
without splitting anything.

**Inert ≠ invisible.** A closed component generates no rule instances (your requirement:
"all of those lines are ignored") but stays in the **obstacle set** forever — it's still a
ray target and a pin host. Without that, a stub inside a finished shed would spear straight
through it and land on the compound wall beyond.

### Tolerances

Integer pixels. `S` = grid size, `step` = `S / resolution`.

| Name | Value | Why that value |
| --- | --- | --- |
| `WELD_EPS` | `max(1, min(4, floor(step/4)))` → **4px** on any grid ≥ 64px | Must exceed authoring error (≤1px from `Math.round`, ~1.5px compounded) yet stay strictly below `step/2` (≥8px), so it can never merge two *distinct* lattice points. |
| `COLL_EPS` | **2px** perpendicular | Intended-collinear integer endpoints deviate ≤0.71px per rounding, ~1.5px worst case. The smallest *deliberate* offset is one lattice step ≥16px. An 8× gap between noise and intent. |
| `PIN_EPS` | **1px** | An endpoint this close to a segment counts as *on* it. Exactly the integer-rounding bound — `Math.round` moves a point by at most √0.5 = 0.708px — so a rounded foot or hit point is **guaranteed** to land inside the band. That guarantee is what makes W2 and E1 terminate; see §12. |
| `GLANCE_SIN` | **0.05** (≈2.9°) | Shallowest angle at which E1 accepts a hit. See §12. |
| blocker band | **max(`COLL_EPS`, step/2)** | Width within which a parallel wall lying along E1's ray blocks it. Deliberately *not* `COLL_EPS` — different question, see §12. |
| `GAP_MAX` | 6 squares | Longest gap F1 will bridge. |
| `CORNER_MAX` | 6 squares per leg | Longest corner leg F2 will build. |
| `EXT_MAX` | 20 squares | Longest ray E1 will chase. |

**All tolerance lives in P1–P2.** After the graph is built, every topology test — connected?
closed? dangling? — is exact integer comparison. Predicates use integer cross/dot products
(exact in doubles below 2²⁶, far above any scene), distances compare *squared*, ray ordering
compares the rational parameter `t` by cross-multiplication. No float equality anywhere. The
only rounding is `Math.round` on a computed corner or hit point, after which it is a fixed
exact integer pair.

The macro should **print its resolved tolerances and a weld report every run** ("welded 14
endpoint pairs, max move 3px"). That's how the fuzziness stays learnable — it happens in one
place and it tells you what it did.

### Lint rules (P1 — report only, never mutate)

| ID | Detects | Why it matters |
| --- | --- | --- |
| **N1** | zero-length walls (`c[0]==c[2] && c[1]==c[3]`) | Schema-legal, invisible to core's own graph, and can throw from `closestPointToSegment` if thresholded. |
| **N2** | exact duplicates and collinear overlaps | Collinear overlaps record **no** intersection anywhere in Foundry (`geometry.mjs:59-66`) so nothing else will catch them. A duplicate also silently breaks your nudge-to-re-open workflow — you delete one wall and its twin keeps the building frozen. |
| **N3** | any wall crossing or overlapping a `door ≠ 0` segment | Functionally broken per D-1: it keeps blocking when the door opens. |
| **N4** | endpoint pairs at distance in `(WELD_EPS, step/2]` | "Almost touching." Refuses to weld — beyond provable rounding noise — but tells you where to nudge. |
| **N5** | any `\|coord\| ≥ 65536` | The sweep's vertex identity key is `65536·x + y` (`geometry/edges/vertex.mjs:38-48`); beyond that, distinct points collide. Hard-fail preflight. |

---

## 4. The rule table

Six rules. Priority is row order. Within a rule, eligible instances are ordered **smallest
inference first** (created/moved length ascending, compared as squared integers), tie-broken
lexicographically by canonical coordinates. Document `_id` and collection iteration order
never enter any comparison — the same drawing in a different stroke order gives byte-identical
output.

| ID | Name | Precondition | Action | Terminates because | Refuses when |
| --- | --- | --- | --- | --- | --- |
| **X1** | Trim overshoot *(pre-pass, not in the loop)* | Segment s **properly crosses** another (both interiors), and the end of s beyond the nearest such crossing is dangling | Cut s back to the crossing | Removes a dangling end, creates a pinned one: **D −1** | The removed piece would be more than **half** the wall — then it isn't an overshoot, it's a wall that happens to cross something near its far end. Doors are never trimmed: a door's length is its opening width |
| **W1** | Endpoint weld | Dangling `a`, `b` on distinct unfrozen segments; `0 < dist²(a,b) ≤ WELD_EPS²` | Move the lexicographically greater endpoint onto the lesser; stash prior `c` in flags | Two dangling ends become one degree-2 vertex: **D −2** | Never. 3-way clusters weld pairwise smallest-first; associative because `WELD_EPS < step/2` guarantees one lattice point per cluster |
| **W2** | Pin snap | Dangling `e`; nearest point `p` on another segment's **interior** has `0 < dist²(e,p) ≤ WELD_EPS²` | Move `e` to `round(p)`. Host is **not** split | `e` becomes pinned: **D −1** | Never. Two hosts → nearer wins; exact tie → lexicographically smaller host (invisible either way — same endpoint) |
| **F1** | Collinear gap fill | Dangling `a` (of A), `b` (of B); each segment's endpoints within `COLL_EPS` of the other's carrier; `b` on `a`'s **outward** ray and vice versa; open interval `(a,b)` holds no vertex, no pin, and is crossed by nothing; `dist ≤ GAP_MAX·S`; **fewer than two other loose ends aim their outward ray into the gap** | Create one **solid** wall `a→b`, reusing both existing integer endpoints — no new coordinates invented | Both ends weld: **D −2** | Aligned but `> GAP_MAX` → *"aligned pair too far apart."* Off-carrier by `> COLL_EPS` → *"nearly collinear — nudge onto line."* |
| **F2** | Junction inference (atomic) | Two **or more** dangling ends whose outward carriers meet at the same `P = round(intersection)`; `P` **strictly** outward from each (leg > 0); each leg `≤ CORNER_MAX·S`; no leg crosses an obstacle; **and each end joins only its *nearest* candidate junction** | Create one solid leg from **every** member to `P` — one atomic mutation. A partial junction is not a valid state | `a`, `b` reach degree 2; `P` is born at degree 2: **D −2** | Leg `> CORNER_MAX` → *"corner too far."* Ties no longer arise: an end's candidate junctions all lie on its one outward ray at distinct distances, so *nearest* is always unique |
| **E1** | Dangling extension | Dangling `e` of segment s; ray from `e` along s's **own** outward carrier; nearest obstacle contact `h` with `0 < dist ≤ EXT_MAX·S` by exact rational `t`; `H = round(h)` | Create one solid wall `e→H`. `H` on an interior → pin. `H` at a vertex → weld | `e` reaches degree 2: **D −1**, or **−2** if `H` lands on another dangling vertex | No hit within `EXT_MAX`, or ray exits the scene → *"nothing along this line to grow to."* `H` lands strictly inside a **door** → refuse (a wall dead-ending in a door becomes a hole when it opens). Hit angle shallower than `GLANCE_SIN` → refuse. An **aligned wall lying along the ray**, starting strictly nearer than the hit → refuse (otherwise E1 lays wall on top of wall, silently doing what `GAP_MAX` just declined). **Landing mid-window is fine** — a window blocks movement and stays put; trace D2 depends on it |
| **C1** | Closure marking | Component has zero dangling endpoints | None — a derived classification, recomputed every iteration. Component stops generating instances, stays an obstacle | Not a mutation | Predicate is total |
| **R1** | Refusal sweep | At fixed point, any endpoint still dangling | Report only. **Zero geometry change** | Not a mutation | This *is* the failure handler |

One rule per line of your original spec: welding and "finish dragging the dots" (W1/W2),
collinear window→wall→door fill (F1 — the classes are irrelevant to the predicate, fill is
always solid), corner completion (F2), floating door growing both ways to the nearest wall
which may itself be interior (E1 — the obstacle set is *all* walls), closure and scoping (C1).

### Your half-vs-full question, answered: **hint walls always extend fully.**

A dangling end grows along its own carrier until it hits the nearest obstacle. That is
identical to the floating-door rule you already specified, so it's **one** rule to learn, not
two.

"Stop at 50%" is undefinable without a second reference object — it would be a guess about
*which* 50%. The teachable model is:

> **Walls in this engine never dead-end. To stop a wall somewhere, give it something to stop
> against.**

Combined with smallest-inference-first, that gives you full control by drawing (trace D3
below is exactly your scenario). For a genuine dead-end half-wall, see §7-H1.

### Complex shapes — what you actually have to draw

**One informative segment per wall *line*.** Not per side of a rectangle — per distinct line
the finished building has a wall on. That single sentence covers every shape below, and it is
the only authoring rule that matters.

- **Concave corners are not a special case.** F2 intersects two *carriers*; it never asks
  which way the corner turns. An L-shaped building's inner corner is the identical
  computation to its outer ones. What an L needs is **six** informative segments, not four —
  the two extra sides are two extra lines. Verified: 6 segments in, 12 walls out, closed.
- **Caves work, with no windows and no right angles at all.** An irregular 8-sided outline
  drawn as eight segments with a gap at every vertex completes into a closed loop on corner
  inference alone. Cave walls are just wall lines that don't happen to be axis-aligned.
- **Round towers mitre.** Draw the chords; adjacent carriers meet at the *circumscribed*
  polygon vertex, so the curve keeps its bulge instead of being short-circuited into a chord.
  16 chords in, 32 walls out. The finer you chop the curve the shallower the angles get, and
  past `GLANCE_SIN` / `CORNER_MAX` it stops guessing and hands the arc back to you — which is
  the right failure, not a bug.
- **A room with one door and one window** needs hint stubs on the other two sides. Four
  segments, eight walls, five passes.

### Trim — the AutoCAD move, and why it earns its place

You were right that trim is the more powerful primitive, and it bought something extend can't:
**draw four long crossing lines, get an exact rectangle.** Every end hangs in space, every end
gets cut back to its crossing, and the corners come out as exact shared vertices. No fills, no
extensions — pure trim. That's the `#`-then-trim workflow working as-is.

It also handles "clip it on the outside" for free: a partition that pokes out through the
shell ends in mid-air past a crossing, which is precisely the overshoot signature.

Two restrictions make it safe, and both are load-bearing:

**It only fires on *proper* crossings** — both walls crossed through their interiors — **and
it uses the crossing set frozen before any trimming happens.** Here is why. Once a wall has
been trimmed, its endpoint merely *touches* the other wall. But an endpoint-touching-an-interior
is geometrically identical to a partition T-ing into a long wall, where trimming would destroy
half the wall. Local geometry cannot tell "I drew these overlapping" from "I drew a T" after
the fact. Freezing the crossing set up front is what separates them.

**It never removes more than half a wall.** An overshoot is by nature the small leftover. A
crossing 99% of the way along means the wall crosses something near its far end, not that it
overshoots — cutting there would amputate it. Declining is reported, not silent.

Doors are never trimmed: a door's length *is* its opening width.

Set `{trim: false}` to disable it entirely.

### Not adopted: the short-join rule

Tempting for caves and fine circles — two loose ends within a square of each other, just
connect them. **Rejected**, because F2 already covers both (any two non-parallel carriers
give a corner, and cave/tower segments are never parallel), which leaves short-join firing
only on the *near-parallel* cases — and those are exactly the ones §7 deliberately refuses.
It would have auto-resolved the T1 near-collinear band that the whole design is built to
refuse. A rule whose only remaining job is to guess in the ambiguous band is a rule to cut.

### Dropped from v1: the parallel-span rule

The rules agent proposed an F3 "lid" rule: two parallel dangling ends in the same component,
connector exactly perpendicular → close it. **I'm cutting it**, because it directly
auto-resolves a case the adversarial pass proved is ambiguous — a U-shaped footprint's open
mouth is either a courtyard entrance you want left open or an unfinished shell you want
closed, and the geometry is identical either way. F3 would silently wall off your courtyard.

It never fires in any of the traces below anyway (corners outrank it and consume its
endpoints first). Refuse instead: *"shell open at (200,0)/(600,0) — close by hand, or draw a
door across the mouth to declare it an opening."*

---

## 5. Convergence, and how many passes

**Measure: `D` = the number of dangling endpoints.**

Every rule strictly decreases it — W1 −2, W2 −1, F1 −2, F2 −2, E1 −1 or −2. And **no rule
can increase it**, because the engine never splits (D-1) and every endpoint of every created
wall is born welded or pinned. F2's corner point `P` is degree 2 *at birth*, which is why the
two legs must be created atomically.

Therefore the loop terminates in at most `D₀ ≤ 2 × |walls|` mutations. Done.

**So the 1000 cap effectively never fires.** It would need a scene with 500+ disconnected
segments, or an implementation bug. Which makes the real safety net a stronger assertion than
a counter:

> **After every mutation, assert `D` decreased. Throw immediately if it didn't.**

That names the offending rule and the exact step, instead of reporting "looped 1000 times"
twenty minutes later. Keep the counter too, as a belt-and-braces backstop — but if it ever
trips, the assertion should have fired first. Its message should be *"the rule set is unsound
for this input; nothing was committed."*

**Pass counts:**

| Scene | D₀ | Mutations | Loop iterations |
| --- | --- | --- | --- |
| Square house, 3 windows + 1 door + 1 hint | 10 | 5 (1 fill + 4 corners) | **6** |
| Adding a floating interior door to it | 2 | 2 | 3 |
| Your L-partition scenario (D3) | 3 | 2 | 3 |
| Ceiling before the cap | — | — | 1000 |

Three orders of magnitude of headroom.

**Idempotence is guaranteed.** At the fixed point no instance exists. A second run rebuilds
the same graph (every predicate is a pure function of geometry — flags never enter one),
finds nothing, writes nothing. Refusals recur identically. Re-running is always safe.

---

## 6. Traces

Grid 100px. `W` window, `D` door, `H` hint, `F` generated fill.

### D1 — Square house, 3 windows + 1 door (your example)

Five drawn segments. The bare west side needs one informative segment, so it gets hint `H1`
— **every wall line needs at least one segment on it**, because carriers are what corners are
inferred from.

```
        (0,0)                    (1000,0)
          ·  ==W1==  gap  ==W2==  ·      W1 (200,0)-(400,0)        window
          :                       |      W2 (600,0)-(800,0)        window
          H1                      W3     W3 (1000,300)-(1000,600)  window
          :                       |      D1 (400,1000)-(600,1000)  door
          ·        ==D1==         ·      H1 (0,400)-(0,600)        hint (solid)
        (0,1000)                (1000,1000)
```

`D₀ = 10`.

| Iter | Rule | Mutation | D |
| --- | --- | --- | --- |
| 1 | F1 (len 200) | `(400,0)-(600,0)` | 10→8 |
| 2 | F2 NE (legs 500) | `(800,0)-(1000,0)` + `(1000,0)-(1000,300)` | 8→6 |
| 3 | F2 NW (legs 600) | `(200,0)-(0,0)` + `(0,0)-(0,400)` | 6→4 |
| 4 | F2 SW | `(400,1000)-(0,1000)` + `(0,1000)-(0,600)` | 4→2 |
| 5 | F2 SE | `(600,1000)-(1000,1000)` + `(1000,1000)-(1000,600)` | 2→0 |
| 6 | — | no instances → fixed point; C1 marks one closed component inert | 0 |

Nine walls created, loop closed. Spurious pairings (W1's left end with W3's top, say) die on
the outward-ray test — `P` lies *behind* the dangling end.

Worth seeing why ordering is load-bearing: `{W1.right, W3.top}` **is** a legal corner instance
at `(1000,0)` with legs 600+300. It's simply longer than `{W2.right, W3.top}` at 500, and F1
runs first anyway and welds W1's right end away. Smallest-inference-first is what keeps this
predictable. (And if you'd drawn only one north window, that 900-leg corner is exactly the
right answer, and it fires.)

### D2 — Floating door inside the completed shell

Shell is inert, still an obstacle. Add `D2 = (300,400)-(400,400)`. Both ends dangling, no
collinear or corner partners → two E1 instances.

| Iter | Rule | Mutation | D |
| --- | --- | --- | --- |
| 1 | E1 (len 300) | `(300,400)-(0,400)` — lands on an existing **vertex** → weld | 2→1 |
| 2 | E1 (len 600) | `(400,400)-(1000,400)` — lands on W3's **interior** → pin, no split | 1→0 |

Exactly your requirement: *"a wall on either side extend out to the closest wall."*

### D3 — Your L-partition: door halfway across, steered by a hint

Closed 1000×1000 shell. Door `D3 = (500,600)-(500,1000)` — bottom end pins to the south wall
at creation; top end dangling. **Alone, E1 would run it straight up to `(500,0)` and cut the
room in half.** You steer it with a hint instead: `H2 = (200,600)-(400,600)`.

```
(0,0)________________________(1000,0)     Dangling: D3.top (500,600)
|                                |                  H2.left (200,600)
|  ==H2==   ·(500,600)           |                  H2.right (400,600)
|           |                    |
|           D3 (door)            |        E1 instances:
|___________|____________________|          H2.right → +x, hits (500,600)  len 100
(0,1000)   pin              (1000,1000)     H2.left  → −x, hits (0,600)    len 200
                                            D3.top   → −y, hits (500,0)    len 600
```

| Iter | Rule | Mutation | D |
| --- | --- | --- | --- |
| 1 | E1 (len 100 — shortest) | `(400,600)-(500,600)` lands on the **dangling** vertex D3.top → welds both | 3→1 |
| 2 | E1 (len 200) | `(200,600)-(0,600)` → pin on the west shell | 1→0 |
| 3 | — | fixed point. D3's 600px instance **vanished at iteration 1** — it stopped being dangling | |

Result: west wall → F₂ → H2 → F₁ → door → south wall. *"A wall to the door and then to the
adjacent wall."*

This is the trace that makes the whole thing feel controllable, and the rule to internalise
is one sentence:

> **The engine always builds the shortest inference available. Put your hint closer than the
> extension you don't want.**

### D4 — Two buildings, one already finished

Building A: closed square `(0,0)-(600,0)-(600,600)-(0,600)`, corners exact. Building B:
three walls + a window, open, out at x≈2000–2600. A's north wall sits on **the same carrier
`y=0`** as B's window — a textbook F1 shape.

It generates nothing. F1 needs *both* endpoints dangling, and every one of A's endpoints has
degree 2. A is byte-identical afterwards. That's your requirement 4 working: *"if a system is
complete, all of those lines are ignored."*

B completes in **two E1 extensions**, not two F1 fills — the fixture corrected this trace.
B's gaps run between a *vertical* wall's end and the *horizontal* window's end, so the pair
is not collinear and F1 cannot apply; and the corner they imply has a zero-length leg, so F2
can't either. The window's ends simply shoot along their own carrier and land on the two
vertical walls: `(2200,0)→(2000,0)` then `(2400,0)→(2600,0)`, three passes. Same result, and
a useful reminder that the rules that *look* applicable often aren't the ones that fire.

To re-open A later, nudge one of its walls. Its endpoint leaves the weld class, `D ≥ 1`, A is
live again.

---

## 7. What it refuses — and the four cases nothing can fix

The adversarial pass hunted for configurations where deterministic rules must guess. The
genuinely impossible list came out to **four**, and two of them dissolve with a drawing
convention rather than a rule.

**Impossibility standard:** two legitimate intents, bit-identical input geometry, incompatible
correct outputs. No function maps one input to two outputs, so any rule is wrong for at least
one intent. Refuse.

### H1 — Partial vs full interior wall

Stub `(300,100)→(300,140)` hanging off the north wall of a room spanning y=100..500.
Intent A: full partition, ends at `(300,500)`. Intent B: half-wall bar counter, ends at
`(300,300)`. Intent C: a 40px alcove jamb, already finished as drawn. Same eight integers,
three answers. ∎

**Convention: default is full extension.** For a genuine dead-end, mark the endpoint
`keepOpen` (§8) — which removes it from the dangling set entirely, so E1 never sees it and C1
still lets the component close.

The design agent proposed instead sealing dead ends with a small perpendicular cap stub.
**Don't** — a cap is itself a wall with two dangling ends, so it becomes an extension seed
during the loop and grows. The flag is cleaner. Practical shape: a companion "mark dead-end"
macro bound to a key, run on selected walls.

Honestly, for a one-off half-wall it's also fine to let it complete and then delete the
generated piece. That's what the flags namespace is for.

### H2 — Gap: missing wall vs deliberate opening vs alley between buildings

Collinear pair, 20px gap. Intent A: sloppy drawing, fill it. Intent B: open archway, no door
object wanted. Intent C: an alley between two *different* buildings. Identical geometry. ∎

**Convention: deliberate openings contain a door or window segment.** Then fill every gap
≤ `GAP_MAX`, refuse every gap beyond it. Add a union-find check that flags any fill which
would merge two previously separate sub-structures — that predicate catches the alley case
exactly.

### H3 — The open U-mouth

Open U-chain, two dangling ends 400px apart. Courtyard entrance vs unfinished rectangle.
Identical. ∎ (Worse: intent A means the component must never freeze *and* never be flagged —
a contradiction with any "dangling ends are incomplete" report.)

**Always refuse.** Draw a door or window across the mouth to declare it an opening — which
also closes the topology and lets the component freeze. There is deliberately no
silent-leave-open path. This is why F3 got cut.

### H4 — Diagonal door near a corner

A 45° door `(380,400)→(400,380)` cutting a rectangular corner. Intent A: chamfered doorway,
axis-aligned jambs. Intent B: genuinely diagonal passage, extensions continue at 135°.
Identical. ∎

**Refuse and flag.** Detection: a door or stub whose axis is neither parallel nor
perpendicular (within `COLL_EPS` angular equivalent) to *any* wall within `EXT_MAX` along
either ray. Rare enough that a convention isn't worth the learning cost — draw those jambs by
hand.

### H6 — Cross-structure fusion: two half-hinted structures trade endpoints

Two rooms 200px apart, every hint legally placed near its own corner, and F2 still pairs
room A's north end with room B's west end — because that cross-corner is *cheaper* than
either room's own. Two buildings at different rotations fuse the same way.

**Provably not rule-fixable.** Any "same structure" test needs a notion of structure the
engine doesn't have, and the obvious candidate — refuse fills that merge two components —
breaks the two-windows-on-one-line workflow, where merging separate components **is** the
product. Distance-decay or a "same building" heuristic is exactly the fragile path this
design exists to avoid.

**The workflow is the answer, and it already exists:** closed components go inert and
re-running is a no-op, so **complete one structure per run**. That is the isolation
mechanism. `CORNER_MAX` handles structures more than 6 squares apart for free.

### H7 — A wall end sitting exactly on a passage corner

A T-shape drawn with its shoulders running *full* to the mouth corners still seals, now via
F2 rather than F1. An end sitting exactly at the corner has no corner partner — the corner
with its own stem has a zero-length leg and is skipped — so its only legal partners are
across the opening.

Loosening the passage guard to fire on a single aiming ray would fix it and break trace D1,
where H1's ray legitimately strikes the NW corner leg. **Convention instead:** never leave an
end dangling exactly at a passage corner — chain-draw it to touch, or stop it one grid step
short so the corner becomes inferable. Both variants complete correctly.

### H8 — E1 runs through a corner F2 refused

When a hint sits beyond `CORNER_MAX` from its corner, F2 correctly refuses — and then E1
eats the endpoint anyway, running straight *through* the intended corner to the next wall.
The refusal you designed never surfaces.

Suppressing E1 whenever a refused F2 corner lies on its ray would be a rule keyed to another
rule's refusal — precisely the fragile coupling to avoid. The behaviour is consistent with
"walls never dead-end". Fix it by hinting nearer the corner, or raise `cornerMax` for the run.

### H5 — Exact ties (the reviewed disagreement)

The rules agent proposed lexicographic tie-breaking everywhere. The adversary argued any
invisible tiebreak violates predictability. **Both are right, in different places, and the
split is by visibility:**

- **W1/W2 (welds):** tie-break silently. Either choice produces the same vertex at the same
  coordinates. Invisible to you because there's nothing to see.
- **F1/F2/E1 (construction):** **refuse on exact tie.** These build visibly different walls,
  and no tiebreak rule — nearest, leftmost, lowest id — is something you can predict by
  looking at the map. The flag names both candidates.

Exact ties are *common*, not measure-zero: integer coordinates on roughly-gridded hand-drawn
buildings produce them constantly. Compare squared distances as exact integers.

### Everything else it refuses (recoverable — nudge and re-run)

| Refusal | Message |
| --- | --- |
| Aligned pair beyond `GAP_MAX` | *"aligned but 9 squares apart (max 6)"* |
| Near-collinear beyond `COLL_EPS` | *"nearly collinear — nudge onto line"* |
| Corner leg beyond `CORNER_MAX` | *"corner too far"* |
| Ray finds nothing within `EXT_MAX` | *"dangling end, nothing to grow to"* |
| Extension would land mid-door or mid-window | *"move the stub or the door"* |
| Two candidate corners exactly equidistant | *"ambiguous — two candidates at (x,y) and (x,y)"* |
| Component closed but self-intersecting | *"figure-eight — split at the crossing or redraw"* |
| Closed loop with < 3 edges or near-zero area | degenerate closure |
| Unknown wall class in an open component | won't mutate or fill against it |

---

## 8. Data hygiene, commit, undo

**Simulate in memory; commit in two batches.** One `updateEmbeddedDocuments("Wall", …)` for
W1/W2 coordinate nudges, one `createEmbeddedDocuments("Wall", …)` for all fills. Canvas edges
and intersections recompute automatically on the next perception query
(`APP/client/canvas/geometry/edges/edges.mjs:128-153`) — no manual refresh. Two batches means
two clean undo units and zero mid-run visual churn.

Critically: **a tripped assertion or iteration cap costs you nothing**, because nothing was
written.

**Flags.** `flags` is a `DocumentFlagsField` whose keys are validated as package ids —
`/^[A-Za-z0-9-_]+$/` plus OS-reserved-name exclusions (`APP/common/data/fields.mjs:3990-4008`
→ `BasePackage.validateId`). So `"wall-autocomplete"` is structurally valid and survives DB
round-trips and scene export like any document data.

```json
"flags": { "wall-autocomplete": {
  "generated": true,
  "run": "2026-08-11T…",
  "rule": "F2",
  "sources": ["<wallId>", "<wallId>"],
  "priorC": [x0, y0, x1, y1],
  "keepOpen": true
}}
```

Write flags **in the create/update payload** — that path is guaranteed.
**UNVERIFIED:** whether `Document#setFlag` additionally restricts scopes to *installed*
package ids in v14. One console call settles it: `wallDoc.setFlag("wall-autocomplete", "x", 1)`.
If it throws, the payload path still works.

**Undo-generated** = delete every wall with `flags["wall-autocomplete"].generated`, then
restore `priorC` on the welded ones. Worth its own companion macro.

Generated walls inherit `levels` from the segment that owned the dangling endpoint (F1
refuses if the two donors' `levels` differ). Everything else is the solid preset.

**On refusal: report, don't mark.** Whisper a GM `ChatMessage` listing rule id, reason and
coordinates; `canvas.ping()` each refused endpoint; select the involved walls on the layer so
they highlight. **Do not** create Drawing or Note documents as markers — they persist, pollute
exports, and break the idempotence story by turning a report into state. The flags are the
machine-readable record; chat is the human one.

---

## 9. Open decisions

1. **`keepOpen` ergonomics.** A companion macro on a keybind that toggles the flag on selected
   walls is the obvious shape. Worth building at the same time, or is delete-the-generated-piece
   good enough for v1?
2. **Scope: viewed scene, or selected walls?** Whole scene is simpler and the inert-component
   rule already scopes it. Selection-scoped would be a v2 escape hatch.
3. **Dry-run first?** A `preview: true` mode that reports the mutation list without committing.
   Cheap given P5 is already the only write. Recommended for the first few maps, while you're
   calibrating the tolerances against real drawings.
4. **Tolerance defaults on gridless maps.** `GAP_MAX`/`CORNER_MAX`/`EXT_MAX` are in grid
   squares and D9 already has you setting a sensible square size per scene, so these should
   transfer. Confirm on the first real map.

## 10. Calibration against the real scenes (surveyed 2026-08-11)

Measured via `eval-js` against the live `ardenhaven` world:

| Scene | Walls | Doors | Distinct vertices | Dangling | Grid | Wall classes |
| --- | --- | --- | --- | --- | --- | --- |
| Alchemist's Shop | 8 | 1 | 8 | **0** | 23px | 7 solid, 1 door |
| The Common Room | 61 | 8 | 57 | **2** (264px apart) | 20px | 43 solid, 10 window (`sight:30`), 8 door |
| Undercity Hideout | 0 | — | — | — | — | — |

Three findings that change the build plan:

1. **Every preflight pathology is absent.** Zero non-integer coordinates, zero zero-length
   walls, zero one-directional walls, max coordinate 2018 (vs the 65536 key-collision
   ceiling). The N1/N5 lints are cheap insurance, not urgent work.
2. **Endpoints already coincide exactly.** Alchemist's Shop is 8 walls forming a perfectly
   closed loop — every vertex degree 2, nothing dangling. The Common Room has 57 vertices
   from 122 endpoint instances with only 2 dangling. Foundry's chain-drawing and vertex
   snapping are doing the welding already, so **W1 will rarely fire and `WELD_EPS` is far
   less load-bearing than the gridless analysis feared.** Good — that was the scariest
   tolerance.
3. **`GAP_MAX = 6` was not the problem.** The Common Room's "two dangling ends 264px apart"
   were an artefact of counting degree by exact coordinate: one of the two lies on another
   wall's interior and is therefore *pinned*, not dangling. The engine sees exactly one loose
   end and completes it — see below.

### What the engine actually does to them

Run offline against the exported geometry (`make foundry-walls-test` covers the fixtures;
this was a one-off probe):

| Scene | Result |
| --- | --- |
| Alchemist's Shop | 0 creates, 0 moves, 1 pass. One closed component — correctly inert. |
| The Common Room | **1 create**: `(420,1345)→(420,1405)`, 2 passes, then fully closed. |

That single create is a real finding, not a fixture artefact. The vertical stub at `x=420`
stops at `y=1345`; the room's south wall is at `y=1405`. That is a **60px (3-square) hole** a
token can walk through. Either it wants that wall, or it is an intentional passage that
should carry a door segment so the engine stops offering to fill it.

**These are still finished scenes, not rough-ins** — neither exercises the lazy authoring
path. Tolerance calibration for *that* still needs a map drawn in the new style.

## 11. Status

Built at `foundry/module/pentaryn-walls/`. **Alt+W** previews, **Alt+Shift+W** runs (GM-only,
rebindable in Configure Controls; undo is registered but deliberately unbound).

Mutations that provably cannot affect one another share a pass, so independent rooms settle
in parallel: a 400-wall scene is **128 ms / 2 passes**, down from 22 s / 401 passes. Output is
identical — same sorted order, and only instances with disjoint anchors and disjoint bounding
boxes are batched. `make foundry-walls-test` runs 17 fixtures with
Foundry stopped; `make foundry-walls-sync` copies the module in (tests gate the sync).

| Fixture | Proves |
| --- | --- |
| D1 square house | The headline trace, replayed step for step: F1, then NE/NW/SW/SE corners. |
| D1 in two more draw orders | Output is independent of collection order. |
| D1 output re-run | Idempotence. |
| D2 floating door | Inert components are still obstacles; window pins are legal. |
| D3 L-partition | Shortest-inference-first — the hint preempts the door's long extension. |
| D4 two buildings | The finished building generates nothing and is byte-identical after. |
| T-junction partition closes | The pin decision. Without it no real building ever finishes. |
| 0.43° near-collinear pair | Refuses instead of guessing. |
| Aligned beyond `GAP_MAX` | Refuses, names the distance. |
| Frozen shed in open compound | An inert component still stops a ray. |
| Open door changes nothing | D-2: `ds` is never consulted. |
| Extension landing mid-door | Refuses. |
| Ambiguous corner | Two equal-cost partners for one endpoint → refuses. |
| Diagonal host | `PIN_EPS` stops the rounding oscillation; terminates and is idempotent. |
| Endpoint 1px off a diagonal | Snaps (W2) rather than extending a 2px sliver (E1). |
| L-shaped building | Concave corners need no special rule — six segments in, twelve walls out. |
| Draw long crossing lines | The `#`-then-trim workflow: 4 overlapping lines → exact rectangle, trims only. |
| Trim does not eat a T-junction | The counterexample that forced trim to be a frozen-crossing-set pre-pass. |
| Cave — irregular 8-gon | No windows, no doors, no right angles; corner inference carries it. |
| Round tower — 16 chords | Mitres to the circumscribed vertices; the curve keeps its bulge. |
| One door, one window, two hints | The minimum viable rough-in for a plain room. |
| Lint pathologies | N1/N2/N3/N5 all fire. |
| T-shaped building | One carrier line, two disjoint spans — the stem mouth stays open. |
| Two windows on one line | Three wall segments, as predicted. |
| Two separate interior rooms | No cross-room pairing; `CORNER_MAX` isolates them. |
| Adjacent rooms sharing a spine | Three hints become a four-room layout. |
| Courtyard ring inside a shell | A hole in the footprint; the ring closes independently. |
| Diagonal building, all 45° | Rotation is irrelevant to carrier intersection. |
| Alley between two buildings | The passage guard: two closed buildings, not one fused blob. |
| Aligned hints beyond `GAP_MAX` | E1 refuses instead of laying wall on top of wall. |
| One end aiming into a gap | Still fills — one aim is a T-junction, two is a mouth. |
| Four-way crossroads | Junction inference: one point, four legs, one mutation. |
| Six-room plan, trim style | 7 unmeasured lines → whole building, 0 creates, 1 pass. |
| Six-room plan, hint style | 15 hints → closed, 0 refusals. Was 22 refusals before junctions. |
| Nearest junction wins | Resolves what used to be an ambiguity refusal; stable under nudges. |
| Near-collinear offset sweep | The cliff sits at `COLL_EPS`: fills at 2px, refuses at 3px, never duplicates. |
| Double-line (thick) wall | Two nested rings, no special handling; stable 6px→half a square. |
| Chamfered 45° corner | Mixed-angle junctions; the chamfer is just another wall line. |
| Shallow wedge | F2's glancing guard: near-parallel carriers build no sliver. |
| Wall kinds ×5 | Terrain/invisible/ethereal extend as themselves; doors and windows imply solid; most-blocking wins a mixed bridge. |
| Nesting 1–4 | Inner closes; outer added with `updates: 0`; partition pins on the inert inner; finishing-move connector. |

**Still worth adding:** a 64-gon tower with one segment removed (assert the chord is refused,
not built) and a rough-in drawn by hand in the new style.

Confirmed good but not yet pinned as fixtures (verified by probe): plus/cross with 12 spans,
H and E footprints, zigzag staircase, 30°-rotated square, a diagonal room inside an
axis-aligned shell, room-in-room, corner rooms sharing shell walls, three windows on one
line, sub-grid-step hints, and oversized rooms refusing cleanly on every end.

## 12. What implementation changed

Building it forced five corrections to the design above. All are already in the code and the
rule table; recorded here because the reasoning is what matters next time.

1. **`PIN_EPS = 1px` had to be invented.** The design claimed every topology test could be
   exact-integer after normalization. It can't: `round()` of a hit point on a *diagonal* wall
   never lands exactly on the line. `(0,0)-(1000,997)` hit at `x=501.505` rounds to
   `(502,500)`, which is 0.35px off the carrier — so an "is it pinned?" test demanding
   exactness would say no, the endpoint would stay dangling, and the rule would fire forever.
   `PIN_EPS` is not a fudge factor: it is the *provable* bound on integer rounding (√0.5 =
   0.708), so a rounded foot is guaranteed inside it. That guarantee is load-bearing for
   termination, and the diagonal fixture is its regression test.
2. **E1 needed a glancing-hit guard.** The near-collinear fixture didn't refuse as designed —
   F1 and F2 both correctly declined, and then E1 quietly built a 400px shallow sliver along
   the near-parallel pair. Refuse when the ray meets its target at less than ~2.9°: the hit
   point swings wildly for a tiny input change, and a shallow hit almost always means the two
   walls were meant to be collinear. This also covers the round-tower chord case.
3. **Landing mid-window is fine; only mid-door refuses.** The rule table said both. Trace D2
   contradicts it — the floating door's east extension lands on window `W3` and that's the
   correct answer. A window blocks movement and stays put; a door's midspan becomes a hole the
   moment it opens.
4. **Ambiguity is per-endpoint, not per-instance.** Refusing whenever two instances tie would
   have broken trace D1, whose SW and SE corners have identical cost. They share no endpoint,
   so both get built and the order is irrelevant — tie-break lexicographically. Refuse only
   when *one endpoint* has two equal-cost partners producing different geometry. That is the
   case you can't predict by looking at the map.
5. **Components are report-only.** The design treats "skip inert components" as a step. It
   isn't one: every rule instance requires a dangling endpoint, and a component with a
   dangling endpoint is by definition not closed. Inert components drop out for free, and
   remain obstacles for free. The union-find exists purely to print "3 components, 2 closed".

6. **Trim needed a third guard nobody predicted.** E1 pins to a host by rounding the hit
   point to integers — and on a *diagonal* host that rounded point can land a third of a pixel
   on the **far** side of the line. That hairline overshoot registers as a proper crossing,
   which made the host's own far end look like an overshoot, and trim amputated half the
   diagonal on the second run. Caught only because an idempotence fixture existed. The fix is
   the same `PIN_EPS` reasoning used everywhere else: **a crossing within the rounding band of
   any endpoint is a T-touch, not a crossing.** Worth internalising — every bug in this engine
   so far has been rounding turning a touch into a cross or vice versa.

7. **Cost must be linear length, and F1/F2 must share a tier — but that trade is real.**
   Ranking collinear-fill above corner sealed a T-shaped building's stem. Merging the tiers
   and sorting by *total wall added* fixes it. Note what it costs: under the old squared
   costs, `la² + lb² < (la+lb)²`, so squaring systematically favoured corners over long
   fills. Linear cost makes bridge-wins **more** frequent, which is why the passage guard
   below became necessary rather than optional. Considered and rejected: a min-max cost
   (*minimise the longest single new wall*), which also fixes the T-shape — the passage
   guard is the better fix because it is evidence-shaped and killed three failure classes at
   once, not just this one.
8. **The passage guard is the single highest-value rule added after the design.** Two other
   loose ends aiming into a collinear gap means the gap is a *mouth* — a T's stem, an alley
   between buildings, the throat of an E. One aiming end is an ordinary partition running up
   to a wall line, and still fills. That asymmetry between one aim and two is load-bearing
   and was verified against every fixture. It fixed the E-footprint, the alley fusion, and
   the narrow-mouth T in one predicate.
9. **A weak rule can silently circumvent a strong rule's bound.** `castRay` skips parallel
   segments when hunting a hit, so an aligned wall 10 squares away — which F1 had just
   refused as beyond `GAP_MAX` — was invisible to E1, which happily built 1400px of wall
   lying *on top of* it. The lint that would have caught it runs pre-mutation, so it stayed
   silent until a second run. Generalise: whenever one rule enforces a bound, check that no
   weaker rule reaches the same geometry by another route.

10. **The single biggest generalisation: F2 is junction inference, not corner inference.**
   Every interior junction of a multi-room floorplan is a T or a crossroads. Treating F2 as
   strictly *pairwise* made dense interiors unbuildable in hint style — the four ends meeting
   at one junction produce six equal-cost pairings, which the ambiguity detector correctly
   read as six ways to guess and refused. A six-room plan gave **22 refusals and never
   closed**. Grouping candidate pairs by their shared meeting point and building every leg at
   once took it to **zero refusals**. Carriers agreeing on one point is *stronger* evidence
   than two, not weaker; the old rule was the two-member special case of the general one.
11. **Junction membership must be nearest-only, or the merge is greedy.** The first version
   swallowed anything within `CORNER_MAX`, which re-fused the alley: building B's north end
   *could* reach building A's corner, so it joined. Restricting each end to the **nearest**
   junction it can reach fixes it with no notion of "structure" — B's own corner is closer.
   It also has two properties worth having: it reads as one sentence (*a wall turns at the
   first junction it meets*), and it makes F2 ambiguity **structurally impossible**, because
   an end's candidate junctions all lie on its single outward ray at distinct distances. A
   whole class of refusals disappeared and predictability went *up*. Verified stable under a
   3px nudge and a 50px move of the losing partner.

12. **A tolerance gap between two rules is a place where the engine acts instead of
   refusing.** F1 declines a pair as "not collinear enough" beyond `COLL_EPS` = 2px. E1's
   aligned-wall blocker used the *same* constant. So at a 3px offset a wall was
   simultaneously too far off-line to fill against and too far off-line to block — and E1
   built 900px of new wall running 3px above the existing one, then W2 welded onto it.
   Silent, and only visible by sweeping the offset one pixel at a time.

   The fix is to notice the two constants answer *different questions*. `COLL_EPS` asks "did
   the user mean these as one line". The blocker asks "would this new wall run alongside an
   existing one" — a question about duplicates, whose natural width is **half a lattice
   step**, since the smallest offset the wall tool can deliberately produce is a whole step.
   Now the cliff is at `COLL_EPS` and the far side refuses rather than acts.

   Generalise: whenever two rules consult the same tolerance, check they are asking the same
   question. And **sweep perturbations one pixel at a time** — this class of bug is invisible
   to fixtures that test a single configuration.

13. **Three more unifications, all reusing constants already in the table.** None added a
   concept; each removed an inconsistency where one rule knew something its siblings didn't.
   *(a)* `aimCount` now ignores a ray running **along** a gap rather than into it — a door
   tilted one pixel off its wall line used to read as an aim and blow the passage guard up,
   refusing every fill on that line. *(b)* **F2 gained the glancing guard**: carriers meeting
   shallower than `GLANCE_SIN` form no junction. F2 was the only rule without it, and would
   build a long sliver a few px above an existing wall — the near-collinear band is now
   refused uniformly by F1, F2 and E1 alike. *(c)* **Junction points within `WELD_EPS` are one
   junction**, the same semantics W1 already applies to endpoints; without it, nearest-only
   membership had a knife edge where two candidates 1px apart split a room's corner in two.
14. **A threshold is a cliff, and geometry sitting exactly on one is inherently unstable.** An
   apparent 1px topology flip in an asymmetric-density probe turned out to be a gap of
   *exactly* `GAP_MAX`; a pixel either way lands on opposite sides. That is not a bug and has
   no fix — it is what a threshold is. It does earn an authoring rule (§0 rule 13) and it is
   the reason every refusal message names its number: so the user can stay clear of the edge.

One lint tuning worth knowing: **N4 only reports near-misses at loose ends.** Unrestricted it
fired 12 times on the Common Room, every one a false positive — pairs of endpoints 5px apart
that are the two ends of a deliberately short jamb wall. Real signal buried under noise is
worse than no signal.
