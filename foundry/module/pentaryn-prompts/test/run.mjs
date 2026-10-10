#!/usr/bin/env node
/**
 * Fixtures for geometry-core.mjs — `node test/run.mjs`. No dependencies, no Foundry.
 * The import itself is a check: geometry-core.mjs must load with `game`, `canvas` and `foundry` undefined.
 * `UPDATE_SNAPSHOTS=1 node test/run.mjs` rewrites test/snapshots/*.txt (read the diff before committing).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const core = await import("../geometry-core.mjs");
const F = await import("./fixtures.mjs");
const {
  band, bearing, stepCost, DIAGONALS, occupiedSquares, dedupeSquares, nearestPair, squareDistanceFt, gaplessDistanceFt,
  rayPasses, classifySight, classifyBlocked, SENSE, DIR, DOOR, DOOR_STATE, groupScene, components, assignIds,
  callId, textHash, normalisePrompt, stripHtml, preview, nameplate, isoDate, relationText, idCompare, footprintLabel,
  footprintSquares, buildView, renderGather, LEGEND, placementFor, needsLockSize, panelSplit, distanceLine, atFeet,
  dialogPosition, SIZES, SIZE_BY_KEY, makeRel, testPoints, SEES_CAP
} = core;

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
const ok = (name, cond) => check(name, !!cond, true);

/* ── bands: every edge of the table ──────────────────────────────────────── */
for (const [ft, want] of [[0, "touching"], [5, "touching"], [10, "reach"], [15, "close"], [30, "close"], [35, "near"],
  [60, "near"], [65, "far"], [150, "far"], [155, "distant"], [1000, "distant"], [7.1, "reach"], [NaN, "distant"], ["x", "distant"]]) {
  check(`band ${ft}`, band(ft), want);
}

/* ── bearings: the eight points, ties, the same point ─────────────────── */
const O = { x: 0, y: 0 };
for (const [dx, dy, want] of [[0, -1, "N"], [1, -1, "NE"], [1, 0, "E"], [1, 1, "SE"], [0, 1, "S"], [-1, 1, "SW"], [-1, 0, "W"], [-1, -1, "NW"],
  [2, -1, "NE"], [3, -1, "E"], [-3, 1, "W"], [1, -3, "N"], [-1, -2, "NW"]]) {
  check(`bearing ${dx},${dy}`, bearing(O, { x: dx, y: dy }), want);
}
// exact sector edge, 22.5°: rounds clockwise to NE
check("bearing tie at 22.5° → NE", bearing(O, { x: Math.sin(Math.PI / 8), y: -Math.cos(Math.PI / 8) }), "NE");
check("bearing same point", bearing(O, O), "");

/* ── grid distance ───────────────────────────────────────────────────────── */
check("5e rule: diagonal costs 1", stepCost(3, 3), 3);
check("5-10-5 rule: 2 diagonals = 3", stepCost(2, 2, DIAGONALS.ALTERNATING_1), 3);
check("10-5-10 rule: 1 diagonal = 2", stepCost(1, 1, DIAGONALS.ALTERNATING_2), 2);
check("rectilinear", stepCost(2, 1, DIAGONALS.RECTILINEAR), 3);
const G = 100;
const sq = (x, y, w, h = w) => occupiedSquares({ x, y, w, h }, G);
check("1x1 squares", sq(200, 300, 100), [{ i: 3, j: 2 }]);
check("2x2 squares", sq(100, 100, 200).length, 4);
check("tiny occupies the square under its centre", sq(125, 125, 50), [{ i: 1, j: 1 }]);
check("tiny on a corner takes the square of its centre", sq(175, 175, 50), [{ i: 2, j: 2 }]);
check("dedupe 3D offsets", dedupeSquares([{ i: 1, j: 1, k: 0 }, { i: 1, j: 1, k: 1 }, { i: 1, j: 2 }]), [{ i: 1, j: 1 }, { i: 1, j: 2 }]);
const ft = (a, b, rule) => squareDistanceFt(a, b, { gridFt: 5, rule });
check("adjacent 1x1 = 5 ft", ft(sq(0, 0, 100), sq(100, 0, 100)), 5);
check("diagonal-adjacent 1x1 = 5 ft", ft(sq(0, 0, 100), sq(100, 100, 100)), 5);
check("1x1 vs 2x2, one gap = 10 ft (nearest squares)", ft(sq(0, 0, 100), sq(200, 0, 200)), 10);
check("2x2 vs 2x2 diagonal adjacent = 5 ft", ft(sq(0, 0, 200), sq(200, 200, 200)), 5);
check("tiny inside a mid's square = 0 ft", ft(sq(125, 125, 50), sq(100, 100, 100)), 0);
check("tiny vs 3x3 three squares off = 15 ft", ft(sq(25, 25, 50), sq(300, 0, 300)), 15);
check("5-10-5: 2 diagonal steps = 15 ft", ft(sq(0, 0, 100), sq(200, 200, 100), DIAGONALS.ALTERNATING_1), 15);
check("nearestPair overlap short-circuits", nearestPair([{ i: 0, j: 0 }], [{ i: 0, j: 0 }, { i: 5, j: 5 }]).cost, 0);
check("gridless: touching rounds up to 5", gaplessDistanceFt({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 100, h: 100 }, 20), 5);
check("gridless: 130 px gap at 20 px/ft = 6.5 → 10", gaplessDistanceFt({ x: 0, y: 0, w: 100, h: 100 }, { x: 230, y: 0, w: 100, h: 100 }, 20), 10);

