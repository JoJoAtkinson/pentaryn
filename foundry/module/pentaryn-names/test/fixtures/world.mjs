// Synthetic world for the glue test and the subprocess probe (no real campaign data).
//
// Stub fidelity (wave-1-baseline.md SF6, SF7 and the live golden .state/live-goldens/before/names.json):
// - Tokens are unlinked (actorLink false) and carry the base actor's id, as a fresh npc's tokens do
//   live; renaming the base actor relabels every one of them (SF6).
// - The kit stub's Document#update fires preUpdate/update hooks but does not diff. Foundry 14.369
//   calls `preUpdate<Type>` with the cleaned, UNDIFFED changes (client/data/client-backend.mjs:238-239)
//   and then drops an empty diff before it reaches the server (:262), so a same-name write is stopped
//   by names' own `changes.name !== actor.name` guard and updateActor never fires live (SF7). In the
//   stub updateActor does fire, and names bails on the missing `pentarynOldNames` — same outcome.
// - Scene#updateEmbeddedDocuments and TokenDocument#canUserModify are added here (the kit stub has
//   neither). canUserModify answers `!zzLocked` and records its arguments.
// - game.combats is added here too (the kit stub has none): empty unless `equip(F, {combats})` names
//   some. A stub Combatant's `name` stands for Foundry's PREPARED name: v14.369 derives an empty
//   source name once, `this.name ||= token?.name || this.actor?.name` (client/documents/combatant.mjs:168),
//   and a later token rename only re-sorts the tracker (Combat#debounceSetup), it does not re-prepare
//   the combatant — so the tracker keeps the old label (PT3-9). Combat#updateEmbeddedDocuments
//   records the write and applies the names.
import { StubCollection, makeDoc } from "../kit/foundry-stub.mjs";
import { readJSON } from "../kit/harness.mjs";

export const MODULE = "pentaryn-names";
export const ROOT = new URL("../..", import.meta.url);
export const LANG = readJSON(new URL("lang/en.json", ROOT));

export const IDS = {
  gm: "gmUser0000000001",
  player: "plyUser000000001",
  bob: "actorBob00000001",
  other: "actorOther000001",
  glubbek: "actorGlubbek0001",
  one: "sceneOne00000001",
  two: "sceneTwo00000001",
  three: "sceneThree000001",
  live: "sceneLive0000001",
};

export const OLD = "ZZ Glubbek, Golden Net-Mender";
export const NEW = "ZZ Brakka, Golden Elder";

/** Initial labels, so `reset()` can put the world back between cases. */
const INITIAL = {
  actors: {
    [IDS.bob]: { name: "Bob", proto: "Bob" },
    [IDS.other]: { name: "Bob", proto: "Bob" },
    [IDS.glubbek]: { name: OLD, proto: OLD },
  },
  tokens: {
    tokA1000000000001: "Bob",
    tokLocked00000001: "Bob",
    tokOther000000001: "Bob",
    tokNick0000000001: "Fishface",
    tokA2000000000001: "Bob",
    tokBobby000000001: "Bobby",
    tokFull0000000001: OLD,
    tokShort000000001: "ZZ Glubbek",
  },
};

const actor = (id, name) => ({ id, name, type: "npc", prototypeToken: { name, actorLink: false } });
const token = (id, actorId, x, extra = {}) => ({ id, actorId, actorLink: false, x, y: 100, name: INITIAL.tokens[id], ...extra });

export function world({ user = {}, modules = [] } = {}) {
  return {
    user: { id: IDS.gm, name: "Gamemaster", isGM: true, ...user },
    users: [{ id: IDS.player, name: "Player" }],
    lang: LANG,
    modules: [{ id: MODULE, version: readJSON(new URL("module.json", ROOT)).version }, ...modules],
    actors: [actor(IDS.bob, "Bob"), actor(IDS.other, "Bob"), actor(IDS.glubbek, OLD)],
    scenes: [
      {
        id: IDS.one, name: "ZZ One",
        tokens: [
          token("tokA1000000000001", IDS.bob, 100),
          token("tokLocked00000001", IDS.bob, 200, { zzLocked: true }),
          token("tokOther000000001", IDS.other, 300),
          token("tokNick0000000001", IDS.bob, 400),
        ],
      },
      { id: IDS.two, name: "ZZ Two", tokens: [token("tokA2000000000001", IDS.bob, 100)] },
      { id: IDS.three, name: "ZZ Three", tokens: [token("tokBobby000000001", IDS.bob, 100)] },
      {
        id: IDS.live, name: "ZZ live-goldens names",
        tokens: [token("tokFull0000000001", IDS.glubbek, 100), token("tokShort000000001", IDS.glubbek, 300)],
      },
    ],
  };
}

