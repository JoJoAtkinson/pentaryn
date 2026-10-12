// [declared] review fix to guide step 6 (N-D3): api.sync resolves a token ref to the BASE actor.
// Foundry 14.369 routes a synthetic actor's update to its ActorDelta (client-backend.mjs:763-765), whose
// schema has no prototypeToken (common/documents/actor-delta.mjs:44-55): before this fix a token, a
// placeable, a token id or uuid, or the token's synthetic actor resolved to that synthetic actor, so
// the prototype relabel was cleaned to a no-op while sync still counted it and toasted it. Here the
// synthetic actor's update records its uuid and drops the change, as live; the pin is that the
// prototype write goes to Actor.<base id> and the base actor's prototype label follows.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry, makeDoc } from "./kit/foundry-stub.mjs";
import { IDS, effects, equip, reset, world } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const TOK = "tokUnlinkedZZ001";
const data = world();
data.scenes[0].tokens.push({ id: TOK, actorId: IDS.bob, actorLink: false, x: 500, y: 100, name: "Bob", actor: null });

const F = await installFoundry(data);
equip(F);
const scene = game.scenes.get(IDS.one);
const tok = scene.tokens.get(TOK);
// The token's synthetic actor: same id as the base actor, parented by the token; its update is dropped.
const synthetic = makeDoc("Actor", { id: IDS.bob, name: "Bob", type: "npc", prototypeToken: { name: "Bob" } }, { parent: tok });
Object.defineProperty(synthetic, "isToken", { value: true, enumerable: false });
Object.defineProperty(synthetic, "token", { value: tok, enumerable: false });
Object.defineProperty(synthetic, "update", {
  value: async changes => (F.calls.push({ op: "update", documentName: "Actor", uuid: synthetic.uuid, changes: F.plain(changes) }), undefined),
  enumerable: false,
});
tok.actor = synthetic;

