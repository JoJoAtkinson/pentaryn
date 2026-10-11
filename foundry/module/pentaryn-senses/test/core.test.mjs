// The pure files are imported FIRST and BARE — no Foundry stub installed. If one touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
//
// Characterisation (senses checkpoint, wave 3). The chain-core block is the old test/run.mjs body
// (31 checks), converted with its `check()` semantics kept (harness.checkJSON). Frozen once committed:
// during the refactor only the import paths may change (to ../senses-core.mjs).
import * as chainCore from "../chain-core.mjs";
import * as lightCore from "../light-core.mjs";
import * as migrate from "../migrate.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkJSON, manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("the pure files load with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry", "PIXI"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  assert.equal(typeof chainCore.chainPairs, "function");
  assert.equal(typeof lightCore.carriedLightOf, "function");
  assert.equal(typeof migrate.planSightReset, "function");
});

test("one module id everywhere, and it is module.json's id", () => {
  const id = manifestOf(ROOT).id;
  assert.equal(chainCore.MODULE, id);
  assert.equal(lightCore.MODULE, id);
  assert.equal(migrate.MODULE, id);
  assert.equal(chainCore.CHAIN_FLAG, "chain");
});

test("pure exports (names) — whatever the barrel becomes, it exports at least these", () => {
  const has = (mod, names) => { for (const n of names) assert.ok(n in mod, `${n} is not exported`); };
  has(chainCore, ["CHAIN_FLAG", "MODULE", "chainGeometry", "chainPairs", "chainThickness", "linksTouching", "readChain"]);
  has(lightCore, [
    "DARK", "LIGHT_PROFILES", "MODULE", "PHB_LIGHT_ACTOR", "SPELL_LIGHT", "TORCH_ACTIVITY_ID", "carriedLightOf", "castFlag",
    "isHooded", "isLightSpellData", "isLightToggle", "isLit", "isPHBLightActorSource", "lightFor", "lightingItemId",
    "planSpellLight", "profileFor", "profileKey", "readSpellCast", "readSpellLight", "restoredLight", "slug",
    "sourcesUnder", "spellLightUpdate", "strongest", "torchActivityData"
  ]);
  // migrate.mjs's pure half only (registerSightReset / resetSight are Foundry-side, pinned in glue)
  has(migrate, ["MODULE", "RESET_SIGHT", "SIGHT_RESET", "SIGHT_RESET_DONE", "needsSightReset", "planSightReset", "systemReady"]);
});

test("chain-core (the old test/run.mjs block, 31 checks)", () => {
  const { MODULE, CHAIN_FLAG, readChain, chainPairs, linksTouching, chainGeometry, chainThickness } = chainCore;
  let failed = 0;
  const check = (name, got, want) => { if (!checkJSON(name, got, want)) failed++; };
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

  assert.equal(failed, 0, `${failed} chain-core check(s) failed`);
});

test("chain-core hostile rows: duplicate ids, a chained anchor, a non-string id", () => {
  const { MODULE, chainPairs, linksTouching } = chainCore;
  const tok = (id, anchor) => ({ id, flags: anchor === undefined ? {} : { [MODULE]: { chain: { anchor } } } });
  // a chain to a chained token is drawn: chains are pairs, not a tree
  assert.deepEqual(chainPairs([tok("a", "b"), tok("b", "c"), tok("c")]), [{ chained: "a", anchor: "b" }, { chained: "b", anchor: "c" }]);
  // two docs with the same id: both are read (no de-duplication)
  assert.deepEqual(chainPairs([tok("a", "s"), tok("a", "s"), tok("s")]), [{ chained: "a", anchor: "s" }, { chained: "a", anchor: "s" }]);
  // a numeric id is not a token
  assert.deepEqual(chainPairs([{ id: 5, flags: { [MODULE]: { chain: { anchor: "s" } } } }, tok("s")]), []);
  // a mutual chain is two pairs
  assert.deepEqual(linksTouching(chainPairs([tok("a", "b"), tok("b", "a")]), "a").length, 2);
});
