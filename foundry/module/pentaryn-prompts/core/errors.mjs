/**
 * pentaryn-prompts core — the contract's error codes.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

/* ── Error codes (the contract's) ────────────────────────────────────────── */

export const CODES = Object.freeze(["TEXT_CHANGED", "MARKER_GONE", "CALL_UNKNOWN", "SCENE_UNKNOWN", "BAD_SPEC", "NOT_GM", "CREATE_FAILED", "DRY_RUN_REQUIRED"]);

/** `Error("<CODE>: detail")` with `.code` set. */
export function codedError(code, detail = "") {
  const e = new Error(detail ? `${code}: ${detail}` : code);
  e.code = code;
  return e;
}

/** The code at the front of an error message, or null. */
export function errorCode(err) {
  if (err?.code && CODES.includes(err.code)) return err.code;
  const m = /^([A-Z_]+):/.exec(String(err?.message ?? err ?? ""));
  return m && CODES.includes(m[1]) ? m[1] : null;
}
