// lookup-edge-5: monsters()' `cr` filter reads the separators and the `CR` prefix a GM types, and a
// `cr` that still names no bound answers unfiltered with a warning instead of silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";
import { monsterQuery } from "../lookup-core.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

const bounds = cr => { const q = monsterQuery({ cr }); return [q.lo, q.hi]; };

test("lookup-edge-5: en-dash, em-dash and ' to ' separate a CR range like '-'", () => {
  for (const cr of ["1/2-2", "1/2 – 2", "1/2—2", "1/2 to 2", "1/2 TO 2"]) {
    assert.deepEqual(bounds(cr), [0.5, 2], cr);
    assert.equal(monsterQuery({ cr }).warning, undefined, cr);
  }
});

test("lookup-edge-5: a leading CR / cr on either value is read", () => {
  assert.deepEqual(bounds("CR 3"), [3, 3]);
  assert.deepEqual(bounds("cr1/4"), [0.25, 0.25]);
  assert.deepEqual(bounds("CR 1/2 - CR 2"), [0.5, 2]);
  assert.deepEqual(bounds("CR1 to cr5"), [1, 5]);
});

test("lookup-edge-5: an unparseable cr warns and applies no CR filter", () => {
  for (const cr of ["banana", "CR", "three", "1/2 ~ 2"]) {
    const q = monsterQuery({ cr });
    assert.deepEqual([q.lo, q.hi], [null, null], cr);
    assert.equal(q.warning, `cr not understood: ${cr} — use '3', '1/4' or '1/2-2'`);
  }
  assert.equal(monsterQuery({ cr: "" }).warning, undefined);
  assert.equal(monsterQuery({ cr: 3 }).warning, undefined);
});

test("lookup-edge-5: the cr warning joins the packs warning", () => {
  assert.equal(monsterQuery({ cr: "x", packs: 5 }).warning,
    "packs ignored: expected a pack id or an array; cr not understood: x — use '3', '1/4' or '1/2-2'");
});

test("lookup-edge-5: monsters({cr: 'banana'}) answers the unfiltered list with the warning", async () => {
  const out = await rules.monsters({ cr: "banana" });
  const plain = await rules.monsters({});
  assert.equal(out.warning, "cr not understood: banana — use '3', '1/4' or '1/2-2'");
  assert.deepEqual({ ...out, warning: undefined }, { ...plain, warning: undefined });
});

test("lookup-edge-5: monsters({cr: 'CR 1/2 to 2'}) equals monsters({cr: '1/2-2'})", async () => {
  assert.deepEqual(await rules.monsters({ cr: "CR 1/2 to 2" }), await rules.monsters({ cr: "1/2-2" }));
});
