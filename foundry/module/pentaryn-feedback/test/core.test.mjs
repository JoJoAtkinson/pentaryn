// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
import * as core from "../feedback-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const { LIMITS } = core;

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  assert.equal(typeof core.validateReport, "function");
});

test("VERSION === module.json version; ids agree", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.NS, manifest.flags.pentaryn.namespace);
  assert.equal(core.CSS, manifest.flags.pentaryn.cssPrefix);
  assert.equal(core.FLAG_SCOPE, manifest.flags.pentaryn.flagScope);
  assert.equal(core.CONTRACT, `${core.MODULE}/api@1`);
});

test("every HOOKS row is named pentaryn-<short>.* (or carries a legacyName with an until)", () => {
  for (const [key, row] of Object.entries(core.HOOKS)) {
    assert.ok(row.name.startsWith(`${core.MODULE}.`), key);
    if (row.legacyName) assert.ok(row.until, `${key}: legacyName needs until`);
  }
  assert.deepEqual(Object.keys(core.HOOKS), ["filed", "queued"]);
});

test("CATEGORIES: exactly bug, defect, feature, in that screen order; bug is the default", () => {
  assert.deepEqual(core.CATEGORY_KEYS, ["bug", "defect", "feature"]);
  assert.equal(core.DEFAULT_CATEGORY, "bug");
  assert.equal(core.CATEGORIES[0].key, core.DEFAULT_CATEGORY, "the default is first on screen");
  for (const c of core.CATEGORIES) {
    assert.equal(c.label, `PENTARYN_FEEDBACK.Category.${c.key}.Label`);
    assert.equal(c.help, `PENTARYN_FEEDBACK.Category.${c.key}.Help`);
    assert.match(c.icon, /^fa-solid fa-/);
  }
  assert.equal(core.categoryOf("nonsense").key, "bug");
  assert.equal(core.categoryOf("feature").key, "feature");
});

test("draftFrom: unknown or missing category → bug; text trimmed and capped", () => {
  const table = [
    [{ category: "defect", text: "  works oddly  " }, { category: "defect", text: "works oddly" }],
    [{ category: "BUG", text: "x" }, { category: "bug", text: "x" }],
    [{ text: "no category" }, { category: "bug", text: "no category" }],
    [{}, { category: "bug", text: "" }],
    [undefined, { category: "bug", text: "" }],
    [{ category: "feature", text: 42 }, { category: "feature", text: "42" }],
  ];
  for (const [input, want] of table) assert.deepEqual(core.draftFrom(input), want, JSON.stringify(input));
  const long = core.draftFrom({ text: "y".repeat(LIMITS.text + 50) }).text;
  assert.equal(long.length, LIMITS.text);
  assert.ok(long.endsWith("…"));
});

test("parseBugCommand: /bug with and without text; anything else is null", () => {
  const table = [
    ["/bug", { text: "" }],
    ["/bug   ", { text: "" }],
    ["/bug the door will not open", { text: "the door will not open" }],
    ["  /BUG Loot all\nfailed", { text: "Loot all\nfailed" }],
    ["/bugs everywhere", null],
    ["hello /bug", null],
    ["/roll 1d20", null],
    [null, null],
  ];
  for (const [input, want] of table) assert.deepEqual(core.parseBugCommand(input), want, JSON.stringify(input));
});

test("clip: caps with an ellipsis; null and undefined → empty; non-strings stringified", () => {
  assert.equal(core.clip("abcdef", 4), "abc…");
  assert.equal(core.clip("abcd", 4), "abcd");
  assert.equal(core.clip(null), "");
  assert.equal(core.clip(undefined), "");
  assert.equal(core.clip(12345, 3), "12…");
  assert.equal(core.clip("x".repeat(500)).length, LIMITS.field);
});

test("redact: secrets, bearer tokens and URL query strings; ordinary text untouched", () => {
  const table = [
    ["password=hunter2 then", "password=[redacted] then"],
    ["secret: 'abc def'", "secret: [redacted]"],
    ["token=abcdefghijklmnop", "token=[redacted]"],
    ["Token: Goblin is hidden", "Token: Goblin is hidden"],          // short value: a word, not a credential
    ["sessionid key=0123456789abcdef!", "sessionid key=[redacted]!"],
    ["Authorization: Bearer abc.def", "Authorization: [redacted] [redacted]"],
    ["GET https://host.example/join?invite=XYZ done", "GET https://host.example/join?[redacted] done"],
    ["at f (http://h/modules/x.mjs?v=2:10:5)", "at f (http://h/modules/x.mjs?[redacted]:10:5)"],
    ["what? happened", "what? happened"],
    ["Cannot read properties of undefined (reading 'x')", "Cannot read properties of undefined (reading 'x')"],
  ];
  for (const [input, want] of table) assert.equal(core.redact(input, 300), want, input);
  // clip first: the regex never sees more than the cap
  assert.equal(core.redact("a".repeat(1000), 10).length, 10);
});

