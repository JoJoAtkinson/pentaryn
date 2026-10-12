// Doc guards (senses-walls-cursors-8, README half): no hard-coded fixture count, and every test file the
// README names exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { sourceFiles } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const README = readFileSync(new URL("README.md", ROOT), "utf8");

test("README states no fixture count", () => {
  assert.doesNotMatch(README, /\d+ fixtures/);
});

test("every test/… path the README names exists", () => {
  const paths = [...new Set([...README.matchAll(/`(test\/[\w./-]+\.mjs)`/g)].map(m => m[1]))];
  assert.ok(paths.length >= 3);
  for (const p of paths) assert.ok(existsSync(new URL(p, ROOT)), p);
});

// senses-walls-cursors-8 recipe (scoped to walls): every repo doc path the module's sources and docs
// cite resolves. module.json's `description` was edited in the Wave 7 restart batch (-8): it cites
// context/foundry/walls.md, so its case is a pass, no longer a todo.
const REPO = new URL("../../../", ROOT);
const CITED = /\b(?:context|playbooks)\/[\w./-]+\.md\b/g;
// Every .mjs the module owns (its tests too; not the vendored kit), found by walking, so a new file is
// covered without editing this list, plus the docs and the Rust source the audit names.
const SOURCES = ["README.md", "CHANGELOG.md", "wasm/src/lib.rs",
  ...sourceFiles(ROOT, { exclude: ["lib/", "test/kit/"] })];
const unresolved = file => [...new Set(readFileSync(new URL(file, ROOT), "utf8").match(CITED) ?? [])]
  .filter(p => !existsSync(new URL(p, REPO)));

test("every context/… or playbooks/… path cited by the module resolves", () => {
  for (const f of ["pentaryn-walls.mjs", "core/engine.mjs", "test/fixtures/corpus.mjs"]) assert.ok(SOURCES.includes(f), f);
  for (const f of SOURCES) assert.deepEqual(unresolved(f), [], f);
});

test("module.json cites a doc that exists", () => {
  assert.deepEqual(unresolved("module.json"), []);
});

// walls-M2: run()'s ABI doc in lib.rs names what backend-wasm.mjs actually marshals: 11 input fields per
// wall, a 5-int output header, 8-wide create rows and the component rows. It stays exactly three `///`
// lines so the panic Location line numbers baked into wall-engine.wasm (and so its sha) do not move.
test("lib.rs run() ABI doc matches the marshaller in three lines (walls-M2)", () => {
  const rs = readFileSync(new URL("wasm/src/lib.rs", ROOT), "utf8").split("\n");
  const at = rs.findIndex(l => l.startsWith('pub extern "C" fn run('));
  assert.equal(rs[at - 1], "#[no_mangle]");
  const doc = [];
  for (let i = at - 2; rs[i]?.startsWith("///"); i--) doc.unshift(rs[i]);
  assert.equal(doc.length, 3, "the doc block must stay three lines (wasm reproducibility)");
  assert.equal(at + 1, 697, "run() must not move (wasm reproducibility)");
  const text = doc.join("\n").replace(/\s+/g, "");

  const js = readFileSync(new URL("backend-wasm.mjs", ROOT), "utf8");
  const slots = [...js.matchAll(/buf\[o \+ (\d+)\] = (?:\(stampOf\(w\)|w)\.(\w+)(?![\w[])/g)]
    .map(m => [Number(m[1]), m[2]]).sort((a, b) => a[0] - b[0]).map(s => s[1]);
  const input = ["x0", "y0", "x1", "y1", ...slots];
  assert.equal(input.length, 11);
  assert.ok(text.includes(`[n,(${input.join(",")})*n]`), doc.join("\n"));

  assert.match(js, /const \[nc, nu, nr, iterations, nComp\] = out;/);
  for (const part of ["[creates,updates,refusals,iterations,components,",
                      "creates*(x0,y0,x1,y1,light,sight,sound,move)", "updates*(segIdx,x0,y0,x1,y1)",
                      "refusals*(x,y)", "components*(walls,dangling)]"])
    assert.ok(text.includes(part), part);
});
