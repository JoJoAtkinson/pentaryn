"""The suite's framework: check registry, test context, guards, results.jsonl / summary.md / fails.md."""
import gzip, json, os, re, shutil, sys, time, traceback
from pathlib import Path
import numpy as np
from h import Rig, ST, G, SUITE, load_avg, par
from an import Obs

CHECKS = []
OUT = SUITE / "out"


def check(id, station, title, path="both", kind="HARD", runs=1, expect010=False, scenario="default", mode="paths", pages=("gm",), timing=False, latency=None, share=None):
    """register a check. path: state | gpu | both. kind: HARD | GATED | REPORTED. timing=True: three runs, voided when the host is loaded."""
    def deco(fn):
        CHECKS.append(dict(id=id, station=station, title=title, path=path, kind=kind, runs=3 if timing and runs == 1 else runs, expect010=expect010, scenario=scenario, mode=mode, pages=tuple(pages), timing=timing, fn=fn, latency=latency, share=None if timing else share))
        return fn
    return deco


class Skip(Exception): pass
class Void(Exception): pass


def pt(st, name):
    c = ST[st]["points"][name]["c"]; return (c[0], c[1])


def tok_names(st, pred=None):
    return [t["name"] for t in ST[st]["tokens"] if (pred is None or pred(t))]


def heroes(st): return tok_names(st, lambda t: t.get("hero"))


def fmt_pos(obs, names):
    return {n: [round(obs.c0(n)[0] / G, 2), round(obs.c0(n)[1] / G, 2), "->", round(obs.c1(n)[0] / G, 2), round(obs.c1(n)[1] / G, 2)] for n in names if n in obs.init and n in obs.docs}


