"""M10: the README's bucket table must say what ``risk.classify_core`` actually does.

``automation/README.md`` said a package flagged by Foundry's ``previewCompatibility``
went to **review**, and credited the generation-change hold to Foundry's own
``willDisableModules``. The code does neither: a blocking compatibility-preview flag on a
core bump is a **hold** (``risk.classify_core``), and ``willDisableModules`` is never
read — ``updateCheck`` does not vend it, so the generation is compared here.
"""

from __future__ import annotations

from pathlib import Path

from scripts.foundry.update import risk

REPO = Path(__file__).resolve().parents[2]
README = REPO / "automation" / "README.md"
USE_DOC = REPO / "context" / "foundry" / "automated-updates.md"


def _bucket_rows() -> dict[str, str]:
    rows = {}
    for line in README.read_text(encoding="utf-8").splitlines():
        for bucket in ("auto", "review", "hold"):
            if line.startswith(f"| **{bucket}** |"):
                rows[bucket] = line
    assert set(rows) == {"auto", "review", "hold"}, rows
    return rows


def test_blocking_preview_on_a_core_bump_is_a_hold():
    preview = {"module": [{"id": "some-mod", "availability": 6}]}  # MISSING_DEPENDENCY
    d = risk.classify_core("14.350", {"version": "14.360"}, preview, policy={})
    assert d.bucket == risk.HOLD


def test_readme_review_row_does_not_claim_compat_flags():
    rows = _bucket_rows()
    assert "previewCompatibility" not in rows["review"]
    assert "compatibility preview" not in rows["review"].lower()


def test_readme_hold_row_names_the_compat_preview_hold():
    hold = _bucket_rows()["hold"]
    assert "compatibility preview" in hold.lower()
    assert "classify_core" in hold


def test_docs_do_not_credit_will_disable_modules_for_the_hold():
    for line in _bucket_rows().values():
        assert "willDisableModules" not in line
    for line in USE_DOC.read_text(encoding="utf-8").splitlines():
        if line.startswith("| Core **generation** change"):
            assert "willDisableModules" not in line
