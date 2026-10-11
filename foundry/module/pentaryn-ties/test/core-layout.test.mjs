/**
 * The pure layer's shape (guide S4, ties-36; S4b, ties-35): core/*.mjs import only core/*.mjs, the core
 * import graph has no cycle (a cycle is how a module-scope initialiser such as
 * `LORE_TEXT_MAX = TIER_TEXT_MAX` hits the temporal dead zone), and every core file imports bare in a
 * process with no Foundry global. known-core.mjs is a barrel and nothing else.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { importGraph } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const graph = importGraph(ROOT, { exclude: ["lib/", "test/"] });
const core = Object.keys(graph).filter(f => f.startsWith("core/"));

test("core/ exists and every core file imports only core files", () => {
  assert.ok(core.length >= 8, core.join(", "));
  const out = core.flatMap(f => graph[f].filter(d => !d.startsWith("core/")).map(d => `${f} → ${d}`));
  assert.deepEqual(out, []);
});

test("the core import graph is acyclic", () => {
  const state = new Map();
  const cycles = [];
  const visit = (f, path) => {
    if (state.get(f) === "done") return;
    if (state.get(f) === "open") return void cycles.push([...path, f].join(" → "));
    state.set(f, "open");
    for (const d of graph[f] ?? []) if (d.startsWith("core/")) visit(d, [...path, f]);
    state.set(f, "done");
  };
  for (const f of core) visit(f, []);
  assert.deepEqual(cycles, []);
});

test("known-core.mjs is a barrel of core/ re-exports and nothing else", () => {
  const src = readFileSync(new URL("../known-core.mjs", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  for (const line of src.split("\n")) assert.match(line, /^export \* from "\.\/core\/[a-z]+\.mjs";$/);
});

test("each core file imports bare, with no Foundry global, in a fresh process", () => {
  const root = fileURLToPath(ROOT);
  for (const f of core) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(`./${f}`)});`], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
