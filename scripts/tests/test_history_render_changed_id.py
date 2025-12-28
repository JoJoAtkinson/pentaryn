from __future__ import annotations

from scripts.timeline_svg.history_render import _changed_ids_from_git_diff


def test_changed_ids_from_git_diff_detects_event_id_rename() -> None:
    header = "event_id\ttags\tdate\tduration\ttitle\tsummary"
    diff = "\n".join(
        [
            "diff --git a/world/x/_history.tsv b/world/x/_history.tsv",
            "--- a/world/x/_history.tsv",
            "+++ b/world/x/_history.tsv",
            "@@ -2,1 +2,1 @@",
            "-old-id\tpublic\t4200\t0\tTitle\tSummary",
            "+new-id\tpublic\t4200\t0\tTitle\tSummary",
        ]
    )
    changed = _changed_ids_from_git_diff(diff_text=diff, header_line=header)
    assert changed == {"new-id"}


def test_changed_ids_from_git_diff_ignores_non_matching_rows() -> None:
    header = "event_id\ttags\tdate\tduration\ttitle\tsummary"
    diff = "\n".join(
        [
            "@@ -2,1 +2,1 @@",
            "-old-id\tpublic\t4200\t0\tTitle\tSummary",
            "+new-id\tpublic\t4200\t0\tTitle\tDIFFERENT SUMMARY",
        ]
    )
    changed = _changed_ids_from_git_diff(diff_text=diff, header_line=header)
    assert changed == set()

