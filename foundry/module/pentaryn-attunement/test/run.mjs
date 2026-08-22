#!/usr/bin/env node
/**
 * Fixtures for the two pure functions. No dependencies — `node test/run.mjs`.
 *
 * `computeSlots` is the only part of this module with non-obvious behaviour, and
 * it is the part a browser test would exercise least reliably: the interesting
 * cases are corrupt flags, deleted items, and over-cap states, none of which are
 * convenient to stage by hand at the table.
 *
 * It is also the part that must never throw. It runs inside a render hook, so an
 * exception there takes the character sheet's sidebar with it.
 *
 * Foundry globals are stubbed only as far as importing the module requires: the
 * entry point registers hooks at load time and touches nothing else.
 */

globalThis.Hooks = { on() {}, once() {} };

const { computeSlots, patchProficiencyMap } = await import("../attunement.mjs");

/**
 * Minimal stand-in for an Actor. `items` only needs `filter`, and each item only
 * needs `id` and `system.attuned` — that is the entire surface computeSlots uses.
 */
function actor({ attuned = [], all = null, slots, max = 3 } = {}) {
  const ids = all ?? attuned;
  const items = ids.map(id => ({ id, system: { attuned: attuned.includes(id) } }));
  return {
    system: { attributes: { attunement: { max } } },
    items,
    getFlag: () => slots
  };
}

let pass = 0;
const failures = [];

function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}

/** Convenience: assert only the slot array. */
function slotsOf(a) { return computeSlots(a).slots; }

/* ── The ordinary cases ───────────────────────────────────────────────────── */

check("no flag, nothing attuned → three holes",
  slotsOf(actor()), [null, null, null]);

check("no flag, three attuned → packed in item order",
  slotsOf(actor({ attuned: ["a", "b", "c"] })), ["a", "b", "c"]);

check("flag honoured over item order",
  slotsOf(actor({ attuned: ["a", "b", "c"], slots: ["c", "a", "b"] })),
  ["c", "a", "b"]);

check("holes are preserved, not compacted",
  slotsOf(actor({ attuned: ["a", "c"], slots: ["a", null, "c"] })),
  ["a", null, "c"]);

/* ── The reason slots are persisted at all ────────────────────────────────── */

// Unattuning the middle item must not move its neighbours. If this compacts,
// the strip stops being a stable surface and the whole design argument fails.
check("unattuning the middle leaves the ends in place",
  slotsOf(actor({ attuned: ["a", "c"], all: ["a", "b", "c"], slots: ["a", "b", "c"] })),
  ["a", null, "c"]);

check("a new item fills the vacated hole rather than appending",
  slotsOf(actor({ attuned: ["a", "c", "d"], all: ["a", "b", "c", "d"], slots: ["a", null, "c"] })),
  ["a", "d", "c"]);

/* ── Flag data that has gone stale or bad ─────────────────────────────────── */

check("ids for deleted items become holes",
  slotsOf(actor({ attuned: ["a"], slots: ["gone", "a", "alsogone"] })),
  [null, "a", null]);

check("ids for no-longer-attuned items become holes",
  slotsOf(actor({ attuned: ["a"], all: ["a", "b"], slots: ["b", "a"] })),
  [null, "a", null]);

check("duplicate ids in the flag are not double-placed",
  slotsOf(actor({ attuned: ["a"], slots: ["a", "a", "a"] })),
  ["a", null, null]);

check("garbage flag types are ignored",
  slotsOf(actor({ attuned: ["a"], slots: [42, {}, true, "a"] })),
  [null, null, null, "a"]);

check("a non-array flag falls back to natural order",
  slotsOf(actor({ attuned: ["a", "b"], slots: "corrupt" })),
  ["a", "b", null]);

check("a flag longer than max is trimmed back to max when the tail is empty",
  slotsOf(actor({ attuned: ["a"], slots: ["a", null, null, null, null] })),
  ["a", null, null]);

/* ── Over cap — the live Ballad case ──────────────────────────────────────── */

const over = computeSlots(actor({ attuned: ["a", "b", "c", "d", "e"] }));
check("over cap renders every attuned item, not just max",
  over.slots, ["a", "b", "c", "d", "e"]);
check("over cap counts correctly", [over.value, over.max, over.over], [5, 3, true]);

check("at cap is not over cap",
  computeSlots(actor({ attuned: ["a", "b", "c"] })).over, false);

/* ── attunement.max is not always 3 ───────────────────────────────────────── */

check("a raised max draws more slots",
  slotsOf(actor({ attuned: ["a"], max: 5 })),
  ["a", null, null, null, null]);

check("max 0 with something attuned still shows it, and is over cap",
  computeSlots(actor({ attuned: ["a"], max: 0 })),
  { slots: ["a"], max: 0, value: 1, over: true });

check("max 0 with nothing attuned draws nothing",
  slotsOf(actor({ max: 0 })), []);

/* ── Must not throw ───────────────────────────────────────────────────────── */

// A vehicle or a malformed actor reaching this function should degrade to the
// default rather than taking the sidebar down with it.
check("missing attunement schema falls back to 3",
  computeSlots({ system: {}, items: [], getFlag: () => undefined }).max, 3);

check("a non-numeric max falls back to 3",
  computeSlots(actor({ max: "three" })).max, 3);

/* ── The proficiency-map patch ────────────────────────────────────────────── */

// dnd5e's map covers armour categories only, so every ring/rod/wand/trinket/
// wondrous item reports "Not Proficient" — the lookup misses and the multiplier
// falls to 0. These fixtures pin the shape of the correction, not the symptom.

const stock = { natural: true, clothing: true, light: "lgt", medium: "med", heavy: "hvy", shield: "shl" };

{
  const map = { ...stock };
  const added = patchProficiencyMap(map);
  check("adds exactly the unmapped magic-item categories",
    added.sort(), ["ring", "rod", "trinket", "wand", "wondrous"]);
  check("armour categories are left untouched",
    { light: map.light, medium: map.medium, heavy: map.heavy, shield: map.shield, clothing: map.clothing },
    { light: "lgt", medium: "med", heavy: "hvy", shield: "shl", clothing: true });
  check("vehicle is deliberately not claimed", map.vehicle, undefined);
}

{
  // If a future dnd5e defines one of these itself, its definition must win.
  const map = { ...stock, wondrous: "wnd" };
  const added = patchProficiencyMap(map);
  check("an existing definition is never overwritten", map.wondrous, "wnd");
  check("and is not reported as added", added.includes("wondrous"), false);
}

{
  // Idempotent: init can only run once, but a reload must not double-report.
  const map = { ...stock };
  patchProficiencyMap(map);
  check("a second pass adds nothing", patchProficiencyMap(map), []);
}

/* ── Report ───────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${pass} passed\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`✓ ${pass} fixtures passed`);