test("stackHead: first 4 non-empty lines, each redacted and capped", () => {
  const stack = ["Error: boom", "   at a (x.mjs:1:2)", "", "at b (http://h/y.mjs?token=abcdefghijklmnopq:3:4)", "at c", "at d", "at e"].join("\n");
  assert.deepEqual(core.stackHead(stack).split("\n"), ["Error: boom", "at a (x.mjs:1:2)", "at b (http://h/y.mjs?[redacted]:3:4)", "at c"]);
  assert.equal(core.stackHead(undefined), "");
  assert.equal(core.stackHead("x".repeat(500)).length, LIMITS.stackLine);
});

test("messageOf: errors, strings, objects, nullish", () => {
  assert.equal(core.messageOf(new TypeError("bad")), "bad");
  assert.equal(core.messageOf("plain"), "plain");
  assert.equal(core.messageOf({ a: 1 }), '{"a":1}');
  assert.equal(core.messageOf(null), "null");
  assert.equal(core.messageOf(undefined), "undefined");
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(core.messageOf(cyclic), "[object Object]");
});

test("historyMax: clamps to 20..1000; junk is the default 200", () => {
  const table = [[200, 200], [5, 20], [5000, 1000], [333.4, 333], ["150", 150], [null, 200], ["", 200], ["x", 200], [undefined, 200]];
  for (const [input, want] of table) assert.equal(core.historyMax(input), want, String(input));
});

test("ringPush keeps the newest max entries, oldest dropped from the front", () => {
  const ring = [];
  for (let i = 1; i <= 7; i++) core.ringPush(ring, { i }, 3);
  assert.deepEqual(ring.map(e => e.i), [5, 6, 7]);
  core.ringPush(ring, { i: 8 }, 5);                // a larger cap later keeps everything
  assert.deepEqual(ring.map(e => e.i), [5, 6, 7, 8]);
  core.ringPush(ring, { i: 9 }, 2);                // a smaller cap trims at the next push
  assert.deepEqual(ring.map(e => e.i), [8, 9]);
});

test("isDupError: the same message within 1 s is a duplicate; later or different is not", () => {
  const ring = [{ t: 1000, message: "boom" }, { t: 1500, message: "other" }];
  assert.equal(core.isDupError(ring, { t: 1900, message: "boom" }), true);
  assert.equal(core.isDupError(ring, { t: 2100, message: "boom" }), false);
  assert.equal(core.isDupError(ring, { t: 1600, message: "new" }), false);
  assert.equal(core.isDupError([], { t: 1, message: "x" }), false);
});

test("errorEntry: message capped and redacted, stack head kept, location optional", () => {
  const e = core.errorEntry({ t: 5, source: "hooks", message: "x".repeat(400), stack: "a\nb\nc\nd\ne", location: "Hooks.#call" });
  assert.equal(e.message.length, LIMITS.message);
  assert.equal(e.stack, "a\nb\nc\nd");
  assert.equal(e.location, "Hooks.#call");
  assert.deepEqual(core.errorEntry({ t: 1, source: "window", message: "m" }), { t: 1, source: "window", message: "m" });
});

test("changedKeys: top-level and system.* / flags.* one level, never values, at most 8", () => {
  assert.deepEqual(core.changedKeys({ _id: "x", name: "N", system: { attributes: { hp: 3 } }, flags: { dnd5e: {} } }),
    ["name", "system.attributes", "flags.dnd5e"]);
  assert.deepEqual(core.changedKeys(null), []);
  const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i]));
  assert.equal(core.changedKeys(many).length, LIMITS.keys);
});

test("chatEntry: flavor stripped of HTML and capped; first roll total; whisper is a boolean", () => {
  assert.deepEqual(core.chatEntry({ id: "m1", timestamp: 10, flavor: "<b>Longsword</b> — Attack", rolls: [{ total: 17 }], whisper: [] }),
    { t: 10, id: "m1", flavor: "Longsword — Attack", total: 17, whisper: false });
  assert.deepEqual(core.chatEntry({ id: "m2", whisper: ["gm"] }), { t: null, id: "m2", flavor: "", total: null, whisper: true });
});

