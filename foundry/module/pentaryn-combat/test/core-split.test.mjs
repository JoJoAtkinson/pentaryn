// Guide S12: combat-core.mjs is a barrel over core/*.mjs. Each topic file imports bare (pure: no
// Foundry global needed or added) and imports only its siblings; the barrel's surface is the union.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../core/", import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith(".mjs")).sort();

test("every core/*.mjs imports bare and only from its siblings", async () => {
  const before = Object.keys(globalThis).sort();
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/from "([^"]+)"/g)) assert.match(m[1], /^\.\/[a-z-]+\.mjs$/, `${f}: ${m[1]}`);
    await import(new URL(f, dir));
  }
  for (const g of ["game", "Hooks", "CONFIG", "ui", "canvas", "foundry", "document"]) assert.equal(globalThis[g], undefined, g);
  assert.deepEqual(Object.keys(globalThis).sort(), before);
});

test("the barrel re-exports every topic export, each from exactly one file", async () => {
  const barrel = await import("../combat-core.mjs");
  const seen = new Map();
  for (const f of files) {
    for (const k of Object.keys(await import(new URL(f, dir)))) {
      assert.equal(seen.has(k), false, `${k} in ${seen.get(k)} and ${f}`);
      seen.set(k, f);
      assert.ok(k in barrel, k);
    }
  }
  assert.equal(files.length, 12);
});

// combat-core-M2 / M10: core/turn.mjs imported followUps (unused) and actionsLeft (turnflow.mjs), so
// turn.mjs sat in two import cycles. Every imported name is used, and the sibling graph is acyclic.
test("core/*.mjs: every imported name is used and no sibling import cycle (combat-core-M2, combat-core-M10)", () => {
  const graph = {};
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), "utf8");
    graph[f] = [];
    for (const m of src.matchAll(/^import \{([^}]+)\} from "\.\/([a-z-]+\.mjs)";$/gm)) {
      graph[f].push(m[2]);
      const body = src.replace(m[0], "");
      for (const name of m[1].split(",").map(s => s.trim()).filter(Boolean)) {
        assert.match(body, new RegExp(`\\b${name}\\b`), `${f} imports ${name} from ${m[2]} but never uses it`);
      }
    }
  }
  const state = {};
  const visit = (f, path) => {
    if (state[f] === "done") return;
    assert.notEqual(state[f], "open", `import cycle: ${[...path, f].join(" → ")}`);
    state[f] = "open";
    for (const d of graph[f] ?? []) visit(d, [...path, f]);
    state[f] = "done";
  };
  for (const f of files) visit(f, []);
});

// combat-core-EXT-11: the Attack action's swing kinds and the five movement keys are written once.
test("core/*.mjs: ATTACK_ACTION_KINDS and MOVEMENT_KEYS are each written in one place (combat-core-EXT-11)", () => {
  const all = files.map(f => readFileSync(new URL(f, dir), "utf8")).join("\n");
  assert.equal(all.match(/"burrow"/g)?.length ?? 0, 1, "the movement keys list is written once");
  assert.equal(all.match(/=== "main" \|\| \w+ === "nick"|!== "main" && \w+ !== "nick"/g)?.length ?? 0, 0, "Attack-action kinds come from ATTACK_ACTION_KINDS");
});
