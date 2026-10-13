/**
 * Defect wave 2 integration (ties-ui x ties-core): the module has TWO write queues, and both now
 * hold at once.
 *
 *  · ties-core's registry queue (`serial` in attributes.mjs): `ensure`, `create`, `link`, `unlink`,
 *    `repair` and — since this merge — `repairAllAncestry` (the Fix it button) plan inside it. EC-2:
 *    two concurrent `ensure` calls for one new title answer created + `existed: true`. U3: links made
 *    together on one actor all land.
 *  · ties-ui's per-actor queue (`serial(actorId, fn)` in ties-adapter.mjs, ACC-3): each actor's ties
 *    and Known edits read inside the queue, so quick edits never undo each other.
 *
 * They are separate chains: neither awaits the other, so work on one never waits behind (or
 * reorders) work on the other, and a per-actor write that awaits a registry write — or the reverse
 * nesting through the public calls — cannot deadlock. This runs all of it together on one actor
 * whose server answers a tick late, behind a timeout that names a deadlock.
 *
 * Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzQueuePc0000001";
const NPC = "zzQueueNpc000001";
const OTHER = "zzQueueOther0001";
const REGISTRY = [
  { id: "realm", title: "Old Realm", category: "Realm" },
  { id: "city", title: "Vel", category: "City", parent: "realm" },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city" },
];

await bootWorld({
  // real timers: inTime()'s deadlock timer has to fire, and the fixture's mock.timers would freeze it
  timers: false,
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    {
      id: PC,
      name: "ZZ Queue PC",
      type: "character",
      flags: {
        "pentaryn-ties": {
          // "guild" without its ancestors: Fix it has something to write
          attributes: ["guild"],
          ties: [{ id: NPC, word: "debtor", notes: "", stance: 0, strength: 2 }],
          known: [{ id: NPC, name: "ZZ Queue NPC", category: "sentient", notes: "", when: 1_700_000_000_000 }],
        },
      },
    },
    { id: NPC, name: "ZZ Queue NPC" },
    { id: OTHER, name: "ZZ Queue Other" },
  ],
});
const A = await import("../attributes.mjs");
const T = await import("../ties-adapter.mjs");
const K = await import("../known-data.mjs");
const pc = game.actors.get(PC);

// a server round trip: every actor write lands a tick after it is sent, and the order they land in
// is recorded
const landed = [];
const apply = pc.update.bind(pc);
pc.update = async (changes, ...rest) => {
  await new Promise(r => setImmediate(r));
  landed.push(Object.keys(foundry.utils.flattenObject(changes ?? {})).join(","));
  return apply(changes, ...rest);
};

const flag = key => pc.getFlag("pentaryn-ties", key);
const entryIds = () => (game.settings.get("pentaryn-ties", "attributes") ?? []).filter(e => e?.stamp === undefined).map(e => e.id);

/** Settle `p`, or fail naming a deadlock — a queue waiting on itself never settles. */
function inTime(p, what, ms = 2000) {
  let timer;
  const out = Promise.race([
    p,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`deadlock: ${what} did not settle in ${ms} ms`)), ms);
    }),
  ]);
  return out.finally(() => clearTimeout(timer));
}

