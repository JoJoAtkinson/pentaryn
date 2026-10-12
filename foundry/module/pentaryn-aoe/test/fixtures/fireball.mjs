/**
 * A Fireball scene for Part B and the tray: a wizard (Marrith, a PC, CHA +3) casts at an area
 * holding two goblins, a dead and a hidden goblin, a player character (Caven), the caster herself,
 * an area handle and an item pile. Each creature has its own actor (as an unlinked token's synthetic
 * actor would) with a queue of save totals. Built after boot({ entry: true }).
 */
import { MODULE, GM_ID, PLAYER_ID } from "./world.mjs";

export const IDS = {
  scene: "FireScene0000001", region: "regionFire000001", usage: "usageCard0000001",
  g1: "tokGoblin0000001", g2: "tokGoblin0000002", cv: "tokCaven00000001", mr: "tokMarrith000001",
  dead: "tokGoblinDead001", hid: "tokGoblinHid0001", handle: "regionFire000001", pile: "tokPile000000001",
  wizard: "actMarrith000001", caven: "actCaven00000001",
};

export function fireball(W, F, { saves = {}, careful = null } = {}) {
  const s = W.scene({ id: IDS.scene, name: "Fire" });
  F.canvas.scene = s;
  const wizard = W.actor({ id: IDS.wizard, name: "Marrith", type: "character", hasPlayerOwner: true, cha: 3, hp: { value: 25, max: 25 }, ownership: { default: 0, [PLAYER_ID]: 3 }, flags: careful ? { [MODULE]: { careful } } : {} });
  const caven = W.actor({ id: IDS.caven, name: "Caven", type: "character", hasPlayerOwner: true, hp: { value: 30, max: 30 }, ownership: { default: 0, [PLAYER_ID]: 3 }, saves: saves.cv ?? [] });
  const gob = (id, name, over = {}) => W.actor({ id, name, type: "npc", hp: { value: 7, max: 7 }, ...over });
  const g1 = gob("actGoblin0000001", "Goblin 1", { saves: saves.g1 ?? [18] });
  const g2 = gob("actGoblin0000002", "Goblin 2", { saves: saves.g2 ?? [4] });
  const dead = gob("actGoblinDead001", "Dead goblin", { hp: { value: 0, max: 7 } });
  const hid = gob("actGoblinHid0001", "Hidden goblin", { saves: saves.hid ?? [12] });
  const pileActor = W.actor({ id: "actPile000000001", name: "Chest", type: "npc", hp: { value: 5, max: 5 }, flags: { "item-piles": { data: { enabled: true } } } });
  const handleActor = game.actors.find(a => a.flags?.[MODULE]?.handleActor);
  const tok = (id, name, actor, over = {}) => W.token(s, { id, name, actorId: over.actorId ?? actor.id, actor, texture: { src: `icons/${id}.webp` }, ...over });
  tok(IDS.g1, "Goblin 1", g1, { actorId: "actGoblinBase001", disposition: -1 });
  tok(IDS.g2, "Goblin 2", g2, { actorId: "actGoblinBase001", disposition: -1 });
  tok(IDS.cv, "Caven", caven, { disposition: 1 });
  tok(IDS.mr, "Marrith", wizard, { disposition: 1 });
  tok(IDS.dead, "Dead goblin", dead, { actorId: "actGoblinBase001" });
  tok(IDS.hid, "Hidden goblin", hid, { actorId: "actGoblinBase001", hidden: true });
  tok(IDS.handle, "Fireball (Player)", handleActor, { flags: { [MODULE]: { handle: true, region: IDS.region } } });
  tok(IDS.pile, "Chest", pileActor);
  // an unlinked token's synthetic actor knows its token (actor.token); linked PCs do not
  for (const [a, id] of [[g1, IDS.g1], [g2, IDS.g2], [dead, IDS.dead], [hid, IDS.hid]]) {
    Object.defineProperty(a, "token", { value: s.tokens.get(id), enumerable: false, configurable: true });
  }
  const inside = [IDS.g1, IDS.g2, IDS.cv, IDS.mr, IDS.dead, IDS.hid, IDS.handle, IDS.pile];
  const item = W.item({ id: "itemFireball0001", name: "Fireball", system: { identifier: "fireball", duration: { units: "inst" } } }, wizard);
  const activity = W.saveActivity({ item, actor: wizard, ability: "dex", dc: 15, onSave: "half" });
  W.register(activity.uuid, activity);
  const region = W.region(s, { id: IDS.region, name: "Fireball", inside, flags: { dnd5e: { activity: activity.uuid, item: item.uuid } }, ownership: { default: 3 } });
  const usage = W.message({ id: IDS.usage, type: "usage", author: PLAYER_ID, system: { activity: { uuid: activity.uuid }, item: { uuid: item.uuid } }, speaker: { scene: s.id, actor: wizard.id } });
  return { s, wizard, caven, g1, g2, dead, hid, item, activity, region, usage, inside };
}

/** The damage message a Damage click would post (dnd5e 6 typed message), with its hook optional. */
export function damage(W, ctx, { id = "dmgFireball00001", total = 28, hook = false, timestamp, targets = [], usage = IDS.usage, activity = ctx.activity, onSave } = {}) {
  return W.message({
    id, type: "damage", author: PLAYER_ID, ...(timestamp !== undefined ? { timestamp } : {}),
    system: { activity: { uuid: activity.uuid }, origin: usage, targets, ...(onSave ? { onSave } : {}) },
    rolls: [{ total, options: { type: "fire", properties: ["mgc"] } }],
    speaker: { scene: ctx.s.id, actor: ctx.wizard.id },
    activity,
  }, { hook });
}

export { GM_ID, PLAYER_ID };
