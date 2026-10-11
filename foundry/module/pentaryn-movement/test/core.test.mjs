// Core checks (guide S1): the 89 legacy checks of test/legacy-core.mjs as node:test cases, with the
// legacy JSON-equality semantics (key order counts). movement-core.mjs is imported first and bare:
// no Foundry globals exist in this file, which is the purity proof.
import * as core from "../movement-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { POLICIES, DEFAULT_POLICY, normalizePolicy, combatOnScene, ghostAllowed, ghostFor, constrainFor,
  playerTool, gmTool, flipPolicy, wishToClear, ghostBack, RAISE, ownedRank, meshSort, compareTokens,
  pinsUnderTokens } = core;

let count = 0;
function check(name, got, want) {
  count += 1;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  test(name, () => assert.equal(g, w));
}

test("movement-core loads with no Foundry globals", () => {
  for (const g of ["game", "canvas", "ui", "foundry", "CONFIG", "Hooks"]) assert.equal(globalThis[g], undefined, g);
});

/* ── normalizePolicy ─────────────────────────────────────────────────────── */
check("three policies, in dropdown order", POLICIES, ["off", "exploration", "always"]);
check("default is exploration", DEFAULT_POLICY, "exploration");
for (const p of POLICIES) check(`${p} kept`, normalizePolicy(p), p);
check("unknown → default", normalizePolicy("sometimes"), "exploration");
check("undefined → default", normalizePolicy(undefined), "exploration");
check("boolean → default", normalizePolicy(true), "exploration");

/* ── combatOnScene ───────────────────────────────────────────────────────── */
const S = "sceneA", T = "sceneB";
const linked = (o = {}) => ({ active: true, sceneId: S, started: false, combatantSceneIds: [S], ...o });
check("no combats", combatOnScene([], S), false);
check("undefined list", combatOnScene(undefined, S), false);
check("linked with combatants, round 0 → combat", combatOnScene([linked()], S), true);
check("linked, started → combat", combatOnScene([linked({ combatantSceneIds: [], started: true })], S), true);
check("linked, empty and not started → not yet", combatOnScene([linked({ combatantSceneIds: [] })], S), false);
check("linked to another scene → not here", combatOnScene([linked()], T), false);
check("inactive encounter ignored", combatOnScene([linked({ active: false, started: true })], S), false);
check("unlinked, combatant here → combat", combatOnScene([{ active: true, sceneId: null, started: true, combatantSceneIds: [T, S] }], S), true);
check("unlinked, combatants elsewhere → not here", combatOnScene([{ active: true, sceneId: null, started: true, combatantSceneIds: [T] }], S), false);
check("unlinked, no combatants → not here", combatOnScene([{ active: true, sceneId: null, started: true, combatantSceneIds: [] }], S), false);
check("no scene id → false", combatOnScene([linked()], null), false);
check("junk entries skipped", combatOnScene([null, {}, { active: true }], S), false);
check("one of several counts", combatOnScene([linked({ active: false }), linked({ sceneId: T }), linked()], S), true);

/* ── ghostAllowed ────────────────────────────────────────────────────────── */
check("off → never", ghostAllowed({ policy: "off", combatActive: false }), { allowed: false, reason: "off" });
check("off in combat → reason off", ghostAllowed({ policy: "off", combatActive: true }), { allowed: false, reason: "off" });
check("exploration, no combat → yes", ghostAllowed({ policy: "exploration", combatActive: false }), { allowed: true, reason: null });
check("exploration, combat → no", ghostAllowed({ policy: "exploration", combatActive: true }), { allowed: false, reason: "combat" });
check("always, combat → yes", ghostAllowed({ policy: "always", combatActive: true }), { allowed: true, reason: null });
check("junk policy behaves as exploration", ghostAllowed({ policy: "x", combatActive: true }), { allowed: false, reason: "combat" });
check("no args → exploration, no combat", ghostAllowed(), { allowed: true, reason: null });

