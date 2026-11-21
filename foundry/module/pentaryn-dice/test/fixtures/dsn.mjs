/**
 * Synthetic Dice So Nice for the tests: a `game.dice3d` with the persistent-dice surface this
 * module uses (shaped after DSN 6.4.5's PersistentDice / PersistentDiceManager), the sidebar tab's
 * dice-list DOM (after templates/dsn-sidebar-tab.hbs), and the world options for installFoundry.
 * Never real campaign data: test/ ships to Data/.
 */

import { readJSON } from "../kit/harness.mjs";
import { h } from "./dom.mjs";

export const IDS = Object.freeze({
  gm: "gmUser0000000001",
  player: "player0000000001",
});

export const LANG = readJSON(new URL("../../lang/en.json", import.meta.url));

/** installFoundry() options: this module and Dice So Nice active, the en strings loaded. */
export function world(moduleId, extra = {}) {
  return {
    users: [{ id: IDS.player, name: "P", isGM: false }],
    modules: [{ id: moduleId, version: "0.1.0" }, { id: "dice-so-nice", version: "6.4.5" }],
    lang: LANG,
    ...extra,
  };
}

/**
 * A fake `game.dice3d`. `maxDice` stands in for DSN's maxDiceNumber: spawn returns null past it.
 * `calls` records spawn calls and outline redraws in order.
 */
export function fakeDsn({ userId = IDS.gm, maxDice = 100 } = {}) {
  let seq = 100;
  const list = [];
  const selected = new Set();
  const calls = [];
  const make = (type, opts = {}) => {
    const mesh = {
      id: ++seq,
      notation: { type },
      userData: {
        persistent: true,
        persistentId: `p${seq}`,
        ownerUserId: opts.ownerUserId ?? userId,
        ...(opts.linkGroupId ? { linkGroupId: opts.linkGroupId } : {}),
        ...(opts.linkGroupSecondary ? { linkGroupSecondary: true } : {}),
        ...(opts.digitPlace != null ? { digitPlace: opts.digitPlace } : {}),
        ...(opts.guest ? { guest: true } : {}),
      },
    };
    list.push(mesh);
    return mesh;
  };
  const manager = {
    persistentDiceList: list,
    selectedPersistentDiceIds: selected,
    onSelectionChanged: () => calls.push(["outlines", selected.size]),
    togglePersistentSelection(mesh) {
      if (selected.has(mesh.id)) selected.delete(mesh.id);
      else selected.add(mesh.id);
      this.onSelectionChanged?.();
    },
    clearPersistentSelection() {
      if (selected.size === 0) return;
      selected.clear();
      this.onSelectionChanged?.();
    },
    getSelectedPersistentDice() {
      return list.filter(m => selected.has(m.id));
    },
    countPersistentDiceByOwner(uid = null, type = null) {
      return list.filter(m => m.userData.ownerUserId === uid && (!type || m.notation.type === type) && !m.userData.linkGroupSecondary).length;
    },
  };
  const persistent = {
    async spawn(type, position = null, opts = {}) {
      calls.push(["spawn", type, { ...opts }]);
      if (list.length >= maxDice) return null;
      return make(type, opts);
    },
  };
  return { dice3d: { box: { persistentDiceManager: manager }, persistent }, list, selected, calls, manager, make };
}

/** The dice list part of DSN's sidebar tab, for `types`, followed by the "Clear my dice" section. */
export function tabElement(types = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"]) {
  const row = type => h("li", { cls: "dsn-toolbox-dice-row", data: { type } }, [
    h("span", { cls: "dsn-toolbox-dice-label", text: type.toUpperCase() }),
    h("span", { cls: "dsn-toolbox-dice-count", text: "0" }),
    h("div", { cls: "dsn-toolbox-dice-buttons" }, [
      h("button", { cls: "dsn-toolbox-btn", data: { action: "remove", type }, text: "−" }),
      h("button", { cls: "dsn-toolbox-btn", data: { action: "spawn", type }, text: "+" }),
    ]),
  ]);
  return h("section", { cls: "dice-so-nice dsn-sidebar-tab" }, [
    h("section", { cls: "dsn-toolbox-section" }, [
      h("h3", { cls: "dsn-sidebar-title", text: "Persistent dice" }),
      h("ul", { cls: "dsn-toolbox-dice-list" }, types.map(row)),
    ]),
    h("section", { cls: "dsn-toolbox-section dsn-toolbox-clear" }, [
      h("button", { cls: "dsn-toolbox-clear-btn", data: { action: "clearMine" }, text: "Clear my dice" }),
    ]),
    h("section", { cls: "dsn-toolbox-section dsn-toolbox-help" }),
  ]);
}

/** The tab with persistent dice off: no dice list at all. */
export function disabledTabElement() {
  return h("section", { cls: "dice-so-nice dsn-sidebar-tab" }, [
    h("p", { cls: "dsn-toolbox-notice", text: "Persistent dice are disabled." }),
  ]);
}

/** Let pending promise jobs run. */
export const flush = () => new Promise(r => setImmediate(r));
