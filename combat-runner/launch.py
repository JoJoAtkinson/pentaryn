#!/usr/bin/env python3
"""Combat-runner launcher.

Discovers encounters by scanning the vault for NPCs tagged `#combat-runner`,
walks up past any `npcs/` directory to find the encounter root, lists encounters
sorted by recency, and launches a focused Haiku Claude Code session with the
chosen encounter's full context pre-loaded (no manual `load` needed).

Per-encounter memory lives at `combat-runner/.memory/<encounter-name>/` so each
encounter persists its own state across re-runs (and stays isolated from others).

Stdlib only. Run via `make combat` or directly: `python combat-runner/launch.py`.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
WORKDIR = Path(os.environ.get("COMBAT_WORKDIR", Path.home() / "dnd-combat"))
COMBAT_TAG = "#combat-runner"
MODEL = "claude-haiku-4-5-20251001"

# Folders we never load content from when collecting encounter files.
EXCLUDED_PATH_PARTS = {".history", ".cache", ".output", "image", "images"}


# ───────────────────────── discovery ─────────────────────────

def find_tagged_files() -> list[Path]:
    """All .md files in world/ whose first ~30 lines mention the combat tag."""
    matches: list[Path] = []
    for md in (REPO_ROOT / "world").rglob("*.md"):
        if any(part in EXCLUDED_PATH_PARTS for part in md.parts):
            continue
        try:
            head = "".join(md.open(encoding="utf-8").readlines()[:30])
        except (OSError, UnicodeDecodeError):
            continue
        if COMBAT_TAG in head:
            matches.append(md)
    return matches


def encounter_root(npc_path: Path) -> Path:
    """Walk up from an NPC file until we hit a dir whose name is not 'npcs'."""
    p = npc_path.parent
    while p.name == "npcs":
        p = p.parent
    return p


def collect_encounter_files(root: Path) -> list[Path]:
    """All loadable .md files under the encounter root (recursive, filtered)."""
    files: list[Path] = []
    for md in root.rglob("*.md"):
        if any(part in EXCLUDED_PATH_PARTS for part in md.parts):
            continue
        files.append(md)
    return sorted(files)


def discover_encounters() -> list[dict]:
    """Group tagged NPCs by encounter root; sort encounters by newest mtime."""
    by_root: dict[Path, list[Path]] = {}
    for npc in find_tagged_files():
        by_root.setdefault(encounter_root(npc), []).append(npc)

    encounters: list[dict] = []
    for root, npcs in by_root.items():
        files = collect_encounter_files(root)
        if not files:
            # Tagged NPC found but its encounter root has no readable files —
            # at minimum include the NPCs themselves so the session has content.
            files = sorted(npcs)
        # Encounter recency = newest of any loadable file in the encounter
        latest = max((f.stat().st_mtime for f in files), default=root.stat().st_mtime)
        encounters.append({
            "name": root.name,
            "root": root,
            "npcs": sorted(npcs),
            "files": files,
            "mtime": latest,
        })
    encounters.sort(key=lambda e: e["mtime"], reverse=True)
    return encounters


# ───────────────────────── ui ─────────────────────────

def humanize_age(mtime: float) -> str:
    seconds = (datetime.now(timezone.utc) - datetime.fromtimestamp(mtime, tz=timezone.utc)).total_seconds()
    if seconds < 60:
        return "just now"
    if seconds < 3600:
        return f"{int(seconds // 60)}m ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)}h ago"
    return f"{int(seconds // 86400)}d ago"


def select_encounter(encounters: list[dict]) -> dict | None:
    if not encounters:
        print(f"\nNo encounters found. Tag NPC files with '{COMBAT_TAG}' in their frontmatter.\n", file=sys.stderr)
        return None

    print()
    print("\033[1mCombat encounters\033[0m (most recent first):")
    print()
    for i, enc in enumerate(encounters, 1):
        n = len(enc["npcs"])
        rel = enc["root"].relative_to(REPO_ROOT)
        print(f"  \033[36m{i}.\033[0m \033[1m{enc['name']}\033[0m  —  {n} NPC{'' if n == 1 else 's'}  —  {humanize_age(enc['mtime'])}")
        print(f"     \033[2m{rel}\033[0m")
    print()

    default = "1"
    prompt = (
        f"Press Enter for [{encounters[0]['name']}], or pick 1-{len(encounters)} (q to quit): "
        if len(encounters) > 1
        else f"Press Enter to launch [{encounters[0]['name']}] (q to quit): "
    )
    try:
        choice = input(prompt).strip() or default
    except (EOFError, KeyboardInterrupt):
        print()
        return None
    if choice.lower() in {"q", "quit", "exit"}:
        return None
    try:
        return encounters[int(choice) - 1]
    except (ValueError, IndexError):
        print(f"Invalid choice: {choice!r}", file=sys.stderr)
        return None


# ───────────────────────── context build ─────────────────────────

def encounter_npc_slugs(npc_files: list[Path]) -> list[str]:
    """Slugs (file stems) for the .md NPCs discovered in an encounter."""
    return sorted({p.stem for p in npc_files})


def load_actions_db_module():
    """Import scripts/combat_actions_db.py without polluting sys.path globally."""
    import importlib.util
    db_path = REPO_ROOT / "scripts" / "combat_actions_db.py"
    spec = importlib.util.spec_from_file_location("combat_actions_db", db_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def prepare_memory(encounter_name: str) -> dict:
    """Each launch is a new session — create a fresh timestamped log file.

    Prior session logs sit alongside in the encounter dir for manual browsing.
    The `roll_dice` tool (with description+log_path args) and the new
    `log_combat_event` tool both append timestamped Markdown bullets here.
    Python owns structure and consistency; the LLM just supplies descriptions.
    """
    from datetime import datetime as _dt
    mem_dir = SCRIPT_DIR / ".memory" / encounter_name
    mem_dir.mkdir(parents=True, exist_ok=True)
    timestamp = _dt.now().strftime("%Y-%m-%d_%H-%M-%S")
    log_path = mem_dir / f"log-{timestamp}.md"
    # Discover prior session logs (most recent first, cap at 5 for context display)
    prior_logs = sorted(
        (p for p in mem_dir.glob("log-*.md") if p != log_path),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return {
        "log_path": log_path,
        "session_timestamp": timestamp,
        "dir": mem_dir,
        "prior_logs": prior_logs[:5],
    }


_COMBAT_PADDING = """
---

