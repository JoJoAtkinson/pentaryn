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
 * One queue for both keys (items-journal-18): every write reads the counter and the log, decides,
 * and writes inside one task, so two appends on this client never read the same counter. Created
 * on first use (foundry.utils.Semaphore), once per page.
 */
let ledgerQueue = null;
const queue = () => (ledgerQueue ??= new foundry.utils.Semaphore(1));

/**
 * Appends waiting for the next write (items-journal-19). The first append starts a task at once;
 * every append that arrives while a write is in flight joins the next batch, and a batch is one
 * counter write and one log write however many entries it holds.
 */
let batch = null;

async function drain() {
  const items = batch;
  batch = null;                        // later arrivals start the next batch, queued behind this one
  try {
    let log = readLog(), counter = setting("counter") ?? 0;
    const results = items.map(it => {
      const r = appendEntry(log, counter, it.entry, it.dedupeMs);
      ({ log, counter } = r);
      return r;
    });
    if (results.some(r => !r.duplicate)) await writeLedger({ n: counter, log });
    items.forEach((it, i) => it.resolve({ n: results[i].n, duplicate: results[i].duplicate, log }));
  } catch (err) {
    for (const it of items) it.reject(err);
  }
}

/**
 * Append `entry` to the ledger, serialised and coalesced. Resolves `{ n, log, duplicate }`: on a
 * duplicate of the tail (same key within `dedupeMs`) nothing is written for it and `n` is the
 * tail's. A failed write rejects the callers in that batch only; later appends still run.
 */
export function appendLedger(entry, dedupeMs = DEDUPE_MS) {
  return new Promise((resolve, reject) => {
    const item = { entry, dedupeMs, resolve, reject };
    if (batch) {
      batch.push(item);
      return;
    }
    batch = [item];
    queue().add(drain);
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
