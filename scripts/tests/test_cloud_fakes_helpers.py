"""M14: the cloud test helpers live once, in cloud_fakes.py, and the test files import them.

They used to be copied into five to eight test files (``_install``, ``_edit``, ``_worlds``,
``_newest``, ``_bundle_names`` and their twins), so a fix to one copy silently missed the rest.
"""

from __future__ import annotations

import ast
from pathlib import Path

import cloud_fakes

HERE = Path(__file__).resolve().parent

# The helper names that were copied around; none may be defined at module level in a test file.
SHARED = {"_install", "_edit", "_worlds", "_names", "_newest", "_bundle_names", "_sidecar", "_age"}

# A same-named helper that is NOT a twin: it behaves differently, so it stays local.
NOT_TWINS = {
    # mtime is keyed on the text's length with no counter, so equal text means an equal digest.
    ("test_cloud_background_upload.py", "_edit"),
}


def test_M14_cloud_fakes_exports_the_shared_helpers():
    for name in ("install", "install_system", "make_edit", "worlds", "names", "newest",
                 "bundle_names", "sidecar", "age"):
        assert callable(getattr(cloud_fakes, name, None)), f"cloud_fakes.{name} missing"


def test_M14_no_test_file_keeps_its_own_copy_of_a_cloud_helper():
    copies = []
    for path in sorted(HERE.glob("test_*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if (isinstance(node, ast.FunctionDef) and node.name in SHARED
                    and (path.name, node.name) not in NOT_TWINS):
                copies.append(f"{path.name}:{node.lineno} {node.name}")
    assert copies == [], "copied cloud helpers; import them from cloud_fakes:\n" + "\n".join(copies)


def test_M14_make_edit_gives_each_file_its_own_fresh_mtimes(tmp_path):
    (tmp_path / "Data/worlds/w").mkdir(parents=True)
    a, b = cloud_fakes.make_edit(step=5), cloud_fakes.make_edit(step=7)
    f = tmp_path / "Data/worlds/w/journal.txt"
    a(tmp_path)
    m1 = int(f.stat().st_mtime)
    a(tmp_path, "again")
    m2 = int(f.stat().st_mtime)
    assert f.read_text() == "again" and m2 > m1
    b(tmp_path)                       # its own counter: one step of 7, not 5 + 5 + 7
    assert int(f.stat().st_mtime) < m2 + 7
