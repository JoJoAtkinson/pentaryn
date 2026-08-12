/**
 * Fixture corpus for the wall-autocomplete engine.
 *
 * Every fixture is a set of wall documents plus an expectation. The traces from
 * playbooks/foundry-wall-autocomplete.md §6 are here verbatim, alongside the adversarial
 * cases that must *refuse* rather than guess.
 *
 * Wall shorthand: w(x0,y0,x1,y1, extra) — solid unless `extra` says otherwise.
 */

let seq = 0;
const w = (x0, y0, x1, y1, extra = {}) => ({
  _id: extra.id ?? `w${++seq}`,
  c: [x0, y0, x1, y1],
  light: 20, move: 20, sight: 20, sound: 20, door: 0, ds: 0, dir: 0, levels: [],
  ...extra
});
/** Foundry's window preset: proximity sight + threshold (walls.mjs:469). */
const win = (x0, y0, x1, y1, extra = {}) => w(x0, y0, x1, y1, {light: 30, sight: 30, ...extra});
const door = (x0, y0, x1, y1, extra = {}) => w(x0, y0, x1, y1, {door: 1, ...extra});

/* -------------------------------------------- */

/** Trace D1 — the square house. Five drawn segments, nine inferred. */
export const squareHouse = () => [
  win(200, 0, 400, 0, {id: "W1"}),
  win(600, 0, 800, 0, {id: "W2"}),
  win(1000, 300, 1000, 600, {id: "W3"}),
  door(400, 1000, 600, 1000, {id: "D1"}),
  w(0, 400, 0, 600, {id: "H1"})
];

/** A closed rectangular shell, hand-drawn with exact corners. */
const box = (tag, x0, y0, x1, y1) => [
  w(x0, y0, x1, y0, {id: `${tag}-n`}),
  w(x1, y0, x1, y1, {id: `${tag}-e`}),
  w(x1, y1, x0, y1, {id: `${tag}-s`}),
  w(x0, y1, x0, y0, {id: `${tag}-w`})
];
const closedShell = (tag = "S") => box(tag, 0, 0, 1000, 1000);