/* ── sight against wall segments ─────────────────────────────────────────── */
const W = (x0, y0, x1, y1, o = {}) => ({ c: [x0, y0, x1, y1], sight: SENSE.NORMAL, dir: DIR.BOTH, door: DOOR.NONE, ds: DOOR_STATE.CLOSED, ...o });
const A = { x: 50, y: 50 }, B = { x: 50, y: 250 };
check("no walls → clear", rayPasses(A, B, []).clear, true);
check("wall across → blocked", rayPasses(A, B, [W(0, 150, 100, 150)]).clear, false);
check("wall beside → clear", rayPasses(A, B, [W(100, 150, 200, 150)]).clear, true);
check("sight NONE (e.g. invisible wall) → clear", rayPasses(A, B, [W(0, 150, 100, 150, { sight: SENSE.NONE })]).clear, true);
check("open door → clear", rayPasses(A, B, [W(0, 150, 100, 150, { door: DOOR.DOOR, ds: DOOR_STATE.OPEN })]).clear, true);
check("closed door → blocked", rayPasses(A, B, [W(0, 150, 100, 150, { door: DOOR.DOOR })]).clear, false);
check("one limited wall → clear", rayPasses(A, B, [W(0, 150, 100, 150, { sight: SENSE.LIMITED })]).clear, true);
check("two limited walls → blocked", rayPasses(A, B, [W(0, 120, 100, 120, { sight: SENSE.LIMITED }), W(0, 180, 100, 180, { sight: SENSE.LIMITED })]).clear, false);
check("collinear wall → clear", rayPasses(A, B, [W(50, 100, 50, 200)]).clear, true);
check("wall ending exactly at the ray's origin is not a crossing", rayPasses({ x: 0, y: 150 }, { x: 0, y: 300 }, [W(-50, 150, 50, 150)]).clear, true);
// one-way window along y=100 from x 0→200, open to the north (dir RIGHT: see test fixtures)
const win = W(0, 100, 200, 100, { dir: DIR.RIGHT });
check("one-way window: from above sees down", rayPasses({ x: 100, y: 50 }, { x: 100, y: 150 }, [win]).clear, true);
check("one-way window: from below is blocked", rayPasses({ x: 100, y: 150 }, { x: 100, y: 50 }, [win]).clear, false);
check("classify: clear", classifySight([A], [B], []), "LOS");
check("classify: closed door", classifySight([A], [B], [W(0, 150, 100, 150, { door: DOOR.DOOR })]), "door");
check("classify: secret door", classifySight([A], [B], [W(0, 150, 100, 150, { door: DOOR.SECRET })]), "secret door");
check("classify: wall", classifySight([A], [B], [W(0, 150, 100, 150)]), "wall");
check("classify: door and wall in series → wall", classifySight([A], [B], [W(0, 120, 100, 120, { door: DOOR.DOOR }), W(0, 180, 100, 180)]), "wall");
check("classify: any target point clear → LOS",
  classifySight([A], [{ x: 50, y: 250 }, { x: 150, y: 250 }], [W(0, 150, 90, 150)]), "LOS");
// thresholds (core's useThreshold): proximity 100 px = passes from within 100 px, blocks from farther
check("proximity wall: near observer sees through", rayPasses({ x: 50, y: 100 }, { x: 50, y: 300 }, [W(0, 150, 100, 150, { sight: SENSE.PROXIMITY, threshold: 100 })]).clear, true);
check("proximity wall: far observer is blocked", rayPasses({ x: 50, y: -100 }, { x: 50, y: 300 }, [W(0, 150, 100, 150, { sight: SENSE.PROXIMITY, threshold: 100 })]).clear, false);
check("reverse proximity: far observer sees through", rayPasses({ x: 50, y: -100 }, { x: 50, y: 300 }, [W(0, 150, 100, 150, { sight: SENSE.DISTANCE, threshold: 100 })]).clear, true);
check("door behind an open proximity wall is a door, not a wall",
  classifyBlocked([{ x: 50, y: 100 }], [{ x: 50, y: 300 }], [W(0, 150, 100, 150, { sight: SENSE.PROXIMITY, threshold: 100 }), W(0, 200, 100, 200, { door: DOOR.DOOR })]), "door");
