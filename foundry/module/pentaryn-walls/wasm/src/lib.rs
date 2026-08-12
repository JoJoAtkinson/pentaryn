//! Wall autocomplete — compiled backend.
//!
//! A port of `wall-engine.mjs`. The JS engine is the reference implementation; this exists
//! only to be faster, and is correct exactly insofar as it produces byte-identical
//! geometry. `backends.mjs::compare()` decides that mechanically.
//!
//! Two deliberate choices keep it bit-identical rather than merely close:
//!
//! * **Everything is `f64`, matching JS.** Coordinates are integral but stored and operated
//!   on as doubles, so every cross product, division and comparison rounds exactly as it
//!   does in JS. Using `i64` for the exact-integer parts would be faster and would *change
//!   results* at the tolerance boundaries.
//! * **`js_round` is not `f64::round`.** JS `Math.round` breaks ties toward +∞; Rust's
//!   breaks ties away from zero, so they disagree on every negative half-integer. Getting
//!   this wrong silently shifts junction points by one pixel.
//!
//! Rust is used rather than C/C++ specifically because it does not contract `a*b+c` into
//! FMA and has no `-ffast-math` equivalent enabled by default: float semantics are strict
//! IEEE-754 out of the box, which is the property this engine depends on.

use std::collections::HashMap;

/* ------------------------------------------------------------------ */
/*  Geometry — mirrors the JS helpers exactly                          */
/* ------------------------------------------------------------------ */

type P = [f64; 2];

#[inline] fn sub(a: P, b: P) -> P { [a[0] - b[0], a[1] - b[1]] }
#[inline] fn cross(u: P, v: P) -> f64 { u[0] * v[1] - u[1] * v[0] }
#[inline] fn dot(u: P, v: P) -> f64 { u[0] * v[0] + u[1] * v[1] }
#[inline] fn dist2(a: P, b: P) -> f64 { let dx = a[0] - b[0]; let dy = a[1] - b[1]; dx * dx + dy * dy }

/// JS `Math.round`: ties go toward +∞, not away from zero.
#[inline] fn js_round(x: f64) -> f64 { (x + 0.5).floor() }
#[inline] fn round_pt(p: P) -> P { [js_round(p[0]), js_round(p[1])] }
#[inline] fn key_of(p: P) -> (i64, i64) { (p[0] as i64, p[1] as i64) }

/// Lexicographic compare on (x, y), as a total order for deterministic tie-breaks.
fn cmp_pt(a: P, b: P) -> std::cmp::Ordering {
    a[0].partial_cmp(&b[0]).unwrap().then(a[1].partial_cmp(&b[1]).unwrap())
}

const EPS_T: f64 = 1e-9;
const COST_EPS: f64 = 1e-6;

struct Foot { t: f64, point: P }

fn foot(p: P, a: P, b: P) -> Option<Foot> {
    let ab = sub(b, a);
    let l2 = dot(ab, ab);
    if l2 == 0.0 { return None; }
    let t = dot(sub(p, a), ab) / l2;
    Some(Foot { t, point: [a[0] + t * ab[0], a[1] + t * ab[1]] })
}

fn dist_to_line2(p: P, a: P, b: P) -> f64 {
    let ab = sub(b, a);
    let l2 = dot(ab, ab);
    if l2 == 0.0 { return dist2(p, a); }
    let c = cross(ab, sub(p, a));
    (c * c) / l2
}

struct Hit { t: f64, u: f64, point: P }

fn seg_intersect(p: P, p2: P, q: P, q2: P) -> Option<Hit> {
    let r = sub(p2, p);
    let s = sub(q2, q);
    let denom = cross(r, s);
    if denom == 0.0 { return None; }
    let qp = sub(q, p);
    let t = cross(qp, s) / denom;
    let u = cross(qp, r) / denom;
    Some(Hit { t, u, point: [p[0] + t * r[0], p[1] + t * r[1]] })
}

fn blocks_open(a: P, b: P, c: P, d: P) -> bool {
    if let Some(x) = seg_intersect(a, b, c, d) {
        return x.t > EPS_T && x.t < 1.0 - EPS_T && x.u >= -EPS_T && x.u <= 1.0 + EPS_T;
    }
    if dist_to_line2(c, a, b) > 0.25 || dist_to_line2(d, a, b) > 0.25 { return false; }
    let ab = sub(b, a);
    let l2 = dot(ab, ab);
    if l2 == 0.0 { return false; }
    let tc = dot(sub(c, a), ab) / l2;
    let td = dot(sub(d, a), ab) / l2;
    let (lo, hi) = if tc < td { (tc, td) } else { (td, tc) };
    hi > EPS_T && lo < 1.0 - EPS_T
}

