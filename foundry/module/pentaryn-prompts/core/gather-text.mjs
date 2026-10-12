/**
 * pentaryn-prompts core — the gather text (Draft A) and built facts as text.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

import { FORMATION_FT, LINK_FT } from "./group.mjs";
import { fmtNum, footprintLabel } from "./size.mjs";
import { builtDescription, idCompare, isoDate, normalisePrompt, preview, relationText, sortRelations } from "./text.mjs";
import { parseParty, xpBudget } from "./xp.mjs";

/** The gather description length: the setting's registered default, gather's fallback and renderGather's default (D6). */
export const GATHER_CHARS = 400;

/* ── The gather text (Draft A, plan §5.3) ────────────────────────────────── */

export const LEGEND = [
  "p# = prompt marker to build and replace. t# = already built: context only, never replace, never move.",
  "ft = 5e grid distance between nearest occupied squares (adjacent = 5), scene diagonal rule.",
  "Bands: touching 5 | reach 10 | close 15-30 | near 35-60 | far 65-150 | distant 155+.",
  "LOS = clear sight line through walls with unlimited darkvision (light ignored).",
  "door = blocked only by a closed door (secret doors say \"secret door\"). wall = no sight line.",
  "Bearing = compass on the map, north is up. at = feet from the map's top-left corner.",
  `Encounter E# = linked by <=${LINK_FT} ft with LOS; a hostile built creature in it brings its pack (the hostile built creatures linked the same way).`,
  `Formation = linked by <=${FORMATION_FT} ft with LOS, inside an encounter.`,
  "elev = elevation in ft when not 0. Door lines: each door near a prompt, its state, and who can see it from which side.",
  "Images (if any) are set dressing: what the room looks like. Distances and LOS come from this text, never from the picture."
].join("\n");

/** Most `<sees>` entries before the rest are summarised. */
export const SEES_CAP = 25;

function attr(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/\n/g, " ");
}

function ftPair(p) {
  return `${fmtNum(p[0])},${fmtNum(p[1])} ft`;
}

/**
 * Render the gather text from a resolved view (ids assigned, relations computed).
 *
 * view = {
 *   call, counts: {scenes, prompts, built, encounters, alone},
 *   scenes: [{ id, name, nav, mapFt: [w, h], squares: [w, h], gridFt, regions: [..], levels, warn: [..], notes,
 *              encounters: [{ id, centreFt: [x, y], spanFt, members: [ids], formations: [[ids]],
 *                             prompts: [pids], built: [tids], shared: [tids], builtXp }],
 *              relations: [{ from: "E2", to: "E1", ft, bearing, los: bool, block?: "door" | "secret door" | "wall" }],
 *              aloneNotes: { p#: { of?, ft?, bearing?, los?, built?: { of, name, ft, bearing } } },
 *              doorLines: [string],
 *              alone: [pids], contextOnly: [tids] }],
 *   prompts: { p1: { id, size, gridFt, atFt: [x, y], elevation, regions: [..], text, sees: [rel], unseen: [rel] } },
 *   built:   { t1: { id, docId, actorId, kind, name, type, atFt, elevation, regions, hidden,
 *                   prov: {size, at, prompt, pid?, call?, note?} | null, description,
 *                   stats: {cr, ac, hp, hpMax} | null, classes: [{name, levels, subclass}] | null, species,
 *                   items: [..] | null, disposition, xp, light: string | null, ownTextUuid? } },
 *   todo: [pids], next: sceneId | null, unseenWithinFt,
 *   party: parseParty input ({level, size} | "4x5" | [levels]) | null, partySource: "setting" | "call" | null,
 *   partyUnreadable: boolean (the call gave a party that could not be read), cropsNote: string | null
 * }
 */