# Combat reference (pre-loaded — adjudicate from here before calling search_rules)

## Action economy (D&D 5.5e)

- **Action:** Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object, special action listed in NPC actions.
- **Bonus Action:** only if specifically granted (e.g. Cunning Action, two-weapon offhand, Snow Vanish).
- **Reaction:** one per round, refreshed at start of own turn. Common triggers: opportunity attack, Counterspell, listed reactions (e.g. Rime Reflex).
- **Movement:** speed split however the creature wants; can break into pieces around an Action.
- **Free interaction:** one minor object interaction per turn (draw weapon, open unlocked door).

## Opportunity attacks

- Triggered when a hostile creature you can see leaves your reach.
- One melee attack on the leaving creature (uses your reaction).
- Disengage action prevents OAs for the turn.
- Teleporting, forced movement, and standing up from prone do NOT trigger OAs.

## Cover

- Half cover: +2 AC and +2 Dex saves.
- Three-quarters cover: +5 AC and +5 Dex saves.
- Total cover: cannot be targeted directly by an attack or spell.

## Grappled (the bite-rider thing)

- Target's speed becomes 0. No Dex bonus benefits.
- Target can use its action to make a Str (Athletics) or Dex (Acrobatics) check vs the grappler's DC (here: DC 15) to escape.
- Grappler can drag target at half speed.
- Grapple ends if grappler is incapacitated or target is moved out of reach by another effect.

## Prone

- Movement to stand up costs half the creature's speed.
- Attack rolls against a prone creature have ADVANTAGE if attacker is within 5 ft; DISADVANTAGE if attacker is farther away (typical ranged shot).
- Prone creature's own attack rolls have DISADVANTAGE.

## Concentration

- A spellcaster maintaining concentration must make a Con save (DC = max(10, damage / 2)) when damaged.
- Fail → spell ends. Pass → spell continues.
- Casting another concentration spell ends the prior one immediately.
- Being incapacitated or killed ends concentration.

## Difficult terrain

- Each foot of movement costs 2 ft of speed.
- Snow drifts, ice patches, dense undergrowth, water deeper than ankle.

## Conditions (top-of-mind reference; full details via `list_conditions`)

