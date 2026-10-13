/**
 * ties-core-U1 [declared] (final review ties-core, 2026-10-12; defect wave 2): two GM tabs at the
 * world's first ready (the MCP bridge and a GM browser) both reach `ensureMacro` before either sees
 * the other's write — `macroCreated` is still false and `game.macros.getName` finds nothing — and
 * both created a *Ties Web* macro, so the world got two. The macro is now created with the fixed id
 * `pentarynTiesWeb0` and `{ keepId: true }` (the pattern pentaryn-aoe's handle actor uses): v14 does
 * not refuse a world document whose id exists, the later create replaces the record with the same
 * data, and one macro results. The `macroCreated` write stays.
 *
 * Modelled here: a server store keyed by id (keepId keeps the given `_id`, otherwise a fresh id), the
 * first tab's ready at boot, then the second tab's ready (a hot re-import of the entry) with the stale
 * view it had before the first tab's writes landed. Pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const server = new Map();
const creates = [];
let fresh = 0;

const F = await bootWorld({
  before: F => {
    globalThis.Macro = {
      create: async (data, options) => {
        creates.push({ data: F.plain(data), options: options ?? null });
        const id = options?.keepId && data._id ? data._id : `zzMacro${String(++fresh).padStart(9, "0")}`;
        server.set(id, { ...data, _id: id });   // a world document: an existing id is replaced, not refused
        return server.get(id);
      }
    };
  },
});

test("ties-core-U1: the first tab creates the macro with the fixed id and keepId, and sets macroCreated", () => {
  assert.equal(creates.length, 1);
  assert.equal(creates[0].data._id, "pentarynTiesWeb0");
  assert.deepEqual(creates[0].options, { keepId: true });
  assert.equal(game.settings.get("pentaryn-ties", "macroCreated"), true);
});

test("ties-core-U1: a second GM tab racing the first lands on the same record — one macro, not two", async () => {
  // the second tab's view: neither the setting write nor the macro had reached it yet
  await game.settings.set("pentaryn-ties", "macroCreated", false);
  F.game.macros = { getName: () => null };
  game.pentaryn.ties.uninstall();
  await import("../pentaryn-ties.mjs?tab=2");
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  assert.equal(creates.length, 2, "both tabs create; neither is refused");
  assert.deepEqual(creates[0].data, creates[1].data, "the same data, so the replace changes nothing");
  assert.deepEqual([...server.keys()], ["pentarynTiesWeb0"], "one Ties Web macro in the world");
  assert.equal(game.settings.get("pentaryn-ties", "macroCreated"), true);
});
