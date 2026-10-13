// DB-AC-3 [declared]: socketlib hands the "record" handler no sender id, so recordAsGM checks the
// entry is plausible: entry.userId names an existing user who is a GM or owns the actor
// entry.fromActorId (when that actor exists). Anything else resolves null with one prefixed warning
// and writes nothing. Forging past this needs the console, which is fine at Joe's table.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { dropbinWorld, makeActor, GM, PLAYER } from "./fixtures/world.mjs";
import { isPlausibleSender } from "../dropbin-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
const handlers = {};
globalThis.socketlib = {
  registerModule: () => ({ register: (name, fn) => { handlers[name] = fn; }, executeAsGM: () => 99 }),
};
await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");
F.fire("ready");
const { readLog } = await import("../settings.mjs");

const mine = makeActor(F, { id: "patActor00000001", name: "Pat's PC", ownership: { default: 0, [PLAYER]: 3 } });
const theirs = makeActor(F, { id: "npcActor00000001", name: "Goblin", ownership: { default: 0 } });

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
async function settle(promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 100 && !done; i++) {
    mock.timers.tick(0);
    await flush();
  }
  return promise;
}
async function quiet(fn) {
  const warns = [];
  const keep = [console.log, console.warn];
  console.log = () => {};
  console.warn = (...a) => warns.push(a);
  try { return { out: await fn(), warns }; } finally { [console.log, console.warn] = keep; }
}
let t = 0;
const entry = (itemName, userId, fromActorId) =>
  ({ t: (t += 10_000), reason: "delete", itemName, userId, fromActorId, fromActorName: "x", quantity: 1, item: null });

test("DB-AC-3: isPlausibleSender — an existing GM, or a user who owns the existing actor; a missing actor is not checked", () => {
  const ctx = { users: game.users, actors: game.actors };
  assert.equal(isPlausibleSender(entry("A", GM, theirs.id), ctx), true, "a GM, any actor");
  assert.equal(isPlausibleSender(entry("A", PLAYER, mine.id), ctx), true, "the player's own actor");
  assert.equal(isPlausibleSender(entry("A", PLAYER, theirs.id), ctx), false, "an actor the player does not own");
  assert.equal(isPlausibleSender(entry("A", PLAYER, "goneActor0000001"), ctx), true, "an actor that no longer exists");
  assert.equal(isPlausibleSender(entry("A", PLAYER, null), ctx), true, "no actor");
  assert.equal(isPlausibleSender(entry("A", "nobody0000000001", mine.id), ctx), false, "an unknown user");
  assert.equal(isPlausibleSender(entry("A", undefined, mine.id), ctx), false, "no user id");
});

test("DB-AC-3: a relayed entry from a plausible sender is recorded", async () => {
  for (const [name, userId, actorId] of [["Own", PLAYER, mine.id], ["Gm", GM, theirs.id], ["Gone", PLAYER, "goneActor0000001"]]) {
    const before = readLog().length;
    const { out } = await quiet(() => settle(Promise.resolve(handlers.record(entry(name, userId, actorId)))));
    assert.ok(Number.isInteger(out), `${name}: ${out}`);
    assert.equal(readLog().length, before + 1, name);
  }
});

test("DB-AC-3: a relayed entry naming an unknown user, or a player who does not own the actor, is refused with one prefixed warning", async () => {
  for (const e of [entry("Forged", PLAYER, theirs.id), entry("Ghost", "nobody0000000001", mine.id), entry("Anon", undefined, mine.id)]) {
    const before = readLog().length;
    const { out, warns } = await quiet(() => settle(Promise.resolve(handlers.record(e))));
    assert.equal(out, null, e.itemName);
    assert.equal(warns.length, 1, e.itemName);
    assert.match(String(warns[0][0]), new RegExp(`^${MOD} \\| `));
    assert.equal(readLog().length, before, `${e.itemName}: nothing appended`);
  }
});