/* ------------------------------------------------------------------ */
/*  Model                                                              */
/* ------------------------------------------------------------------ */

#[derive(Clone)]
struct Seg {
    c: [f64; 4],
    door: i32,
    dir: i32,
    keep_open: bool,
    is_new: bool,
    dirty: bool,
    prior_c: Option<[f64; 4]>,
}

impl Seg {
    #[inline] fn a(&self) -> P { [self.c[0], self.c[1]] }
    #[inline] fn b(&self) -> P { [self.c[2], self.c[3]] }
    #[inline] fn end(&self, w: usize) -> P { if w == 0 { self.a() } else { self.b() } }
    #[inline] fn degenerate(&self) -> bool { self.c[0] == self.c[2] && self.c[1] == self.c[3] }
    #[inline] fn frozen(&self) -> bool { self.dir != 0 }
}

struct Cfg {
    grid_size: f64,
    step: f64,
    weld_eps: f64,
    coll_eps: f64,
    pin_eps: f64,
    gap_max_px: f64,
    corner_max_px: f64,
    ext_max_px: f64,
    glance_sin: f64,
    trim: bool,
    iter_cap: usize,
}

struct Vert {
    p: P,
    ends: Vec<(usize, usize)>, // (seg index, which end)
    pinned: bool,
    pin_host: Option<usize>,
    keep_open: bool,
    dangling: bool,
    out: P,
}

struct Graph {
    verts: Vec<Vert>,
    index: HashMap<(i64, i64), usize>,
}

fn build_graph(segs: &[Seg], cfg: &Cfg) -> Graph {
    let mut verts: Vec<Vert> = Vec::new();
    let mut index: HashMap<(i64, i64), usize> = HashMap::new();

    for (si, s) in segs.iter().enumerate() {
        if s.degenerate() { continue; }
        for w in 0..2 {
            let p = s.end(w);
            let k = key_of(p);
            let vi = *index.entry(k).or_insert_with(|| {
                verts.push(Vert { p, ends: Vec::new(), pinned: false, pin_host: None,
                                  keep_open: false, dangling: false, out: [0.0, 0.0] });
                verts.len() - 1
            });
            verts[vi].ends.push((si, w));
            if s.keep_open || s.frozen() { verts[vi].keep_open = true; }
        }
    }

    let pin_eps2 = cfg.pin_eps * cfg.pin_eps;
    for vi in 0..verts.len() {
        let p = verts[vi].p;
        let own: Vec<usize> = verts[vi].ends.iter().map(|e| e.0).collect();
        for (si, s) in segs.iter().enumerate() {
            if own.contains(&si) || s.degenerate() { continue; }
            if let Some(f) = foot(p, s.a(), s.b()) {
                if f.t <= 0.0 || f.t >= 1.0 { continue; }
                if dist2(p, f.point) <= pin_eps2 {
                    verts[vi].pinned = true;
                    verts[vi].pin_host = Some(si);
                    break;
                }
            }
        }
    }

    for v in verts.iter_mut() {
        v.dangling = v.ends.len() == 1 && !v.pinned && !v.keep_open;
        if v.dangling {
            let (si, w) = v.ends[0];
            v.out = sub(segs[si].end(w), segs[si].end(1 - w));
        }
    }

    Graph { verts, index }
}

fn dangling_of(g: &Graph) -> Vec<usize> {
    let mut d: Vec<usize> = (0..g.verts.len()).filter(|&i| g.verts[i].dangling).collect();
    d.sort_by(|&a, &b| cmp_pt(g.verts[a].p, g.verts[b].p));
    d
}

fn path_clear(a: P, b: P, segs: &[Seg], exclude: &[usize]) -> bool {
    for (i, s) in segs.iter().enumerate() {
        if s.degenerate() || exclude.contains(&i) { continue; }
        if blocks_open(a, b, s.a(), s.b()) { return false; }
    }
    true
}

