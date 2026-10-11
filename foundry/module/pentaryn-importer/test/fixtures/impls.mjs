/**
 * The implementations core.test proves against the same tables: the verbatim oracle and, since
 * guide step 2, the extracted importer-core.mjs. The frozen core.test runs every table against both
 * and its own text never changes.
 */
import * as oracle from "./legacy-importer.mjs";
import * as core from "../../importer-core.mjs";

export const IMPLS = [["oracle", oracle], ["core", core]];
