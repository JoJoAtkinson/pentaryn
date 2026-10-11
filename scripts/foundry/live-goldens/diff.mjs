#!/usr/bin/env node
// Compare a wave-2 live golden's "before" and "after" runs (the JSON string a
// scripts/foundry/live-goldens/<m>.js eval-js call returned, saved as a file).
//
//   node scripts/foundry/live-goldens/diff.mjs .state/live-goldens/wave2/before/lookup.json \
//                                              .state/live-goldens/wave2/after/lookup.json
//
// Prints: env (versions), every path under golden.shared that differs (a regression until
// explained), every path under golden.declared that differs (expected: check it against the
// declared change named in the script header), the timings side by side, and both cleanups.
// Exit 0 when golden.shared is equal and both cleanups left nothing behind, 1 otherwise,
// 2 on bad input. Only for the wave-1 style { golden: { shared, declared } } goldens.
import { readFileSync } from "node:fs";

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
  return keys.flatMap(k => diffPaths(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : (path ? `${path}.${k}` : k)));
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

function main([beforePath, afterPath]) {
  if (!beforePath || !afterPath) { console.error("usage: diff.mjs <before.json> <after.json>"); return 2; }
  let before, after;
  try { before = load(beforePath); after = load(afterPath); } catch (e) { console.error(`bad input: ${e.message}`); return 2; }
  if (!before?.golden || !after?.golden) {
    console.error(`no golden in ${!before?.golden ? beforePath : afterPath}${(before?.skipped || after?.skipped) ? ` (skipped: ${before?.skipped ?? after?.skipped})` : ""}`);
    return 2;
  }
  console.log(`# ${after.module ?? before.module}`);
  console.log(`env before: ${show(before.env)}`);
  console.log(`env after:  ${show(after.env)}`);

  const shared = diffPaths(before.golden.shared ?? {}, after.golden.shared ?? {});
  console.log(`\n## shared — ${shared.length ? `${shared.length} DIFFERENCE(S): regression until explained` : "identical"}`);
  for (const [p, a, b] of shared) console.log(`  ${p}\n    before ${show(a)}\n    after  ${show(b)}`);

  const declared = diffPaths(before.golden.declared ?? {}, after.golden.declared ?? {});
  console.log(`\n## declared — ${declared.length} difference(s), each must match a declared change`);
  for (const [p, a, b] of declared) console.log(`  ${p}\n    before ${show(a)}\n    after  ${show(b)}`);

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
  return shared.length || bad.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
