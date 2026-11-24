/**
 * Generated maps for the simulator (Fable's review §5, and §4's "single-file overfitting risk": the live rounds
 * all ran on one geometry). Each map is an ASCII floor ('#' rock), its rooms (where tokens are placed and dropped)
 * and its doors: a door is a line (squares) across a corridor, with the cells it closes for the planner when shut.
 *
 *   tJunction    a corridor (1 or 2 wide) from room A to room B with a branch down to room C; a door on one arm
 *   corridor2    rooms A and B joined by a two-wide corridor; a two-cell door in it
 *   diagonal     rooms A and B joined by a diagonal passage; a door across it, on the diagonal
 *   deadEnd      a room with a one-wide corridor that ends in rock, and a door out to room B
 *   hard         the ZZ H Dungeon (rooms A and B, the one-wide connector, door (11, 5)), as the live rounds used it
 *   tunnel       (0.10 L3) rooms A and B joined by a one-wide tunnel 10-16 long, sometimes with a bend; a door at B's
 *                mouth: a party queued in it, its leader at the back or the front
 *   hall         (0.10 L3) two big rooms joined by a two- or three-wide corridor with a door: groups up to 24
 *   station      (0.10 L3) one of Joe's ZZ Playground stations on the square grid (test/fixtures/stations.json, from
 *                the playground's stations.json), thin walls and doors as drawn, its scenario's tokens and points
 */

import { readFileSync } from "node:fs";
import { DUNGEON } from "../fixtures/dungeon.mjs";
import { gridWorld } from "../fixtures/grid.mjs";

function blank(W, H) { return Array.from({ length: H }, () => Array(W).fill("#")); }
function carve(g, i0, j0, i1, j1) { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) g[i][j] = "."; }
const cellsOf = (g, i0, j0, i1, j1) => {
  const out = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (g[i]?.[j] === ".") out.push({ i, j });
  return out;
};

/** A vertical door line across column j's cell(s) rows i0..i1 (a corridor running left-right). */
const vDoor = (id, i0, i1, j) => ({ id, a: { x: j + 0.5, y: i0 }, b: { x: j + 0.5, y: i1 + 1 }, cells: Array.from({ length: i1 - i0 + 1 }, (_, k) => ({ i: i0 + k, j })) });
/** A horizontal door line across row i's cell(s) cols j0..j1 (a corridor running up-down). */
const hDoor = (id, i, j0, j1) => ({ id, a: { x: j0, y: i + 0.5 }, b: { x: j1 + 1, y: i + 0.5 }, cells: Array.from({ length: j1 - j0 + 1 }, (_, k) => ({ i, j: j0 + k })) });

export function tJunction(rand) {
  const W = 23, H = 16, g = blank(W, H);
  const wide = rand() < 0.4 ? 2 : 1;
  carve(g, 1, 1, 6, 6);                    // A
  carve(g, 1, 16, 6, 21);                  // B
  carve(g, 11, 8, 14, 14);                 // C
  carve(g, 3, 7, 3 + wide - 1, 15);        // the arm A-B
  carve(g, 3, 11, 10, 11 + wide - 1);      // the stem down to C
  const doors = [rand() < 0.5 ? vDoor("d1", 3, 3 + wide - 1, 14) : hDoor("d1", 8, 11, 11 + wide - 1)];
  return { name: `tJunction${wide}`, rows: g.map(r => r.join("")), doors,
    rooms: { A: cellsOf(g, 1, 1, 6, 6), B: cellsOf(g, 1, 16, 6, 21), C: cellsOf(g, 11, 8, 14, 14), way: [...cellsOf(g, 3, 7, 4, 15), ...cellsOf(g, 5, 11, 10, 12)] } };
}

export function corridor2(rand) {
  const W = 24, H = 13, g = blank(W, H);
  carve(g, 1, 1, 11, 7);                   // A
  carve(g, 1, 16, 11, 22);                 // B
  const r0 = 4 + Math.floor(rand() * 4);
  carve(g, r0, 8, r0 + 1, 15);             // the two-wide corridor
  return { name: "corridor2", rows: g.map(r => r.join("")), doors: [vDoor("d1", r0, r0 + 1, 11 + Math.floor(rand() * 3))],
    rooms: { A: cellsOf(g, 1, 1, 11, 7), B: cellsOf(g, 1, 16, 11, 22), way: cellsOf(g, r0, 8, r0 + 1, 15) } };
}