class T:
    """test context handed to a check"""
    def __init__(self, rig, chk, run, rd):
        self.rig = rig; self.chk = chk; self.run = run; self.rd = rd; self.did = []; self.obs = None; self.shots = []; self.extra = {}
        self.cleanups = []; self.station = chk["station"]; self.path = rig.path; self.scenario = chk["scenario"]; self.mode = chk["mode"]

    def say(self, s): self.did.append(s)

    def walk(self, names, ft=30):
        """a fight needs a speed: set the walk speed of the (ZZ) actors behind these tokens, restored when the check ends (also if it crashes)"""
        r = self.rig.ev("gm", """const names=%s; const out={}; for (const n of names){ const t=canvas.scene.tokens.getName(n); const a=t?.actor; if(!a||!/^ZZ /.test(a.name)) continue; out[a.id]=a.system.attributes.movement.walk; if(out[a.id]!==%d) await a.update({'system.attributes.movement.walk':%d}); } return JSON.stringify(out);""" % (json.dumps(names), ft, ft))
        self.say(f"set walk speed {ft} ft on {len(r)} ZZ actors (restored after)")
        def undo():
            self.rig.ev("gm", "const o=%s; for (const [id,v] of Object.entries(o)){ const a=game.actors.get(id); if(a && /^ZZ /.test(a.name)) await a.update({'system.attributes.movement.walk':v}); } return 1" % json.dumps(r))
        self.cleanups.append(undo); return r

    def shared(self, key, fn):
        """one recorded action shared by adjacent checks that judge the same drag (each check still starts from the reset: the shared action did)"""
        c = self.rig.cache
        if key in c and self.chk.get("share") == key:
            obs, did = c[key]; self.did += did + ["(the same recorded drag as the check before)"]; self.obs = obs; return obs
        n0 = len(self.did); obs = fn(); self.rig.cache = {key: (obs, self.did[n0:])}; return obs

    def reset(self, scenario=None, mode=None, station=None):
        scenario = scenario or self.scenario; mode = mode or self.mode; station = station or self.station
        self.say(f"reset {station} scenario={scenario} mode={mode}")
        r = self.rig.reset(station, scenario, mode, keys=list(self.rig.pages))
        self.scenario, self.mode = scenario, mode
        return r

    def act(self, fn, key="gm", group=None, meta=None, settle=25, shot=True):
        """record every page while fn() acts; wait for rest; snapshot docs and status; screenshot. Returns an Obs."""
        rig = self.rig; keys = list(rig.pages)
        walls0 = rig.walls()
        rig.rec_start(keys)
        t0 = time.time()
        try:
            extra = fn() or {}
        except Exception as e:
            extra = {"actError": str(e)[:500]}; self.say(f"ACTION ERROR {e}")
        w = rig.wait_quiet(keys, timeout=settle)
        raw = rig.rec_stop(keys); snap = rig.snapshot(keys)
        m = dict(meta or {}, key=key, group=list(group or []), restS=w, actS=round(time.time() - t0, 1), **extra)
        obs = Obs(rig.path, raw, snap, m, walls0)
        self.obs = obs
        if shot:
            try:
                d = self.rd / "shots"; d.mkdir(exist_ok=True); f = d / f"{self.chk['id']}-r{self.run}-{rig.path}.png"
                rig.view_fit(key, self.station); time.sleep(0.4); rig.shot(key, f); self.shots.append(str(f))
            except Exception as e: self.say(f"shot failed {e}")
        return obs

    def drag(self, group, grab, to, key="gm", via=None, hold=None, meta=None, settle=25):
        hold = hold if hold is not None else int(os.environ.get("ZZ_HOLD", "250"))   # ms the pointer rests on the drop point before release (ZZ_HOLD=1500: a slower human)
        self.say(f"select {len(group)} ({', '.join(g.split(' ', 1)[1] for g in group) if len(group) < 9 else str(len(group)) + ' tokens'}), grab {grab}, real mouse drag to ({to[0]:.0f},{to[1]:.0f}) on page {key}")
        return self.act(lambda: {"drag": self.rig.drag(key, group, grab, to, hold=hold, via=via)}, key=key, group=group, meta=dict(meta or {}, grab=grab, dest=to), settle=settle)

    # ---- verdicts
    def guards(self, obs, group=None, notices_ok=(), account=True, rest=True, walls=True, standing=True, still_ok=(), skip=()):
        group = group if group is not None else obs.meta.get("group", [])
        out = []
        errs = obs.module_errors()
        out.append(("no module errors in the console", not errs, "; ".join(f"{e['page']}:{e['text'][:120]}" for e in errs[:2])))
        tr = obs.tripped()
        out.append(("breaker did not trip", not tr, json.dumps(tr)[:160]))
        if walls:
            h = obs.wall_hits()
            out.append(("no token through a wall or shut door", not h, "; ".join(f"{x['token']} wall {x['wall'][:6]} at {x['at']} ({x['src']})" for x in h[:3])))
        if standing:
            sh = obs.standing_hits([g for g in group])
            out.append(("no token through or onto a standing token", not sh, "; ".join(f"{x['mover']} in {x['standing']} {x['depth_sq']} sq" for x in sh[:3])))
        if rest:
            ov = obs.rest_overlaps()
            out.append(("no two tokens overlap at rest", not ov, "; ".join(f"{x['a']}/{x['b']} {x['depth_sq']} sq" for x in ov[:3])))
        if account and group:
            bad = []
            for n in group:
                if n in still_ok or n not in obs.init: continue
                fa = obs.first_action(n)
                if obs.named(n): continue
                if fa is None or (obs.dropT and fa - obs.dropT > 4000): bad.append(f"{n} ({'never moved' if fa is None else str(round(fa - obs.dropT)) + ' ms'})")
            out.append(("every member moving or named within 4 s", not bad, "; ".join(bad[:4])))
        un = [n for n in obs.notices() if not any(re.search(p, n["text"], re.I) for p in notices_ok)]
        out.append(("no unexpected notice", not un, "; ".join(f"[{n['type']}] {n['text'][:90]}" for n in un[:3])))
        return [g for g in out if g[0] not in skip]

    def verdict(self, obs, conds, num=None, unit=None, guards=True, expected=None, **gk):
        """conds: [(name, ok, seen)]; guards run unless guards=False (or a dict of guards kwargs)"""
        allc = list(conds)
        if guards: allc += self.guards(obs, **(guards if isinstance(guards, dict) else {}), **gk)
        fails = [c for c in allc if not c[1]]
        seen = "; ".join(f"{c[0]}: {c[2]}" if c[2] != "" else c[0] for c in fails) if fails else "; ".join(c[0] for c in conds)[:240]
        return {"ok": not fails, "num": num, "unit": unit, "note": seen[:600], "conds": allc, "expected": expected or "; ".join(c[0] for c in conds)}


