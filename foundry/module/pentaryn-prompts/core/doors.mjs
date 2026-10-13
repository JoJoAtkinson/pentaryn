/**
 * pentaryn-prompts core — door lines near prompts.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

import { isPromptId } from "./group.mjs";
import { atFeet } from "./placement.mjs";
import { DOOR, asSegment, classifySight, wallSegment } from "./sight.mjs";
import { idCompare } from "./text.mjs";

/* ── Doors near prompts ──────────────────────────────────────────────────── */

const DOOR_STATE_WORD = ["closed", "open", "locked"];
/** Context-only built things named per side of a door line; the rest are counted. */
const DOOR_BUILT_CAP = 3;

/**
 * One overview line per door that a prompt group can see from within `withinFt`:
 * `Door at 28,35 ft (closed, E-W wall): N side E1 (p4 at the door); S side p8 (10 ft). No sight line to it: E2 (p6 50 ft, wall).`
 *
 * `groups`: `[{label, prompt, members: [{id, rect, points?}]}]` (encounters, loners, context-only
 * built); `doors`: wall-ish `{c, door, ds}` in px. A group is placed on a side only through a member
 * that can see the doorway from that side: a sight line from any of its points to a spot just off
 * the door on its side, every wall counting except this door (`walls`: the scene's wall data; or
 * `reach(member, point, door)` → "LOS" | "door" | "secret door" | "wall"). Seen only past another
 * closed door → listed `through a door`. A group within range that cannot see the doorway at all
 * (the walled-off room next door) is never put on a side: it is named after the sides, tagged with
 * what blocks it. A door no prompt group can see is not printed. Neither `walls` nor `reach` →
 * every member counts as seeing it. Pure.
 */
