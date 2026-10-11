/** The bench's synthetic room grid (moved from test/bench.mjs so the engine golden can use it). */

const w = (id, c) => ({_id: id, c, light: 20, move: 20, sight: 20, sound: 20,
                       door: 0, ds: 0, dir: 0, levels: []});

/** A grid of rooms, each hinted on all four sides — the densest realistic authoring. */
export function rooms(n) {
  const out = [];
  let k = 0;
  const S = 400;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = c * S + 100, y = r * S + 100;
      out.push(w(`a${k++}`, [x + 80, y, x + 220, y]));
      out.push(w(`a${k++}`, [x + 300, y + 80, x + 300, y + 220]));
      out.push(w(`a${k++}`, [x + 80, y + 300, x + 220, y + 300]));
      out.push(w(`a${k++}`, [x, y + 80, x, y + 220]));
    }
  }
  return out;
}
