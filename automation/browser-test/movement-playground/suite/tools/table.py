"""table.py <round> [<round>...] : one markdown row per check (median of runs) from out/<round>/results.jsonl"""
import sys, json, statistics
from pathlib import Path
H = Path(__file__).resolve().parent.parent
rows = []
for r in sys.argv[1:]:
    p = H / "out" / r / "results.jsonl"
    if p.exists(): rows += [json.loads(l) for l in p.read_text().splitlines() if l.strip()]
by = {}
for r in rows: by.setdefault((r["id"], r["path"]), []).append(r)
print("| id | path | runs | verdict | number | what 0.9.0 did |"); print("|---|---|---|---|---|---|")
for (i, pth), rr in sorted(by.items()):
    v = "fail" if any(x["verdict"] == "fail" for x in rr) else rr[-1]["verdict"]
    if v == "fail" and all(x.get("xfail") for x in rr if x["verdict"] == "fail"): v = "xfail (010)"
    nums = [x["number"] for x in rr if x.get("number") is not None]
    n = f"{statistics.median(nums):.4g}{rr[0].get('unit') or ''}" if nums else ""
    note = (rr[0].get("note") or "").replace("|", "/")[:200]
    print(f"| {i} | {pth} | {len(rr)} | {v} | {n} | {note} |")
