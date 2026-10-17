// Party: who counts (recordOf / partyRecords), where they land (landingPlaces), the GM's Teleport
// party (confirm, same scene, cross scene), lookAt, arrivals stepping off an occupied square, and
// summons following a PC through a native teleport (deleteToken → bringFollowers).
// Characterisation of 0.4.4: unchanged code.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, console$, MODULE, P1, P2, GM } from "./fixtures/world.mjs";

const { F, S, W } = await boot();
await W.tick();

const own = (...ids) => Object.fromEntries([["default", 0], ...ids.map(id => [id, 3])]);
W.actor({ id: "CAV", name: "Caven", type: "character", ownership: own(P1, GM) });
W.actor({ id: "MAR", name: "Marrith", type: "character", ownership: own(P2) });
W.actor({ id: "SKEL", name: "Skeleton", ownership: own(P1), flags: { dnd5e: { summon: { origin: "Actor.CAV.Item.animate" } } }, folders: ["Summons"] });
W.actor({ id: "EYE", name: "Arcane Eye", flags: { dnd5e: { summon: { origin: "Actor.MAR.Item.eye" } } } });
W.actor({ id: "STEED", name: "Steed", ownership: own(P1, P2) });
W.actor({ id: "PILE", name: "Loot", ownership: own(P1) });
W.actor({ id: "MARK", name: "Marker · 1", ownership: own(P1, P2) });
W.actor({ id: "CROWD", name: "Villager", ownership: own(P1), folders: ["Crowd — Folk", "NPCs"] });
W.actor({ id: "HANDLE", name: "Circle of Death (Caven)", ownership: own(P1, P2) });
W.actor({ id: "HANDLEA", name: "Spirit Guardians (Caven)", ownership: own(P1, P2), flags: { "pentaryn-aoe": { handleActor: true } } });
W.actor({ id: "GUARD", name: "Guard" });
W.actor({ id: "FORM", name: "Wolf (Caven)", ownership: own(P1), flags: { dnd5e: { isPolymorphed: true } } });
game.itempiles = { API: { isValidItemPile: a => a.id === "PILE" } };

let seq = 0;
/** A hall with every kind of token, and a gate region leading to a fresh pit. */
function hall({ tokens = null } = {}) {
  const k = ++seq;
  const pit = W.scene({
    id: `Pit${k}`, name: "Drow City — Fighting Pit (set-piece)", navName: "Fighting Pit",
    regions: [{ id: `PitGate${k}`, name: "Pit gate", bounds: { x: 1000, y: 500, width: 100, height: 100 }, flags: { [MODULE]: { title: "The Fighting Pit" } } }],
  });
  const all = [
    { id: `tCav${k}`, name: "Caven", actorId: "CAV", actorLink: true, x: 100, y: 200 },
    { id: `tMar${k}`, name: "Marrith", actorId: "MAR", actorLink: true, x: 200, y: 200 },
    { id: `tSkel${k}`, name: "Skeleton", actorId: "SKEL", x: 300, y: 200 },
    { id: `tEye${k}`, name: "Arcane Eye", actorId: "EYE", x: 400, y: 200 },
    { id: `tSteed${k}`, name: "Steed", actorId: "STEED", x: 500, y: 200, width: 2, height: 2 },
    { id: `tPile${k}`, name: "Loot", actorId: "PILE", x: 600, y: 200 },
    { id: `tMark${k}`, name: "Marker · 1", actorId: "MARK", x: 700, y: 200 },
    { id: `tCrowd${k}`, name: "Villager (crowd)", actorId: "CROWD", x: 800, y: 200 },
    { id: `tHandle${k}`, name: "Circle of Death (Caven)", actorId: "HANDLE", x: 900, y: 200, flags: { "pentaryn-aoe": { handle: true } } },
    { id: `tHandleA${k}`, name: "Spirit Guardians (Caven)", actorId: "HANDLEA", x: 1000, y: 200 },
    { id: `tGuard${k}`, name: "Guard", actorId: "GUARD", x: 1100, y: 200 },
    { id: `tGhost${k}`, name: "Ghost", actorId: "NOBODY", x: 1200, y: 200 },
  ];
  const s = W.scene({
    id: `Hall${k}`, name: "Great Hall",
    regions: [{ id: `Gate${k}`, name: "Gate", bounds: { x: 100, y: 200, width: 100, height: 100 }, behaviors: [{ id: `Bgate${k}`, destinations: [`Scene.Pit${k}.Region.PitGate${k}`] }] }],
    tokens: tokens ? tokens(k) : all,
  });
  return { s, pit, k, gate: s.regions.get(`Gate${k}`), pitGate: pit.regions.get(`PitGate${k}`), t: id => s.tokens.get(`${id}${k}`) };
}
const ops = n => W.callsSince(n, ["createEmbedded", "deleteEmbedded", "updateEmbedded", "update", "notify", "DialogV2.confirm", "scene.view", "pullUsers", "animatePan"]);
const strip = r => { const { doc, ...rest } = r; void doc; return rest; };
/** Await `p` while spreadArrival's claim (portals-async-1)'s 750 ms settle timer (mocked) is advanced. */
async function settle(p) {
  let done = false;
  p.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 20 && !done; i++) { await W.flush(); mock.timers.tick(750); }
  return p;
}

/* ── who counts ───────────────────────────────────────────────────────── */

test("recordOf: the plain record per token (golden/records.json); game.users.filter once per record", t => {
  const H = hall();
  const filter = t.mock.method(game.users, "filter");
  const records = H.s.tokens.map(S.recordOf);
  assert.equal(filter.mock.callCount(), records.length, "-36: once per record, not once per pass");
  assert.equal(records[0].doc, H.t("tCav"));
  pinJSON("records", records.map(strip), import.meta.url);
});

