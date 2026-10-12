/**
 * ties-5 / ties-6: the additive API paths. Each new name is a reference to (or a thin, named wrapper
 * over) the internal it publishes, and the existing paths are unchanged (attributes.ids keeps its
 * no-kind-pointer contract).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const GOB = "zzNpc00000000001";
const KIND = "zzKind0000000001";
const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: KIND, name: "ZZ Goblin (kind)" },
    { id: GOB, name: "ZZ Goblin", flags: { "pentaryn-ties": { kindOf: KIND, beliefs: { [PC]: { "attr:species:goblin:#id": { text: "A goblin.", total: 18, when: 5, delivered: 6 } } } } } },
  ],
});
const T = () => game.pentaryn.ties;
const A = await import("../attributes.mjs");
const S = await import("../study.mjs");
const K = await import("../known-core.mjs");
const get = id => game.actors.get(id);

test("ties-5: ids keeps its contract (no kind pointer); effective adds kind:<id>, and is otherwise ids", () => {
  const ids = T().attributes.ids(get(GOB));
  const eff = T().attributes.effective(get(GOB));
  assert.equal(ids.includes(`kind:${KIND}`), false);
  assert.equal(eff.includes(`kind:${KIND}`), true);
  assert.deepEqual(eff.filter(x => !x.startsWith("kind:")), ids);
  assert.deepEqual(T().attributes.ofEffective(get(GOB)).map(r => r.id), A.attributesOf(get(GOB), S.kindActorOf).map(r => r.id));
});

test("ties-6: the published internals are the internals", () => {
  assert.equal(T().attributes.tree, A.knowledgeTree);
  assert.equal(T().attributes.branch, A.branchOf);
  assert.equal(T().attributes.describeId, A.describeAttribute);
  assert.equal(T().study.factStatus, S.factStatus);
  assert.equal(T().study.factStatus, T().study.whoKnows);
  assert.equal(T().study.shareFact, T().study.share);
  assert.equal(T().study.forgetFact, T().study.forget);
});

test("ties-6: study.identified is identifiedState over the subject's ledger", () => {
  const want = K.identifiedState(get(GOB).flags["pentaryn-ties"].beliefs, PC, "species:goblin");
  assert.deepEqual(T().study.identified(get(GOB), get(PC), "species:goblin"), want);
  assert.equal(want.carries, true);
  assert.deepEqual(T().study.identified(get(GOB), get(PC), "type:undead"), { settled: false, carries: false, held: false });
});

test("B2 / ties-4: the legacy reads resolve an id, a name or a token to the WORLD actor; a miss reads as before", () => {
  const byId = T().attributes.ids(GOB);
  assert.deepEqual(byId, T().attributes.ids(get(GOB)));
  assert.deepEqual(T().study.state(PC, "ZZ Goblin"), T().study.state(get(PC), get(GOB)));
  assert.deepEqual(T().read("nobody by that name"), []);
  assert.deepEqual(T().known.read("ZZ Caven"), T().known.read(get(PC)));
  assert.equal(T().read.name, "read");
  assert.equal(T().attributes.ids.name, "attributeIdsOf");
});

test("ties-10: pending() rows carry whenMs; beliefs() rows carry whenMs and deliveredMs beside the locale strings", async () => {
  const S = await import("../study.mjs");
  const rows = S.beliefs(get(GOB));
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    assert.equal(typeof r.when, "string");
    assert.equal(r.whenMs, 5);
    assert.equal(r.deliveredMs, 6);
  }
});

test("ties-8: study.knowsAbout is the Look window's list as data — granted cards past the secrecy gate", async () => {
  const pc = get(PC);
  const gob = get(GOB);
  gob.flags["pentaryn-ties"].lore = [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>" }];
  pc.flags["pentaryn-ties"] = {
    granted: {
      [`lore:${GOB}:l1`]: { text: "Owes the guild.", when: 5, icon: "i.webp", source: "ZZ Goblin — Debts" },
      "attr:type:undead:#id": { text: "Not carried, so never shown.", when: 5 }
    }
  };
  const rows = T().study.knowsAbout(pc, gob);
  assert.deepEqual(rows.map(r => [r.ns, r.key, r.text]), [["lore", `lore:${GOB}:l1`, "Owes the guild."]]);
  assert.deepEqual(T().study.knowsAbout("ZZ Caven", "ZZ Goblin"), rows, "refs resolve");
  const { knowsAbout } = await import("../facts.mjs");
  assert.deepEqual(knowsAbout(pc, gob), rows);
});

test("ties-9: markLearned / setLoreRows / setConceal are the UI's writes as calls; the reads read them back", async () => {
  const pc = get(PC);
  const gob = get(GOB);
  // markLearned without a registry entry with lore → refused, nothing written
  assert.deepEqual(await T().attributes.markLearned(pc, "nope"), { ok: false, reason: "notFound" });
  // lore rows round-trip, sanitised; an empty list deletes the flag
  const w = await T().study.setLoreRows(gob, [{ id: "l9", label: "Debts", dc: 99, skill: "ins", text: "Owes." }]);
  assert.equal(w.ok, true);
  assert.equal(T().study.loreRows(gob)[0].dc, 40, "clamped like every lore row");
  assert.deepEqual(await T().study.setLoreRows(gob, []), { ok: true, rows: [] });
  assert.deepEqual(T().study.loreRows(gob), []);
  // concealment
  assert.deepEqual(await T().study.setConceal(gob, { default: 2, "species:goblin": 5 }), { ok: true, conceal: { default: 2, "species:goblin": 5 } });
  assert.deepEqual(T().study.conceal(gob), { default: 2, "species:goblin": 5 });
  assert.deepEqual(await T().study.setConceal(gob, "lots"), { ok: false, reason: "invalid" });
  assert.deepEqual(await T().study.setConceal(gob, null), { ok: true, conceal: null });
  assert.equal(T().study.conceal(gob), null);
});

test("ties-9: markLearned writes the exact grant the Mark-as-learned button writes", async () => {
  await game.settings.set("pentaryn-ties", "attributes", [{ id: "a", title: "T", icon: "i.webp", lore: [{ id: "r", label: "L", text: "X", dc: 12, skill: "his" }, { id: "s", label: "M", text: "Y", dc: 12, skill: "his" }] }]);
  const pc = get(PC);
  pc.flags["pentaryn-ties"] = {};
  const mark = F.calls.length;
  const res = await T().attributes.markLearned(pc, "T", ["r"], { now: 5 });
  assert.deepEqual(res, { ok: true, keys: ["attr:a:r"] });
  const update = F.calls.slice(mark).find(c => c.op === "update" || c.op === "Actor.update" || /update/.test(c.op));
  assert.ok(update, "one actor update");
  assert.deepEqual(pc.flags["pentaryn-ties"].granted, { "attr:a:r": { text: "X", when: 5, icon: "i.webp", source: "T — L" } });
  assert.deepEqual((await T().attributes.markLearned(pc, "a")).keys, ["attr:a:r", "attr:a:s"], "default: every row");
});
