/**
 * Characterisation (ties checkpoint, wave 3): the study conduit (study.mjs) — the kind ladder, a lore
 * row and an attribute fact, each through the GM's direct path (the same applyStudy a player's socket
 * request reaches), with the claim wait on mocked timers and every d20 scripted. Pins each gesture's
 * ordered effects (claim write, blind roll config, belief row, the player's one update, the stub,
 * the notification), the hold gate and Deliver, pending(), beliefs(), reset, the GM authoring
 * setters, the kind picker, composeStudyPayload at every rung, and applyStudy's refusals for a
 * player sender. Synthetic world; frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle, stableDates } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const NPC = "zzNpc00000000001";
const KIND = "zzKind0000000001";
const LONE = "zzLone0000000001";
const FAR = "zzFar00000000001";
const BARE = "zzBare0000000001";
const PLAYER = "zzPlayerUser0001";

const REGISTRY = [
  {
    id: "guild",
    title: "The Guild",
    category: "Guild",
    secret: true,
    dc: 14,
    skill: "his",
    reveal: "<p>Guild hands.</p>",
    miss: "",
    lore: [
      { id: "g1", label: "Oath", dc: 13, skill: "rel", text: "<p>They swear on salt.</p>", miss: "<p>Something about salt.</p>" },
      { id: "g2", label: "Held oath", dc: 10, skill: "rel", text: "<p>Second oath.</p>", miss: "", hold: true },
    ],
  },
];

const handlers = [];
const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 } },
    { id: PC2, name: "ZZ Wren", type: "character" },
    {
      id: KIND,
      name: "ZZ Ghoul",
      system: {
        details: { type: { value: "undead" }, biography: { value: "<p>Grey hunters of the barrow.</p>" } },
        traits: { di: { value: ["poison"], custom: "Grief" }, dr: { value: [] }, dv: { value: ["fire"] }, ci: { value: ["charmed"] } },
      },
      items: [
        { id: "zzClaw0000000001", name: "Claw", activities: [{ type: "attack" }], system: { description: { value: "<p>+4 to hit, 1d6 slashing.</p>" } } },
        { id: "zzStare000000001", name: "Stare", activities: [{ type: "utility" }] },
        { id: "zzHowl0000000001", name: "Howl", activities: [{ type: "save" }], system: { description: { value: "[[/save wis]]" } } },
      ],
    },
    {
      id: NPC,
      name: "ZZ Brakka",
      flags: {
        "pentaryn-ties": {
          kindOf: KIND,
          attributes: ["guild"],
          lore: [
            { id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>He owes the guild.</p>", miss: "<p>Shifty eyes.</p>" },
            { id: "l2", label: "Draft row", dc: 10, skill: "his", text: "", miss: "" },
            { id: "l3", label: "Held secret", dc: 10, skill: "inv", text: "<p>He sold the map.</p>", miss: "", hold: true },
            { id: "l4", label: "Quiet fail", dc: 30, skill: "inv", text: "<p>Never reached.</p>", miss: "" },
          ],
        },
      },
    },
    { id: LONE, name: "ZZ Lone Beast", system: { details: { type: { value: "beast" }, biography: { value: "" } } } },
    { id: FAR, name: "ZZ Faraway" },
    { id: BARE, name: "ZZ Bare Thing", system: { details: { type: { value: "beast" }, biography: { value: "" } } } },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC },
    { id: "zzTokNpc00000001", actorId: NPC },
    { id: "zzTokLone0000001", actorId: LONE },
    { id: "zzTokBare0000001", actorId: BARE },
  ],
  before: F => {
    const on = F.game.socket.on;
    F.game.socket.on = (channel, fn) => {
      handlers.push(fn);
      return on(channel, fn);
    };
  },
});
const T = () => game.pentaryn.ties;
const Study = await import("../study.mjs"); // after boot: study.mjs reads foundry at load
const get = id => game.actors.get(id);
const asPlayer = async fn => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  try {
    return await fn();
  } finally {
    game.user = gm;
  }
};
const run = async (label, fn) => {
  const mark = F.calls.length;
  const c0 = F.console.length;
  const out = await settle(Promise.resolve().then(fn));
  return stableDates({ label, out: out ?? null, calls: F.calls.slice(mark), console: F.console.slice(c0) });
};
/** A descriptor, made JSON-safe: documents → ids, grade → typeof. */
const plainFact = fact =>
  fact && { ...fact, subject: fact.subject?.id ?? null, ledger: fact.ledger?.id ?? null, grade: typeof fact.grade };

