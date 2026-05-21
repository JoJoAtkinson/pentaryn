#!/usr/bin/env python3
"""Testbot — fires one scenario from `scenarios.yml`, headlessly, no LLM.

Run order (per fire):
  1. Pick the next scenario (round-robin via `.testbot/run-counter`).
  2. Boot the encounter in `QT_QPA_PLATFORM=offscreen` with `with_llm=False`.
  3. Execute each turn op.
  4. Verify targets / assertions.
  5. Append a result line to `.testbot/runs/<ts>-<id>.json`.
  6. If FAILURE (any assertion / unexpected exception): write a decision
     summary to `.testbot/decisions/<ts>-<id>.md` describing what broke +
     what the bot recommends (manual fix vs. ignore).

This script is invoked by the launchd plist every 30 minutes.
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
TESTBOT_DIR = REPO_ROOT / "combat-runner" / ".testbot"
SCENARIOS_PATH = TESTBOT_DIR / "scenarios.yml"
COUNTER_PATH = TESTBOT_DIR / "run-counter"


# ─────────── env + paths ───────────

os.environ["QT_QPA_PLATFORM"] = "offscreen"
os.environ["ANTHROPIC_API_KEY"] = ""  # never spin SDK clients in the testbot
sys.path.insert(0, str(REPO_ROOT / "combat-runner"))
sys.path.insert(0, str(REPO_ROOT / "scripts"))


def _load_scenarios() -> list[dict]:
    """Tiny YAML reader — only handles the dialect our scenarios.yml uses
    (lists of dicts, scalars, nested lists). Avoids a PyYAML dep."""
    try:
        import yaml  # type: ignore
        return yaml.safe_load(SCENARIOS_PATH.read_text(encoding="utf-8"))["scenarios"]
    except ImportError:
        pass
    # Fallback: ship a JSON-equivalent file. The testbot insists on yaml
    # being available for human-friendly editing.
    raise SystemExit("pyyaml not installed; run `.venv/bin/pip install pyyaml`")


def _next_scenario_index(total: int) -> int:
    if not COUNTER_PATH.exists():
        idx = 0
    else:
        try:
            idx = int(COUNTER_PATH.read_text().strip()) % total
        except ValueError:
            idx = 0
    COUNTER_PATH.write_text(str((idx + 1) % total))
    return idx


# ─────────── scenario execution ───────────

class TestbotFailure(Exception):
    pass


def _boot(encounter_name: str):
    """Build a real MainWindow + return (app, win, harness-style helpers)."""
    from PySide6.QtWidgets import QApplication
    app = QApplication.instance() or QApplication([])
    from gui.encounter_picker import discover_encounters
    from gui.app import build_main_window
    enc = next((e for e in discover_encounters() if e.name == encounter_name), None)
    if enc is None:
        raise TestbotFailure(f"encounter {encounter_name!r} not discoverable")
    counts = {n.slug: n.default_count for n in enc.npcs}
    win = build_main_window(enc, counts, with_llm=False)
    # Stub the reaction prompt — count it but auto-PASS (we're not human)
    win._testbot_reaction_count = 0  # type: ignore[attr-defined]

    def _stub(summary, rows):
        win._testbot_reaction_count += 1
        from gui.widgets.reaction_prompt import ReactionChoice
        return ReactionChoice(npc_slug="", action_name="", triggered=False)
    win._reaction_prompt_handler = _stub  # type: ignore[method-assign]
    return app, win


def _tab(win, slug: str):
    from gui.npc_tab import NPCTab
    for i in range(win.tabs.count()):
        t = win.tabs.widget(i)
        if isinstance(t, NPCTab) and t.npc_state.slug == slug:
            return i, t
    raise TestbotFailure(f"no tab for slug {slug!r}")


def _run_scenario(scenario: dict) -> dict[str, Any]:
    metrics = {
        "id": scenario["id"],
        "title": scenario.get("title", ""),
        "encounter": scenario["encounter"],
        "click_count": 0,
        "keystrokes": 0,
        "tab_switches": 0,
        "reaction_prompts": 0,
        "watch_suggestions_observed": 0,
        "llm_fallback_count": 0,
        "errors": [],
        "passed": False,
        "duration_ms": 0,
    }
    t_start = time.monotonic()
    try:
        _app, win = _boot(scenario["encounter"])
        from PySide6.QtCore import Qt
        from PySide6.QtTest import QTest

        for op in scenario.get("turns", []):
            kind = op.get("kind")
            if kind == "switch_tab":
                idx, _ = _tab(win, op["slug"])
                if win.tabs.currentIndex() != idx:
                    win.tabs.setCurrentIndex(idx)
                    metrics["tab_switches"] += 1
            elif kind == "type":
                _, tab = _tab(win, op["tab"])
                text = op["text"]
                metrics["keystrokes"] += len(text) + 1
                QTest.keyClicks(tab.input, text)
                QTest.keyClick(tab.input, Qt.Key.Key_Return)
            elif kind == "click_round":
                QTest.mouseClick(win.round_btn, Qt.MouseButton.LeftButton)
                metrics["click_count"] += 1
            elif kind == "assert_hp":
                _, tab = _tab(win, op["slug"])
                if tab.npc_state.hp != op["expected"]:
                    raise TestbotFailure(
                        f"assert_hp on {op['slug']}: expected {op['expected']}, got {tab.npc_state.hp}"
                    )
            elif kind == "assert_member_hp":
                _, tab = _tab(win, op["slug"])
                if list(tab.npc_state.member_hp) != list(op["expected"]):
                    raise TestbotFailure(
                        f"assert_member_hp on {op['slug']}: expected {op['expected']}, "
                        f"got {tab.npc_state.member_hp}"
                    )
            elif kind == "assert_slot":
                _, tab = _tab(win, op["slug"])
                remaining = tab.npc_state.slots_remaining.get(op["action"], "<unset>")
                if remaining != op["remaining"]:
                    raise TestbotFailure(
                        f"assert_slot on {op['slug']}.{op['action']}: "
                        f"expected {op['remaining']}, got {remaining}"
                    )
            elif kind == "assert_condition":
                _, tab = _tab(win, op["slug"])
                cond = op["condition"]
                if cond not in tab.npc_state.conditions:
                    raise TestbotFailure(f"assert_condition: {op['slug']} missing {cond!r}")
                if "remaining" in op:
                    actual = tab.npc_state.condition_durations.get(cond, -1)
                    if actual != op["remaining"]:
                        raise TestbotFailure(
                            f"assert_condition remaining on {op['slug']}.{cond}: "
                            f"expected {op['remaining']}, got {actual}"
                        )
            elif kind == "assert_no_condition":
                _, tab = _tab(win, op["slug"])
                if op["condition"] in tab.npc_state.conditions:
                    raise TestbotFailure(f"assert_no_condition: {op['slug']} still has {op['condition']!r}")
            elif kind == "expect_watch":
                idx, _ = _tab(win, op["slug"])
                bucket = win._watch_suggestions.get(idx, [])
                if not any(s.action_name == op["action_name"] for s in bucket):
                    raise TestbotFailure(
                        f"expect_watch: {op['slug']} bar missing action {op['action_name']!r}"
                    )
                metrics["watch_suggestions_observed"] += 1
            elif kind == "emit_spell_cast":
                from gui.event_bus import spell_cast_event
                win.event_bus.emit(spell_cast_event(
                    caster=op.get("caster", "PC"),
                    spell_name=op.get("spell", "?"),
                    target_npc=op.get("target"),
                    spell_level=op.get("level"),
                ))
            else:
                raise TestbotFailure(f"unknown op kind: {kind!r}")

        metrics["reaction_prompts"] = win._testbot_reaction_count
        # Target checks
        tgt = scenario.get("targets", {})
        if "max_click_count" in tgt and metrics["click_count"] > tgt["max_click_count"]:
            raise TestbotFailure(
                f"target violated: click_count {metrics['click_count']} > max {tgt['max_click_count']}"
            )
        if "max_llm_fallback" in tgt and metrics["llm_fallback_count"] > tgt["max_llm_fallback"]:
            raise TestbotFailure(
                f"target violated: llm_fallback_count > {tgt['max_llm_fallback']}"
            )
        if "reaction_prompts_min" in tgt and metrics["reaction_prompts"] < tgt["reaction_prompts_min"]:
            raise TestbotFailure(
                f"target violated: reaction_prompts {metrics['reaction_prompts']} < min {tgt['reaction_prompts_min']}"
            )
        metrics["passed"] = True
    except Exception as exc:
        tb = traceback.format_exc()
        metrics["errors"].append({"type": type(exc).__name__, "message": str(exc), "traceback": tb})
        metrics["passed"] = False
    finally:
        metrics["duration_ms"] = int((time.monotonic() - t_start) * 1000)
    return metrics


def _write_decision_summary(scenario: dict, metrics: dict, ts: str) -> Path:
    """If a scenario failed, write a human-readable decision summary so the
    user can review when they come home. Includes: what failed, what the bot
    recommends, alternatives considered."""
    out = TESTBOT_DIR / "decisions" / f"{ts}-{scenario['id']}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    err = metrics["errors"][0] if metrics["errors"] else {"type": "?", "message": "?", "traceback": ""}
    out.write_text(
        f"""# Testbot decision — {scenario['id']}

