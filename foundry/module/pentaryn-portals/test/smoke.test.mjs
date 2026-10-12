// Finding -25's import smoke (guide S3): every file of the split imports under the Foundry stub and
// exposes its named exports; each feature exports install/uninstall; nothing imports the entry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { importGraph } from "./kit/harness.mjs";
import { boot } from "./fixtures/world.mjs";

await boot();

const EXPORTS = {
  "portals-core.mjs": ["MODULE", "SHORT", "NS", "VERSION", "CONTRACT", "I18N", "CSS", "HOOKS", "SNAP_DIR", "esc", "cardData", "cardHTML",
    "dialogIdParts", "translateShapes", "cropWindow", "blockingWallCoords", "tokenBox", "occupiedBy", "samplePoints"],
  "settings.mjs": ["SETTINGS", "setting", "registerSettings"],
  "scene-adapter.mjs": ["configureSceneAdapter", "cardFor", "behaviorOf", "teleportBehaviors", "toAbsolute", "destinationsOf", "snapshot",
    "moveRegionDocs", "lookAt", "folderNames", "recordOf", "partyRecords", "landingPlaces", "carryTo", "confirmParty", "teleportParty",
    "linkRegions", "unlinkRegion"],
  "card-app.mjs": ["PortalCard", "configureCardApp", "SWITCHES"],
  "party.mjs": ["install", "uninstall", "cameThroughPortal", "spreadArrival", "bringFollowers"],
  "badges.mjs": ["install", "uninstall", "drawBadges", "badges", "seen", "editing", "setEditing", "refreshBadgeSight", "samplePoints",
    "badgeAt", "showTip", "hideTip", "openMenu", "closeMenu", "bindBoard", "moveRegion"],
  "cards.mjs": ["install", "uninstall", "decorate", "plainQuestion", "preferTeleport", "injectConfig"],
};

for (const [file, names] of Object.entries(EXPORTS)) {
  test(`${file} imports and exports ${names.length} names`, async () => {
    const mod = await import(`../${file}`);
    for (const n of names) assert.ok(n in mod, `${file} exports ${n}`);
  });
}

test("the features: install and uninstall are functions", async () => {
  for (const f of ["party.mjs", "badges.mjs", "cards.mjs"]) {
    const mod = await import(`../${f}`);
    assert.equal(typeof mod.install, "function", f);
    assert.equal(typeof mod.uninstall, "function", f);
  }
});

test("nothing imports the entry; no feature imports another feature", () => {
  const graph = importGraph(new URL("..", import.meta.url), { exclude: ["lib/", "test/"] });
  const features = new Set(["party.mjs", "badges.mjs", "cards.mjs"]);
  for (const [from, tos] of Object.entries(graph)) {
    assert.equal([...tos].includes("portals.mjs"), false, `${from} imports the entry`);
    if (features.has(from)) for (const to of tos) assert.equal(features.has(to), false, `${from} → ${to}`);
  }
});
