#!/usr/bin/env node
// Compare a live golden's "before" and "after" runs (the JSON string a
// scripts/foundry/live-goldens/<m>.js eval-js call returned, saved as a file).
//
//   node scripts/foundry/live-goldens/diff.mjs .state/live-goldens/<wave>/before/lookup.json \
//                                              .state/live-goldens/<wave>/after/lookup.json
//
// Prints: env (versions), every path under golden.shared that differs (a regression until
// explained), every path under golden.declared that differs (expected: check it against the
// declared change named in the script header), the timings side by side, and both cleanups.
// Exit 0 when golden.shared is equal and both cleanups left nothing behind, 1 otherwise,
// 2 on bad input — a run that `skipped` or has no object `golden` is bad input, never
// identical. A wave-1 golden (names, pings, cursors, importer, ties, prompts) has no
// shared/declared split: its whole `golden` is compared as shared, and its declared changes
// (wave-1-report.md "Live goldens") are read off the shared list by hand.
// A cleanup is judged by top-level key name only: `<thing>Left` above 0, `<thing>Restored === false`,
// or a string containing `REFUSED` / `NOT ` fails; any other key (nested objects too) is only printed.
//
//   diff.mjs --declared <file> <before.json> <after.json>
//
// `--declared` names an allowlist of golden.shared paths the wave declared (one glob per line,
// `#` comments and blank lines ignored; or a JSON array of globs). A shared difference whose path
// matches a glob is listed as declared and does not fail the diff, so an all-declared diff exits 0.
// Globs match the whole path as printed: `*` is any run within one segment (never `.`, `[` or
// `]`), `**` is anything, `?` one character other than `.`; `[` and `]` are literal. So
// `stash.chest[*]` covers `stash.chest[2]` but not `stash.chest[0].name` (that is
// `stash.chest[*].*`), and `purseHome` covers only `purseHome` itself (`purseHome.**` the rest).
// A key holding `.`, `[` or `]` prints JSON-quoted in brackets — ties' `attributes.lookup` setting
// is `surface.d1["attributes.lookup"]` — and globs treat `"` as literal: that spelling or
// `surface.d1.**` covers it, `surface.d1.*` does not (LG-E7). `.**` is everything below, a
// bracketed segment as much as a dotted one: `stash.chest.**` covers `stash.chest[2]`.
// A glob that matched nothing is named.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

function load(path) {
  let v = JSON.parse(readFileSync(path, "utf8"));
  if (typeof v === "string") v = JSON.parse(v);       // saved as the eval-js string
  if (v && typeof v.result === "string") v = JSON.parse(v.result);
  return v;
}

/** Every differing leaf path between a and b, as [path, a, b]. */
export function diffPaths(a, b, path = "") {
  if (Object.is(a, b)) return [];
  const isObj = x => x !== null && typeof x === "object";
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) return [[path || "(root)", a, b]];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  // A key holding `.`, `[` or `]` prints JSON-quoted in brackets, so it never reads as nested segments (LG-E7).
  const seg = k => Array.isArray(a) ? `[${k}]` : /[.[\]]/.test(k) ? `[${JSON.stringify(k)}]` : (path ? `.${k}` : k);
  return keys.flatMap(k => diffPaths(a[k], b[k], `${path}${seg(k)}`));
}

/** A path glob → RegExp (see the header). */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    // `.**` is everything below, a bracketed segment (`[2]`, `["a.b"]`) as much as a dotted one
    if (c === "." && glob[i + 1] === "*" && glob[i + 2] === "*") { re += "(?:\\.|(?=\\[)).*"; i += 2; }
    else if (c === "*" && glob[i + 1] === "*") { re += ".*"; i++; }
    else if (c === "*") re += "[^.\\[\\]]*";
    else if (c === "?") re += "[^.]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");   // `"`, `[`, `]` and the rest are literal
  }
  return new RegExp(`^${re}$`);
}

/** The allowlist file → globs. */
export function readDeclared(path) {
  const text = readFileSync(path, "utf8");
  if (text.trimStart().startsWith("[")) return JSON.parse(text).map(String);
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
}

/** Split [path, a, b] rows into declared (a glob matches) and undeclared, and name unused globs. */
export function partition(rows, globs) {
  const pats = globs.map(g => [g, globToRegExp(g)]);
  const used = new Set(), declared = [], undeclared = [];
  for (const row of rows) {
    const hits = pats.filter(([, re]) => re.test(row[0])).map(([g]) => g);
    hits.forEach(g => used.add(g));
    (hits.length ? declared : undeclared).push(row);
  }
  return { declared, undeclared, unused: globs.filter(g => !used.has(g)) };
}

const show = v => { const s = JSON.stringify(v); return s === undefined ? "undefined" : (s.length > 160 ? `${s.slice(0, 157)}...` : s); };

