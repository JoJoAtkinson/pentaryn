"""standing.py [--rounds a,b,c] : every check's LATEST result over all rounds so far -> out/standing.md (+ out/standing.json).
A check's latest result = its rows in the newest round that ran it (all runs; any failing run = fail). Rounds are ordered by the time their results.jsonl was last written.
A path=both timing (GATED) check is judged on its gpu row; its state row is indicative (software GL) and shown only.
Kinds: HARD and GATED count (hardFails / gatedFails); REPORTED never does."""
import sys, json, statistics, re
from pathlib import Path
H = Path(__file__).resolve().parent.parent
OUT = H / "out"
sys.path[:0] = [str(H / "lib"), str(H / "checks")]
import importlib
from fw import CHECKS
for f in sorted((H / "checks").glob("s*.py")): importlib.import_module(f.stem)
reg = {c["id"]: c for c in CHECKS}
rounds = sorted([d for d in OUT.iterdir() if (d / "results.jsonl").exists()], key=lambda d: (d / "results.jsonl").stat().st_mtime)
want = None
if "--rounds" in sys.argv: want = set(sys.argv[sys.argv.index("--rounds") + 1].split(","))
latest = {}   # (id, path) -> (round name, rows)
for d in rounds:
    if want and d.name not in want: continue
    rows = [json.loads(l) for l in (d / "results.jsonl").read_text().splitlines() if l.strip()]
    by = {}
    for r in rows: by.setdefault((r["id"], r["path"]), []).append(r)
    for k, rr in by.items(): latest[k] = (d.name, rr)

def verdict(rr):
    vs = [r["verdict"] for r in rr]
    if "fail" in vs: return "fail"
    if "pass" in vs: return "pass"
    if "void" in vs: return "void"
    return "skip"

res = {}   # id -> {path: dict}
for (i, p), (rnd, rr) in latest.items():
    nums = [x["number"] for x in rr if x.get("number") is not None]
    bad = next((x for x in rr if x["verdict"] == "fail"), rr[-1])
    res.setdefault(i, {})[p] = dict(round=rnd, verdict=verdict(rr), version=rr[-1].get("version"), kind=rr[0]["kind"], number=(statistics.median(nums) if nums else None), unit=rr[0].get("unit"), note=(bad.get("note") or "")[:230], runs=len(rr), instr=any(x.get("instr_error") for x in rr), loaded=any(x.get("loaded") for x in rr))

def judged(i):
    c = reg.get(i); d = res[i]
    if c and c["path"] == "both" and c["timing"] and "gpu" in d: return d["gpu"]
    bad = [v for v in d.values() if v["verdict"] == "fail"]
    return bad[0] if bad else next(iter(d.values()))

stations = {}
for i in sorted(res, key=lambda s: (s.split(".")[0], re.sub(r"(\d+)$", lambda m: m.group(1).zfill(3), s.split(".")[1]))): stations.setdefault(i.split(".")[0], []).append(i)
tot = dict(hard=0, hardfail=0, gated=0, gatedfail=0, rep=0, repfail=0, void=0)
failing = []; lines = []; tab = []
names = {}
try:
    from h import ST
    names = {k: v["name"] for k, v in ST.items()}
except Exception: pass
for st in sorted(stations):
    ids = stations[st]; c = dict(p=0, f=0, rp=0, rf=0, v=0, fl=[])
    L = [f"## {st} {names.get(st, '')}", "", "| id | kind | path | result | number | round | note |", "|---|---|---|---|---|---|---|"]
    for i in ids:
        j = judged(i); k = j["kind"]; v = j["verdict"]
        for p, d in sorted(res[i].items()):
            tag = d["verdict"] + (" (indicative)" if (reg.get(i) and reg[i]["path"] == "both" and reg[i]["timing"] and p == "state") else "") + (" [INSTRUMENT]" if d["instr"] else "") + (" [loaded]" if d["loaded"] else "")
            num = "" if d["number"] is None else f"{d['number']:.4g}{d['unit'] or ''}"
            L.append(f"| {i} | {d['kind']} | {p} | {tag} | {num} | {d['round']} ({d['version']}) | {d['note'].replace('|', '/')} |")
        if k == "HARD": tot["hard"] += 1; tot["hardfail"] += v == "fail"
        elif k == "GATED": tot["gated"] += 1; tot["gatedfail"] += v == "fail"
        else: tot["rep"] += 1; tot["repfail"] += v == "fail"
        tot["void"] += v == "void"
        if v == "fail":
            c["f" if k in ("HARD", "GATED") else "rf"] += 1; c["fl"].append(i)
            if k in ("HARD", "GATED"): failing.append((i, k, j["note"]))
        elif v == "pass": c["p"] += 1
        elif v == "void": c["v"] += 1
    tab.append((st, names.get(st, ""), len(ids), c["p"], c["f"], c["rf"], c["v"], " ".join(c["fl"])))
    lines += L + [""]
head = ["# ZZ Playground suite - the standing (every check's latest result, all rounds so far)", "",
        f"rounds read: {', '.join(d.name for d in rounds if not want or d.name in want)} | module versions seen: {sorted({r['version'] for d in res.values() for r in d.values() if r['version']})}",
        f"HARD {tot['hard']} checks, {tot['hardfail']} failing | GATED {tot['gated']}, {tot['gatedfail']} failing | REPORTED {tot['rep']} ({tot['repfail']} not clean) | void {tot['void']}", "",
        "| station | checks | pass | HARD/GATED fail | reported not clean | void | failing ids |", "|---|---|---|---|---|---|---|"]
for st, n, cnt, p, f, rf, v, fl in tab: head.append(f"| {st} {n[:24]} | {cnt} | {p} | {f} | {rf} | {v} | {fl[:80]} |")
head += ["", "Failing (HARD and GATED):", ""] + [f"- {i} ({k}): {note[:160]}" for i, k, note in failing] + [""]
(OUT / "standing.md").write_text("\n".join(head + lines) + "\n")
(OUT / "standing.json").write_text(json.dumps(dict(totals=tot, failing=failing, table=tab, results=res), indent=1, default=str))
print("\n".join(head))