export function diagonal(rand) {
  const W = 22, H = 18, g = blank(W, H);
  carve(g, 1, 1, 5, 6);                    // A
  carve(g, 12, 15, 16, 20);                // B
  // A two-thick staircase from A's corner to B's: (5+k, 6+k) and (5+k, 7+k) for k = 0..9.
  for (let k = 0; k <= 9; k++) { g[5 + k][6 + k] = "."; g[5 + k][7 + k] = "."; g[6 + k][6 + k] = "."; }
  // A door across the passage, on the diagonal (x + y constant) through the centre of cell (5+m, 6+m): shut, that cell
  // is rock for the planner, and the two diagonal steps past it are corner squeezes (refused).
  const m = 3 + Math.floor(rand() * 4);
  const ci = 5 + m, cj = 6 + m;
  const door = { id: "d1", a: { x: cj - 1, y: ci + 2 }, b: { x: cj + 2, y: ci - 1 }, cells: [{ i: ci, j: cj }] };
  const way = [];
  for (let k = 0; k <= 9; k++) way.push({ i: 5 + k, j: 6 + k }, { i: 5 + k, j: 7 + k });
  return { name: "diagonal", rows: g.map(r => r.join("")), doors: [door], rooms: { A: cellsOf(g, 1, 1, 5, 6), B: cellsOf(g, 12, 15, 16, 20), way } };
}

export function deadEnd(rand) {
  const W = 22, H = 14, g = blank(W, H);
  carve(g, 1, 1, 8, 9);                    // A
  carve(g, 1, 14, 8, 20);                  // B
  carve(g, 4, 10, 4, 13);                  // the door corridor A-B
  const col = 3 + Math.floor(rand() * 5);
  carve(g, 9, col, 12, col);               // the dead end, down from A
  return { name: "deadEnd", rows: g.map(r => r.join("")), doors: [vDoor("d1", 4, 4, 11 + Math.floor(rand() * 2))],
    rooms: { A: cellsOf(g, 1, 1, 8, 9), B: cellsOf(g, 1, 14, 8, 20), end: cellsOf(g, 9, col, 12, col), way: cellsOf(g, 4, 10, 4, 13) } };
}

export function hard() {
  const rows = DUNGEON.trim().split("\n").map(r => r.trim());
  const g = rows.map(r => [...r]);
  return { name: "hard", rows, doors: [vDoor("d1", 5, 5, 11)],
    rooms: { A: cellsOf(g, 1, 1, 10, 10), B: cellsOf(g, 1, 13, 10, 22), way: cellsOf(g, 5, 11, 5, 12) } };
}

export function tunnel(rand) {
  const L = 10 + Math.floor(rand() * 7), bend = rand() < 0.35;
  const W = 7 + L + 7 + 1, H = 13, g = blank(W, H);
  carve(g, 2, 1, 10, 6);                   // A
  const r0 = 4 + Math.floor(rand() * 3);
  const way = [];
  if (!bend) { carve(g, r0, 7, r0, 6 + L); for (let j = 7; j <= 6 + L; j++) way.push({ i: r0, j }); }
  else {
    const half = Math.floor(L / 2), r1 = r0 + 2 <= 9 ? r0 + 2 : r0 - 2;
    carve(g, r0, 7, r0, 6 + half); for (let j = 7; j <= 6 + half; j++) way.push({ i: r0, j });
    const [ra, rb] = r0 < r1 ? [r0, r1] : [r1, r0];
    carve(g, ra, 6 + half, rb, 6 + half); for (let i = ra; i <= rb; i++) if (i !== r0) way.push({ i, j: 6 + half });
    carve(g, r1, 6 + half, r1, 6 + L); for (let j = 7 + half; j <= 6 + L; j++) way.push({ i: r1, j });
  }
  const b0 = 7 + L;
  carve(g, 2, b0, 10, b0 + 5);             // B
  const last = way.at(-1);
  return { name: `tunnel${bend ? "Bend" : ""}`, rows: g.map(r => r.join("")), doors: [vDoor("d1", last.i, last.i, last.j)],
    rooms: { A: cellsOf(g, 2, 1, 10, 6), B: cellsOf(g, 2, b0, 10, b0 + 5), way } };
}