test("userFields: plain user identity, character optional", () => {
  assert.deepEqual(core.userFields({ id: "u1", name: "Caven", role: 1, isGM: false, character: { id: "a1", name: "Caven" } }),
    { id: "u1", name: "Caven", role: 1, isGM: false, character: { id: "a1", name: "Caven" } });
  assert.deepEqual(core.userFields({ id: "g", name: "GM", role: 4, isGM: true }),
    { id: "g", name: "GM", role: 4, isGM: true, character: null });
});

const ID = "k3Yx9Qp2LmN7aB4c";
const sample = (extra = {}) => core.buildReport({
  id: ID, t: Date.UTC(2026, 9, 11, 19, 2, 11),
  draft: { category: "bug", text: "Loot all did nothing" },
  snapshot: { user: { id: "u1", name: "Caven" }, world: { id: "pentaryn" }, windows: [], modules: [{ id: "pentaryn-feedback", version: "0.1.0" }] },
  actions: [{ t: 1, kind: "click", action: "lootAll" }],
  errors: [{ t: 2, source: "hooks", message: "boom" }],
  ...extra,
});

test("buildReport: schema v1 with every key in file order", () => {
  const r = sample();
  assert.deepEqual(Object.keys(r), [...core.REPORT_KEYS]);
  assert.equal(r.schemaVersion, core.SCHEMA_VERSION);
  assert.equal(r.iso, "2026-10-11T19:02:11.000Z");
  assert.equal(r.status, "open");
  assert.deepEqual(r.history, []);
  assert.deepEqual(r.module, { id: core.MODULE, version: core.VERSION });
  assert.equal(sample({ draft: { category: "wat", text: "t" } }).category, "bug");
});

test("buildReport: every snapshot section in a shape validateReport accepts; failures under sectionErrors", () => {
  const r = sample({ snapshot: { world: { error: "w broke" }, combat: { error: "c broke" }, chat: { error: "chat broke" }, windows: "junk", modules: null } });
  assert.equal(r.world, null);
  assert.equal(r.combat, null);
  assert.deepEqual([r.chat, r.windows, r.modules], [[], [], []]);
  assert.deepEqual(r.sectionErrors, { windows: "not a list (string)", chat: "chat broke", world: "w broke", combat: "c broke" });
  assert.equal(r.truncated, 0);
  assert.deepEqual(core.validateReport(r), { ok: true });
  assert.deepEqual(sample().sectionErrors, {});
  const n = core.normaliseReport({ ...r, sectionErrors: { chat: "x".repeat(900), evil: "y", world: 3 }, truncated: -4 }, { user: {} });
  assert.deepEqual(Object.keys(n.sectionErrors), ["chat"]);
  assert.equal(n.sectionErrors.chat.length, LIMITS.message);
  assert.equal(n.truncated, 0);
});

test("validateReport: a good report passes; each broken field is named", () => {
  assert.deepEqual(core.validateReport(sample()), { ok: true });
  const broken = [
    [null, /not an object/],
    [[], /not an object/],
    [{ ...sample(), schemaVersion: 2 }, /schemaVersion/],
    [{ ...sample(), id: "short" }, /id must be 16/],
    [{ ...sample(), id: "../../etc/passwd" }, /id must be 16/],
    [{ ...sample(), t: "now" }, /t must be/],
    [{ ...sample(), category: "rant" }, /category must be one of bug, defect, feature/],
    [{ ...sample(), text: "   " }, /text is empty/],
    [{ ...sample(), text: "x".repeat(LIMITS.text + 1) }, /over 4000/],
    [{ ...sample(), actions: "lots" }, /actions must be a list/],
    [{ ...sample(), actions: Array.from({ length: 3000 }, (_, i) => ({ t: i, kind: "click", text: "x".repeat(100) })) }, /bytes; the cap is 262144/],
  ];
  for (const [report, want] of broken) {
    const v = core.validateReport(report);
    assert.equal(v.ok, false);
    assert.match(v.reason, want);
  }
});

