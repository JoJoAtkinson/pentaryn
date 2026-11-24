// ZI: page-side instruments for the pentaryn-movement suite. Injected over CDP (harness /eval), never module code.
// Body of an async function: installs window.ZI once per page and returns "zi ok". Everything read comes from what
// the page DRAWS (placeable x/y, sort) and what the documents HOLD; the module's API is read defensively.
if (window.ZI?.v === 6) return "zi ok (already)";
if (window.ZI) { try { window.ZI.off?.(); } catch (e) {} }
const ZI = window.ZI = { v: 6, on: false, fr: [], ev: [], notes: [], errs: [], ptr: [], gaps: [], loaf: [], z: [], t0: 0 };
const NOW = () => Date.now();
const TOKRE = /^S\d\d /;
const hooks = [];
const H = (name, fn) => { hooks.push([name, Hooks.on(name, fn)]); };
ZI.idx = new Map();

// ---- errors: console.error / console.warn naming pentaryn, window errors, unhandled rejections
const oerr = console.error, owarn = console.warn;
const pushErr = (kind, text, stack) => { ZI.errs.push({ t: NOW(), kind, text: String(text).slice(0, 400), mod: /pentaryn-movement/i.test(String(text) + " " + String(stack ?? "")) }); };
console.error = function (...a) { try { const s = a.map(x => x?.stack ?? (typeof x === "object" ? (x?.message ?? "") : String(x))).join(" "); pushErr("console.error", s, s); } catch (e) {} return oerr.apply(this, a); };
console.warn = function (...a) { try { const s = a.map(x => x?.stack ?? String(x)).join(" "); if (/pentaryn-movement/i.test(s) && !/deprecat/i.test(s)) pushErr("console.warn", s, s); } catch (e) {} return owarn.apply(this, a); };
const onErr = e => pushErr("window.error", e.message, e.error?.stack);
const onRej = e => pushErr("unhandledrejection", e.reason?.message ?? e.reason, e.reason?.stack);
window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onRej);

// ---- notifications (the module's notices): wrap notify and the typed helpers once, dedupe the nested call
let inNote = 0;
const N = ui.notifications;
const wrapN = (name, type) => { const o = N[name]; if (!o || o.__zi) return; const f = function (...a) {
  if (!inNote) { try { let m = typeof a[0] === "string" ? a[0] : (a[0]?.message ?? String(a[0])); const key = m; const opts = name === "notify" ? a[2] : a[1];
      try { if ((opts?.localize || /^[A-Z][A-Z0-9_]+\.[\w.]+$/.test(m)) && game.i18n.has(m)) m = opts?.format ? game.i18n.format(m, opts.format) : game.i18n.localize(m); } catch (e) {}
      ZI.notes.push({ t: NOW(), type: name === "notify" ? (a[1] ?? "info") : type, text: String(m).replace(/<[^>]+>/g, "").slice(0, 300), key: key === m ? undefined : key }); } catch (e) {} }
  inNote++; try { return o.apply(this, a); } finally { inNote--; } }; f.__zi = true; f.__orig = o; N[name] = f; };
for (const [n, t] of [["notify", "info"], ["info", "info"], ["warn", "warning"], ["error", "error"]]) wrapN(n, t);
// GM whispers the module sends (narrow door etc.) arrive as chat messages: record those whispered/created while on
H("createChatMessage", m => { if (ZI.on) ZI.notes.push({ t: NOW(), type: "chat", text: String(m.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300), whisper: (m.whisper ?? []).length }); });

// ---- documents: token updates (with the route the move carries), walls (door states), combat
const wpsOf = doc => { try { const m = doc.movement; const w = [m?.origin, ...(m?.passed?.waypoints ?? []), ...(m?.pending?.waypoints ?? [])].filter(Boolean).map(p => [Math.round(p.x), Math.round(p.y)]); return { wps: w, method: m?.method ?? null, state: m?.state ?? null, cost: m?.passed?.cost ?? m?.cost ?? null, cost2: m?.pending?.cost ?? null }; } catch (e) { return { wps: [] }; } };
H("updateToken", (doc, ch, opts, uid) => { if (!ZI.on || !TOKRE.test(doc.name)) return; const o = { t: NOW(), k: "tok", id: doc.id, n: doc.name, by: game.users.get(uid)?.name ?? uid };
  for (const f of ["x", "y", "hidden", "elevation", "sort", "width", "height"]) if (f in ch) o[f] = ch[f];
  if ("x" in ch || "y" in ch) Object.assign(o, wpsOf(doc), { sx: doc._source.x, sy: doc._source.y }, { teleport: !!opts?.teleport, noanim: opts?.animate === false });
  ZI.ev.push(o); });