fn interval_empty_of_vertices(a: P, b: P, g: &Graph) -> bool {
    let (ka, kb) = (key_of(a), key_of(b));
    for v in g.verts.iter() {
        let k = key_of(v.p);
        if k == ka || k == kb { continue; }
        if let Some(f) = foot(v.p, a, b) {
            if f.t <= EPS_T || f.t >= 1.0 - EPS_T { continue; }
            if dist2(v.p, f.point) <= 0.25 { return false; }
        }
    }
    true
}

fn aim_count(a: P, b: P, g: &Graph, cfg: &Cfg, exclude: &[(i64, i64)]) -> usize {
    let mut n = 0;
    let reach2 = cfg.ext_max_px * cfg.ext_max_px;
    let gap_dir = sub(b, a);
    let gap_len = dot(gap_dir, gap_dir).sqrt();
    for v in g.verts.iter() {
        if !v.dangling || exclude.contains(&key_of(v.p)) { continue; }
        let d = v.out;
        if gap_len > 0.0 && cross(d, gap_dir).abs() / (dot(d, d).sqrt() * gap_len) < cfg.glance_sin { continue; }
        if let Some(x) = seg_intersect(v.p, [v.p[0] + d[0], v.p[1] + d[1]], a, b) {
            if x.t <= EPS_T { continue; }
            if x.u < -EPS_T || x.u > 1.0 + EPS_T { continue; }
            let hp = [v.p[0] + x.t * d[0], v.p[1] + x.t * d[1]];
            if dist2(v.p, hp) > reach2 { continue; }
            n += 1;
        }
    }
    n
}

/* ------------------------------------------------------------------ */
/*  Ray casting                                                        */
/* ------------------------------------------------------------------ */

enum Ray { Hit { h: P }, Refuse }

fn cast_ray(g: &Graph, vi: usize, segs: &[Seg], cfg: &Cfg) -> Ray {
    let v = &g.verts[vi];
    let d = v.out;
    let ex = [v.ends[0].0];

    let mut best: Option<(f64, f64, usize, P)> = None;
    for (i, s) in segs.iter().enumerate() {
        if s.degenerate() || ex.contains(&i) { continue; }
        let s_vec = sub(s.b(), s.a());
        let denom = cross(d, s_vec);
        if denom == 0.0 { continue; }
        let qp = sub(s.a(), v.p);
        let t = cross(qp, s_vec) / denom;
        let u = cross(qp, d) / denom;
        if t <= EPS_T || u < -EPS_T || u > 1.0 + EPS_T { continue; }
        if best.is_none() || t < best.as_ref().unwrap().0 {
            best = Some((t, u, i, [v.p[0] + t * d[0], v.p[1] + t * d[1]]));
        }
    }

    // Aligned wall lying along the ray blocks it — band is half a lattice step, not COLL_EPS.
    let band = if cfg.coll_eps > cfg.step / 2.0 { cfg.coll_eps } else { cfg.step / 2.0 };
    let coll2 = band * band;
    let d_len2 = dot(d, d);
    let ahead = [v.p[0] + d[0], v.p[1] + d[1]];
    for (i, s) in segs.iter().enumerate() {
        if s.degenerate() || ex.contains(&i) { continue; }
        if cross(d, sub(s.b(), s.a())) != 0.0 { continue; }
        if dist_to_line2(s.a(), v.p, ahead) > coll2 { continue; }
        let t0 = dot(sub(s.a(), v.p), d) / d_len2;
        let t1 = dot(sub(s.b(), v.p), d) / d_len2;
        let far = if t0 > t1 { t0 } else { t1 };
        if far <= EPS_T { continue; }
        let mut start_t = if t0 < t1 { t0 } else { t1 };
        if start_t < 0.0 { start_t = 0.0; }
        if let Some(b) = &best { if start_t >= b.0 - EPS_T { continue; } }
        return Ray::Refuse;
    }

    let b = match best { Some(b) => b, None => return Ray::Refuse };
    let s_vec = sub(segs[b.2].b(), segs[b.2].a());
    let sin_t = cross(d, s_vec).abs() / (dot(d, d).sqrt() * dot(s_vec, s_vec).sqrt());
    if sin_t < cfg.glance_sin { return Ray::Refuse; }

    let h = round_pt(b.3);
    let dd = dist2(v.p, h).sqrt();
    if dd == 0.0 || dd > cfg.ext_max_px { return Ray::Refuse; }
    if segs[b.2].door != 0 && b.1 > EPS_T && b.1 < 1.0 - EPS_T { return Ray::Refuse; }
    Ray::Hit { h }
}