export function renderGather(view, { chars = GATHER_CHARS } = {}) {
  const L = [];
  const unseenFt = view.unseenWithinFt ?? 60;
  const c = view.counts;
  L.push(`<prompt_markers call="${attr(view.call)}" scenes="${c.scenes}" prompts="${c.prompts}" built="${c.built}" encounters="${c.encounters}" alone="${c.alone}">`);
  L.push("<legend>", LEGEND, "</legend>");
  L.push(partyLine(view));
  // PT2-5: one description per actor — the unlinked tokens of one actor share its biography, so
  // the first prints it and the rest point at it (`actorId` + text → that first built id and name)
  const described = new Map();

  for (const sc of view.scenes) {
    L.push("");
    const sq = `${sc.squares[0]}x${sc.squares[1]} squares of ${fmtNum(sc.gridFt)} ft`;
    L.push(`<scene id="${sc.id}" name="${attr(sc.name)}" nav="${attr(sc.nav)}" map="${fmtNum(sc.mapFt[0])}x${fmtNum(sc.mapFt[1])} ft (${sq})" regions="${attr(sc.regions.length ? sc.regions.join(", ") : "none")}" levels="${sc.levels}">`);
    L.push("<overview>");
    for (const w of sc.warn ?? []) L.push(`WARN ${w}`);
    const budget = view.party ? xpBudget(view.party) : null;
    if (budget) {
      L.push(`Budget per encounter (party ${budget.size} x level ${budget.level}, 2024 DMG): low ${budget.low} | moderate ${budget.moderate} | high ${budget.high} XP.`);
    }
    for (const e of sc.encounters) {
      let line = `${e.id}: ${e.prompts.join(" ")}`;
      if (e.built.length) line += ` + built ${e.built.map(t => (view.built?.[t]?.name ? `${t} "${view.built[t].name}"` : t)).join(", ")}`;
      line += ".";
      if (e.formations.length) line += " " + e.formations.map(f => `Formation ${f.join(" ")}`).join("; ") + ".";
      if (e.shared.length) {
        const homes = t => sc.encounters.filter(x => x !== e && x.built.includes(t)).map(x => x.id);
        const also = [...new Set(e.shared.flatMap(homes))].sort(idCompare);
        line += ` Shared with ${also.join(", ")}: ${e.shared.join(" ")} (built things never merge encounters; decide whether this is one fight).`;
      }
      if (e.builtXp) line += ` Built XP already in it: ${e.builtXp}${e.shared.some(t => view.built?.[t]?.xp) ? " (shared XP counted in each)" : ""}.`;
      L.push(line);
    }
    for (const r of sc.relations ?? []) {
      const block = r.los ? "with LOS between them" : `no LOS between them (${BLOCK_WORDS[r.block] ?? "wall"})`;
      L.push(`${r.from} is ${fmtNum(r.ft)} ft ${r.bearing || "from"} of ${r.to}, ${block}.`);
    }
    const lonely = sc.alone.map(pid => {
      const n = sc.aloneNotes?.[pid];
      if (!n) return pid;
      const bits = [];
      if (n.built) bits.push(`${fmtNum(n.built.ft)} ft ${n.built.bearing || "from"} of ${n.built.of} ${n.built.name}, in sight`);
      if (n.of) bits.push(`${fmtNum(n.ft)} ft ${n.bearing || "from"} of ${n.of}, ${HOW[n.los] ?? "no sight line"}`);
      return bits.length ? `${pid} (${bits.join("; ")})` : pid;
    });
    L.push(`Alone: ${lonely.length ? lonely.join(", ") : "none"}.`);
    for (const d of sc.doorLines ?? []) L.push(d);
    const seen = new Set();
    const builtParts = [];
    for (const e of sc.encounters) {
      for (const t of e.built) {
        if (seen.has(t)) continue;
        seen.add(t);
        const homes = sc.encounters.filter(x => x.built.includes(t)).map(x => x.id);
        builtParts.push(`${t} (in ${homes.join(", ")})`);
      }
    }
    for (const t of sc.contextOnly) builtParts.push(`${t} (context only)`);
    L.push(`Built: ${builtParts.length ? builtParts.join(", ") : "none"}.`);
    if (sc.notes) L.push(`Scene notes: ${preview(sc.notes, 300)}`);
    L.push("</overview>");

    const printed = new Set();
    for (const e of sc.encounters) {
      L.push("");
      const form = e.formations.map(f => f.join(" ")).join("; ");
      L.push(`<encounter id="${e.id}" centre="${ftPair(e.centreFt)}" span="${fmtNum(e.spanFt)} ft" members="${e.members.join(" ")}" formation="${form}">`);
      for (const pid of e.prompts) L.push(...renderPrompt(view.prompts[pid], unseenFt));
      for (const tid of e.built) {
        if (printed.has(tid)) { L.push(`<built id="${tid}" see="above"/>`); continue; }
        printed.add(tid);
        L.push(...renderBuilt(view.built[tid], chars, e.shared.includes(tid)
          ? sc.encounters.filter(x => x.built.includes(tid)).map(x => x.id) : null, described));
      }
      L.push("</encounter>");
    }
    if (sc.alone.length) {
      L.push("", "<alone>");
      for (const pid of sc.alone) L.push(...renderPrompt(view.prompts[pid], unseenFt));
      L.push("</alone>");
    }
    if (sc.contextOnly.length) {
      L.push("", "<context_only>");
      for (const tid of sc.contextOnly) L.push(...renderBuilt(view.built[tid], chars, null, described));
      L.push("</context_only>");
    }
    L.push("</scene>");
  }

  L.push("");
  if (view.cropsNote) L.push(`<crops>${view.cropsNote}</crops>`);
  L.push(`<todo>${(view.todo ?? []).join(" ")}</todo>`);
  if (view.next) L.push(`<next scene="${attr(view.next)}">More prompts on later scenes: gather again starting at this scene.</next>`);
  L.push("</prompt_markers>");
  return L.join("\n");
}

