// Unit N — public and hidden token markers, the pure half (creatures-core.mjs). concealFor's
// answers over a matrix of statuses × viewers × tokens × tables are pinned in golden/conceal.json;
// the table, the overrides, the menu rows and the form parsing are checked case by case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import {
  MARKER_DEFAULTS, MARKER_PUBLIC_DEFAULTS, MODULE, concealFor, finalConceal, markerMenuRows, markerOverrides,
  markerTable, markerTableFromForm, markersMayChange, statusIdsOf,
} from "../creatures-core.mjs";

/** dnd5e 6.1.1's CONFIG.statusEffects ids (conditionTypes + statusEffects + encumbrance), in its order. */
const DND5E_IDS = [
  "antimagic", "burrowing", "concentrating", "dead", "dodging", "ethereal", "flying", "hiding", "hovering", "marked",
  "sleeping", "stable", "bleeding", "blinded", "burning", "charmed", "cursed", "dehydration", "deafened", "diseased",
  "exhaustion", "falling", "frightened", "grappled", "incapacitated", "invisible", "malnutrition", "paralyzed",
  "petrified", "poisoned", "prone", "restrained", "silenced", "stunned", "suffocation", "surprised", "transformed",
  "unconscious", "encumbered", "heavilyEncumbered", "exceedingCarryingCapacity", "bloodied",
];

const DEFAULT_TABLE = markerTable(DND5E_IDS);

test("defaults (Joe, 2026-11-21): the public list is Public, every other status GM only, other GM only, friendly shows all", () => {
  const pub = Object.entries(DEFAULT_TABLE.statuses).filter(([, v]) => v === "public").map(([k]) => k).sort();
  assert.deepEqual(pub, [...MARKER_PUBLIC_DEFAULTS].sort());
  for (const id of ["charmed", "frightened", "poisoned", "exhaustion", "cursed", "surprised", "stable", "deafened",
    "blinded", "silenced", "suffocation", "hiding", "ethereal", "marked", "concentrating"]) {
    assert.equal(DEFAULT_TABLE.statuses[id], "gm", id);
  }
  assert.equal(DEFAULT_TABLE.other, "gm", "spell and item icons on enemies: GM only");
  assert.equal(DEFAULT_TABLE.friendlyAll, true);
  assert.deepEqual(MARKER_DEFAULTS, { other: "gm", friendlyAll: true });
  for (const id of MARKER_PUBLIC_DEFAULTS) assert.ok(DND5E_IDS.includes(id), `${id} is a dnd5e status`);
});

test("concealFor over the matrix equals golden/conceal.json", () => {
  const statuses = [
    ["bloodied"], ["prone"], ["charmed"], ["concentrating"], ["invisible"], [], ["paralyzed", "incapacitated"],
    ["poisoned", "prone"], ["someModuleStatus"],
  ];
  const viewers = { player: {}, gm: { isGM: true }, observer: { isObserver: true } };
  const tokens = { hostile: {}, friendly: { friendly: true }, dormant: { dormant: true }, friendlyDormant: { friendly: true, dormant: true } };
  const tables = {
    defaults: DEFAULT_TABLE,
    friendlyOff: markerTable(DND5E_IDS, { friendlyAll: false }),
    otherPublic: markerTable(DND5E_IDS, { other: "public" }),
    bloodiedGm: markerTable(DND5E_IDS, { statuses: { bloodied: "gm", concentrating: "public" } }),
  };
  const out = {};
  for (const [tn, table] of Object.entries(tables)) {
    for (const [vn, viewer] of Object.entries(viewers)) {
      for (const [kn, token] of Object.entries(tokens)) {
        out[`${tn} · ${vn} · ${kn}`] = Object.fromEntries(statuses.map(s => [s.join("+") || "(other)", concealFor(s, viewer, token, table)]));
      }
    }
  }
  pinJSON("conceal", out, import.meta.url);
});

test("concealFor rules, spelled out", () => {
  const T = DEFAULT_TABLE;
  assert.equal(concealFor(["bloodied"], {}, {}, T), false, "Bloodied is public on an enemy");
  assert.equal(concealFor(["charmed"], {}, {}, T), true, "Charmed is the GM's");
  assert.equal(concealFor(["concentrating"], {}, {}, T), true, "Concentrating on an enemy: GM only");
  assert.equal(concealFor([], {}, {}, T), true, "an enemy's Mage Armor: GM only");
  assert.equal(concealFor(new Set(["paralyzed"]), {}, {}, T), false, "a Set works; Hold Person's paralysis shows");
  assert.equal(concealFor(["poisoned", "prone"], {}, {}, T), false, "any public status shows the effect");
  assert.equal(concealFor(["someModuleStatus"], {}, {}, T), true, "an unknown status is an 'other' effect");
  assert.equal(concealFor(["charmed"], {}, { friendly: true }, T), false, "friendly shows everything");
  assert.equal(concealFor([], {}, { friendly: true }, T), false);
  assert.equal(concealFor(["charmed"], {}, { friendly: true }, { ...T, friendlyAll: false }), true, "toggle off: the table");
  assert.equal(concealFor(["bloodied"], {}, { dormant: true }, T), true, "dormant: nothing at all");
  assert.equal(concealFor(["bloodied"], {}, { dormant: true, friendly: true }, T), true, "dormant beats friendly");
  assert.equal(concealFor(["charmed"], { isGM: true }, { dormant: true }, T), false, "the GM sees everything");
  assert.equal(concealFor(["charmed"], { isObserver: true }, { dormant: true }, T), false, "an observer sees everything");
  assert.equal(concealFor(["bloodied"], {}, {}, {}), true, "no table: every effect is 'other' (GM only)");
  assert.equal(concealFor(undefined, undefined, undefined, undefined), true, "never throws");
});

