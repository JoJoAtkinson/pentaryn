"""The cursor build tool and its icon sources, outside the module (cursors guide step 7).

`build.mjs --check-sources` proves every KEYS source exists and every extreme is known without
@resvg; a copy of build.mjs over a stub @resvg pins write-nothing-on-failure; the credits check is
finding -35's recipe: every credited alternate (`src/alt-*.svg`) is named in `src/CREDITS.md`.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
TOOL = REPO / "scripts" / "foundry" / "cursors"
MODULE = REPO / "foundry" / "module" / "pentaryn-cursors"


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_build_check_sources_passes():
    run = subprocess.run(["node", str(TOOL / "build.mjs"), "--check-sources"],
                         capture_output=True, text=True, timeout=60)
    assert run.returncode == 0, run.stdout + run.stderr
    assert "all" in run.stdout and "present" in run.stdout


def test_every_source_and_alternate_is_credited():
    credits = (TOOL / "src" / "CREDITS.md").read_text(encoding="utf-8")
    svgs = sorted(p.name for p in (TOOL / "src").glob("*.svg"))
    assert any(n.startswith("alt-") for n in svgs), "the credited alternates are kept (finding -35)"
    assert [n for n in svgs if f"`{n}`" not in credits] == []


def test_the_module_ships_neither_the_tool_nor_the_sources():
    assert not (MODULE / "tools").exists()
    assert not (MODULE / "assets" / "src").exists()
    assert not (MODULE / "DESIGN.md").exists()


# --- A hermetic copy of the tool: build.mjs against a fake KEYS module and a stub @resvg -----------
#
# build.mjs finds the module at <script>/../../../foundry/module/pentaryn-cursors and @resvg next to
# itself, so a copy under tmp_path builds into tmp_path and never touches the repo's assets. The stub
# Resvg reports the bbox in FAKE_BBOX (default: the whole 512×512 viewBox) and renders every pixel
# opaque, so a "centre" key measures [16, 16] and a "bottom" key [16, 31].

STUB_RESVG = r"""
class Resvg {
  constructor(svg, opts) { this.px = (opts && opts.fitTo && opts.fitTo.value) || 32; }
  getBBox() { return JSON.parse(process.env.FAKE_BBOX || '{"x":0,"y":0,"width":512,"height":512}'); }
  render() {
    const width = this.px, height = this.px;
    return { width, height, pixels: new Uint8Array(width * height * 4).fill(255), asPng: () => Buffer.from("png") };
  }
}
module.exports = { Resvg };
"""

GLYPH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z"/><path d="M10 10h100v100z"/></svg>'
NO_GLYPH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z"/></svg>'


def _fake_tool(tmp_path: Path, keys: dict[str, dict], sources: dict[str, str]) -> tuple[Path, Path]:
    tool = tmp_path / "scripts" / "foundry" / "cursors"
    (tool / "src").mkdir(parents=True)
    shutil.copy(TOOL / "build.mjs", tool / "build.mjs")
    for name, svg in sources.items():
        (tool / "src" / name).write_text(svg, encoding="utf-8")
    stub = tool / "node_modules" / "@resvg" / "resvg-js"
    stub.mkdir(parents=True)
    (stub / "package.json").write_text('{"name":"@resvg/resvg-js","main":"index.js"}', encoding="utf-8")
    (stub / "index.js").write_text(STUB_RESVG, encoding="utf-8")
    module = tmp_path / "foundry" / "module" / "pentaryn-cursors"
    module.mkdir(parents=True)
    rows = ",\n".join(f"  {k}: {json.dumps(v)}" for k, v in keys.items())
    (module / "cursors-core.mjs").write_text(f"export const KEYS = {{\n{rows}\n}};\n", encoding="utf-8")
    return tool / "build.mjs", module / "assets" / "cursors"


def _key(src: str, hotspot: list[int], extreme: str = "centre") -> dict:
    return {"src": src, "colour": "#FF5252", "hotspot": hotspot, "extreme": extreme}


def _run(build: Path, *args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(["node", str(build), *args], capture_output=True, text=True, timeout=60,
                          cwd=build.parent, env={**os.environ, **(env or {})})


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_all_keys_pass_writes_six_files_per_key(tmp_path):
    build, out = _fake_tool(tmp_path, {"a": _key("a.svg", [16, 16]), "b": _key("a.svg", [16, 31], "bottom")},
                            {"a.svg": GLYPH})
    run = _run(build)
    assert run.returncode == 0, run.stdout + run.stderr
    assert len(list(out.iterdir())) == 12


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_a_hotspot_mismatch_writes_nothing(tmp_path):
    """cursors-rob-4: a failed key must not leave assets/cursors/ mixed — the run writes no file."""
    build, out = _fake_tool(tmp_path, {"good": _key("a.svg", [16, 16]), "bad": _key("a.svg", [0, 0])},
                            {"a.svg": GLYPH})
    run = _run(build)
    assert run.returncode == 1, run.stdout + run.stderr
    assert "✗ bad: measured hotspot 16 16" in run.stderr
    assert not out.exists() or list(out.iterdir()) == []


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_a_throwing_key_is_named_and_writes_nothing(tmp_path):
    """cursors-rob-4: a throw from a later key (no glyph path) is reported as `✗ <key>: <message>`,
    every key is still checked, and nothing is written."""
    build, out = _fake_tool(tmp_path, {"good": _key("a.svg", [16, 16]), "empty": _key("e.svg", [16, 16]),
                                       "bad": _key("a.svg", [0, 0])},
                            {"a.svg": GLYPH, "e.svg": NO_GLYPH})
    run = _run(build)
    assert run.returncode == 1, run.stdout + run.stderr
    assert "✗ empty: no glyph path" in run.stderr
    assert "✗ bad: measured hotspot" in run.stderr
    assert not out.exists() or list(out.iterdir()) == []


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_centre_hotspot_tolerates_float_error(tmp_path):
    """cursors-edge-5: this bbox centres at 15.999999999999998, which must still measure 16."""
    build, out = _fake_tool(tmp_path, {"a": _key("a.svg", [16, 16])}, {"a.svg": GLYPH})
    run = _run(build, env={"FAKE_BBOX": '{"x":96.3,"y":96.3,"width":455,"height":455}'})
    assert run.returncode == 0, run.stdout + run.stderr
    assert "hotspot 16 16 (KEYS 16 16)" in run.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_check_sources_rejects_an_unknown_extreme(tmp_path):
    """EXT-4: `--check-sources` catches a typo'd `extreme` without a full resvg build."""
    build, _ = _fake_tool(tmp_path, {"a": _key("a.svg", [16, 16], "top")}, {"a.svg": GLYPH})
    run = _run(build, "--check-sources")
    assert run.returncode == 1, run.stdout + run.stderr
    assert "✗ a: unknown extreme" in run.stderr
