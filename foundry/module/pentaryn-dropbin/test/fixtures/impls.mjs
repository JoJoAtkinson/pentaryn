/**
 * The implementations core.test proves against the same tables. Today the verbatim oracle; guide step 2
 * appends `["core", await import("../../dropbin-core.mjs")]` (a fixture edit), so the frozen core.test
 * never changes. Signatures are the oracle's (fixtures/legacy-dropbin.mjs).
 */
import * as oracle from "./legacy-dropbin.mjs";

export const IMPLS = [["oracle", oracle], ["core", await import("../../dropbin-core.mjs")]];
