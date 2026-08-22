"""The actor pipeline's Stage 2: stage into Data/, import, delete, prove it's gone.

`Data/` is served over HTTP with **no auth** while the tunnel is up. A staged
`actors.json` is therefore readable by every connected player for as long as it sits
there, which is why `stage` warns, `run_import` deletes down every exit path, and
`verify` proves the deletion from the players' side rather than trusting the unlink.
"""

from __future__ import annotations

import shutil
import signal
import subprocess
import sys

from . import config as cfg
from .service import _http_code, _say

OK, FAIL = 0, 1


def build_actors() -> int:
    """Stage 1 — regenerate the committed golden file."""
    rc = subprocess.run([sys.executable, "-m", "scripts.foundry.build_actors"],
                        cwd=cfg.REPO_ROOT).returncode
    if rc == 0:
        _say(f"✓ {cfg.ACTORS_JSON.relative_to(cfg.REPO_ROOT)} regenerated")
    return rc


def stage() -> int:
    """Copy the importer module and actors.json into the live Foundry Data/ dir.

    Copy, never symlink: a stale copy has to be a real, visible failure mode rather
    than something that silently tracks the repo.
    """
    if (rc := build_actors()) != 0:
        return rc

    spec = cfg.MODULES["importer"]
    if not spec.src.is_dir():
        _say(f"✗ no module at {spec.src} — Stage 2 not built yet")
        return FAIL

    # Name the target every time. Staging into the wrong world is silent at every
    # later step: the import finds nothing and the 404 gate passes for the wrong URL.
    if (rc := check_world()) != 0:
        return rc
    _say(f"▸ target world: {cfg.WORLD_NAME}")

    cfg.FOUNDRY_MODULES.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(spec.dst, ignore_errors=True)
    shutil.copytree(spec.src, spec.dst)
    _say(f"✓ module → {spec.dst}")

    shutil.copy2(cfg.ACTORS_JSON, cfg.ACTORS_STAGED)
    _say(f"✓ actors.json staged → {cfg.ACTORS_STAGED}")
    _say("⚠ Data/ is public with no auth while the tunnel is up — "
         "import now, then: make foundry-clean")
    return OK


def check_world() -> int:
    """Refuse to stage into a world that isn't there.

    `mkdir -p` would happily invent `worlds/typo/` and everything downstream would
    look like it worked, so this is a hard stop rather than a warning.
    """
    if cfg.WORLD_DIR.is_dir():
        return OK
    _say(f"✗ no world directory at {cfg.WORLD_DIR}")
    if known := cfg.known_worlds():
        _say(f"  worlds on disk: {', '.join(known)}")
    _say("  Set the right one with: make foundry-import WORLD=<name>")
    return FAIL


def clean_only() -> int:
    """Delete the staged file and assert it actually went."""
    cfg.ACTORS_STAGED.unlink(missing_ok=True)
    if cfg.ACTORS_STAGED.exists():
        _say(f"✗ {cfg.ACTORS_STAGED} still on disk — check permissions")
        return FAIL
    _say(f"✓ {cfg.ACTORS_STAGED} deleted")
    return OK


def clean() -> int:
    rc = clean_only()
    return verify() if rc == OK else rc


def verify() -> int:
    """Gate 2 — prove the staged JSON is not served.

    Two probes, in order, because one status code cannot distinguish "the file is
    gone" from "the request never reached Foundry": each gate must POSITIVELY confirm
    the thing it protects, and "it didn't error" is worthless.

    With the tunnel up, ONLY 404 passes. A 403 (Cloudflare bot-challenging a
    non-browser user agent), a 302 (an interstitial), a 5xx — none of those prove the
    file is gone, and a player's browser sails past exactly the challenge a scripted
    request trips over.
    """
    root = _http_code(f"https://{cfg.TUNNEL_HOST}/", 8.0)
    if root not in (200, 302):
        _say(f"▸ tunnel not reachable (site root HTTP {root or '000'}) — "
             "nothing is public, nothing to verify.")
        _say("  To confirm positively: make vtt-up, then: make foundry-verify")
        return OK

    code = _http_code(cfg.ACTORS_URL, 8.0)
    if code == 404:
        _say(f"✓ tunnel UP (root HTTP {root}) and actors.json is HTTP 404 — "
             "confirmed not served")
        return OK
    if code == 200:
        _say("✗ actors.json returned HTTP 200 — STILL EXPOSED to every connected player.")
        _say("  Run: make foundry-clean")
        return FAIL
    _say(f"✗ tunnel is UP (root HTTP {root}) but actors.json returned "
         f"HTTP {code or '000'}, not 404.")
    _say("  That does NOT prove the file is gone — a bot-challenge or interstitial answers")
    _say("  a scripted request differently than a player's browser. Run: make foundry-clean,")
    _say(f"  then check by hand: {cfg.ACTORS_URL}")
    return FAIL


# NOTE: plain str.replace, not str.format — the body is full of JS object literals
# (`{ dryRun: true }`) and format() reads those braces as fields. It raised
# KeyError: ' dryRun' the first time, which is exactly the sort of thing that would
# otherwise have surfaced mid-import.
_WORLD_PLACEHOLDER = "<WORLD>"
_INSTRUCTIONS = """
  ── Stage 2 — run the import ──────────────────────────────────────────
  1. Foundry → world '<WORLD>' → F12 console
  2. Dry run first:   await game.pentaryn.import({ dryRun: true })
  3. Then for real:   await game.pentaryn.import()
     One NPC only:    await game.pentaryn.import({ only: ['<slug>'] })

  The module ABORTS the run on any readback-assertion failure. If it does, fix the
  generator and start over — do not import the rest.
"""


def _ask() -> str:
    """Prompt on the terminal, not on stdin.

    The import runs in Foundry's browser console, which nothing here can drive — so
    this is interactive by design. Reading /dev/tty rather than stdin means a piped
    or redirected stdin cannot silently auto-answer "yes" and skip the verification.
    """
    try:
        with open("/dev/tty", "r+") as tty:
            tty.write("  Import finished (ok / assertion failure / didn't run)? [y/N] ")
            tty.flush()
            return (tty.readline() or "").strip()
    except OSError:
        print()
        _say("▸ no terminal to prompt on — assuming the import did not run")
        return ""


def run_import() -> int:
    """The whole Stage 2 loop: stage → wait for you → delete → verify.

    THREE ways out of the prompt and all three delete. A command whose entire job is
    "don't leave a public file lying around" must not have an exit path that leaves
    it lying around:

        answered      → delete (+ verify on y)
        no terminal   → skip the prompt, delete anyway
        Ctrl-C / TERM → handler deletes, then exits 130
    """
    if (rc := stage()) != 0:
        return rc

    print(_INSTRUCTIONS.replace(_WORLD_PLACEHOLDER, cfg.WORLD_NAME))

    def _on_signal(signum, _frame):
        print()
        _say("▸ interrupted — deleting the staged JSON")
        cfg.ACTORS_STAGED.unlink(missing_ok=True)
        sys.exit(130)

    previous = {s: signal.signal(s, _on_signal) for s in (signal.SIGINT, signal.SIGTERM)}
    try:
        answer = _ask()
    finally:
        for s, handler in previous.items():
            signal.signal(s, handler)

    if answer[:1].lower() == "y":
        _say("▸ deleting the staged JSON, then asserting it 404s publicly...")
        return clean()

    _say("▸ deleting the staged JSON anyway — it must not linger in a public dir.")
    rc = clean_only()
    _say("▸ skipped the public 404 assertion; re-run it with: make foundry-verify")
    _say("▸ re-stage when you're ready with: make foundry-import")
    return rc