test("recordOf: an aoe handle flagged only on its actor (handleActor) is a handle", () => {
  // KNOWN: (-43) recordOf reads token.handle || actor.handleActor; spreadArrival reads token.handle only.
  const H = hall();
  assert.equal(S.recordOf(H.t("tHandleA")).handle, true);
  assert.equal(S.recordOf(H.t("tHandle")).handle, true);
});

test("recordOf: item piles off (no module) → pile false; a throwing isValidItemPile → pile false", () => {
  const H = hall();
  const saved = game.itempiles;
  delete game.itempiles;
  assert.equal(S.recordOf(H.t("tPile")).pile, false);
  game.itempiles = { API: { isValidItemPile: () => { throw new Error("not ready"); } } };
  assert.equal(S.recordOf(H.t("tPile")).pile, false);
  game.itempiles = saved;
});

test("folderNames: the folder chain innermost first; none → []", () => {
  assert.deepEqual(S.folderNames(game.actors.get("CROWD")), ["Crowd — Folk", "NPCs"]);
  assert.deepEqual(S.folderNames(game.actors.get("GUARD")), []);
  assert.deepEqual(S.folderNames(null), []);
});

test("partyRecords: PCs first, then owned or summoned; never piles, markers, crowd, handles or GM NPCs", () => {
  const H = hall();
  assert.deepEqual(S.partyRecords(H.s).map(r => r.name), ["Caven", "Marrith", "Skeleton", "Arcane Eye", "Steed"]);
});

/* ── where they land ──────────────────────────────────────────────────── */

test("landingPlaces: walls that block movement (closed doors too) cut squares off; standing tokens are skipped (golden)", () => {
  const dest = W.scene({
    id: "Land", name: "Land",
    walls: [
      { id: "wRight", move: 20, door: 0, ds: 0, c: [250, -1000, 250, 1000] },
      { id: "wSight", move: 0, door: 0, ds: 0, c: [-1000, 250, 1000, 250] },
      { id: "wOpen", move: 20, door: 1, ds: 1, c: [50, -1000, 50, 1000] },
      { id: "wShut", move: 20, door: 1, ds: 0, c: [-1000, 50, 1000, 50] },
    ],
    tokens: [{ id: "Stander", x: 100, y: 200 }],
  });
  const toks = [1, 2, 3, 4].map(i => W.token(W.scene({ id: `From${i}`, name: "From" }), { id: `m${i}`, x: 0, y: 0 }));
  toks.push(W.token(W.scene({ id: "FromBig", name: "From" }), { id: "mBig", x: 0, y: 0, width: 2, height: 2 }));
  const n = F.calls.length;
  const places = S.landingPlaces(dest, toks, 150, 150);
  pinJSON("landing", { places, snaps: W.callsSince(n, ["getSnappedPoint"]).map(c => [c.x, c.y, c.mode]) }, import.meta.url);
  assert.equal(places.some(p => p.x === 100 && p.y === 200), false, "the stander's square");
});

test("landingPlaces with party records: each follower lands beside its PC", () => {
  const H = hall();
  const party = S.partyRecords(H.s);
  const toks = party.map(r => r.doc);
  const places = S.landingPlaces(H.pit, toks, 1050, 550, party);
  const by = Object.fromEntries(toks.map((t, i) => [t.name, places[i]]));
  const near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  assert.ok(near(by["Arcane Eye"], by.Marrith) <= 100);
  assert.ok(near(by.Skeleton, by.Caven) <= 100);
  pinJSON("landing-party", by, import.meta.url);
});

test("carryTo: create on the destination (keepId, landed positions), then delete from the source; empty → nothing", async () => {
  const H = hall();
  const toks = [H.t("tSkel"), H.t("tEye")];
  const n = F.calls.length;
  await S.carryTo(toks, H.pit, 1050, 550);
  assert.deepEqual(ops(n).map(c => [c.op, c.parent, c.ids, c.options]), [
    ["createEmbedded", H.pit.uuid, [`tSkel${H.k}`, `tEye${H.k}`], { keepId: true }],
    ["deleteEmbedded", H.s.uuid, [`tSkel${H.k}`, `tEye${H.k}`], {}],
  ]);
  assert.deepEqual([H.pit.tokens.get(`tSkel${H.k}`).x, H.pit.tokens.get(`tSkel${H.k}`).y], [1000, 500]);
  assert.equal(H.s.tokens.has(`tSkel${H.k}`), false);
  const m = F.calls.length;
  await S.carryTo([], H.pit, 0, 0);
  assert.deepEqual(F.calls.slice(m), []);
});

/* ── Teleport party ───────────────────────────────────────────────────── */

test("confirmParty: lists each record, followers 'lands beside <PC>' (golden/confirm-party.json); resolves the answer", async () => {
  const H = hall();
  const party = S.partyRecords(H.s);
  W.confirm = true;
  const n = F.calls.length;
  assert.equal(await S.confirmParty(party, "The <Pit>"), true);
  const call = W.callsSince(n, ["DialogV2.confirm"])[0];
  pinJSON("confirm-party", call, import.meta.url);
  assert.equal((call.content.match(/<li>/g) ?? []).length, 5);
  W.confirm = false;
  assert.equal(await S.confirmParty(party.slice(0, 1), "X"), false);
  assert.match(W.callsSince(n, ["DialogV2.confirm"])[1].content, /Move this token to/);
  W.confirm = true;
});

