"""Every live golden (scripts/foundry/live-goldens/*.js) is an eval-js body that only ever runs in a
live GM tab, and most have no offline test. This compiles each body as an async function in node
(compile only, never called), so a syntax slip shows up here rather than at the table, and pins the
shape every body shares: it ends `return JSON.stringify(out);` and reports `module: "<its stem>"`."""
import shutil
import subprocess
from pathlib import Path

import pytest

GOLDENS = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"
BODIES = sorted(GOLDENS.glob("*.js"))

COMPILE = r"""
const body = require("node:fs").readFileSync(process.argv[1], "utf8");
new (Object.getPrototypeOf(async function () {}).constructor)(body);
"""


@pytest.mark.parametrize("path", BODIES, ids=[p.stem for p in BODIES])
def test_golden_body_compiles(path):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    proc = subprocess.run([node, "-e", COMPILE, str(path)], capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr


@pytest.mark.parametrize("path", BODIES, ids=[p.stem for p in BODIES])
def test_golden_returns_its_json_string(path):
    text = path.read_text(encoding="utf-8")
    last = [line for line in text.splitlines() if line.strip()][-1]
    assert last.strip() == "return JSON.stringify(out);"
    assert f'module: "{path.stem}"' in text
