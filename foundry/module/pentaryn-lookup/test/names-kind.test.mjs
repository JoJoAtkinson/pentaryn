// names(kind) reads NAME_PARTS by own key only: an Object.prototype word ("constructor",
// "toString", "__proto__") is an unknown kind and answers everything, like "bogus".
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupNames } from "../lookup-core.mjs";

const indexes = {
  classes: [{ type: "class", name: "Wizard" }, { type: "subclass", name: "Evoker", system: { classIdentifier: "wizard" } }],
  origins: [{ type: "race", name: "Elf, High" }, { type: "background", name: "Sage" }],
  feats: [{ type: "feat", name: "Alert", system: { type: { subtype: "origin" } } }],
};

test("names: an Object.prototype word is an unknown kind, not a junk one-key object", () => {
  const all = groupNames(indexes, "bogus");
  for (const kind of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    assert.deepEqual(groupNames(indexes, kind), all, kind);
  }
});

test("names: a known kind still answers its one part", () => {
  assert.deepEqual(groupNames(indexes, "Subclass"), { subclasses: { wizard: ["Evoker"] } });
  assert.deepEqual(groupNames(indexes, "race"), { species: ["Elf, High"] });
});
