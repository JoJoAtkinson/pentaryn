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
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "Enable 'Pentaryn Wall Autocomplete' in Manage Modules, reload, then:",
            "  await game.pentaryn.walls.preview()",
        ),
    ),
    "attunement": ModuleSpec(
        "pentaryn-attunement",
        # node-test on top of the static gates: the slot reconciliation has edge cases
        # (stale flags, deleted items, over-cap) that are tedious to stage in a browser
        # and must never throw — computeSlots runs inside a render hook.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "Enable 'Pentaryn Attunement Slots' in Manage Modules, then reload.",
            "The strip renders in the character sheet sidebar, under the stats card.",
            "Drag an inventory item onto a slot to attune; drop onto a filled slot to",
            "replace it; right-click a slot (or its ✕) to unattune.",
            "Audit an actor:  game.pentaryn.attunement.report('Ballad Quinn')",
        ),
    ),
    "lookup": ModuleSpec(
        "pentaryn-lookup",
        # node-test: the whole point of the module is that its text handling is proved
        # rather than retyped. lookup-core.mjs is pure, so its fixtures run in node (`node test/run.mjs`).
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "Enable 'Pentaryn Rules Lookup' in Manage Modules, then reload.",
            "Confirm against the live world:",
            "  await game.pentaryn.rules.selftest()",
            "Then:",
            "  await game.pentaryn.rules.search('half cover')",
            "  await game.pentaryn.rules.monster('Adult Black Dragon')",
        ),
    ),
    "transform": ModuleSpec(
        "pentaryn-transform",
        # node-test: transform-core.mjs decides what is stripped from a Wild Shape form, what
        # is carried back on revert, and how the Argon Bonus/Action bars are recomposed.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "0.2 adds hud.mjs and styles/transform.css to module.json — restart Foundry",
            "(make vtt-down && make vtt-up); a browser reload alone will not load them.",
            "Then reload every client. Wild Shape lives on the Argon Bonus bar:",
            "  game.pentaryn.transform.forms(actor)            // the picker's tiles",
            "  await game.pentaryn.transform.shift(actor, id)  // what a tile click does",
            "  await game.pentaryn.transform.revert(actor)",
        ),
    ),
    "names": ModuleSpec(
        "pentaryn-names",
        check=(*_STATIC, *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), then reload.",
            "Rename an actor: token labels that were its name (or the part before the",
            "first comma) follow; nicknames stay.",
        ),
    ),
    "senses": ModuleSpec(
        "pentaryn-senses",
        # node-test: chain-core.mjs (the token chain's flag reading and line geometry) is pure.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), then reload.",
            "Already enabled? A browser RELOAD (F5) picks up new .mjs files and assets.",
            "Token vision is dnd5e's senseVisionSync (6.0+); the one-shot reset of stored",
            "darkvision runs at GM ready — check game.settings.get('pentaryn-senses', 'sightReset') === 1",
            "Token chains: game.pentaryn.chain.links() · Token HUD → Break chain.",
        ),
    ),
    "portals": ModuleSpec(
        "pentaryn-portals",
        # node-test: portals-core.mjs decides who a party teleport carries and who follows a PC.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), then reload.",
            "Teleport confirmations now show destination cards; author them in Region config → Portal card.",
        ),
    ),
    "journal": ModuleSpec(
        "pentaryn-journal",
        # node-test: sanitize() is what keeps GM secrets out of a player-owned copy; it is proved
        # on synthetic fixtures before anything reaches Data/.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Player Journal', then reload.",
            "Players get an 'Add to my journal' bar on every eye readable.",
            "GM prep (optional, also runs on GM ready): game.pentaryn.journal.ensureAll()",
            "Test from your own client: Settings → Pentaryn Player Journal → Show the Add button to the GM",
        ),
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
        after_sync=(
            "Already enabled? A browser RELOAD (F5) picks up .mjs changes; module.json needs a restart.",
            "Item Piles loot windows get a 'Loot all' button; corpses show Dead as the overlay plus a drawn eye.",
            "  game.pentaryn.dropbin.corpses.migrateLegacyEyes()",
        ),
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
        # node-test: movement-core.mjs (owned-on-top sort, ghost policy) is pure.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Movement', then reload.",
            "Players get a Ghost toggle in the token tools; the GM sets the policy in settings.",
            "  game.pentaryn.movement.status()",
        ),
    ),
    "creatures": ModuleSpec(
        "pentaryn-creatures",
        # node-test: creatures-core.mjs (who gets light, strip order) is pure.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Creatures', then reload.",
            "Player-owned NPC tokens get a small light; players with 2+ tokens get a 'Your creatures' strip.",
            "  game.pentaryn.creatures.syncAll()",
        ),
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
        # node-test: geometry-core.mjs (bands, bearings, nearest-square distance, the pure sight
        # test, grouping, ids, the gather text, door lines, XP budgets) and build-core.mjs (PC
        # ability budgets, choice matching) are pure and carry the whole contract.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable",
            "'Pentaryn Prompt Markers', then reload the ONE GM tab. The six 'Prompt ·' actors",
            "appear in the 'Prompt Markers' folder at GM ready.",
            "  game.pentaryn.prompts.status()",
            "  await game.pentaryn.prompts.gather({scenes: 'current'})",
            "Marker art: ./.venv/bin/python scripts/foundry/prompt_marker_art.py",
        ),
    ),
    "combat": ModuleSpec(
        "pentaryn-combat",
        # node-test: combat-core.mjs (attack counts, the Full Attack state machine, the turn flag,
        # follow-up and Sneak Attack eligibility, Multiattack parsing, weapon-set seeds) is pure.
        check=(*_STATIC, "node-test", *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable",
            "'Pentaryn Combat', then reload the ONE GM tab and any player tabs.",
            "Every behaviour is a world setting (default on) — README → Adjustments.",
            "  game.pentaryn.combat.plan(actor)      // the swings Full Attack would make",
            "  game.pentaryn.combat.report()         // riders per PC and the turn flags",
        ),
    ),
    "pings": ModuleSpec(
        "pentaryn-pings",
        # Static gates only until its migration adds test/run.mjs (pings guide step 9 then
        # adds node-test; C39).
        check=(*_STATIC, *_BLUEPRINT),
        after_sync=(
            "First install: restart Foundry (module.json is read at startup), enable",
            "'Pentaryn Ping Log', then reload the GM tab (GM clients are the only writers).",
            "  game.pentaryn.pings.recent(5)",
        ),
    ),
    # The actor pipeline stages this one, not module-sync, so it is not in the CLI's
    # module list — but the static gates are free and it is real code, so it gets them.
    # node-test: test/run.mjs (the blueprint's fixed body) runs the characterisation suites
    # (importer guide step 1.11, items-journal-2; C39).
    "importer": ModuleSpec("pentaryn-importer", check=(*_STATIC, "node-test", *_BLUEPRINT)),
}
