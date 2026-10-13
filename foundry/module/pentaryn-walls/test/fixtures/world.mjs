/**
 * The walls glue's stand-in world (guide step 1.8). A GM client, a scene stub whose wall documents
 * throw Foundry's inactive-scope error from `getFlag("wall-autocomplete", …)` (as Foundry 14 does for
 * a scope that is no active package), embedded-document writes logged to `F.calls`, and spies for
 * ChatMessage, Macro, the hotbar, canvas pings (broadcast and local), the console and notifications (with their options).
 */

import { StubCollection, installFoundry, makeDoc, makeUser } from "../kit/foundry-stub.mjs";
import { readJSON } from "../kit/harness.mjs";
import { FIXTURES } from "./corpus.mjs";

/** lang/en.json, so game.i18n renders the toasts as Foundry would (Wave 7 batch, -36). */
const LANG = readJSON(new URL("../../lang/en.json", import.meta.url));

export const GM = "gmUser0000000001";
export const PLAYER = "player0000000001";

const fx = name => FIXTURES.find(f => f.name === name);

/** Walls as Foundry documents (getFlag goes through the stub's scope check). */
export function wallDocs(walls) {
  return walls.map(w => {
    const { _id, ...data } = w;
    return makeDoc("Wall", { id: _id, ...data });
  });
}

/**
 * A scene: the D1 square house (9 creates) plus the "endpoint just off a diagonal" pair moved 5000 px
 * away (1 update) plus a lone stub far off (refusals).
 */
export function houseWalls() {
  const shift = (w, dx, dy) => ({ ...w, _id: `${w._id}-far`, c: [w.c[0] + dx, w.c[1] + dy, w.c[2] + dx, w.c[3] + dy] });
  return [
    ...fx("D1 square house — 3 windows, 1 door, 1 hint").walls,
    ...fx("endpoint just off a diagonal snaps rather than extends").walls.map(w => shift(w, 5000, 0)),
  ];
}

export function makeScene(F, { id, name = "S", walls = [] }) {
  const coll = new StubCollection(wallDocs(walls));
  const scene = makeDoc("Scene", { id, name, grid: { size: 100 } });
  Object.defineProperty(scene, "walls", { value: coll, enumerable: false });
  const write = op => async (type, data) => {
    F.calls.push({ op, type, data: F.plain(data) });
    if (F.hold?.[op]) return F.hold[op];
    return data;
  };
  scene.updateEmbeddedDocuments = write("updateEmbeddedDocuments");
  scene.createEmbeddedDocuments = write("createEmbeddedDocuments");
  scene.deleteEmbeddedDocuments = write("deleteEmbeddedDocuments");
  F.game.scenes.set(id, scene);
  return scene;
}

export async function wallsWorld({ isGM = true } = {}) {
  const F = await installFoundry({
    user: makeUser(isGM ? { id: GM, name: "Gamemaster", isGM: true } : { id: PLAYER, name: "Pat", isGM: false }),
    users: isGM ? [{ id: PLAYER, name: "Pat", isGM: false }] : [{ id: GM, name: "Gamemaster", isGM: true }],
    modules: ["pentaryn-walls"],
    lang: LANG,
  });
  F.hold = {};
  const gm = F.game.users.get(GM);

  globalThis.ChatMessage = {
    create: async data => {
      F.calls.push({ op: "ChatMessage.create", data: F.plain(data) });
      return data;
    },
    getWhisperRecipients: role => (role === "GM" ? [gm] : []),
  };
  F.game.macros = new StubCollection();
  // `{keepId: true}` keeps the given `_id`; a second create of a stored id is refused the way
  // Foundry's server refuses it. `F.hold["Macro.create"]` parks every create (two overlapping
  // calls, or two GM tabs, both past the lookup — walls-async-2).
  globalThis.Macro = {
    create: async (data, options = {}) => {
      F.calls.push({ op: "Macro.create", data: F.plain(data), options: F.plain(options) });
      if (F.hold?.["Macro.create"]) await F.hold["Macro.create"];
      const { _id, ...rest } = data;
      const id = options.keepId ? _id : undefined;
      if (id && F.game.macros.has(id)) throw new Error(`The Macro [${id}] already exists in the database`);
      const macro = makeDoc("Macro", id ? { ...rest, id } : rest);
      F.game.macros.set(macro.id, macro);
      return macro;
    },
  };
  F.game.user.assignHotbarMacro = async (macro, slot) => {
    F.calls.push({ op: "assignHotbarMacro", name: macro.name, slot: slot ?? null });
  };
  F.canvas.ping = at => F.calls.push({ op: "canvas.ping", at });
  // Foundry 14: ControlsLayer#drawPing draws on this client only (canvas.ping broadcasts).
  F.CONFIG.Canvas = { pings: { types: { PULSE: "pulse", ALERT: "alert", PULL: "chevron", ARROW: "arrow" } } };
  F.canvas.controls = { drawPing: (at, opts) => F.calls.push({ op: "canvas.controls.drawPing", at, opts: opts ?? null }) };
  for (const level of ["info", "warn", "error"]) {
    F.ui.notifications[level] = (message, opts) => {
      F.calls.push({ op: "notify", level, message: String(message), opts: opts ?? null });
    };
  }
  return F;
}

/** Capture console.group/table/groupEnd/log/error into F.calls while `fn` runs (sync or async). */
export async function withConsole(F, fn) {
  const keep = {};
  for (const k of ["group", "table", "groupEnd", "log", "error"]) {
    keep[k] = console[k];
    console[k] = (...args) => F.calls.push({ op: `console.${k}`, args: args.map(a => (a instanceof Error ? `Error: ${a.message}` : F.plain(a))) });
  }
  try {
    return await fn();
  } finally {
    Object.assign(console, keep);
  }
}
