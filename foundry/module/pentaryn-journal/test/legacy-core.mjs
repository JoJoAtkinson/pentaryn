#!/usr/bin/env node
/**
 * Fixtures for journal-core.mjs. No dependencies — `node test/run.mjs`.
 *
 * Nothing Foundry is stubbed: importing the core bare is itself the proof that it stays pure.
 *
 * ⚠ SYNTHETIC FIXTURES ONLY. module-sync copies this folder to the server, where it is served to
 *   every client at /modules/pentaryn-journal/test/run.mjs. A real readable pasted in here would
 *   publish its GM secret to the players. Real pages are checked only by a live eval.
 */

const core = await import("../journal-core.mjs");
const { sanitize, stripSecrets, dropActive, embedsToLinks, fnv1a, escapeHTML, provenanceHTML,
  snapshotHTML, pageName, planSave, status, validateEnsure, hashOf, MOD, MAX_BODY } = core;

let pass = 0;
const failures = [];

function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
const ok = (name, cond) => check(name, !!cond, true);

/* ── sanitize / stripSecrets ──────────────────────────────────────────────── */

const plain = `<h2>Title</h2><p>Some <em>plain</em> text &amp; a <a href="x">link</a>.</p><section class="note"><p>kept</p></section>`;
check("1 plain HTML unchanged", sanitize(plain), plain);

check("2 one secret removed, surrounding p kept",
  sanitize(`<p>before</p><section class="secret" id="secret-a1"><p>GM ONLY</p></section><p>after</p>`),
  `<p>before</p><p>after</p>`);

check("3 secret nested in secret: both go, text after stays",
  sanitize(`<p>a</p><section class="secret"><p>x</p><section class="secret"><p>y</p></section><p>z</p></section><p>b</p>`),
  `<p>a</p><p>b</p>`);

check("4a plain section inside a secret goes",
  sanitize(`<section class="secret"><section class="box"><p>in</p></section></section><p>out</p>`),
  `<p>out</p>`);
check("4b secret inside a plain section: only the secret goes",
  sanitize(`<section class="box"><p>keep</p><section class="secret"><p>gone</p></section><p>keep2</p></section>`),
  `<section class="box"><p>keep</p><p>keep2</p></section>`);

for (const cls of ["secret revealed", "revealed secret"]) {
  const got = sanitize(`<section class="${cls}" id="secret-zz9"><p>now known</p></section>`);
  check(`5 class="${cls}" → pj-revealed`, got, `<section class="pj-revealed"><p>now known</p></section>`);
  ok(`5 "${cls}" leaves no secret token`, !/\bsecret\b/.test(got.replace("pj-revealed", "")) && !got.includes('id="secret-'));
}
check("5 extra classes survive the unwrap",
  sanitize(`<section class="box secret revealed"><p>k</p></section>`),
  `<section class="box pj-revealed"><p>k</p></section>`);

check("6 unclosed secret dropped to the end",
  sanitize(`<p>lead</p><section class="secret"><p>never closed <b>at all`), `<p>lead</p>`);

check("7 reveal button and script removed, secret-block unwrapped",
  sanitize(`<secret-block><p>t</p><button type="button" class="reveal">Reveal</button></secret-block><script>alert(1)</script><button class="plain">ok</button>`),
  `<p>t</p><button class="plain">ok</button>`);

const letter = `<p>The paper is black and the ink is pale silver.</p>`
  + `<section class="secret" id="secret-abc"><p>ZZGMONLY the writer is not who they claim.</p></section>`
  + `<p>"…by order of nobody in particular, the prisoner in cell nine…"</p>`;
const lettered = sanitize(letter);
ok("8 letter-shaped fixture loses ZZGMONLY", !lettered.includes("ZZGMONLY"));
ok("8 letter-shaped fixture keeps its lead line", lettered.startsWith("<p>The paper is black"));
ok("8 letter-shaped fixture keeps the text after", lettered.includes("cell nine"));

const mixed = `<p>a</p><section class="secret revealed" id="secret-q"><p>r</p></section>`
  + `<section class="secret"><p>s</p></section>@Embed[JournalEntry.A.JournalEntryPage.B inline]@UUID[.P2]{x}`;
const resolve = u => (u === ".P2" ? "JournalEntry.A.JournalEntryPage.P2" : null);
const once = sanitize(mixed, { resolve });
check("9 idempotent", sanitize(once, { resolve }), once);
check("9 idempotent on the letter", sanitize(lettered), lettered);

check("10a quoted > in an attribute does not end the tag",
  sanitize(`<section class="secret" data-x="a>b"><p>hide</p></section><p>show</p>`), `<p>show</p>`);
check("10b a comment holding a secret tag is just a comment",
  sanitize(`<!-- <section class="secret"> --><p>visible</p>`), `<!-- <section class="secret"> --><p>visible</p>`);
check("10c a comment inside a secret goes with it",
  sanitize(`<section class="secret"><!-- note --><p>h</p></section><p>v</p>`), `<p>v</p>`);