/* ── ghostFor ────────────────────────────────────────────────────────────── */
const P = { isGM: false, policy: "exploration", combatActive: false, wish: true, isOwner: true };
check("player, owner, wish, exploration → ghost", ghostFor(P), true);
check("GM never via this module", ghostFor({ ...P, isGM: true }), false);
check("no wish → no", ghostFor({ ...P, wish: false }), false);
check("not owner → no", ghostFor({ ...P, isOwner: false }), false);
check("combat under exploration → no", ghostFor({ ...P, combatActive: true }), false);
check("combat under always → yes", ghostFor({ ...P, policy: "always", combatActive: true }), true);
check("policy off → no", ghostFor({ ...P, policy: "off" }), false);
check("no args → no", ghostFor(), false);

/* ── constrainFor ────────────────────────────────────────────────────────── */
const base = { ignoreWalls: false, ignoreCost: false, ignoreTokens: false, extra: 1 };
check("ghost sets the three flags, keeps the rest", constrainFor(base, true),
  { ignoreWalls: true, ignoreCost: true, ignoreTokens: true, extra: 1 });
check("no ghost → copy unchanged", constrainFor(base, false), base);
check("base not mutated", base.ignoreWalls, false);
check("no base → flags only", constrainFor(undefined, true), { ignoreWalls: true, ignoreCost: true, ignoreTokens: true });
check("no base, no ghost → {}", constrainFor(null, false), {});

/* ── playerTool ──────────────────────────────────────────────────────────── */
check("GM never sees the player button", playerTool({ isGM: true, policy: "always", wish: true }).visible, false);
check("hidden when policy off", playerTool({ isGM: false, policy: "off", wish: true }),
  { visible: false, active: false, state: "off" });
check("ready, not pressed", playerTool({ isGM: false, policy: "exploration", combatActive: false, wish: false }),
  { visible: true, active: false, state: "ready" });
check("on, pressed", playerTool({ isGM: false, policy: "exploration", combatActive: false, wish: true }),
  { visible: true, active: true, state: "on" });
check("combat: visible, not pressed even with wish", playerTool({ isGM: false, policy: "exploration", combatActive: true, wish: true }),
  { visible: true, active: false, state: "combat" });
check("always ignores combat", playerTool({ isGM: false, policy: "always", combatActive: true, wish: true }),
  { visible: true, active: true, state: "on" });

/* ── gmTool / flipPolicy ─────────────────────────────────────────────────── */
check("GM tool for GM only", gmTool({ isGM: false, policy: "always" }).visible, false);
check("GM tool pressed unless off", [gmTool({ isGM: true, policy: "off" }).active, gmTool({ isGM: true, policy: "exploration" }).active,
  gmTool({ isGM: true, policy: "always" }).active], [false, true, true]);
check("GM tool state is the policy", gmTool({ isGM: true, policy: "nonsense" }).state, "exploration");

check("flip off from exploration remembers it", flipPolicy("exploration", "exploration", false), { policy: "off", last: "exploration" });
check("flip off from always remembers always", flipPolicy("always", "exploration", false), { policy: "off", last: "always" });
check("flip on restores always", flipPolicy("off", "always", true), { policy: "always", last: "always" });
check("flip on restores exploration", flipPolicy("off", "exploration", true), { policy: "exploration", last: "exploration" });
check("flip on with junk memory → exploration", flipPolicy("off", "off", true), { policy: "exploration", last: "exploration" });
check("flip on while already on keeps mode", flipPolicy("always", "exploration", true), { policy: "always", last: "always" });
check("flip off while already off keeps memory", flipPolicy("off", "always", false), { policy: "off", last: "always" });
// Round trip: off → on → off → on lands where it started.
{
  let s = { policy: "always", last: "exploration" };
  s = flipPolicy(s.policy, s.last, false);
  s = flipPolicy(s.policy, s.last, true);
  check("round trip keeps always", s.policy, "always");
}

/* ── ghostBack (usability Area 8, L7) ───────────────────────────────────── */
check("fight over → tell the player", ghostBack({ cleared: "combat", policy: "exploration", combatActive: false, wish: false }), true);
check("fight still on → quiet", ghostBack({ cleared: "combat", policy: "exploration", combatActive: true, wish: false }), false);
check("never cleared → quiet", ghostBack({ cleared: null, policy: "exploration", combatActive: false, wish: false }), false);
check("already back on → quiet", ghostBack({ cleared: "combat", policy: "exploration", combatActive: false, wish: true }), false);
check("GM allows again → tell", ghostBack({ cleared: "off", policy: "always", combatActive: true, wish: false }), true);
check("GM still off → quiet", ghostBack({ cleared: "off", policy: "off", combatActive: false, wish: false }), false);