export const FIXTURES = [
  {
    name: "D1 square house — 3 windows, 1 door, 1 hint",
    why: "The headline trace. Must complete the shell and close the component.",
    walls: squareHouse(),
    opts: {gridSize: 100},
    expect: {creates: 9, updates: 0, refusals: 0, iterations: 3, allClosed: true}
  },
  {
    name: "D1 in a different draw order",
    why: "Output must not depend on the order the walls happen to sit in the collection.",
    walls: [squareHouse()[3], squareHouse()[0], squareHouse()[4], squareHouse()[2], squareHouse()[1]],
    opts: {gridSize: 100},
    expect: {creates: 9, refusals: 0, iterations: 3, allClosed: true, sameCreatesAs: "D1 square house — 3 windows, 1 door, 1 hint"}
  },
  {
    name: "D1 reversed draw order",
    why: "Second order permutation — three orderings is the real invariance check.",
    walls: [...squareHouse()].reverse(),
    opts: {gridSize: 100},
    expect: {creates: 9, refusals: 0, iterations: 3, allClosed: true, sameCreatesAs: "D1 square house — 3 windows, 1 door, 1 hint"}
  },
  {
    name: "D1 output re-run — idempotence",
    why: "Running the macro twice must be a no-op the second time.",
    rerunOf: "D1 square house — 3 windows, 1 door, 1 hint",
    opts: {gridSize: 100},
    expect: {creates: 0, updates: 0, refusals: 0, allClosed: true}
  },
  {
    name: "D2 floating door inside a completed shell",
    why: "A door with no partners grows both ways to the nearest wall. Proves an inert component is still an obstacle.",
    rerunOf: "D1 square house — 3 windows, 1 door, 1 hint",
    add: [door(300, 400, 400, 400, {id: "D2"})],
    opts: {gridSize: 100},
    expect: {creates: 2, refusals: 0, iterations: 2, allClosed: true,
             mustCreate: [[300, 400, 0, 400], [400, 400, 1000, 400]]}
  },
  {
    name: "D3 L-partition — door halfway across, steered by a hint",
    why: "The user's exact scenario. The hint's short inference must preempt the door's long one.",
    walls: [...closedShell(), door(500, 600, 500, 1000, {id: "D3"}), w(200, 600, 400, 600, {id: "H2"})],
    opts: {gridSize: 100},
    expect: {creates: 2, refusals: 0, iterations: 2, allClosed: true,
             mustCreate: [[400, 600, 500, 600], [200, 600, 0, 600]],
             mustNotCreate: [[500, 600, 500, 0]]}
  },
  {
    name: "D4 two buildings, one already closed",
    why: "The finished building must be untouched and must generate nothing.",
    walls: [
      ...closedShell("A").map(x => ({...x, c: x.c.map(v => v * 0.6)})),
      w(2000, 0, 2000, 600, {id: "B-w"}),
      w(2000, 600, 2600, 600, {id: "B-s"}),
      w(2600, 600, 2600, 0, {id: "B-e"}),
      win(2200, 0, 2400, 0, {id: "WB"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 2, updates: 0, refusals: 0, allClosed: true,
             mustCreate: [[2200, 0, 2000, 0], [2400, 0, 2600, 0]]}
  },
  {
    name: "T-junction partition reaches closed",
    why: "The pin decision. Without pins a partition ending on a wall's interior would dangle forever and no real building would ever finish.",
    walls: [...closedShell(), w(500, 0, 500, 1000, {id: "P"})],
    opts: {gridSize: 100},
    expect: {creates: 0, updates: 0, refusals: 0, allClosed: true}
  },
  {
    name: "near-collinear 0.43° pair — must refuse",
    why: "The tolerance band where gap-fill and corner both look plausible. Guessing here is what makes a tool feel unpredictable.",
    walls: [w(1000, 1000, 1400, 1000, {id: "A"}), w(1450, 1003, 1850, 1006, {id: "B"})],
    opts: {gridSize: 100},
    expect: {creates: 0, updates: 0, refusalMatches: /collinear|glancing/}
  },
  {
    name: "aligned but beyond GAP_MAX — must refuse",
    why: "A 10-square gap is a deliberate opening or a different building, not a missing wall.",
    walls: [w(0, 0, 400, 0, {id: "A"}), w(1400, 0, 1800, 0, {id: "B"})],
    opts: {gridSize: 100},
    expect: {creates: 0, refusalMatches: /aligned .* squares apart/}
  },
  {
    name: "frozen shed inside an open compound",
    why: "An inert component must still stop a ray. Otherwise the stub spears through the shed.",
    walls: [
      w(0, 0, 3000, 0, {id: "C-n"}), w(3000, 0, 3000, 2000, {id: "C-e"}),
      w(3000, 2000, 0, 2000, {id: "C-s"}), w(0, 2000, 0, 0, {id: "C-w"}),
      w(1000, 800, 1600, 800, {id: "H-n"}), w(1600, 800, 1600, 1400, {id: "H-e"}),
      w(1600, 1400, 1000, 1400, {id: "H-s"}), w(1000, 1400, 1000, 800, {id: "H-w"}),
      w(400, 1000, 600, 1000, {id: "stub"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 2, refusals: 0,
             mustCreate: [[600, 1000, 1000, 1000], [400, 1000, 0, 1000]]}
  },
  {
    name: "open door state changes nothing",
    why: "Regression guard for D-2: an open door is transparent to Foundry's collision API, so inference must never consult it.",
    walls: [...closedShell(), door(500, 600, 500, 1000, {id: "D3", ds: 1}), w(200, 600, 400, 600, {id: "H2"})],
    opts: {gridSize: 100},
    expect: {creates: 2, refusals: 0, sameCreatesAs: "D3 L-partition — door halfway across, steered by a hint"}
  },
  {
    name: "extension landing mid-door — must refuse",
    why: "A wall dead-ending into a door's midspan becomes a hole the moment the door opens.",
    walls: [
      w(0, 0, 1000, 0, {id: "n"}), w(1000, 0, 1000, 400, {id: "e1"}),
      door(1000, 400, 1000, 600, {id: "dr"}), w(1000, 600, 1000, 1000, {id: "e2"}),
      w(1000, 1000, 0, 1000, {id: "s"}), w(0, 1000, 0, 0, {id: "wst"}),
      w(700, 500, 800, 500, {id: "stub"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 1, refusalMatches: /mid-door/}
  },
  {
    name: "a loose end joins its nearest junction",
    why: "Was an ambiguity refusal: two candidate corners with equal TOTAL cost. Nearest-junction resolves it — and structurally, an end's candidate junctions all lie on its one outward ray at distinct distances, so nearest is always unique. Verified stable under a 3px nudge and a 50px move of the far partner.",
    walls: [
      w(500, 600, 500, 500, {id: "e"}),
      w(200, 400, 300, 400, {id: "p1"}),
      w(300, 300, 400, 300, {id: "p2"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 2, mustCreate: [[500, 500, 500, 400], [300, 400, 500, 400]],
             mustNotCreate: [[500, 500, 500, 300]]}
  },
  {
    name: "four-way crossroads junction",
    why: "Every interior junction of a multi-room plan is a T or a cross. Pairwise-only F2 saw six equal-cost pairings here and refused them all; carriers agreeing on ONE point is stronger evidence, not weaker.",
    walls: [
      ...box("S", 0, 0, 1200, 1200),
      w(200, 600, 400, 600, {id: "h1a"}), w(800, 600, 1000, 600, {id: "h1b"}),
      w(600, 200, 600, 400, {id: "v1a"}), w(600, 800, 600, 1000, {id: "v1b"})
    ],
    opts: {gridSize: 100},
    expect: {refusals: 0, allClosed: true,
             mustCreate: [[400, 600, 600, 600], [800, 600, 600, 600],
                          [600, 400, 600, 600], [600, 800, 600, 600]]}
  },
  {
    name: "six-room floorplan — long lines then trim",
    why: "The overshoot style. Seven unmeasured lines poking past everything become the whole building: no creates at all, pure trim, one pass, zero refusals.",
    walls: [
      w(-150, 0, 1950, 0, {id: "n"}), w(-150, 1200, 1950, 1200, {id: "s"}),
      w(0, -150, 0, 1350, {id: "wst"}), w(1800, -150, 1800, 1350, {id: "e"}),
      w(600, -150, 600, 1350, {id: "v1"}), w(1200, -150, 1200, 1350, {id: "v2"}),
      w(-150, 600, 1350, 600, {id: "h1"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 0, updates: 7, refusals: 0, iterations: 1, allClosed: true, components: 1,
             idempotent: true}
  },
  {
    name: "six-room floorplan — hints only",
    why: "The undershoot style on the same building. Needs the junction rule: pairwise-only F2 produced 22 refusals here and never closed.",
    walls: [
      w(200, 0, 400, 0, {id: "n1"}), w(800, 0, 1000, 0, {id: "n2"}), w(1400, 0, 1600, 0, {id: "n3"}),
      w(200, 1200, 400, 1200, {id: "s1"}), w(800, 1200, 1000, 1200, {id: "s2"}), w(1400, 1200, 1600, 1200, {id: "s3"}),
      w(0, 200, 0, 400, {id: "w1"}), w(0, 800, 0, 1000, {id: "w2"}), w(1800, 400, 1800, 800, {id: "e1"}),
      w(600, 200, 600, 400, {id: "v1a"}), w(600, 800, 600, 1000, {id: "v1b"}),
      w(1200, 200, 1200, 400, {id: "v2a"}), w(1200, 800, 1200, 1000, {id: "v2b"}),
      w(200, 600, 400, 600, {id: "h1a"}), w(800, 600, 1000, 600, {id: "h1b"})
    ],
    opts: {gridSize: 100},
    expect: {refusals: 0, allClosed: true, components: 1}
  },
  {
    name: "diagonal host — integer rounding must still terminate",
    why: "The rounded hit point never lands exactly on a diagonal line, so the pin test can never be exact. pinEps=1 (the provable rounding bound) is what stops this re-firing forever.",
    walls: [w(0, 0, 1000, 997, {id: "diag"}), w(200, 500, 300, 500, {id: "stub"})],
    opts: {gridSize: 100},
    expect: {creates: 1, mustCreate: [[300, 500, 502, 500]], idempotent: true}
  },
  {
    name: "endpoint just off a diagonal snaps rather than extends",
    why: "Same geometry, stub 1px from the wall instead of 200. Inside the weld band the right answer is 'you meant to touch this', not a 2px sliver of new wall.",
    walls: [w(0, 0, 1000, 997, {id: "diag"}), w(400, 500, 500, 500, {id: "stub"})],
    opts: {gridSize: 100},
    expect: {creates: 0, updates: 1, idempotent: true}
  },
  {
    name: "L-shaped building — one corner turns inward",
    why: "Concavity is not a special case: F2 intersects carriers and never asks which way the corner turns. What it needs is one informative segment per wall LINE — six sides, six segments.",
    walls: [
      win(200, 0, 400, 0, {id: "n"}),        // top,    y=0
      w(600, 150, 600, 250, {id: "e"}),      // right,  x=600
      w(450, 400, 550, 400, {id: "inner-h"}),// inner,  y=400
      w(400, 550, 400, 650, {id: "inner-v"}),// inner,  x=400
      door(150, 800, 250, 800, {id: "s"}),   // bottom, y=800
      win(0, 300, 0, 500, {id: "wst"})       // left,   x=0
    ],
    opts: {gridSize: 100},
    expect: {creates: 12, refusals: 0, allClosed: true,
             mustCreate: [[450, 400, 400, 400], [400, 550, 400, 400]]}
  },
  {
    name: "draw long crossing lines, let it trim",
    why: "The AutoCAD workflow. Four overlapping lines with every end hanging in space become an exact rectangle — no fills, no extensions, only trims.",
    walls: [
      w(-100, 0, 700, 0, {id: "top"}),
      w(-100, 600, 700, 600, {id: "bot"}),
      w(0, -100, 0, 700, {id: "lft"}),
      w(600, -100, 600, 700, {id: "rgt"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 0, updates: 4, refusals: 0, allClosed: true, idempotent: true}
  },
  {
    name: "trim does not eat a T-junction",
    why: "The counterexample that forced trim to be a single-shot pass over proper crossings. A partition T-ing into a long wall looks identical to an overshoot once trimmed.",
    walls: [...closedShell(), w(500, 0, 500, 600, {id: "part"})],
    opts: {gridSize: 100},
    expect: {creates: 1, updates: 0, mustNotCreate: [[500, 0, 500, 0]]}
  },
  {
    name: "cave — irregular 8-sided outline, gaps at every vertex",
    why: "No windows, no doors, no right angles. Corner inference has to carry the whole thing.",
    walls: (() => {
      const V = [[100, 100], [400, 60], [700, 150], [850, 400], [700, 700], [400, 750], [150, 600], [60, 350]];
      return V.map((p, i) => {
        const q = V[(i + 1) % V.length];
        const at = f => [Math.round(p[0] + f * (q[0] - p[0])), Math.round(p[1] + f * (q[1] - p[1]))];
        const [ax, ay] = at(0.15), [bx, by] = at(0.85);
        return w(ax, ay, bx, by, {id: `cave${i}`});
      });
    })(),
    opts: {gridSize: 100},
    expect: {creates: 16, refusals: 0, allClosed: true}
  },
  {
    name: "round tower — 16 chords, mitred up",
    why: "The user's 'many walls to simulate a circle'. Adjacent carriers meet at the circumscribed vertex, so the curve keeps its bulge instead of being short-circuited to a chord.",
    walls: (() => {
      const N = 16, R = 400, C = 2000;
      const pt = k => [C + R * Math.cos(2 * Math.PI * k / N), C + R * Math.sin(2 * Math.PI * k / N)];
      const out = [];
      for (let k = 0; k < N; k++) {
        const p = pt(k), q = pt(k + 1);
        const at = f => [Math.round(p[0] + f * (q[0] - p[0])), Math.round(p[1] + f * (q[1] - p[1]))];
        const [ax, ay] = at(0.2), [bx, by] = at(0.8);
        out.push(w(ax, ay, bx, by, {id: `arc${k}`}));
      }
      return out;
    })(),
    opts: {gridSize: 100},
    expect: {creates: 32, refusals: 0, allClosed: true}
  },
  {
    name: "one door, one window, two hint walls",
    why: "The minimum viable rough-in for a plain room — answers 'what if a side has nothing on it'.",
    walls: [
      win(400, 0, 600, 0, {id: "n"}),
      door(1000, 400, 1000, 600, {id: "e"}),
      w(400, 1000, 600, 1000, {id: "s-hint"}),
      w(0, 400, 0, 600, {id: "w-hint"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 8, refusals: 0, iterations: 2, allClosed: true}
  },
  {
    name: "T-shaped building — one carrier line, two disjoint spans",
    why: "The priority bug. y=300 carries the left and right shoulders as separate spans; ranking F1 above F2 bridged the stem opening and sealed the building shut. F1 and F2 must share a tier and compete on wall-length-added.",
    walls: [
      w(400, 0, 500, 0, {id: "n"}),
      w(900, 100, 900, 200, {id: "e"}),
      w(700, 300, 800, 300, {id: "sh-r"}),
      w(600, 500, 600, 700, {id: "stem-r"}),
      w(400, 900, 500, 900, {id: "s"}),
      w(300, 500, 300, 700, {id: "stem-l"}),
      w(100, 300, 200, 300, {id: "sh-l"}),
      w(0, 100, 0, 200, {id: "wst"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 16, refusals: 0, allClosed: true,
             mustNotCreate: [[200, 300, 700, 300]]}
  },
  {
    name: "two windows on one wall line make three wall segments",
    why: "The user's stated expectation, verbatim: two windows on a wall means three segments — one between them and one off each end.",
    walls: [
      win(200, 0, 300, 0, {id: "n1"}),
      win(600, 0, 700, 0, {id: "n2"}),
      w(1000, 400, 1000, 600, {id: "e"}),
      w(400, 1000, 600, 1000, {id: "s"}),
      w(0, 400, 0, 600, {id: "wst"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 9, refusals: 0, allClosed: true,
             mustCreate: [[300, 0, 600, 0], [200, 0, 0, 0], [700, 0, 1000, 0]]}
  },
  {
    name: "two separate interior rooms in one shell",
    why: "Multiple interior structures, hinted independently. Cross-structure pairings must lose to the correct ones — CORNER_MAX is what isolates them.",
    walls: [
      ...box("S", 0, 0, 2000, 1600),
      w(600, 1200, 600, 1400, {id: "Av"}),
      w(200, 1000, 400, 1000, {id: "Ah"}),
      w(1400, 200, 1400, 400, {id: "Bv"}),
      w(1600, 600, 1800, 600, {id: "Bh"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 8, refusals: 0, allClosed: true,
             mustCreate: [[400, 1000, 600, 1000], [200, 1000, 0, 1000]],
             mustNotCreate: [[400, 1000, 1400, 1000]]}
  },
  {
    name: "adjacent interior rooms sharing a wall",
    why: "Three hints become a four-room layout: the spine reaches the shell both ways, the shelves reach the spine.",
    walls: [
      ...box("S", 0, 0, 1800, 1200),
      w(900, 400, 900, 800, {id: "mid"}),
      w(300, 600, 500, 600, {id: "topL"}),
      w(1300, 600, 1500, 600, {id: "topR"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 6, refusals: 0, allClosed: true,
             mustCreate: [[900, 400, 900, 0], [900, 800, 900, 1200], [500, 600, 900, 600]]}
  },
  {
    name: "courtyard — a closed ring inside a closed shell",
    why: "A hole in the footprint. The inner ring becomes its own component and closes independently; the shell is never touched.",
    walls: [
      ...box("S", 0, 0, 2000, 2000),
      w(700, 900, 700, 1100, {id: "cw"}),
      w(1300, 900, 1300, 1100, {id: "ce"}),
      w(900, 700, 1100, 700, {id: "cn"}),
      w(900, 1300, 1100, 1300, {id: "cs"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 8, updates: 0, refusals: 0, allClosed: true}
  },
  {
    name: "diagonal building — every side at 45°",
    why: "Nothing axis-aligned. Corner inference is carrier intersection, so rotation is irrelevant.",
    walls: [
      w(700, 200, 800, 300, {id: "d1"}),
      w(800, 700, 700, 800, {id: "d2"}),
      w(300, 800, 200, 700, {id: "d3"}),
      w(200, 300, 300, 200, {id: "d4"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 8, refusals: 0, allClosed: true}
  },
  {
    name: "alley between two buildings — passage guard",
    why: "Both north walls are collinear and the 580px alley bridge is CHEAPER than either building's corner (620), so cost alone seals it into one fused blob. Two loose ends aiming into the gap say 'mouth, not missing wall'.",
    walls: [
      w(100, 0, 240, 0, {id: "An"}), w(500, 360, 500, 600, {id: "Ae"}),
      w(150, 800, 350, 800, {id: "As"}), w(0, 300, 0, 500, {id: "Aw"}),
      w(820, 0, 1000, 0, {id: "Bn"}), w(1100, 300, 1100, 500, {id: "Be"}),
      w(750, 800, 950, 800, {id: "Bs"}), w(600, 400, 600, 600, {id: "Bw"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 16, refusals: 0, allClosed: true, components: 2,
             mustNotCreate: [[240, 0, 820, 0]],
             mustCreate: [[240, 0, 500, 0], [600, 400, 600, 0]]}
  },
  {
    name: "aligned hints beyond GAP_MAX, inside a shell",
    why: "F1 refuses the 10-square gap, but E1 skips parallels when ray-casting — so it used to build 1400px of wall lying on top of the other hint, silently doing what GAP_MAX had just refused.",
    walls: [
      ...box("S", 0, 0, 2000, 1000),
      w(200, 500, 400, 500, {id: "a"}),
      w(1400, 500, 1600, 500, {id: "b"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 2, refusals: 2, refusalMatches: /squares apart/,
             mustNotCreate: [[1400, 500, 0, 500], [400, 500, 2000, 500]]}
  },
  {
    name: "one end aiming into a gap still fills",
    why: "The asymmetry that makes the passage guard safe: two aims is a mouth, one aim is an ordinary partition running up to a wall line. Stub placed so the fill (400) is strictly cheaper than either corner (450) — at equal cost the engine correctly refuses instead.",
    walls: [
      ...box("S", 0, 0, 1200, 800),
      w(200, 400, 400, 400, {id: "left"}),
      w(800, 400, 1000, 400, {id: "right"}),
      w(600, 650, 600, 750, {id: "stub"})
    ],
    opts: {gridSize: 100},
    expect: {mustCreate: [[400, 400, 800, 400]]}
  },
  {
    name: "near-collinear offset — fills at 2px, refuses at 3px, never duplicates",
    why: "The perturbation test. Between COLL_EPS and half a lattice step there used to be a band where F1 refused as not-collinear-enough while E1 quietly built 900px of wall running 3px above an existing one, then welded onto it. The cliff must be at COLL_EPS and the far side must refuse, not act.",
    walls: [
      ...box("S", 0, 0, 1600, 1000),
      w(300, 500, 600, 500, {id: "a"}),
      w(900, 503, 1200, 503, {id: "b"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 2, refusals: 2, refusalMatches: /nearly collinear .*nudge onto the line/,
             mustNotCreate: [[600, 500, 900, 503], [900, 503, 0, 503]]}
  },
  {
    name: "near-collinear offset — 2px still fills",
    why: "The other side of the same cliff. Inside COLL_EPS the two hints are one wall line.",
    walls: [
      ...box("S", 0, 0, 1600, 1000),
      w(300, 500, 600, 500, {id: "a"}),
      w(900, 502, 1200, 502, {id: "b"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 3, refusals: 0, mustCreate: [[600, 500, 900, 502]]}
  },
  {
    name: "double-line (thick) wall — two nested rings",
    why: "Battlemaps draw walls as two parallel lines. Nothing special is needed: nearest-junction membership keeps each ring's corners to itself. Verified stable for separations from 6px to half a square.",
    walls: [
      w(50, 0, 550, 0, {id: "on"}), w(600, 50, 600, 550, {id: "oe"}),
      w(550, 600, 50, 600, {id: "os"}), w(0, 550, 0, 50, {id: "ow"}),
      w(60, 10, 540, 10, {id: "in"}), w(590, 60, 590, 540, {id: "ie"}),
      w(540, 590, 60, 590, {id: "is"}), w(10, 540, 10, 60, {id: "iw"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 16, refusals: 0, allClosed: true, components: 2}
  },
  {
    name: "chamfered corner — 45° cut on an axis-aligned room",
    why: "Mixed-angle junctions. The chamfer is just another wall line, so it needs its own hint and nothing else.",
    walls: [
      w(100, 0, 300, 0, {id: "n"}), w(450, 50, 550, 150, {id: "ch"}),
      w(600, 300, 600, 500, {id: "e"}), w(200, 600, 400, 600, {id: "s"}),
      w(0, 200, 0, 400, {id: "wst"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 10, refusals: 0, allClosed: true,
             mustCreate: [[300, 0, 400, 0], [450, 50, 400, 0]]}
  },
  {
    name: "shallow wedge — near-parallel carriers build no sliver",
    why: "F2 was the only rule without a glancing guard. A 1.1° carrier pair built a long sliver running a few px above an existing wall — F1 refuses that band on COLL_EPS, E1 refuses it on GLANCE_SIN, F2 built it. Same constant now guards all three.",
    walls: [w(0, 0, 400, 0, {id: "a"}), w(900, 9, 1300, 17, {id: "b"})],
    opts: {gridSize: 100},
    expect: {creates: 0, refusalMatches: /nearly collinear/}
  },
  {
    name: "nesting 1 — inner shed alone, closes",
    why: "Order of operations, step 1. The inner object must reach CLOSED before you start the outer — that is the whole precondition of the workflow, and the report tells you.",
    walls: [
      w(400, 300, 600, 300, {id: "In"}), w(700, 400, 700, 600, {id: "Ie"}),
      w(400, 700, 600, 700, {id: "Is"}), w(300, 400, 300, 600, {id: "Iw"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 8, refusals: 0, allClosed: true, components: 1}
  },
  {
    name: "nesting 2 — outer added, inner untouched",
    why: "Step 2. The closed inner is inert: it generates nothing and is not mutated, while remaining a solid obstacle. `updates: 0` is the proof it was not touched.",
    rerunOf: "nesting 1 — inner shed alone, closes",
    add: [
      w(400, 0, 600, 0, {id: "On"}), w(1000, 400, 1000, 600, {id: "Oe"}),
      w(400, 1000, 600, 1000, {id: "Os"}), w(0, 400, 0, 600, {id: "Ow"})
    ],
    opts: {gridSize: 100},
    expect: {creates: 8, updates: 0, refusals: 0, allClosed: true, components: 2}
  },
  {
    name: "nesting 3 — partition pins on the inert inner",
    why: "An inert component is ignored for inference but still stops a ray. The partition reaches the outer wall one way and the shed the other.",
    rerunOf: "nesting 2 — outer added, inner untouched",
    add: [w(100, 500, 200, 500, {id: "part"})],
    opts: {gridSize: 100},
    expect: {creates: 2, refusals: 0, allClosed: true,
             mustCreate: [[100, 500, 0, 500], [200, 500, 300, 500]]}
  },
  {
    name: "nesting 4 — the finishing move",
    why: "Connecting inner to outer is left as a manual move by design. In practice you draw one stub off the inner and the engine runs it to the outer wall.",
    rerunOf: "nesting 2 — outer added, inner untouched",
    add: [w(700, 500, 850, 500, {id: "conn"})],
    opts: {gridSize: 100},
    expect: {creates: 1, refusals: 0, allClosed: true,
             mustCreate: [[850, 500, 1000, 500]]}
  },
  {
    name: "lint — the pathologies",
    why: "All schema-legal, all invisible to Foundry's own machinery, all worth naming.",
    walls: [
      w(100, 100, 100, 100, {id: "zero"}),
      w(0, 0, 400, 0, {id: "dup1"}),
      w(0, 0, 400, 0, {id: "dup2"}),
      w(600, 0, 900, 0, {id: "ov1"}),
      w(800, 0, 1200, 0, {id: "ov2"}),
      door(2000, 0, 2000, 400, {id: "dr"}),
      w(1800, 200, 2200, 200, {id: "crosser"}),
      w(70000, 0, 70000, 100, {id: "huge"})
    ],
    opts: {gridSize: 100},
    expect: {lintCodes: ["N1", "N2", "N3", "N5"]}
  }
];
