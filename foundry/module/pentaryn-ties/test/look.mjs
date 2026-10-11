#!/usr/bin/env node
/**
 * Fixtures for the player's two pages on someone: the Look window (`look.mjs`, opened from the
 * canvas double-click menu) and the Known tab (`known.mjs`). `node test/look.mjs`.
 *
 * `known.mjs`'s fixtures run with no Foundry at all. These two files need a sliver of it, so
 * the stubs in test/fixtures/stubs.mjs give them one: a `game` with actors, settings and i18n, and an
 * `ApplicationV2` to extend. Nothing here talks to a server.
 *
 * The world is a cut of the real one (pentaryn, 2026-10-07): Marrith rolled Caven's three tells,
 * failed Starved (8 vs Medicine DC 10) and passed the other two. The records are copied as the
 * conduit wrote them — the failed belief row, the three `studied` locks, the two grants — so a
 * player surface that drew a label off a lock or an outcome record, rather than off a grant,
 * prints "Starved" here and the case fails.
 */

import { StubActor, W } from "./fixtures/stubs.mjs";

const { LookWindow } = await import("../look.mjs");
const { buildKnownHTML, grantCard } = await import("../known.mjs");
const { loreOutcome, identMissKey } = await import("../known-core.mjs");

/* ── the world: Caven, Marrith, three tells ───────────────────────────────── */

const CAVEN = "IxcfWOvpcKID6bdn";
const MARRITH = "RNDTDBlFXxZ7Uc8i";
const STARVED = `lore:${CAVEN}:fPTb0zaGR7PTyQPD`;
const VEINS = `lore:${CAVEN}:5vgmbND41b0mPK1L`;
const THINKING = `lore:${CAVEN}:092kFHH5Jupk6LLn`;
const WHEN = 1791420283909;
const sources = { adv: 0, dis: 0, shared: [], declared: "normal", rule: "raw", resolved: "normal" };
const row = (text, total, pass) => ({ claim: null, when: WHEN, text, tier: null, total, delivered: WHEN, sources, pass });
const VEINS_TEXT = "Grey-black veins up the hands and forearms, ink under the nails. Necromancy, years of it. The Art marks the hands first.";
const THINKING_TEXT = "The eyes are not dulled. He is counting guards, dimmings, and the distance to the door. Whatever they took from him, they did not take the plan.";

function world({ granted = {}, attributes = [] } = {}) {
  const caven = {
    id: CAVEN, name: "Caven Calderon", type: "character", img: "caven.webp",
    system: { details: { type: { value: "humanoid" } } },
    ownership: { default: 0 },
    flags: {
      "pentaryn-ties": {
        attributes,
        lore: [
          { id: "fPTb0zaGR7PTyQPD", label: "Starved", skill: "med", dc: 10, hold: false,
            text: "Collarbones, wrists, cracked lips. Months in here, not weeks, and he is rationing himself.",
            miss: "Weeks at most. He was thin before." },
          { id: "5vgmbND41b0mPK1L", label: "The veins", skill: "arc", dc: 12, hold: false, text: VEINS_TEXT,
            miss: "Bad blood, or old poison. Prison does that." },
          { id: "092kFHH5Jupk6LLn", label: "Still thinking", skill: "ins", dc: 13, hold: false, text: THINKING_TEXT,
            miss: "Broken. The stare is empty; what is left of him is the beard." }
        ],
        beliefs: { [MARRITH]: { [STARVED]: row("", 8, false), [VEINS]: row(VEINS_TEXT, 20, true), [THINKING]: row(THINKING_TEXT, 23, true) } }
      }
    }
  };
  const marrith = {
    id: MARRITH, name: "Marrith Ashcroft", type: "character", img: "marrith.webp",
    system: { details: { type: { value: "humanoid" } } },
    ownership: { default: 0, kristine: 3 },
    flags: {
      "pentaryn-ties": {
        known: [{ id: CAVEN, name: "Caven Calderon", category: "sentient", notes: "", imposter: null, hidden: false, when: WHEN - 1 }],
        studied: { kind: {}, lore: { [STARVED]: { when: WHEN }, [VEINS]: { when: WHEN }, [THINKING]: { when: WHEN } } },
        granted: {
          [VEINS]: { text: VEINS_TEXT, when: WHEN, icon: "caven.webp", source: "The veins" },
          [THINKING]: { text: THINKING_TEXT, when: WHEN, icon: "caven.webp", source: "Still thinking" },
          ...granted
        }
      }
    }
  };
  W.actors = new Map([caven, marrith].map(d => [d.id, new StubActor(d)]));
  return { caven: W.actors.get(CAVEN), marrith: W.actors.get(MARRITH) };
}