export function hall(rand) {
  const W = 34, H = 16, g = blank(W, H);
  carve(g, 1, 1, 14, 13);                  // A
  carve(g, 1, 20, 14, 32);                 // B
  const wide = 2 + Math.floor(rand() * 2), r0 = 4 + Math.floor(rand() * 6);
  carve(g, r0, 14, r0 + wide - 1, 19);
  return { name: `hall${wide}`, rows: g.map(r => r.join("")), doors: [vDoor("d1", r0, r0 + wide - 1, 16 + Math.floor(rand() * 2))],
    rooms: { A: cellsOf(g, 1, 1, 14, 13), B: cellsOf(g, 1, 20, 14, 32), way: cellsOf(g, r0, 14, r0 + wide - 1, 19) } };
}

/** Joe's playground stations on the square grid (0.10 L3; test/fixtures/stations.json). */
export const STATIONS = Object.freeze(JSON.parse(readFileSync(new URL("../fixtures/stations.json", import.meta.url), "utf8")).stations);

/**
 * One station as a map, its scenario applied: 24 × 24 squares of floor with its thin walls (one-way ones too) and
 * doors (their states: an open door can be shut; a closed, locked or secret one stays shut), its tokens where the
 * scenario puts them (a rider on its mount is left out: the simulator has no stacks) and its named points.
 */
export function station(id, scenario = "default") {
  const st = STATIONS.find(x => x.id === id);
  if (!st) throw new Error(`no station ${id}`);
  const sc = st.scenarios[scenario] ?? st.scenarios.default;
  const N = 24;
  const keep = w => !w.only || w.only.includes(scenario);
  const P = p => ({ x: p[0], y: p[1] });
  const walls = st.walls.filter(keep).map(w => ({ a: P(w.a), b: P(w.b), dir: w.dir ?? 0 }));
  const doors = st.doors.filter(keep).map(d => {
    const ds = sc.doors?.[d.key] ?? d.ds;
    return { id: d.key, a: P(d.a), b: P(d.b), cells: [], thin: true, open: ds === 1, locked: ds === 2, secret: !!d.secret };
  });
  const tokens = st.tokens.filter(t => (!t.only || t.only.includes(scenario)) && t.role !== "rider")
    .map(t => ({ ...t, ...(sc.tokens?.[t.name] ? { x: sc.tokens[t.name][0], y: sc.tokens[t.name][1] } : {}) }));
  const points = Object.fromEntries(Object.entries(st.points).map(([k, v]) => [k, P(v)]));
  return { name: `station${id}`, station: id, scenario, rows: Array.from({ length: N }, () => ".".repeat(N)), walls, doors, tokens, points,
    combat: !!sc.combat, rooms: {} };
}

export const MAPS = Object.freeze({ tJunction, corridor2, diagonal, deadEnd, hard, tunnel, hall });

/** Do segments p-q and a-b properly cross (each strictly on both sides of the other)? */
export function crosses(p, q, a, b) {
  const o = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = o(a, b, p), d2 = o(a, b, q), d3 = o(p, q, a), d4 = o(p, q, b);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

/**
 * A map as the clients use it: its floor with the doors as a client knows them (a shut door's cells are rock for the
 * planner), with the grid fixture's oracles (the real pathfind-core A*) cached per door state and per mode.
 */
export class World {
  constructor(map) {
    this.map = map;
    this.doorById = new Map(map.doors.map(d => [d.id, d]));
    this.cache = new Map();
  }
  doorCell(id) { return this.doorById.get(id); }
  /** Does the leg p → q cross door `door`'s line? */
  segEntersCell(p, q, door) { return crosses(p, q, door.a, door.b); }
  ascii(doors) {
    const g = this.map.rows.map(r => [...r]);
    for (const d of this.map.doors) if (doors.get(d.id) === false) for (const c of d.cells) if (g[c.i]?.[c.j]) g[c.i][c.j] = "#";
    return g.map(r => r.join("")).join("\n");
  }
  /** The oracles for a fight (cells, no string pulling) or out of one; a station's thin walls and shut doors with them. */
  grid(doors, combat) {
    const key = `${combat ? 1 : 0}:${[...doors].map(([k, v]) => `${k}${v ? 1 : 0}`).join(",")}`;
    let g = this.cache.get(key);
    if (!g) {
      const walls = [...(this.map.walls ?? []), ...this.map.doors.filter(d => d.thin && doors.get(d.id) === false).map(d => ({ a: d.a, b: d.b }))];
      g = gridWorld(this.ascii(doors), { gridLattice: true, pull: !combat, walls });
      this.cache.set(key, g);
    }
    return g;
  }
}
