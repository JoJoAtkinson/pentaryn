/**
 * Undo oracle for guide step 8a (senses-walls-cursors-1): today's selection logic from
 * pentaryn-walls.mjs undo() (snapshot :146–167), ported verbatim over PLAIN wall objects
 * (`w.flags?.["wall-autocomplete"]?.…` instead of the throwing `getFlag`). `planUndo` must deep-equal it.
 */

const SCOPE = "wall-autocomplete";
const flag = (w, key) => w.flags?.[SCOPE]?.[key];

export function legacyPlan(walls, { all = false } = {}) {
  const stamped = walls.filter(w => flag(w, "run"));
  if (!stamped.length) return { stamped: 0, latest: null, generated: [], restores: [], remaining: 0 };
  const latest = stamped.map(w => flag(w, "run")).sort().at(-1);
  const targets = all ? stamped : stamped.filter(w => flag(w, "run") === latest);
  const generated = [], restores = [];
  for (const wall of targets) {
    if (flag(wall, "generated")) generated.push(wall._id ?? wall.id);
    else {
      const prior = flag(wall, "priorC");
      if (prior) restores.push({ _id: wall._id ?? wall.id, c: prior, [`flags.-=${SCOPE}`]: null });
    }
  }
  const remaining = new Set(stamped.map(w => flag(w, "run"))).size - 1;
  return { stamped: stamped.length, latest, generated, restores, remaining };
}

/** Finding -1's walls a–e (plain objects). */
export const UNDO_WALLS = [
  { _id: "a", c: [0, 0, 10, 0], flags: { [SCOPE]: { run: "2026-01-01T00:00:00Z", generated: true } } },
  { _id: "b", c: [0, 10, 10, 10], flags: { [SCOPE]: { run: "2026-01-02T00:00:00Z", generated: true } } },
  { _id: "c", c: [0, 0, 50, 0], flags: { [SCOPE]: { run: "2026-01-02T00:00:00Z", rule: "X1", priorC: [0, 0, 80, 0] } } },
  { _id: "d", c: [0, 20, 10, 20], flags: {} },
  { _id: "e", c: [0, 30, 10, 30], flags: { [SCOPE]: { generated: true } } },
];
