/**
 * The eval-round-2 fixes (plan §13), pure: built packs in encounters, door lines that only put on a
 * side what can see the doorway, dry-run validation helpers, language keys, attunement, richer
 * <built> lines, npc argument checking, and the flat replace readback. Called from run.mjs.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The fork's eval-js serialiser, restated: objects deeper than 4 become "[max depth]". */
function serialiseLikeBridge(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (depth > 4) return "[max depth]";
  if (Array.isArray(value)) return value.map(v => serialiseLikeBridge(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialiseLikeBridge(v, depth + 1)]));
}

export async function run({ check, ok, core, F, W, G }) {
  const { buildView, renderGather, groupScene, makeRel, doorLines, DOOR } = core;
  const B = await import("../build-core.mjs");
  const N = await import("../npc-core.mjs");
  const R = await import("../readback-core.mjs");

  /* ── 1. a new prompt beside a built pack joins the pack's encounter ─── */
  {
    const goblin = (key, j, name, xp) => F.built(key, j, 2, { name, xp, stats: { cr: xp === 200 ? 1 : 0.25, ac: 13, hp: 11, hpMax: 11 } });
    const items = [
      goblin("skrag", 10, "Skrag", 200), goblin("grek", 13, "Grek", 50), goblin("pell", 16, "Pell", 50), goblin("snikka", 19, "Snikka", 50),
      F.prompt("minion", "mid", 21, 2, "Another goblin, a lookout with a horn."),
      F.built("chest", 22, 4, { kind: "hotspot", w: 0.5, name: "Loot chest" }),
      F.built("keeper", 10, 6, { name: "Odda the trader", disposition: "neutral" }),     // 20 ft from Skrag, far from the prompt
      F.prompt("loner", "mid", 2, 12, "A rat in the corner."),
      F.built("sack", 3, 12, { kind: "hotspot", w: 0.5, name: "Grain sack" })
    ];
    const { view, ids } = buildView([F.sceneOf("pack", "Pack", items, [])]);
    const s = view.scenes[0];
    const T = k => ids.builtIds.get(k), P = k => ids.promptIds.get(k);
    check("pack: one encounter holds the prompt and the whole built pack", s.encounters.length, 1);
    check("pack: members are the prompt, the four goblins and the chest beside it",
      [...s.encounters[0].members].sort(), [P("minion"), T("skrag"), T("grek"), T("pell"), T("snikka"), T("chest")].sort());
    ok("pack: the neutral trader 20 ft from Skrag does not ride the hostile chain", s.contextOnly.includes(T("keeper")));
    check("pack: built XP is the pack's", s.encounters[0].builtXp, 350);
    check("pack: a prompt beside only a hotspot is still alone", s.alone, [P("loner")]);
    ok("pack: the hotspot beside the loner is context only", s.contextOnly.includes(T("sack")));
    const text = renderGather(view);
    ok("pack: encounter line names the built members", text.includes(`${s.encounters[0].id}: ${P("minion")} + built `) && text.includes(`"Skrag"`) && text.includes(`"Snikka"`));
    ok("pack: built XP printed without a party", text.includes("Built XP already in it: 350."));
    ok("pack: the minion is not alone", !s.alone.includes(P("minion")) && text.includes(`Alone: ${P("loner")} (`));

    // two prompt groups at either end of the same pack: the pack is shared, never a bridge
    const two = [items[0], items[1], items[2], items[3], F.prompt("west", "mid", 7, 2, "West lookout."), F.prompt("east", "mid", 22, 2, "East lookout.")];
    const v2 = buildView([F.sceneOf("pack2", "Pack 2", two, [])]);
    const s2 = v2.view.scenes[0];
    check("shared pack: two encounters, not merged", s2.encounters.length, 2);
    check("shared pack: the pack is shared by both", s2.encounters.map(e => e.shared.length), [4, 4]);
    const t2 = renderGather(v2.view);
    ok("shared pack: the line says so and asks for the call", /Shared with E\d: t\d t\d t\d t\d \(built things never merge encounters; decide whether this is one fight\)/.test(t2));
    ok("shared pack: shared XP flagged", t2.includes("(shared XP counted in each)"));

    // groupScene directly: a creature behind a wall does not join; a pack edge needs the same disposition
    const walled = [F.prompt("p", "mid", 0, 0, ""), F.built("g", 2, 0)];
    const g1 = groupScene(["p"], ["g"], makeRel(walled, { gridSize: G, walls: [W(150, -100, 150, 300)] }), { creature: () => true });
    check("pack: a creature behind a wall stays context", g1.contextOnly, ["g"]);
    const mixed = [F.prompt("p", "mid", 0, 0, ""), F.built("a", 2, 0), F.built("b", 8, 0)];   // p-a 10 ft, a-b 30 ft, p-b 40 ft
    const disp = { a: "hostile", b: "friendly" };
    const g2 = groupScene(["p"], ["a", "b"], makeRel(mixed, { gridSize: G }), { creature: () => true, disposition: k => disp[k] });
    check("pack: a friendly beside a hostile pack member is not chained", [g2.groups[0].built, g2.contextOnly], [["a"], ["b"]]);
    disp.b = "hostile";
    const g3 = groupScene(["p"], ["a", "b"], makeRel(mixed, { gridSize: G }), { creature: () => true, disposition: k => disp[k] });
    check("pack: same disposition chains", g3.groups[0].built, ["a", "b"]);
  }

  /* ── 1b. review: only hostile creatures chain or make a lone prompt an encounter ─── */
  {
    // a street of neutral crowd tokens 10 ft apart, a prompt beside the first: not one big group
    const crowd = [0, 1, 2, 3, 4, 5].map(n => F.built(`c${n}`, 4 + n * 3, 4, { name: `Villager ${n}`, disposition: "neutral" }));
    const items = [...crowd, F.prompt("pick", "mid", 2, 4, "A pickpocket in the crowd.")];
    const { view, ids } = buildView([F.sceneOf("street", "Street", items, [])]);
    const s = view.scenes[0];
    check("crowd: a prompt beside a neutral villager stays alone", [s.encounters.length, s.alone], [0, [ids.promptIds.get("pick")]]);
    ok("crowd: no villager joins anything", crowd.every(c => s.contextOnly.includes(ids.builtIds.get(c.key))));
    ok("crowd: the alone note names the villager", renderGather(view).includes(`Alone: ${ids.promptIds.get("pick")} (10 ft W of ${ids.builtIds.get("c0")} Villager 0, in sight)`));
    // two prompts in the street: only the villagers within 30 ft of a prompt join, no chain
    const two = [...crowd, F.prompt("a", "mid", 2, 4, "x"), F.prompt("b", "mid", 2, 6, "y")];
    const v2 = buildView([F.sceneOf("street2", "Street 2", two, [])]);
    const T = k => v2.ids.builtIds.get(k);
    check("crowd: a prompt pair takes only the villagers it stands beside", [...v2.view.scenes[0].encounters[0].built].sort(), [T("c0"), T("c1")].sort());
    // the party beside a prompt: friendly characters never make it an encounter
    const party = [F.prompt("p", "mid", 0, 0, "x"), F.built("hale", 1, 0, { kind: "character", name: "Hale", disposition: "friendly" })];
    check("party: a prompt beside a PC is alone", buildView([F.sceneOf("pty", "Party", party, [])]).view.scenes[0].alone.length, 1);
    // groupScene's own contract: neutral pairs never chain; hostile ones do
    const line = [F.prompt("p", "mid", 0, 0, ""), F.built("a", 2, 0), F.built("b", 8, 0)];
    const g = groupScene(["p"], ["a", "b"], makeRel(line, { gridSize: G }), { creature: () => true, disposition: () => "neutral" });
    check("groupScene: neutral creatures do not chain", [g.groups[0].built, g.groups[0].foes, g.contextOnly], [["a"], [], ["b"]]);
  }

  /* ── 5. door lines: only what can see the doorway is on a side ───────── */
  {
    // a cave below an E-W wall with a door at x 500-600; the main hall above it; a sentry room to the
    // NE, walled off from the door by the wall at x = 800 (the eval's case)
    const base = [W(0, 500, 500, 500), W(500, 500, 600, 500, { door: DOOR.DOOR }), W(600, 500, 1300, 500)];
    const sentryWall = [W(800, 0, 800, 500)];
    const items = [
      F.prompt("cave", "mid", 5, 7, "Cave troll."),
      F.prompt("hall", "mid", 3, 2, "Hall guard."),
      F.prompt("sentry", "mid", 9, 3, "Sentry asleep at a table.")
    ];
    const v = buildView([F.sceneOf("doors", "Doors", items, [...base, ...sentryWall])]);
    const P = k => v.ids.promptIds.get(k);
    const line = v.view.scenes[0].doorLines.find(l => l.startsWith("Door at 28,25 ft"));
    ok("door: the cave door has a line", !!line);
    const north = line.split(";")[0];
    ok("door: the hall is on the N side", north.includes(P("hall")));
    ok("door: the walled-off sentry is not on the N side", !north.includes(P("sentry")));
    ok("door: the sentry is tagged instead", line.includes(`No sight line to it: ${P("sentry")} (20 ft, wall).`));
    ok("door: the cave is on the S side", line.split(";")[1].includes(`S side ${P("cave")}`));

    // the sentry room has its own (closed) door in that wall: then it reaches the doorway through it
    const doored = [W(800, 0, 800, 300), W(800, 300, 800, 400, { door: DOOR.DOOR }), W(800, 400, 800, 500)];
    const v2 = buildView([F.sceneOf("doors2", "Doors 2", items, [...base, ...doored])]);
    const l2 = v2.view.scenes[0].doorLines.find(l => l.startsWith("Door at 28,25 ft"));
    ok("door: past another closed door it is on its side, tagged", l2.split(";")[0].includes(`${v2.ids.promptIds.get("sentry")} (20 ft, through another door)`));

    // a diagonal door: the side is the door line's, not the bounding box's (member right of it, below its
    // middle, but above the line)
    const diag = [W(0, 0, 500, 450), W(500, 450, 600, 540, { door: DOOR.DOOR }), W(600, 540, 1000, 900)];
    const dl = doorLines([diag[1]], [{ label: "p1", prompt: true, members: [{ id: "p1", rect: { x: 1000, y: 550, w: 100, h: 100 } }] }],
      { dims: F.DIMS, gridFt: 5, withinFt: 60, walls: diag });
    ok("door: a diagonal door puts the member on its line's side", dl[0]?.includes("N side p1"));
    // context-only built things: the nearest three named per side, the rest counted; walled-off built things not named
    const many = Array.from({ length: 6 }, (_, n) => ({ label: `t${n + 1}`, prompt: false, members: [{ id: `t${n + 1}`, rect: { x: 300 + n * 100, y: 700, w: 100, h: 100 } }] }));
    const crowdLine = doorLines([base[1]], [{ label: "p1", prompt: true, members: [{ id: "p1", rect: { x: 500, y: 600, w: 100, h: 100 } }] }, ...many,
      { label: "t9", prompt: false, members: [{ id: "t9", rect: { x: 900, y: 300, w: 100, h: 100 } }] }],
      { dims: F.DIMS, gridFt: 5, withinFt: 60, walls: [...base, ...sentryWall] });
    ok("door: built names capped per side", /S side p1 \(5 ft\), t\d \(\d+ ft\), t\d \(\d+ ft\), t\d \(\d+ ft\), \+3 more built\./.test(crowdLine[0]));
    ok("door: a walled-off built thing is not listed as blind", !crowdLine[0].includes("t9"));

    // without wall data the old behaviour stands (everyone counts)
    const plain = doorLines([W(500, 500, 600, 500, { door: DOOR.DOOR })], [{ label: "p1", prompt: true, members: [{ id: "p1", rect: { x: 900, y: 300, w: 100, h: 100 } }] }],
      { dims: F.DIMS, gridFt: 5, withinFt: 60 });
    ok("door: no walls given → placed by position", plain[0].includes("N side p1 (20 ft)"));
    // a door that only a walled-off prompt is near is not printed at all
    const none = doorLines([W(500, 500, 600, 500, { door: DOOR.DOOR })], [{ label: "p1", prompt: true, members: [{ id: "p1", rect: { x: 900, y: 300, w: 100, h: 100 } }] }],
      { dims: F.DIMS, gridFt: 5, withinFt: 60, walls: [...base, ...sentryWall] });
    check("door: nobody can see it → no line", none, []);
  }

  /* ── 4. richer <built> lines ─────────────────────────────────────────── */
  {
    check("stats: CR, AC, HP", core.statsText({ cr: 0.25, ac: 15, hp: 11, hpMax: 11 }), "CR 1/4, AC 15, HP 11");
    check("stats: hurt token shows value/max", core.statsText({ cr: 3, ac: 17, hp: 40, hpMax: 60 }), "CR 3, AC 17, HP 40/60");
    check("stats: a character has no CR", core.statsText({ ac: 18, hp: 44, hpMax: 44 }), "AC 18, HP 44");
    check("stats: none", core.statsText(null), "");
    check("class label", core.classLabel([{ name: "Paladin", levels: 5 }], "Human"), "Paladin 5 (Human)");
    check("class label with subclass", core.classLabel([{ name: "Paladin", levels: 5, subclass: "Oath of Devotion" }], "Human"), "Paladin 5, Oath of Devotion (Human)");
    check("class label multiclass", core.classLabel([{ name: "Fighter", levels: 3, subclass: "Champion" }, { name: "Wizard", levels: 2 }], "Elf, High"),
      "Fighter 3, Champion / Wizard 2 (Elf, High)");
    check("item: unidentified artifact",
      core.itemText({ name: "The Ember Crown", type: "equipment", rarity: "artifact", identified: false, unidentifiedName: "Soot-Blackened Bronze Circlet", attunement: "required" }),
      `The Ember Crown (artifact; unidentified, shows as "Soot-Blackened Bronze Circlet"; attunement required)`);
    check("item: identified magic", core.itemText({ name: "Potion of Healing", type: "consumable", rarity: "common", identified: true, quantity: 2 }),
      "Potion of Healing x2 (common; identified)");
    check("item: loot with a price", core.itemText({ name: "Stolen Chalice", type: "loot", rarity: "", price: "150 gp" }), "Stolen Chalice (loot; 150 gp)");
    check("items: capped", core.itemsText(Array.from({ length: 5 }, (_, i) => ({ name: `i${i}` })), 3), "i0, i1, i2, +2 more");
    const pc = [F.prompt("p", "mid", 0, 0, "x"), F.built("hale", 1, 0, { kind: "character", name: "Hale", disposition: "friendly",
      classes: [{ name: "Paladin", levels: 5, subclass: "Oath of Devotion" }], species: "Human", stats: { ac: 18, hp: 44, hpMax: 44 } })];
    const t = renderGather(buildView([F.sceneOf("pc", "PC", pc, [])]).view);
    ok("built character: class/level + species as its type, AC/HP as stats",
      t.includes(`kind="character" name="Hale" type="Paladin 5, Oath of Devotion (Human)" stats="AC 18, HP 44" disposition="friendly"`));
    const snap = renderGather(buildView([F.warrenScene(), F.commonScene(true)]).view);
    ok("built hotspot lists its items", snap.includes(`Items: Flour x3 (loot), The Ember Crown (artifact; unidentified, shows as "Soot-Blackened Bronze Circlet"; attunement required)`));
    ok("built npc carries CR/AC/HP", snap.includes(`type="humanoid (goblinoid)" stats="CR 1, AC 13, HP 27" disposition="hostile"`));
  }

  /* ── 3. dry-run validation helpers ───────────────────────────────────── */
  {
    const advs = [
      { item: "Paladin", title: "Fighting Style", type: "ItemChoice", levels: [2] },
      { item: "Paladin", title: "Ability Score Improvement", type: "AbilityScoreImprovement", levels: [4] },
      { item: "Paladin", title: "Paladin Subclass", type: "Subclass", levels: [3] },
      { item: "Human", title: "Skillful", type: "Trait", levels: [0] },
      { item: "Soldier", title: "Background Ability Score Improvement", type: "AbilityScoreImprovement", levels: [0] },
      { item: "Magic Initiate", title: "Learn Two Cantrips", type: "ItemChoice", levels: [0] }
    ];
    const good = { "Fighting Style": "Defense", "Ability Score Improvement@4": { str: 2 }, "skillful": ["perception"], "Subclass": "x",
      "Background Ability Score Improvement": { str: 2, con: 1 }, "Magic Initiate: Learn Two Cantrips": ["Light"], "Paladin: Fighting Style@2": "Defense" };
    ok("choices: every known form passes", B.checkChoiceKeys(good, advs).ok);
    const bad = B.checkChoiceKeys({ "Fightng Style": "Defense", "Ability Score Improvement@5": {} }, advs);
    check("choices: unknown keys found", bad.unknown, ["Fightng Style", "Ability Score Improvement@5"]);
    ok("choices: the known list names titles with levels", bad.known.includes("Fighting Style@2") && bad.known.includes("Ability Score Improvement@4") && bad.known.includes("Skillful"));
    check("nearest: Spellbook → Book", B.nearestNames("Spellbook", ["Book", "Spell Scroll", "Component Pouch", "Bell"]), ["Book"]);
    ok("nearest: Elf → the Elf lineages", B.nearestNames("Elf", ["Elf, High", "Elf, Drow", "Dwarf", "Gnome"]).includes("Elf, High"));
    check("nearest: High Elf → Elf, High first", B.nearestNames("High Elf", ["Elf, High", "Elf, Drow", "Half-Elf"])[0], "Elf, High");
    check("nearest: a typo", B.nearestNames("Longsord", ["Longsword", "Shortsword", "Club"])[0], "Longsword");
    const tree = { standard: { label: "Standard", selectable: false, children: { common: "Common", goblin: "Goblin", elvish: "Elvish", sign: "Common Sign Language" } },
      exotic: { label: "Exotic", children: { draconic: "Draconic", terran: { label: "Terran" } } }, cant: "Thieves' Cant" };
    const flat = B.flattenLanguages(tree);
    check("languages: labels → keys", B.languageKeys(["Common", "goblin", "Thieves' Cant", "Gibberish", "TERRAN"], flat),
      { keys: ["common", "goblin", "cant", "terran"], unknown: ["Gibberish"] });
    const avail = ["languages:standard:sign", "languages:exotic:draconic", "languages:standard:dwarvish", "languages:standard:elvish", "languages:standard:goblin"];
    check("languages: an elf defaults to Elvish first", B.defaultLanguagePicks(avail, "Elf, High", 2), ["languages:standard:elvish", "languages:standard:dwarvish"]);
    check("languages: a dragonborn to Draconic", B.defaultLanguagePicks(avail, "Dragonborn", 1), ["languages:exotic:draconic"]);
    ok("languages: sign language is never a default pick", !B.defaultLanguagePicks(avail, "Human", 4).includes("languages:standard:sign"));
    ok("languages: trait keys recognised", B.areLanguageKeys(avail) && !B.areLanguageKeys(["skills:ath"]));
    const crown = { name: "The Ember Crown", type: "equipment", system: { rarity: "artifact", description: { value: "<p>Wondrous item (requires attunement)…</p>" } } };
    ok("attunement: text says so → required", B.fixAttunement(crown) && crown.system.attunement === "required");
    const opt = { name: "Ring", type: "equipment", system: { attunement: "optional", description: { value: "requires attunement" } } };
    check("attunement: an explicit value is kept", [B.fixAttunement(opt), opt.system.attunement], [null, "optional"]);
    check("attunement: no text, no change", B.fixAttunement({ name: "Cup", type: "loot", system: {} }), null);
    for (const t of ["This ring does not require attunement.", "Unlike most rings it doesn't require attunement.", "No attunement required.",
      "Usable without requiring attunement.", "It never requires attunement."]) ok(`attunement: negation "${t}"`, !B.saysRequiresAttunement(t));
    for (const t of ["Wondrous item, artifact (requires attunement)", "Ring, rare (requires attunement by a wizard)", "Attunement required."]) {
      ok(`attunement: "${t}"`, B.saysRequiresAttunement(t));
    }
    const letter = { name: "Letter", type: "loot", system: { description: { value: "The crown requires attunement." } } };
    const ln = B.fixAttunement(letter);
    ok("attunement: a loot item is named, not set (loot has no attunement in dnd5e)", /no attunement in dnd5e/.test(ln) && letter.system.attunement === undefined);
    check("languages: aliases", B.languageKeys(["Elven", "Orcish", "Dwarven", "Sign Language"], { elvish: "Elvish", orc: "Orc", dwarvish: "Dwarvish", sign: "Common Sign Language" }).keys,
      ["elvish", "orc", "dwarvish", "sign"]);
    const hidden = { name: "Circlet", type: "equipment", system: { unidentified: { description: "It hums. (Requires attunement by a spellcaster.)" } } };
    ok("attunement: read from the unidentified text too", B.fixAttunement(hidden) && hidden.system.attunement === "required");
  }

  /* ── 2. the npc in the module: arguments checked and defaulted like the tools ── */
  {
    const npc = { name: "Basalt Guardian", creatureType: "construct", size: "large", cr: "3", hpAverage: 76, hpFormula: "8d10+32",
      acMode: "flat", acValue: 17, abilities: { str: 18, dex: 8, con: 18, int: 3, wis: 10, cha: 1 } };
    const n = N.normaliseNpc(npc);
    ok("npc: minimal args pass", n.ok);
    check("npc: tool defaults filled", [n.args.walkSpeed, n.args.sourceRules, n.args.languages, n.args.hover], [30, "2014", [], false]);
    ok("npc: flat AC needs a value", !N.normaliseNpc({ ...npc, acValue: undefined }).ok);
    const typo = N.normaliseNpc({ ...npc, speed: 40 });
    ok("npc: an unknown key is refused with the known ones", !typo.ok && /unknown key\(s\) speed \(known: name, creatureType/.test(typo.errors[0]));
    ok("npc: abilities must be all six", !N.normaliseNpc({ ...npc, abilities: { str: 18 } }).ok);
    ok("npc: bad CR refused", !N.normaliseNpc({ ...npc, cr: "1/3" }).ok);
    ok("npc: unknown damage type is a warning", N.normaliseNpc({ ...npc, damageResistances: ["sonic"] }).warnings.length === 1);
    const save = N.normaliseFeature({ featureType: "save", featureName: "Earthsplitter", saveAbility: "dex", saveDC: 14,
      damageParts: [{ number: 3, denomination: 8, type: "bludgeoning" }], areaType: "radius", areaSize: 10, recharge: 5 });
    check("feature: save ok, recharge lifted out, defaults in", [save.ok, save.recharge, save.args.halfOnSave, save.query, "recharge" in save.args],
      [true, 5, true, "addSaveFeatureToActor", false]);
    ok("feature: area without size refused", !N.normaliseFeature({ featureType: "save", featureName: "x", saveAbility: "dex", saveDC: 10,
      damageParts: [{ number: 1, denomination: 6, type: "fire" }], areaType: "cone" }).ok);
    const atk = N.normaliseFeature({ featureType: "attack", featureName: "Slam", attackType: "melee", damageParts: [{ number: 2, denomination: 6, type: "bludgeoning" }] });
    check("feature: melee attack uses Str", [atk.ok, atk.args.effectiveAbility, atk.args.reachFt], [true, "str", 5]);
    ok("feature: ranged without range refused", !N.normaliseFeature({ featureType: "attack", featureName: "Rock", attackType: "ranged",
      damageParts: [{ number: 1, denomination: 6, type: "bludgeoning" }] }).ok);
    ok("feature: a d7 is refused", !N.normaliseFeature({ featureType: "aura", featureName: "Heat", areaType: "emanation", areaSize: 5,
      damageParts: [{ number: 1, denomination: 7, type: "fire" }] }).ok);
    ok("feature: recharge on spells refused", !N.normaliseFeature({ featureType: "spells", spellNames: ["Light"], recharge: 5 }).ok);
    check("feature: spellcasting ability from the class", N.normaliseFeature({ featureType: "spellcasting", spellcastingClass: "cleric", spellcastingLevel: 3 }).args.effectiveAbility, "wis");
    const whole = N.checkNpcSpec({ kind: "npc", npc, features: [save.args && { featureType: "save", featureName: "Earthsplitter", saveAbility: "dex", saveDC: 14,
      damageParts: [{ number: 3, denomination: 8, type: "bludgeoning" }], recharge: 5 }, { featureType: "nonsense" }] });
    ok("npc spec: a bad feature fails the whole spec", !whole.ok && whole.errors.some(e => e.startsWith("features[1].featureType")));
    const fine = N.checkNpcSpec({ kind: "npc", npc, features: [{ featureType: "passive", featureName: "Kneeling", description: "<p>x</p>", recharge: 4 }] });
    check("npc spec: recharge collected by feature name", fine.recharge, { Kneeling: 4 });
  }

  /* ── 2. flat replace rows and the readback text ──────────────────────── */
  {
    const summary = { class: "Paladin 5", subclass: "Oath of Devotion", species: "Human", background: "Soldier",
      abilities: { str: 17, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, hp: 44, ac: 18, prof: 3, spellDC: 13, spellAbility: "cha",
      saves: ["wis", "cha"], skills: ["ath", "ins", "per", "prc"], speed: 30, darkvision: 0, size: "med", languages: ["common", "elvish"],
      spellCounts: { cantrips: 0, maxCantrips: null, prepared: 3, maxPrepared: 6, always: 4, spellbook: 0 } };
    const row = R.resultRow({ index: 0, id: "p9", label: "p9", sceneId: "s", markerId: "m", kind: "character", ok: true,
      report: { summary, defaults: ["Human: Skillful: picked perception"], warnings: [], patched: [] },
      created: [{ type: "Token", id: "tok1", name: "Hale", x: 500, y: 300, w: 1, h: 1 }, { type: "Actor", id: "act1", name: "Hale" }],
      markerDeleted: true });
    check("row: sheet flattened to a line", row.sheet.startsWith("Paladin 5 (Oath of Devotion), Human, Soldier; str 17 dex 10"), true);
    ok("row: languages on the sheet", row.sheet.includes("languages common, elvish"));
    ok("row: feats on the sheet", R.sheetLine({ ...summary, feats: ["Tough", "Savage Attacker"] }).includes("; feats Tough, Savage Attacker."));
    check("row: created as text", row.created, [`Token "Hale" [tok1] @500,300 1x1`, `Actor "Hale" [act1]`]);
    check("row: ids", row.ids, ["tok1", "act1"]);
    const fail = R.resultRow({ index: 1, id: "p3", label: "p3", kind: "npc", ok: false, code: "CREATE_FAILED", error: "CREATE_FAILED: boom",
      report: { warnings: ["w"], notes: ["feature Slam not added: x"] }, created: [], markerDeleted: false,
      discarded: [{ type: "Actor", id: "a9", name: "Yark", discarded: true }] });
    const encounters = [{ id: "E1", xp: 325, creatures: 5, unbuilt: 0, budget: { size: 4, level: 3, low: 600, moderate: 900, high: 1600 }, difficulty: "under low" }];
    const result = { dryRun: false, call: "pm-7f3a", text: "", results: [row, fail], remaining: { s: 2 }, encounters };
    const seen = JSON.stringify(serialiseLikeBridge(result));
    ok("rows: the eval-js serialiser never reaches its depth limit", !seen.includes("[max depth]"));
    const text = R.renderReplace({ dryRun: false, call: "pm-7f3a", rows: [row, fail], remaining: { s: 2 }, encounters });
    const L = text.split("\n");
    check("text: head", L[0], "replace pm-7f3a — real run: 1 ok, 1 failed");
    check("text: created line", L[1], `p9 → Token "Hale" [tok1] @500,300 1x1, Actor "Hale" [act1]; markerDeleted=true`);
    ok("text: sheet line", L[2].startsWith("  p9 sheet: Paladin 5 (Oath of Devotion)"));
    check("text: defaults line", L[3], "  p9 DEFAULTED (check): Human: Skillful: picked perception");
    check("text: failure line", L[4], "p3 npc: FAIL CREATE_FAILED: boom (markerDeleted=false)");
    ok("text: failure details", text.includes("  p3 WARN: w") && text.includes("  p3 notes: feature") && text.includes(`  p3 cleanup: deleted Actor "Yark" [a9]`));
    ok("text: remaining and encounter lines", text.includes("remaining: s=2") &&
      text.includes("E1: 325 XP from 5 creature(s) vs party 4 x L3: low 600 | moderate 900 | high 1600 → under low"));
    const dry = R.planRow({ index: 0, id: "p1", label: "p1", kind: "hotspot", ok: true,
      plan: { sceneId: "s", markerId: "m", x: 525, y: 325, placement: "centred", footprint: "0.5x0.5", lockSize: true, hidden: false,
        creates: ["Actor (hotspot)", "items: The Ember Crown"], defaults: ["The Ember Crown: attunement set to required (its text requires attunement)"], exec: () => 1, marker: { a: { b: { c: 1 } } } } });
    ok("dry row: no functions or nested plan objects", !("exec" in dry) && !("marker" in dry));
    const dtext = R.renderReplace({ dryRun: true, call: "pm-7f3a", rows: [dry], remaining: { s: 1 } });
    ok("dry text: plan line", dtext.includes("p1 hotspot: at 525,325 (centred), footprint 0.5x0.5, lockSize; creates Actor (hotspot); items: The Ember Crown"));
    ok("dry text: attunement default shown", dtext.includes("p1 DEFAULTED (check): The Ember Crown: attunement set to required"));
    ok("dry text: footer", dtext.endsWith("Nothing was written. Repeat the identical call without dryRun to apply."));
  }

  /* ── 6. the code's version is the manifest's ─────────────────────────── */
  {
    const manifest = JSON.parse(readFileSync(join(HERE, "..", "module.json"), "utf8"));
    check("VERSION equals module.json", core.VERSION, manifest.version);
  }
}
