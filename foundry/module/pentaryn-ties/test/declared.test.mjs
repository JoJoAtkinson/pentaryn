/**
 * Characterisation (ties checkpoint, wave 3): the BEFORE half of every behaviour change the guide
 * declares (§5 B2, B4, B5, B6, B7; ties-46), each a named pin of today's behaviour that its own
 * [declared] commit flips later — plus the obvious bugs found while characterising, as `todo` tests
 * that state the intended behaviour (they report, they do not fail the run; each fix lands after the
 * structural refactor as its own [declared] commit that turns the todo into a plain test).
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el, serialise } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const PLAYER = "zzPlayerUser0001";

const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", img: 'icons/zz/a"b.webp', flags: { "pentaryn-ties": { ties: [{ id: NPC, word: "debtor", stance: -1, strength: 4 }] } } },
    {
      id: NPC,
      name: "ZZ Brakka",
      items: [{ id: "zzItemOdd0000001", name: "Odd", flags: { "pentaryn-ties": { mark: { icon: "x onclick=1", tip: "t" } } } }],
      flags: { "pentaryn-ties": { lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>", miss: "" }] } },
    },
  ],
  tokens: [{ id: "zzTokPc000000001", actorId: PC }, { id: "zzTokNpc00000001", actorId: NPC }],
});
const T = () => game.pentaryn.ties;
const get = id => game.actors.get(id);
const Study = await import("../study.mjs");
const Attributes = await import("../attributes.mjs");
const Known = await import("../known-core.mjs");
const API = await import("../ties-api.mjs");

test("B2 / ties-4 [declared, flipped]: read() of an id, a name or a token resolves to the world actor (before: only the Actor itself, else [])", () => {
  const tokenDoc = canvas.tokens.get("zzTokPc000000001").document;
  pinJSON(
    "declared-b2-read-refs",
    {
      actor: T().read(get(PC)).map(t => t.id),
      byId: T().read(PC),
      byName: T().read("ZZ Caven"),
      tokenPlaceable: T().read(canvas.tokens.get("zzTokPc000000001")),
      tokenDocument: T().read(tokenDoc),
    },
    import.meta.url
  );
});

test("B4 / ties-29 [declared, flipped]: with Roll._mapLegacyRollMode gone the study is refused before any claim, and the fact stays studyable (before: a throw after the claim stranded it)", async () => {
  const keep = foundry.dice.Roll._mapLegacyRollMode;
  delete foundry.dice.Roll._mapLegacyRollMode;
  let threw = null;
  try {
    await settle(Study.studyAs(get(PC), get(NPC), { loreId: "l1" }));
  } catch (err) {
    threw = err.message;
  }
  foundry.dice.Roll._mapLegacyRollMode = keep;
  const raw = get(NPC).flags["pentaryn-ties"].beliefs?.[PC]?.[`lore:${NPC}:l1`] ?? null;
  const mark = F.calls.length;
  F.rolls.push(18);
  const again = await settle(Study.studyAs(get(PC), get(NPC), { loreId: "l1" }));
  pinJSON(
    "declared-b4-claim-stranded",
    { threw, raw, read: Study.beliefsOf(get(NPC))[PC]?.[`lore:${NPC}:l1`] ?? null, loreState: Study.loreStateFor(get(PC), get(NPC)), again, againConsole: F.console.slice(-1), againCalls: F.calls.slice(mark).length },
    import.meta.url
  );
  assert.equal(threw, null, "refused cleanly, nothing thrown");
  assert.equal(raw, null, "no claim row is left behind");
  assert.equal(again, true, "and the next roll on that fact goes ahead");
});

test("B5 / ties-30 (before): a player-client knowledge write is refused by the GM check (false), not queued", async () => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  const set = await Attributes.setKnowledge([{ characterId: PC, attrId: "x", via: "grant" }]);
  const clear = await Attributes.clearKnowledge(PC, "x");
  game.user = gm;
  assert.deepEqual({ set, clear }, { set: false, clear: false });
});

test("B6 / ties-32 [declared, flipped]: describe-card art is escaped; an item mark's icon must be one fa- class, else the flame (before: both used as given)", async () => {
  canvas.tokens.hover = canvas.tokens.get("zzTokPc000000001");
  let content = null;
  const DialogV2 = foundry.applications.api.DialogV2;
  foundry.applications.api.DialogV2 = class extends DialogV2 {
    constructor(opts) {
      super(opts);
      content = opts.content;
    }
  };
  await T().describeCard(); // B1 [declared]: the card moved from describe to describeCard
  await T().closeDescription();
  foundry.applications.api.DialogV2 = DialogV2;
  canvas.tokens.hover = null;
  const row = el("li", { dataset: { itemId: "zzItemOdd0000001" }, children: [el("div", { className: "name", children: [el("span", { className: "title" })] })] });
  F.fire("renderBaseActorSheet", { actor: get(NPC) }, el("ol", { children: [row] }));
  pinJSON("declared-b6-unescaped", { art: content.match(/<img[^>]*>/)?.[0] ?? null, mark: serialise(row) }, import.meta.url);
});

test("B7 / ties-24 [declared, flipped]: a player's canvasReady schedules no frame at all — no badge frame, and with no card up no wire frame (before: a worn-badge frame whose paint then returned)", () => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  F.frames.length = 0;
  const p0 = F.pixi.length;
  F.fire("canvasReady");
  const queued = F.frames.length;
  F.flushFrames();
  game.user = gm;
  assert.deepEqual({ queued: queued >= 1, painted: F.pixi.length - p0 }, { queued: false, painted: 0 });
});

test("ties-46 [declared, flipped]: the inspect preview's live hooks gain updateUser (before: no updateUser, no ownership watch)", async () => {
  const { InspectPreview } = await import("../preview-app.mjs");
  const pv = new InspectPreview(get(NPC));
  const before = F.hooks.length;
  pv._onFirstRender({}, {});
  const added = F.hooks.slice(before).map(h => `${h.kind}:${h.name}`);
  pv._onClose({});
  pinJSON("declared-ties46-preview-hooks", added, import.meta.url);
  assert.ok(added.includes("on:updateUser"));
});

/* ── obvious bugs found while characterising: the intended behaviour, as todo ─────────────────── */

test(
  "readBeliefs keeps a null tier null (today: Number(null) → rung 0; lore/ident/attr rows read tier 0 in pending() and beliefs())",
  { todo: "known-core readBeliefs uses num(rec.tier, NaN), and Number(null) is 0 — the same trap priorOf documents and guards. Fix after S4 as its own [declared] commit; pending()/beliefs() rows then show tier null for non-kind rows." },
  () => {
    const b = Known.readBeliefs({ pc: { [`lore:${NPC}:l1`]: { text: "x", tier: null, total: 9, when: 1, delivered: 2 } } });
    assert.equal(b.pc[`lore:${NPC}:l1`].tier, null);
  }
);

test(
  "clampStrength falls back to the default 3 for a non-number (today: null, \"\", [] and false clamp to 1, true to 1)",
  { todo: "ties-api num() uses Number.isFinite(Number(v)), so Number(null|\"\"|[]|false) = 0 → clamped to 1, the weakest tie, instead of the default 3. A stored strength of null/\"\" reads as 1 on every card and sheet. Fix after S3 (ties-core clamps) as its own [declared] commit." },
  () => {
    for (const v of [null, "", [], false]) assert.equal(API.clampStrength(v), 3, JSON.stringify(v));
  }
);