test("studyStateFor / loreStateFor / attrLoreStateFor / attrOffersFor before any roll", () => {
  const strip = s => ({ ...s, kind: s.kind?.id ?? null });
  pinJSON(
    "study-state-before",
    {
      npc: strip(Study.studyStateFor(get(PC), get(NPC))),
      kind: strip(Study.studyStateFor(get(PC), get(KIND))),
      lone: strip(Study.studyStateFor(get(PC), get(LONE))),
      none: Study.studyStateFor(get(PC), null),
      lore: Study.loreStateFor(get(PC), get(NPC)),
      loreNone: Study.loreStateFor(get(PC), null),
      attr: Study.attrLoreStateFor(get(PC), get(NPC), "guild"),
      attrNone: Study.attrLoreStateFor(get(PC), get(NPC), ""),
      offers: Study.attrOffersFor(get(PC), get(NPC)),
      kindActorOf: [Study.kindActorOf(get(NPC))?.id, Study.kindActorOf(get(KIND))?.id, Study.kindActorOf(null)],
      skill: Study.studySkillFor(get(KIND)),
      hold: Study.studyHoldFor(get(KIND)),
    },
    import.meta.url
  );
});

test("resolveFact: the four answers (kind, lore, attr, nothing)", () => {
  pinJSON(
    "study-resolve-fact",
    {
      kind: plainFact(Study.resolveFact({ ns: "kind", subjectId: NPC })),
      lore: plainFact(Study.resolveFact({ ns: "lore", subjectId: NPC, factId: "l1" })),
      loreDraft: Study.resolveFact({ ns: "lore", subjectId: NPC, factId: "l2" }),
      attr: plainFact(Study.resolveFact({ ns: "attr", subjectId: NPC, attrId: " guild ", factId: "g1" })),
      attrMissingRow: Study.resolveFact({ ns: "attr", subjectId: NPC, attrId: "guild", factId: "nope" }),
      unknownNs: Study.resolveFact({ ns: "mask", subjectId: NPC }),
      noSubject: Study.resolveFact({ ns: "kind", subjectId: "nope" }),
      none: Study.resolveFact(null),
    },
    import.meta.url
  );
});

test("composeStudyPayload at every rung, unauthored then with an authored rung 0 and 20", async () => {
  const kind = get(KIND);
  const rows = {};
  for (const tier of [0, 15, 20, 25]) rows[`derived ${tier}`] = await Study.composeStudyPayload(kind, tier, "Religion");
  await Study.setStudyTiers(kind, [{ min: 0, text: "<p>A sick dog, surely.</p>" }, { min: 20, text: "<p>Authored twenty.</p>" }]);
  for (const tier of [0, 15, 20, 25]) rows[`authored ${tier}`] = await Study.composeStudyPayload(kind, tier, "Religion");
  await Study.setStudyTiers(kind, []);
  pinJSON("study-compose", rows, import.meta.url);
});

test("GM authoring setters: kindOf, tiers, offset, hold — and a player is refused", async () => {
  const rows = [];
  rows.push(await run("setKindOf to an unknown actor", () => Study.setKindOf(get(LONE), "zzNope0000000001")));
  rows.push(await run("setKindOf to KIND", () => Study.setKindOf(get(LONE), KIND)));
  rows.push(await run("setKindOf to itself clears", () => Study.setKindOf(get(LONE), LONE)));
  rows.push(await run("setStudyTiers junk → cleared", () => Study.setStudyTiers(get(LONE), [{ min: 7, text: "x" }, null])));
  rows.push(await run("setStudyTiers two rungs", () => Study.setStudyTiers(get(LONE), [{ min: 15, text: "fifteen" }, { min: 25, text: "<p></p>" }, { min: 15, text: "dup" }])));
  rows.push(await run("readTiers", () => Study.studyTiersOf(get(LONE))));
  rows.push(await run("setStudyOffset +5", () => Study.setStudyOffset(get(LONE), 5)));
  rows.push(await run("setStudyOffset auto", () => Study.setStudyOffset(get(LONE), "auto")));
  rows.push(await run("setStudyOffset 0 clears", () => Study.setStudyOffset(get(LONE), 0)));
  rows.push(await run("setStudyHold true", () => Study.setStudyHold(get(LONE), true)));
  rows.push(await run("setStudyHold null inherits", () => Study.setStudyHold(get(LONE), null)));
  rows.push(await run("player: setKindOf", () => asPlayer(() => Study.setKindOf(get(LONE), KIND))));
  rows.push(await run("player: setStudyTiers", () => asPlayer(() => Study.setStudyTiers(get(LONE), []))));
  rows.push(await run("player: setStudyOffset", () => asPlayer(() => Study.setStudyOffset(get(LONE), 3))));
  rows.push(await run("player: setStudyHold", () => asPlayer(() => Study.setStudyHold(get(LONE), true))));
  F.dialogs.push(KIND);
  rows.push(await run("kindDialog: pick KIND", () => Study.kindDialog(get(LONE))));
  F.dialogs.push(null);
  rows.push(await run("kindDialog: cancelled", () => Study.kindDialog(get(LONE))));
  rows.push(await run("player: kindDialog", () => asPlayer(() => Study.kindDialog(get(LONE)))));
  await Study.setKindOf(get(LONE), null);
  pinJSON("study-authoring", rows, import.meta.url);
});

