"""The senses live golden (scripts/foundry/live-goldens/senses.js) only runs in a live GM tab. These
run it in node offline: the body parses as an async function and skips without the namespace, and
its normaliser maps the random AmbientLight ids a Light answer names (`lightStatus.litBy[].id`,
`inspectCarrier.lightSpells[].litBy[]`) to stable labels, so a before-vs-before self-diff of two
runs is empty (W4L follow-up, context/plans/merge-and-go-live-2026-10-11.md)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

GOLDEN = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens/senses.js"

# The golden's own helpers (ids … tagLitBy), sliced out and driven by two fake runs whose scene,
# token, spell and AmbientLight ids are all different random strings.
NORM_HARNESS = r"""
const src = (await import("node:fs/promises")).readFile(process.argv[1], "utf8");
const body = await src;
const start = body.indexOf("const ids = new Map();"), end = body.indexOf("const caught = e =>");
if (start < 0 || end < start) throw new Error("helper block not found");
const run = new Function("seed", body.slice(start, end) + `
  const r = k => (seed + k).padEnd(16, "x");
  const scene = r("scn"), tok = r("tok"), spell = r("spl"), light = r("amb");
  tag(scene, "scene"); tag(tok, "tok-target"); tag(spell, "spell");
  const lightStatus = { cast: { scene, x: 900, y: 700 }, litBy: [{ kind: "ambient", scene, id: light }] };
  const inspectCarrier = { lightSpells: [{ item: spell, cast: { scene, x: 900, y: 700 },
    litBy: ["Scene." + scene + ".AmbientLight." + light] }] };
  if (typeof tagLitBy === "function") tagLitBy(lightStatus, inspectCarrier);
  return norm({ declared: { lightStatus, inspectCarrier } });`);
console.log(JSON.stringify([run("a"), run("b")]));
"""

PARSE_HARNESS = r"""
const body = await (await import("node:fs/promises")).readFile(process.argv[1], "utf8");
globalThis.game = { modules: new Map(), users: { activeGM: { isSelf: true } }, pentaryn: {},
  world: { id: "zz-stub" }, version: "14.369", system: { id: "dnd5e", version: "6.0.6" } };
game.users.filter = () => [];
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
const ret = await fn();
console.log(JSON.stringify({ type: typeof ret, out: JSON.parse(ret) }));
"""


def node(harness):
    exe = shutil.which("node")
    if not exe:
        pytest.skip("node not on PATH")
    proc = subprocess.run([exe, "--input-type=module", "-e", harness, str(GOLDEN)],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_two_runs_normalise_to_the_same_light_answers():
    a, b = node(NORM_HARNESS)
    assert a == b, "a random AmbientLight id survived normalisation"
    status = a["declared"]["lightStatus"]["litBy"][0]
    assert status["id"] == "<lit-0>" and status["scene"] == "<scene>"
    assert a["declared"]["inspectCarrier"]["lightSpells"][0]["litBy"] == ["Scene.<scene>.AmbientLight.<lit-0>"]


def test_the_body_parses_and_skips_without_the_namespace():
    r = node(PARSE_HARNESS)
    assert r["type"] == "string"
    assert r["out"]["module"] == "senses"
    assert r["out"]["skipped"] == "game.pentaryn.senses is missing"
