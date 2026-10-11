/**
 * ties-39: the one claim protocol, `stakeAndConfirm` (study/claim.mjs), with an injected immediate
 * sleep — and the three claims that now stake through it, driven against fake documents so the exact
 * update payloads stay pinned (the conduit suites prove the same calls end to end on mock timers).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

await bootWorld({ importEntry: false });
const { stakeAndConfirm, claimFact, claimInspect } = await import("../study/claim.mjs");

const order = [];
const now = () => Promise.resolve();

test("stakeAndConfirm: read-back equal to the token → true; different → false", async () => {
  assert.equal(await stakeAndConfirm({ write: now, readBack: () => "me", token: "me", sleep: now }), true);
  assert.equal(await stakeAndConfirm({ write: now, readBack: () => "them", token: "me", sleep: now }), false);
  assert.equal(await stakeAndConfirm({ write: now, readBack: () => undefined, token: "me", sleep: now }), false);
});

test("stakeAndConfirm: write once, then the settle wait (250 ms by default), then the read-back", async () => {
  order.length = 0;
  const ok = await stakeAndConfirm({
    write: async () => order.push("write"),
    readBack: () => (order.push("read"), "t"),
    token: "t",
    sleep: async ms => order.push(`sleep ${ms}`),
  });
  assert.equal(ok, true);
  assert.deepEqual(order, ["write", "sleep 250", "read"]);
});

test("stakeAndConfirm: the default sleep is the global timer (mock.timers drives it)", async () => {
  const p = stakeAndConfirm({ write: now, readBack: () => 1, token: 1 });
  const done = await settle(p);
  assert.equal(done, true);
});

const ledger = (flags = {}) => {
  const doc = {
    id: "zzNpc00000000001",
    flags: { "pentaryn-ties": flags },
    calls: [],
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async update(data, opts) {
      this.calls.push({ data: structuredClone(data), opts });
      for (const [path, v] of Object.entries(data)) foundry.utils.setProperty(this, path, v);
    },
  };
  return doc;
};

test("claimRoll (via claimFact, flag plane): the update payload is the literal it always wrote", async () => {
  const doc = ledger();
  const won = await settle(claimFact({ ns: "kind", ledger: doc, beliefKey: "kind" }, "zzPc000000000001", 1234));
  assert.equal(won, true);
  assert.equal(doc.calls.length, 1);
  const [path] = Object.keys(doc.calls[0].data);
  assert.equal(path, "flags.pentaryn-ties.beliefs.zzPc000000000001.kind");
  assert.deepEqual(Object.keys(doc.calls[0].data[path]), ["claim", "when"]);
  assert.equal(doc.calls[0].data[path].when, 1234);
  assert.deepEqual(doc.calls[0].opts, { render: false });
});

test("claimRoll loses when another session's stake landed last", async () => {
  const doc = ledger();
  const update = doc.update.bind(doc);
  doc.update = async (data, opts) => {
    await update(data, opts);
    doc.flags["pentaryn-ties"].beliefs.zzPc000000000001.kind.claim = "other-session";
  };
  assert.equal(await settle(claimFact({ ns: "kind", ledger: doc, beliefKey: "kind" }, "zzPc000000000001", 1)), false);
});

test("claimInspect: returns its token when it wins, null when it loses; payload { claim } with render:false", async () => {
  const doc = ledger();
  const token = await settle(claimInspect(doc, "zzPc000000000001"));
  assert.equal(typeof token, "string");
  assert.deepEqual(doc.calls[0], { data: { "flags.pentaryn-ties.beliefs.zzPc000000000001.#inspect": { claim: token } }, opts: { render: false } });
  const lost = ledger();
  const update = lost.update.bind(lost);
  lost.update = async (data, opts) => {
    await update(data, opts);
    lost.flags["pentaryn-ties"].beliefs.zzPc000000000001["#inspect"].claim = "other";
  };
  assert.equal(await settle(claimInspect(lost, "zzPc000000000001")), null);
});
