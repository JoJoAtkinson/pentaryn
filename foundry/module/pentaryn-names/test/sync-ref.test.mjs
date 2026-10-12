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
