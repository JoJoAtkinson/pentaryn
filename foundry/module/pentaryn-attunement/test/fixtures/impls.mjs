/**
 * The implementations core.test proves against the same tables. Today only the verbatim oracle; guide
 * step 2 appends `["core", await import("../../attunement-core.mjs")]` here (a fixture edit), so the
 * frozen core.test runs every table against both and its own text never changes.
 */
import * as oracle from "./legacy-attunement.mjs";

export const IMPLS = [["oracle", oracle], ["core", await import("../../attunement-core.mjs")]];
