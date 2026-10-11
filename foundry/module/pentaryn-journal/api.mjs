/**
 * Pentaryn Player Journal — the API: implementations of the published methods over `ctx.exposed`
 * (what personal.mjs and bar.mjs exposed). May import core, the adapter, settings and lib — never a
 * feature file.
 */

import * as core from "./journal-core.mjs";
import { setting } from "./settings.mjs";
import { shouldShowBar as barFor, targetOf as targetForDoc } from "./sources-adapter.mjs";

const gmOpts = () => ({ gmButton: setting("gmButton") });
/** Turn an entry, a page or an item into a target, applying the same rules as the bar. */
const targetOf = doc => targetForDoc(doc, gmOpts());

function impl(ctx) {
  const x = ctx.exposed;
  return {
    personal: (user = game.user) => x.personal(user),
    async add(doc) {
      const target = targetOf(doc);
      if (!target) return null;
      return x.save(target);
    },
    status(doc) {
      const target = targetOf(doc);
      if (!target) return null;
      const { st, sources } = x.savedStatus(target);
      if (!sources.length && doc?.uuid && core.findSaved(x.personal()?.pages.contents, doc.uuid)) return "saved";
      return st;
    },
    async open(pageId) {
      const j = x.personal();
      if (!j) return null;
      return x.openSaved(j, pageId ?? j.pages.contents.at(-1)?.id);
    },
    shouldShowBar: (entry, user = game.user) => barFor(entry, user, gmOpts()),
    ensure: user => x.ensureFor(user),
    ensureAll: () => x.ensureAll(),
    report: () => x.report(),
  };
}

/** The legacy namespace object published one tick after ready (replaced by the kit build in step 6). */
export function legacyApi(ctx) {
  const m = impl(ctx);
  return {
    personal: m.personal, add: m.add, status: m.status, open: m.open, shouldShowBar: m.shouldShowBar,
    ensure: m.ensure, ensureAll: m.ensureAll, report: m.report, core,
  };
}
