/**
 * The one place tests reach the engine, the backend registry and the wasm adapter: the
 * `walls-core.mjs` barrel (engine + registry) and the adapter's load promise. Engine files move
 * behind the barrel (guide step 3) without touching a test.
 */
export * from "../../walls-core.mjs";
export { ready as wasmReady } from "../../backend-wasm.mjs";
