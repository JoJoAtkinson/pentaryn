"""``installed_version`` returns a string, as its ``-> str | None`` signature promises.

A manifest whose ``version`` is a JSON number (``{"version": 2}``) returned the int 2,
so ``wait_for_package_version(..., "2")`` never matched and timed out — a false install
failure. ``inventory`` and ``upstream`` already coerce the same field with ``str()``.
"""

from __future__ import annotations

import json

from scripts.foundry.update import admin


def _manifest(tmp_path, monkeypatch, version):
    pkg = tmp_path / "x"
    pkg.mkdir()
    (pkg / admin.MANIFEST_NAME["module"]).write_text(json.dumps({"version": version}))
    monkeypatch.setitem(admin.PACKAGE_DIR, "module", tmp_path)


def test_installed_version_is_a_string_for_numeric_manifests(tmp_path, monkeypatch):
    _manifest(tmp_path, monkeypatch, 2)

    assert admin.installed_version("module", "x") == "2"
    admin.wait_for_package_version("module", "x", "2", timeout=0.1)


def test_installed_version_string_manifest_unchanged(tmp_path, monkeypatch):
    _manifest(tmp_path, monkeypatch, "1.2")

    assert admin.installed_version("module", "x") == "1.2"


def test_installed_version_absent_is_none(tmp_path, monkeypatch):
    monkeypatch.setitem(admin.PACKAGE_DIR, "module", tmp_path)

    assert admin.installed_version("module", "missing") is None
