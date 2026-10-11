/**
 * Synthetic book data. Deliberately NOT real PHB text — the licensed content does not
 * belong in this repo, and fixtures that exercise the traps are more useful than prose
 * that happens to be authentic.
 *
 * Every page here exists to break something specific.
 */

export const PAGES = {
  // The enricher shapes measured in the real books: 5,052 @UUID across PHB/DMG/MM,
  // plus inline rolls. A naive tag-strip leaves all of them in the text.
  enrichers: `<p>As explained in @UUID[Compendium.dnd-players-handbook.content.JournalEntry.phbCombat0000000]{Combat} later, a target behind &Reference[Half Cover] gains a bonus. Roll [[/save dex 15]] to avoid it. See @UUID[Compendium.x.JournalEntry.y] for more.</p>`,

  // The ampersand arrives HTML-escaped in some books, which defeats a regex written
  // for the bare form.
  escapedAmp: `<p>A target behind &amp;Reference[Three-Quarters Cover]{three-quarters cover} is harder to hit.</p>`,

  // Block tags must become spaces, not nothing: "endone" instead of "end one" both
  // reads wrong and breaks phrase matching.
  blocks: `<p>sentence one</p><p>sentence two</p><ul><li>item a</li><li>item b</li></ul>`,

  entities: `<p>Roll&nbsp;1d20&nbsp;&mdash;&nbsp;a &quot;natural&quot; 20 always hits &amp; crits. 5&#176; of arc.</p>`,

  // Match at the very start, and at the very end, of a page longer than the snippet.
  matchAtStart: `<p>Grappled is a condition. ${"filler word ".repeat(80)}</p>`,
  matchAtEnd: `<p>${"filler word ".repeat(80)} and finally: grappled.</p>`,

  // Nine matches on one page — must yield ONE hit, not nine.
  repeated: `<p>${"cover is cover and cover means cover. ".repeat(3)}</p>`,

  long: `<p>${"lorem ipsum dolor sit amet ".repeat(500)}</p>`,

  nested: `<div class="x"><p><strong>Bold</strong> and <em>italic</em> and <a href="#">a link</a>.</p></div>`,

  scripty: `<p>before</p><script>var x = "<not a tag>";</script><style>p{color:red}</style><p>after</p>`,

  empty: ``,
};

function page(id, name, html) { return { id, name, html }; }

export const BOOKS = [
  {
    id: "test-phb.content",
    label: "Test Player's Handbook",
    docs: [
      { id: "docCombat", name: "Combat", pages: [
        page("pgCover", "Cover", PAGES.enrichers),
        page("pgCover2", "Cover Degrees", PAGES.escapedAmp),
        page("pgRepeat", "Repeated Cover", PAGES.repeated),
      ]},
      { id: "docGloss", name: "Appendix C: Rules Glossary", pages: [
        page("pgStudy", "Study", `<p>When you take the Study action you make an Intelligence check.</p>`),
        page("pgGrapStart", "Grappled", PAGES.matchAtStart),
        page("pgGrapEnd", "Grappling Rules", PAGES.matchAtEnd),
      ]},
      { id: "docMisc", name: "Miscellany", pages: [
        page("pgBlocks", "Blocks", PAGES.blocks),
        page("pgEnt", "Entities", PAGES.entities),
        page("pgNest", "Nested", PAGES.nested),
        page("pgScript", "Scripty", PAGES.scripty),
        page("pgLong", "Long Page", PAGES.long),
        page("pgEmpty", "Empty Page", PAGES.empty),
      ]},
    ],
  },
  {
    id: "test-srd14.rules",
    label: "Test Rules (2014 SRD)",
    edition: "2014",
    docs: [
      { id: "doc14", name: "Old Combat", pages: [
        page("pg14cover", "Cover", `<p>A target with half cover has a +2 bonus to AC.</p>`),
      ]},
    ],
  },
];

export const MONSTER_OK = {
  name: "Test Goblin", id: "actGoblin", packId: "test-mm.actors",
  system: { details: { cr: 1, type: { value: "humanoid" } },
            attributes: { ac: { value: 15, flat: null }, hp: { max: 7 } },
            traits: { size: "sm" } },
  items: [{ name: "Nimble Escape", type: "feat" }, { name: "Scimitar", type: "weapon" }],
};

// dnd5e moved a data path — the digest must say so, not emit null holes.
export const MONSTER_MOVED = {
  name: "Future Goblin", id: "actFuture", packId: "test-mm.actors",
  system: { details: {}, attributes: { ac: {} } },
  items: [],
};
