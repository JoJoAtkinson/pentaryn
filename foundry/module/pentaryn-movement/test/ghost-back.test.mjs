// ghostBackKey (finding aoe-movement-portals-42, F-M2): the "ghost is allowed again" toast names why
// it is allowed now. ghostBack (the legacy yes/no) is unchanged and agrees with it.
import * as core from "../movement-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";

const { ghostBack, ghostBackKey, POLICIES } = core;
const BACK = "PENTARYN_MOVEMENT.notify.back.";

test("finding -42's table", () => {
  const rows = [
    [{ cleared: "combat", policy: "exploration", combatActive: false, wish: false }, `${BACK}combat`],
    [{ cleared: "combat", policy: "always", combatActive: true, wish: false }, `${BACK}off`],
    [{ cleared: "off", policy: "always", combatActive: true, wish: false }, `${BACK}off`],
    [{ cleared: "off", policy: "exploration", combatActive: false, wish: false }, `${BACK}off`],
    [{ cleared: "off", policy: "off", combatActive: false, wish: false }, null],
    [{ cleared: null, policy: "always", combatActive: false, wish: false }, null],
    [{ cleared: "combat", policy: "always", combatActive: false, wish: true }, null],
    [{ cleared: "combat", policy: "exploration", combatActive: true, wish: false }, null],
  ];
  for (const [input, want] of rows) assert.equal(ghostBackKey(input), want, JSON.stringify(input));
});

test("ghostBackKey is non-null exactly when ghostBack is true, for every known reason", () => {
  for (const cleared of [null, "combat", "off"]) for (const policy of [...POLICIES, "junk"])
    for (const combatActive of [false, true]) for (const wish of [false, true]) {
      const args = { cleared, policy, combatActive, wish };
      assert.equal(ghostBackKey(args) !== null, ghostBack(args), JSON.stringify(args));
    }
  assert.equal(ghostBackKey(), null);
});

test("every key it returns exists in lang/en.json", () => {
  const lang = readJSON(new URL("../lang/en.json", import.meta.url));
  for (const key of Object.values(core.NOTIFY_BACK)) {
    const v = key.split(".").reduce((o, k) => o?.[k], lang);
    assert.equal(typeof v, "string", key);
  }
});
