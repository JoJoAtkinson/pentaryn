from __future__ import annotations

from pathlib import Path

import pytest

from scripts.timeline_svg.history_config import load_history_config


def test_load_history_config_parses_svg_templates_and_access(tmp_path: Path) -> None:
    config = tmp_path / "_history.config.toml"
    config.write_text(
        """
svg_public_template = "../docs/history.{id}.svg"
svg_private_template = "../docs/history.{hash}.svg"

[[views]]
id = "party"
svg_access = "private"
""".lstrip(),
        encoding="utf-8",
    )
    cfg = load_history_config(config)
    assert cfg.svg_public_template == "../docs/history.{id}.svg"
    assert cfg.svg_private_template == "../docs/history.{hash}.svg"
    assert cfg.views[0].svg_access == "private"


def test_load_history_config_rejects_invalid_svg_access(tmp_path: Path) -> None:
    config = tmp_path / "_history.config.toml"
    config.write_text(
        """
[[views]]
id = "party"
svg_access = "nope"
""".lstrip(),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        load_history_config(config)