/* ------------------------------------------------------------------ */
/*  Instances                                                          */
/* ------------------------------------------------------------------ */

#[derive(Clone)]
enum Act { Move { vi: usize, to: P }, Create(Vec<[f64; 4]>) }

#[derive(Clone)]
struct Inst {
    rule: u8,          // 1=W1 2=W2 3=F1 4=F2 5=E1
    tier: u8,
    cost: f64,
    lex: [P; 2],
    anchors: Vec<(i64, i64)>,
    act: Act,
}

fn tier_of(rule: u8) -> u8 { match rule { 1 => 1, 2 => 2, 3 | 4 => 3, _ => 4 } }

fn enumerate(segs: &[Seg], g: &Graph, cfg: &Cfg) -> Vec<Inst> {
    let dang = dangling_of(g);
    let mut out: Vec<Inst> = Vec::new();
    let weld2 = cfg.weld_eps * cfg.weld_eps;

    // W1 — endpoint weld
    for i in 0..dang.len() {
        for j in (i + 1)..dang.len() {
            let (a, b) = (&g.verts[dang[i]], &g.verts[dang[j]]);
            if a.ends[0].0 == b.ends[0].0 { continue; }
            let d2 = dist2(a.p, b.p);
            if d2 > 0.0 && d2 <= weld2 {
                let (keep, mv, mvi) = if cmp_pt(a.p, b.p) != std::cmp::Ordering::Greater {
                    (a.p, b.p, dang[j])
                } else { (b.p, a.p, dang[i]) };
                out.push(Inst { rule: 1, tier: 1, cost: d2.sqrt(), lex: [keep, mv],
                    anchors: vec![key_of(a.p), key_of(b.p)],
                    act: Act::Move { vi: mvi, to: keep } });
            }
        }
    }

    // W2 — pin snap
    for &vi in dang.iter() {
        let v = &g.verts[vi];
        let mut best: Option<(f64, P)> = None;
        for (i, s) in segs.iter().enumerate() {
            if s.degenerate() || i == v.ends[0].0 { continue; }
            if let Some(f) = foot(v.p, s.a(), s.b()) {
                if f.t <= 0.0 || f.t >= 1.0 { continue; }
                let d2 = dist2(v.p, f.point);
                if d2 > 0.0 && d2 <= weld2 && (best.is_none() || d2 < best.unwrap().0) {
                    best = Some((d2, f.point));
                }
            }
        }
        if let Some((d2, fp)) = best {
            let to = round_pt(fp);
            if key_of(to) != key_of(v.p) {
                out.push(Inst { rule: 2, tier: 2, cost: d2.sqrt(), lex: [v.p, to],
                    anchors: vec![key_of(v.p)], act: Act::Move { vi, to } });
            }
        }
    }

    // F1 — collinear gap fill
    let coll2 = cfg.coll_eps * cfg.coll_eps;
    for i in 0..dang.len() {
        for j in (i + 1)..dang.len() {
            let (a, b) = (&g.verts[dang[i]], &g.verts[dang[j]]);
            let (ai, bi) = (a.ends[0].0, b.ends[0].0);
            if ai == bi { continue; }
            let (sa, sb) = (&segs[ai], &segs[bi]);
            let on_a = dist_to_line2(sb.a(), sa.a(), sa.b()) <= coll2
                    && dist_to_line2(sb.b(), sa.a(), sa.b()) <= coll2;
            let on_b = dist_to_line2(sa.a(), sb.a(), sb.b()) <= coll2
                    && dist_to_line2(sa.b(), sb.a(), sb.b()) <= coll2;
            if !on_a || !on_b { continue; }
            if dot(sub(b.p, a.p), a.out) <= 0.0 { continue; }
            if dot(sub(a.p, b.p), b.out) <= 0.0 { continue; }
            let d2 = dist2(a.p, b.p);
            if d2 > cfg.gap_max_px * cfg.gap_max_px { continue; }
            if !interval_empty_of_vertices(a.p, b.p, g) { continue; }
            if !path_clear(a.p, b.p, segs, &[ai, bi]) { continue; }
            if aim_count(a.p, b.p, g, cfg, &[key_of(a.p), key_of(b.p)]) >= 2 { continue; }
            out.push(Inst { rule: 3, tier: 3, cost: d2.sqrt(), lex: [a.p, b.p],
                anchors: vec![key_of(a.p), key_of(b.p)],
                act: Act::Create(vec![[a.p[0], a.p[1], b.p[0], b.p[1]]]) });
        }
    }

    // F2 — junction inference
    let max2 = cfg.corner_max_px * cfg.corner_max_px;
    let mut jmap: HashMap<(i64, i64), (P, Vec<usize>)> = HashMap::new();
    let mut jorder: Vec<(i64, i64)> = Vec::new();
    for i in 0..dang.len() {
        for j in (i + 1)..dang.len() {
            let (a, b) = (&g.verts[dang[i]], &g.verts[dang[j]]);
            if a.ends[0].0 == b.ends[0].0 { continue; }
            let (da, db) = (a.out, b.out);
            if cross(da, db) == 0.0 { continue; }
            if cross(da, db).abs() / (dot(da, da).sqrt() * dot(db, db).sqrt()) < cfg.glance_sin { continue; }
            let x = match seg_intersect(a.p, [a.p[0] + da[0], a.p[1] + da[1]],
                                        b.p, [b.p[0] + db[0], b.p[1] + db[1]]) {
                Some(x) => x, None => continue };
            let p = round_pt(x.point);
            if dot(sub(p, a.p), da) <= 0.0 || dot(sub(p, b.p), db) <= 0.0 { continue; }
            let (la2, lb2) = (dist2(a.p, p), dist2(b.p, p));
            if la2 == 0.0 || lb2 == 0.0 || la2 > max2 || lb2 > max2 { continue; }
            let k = key_of(p);
            let e = jmap.entry(k).or_insert_with(|| { jorder.push(k); (p, Vec::new()) });
            if !e.1.contains(&dang[i]) { e.1.push(dang[i]); }
            if !e.1.contains(&dang[j]) { e.1.push(dang[j]); }
        }
    }

    // Cluster junction points within WELD_EPS, in lexicographic order (deterministic).
    let mut entries: Vec<(P, Vec<usize>)> = jorder.iter().map(|k| jmap[k].clone()).collect();
    entries.sort_by(|x, y| cmp_pt(x.0, y.0));
    let mut clusters: Vec<(P, Vec<usize>)> = Vec::new();
    for e in entries {
        let mut merged = false;
        for c in clusters.iter_mut() {
            if dist2(c.0, e.0) <= weld2 {
                for m in e.1.iter() { if !c.1.contains(m) { c.1.push(*m); } }
                merged = true;
                break;
            }
        }
        if !merged { clusters.push(e); }
    }

    // Each end joins only its nearest junction.
    let mut nearest: HashMap<usize, f64> = HashMap::new();
    for (p, members) in clusters.iter() {
        for &m in members.iter() {
            let l = dist2(g.verts[m].p, *p).sqrt();
            let cur = nearest.get(&m).copied();
            if cur.is_none() || l < cur.unwrap() - COST_EPS { nearest.insert(m, l); }
        }
    }

    for (p, members) in clusters.iter() {
        let mut all = members.clone();
        all.sort_by(|&x, &y| cmp_pt(g.verts[x].p, g.verts[y].p));
        let ex: Vec<usize> = all.iter().map(|&m| g.verts[m].ends[0].0).collect();
        let legs: Vec<usize> = all.into_iter().filter(|&m| {
            dist2(g.verts[m].p, *p).sqrt() <= nearest[&m] + COST_EPS
                && path_clear(g.verts[m].p, *p, segs, &ex)
        }).collect();
        if legs.len() < 2 { continue; }
        let cost: f64 = legs.iter().map(|&m| dist2(g.verts[m].p, *p).sqrt()).sum();
        out.push(Inst { rule: 4, tier: 3, cost,
            lex: [g.verts[legs[0]].p, g.verts[legs[1]].p],
            anchors: legs.iter().map(|&m| key_of(g.verts[m].p)).collect(),
            act: Act::Create(legs.iter().map(|&m| {
                let q = g.verts[m].p; [q[0], q[1], p[0], p[1]]
            }).collect()) });
    }

    // E1 — dangling extension
    for &vi in dang.iter() {
        if let Ray::Hit { h } = cast_ray(g, vi, segs, cfg) {
            let v = &g.verts[vi];
            out.push(Inst { rule: 5, tier: 4, cost: dist2(v.p, h).sqrt(), lex: [v.p, h],
                anchors: vec![key_of(v.p)],
                act: Act::Create(vec![[v.p[0], v.p[1], h[0], h[1]]]) });
        }
    }

    out
}

