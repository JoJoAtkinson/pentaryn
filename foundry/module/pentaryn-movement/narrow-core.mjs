/**
 * Pentaryn Movement — narrow ways, pure (0.10 step N, Joe's R9; plan context/plans/pathfinding-2026-11.md §18.4). No
 * Foundry globals: `node test/run.mjs` imports this bare. Units are squares (a point { x, y }; square (I, J) is row I,
 * column J, x in [J, J + 1), y in [I, I + 1)).
 *
 * Not a feature of its own (no switch, no setting): the pathfinder's finer test, consulted only where the plain square
 * test cannot see. A square is TIGHT when a wall that blocks movement runs through its interior (an off-grid wall: a
 * curved stair, a diagonal slit, a pillar); a map whose walls lie on the grid lines has none, and its routes are found
 * exactly as before.
 *
 *   - Passable: the token's centre keeps NARROW.pass (0.15 square, 9 in) from every wall, for any token up to 1×1, so a
 *     way of 0.3 square or more passes though the token is wider. A bigger token goes only where its body fits (the
 *     plain test; decision 8), never here.
 *   - Cells: every tight square (and each square beside one) is cut into eighth-square cells; a cell is passable when
 *     some point in it keeps the pass radius (its representative point, moved onto the centre line at a throat). Its
 *     square's nodes are the connected groups of its passable cells (components), never the whole square: a square
 *     crossed by two lanes (a hairpin, a thin wall) is two nodes, and no link ever crosses a wall between them.
 *   - The pathfinder's A* stays on squares: `more(node)` gives a node's extra neighbours through tight squares, each
 *     step costing what a square step costs (pathfind-core search's `more`).
 *   - The walk (`walkFor`): through tight squares the eighth-cell path of least length × a penalty for clearance under
 *     the padding radius (the token's own radius, wanted, not required), then a band settled on it: smoothed, pushed
 *     out to the padding radius where there is room and onto the centre line where the way is narrower than the
 *     token; simplified to chords that keep both. Every sample of it every 1/16 square keeps the pass radius. Sent as
 *     one move, so it animates as one motion.
 *
 * The field is cached by its caller (pathfind.mjs) until a wall or door changes; everything in it is built lazily, a
 * square at a time, where a search touches.
 *
 * A BARREL (S5, as ties known-core.mjs and aoe core.mjs): the rules live in core/*.mjs.
 *
 *   core/narrow-field.mjs  NARROW, resample, narrowField: the lazy cell field a wall set makes
 *   core/narrow-walk.mjs   finePath, relax, checkWalk, simplify, roundTurns, squareEntries, walkFor, narrowMore, pointsBack
 *
 * Not re-exported here, on purpose: core/narrow-geom.mjs (the segment and wall tests both halves share).
 */

export * from "./core/narrow-field.mjs";
export * from "./core/narrow-walk.mjs";
