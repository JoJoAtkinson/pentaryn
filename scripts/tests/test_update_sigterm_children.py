"""AC-6: a killed run takes its ``claude -p`` and ``node`` smoke children down with it.

The wrapper's backstop (``automation/bin/vtt-update.sh``) sends the run SIGTERM, then
SIGKILL ten seconds later. Python's default SIGTERM action ends the interpreter on the
spot, so a ``claude -p`` call (``llm.call``) or a browser smoke test
(``smoke.run_browser``) in flight was orphaned and kept running — spending budget, or
driving Chrome against a server the cleanup was about to restore — and none of the run's
``finally`` blocks ran, so the lock stayed held. The ruling: ``cli.cmd_run`` installs a
SIGTERM handler that terminates every child registered by ``llm.call`` and
``smoke.run_browser``, then raises ``SystemExit(143)`` so the ``finally`` blocks release
the lock and the wrapper still sees 143 and runs ``cli killed``.

Each test runs a real driver interpreter, TERMs it while its child is mid-flight, and
checks: the driver exited 143, its ``finally`` ran, and the child is gone.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import textwrap
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# A child that records its pid and then outlives any reasonable test.
SLOW_CHILD = textwrap.dedent("""\
    #!{python}
    import os, sys, time
    open(os.environ["AC6_CHILD_PID"], "w").write(str(os.getpid()))
    time.sleep(60)
""")

DRIVER_PREAMBLE = textwrap.dedent("""\
    import os, sys
    from pathlib import Path
    from types import SimpleNamespace
    sys.path.insert(0, {repo!r})
    from scripts.foundry.update import apply, cli

    FINALLY = Path({finally_path!r})

    def fake_run(**kwargs):
        try:
            work()
        finally:
            FINALLY.write_text("released")   # stands in for apply.run's lock.release()
        raise AssertionError("the child was supposed to be killed mid-flight")

    apply.run = fake_run
""")

DRIVER_TAIL = textwrap.dedent("""\
    cli.cmd_run(SimpleNamespace(dry=False, force=False, skip_llm=False))
""")

LLM_WORK = textwrap.dedent("""\
    from scripts.foundry.update import llm
    llm.CLAUDE_BIN = {child!r}

    def work():
        llm.call(llm.Spec(model="haiku", effort="low", timeout_s=120), "in", tier="T0")
""")

SMOKE_WORK = textwrap.dedent("""\
    from scripts.foundry import host
    from scripts.foundry.update import smoke
    smoke.SMOKE_JS = Path({child!r})
    smoke.CHROME_PROFILE = Path({profile!r})
    host.node = lambda: {child!r}

    class Admin:
        base_url = "http://127.0.0.1:1"
        def authenticate(self): pass
        def session_cookies(self): return {{"session": "x"}}

    def work():
        smoke.run_browser(Admin(), "alpha", dwell=1, ignores=[])