fn cmp_inst(a: &Inst, b: &Inst) -> std::cmp::Ordering {
    a.tier.cmp(&b.tier)
        .then_with(|| if (a.cost - b.cost).abs() > COST_EPS {
            a.cost.partial_cmp(&b.cost).unwrap()
        } else { std::cmp::Ordering::Equal })
        .then_with(|| cmp_pt(a.lex[0], b.lex[0]))
        .then_with(|| cmp_pt(a.lex[1], b.lex[1]))
}

/// Anchors where one endpoint has two equal-cost, different-geometry options in one tier.
fn ambiguous(insts: &[Inst]) -> Vec<(i64, i64)> {
    let mut by_anchor: HashMap<(i64, i64), Vec<usize>> = HashMap::new();
    for (i, inst) in insts.iter().enumerate() {
        for a in inst.anchors.iter() { by_anchor.entry(*a).or_default().push(i); }
    }
    let mut bad = Vec::new();
    for (k, list) in by_anchor.iter() {
        let mut by_tier: HashMap<u8, Vec<usize>> = HashMap::new();
        for &i in list.iter() { by_tier.entry(insts[i].tier).or_default().push(i); }
        for (_, group) in by_tier.iter() {
            if group.len() < 2 { continue; }
            let mut gs = group.clone();
            gs.sort_by(|&x, &y| insts[x].cost.partial_cmp(&insts[y].cost).unwrap());
            if (insts[gs[0]].cost - insts[gs[1]].cost).abs() > COST_EPS { continue; }
            if act_key(&insts[gs[0]].act) != act_key(&insts[gs[1]].act) { bad.push(*k); break; }
        }
    }
    bad
}

