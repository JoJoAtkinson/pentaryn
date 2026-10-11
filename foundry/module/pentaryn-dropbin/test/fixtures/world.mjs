/**
 * The dropbin glue's stand-in world (guide step 1.5): the active GM, one player, Item Piles' API and
 * hooks, socketlib, the FilePicker upload, AudioHelper, an `Actor` class for the entry's instanceof
 * checks, PIXI for the corpse eye, the fake DOM, scenes with notes and tokens, and embedded writes
 * logged to `F.calls`. Synthetic only.
 */

import { readFileSync } from "node:fs";
import { StubCollection, installFoundry, makeDoc, makeScene, makeToken, makeUser } from "../kit/foundry-stub.mjs";
import { installDom } from "./dom.mjs";

export const GM = "gmUser0000000001";
export const PLAYER = "player0000000001";
export class Actor {}

const ip = data => ({ "item-piles": { data } });

export async function dropbinWorld() {
  const lang = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
  const F = await installFoundry({
    user: makeUser({ id: GM, name: "Gamemaster", isGM: true }),
    users: [{ id: PLAYER, name: "Pat", isGM: false }],
    lang,
    modules: ["pentaryn-dropbin", "item-piles", "socketlib"],
  });
  installDom();
  globalThis.Actor = Actor;
  F.game.packs = new Map();
  F.calls.socket = [];

  const notify = level => (message, opts) => {
    const token = { level, message: String(message) };
    F.calls.push({ op: "notify", level, message: String(message), opts: opts ?? null, token });
    return token;
  };
  for (const level of ["info", "warn", "error"]) F.ui.notifications[level] = notify(level);
  F.ui.actors = { render: () => F.calls.push({ op: "ui.actors.render" }) };
  F.ui.journal = { render: () => F.calls.push({ op: "ui.journal.render" }) };

  const piles = new Set();
  F.piles = piles;
  F.game.itempiles = {
    hooks: { ITEM: { DROP: "item-piles-dropItem" } },
    API: {
      ACTOR_CLASS_TYPE: "character",
      isValidItemPile: doc => piles.has(doc) || piles.has(doc?.actor) || !!doc?.flags?.["item-piles"]?.data?.enabled,
      isItemPileEmpty: () => false,
      getActorFlagData: actor => ({ ...(actor?.flags?.["item-piles"]?.data ?? {}) }),
      transferEverything: async (...a) => F.calls.push({ op: "transferEverything", args: a.map(x => x?.name ?? x) }),
      turnTokensIntoItemPiles: async docs => F.calls.push({ op: "turnTokensIntoItemPiles", n: docs.length }),
      revertTokensFromItemPiles: async docs => F.calls.push({ op: "revertTokensFromItemPiles", n: docs.length }),
    },
  };
  globalThis.socketlib = {
    registerModule: id => {
      F.calls.push({ op: "socketlib.registerModule", id });
      return {
        register: (name, fn) => { F.calls.push({ op: "socketlib.register", name, fn: typeof fn }); },
        executeAsGM: (name, data) => { F.calls.push({ op: "executeAsGM", name, data: F.plain(data) }); return 99; },
      };
    },
  };
  F.foundry.applications.apps = { FilePicker: { implementation: {
    upload: async (source, dir, file, body, opts) => {
      F.calls.push({ op: "upload", source, dir, name: file.name, type: file.type, body, opts, bytes: (await file.text()).length });
      return { status: "success" };
    },
  } } };
  F.foundry.applications.api.DialogV2 = { confirm: async () => F.confirm ?? false };
  F.foundry.audio = { AudioHelper: { play: (data, broadcast) => F.calls.push({ op: "AudioHelper.play", data, broadcast }) } };
  F.canvas.interface = { createScrollingText: (...a) => F.calls.push({ op: "scrollingText", text: a[1] }) };
  F.canvas.tokens = { placeables: [], controlled: [] };

  class Graphics {
    constructor() { F.calls.clears ??= 0; }
    clear() { F.calls.clears = (F.calls.clears ?? 0) + 1; return this; }
    beginFill() { return this; }
    drawCircle() { return this; }
    endFill() { return this; }
  }
  class Sprite {
    constructor(tex) { this.tex = tex; this.anchor = { set: () => {} }; }
  }
  class Container {
    constructor() { this.children = []; this.position = { set: (x, y) => { this.position.x = x; this.position.y = y; } }; }
    addChild(...c) { for (const x of c) { x.parent = this; this.children.push(x); } return c[0]; }
  }
  globalThis.PIXI = { Graphics, Sprite, Container };
  // Actor.implementation.updateDocuments (items-journal-25): one logged batch; each actor's changes are
  // applied and updateActor fires per document, as Foundry does.
  Actor.implementation = Actor;
  Actor.updateDocuments = async (updates, options = {}) => {
    F.calls.push({ op: "Actor.updateDocuments", data: F.plain(updates) });
    const out = [];
    for (const { _id, ...changes } of updates) {
      const doc = F.game.actors.get(_id);
      const expanded = F.foundry.utils.expandObject(changes);
      F.foundry.utils.mergeObject(doc, expanded);
      Hooks.callAll("updateActor", doc, expanded, options, F.game.user.id);
      out.push(doc);
    }
    return out;
  };
  F.foundry.canvas = { loadTexture: async src => ({ src, baseTexture: {} }) };
  return F;
}

/** An Actor (instanceof Actor) with items and logged embedded writes. */
export function makeActor(F, data, { items = [] } = {}) {
  const actor = makeDoc("Actor", { type: "character", prototypeToken: { sight: { enabled: false }, flags: {} }, effects: [], ...data });
  Object.setPrototypeOf(actor, Actor.prototype);
  const coll = new StubCollection();
  Object.defineProperty(actor, "items", { value: coll, enumerable: false });
  for (const it of items) {
    const item = makeDoc("Item", it, { parent: actor, collection: coll });
    coll.set(item.id, item);
  }
  actor.createEmbeddedDocuments = async (type, list, options) => {
    F.calls.push({ op: "createEmbeddedDocuments", on: actor.name, type, data: F.plain(list), options: F.plain(options) });
    return list.map(d => makeDoc(type, d, { parent: actor }));
  };
  actor.getActiveTokens = () => [];
  F.game.actors.set(actor.id, actor);
  return actor;
}

/** A scene with tokens, notes and logged updateEmbeddedDocuments. */
export function addScene(F, { id, name = "S", tokens = [], notes = [] }) {
  const scene = makeScene({ id, name });
  for (const t of tokens) {
    const tok = makeToken(t, scene);
    tok.collection = scene.tokens;
    scene.tokens.set(tok.id, tok);
  }
  const nc = new StubCollection(notes.map(n => makeDoc("Note", n, { parent: scene })));
  Object.defineProperty(scene, "notes", { value: nc, enumerable: false });
  scene.updateEmbeddedDocuments = async (type, updates) => {
    F.calls.push({ op: "updateEmbeddedDocuments", on: scene.id, type, data: F.plain(updates) });
    return updates;
  };
  F.game.scenes.set(scene.id, scene);
  return scene;
}

export { ip };