check("classifyBlocked: locked door counts as a door", classifyBlocked([A], [B], [W(0, 150, 100, 150, { door: DOOR.DOOR, ds: DOOR_STATE.LOCKED })]), "door");

/* ── grouping: single linkage, no bridging ───────────────────────────────── */
{
  // two packs 40 ft apart; a built token 20 ft from each, seen by both
  const items = [
    F.prompt("a1", "mid", 0, 0, "a1"), F.prompt("a2", "mid", 1, 0, "a2"),
    F.prompt("b1", "mid", 9, 0, "b1"), F.prompt("b2", "mid", 10, 0, "b2"),
    F.built("bridge", 5, 0)
  ];
  const rel = makeRel(items, { gridSize: G });
  const { groups, contextOnly } = groupScene(["a1", "a2", "b1", "b2"], ["bridge"], rel);
  check("bridge: two groups stay two", groups.length, 2);
  check("bridge: built token joins both", groups.map(g => g.built), [["bridge"], ["bridge"]]);
  check("bridge: listed as shared in both", groups.map(g => g.shared), [["bridge"], ["bridge"]]);
  check("bridge: not context only", contextOnly, []);
  // without the bridge token the packs are still two; a built far away is context only
  const far = [...items.slice(0, 4), F.built("far", 30, 0)];
  const g2 = groupScene(["a1", "a2", "b1", "b2"], ["far"], makeRel(far, { gridSize: G }));
  check("far built → context only", g2.contextOnly, ["far"]);
  // a prompt between the packs DOES merge them (prompts link, built things don't)
  const merged = [...items.slice(0, 4), F.prompt("mid", "mid", 5, 0, "mid")];
  const g3 = groupScene(["a1", "a2", "b1", "b2", "mid"], [], makeRel(merged, { gridSize: G }));
  check("prompt between packs merges them", g3.groups.length, 1);
  // a wall between two prompts 10 ft apart: no link
  const walled = [F.prompt("w1", "mid", 0, 0, ""), F.prompt("w2", "mid", 2, 0, "")];
  const g4 = groupScene(["w1", "w2"], [], makeRel(walled, { gridSize: G, walls: [W(150, -100, 150, 300)] }));
  check("wall splits a 10 ft pair", g4.groups.length, 2);
  // one-way: either direction of sight links
  const oneway = [F.prompt("o1", "mid", 0, 0, ""), F.prompt("o2", "mid", 0, 2, "")];
  const g5 = groupScene(["o1", "o2"], [], makeRel(oneway, { gridSize: G, walls: [W(-100, 150, 300, 150, { dir: DIR.LEFT })] }));
  check("one-way sight still links", g5.groups.length, 1);
  check("components keeps input order", components(["c", "a", "b"], () => true), [["c", "a", "b"]]);
  // formation at 15 ft inside a 30 ft encounter
  const fm = [F.prompt("f1", "mid", 0, 0, ""), F.prompt("f2", "mid", 2, 0, ""), F.prompt("f3", "mid", 6, 0, "")];
  const g6 = groupScene(["f1", "f2", "f3"], [], makeRel(fm, { gridSize: G }));
  check("encounter of three at ≤30 ft", g6.groups[0].prompts, ["f1", "f2", "f3"]);
  check("formation is the ≤15 ft pair", g6.groups[0].formations.map(f => f.prompts), [["f1", "f2"]]);
}