fn act_key(a: &Act) -> String {
    match a {
        Act::Move { to, .. } => format!("m{:?}", to),
        Act::Create(ws) => format!("c{:?}", ws),
    }
}

fn bbox(inst: &Inst, g: &Graph) -> [f64; 4] {
    let pts: Vec<P> = match &inst.act {
        Act::Create(ws) => ws.iter().flat_map(|c| vec![[c[0], c[1]], [c[2], c[3]]]).collect(),
        Act::Move { vi, to } => vec![g.verts[*vi].p, *to],
    };
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for p in pts { x0 = x0.min(p[0]); y0 = y0.min(p[1]); x1 = x1.max(p[0]); y1 = y1.max(p[1]); }
    [x0 - 1.0, y0 - 1.0, x1 + 1.0, y1 + 1.0]
}

fn disjoint(a: &[f64; 4], b: &[f64; 4]) -> bool {
    a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]
}

fn apply(inst: &Inst, segs: &mut Vec<Seg>, g: &Graph) {
    match &inst.act {
        Act::Move { vi, to } => {
            let (si, w) = g.verts[*vi].ends[0];
            let s = &mut segs[si];
            if s.prior_c.is_none() { s.prior_c = Some(s.c); }
            if w == 0 { s.c[0] = to[0]; s.c[1] = to[1]; } else { s.c[2] = to[0]; s.c[3] = to[1]; }
            s.dirty = true;
        }
        Act::Create(ws) => {
            for c in ws {
                segs.push(Seg { c: *c, door: 0, dir: 0, keep_open: false,
                                is_new: true, dirty: false, prior_c: None });
            }
        }
    }
}

/// Connected components over shared vertices and pins. Returns (walls, dangling) per group.
/// Ported rather than left to JS because the JS version needs its own graph build, which on
/// a large scene costs more than the entire compiled run.
fn components(segs: &[Seg], g: &Graph) -> Vec<(usize, usize)> {
    let n = segs.len();
    let mut parent: Vec<usize> = (0..n).collect();
    fn find(parent: &mut Vec<usize>, mut x: usize) -> usize {
        while parent[x] != x { parent[x] = parent[parent[x]]; x = parent[x]; }
        x
    }
    for v in g.verts.iter() {
        for i in 1..v.ends.len() {
            let (a, b) = (find(&mut parent, v.ends[0].0), find(&mut parent, v.ends[i].0));
            if a != b { parent[a] = b; }
        }
        if let Some(h) = v.pin_host {
            let (a, b) = (find(&mut parent, v.ends[0].0), find(&mut parent, h));
            if a != b { parent[a] = b; }
        }
    }
    let mut order: Vec<usize> = Vec::new();
    let mut counts: HashMap<usize, (usize, usize)> = HashMap::new();
    for i in 0..n {
        if segs[i].degenerate() { continue; }
        let r = find(&mut parent, i);
        let e = counts.entry(r).or_insert_with(|| { order.push(r); (0, 0) });
        e.0 += 1;
    }
    for v in g.verts.iter() {
        if !v.dangling { continue; }
        let r = find(&mut parent, v.ends[0].0);
        if let Some(e) = counts.get_mut(&r) { e.1 += 1; }
    }
    order.into_iter().map(|r| counts[&r]).collect()
}