/* ── wishToClear ─────────────────────────────────────────────────────────── */
check("no wish → nothing to clear", wishToClear({ policy: "off", combatActive: true, wish: false }), null);
check("allowed → keep", wishToClear({ policy: "exploration", combatActive: false, wish: true }), null);
check("combat starts → clear (combat)", wishToClear({ policy: "exploration", combatActive: true, wish: true }), "combat");
check("GM turns off → clear (off)", wishToClear({ policy: "off", combatActive: false, wish: true }), "off");
check("always + combat → keep", wishToClear({ policy: "always", combatActive: true, wish: true }), null);

/* ── owned on top ────────────────────────────────────────────────────────── */
check("player's own token lifted", ownedRank({ isGM: false, enabled: true, isOwner: true }), 1);
check("someone else's token not lifted", ownedRank({ isGM: false, enabled: true, isOwner: false }), 0);
check("GM never lifts", ownedRank({ isGM: true, enabled: true, isOwner: true }), 0);
check("setting off → not lifted", ownedRank({ isGM: false, enabled: false, isOwner: true }), 0);
check("setting unread (undefined) → lifted", ownedRank({ isGM: false, isOwner: true }), 1);

check("mesh sort raised", meshSort(3, 1), 3 + RAISE);
check("mesh sort plain", meshSort(3, 0), 3);
check("mesh sort junk → 0", meshSort(NaN, 0), 0);
check("raised beats any plain sort", meshSort(0, 1) > meshSort(1e6, 0), true);

// Interaction order: last in the sorted list takes the click.
const order = list => [...list].sort(compareTokens).map(t => t.id);
const friend = { id: "friend", elevation: 0, rank: 0, sort: 9, zIndex: 0, index: 1 };
const mine = { id: "mine", elevation: 0, rank: 1, sort: 2, zIndex: 0, index: 0 };
check("my token above a friend's with a higher sort", order([friend, mine]), ["friend", "mine"]);
check("order independent of input order", order([mine, friend]), ["friend", "mine"]);
const flyer = { id: "flyer", elevation: 30, rank: 0, sort: 0, zIndex: 0, index: 2 };
check("elevation still wins over owned", order([flyer, mine, friend]), ["friend", "mine", "flyer"]);
const mine2 = { id: "mine2", elevation: 0, rank: 1, sort: 2, zIndex: 2, index: 3 };
check("between two of mine, controlled (zIndex) wins", order([mine2, mine]), ["mine", "mine2"]);
check("ties fall back to last index", order([{ id: "b", index: 5 }, { id: "a", index: 1 }]), ["a", "b"]);

/* ── pinsUnderTokens ─────────────────────────────────────────────────────── */
// Synthetic: 100 px grid, a 1×1 PC at (500,200), a 2×2 NPC at (800,800).
const toks = [
  { id: "pc", name: "Hero", x: 500, y: 200, w: 100, h: 100, playerOwned: true },
  { id: "npc", name: "Ogre", x: 800, y: 800, w: 200, h: 200, playerOwned: false }
];
const notes = [
  { id: "n1", x: 550, y: 250, label: "Under the hero" },
  { id: "n2", x: 900, y: 950, label: "Under the ogre" },
  { id: "n3", x: 650, y: 250, label: "Beside the hero" },
  { id: "n4", x: 600, y: 300, label: "On the hero's corner" }
];
const hits = pinsUnderTokens(notes, toks);
check("three pins under tokens", hits.map(h => h.noteId), ["n1", "n4", "n2"]);
check("player-owned listed first", hits.map(h => h.playerOwned), [true, true, false]);
check("carries names", hits[0], { noteId: "n1", label: "Under the hero", tokenId: "pc", tokenName: "Hero", playerOwned: true });
check("beside is fine", hits.some(h => h.noteId === "n3"), false);
check("no notes → []", pinsUnderTokens([], toks), []);
check("junk skipped", pinsUnderTokens([null, { id: "x" }], [null, { id: "t", x: "a" }]), []);

test("all 89 legacy checks are ported", () => {
  assert.equal(count, 89);
});