- **Blinded:** auto-fail sight checks; attack rolls vs blinded have ADV, blinded's attacks have DISADV.
- **Charmed:** can't attack charmer; charmer has ADV on social checks against target.
- **Frightened:** DISADV on ability checks/attack rolls while source is in line of sight; can't move closer to source.
- **Grappled:** speed 0 (see above).
- **Incapacitated:** can't take actions or reactions.
- **Invisible:** attacks ADV; attacks against have DISADV; heavily obscured.
- **Paralyzed:** incapacitated; auto-fail Str/Dex saves; attacks ADV; melee hits within 5 ft are critical.
- **Petrified:** transformed to stone; incapacitated; resists all damage; weight ×10.
- **Poisoned:** DISADV on attack rolls and ability checks.
- **Prone:** see above.
- **Restrained:** speed 0; attacks ADV; restrained's attacks DISADV; DISADV on Dex saves.
- **Stunned:** incapacitated; auto-fail Str/Dex saves; attacks ADV.
- **Unconscious:** prone, incapacitated, auto-fail Str/Dex saves; attacks ADV; melee hits within 5 ft are crits.

## Initiative & turn flow

- Initiative = d20 + Dex modifier (use `roll_dice(1, 20, modifier=<dex>)` if you need to roll for the NPC).
- Turns proceed in descending initiative; ties broken by Dex score then DM call.
- Surprised creatures take no actions in the first round.

## Stealth basics

- Stealth opposed by passive Perception.
- Heavily obscured or 3/4-covered creatures can attempt to hide.
- A creature who can see you cannot be hidden from.

## Spellcasting at a glance

- Spell save DC = 8 + proficiency + spellcasting modifier (already baked into NPC specs).
- Spell attack bonus = proficiency + spellcasting modifier (already baked in).
- For PC spells you need to adjudicate, call `search_spells(name=...)` or `get_spell_details(key=...)`.
- Area-of-effect saves: each creature in area rolls independently; half damage on success unless spell says otherwise.

