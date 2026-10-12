// journal-async-1: ready's ensureAll and the createUser hook run on EVERY tab of the active GM's account (the
// MCP bridge tab and a GM browser tab are both activeGM.isSelf). Before the fix they were gated per user, not
// per tab, so two tabs each made the folder and each player's journal. Two independent copies of the module
// ("tabs") share one world here; each tab's hooks run under its own socket id and see their own copy of each
// player's User (AsyncLocalStorage, so real timers). The server is simulated as in two-tabs.test.mjs:
//  - a Folder or JournalEntry create lands 20 ms after it is sent (both tabs look before either lands);
//  - a User update is applied in send order: the sender's copy gets every earlier broadcast, then its own
//    change; the other tab's copy gets the broadcast 10 ms later.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { StubCollection, makeUser } from "./kit/foundry-stub.mjs";
import { P1, P2, journalWorld } from "./fixtures/world.mjs";

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const F = await journalWorld();

const TABS = ["A", "B"];
/** One User document as each tab holds it, behind a server that orders updates (as two-tabs.test.mjs). */
function userPerTab(data) {
  const copies = Object.fromEntries(TABS.map(t => [t, makeUser(data)]));
  const inbox = Object.fromEntries(TABS.map(t => [t, []]));
  const deliver = t => { for (const u of inbox[t].splice(0)) copies[t].applyRaw(u); };
  for (const t of TABS) {
    const doc = copies[t];
    const raw = doc.update.bind(doc);
    Object.defineProperty(doc, "applyRaw", { value: changes => raw(changes), enumerable: false });
    Object.defineProperty(doc, "update", {
      enumerable: false,
      value: async changes => {
        deliver(t);                                   // earlier broadcasts reach me before my response
        for (const o of TABS) if (o !== t) {
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

// Each tab reads its own socket id and its own game.users, however deep in its async work it is.
const tab = new AsyncLocalStorage();
Object.defineProperty(game.socket, "id", { get: () => (tab.getStore() ? `socket-tab-${tab.getStore()}` : "socket-gm-1"), set() {}, configurable: true });
const shared = game.users;
const usersOf = Object.fromEntries(TABS.map(t => {
  const coll = new StubCollection(shared.filter(u => u.isGM));
  Object.defineProperty(coll, "activeGM", { get: () => shared.activeGM });
  return [t, coll];
}));
/** Add a player: the shared copy for the test, one copy per tab. */
function addPlayer(data) {
  const copies = userPerTab(data);
  for (const t of TABS) usersOf[t].set(data.id, copies[t]);
  shared.set(data.id, makeUser(data));
  return copies;
}
for (const u of shared.filter(u => !u.isGM)) addPlayer({ id: u.id, name: u.name, isGM: false, character: u.character });
Object.defineProperty(game, "users", { get: () => usersOf[tab.getStore()] ?? shared, configurable: true });

const created = { journals: 0, folders: 0 };
for (const [name, key] of [["JournalEntry", "journals"], ["Folder", "folders"]]) {
  const real = globalThis[name].create;
  globalThis[name].create = data => {
    created[key] += 1;
    return new Promise(resolve => setTimeout(() => resolve(real(data)), 20));
  };
}

// Load two tabs: every hook a copy registers runs under that tab's socket id.
for (const t of TABS) {
  const keep = { on: Hooks.on, once: Hooks.once };
  // a User argument (createUser) becomes this tab's copy of it
  const asTab = fn => (...args) => tab.run(t, () => fn(...args.map(a => (a?.documentName === "User" ? game.users.get(a.id) ?? a : a))));
  Hooks.on = (n, fn) => keep.on(n, asTab(fn));
  Hooks.once = (n, fn) => keep.once(n, asTab(fn));
  try { await import(copyModule()); } finally { Object.assign(Hooks, keep); }
  F.fire("init");                                     // this copy's once-listener; the other's is spent
}

const journalsOf = id => game.journal.filter(j => j.flags?.[MOD]?.userId === id);
/** Stamps still on a player, in either tab's copy. */
const claimsLeft = id => TABS.flatMap(t => Object.keys(usersOf[t].get(id).flags?.[MOD]?.claims?.ensure ?? {}));
/** Real time: wait until every given player has a journal and no claim is left, then let a loser finish. */
async function settle(ids) {
  for (let i = 0; i < 300 && !ids.every(id => journalsOf(id).length && !claimsLeft(id).length); i++) await sleep(10);
  await sleep(300);
}

test("two GM tabs run ready's ensureAll: one folder, one journal per player (journal-async-1)", async () => {
  F.fire("ready");
  await settle([P1, P2]);
  // journal-async-1 fixed [declared]: ensureAll goes through the relay's claim, so one tab creates each.
  assert.equal(created.folders, 1, "one folder");
  assert.equal(game.folders.size, 1);
  assert.equal(created.journals, 2, "one create per player");
  for (const id of [P1, P2]) {
    assert.equal(journalsOf(id).length, 1, `one journal for ${id}`);
    assert.deepEqual(claimsLeft(id), [], `both stamps removed for ${id}`);
  }
});

test("two GM tabs see createUser: one journal for the new player (journal-async-1)", async () => {
  const before = created.journals;
  const id = "player0000000003";
  addPlayer({ id, name: "Rae", isGM: false });
  F.fire("createUser", shared.get(id), {}, game.user.id);
  await settle([id]);
  assert.equal(created.journals - before, 1, "one create");
  assert.equal(journalsOf(id).length, 1);
  assert.deepEqual(claimsLeft(id), []);
});