H("updateWall", (doc, ch) => { if (!ZI.on) return; ZI.ev.push({ t: NOW(), k: "wall", id: doc.id, ch: JSON.parse(JSON.stringify(ch)), c: doc.c, door: doc.door, ds: doc.ds }); });
H("createWall", doc => { if (ZI.on) ZI.ev.push({ t: NOW(), k: "wallc", id: doc.id, c: doc.c, door: doc.door, ds: doc.ds, move: doc.move }); });
H("deleteWall", doc => { if (ZI.on) ZI.ev.push({ t: NOW(), k: "walld", id: doc.id }); });
H("createCombat", c => { if (ZI.on) ZI.ev.push({ t: NOW(), k: "combat+", id: c.id }); });
H("deleteCombat", c => { if (ZI.on) ZI.ev.push({ t: NOW(), k: "combat-", id: c.id }); });
H("updateCombat", (c, ch) => { if (ZI.on) ZI.ev.push({ t: NOW(), k: "combat~", ch: JSON.parse(JSON.stringify(ch)) }); });
H("deleteToken", d => { if (ZI.on) ZI.ev.push({ t: NOW(), k: "tok-", n: d.name }); });
H("createToken", d => { if (ZI.on) ZI.ev.push({ t: NOW(), k: "tok+", n: d.name }); });

// ---- pointer times (the drop is the pointerup on the canvas)
const onPtr = ty => e => { if (ZI.on) ZI.ptr.push({ t: NOW(), ty, x: Math.round(e.clientX), y: Math.round(e.clientY), b: e.button, tg: (e.target?.tagName ?? "") }); };
const pd = onPtr("down"), pu = onPtr("up");
window.addEventListener("pointerdown", pd, true); window.addEventListener("pointerup", pu, true);

// ---- long animation frames
try { ZI.po = new PerformanceObserver(l => { for (const e of l.getEntries()) { if (!ZI.on || e.duration < 50) continue; const scr = (e.scripts ?? []).map(s => ({ u: (s.sourceURL ?? "").split("/").slice(-2).join("/"), f: s.sourceFunctionName, d: Math.round(s.duration) })); ZI.loaf.push({ t: Math.round(performance.timeOrigin + e.startTime), d: Math.round(e.duration), blk: Math.round(e.blockingDuration ?? 0), mov: scr.some(s => /pentaryn-movement/.test(s.u)), scr: scr.slice(0, 3) }); } }); ZI.po.observe({ type: "long-animation-frame", buffered: false }); } catch (e) { ZI.loafErr = String(e); }

// ---- per-frame recorder of every station token's DRAWN centre and draw order
const orderOf = t => [t.document.elevation ?? 0, t.mesh?.sort ?? t.document.sort ?? 0, t.mesh?.zIndex ?? 0];
ZI.toks = () => canvas.tokens.placeables.filter(t => TOKRE.test(t.name) && !t.destroyed && t.document?.parent);
ZI.start = function (opt = {}) {
  this.on = true; this.fr = []; this.ev = []; this.notes = []; this.errs = []; this.ptr = []; this.gaps = []; this.loaf = []; this.z = []; this.t0 = NOW(); this.rafs = 0; this.opt = opt;
  const T = this.toks(); this.idx = new Map(T.map((t, i) => [t.id, i]));
  this.init = T.map(t => ({ id: t.id, n: t.name, x: t.document._source.x, y: t.document._source.y, w: t.document.width, h: t.document.height, hidden: !!t.document.hidden, dx: Math.round(t.x), dy: Math.round(t.y), o: orderOf(t) }));
  this.last = T.map(t => [Math.round(t.x), Math.round(t.y)]); this.lastO = T.map(t => orderOf(t).join(","));
  this.lastRaf = performance.now();
  const tick = () => { if (!this.on) return; const nowMs = NOW(), p = performance.now(); this.rafs++; if (p - this.lastRaf > 60) this.gaps.push([nowMs, Math.round(p - this.lastRaf)]); this.lastRaf = p;
    for (const t of this.toks()) { let i = this.idx.get(t.id); if (i == null) { i = this.idx.size; this.idx.set(t.id, i); this.init[i] = { id: t.id, n: t.name, x: t.document._source.x, y: t.document._source.y, w: t.document.width, h: t.document.height, hidden: !!t.document.hidden, dx: Math.round(t.x), dy: Math.round(t.y), o: orderOf(t), late: true }; this.last[i] = [-1e9, -1e9]; this.lastO[i] = ""; }
      const x = Math.round(t.x), y = Math.round(t.y), l = this.last[i]; if (Math.abs(l[0] - x) >= 1 || Math.abs(l[1] - y) >= 1) { this.fr.push([nowMs - this.t0, i, x, y]); this.last[i] = [x, y]; }
      const o = orderOf(t).join(","); if (o !== this.lastO[i]) { this.z.push([nowMs - this.t0, i, o]); this.lastO[i] = o; } }
    this.raf = requestAnimationFrame(tick); };
  this.raf = requestAnimationFrame(tick); return T.length;
};
ZI.stop = function () { this.on = false; cancelAnimationFrame(this.raf);
  const ms = NOW() - this.t0;
  return { t0: this.t0, ms, rafs: this.rafs, fps: +(this.rafs / Math.max(0.001, ms / 1000)).toFixed(1), init: this.init, fr: this.fr, z: this.z, ev: this.ev, notes: this.notes, errs: this.errs, ptr: this.ptr, gaps: this.gaps, loaf: this.loaf }; };
