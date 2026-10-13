/**
 * Characterisation (ties checkpoint, wave 3): phase 8 — the inspection cascade and the GM's Share.
 * A kin-sense bypass, a backfilled root roll, a held child rung and its release, an empty-reveal pass,
 * a failure that hands over its miss line; heldCarriersFor / releaseHeld / deliverHeld; factStatus,
 * shareFact and forgetFact on all four namespaces; resetIdentification / resetInspection; grantKind;
 * legacyMissCards; the per-round combat rule; and the tempo counter (thresholds and the movement
 * reset). Scripted d20s, mocked timers, synthetic world. Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle, stableDates } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const PC3 = "zzPc000000000003";
const NPC = "zzNpc00000000001";
const NPC2 = "zzNpc00000000002";
const KIND = "zzKind0000000001";
const LONE = "zzLone0000000001";
const PLAYER = "zzPlayerUser0001";

const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: true, dc: 12, skill: "his", reveal: "<p>From Vel.</p>", miss: "<p>A Vel accent?</p>", whenKnown: "advantage", whenCarried: "inherit", lore: [{ id: "c1", label: "Vel's walls", dc: 11, skill: "his", text: "<p>Three rings.</p>", miss: "" }] },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city", secret: true, dc: 15, skill: "inv", reveal: "<p>Guild hands.</p>", hold: true, whenKnown: "enables" },
  { id: "cult", title: "Quiet Cult", category: "Cult", secret: true, dc: 18, skill: "rel", reveal: "", miss: "" },
  { id: "kin", title: "Kin", category: "People", secret: true, dc: 30, skill: "ins", reveal: "<p>One of us.</p>", whenKnown: "enables", whenCarried: "auto" },
  { id: "public", title: "Dockhands", category: "Trade" }, // authored: secret by default, DC 15 History
];

const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", flags: { "pentaryn-ties": { attributes: ["kin"] } } },
    { id: PC2, name: "ZZ Wren", type: "character", ownership: { default: 0, [PLAYER]: 3 } },
    {
      id: PC3,
      name: "ZZ Legacy Reader",
      type: "character",
      flags: {
        "pentaryn-ties": {
          granted: {
            [`lore:${NPC}:l1`]: { text: "Shifty eyes.", when: 1, icon: null, source: "Debts" },
            [`kind:${KIND}`]: { text: "Nothing about it means anything to you.", when: 1, icon: null, source: "ZZ Ghoul" },
          },
        },
      },
    },
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" }, biography: { value: "<p>Grey hunters.</p>" } } }, flags: { "pentaryn-ties": { beliefs: { [PC3]: { kind: { text: "x", tier: 0, total: 4, when: 1, delivered: 2 } } } } } },
    {
      id: NPC,
      name: "ZZ Brakka",
      flags: {
        "pentaryn-ties": {
          kindOf: KIND,
          attributes: ["city", "guild", "cult", "kin", "public"],
          lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>He owes the guild.</p>", miss: "<p>Shifty eyes.</p>" }],
          beliefs: { [PC3]: { [`lore:${NPC}:l1`]: { text: "Shifty eyes.", total: 9, when: 1, delivered: 2 } } },
        },
      },
    },
    { id: NPC2, name: "ZZ Second Carrier", flags: { "pentaryn-ties": { attributes: ["city"] } } },
    { id: LONE, name: "ZZ Nobody" },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, x: 0, y: 0 },
    { id: "zzTokPc000000002", actorId: PC2, x: 500, y: 0 },
    { id: "zzTokNpc00000001", actorId: NPC },
    { id: "zzTokNpc00000002", actorId: NPC2 },
    { id: "zzTokLone0000001", actorId: LONE },
  ],
});
const T = () => game.pentaryn.ties;
const Study = await import("../study.mjs");
const Attributes = await import("../attributes.mjs");
const get = id => game.actors.get(id);
const run = async (label, fn) => {
  const mark = F.calls.length;
  const c0 = F.console.length;
  const out = await settle(Promise.resolve().then(fn));
  return stableDates({ label, out: out ?? null, calls: F.calls.slice(mark), console: F.console.slice(c0) });
};
const asPlayer = async fn => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  try {
    return await fn();
  } finally {
    game.user = gm;
  }
};
const ledgers = () =>
  stableDates({
    knowledge: Attributes.knowledge(),
    npcBeliefs: get(NPC).flags["pentaryn-ties"].beliefs ?? null,
    granted: Object.fromEntries([PC, PC2].map(id => [id, get(id).flags["pentaryn-ties"]?.granted ?? null])),
  });

test("inspectAs: bypass, backfilled root roll, held child; PC2 fails the root and gets the miss line", async () => {
  const rows = [];
  F.rolls.push(16);
  F.dialogs.push(false); // the held-rung prompt: Later
  rows.push(await run("inspectAs PC → NPC (rolls 16 on Vel, 17 on the guild)", () => {
    F.rolls.push(17);
    return Study.inspectAs(get(PC), get(NPC));
  }));
  F.rolls.push(5);
  rows.push(await run("inspectAs PC2 → NPC (rolls 5 on Vel)", () => Study.inspectAs(get(PC2), get(NPC))));
  rows.push(await run("inspectAs PC2 → NPC again (Vel and the guild blocked; the cult ladder rolls 10 vs 18, no miss line)", () => Study.inspectAs(get(PC2), get(NPC))));
  rows.push(await run("inspectAs with no character", () => Study.inspectAs(null, get(NPC))));
  rows.push(await run("player: inspectAs", () => asPlayer(() => Study.inspectAs(get(PC2), get(NPC)))));
  pinJSON("cascade-inspect", { rows, ledgers: ledgers() }, import.meta.url);
});

test("the held rung: pending(), heldCarriersFor, releaseHeldAttribute (delivers, resumes, rolls the cult: 19, empty reveal)", async () => {
  const rows = [];
  rows.push(await run("pending()", () => Study.pending()));
  rows.push(await run("heldCarriersFor(PC, guild)", () => Study.heldCarriersFor(get(PC), "guild").map(a => a.id)));
  rows.push(await run("heldCarriersFor(PC, city)", () => Study.heldCarriersFor(get(PC), "city").map(a => a.id)));
  F.rolls.push(19);
  rows.push(await run("releaseHeldAttribute(PC, guild): delivers, resumes — cult 19 (empty reveal), Dockhands 10 (fails)", () => Study.releaseHeldAttribute(get(PC), "guild")));
  rows.push(await run("deliverHeldIdentifications again (nothing held)", () => Study.deliverHeldIdentifications(get(PC), get(NPC))));
  rows.push(await run("player: deliverHeldIdentifications", () => asPlayer(() => Study.deliverHeldIdentifications(get(PC), get(NPC)))));
  rows.push(await run("beliefs(NPC)", () => Study.beliefs(get(NPC))));
  pinJSON("cascade-release", { rows, ledgers: ledgers() }, import.meta.url);
});

test("factStatus over the four namespaces, for PC, PC2 and PC3", () => {
  const specs = {
    identCity: { ns: "ident", subjectId: NPC, attrId: "city" },
    identGuild: { ns: "ident", subjectId: NPC, attrId: "guild" },
    identCult: { ns: "ident", subjectId: NPC, attrId: "cult" },
    attrC1: { ns: "attr", subjectId: NPC, attrId: "city", factId: "c1" },
    loreL1: { ns: "lore", subjectId: NPC, factId: "l1" },
    kind: { ns: "kind", subjectId: NPC },
    bad: { ns: "ident", subjectId: "nope", attrId: "city" },
  };
  const out = {};
  for (const pc of [PC, PC2, PC3]) out[pc] = Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, Study.factStatus(s, get(pc))]));
  pinJSON("cascade-fact-status", out, import.meta.url);
});

test("shareFact: ident over a failure, attr lore (secret, unseen), lore, kind; skips; refusals; the whisper", async () => {
  const rows = [];
  rows.push(await run("player: share", () => asPlayer(() => Study.shareFact({ ns: "lore", subjectId: NPC, factId: "l1" }, [get(PC2)]))));
  rows.push(await run("invalid ns", () => Study.shareFact({ ns: "mask", subjectId: NPC }, [get(PC2)])));
  rows.push(await run("ident not carried", () => Study.shareFact({ ns: "ident", subjectId: NPC2, attrId: "guild" }, [get(PC2)])));
  rows.push(await run("ident with no reveal text", () => Study.shareFact({ ns: "ident", subjectId: NPC, attrId: "cult" }, [get(PC2)])));
  rows.push(await run("ident Vel to PC2 (over a failed roll) and PC (already knows), from PC", () => Study.shareFact({ ns: "ident", subjectId: NPC, attrId: "city" }, [get(PC2), get(PC), get(NPC), null], { from: get(PC) })));
  rows.push(await run("attr lore c1 to PC2 and PC3 (PC3 has not placed Vel: unseen)", () => Study.shareFact({ ns: "attr", subjectId: NPC, attrId: "city", factId: "c1" }, [get(PC2), get(PC3)])));
  rows.push(await run("lore l1 to PC2 and PC3 (PC3 failed it legacy-style)", () => Study.shareFact({ ns: "lore", subjectId: NPC, factId: "l1" }, [get(PC2), get(PC3)], { notify: false })));
  rows.push(await run("kind to PC2 (from gm)", () => Study.shareFact({ ns: "kind", subjectId: NPC }, [get(PC2)])));
  rows.push(await run("kind again to PC2 (knows at 25)", () => Study.shareFact({ ns: "kind", subjectId: NPC }, [get(PC2)])));
  pinJSON("cascade-share", { rows, ledgers: ledgers() }, import.meta.url);
});

test("forgetFact: only a share; what it replaced comes back", async () => {
  const rows = [];
  rows.push(await run("player: forget", () => asPlayer(() => Study.forgetFact({ ns: "lore", subjectId: NPC, factId: "l1" }, get(PC2)))));
  rows.push(await run("not told (PC rolled Vel)", () => Study.forgetFact({ ns: "ident", subjectId: NPC, attrId: "city" }, get(PC))));
  rows.push(await run("ident Vel from PC2 (prior failure restored)", () => Study.forgetFact({ ns: "ident", subjectId: NPC, attrId: "city" }, get(PC2))));
  rows.push(await run("lore l1 from PC2 (no prior: reset)", () => Study.forgetFact({ ns: "lore", subjectId: NPC, factId: "l1" }, get(PC2))));
  rows.push(await run("lore l1 from PC3 (prior legacy failure restored)", () => Study.forgetFact({ ns: "lore", subjectId: NPC, factId: "l1" }, get(PC3))));
  rows.push(await run("attr c1 from PC2", () => Study.forgetFact({ ns: "attr", subjectId: NPC, attrId: "city", factId: "c1" }, get(PC2))));
  rows.push(await run("kind from PC2", () => Study.forgetFact({ ns: "kind", subjectId: NPC }, get(PC2))));
  rows.push(await run("invalid subject", () => Study.forgetFact({ ns: "kind", subjectId: "nope" }, get(PC2))));
  pinJSON("cascade-forget", { rows, ledgers: ledgers() }, import.meta.url);
});

test("grantKind: raise only, never demote; rung and GM checks", async () => {
  const rows = [];
  rows.push(await run("grantKind PC 20", () => Study.grantKind(get(PC), get(NPC), 20)));
  rows.push(await run("grantKind PC 15 (already knows more)", () => Study.grantKind(get(PC), get(NPC), 15)));
  rows.push(await run("grantKind PC 15 quiet", () => Study.grantKind(get(PC), get(NPC), 15, { quiet: true })));
  rows.push(await run("grantKind PC 7 (not a rung)", () => Study.grantKind(get(PC), get(NPC), 7)));
  rows.push(await run("grantKind PC 0 (mark as failed) on a fresh PC2", () => Study.grantKind(get(PC2), get(NPC), 0)));
  rows.push(await run("player: grantKind", () => asPlayer(() => Study.grantKind(get(PC2), get(NPC), 25))));
  pinJSON("cascade-grant-kind", rows, import.meta.url);
});

test("legacyMissCards: the cards a failure granted before 2026-10", () => {
  pinJSON("cascade-legacy-miss", Study.legacyMissCards(), import.meta.url);
});

test("resetIdentification / resetInspection", async () => {
  const rows = [];
  rows.push(await run("resetIdentification PC2 Vel (miss card taken back)", () => Study.resetIdentification(get(PC2), get(NPC), "city")));
  rows.push(await run("resetIdentification PC2 Vel again (nothing there)", () => Study.resetIdentification(get(PC2), get(NPC), "city")));
  rows.push(await run("resetInspection PC on NPC (every rung)", () => Study.resetInspection(get(PC), get(NPC))));
  rows.push(await run("player: resetInspection", () => asPlayer(() => Study.resetInspection(get(PC), get(NPC)))));
  pinJSON("cascade-reset", { rows, ledgers: ledgers() }, import.meta.url);
});

test("combat: one inspection per combatant per round, marked not refused (ES-5)", async () => {
  game.combat = { id: "zzCombat00000001", started: true, round: 1, combatants: [{ id: "zzCombatant00001", actorId: PC }] };
  game.combats = [game.combat];
  Object.defineProperty(get(PC), "inCombat", { value: true, configurable: true, writable: true });
  const rows = [];
  rows.push(await run("first look this round", () => Study.inspect(get(PC), get(LONE))));
  rows.push(await run("second look, same round", () => Study.inspect(get(PC), get(NPC2))));
  game.combat.round = 2;
  rows.push(await run("next round", () => Study.inspect(get(PC), get(LONE))));
  game.combat = null;
  game.combats = undefined;
  get(PC).inCombat = false;
  pinJSON("cascade-combat", rows, import.meta.url);
});

/*
 * M5 (final review 2026-10-12, ties-study; repaired 2026-10-13): the last rung is the SIXTH look.
 * Joe's retune of 2026-08-23 ("at 2 … at 3 you are looking people up and down, at 5 careful now,
 * at 6 you are looking paranoid", context/plans/foundry-encounter-log.md) replaced his earlier
 * "by the tenth". The code was right; the doc comment in tempo.mjs was the stale half. Looks 7–11
 * say nothing — each line lands once, on its exact count.
 */
