// pentaryn kit 1.0.2 · vendored from foundry/lib/test-kit/harness.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Test helpers for `node:test` suites: golden pins, characterisation tables, source scans.
 *
 * Goldens live in `test/golden/<name>.json` beside the test file. `GOLDEN_UPDATE=1` writes them;
 * otherwise a MISSING golden fails (a fresh checkout must not pass by writing its own expectations).
 * Never run `GOLDEN_UPDATE=1` over a module mid-refactor: a refactor must not touch its goldens.
 *
 * Self-contained on purpose — it ships in `test/kit/`, not `lib/`, and imports nothing from either.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toPath = p => (p instanceof URL || String(p).startsWith("file:") ? fileURLToPath(p) : String(p));
const updating = () => process.env.GOLDEN_UPDATE === "1";
const stable = v => JSON.parse(JSON.stringify(v ?? null));

export function readJSON(file) {
  return JSON.parse(readFileSync(toPath(file), "utf8"));
}

/** The module's module.json, from a URL/path inside the module (default: the test dir's parent). */
export function manifestOf(rootURL) {
  return readJSON(join(toPath(rootURL), "module.json"));
}

/**
 * Legacy `check(name, got, want)` semantics for converted suites: JSON equality, a ✓/✗ line,
 * `process.exitCode = 1` on failure. Returns whether it passed.
 */
export function checkJSON(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  const pass = a === b;
  if (pass) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}\n      got:  ${a}\n      want: ${b}`);
    process.exitCode = 1;
  }
  return pass;
}

/**
 * Pin a value against `golden/<name>.json` next to the calling test file (`import.meta.url`).
 * GOLDEN_UPDATE=1 rewrites the file; a missing file fails.
 */
export function pinJSON(name, value, fileURL) {
  const file = join(dirname(toPath(fileURL)), "golden", `${name}.json`);
  const got = stable(value);
  if (updating()) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(got, null, 2)}\n`);
    return got;
  }
  if (!existsSync(file)) {
    assert.fail(`golden ${relative(process.cwd(), file)} is missing — run GOLDEN_UPDATE=1 against unchanged code, review, then commit it`);
  }
  assert.deepStrictEqual(got, readJSON(file), `golden ${name}.json differs`);
  return got;
}

/**
 * Characterise `fn` over an input table and pin the outputs. Each input is an argument array (or a
 * single argument). A throw is recorded as `{ threw: message }`, so failure paths are pinned too.
 */
export async function characterise(name, fn, inputs, { file, normalise = v => v } = {}) {
  const rows = [];
  for (const input of inputs) {
    const args = Array.isArray(input) ? input : [input];
    let output;
    try {
      output = { out: normalise(await fn(...args)) };
    } catch (err) {
      output = { threw: String(err?.message ?? err) };
    }
    rows.push({ input: stable(args), ...stable(output) });
  }
  return pinJSON(name, rows, file);
}

/** `describe()` without the fields that change on every version bump or differ node vs live. */
export function normaliseDescribe(d) {
  const out = stable(d);
  delete out.version;
  delete out.kit;
  delete out.published;
  for (const p of out.patches ?? []) delete p.via;
  return out;
}

