// wildcard-art (play-test TF-1/TF-2/D7-1, Joe's ruling 2026-10-12): a Wild Shape form gets the
// right token image — never a random one, never the mystery-man placeholder. The beast's concrete
// prototype token image if it has one; for a wildcard path, the first matching file in sorted order
// (a player who may not browse files asks the active GM); if none resolves, the beast's portrait.
// The same druid and beast always get the same image.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup, IDS, MODULE } from "./fixtures/world.mjs";
import * as core from "../transform-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const T = await import("../transform.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(5000);

const WILD = "tokens/wolf/wolf-*.webp";
const FILES = ["tokens/wolf/wolf-3.webp", "tokens/wolf/wolf-1.webp", "tokens/wolf/wolf-2.webp"];   // server order
const QUERY = `${MODULE}.formImage`;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const errors = () => ops("notify").filter(c => c.level === "error").map(c => c.message);

/** Talo with one more known form, a beast whose prototype token is `proto` (profile "pw"). */
function druid(proto, { files = FILES, token = false } = {}) {
  game.actors.clear();
  F.chat.length = 0;
  F.calls.length = 0;
  F.console.length = 0;
  F.lastTransformData = undefined;
  F.can.clear();
  F.become({ userId: IDS.gm });
  game.users.get(IDS.gm).active = true;
  const { talo } = F.W.talo({ revertItem: token });
  const wolf = F.W.beast("mmWolfSrc0000001", "Wolf", { img: "portraits/wolf.webp", prototypeToken: proto });
  F.tokenImages.set(wolf.uuid, files);
  talo.items.get(IDS.ws).system.activities.get("wsAct").availableProfiles.push({ _id: "pw", name: "Wolf", uuid: wolf.uuid });
  if (token) {
    game.actors.delete(talo.id);
    talo.isToken = true;
    const scene = F.W.makeScene({ id: "sceneA0000000001" });
    const tok = { id: "npcToken00000001", name: "Talo", parent: scene, actor: talo, actorId: "baseTalo00000001",
      texture: { src: "talo-token.webp" }, getFlag: (scope, key) => tok.flags?.[scope]?.[key], flags: {} };
    scene.tokens.set(tok.id, tok);
    talo.token = tok;
    talo._tokens = [{ id: tok.id, name: "Talo", stopAnimation: () => {} }];
  }
  F.calls.length = 0;
  return { talo, wolf };
}

/** The player who owns Talo: may create actors, may not browse files (core's PLAYER default). */
function asPlayer() {
  F.can.set(IDS.player, perm => perm !== "FILES_BROWSE");
  F.become({ userId: IDS.player });
}

/** User#query in the stub runs the handler as the sender; the active GM answers in Foundry. */
function gmAnswers() {
  const real = CONFIG.queries[QUERY];
  assert.equal(typeof real, "function", `${QUERY} is registered`);
  CONFIG.queries[QUERY] = async (data, ctx) => {
    const me = game.user.id;
    F.become({ userId: IDS.gm });
    try { return await real(data, ctx); } finally { F.become({ userId: me }); }
  };
  return () => { CONFIG.queries[QUERY] = real; };
}

const randomLast = () => mock.method(Math, "random", () => 0.99);   // dnd5e's pick lands on the last file

test("wildcard-art: pickFormImage — concrete image, first sorted wildcard match, else the portrait", () => {
  assert.equal(typeof core.pickFormImage, "function");
  const pick = core.pickFormImage;
  assert.equal(pick({ src: "tokens/bear.webp", wildcard: false, images: [], portrait: "bear.webp" }), "tokens/bear.webp");
  assert.equal(pick({ src: WILD, wildcard: true, images: FILES, portrait: "wolf.webp" }), "tokens/wolf/wolf-1.webp");
  assert.equal(pick({ src: WILD, wildcard: true, images: [WILD], portrait: "wolf.webp" }), "wolf.webp", "core's literal wildcard is no image");
  assert.equal(pick({ src: WILD, wildcard: true, images: [], portrait: "wolf.webp" }), "wolf.webp");
  assert.equal(pick({ src: WILD, wildcard: true, images: [], portrait: "" }), null);
  assert.equal(pick({ src: "", wildcard: false, images: [], portrait: "wolf.webp" }), "wolf.webp", "no token image at all → the portrait");
  assert.equal(core.isWildcardPath(WILD), true);
  assert.equal(core.isWildcardPath("tokens/wolf.webp?v=2"), false, "a URL's query mark is not a wildcard");
});

