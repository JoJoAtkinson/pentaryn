// [declared] aoe-perf-2: under noSpellStacking, onPreCreateEffect looked up the spell (spellOf →
// fromUuidSync on duplicateSource and origin) for EVERY effect on the actor before
// sameSpellEffect's cheap name/disabled test threw most of them away. It now filters the actor's
// effects by id, disabled and name first and resolves the spell only for the survivors: the same
// replacement, fewer uuid lookups on every effect creation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, MODULE, GM_ID } from "./fixtures/world.mjs";

const { F, W } = await boot({ entry: true });
await game.settings.set(MODULE, "noSpellStacking", true);

const actor = W.actor({ id: "actStackPerf0001", name: "Stacker", type: "character" });
const spellItem = (id, name, ident) => W.item({ id, name, system: { identifier: ident } }, actor);
const fx = (item, id, name) => {
  const e = W.effect(null, { id, name });
  Object.defineProperty(e, "parent", { value: item });
  W.register(e.uuid, e);
  return e;
};
const shield = spellItem("itemPerfShield01", "Shield", "shield");
const ring = spellItem("itemPerfRing0001", "Shield", "shield");
const shieldFx = fx(shield, "effPerfShield001", "Shield");
const ringFx = fx(ring, "effPerfRing00001", "Shield");

test("aoe-perf-2: only same-named, enabled effects have their spell looked up; the old Shield is still replaced", async () => {
  const old = W.effect(actor, { name: "Shield", _stats: { duplicateSource: shieldFx.uuid } });
  // Ten unrelated effects (different names) and one disabled Shield: none can match.
  for (let i = 0; i < 10; i++) {
    const other = spellItem(`itemPerfOther${String(i).padStart(3, "0")}`, `Other ${i}`, `other-${i}`);
    const otherFx = fx(other, `effPerfOther${String(i).padStart(4, "0")}`, `Other ${i}`);
    W.effect(actor, { name: `Other ${i}`, _stats: { duplicateSource: otherFx.uuid }, origin: other.uuid });
  }
  W.effect(actor, { name: "Shield", disabled: true, _stats: { duplicateSource: shieldFx.uuid }, origin: shield.uuid });
  const incoming = W.effect(null, { name: "Shield", _stats: { duplicateSource: ringFx.uuid } });
  Object.defineProperty(incoming, "parent", { value: actor });

  F.calls.length = 0;
  F.uuidReads = 0;
  F.fire("preCreateActiveEffect", incoming, {}, {}, GM_ID);
  await flush();
  // the incoming effect's own source (1) + the one enabled same-named Shield's source (1)
  assert.equal(F.uuidReads, 2, `uuid lookups: ${F.uuidReads}`);
  assert.deepEqual(F.calls.filter(c => c.op === "delete").map(c => c.uuid), [old.uuid]);
});
