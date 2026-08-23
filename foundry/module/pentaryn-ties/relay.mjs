/**
 * The reverse-side relay — how a player's tie reaches the other person's sheet.
 *
 * ## Why this exists at all
 *
 * A player owns their own character and nothing else. `Actor#update` on an NPC is refused
 * by the **server**, not by this module, so "if they have no note it records it" could not
 * run for the one case it matters most in: a player recording what they are to an NPC. The
 * module used to tell them so in a notification. That was noise about a limitation they
 * cannot act on.
 *
 * So the player's client asks a GM's client to do it. The player still writes their OWN
 * side directly, exactly as before; only the reverse hop is delegated.
 *
 * ## The trust boundary
 *
 * A socket message is an untrusted request from another client, not an instruction. The GM
 * side re-derives everything and trusts the payload for **nothing but the pair of ids**,
 * which it validates:
 *
 *   - **who sent it comes from the server**, as the socket handler's second argument, never
 *     from the message body — the body cannot be trusted to say who wrote it
 *   - the sender must **own the source actor**, checked against the server's permission
 *     record on the GM client
 *   - a non-GM sender must also have at least LIMITED on the target, the same reach rule
 *     the dialog's pickers enforce
 *   - the sender's own `playerAccess` right is re-checked here, so the GM's kill-switch
 *     really does turn the whole feature off rather than only its buttons
 *   - source and target are resolved from ids on the GM client; a payload naming an actor
 *     that does not exist, or a self-tie, is dropped
 *   - the **forward text is re-read from the source actor**, never taken from the payload,
 *     so a client cannot ask a GM to write prose it did not actually save on itself
 *   - the reverse side is re-read here, and **only ever filled where it is blank**
 *   - the write touches exactly one row — the reverse of this pair — and only its word and
 *     notes. There is no path from here to any other document or field
 *
 * ## Why this only ever seeds, and never follows
 *
 * The dialog's link-by-identity rule lets a *linked* reverse side follow later edits. That
 * rule needs to know what the forward side said BEFORE the save, and only the sender knows
 * that — so an earlier cut of this file sent it and trusted it. That was a hole: a client
 * that forged the previous value to match the target's current text could overwrite a tie
 * note on **any** actor in the world, sight unseen.
 *
 * So the relay does the smaller, safer half, which is also exactly what was asked for:
 * *"if they have no note it records it, if they do have a note it doesn't."* Blank is filled,
 * written text is never touched, and nothing has to be taken on trust to decide which. A
 * player's later edits stop propagating once the other side says anything at all — and the
 * GM, who can see both sides in the dialog, can still relink them by hand.
 *
 * Only ONE client applies a given message: `game.users.activeGM`, Foundry's own designation
 * of the primary GM. Without an active GM the request is dropped and the player's own side
 * stands alone — the next Save from anyone on that pair completes it.
 */

import { MODULE, read, write, clampStance, clampStrength, clampNotes, mayWrite, canReach } from "./ties-api.mjs";

const CHANNEL = `module.${MODULE}`;
const MIRROR = "mirror-reverse";

/** Is this client the one GM that should act on relayed writes? */
const isApplyingGM = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Only a field with nothing in it is ours to fill. */
const blank = v => !String(v ?? "").trim();

/**
 * Ask a GM to run the reverse write for a tie the sender has just saved on their own side.
 * No-ops (silently, by design) when the sender could have done it themselves, or when there
 * is no GM online to ask.
 */
export function requestMirror({ source, target }) {
  if (!source || !target || source.id === target.id) return false;
  if (target.isOwner) return false; // they can write it themselves; no need to ask
  if (!game.users?.activeGM) return false; // nobody home — their own side still saved
  // ids only: everything else is re-derived by the GM from documents it can see itself
  // no sender id: the server stamps the authenticated one on for us
  game.socket.emit(CHANNEL, { action: MIRROR, sourceId: source.id, targetId: target.id });
  return true;
}

/** GM side: validate hard, re-read everything, then apply the same rule the dialog uses. */
async function applyMirror(payload, senderId) {
  /*
   * ⚠ `senderId` is the SERVER's word for who sent this, not the client's.
   * `handleCustomSocket` broadcasts `(channel, payload, this.user.id)` from the socket's
   * authenticated session (verified in `dist/server/sockets.mjs`), so it arrives as the
   * handler's second argument. An earlier cut read the id out of the payload instead —
   * which a hostile client could set to any GM's id, passing every check below and turning
   * this into a way to force-seed the reverse of every deliberately one-way tie in the
   * world from the GM's own browser. Never take identity from the message body.
   */
  const user = game.users?.get(senderId);
  const source = game.actors?.get(payload?.sourceId);
  const target = game.actors?.get(payload?.targetId);
  if (!user || !source || !target || source.id === target.id) return;

  // the sender must actually own the side they claim to be writing from
  if (source.testUserPermission(user, "OWNER") !== true) {
    console.warn(`${MODULE} | relay refused: ${user.name} does not own ${source.name}`);
    return;
  }
  // and the GM's own kill-switch has to mean what its hint promises
  if (!mayWrite(user)) return;
  if (!target.isOwner) return; // even the GM cannot write what it does not own

  /*
   * A player may write any flag content they like onto their own actor, including a tie
   * pointing at someone they have never seen — so the forward row's existence proves nothing
   * about reach, and it has to be re-derived here.
   *
   * ⚠ This used to demand LIMITED and nothing else, which was stricter than the study conduit's
   * rule and made the relay nearly unusable: a player could inspect, file and study an NPC but
   * not record a tie it saw back, because players rarely hold LIMITED on NPCs. Demonstrated with
   * two live clients before it was changed. Both halves now share `canReach`.
   */
  if (!canReach(user, target)) {
    console.warn(`${MODULE} | relay refused: ${user.name} cannot reach ${target.name}`);
    return;
  }

  // the forward text comes off the actor, never off the wire
  const mine = read(source).find(x => x.id === target.id);
  if (!mine) return; // they did not actually save their own side; nothing to mirror

  const theirs = read(target);
  const rev = theirs.find(x => x.id === source.id);

  if (!rev) {
    theirs.push({
      id: source.id,
      name: source.name,
      word: mine.word,
      notes: mine.notes,
      stance: clampStance(mine.stance),
      strength: clampStrength(mine.strength)
    });
    await write(target, theirs);
    return;
  }

  // fill the gaps only; anything already written on their side is theirs
  const word = blank(rev.word) ? mine.word : rev.word;
  const notes = blank(rev.notes) ? clampNotes(mine.notes) : rev.notes;
  if (rev.word === word && rev.notes === notes) return;
  rev.word = word;
  rev.notes = notes;
  await write(target, theirs);
}

export function registerRelay() {
  game.socket.on(CHANNEL, async (payload, senderId) => {
    if (payload?.action !== MIRROR) return;
    if (!isApplyingGM()) return;
    try {
      await applyMirror(payload, senderId);
    } catch (err) {
      console.error(`${MODULE} | relayed mirror write failed`, err);
    }
  });
}
