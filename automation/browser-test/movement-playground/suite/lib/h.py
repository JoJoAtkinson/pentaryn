"""Rig: the suite's driver. Two paths: state = WSL harness (software GL, :31990), gpu = BOSS GPU Chrome over CDP (:31991).
Page keys: gm (ZZ GM8H on state, ZZ GM8 on gpu), pa (ZZ Player8A), pb (ZZ Player8B). Only ZZ documents and this module's settings are written."""
import json, os, re, subprocess, sys, time, urllib.request, threading
from pathlib import Path

SUITE = Path(__file__).resolve().parent.parent
PG = SUITE.parent / "pg"
INST = (SUITE / "lib" / "inst.js").read_text()
RESET_JS = (PG / "reset.js").read_text()
STATIONS = json.loads((PG / "stations.json").read_text())
ST = {s["id"]: s for s in STATIONS["stations"]}
G = 100
PORTS = {"state": 31990, "gpu": 31991}
USERS = {("state", "gm"): "zzGameMaster008H", ("gpu", "gm"): "zzGameMaster008H", ("state", "pa"): "zzPlayer0000008A", ("gpu", "pa"): "zzPlayer0000008A",
         ("state", "pb"): "zzPlayer0000008B", ("gpu", "pb"): "zzPlayer0000008B"}
MYUSERS = {"ZZ GM8H", "ZZ GM8", "ZZ Player8A", "ZZ Player8B"}

LATJS = r"""
if(!window.__lat){ const s=game.socket; window.__latCfg={lo:%(lo)d,hi:%(hi)d,on:true}; let nIn=0,nOut=0; const d=()=>window.__latCfg.lo+Math.random()*(window.__latCfg.hi-window.__latCfg.lo);
 const sched=(f,which)=>{ const now=performance.now(); let t=now+d(); if(which==='in'){ t=Math.max(t,nIn); nIn=t; } else { t=Math.max(t,nOut); nOut=t; } setTimeout(f, t-now); };
 const oe=s.emit.bind(s); s.emit=function(...a){ if(!window.__latCfg.on) return oe(...a); sched(()=>oe(...a),'out'); return s; };
 const eng=s.io.engine; const oer=eng.emitReserved.bind(eng); eng.emitReserved=function(ev,...a){ if(window.__latCfg.on && (ev==='packet'||ev==='data'||ev==='message')) { sched(()=>oer(ev,...a),'in'); return true; } return oer(ev,...a); };
 window.__lat=1; }
return "lat ok";
"""


