/**
 * The implementations core.test proves against the same tables. Today the verbatim oracle; guide step 2
 * appends `["core", await import("../../journal-core.mjs")]` (a fixture edit), so the frozen core.test
 * never changes.
 */
import * as oracle from "./legacy-journal.mjs";

export const IMPLS = [["oracle", oracle]];
