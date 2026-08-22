"""Paths, names and URLs for the Foundry ops commands.

Single source of truth. These used to be `:=` variables at the top of the Makefile,
which meant every recipe that needed one interpolated it into a shell string — and a
path with a space in it (``Application Support``) had to be re-quoted correctly at
each use. Here they are `Path` objects and quoting stops being a thing that can be
got wrong.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

# ── The Foundry application ──
FOUNDRY_APP = "Foundry Virtual Tabletop"
FOUNDRY_URL = "http://localhost:30000"
FOUNDRY_BOOT_TIMEOUT = 40  # seconds to wait for the port after `open -a`

# ── Cloudflare tunnel ──
TUNNEL_NAME = "ardenhaven"
TUNNEL_HOST = "vtt.atjoseph.com"
RUN_DIR = REPO_ROOT / ".run"
CF_PID = RUN_DIR / "cloudflared.pid"
CF_LOG = RUN_DIR / "cloudflared.log"
# Ingress rules, not a bare --url: `--url` publishes EVERY route Foundry serves,
# including /setup, /auth and /update. The config 403s those at the edge so server
# administration is reachable only from the local port.
CF_CONFIG = REPO_ROOT / "foundry/cloudflared/config.yml"

# ── Update-run coordination ──
# Both lifecycle commands refuse while an update run holds this. Starting the tunnel
# underneath a run would publish /setup at exactly the moment the run has parked the
# server world-inactive, which is when /setup answers.
UPDATE_LOCK = REPO_ROOT / ".state/vtt-update.lock"

# ── Foundry's user-data directory ──
FOUNDRY_DATA = Path(os.path.expanduser("~/Library/Application Support/FoundryVTT/Data"))
FOUNDRY_MODULES = FOUNDRY_DATA / "modules"
WORLDS_DIR = FOUNDRY_DATA / "worlds"

# ── Which world the actor pipeline targets ──
# This was hardcoded to "ardenhaven" in the Makefile while the live world was
# "space-journey" — context/foundry/ops.md called it the most dangerous line in the
# document, and it was: `foundry-import` staged actors.json into a world nobody was
# playing, the import found nothing, and Gate 2 then asserted a 404 on the *unused*
# world's URL. Every light green, nothing imported, nothing meaningfully verified.
#
# Both worlds still exist on disk, so a typo here cannot be caught by "does the
# directory exist" alone — which is why the pipeline prints the target world on every
# run and refuses when the directory is missing. Override for a one-off with
# `make foundry-import WORLD=ardenhaven`.
WORLD_NAME = os.environ.get("PENTARYN_FOUNDRY_WORLD", "space-journey")
WORLD_DIR = WORLDS_DIR / WORLD_NAME

# ── Actor pipeline (Stage 1 → Stage 2) ──
ACTORS_JSON = REPO_ROOT / "foundry/build/actors.json"
ACTORS_STAGED = WORLD_DIR / "actors.json"
ACTORS_URL = f"https://{TUNNEL_HOST}/worlds/{WORLD_NAME}/actors.json"


def known_worlds() -> list[str]:
    """Every world directory on disk, for error messages that name the alternatives."""
    if not WORLDS_DIR.is_dir():
        return []
    return sorted(d.name for d in WORLDS_DIR.iterdir() if (d / "world.json").exists())

# ── In-house modules ──
MODULE_SRC_ROOT = REPO_ROOT / "foundry/module"


class ModuleSpec:
    """One in-house module: where it lives, and how to prove it before syncing."""

    def __init__(self, name: str, *, check: str, after_sync: tuple[str, ...] = ()):
        self.name = name
        self.check = check          # "parse" | "node-test" | "none"
        self.after_sync = after_sync  # lines printed after a successful copy

    @property
    def src(self) -> Path:
        return MODULE_SRC_ROOT / self.name

    @property
    def dst(self) -> Path:
        return FOUNDRY_MODULES / self.name


MODULES = {
    "ties": ModuleSpec(
        "pentaryn-ties",
        check="parse",
        after_sync=(
            "Already enabled? A browser RELOAD (F5) is enough — .mjs and .css are",
            "served fresh. But module.json is read once at STARTUP, so the version",
            "in Manage Modules stays stale until you restart. Don't trust it to tell",
            "you whether the new code is live; check the behaviour.",
            "First install, or a new file in module.json:",
            "  make vtt-down && make vtt-up",
            "then enable 'Pentaryn NPC Ties' in Manage Modules and reload.",
            "Key defaults to 8 — rebind in Configure Controls → Ties.",
        ),
    ),
    "walls": ModuleSpec(
        "pentaryn-walls",
        check="node-test",
        after_sync=(
            "Enable 'Pentaryn Wall Autocomplete' in Manage Modules, reload, then:",
            "  await game.pentaryn.walls.preview()",
        ),
    ),
    "importer": ModuleSpec("pentaryn-importer", check="none"),
}
