// combat-riders-2: renderOffer checks permission and the turn stamp before computing offers (which
// read every canvas token for the ally check); the outcome is unchanged (riders.test pins it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, makeCombat, makeMessage, makeToken, setupWorld } from "./fixtures/world.mjs";
import { rogue, wolf } from "./fixtures/actors.mjs";

const W = await setupWorld();
const { F, doc } = W;
await import("../combat.mjs");
F.fire("init");
F.fire("setup");
const rog = rogue();
const gob = wolf({ id: "goblin0000000009", name: "Goblin" });
const rt = makeToken(rog, { id: "rogTok0000000009" });
const gt = makeToken(gob, { id: "gobTok0000000009", x: 1, disposition: -1 });
makeCombat({ id: "c9", entries: [{ id: "cb9", actor: rog, token: rt }, { id: "cb8", actor: gob, token: gt }] });
let reads = 0;
const placeables = F.canvas.tokens.placeables;
Object.defineProperty(F.canvas.tokens, "placeables", { configurable: true, get() { reads++; return placeables; } });

const act = [...rog.items.get("scimitar00000001").system.activities.values()][0];
const card = (stamp, author = F.game.user) => makeMessage({ type: "attack", author, speaker: { actor: rog.id },
  system: { activity: { uuid: act.uuid, type: "attack" }, targets: [{ token: gt.document.uuid }], origin: { id: "u" } },
  flags: { [MODULE]: { turnKey: stamp } }, rolls: [{ hasAdvantage: true, options: {} }] });
const render = (m) => {
  const li = doc.createElement("li");
  const c = doc.createElement("div");
  c.className = "message-content";
  li.append(c);
  F.Hooks.callAll("dnd5e.renderChatMessage", m, li);
  return li;
};

test("a stale stamp: no row and no canvas read", () => {
  reads = 0;
  assert.equal(render(card("c9:1:old")).querySelector(".pentaryn-combat-riders"), null);
  assert.equal(reads, 0);
});

test("not the owner (a player): no row and no canvas read", () => {
  reads = 0;
  F.become({ userId: "player0000000001" });
  rog.isOwner = false;
  const m = card("c9:1:cb9", F.game.users.get("gmUser0000000001"));
  assert.equal(m.isAuthor, false);
  try {
    assert.equal(render(m).querySelector(".pentaryn-combat-riders"), null);
    assert.equal(reads, 0);
  } finally { rog.isOwner = true; F.become({ userId: "gmUser0000000001" }); }
});

test("this turn's card for the owner: one row with the Sneak Attack button", () => {
  const row = render(card("c9:1:cb9")).querySelector(".pentaryn-combat-riders");
  assert.ok(row);
  assert.equal(row.querySelector("[data-rider]").dataset.rider, "sneak-attack");
});
