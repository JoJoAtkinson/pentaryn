/**
 * Pentaryn Drop Bin — settings. The only file outside lib/ that calls game.settings.
 *
 * Two hidden world settings hold the ledger: `log` (every entry, oldest first) and `counter` (the
 * last number handed out). They are store rows: no labels, never in the settings menu. `clear()`
 * empties the log and keeps the counter, so a ledger number is never reused.
 */

import { MODULE, DEDUPE_MS, appendEntry } from "./dropbin-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "log", scope: "world", config: false, type: Array, default: [], store: true,
    doc: "The ledger: every entry, oldest first, each with the item's complete source object.",
  },
  {
    key: "counter", scope: "world", config: false, type: Number, default: 0, store: true,
    doc: "The last ledger number handed out. clear() keeps it, so numbers are never reused.",
  },
]);

/** Called from the entry's `init` handler (rows already registered are skipped). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS);
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

/** The kit `settings()` member: store rows report `{ store: true, size }`, not the ledger. */
export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}

/** The ledger, oldest first; [] (with a warning) when it cannot be read. */
export function readLog() {
  try {
    const v = game.settings.get(MODULE, "log");
    return Array.isArray(v) ? v : [];
  } catch (err) {
    console.warn(`${MODULE} | could not read the ledger`, err);
    return [];
  }
}

/**
 * One queue for both keys (items-journal-18): every append reads the counter and the log, decides,
 * and writes inside one task, so two appends on this client never read the same counter. Created
 * on first use (foundry.utils.Semaphore), once per page.
 */
let ledgerQueue = null;
const queue = () => (ledgerQueue ??= new foundry.utils.Semaphore(1));

/**
 * Append `entry` to the ledger, serialised. Resolves `{ n, log, duplicate }`: on a duplicate of
 * the tail (same key within `dedupeMs`) nothing is written and `n` is the tail's. A failed write
 * rejects this caller only; later appends still run.
 */
export function appendLedger(entry, dedupeMs = DEDUPE_MS) {
  return queue().add(async () => {
    const r = appendEntry(readLog(), setting("counter") ?? 0, entry, dedupeMs);
    if (!r.duplicate) await writeLedger({ n: r.n, log: r.log });
    return r;
  });
}

/** Write the counter, then the log (in that order, each awaited). */
export async function writeLedger({ n, log }) {
  await game.settings.set(MODULE, "counter", n);
  await game.settings.set(MODULE, "log", log);
}

/** Empty the log; the counter is kept. */
export async function clearLog() {
  await game.settings.set(MODULE, "log", []);
}
