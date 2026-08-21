/**
 * The description card — key 9, GM only.
 *
 * Deliberately NOT the tie cards. 7 and 8 answer "what are these two people to each
 * other"; this answers "who is this person at all", which is the question a GM asks
 * about a face in a crowd that has no tie to anybody yet. A room full of lodgers is
 * exactly where the ties layer has nothing to say and this does.
 *
 * It is also the one thing here with no player half. 7 and 8 are readable by a player
 * for their OWN character because their ties are their character's own memory; an
 * actor's biography is prep, written by the GM, and `details.biography.value` is the
 * private field — handing it to the table would leak the whole scene. So the keybinding
 * is `restricted` and every entry point re-checks `isGM` rather than trusting that.
 *
 * This started life as the `Quick View` world macro. It is a module keybinding now
 * because a macro's key lives in the hotbar, and an empty hotbar slot is one stray
 * drag away — the binding did not survive a reboot. Registered keys do.
 *
 * ONE window, and it toggles:
 *   same person again -> close   |   different person -> swap   |   nothing hovered -> dismiss
 *
 * Hover beats selection, always. You ask about the face under the cursor, and requiring
 * a click first would mean deselecting whoever you were actually running.
 *
 * Client-side only, like the rest of the module. Nothing crosses the socket.
 */

import { MODULE } from "./ties-api.mjs";

const t = (k, d) => game.i18n.localize(`PENTARYN_TIES.${k}`) || d;

/** The single live window, and who it is about. */
let current = { app: null, actorId: null };

/** Foundry moved TextEditor under applications.ux in v13; keep the old path as a fallback. */
const editor = () => foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

/**
 * Hover wins, selection is the fallback.
 * `canvas.tokens.hover` is the documented handle, but it has moved before — scanning the
 * placeables for the flag is cheap and keeps this working if it moves again.
 */
function subject() {
  const hovered = canvas?.tokens?.hover ?? canvas?.tokens?.placeables?.find(p => p.hover) ?? null;
  return hovered ?? canvas?.tokens?.controlled?.[0] ?? null;
}

/** Close whatever is open and forget it. Safe to call when nothing is. */
export async function close() {
  const app = current.app;
  current = { app: null, actorId: null };
  if (app?.rendered) await app.close();
}

/**
 * Toggle the description card for whoever is under the cursor.
 *
 * Returns the actor shown, or null if it closed / had nothing to show — the return value
 * is for the console, the notifications are for the table.
 */
export async function toggle() {
  if (!game.user?.isGM) return null;

  const token = subject();
  const actor = token?.actor ?? null;

  // An open window always closes first, so a second press is always "put that away".
  if (current.app?.rendered) {
    const wasAbout = current.actorId;
    await close();
    // Same face again, or a press over empty space, means the close WAS the action.
    if (!actor || wasAbout === actor.id) return null;
  }

  if (!actor) {
    ui.notifications.warn(t("notify.noTarget", "Hover a token, or select one."));
    return null;
  }

  const bio = actor.system?.details?.biography ?? {};
  // `value` is the GM's own field; `public` is what a sheet would show a player. Prefer
  // the private one — this is a GM-only card and the prep is the point — but fall back
  // rather than showing an empty box when only the public half was ever filled in.
  const raw = bio.value || bio.public || "";
  const body = raw
    ? await editor().enrichHTML(raw, { async: true, relativeTo: actor, secrets: true })
    : `<p><em>${t("describe.empty", "No description written.")}</em></p>`;

  const art = actor.img || actor.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";
  const content = `<div class="pt-describe">
    <img class="pt-describe-art" src="${art}" alt="" />
    <div class="pt-describe-body">${body}</div>
  </div>`;

  const app = new foundry.applications.api.DialogV2({
    window: { title: actor.name, icon: "fa-solid fa-address-card", resizable: true },
    position: { width: 480 },
    content,
    buttons: [
      {
        action: "sheet",
        label: t("describe.openSheet", "Open Full Sheet"),
        icon: "fa-solid fa-user",
        callback: () => actor.sheet?.render(true)
      },
      // NOT `default: true`. DialogV2 focuses the default button on render, and Foundry's
      // KeyboardManager treats a focused <button> as "something has focus" and suppresses
      // every keybinding — so the default button would silently eat the second press of 9,
      // which is the whole open-glance-close gesture this key exists for.
      { action: "close", label: t("describe.close", "Close") }
    ],
    // Closing by any route — the ✕, Escape, the button — must clear the handle, or the
    // next press thinks a dead window is still open and swallows itself as a "toggle off".
    close: () => { if (current.actorId === actor.id) current = { app: null, actorId: null }; },
    rejectClose: false
  });

  current = { app, actorId: actor.id };
  await app.render(true);

  /**
   * Two belts, one pair of braces, both aimed at the same thing: pressing 9 again must
   * shut this, because glancing at a face is a two-press gesture and anything that eats
   * the second press turns it into a mouse hunt for the ✕.
   *
   * 1. Drop focus. Foundry's KeyboardManager refuses to dispatch keybindings while
   *    `game.keyboard.hasFocus` — and a focused <button> counts. Rendering a dialog is
   *    enough to put focus on one, so hand it back to the page.
   * 2. Listen locally anyway. If focus lands back inside the window — the user tabs, or
   *    clicks the art — the global key is suppressed again, so the window answers for
   *    itself. Read the binding rather than hard-coding "9", so a rebind still works.
   */
  const root = app.element;
  root?.querySelector(":focus")?.blur();
  if (document.activeElement && root?.contains(document.activeElement)) document.activeElement.blur();

  const keys = (game.keybindings.get(MODULE, "showDescription") ?? []).map(k => k.key);
  root?.addEventListener("keydown", ev => {
    if (!keys.includes(ev.code)) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName ?? "")) return;  // never steal typing
    ev.preventDefault();
    ev.stopPropagation();
    close();
  });

  return actor;
}

/** Registered from the entry point so all the keys are declared in one place. */
export function registerKeybinding() {
  game.keybindings.register(MODULE, "showDescription", {
    name: "PENTARYN_TIES.keybind.describe",
    hint: "PENTARYN_TIES.keybind.describeHint",
    editable: [{ key: "Digit9" }],
    restricted: true,          // GM only — this reads the private biography field
    onDown: () => {
      toggle();
      return true;
    }
  });
}
