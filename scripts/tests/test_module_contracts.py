"""transform-creatures-21: pentaryn-transform writes flags.pentaryn-senses.light (STARRY_LIGHT) on the
Starry Form item; pentaryn-senses' carried-light reader (core/light.mjs carriedLightOf) must keep
turning exactly that flag into the token's light. Both cores are pure, so node imports them bare."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TRANSFORM = ROOT / "foundry/module/pentaryn-transform/transform-core.mjs"
SENSES = ROOT / "foundry/module/pentaryn-senses/core/light.mjs"

SCRIPT = """
const t = await import(process.argv[1]);
const s = await import(process.argv[2]);
const flag = light => ({ "pentaryn-senses": { light } });
console.log(JSON.stringify({
  starry: t.STARRY_LIGHT,
  one: s.carriedLightOf([{ id: "sf", system: { quantity: 1 }, flags: flag(t.STARRY_LIGHT) }]),
  feature: s.carriedLightOf([{ id: "sf", system: {}, flags: flag(t.STARRY_LIGHT) }]),
  none: s.carriedLightOf([{ id: "sf", system: { quantity: 1 }, flags: {} }]),
  empty: s.carriedLightOf([{ id: "sf", system: { quantity: 0 }, flags: flag(t.STARRY_LIGHT) }]),
  which: s.lightingItemId([{ id: "torch", system: { quantity: 1 }, flags: flag({ bright: 5, dim: 10 }) },
                           { id: "sf", system: {}, flags: flag(t.STARRY_LIGHT) }]),
}));
"""


@pytest.fixture(scope="module")
def contract():
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    out = subprocess.run([node, "--input-type=module", "-e", SCRIPT, TRANSFORM.as_uri(), SENSES.as_uri()],
                         capture_output=True, text=True, check=True, timeout=30)
    return json.loads(out.stdout)


def test_starry_light_shape_pinned(contract):
    assert contract["starry"] == {"bright": 10, "dim": 20, "color": "#cfe0ff", "alpha": 0.35, "luminosity": 0.5,
                                  "coloration": 1, "animation": {"type": "starlight", "speed": 2, "intensity": 3,
                                                                 "reverse": False}}


def test_senses_lights_the_starry_flag_as_written(contract):
    assert contract["one"] == contract["starry"]
    assert contract["feature"] == contract["starry"], "a feature item has no quantity: it still counts"


def test_no_flag_or_no_quantity_gives_no_light(contract):
    assert contract["none"] is None
    assert contract["empty"] is None


def test_starry_outshines_a_torch(contract):
    assert contract["which"] == "sf"
