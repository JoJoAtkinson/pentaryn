/**
 * The perf findings whose saving is "read it once" (ties-21, -23, -27, -28). Their output is pinned
 * byte-for-byte by the frozen goldens (cascade-*, ui-sheet, app-review-open-*); these pin the saving
 * itself: each counts the reads made from the one call site the finding moved, found by the caller
 * frame on the stack, so a revert of the hoist turns the count back up and the test red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const NPC2 = "zzNpc00000000002";
const NPC3 = "zzNpc00000000003";
const KIND = "zzKind0000000001";
const W = 1_700_000_000_000;

const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: true, dc: 12, skill: "his", reveal: "<p>From Vel.</p>", whenKnown: "advantage", whenCarried: "inherit" },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city", secret: true, dc: 15, skill: "inv", reveal: "<p>Guild hands.</p>", hold: true, whenKnown: "enables" },
  { id: "kin", title: "Kin", category: "People", secret: true, dc: 30, skill: "ins", reveal: "<p>One of us.</p>", whenKnown: "enables", whenCarried: "auto" },
  { id: "diary", title: "Caven's diary", category: "personal", secret: true, reveal: "<p>Kept a diary.</p>", lore: [{ id: "d1", label: "Pages", dc: 12, skill: "inv", text: "<p>Torn out.</p>", miss: "" }] },
];

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      flags: {
        "pentaryn-ties": {
          attributes: ["kin", "diary"],
          known: [
            { id: NPC, name: "ZZ Brakka", category: "sentient", notes: "", when: W },
            { id: NPC2, name: "ZZ Second", category: "sentient", notes: "", when: W + 1 },
            { id: NPC3, name: "ZZ Third", category: "sentient", notes: "", when: W + 2 },
          ],
        },
      },
    },
    { id: KIND, name: "ZZ Ghoul" },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { attributes: ["city", "guild", "kin"] } } },
    { id: NPC2, name: "ZZ Second", flags: { "pentaryn-ties": { attributes: ["city", "diary"], kindOf: KIND } } },
    { id: NPC3, name: "ZZ Third", flags: { "pentaryn-ties": { attributes: ["city"], kindOf: KIND } } },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, x: 0, y: 0 },
    { id: "zzTokNpc00000001", actorId: NPC },
  ],
});
const get = id => game.actors.get(id);

Error.stackTraceLimit = 50;
/** The function names on the stack, innermost first (V8 frames: `at [async ]name (file…)`). */
const frames = () =>
  new Error().stack
    .split("\n")
    .slice(1)
    .map(l => l.trim().match(/^at (?:async )?(?:new )?([\w$.<>]+) \(/)?.[1] ?? "");
/** Was the innermost `via` frame called directly from `caller`? */
const calledFrom = (via, caller) => {
  const f = frames();
  const i = f.findIndex(n => n === via || n.endsWith(`.${via}`));
  return i >= 0 && (f[i + 1] === caller || f[i + 1]?.endsWith(`.${caller}`));
};

/** Count `game.settings.get(…, key)` reads reached from `via` called by `caller`, while `fn` runs. */
async function settingReads(key, via, caller, fn) {
  const real = game.settings.get;
  let n = 0;
  game.settings.get = function (ns, k, ...rest) {
    if (k === key && calledFrom(via, caller)) n++;
    return real.call(this, ns, k, ...rest);
  };
  try {
    await fn();
  } finally {
    game.settings.get = real;
  }
  return n;
}

/** Count reads of `game.actors.contents` made directly by `caller`, while `fn` runs. */
async function actorScans(caller, fn) {
  const coll = game.actors;
  const desc = Object.getOwnPropertyDescriptor(coll, "contents") ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(coll), "contents");
  const read = () => (desc.get ? desc.get.call(coll) : desc.value);
  let n = 0;
  Object.defineProperty(coll, "contents", {
    get() {
      const f = frames(); // [frames, this getter, the getter's caller, …]
      const by = f[f.indexOf("frames") + 2];
      if (by === caller || by?.endsWith(`.${caller}`)) n++;
      return read();
    },
    configurable: true,
  });
  try {
    await fn();
  } finally {
    Object.defineProperty(coll, "contents", desc);
  }
  return n;
}

test("ties-21: runCascade reads the registry once per run, not once per step", async () => {
  const Study = await import("../study.mjs");
  F.rolls.push(16, 17); // Vel 16, the guild 17 (held)
  F.dialogs.push(false); // the held-rung prompt: Later
  let steps = 0;
  // M12: the loop's invariants are read by `cascadePlanner`, once; each step is its `nextStep`
  const reads = await settingReads("attributes", "reg", "cascadePlanner", async () => {
    steps = await settingReads("attributeKnowledge", "knowledge", "nextStep", () => settle(Study.inspectAs(get(PC), get(NPC))));
  });
  assert.ok(steps >= 3, `the cascade took several steps (kin bypass, Vel, the guild): ${steps}`);
  assert.equal(reads, 1, "the registry is a loop invariant: read once, above the loop");
});

test("ties-23: one Known-tab paint reads the registry once, however many entries it lists", async () => {
  const { buildKnownHTML } = await import("../known-ui.mjs");
  const reads = await settingReads("attributes", "registry", "buildKnownHTML", () => buildKnownHTML(get(PC)));
  assert.equal(get(PC).flags["pentaryn-ties"].known.length, 3);
  assert.equal(reads, 1, "hoisted above the per-entry loop");
});

