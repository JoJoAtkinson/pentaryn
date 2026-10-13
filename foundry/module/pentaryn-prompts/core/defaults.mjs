/**
 * pentaryn-prompts core — the setting defaults, written once (prompts-core-EXT-2): settings.mjs
 * registers them, gather, the panel and the crops fall back to them, and the core's default
 * parameters read them. PURE: no Foundry global.
 */

import { GATHER_CHARS } from "./gather-text.mjs";

export const DEFAULTS = Object.freeze({
  unseenWithinFt: 60,
  cropMaxPerCall: 6,
  cropLongSidePx: 768,
  cropsDefault: "auto",
  gatherChars: GATHER_CHARS,
});
