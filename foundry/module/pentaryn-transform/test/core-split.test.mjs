// Guide step 2: transform-core.mjs is a barrel over core/*. The core/ files never import the barrel
// (a cycle, and C16 allows core → core/* only); every core/* export but the shared UNIT_SECONDS
// table is re-exported; the blueprint constants are the manifest's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as core from "../transform-core.mjs";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const CORE = new URL("../core/", import.meta.url);
const files = readdirSync(CORE).filter(f => f.endsWith(".mjs")).sort();

test("core/ holds constants, wildshape, hud, starry, bodyswap; none imports the barrel or a non-core file", () => {
  assert.deepEqual(files, ["bodyswap.mjs", "constants.mjs", "hud.mjs", "starry.mjs", "wildshape.mjs"]);
  for (const f of files) {
    const src = readFileSync(new URL(f, CORE), "utf8");
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) assert.match(m[1], /^\.\/[a-z]+\.mjs$/, `${f} imports ${m[1]}`);
  }
});

test("every core/* export is re-exported by the barrel (UNIT_SECONDS stays internal)", async () => {
  for (const f of files) {
    const mod = await import(new URL(f, CORE));
    for (const [k, v] of Object.entries(mod)) {
      if (k === "UNIT_SECONDS") continue;
      assert.equal(core[k], v, `${f}: ${k}`);
    }
  }
  assert.equal("UNIT_SECONDS" in core, false);
});

test("blueprint constants: MODULE is the id (MODULE_ID an alias), NS/SHORT transform, VERSION the manifest's", () => {
  const m = manifestOf(ROOT);
  assert.equal(core.MODULE, m.id);
  assert.equal(core.MODULE_ID, core.MODULE);
  assert.equal(core.FLAG_SCOPE, core.MODULE);
  assert.equal(core.VERSION, m.version);
  assert.deepEqual([core.SHORT, core.NS, core.I18N, core.CSS, core.CONTRACT],
    ["transform", "transform", "PENTARYN_TRANSFORM", "ptf-", "pentaryn-transform/api@1"]);
  assert.deepEqual(core.HOOKS, {});
  assert.ok(Object.isFrozen(core.HOOKS));
});
