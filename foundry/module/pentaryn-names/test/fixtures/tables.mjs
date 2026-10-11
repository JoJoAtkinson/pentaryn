// Input tables for the pure rules (guide step 1: transform-creatures-32's behaviourTest plus hostile
// inputs). Shared by core.test.mjs (oracle today; core vs oracle from guide step 2) and glue.test.mjs
// (the published api.shortName / api.relabel against the same rows). Outputs are pinned in
// golden/oracle.json; the explicit expectations live in core.test.mjs.

export const SHORT_NAME = [
  ["Glubbek, Kuo-toa Net-Mender"],
  [null],
  [" A , b"],
  [undefined],
  [42],
  [","],
  [""],
  ["   "],
  ["Bob"],
  ["Bob,"],
  [" Bob , x"],
  ["a,b,c"],
  ["  Glubbek  ,  Elder  "],
  ["Bob\t, X"],
  [0],
  [false],
  [{}],
  [["x", "y"]],
];

export const RELABEL = [
  ["Bob", "Bob", "Rob"],
  ["Glubbek", "Glubbek, Net-Mender", "Brakka, Elder"],
  ["Glubbek, Net-Mender", "Glubbek, Net-Mender", "Brakka, Elder"],
  ["Fishface", "Glubbek, Net-Mender", "X"],
  ["Bob", "Bob, ", "X"],
  // KNOWN (guide step 1, documented quirk): an old name that is only a comma tail has short form "",
  // so an empty label follows it
  ["", ",x", "y"],
  // KNOWN (guide step 1, documented quirk): padded old names — the short form is trimmed, the full
  // name is not, so "Bob" counts as the short form of " Bob , x"
  [" Bob ", " Bob ", "Rob"],
  ["Bob", " Bob , x", "R"],
  ["Bob", " Bob ", "Rob"],
  // no comma in the old name: the short form equals the full name, so only an exact match follows
  ["Glubbek", "Glubbek", "Brakka, Elder"],
  ["Glub", "Glubbek", "Brakka"],
  // the short form follows into the new name's short form, even when the new name has no comma
  ["Glubbek", "Glubbek, Net-Mender", "Brakka"],
  // exact match wins first: the full new name, comma and all
  ["Glubbek, Net-Mender", "Glubbek, Net-Mender", "Brakka"],
  // label already the new short form: relabel still answers (sync skips label === t.name)
  ["Bob", "Bob, Old", "Bob, New"],
  // case-sensitive
  ["bob", "Bob", "Rob"],
  // hostile
  [null, "Bob", "Rob"],
  [undefined, undefined, "Rob"],
  [null, null, "Rob"],
  ["", "", "Rob"],
  ["Bob", "Bob", undefined],
  ["Bob", "Bob, X", null],
  ["Bob", "Bob, X", 42],
  ["42", 42, "x"],
];

/** Planner rows: [tokens, {actorId, oldName, newName, locked flag key}] — canEdit is t => !t.locked. */
export const PLAN = [
  {
    name: "guide table (transform-creatures-32)",
    tokens: [
      { id: "t1", actorId: "a", name: "Bob" },
      { id: "t2", actorId: "b", name: "Bob" },
      { id: "t3", actorId: "a", name: "Rob" },
      { id: "t4", actorId: "a", name: "Bob", locked: true },
    ],
    opts: { actorId: "a", oldName: "Bob", newName: "Rob" },
  },
  {
    // KNOWN (guide step 1, N-L1; transform-creatures-34 dropped to the live test): two synthetic
    // (unlinked) tokens carry the base actor's id, so both follow the base actor's rename
    name: "sibling synthetic tokens",
    tokens: [
      { id: "g1", actorId: "base", name: "Goblin" },
      { id: "g2", actorId: "base", name: "Goblin" },
    ],
    opts: { actorId: "base", oldName: "Goblin", newName: "Goblin Boss" },
  },
  {
    name: "full, short, nickname and already-renamed labels",
    tokens: [
      { id: "f", actorId: "a", name: "Glubbek, Net-Mender" },
      { id: "s", actorId: "a", name: "Glubbek" },
      { id: "n", actorId: "a", name: "Fishface" },
      { id: "r", actorId: "a", name: "Brakka" },
    ],
    opts: { actorId: "a", oldName: "Glubbek, Net-Mender", newName: "Brakka, Elder" },
  },
  {
    name: "short form unchanged by the rename is skipped",
    tokens: [
      { id: "s", actorId: "a", name: "Bob" },
      { id: "f", actorId: "a", name: "Bob, Old" },
    ],
    opts: { actorId: "a", oldName: "Bob, Old", newName: "Bob, New" },
  },
  {
    name: "no tokens",
    tokens: [],
    opts: { actorId: "a", oldName: "Bob", newName: "Rob" },
  },
  {
    name: "every token locked",
    tokens: [
      { id: "l1", actorId: "a", name: "Bob", locked: true },
      { id: "l2", actorId: "a", name: "Bob", locked: true },
    ],
    opts: { actorId: "a", oldName: "Bob", newName: "Rob" },
  },
  {
    name: "a token with no actorId never matches",
    tokens: [
      { id: "x", actorId: null, name: "Bob" },
      { id: "y", name: "Bob" },
    ],
    opts: { actorId: "a", oldName: "Bob", newName: "Rob" },
  },
  {
    name: "order is token order",
    tokens: [
      { id: "z", actorId: "a", name: "Bob" },
      { id: "a", actorId: "a", name: "Bob, X" },
      { id: "m", actorId: "a", name: "Bob" },
    ],
    opts: { actorId: "a", oldName: "Bob, X", newName: "Rob, Y" },
  },
];

export const canEdit = t => !t.locked;