test("the kind study, GM direct path: advantage +3, d20 → 22 (tier 20); then spent", async () => {
  const rows = [];
  F.dialogs.push({ mode: "advantage", situational: 3 });
  F.rolls.push(22);
  rows.push(await run("requestStudy NPC → its kind", () => Study.requestStudy(get(PC), get(NPC))));
  rows.push(await run("requestStudy again (spent)", () => Study.requestStudy(get(PC), get(NPC))));
  rows.push(await run("requestStudy on a kind with no content", () => Study.requestStudy(get(PC), get(BARE))));
  rows.push(await run("requestStudy on LONE (an authored tier only), dialog cancelled", () => Study.requestStudy(get(PC), get(LONE))));
  F.dialogs.push(null);
  rows.push(await run("requestStudy, dialog cancelled (PC2)", () => Study.requestStudy(get(PC2), get(NPC))));
  pinJSON("study-kind", rows, import.meta.url);
});

test("lore rows: a failure with miss text, a quiet failure, a held pass then Deliver", async () => {
  const rows = [];
  F.dialogs.push({ mode: "disadvantage", situational: -500 });
  F.rolls.push(5);
  rows.push(await run("requestLore l1, rolls 5 vs 12 (miss text delivered)", () => Study.requestLore(get(PC), get(NPC), "l1")));
  rows.push(await run("requestLore l1 again (spent)", () => Study.requestLore(get(PC), get(NPC), "l1")));
  rows.push(await run("requestLore draft row (not offered)", () => Study.requestLore(get(PC), get(NPC), "l2")));
  F.rolls.push(3);
  rows.push(await run("studyAs l4, rolls 3 vs 30 (no miss text: silent)", () => Study.studyAs(get(PC), get(NPC), { loreId: "l4" })));
  F.rolls.push(18);
  F.dialogs.push(false); // Later
  rows.push(await run("studyAs l3 (hold), rolls 18: held, prompt answered Later", () => Study.studyAs(get(PC), get(NPC), { loreId: "l3" })));
  rows.push(await run("pending()", () => Study.pending()));
  rows.push(await run("deliver l3", () => Study.deliver(get(PC), get(NPC), "l3")));
  rows.push(await run("deliver l3 again (already delivered)", () => Study.deliver(get(PC), get(NPC), "l3")));
  rows.push(await run("deliver a row never rolled (PC2)", () => Study.deliver(get(PC2), get(NPC), "l3")));
  rows.push(await run("player: deliver", () => asPlayer(() => Study.deliver(get(PC), get(NPC), "l3"))));
  pinJSON("study-lore", rows, import.meta.url);
});

test("an attribute fact: the claim on the world setting, a pass, a held pass, pending and deliver", async () => {
  const rows = [];
  F.dialogs.push({ mode: "normal", situational: 0 });
  F.rolls.push(20);
  rows.push(await run("requestAttrLore guild/g1, rolls 20", () => Study.requestAttrLore(get(PC), get(NPC), "guild", "g1")));
  rows.push(await run("requestAttrLore guild/g1 again (spent)", () => Study.requestAttrLore(get(PC), get(NPC), "guild", "g1")));
  rows.push(await run("requestAttrLore unknown row", () => Study.requestAttrLore(get(PC), get(NPC), "guild", "nope")));
  F.rolls.push(15);
  F.dialogs.push(false);
  rows.push(await run("studyAs guild/g2 (hold) as PC2, rolls 15", () => Study.studyAs(get(PC2), get(NPC), { loreId: "g2", attrId: "guild" })));
  rows.push(await run("pending()", () => Study.pending()));
  rows.push(await run("deliver guild/g2", () => Study.deliver(get(PC2), get(NPC), "g2", "guild")));
  pinJSON("study-attr", rows, import.meta.url);
});

