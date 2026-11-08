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
    };
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
