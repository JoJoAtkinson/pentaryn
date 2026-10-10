/**
 * Hook registration that remembers its ids, so a hot-patched copy can be removed cleanly
 * (game.pentaryn.aoe.uninstall()) and a second install never stacks a duplicate.
 */

const registered = [];

export function on(name, fn) {
  const id = Hooks.on(name, fn);
  registered.push([name, id]);
  return id;
}

export function hookIds() {
  return registered.map(([name, id]) => ({ name, id }));
}

export function offAll() {
  for (const [name, id] of registered.splice(0)) Hooks.off(name, id);
}

/** Log and swallow: these run inside core/system hooks, where a throw breaks someone else's render. */
export function guard(label, fn) {
  return (...args) => {
    try {
      const out = fn(...args);
      if (out instanceof Promise) out.catch(err => console.error(`pentaryn-aoe | ${label}`, err));
      return out instanceof Promise ? undefined : out;
    } catch (err) {
      console.error(`pentaryn-aoe | ${label}`, err);
    }
  };
}

/* -------------------------------------------- */
/*  One client per job, even on one account      */
/* -------------------------------------------- */

const CLAIM_SETTLE_MS = 750;

/**
 * Elect exactly one client to act on a broadcast document event, when several clients would
 * each pass the "is this me?" test. Two sessions on the GM account (the MCP bridge tab plus a
 * GM browser tab) are both `game.users.activeGM.isSelf`, so each used to roll every monster's
 * save and post its own request card for one Fireball.
 *
 * Last writer wins: each candidate stamps its socket id on the message and, once the writes
 * have settled, only the client whose id is still there proceeds. Every client sees the server's
 * one order of writes, so they all agree on the winner. A client arriving after a claim exists
 * stands down at once. No socket id (should not happen) → act, as before.
 * @param {ChatMessage} message
 * @param {string} key   one claim per job on the message ("resolve", "selfApply")
 * @returns {Promise<boolean>} true on the one client that should do the work
 */
export async function claimMessage(message, key) {
  const me = game.socket?.id;
  if (!me || !message?.id) return true;
  const path = `flags.pentaryn-aoe.claims.${key}`;
  const held = foundry.utils.getProperty(message, path);
  if (held) return held === me;
  await message.update({ [path]: me });
  await new Promise(resolve => setTimeout(resolve, CLAIM_SETTLE_MS));
  return foundry.utils.getProperty(game.messages.get(message.id) ?? {}, path) === me;
}
