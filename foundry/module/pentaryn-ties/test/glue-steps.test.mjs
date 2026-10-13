/**
 * Characterisation (ties checkpoint, wave 3 — guide §3 S2 items 1 and 3): the ready steps fail one at
 * a time and the rest still run, with byte-identical console texts.
 *
 * The publish step is pinned in its J10 [declared] form (de2dad7a, kit 1.0.2): a FROZEN `game.pentaryn`
 * root is no longer rebuilt — the assignment throws, the step runner logs `ready step failed: publish
 * api`, and every later step still runs. (The guide's S2 item 3(b) "replaced by { rules, ties }" was
 * the pre-J10 behaviour; nothing freezes the root since the importer's keystone.)
 *
 * Here: the root is frozen, one actor's legacy-ties migration throws, `Macro.create` throws, a pinned
 * card restores, and `game.socket.on` throws (both registrations warn). Frozen once committed.
 *
 * R8 [declared] (defect wave 2, 2026-10-12): the migration no longer fails the step — it warns once
 * for the refused actor and carries on, so its line is that warning, not "ready step failed".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld } from "./fixtures/world.mjs";
import { serialise } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";

const F = await bootWorld({
  frozenRoot: true,
  settings: { "pentaryn-ties.pinnedCards": [{ sourceId: NPC, tieId: PC, x: 40, y: 60 }] },
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", flags: { world: { ties: [{ id: NPC, word: "old" }] } } },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { ties: [{ id: PC, word: "debtor", stance: -1, strength: 4 }] } } },
  ],
  before: F => {
    const pc = F.game.actors.get(PC);
    Object.defineProperty(pc, "setFlag", { value: async () => { throw new Error("zz setFlag refused"); }, enumerable: false });
    globalThis.Macro = { create: async () => { throw new Error("zz macro refused"); } };
    F.game.socket.on = () => {
      throw new Error("zz socket refused");
    };
  },
});

test("console: one line per failed step, texts byte-identical (the sync socket hook lands while the async steps await)", () => {
  pinJSON("glue-steps-console", F.console, import.meta.url);
  assert.deepEqual(
    F.console.map(c => c.text),
    [
      "pentaryn-ties | reverse-side relay not registered",
      "pentaryn-ties | study conduit not registered",
      "pentaryn-ties | ready step failed: publish api",
      "pentaryn-ties | ZZ Caven: legacy ties migration refused — left for the next load",
      "pentaryn-ties | ready step failed: create macro",
    ]
  );
});

test("J10 [declared]: a frozen root is left as it was — no ties alias, and no throw escapes the ready hook", () => {
  assert.deepEqual(Object.keys(game.pentaryn), ["rules"]);
  assert.ok(Object.isFrozen(game.pentaryn));
  assert.equal(F.console[2].err, "Cannot add property ties, object is not extensible");
  assert.deepEqual(F.hookErrors, []);
});

test("the later steps still ran: icons repaired (none), pinned card restored, macroCreated left unset", () => {
  pinJSON("glue-steps-calls", F.calls, import.meta.url);
  assert.equal(game.settings.get("pentaryn-ties", "macroCreated"), false);
  pinJSON("glue-steps-pinned-card", { layerId: document.body.children[0]?.id ?? null, body: serialise(document.body) }, import.meta.url);
});
