/**
 * Pure fixtures for the node suite: the two scenario boards of the plan (§8.2) as plain data.
 * Grid 100 px = 5 ft, no padding (sceneX = sceneY = 0). Synthetic only — test/ ships with the
 * module and any client can fetch it.
 */

import { SIZE_BY_KEY, makeRel, testPoints, DIR, DOOR, DOOR_STATE, SENSE } from "../geometry-core.mjs";

export const G = 100;
export const DIMS = { sceneX: 0, sceneY: 0, size: G, distance: 5 };

const wall = (x0, y0, x1, y1, o = {}) => ({ c: [x0, y0, x1, y1], sight: SENSE.NORMAL, dir: DIR.BOTH, door: DOOR.NONE, ds: DOOR_STATE.CLOSED, ...o });

/** A prompt at grid square (col j, row i), top-left aligned (tiny sits in the square's corner). */
export function prompt(key, size, j, i, text, o = {}) {
  const w = SIZE_BY_KEY[size].w * G;
  return item({ key, id: `tok${key}`, docName: "Token", isPrompt: true, size, rank: SIZE_BY_KEY[size].rank,
    rect: { x: j * G, y: i * G, w, h: w }, text, elevation: o.elevation ?? 0 });
}

export function built(key, j, i, o = {}) {
  const w = (o.w ?? 1) * G;
  return item({ key, id: `doc${key}`, docName: o.docName ?? "Token", isPrompt: false, rank: o.rank ?? 2,
    rect: { x: j * G, y: i * G, w, h: w }, kind: o.kind ?? "npc", name: o.name ?? key, type: o.type ?? "",
    hidden: !!o.hidden, prov: o.prov ?? null, description: o.description ?? "", xp: o.xp ?? 0,
    disposition: o.disposition ?? ((o.kind ?? "npc") === "npc" ? "hostile" : null), stats: o.stats ?? null,
    classes: o.classes ?? null, species: o.species ?? null, items: o.items ?? null });
}

function item(it) {
  const centre = { x: it.rect.x + it.rect.w / 2, y: it.rect.y + it.rect.h / 2 };
  return { ...it, centre, origin: centre, points: testPoints(it.rect, G),
    atFt: [Math.round(centre.x / G * 5), Math.round(centre.y / G * 5)], regions: it.regions ?? [] };
}

export function sceneOf(key, name, items, walls, o = {}) {
  return {
    key, name, nav: o.nav ?? "", mapFt: o.mapFt ?? [120, 80], squares: o.squares ?? [24, 16], gridFt: 5,
    regions: o.regions ?? [], levels: 1, warn: [], notes: o.notes ?? "", dims: DIMS,
    items, rel: makeRel(items, { gridSize: G, gridFt: 5, walls }), doors: walls.filter(w => w.door), walls
  };
}

/* ── Scenario 1: the warren ─────────────────────────────────────────────── */

export const WARREN_WALLS = [
  // archer's alcove: a one-way window along y=100 — p5 above sees out, nobody below sees in
  wall(100, 100, 400, 100, { dir: DIR.RIGHT }),
  // chamber south wall with a closed door at x 500-600
  wall(100, 700, 500, 700), wall(500, 700, 600, 700, { door: DOOR.DOOR }), wall(600, 700, 1100, 700),
  // chamber east wall, and the sealed shrine's west wall
  wall(1100, 100, 1100, 700), wall(1400, 0, 1400, 800),
  // the side passage
  wall(300, 700, 300, 1100), wall(800, 700, 800, 1100), wall(300, 1100, 800, 1100)
];

