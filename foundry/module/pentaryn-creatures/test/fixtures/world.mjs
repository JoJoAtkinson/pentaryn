/**
 * The creatures test world: a GM, two players, three scenes, a Token placeable class with an
 * `isVisible` getter, a DOM, a recording canvas and a recording `updateEmbeddedDocuments`.
 *
 * Synthetic data only (test/ ships with the module).
 *
 * Actors (player = Rook, PLAYER):
 *   aPC      character, Rook's own character (user.character)
 *   aImp     npc, owned by Rook (a summon)
 *   aEye     npc, owned by Rook (Arcane Eye; its token image is a video)
 *   aHandle  npc, default OWNER, actor flag pentaryn-aoe.handleActor (an aoe area handle)
 *   aHandle2 npc, default OWNER, no actor flag (its token carries pentaryn-aoe.handle)
 *   aPile    npc, default OWNER (Item Piles; token flag) · aPile2 npc, default OWNER, actor flag
 *   aGob     npc, GM only
 *   aMara    character, owned by the second player (not Rook)
 *   aWolf    character, owned by Rook, flags.dnd5e.originalActor = aPC (Wild Shape form)
 *
 * Scene ALPHA (viewed): tPC, tImp ("Imp <i>&", dark), tEye (dark, video image), tTorch (aImp,
 *   own light 20/40), tHid (aImp, GM-hidden), tHandle, tHandle2, tPile, tPile2, tGob, tMara, tGhost
 *   (no actor). Scene BETA: tImpB (aImp, dark). Scene GAMMA: no tokens.
 */
import { installFoundry, makeDoc } from "../kit/foundry-stub.mjs";
import { installDom } from "./dom.mjs";
import { readFileSync } from "node:fs";

export const MODULE = "pentaryn-creatures";
export const GM = "gmUser0000000001";
export const PLAYER = "plyrUser00000001";
export const PLAYER2 = "plyrUser00000002";
export const ALPHA = "sceneAlpha000001";
export const BETA = "sceneBeta0000001";
export const GAMMA = "sceneGamma000001";
export const LANG = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));

const OWN = { [PLAYER]: 3 };
export const ACTORS = [
  { id: "aPC", name: "Talo", type: "character", img: "actors/talo.webp", ownership: { default: 0, ...OWN }, hasPlayerOwner: true },
  { id: "aImp", name: "Imp", type: "npc", img: "actors/imp.webp", ownership: { default: 0, ...OWN }, hasPlayerOwner: true },
  { id: "aEye", name: "Arcane Eye", type: "npc", img: "actors/eye.webp", ownership: { default: 0, ...OWN }, hasPlayerOwner: true },
  { id: "aHandle", name: "Area handle", type: "npc", img: "icons/handle.webp", ownership: { default: 3 }, hasPlayerOwner: true, flags: { "pentaryn-aoe": { handleActor: true } } },
  { id: "aHandle2", name: "Area handle 2", type: "npc", img: "icons/handle.webp", ownership: { default: 3 }, hasPlayerOwner: true },
  { id: "aPile", name: "Chest", type: "npc", img: "icons/chest.webp", ownership: { default: 3 }, hasPlayerOwner: true },
  { id: "aPile2", name: "Sack", type: "npc", img: "icons/sack.webp", ownership: { default: 3 }, hasPlayerOwner: true, flags: { "item-piles": { data: { enabled: true } } } },
  { id: "aGob", name: "Goblin", type: "npc", img: "actors/gob.webp", ownership: { default: 0 }, hasPlayerOwner: false },
  { id: "aMara", name: "Mara", type: "character", img: "actors/mara.webp", ownership: { default: 0, [PLAYER2]: 3 }, hasPlayerOwner: true },
  { id: "aWolf", name: "Talo (Dire Wolf)", type: "character", img: "actors/wolf.webp", ownership: { default: 0, ...OWN }, hasPlayerOwner: true, flags: { dnd5e: { originalActor: "aPC" } } },
];

