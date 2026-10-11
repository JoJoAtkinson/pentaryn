/**
 * Verbatim oracles (guide step 1.3, items-journal-34): today's journal.mjs decisions as pure functions of
 * booleans, so step 2's core functions can be proven equal over every input. Bodies from journal.mjs
 * (line numbers in comments); the permission calls become the booleans they return.
 */

const MOD = "pentaryn-journal";
const flagsOf = doc => doc?.flags?.[MOD] ?? {};

/** :46–48 (isMine takes the user id the glue reads from game.user) */
export const isPersonal = entry => entry?.documentName === "JournalEntry" && flagsOf(entry).kind === "personal";
export const isMine = (entry, userId) => isPersonal(entry) && flagsOf(entry).userId === userId;

/** :165–169 shouldShowBar */
export function barVisible({ isJournalEntry, isPersonal, inPack, isGM, gmButton, observer, owner }) {
  if (!isJournalEntry || isPersonal || inPack) return false;
  if (isGM) return !!gmButton;
  return observer && !owner;
}

/** :197–202 shouldShowItemBar */
export function itemBarVisible({ hasSource, canInspectItems, isGM, gmButton, observer, owner }) {
  if (!hasSource) return false;
  if (canInspectItems === false) return false;
  if (isGM) return !!gmButton;
  return observer && !owner;
}

/** :280 the provenance place: the scene's navigation name, else the entry's folder, else null */
export const placeFrom = ({ navName, folderName } = {}) => navName?.trim() || folderName || null;

/** :519–521 applySinglePage's condition */
export const singlePage = ({ isGM, setting, isPersonal, isEyeReadable, visiblePages }) =>
  !isGM && setting && !isPersonal && isEyeReadable && visiblePages === 1;
