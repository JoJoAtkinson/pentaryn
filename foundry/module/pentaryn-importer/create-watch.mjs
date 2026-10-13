/**
 * pentaryn-importer — FEATURE: the create watch (wave-3 importer item 2, [declared]).
 *
 * Two GM tabs (the MCP bridge tab and a GM browser tab) that create the same new slug in the same
 * instant both pass the importer's look-first check, and Foundry 14.369's server replaces a world
 * Actor on a `keepId` create over a held id without an error. The server handles the two creates one
 * at a time and answers the first tab before it handles the second, so the tab whose create lands
 * SECOND receives the other tab's `createActor` broadcast before its own response. This feature lets
 * `createOrJoin` (documents-adapter.mjs) see that: a `createActor` listener for one id, registered on
 * the module's hook registry only for the create's round trip and removed straight after.
 *
 * Nothing is registered at load or at ready: `install` keeps the registry, `watchCreates` registers
 * and its `stop` unregisters. `uninstall` drops the registry (the module's `uninstall` unwinds any
 * watch still in flight through `reg.offAll()`). The listener only records instances; it never writes.
 */

/** The module's hook registry while installed. */
let REG = null;

/**
 * @param {{on: Function, off: Function}} reg  the module's hook registry
 * @param {{exposed?: object}} ctx              gets `exposed.watchCreates`
 */
export function install(reg, ctx) {
  REG = reg;
  ctx.exposed = { ...(ctx.exposed ?? {}), watchCreates };
}

export function uninstall() {
  REG = null;
}

/**
 * Record every Actor instance created under `id`, in arrival order, until `stop()`.
 * @param {string} id
 * @returns {{seen: Actor[], stop: () => void}}
 */
function watchCreates(id) {
  const seen = [];
  const reg = REG;
  if (!reg) return { seen, stop: () => {} };
  const hook = reg.on("createActor", doc => {
    if (doc?.id === id) seen.push(doc);
  }, { label: "create watch" });
  return { seen, stop: () => { reg.off(hook); } };
}
