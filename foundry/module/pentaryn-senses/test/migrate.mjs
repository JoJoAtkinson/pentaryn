#!/usr/bin/env node
/**
 * Fixtures for migrate.mjs's pure half (the one-shot sight reset) — run by test/run.mjs.
 * The import itself is a check: migrate.mjs must load with `game` and `foundry` undefined.
 */

const { MODULE, SIGHT_RESET, SIGHT_RESET_DONE, RESET_SIGHT, needsSightReset, systemReady, planSightReset } =
  await import("../migrate.mjs");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}

const DV = (range = 60, enabled = true) => ({ enabled, visionMode: "darkvision", range });
const BASIC = (range = 0, enabled = true) => ({ enabled, visionMode: "basic", range });

/* ── needsSightReset ────────────────────────────────────────────────────── */
check("darkvision + enabled", needsSightReset(DV()), true);
check("darkvision but vision off", needsSightReset(DV(60, false)), false);
check("basic", needsSightReset(BASIC()), false);
check("tremorsense mode left alone", needsSightReset({ enabled: true, visionMode: "tremorsense", range: 30 }), false);
check("enabled must be true, not truthy", needsSightReset({ enabled: 1, visionMode: "darkvision" }), false);
check("null → false", needsSightReset(null), false);

/* ── systemReady ────────────────────────────────────────────────────────── */
check("dnd5e 6.0.6", systemReady("dnd5e", "6.0.6"), true);
check("dnd5e 6.2", systemReady("dnd5e", "6.2"), true);
check("dnd5e 7.0.0", systemReady("dnd5e", "7.0.0"), true);
check("dnd5e 5.3.3 never", systemReady("dnd5e", "5.3.3"), false);
check("another system", systemReady("pf2e", "7.0.0"), false);
check("junk version", systemReady("dnd5e", undefined), false);

/* ── planSightReset ─────────────────────────────────────────────────────── */
const actor = (id, sight, extra = {}) => ({ id, _source: { prototypeToken: { sight } }, ...extra });
// Placed tokens: _source is the stored sight; `sight` is the prepared one, which native sync fills.
const token = (id, stored, prepared = stored) => ({ id, _source: { sight: stored }, sight: prepared });

const actors = [
  actor("caven", DV(60)),                     // PC our old sync wrote → reset
  actor("drow", DV(120)),                     // NPC with stored darkvision → reset
  actor("human", BASIC()),                    // untouched
  actor("marker", DV(60, false)),             // vision off → untouched
  actor("packed", DV(60), { pack: "world.x" }), // compendium actor → never
  null
];
const scenes = [
  { id: "drowPrison", tokens: [
    token("t1", DV(60)),                       // stored darkvision → reset
    token("t2", BASIC(), DV(120)),             // prepared darkvision from native sync, stored basic → untouched
    token("t3", DV(120, false)),               // vision off → untouched
    token("t4", { enabled: true, visionMode: "tremorsense", range: 30 }) // another mode → untouched
  ] },
  { id: "empty", tokens: [token("t5", BASIC())] },
  { id: "legacy", tokens: [{ id: "t6", sight: DV(30) }] } // no _source: read sight as stored
];
const plan = planSightReset(actors, scenes);
check("prototypes: only enabled darkvision, never packs", plan.actors.map(a => a._id), ["caven", "drow"]);
check("prototype update shape", plan.actors[0],
  { _id: "caven", "prototypeToken.sight.visionMode": "basic", "prototypeToken.sight.range": 0 });
check("only scenes with work", plan.scenes.map(s => s.sceneId), ["drowPrison", "legacy"]);
check("tokens: stored darkvision only, prepared ignored", plan.scenes[0].updates.map(u => u._id), ["t1"]);
check("token update shape", plan.scenes[0].updates[0], { _id: "t1", "sight.visionMode": "basic", "sight.range": 0 });
check("no _source → sight read", plan.scenes[1].updates.map(u => u._id), ["t6"]);
check("nothing to do → empty plan", planSightReset([actor("a", BASIC())], [{ id: "s", tokens: [] }]), { actors: [], scenes: [] });
check("junk input → empty plan", planSightReset(undefined, null), { actors: [], scenes: [] });
check("iterables (Collections) accepted", planSightReset(new Set(actors), new Set(scenes)).actors.length, 2);
const throwing = { id: "x", get _source() { throw new Error("boom"); }, sight: DV() };
check("throwing _source → falls back, still reset", planSightReset([], [{ id: "s", tokens: [throwing] }]).scenes.length, 1);

/* ── constants ──────────────────────────────────────────────────────────── */
check("setting key", `${MODULE}.${SIGHT_RESET}`, "pentaryn-senses.sightReset");
check("done value", SIGHT_RESET_DONE, 1);
check("reset sight frozen basic/0", [Object.isFrozen(RESET_SIGHT), RESET_SIGHT.visionMode, RESET_SIGHT.range], [true, "basic", 0]);

console.log(`pentaryn-senses migrate: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exitCode = 1;
}
