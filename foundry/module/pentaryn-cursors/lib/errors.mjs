// pentaryn kit 1.1.0 · vendored from foundry/lib/errors.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Coded errors and the ok/fail result shapes every Pentaryn API speaks.
 *
 * The message PREFIX is the wire format: `NOT_FOUND: actor Esren`. A query that throws crosses the
 * socket as a plain Error with only its message intact, so the code has to survive in the text —
 * `errorCode()` reads it back from either the `code` property or that prefix.
 *
 * Pure: no Foundry global is touched.
 */

export const KIT_VERSION = "1.1.0";

/** Every code a kit-built API may throw or return in a `fail()`. */
export const CODES = Object.freeze([
  "NOT_GM", "NO_GM", "NOT_READY", "NOT_FOUND", "AMBIGUOUS", "BAD_ARGS",
  "REFUSED", "CONFLICT", "UNSUPPORTED", "TIMEOUT", "INTERNAL",
]);

/** API member names the kit owns on every namespace. `buildApi` refuses a row that would clobber one. */
export const RESERVED = Object.freeze([
  "describe", "inspect", "settings", "trace", "version", "contract", "uninstall", "selftest",
]);

export class PentarynError extends Error {
  code;
  extra;

  constructor(code, detail = "", extra) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "PentarynError";
    this.code = code;
    this.extra = extra;
  }
}

/**
 * @param {string} code     one of CODES (not enforced: a module may add its own)
 * @param {string} [detail] human text after the prefix
 * @param {*} [extra]       structured detail for local callers; never crosses the socket
 */
export function codedError(code, detail = "", extra) {
  return new PentarynError(code, detail, extra);
}

const PREFIX = /^([A-Z][A-Z0-9_]*):/;

/**
 * The code of an error: its `code` property when that is a string, else the message prefix.
 * @param {*} err
 * @param {string[]|null} [codes]  when given, a code outside this list reads as null
 * @returns {string|null}
 */
export function errorCode(err, codes = null) {
  let code = null;
  if (typeof err?.code === "string") code = err.code;
  else {
    const m = PREFIX.exec(String(err?.message ?? ""));
    if (m) code = m[1];
  }
  if (code && codes && !codes.includes(code)) return null;
  return code;
}

export function isCoded(err, code) {
  return errorCode(err) === code;
}

export const ok = (fields = {}) => ({ ok: true, ...fields });
export const fail = (code, reason, fields = {}) => ({ ok: false, code, reason, ...fields });

/** An error turned into a `fail()` result, for writers that must not throw. */
export function toFail(err) {
  return fail(errorCode(err) ?? "INTERNAL", err?.message ?? String(err));
}