const look = (character, subject) => new LookWindow(character, subject).buildHTML();
const count = (html, needle) => html.split(needle).length - 1;

export function register({ t, eq, ok }) {
  t("look: a failed tell leaves no trace — no label, no header — and the two passes show", () => {
    const { caven, marrith } = world();
    const html = look(marrith, caven);
    ok(!/Starved/.test(html), "Starved must not appear anywhere in the Look window");
    ok(html.includes("The veins") && html.includes("Still thinking"), "the two passed tells render");
    eq(count(html, 'class="pt-look-group"'), 1, "one group (About Caven), no empty one: ");
    eq(count(html, 'class="pt-grant"'), 2, "exactly the two passed cards: ");
  });

  t("known tab: the failed tell is neither a card nor a leftover offer button", () => {
    const { marrith } = world();
    const html = buildKnownHTML(marrith);
    ok(!/Starved/.test(html), "Starved must not appear on Marrith's Known tab");
    ok(html.includes("The veins") && html.includes("Still thinking"), "the two passed tells render");
    ok(!html.includes("pt-lore-offers"), "all three tells are spent, so no offers block and no offer header");
  });

  t("look: a blank grant (empty text, empty HTML) draws no card and opens no group", () => {
    const { caven, marrith } = world({
      granted: {
        [STARVED]: { text: "<p></p>", when: WHEN, icon: "caven.webp", source: "Starved" }
      }
    });
    const html = look(marrith, caven);
    ok(!/Starved/.test(html), "a blank grant's source line is not a header");
    eq(count(html, 'class="pt-grant"'), 2);
  });

  t("look: nothing but blanks → the one empty line, no 'What you have learned' head", () => {
    const { caven, marrith } = world();
    marrith.flags["pentaryn-ties"].granted = {
      [STARVED]: { text: "  ", when: WHEN, source: "Starved" },
      [VEINS]: { text: "<p>&nbsp;</p>", when: WHEN, source: "The veins" }
    };
    const html = look(marrith, caven);
    ok(!html.includes("pt-granted"), "no granted region at all");
    ok(!html.includes("pt-look-group"), "no group header");
    ok(html.includes("pt-look-empty"), "the single 'nothing yet' line");
    ok(!/Starved|The veins/.test(html), "no labels from blank grants");
  });

  /* ── the failure line (Joe, 2026-10-08): empty → nothing; written → shown like a pass ── */

  // the grant exactly as `applyPlayerWrites` writes it from a graded roll: only when not silent
  const grantFrom = (row, total) => {
    const out = loreOutcome(row, total);
    return out.silent ? {} : { [STARVED]: { text: out.text, when: WHEN, icon: "caven.webp", source: row.label } };
  };
  const STARVED_ROW = () => W.actors.get(CAVEN).flags["pentaryn-ties"].lore[0];
  const STARVED_PASS = "Collarbones, wrists, cracked lips.";
  const STARVED_MISS = "Weeks at most. He was thin before.";

  t("fail + EMPTY failure text → nothing on the Look window or the Known tab", () => {
    world();
    const row = { ...STARVED_ROW(), miss: "" };
    const { caven, marrith } = world({ granted: grantFrom(row, 8) });
    for (const [where, html] of [["look", look(marrith, caven)], ["known", buildKnownHTML(marrith)]]) {
      ok(!/Starved/.test(html), `${where}: no Starved label`);
      ok(!html.includes(STARVED_PASS), `${where}: no pass text`);
      eq(count(html, 'class="pt-grant"'), 2, `${where}: only the two passed cards: `);
    }
  });

  t("fail + WRITTEN failure text → that text, as an ordinary card, on Look and Known — never the pass text", () => {
    world();
    const { caven, marrith } = world({ granted: grantFrom(STARVED_ROW(), 8) });
    for (const [where, html] of [["look", look(marrith, caven)], ["known", buildKnownHTML(marrith)]]) {
      ok(html.includes(STARVED_MISS), `${where}: the failure line renders`);
      ok(html.includes("Starved"), `${where}: titled like any card — the label they rolled on`);
      ok(!html.includes(STARVED_PASS), `${where}: no pass text`);
      ok(!/fail|miss/i.test(html.replace(STARVED_MISS, "")), `${where}: nothing says it was a failure`);
      eq(count(html, 'class="pt-grant"'), 3, `${where}: three cards: `);
    }
  });

  t("pass → the pass text, never the failure line", () => {
    world();
    const { caven, marrith } = world({ granted: grantFrom(STARVED_ROW(), 12) });
    const html = look(marrith, caven);
    ok(html.includes(STARVED_PASS), "pass text renders");
    ok(!html.includes(STARVED_MISS), "no failure line");
  });

  t("failed identification: a written failure line shows under the creature, never the attribute's title", () => {
    W.registry = [{ id: "vrinn", title: "The Vrinn Circle", category: "faction", secret: true, dc: 15, skill: "ins",
      reveal: "The ring on his left hand is a Vrinn seal.", miss: "A pilgrim's ring, worn smooth." }];
    try {
      const missKey = identMissKey(CAVEN, "vrinn");
      const { caven, marrith } = world({
        attributes: ["vrinn"],
        granted: { [missKey]: { text: "A pilgrim's ring, worn smooth.", when: WHEN, icon: "caven.webp", source: "Caven Calderon" } }
      });
      caven.flags["pentaryn-ties"].beliefs[MARRITH]["attr:vrinn:#id"] = row("", 7, false);
      for (const [where, html] of [["look", look(marrith, caven)], ["known", buildKnownHTML(marrith)]]) {
        ok(html.includes("A pilgrim&#39;s ring, worn smooth.") || html.includes("A pilgrim's ring, worn smooth."), `${where}: the failure line renders`);
        ok(!html.includes("Vrinn"), `${where}: neither the attribute's title nor its reveal`);
      }
      // and with no failure line written, the failed rung draws nothing at all
      const empty = world({ attributes: ["vrinn"] });
      empty.caven.flags["pentaryn-ties"].beliefs[MARRITH]["attr:vrinn:#id"] = row("", 7, false);
      const html = look(empty.marrith, empty.caven);
      ok(!html.includes("Vrinn") && !html.includes("pilgrim"), "empty → nothing");
      eq(count(html, 'class="pt-grant"'), 2);
    } finally {
      W.registry = [];
    }
  });

  t("grantCard: no body means no card, title included; textHTML (the GM's preview) is unaffected", () => {
    eq(grantCard({ source: "Starved", text: "" }), "");
    eq(grantCard({ source: "Starved", text: "<p><br></p>" }), "");
    eq(grantCard({ source: "Starved" }), "");
    ok(grantCard({ source: "Starved", text: "" }, { textHTML: "<em>—</em>" }).includes("Starved"), "GM furniture keeps its own body");
    ok(grantCard({ source: "The veins", text: VEINS_TEXT }).includes("The veins"));
  });
}

/* ── standalone harness (same shape as test/known.mjs) ────────────────────── */

export function main() {
  let pass = 0;
  let fail = 0;
  const failures = [];
  const verbose = process.argv.includes("-v");
  const t = (name, fn) => {
    try {
      fn();
      pass++;
      if (verbose) console.log(`  ✓ ${name}`);
    } catch (err) {
      fail++;
      failures.push({ name, message: err.message });
      console.log(`  ✗ ${name}\n      ${err.message}`);
    }
  };
  const eq = (actual, expected, what = "") => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${what}expected ${e}, got ${a}`);
  };
  const ok = (cond, what) => {
    if (!cond) throw new Error(what || "expected truthy");
  };
  register({ t, eq, ok });
  console.log(`\nlook + known tab: ${pass} passed, ${fail} failed`);
  if (fail) for (const f of failures) console.log(`  · ${f.name}: ${f.message}`);
  return fail;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) process.exit(main());
