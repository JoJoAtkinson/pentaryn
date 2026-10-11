/**
 * The pure core of the Known list, the study ladder, lore rows, the attribute layer and the
 * planner — a BARREL since S4 (ties-36). The rules live in core/*.mjs, one domain per file:
 *
 *   core/known.mjs       the Known schema, the hardened reader, granted cards, the notebook pick
 *   core/study.mjs       the study ladder, the `studied` and `beliefs` ledgers
 *   core/lore.mjs        lore rows, fact keys, lore outcomes
 *   core/attributes.mjs  the registry, its tree, review state, sources, ancestry
 *   core/ledgers.mjs     world knowledge, identification, the planner, attribute-lore beliefs
 *   core/roster.mjs      the inspect window's PC roster
 *   core/prose.mjs       enricher guard, flattening, `composeReveal`
 *   core/facts.mjs       `shareStatus`, fact keys and order
 *
 * This path is kept because it is documented: `context/foundry/attributes.md` and console macros
 * `import("/modules/pentaryn-ties/known-core.mjs")`, and test/known.mjs imports it bare.
 *
 * **Nothing under core/ may touch a Foundry global**, and core files import only core files.
 */
export * from "./core/known.mjs";
export * from "./core/study.mjs";
export * from "./core/lore.mjs";
export * from "./core/attributes.mjs";
export * from "./core/ledgers.mjs";
export * from "./core/roster.mjs";
export * from "./core/prose.mjs";
export * from "./core/facts.mjs";