export function doorLines(doors, groups, { dims, gridFt = 5, withinFt = 60, walls = null, reach = null } = {}) {
  if (!doors?.length || !dims) return [];
  const pxPerFt = dims.size / gridFt;
  const segs = walls ? walls.map(asSegment) : null;
  const same = (s, d) => (s.id && d.id ? s.id === d.id
    : s.a.x === d.a.x && s.a.y === d.a.y && s.b.x === d.b.x && s.b.y === d.b.y);
  const out = [];
  const rows = [];
  for (const raw of doors) {
    const w = raw.a && raw.b ? raw : wallSegment(raw);
    if (w.door === DOOR.NONE) continue;
    const M = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const ew = Math.abs(w.b.x - w.a.x) >= Math.abs(w.b.y - w.a.y);
    const sides = ew ? ["N", "S"] : ["W", "E"];
    // the spot a fifth of a square off the doorway, on the side the member stands
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const nx = -(w.b.y - w.a.y) / len, ny = (w.b.x - w.a.x) / len;
    const off = dims.size * 0.2;
    const others = segs ? segs.filter(s => !same(s, w)) : null;
    // the member's side of the door's own line (not of its bounding box, which a diagonal door
    // would get wrong), named by where that side's doorway spot lies from the door's middle
    const spot = centre => {
      const sgn = (centre.x - M.x) * nx + (centre.y - M.y) * ny >= 0 ? 1 : -1;
      const P = { x: M.x + sgn * nx * off, y: M.y + sgn * ny * off };
      const side = ew ? (P.y < M.y ? sides[0] : sides[1]) : (P.x < M.x ? sides[0] : sides[1]);
      return { P, side };
    };
    const sight = (m, centre, P) => {
      if (reach) return reach(m, P, w);
      if (!others) return "LOS";
      return classifySight(m.points?.length ? m.points : [centre], [P], others);
    };
    const near = { [sides[0]]: [], [sides[1]]: [] };
    const blind = [];
    const feet = m => {
      const r = m.rect;
      const dx = Math.max(0, r.x - M.x, M.x - (r.x + r.w));
      const dy = Math.max(0, r.y - M.y, M.y - (r.y + r.h));
      const gap = Math.hypot(dx, dy) / pxPerFt;
      return gap < 0.5 ? 0 : Math.ceil(gap / 5) * 5;
    };
    // no prompt group in range: no line, so no sight test for the built things near it either
    if (!groups.some(g => g.prompt && g.members.some(m => feet(m) <= withinFt))) continue;
    for (const g of groups) {
      const cands = [];
      for (const m of g.members) {
        const ft = feet(m);
        if (ft <= withinFt) cands.push({ ft, m });
      }
      if (!cands.length) continue;
      cands.sort((a, b) => (a.ft - b.ft) || idCompare(a.m.id, b.m.id));
      // the nearest member that sees the doorway; failing that, one that sees it past another door
      let seen = null, viaDoor = null, blocked = null, blockedPrompt = null;
      for (const c of cands) {
        const centre = { x: c.m.rect.x + c.m.rect.w / 2, y: c.m.rect.y + c.m.rect.h / 2 };
        const { P, side } = spot(centre);
        const los = c.ft === 0 ? "LOS" : sight(c.m, centre, P);
        const hit = { ...c, centre, side, los };
        if (los === "LOS") { seen = hit; break; }
        if ((los === "door" || los === "secret door") && !viaDoor) viaDoor = hit;
        if (!blocked) blocked = hit;
        if (!blockedPrompt && isPromptId(c.m.id)) blockedPrompt = hit;
      }
      const label = h => {
        const where = h.ft === 0 ? "at the door" : `${h.ft} ft`;
        return g.label === h.m.id ? `${g.label} (${where}` : `${g.label} (${h.m.id} ${where}`;
      };
      const best = seen ?? viaDoor;
      if (best) {
        const side = best.side;
        const tag = best === viaDoor ? `, through ${best.los === "secret door" ? "a secret door" : "another door"}` : "";
        near[side].push({ ft: best.ft, who: `${label(best)}${tag})`, prompt: !!g.prompt });
      } else if (blocked && g.prompt) {
        // only prompts: a built thing walled off from a door is nothing the builder decides about.
        // Named by a prompt of the group (what the builder designs), not by a built member that
        // happens to stand nearer; a group whose prompts are all out of range says so.
        const h = blockedPrompt ?? blocked;
        const pids = g.members.map(m => m.id).filter(isPromptId);
        const far = !blockedPrompt && pids.length ? `; its prompts ${pids.join(" ")} are farther` : "";
        blind.push({ ft: h.ft, who: `${label(h)}, ${h.los}${far})`, prompt: true });
      }
    }
    if (!near[sides[0]].some(x => x.prompt) && !near[sides[1]].some(x => x.prompt)) continue;
    const state = (w.door === DOOR.SECRET ? "secret, " : "") + (DOOR_STATE_WORD[w.ds] ?? "closed");
    const at = atFeet(M, dims);
    // every prompt group on a side; context-only built things only the nearest DOOR_BUILT_CAP (a
    // street of crowd tokens beside a door is one count, not twenty names)
    const part = s => {
      const all = near[s].sort((a, b) => a.ft - b.ft);
      const extra = all.filter(x => !x.prompt).slice(DOOR_BUILT_CAP);
      const l = all.filter(x => !extra.includes(x)).map(x => x.who);
      if (extra.length) l.push(`+${extra.length} more built`);
      return `${s} side ${l.length ? l.join(", ") : "nobody"}`;
    };
    let text = `Door at ${at[0]},${at[1]} ft (${state}, ${ew ? "E-W" : "N-S"} wall): ${part(sides[0])}; ${part(sides[1])}.`;
    if (blind.length) text += ` No sight line to it: ${blind.sort((a, b) => a.ft - b.ft).map(x => x.who).join(", ")}.`;
    rows.push({ y: M.y, x: M.x, text });
  }
  rows.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const r of rows) out.push(r.text);
  return out;
}
