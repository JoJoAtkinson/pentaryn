from __future__ import annotations

from pathlib import Path

from scripts.timeline_svg.history_config import load_history_config


def test_load_history_config_parses_hide_time_measurements(tmp_path: Path) -> None:
    config = tmp_path / "_history.config.toml"
    config.write_text(
        """
present_year = 4327

[[views]]
id = "a"
title = "A"
hide_time_measurements = true
""".lstrip(),
        encoding="utf-8",
    )
    cfg = load_history_config(config)
    assert cfg.present_year == 4327
    assert cfg.views[0].hide_time_measurements is True


def test_load_history_config_inherits_hide_time_measurements(tmp_path: Path) -> None:
    config = tmp_path / "_history.config.toml"
    config.write_text(
        """
hide_time_measurements = true

[[views]]
id = "a"
title = "A"
""".lstrip(),
        encoding="utf-8",
    )
    cfg = load_history_config(config)
    assert cfg.hide_time_measurements is True
    assert cfg.views[0].hide_time_measurements is True