test("confirmParty: a closed/rejected dialog → false; the setting off → true without a dialog; nobody → warn, false either way", async () => {
  const H = hall();
  const party = S.partyRecords(H.s);
  W.confirm = "reject";
  assert.equal(await S.confirmParty(party, "X"), false);
  W.confirm = true;
  await game.settings.set(MODULE, "confirmPartyTeleport", false);
  let n = F.calls.length;
  assert.equal(await S.confirmParty(party, "X"), true);
  assert.equal(W.callsSince(n, ["DialogV2.confirm"]).length, 0);
  n = F.calls.length;
  assert.equal(await S.confirmParty([], "X"), false, "setting off: an empty party still stops [declared] (portals-edge-4)");
  assert.deepEqual(W.callsSince(n, ["notify", "DialogV2.confirm"]), [{ op: "notify", level: "warn", message: "Teleport party: nobody on this scene counts as the party." }]);
  await game.settings.set(MODULE, "confirmPartyTeleport", true);
  n = F.calls.length;
  assert.equal(await S.confirmParty([], "X"), false);
  assert.deepEqual(W.callsSince(n, ["notify", "DialogV2.confirm"]), [{ op: "notify", level: "warn", message: "Teleport party: nobody on this scene counts as the party." }]);
});

test("teleportParty, same scene: one teleport update (no animation) and the toast", async () => {
  const H = hall();
  const cell = W.region(H.s, { id: `Cell${H.k}`, name: "Cell", bounds: { x: 2000, y: 2000, width: 100, height: 100 }, flags: { [MODULE]: { title: "The Cell" } } });
  F.canvas.scene = H.s;
  const n = F.calls.length, l = F.logged.length;
  await S.teleportParty(cell, { confirm: false });
  const out = ops(n);
  assert.deepEqual(out.map(c => c.op), ["updateEmbedded", "notify"]);
  // [declared] portals-w3-1b: v14's displace waypoints (core's own region-teleport shape), not the
  // deprecated `teleport` option; each token's one waypoint is the square it lands on.
  assert.deepEqual(out[0].options, { animate: false, movement: Object.fromEntries(out[0].updates.map(u => [u._id, { waypoints: [{ x: u.x, y: u.y, action: "displace" }] }])) });
  assert.deepEqual(W.deprecationsSince(l), [], "no v14 compatibility warning");
  assert.deepEqual(out[0].updates.map(u => u._id), ["tCav", "tMar", "tSkel", "tEye", "tSteed"].map(i => `${i}${H.k}`));
  assert.equal(out[1].message, "5 party tokens moved to The Cell.");
  pinJSON("teleport-same-scene", out[0].updates, import.meta.url);
});

test("teleportParty, one token: singular toast; confirm on by default asks first; a cancel moves nothing", async () => {
  const H = hall({ tokens: k => [{ id: `tCav${k}`, name: "Caven", actorId: "CAV", actorLink: true, x: 100, y: 200 }] });
  const cell = W.region(H.s, { id: `Cell${H.k}`, name: "Cell", bounds: { x: 2000, y: 2000, width: 100, height: 100 } });
  F.canvas.scene = H.s;
  W.confirm = false;
  let n = F.calls.length;
  await S.teleportParty(cell);
  assert.deepEqual(ops(n).map(c => c.op), ["DialogV2.confirm"]);
  W.confirm = true;
  n = F.calls.length;
  await game.pentaryn.portals.teleportParty(cell);
  assert.deepEqual(ops(n).map(c => c.op), ["DialogV2.confirm", "updateEmbedded", "notify"]);
  assert.equal(ops(n)[2].message, "1 party token moved to Great Hall.");
});

// [declared] pins rebuild 2026-10-17 §2.2 / §7.7 (portals 0.7.0): the pull and the GM's own view now
// carry `{ level }` — the floor the party landed on, when it landed on one (here the pit's only level).
test("teleportParty, another scene: carry, pull the active players, view it, toast; returns { moved, cancelled } [declared D-P5]", async () => {
  const H = hall();
  F.canvas.scene = H.s;
  game.users.get(P2).active = false;
  const n = F.calls.length;
  const out = await S.teleportParty(H.pitGate, { confirm: false });
  game.users.get(P2).active = true;
  assert.deepEqual(out, { moved: 5, cancelled: false });
  const seen = ops(n);
  assert.deepEqual(seen.map(c => c.op), ["createEmbedded", "deleteEmbedded", "pullUsers", "scene.view", "notify"]);
  assert.deepEqual(seen[2].users, [P1]);
  assert.deepEqual(seen[2].options, { level: `${H.pit.id}Lvl0` }, "the party's one floor");
  assert.deepEqual(seen[3].options, { level: `${H.pit.id}Lvl0` }, "the GM's own view too");
  assert.equal(seen[4].message, "5 party tokens moved to The Fighting Pit.");
  assert.equal(F.canvas.scene, H.pit);
});

/** ROB-2: the GM's confirm dialog stays open while `during` runs (a token deleted mid-dialog). */
async function withDialog(during, fn) {
  const api = foundry.applications.api.DialogV2, real = api.confirm;
  api.confirm = async opts => { const ans = await real(opts); during(); return ans; };
  try { return await fn(); } finally { api.confirm = real; }
}

