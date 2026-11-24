#!/usr/bin/env node
/**
 * The runner of pentaryn-movement's simulator (make foundry-movement-sim; use-doc context/foundry/movement.md "The
 * simulator"). A tool, not a suite, so it lives outside the module's test/ (blueprint C43).
 *
 * 0.9.0 (branch movement-0.9): the 0.8.x simulator modelled the glue that 0.9.0 deleted (reservations, the runtime
 * guard, the lifecycle, a port of group.mjs), so its model and scenarios went with it. Fable's review 2 §4 step 5
 * rebuilds it on the real cores (file-core.mjs), not on a port of the glue; until then this runner says so and exits 2.
 * The engine (test/sim/engine.mjs) and the maps (test/sim/maps.mjs) are kept for that rebuild.
 */
console.error("pentaryn-movement simulator: being rebuilt on the real cores for 0.9.0 (Fable's review 2, §4 step 5); nothing to run yet.");
process.exit(2);