test("ties-27: the review panel's personal-clue rows use its carrier map — same markup, no world walk", async () => {
  const { personalCluesHTML } = await import("../attributes-ui.mjs");
  const { AttributeReview } = await import("../review-ui.mjs");
  const entry = { id: "diary", title: "Caven's diary", category: "personal", lore: REGISTRY[3].lore };
  const carriers = id => (id === "diary" ? [get(PC), get(NPC2)] : []);
  const walked = personalCluesHTML(entry);
  assert.ok(walked.length > 0, "the entry has carriers, so the clue rows draw");
  assert.equal(personalCluesHTML(entry, carriers), walked, "a passed map draws exactly what the walk draws");
  assert.equal(await actorScans("personalCluesHTML", () => personalCluesHTML(entry, carriers)), 0);

  const rv = Object.assign(new AttributeReview(), { expanded: new Set(["diary"]), tab: "world" });
  let html = "";
  const scans = await actorScans("personalCluesHTML", async () => (html = await rv._renderHTML()));
  assert.match(String(html), /Caven's diary|Caven&#x27;s diary|Caven&#39;s diary/);
  assert.equal(scans, 0, "the open personal row reads the carriers() map built for this render");
  await rv._onClose?.({});
});

test("ties-28: the GM's kind picker walks the world's actors once", async () => {
  const { authoringHTML } = await import("../authoring-ui.mjs");
  let html = "";
  const scans = await actorScans("kindPicker", () => (html = authoringHTML(get(NPC2))));
  assert.match(html, /ZZ Ghoul/, "the picker lists the kind the others point at");
  assert.equal(scans, 1);
});

test("perf-2: beliefs() resolves the kind pointer once, however many kind rows the ledger holds", async () => {
  const Study = await import("../study.mjs");
  const row = c => ({ text: "A ghoul.", tier: 15, total: 18, when: W + c, delivered: W + c + 1 });
  /** `game.actors.get` reads reached from `kindActorOf` called by `beliefs`, for a kind ledger of `n` characters' rows. */
  const kindReads = async n => {
    const ledger = Object.fromEntries([PC, NPC, NPC3].slice(0, n).map((c, i) => [c, { kind: row(i) }]));
    await get(KIND).setFlag("pentaryn-ties", "beliefs", ledger);
    const real = game.actors.get;
    let reads = 0;
    let rows = [];
    game.actors.get = function (...args) {
      if (calledFrom("kindActorOf", "beliefs")) reads++;
      return real.apply(this, args);
    };
    try {
      rows = Study.beliefs(get(NPC2));
    } finally {
      game.actors.get = real;
      await get(KIND).unsetFlag("pentaryn-ties", "beliefs");
    }
    assert.equal(rows.filter(r => r.ns === "kind").length, n, "every kind row is listed");
    return reads;
  };
  const one = await kindReads(1);
  assert.ok(one > 0, "the kind pointer is resolved from beliefs()");
  assert.equal(await kindReads(3), one, "a loop invariant: resolved once, above the ledger loop");
});

test("perf-1: studyStateFor skips the item walk when the biography decides", async () => {
  const Study = await import("../study.mjs");
  const attack = { system: { activities: new Set([{ type: "attack" }]) } };
  /** A kind actor nobody points at (so it resolves to itself), whose `items` reads are counted. */
  const kindWith = (id, biography, items) => {
    const k = { id, name: id, flags: {}, system: { details: { biography: { value: biography } } }, reads: 0 };
    Object.defineProperty(k, "items", { get: () => (k.reads++, items) });
    return k;
  };
  const told = kindWith("zzStubKind000001", "<p>Eats the dead.</p>", [attack]);
  assert.equal(Study.studyStateFor(get(PC), told).content, true);
  assert.equal(told.reads, 0, "a non-blank biography decides `content`: no item walk");
  const armed = kindWith("zzStubKind000002", "", [attack]);
  assert.equal(Study.studyStateFor(get(PC), armed).content, true, "an attack activity alone is content");
  assert.ok(armed.reads > 0);
  assert.equal(Study.studyStateFor(get(PC), kindWith("zzStubKind000003", "", [])).content, false, "no biography, tiers or attacks: no content");
});

test("ties-ui-perf-7: visibleAttributesFor takes an index — same answer as the list it was built from", async () => {
  const { visibleAttributesFor, indexRegistry } = await import("../known-core.mjs");
  const carried = ["city", "guild", "kin", "loose"];
  const beliefs = {};
  const viaList = visibleAttributesFor({ carried, registry: REGISTRY, beliefs, characterId: PC });
  assert.deepEqual(viaList, ["loose"], "the secret ones stay hidden until identified");
  const index = indexRegistry(REGISTRY);
  assert.deepEqual(visibleAttributesFor({ carried, index, beliefs, characterId: PC }), viaList, "an indexRegistry() result");
  assert.deepEqual(visibleAttributesFor({ carried, index: index.byId, beliefs, characterId: PC }), viaList, "its byId Map");
  assert.deepEqual(visibleAttributesFor({ carried, index, beliefs, characterId: PC, isGM: true }), carried);
});

test("ties-ui-perf-7: one Known-tab paint clamps the registry once, not once per Known entry", async () => {
  const { buildKnownHTML } = await import("../known-ui.mjs");
  const real = Array.isArray;
  let perEntry = 0;
  let html = "";
  Array.isArray = function (v) {
    if (calledFrom("readRegistry", "visibleAttributesFor")) perEntry++;
    return real(v);
  };
  try {
    html = buildKnownHTML(get(PC));
  } finally {
    Array.isArray = real;
  }
  assert.equal(get(PC).flags["pentaryn-ties"].known.length, 3);
  assert.match(String(html), /ZZ Brakka/);
  assert.equal(perEntry, 0, "the paint hands each row the one index it built, so no row re-clamps the registry");
});
