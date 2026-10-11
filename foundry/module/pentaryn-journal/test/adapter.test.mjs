// sources-adapter.mjs (guide step 4): the gmButton setting arrives as an argument, Item Piles' preview copy
// is traced back to the pile's real item, and the item body keeps Foundry's escaper (items-journal-32: the
// body is hashed, so its entity spelling must not change).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { P1, journalWorld } from "./fixtures/world.mjs";
import { StubCollection } from "./kit/foundry-stub.mjs";

const F = await journalWorld();
const A = await import("../sources-adapter.mjs");
const core = await import("../journal-core.mjs");

const entry = (perm, extra = {}) => ({ documentName: "JournalEntry", flags: {}, testUserPermission: (u, level) => perm.includes(level), ...extra });

test("shouldShowBar: the GM's answer is the gmButton argument; a player's is observer and not owner", () => {
  const gm = game.user;
  const player = game.users.get(P1);
  assert.equal(A.shouldShowBar(entry(["OBSERVER"]), gm), false, "default gmButton false");
  assert.equal(A.shouldShowBar(entry(["OBSERVER"]), gm, { gmButton: true }), true);
  assert.equal(A.shouldShowBar(entry(["OBSERVER"]), player, { gmButton: true }), true);
  assert.equal(A.shouldShowBar(entry(["OBSERVER", "OWNER"]), player), false);
  assert.equal(A.shouldShowBar(null, player), false);
});

test("shouldShowBar asks for permissions only when the rule gets that far", () => {
  let asked = 0;
  const e = { documentName: "JournalEntry", flags: {}, pack: "w.p", testUserPermission: () => { asked++; return true; } };
  assert.equal(A.shouldShowBar(e, game.users.get(P1)), false);
  assert.equal(asked, 0, "a pack entry never reaches the permission calls");
});

function pileActor({ canInspectItems } = {}) {
  const actor = makeDoc("Actor", { id: "pileActor0000001", name: "Chest", ownership: { default: 2 },
    flags: { "item-piles": { data: { enabled: true, ...(canInspectItems === undefined ? {} : { canInspectItems }) } } } });
  const real = makeDoc("Item", { id: "realItem00000001", name: "Ring", img: "icons/it's.webp",
    system: { identified: false, unidentified: { description: "<p>A plain ring.</p>" }, description: { value: "<p>secret name</p>" } } },
  { parent: actor });
  Object.defineProperty(actor, "items", { value: new StubCollection([real]), enumerable: false });
  Object.defineProperty(actor, "prototypeToken", { value: { name: "Old Chest" }, enumerable: false });
  return { actor, real };
}

test("itemSource finds the pile's real item behind Item Piles' unparented preview copy", () => {
  const { actor, real } = pileActor();
  game.actors.set(actor.id, actor);
  const preview = makeDoc("Item", { id: real.id, name: "Ring" });
  const src = A.itemSource(preview);
  assert.equal(src.item, real);
  assert.equal(src.pile, actor);
  assert.equal(src.pileName, "Old Chest");
  assert.equal(A.itemSource(makeDoc("Actor", {})), null, "not an item");
  game.actors.delete(actor.id);
});

test("canInspectItems false hides the item bar even for a GM with gmButton", () => {
  const { actor, real } = pileActor({ canInspectItems: false });
  const src = { item: real, pile: actor, pileName: "Chest" };
  assert.equal(A.shouldShowItemBar(src, game.user, { gmButton: true }), false);
  const open = pileActor().actor;
  assert.equal(A.shouldShowItemBar({ item: real, pile: open, pileName: "Chest" }, game.users.get(P1)), true);
});

test("itemDescriptor: unidentified text for everyone; the image path keeps Foundry's escape spelling", () => {
  const { actor, real } = pileActor();
  const d = A.itemDescriptor({ item: real, pile: actor, pileName: "Chest" });
  assert.equal(d.kind, "item");
  assert.equal(d.key, real.uuid);
  assert.match(d.body, /A plain ring/);
  assert.doesNotMatch(d.body, /secret name/);
  const fromFoundry = foundry.utils.escapeHTML("icons/it's.webp");
  assert.ok(d.body.startsWith(`<img class="pj-item-img" src="${fromFoundry}" alt="">`));
  if (fromFoundry !== core.escapeHTML("icons/it's.webp")) {
    assert.notEqual(core.hashOf(d), core.hashOf({ ...d, body: d.body.replace(fromFoundry, core.escapeHTML("icons/it's.webp")) }),
      "swapping the escaper would change the hash (items-journal-32)");
  }
});

test("targetOf dispatches entry, image page, text page and item with the bar's rules", () => {
  const player = game.users.get(P1);
  game.user = player;
  const e = makeDoc("JournalEntry", { id: "readable00000003", ownership: { default: 2 } });
  const img = makeDoc("JournalEntryPage", { type: "image" }, { parent: e });
  const txt = makeDoc("JournalEntryPage", { type: "text" }, { parent: e });
  assert.deepEqual(A.targetOf(e), { kind: "entry", entry: e });
  assert.deepEqual(A.targetOf(img), { kind: "image", entry: e, page: img });
  assert.deepEqual(A.targetOf(txt), { kind: "entry", entry: e });
  assert.equal(A.targetOf(null), null);
  assert.equal(A.targetOf(makeDoc("Actor", {})), null);
  game.user = game.users.get("gmUser0000000001");
  assert.equal(A.targetOf(e), null, "GM without gmButton");
  assert.deepEqual(A.targetOf(e, { gmButton: true }), { kind: "entry", entry: e });
});

test("isEyeReadable: pinned by a Note on some scene", () => {
  const scene = { notes: [{ entryId: "pinned0000000001" }] };
  F.game.scenes = new StubCollection([["s1", scene]].map(([id, s]) => Object.assign(s, { id })));
  assert.equal(A.isEyeReadable({ id: "pinned0000000001" }), true);
  assert.equal(A.isEyeReadable({ id: "loose00000000001" }), false);
});
