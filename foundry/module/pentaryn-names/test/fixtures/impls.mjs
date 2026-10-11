/**
 * The implementations core.test proves against the same tables: the verbatim oracle and, from
 * guide step 2, names-core.mjs (`plan` = planTokenRelabels), so the frozen core.test's text never
 * changes. Each entry exposes the same three names: shortName, relabel, plan.
 */
import * as core from "../../names-core.mjs";
import * as oracle from "./legacy-names.mjs";

export const IMPLS = [
  ["oracle", { shortName: oracle.shortName, relabel: oracle.relabel, plan: oracle.legacyPlan }],
  ["core", { shortName: core.shortName, relabel: core.relabel, plan: core.planTokenRelabels }],
];