- **Run timestamp:** `{ts}`
- **Scenario:** {scenario.get('title', '?')}
- **Encounter:** {scenario['encounter']}
- **Result:** FAILED
- **Duration:** {metrics['duration_ms']}ms

## What failed

```
{err['type']}: {err['message']}
```

## Traceback

```
{err.get('traceback', '(none)').strip()}
```

## Bot recommendation

This run was unattended; the bot did NOT auto-fix. It logged the failure
for human review.

**Options considered:**

1. **Auto-fix and retest** — too risky for unattended runs; the cron may
   make changes that conflict with each other across fires. Better to
   surface every failure for human review.

2. **Skip and continue** — chosen. The next fire picks a different
   scenario (round-robin). Failures accumulate in this folder.

3. **Halt the cron** — overkill for a single-scenario failure. The cron
   keeps firing; cumulative failure count is visible in `.testbot/runs/`.

## Next steps for the human

- Look at `.testbot/runs/{ts}-{scenario['id']}.json` for the full metrics.
- Reproduce by running: `.venv/bin/python combat-runner/testbot/run_one_scenario.py --id {scenario['id']}`
- Fix the underlying issue (probably in `combat-runner/gui/` or `scripts/combat_actions_db.py`).
- Delete this decision file once handled.
""",
        encoding="utf-8",
    )
    return out


def main() -> int:
    TESTBOT_DIR.mkdir(parents=True, exist_ok=True)
    (TESTBOT_DIR / "runs").mkdir(parents=True, exist_ok=True)
    (TESTBOT_DIR / "decisions").mkdir(parents=True, exist_ok=True)

    scenarios = _load_scenarios()
    # CLI: pick a specific scenario by id for manual repro
    target_id = None
    for i, arg in enumerate(sys.argv):
        if arg == "--id" and i + 1 < len(sys.argv):
            target_id = sys.argv[i + 1]

    if target_id:
        scenario = next((s for s in scenarios if s["id"] == target_id), None)
        if scenario is None:
            print(f"no scenario with id={target_id!r}", file=sys.stderr)
            return 1
    else:
        idx = _next_scenario_index(len(scenarios))
        scenario = scenarios[idx]

    ts = datetime.now().strftime("%Y%m%dT%H%M%S")
    print(f"testbot fire {ts}: scenario={scenario['id']} ({scenario['encounter']})")

    metrics = _run_scenario(scenario)

    run_path = TESTBOT_DIR / "runs" / f"{ts}-{scenario['id']}.json"
    run_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    if not metrics["passed"]:
        dec = _write_decision_summary(scenario, metrics, ts)
        print(f"  FAILED — see {dec.relative_to(REPO_ROOT)}", file=sys.stderr)
        return 1
    print(f"  passed ({metrics['duration_ms']}ms)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
