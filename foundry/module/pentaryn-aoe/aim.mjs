/**
 * Part G — a Self cone or line starts at its caster and points at the mouse.
 *
 * dnd5e 6 places every activity area through core's RegionLayer#placeRegions with no onMove of its
 * own, so a cone's point follows the mouse and faces east until the mouse wheel turns it. For a
 * spell whose range is Self (Cone of Cold, Burning Hands, Lightning Bolt) the point belongs on the
 * caster: the usability Area 6 re-run (W13) placed Cone of Cold at the click with rotation 0 and
 * caught a Fighter instead of the goblins.
 *
 * `dnd5e.preCreateMeasuredTemplate` fires just before dnd5e starts the placement. For a Self-range
 * cone or line with a caster token on this scene we arm one aim; our wrap of
 * `RegionLayer.prototype.placeRegions` consumes it and passes an `onMove` (core's documented
 * placement option) that keeps the shape's origin on the edge of the caster's token, toward the
 * pointer, and its rotation pointing at the pointer. Click confirms as before. Escape cancels the
 * placement (Part E / F); right-click SKIPS the shape being placed (core's #skipPlacement: "Right-click
 * skips the placement of a shape"), which for a one-shape area is the same as cancelling. The handle
 * (Part A) can still be dragged afterwards.
 *
 * B3 (feedback 8t6Nn1): a placement of several shapes (Wall of Stone's ten panels, one region each)
 * shows one permanent notice, "Panel n of N: mouse wheel rotates, Esc to finish, right-click skips a panel"
 * (core.panelCounter), advanced by each confirmed or skipped shape (the caller's own preConfirm /
 * preSkip run first; a `false` from them confirms nothing and the count stays) and removed when the
 * placement ends. 0.7.1: one notice on screen at a time (a new placement replaces a stale one), and
 * each shape counted once by core's regionIndex / shapeIndex. Escape is the real "finish": core resolves the placement null, while dnd5e's own
 * preConfirm has already kept every panel placed so far, so those are created.
 *
 * Setting: aimSelfAreas (world, default on). Row aoe-self-area-aim.
 */

