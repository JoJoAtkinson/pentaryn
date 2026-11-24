"""regenerate checks.md from the registry: python tools/mkchecks.py"""
import sys, importlib, glob, os
from pathlib import Path
H = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(H / "lib"), str(H / "checks")]
import fw
for f in sorted(glob.glob(str(H / "checks" / "s*.py"))): importlib.import_module(os.path.basename(f)[:-3])
from h import ST
KIND = {"HARD": "HARD (zero tolerance)", "GATED": "GATED (a number against a threshold)", "REPORTED": "REPORTED (never gates)"}
L = ["# ZZ Playground suite - the checks", "",
     f"{len(fw.CHECKS)} checks over {len({c['station'] for c in fw.CHECKS})} stations. Id = station + letter. Path: `state` = WSL harness (software GL: positions at rest, notices, charges, shapes, errors), `gpu` = BOSS GPU Chrome (timing, one motion, z-order, two screens, plan time, long frames), `both` = runs on each. `runs` = 3 for timing checks (void when the host load is over 3), else 1. `010` = new in 0.10: expected to fail on 0.9.0 (`expect010`, reported as xfail).", "",
     "Every check starts from the station's reset (its scenario and mode), does one thing with real mouse input where a person would, and ends with no combat. Every HARD check also runs the guards: no module error in the console, the breaker did not trip, no token through a wall or shut door (drawn path and route, one-way walls by side), no token through or onto a standing token outside the group, no two tokens overlapping at rest (circle metric), every member moving or named within 4 s of the drop, and no notice that the check does not expect.", ""]
by = {}
for c in fw.CHECKS: by.setdefault(c["station"], []).append(c)
for st in sorted(by):
    L += [f"## {st} {ST[st]['name']}", "", "| id | path | kind | runs | 010 | scenario/mode | what it checks |", "|---|---|---|---|---|---|---|"]
    for c in sorted(by[st], key=lambda c: c["id"]):
        L.append(f"| {c['id']} | {c['path']} | {c['kind']} | {c['runs']} | {'yes' if c['expect010'] else ''} | {c['scenario']}/{c['mode']}{' pa' if 'pa' in c['pages'] else ''}{' pb' if 'pb' in c['pages'] else ''} | {c['title']} |")
    L.append("")
(H / "checks.md").write_text("\n".join(L) + "\n")
print(len(fw.CHECKS), "checks ->", H / "checks.md")
