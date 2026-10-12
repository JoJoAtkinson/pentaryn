"""Paths, names and URLs for the Foundry ops commands.

Single source of truth. These used to be `:=` variables at the top of the Makefile,
which meant every recipe that needed one interpolated it into a shell string — and a
path with a space in it (``Application Support``) had to be re-quoted correctly at
each use. Here they are `Path` objects and quoting stops being a thing that can be
got wrong.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from scripts.foundry import host as _host

REPO_ROOT = Path(__file__).resolve().parents[3]

# ── The Foundry application ──
# Where it lives and how it starts are host.py's (Mac: /Applications, `open -a`;
# BOSS: FOUNDRY_APP_ROOT and PENTARYN_START_CMD). This name is only for messages.
FOUNDRY_APP = _host.MAC_APP_NAME
FOUNDRY_URL = f"http://localhost:{_host.foundry_port()}"
FOUNDRY_BOOT_TIMEOUT = 40  # seconds to wait for the port after host.start()

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
# Foundry's Data/ folder — NOT the data root. host.FOUNDRY_DATA (and cloud.py) mean the
# root that holds Config/ Data/ Logs/; this used to be called FOUNDRY_DATA too, and the
# two meanings sat one directory apart. Renamed so they cannot be confused.
FOUNDRY_DATA_DIR = _host.foundry_data() / "Data"
FOUNDRY_MODULES = FOUNDRY_DATA_DIR / "modules"
WORLDS_DIR = FOUNDRY_DATA_DIR / "worlds"

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

# Where module installs are recorded, one JSONL file per month (python-tooling-10). Machine-local
# history like the other files in foundry/logs/; agents never commit it.
OPS_LOG_DIR = REPO_ROOT / "foundry/logs"


def module_dirs(root: Path | None = None) -> list[str]:
    """Every module folder on disk (a directory holding a module.json), sorted.

    The registry below is hand-kept; this is what proves it complete — a test asserts
    every name here has a ModuleSpec (python-tooling-3)."""
    root = root or MODULE_SRC_ROOT
    if not root.is_dir():
        return []
    return sorted(p.name for p in root.iterdir() if (p / "module.json").is_file())


def _read_json(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


class ModuleSpec:
    """One in-house module: where it lives, and how to prove it before syncing.

    `check` is a tuple because the gates are cumulative, not alternatives. It used to
    be a single string, and "node-test" therefore *replaced* the parse check on the
    three modules that had a suite — which is how a module whose files all parsed and
    whose suite all passed could still fail to load in the browser. A check that runs
    instead of another check is not a gate.

    Two things are DERIVED from the module's own files, never stored here:

    * `kit` — the vendored kit files, from `lib/kit.lock.json` (blueprint D8: the lock is
      the only kit list). None means the module has not adopted the kit (unmigrated).
    * `after_sync` — `module.json` `flags.pentaryn.afterSync` when the module carries
      it (the generator writes it), else the tuple given here. One source per module:
      the tuples move into module.json in the Wave 7 restart batch, never by editing both.
    """

    #: every gate a spec may name — see `modules._CHECKS`
    CHECKS = ("parse", "imports", "i18n", "node-test", "vendor", "conformance")

    def __init__(self, name: str, *, check: str | tuple[str, ...],
                 after_sync: tuple[str, ...] = ()):
        self.name = name
        self.check = (check,) if isinstance(check, str) else tuple(check)
        self._after_sync = tuple(after_sync)
        unknown = [c for c in self.check if c not in (*self.CHECKS, "none")]
        if unknown:
            raise ValueError(f"{name}: unknown check(s) {unknown}")

    @property
    def src(self) -> Path:
        return MODULE_SRC_ROOT / self.name

    @property
    def dst(self) -> Path:
        return FOUNDRY_MODULES / self.name

    @property
    def after_sync(self) -> tuple[str, ...]:
        """Lines printed after a successful copy (module.json first, then the tuple)."""
        manifest = _read_json(self.src / "module.json") or {}
        lines = (((manifest.get("flags") or {}).get("pentaryn") or {}).get("afterSync"))
        if isinstance(lines, list) and lines:
            return tuple(str(x) for x in lines)
        return self._after_sync

    @property
    def kit_lock(self) -> dict | None:
        """`lib/kit.lock.json` — `{version, tier, files}` — or None when unmigrated."""
        return _read_json(self.src / "lib" / "kit.lock.json")

    @property
    def kit(self) -> tuple[str, ...] | None:
        """The kit files this module vendors, from its lock; None = not migrated."""
        lock = self.kit_lock
        if lock is None:
            return None
        return tuple(lock.get("files") or ())


# Every module gets the full static battery. The three gates answer different
# questions and none of them subsumes another:
#   parse      — does each file, alone, tokenise?           (`node --check`)
#   imports    — does every named import exist where it is imported FROM?
#   i18n       — does every key the code asks for exist in lang/en.json?
# `imports` is the one that would have caught the outage of 2026-08-22: an `export`
# was deleted, every file still parsed, and the module silently never registered.
_STATIC = ("parse", "imports", "i18n")

# The blueprint gates (W3), last because they ask a different question — not "can it
# load" but "does it still match the kit and the blueprint". Both skip a module with no
# lib/kit.lock.json (not migrated); conformance is advisory until migration Stage 5.
#   vendor       every vendored kit file byte-identical to foundry/lib
#   conformance  the scorer's fail-class rules (scripts/foundry/blueprint/conformance.py)
_BLUEPRINT = ("vendor", "conformance")

MODULES = {
    "ties": ModuleSpec(
        "pentaryn-ties",
        # node-test: test/run.mjs (the blueprint's fixed body) runs the converted suites and
        # the legacy known/look/reach ones (python-tooling-7).
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "walls": ModuleSpec(
        "pentaryn-walls",
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "attunement": ModuleSpec(
        "pentaryn-attunement",
        # node-test on top of the static gates: the slot reconciliation has edge cases
        # (stale flags, deleted items, over-cap) that are tedious to stage in a browser
        # and must never throw — computeSlots runs inside a render hook.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "lookup": ModuleSpec(
        "pentaryn-lookup",
        # node-test: the whole point of the module is that its text handling is proved
        # rather than retyped. lookup-core.mjs is pure, so its fixtures run in node (`node test/run.mjs`).
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "transform": ModuleSpec(
        "pentaryn-transform",
        # node-test: transform-core.mjs decides what is stripped from a Wild Shape form, what
        # is carried back on revert, and how the Argon Bonus/Action bars are recomposed.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "A module.json change needs a Foundry restart (make vtt-down && make vtt-up); otherwise reload every client.",
            "Wild Shape and Starry Form live on the Argon Bonus bar:",
            "  game.pentaryn.transform.inspect(\"Talo\")",
            "  await game.pentaryn.transform.shift(actor, game.pentaryn.transform.forms(actor)[0].id)",
            "  await game.pentaryn.transform.revert(actor)",
        ),
    ),
    "names": ModuleSpec(
        "pentaryn-names",
        # node-test: test/run.mjs runs the characterisation suites (names guide; C39).
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), then reload.",
            "Rename an actor: token labels that were its name (or the part before the",
            "first comma) follow; nicknames stay.",
        ),
    ),
    "senses": ModuleSpec(
        "pentaryn-senses",
        # node-test: test/run.mjs runs every suite; the pure code is core/*.mjs behind the
        # senses-core.mjs barrel (chain flags and line geometry, the Light rules, the glow, migrate).
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "portals": ModuleSpec(
        "pentaryn-portals",
        # node-test: portals-core.mjs decides who a party teleport carries and who follows a PC.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "journal": ModuleSpec(
        "pentaryn-journal",
        # node-test: sanitize() is what keeps GM secrets out of a player-owned copy; it is proved
        # on synthetic fixtures before anything reaches Data/.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "aoe": ModuleSpec(
        "pentaryn-aoe",
        # node-test: core.mjs decides who is caught in an area, what a save is worth and which
        # waiting row a save answers — proved on fixtures before anything reaches Data/.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), then reload.",
            "core.moduleConfiguration['pentaryn-aoe'] can be pre-set so it loads enabled.",
            "Spell areas get a draggable/deletable handle; save spells get a GM tray on the damage roll.",
            "  game.pentaryn.aoe.sweep(canvas.scene)",
        ),
    ),
    "dropbin": ModuleSpec(
        "pentaryn-dropbin",
        # node-test: loot-core.mjs decides when the Loot all button shows and greys out.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "cursors": ModuleSpec(
        "pentaryn-cursors",
        # node-test: cursors-core.mjs picks the cursor for the active control/tool.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Tool Cursors', then reload.",
            "Each canvas tool gets its own cursor; check with  game.pentaryn.cursors.current()",
        ),
    ),
    "movement": ModuleSpec(
        "pentaryn-movement",
        # node-test: test/run.mjs runs every test/**/*.test.mjs (core, glue, api, patches …).
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "creatures": ModuleSpec(
        "pentaryn-creatures",
        # node-test: creatures-core.mjs (who gets light, strip order) is pure.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "riders": ModuleSpec(
        "pentaryn-riders",
        # node-test: riders-core.mjs (the RULES table and roll-term edits) is pure.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Feature Riders', then reload.",
            "Audit feat riders per actor:  game.pentaryn.riders.report()",
        ),
    ),
    "prompts": ModuleSpec(
        "pentaryn-prompts",
        # node-test: test/run.mjs runs the node:test suites and the legacy core one. The pure
        # code is core/*.mjs (bands, bearings, nearest-square distance, the pure sight test,
        # grouping, ids, the gather text, door lines, XP budgets; geometry-core.mjs is their
        # barrel) plus build-core.mjs / npc-core.mjs (PC ability budgets, choice matching), and
        # it carries the whole contract.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        # after_sync comes from module.json flags.pentaryn.afterSync (Wave 7 batch).
    ),
    "combat": ModuleSpec(
        "pentaryn-combat",
        # node-test: combat-core.mjs (attack counts, the Full Attack state machine, the turn flag,
        # follow-up and Sneak Attack eligibility, Multiattack parsing, weapon-set seeds) is pure.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable",
            "'Pentaryn Combat', then reload the ONE GM tab and any player tabs.",
            "Every behaviour is a world setting (default on) — README → Settings.",
            "  game.pentaryn.combat.plan(actor)      // the swings Full Attack would make",
            "  game.pentaryn.combat.report()         // riders per PC and the turn flags",
        ),
    ),
    "pings": ModuleSpec(
        "pentaryn-pings",
        # node-test: test/run.mjs runs the characterisation suites (pings guide step 9; C39).
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable",
            "'Pentaryn Ping Log', then reload the GM tab (GM clients are the only writers).",
            "  game.pentaryn.pings.recent(5)",
        ),
    ),
    "feedback": ModuleSpec(
        "pentaryn-feedback",
        # node-test: feedback-core.mjs (report schema, redaction, status rules) is pure; the glue
        # suite drives the recorder, the queue/relay delivery and the dialog markup in node.
        # after_sync comes from module.json flags.pentaryn.afterSync.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
    ),
    # The actor pipeline stages this one, not module-sync, so it is not in the CLI's
    # module list — but the static gates are free and it is real code, so it gets them.
    # node-test: test/run.mjs (the blueprint's fixed body) runs the characterisation suites
    # (importer guide step 1.11, items-journal-2; C39).
    "importer": ModuleSpec("pentaryn-importer", check=(*_STATIC, "node-test", *_BLUEPRINT)),
}
