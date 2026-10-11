/**
 * The pings test world: a GM and a player, three scenes, a recording socket and a ControlsLayer stub.
 *
 * Fidelity notes (context/plans/addon-blueprint-2026-10/wave-1-baseline.md, live golden
 * .state/live-goldens/before/pings.json):
 *   SF3  `game.settings.get("pentaryn-pings", "log")` returns the SAME cached array on every call, and a
 *        flush replaces it with a new one. The kit stub returns the stored reference for a value that was
 *        seeded or set; `settings.set` is wrapped here to store a structured copy, as the live cache does.
 *        The log is always seeded (a world that has run pings has a stored ring), so the read lag is
 *        state-dependent exactly as live.
 *   SF4  ControlsLayer#handlePing lives on the prototype and returns a Promise; the stub is async.
 *   SF5  4000×3000, padding 0.25, grid 100 → Foundry's sceneX/sceneY 1000/800 = imageOffset.
 *
 * The scene "ZZ live-goldens pings" and the GM "Gamemaster" reproduce the live golden's names.
 */
import { installFoundry } from "../kit/foundry-stub.mjs";

export const MODULE = "pentaryn-pings";
export const GM = "gmUser0000000001";
export const PLAYER = "plyrUser00000001";
export const ALPHA = "sceneAlpha000001";   // 4000×3000, padding 0.25, grid 100 → offset 1000/800 (viewed)
export const BETA = "sceneBeta0000001";    // 2000×1500, padding 0.25, grid 100 → offset 500/400
export const HEX = "sceneHex00000001";     // 3000×2000, padding 0.25, hex grid 100 → offset 800/500
export const BARE = "sceneBare0000001";    // 2100×1100, padding 0.1, no grid field → g 100, offset 300/200 (210, 110 round UP)

export const SCENES = [
  { id: ALPHA, name: "ZZ live-goldens pings", width: 4000, height: 3000, padding: 0.25, grid: { size: 100, type: 1 } },
  { id: BETA, name: "Beta", width: 2000, height: 1500, padding: 0.25, grid: { size: 100, type: 1 } },
  { id: HEX, name: "Hex", width: 3000, height: 2000, padding: 0.25, grid: { size: 100, type: 2 } },
  { id: BARE, name: "Bare", width: 2100, height: 1100, padding: 0.1 },
];

/** Let pending promise callbacks run (mocked timers do not drain microtasks). */
export const drain = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/**
 * @param {{ player?: boolean, seed?: object[], layer?: "foundry" | "config" | "none", settings?: object }} o
 */
export async function setupWorld({ player = false, seed = [], layer = "foundry", settings = {} } = {}) {
  const F = await installFoundry({
    user: player ? { id: PLAYER, name: "Rook", isGM: false } : { id: GM, name: "Gamemaster", isGM: true },
    users: [player ? { id: GM, name: "Gamemaster", isGM: true } : { id: PLAYER, name: "Rook", isGM: false }],
    scenes: SCENES,
    currentScene: ALPHA,
    settings: { [`${MODULE}.log`]: seed, ...settings },
  });

  /* settings.set: store a copy (SF3); a queued failure rejects the next write */
  const W = { F, failSet: [], socket: [], pings: [], console: [] };
  const set = F.game.settings.set;
  F.game.settings.set = async (namespace, key, value) => {
    if (W.failSet.length) {
      F.calls.push({ op: "settings.set:rejected", id: `${namespace}.${key}` });
      throw W.failSet.shift();
    }
    return set(namespace, key, structuredClone(value));
  };

  /* socket.on records its listeners */
  F.game.socket.on = (event, fn) => {
    W.socket.push([event, fn]);
  };
  W.emitSocket = (event, ...args) => {
    for (const [e, fn] of W.socket) if (e === event) fn(...args);
  };

  /* ControlsLayer stub (SF4) */
  class ControlsLayer {
    async handlePing(user, position, options) {
      W.pings.push({ self: this, user, position, options });
      return "drawn";
    }
  }
  W.ControlsLayer = ControlsLayer;
  W.original = ControlsLayer.prototype.handlePing;
  if (layer === "foundry") F.foundry.canvas.layers = { ControlsLayer };
  if (layer === "config") F.CONFIG.Canvas = { layers: { controls: { layerClass: ControlsLayer } } };

  /* console capture: every line, muted */
  W.captureConsole = () => {
    const saved = {};
    for (const level of ["log", "warn", "error"]) {
      saved[level] = console[level];
      console[level] = (...args) => W.console.push([level, ...args]);
    }
    return () => Object.assign(console, saved);
  };

  W.log = () => F.calls.filter(c => c.op === "settings.set" && c.id === `${MODULE}.log`);
  W.stored = () => F.game.settings.get(MODULE, "log");
  return W;
}
