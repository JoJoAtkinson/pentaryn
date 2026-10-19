/**
 * Pentaryn Feature Riders — PURE: two guards on dnd5e's activity usage dialog (feedback tNdOEx).
 *
 * A quick double click on a spell's Use opened TWO usage dialogs. Each read the actor's
 * concentration when it opened: "casting this ends your concentration on Fly". Casting from the
 * first ended Fly; casting later from the second still named Fly's (deleted) effect, and dnd5e
 * refused with "The effect that is concentrated on and to be replaced does not exist." (Marwen's
 * Enlarge/Reduce, twice). cast-flow.mjs now keeps one usage dialog per activity, and repairs a
 * replacement that went stale while a dialog stood open.
 */

/**
 * What `usageConfig.concentration.end` should be, given the concentration effects the actor has
 * NOW. Returns `undefined` to leave it, `null` to drop it (no replacement needed), or `false` to
 * refuse the cast (the caller says why and vetoes it).
 *  - not stale (no end, or the named effect still exists) → undefined
 *  - stale and the actor is below its limit → null (nothing has to end; dnd5e then just begins)
 *  - stale at (or over) the limit → false. The effect held now was never the player's pick: the
 *    dialog opened naming Fly, Fly dropped, Hold Person was cast elsewhere. Ending Hold Person in
 *    Fly's place would end a concentration the player never chose, so the player reopens the
 *    dialog, which names what is held now (riders review 2026-10-19, finding 1).
 * @param {string|null|undefined} end  the effect id the dialog chose to end
 * @param {string[]} ids               ids of the actor's concentration effects now
 * @param {number} limit               the actor's concentration limit
 */
export function staleConcentrationEnd(end, ids, limit = 1) {
  if (!end) return undefined;
  const now = [...(ids ?? [])];
  if (now.includes(end)) return undefined;
  const max = Number.isFinite(Number(limit)) ? Number(limit) : 1;
  if (now.length < max) return null;
  return false;
}

/**
 * How many other packages' listeners run before the last of `vetoIds` (riders review 2026-10-19,
 * finding 2). A `false` from a `Hooks.call` listener stops only the listeners after it, so a veto
 * protects nothing from a listener ahead of it. `order` is the hook's listener ids in call order
 * (`Hooks.events[name]`), `own` this module's ids for that hook. Returns -1 when a veto is not
 * registered at all.
 * @param {number[]} order
 * @param {Iterable<number>} own
 * @param {number[]} vetoIds
 */
export function listenersAheadOf(order, own, vetoIds) {
  const ids = [...(order ?? [])];
  const mine = new Set(own ?? []);
  const at = (vetoIds ?? []).map(id => ids.indexOf(id));
  if (!at.length || at.some(i => i < 0)) return -1;
  const last = Math.max(...at);
  return ids.slice(0, last).filter(id => !mine.has(id)).length;
}

/**
 * Among open applications, the rendered usage dialog already showing `uuid` (an activity uuid), or
 * null. `isUsageDialog(app)` says whether an app is one (an instanceof test, in the caller).
 */
export function openUsageDialogFor(apps, uuid, isUsageDialog) {
  if (!uuid) return null;
  for (const app of apps ?? []) {
    if (!app?.rendered || !isUsageDialog(app)) continue;
    let other = null;
    try { other = app.activity?.uuid ?? null; } catch { other = null; }
    if (other === uuid) return app;
  }
  return null;
}

/**
 * Among open applications, the activity-choice dialog that should stay for `app`'s item, or null
 * when `app` is the one to keep. dnd5e opens a new ActivityChoiceDialog ("which activity?") on every
 * click of an item's Use, so a double-click opened two and picking in both used the item twice
 * (DsekWh, Produce Flame). The earliest registered dialog for the same item wins: `apps` is
 * `foundry.applications.instances` in insertion order, and core registers an application there
 * before its first render finishes, so a first dialog that is still rendering counts (no
 * `rendered` gate: a very fast double-click would slip past it). Closing or closed dialogs
 * (`state` < 0) do not count, so a new Use straight after a pick is never swallowed.
 * `isChoiceDialog(app)` says whether an app is one (an instanceof test, in the caller).
 */
export function firstChoiceDialogFor(apps, app, isChoiceDialog) {
  const uuidOf = a => { try { return a?.item?.uuid ?? null; } catch { return null; } };
  const uuid = uuidOf(app);
  if (!uuid) return null;
  for (const other of apps ?? []) {
    if (other === app) return null;
    if (!other || !isChoiceDialog(other)) continue;
    if (typeof other.state === "number" && other.state < 0) continue;
    if (uuidOf(other) === uuid) return other;
  }
  return null;
}
