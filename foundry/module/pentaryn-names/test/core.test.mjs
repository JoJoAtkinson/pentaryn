// Core characterisation (guide step 1; behaviour test of transform-creatures-32). Every table runs
// against each entry of fixtures/impls.mjs — today the verbatim oracle (fixtures/legacy-names.mjs),
// from guide step 2 also names-core.mjs. No Foundry stub is installed in this file. Step 2 adds its
// own purity / VERSION tests; it never edits these.
//
// Pins: golden/oracle.json (every row of fixtures/tables.mjs, for every impl). No step may change it.
// The `KNOWN` rows are documented quirks from the guide's step-1 table, pinned as-is — not bugs.
import { IMPLS } from "./fixtures/impls.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN, RELABEL, SHORT_NAME, canEdit } from "./fixtures/tables.mjs";
import { pinJSON } from "./kit/harness.mjs";

test("the pure rules load and run with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
});

for (const [label, M] of IMPLS) {
  test(`${label}: shortName — the guide's table (transform-creatures-32) and hostile inputs`, () => {
    assert.equal(M.shortName("Glubbek, Kuo-toa Net-Mender"), "Glubbek");
    assert.equal(M.shortName(null), "");
    assert.equal(M.shortName(" A , b"), "A");
    assert.equal(M.shortName(undefined), "");
    assert.equal(M.shortName(42), "42");
    assert.equal(M.shortName(","), "");
    assert.equal(M.shortName(0), "0");
    assert.equal(M.shortName(false), "false");
    assert.equal(M.shortName(["x", "y"]), "x", "an array stringifies with commas, so its first element");
    assert.equal(M.shortName({}), "[object Object]");
    assert.equal(M.shortName("Bob\t, X"), "Bob", "trim removes tabs");
  });

  test(`${label}: relabel — the guide's table (transform-creatures-32)`, () => {
    assert.equal(M.relabel("Bob", "Bob", "Rob"), "Rob");
    assert.equal(M.relabel("Glubbek", "Glubbek, Net-Mender", "Brakka, Elder"), "Brakka");
    assert.equal(M.relabel("Glubbek, Net-Mender", "Glubbek, Net-Mender", "Brakka, Elder"), "Brakka, Elder");
    assert.equal(M.relabel("Fishface", "Glubbek, Net-Mender", "X"), null);
    assert.equal(M.relabel("Bob", "Bob, ", "X"), "X");
  });

  test(`${label}: relabel — documented quirks (guide step 1 KNOWN rows, pinned as-is)`, () => {
    // KNOWN: an old name that is only a comma tail has short form "", which an empty label matches
    assert.equal(M.relabel("", ",x", "y"), "y");
    // KNOWN: padded old names — the short form is trimmed and the full name is not, so they differ
    assert.equal(M.relabel(" Bob ", " Bob ", "Rob"), "Rob");
    assert.equal(M.relabel("Bob", " Bob , x", "R"), "R");
    assert.equal(M.relabel("Bob", " Bob ", "Rob"), "Rob", "' Bob ' trims to 'Bob' ≠ ' Bob ', so 'Bob' is its short form");
  });

  test(`${label}: relabel — no comma, case, the new name's form, hostile inputs`, () => {
    assert.equal(M.relabel("Glubbek", "Glubbek", "Brakka, Elder"), "Brakka, Elder", "exact match takes the full new name");
    assert.equal(M.relabel("Glub", "Glubbek", "Brakka"), null);
    assert.equal(M.relabel("Glubbek", "Glubbek, Net-Mender", "Brakka"), "Brakka");
    assert.equal(M.relabel("bob", "Bob", "Rob"), null, "case-sensitive");
    assert.equal(M.relabel(null, "Bob", "Rob"), null);
    assert.equal(M.relabel(undefined, undefined, "Rob"), "Rob", "undefined === undefined is an exact match");
    assert.equal(M.relabel(null, null, "Rob"), "Rob");
    assert.equal(M.relabel("", "", "Rob"), "Rob");
    assert.equal(M.relabel("Bob", "Bob", undefined), undefined, "an exact match returns newName as given");
    assert.equal(M.relabel("Bob", "Bob, X", null), "", "the short form of null is ''");
    assert.equal(M.relabel("Bob", "Bob, X", 42), "42");
    assert.equal(M.relabel("42", 42, "x"), "x", "'42' !== 42, but shortName(42) is the string '42', which !== 42, so it counts as the short form");
  });

  test(`${label}: planner — the guide's table (transform-creatures-32)`, () => {
    const [guide] = PLAN;
    assert.deepEqual(M.plan(guide.tokens, { ...guide.opts, canEdit }), [{ _id: "t1", name: "Rob" }]);
  });

  test(`${label}: planner — KNOWN sibling synthetic tokens both follow (N-L1; live SF6 agrees)`, () => {
    const sib = PLAN.find(p => p.name === "sibling synthetic tokens");
    assert.deepEqual(M.plan(sib.tokens, { ...sib.opts, canEdit }), [
      { _id: "g1", name: "Goblin Boss" },
      { _id: "g2", name: "Goblin Boss" },
    ]);
  });

  test(`${label}: planner — canEdit is asked once per token of the actor, in order, never for others`, () => {
    const seen = [];
    const [guide] = PLAN;
    M.plan(guide.tokens, { ...guide.opts, canEdit: t => (seen.push(t.id), !t.locked) });
    assert.deepEqual(seen, ["t1", "t3", "t4"]);
  });

  test(`${label}: every table row, pinned (golden/oracle.json)`, () => {
    const run = (fn, args) => {
      try {
        const out = fn(...args);
        return { out: out === undefined ? "<undefined>" : out, type: out === null ? "null" : typeof out };
      } catch (err) {
        return { threw: `${err?.name}: ${err?.message}` };
      }
    };
    const shown = args => args.map(a => (a === undefined ? "<undefined>" : a));
    pinJSON("oracle", {
      shortName: SHORT_NAME.map(args => ({ args: shown(args), ...run(M.shortName, args) })),
      relabel: RELABEL.map(args => ({ args: shown(args), ...run(M.relabel, args) })),
      plan: PLAN.map(p => ({ name: p.name, ...run(M.plan, [p.tokens, { ...p.opts, canEdit }]) })),
    }, import.meta.url);
  });
}