def sanitize(o):
    if isinstance(o, dict): return {str(k): sanitize(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [sanitize(v) for v in o]
    if isinstance(o, (np.floating,)): return float(o)
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, np.ndarray): return o.tolist()
    if isinstance(o, np.bool_): return bool(o)
    return o


class Results:
    def __init__(self, rd, version=None):
        self.rd = rd; self.rows = []; self.fails = []; self.version = version; self.f = open(rd / "results.jsonl", "a")

    def add(self, row, fail_detail=None):
        row = sanitize(row); self.rows.append(row); self.f.write(json.dumps(row) + "\n"); self.f.flush()
        if row["verdict"] == "fail": self.fails.append((row, sanitize(fail_detail or {})))


def run_checks(rig, rd, checks, res, load_policy="wait", log=print):
    """run the selected checks on this rig's path"""
    ev_dir = rd / "ev"; ev_dir.mkdir(exist_ok=True)
    pages_needed = set(["gm"])
    for c in checks: pages_needed |= set(c["pages"])
    rig.ensure(sorted(pages_needed, key=lambda k: (k != "gm", k)))
    for c in checks:
        rig.ensure(sorted(set(["gm"]) | set(c["pages"]), key=lambda k: (k != "gm", k)))
        if c["latency"] is not None and rig.path == "gpu":
            for k in rig.pages:
                if k != "gm": rig.ev(k, f"window.__latCfg.lo={max(1, c['latency'] - 5)}; window.__latCfg.hi={c['latency'] + 5}; return 1")
        for run in range(1, c["runs"] + 1):
            t = T(rig, c, run, rd)
            row = {"id": c["id"], "station": c["station"], "path": rig.path, "run": run, "kind": c["kind"], "title": c["title"], "expect010": c["expect010"], "version": res.version}
            t0 = time.time(); detail = None
            try:
                load = load_avg()
                if c["timing"] and rig.path == "gpu":
                    waited = 0
                    while load > 3 and load_policy == "wait" and waited < 60: time.sleep(10); waited += 10; load = load_avg()
                    row["load"] = load
                    if load > 3 and load_policy == "void": raise Void(f"load {load:.1f} > 3: timing void")
                    if load > 3: row["loaded"] = True
                if not (c["share"] and c["share"] in rig.cache): rig.cache = {}; t.reset()
                r = c["fn"](t)
                if r is None: raise Skip("check returned nothing")
                row["verdict"] = "pass" if r["ok"] else "fail"; row["result"] = row["verdict"]
                row["number"] = r.get("num"); row["unit"] = r.get("unit"); row["note"] = r.get("note", "")
                if not r["ok"] or c["kind"] != "HARD":
                    detail = {"did": t.did, "expected": r.get("expected"), "seen": r.get("note"), "conds": [list(x) for x in r["conds"]]}
                    if t.obs is not None:
                        o = t.obs; g = o.meta.get("group", [])
                        detail["positions_sq"] = fmt_pos(o, g[:24]); detail["telemetry"] = {k: {"last": s.get("last"), "tel": s.get("tel"), "told": s.get("told"), "stop": s.get("stop")} for k, s in o.status.items()}
                        detail["notices"] = o.notice_texts(); detail["fps"] = o.fps
                    detail["screenshot"] = t.shots[-1] if t.shots else None
                if t.obs is not None and (not r["ok"] or c["kind"] != "HARD" or os.environ.get("ZZ_KEEP_ALL")):
                    ef = ev_dir / f"{c['id']}-r{run}-{rig.path}.json.gz"
                    with gzip.open(ef, "wt") as f: json.dump(sanitize({"meta": t.obs.meta, "raw": t.obs.raw, "snap": t.obs.snap, "walls0": t.obs.walls0}), f)
                    row["evidence"] = str(ef.relative_to(rd))
                if c["expect010"] and row["verdict"] == "fail": row["xfail"] = True
                if c["timing"] and row.get("loaded") and row["verdict"] == "fail": row["note"] = "(host loaded, indicative) " + row.get("note", "")
            except Skip as e: row["verdict"] = row["result"] = "skip"; row["note"] = str(e)
            except Void as e: row["verdict"] = row["result"] = "void"; row["note"] = str(e)
            except Exception as e:
                row["verdict"] = row["result"] = "fail"; row["note"] = f"CHECK CRASHED (instrument): {type(e).__name__}: {e}"[:400]; row["instr_error"] = True
                detail = {"did": t.did, "expected": "the check to run", "seen": traceback.format_exc()[-1200:]}
            row["ms"] = round((time.time() - t0) * 1000)
            for u in t.cleanups:
                try: u()
                except Exception as e: row["note"] = (row.get("note") or "") + f" [cleanup failed: {e}]"
            try: rig.combat_end()
            except Exception: pass
            res.add(row, detail)
            log(f"  {row['id']:8s} r{run} {rig.path:5s} {row['verdict']:5s} {('%.4g' % row['number']) + (row.get('unit') or '') if row.get('number') is not None else ''} {row['note'][:140]}")


def write_reports(rd, res, ctx):
    rows = res.rows
    by = {}
    for r in rows: by.setdefault(r["station"], []).append(r)
    L = [f"# ZZ Playground suite - round {ctx['round']}", "",
         f"module {ctx.get('version')} | paths {','.join(ctx['paths'])} | stations {ctx['stations']} | started {ctx['started']} | load at start {ctx['load0']:.1f} | indicative timing: {ctx.get('indicative')}",
         f"world settings restored: {ctx.get('settings_note')} | active users at start: {ctx.get('active0')}", "",
         "| Station | checks | pass | fail | xfail (expected on 0.9.0) | skip | void | failing ids |", "|---|---|---|---|---|---|---|---|"]
    tot = dict(p=0, f=0, x=0, s=0, v=0)
    for st in sorted(by):
        rs = by[st]; ids = {}
        for r in rs: ids.setdefault(r["id"], []).append(r)
        p = f = x = s = v = 0; failing = []
        for i, rr in ids.items():
            vs = [r["verdict"] for r in rr]
            if "fail" in vs:
                if all(r.get("xfail") for r in rr if r["verdict"] == "fail"): x += 1; failing.append(i + "*")
                else: f += 1; failing.append(i)
            elif "void" in vs and "pass" not in vs: v += 1
            elif "skip" in vs: s += 1
            else: p += 1
        tot["p"] += p; tot["f"] += f; tot["x"] += x; tot["s"] += s; tot["v"] += v
        L.append(f"| {st} {ST[st]['name'][:22]} | {len(ids)} | {p} | {f} | {x} | {s} | {v} | {' '.join(failing)[:70]} |")
    L += ["", f"Total: pass {tot['p']}, fail {tot['f']}, xfail {tot['x']} (* = new in 0.10, expected to fail on 0.9.0), skip {tot['s']}, void {tot['v']}.", ""]
    inst = [r for r in rows if r.get("instr_error")]
    if inst: L += ["INSTRUMENT ERRORS: " + ", ".join(sorted({r["id"] for r in inst})), ""]
    num = [r for r in rows if r.get("number") is not None and r["kind"] in ("GATED", "REPORTED")]
    if num:
        L.append("Numbers (median of runs):")
        grp = {}
        for r in num: grp.setdefault((r["id"], r["path"]), []).append(r)
        for (i, pth), rr in sorted(grp.items())[:28]:
            L.append(f"- {i} {pth}: {float(np.median([r['number'] for r in rr])):.4g}{rr[0].get('unit') or ''} ({rr[0]['verdict']}) {rr[0]['title'][:60]}")
    L = L[:80]
    (rd / "summary.md").write_text("\n".join(L) + "\n")
    F = [f"# Failures - round {ctx['round']}", ""]
    if not res.fails: F.append("No failures.")
    for row, d in res.fails:
        F += [f"## {row['id']} run {row['run']} ({row['path']}){' - EXPECTED on 0.9.0 (new in 0.10)' if row.get('xfail') else ''}", f"{row['title']}", ""]
        F += ["**Done:**"] + [f"- {x}" for x in d.get("did", [])]
        F += ["", f"**Expected:** {d.get('expected')}", "", f"**Seen:** {d.get('seen')}", ""]
        if d.get("conds"): F += ["**Conditions:**"] + [f"- {'ok ' if c[1] else 'FAIL'} {c[0]}: {c[2]}" for c in d["conds"]] + [""]
        if d.get("positions_sq"): F += ["**Positions (squares, start -> end):**", "```", json.dumps(d["positions_sq"])[:1500], "```", ""]
        if d.get("notices"): F += [f"**Notices:** {d['notices']}", ""]
        if d.get("telemetry"): F += ["**Telemetry (per screen):**", "```", json.dumps(d["telemetry"])[:1800], "```", ""]
        F += [f"Screenshot: {d.get('screenshot')}", f"Evidence: {row.get('evidence')}", ""]
    (rd / "fails.md").write_text("\n".join(F) + "\n")
    return tot