/**
 * `<party>` — which party the budgets use and where it came from, or that there is none: the world
 * setting is often blank, and a builder that guesses "4x5" from an example sizes every fight wrong.
 */
export function partyLine(view) {
  const levels = view.party ? parseParty(view.party) : null;
  if (!levels?.length) {
    const why = view.partyUnreadable
      ? "the call's party could not be read and the world setting \"Party for encounter budgets\" is blank or unreadable"
      : "the world setting \"Party for encounter budgets\" is blank and the call gave none";
    return `<party>none set (${why}): no XP budgets. ` +
      "Pass party: \"4x5\" (PCs x level) or [5,5,4,5] if you know the party; otherwise ask Joe — never guess one.</party>";
  }
  const same = levels.every(l => l === levels[0]);
  const desc = same ? `${levels.length} x level ${levels[0]}` : `levels ${levels.join(", ")}`;
  const from = view.partySource === "setting" ? "the world setting" : view.partySource === "call" ? "this call" : "given";
  return `<party>${desc} (from ${from})</party>`;
}

function elevAttr(e) {
  const n = Number(e);
  return Number.isFinite(n) && n !== 0 ? ` elev="${fmtNum(n)} ft"` : "";
}

function renderPrompt(p, unseenFt = 60) {
  const out = [];
  out.push(`<prompt id="${p.id}" size="${p.size}" footprint="${attr(footprintLabel(p.size, p.gridFt ?? 5))}" at="${ftPair(p.atFt)}"${elevAttr(p.elevation)} region="${attr((p.regions ?? []).join(", "))}">`);
  out.push(normalisePrompt(p.text) || "(empty: Joe left no text)");
  const sees = sortRelations(p.sees ?? []);
  const shown = sees.slice(0, SEES_CAP).map(relationText);
  if (sees.length > SEES_CAP) shown.push(`+${sees.length - SEES_CAP} more beyond ${fmtNum(sees[SEES_CAP - 1].ft)} ft`);
  out.push(`<sees>${shown.length ? shown.join(" | ") : "nobody"}</sees>`);
  const unseen = sortRelations(p.unseen ?? []).map(relationText);
  out.push(`<unseen>${unseen.length ? unseen.join(" | ") : `(nothing out of sight within ${fmtNum(unseenFt)} ft)`}</unseen>`);
  out.push("</prompt>");
  return out;
}

function renderBuilt(t, chars, sharedWith, described = null) {
  const out = [];
  const bits = [`id="${t.id}"`, `kind="${t.kind}"`, `name="${attr(t.name)}"`];
  const type = t.classes?.length ? classLabel(t.classes, t.species) : t.type;
  if (type) bits.push(`type="${attr(type)}"`);
  const stats = statsText(t.stats);
  if (stats) bits.push(`stats="${attr(stats)}"`);
  if (t.disposition) bits.push(`disposition="${t.disposition}"`);
  bits.push(`at="${ftPair(t.atFt)}"`);
  const ev = elevAttr(t.elevation);
  if (ev) bits.push(ev.trim());
  if (t.regions?.length) bits.push(`region="${attr(t.regions.join(", "))}"`);
  if (t.kind !== "note" && t.kind !== "light") bits.push(`hidden="${t.hidden ? "yes" : "no"}"`);
  if (sharedWith?.length) bits.push(`shared="${sharedWith.join(" ")}"`);
  out.push(`<built ${bits.join(" ")}>`);
  if (t.prov?.prompt) {
    const from = t.prov.pid ? `${t.prov.pid} of ${t.prov.call ?? "?"}, ` : "";
    out.push(`Built from prompt (${from}${t.prov.size ?? "?"}, ${isoDate(t.prov.at)}): "${preview(t.prov.prompt, Math.max(chars, 240))}"`);
  }
  if (t.prov?.note) out.push(`Why: ${preview(t.prov.note, 240)}`);
  if (t.items?.length) out.push(`${t.kind === "hotspot" ? "Items" : "Carries"}: ${itemsText(t.items)}`);
  if (t.light) out.push(`Light: ${t.light}`);
  if (t.description) {
    const key = t.actorId ? `${t.actorId}\n${t.description}` : null;
    const first = key ? described?.get(key) : null;
    if (first) out.push(`Description: same as ${first.id} "${attr(first.name)}"`);
    else {
      if (key) described?.set(key, { id: t.id, name: t.name });
      out.push(`Description: ${builtDescription(t.description, chars, t.actorId ?? t.docId ?? t.id, { tokenUuid: t.ownTextUuid })}`);
    }
  }
  out.push("</built>");
  return out;
}

