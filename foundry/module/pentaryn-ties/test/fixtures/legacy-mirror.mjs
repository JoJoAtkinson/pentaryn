/**
 * ORACLE (ties checkpoint, wave 3 — guide §3 S2 item 5, ties-12). The mirror rules exactly as they
 * stood at the checkpoint, copied verbatim so S3's `resolveMirror` / `seedReverse` in ties-core.mjs can
 * be proven equal row for row. Do not edit: this is the "before" half, not live code.
 *
 *   linked, resolve   tie-dialog.mjs #save (checkpoint lines 661–688)
 *   relayFill         relay.mjs applyMirror's fill-the-gaps rule (checkpoint lines 143–148)
 *   forceMirror       ties-api.mjs setTie's upsert of the reverse side (checkpoint lines 247–271),
 *                     the "same name, different contract" row: setTie overwrites, the dialog seeds
 */

// tie-dialog.mjs, verbatim
export const linked = (theirs, prevMine) => {
  const v = String(theirs ?? "").trim();
  return !v || v === String(prevMine ?? "").trim();
};
export const resolve = (box, seeded, mineNow, revNow, prevMine) => {
  const typed = String(box ?? "");
  const wasSeeded = !!String(seeded ?? "").trim();
  const untouched = typed === String(seeded ?? "");
  // typed something new: diverge, or set a side that had none
  if (typed.trim() && !untouched) return { value: typed, followed: false };
  // left the box exactly as rendered: their text stands, whatever it says NOW
  if (untouched && wasSeeded) return { value: revNow, followed: false };
  if (!typed.trim() && wasSeeded) return { value: mineNow, followed: true };
  if (linked(revNow, prevMine)) return { value: mineNow, followed: true };
  return { value: revNow, followed: false }; // diverged behind our back; leave it alone
};

// relay.mjs, verbatim (blank + the two fill lines + the no-op test)
const blank = v => !String(v ?? "").trim();
export const relayFill = (rev, mine, clampNotes = v => (typeof v === "string" ? v.slice(0, 4000) : "")) => {
  const word = blank(rev.word) ? mine.word : rev.word;
  const notes = blank(rev.notes) ? clampNotes(mine.notes) : rev.notes;
  if (rev.word === word && rev.notes === notes) return null; // no write
  return { word, notes };
};

// ties-api.mjs setTie's reverse upsert, reduced to the row it writes (notes: undefined keeps prev)
export const forceMirror = (prev, { reverseWord, reverseStance, reverseNotes, strength }) => ({
  word: reverseWord,
  notes: reverseNotes === undefined ? prev?.notes ?? "" : String(reverseNotes).slice(0, 4000),
  stance: reverseStance,
  strength,
});