""")


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    # A reaped-later zombie still answers kill(0); ask ps whether it is one.
    out = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)],
                         capture_output=True, text=True).stdout.strip()
    return bool(out) and not out.startswith("Z")


def _wait_for(predicate, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


def _run_and_term(tmp_path: Path, work: str) -> tuple[int, int, Path]:
    child = tmp_path / "slow-child"
    child.write_text(SLOW_CHILD.format(python=sys.executable))
    child.chmod(0o755)
    pid_file = tmp_path / "child.pid"
    finally_path = tmp_path / "finally.txt"
    driver = tmp_path / "driver.py"
    driver.write_text(
        DRIVER_PREAMBLE.format(repo=str(REPO_ROOT), finally_path=str(finally_path))
        + work.format(child=str(child), profile=str(tmp_path / "profile"))
        + DRIVER_TAIL)

    env = {**os.environ, "AC6_CHILD_PID": str(pid_file)}
    proc = subprocess.Popen([sys.executable, str(driver)], env=env, cwd=str(tmp_path),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        assert _wait_for(lambda: pid_file.exists() and pid_file.read_text(), 20), \
            "the child never started"
        child_pid = int(pid_file.read_text())
        proc.send_signal(signal.SIGTERM)
        try:
            proc.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
        return proc.returncode, child_pid, finally_path
    finally:
        if proc.poll() is None:
            proc.kill()
        if pid_file.exists() and pid_file.read_text():
            try:
                os.kill(int(pid_file.read_text()), signal.SIGKILL)
            except ProcessLookupError:
                pass


@pytest.mark.parametrize("work", [LLM_WORK, SMOKE_WORK], ids=["claude-p", "node-smoke"])
def test_ac6_sigterm_kills_children_and_runs_finally(tmp_path, work):
    rc, child_pid, finally_path = _run_and_term(tmp_path, work)
    assert rc == 143, "the wrapper keys its cleanup on 143"
    assert finally_path.read_text() == "released", "the run's finally blocks must run"
    assert _wait_for(lambda: not _alive(child_pid), 5), "the child outlived the run"


def test_ac6_registry_forgets_finished_children():
    from scripts.foundry.update import children
    proc = children.spawn([sys.executable, "-c", "pass"])
    try:
        assert proc in children.live()
    finally:
        proc.wait()
        children.forget(proc)
    assert proc not in children.live()


def test_ac6_handler_is_scoped_to_the_run():
    from scripts.foundry.update import children
    before = signal.getsignal(signal.SIGTERM)
    with children.terminate_on_sigterm():
        assert signal.getsignal(signal.SIGTERM) is not before
    assert signal.getsignal(signal.SIGTERM) is before


# children.run must keep subprocess.run's failure paths (AC-6 repair).

def test_ac6_run_timeout_does_not_wait_for_pipe_holding_descendants(tmp_path):
    """On a timeout, kill and ``wait`` as subprocess.run does — a second ``communicate``
    blocks until every descendant holding the pipes exits."""
    from scripts.foundry.update import children
    grandchild = tmp_path / "grandchild.pid"
    started = time.monotonic()
    try:
        with pytest.raises(subprocess.TimeoutExpired):
            children.run(["sh", "-c", f"sleep 30 & echo $! > {grandchild}; sleep 60"],
                         timeout=1)
        assert time.monotonic() - started < 10, "the timeout waited on the descendant"
    finally:
        if grandchild.exists() and grandchild.read_text().strip():
            try:
                os.kill(int(grandchild.read_text()), signal.SIGKILL)
            except ProcessLookupError:
                pass
    assert not children.live()


def test_ac6_run_kills_child_on_keyboard_interrupt(tmp_path):
    """A KeyboardInterrupt delivered to the run's pid alone must not orphan the child."""
    child = tmp_path / "slow-child"
    child.write_text(SLOW_CHILD.format(python=sys.executable))
    child.chmod(0o755)
    pid_file = tmp_path / "child.pid"
    driver = tmp_path / "driver.py"
    driver.write_text(textwrap.dedent(f"""\
        import sys
        sys.path.insert(0, {str(REPO_ROOT)!r})
        from scripts.foundry.update import children
        children.run([{str(child)!r}], timeout=120)
    """))
    env = {**os.environ, "AC6_CHILD_PID": str(pid_file)}
    proc = subprocess.Popen([sys.executable, str(driver)], env=env, cwd=str(tmp_path),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        assert _wait_for(lambda: pid_file.exists() and pid_file.read_text(), 20), \
            "the child never started"
        child_pid = int(pid_file.read_text())
        os.kill(proc.pid, signal.SIGINT)
        proc.communicate(timeout=15)
        assert _wait_for(lambda: not _alive(child_pid), 5), "the child outlived the run"
    finally:
        if proc.poll() is None:
            proc.kill()
        if pid_file.exists() and pid_file.read_text():
            try:
                os.kill(int(pid_file.read_text()), signal.SIGKILL)
            except ProcessLookupError:
                pass


def test_ac6_sigterm_during_spawn_is_deferred_until_registered(monkeypatch):
    """A TERM landing after the fork but before registration still ends that child."""
    from scripts.foundry.update import children
    real_popen = subprocess.Popen
    spawned = []

    def popen_then_term(*args, **kwargs):
        p = real_popen(*args, **kwargs)
        spawned.append(p)
        os.kill(os.getpid(), signal.SIGTERM)
        time.sleep(0.1)                       # the handler runs here, before registration
        return p

    monkeypatch.setattr(children.subprocess, "Popen", popen_then_term)
    with children.terminate_on_sigterm():
        with pytest.raises(SystemExit) as exc:
            children.spawn([sys.executable, "-c", "import time; time.sleep(60)"])
    assert exc.value.code == 143
    try:
        assert spawned and spawned[0].poll() is not None, "the unregistered child survived"
    finally:
        for p in spawned:
            if p.poll() is None:
                p.kill()
            p.wait()
            children.forget(p)