test("teleportParty, another scene: a token deleted while the confirm is open is dropped, not recreated [declared] (ROB-2)", async () => {
  const H = hall();
  F.canvas.scene = H.s;
  W.confirm = true;
  const n = F.calls.length;
  const out = await withDialog(() => H.s.tokens.delete(`tSkel${H.k}`), () => S.teleportParty(H.pitGate));
  assert.deepEqual(out, { moved: 4, cancelled: false });
  const seen = ops(n);
  assert.deepEqual(seen.map(c => c.op), ["DialogV2.confirm", "createEmbedded", "deleteEmbedded", "pullUsers", "scene.view", "notify"]);
  assert.deepEqual([seen[3].options, seen[4].options], [{ level: `${H.pit.id}Lvl0` }, { level: `${H.pit.id}Lvl0` }]);
  const ids = ["tCav", "tMar", "tEye", "tSteed"].map(i => `${i}${H.k}`);
  assert.deepEqual(seen[1].ids, ids);
  assert.deepEqual(seen[2].ids, ids);
  assert.equal(H.pit.tokens.get(`tSkel${H.k}`), undefined);
  assert.equal(seen[5].message, "4 party tokens moved to The Fighting Pit.");
});

/* ── pins rebuild 2026-10-17 (portals 0.7.0): §2.2 { level }, §2.5 / review R2 ─── */

test("teleportParty, another scene, the party lands on two floors: pull and view carry {} (no one floor to name)", async () => {
  const H = hall({ tokens: k => [{ id: `tCav${k}`, name: "Caven", actorId: "CAV", actorLink: true, x: 100, y: 200, level: "sharedLevel00001" },
    { id: `tMar${k}`, name: "Marrith", actorId: "MAR", actorLink: true, x: 200, y: 200 }] });
  // the pit has Caven's own level id too (single-level pairs share core's defaultLevel0000), so Caven keeps it and Marrith takes the initial one
  H.pit.levels.set("sharedLevel00001", { id: "sharedLevel00001", name: "Shared" });
  F.canvas.scene = H.s;
  const n = F.calls.length;
  await S.teleportParty(H.pitGate, { confirm: false });
  const seen = ops(n);
  assert.deepEqual([H.pit.tokens.get(`tCav${H.k}`).level, H.pit.tokens.get(`tMar${H.k}`).level], ["sharedLevel00001", `${H.pit.id}Lvl0`]);
  assert.deepEqual(seen.filter(c => c.op === "pullUsers" || c.op === "scene.view").map(c => c.options), [{}, {}]);
});

/**
 * A `pentaryn-portals.prePull` listener for the length of `fn` (code review 2026-10-17 CR7: portals
 * fires a filter hook before every pull it sends; pentaryn-pins registers one to leave out a player
 * pinned elsewhere — portals no longer reads pins' API). `listener` undefined = none registered.
 */
async function withPrePull(listener, fn) {
  if (listener === undefined) return fn();
  const id = Hooks.on("pentaryn-portals.prePull", listener);
  try { return await fn(); } finally { Hooks.off("pentaryn-portals.prePull", id); }
}

test("CR7: Teleport party fires pentaryn-portals.prePull ONCE with the active players and { scene, level, token: null, reason, pull: [] }; a listener drops users in place", async () => {
  const H = hall();
  F.canvas.scene = H.s;
  const n = F.calls.length;
  const seen = [];
  // Ana's pinned character is on another scene (a split party): the listener leaves her out
  await withPrePull((users, ctx) => {
    seen.push({ users: users.map(u => u.id), scene: ctx.scene?.id, level: ctx.level, token: ctx.token, reason: ctx.reason, pull: ctx.pull });
    users.splice(users.findIndex(u => u.id === P1), 1);
  }, () => S.teleportParty(H.pitGate, { confirm: false }));
  assert.deepEqual(seen, [{ users: [P1, P2], scene: H.pit.id, level: `${H.pit.id}Lvl0`, token: null, reason: "party", pull: [] }]);
  const [pull] = ops(n).filter(c => c.op === "pullUsers");
  assert.deepEqual(pull.users, [P2]);
  assert.equal(F.calls.slice(n).filter(c => c.op === "Hooks.call" && c.name === "pentaryn-portals.prePull").length, 1, "one hook call per pull site");
});

test("CR7: Teleport party — no listener, or one that drops nobody, pulls every active player; a throwing listener is caught by Hooks (stock pull); a veto pulls nobody but the GM's view still goes", async () => {
  for (const [name, listener] of [["no listener", undefined], ["drops nobody", () => {}], ["throws", () => { throw new Error("boom"); }]]) {
    const H = hall();
    F.canvas.scene = H.s;
    const n = F.calls.length;
    await withPrePull(listener, () => S.teleportParty(H.pitGate, { confirm: false }));
    const [pull] = ops(n).filter(c => c.op === "pullUsers");
    assert.deepEqual(pull.users, [P1, P2], name);
  }
  const H = hall();
  F.canvas.scene = H.s;
  const n = F.calls.length;
  const out = await withPrePull(() => false, () => S.teleportParty(H.pitGate, { confirm: false }));
  assert.equal(out.cancelled, false);
  assert.deepEqual(ops(n).filter(c => c.op === "pullUsers" || c.op === "scene.view").map(c => c.op), ["scene.view"], "vetoed: no pull, the view goes");
});

