/**
 * pentaryn-lookup — the API: buildApiFor(ctx) and selftest().
 *
 * GLUE. May import core, the adapter, the manifest and lib — never books.mjs: the lookups reach
 * this file as the feature's contribution (ctx.contributions), and selftest calls the BUILT API
 * through ctx.api.
 */

import { BOOKSETS, HOOKS, LIMITS, NS, toPlainText } from "./lookup-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { indexDocumentProbe } from "./packs-adapter.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

/**
 * Assert this module's assumptions against the live world.
 *
 * Run after every sync, and after every Saturday auto-update — an update is exactly
 * when a premium module restructures its journals or dnd5e moves a data path, and
 * both failures are otherwise silent until someone asks a rules question at the table.
 */
async function selftest(ctx) {
  const { search, page, monster, monsters, names, packs, onList } = ctx.api;
  const checks = [];
  // Each check computes `[ok, detail]`; a check that throws is recorded as failed with the error's
  // message and the rest still run (R4). `once` shares one call between the checks that read it.
  const check = async (label, fn) => {
    try {
      const [ok, detail] = await fn();
      checks.push({ label, ok: !!ok, detail });
    } catch (err) {
      checks.push({ label, ok: false, detail: err?.message ?? String(err) });
    }
  };
  const once = fn => { let p; return () => (p ??= fn()); };

  const p = once(() => packs());
  for (const id of BOOKSETS.rules)
    await check(`pack present: ${id}`, async () => [(await p()).packs.find(r => r.id === id)?.present]);

  const s = once(() => search("half cover"));
  await check("search finds 'half cover'", async () => { const r = await s(); return [r.total > 0, `total=${r.total}`]; });
  await check("a hit names a Cover page", async () => { const r = await s();
    return [r.hits?.some(h => /cover/i.test(h.page)), r.hits?.[0]?.page]; });
  await check("hits carry a pasteable uuid", async () => { const r = await s();
    return [r.hits?.[0]?.uuid?.startsWith("Compendium."), r.hits?.[0]?.uuid]; });
  await check("snippets are enricher-free", async () =>
    [!(await s()).hits?.some(h => /@UUID\[|&Reference\[|\[\[/.test(h.snippet))]);

  await check("page('Study') resolves", async () => { const pg = await page("Study"); return [!!pg.text, pg.journal ?? pg.hint]; });

  await check("monster('Goblin') has numeric cr/ac/hp", async () => {
    const m = await monster("Goblin");
    return [typeof m.cr === "number" && typeof m.ac === "number" && typeof m.hp === "number",
            m.warning ?? `cr=${m.cr} ac=${m.ac} hp=${m.hp}`];
  });

  // Documents the bug the adapter routes around. If Foundry ever fixes it, this fails
  // and the fix becomes an informed decision instead of a silent regression.
  // It tests the MECHANISM, not a live index: counting filled entries in
  // `getIndex({fields})` depends on whether something already called getDocuments()
  // this session, so it flipped between pass and fail on v14.369 with the bug intact.
  // Side-effect free: replays indexDocument's projection on a literal, reads source.
  await check("core indexDocument still drops nested page fields (documents the workaround)", async () => {
    const { viaGetProperty, projected } = indexDocumentProbe();
    return [viaGetProperty && !Array.isArray(projected.pages),
            `indexDocument via getProperty=${viaGetProperty}, ` +
            `projected pages=${JSON.stringify(projected.pages)}`];
  });

  await check("onList('Fireball', 'wizard') is true", async () => {
    const ol = await onList("Fireball", "wizard");
    return [ol.onList === true, JSON.stringify(ol)];
  });
  await check("onList('Fireball', 'cleric') is false", async () => {
    const ol2 = await onList("Fireball", "cleric");
    return [ol2.onList === false, JSON.stringify(ol2)];
  });
  await check("page('Artifacts') carries its embedded roll tables", async () => {
    const art = await page("Artifacts", { books: ["dnd-dungeon-masters-guide.content"] });
    return [(art.tables?.length ?? 0) >= 4 && art.tables[0].rows?.length > 0, `${art.tables?.length ?? 0} table(s)`];
  });

  await check("monsters({large construct, CR 5-8}) finds the Shield Guardian", async () => {
    const ms = await monsters({ size: "large", type: "construct", cr: "5-8" });
    return [ms.monsters?.some(m => m.name === "Shield Guardian"), `${ms.count} hit(s)`];
  });
  await check("names() lists PHB classes, subclasses, species, feats", async () => {
    const nm = await names();
    return [nm.classes.includes("Paladin") && (nm.subclasses.cleric ?? []).length > 0 && nm.species.includes("Elf, High") && (nm.feats.origin ?? []).length > 0,
            `${nm.classes.length} classes, ${nm.species.length} species`];
  });
  await check("monster(…, {text}) resolves enrichers", async () => {
    const gt = await monster("Goblin Boss", { text: true });
    const txt = (gt.features ?? []).map(f => f.text).join(" ");
    return [txt.length > 0 && !/\[\[|lookup @/.test(txt), txt.slice(0, 80)];
  });

  const failed = checks.filter(c => !c.ok);
  return { ok: failed.length === 0, passed: checks.length - failed.length,
           failed: failed.length, checks };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    selftest: () => selftest(ctx),
    toPlainText,
    LIMITS,
  }, {
    contributions: ctx.contributions,
    members: {
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(NS),
    }),
  });
}