ZI.off = function () { this.on = false; for (const [n, id] of hooks) Hooks.off(n, id); try { cancelAnimationFrame(this.raf); } catch (e) {} console.error = oerr; console.warn = owarn;
  window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); window.removeEventListener("pointerdown", pd, true); window.removeEventListener("pointerup", pu, true);
  for (const n of ["notify", "info", "warn", "error"]) if (N[n]?.__orig) N[n] = N[n].__orig; };

// ---- documents as they are right now (the truth at rest) and the module's own account of the last drop
ZI.docs = function () {
  const sc = canvas.scene; const G = canvas.grid.size;
  const toks = sc.tokens.filter(t => TOKRE.test(t.name)).map(t => ({ id: t.id, n: t.name, x: t._source.x, y: t._source.y, w: t.width, h: t.height, hidden: !!t.hidden, elev: t.elevation, disp: t.disposition, own: Object.keys(t.actor?.ownership ?? {}).filter(k => (t.actor.ownership[k] ?? 0) >= 3 && k !== "default"),
    hist: (t.movementHistory ?? []).map(h => [Math.round(h.x), Math.round(h.y), +(h.cost ?? 0).toFixed(2), h.action ?? null, h.method ?? null]), drawn: (() => { const p = canvas.tokens.get(t.id); return p ? [Math.round(p.x), Math.round(p.y)] : null; })(), speed: t.actor?.system?.attributes?.movement?.walk ?? null }));
  const walls = sc.walls.map(w => ({ id: w.id, c: w.c, door: w.door, ds: w.ds, move: w.move, sight: w.sight, dir: w.dir, key: w.flags?.world?.pg?.key ?? null, st: w.flags?.world?.pg?.st ?? null, only: w.flags?.world?.pg?.only ?? null }));
  const regions = sc.regions.map(r => ({ id: r.id, name: r.name, st: r.flags?.world?.pg?.st ?? null, key: r.flags?.world?.pg?.key ?? null, shapes: r.shapes.map(s => JSON.parse(JSON.stringify(s.toObject?.() ?? s))), behaviors: r.behaviors.map(b => ({ type: b.type, mult: b.system?.modifications ?? null })) }));
  const combats = game.combats.filter(c => c.scene?.id === sc.id).map(c => ({ id: c.id, started: c.started, turn: c.combatant?.name, round: c.round, n: c.combatants.size }));
  return { G, scene: sc.name, toks, walls: undefined, nwalls: walls.length, combats, vision: sc.tokenVision, fog: sc.fog?.mode ?? sc.fog?.exploration, regions: regions.length, walls_: walls };
};
ZI.wallsList = () => canvas.scene.walls.map(w => ({ id: w.id, c: w.c, door: w.door, ds: w.ds, move: w.move, dir: w.dir, key: w.flags?.world?.pg?.key ?? null, st: w.flags?.world?.pg?.st ?? null, only: w.flags?.world?.pg?.only ?? null }));
ZI.status = function () {
  const mv = game.pentaryn.movement; const st = mv.status(); const g = st.group ?? {}; let tel = null;
  try { const t = mv.telemetry({ seconds: 60 }); tel = { counts: t.summary?.counts ?? null, fallbacks: t.summary?.fallbacks ?? null, notices: t.summary?.notices ?? null, stall: (t.events ?? []).filter(e => /stall/.test(e.kind ?? e.type ?? "")).length, tripped: t.tripped ?? null, ne: (t.events ?? []).length }; } catch (e) { tel = { err: String(e.message) }; }
  const cut = o => { try { return JSON.parse(JSON.stringify(o ?? null)); } catch (e) { return String(o); } };
  return { version: st.version ?? mv.version, last: cut(g.last), queue: cut(g.queue), stopped: cut(g.stopped), told: cut(g.told), step: cut(g.step), pending: cut(g.pending), perf: cut(g.perf), stop: cut(st.stop?.last), tripped: cut(st.assist?.tripped), assist: game.settings.get("pentaryn-movement", "assist"), tel, user: game.user.name };
};
ZI.telemetry = function (seconds = 30) { try { const t = game.pentaryn.movement.telemetry({ seconds }); return JSON.parse(JSON.stringify({ summary: t.summary, tripped: t.tripped, events: (t.events ?? []).slice(-60) })); } catch (e) { return { err: String(e.message) }; } };
ZI.quiet = function () { // true when no station token is mid-move on this page (drawn = source, nothing animating)
  for (const t of this.toks()) { if (Math.hypot(t.x - t.document._source.x, t.y - t.document._source.y) > 0.5) return false; if (t.document.movement?.state && t.document.movement.state !== "completed" && t.document.movement.state !== "stopped" && t.document.movement.state !== "none") return false; if (t.animationContexts?.size) return false; } return true; };
ZI.clearNotes = function () { try { document.querySelectorAll("#notifications li, .notification").forEach(e => e.remove()); } catch (e) {} };
return "zi ok";
