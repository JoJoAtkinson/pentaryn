/**
 * The implementations core.test proves against the same tables. Today only the verbatim oracle;
 * guide step 2 adds names-core.mjs here (`plan` = planTokenRelabels), so the frozen core.test's
 * text never changes. Each entry exposes the same three names: shortName, relabel, plan.
 */
import * as oracle from "./legacy-names.mjs";

export const IMPLS = [["oracle", { shortName: oracle.shortName, relabel: oracle.relabel, plan: oracle.legacyPlan }]];
