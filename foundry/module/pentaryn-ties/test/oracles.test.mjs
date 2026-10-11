/**
 * Characterisation (ties checkpoint, wave 3 — guide §3 S2 item 5): the verbatim oracles in
 * test/fixtures/legacy-*.mjs, run over the guide's case tables and pinned. S3 (ties-12 resolveMirror),
 * S5 (ties-38, isActiveGM) and S15 (ties-13, the miss unification) prove the new code against these
 * rows. No Foundry. Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { linked, resolve, relayFill, forceMirror } from "./fixtures/legacy-mirror.mjs";
import { rowMissed, makePassOfRow, flatMissed, MEMBER_FACT } from "./fixtures/legacy-miss.mjs";
import { isApplyingGM } from "./fixtures/legacy-gm.mjs";
import { isActiveGM } from "../lib/election.mjs";
import { shareStatus } from "../known-core.mjs";

test("ties-12 mirror: the dialog's resolve(box, seeded, mineNow, revNow, prevMine)", () => {
  const cases = [
    ["typed text into a blank box", ["new words", "", "mine", "rev", "mine-before"]],
    ["typed text into a seeded box", ["new words", "their old", "mine", "their now", "mine-before"]],
    ["untouched seeded box (their text stands, as it reads NOW)", ["their old", "their old", "mine", "their now", "mine-before"]],
    ["seeded box emptied (re-link)", ["", "their old", "mine", "their now", "mine-before"]],
    ["blank box, rev blank (linked)", ["", "", "mine", "", "mine-before"]],
    ["blank box, rev = prevMine (linked)", ["", "", "mine", "mine-before", "mine-before"]],
    ["blank box, rev = prevMine modulo whitespace", ["", "", "mine", "  mine-before ", "mine-before"]],
    ["blank box, rev diverged behind our back", ["", "", "mine", "their own", "mine-before"]],
    ["whitespace-only typed into a blank box", ["   ", "", "mine", "their own", "mine-before"]],
    ["whitespace-only typed over a seeded box", ["   ", "their old", "mine", "their now", "mine-before"]],
    ["undefined box and seed", [undefined, undefined, "mine", "", undefined]],
  ];
  pinJSON("oracle-mirror-resolve", cases.map(([label, args]) => ({ label, args, out: resolve(...args) })), import.meta.url);
  assert.deepEqual(resolve("", "", "m", "", "p"), { value: "m", followed: true });
});

test("ties-12 mirror: linked(theirs, prevMine)", () => {
  const rows = [["", "x"], ["  ", "x"], ["x", "x"], [" x ", "x"], ["y", "x"], [null, null], ["x", null]];
  pinJSON("oracle-mirror-linked", rows.map(args => ({ args, out: linked(...args) })), import.meta.url);
});

test("ties-12 mirror: the relay's fill-blanks rule (null = no write)", () => {
  const mine = { word: "debtor", notes: "owes us" };
  const rows = [
    ["both blank", { word: "", notes: "" }],
    ["word blank", { word: " ", notes: "theirs" }],
    ["notes blank", { word: "theirs", notes: "" }],
    ["both written", { word: "theirs", notes: "their notes" }],
    ["already equal", { word: "debtor", notes: "owes us" }],
  ];
  pinJSON("oracle-mirror-relay", rows.map(([label, rev]) => ({ label, rev, out: relayFill(rev, mine) })), import.meta.url);
});

test("ties-12 mirror: setTie's force-mirror — same name, different contract (overwrites, never seeds)", () => {
  const prev = { word: "their own", notes: "their paragraph", stance: 2, strength: 1 };
  const rows = [
    ["notes omitted keeps prev", forceMirror(prev, { reverseWord: "rival", reverseStance: -1, strength: 4 })],
    ["notes given overwrites", forceMirror(prev, { reverseWord: "rival", reverseStance: -1, reverseNotes: "mine now", strength: 4 })],
    ["no prev row", forceMirror(null, { reverseWord: "rival", reverseStance: 0, strength: 3 })],
  ];
  pinJSON("oracle-mirror-force", rows.map(([label, out]) => ({ label, out })), import.meta.url);
});

test("ties-13 miss: rowMissed / passOfRow / flatMissed / shareStatus over the 12-row matrix", () => {
  const passOfRow = makePassOfRow({
    rows: [{ id: "f1", dc: 14 }],
    describeAttribute: id => ({ dc: id === "guild" ? 15 : undefined }),
    concealmentFor: () => 2,
  });
  const rows = [
    ["legacy no-pass, total below dc", { total: 9, text: "x", delivered: 1 }],
    ["legacy no-pass, total at dc", { total: 14, text: "x", delivered: 1 }],
    ["legacy no-pass, total above dc", { total: 18, text: "x", delivered: 1 }],
    ["pass: true", { pass: true, total: 3, text: "x", delivered: 1 }],
    ["pass: false", { pass: false, total: 20, text: "x", delivered: 1 }],
    ["share { from, prior }", { from: "gm", prior: { pass: false, total: 2 }, total: null, text: "told", delivered: 1 }],
    ["total: null (GM tell)", { total: null, text: "told", delivered: 1 }],
    ["total: null, nothing written", { total: null, text: "", delivered: null }],
    ["dc non-number", { total: 9, text: "x", delivered: 1, dcOverride: "high" }],
    ["rec null", null],
    ["fractional total rounds up to the dc", { total: 13.5, text: "x", delivered: 1 }],
    ["held (undelivered) legacy pass", { total: 18, text: "x", delivered: null }],
  ];
  const out = rows.map(([label, rec]) => {
    const dc = rec?.dcOverride ?? 14;
    const r = rec ? { ...rec } : null;
    if (r) delete r.dcOverride;
    return {
      label,
      rowMissed: { lore: rowMissed({ ns: "lore", dc }, r), kind: rowMissed({ ns: "kind", dc }, r ? { ...r, tier: 15 } : r) },
      passOfRow: r ? { lore: passOfRow({ ns: "lore", fact: "f1" }, r), member: passOfRow({ ns: "attr", subject: "guild", fact: MEMBER_FACT }, r), kind: passOfRow({ ns: "kind", fact: "kind" }, { ...r, tier: 20 }) } : null,
      flatMissed: flatMissed(r, dc),
      shareStatus: { lore: shareStatus({ belief: r, dc }), ident: shareStatus({ belief: r, ident: true }), kind: shareStatus({ belief: r ? { ...r, tier: 10 } : r, kind: true }) },
    };
  });
  pinJSON("oracle-miss-matrix", out, import.meta.url);
});

test("ties-38 gm: isApplyingGM truth table, and the kit's isActiveGM beside it (they differ only where a non-GM is the active GM)", () => {
  const rows = [];
  for (const isGM of [true, false]) {
    for (const active of ["self", "other", null]) {
      const user = { id: "me", isGM };
      const activeGM = active === null ? null : { id: active === "self" ? "me" : "them", isSelf: active === "self" };
      const game = { user, users: { activeGM } };
      rows.push({ isGM, activeGM: active, legacy: isApplyingGM(game), kit: isActiveGM({ g: { game } }) });
    }
  }
  pinJSON("oracle-gm", rows, import.meta.url);
  assert.deepEqual(rows.filter(r => r.legacy !== r.kit).map(r => [r.isGM, r.activeGM]), [[false, "self"]]);
});
