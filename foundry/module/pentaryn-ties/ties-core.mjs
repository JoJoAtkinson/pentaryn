/**
 * Pentaryn NPC Ties — PURE core: the module's identity constants, the tie value rules and the
 * reverse-side (mirror) rules. No Foundry global at runtime, so every rule here runs in node on
 * plain fixtures (test/ties-core.test.mjs). Glue files import from here; nothing here imports glue.
 *
 * The rest of the pure layer — the Known schema, the study ladder, lore rows, the attribute registry,
 * the ledgers and the planner — lives in core/*.mjs behind the known-core.mjs barrel.
 *
 * Direction: an actor's array says what THAT ACTOR is to each person listed.
 *   Piet's array contains { id: <brellin>, word: "understudy" }
 *   → hovering Piet, the card over Brellin reads "understudy".
 */

export const MODULE = "pentaryn-ties";
export const SHORT = "ties";
export const NS = "ties";
export const VERSION = "0.19.4"; // === module.json version (test/ties-core.test.mjs pins it)
export const CONTRACT = "pentaryn-ties/api@1"; // bump the major on a published-shape change
export const I18N = "PENTARYN_TIES";
export const CSS = "pt-"; // flags.pentaryn.cssPrefix (Wave 7 batch); `pt-` is used by no other module
export const FLAG_SCOPE = MODULE;

/** Events this module emits: none. Ties listens to Foundry's hooks and fires none of its own. */
export const HOOKS = Object.freeze({});

export const FLAG = "ties";
export const LEGACY_SCOPE = "world"; // pre-module data lived on flags.world.ties

export const STANCES = [
  { value: 2, key: "devoted", hex: 0x2ecc40, css: "#2ecc40" },
  { value: 1, key: "friendly", hex: 0x6ab04c, css: "#6ab04c" },
  { value: 0, key: "neutral", hex: 0x9aa0a6, css: "#9aa0a6" },
  { value: -1, key: "wary", hex: 0xe1a53a, css: "#e1a53a" },
  { value: -2, key: "hostile", hex: 0xe74c3c, css: "#e74c3c" }
];

/** @deprecated Unused by the module (ties-42); kept one release because ties-api.mjs has always exported it. */
export const STRENGTHS = [5, 4, 3, 2, 1];

/**
 * Notes are free prose, so cap them. Flags ride along on every actor update; an
 * accidental paste of a whole session log would bloat the document forever.
 */
export const NOTES_MAX = 4000;

/**
 * And a cap on the one-word label. It is meant to be a word; nothing enforced that, so a
 * pasted paragraph — or a relayed one — could ride along on every actor update forever.
 */
export const WORD_MAX = 120;

const num = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
export const clampStance = v => Math.max(-2, Math.min(2, num(v, 0)));
export const clampStrength = v => Math.max(1, Math.min(5, num(v, 3)));
export const clampNotes = v => (typeof v === "string" ? v.slice(0, NOTES_MAX) : "");
export const clampWord = v => (typeof v === "string" ? v.trim().slice(0, WORD_MAX) : "");
export const stanceOf = v => STANCES.find(s => s.value === clampStance(v)) ?? STANCES[2];

/* -------------------------------------------- */
/*  The reverse side (ties-12)                  */
/* -------------------------------------------- */

/*
 * Three writers touch the other person's half of a tie, and they deliberately differ:
 *
 *   · the tie dialog's Save — `resolveMirror`: a blank box FOLLOWS the forward side while the other
 *     side is still linked; typed text diverges; emptying a seeded box re-links.
 *   · the GM relay (a player's tie on an NPC) — `seedReverse`: fills only what is blank and never
 *     follows, because following needs the sender's previous text, which cannot be trusted off the wire.
 *   · `setTie` (the API's `set`) — FORCE-mirrors: overwrites the reverse word and stance, keeps its
 *     notes unless `reverseNotes` is given. Same name, different contract; it stays in ties-adapter.
 */

/**
 * Is the other side still following mine? Blank, or equal to what MY side said before this save.
 * @param {*} theirs   the reverse side's text as it reads now
 * @param {*} prevMine what the forward side said BEFORE this save
 */
export function mirrorLinked(theirs, prevMine) {
  const v = String(theirs ?? "").trim();
  return !v || v === String(prevMine ?? "").trim();
}

/**
 * The dialog's rule for one reverse field (word or notes).
 *
 * `seeded` is what the render put in the box. A box still holding it was never touched — so we must
 * write back what the OTHER SIDE says NOW, not the text we rendered, or a diverged side edited
 * elsewhere while the window sat open would be rolled back to whatever it said when the dialog opened.
 *
 * @param {*} box       the box's text at save time
 * @param {*} seeded    what the render put in the box
 * @param {string} mineNow   the forward side's new text
 * @param {string} revNow    the reverse side's text, re-read at save time
 * @param {string} prevMine  the forward side's text before this save
 * @returns {{ value: string, followed: boolean }}
 */
export function resolveMirror(box, seeded, mineNow, revNow, prevMine) {
  const typed = String(box ?? "");
  const wasSeeded = !!String(seeded ?? "").trim();
  const untouched = typed === String(seeded ?? "");
  // typed something new: diverge, or set a side that had none
  if (typed.trim() && !untouched) return { value: typed, followed: false };
  // left the box exactly as rendered: their text stands, whatever it says NOW
  if (untouched && wasSeeded) return { value: revNow, followed: false };
  /*
   * EMPTIED a box that had their diverged text in it. This is the re-link gesture the README
   * documents and the reason the override button was dropped — and it used to fall through every
   * branch to "leave it alone", so clearing the box did nothing at all and the only way back was
   * retyping the forward text by hand.
   */
  if (!typed.trim() && wasSeeded) return { value: mineNow, followed: true };
  if (mirrorLinked(revNow, prevMine)) return { value: mineNow, followed: true };
  return { value: revNow, followed: false }; // diverged behind our back; leave it alone
}

/** Only a field with nothing in it is the relay's to fill. */
const blank = v => !String(v ?? "").trim();

/**
 * The relay's rule: fill the gaps only; anything already written on their side is theirs.
 * @param {{word, notes}} rev   the reverse row as stored
 * @param {{word, notes}} mine  the forward row, re-read off the source actor
 * @returns {{ word, notes, changed: boolean }}
 */
export function seedReverse(rev, mine) {
  const word = blank(rev.word) ? mine.word : rev.word;
  const notes = blank(rev.notes) ? clampNotes(mine.notes) : rev.notes;
  return { word, notes, changed: !(rev.word === word && rev.notes === notes) };
}
