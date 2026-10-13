// [declared] aoe-edge-8 (final review 2026-10-12): on a GM tab that is not the active GM, changing
// the tray's area picker did nothing (resolve() refuses there) yet the select kept showing the new
// choice. Now that tab gets a warning toast and the select goes back to the tray's current area;
// the tray itself still renders on every GM tab.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, MODULE, GM_ID } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { root, dispatch } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";

// Another GM, sorted first, comes online after the tray is built: this tab stops being the active GM.
const OTHER = "aaOtherGm0000001";
const { F, W } = await boot({ users: [{ id: OTHER, name: "Other GM", isGM: true, active: false }], entry: true });
const S = await seams();
const ctx = fireball(W, F);
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const CARD = `<div class="message-content"><div class="chat-card">card</div><section class="icon-row">roll</section><damage-application></damage-application></div>`;
const REGIONS = [{ id: IDS.region, name: "A" }, { id: "regionOther00001", name: "B" }];

test("aoe-edge-8: a non-active GM's area pick warns and puts the select back; nothing re-resolves", async () => {
  const msg = damage(W, ctx, { id: "dmgPickerGm00001" });
  await S.resolve.resolve(msg.id);
  const res = resOf(msg.id);
  res.regions = REGIONS;
  game.users.get(OTHER).active = true;
  assert.notEqual(game.users.activeGM.id, GM_ID);

  const host = root(CARD);
  F.fire("dnd5e.renderChatMessage", msg, host);
  const sel = host.querySelector('.pentaryn-aoe-tray [data-pa="region"]');
  assert.ok(sel, "the tray (and its picker) still renders on a non-active GM tab");
  F.calls.length = 0;
  sel.value = "regionOther00001";
  dispatch(sel, "change");
  await flush(8);
  assert.equal(sel.value, IDS.region, "the select shows the area the tray still uses");
  assert.equal(resOf(msg.id).region, IDS.region, "not re-resolved");
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]),
    [["warn", "Only the active GM can change the area."]]);
  game.users.get(OTHER).active = false;
});
