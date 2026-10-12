/**
 * Characterisation (senses checkpoint, wave 3): the verbatim oracles in fixtures/legacy-util.mjs —
 * `esc` and `unset` (light.mjs; plan step 2, findings -18, -10), the chain's `-=` literal and the
 * carried prior's null-value delete, the three writer predicates (-17), and the frozen-root publish
 * guard (-34). The refactor's core/util.mjs and the kit's election/publish must match these rows
 * (or differ only by a declared commit). Live equivalents are pinned in the glue files: escaping in
 * light-toggle-escape.json, the `_del` restores in light-*.json, `-=` in chain-break.json.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, unset, chainUnset, priorDelete, isWriter, isGM, anyGM, publish } from "./fixtures/legacy-util.mjs";

test("esc: the five characters, and null/undefined → ''", () => {
  assert.equal(esc('<a href="x">\'&"</a>'), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&quot;&lt;/a&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(0), "0");
  assert.equal(esc("&amp;"), "&amp;amp;", "not idempotent: escapes an entity again");
});

test("unset: `_del` when the global exists (v14), else the '-=' key with null (v13)", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "_del");
  try {
    delete globalThis._del;
    assert.deepEqual(unset("flags.pentaryn-senses.chain"), { "flags.pentaryn-senses.-=chain": null });
    assert.deepEqual(unset("a"), { ".-=a": null }, "a dotless path keeps today's leading dot");
    assert.deepEqual(priorDelete(), null);
    const SENTINEL = { del: true };
    globalThis._del = SENTINEL;
    assert.deepEqual(unset("flags.pentaryn-senses.chain"), { "flags.pentaryn-senses.chain": SENTINEL });
    assert.equal(priorDelete(), SENTINEL);
  } finally {
    if (saved) Object.defineProperty(globalThis, "_del", saved);
    else delete globalThis._del;
  }
  assert.deepEqual(chainUnset("pentaryn-senses", "chain", "t1"), { _id: "t1", "flags.pentaryn-senses.-=chain": null });
});

test("writer predicates over four games: each call site keeps its own truth table", () => {
  const game = ({ activeIsSelf, activeExists, isGM: gm }) => ({
    user: { isGM: gm },
    users: { activeGM: activeExists ? { isSelf: activeIsSelf } : null },
  });
  const games = [
    game({ activeExists: true, activeIsSelf: true, isGM: true }),     // the active GM
    game({ activeExists: true, activeIsSelf: false, isGM: true }),    // a second GM
    game({ activeExists: false, isGM: true }),                        // a GM, nobody active
    game({ activeExists: false, isGM: false }),                       // a player, nobody active
  ];
  assert.deepEqual(games.map(isGM), [true, false, false, false]);
  assert.deepEqual(games.map(isWriter), [true, false, true, false]);
  assert.deepEqual(games.map(anyGM), [true, true, true, false]);
  // a player while a GM is active
  assert.equal(isWriter(game({ activeExists: true, activeIsSelf: false, isGM: false })), false);
});

test("publish guard: no root, an extensible root, a frozen root", () => {
  const api = { a: 1 };
  const g1 = {};
  publish(g1, "senses", api);
  assert.deepEqual(g1.pentaryn, { senses: api });
  const root = { other: 1 };
  const g2 = { pentaryn: root };
  publish(g2, "senses", api);
  assert.equal(g2.pentaryn, root, "assigned in place");
  assert.deepEqual(root, { other: 1, senses: api });
  const frozen = Object.freeze({ other: 1 });
  const g3 = { pentaryn: frozen };
  publish(g3, "senses", api);
  assert.notEqual(g3.pentaryn, frozen, "rebuilt");
  assert.deepEqual(g3.pentaryn, { other: 1, senses: api });
  assert.equal(Object.isExtensible(g3.pentaryn), true);
});

// Added at guide step 2 (findings -18, -10 light half): the runtime helpers in core/util.mjs equal
// the oracles row for row; core/ids.mjs defines MODULE once and FLAGS as full paths.
test("core/util esc and unsetPath equal the oracles; FLAGS are the module's paths", async () => {
  const core = await import("../senses-core.mjs");
  for (const s of ['<a href="x">\'&"</a>', null, undefined, 0, "&amp;", "plain", "Ünïcode <b>"]) assert.equal(core.esc(s), esc(s));
  const saved = Object.getOwnPropertyDescriptor(globalThis, "_del");
  try {
    for (const del of [undefined, { del: true }]) {
      if (del) globalThis._del = del;
      else delete globalThis._del;
      for (const p of ["flags.pentaryn-senses.chain", "flags.pentaryn-senses.spellLight", "a"]) {
        assert.deepEqual(core.unsetPath(p), unset(p));
      }
    }
    const SENTINEL = { s: 1 };
    assert.deepEqual(core.unsetPath("flags.x.y", SENTINEL), { "flags.x.y": SENTINEL }, "an injected deletion wins");
  } finally {
    if (saved) Object.defineProperty(globalThis, "_del", saved);
    else delete globalThis._del;
  }
  assert.equal(core.MODULE, "pentaryn-senses");
  assert.equal(Object.isFrozen(core.FLAGS), true);
  for (const [k, v] of Object.entries(core.FLAGS)) assert.equal(v, `flags.pentaryn-senses.${k}`);
  assert.deepEqual(Object.keys(core.FLAGS), ["light", "lit", "hooded", "lightItem", "lightToggle", "itemLight", "itemLightPrior", "spellLight", "lightCast", "chain"]);
});