const dark = { bright: 0, dim: 0 };
const T = (id, actorId, o = {}) => ({ id, name: id, actorId, texture: { src: `tokens/${id}.webp` }, light: { ...dark }, ...o });
export const ALPHA_TOKENS = () => [
  T("tPC", "aPC", { name: "Talo" }),
  T("tImp", "aImp", { name: "Imp <i>&" }),
  T("tEye", "aEye", { name: "Arcane Eye", texture: { src: "tokens/eye.webm" } }),
  T("tTorch", "aImp", { name: "Imp with torch", light: { bright: 20, dim: 40 } }),
  T("tHid", "aImp", { name: "Hidden imp", hidden: true }),
  T("tHandle", "aHandle", { name: "Fireball (Caster)" }),
  T("tHandle2", "aHandle2", { name: "Cloud (Caster)", flags: { "pentaryn-aoe": { handle: "r1" } } }),
  T("tPile", "aPile", { name: "Chest", flags: { "item-piles": { data: { enabled: true } } } }),
  T("tPile2", "aPile2", { name: "Sack" }),
  T("tGob", "aGob", { name: "Goblin" }),
  T("tMara", "aMara", { name: "Mara" }),
  T("tGhost", "missing", { name: "Ghost" }),
];

/** Let pending promise callbacks run (mocked timers do not drain microtasks). */
export const drain = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

/**
 * @param {{ player?: boolean, getter?: boolean, libWrapper?: "none"|"ok"|"throws"|"global-only",
 *   libWrapperModule?: boolean, settings?: object, wolf?: boolean }} o
 */
