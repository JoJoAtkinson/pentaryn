"""The generated Module APIs index (python-tooling-36, mcp-fork-20, W7)."""

from __future__ import annotations

import json
import re

import pytest

from scripts.foundry.ops import config as cfg, index


def _module(root, name, *, version="0.1.0", code="", flags=None, describe=None, lock=None):
    d = root / name
    d.mkdir(parents=True)
    manifest = {"id": name, "title": name.title(), "version": version}
    if flags:
        manifest["flags"] = {"pentaryn": flags}
    (d / "module.json").write_text(json.dumps(manifest), encoding="utf-8")
    (d / "main.mjs").write_text(code, encoding="utf-8")
    if describe is not None:
        (d / "test/golden").mkdir(parents=True)
        (d / "test/golden/describe.json").write_text(json.dumps(describe), encoding="utf-8")
    if lock is not None:
        (d / "lib").mkdir()
        (d / "lib/kit.lock.json").write_text(json.dumps(lock), encoding="utf-8")
    return d


@pytest.fixture
def two(tmp_path):
    root = tmp_path / "modules"
    _module(root, "pentaryn-zed", code="game.pentaryn = { ...current, zed: api };\n")
    _module(root, "pentaryn-alpha", flags={"namespace": "al", "tier": "small"},
            describe={"namespace": "al", "methods": [{"path": "describe"}, {"path": "find"}]},
            lock={"version": "1.0.1", "tier": "small", "files": ["errors"]})
    readme = tmp_path / "README.md"
    readme.write_text(f"# x\n\nbefore\n\n{index.START}\nold\n{index.END}\n\nafter\n",
                      encoding="utf-8")
    return root, readme


def test_render_lists_every_module_sorted(two):
    root, _ = two
    out = index.render(root)
    rows = [ln for ln in out.splitlines() if ln.startswith("| `")]
    assert [re.search(r"`(pentaryn-\w+)`", r).group(1) for r in rows] == \
        ["pentaryn-alpha", "pentaryn-zed"]
    assert "`al`" in rows[0] and "small tier" in rows[0] and "`find`" in rows[0]
    assert "`describe`" not in rows[0], "kit members are not listed"
    assert "`zed`" in rows[1] and "not migrated" in rows[1] and "no describe golden" in rows[1]


def test_check_is_green_after_write_and_red_after_a_version_bump(two):
    root, readme = two
    assert not index.is_current(readme, root)
    assert index.write(readme, root) is True
    text = readme.read_text(encoding="utf-8")
    assert text.startswith("# x\n\nbefore\n") and text.endswith("\n\nafter\n")
    assert index.is_current(readme, root)
    assert index.write(readme, root) is False
    manifest = root / "pentaryn-zed/module.json"
    data = json.loads(manifest.read_text())
    data["version"] = "0.2.0"
    manifest.write_text(json.dumps(data))
    assert not index.is_current(readme, root)


def test_missing_markers_are_stale_not_a_crash(tmp_path):
    readme = tmp_path / "README.md"
    readme.write_text("no markers\n")
    assert index.is_current(readme, tmp_path) is False
    with pytest.raises(ValueError):
        index.write(readme, tmp_path)


@pytest.mark.parametrize("code, expect", [
    ("game.pentaryn = { ...existing, cursors: api };", ["cursors"]),
    ("game.pentaryn.ties = api;", ["ties"]),
    ('publishNamespace("rules", api, { moduleId: MODULE });', ["rules"]),
    ("if (game.pentaryn.ties == null) {}", []),
])
def test_published_namespaces_shapes(tmp_path, code, expect):
    d = _module(tmp_path, "pentaryn-x", code=code)
    assert index.published_namespaces(d) == expect


def test_tests_and_vendored_kit_do_not_publish(tmp_path):
    d = _module(tmp_path, "pentaryn-x")
    (d / "test").mkdir()
    (d / "test/fake.mjs").write_text("game.pentaryn.fake = {};")
    (d / "lib").mkdir()
    (d / "lib/publish.mjs").write_text('publishNamespace("kit", api);')
    assert index.published_namespaces(d) == []


# ── the real tree ─────────────────────────────────────────────────────────────

@pytest.mark.repo
def test_real_index_has_every_module_and_published_namespace():
    """mcp-fork-20's gate: every namespace a module's code publishes has a row."""
    text = index.README.read_text(encoding="utf-8")
    block = text[text.index(index.START):text.index(index.END)]
    for name in cfg.module_dirs():
        assert f"`{name}`" in block, name
        for ns in index.published_namespaces(cfg.MODULE_SRC_ROOT / name):
            assert f"`{ns}`" in block, (name, ns)
    assert "`pentaryn-pings`" in block
