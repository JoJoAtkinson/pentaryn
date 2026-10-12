/**
 * Pentaryn Feedback — ADAPTER: the live game → plain context JSON for a report.
 *
 * The only file that reads canvas / ui / game state for a report (the recorder reads only what its
 * hooks hand it). `snapshot({ g })` never throws: every section runs in its own try and reports
 * `{ error }` on failure, and every row of a list section (windows, modules, chat) runs in its own
 * try too (a bad row becomes a row with an `error` field). buildReport moves a section's `{ error }`
 * to `sectionErrors`, so one broken section never blocks a report. Reads only — nothing here
 * awaits or writes.
 *
 * Never attached: other users' chat, whisper text, chat content, setting values, form input values,
 * journal text.
 */

import {
  DIALOG_ID, LIMITS, QUIET_APPS, QUIET_APP_PATTERN, chatEntry, clip, messageOf, redact, userFieldsOf,
} from "./feedback-core.mjs";

const section = fn => {
  try {
    return fn();
  } catch (err) {
    return { error: clip(messageOf(err), LIMITS.message) };
  }
};

/** `fn(x)` for one row; a throw becomes `{ ...fallback, error }` so one bad row never loses the section. */
const row = (fn, fallback = {}) => x => {
  try {
    return fn(x);
  } catch (err) {
    return { ...fallback, error: clip(messageOf(err), LIMITS.message) };
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
 * The windows the player opened, oldest first: every rendered ApplicationV2 (core's instances map,
 * which also holds core's UI panels, inserted first) and every V1 window, minus frameless
 * apps, the `ui.*` singletons (sidebar, chat, combat tracker, players, hotbar, controls, navigation,
 * notifications, pause), QUIET_APPS, sidebar directories and this module's own dialog. An app whose
 * check throws is kept, so windowRow's per-row guard records the error.
 */
export function openWindows(g = globalThis) {
  const singletons = new Set(Object.values(g.ui ?? {}).filter(v => v && typeof v === "object"));
  const v2 = [...(g.foundry?.applications?.instances?.values?.() ?? [])];
  const v1 = Object.values(g.ui?.windows ?? {});
  return [...new Set([...v2, ...v1])].filter(app => {
    try {
      if (!app || singletons.has(app)) return false;
      if (app.hasFrame === false || app.options?.window?.frame === false) return false;
      const cls = app.constructor?.name ?? "";
      if (QUIET_APPS.has(cls) || QUIET_APP_PATTERN.test(cls)) return false;
      return (app.id ?? null) !== DIALOG_ID;
    } catch (err) {
      return true;
    }
  });
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
    user: section(() => userFieldsOf(game.user)),
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
    windows: section(() => openWindows(g).slice(-LIMITS.windowsMax).map(row(windowRow, { id: "", cls: "?", title: "" }))),
    modules: section(() => {
      const out = [];
      for (const m of game.modules?.values?.() ?? []) {
        const r = row(x => (x?.active ? { id: clip(x.id), version: x.version ?? null } : null), { id: "?" })(m);
        if (r) out.push(r);
      }
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
        .filter(m => {
          try {
            return (m.author?.id ?? m.author ?? m.user?.id ?? m.user) === me;
          } catch (err) {
            return false;                 // an unreadable message is not attached, never fatal
          }
        });
      return mine.slice(-LIMITS.chatMax).map(row(m => chatEntry(m), { id: "" }));
    }),
  };
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
