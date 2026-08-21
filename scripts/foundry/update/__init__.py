"""Unattended Foundry VTT update pipeline — see automation/README.md.

Two halves, deliberately separable:

* **Deterministic Python** (this package) does the scanning, backing up, applying,
  smoke-testing and recovering. It needs no LLM and no tokens, and a run in which
  every Claude step fails still updates the safe packages and still reports.
* **LLM glue** (``adjudicate.py``, ``report.py``) supplies judgement on top: reading
  release notes to decide whether a major bump is safe, and writing the human report.

The rule that runs through all of it: **never treat an API "OK" as truth.** Foundry's
setup API is largely fire-and-forget — ``createSnapshot``, ``restoreSnapshot``,
``restoreBackup`` and ``launchWorld`` all return ``{}`` immediately and report errors
only over socket.io — so every step verifies the state it wanted by reading the disk
or polling ``/api/status``.
"""

from __future__ import annotations

__all__ = ["admin", "inventory", "upstream", "risk", "notify"]
