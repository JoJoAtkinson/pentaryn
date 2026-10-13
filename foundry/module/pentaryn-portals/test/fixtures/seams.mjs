/**
 * The one place the tests reach module internals. Since S3 they live in the split files; this shim
 * gathers the same names the checkpoint's `_internals` had, so no test changed. Import it only
 * after the Foundry stub is installed (the entry registers hooks at evaluation).
 */
export async function seams() {
  await import("../../portals.mjs");
  const core = await import("../../portals-core.mjs");
  const adapter = await import("../../scene-adapter.mjs");
  const settings = await import("../../settings.mjs");
  const party = await import("../../party.mjs");
  const badges = await import("../../badges.mjs");
  const cards = await import("../../cards.mjs");
  const app = await import("../../card-app.mjs");
  return {
    cardFor: adapter.cardFor, cardHTML: core.cardHTML, behaviorOf: adapter.behaviorOf,
    decorate: cards.decorate, plainQuestion: cards.plainQuestion, preferTeleport: cards.preferTeleport, injectConfig: cards.injectConfig,
    snapshot: adapter.snapshot,
    drawBadges: badges.drawBadges, badges: badges.badges, refreshBadgeSight: badges.refreshBadgeSight, samplePoints: badges.samplePoints,
    moveRegion: badges.moveRegion,
    recordOf: adapter.recordOf, partyRecords: adapter.partyRecords, landingPlaces: adapter.landingPlaces, carryTo: adapter.carryTo,
    confirmParty: adapter.confirmParty, teleportParty: adapter.teleportParty,
    spreadArrival: party.spreadArrival, bringFollowers: party.bringFollowers, cameThroughPortal: party.cameThroughPortal,
    linkRegions: adapter.linkRegions, destinationsOf: adapter.destinationsOf, passageRevealed: adapter.passageRevealed,
    teleportBehaviors: adapter.teleportBehaviors, toAbsolute: adapter.toAbsolute, folderNames: adapter.folderNames, lookAt: adapter.lookAt,
    setEditing: badges.setEditing, badgeAt: badges.badgeAt, showTip: badges.showTip, hideTip: badges.hideTip,
    openMenu: badges.openMenu, closeMenu: badges.closeMenu, bindBoard: badges.bindBoard,
    PortalCard: app.PortalCard, SETTINGS: settings.SETTINGS, setting: settings.setting, seen: badges.seen, editing: badges.editing,
    state: badges._state,
  };
}
