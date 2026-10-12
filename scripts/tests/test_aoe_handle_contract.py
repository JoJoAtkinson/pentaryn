"""The aoe handle contract across modules: pentaryn-aoe owns flags.pentaryn-aoe.handle /
.handleActor, and its shared oracle (pentaryn-aoe/test/fixtures/handle-oracle.json) says what each
hand copy elsewhere must answer. pentaryn-combat's shapes.isAoeHandle (read by
turnflow/helper-token.mjs) implements the `handle` column: the token's own flag only.

portals' isAoeHandle (aoe-movement-portals-43) and creatures' isAoeHandle (transform-creatures-30)
implement the `prop` column: the token's flag OR the actor's handleActor flag, i.e. aoe's
isHandleTarget on the token or on its synthetic actor. All three are run against the same rows.

The Item Piles probes are pinned too, as they differ ON PURPOSE (W3-P1, W4-P1, Joe 2026-10-12: keep
them different; adjustments rows itempiles-aoe-skip-piles / itempiles-portals-pile-pc): aoe's
scene-adapter isPile asks Item Piles' API with the token, else falls back to the flags; portals'
recordOf asks the API with the actor and has no flag fallback; creatures' isItemPile reads the flags
only (its README's contract). The table below is that difference, so a change to any of the three
shows here."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ORACLE = ROOT / "foundry/module/pentaryn-aoe/test/fixtures/handle-oracle.json"
COMBAT = ROOT / "foundry/module/pentaryn-combat/shapes.mjs"
MODS = ROOT / "foundry/module"

SCRIPT = """
const { isAoeHandle } = await import(process.argv[1]);
const { rows } = JSON.parse(await (await import("node:fs/promises")).readFile(process.argv[2], "utf8"));
console.log(JSON.stringify(rows.map(r => ({ name: r.name, want: r.want.handle, got: isAoeHandle(r.token) }))));
"""


@pytest.fixture(scope="module")
def combat_rows():
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    out = subprocess.run([node, "--input-type=module", "-e", SCRIPT, COMBAT.as_uri(), str(ORACLE)],
                         capture_output=True, text=True, check=True, timeout=30)
    return json.loads(out.stdout)


def test_oracle_has_rows_for_both_answers(combat_rows):
    assert len(combat_rows) >= 10
    assert {r["want"] for r in combat_rows} == {True, False}


def test_combat_is_aoe_handle_matches_the_handle_column(combat_rows):
    wrong = [r["name"] for r in combat_rows if r["got"] is not r["want"]]
    assert wrong == [], f"combat shapes.isAoeHandle disagrees with aoe's oracle on: {wrong}"


# ── portals and creatures: the `prop` column (aoe-movement-portals-43, transform-creatures-30) ──

PROP_SCRIPT = """
const [mods, oracle] = process.argv.slice(1);
const { isHandleTarget } = await import(mods + "/pentaryn-aoe/core.mjs");
const portals = await import(mods + "/pentaryn-portals/portals-core.mjs");
const creatures = await import(mods + "/pentaryn-creatures/creatures-core.mjs");
const { rows } = JSON.parse(await (await import("node:fs/promises")).readFile(oracle, "utf8"));
const doc = flags => (flags === null ? {} : { flags });
console.log(JSON.stringify(rows.map(r => {
  const token = doc(r.token), actor = doc(r.actor);
  return { name: r.name, want: r.want.prop,
    aoe: isHandleTarget(token) || isHandleTarget(actor),
    aoeSyntheticActor: isHandleTarget({ ...actor, token }),
    portals: portals.isAoeHandle(r.token ?? undefined, r.actor ?? undefined),
    creatures: creatures.isAoeHandle(r.token ?? undefined, r.actor ?? undefined) };
})));
"""


def _node(script, *args):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    out = subprocess.run([node, "--input-type=module", "-e", script, *map(str, args)],
                         capture_output=True, text=True, check=True, timeout=30, cwd=ROOT)
    return json.loads(out.stdout)


@pytest.fixture(scope="module")
def prop_rows():
    return _node(PROP_SCRIPT, MODS.as_uri(), ORACLE)


@pytest.mark.parametrize("copy", ["aoe", "aoeSyntheticActor", "portals", "creatures"])
def test_every_prop_copy_matches_the_prop_column(prop_rows, copy):
    assert {r["want"] for r in prop_rows} == {True, False}
    wrong = [r["name"] for r in prop_rows if r[copy] is not r["want"]]
    assert wrong == [], f"{copy} disagrees with aoe's oracle `prop` column on: {wrong}"


# ── the Item Piles probes: different on purpose (W3-P1, W4-P1) ────────────────────────────────

PILE_SCRIPT = """
const [mods, rowsJson] = process.argv.slice(1);
const rows = JSON.parse(rowsJson);
globalThis.game = { users: [] };
const aoe = await import(mods + "/pentaryn-aoe/scene-adapter.mjs");
const portals = await import(mods + "/pentaryn-portals/scene-adapter.mjs");
const creatures = await import(mods + "/pentaryn-creatures/creatures-core.mjs");
const enabled = { "item-piles": { data: { enabled: true } } };
console.log(JSON.stringify(rows.map(r => {
  const actor = { id: "a1", name: "Chest", type: "npc", ownership: {}, folder: null, getFlag: () => undefined,
    flags: r.actorFlag ? enabled : {} };
  const token = { id: "t1", name: "Chest", actorLink: false, flags: r.tokenFlag ? enabled : {}, actor };
  const asked = [];
  game.itempiles = r.api === "absent" ? undefined : { API: { isValidItemPile: d => {
    asked.push(d === token ? "token" : d === actor ? "actor" : "other");
    if (r.api === "throws") throw new Error("item piles not ready");
    return r.api === "yes";
  } } };
  const got = { aoe: aoe.isPile(token) };
  got.portals = portals.recordOf(token, { gmIds: [] }).pile;
  got.creatures = creatures.isItemPile(token.flags, actor.flags);
  return { name: r.name, got, asked };
})));
"""

# api: what Item Piles' isValidItemPile answers ("absent" = the module is off)
PILE_ROWS = [
    # name,                                   api,      tokenFlag, actorFlag, aoe,   portals, creatures
    ("off, actor flag",                       "absent", False,     True,      True,  False,   True),
    ("off, token flag",                       "absent", True,      False,     True,  False,   True),
    ("off, no flags",                         "absent", False,     False,     False, False,   False),
    ("API yes, no flags",                     "yes",    False,     False,     True,  True,    False),
    ("API no, flags set",                     "no",     True,      True,      False, False,   True),
    ("API throws, actor flag",                "throws", False,     True,      True,  False,   True),
    ("API throws, no flags",                  "throws", False,     False,     False, False,   False),
]


@pytest.fixture(scope="module")
def pile_rows():
    rows = [{"name": n, "api": api, "tokenFlag": tf, "actorFlag": af} for n, api, tf, af, *_ in PILE_ROWS]
    return {r["name"]: r for r in _node(PILE_SCRIPT, MODS.as_uri(), json.dumps(rows))}


@pytest.mark.parametrize("name,api,token_flag,actor_flag,aoe,portals,creatures", PILE_ROWS)
def test_the_item_piles_probes_differ_as_decided(pile_rows, name, api, token_flag, actor_flag, aoe, portals, creatures):
    assert pile_rows[name]["got"] == {"aoe": aoe, "portals": portals, "creatures": creatures}


def test_aoe_asks_item_piles_with_the_token_and_portals_with_the_actor(pile_rows):
    assert pile_rows["API yes, no flags"]["asked"] == ["token", "actor"]
