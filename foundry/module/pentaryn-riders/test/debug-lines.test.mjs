// combat-riders-40 (guide S3, C24): the three catches that used to be comment-only now leave one
// debug line each, behind CONFIG.debug["pentaryn-riders"]; with debug off they stay silent (the
// checkpoint pins in argon-tidy, cast-flow and concentration.test). Control flow is unchanged.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { IDS, MODULE, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
F.CONFIG.debug ??= {};
F.CONFIG.debug[MODULE] = true;

test("enrichHTML: an option that throws → enriched as asked, one debug line", () => {
  W.take();
  const opts = {};
  Object.defineProperty(opts, "relativeTo", { get() { throw new Error("odd options"); }, enumerable: true });
  assert.equal(F.foundry.applications.ux.TextEditor.implementation.enrichHTML("c", opts), "<p>c</p>");
  assert.deepEqual(W.take(), [["debug", `${MODULE} | tooltip roll data: enriched as asked`, "odd options"]]);
});

test("sidebar restore that throws → left as it is, one debug line, nothing escapes the timer", () => {
  F.ui.sidebar = { tabGroups: { primary: "chat" }, expanded: true, changeTab: () => { throw new Error("no tab"); } };
  F.fire("dnd5e.preSummon", { summon: { prompt: false } }, {});
  F.fire("changeSidebarTab", { tabName: "actors" });
  W.take();
  mock.timers.tick(0);
  assert.deepEqual(W.take(), [["debug", `${MODULE} | summon sidebar restore: left as it is`, "no tab"]]);
  F.fire("dnd5e.postSummon");
  F.ui.sidebar = undefined;
});

test("a save card whose system getters throw → not auto-broken, one debug line, no warn", async () => {
  const sorc = W.actor(IDS.sorc);
  const msg = makeDoc("ChatMessage", { id: "savedebug0000001", type: "save", isContentVisible: true, system: { type: "concentration" }, rolls: [{ total: 3, options: { target: 10 } }] });
  Object.defineProperty(msg.system, "canBreakConcentration", { get() { throw new Error("old card"); } });
  msg.getAssociatedActor = () => sorc;
  W.take();
  W.takeLog();
  await F.fire("createChatMessage", msg, {}, IDS.gm);
  await drain();
  assert.deepEqual(W.takeLog().filter(l => l.op === "endConcentration"), []);
  assert.deepEqual(W.take(), [["debug", `${MODULE} | concentration save card unreadable (an old card?): not auto-broken`, "old card"]]);
});
