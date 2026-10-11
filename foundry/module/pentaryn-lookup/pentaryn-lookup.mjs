/**
 * pentaryn-lookup — the owned books, searchable from one call.
 *
 * This file is the ONLY part that touches Foundry, and it is deliberately thin: turn
 * `game.packs` into plain data, hand it to lookup-core, publish the API. Everything
 * that can be subtly wrong lives in lookup-core.mjs, which `node test/run.mjs` proves.
 *
 * If a Foundry major bump breaks this module, this is the file to re-verify — it is
 * one screenful, and every Foundry API it depends on is named in the README's table.
 */

import { LIMITS, MODULE, BOOKSETS, toPlainText } from "./lookup-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import * as books from "./books.mjs";

/** Features in load order. */
const FEATURES = [books];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);
const ctx = { log, reg, api: null, contributions: [], uninstall };

/** Install every feature synchronously, at load (a migrating module, use-doc §5.2). */
function install() {
  for (const feature of FEATURES) {
    const contribution = feature.install(reg, ctx);
    if (contribution) ctx.contributions.push(contribution);
  }
}

function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

install();
const { search, page, monster, monsters, names, packs, onList, spellList } =
  Object.assign({}, ...ctx.contributions.map(c => c.impl));

/**
 * Assert this module's assumptions against the live world.
 *
 * Run after every sync, and after every Saturday auto-update — an update is exactly
 * when a premium module restructures its journals or dnd5e moves a data path, and
 * both failures are otherwise silent until someone asks a rules question at the table.
 */
async function selftest() {
  const checks = [];
  const check = (label, ok, detail) => checks.push({ label, ok: !!ok, detail });

  const p = await packs();
  for (const id of BOOKSETS.rules)
    check(`pack present: ${id}`, p.packs.find(r => r.id === id)?.present);

  const s = await search("half cover");
  check("search finds 'half cover'", s.total > 0, `total=${s.total}`);
  check("a hit names a Cover page", s.hits?.some(h => /cover/i.test(h.page)),
        s.hits?.[0]?.page);
  check("hits carry a pasteable uuid",
        s.hits?.[0]?.uuid?.startsWith("Compendium."), s.hits?.[0]?.uuid);
  check("snippets are enricher-free",
        !s.hits?.some(h => /@UUID\[|&Reference\[|\[\[/.test(h.snippet)));

  const pg = await page("Study");
  check("page('Study') resolves", !!pg.text, pg.journal ?? pg.hint);

  const m = await monster("Goblin");
  check("monster('Goblin') has numeric cr/ac/hp",
        typeof m.cr === "number" && typeof m.ac === "number" && typeof m.hp === "number",
        m.warning ?? `cr=${m.cr} ac=${m.ac} hp=${m.hp}`);

  // Documents the bug the adapter routes around. If Foundry ever fixes it, this fails
  // and the fix becomes an informed decision instead of a silent regression.
  // It tests the MECHANISM, not a live index: counting filled entries in
  // `getIndex({fields})` depends on whether something already called getDocuments()
  // this session, so it flipped between pass and fail on v14.369 with the bug intact.
  // Side-effect free: replays indexDocument's projection on a literal, reads source.
  const CC = foundry.documents.collections.CompendiumCollection;
  const projected = {};
  foundry.utils.setProperty(projected, "pages.name",
    foundry.utils.getProperty({ pages: [{ name: "x" }] }, "pages.name"));
  const viaGetProperty = /getProperty\(\s*data\s*,\s*field\s*\)/
    .test(CC?.prototype?.indexDocument?.toString?.() ?? "");
  check("core indexDocument still drops nested page fields (documents the workaround)",
        viaGetProperty && !Array.isArray(projected.pages),
        `indexDocument via getProperty=${viaGetProperty}, ` +
        `projected pages=${JSON.stringify(projected.pages)}`);

  const ol = await onList("Fireball", "wizard");
  check("onList('Fireball', 'wizard') is true", ol.onList === true, JSON.stringify(ol));
  const ol2 = await onList("Fireball", "cleric");
  check("onList('Fireball', 'cleric') is false", ol2.onList === false, JSON.stringify(ol2));
  const art = await page("Artifacts", { books: ["dnd-dungeon-masters-guide.content"] });
  check("page('Artifacts') carries its embedded roll tables", (art.tables?.length ?? 0) >= 4 && art.tables[0].rows?.length > 0,
        `${art.tables?.length ?? 0} table(s)`);

  const ms = await monsters({ size: "large", type: "construct", cr: "5-8" });
  check("monsters({large construct, CR 5-8}) finds the Shield Guardian", ms.monsters?.some(m => m.name === "Shield Guardian"),
        `${ms.count} hit(s)`);
  const nm = await names();
  check("names() lists PHB classes, subclasses, species, feats",
        nm.classes.includes("Paladin") && (nm.subclasses.cleric ?? []).length > 0 && nm.species.includes("Elf, High") && (nm.feats.origin ?? []).length > 0,
        `${nm.classes.length} classes, ${nm.species.length} species`);
  const gt = await monster("Goblin Boss", { text: true });
  const txt = (gt.features ?? []).map(f => f.text).join(" ");
  check("monster(…, {text}) resolves enrichers", txt.length > 0 && !/\[\[|lookup @/.test(txt), txt.slice(0, 80));

  const failed = checks.filter(c => !c.ok);
  return { ok: failed.length === 0, passed: checks.length - failed.length,
           failed: failed.length, checks };
}

// ── publish ──────────────────────────────────────────────────────────────────
/**
 * `game.pentaryn` is a plain object every module assigns into: the importer merges into it and
 * nothing freezes it since its keystone (items-journal-1), so the old frozen-root guard is gone
 * (kit 1.0.2, J10). A frozen root now throws here and the ready hook stops before its log line.
 */
function publishAPI() {
  const api = { search, page, monster, monsters, names, packs, selftest, onList, spellList, toPlainText, LIMITS };
  game.pentaryn ??= {};
  game.pentaryn.rules = api;
}

Hooks.once("ready", () => {
  publishAPI();
  console.log("pentaryn-lookup | game.pentaryn.rules ready — search(), page(), monster(), packs(), selftest()");
});