test("tempo: lines at the 2nd, 3rd, 5th and 6th look; a 20 ft move starts the count again", async () => {
  T().study.clearScoping();
  const said = [];
  for (let i = 1; i <= 11; i++) {
    const mark = F.calls.length;
    await settle(Study.inspect(get(PC), get(LONE)));
    said.push({ look: i, emitted: F.calls.slice(mark).filter(c => c.op === "socket.emit").map(c => c.args[1].text), state: T().study.scoping(PC).count });
  }
  canvas.tokens.get("zzTokPc000000001").document.x = 400; // four squares, 20 ft
  await settle(Study.inspect(get(PC), get(LONE)));
  said.push({ look: "after moving 20 ft", state: T().study.scoping(PC) });
  canvas.tokens.get("zzTokPc000000001").document.x = 600; // two more squares from the new anchor: 10 ft
  await settle(Study.inspect(get(PC), get(LONE)));
  said.push({ look: "drifted 10 ft", state: T().study.scoping(PC) });
  pinJSON("cascade-tempo", { said, all: T().study.scoping(), cleared: (T().study.clearScoping(PC), T().study.scoping(PC)) }, import.meta.url);
  assert.equal(said[1].emitted.length, 1);
  const spoke = said.filter(r => r.emitted?.length).map(r => r.look);
  assert.deepEqual(spoke, [2, 3, 5, 6], "M5: the rungs land on the 2nd, 3rd, 5th and 6th look (Joe, 2026-08-23)");
  assert.match(said[5].emitted[0], /looks openly paranoid/, "M5: the paranoid line is the sixth look's");
});
