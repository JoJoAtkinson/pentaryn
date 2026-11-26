/**
 * Pure planning of a group drag (pentaryn-movement 0.10; plan context/plans/pathfinding-2026-11.md §18; Joe's leader
 * rule, 2026-11-24; Fable's review 3 §1). No Foundry globals.
 *   - planLead (below, "The leader plan"): the token grabbed leads; where it is dropped picks the shape (march / swarm);
 *     each member takes the best-ranked free square it can reach and gets one route search to it.
 *   - staggerFile (0.10 L2, R5): the start delays: the leader at once, the pack one wave later, single file only at a
 *     narrow point (the last within 4 s of the drop).
 * Units: centres in grid squares (as motion-core). Touching is fine; coming inside is not. (0.10 L1: the 0.9 B0
 * planner, its formation spots, candidate rings, walk ratio, tries, route-clearance test, fixed-point passes,
 * reorders and waveWays are gone.)
 *
 * A BARREL (S5, as ties known-core.mjs and aoe core.mjs): the rules live in core/*.mjs.
 *
 *   core/stagger.mjs  clearOf, routeEnters, STAGGER, narrowZones, staggerFile: the start delays
 *   core/lead.mjs     LEAD, footprintCells, heap, walkFrom, planLead, planLeadSteps: the leader plan
 */

export * from "./core/stagger.mjs";
export * from "./core/lead.mjs";
