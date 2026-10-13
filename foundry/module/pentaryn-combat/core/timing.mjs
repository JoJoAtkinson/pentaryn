/**
 * Pentaryn Combat core — every timer delay the module uses, named, with why (combat-riders-37).
 * PURE. The values are the ones the code used inline before; replacing a wait with an event is a
 * declared change for the live-test workflow, not done here.
 */

export const DELAYS = Object.freeze({
  /** combat.mjs: the active GM's weapon-set seed, one tick after the API is published. */
  seedAfterReady: 0,
  /** offhand.mjs: a new character's items arrive with it; give the sheet's creation flow a beat. */
  seedAfterCreate: 500,
  /** strip.mjs: focus the roll window again after a pick's pointerup has landed on the canvas. */
  focusRetry: 150,
  /** strip.mjs: the weapon picker arms its outside-click listener next tick (the opening click is not "outside"). */
  pickerArm: 0,
  /** sequence.mjs: how often a swing waits on its damage roll (pentaryn-aoe's auto-damage). */
  damagePoll: 150,
  /** sequence.mjs: tidy the stopped run's unrolled usage cards — after the close hook's own look (tidyLook). */
  tidyAfterSequence: 400,
  /** turnflow/dialogs.mjs: a cancelled attack's card is looked at again before it is deleted. */
  tidyLook: 250,
  /** turnflow/dialogs.mjs: Enter-uses presses Use itself when the usage window did not re-render. */
  useFallback: 400,
  /** hud/bars.mjs: a new follow-up button pulses until the pointer reaches the bar, at most this long. */
  pulse: 12000,
  /** hud/bars.mjs: bar re-renders are batched (a turn-flag write lands as several updates). */
  rerender: 60,
  /** hud/bars.mjs: after a deleted combat, and after Argon's own new-round relight, repaint next tick. */
  afterArgon: 0,
  /** turn-riders.mjs: chat cards re-render once per burst of turn-flag writes / turn changes. */
  cardRerender: 50,
  /** turnflow/boundaries.mjs: combat start — look again once Argon's own start bind is done. */
  hudFollowRecheck: Object.freeze([300, 1200]),
  /** turnflow/boundaries.mjs: the orphan-flag sweep after the last of a burst of combat deletes (debounced). */
  orphanSweep: 1500,
  /** turnflow/boundaries.mjs: bind the HUD to the one token left selected (debounced). */
  followLeft: 150,
  /** turnflow/helper-token.mjs: reselect your token once core has released the deleted helper. */
  helperReselect: 0,
  /** turnflow/movement.mjs: redraw Argon's movement readout after dnd5e prepared the actor again. */
  movementRedraw: 50,
});
