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

// KIT-M3 (final review 2026-10-12): the argon-tooltip.css row said the migration was still partial
// (@import, "riders waits"). It must name every module that vendors the file, each of which lists
// lib/argon-tooltip.css in its module.json styles.
test("KIT-M3: the argon-tooltip.css README row names every module that lists it in module.json styles", () => {
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  const row = readme.split("\n").find(l => l.startsWith("| `argon-tooltip.css` |"));
  assert.ok(row, "README.md has no argon-tooltip.css row");
  assert.doesNotMatch(row, /@import/, "row still describes an @import");
  assert.doesNotMatch(row, /waits/, "row still says a module waits");
  const modDir = new URL("../../module/", import.meta.url);
  const vendors = readdirSync(fileURLToPath(modDir))
    .filter(m => existsSync(fileURLToPath(new URL(`${m}/lib/argon-tooltip.css`, modDir))));
  assert.ok(vendors.length > 0, "no module vendors lib/argon-tooltip.css");
  for (const m of vendors) {
    const styles = readJSON(new URL(`${m}/module.json`, modDir)).styles ?? [];
    assert.ok(styles.includes("lib/argon-tooltip.css"), `${m} vendors lib/argon-tooltip.css but its module.json styles omit it`);
    const short = m.replace(/^pentaryn-/, "");
    assert.match(row, new RegExp(`\\b${short}\\b`), `README row does not name ${short}`);
  }
});

// KIT-M9 (final review 2026-10-12): the foundry-stub row left out stubId and the harness row left
// out sourceFiles. Every README table row for a .mjs file must list exactly the module's named
// exports — a backticked identifier (optionally with its call signature) in the Exports cell is an
// export; the names after "→" are members of a returned object, not exports.
test("KIT-M9: each README .mjs row's Exports cell equals that file's named exports", async () => {
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  const rows = readme.split("\n").filter(l => /^\| `[^`]+\.mjs` \|/.test(l));
  assert.ok(rows.length > 0, "README.md has no .mjs rows");
  for (const row of rows) {
    const [, file, exportsCell] = row.split("|").map(c => c.trim());
    const rel = file.slice(1, -1);
    const listed = new Set();
    for (const m of exportsCell.matchAll(/(→\s*)?`([^`]+)`/g)) {
      if (m[1]) continue;
      const id = /^([A-Za-z_$][\w$]*)(\(.*\))?$/.exec(m[2]);
      if (id) listed.add(id[1]);
    }
    const actual = new Set(Object.keys(await import(new URL(`../${rel}`, import.meta.url).href)));
    assert.deepEqual([...listed].sort(), [...actual].sort(), `README.md \`${rel}\` row lists the wrong exports`);
  }
});
