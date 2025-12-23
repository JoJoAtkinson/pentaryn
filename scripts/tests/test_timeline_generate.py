from __future__ import annotations

from pathlib import Path

from scripts.timeline_svg.timeline_generate import generate_from_config


def _write_timeline(path: Path) -> None:
    header = [
        "event_id",
        "pov",
        "series",
        "kind",
        "start_year",
        "start_month",
        "start_day",
        "end_year",
        "end_month",
        "end_day",
        "precision",
        "parent_id",
        "factions",
        "tags",
        "title",
        "summary",
        "inherit_truth_date",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\t".join(header)
        + "\n"
        + "\t".join(
            [
                "e1",
                "truth",
                "",
                "event",
                "4327",
                "7",
                "18",
                "",
                "",
                "",
                "point",
                "",
                "ardenhaven",
                "party",
                "Border Signal Mission",
                "A tower is sabotaged.",
                "",
            ]
        )
        + "\n"
        + "\t".join(
            [
                "e1",
                "public",
                "",
                "event",
                "4327",
                "7",
                "18",
                "",
                "",
                "",
                "point",
                "",
                "ardenhaven",
                "party",
                "Border Signal Mission",
                "A tower is sabotaged.",
                "",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def test_generate_from_config_writes_tsv(tmp_path: Path) -> None:
    root = tmp_path
    _write_timeline(root / "world/history/_timeline.tsv")
    config_path = root / "world/history/timeline.config.toml"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        """
[[views]]
id = "v"
title = "V"
type = "mermaid"
pov = "truth"
output = "world/history/generated/v.md"
tsv_output = ".output/timelines/v.tsv"
""".lstrip(),
        encoding="utf-8",
    )

    result = generate_from_config(root=root, config_path=config_path, only_view_ids={"v"}, only_types={"tsv"}, quiet=True)
    assert "v" in result.tsv_exports
    export_path = result.tsv_exports["v"]
    assert export_path.exists()
    first_line = export_path.read_text(encoding="utf-8").splitlines()[0]
    assert first_line.startswith("event_id\tstart\tend\t")