test("teleportParty, same scene: a token deleted mid-dialog is left out; nobody left → warn, { moved: 0, cancelled: true } [declared] (ROB-2)", async () => {
  const H = hall({ tokens: k => [{ id: `tCav${k}`, name: "Caven", actorId: "CAV", actorLink: true, x: 100, y: 200 },
    { id: `tMar${k}`, name: "Marrith", actorId: "MAR", actorLink: true, x: 200, y: 200 }] });
  const cell = W.region(H.s, { id: `Cell${H.k}`, name: "Cell", bounds: { x: 2000, y: 2000, width: 100, height: 100 }, flags: { [MODULE]: { title: "The Cell" } } });
  F.canvas.scene = H.s;
  W.confirm = true;
  let n = F.calls.length;
  let out = await withDialog(() => H.s.tokens.delete(`tMar${H.k}`), () => S.teleportParty(cell));
  assert.deepEqual(out, { moved: 1, cancelled: false });
  let seen = ops(n);
  assert.deepEqual(seen.map(c => c.op), ["DialogV2.confirm", "updateEmbedded", "notify"]);
  assert.deepEqual(seen[1].updates.map(u => u._id), [`tCav${H.k}`]);
  n = F.calls.length;
  out = await withDialog(() => H.s.tokens.delete(`tCav${H.k}`), () => S.teleportParty(cell));
  assert.deepEqual(out, { moved: 0, cancelled: true });
  seen = ops(n);
  assert.deepEqual(seen.map(c => c.op), ["DialogV2.confirm", "notify"]);
  assert.equal(seen[1].level, "warn");
  assert.equal(seen[1].message, "Teleport party: nobody on this scene counts as the party.");
});

test("teleportParty, empty party with the confirm skipped: warn, { moved: 0, cancelled: true }, nobody pulled, no view, no toast [declared] (portals-edge-4)", async () => {
  const H = hall({ tokens: k => [{ id: `tGuard${k}`, name: "Guard", actorId: "GUARD", x: 1100, y: 200 }] });
  F.canvas.scene = H.s;
  const nobody = [{ op: "notify", level: "warn", message: "Teleport party: nobody on this scene counts as the party." }];
  let n = F.calls.length;
  assert.deepEqual(await S.teleportParty(H.pitGate, { confirm: false }), { moved: 0, cancelled: true }, "confirm:false");
  assert.deepEqual(ops(n), nobody);
  await game.settings.set(MODULE, "confirmPartyTeleport", false);
  n = F.calls.length;
  assert.deepEqual(await S.teleportParty(H.pitGate), { moved: 0, cancelled: true }, "setting off");
  assert.deepEqual(ops(n), nobody);
  await game.settings.set(MODULE, "confirmPartyTeleport", true);
  n = F.calls.length;
  assert.deepEqual(await S.teleportParty(H.pitGate), { moved: 0, cancelled: true }, "setting on: one warn, no dialog");
  assert.deepEqual(ops(n), nobody);
  assert.equal(F.canvas.scene, H.s);
});

test("teleportParty / lookAt: a player or no region → nothing", async () => {
  const H = hall();
  F.canvas.scene = H.s;
  const n = F.calls.length;
  await S.teleportParty(null);
  await S.lookAt(null);
  F.become({ userId: P1 });
  await S.teleportParty(H.pitGate, { confirm: false });
  await S.lookAt(H.pitGate);
  F.become({ userId: GM });
  assert.deepEqual(ops(n), []);
});

test("teleportParty with no scene on the canvas: nothing, no TypeError [declared] (portals-edge-5)", async () => {
  const H = hall();
  const n = F.calls.length;
  F.canvas.scene = null;
  try {
    assert.equal(await S.teleportParty(H.pitGate, { confirm: false }), undefined);
    assert.deepEqual(ops(n), []);
  } finally { F.canvas.scene = H.s; }
});

test("lookAt: pans the GM's own view (switching scene first if needed) and says nobody moved", async () => {
  const H = hall();
  F.canvas.scene = H.s;
  let n = F.calls.length;
  await S.lookAt(H.pitGate);
  assert.deepEqual(ops(n), [
    { op: "scene.view", scene: H.pit.id },
    { op: "animatePan", x: 1050, y: 550, scale: 0.6, duration: 600 },
    { op: "notify", level: "info", message: "Looking at The Fighting Pit. Nobody moved; players can't see this." },
  ]);
  F.canvas.stage.scale.x = 1.5;
  n = F.calls.length;
  await S.lookAt(H.pitGate);
  assert.deepEqual(ops(n).map(c => [c.op, c.scale]), [["animatePan", 1.5], ["notify", undefined]]);
  F.canvas.stage.scale.x = 0.5;
});

/* ── arrivals ─────────────────────────────────────────────────────────── */

function arrivalScene(occupant) {
  const k = ++seq;
  const s = W.scene({ id: `Arr${k}`, name: "Arrival", tokens: [{ id: `arr${k}`, name: "Caven", actorId: "CAV", x: 600, y: 1000 }, ...(occupant ? [{ id: `occ${k}`, x: 600, y: 1000, ...occupant }] : [])] });
  return s.tokens.get(`arr${k}`);
}

test("spreadArrival: on an occupied square → one teleport update to the first free ring square", async () => {
  const arrived = arrivalScene({ name: "Guard", actorId: "GUARD" });
  const n = F.calls.length, l = F.logged.length;
  const options = [];
  const real = arrived.update;
  arrived.update = function (changes, opts) { options.push(opts); return real.call(this, changes, opts); };
  assert.equal(await settle(S.spreadArrival(arrived)), arrived);
  // [declared] portals-w3-1b: the step is a displace waypoint, not the deprecated `teleport` option
  assert.deepEqual(options.at(-1), { animate: false, movement: { [arrived.id]: { waypoints: [{ x: 500, y: 900, action: "displace" }] } } });
  assert.deepEqual(W.deprecationsSince(l), [], "no v14 compatibility warning");
  // [declared] portals-async-1: the tab claims the token first; the claim leaves with the move
  assert.deepEqual(W.callsSince(n, ["update"]).map(c => c.changes), [{ "flags.pentaryn-portals.claims.spread": "socket-gm-1" }, { x: 500, y: 900, "flags.pentaryn-portals.claims": "<_del>" }]);
  assert.deepEqual([arrived.x, arrived.y], [500, 900]);
  // [declared] portals-w3-2: the claim was the only one, so `claims` itself goes — no empty {} left on the token
  assert.ok(!("claims" in (arrived.flags[MODULE] ?? {})), "no empty claims {} on the arrived token");
});

