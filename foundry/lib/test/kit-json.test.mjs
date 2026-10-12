import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { importGraph, readJSON } from "../test-kit/harness.mjs";

// kit.json is the manifest vendor.py closure() trusts: "vendoring closes over them" (README).
const ROOT = new URL("..", import.meta.url);
const kit = readJSON(new URL("../kit.json", import.meta.url));
const graph = importGraph(ROOT, { exclude: ["test/", "test-kit/"] });

const closure = name => {
  const seen = new Set();
  const stack = [...(kit.files[name]?.deps ?? [])];
  while (stack.length) {
    const d = stack.pop();
    if (seen.has(d)) continue;
    seen.add(d);
    stack.push(...(kit.files[d]?.deps ?? []));
  }
  return seen;
};

test("kit.json deps close over every kit import", () => {
  for (const [file, imports] of Object.entries(graph)) {
    const name = file.replace(/\.mjs$/, "");
    assert.ok(kit.files[name], `${file} has no kit.json row`);
    const deps = closure(name);
    for (const imp of imports) {
      const dep = imp.replace(/\.mjs$/, "");
      assert.ok(deps.has(dep), `${file} imports ${imp}, but kit.json deps for "${name}" do not cover "${dep}"`);
    }
  }
  for (const [name, row] of Object.entries(kit.files)) {
    if (row.ext === "css") continue;
    assert.ok(existsSync(fileURLToPath(new URL(`../${name}.mjs`, import.meta.url))), `kit.json row "${name}" has no foundry/lib/${name}.mjs`);
  }
});

// README: "Bump kit.json version, errors.mjs KIT_VERSION and every header together."
test("kit version, KIT_VERSION and every header agree", async () => {
  const { KIT_VERSION } = await import("../errors.mjs");
  const v = kit.version;
  assert.equal(v, KIT_VERSION, "kit.json version and errors.mjs KIT_VERSION differ");
  const firstLine = rel => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").split("\n")[0];
  const header = rel => {
    assert.ok(existsSync(fileURLToPath(new URL(`../${rel}`, import.meta.url))), `kit file foundry/lib/${rel} is missing`);
    const want = rel.endsWith(".css")
      ? `/* pentaryn kit ${v} · vendored from foundry/lib/${rel}`
      : `// pentaryn kit ${v} · vendored from foundry/lib/${rel}`;
    assert.ok(firstLine(rel).startsWith(want), `foundry/lib/${rel} header does not start with "${want}"`);
  };
  const rows = Object.entries(kit.files).map(([name, row]) => `${name}.${row.ext ?? "mjs"}`);
  for (const rel of rows) header(rel);
  for (const f of kit.testKit) header(`test-kit/${f}`);
  const onDisk = readdirSync(fileURLToPath(ROOT)).filter(f => /\.(mjs|css)$/.test(f));
  for (const f of onDisk) assert.ok(rows.includes(f), `foundry/lib/${f} has no kit.json row`);
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  for (const rel of [...rows, ...kit.testKit.map(f => `test-kit/${f}`)]) {
    assert.ok(readme.includes(`| \`${rel}\` |`), `README.md table has no \`${rel}\` row`);
  }
});

// kit-1.2.0 (defect wave 2, Joe 2026-10-12): the final-review kit fixes ship as kit 1.2.0.
test("kit-1.2.0: kit.json, KIT_VERSION and the README changelog name 1.2.0", async () => {
  const { KIT_VERSION } = await import("../errors.mjs");
  assert.equal(kit.version, "1.2.0", "kit.json version is not 1.2.0");
  assert.equal(KIT_VERSION, "1.2.0", "errors.mjs KIT_VERSION is not 1.2.0");
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  assert.match(readme, /^1\.2\.0 \(/m, "README.md changelog has no 1.2.0 entry");
});