test("EC-2 x ACC-3: concurrent ensures, links and Fix it run beside quick ties/Known edits on one actor — every write lands, none waits on the other queue", async () => {
  const work = Promise.all([
    // ties-core, the registry queue (FIFO): two ensures of one new title, a link that needs it, Fix it
    A.ensureAttribute("Tide Order", { dc: 13 }),
    A.ensureAttribute("Tide Order", { dc: 18 }),
    A.linkAttribute(pc, "Tide Order"),
    A.repairAllAncestry(pc),
    // ties-ui, the per-actor queue (FIFO): a word, a pip, notes, two Known edits and a new Known row
    T.editTie(pc, NPC, "word", "creditor"),
    T.editTie(pc, NPC, "strength", 5),
    T.setNotes(pc, NPC, "Owes the Salt Guild."),
    K.setKnownField(pc, NPC, "category", "beasts"),
    K.setKnownField(pc, NPC, "notes", "Met at the docks."),
    K.addKnown(pc, OTHER, { now: 1_700_000_000_001 }),
  ]);
  const [a, b, link, fix, word, pip, notes, cat, knotes, added] = await inTime(work, "the two queues together");

  // EC-2 holds: the first ensure creates, the second answers existed:true with the first's opts
  assert.deepEqual([a.ok, a.existed, b.ok, b.existed], [true, false, true, true], JSON.stringify({ a, b }));
  assert.equal(b.entry.id, a.entry.id);
  assert.equal(b.entry.dc, 13, "the second ensure's opts are not applied");
  assert.deepEqual(entryIds(), ["realm", "city", "guild", "tideorder"], "one entry created, none lost");

  // the registry queue kept its order: the link queued after the ensures found the new entry, and
  // Fix it (queued after the link) read the link's write and still added the missing ancestors
  assert.equal(link.ok, true, JSON.stringify(link));
  assert.deepEqual(link.added, ["tideorder"]);
  assert.equal(fix.ok, true, JSON.stringify(fix));
  assert.deepEqual([...fix.added].sort(), ["city", "realm"]);
  assert.deepEqual([...flag("attributes")].sort(), ["city", "guild", "realm", "tideorder"], "no link write undid another");

  // ACC-3 holds: every ties and Known edit landed, none undid the one before
  assert.ok(word && pip && notes, "the tie edits answered");
  const tie = flag("ties").find(t => t.id === NPC);
  assert.deepEqual({ word: tie.word, strength: tie.strength, notes: tie.notes }, { word: "creditor", strength: 5, notes: "Owes the Salt Guild." });
  assert.equal(cat, true);
  assert.equal(knotes, true);
  assert.equal(added?.id, OTHER);
  const known = flag("known");
  assert.deepEqual(
    known.map(e => [e.id, e.category, e.notes]),
    [[NPC, "beasts", "Met at the docks."], [OTHER, known.find(e => e.id === OTHER).category, ""]]
  );

  // each queue kept its own order on the wire
  const ties = landed.filter(k => k.includes(".ties"));
  const knownWrites = landed.filter(k => k.includes(".known"));
  const links = landed.filter(k => k.includes(".attributes"));
  assert.deepEqual([ties.length, knownWrites.length, links.length], [3, 3, 2], landed.join(" | "));
});

test("a per-actor write that awaits Fix it and an ensure, racing a link and the same ensure on the registry queue — all land, nothing deadlocks", async () => {
  // break the ladder again: "realm" is missing above "city", so Fix it has a row to write
  await apply({ flags: { "pentaryn-ties": { attributes: ["city", "guild", "tideorder"] } } });
  const before = landed.length;

  const both = Promise.all([
    // ties-ui, the per-actor queue: an edit that awaits two registry writes before it writes its own
    T.serial(PC, async () => {
      const fixed = await A.repairAllAncestry(pc);
      const made = await A.ensureAttribute("Ash Court");
      const list = T.read(pc);
      list.find(t => t.id === NPC).word = `of the ${made.entry.title}`;
      return { fixed, made, wrote: await T.write(pc, list) };
    }),
    // ties-core, the registry queue, called first: an ensure of the same new title and a link of it.
    // Fix it is queued behind the link, so it reads the link's write; unqueued (7ca6e0a9), it read
    // the flags while the link's write was still in flight and one of the two writes undid the other
    A.ensureAttribute("Ash Court", { dc: 9 }),
    A.linkAttribute(pc, "Ash Court"),
    T.editTie(pc, NPC, "stance", 1),
  ]);
  const [inner, outer, link, stance] = await inTime(both, "registry writes nested in an actor's queue");
  assert.equal(inner.wrote, true);

  // EC-2 across the nesting: the outer ensure reached the registry queue first and created the
  // entry; the nested one, queued behind it, answered existed:true with the first's opts
  assert.deepEqual([outer.ok, outer.existed, inner.made.ok, inner.made.existed], [true, false, true, true], JSON.stringify({ outer, made: inner.made }));
  assert.equal(inner.made.entry.dc, 9);
  assert.equal(entryIds().filter(id => id === "ashcourt").length, 1, "one entry");

  // the link and Fix it both landed: neither write undid the other
  assert.equal(link.ok, true, JSON.stringify(link));
  assert.deepEqual(link.added, ["ashcourt"]);
  assert.equal(inner.fixed.ok, true, JSON.stringify(inner.fixed));
  assert.deepEqual(inner.fixed.added, ["realm"]);
  assert.deepEqual([...flag("attributes")].sort(), ["ashcourt", "city", "guild", "realm", "tideorder"], landed.slice(before).join(" | "));

  // FIFO on the actor's queue: the stance edit ran after the nested write and kept its word
  assert.ok(stance);
  const tie = flag("ties").find(t => t.id === NPC);
  assert.deepEqual({ word: tie.word, stance: tie.stance }, { word: "of the Ash Court", stance: 1 });
});
