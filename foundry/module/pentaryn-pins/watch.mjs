/**
 * Pentaryn Pins — FEATURE: GM toasts when a pinned character's token count leaves one (rebuild plan
 * context/plans/pin-2026-10-rebuild.md §6, the design review's "Risks").
 *
 *   0 tokens   Stranded: nothing moves the player's view now, but with no single token the pin
 *              has no target, so a scene activation moves them as stock (follow.mjs activateDecision:
 *              "no target" → call; review minor (b)); placing the character again brings them to it
 *              (below), or pentaryn-resume does at their next login.
 *   2+ tokens  Paused: the view follows only the copy on the scene the player is viewing.
 *
 * Placed again (0 → 1, review RF1): a createToken that leaves the pin with exactly one token — the
 * one just created — means it had none. The ACTIVE GM (the one write-capable client: core's
 * activeGM, normally the bot) pulls that pin's online player to it at once with core's own pull
 * (pullToPin: `{ level, controlledTokens }`). A carry or a core hop creates before it deletes, so
 * its create counts two and never pulls (the mover pulls).
 *
 * Runs on every GM client with the switch on and writes nothing, so no election (the bot's toast
 * is simply unseen). A create or delete of a token whose root is pinned (re)starts one per-root
 * check NET_GRACE_MS after the LAST such event — a debounce, so a carry or a core hop (create, then
 * delete) counts one token and never toasts, even when its delete lands late. The same count never
 * toasts twice in a row (`tokenNotice`).
 */

import { NET_GRACE_MS, tokenNotice } from "./pins-core.mjs";
import { pinnedUsers, pullToPin, rootOfToken, tokensOfRoot } from "./world-adapter.mjs";

/** Literal keys (the i18n gate proves each one). */
const TEXT = Object.freeze({
  STRANDED: "PENTARYN_PINS.Notify.Stranded",
  PAUSED: "PENTARYN_PINS.Notify.Paused",
});

let C = null;
/** root actor id → the pending check's timer. */
const timers = new Map();
/** root actor id → the token count last toasted. */
const last = new Map();

const on = () => !!game.user?.isGM && C?.setting("pinning") === true;
/** The (non-GM) pin on `root`, or null. */
const pinOn = root => pinnedUsers().find(p => p.root === root && !p.user.isGM) ?? null;

function check(root) {
  if (!on()) return;
  const pin = pinOn(root);
  if (!pin) return;
  const tokens = tokensOfRoot(root);
  const { notice, last: next } = tokenNotice({ n: tokens.length, last: last.get(root) ?? null });
  if (next === null) last.delete(root);
  else last.set(root, next);
  if (!notice) return;
  C.log.notify("warn", _loc(TEXT[notice], {
    actor: game.actors.get(root)?.name ?? root,
    user: pin.user.name,
    n: tokens.length,
    scenes: tokens.map(t => t.sceneName ?? t.scene).join(", "),
  }));
}

/** The active GM pulls the online player of a pin whose token count just went 0 → 1 (`doc` created). */
function placedAgain(pin) {
  if (!game.users?.activeGM?.isSelf || !pin.user.active) return;
  if (tokensOfRoot(pin.root).length !== 1) return;
  pullToPin(pin.user, C.log);
}

function onToken(doc, created = false) {
  if (!on()) return;
  const root = rootOfToken(doc);
  const pin = root ? pinOn(root) : null;
  if (!pin) return;
  if (created) {
    try {
      placedAgain(pin);
    } catch (err) {
      C?.log.error("placed-again pull failed", err);
    }
  }
  clearTimeout(timers.get(root));
  timers.set(root, setTimeout(() => {
    timers.delete(root);
    try {
      check(root);
    } catch (err) {
      C?.log.error("token watch failed", err);
    }
  }, NET_GRACE_MS));
}

export function install(reg, ctx) {
  C = ctx;
  reg.on("createToken", doc => onToken(doc, true), { label: "createToken: watch" });
  reg.on("deleteToken", doc => onToken(doc), { label: "deleteToken: watch" });
}

export function uninstall() {
  for (const h of timers.values()) clearTimeout(h);
  timers.clear();
  last.clear();
}
