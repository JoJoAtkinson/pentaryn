"""verify_run.py: run pg/verify.js (3 phases) on the suite's WSL harness page and write pg/verify.json"""
import sys, json, subprocess
from pathlib import Path
HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "lib"))
from h import Rig, PG
subprocess.run([str(HERE / "harness" / "start.sh"), "wsl"], check=True)
rig = Rig("state"); rig.open("gm")
js = (PG / "verify.js").read_text()
checks = []; lines = []; measured = {}; ms = 0
for ph in ("static", "resets", "scenarios"):
    try:
        v = rig.ev("gm", f"globalThis.VERIFY={{phase:'{ph}'}}; " + js, timeout=900)
    except Exception as e:
        checks.append({"name": f"phase {ph} crashed", "pass": False, "detail": str(e)[:600]}); lines.append("FAIL phase crashed " + str(e)[:300]); continue
    if isinstance(v, str): v = json.loads(v)
    if not v.get("checks"): checks.append({"name": f"phase {ph} crashed", "pass": False, "detail": str(v)[:600]}); continue
    checks += v["checks"]; lines += v["lines"]; measured.update(v.get("measured", {})); ms += v.get("ms", 0)
failed = [c for c in checks if not c["pass"]]
(PG / "verify.json").write_text(json.dumps({"pass": not failed, "failed": len(failed), "total": len(checks), "ms": ms, "measured": measured, "lines": lines, "checks": checks}, indent=1))
print("verify:", "PASS" if not failed else "FAIL", f"{len(checks)-len(failed)}/{len(checks)}")
for l in lines:
    if l.startswith("FAIL"): print(l[:300])
rig.close()
