/**
 * AC-5 (final review 2026-10-12, ties-study; blueprint §5.9.4): shareFact's ident branch awaited one
 * `subject.update` and one `pc.update` per recipient, and resetInspection awaited one
 * `resetIdentification` per rung (a `subject.update`, maybe a character update and a notification
 * each). Now a share writes every recipient's identification row in ONE subject update and every
 * recipient's grant in ONE `Actor.updateDocuments`; a reset drops every rung in ONE subject update,
 * takes the miss lines back in ONE character update and posts ONE notification. Same rows written.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const PC3 = "zzPc000000000003";
const NPC = "zzNpc00000000001";
const NPC2 = "zzNpc00000000002";

const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: true, dc: 12, skill: "his", reveal: "<p>From Vel.</p>", miss: "<p>A Vel accent?</p>" },
  { id: "guild", title: "Salt Guild", category: "Guild", secret: true, dc: 15, skill: "inv", reveal: "<p>Guild hands.</p>", miss: "<p>Calloused?</p>" },
  { id: "cult", title: "Quiet Cult", category: "Cult", secret: true, dc: 18, skill: "rel", reveal: "<p>Hushed.</p>" },
];
const id = a => `attr:${a}:#id`;
const miss = (s, a) => `lore:${s}:#idmiss-${a}`;

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", flags: { "pentaryn-ties": { granted: { [miss(NPC2, "city")]: { text: "A Vel accent?", when: 1 }, [miss(NPC2, "guild")]: { text: "Calloused?", when: 1 }, keep: { text: "kept", when: 1 } } } } },
    { id: PC2, name: "ZZ Wren", type: "character" },
    { id: PC3, name: "ZZ Talo", type: "character" },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { attributes: ["city"] } } },
    {
      id: NPC2,
      name: "ZZ Orla",
      flags: {
        "pentaryn-ties": {
          attributes: ["city", "guild", "cult"],
          beliefs: {
            [PC]: {
              [id("city")]: { text: "", total: 3, when: 1, delivered: 1 },
              [id("guild")]: { text: "", total: 4, when: 1, delivered: 1 },
              [id("cult")]: { text: "Hushed.", total: 19, when: 1, delivered: 1 },
              "lore:x:l1": { text: "kept", when: 1 },
            },
            [PC2]: { [id("city")]: { text: "From Vel.", total: 15, when: 1, delivered: 1 } },
          },
        },
      },
    },
  ],
});
const Study = await import("../study.mjs");
const get = a => game.actors.get(a);
const since = mark => F.calls.slice(mark);
const updatesOf = (calls, a) => calls.filter(c => c.op === "update" && c.uuid === `Actor.${a}`);

test("AC-5: shareFact ident — one subject update for every recipient's row, one Actor.updateDocuments for every grant", async () => {
  const mark = F.calls.length;
  const out = await settle(Study.shareFact({ ns: "ident", subjectId: NPC, attrId: "city" }, [get(PC2), get(PC3)], { notify: false }));
  assert.deepEqual(out.shared, [PC2, PC3]);
  const calls = since(mark);
  const subj = updatesOf(calls, NPC);
  assert.equal(subj.length, 1, `subject updates: ${subj.length}`);
  assert.deepEqual(Object.keys(subj[0].changes).sort(), [PC2, PC3].map(p => `flags.pentaryn-ties.beliefs.${p}.${id("city")}`));
  assert.equal(updatesOf(calls, PC2).length + updatesOf(calls, PC3).length, 0, "no per-recipient pc.update");
  const batch = calls.filter(c => c.op === "Actor.updateDocuments");
  assert.equal(batch.length, 1);
  assert.deepEqual(batch[0].updates.map(u => u._id), [PC2, PC3]);
  // the rows written are the rows a per-recipient write produced
  for (const p of [PC2, PC3]) {
    const row = get(NPC).flags["pentaryn-ties"].beliefs[p][id("city")];
    assert.equal(row.text, "<p>From Vel.</p>");
    assert.equal(row.from, "gm");
    assert.ok(get(p).flags["pentaryn-ties"].granted[id("city")]);
    assert.ok(Array.isArray(get(p).flags["pentaryn-ties"].known));
  }
});

test("AC-5: resetInspection — one subject update, one character update, one notification", async () => {
  const mark = F.calls.length;
  const out = await settle(Study.resetInspection(get(PC), get(NPC2)));
  assert.equal(out, 3);
  const calls = since(mark);
  assert.equal(updatesOf(calls, NPC2).length, 1, "one subject update for every rung");
  assert.equal(updatesOf(calls, PC).length, 1, "one character update for every miss line");
  assert.equal(calls.filter(c => c.op === "notify").length, 1, "one notification");
  // the outcome: every ident rung gone, the lore row and the other character untouched
  assert.deepEqual(get(NPC2).flags["pentaryn-ties"].beliefs, {
    [PC]: { "lore:x:l1": { text: "kept", when: 1 } },
    [PC2]: { [id("city")]: { text: "From Vel.", total: 15, when: 1, delivered: 1 } },
  });
  assert.deepEqual(Object.keys(get(PC).flags["pentaryn-ties"].granted), ["keep"]);
});

test("AC-5: resetInspection of the only character's only rows unsets the beliefs flag", async () => {
  await get(NPC2).update({ "flags.pentaryn-ties.beliefs": null });
  await get(NPC2).update({ "flags.pentaryn-ties.beliefs": { [PC3]: { [id("city")]: { text: "x" }, [id("cult")]: { text: "" } } } });
  const mark = F.calls.length;
  assert.equal(await settle(Study.resetInspection(get(PC3), get(NPC2))), 2);
  assert.equal(updatesOf(since(mark), NPC2).length, 1);
  assert.equal("beliefs" in get(NPC2).flags["pentaryn-ties"], false, JSON.stringify(get(NPC2).flags["pentaryn-ties"].beliefs));
  assert.equal(updatesOf(since(mark), PC3).length, 0, "no miss lines, no character write");
});
