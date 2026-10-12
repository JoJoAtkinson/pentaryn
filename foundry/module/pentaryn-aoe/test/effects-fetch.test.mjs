// -14: a fresh usage card resolves its effects once per render (selfReason and the highlight share
// the list); a settled card fetches nothing; the re-check after the auto-apply grace fetches fresh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, PLAYER_ID } from "./fixtures/world.mjs";
import { root } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const caster = W.actor({ id: "actFetchCaster01", name: "Caster", type: "character", ownership: { default: 0, [PLAYER_ID]: 3 } });
const ally = W.actor({ id: "actFetchAlly0001", name: "Ally", type: "character" });
const spell = W.item({ id: "itemFetchSpell01", name: "Bless", system: { identifier: "bless" } }, caster);
const fx = W.effect(null, { id: "effFetch00000001", name: "Bless", type: "base" });
Object.defineProperty(fx, "parent", { value: spell });
W.register(fx.uuid, fx);

let fetches = 0;
const card = ({ age = 0, targets = [{ actor: ally.uuid }] } = {}) => W.message({
  type: "usage", author: PLAYER_ID, timestamp: Date.now() - age,
  system: { effects: [fx.uuid], targets, activity: { type: "utility" }, getEffects: async () => { fetches++; return [fx]; } },
  actor: caster, item: spell, activity: { type: "utility", target: { affects: { type: "creature" } }, range: { units: "touch" } },
});
const TRAY = `<div class="chat-card">c</div><effect-application><ul></ul></effect-application>`;
const render = m => {
  const host = root(TRAY);
  F.fire("dnd5e.renderChatMessage", m, host);
  return host.querySelector("effect-application");
};

test("-14 a fresh card (inside the auto-apply grace) lights up after ONE effects fetch (was two)", async () => {
  fetches = 0;
  const tray = render(card());
  await flush(8);
  assert.equal(tray.className, "pentaryn-aoe-unapplied");
  assert.equal(fetches, 1);
});

test("-14 a card past the grace: one fetch; a settled card (over an hour): none", async () => {
  fetches = 0;
  render(card({ age: 60 * 1000 }));
  await flush(8);
  assert.equal(fetches, 1);
  fetches = 0;
  const old = render(card({ age: 2 * 3600 * 1000 }));
  await flush(8);
  assert.equal(fetches, 0);
  assert.equal(old.className, "");
});

test("-14 pendingFor(message, { effects }) uses the list it is given and fetches nothing", async () => {
  fetches = 0;
  const m = card();
  assert.deepEqual(await S.effects.pendingFor(m, { effects: [fx] }), [fx.id]);
  assert.equal(fetches, 0);
  assert.deepEqual(await S.effects.pendingFor(m), [fx.id]);
  assert.equal(fetches, 1);
});

test("-14 a self-cast card waiting for its auto-apply re-checks with a fresh fetch after the grace", async () => {
  await game.settings.set("pentaryn-aoe", "autoApplySelf", true);
  const m = card({ targets: [] });   // untargeted touch spell → untargeted-self: an auto apply is due
  game.messages.set(m.id, m);
  m.getAssociatedActor = () => caster;
  m.getAssociatedActivity = () => ({ type: "utility", target: { affects: { type: "creature" } }, range: { units: "touch" } });
  fetches = 0;
  const tray = render(m);
  await flush(8);
  assert.equal(fetches, 1, "one fetch for the render");
  assert.equal(tray.className, "", "not lit while the auto apply is due");
  await advance(15 * 1000 + 300);
  assert.equal(fetches, 2, "the re-check fetches fresh");
});
