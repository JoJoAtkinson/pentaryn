/**
 * Scenario boards for the LLM evaluation and the UX playtest (plan §8.2–8.3).
 *
 * Builds two SCRATCH scenes, `ZZ Prompt Test 1` (the warren) and `ZZ Prompt Test 2` (the common
 * room), from the same fixtures the node suite uses, scaled to a 150 px / 5 ft grid with no padding.
 * Never touches a campaign scene; never activates a scene. Everything it makes is flagged
 * `flags.pentaryn-prompts.scratch` so `cleanup()` can find it again.
 *
 * Run from the GM client (eval-js), after the module is installed:
 *   const S = await import("/modules/pentaryn-prompts/test/scenarios.mjs");
 *   await S.build();                       // both scenes
 *   await game.pentaryn.prompts.gather({scenes: ["ZZ Prompt Test 1"]});
 *   await S.setDoor("ZZ Prompt Test 2", false);   // close the kitchen door, regather
 *   await S.cleanup();                     // scenes, actors, journals
 */

import * as F from "./fixtures.mjs";

const MODULE = "pentaryn-prompts";
const G = 150;
const k = G / F.G;
const SCRATCH = { [MODULE]: { scratch: true } };

async function scratchActor(name, data = {}) {
  return Actor.implementation.create(foundry.utils.mergeObject({
    name, type: "npc", flags: SCRATCH, ownership: { default: 0 },
    prototypeToken: { name, texture: { src: "icons/svg/mystery-man.svg" } }
  }, data, { inplace: false }));
}

async function makeScene(name, cols, rows) {
  const old = game.scenes.find(s => s.name === name);
  if (old) await old.delete();
  return Scene.implementation.create({
    name, width: cols * G, height: rows * G, padding: 0, navigation: false, flags: SCRATCH,
    backgroundColor: "#3a3530", grid: { size: G, distance: 5, units: "ft", type: 1 }
  });
}

const wallData = w => ({ c: w.c.map(v => Math.round(v * k)), sight: w.sight, light: w.sight, move: w.sight ? 20 : 0,
  sound: w.sight, dir: w.dir, door: w.door, ds: w.ds });

async function placeItems(scene, items, actors) {
  const level = scene.firstLevel?.id;
  const tokens = [], notes = [];
  for (const it of items) {
    const x = Math.round(it.rect.x * k), y = Math.round(it.rect.y * k);
    if (it.isPrompt) {
      const actor = game.actors.find(a => a.flags?.[MODULE]?.marker === it.size);
      if (!actor) throw new Error(`no Prompt · ${it.size} actor — reload as GM so ensureMarkers runs`);
      const td = (await actor.getTokenDocument({ x, y }, { parent: scene })).toObject();
      delete td._id;
      Object.assign(td, { x, y, level });
      foundry.utils.setProperty(td, `flags.${MODULE}.prompt`, it.text);
      foundry.utils.setProperty(td, `flags.${MODULE}.updatedAt`, Date.now());
      tokens.push(td);
    } else if (it.docName === "Note") {
      const je = await JournalEntry.implementation.create({ name: it.name, flags: { ...SCRATCH, [MODULE]: { scratch: true, provenance: it.prov } },
        pages: [{ name: it.name, type: "text", text: { format: 1, content: `<p>${it.description}</p>` } }] });
      notes.push({ entryId: je.id, pageId: je.pages.contents[0].id, x: Math.round(it.centre.x * k), y: Math.round(it.centre.y * k),
        text: it.name, iconSize: 64, global: false, texture: { src: "assets/tokens/custom/props/icon-eye.webp" },
        flags: { [MODULE]: { provenance: it.prov } } });
    } else {
      const a = actors[it.key];
      const td = (await a.getTokenDocument({ x, y }, { parent: scene })).toObject();
      delete td._id;
      const w = it.rect.w / F.G;
      Object.assign(td, { x, y, level, width: w, height: w, hidden: false });
      foundry.utils.setProperty(td, "flags.dnd5e.lockSize", true);
      if (it.prov) foundry.utils.setProperty(td, `flags.${MODULE}.provenance`, it.prov);
      tokens.push(td);
    }
  }
  if (tokens.length) await scene.createEmbeddedDocuments("Token", tokens);
  if (notes.length) await scene.createEmbeddedDocuments("Note", notes);
}

