/**
 * Synthetic world cuts for the tests. Never real campaign data: test/ ships to Data/.
 * Ids are 16 characters, like Foundry's.
 */

export const IDS = Object.freeze({
  town: "scenetown0000001",
  cave: "scenecave0000001",
  caveLower: "levellower000001",
  player: "player0000000001",
  /** On the cave's lower level: one the player owns, one it only observes (resume 0.2.0, CR10). */
  caveOwned: "caveTalo0000001",
  caveObserved: "caveOthr0000001",
});

export const SCENES = Object.freeze([
  { id: IDS.town, name: "Town", active: true },
  { id: IDS.cave, name: "Cave", active: false, tokens: [
    { id: IDS.caveOwned, level: IDS.caveLower, ownership: { [IDS.player]: 3 } },
    { id: IDS.caveObserved, level: IDS.caveLower, ownership: { [IDS.player]: 2 } },
  ] },
]);

export const USERS = Object.freeze([{ id: IDS.player, name: "P", isGM: false }]);

/** installFoundry() options for a world with this module active. */
export function world(moduleId, extra = {}) {
  return {
    scenes: SCENES.map(s => structuredClone(s)),
    users: USERS.map(u => ({ ...u })),
    modules: [{ id: moduleId, version: "0.1.0" }],
    ...extra,
  };
}
