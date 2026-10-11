/**
 * Pentaryn Player Journal — the API: implementations of the manifest rows over `ctx.exposed` (what
 * personal.mjs and bar.mjs exposed), selftest(), and buildApiFor(ctx). May import core, the
 * adapter, settings and lib — never a feature file.
 */

import * as core from "./journal-core.mjs";
import { CORE_NAMES, MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, setting, settingsSnapshot } from "./settings.mjs";
import { shouldShowBar as barFor, targetOf as targetForDoc } from "./sources-adapter.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

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
    selftest: () => selftest(ctx),
  };
}

function selftest(ctx) {
  const checks = [
    { label: "published as module.api", ok: game.modules.get(core.MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${core.NS} is this API`, ok: game.pentaryn?.[core.NS] === ctx.api },
    { label: "settings readable", ok: typeof setting("gmButton") === "boolean" && typeof setting("singlePageReadables") === "boolean" },
    { label: "relay query registered", ok: typeof CONFIG.queries?.[core.QUERY] === "function" },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/** `core.<name>` for exactly the names published before the migration (`core.MOD` = MODULE). */
function coreMembers() {
  return Object.fromEntries(CORE_NAMES.map(n => [`core.${n}`, n === "MOD" ? core.MODULE : core[n]]));
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, { ...impl(ctx), ...coreMembers() }, {
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: core.HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(core.NS),
    }),
  });
}
