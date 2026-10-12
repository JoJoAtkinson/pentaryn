/**
 * AC-2 (final review 2026-10-12, ties-study): the attribute-belief ledger is one world setting
 * rewritten WHOLE. Two GM tabs (one GM signed in twice) each hold their own copy, so a tab whose
 * write lands a moment after ours rewrites the setting from a copy that never had our row — and our
 * finished row is gone. `putBelief` now confirms like the claim protocol: after its write it waits,
 * re-reads the live setting and, when its row is missing or different, re-applies the same
 * single-row upsert once on the fresh value, so both tabs' rows end up in the ledger.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

await bootWorld({});
const Apply = await import("../study/apply.mjs");
const { ATTR_BELIEFS_SETTING } = await import("../known-core.mjs");
const MODULE = "pentaryn-ties";
const fact = id => ({ ns: "attr", factKey: `attr:guild:${id}` });

/** The other tab: right after our write lands, it writes its stale copy plus its own row. */
async function withOtherTab(otherWrite, fn) {
  const set = game.settings.set.bind(game.settings);
  let fired = false;
  game.settings.set = async (mod, key, value) => {
    if (fired || mod !== MODULE || key !== ATTR_BELIEFS_SETTING) return set(mod, key, value);
    fired = true;
    const stale = structuredClone(game.settings.get(MODULE, ATTR_BELIEFS_SETTING) ?? {});
    const out = await set(mod, key, value);
    await set(MODULE, ATTR_BELIEFS_SETTING, otherWrite(stale));
    return out;
  };
  try {
    return await fn();
  } finally {
    game.settings.set = set;
  }
}

const row = (text, when) => ({ text, tier: null, total: 14, when, delivered: when, claim: null, sources: null });

test("AC-2: a second GM tab's whole-setting write does not revert our finished row", async () => {
  const theirs = `${fact("r9").factKey}:pc9`;
  await withOtherTab(
    stale => ({ ...stale, [theirs]: row("theirs", 9) }),
    () => settle(Apply.putBelief(fact("r1"), "pc1", { text: "ours", total: 15, when: 1, delivered: 1 }))
  );
  assert.equal(Apply.readBelief(fact("r1"), "pc1")?.text, "ours", "our row survives the other tab's write");
  assert.equal(Apply.readBelief(fact("r9"), "pc9")?.text, "theirs", "and theirs is kept too");
});

test("AC-2: a reset (row deleted) is not revived by a second tab's stale copy", async () => {
  await settle(Apply.putBelief(fact("r2"), "pc2", { text: "old", total: 12, when: 2, delivered: 2 }));
  const theirs = `${fact("r8").factKey}:pc8`;
  await withOtherTab(
    stale => ({ ...stale, [theirs]: row("theirs", 8) }),
    () => settle(Apply.putBelief(fact("r2"), "pc2", null))
  );
  assert.equal(Apply.readBelief(fact("r2"), "pc2"), null, "the reset stays reset");
  assert.equal(Apply.readBelief(fact("r8"), "pc8")?.text, "theirs");
});

test("AC-2: an uncontested write is written once (the confirm costs a read, not a write)", async () => {
  const set = game.settings.set.bind(game.settings);
  let writes = 0;
  game.settings.set = async (...args) => {
    if (args[1] === ATTR_BELIEFS_SETTING) writes++;
    return set(...args);
  };
  try {
    await settle(Apply.putBelief(fact("r3"), "pc3", { text: "solo", total: 11, when: 3, delivered: 3 }));
  } finally {
    game.settings.set = set;
  }
  assert.equal(writes, 1);
  assert.equal(Apply.readBelief(fact("r3"), "pc3")?.text, "solo");
});