import { MODULE, aimFromCaster, aimsFromCaster, panelCounter } from "./core.mjs";
import { setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { makeLog } from "./lib/log.mjs";

const ARM_MS = 5000;
let armed = null;          // { tokenId, sceneId, until }
const WRAPPED = Symbol.for(`${MODULE}.aimWrapped`);
/** The placeRegions wrap (kit wrapMethod); a second copy reuses the first copy's record. */
let placement = null;
let log = makeLog(MODULE);   // the entry's ctx.log once installed
/** B3: the panel notice on screen now ({ done }), or null. */
let shown = null;

function casterToken(activity) {
  let token = null;
  try { token = activity?.getUsageToken?.() ?? null; } catch { token = null; }
  const doc = token?.document ?? token;
  if (!doc || doc.parent?.id !== canvas?.scene?.id) return null;
  return doc;
}

function onPreCreate(activity) {
  armed = null;
  if (!setting("aimSelfAreas")) return;
  const target = activity?.target?.template ?? {};
  const templateType = CONFIG.DND5E?.areaTargetTypes?.[target.type]?.template ?? null;
  if (!aimsFromCaster({ rangeUnits: activity?.range?.units ?? null, templateType })) return;
  const doc = casterToken(activity);
  if (!doc) return;
  armed = { tokenId: doc.id, sceneId: doc.parent.id, until: Date.now() + ARM_MS };
}

/** The onMove for one placement: origin on the caster's edge, rotation toward the pointer. */
function aimer(tokenId) {
  return ({ shape, position }) => {
    if (!["cone", "line"].includes(shape?.type)) return;          // anything else: core's default
    const doc = canvas.scene?.tokens?.get(tokenId);
    if (!doc) return;
    const g = canvas.grid.size;
    const w = (doc.width ?? 1) * g, h = (doc.height ?? 1) * g;
    const centre = { x: doc.x + w / 2, y: doc.y + h / 2 };
    const aim = aimFromCaster(centre, w / 2, h / 2, position);
    shape.updateSource({ x: aim.x, y: aim.y, rotation: aim.rotation });
    return false;
  };
}

/** B3: how many shapes a placeRegions call places (each region's shapes, one after the other). */
function shapeCount(list) {
  return list.reduce((n, d) => n + Math.max(1, d?.shapes?.length ?? 0), 0);
}

/**
 * B3: wrap the caller's preConfirm / preSkip so each placed or skipped shape advances one permanent
 * notice; returns the options to pass on and a `done()` that removes the notice. Nothing for one shape.
 */
function panelNotice(total, options) {
  const text = placed => {
    const c = panelCounter(placed, total);
    return c ? _loc("PENTARYN_AOE.Panels.Counter", { n: c.n, total: c.total }) : null;
  };
  const first = text(0);
  if (!first) return { options, done: () => {} };
  // 0.7.1 (playtest 2026-11-21: the notice showed twice per step): one notice on screen, ever. A new
  // placement replaces any earlier one still showing (core cancels an earlier placement when another
  // starts, and its notice would otherwise stay until that call settles).
  shown?.done();
  const counted = new Set();   // "regionIndex:shapeIndex" of every shape already counted
  let keyless = 0;
  let note = null;
  try { note = ui.notifications?.info?.(first, { permanent: true, console: false }) ?? null; } catch (err) { log.debug("panel notice", err); }
  // 0.7.1: a shape is counted once, by the indexes core passes, however many times its hook is called
  const advance = args => {
    const key = Number.isInteger(args?.shapeIndex) ? `${args.regionIndex ?? 0}:${args.shapeIndex}` : null;
    if (key !== null) {
      if (counted.has(key)) return;
      counted.add(key);
    } else keyless += 1;
    const next = text(counted.size + keyless);
    try { if (next && note) note.update?.({ message: next }); } catch (err) { log.debug("panel notice", err); }
  };
  // the caller's hook may be async (a Promise of false refuses too): count only once it has said yes
  const step = fn => args => {
    const r = fn?.(args);
    if (typeof r?.then === "function") return r.then(v => { if (v !== false) advance(args); return v; });
    if (r === false) return false;
    advance(args);
    return r;
  };
  // R4-10: each new panel starts at the rotation the last placed one had (core starts every shape at
  // its own data's rotation, so ten panels turned one by one came out as a comb of horizontal ones).
  let lastRotation = null;
  const seeded = new Set();
  const remember = args => {
    const r = args?.shape?.rotation;
    if (Number.isFinite(r)) lastRotation = r;
  };
  const confirm = fn => args => {
    const r = fn?.(args);
    if (typeof r?.then === "function") return r.then(v => { if (v !== false) remember(args); return v; });
    if (r !== false) remember(args);
    return r;
  };
  const theirsMove = options.onMove;
  const onMove = typeof theirsMove === "function" || theirsMove === undefined ? args => {
    const key = Number.isInteger(args?.shapeIndex) ? `${args.regionIndex ?? 0}:${args.shapeIndex}` : null;
    if (key !== null && !seeded.has(key)) {
      seeded.add(key);
      const sh = args.shape;
      if (lastRotation !== null && typeof sh?.rotate === "function" && Number.isFinite(sh.rotation) && sh.rotation !== lastRotation) {
        try { sh.rotate(lastRotation - sh.rotation); } catch (err) { log.debug("panel rotation", err); }
      }
    }
    return theirsMove?.(args);
  } : theirsMove;
  const handle = {
    done: () => {
      try { note?.remove?.(); } catch (err) { log.debug("panel notice", err); }
      note = null;
      if (shown === handle) shown = null;
    },
  };
  shown = handle;
  return { options: { ...options, onMove, preConfirm: confirm(step(options.preConfirm)), preSkip: step(options.preSkip) }, done: handle.done };
}

function wrapPlacement() {
  const proto = foundry.canvas?.layers?.RegionLayer?.prototype;
  if (!proto?.placeRegions) return;
  placement = wrapMethod(MODULE, {
    target: proto, name: "placeRegions", label: "RegionLayer#placeRegions", marker: WRAPPED, adjustments: "aoe-self-area-aim",
  }, function (wrapped, data, options = {}) {
    // an iterable that is not an array is read once here, so core gets the same list back
    if (data && !Array.isArray(data) && typeof data[Symbol.iterator] === "function") data = Array.from(data);
    const notice = panelNotice(Array.isArray(data) ? shapeCount(data) : 0, options);
    options = notice.options;
    const a = armed;
    armed = null;
    if (a && Date.now() < a.until && a.sceneId === canvas.scene?.id && setting("aimSelfAreas")) {
      const mine = aimer(a.tokenId);
      const theirs = options.onMove;
      options = { ...options, onMove: args => {
        const r = theirs?.(args);
        if (r === false) return false;
        return mine(args);
      } };
    }
    let out;
    try {
      out = wrapped(data, options);
    } catch (err) {
      notice.done();
      throw err;
    }
    if (out && typeof out.finally === "function") out.finally(notice.done).catch(() => {});
    else notice.done();
    return out;
  }, { log });
}

export function install(reg, ctx) {
  log = ctx.log;
  wrapPlacement();
  reg.on("dnd5e.preCreateMeasuredTemplate", reg.guardSwallowAsync("preCreateMeasuredTemplate(aim)", onPreCreate), { guard: false, label: "preCreateMeasuredTemplate(aim)" });
}

/**
 * A pending aim is dropped and core's own placeRegions comes back ([declared] D-A7, -44), so a
 * hot-patched copy wraps it again with its own state instead of standing down behind this one's.
 */
export function uninstall() {
  armed = null;
  shown?.done();
  placement?.unwrap();
  placement = null;
}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { shapeCount, panelNotice, casterToken, onPreCreate, aimer, wrapPlacement, WRAPPED, armed: () => armed, arm: v => { armed = v; } };
