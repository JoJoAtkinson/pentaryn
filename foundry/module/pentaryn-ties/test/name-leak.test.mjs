/**
 * name-leak (play-test TIE-3): every chat card this module posts names a creature by its TOKEN
 * name, never its actor name — a GM-only world actor name ("ZZ Lich Vorath") must not reach
 * player chat when the table only ever saw "Hooded figure". Joe's ruling: the token name is
 * public; the actor name is used only when there is no token at all (none on the scene, and no
 * prototype name either).
 *
 * The cards: the closer-look stub (`postStub`), the tempo line over the inspector, and the GM's
 * share whisper. Fresh world so no other file's sequential state is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { StubCollection } from "./kit/foundry-stub.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const NPC = "zzNpc00000000001";
const NPC2 = "zzNpc00000000002";
const NPC3 = "zzNpc00000000003";
const NPC4 = "zzNpc00000000004";
const NPC5 = "zzNpc00000000005";
const PLAYER = "zzPlayerUser0001";

const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [
    { id: PC, name: "ZZ Caven Full Name", type: "character" },
    { id: PC2, name: "ZZ Wren Full Name", type: "character", ownership: { default: 0, [PLAYER]: 3 } },
    {
      id: NPC,
      name: "ZZ Lich Vorath",
      flags: { "pentaryn-ties": { lore: [
        { id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>", miss: "" },
        { id: "l2", label: "Haunts", dc: 12, skill: "ins", text: "<p>The crypt.</p>", miss: "" },
      ] } },
    },
    { id: NPC2, name: "ZZ Second Secret" },
    { id: NPC3, name: "ZZ Off Scene Secret", prototypeToken: { name: "A stranger" } },
    { id: NPC4, name: "ZZ Tokenless" },
    { id: NPC5, name: "ZZ Far Secret", prototypeToken: { name: "ZZ Far Secret" } },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, name: "Caven", x: 0, y: 0 },
    { id: "zzTokPc000000002", actorId: PC2, name: "Wren", x: 500, y: 0 },
    { id: "zzTokNpc00000001", actorId: NPC, name: "Hooded figure" },
    { id: "zzTokNpc00000002", actorId: NPC2, name: "Tall woman" },
  ],
});
const Study = await import("../study.mjs");
const { postStub, applyStudy } = await import("../study/apply.mjs");
const get = id => game.actors.get(id);
const cardsSince = mark => F.calls.slice(mark).filter(c => c.op === "ChatMessage.create").map(c => c.data);
const SECRETS = /ZZ (Lich|Second Secret|Off Scene|Far Secret|Caven Full|Wren Full)/;

/** A scene the GM client can be looking at that is not the active one (`canvas.scene` ≠ active). */
const addScene = (id, tokens = []) => {
  const scene = { id, active: false, tokens: new StubCollection(tokens) };
  game.scenes.set(id, scene);
  return scene;
};
const EMPTY = addScene("zzScene000000002");
addScene("zzScene000000003", [{ id: "zzTokFar00000001", actorId: NPC5, name: "Cloaked rider" }]);

/** Run `fn` with this client's canvas on `scene`, then put it back. */
async function viewing(scene, fn) {
  const was = canvas.scene;
  canvas.scene = scene;
  try {
    return await fn();
  } finally {
    canvas.scene = was;
  }
}

test("name-leak: the closer-look stub and the tempo line name creatures by their token names", async () => {
  const mark = F.calls.length;
  await settle(Study.inspectAs(get(PC), get(NPC)));
  await settle(Study.inspectAs(get(PC), get(NPC2))); // the second look: the tempo line fires
  const cards = cardsSince(mark);
  const stubs = cards.filter(c => c.content.includes("pt-study-stub"));
  const tempo = cards.filter(c => c.content.includes("pt-tempo-line"));
  assert.equal(stubs.length, 2);
  assert.equal(tempo.length, 1);
  assert.match(stubs[0].content, /Caven studies Hooded figure\./);
  assert.match(stubs[1].content, /Caven studies Tall woman\./);
  assert.match(tempo[0].content, /Caven gives a second stranger/);
  for (const c of cards) {
    assert.doesNotMatch(c.content, SECRETS, "no actor name in a card's text");
    if (c.speaker?.alias != null) assert.doesNotMatch(c.speaker.alias, SECRETS, "no actor name as the speaker");
  }
  assert.equal(stubs[0].speaker.alias, "Caven");
  assert.equal(tempo[0].speaker.alias, "Caven");
});

test("name-leak: the GM's share whisper names the recipient and the subject by token name", async () => {
  const mark = F.calls.length;
  const res = await settle(Study.shareFact({ ns: "lore", subjectId: NPC, factId: "l1" }, [get(PC2)]));
  assert.deepEqual(res.shared, [PC2]);
  const [whisper] = cardsSince(mark);
  assert.ok(whisper, "a whisper was posted");
  assert.deepEqual(whisper.whisper, [PLAYER]);
  assert.match(whisper.content, /Wren has learned something about Hooded figure\./);
  assert.doesNotMatch(whisper.content, SECRETS);
});

test("name-leak: an unlinked token's own name wins; prototype name off scene; actor name only with no token at all", async () => {
  const mark = F.calls.length;
  const synthetic = Object.assign(Object.create(Object.getPrototypeOf(get(NPC))), get(NPC), {
    token: { id: "zzTokUnlinked001", name: "Masked guard", actorId: NPC },
  });
  await postStub(get(PC), synthetic);
  await postStub(get(PC), get(NPC3));
  await postStub(get(PC), get(NPC4));
  const texts = cardsSince(mark).map(c => c.content);
  assert.match(texts[0], /Caven studies Masked guard\./);
  assert.match(texts[1], /Caven studies A stranger\./);
  assert.match(texts[2], /Caven studies ZZ Tokenless\./);
});

test("name-leak: a GM client looking at another scene still names by token (the Study stub and the share whisper)", async () => {
  const mark = F.calls.length;
  const ok = await viewing(EMPTY, () => settle(applyStudy({ characterId: PC, subjectId: NPC, ns: "lore", factId: "l1" }, game.user.id)));
  assert.equal(ok, true, "the study applied");
  const res = await viewing(EMPTY, () => settle(Study.shareFact({ ns: "lore", subjectId: NPC, factId: "l2" }, [get(PC2)])));
  assert.deepEqual(res.shared, [PC2]);
  const cards = cardsSince(mark);
  const stub = cards.find(c => c.content.includes("studies"));
  const whisper = cards.find(c => c.whisper?.length);
  assert.ok(stub, "the stub was posted");
  assert.ok(whisper, "the whisper was posted");
  assert.match(stub.content, /Caven studies Hooded figure\./);
  assert.equal(stub.speaker.alias, "Caven");
  assert.match(whisper.content, /Wren has learned something about Hooded figure\./);
  for (const c of cards) {
    assert.doesNotMatch(c.content, SECRETS, "no actor name in a card's text");
    if (c.speaker?.alias != null) assert.doesNotMatch(c.speaker.alias, SECRETS, "no actor name as the speaker");
  }
});

test("name-leak: a token on a scene nobody is viewing beats the prototype and actor names", async () => {
  const mark = F.calls.length;
  await postStub(get(PC), get(NPC5));
  const [card] = cardsSince(mark);
  assert.match(card.content, /Caven studies Cloaked rider\./);
});
