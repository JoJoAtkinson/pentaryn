#!/usr/bin/env python3
"""The run's long-lived child processes, so a killed run takes them down with it (AC-6).

The wrapper's backstop (``automation/bin/vtt-update.sh``) ends a run that overstays with
SIGTERM, then SIGKILL ten seconds later. Python's default SIGTERM action ends the
interpreter on the spot: a ``claude -p`` call or a ``node`` browser smoke test in flight
was orphaned and kept going, and no ``finally`` block ran, so the lock stayed held.

:func:`spawn` starts a child and registers it; :func:`forget` drops it once reaped.
:func:`terminate_on_sigterm` (installed by ``cli.cmd_run`` for the run's lifetime)
turns SIGTERM into: terminate every registered child, give them a moment, kill the
stragglers, then ``SystemExit(143)`` — so the run's ``finally`` blocks release the lock
and the wrapper still sees 143 and runs ``cli killed`` for the rest of the cleanup.
"""

from __future__ import annotations

import signal
import subprocess
import time
from contextlib import contextmanager
from typing import Iterator

# Well inside the wrapper's ten seconds between TERM and KILL.
GRACE_SECONDS = 3.0

_live: set[subprocess.Popen] = set()


def spawn(cmd: list[str], **kwargs) -> subprocess.Popen:
    """``subprocess.Popen`` plus registration. ``OSError`` propagates as from Popen."""
    proc = subprocess.Popen(cmd, **kwargs)
    _live.add(proc)
    return proc


def forget(proc: subprocess.Popen) -> None:
    _live.discard(proc)


def live() -> set[subprocess.Popen]:
    return set(_live)


def run(cmd: list[str], *, timeout: float, **kwargs) -> subprocess.CompletedProcess:
    """``subprocess.run(cmd, capture_output=True, text=True, timeout=...)``, registered.

    Raises ``subprocess.TimeoutExpired`` (child killed and reaped) and ``OSError`` as
    ``subprocess.run`` does."""
    proc = spawn(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **kwargs)
    try:
        try:
            out, err = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise
        return subprocess.CompletedProcess(cmd, proc.returncode, out, err)
    finally:
        forget(proc)


def terminate_all(grace: float = GRACE_SECONDS) -> None:
    """TERM every registered child still running, wait up to ``grace``, KILL the rest."""
    procs = [p for p in list(_live) if p.poll() is None]
    for proc in procs:
        try:
            proc.terminate()
        except OSError:
            pass
    deadline = time.monotonic() + grace
    for proc in procs:
        try:
            proc.wait(timeout=max(0.0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
                proc.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                pass


def _on_sigterm(signum, frame) -> None:
    terminate_all()
    raise SystemExit(128 + signum)


@contextmanager
def terminate_on_sigterm() -> Iterator[None]:
    """For the block's lifetime, SIGTERM ends the children, then raises ``SystemExit``.

    A no-op off the main thread, where Python cannot install signal handlers."""
    try:
        previous = signal.signal(signal.SIGTERM, _on_sigterm)
    except ValueError:
        yield
        return
    try:
        yield
    finally:
        signal.signal(signal.SIGTERM, previous)