---
"""


def build_session_context(encounter: dict, memory: dict, ready_reference: str = "", *, lean: bool = True, pad: bool = False) -> str:
    """Combine instructions + protocol + encounter files + ready-actions reference + log section.

    DEFAULT: `lean=True`. We trust the MCP tool description + the ready-actions
    reference to teach Haiku how to operate; the prose instructions and protocol
    are dropped. ~67% smaller prompt → ~1-2s faster per warm turn, no correctness
    regressions across the 12-turn mock-combat test.

    Set `COMBAT_LEAN_PROMPT=0` (or `false`/`no`/`off`) in the environment to opt
    back into the full verbose-protocol prompt — useful when debugging behavior
    or when teaching/sanity-checking a new combat-runner NPC.
    """
    parts: list[str] = []

    if not lean:
        parts.append((SCRIPT_DIR / "combat-instructions.md").read_text(encoding="utf-8"))
        parts.append("\n\n---\n\n# Combat Protocol (pre-loaded)\n\n")
        parts.append((REPO_ROOT / "templates" / "npc-combat-protocol.md").read_text(encoding="utf-8"))
    else:
        # Minimal seed. The MCP tool's `description` field already explains
        # roll_combat_action; we just point Haiku at the verb table + log path.
        npc_slugs = [p.stem for p in encounter["npcs"]]
        npcs_hint = (
            f"The only NPC loaded is **`{npc_slugs[0]}`** — bare verbs target it by default."
            if len(npc_slugs) == 1
            else f"NPCs loaded: {', '.join(f'`{s}`' for s in npc_slugs)}. "
                 "If the DM names a verb without naming an NPC, ask which target only when "
                 "the verb maps to multiple loaded NPCs; otherwise assume the verb's owner."
        )
        parts.append(
            "# Combat Runner\n\n"
            "You run NPCs at a D&D table. When the DM names a verb (e.g. `attack!`, "
            "`breath!`, `pounce`), call **`roll_combat_action`** immediately with the "
            "verb in the `action` field — the tool resolves verbs to action names "
            "automatically. Print the tool's `output` field verbatim and stop.\n\n"
            f"{npcs_hint}\n\n"
            "**Never ask the DM** for AC, HP, ranges, or 'does this hit?' — they have "
            "those numbers. **Never ask which NPC** if only one is loaded. Just roll, "
            "print, stop. Terse.\n"
        )

    parts.append(f"\n\n---\n\n# Encounter: {encounter['name']}\n\n")
    if not lean:
        parts.append(
            "All files below are already in your context. NPCs use the protocol above; "
            "non-NPC files give you encounter context (location overview, environment, hooks). "
            "Do NOT re-read these files. Wait for the DM to name a verb or target.\n"
        )

    # Pre-load only NPC stat sheets (not _overview / scene-context files).
    # Mechanics live in the actions DB; per-NPC tactics + status live here.
    for md in encounter["npcs"]:
        rel = md.relative_to(REPO_ROOT)
        parts.append(f"\n## File: `{rel}`\n\n")
        parts.append(md.read_text(encoding="utf-8"))

    # Ready-actions reference: the DB summary for this encounter's NPCs, so Haiku
    # knows what verbs/actions are callable without any further lookup.
    if ready_reference:
        parts.append("\n\n---\n\n")
        parts.append(ready_reference)

    # Logging path — always include (the tool needs it).
    if lean:
        parts.append(f"\n**Log path** (pass as `log_path` to `roll_combat_action`): `{memory['log_path']}`\n")
    else:
        # Combat actions + logging section — Python-owned, MCP-driven
        parts.append("\n\n---\n\n# How to run a turn (FAST PATH)\n\n")
        parts.append(
            f"**Primary tool: `mcp__dnd-scripts__roll_combat_action`.** The launcher has "
            f"preprocessed every NPC's actions into a structured registry. When the DM names a "
            f"verb (or you decide on an action via Tactics), call this ONE tool with:\n\n"
            f"```\n"
            f"roll_combat_action(\n"
            f"  npc=\"<npc-slug>\",   # e.g. \"glacier-stalker\"\n"
            f"  action=\"<verb-or-action>\",   # e.g. \"attack\", \"breath\", \"multiattack\"\n"
            f"  log_path=\"{memory['log_path']}\",\n"
            f")\n"
            f"```\n\n"
            f"The tool runs every roll Python-side (one MCP call), auto-logs them, and "
            f"returns `{{ \"output\": \"<formatted Markdown>\" }}`. **Print the `output` "
            f"field verbatim** — it already contains paired attack/damage tables, the "
            f"verbatim quantum narratives, `[ASKING PLAYER: ...]` lines, and the italic "
            f"flavor sentence. Don't re-roll; don't reformat; just print and stop.\n\n"
            f"Verb resolution is automatic — if the DM says \"attack\", the tool finds the "
            f"action whose `verbs` list contains \"attack\" and runs it.\n\n"
        )
        parts.append("## Fallback tools (only when roll_combat_action can't help)\n\n")
        parts.append(
            f"- **`roll_dice`** — for ad-hoc rolls outside the action registry "
            f"(e.g. recharge dice, an improvised contest, a custom check). Pass "
            f"`description` and `log_path=\"{memory['log_path']}\"` so it auto-logs.\n"
            f"- **`log_combat_event`** — for non-roll events not tied to a specific "
            f"action: monster dies, gets bloodied, flees, DM says \"note this\", "
            f"session-start summary. Pass `log_path=\"{memory['log_path']}\"`, a "
            f"`description`, and an optional `kind` (`death`, `note`, `phase`, `event`, "
            f"`session-start`, `session-end`).\n\n"
        )
        parts.append("## Session log file\n\n")
        parts.append(f"`{memory['log_path']}` (fresh slate — new every launch)\n\n")

    if memory["prior_logs"]:
        parts.append(f"### Prior sessions for `{encounter['name']}`\n\n")
        parts.append(
            f"{len(memory['prior_logs'])} prior session log(s) sit alongside in "
            f"`{memory['dir']}`. NOT pre-loaded. Read on demand if the DM asks "
            f"\"what happened last time\":\n\n"
        )
        for p in memory["prior_logs"]:
            parts.append(f"- `{p}`\n")
        parts.append("\n")

    if pad:
        parts.append(_COMBAT_PADDING)

    return "".join(parts)


# ───────────────────────── workspace bootstrap ─────────────────────────

def bootstrap_workspace() -> None:
    """Idempotently ensure WORKDIR has the symlinks and mcp.json the launch needs."""
    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    if not venv_python.exists():
        print(
            f"ERROR: missing venv at {venv_python}. Run `make venv` (or create .venv) "
            f"before launching combat — the dnd-scripts MCP server needs it.",
            file=sys.stderr,
        )
        sys.exit(1)

    fresh = not WORKDIR.exists()
    if fresh:
        print(f"First run — bootstrapping combat workspace at {WORKDIR}...", file=sys.stderr)
    (WORKDIR / ".claude").mkdir(parents=True, exist_ok=True)

    def ensure_symlink(link: Path, target: Path) -> None:
        if link.is_symlink():
            if link.resolve() == target.resolve():
                return
            link.unlink()
            link.symlink_to(target)
            return
        if link.exists():
            # Real file/dir occupies the slot — fail loudly. Silently skipping
            # would leave the at-table session without vault access and Haiku
            # would only discover the breakage mid-turn.
            raise RuntimeError(
                f"{link} exists but is not a symlink to {target}. "
                f"Remove or rename it, then re-launch combat."
            )
        link.symlink_to(target)

    ensure_symlink(WORKDIR / "world", REPO_ROOT / "world")
    ensure_symlink(WORKDIR / "templates", REPO_ROOT / "templates")

    # The actions DB lives in-repo at combat-runner/actions.jsonl (canonical
    # path resolved by combat_actions_db.py); the MCP server imports the DB
    # module directly. The DND_MCP_TOOLS_GROUP env var scopes the MCP server
    # to combat-tagged modules only — skips loading lore/ages/timeline/pandoc
    # at startup, dropping cold-import latency dramatically.
    mcp_config = {
        "mcpServers": {
            "dnd-scripts": {
                "type": "stdio",
                "command": str(venv_python),
                "args": [str(REPO_ROOT / "scripts" / "mcp" / "server.py")],
                "env": {
                    "PYTHONUTF8": "1",
                    "DND_MCP_TOOLS_GROUP": "combat",
                },
            }
        }
    }
    (WORKDIR / "mcp.json").write_text(json.dumps(mcp_config, indent=2), encoding="utf-8")


# ───────────────────────── main ─────────────────────────

def main() -> int:
    encounters = discover_encounters()
    encounter = select_encounter(encounters)
    if encounter is None:
        return 0

    bootstrap_workspace()

    # Query the actions DB for every action belonging to this encounter's NPCs.
    # The launcher imports the DB module directly (same Python process — no MCP
    # round-trip needed at boot). The "Ready actions" reference goes into the
    # system prompt so Haiku knows what to call without further lookups.
    actions_db = load_actions_db_module()
    npc_slugs = encounter_npc_slugs(encounter["npcs"])
    ready_reference = actions_db.format_ready_reference(npc_slugs)
    summaries = actions_db.list_actions(npcs=npc_slugs)
    npc_count = len({s["npc"] for s in summaries})
    action_count = len(summaries)

    # Per-session log file (fresh each launch); prior logs sit alongside.
    memory = prepare_memory(encounter["name"])

    # Lean prompt is the default — measured ~1-2s faster per warm turn with no
    # correctness regressions across 12 mock-combat turns. Opt out for debugging
    # or when teaching a new combat-runner NPC by setting COMBAT_LEAN_PROMPT=0.
    lean_env = os.environ.get("COMBAT_LEAN_PROMPT", "").strip().lower()
    lean = lean_env not in {"0", "false", "no", "off"}
    pad_env = os.environ.get("COMBAT_PROMPT_PAD", "").strip().lower()
    pad = pad_env in {"1", "true", "yes", "on"}
    context_file = WORKDIR / ".session-context.md"
    context_file.write_text(
        build_session_context(encounter, memory, ready_reference, lean=lean, pad=pad),
        encoding="utf-8",
    )
    prompt_chars = context_file.stat().st_size
    tags = []
    tags.append("lean" if lean else "full")
    if pad:
        tags.append("padded")
    print(
        f"→ System-prompt addition: {prompt_chars:,} chars (~{prompt_chars // 4} tokens) "
        f"[{', '.join(tags)}]",
        file=sys.stderr,
    )

    # ── SDK path (default) ─────────────────────────────────────────────────
    # Direct Anthropic SDK REPL via combat-runner/sdk_session.py. Wins:
    #   * 1-hour prompt-cache TTL (Claude Code CLI only exposes 5min)
    #   * max_tokens cap + pre-warm ping → cold turn ~no-op
    #   * Direct cache_read / cache_write observability on every turn
    # Falls back to the Claude Code CLI path when COMBAT_USE_SDK=0.
    use_sdk_env = os.environ.get("COMBAT_USE_SDK", "").strip().lower()
    use_sdk = use_sdk_env not in {"0", "false", "no", "off"}
    if use_sdk:
        if SCRIPT_DIR.as_posix() not in sys.path:
            sys.path.insert(0, str(SCRIPT_DIR))
        import sdk_session  # type: ignore[import-not-found]
        os.chdir(WORKDIR)
        print(
            f"\n→ Launching SDK session for \033[1m{encounter['name']}\033[0m"
            f"  ({npc_count} NPC{'s' if npc_count != 1 else ''} · "
            f"{action_count} preprocessed action{'s' if action_count != 1 else ''})",
            file=sys.stderr,
        )
        return sdk_session.run_repl(context_file.read_text(encoding="utf-8"))

    # ── Claude Code CLI fallback path ──────────────────────────────────────
    # Pre-allow the MCP tools, read tools, and Write to the three memory files.
    # Without permission allow, Haiku stalls on every roll_dice / Write call in -p
    # mode (no human to click approve).
    settings = {
        "model": MODEL,
        "theme": "custom:blood",
        "permissions": {
            "allow": [
                "Read",
                "Glob",
                "Grep",
                # No Write — all logging flows through MCP tools (roll_dice with
                # description+log_path args, and log_combat_event for non-roll events).
                # Python owns log structure and consistency.
                "mcp__dnd-scripts__roll_dice",
                "mcp__dnd-scripts__log_combat_event",
                "mcp__dnd-scripts__roll_combat_action",
                "mcp__dnd-scripts__search_rules",
                "mcp__dnd-scripts__get_rule_section",
                "mcp__dnd-scripts__list_conditions",
                "mcp__dnd-scripts__search_spells",
                "mcp__dnd-scripts__get_spell_details",
                "mcp__dnd-scripts__search_monsters",
                "mcp__dnd-scripts__get_monster_details",
            ]
        },
    }

    cmd = [
        "claude",
        "--model", MODEL,
        "--append-system-prompt-file", str(context_file),
        "--mcp-config", str(WORKDIR / "mcp.json"),
        "--strict-mcp-config",
        "--add-dir", str(REPO_ROOT),
        "--settings", json.dumps(settings),
        *sys.argv[1:],
    ]

    # Pre-warm: fire the same MCP server's --list-tools (with the combat group
    # filter) and a tiny dice roll, both in subprocess. This populates the OS
    # file-page cache for the .pyc bytecode and primes the quantum number cache,
    # so the first MCP call from claude is fast (no cold imports, no API fetch).
    _prewarm(REPO_ROOT)

    os.chdir(WORKDIR)
    print(
        f"\n→ Launching Haiku for encounter \033[1m{encounter['name']}\033[0m"
        f"  ({npc_count} NPC{'s' if npc_count != 1 else ''} with "
        f"{action_count} preprocessed action{'s' if action_count != 1 else ''})\n",
        file=sys.stderr,
    )
    try:
        os.execvp("claude", cmd)
    except FileNotFoundError:
        print("ERROR: `claude` CLI not found in PATH. Install Claude Code first.", file=sys.stderr)
        return 1


def _prewarm(repo_root: Path) -> None:
    """Fire-and-forget warm of MCP server imports + quantum cache.

    Spawns two short-lived subprocesses in the background that run in parallel
    with claude's own startup. By the time claude makes its first MCP tool
    call, the OS page cache is hot for the bytecode files and the quantum
    cache file likely has numbers. We do NOT wait — blocking would just delay
    the launcher; the warm subprocesses will finish whether we watch or not.
    """
    import subprocess
    venv_python = repo_root / ".venv" / "bin" / "python"
    server_py = repo_root / "scripts" / "mcp" / "server.py"

    # 1. Warm MCP server imports (combat group only). Bytecode + module init
    #    end up in OS page cache so claude's MCP spawn is hot.
    subprocess.Popen(
        [str(venv_python), str(server_py), "--list-tools"],
        env={**os.environ, "DND_MCP_TOOLS_GROUP": "combat"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )

    # 2. Warm the quantum dice cache so the first roll doesn't pay an API call.
    #    Imports dnd_roller and asks for a single number; it'll batch-fetch 1024.
    subprocess.Popen(
        [str(venv_python), "-c",
         "import sys, asyncio; sys.path.insert(0, 'scripts'); "
         "import dnd_roller; "
         "asyncio.run(dnd_roller._ensure_numbers(1))"],
        cwd=str(repo_root),
        env=os.environ.copy(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )

    print("→ Pre-warming MCP imports + dice cache (background)...", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
