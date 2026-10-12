/**
 * Pentaryn Player Journal — the API: implementations of the manifest rows over `ctx.exposed` (what
 * personal.mjs and bar.mjs exposed), selftest(), and buildApiFor(ctx). May import core, the
 * adapter, settings and lib — never a feature file.
 */

import * as core from "./journal-core.mjs";
import { CORE_NAMES, MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, setting, settingsSnapshot } from "./settings.mjs";
import { shouldShowBar as barFor, descriptorsFor, rawTargetOf, targetOf as targetForDoc } from "./sources-adapter.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

/** Why this client's last add()/status() returned null (items-journal-35); null after a result. */
let lastReason = null;

const gmOpts = () => ({ gmButton: setting("gmButton") });
/** Turn an entry, a page or an item into a target, applying the same rules as the bar. */
const targetOf = doc => targetForDoc(doc, gmOpts());
/** core.status, except that a document with no visible sources still reads "saved" when it is itself saved. */
const statusOrSaved = (pages, sources, doc) =>
  (!sources.length && doc?.uuid && core.findSaved(pages, doc.uuid)) ? "saved" : core.status(pages, sources);

/**
 * inspect's ref. The kit's root `game.pentaryn.inspect(ref)` resolves the ref as an Actor and passes
 * that to every namespace, so an Actor (or a Token, or a placeable carrying one) means the player whose
 * assigned character it is — null when it is nobody's. Anything else resolves as a user ref.
 */
function inspectedUser(ref) {
  const doc = ref?.documentName ? ref : ref?.document?.documentName ? ref.document : null;
  if (doc?.documentName !== "Actor" && doc?.documentName !== "Token") return resolveRef(ref, "user");
  const actor = doc.documentName === "Token" ? doc.actor : doc;
  const ids = new Set([actor?.id, doc.actorId, actor?.token?.actorId].filter(Boolean));
  return game.users.find(u => !u.isGM && ids.has(u.character?.id)) ?? null;
}

function impl(ctx) {
  const x = ctx.exposed;
  return {
    personal: (user = game.user) => x.personal(user),
    async add(doc) {
      const target = targetOf(doc);
      if (!target) { lastReason = "no-target"; return null; }
      lastReason = null;                    // an add that throws leaves no earlier call's reason behind
      const out = await x.save(target);
      lastReason = out ? null : x.lastSkip();
      return out;
    },
    status(doc) {
      const target = targetOf(doc);
      if (!target) { lastReason = "no-target"; return null; }
      lastReason = null;
      const pages = x.personal()?.pages.contents ?? [];
      const { sources } = x.savedStatus(target, pages);
      return statusOrSaved(pages, sources, doc);
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
    inspect(ref) {
      const user = inspectedUser(ref);
      if (!user) return null;
      const all = x.personalsOf(user.id);
      return toPlain({
        user: refOf(user),
        journal: all[0] ? refOf(all[0]) : null,
        duplicates: all.slice(1).map(j => j.id),
        entries: core.entryRows(all[0]?.pages.contents),
      });
    },
    entriesOf: user => toPlain(core.entryRows(x.personal(user)?.pages.contents), { maxDepth: 3 }),
    statusFor(doc, { as } = {}) {
      const user = as === undefined || as === null ? game.user : resolveRef(as, "user");
      const target = rawTargetOf(doc);
      if (!target) return null;
      const pages = x.personal(user)?.pages.contents ?? [];
      return statusOrSaved(pages, descriptorsFor(target, user), doc);
    },
    lastReason: () => lastReason,
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

/** `core.<name>` for exactly the names published before the migration (`core.MOD` is journal-core's own alias of MODULE). */
function coreMembers() {
  return Object.fromEntries(CORE_NAMES.map(n => [`core.${n}`, core[n]]));
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
