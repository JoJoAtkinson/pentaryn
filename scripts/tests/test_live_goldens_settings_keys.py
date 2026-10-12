"""EXT-4: portals.js and creatures.js name their setting keys once, in a local SETTINGS list.

Both goldens spelled every setting key out twice by hand — once for `out.env.settings`, once for
the `settingsRestored` comparison in cleanup — so adding a key to one and not the other made
`settingsRestored` false on a healthy run. Each now has `const SETTINGS = [...]` and builds both
from `Object.fromEntries(SETTINGS.map(k => [k, setting(k)]))`. Key order is kept, so env.settings
holds the same bytes as before. Run offline in node on the real source: the SETTINGS line and both
build sites are cut out of each file and evaluated against a stub `setting`.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

LG = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"
BUILD = "Object.fromEntries(SETTINGS.map(k => [k, setting(k)]))"
CASES = {
    "portals.js": ["teleportDefault", "spreadArrivals", "confirmPartyTeleport"],
    "creatures.js": ["lightRadius", "ownerSees", "floatOverHud", "showStrip"],
}


def _text(name):
    return (LG / name).read_text(encoding="utf-8")


@pytest.mark.parametrize("name", sorted(CASES))
def test_ext4_settings_keys_named_once(name):
    text = _text(name)
    m = re.search(r"^const SETTINGS = (\[.*\]);$", text, re.M)
    assert m, f"EXT-4: {name} has no local `const SETTINGS = [...]`"
    assert json.loads(m.group(1)) == CASES[name], f"EXT-4: {name} SETTINGS changed key order"
    env = re.search(r"^\s*settings: (.*?),?$", text, re.M)
    assert env and env.group(1) == BUILD, f"EXT-4: {name} env.settings is not built from SETTINGS"
    restored = re.search(r"^\s*settingsRestored: JSON\.stringify\((.*)\) === JSON\.stringify\(out\.env\.settings\)$", text, re.M)
    assert restored and restored.group(1) == BUILD, f"EXT-4: {name} settingsRestored is not built from SETTINGS"
    for key in CASES[name]:
        assert text.count(f'setting("{key}")') == 0, f"EXT-4: {name} still spells {key} out by hand"


@pytest.mark.skipif(not shutil.which("node"), reason="node not installed")
@pytest.mark.parametrize("name", sorted(CASES))
def test_ext4_env_and_restored_bytes(name):
    text = _text(name)
    line = re.search(r"^const SETTINGS = .*$", text, re.M)
    assert line, f"EXT-4: {name} has no local `const SETTINGS = [...]`"
    keys = CASES[name]
    legacy = "{ " + ", ".join(f'{k}: setting("{k}")' for k in keys) + " }"
    js = f"""
const setting = k => k === "{keys[0]}" ? {{ v: 1, k }} : "unregistered";
{line.group(0)}
const env = {BUILD};
const restored = JSON.stringify({BUILD}) === JSON.stringify(env);
console.log(JSON.stringify({{ env: JSON.stringify(env), legacy: JSON.stringify({legacy}), restored }}));
"""
    res = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
    assert res["env"] == res["legacy"], f"EXT-4: {name} env.settings bytes changed"
    assert res["restored"] is True
