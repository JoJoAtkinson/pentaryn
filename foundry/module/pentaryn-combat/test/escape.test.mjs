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
