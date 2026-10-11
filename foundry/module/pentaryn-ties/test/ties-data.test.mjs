/**
 * Characterisation (ties checkpoint, wave 3): the ties data layer (ties-api.mjs) on a synthetic world —
 * read/inbound sanitising and ordering, write's owner gate, setTie's mirror rules (the "same name,
 * different contract" force-mirror row the guide's ties-12 oracle sets beside the dialog's seeding),
 * setNotes, removeTie, candidates' permission filter, migrateLegacy's move-or-warn, mayWrite,
 * baseActorOf, presentActorIds, stanceLabel. Effects are pinned as the stub's ordered call log.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise, pinJSON } from "./kit/harness.mjs";
import { bootWorld } from "./fixtures/world.mjs";
import * as API from "../ties-api.mjs";

const A = "zzActorA00000001";
const B = "zzActorB00000001";
const C = "zzActorC00000001";
const LOCKED = "zzLocked00000001";
const PLAYER = "zzPlayerUser0001";

const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [
    {
      id: A,
      name: "ZZ Alder",
      type: "character",
      flags: {
        "pentaryn-ties": {
          ties: [
            { id: B, name: "stored B", word: "  friend  ", notes: "n".repeat(4100), stance: 9, strength: 0 },
            null,
            "junk",
            { word: "no id" },
            { id: B, word: "duplicate" },
            { id: "zzGone0000000001", name: "Stored Gone", word: "lost", stance: -1, strength: 5 },
            { id: "zzGone0000000002", word: "nameless", stance: "x", strength: "4" },
            { id: C, word: "w".repeat(200), stance: 1.6, strength: 2 },
          ],
        },
      },
    },
    { id: B, name: "ZZ Birch", flags: { "pentaryn-ties": { ties: [{ id: A, word: "ward", stance: 2, strength: 3 }] } } },
    { id: C, name: "ZZ Cedar", ownership: { default: 0, [PLAYER]: 1 }, flags: { "pentaryn-ties": { ties: "not an array" } } },
    { id: LOCKED, name: "ZZ Locked", isOwner: false, flags: { "pentaryn-ties": { ties: [{ id: A, word: "watcher" }] } } },
    { id: "zzLegacy00000001", name: "ZZ Legacy", flags: { world: { ties: [{ id: A, word: "old" }, { word: "no id" }] } } },
    { id: "zzLegacy00000002", name: "ZZ Legacy Both", flags: { world: { ties: [{ id: A, word: "old" }] }, "pentaryn-ties": { ties: [{ id: B, word: "new" }] } } },
  ],
  tokens: [
    { id: "zzTokA0000000001", actorId: A },
    { id: "zzTokB0000000001", actorId: B, isVisible: false },
    { id: "zzTokC0000000001", actorId: C },
    { id: "zzTokX0000000001", actorId: "zzNoActor0000001" },
  ],
});
const bootMigration = F.calls.filter(c => c.op === "update" && /zzLegacy/.test(c.uuid));
const bootWarnings = F.console.slice();
const get = id => game.actors.get(id);
const asPlayer = async fn => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  try {
    return await fn();
  } finally {
    game.user = gm;
  }
};
/** Run one write and capture its return and its effects. */
const effects = async (label, fn) => {
  const mark = F.calls.length;
  const c0 = F.console.length;
  const out = await fn();
  return { label, out, calls: F.calls.slice(mark).filter(c => c.op === "update" || c.op === "notify"), console: F.console.slice(c0) };
};

test("read: sanitised, de-duplicated, resolved, ordered (strength desc, then name)", () => {
  pinJSON(
    "data-read",
    {
      a: API.read(get(A)),
      b: API.read(get(B)),
      notArray: API.read(get(C)),
      none: API.read(null),
      throwingFlag: API.read({ getFlag: () => { throw new Error("x"); } }),
    },
    import.meta.url
  );
});

test("inbound: who points at A, with mutual; GM only", async () => {
  pinJSON("data-inbound", { gm: API.inbound(get(A)), player: await asPlayer(() => API.inbound(get(A))), none: API.inbound(null) }, import.meta.url);
});

test("candidates: GM sees all but self and the tied; a player only LIMITED", async () => {
  const ids = list => list.map(a => a.id);
  pinJSON("data-candidates", { gmB: ids(API.candidates(get(B))), playerB: ids(await asPlayer(() => API.candidates(get(B)))), none: ids(API.candidates(null)) }, import.meta.url);
});