test("spreadArrival: another claim on the token stays; only spread leaves (claims is removed only when it empties) [declared] (portals-w3-2)", async () => {
  const arrived = arrivalScene({ name: "Guard", actorId: "GUARD" });
  await arrived.update({ [`flags.${MODULE}.claims.other`]: "socket-x" });
  const n = F.calls.length;
  await settle(S.spreadArrival(arrived));
  assert.deepEqual(W.callsSince(n, ["update"]).map(c => c.changes).at(-1), { x: 500, y: 900, "flags.pentaryn-portals.claims.spread": "<_del>" });
  assert.deepEqual(arrived.flags[MODULE].claims, { other: "socket-x" });
});

test("spreadArrival: alone, beside someone (edges touch), a hidden or token-flagged handle occupant, or the setting off → no move", async () => {
  const cases = [null, { x: 700, y: 1000 }, { hidden: true }, { flags: { "pentaryn-aoe": { handle: true } } }];
  for (const occ of cases) {
    const arrived = arrivalScene(occ && { name: "Other", ...occ });
    const n = F.calls.length;
    await S.spreadArrival(arrived);
    assert.deepEqual(W.callsSince(n, ["update"]), [], JSON.stringify(occ));
  }
  await game.settings.set(MODULE, "spreadArrivals", false);
  const arrived = arrivalScene({ name: "Guard" });
  const n = F.calls.length;
  await S.spreadArrival(arrived);
  await game.settings.set(MODULE, "spreadArrivals", true);
  assert.deepEqual(W.callsSince(n, ["update"]), []);
});

test("spreadArrival: an occupant that is an aoe handle only by its actor flag no longer counts [declared D-P6]", async () => {
  // [declared] D-P6 (-43): spreadArrival and recordOf now agree (isAoeHandle); it moved the PC before
  const arrived = arrivalScene({ name: "Spirit Guardians (Caven)", actorId: "HANDLEA" });
  const n = F.calls.length;
  await S.spreadArrival(arrived);
  assert.equal(W.callsSince(n, ["update"]).length, 0);
});

/* ── summons follow ───────────────────────────────────────────────────── */

/** Core's teleport: Caven (and optionally Marrith) re-created on the pit, the old tokens deleted. */
async function walkThrough(H, who = ["tCav"], { at = { x: 1000, y: 500 } } = {}) {
  const replacements = {};
  for (const id of who) Object.assign(H.t(id), { x: 100, y: 200 });   // everyone stood on the gate
  for (const id of who) {
    const old = H.t(id);
    const [made] = await H.pit.createEmbeddedDocuments("Token", [{ ...old.toObject(), id: `${id}New${H.k}`, ...at }], { keepId: true });
    replacements[old.id] = made.uuid;
  }
  const deleted = who.map(id => H.t(id));
  for (const t of deleted) H.s.tokens.delete(t.id);
  return { deleted, replacements };
}

test("bringFollowers: Caven's summon and his own tokens follow him; one toast", async () => {
  const H = hall();
  const { deleted, replacements } = await walkThrough(H);
  const n = F.calls.length;
  await S.bringFollowers(H.s, deleted, replacements);
  const out = ops(n);
  assert.deepEqual(out.map(c => [c.op, c.ids ?? c.message, c.options]), [
    ["createEmbedded", [`tSkel${H.k}`], { keepId: true }],
    ["deleteEmbedded", [`tSkel${H.k}`], {}],
    ["notify", "Caven brought Skeleton to Fighting Pit.", undefined],
  ]);
});

test("bringFollowers: two PCs to one scene → each PC's own, then the co-owned steed beside the first", async () => {
  const H = hall();
  const { deleted, replacements } = await walkThrough(H, ["tCav", "tMar"]);
  const n = F.calls.length;
  await settle(S.bringFollowers(H.s, deleted, replacements));   // Marrith lands on Caven: a claimed spread
  assert.deepEqual(ops(n).filter(c => c.op === "notify").map(c => c.message), [
    "Caven brought Skeleton to Fighting Pit.",
    "Marrith brought Arcane Eye to Fighting Pit.",
    "Caven brought Steed to Fighting Pit.",
  ]);
});

test("bringFollowers: the follower already carried (another session got there first) → resolves quietly [declared D-P4]", async () => {
  const H = hall();
  const { deleted, replacements } = await walkThrough(H);
  W.token(H.pit, { id: `tSkel${H.k}`, name: "Skeleton", actorId: "SKEL" });
  // [declared] D-P4 (-28): the keepId refusal is the other tab winning — no delete, no toast, no warn
  const c = console$.length;
  const n = F.calls.length;
  await S.bringFollowers(H.s, deleted, replacements);
  assert.deepEqual(ops(n).map(x => x.op), ["createEmbedded"]);
  assert.equal(H.s.tokens.has(`tSkel${H.k}`), true, "the loser deletes nothing");
  assert.deepEqual(console$.slice(c), []);
});