check("10d data-class does not count as class",
  sanitize(`<section data-class="secret"><p>v</p></section>`), `<section data-class="secret"><p>v</p></section>`);

check("11 uppercase SECTION / CLASS matched",
  sanitize(`<SECTION CLASS="secret"><P>x</P></SECTION><p>y</p>`), `<p>y</p>`);

check("12a bare embed → link with the default label",
  sanitize(`@Embed[JournalEntry.A.JournalEntryPage.B inline]`),
  `@UUID[JournalEntry.A.JournalEntryPage.B]{embedded content}`);
check("12b uuid= embed keeps its label",
  sanitize(`@Embed[uuid=X caption=false]{Lbl}`), `@UUID[X]{Lbl}`);
check("12c localised label is used",
  embedsToLinks(`@Embed[Y]`, { embeddedLabel: "eingebettet" }), `@UUID[Y]{eingebettet}`);
check("12d relative embed is resolved too",
  sanitize(`@Embed[.P2]`, { resolve }), `@UUID[JournalEntry.A.JournalEntryPage.P2]{embedded content}`);
ok("12e no @Embed survives", !once.includes("@Embed"));

check("13a relative UUID made absolute",
  sanitize(`@UUID[.P2]{x}`, { resolve }), `@UUID[JournalEntry.A.JournalEntryPage.P2]{x}`);
check("13b without a resolver it is unchanged", sanitize(`@UUID[.P2]{x}`), `@UUID[.P2]{x}`);
check("13c a resolver that returns null leaves it", sanitize(`@UUID[.Q]{x}`, { resolve }), `@UUID[.Q]{x}`);
check("13d a resolver that throws leaves it", sanitize(`@UUID[.Q]{x}`, { resolve: () => { throw new Error("x"); } }), `@UUID[.Q]{x}`);

check("14 non-string → empty", [sanitize(null), sanitize(undefined), sanitize(42), sanitize({})], ["", "", "", ""]);
check("14 stripSecrets / dropActive non-string", [stripSecrets(null), dropActive(7)], ["", ""]);

/* ── fnv1a / escapeHTML ───────────────────────────────────────────────────── */

check("fnv1a is stable", fnv1a("hello world"), fnv1a("hello world"));
check("fnv1a known value for empty", fnv1a(""), "811c9dc5");
check("fnv1a is 8 hex", /^[0-9a-f]{8}$/.test(fnv1a("<p>x</p>")), true);
ok("fnv1a changes on a one-character edit", fnv1a("<p>abc</p>") !== fnv1a("<p>abd</p>"));
check("escapeHTML", escapeHTML(`<b>&"'`), "&lt;b&gt;&amp;&quot;&#39;");

/* ── pageName ─────────────────────────────────────────────────────────────── */

const entry = { name: "A Sealed Note" };
check("pageName: blank → entry", pageName({ name: "  " }, entry), "A Sealed Note");
check("pageName: default Page 3 → entry", pageName({ name: "Page 3" }, entry), "A Sealed Note");
check("pageName: own name wins", pageName({ name: "The Seal" }, entry), "The Seal");
check("pageName: custom pattern", pageName({ name: "Seite 2" }, entry, /^Seite \d+$/), "A Sealed Note");

/* ── provenanceHTML / snapshotHTML ────────────────────────────────────────── */

const date = () => "7 Oct 2026";
const full = provenanceHTML({ place: "Old Gate", noteText: "Letter", savedAt: 1, key: "JournalEntry.A.JournalEntryPage.B", labels: { date } });
check("provenance: place + note", full,
  `<div class="pj-provenance"><p><i class="fa-solid fa-book-bookmark"></i> Found in <strong>Old Gate</strong> — “Letter” · 7 Oct 2026 · @UUID[JournalEntry.A.JournalEntryPage.B]{the original}</p></div>`);
const placeOnly = provenanceHTML({ place: "Old Gate", savedAt: 1, key: "K", labels: { date } });
ok("provenance: place only has no quote", !placeOnly.includes("“") && placeOnly.includes("<strong>Old Gate</strong>"));
const nothing = provenanceHTML({ key: "K", labels: { date: () => "" } });
ok("provenance: nothing → Found · the original", nothing.includes("</i> Found · @UUID[K]{the original}"));
for (const [n, h] of [["full", full], ["place only", placeOnly], ["nothing", nothing]]) ok(`provenance ${n} has @UUID[`, h.includes("@UUID["));
const nasty = provenanceHTML({ place: `<b>&"`, noteText: `<b>&"`, key: "K", labels: { date } });
ok("provenance escapes place and note", !nasty.includes("<b>") && nasty.split("&lt;b&gt;&amp;&quot;").length === 3);
check("provenance localised foundIn", provenanceHTML({ place: "X", key: "K", labels: { foundIn: "Gefunden in {place}", date: () => "" } })
  .includes("Gefunden in <strong>X</strong>"), true);
check("snapshotHTML", snapshotHTML({ provenance: "<div>p</div>", body: "<p>b</p>" }), `<div>p</div><hr class="pj-rule"><p>b</p>`);

