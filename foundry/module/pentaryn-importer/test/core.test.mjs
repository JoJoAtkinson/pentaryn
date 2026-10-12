// Core characterisation (guide step 1.4; behaviour tests of items-journal-2 and -3). One table per pure
// function, run against every entry of fixtures/impls.mjs — today the verbatim oracle, from step 2
// also importer-core.mjs. Key order is compared with JSON.stringify where it is part of the contract.
import { IMPLS } from "./fixtures/impls.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise, pinJSON } from "./kit/harness.mjs";

const same = (got, want, msg) => assert.equal(JSON.stringify(got), JSON.stringify(want), msg);
const KEYS = ["expected", "_id", "img", "folder", "_stats", "ownership"];

test("the pure functions load and run with no Foundry globals", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas"]) assert.equal(g in globalThis, false, g);
});

for (const [label, M] of IMPLS) {
  test(`${label}: constants (items-journal-2, -3)`, () => {
    assert.equal(M.CONTRACT_ID, "pentaryn/actors.json@1");
    assert.equal(M.FLAG_SCOPE, "pentaryn");
    assert.equal(M.DEFAULT_TIMEOUT_MS, 15000);
    assert.equal(M.FORMULA_GLOBS.length, 25);
    assert.equal(M.FORMULA_PATTERNS.length, 25);
    same(M.STRIPPED_ACTOR_KEYS, KEYS);
    same(M.STRIPPED_ITEM_KEYS, KEYS);
    pinJSON("formula-globs", M.FORMULA_GLOBS, import.meta.url);
    for (const s of ["", "1", "2d8 + 4", "(1d6+2)*3", "-1", "10/2", "1.5"]) assert.equal(M.FORMULA_OK.test(s), true, s);
    for (const s of ["@prof", "+4 ft", "1d6+@mod", "2d6[fire]", "1d20kh", "3−1", "ft"]) assert.equal(M.FORMULA_OK.test(s), false, s);
  });

  test(`${label}: error classes keep their names and hierarchy`, () => {
    const abort = new M.PentarynAbort("a");
    const fail = new M.PentarynAssertionError("b");
    const base = new M.PentarynError("c");
    same([abort.name, fail.name, base.name], ["PentarynAbort", "PentarynAssertionError", "PentarynError"]);
    same([abort.message, fail.message, base.message], ["a", "b", "c"]);
    assert.ok(abort instanceof M.PentarynError && abort instanceof Error);
    assert.ok(fail instanceof M.PentarynError && fail instanceof Error);
    assert.equal(abort instanceof M.PentarynAssertionError, false);
    assert.equal(fail instanceof M.PentarynAbort, false);
  });

  test(`${label}: valuesMatch — the guide table (items-journal-2)`, () => {
    const table = [
      [3, "3", true], [3, "3.0", true], [3, "x", false], [3, Infinity, false], [true, "true", false],
      [null, undefined, true], [null, 0, false], ["DC 13", "DC 13 ", true], ["a  b", "a b", true], ["x", undefined, false],
    ];
    for (const [e, a, want] of table) assert.equal(M.valuesMatch(e, a), want, `${JSON.stringify(e)} vs ${String(a)}`);
  });

  test(`${label}: valuesMatch — hostile rows, pinned as today (golden/values-match.json)`, () => {
    // KNOWN (guide step 1.4, documented quirk, not a bug): numbers compare after Number(), so an empty
    // string, whitespace, null, false and [] all read as 0, and "0x10" as 16.
    const rows = [
      ["0 vs ''", 0, ""], ["0 vs ' '", 0, " "], ["0 vs null", 0, null], ["0 vs false", 0, false], ["0 vs []", 0, []],
      ["16 vs '0x10'", 16, "0x10"], ["1 vs true", 1, true], ["1 vs '1e0'", 1, "1e0"], ["NaN vs NaN", NaN, NaN],
      ["-0 vs 0", -0, 0], ["false vs 0", false, 0], ["false vs false", false, false], ["null vs ''", null, ""],
      ["null vs null", null, null], ["undefined vs undefined", undefined, undefined], ["'' vs ''", "", ""],
      ["'' vs undefined", "", undefined], ["'x' vs null", "x", null], ["'null' vs null", "null", null],
      ["'1' vs 1", "1", 1], ["'a\\tb' vs 'a b'", "a\tb", "a b"], ["'[object Object]' vs {}", "[object Object]", {}],
      ["'3' vs [3]", "3", [3]], ["{} vs {}", {}, {}],
    ];
    pinJSON("values-match", Object.fromEntries(rows.map(([k, e, a]) => [k, M.valuesMatch(e, a)])), import.meta.url);
  });

  test(`${label}: normalise and cloneJson`, () => {
    same(["  a \n\t b  ", 3, null, undefined, ""].map(M.normalise), ["a b", "3", "null", "undefined", ""]);
    const src = { a: 1, u: undefined, d: new Date(0), n: [1, undefined], i: Infinity };
    same(M.cloneJson(src), { a: 1, d: "1970-01-01T00:00:00.000Z", n: [1, null], i: null });
  });

  test(`${label}: walkStrings / walkLeaves visit order`, () => {
    const node = { a: "x", b: [1, "y", { c: "z" }], d: { e: null, f: true }, g: [] };
    const strings = [];
    const leaves = [];
    M.walkStrings(node, "", (p, v) => strings.push([p, v]));
    M.walkLeaves(node, "", (p, v) => leaves.push([p, v]));
    same(strings, [["a", "x"], ["b.1", "y"], ["b.2.c", "z"]]);
    same(leaves, [["a", "x"], ["b", [1, "y", { c: "z" }]], ["d.e", null], ["d.f", true], ["g", []]]);
    same([M.isPlainObject({}), M.isPlainObject([]), M.isPlainObject(null), M.isPlainObject("x")], [true, false, false, false]);
  });

  test(`${label}: lintFormulas — the guide case and the empty list`, () => {
    const actors = [{
      flags: { pentaryn: { slug: "s" } },
      system: { attributes: { hp: { formula: "2d8+@abilities.con.mod" }, movement: { walk: "30", units: "ft" } } },
      items: [{ system: { activities: { abc: { attack: { bonus: "+4" } } } } }],
    }];
    same(M.lintFormulas(actors), [{ slug: "s", path: "system.attributes.hp.formula", value: "2d8+@abilities.con.mod" }]);
    same(M.lintFormulas([]), []);
  });

  // Rows here and in golden/prepare.json pin Foundry's getProperty semantics on plain JSON (the oracle
  // calls it at :474 and :532): a literal dotted key wins ("flags.pentaryn.slug" as one key), a string
  // entry throws the `in` operator's TypeError (the oracle's row in the importer-R4 test below; the
  // core refuses a non-object entry before it gets there). Step 2's getPath must reproduce them (copy the body).
  test(`${label}: lintFormulas — hostile table (golden/lint.json)`, async () => {
    const act = (extra = {}) => ({ flags: { pentaryn: { slug: "s" } }, ...extra });
    await characterise("lint", actors => M.lintFormulas(actors), [
      [[act({ system: { attributes: { movement: { walk: "ft", hover: "yes", units: "ft" } } } })]],
      [[act({ system: { attributes: { hp: { formula: 5 }, init: { bonus: "@prof" } } } })]],
      [[act({ items: [{ system: { uses: { max: "@prof", recovery: [{ formula: "1d4" }, { formula: "@x" }] } } }] })]],
      [[act({ items: [{ system: { activities: { a1: { damage: { parts: [{ bonus: "2", custom: { formula: "@mod" } }] }, save: { dc: { formula: "8+@prof" } } } } } }] })]],
      [[act({ items: [{ system: { activities: { a1: { consumption: { targets: [{ value: "3−1" }] }, target: { template: { size: "" } } } } } }] })]],
      [[{ name: "Named", system: { attributes: { hp: { formula: "@x" } } } }]],
      [[{ system: { attributes: { hp: { formula: "@x" } } } }]],
      [[{ flags: { pentaryn: { slug: 5 } }, system: { attributes: { hp: { formula: "@x" } } } }]],
      [[null, { flags: { pentaryn: { slug: "t" } }, system: { attributes: { hp: { formula: "d" } } } }]],
      [[{ "flags.pentaryn.slug": "literal", system: { attributes: { hp: { formula: "@x" } } } }]],
      [undefined],
    ], { file: import.meta.url });
  });

  test(`${label}: preparePayload — the guide case; the input is not mutated`, () => {
    const entry = {
      name: "X", img: "i", _id: "1", expected: { actor: {} }, prototypeToken: { texture: { src: "a" }, width: 1 },
      items: [{ name: "I", img: "j", _id: "2", expected: {} }], flags: { pentaryn: { slug: "x" } },
    };
    const before = JSON.stringify(entry);
    const { data, items, expected, slug } = M.preparePayload(entry);
    for (const k of ["img", "_id", "expected", "items"]) assert.equal(k in data, false, k);
    same(data.prototypeToken, { width: 1 });
    same(items[0], { name: "I" });
    same(expected, { actor: {} });
    assert.equal(slug, "x");
    same(data, { name: "X", prototypeToken: { width: 1 }, flags: { pentaryn: { slug: "x" } } });
    assert.equal(JSON.stringify(entry), before);
  });

  test(`${label}: preparePayload — refusals are PentarynAbort with today's text`, () => {
    const refusal = entry => {
      try {
        M.preparePayload(entry);
      } catch (err) {
        return [err.name, err.message];
      }
      return null;
    };
    const why = "The slug is the upsert key; refusing the run rather than creating an unmatched Actor.";
    same(refusal({ name: "X" }), ["PentarynAbort", `An actor entry (name "X") has no flags.pentaryn.slug. ${why}`]);
    same(refusal({ flags: { pentaryn: { slug: 5 } } }), ["PentarynAbort", `An actor entry (name undefined) has no flags.pentaryn.slug. ${why}`]);
    same(refusal({ name: "E", flags: { pentaryn: { slug: "" } } }), ["PentarynAbort", `An actor entry (name "E") has no flags.pentaryn.slug. ${why}`]);
  });

  test(`${label}: preparePayload — hostile table (golden/prepare.json)`, async () => {
    const f = { flags: { pentaryn: { slug: "x" } } };
    await characterise("prepare", entry => M.preparePayload(entry), [
      { ...f, prototypeToken: null },
      { ...f, items: "not an array" },
      { ...f, items: [{ name: "I", folder: "f", _stats: {}, ownership: {}, flags: { pentaryn: { action: "a" } } }] },
      { ...f, items: [null] },
      { ...f, folder: "f", _stats: { a: 1 }, ownership: { default: 3 }, expected: null, system: { attributes: { hp: { value: 4 } } } },
      { ...f, prototypeToken: { texture: null, name: "T" } },
    ], { file: import.meta.url });
  });

  // importer-R4 [declared]: the non-object rows left the shared table above, because the core now
  // refuses them as PentarynAbort REFUSED where the verbatim oracle still throws its TypeError.
  test(`${label}: preparePayload — a non-object entry (importer-R4)`, () => {
    const thrown = entry => {
      try {
        M.preparePayload(entry);
      } catch (err) {
        return [err.name, err.message, err.code ?? null];
      }
      return null;
    };
    const why = "Each element of actors is one Actor; refusing the run rather than guessing what it meant.";
    const want = label === "oracle"
      ? [
        ["TypeError", "Cannot use 'in' operator to search for 'flags.pentaryn.slug' in a string entry", null],
        ["TypeError", "Cannot read properties of null (reading 'expected')", null],
        ["PentarynAbort", "An actor entry (name undefined) has no flags.pentaryn.slug. The slug is the upsert key; refusing the run rather than creating an unmatched Actor.", null],
      ]
      : [
        ["PentarynAbort", `An actor entry is not an object (got "a string entry"). ${why}`, "REFUSED"],
        ["PentarynAbort", `An actor entry is not an object (got null). ${why}`, "REFUSED"],
        ["PentarynAbort", `An actor entry is not an object (got [{"flags":{"pentaryn":{"slug":"x"}}}]). ${why}`, "REFUSED"],
      ];
    same(["a string entry", null, [{ flags: { pentaryn: { slug: "x" } } }]].map(thrown), want);
  });

  // importer-EC4 [declared]: two Items on one entry with the same flags.pentaryn.action used to pass
  // (the readback's find() matched both rows to one live Item). The core now refuses the entry in
  // the R1 pre-pass, before any write; the verbatim oracle still accepts it.
  test(`${label}: preparePayload — a duplicate item action on one entry (importer-EC4)`, () => {
    const thrown = entry => {
      try {
        M.preparePayload(entry);
      } catch (err) {
        return [err.name, err.message, err.code ?? null];
      }
      return null;
    };
    const act = action => ({ name: action, flags: { pentaryn: { action } } });
    const dup = { name: "D", flags: { pentaryn: { slug: "d" } }, items: [act("bite"), act("claw"), act("bite")] };
    const distinct = { flags: { pentaryn: { slug: "d" } }, items: [act("bite"), act("claw"), { name: "no action" }, { name: "none" }, "odd"] };
    assert.equal(thrown(distinct), null, "distinct actions, unflagged items and non-objects are not this refusal");
    same(thrown(dup), label === "oracle" ? null : [
      "PentarynAbort",
      "Actor \"d\" has two items with flags.pentaryn.action \"bite\". The action is the upsert key for "
        + "its Items; refusing the run rather than letting one row shadow the other.",
      "REFUSED",
    ]);
  });

  test(`${label}: toUpdatePayload / toCreatePayload`, () => {
    const data = { system: { attributes: { hp: { value: 5, max: 9 } } }, flags: { pentaryn: { contentHash: "h", slug: "x" } } };
    const before = JSON.stringify(data);
    const up = M.toUpdatePayload(data);
    same(up.system.attributes.hp, { max: 9 });
    same(up.flags.pentaryn, { slug: "x" });
    const cr = M.toCreatePayload(data);
    same(cr.system.attributes.hp, { value: 5, max: 9 });
    same(cr.flags.pentaryn, { slug: "x" });
    assert.equal(JSON.stringify(data), before, "both work on a clone");
    same(M.toUpdatePayload({ name: "n" }), { name: "n" });
    same(M.toCreatePayload({ flags: { other: { contentHash: "h" } } }), { flags: { other: { contentHash: "h" } } });
    same(M.toUpdatePayload({ system: { attributes: { hp: null } } }), { system: { attributes: { hp: null } } });
  });

  test(`${label}: assertionMessage — exact text (items-journal-3)`, () => {
    assert.equal(
      M.assertionMessage({ slug: "s", action: "a", activityId: "id1", path: "p", expected: 1, actual: 2, hint: "h" }),
      'READBACK ASSERTION FAILED — aborting the whole run.\n  where:    actor "s" → item "a" → activity id1\n  path:     p\n  expected: 1\n  actual:   2\n  hint:     h',
    );
    assert.equal(
      M.assertionMessage({ slug: "s", path: "p", expected: [1, "x"], actual: undefined }),
      'READBACK ASSERTION FAILED — aborting the whole run.\n  where:    actor "s"\n  path:     p\n  expected: [1,"x"]\n  actual:   undefined',
    );
    assert.equal(
      M.assertionMessage({ slug: "s", activityId: "id1", path: "p", expected: null, actual: "DC 13 " }),
      'READBACK ASSERTION FAILED — aborting the whole run.\n  where:    actor "s" → activity id1\n  path:     p\n  expected: null\n  actual:   "DC 13 "',
    );
  });
}
