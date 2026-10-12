/**
 * ties-ui-perf-2: an Attributes-tab paint with PERSONAL attributes (category "personal") draws each
 * one's "Clues on <carrier>" rows. The markup is pinned first (`ui-attrs-personal-html`, against the
 * code before the fix); then the saving: the paint finds who carries what in one walk of the world's
 * actors, built lazily once per paint and handed to `personalCluesHTML` as `carriersOf`, instead of
 * one walk per personal row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const NPC2 = "zzNpc00000000002";

const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: true, reveal: "<p>From Vel.</p>" },
  { id: "diary", title: "Caven's diary", category: "personal", secret: true, reveal: "<p>Kept a diary.</p>", lore: [{ id: "d1", label: "Pages", dc: 12, skill: "inv", text: "<p>Torn out.</p>", miss: "" }] },
  { id: "oath", title: "The broken oath", category: "Personal", secret: false, reveal: "<p>Swore once.</p>" },
  { id: "scar", title: "The scar", category: "personal", secret: true, reveal: "<p>Burned.</p>" },
];

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      flags: { "pentaryn-ties": { attributes: ["city", "diary", "oath", "scar"], lore: [{ id: "p1", label: "Ink stains", dc: 10, skill: "prc", text: "<p>Blue.</p>", miss: "" }] } },
    },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { attributes: ["city", "oath"] } } },
    { id: NPC2, name: "ZZ Second", flags: { "pentaryn-ties": { attributes: ["diary"], lore: [{ id: "n1", label: "Torn page", dc: 14, skill: "inv", text: "<p>Kept.</p>", miss: "" }] } } },
  ],
});
void F;
const get = id => game.actors.get(id);
const AUI = await import("../attributes-ui.mjs");

/** The function names on the stack, innermost first (V8 frames: `at [async ]name (file…)`). */
Error.stackTraceLimit = 50;
const frames = () =>
  new Error().stack
    .split("\n")
    .slice(1)
    .map(l => l.trim().match(/^at (?:async )?(?:new )?([\w$.<>]+) \(/)?.[1] ?? "");

/** Count reads of `game.actors.contents` made directly by `caller`, while `fn` runs. */
function actorScans(caller, fn) {
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
    fn();
  } finally {
    Object.defineProperty(coll, "contents", desc);
  }
  return n;
}

const paint = () => ({ pc: AUI.buildAttributesHTML(get(PC)), npc: AUI.buildAttributesHTML(get(NPC)), npc2: AUI.buildAttributesHTML(get(NPC2)) });

test("ties-ui-perf-2: an Attributes tab with personal attributes — markup pinned", () => {
  const html = pinJSON("ui-attrs-personal-html", paint(), import.meta.url);
  assert.equal((html.pc.match(/pt-clues-box/g) ?? []).length, 3, "each personal row on the PC draws its clue rows");
});

test("ties-ui-perf-2: one Attributes-tab paint walks the world's actors once for every personal row", () => {
  let html = "";
  const perRow = actorScans("personalCluesHTML", () => (html = AUI.buildAttributesHTML(get(PC))));
  assert.equal((html.match(/pt-clues-box/g) ?? []).length, 3, "three personal rows drew");
  assert.equal(perRow, 0, "personalCluesHTML reads the paint's carriersOf map, not the world");
  assert.equal(actorScans("carrierMap", () => AUI.buildAttributesHTML(get(PC))), 1, "the id → carriers map is built once per paint");
  assert.equal(actorScans("carrierMap", () => AUI.buildAttributesHTML(get(NPC2))), 1);
});