test("mayWrite: GM always; a player follows playerAccess", async () => {
  const p = game.users.get(PLAYER);
  const on = API.mayWrite(p);
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  const off = API.mayWrite(p);
  await game.settings.set("pentaryn-ties", "playerAccess", true);
  assert.deepEqual({ gm: API.mayWrite(), on, off, nobody: API.mayWrite(null) }, { gm: true, on: true, off: false, nobody: true });
});

test("baseActorOf and presentActorIds (GM sees all; a player only isVisible)", async () => {
  pinJSON(
    "data-presence",
    {
      viaDocument: API.baseActorOf({ document: { actorId: A } })?.id ?? null,
      viaActorId: API.baseActorOf({ actorId: B })?.id ?? null,
      unknown: API.baseActorOf({ actorId: "nope" }),
      none: API.baseActorOf(null),
      gm: [...API.presentActorIds()],
      player: [...(await asPlayer(() => API.presentActorIds()))],
    },
    import.meta.url
  );
});

test("stanceLabel over -3..3 and junk", async () => {
  await characterise("data-stanceLabel", v => API.stanceLabel(v), [[-3], [-2], [-1], [0], [1], [2], [3], ["x"], [null]], { file: import.meta.url });
});

test("write / setTie / setNotes / removeTie: returns and the updates they make", async () => {
  const rows = [];
  rows.push(await effects("write: no actor", () => API.write(null, [])));
  rows.push(await effects("write: not the owner", () => API.write(get(LOCKED), [])));
  rows.push(await effects("write: non-array list", () => API.write(get(C), "x")));
  rows.push(await effects("setTie: self", () => API.setTie(get(A), get(A), { word: "me" })));
  rows.push(await effects("setTie: missing target", () => API.setTie(get(A), null)));
  rows.push(await effects("setTie: B→C new, mirrored", () => API.setTie(get(B), get(C), { word: "rival", stance: -2, strength: 5, notes: "long feud" })));
  rows.push(await effects("setTie: B→C nudge stance, notes omitted (kept)", () => API.setTie(get(B), get(C), { word: "rival", stance: -1 })));
  rows.push(await effects("setTie: B→C reverse fields, no reciprocal", () => API.setTie(get(B), get(C), { word: "x" }, { reciprocal: false })));
  rows.push(await effects("setTie: C→B reverseWord/Stance/Notes", () => API.setTie(get(C), get(B), { word: "a" }, { reverseWord: "b", reverseStance: 2, reverseNotes: "rev" })));
  rows.push(await effects("setTie: A→LOCKED (mirror unwritable)", () => API.setTie(get(A), get(LOCKED), { word: "suspect" })));
  rows.push(await effects("setTie: LOCKED→A (own side unwritable, mirror lands)", () => API.setTie(get(LOCKED), get(A), { word: "spy" })));
  rows.push(await effects("setNotes: missing edge", () => API.setNotes(get(B), "zzNobody00000001", "x")));
  rows.push(await effects("setNotes: no target id", () => API.setNotes(get(B), null, "x")));
  rows.push(await effects("setNotes: B→C", () => API.setNotes(get(B), C, "z".repeat(4100))));
  rows.push(await effects("removeTie: B→C both ways", () => API.removeTie(get(B), C)));
  rows.push(await effects("removeTie: B→A one way", () => API.removeTie(get(B), A, { bothWays: false })));
  rows.push(await effects("removeTie: A→LOCKED (mirror on an unowned actor is left)", () => API.removeTie(get(A), LOCKED)));
  rows.push(await effects("removeTie: C→A (A's row back to C is the mirror)", () => API.removeTie(get(C), A)));
  rows.push(await effects("removeTie: no actor", () => API.removeTie(null, A)));
  pinJSON("data-writes", rows, import.meta.url);
});

test("migrateLegacy: the ready step moved the actor with no module data and warned on the one with both; a re-run moves nothing; players move nothing", async () => {
  const player = await asPlayer(() => API.migrateLegacy());
  const row = await effects("re-run", () => API.migrateLegacy());
  pinJSON("data-migrate", { bootMigration, bootWarnings, player, ...row, after: { legacy: get("zzLegacy00000001").flags, both: get("zzLegacy00000002").flags } }, import.meta.url);
});
