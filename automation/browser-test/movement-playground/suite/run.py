"""ZZ Playground suite entry: run.sh <round> [all | S03,S05,...] [state | gpu | both] [--indicative] [--void-loaded] [--list] [--only S01.a,S03.b]"""
import sys, os, json, time, subprocess, importlib, datetime
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE / "lib"), str(HERE / "checks")]
import fw
from fw import CHECKS, run_checks, Results, write_reports, OUT
from h import Rig, load_avg, ST, MYUSERS

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = [a for a in sys.argv[1:] if a.startswith("--")]
only = None
if "--only" in flags: only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
args = [a for a in args if not (only and a == sys.argv[sys.argv.index("--only") + 1])]
for f in sorted((HERE / "checks").glob("s*.py")): importlib.import_module(f.stem)
if "--list" in flags:
    for c in CHECKS: print(f"{c['id']:8s} {c['path']:5s} {c['kind']:8s} runs={c['runs']} {'expect010' if c['expect010'] else '':9s} {c['title']}")
    print(len(CHECKS), "checks"); sys.exit(0)
rnd = args[0] if args else "r0"
sel = args[1] if len(args) > 1 else "all"
which = args[2] if len(args) > 2 else "both"
stations = sorted(ST) if sel == "all" else sel.split(",")
paths = ["state", "gpu"] if which == "both" else [which]
rd = OUT / rnd; rd.mkdir(parents=True, exist_ok=True)
ctx = dict(round=rnd, paths=paths, stations=sel, started=datetime.datetime.now().isoformat(timespec="seconds"), load0=load_avg(), indicative="--indicative" in flags)
print(f"round {rnd} stations={stations} paths={paths} load={ctx['load0']:.2f}", flush=True)
res = None; rig = None; snap0 = None; first = None
try:
    for pth in paths:
        sel_checks = [c for c in CHECKS if c["station"] in stations and c["path"] in (pth, "both") and (not only or c["id"] in only)]
        if not sel_checks: continue
        sh = subprocess.run([str(HERE / "harness" / "start.sh"), "wsl" if pth == "state" else "gpu"], capture_output=True, text=True)
        print(sh.stdout.strip(), sh.stderr.strip()[:300], flush=True)
        rig = Rig(pth); rig.open("gm")
        if snap0 is None:
            snap0 = rig.settings_snapshot(); act = rig.active_users()
            ctx["active0"] = act; ctx["version"] = rig.ev("gm", "return game.modules.get('pentaryn-movement').version")
            real = [u for u in act if u not in MYUSERS and u != "Claude" and not u.startswith("ZZ ")]
            if real: raise SystemExit(f"ABORT: real users are online: {real}")
            others = [u for u in act if u.startswith("ZZ ") and u not in MYUSERS]
            if others: print("WARN other ZZ users active (another agent?):", others, flush=True)
            need = {"assist": True, "groupDrags": True, "groupStagger": True, "pathfinding": "everyone"}
            for k, v in need.items():
                if snap0.get(k) != v: print(f"setting {k}: {snap0.get(k)} -> {v} (restored at the end)"); rig.set_setting(k, v)
            res = Results(rd, ctx["version"])
        print(f"== path {pth}: {len(sel_checks)} checks", flush=True)
        run_checks(rig, rd, sel_checks, res, load_policy="void" if ("--void-loaded" in flags) else ("none" if "--indicative" in flags else "wait"))
        try: rig.reset("all", "default", "paths", keys=["gm"])
        except Exception as e: print("final reset failed", e)
        rig.close()
finally:
    if rig is not None and snap0 is not None:
        try:
            if not rig.pages: rig.open("gm")
            ch = rig.settings_restore(snap0); ctx["settings_note"] = json.dumps(ch) if ch else "unchanged"
            rig.close()
        except Exception as e: ctx["settings_note"] = f"RESTORE FAILED: {e}"
    if res is not None:
        tot = write_reports(rd, res, ctx); print("done", tot, flush=True)
