/**
 * core/rules.mjs — the pure rules added after the S4 split. Each is proven against the verbatim
 * "before" code it replaced (test/fixtures/legacy-*.mjs) or against the guide's fixture table.
 * No Foundry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rolledMiss } from "../core/rules.mjs";
import { shareStatus } from "../known-core.mjs";
import { rowMissed, makePassOfRow, flatMissed, MEMBER_FACT } from "./fixtures/legacy-miss.mjs";
import { readJSON } from "./kit/harness.mjs";

/* ── ties-13: one flat-roll miss predicate ────────────────────────────────── */

// the guide's 12-row matrix plus hostile totals (NaN, ±Infinity, strings) and DCs
const RECS = [
  { total: 9, text: "x", delivered: 1 },
  { total: 14, text: "x", delivered: 1 },
  { total: 18, text: "x", delivered: 1 },
  { pass: true, total: 3, text: "x", delivered: 1 },
  { pass: false, total: 20, text: "x", delivered: 1 },
  { from: "gm", prior: { pass: false, total: 2 }, total: null, text: "told", delivered: 1 },
  { total: null, text: "told", delivered: 1 },
  { total: null, text: "", delivered: null },
  null,
  undefined,
  { total: 13.5, text: "x", delivered: 1 },
  { total: 18, text: "x", delivered: null },
  { total: NaN, text: "x" },
  { total: Infinity, text: "x" },
  { total: -Infinity, text: "x" },
  { total: "9", text: "x" },
  { pass: "false", total: 9, text: "x" },
  { from: "", total: 9, text: "x" },
];
const DCS = [14, "high", null, undefined, 0, NaN, 13.5];

test("ties-13: rolledMiss equals the legacy flatMissed on every row × dc", () => {
  for (const rec of RECS) for (const dc of DCS) {
    assert.equal(rolledMiss(rec, dc), flatMissed(rec, dc), JSON.stringify({ rec, dc }));
  }
});

test("ties-13: rowMissed (study.mjs) — non-kind rows are rolledMiss; kind rows keep their own rule", async () => {
  const now = row => (fact, rec) => {
    if (!rec || rec.from) return false;
    if (fact.ns === "kind") return rec.total !== null && rec.total !== undefined && !(Number(rec.tier) >= 15);
    return rolledMiss(rec, fact.dc);
  };
  const adapter = now();
  for (const rec of RECS) for (const dc of DCS) for (const ns of ["lore", "attr", "kind"]) {
    const r = rec && ns === "kind" ? { ...rec, tier: 15 } : rec;
    assert.equal(adapter({ ns, dc }, r), rowMissed({ ns, dc }, r), JSON.stringify({ ns, rec, dc }));
  }
});

test("ties-13: beliefs()' lore verdict — not a rolledMiss (and not NaN) where the legacy compared >= dc", () => {
  const legacy = makePassOfRow({ rows: [{ id: "f1", dc: 14 }, { id: "f2", dc: "x" }] });
  const rows = [{ id: "f1", dc: 14 }, { id: "f2", dc: "x" }];
  const now = (parsed, rec) => {
    if (rec.from) return true;
    if (parsed.ns === "kind") return Number(rec.tier) >= 15;
    if (typeof rec.pass === "boolean") return rec.pass;
    if (typeof rec.total !== "number") return rec.delivered || String(rec.text ?? "").trim() ? true : null;
    if (parsed.ns === "lore") {
      const dc = rows.find(r => r.id === parsed.fact)?.dc;
      // a pass is "not a miss" — except a NaN total, which the >= comparison never passed
      return typeof dc === "number" ? !Number.isNaN(rec.total) && !rolledMiss(rec, dc) : null;
    }
    return null;
  };
  for (const rec of RECS.filter(Boolean)) for (const fact of ["f1", "f2", "nope"]) {
    assert.equal(now({ ns: "lore", fact }, rec), legacy({ ns: "lore", fact }, rec), JSON.stringify({ fact, rec }));
  }
});

test("ties-13: shareStatus is unchanged on the pinned S2 matrix (oracle-miss-matrix.json)", () => {
  const golden = readJSON(new URL("./golden/oracle-miss-matrix.json", import.meta.url));
  assert.equal(golden.length, 12);
  const rows = [
    { total: 9, text: "x", delivered: 1 }, { total: 14, text: "x", delivered: 1 }, { total: 18, text: "x", delivered: 1 },
    { pass: true, total: 3, text: "x", delivered: 1 }, { pass: false, total: 20, text: "x", delivered: 1 },
    { from: "gm", prior: { pass: false, total: 2 }, total: null, text: "told", delivered: 1 },
    { total: null, text: "told", delivered: 1 }, { total: null, text: "", delivered: null },
    { total: 9, text: "x", delivered: 1, dcOverride: "high" }, null,
    { total: 13.5, text: "x", delivered: 1 }, { total: 18, text: "x", delivered: null },
  ];
  rows.forEach((rec, i) => {
    const dc = rec?.dcOverride ?? 14;
    const r = rec ? { ...rec } : null;
    if (r) delete r.dcOverride;
    const got = { lore: shareStatus({ belief: r, dc }), ident: shareStatus({ belief: r, ident: true }), kind: shareStatus({ belief: r ? { ...r, tier: 10 } : r, kind: true }) };
    assert.deepEqual(got, golden[i].shareStatus, golden[i].label);
  });
});