export function maxDepth(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return 0;
  seen.add(value);
  let deepest = 0;
  for (const v of Object.values(value)) deepest = Math.max(deepest, maxDepth(v, seen));
  seen.delete(value);
  return 1 + deepest;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Every `.mjs` under root (module-relative paths), minus `exclude` prefixes. */
export function sourceFiles(rootURL, { exclude = ["lib/", "test/"] } = {}) {
  const root = toPath(rootURL);
  return walk(root)
    .filter(p => p.endsWith(".mjs"))
    .map(p => relative(root, p).split("\\").join("/"))
    .filter(rel => !exclude.some(x => rel.startsWith(x)))
    .sort();
}

const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\'"`])\/\/[^\n]*/g, "$1");

/** Regex hits over the module's own sources: `[{ file, line, text }]`. Comments are ignored. */
export function sourceScan(rootURL, regex, opts = {}) {
  const root = toPath(rootURL);
  const hits = [];
  for (const rel of sourceFiles(root, opts)) {
    const lines = stripComments(readFileSync(join(root, rel), "utf8")).split("\n");
    lines.forEach((text, i) => {
      const re = new RegExp(regex.source, regex.flags.replace("g", ""));
      if (re.test(text)) hits.push({ file: rel, line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

const IMPORT_RE = /(?:^|[^\w$.])(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?["']([^"']+)["']|(?:^|[^\w$.])import\(\s*["']([^"']+)["']\s*\)/g;

/** `{ "a.mjs": ["b.mjs", "lib/log.mjs"] }` — local (relative) imports only, module-relative paths. */
export function importGraph(rootURL, opts = {}) {
  const root = toPath(rootURL);
  const graph = {};
  for (const rel of sourceFiles(root, { exclude: [], ...opts })) {
    const src = stripComments(readFileSync(join(root, rel), "utf8"));
    const deps = new Set();
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec?.startsWith(".")) continue;
      deps.add(relative(root, resolve(dirname(join(root, rel)), spec)).split("\\").join("/"));
    }
    graph[rel] = [...deps].sort();
  }
  return graph;
}

/** Files reachable from `entries` through the import graph. */
export function reachable(graph, entries) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of graph[f] ?? []) stack.push(d);
  }
  return seen;
}

/**
 * The fork contract (use-doc §6 `contract.test.mjs`): the `'<moduleId>.<name>'` query literals a typed
 * tool in the MCP fork sends, read from its `.ts` source. `$FOUNDRY_MCP_FORK` is the fork checkout
 * (e.g. ~/Documents/GitHub/foundry-vtt-mcp). When the variable or the file is absent this returns
 * `{ skip: "<why>" }` — the fork is a separate checkout, so the test skips with that note instead of
 * failing. Every module uses this; none regexes the `.ts` itself.
 *
 *   test("the fork sends only queries this module registers", t => {
 *     const fork = forkQueries(MODULE, "packages/mcp-server/src/fork/tools/prompt-markers.ts");
 *     if (fork.skip) return t.skip(fork.skip);
 *     assert.deepEqual(contractDrift(api.describe(), fork).missing, []);
 *   });
 */
export function forkQueries(moduleId, relPath, { env = process.env } = {}) {
  const src = forkSource(relPath, { env });
  if (src.skip) return src;
  const id = moduleId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`["'\`](${id}\\.[A-Za-z_$][\\w$.]*)["'\`]`, "g");
  const names = [...new Set([...src.text.matchAll(re)].map(m => m[1]))].sort();
  return { file: src.file, names };
}

/**
 * One fork source file as text, for contract checks beyond query names (prompts' kinds, sizes and
 * patch keys): `{ file, text }`, or `{ skip }` when `$FOUNDRY_MCP_FORK` or the file is absent.
 */
export function forkSource(relPath, { env = process.env } = {}) {
  const root = env.FOUNDRY_MCP_FORK;
  if (!root) return { skip: "FOUNDRY_MCP_FORK is not set — fork contract not checked" };
  const file = join(root, relPath);
  if (!existsSync(file)) return { skip: `${relPath} is not in FOUNDRY_MCP_FORK — fork contract not checked` };
  return { file, text: readFileSync(file, "utf8") };
}

/**
 * `{ missing, unused }` between `describe()` and `forkQueries()`: `missing` = names the fork sends that
 * the module does not register (a contract break — assert it is empty); `unused` = registered queries
 * the fork never sends (informational).
 */
export function contractDrift(describeJson, fork) {
  const registered = new Set(describeJson?.queries ?? []);
  const sent = new Set(fork?.names ?? []);
  return {
    missing: [...sent].filter(n => !registered.has(n)).sort(),
    unused: [...registered].filter(n => !sent.has(n)).sort(),
  };
}
