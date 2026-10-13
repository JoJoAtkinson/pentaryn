"""M11: recover_module's "no backup" error names the mechanism that actually runs.

Recovery restores from the per-package ``createBackup`` that ``apply.backup_packages``
writes before the run, not from a full pre-run snapshot. The old text ("the pre-run
snapshot did not include it") sent whoever read the report looking for a snapshot that
does not exist by default.
"""

from __future__ import annotations

from scripts.foundry.update import recover


class _NoBackups:
    def list_backups(self):
        return {"module": {"other-mod": [{"id": "b1", "version": "1.0.0"}]}}

    def restore_backup(self, *a, **k):  # pragma: no cover - must not be reached
        raise AssertionError("restore attempted with no matching backup")


def test_m11_missing_backup_error_names_backup_packages():
    rec = recover.recover_module(_NoBackups(), "module", "some-mod", "2.3.4")

    assert rec.ok is False
    assert rec.error == ("no backup of some-mod 2.3.4 to restore — "
                         "backup_packages did not record one before the run")
    assert "snapshot" not in rec.error
