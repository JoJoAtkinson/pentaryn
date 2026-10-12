// Standalone audit findings landed after the structural refactor (guide §4), each with the test
// its finding asks for. The S1 pins they must keep are in the frozen files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, out, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ctx = fireball(W, F);

/* ── -2: the handle actor is looked up once per resolve, not once per token ─────────────────── */

test("-2 describeToken(token, { handleActorId }) equals the default and scans nothing", () => {
  const handleActor = game.actors.find(a => a.flags?.[MODULE]?.handleActor);
  const toks = [IDS.g1, IDS.cv, IDS.handle, IDS.pile].map(id => ctx.s.tokens.get(id));
  const find = game.actors.find.bind(game.actors);
  let n = 0;
  game.actors.find = fn => { n++; return find(fn); };
  const given = toks.map(t => R.describeToken(t, { handleActorId: handleActor.id }));
  assert.equal(n, 0);
  const none = toks.map(t => R.describeToken(t, { handleActorId: null }));
  assert.equal(n, 0);
  game.actors.find = find;
  assert.deepEqual(given, toks.map(t => R.describeToken(t)));
  assert.deepEqual(none.map(d => d.isHandleActor), [false, false, true, false], "no handle actor: only the flagged actor counts");
});

test("-2 resolve() scans game.actors for the handle actor once for the whole area", async () => {
  const msg = damage(W, ctx, { id: "dmgFinding000002" });
  const find = game.actors.find.bind(game.actors);
  let n = 0;
  game.actors.find = fn => { n++; return find(fn); };
  await R.resolve(msg.id);
  game.actors.find = find;
  assert.equal(n, 1);
  assert.equal(msg.flags[MODULE].resolution.rows.length, 6);
});
