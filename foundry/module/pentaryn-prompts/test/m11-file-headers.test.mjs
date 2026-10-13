/**
 * prompts-core-M11 [declared]: five file headers under-described their file or named the wrong
 * import source. core/text.mjs, core/placement.mjs and core/size.mjs said "geometry-core.mjs …
 * re-exports the public names", but each holds names geometry-core never re-exports (imported
 * straight from the core file, or re-exported by build-core.mjs / actor-patch-adapter.mjs instead).
 * prompts-core.mjs said "every other file takes MODULE … from here" while listing only some of
 * what it holds, and build-core.mjs said its cropsDecision/specFileUrl re-export was "for existing
 * importers" when gather and replace import them from core/text.mjs. Comment only: these tests
 * read the headers against the import/export statements, so a header cannot drift again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = rel => readFileSync(new URL(rel, root), "utf8");
const header = src => src.slice(src.indexOf("/**"), src.indexOf("*/") + 2);
const names = list => list.split(",").map(s => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);

/** Every non-test module file, path relative to the module root. */
const FILES = [
  ...readdirSync(root).filter(f => f.endsWith(".mjs")),
  ...readdirSync(new URL("core/", root)).filter(f => f.endsWith(".mjs")).map(f => `core/${f}`)
];

function exportsOf(src) {
  return [...src.matchAll(/^export (?:async )?(?:function\*?|const|class|let) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
}

/** file → names it imports from `target` (a module-root-relative path). */
function importersOf(target) {
  const out = new Map();
  for (const f of FILES) {
    const src = read(f);
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
      const resolved = new URL(m[2], new URL(f, root)).href.slice(root.href.length);
      if (resolved === target) out.set(f, [...(out.get(f) ?? []), ...names(m[1])]);
    }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
      const resolved = new URL(m[2], new URL(f, root)).href.slice(root.href.length);
      if (resolved === target) out.set(f, [...(out.get(f) ?? []), ...names(m[1])]);
    }
  }
  return out;
}

/** file → names of `target` it re-exports (imported from target, then in a bare `export { … }`). */
function reExportersOf(target) {
  const out = new Map();
  for (const [f, imported] of importersOf(target)) {
    const src = read(f);
    const bare = [...src.matchAll(/^export\s*\{([^}]*)\}\s*(from\s*"([^"]+)")?/gm)];
    const re = new Set();
    for (const m of bare) {
      const from = m[3] && new URL(m[3], new URL(f, root)).href.slice(root.href.length);
      for (const n of names(m[1])) if ((from === target) || (!m[3] && imported.includes(n))) re.add(n);
    }
    if (re.size) out.set(f, [...re]);
  }
  return out;
}

for (const file of ["core/text.mjs", "core/placement.mjs", "core/size.mjs"]) {
  test(`prompts-core-M11: ${file}'s header names every off-barrel export and every re-exporter`, () => {
    const src = read(file), head = header(src);
    const exported = exportsOf(src);
    assert.ok(exported.length > 0, `${file} exports something`);
    const re = reExportersOf(file);
    const barrel = new Set(re.get("geometry-core.mjs") ?? []);
    assert.ok(barrel.size > 0, `geometry-core.mjs re-exports some of ${file}`);
    assert.doesNotMatch(head, /re-exports the public names/, "the old blanket claim is gone");
    for (const n of exported.filter(n => !barrel.has(n))) {
      assert.match(head, new RegExp(`\\b${n}\\b`), `${file}'s header names ${n}, which geometry-core does not re-export`);
    }
    for (const f of re.keys()) {
      assert.ok(head.includes(f.replace(/^core\//, "")), `${file}'s header names ${f}, which re-exports ${re.get(f).join(", ")}`);
    }
  });
}

test("prompts-core-M11: prompts-core.mjs's header names everything it holds and each re-exporter", () => {
  const src = read("prompts-core.mjs"), head = header(src);
  assert.doesNotMatch(head, /Every other file takes/, "the over-claim is gone: some files take MODULE through geometry-core");
  for (const n of exportsOf(src)) assert.match(head, new RegExp(`\\b${n}\\b`), `the header names ${n}`);
  const re = reExportersOf("prompts-core.mjs");
  assert.ok(re.size >= 3, "geometry-core, replace and gather re-export prompts-core names");
  for (const [f, list] of re) {
    assert.ok(head.includes(f), `the header names ${f}`);
    for (const n of list) {
      const line = head.split(f)[1]?.split(/[;.]/)[0] ?? "";
      assert.match(line, new RegExp(`\\b${n}\\b`), `the header says ${f} re-exports ${n}`);
    }
  }
});

test("prompts-core-M11: build-core.mjs's re-export comment names who imports from core/text.mjs and why it stays", () => {
  const src = read("build-core.mjs");
  const at = src.indexOf('from "./core/text.mjs"');
  const lineStart = src.lastIndexOf("\nimport", at);
  const comment = src.slice(src.lastIndexOf("\n\n", lineStart) + 2, lineStart);
  assert.doesNotMatch(comment, /existing importers/, "no module file imports these from build-core");
  const direct = [...importersOf("core/text.mjs")].filter(([f, ns]) => f !== "build-core.mjs"
    && ns.some(n => n === "cropsDecision" || n === "specFileUrl")).map(([f]) => f);
  assert.ok(direct.length >= 2, "gather and replace import them from core/text.mjs");
  for (const f of direct) assert.ok(comment.includes(f), `the comment names ${f}, which imports from core/text.mjs`);
  assert.match(comment, /core-exports\.json/, "it says the re-export is pinned build-core surface");
});