/* ------------------------------------------------------------------ */
/*  Trim (single-shot pre-pass)                                        */
/* ------------------------------------------------------------------ */

fn trim(segs: &mut Vec<Seg>, g: &Graph, cfg: &Cfg) -> bool {
    let pin_eps2 = cfg.pin_eps * cfg.pin_eps;
    let mut crossings: HashMap<usize, Vec<(f64, P)>> = HashMap::new();
    for i in 0..segs.len() {
        for j in (i + 1)..segs.len() {
            if segs[i].degenerate() || segs[j].degenerate() { continue; }
            let x = match seg_intersect(segs[i].a(), segs[i].b(), segs[j].a(), segs[j].b()) {
                Some(x) => x, None => continue };
            if x.t <= EPS_T || x.t >= 1.0 - EPS_T { continue; }
            if x.u <= EPS_T || x.u >= 1.0 - EPS_T { continue; }
            let ends = [segs[i].a(), segs[i].b(), segs[j].a(), segs[j].b()];
            if ends.iter().any(|e| dist2(x.point, *e) <= pin_eps2) { continue; }
            crossings.entry(i).or_default().push((x.t, x.point));
            crossings.entry(j).or_default().push((x.u, x.point));
        }
    }

    let mut trims: Vec<(usize, usize, P)> = Vec::new();
    for (si, xs) in crossings.iter() {
        let s = &segs[*si];
        if s.door != 0 || s.frozen() { continue; }
        for w in 0..2 {
            let vi = match g.index.get(&key_of(s.end(w))) { Some(v) => *v, None => continue };
            if !g.verts[vi].dangling { continue; }
            let near = if w == 0 {
                xs.iter().min_by(|a, b| a.0.partial_cmp(&b.0).unwrap()).unwrap()
            } else {
                xs.iter().max_by(|a, b| a.0.partial_cmp(&b.0).unwrap()).unwrap()
            };
            let removed = if w == 0 { near.0 } else { 1.0 - near.0 };
            if removed >= 0.5 { continue; }
            let p = round_pt(near.1);
            if key_of(p) != key_of(s.end(w)) { trims.push((*si, w, p)); }
        }
    }

    // Group per wall; both ends onto the same point would collapse it.
    let mut by_wall: HashMap<usize, Vec<(usize, P)>> = HashMap::new();
    for (si, w, p) in trims { by_wall.entry(si).or_default().push((w, p)); }
    let mut any = false;
    let mut keys: Vec<usize> = by_wall.keys().copied().collect();
    keys.sort();
    for si in keys {
        let list = &by_wall[&si];
        if list.len() == 2 && key_of(list[0].1) == key_of(list[1].1) { continue; }
        for (w, p) in list.iter() {
            let s = &mut segs[si];
            if s.prior_c.is_none() { s.prior_c = Some(s.c); }
            if *w == 0 { s.c[0] = p[0]; s.c[1] = p[1]; } else { s.c[2] = p[0]; s.c[3] = p[1]; }
            s.dirty = true;
            any = true;
        }
    }
    any
}

/* ------------------------------------------------------------------ */
/*  Entry point + flat ABI                                             */
/* ------------------------------------------------------------------ */

static mut IN_BUF: Vec<i32> = Vec::new();
static mut OUT_BUF: Vec<i32> = Vec::new();

