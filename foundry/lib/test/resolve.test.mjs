import { test } from "node:test";
import assert from "node:assert/strict";
import { refOf, resolveRef, toIdSet, withRef } from "../resolve.mjs";

class Coll extends Map {
  constructor(docs) { super(docs.map(d => [d.id, d])); }
  get contents() { return [...this.values()]; }
}
const actor = (id, name) => ({ documentName: "Actor", id, name, uuid: `Actor.${id}` });
const A = actor("aaaaaaaaaaaaaaaa", "Aldric Vane");
const M1 = actor("mmmmmmmmmmmmmmm1", "Mira");
const M2 = actor("mmmmmmmmmmmmmmm2", "Mira");
const W = actor("wwwwwwwwwwwwwwww", "wren");
const synthetic = actor("ssssssssssssssss", "Aldric Vane (token)");
const tok = { documentName: "Token", id: "tttttttttttttttt", name: "Goblin Scout", actorId: A.id, actor: synthetic };
const tok2 = { documentName: "Token", id: "uuuuuuuuuuuuuuuu", name: "Goblin Scout", actorId: A.id, actor: synthetic };
const s1 = { documentName: "Scene", id: "scene00000000001", name: "One", tokens: new Coll([tok]) };
const s2 = { documentName: "Scene", id: "scene00000000002", name: "Two", tokens: new Coll([tok2]) };
const g = {
  game: { actors: new Coll([A, M1, M2, W]), scenes: new Coll([s1, s2]) },
  canvas: { scene: s2 },
  fromUuidSync: uuid => ({ [A.uuid]: A, [`Scene.${s1.id}.Token.${tok.id}`]: tok })[uuid] ?? null,
};
const r = (ref, kind = "actor", opts = {}) => resolveRef(ref, kind, { g, ...opts });
const code = fn => { try { fn(); return "ok"; } catch (e) { return e.code; } };

test("documents and placeables pass through; a token asked for an actor gives its actor per `base`", () => {
  assert.equal(r(A), A);
  assert.equal(r({ document: A }), A);
  assert.equal(r(tok), synthetic);
  assert.equal(r(tok, "actor", { base: true }), A);
  assert.equal(r(tok, "token"), tok);
  assert.equal(code(() => r(A, "token")), "BAD_ARGS");
});

// [declared] names-ext-3 (kit 1.2.0, final review 2026-10-12): a token's synthetic Actor asked for with
// `base: true` gives the WORLD actor (token.actorId, else its own id, which Foundry shares with the
// base). Before, adapt() returned it unchanged and names, ties and transform each patched it by hand.
test("names-ext-3: a synthetic (isToken) Actor with base:true resolves to the world actor; base:false keeps it", () => {
  const synth = { documentName: "Actor", id: A.id, name: "Aldric Vane", isToken: true, token: tok };
  assert.equal(r(synth, "actor", { base: true }), A);
  assert.equal(r({ document: synth }, "actor", { base: true }), A);
  assert.equal(r(synth), synth);
  const tokenless = { documentName: "Actor", id: A.id, name: "Aldric Vane", isToken: true, token: null };
  assert.equal(r(tokenless, "actor", { base: true }), A);
  const orphan = { documentName: "Actor", id: "oooooooooooooooo", name: "Gone", isToken: true, token: { actorId: "oooooooooooooooo" } };
  assert.equal(r(orphan, "actor", { base: true, required: false }), null);
  assert.equal(code(() => r(orphan, "actor", { base: true })), "NOT_FOUND");
  assert.equal(r(A, "actor", { base: true }), A);
});

test("uuid, id, exact name, then case-insensitive name", () => {
  assert.equal(r("Actor.aaaaaaaaaaaaaaaa"), A);
  assert.equal(r(`Scene.${s1.id}.Token.${tok.id}`, "actor", { base: true }), A);
  assert.equal(r("aaaaaaaaaaaaaaaa"), A);
  assert.equal(r("Aldric Vane"), A);
  assert.equal(r("ALDRIC VANE"), A);
  assert.equal(r("Wren"), W);
});

test("never a substring; ambiguity and misses are coded", () => {
  assert.equal(code(() => r("Aldric")), "NOT_FOUND");
  assert.equal(code(() => r("Mira")), "AMBIGUOUS");
  assert.equal(code(() => r("Actor.zzzzzzzzzzzzzzzz")), "NOT_FOUND");
  assert.equal(code(() => r("")), "BAD_ARGS");
  assert.equal(code(() => r(42)), "BAD_ARGS");
  assert.equal(r("Nobody", "actor", { required: false }), null);
  assert.equal(r(null, "actor", { required: false }), null);
});

test("tokens: every scene unless scoped; no implicit canvas.scene", () => {
  assert.equal(code(() => r("Goblin Scout", "token")), "AMBIGUOUS");
  assert.equal(r("Goblin Scout", "token", { sceneId: s1.id }), tok);
  assert.equal(r("Goblin Scout", "token", { sceneId: "current" }), tok2);
  assert.equal(r(tok2.id, "token"), tok2);
  assert.equal(r(tok.id, "actor", { base: true }), A);
  assert.equal(code(() => r("Goblin Scout", "token", { sceneId: "nosuchscene00000" })), "NOT_FOUND");
});

test("refOf, toIdSet, withRef", () => {
  assert.deepEqual(refOf(A), { documentName: "Actor", id: A.id, uuid: A.uuid, name: "Aldric Vane" });
  assert.equal(refOf({}), null);
  assert.equal(toIdSet(null), null);
  assert.deepEqual([...toIdSet("a")], ["a"]);
  assert.deepEqual([...toIdSet([A, "b", null])], [A.id, "b"]);
  assert.deepEqual([...toIdSet(new Set(["c"]))], ["c"]);
  function named(doc, x) { return [doc?.name ?? null, x]; }
  const w = withRef(named, "actor", { g, required: false });
  assert.equal(w.name, "named");
  assert.deepEqual(w("Aldric Vane", 1), ["Aldric Vane", 1]);
  assert.deepEqual(w("Nobody", 2), [null, 2]);
});

// KIT-M2: byName falls back to a unique case-insensitive exact name (the "Wren" case above), so no
// doc may still call resolution "exact match only".
test("KIT-M2: the README row, the resolve.mjs header and publish.mjs inspect() describe the case-insensitive fallback", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const read = rel => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
  const RULE = "exact name, then a unique case-insensitive exact name; never a substring";
  const row = read("README.md").split("\n").find(l => l.startsWith("| `resolve.mjs` |"));
  assert.ok(row?.includes(RULE), "README.md resolve.mjs row");
  const header = read("resolve.mjs").split("*/")[0].replace(/\s*\n\s*\*\s*/g, " ");
  assert.ok(header.includes(RULE), "resolve.mjs header comment");
  const inspect = read("publish.mjs").split("\n").filter(l => /^\s*\/\//.test(l)).map(l => l.replace(/^\s*\/\/\s?/, "")).join(" ");
  assert.ok(inspect.includes(RULE), "publish.mjs inspect() comment");
  for (const [where, text] of [["README.md row", row], ["resolve.mjs header", header], ["publish.mjs comments", inspect]]) {
    assert.doesNotMatch(text, /exact match only|\(exact match,/, where);
  }
});
