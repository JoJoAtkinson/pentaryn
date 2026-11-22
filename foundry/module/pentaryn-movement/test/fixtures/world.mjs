/**
 * The movement glue's stand-in world (guide S1): a player client viewing `sceneA`, one GM, the two
 * core/dnd5e prototypes the module wraps, a canvas with a token layer, scene controls and a
 * swappable `game.combats`. Synthetic only.
 */

import { readFileSync } from "node:fs";
import { installFoundry, makeUser } from "../kit/foundry-stub.mjs";

export const SCENE = "sceneA";
export const OTHER = "sceneB";
export const PLAYER = "player0000000001";
export const GM = "gmUser0000000001";

/** What the stub TokenLayer#_prepareKeyboardMovementUpdates returns next (tests set it). */
export const keyboard = { result: undefined, calls: 0 };

/** What the stub Token#_prepareDragLeftDropUpdates returns next, and the stub Token#_onClickLeft's calls (0.4.0). */
export const drop = { result: undefined, calls: 0 };
export const clicks = [];
/** Door icon presses core's DoorControl#_onMouseDown handled (a toggle). */
export const doors = [];

export async function movementWorld({ patchable = true } = {}) {
  const lang = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
  const F = await installFoundry({
    user: makeUser({ id: PLAYER, name: "Pat", isGM: false }),
    users: [{ id: GM, name: "Gamemaster", isGM: true }],
    lang,
    modules: ["pentaryn-movement"],
  });

  if (patchable) {
    F.CONFIG.Token.objectClass = class Token5e {
      _getDragConstrainOptions() {
        return { ignoreWalls: false, k: 1 };
      }
      /** Core's job shape; the stub passes the waypoints straight through (pathfind.test drives a real one). */
      findMovementPath(waypoints) {
        const path = waypoints.map(w => ({ ...w }));
        return { result: path, promise: Promise.resolve(path), cancel: () => {} };
      }
      /** Core's drop: [updates, options] as the test sets it (group.test drives a real shape). */
      _prepareDragLeftDropUpdates() {
        drop.calls += 1;
        return drop.result;
      }
      /** Core's click: records that it ran (select / release), after any stop. */
      _onClickLeft(event) {
        clicks.push({ token: this, event });
      }
      /** Core's stopAnimation: resolves (does not empty) each context's chain, then clears the contexts. */
      stopAnimation() {
        for (const ctx of this.animationContexts?.values?.() ?? []) for (const link of ctx?.chain ?? []) link?.resolve?.();
        this.animationContexts?.clear?.();
      }
    };
    // Core's CanvasAnimation.animate, as 14.370 orders it: the executor runs the first frame synchronously
    // (`first`, which may complete the animation and start a nested one of the same name) before the
    // animation is registered under its name (live H1-01).
    F.foundry.canvas.animation = { CanvasAnimation: class CanvasAnimation {
      static animations = {};
      static STATES = Object.freeze({ FAILED: -2, TERMINATED: -1, WAITING: 0, RUNNING: 1, COMPLETED: 2 });
      static animate(attributes, { name, first } = {}) {
        if (name) this.terminateAnimation(name);
        const animation = { name, state: 1, resolve(completed) { if (this.state === 0 || this.state === 1) this.state = completed ? 2 : -1; } };
        first?.(animation);
        const promise = Promise.resolve();
        animation.promise = promise;
        this.animations[name] = animation;
        return promise;
      }
      static terminateAnimation(name) { this.animations[name]?.resolve(false); }
    } };
    // Core's door icon: a left press toggles the door (the stub records it).
    F.foundry.canvas.containers = { DoorControl: class DoorControl {
      _onMouseDown(event) {
        doors.push({ control: this, event });
        return "toggled";
      }
    } };
    F.CONFIG.Canvas = { layers: { tokens: { layerClass: class TokenLayer5e {
      _prepareKeyboardMovementUpdates() {
        keyboard.calls += 1;
        return keyboard.result;
      }
    } } } };
  }

  F.game.combats = { contents: [] };
  Object.assign(F.canvas, {
    ready: true,
    scene: { id: SCENE },
    tokens: {
      objects: { sortDirty: false, children: [] },
      setAllRenderFlags: flags => F.calls.push({ op: "setAllRenderFlags", flags }),
      recalculatePlannedMovementPaths: () => F.calls.push({ op: "recalculatePlannedMovementPaths" }),
    },
  });
  F.ui.controls = { rendered: true, render: opts => F.calls.push({ op: "controls.render", opts }) };
  for (const level of ["info", "warn"]) {
    F.ui.notifications[level] = (message, opts) => {
      F.calls.push({ op: "notify", level, message: String(message), opts: opts ?? null });
    };
  }
  F.foundry.applications.ui = { SceneControls: { buildToolclipItems: items => items.map(i => ({ ...i, built: true })) } };
  return F;
}

/** A Combat as `combatSummaries()` reads it. */
export function combat({ sceneId = SCENE, active = true, started = true, combatants = [{ sceneId }] } = {}) {
  return {
    active,
    started,
    scene: sceneId ? { id: sceneId } : null,
    _source: { scene: sceneId },
    combatants: { contents: combatants.map(c => ({ hidden: false, ...c })) },
  };
}

/**
 * A Token placeable as the patches and hooks read it. `actor` (optional, see actor() below) is the
 * token's actor, as the ghost-in-combat exception reads it (I1).
 */
export function token({ id = "t1", owner = true, sort = 0, elevation = 0, alpha = 1, docAlpha = 1, sceneId = SCENE, zIndex = 0, actor = undefined, name = id } = {}) {
  return {
    id,
    alpha,
    zIndex,
    mesh: { alpha, sort: null },
    document: { documentName: "Token", id, name, isOwner: owner, sort, elevation, alpha: docAlpha, parent: { id: sceneId }, actor },
  };
}

/**
 * A synthetic actor as the exception reads it: `items.contents` of `{ type, name }` and our flag.
 * `feats` and `spells` are item names; `flag` sets flags.pentaryn-movement.ghostInCombat. setFlag /
 * unsetFlag write `flags` in place and log to F.calls like the stub's documents do.
 */
export function actor({ id = "actor00000000001", name = "Creature", feats = [], spells = [], flag = undefined, calls = null } = {}) {
  const items = [...feats.map(n => ({ type: "feat", name: n })), ...spells.map(n => ({ type: "spell", name: n }))];
  const flags = flag === undefined ? {} : { "pentaryn-movement": { ghostInCombat: flag } };
  return {
    documentName: "Actor",
    id,
    name,
    uuid: `Actor.${id}`,
    flags,
    items: { contents: items },
    async setFlag(scope, key, value) {
      (this.flags[scope] ??= {})[key] = value;
      calls?.push({ op: "setFlag", uuid: this.uuid, scope, key, value });
      return this;
    },
    async unsetFlag(scope, key) {
      delete this.flags[scope]?.[key];
      calls?.push({ op: "unsetFlag", uuid: this.uuid, scope, key });
      return this;
    },
  };
}