/**
 * Add the document methods names calls that the kit stub lacks. Returns the canUserModify log.
 * `combats`: `[{id, combatants: [{id, actorId, tokenId, sceneId, name}]}]` for game.combats.
 */
export function equip(F, { combats = [] } = {}) {
  const asked = [];
  F.game.combats = new StubCollection(combats.map(c => makeCombat(F, c)));
  for (const scene of F.game.scenes) {
    Object.defineProperty(scene, "updateEmbeddedDocuments", {
      configurable: true,
      writable: true,
      enumerable: false,
      value: async (embeddedName, updates, options = {}) => {
        F.calls.push({ op: "updateEmbeddedDocuments", uuid: scene.uuid, embeddedName, updates: F.plain(updates), options: F.plain(options) });
        const coll = embeddedName === "Token" ? scene.tokens : null;
        return updates.map(u => {
          const doc = coll?.get(u._id);
          if (doc) for (const [k, v] of Object.entries(u)) if (k !== "_id") doc[k] = v;
          return doc;
        });
      },
    });
    for (const t of scene.tokens) {
      Object.defineProperty(t, "canUserModify", {
        configurable: true,
        enumerable: false,
        value(user, action) {
          asked.push({ token: this.id, user: user?.id ?? null, action });
          return !this.zzLocked;
        },
      });
    }
  }
  return asked;
}

/** A stub Combat holding stub Combatants, with a recording Combat#updateEmbeddedDocuments. */
function makeCombat(F, { combatants = [], ...data }) {
  const combat = makeDoc("Combat", data);
  const coll = new StubCollection(combatants.map(c => makeDoc("Combatant", c, { parent: combat })));
  for (const c of coll) Object.defineProperty(c, "collection", { value: coll, writable: true, enumerable: false });
  Object.defineProperty(combat, "combatants", { value: coll, enumerable: false });
  Object.defineProperty(combat, "updateEmbeddedDocuments", {
    configurable: true,
    writable: true,
    enumerable: false,
    value: async (embeddedName, updates, options = {}) => {
      F.calls.push({ op: "updateEmbeddedDocuments", uuid: combat.uuid, embeddedName, updates: F.plain(updates), options: F.plain(options) });
      return updates.map(u => {
        const doc = embeddedName === "Combatant" ? coll.get(u._id) : null;
        if (doc) for (const [k, v] of Object.entries(u)) if (k !== "_id") doc[k] = v;
        return doc;
      });
    },
  });
  return combat;
}

/** Put every label back to INITIAL and clear the effect log. */
export function reset(F) {
  for (const [id, { name, proto }] of Object.entries(INITIAL.actors)) {
    const a = F.game.actors.get(id);
    a.name = name;
    a.prototypeToken.name = proto;
  }
  for (const scene of F.game.scenes) for (const t of scene.tokens) t.name = INITIAL.tokens[t.id];
  F.calls.length = 0;
}

/** Labels in the live golden's shape (rename / noop / nickname), ids normalised the same way. */
export function liveLabels(F) {
  const a = F.game.actors.get(IDS.glubbek);
  const tag = { tokFull0000000001: "<tokFull>", tokShort000000001: "<tokShort>" };
  return {
    actor: a.name,
    proto: a.prototypeToken.name,
    tokens: [...F.game.scenes.get(IDS.live).tokens]
      .sort((x, y) => x.x - y.x)
      .map(t => ({ id: tag[t.id], name: t.name, actorLink: t.actorLink, synthetic: !t.actorLink })),
  };
}

/** Effects only: document writes and toasts (the stub's own Hooks.call/callAll bookkeeping dropped). */
export const effects = calls => calls.filter(c => !c.op.startsWith("Hooks."));

/** Let fire-and-forget work (sync() from updateActor) finish: microtasks only, no timers. */
export async function flush() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
