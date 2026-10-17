/**
 * Synthetic world for the pins tests. Never real campaign data: test/ ships to Data/.
 * Ids are 16 characters, like Foundry's.
 *
 *   scenes  A (active) · B (Talo's token, two levels) · C
 *   users   the GM (stub default, role 4) · Claude the bot GM (role 3) · Talo's player · Mira's player
 *   actors  Talo (character) · Mira (character) · Wolf (Talo's wild-shape form) · Spirit (Talo's summon)
 */

import { readFileSync } from "node:fs";
import { installFoundry, makeToken } from "../kit/foundry-stub.mjs";

export const IDS = Object.freeze({
  gm: "gmUser0000000001",
  bot: "botGmUser0000001",
  taloUser: "taloUser00000001",
  miraUser: "miraUser00000001",
  talo: "taloActor0000001",
  mira: "miraActor0000001",
  wolf: "wolfForm00000001",
  spirit: "spiritActor00001",
  sceneA: "sceneAaaaaaaaaa1",
  sceneB: "sceneBbbbbbbbbb1",
  sceneC: "sceneCccccccccc1",
  levelB1: "levelB1000000001",
  levelB2: "levelB2000000001",
  taloTok: "taloTok000000001",
  miraTok: "miraTok000000001",
});

const LANG = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));

export const ACTORS = Object.freeze([
  { id: IDS.talo, name: "Talo", type: "character", ownership: { default: 0, [IDS.taloUser]: 3 } },
  { id: IDS.mira, name: "Mira", type: "character", ownership: { default: 0, [IDS.miraUser]: 3 } },
  { id: IDS.wolf, name: "Wolf", type: "npc", flags: { dnd5e: { originalActor: IDS.talo, previousActorIds: [IDS.talo] } } },
  { id: IDS.spirit, name: "Spirit", type: "npc" },
]);

export const SCENES = Object.freeze([
  { id: IDS.sceneA, name: "Harbour", active: true, tokens: [{ id: IDS.miraTok, name: "Mira", actorId: IDS.mira, actorLink: true }] },
  { id: IDS.sceneB, name: "Lighthouse", tokens: [{ id: IDS.taloTok, name: "Talo", actorId: IDS.talo, actorLink: true, level: IDS.levelB2, x: 500, y: 500 }] },
  { id: IDS.sceneC, name: "Cave", tokens: [] },
]);

export const USERS = Object.freeze([
  { id: IDS.bot, name: "Claude", isGM: true, role: 3 },
  { id: IDS.taloUser, name: "Talo's player", isGM: false, flags: { "pentaryn-pins": { actor: IDS.talo } } },
  { id: IDS.miraUser, name: "Mira's player", isGM: false },
]);

/** installFoundry() options for a world with this module active. */
export function world(moduleId, extra = {}) {
  return {
    actors: ACTORS.map(a => structuredClone(a)),
    scenes: SCENES.map(s => structuredClone(s)),
    users: USERS.map(u => structuredClone(u)),
    modules: [{ id: moduleId, version: "0.1.0" }],
    lang: LANG,
    ...extra,
  };
}

/**
 * The stub plus what pins touches: a Scene document class whose prototype carries core's `view`,
 * `_onActivate` and `pullUsers` (recorded, never real), a canvas with `loading`, levels on B, a
 * game.socket with `on`/`off` and `F.socketFire` (core's own "pullToScene" listener, registered
 * after pins', as Game#activateSocketListeners does), and helpers that replay core's token
 * create/delete/update hooks.
 *
 * The stub's `view` mirrors core where it matters: called while `canvas.loading` it toasts core's
 * loading warning and does nothing; otherwise it sets `loading` two microtasks later (core sets it
 * only inside its queued #draw, after an await), and the draw completes when the
 * test calls `F.release()` (or at once with `F.autoDraw = true`, the default), firing `canvasReady`
 * BEFORE `loading` goes false, as board.mjs:1241/1251 do.
 */