test("normaliseReport: the sender's user wins over the payload; status reset; unknown keys dropped; strings re-capped", () => {
  const spoof = {
    ...sample(), user: { id: "gm", name: "Gamemaster", isGM: true, role: 4 },
    status: "resolved", history: [{ status: "resolved" }], evil: "<script>", receivedAt: 1,
    text: "t", actions: [{ t: 1, kind: "click", text: "z".repeat(500), nested: { deep: { deeper: 1 } } }],
  };
  const out = core.normaliseReport(spoof, { user: { id: "u1", name: "Caven", role: 1, isGM: false }, receivedAt: 99 });
  assert.deepEqual(out.user, { id: "u1", name: "Caven", role: 1, isGM: false, character: null });
  assert.equal(out.status, "open");
  assert.deepEqual(out.history, []);
  assert.equal(out.receivedAt, 99);
  assert.equal("evil" in out, false);
  assert.deepEqual(Object.keys(out), [...core.REPORT_KEYS]);
  assert.equal(out.actions[0].text.length, LIMITS.field);
  assert.deepEqual(out.actions[0].nested, { deep: { deeper: 1 } });
  assert.equal(core.normaliseReport({ ...sample(), category: "x" }, { user: {} }).category, "bug");
});

test("reportPath / worldDir: Data-relative, refuses unsafe segments", () => {
  assert.equal(core.reportPath("pentaryn", ID), `pentaryn-feedback/pentaryn/${ID}.json`);
  assert.equal(core.worldDir("space-journey"), "pentaryn-feedback/space-journey");
  for (const [w, id] of [["../x", ID], ["pentaryn", "a/b"], ["", ID], ["pentaryn", null]]) {
    assert.throws(() => core.reportPath(w, id), /BAD_ARGS/);
  }
});

test("queueTrim: the ids to drop so at most max remain, oldest first", () => {
  const q = Object.fromEntries([5, 1, 4, 2, 3, 6, 7].map(n => [`id${n}`, { t: n }]));
  assert.deepEqual(core.queueTrim(q, 5), ["id1", "id2"]);
  assert.deepEqual(core.queueTrim(q, 10), []);
  assert.deepEqual(core.queueTrim({}, 5), []);
  assert.deepEqual(core.queueTrim(undefined), []);
  assert.equal(LIMITS.queueMax, 5);
});

test("nextStatus: the transition table", () => {
  const S = core.STATUSES;
  assert.deepEqual(S, ["open", "triaged", "resolved", "wontfix"]);
  const allowed = new Set([
    "open→open", "open→triaged", "open→resolved", "open→wontfix",
    "triaged→triaged", "triaged→resolved", "triaged→wontfix",
    "resolved→resolved", "resolved→wontfix",
    "wontfix→wontfix", "wontfix→resolved",
  ]);
  for (const cur of S) {
    for (const req of S) {
      const r = core.nextStatus(cur, req);
      assert.equal(r.ok, allowed.has(`${cur}→${req}`), `${cur}→${req}`);
      if (!r.ok) assert.match(r.reason, /needs force/);
      assert.equal(core.nextStatus(cur, req, { force: true }).ok, true, `${cur}→${req} with force`);
    }
  }
  assert.match(core.nextStatus("open", "done").reason, /status must be one of/);
  assert.match(core.nextStatus("weird", "open").reason, /unknown/);
});

test("applyStatus: appends history; an identical consecutive status+note is one line; refusals pass through", () => {
  const r0 = sample();
  const r1 = core.applyStatus(r0, { status: "triaged", note: "repro'd", by: "gm:Joe", t: 10 });
  assert.equal(r1.ok, true);
  assert.equal(r1.report.status, "triaged");
  assert.deepEqual(r1.report.history, [{ t: 10, status: "triaged", note: "repro'd", by: "gm:Joe" }]);
  assert.deepEqual(r0.history, [], "the input is not mutated");
  const again = core.applyStatus(r1.report, { status: "triaged", note: "repro'd", by: "llm", t: 11 });
  assert.equal(again.report.history.length, 1);
  const note = core.applyStatus(r1.report, { status: "triaged", note: "more detail", by: "llm", t: 12 });
  assert.equal(note.report.history.length, 2);
  const done = core.applyStatus(note.report, { status: "resolved", note: "fixed in 0.2", by: "llm", t: 13 });
  assert.equal(done.report.status, "resolved");
  assert.equal(core.applyStatus(done.report, { status: "open", by: "llm", t: 14 }).ok, false);
  const reopened = core.applyStatus(done.report, { status: "open", by: "llm", t: 14, force: true });
  assert.equal(reopened.report.status, "open");
  assert.equal(reopened.report.history.at(-1).status, "open");
});

test("summaryOf: one listing row", () => {
  assert.deepEqual(core.summaryOf(core.normaliseReport(sample({ draft: { category: "feature", text: `a  new\n tab ${"x".repeat(80)}` } }), { user: { name: "Caven" } })), {
    id: ID, t: Date.UTC(2026, 9, 11, 19, 2, 11), category: "feature", status: "open", user: "Caven", world: "pentaryn",
    text60: `a new tab ${"x".repeat(49)}…`,
  });
});
