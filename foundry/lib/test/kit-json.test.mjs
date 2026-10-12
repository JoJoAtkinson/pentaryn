import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