export async function pinsWorld(moduleId, extra = {}) {
  const F = await installFoundry(world(moduleId, extra));
  F.views = [];
  F.pulls = [];
  /** A canvas level object: `isView` while it is the drawn level (core's Level#isView). */
  F.level = id => ({ id, get isView() { return canvas.level === this; } });
  F.activations = [];
  F.unviews = [];
  F.autoDraw = true;
  const pending = [];
  F.release = () => pending.shift()?.();
  F.pendingDraws = () => pending.length;

  class Scene {
    async view(options = {}) {
      F.views.push([this.id, structuredClone(options)]);
      if (canvas.loading) {
        ui.notifications.warn("You cannot switch Scenes until resources finish loading for your current view.");
        return undefined;
      }
      // core redraws only when the scene or the asked level changes (scene.mjs view)
      if (canvas.scene?.id === this.id && (options.level === undefined || options.level === canvas.level?.id)) return this;
      // core queues #draw and sets `loading` only after `await this.transition.cancel()`
      // (board.mjs #draw): a view called in the same tick still sees loading false
      await Promise.resolve();
      await Promise.resolve();
      canvas.loading = true;
      if (!F.autoDraw) await new Promise(r => pending.push(r));
      else await Promise.resolve();
      canvas.scene = this;
      canvas.level = options.level ? F.level(options.level) : null;
      canvas.ready = true;
      Hooks.call("canvasReady", canvas);
      canvas.loading = false;
      return this;
    }
    _onActivate(active, operation) {
      F.activations.push([this.id, active]);
      if (active) this.view(operation?.viewOptions);
      else this.unview();
    }
    unview() {
      F.unviews.push(this.id);
      if (canvas.scene === this) canvas.scene = null;
    }
    /** core's Scene#pullUsers (GM-only, emits pullToScene per active user): recorded. */
    pullUsers(users, viewOptions = {}) {
      if (!game.user.isGM) throw new Error("You must be a GM to pull players to a scene");
      const ids = [...users].map(u => game.users.get(u?.id ?? u)).filter(u => u?.active).map(u => u.id);
      F.pulls.push([this.id, ids, structuredClone(viewOptions)]);
    }
  }
  // core's TokenDocument#testUserPermission answers as the token's actor (getUserLevel,
  // common/documents/token.mjs:940-945); the kit stub reads only the token's own `ownership`. Every
  // token on a pins scene gets core's answer (or its own stub ownership, for a test that sets one),
  // so pins' adapter asks the token alone, as in Foundry (code review CR4).
  const tokenPermission = tok => {
    if (!tok || tok.__corePermission) return tok;
    const own = tok.testUserPermission;
    Object.defineProperty(tok, "testUserPermission", {
      value(user, level = "OWNER") {
        if (own?.call(this, user, level) === true) return true;
        const actor = game.actors.get(this.actorId);
        if (actor) return actor.testUserPermission(user, level) === true;
        return !!user?.isGM || !this.actorId;
      },
      enumerable: false, configurable: true,
    });
    Object.defineProperty(tok, "__corePermission", { value: true, enumerable: false });
    return tok;
  };
  for (const s of game.scenes.values()) {
    for (const t of s.tokens.values()) tokenPermission(t);
    const set = s.tokens.set.bind(s.tokens);
    s.tokens.set = (id, tok) => set(id, tokenPermission(tok));
  }
  CONFIG.Scene = { documentClass: Scene };
  for (const s of game.scenes.values()) Object.setPrototypeOf(s, Scene.prototype);
  game.scenes.get(IDS.sceneB).levels = new Map([[IDS.levelB1, { id: IDS.levelB1 }], [IDS.levelB2, { id: IDS.levelB2 }]]);
  for (const id of [IDS.sceneA, IDS.sceneC]) game.scenes.get(id).levels = new Map();
  Object.defineProperty(game.scenes, "active", { get() { return this.contents.find(s => s.active) ?? null; }, configurable: true });

  Object.assign(canvas, {
    ready: false, loading: false, scene: null, level: null,
    pans: [],
    animatePan(p) { this.pans.push(p); },
    clientCoordinatesFromCanvas: p => ({ x: p.x - (canvas.offset?.x ?? 0), y: p.y - (canvas.offset?.y ?? 0) }),
    canvasCoordinatesFromClient: p => ({ x: p.x + (canvas.offset?.x ?? 0), y: p.y + (canvas.offset?.y ?? 0) }),
    offset: { x: 0, y: 0 },
    tokens: { placeables: [], active: true },
    walls: { placeables: [] },
    dimensions: { uiScale: 1 },
    currentMouseManager: null,
  });
  globalThis.innerWidth = 1920;
  globalThis.innerHeight = 1080;

  // socket.io-client: listeners per event in registration order; core's pullToScene handler last
  const socketListeners = new Map();
  Object.assign(game.socket, {
    on: (event, fn) => void socketListeners.set(event, [...(socketListeners.get(event) ?? []), fn]),
    off: (event, fn) => void socketListeners.set(event, (socketListeners.get(event) ?? []).filter(f => f !== fn)),
  });
  const coreSocket = { pullToScene: (sceneId, viewOptions) => game.scenes.get(sceneId)?.view(viewOptions) };
  /** A server broadcast reaching this client: every module listener, then core's own handler. */
  F.socketFire = (event, ...args) => {
    for (const fn of [...(socketListeners.get(event) ?? [])]) fn(...args);
    return coreSocket[event]?.(...args);
  };
  F.socketListeners = event => (socketListeners.get(event) ?? []).length;

  /** Core's create: a token on `sceneId` (the hooks fire with `userId`, default the GM). */
  F.createToken = (sceneId, data, { userId = IDS.gm, options = {} } = {}) => {
    const scene = game.scenes.get(sceneId);
    const tok = makeToken({ actorLink: true, ...data }, scene);
    tok.collection = scene.tokens;
    scene.tokens.set(tok.id, tok);
    F.fire("createToken", tok, options, userId);
    return tok;
  };
  /** Core's delete (options may carry `replacements`). */
  F.deleteToken = (tok, options = {}, { userId = IDS.gm } = {}) => {
    tok.parent.tokens.delete(tok.id);
    F.fire("deleteToken", tok, options, userId);
  };
  /** Core's update: apply then fire updateToken. */
  F.updateToken = (tok, changes, { userId = IDS.gm } = {}) => {
    Object.assign(tok, changes);
    F.fire("updateToken", tok, changes, {}, userId);
  };
  return F;
}

export const flush = () => new Promise(r => setImmediate(r));