test("beliefs(): the GM's memory on the kind and on the individual; a player sees nothing", async () => {
  pinJSON(
    "study-beliefs",
    stableDates({ kind: Study.beliefs(get(KIND)), npc: Study.beliefs(get(NPC)), player: await asPlayer(() => Study.beliefs(get(NPC))), studied: Study.studiedOf(get(PC)), beliefsOf: Study.beliefsOf(get(NPC)) }),
    import.meta.url
  );
});

test("reset: un-spends the lock and the belief row; nothing in the notebook is taken", async () => {
  const rows = [];
  rows.push(await run("reset kind", () => Study.reset(get(PC), get(NPC))));
  rows.push(await run("reset lore l1", () => Study.reset(get(PC), get(NPC), "l1")));
  rows.push(await run("reset attr guild/g1", () => Study.reset(get(PC), get(NPC), "g1", "guild")));
  rows.push(await run("reset a fact that does not resolve", () => Study.reset(get(PC), get(NPC), "nope")));
  rows.push(await run("player: reset", () => asPlayer(() => Study.reset(get(PC), get(NPC)))));
  rows.push(await run("state after", () => ({ studied: Study.studiedOf(get(PC)), lore: Study.loreStateFor(get(PC), get(NPC)).map(r => [r.id, r.available]) })));
  pinJSON("study-reset", rows, import.meta.url);
});

test("auto offset: common knowledge hands over the top rung with no dice; a null roll spends nothing", async () => {
  const rows = [];
  await Study.setStudyOffset(get(KIND), "auto");
  rows.push(await run("studyAs PC2 on an auto kind", () => Study.studyAs(get(PC2), get(NPC))));
  await Study.setStudyOffset(get(KIND), 0);
  await Study.reset(get(PC2), get(NPC));
  F.rolls.push(null); // rollSkill evaluates nothing
  rows.push(await run("studyAs PC2, the roll produces nothing", () => Study.studyAs(get(PC2), get(NPC))));
  pinJSON("study-auto-and-null", rows, import.meta.url);
});

test("applyStudy refusals for a player sender (through the socket handler)", async () => {
  const conduit = handlers[1];
  const send = (payload, sender = PLAYER) => conduit({ action: "study", ...payload }, sender);
  const rows = [];
  rows.push(await run("character does not exist", () => send({ characterId: "nope", subjectId: NPC })));
  rows.push(await run("not a character sheet", () => send({ characterId: NPC, subjectId: NPC })));
  rows.push(await run("fact does not resolve", () => send({ characterId: PC, subjectId: NPC, ns: "lore", factId: "nope" })));
  rows.push(await run("sender does not own the character", () => send({ characterId: PC2, subjectId: NPC })));
  rows.push(await run("subject out of reach", () => send({ characterId: PC, subjectId: FAR })));
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  rows.push(await run("playerAccess off", () => send({ characterId: PC, subjectId: NPC })));
  await game.settings.set("pentaryn-ties", "playerAccess", true);
  F.rolls.push(11);
  rows.push(await run("a valid kind request: rolls 11 (tier 0, no authored rung 0: silent)", () => send({ characterId: PC, subjectId: NPC, mode: "advantage", situational: 999 })));
  rows.push(await run("the same again (already studied)", () => send({ characterId: PC, subjectId: NPC })));
  pinJSON("study-refusals", rows, import.meta.url);
});

test("the player's side of a request: kill switch, owner, no GM, combat warning, then the emitted payload", async () => {
  const rows = [];
  const pc = get(PC);
  await Study.reset(pc, get(NPC), "l1");
  rows.push(await run("player: not the owner", () => asPlayer(() => Study.requestLore(get(PC2), get(NPC), "l1"))));
  game.users.get("gmUser0000000001").active = false;
  rows.push(await run("player: no GM online", () => asPlayer(() => Study.requestLore(pc, get(NPC), "l1"))));
  game.users.get("gmUser0000000001").active = true;
  game.combat = { started: true };
  Object.defineProperty(pc, "inCombat", { value: true, configurable: true, writable: true });
  F.dialogs.push(false);
  rows.push(await run("player: in combat, declines the warning", () => asPlayer(() => Study.requestLore(pc, get(NPC), "l1"))));
  F.dialogs.push(true, { mode: "sideways", situational: "7.6" });
  rows.push(await run("player: in combat, goes ahead (bad mode, string bonus)", () => asPlayer(() => Study.requestLore(pc, get(NPC), "l1"))));
  game.combat = null;
  pc.inCombat = false;
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  rows.push(await run("player: playerAccess off", () => asPlayer(() => Study.requestLore(pc, get(NPC), "l1"))));
  await game.settings.set("pentaryn-ties", "playerAccess", true);
  pinJSON("study-player-request", rows, import.meta.url);
});
