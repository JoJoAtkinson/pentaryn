#!/usr/bin/env python3
"""Mine past sessions for real routing cases: what Joe typed → which context doc got read.

Reads the Claude Code transcripts for this repo (~/.claude/projects/<repo>/*.jsonl) and
writes candidate pairs to .output/skill-routing/mined.json. They are candidates, not
cases: many prompts only make sense mid-conversation ("sure, do it"). Copy the ones that
stand on their own into cases/real.json, with every skill that would be a correct first doc.

Run:   python3 scripts/eval/skill_routing/mine.py
Docs:  context/skills.md
"""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
PROJECT = Path.home() / ".claude" / "projects" / str(REPO).replace("/", "-")
OUT = REPO / ".output" / "skill-routing" / "mined.json"
DOC = re.compile(r"context/[\w./-]+\.md")


def mine(transcript: Path) -> list[dict]:
    pairs, cur = [], None
    for line in transcript.open(errors="ignore"):
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = d.get("message", {})
        if d.get("type") == "user" and not d.get("isMeta") and not d.get("isCompactSummary"):
            text = msg.get("content")
            if isinstance(text, str) and not text.startswith("<") and len(text) > 15:
                if cur and cur["docs"]:
                    pairs.append(cur)
                cur = {"session": transcript.stem[:8], "prompt": text[:600], "docs": []}
        if d.get("type") == "assistant" and cur and len(cur["docs"]) < 2:
            for b in msg.get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_use" and b["name"] in ("Read", "Bash", "Grep"):
                    for p in DOC.findall(json.dumps(b.get("input", {}))):
                        if "plans/" not in p and p not in cur["docs"]:
                            cur["docs"].append(p)
    if cur and cur["docs"]:
        pairs.append(cur)
    return pairs


def main() -> None:
    seen, out = set(), []
    for t in sorted(PROJECT.glob("*.jsonl")):
        for p in mine(t):
            if p["prompt"] not in seen:  # forked sessions repeat their history
                seen.add(p["prompt"])
                out.append(p)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(out)} candidate pairs → {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
