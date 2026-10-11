/**
 * Pentaryn Feedback — ADAPTER: the live game → plain context JSON for a report.
 *
 * The only file that reads canvas / ui / game state for a report (the recorder reads only what its
 * hooks hand it). `snapshot({ g })` never throws: every section runs in its own try and reports
 * `{ error }` on failure, so one broken section never blocks a report. Reads only — nothing here
 * awaits or writes.
 *
 * Never attached: other users' chat, whisper text, chat content, setting values, form input values,
 * journal text.
 */

import { LIMITS, chatEntry, clip, messageOf, redact, userFields } from "./feedback-core.mjs";

const section = fn => {
  try {
    return fn();
  } catch (err) {
    return { error: clip(messageOf(err), LIMITS.message) };
  }
};

const ref = doc => (doc ? { id: doc.id ?? null, name: clip(doc.name) } : null);

/** `{ value, max }` from a dnd5e actor's hp, or null. */
function hpOf(actor) {
  const hp = actor?.system?.attributes?.hp;
  return hp && Number.isFinite(hp.value) ? { value: hp.value, max: Number.isFinite(hp.max) ? hp.max : null } : null;
}

function tokenRow(t) {
  const doc = t?.document ?? t;
  const actor = t?.actor ?? doc?.actor ?? null;
  return {
    id: doc?.id ?? null, name: clip(doc?.name ?? t?.name),
    actorId: actor?.id ?? null, actorName: clip(actor?.name), actorType: actor?.type ?? null, hp: hpOf(actor),
  };
}

/** An application instance (V2 or V1) → `{ id, cls, title }`. */
export function windowRow(app) {
  return {
    id: clip(app?.id ?? app?.appId ?? null, LIMITS.field),
    cls: clip(app?.constructor?.name ?? null, 60),
    title: redact(app?.title ?? app?.options?.window?.title ?? "", LIMITS.title),
  };
}

/**
 * The live context. `g` is injectable for tests.
 * @returns {{ world, user, scene, tokens, combat, windows, modules, client, chat }}
 */
export function snapshot({ g = globalThis } = {}) {
  const game = g.game;
  return {
    world: section(() => ({
      id: game.world?.id ?? null, title: clip(game.world?.title), system: game.system?.id ?? null,
      systemVersion: game.system?.version ?? null, coreVersion: game.version ?? game.release?.version ?? null,
    })),
    user: section(() => userFields({ ...plainUser(game.user), character: ref(game.user?.character) })),
    scene: section(() => ({
      viewed: ref(g.canvas?.scene ?? game.scenes?.viewed), active: ref(game.scenes?.active ?? null),
      canvasReady: g.canvas?.ready === true,
    })),
    tokens: section(() => ({
      controlled: [...(g.canvas?.tokens?.controlled ?? [])].slice(0, LIMITS.tokensMax).map(tokenRow),
      targeted: [...(game.user?.targets ?? [])].slice(0, LIMITS.tokensMax).map(tokenRow),
    })),
    combat: section(() => {
      const c = game.combat;
      if (!c) return null;
      return {
        id: c.id ?? null, round: c.round ?? null, turn: c.turn ?? null, combatant: clip(c.combatant?.name),
        started: !!c.started, sceneId: c.scene?.id ?? c.scene ?? null,
      };
    }),
    windows: section(() => {
      const v2 = [...(g.foundry?.applications?.instances?.values?.() ?? [])];
      const v1 = Object.values(g.ui?.windows ?? {});
      return [...v2, ...v1].slice(0, LIMITS.windowsMax).map(windowRow);
    }),
    modules: section(() => {
      const out = [];
      for (const m of game.modules?.values?.() ?? []) if (m?.active) out.push({ id: m.id, version: m.version ?? null });
      return out;
    }),
    client: section(() => ({
      ua: clip(g.navigator?.userAgent ?? "", LIMITS.ua),
      viewport: g.innerWidth ? `${g.innerWidth}x${g.innerHeight}` : null,
      lang: game.i18n?.lang ?? null,
      tz: section(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    })),
    chat: section(() => {
      const me = game.user?.id;
      const mine = (game.messages?.contents ?? [...(game.messages?.values?.() ?? [])])
        .filter(m => (m.author?.id ?? m.author ?? m.user?.id ?? m.user) === me);
      return mine.slice(-LIMITS.chatMax).map(m => chatEntry(m));
    }),
  };
}

function plainUser(u) {
  return { id: u?.id, name: u?.name, role: u?.role, isGM: u?.isGM };
}

/** The one-line counts the dialog's "What gets attached" list shows. */
export function attachSummary(snap, { actions = 0, errors = 0 } = {}) {
  return {
    user: snap?.user?.name ?? null,
    scene: snap?.scene?.viewed?.name ?? null,
    actions, errors,
    chat: Array.isArray(snap?.chat) ? snap.chat.length : 0,
    windows: Array.isArray(snap?.windows) ? snap.windows.length : 0,
    modules: Array.isArray(snap?.modules) ? snap.modules.length : 0,
  };
}
