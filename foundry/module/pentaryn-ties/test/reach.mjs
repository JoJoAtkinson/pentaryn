#!/usr/bin/env node
/**
 * `canReach` — the one reach rule (ties-api.mjs). `node test/reach.mjs`.
 *
 * It runs on the GM's client, so "a scene this user could be looking at" has to be read off the
 * USER (`viewedScene`), never off the GM's own canvas. The 2026-10 usability run lost a whole
 * closer-look case to that: the player was on a scratch scene, the GM bridge on another, and
 * every inspection was refused with nothing but a console line on the GM's side.
 */
let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` (got ${got}, want ${want})`}`);
};

const scene = (id, actorIds) => ({ id, tokens: actorIds.map(actorId => ({ actorId })) });
const scenes = [scene("active", ["npcA"]), scene("scratch", ["npcB"]), scene("gmview", ["npcC"])];
globalThis.game = {
  scenes: Object.assign(scenes, { active: scenes[0], get: id => scenes.find(s => s.id === id) ?? null })
};
globalThis.canvas = { scene: scenes[2] }; // the GM is looking somewhere else entirely

const { canReach } = await import("../ties-api.mjs");
const actor = (id, limitedFor = []) => ({ id, testUserPermission: u => limitedFor.includes(u.id) });
const player = (id, viewedScene = null) => ({ id, isGM: false, viewedScene });

check("token on the active scene", canReach(player("p", "active"), actor("npcA")), true);
check("token on the scene the player is viewing (not active)", canReach(player("p", "scratch"), actor("npcB")), true);
check("token only on the GM's own canvas scene", canReach(player("p", "active"), actor("npcC")), false);
check("player with no viewed scene, token on active", canReach(player("p"), actor("npcA")), true);
check("player with no viewed scene, token elsewhere", canReach(player("p"), actor("npcB")), false);
check("LIMITED permission reaches anywhere", canReach(player("p"), actor("npcZ", ["p"])), true);
check("GM always reaches", canReach({ id: "gm", isGM: true }, actor("npcZ")), true);
check("no actor", canReach(player("p", "active"), null), false);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
