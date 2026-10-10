#!/usr/bin/env node
/**
 * Fixtures for chain-core.mjs, then light-core.mjs (test/light.mjs) and migrate.mjs
 * (test/migrate.mjs) — `node test/run.mjs`. No dependencies, no Foundry.
 * The import itself is a check: chain-core.mjs must load with `game`, `canvas` and `PIXI` undefined.
 */

const { MODULE, CHAIN_FLAG, readChain, chainPairs, linksTouching, chainGeometry, chainThickness } =
  await import("../chain-core.mjs");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
const tok = (id, chain) => ({ id, flags: chain === undefined ? {} : { [MODULE]: { [CHAIN_FLAG]: chain } } });
const r3 = n => Math.round(n * 1000) / 1000;

/* ── readChain ───────────────────────────────────────────────────────────── */
check("flag → anchor", readChain(tok("a", { anchor: "b" })), { anchor: "b" });
check("anchor is trimmed", readChain(tok("a", { anchor: "  b " })), { anchor: "b" });
check("no flags → null", readChain({ id: "a" }), null);
check("null doc → null", readChain(null), null);
check("empty anchor → null", readChain(tok("a", { anchor: "" })), null);
check("non-string anchor → null", readChain(tok("a", { anchor: 5 })), null);
check("array flag → null", readChain(tok("a", ["b"])), null);
check("string flag → null", readChain(tok("a", "b")), null);
const throwing = { get flags() { throw new Error("boom"); } };
check("throwing getter → null", readChain(throwing), null);

/* ── chainPairs ──────────────────────────────────────────────────────────── */
const scene = [tok("hulk", { anchor: "stake" }), tok("stake"), tok("pc")];
check("one chain", chainPairs(scene), [{ chained: "hulk", anchor: "stake" }]);
check("anchor missing from scene → skipped", chainPairs([tok("hulk", { anchor: "gone" }), tok("pc")]), []);
check("self-chain → skipped", chainPairs([tok("a", { anchor: "a" })]), []);
check("one anchor, two chained", chainPairs([tok("x", { anchor: "s" }), tok("y", { anchor: "s" }), tok("s")]),
  [{ chained: "x", anchor: "s" }, { chained: "y", anchor: "s" }]);
check("junk entries ignored", chainPairs([null, {}, tok("hulk", { anchor: "stake" }), tok("stake")]), [{ chained: "hulk", anchor: "stake" }]);
check("undefined list → []", chainPairs(undefined), []);
check("accepts any iterable", chainPairs(new Set(scene)).length, 1);

/* ── linksTouching ───────────────────────────────────────────────────────── */
const pairs = chainPairs(scene);
check("chained end touches", linksTouching(pairs, "hulk").length, 1);
check("anchor end touches", linksTouching(pairs, "stake").length, 1);
check("bystander doesn't", linksTouching(pairs, "pc").length, 0);
check("no pairs → []", linksTouching(undefined, "x"), []);

/* ── chainGeometry ───────────────────────────────────────────────────────── */
const g1 = chainGeometry({ x: 0, y: 0 }, { x: 300, y: 400 });
check("length 3-4-5", g1.length, 500);
check("starts at anchor", [g1.x, g1.y], [0, 0]);
check("angle", r3(g1.angle), r3(Math.atan2(400, 300)));
check("straight down → +90°", r3(chainGeometry({ x: 5, y: 5 }, { x: 5, y: 105 }).angle), r3(Math.PI / 2));
check("pointing left → 180°", r3(chainGeometry({ x: 100, y: 0 }, { x: 0, y: 0 }).angle), r3(Math.PI));
check("same point → length 0", chainGeometry({ x: 1, y: 1 }, { x: 1, y: 1 }).length, 0);
check("junk points never NaN", chainGeometry(null, { x: "a" }), { x: 0, y: 0, length: 0, angle: 0 });

/* ── chainThickness ──────────────────────────────────────────────────────── */
check("150 px grid → 42", chainThickness(150), 42);
check("100 px grid → 28", chainThickness(100), 28);
check("tiny grid floors at 12", chainThickness(20), 12);
check("missing grid → 100 px default", chainThickness(undefined), 28);

console.log(`pentaryn-senses chain-core: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exitCode = 1; }

// The Light cantrip and lit items (light-core.mjs). Sets process.exitCode on failure.
await import("./light.mjs");

// The one-shot darkvision sight reset (migrate.mjs). Sets process.exitCode on failure.
await import("./migrate.mjs");