test("bringFollowers: no carry for a same-scene move, a non-PC, a cut-and-paste (not in a portal region), or a missing replacement", async () => {
  const H = hall();
  const n = F.calls.length;
  const cav = H.t("tCav");
  await S.bringFollowers(H.s, [cav], { [cav.id]: cav.uuid });                         // same scene
  await S.bringFollowers(H.s, [H.t("tGuard")], { [H.t("tGuard").id]: H.pitGate.uuid }); // not a PC (resolves to a region, not a token: parent check)
  const away = { ...cav.toObject(), x: 3000, y: 3000 };
  const far = W.token(W.scene({ id: `Far${H.k}`, name: "Far" }), { ...away, id: `farCav${H.k}` });
  await S.bringFollowers(H.s, [Object.assign(cav, { x: 3000, y: 3000 })], { [cav.id]: far.uuid });   // not standing in the gate
  cav.x = 100; cav.y = 200;
  await S.bringFollowers(H.s, [cav], {});
  await S.bringFollowers(H.s, [cav], { [cav.id]: "Scene.Nowhere.Token.none" });
  assert.deepEqual(ops(n), []);
});

test("bringFollowers: a polymorphed form leads too; its region's testPoint throwing falls back to the bounds", async () => {
  const H = hall({ tokens: k => [
    { id: `tForm${k}`, name: "Wolf", actorId: "FORM", x: 100, y: 200 },
    { id: `tSkel${k}`, name: "Skeleton", actorId: "SKEL", x: 300, y: 200 },
    { id: `tPet${k}`, name: "Pet", actorId: "STEED", x: 400, y: 200 },
  ] });
  H.gate.testPoint = () => { throw new Error("no shapes yet"); };
  const { deleted, replacements } = await walkThrough(H, ["tForm"]);
  const n = F.calls.length;
  await S.bringFollowers(H.s, deleted, replacements);
  assert.deepEqual(ops(n).filter(c => c.op === "notify").map(c => c.message), []);
  assert.equal(S.cameThroughPortal(deleted[0], H.pit), true);
  assert.equal(S.cameThroughPortal(deleted[0], H.s), false, "the gate does not lead to its own scene");
});

test("bringFollowers: a failed arrival spread warns 'arrival spread skipped' and the followers still come", async () => {
  const H = hall();
  W.token(H.pit, { id: `blocker${H.k}`, name: "Guard", actorId: "GUARD", x: 1000, y: 500 });
  const { deleted, replacements } = await walkThrough(H);
  const arrived = H.pit.tokens.get(`tCavNew${H.k}`);
  arrived.update = async () => { throw new Error("gone"); };
  const c = console$.length;
  const n = F.calls.length;
  await S.bringFollowers(H.s, deleted, replacements);
  assert.deepEqual(console$.slice(c).map(([l, t]) => [l, t]), [["warn", "pentaryn-portals | arrival spread skipped"]]);
  assert.equal(ops(n).filter(c2 => c2.op === "notify").length, 1);
});

test("deleteToken hook: needs replacements and the active GM; one delete operation is one pass; a failure warns", async () => {
  const H = hall();
  const { deleted, replacements } = await walkThrough(H, ["tCav", "tMar"]);
  const options = { replacements };
  let n = F.calls.length;
  F.fire("deleteToken", deleted[0], {});
  F.become({ userId: P1 });
  F.fire("deleteToken", deleted[0], options);
  F.become({ userId: GM });
  await W.tick();
  assert.deepEqual(ops(n), [], "no replacements / not the active GM");
  n = F.calls.length;
  F.fire("deleteToken", deleted[0], options);
  F.fire("deleteToken", deleted[1], options);
  assert.deepEqual(ops(n), [], "deferred a tick");
  await W.tick(12);
  for (let i = 0; i < 6; i++) { mock.timers.tick(750); await W.flush(); }   // Marrith's spread claim settles
  assert.equal(ops(n).filter(c => c.op === "notify").length, 3, "both PCs in one pass: own summons + the shared steed");
  const H2 = hall();
  const w2 = await walkThrough(H2);
  // D-P4: "already exists" is now the other tab winning; any other failure still warns
  H2.pit.createEmbeddedDocuments = async () => { throw new Error("server unavailable"); };
  const c = console$.length;
  F.fire("deleteToken", w2.deleted[0], { replacements: w2.replacements });
  await W.tick(12);
  assert.deepEqual(console$.slice(c).map(([l, t]) => [l, t]), [["warn", "pentaryn-portals | summons did not follow"]]);
});

test("gaps: a replacement uuid fromUuid rejects is skipped; a real token's centre point and elevation are what is tested", async () => {
  const H = hall();
  const cav = H.t("tCav");
  const saved = globalThis.fromUuid;
  globalThis.fromUuid = async () => { throw new Error("compendium offline"); };
  const n = F.calls.length;
  await S.bringFollowers(H.s, [cav], { [cav.id]: "Compendium.x.y.Actor.z" });
  globalThis.fromUuid = saved;
  assert.deepEqual(ops(n), []);
  const seen = [];
  H.gate.testPoint = p => { seen.push(p); return true; };
  const tok = { parent: H.s, x: 0, y: 0, elevation: 15, getCenterPoint: () => ({ x: 150, y: 250 }) };
  assert.equal(S.cameThroughPortal(tok, H.pit), true);
  assert.deepEqual(seen, [{ x: 150, y: 250, elevation: 15 }]);
});

