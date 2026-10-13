"""The generated Module APIs index (python-tooling-36, mcp-fork-20, W7)."""

from __future__ import annotations

import json
import re

import pytest

from scripts.foundry.blueprint import conformance
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


def test_an_alias_published_in_code_survives_a_describe_golden(tmp_path):
    """senses publishes `senses` (its describe golden) and the `chain` alias (kit
    publishNamespace with a literal name); the row must name both, as before migration."""
    root = tmp_path / "modules"
    d = _module(root, "pentaryn-senses",
                code='publishNamespace(NS, api);\npublishNamespace("chain", api.chain, { alias: true });\n',
                describe={"namespace": "senses", "methods": [{"path": "syncLight"}]})
    assert index.module_row(d)["namespaces"] == ["chain", "senses"]


def test_reserved_names_mirror_the_kit():
    # EXT-3: the index reads conformance.RESERVED_API rather than keeping its own copy; the
    # one remaining Python copy must equal the kit's errors.RESERVED, so a kit bump that adds or
    # drops a name fails here.
    text = (cfg.REPO_ROOT / "foundry/lib/errors.mjs").read_text(encoding="utf-8")
    body = re.search(r"export const RESERVED\s*=\s*Object\.freeze\(\[(.*?)\]", text, re.S).group(1)
    assert set(re.findall(r'"([^"]+)"', body)) == set(conformance.RESERVED_API)


def test_index_filters_by_conformance_reserved_not_its_own_copy(tmp_path, monkeypatch):
    """EXT-3: index.py hand-copied the kit's RESERVED list; it must use conformance.RESERVED_API."""
    assert not hasattr(index, "_RESERVED")
    monkeypatch.setattr(conformance, "RESERVED_API", (*conformance.RESERVED_API, "kitOnlyName"))
    d = _module(tmp_path / "modules", "pentaryn-ext3",
                describe={"namespace": "ext3",
                          "methods": [{"path": "describe"}, {"path": "kitOnlyName"}, {"path": "real"}]})
    assert index.module_row(d)["api"] == ["real"]


def test_index_reads_json_through_config_not_its_own_copy(tmp_path, monkeypatch):
    """M7: index._json duplicated config._read_json; the index must read every JSON file
    (manifest, describe golden, kit lock) through cfg.read_json, and its docstring must not
    claim the tier and suite come "via the ModuleSpec" when they are read from the directory."""
    assert not hasattr(index, "_json")
    assert "via the ModuleSpec" not in (index.__doc__ or "")
    seen = []
    real = cfg.read_json

    def spy(path):
        seen.append(path.name)
        return real(path)

    monkeypatch.setattr(cfg, "read_json", spy)
    d = _module(tmp_path / "modules", "pentaryn-m7", flags={"namespace": "m7"},
                describe={"namespace": "m7", "methods": [{"path": "real"}]},
                lock={"version": "1.0.1", "tier": "small", "files": []})
    row = index.module_row(d)
    assert set(seen) == {"module.json", "describe.json", "kit.lock.json"}
    assert row["tier"] == "small" and row["api"] == ["real"]


# ── a retired module says so in its row (wave 3 walls-retire) ─────────────────

def test_a_retired_module_s_row_says_retired_walls_retire(tmp_path, monkeypatch):
    root = tmp_path / "modules"
    _module(root, "pentaryn-zz", lock={"version": "1.0.1", "tier": "full", "files": []})
    monkeypatch.setitem(cfg.MODULES, "zz", cfg.ModuleSpec("pentaryn-zz", check="parse",
                                                          retired="2026-10-13 — gone"))
    assert index.module_row(root / "pentaryn-zz")["retired"] == "2026-10-13 — gone"
    (row,) = [ln for ln in index.render(root).splitlines() if "`pentaryn-zz`" in ln]
    assert "| full tier · **retired 2026-10-13 — gone** |" in row

