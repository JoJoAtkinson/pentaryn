/**
 * The implementations core.test proves against the same tables: the verbatim oracle, and (guide step 2)
 * journal-core's own functions. A fixture edit, so the frozen core.test never changes.
 */
import * as oracle from "./legacy-journal.mjs";
import * as core from "../../journal-core.mjs";

export const IMPLS = [["oracle", oracle], ["core", core]];
