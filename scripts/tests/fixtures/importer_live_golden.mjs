// Run scripts/foundry/live-goldens/importer.js against a minimal Foundry stub twice, with the
// root namespace published in two different orders (other modules' ready hooks move with their
// kit migrations), and print both outputs. Driven by test_live_golden_importer.py.
//
//   node scripts/tests/fixtures/importer_live_golden.mjs
//
// Prints JSON: { a, b } — the parsed output of each run. The importer's import() rejects and
// Actor.create throws, so only the root namespace and the error paths run; that is all the test
// needs.
import { readFileSync } from "node:fs";

const REPO = new URL("../../../", import.meta.url);
const body = readFileSync(new URL("scripts/foundry/live-goldens/importer.js", REPO), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const KEYS = ["import", "moduleId", "contract", "_internals", "names", "pings", "ties", "senses"];

async function runWith(order) {
  const P = {};
  for (const k of order) {
    P[k] = k === "import" ? async () => { throw new Error("404 actors.json"); }
      : k === "moduleId" ? "pentaryn-importer"
      : k === "contract" ? "pentaryn.importer/1"
      : k === "_internals" ? Object.freeze({})
      : Object.freeze({});
  }
  Object.freeze(P);
  const actors = [];
  globalThis.game = {
    pentaryn: P,
    modules: new Map([["pentaryn-importer", { flags: { pentaryn: { contract: "x" } }, api: undefined }]]),
    system: { id: "dnd5e", version: "5.1.0" },
    release: { generation: 14 },
    actors: Object.assign(actors, { get: () => undefined }),
  };
  globalThis.foundry = { utils: { getRoute: p => `/${p}`, getProperty: () => undefined } };
  globalThis.Actor = { create: async () => { throw new Error("no actors in the stub"); }, deleteDocuments: async () => [] };
  return JSON.parse(await new AsyncFunction(body)());
}

const a = await runWith(KEYS);
const b = await runWith([...KEYS].reverse());
process.stdout.write(JSON.stringify({ a, b }));