/* ── planSave ─────────────────────────────────────────────────────────────── */

const srcA = { kind: "page", key: "JournalEntry.R.JournalEntryPage.A", type: "text", name: "One", body: "<p>one</p>", entryId: "R", entryName: "Readable", pageName: "One" };
const srcB = { kind: "page", key: "JournalEntry.R.JournalEntryPage.B", type: "image", name: "Two", src: "icons/svg/book.svg", caption: "cap", entryId: "R", entryName: "Readable", pageName: "Two" };
const ctx = { place: "Old Gate", noteText: "Pin", now: 1000, worldTime: 5, labels: { date } };

const fresh = planSave([], [srcA, srcB], ctx);
check("planSave fresh: two creates", fresh.create.length, 2);
check("planSave fresh: nothing else", [fresh.update.length, fresh.existing.length, fresh.tooLarge], [0, 0, false]);
check("planSave fresh: increasing sort", fresh.create.map(c => c.sort), [100000, 200000]);
check("planSave fresh: types", fresh.create.map(c => c.type), ["text", "image"]);
check("planSave fresh: flags key + hash", fresh.create.map(c => [c.flags[MOD].source.key, c.flags[MOD].source.hash]),
  [[srcA.key, hashOf(srcA)], [srcB.key, hashOf(srcB)]]);
check("planSave fresh: provenance in flags", [fresh.create[0].flags[MOD].source.place, fresh.create[0].flags[MOD].source.noteText, fresh.create[0].flags[MOD].source.savedAt], ["Old Gate", "Pin", 1000]);
ok("planSave fresh: text body = provenance + rule + body", fresh.create[0].text.content.endsWith(`<hr class="pj-rule"><p>one</p>`) && fresh.create[0].text.content.includes("pj-provenance"));
check("planSave fresh: image keeps src + caption", [fresh.create[1].src, fresh.create[1].image.caption, fresh.create[1].text], ["icons/svg/book.svg", "cap", undefined]);
check("planSave fresh: title shown", fresh.create[0].title, { show: true, level: 1 });

const asSaved = fresh.create.map((c, i) => ({ ...c, id: `S${i}` }));
const again = planSave(asSaved, [srcA, srcB], ctx);
check("planSave all saved → existing", [again.create.length, again.update.length, again.existing], [0, 0, ["S0", "S1"]]);

const edited = { ...srcA, body: "<p>one, edited</p>" };
const upd = planSave(asSaved, [edited, srcB], { ...ctx, now: 2000 });
check("planSave hash change → one update", [upd.create.length, upd.update.length, upd.existing], [0, 1, ["S1"]]);
check("planSave update keeps the id", upd.update[0]._id, "S0");
check("planSave update new hash, old savedAt, updatedAt", [upd.update[0].flags[MOD].source.hash, upd.update[0].flags[MOD].source.savedAt, upd.update[0].flags[MOD].source.updatedAt],
  [hashOf(edited), 1000, 2000]);
ok("planSave update replaces content", upd.update[0].text.content.includes("one, edited"));

const partial = planSave([asSaved[0]], [srcA, srcB], ctx);
check("planSave mixed partial", [partial.create.length, partial.existing], [1, ["S0"]]);
check("planSave sort continues after the last page", partial.create[0].sort, 200000);

const huge = planSave([], [{ ...srcA, body: "x".repeat(MAX_BODY + 1) }], ctx);
check("planSave refuses > 500 kB", [huge.tooLarge, huge.create.length], [true, 0]);
check("planSave tolerates junk", planSave(null, null, undefined), { create: [], update: [], existing: [], tooLarge: false });

/* ── status ───────────────────────────────────────────────────────────────── */

check("status none (nothing saved)", status([], [srcA, srcB]), "none");
check("status none (no sources)", status(asSaved, []), "none");
check("status saved", status(asSaved, [srcA, srcB]), "saved");
check("status partial", status([asSaved[0]], [srcA, srcB]), "partial");
check("status changed", status(asSaved, [edited, srcB]), "changed");
check("status changed beats partial", status([asSaved[0]], [edited, srcB]), "changed");
check("status image caption change", status(asSaved, [srcA, { ...srcB, caption: "new" }]), "changed");

/* ── validateEnsure ───────────────────────────────────────────────────────── */

check("validateEnsure rejects a missing user", validateEnsure(null, null).ok, false);
check("validateEnsure rejects a GM", validateEnsure({ id: "g", isGM: true }, null).ok, false);
check("validateEnsure returns the existing id", validateEnsure({ id: "p", isGM: false }, "J1"), { ok: true, entryId: "J1" });
check("validateEnsure accepts a plain player", validateEnsure({ id: "p", isGM: false }, null), { ok: true, create: true });

/* ── purity ───────────────────────────────────────────────────────────────── */

ok("core imported without Foundry globals", typeof globalThis.game === "undefined" && typeof globalThis.foundry === "undefined");

/* ── report ───────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.log(`✗ pentaryn-journal core: ${failures.length} failed, ${pass} passed`);
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log(`✓ pentaryn-journal core: ${pass} passed`);