/* ── deterministic ids and call on shuffled input ────────────────────────── */
{
  const base = buildView([F.warrenScene(), F.commonScene(true)]);
  const shuffle = arr => arr.map((v, i) => [((i * 7919) % 13) + i / 100, v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const shuffled = buildView([F.warrenScene(shuffle(F.warrenItems())), F.commonScene(true, shuffle(F.commonItems()))]);
  check("ids stable under shuffle", [...shuffled.ids.promptIds.entries()].sort(), [...base.ids.promptIds.entries()].sort());
  check("built ids stable under shuffle", [...shuffled.ids.builtIds.entries()].sort(), [...base.ids.builtIds.entries()].sort());
  check("call stable under shuffle", shuffled.view.call, base.view.call);
  check("text identical under shuffle", renderGather(shuffled.view), renderGather(base.view));
  check("call format", /^pm-[0-9a-f]{4}$/.test(base.view.call), true);
  const edited = F.warrenItems();
  edited[0] = F.prompt("boss", "mid", 5, 3, "Goblin boss, now with a hat.");
  check("call changes when a text changes", buildView([F.warrenScene(edited), F.commonScene(true)]).view.call === base.view.call, false);
  const moved = F.warrenItems();
  moved[0] = F.prompt("boss", "mid", 6, 3, F.warrenItems()[0].text);
  check("call ignores position", buildView([F.warrenScene(moved), F.commonScene(true)]).view.call, base.view.call);
  check("callId order-independent", callId([{ sceneId: "s", markerId: "a", text: "x" }, { sceneId: "s", markerId: "b", text: "y" }]),
    callId([{ sceneId: "s", markerId: "b", text: "y" }, { sceneId: "s", markerId: "a", text: "x" }]));
  check("textHash normalises whitespace", textHash("  boss \r\n"), textHash("boss"));
  ok("textHash differs on text", textHash("boss") !== textHash("bass"));
}

/* ── scenario 1: the warren (plan §8.2) ─────────────────────────────────── */
{
  const { view, manifest, ids } = buildView([F.warrenScene()]);
  const P = k => ids.promptIds.get(k);
  const s = view.scenes[0];
  check("warren: one pack E1 of five prompts + the shaman", s.encounters[0].members,
    [P("boss"), P("m2"), P("m1"), P("m3"), P("archer"), ids.builtIds.get("shaman")]);
  check("warren: boss is p1 (size desc, then reading order)", P("boss"), "p1");
  check("warren: E2 = guardian + chalice", s.encounters[1].prompts, [P("guardian"), P("chalice")]);
  check("warren: bugbear alone", s.alone, [P("bugbear")]);
  const bug = view.prompts[P("bugbear")];
  check("warren: bugbear sees nobody", bug.sees, []);
  check("warren: bugbear's nearest unseen is the door minion, behind the door",
    core.sortRelations(bug.unseen)[0], { id: P("m3"), ft: 15, bearing: "N", los: "door" });
  const archer = view.prompts[P("archer")];
  ok("warren: archer sees the boss through the one-way window", archer.sees.some(r => r.id === "p1"));
  ok("warren: boss does not see the archer", view.prompts.p1.unseen.some(r => r.id === P("archer") && r.los === "wall"));
  ok("warren: no LOS E1↔E2", !view.prompts.p1.sees.some(r => r.id === P("guardian")));
  check("warren: E2 relation line", s.relations[0], { from: "E2", to: "E1", ft: 35, los: false, bearing: "E", block: "wall" });
  check("warren: manifest prompt carries marker id + hash", manifest.prompts.p1.markerId, "tokboss");
  check("warren: manifest hash", manifest.prompts.p1.hash, textHash(F.warrenItems()[0].text));
  check("warren: manifest encounter members", manifest.encounters.E2.members, [P("guardian"), P("chalice")]);
  check("warren: manifest scene map", manifest.scenes, { s1: "sceneWarren" });
}

/* ── scenario 2: the common room, open door then closed ─────────────────── */
{
  const open = buildView([F.commonScene(true)]);
  const shut = buildView([F.commonScene(false)]);
  const cook = open.ids.promptIds.get("cook");
  check("common: party is one encounter", open.view.scenes[0].encounters[0].prompts.length, 4);
  check("common: the party is a formation", open.view.scenes[0].encounters[0].formations[0].filter(x => x.startsWith("p")).length, 4);
  check("common: cook alone", open.view.scenes[0].alone, [cook]);
  ok("common: cook seen through the open door at 35 ft", open.view.prompts.p2.sees.some(r => r.id === cook && r.ft === 35));
  ok("common: door closed → cook is a door line", shut.view.prompts.p2.unseen.some(r => r.id === cook && r.los === "door"));
  check("common: ids unchanged by the door", [...shut.ids.promptIds.entries()], [...open.ids.promptIds.entries()]);
  check("common: call unchanged by the door", shut.view.call, open.view.call);
  ok("common: kitchen pile is context only (beside a loner)", open.view.scenes[0].contextOnly.length === 1);
}

/* ── the text ────────────────────────────────────────────────────────────── */
{
  const { view } = buildView([F.warrenScene(), F.commonScene(true)]);
  const text = renderGather(view);
  ok("text opens with the call", text.startsWith(`<prompt_markers call="${view.call}" scenes="2" prompts="13"`));
  ok("legend is the constant", text.includes(`<legend>\n${LEGEND}\n</legend>`));
  for (const it of [...F.warrenItems(), ...F.commonItems()].filter(i => i.isPrompt)) {
    const n = text.split(normalisePrompt(it.text)).length - 1;
    check(`each prompt text appears once: ${it.key}`, n, 1);
  }
  check("built description appears once", text.split("Broad, floury").length - 1, 1);
  ok("todo lists every prompt", text.includes("<todo>p1 p2 p3 p4 p5 p6 p7 p8 p9 p10 p11 p12 p13</todo>"));
  ok("html stripped from built description", !text.includes("<p>"));

  const snapDir = join(HERE, "snapshots");
  const snap = join(snapDir, "two-scenes.txt");
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(snap)) {
    mkdirSync(snapDir, { recursive: true });
    writeFileSync(snap, text + "\n");
    console.log(`  (snapshot written: ${snap})`);
  }
  check("snapshot: §5.3 layout for the two scenario boards", text + "\n", readFileSync(snap, "utf8"));

  // the sees cap
  const many = [F.prompt("hub", "mid", 0, 0, "hub")];
  for (let i = 1; i <= SEES_CAP + 3; i++) many.push(F.prompt(`n${i}`, "mid", (i % 10) * 3, Math.floor(i / 10) * 3 + 1, `n${i}`));
  const big = buildView([F.sceneOf("big", "Big", many, [])]);
  const hubText = renderGather(big.view).split("</prompt>")[0];
  ok("sees cap summarises the rest", /\+3 more beyond \d+ ft/.test(hubText));
}

/* ── eval round 1: what the builder had to infer or never saw ───────────── */
{
  const { view } = buildView([F.warrenScene(), F.commonScene(true)]);
  const text = renderGather(view);
  ok("built prints the provenance note", text.includes("Why: the boss's rival"));
  ok("built names the prompt's pid and call", text.includes("Built from prompt (p2 of pm-0a0a, mid,"));
  ok("description keeps whole sentences past 160 chars", text.includes("If the boss falls he surrenders at once and offers the shrine key's hiding place for his life. [...]"));
  ok("description never cut mid-word", !/Description: [^\n]*\w\.\.\.$/m.test(text));
  ok("elevation printed when not 0", text.includes(`at="13,3 ft" elev="10 ft"`));
  ok("no elev attribute at 0", !text.includes(`elev="0 ft"`));
  ok("door line names the sides", text.includes("Door at 28,35 ft (closed, E-W wall): N side E1 (p4 at the door)") && text.includes("S side p8 (10 ft)"));
  ok("open door is called open", text.includes("(open, N-S wall)"));
  ok("encounter relation says what blocks it", text.includes("no LOS between them (wall)"));
  ok("loner names the nearest built thing in sight", text.includes("Alone: p13 (10 ft SW of t4 Spilled flour sack, in sight; 35 ft E of p10, in sight)."));
  const many = [F.prompt("a", "mid", 0, 0, "a"), F.prompt("b", "mid", 1, 0, "b")];
  ok("empty unseen says so", renderGather(buildView([F.sceneOf("e", "E", many, [])]).view).includes("<unseen>(nothing out of sight within 60 ft)</unseen>"));
  check("previewSentences cuts at a sentence", core.previewSentences("One two. Three four five six. Seven eight nine ten eleven.", 40), "One two. Three four five six. [...]");
  check("previewSentences falls back to a word", core.previewSentences("alpha beta gamma delta epsilon zeta eta theta", 20), "alpha beta gamma...");
  check("previewSentences joins lines", core.previewSentences("<a>\nb", 100), "<a> / b");

  // the party budget
  check("xpBudget 4x3", core.xpBudget("4x3"), { size: 4, level: 3, low: 600, moderate: 900, high: 1600 });
  check("xpBudget object", core.xpBudget({ level: 5, size: 4 }).high, 4400);
  check("xpBudget mixed levels", core.xpBudget([2, 3]), { size: 2, level: "2/3", low: 250, moderate: 375, high: 600 });
  check("xpBudget nonsense", core.xpBudget("lots"), null);
  check("crXp", [0, 0.125, 0.25, 0.5, 1, 3, 30].map(core.crXp), [10, 25, 50, 100, 200, 700, 155000]);
  check("difficulty bands", [100, 600, 900, 1600, 2000].map(x => core.difficulty(x, core.xpBudget("4x3"))), ["under low", "low", "moderate", "high", "over high"]);
  const withParty = renderGather(buildView([F.warrenScene()], { party: "4x2" }).view);
  ok("budget line with a party", withParty.includes("Budget per encounter (party 4 x level 2, 2024 DMG): low 400 | moderate 600 | high 800 XP."));
  ok("built XP counted in its encounter", withParty.includes("Built XP already in it: 200."));
  ok("no budget line without a party", !text.includes("Budget per encounter"));
}

/* ── review fixes: hex distance, lazy sight, the call names one numbering ─── */
{
  const { HEX_RULE, isSeen } = core;
  // cube coordinates {i: q, j: r}: neighbours are 1 hex, a straight 3-hex line is 3, (2,-1) is 2
  check("hex: neighbour = 1", stepCost(1, 0, HEX_RULE), 1);
  check("hex: (1,-1) neighbour = 1", stepCost(1, -1, HEX_RULE), 1);
  check("hex: (1,1) = 2 (not a diagonal step)", stepCost(1, 1, HEX_RULE), 2);
  check("hex: (2,-1) = 2", stepCost(2, -1, HEX_RULE), 2);
  check("hex: footprints, nearest hexes, 5 ft each", squareDistanceFt([{ i: 0, j: 0 }], [{ i: 3, j: -1 }, { i: 2, j: 0 }], { rule: HEX_RULE }), 10);

  // a counting sight: nothing is tested unless a consumer reads it
  const counted = () => {
    const n = { visible: 0, classify: 0 };
    return { n, sight: { visible: () => { n.visible++; return false; }, classify: () => { n.classify++; return "wall"; } } };
  };
  const far = [F.prompt("x1", "mid", 0, 0, "x1"), F.prompt("x2", "mid", 20, 0, "x2"), F.built("b", 40, 0)];
  {
    const { n, sight } = counted();
    const rel = makeRel(far, { gridSize: G, sight });
    const r = rel("x1", "x2");
    check("lazy: distance without a sight test", [r.ft, n.visible, n.classify], [100, 0, 0]);
    groupScene(["x1", "x2"], ["b"], rel);
    check("lazy: grouping far apart tests no sight at all", [n.visible, n.classify], [0, 0]);
    check("lazy: reading los runs visible then classify once", [r.los, r.los, n.visible, n.classify], ["wall", "wall", 1, 1]);
    ok("isSeen reads the boolean", !isSeen(r));
  }
  {
    const { n, sight } = counted();
    const sc = { ...F.sceneOf("far", "Far", far, []), rel: makeRel(far, { gridSize: G, sight }) };
    buildView([sc], { unseenWithinFt: 60 });
    // 2 prompts × 2 others = 4 forward pairs need `visible`; all are > 60 ft so none is classified,
    // except the loners' notes: x1 and x2 are each other's nearest prompt (one classify each)
    check("lazy: gather classifies only what it prints", [n.visible, n.classify], [4, 2]);
  }
  ok("isSeen on a plain los string", isSeen({ los: "LOS" }) && !isSeen({ los: "door" }) && !isSeen(null));

  // call: same words, same markers, different numbering → different call
  const two = (bx, cx) => [F.prompt("b", "mid", bx, 0, "bandit"), F.prompt("c", "mid", cx, 0, "cutpurse")];
  const v1 = buildView([F.sceneOf("sc", "S", two(0, 1), [])]);
  const v2 = buildView([F.sceneOf("sc", "S", two(2, 1), [])]);   // b moves past c: p1/p2 swap
  check("numbering swapped by a move", [v1.ids.promptIds.get("b"), v2.ids.promptIds.get("b")], ["p1", "p2"]);
  ok("call changes when the numbering changes", v1.view.call !== v2.view.call);
  const v3 = buildView([F.sceneOf("sc", "S", two(0, 2), [])]);   // c moves, order kept
  check("call kept when a move keeps the numbering", v3.view.call, v1.view.call);
}

/* ── build-core: the PC ability budget, choice words ───────────────────── */
{
  const B = await import("../build-core.mjs");
  const arr = { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 };
  ok("standard array accepted", B.validateAbilities(arr).ok);
  const over = { str: 17, dex: 10, con: 15, int: 8, wis: 12, cha: 14 };   // the eval's Hale, base already raised
  ok("over-budget array refused", !B.validateAbilities(over).ok);
  ok("array error names the array", /15 14 13 12 10 8/.test(B.validateAbilities(over).errors[0]));
  check("point buy 27 exact", B.validateAbilities({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }, "pointbuy").spent, 27);
  ok("point buy over 27 refused", !B.validateAbilities({ str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 }, "pointbuy").ok);
  ok("point buy 16 refused", !B.validateAbilities({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, "pointbuy").ok);
  ok("long ability names accepted", B.validateAbilities({ Strength: 15, Dexterity: 10, Constitution: 14, Intelligence: 8, Wisdom: 12, Charisma: 13 }).ok);
  ok("missing ability refused", !B.validateAbilities({ str: 15 }).ok);
  ok("background +2/+1 ok", B.checkIncrease({ str: 2, con: 1 }, { points: 3, locked: ["int", "wis", "cha"] }).ok);
  ok("background +1/+1/+1 ok", B.checkIncrease({ str: 1, dex: 1, con: 1 }, { points: 3 }).ok);
  ok("background +3 refused", !B.checkIncrease({ str: 3 }, { points: 3 }).ok);
  ok("background locked ability refused", !B.checkIncrease({ cha: 2, con: 1 }, { points: 3, locked: ["int", "wis", "cha"] }).ok);
  ok("level ASI must spend 2", !B.checkIncrease({ str: 1 }, { points: 2 }).ok);
  check("default background increase", B.defaultIncrease({ str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 }, { points: 3, locked: ["int", "wis", "cha"] }), { str: 2, con: 1 });
  check("default ASI prefers primary on ties", B.defaultIncrease({ str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 }, { points: 2, prefer: ["cha"] }), { cha: 2 });
  check("default ASI stops at 20", B.defaultIncrease({ str: 19, dex: 10, con: 14, int: 8, wis: 12, cha: 8 }, { points: 2 }), { str: 1, con: 1 });
  const pool = ["skills:ath", "skills:ins", "skills:per", "weapon:mar:longsword", "weapon:sim:javelin"];
  check("trait words", B.matchTraitKeys(["ath", "Perception", "longsword", "nope"], pool, { "skills:per": "Perception" }),
    { keys: ["skills:ath", "skills:per", "weapon:mar:longsword"], unmatched: ["nope"] });
  check("choice lookup most specific first", B.lookupChoice({ "Skill Proficiencies": ["a"], "Paladin: Skill Proficiencies@1": ["b"] },
    { item: "Paladin", title: "Skill Proficiencies", level: 1, type: "Trait" })[1], ["b"]);
  check("choice lookup by type", B.lookupChoice({ subclass: "Thief" }, { item: "Rogue", title: "Rogue Subclass", level: 3, type: "Subclass" })[1], "Thief");
  ok("sameName ignores order and commas", B.sameName("Infernal Tiefling", "Tiefling, Infernal"));
}

/* ── small helpers ───────────────────────────────────────────────────────── */
check("normalisePrompt keeps paragraphs", normalisePrompt("  a  \r\n\r\nb \n"), "a\n\nb");
check("stripHtml", stripHtml("<p>Hunched &amp; <em>ash</em>-daubed</p><p>Line&nbsp;two</p>"), "Hunched & ash-daubed\nLine two");
check("stripHtml numeric entities", stripHtml("it&#39;s &#x41;"), "it's A");
check("stripHtml drops @Embed", stripHtml("<p>@Embed[Compendium.dnd-monster-manual.content.JournalEntry.abc.JournalEntryPage.def inline]</p>"), "");
check("stripHtml enricher labels", stripHtml("<p>See @UUID[Actor.x]{the boss}, @Check[dex]{a check}, [[/r 2d6]] and &Reference[prone]</p>"),
  "See the boss, a check, 2d6 and prone");
check("preview cuts on a word", preview("one two three four", 12), "one two...");
check("preview short", preview("one  two", 20), "one two");
check("nameplate multi-line short", nameplate("Goblin boss\nwith a wolf-skull helm", "mid"), "✎ Goblin boss / with a wolf-skull helm");
check("nameplate multi-line long", nameplate("Goblin boss\n\nwith a wolf-skull helm and a cracked shield", "mid"), "✎ Goblin boss / with a wolf-skull helm and…");
check("nameplate single line", nameplate("Ogre", "large"), "✎ Ogre");
check("nameplate long", nameplate("x".repeat(50), "mid"), `✎ ${"x".repeat(40)}…`);
check("nameplate empty", nameplate("   ", "mid"), "Prompt · mid — empty");
check("isoDate", isoDate(Date.UTC(2026, 9, 9)), "2026-10-09");
check("relationText LOS", relationText({ id: "p2", ft: 10, bearing: "SW", los: "LOS" }), "p2 10 SW reach");
check("relationText door", relationText({ id: "p6", ft: 40, bearing: "S", los: "door" }), "p6 40 S near door");
check("idCompare numeric", ["p10", "p2", "t1", "p1"].sort(idCompare), ["p1", "p2", "p10", "t1"]);
check("footprint labels", SIZES.map(s => footprintLabel(s.key)),
  ["Tiny 2.5x2.5 ft", "Small 5x5 ft", "Medium 5x5 ft", "Large 10x10 ft", "Huge 15x15 ft", "Gargantuan 20x20 ft"]);
check("footprintSquares", [footprintSquares(0.5), footprintSquares(2)], ["0.5x0.5", "2x2"]);
check("size table ranks", SIZES.map(s => SIZE_BY_KEY[s.key].rank), [0, 1, 2, 3, 4, 5]);

/* ── placement ───────────────────────────────────────────────────────────── */
{
  const mid = { x: 500, y: 300, w: 100, h: 100 };
  check("same footprint → marker's own x,y", placementFor(mid, { type: "token", w: 1, h: 1 }, G), { x: 500, y: 300, mode: "same" });
  check("large on a mid marker → centred", placementFor(mid, { type: "token", w: 2, h: 2 }, G), { x: 450, y: 250, mode: "centred" });
  check("large on a mid marker, snapped", placementFor(mid, { type: "token", w: 2, h: 2, snap: (x, y) => ({ x: Math.round(x / 100) * 100, y: Math.round(y / 100) * 100 }) }, G),
    { x: 500, y: 300, mode: "snapped" });
  check("hotspot 0.5 centred unsnapped", placementFor(mid, { type: "token", w: 0.5, h: 0.5 }, G), { x: 525, y: 325, mode: "centred" });
  check("note/light at the centre", placementFor(mid, { type: "centred" }, G), { x: 550, y: 350, mode: "centre" });
  check("lockSize for a 0.5 hotspot on a medium actor", needsLockSize(0.5, "med"), true);
  check("no lockSize for a medium token", needsLockSize(1, "med"), false);
  check("lockSize for tiny at 0.5 not needed", needsLockSize(0.5, "tiny"), false);
}

/* ── panel + dialog helpers ─────────────────────────────────────────────── */
{
  const rels = [
    { key: "b", ft: 20, los: "LOS" }, { key: "a", ft: 20, los: "LOS" }, { key: "c", ft: 5, los: "LOS" },
    { key: "d", ft: 15, los: "door" }, { key: "e", ft: 65, los: "wall" }, { key: "f", ft: 30, los: "wall" }
  ];
  const p = panelSplit(rels, { rows: 2, unseenWithinFt: 60 });
  check("panel nearest first, ties by key", p.shown.map(r => r.key), ["c", "a"]);
  check("panel more", p.more.map(r => r.key), ["b"]);
  check("panel unseen within 60 ft", p.unseen.map(r => r.key), ["d", "f"]);
  check("distanceLine", distanceLine({ ft: 20, bearing: "NE" }), "20 ft · close · NE");
  check("distanceLine hidden", distanceLine({ ft: 5, bearing: "N" }, { hidden: true }), "5 ft · touching · N · hidden");
  check("atFeet subtracts padding", atFeet({ x: 1150, y: 750 }, { sceneX: 1000, sceneY: 500, size: 100, distance: 5 }), [8, 13]);
  check("dialog to the right of the cursor", dialogPosition({ clientX: 100, clientY: 200, w: 620, h: 320, vw: 1600, vh: 900 }), { left: 124, top: 160 });
  check("dialog flips left at the right edge", dialogPosition({ clientX: 1500, clientY: 200, w: 620, h: 320, vw: 1600, vh: 900 }), { left: 856, top: 160 });
  check("dialog clamps at the bottom", dialogPosition({ clientX: 100, clientY: 880, w: 620, h: 320, vw: 1600, vh: 900 }).top, 572);
  const avoid = { x: 110, y: 150, w: 200, h: 200 };
  const pos = dialogPosition({ clientX: 100, clientY: 200, w: 620, h: 320, vw: 1600, vh: 900, avoid });
  ok("dialog does not cover the marker", !(pos.left < avoid.x + avoid.w && pos.left + 620 > avoid.x && pos.top < avoid.y + avoid.h && pos.top + 320 > avoid.y));
  check("testPoints count", testPoints({ x: 0, y: 0, w: 100, h: 100 }, 100).length, 5);
}

/* ── error codes ─────────────────────────────────────────────────────────── */
{
  const e = core.codedError("TEXT_CHANGED", "p3 edited");
  check("codedError message", e.message, "TEXT_CHANGED: p3 edited");
  check("errorCode from .code", core.errorCode(e), "TEXT_CHANGED");
  check("errorCode from a relayed message", core.errorCode(new Error("MARKER_GONE: p1")), "MARKER_GONE");
  check("errorCode unknown", core.errorCode(new Error("boom")), null);
  check("all contract codes", core.CODES, ["TEXT_CHANGED", "MARKER_GONE", "CALL_UNKNOWN", "SCENE_UNKNOWN", "BAD_SPEC", "NOT_GM", "CREATE_FAILED", "DRY_RUN_REQUIRED"]);
}

await import("./eval2-fixes.mjs").then(m => m.run({ check, ok, core, F, W, G }));
await import("./eval3-fixes.mjs").then(m => m.run({ check, ok, core, F, W, G }));
await import("./usability-fixes.mjs").then(m => m.run({ check, ok, core, F, W, G }));

console.log(`pentaryn-prompts core: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
