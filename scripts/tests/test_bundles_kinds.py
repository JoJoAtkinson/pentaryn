"""Review EXT-1: the bundle kinds are spelled out once — bundles.KINDS (kind -> root,
manifest file, plural) — and every other table or loop is a view of it, in its insertion
order, so a manifest, a sidecar and the snapshot digest keep their bytes."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from scripts.foundry import bundles, cloud
from scripts.foundry.bundles import Local

FP = "0123456789abcdef"


def _inv() -> dict[str, Local]:
    inv = {}
    for kind, id in [("system", "dnd5e"), ("module", "zeta"), ("module", "alpha")]:
        inv[f"{kind}/{id}"] = Local(kind, id, "1.0.0", FP, Path("/x"), 1, 1)
    return inv


def test_ext1_one_kinds_table_and_its_views():
    k = bundles.KINDS
    assert list(k) == ["module", "system"]
    assert (k["module"].root, k["module"].manifest_file, k["module"].plural) == \
        ("Data/modules", "module.json", "modules")
    assert (k["system"].root, k["system"].manifest_file, k["system"].plural) == \
        ("Data/systems", "system.json", "systems")
    assert bundles.ROOTS == {kind: v.root for kind, v in k.items()}
    assert bundles.MANIFEST_FILE == {kind: v.manifest_file for kind, v in k.items()}
    assert list(bundles.manifest_sections()) == [("module", "modules"), ("system", "systems")]
    assert bundles.sections({"systems": {"a": "n"}}) == {"modules": {}, "systems": {"a": "n"}}
    assert list(bundles.sections({})) == ["modules", "systems"]


def test_ext1_no_kind_is_spelled_outside_the_table():
    """cloud.py names no (kind, plural) pair and no "modules"/"systems" section key of its
    own; bundles.py spells each kind's root, manifest file and plural only in KINDS."""
    src = Path(cloud.__file__).read_text(encoding="utf-8")
    assert '("module", "modules")' not in src
    assert not re.search(r'"(modules|systems)":\s*(manifest|job\.manifest)', src)
    own = Path(bundles.__file__).read_text(encoding="utf-8")
    for literal in ('"Data/modules"', '"Data/systems"', '"module.json"', '"system.json"',
                    '"modules")', '"systems")'):
        assert own.count(literal) == 1, literal
    assert '{"modules": {}, "systems": {}}' not in own
    assert bundles.BUNDLE_NAME.pattern.startswith("^(module|system)@")


def test_ext1_golden_manifest_bytes_and_digest_unchanged(monkeypatch):
    """Pinned on the code before EXT-1: the manifest's bytes, a parsed sidecar's bytes and
    the snapshot digest over them."""
    m = bundles.manifest(_inv())
    assert hashlib.sha256(json.dumps(m).encode()).hexdigest() == \
        "da058e0495b5a141496500951562bac838a3c0a4e2f8befd3eb2cd159fa0b6d2"
    parsed = cloud._parse_manifest({"bundled": 1, "systems": m["systems"],
                                    "modules": m["modules"], "host": "mac"})
    assert json.dumps(parsed) == json.dumps(m)
    assert json.dumps(bundles.sections(m)) == json.dumps(m)
    monkeypatch.setattr(cloud, "world_tree_digest", lambda: "w")
    assert cloud.snapshot_digest(m) == \
        "38b7287a9a770025809c0f9d1d7d0a717193285336a2ea8284e01dbb739af35c"
