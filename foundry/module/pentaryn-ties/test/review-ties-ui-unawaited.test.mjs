/**
 * Final code review (ties-ui-rob-5): savePinned wrapped `game.settings.set` in try/catch without
 * awaiting it, and LookWindow.open fired `render({force:true})` the same way — so a rejected save or
 * a failed render escaped the catch and surfaced as an unhandled rejection without the module prefix.
 * Ruling [declared]: the save gets `.catch(err => log.warn('could not save pinned cards', err))`;
 * both renders in LookWindow.open get `.catch(err => log.error('look window', err))`.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzRob5Pc00000001";
const NPC = "zzRob5Npc0000001";
const PLAYER = "zzRob5Player0001";

await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  settings: { "pentaryn-ties.playerAccess": true },
  actors: [
    { id: PC, name: "ZZ Rob5 PC", type: "character", ownership: { default: 0, [PLAYER]: 3 } },
    { id: NPC, name: "ZZ Rob5 NPC" },
  ],
});
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};

/** Run `fn`, then let the microtasks settle; return the unhandled rejections and console lines seen. */
async function watch(level, fn) {
  const unhandled = [];
  const onRej = err => unhandled.push(err);
  process.on("unhandledRejection", onRej);
  const lines = [];
  const spy = mock.method(console, level, (...args) => lines.push(args));
  try {
    await fn();
    await flush();
  } finally {
    spy.mock.restore();
    process.off("unhandledRejection", onRej);
  }
  return { unhandled, lines };
}

test("ties-ui-rob-5 savePinned: a rejected settings write is caught and warned with the module prefix", async () => {
  await flush();
  const { closeAll } = await import("../popups.mjs");
  const set = mock.method(game.settings, "set", () => Promise.reject(new Error("zz save refused")));
  try {
    const { unhandled, lines } = await watch("warn", () => closeAll());
    assert.equal(set.mock.callCount(), 1, "closeAll saves the pins");
    assert.deepEqual(unhandled, [], "no unhandled rejection");
    assert.ok(
      lines.some(([msg, err]) => msg === "pentaryn-ties | could not save pinned cards" && err?.message === "zz save refused"),
      `warned with the prefix: ${JSON.stringify(lines.map(l => l[0]))}`
    );
  } finally {
    set.mock.restore();
  }
});

test("ties-ui-rob-5 LookWindow.open: a rejected render (new and existing window) is caught and logged with the prefix", async () => {
  const { LookWindow } = await import("../look-app.mjs");
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  const render = mock.method(LookWindow.prototype, "render", () => Promise.reject(new Error("zz render failed")));
  try {
    const character = game.actors.get(PC);
    const subject = game.actors.get(NPC);
    for (const which of ["new", "existing"]) {
      const { unhandled, lines } = await watch("error", () => {
        const win = LookWindow.open(character, subject);
        assert.ok(win, `${which}: the window is returned`);
      });
      assert.deepEqual(unhandled, [], `${which}: no unhandled rejection`);
      assert.ok(
        lines.some(([msg, err]) => msg === "pentaryn-ties | look window" && err?.message === "zz render failed"),
        `${which}: logged with the prefix: ${JSON.stringify(lines.map(l => l[0]))}`
      );
    }
    assert.equal(render.mock.callCount(), 2);
  } finally {
    render.mock.restore();
    game.user = gm;
  }
});