export async function buildWarren() {
  const scene = await makeScene("ZZ Prompt Test 1", 24, 16);
  await scene.createEmbeddedDocuments("Wall", F.WARREN_WALLS.map(wallData));
  const shaman = await scratchActor("ZZ Grizzik, Goblin Shaman", {
    system: { details: { biography: { value: "<p>Hunched, ash-daubed, never meets the boss's eye.</p>" } } },
    flags: { [MODULE]: { scratch: true, provenance: F.warrenItems().find(i => i.key === "shaman").prov } }
  });
  await placeItems(scene, F.warrenItems(), { shaman });
  return scene;
}

export async function buildCommon({ doorOpen = true } = {}) {
  const scene = await makeScene("ZZ Prompt Test 2", 20, 10);
  await scene.createEmbeddedDocuments("Wall", F.commonWalls(doorOpen).map(wallData));
  const rect = (name, x, y, w, h) => ({ name, flags: SCRATCH,
    shapes: [{ type: "rectangle", x: x * G, y: y * G, width: w * G, height: h * G, rotation: 0 }] });
  try {
    await scene.createEmbeddedDocuments("Region", [rect("Common Room", 0, 0, 8, 10), rect("Bar", 8, 0, 5, 10), rect("Kitchen", 13, 0, 7, 10)]);
  } catch (err) { console.warn(`${MODULE} | scenario regions skipped`, err); }
  const items = F.commonItems();
  const innkeeper = await scratchActor("ZZ Maudie Teller, innkeeper", {
    system: { details: { biography: { value: "<p>Broad, floury, remembers every face and every tab.</p>" } } },
    flags: { [MODULE]: { scratch: true, provenance: items.find(i => i.key === "innkeeper").prov } }
  });
  const pile = await scratchActor("ZZ Spilled flour sack", {
    flags: { "item-piles": { data: { enabled: true, type: "container", description: "A split sack, footprints in the flour.",
      deleteWhenEmpty: false } } }
  });
  await placeItems(scene, items, { innkeeper, pile });
  return scene;
}

export async function build() {
  return { warren: (await buildWarren()).id, common: (await buildCommon()).id };
}

/** Open or close every door on a scratch scene. */
export async function setDoor(sceneName, open) {
  const scene = game.scenes.find(s => s.name === sceneName && s.flags?.[MODULE]?.scratch);
  if (!scene) throw new Error(`no scratch scene ${sceneName}`);
  const doors = scene.walls.filter(w => w.door).map(w => ({ _id: w.id, ds: open ? 1 : 0 }));
  await scene.updateEmbeddedDocuments("Wall", doors);
  return doors.length;
}

/**
 * Delete every scratch scene, the actors/journals this file made, and those a replace created on a
 * scratch scene (found by provenance). Campaign documents are untouched.
 */
export async function cleanup() {
  const scenes = game.scenes.filter(d => d.flags?.[MODULE]?.scratch === true);
  const sceneIds = new Set(scenes.map(s => s.id));
  // scratch-made, or created by a replace on a scratch scene (its provenance names the scene)
  const mine = d => d.flags?.[MODULE]?.scratch === true || sceneIds.has(d.flags?.[MODULE]?.provenance?.sceneId);
  if (scenes.some(s => s.active)) throw new Error("a scratch scene is active — activate the campaign scene first");
  const out = { scenes: scenes.length, actors: 0, journals: 0 };
  for (const s of scenes) await s.delete();
  const actors = game.actors.filter(mine).map(a => a.id);
  out.actors = actors.length;
  if (actors.length) await Actor.implementation.deleteDocuments(actors);
  const journals = game.journal.filter(mine).map(j => j.id);
  out.journals = journals.length;
  if (journals.length) await JournalEntry.implementation.deleteDocuments(journals);
  const items = game.items.filter(mine).map(i => i.id);
  out.items = items.length;
  if (items.length) await Item.implementation.deleteDocuments(items);
  // folders the replace may have created, once nothing is left in them
  for (const name of ["Foundry MCP Characters"]) {
    const f = game.folders.find(x => x.type === "Actor" && x.name === name);
    if (f && !f.contents.length && !f.children.length) { await f.delete(); out.folders = (out.folders ?? 0) + 1; }
  }
  return out;
}
