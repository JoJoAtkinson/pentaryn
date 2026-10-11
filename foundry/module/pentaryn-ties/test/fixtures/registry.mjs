/** A synthetic attribute registry (the `pentaryn-ties.attributes` world setting). Not world data. */
export const KIND_ACTOR = { id: "zzKindActor00001", name: "ZZ Kind Template", type: "npc" };

export const REGISTRY = [
  {
    id: "ashfallcompany",
    title: "Ashfall Company",
    category: "Faction",
    icon: "icons/zz/ashfall.webp",
    whenKnown: "advantage",
    whenCarried: "auto",
    secret: true,
    parent: null,
    dc: 14,
    skill: "his",
    reveal: "<p>Mercenaries who burn their contracts.</p>",
    miss: "<p>A soot-black sigil.</p>",
    hold: null,
    lore: [{ id: "l1", label: "Origins", dc: 12, skill: "his", text: "<p>Founded after the fire.</p>", miss: "", hold: true }],
    source: { blob: "abcdef1", path: "world/factions/ashfall.md" },
    bonuses: ["ignored"],
    createdAt: 1700000000000,
    modifiedAt: 1700000100000,
    reviewedAt: 1700000200000,
    touched: ["title", "bogus", "title"],
    reviewedSnapshot: { title: "Ashfall Company", dc: 14, lore: [] }
  },
  // no icon: describe fills one from the category at read
  { id: "greywatch", title: "Greywatch", category: "Order", parent: "ashfallcompany" },
  // an authored entry under a derived id enriches the derived record
  { id: "size:med", title: "Medium folk", category: "Size" },
  // two entries one name: a name lookup is ambiguous → null
  { id: "twin", title: "Twin" },
  { id: "twin2", title: "Twin" }
];