export async function setupWorld({ player = false, getter = true, libWrapper = "none", libWrapperModule, settings = {}, wolf = false } = {}) {
  const F = await installFoundry({
    user: player ? { id: PLAYER, name: "Rook", isGM: false, character: null } : { id: GM, name: "Gamemaster", isGM: true },
    users: [
      player ? { id: GM, name: "Gamemaster", isGM: true } : { id: PLAYER, name: "Rook", isGM: false },
      { id: PLAYER2, name: "Wren", isGM: false },
    ],
    actors: ACTORS,
    scenes: [
      { id: ALPHA, name: "Alpha", tokens: [...ALPHA_TOKENS(), ...(wolf ? [T("tWolf", "aWolf", { name: "Talo (Dire Wolf)" })] : [])] },
      { id: BETA, name: "Beta", tokens: [T("tImpB", "aImp", { name: "Imp" })] },
      { id: GAMMA, name: "Gamma" },
    ],
    currentScene: ALPHA,
    lang: LANG,
    modules: (libWrapperModule ?? (libWrapper === "ok" || libWrapper === "throws")) ? ["lib-wrapper"] : [],
    activeScopes: [MODULE, "pentaryn-aoe", "item-piles"],
    settings,
  });
  const W = { F, console: [], writes: [], reads: [], wrapped: [], pans: [], sheets: [], activations: 0, failWrite: [] };

  /* game.user.character → the PC actor (Rook) */
  const rook = F.game.users.get(PLAYER);
  rook.character = F.game.actors.get("aPC");

  /* actors: sheets that record, isToken false */
  for (const a of F.game.actors) {
    a.isToken = false;
    a.sheet = { render: opts => W.sheets.push({ actor: a.id, opts }) };
  }

  /* tokens: ownership through the actor, as TokenDocument does */
  for (const scene of F.game.scenes) {
    for (const tok of scene.tokens) {
      const base = tok.testUserPermission;
      Object.defineProperty(tok, "testUserPermission", {
        value(user, level = "OWNER") {
          return this.actor ? this.actor.testUserPermission(user, level) : base.call(this, user, level);
        },
        enumerable: false,
      });
      Object.defineProperty(tok, "isOwner", {
        get() {
          return this.testUserPermission(F.game.user, "OWNER");
        },
        enumerable: false,
      });
    }
    /** Scene#updateEmbeddedDocuments: recorded with its argument count, applied, update hooks fired. */
    scene.updateEmbeddedDocuments = async function (type, updates, ...rest) {
      W.writes.push({ scene: this.id, type, updates: F.plain(updates), argc: 2 + rest.length });
      if (W.failWrite.length) throw W.failWrite.shift();
      for (const { _id, ...changes } of updates) await this.tokens.get(_id).update(changes, rest[0] ?? {});
      return updates;
    };
  }

  /* reads of our settings (each syncScene pass reads lightRadius once) */
  const get = F.game.settings.get;
  W.failRead = new Set();   // keys whose read throws, as an unregistered setting does
  F.game.settings.get = (ns, key) => {
    W.reads.push(`${ns}.${key}`);
    if (W.failRead.has(key)) throw new Error(`"${ns}.${key}" is not a registered game setting`);
    return get(ns, key);
  };
  W.passes = () => W.reads.filter(r => r === `${MODULE}.lightRadius`).length;

  /* the Token placeable class: a core isVisible getter (unless getter: false) */
  const TokenClass = F.foundry.canvas.placeables.Token;
  W.TokenClass = TokenClass;
  if (getter) {
    Object.defineProperty(TokenClass.prototype, "isVisible", {
      get() {
        return this.coreVisible === true;
      },
      configurable: true,
      enumerable: false,
    });
    W.coreGetter = Object.getOwnPropertyDescriptor(TokenClass.prototype, "isVisible").get;
  }

  /* libWrapper */
  if (libWrapper !== "none") {
    globalThis.libWrapper = {
      register(...args) {
        W.wrapped.push(args);
        if (libWrapper === "throws") throw new Error("libWrapper says no");
        return 1;
      },
    };
  }

  /* placeables for the viewed scene */
  const alpha = F.game.scenes.get(ALPHA);
  W.placeable = (doc, o = {}) => {
    const t = new TokenClass();
    Object.assign(t, {
      id: doc.id,
      document: doc,
      controlled: false,
      center: { x: (doc.x ?? 0) + 50, y: (doc.y ?? 0) + 50 },
      renderFlags: { set: f => (W.flags ??= []).push([doc.id, f]) },
      control: opts => (W.controls ??= []).push([doc.id, opts]),
      ...o,
    });
    Object.defineProperty(t, "actor", { get: () => doc.actor, configurable: true });
    return t;
  };
  const placeables = [...alpha.tokens].map((d, i) => {
    d.x = i * 100;
    d.y = 200;
    return W.placeable(d);
  });
  Object.assign(F.canvas.tokens, {
    placeables,
    active: false,
    get: id => placeables.find(p => p.id === id),
    activate() {
      W.activations += 1;
      this.active = true;
    },
  });
  F.canvas.animatePan = to => W.pans.push(to);
  W.p = id => placeables.find(p => p.id === id);

  /* DOM */
  W.D = installDom();

  /* console: recorded, not printed */
  for (const level of ["warn", "error", "log", "info"]) {
    console[level] = (...args) => W.console.push([level, ...args.map(a => (a instanceof Error ? `Error: ${a.message}` : a))]);
  }
  W.lines = () => W.console.splice(0);

  W.scene = id => F.game.scenes.get(id);
  W.tok = (id, sceneId = id === "tImpB" ? BETA : ALPHA) => F.game.scenes.get(sceneId).tokens.get(id);
  W.strip = () => document.getElementById(MODULE);
  W.makeDoc = makeDoc;
  return W;
}

/** The module's world-level registration: what `game.modules.get(MODULE)` returns live. */
export function registerSelf(F, manifest) {
  F.game.modules.set(MODULE, { id: MODULE, active: true, version: manifest.version, title: manifest.title, flags: manifest.flags });
}
