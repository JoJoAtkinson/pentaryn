// combat-riders-33 [declared D-c3]: rider dice and keys interpolated into chat-card HTML are escaped.
// Normal values render as before (riders.test's goldens are unchanged); crafted markup is text.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, makeMessage, setupWorld } from "./fixtures/world.mjs";
import { rogue } from "./fixtures/actors.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F, doc } = W;
await import("../combat.mjs");
F.fire("init");
F.fire("setup");

const rog = rogue();
function render(message) {
  const li = doc.createElement("li");
  const content = doc.createElement("div");
  content.className = "message-content";
  content.innerHTML = `<section class="icon-row">x</section>`;
  li.append(content);
  doc.body.append(li);
  F.Hooks.callAll("dnd5e.renderChatMessage", message, li);
  return li;
}

test("the auto note escapes a crafted dice string and key; a normal one is unchanged", () => {
  const evil = '<img src=x onerror=alert(1)>';
  const msg = makeMessage({ type: "damage", speaker: { actor: rog.id }, author: F.game.user, rolls: [],
    flags: { [MODULE]: { auto: [{ key: 'sneak-attack" onmouseover="x', dice: evil, attack: "atk1" }] } } });
  const html = render(msg).querySelector(".pentaryn-combat-auto").innerHTML;
  assert.equal(html.includes("<img"), false, html);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"), html);
  const ok = makeMessage({ type: "damage", speaker: { actor: rog.id }, author: F.game.user, rolls: [],
    flags: { [MODULE]: { auto: [{ key: "sneak-attack", dice: "3d6", attack: "atk2" }] } } });
  assert.ok(render(ok).querySelector(".pentaryn-combat-auto").innerHTML.includes("+ Sneak Attack 3d6"));
});

test("an unknown rider key with markup is text in the note's name, live and Undone", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const live = makeMessage({ type: "damage", speaker: { actor: rog.id }, author: F.game.user, rolls: [],
    flags: { [MODULE]: { auto: [{ key: evil, dice: "3d6", attack: "atk3" }] } } });
  const a = render(live).querySelector(".pentaryn-combat-auto");
  assert.equal(a.innerHTML.includes("<img"), false, a.innerHTML);
  assert.equal(a.querySelector("img"), null);
  const undone = makeMessage({ type: "damage", speaker: { actor: rog.id }, author: F.game.user, rolls: [],
    flags: { [MODULE]: { auto: [{ key: evil, dice: "3d6", attack: "atk4" }], undone: [evil] } } });
  const b = render(undone).querySelector(".pentaryn-combat-auto");
  assert.equal(b.innerHTML.includes("<img"), false, b.innerHTML);
  assert.equal(b.querySelector("img"), null);
});

test("the live Undo button's data-undo carries a crafted key as one attribute value, read back unchanged", async () => {
  const { combatContext } = await import("../shapes.mjs");
  const key = 'sneak-attack" onmouseover="alert(1)';
  rog.flags[MODULE] = { turn: { key: combatContext(rog).key, riders: { [key]: "auto:atk5" } } };
  try {
    const msg = makeMessage({ type: "damage", speaker: { actor: rog.id }, author: F.game.user, rolls: [],
      flags: { [MODULE]: { auto: [{ key, dice: "3d6", attack: "atk5" }] } } });
    const btn = render(msg).querySelector(".pentaryn-combat-auto [data-undo]");
    assert.ok(btn, "the live branch renders the Undo button");
    assert.equal(btn.getAttribute("onmouseover"), null);
    assert.equal(btn.dataset.undo, key);
  } finally { delete rog.flags[MODULE]; }
});