#[no_mangle]
pub extern "C" fn alloc_in(n: usize) -> *mut i32 {
    unsafe {
        let b = &mut *std::ptr::addr_of_mut!(IN_BUF);
        b.clear();
        b.resize(n, 0);
        b.as_mut_ptr()
    }
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const i32 {
    unsafe { (*std::ptr::addr_of!(OUT_BUF)).as_ptr() }
}

/// Input layout: [n, (x0,y0,x1,y1,door,sight,dir,keepOpen) * n]
/// Output layout: [creates, updates, refusals, iterations,
///                 creates*(x0,y0,x1,y1), updates*(segIdx,x0,y0,x1,y1), refusals*(x,y)]
#[no_mangle]
pub extern "C" fn run(grid_size: f64, gap_max: f64, corner_max: f64, ext_max: f64,
                      coll_eps: f64, glance_sin: f64, trim_on: i32, iter_cap: i32) -> i32 {
    let input: Vec<i32> = unsafe { (*std::ptr::addr_of!(IN_BUF)).clone() };
    let n = input[0] as usize;

    let step = grid_size / if grid_size >= 128.0 { 8.0 } else if grid_size >= 64.0 { 4.0 } else { 2.0 };
    let cfg = Cfg {
        grid_size, step,
        weld_eps: (step / 4.0).floor().min(4.0).max(1.0),
        coll_eps, pin_eps: 1.0,
        gap_max_px: gap_max * grid_size,
        corner_max_px: corner_max * grid_size,
        ext_max_px: ext_max * grid_size,
        glance_sin,
        trim: trim_on != 0,
        iter_cap: iter_cap as usize,
    };

    let mut segs: Vec<Seg> = Vec::with_capacity(n);
    for i in 0..n {
        let o = 1 + i * 8;
        segs.push(Seg {
            c: [input[o] as f64, input[o + 1] as f64, input[o + 2] as f64, input[o + 3] as f64],
            door: input[o + 4],
            dir: input[o + 6],
            keep_open: input[o + 7] != 0,
            is_new: false, dirty: false, prior_c: None,
        });
    }
    let original = n;

    let mut g = build_graph(&segs, &cfg);
    if cfg.trim && trim(&mut segs, &g, &cfg) { g = build_graph(&segs, &cfg); }

    let mut d = dangling_of(&g).len();
    let mut iterations = 0usize;

    for iter in 1..=cfg.iter_cap {
        let insts = enumerate(&segs, &g, &cfg);
        let bad = ambiguous(&insts);
        let mut eligible: Vec<Inst> = insts.into_iter()
            .filter(|i| !i.anchors.iter().any(|a| bad.contains(a))).collect();
        if eligible.is_empty() { iterations = iterations.max(iter); break; }

        eligible.sort_by(cmp_inst);

        let mut used: Vec<(i64, i64)> = Vec::new();
        let mut boxes: Vec<[f64; 4]> = Vec::new();
        let mut batch: Vec<Inst> = Vec::new();
        for inst in eligible.into_iter() {
            if inst.anchors.iter().any(|a| used.contains(a)) { continue; }
            let bb = bbox(&inst, &g);
            if boxes.iter().any(|b| !disjoint(b, &bb)) { continue; }
            for a in inst.anchors.iter() { used.push(*a); }
            boxes.push(bb);
            batch.push(inst);
        }

        for inst in batch.iter() { apply(inst, &mut segs, &g); }

        g = build_graph(&segs, &cfg);
        let d2 = dangling_of(&g).len();
        if d2 >= d { return -1; } // unsound; caller falls back to JS
        d = d2;
        iterations = iterations.max(iter + 1);
    }

    // Serialise
    let mut creates: Vec<[f64; 4]> = Vec::new();
    let mut updates: Vec<(usize, [f64; 4])> = Vec::new();
    for (i, s) in segs.iter().enumerate() {
        if s.is_new { creates.push(s.c); }
        else if s.dirty && i < original { updates.push((i, s.c)); }
    }
    let refusals: Vec<P> = dangling_of(&g).iter().map(|&i| g.verts[i].p).collect();

    let comps = components(&segs, &g);

    let mut out: Vec<i32> = Vec::new();
    out.push(creates.len() as i32);
    out.push(updates.len() as i32);
    out.push(refusals.len() as i32);
    out.push(iterations as i32);
    out.push(comps.len() as i32);
    for c in creates.iter() { for k in 0..4 { out.push(c[k] as i32); } }
    for (i, c) in updates.iter() {
        out.push(*i as i32);
        for k in 0..4 { out.push(c[k] as i32); }
    }
    for r in refusals.iter() { out.push(r[0] as i32); out.push(r[1] as i32); }
    for (w, d) in comps.iter() { out.push(*w as i32); out.push(*d as i32); }

    let len = out.len() as i32;
    unsafe { *std::ptr::addr_of_mut!(OUT_BUF) = out; }
    len
}
