/**
 * Final code review (ties-ui-ACC-6): the Attribute Review's "refused rather than saved over" only
 * held for changes this tab had already received. A write from another GM tab (the MCP bridge)
 * still in flight — built on the registry as it was before Joe's save — landed on top of his save
 * and silently undid it, and nothing told the review window.
 * Ruling [declared]: every registry write stores a version stamp `{ rev: n+1, by: socketId }`. After
 * a write settles the writer re-reads; if another client's stamp landed on top (a rev no newer than
 * its own — that client never saw the write), it re-applies its own field patch ONCE onto the fresh
 * registry, and the review window flags the row stale if the same field moved. One pattern for
 * every registry writer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const KEY = "pentaryn-ties.attributes";
const ME = "socket-gm-1";
const BRIDGE = "socket-bridge-1";

const F = await bootWorld({
  settings: {
    [KEY]: [
      { id: "city", title: "Vel", category: "City", dc: 14 },
      { id: "dock", title: "Dockward", category: "District", dc: 12 },
    ],
  },
});
const At = await import("../attributes.mjs");
const { AttributeReview } = await import("../review-ui.mjs");

const raw = () => game.settings.get("pentaryn-ties", "attributes");
const stampOf = list => list.find(x => x && typeof x === "object" && !("id" in x) && "rev" in x) ?? null;
const entry = id => At.registry().find(e => e.id === id);

/**
 * Another GM tab's write: built on `base` (the registry as that tab last saw it), stamped from
 * `base`'s rev, and broadcast to this tab as Foundry does — the value changes, then updateSetting.
 */
async function bridgeWrite(base, change, { rev } = {}) {
  const entries = base.filter(x => x && typeof x === "object" && "id" in x).map(e => structuredClone(e));
  change(entries);
  const n = rev ?? (stampOf(base)?.rev ?? 0) + 1;
  await game.settings.set("pentaryn-ties", "attributes", [...entries, { stamp: "registry", rev: n, by: BRIDGE }]);
  F.fire("updateSetting", { key: KEY }, {});
  await settle(new Promise(r => setTimeout(r, 0)));
}
const ownWrites = mark => F.calls.slice(mark).filter(c => c.op === "settings.set" && c.id === KEY);

test("ties-ui-ACC-6 every registry write stores { rev: n+1, by: socketId }", async () => {
  const before = stampOf(raw())?.rev ?? 0;
  const out = await At.updateAttribute("dock", { dc: 13 });
  assert.equal(out.ok, true);
  const s = stampOf(raw());
  assert.ok(s, "the stored registry carries a stamp");
  assert.equal(s.rev, before + 1);
  assert.equal(s.by, ME);
  assert.ok(!At.registry().some(e => e.id === "" || "rev" in e), "the stamp is never read back as an entry");
});

test("ties-ui-ACC-6 a bridge write in flight lands on top: Joe's field is re-applied once, the bridge's change is kept", async () => {
  const base = structuredClone(raw()); // what the bridge tab last saw
  const res = await At.reviewedUpdate("city", { dc: 18 });
  assert.equal(res.ok, true);
  const mark = F.calls.length;
  await bridgeWrite(base, list => (list.find(e => e.id === "city").category = "Port"));
  assert.equal(entry("city").category, "Port", "the bridge's change stands");
  assert.equal(entry("city").dc, 18, "Joe's save is re-applied, not lost");
  assert.equal(ownWrites(mark).length, 2, "the bridge's write and ONE re-apply");
  const s = stampOf(raw());
  assert.equal(s.by, ME);
  assert.equal(s.rev, stampOf(base).rev + 2, "the re-apply is stamped on top of the bridge's rev");

  // once: a second stale bridge write does not trigger another re-apply
  const mark2 = F.calls.length;
  await bridgeWrite(base, list => (list.find(e => e.id === "city").title = "Vel Port"));
  assert.equal(ownWrites(mark2).length, 1, "only the bridge's write — no second re-apply");
});

test("ties-ui-ACC-6 a write built on ours (a newer rev) is not a clobber: nothing is re-applied", async () => {
  await At.reviewedUpdate("dock", { dc: 15 });
  const mine = structuredClone(raw());
  const mark = F.calls.length;
  await bridgeWrite(mine, list => (list.find(e => e.id === "dock").category = "Quarter"));
  assert.equal(ownWrites(mark).length, 1, "only the bridge's write");
  assert.equal(entry("dock").dc, 15);
  assert.equal(entry("dock").category, "Quarter");
});

test("ties-ui-ACC-6 the same field moved underneath: the bridge's value stands and the review row is flagged stale", async () => {
  const rv = new AttributeReview();
  rv.attachHooks();
  try {
    const e = entry("city");
    rv.base.set("city", { title: e.title, category: e.category, dc: e.dc, lore: [] });
    const base = structuredClone(raw());
    await rv.saveField("city", "dc", 22, null);
    assert.equal(entry("city").dc, 22, "precondition: Joe's save landed");
    assert.equal(rv.stale.has("city"), false);
    const mark = F.calls.length;
    await bridgeWrite(base, list => (list.find(x => x.id === "city").dc = 30));
    assert.equal(entry("city").dc, 30, "the bridge moved the same field: its value is not overwritten");
    assert.equal(ownWrites(mark).length, 1, "nothing re-applied over it");
    assert.equal(rv.stale.has("city"), true, "the review window flags the row stale");
  } finally {
    rv._onClose({});
  }
});

test("ties-ui-ACC-6 one pattern for every writer: a create clobbered by the bridge is re-applied", async () => {
  const base = structuredClone(raw());
  const made = await At.createAttribute("Salt Guild", { category: "Guild" });
  assert.equal(made.ok, true);
  await bridgeWrite(base, list => (list.find(e => e.id === "dock").title = "Dockward Quay"));
  assert.ok(entry("saltguild"), "the created entry is back");
  assert.equal(entry("dock").title, "Dockward Quay", "and the bridge's rename stands");
});