test("wildcard-art: a GM's shift into a wildcard beast gets the first matching file, the same every time", async () => {
  const random = randomLast();
  try {
    const { talo, wolf } = druid({ randomImg: true, texture: { src: WILD } });
    const form = await T.shift(talo, "pw");
    assert.ok(form, "the form");
    assert.equal(F.lastTransformData.prototypeToken.texture.src, "tokens/wolf/wolf-1.webp");
    assert.equal(form.getFlag(MODULE, "wildshape").source, wolf.uuid, "the form still names the beast");
    assert.deepEqual(errors(), []);
    const again = druid({ randomImg: true, texture: { src: WILD } });
    await T.shift(again.talo, "pw");
    assert.equal(F.lastTransformData.prototypeToken.texture.src, "tokens/wolf/wolf-1.webp", "same druid, same beast, same image");
  } finally { random.mock.restore(); }
});

test("wildcard-art: a concrete beast token image is copied as it is (no clone, no listing)", async () => {
  const { talo } = druid({ randomImg: false, texture: { src: "tokens/wolf/alpha.webp" } });
  await T.shift(talo, "pw");
  assert.equal(F.lastTransformData.prototypeToken.texture.src, "tokens/wolf/alpha.webp");
  assert.deepEqual(ops("clone"), []);
});

test("wildcard-art: a player's shift asks the active GM for the image — no placeholder, no error toast", async () => {
  const random = randomLast();
  const { talo } = druid({ randomImg: true, texture: { src: WILD } });
  const restore = gmAnswers();
  try {
    asPlayer();
    const form = await T.shift(talo, "pw");
    F.become({ userId: IDS.gm });
    assert.ok(form, "the form");
    assert.equal(F.lastTransformData.prototypeToken.texture.src, "tokens/wolf/wolf-1.webp");
    assert.deepEqual(errors(), [], "no 'Error retrieving wildcard tokens'");
    assert.deepEqual(ops("getTokenImages").map(c => c.user), [IDS.gm], "listed once, by the GM");
  } finally { restore(); random.mock.restore(); }
});

test("wildcard-art: a player's shift with no GM online falls back to the beast's portrait", async () => {
  const { talo } = druid({ randomImg: true, texture: { src: WILD } });
  game.users.get(IDS.gm).active = false;
  try {
    asPlayer();
    await T.shift(talo, "pw");
    F.become({ userId: IDS.gm });
    assert.equal(F.lastTransformData.prototypeToken.texture.src, "portraits/wolf.webp");
    assert.deepEqual(errors(), []);
  } finally { game.users.get(IDS.gm).active = true; }
});

test("wildcard-art: a wildcard that matches nothing gives the portrait", async () => {
  const { talo } = druid({ randomImg: true, texture: { src: WILD } }, { files: [] });
  await T.shift(talo, "pw");
  assert.equal(F.lastTransformData.prototypeToken.texture.src, "portraits/wolf.webp");
});

test("wildcard-art: an unlinked token druid's token gets the same first matching file", async () => {
  const random = randomLast();
  try {
    const { talo } = druid({ randomImg: true, texture: { src: WILD } }, { token: true });
    const token = talo.token;
    const form = await T.shift(talo, "pw");
    assert.equal(form, token.actor);
    assert.equal(token.texture.src, "tokens/wolf/wolf-1.webp");
  } finally { random.mock.restore(); }
});

test("wildcard-art: api.formImage({ uuid }) answers the image (the relay row); an unknown uuid answers null", async () => {
  druid({ randomImg: true, texture: { src: WILD } });
  const api = game.modules.get(MODULE).api;
  assert.equal(await api.formImage({ uuid: "Actor.mmWolfSrc0000001" }), "tokens/wolf/wolf-1.webp");
  assert.equal(await api.formImage({ uuid: "Actor.nope000000000001" }), null);
  assert.equal(await api.formImage({}), null);
});
