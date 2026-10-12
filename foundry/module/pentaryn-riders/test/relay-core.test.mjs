// combat-riders-41: the relay claim's pure rules (core/relay.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";

const { relayClaimWinner, relayPrune, relayRequestId } = await import("../riders-core.mjs");
const NOW = 1_800_000_000_000;

test("relayRequestId: a 16-character Foundry id, else null", () => {
  assert.equal(relayRequestId("relayreq00000001"), "relayreq00000001");
  for (const bad of [undefined, null, "", "short", "relayreq000000012", "relay.req0000001", 42, {}]) assert.equal(relayRequestId(bad), null, String(bad));
});

test("relayClaimWinner: only my stamp fresh → win; another fresh stamp → lose; a stale one is ignored", () => {
  assert.equal(relayClaimWinner({ A: NOW }, "A", NOW), true);
  assert.equal(relayClaimWinner({ A: NOW, B: NOW - 5 }, "A", NOW), false);
  assert.equal(relayClaimWinner({ A: NOW, B: NOW - 120_000 }, "A", NOW), true, "B died mid-claim");
  assert.equal(relayClaimWinner({ B: NOW }, "A", NOW), false, "my stamp has not arrived");
  assert.equal(relayClaimWinner(undefined, "A", NOW), false);
});

test("relayPrune: keep the newest keep-1 others by `at`, delete the rest; the current id is never pruned", () => {
  const entries = Object.fromEntries([1, 2, 3, 4, 5, 6].map(i => [`r${i}`, { at: NOW + i }]));
  assert.deepEqual(relayPrune(entries, "r6", 5), ["r1"]);
  assert.deepEqual(relayPrune(entries, "new", 5).sort(), ["r1", "r2"]);
  assert.deepEqual(relayPrune({ x: {} }, "new", 5), []);
  assert.deepEqual(relayPrune(undefined, "new"), []);
});

test("relayPrune: another request still being claimed (no `at`, a fresh stamp) is never pruned; one whose stamps are all stale is", () => {
  const entries = Object.fromEntries([1, 2, 3, 4, 5].map(i => [`r${i}`, { at: NOW + i }]));
  entries.open = { claims: { A: NOW - 5 } };
  entries.dead = { claims: { B: NOW - 120_000 } };
  assert.deepEqual(relayPrune(entries, "r6", 5, NOW).sort(), ["dead", "r1"]);
  assert.deepEqual(relayPrune(entries, "r6", 5).sort(), ["r1"], "no clock: every open entry is kept");
  assert.deepEqual(relayPrune({ ...entries, r5: { at: NOW + 5, result: {}, claims: { A: NOW } } }, "r6", 5, NOW).sort(), ["dead", "r1"], "a recorded entry is not open");
});