/** Cleanup values that mean something was left behind. */
export function leftovers(cleanup = {}) {
  const bad = [];
  for (const [k, v] of Object.entries(cleanup ?? {})) {
    if (/Left$/.test(k) && typeof v === "number" && v > 0) bad.push(`${k}=${v}`);
    if (/Restored$/.test(k) && v === false) bad.push(`${k}=false`);
    if (typeof v === "string" && /REFUSED|NOT /.test(v)) bad.push(`${k}: ${v}`);
  }
  return bad;
}

function main(argv) {
  const args = [...argv];
  let declaredPath = null;
  const at = args.indexOf("--declared");
  if (at >= 0) { declaredPath = args[at + 1]; args.splice(at, 2); }
  const [beforePath, afterPath] = args;
  if (!beforePath || !afterPath || (at >= 0 && !declaredPath)) {
    console.error("usage: diff.mjs [--declared <globs-file>] <before.json> <after.json>"); return 2;
  }
  let before, after, globs = null;
  try {
    before = load(beforePath); after = load(afterPath);
    if (declaredPath) globs = readDeclared(declaredPath);
  } catch (e) { console.error(`bad input: ${e.message}`); return 2; }
  // A skipped run is never "identical": its golden is empty, so name the skip and stop (LG-R3).
  const skipped = v => v?.skipped != null && v.skipped !== false;
  for (const [v, p] of [[before, beforePath], [after, afterPath]]) {
    if (skipped(v)) { console.error(`skipped: ${typeof v.skipped === "string" ? v.skipped : JSON.stringify(v.skipped)} (${p})`); return 2; }
  }
  // A golden must be an object (LG-R2); anything else is bad input, naming the file.
  for (const [v, p] of [[before, beforePath], [after, afterPath]]) {
    if (v?.golden === null || typeof v?.golden !== "object") { console.error(`no golden object in ${p}`); return 2; }
  }
  console.log(`# ${after.module ?? before.module}`);
  console.log(`env before: ${show(before.env)}`);
  console.log(`env after:  ${show(after.env)}`);

  const split = g => ("shared" in g || "declared" in g) ? g : { shared: g, declared: {} };
  before.golden = split(before.golden); after.golden = split(after.golden);
  const shared = diffPaths(before.golden.shared ?? {}, after.golden.shared ?? {});
  const row = ([p, a, b]) => console.log(`  ${p}\n    before ${show(a)}\n    after  ${show(b)}`);
  let failing = shared;
  if (!globs) {
    console.log(`\n## shared — ${shared.length ? `${shared.length} DIFFERENCE(S): regression until explained` : "identical"}`);
    shared.forEach(row);
  } else {
    const part = partition(shared, globs);
    failing = part.undeclared;
    console.log(`\n## shared — ${shared.length ? `${shared.length} DIFFERENCE(S): ` : "identical: "}` +
      `${part.declared.length} declared by ${declaredPath}, ${part.undeclared.length} undeclared` +
      (part.undeclared.length ? " (regression until explained)" : ""));
    part.undeclared.forEach(row);
    if (part.declared.length) console.log(`\n### shared, declared (${part.declared.length})`);
    part.declared.forEach(row);
    if (part.unused.length) console.log(`\n  note: declared glob(s) matched nothing: ${part.unused.join(", ")}`);
  }

  const declared = diffPaths(before.golden.declared ?? {}, after.golden.declared ?? {});
  console.log(`\n## declared — ${declared.length} difference(s), each must match a declared change`);
  declared.forEach(row);

  console.log("\n## timings (median ms per call)");
  const names = [...new Set([...Object.keys(before.timings ?? {}), ...Object.keys(after.timings ?? {})])];
  for (const k of names) {
    const a = before.timings?.[k], b = after.timings?.[k];
    const ma = a?.medianMs ?? a?.ms, mb = b?.medianMs ?? b?.ms;
    const ratio = (typeof ma === "number" && typeof mb === "number" && ma > 0) ? `  x${(mb / ma).toFixed(2)}` : "";
    console.log(`  ${k.padEnd(28)} ${String(ma ?? "-").padStart(10)} -> ${String(mb ?? "-").padStart(10)}${ratio}`);
  }

  const bad = [...leftovers(before.cleanup).map(x => `before ${x}`), ...leftovers(after.cleanup).map(x => `after ${x}`)];
  console.log(`\n## cleanup — ${bad.length ? bad.join("; ") : "clean"}`);
  console.log(`  before ${show(before.cleanup)}\n  after  ${show(after.cleanup)}`);
  return failing.length || bad.length ? 1 : 0;
}

const isMain = (() => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
})();
if (isMain) process.exit(main(process.argv.slice(2)));