test("ties-13: shareStatus on non-finite totals grades nothing (a non-finite total is no total)", () => {
  for (const total of [NaN, Infinity, -Infinity]) {
    assert.equal(shareStatus({ belief: { total, text: "x", delivered: 1 }, dc: 14 }), "told", String(total));
  }
});

test("MEMBER_FACT is still #id (the oracle and core agree)", async () => {
  const { MEMBER_FACT: core } = await import("../known-core.mjs");
  assert.equal(core, MEMBER_FACT);
});

/* ── ties-14: the key and flag grammar ────────────────────────────────────── */

test("ties-14: identifiedKey / isIdentKey / attrFactKey and the two reserved names", async () => {
  const { identifiedKey, attrFactKey, identMissKey } = await import("../known-core.mjs");
  const { isIdentKey, CONCEAL_FLAG, INSPECT_CLAIM_KEY } = await import("../core/rules.mjs");
  assert.equal(identifiedKey("species:human"), "attr:species:human:#id");
  assert.equal(isIdentKey("attr:species:human:#id"), true);
  assert.equal(isIdentKey("attr:a:r1"), false);
  assert.equal(isIdentKey("lore:x:#idmiss-a"), false);
  assert.equal(isIdentKey(identMissKey("x", "a")), false);
  assert.equal(isIdentKey(null), false);
  assert.equal(attrFactKey("a", "b"), "attr:a:b");
  assert.equal(CONCEAL_FLAG, "conceal");
  assert.equal(INSPECT_CLAIM_KEY, "#inspect");
  // every ledger key shape the GM-side files used to test with endsWith(":#id")
  for (const k of ["attr:a:#id", "attr:a:b", "kind", "lore:x:y", "attr:a:#idx", "#id", ":#id"]) {
    assert.equal(isIdentKey(k), k.endsWith(":#id"), k);
  }
});

test("ties-14: no file outside core/ builds a fact key or tests the #id suffix by hand", async () => {
  const { sourceScan } = await import("./kit/harness.mjs");
  const hits = sourceScan(new URL("..", import.meta.url), /`attr:\$\{[^}]*\}:|:\$\{MEMBER_FACT\}|"#inspect"|"conceal"/)
    .filter(h => !h.file.startsWith("core/"));
  assert.deepEqual(hits, []);
});

/* ── ties-9 part 3: concealFor; ties-15: firstName ───────────────────────── */

test("ties-9: concealFor — the guide's table, and the two copies it replaced", async () => {
  const { concealFor } = await import("../core/rules.mjs");
  const cases = [[8, "x", 8], [{ x: 10 }, "x", 10], [{ default: 3 }, "y", 3], [25, "x", 20], [-4, "x", 0], ["abc", "x", 0], [null, "x", 0], [{ x: "7" }, "x", 7], [undefined, "x", 0], [{ x: 2.5 }, "x", 3], [{ y: 9, default: 1 }, "x", 1], [{ x: null, default: 4 }, "x", 4]];
  // the verbatim body both study.mjs concealmentFor and preview.mjs conceal carried at the checkpoint
  const legacy = (raw, id) => {
    if (typeof raw === "number") return Math.max(0, Math.min(20, Math.round(raw)));
    return Math.max(0, Math.min(20, Math.round(Number(raw?.[id] ?? raw?.default ?? 0) || 0)));
  };
  for (const [raw, id, want] of cases) {
    assert.equal(concealFor(raw, id), want, JSON.stringify([raw, id]));
    assert.equal(concealFor(raw, id), legacy(raw, id));
  }
  assert.ok(Number.isNaN(concealFor(NaN, "x")) && Number.isNaN(legacy(NaN, "x")), "a NaN number stays NaN, as before");
});

test("ties-15: firstName — one copy for the roster's switchLabels and the inspect window", async () => {
  const { firstName } = await import("../core/rules.mjs");
  const { switchLabels } = await import("../known-core.mjs");
  const cases = [["Caven Calderon", "Caven"], ["Sergeant Vesh, Night Sergeant", "Sergeant"], ["  Talo ", "Talo"], ["", ""], [null, "?"], [undefined, "?"], ["Talo, the Quiet", "Talo"]];
  for (const [n, want] of cases) assert.equal(firstName(n), want, JSON.stringify(n));
  assert.deepEqual(switchLabels(["Caven Calderon", "Caven Ashwell", "Talo"]), ["Caven Calderon", "Caven Ashwell", "Talo"]);
  assert.deepEqual(switchLabels(["Caven Calderon", "Talo, the Quiet"]), ["Caven", "Talo"]);
});