/* ── Built facts → text (scene-adapter.mjs gathers the facts; these print them) */

/**
 * An AmbientLight config as the gather prints it: `dim 10 ft, bright 5 ft, #9fd3ff, pulse` (empty
 * when nothing is set). A light placed with a hotspot or note is printed on that thing, not as a
 * separate `t#`.
 */
export function lightText(c) {
  if (!c) return "";
  const bits = [];
  if (Number(c.dim)) bits.push(`dim ${fmtNum(Number(c.dim))} ft`);
  if (Number(c.bright)) bits.push(`bright ${fmtNum(Number(c.bright))} ft`);
  if (c.color) bits.push(String(c.color));
  if (c.animation?.type) bits.push(String(c.animation.type));
  return bits.join(", ");
}

/** 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2", else the number. */
export function crText(cr) {
  const c = Number(cr);
  if (!Number.isFinite(c)) return "";
  return c === 0.125 ? "1/8" : c === 0.25 ? "1/4" : c === 0.5 ? "1/2" : fmtNum(c);
}

/**
 * `CR 1/4, AC 15, HP 11` — `stats` is `{cr?, ac?, hp?, hpMax?}` (a character has no cr). HP prints
 * `7/11` only when the token is hurt.
 */
export function statsText(stats) {
  if (!stats) return "";
  const out = [];
  if (stats.cr !== undefined && stats.cr !== null && stats.cr !== "") out.push(`CR ${crText(stats.cr)}`);
  if (Number.isFinite(Number(stats.ac)) && stats.ac !== null) out.push(`AC ${fmtNum(Number(stats.ac))}`);
  const max = Number(stats.hpMax), v = Number(stats.hp);
  if (Number.isFinite(max) && max > 0) out.push(`HP ${Number.isFinite(v) && v !== max ? `${fmtNum(v)}/` : ""}${fmtNum(max)}`);
  return out.join(", ");
}

/**
 * A character's type: `Paladin 5, Oath of Devotion (Human)`; multiclass
 * `Fighter 3, Champion / Wizard 2 (Elf, High)`. `classes`: `[{name, levels, subclass}]`.
 */
export function classLabel(classes, species) {
  const cls = (classes ?? []).filter(c => c?.name)
    .map(c => `${c.name} ${c.levels ?? "?"}${c.subclass ? `, ${c.subclass}` : ""}`).join(" / ");
  if (!cls) return species ?? "";
  return species ? `${cls} (${species})` : cls;
}

/**
 * One item as a neighbour's builder needs it: `The Ember Crown (artifact; unidentified, shows as
 * "Soot-Blackened Bronze Circlet"; attunement required)`, `Arrows x20`, `Stolen Chalice (loot, 150 gp)`.
 * `it`: `{name, type, rarity, identified, unidentifiedName, attunement, attuned, quantity, price}`.
 */
export function itemText(it) {
  const q = Number(it.quantity) > 1 ? ` x${fmtNum(Number(it.quantity))}` : "";
  const bits = [];
  const magic = it.rarity && !["", "mundane", "none"].includes(String(it.rarity).toLowerCase());
  if (magic) bits.push(String(it.rarity).toLowerCase());
  else if (it.type === "loot") bits.push("loot");
  if (it.price) bits.push(String(it.price));
  if (it.identified === false) bits.push(`unidentified${it.unidentifiedName ? `, shows as "${it.unidentifiedName}"` : ""}`);
  else if (magic) bits.push("identified");
  if (it.attunement === "required") bits.push(it.attuned ? "attuned" : "attunement required");
  else if (it.attunement === "optional") bits.push("attunement optional");
  return `${it.name}${q}${bits.length ? ` (${bits.join("; ")})` : ""}`;
}

/** Up to `max` items, `+N more` after. */
export function itemsText(items, max = 12) {
  const list = (items ?? []).filter(i => i?.name);
  const shown = list.slice(0, max).map(itemText);
  if (list.length > max) shown.push(`+${list.length - max} more`);
  return shown.join(", ");
}

const HOW = { LOS: "in sight", door: "behind a closed door", "secret door": "behind a secret door" };
const BLOCK_WORDS = { door: "a closed door", "secret door": "a secret door", wall: "wall" };
