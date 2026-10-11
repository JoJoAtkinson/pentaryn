/**
 * The one place tests reach the engine, the backend registry and the wasm adapter.
 *
 * The guide (step 1.2) routes tests through a `walls-core.mjs` barrel so the step-3 file moves never
 * touch a test. Until that barrel exists, this fixture is the barrel's stand-in: step 2/3 repoints
 * these re-exports (a fixture, not a characterisation test) and no *.test.mjs changes.
 */
export * from "../../wall-engine.mjs";
export { register, get, list, available, canonical, compare } from "../../backends.mjs";
export { ready as wasmReady } from "../../backend-wasm.mjs";
