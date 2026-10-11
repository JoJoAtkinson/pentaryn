/**
 * Characterisation (ties checkpoint, wave 1): `study.inspect` through the published path on a
 * PLAYER client — the kill-switch and the no-GM refusal. Frozen once committed; D1 / B1b [declared]
 * moved the calls to the new name, `study.examine` (same golden).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot } from "./fixtures/boot.mjs";

// a player, and no GM in the world: users.activeGM is null
const F = await boot({ user: { id: "zzPlayerUser0001", name: "ZZ Player", isGM: false } });
const T = () => game.pentaryn.ties;
const pc = { id: "zzPc000000000001", isOwner: true, inCombat: false };
const subject = { id: "zzNpc00000000001" };

test("study.inspect as a player", async () => {
  const rows = [];
  const run = async (label, fn) => {
    const before = F.calls.length;
    const out = await fn();
    rows.push({ label, out, calls: F.calls.slice(before) });
  };
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  await run("playerAccess off", () => T().study.examine(pc, subject));
  await game.settings.set("pentaryn-ties", "playerAccess", true);
  await run("not the owner", () => T().study.examine({ ...pc, isOwner: false }, subject));
  await run("no subject", () => T().study.examine(pc, null));
  await run("no GM connected", () => T().study.examine(pc, subject));
  pinJSON("study-inspect-player", rows, import.meta.url);
  assert.equal(rows.at(-1).out, false);
});
