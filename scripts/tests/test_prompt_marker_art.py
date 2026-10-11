"""The prompt-marker art renders byte-identically (python-tooling-38).

Hashes captured on 2026-10-11 from the hyphenated script, before its rename. They depend
on the font (the first FONT_CANDIDATES entry, macOS's Arial Rounded Bold) and Pillow, so
the test skips on a machine without that font rather than failing on a different one.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from scripts.foundry import prompt_marker_art
from scripts.foundry.ops import config as cfg

ART = vars(prompt_marker_art)

HASHES = {
    "tiny": "6500399b214d227e72c507566d8f1f7e754d3e1c7c411c0b519a6eff8193652c",
    "small": "d5744b143a3a648e38c769500b09cd8d0c9d82bc00ddcce3ef0931123af9ac56",
    "mid": "792636324180a60bac1afefdba352315c83a1bcfde3c9a6451387955676e9a43",
    "large": "61a7711cca0de7384253e4133d4bd9e848acc976dccf9eab75b379c9f458b5b5",
    "xl": "d9781c9d955722fc9a4e8b0c40c3d83c403426ad39d2b2a92331f8502efccb2c",
    "xxl": "cc2a8957ceef2bcd52c2c4e2a090345baab1f3e97b3a848791441afc6e07ddb4",
}


@pytest.mark.skipif(not Path(ART["FONT_CANDIDATES"][0]).exists(),
                    reason="hashes were taken with the first FONT_CANDIDATES font")
@pytest.mark.parametrize("key", sorted(HASHES))
def test_render_is_byte_identical(key):
    assert set(ART["SIZES"]) == set(HASHES)
    assert hashlib.sha256(ART["render"](key).tobytes()).hexdigest() == HASHES[key]


def test_prompts_after_sync_names_the_importable_path():
    text = "\n".join(cfg.MODULES["prompts"].after_sync)
    assert "scripts/foundry/prompt_marker_art.py" in text
    assert "prompt-marker-art" not in text