export function warrenItems() {
  return [
    prompt("boss", "mid", 5, 3, "Goblin boss. Scarred, wolf-skull helm, carries the iron key to the shrine door.\nBullies the others; flees if bloodied."),
    prompt("m1", "mid", 3, 5, "Goblin minion, rusty spear, terrified of the boss."),
    prompt("m2", "mid", 8, 3, "Goblin minion with a sling, hangs back."),
    prompt("m3", "mid", 5, 6, "Goblin minion by the door to the side passage. Listens at it."),
    prompt("archer", "small", 2, 0, "Goblin archer on the ledge above the entrance. First to see the party.", { elevation: 10 }),
    built("shaman", 7, 1, { name: "Grizzik, Goblin Shaman", type: "humanoid (goblinoid)", xp: 200,
      stats: { cr: 1, ac: 13, hp: 27, hpMax: 27 }, items: [{ name: "Pouch of bone dice", type: "loot" }],
      prov: { size: "mid", at: Date.UTC(2026, 9, 9), prompt: "goblin shaman who secretly wants the boss dead; keeps a pouch of bone dice",
        pid: "p2", call: "pm-0a0a", note: "the boss's rival: built first so the pack has someone to betray him" },
      description: "<p>Hunched, ash-daubed, never meets the boss's eye. Casts with bone dice and lies about what they show.</p>"
        + "<p>Tactics: hangs back behind the boss and casts from cover. If the boss falls he surrenders at once and offers the shrine key's hiding place for his life.</p>"
        + "<p>Carries a pouch of bone dice, 12 sp, and a crude map of the warren scratched on a goblin's shoulder blade, showing the side passage and the shrine door.</p>" }),
    prompt("bugbear", "mid", 5, 9, "Bugbear guard dozing on a stool in the side passage. Snores loudly."),
    prompt("chalice", "tiny", 18, 2, "The stolen chalice on the altar. Silver, dented, worth 150 gp to the temple and 40 to a fence."),
    prompt("guardian", "large", 15, 2, "A stone guardian. Dormant until the chalice is lifted.")
  ];
}

export function warrenScene(items = warrenItems()) {
  return sceneOf("sceneWarren", "ZZ Prompt Test 1", items, WARREN_WALLS, { nav: "The Warren" });
}

/* ── Scenario 2: the common room ───────────────────────────────────────── */

export function commonWalls(doorOpen) {
  return [
    // kitchen west wall at x=1300 with a door at y 400-500
    wall(1300, 0, 1300, 400), wall(1300, 400, 1300, 500, { door: DOOR.DOOR, ds: doorOpen ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED }),
    wall(1300, 500, 1300, 1000)
  ];
}

export function commonItems() {
  return [
    prompt("fighter", "mid", 5, 4, "Party: the fighter. Human, ex-caravan guard, owes the innkeeper money."),
    prompt("rogue", "mid", 6, 5, "Party: the halfling rogue, sits with her back to the wall."),
    prompt("cleric", "mid", 7, 4, "Party: the cleric of the Crossroads shrine."),
    prompt("wizard", "mid", 5, 6, "Party: the wizard, asleep over a book."),
    built("innkeeper", 9, 1, { name: "Maudie Teller, innkeeper", type: "humanoid", disposition: "neutral",
      stats: { cr: 0, ac: 10, hp: 4, hpMax: 4 },
      prov: { size: "mid", at: Date.UTC(2026, 9, 2), prompt: "innkeeper, knows every rumour, overcharges strangers" },
      description: "Broad, floury, remembers every face and every tab." }),
    built("board", 1, 1, { kind: "note", docName: "Note", w: 0.5, name: "Notice board",
      prov: { size: "tiny", at: Date.UTC(2026, 9, 2), prompt: "notice board with three jobs on it" },
      description: "A warped board of wanted posters and lost-dog notices." }),
    built("pile", 16, 2, { kind: "hotspot", w: 0.5, name: "Spilled flour sack", description: "A split sack, footprints in the flour.",
      items: [{ name: "Flour", type: "loot", quantity: 3 }, { name: "The Ember Crown", type: "equipment", rarity: "artifact", identified: false,
        unidentifiedName: "Soot-Blackened Bronze Circlet", attunement: "required" }] }),
    // the cook: 35 ft east of the cleric's table square, through the kitchen door
    prompt("cook", "mid", 14, 4, "The cook, cleaver in hand, hates the wizard.")
  ];
}

export function commonScene(doorOpen, items = commonItems()) {
  return sceneOf("sceneCommon", "ZZ Prompt Test 2", items, commonWalls(doorOpen),
    { nav: "The Crossroads", regions: ["Common Room", "Bar", "Kitchen"], mapFt: [100, 50], squares: [20, 10] });
}