await import("../names.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.pentaryn.names;

test("api.sync given an unlinked token, placeable, token id, token uuid or synthetic actor relabels the BASE actor's prototype", async () => {
  const refs = [
    ["token", tok],
    ["placeable", { document: tok }],
    ["token id", TOK],
    ["token uuid", tok.uuid],
    ["synthetic actor", synthetic],
  ];
  for (const [label, ref] of refs) {
    reset(F);
    tok.name = "Bob";
    assert.equal(await api.sync(ref, "Bob", "Rob"), 4, label);
    const writes = effects(F.calls);
    assert.deepEqual(writes[0], { op: "update", documentName: "Actor", uuid: `Actor.${IDS.bob}`, changes: { "prototypeToken.name": "Rob" } }, label);
    assert.equal(game.actors.get(IDS.bob).prototypeToken.name, "Rob", `${label}: the base actor's prototype label follows`);
    assert.ok(!writes.some(c => c.uuid === synthetic.uuid), `${label}: nothing is sent to the synthetic actor`);
    assert.equal(tok.name, "Rob", label);
    assert.equal(writes.at(-1).message, 'Token labels updated to "Rob" (4).', label);
  }
});

// [declared] kit 1.1.0 (W2-B4, Joe 2026-10-12): sync's ref says it resolves strings itself, so the
// bridge's pentaryn-write passes a uuid, id or exact name instead of refusing it as "eval-js only".
test("W2-B4: describe() marks sync's ref resolve:\"self\" (the kit leaves it to rename.mjs)", async () => {
  const { MANIFEST } = await import("../api-manifest.mjs");
  const { describe } = await import("../lib/api.mjs");
  const sync = describe(MANIFEST).methods.find(m => m.path === "sync");
  assert.deepEqual(sync.params[0], { name: "ref", kind: "actor", resolve: "self" });
});

// [declared] names-rob-2 (final review 2026-10-12): api.sync type-checks oldName and newName. Before,
// a missing or non-string name reached the relabel, so `api.sync(actor, "Bob")` blanked every
// matching label and toasted "undefined". Now it returns fail("BAD_ARGS") (the wrong-kind ref shape)
// before resolving the ref: nothing is written and no toast fires.
test("names-rob-2: api.sync with a missing or non-string oldName/newName returns fail(\"BAD_ARGS\") and writes nothing", async () => {
  const cases = [
    ["newName missing", ["Bob"]],
    ["oldName missing", [undefined, "Rob"]],
    ["newName null", ["Bob", null]],
    ["oldName a number", [42, "Rob"]],
    ["newName an object", ["Bob", { name: "Rob" }]],
  ];
  for (const [label, names] of cases) {
    reset(F);
    tok.name = "Bob";
    const before = game.actors.get(IDS.bob).prototypeToken.name;
    const r = await api.sync(IDS.bob, ...names);
    assert.equal(r?.ok, false, label);
    assert.equal(r.code, "BAD_ARGS", label);
    assert.equal(r.reason, "oldName and newName must be strings", label);
    assert.deepEqual(effects(F.calls), [], `${label}: nothing written, no toast`);
    assert.equal(tok.name, "Bob", label);
    assert.equal(game.actors.get(IDS.bob).prototypeToken.name, before, label);
  }
});

// [declared] names-maint-1 (final review 2026-10-12): api.sync always returns a Promise. Before, a
// coded failure (BAD_ARGS before resolving, AMBIGUOUS or a wrong-kind ref from resolveRef) came back
// as a plain fail() object while a count came back as a Promise, so `api.sync(...).then` threw on the
// failure path. Now every outcome — the count, fail(BAD_ARGS), fail(AMBIGUOUS) and the legacy
// TypeError of a miss — arrives through a Promise; an uncoded resolve error rejects instead of throwing.
test("names-maint-1: api.sync returns a Promise on every outcome (count, BAD_ARGS, AMBIGUOUS, legacy TypeError)", async () => {
  const outcomes = [
    ["count", [IDS.bob, "Bob", "Rob"], r => assert.equal(typeof r, "number")],
    ["BAD_ARGS names", [IDS.bob, "Bob"], r => assert.equal(r.code, "BAD_ARGS")],
    ["BAD_ARGS ref", [42, "Bob", "Rob"], r => assert.equal(r.code, "BAD_ARGS")],
    ["AMBIGUOUS", ["Bob", "Bob", "Rob"], r => assert.equal(r.code, "AMBIGUOUS")],
  ];
  for (const [label, args, check] of outcomes) {
    reset(F);
    tok.name = "Bob";
    const p = api.sync(...args);
    assert.ok(p instanceof Promise, `${label}: a Promise, not a plain value`);
    check(await p);
  }
  reset(F);
  const miss = api.sync("ZZ nobody at all", "Bob", "Rob");
  assert.ok(miss instanceof Promise, "miss: a Promise");
  await assert.rejects(miss, TypeError, "miss: the legacy TypeError arrives as a rejection");
});

// [declared] names-maint-2-manifest (final review 2026-10-12): the sync row's doc named only
// AMBIGUOUS and the TypeError of a miss, so describe() (what the bridge and agents read) hid the
// BAD_ARGS failure of a wrong-kind ref and of a non-string oldName/newName. Now the doc names both;
// `throws` stays ["TypeError"] (fail() is a return, not a throw). Behaviour pin alongside: a number
// and an Item ref each return fail("BAD_ARGS"), writing nothing.
test("names-maint-2-manifest: the sync row documents fail(\"BAD_ARGS\") for a wrong-kind ref and non-string names", async () => {
  const { MANIFEST } = await import("../api-manifest.mjs");
  const { describe } = await import("../lib/api.mjs");
  const sync = describe(MANIFEST).methods.find(m => m.path === "sync");
  const row = MANIFEST.rows.find(r => r.path === "sync");
  assert.deepEqual(row.throws, ["TypeError"]);
  for (const doc of [row.doc, sync.doc]) {
    assert.match(doc, /ref of the wrong kind[^.]*fail\("BAD_ARGS"\)/, "a wrong-kind ref → BAD_ARGS");
    assert.match(doc, /non-string oldName or newName[^.]*fail\("BAD_ARGS"\)/, "non-string names → BAD_ARGS");
    assert.match(doc, /fail\("AMBIGUOUS"\)/);
  }
  const item = makeDoc("Item", { id: "itmZZwrongKind01", name: "Rope" });
  for (const [label, ref] of [["a number", 42], ["a plain object", { name: "Bob" }], ["an Item", item]]) {
    reset(F);
    tok.name = "Bob";
    const r = await api.sync(ref, "Bob", "Rob");
    assert.equal(r?.ok, false, label);
    assert.equal(r.code, "BAD_ARGS", label);
    assert.deepEqual(effects(F.calls), [], `${label}: nothing written, no toast`);
    assert.equal(tok.name, "Bob", label);
  }
});