test("gaps: spreadArrival steps off an off-grid overlap too; its own square is tested by footprint, not centre [declared] (portals-edge-2)", async () => {
  // The guard covers the arrival's top-left quarter. Before, the centre point was free, so it stayed put on him.
  const arrived = arrivalScene({ name: "Guard", actorId: "GUARD", x: 550, y: 950 });
  const n = F.calls.length;
  await settle(S.spreadArrival(arrived));
  assert.deepEqual(W.callsSince(n, ["update"]).map(c => c.changes).filter(c => "x" in c), [{ x: 700, y: 900, "flags.pentaryn-portals.claims": "<_del>" }]);
});

test("gaps: a follower with no PC to stand by reads 'follower'; a destination with no nav name uses its name", async () => {
  W.confirm = true;
  const n = F.calls.length;
  await S.confirmParty([{ id: "x", name: "Stray", type: "npc", linked: false, owners: ["p9"], summoner: null }], "Here");
  assert.match(W.callsSince(n, ["DialogV2.confirm"])[0].content, /<li>Stray <span class="ppt-follows">follower<\/span><\/li>/);
  const H = hall();
  H.pit.navName = "";
  const { deleted, replacements } = await walkThrough(H);
  const m = F.calls.length;
  await S.bringFollowers(H.s, deleted, replacements);
  assert.deepEqual(ops(m).filter(c => c.op === "notify").map(c => c.message), ["Caven brought Skeleton to Drow City — Fighting Pit (set-piece)."]);
});

/* ── portals-edge-2: footprints (last, so the hall() ids above stay put) ── */

/** Every pair of boxes that share area (touching edges do not count). */
const overlaps = boxes => boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).map(b => [a.id, b.id]));
const landedBoxes = (toks, places) => toks.map((t, i) => ({ id: t.id, x: places[i].x, y: places[i].y, w: t.width * 100, h: t.height * 100 }));

test("portals-edge-2: landing tests each token's footprint, so a Large token never lands over a stander or the party", () => {
  // A stander one square down-right of the centre square: a 2×2 centred there would cover it.
  const dest = W.scene({ id: "LandBig", name: "Land", tokens: [{ id: "Stander2", x: 200, y: 200 }] });
  const big = W.token(W.scene({ id: "FromBig2", name: "From" }), { id: "mBig2", x: 0, y: 0, width: 2, height: 2 });
  const smalls = [1, 2, 3, 4, 5, 6].map(i => W.token(W.scene({ id: `FromS${i}`, name: "From" }), { id: `s${i}`, x: 0, y: 0 }));
  const toks = [big, ...smalls];
  const places = S.landingPlaces(dest, toks, 150, 150);
  const standing = { id: "Stander2", x: 200, y: 200, w: 100, h: 100 };
  assert.deepEqual(overlaps([standing, ...landedBoxes(toks, places)]), [], "no landed box overlaps a stander or another landed box");
  for (const p of places) assert.ok(p.x % 100 === 0 && p.y % 100 === 0, "whole squares");

  // Grouped (Teleport party): the 2×2 Steed lands beside its owners without covering any of them.
  const H = hall();
  const party = S.partyRecords(H.s);
  const ptoks = party.map(r => r.doc);
  assert.deepEqual(overlaps(landedBoxes(ptoks, S.landingPlaces(H.pit, ptoks, 1050, 550, party))), []);
});

/* ── two GM tabs (portals-async-1) ───────────────────────────────────── */


test("portals-async-1 [declared]: two GM tabs see one arrival on an occupied square — one tab claims it and moves it once; the claim leaves with the move", async () => {
  const arrived = arrivalScene({ name: "Guard", actorId: "GUARD" });
  // Each tab writes through the server: neither sees the other's write before it has decided.
  const real = arrived.update;
  arrived.update = function (changes, options) { return W.flush(1).then(() => real.call(this, changes, options)); };
  const n = F.calls.length;
  let a, b;
  try {
    F.become({ socketId: "socket-bridge" });
    a = S.spreadArrival(arrived);              // the MCP bridge tab
    F.become({ socketId: "socket-browser" });
    b = S.spreadArrival(arrived);              // a GM browser tab, same user
  } finally {
    F.become({ socketId: "socket-gm-1" });
  }
  await settle(Promise.all([a, b]));
  const moves = W.callsSince(n, ["update"]).filter(c => "x" in c.changes);
  assert.deepEqual(moves.map(c => c.changes), [{ x: 500, y: 900, "flags.pentaryn-portals.claims": "<_del>" }], "moved once");
  assert.deepEqual([arrived.x, arrived.y], [500, 900]);
  assert.equal(arrived.flags[MODULE]?.claims?.spread, undefined, "no stale claim rides the next hop's toObject()");
  assert.ok(!("claims" in (arrived.flags[MODULE] ?? {})), "no empty claims {} either [declared] (portals-w3-2)");
});

test("portals-async-3 [declared]: bringFollowers' keepId-refusal election is commented as right for embedded Tokens, so nobody swaps it for a flag claim", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../party.mjs", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function bringFollowers"), src.indexOf("function onDeleteToken"));
  const comment = body.slice(body.indexOf("await carryTo("), body.indexOf("if (!/already exists/i"));
  assert.match(comment, /embedded Token/i, "names embedded Tokens");
  assert.match(comment, /replaces/, "says the blueprint's world-document 'replaces' note does not apply");
  assert.match(comment, /claimDocument[^\n]*\n[^\n]*spreadArrival|claimDocument[^\n]*spreadArrival/, "says claimDocument is for spreadArrival only");
  assert.match(comment, /portals-async-3/, "carries the finding id");
  assert.ok(!/claimDocument\(/.test(body), "bringFollowers itself takes no flag claim");
});
