/**
 * Registration: the conduit's socket handler, and the GM's hand-thrown study (`studyAs`).
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { MODULE } from "../ties-api.mjs";
import { applyStudy } from "./apply.mjs";
import { applyInspect } from "./cascade.mjs";
import { BUBBLE, CHANNEL, INSPECT, log, STUDY } from "./shared.mjs";
import { isActiveGM } from "../lib/election.mjs";
import { showBubble } from "./tempo.mjs";

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerStudy() {
  game.socket.on(CHANNEL, async (payload, senderId) => {
    /*
     * The bubble is the one action every client acts on, not just the arbiter GM — it is a thing
     * the table sees, so gating it on `isActiveGM` would show it to nobody but one browser.
     * It carries no secret: tempo, never outcome.
     */
    if (payload?.action === BUBBLE) return showBubble(payload);

    if (payload?.action !== STUDY && payload?.action !== INSPECT) return;
    if (!isActiveGM()) return;
    try {
      if (payload.action === INSPECT) await applyInspect(payload, senderId);
      else await applyStudy(payload, senderId);
    } catch (err) {
      log.error(`conduit failed`, err);
    }
  });
}

/**
 * For a GM who wants to throw a character's check by hand, no socket and no dialog in the way.
 *
 * Same handler, same validation, same writes as a player's click — it only skips the gesture.
 * Pass `loreId` to throw one of the individual's rows instead of the kind ladder.
 */
export async function studyAs(
  character,
  subject,
  { mode = "normal", situational = 0, loreId = null, attrId = null } = {}
) {
  if (!game.user?.isGM) return false;
  return applyStudy(
    {
      action: STUDY,
      characterId: character?.id,
      subjectId: subject?.id,
      ns: attrId ? "attr" : loreId ? "lore" : "kind",
      factId: loreId,
      attrId,
      mode,
      situational
    },
    game.user.id
  );
}
