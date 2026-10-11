// items-journal-40: the ensure relay reaches EVERY tab of the active GM's account (the MCP bridge tab and a
// GM browser tab are both activeGM.isSelf). Two independent copies of the module ("tabs") share one world;
// the server is simulated faithfully enough for the race:
//  - a JournalEntry create lands in the world 20 ms after it is sent (both tabs look before either lands);
//  - a User update is applied in send order: the sender's copy gets every earlier broadcast, then its own
//    change; the other tab's copy gets the broadcast 10 ms later (socket order: a broadcast emitted before
//    my response reaches me first).
import { after, mock, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeUser } from "./kit/foundry-stub.mjs";
import { P1, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const MOD = "pentaryn-journal";
const SRC = fileURLToPath(new URL("..", import.meta.url));
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** A private copy of the module's runtime files: importing its entry gives a fully separate instance. */
function copyModule() {
  const dir = mkdtempSync(join(tmpdir(), "pj-tab-"));
  dirs.push(dir);
  for (const f of readdirSync(SRC)) if (f.endsWith(".mjs")) cpSync(join(SRC, f), join(dir, f));
  cpSync(join(SRC, "lib"), join(dir, "lib"), { recursive: true });
  cpSync(join(SRC, "lang"), join(dir, "lang"), { recursive: true });
  return pathToFileURL(join(dir, "journal.mjs")).href;
}

/** One User document as each tab holds it, behind a server that orders updates. */
function userPerTab(data, tabs) {
  const copies = Object.fromEntries(tabs.map(t => [t, makeUser(data)]));
  const inbox = Object.fromEntries(tabs.map(t => [t, []]));
  const deliver = t => { for (const u of inbox[t].splice(0)) copies[t].applyRaw(u); };
  for (const t of tabs) {
    const doc = copies[t];
    const raw = doc.update.bind(doc);
    Object.defineProperty(doc, "applyRaw", { value: changes => raw(changes), enumerable: false });
    Object.defineProperty(doc, "update", {
      enumerable: false,
      value: async changes => {
        deliver(t);                                   // earlier broadcasts reach me before my response
        for (const o of tabs) if (o !== t) {
          inbox[o].push(changes);
          setTimeout(() => deliver(o), 10);
        }
        await raw(changes);
        return doc;
      },
    });
  }
  return copies;
}

const F = await journalWorld();
let created = 0;
const realCreate = globalThis.JournalEntry.create;
globalThis.JournalEntry.create = data => {
  created += 1;
  return new Promise(resolve => setTimeout(() => resolve(realCreate(data)), 20));
};

const relays = {};
for (const tab of ["A", "B"]) {
  await import(copyModule());
  F.fire("init");                                     // this copy's once-listener; the other's is spent
  relays[tab] = CONFIG.queries[`${MOD}.ensure`];
}

const settle = async () => {
  for (let i = 0; i < 200; i++) {
    for (let j = 0; j < 20; j++) await Promise.resolve();
    mock.timers.tick(10);
  }
};

test("two GM tabs answer one player's ensure (items-journal-40)", async () => {
  assert.notEqual(relays.A, relays.B, "two independent module copies");
  const sender = userPerTab({ id: P1, name: "Pat", isGM: false, character: { name: "Talo Vesk" } }, ["A", "B"]);
  F.become({ socketId: "socket-tab-A" });
  const a = relays.A({}, { user: sender.A });
  F.become({ socketId: "socket-tab-B" });
  const b = relays.B({}, { user: sender.B });
  const results = Promise.allSettled([a, b]);
  await settle();
  const [ra, rb] = await results;
  const journals = game.journal.filter(j => j.flags?.[MOD]?.userId === P1);
  // KNOWN items-journal-40: both tabs looked before either create landed, so each created one.
  assert.equal(created, 2, "KNOWN items-journal-40: two creates");
  assert.equal(journals.length, 2, "KNOWN items-journal-40: two personal journals");
  assert.equal(ra.status, "fulfilled");
  assert.equal(rb.status, "fulfilled");
});
