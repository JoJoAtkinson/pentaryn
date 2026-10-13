/**
 * senses-EXT-9 (final review 2026-10-12): one owner check, ownerOrWarn(item), guards cast, end,
 * toggle and hood alike. A player who lowers the hood on someone else's hooded lantern is now told
 * why nothing happened ("Only {name}'s owner can do that."), as cast, end and toggle already said;
 * the call still returns false and writes nothing. Hooding a torch (no hood) stays silent.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boot, makeItem, flush, settle, since, standardWorld, ID, GM, PLAYER, LANTERN, LIGHT_SPELL, TORCH, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld();
// the Stake carries a Light, a torch and a hooded lantern the player does not own
const stake = world.actors.find(a => a.id === ID.stake);
for (const d of [{ ...LIGHT_SPELL, id: "itmStakeLight001" }, { ...TORCH, id: "itmStakeTorch001" },
  { ...LANTERN, id: "itmStakeLamp0001", flags: { "pentaryn-senses": { lit: true } } }]) {
  const it = makeItem(d, stake);
  it.collection = stake.items;
  stake.items.set(it.id, it);
}
const F = await boot({ user: PLAYER, others: [GM], world });
await settle(mock);
const L = () => game.pentaryn.senses.light;
const notOwner = _loc("PENTARYN_SENSES.Light.NotOwner", { name: "Stake" });

async function effects(fn) {
  const mark = F.calls.length;
  const value = await fn();
  await flush();
  await settle(mock);
  const calls = since(mark);
  const warns = calls.filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);
  return { value, warns, writes: calls.filter(c => c.op !== "notify").length };
}

test("senses-EXT-9: hood on someone else's hooded lantern warns NotOwner, returns false, writes nothing", async () => {
  const r = await effects(() => L().hood(stake.items.get("itmStakeLamp0001")));
  assert.deepEqual(r, { value: false, warns: [notOwner], writes: 0 });
});

test("senses-EXT-9: cast, end and toggle give the same warning and the same false", async () => {
  const sLight = stake.items.get("itmStakeLight001"), sTorch = stake.items.get("itmStakeTorch001");
  for (const fn of [() => L().cast(sLight, { token: ID.tStake }), () => L().end(sLight), () => L().toggle(sTorch)]) {
    assert.deepEqual(await effects(fn), { value: false, warns: [notOwner], writes: 0 });
  }
});

test("senses-EXT-9: hood on a torch (no hood) stays silent", async () => {
  const r = await effects(() => L().hood(stake.items.get("itmStakeTorch001")));
  assert.deepEqual(r, { value: false, warns: [], writes: 0 });
});

test("senses-EXT-9: the owner warning is written once in light.mjs (ownerOrWarn)", () => {
  const src = readFileSync(new URL("../light.mjs", import.meta.url), "utf8");
  assert.equal(src.split("PENTARYN_SENSES.Light.NotOwner").length - 1, 1);
  assert.equal(src.match(/if \(!ownerOrWarn\(item\)\) return false;/g)?.length, 4, "cast, end, toggle and hood");
});
