/**
 * The eval-round-3 fixes (plan §14), pure: choice-title aliases, one-pass problem lists, starting
 * equipment plans, the spellcasting-focus check, stock-lore suppression, crops on blank scenes, the
 * <party> line, door lines naming a prompt, encounter lines for groups with no hostile creature,
 * the dry-run sheet row and spec-file paths. Called from run.mjs.
 */

export async function run({ check, ok, core, F, W }) {
  const { doorLines, DOOR, renderGather, buildView, partyLine } = core;
  const B = await import("../build-core.mjs");
  const R = await import("../readback-core.mjs");

  /* ── choice keys: "Divine Order" answers "Divine Order Choice" ───────── */
  {
    check("titleForms strips a trailing Choice", B.titleForms("Divine Order Choice"), ["Divine Order Choice", "Divine Order"]);
    check("titleForms leaves other titles alone", B.titleForms("Fighting Style"), ["Fighting Style"]);
    const hit = B.lookupChoice({ "Divine Order": "Protector" }, { item: "Cleric", title: "Divine Order Choice", level: 1, type: "ItemChoice" });
    check("lookupChoice: bare title finds the Choice advancement", hit, ["Divine Order", "Protector"]);
    const hit2 = B.lookupChoice({ "Cleric: Divine Order@1": "Thaumaturge" }, { item: "Cleric", title: "Divine Order Choice", level: 1, type: "ItemChoice" });
    check("lookupChoice: item-qualified bare title with level", hit2?.[1], "Thaumaturge");
    const advs = [{ item: "Cleric", title: "Divine Order Choice", type: "ItemChoice", levels: [1] }];
    ok("checkChoiceKeys: the bare title is a known key", B.checkChoiceKeys({ "Divine Order": "Protector" }, advs).ok);
    ok("checkChoiceKeys: the full title still is", B.checkChoiceKeys({ "Divine Order Choice": "Protector" }, advs).ok);
  }

  /* ── every problem of a replacement in one message ───────────────────── */
  {
    check("problemsText: none", B.problemsText("character", []), null);
    check("problemsText: one", B.problemsText("character", ["species: no species \"Elf\""]), "character: species: no species \"Elf\"");
    check("problemsText: several, numbered, deduplicated",
      B.problemsText("character", ["a", "b", "a", "c"]), "character: 3 problems — (1) a; (2) b; (3) c");
  }

  /* ── starting equipment: (A) the book's gear, (B) its gold ───────────── */
  {
    const paladin = [
      { _id: "and", group: "", type: "AND", sort: 0 },
      { _id: "cm", group: "and", type: "linked", key: "Compendium.phb.Item.chainmail", sort: 1 },
      { _id: "jav", group: "and", type: "linked", key: "Compendium.phb.Item.javelin", count: 6, sort: 2 },
      { _id: "hs", group: "and", type: "focus", key: "holy", sort: 3 },
      { _id: "or", group: "and", type: "OR", sort: 4 },
      { _id: "staff", group: "or", type: "linked", key: "Compendium.phb.Item.staff", sort: 1 },
      { _id: "wand", group: "or", type: "linked", key: "Compendium.phb.Item.wand", sort: 2 },
      { _id: "gp", group: "and", type: "currency", key: "gp", count: 9, sort: 5 }
    ];
    const a = B.startingEquipmentPlan(paladin, { option: "A", wealth: "150", labelOf: e => e.key?.split(".").pop() });
    check("starting A: linked items with counts", a.items.map(i => [i.uuid.split(".").pop(), i.count]), [["chainmail", 1], ["javelin", 6], ["staff", 1]]);
    check("starting A: the holy focus is a category for the caller", a.categories, [{ type: "focus", key: "holy", count: 1 }]);
    check("starting A: gold", a.currency, { gp: 9 });
    ok("starting A: an OR with two entries says which it took", a.picks[0]?.startsWith("took staff (first of: staff | wand)"));
    check("starting B: the wealth instead", B.startingEquipmentPlan(paladin, { option: "B", wealth: "150" }), { items: [], categories: [], currency: { gp: 150 }, picks: [] });
    check("starting none", B.startingEquipmentPlan(paladin, { option: "none" }).items, []);
    ok("starting B with a dice formula is named, not rolled", B.startingEquipmentPlan([], { option: "B", wealth: "5d4*10" }).picks[0]?.includes("formula"));
  }

  /* ── spellcasting focus ──────────────────────────────────────────────── */
  {
    const focusTypes = { holy: { label: "Holy Focus", itemIds: { amulet: "Compendium.dnd5e.equipment24.Item.phbhsyAmuletworn", emblem: "Compendium.dnd5e.equipment24.Item.phbhsyEmblemborn" } },
      arcane: { label: "Arcane Focus", itemIds: { orb: "Compendium.dnd5e.equipment24.Item.phbafcOrb0000000" } } };
    const miss = B.focusMissing("paladin", [{ name: "Longsword", type: "weapon" }], focusTypes);
    check("focus: a paladin with no holy symbol", miss && { focus: miss.focus, label: miss.label, options: miss.options }, { focus: "holy", label: "Holy Focus", options: ["amulet", "emblem"] });
    check("focus: the PHB copy of an emblem counts (same id tail)",
      B.focusMissing("paladin", [{ name: "Emblem", type: "equipment", source: "Compendium.dnd-players-handbook.equipment.Item.phbhsyEmblemborn" }], focusTypes), null);
    check("focus: an inline holy symbol counts by name", B.focusMissing("cleric", [{ name: "Holy Symbol of Lathander", type: "loot" }], focusTypes), null);
    check("focus: a wizard's spellbook counts", B.focusMissing("wizard", [{ name: "Spellbook", type: "loot" }], focusTypes), null);
    check("focus: a fighter needs none", B.focusMissing("fighter", [], focusTypes), null);
    check("focus: a bard needs an instrument", B.focusMissing("bard", [{ name: "Lute", type: "tool", toolType: "music" }], focusTypes), null);
  }

  /* ── stock lore, crops ───────────────────────────────────────────────── */
  {
    // the live shape of an imported Monster Manual kobold (eval round 3's Snik)
    const snik = "<div class=\"gear\"><p><strong>Gear:</strong> @UUID[Compendium.dnd-players-handbook.equipment.Item.phbwepDagger0000]{Daggers (3)}</p></div>" +
      "<h1>Kobolds</h1><p>@Embed[Compendium.dnd-monster-manual.content.JournalEntry.mmAppendixMonste.JournalEntryPage.NC8c3St0SoWBP6K8 caption=false cite=false]</p>";
    ok("stock lore: an imported Monster Manual biography", B.isStockLore(snik));
    ok("stock lore: a builder's biography (patch replaces it) is kept", !B.isStockLore("<p>Snik bites tails. Gear: a bent dagger.</p>"));
    ok("stock lore: an embed of a world journal is the builder's", !B.isStockLore("<p>@Embed[JournalEntry.abc.JournalEntryPage.def]</p>"));
    check("crops auto, one blank scene: skipped and said", B.cropsDecision("auto", [{ hasArt: false }]).want, false);
    ok("crops auto, one blank scene: the note says why", B.cropsDecision("auto", [{ hasArt: false }]).note.includes("no background image"));
    check("crops auto, one scene with art", B.cropsDecision("auto", [{ hasArt: true }]), { want: true, note: null });
    check("crops true on a blank scene still renders", B.cropsDecision(true, [{ hasArt: false }]).want, true);
    check("crops auto, two scenes: off", B.cropsDecision("auto", [{ hasArt: true }, { hasArt: true }]).want, false);
  }

  /* ── the <party> line ────────────────────────────────────────────────── */
  {
    ok("party: none says so and says not to guess", partyLine({ party: null }).includes("none set") && partyLine({ party: null }).includes("never guess"));
    check("party: from the world setting", partyLine({ party: "4x5", partySource: "setting" }), "<party>4 x level 5 (from the world setting)</party>");
    check("party: mixed levels from the call", partyLine({ party: [5, 5, 4], partySource: "call" }), "<party>levels 5, 5, 4 (from this call)</party>");
    const { view } = buildView([F.sceneOf("s", "S", [F.prompt("a", "mid", 2, 2, "A rat.")], [])], { party: "4x3", partySource: "call", cropsNote: "crops: skipped — test" });
    const text = renderGather(view);
    ok("party: printed after the legend", /<\/legend>\n<party>4 x level 3 \(from this call\)<\/party>/.test(text));
    ok("crops note: printed before the todo", text.includes("<crops>crops: skipped — test</crops>\n<todo>"));
  }

  /* ── door lines: a walled-off group is named by a prompt ─────────────── */
  {
    const door = W(500, 500, 600, 500, { door: DOOR.DOOR });
    const reach = m => (m.id === "p9" ? "LOS" : "wall");
    const groups = [
      { label: "p9", prompt: true, members: [{ id: "p9", rect: { x: 500, y: 600, w: 100, h: 100 } }] },
      // E1: a built kobold nearer the door than its prompts
      { label: "E1", prompt: true, members: [{ id: "t2", rect: { x: 400, y: 300, w: 100, h: 100 } }, { id: "p1", rect: { x: 300, y: 200, w: 100, h: 100 } }] },
      // E2: its prompt is out of range, only the built member is near
      { label: "E2", prompt: true, members: [{ id: "t5", rect: { x: 700, y: 300, w: 100, h: 100 } }, { id: "p7", rect: { x: 2500, y: 0, w: 100, h: 100 } }] }
    ];
    const [line] = doorLines([door], groups, { dims: F.DIMS, gridFt: 5, withinFt: 60, reach });
    ok("door blind: E1 named by its prompt p1, not the nearer t2", line.includes("E1 (p1 ") && !line.includes("E1 (t2"));
    ok("door blind: a group whose prompts are out of range says so", line.includes("E2 (t5 ") && line.includes("its prompts p7 are farther"));
  }

  /* ── readback: groups with no hostile creature; the dry-run sheet ────── */
  {
    const budget = { size: 4, level: 5, low: 2000, moderate: 3000, high: 4400 };
    check("encounter line: a PC-only group has no difficulty",
      R.encounterLine({ id: "E2", xp: 0, creatures: 0, unbuilt: 2, budget, difficulty: "under low" }),
      "E2: no hostile creature, 2 prompt(s) not built in this call — no difficulty to judge");
    check("encounter line: the dry run's estimate is labelled",
      R.encounterLine({ id: "E1", xp: 150, creatures: 5, unbuilt: 0, budget, difficulty: "under low", estimate: true }),
      "E1 (estimate, CR XP of the plan): 150 XP from 5 creature(s) vs party 4 x L5: low 2000 | moderate 3000 | high 4400 → under low");
    const row = R.planRow({ index: 0, id: "p9", label: "p9", kind: "character", ok: true,
      plan: { x: 0, y: 0, creates: ["Actor"], warnings: ["Detect Magic not added: already granted"], defaults: ["Soldier: picked Dice Set"], sheet: "Wizard 5 (Evoker), …" } });
    check("plan row carries the preview sheet", row.sheet, "Wizard 5 (Evoker), …");
    const text = R.renderReplace({ dryRun: true, call: "pm-1", rows: [row], remaining: { s: 1 }, encounters: [] });
    ok("dry-run text prints sheet, DEFAULTED and WARN under the plan line",
      text.includes("p9 sheet: Wizard 5") && text.includes("p9 DEFAULTED (check): Soldier: picked Dice Set") && text.includes("p9 WARN: Detect Magic not added"));
  }

  /* ── lights placed with a hotspot or note ────────────────────────────── */
  {
    check("lightText", core.lightText({ dim: 10, bright: 0, color: "#9fd3ff", animation: { type: "pulse" } }), "dim 10 ft, #9fd3ff, pulse");
    check("lightText: nothing set", core.lightText({}), "");
    const relic = F.built("relic", 4, 4, { kind: "hotspot", w: 0.5, name: "Glowing Relic" });
    relic.light = "dim 10 ft, #9fd3ff, pulse";
    const { view } = buildView([F.sceneOf("l", "L", [relic, F.prompt("a", "mid", 12, 12, "A rat.")], [])]);
    ok("a hotspot's light prints on the hotspot", renderGather(view).includes("Light: dim 10 ft, #9fd3ff, pulse"));
  }

  /* ── spec files ──────────────────────────────────────────────────────── */
  {
    check("specFileUrl: Data-relative", B.specFileUrl("pentaryn-prompts-specs/pm-1.json"), "pentaryn-prompts-specs/pm-1.json");
    check("specFileUrl: absolute under the Data dir", B.specFileUrl("/Users/joe/Library/Application Support/FoundryVTT/Data/pentaryn-prompts-specs/pm-1.json"), "pentaryn-prompts-specs/pm-1.json");
    check("specFileUrl: outside the Data dir", B.specFileUrl("/tmp/spec.json"), null);
    check("specFileUrl: no climbing out", B.specFileUrl("../worlds/x.json"), null);
  }
}