test("finalConceal: dnd5e's own reasons stand; its Bloodied rule is replaced by the table", () => {
  assert.equal(finalConceal({ base: true, ours: false }), true, "an unidentified item stays hidden");
  assert.equal(finalConceal({ base: true, bloodiedRuleOnly: true, ours: false }), false, "bloodied=player, row Public: shown");
  assert.equal(finalConceal({ base: true, bloodiedRuleOnly: true, ours: true }), true, "row GM only: hidden");
  assert.equal(finalConceal({ base: false, ours: true }), true);
  assert.equal(finalConceal({ base: false, ours: false }), false);
  assert.equal(finalConceal(), false);
});

test("markerTable ignores junk; markerOverrides stores only the differences; they round-trip", () => {
  const t = markerTable(["prone", "charmed", "", 7, "newThing"], { statuses: { prone: "gm", charmed: "loud", x: "public" }, other: "nope", friendlyAll: "yes" });
  assert.deepEqual(t, { statuses: { prone: "gm", charmed: "gm", newThing: "gm" }, other: "gm", friendlyAll: true });
  assert.deepEqual(markerTable(["prone"], null), { statuses: { prone: "public" }, other: "gm", friendlyAll: true });
  assert.deepEqual(markerOverrides(DEFAULT_TABLE), { statuses: {} }, "the defaults store nothing");
  const edited = { ...DEFAULT_TABLE, statuses: { ...DEFAULT_TABLE.statuses, prone: "gm", charmed: "public" }, other: "public", friendlyAll: false };
  const stored = markerOverrides(edited);
  assert.deepEqual(stored, { statuses: { prone: "gm", charmed: "public" }, other: "public", friendlyAll: false });
  assert.deepEqual(markerTable(DND5E_IDS, stored), edited);
});

test("statusIdsOf and markerMenuRows read dnd5e's object and core's array", () => {
  const obj = { prone: { id: "prone", name: "EFFECT.DND5E.StatusProne", img: "prone.svg" }, odd: { name: "Odd" }, bad: null };
  assert.deepEqual(statusIdsOf(obj), ["prone", "odd", "bad"]);
  assert.deepEqual(statusIdsOf([{ id: "dead", name: "Dead" }, {}, null]), ["dead"]);
  assert.deepEqual(statusIdsOf(undefined), []);
  const table = markerTable(["prone", "odd"], { statuses: { prone: "gm" } });
  assert.deepEqual(markerMenuRows(obj, table), [
    { id: "prone", name: "EFFECT.DND5E.StatusProne", img: "prone.svg", value: "gm" },
    { id: "odd", name: "Odd", img: null, value: "gm" },
    { id: "bad", name: "bad", img: null, value: "gm" },
  ]);
  assert.deepEqual(markerMenuRows([{ id: "dead", label: "Dead", icon: "d.svg" }], null), [{ id: "dead", name: "Dead", img: "d.svg", value: "public" }]);
});

test("markerTableFromForm: flat form keys → the table; missing rows keep their default, an absent box is off", () => {
  const ids = ["prone", "charmed", "dead"];
  assert.deepEqual(markerTableFromForm({ "status.prone": "gm", "status.charmed": "public", other: "public", friendlyAll: true }, ids), {
    statuses: { prone: "gm", charmed: "public", dead: "public" }, other: "public", friendlyAll: true,
  });
  assert.deepEqual(markerTableFromForm({ "status.prone": "junk" }, ids), {
    statuses: { prone: "public", charmed: "gm", dead: "public" }, other: "gm", friendlyAll: false,
  });
  assert.equal(markerTableFromForm({ friendlyAll: "on" }, ids).friendlyAll, true);
  assert.deepEqual(markerTableFromForm(null, []), { statuses: {}, other: "gm", friendlyAll: false });
});

test("markersMayChange: the dormant flag (set or removed) and the disposition, nothing else", () => {
  assert.equal(markersMayChange({ disposition: 1 }), true);
  assert.equal(markersMayChange({ flags: { [MODULE]: { dormant: null } } }), true);
  assert.equal(markersMayChange({ flags: { [MODULE]: { "-=dormant": null } } }), true);
  assert.equal(markersMayChange({ flags: { [MODULE]: { light: { bright: 5 } } } }), false);
  assert.equal(markersMayChange({ x: 1, y: 2 }), false);
  assert.equal(markersMayChange(null), false);
});
