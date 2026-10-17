#!/usr/bin/env python3
"""Skill-routing eval: does a fresh Claude session reach for the right skill?

Each case is a prompt Joe might type plus the skill(s) that count as a correct first doc
("none" = no skill applies; context/foundry/README.md is preloaded). Every case runs in a
fresh headless `claude -p` session — read-only tools, no MCP, nothing persisted — so a
prompt like "restart the server" can't do anything. The first Skill call, skill-stub read
or skill-owned doc read is the session's route.

Run:   python3 scripts/eval/skill_routing/run.py                 # every case
       python3 scripts/eval/skill_routing/run.py cases/map.json  # one file
       python3 scripts/eval/skill_routing/run.py --ids r03,map-07 --repeat 2 -p 12
Docs:  context/skills.md
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = REPO / ".output" / "skill-routing"
STUB_LINK = re.compile(r"\]\(\.\./\.\./\.\./([^)]+)\)")


def doc_to_skill() -> dict[str, str]:
    """Map each doc path to the skill whose stub points at it."""
    out = {}
    for stub in (REPO / ".claude" / "skills").glob("*/SKILL.md"):
        m = STUB_LINK.search(stub.read_text(encoding="utf-8"))
        if m:
            out[m.group(1)] = stub.parent.name
    return out


def signals(stream: str, docs: dict[str, str]) -> list[str]:
    """Tool calls in order, labelled skill:/stub:/doc: when they name a skill."""
    out = []
    for line in stream.splitlines():
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        if d.get("type") != "assistant":
            continue
        for b in d["message"].get("content", []):
            if b.get("type") != "tool_use":
                continue
            inp = b.get("input", {})
            if b["name"] == "Skill":
                out.append("skill:" + inp.get("skill", ""))
            elif b["name"] == "Read":
                p = inp.get("file_path", "").replace(f"{REPO}/", "")
                m = re.match(r"\.claude/skills/([^/]+)/", p)
                if m:
                    out.append("stub:" + m.group(1))
                elif p in docs:
                    out.append("doc:" + docs[p])
                else:
                    out.append("read:" + p)
            else:
                out.append(b["name"].lower())
    return out


def route(sig: list[str]) -> str:
    for s in sig:
        kind, _, name = s.partition(":")
        if kind in ("skill", "stub", "doc"):
            return name
    return "none"


def run_case(case: dict, docs: dict[str, str]) -> dict:
    cmd = ["claude", "-p", case["prompt"], "--tools", "Skill,Read,Grep,Glob",
           "--strict-mcp-config", "--no-session-persistence", "--max-turns", "3",
           "--output-format", "stream-json", "--verbose"]
    try:
        r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=300)
        sig = signals(r.stdout, docs)
    except subprocess.TimeoutExpired:
        sig = ["timeout"]
    got = route(sig)
    return {**case, "got": got, "pass": got in case["expected"], "signals": sig[:6]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="case files (default: cases/*.json)")
    ap.add_argument("--ids", help="comma-separated case ids to run")
    ap.add_argument("--repeat", type=int, default=1, help="runs per case (single runs are noisy)")
    ap.add_argument("-p", "--parallel", type=int, default=10)
    a = ap.parse_args()

    files = [HERE / f if not Path(f).is_absolute() else Path(f) for f in a.files] or sorted((HERE / "cases").glob("*.json"))
    cases = [c for f in files for c in json.loads(f.read_text(encoding="utf-8"))]
    if a.ids:
        want = set(a.ids.split(","))
        cases = [c for c in cases if c["id"] in want]
    cases = [dict(c, run=i) for c in cases for i in range(a.repeat)]

    docs = doc_to_skill()
    with ThreadPoolExecutor(a.parallel) as ex:
        res = list(ex.map(lambda c: run_case(c, docs), cases))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    ok = sum(r["pass"] for r in res)
    print(f"{ok}/{len(res)} pass  (results: {(OUT / 'results.json').relative_to(REPO)})")
    for r in res:
        if not r["pass"]:
            print(f"FAIL {r['id']}: want {r['expected']} got {r['got']} {r['signals'][:4]} :: {r['prompt'][:90]}")
    return 0 if ok == len(res) else 1


if __name__ == "__main__":
    sys.exit(main())
