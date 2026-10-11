/**
 * Synthetic world cuts for the tests. Never real campaign data: test/ ships to Data/.
 * Ids are 16 characters, like Foundry's.
 */

export const IDS = Object.freeze({
  aldric: "aldric0000000001",
  miraA: "miraaa0000000001",
  miraB: "mirabb0000000001",
  sceneOne: "sceneone00000001",
  sceneTwo: "scenetwo00000001",
  tokOne: "tokone0000000001",
  tokTwo: "toktwo0000000001",
  player: "player0000000001",
});

export const ACTORS = Object.freeze([
  { id: IDS.aldric, name: "Aldric Vane", type: "npc", system: { attributes: { hp: { value: 9, max: 20 } } } },
  { id: IDS.miraA, name: "Mira", type: "npc", system: { attributes: { hp: { value: 5, max: 5 } } } },
  { id: IDS.miraB, name: "Mira", type: "npc", system: {} },
]);

export const SCENES = Object.freeze([
  { id: IDS.sceneOne, name: "Harbour", tokens: [{ id: IDS.tokOne, name: "Aldric", actorId: IDS.aldric }] },
  { id: IDS.sceneTwo, name: "Lighthouse", tokens: [{ id: IDS.tokTwo, name: "Aldric", actorId: IDS.aldric }] },
]);

export const USERS = Object.freeze([{ id: IDS.player, name: "P", isGM: false }]);

/** installFoundry() options for a world with this module active. */
export function world(moduleId, extra = {}) {
  return {
    actors: ACTORS.map(a => structuredClone(a)),
    scenes: SCENES.map(s => structuredClone(s)),
    users: USERS.map(u => ({ ...u })),
    modules: [{ id: moduleId, version: "0.1.0" }],
    ...extra,
  };
}
