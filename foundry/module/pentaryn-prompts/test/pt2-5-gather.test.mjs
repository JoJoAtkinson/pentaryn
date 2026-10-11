/**
 * Play-test fixes (wave 1 play test, 2026-10-11, context/plans/addon-blueprint-2026-10/wave-1-playtest.md),
 * fixed on fix/playtest-2026-10-11.
 * - PT2-5: gather printed the same description block for every unlinked token of one actor. It is
 *   printed once per actor; later tokens point at the first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildView, renderGather } from "../geometry-core.mjs";
import * as F from "./fixtures.mjs";

/* ── PT2-5: one description per actor ─────────────────────────────────── */

const BIO = "Hunched, ash-daubed, never meets the boss's eye. Casts with bone dice and lies about what they show.";

function goblinBoard({ secondBio = BIO } = {}) {
  const tok = (key, j, bio) => {
    const t = F.built(key, j, 2, { name: "Goblin", description: bio });
    t.actorId = "zzActorGoblin001";
    return t;
  };
  const items = [F.prompt("p", "mid", 2, 2, "goblins at the gate"), tok("g1", 4, BIO), tok("g2", 5, secondBio), tok("g3", 6, BIO)];
  return buildView([F.sceneOf("c", "Gate", items, [])]).view;
}

test("PT2-5: unlinked tokens of one actor print its description once, later ones point at the first", () => {
  const view = goblinBoard();
  const lines = renderGather(view).split("\n").filter(l => l.startsWith("Description: "));
  const ids = Object.values(view.built).map(t => t.id);
  assert.deepEqual(lines, [`Description: ${BIO}`, `Description: same as ${ids[0]} "Goblin"`, `Description: same as ${ids[0]} "Goblin"`]);
});

test("PT2-5: a token whose description differs from its actor's first one prints its own", () => {
  const other = "This one wears the chief's ear on a string.";
  const lines = renderGather(goblinBoard({ secondBio: other })).split("\n").filter(l => l.startsWith("Description: "));
  assert.equal(lines.length, 3);
  assert.equal(lines.filter(l => l === `Description: ${BIO}`).length, 1);
  assert.ok(lines.includes(`Description: ${other}`), lines.join("\n"));
});

test("PT2-5: built things without an actor id are never folded together", () => {
  const items = [F.prompt("p", "mid", 2, 2, "x"), F.built("a", 4, 2, { name: "Board", kind: "note", docName: "Note", description: BIO }),
    F.built("b", 6, 2, { name: "Board", kind: "note", docName: "Note", description: BIO })];
  const lines = renderGather(buildView([F.sceneOf("c", "Gate", items, [])]).view).split("\n").filter(l => l.startsWith("Description: "));
  assert.deepEqual(lines, [`Description: ${BIO}`, `Description: ${BIO}`]);
});
