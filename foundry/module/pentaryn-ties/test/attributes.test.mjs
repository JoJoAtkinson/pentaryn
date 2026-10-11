/**
 * Characterisation (ties checkpoint, wave 3): the attribute layer (attributes.mjs) through the
 * published `game.pentaryn.ties.attributes.*` paths and the internal exports the UI uses — the
 * registry write contract (create/ensure/update/remove and every refusal), review and selection,
 * links (ancestors materialised, descendants unlinked, derived ids suppressed), the validator,
 * stale carriers, world knowledge (tell, known, the tree for a player and a GM, branchOf, clear),
 * search, derived display records and category icons, repairIcons, authorEntry and the review
 * panel's own two saves. Effects pinned as the ordered call log. Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise, pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const ELF = "zzElf00000000001";
const PLAYER = "zzPlayerUser0001";

const REGISTRY = [
  { id: "realm", title: "Old Realm", category: "Realm", icon: "icons/environment/settlement/watchtower-flag.webp", createdAt: 1, modifiedAt: 1, reviewedAt: 2, touched: [], reviewedSnapshot: { title: "Old Realm" } },
  { id: "city", title: "Vel", category: "City", parent: "realm", icon: "icons/environment/settlement/house-two-fire.webp" },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city", dc: 16, skill: "inv", lore: [{ id: "g1", label: "Oath", dc: 12, skill: "rel", text: "<p>Salt.</p>", miss: "" }] },
  { id: "loner", title: "Loner", category: "smugglers' compact", icon: "icons/zz/custom.webp" },
  { id: "species:elf", title: "Elvenkind", category: "Species" },
];

const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 }, system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } }, flags: { "pentaryn-ties": { attributes: ["guild", "city", "realm"] } } },
    { id: NPC, name: "ZZ Brakka", system: { details: { type: { value: "undead" } }, traits: { size: "lg" } }, flags: { "pentaryn-ties": { attributes: ["guild", "ghost"], attributesOff: [] } } },
    { id: ELF, name: "ZZ Elf", system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } }, items: [{ id: "zzRace0000000001", name: "Wood Elf", type: "race" }, { id: "zzBg00000000001", name: "Sage", type: "background" }] },
  ],
});
const A = () => game.pentaryn.ties.attributes;
const At = await import("../attributes.mjs");
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
  return { label, out: out ?? null, calls: F.calls.slice(mark).filter(c => !c.op.startsWith("Hooks.")), console: F.console.slice(c0) };
};
const regIds = () => At.registry().map(e => e.id);

test("the ready step repaired the two dead default icons (and nothing else)", () => {
  pinJSON("attr-boot-repair", F.calls.filter(c => c.op === "settings.set"), import.meta.url);
  assert.equal(At.attributeById("realm").icon, "icons/sundries/flags/banner-standard-blue.webp");
  assert.equal(At.attributeById("loner").icon, "icons/zz/custom.webp");
});

test("reads: list, resolve, lookup, derived, ids, of (GM / own / player viewer), search, iconForCategory", async () => {
  pinJSON(
    "attr-reads",
    {
      list: A().list().map(e => e.id),
      resolve: ["guild", "Salt Guild", " salt guild ", "species:elf", "Elvenkind", "nope", "", null].map(r => [r, A().resolve(r)]),
      resolveCarried: A().resolve("ghost", { actor: get(NPC) }),
      derived: { pc: A().derived(get(PC)), npc: A().derived(get(NPC)), elf: A().derived(get(ELF)), none: A().derived(null) },
      ids: { pc: A().ids(get(PC)), npc: A().ids(get(NPC)), elf: A().ids(get(ELF)) },
      ofGM: A().of(get(NPC)).map(r => [r.id, r.title, r.authored, r.derived]),
      ofOwnViewer: await asPlayer(() => A().of(get(PC), null, { viewer: get(PC) }).map(r => r.id)),
      ofPlayerNoViewer: await asPlayer(() => A().of(get(NPC)).map(r => r.id)),
      searchEmpty: A().search("").matches.map(r => r.id),
      searchSa: { ...A().search("sa"), matches: A().search("sa").matches.map(r => r.id) },
      searchTaken: { ...A().search("Vel"), matches: A().search("Vel").matches.map(r => r.id), collidesWith: A().search("Vel").collidesWith?.id ?? null },
      icons: ["city", "Quarter", "CLAN", "smugglers' compact", "", null].map(c => [c, At.iconForCategory(c)]),
      hasAttributes: [At.hasAttributes(get(PC)), At.hasAttributes(null)],
      attributeLore: At.attributeLore("guild"),
      allIds: At.allAttributeIds(),
    },
    import.meta.url
  );
});

test("describeAttribute: authored, authored-under-derived, every derived namespace, unknown", async () => {
  await characterise("attr-describe", id => At.describeAttribute(id), ["guild", "city", "species:elf", "species:half_orc", "type:humanoid", "type:aberration", "size:lg", "size:tiny", `kind:${NPC}`, "kind:zzNope0000000001", "background:far-traveller", "ghost"], { file: import.meta.url });
});

test("the write contract: create / ensure / update / remove, and every refusal", async () => {
  const rows = [];
  rows.push(await run("player: create", () => asPlayer(() => A().create("Anything"))));
  rows.push(await run("create blank", () => A().create("   ")));
  rows.push(await run("create collision by id", () => A().create("Salt-Guild")));
  rows.push(await run("create collision by name", () => A().create("vel")));
  rows.push(await run("create with an unknown parent", () => A().create("Dock Ward", { parent: "Nowhere" })));
  rows.push(await run("create Dock Ward under Vel by name, with review fields forged", () => A().create("Dock Ward", { parent: "Vel", category: "Quarter", dc: 99, reviewedAt: 5, touched: ["x"], advantage: true })));
  rows.push(await run("ensure existing (opts ignored)", () => A().ensure("Dock Ward", { dc: 3 })));
  rows.push(await run("ensure new", () => A().ensure("Night Market", { category: "market" })));
  rows.push(await run("update: retitle onto another's name", () => A().update("dockward", { title: "Vel" })));
  rows.push(await run("update: parent cycle", () => A().update("realm", { parent: "dockward" })));
  rows.push(await run("update: unknown ref", () => A().update("nope", { dc: 3 })));
  rows.push(await run("update: dc 30", () => A().update("dockward", { dc: 30 })));
  rows.push(await run("update: the same dc again (no-op: nothing written)", () => A().update("dockward", { dc: 30 })));
  rows.push(await run("update: category re-dresses a default icon", () => A().update("dockward", { category: "Street" })));
  rows.push(await run("update: forged review fields are dropped", () => A().update("guild", { reviewedAt: 9, touched: [], dc: 17 })));
  rows.push(await run("update: clear the parent (already a root: unchanged)", () => A().update("nightmarket", { parent: "" })));
  rows.push(await run("remove by name", () => A().remove("Night Market")));
  rows.push(await run("remove missing", () => A().remove("Night Market")));
  rows.push(await run("player: update", () => asPlayer(() => A().update("guild", { dc: 3 }))));
  pinJSON("attr-writes", { rows, registry: regIds() }, import.meta.url);
});

test("review and selection: review / unreview / unreviewed, select / deselect / selected / clear", async () => {
  const rows = [];
  rows.push(await run("unreviewed()", () => A().unreviewed()));
  rows.push(await run("review guild", () => A().review("guild")));
  rows.push(await run("unreview realm", () => A().unreview("realm")));
  rows.push(await run("review missing", () => A().review("nope")));
  rows.push(await run("select guild, Vel, nope", () => A().select(["guild", "Vel", "nope"])));
  rows.push(await run("select realm (adds)", () => A().select("realm")));
  rows.push(await run("selected()", () => A().selected()));
  rows.push(await run("deselect Vel", () => A().deselect(["Vel"])));
  rows.push(await run("select loner, replace", () => A().select(["loner"], { replace: true })));
  rows.push(await run("clearSelection", () => A().clearSelection()));
  rows.push(await run("player: select", () => asPlayer(() => A().select(["guild"]))));
  rows.push(await run("reviewedUpdate on a reviewed entry stays reviewed", () => At.reviewedUpdate("guild", { dc: 18 })));
  rows.push(await run("reviewedUpdate on an unreviewed entry keeps its state", () => At.reviewedUpdate("dockward", { dc: 21 })));
  rows.push(await run("reviewedLoreUpdate g1 label", () => At.reviewedLoreUpdate("guild", "g1", "label", "Salt oath")));
  rows.push(await run("reviewedLoreUpdate id (refused)", () => At.reviewedLoreUpdate("guild", "g1", "id", "x")));
  rows.push(await run("reviewedLoreUpdate missing row", () => At.reviewedLoreUpdate("guild", "nope", "label", "x")));
  rows.push(await run("authorEntry species:dwarf", () => At.authorEntry({ id: "species:dwarf", title: "Dwarrow", category: "Species" })));
  rows.push(await run("authorEntry species:dwarf again (collision)", () => At.authorEntry({ id: "species:dwarf", title: "Other", category: "Species" })));
  rows.push(await run("authorEntry name clash", () => At.authorEntry({ id: "species:gnome", title: "Vel", category: "Species" })));
  rows.push(await run("stampNew(7)", () => At.stampNew(7)));
  pinJSON("attr-review", rows, import.meta.url);
});

test("links: link materialises ancestors and un-suppresses; unlink takes descendants and suppresses derived", async () => {
  const rows = [];
  rows.push(await run("link NPC Dock Ward (adds Vel, Old Realm)", () => A().link(get(NPC), "Dock Ward")));
  rows.push(await run("link NPC Dock Ward again (nothing to add)", () => A().link(get(NPC), "dockward")));
  rows.push(await run("link unknown", () => A().link(get(NPC), "Nowhere")));
  rows.push(await run("link null actor", () => A().link(null, "guild")));
  rows.push(await run("unlink NPC Vel (takes guild, dockward)", () => A().unlink(get(NPC), "Vel")));
  rows.push(await run("unlink NPC the dangling ghost id", () => A().unlink(get(NPC), "ghost")));
  rows.push(await run("unlink NPC type:undead (derived → suppressed)", () => A().unlink(get(NPC), "type:undead")));
  rows.push(await run("link NPC type:undead (un-suppressed)", () => A().link(get(NPC), "type:undead")));
  rows.push(await run("unlink something not carried", () => A().unlink(get(NPC), "loner")));
  rows.push(await run("player: link", () => asPlayer(() => A().link(get(PC), "loner"))));
  rows.push(await run("broken(PC) after removing Vel from its flag", async () => {
    get(PC).flags["pentaryn-ties"].attributes = ["guild", "realm", "ghost2"];
    return A().broken(get(PC));
  }));
  rows.push(await run("repair(PC, guild)", () => A().repair(get(PC), "guild")));
  rows.push(await run("stale(guild) after re-parenting it to the realm", async () => {
    await A().update("guild", { parent: "realm" });
    return A().stale("guild").map(r => ({ actor: r.actor.id, extra: r.extra, missing: r.missing }));
  }));
  rows.push(await run("stale(nope)", () => A().stale("nope")));
  pinJSON("attr-links", { rows, flags: { pc: get(PC).flags["pentaryn-ties"], npc: get(NPC).flags["pentaryn-ties"] } }, import.meta.url);
});

test("world knowledge: tell, knows, known, the tree (player and GM), branchOf, setKnowledge, clearKnowledge", async () => {
  const rows = [];
  const elf = get(ELF);
  rows.push(await run("tell ELF guild", () => A().tell(elf, "guild")));
  rows.push(await run("tell ELF loner withParents", () => A().tell(elf, "Loner", { withParents: true })));
  rows.push(await run("tell ELF dockward withParents", () => A().tell(elf, "dockward", { withParents: true })));
  rows.push(await run("tell unknown", () => A().tell(elf, "nope")));
  rows.push(await run("tell no character", () => A().tell(null, "guild")));
  rows.push(await run("player: tell", () => asPlayer(() => A().tell(elf, "guild"))));
  rows.push(await run("setKnowledge: a failure and a pending pass", () => At.setKnowledge([
    { characterId: ELF, attrId: "realm", failed: true, via: "roll", when: 3 },
    { characterId: ELF, attrId: "city", failed: false, via: "roll", when: 4, pending: true },
    { characterId: "", attrId: "x" },
  ])));
  rows.push(await run("setKnowledge: nothing", () => At.setKnowledge([])));
  rows.push(await run("knows()", () => A().knows()));
  rows.push(await run("known(ELF) as player view", () => A().known(elf).map(r => [r.attrId, r.via, r.failed, r.pending])));
  rows.push(await run("known(ELF) forGM", () => A().known(elf, { forGM: true }).map(r => [r.attrId, r.via, r.failed, r.pending])));
  rows.push(await run("known(PC) carried", () => A().known(get(PC)).map(r => [r.attrId, r.via])));
  rows.push(await run("knowledgeTree(ELF) player", () => At.knowledgeTree(elf)));
  rows.push(await run("knowledgeTree(ELF) GM", () => At.knowledgeTree(elf, { forGM: true })));
  rows.push(await run("branchOf(realm, ELF)", () => At.branchOf("realm", elf).map(n => [n.id, n.state])));
  rows.push(await run("branchOf(realm, ELF, GM)", () => At.branchOf("realm", elf, { forGM: true }).map(n => [n.id, n.state])));
  rows.push(await run("branchOf(realm) no character", () => At.branchOf("realm")));
  rows.push(await run("knowsIncludingCarried(PC)", () => [...At.knowsIncludingCarried(get(PC))]));
  rows.push(await run("knowsOf / hasFailed", () => [At.knowsOf(elf, "guild"), At.hasFailed(elf, "realm"), At.knowsOf(null, "guild")]));
  rows.push(await run("clearKnowledge: a granted row (not shared: refused)", () => At.clearKnowledge(ELF, "guild")));
  await At.setKnowledge([{ characterId: ELF, attrId: "loner", via: "shared", when: 5 }, { characterId: ELF, attrId: "realm", via: "shared", when: 6, overFailed: true }]);
  rows.push(await run("clearKnowledge: a shared row", () => At.clearKnowledge(ELF, "loner")));
  rows.push(await run("clearKnowledge: a share over a failure gives the failure back", () => At.clearKnowledge(ELF, "realm")));
  rows.push(await run("knows() after", () => A().knows()));
  pinJSON("attr-knowledge", rows, import.meta.url);
});

test("repairIcons on demand: nothing left to repair", async () => {
  assert.equal(await At.repairIcons(), 0);
  assert.equal(await asPlayer(() => At.repairIcons()), 0);
});
