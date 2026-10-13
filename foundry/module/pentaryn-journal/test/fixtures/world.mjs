/**
 * The journal glue's stand-in world (guide step 1.5): the active GM (`gmUser0000000001`), a second GM
 * who is not the active one, two players, an empty `game.journal` and `game.folders`, JournalEntry and
 * Folder create stubs that log to `F.calls`, and lang/en.json loaded. Synthetic only — this folder is
 * served to every client.
 */

import { readFileSync } from "node:fs";
import { StubCollection, installFoundry, makeDoc, makeUser } from "../kit/foundry-stub.mjs";

export const GM = "gmUser0000000001";
export const GM2 = "gmUser0000000002";
export const P1 = "player0000000001";
export const P2 = "player0000000002";

export async function journalWorld() {
  const lang = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
  const F = await installFoundry({
    user: makeUser({ id: GM, name: "Gamemaster", isGM: true }),
    users: [
      { id: GM2, name: "Co-GM", isGM: true },
      { id: P1, name: "Pat", isGM: false, character: { name: "Talo Vesk" } },
      { id: P2, name: "Quinn", isGM: false },
    ],
    lang,
    modules: ["pentaryn-journal"],
  });
  F.game.folders = new StubCollection();
  let created = 0;
  globalThis.Folder = {
    create: async data => {
      const folder = makeDoc("Folder", data);
      F.game.folders.set(folder.id, folder);
      F.calls.push({ op: "Folder.create", data: F.plain(data) });
      return folder;
    },
  };
  globalThis.JournalEntry = {
    canUserCreate: user => !!user?.isGM,
    create: async data => {
      const entry = makeDoc("JournalEntry", { ...data, _stats: { createdTime: ++created } });
      const pages = new StubCollection();
      Object.defineProperty(entry, "pages", { value: pages, enumerable: false });
      entry.createEmbeddedDocuments = async (type, list) => {
        F.calls.push({ op: "createEmbeddedDocuments", on: entry.name, type, data: F.plain(list) });
        return list.map(d => {
          const page = makeDoc("JournalEntryPage", d, { parent: entry, collection: pages });
          pages.set(page.id, page);
          return page;
        });
      };
      entry.updateEmbeddedDocuments = async (type, list) => {
        F.calls.push({ op: "updateEmbeddedDocuments", on: entry.name, type, data: F.plain(list) });
        return list;
      };
      entry.sheet = {
        rendered: false,
        render: async opts => { F.calls.push({ op: "sheet.render", on: entry.name, opts: F.plain(opts) }); },
        setPosition: pos => F.calls.push({ op: "sheet.setPosition", pos }),
      };
      F.game.journal.set(entry.id, entry);
      F.calls.push({ op: "JournalEntry.create", data: F.plain(data) });
      return entry;
    },
    updateDocuments: async updates => {
      F.calls.push({ op: "JournalEntry.updateDocuments", data: F.plain(updates) });
      for (const u of updates) Object.assign(F.game.journal.get(u._id), u);
      return updates;
    },
  };
  globalThis.HTMLElement ??= class HTMLElement {};
  F.game.time = { worldTime: 86_400, get serverTime() { return Date.now(); } };
  F.foundry.applications.sheets = { journal: { JournalEntrySheet: class JournalEntrySheet { static VIEW_MODES = { SINGLE: 1, MULTIPLE: 2 }; } } };
  F.foundry.applications.apps = { ImagePopout: class ImagePopout {} };
  F.foundry.applications.instances = new Map();
  for (const level of ["info", "warn", "error"]) {
    F.ui.notifications[level] = (message, opts) => {
      F.calls.push({ op: "notify", level, message: String(message), opts: opts ?? null });
    };
  }
  return F;
}