def post(port, ep, obj, timeout=300):
    req = urllib.request.Request(f"http://127.0.0.1:{port}/{ep}", data=json.dumps(obj).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def par(*fns):
    res = [None] * len(fns); th = []
    for i, f in enumerate(fns):
        def w(i=i, f=f):
            try: res[i] = f()
            except Exception as e: res[i] = {"__err": str(e)[:300]}
        t = threading.Thread(target=w); t.start(); th.append(t)
    for t in th: t.join()
    return res


def load_avg():
    return float(open("/proc/loadavg").read().split()[0])


class Rig:
    def __init__(self, path, latency=50):
        self.path = path; self.port = PORTS[path]; self.pages = {}; self.latency = latency if path == "gpu" else 0
        self.scene_id = None; self.settings0 = None; self.cache = {}; self.round_dir = None; self.log = lambda *a: print(*a, flush=True)

    # ---- plumbing
    def post(self, ep, obj, timeout=300): return post(self.port, ep, obj, timeout)

    def ev(self, key, code, timeout=300):
        r = self.post("eval", {"user": key, "code": code}, timeout)
        if "error" in r: raise RuntimeError(f"{key}: {r['error'][:700]}")
        v = r.get("value")
        if isinstance(v, str) and v[:1] in "{[":
            try: return json.loads(v)
            except Exception: return v
        return v

    def mouse(self, key, steps): return self.post("mouse", {"user": key, "steps": steps})

    def shot(self, key, file):
        try: return self.post("shot", {"user": key, "file": str(file)}, 60)
        except Exception as e: return {"error": str(e)}

    def open(self, key):
        if key in self.pages: return
        uid = USERS[(self.path, key)]
        r = self.post("open", {"user": key, "id": uid}, 200)
        if not r.get("ok"): raise RuntimeError(f"open {key} failed: {json.dumps(r)[:400]}")
        lat = self.latency if key != "gm" else 0
        if lat: self.ev(key, LATJS % {"lo": max(1, lat - 5), "hi": lat + 5})
        self.pages[key] = r["user"]
        sid = self.ev(key, "return game.scenes.getName('ZZ Playground')?.id")
        self.scene_id = sid
        self.ev(key, f"if (canvas.scene?.id !== '{sid}') {{ await game.scenes.get('{sid}').view(); await new Promise(r=>setTimeout(r,2500)); }}"
                     + (" try{ canvas.app.renderer.resolution=0.25; canvas.app.renderer.resize(window.innerWidth, window.innerHeight); }catch(e){}" if self.path == "state" else "")
                     + " return canvas.scene?.name")
        self.ev(key, INST)
        return r

    def close(self, keys=None):
        for k in list(keys or self.pages):
            try: self.post("close", {"user": k})
            except Exception: pass
            self.pages.pop(k, None)

    def ensure(self, keys):
        for k in keys:
            if k not in self.pages: self.open(k)
        for k in list(self.pages):
            if k not in keys and k != "gm": self.close([k])

    # ---- world safety
    def active_users(self):
        return self.ev("gm", "return JSON.stringify(game.users.filter(u=>u.active).map(u=>u.name))")

    def settings_snapshot(self):
        return self.ev("gm", "const o={}; for (const [k,v] of game.settings.settings) { if(!k.startsWith('pentaryn-movement.')||v.scope!=='world') continue; const key=k.split('.')[1]; o[key]=game.settings.get('pentaryn-movement',key);} return JSON.stringify(o)")

    def settings_restore(self, snap):
        cur = self.settings_snapshot(); changed = {}
        for k, v in snap.items():
            if cur.get(k) != v:
                changed[k] = {"was": v, "now": cur.get(k)}
                self.ev("gm", f"await game.settings.set('pentaryn-movement', {json.dumps(k)}, {json.dumps(v)}); return 1")
        return changed

    def set_setting(self, key, value):
        return self.ev("gm", f"await game.settings.set('pentaryn-movement', {json.dumps(key)}, {json.dumps(value)}); return JSON.stringify(game.settings.get('pentaryn-movement', {json.dumps(key)}))")

    # ---- the reset: the playground's own reset.js, with PG set (station/scenario/mode)
    def reset(self, station="all", scenario="default", mode="paths", keys=None):
        keys = keys or list(self.pages)
        t0 = time.time()
        code = f"globalThis.PG = {json.dumps({'mode': mode, 'station': station, 'scenario': scenario})};\n" + RESET_JS
        r = self.ev("gm", code, timeout=300)
        for k in keys:
            self.ev(k, f"""const sid='{self.scene_id}'; if (canvas.scene?.id !== sid) {{ await game.scenes.get(sid).view(); await new Promise(r=>setTimeout(r,2500)); }}
canvas.tokens.releaseAll(); try{{ ZI.on=false; ZI.errs=[]; ZI.notes=[]; ZI.clearNotes(); }}catch(e){{}} {"canvas.perception.update({refreshVision:true, refreshLighting:true, refreshOcclusion:true});" if mode == "sight" else ""} return 1""")
        self.wait_quiet(keys, timeout=20, quiet=1.0)
        return {"reset_s": round(time.time() - t0, 2), "r": r if isinstance(r, (str, int, float, type(None))) else r}

    def wait_quiet(self, keys=None, timeout=25, quiet=1.5, min_wait=1.5):
        keys = keys or list(self.pages)
        time.sleep(min_wait); t0 = time.time(); q0 = None
        while time.time() - t0 < timeout:
            mv = False
            for k in keys:
                try: mv = mv or not self.ev(k, "return ZI.quiet()")
                except Exception: mv = True
            now = time.time()
            if not mv:
                q0 = q0 or now
                if now - q0 >= quiet: return round(q0 - t0 + min_wait, 2)
            else: q0 = None
            time.sleep(0.25)
        return None

    # ---- view and selection
    def view_fit(self, key, st, scale=None):
        a = ST[st]["area"]; cx, cy = (a[0] + a[2]) / 2, (a[1] + a[3]) / 2
        s = scale or 0.37
        self.ev(key, f"await canvas.animatePan({{x:{cx},y:{cy},scale:{s},duration:0}}); return 1")

    def select(self, key, names):
        return self.ev(key, "canvas.tokens.releaseAll(); for (const n of %s) canvas.tokens.placeables.find(t=>t.name===n)?.control({releaseOthers:false}); return JSON.stringify(canvas.tokens.controlled.map(t=>t.name))" % json.dumps(names))

    def centre(self, key, name):
        return self.ev(key, "const t=canvas.tokens.placeables.find(t=>t.name===%s); return JSON.stringify({x:t.document._source.x+t.document.width*50, y:t.document._source.y+t.document.height*50})" % json.dumps(name))

    # ---- recording
    def rec_start(self, keys=None):
        for k in (keys or list(self.pages)): self.ev(k, "ZI.clearNotes(); return ZI.start()")

    def rec_stop(self, keys=None):
        return {k: self.ev(k, "return JSON.stringify(ZI.stop())", 120) for k in (keys or list(self.pages))}

    def snapshot(self, keys=None):
        out = {}
        for k in (keys or list(self.pages)):
            out[k] = {"docs": self.ev(k, "return JSON.stringify(ZI.docs())", 120), "status": self.ev(k, "return JSON.stringify(ZI.status())", 60)}
        return out

    def walls(self, key="gm"): return self.ev(key, "return JSON.stringify(ZI.wallsList())")

    # ---- real input
    def drag(self, key, names, grab, dest, hold=250, via=None, release=True):
        """Real mouse drag of `names` (selected on page `key`), grabbing `grab`, dropped with the grabbed token's CENTRE at dest (px).
        Pans so both ends are in view; verifies the preview reaches dest (up to 3 tries). Returns info incl. the epoch ms of the pointerup."""
        info = self.ev(key, r"""
const t=canvas.tokens.placeables.find(t=>t.name===%s); const c={x:t.document._source.x+t.document.width*50,y:t.document._source.y+t.document.height*50}; const d=%s;
const sx=Math.abs(d.x-c.x)+500, sy=Math.abs(d.y-c.y)+500; const sc=Math.max(0.15,Math.min(0.5,0.85*Math.min(innerWidth/sx, innerHeight/sy)));
await canvas.animatePan({x:(c.x+d.x)/2,y:(c.y+d.y)/2,scale:sc,duration:0});
canvas.tokens.releaseAll(); for (const n of %s) canvas.tokens.placeables.find(t=>t.name===n)?.control({releaseOthers:false});
return JSON.stringify({c,d,sel:canvas.tokens.controlled.map(t=>t.name),scale:sc});""" % (json.dumps(grab), json.dumps(dest if isinstance(dest, dict) else {"x": dest[0], "y": dest[1]}), json.dumps(names)))
        c, d = info["c"], info["d"]
        pts = via or []
        mx, my = (c["x"] + d["x"]) / 2, (c["y"] + d["y"]) / 2
        steps = [{"move": [c["x"] - 20, c["y"] - 20], "world": True, "steps": 2}, {"wait": 100}, {"move": [c["x"], c["y"]], "world": True, "steps": 3}, {"wait": 150},
                 {"down": "left"}, {"move": [c["x"] + 40, c["y"] + 40], "world": True, "steps": 2}, {"wait": 60}]
        for p in pts: steps += [{"move": [p[0], p[1]], "world": True, "steps": 4}, {"wait": 150}]
        steps += [{"move": [mx, my], "world": True, "steps": 4}, {"wait": 200}, {"move": [d["x"], d["y"]], "world": True, "steps": 4}, {"wait": hold},
                  {"move": [d["x"] + 2, d["y"]], "world": True, "steps": 1}, {"wait": 120}, {"move": [d["x"], d["y"]], "world": True, "steps": 1}]
        ok = False
        for attempt in range(3):
            self.mouse(key, steps)
            pv = self.ev(key, "const p=canvas.tokens.preview?.children??[]; return JSON.stringify(p.map(o=>({n:o.document?.name,cx:Math.round(o.x+o.w/2),cy:Math.round(o.y+o.h/2)})))")
            ok = any(abs(o.get("cx", -1e9) - d["x"]) < 60 and abs(o.get("cy", -1e9) - d["y"]) < 60 for o in (pv or [])) if pv else False
            if ok or not release: break
            self.mouse(key, [{"key": "Escape"}, {"up": "left"}, {"wait": 300}])
            self.select(key, names)
        up_ms = None
        if release:
            up_ms = int(time.time() * 1000)
            self.mouse(key, [{"wait": 80}, {"up": "left"}])
        return {"sel": info["sel"], "from": c, "to": d, "upAt": up_ms, "attempts": attempt + 1, "previewOk": ok}

    def click_token(self, key, name):
        c = self.ev(key, "const t=canvas.tokens.placeables.find(t=>t.name===%s); const cc=canvas.clientCoordinatesFromCanvas({x:t.x+t.w/2,y:t.y+t.h/2}); return JSON.stringify({cx:cc.x,cy:cc.y})" % json.dumps(name))
        self.mouse(key, [{"move": [c["cx"], c["cy"]], "steps": 1}, {"down": "left"}, {"wait": 40}, {"up": "left"}])
        return int(time.time() * 1000)

    def click_when(self, key, name, cond_js, timeout=15000):
        """page-side wait until `cond_js` (x,y = drawn centre in squares; the token is moving) then a REAL click on the drawn token"""
        c = self.ev(key, r"""const t=canvas.tokens.placeables.find(t=>t.name===%s); const t0=performance.now();
while(performance.now()-t0<%d){ const x=(t.x+t.w/2)/100, y=(t.y+t.h/2)/100; const moving=Math.hypot(t.x-t.document._source.x,t.y-t.document._source.y)>20;
 if(moving && (%s)){ const cc=canvas.clientCoordinatesFromCanvas({x:t.x+t.w/2,y:t.y+t.h/2}); return JSON.stringify({cx:cc.x,cy:cc.y,at:{x:+x.toFixed(2),y:+y.toFixed(2)}}); } await new Promise(r=>requestAnimationFrame(r)); }
return JSON.stringify({missed:true});""" % (json.dumps(name), timeout, cond_js), timeout=timeout // 1000 + 30)
        if not c or c.get("missed"): return {"missed": True}
        self.mouse(key, [{"move": [c["cx"], c["cy"]], "steps": 1}, {"down": "left"}, {"wait": 40}, {"up": "left"}])
        return {"clickAt": c["at"], "clickedAt": int(time.time() * 1000)}

    def click_any(self, key, names, min_sq=2.5, timeout=20000):
        """page-side wait until ANY of `names` is drawn moving and has travelled >= min_sq from its start; then a REAL click on that token. Returns who, where, and how many members had not started."""
        c = self.ev(key, r"""const names=%s; const t0=performance.now();
while(performance.now()-t0<%d){ for (const n of names){ const t=canvas.tokens.placeables.find(t=>t.name===n); const i=ZI.init.find(x=>x.n===n); if(!t||!i) continue;
  const moving=Math.hypot(t.x-t.document._source.x,t.y-t.document._source.y)>20; const d=Math.hypot(t.x-i.dx,t.y-i.dy)/100;
  if(moving && d>=%f){ const started=names.filter(m=>{ const u=canvas.tokens.placeables.find(t=>t.name===m); const j=ZI.init.find(x=>x.n===m); return Math.hypot(u.x-j.dx,u.y-j.dy)>2 || Math.hypot(u.document._source.x-j.x,u.document._source.y-j.y)>2; });
   const cc=canvas.clientCoordinatesFromCanvas({x:t.x+t.w/2,y:t.y+t.h/2}); return JSON.stringify({cx:cc.x,cy:cc.y,who:n,notStarted:names.length-started.length, at:{x:+((t.x+t.w/2)/100).toFixed(2),y:+((t.y+t.h/2)/100).toFixed(2)}}); } }
 await new Promise(r=>requestAnimationFrame(r)); }
return JSON.stringify({missed:true});""" % (json.dumps(names), timeout, min_sq), timeout=timeout // 1000 + 30)
        if not c or c.get("missed"): return {"missed": True}
        self.mouse(key, [{"move": [c["cx"], c["cy"]], "steps": 1}, {"down": "left"}, {"wait": 40}, {"up": "left"}])
        return {"who": c["who"], "clickAt": c["at"], "notStarted": c["notStarted"], "clickedAt": int(time.time() * 1000)}

    def combat_end(self):
        self.ev("gm", "for (const c of game.combats.filter(c=>c.scene?.id===canvas.scene.id)) await c.delete(); return 1")
