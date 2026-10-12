/**
 * Characterisation (ties checkpoint, wave 3 — guide §3 S2 item 5, ties-38): the two socket handlers on
 * `module.pentaryn-ties`, run for real. The dispatch matrix (which action each handler acts on, with
 * this client the applying GM and not), the relay's whole trust boundary (applyMirror: who sent it,
 * ownership, the kill switch, reach, fill-blanks-only), requestMirror's no-op cases, and the tempo
 * bubble every client renders and removes on a 5 s timer. Frozen once committed.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el, serialise } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const FAR = "zzFar00000000001";
const OWNED = "zzOwned000000001";
const PLAYER = "zzPlayerUser0001";
const GM = "gmUser0000000001";

const handlers = [];
const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 }, flags: { "pentaryn-ties": { ties: [{ id: NPC, word: "debtor", notes: "owes us", stance: -1, strength: 4 }, { id: FAR, word: "pen pal" }] } } },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { ties: [] } } },
    { id: FAR, name: "ZZ Faraway" },
    { id: OWNED, name: "ZZ Unownable", isOwner: false },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, x: 200, y: 300 },
    { id: "zzTokNpc00000001", actorId: NPC },
  ],
  before: F => {
    F.game.socket.on = (channel, fn) => handlers.push({ channel, fn });
  },
});
const [relay, study] = handlers.map(h => h.fn);
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};
const run = async (label, fn) => {
  const mark = F.calls.length;
  const c0 = F.console.length;
  const out = await settle(Promise.resolve(fn()));
  await settle(flush());
  return { label, out: out ?? null, calls: F.calls.slice(mark), console: F.console.slice(c0) };
};
// the tempo bubble needs somewhere to land
const bubbles = el("div");
bubbles.id = "chat-bubbles";
document.body.appendChild(bubbles);

test("both handlers sit on module.pentaryn-ties, relay first", () => {
  assert.deepEqual(handlers.map(h => h.channel), ["module.pentaryn-ties", "module.pentaryn-ties"]);
});

test("dispatch matrix: action × applying GM (true, then false) — who acts on what", async () => {
  const rows = [];
  for (const applying of [true, false]) {
    game.user.active = applying; // activeGM is this user only while active
    for (const action of ["mirror-reverse", "study", "inspect", "scope-bubble", "unknown"]) {
      const payload = { action, sourceId: "nope", targetId: "nope", characterId: "nope", subjectId: "nope", tokenId: "nope", sceneId: "nope", text: "x" };
      rows.push(await run(`${action} / applying ${applying}`, async () => {
        await relay(payload, "zzNoSuchUser0001");
        await study(payload, "zzNoSuchUser0001");
      }));
    }
  }
  game.user.active = true;
  pinJSON("socket-matrix", rows, import.meta.url);
});

test("relay applyMirror: the trust boundary, case by case", async () => {
  const send = (payload, sender) => relay({ action: "mirror-reverse", ...payload }, sender);
  const rows = [];
  rows.push(await run("unknown sender", () => send({ sourceId: PC, targetId: NPC }, "zzNoSuchUser0001")));
  rows.push(await run("missing source", () => send({ sourceId: "nope", targetId: NPC }, PLAYER)));
  rows.push(await run("self pair", () => send({ sourceId: PC, targetId: PC }, PLAYER)));
  rows.push(await run("sender does not own the source", () => send({ sourceId: NPC, targetId: PC }, PLAYER)));
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  rows.push(await run("playerAccess off", () => send({ sourceId: PC, targetId: NPC }, PLAYER)));
  await game.settings.set("pentaryn-ties", "playerAccess", true);
  rows.push(await run("target the GM cannot own", () => send({ sourceId: PC, targetId: OWNED }, PLAYER)));
  rows.push(await run("target out of reach (no token, no LIMITED)", () => send({ sourceId: PC, targetId: FAR }, PLAYER)));
  game.actors.get(PC).flags["pentaryn-ties"].ties = [{ id: NPC, word: "debtor", notes: "owes us", stance: -1, strength: 4 }];
  rows.push(await run("no reverse row yet: seeded in full", () => send({ sourceId: PC, targetId: NPC }, PLAYER)));
  rows.push(await run("reverse row written: nothing to fill", () => send({ sourceId: PC, targetId: NPC }, PLAYER)));
  game.actors.get(NPC).flags["pentaryn-ties"].ties = [{ id: PC, word: "", notes: "their own", stance: 2, strength: 1 }];
  rows.push(await run("reverse word blank: only the word is filled", () => send({ sourceId: PC, targetId: NPC }, PLAYER)));
  game.actors.get(PC).flags["pentaryn-ties"].ties = [];
  rows.push(await run("sender never saved their own side", () => send({ sourceId: PC, targetId: NPC }, PLAYER)));
  game.actors.get(PC).flags["pentaryn-ties"].ties = [{ id: NPC, word: "debtor" }];
  game.actors.get(NPC).flags["pentaryn-ties"].ties = [];
  const npc = game.actors.get(NPC);
  const update = npc.update;
  Object.defineProperty(npc, "update", { value: async () => { throw new Error("zz write refused"); }, configurable: true, writable: true });
  rows.push(await run("the write throws", () => send({ sourceId: PC, targetId: NPC }, PLAYER)));
  Object.defineProperty(npc, "update", { value: update, configurable: true, writable: true });
  pinJSON("socket-relay", rows, import.meta.url);
});

test("requestMirror: emits ids only, and only when it has to", async () => {
  const { requestMirror } = await import("../relay.mjs");
  const pc = game.actors.get(PC);
  const rows = [];
  rows.push(await run("no source", () => requestMirror({ source: null, target: pc })));
  rows.push(await run("same actor", () => requestMirror({ source: pc, target: pc })));
  rows.push(await run("target owned (write it yourself)", () => requestMirror({ source: pc, target: game.actors.get(NPC) })));
  rows.push(await run("target not owned, GM online", () => requestMirror({ source: pc, target: game.actors.get(OWNED) })));
  game.user.active = false;
  rows.push(await run("no active GM", () => requestMirror({ source: pc, target: game.actors.get(OWNED) })));
  game.user.active = true;
  pinJSON("socket-request-mirror", rows, import.meta.url);
});

test("scope-bubble: rendered over the token on this scene, replaced by a second, removed after 5 s (+450 ms)", async () => {
  const say = text => study({ action: "scope-bubble", tokenId: "zzTokPc000000001", sceneId: canvas.scene.id, text }, PLAYER);
  await say("first look");
  const one = serialise(bubbles);
  await say("second look");
  const two = serialise(bubbles);
  await study({ action: "scope-bubble", tokenId: "zzTokPc000000001", sceneId: "zzOtherScene0001", text: "elsewhere" }, PLAYER);
  await study({ action: "scope-bubble", tokenId: "zzNoToken0000001", sceneId: canvas.scene.id, text: "no token" }, PLAYER);
  const ignored = serialise(bubbles);
  mock.timers.tick(5000);
  const faded = serialise(bubbles);
  mock.timers.tick(450);
  const gone = serialise(bubbles);
  pinJSON("socket-bubble", { one, two, ignored, faded, gone }, import.meta.url);
});
